import { describe, expect, it } from "vitest";
import {
  checkRequisitionSubmitReadiness,
  describeMissingRequirements,
  formatRequisitionReadinessMessage,
  type RequisitionSubmitHeader,
} from "./requisition-submit-readiness";

/** A fully filled draft, matching the Edit Purchase Requisition dialog. */
const COMPLETE: RequisitionSubmitHeader = {
  pr_description: "create a PR for laptops",
  org_id: 2,
  delivery_date: "2026-09-02",
  requestor_id: 7,
  delivertto_location_id: 3,
  department_name: "Admin Department",
  pr_owner_id: 12,
  currency: "INR",
  budgeted: true,
  budget_segment: 41,
};

describe("checkRequisitionSubmitReadiness — a complete PR", () => {
  it("is ready with one line item", () => {
    expect(checkRequisitionSubmitReadiness(COMPLETE, 1)).toEqual({ ready: true, missing: [] });
  });

  it("is ready when the requisition is deliberately unbudgeted", () => {
    const unbudgeted = { ...COMPLETE, budgeted: false, budget_segment: null };
    expect(checkRequisitionSubmitReadiness(unbudgeted, 2).ready).toBe(true);
  });

  it("accepts ids and dates in the string form Postgres returns", () => {
    const asText = {
      ...COMPLETE,
      org_id: "2",
      requestor_id: "7",
      delivertto_location_id: "3",
      pr_owner_id: "12",
      budget_segment: "41",
      delivery_date: new Date("2026-09-02T00:00:00.000Z"),
    };
    expect(checkRequisitionSubmitReadiness(asText, 1).ready).toBe(true);
  });
});

describe("checkRequisitionSubmitReadiness — each mandatory field", () => {
  const cases: Array<[string, Partial<RequisitionSubmitHeader>]> = [
    ["PR Description", { pr_description: "" }],
    ["Business Entity", { org_id: null }],
    ["Need By Date", { delivery_date: null }],
    ["Requestor", { requestor_id: null }],
    ["Delivery Location", { delivertto_location_id: null }],
    ["Department", { department_name: "   " }],
    ["Buyer", { pr_owner_id: 0 }],
    ["Currency", { currency: null }],
    ["Budget", { budgeted: true, budget_segment: null }],
  ];

  it.each(cases)("reports %s when it is blank", (label, override) => {
    const result = checkRequisitionSubmitReadiness({ ...COMPLETE, ...override }, 1);
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual([label]);
  });

  it("does not ask for a Budget when the PR is not budgeted", () => {
    const result = checkRequisitionSubmitReadiness(
      { ...COMPLETE, budgeted: false, budget_segment: null },
      1,
    );
    expect(result.missing).not.toContain("Budget");
  });

  it("rejects an unparseable need-by date", () => {
    const result = checkRequisitionSubmitReadiness({ ...COMPLETE, delivery_date: "soon" }, 1);
    expect(result.missing).toEqual(["Need By Date"]);
  });
});

describe("checkRequisitionSubmitReadiness — line items", () => {
  it("requires at least one line", () => {
    const result = checkRequisitionSubmitReadiness(COMPLETE, 0);
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["At least one line item"]);
  });

  it("treats a missing count as no lines", () => {
    expect(checkRequisitionSubmitReadiness(COMPLETE, Number.NaN).missing).toEqual([
      "At least one line item",
    ]);
  });
});

describe("checkRequisitionSubmitReadiness — reporting everything at once", () => {
  it("lists every unmet requirement in dialog order", () => {
    const result = checkRequisitionSubmitReadiness(
      { ...COMPLETE, department_name: null, pr_owner_id: null, budget_segment: null },
      0,
    );
    expect(result.missing).toEqual([
      "Department",
      "Buyer",
      "Budget",
      "At least one line item",
    ]);
  });

  it("handles a header that is entirely blank", () => {
    const result = checkRequisitionSubmitReadiness({}, 0);
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual([
      "PR Description",
      "Business Entity",
      "Need By Date",
      "Requestor",
      "Delivery Location",
      "Department",
      "Buyer",
      "Currency",
      "At least one line item",
    ]);
  });

  it("survives a null header", () => {
    expect(checkRequisitionSubmitReadiness(null, 1).ready).toBe(false);
  });
});

describe("message formatting", () => {
  it("reads as a sentence for the server error", () => {
    expect(describeMissingRequirements(["Department"])).toBe("Department");
    expect(describeMissingRequirements(["Department", "Buyer"])).toBe("Department and Buyer");
    expect(describeMissingRequirements(["Department", "Buyer", "At least one line item"])).toBe(
      "Department, Buyer and at least one line item",
    );
    expect(describeMissingRequirements([])).toBe("");
  });

  it("confirms readiness in chat", () => {
    const message = formatRequisitionReadinessMessage("PR_00069", { ready: true, missing: [] });
    expect(message).toContain("PR_00069");
    expect(message).toContain("ready to submit");
  });

  it("bullets the gaps in chat", () => {
    const message = formatRequisitionReadinessMessage("PR_00069", {
      ready: false,
      missing: ["Department", "At least one line item"],
    });
    expect(message).toContain("not ready to submit");
    expect(message).toContain("- Department");
    expect(message).toContain("- At least one line item");
  });
});
