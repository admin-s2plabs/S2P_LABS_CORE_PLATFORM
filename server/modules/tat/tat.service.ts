import * as repo from "./tat.repository";

// ── Helper: convert module slug to entity_type ────────────────────────────────
export function moduleToEntityType(module: string | undefined): string | null {
  if (!module) return null;
  const map: Record<string, string> = {
    vendor: "VENDOR",
    pr: "PR",
    bid: "BID",
    bids: "BID",
    po: "PO",
    dn: "DN",
    grn: "GRN",
    srn: "GRN",
    invoice: "INVOICE",
  };
  return map[module.toLowerCase()] || null;
}

export async function getWorkflowsSummary() {
  const workflows = await repo.getWorkflows();
  const result: any[] = [];
  for (const wf of workflows) {
    try {
      const steps = await repo.getWorkflowSteps(wf.id);
      result.push({ ...wf, stepCount: steps.length, steps });
    } catch {
      result.push({ ...wf, stepCount: 0, steps: [] });
    }
  }
  return result;
}

export async function getTatRules() {
  return repo.getTatRules();
}

export async function saveTatRules(moduleKey: string, rules: any[], userId: string) {
  await repo.replaceTatRules(moduleKey, rules, userId);
}

export async function getOverview() {
  const [stats, overdueByModule, pendingByModule] = await Promise.all([
    repo.getOverviewStatsRow(),
    repo.getOverdueByModule(),
    repo.getPendingByModule(),
  ]);
  return { stats, overdueByModule, pendingByModule };
}

export async function getLifecycleLogs(entityType: string, entityId: string) {
  return repo.getLifecycleLogs(entityType, entityId);
}

export async function getLifecycleIds(entityType: string) {
  return repo.getLifecycleIds(entityType);
}

export async function getAlerts(module: string | undefined) {
  return repo.getAlerts(moduleToEntityType(module));
}

export async function getMissedAlerts(module: string | undefined) {
  return repo.getMissedAlerts(moduleToEntityType(module));
}

export async function updateMissedAlertRemark(id: string, remark: string, userId: string) {
  await repo.updateMissedAlertRemark(id, remark, userId);
}

export async function getStallers(module: string | undefined) {
  return repo.getStallers(moduleToEntityType(module));
}

export async function getIgnored(module: string | undefined) {
  return repo.getIgnored(moduleToEntityType(module));
}

export async function addIgnored(params: {
  entityType: string;
  entityId: string;
  stageName: string;
  reason: string;
  userId: string;
}) {
  await repo.addIgnored(params);
}

export async function addEscalation(params: Parameters<typeof repo.addEscalation>[0]) {
  await repo.addEscalation(params);
}

export async function getAuditLogs() {
  return repo.getTatAuditLogs();
}
