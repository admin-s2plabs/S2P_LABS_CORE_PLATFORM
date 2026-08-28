import * as repo from "./budgets.repository";

const DEPT_KEYWORDS: { key: string; patterns: RegExp[] }[] = [
  { key: "HR", patterns: [/\bhr\b/i, /human\s*resources?/i, /recruit/i, /hiring/i, /campus\s*hir/i] },
  { key: "IT", patterns: [/\bit\b/i, /information\s*tech/i, /technology/i, /software/i] },
  { key: "Marketing", patterns: [/market(ing)?/i, /\bpr\b/i, /advertis/i, /brand/i] },
  { key: "Finance", patterns: [/finance/i, /account(ing)?/i, /audit/i] },
  { key: "Operations", patterns: [/operations?/i, /facilit(y|ies)/i, /maintenance/i] },
  { key: "Admin", patterns: [/admin/i, /general\s*admin/i] },
  { key: "Procurement", patterns: [/procure/i, /sourcing/i, /purchas/i] },
  { key: "Sales", patterns: [/\bsales?\b/i, /revenue/i] },
];

function detectDepartmentFromPrompt(prompt: string): string | null {
  for (const dept of DEPT_KEYWORDS) {
    if (dept.patterns.some((p) => p.test(prompt))) return dept.key;
  }
  return null;
}

function resolveBusinessEntityForAI(
  prompt: string,
  entities: Array<{ id: string; name: string; entity_type?: string }>,
  selectedEntityId?: string | null
): {
  status: "clear" | "default" | "ambiguous";
  entity: { id: string; name: string; entity_type?: string } | null;
  candidates: Array<{ id: string; name: string }>;
} {
  if (selectedEntityId) {
    const selected = entities.find((e) => String(e.id) === String(selectedEntityId));
    if (selected) {
      return { status: "clear", entity: selected, candidates: [selected] };
    }
  }

  const lower = prompt.toLowerCase();
  const nameMatches = entities.filter((e) => {
    const name = (e.name || "").toLowerCase().trim();
    return name.length >= 2 && lower.includes(name);
  });

  if (nameMatches.length === 1) {
    return { status: "clear", entity: nameMatches[0], candidates: nameMatches };
  }
  if (nameMatches.length > 1) {
    return {
      status: "ambiguous",
      entity: null,
      candidates: nameMatches.map((e) => ({ id: e.id, name: e.name })),
    };
  }

  const mentionsEntity = /\b(entity|organisation|organization|subsidiary|company)\b/i.test(prompt);
  if (mentionsEntity && entities.length > 1) {
    return {
      status: "ambiguous",
      entity: null,
      candidates: entities.map((e) => ({ id: e.id, name: e.name })),
    };
  }

  const main = entities.find((e) => e.entity_type === "MAIN") || entities[0] || null;
  return {
    status: "default",
    entity: main,
    candidates: main ? [{ id: main.id, name: main.name }] : [],
  };
}

function buildApprovedHistoryContext(rows: any[], departmentHint: string | null) {
  const budgets: Record<string, any> = {};
  for (const row of rows) {
    const key = `${row.id}`;
    if (!budgets[key]) {
      const amount = parseFloat(row.budget_amount) || 0;
      const consumed = parseFloat(row.consumed_amount) || 0;
      const reserved = parseFloat(row.reserved_amount) || 0;
      const utilization = amount > 0 ? Math.round(((consumed + reserved) / amount) * 100) : 0;
      budgets[key] = {
        id: row.id,
        name: row.budget_name,
        year: row.budget_year,
        total: amount,
        consumed,
        reserved,
        utilization,
        status: row.status,
        entity: row.business_entity_name,
        owner: row.budget_owner_name,
        lines: [] as Array<{ code: string; name: string; amount: number }>,
      };
    }
    if (row.segment_dtl_code) {
      budgets[key].lines.push({
        code: row.segment_dtl_code,
        name: row.segment_dtl_name,
        amount: parseFloat(row.line_amount) || 0,
      });
    }
  }

  const all = Object.values(budgets);
  const matched = departmentHint
    ? all.filter((b: any) => {
        const hay = `${b.name} ${b.lines.map((l: any) => l.name).join(" ")}`.toLowerCase();
        return (
          hay.includes(departmentHint.toLowerCase())
          || (departmentHint === "HR" && /human|recruit|hir|welfare|training|learning/.test(hay))
          || (departmentHint === "IT" && /tech|software|hardware|network|\bit\b/.test(hay))
        );
      })
    : all;

  const byYear: Record<number, number[]> = {};
  for (const b of matched as any[]) {
    if (!b.year || !b.total) continue;
    if (!byYear[b.year]) byYear[b.year] = [];
    byYear[b.year].push(b.total);
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const yearlyTotals = years.map((y) => ({
    year: y,
    total: byYear[y].reduce((s, n) => s + n, 0) / byYear[y].length,
  }));

  let avgIncreasePct: number | null = null;
  let suggestedNext: number | null = null;
  if (yearlyTotals.length >= 2) {
    const increases: number[] = [];
    for (let i = 1; i < yearlyTotals.length; i++) {
      const prev = yearlyTotals[i - 1].total;
      const curr = yearlyTotals[i].total;
      if (prev > 0) increases.push(((curr - prev) / prev) * 100);
    }
    if (increases.length > 0) {
      avgIncreasePct = Math.round((increases.reduce((s, n) => s + n, 0) / increases.length) * 10) / 10;
      const last = yearlyTotals[yearlyTotals.length - 1].total;
      suggestedNext = Math.round(last * (1 + avgIncreasePct / 100));
    }
  } else if (yearlyTotals.length === 1) {
    suggestedNext = Math.round(yearlyTotals[0].total);
  }

  const maxHistorical = matched.length
    ? Math.max(...(matched as any[]).map((b) => b.total || 0))
    : 0;

  const summary = (matched.length ? matched : all)
    .slice(0, 25)
    .map((b: any) => {
      const linesSummary = b.lines
        .slice(0, 8)
        .map((l: any) => `  - ${l.name} (${l.code}): ${l.amount}`)
        .join("\n");
      return `${b.name} [Year ${b.year || "N/A"}, ${b.status}, Entity: ${b.entity || "N/A"}, Owner: ${b.owner || "N/A"}, Total: ${b.total}, Consumed: ${b.consumed}, Reserved: ${b.reserved}, Utilization: ${b.utilization}%]:\n${linesSummary || "  (no line items)"}`;
    })
    .join("\n\n");

  return {
    hasHistory: all.length > 0,
    matchedCount: matched.length,
    summary,
    yearlyTotals,
    avgIncreasePct,
    suggestedNext,
    maxHistorical,
    estimateBasis:
      matched.length > 0
        ? avgIncreasePct != null && suggestedNext != null
          ? `Approved ${departmentHint || "department"} history shows avg YoY change of ${avgIncreasePct}%. Suggested next total: ${suggestedNext}.`
          : `Approved history found (${matched.length} budgets). Suggested total from latest/available history: ${suggestedNext ?? "N/A"}.`
        : "No matching approved historical budgets. Estimate using master data, department patterns, and conservative assumptions.",
  };
}

function findOwnerForDepartment(users: any[], departmentHint: string | null, reqUser: any) {
  if (departmentHint) {
    const deptOwner = users.find(
      (u) =>
        (u.department_name || "").toLowerCase().includes(departmentHint.toLowerCase())
        || (departmentHint === "HR" && /human|hr/.test((u.department_name || "").toLowerCase()))
    );
    if (deptOwner) {
      return { id: deptOwner.id, name: deptOwner.name };
    }
  }
  return {
    id: reqUser.id,
    name: reqUser.name || reqUser.username || reqUser.userName || "User",
  };
}

function resolveTargetYear(prompt: string, currentYear: number): number {
  const fy = prompt.match(/\bFY\s*([12]\d{3})\b/i);
  if (fy) return Number(fy[1]);
  const year = prompt.match(/\b(20[2-9]\d)\b/);
  if (year) return Number(year[1]);
  return currentYear;
}

export async function createBudgetWithAI(
  prompt: string,
  reqUser: any,
  options?: { businessEntityId?: string | null }
) {
  if (!prompt || prompt.trim().length === 0) {
    throw { status: 400, message: "Please provide a budget description" };
  }

  const validCostCenters = await repo.getExpenseCostCenters();
  if (validCostCenters.length === 0) {
    throw { status: 400, message: "No cost center items found. Please set up cost centers first." };
  }

  const [validPeriods, validEntities, validUsers, departments, approvedHistoryRows] =
    await Promise.all([
      repo.getPeriods(),
      repo.getBusinessEntities(),
      repo.getOrgUsers(),
      repo.getDepartments(),
      repo.getApprovedHistoricalBudgetsForAI(5),
    ]);

  const departmentHint = detectDepartmentFromPrompt(prompt);
  const entityResolution = resolveBusinessEntityForAI(
    prompt,
    validEntities,
    options?.businessEntityId
  );

  if (entityResolution.status === "ambiguous") {
    return {
      needsClarification: true,
      clarification: {
        type: "business_entity",
        message: "Multiple business entities could apply. Please choose one to continue.",
        options: entityResolution.candidates,
      },
    };
  }

  const resolvedEntity = entityResolution.entity;
  const scopedLocations = resolvedEntity
    ? await repo.getLocations(resolvedEntity.id)
    : await repo.getLocations();

  const defaultOwner = findOwnerForDepartment(validUsers, departmentHint, reqUser);
  const history = buildApprovedHistoryContext(approvedHistoryRows, departmentHint);

  const costCenterList = validCostCenters.map((cc: any) => `${cc.code}: ${cc.name}`).join("\n");
  const periodList = validPeriods.map((p: any) => `${p.id}: ${p.period_name}`).join("\n");
  const entityList = validEntities
    .map(
      (e: any) =>
        `${e.id}: ${e.name} (${e.entity_type || "ENTITY"}, currency=${e.currency || "AED"})`
    )
    .join("\n");
  const userList = validUsers
    .map(
      (u: any) =>
        `${u.id}: ${u.name}${u.department_name ? ` [dept: ${u.department_name}]` : ""}`
    )
    .join("\n");
  const locationList = scopedLocations.map((l: any) => `${l.id}: ${l.name}`).join("\n");
  const departmentList = departments
    .map((d: any) => `${d.id}: ${d.name}${d.code ? ` (${d.code})` : ""}`)
    .join("\n");

  const yearlyHistoryBlock = history.yearlyTotals.length
    ? history.yearlyTotals
        .map((y) => `Year ${y.year}: avg approved total ${Math.round(y.total)}`)
        .join("\n")
    : "No yearly approved totals available.";

  const today = new Date().toISOString().split("T")[0];
  const currentYear = new Date().getFullYear();
  const targetYear = resolveTargetYear(prompt, currentYear);

  const { getAIClient, getAIModelName } = await import("../../services/ai-client");
  const openai = await getAIClient();

  const systemPrompt = `You are an intelligent budget creation assistant for enterprise procurement. Create a COMPLETE EDITABLE DRAFT budget from natural language.

TODAY'S DATE: ${today}
CURRENT YEAR: ${currentYear}
TARGET YEAR FROM PROMPT: ${targetYear}
DETECTED DEPARTMENT HINT: ${departmentHint || "none"}
RESOLVED BUSINESS ENTITY: ${resolvedEntity ? `${resolvedEntity.id}: ${resolvedEntity.name}` : "none"}
DEFAULT BUDGET OWNER (prefer department owner): ${defaultOwner.id}: ${defaultOwner.name}

=== MASTER DATA (USE EXACT IDs/CODES ONLY) ===

BUDGET PERIODS (id: name):
${periodList}

BUSINESS ENTITIES (id: name):
${entityList}

BUDGET OWNERS (id: name):
${userList}

COST CENTERS (code: name):
${costCenterList}

LOCATIONS (id: name) for the selected entity:
${locationList || "(none)"}

DEPARTMENTS (id: name):
${departmentList || "(none)"}

=== APPROVED HISTORICAL BUDGETS ONLY (last up to 5 years) ===
${history.hasHistory ? history.summary : "No approved historical budgets found."}

YEARLY APPROVED TOTALS (matched to department when possible):
${yearlyHistoryBlock}

HISTORY-BASED ESTIMATE:
- ${history.estimateBasis}
- avgIncreasePct: ${history.avgIncreasePct ?? "n/a"}
- suggestedNextTotal: ${history.suggestedNext ?? "n/a"}
- maxHistoricalTotal: ${history.maxHistorical || "n/a"}

RULES FOR AMOUNTS:
1. If user provided an amount, USE that total and split across cost centers.
2. If user did NOT provide an amount, prefer suggestedNextTotal from approved history.
3. If no history, estimate from master data/assumptions and set amount_estimate_basis to defaults_assumptions.
4. Flag in warnings if proposed total exceeds maxHistoricalTotal * 1.5 when history exists.

=== PARSING RULES ===
PERIOD: quarterly/Q1-Q4 → 2; monthly → 3; annual/yearly/default → 1; custom → 4
DATES: use TARGET YEAR for FY/year mentions; Q1→Jan 1, Q2→Apr 1, Q3→Jul 1, Q4→Oct 1; default annual start=${targetYear}-01-01 when year present else ${today}
END DATE: annual +1y -1d preferred, quarterly +3m, monthly +1m
OWNER: prefer user whose department matches; else default owner above
ENTITY: use resolved entity id ${resolvedEntity?.id ?? "null"}
SPECIAL INSTRUCTIONS: honor mentions like "include training"

DEPARTMENT → COST CENTER MAPPING (pick real codes from the list):
- HR: Training/Learning, Recruitment, Employee benefits/Welfare, Consultant fees, Travel
- IT: Software, Hardware, Network, Data center, IT equipment
- Marketing: Events, Advertising, PR, Social media
- Finance: Bank charges, Audit, Consultancy, Software
- Operations: Cleaning, Security, Maintenance
- Admin: Courier, Printing, Stationery
- Procurement: Supplier management, Contract costs, Sourcing
- Sales: relevant revenue/sales cost centers from the list

Each line MUST include:
- cost_center_code from list
- location_id from locations list (or null if none)
- department_id from departments list matching the function
- amount
- description: short reason for the amount

=== OUTPUT JSON ONLY ===
{
  "budget_name": "string",
  "period_id": number,
  "period_name": "string",
  "business_entity_id": "string or null",
  "business_entity_name": "string or null",
  "budget_owner_id": number or null,
  "budget_owner_name": "string or null",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "currency": "string",
  "lines": [
    {
      "cost_center_code": "string",
      "cost_center_name": "string",
      "location_id": number or null,
      "department_id": number or null,
      "description": "string - reason for amount",
      "amount": number
    }
  ],
  "total_budget": number,
  "amount_estimate_basis": "history_yoy | user_provided | defaults_assumptions",
  "rationale": "string",
  "similar_existing_budget": "string or null",
  "unclear_fields": ["fields AI could not safely fill"],
  "warnings": ["string"]
}

CRITICAL:
1. Never invent IDs/codes
2. Always return 3-10 relevant line items with reasons
3. Return valid JSON only`;

  const modelName = await getAIModelName();
  const completion = await openai.chat.completions.create({
    model: modelName,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2500,
  });

  const aiResponse = completion.choices[0]?.message?.content;
  if (!aiResponse) {
    throw { status: 500, message: "AI failed to parse budget description" };
  }

  let parsedBudget: any;
  try {
    parsedBudget = JSON.parse(aiResponse);
  } catch {
    throw { status: 500, message: "AI returned invalid response format" };
  }

  if (!parsedBudget.budget_name || !parsedBudget.lines || parsedBudget.lines.length === 0) {
    throw {
      status: 400,
      message:
        "Could not parse budget details from description. Please include a budget purpose/name and enough detail for line items.",
    };
  }

  const newBudgetNumber = await repo.getNextBudgetIdFromSequence();

  const startDate = parsedBudget.start_date || (targetYear !== currentYear ? `${targetYear}-01-01` : today);
  let endDateStr = parsedBudget.end_date;
  if (!endDateStr) {
    const endDate = new Date(startDate);
    const periodId = parsedBudget.period_id || 1;
    if (periodId === 2) endDate.setMonth(endDate.getMonth() + 3);
    else if (periodId === 3) endDate.setMonth(endDate.getMonth() + 1);
    else endDate.setFullYear(endDate.getFullYear() + 1);
    endDateStr = endDate.toISOString().split("T")[0];
  }

  const businessEntityId =
    resolvedEntity?.id
    || (parsedBudget.business_entity_id
      && validEntities.some((e: any) => String(e.id) === String(parsedBudget.business_entity_id))
      ? String(parsedBudget.business_entity_id)
      : null);
  const matchedEntity = validEntities.find((e: any) => String(e.id) === String(businessEntityId));
  const businessEntityName =
    matchedEntity?.name || parsedBudget.business_entity_name || resolvedEntity?.name || null;

  const ownerFromAi =
    parsedBudget.budget_owner_id
    && validUsers.some((u: any) => Number(u.id) === Number(parsedBudget.budget_owner_id))
      ? {
          id: Number(parsedBudget.budget_owner_id),
          name:
            parsedBudget.budget_owner_name
            || validUsers.find((u: any) => Number(u.id) === Number(parsedBudget.budget_owner_id))
              ?.name,
        }
      : defaultOwner;

  const periodMstId =
    parsedBudget.period_id
    && validPeriods.some((p: any) => Number(p.id) === Number(parsedBudget.period_id))
      ? Number(parsedBudget.period_id)
      : 1;

  const warnings: string[] = Array.isArray(parsedBudget.warnings) ? [...parsedBudget.warnings] : [];
  if (Array.isArray(parsedBudget.unclear_fields) && parsedBudget.unclear_fields.length > 0) {
    warnings.push(`Could not safely fill: ${parsedBudget.unclear_fields.join(", ")}`);
  }
  if (!history.hasHistory || history.matchedCount === 0) {
    warnings.push(
      "Estimate is based on default rules, master data, and assumptions — no matching approved budget history was found."
    );
  }

  let insertedLines = 0;
  let totalAmount = 0;
  const unmatched: string[] = [];

  const linePayloads: Array<{
    matchedCC: any;
    amount: number;
    description: string;
    locationIds?: number[];
    departmentIds?: number[];
  }> = [];

  for (const line of parsedBudget.lines) {
    const matchedCC = validCostCenters.find((cc: any) => cc.code === line.cost_center_code);
    if (!matchedCC) {
      unmatched.push(line.cost_center_code || line.cost_center_name || "unknown");
      continue;
    }
    const amount = parseFloat(line.amount) || 0;
    const locationIds: number[] = [];
    if (line.location_id != null) {
      const loc = scopedLocations.find((l: any) => Number(l.id) === Number(line.location_id));
      if (loc) locationIds.push(Number(loc.id));
    } else if (scopedLocations.length === 1) {
      locationIds.push(Number(scopedLocations[0].id));
    }

    const departmentIds: number[] = [];
    if (line.department_id != null) {
      const dept = departments.find((d: any) => Number(d.id) === Number(line.department_id));
      if (dept) departmentIds.push(Number(dept.id));
    } else if (departmentHint) {
      const dept = departments.find((d: any) => {
        const name = (d.name || "").toLowerCase();
        const code = (d.code || "").toLowerCase();
        return (
          name.includes(departmentHint.toLowerCase())
          || code.includes(departmentHint.toLowerCase())
          || (departmentHint === "HR" && (name.includes("human") || code === "hr"))
        );
      });
      if (dept) departmentIds.push(Number(dept.id));
    }

    linePayloads.push({
      matchedCC,
      amount,
      description:
        line.description || line.reason || `Suggested allocation for ${matchedCC.name}`,
      locationIds: locationIds.length ? locationIds : undefined,
      departmentIds: departmentIds.length ? departmentIds : undefined,
    });
    totalAmount += amount;
  }

  if (linePayloads.length === 0) {
    throw {
      status: 400,
      message: "AI could not map any line items to valid cost centers. Please refine your prompt.",
    };
  }

  if (history.maxHistorical > 0 && totalAmount > history.maxHistorical * 1.5) {
    warnings.push(
      `Proposed total (${totalAmount}) exceeds 150% of the highest approved historical budget (${history.maxHistorical}). Higher approval level may be required.`
    );
  }
  if (parsedBudget.similar_existing_budget) {
    warnings.push(
      `Similar budget already exists: "${parsedBudget.similar_existing_budget}". Consider reviewing or updating it instead.`
    );
  }
  if (unmatched.length > 0) {
    warnings.push(`Some items couldn't be matched to cost centers: ${unmatched.join(", ")}`);
  }

  const newBudgetId = await repo.insertBudgetWithAI({
    budgetNumber: newBudgetNumber,
    budgetName: parsedBudget.budget_name,
    budgetOwnerId: ownerFromAi.id,
    budgetOwnerName: ownerFromAi.name,
    businessEntityId,
    businessEntityName,
    periodMstId,
    startDate,
    endDate: endDateStr,
    totalAmount,
    createdBy: reqUser.id,
  });

  for (const line of linePayloads) {
    await repo.insertBudgetLineForAI({
      budgetMstId: newBudgetId,
      segmentDtlId: line.matchedCC.id,
      segmentDtlCode: line.matchedCC.code,
      segmentDtlName: line.matchedCC.name,
      amount: line.amount,
      description: line.description,
      locationIds: line.locationIds,
      departmentIds: line.departmentIds,
    });
    insertedLines += 1;
  }

  let approvalWorkflow: { processName: string; approvers: string[]; message: string } | null = null;
  try {
    const { workflowService } = await import("../../services/workflowService");
    const processName = "Budget";
    const username = reqUser.userName || reqUser.user_name || reqUser.username || "system";
    const params = {
      subject: `Budget Approval Request - ${parsedBudget.budget_name}`,
      srmsRefNumber: String(newBudgetId),
      status: "Pending Approval",
      startDate: new Date().getTime(),
      createdBy: username,
      organization: businessEntityName || "",
      department: departmentHint || "",
      amount: totalAmount,
      orgId: businessEntityId || 0,
    };
    const approvers = await workflowService.getApproversList(processName, params);
    approvalWorkflow = {
      processName,
      approvers,
      message:
        approvers.length > 0
          ? `Suggested approval workflow "${processName}" with: ${approvers.join(" → ")}`
          : `Approval workflow "${processName}" is not fully configured for this amount/entity yet.`,
    };
  } catch (err) {
    console.warn("Failed to preview budget approval workflow:", err);
    approvalWorkflow = {
      processName: "Budget",
      approvers: [],
      message: "Could not preview approval workflow. It will be resolved on submit.",
    };
  }

  const estimateBasis =
    parsedBudget.amount_estimate_basis
    || (history.suggestedNext != null && history.matchedCount > 0
      ? "history_yoy"
      : "defaults_assumptions");

  return {
    success: true,
    id: newBudgetId,
    budgetId: newBudgetNumber,
    budgetName: parsedBudget.budget_name,
    linesCount: insertedLines,
    totalAmount,
    rationale: parsedBudget.rationale || null,
    learnedFromHistory: history.estimateBasis,
    amountEstimateBasis: estimateBasis,
    warnings: warnings.length ? warnings : undefined,
    unclearFields: parsedBudget.unclear_fields || [],
    approvalWorkflow,
  };
}
