import OpenAI from "openai";
import { getAIClient, getAIModelName } from "./ai-client";
import type { AgentChartKind, AgentChartSpec } from "@shared/agent-chart";
import * as spendService from "../modules/spend-analysis/spend-analysis.service";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface SpendAgentResponse {
  response: string;
  chart?: AgentChartSpec;
}

function money(v: number): string {
  return Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function buildChart(
  title: string,
  rows: Record<string, any>[],
  xKey: string,
  series: { key: string; label: string }[],
  kind: AgentChartKind = "bar"
): AgentChartSpec | undefined {
  if (!Array.isArray(rows) || rows.length < 2) return undefined;
  return {
    kind,
    title,
    xKey,
    series,
    rows: rows.map((r) => {
      const out: Record<string, string | number> = { [xKey]: r[xKey] };
      for (const s of series) out[s.key] = Math.round(Number(r[s.key]) || 0);
      return out;
    }),
  };
}

const SPEND_AGENT_SYSTEM_PROMPT = `You are the AI Spend Intelligence Agent for S2P Labs, an enterprise procurement platform. You give finance and procurement teams read-only insight into spend — visibility, savings opportunities, maverick (off-contract) spend, and price/vendor benchmarking. You do NOT create, modify, or delete any records.

## TODAY'S DATE: ${new Date().toISOString().split("T")[0]}
"This year" = ${new Date().getFullYear()}. The underlying data only supports full-year filtering (no quarter/month-range slicing) — if asked for "this quarter", answer using the current year's data and say so.

## CAPABILITIES & TOOLS

### Spend Visibility
- **get_spend_summary**: Headline totals — total spend, suppliers, PRs, POs, invoices for a year.
- **get_spend_by_category**: Spend broken down by product/service category.
- **get_spend_by_supplier**: Spend broken down by supplier.
- **get_spend_by_department**: Spend broken down by department.
- **get_spend_trend**: Monthly spend trend (spend + invoice count per month).

### Savings Opportunities
- **get_savings_analysis**: PR-to-PO estimated vs. actual spend savings.
- **get_bid_savings_summary**: Sourcing/RFQ savings — estimated vs. awarded value across bids.
- **get_top_savings_bids**: The individual bids with the biggest estimated-vs-awarded savings.
- **get_competitive_bidding_impact**: Competitive Bidding Impact — awarded bids with supplier responses, avg responses per bid, and savings from competitive bidding (highest bid vs. awarded amount).

### Maverick Detection
- **get_maverick_spend**: Off-contract (non-PO) spend amount and percentage of total.
- **get_po_vs_nonpo_spend**: PO-based vs. non-PO spend split.

### Benchmarking & Risk
- **get_spend_by_currency**: Spend split by transaction currency.
- **get_contract_vs_spot_spend**: Contract-covered vs. spot-buy spend split.
- **get_budget_vs_spend**: Budget allocation vs. consumption per budget line.
- **get_vendor_concentration_risk**: Supplier concentration — how much of spend sits with the top suppliers, and a risk rating.
- **get_yoy_spend_comparison**: Year-over-year monthly spend comparison and growth rate.

### Operational Analysis
- **get_bid_pipeline_status**: Bid/RFQ pipeline status distribution (count + value per status).
- **get_invoice_status_distribution**: Invoice count by status.
- **get_open_po_aging**: Open POs bucketed by age since issue date.
- **get_avg_approval_days**: Average approval turnaround days by entity type.
- **get_po_value_trend**: Quarterly PO value trend over the last 3 years.
- **get_purchase_cycle_time**: Average days per purchase-to-pay stage (PR→PO→Delivery→Invoice→Payment).
- **get_procurement_health**: Overall + 6 category procurement health scores (0-100).

### Payments & Contracts
- **get_payment_terms_analysis**: Invoice payment-terms compliance (On-Time, Late, Overdue, Not Yet Due).
- **get_upcoming_payment_obligations**: Upcoming/overdue invoice obligations by due-date bucket.
- **get_contract_renewal_pipeline**: Contracts expiring in the next 6 months, by month.

Most tools accept an optional \`year\` (number); omit it for an all-time view. A few operational tools (get_invoice_status_distribution, get_open_po_aging, get_avg_approval_days, get_po_value_trend, get_contract_renewal_pipeline, get_upcoming_payment_obligations, get_purchase_cycle_time) are always org-wide and take no year filter. All figures are aggregated across every business entity in the organization (matching the Spend Analysis module's default "All" view) — never ask the user for an org/tenant/entity ID.

## RESPONSE RULES
- Don't use vendor/Vendor words use Supplier word insted of vendor/Vendor in user facing responses, always use Supplier word instead of vendor/Vendor in user facing responses.
- Call the tool(s) needed to answer — never invent numbers.
- if user ask for any db query or any db related information, say "I cannot access the database directly. Please use the Spend Analysis module in S2P Labs to run queries or view data."
- Keep prose concise: a short lead-in sentence plus the key figures. The chart (when present) already visualizes the breakdown, so don't repeat every row in a table.
- NEVER use markdown tables or pipe characters. Use short bullet lines instead.
- Cite concrete figures (amounts, percentages, counts) from the tool results.
- If a tool returns no data / empty rows, say so plainly rather than guessing.
- Amounts are in each organization's native currency as stored; do not silently convert currencies.`;

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_spend_summary",
      description: "Headline spend totals — total spend, suppliers, PRs, POs, invoices.",
      parameters: { type: "object", properties: { year: { type: "number", description: "Filter to this year (omit for all-time)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spend_by_category",
      description: "Spend broken down by product/service category (top 10).",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spend_by_supplier",
      description: "Spend broken down by supplier (top 10).",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spend_by_department",
      description: "Spend broken down by department (top 10).",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spend_trend",
      description: "Monthly spend trend (spend amount + invoice count per month).",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_savings_analysis",
      description: "PR-to-PO estimated vs. actual spend savings.",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_bid_savings_summary",
      description: "Sourcing/RFQ savings — estimated vs. awarded value across all bids.",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_savings_bids",
      description: "The individual awarded bids with the biggest estimated-vs-awarded savings.",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_competitive_bidding_impact",
      description: "Competitive Bidding Impact — count of awarded bids with supplier responses, avg responses per bid, bids with 3+ responses, highest/lowest bid totals, and savings from competitive bidding (highest bid vs. awarded amount).",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_maverick_spend",
      description: "Off-contract (non-PO) invoice spend amount and percentage of total spend.",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_po_vs_nonpo_spend",
      description: "PO-based vs. non-PO invoice spend split.",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spend_by_currency",
      description: "PO spend split by transaction currency.",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_contract_vs_spot_spend",
      description: "Contract-covered vs. spot-buy PO spend split.",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_budget_vs_spend",
      description: "Budget allocation vs. consumed spend per budget line.",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_vendor_concentration_risk",
      description: "Supplier concentration — share of spend held by top suppliers, with a risk rating.",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_yoy_spend_comparison",
      description: "Year-over-year monthly spend comparison and growth rate vs. the prior year.",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_bid_pipeline_status",
      description: "Bid/RFQ pipeline status distribution — count and value of bids per status (Draft, Published, Awarded, etc.).",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_invoice_status_distribution",
      description: "Invoice count broken down by status (Paid, Pending, Rejected, etc.), org-wide (no year filter).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_open_po_aging",
      description: "Open (not yet closed) purchase orders bucketed by age since issue date, with count and value per bucket, org-wide (no year filter).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_avg_approval_days",
      description: "Average approval turnaround time in days, broken down by entity type (PR, PO, etc.), org-wide (no year filter).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_po_value_trend",
      description: "Quarterly PO value trend over the last 3 years (Q1-Q4 per year), org-wide (no year filter).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_contract_renewal_pipeline",
      description: "Contract renewal pipeline for the next 6 months — count and value of contracts expiring per month, org-wide (no year filter).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_terms_analysis",
      description: "Invoice payment-terms compliance breakdown (On-Time/Early, Late, Overdue, Not Yet Due) by count and amount.",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_upcoming_payment_obligations",
      description: "Upcoming/overdue invoice payment obligations bucketed by due date (Overdue, 0-30, 31-60, 61-90, 90+ Days), org-wide (no year filter).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_purchase_cycle_time",
      description: "Average purchase-to-pay cycle time in days per stage (PR to PO, PO Confirmation, Delivery, Invoice, Payment), org-wide (no year filter).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_procurement_health",
      description: "Procurement health scores (0-100): overall plus 6 category scores (spend, supplier risk, payment discipline, budget compliance, sourcing efficiency, contract compliance). Reuses the AI Insights analysis, cached for a few minutes, so it may be slower the first time it's called for a given year.",
      parameters: { type: "object", properties: { year: { type: "number" } } },
    },
  },
];

async function executeToolCall(
  name: string,
  args: any,
  orgId?: number
): Promise<{ result: string; chart?: AgentChartSpec }> {
  const year: number | undefined = args?.year;
  try {
    switch (name) {
      case "get_spend_summary": {
        const s = await spendService.getSummary(year, orgId);
        return {
          result: `## Spend Summary${year ? ` (${year})` : ""}\n- Total Spend: ${money(s.totalSpend)}\n- Suppliers: ${s.totalSuppliers}\n- Purchase Requisitions: ${s.totalPRs}\n- Purchase Orders: ${s.totalPOs}\n- Invoices: ${s.totalInvoices}`,
        };
      }

      case "get_spend_by_category": {
        const rows = await spendService.getSpendByCategory(year, orgId);
        if (!rows.length) return { result: "No categorized spend found for this period." };
        const lines = rows.map((r: any) => `- ${r.name}: ${money(r.value)}`).join("\n");
        return {
          result: `## Spend by Category${year ? ` (${year})` : ""}\n${lines}`,
          chart: buildChart("Spend by Category", rows, "name", [{ key: "value", label: "Spend" }]),
        };
      }

      case "get_spend_by_supplier": {
        const rows = await spendService.getSpendBySupplier(year, orgId);
        if (!rows.length) return { result: "No supplier spend found for this period." };
        const lines = rows.map((r: any) => `- ${r.name}: ${money(r.value)}`).join("\n");
        return {
          result: `## Spend by Supplier${year ? ` (${year})` : ""}\n${lines}`,
          chart: buildChart("Spend by Supplier", rows, "name", [{ key: "value", label: "Spend" }]),
        };
      }

      case "get_spend_by_department": {
        const rows = await spendService.getSpendByDepartment(year, orgId);
        if (!rows.length) return { result: "No department spend found for this period." };
        const lines = rows.map((r: any) => `- ${r.name}: ${money(r.value)}`).join("\n");
        return {
          result: `## Spend by Department${year ? ` (${year})` : ""}\n${lines}`,
          chart: buildChart("Spend by Department", rows, "name", [{ key: "value", label: "Spend" }], "pie"),
        };
      }

      case "get_spend_trend": {
        const rows = await spendService.getSpendTrend(year, orgId);
        if (!rows.length) return { result: "No spend trend data found for this period." };
        const lines = rows.map((r: any) => `- ${r.month}: ${money(r.spend)} (${r.poCount} invoices)`).join("\n");
        return {
          result: `## Monthly Spend Trend${year ? ` (${year})` : ""}\n${lines}`,
          chart: buildChart("Monthly Spend Trend", rows, "month", [{ key: "spend", label: "Spend" }], "line"),
        };
      }

      case "get_savings_analysis": {
        const s = await spendService.getSavingsAnalysis(year, orgId);
        return {
          result: `## PR-to-PO Savings${year ? ` (${year})` : ""}\n- Estimated (PR): ${money(s.estimated)}\n- Actual (PO): ${money(s.actual)}\n- Savings: ${money(s.savings)} (${s.savingsPercent}%)\n- PRs analyzed: ${s.prCount}`,
        };
      }

      case "get_bid_savings_summary": {
        const s = await spendService.getBidSavingsSummary(year, orgId);
        return {
          result: `## Sourcing / Bid Savings${year ? ` (${year})` : ""}\n- Total Bids: ${s.totalBids} (${s.rfqCount} RFQ, ${s.tenderCount} Tender, ${s.rfpCount} RFP)\n- Awarded: ${s.awardedBids}, Closed: ${s.closedBids}, In Progress: ${s.inProgressBids}\n- Estimated Value: ${money(s.totalEstimated)}\n- Awarded Value: ${money(s.totalAwarded)}\n- Savings: ${money(s.savings)} (${s.savingsPercent}%)`,
        };
      }

      case "get_top_savings_bids": {
        const rows = await spendService.getTopSavingsBids(year, orgId);
        if (!rows.length) return { result: "No awarded bids with savings data found for this period." };
        const lines = rows
          .slice(0, 10)
          .map((r: any) => `- ${r.bidTitle} (${r.type}): estimated ${r.currency} ${money(r.estimated)} → awarded ${r.currency} ${money(r.awarded)}, saved ${r.currency} ${money(r.savings)} (${r.savingsPercent}%)`)
          .join("\n");
        return { result: `## Top Savings Bids${year ? ` (${year})` : ""}\n${lines}` };
      }

      case "get_competitive_bidding_impact": {
        const s = await spendService.getCompetitiveSavings(year, orgId);
        if (!s.competitiveBids) return { result: "No competitive bid data found for this period." };
        return {
          result: `## Competitive Bidding Impact${year ? ` (${year})` : ""}\n- Competitive Bids: ${s.competitiveBids}\n- Avg Responses per Bid: ${s.avgResponses}\n- Bids with 3+ Responses: ${s.bidsWith3Plus}\n- Highest Bid Total: ${money(s.totalHighestBid)}\n- Lowest Bid Total: ${money(s.totalLowestBid)}\n- Awarded Total: ${money(s.totalAwarded)}\n- Competitive Savings: ${money(s.competitiveSavings)} (${s.competitiveSavingsPercent}% vs. highest bid)`,
        };
      }

      case "get_maverick_spend": {
        const s = await spendService.getMaverickSpend(year, orgId);
        return {
          result: `## Maverick Spend${year ? ` (${year})` : ""}\n- Total Invoices: ${s.totalInvoices} (${s.maverickCount} maverick / off-contract)\n- Total Spend: ${money(s.totalSpend)}\n- Maverick Spend: ${money(s.maverickSpend)} (${s.maverickPercent}% of total)`,
        };
      }

      case "get_po_vs_nonpo_spend": {
        const rows = await spendService.getPoVsNonPoSpend(year, orgId);
        if (!rows.length) return { result: "No PO / non-PO spend data found for this period." };
        const lines = rows.map((r: any) => `- ${r.name}: ${money(r.value)} (${r.count} invoices)`).join("\n");
        return {
          result: `## PO vs. Non-PO Spend${year ? ` (${year})` : ""}\n${lines}`,
          chart: buildChart("PO vs Non-PO Spend", rows, "name", [{ key: "value", label: "Spend" }], "pie"),
        };
      }

      case "get_spend_by_currency": {
        const rows = await spendService.getSpendByCurrency(year, orgId);
        if (!rows.length) return { result: "No currency-split spend data found for this period." };
        const lines = rows.map((r: any) => `- ${r.name}: ${money(r.value)} (${r.count} POs)`).join("\n");
        return {
          result: `## Spend by Currency${year ? ` (${year})` : ""}\n${lines}`,
          chart: buildChart("Spend by Currency", rows, "name", [{ key: "value", label: "Spend" }], "pie"),
        };
      }

      case "get_contract_vs_spot_spend": {
        const rows = await spendService.getContractVsSpotSpend(year, orgId);
        if (!rows.length) return { result: "No contract vs. spot-buy spend data found for this period." };
        const lines = rows.map((r: any) => `- ${r.name}: ${money(r.value)} (${r.count} POs)`).join("\n");
        return {
          result: `## Contract vs. Spot-Buy Spend${year ? ` (${year})` : ""}\n${lines}`,
          chart: buildChart("Contract vs Spot-Buy Spend", rows, "name", [{ key: "value", label: "Spend" }], "pie"),
        };
      }

      case "get_budget_vs_spend": {
        const rows = await spendService.getBudgetVsSpend(year, orgId);
        if (!rows.length) return { result: "No budget data found for this period." };
        const summary = await spendService.getBudgetSummary(year, orgId);
        const lines = rows.map((r: any) => `- ${r.name}: budget ${money(r.budget)}, spend ${money(r.spend)}`).join("\n");
        return {
          result: `## Budget vs. Spend${year ? ` (${year})` : ""}\n- Total Budget: ${money(summary.totalBudget)}\n- Consumed: ${money(summary.totalConsumed)} (${summary.consumedPct}%)\n- Reserved: ${money(summary.totalReserved)} (${summary.reservedPct}%)\n- Available: ${money(summary.available)} (${summary.availablePct}%)\n\n### By Budget Line\n${lines}`,
          chart: buildChart("Budget vs Spend", rows, "name", [
            { key: "budget", label: "Budget" },
            { key: "spend", label: "Spend" },
          ]),
        };
      }

      case "get_vendor_concentration_risk": {
        const s = await spendService.getVendorConcentrationRisk(year, orgId);
        const lines = s.suppliers.slice(0, 10).map((r: any) => `- ${r.name}: ${money(r.spend)} (${r.pct}%)`).join("\n");
        return {
          result: `## Vendor Concentration Risk${year ? ` (${year})` : ""}\n- Risk Level: ${s.riskLevel}\n- Top 5 suppliers hold ${s.top5Pct}% of total spend (${money(s.top5Spend)} of ${money(s.totalSpend)})\n- Active Suppliers: ${s.supplierCount}\n\n### Top Suppliers\n${lines}`,
          chart: buildChart("Top Suppliers by Spend", s.suppliers, "name", [{ key: "spend", label: "Spend" }]),
        };
      }

      case "get_yoy_spend_comparison": {
        const s = await spendService.getYoYSpendComparison(year, orgId);
        return {
          result: `## Year-over-Year Spend: ${s.currentYear} vs. ${s.prevYear}\n- ${s.currentYear} Total: ${money(s.totalCurrent)}\n- ${s.prevYear} Total: ${money(s.totalPrev)}\n- Growth: ${s.growth}%`,
          chart: buildChart(`${s.currentYear} vs ${s.prevYear} Monthly Spend`, s.data, "month", [
            { key: "currentYear", label: String(s.currentYear) },
            { key: "prevYear", label: String(s.prevYear) },
          ]),
        };
      }

      case "get_bid_pipeline_status": {
        const rows: any[] = await spendService.getBidStatusDistribution(year, orgId);
        if (!rows.length) return { result: "No bid pipeline data found for this period." };
        const lines = rows.map((r) => `- ${r.name}: ${r.count} bids (${money(r.value)})`).join("\n");
        return {
          result: `## Bid Pipeline Status${year ? ` (${year})` : ""}\n${lines}`,
          chart: buildChart("Bid Pipeline Status", rows, "name", [{ key: "count", label: "Bids" }], "pie"),
        };
      }

      case "get_invoice_status_distribution": {
        const rows: any[] = await spendService.getInvoiceStatusCounts(orgId);
        if (!rows.length) return { result: "No invoice status data found." };
        const lines = rows.map((r) => `- ${r.name}: ${r.value} invoices`).join("\n");
        return {
          result: `## Invoice Status Distribution\n${lines}`,
          chart: buildChart("Invoice Status Distribution", rows, "name", [{ key: "value", label: "Invoices" }], "pie"),
        };
      }

      case "get_open_po_aging": {
        const rows: any[] = await spendService.getOpenPOAging(orgId);
        if (!rows.length) return { result: "No open purchase orders found." };
        const lines = rows.map((r) => `- ${r.name}: ${r.count} POs (${money(r.value)})`).join("\n");
        return {
          result: `## Open PO Aging\n${lines}`,
          chart: buildChart("Open PO Aging", rows, "name", [{ key: "value", label: "Value" }]),
        };
      }

      case "get_avg_approval_days": {
        const rows: any[] = await spendService.getAvgApprovalDays(orgId);
        if (!rows.length) return { result: "No approval turnaround data found." };
        const lines = rows.map((r) => `- ${r.entityType}: ${r.avgDays} days`).join("\n");
        return {
          result: `## Avg Approval Days by Entity Type\n${lines}`,
          chart: buildChart("Avg Approval Days by Entity Type", rows, "entityType", [{ key: "avgDays", label: "Days" }]),
        };
      }

      case "get_po_value_trend": {
        const rows: any[] = await spendService.getPOYearTrend(orgId);
        if (!rows.length) return { result: "No PO value trend data found." };
        const lines = rows.map((r) => `- ${r.year}: Q1 ${money(r.q1)}, Q2 ${money(r.q2)}, Q3 ${money(r.q3)}, Q4 ${money(r.q4)}`).join("\n");
        return {
          result: `## PO Value Trend (Quarterly)\n${lines}`,
          chart: buildChart("PO Value Trend (Quarterly)", rows, "year", [
            { key: "q1", label: "Q1" },
            { key: "q2", label: "Q2" },
            { key: "q3", label: "Q3" },
            { key: "q4", label: "Q4" },
          ]),
        };
      }

      case "get_contract_renewal_pipeline": {
        const s = await spendService.getContractPipeline(orgId);
        const rows: any[] = s.renewalPipeline || [];
        if (!rows.length) return { result: "No contracts expiring in the next 6 months." };
        const lines = rows.map((r: any) => `- ${r.month}: ${r.count} contracts (${money(r.value)})`).join("\n");
        return {
          result: `## Contract Renewal Pipeline (Next 6 Months)\n${lines}`,
          chart: buildChart("Contract Renewal Pipeline", rows, "month", [{ key: "value", label: "Value" }]),
        };
      }

      case "get_payment_terms_analysis": {
        const s = await spendService.getPaymentTermsAnalysis(year, orgId);
        const rows: any[] = s.breakdown || [];
        if (!rows.length) return { result: "No payment terms data found for this period." };
        const lines = rows.map((r: any) => `- ${r.status}: ${r.count} invoices (${money(r.amount)})`).join("\n");
        return {
          result: `## Payment Terms Analysis${year ? ` (${year})` : ""}\n${lines}`,
          chart: buildChart("Payment Terms Analysis", rows, "status", [{ key: "amount", label: "Amount" }], "pie"),
        };
      }

      case "get_upcoming_payment_obligations": {
        const s = await spendService.getUpcomingPaymentObligations(orgId);
        const rows: any[] = s.buckets || [];
        if (!rows.length) return { result: "No upcoming payment obligations found." };
        const lines = rows.map((r: any) => `- ${r.bucket}: ${r.count} invoices (${money(r.amount)})`).join("\n");
        return {
          result: `## Upcoming Payment Obligations\n- Total Outstanding: ${money(s.totalOutstanding)}\n- Overdue: ${money(s.overdueAmount)} (${s.overdueCount})\n\n${lines}`,
          chart: buildChart("Upcoming Payment Obligations", rows, "bucket", [{ key: "amount", label: "Amount" }]),
        };
      }

      case "get_purchase_cycle_time": {
        const s = await spendService.getPurchaseCycleTime(orgId);
        const rows = [
          { stage: "PR to PO", days: s.prToPo },
          { stage: "PO Confirmation", days: s.poToPoConf },
          { stage: "PO to Delivery", days: s.poToDelivery },
          { stage: "Delivery to Invoice", days: s.deliveryToInvoice },
          { stage: "Invoice to Payment", days: s.invoiceToPayment },
        ];
        const lines = rows.map((r) => `- ${r.stage}: ${r.days} days`).join("\n");
        return {
          result: `## Purchase-to-Pay Cycle Time\n${lines}`,
          chart: buildChart("Purchase-to-Pay Cycle Time", rows, "stage", [{ key: "days", label: "Days" }]),
        };
      }

      case "get_procurement_health": {
        const s = await spendService.getAISpendInsights(year, orgId);
        const hs = s?.healthScore || {};
        const rows = [
          { metric: "Overall", score: hs.overall ?? 0 },
          { metric: "Spend", score: hs.spending ?? 0 },
          { metric: "Supplier", score: hs.supplierRisk ?? 0 },
          { metric: "Payments", score: hs.paymentDiscipline ?? 0 },
          { metric: "Budget", score: hs.budgetCompliance ?? 0 },
          { metric: "Sourcing", score: hs.sourcingEfficiency ?? 0 },
          { metric: "Contracts", score: hs.contractCompliance ?? 0 },
        ];
        const lines = rows.map((r) => `- ${r.metric}: ${r.score}/100`).join("\n");
        return {
          result: `## Procurement Health Score${year ? ` (${year})` : ""}\n${lines}`,
          chart: buildChart("Procurement Health Score", rows, "metric", [{ key: "score", label: "Score" }]),
        };
      }

      default:
        return { result: `Unknown tool: ${name}` };
    }
  } catch (error: any) {
    return { result: `Error running ${name}: ${error.message || "Unknown error"}` };
  }
}

export async function processSpendAgentQuery(
  prompt: string,
  conversationHistory: ConversationMessage[] = [],
  _sessionUser?: any
): Promise<SpendAgentResponse> {
  // Matches the Spend Analysis module's default "All Business Entities" view
  // (its Business Entity filter defaults to "all" — org_id is a reporting
  // dimension here, not an access boundary, so there's nothing to restrict).
  const orgId: number | undefined = undefined;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SPEND_AGENT_SYSTEM_PROMPT },
    ...conversationHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: prompt },
  ];

  try {
    const openai = await getAIClient();
    const modelName = await getAIModelName();

    let completion = await openai.chat.completions.create({
      model: modelName,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 2000,
    });

    let assistantMessage = completion.choices[0]?.message;
    let lastChart: AgentChartSpec | undefined;
    let loopCount = 0;
    const MAX_LOOPS = 5;

    while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0 && loopCount < MAX_LOOPS) {
      loopCount++;
      messages.push({
        role: "assistant",
        content: assistantMessage.content || null,
        tool_calls: assistantMessage.tool_calls,
      } as any);

      for (const toolCall of assistantMessage.tool_calls) {
        const fnName = (toolCall as any).function.name;
        let fnArgs: any = {};
        try {
          fnArgs = JSON.parse((toolCall as any).function.arguments || "{}");
        } catch {
          fnArgs = {};
        }

        const toolResult = await executeToolCall(fnName, fnArgs, orgId);
        if (toolResult.chart) lastChart = toolResult.chart;

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult.result,
        } as any);
      }

      completion = await openai.chat.completions.create({
        model: modelName,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: 2000,
      });
      assistantMessage = completion.choices[0]?.message;
    }

    const response = assistantMessage?.content || "I couldn't generate an answer. Please try rephrasing.";
    return { response, chart: lastChart };
  } catch (error: any) {
    console.error("Spend Agent error:", error);
    return { response: "I'm having trouble connecting to the AI service. Please try again in a moment." };
  }
}
