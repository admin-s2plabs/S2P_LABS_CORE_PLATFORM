import {
  buildPendingApprovalEntityMatchSql,
  SUPERADMIN_PENDING_APPROVAL_COUNT_SQL,
} from "../../shared/status-filter";
import { pool } from "../db";
import { getContextPool } from "../tenant-context";
import { v4 as uuidv4 } from "uuid";
import * as adminRepo from "../modules/administration/administration.repository.ts";


const getPool = () => getContextPool() ?? pool;

export interface WorkflowParams {
  [key: string]: any;
}

export interface TaskResult {
  taskId: string;
  status: string;
}

export interface WFStepAssignment {
  id: number;
  step_id: number;
  assignment_type: "USER" | "ROLE" | "USER_HIERARCHY" | "AMOUNT_BASED_HIERARCHY";
  assignment_expression: string;
  condition: string | null;
}

export interface WFStep {
  id: number;
  name: string;
  step_order: number;
  step_type: string;
  wf_definition_id: number;
}

export interface WFInstance {
  id: number;
  wf_definition_id: number;
  status: string;
  start_date: Date;
  end_date: Date | null;
  subject: string;
  process_name: string;
  started_by: string;
}

export class WorkflowService {
  
  async startProcess(
    subject: string,
    processName: string,
    refNumber: string,
    params: WorkflowParams,
    initiatorUsername: string
  ): Promise<string> {
    const client = await getPool().connect();
    
    try {
      await client.query("BEGIN");

      const defResult = await client.query(
        `SELECT id, name FROM dbo.wf_definition WHERE name = $1`,
        [processName]
      );
      if(params.orgId === ""){
        params.orgId = 0;
      }

      if (defResult.rows.length === 0) {
        throw new Error(`Workflow definition not found: ${processName}`);
      }

      const definition = defResult.rows[0];

      const stepsResult = await client.query(
        `SELECT id, name, step_order, step_type, wf_definition_id 
         FROM dbo.wf_step 
         WHERE wf_definition_id = $1 
         ORDER BY step_order ASC`,
        [definition.id]
      );

      if (stepsResult.rows.length === 0) {
        throw new Error(`No steps defined for workflow: ${processName}`);
      }

      let assignments: any[] = [];
      let firstStep;
      for(const stepData of stepsResult.rows)
      {
        firstStep = stepData;
        assignments = await this.getAssignments(client, stepData.id, params);

        if(assignments.length > 0)
        {
          break;
        }
      }
      if (assignments.length === 0) 
      {
        throw new Error("No assignees found for first step. Cannot start workflow.");
      }

      const instanceResult = await client.query(
        `INSERT INTO dbo.wf_instance 
         (wf_definition_id, status, start_date, subject, process_name, started_by)
         VALUES ($1, $2, NOW(), $3, $4, $5)
         RETURNING id`,
        [definition.id, "Running", subject, processName, initiatorUsername]
      );

      const instanceId = instanceResult.rows[0].id;

      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          await client.query(
            `INSERT INTO dbo.wf_instance_variables 
             (instance_id, variable_name, variable_value, variable_value_string)
             VALUES ($1, $2, $3, $4)`,
            [instanceId, key, JSON.stringify(value), String(value)]
          );
        }
      }

      let taskId = "";
      let firstAssignmentType = "";
      for (const assignment of assignments) 
      {
        firstAssignmentType = assignment.assignment_type;
        taskId = await this.createTaskForAssignment(
          client,
          subject,
          processName,
          refNumber,
          assignment,
          instanceId,
          firstStep.id,
          firstStep.step_order,
          params,
          initiatorUsername
        );
        break;
      }

      await client.query("COMMIT");

      // After commit: for USER_HIERARCHY assignments, publish the task-assignment
      // email event so the reporting manager is notified.
      if (firstAssignmentType === "USER_HIERARCHY" && taskId) {
        this.notifyUserHierarchyAssignee(taskId, processName, subject, initiatorUsername).catch(
          (e: unknown) => console.warn("[WorkflowService] USER_HIERARCHY email notification failed:", e)
        );
      }

      return taskId;

    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async completeTask(
    taskId: string,
    result: "Approve" | "Approved" | "Reject" | "ReSubmit" | "More",
    remarks: string,
    actionByUsername: string,
    userRoles: string[] = []
  ): Promise<string> {
    const client = await getPool().connect();
    
    try {
      await client.query("BEGIN");

      const isAuthorized = await this.verifyTaskAuthorization(client, taskId, actionByUsername, userRoles);
      if (!isAuthorized) {
        throw new Error("You are not authorized to complete this task");
      }

      const stepInstResult = await client.query(
        `SELECT si.*, wi.wf_definition_id, wi.subject, wi.process_name, wi.started_by
         FROM dbo.wf_step_instance si
         JOIN dbo.wf_instance wi ON si.instance_id = wi.id
         WHERE si.task_id = $1 AND si.status = 'Ready'`,
        [taskId]
      );

      if (stepInstResult.rows.length === 0) {
        throw new Error(`Task not found or already completed: ${taskId}`);
      }

      const stepInstance = stepInstResult.rows[0];

      const varsResult = await client.query(
        `SELECT variable_name, variable_value FROM dbo.wf_instance_variables WHERE instance_id = $1`,
        [stepInstance.instance_id]
      );

      const params: WorkflowParams = {};
      for (const row of varsResult.rows) {
        try {
          params[row.variable_name] = JSON.parse(row.variable_value);
        } catch {
          params[row.variable_name] = row.variable_value;
        }
      }

      await client.query(
        `UPDATE dbo.act_ru_task SET suspension_state_ = 2 WHERE id_ = $1`,
        [taskId]
      );

      await client.query(
        `INSERT INTO dbo.act_hi_taskinst 
         (id_, proc_def_id_, task_def_key_, proc_inst_id_, name_, assignee_, 
          start_time_, end_time_, duration_, priority_, tenant_id_)
         SELECT id_, proc_def_id_, task_def_key_, proc_inst_id_, name_, assignee_,
                create_time_, NOW(), EXTRACT(EPOCH FROM (NOW() - create_time_)) * 1000, priority_, tenant_id_
         FROM dbo.act_ru_task WHERE id_ = $1
         ON CONFLICT (id_) DO UPDATE SET 
           end_time_ = NOW(),
           duration_ = EXTRACT(EPOCH FROM (NOW() - dbo.act_hi_taskinst.start_time_)) * 1000`,
        [taskId]
      );

      await client.query(
        `DELETE FROM dbo.act_ru_task WHERE id_ = $1`,
        [taskId]
      );

      await client.query(
        `UPDATE dbo.wf_step_instance 
         SET status = 'Completed', action_by = $1, action_date = NOW(), result = $2, remarks = $3
         WHERE task_id = $4`,
        [actionByUsername, result, remarks, taskId]
      );

      if (remarks) {
        await client.query(
          `INSERT INTO dbo.act_hi_comment 
           (id_, type_, time_, user_id_, task_id_, proc_inst_id_, action_, message_)
           VALUES ($1, 'comment', NOW(), $2, $3, NULL, $4, $5)`,
          [uuidv4(), actionByUsername, taskId, result, remarks]
        );
      }

      let newTaskId = "";

      if (result === "Approve" || result === "Approved") {
        const stepsResult = await client.query(
          `SELECT id, name, step_order, step_type 
           FROM dbo.wf_step 
           WHERE wf_definition_id = $1 AND step_order > $2
           ORDER BY step_order ASC
           LIMIT 1`,
          [stepInstance.wf_definition_id, stepInstance.step_order]
        );

        let assignments:any[] = [];
        if (stepsResult.rows.length > 0) 
        {
          const nextStep = stepsResult.rows[0];
          assignments = await this.getAssignments(client, nextStep.id, params);
          if (assignments.length > 0) 
          {
            for (const assignment of assignments) {
              newTaskId = await this.createTaskForAssignment(
                client,
                stepInstance.subject,
                stepInstance.process_name,
                stepInstance.ref_number,
                assignment,
                stepInstance.instance_id,
                nextStep.id,
                nextStep.step_order,
                params,
                stepInstance.started_by
              );
              break;
            }
          } 
          else 
          {
            newTaskId = await this.getNextAssignment(client,stepInstance.wf_definition_id, stepInstance.step_order+1,params,
              stepInstance.subject,stepInstance.process_name,stepInstance.ref_number,stepInstance.instance_id,stepInstance.started_by);
            if(newTaskId == "")
            {
            await client.query(
              `UPDATE dbo.wf_instance SET status = 'Completed', end_date = NOW() WHERE id = $1`,
              [stepInstance.instance_id]
            );
           }
          }
        } else {
          await client.query(
            `UPDATE dbo.wf_instance SET status = 'Completed', end_date = NOW() WHERE id = $1`,
            [stepInstance.instance_id]
          );
        }

      } else if (result === "Reject") {
        await client.query(
          `UPDATE dbo.wf_instance SET status = 'Rejected', end_date = NOW() WHERE id = $1`,
          [stepInstance.instance_id]
        );

      } else if (result === "ReSubmit" || result.toLowerCase() === "resubmit") {
        const firstStepResult = await client.query(
          `SELECT id, name, step_order, step_type 
           FROM dbo.wf_step 
           WHERE wf_definition_id = $1
           ORDER BY step_order ASC
           LIMIT 1`,
          [stepInstance.wf_definition_id]
        );

        if (firstStepResult.rows.length > 0) {
          const firstStep = firstStepResult.rows[0];
          const assignments = await this.getAssignments(client, firstStep.id, params);

          const resubmitSubject = stepInstance.subject.replace("Approval", "Re-Submit Approval");

          if (assignments.length > 0) {
            for (const assignment of assignments) {
              newTaskId = await this.createTaskForAssignment(
                client,
                resubmitSubject,
                stepInstance.process_name,
                stepInstance.ref_number,
                assignment,
                stepInstance.instance_id,
                firstStep.id,
                firstStep.step_order,
                params,
                stepInstance.started_by
              );
              break;
            }
          }
        }

      } else if (result === "More") {
        const moreInfoSubject = stepInstance.subject.replace("Approval", "Request For More Info");

        const dummyAssignment: WFStepAssignment = {
          id: 0,
          step_id: stepInstance.step_id,
          assignment_type: "USER",
          assignment_expression: stepInstance.started_by,
          condition: null
        };

        newTaskId = await this.createTaskForAssignment(
          client,
          moreInfoSubject,
          stepInstance.process_name,
          stepInstance.ref_number,
          dummyAssignment,
          stepInstance.instance_id,
          stepInstance.step_id,
          stepInstance.step_order,
          params,
          stepInstance.started_by
        );
      }else{
        throw new Error(`Invalid result: ${result}`);
      }

      await client.query("COMMIT");
      return newTaskId;

    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async createTaskForAssignment(
    client: any,
    subject: string,
    processName: string,
    refNumber: string,
    assignment: WFStepAssignment,
    instanceId: number,
    stepId: number,
    stepOrder: number,
    params: WorkflowParams,
    initiatorUsername: string
  ): Promise<string> {
    const existingTask = await client.query(
      `SELECT task_id FROM dbo.wf_step_instance 
       WHERE ref_number = $1 AND instance_id = $2 AND status = 'Ready'`,
      [refNumber, instanceId]
    );
    let orgId = params.orgId;
    if(orgId === "" || orgId === undefined){
      orgId = 0;
    }

    if (existingTask.rows.length > 0) {
      return existingTask.rows[0].task_id;
    }

    const taskId = uuidv4();
    let assignee = "";
    let assignmentType = assignment.assignment_type;

    if (assignment.assignment_type === "USER") {
      assignee = assignment.assignment_expression;
    } else if (assignment.assignment_type === "ROLE") {
      const roleExists = await client.query(
        `SELECT id FROM dbo.um_role_dtls WHERE role_name = $1 AND status = 1`,
        [assignment.assignment_expression]
      );
      if (roleExists.rows.length === 0) {
        throw new Error(`Role not found or inactive: ${assignment.assignment_expression}`);
      }
      // Set the role name as the assignee for tracking purposes
      assignee = assignment.assignment_expression;
    } else if (assignment.assignment_type === "USER_HIERARCHY") {
      let approvers: string[] = [];
      try {
        approvers = await this.getApproversHierarchy(client, initiatorUsername, null);
      } catch {
        throw { status: 400, message: "Reporting manager is not assigned to you, please contact administrator" };
      }
      console.log(`[createTaskForAssignment] Approvers in hierarchy for user ${initiatorUsername}:`, approvers);
      if (approvers.length > 0) {
        assignee = approvers[0];
      } else {
        throw { status: 400, message: "Reporting manager is not assigned to you, please contact administrator" };
      }
    } else if (assignment.assignment_type === "AMOUNT_BASED_HIERARCHY") {
      const amount = params.amount ?? params.Amount;
      if (amount === undefined || amount === null || isNaN(Number(amount))) {
        throw new Error("Amount parameter is required for Amount Based Hierarchy assignment type");
      }

     
      const approverWithLimit = await this.getApproverWithSufficientLimit(
        client,
        initiatorUsername,
        Number(amount)
      );

      if (approverWithLimit) {
        assignee = approverWithLimit;
      } else {
        throw new Error(`No approver found with sufficient approval limit for amount: ${amount}`);
      }
    }

    if (!assignee && assignment.assignment_type !== "ROLE") {
      throw new Error(`No assignee could be determined for assignment type: ${assignment.assignment_type}`);
    }

    await client.query(
      `INSERT INTO dbo.act_ru_task 
       (id_, rev_, name_, description_, priority_, create_time_, assignee_, suspension_state_, 
        is_count_enabled_, var_count_, id_link_count_, sub_task_count_)
       VALUES ($1, 1, $2, $3, 50, NOW(), $4, 1, false, 0, 0, 0)`,
      [taskId, processName, subject, assignee || null]
    );

    if (assignment.assignment_type === "ROLE") {
      await client.query(
        `INSERT INTO dbo.act_ru_identitylink 
         (id_, rev_, group_id_, type_, task_id_)
         VALUES ($1, 1, $2, 'candidate', $3)`,
        [uuidv4(), assignment.assignment_expression, taskId]
      );
    }

    await client.query(
      `INSERT INTO dbo.wf_step_instance 
       (instance_id, step_id, step_order, task_id, status, current_assignee, assignment_type, ref_number, org_id)
       VALUES ($1, $2, $3, $4, 'Ready', $5, $6, $7, $8)`,
      [instanceId, stepId, stepOrder, taskId, assignee, assignmentType, refNumber, orgId]
    );

    return taskId;
  }

  private async getAssignments(
    client: any,
    stepId: number,
    params: WorkflowParams
  ): Promise<WFStepAssignment[]> {
    const result = await client.query(
      `SELECT id, step_id, assignment_type, assignment_expression, condition
       FROM dbo.wf_step_assignment
       WHERE step_id = $1`,
      [stepId]
    );

    const matchingAssignments: WFStepAssignment[] = [];

    for (const row of result.rows) {
      const assignment: WFStepAssignment = {
        id: row.id,
        step_id: row.step_id,
        assignment_type: row.assignment_type,
        assignment_expression: row.assignment_expression,
        condition: row.condition
      };

      if (!assignment.condition || assignment.condition === "" || assignment.condition === "null") {
        matchingAssignments.push(assignment);
      } else {
        const conditionMet = this.evaluateCondition(assignment.condition, params);
        if (conditionMet) {
          matchingAssignments.push(assignment);
        }
      }
    }

    return matchingAssignments;
  }

  private evaluateCondition(conditionJson: any, params: WorkflowParams): boolean {
    try {
      const condition = typeof conditionJson === "string" ? JSON.parse(conditionJson) : conditionJson;
      return this.evaluateConditionGroup(condition, params);
    } catch (e) {
      console.error("Failed to parse condition:", e);
      return true;
    }
  }

  private evaluateConditionGroup(group: any, params: WorkflowParams): boolean {
    if (!group || !group.rules || group.rules.length === 0) {
      return true;
    }

    const results: boolean[] = [];

    for (const rule of group.rules) {
      if (rule.logic && rule.rules) {
        results.push(this.evaluateConditionGroup(rule, params));
      } else {
        results.push(this.evaluateRule(rule, params));
      }
    }

    if (group.logic === "AND") {
      return results.every(r => r);
    } else {
      return results.some(r => r);
    }
  }

  private evaluateRule(rule: any, params: WorkflowParams): boolean {
    const paramValue = params[rule.field];
    const ruleValue = rule.value;
    const operator = rule.operator;

    if (paramValue === undefined || paramValue === null) {
      return false;
    }

    switch (operator) {
      case "==":
        return String(paramValue) === String(ruleValue);
      case "!=":
        return String(paramValue) !== String(ruleValue);
      case ">":
        return Number(paramValue) > Number(ruleValue);
      case "<":
        return Number(paramValue) < Number(ruleValue);
      case ">=":
        return Number(paramValue) >= Number(ruleValue);
      case "<=":
        return Number(paramValue) <= Number(ruleValue);
      default:
        return false;
    }
  }

  private async getApproversHierarchy(
    client: any,
    username: string,
    amount: number | null
  ): Promise<string[]> {
    const approvers: string[] = [];
    console.log(`[getApproversHierarchy] Starting hierarchy lookup for user: ${username} with amount: ${amount}`);
    const userResult = await client.query(
      `SELECT id, manager_id FROM dbo.um_user_dtls WHERE user_name = $1 OR email_id = $1 LIMIT 1`,
      [username]
    );
    console.log("[getApproversHierarchy] userResult:", userResult.rows);
    if (userResult.rows.length === 0) {
      return approvers;
    }

    let currentUserManagerId = userResult.rows[0].manager_id;
    const visited = new Set<number>();

    while (currentUserManagerId && !visited.has(currentUserManagerId)) {
      console.log(`[getApproversHierarchy] Checking manager with ID: ${currentUserManagerId}`);
      visited.add(currentUserManagerId);
      console.log(`[getApproversHierarchy] Visited managers:`, Array.from(visited));
      const managerResult = await client.query(
        `SELECT id, user_name, email_id, manager_id FROM dbo.um_user_dtls WHERE id = $1`,
        [currentUserManagerId]
      );
      console.log(`[getApproversHierarchy] managerResult:`, managerResult.rows);
      if (managerResult.rows.length === 0) break;

      const manager = managerResult.rows[0];
      approvers.push(manager.user_name || manager.email_id);
      currentUserManagerId = manager.manager_id;
    }

    return approvers;
  }

  private async getApproverWithSufficientLimit(
    client: any,
    username: string,
    amount: number
  ): Promise<string | null> {
    const userResult = await client.query(
      `SELECT id, manager_id FROM dbo.um_user_dtls WHERE user_name = $1 OR email_id = $1 LIMIT 1`,
      [username]
    );

    if (userResult.rows.length === 0) {
      return null;
    }

    let currentUserId = userResult.rows[0].manager_id;
    const visited = new Set<number>();

    while (currentUserId && !visited.has(currentUserId)) {
      visited.add(currentUserId);

      const managerResult = await client.query(
        `SELECT id, user_name, email_id, manager_id, approval_limit FROM dbo.um_user_dtls WHERE id = $1`,
        [currentUserId]
      );

      if (managerResult.rows.length === 0) break;

      const manager = managerResult.rows[0];

      if (manager.approval_limit && Number(manager.approval_limit) >= Number(amount)) {
        return manager.user_name || manager.email_id;
      }

      currentUserId = manager.manager_id;
    }

    return null;
  }

  private async verifyTaskAuthorization(
    client: any,
    taskId: string,
    username: string,
    userRoles: string[] | string
  ): Promise<boolean> {
    const taskResult = await client.query(
      `SELECT assignee_ FROM dbo.act_ru_task WHERE id_ = $1 AND suspension_state_ = 1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) return false;

    const task = taskResult.rows[0];

    // Direct user assignment
    if (task.assignee_ === username) return true;

    // Normalise roles to an array (callers may pass a single string)
    const roles: string[] = Array.isArray(userRoles)
      ? userRoles
      : userRoles
      ? [userRoles as string]
      : [];

    // Superadmin bypass
    if (roles.includes("ROLE_SUPERADMIN") || roles.includes("SUPERADMIN")) return true;

    if (roles.length === 0) return false;

    // Check candidate identity-links — authoritative source for role-based tasks
    const linkResult = await client.query(
      `SELECT 1 FROM dbo.act_ru_identitylink
       WHERE task_id_ = $1 AND type_ = 'candidate' AND group_id_ = ANY($2)
       LIMIT 1`,
      [taskId, roles]
    );
    if (linkResult.rows.length > 0) return true;

    // Fallback: assignee_ is the role name (stored for tracking purposes)
    if (task.assignee_ && roles.includes(task.assignee_)) return true;

    return false;
  }

  async getMyTasks(username: string, email?: string): Promise<any[]> {
    // Check for tasks assigned to either username or email
    const identifiers = [username];
    if (email && email !== username) {
      identifiers.push(email);
    }
    
    const result = await getPool().query(
      `SELECT t.id_, t.name_, t.description_, t.assignee_, t.create_time_, t.priority_,
              si.ref_number, si.step_order, wi.subject, wi.process_name, wi.started_by
       FROM dbo.act_ru_task t
       LEFT JOIN dbo.wf_step_instance si ON t.id_ = si.task_id
       LEFT JOIN dbo.wf_instance wi ON si.instance_id = wi.id
       WHERE t.assignee_ = ANY($1) AND t.suspension_state_ = 1
       ORDER BY t.create_time_ DESC`,
      [identifiers]
    );

    return result.rows;
  }

  async getGroupTasks(roleNames: string[]): Promise<any[]> {
    if (roleNames.length === 0) return [];

    const result = await getPool().query(
      `SELECT t.id_, t.name_, t.description_, t.create_time_, t.priority_,
              il.group_id_ as role_name,
              si.ref_number, si.step_order, wi.subject, wi.process_name, wi.started_by
       FROM dbo.act_ru_task t
       JOIN dbo.act_ru_identitylink il ON t.id_ = il.task_id_
       LEFT JOIN dbo.wf_step_instance si ON t.id_ = si.task_id
       LEFT JOIN dbo.wf_instance wi ON si.instance_id = wi.id
       WHERE il.type_ = 'candidate' AND il.group_id_ = ANY($1) AND t.suspension_state_ = 1
       ORDER BY t.create_time_ DESC`,
      [roleNames]
    );

    return result.rows;
  }

  async claimTask(taskId: string, username: string, userRoles: string[] = []): Promise<void> {
    const client = await getPool().connect();
    
    try {
      await client.query("BEGIN");

      const taskResult = await client.query(
        `SELECT assignee_ FROM dbo.act_ru_task WHERE id_ = $1`,
        [taskId]
      );

      if (taskResult.rows.length === 0) {
        throw new Error("Task not found");
      }

      const task = taskResult.rows[0];

      if (task.assignee_) {
        throw new Error("Task is already assigned");
      }

      const candidateResult = await client.query(
        `SELECT group_id_ FROM dbo.act_ru_identitylink WHERE task_id_ = $1 AND type_ = 'candidate'`,
        [taskId]
      );

      let canClaim = false;
      for (const row of candidateResult.rows) {
        if (userRoles.includes(row.group_id_)) {
          canClaim = true;
          break;
        }
      }

      if (!canClaim) {
        throw new Error("You are not authorized to claim this task");
      }

      await client.query(
        `UPDATE dbo.act_ru_task SET assignee_ = $1, claim_time_ = NOW() WHERE id_ = $2`,
        [username, taskId]
      );

      await client.query(
        `UPDATE dbo.wf_step_instance SET current_assignee = $1 WHERE task_id = $2`,
        [username, taskId]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getTaskHistory(refNumber: string): Promise<any[]> {
    const result = await getPool().query(
      `SELECT si.*, ws.name as step_name,
              c.message_ as comments, c.time_ as comment_time
       FROM dbo.wf_step_instance si
       LEFT JOIN dbo.wf_step ws ON si.step_id = ws.id
       LEFT JOIN dbo.act_hi_comment c ON si.task_id = c.task_id_
       WHERE si.ref_number = $1
       ORDER BY si.step_order, si.action_date`,
      [refNumber]
    );

    return result.rows;
  }

  async findActiveTaskByRefNumber(refNumber: string): Promise<any | null> {
    const result = await getPool().query(
      `SELECT t.id_, t.name_, t.assignee_, t.create_time_,
              si.ref_number, si.step_order, si.status as step_status
       FROM dbo.act_ru_task t
       JOIN dbo.wf_step_instance si ON t.id_ = si.task_id
       WHERE si.ref_number = $1 AND si.status = 'Ready' AND t.suspension_state_ = 1
       LIMIT 1`,
      [refNumber]
    );
    return result.rows[0] || null;
  }

  // Dashboard methods
  async getInbox(username: string, userRoles: string[], pageNo: number = 0, pageSize: number = 10): Promise<any[]> {
    const offset = pageNo * pageSize;

    // Get tasks where user is assigned OR is a candidate via role
    const result = await getPool().query(
      `SELECT DISTINCT t.id_, t.name_, t.description_, t.assignee_, t.create_time_, t.priority_,
              t.proc_inst_id_,
              wi.ref_number, wi.subject, wi.process_name, wi.started_by,
              si.step_order
       FROM dbo.act_ru_task t
       LEFT JOIN dbo.wf_step_instance si ON t.id_ = si.task_id
       LEFT JOIN dbo.wf_instance wi ON si.instance_id = wi.id
       LEFT JOIN dbo.act_ru_identitylink il ON t.id_ = il.task_id_
       WHERE t.suspension_state_ = 1
         AND (t.assignee_ = $1 OR (il.type_ = 'candidate' AND il.group_id_ = ANY($2)))
       ORDER BY t.create_time_ DESC
       LIMIT $3 OFFSET $4`,
      [username, userRoles, pageSize, offset]
    );

    // Get total count
    const countResult = await getPool().query(
      `SELECT COUNT(DISTINCT t.id_) as total
       FROM dbo.act_ru_task t
       LEFT JOIN dbo.act_ru_identitylink il ON t.id_ = il.task_id_
       WHERE t.suspension_state_ = 1
         AND (t.assignee_ = $1 OR (il.type_ = 'candidate' AND il.group_id_ = ANY($2)))`,
      [username, userRoles]
    );

    const totalRecords = parseInt(countResult.rows[0]?.total || '0');

    return result.rows.map(row => ({
      ...row,
      totalRecords
    }));
  }

  async getInboxDash(username: string, userRoles: string[]): Promise<any[]> {
    // Get all tasks without pagination for dashboard
    const result = await getPool().query(
      `SELECT DISTINCT t.id_, t.name_, t.description_, t.assignee_, t.create_time_, t.priority_,
              t.proc_inst_id_,
              wi.ref_number, wi.subject, wi.process_name, wi.started_by,
              si.step_order
       FROM dbo.act_ru_task t
       LEFT JOIN dbo.wf_step_instance si ON t.id_ = si.task_id
       LEFT JOIN dbo.wf_instance wi ON si.instance_id = wi.id
       LEFT JOIN dbo.act_ru_identitylink il ON t.id_ = il.task_id_
       WHERE t.suspension_state_ = 1
         AND (t.assignee_ = $1 OR (il.type_ = 'candidate' AND il.group_id_ = ANY($2)))
       ORDER BY t.create_time_ DESC`,
      [username, userRoles]
    );

    return result.rows;
  }

  async getAllTasks(
    pageNo: number = 0, 
    pageSize: number = 10,
    userIdentifiers?: string[],
    userRoles?: string[],
    isSuperAdmin: boolean = false,
    orgId?: number[]
  ): Promise<any[]> {
    const offset = pageNo * pageSize;

    let query: string;
    let countQuery: string;
    let params: any[];
    let countParams: any[];

    if (isSuperAdmin || !userIdentifiers || userIdentifiers.length === 0) {
      // SUPERADMIN sees all tasks
      query = `SELECT t.id_, t.name_, t.description_, t.assignee_, t.create_time_, t.priority_,
              t.proc_inst_id_, t.due_date_,
              si.ref_number, si.status as step_status, si.action_date, si.action_by,
              wi.subject, wi.process_name, wi.started_by, wi.start_date,
              si.step_order
       FROM dbo.act_ru_task t
       LEFT JOIN dbo.wf_step_instance si ON t.id_ = si.task_id
       LEFT JOIN dbo.wf_instance wi ON si.instance_id = wi.id
       WHERE t.suspension_state_ = 1
       ORDER BY t.create_time_ DESC
       LIMIT $1 OFFSET $2`;
      params = [pageSize, offset];
      countQuery = `SELECT COUNT(*) as total FROM dbo.act_ru_task WHERE suspension_state_ = 1`;
      countParams = [];
    } else {
      // Regular users only see tasks assigned to them (by username or email) or via role
      query = `SELECT DISTINCT t.id_, t.name_, t.description_, t.assignee_, t.create_time_, t.priority_,
              t.proc_inst_id_, t.due_date_,
              si.ref_number, si.status as step_status, si.action_date, si.action_by,
              wi.subject, wi.process_name, wi.started_by, wi.start_date,
              si.step_order
       FROM dbo.act_ru_task t
       LEFT JOIN dbo.wf_step_instance si ON t.id_ = si.task_id
       LEFT JOIN dbo.wf_instance wi ON si.instance_id = wi.id
       LEFT JOIN dbo.act_ru_identitylink il ON t.id_ = il.task_id_
       WHERE t.suspension_state_ = 1
         AND (t.assignee_ = ANY($3) OR (il.type_ = 'candidate' AND il.group_id_ = ANY($4)))
         AND (
          (
            (wi.process_name NOT ILIKE '%Supplier%'
            AND wi.process_name NOT ILIKE '%Vendor%'
            )AND si.assignment_type = 'ROLE' AND si.org_id = ANY($5)
          ) 
          OR 
          (
            (wi.process_name NOT ILIKE '%Supplier%'
            AND wi.process_name NOT ILIKE '%Vendor%'
            ) AND si.assignment_type = 'USER'
          )
          OR 
            (
             wi.process_name ILIKE '%Supplier%'
             OR wi.process_name ILIKE '%Vendor%'
             )
          )
       ORDER BY t.create_time_ DESC
       LIMIT $1 OFFSET $2`;
      params = [pageSize, offset, userIdentifiers, userRoles || [], orgId ];
      countQuery = `SELECT COUNT(DISTINCT t.id_) as total 
                    FROM dbo.act_ru_task t
                    LEFT JOIN dbo.act_ru_identitylink il ON t.id_ = il.task_id_
                    LEFT JOIN dbo.wf_step_instance si ON t.id_ = si.task_id
                    LEFT JOIN dbo.wf_instance wi ON si.instance_id = wi.id
                    WHERE t.suspension_state_ = 1
                      AND (t.assignee_ = ANY($1) OR (il.type_ = 'candidate' AND il.group_id_ = ANY($2)))
                       AND (
                        (
                          (wi.process_name NOT ILIKE '%Supplier%'
                          AND wi.process_name NOT ILIKE '%Vendor%'
                          )AND si.assignment_type = 'ROLE' AND si.org_id = ANY($3)
                        ) 
                        OR 
                          (
                          wi.process_name ILIKE '%Supplier%'
                          OR wi.process_name ILIKE '%Vendor%'
                          )
                        )`;
      countParams = [userIdentifiers, userRoles || [], orgId ];
    }

    const result = await getPool().query(query, params);
    const countResult = await getPool().query(countQuery, countParams);

    const totalRecords = parseInt(countResult.rows[0]?.total || '0');

    // Map to DTO format matching Java structure
    return result.rows.map(row => ({
      subject: row.description_ || row.subject || '',
      srmsRefNumber: row.ref_number || '',
      startDate: row.start_date || null,
      inboxDate: row.create_time_ || null,
      lastUpdateTime: row.action_date || row.create_time_ || null,
      initiator: row.started_by || '',
      currentStatus: row.step_status || 'PENDING',
      taskId: row.id_ || '',
      // assignee_ contains the role name for role-based tasks or user for user-based tasks
      potentialOwners: row.assignee_ ? [row.assignee_] : [],
      taskName: row.name_ || '',
      lastActionDate: row.action_date || null,
      lastActionBy: row.action_by || '',
      processInstanceId: row.proc_inst_id_ || '',
      contextSite: '',
      businessEntity: '',
      dueDate: row.due_date_ || null,
      totalRecords
    }));
  }

  async getInboxCount(username: string, userRoles: string[]): Promise<number> {
    const result = await getPool().query(
      `SELECT COUNT(DISTINCT t.id_) as count
       FROM dbo.act_ru_task t
       LEFT JOIN dbo.act_ru_identitylink il ON t.id_ = il.task_id_
       WHERE t.suspension_state_ = 1
         AND (t.assignee_ = $1 OR (il.type_ = 'candidate' AND il.group_id_ = ANY($2)))`,
      [username, userRoles]
    );

    return parseInt(result.rows[0]?.count || '0');
  }

  // Pending approval counts for dashboard.
  async getPendingApprovalCounts(
    userIdentifiers: string[],
    userRoles: string[],
    isSuperAdmin: boolean = false,
  ): Promise<Record<string, number>> {
    if (isSuperAdmin) {
      return this.getPendingApprovalCountsForSuperAdmin();
    }

    if (!userIdentifiers.length && (!userRoles || userRoles.length === 0)) {
      return {};
    }

    const entityMatch = buildPendingApprovalEntityMatchSql();
    const baseFrom = `
         FROM dbo.act_ru_task t
         INNER JOIN dbo.wf_step_instance si ON t.id_ = si.task_id
         INNER JOIN dbo.wf_instance wi ON si.instance_id = wi.id
         LEFT JOIN dbo.act_ru_identitylink il ON t.id_ = il.task_id_`;
    const baseWhere = `
         WHERE t.suspension_state_ = 1
           AND si.ref_number IS NOT NULL
           AND TRIM(si.ref_number) <> ''
           AND (${entityMatch})`;

    const assigneeClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (userIdentifiers.length > 0) {
      assigneeClauses.push(`t.assignee_ = ANY($${paramIndex})`);
      params.push(userIdentifiers);
      paramIndex++;
    }
    if (userRoles?.length > 0) {
      assigneeClauses.push(
        `(il.type_ = 'candidate' AND il.group_id_ = ANY($${paramIndex}))`,
      );
      assigneeClauses.push(`t.assignee_ = ANY($${paramIndex})`);
      params.push(userRoles);
      paramIndex++;
    }

    const assigneeFilter =
      assigneeClauses.length > 0 ? `AND (${assigneeClauses.join(" OR ")})` : "";

    const result = await getPool().query(
      `SELECT wi.process_name, COUNT(DISTINCT TRIM(si.ref_number)) as count
       ${baseFrom}
       ${baseWhere}
       ${assigneeFilter}
       GROUP BY wi.process_name`,
      params,
    );

    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      if (row.process_name) {
        counts[row.process_name] = parseInt(row.count);
      }
    }

    // Merge alternate BPMN process names into dashboard buckets (matches list modules / navigation).
    const mergeInto = (target: string, sources: string[]) => {
      for (const src of sources) {
        if (src === target) continue;
        if (counts[src] != null) {
          counts[target] = (counts[target] || 0) + counts[src];
          delete counts[src];
        }
      }
    };
    mergeInto('Contract', ['Purchase Agreement', 'purchase agreement']);
    mergeInto('Vendor Registration', ['Supplier Registration', 'supplier registration']);

    return counts;
  }

  /** All pending-approval records in the tenant (every business entity), for superadmin/sysadmin. */
  private async getPendingApprovalCountsForSuperAdmin(): Promise<Record<string, number>> {
    const result = await getPool().query(SUPERADMIN_PENDING_APPROVAL_COUNT_SQL);

    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      if (row.process_name) {
        counts[row.process_name] = parseInt(row.count, 10) || 0;
      }
    }

    const mergeInto = (target: string, sources: string[]) => {
      for (const src of sources) {
        if (src === target) continue;
        if (counts[src] != null) {
          counts[target] = (counts[target] || 0) + counts[src];
          delete counts[src];
        }
      }
    };
    mergeInto("Contract", ["Purchase Agreement", "purchase agreement"]);
    mergeInto("Vendor Registration", ["Supplier Registration", "supplier registration"]);

    return counts;
  }

  /**
   * Get the list of approvers for all steps of a workflow
   * Similar to Java's wfService.getApproversList
   */
  async getApproversList(
    processName: string,
    params: WorkflowParams
  ): Promise<string[]> {
    const client = await getPool().connect();
    try {
      const defResult = await client.query(
        `SELECT id FROM dbo.wf_definition WHERE name = $1`,
        [processName]
      );

      if (defResult.rows.length === 0) {
        return [];
      }

      const definitionId = defResult.rows[0].id;

      const stepsResult = await client.query(
        `SELECT id, name, step_order FROM dbo.wf_step 
         WHERE wf_definition_id = $1 
         ORDER BY step_order ASC`,
        [definitionId]
      );

      const approvers: string[] = [];

      for (const step of stepsResult.rows) {
        const assignments = await this.getAssignments(client, step.id, params);
        for (const assignment of assignments) {
          if (assignment.assignment_type === "USER") {
            // Get user name from expression
            const userResult = await client.query(
              `SELECT name FROM dbo.um_user_dtls WHERE user_name = $1 OR email_id = $1`,
              [assignment.assignment_expression]
            );
            if (userResult.rows.length > 0) {
              approvers.push(userResult.rows[0].name);
            } else {
              approvers.push(assignment.assignment_expression);
            }
          } else if (assignment.assignment_type === "ROLE") {
            // Store role_name (not display name) for proper role-based assignment matching
            approvers.push(assignment.assignment_expression);
          } else if (assignment.assignment_type === "USER_HIERARCHY") {
            approvers.push("Manager");
          } else if (assignment.assignment_type === "AMOUNT_BASED_HIERARCHY") {
            approvers.push("Amount Based Approver");
          }
        }
      }

      return approvers;
    } finally {
      client.release();
    }
  }

  /**
   * Get first step approvers to check if workflow can be started
   * Similar to Java's wfService.getFirstStepApproversList
   */
  async getFirstStepApproversList(
    processName: string,
    params: WorkflowParams
  ): Promise<string[]> {
    const client = await getPool().connect();
    try {
      const defResult = await client.query(
        `SELECT id FROM dbo.wf_definition WHERE name = $1`,
        [processName]
      );

      if (defResult.rows.length === 0) {
        return [];
      }

      const definitionId = defResult.rows[0].id;

      const firstStepResult = await client.query(
        `SELECT id FROM dbo.wf_step 
         WHERE wf_definition_id = $1 
         ORDER BY step_order ASC`,
        [definitionId]
      );

      if (firstStepResult.rows.length === 0) {
        return [];
      }

      const approvers: string[] = [];
      for(const step of firstStepResult.rows)
      {
        const assignments = await this.getAssignments(client, step.id, params);     
        for (const assignment of assignments) 
        {
          approvers.push(assignment.assignment_expression);
          break;
        }
        if(approvers.length > 0)
        {
          break;
        }
      }
      return approvers;       
    } 
    finally 
    {
      client.release();
    }
  }

  async findByTaskId(taskId: string) {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        `
      SELECT * 
      FROM dbo.wf_step_instance 
      WHERE task_id = $1
    `,
        [taskId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  // 🔹 findByTaskIdAndStatus (REF_NUMBER + Ready)
  async findByTaskIdAndStatus(referenceNumber: string) {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        `
      SELECT * 
      FROM dbo.wf_step_instance 
      WHERE ref_number = $1
      AND status = 'Ready'
      LIMIT 1
    `,
        [referenceNumber]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  // 🔹 updateOwnerOfRequest
  async updateOwnerOfRequest(taskId: string, userName: string) {
    const client = await getPool().connect();
    try {
      await client.query(
        `
      UPDATE dbo.wf_step_instance 
      SET current_assignee = $1
      WHERE task_id = $2
    `,
        [userName, taskId]
      );
    } finally {
      client.release();
    }
  }

  // 🔹 updateTaskOwnerOfRequest (different table)
  async updateTaskOwnerOfRequest(taskId: string, userName: string) {
    const client = await getPool().connect();
    try {
      await client.query(
        `
      UPDATE dbo.act_ru_task 
      SET assignee_ = $1
      WHERE id_ = $2
    `,
        [userName, taskId]
      );
    } finally {
      client.release();
    }
  }

  // 🔹 getTaskReadyCount
  async getTaskReadyCount(stepId: number) {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        `
      SELECT COUNT(*) AS count
      FROM dbo.wf_step_instance
      WHERE step_id = $1
      AND status = 'Ready'
    `,
        [stepId]
      );
      return Number(result.rows[0]?.count || 0);
    } finally {
      client.release();
    }
  }

  /** Snapshot of a newly created runtime task (for task-assignment notification emails). */
  async getTaskAssignmentSnapshot(taskId: string): Promise<{
    assignee: string | null;
    taskDescription: string;
    subject: string;
    refNumber: string;
    processName: string;
    startedBy: string;
    assignmentType: string;
    candidateGroups: string[];
  } | null> {
    const taskResult = await getPool().query(
      `SELECT t.assignee_, t.description_,
              wi.subject, wi.started_by, si.ref_number, wi.process_name, si.assignment_type
       FROM dbo.act_ru_task t
       JOIN dbo.wf_step_instance si ON t.id_ = si.task_id AND si.status = 'Ready'
       JOIN dbo.wf_instance wi ON si.instance_id = wi.id
       WHERE t.id_ = $1 AND t.suspension_state_ = 1`,
      [taskId]
    );
    if (taskResult.rows.length === 0) {
      return null;
    }
    const row = taskResult.rows[0];
    const linkResult = await getPool().query(
      `SELECT group_id_ FROM dbo.act_ru_identitylink WHERE task_id_ = $1 AND type_ = 'candidate'`,
      [taskId]
    );
    return {
      assignee: row.assignee_ || null,
      taskDescription: row.description_ || "",
      subject: row.subject || "",
      refNumber: row.ref_number || "",
      processName: row.process_name || "",
      startedBy: row.started_by || "",
      assignmentType: row.assignment_type || "",
      candidateGroups: linkResult.rows.map((r: { group_id_: string }) => r.group_id_).filter(Boolean),
    };
  }

  private async notifyUserHierarchyAssignee(
    taskId: string,
    processName: string,
    subject: string,
    initiatorUsername: string
  ): Promise<void> {
    const { publishTaskAssignmentEvent } = await import("./eventBus/publishTaskAssignment");
    const { resolveTaskAssignmentTemplateId } = await import("./eventBus/taskAssignmentTemplateMap");
    const templateEventId = resolveTaskAssignmentTemplateId(processName) ?? undefined;
    const orgData = await adminRepo.getOrgDetails();
    publishTaskAssignmentEvent({
      taskId,
      templateEventId,
      taskSub: subject,
      submittedBy: initiatorUsername,
      variables: {
        orgLogoPath: orgData.org_logo_path,
      },
    });
  }

async getNextAssignment(client: any,wfId: number,stepOrder: number,params: WorkflowParams,subject: string,processName: string,refNumber: string,instanceId: number,startedBy:string): Promise<string>  
{
  const stepsResult = await client.query(`SELECT id, name, step_order, step_type FROM dbo.wf_step WHERE wf_definition_id = $1
       AND step_order > $2 ORDER BY step_order ASC LIMIT 1`,[wfId, stepOrder]);

  if (stepsResult.rows.length === 0) 
  {
    return "";
  }

  const nextStep = stepsResult.rows[0];
  const assignments = await this.getAssignments(client, nextStep.id, params);
  let newTaskId="";
  if (assignments.length > 0) 
  {
    for(const assignment of assignments)
    {
    newTaskId = await this.createTaskForAssignment(
                client,
                subject,
                processName,
                refNumber,
                assignment,
                instanceId,
                nextStep.id,
                nextStep.step_order,
                params,
                startedBy
              );
    return newTaskId;
   }
  }
  return this.getNextAssignment(client,wfId,nextStep.step_order,params,subject,processName,refNumber,instanceId,startedBy);
 }
}

export const workflowService = new WorkflowService();