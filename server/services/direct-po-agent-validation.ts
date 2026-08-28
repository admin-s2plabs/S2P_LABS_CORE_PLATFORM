/**
 * Agent-side Direct PO (standalone) draft structure + mandatory-field validation.
 *
 * Aligns with the manual Create PO form header fields / POST /api/purchase-orders body.
 * Name→ID resolution happens in procurement-agent-service (lookups); this module
 * tracks completeness and rejects non-canonical IDs (e.g. orgId = "ProductionQA").
 */

import { isNumericOrgId, parseNumericOrgId } from "./direct-po-business-entity";
import { isCanonicalNumericId, parseCanonicalNumericId } from "./direct-po-name-match";

export type DirectPoFieldStatus = "extracted" | "resolved" | "unresolved" | "invalid";

export interface DirectPoField<T = unknown> {
  value: T | null;
  status: DirectPoFieldStatus;
  source?: string;
  message?: string;
}

/** Payload shape matching manual Create PO → createPurchaseOrder body. */
export interface DirectPoHeaderPayload {
  description: string;
  poType: "Standard";
  supplierId: number;
  supplierName: string | null;
  deliveryLocation: string;
  requiredDate: string;
  requestorId: string | number;
  requestorName: string | null;
  requestorDepartment: string;
  buyerId: string | number | null;
  buyerName: string | null;
  buyerEmail: string | null;
  /** Numeric business entity id only — never a display name. */
  orgId: number;
  /** Display name for confirm UI (not sent as org_id to DB). */
  orgName?: string | null;
  currency: string;
  budgetId: string | number;
  budgetName: string | null;
  paymentTermsId: string | number;
  paymentTermsName: string | null;
  advanceFlag: boolean;
  advancePercentage: string | number | null;
}

export interface DirectPoDraft {
  description: DirectPoField<string>;
  supplierId: DirectPoField<number>;
  supplierName: DirectPoField<string>;
  deliveryLocation: DirectPoField<string>;
  deliveryLocationName: DirectPoField<string>;
  requiredDate: DirectPoField<string>;
  requestorId: DirectPoField<string | number>;
  requestorName: DirectPoField<string>;
  requestorDepartment: DirectPoField<string>;
  requestorDepartmentName: DirectPoField<string>;
  buyerId: DirectPoField<string | number>;
  buyerName: DirectPoField<string>;
  buyerEmail: DirectPoField<string>;
  /** Business entity numeric id — same as manual form `orgId`. */
  orgId: DirectPoField<number>;
  /** Business entity display name (manual dropdown label). */
  orgName: DirectPoField<string>;
  currency: DirectPoField<string>;
  budgetId: DirectPoField<number>;
  budgetName: DirectPoField<string>;
  paymentTermsId: DirectPoField<string>;
  paymentTermsName: DirectPoField<string>;
  advanceFlag: DirectPoField<boolean>;
  advancePercentage: DirectPoField<string | number>;
}

export type DirectPoMandatoryKey =
  | "description"
  | "deliveryLocation"
  | "requiredDate"
  | "requestorId"
  | "orgId"
  | "requestorDepartment"
  | "supplierId"
  | "budgetId"
  | "currency"
  | "paymentTermsId"
  | "advancePercentage";

export const DIRECT_PO_MANDATORY_FIELDS: readonly DirectPoMandatoryKey[] = [
  "description",
  "deliveryLocation",
  "requiredDate",
  "requestorId",
  "orgId",
  "requestorDepartment",
  "supplierId",
  "budgetId",
  "currency",
  "paymentTermsId",
] as const;

export const DIRECT_PO_FIELD_LABELS: Record<DirectPoMandatoryKey, string> = {
  description: "PO Description",
  deliveryLocation: "Delivery Location",
  requiredDate: "Need By Date",
  requestorId: "Requestor",
  orgId: "Business Entity",
  requestorDepartment: "Department",
  supplierId: "Vendor",
  budgetId: "Budget",
  currency: "Currency",
  paymentTermsId: "Payment Terms",
  advancePercentage: "Advance Payment %",
};

/** Default currency when none is supplied (matches prior agent behavior). */
export const DIRECT_PO_DEFAULT_CURRENCY = "AED";

function field<T>(
  value: T | null | undefined,
  status: DirectPoFieldStatus,
  source?: string,
  message?: string,
): DirectPoField<T> {
  return {
    value: value === undefined ? null : value,
    status,
    ...(source ? { source } : {}),
    ...(message ? { message } : {}),
  };
}

function unresolved<T = never>(message?: string): DirectPoField<T> {
  return field<T>(null, "unresolved", undefined, message);
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  return true;
}

export interface DirectPoToolArgs {
  description?: unknown;
  supplierId?: unknown;
  supplierName?: unknown;
  currency?: unknown;
  requiredDate?: unknown;
  deliveryLocation?: unknown;
  /** Display name for delivery location (e.g. Mumbai). */
  deliveryLocationName?: unknown;
  requestorId?: unknown;
  requestorName?: unknown;
  requestorDepartment?: unknown;
  /** Display name for department (e.g. IT). */
  requestorDepartmentName?: unknown;
  buyerId?: unknown;
  buyerName?: unknown;
  buyerEmail?: unknown;
  /** Numeric organization id only. Names must go in orgName. */
  orgId?: unknown;
  /** Business entity display name — resolve via search_organizations / lookup. */
  orgName?: unknown;
  budgetId?: unknown;
  budgetName?: unknown;
  paymentTermsId?: unknown;
  paymentTermsName?: unknown;
  advanceFlag?: unknown;
  advancePercentage?: unknown;
}

export interface SessionUserLike {
  id?: string | number | null;
  name?: string | null;
  userName?: string | null;
  email?: string | null;
  orgId?: string | number | null;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asBoolean(value: unknown, defaultValue = false): boolean {
  if (value === null || value === undefined || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "y" || v === "yes" || v === "1") return true;
    if (v === "false" || v === "n" || v === "no" || v === "0") return false;
  }
  if (typeof value === "number") return value !== 0;
  return defaultValue;
}

/**
 * Build a Direct PO draft from tool args + session context.
 * Auto-resolves requestor (session) and currency (args or AED default).
 * Buyer is populated from session when not provided (existing agent behavior; not mandatory).
 * Business entity: only a numeric orgId counts; pass options.resolvedOrg after name→id lookup.
 * A bare name in orgId (e.g. "ProductionQA") is invalid — never treat it as resolved.
 */
export function buildDirectPoDraft(
  args: DirectPoToolArgs,
  sessionUser?: SessionUserLike | null,
  options?: {
    supplierNameFromLookup?: string | null;
    resolvedOrg?: { orgId: number; orgName: string } | null;
    resolvedBudget?: { budgetId: number; budgetName: string } | null;
    resolvedDepartment?: { departmentId: number; departmentName: string } | null;
    resolvedLocation?: { locationId: number; locationName: string } | null;
    resolvedPaymentTerms?: { paymentTermsId: string; paymentTermsName: string } | null;
    resolvedBuyer?: { buyerId: string | number; buyerName: string; buyerEmail?: string | null } | null;
    /** Org/Admin default currency when user did not specify one. */
    defaultCurrency?: string | null;
  },
): DirectPoDraft {
  const descriptionRaw = asString(args.description);
  const supplierIdNum = asNumber(args.supplierId);
  const supplierName =
    asString(args.supplierName) ||
    asString(options?.supplierNameFromLookup) ||
    null;

  const currencyArg = asString(args.currency);
  const requiredDate = asString(args.requiredDate);

  const locationNameArg = asString(args.deliveryLocationName);
  const rawLocation = args.deliveryLocation;
  const numericLocationId = parseCanonicalNumericId(rawLocation);
  const locationLooksLikeName =
    rawLocation !== undefined &&
    rawLocation !== null &&
    rawLocation !== "" &&
    numericLocationId == null;

  const deptNameArg = asString(args.requestorDepartmentName);
  const rawDept = args.requestorDepartment;
  const numericDeptId = parseCanonicalNumericId(rawDept);
  const deptLooksLikeName =
    rawDept !== undefined &&
    rawDept !== null &&
    rawDept !== "" &&
    numericDeptId == null;

  const orgNameArg = asString(args.orgName);
  const rawOrgId = args.orgId;
  const numericFromArgs = parseNumericOrgId(rawOrgId);
  const orgIdLooksLikeName =
    rawOrgId !== undefined &&
    rawOrgId !== null &&
    rawOrgId !== "" &&
    numericFromArgs == null;

  const budgetNameArg = asString(args.budgetName);
  const rawBudgetId = args.budgetId;
  const numericBudgetId = parseCanonicalNumericId(rawBudgetId);
  const budgetLooksLikeName =
    rawBudgetId !== undefined &&
    rawBudgetId !== null &&
    rawBudgetId !== "" &&
    numericBudgetId == null;

  const paymentTermsNameArg = asString(args.paymentTermsName);
  const rawPaymentTermsId = args.paymentTermsId;
  const numericPaymentTermsId = parseCanonicalNumericId(rawPaymentTermsId);
  const paymentTermsIdStr =
    rawPaymentTermsId !== undefined && rawPaymentTermsId !== null && rawPaymentTermsId !== ""
      ? String(rawPaymentTermsId).trim()
      : null;
  const paymentTermsLooksLikeName =
    paymentTermsIdStr != null &&
    numericPaymentTermsId == null &&
    (/\s/.test(paymentTermsIdStr) ||
      /days/i.test(paymentTermsIdStr) ||
      /^net\s/i.test(paymentTermsIdStr));

  const advanceFlag = asBoolean(args.advanceFlag, false);
  const advancePctRaw =
    args.advancePercentage === null || args.advancePercentage === undefined
      ? null
      : typeof args.advancePercentage === "number"
        ? args.advancePercentage
        : asString(args.advancePercentage);

  const sessionRequestorId = sessionUser?.id ?? null;
  const sessionRequestorName =
    asString(sessionUser?.name) || asString(sessionUser?.userName) || null;
  const sessionEmail = asString(sessionUser?.email);

  const requestorIdArg =
    args.requestorId !== undefined && args.requestorId !== null && args.requestorId !== ""
      ? (asNumber(args.requestorId) ?? asString(args.requestorId))
      : null;
  const requestorNameArg = asString(args.requestorName);

  const resolvedBuyer = options?.resolvedBuyer;
  const buyerIdArg =
    resolvedBuyer?.buyerId != null && String(resolvedBuyer.buyerId).trim() !== ""
      ? (asNumber(resolvedBuyer.buyerId) ?? asString(resolvedBuyer.buyerId))
      : args.buyerId !== undefined && args.buyerId !== null && args.buyerId !== ""
        ? (asNumber(args.buyerId) ?? asString(args.buyerId))
        : null;
  const buyerNameArg =
    asString(resolvedBuyer?.buyerName) || asString(args.buyerName);
  const buyerEmailArg =
    asString(resolvedBuyer?.buyerEmail) || asString(args.buyerEmail);
  const buyerSource = resolvedBuyer?.buyerId != null
    ? "po_history_or_lookup"
    : undefined;

  const resolved = options?.resolvedOrg;
  let orgIdField: DirectPoField<number>;
  let orgNameField: DirectPoField<string>;

  if (resolved && Number.isFinite(resolved.orgId)) {
    orgIdField = field(Number(resolved.orgId), "resolved", "business_entity_lookup");
    orgNameField = resolved.orgName
      ? field(resolved.orgName, "resolved", "business_entity_lookup")
      : unresolved("Business entity name not resolved");
  } else if (orgIdLooksLikeName) {
    orgIdField = {
      value: null,
      status: "invalid",
      source: "tool_args",
      message: `Business Entity "${String(rawOrgId)}" is a name, not a numeric orgId. Resolve via search_organizations / orgName.`,
    };
    orgNameField = asString(rawOrgId)
      ? field(asString(rawOrgId)!, "extracted", "tool_args_orgId_misused_as_name")
      : orgNameArg
        ? field(orgNameArg, "extracted", "tool_args")
        : unresolved("Provide Business Entity by name");
  } else if (numericFromArgs != null) {
    orgIdField = field(numericFromArgs, "resolved", "tool_args");
    orgNameField = orgNameArg
      ? field(orgNameArg, "resolved", "tool_args")
      : unresolved("Business entity display name not set");
  } else if (orgNameArg) {
    orgIdField = unresolved(
      `Business Entity "${orgNameArg}" is not yet resolved to a numeric orgId — use search_organizations`,
    );
    orgNameField = field(orgNameArg, "extracted", "tool_args");
  } else {
    orgIdField = unresolved(
      "Business entity is derived from the selected Budget when available — or provide the name (e.g. ProductionQA); do not invent an ID",
    );
    orgNameField = unresolved();
  }

  // Budget
  let budgetIdField: DirectPoField<number>;
  let budgetNameField: DirectPoField<string>;
  if (options?.resolvedBudget && Number.isFinite(options.resolvedBudget.budgetId)) {
    budgetIdField = field(Number(options.resolvedBudget.budgetId), "resolved", "budget_lookup");
    budgetNameField = field(options.resolvedBudget.budgetName, "resolved", "budget_lookup");
  } else if (budgetLooksLikeName) {
    budgetIdField = {
      value: null,
      status: "invalid",
      source: "tool_args",
      message: `Budget "${String(rawBudgetId)}" is not a numeric budget line id. Resolve via search_budgets / budgetName.`,
    };
    budgetNameField = asString(rawBudgetId)
      ? field(asString(rawBudgetId)!, "extracted", "tool_args_budgetId_misused_as_name")
      : budgetNameArg
        ? field(budgetNameArg, "extracted", "tool_args")
        : unresolved();
  } else if (numericBudgetId != null) {
    budgetIdField = field(numericBudgetId, "resolved", "tool_args");
    budgetNameField = budgetNameArg
      ? field(budgetNameArg, "resolved", "tool_args")
      : unresolved("Budget display name not set");
  } else if (budgetNameArg) {
    budgetIdField = unresolved(
      `Budget "${budgetNameArg}" is not yet resolved — use search_budgets`,
    );
    budgetNameField = field(budgetNameArg, "extracted", "tool_args");
  } else {
    budgetIdField = unresolved(
      "Budget will be AI-matched from your request when you call prepare — or provide a budget name/code",
    );
    budgetNameField = unresolved();
  }

  // Department
  let deptIdField: DirectPoField<string>;
  let deptNameField: DirectPoField<string>;
  if (options?.resolvedDepartment && Number.isFinite(options.resolvedDepartment.departmentId)) {
    deptIdField = field(String(options.resolvedDepartment.departmentId), "resolved", "department_lookup");
    deptNameField = field(options.resolvedDepartment.departmentName, "resolved", "department_lookup");
  } else if (deptLooksLikeName) {
    deptIdField = {
      value: null,
      status: "invalid",
      source: "tool_args",
      message: `Department "${String(rawDept)}" is a name, not a numeric id. Resolve via search_departments.`,
    };
    deptNameField = asString(rawDept)
      ? field(asString(rawDept)!, "extracted", "tool_args_dept_misused_as_name")
      : deptNameArg
        ? field(deptNameArg, "extracted", "tool_args")
        : unresolved();
  } else if (numericDeptId != null) {
    deptIdField = field(String(numericDeptId), "resolved", "tool_args");
    deptNameField = deptNameArg
      ? field(deptNameArg, "resolved", "tool_args")
      : unresolved("Department display name not set");
  } else if (deptNameArg) {
    deptIdField = unresolved(`Department "${deptNameArg}" is not yet resolved — use search_departments`);
    deptNameField = field(deptNameArg, "extracted", "tool_args");
  } else {
    deptIdField = unresolved(
      "Department is derived from the selected Budget when available — or provide the name (e.g. IT)",
    );
    deptNameField = unresolved();
  }

  // Delivery location
  let locationIdField: DirectPoField<string>;
  let locationNameField: DirectPoField<string>;
  if (options?.resolvedLocation && Number.isFinite(options.resolvedLocation.locationId)) {
    locationIdField = field(String(options.resolvedLocation.locationId), "resolved", "location_lookup");
    locationNameField = field(options.resolvedLocation.locationName, "resolved", "location_lookup");
  } else if (locationLooksLikeName) {
    locationIdField = {
      value: null,
      status: "invalid",
      source: "tool_args",
      message: `Delivery Location "${String(rawLocation)}" is a name, not a numeric id. Resolve via search_locations.`,
    };
    locationNameField = asString(rawLocation)
      ? field(asString(rawLocation)!, "extracted", "tool_args_location_misused_as_name")
      : locationNameArg
        ? field(locationNameArg, "extracted", "tool_args")
        : unresolved();
  } else if (numericLocationId != null) {
    locationIdField = field(String(numericLocationId), "resolved", "tool_args");
    locationNameField = locationNameArg
      ? field(locationNameArg, "resolved", "tool_args")
      : unresolved("Delivery location display name not set");
  } else if (locationNameArg) {
    locationIdField = unresolved(
      `Delivery Location "${locationNameArg}" is not yet resolved — use search_locations`,
    );
    locationNameField = field(locationNameArg, "extracted", "tool_args");
  } else {
    locationIdField = unresolved(
      "Delivery location is derived from the selected Budget when available — or provide the name (e.g. Mumbai)",
    );
    locationNameField = unresolved();
  }

  // Payment terms
  let paymentTermsIdField: DirectPoField<string>;
  let paymentTermsNameField: DirectPoField<string>;
  if (options?.resolvedPaymentTerms?.paymentTermsId) {
    paymentTermsIdField = field(
      String(options.resolvedPaymentTerms.paymentTermsId),
      "resolved",
      "payment_terms_lookup",
    );
    paymentTermsNameField = field(
      options.resolvedPaymentTerms.paymentTermsName,
      "resolved",
      "payment_terms_lookup",
    );
  } else if (paymentTermsLooksLikeName) {
    paymentTermsIdField = {
      value: null,
      status: "invalid",
      source: "tool_args",
      message: `Payment Terms "${paymentTermsIdStr}" looks like a display name. Resolve via search_payment_terms.`,
    };
    paymentTermsNameField = paymentTermsIdStr
      ? field(paymentTermsIdStr, "extracted", "tool_args_pt_misused_as_name")
      : paymentTermsNameArg
        ? field(paymentTermsNameArg, "extracted", "tool_args")
        : unresolved();
  } else if (paymentTermsIdStr) {
    paymentTermsIdField = field(paymentTermsIdStr, "resolved", "tool_args");
    paymentTermsNameField = paymentTermsNameArg
      ? field(paymentTermsNameArg, "resolved", "tool_args")
      : unresolved("Payment terms display name not set");
  } else if (paymentTermsNameArg) {
    paymentTermsIdField = unresolved(
      `Payment Terms "${paymentTermsNameArg}" is not yet resolved — use search_payment_terms`,
    );
    paymentTermsNameField = field(paymentTermsNameArg, "extracted", "tool_args");
  } else {
    paymentTermsIdField = unresolved(
      "Payment terms are required — provide a name (e.g. Net 30) or rely on Admin Payment Settings default",
    );
    paymentTermsNameField = unresolved();
  }

  return {
    description: descriptionRaw
      ? field(descriptionRaw, "resolved", "user_prompt")
      : unresolved("PO description is required"),

    supplierId: supplierIdNum != null
      ? field(supplierIdNum, "resolved", "tool_args")
      : unresolved("Vendor (supplierId) is required — use search_vendors to resolve by name"),

    supplierName: supplierName
      ? field(supplierName, "resolved", options?.supplierNameFromLookup ? "vendor_lookup" : "tool_args")
      : unresolved("Supplier name not resolved"),

    deliveryLocation: locationIdField,
    deliveryLocationName: locationNameField,

    requiredDate: requiredDate
      ? field(requiredDate, "resolved", "user_prompt")
      : unresolved("Required / need-by date is mandatory"),

    requestorId: requestorIdArg != null
      ? field(requestorIdArg, "resolved", "tool_args")
      : sessionRequestorId != null
        ? field(sessionRequestorId, "resolved", "session_user")
        : unresolved("Requestor could not be resolved from session"),

    requestorName: requestorNameArg
      ? field(requestorNameArg, "resolved", "tool_args")
      : sessionRequestorName
        ? field(sessionRequestorName, "resolved", "session_user")
        : unresolved(),

    requestorDepartment: deptIdField,
    requestorDepartmentName: deptNameField,

    buyerId: buyerIdArg != null
      ? field(buyerIdArg, "resolved", buyerSource || "tool_args")
      : sessionRequestorId != null
        ? field(sessionRequestorId, "resolved", "session_user")
        : unresolved("Buyer could not be resolved"),

    buyerName: buyerNameArg
      ? field(buyerNameArg, "resolved", buyerSource || "tool_args")
      : sessionRequestorName
        ? field(sessionRequestorName, "resolved", "session_user")
        : unresolved(),

    buyerEmail: buyerEmailArg
      ? field(buyerEmailArg, "resolved", buyerSource || "tool_args")
      : sessionEmail
        ? field(sessionEmail, "resolved", "session_user")
        : unresolved(),

    orgId: orgIdField,
    orgName: orgNameField,

    currency: currencyArg
      ? field(currencyArg.toUpperCase(), "resolved", "user_prompt")
      : asString(options?.defaultCurrency)
        ? field(String(options!.defaultCurrency).trim().toUpperCase(), "resolved", "org_default")
        : field(DIRECT_PO_DEFAULT_CURRENCY, "resolved", "system_default"),

    budgetId: budgetIdField,
    budgetName: budgetNameField,

    paymentTermsId: paymentTermsIdField,
    paymentTermsName: paymentTermsNameField,

    advanceFlag: field(advanceFlag, "resolved", "tool_args_or_default"),

    advancePercentage: advanceFlag
      ? isPresent(advancePctRaw)
        ? field(advancePctRaw as string | number, "resolved", "tool_args")
        : unresolved("Advance percentage is required when advance payment is enabled")
      : field(advancePctRaw ?? null, "resolved", "not_required"),
  };
}

export interface DirectPoValidationResult {
  ok: boolean;
  draft: DirectPoDraft;
  missingFields: DirectPoMandatoryKey[];
  invalidFields: DirectPoMandatoryKey[];
  /** Human-readable labels for missing/invalid mandatory fields. */
  unresolvedLabels: string[];
}

function isFieldSatisfied(f: DirectPoField): boolean {
  return (f.status === "resolved" || f.status === "extracted") && isPresent(f.value);
}

/**
 * Validate mandatory Direct PO header fields (manual Create PO parity).
 * advancePercentage is mandatory only when advanceFlag is true.
 * orgId must be a finite integer — names like "ProductionQA" are invalid.
 */
export function validateDirectPoMandatoryFields(draft: DirectPoDraft): DirectPoValidationResult {
  const missingFields: DirectPoMandatoryKey[] = [];
  const invalidFields: DirectPoMandatoryKey[] = [];

  for (const key of DIRECT_PO_MANDATORY_FIELDS) {
    const f = draft[key];
    if (key === "orgId") {
      if (f.status === "invalid" || (isPresent(f.value) && !isNumericOrgId(f.value))) {
        if (isPresent(f.value) && !isNumericOrgId(f.value)) {
          draft.orgId = {
            value: null,
            status: "invalid",
            source: f.source,
            message: `orgId must be numeric; got "${String(f.value)}"`,
          };
        }
        invalidFields.push("orgId");
        continue;
      }
      if (!isFieldSatisfied(f) || !isNumericOrgId(f.value)) {
        missingFields.push("orgId");
      }
      continue;
    }
    if (key === "budgetId") {
      if (f.status === "invalid" || (isPresent(f.value) && !isCanonicalNumericId(f.value))) {
        if (isPresent(f.value) && !isCanonicalNumericId(f.value)) {
          draft.budgetId = {
            value: null,
            status: "invalid",
            source: f.source,
            message: `budgetId must be numeric; got "${String(f.value)}"`,
          };
        }
        invalidFields.push("budgetId");
        continue;
      }
      if (!isFieldSatisfied(f) || !isCanonicalNumericId(f.value)) {
        missingFields.push("budgetId");
      }
      continue;
    }
    if (key === "requestorDepartment" || key === "deliveryLocation") {
      if (f.status === "invalid" || (isPresent(f.value) && !isCanonicalNumericId(f.value))) {
        if (isPresent(f.value) && !isCanonicalNumericId(f.value)) {
          (draft as any)[key] = {
            value: null,
            status: "invalid",
            source: f.source,
            message: `${key} must be a numeric id; got "${String(f.value)}"`,
          };
        }
        invalidFields.push(key);
        continue;
      }
      if (!isFieldSatisfied(f) || !isCanonicalNumericId(f.value)) {
        missingFields.push(key);
      }
      continue;
    }
    if (f.status === "invalid") {
      invalidFields.push(key);
      continue;
    }
    if (!isFieldSatisfied(f)) {
      missingFields.push(key);
    }
  }

  const advanceOn = draft.advanceFlag.value === true;
  if (advanceOn) {
    const pct = draft.advancePercentage;
    if (pct.status === "invalid") {
      invalidFields.push("advancePercentage");
    } else if (!isFieldSatisfied(pct)) {
      missingFields.push("advancePercentage");
    } else {
      const n = typeof pct.value === "number" ? pct.value : Number(pct.value);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        invalidFields.push("advancePercentage");
        draft.advancePercentage = {
          ...pct,
          status: "invalid",
          message: "Advance percentage must be a number between 0 and 100",
        };
      }
    }
  }

  const unresolvedLabels = [
    ...missingFields.map((k) => DIRECT_PO_FIELD_LABELS[k]),
    ...invalidFields.map((k) => `${DIRECT_PO_FIELD_LABELS[k]} (invalid)`),
  ];

  return {
    ok: missingFields.length === 0 && invalidFields.length === 0,
    draft,
    missingFields,
    invalidFields,
    unresolvedLabels,
  };
}

/** Flatten draft into pendingAction / execute tool data (API field names). */
export function flattenDirectPoDraft(draft: DirectPoDraft): Record<string, unknown> {
  return {
    description: draft.description.value,
    supplierId: draft.supplierId.value,
    supplierName: draft.supplierName.value,
    deliveryLocation: draft.deliveryLocation.value,
    deliveryLocationName: draft.deliveryLocationName.value,
    requiredDate: draft.requiredDate.value,
    requestorId: draft.requestorId.value,
    requestorName: draft.requestorName.value,
    requestorDepartment: draft.requestorDepartment.value,
    requestorDepartmentName: draft.requestorDepartmentName.value,
    buyerId: draft.buyerId.value,
    buyerName: draft.buyerName.value,
    buyerEmail: draft.buyerEmail.value,
    orgId: draft.orgId.value,
    orgName: draft.orgName.value,
    currency: draft.currency.value,
    budgetId: draft.budgetId.value,
    budgetName: draft.budgetName.value,
    paymentTermsId: draft.paymentTermsId.value,
    paymentTermsName: draft.paymentTermsName.value,
    advanceFlag: draft.advanceFlag.value === true,
    advancePercentage:
      draft.advanceFlag.value === true
        ? draft.advancePercentage.value != null
          ? String(draft.advancePercentage.value)
          : null
        : draft.advancePercentage.value != null
          ? String(draft.advancePercentage.value)
          : "",
  };
}

/**
 * Build the body for procService.createPurchaseOrder from a validated draft.
 * Call only after validateDirectPoMandatoryFields(...).ok === true.
 */
export function toCreatePurchaseOrderPayload(draft: DirectPoDraft): DirectPoHeaderPayload {
  return {
    description: String(draft.description.value).trim(),
    poType: "Standard",
    supplierId: Number(draft.supplierId.value),
    supplierName: draft.supplierName.value != null ? String(draft.supplierName.value) : null,
    deliveryLocation: String(draft.deliveryLocation.value),
    requiredDate: String(draft.requiredDate.value),
    requestorId: draft.requestorId.value as string | number,
    requestorName: draft.requestorName.value != null ? String(draft.requestorName.value) : null,
    requestorDepartment: String(draft.requestorDepartment.value),
    buyerId: draft.buyerId.value ?? null,
    buyerName: draft.buyerName.value != null ? String(draft.buyerName.value) : null,
    buyerEmail: draft.buyerEmail.value != null ? String(draft.buyerEmail.value) : null,
    orgId: Number(draft.orgId.value),
    orgName: draft.orgName.value != null ? String(draft.orgName.value) : null,
    currency: String(draft.currency.value),
    budgetId: Number(draft.budgetId.value),
    budgetName: draft.budgetName.value != null ? String(draft.budgetName.value) : null,
    paymentTermsId: String(draft.paymentTermsId.value),
    paymentTermsName: draft.paymentTermsName.value != null ? String(draft.paymentTermsName.value) : null,
    advanceFlag: draft.advanceFlag.value === true,
    advancePercentage:
      draft.advanceFlag.value === true
        ? draft.advancePercentage.value != null
          ? String(draft.advancePercentage.value)
          : null
        : "",
  };
}

/** Markdown summary of resolved vs still-needed fields for the agent reply. */
export function formatDirectPoValidationMessage(
  validation: DirectPoValidationResult,
  options?: { heading?: string },
): string {
  const { draft, unresolvedLabels, ok } = validation;
  const heading = options?.heading ?? "Direct PO — missing required fields";

  const resolvedLines: string[] = [];
  if (isFieldSatisfied(draft.description)) {
    resolvedLines.push(`- **Description:** ${draft.description.value}`);
  }
  if (isFieldSatisfied(draft.supplierId) || isFieldSatisfied(draft.supplierName)) {
    const name = draft.supplierName.value || `ID ${draft.supplierId.value}`;
    resolvedLines.push(`- **Vendor:** ${name}`);
  }
  if (isFieldSatisfied(draft.requestorId)) {
    const name = draft.requestorName.value ? ` — ${draft.requestorName.value}` : "";
    resolvedLines.push(`- **Requestor:** ${draft.requestorId.value}${name}`);
  }
  if (isFieldSatisfied(draft.currency)) {
    resolvedLines.push(`- **Currency:** ${draft.currency.value}`);
  }
  if (isFieldSatisfied(draft.requiredDate)) {
    resolvedLines.push(`- **Need By Date:** ${draft.requiredDate.value}`);
  }
  if (isFieldSatisfied(draft.budgetId) || isFieldSatisfied(draft.budgetName)) {
    const label = draft.budgetName.value || `ID ${draft.budgetId.value}`;
    resolvedLines.push(`- **Budget:** ${label}`);
  }
  if (isFieldSatisfied(draft.orgId) || isFieldSatisfied(draft.orgName)) {
    const label = draft.orgName.value || `ID ${draft.orgId.value}`;
    resolvedLines.push(`- **Business Entity:** ${label}`);
  }
  if (isFieldSatisfied(draft.deliveryLocation) || isFieldSatisfied(draft.deliveryLocationName)) {
    const label = draft.deliveryLocationName.value || draft.deliveryLocation.value;
    resolvedLines.push(`- **Delivery Location:** ${label}`);
  }
  if (isFieldSatisfied(draft.requestorDepartment) || isFieldSatisfied(draft.requestorDepartmentName)) {
    const label = draft.requestorDepartmentName.value || draft.requestorDepartment.value;
    resolvedLines.push(`- **Department:** ${label}`);
  }
  if (isFieldSatisfied(draft.paymentTermsId) || isFieldSatisfied(draft.paymentTermsName)) {
    const label = draft.paymentTermsName.value || draft.paymentTermsId.value;
    resolvedLines.push(`- **Payment Terms:** ${label}`);
  }
  if (draft.advanceFlag.value === true) {
    resolvedLines.push(
      `- **Advance Payment:** Yes` +
        (isFieldSatisfied(draft.advancePercentage)
          ? ` (${draft.advancePercentage.value}%)`
          : ""),
    );
  }

  if (ok) {
    return `## Direct PO ready for confirmation\n\nAll mandatory header fields are resolved.\n`;
  }

  let msg = `## ${heading}\n\n`;
  msg += `I can create this Direct PO only after every mandatory field is resolved. `;
  msg += `I will **not** create the PO until the gaps below are filled.\n\n`;

  if (resolvedLines.length) {
    msg += `**Already resolved:**\n${resolvedLines.join("\n")}\n\n`;
  }

  msg += `**Still needed (ask only for these):**\n`;
  for (const label of unresolvedLabels) {
    msg += `- ${label}\n`;
  }
  msg += `\nProvide the missing values by name where possible (e.g. Business Entity "ProductionQA"); I will resolve IDs.`;
  return msg;
}

/** Preview markdown when validation passed and prepare may emit pendingAction. */
export function formatDirectPoPreparePreview(draft: DirectPoDraft): string {
  let summary = `I have prepared the Purchase Order:\n\n`;
  summary += `**Description:** ${draft.description.value}\n`;
  summary += `**Supplier:** ${draft.supplierName.value || "N/A"}\n`;
  summary += `**Budget:** ${draft.budgetName.value || draft.budgetId.value}\n`;
  summary += `**Requestor:** ${draft.requestorName.value || draft.requestorId.value}\n`;
  summary += `**Buyer:** ${draft.buyerName.value || draft.buyerId.value || "N/A"}\n`;
  summary += `**Need By Date:** ${draft.requiredDate.value}\n`;
  summary += `**Business Entity:** ${draft.orgName.value || "N/A"}\n`;
  summary += `**Delivery Location:** ${draft.deliveryLocationName.value || draft.deliveryLocation.value}\n`;
  summary += `**Department:** ${draft.requestorDepartmentName.value || draft.requestorDepartment.value}\n`;
  summary += `**Currency:** ${draft.currency.value}\n`;
  summary += `**Payment Terms:** ${draft.paymentTermsName.value || draft.paymentTermsId.value}\n`;
  if (draft.advanceFlag.value) {
    summary += `**Advance Payment:** ${draft.advancePercentage.value}%\n`;
  }
  summary += `\nPlease confirm if you would like me to create this Purchase Order.\n`;
  return summary;
}
