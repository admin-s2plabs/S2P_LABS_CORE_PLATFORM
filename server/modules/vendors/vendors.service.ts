import { storage } from "../../storage";
import { z } from "zod";
import * as repo from "./vendors.repository";
import { validateOnboardPhone } from "../../services/vendor-onboard-validation";
import { eventBus } from "../../services/eventBus";
import { RegistrationInviteEvent, RegisterOnBehalfInviteEvent, SupplierMoreInfo, SupplierMoreInfoUpdate } from "../../services/eventBus/events";
import * as vendorRegistrationRepo from "../vendor-registration/vendor-registration.repository";
import { CommonService } from "../common/common.service";
import { getUserRoleNames } from "../common/common.repository";
import * as adminRepo from "../administration/administration.repository.ts";
import { getContextPool } from "../../tenant-context";
import { ALLOWED_MIME_TYPES, pool, sanitizeFilename, validateUploadedFile } from "../_shared";
import { generatepdfReview } from "../vendor-registration/vendor-registration.service.ts";

const getPool = () => getContextPool() ?? pool;
const commonService = new CommonService();

export async function getDboSuppliersPaginated(params: { page: number; limit: number; status?: string; search?: string; sortBy?: string; metrics?: string }) {
  
  const listResult = await storage.getDboSuppliersPaginated(params);
  const finalResult = await Promise.all(
    listResult.data.map(async (row: any) => {
      const currentApprover = await repo.getCurrentApprover(row.id, "Vendor Registration");
      return {
        ...row,
        currentApprover: currentApprover?.name || null,
      };
    })
  ); 
  
  return {
    pagination: listResult.pagination,
    data: finalResult,
    statusCounts: listResult.statusCounts,
  };
}

export async function getDboSuppliersExport(params: {
  page: number;
  limit: number;
  status?: string;
  search?: string;
}) {
  const listResult = await storage.getDboSuppliersPaginated(params);
  const supplierIds = (listResult.data || [])
    .map((s) => Number(s.id))
    .filter((id) => Number.isFinite(id) && id > 0);

  const [exportContacts, exportBanks, exportServices] = await Promise.all([
    repo.getExportContactsForSupplierIds(supplierIds),
    repo.getExportBanksForSupplierIds(supplierIds),
    repo.getExportServicesForSupplierIds(supplierIds),
  ]);
  const finalResult = await Promise.all(
    listResult.data.map(async (row: any) => {
      const currentApprover = await repo.getCurrentApprover(row.id, "Vendor Registration");
      return {
        ...row,
        currentApprover: currentApprover?.name || null,
      };
    })
  );  

  return {
    ...finalResult,
    pagination: {
      ...listResult.pagination,
      totalPages:
        params.limit === 0
          ? 1
          : Math.max(1, Math.ceil(listResult.pagination.total / params.limit)),
    },
    exportContacts,
    exportBanks,
    exportServices,
  };
}

export async function getDboSupplier(id: number | string) {
  return storage.getDboSupplier(id);
}

export async function getDboSupplierContacts(id: number) {
  return storage.getDboSupplierContacts(id);
}

export async function getDboSupplierBanks(id: number) {
  return storage.getDboSupplierBanks(id);
}

export async function getDboSupplierDocuments(id: number) {
  return repo.getDboSupplierDocuments(id);
}

export async function getDboSupplierServices(id: number) {
  return storage.getDboSupplierServices(id);
}

export async function updateDboSupplierStatus(id: number, status: string) {
  return storage.updateDboSupplierStatus(id, status);
}

async function assertSuperAdmin(sessionUser: any) {
  const userId = Number(sessionUser?.id ?? sessionUser?.userId);
  if (!userId) throw { status: 403, message: "Unauthorized" };
  const roles = await getUserRoleNames(userId);
  if (!roles.includes("SUPERADMIN") && !roles.includes("ROLE_SUPERADMIN")) {
    throw { status: 403, message: "Only superadmin can update supplier email" };
  }
}

export async function updateSupplierEmail(supplierId: number, email: string, sessionUser: any) {
  await assertSuperAdmin(sessionUser);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw { status: 400, message: "Please provide a valid email address" };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await repo.getSupplierOrgEmail(supplierId);
  if (!existing) throw { status: 404, message: "Supplier not found" };

  if ((existing.email_id || "").trim().toLowerCase() === normalizedEmail) {
    return storage.getDboSupplier(supplierId);
  }

  const supplierUserId = await repo.findSupplierUserId(supplierId);
  const availability = await repo.checkSupplierEmailAvailable(
    normalizedEmail,
    supplierId,
    supplierUserId
  );
  if (!availability.available) {
    throw { status: 400, message: availability.message || "Email is not available" };
  }

  const modifiedBy = sessionUser?.userName || sessionUser?.email || "ADMIN";
  const updated = await repo.updateSupplierOrgEmail(
    supplierId,
    normalizedEmail,
    modifiedBy,
    supplierUserId
  );
  if (!updated) throw { status: 404, message: "Supplier not found" };

  return storage.getDboSupplier(supplierId);
}

export async function getDboSupplierRefCompanies(id: number) {
  return storage.getDboSupplierRefCompanies(id);
}

export async function getDboSupplierApprovalHistory(id: number) {
  return storage.getDboSupplierApprovalHistory(id);
}

export async function getWorkflowApprovalHistory(id: number) {
  const [rows, definitionSteps] = await Promise.all([
    repo.getWorkflowApprovalHistory(id),
    repo.getWorkflowDefinitionSteps()
  ]);

  const instanceMap = new Map<number, any>();
  for (const row of rows) {
    if (!instanceMap.has(row.instance_id)) {
      const isUpdate = (row.subject || '').toLowerCase().includes('update');
      instanceMap.set(row.instance_id, {
        instanceId: row.instance_id,
        subject: row.subject,
        type: isUpdate ? 'Profile Update' : 'New Registration',
        instanceStatus: row.instance_status,
        startDate: row.start_date,
        startedBy: row.started_by,
        steps: []
      });
    }
    if (row.step_instance_id) {
      instanceMap.get(row.instance_id).steps.push({
        stepOrder: row.step_order,
        assignee: row.current_assignee,
        status: row.step_status,
        result: row.result,
        actionBy: row.action_by,
        actionDate: row.action_date,
        remarks: row.remarks,
        taskId: row.task_id
      });
    }
  }

  const instances = Array.from(instanceMap.values());
  for (const instance of instances) {
    if (instance.instanceStatus === 'Running') {
      const existingStepOrders = new Set(instance.steps.map((s: any) => s.stepOrder));
      for (const defStep of definitionSteps) {
        if (!existingStepOrders.has(defStep.step_order)) {
          instance.steps.push({
            stepOrder: defStep.step_order,
            assignee: defStep.assignment_expression || null,
            status: 'Waiting',
            result: null,
            actionBy: null,
            actionDate: null,
            remarks: null,
            taskId: null,
            stepName: defStep.assignment_name || defStep.step_name
          });
        }
      }
    }

    // Sort steps by action date (completed steps first chronologically, then pending steps)
    instance.steps.sort((a: any, b: any) => {
      // If both have action dates, sort by date (earliest first)
      if (a.actionDate && b.actionDate) {
        return new Date(a.actionDate).getTime() - new Date(b.actionDate).getTime();
      }
      // Steps with action dates come before steps without
      if (a.actionDate && !b.actionDate) return -1;
      if (!a.actionDate && b.actionDate) return 1;
      // If neither has action date, sort by step order
      return a.stepOrder - b.stepOrder;
    });
  }

  return Array.from(instanceMap.values());
}
export async function getSupplierChanges(supplierId: number) {
  return repo.getSupplierChanges(supplierId);
}

export async function getSuppliersList(limit: number) {
  return repo.getSuppliersList(limit);
}

export async function getTaxCodes() {
  return repo.getTaxCodes();
}

export async function getEmailNotifications(params: {
  page: number;
  limit: number;
  search?: string;
  userEmails: string[];
}) {
  return repo.getEmailNotifications(params);
}

export async function getLatestEmailNotifications(userEmails: string[]) {
  return repo.getLatestEmailNotifications(userEmails);
}

export async function getUnreadNotificationCount(userEmails: string[]) {
  return repo.getUnreadNotificationCount(userEmails);
}

export async function markNotificationRead(id: string) {
  return repo.markNotificationRead(id);
}

export async function markAllNotificationsRead(userEmails: string[]) {
  return repo.markAllNotificationsRead(userEmails);
}

export async function getBudgetLines() {
  return repo.getBudgetLines();
}

export async function getInvitationsPaginated(params: { page: number; limit: number; search?: string; status?: string }) {
  return repo.getInvitationsPaginated(params);
}

export async function getInvitationStatusCounts() {
  return repo.getInvitationStatusCounts();
}

export const ACTIVE_SUPPLIER_EMAIL_EXISTS_MSG = "Supplier with this email already exists.";

export async function inviteSupplier(data: { companyName: string; email: string; inviteAnyway?: boolean }, sessionUser: any) {
  if (!data.companyName || !data.email) {
    throw { status: 400, message: "Supplier company name and email are required" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    throw { status: 400, message: "Please enter a valid email address" };
  }

  const activeSupplier = await repo.findActiveSupplierByEmail(data.email);
  if (activeSupplier) {
    throw { status: 400, message: ACTIVE_SUPPLIER_EMAIL_EXISTS_MSG };
  }

  const orgUserExists = await repo.checkOrgUserEmailExists(data.email);
  if (orgUserExists) {
    throw { status: 400, message: "Email already exists as an organisation user" };
  }

  if (!data.inviteAnyway) {
    const duplicates = await repo.checkDuplicateInvitation(data.companyName, data.email);
    if (duplicates.length > 0) {
      return {
        success: false,
        duplicates,
        message: "Duplicate invitations found with same company name or email. Check 'Invite Anyway' to proceed.",
      };
    }
  }

  const sentBy = sessionUser?.userName || sessionUser?.email || "ADMIN";
  const sentByName = sessionUser?.name || "System Administrator";

  const newId = await repo.createInvitation({
    companyName: data.companyName,
    email: data.email,
    sentBy,
    sentByName,
  });

  publishInviteEvent(data.email, data.companyName, String(newId), sessionUser).catch(err =>
    console.error("[InviteSupplier] Failed to publish email event:", err)
  );

  return { success: true, message: "Invitation sent successfully", id: newId };
}

export async function resendInvitation(invitationId: number, sessionUser: any) {
  const modifiedBy = sessionUser?.userName || sessionUser?.email || "ADMIN";
  const result = await repo.resendInvitation(invitationId, modifiedBy);
  if (!result) throw { status: 404, message: "Invitation not found" };

  publishInviteEvent(result.email_id, result.company_name, String(invitationId), sessionUser).catch(err =>
    console.error("[ResendInvitation] Failed to publish email event:", err)
  );

  return { success: true, message: "Invitation resent successfully" };
}

const RESENDABLE_INVITATION_STATUSES = new Set(["Initiated", "Expired", "Account Created"]);

export async function resendSupplierInvitation(supplierId: number, sessionUser: any) {
  const found = await repo.findInvitationForSupplier(supplierId);
  if (!found) throw { status: 404, message: "Supplier not found" };

  const { invitation } = found;
  if (!invitation?.id) {
    throw { status: 404, message: "No invitation found for this supplier" };
  }

  if (!RESENDABLE_INVITATION_STATUSES.has(invitation.status)) {
    throw {
      status: 400,
      message: `Cannot resend invitation with status "${invitation.status}"`,
    };
  }

  return resendInvitation(invitation.id, sessionUser);
}

export async function resetSupplierPassword(supplierId: number, tenantDomain?: string) {
  const userId = await repo.findSupplierUserId(supplierId);
  if (!userId) {
    throw { status: 404, message: "No registered supplier user found for this supplier" };
  }

  const result = await commonService.resetPassword(String(userId), tenantDomain);
  if ("error" in result) {
    throw { status: result.status || 500, message: result.error };
  }
  return result;
}

export async function cancelInvitation(invitationId: number, modifiedBy: string) {
  await repo.updateInvitationStatus(invitationId, "Cancelled", modifiedBy);
}

export async function updateInvitationEmail(invitationId: number, emailId: string, sessionUser: any) {
  if (!emailId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailId)) {
    throw { status: 400, message: "Please provide a valid email address" };
  }
  const modifiedBy = sessionUser?.userName || sessionUser?.email || "ADMIN";
  const result = await repo.updateInvitationEmail(invitationId, emailId.trim().toLowerCase(), modifiedBy);
  if (!result) throw { status: 404, message: "Invitation not found" };
  return { success: true, message: "Email updated successfully", data: result };
}

async function publishInviteEvent(emailId: string, companyName: string, invitationId: string, sessionUser: any) {
  let orgName = "S2P Labs";
  let orgId = sessionUser?.orgId || "";

  if (orgId) {
    try {
      const org = await repo.getOrgDetails(orgId);
      if (org?.organization_name) orgName = org.organization_name;
    } catch (e) {
      console.error("[publishInviteEvent] Failed to fetch org details:", e);
    }
  }
  const orgData = await adminRepo.getOrgDetails();
  const procOfficer = sessionUser?.name || "Procurement Team";
  const event: RegistrationInviteEvent = {
    eventType: 'REGISTRATION_INVITE',
    timestamp: new Date(),
    emailId,
    companyName,
    invitationId,
    procOfficer,
    orgName,
    orgId,
    domain: sessionUser?.domain || undefined,
    orgLogoPath: orgData.org_logo_path,
  };

  eventBus.publish(event);
  console.log(`[publishInviteEvent] Published REGISTRATION_INVITE event for ${emailId}, invitation ${invitationId}`);
}

export async function processRegistrationApprovalStep(supplierId: number, body: any, reqUser: any) {
  const { workflowService } = await import("../../services/workflowService");
  const { taskId, result, comments } = body;
  const processName = "Vendor Registration";

  if (!taskId || !result) throw { status: 400, message: "taskId and result are required" };

  const user = await repo.getUserDetails(reqUser.id);
  const username = user.user_name || user.email_id || 'system';

  if (!username || username === 'system') {
    throw { status: 400, message: "Could not determine user identity" };
  }

  if (result.toLowerCase() === "resubmit") {
    const validationError = await vendorRegistrationRepo.validateSupplierBeforeSubmit(supplierId);
    if (validationError) {
      throw { status: 400, message: validationError };
    }
  }

  const supplier = await repo.getSupplierWithDetails(supplierId);
  if (!supplier) throw { status: 404, message: "Supplier not found" };
  const wfStepInstances = await workflowService.findByTaskId(taskId);

  const workflowType = await repo.getWorkflowTypeFromTask(taskId);
  const isUpdateApproval = workflowType === 'update';
  console.log(`[processApproval] Supplier ${supplierId} - workflow type: ${workflowType}, action: ${result}`);

  const taskCreationDate = await repo.getTaskCreationDate(taskId);
  const userRoles = await repo.getUserRoles(reqUser.id);
  const orgData = await adminRepo.getOrgDetails();

  let ntaskId = "";
  try {
    ntaskId = await workflowService.completeTask(
      taskId,
      result as "Approve" | "Reject" | "ReSubmit" | "More",
      comments || "",
      username,
      userRoles
    );
  } catch (e: any) {
    throw { status: 400, message: e.message };
  }

  if (ntaskId && ntaskId !== "") {
    await repo.updateSupplierTaskId(supplierId, ntaskId, username);
    const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=$1`,[ntaskId]);
    const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
    const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

    const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent('Vendor Registration')}&&taskId=${encodeURIComponent(ntaskId)}&&email=${encodeURIComponent(approverEmail.rows[0].current_assignee)}&&refnumber=${encodeURIComponent(supplierId)}`;
    if(result.toLowerCase() === "approve") 
    {
     /*const { publishTaskAssignmentEvent } = await import("../../services/eventBus/publishTaskAssignment");
     publishTaskAssignmentEvent({
      taskId: ntaskId,
      templateEventId: isUpdateApproval ? "SUPP_UPDATE_PROCOFF" : "SUPP_APPR_INITIATOR",
      taskSub: `${isUpdateApproval ? "Update supplier registration" : "Supplier registration"} — ${supplier.company_name || supplierId}`,
      submittedBy: user.name || username,
      department: "",
      srmsRefNo: String(supplierId),
      variables: {
        orgLogoPath: orgData.org_logo_path,
        emailApprovalLink : approvalLink,
      },
      emailApprovalLink : approvalLink,
      receiverEmail: approverEmail.rows[0].current_assignee,
     });
    }*/
   const userData = await adminRepo.getUserByEmail(approverEmail.rows[0].current_assignee);
   const byteData = await generatepdfReview(String(supplierId),userData?.name || userData?.email_id || 'system');
   if (!Buffer.isBuffer(byteData)) {
     throw new Error(`Failed to generate PDF: ${byteData.message}`);
   }
   const apprEvent: import("../../services/eventBus/events").SupplierApprInitiatorEvent = {
        eventType: 'SUPP_APPR_INITIATOR',
        timestamp: new Date(),
        receiverEmail: approverEmail.rows[0].current_assignee.trim(),
        userName: userData?.name || userData.email_id || 'system',
        companyName: supplier.company_name,
        orgLogoPath: orgData.org_logo_path, 
        emailApprovalLink: approvalLink,
        attachments:[
        {
          filename: "Registration Summary.pdf",
          content: byteData,
          contentType: "application/pdf",
        }
      ],
      };
      eventBus.publish(apprEvent);
   }
  }
  const isFinalStep = !ntaskId || ntaskId === "";
  const resultLower = result.toLowerCase();

  if (isFinalStep && resultLower === "approve") {
    await repo.updateSupplierStatusAndTask(supplierId, { status: 'Active', modifiedBy: username });
    await repo.updateSupplierAttribute4(supplierId, 'Active', username);
    await repo.clearAllPrevColumns(supplierId);
    await repo.clearTaskBySuppId(supplierId);
    if (!isUpdateApproval && supplier.invitation_id) {
      await repo.updateInvitationStatus(supplier.invitation_id, 'Active', username);
    }

    // Publish SupplierApproved event to notify the supplier
    try {
      const supplierEmail = supplier.email_id || supplier.email || "";
      const supplierName = supplier.company_name || String(supplierId);
      if (supplierEmail) {
        const event: import("../../services/eventBus/events").SupplierApproved = {
          eventType: 'SUPP_REGSTR_APPROVED',
          timestamp: new Date(),
          emailId: supplierEmail,
          userName: supplierName,
          orgLogoPath: orgData.org_logo_path,
        };
        eventBus.publish(event);
        console.log(`[processApproval] Published SUPP_REGSTR_APPROVED event for supplier ${supplierId} (${supplierEmail})`);
      }
    } catch (e) {
      console.error("[processApproval] Failed to publish SupplierApproved event:", e);
    }
  }

  if (resultLower === "reject") {
    if (isUpdateApproval) {
      await repo.revertFromPrevColumns(supplierId);
      await repo.updateSupplierStatusAndTask(supplierId, { status: 'Active', modifiedBy: username });
    } else {
      await repo.revertFromPrevColumns(supplierId);
      await repo.updateSupplierStatusAndTask(supplierId, { status: 'Rejected', modifiedBy: username });
      if (supplier.invitation_id) {
        await repo.updateInvitationStatus(supplier.invitation_id, 'Rejected', username);
      }
    }

    // Publish SupplierRejected event to notify the supplier
    try {
      const supplierEmail = supplier.email_id || supplier.email || "";
      const supplierName = supplier.company_name || String(supplierId);
      if (supplierEmail) {
        const event: import("../../services/eventBus/events").SupplierRejected = {
          eventType: 'SUPP_REGSTR_REJECTED',
          timestamp: new Date(),
          emailId: supplierEmail,
          userName: supplierName,
          orgLogoPath: orgData.org_logo_path,
        };
        eventBus.publish(event);
        console.log(`[processApproval] Published SUPP_REGSTR_REJECTED event for supplier ${supplierId} (${supplierEmail})`);
      }
    } catch (e) {
      console.error("[processApproval] Failed to publish SupplierRejected event:", e);
    }
  }

  if (resultLower === "more" || resultLower === "more info required") {
    const subjectPrefix = isUpdateApproval ? 'Update Supplier Registration Approval' : 'Supplier Registration Approval';
    let taskSubject = `${subjectPrefix} - ${supplier.company_name}`;
    if (taskSubject.length > 80) taskSubject = taskSubject.substring(0, 80);

    const params = {
      subject: taskSubject,
      srmsRefNumber: String(supplier.id),
      status: "Pending Approval",
      startDate: new Date().getTime(),
      createdBy: username,
      organization: supplier.legal_entity_type || "",
      department: ""
    };

    const approversList = await workflowService.getApproversList(processName, params);
    await repo.updateSupplierStatusAndTask(supplierId, { status: 'More Info Required', approversList: approversList.join(", "), modifiedBy: username });
    // Publish MoreInfo event to notify the supplier
    try {
      const supplierEmail = supplier.email_id || supplier.email || "";
      const supplierName = supplier.company_name || String(supplierId);
      if (supplierEmail) {
        if (isUpdateApproval) {
          const event: SupplierMoreInfoUpdate = {
            eventType: 'SUPP_UPDATE_MORE_INFO',
            timestamp: new Date(),
            emailId: supplierEmail,
            userName: supplierName,
            orgLogoPath: orgData.org_logo_path,
          };
          eventBus.publish(event);
          console.log(`[processApproval] Published SUPP_UPDATE_MORE_INFO event for supplier ${supplierId} (${supplierEmail})`);
        } else {
          const event: SupplierMoreInfo = {
            eventType: 'SUPP_REGSTR_MOREINFO',
            timestamp: new Date(),
            emailId: supplierEmail,
            userName: supplierName,
            orgLogoPath: orgData.org_logo_path,
          };
          eventBus.publish(event);
          console.log(`[processApproval] Published SUPP_REGSTR_MOREINFO event for supplier ${supplierId} (${supplierEmail})`);
        }
      }
    } catch (e) {
      console.error("[processApproval] Failed to publish MoreInfo event:", e);
    }
  }

  if (resultLower === "resubmit") {
    await repo.updateSupplierStatusAndTask(supplierId, { status: 'Pending Approval', modifiedBy: username });

    // Publish SupplierResubmit event to notify the approvers (using the next assignee from ntaskId or current task)
    try {
      const supplierName = supplier.company_name || String(supplierId);
      // Determine receiver (the first approver from the new/next task instances)
      let receiverEmail = "procurement@prokraya.com"; // fallback
      if (ntaskId || taskId) {
        const targetTaskId = ntaskId || taskId;
        const targetWfStepInstances = await workflowService.findByTaskId(targetTaskId);
        if (targetWfStepInstances && targetWfStepInstances.length > 0) {
          const instance = targetWfStepInstances[0];
          if (instance.assignment_type === "USER" && instance.current_assignee) {
            receiverEmail = instance.current_assignee;
          }
        }
      }

      const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=$1`,[ntaskId]);
    const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
    const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

    const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent('Vendor Registration')}&&taskId=${encodeURIComponent(ntaskId)}&&email=${encodeURIComponent(approverEmail.rows[0].current_assignee)}&&refnumber=${encodeURIComponent(supplierId)}`;
    
    let approverName;
    try 
    {
      const userResult = await getPool().query(
          `SELECT name FROM dbo.um_user_dtls WHERE LOWER(email_id) = LOWER($1) LIMIT 1`,
          [approverEmail.rows[0].current_assignee.trim()]
        );
        if (userResult.rows[0]?.name) 
        {
          approverName = userResult.rows[0].name;
        }
      } 
      catch (lookupErr) 
      {
        console.warn(`[submitChangesForApproval] Could not look up approver name for ${approverEmail}:`, lookupErr);
      }
      const event: import("../../services/eventBus/events").SupplierResubmit = {
        eventType: 'SUPP_REGSTR_RESUBMIT',
        timestamp: new Date(),
        receiverEmail: receiverEmail,
        userName: approverName || '',
        orgLogoPath: orgData.org_logo_path,
        emailApprovalLink:approvalLink,
      };
      eventBus.publish(event);
      console.log(`[processApproval] Published SUPP_REGSTR_RESUBMIT event for supplier ${supplierId} to ${receiverEmail}`);
    } catch (e) {
      console.error("[processApproval] Failed to publish SupplierResubmit event:", e);
    }
  }

  await repo.insertVendorApprovalHistory({
    objectId: String(supplierId),
    supplierId: supplierId,
    comments: comments || "",
    approverId: user.id,
    approverName: user.name,
    email: user.email_id,
    designation: user.designation || "",
    status: result,
    requestedDate: taskCreationDate || new Date(),
    createdBy: username
  });


  const wfStepInstance = wfStepInstances[0];
  if (resultLower === "approve") {
    const currentApprovers = supplier.approvers_list;
    if (currentApprovers) {
      let newApprovers = currentApprovers;
      if (currentApprovers.includes(",")) {
        if ((wfStepInstance.assignment_type === "ROLE" && userRoles.includes(wfStepInstance.current_assignee))) {
          newApprovers = currentApprovers.replace(`${wfStepInstance.current_assignee},`, "").replace(`, ${wfStepInstance.current_assignee}`, "");
        } else if ((wfStepInstance.assignment_type === "USER" && user.email_id === wfStepInstance.current_assignee)) {
          newApprovers = currentApprovers.replace(`${user.name},`, "").replace(`, ${user.name}`, "");
        } else if (wfStepInstance.assignment_type === "USER_HIERARCHY") {
          newApprovers = currentApprovers.replace("Manager,", "").replace(", Manager", "");
        } else if (userRoles.includes("ROLE_SUPERADMIN") || userRoles.includes("SUPERADMIN")) {
          newApprovers = currentApprovers.replace(`${wfStepInstance.current_assignee},`, "").replace(`, ${wfStepInstance.current_assignee}`, "");
        }
      } else {
        if ((wfStepInstance.assignment_type === "ROLE" && userRoles.includes(wfStepInstance.current_assignee))) {
          newApprovers = currentApprovers.replace(`${wfStepInstance.current_assignee}`, "");
        } else if ((wfStepInstance.assignment_type === "USER" && user.email_id === wfStepInstance.current_assignee)) {
          newApprovers = currentApprovers.replace(`${user.name}`, "");
        } else if (wfStepInstance.assignment_type === "USER_HIERARCHY") {
          newApprovers = "";
        } else if (userRoles.includes("ROLE_SUPERADMIN") || userRoles.includes("SUPERADMIN")) {
          newApprovers = currentApprovers.replace(`${wfStepInstance.current_assignee}`, "");
        }
      }

      await repo.updateSupplierApproversList(supplierId, newApprovers);
    }
  }
  return { success: true, message: "Successfully processed your request.", nextTaskId: ntaskId };
}

export async function quickCreateSupplier(data: any, sessionUser: any) {
  if (!data.companyName || !data.address || !data.legalEntityType || !data.city ||
    !data.country || !data.postalCode || !data.contactName || !data.emailId || !data.mobileNo) {
    throw { status: 400, message: "Please fill in all mandatory fields" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.emailId)) {
    throw { status: 400, message: "Please enter a valid email address" };
  }

  const phoneCheck = validateOnboardPhone(data.mobileNo);
  if (!phoneCheck.valid) {
    throw { status: 400, message: phoneCheck.message || "Please enter a valid mobile number" };
  }

  const orgUserExists = await repo.checkOrgUserEmailExists(data.emailId);
  if (orgUserExists) {
    throw { status: 400, message: "Email already exists as an organisation user" };
  }

  const orgNameExists = await repo.checkOrgExists(data.companyName);
  if(orgNameExists) {
    throw { status: 400, message: "Company Name already exists as an organisation user"};
  }

  if (data.accountNo && data.confirmAccountNo && data.accountNo !== data.confirmAccountNo) {
    throw { status: 400, message: "Account Number and Confirm Account Number do not match" };
  }

  // Block only on duplicate email — supplier company names are allowed to repeat.
  const emailExists = await repo.checkOnboardEmailExists(data.emailId);
  if (emailExists) {
    throw { status: 400, message: "A supplier or user account already exists with this email address. Please use a different email." };
  }

  const createdBy = sessionUser?.userName || sessionUser?.email || "ADMIN";
  const sentByName = sessionUser?.name || "System Administrator";

  let mapOrg = await repo.getOrgByCountry(data.country);
  if (!mapOrg) {
    mapOrg = await repo.getMainOrg();
  }
  const orgCurrency = mapOrg?.currency || "AED";
  const orgDateFormat = mapOrg?.date_format || "DD-MM-YYYY";
  const orgDefaultPaymentTerms = mapOrg?.default_paymentterms || "";
  const orgDefaultTax = mapOrg?.default_tax || "";

  const opUnitId = await repo.getFirstOperatingUnit();
  const locations = opUnitId ? opUnitId + "," : null;

  let paymentTermsDesc: string | null = null;
  let paymentTermsId: number | null = null;
  if (data.paymentTerms) {
    const payTerm = await repo.getPaymentTermById(parseInt(data.paymentTerms));
    if (payTerm) {
      paymentTermsDesc = payTerm.description;
      paymentTermsId = payTerm.id;
    }
  }

  const sessionOrgId = sessionUser?.orgId ? parseInt(sessionUser.orgId) : null;
  let sessionOrgName: string | null = null;
  if (sessionOrgId) {
    const orgDetails = await repo.getOrgDetails(String(sessionOrgId));
    sessionOrgName = orgDetails?.organization_name || null;
  }

  const { supplierId, siteId } = await repo.quickCreateSupplier({
    companyName: data.companyName,
    address: data.address,
    legalEntityType: data.legalEntityType,
    city: data.city,
    state: data.state || "",
    licenseNo: data.licenseNo || "",
    country: data.country,
    postalCode: data.postalCode,
    placeOfIssue: data.placeOfIssue || "",
    incorporationDate: data.incorporationDate || null,
    contactName: data.contactName,
    designation: data.designation || "",
    emailId: data.emailId,
    mobileNo: data.mobileNo,
    taxRegNo: data.taxRegNo || null,
    taxPayerId: data.taxPayerId || null,
    paymentTermsId: paymentTermsId ?? undefined,
    paymentTermsDesc: paymentTermsDesc ?? undefined,
    turnOverCurrency: orgCurrency,
    locations: locations ?? undefined,
    bankName: data.bankName,
    beneficiaryName: data.beneficiaryName,
    bankAddress: data.bankAddress,
    bankCity: data.bankCity,
    bankState: data.bankState,
    accountNo: data.accountNo,
    ifscCode: data.ifscCode,
    bankCountry: data.bankCountry,
    bankPostalCode: data.bankPostalCode,
    swiftCode: data.swiftCode,
    ibanNo: data.ibanNo || null,
    bankCurrency: orgCurrency,
    createdBy,
    orgId: sessionOrgId || undefined,
    orgName: sessionOrgName || undefined,
  });

  await repo.createExternalOrg({
    companyName: data.companyName,
    city: data.city,
    country: data.country,
    licenseNo: data.licenseNo || "",
    currency: orgCurrency,
    dateFormat: orgDateFormat,
    defaultPaymentTerms: orgDefaultPaymentTerms,
    defaultTax: orgDefaultTax,
    createdBy,
  });

  const invitationId = await repo.createInvitationForSupplier({
    companyName: data.companyName,
    emailId: data.emailId,
    sentBy: createdBy,
    sentByName,
  });

  await repo.updateSupplierInvitationId(supplierId, invitationId, createdBy);

  publishOnBehalfInviteEvent(data.emailId, data.companyName, String(invitationId), sessionUser, data.mobileNo).catch(err =>
    console.error("[QuickCreateSupplier] Failed to publish email event:", err)
  );

  return { success: true, id: supplierId, message: "Supplier created successfully" };
}

async function publishOnBehalfInviteEvent(emailId: string, companyName: string, invitationId: string, sessionUser: any, mobileNo?: string) {
  let orgName = "S2P Labs";
  const orgId = sessionUser?.orgId || "";
  const orgData = await adminRepo.getOrgDetails();

  if (orgId) {
    try {
      const org = await repo.getOrgDetails(orgId);
      if (org?.organization_name) orgName = org.organization_name;
    } catch (e) {
      console.error("[publishOnBehalfInviteEvent] Failed to fetch org details:", e);
    }
  }

  const event: RegisterOnBehalfInviteEvent = {
    eventType: 'REGISTER_ONBEHALF_INVITATION',
    timestamp: new Date(),
    emailId,
    companyName,
    invitationId,
    procOfficer: sessionUser?.name || "Procurement Team",
    orgName,
    orgId,
    domain: sessionUser?.domain || undefined,
    mobileNo: mobileNo || '',
    orgLogoPath: orgData.org_logo_path,
  };

  eventBus.publish(event);
  console.log(`[publishOnBehalfInviteEvent] Published REGISTER_ONBEHALF_INVITATION event for ${emailId}, invitation ${invitationId}`);
}

export async function getSupplierByIds(suppIds: any[]) {
  return await repo.getSupplierByIds(suppIds);
}

export async function deleteDboSupplierContact(supplierId: number, contactId: number) {
  const supplier = await getDboSupplier(supplierId);
  if (!supplier) throw { status: 404, message: "Supplier not found" };
  await vendorRegistrationRepo.deleteContact(contactId, supplierId);
  return { success: true, message: "Contact deleted successfully" };
}

export async function deleteDboSupplierBank(supplierId: number, bankId: number) {
  const supplier = await getDboSupplier(supplierId);
  if (!supplier) throw { status: 404, message: "Supplier not found" };
  await vendorRegistrationRepo.deleteBankAccount(bankId, supplierId);
  return { success: true, message: "Bank account deleted successfully" };
}

export async function deleteDboSupplierDocument(supplierId: number, docId: number) {
  const supplier = await getDboSupplier(supplierId);
  if (!supplier) throw { status: 404, message: "Supplier not found" };
  await vendorRegistrationRepo.softDeleteDocument(docId, supplierId);
  return { success: true, message: "Document deleted successfully" };
}

export async function deleteDboSupplier(supplierId: number) 
{
  const supplier = await getDboSupplier(supplierId);
  if (!supplier) throw { status: 404, message: "Supplier not found" };

  await repo.deleteSupplierCascade(supplierId);
  return { success: true, message: "Supplier deleted successfully" };
}

export async function getVendorName(supplier_id: string) {
    return await repo.getVendorName(supplier_id);
}