import { eventBus } from "./index";
import { EventTypes, TaskAssignmentEvent } from "./events";

export type PublishTaskAssignmentInput = Omit<TaskAssignmentEvent, "eventType" | "timestamp">;

/** Fire after completeTask when a next task id is returned (ntaskId / newTaskId). */
export function publishTaskAssignmentEvent(payload: PublishTaskAssignmentInput): void {
  if (!payload.taskId || typeof payload.taskId !== 'string' || !payload.taskId.trim()) return;
  const event: TaskAssignmentEvent = {
    eventType: String(payload.templateEventId) ?? '',
    timestamp: new Date(),
    ...payload,
    taskId: payload.taskId.trim(),
    orgLogoPath: payload.orgLogoPath || '',
    emailApprovalLink: payload.emailApprovalLink || '',
    receiverEmail: payload.receiverEmail || '',
  };
  eventBus.publish(event);
}
