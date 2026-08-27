import {

  buildSuggestedNotification,

  isActivationStageEnabled,

  isBidWorkflowTask,

  mapTaskSubjectToStage,

  SOURCING_ACTIVATION_LIFECYCLE_ORDER,

  SOURCING_ACTIVATION_STAGE_LABELS,

  type SourcingActivationSignalsResponse,

  type SourcingActivationPreferences,

  type SourcingActivationStage,

  type SourcingActivationStageId,

  type SourcingActivationStageItem,

} from "@shared/sourcing-activation-signals";

import { CommonService } from "../modules/common/common.service";

import * as bidRepo from "../modules/bids/bids.repository";

import * as commonRepo from "../modules/common/common.repository";



function emptyStages(): Record<SourcingActivationStageId, SourcingActivationStageItem[]> {

  return SOURCING_ACTIVATION_LIFECYCLE_ORDER.reduce(

    (acc, id) => {

      acc[id] = [];

      return acc;

    },

    {} as Record<SourcingActivationStageId, SourcingActivationStageItem[]>,

  );

}



function normalizeTask(task: any) {

  const subject = String(task.subject || task.description_ || "");

  return {

    subject,

    srmsRefNumber: String(task.srmsRefNumber || task.ref_number || ""),

    taskId: String(task.taskId || task.id_ || ""),

    taskName: String(task.taskName || task.name_ || ""),

    process_name: String(task.process_name || ""),

    title: subject,

  };

}



export async function getActivationSignals(

  sessionUser: any,

  activationPreferences?: SourcingActivationPreferences,

): Promise<SourcingActivationSignalsResponse> {

  const userId = Number(sessionUser?.id || sessionUser?.userId || 0);



  const userDetails = userId ? await commonRepo.getUserDetails(String(userId)) : null;

  const userRoles = userId ? await commonRepo.getUserRoleNames(userId) : [];

  const isSuperAdmin =

    userRoles.includes("SUPERADMIN") || userRoles.includes("ROLE_SUPERADMIN");



  const username =

    userDetails?.user_name ||

    sessionUser?.userName ||

    sessionUser?.user_name ||

    sessionUser?.username ||

    "";

  const email = userDetails?.email_id || sessionUser?.email_id || sessionUser?.email || "";



  const commonService = new CommonService();

  const hasEnabledWorkflowStage = SOURCING_ACTIVATION_LIFECYCLE_ORDER.some(

    (stageId) =>

      stageId !== "awarding" &&

      isActivationStageEnabled(activationPreferences, stageId),

  );



  const [allTasksResult, awardingBids] = await Promise.all([

    userId && hasEnabledWorkflowStage

      ? commonService.getAllTasks(sessionUser, 0, 1000).catch(() => ({ tasks: [], total: 0 }))

      : Promise.resolve({ tasks: [], total: 0 }),

    isActivationStageEnabled(activationPreferences, "awarding")

      ? bidRepo

          .getAwardingReadyBidsForUser(username, email, isSuperAdmin)

          .catch(() => [] as Awaited<ReturnType<typeof bidRepo.getAwardingReadyBidsForUser>>)

      : Promise.resolve([] as Awaited<ReturnType<typeof bidRepo.getAwardingReadyBidsForUser>>),

  ]);



  const buckets = emptyStages();

  const seenTaskIds = new Set<string>();



  const addItem = (stageId: SourcingActivationStageId, item: SourcingActivationStageItem) => {

    if (!isActivationStageEnabled(activationPreferences, stageId)) return;

    buckets[stageId].push(item);

  };



  for (const raw of allTasksResult.tasks) {

    const task = normalizeTask(raw);

    if (!isBidWorkflowTask(task)) continue;

    const stageId = mapTaskSubjectToStage(task.subject);

    if (!stageId || stageId === "awarding") continue;

    if (task.taskId && seenTaskIds.has(task.taskId)) continue;

    if (task.taskId) seenTaskIds.add(task.taskId);



    const isAwardWorkflow = stageId === "bidAwardApproval" && task.subject.includes("Bid Award");

    addItem(stageId, {

      bidId: isAwardWorkflow ? undefined : task.srmsRefNumber || undefined,

      awardId: isAwardWorkflow ? task.srmsRefNumber || undefined : undefined,

      title: task.title,

      taskId: task.taskId || undefined,

    });

  }



  for (const row of awardingBids) {

    addItem("awarding", {

      bidId: String(row.bid_id),

      title: row.bid_title || row.bid_number || `Bid #${row.bid_id}`,

      responseCount: Number(row.response_count) || 0,

    });

  }



  const stages: SourcingActivationStage[] = SOURCING_ACTIVATION_LIFECYCLE_ORDER.map((id) => {

    const items = buckets[id];

    const pendingCount = items.length;

    return {

      id,

      label: SOURCING_ACTIVATION_STAGE_LABELS[id],

      status: pendingCount > 0 ? "pending" : "idle",

      pendingCount,

      items,

    };

  });



  const { message, nextStageId } = buildSuggestedNotification(stages);



  return {

    stages,

    suggestedNotification: message,

    nextStageId,

  };

}


