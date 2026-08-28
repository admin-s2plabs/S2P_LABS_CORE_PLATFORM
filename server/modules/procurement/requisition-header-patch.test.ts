import { describe, expect, it } from "vitest";
import {
  mergeRequisitionHeader,
  type RequisitionHeaderRow,
} from "./requisition-header-patch";

/** PR_00067 as the detail page shows it before any edit. */
const EXISTING: RequisitionHeaderRow = {
  pr_description: "create a PR for laptops",
  department_name: "Admin Department",
  requestor_id: 7,
  requestor_name: "Enaythulla",
  requestor_email: "karthikeya.manchikanti@prokraya.com",
  pr_owner_id: 12,
  pr_owner_name: "Chanti Singam",
  pr_owner_email: "chanti.singamreddy@prokraya.com",
  delivertto_location_id: 3,
  delivertto_location_name: "Head Quarters Dubai",
  delivery_date: "2026-09-01",
  budget_name: "laptops . IT Consulting Services",
  budget_segment: 41,
  budgeted: true,
  currency: "INR",
  org_id: 2,
};

describe("mergeRequisitionHeader — a one-field edit leaves the rest alone", () => {
  const merged = mergeRequisitionHeader(EXISTING, {
    needByDate: new Date("2026-09-03T00:00:00.000Z"),
  });

  it("applies the field that was changed", () => {
    expect(merged.needByDate?.toISOString()).toBe("2026-09-03T00:00:00.000Z");
  });

  it("keeps the description", () => {
    expect(merged.description).toBe("create a PR for laptops");
  });

  it("keeps the department", () => {
    expect(merged.deptName).toBe("Admin Department");
  });

  it("keeps the requestor", () => {
    expect(merged.reqId).toBe(7);
    expect(merged.reqName).toBe("Enaythulla");
    expect(merged.reqEmail).toBe("karthikeya.manchikanti@prokraya.com");
  });

  it("keeps the buyer", () => {
    expect(merged.ownerId).toBe(12);
    expect(merged.ownerName).toBe("Chanti Singam");
    expect(merged.ownerEmail).toBe("chanti.singamreddy@prokraya.com");
  });

  it("keeps the delivery location", () => {
    expect(merged.locId).toBe(3);
    expect(merged.locName).toBe("Head Quarters Dubai");
  });

  it("keeps the budget", () => {
    expect(merged.budName).toBe("laptops . IT Consulting Services");
    expect(merged.budSegment).toBe(41);
  });

  it("keeps the budgeted flag set rather than collapsing it to false", () => {
    expect(merged.budgeted).toBe(true);
  });

  it("keeps the currency instead of falling back to a default", () => {
    expect(merged.currency).toBe("INR");
    expect(merged.currency).not.toBe("AED");
  });

  it("keeps the business entity", () => {
    expect(merged.orgId).toBe(2);
  });
});

describe("mergeRequisitionHeader — applying each field on its own", () => {
  it("changes only the description", () => {
    const merged = mergeRequisitionHeader(EXISTING, { description: "Laptops for onboarding" });
    expect(merged.description).toBe("Laptops for onboarding");
    expect(merged.currency).toBe("INR");
    expect(merged.budgeted).toBe(true);
    expect(merged.needByDate?.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("changes only the currency", () => {
    const merged = mergeRequisitionHeader(EXISTING, { currency: "USD" });
    expect(merged.currency).toBe("USD");
    expect(merged.description).toBe("create a PR for laptops");
    expect(merged.reqName).toBe("Enaythulla");
  });

  it("moves the three requestor columns together", () => {
    const merged = mergeRequisitionHeader(EXISTING, {
      requestor: { id: 99, name: "Priya Rao", email: "priya@prokraya.com" },
    });
    expect(merged.reqId).toBe(99);
    expect(merged.reqName).toBe("Priya Rao");
    expect(merged.reqEmail).toBe("priya@prokraya.com");
    expect(merged.ownerName).toBe("Chanti Singam");
  });

  it("moves the budget name and segment together", () => {
    const merged = mergeRequisitionHeader(EXISTING, {
      budget: { name: "hardware . IT Capex", segment: 77 },
    });
    expect(merged.budName).toBe("hardware . IT Capex");
    expect(merged.budSegment).toBe(77);
  });

  it("can turn the budgeted flag off when it is actually sent", () => {
    expect(mergeRequisitionHeader(EXISTING, { budgeted: false }).budgeted).toBe(false);
  });
});

describe("mergeRequisitionHeader — a full form post still overwrites everything", () => {
  it("writes every supplied value", () => {
    const merged = mergeRequisitionHeader(EXISTING, {
      description: "New description",
      deptName: "Finance",
      requestor: { id: 1, name: "A", email: "a@x.com" },
      owner: { id: 2, name: "B", email: "b@x.com" },
      location: { id: 9, name: "Chennai Office" },
      needByDate: new Date("2026-10-15T00:00:00.000Z"),
      budget: { name: "ops . Facilities", segment: 5 },
      budgeted: false,
      currency: "AED",
      orgId: 4,
    });

    expect(merged).toEqual({
      description: "New description",
      deptName: "Finance",
      reqId: 1,
      reqName: "A",
      reqEmail: "a@x.com",
      ownerId: 2,
      ownerName: "B",
      ownerEmail: "b@x.com",
      locId: 9,
      locName: "Chennai Office",
      needByDate: new Date("2026-10-15T00:00:00.000Z"),
      budName: "ops . Facilities",
      budSegment: 5,
      budgeted: false,
      currency: "AED",
      orgId: 4,
    });
  });
});

describe("mergeRequisitionHeader — clearing and coercion", () => {
  it("treats an explicit null as a request to clear the column", () => {
    const merged = mergeRequisitionHeader(EXISTING, { description: null, orgId: null });
    expect(merged.description).toBeNull();
    expect(merged.orgId).toBeNull();
    expect(merged.deptName).toBe("Admin Department");
  });

  it("clears the need-by date when it is explicitly nulled", () => {
    expect(mergeRequisitionHeader(EXISTING, { needByDate: null }).needByDate).toBeNull();
  });

  it("normalises ids the row stores as text", () => {
    const merged = mergeRequisitionHeader(
      { ...EXISTING, requestor_id: "7", budget_segment: "41", org_id: "2" },
      {},
    );
    expect(merged.reqId).toBe(7);
    expect(merged.budSegment).toBe(41);
    expect(merged.orgId).toBe(2);
  });

  it("carries an empty header through without inventing values", () => {
    const merged = mergeRequisitionHeader({}, {});
    expect(merged.description).toBeNull();
    expect(merged.currency).toBeNull();
    expect(merged.budgeted).toBe(false);
    expect(merged.needByDate).toBeNull();
  });

  it("ignores an unparseable stored date rather than writing Invalid Date", () => {
    const merged = mergeRequisitionHeader({ ...EXISTING, delivery_date: "not a date" }, {});
    expect(merged.needByDate).toBeNull();
  });
});
