import { EDITABLE_STATUSES } from "server/constants";
import * as repo from "./budgets.repository";
import { eventBus } from "../../services/eventBus";
import { EventTypes } from "../../services/eventBus/events";
import * as userRepository from "../common/common.repository";
import * as adminRepo from "../administration/administration.repository.ts";
import { pool } from "../_shared";
import { getContextPool } from "../../tenant-context";
const getPool = () => getContextPool() ?? pool;

export async function listBudgets(params: {
  status?: string;
  search?: string;
  year?: string;
  page: string;
  limit: string;
  exportLines?: boolean;
}) {
  await repo.autoExpireBudgets();

  const pageNum = parseInt(params.page || "1");
  const limitNum = parseInt(params.limit || "50");

  const filter = {
    status: params.status as string | undefined,
    search: params.search as string | undefined,
    year: params.year as string | undefined,
  };

  const { data, total } = await repo.getBudgetsList({
    ...filter,
    page: pageNum,
    limit: limitNum
  });

  const finalResult = await Promise.all(
    data.map(async (row: any) => {
      const currentApprover = await repo.getCurrentApprover(row.id, "Budget");
      return {
        ...row,
        currentApprover: currentApprover?.name || null,
      };
    })
  );

  const exportLines =
    params.exportLines && limitNum === 0
      ? await repo.getBudgetExportLineRows(filter)
      : undefined;

  return {
    data: finalResult,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: limitNum === 0 ? 1 : Math.ceil(total / limitNum)
    },
    ...(exportLines !== undefined ? { exportLines } : {})
  };
}


export async function getStats(year?: string) {
  await repo.autoExpireBudgets();
  return repo.getBudgetStats(year);
}

export async function getPeriods() {
  return repo.getPeriods();
}

export async function getUsers() {
  return repo.getOrgUsers();
}

export async function getEntities() {
  return repo.getBusinessEntities();
}

export async function getCostCenters() {
  return repo.getCostCenters();
}

export async function getApprovedLines() {
  return repo.getApprovedBudgetLines();
}

export async function getLocations(businessEntityId?: string) {
  return repo.getLocations(businessEntityId);
}

export async function getDepartments() {
  return repo.getDepartments();
}

export { createBudgetWithAI } from "./budget-ai-create"; 

const AMOUNT_SUGGESTION_BASIS = [
  "historical_allocations",
  "allocation_range",
  "cost_center_pattern",
  "industry_knowledge",
  "period_normalization",
  "previous_spending",
  "utilization",
] as const;

type AmountSuggestionBasis = (typeof AMOUNT_SUGGESTION_BASIS)[number];

export interface SuggestAmountOptions {
  currency?: string;
  periodMstId?: string;
  startDate?: string;
  endDate?: string;
  businessEntity?: string;
  locationIds?: number[];
  departmentIds?: number[];
}

export interface BudgetAmountSuggestion {
  suggestion: number | null;
  confidence: number;
  reasoning: string;
  basedOn: AmountSuggestionBasis[];
  message: string;
  currency: string;
  periodName?: string;
  costCenterName?: string;
  statistics?: { average: number; min: number; max: number; count: number };
  historicalAllocations: Array<{
    budgetName: string;
    amount: number;
    consumed?: number;
    reserved?: number;
    available?: number;
    utilizationPct?: number;
    status: string;
    sourceCurrency?: string;
    sourcePeriodName?: string;
    originalAmount?: number;
    periodScaled?: boolean;
  }>;
}

function monthsBetweenDates(startDate?: string | Date | null, endDate?: string | Date | null): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    (end.getDate() - start.getDate()) / 30;
  if (!Number.isFinite(months) || months <= 0) return null;
  return Math.max(1, Math.round(months * 100) / 100);
}

/** 1=Annually(12), 2=Quarterly(3), 3=Monthly(1), 4=Custom(from dates or 12). */
function periodMonths(
  periodMstId?: string | number | null,
  startDate?: string | Date | null,
  endDate?: string | Date | null
): number {
  const id = String(periodMstId ?? "").trim();
  if (id === "1") return 12;
  if (id === "2") return 3;
  if (id === "3") return 1;
  if (id === "4") {
    return monthsBetweenDates(startDate, endDate) ?? 12;
  }
  const fromDates = monthsBetweenDates(startDate, endDate);
  if (fromDates != null) return fromDates;
  return 12;
}

function periodLabel(periodMstId?: string | number | null, periodName?: string | null): string {
  if (periodName && String(periodName).trim()) return String(periodName).trim();
  const id = String(periodMstId ?? "").trim();
  if (id === "1") return "Annually";
  if (id === "2") return "Quarterly";
  if (id === "3") return "Monthly";
  if (id === "4") return "Custom";
  return "Unknown";
}

function scaleAmountToPeriod(
  amount: number,
  sourceMonths: number,
  targetMonths: number
): { scaled: number; scaledApplied: boolean } {
  if (!Number.isFinite(amount) || sourceMonths <= 0 || targetMonths <= 0) {
    return { scaled: amount, scaledApplied: false };
  }
  if (sourceMonths === targetMonths) {
    return { scaled: amount, scaledApplied: false };
  }
  return {
    scaled: amount * (targetMonths / sourceMonths),
    scaledApplied: true,
  };
}

function heuristicAmountConfidence(count: number, min: number, max: number, average: number): number {
  if (count <= 0) return 0;
  const spreadRatio = average > 0 ? (max - min) / average : 1;
  if (count >= 5 && spreadRatio <= 0.35) return 0.85;
  if (count >= 5 && spreadRatio <= 0.75) return 0.75;
  if (count >= 3 && spreadRatio <= 0.5) return 0.7;
  if (count >= 3) return 0.55;
  if (count === 2 && spreadRatio <= 0.5) return 0.5;
  return 0.4;
}

function buildAmountSuggestionPrompt(
  costCenterCode: string,
  costCenterName: string,
  currency: string,
  targetPeriodName: string,
  targetMonths: number,
  statistics: { average: number; min: number; max: number; count: number },
  historicalAllocations: Array<{
    budgetName: string;
    amount: number;
    consumed?: number;
    reserved?: number;
    available?: number;
    utilizationPct?: number;
    status: string;
    sourceCurrency?: string;
    sourcePeriodName?: string;
    originalAmount?: number;
    periodScaled?: boolean;
  }>
): string {
  const allocationRows = historicalAllocations
    .map((row, i) => {
      const notes: string[] = [];
      if (row.sourceCurrency && row.sourceCurrency !== currency) {
        notes.push(`converted from ${row.sourceCurrency}`);
      }
      if (row.periodScaled && row.originalAmount != null && row.sourcePeriodName) {
        notes.push(
          `scaled from ${row.originalAmount} ${currency} (${row.sourcePeriodName}) to ${targetPeriodName}`
        );
      } else if (row.sourcePeriodName) {
        notes.push(`period: ${row.sourcePeriodName}`);
      }
      const noteSuffix = notes.length ? ` [${notes.join("; ")}]` : "";
      const consumed = row.consumed ?? 0;
      const reserved = row.reserved ?? 0;
      const available = row.available ?? row.amount - consumed - reserved;
      const util =
        row.utilizationPct != null && Number.isFinite(row.utilizationPct)
          ? `${row.utilizationPct.toFixed(1)}%`
          : "N/A";
      return `${i + 1}. ${row.budgetName} (${row.status})${noteSuffix}
   Allocated: ${row.amount} ${currency}
   Consumed (spent): ${consumed} ${currency}
   Reserved: ${reserved} ${currency}
   Available: ${available} ${currency}
   Utilization: ${util}`;
    })
    .join("\n");

  const avgUtil =
    historicalAllocations.length > 0
      ? historicalAllocations.reduce((s, r) => s + (r.utilizationPct ?? 0), 0) /
        historicalAllocations.length
      : 0;
  const totalConsumed = historicalAllocations.reduce((s, r) => s + (r.consumed ?? 0), 0);
  const totalReserved = historicalAllocations.reduce((s, r) => s + (r.reserved ?? 0), 0);
  const avgConsumed =
    historicalAllocations.length > 0 ? totalConsumed / historicalAllocations.length : 0;

  return `You are an experienced enterprise budgeting analyst. Recommend a budget line allocation amount for the cost centre below.

You are given FULL historical evidence: prior allocations, actual spending (consumed), reserved amounts, and utilization. Synthesize a recommendation from ALL of this evidence — do NOT default to the average allocation. The average is only one optional reference signal.

All amounts below are already expressed in ${currency} and normalized to the current budget period (${targetPeriodName}, ~${targetMonths} months). Your suggestedAmount MUST be in ${currency} for a ${targetPeriodName} budget — do not rescale again.

=== COST CENTRE ===
Code: ${costCenterCode}
Name: ${costCenterName}
Target Currency: ${currency}
Target Period: ${targetPeriodName} (~${targetMonths} months)

=== SUMMARY STATS (${currency}, ${targetPeriodName}-equivalent) ===
Prior lines: ${statistics.count}
Allocation average / min / max: ${statistics.average} / ${statistics.min} / ${statistics.max} ${currency}
Average consumed (spent): ${Math.round(avgConsumed * 100) / 100} ${currency}
Average utilization: ${avgUtil.toFixed(1)}%
Total consumed across sample: ${Math.round(totalConsumed * 100) / 100} ${currency}
Total reserved across sample: ${Math.round(totalReserved * 100) / 100} ${currency}

=== RECENT LINES (most recent first, period-normalized) ===
${allocationRows}

=== ANALYSIS INSTRUCTIONS ===
1. Weigh ALL signals: historical allocations, actual spending (consumed), reserved, utilization %, allocation range, and recent trends — not just the average.
2. If prior utilization was high (roughly ≥85–100%), suggest an amount at or above recent allocations / spend to avoid shortfall.
3. If prior utilization was low, prefer a suggestion closer to actual spend plus a reasonable buffer — do not blindly reuse the prior allocated amount or the average.
4. When spend and allocation diverge widely, explain which you trusted and why (e.g. over-allocation vs genuine demand).
5. Amounts from different budget periods were already scaled (e.g. annual → quarterly × 3/12). Treat them as current-period equivalents; include "period_normalization" in basedOn when any row was scaled.
6. Include "previous_spending" and/or "utilization" in basedOn when spend or utilization materially influenced the suggestion.
7. Estimate confidence between 0 and 1:
   - Higher when history is consistent and spend aligns with allocation.
   - Lower when history is sparse, spend/allocation diverge sharply, or evidence is thin.
8. basedOn must use only these values: "historical_allocations", "allocation_range", "cost_center_pattern", "industry_knowledge", "period_normalization", "previous_spending", "utilization".
9. suggestedAmount must be a number in ${currency} for ${targetPeriodName} (no currency symbol in the JSON number).

=== RESPONSE FORMAT ===
Return ONLY a single JSON object (no markdown fences, no extra text) with exactly this structure:
{
  "suggestedAmount": number,
  "reasoning": "max 30 words. Cite specific figures (allocation, spend, and/or utilization) that drove the recommendation. Mention ${currency} / ${targetPeriodName} when citing amounts.",
  "confidence": number between 0 and 1,
  "basedOn": array containing one or more of "historical_allocations", "allocation_range", "cost_center_pattern", "industry_knowledge", "period_normalization", "previous_spending", "utilization"
}`;
}

async function convertHistoricalAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number | null> {
  const from = (fromCurrency || "AED").trim().toUpperCase();
  const to = (toCurrency || "AED").trim().toUpperCase();
  if (from === to) return amount;
  try {
    const { convertCurrency } = await import("../../services/pr-ai-service");
    return await convertCurrency(amount, from, to);
  } catch (error) {
    console.warn(
      `[suggestAmount] Skipping allocation: no exchange rate ${from} -> ${to}`,
      error
    );
    return null;
  }
}

function parseAmountSuggestionResponse(content: string): {
  suggestedAmount: number;
  reasoning: string;
  confidence: number;
  basedOn: AmountSuggestionBasis[];
} {
  const cleaned = content.replace(/```json\s*|```/g, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error("[suggestAmount] JSON parse error. Raw content:", content, error);
    throw new Error("AI response was not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI response was not a JSON object.");
  }

  const { suggestedAmount, reasoning, confidence, basedOn } = parsed;

  if (typeof suggestedAmount !== "number" || !Number.isFinite(suggestedAmount) || suggestedAmount < 0) {
    throw new Error("AI response is missing a valid numeric 'suggestedAmount'.");
  }
  if (typeof reasoning !== "string" || reasoning.trim().length === 0) {
    throw new Error("AI response is missing a valid 'reasoning' string.");
  }
  const reasoningWords = reasoning.trim().split(/\s+/);
  const truncatedReasoning =
    reasoningWords.length > 30
      ? reasoningWords.slice(0, 30).join(" ") + "..."
      : reasoning.trim();
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("AI response is missing a valid 'confidence' number between 0 and 1.");
  }
  if (!Array.isArray(basedOn) || basedOn.length === 0) {
    throw new Error("AI response is missing a valid non-empty 'basedOn' array.");
  }

  const allowed = new Set<string>(AMOUNT_SUGGESTION_BASIS);
  const filteredBasedOn = basedOn.filter(
    (b: unknown): b is AmountSuggestionBasis => typeof b === "string" && allowed.has(b)
  );
  if (filteredBasedOn.length === 0) {
    throw new Error("AI response 'basedOn' contains no recognized values.");
  }

  return {
    suggestedAmount: Math.round(suggestedAmount),
    reasoning: truncatedReasoning,
    confidence,
    basedOn: filteredBasedOn,
  };
}

async function callAmountSuggestionLLM(prompt: string): Promise<{
  suggestedAmount: number;
  reasoning: string;
  confidence: number;
  basedOn: AmountSuggestionBasis[];
}> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { getAIClient, getAIModelName } = await import("../../services/ai-client");
      const openai = await getAIClient();
      const response = await openai.chat.completions.create({
        model: await getAIModelName(),
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_completion_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("AI returned an empty response.");
      }

      return parseAmountSuggestionResponse(content);
    } catch (error) {
      lastError = error;
      console.error(`[suggestAmount] LLM attempt ${attempt}/2 failed:`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI amount suggestion failed after retrying.");
}

export async function suggestAmount(
  costCenterCode: string,
  options: SuggestAmountOptions | string = {}
): Promise<BudgetAmountSuggestion> {
  if (!costCenterCode) {
    throw { status: 400, message: "Cost center code is required" };
  }

  // Back-compat: older callers passed currency as a string.
  const opts: SuggestAmountOptions =
    typeof options === "string" ? { currency: options } : options || {};

  const currency = (opts.currency || "AED").trim().toUpperCase() || "AED";
  const targetMonths = periodMonths(opts.periodMstId, opts.startDate, opts.endDate);
  const targetPeriodName = periodLabel(opts.periodMstId);
  const historicalData = await repo.getHistoricalAllocations(costCenterCode, {
    businessEntity: opts.businessEntity,
    locationIds: opts.locationIds,
    departmentIds: opts.departmentIds,
  });

  if (historicalData.length === 0) {
    const filterHints: string[] = [];
    if (opts.businessEntity?.trim()) filterHints.push("entity");
    if (opts.locationIds?.length) filterHints.push("location");
    if (opts.departmentIds?.length) filterHints.push("department");
    const filterSuffix =
      filterHints.length > 0
        ? ` matching the selected ${filterHints.join(", ")}`
        : "";
    return {
      suggestion: null,
      confidence: 0,
      reasoning: "",
      basedOn: [],
      message: `No historical data found for this cost center${filterSuffix}. Enter amount based on your budget requirements.`,
      currency,
      periodName: targetPeriodName,
      historicalAllocations: [],
    };
  }

  const convertedRows: Array<{
    budgetName: string;
    amount: number;
    consumed: number;
    reserved: number;
    available: number;
    utilizationPct: number;
    status: string;
    sourceCurrency: string;
    sourcePeriodName: string;
    originalAmount: number;
    periodScaled: boolean;
  }> = [];
  let anyPeriodScaled = false;

  for (const row of historicalData) {
    const sourceCurrency = (row.budget_curr || "AED").trim().toUpperCase() || "AED";
    const rawAmount = parseFloat(row.amount) || 0;
    const rawConsumed = parseFloat(row.consumed_amount) || 0;
    const rawReserved = parseFloat(row.reserved_amount) || 0;

    const converted = await convertHistoricalAmount(rawAmount, sourceCurrency, currency);
    if (converted === null) continue;

    const convertedConsumed =
      (await convertHistoricalAmount(rawConsumed, sourceCurrency, currency)) ?? 0;
    const convertedReserved =
      (await convertHistoricalAmount(rawReserved, sourceCurrency, currency)) ?? 0;

    const sourceMonths = periodMonths(row.period_mst_id, row.start_date, row.end_date);
    const sourcePeriodName = periodLabel(row.period_mst_id, row.period_name);
    const currencyNormalized = Math.round(converted * 100) / 100;
    const { scaled, scaledApplied } = scaleAmountToPeriod(
      currencyNormalized,
      sourceMonths,
      targetMonths
    );
    const scaledConsumed = scaleAmountToPeriod(
      convertedConsumed,
      sourceMonths,
      targetMonths
    ).scaled;
    const scaledReserved = scaleAmountToPeriod(
      convertedReserved,
      sourceMonths,
      targetMonths
    ).scaled;

    if (scaledApplied) anyPeriodScaled = true;

    const amount = Math.round(scaled * 100) / 100;
    const consumed = Math.round(scaledConsumed * 100) / 100;
    const reserved = Math.round(scaledReserved * 100) / 100;
    const available = Math.round((amount - consumed - reserved) * 100) / 100;
    const utilizationPct =
      amount > 0 ? Math.round(((consumed + reserved) / amount) * 1000) / 10 : 0;

    convertedRows.push({
      budgetName: row.budget_name,
      amount,
      consumed,
      reserved,
      available,
      utilizationPct,
      status: row.status,
      sourceCurrency,
      sourcePeriodName,
      originalAmount: currencyNormalized,
      periodScaled: scaledApplied,
    });
  }

  if (convertedRows.length === 0) {
    return {
      suggestion: null,
      confidence: 0,
      reasoning: "",
      basedOn: [],
      message: `Historical allocations could not be converted to ${currency}. Add exchange rates in Exchange Rates, or enter the amount manually.`,
      currency,
      periodName: targetPeriodName,
      historicalAllocations: [],
    };
  }

  const amounts = convertedRows.map((row) => row.amount);
  const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);
  const avgUtilization =
    convertedRows.reduce((sum, row) => sum + row.utilizationPct, 0) / convertedRows.length;
  const avgConsumed =
    convertedRows.reduce((sum, row) => sum + row.consumed, 0) / convertedRows.length;
  const costCenterName = historicalData[0]?.segment_dtl_name || costCenterCode;
  const roundedAvg = Math.round(avgAmount);

  const historicalAllocations = convertedRows.map((row) => ({
    budgetName: row.budgetName,
    amount: row.amount,
    consumed: row.consumed,
    reserved: row.reserved,
    available: row.available,
    utilizationPct: row.utilizationPct,
    status: row.status,
    sourceCurrency: row.sourceCurrency,
    sourcePeriodName: row.sourcePeriodName,
    originalAmount: row.originalAmount,
    periodScaled: row.periodScaled,
  }));

  const statistics = {
    average: roundedAvg,
    min: Math.round(minAmount * 100) / 100,
    max: Math.round(maxAmount * 100) / 100,
    count: convertedRows.length,
  };

  const formatAmt = (n: number) =>
    new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(n);

  const periodNote = anyPeriodScaled
    ? ` (${targetPeriodName}-equivalent after period scaling)`
    : ` (${targetPeriodName})`;

  const message = `Analyzed ${convertedRows.length} prior line${convertedRows.length > 1 ? "s" : ""} for "${costCenterName}": allocation range ${formatAmt(minAmount)}–${formatAmt(maxAmount)} ${currency}, avg spend ${formatAmt(avgConsumed)} ${currency}, avg utilization ${avgUtilization.toFixed(1)}%${periodNote}.`;

  const fallbackBasedOn: AmountSuggestionBasis[] = anyPeriodScaled
    ? ["historical_allocations", "previous_spending", "utilization", "period_normalization"]
    : ["historical_allocations", "previous_spending", "utilization"];

  // Prefer spend-aware fallback: avg consumed + 15% buffer, floored at min allocation/2, capped near max
  const spendAwareFallback = Math.round(
    Math.min(
      Math.max(avgConsumed * 1.15, minAmount * 0.5),
      maxAmount > 0 ? maxAmount : avgConsumed * 1.15
    )
  );

  const fallbackConfidence = heuristicAmountConfidence(
    statistics.count,
    statistics.min,
    statistics.max,
    statistics.average
  );

  try {
    const prompt = buildAmountSuggestionPrompt(
      costCenterCode,
      costCenterName,
      currency,
      targetPeriodName,
      targetMonths,
      statistics,
      historicalAllocations
    );
    const ai = await callAmountSuggestionLLM(prompt);
    let basedOn = [...ai.basedOn];
    if (anyPeriodScaled && !basedOn.includes("period_normalization")) {
      basedOn.push("period_normalization");
    }
    return {
      suggestion: ai.suggestedAmount,
      confidence: ai.confidence,
      reasoning: ai.reasoning,
      basedOn,
      message,
      currency,
      periodName: targetPeriodName,
      costCenterName,
      statistics,
      historicalAllocations,
    };
  } catch (error) {
    console.error("[suggestAmount] Falling back to spend-aware estimate:", error);
    return {
      suggestion: spendAwareFallback || roundedAvg,
      confidence: fallbackConfidence,
      reasoning: message,
      basedOn: fallbackBasedOn,
      message,
      currency,
      periodName: targetPeriodName,
      costCenterName,
      statistics,
      historicalAllocations,
    };
  }
}

export async function createBudgetDraft(body: any, username: string) {
  const { budget_name, business_entity, business_entity_name, budget_owner_id, budget_owner_name, period_mst_id, start_date, end_date } = body;

  const budgetId = await repo.getNextBudgetIdFromSequence();
  const result = await repo.createBudget({
    budgetId,
    budgetName: budget_name,
    businessEntity: business_entity,
    businessEntityName: business_entity_name,
    budgetOwnerId: budget_owner_id,
    budgetOwnerName: budget_owner_name,
    periodMstId: period_mst_id,
    startDate: start_date,
    endDate: end_date,
    createdBy: username
  });

  return { id: result.id, budget_id: budgetId };
}

export async function updateBudget(id: string, body: any, username: string) {
  const check = await repo.getBudgetStatus(id);
  validateBudgetIsEditable(check);
  const budget = await repo.getBudgetFull(id);
  const budgetLines = await repo.getBudgetLines(id);

  if(budget.period_mst_id !== body.period_mst_id) {
    for(const line of budgetLines) {
      await deleteLine(id, line.id);
    }
  }
  await repo.updateBudgetHeader(id, {
    budgetName: body.budget_name,
    businessEntity: body.business_entity,
    businessEntityName: body.business_entity_name,
    budgetOwnerId: body.budget_owner_id,
    budgetOwnerName: body.budget_owner_name,
    periodMstId: body.period_mst_id,
    startDate: body.start_date,
    endDate: body.end_date,
    modifiedBy: username
  });
}

export async function deleteBudgetById(id: string) {
  const check = await repo.getBudgetStatus(id);
  if (!check) throw { status: 404, message: "Budget not found" };
  await repo.deleteBudget(id);
}

export async function submitBudget(id: string, reqUser: any) {
  const username = (reqUser as any)?.userName || (reqUser as any)?.user_name || 'system';
  const { workflowService } = await import("../../services/workflowService");
  const processName = "Budget";

  const budget = await repo.getBudgetWithOwnerDept(id);
  const orgData = await adminRepo.getOrgDetails();

  if (!budget) throw { status: 404, message: "Budget not found" };
  const status = budget.status?.toLowerCase() || "";
  const allowedStatuses = ["draft", "more info required", "resubmit", "rejected"];
  if (!allowedStatuses.includes(status)) {
    throw { status: 400, message: `Only budgets in ${allowedStatuses.join(", ")} status can be submitted for approval` };
  }

  const lineCount = await repo.getBudgetLineCount(id);
  if (lineCount === 0) {
    throw { status: 400, message: "Cannot submit budget without line items. Please add at least one budget line item." };
  }

  let taskSubject = `Budget Approval Request - ${budget.budget_name}`;
  if (taskSubject.length > 80) taskSubject = taskSubject.substring(0, 80);

  const params = {
    subject: taskSubject,
    srmsRefNumber: String(budget.id),
    status: "Pending Approval",
    startDate: new Date().getTime(),
    createdBy: username,
    organization: budget.business_entity_name || "",
    department: budget.owner_department || budget.department_name || "",
    amount: budget.budget_amount || 0,
    orgId: budget.business_entity || 0,
  };

  const checkApprList = await workflowService.getFirstStepApproversList(processName, params);
  if (!checkApprList || checkApprList.length === 0) {
    throw { status: 400, message: "Approver Hierarchy or Approval Flow is not defined for this request!" };
  }

  let taskId: string;
  try {
    taskId = await workflowService.startProcess(taskSubject, processName, String(budget.id), params, username);
  } catch (err: any) {
    if (err.status) throw err;
    throw { status: 400, message: err.message || "Failed to start approval workflow" };
  }
  const approversList = await workflowService.getApproversList(processName, params);

  await repo.updateBudgetStatusAndTask(id, {
    status: 'Pending Approval',
    taskId,
    approversList: approversList.join(", "),
    modifiedBy: username
  });
   
  const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=$1`,[taskId]);
  const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
  const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

  const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent('Budget')}&&taskId=${encodeURIComponent(taskId)}&&email=${encodeURIComponent(approverEmail.rows[0].current_assignee)}&&refnumber=${encodeURIComponent(id)}`;

  const { publishTaskAssignmentEvent } = await import("../../services/eventBus/publishTaskAssignment");
  publishTaskAssignmentEvent({
    taskId,
    templateEventId: status.toLowerCase() === "draft" ? EventTypes.TASK_ASSIGNMENT.BUDGET_APPROVAL : EventTypes.TASK_ASSIGNMENT.BUDGET_RESUBMIT,
    taskSub: taskSubject,
    submittedBy: username,
    department: budget.department_name || "",
    domain: (reqUser as any)?.domain,
    orgName: budget.business_entity_name || undefined,
    entityId: budget.business_entity != null && String(budget.business_entity).trim() !== ""
      ? String(budget.business_entity)
      : undefined,
    srmsRefNo: String(budget.id),
    variables:{
      budgetId: String(budget.budget_id),
      budgetName: budget.budget_name,
      requestorName: reqUser.name || reqUser.userName || "System",
      orgLogoPath: orgData.org_logo_path,
      emailApprovalLink:approvalLink,
    },
    emailApprovalLink:approvalLink,
  });

  return { success: true, message: "Successfully processed your request.", taskId, approvers: approversList };
}

export async function copyBudget(id: string, reqUser: any) {
  const originalBudget = await repo.getBudgetFull(id);
  if (!originalBudget) throw { status: 404, message: "Budget not found" };
  const copyableStatuses = ['approved', 'expired'];
  if (!copyableStatuses.includes(originalBudget.status?.toLowerCase())) throw { status: 400, message: "Only approved or expired budgets can be copied" };

  const newBudgetNumber = await repo.getNextBudgetIdFromSequence();
  const newBudgetName = `${originalBudget.budget_name} - Copy`;

  const creatorId = reqUser.email || reqUser.username || String(reqUser.id);
  const newBudgetId = await repo.copyBudgetHeader(originalBudget, newBudgetNumber, newBudgetName, creatorId);
  await repo.copyBudgetLines(id, newBudgetId, creatorId);
  await repo.updateBudgetTotalAmount(String(newBudgetId));

  return { success: true, message: "Budget copied successfully", newBudgetId, newBudgetNumber };
}

export async function processApproval(budgetId: string, body: any, reqUser: any) {
  const { workflowService } = await import("../../services/workflowService");
  const { taskId, result, comments } = body;
  const processName = "Budget";

  if (!taskId || !result) throw { status: 400, message: "taskId and result are required" };

  const user = await repo.getUserDetails(reqUser.id);
  const username = user.user_name || user.email_id || 'system';

  if (!username || username === 'system') {
    throw { status: 400, message: "Could not determine user identity" };
  }

  const budget = await repo.getBudgetWithOwnerDept(budgetId);
  if (!budget) throw { status: 404, message: "Budget not found" };

  const taskCreationDate = await repo.getTaskCreationDate(taskId);
  const userRoles = await repo.getUserRoles(reqUser.id);
  const wfStepInstances = await workflowService.findByTaskId(taskId);
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
    await repo.updateBudgetTaskId(budgetId, ntaskId, username);
     const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=$1`,[ntaskId]);
     const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
     const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

  const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent('Budget')}&&taskId=${encodeURIComponent(ntaskId)}&&email=${encodeURIComponent(approverEmail.rows[0].current_assignee)}&&refnumber=${encodeURIComponent(budgetId)}`;
    const { publishTaskAssignmentEvent } = await import("../../services/eventBus/publishTaskAssignment");
    if(result.toLowerCase() === "approve" || result.toLowerCase() === "approved") {
      publishTaskAssignmentEvent({
        taskId: ntaskId,
        templateEventId: EventTypes.TASK_ASSIGNMENT.BUDGET_APPROVAL,
        taskSub: `Budget Approval — ${budget.budget_name || budgetId}`,
        submittedBy: user.name || username,
        department: budget.owner_department || "",
        domain: (reqUser as any)?.domain,
        orgName: budget.business_entity_name || undefined,
        entityId:
          budget.business_entity != null && String(budget.business_entity).trim() !== ""
            ? String(budget.business_entity)
            : undefined,
        srmsRefNo: String(budget.id),
        variables:{
          budgetId: String(budget.budget_id),
          budgetName: budget.budget_name,
          requestorName: user.name || username,
          orgLogoPath: orgData.org_logo_path,
          emailApprovalLink:approvalLink,
        },
        emailApprovalLink:approvalLink,
      });
    }
  }
  if ((!ntaskId || ntaskId === "") && result.toLowerCase() === "approve") {
    await repo.updateBudgetStatusAndTask(budgetId, { status: 'Approved', modifiedBy: username });
    const ownerEmail = String((budget as { owner_email?: string }).owner_email || "").trim();
    const ownerName = String(budget.budget_owner_name || "").trim() || "User";
    const budgetName = String(budget.budget_name || "").trim();
    eventBus.publish({
      eventType: EventTypes.BUDGET_APPROVED,
      timestamp: new Date(),
      budgetId: String(budget.budget_id),
      budgetName,
      ownerEmail,
      ownerName,
      domain: (reqUser as any)?.domain,
      orgName: budget.business_entity_name || undefined,
      orgLogoPath: orgData.org_logo_path,
    });
  }

  if (result.toLowerCase() === "reject") {
    const rejectComments = String(comments || "").trim();
    await repo.updateBudgetStatusAndTask(budgetId, {
      status: 'Rejected',
      rejectComments,
      modifiedBy: username,
    });
    const ownerEmail = String((budget as { owner_email?: string }).owner_email || "").trim();
    const ownerName = String(budget.budget_owner_name || "").trim() || "User";
    const budgetName = String(budget.budget_name || "").trim();
    eventBus.publish({
      eventType: EventTypes.BUDGET_REJECTED,
      timestamp: new Date(),
      budgetId: String(budget.budget_id),
      budgetName,
      ownerEmail,
      ownerName,
      rejectComments,
      domain: (reqUser as any)?.domain,
      orgName: budget.business_entity_name || undefined,
      orgLogoPath: orgData.org_logo_path,
    });
  }

  if (result.toLowerCase() === "more" || result.toLowerCase() === "more info required") {
    let taskSubject = `Budget Approval Request - ${budget.budget_name}`;
    if (taskSubject.length > 80) taskSubject = taskSubject.substring(0, 80);

    const params = {
      subject: taskSubject,
      srmsRefNumber: String(budget.id),
      status: "Pending Approval",
      startDate: new Date().getTime(),
      createdBy: username,
      organization: budget.business_entity_name || "",
      department: budget.owner_department || ""
    };

    const approversList = await workflowService.getApproversList(processName, params);
    await repo.updateBudgetStatusAndTask(budgetId, { status: 'More Info Required', approversList: approversList.join(", "), modifiedBy: username });
    
    const ownerEmail = String((budget as { owner_email?: string }).owner_email || "").trim();
    const ownerName = String(budget.budget_owner_name || "").trim() || "User";
    const budgetName = String(budget.budget_name || "").trim();
    const moreInfoComments = String(comments || "").trim();

    eventBus.publish({
      eventType: EventTypes.BUDGET_MORE_INFO,
      timestamp: new Date(),
      budgetId: String(budget.budget_id),
      budgetName,
      ownerEmail,
      ownerName,
      moreInfoComments,
      domain: (reqUser as any)?.domain,
      orgName: budget.business_entity_name || undefined,
      orgLogoPath: orgData.org_logo_path,
    });
  }

  if (result.toLowerCase() === "resubmit") {
    await repo.updateBudgetStatusAndTask(budgetId, { status: 'ReSubmit', modifiedBy: username });

    const ownerEmail = String((budget as { owner_email?: string }).owner_email || "").trim();
    const ownerName = String(budget.budget_owner_name || "").trim() || "User";
    const budgetName = String(budget.budget_name || "").trim();

    const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=$1`,[ntaskId]);
    const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
    const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

    const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent('Budget')}&&taskId=${encodeURIComponent(ntaskId)}&&email=${encodeURIComponent(approverEmail.rows[0].current_assignee)}&&refnumber=${encodeURIComponent(budgetId)}`;

    const { publishTaskAssignmentEvent } = await import("../../services/eventBus/publishTaskAssignment");
    publishTaskAssignmentEvent({
      taskId: ntaskId,
      templateEventId: EventTypes.TASK_ASSIGNMENT.BUDGET_RESUBMIT,
      submittedBy: user.name || username,
      department: budget.owner_department || "",
      domain: (reqUser as any)?.domain,
      orgName: budget.business_entity_name || undefined,
      variables:{
        budgetId: String(budget.budget_id),
        budgetName: budget.budget_name,
        requestorName: user.name || username,
        orgLogoPath: orgData.org_logo_path,
        emailApprovalLink:approvalLink,
      },
      emailApprovalLink:approvalLink,
    });
  }

  await repo.insertApprovalHistory({
    objectId: String(budgetId),
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
  const currentApprover = await userRepository.findUserByUsername(wfStepInstance.current_assignee);
  if (result.toLowerCase() === "approve") {
    const currentApprovers = budget.approvers_list;
     if (currentApprovers) {
      let newApprovers = currentApprovers;
      
      if (currentApprovers.includes(",")) {
        if((wfStepInstance.assignment_type === "ROLE" && userRoles.includes(wfStepInstance.current_assignee))){
          newApprovers = currentApprovers.replace(`${wfStepInstance.current_assignee},`, "").replace(`, ${wfStepInstance.current_assignee}`, "");
        }else if((wfStepInstance.assignment_type === "USER" && user.email_id === wfStepInstance.current_assignee)){
          newApprovers = currentApprovers.replace(`${user.name},`, "").replace(`, ${user.name}`, "");
        }else if(wfStepInstance.assignment_type === "USER_HIERARCHY"){
          newApprovers = currentApprovers.replace("Manager,", "").replace(", Manager", "");
        }else if(userRoles.includes("ROLE_SUPERADMIN") || userRoles.includes("SUPERADMIN")){
          if(wfStepInstance.assignment_type === "ROLE"){
            newApprovers = currentApprovers.replace(`${wfStepInstance.current_assignee},`, "").replace(`, ${wfStepInstance.current_assignee}`, "");
          }else if(wfStepInstance.assignment_type === "USER"){
            newApprovers = currentApprovers.replace(`${currentApprover.name},`, "").replace(`, ${currentApprover.name}`, "");
          }
        }
      } else {
        if((wfStepInstance.assignment_type === "ROLE" && userRoles.includes(wfStepInstance.current_assignee))){
          newApprovers = currentApprovers.replace(`${wfStepInstance.current_assignee}`, "");
        }else if((wfStepInstance.assignment_type === "USER" && user.email_id === wfStepInstance.current_assignee)){
          newApprovers = currentApprovers.replace(`${user.name}`, "");
        }else if(wfStepInstance.assignment_type === "USER_HIERARCHY"){
          newApprovers = "";
        }else if(userRoles.includes("ROLE_SUPERADMIN") || userRoles.includes("SUPERADMIN")){
          if(wfStepInstance.assignment_type === "ROLE"){
          newApprovers = currentApprovers.replace(`${wfStepInstance.current_assignee}`, "");
          }else if(wfStepInstance.assignment_type === "USER"){
            newApprovers = currentApprovers.replace(`${currentApprover.name}`, "");
          }
        }
      }
      await repo.updateBudgetApproversList(budgetId, newApprovers);
    }
  }

  return { success: true, message: "Successfully processed your request.", nextTaskId: ntaskId };
}

const ALLOWED_EXTENSIONS_SERVER = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'
];
const BLOCKED_EXTENSIONS_SERVER = [
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif', '.vbs', '.js', '.jse',
  '.ws', '.wsf', '.wsc', '.wsh', '.ps1', '.ps2', '.psc1', '.psc2', '.msc', '.msp',
  '.dll', '.sys', '.drv', '.ocx', '.cpl', '.inf', '.reg', '.jar', '.sh', '.bash',
  '.php', '.asp', '.aspx', '.py', '.pl', '.rb', '.htm', '.html', '.hta'
];

export function validateDocumentFileName(fileName: string) {
  if (!fileName || typeof fileName !== 'string') {
    throw { status: 400, message: "File name is required" };
  }

  const fileNameLower = fileName.toLowerCase();
  const extension = fileNameLower.substring(fileNameLower.lastIndexOf('.'));

  if (BLOCKED_EXTENSIONS_SERVER.includes(extension)) {
    throw { status: 400, message: `File type "${extension}" is not allowed for security reasons` };
  }

  if (!ALLOWED_EXTENSIONS_SERVER.includes(extension)) {
    throw { status: 400, message: `File type "${extension}" is not supported` };
  }

  const dangerousChars = /[<>:"/\\|?*\x00-\x1f]/;
  if (dangerousChars.test(fileName)) {
    throw { status: 400, message: "File name contains invalid characters" };
  }

  const parts = fileNameLower.split('.');
  if (parts.length > 2) {
    const secondToLast = '.' + parts[parts.length - 2];
    if (BLOCKED_EXTENSIONS_SERVER.includes(secondToLast)) {
      throw { status: 400, message: "File appears to have a hidden dangerous extension" };
    }
  }
}

export async function getDocuments(budgetId: string) {
  return repo.getBudgetDocuments(budgetId);
}

export async function addDocument(budgetId: string, file: Express.Multer.File, createdBy: string, tenant?: string) {
  const { uploadFileToAzure } = await import("../../services/azure-blob.service");
  const { sanitizeFilename, DANGEROUS_EXTENSIONS } = await import("../_shared/file-upload");
  const pathModule = await import("path");

  if (file.size === 0) throw { status: 400, message: "File is empty" };
  if (file.size > 5 * 1024 * 1024) throw { status: 400, message: "File exceeds 5 MB limit" };

  const ext = pathModule.default.extname(file.originalname).toLowerCase();
  if (DANGEROUS_EXTENSIONS.has(ext)) throw { status: 400, message: `File type "${ext}" is not allowed` };

  const safeFilename = sanitizeFilename(file.originalname);
  const filePath = await uploadFileToAzure(file.buffer, `BUDGETS/${budgetId}/collaboration`, safeFilename, file.mimetype, tenant);
  const id = await repo.addBudgetDocument(budgetId, {
    fileName: file.originalname,
    filePath,
    createdBy,
  });
  return { id };
}

export async function deleteDocument(budgetId: string, docId: string) {
  await repo.deleteBudgetDocument(budgetId, docId);
}

const COLLAB_MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

export async function downloadCollaborationDocument(docId: string) {
  const pathModule = await import("path");
  const doc = await repo.getCollaborationDocumentById(docId);
  if (!doc) throw { status: 404, message: "Document not found" };
  if (!doc.file_path) throw { status: 404, message: "No file available for download" };
  const ext = pathModule.default.extname(doc.file_name || "").toLowerCase();
  const mimeType = COLLAB_MIME_MAP[ext] || "application/octet-stream";
  return { blobUrl: doc.file_path, mimeType, filename: doc.file_name || "document" };
}

export async function getNotes(budgetId: string) {
  const notes = await repo.getBudgetNotes(budgetId);
  return { notes };
}

export async function updateNotes(budgetId: string, notes: string) {
  await repo.updateBudgetNotes(budgetId, notes);
}

export async function getComments(budgetId: string) {
  return repo.getBudgetComments(budgetId);
}

export async function addComment(budgetId: string, body: any, user?: any) {
  const id = await repo.addBudgetComment(budgetId, {
    comments: body.comments,
    createdBy: user?.id || body.created_by || "system",
    createdByName: user?.name || body.created_by_name || "Unknown"
  });
  return { id };
}

export async function deleteComment(budgetId: string, commentId: string) {
  await repo.deleteBudgetComment(budgetId, commentId);
}

export async function addLine(budgetId: string, body: any) {
  const check = await repo.getBudgetStatus(budgetId);
  validateBudgetIsEditable(check);
  validateBudgetLineTotalAmount(body.amount);

  const lineId = await repo.addBudgetLine(budgetId, {
    costCenterId: body.cost_center_id,
    costCenterCode: body.cost_center_code,
    costCenterName: body.cost_center_name,
    amount: body.amount,
    description: body.description,
    locationIds: body.location_ids,
    departmentIds: body.department_ids,
    periodAmts: body.period_amounts
  });

  await repo.updateBudgetTotalAmount(budgetId);
  return { id: lineId };
}

export async function updateLine(budgetId: string, lineId: string, body: any) {
  const check = await repo.getBudgetStatus(budgetId);
  validateBudgetIsEditable(check);
  validateBudgetLineTotalAmount(body.amount);

  await repo.updateBudgetLine(budgetId, lineId, {
    costCenterId: body.cost_center_id,
    costCenterCode: body.cost_center_code,
    costCenterName: body.cost_center_name,
    amount: body.amount,
    description: body.description,
    locationIds: body.location_ids,
    departmentIds: body.department_ids,
    periodAmts: body.period_amounts
  });

  await repo.updateBudgetTotalAmount(budgetId);
}

export async function deleteLine(budgetId: string, lineId: string) {
  const check = await repo.getBudgetStatus(budgetId);
  if (!check) throw { status: 404, message: "Budget not found" };

  await repo.deleteBudgetLine(budgetId, lineId);
  await repo.updateBudgetTotalAmount(budgetId);
}

export async function copyLine(budgetId: string, lineId: string) {
  const check = await repo.getBudgetStatus(budgetId);
  if (!check) throw { status: 404, message: "Budget not found" };
  validateBudgetIsEditable(check);

  const existingLine = await repo.getBudgetLineById(lineId, budgetId);
  if (!existingLine) throw { status: 404, message: "Budget line not found" };

  const newLineId = await repo.copyBudgetLine(budgetId, existingLine);
  await repo.updateBudgetTotalAmount(budgetId);
  return { id: newLineId };
}

export async function getBudgetDetail(id: string) {
  return repo.getBudgetDetail(id);
}

export async function bulkImportBudgets(file: Express.Multer.File, reqUser: any) {
  const filename = file.originalname.toLowerCase();
  if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
    throw { status: 400, message: 'Only Excel files (.xlsx, .xls) are supported' };
  }

  const XLSX = await import('xlsx');
  const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw { status: 400, message: 'Excel file has no sheets' };

  const sheet = workbook.Sheets[sheetName];
  // Use header:1 to get raw arrays — avoids any object-key serialization issues
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
  if (rawRows.length < 2) throw { status: 400, message: 'Excel file must have a header row and at least one data row' };

  // Normalise a header label for matching
  const normHdr = (v: any) => String(v ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[\s_\-]+/g, ' ').trim();

  // Detect column indices from header row
  const hdr = rawRows[0].map(normHdr);
  const findCol = (...names: string[]): number => {
    for (const n of names) {
      const idx = hdr.indexOf(normHdr(n));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  const cols = {
    budgetName:     findCol('Budget Name', 'budget_name'),
    description:    findCol('Description', 'notes'),
    period:         findCol('Period'),
    startDate:      findCol('Start Date', 'start_date'),
    endDate:        findCol('End Date', 'end_date'),
    budgetOwner:    findCol('Budget Owner', 'budget_owner'),
    businessEntity: findCol('Business Entity', 'business_entity'),
    costCenterCode: findCol('Cost Center Code', 'cost_center_code', 'cost center'),
    amount:         findCol('Amount'),
    location:       findCol('Location', 'loc'),
    department:     findCol('Department', 'dept'),
  };

  const getCell = (row: any[], idx: number): string => {
    if (idx === -1 || row[idx] === undefined || row[idx] === null) return '';
    return String(row[idx]).trim();
  };

  const normalizeDate = (val: string): string => {
    if (!val) return '';
    // DD/MM/YYYY or D/M/YYYY
    const m1 = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m1) {
      const d = new Date(`${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    // DD-MM-YYYY
    const m2 = val.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m2) {
      const d = new Date(`${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch { /* */ }
    return '';
  };

  const [periods, entities, users, costCenters, locations, departments] = await Promise.all([
    repo.getPeriods(),
    repo.getBusinessEntities(),
    repo.getOrgUsers(),
    repo.getCostCenters(),
    repo.getLocations(),
    repo.getDepartments()
  ]);

  const periodMap        = new Map<string, any>(periods.map((p: any)   => [p.period_name.toLowerCase().trim(), p]));
  const entityMap        = new Map<string, any>(entities.map((e: any)  => [e.name.toLowerCase().trim(), e]));
  const userMap          = new Map<string, any>(users.map((u: any)     => [u.name.toLowerCase().trim(), u]));
  const costCenterMap    = new Map<string, any>(costCenters.map((cc: any) => [cc.code.toLowerCase().trim(), cc]));
  const costCenterByName = new Map<string, any>(costCenters.map((cc: any) => [cc.name.toLowerCase().trim(), cc]));
  const locationMap      = new Map<string, any>(locations.map((l: any) => [l.name.toLowerCase().trim(), l]));
  const departmentMap    = new Map<string, any>();
  for (const d of departments) {
    departmentMap.set((d.name as string).toLowerCase().trim(), d);
    if (d.code) departmentMap.set((d.code as string).toLowerCase().trim(), d);
  }

  // Data rows start at index 1; skip entirely blank rows
  const dataRows = rawRows.slice(1).map((r, i) => ({ row: r, rowNum: i + 2 }))
    .filter(({ row }) => row.some(c => c !== undefined && c !== null && String(c).trim() !== ''));

  if (dataRows.length === 0) {
    throw { status: 400, message: 'Excel file contains no data rows' };
  }

  // Group by Budget Name + Budget Owner + Business Entity + Period
  const budgetGroups = new Map<string, { row: any[]; rowNum: number }[]>();
  for (const { row, rowNum } of dataRows) {
    const budgetName = getCell(row, cols.budgetName);
    if (!budgetName) continue;
    const groupKey = [
      budgetName,
      getCell(row, cols.budgetOwner),
      getCell(row, cols.businessEntity),
      getCell(row, cols.period),
    ].join('||');
    if (!budgetGroups.has(groupKey)) budgetGroups.set(groupKey, []);
    budgetGroups.get(groupKey)!.push({ row, rowNum });
  }

  if (budgetGroups.size === 0) {
    throw { status: 400, message: 'No budget data found. Ensure the "Budget Name" column has values.' };
  }

  const results: {
    budgetName: string; success: boolean;
    budgetId?: string; id?: number; linesCreated?: number; errors?: string[];
  }[] = [];
  let totalCreated = 0;
  let totalErrors = 0;
  const createdBy = reqUser?.userName || reqUser?.user_name || reqUser?.email || 'system';

  for (const [, entries] of Array.from(budgetGroups.entries())) {
    const budgetName = getCell(entries[0].row, cols.budgetName);
    const errors: string[] = [];
    const firstRow = entries[0].row;

    const description  = getCell(firstRow, cols.description);
    const periodName   = getCell(firstRow, cols.period);
    const startDateRaw = getCell(firstRow, cols.startDate);
    const endDateRaw   = getCell(firstRow, cols.endDate);
    const ownerName    = getCell(firstRow, cols.budgetOwner);
    const entityName   = getCell(firstRow, cols.businessEntity);

    if (!periodName)   errors.push('Period is required');
    if (!startDateRaw) errors.push('Start Date is required');
    if (!endDateRaw)   errors.push('End Date is required');

    let period: any = null;
    if (periodName) {
      period = periodMap.get(periodName.toLowerCase());
      if (!period) errors.push(`Period "${periodName}" not found.`);
    }

    let entity: any = null;
    if (entityName) {
      entity = entityMap.get(entityName.toLowerCase());
      if (!entity) errors.push(`Business Entity "${entityName}" not found`);
    }

    let owner: any = null;
    if (ownerName) {
      owner = userMap.get(ownerName.toLowerCase());
      if (!owner) errors.push(`Budget Owner "${ownerName}" not found`);
    }

    const startDate = normalizeDate(startDateRaw);
    const endDate   = normalizeDate(endDateRaw);
    if (startDateRaw && !startDate) errors.push(`Invalid Start Date: "${startDateRaw}"`);
    if (endDateRaw   && !endDate)   errors.push(`Invalid End Date: "${endDateRaw}"`);

    const validLines: { cc: any; amount: number; location: any; department: any; lineDescription: string }[] = [];
    for (const { row: lineRow, rowNum } of entries) {
      const ccCode          = getCell(lineRow, cols.costCenterCode);
      const amountStr       = getCell(lineRow, cols.amount);
      const lineDescription = getCell(lineRow, cols.description);

      if (!ccCode) {
        errors.push(`Row ${rowNum}: Cost Center Code is required`);
        continue;
      }
      const cc = costCenterMap.get(ccCode.toLowerCase()) || costCenterByName.get(ccCode.toLowerCase());
      if (!cc) {
        errors.push(`Row ${rowNum}: Cost Center "${ccCode}" not found (match by code or name)`);
        continue;
      }
      const amount = parseFloat(amountStr.replace(/,/g, '')) || 0;
      if (amount <= 0) {
        errors.push(`Row ${rowNum}: Amount must be greater than 0`);
        continue;
      }

      const locName  = getCell(lineRow, cols.location);
      const deptName = getCell(lineRow, cols.department);

      let location: any = null;
      if (locName) {
        location = locationMap.get(locName.toLowerCase());
        if (!location) {
          errors.push(`Row ${rowNum}: Location "${locName}" not found.`);
          continue;
        }
      }

      let department: any = null;
      if (deptName) {
        department = departmentMap.get(deptName.toLowerCase());
        if (!department) {
          const avail = Array.from(new Set(departments.map((d: any) => d.name as string))).slice(0, 8).join(', ');
          errors.push(`Row ${rowNum}: Department "${deptName}" not found.`);
          continue;
        }
      }

      validLines.push({ cc, amount, location, department, lineDescription });
    }

    if (errors.length > 0) {
      results.push({ budgetName, success: false, errors });
      totalErrors++;
      continue;
    }
    if (validLines.length === 0) {
      results.push({ budgetName, success: false, errors: ['No valid budget lines found'] });
      totalErrors++;
      continue;
    }

    try {
      const budgetId = await repo.getNextBudgetIdFromSequence();
      const budget = await repo.createBudget({
        budgetId, budgetName,
        businessEntity: entity?.id || '',
        businessEntityName: entity?.name || entityName || '',
        budgetOwnerId: owner?.id || reqUser?.id || 0,
        budgetOwnerName: owner?.name || ownerName || reqUser?.name || '',
        periodMstId: period?.id || 1,
        startDate, endDate, createdBy
      });
      const internalId = budget.id;

      if (description) await repo.updateBudgetNotes(String(internalId), description);
      let linesCreated = 0;
      for (const line of validLines) {
  
        await repo.addBudgetLine(String(internalId), {
          costCenterId: line.cc.id,
          costCenterCode: line.cc.code,
          costCenterName: line.cc.name,
          amount: line.amount,
          description: line.lineDescription || undefined,
          locationIds: line.location ? [line.location.id] : undefined,
          departmentIds: line.department ? [line.department.id] : undefined,
        });
        linesCreated++;
      }
      await repo.updateBudgetTotalAmount(String(internalId));
      results.push({ budgetName, success: true, budgetId, id: internalId, linesCreated });
      totalCreated++;
    } catch (err: any) {
      results.push({ budgetName, success: false, errors: [err.message || 'Failed to create budget'] });
      totalErrors++;
    }
  }

  return { created: totalCreated, errors: totalErrors, total: budgetGroups.size, results };
}

export async function validateBulkImport(file: Express.Multer.File): Promise<{
  total: number; valid: number; invalid: number;
  results: { budgetName: string; valid: boolean; lineCount: number; errors: string[] }[];
}> {
  const filename = file.originalname.toLowerCase();
  if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
    throw { status: 400, message: 'Only Excel files (.xlsx, .xls) are supported' };
  }

  const XLSX = await import('xlsx');
  const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw { status: 400, message: 'Excel file has no sheets' };

  const sheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
  if (rawRows.length < 2) throw { status: 400, message: 'Excel file must have a header row and at least one data row' };

  const normHdr = (v: any) => String(v ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[\s_\-]+/g, ' ').trim();
  const hdr = rawRows[0].map(normHdr);
  const findCol = (...names: string[]): number => {
    for (const n of names) { const idx = hdr.indexOf(normHdr(n)); if (idx !== -1) return idx; }
    return -1;
  };
  const cols = {
    budgetName:     findCol('Budget Name', 'budget_name'),
    period:         findCol('Period'),
    startDate:      findCol('Start Date', 'start_date'),
    endDate:        findCol('End Date', 'end_date'),
    budgetOwner:    findCol('Budget Owner', 'budget_owner'),
    businessEntity: findCol('Business Entity', 'business_entity'),
    costCenterCode: findCol('Cost Center Code', 'cost_center_code', 'cost center'),
    amount:         findCol('Amount'),
    location:       findCol('Location', 'loc'),
    department:     findCol('Department', 'dept'),
  };

  const getCell = (row: any[], idx: number): string => {
    if (idx === -1 || row[idx] === undefined || row[idx] === null) return '';
    return String(row[idx]).trim();
  };

  const normalizeDate = (val: string): string => {
    if (!val) return '';
    const m1 = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m1) { const d = new Date(`${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`); if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]; }
    const m2 = val.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m2) { const d = new Date(`${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`); if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]; }
    try { const d = new Date(val); if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]; } catch { /* */ }
    return '';
  };

  const [periods, entities, users, costCenters, locations, departments] = await Promise.all([
    repo.getPeriods(), repo.getBusinessEntities(), repo.getOrgUsers(),
    repo.getCostCenters(), repo.getLocations(), repo.getDepartments()
  ]);

  const periodMap        = new Map<string, any>(periods.map((p: any)   => [p.period_name.toLowerCase().trim(), p]));
  const entityMap        = new Map<string, any>(entities.map((e: any)  => [e.name.toLowerCase().trim(), e]));
  const userMap          = new Map<string, any>(users.map((u: any)     => [u.name.toLowerCase().trim(), u]));
  const costCenterMap    = new Map<string, any>(costCenters.map((cc: any) => [cc.code.toLowerCase().trim(), cc]));
  const costCenterByName = new Map<string, any>(costCenters.map((cc: any) => [cc.name.toLowerCase().trim(), cc]));
  const locationMap      = new Map<string, any>(locations.map((l: any) => [l.name.toLowerCase().trim(), l]));
  const departmentMap    = new Map<string, any>();
  for (const d of departments) {
    departmentMap.set((d.name as string).toLowerCase().trim(), d);
    if (d.code) departmentMap.set((d.code as string).toLowerCase().trim(), d);
  }

  const dataRows = rawRows.slice(1).map((r, i) => ({ row: r, rowNum: i + 2 }))
    .filter(({ row }) => row.some(c => c !== undefined && c !== null && String(c).trim() !== ''));
  if (dataRows.length === 0) throw { status: 400, message: 'Excel file contains no data rows' };

  const budgetGroups = new Map<string, { row: any[]; rowNum: number }[]>();
  for (const { row, rowNum } of dataRows) {
    const budgetName = getCell(row, cols.budgetName);
    if (!budgetName) continue;
    const groupKey = [budgetName, getCell(row, cols.budgetOwner), getCell(row, cols.businessEntity), getCell(row, cols.period)].join('||');
    if (!budgetGroups.has(groupKey)) budgetGroups.set(groupKey, []);
    budgetGroups.get(groupKey)!.push({ row, rowNum });
  }
  if (budgetGroups.size === 0) throw { status: 400, message: 'No budget data found. Ensure the "Budget Name" column has values.' };

  const results: { budgetName: string; valid: boolean; lineCount: number; errors: string[] }[] = [];
  let totalValid = 0;
  let totalInvalid = 0;

  for (const [, entries] of Array.from(budgetGroups.entries())) {
    const budgetName = getCell(entries[0].row, cols.budgetName);
    const errors: string[] = [];
    const firstRow = entries[0].row;

    const periodName   = getCell(firstRow, cols.period);
    const startDateRaw = getCell(firstRow, cols.startDate);
    const endDateRaw   = getCell(firstRow, cols.endDate);
    const ownerName    = getCell(firstRow, cols.budgetOwner);
    const entityName   = getCell(firstRow, cols.businessEntity);

    if (!periodName)   errors.push('Period is required');
    if (!startDateRaw) errors.push('Start Date is required');
    if (!endDateRaw)   errors.push('End Date is required');
    if (periodName && !periodMap.get(periodName.toLowerCase())) errors.push(`Period "${periodName}" not found`);
    if (entityName && !entityMap.get(entityName.toLowerCase())) errors.push(`Business Entity "${entityName}" not found`);
    if (ownerName && !userMap.get(ownerName.toLowerCase())) errors.push(`Budget Owner "${ownerName}" not found`);
    const startDate = normalizeDate(startDateRaw);
    const endDate   = normalizeDate(endDateRaw);
    if (startDateRaw && !startDate) errors.push(`Invalid Start Date: "${startDateRaw}"`);
    if (endDateRaw   && !endDate)   errors.push(`Invalid End Date: "${endDateRaw}"`);

    let validLineCount = 0;
    for (const { row: lineRow, rowNum } of entries) {
      const ccCode    = getCell(lineRow, cols.costCenterCode);
      const amountStr = getCell(lineRow, cols.amount);
      if (!ccCode) { errors.push(`Row ${rowNum}: Cost Center Code is required`); continue; }
      const cc = costCenterMap.get(ccCode.toLowerCase()) || costCenterByName.get(ccCode.toLowerCase());
      if (!cc) { errors.push(`Row ${rowNum}: Cost Center "${ccCode}" not found`); continue; }
      const amount = parseFloat(amountStr.replace(/,/g, '')) || 0;
      if (amount <= 0) { errors.push(`Row ${rowNum}: Amount must be greater than 0`); continue; }
      const locName  = getCell(lineRow, cols.location);
      const deptName = getCell(lineRow, cols.department);
      if (locName && !locationMap.get(locName.toLowerCase())) { errors.push(`Row ${rowNum}: Location "${locName}" not found`); continue; }
      if (deptName && !departmentMap.get(deptName.toLowerCase())) { errors.push(`Row ${rowNum}: Department "${deptName}" not found`); continue; }
      validLineCount++;
    }

    if (errors.length > 0 || validLineCount === 0) {
      if (validLineCount === 0 && errors.length === 0) errors.push('No valid budget lines found');
      results.push({ budgetName, valid: false, lineCount: 0, errors });
      totalInvalid++;
    } else {
      results.push({ budgetName, valid: true, lineCount: validLineCount, errors: [] });
      totalValid++;
    }
  }

  return { total: budgetGroups.size, valid: totalValid, invalid: totalInvalid, results };
}

export async function downloadBulkImportTemplate(): Promise<Buffer> {
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;

  const [periods, entities, locations, departments, costCenters, users] = await Promise.all([
    repo.getPeriods(),
    repo.getBusinessEntities(),
    repo.getLocations(),
    repo.getDepartments(),
    repo.getCostCenters(),
    repo.getOrgUsers(),
  ]);

  const wb = new ExcelJS.Workbook();

  // Main sheet must be first so the bulk import parser reads it via SheetNames[0]
  const ws = wb.addWorksheet('Budget Import');

  const headers = [
    'Budget Name', 'Description', 'Period', 'Start Date', 'End Date',
    'Budget Owner', 'Business Entity', 'Cost Center Code', 'Amount', 'Location', 'Department',
  ];

  ws.columns = headers.map(h => ({ width: Math.max(h.length + 4, 20) }));

  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    cell.border = { bottom: { style: 'thin' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 20;

  // Sample rows using first real DB values so they pass validation
  const p0 = periods[0]?.period_name || '';
  const p1 = periods[1]?.period_name || p0;
  const u0 = users[0]?.name || '';
  const e0 = entities[0]?.name || '';
  const l0 = locations[0]?.name || '';
  const l1 = locations[1]?.name || l0;
  const d0 = departments[0]?.name || '';
  const cc0 = costCenters[0]?.name || '';
  const cc1 = costCenters[1]?.name || cc0;
  const cc2 = costCenters[2]?.name || cc0;

  [
    ['IT Department Budget 2025', 'Annual IT spending', p0, new Date('2025-01-01'), new Date('2025-12-31'), u0, e0, cc0, '50000', l0, d0],
    ['HR Budget Q1 2025', 'Q1 HR operations', p1, new Date('2025-01-01'), new Date('2025-03-31'), u0, e0, cc2, '25000', l0, ''],
  ].forEach(row => ws.addRow(row));

  // Format Start Date (D) and End Date (E) columns as date with calendar picker
  ws.getColumn('D').numFmt = 'yyyy-mm-dd';
  ws.getColumn('E').numFmt = 'yyyy-mm-dd';

  // Hidden reference sheet with real-time dropdown values
  const refSheet = wb.addWorksheet('Reference Data');
  refSheet.state = 'hidden';

  refSheet.addRow(['Period', 'Business Entity', 'Location', 'Department', 'Cost Center Name', 'Budget Owner']);

  const maxLen = Math.max(periods.length, entities.length, locations.length, departments.length, costCenters.length, users.length);
  for (let i = 0; i < maxLen; i++) {
    refSheet.addRow([
      i < periods.length     ? periods[i].period_name  : '',
      i < entities.length    ? entities[i].name        : '',
      i < locations.length   ? locations[i].name       : '',
      i < departments.length ? departments[i].name     : '',
      i < costCenters.length ? costCenters[i].name     : '',
      i < users.length       ? users[i].name           : '',
    ]);
  }

  const DATA_ROWS = 1000;
  // dataValidations exists at runtime but is not in the exceljs 4.x type definitions
  const dv = (ws as any).dataValidations;

  // Period → column C
  if (periods.length > 0) {
    dv.add(`C2:C${DATA_ROWS}`, {
      type: 'list', allowBlank: true,
      formulae: [`'Reference Data'!$A$2:$A$${periods.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Invalid Period',
      error: 'Please select a valid period from the dropdown.',
    });
  }

  // Start Date → column D (date format triggers calendar picker in Excel)
  dv.add(`D2:D${DATA_ROWS}`, {
    type: 'date', allowBlank: true,
    operator: 'greaterThan',
    formulae: [new Date('1900-01-01')],
    showErrorMessage: true, errorStyle: 'warning',
    errorTitle: 'Invalid Date',
    error: 'Please enter a valid date (YYYY-MM-DD).',
  });

  // End Date → column E
  dv.add(`E2:E${DATA_ROWS}`, {
    type: 'date', allowBlank: true,
    operator: 'greaterThan',
    formulae: [new Date('1900-01-01')],
    showErrorMessage: true, errorStyle: 'warning',
    errorTitle: 'Invalid Date',
    error: 'Please enter a valid date (YYYY-MM-DD).',
  });

  // Budget Owner → column F
  if (users.length > 0) {
    dv.add(`F2:F${DATA_ROWS}`, {
      type: 'list', allowBlank: true,
      formulae: [`'Reference Data'!$F$2:$F$${users.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Invalid Budget Owner',
      error: 'Please select a valid budget owner from the dropdown.',
    });
  }

  // Business Entity → column G
  if (entities.length > 0) {
    dv.add(`G2:G${DATA_ROWS}`, {
      type: 'list', allowBlank: true,
      formulae: [`'Reference Data'!$B$2:$B$${entities.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Invalid Business Entity',
      error: 'Please select a valid business entity from the dropdown.',
    });
  }

  // Cost Center Code → column H (matched by name in import parser)
  if (costCenters.length > 0) {
    dv.add(`H2:H${DATA_ROWS}`, {
      type: 'list', allowBlank: true,
      formulae: [`'Reference Data'!$E$2:$E$${costCenters.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Invalid Cost Center',
      error: 'Please select a valid cost center from the dropdown.',
    });
  }

  // Location → column J
  if (locations.length > 0) {
    dv.add(`J2:J${DATA_ROWS}`, {
      type: 'list', allowBlank: true,
      formulae: [`'Reference Data'!$C$2:$C$${locations.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Invalid Location',
      error: 'Please select a valid location from the dropdown.',
    });
  }

  // Department → column K
  if (departments.length > 0) {
    dv.add(`K2:K${DATA_ROWS}`, {
      type: 'list', allowBlank: true,
      formulae: [`'Reference Data'!$D$2:$D$${departments.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Invalid Department',
      error: 'Please select a valid department from the dropdown.',
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function downloadBudgetLinesTemplate(_budgetId: string): Promise<Buffer> {
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;

  const [costCenters, locations, departments] = await Promise.all([
    repo.getCostCenters(),
    repo.getLocations(),
    repo.getDepartments(),
  ]);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Budget Lines Import');

  const headers = ['Cost Center Name', 'Amount', 'Description', 'Location', 'Department'];
  ws.columns = headers.map(h => ({ width: Math.max(h.length + 4, 22) }));

  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    cell.border = { bottom: { style: 'thin' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 20;

  const ccn0 = costCenters[0]?.name || '';
  const ccn1 = (costCenters[1] ?? costCenters[0])?.name || '';
  const l0 = locations[0]?.name || '';
  const d0 = departments[0]?.name || '';

  [
    [ccn0, '50000', 'Sample description', l0, d0],
    [ccn1, '25000', '', '', ''],
  ].forEach(row => ws.addRow(row));

  const refSheet = wb.addWorksheet('Reference Data');
  refSheet.state = 'hidden';
  refSheet.addRow(['Cost Center Name', 'Location', 'Department']);

  const maxLen = Math.max(costCenters.length, locations.length, departments.length);
  for (let i = 0; i < maxLen; i++) {
    refSheet.addRow([
      i < costCenters.length ? costCenters[i].name : '',
      i < locations.length ? locations[i].name : '',
      i < departments.length ? departments[i].name : '',
    ]);
  }

  const DATA_ROWS = 1000;
  const dv = (ws as any).dataValidations;

  if (costCenters.length > 0) {
    dv.add(`A2:A${DATA_ROWS}`, {
      type: 'list', allowBlank: true,
      formulae: [`'Reference Data'!$A$2:$A$${costCenters.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Invalid Cost Center Name',
      error: 'Please select a valid cost center name from the dropdown.',
    });
  }

  if (locations.length > 0) {
    dv.add(`D2:D${DATA_ROWS}`, {
      type: 'list', allowBlank: true,
      formulae: [`'Reference Data'!$B$2:$B$${locations.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Invalid Location',
      error: 'Please select a valid location from the dropdown.',
    });
  }

  if (departments.length > 0) {
    dv.add(`E2:E${DATA_ROWS}`, {
      type: 'list', allowBlank: true,
      formulae: [`'Reference Data'!$C$2:$C$${departments.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Invalid Department',
      error: 'Please select a valid department from the dropdown.',
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function validateBulkLinesImport(budgetId: string, file: Express.Multer.File): Promise<{
  total: number; valid: number; invalid: number;
  results: { rowNumber: number; costCenterName: string; amount: number; description: string; valid: boolean; errors: string[] }[];
}> {
  const check = await repo.getBudgetStatus(budgetId);
  validateBudgetIsEditable(check);

  const filename = file.originalname.toLowerCase();
  if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
    throw { status: 400, message: 'Only Excel files (.xlsx, .xls) are supported' };
  }

  const XLSX = await import('xlsx');
  const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw { status: 400, message: 'Excel file has no sheets' };

  const sheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  if (rawRows.length < 2) throw { status: 400, message: 'Excel file must have a header row and at least one data row' };

  const normHdr = (v: any) => String(v ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[\s_\-]+/g, ' ').trim();
  const hdr = rawRows[0].map(normHdr);
  const findCol = (...names: string[]): number => {
    for (const n of names) { const idx = hdr.indexOf(normHdr(n)); if (idx !== -1) return idx; }
    return -1;
  };
  const cols = {
    costCenterName: findCol('Cost Center Name', 'cost_center_name', 'name', 'Cost Center'),
    amount:         findCol('Amount'),
    description:    findCol('Description', 'desc', 'notes'),
    location:       findCol('Location', 'loc'),
    department:     findCol('Department', 'dept'),
  };

  const getCell = (row: any[], idx: number): string => {
    if (idx === -1 || row[idx] === undefined || row[idx] === null) return '';
    return String(row[idx]).trim();
  };

  const [costCenters, locations, departments] = await Promise.all([
    repo.getCostCenters(), repo.getLocations(), repo.getDepartments(),
  ]);

  const costCenterByName = new Map<string, any>(costCenters.map((cc: any) => [cc.name.toLowerCase().trim(), cc]));
  const locationMap = new Map<string, any>(locations.map((l: any) => [l.name.toLowerCase().trim(), l]));
  const departmentMap = new Map<string, any>();
  for (const d of departments) {
    departmentMap.set((d.name as string).toLowerCase().trim(), d);
    if (d.code) departmentMap.set((d.code as string).toLowerCase().trim(), d);
  }

  const dataRows = rawRows.slice(1).map((r, i) => ({ row: r, rowNum: i + 2 }))
    .filter(({ row }) => row.some(c => c !== undefined && c !== null && String(c).trim() !== ''));
  if (dataRows.length === 0) throw { status: 400, message: 'Excel file contains no data rows' };

  const results: { rowNumber: number; costCenterName: string; amount: number; description: string; valid: boolean; errors: string[] }[] = [];
  let totalValid = 0;
  let totalInvalid = 0;

  for (const { row, rowNum } of dataRows) {
    const ccName    = getCell(row, cols.costCenterName);
    const amountStr = getCell(row, cols.amount);
    const description = getCell(row, cols.description);
    const locName   = getCell(row, cols.location);
    const deptName  = getCell(row, cols.department);
    const rowErrors: string[] = [];

    const cc = costCenterByName.get(ccName.toLowerCase());
    if (!ccName) rowErrors.push('Cost Center Name is required');
    else if (!cc) rowErrors.push(`Cost Center "${ccName}" not found`);

    const amount = parseFloat(amountStr.replace(/,/g, '')) || 0;
    if (!amountStr) rowErrors.push('Amount is required');
    else if (amount <= 0) rowErrors.push('Amount must be greater than 0');

    if (locName && !locationMap.get(locName.toLowerCase())) rowErrors.push(`Location "${locName}" not found`);
    if (deptName && !departmentMap.get(deptName.toLowerCase())) rowErrors.push(`Department "${deptName}" not found`);

    if (rowErrors.length > 0) {
      results.push({ rowNumber: rowNum, costCenterName: ccName, amount, description, valid: false, errors: rowErrors });
      totalInvalid++;
    } else {
      results.push({ rowNumber: rowNum, costCenterName: ccName, amount, description, valid: true, errors: [] });
      totalValid++;
    }
  }

  return { total: dataRows.length, valid: totalValid, invalid: totalInvalid, results };
}

export async function bulkImportBudgetLines(budgetId: string, file: Express.Multer.File, _reqUser: any): Promise<{
  created: number; errors: number; total: number;
  results: { rowNumber: number; costCenterName: string; success: boolean; lineId?: number; errors?: string[] }[];
}> {
  const check = await repo.getBudgetStatus(budgetId);
  validateBudgetIsEditable(check);

  const filename = file.originalname.toLowerCase();
  if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
    throw { status: 400, message: 'Only Excel files (.xlsx, .xls) are supported' };
  }

  const XLSX = await import('xlsx');
  const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw { status: 400, message: 'Excel file has no sheets' };

  const sheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  if (rawRows.length < 2) throw { status: 400, message: 'Excel file must have a header row and at least one data row' };

  const normHdr = (v: any) => String(v ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[\s_\-]+/g, ' ').trim();
  const hdr = rawRows[0].map(normHdr);
  const findCol = (...names: string[]): number => {
    for (const n of names) { const idx = hdr.indexOf(normHdr(n)); if (idx !== -1) return idx; }
    return -1;
  };
  const cols = {
    costCenterName: findCol('Cost Center Name', 'cost_center_name', 'name', 'Cost Center'),
    amount:         findCol('Amount'),
    description:    findCol('Description', 'desc', 'notes'),
    location:       findCol('Location', 'loc'),
    department:     findCol('Department', 'dept'),
  };

  const getCell = (row: any[], idx: number): string => {
    if (idx === -1 || row[idx] === undefined || row[idx] === null) return '';
    return String(row[idx]).trim();
  };

  const [costCenters, locations, departments] = await Promise.all([
    repo.getCostCenters(), repo.getLocations(), repo.getDepartments(),
  ]);

  const costCenterByName = new Map<string, any>(costCenters.map((cc: any) => [cc.name.toLowerCase().trim(), cc]));
  const locationMap = new Map<string, any>(locations.map((l: any) => [l.name.toLowerCase().trim(), l]));
  const departmentMap = new Map<string, any>();
  for (const d of departments) {
    departmentMap.set((d.name as string).toLowerCase().trim(), d);
    if (d.code) departmentMap.set((d.code as string).toLowerCase().trim(), d);
  }

  const dataRows = rawRows.slice(1).map((r, i) => ({ row: r, rowNum: i + 2 }))
    .filter(({ row }) => row.some(c => c !== undefined && c !== null && String(c).trim() !== ''));
  if (dataRows.length === 0) throw { status: 400, message: 'Excel file contains no data rows' };

  const importResults: { rowNumber: number; costCenterName: string; success: boolean; lineId?: number; errors?: string[] }[] = [];
  let created = 0;
  let errors = 0;

  for (const { row, rowNum } of dataRows) {
    const ccName    = getCell(row, cols.costCenterName);
    const amountStr = getCell(row, cols.amount);
    const description = getCell(row, cols.description);
    const locName   = getCell(row, cols.location);
    const deptName  = getCell(row, cols.department);
    const rowErrors: string[] = [];

    const cc = costCenterByName.get(ccName.toLowerCase());
    if (!ccName) rowErrors.push('Cost Center Name is required');
    else if (!cc) rowErrors.push(`Cost Center "${ccName}" not found`);

    const amount = parseFloat(amountStr.replace(/,/g, '')) || 0;
    if (!amountStr) rowErrors.push('Amount is required');
    else if (amount <= 0) rowErrors.push('Amount must be greater than 0');

    const loc  = locName  ? locationMap.get(locName.toLowerCase())   : null;
    const dept = deptName ? departmentMap.get(deptName.toLowerCase()) : null;
    if (locName  && !loc)  rowErrors.push(`Location "${locName}" not found`);
    if (deptName && !dept) rowErrors.push(`Department "${deptName}" not found`);

    if (rowErrors.length > 0) {
      importResults.push({ rowNumber: rowNum, costCenterName: ccName, success: false, errors: rowErrors });
      errors++;
      continue;
    }

    try {
      const lineId = await repo.addBudgetLine(budgetId, {
        costCenterId: cc.id,
        costCenterCode: cc.code,
        costCenterName: cc.name || ccName,
        amount,
        description: description || undefined,
        locationIds: loc  ? [loc.id]  : [],
        departmentIds: dept ? [dept.id] : [],
        periodAmts: [],
      });
      importResults.push({ rowNumber: rowNum, costCenterName: ccName, success: true, lineId });
      created++;
    } catch (err: any) {
      importResults.push({ rowNumber: rowNum, costCenterName: ccName, success: false, errors: [err?.message || 'Failed to create line'] });
      errors++;
    }
  }

  await repo.updateBudgetTotalAmount(budgetId);
  return { created, errors, total: dataRows.length, results: importResults };
}

function validateBudgetLineTotalAmount(amount: unknown) {
  const total = Number(amount) || 0;
  if (total === 0) {
    throw { status: 400, message: "Total amount shouldn't be zero" };
  }
}

function validateBudgetIsEditable(check: any) {
  if (!check) {
    throw { status: 404, message: "Budget not found" };
  }
  if (!EDITABLE_STATUSES.includes(check.status?.trim().toLowerCase() as any)) {
    throw {
      status: 400,
      message: `Budget must be in Draft or More Info Required status to perform this operation`
    };
  }
}


