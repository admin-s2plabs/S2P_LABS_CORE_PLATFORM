/**
 * Manual harness: runs the PR recommendation engine against a real tenant
 * database with a stubbed AI line item service, so the matching, lead time and
 * buyer logic can be inspected without the agent or the UI.
 *
 * Usage: npx tsx scripts/pr-recommendation-demo.ts [tenantDbName]
 */

import "dotenv/config";
import pg from "pg";
import { tenantStorage } from "../server/tenant-context";
import { recommendRequisition } from "../server/services/pr-recommendation/pr-recommendation.service";
import { budgetPort, buyerPort, locationPort, poHistoryPort, userPort } from "../server/services/pr-recommendation/adapters";
import type { PrRecommendationDeps } from "../server/services/pr-recommendation/ports";
import type { PrRecommendationSpec } from "../shared/agent-pr-recommendation";

const TENANT_DB = process.argv[2] || "Prokraya2";
const TODAY = new Date("2026-08-08T09:00:00");

function stubAi(description: string, leadTimeDays: number | null) {
  return {
    generateLineItems: async () => ({
      lineItems: [
        {
          description,
          quantity: 20,
          unitOfMeasure: "EA",
          estimatedPrice: 1200,
          aiGenerated: true,
        },
      ],
      leadTimeDays,
      unavailable: false,
    }),
  };
}

function line(label: string, field: { value: any; source: string; rationale: string; sampleSize?: number }) {
  const shown = field.value == null
    ? "(none)"
    : typeof field.value === "object"
      ? field.value.label ?? field.value.budgetName ?? JSON.stringify(field.value)
      : field.value;
  console.log(`  ${label.padEnd(18)} ${String(shown).padEnd(32)} [${field.source}] ${field.rationale}`);
}

function report(title: string, spec: PrRecommendationSpec) {
  console.log(`\n=== ${title} ===`);
  line("Budget", spec.budget as any);
  if (spec.budget.value) {
    const b = spec.budget.value;
    console.log(`  ${"".padEnd(18)} score ${b.score} (name ${b.scoreBreakdown.budgetName}, cc ${b.scoreBreakdown.costCentre}, desc ${b.scoreBreakdown.description}); cost centre "${b.costCentreName}"; desc "${b.lineDescription ?? "-"}"`);
  }
  line("Business Entity", spec.businessEntity as any);
  line("Department", spec.department as any);
  line("Delivery Location", spec.deliveryLocation as any);
  line("Currency", spec.currency as any);
  line("Need By Date", spec.needByDate as any);
  line("Buyer", spec.buyer as any);
  line("Requestor", spec.requestor as any);
  console.log(`  canCreate=${spec.canCreate} unresolved=[${spec.unresolved.join(", ")}]`);
  if (spec.pendingChoice) {
    console.log(`  PROMPT (${spec.pendingChoice.field}): ${spec.pendingChoice.prompt}`);
    for (const option of spec.pendingChoice.options.slice(0, 5)) {
      console.log(`     - ${option.label} ${option.detail ?? ""}`);
    }
  }
}

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = "/" + TENANT_DB;
  const pool = new pg.Pool({ connectionString: url.toString() });

  await tenantStorage.run({ pool, db: {} as any }, async () => {
    const sessionUser = { id: 1, name: "Demo User", department: "IT Department" };

    const baseDeps = (aiDescription: string, aiLeadTime: number | null): PrRecommendationDeps => ({
      budgets: budgetPort,
      poHistory: poHistoryPort,
      buyers: buyerPort,
      locations: locationPort,
      users: userPort,
      aiLineItems: stubAi(aiDescription, aiLeadTime),
      clock: { now: () => TODAY },
      random: { next: () => 0 },
      log: () => {},
    });

    const laptops = await recommendRequisition(
      { request: "Create a PR for 20 laptops for a new engineering team", sessionUser },
      baseDeps("Dell Latitude Laptop", 21),
    );
    report("20 laptops for a new engineering team", laptops);

    // Pick a real item off historical PO lines so the po_history path is exercised.
    const itemRow = await pool.query(`
      SELECT l.item_name, COUNT(*)::int AS n
      FROM dbo.supp_po_line_dtls l
      JOIN dbo.supp_po_header_dtls h ON h.po_number = l.po_number
      WHERE h.po_status = 'Approved' AND l.item_name IS NOT NULL AND length(trim(l.item_name)) >= 4
      GROUP BY l.item_name ORDER BY n DESC LIMIT 1
    `);
    const realItem: string | undefined = itemRow.rows[0]?.item_name;
    if (realItem) {
      const spec = await recommendRequisition(
        { request: `I need 5 ${realItem}`, sessionUser },
        baseDeps(realItem, null),
      );
      report(`5 ${realItem} (item with real PO history)`, spec);
    } else {
      console.log("\n(no approved PO lines with an item name; skipped the history scenario)");
    }

    const nonsense = await recommendRequisition(
      { request: "I need catering for the summer party", sessionUser },
      baseDeps("Sandwich Platter", null),
    );
    report("catering for the summer party (expect no budget match)", nonsense);
  });

  await pool.end();
}

main().catch((error) => {
  console.error("demo failed:", error);
  process.exit(1);
});
