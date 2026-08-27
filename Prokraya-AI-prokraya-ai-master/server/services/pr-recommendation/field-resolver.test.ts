import { describe, expect, it } from "vitest";
import { resolveDeliveryLocation, resolveDepartment, sortByName } from "./field-resolver";
import type { PoHistoryRow } from "./ports";

function po(departmentName: string, locationName: string, poNumber = "PO1"): PoHistoryRow {
  return {
    poNumber,
    createdDate: new Date("2026-01-01"),
    requiredDate: new Date("2026-01-15"),
    orgId: 1,
    departmentName,
    buyerId: 1,
    buyerName: "Buyer One",
    deliveryLocationId: "1",
    deliveryLocationName: locationName,
  };
}

const TEN_DEPARTMENTS = [
  { id: "1", name: "Admin Department" },
  { id: "15", name: "Executive Management" },
  { id: "3", name: "Finance Department" },
  { id: "5", name: "HR Department" },
  { id: "2", name: "IT Department" },
  { id: "6", name: "Marketing Department" },
  { id: "16", name: "Operations Department" },
  { id: "7", name: "Projects Delivery Department" },
  { id: "17", name: "Recruiting Department" },
  { id: "4", name: "Sales Department" },
];

describe("sortByName", () => {
  it("sorts case-insensitively with id as a tiebreak", () => {
    const sorted = sortByName([
      { id: "2", name: "beta" },
      { id: "1", name: "Alpha" },
      { id: "0", name: "beta" },
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["1", "0", "2"]);
  });
});

describe("resolveDepartment", () => {
  it("uses the sole mapped department", () => {
    const result = resolveDepartment({
      allowed: [{ id: "2", name: "IT Department" }],
      userDepartment: "Finance Department",
      poHistory: [],
    });
    expect(result.source).toBe("single_option");
    expect(result.value?.name).toBe("IT Department");
  });

  it("prefers the user's own department when it is allowed", () => {
    const result = resolveDepartment({
      allowed: TEN_DEPARTMENTS,
      userDepartment: "IT Department",
      poHistory: [po("Finance Department", "Head Quarters Dubai")],
    });
    expect(result.source).toBe("user_profile");
    expect(result.value?.name).toBe("IT Department");
  });

  it("matches the user's department case-insensitively", () => {
    const result = resolveDepartment({
      allowed: TEN_DEPARTMENTS,
      userDepartment: "  it department ",
      poHistory: [],
    });
    expect(result.source).toBe("user_profile");
  });

  it("falls back to the most frequent historical department", () => {
    const result = resolveDepartment({
      allowed: TEN_DEPARTMENTS,
      userDepartment: "Engineering",
      poHistory: [
        po("IT Department", "Dubai", "PO1"),
        po("IT Department", "Dubai", "PO2"),
        po("Finance Department", "Dubai", "PO3"),
      ],
    });
    expect(result.source).toBe("po_history");
    expect(result.value?.name).toBe("IT Department");
    expect(result.sampleSize).toBe(2);
  });

  it("ignores historical departments outside the allowed set", () => {
    const result = resolveDepartment({
      allowed: [{ id: "2", name: "IT Department" }, { id: "3", name: "Finance Department" }],
      userDepartment: null,
      poHistory: [po("Legal Department", "Dubai")],
    });
    expect(result.source).toBe("alphabetical");
    expect(result.value?.name).toBe("Finance Department");
  });

  it("breaks a frequency tie alphabetically", () => {
    const result = resolveDepartment({
      allowed: TEN_DEPARTMENTS,
      userDepartment: null,
      poHistory: [po("IT Department", "Dubai", "PO1"), po("Finance Department", "Dubai", "PO2")],
    });
    expect(result.value?.name).toBe("Finance Department");
  });

  it("defaults to the first allowed department alphabetically", () => {
    const result = resolveDepartment({
      allowed: TEN_DEPARTMENTS,
      userDepartment: null,
      poHistory: [],
    });
    expect(result.source).toBe("alphabetical");
    expect(result.value?.name).toBe("Admin Department");
  });

  it("is stable regardless of input order", () => {
    const forward = resolveDepartment({ allowed: TEN_DEPARTMENTS, userDepartment: null, poHistory: [] });
    const reversed = resolveDepartment({ allowed: [...TEN_DEPARTMENTS].reverse(), userDepartment: null, poHistory: [] });
    expect(forward.value?.id).toBe(reversed.value?.id);
  });

  it("reports none when the budget maps no departments", () => {
    const result = resolveDepartment({ allowed: [], userDepartment: "IT", poHistory: [] });
    expect(result.source).toBe("none");
    expect(result.value).toBeNull();
  });
});

describe("resolveDeliveryLocation", () => {
  it("uses the sole mapped location", () => {
    const result = resolveDeliveryLocation({
      allowed: [{ id: "1", name: "Head Quarters Dubai" }],
      poHistory: [],
      entityLocations: [],
    });
    expect(result.source).toBe("single_option");
  });

  it("prefers the most frequent historical location", () => {
    const result = resolveDeliveryLocation({
      allowed: [
        { id: "1", name: "Head Quarters Dubai" },
        { id: "2", name: "Head Quarters Mumbai" },
      ],
      poHistory: [
        po("IT", "Head Quarters Mumbai", "PO1"),
        po("IT", "Head Quarters Mumbai", "PO2"),
        po("IT", "Head Quarters Dubai", "PO3"),
      ],
      entityLocations: [],
    });
    expect(result.source).toBe("po_history");
    expect(result.value?.name).toBe("Head Quarters Mumbai");
  });

  it("falls back to the entity default when the budget maps none", () => {
    const result = resolveDeliveryLocation({
      allowed: [],
      poHistory: [],
      entityLocations: [
        { id: "9", name: "Miyapur" },
        { id: "1", name: "Head Quarters Dubai" },
      ],
    });
    expect(result.source).toBe("entity_default");
    expect(result.value?.name).toBe("Head Quarters Dubai");
  });

  it("uses history against entity locations when the budget maps none", () => {
    const result = resolveDeliveryLocation({
      allowed: [],
      poHistory: [po("IT", "Miyapur")],
      entityLocations: [
        { id: "9", name: "Miyapur" },
        { id: "1", name: "Head Quarters Dubai" },
      ],
    });
    expect(result.source).toBe("po_history");
    expect(result.value?.name).toBe("Miyapur");
  });

  it("defaults alphabetically when several are allowed and there is no history", () => {
    const result = resolveDeliveryLocation({
      allowed: [
        { id: "2", name: "Head Quarters Mumbai" },
        { id: "1", name: "Head Quarters Dubai" },
      ],
      poHistory: [],
      entityLocations: [],
    });
    expect(result.source).toBe("alphabetical");
    expect(result.value?.name).toBe("Head Quarters Dubai");
  });

  it("reports none when there is nothing to choose from", () => {
    const result = resolveDeliveryLocation({ allowed: [], poHistory: [], entityLocations: [] });
    expect(result.source).toBe("none");
    expect(result.value).toBeNull();
  });
});
