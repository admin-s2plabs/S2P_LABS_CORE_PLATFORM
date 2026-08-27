import { z } from "zod";
import { pool } from "../_shared";
import { getContextPool } from "../../tenant-context";
const getPool = () => getContextPool() ?? pool;
import { updatePOTotals } from "../_shared";
import { logAudit } from "../administration/administration.service";
import * as bidRepo from "../bids/bids.repository";
import { storage } from "../../storage";
import { insertCategorySchema, insertItemSchema } from "@shared/schema";
import * as repo from "./procurement.repository";
import {
  mergeRequisitionHeader,
  type RequisitionHeaderPatch,
} from "./requisition-header-patch";
import {
  mergeRequisitionLine,
  type RequisitionLinePatch,
} from "./requisition-line-patch";
import {
  mergePurchaseOrderHeader,
  type PurchaseOrderHeaderPatch,
} from "./purchase-order-header-patch";
import {
  mergePurchaseOrderLine,
  type PurchaseOrderLinePatch,
} from "./purchase-order-line-patch";
import {
  checkRequisitionSubmitReadiness,
  describeMissingRequirements,
} from "@shared/requisition-submit-readiness";
import { suggestItemsFromDescription, parseNaturalLanguageToItems, checkDuplicatePR, predictQuantity, validateBudget, recommendVendors, getSmartRecommendations } from "../../services/pr-ai-service";
import {
  prLineBudgetTotalWithTaxRate,
  sumPoLinesBudgetTotal,
  sumPrLinePreTaxAmounts,
} from "../_shared/budget-amounts";
import * as validationHelper from "../../services/validation-helper";
import {
  isExportAllRows,
  listPaginationMeta,
  parseListPageLimit,
} from "../_shared/list-pagination";
import {EventTypes, PRCancelEvent, VendorRegistrationEvent} from "../../services/eventBus/events";
import { workflowService } from "../../services/workflowService";
import { publishTaskAssignmentEvent } from "../../services/eventBus/publishTaskAssignment";
import * as adminRepo from "../administration/administration.repository.ts";
import {eventBus} from "../../services/eventBus";
import * as userRepository from "../common/common.repository";
import * as formService from "../survey-form/surveyform.service";

export async function suggestItems(title: string, description: string, department: string) {
  return suggestItemsFromDescription(title, description, department);
}

export async function parseText(text: string) {
  return parseNaturalLanguageToItems(text);
}

export async function checkDuplicate(title: string, description: string, department: string) {
  return checkDuplicatePR(title, description, department);
}

export async function predictQty(itemDescription: string, department: string, existingQuantity: any, budgetLineId?: number | null) {
  return predictQuantity(itemDescription, department, existingQuantity, budgetLineId);
}

export async function validateBudgetAmount(department: string, totalAmount: number, title: string, budgetLineId: number | null, prCurrency: string, fromPR?: boolean, prNumber?: string, fromBid?: boolean, bidAwardId?: string) {
  return validateBudget(department, totalAmount, title, budgetLineId, prCurrency, fromPR, fromBid, prNumber, bidAwardId);
}

export async function recommendVendorsForItems(lineItems: any[]) {
  return recommendVendors(lineItems);
}

/**
 * Whether this user is allowed to act on `prNumber` — i.e. whether the PR appears in their
 * own Requisitions list. Callers must treat `false` as "not found" rather than "forbidden",
 * so a hidden PR is indistinguishable from one that does not exist.
 */
export async function canUserAccessPr(prNumber: string, sessionUser?: any): Promise<boolean> {
  const pr = String(prNumber || "").trim();
  if (!pr) return false;

  const userId = Number(sessionUser?.id);
  if (!Number.isFinite(userId)) return false;

  const role = String(sessionUser?.userRole || "");
  const isAdmin = role === "ROLE_SUPERADMIN" || role === "ROLE_SYSADMIN";
  if (isAdmin) return true;

  // Read org/department off the user row, matching how getRequisitions resolves them.
  const loggedInUser = await repo.getUserById(userId);
  if (!loggedInUser) return false;

  // buildPrRequisitionWhereClause skips org scoping entirely when orgid is blank, which
  // would let a non-admin through unfiltered. No entities means nothing is visible.
  const orgid = String(loggedInUser.attribute_12 || sessionUser?.orgIds || "").trim();
  if (!orgid) return false;

  return repo.isPrVisibleToUser(pr, {
    role,
    orgid,
    userDepartment: loggedInUser.department_name,
    userId,
    username: loggedInUser.user_name,
  });
}

export async function getRequisitions(query: any, role: string, orgid: string, userDepartment: string, userId?: any) {
  const { status, department, search, page = "1", limit = "50", exportLines: exportLinesRaw, readyForSourcing: readyForSourcingRaw } = query;
  const { page: pageNum, limit: limitNum } = parseListPageLimit(page, limit, {
    page: 1,
    limit: 50,
  });
  const exportLines = isExportAllRows(exportLinesRaw, limitNum);
  const loggedInUser = await repo.getUserById(userId);
  if (!loggedInUser) {
    throw { status: 401, message: "Unauthorized" };
  }
  const filterParams = {
    status: status as string,
    department: department as string,
    search: search as string,
    role: role,
    orgid: loggedInUser.attribute_12 || orgid,
    userDepartment: loggedInUser.department_name,
    userId: userId,
    username: loggedInUser.user_name,
    readyForSourcing: readyForSourcingRaw === true || readyForSourcingRaw === "true",
  };
  const result = await repo.getRequisitions({
    ...filterParams,
    page: pageNum,
    limit: limitNum,
  });

  const finalResult = await Promise.all(
    result.rows.map(async (row) => {
      const currentApprover = await repo.getCurrentApprover(row.pr_number, "Purchase Request");
  
      return {
        ...row,
        currentApprover: currentApprover?.name || null,
      };
    })
  );

  const exportLineRows = exportLines ? await repo.getRequisitionExportLineRows(filterParams) : undefined;

  return {
    data: finalResult,
    pagination: listPaginationMeta(result.total, pageNum, limitNum),
    ...(exportLineRows !== undefined ? { exportLines: exportLineRows } : {}),
  };
}

export async function createRequisition(body: any) {
  const {
    description, deliveryLocation, needByDate,
    requestorId, requestorName, requestorDepartment,
    buyerId, buyerName, currency, budgetId, isBudgeted,
    orgId: bodyOrgId,
  } = body;

  const maxSeq = await repo.getMaxPrSequence();
  const nextSeq = maxSeq + 1;
  const prPrefix = await repo.getPrPrefixValue();
  const prNumber = `${prPrefix}_${nextSeq.toString().padStart(5, "0")}`;

  const reqId = requestorId ? parseInt(requestorId) : null;
  const reqName = requestorName || null;

  let reqEmail: string | null = null;
  let orgId: number | null = bodyOrgId ? parseInt(bodyOrgId) : null;
  if (requestorId) {
    const userResult = await getPool().query(
      `SELECT email_id, org_id FROM dbo.um_user_dtls WHERE id = $1`,
      [parseInt(requestorId)]
    );
    if (userResult.rows.length > 0) {
      reqEmail = userResult.rows[0].email_id;
      if (orgId === null) {
        orgId = userResult.rows[0].org_id;
      }
    }
  }

  const ownerId = buyerId ? parseInt(buyerId) : null;
  const ownerName = buyerName || null;

  let ownerEmail: string | null = null;
  if (buyerId) {
    const buyerResult = await getPool().query(
      `SELECT email_id FROM dbo.um_user_dtls WHERE id = $1`,
      [parseInt(buyerId)]
    );
    if (buyerResult.rows.length > 0) {
      ownerEmail = buyerResult.rows[0].email_id;
    }
  }

  let deptName: string | null = null;
  if (requestorDepartment) {
    deptName = await repo.getDepartmentById(parseInt(requestorDepartment));
  }

  let locId = deliveryLocation;
  let locName: string | null = null;
  if (deliveryLocation) {
    if(deliveryLocation.includes("LOC")) {
      locId = deliveryLocation.replace("LOC", "");
    }
    const loc = await repo.getLocationById(parseInt(locId));
    if (loc) {
      locId = loc.id;
      locName = loc.location_name;
    }
  }

  let budName: string | null = null;
  let budSegment: number | null = null;
  if (budgetId) {
    const budget = await repo.getBudgetLineById(parseInt(budgetId));
    if (budget) {
      const masterName = budget.budget_name || "";
      const lineName = budget.segment_dtl_name || "";
      budName = `${masterName} . ${lineName}`;
      budSegment = budget.id;
    }
  }

  await repo.insertRequisition({
    prNumber,
    description,
    deptName,
    reqId,
    reqName,
    reqEmail,
    ownerId,
    ownerName,
    ownerEmail,
    locId,
    locName,
    needByDate: needByDate ? new Date(needByDate) : null,
    budName,
    budSegment,
    budgeted: isBudgeted === "yes",
    currency: currency || "INR",
    orgId,
    createdBy: reqName || "system",
  });

  return { success: true, prNumber, message: "PR created successfully" };
}

export async function copyRequisition(prNumber: string) {
  const header = await repo.getRequisitionByPrNumber(prNumber);
  if (!header) throw { status: 404, message: "Requisition not found" };

  const lines = await repo.getRequisitionLines(prNumber);

  // Generate new PR number
  const maxSeq = await repo.getMaxPrSequence();
  const prPrefix = await repo.getPrPrefixValue();
  const newPrNumber = `${prPrefix}_${(maxSeq + 1).toString().padStart(5, "0")}`;

  await repo.insertRequisition({
    prNumber: newPrNumber,
    description: header.pr_description ? `Copy of ${header.pr_description}` : `Copy of ${prNumber}`,
    deptName: header.department_name ?? null,
    reqId: header.requestor_id ?? null,
    reqName: header.requestor_name ?? null,
    reqEmail: header.requestor_email ?? null,
    ownerId: header.pr_owner_id ?? null,
    ownerName: header.pr_owner_name ?? null,
    ownerEmail: header.pr_owner_email ?? null,
    locId: header.delivertto_location_id ?? null,
    locName: header.delivertto_location_name ?? null,
    needByDate: header.delivery_date ? new Date(header.delivery_date) : null,
    budName: header.budget_name ?? null,
    budSegment: header.budget_segment ? parseInt(header.budget_segment) : null,
    budgeted: header.budgeted ?? false,
    currency: header.currency || "AED",
    orgId: header.org_id ?? null,
    createdBy: header.requestor_name || "system",
  });

  // Copy all line items to the new PR
  for (const line of lines) {
    const nextId = await repo.getNextPrLineId();
    const lineNum = await repo.getNextPrLineNum(newPrNumber);
    await repo.insertPrLine({
      id: nextId,
      prNumber: newPrNumber,
      lineNum,
      itemDescription: line.item_description,
      qty: parseFloat(line.qty) || 1,
      uom: line.uom || "Each",
      unitCost: parseFloat(line.unit_cost) || 0,
      amount: parseFloat(line.amount) || 0,
      categoryId: line.product_category ? String(line.product_category) : null,
      categoryName: line.product_category_name ?? null,
      itemId: line.item_id ? String(line.item_id) : null,
      currency: line.curr_code || header.currency || "AED",
    });
  }

  await repo.updatePrTotalAmount(newPrNumber);

  return { success: true, prNumber: newPrNumber, message: "PR copied successfully" };
}

export async function getRequisitionStats(department: any, userRole: any, orgIds: any,userId: any, username: any) {
  return repo.getRequisitionStats(department, userRole, orgIds,userId, username);
}

export async function getPrStatsByDepartment(sessionUser: any) {
  return repo.getPrStatsByDepartment(
    sessionUser?.userRole,
    sessionUser?.orgIds,
    sessionUser?.department,
    sessionUser?.id,
    sessionUser?.userName,
  );
}

export async function getRequisitionDetail(prNumber: string) {
  const header = await repo.getRequisitionByPrNumber(prNumber);
  if (!header) return null;

  const lines = await repo.getRequisitionLines(prNumber);
  const approvalHistory = await repo.getApprovalHistory(prNumber);
  const linkedPos = await repo.getLinkedPurchaseOrdersForPr(prNumber);

  return { header, lines, approvalHistory, linkedPos };
}

/** True when every linked PO is cancelled and at least one exists (PO-from-PR was cancelled). */
export function canCancelPrAfterLinkedPoCancelled(
  linkedPos: { po_status?: string | null }[],
): boolean {
  if (!linkedPos.length) return true;
  const statuses = linkedPos.map((p) => (p.po_status || "").toLowerCase().trim());
  const activeStatuses = new Set([
    "approved",
    "pending approval",
    "complete",
    "closed",
    "finally closed",
  ]);
  const hasCancelled = statuses.some((s) => s === "cancelled");
  const hasActive = statuses.some((s) => activeStatuses.has(s));
  return hasCancelled && !hasActive;
}

export async function addRequisitionLine(prNumber: string, body: any) {
  const {
    itemDescription, quantity, uom, unitCost,
    categoryId, categoryName, itemId, currency,
  } = body;

  const check = await repo.getPrStatusAndCurrency(prNumber);
  validationHelper.validateIsEditable(check, check.pr_status, "Requisition");
  const nextId = await repo.getNextPrLineId();
  const lineNum = await repo.getNextPrLineNum(prNumber);

  const amount = (parseFloat(quantity) || 1) * (parseFloat(unitCost) || 0);

  const result = await repo.insertPrLine({
    id: nextId,
    prNumber,
    lineNum,
    itemDescription,
    qty: parseFloat(quantity) || 1,
    uom: uom || "Each",
    unitCost: parseFloat(unitCost) || 0,
    amount,
    categoryId: categoryId || null,
    categoryName: categoryName || null,
    itemId: itemId || null,
    currency: currency || check.currency || "AED",
  });

  await repo.updatePrTotalAmount(prNumber);

  console.log(`Line item added to ${prNumber}:`, result);
  return result;
}

/**
 * Patch semantics, like `updatePoLine`: the line UPDATE writes every editable
 * column, so a caller that sends only the field it wants changed — the agent's
 * update-line tool — must not have the rest of the row reset around it.
 */
export async function updateRequisitionLine(prNumber: string, lineId: string, body: any) {
  const {
    itemDescription, quantity, uom, unitCost,
    categoryId, categoryName, itemId, currency,
  } = body;

  const check = await repo.getPrStatusAndCurrency(prNumber);
  validationHelper.validateIsEditable(check, check.pr_status, "Requisition");

  const existing = await repo.getPrLineById(lineId, prNumber);
  if (!existing) throw { status: 404, message: "Line item not found" };

  const patch: RequisitionLinePatch = {};

  if (itemDescription !== undefined) patch.description = itemDescription;
  if (quantity !== undefined) patch.quantity = quantity;
  if (unitCost !== undefined) patch.unitCost = unitCost;
  if (uom !== undefined) patch.uom = uom;
  if (categoryId !== undefined) patch.categoryCode = categoryId;
  if (categoryName !== undefined) patch.categoryName = categoryName;
  if (itemId !== undefined) patch.itemId = itemId;
  if (currency !== undefined) patch.currency = currency;

  const result = await repo.updatePrLine({
    lineId,
    prNumber,
    ...mergeRequisitionLine(existing, patch, check?.currency),
  });

  if (!result) throw { status: 404, message: "Line item not found" };

  await repo.updatePrTotalAmount(prNumber);

  console.log(`Line item ${lineId} updated in ${prNumber}:`, result);
  return result;
}

export async function deleteRequisitionLine(prNumber: string, lineId: string) {
  const check = await repo.getPrStatus(prNumber);
  if (!check) throw { status: 404, message: "Requisition not found" };

  const deleted = await repo.deletePrLine(lineId, prNumber);
  if (!deleted) throw { status: 404, message: "Line item not found" };

  await repo.updatePrTotalAmountOnly(prNumber);
  return { message: "Line item deleted successfully" };
}

export async function deleteRequisition(prNumber: string) {
  const check = await repo.getPrStatus(prNumber);
  if (!check) throw { status: 404, message: "Requisition not found" };

  await repo.deleteAllPrLines(prNumber);
  await repo.deleteRequisitionHeader(prNumber);
  return { success: true, message: "Requisition deleted successfully" };
}

/**
 * Applies a partial edit to a requisition header. Only the fields present in
 * `body` change; the Edit Requisition dialog posts the whole form, while the
 * agent's update tool sends one field at a time, and both must be safe.
 */
export async function updateRequisition(prNumber: string, body: any) {
  const {
    description, deliveryLocation, needByDate,
    requestorId, requestorDepartment, buyerId,
    currency, budgetId, isBudgeted, orgId: bodyOrgId,
  } = body;

  const existing = await repo.getRequisitionByPrNumber(prNumber);
  validationHelper.validateIsEditable(existing, existing?.pr_status, "Requisition");

  const patch: RequisitionHeaderPatch = {};

  if (description !== undefined) patch.description = description;
  if (needByDate !== undefined) patch.needByDate = needByDate ? new Date(needByDate) : null;
  if (currency !== undefined) patch.currency = currency;
  if (isBudgeted !== undefined) patch.budgeted = isBudgeted === "yes";
  if (bodyOrgId !== undefined) patch.orgId = bodyOrgId ? parseInt(bodyOrgId) : null;

  if (requestorId) {
    const reqResult = await getPool().query(
      `SELECT id, name, email_id FROM dbo.um_user_dtls WHERE id = $1`,
      [parseInt(requestorId)]
    );
    if (reqResult.rows.length > 0) {
      patch.requestor = {
        id: reqResult.rows[0].id,
        name: reqResult.rows[0].name,
        email: reqResult.rows[0].email_id,
      };
    }
  }

  if (buyerId) {
    const buyerResult = await getPool().query(
      `SELECT id, name, email_id FROM dbo.um_user_dtls WHERE id = $1`,
      [parseInt(buyerId)]
    );
    if (buyerResult.rows.length > 0) {
      patch.owner = {
        id: buyerResult.rows[0].id,
        name: buyerResult.rows[0].name,
        email: buyerResult.rows[0].email_id,
      };
    }
  }

  if (requestorDepartment) {
    patch.deptName = await repo.getDepartmentById(parseInt(requestorDepartment));
  }

  if (deliveryLocation) {
    const rawLocId = String(deliveryLocation).replace("LOC", "");
    const loc = await repo.getLocationById(parseInt(rawLocId));
    patch.location = loc
      ? { id: loc.id, name: loc.location_name }
      : { id: parseInt(rawLocId) || null, name: null };
  }

  if (budgetId) {
    const budget = await repo.getBudgetLineById(parseInt(budgetId));
    if (budget) {
      const masterName = budget.budget_name || "";
      const lineName = budget.segment_dtl_name || "";
      patch.budget = { name: `${masterName} . ${lineName}`, segment: budget.id };
    }
  }

  await repo.updateRequisition(prNumber, mergeRequisitionHeader(existing, patch));

  return { success: true, message: "Requisition updated successfully" };
}

async function releasePrBudgetReservation(
  prNumber: string,
  header: { budget_segment?: string | null },
): Promise<void> {
  const budgetSegment = header.budget_segment;
  if (!budgetSegment || String(budgetSegment).trim() === "") return;

  const budgetLineId = parseInt(String(budgetSegment), 10);
  if (Number.isNaN(budgetLineId)) return;

  const prLines = await repo.getRequisitionLines(prNumber);
  const totalPrAmount = sumPrLinePreTaxAmounts(prLines);
  if (totalPrAmount <= 0) return;

  await repo.releaseBudgetLineOnPOCancelled(budgetLineId, totalPrAmount);
  const budgetMstId = await repo.getBudgetMstIdFromLineId(budgetLineId);
  if (budgetMstId) {
    await repo.updateBudgetMstReservedAmount(budgetMstId);
  }
  console.log(
    `[PR Cancel] Released ${totalPrAmount} on budget line ${budgetLineId} for PR ${prNumber}`,
  );
}

export async function cancelRequisition(prNumber: string, user: any) {
  const header = await repo.getRequisitionByPrNumber(prNumber);
  if (!header) {
    throw { status: 404, message: "Requisition not found" };
  }
  const status = header.pr_status?.toLowerCase().trim();
  if (status === "cancelled") {
    throw { status: 400, message: "Requisition cannot be cancelled in its current status" };
  }
 
    const linkedPos = await repo.getLinkedPurchaseOrdersForPr(prNumber);
    if (!canCancelPrAfterLinkedPoCancelled(linkedPos)) {
      throw {
        status: 400,
        message:
          "Requisition can only be cancelled when all linked purchase orders are cancelled",
      };
    }

  const linkedBids = await repo.getLinkedBidsByPrNumber(prNumber);
  for (const bid of linkedBids) {
    if(bid.status === "Draft"){
      await repo.deleteLinkedBidsByBidId(String(bid.id));
    }else if(bid.status !== "Cancelled" || bid.status !== "Rejected" || bid.status !== "Deleted"){
      throw {
        status: 400,
        message:
          "Requisition can only be cancelled when all linked bids are cancelled",
      };
    }
  }
  
  const wasBudgetReserved =
    status === "approved" || status === "complete";
  if (wasBudgetReserved) {
    await releasePrBudgetReservation(prNumber, header);
  }

  

  await repo.updatePrStatus(prNumber, "Cancelled","na");
  await repo.updatePrLinesStatus(prNumber, "Cancelled");
 
  let requestorName = header.requestor_email;
  try {
    const userResult = await getPool().query(
        `SELECT name FROM dbo.um_user_dtls WHERE LOWER(email_id) = LOWER($1) LIMIT 1`,
        [requestorName.trim()]
    );

    if (userResult.rows[0]?.name) {
      requestorName = userResult.rows[0].name;
    }
  } catch (lookupErr) {
    console.warn(
        `[UmUserDtls] Could not look up UserName for ${requestorName}:`,
        lookupErr
    );
  }
  const orgData = await adminRepo.getOrgDetails();
  const userName=requestorName;
  const event: PRCancelEvent = {
    eventType: "PR_CANCEL",
    emailId: header.requestor_email,
    prNumber: prNumber,
    user: userName??"",
    status:"Cancelled",
    orgLogoPath: orgData.org_logo_path,
  };
  eventBus.publish(event);
  return { success: true, message: "Requisition cancelled successfully" };
}

async function resolvePrLineTaxRatePercent(itemId: string | number | null | undefined): Promise<number> {
  if (itemId == null || String(itemId).trim() === "" || String(itemId) === "0") {
    return 0;
  }
  const taxInfo = await repo.getItemTaxInfo(String(itemId));
  if (!taxInfo?.tax_code) return 0;
  return parseFloat(String(taxInfo.tax_rate ?? 0)) || 0;
}

async function prLineBudgetTotal(line: any): Promise<number> {
  // const taxRate = await resolvePrLineTaxRatePercent(line.item_id);
  return prLineBudgetTotalWithTaxRate(line, 0);
}

/** Tax-inclusive PR line total for budget reservation / release. */
export async function sumPrLinesBudgetTotal(prLines: any[]): Promise<number> {
  let sum = 0;
  for (const line of prLines || []) {
    sum += await prLineBudgetTotal(line);
  }
  return sum;
}

/**
 * Amount already reserved at PR approval (pre-tax line amounts).
 * Tax is applied when the PO is created/approved, not at PR approval.
 */
async function getPrBudgetBaselineForPoAdjustment(prNumber: string): Promise<number> {
  const header = await repo.getRequisitionByPrNumber(prNumber);
  if (!header) return 0;
  // A non-budgeted PR never reserved anything at PR approval — nothing to use as a baseline.
  if (header.budgeted === false) return 0;

  const prLines = await repo.getRequisitionLines(prNumber);
  const lineSumPreTax = sumPrLinePreTaxAmounts(prLines);
  const headerAmt = parseFloat(String(header.pr_amount ?? 0)) || 0;

  // Header can remain at original PR total when lines were reduced after award.
  if (headerAmt > lineSumPreTax + 0.01) {
    return headerAmt;
  }
  return lineSumPreTax;
}

function sumAwardLinePreTaxAmounts(awardLines: any[]): number {
  let sum = 0;
  for (const line of awardLines || []) {
    const qty = parseFloat(line.awarded_quantity) || parseFloat(line.quantity) || 0;
    const unitPrice = parseFloat(line.bidprice) || 0;
    const discount = parseFloat(line.discprice) || 0;
    sum += qty * unitPrice - qty * discount;
  }
  return sum;
}

/**
 * Amount already reserved at award approval (pre-tax line amounts).
 * Tax is applied when the PO is created/approved, not at award approval.
 */
async function getAwardBudgetBaselineForPoAdjustment(awardId: number | string): Promise<number> {
  const awardIdNum = parseInt(String(awardId), 10);
  if (Number.isNaN(awardIdNum)) return 0;

  const award = await bidRepo.getAwardById(awardIdNum);
  if (!award) return 0;

  const awardLines = await bidRepo.getAwardLinesByAwardId(awardIdNum);
  const lineSumPreTax = sumAwardLinePreTaxAmounts(awardLines);
  const headerAmt = parseFloat(String(award.grosstotal ?? 0)) || 0;

  if (headerAmt > lineSumPreTax + 0.01) {
    return headerAmt;
  }
  return lineSumPreTax;
}

/**
 * When bid award updates PR line amounts below the PR-approved reservation, release the difference.
 */
export async function syncPrBudgetReservationAfterAwardLinesUpdated(
  prNumber: string,
  awardedTotal: number,
): Promise<void> {
  const header = await repo.getRequisitionByPrNumber(prNumber);
  const budgetSegment = header?.budget_segment;
  if (!budgetSegment || String(budgetSegment).trim() === "") return;

  const budgetLineId = parseInt(String(budgetSegment), 10);
  if (Number.isNaN(budgetLineId)) return;

  const prLines = await repo.getRequisitionLines(prNumber);
  const prLinesTotal = sumPrLinePreTaxAmounts(prLines);
  const delta = awardedTotal - prLinesTotal;
  if (Math.abs(delta) < 0.01) return;

  try {
    if (delta < 0) {
      await repo.releaseBudgetLineOnPOCancelled(budgetLineId, Math.abs(delta));
      console.log(
        `[Bid Award] Released ${Math.abs(delta)} on budget line ${budgetLineId} for PR ${prNumber} (award below PR amount)`,
      );
    } else {
      await repo.reserveBudgetLineAmount(budgetLineId, delta);
      console.log(
        `[Bid Award] Reserved ${delta} on budget line ${budgetLineId} for PR ${prNumber} (award above prior PR lines)`,
      );
    }
    const budgetMstId = await repo.getBudgetMstIdFromLineId(budgetLineId);
    if (budgetMstId) {
      await repo.updateBudgetMstReservedAmount(budgetMstId);
    }
    // Keep header pr_amount aligned with awarded lines so PO approval does not double-adjust.
    // pr header amount should not adjust from award 
    // await repo.updatePrTotalAmountOnly(prNumber);
  } catch (ex: any) {
    console.error(`[Bid Award] Budget adjustment error for PR ${prNumber}:`, ex?.message);
  }
}

/**
 * On PO approval: direct POs reserve the full PO amount (line cost + tax).
 * POs linked to an approved PR reserve the incremental amount:
 *   (PO total incl. tax) − (PR pre-tax amount reserved at PR approval).
 * If PO is lower than PR, the difference is released so reserved reflects the PO amount.
 */
async function applyPoApprovalBudgetReservation(
  poNumber: string,
  po: { budget_segment?: string | null; pr_number?: string | null },
): Promise<void> {
  const budgetSegment = po.budget_segment;
  if (!budgetSegment || String(budgetSegment).trim() === "") return;

  const budgetLineId = parseInt(String(budgetSegment), 10);
  if (Number.isNaN(budgetLineId)) return;

  const poLines = await repo.getPoLines(poNumber);
  if (!poLines || poLines.length === 0) return;

  const totalPoAmount = sumPoLinesBudgetTotal(poLines);
  if (totalPoAmount <= 0) return;

  const poFromPrNumber = po.pr_number != null ? String(po.pr_number).trim() : "";
  let amountToApply = totalPoAmount;

  if (poFromPrNumber !== "") {
    const totalPrAmount = await getPrBudgetBaselineForPoAdjustment(poFromPrNumber);
    amountToApply = totalPoAmount - totalPrAmount;
    if (Math.abs(amountToApply) < 0.01) {
      console.log(
        `[PO Approval] PO ${poNumber} from PR ${poFromPrNumber} — no budget change (PO ${totalPoAmount} incl. tax = PR baseline ${totalPrAmount} pre-tax)`,
      );
      return;
    }
  }

  try {
    if (amountToApply > 0) {
      await repo.reserveBudgetLineAmount(budgetLineId, amountToApply);
      const label = poFromPrNumber
        ? `incremental ${amountToApply} (PO ${totalPoAmount} − PR reserved)`
        : `${amountToApply}`;
      console.log(
        `[PO Approval] Reserved ${label} on budget line ${budgetLineId} for PO ${poNumber}`,
      );
    } else {
      await repo.releaseBudgetLineOnPOCancelled(budgetLineId, Math.abs(amountToApply));
      console.log(
        `[PO Approval] Released ${Math.abs(amountToApply)} on budget line ${budgetLineId} for PO ${poNumber} (PO below PR amount)`,
      );
    }
  } catch (lineEx: any) {
    console.error(`[PO Approval] Budget line update error:`, lineEx?.message);
  }

  try {
    const budgetMstId = await repo.getBudgetMstIdFromLineId(budgetLineId);
    if (budgetMstId) {
      await repo.updateBudgetMstReservedAmount(budgetMstId);
      console.log(`[PO Approval] Synced reserved amounts on budget master ${budgetMstId} for PO ${poNumber}`);
    }
  } catch (masterEx: any) {
    console.error(`[PO Approval] Budget master update error:`, masterEx?.message);
  }
}


async function revisePrBudgetToApprovedPoAmount(
  prNumber: string,
  budgetLineId: number
): Promise<void> {


  const allPrLinesHavePo = await repo.checkAllPrLinesHavePo(prNumber);

  if (!allPrLinesHavePo) {
    return;
  }

  const summary = await repo.getPrPoApprovalSummary(prNumber);

  const totalPos = Number(summary.total_pos);

  const approvedPos = Number(summary.approved_pos);

  if ( totalPos === 0 || totalPos !== approvedPos) 
    {
    console.log(
      `[PO Approval] Waiting for all POs to be approved for PR ${prNumber}`
    );
    return;
  }

  const totalPoAmount = Number(summary.total_po_amount);

  const totalPrAmount =
    await getPrBudgetBaselineForPoAdjustment(
      prNumber
    );

  const amountToApply = totalPoAmount - totalPrAmount;

  if (Math.abs(amountToApply) < 0.01) {

    console.log(
      `[PO Approval] No budget revision required for PR ${prNumber}`
    );

    return;
  }

  try {

    if (amountToApply > 0) {

      await repo.reserveBudgetLineAmount(
        budgetLineId,
        amountToApply
      );

      console.log(
        `[PO Approval] Increased reservation by ${amountToApply}
         (PO ${totalPoAmount} - PR ${totalPrAmount})`
      );

    } else {

      await repo.releaseBudgetLineOnPOCancelled(
        budgetLineId,
        Math.abs(amountToApply)
      );

      console.log(
        `[PO Approval] Reduced reservation by ${Math.abs(amountToApply)}
         (PO ${totalPoAmount} - PR ${totalPrAmount})`
      );
    }

    const budgetMstId =
      await repo.getBudgetMstIdFromLineId(
        budgetLineId
      );

    if (budgetMstId) {
      await repo.updateBudgetMstReservedAmount(
        budgetMstId
      );
    }

  } catch (ex: any) {

    console.error(
      `[PO Approval] Budget revision failed`,
      ex?.message
    );

    throw ex;
  }
}

async function reviseAwardBudgetToApprovedPoAmount(
  awardId: number | string,
  budgetLineId: number
): Promise<void> {
  const allAwardLinesHavePo = await repo.checkAllAwardLinesHavePo(awardId);

  if (!allAwardLinesHavePo) {
    return;
  }

  const summary = await repo.getAwardPoApprovalSummary(awardId);

  const totalPos = Number(summary.total_pos);
  const approvedPos = Number(summary.approved_pos);

  if (totalPos === 0 || totalPos !== approvedPos) {
    console.log(
      `[PO Approval] Waiting for all POs to be approved for Award ${awardId}`
    );
    return;
  }

  const totalPoAmount = Number(summary.total_po_amount);

  const totalAwardAmount =
    await getAwardBudgetBaselineForPoAdjustment(awardId);

  const amountToApply = totalPoAmount - totalAwardAmount;

  if (Math.abs(amountToApply) < 0.01) {
    console.log(
      `[PO Approval] No budget revision required for Award ${awardId}`
    );
    return;
  }

  try {
    if (amountToApply > 0) {
      await repo.reserveBudgetLineAmount(
        budgetLineId,
        amountToApply
      );

      console.log(
        `[PO Approval] Increased reservation by ${amountToApply}
         (PO ${totalPoAmount} - Award ${totalAwardAmount})`
      );
    } else {
      await repo.releaseBudgetLineOnPOCancelled(
        budgetLineId,
        Math.abs(amountToApply)
      );

      console.log(
        `[PO Approval] Reduced reservation by ${Math.abs(amountToApply)}
         (PO ${totalPoAmount} - Award ${totalAwardAmount})`
      );
    }

    const budgetMstId =
      await repo.getBudgetMstIdFromLineId(budgetLineId);

    if (budgetMstId) {
      await repo.updateBudgetMstReservedAmount(budgetMstId);
    }
  } catch (ex: any) {
    console.error(
      `[PO Approval] Award budget revision failed`,
      ex?.message
    );

    throw ex;
  }
}

/**
 * Release budget line + master reservation when a direct (non-PR) PO is cancelled
 * after approval. PO-from-PR keeps PR-level reservation; only the PO incremental
 * portion (PO − PR) is released when the PO is cancelled.
 */
async function releaseDirectPoBudgetReservation(
  po: { budget_segment?: string | null; pr_number?: string | null; po_status?: string | null },
  poNumber: string,
  username?: string,
): Promise<void> {
  const priorStatus = (po.po_status || "").toLowerCase().trim();
  if (priorStatus !== "approved") {
    console.log(
      `[PO Budget Release] Skip PO ${poNumber} — status was ${po.po_status}, not Approved`,
    );
    return;
  }

  const budgetSegment = po.budget_segment;
  if (!budgetSegment || String(budgetSegment).trim() === "") return;

  const budgetLineId = parseInt(String(budgetSegment), 10);
  if (Number.isNaN(budgetLineId)) return;

  const poLines = await repo.getPoLines(poNumber);
  const totalPoAmount = sumPoLinesBudgetTotal(poLines);
  if (totalPoAmount <= 0) return;

  const prNumber = po.pr_number != null ? String(po.pr_number).trim() : "";
  let amountToRelease = totalPoAmount;

  if (prNumber !== "") {
    const totalPrAmount = await getPrBudgetBaselineForPoAdjustment(prNumber);
    amountToRelease = totalPoAmount - totalPrAmount;
    if (amountToRelease <= 0.01) {
      const restoreAmount = totalPrAmount - totalPoAmount;
      if (restoreAmount > 0.01) {
        try {
          await repo.reserveBudgetLineAmount(budgetLineId, restoreAmount);
          const budgetMstId = await repo.getBudgetMstIdFromLineId(budgetLineId);
          if (budgetMstId) {
            await repo.updateBudgetMstReservedAmount(budgetMstId);
          }
          console.log(
            `[PO Budget Release] Restored ${restoreAmount} on budget line ${budgetLineId} for PO ${poNumber} cancel (reverses PO below-PR reservation)`,
          );
        } catch (ex: any) {
          console.error(`[PO Budget Release] Restore error:`, ex?.message);
        }
      } else {
        console.log(
          `[PO Budget Release] Skip PO ${poNumber} — PR ${prNumber} holds reservation (no PO increment)`,
        );
      }
      if (username) {
        await repo.updatePoReservedAmount(poNumber, 0, username);
      }
      return;
    }
  }

  await repo.releaseBudgetLineOnPOCancelled(budgetLineId, amountToRelease);
  const budgetMstId = await repo.getBudgetMstIdFromLineId(budgetLineId);
  if (budgetMstId) {
    await repo.updateBudgetMstReservedAmount(budgetMstId);
  }
  if (username) {
    await repo.updatePoReservedAmount(poNumber, 0, username);
  }
  console.log(
    `[PO Budget Release] Released ${amountToRelease} on budget line ${budgetLineId} for PO ${poNumber}`,
  );
}

async function revisePrBudgetAfterPoStatusChange(
  po: {
    budget_segment?: string | null;
    pr_number?: string | null;
  },
  poNumber: string,
  username?: string,
): Promise<void> {

  const prNumber = po.pr_number != null
      ? String(po.pr_number).trim()
      : "";

  if (!prNumber) {
    return;
  }

  const budgetSegment = po.budget_segment;

  if (!budgetSegment || String(budgetSegment).trim() === "") {
    return;
  }

  const budgetLineId = parseInt( String(budgetSegment), 10);

  if (Number.isNaN(budgetLineId)) {
    return;
  }

  const totalPrAmount =
    await getPrBudgetBaselineForPoAdjustment(
      prNumber,
    );

  const summary =
    await repo.getPrPoApprovalSummary(
      prNumber,
    );

  const approvedPoAmount = Number(summary.total_po_amount || 0);

  const difference = approvedPoAmount - totalPrAmount;

  try {

    if (Math.abs(difference) < 0.01) {

      console.log(
        `[PO Budget Recalc] No budget change required for PR ${prNumber}`,
      );

    } else if (difference < 0) {

      await repo.reserveBudgetLineAmount(
        budgetLineId,
        difference,
      );

      console.log(
        `[PO Budget Recalc] Reserved ${difference}
         on budget line ${budgetLineId}
         (Approved PO ${approvedPoAmount} - PR ${totalPrAmount})`,
      );

    } else if (difference > 0) {

      await repo.releaseBudgetLineOnPOCancelled(
        budgetLineId,
        Math.abs(difference),
      );

      console.log(
        `[PO Budget Recalc] Released ${Math.abs(difference)}
         on budget line ${budgetLineId}
         (Approved PO ${approvedPoAmount} - PR ${totalPrAmount})`,
      );
    }else {
      console.log(
        `[PO Budget Recalc] No budget change required for PR ${prNumber}`,
      );
      return;
    }

    const budgetMstId =
      await repo.getBudgetMstIdFromLineId(
        budgetLineId,
      );

    if (budgetMstId) {
      await repo.updateBudgetMstReservedAmount(
        budgetMstId,
      );
    }

    if (username) {
      await repo.updatePoReservedAmount(
        poNumber,
        approvedPoAmount,
        username,
      );
    }

  } catch (ex: any) {

    console.error(
      `[PO Budget Recalc] Error`,
      ex?.message,
    );
  }
}

export async function cancelPurchaseOrder(
  poNumber: string,
  reqUser: any,
  comments?: string,
) {
  const po = await repo.getPoByNumber(poNumber);
  if (!po) {
    throw { status: 404, message: "Purchase order not found" };
  }

  const statusLower = (po.po_status || "").toLowerCase().trim();
  if (statusLower === "cancelled") {
    throw { status: 400, message: "Purchase order is already cancelled" };
  }
  if (statusLower !== "approved") {
    throw {
      status: 400,
      message: `Only approved purchase orders can be cancelled (current status: ${po.po_status})`,
    };
  }
  if(statusLower === "approved" && po.attribute_8 !== null && (po.attribute_8 === "Partially Received" || po.attribute_8 === "Received" || po.attribute_9 === "Partially Invoiced" || po.attribute_9 === "Invoiced")){
    throw {
      status: 400,
      message: `Cannot cancel purchase order as it is already received or partially received`,
    };
  }

  const username = reqUser?.userName || reqUser?.name || reqUser?.email_id || "system";

  // await releaseDirectPoBudgetReservation(po, poNumber, username);
  if(po.pr_number !== null && po.bid_award_id === null){
    await revisePrBudgetAfterPoStatusChange(po, poNumber, username);
  }else if(po.bid_award_id !== null){
    //No Condition needed as Awarded amountand PO raised amount will be same 
  }
  else{
    await releaseDirectPoBudgetReservation(po, poNumber, username);
  }

  await repo.updatePoStatus(poNumber, "Cancelled");
  await repo.updatePoLinesStatus(poNumber, "Cancelled");

  if (comments && String(comments).trim() !== "") {
    await getPool().query(
      `UPDATE dbo.supp_po_header_dtls SET attribute_5 = $1, last_modified_date = NOW() WHERE po_number = $2`,
      [String(comments).trim(), poNumber],
    );
  }

  if(po.pr_number !== null && po.bid_award_id === null){
    const prNumber = po.pr_number;
    const result = await getPool().query(`select attribute_11, pr_amount from dbo.supp_pr_header_dtls where pr_number = $1`, [prNumber]);
    const reservedPRAmount = result.rows[0]?.attribute_11 ? Number(result.rows[0]?.attribute_11) : 0;
    const prAmount = result.rows[0]?.pr_amount ? Number(result.rows[0]?.pr_amount) : 0;
    let remainingPRAmount = reservedPRAmount;
    if((po.po_status === "Approved" || po.po_status === "approved") && reservedPRAmount < prAmount){
      remainingPRAmount = reservedPRAmount + Number(po.po_total_cost);
    }
    await getPool().query(`update dbo.supp_pr_header_dtls set bidno = null, attribute_7 = null, po_number = NULLIF(
  array_to_string(
    array_remove(
      string_to_array(po_number, ','),
      $1
    ),
    ','
  ),
  ''), pr_status = 'Approved', all_lines_have_po = false, attribute_11 = $2 where pr_number = $3`, [poNumber, remainingPRAmount, prNumber]);
    await getPool().query("update dbo.supp_pr_line_dtls set po_number = null where po_number = $1", [poNumber]);
  }else if(po.bid_award_id !== null){
    const result = await getPool().query(`select attribute_10 from dbo.supp_bid_award_dtls where id = $1`, [po.bid_award_id]);
    const reservedPRAmount = result.rows[0]?.attribute_10 ? Number(result.rows[0]?.attribute_10) : 0;
    const prAmount = result.rows[0]?.pr_amount ? Number(result.rows[0]?.pr_amount) : 0;
    let remainingPRAmount = reservedPRAmount;
    if((po.po_status === "Approved" || po.po_status === "approved") && reservedPRAmount < prAmount){
      remainingPRAmount = reservedPRAmount + Number(po.po_total_cost);
    }
    await getPool().query(`update dbo.supp_pr_header_dtls set po_number = NULLIF(
      array_to_string(
        array_remove(
          string_to_array(po_number, ','),
          $1
        ),
        ','
      ),
      '') where pr_number = $2`, [poNumber, po.pr_number]);
    await getPool().query(`update dbo.supp_bid_award_dtls set attribute_11 = NULLIF(
      array_to_string(
        array_remove(
          string_to_array(attribute_11, ','),
          $1
        ),
        ','
      ),
      ''), attribute_10 = $2 where id = $3`, [poNumber, remainingPRAmount, po.bid_award_id]);
    await getPool().query("update dbo.supp_bid_award_line_dtls set attribute_11 = null where attribute_11 = $1", [poNumber]);
   }

  return { success: true, message: "Purchase order cancelled successfully" };
}

export async function submitRequisition(prNumber: string, reqUser: any) {
  const { workflowService } = await import("../../services/workflowService");
  const username = reqUser?.userName || "system";
  const processName = "Purchase Request";

  const pr = await repo.getRequisitionWithRequestorAndOrg(prNumber);
  validationHelper.validateIsEditable(pr, pr.pr_status, "Requisition");

  const lineCount = await repo.getPrLineCount(prNumber);
  const readiness = checkRequisitionSubmitReadiness(pr, lineCount);
  if (!readiness.ready) {
    throw {
      status: 400,
      message: `Cannot submit requisition — ${describeMissingRequirements(readiness.missing)} ${readiness.missing.length === 1 ? "is" : "are"} required.`,
      missing: readiness.missing,
    };
  }

  const prLinesForBudget = await repo.getRequisitionLines(prNumber);
  const prAmountWithTax = await sumPrLinesBudgetTotal(prLinesForBudget);

  const budgetValidation = await validateBudget(
    pr.department_name,
    prAmountWithTax,
    pr.pr_description || "",
    pr.budget_segment || null,
    pr.currency || "INR",
    false,
  );
  if (!budgetValidation.isWithinBudget) {
    throw { status: 400, message: `Cannot submit PR: ${budgetValidation.warnings[0] || "Amount exceeds available budget."}` };
  }

  let taskSubject = `PR Approval Request - ${pr.pr_number} - ${pr.pr_description || ""}`;
  if (taskSubject.length > 80) {
    taskSubject = taskSubject.substring(0, 80);
  }
  const orgNameResult = await getPool().query(
    `SELECT organization_name FROM dbo.um_org_dtls WHERE id = $1`,
    [pr.org_id]
  );
  const orgName = orgNameResult.rows[0]?.organization_name || "";

  const params = {
    subject: taskSubject,
    srmsRefNumber: pr.pr_number,
    status: "Pending Approval",
    startDate: new Date().getTime(),
    createdBy: pr.requestor_name || username,
    organization: orgName || "",
    department: pr.department_name || "",
    amount: parseFloat(pr.pr_amount || "0"),
    orgId: pr.org_id || "",
  };

  const checkApprList = await workflowService.getFirstStepApproversList(processName, params);
  if (!checkApprList || checkApprList.length === 0) {
    throw { status: 400, message: "Approver Hierarchy or Approval Flow is not defined for this request!" };
  }

  let taskId: string;
  try {
    taskId = await workflowService.startProcess(
      taskSubject, processName, pr.pr_number, params, username
    );
  } catch (err: any) {
    if (err.status) throw err;
    throw { status: 400, message: err.message || "Failed to start approval workflow" };
  }

  const approversList = await workflowService.getApproversList(processName, params);

  await repo.updatePrStatusAndApprovers(prNumber, {
    status: "Pending Approval",
    taskId,
    approversList: approversList.join(", "),
    lastModifiedBy: username,
  });

  await repo.updatePrLinesStatus(prNumber, "Pending Approval");
  const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=$1`,[taskId]);
  const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
  const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

  const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent('PR')}&&taskId=${encodeURIComponent(taskId)}&&email=${encodeURIComponent(approverEmail.rows[0].current_assignee)}&&refnumber=${encodeURIComponent(prNumber)}`;

  const { publishTaskAssignmentEvent } = await import("../../services/eventBus/publishTaskAssignment");
  const prDesc = pr.pr_description ? String(pr.pr_description).slice(0, 200) : "";
  const orgData = await adminRepo.getOrgDetails();
  publishTaskAssignmentEvent({
    taskId,
    templateEventId: EventTypes.TASK_ASSIGNMENT.PR_APPROVAL,
    taskSub: `Purchase Request ${pr.pr_number}${prDesc ? ` — ${prDesc}` : ""}`.slice(0, 500),
    submittedBy: pr.requestor_name || username,
    department: pr.department_name || "",
    entityId: pr.org_id != null ? String(pr.org_id) : undefined,
    srmsRefNo: pr.pr_number,
    domain: (reqUser as any)?.domain,
    variables :{ 
      prNumber: pr.pr_number,
      prDescription: pr.pr_description || "",
      prDepartment: pr.department_name,
      requestorName: pr.requestor_name || "",
      orgLogoPath: orgData.org_logo_path,
      emailApprovalLink:approvalLink,
    },
    emailApprovalLink:approvalLink,
  });

  return {
    success: true,
    message: "Successfully processed your request.",
    taskId,
    approvers: approversList,
  };
}

export async function processRequisitionApproval(prNumber: string, body: any, reqUser: any) {

  const { taskId, result, comments } = body;
  const processName = "Purchase Request";

  if (!reqUser) throw { status: 401, message: "User not authenticated" };
  if (!taskId || taskId === "undefined") throw { status: 400, message: "Invalid task details!" };
  if (!result) throw { status: 400, message: "result is required" };

  console.log("Started PR Processing............");

  // Aligned with Budget: use repo abstraction instead of raw pool.query
  const user = await repo.getUserDetails(reqUser.id);
  const username = user.user_name || user.email_id || "system";
  

  if (!username || username === "system") {
    throw { status: 400, message: "Could not determine user identity" };
  }

  const pr = await repo.getRequisitionWithRequestorAndOrg(prNumber);
  if (!pr) throw { status: 404, message: "Requisition not found" };

  const taskCreationDate = await repo.getTaskCreationDate(taskId);
  const userRoles = await repo.getUserRoles(reqUser.id);

  const wfStepInstances = await workflowService.findByTaskId(taskId);

  let ntaskId = "";
  try {
    ntaskId = await workflowService.completeTask(
      taskId,
      result as "Approve" | "Approved" | "Reject" | "ReSubmit" | "More",
      comments || "",
      username,
      userRoles
    );
  } catch (e: any) {
    throw { status: 400, message: e.message };
  }

  console.log("Show me the next Task Id..." + ntaskId);

  if (ntaskId && ntaskId !== "") {
    let approvers="";
    if(pr.attribute_10  && pr.attribute_10 !== "")
    {
        approvers=pr.attribute_10.concat(",").concat(username);
    }
    else       
    {
        approvers=username;
    }
    await repo.updatePrTaskId(prNumber, ntaskId,approvers);
  }
  const orgData = await adminRepo.getOrgDetails();

  if ((!ntaskId || ntaskId === "") && (result.toLowerCase() === "approved" || result.toLowerCase() === "approve")) 
  {
    // Update budget lines and budget master (header)
    try {
      // Get PR header to access budget segment
      const budgetSegment = pr.budget_segment;
      
      if (budgetSegment && budgetSegment !== "") {
        const budgetLineId = budgetSegment;//parseInt(budgetSegment, 10);
        if (!isNaN(budgetLineId)) {
          // Get all PR lines to calculate total amount
          const prLines = await repo.getRequisitionLines(prNumber);
          
          if (prLines && prLines.length > 0) {
            const totalPrAmount = sumPrLinePreTaxAmounts(prLines);

            // Reserve pre-tax PR line total; tax is committed when PO is approved
            try {
              await repo.reserveBudgetLineAmount(budgetLineId, totalPrAmount);
              console.log(
                `[PR Approval] Reserved ${totalPrAmount} (pre-tax) on budget line ${budgetLineId} for PR ${prNumber}`,
              );
              await getPool().query(`update dbo.supp_pr_header_dtls set attribute_11 = $1 where pr_number = $2`, [totalPrAmount, prNumber]);
              console.log(
                `[PR Approval] Reserved ${totalPrAmount} (pre-tax) on attribute_11 for PR ${prNumber}`,
              );
            } catch (lineEx: any) {
              console.error(`[PR Approval] Budget line update error:`, lineEx?.message);
            }

            // Sync budget master reserved from lines (keeps header total budget_amount fixed)
            try {
              const budgetMstId = await repo.getBudgetMstIdFromLineId(budgetLineId);
              if (budgetMstId) {
                await repo.updateBudgetMstReservedAmount(budgetMstId);
                console.log(`[PR Approval] Synced reserved amounts on budget master ${budgetMstId} for PR ${prNumber}`);
              }
            } catch (masterEx: any) {
              console.error(`[PR Approval] Budget master update error:`, masterEx?.message);
            }
          }
        }
      }
    } catch (ex: any) {
      console.error("[PR Approval] Budget update error:", ex?.message);
      // Continue with approval even if budget update fails
    }

    let approvers="";
    if(pr.attribute_10  && pr.attribute_10 !== "")
    {
        approvers=pr.attribute_10.concat(",").concat(username);
    }
    else       
    {
        approvers=username;
    }
    await repo.updatePrStatus(prNumber, "Approved",approvers);
    await repo.updatePrLinesStatus(prNumber, "Approved");

    const ownerEmail = String(pr.pr_owner_email || "").trim();
    const ownerName = String(pr.pr_owner_name || "").trim() || "User";
    const { eventBus } = await import("../../services/eventBus/index");
    const { EventTypes } = await import("../../services/eventBus/events");
    eventBus.publish({
      eventType: EventTypes.PR_APPROVED,
      timestamp: new Date(),
      prNumber,
      prDescription: pr.pr_description || "",
      ownerEmail,
      ownerName,
      orgName: pr.organization_name || undefined,
      domain: (reqUser as any)?.domain,
      orgLogoPath: orgData.org_logo_path,
    });
  }

  if((ntaskId && ntaskId !== "") && (result.toLowerCase() === "approved" || result.toLowerCase() === "approve")) {
    const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=$1`,[ntaskId]);
    const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
    const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

    const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent('PR')}&&taskId=${encodeURIComponent(ntaskId)}&&email=${encodeURIComponent(approverEmail.rows[0].current_assignee)}&&refnumber=${encodeURIComponent(prNumber)}`;

    const templateEventId = EventTypes.TASK_ASSIGNMENT.PR_APPROVAL;
    publishTaskAssignmentEvent({
      taskId: ntaskId,
      templateEventId,
      submittedBy: user.name || username,
      department: pr.dept_name || pr.department_name || "",
      entityId: pr.org_id != null ? String(pr.org_id) : undefined,
      srmsRefNo: pr.pr_number,
      variables: 
      {
        prNumber: pr.pr_number,
        prDescription: pr.pr_description || "",
        prDepartment: pr.department_name,
        requestorName: pr.requestor_name || "",
        orgLogoPath: orgData.org_logo_path,
        emailApprovalLink:approvalLink,
      },
      emailApprovalLink:approvalLink,
    });
  }

  if (result.toLowerCase() === "rejected" || result.toLowerCase() === "reject") {
    let approvers="";
    if(pr.attribute_10  && pr.attribute_10 !== "")
    {
        approvers=pr.attribute_10.concat(",").concat(username);
    }
    else       
    {
        approvers=username;
    }
    await repo.updatePrRejected(prNumber, comments || "", approvers);
    await repo.updatePrLinesStatus(prNumber, "Rejected");
    const rejectComments = String(comments || "").trim();
    const ownerEmail = String((pr as { requestor_email?: string }).requestor_email || "").trim();
    const ownerName = String(pr.requestor_name || "").trim() || "User";
    const prTitle = String(pr.pr_title || pr.pr_description || prNumber).trim();
    const { eventBus } = await import("../../services/eventBus/index");
    const { EventTypes } = await import("../../services/eventBus/events");
    eventBus.publish({
      eventType: EventTypes.PR_REJECTED,
      timestamp: new Date(),
      prNumber,
      prDescription: pr.pr_description || "",
      ownerEmail,
      ownerName,
      rejectComments,
      orgName: pr.organization_name || undefined,
      domain: (reqUser as any)?.domain,
      orgLogoPath: orgData.org_logo_path,
    });
  }

  if (result.toLowerCase() === "more info required" || result.toLowerCase() === "more") {
    const templateEventId = EventTypes.TASK_ASSIGNMENT.PR_MORE_INFO;

    let taskSubject = `Purchase Request Requested for More Info - ${pr.pr_number} - ${pr.pr_description || ""}`;
    if (taskSubject.length > 80) {
      taskSubject = taskSubject.substring(0, 80);
    }

    await getPool().query(`update dbo.act_ru_task set description_ = $1 where id_ = $2`, [taskSubject, ntaskId]);

    const params = {
      subject: taskSubject,
      srmsRefNumber: pr.pr_number,
      status: "Pending Approval",
      startDate: new Date().getTime(),
      createdBy: user.name || username,
      organization: pr.organization_name || "",
      department: pr.dept_name || pr.department_name || "",
      amount: parseFloat(pr.pr_amount || "0"),
    };

    // Aligned with Budget: guard against empty approvers list
    const checkApprList = await workflowService.getFirstStepApproversList(processName, params);
    if (!checkApprList || checkApprList.length === 0) {
      throw { status: 400, message: "Approver Hierarchy or Approval Flow is not defined for this request!" };
    }

    const wfStepInstances = await workflowService.findByTaskId(ntaskId);

  if (wfStepInstances.length === 0) {
    throw new Error(`Task not found or already completed: ${ntaskId}`);
  }

  const stepInstance = wfStepInstances[0];

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      await getPool().query(
        `UPDATE dbo.wf_instance_variables SET variable_value = $2 WHERE instance_id = $1 AND variable_name = $3`,
        [stepInstance.instance_id, value, key]
      );
    }
  }

    await repo.updatePrStatus(prNumber, "More Info Required","na");
    await repo.updatePrLinesStatus(prNumber, "More Info Required");
    const approvers = await workflowService.getApproversList(processName, params);
    await repo.updatePrApproversList(prNumber, approvers.join(", "));

    publishTaskAssignmentEvent({
      taskId: ntaskId,
      templateEventId,
      submittedBy: user.name || username,
      department: pr.dept_name || pr.department_name || "",
      entityId: pr.org_id != null ? String(pr.org_id) : undefined,
      srmsRefNo: pr.pr_number,
      variables: {
        prNumber: pr.pr_number,
        prDescription: pr.pr_description || "",
        prDepartment: pr.department_name,
        requestorName: pr.requestor_name || "",
        orgLogoPath: orgData.org_logo_path,
      },
    });
  }

  if (result.toLowerCase() === "resubmit") {
    let taskSubject = `PR Re-submit Approval Request - ${pr.pr_number} - ${pr.pr_description || ""}`;
    if (taskSubject.length > 80) {
      taskSubject = taskSubject.substring(0, 80);
    }

    await getPool().query(`update dbo.act_ru_task set description_ = $1 where id_ = $2`, [taskSubject, ntaskId]);

    const params = {
      subject: taskSubject,
      srmsRefNumber: pr.pr_number,
      status: "Pending Approval",
      startDate: new Date().getTime(),
      createdBy: user.name || username,
      organization: pr.organization_name || "",
      department: pr.dept_name || pr.department_name || "",
      amount: parseFloat(pr.pr_amount || "0"),
    };


    const wfStepInstances = await workflowService.findByTaskId(ntaskId);

    if (wfStepInstances.length === 0) {
      throw new Error(`Task not found or already completed: ${ntaskId}`);
    }
  
    const stepInstance = wfStepInstances[0];
  
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        await getPool().query(
          `UPDATE dbo.wf_instance_variables SET variable_value = $2, variable_value_string= $2 WHERE instance_id = $1 AND variable_name = $3`,
          [stepInstance.instance_id, value, key]
        );
      }
    }

    const templateEventId = EventTypes.TASK_ASSIGNMENT.PR_RESUBMIT;
    // Aligned with Budget: use consistent status string
    await repo.updatePrStatus(prNumber, "Pending Approval","");
    await repo.updatePrLinesStatus(prNumber, "Pending Approval");

    const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=$1`,[ntaskId]);
    const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
    const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

    const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent('PR')}&&taskId=${encodeURIComponent(ntaskId)}&&email=${encodeURIComponent(approverEmail.rows[0].current_assignee)}&&refnumber=${encodeURIComponent(prNumber)}`;

    publishTaskAssignmentEvent({
      taskId: ntaskId,
      templateEventId,
      submittedBy: user.name || username,
      department: pr.dept_name || pr.department_name || "",
      entityId: pr.org_id != null ? String(pr.org_id) : undefined,
      srmsRefNo: pr.pr_number,
      variables: {
        prNumber: pr.pr_number,
        prDescription: pr.pr_description || "",
        prDepartment: pr.department_name,
        requestorName: pr.requestor_name || "",
        orgLogoPath: orgData.org_logo_path,
        emailApprovalLink:approvalLink,
      },
      emailApprovalLink:approvalLink,
    });
  }

  await repo.updatePrLastModified(prNumber, username);

  // Aligned with Budget: single approval history insert, moved before approver list update
  await repo.insertApprovalHistory({
    objectId: prNumber,
    comments: comments || "",
    approverId: user.id,
    approverName: user.name,
    email: user.email_id,
    designation: user.designation || "",
    status: result,
    requestedDate: taskCreationDate || new Date(),
    attributeType: "PR",
    createdBy: username,
  });

  const userRepository = await import("../common/common.repository");
  const wfStepInstance = wfStepInstances[0];
  const currentApprover = await userRepository.findUserByUsername(wfStepInstance.current_assignee);
  if (result.toLowerCase() === "approved" || result.toLowerCase() === "approve") {
    const currentApprovers = pr.approvers_list;
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
      await repo.updatePrApproversList(prNumber, newApprovers);
    }
  }

  return {
    success: true,
    message: "Successfully processed your request.",
    nextTaskId: ntaskId,
  };
}

export async function aiAssistedLines(prNumber: string) {
  const pr = await repo.getPrForAiAssisted(prNumber);
  if (!pr) throw { status: 404, message: "Requisition not found" };
  if (pr.pr_status?.toLowerCase() !== "draft") {
    throw { status: 400, message: "Only Draft requisitions can be modified" };
  }

  const suggestions = await suggestItemsFromDescription(
    pr.pr_title || "",
    pr.pr_description || "",
    pr.department_name || ""
  );

  if (suggestions.length === 0) {
    return { message: "No matching items found in Item Master", addedItems: [] };
  }

  let nextId = (await repo.getMaxPrLineId()) + 1;
  let nextLineNum = (await repo.getMaxPrLineNum(prNumber)) + 1;

  const addedItems = [];

  for (const item of suggestions.slice(0, 3)) {
    const quantity = 1;
    const amount = quantity * (item.unitPrice || 0);

    await repo.insertPrLine({
      id: nextId,
      prNumber,
      lineNum: nextLineNum,
      itemDescription: item.name,
      qty: quantity,
      uom: item.unitOfMeasure || "Each",
      unitCost: item.unitPrice || 0,
      amount,
      categoryId: item.categoryCode || null,
      categoryName: item.categoryName || null,
      itemId: item.itemId || null,
      currency: pr.currency || "AED",
    });

    addedItems.push({
      lineNum: nextLineNum,
      description: item.name,
      quantity,
      unitPrice: item.unitPrice,
      categoryName: item.categoryName,
      reason: item.reason,
    });

    nextId++;
    nextLineNum++;
  }

  await repo.updatePrTotalAmount(prNumber);

  return {
    message: `Added ${addedItems.length} items based on PR description`,
    addedItems,
  };
}

export async function aiChatRecommendations(prNumber: string, userRequest: string) {
  const pr = await repo.getPrForAiAssisted(prNumber);
  if (!pr) throw { status: 404, message: "Requisition not found" };
  if (pr.pr_status?.toLowerCase() !== "draft") {
    throw { status: 400, message: "Only Draft requisitions can be modified" };
  }

  const recommendations = await getSmartRecommendations(userRequest, pool, {
    title: pr.pr_title || "",
    description: pr.pr_description || "",
    department: pr.department_name || "",
  });
  return { recommendations };
}

export async function getPrDepartments() {
  return repo.getPrDepartments();
}

export async function getRequisitionDocuments(prNumber: string) {
  return repo.getRequisitionDocuments(prNumber);
}

export async function addRequisitionDocument(prNumber: string, file: Express.Multer.File, createdBy: string, tenant?: string) {
  const { uploadFileToAzure } = await import("../../services/azure-blob.service");
  const { sanitizeFilename, DANGEROUS_EXTENSIONS } = await import("../_shared/file-upload");
  const pathModule = await import("path");

  if (file.size === 0) throw { status: 400, message: "File is empty" };
  if (file.size > 5 * 1024 * 1024) throw { status: 400, message: "File exceeds 5 MB limit" };

  const ext = pathModule.default.extname(file.originalname).toLowerCase();
  if (DANGEROUS_EXTENSIONS.has(ext)) throw { status: 400, message: `File type "${ext}" is not allowed` };

  const safeFilename = sanitizeFilename(file.originalname);
  const filePath = await uploadFileToAzure(file.buffer, `REQUISITIONS/${prNumber}/collaboration`, safeFilename, file.mimetype, tenant);
  const id = await repo.insertRequisitionDocument(prNumber, file.originalname, filePath, createdBy);
  return { id };
}

export async function deleteRequisitionDocumentById(prNumber: string, docId: string) {
  await repo.deleteRequisitionDocument(docId, prNumber);
  return { success: true };
}

export async function getRequisitionNotes(prNumber: string) {
  const notes = await repo.getRequisitionNotes(prNumber);
  return { notes };
}

export async function updateRequisitionNotes(prNumber: string, notes: string) {
  await repo.updateRequisitionNotes(prNumber, notes);
  return { success: true };
}

export async function getRequisitionComments(prNumber: string) {
  return repo.getRequisitionComments(prNumber);
}

export async function addRequisitionComment(prNumber: string, body: any) {
  const { comments, created_by, created_by_name } = body;
  const id = await repo.insertRequisitionComment(
    prNumber, comments, created_by || "system", created_by_name || "System"
  );
  return { id };
}

export async function deleteRequisitionCommentById(prNumber: string, commentId: string) {
  await repo.deleteRequisitionComment(commentId, prNumber);
  return { success: true };
}

// PO Collaboration - Documents
export async function getPoDocuments(poNumber: string) {
  return repo.getPoDocuments(poNumber);
}

export async function addPoDocument(poNumber: string, file: Express.Multer.File, createdBy: string, tenant?: string) {
  const { uploadFileToAzure } = await import("../../services/azure-blob.service");
  const { sanitizeFilename, DANGEROUS_EXTENSIONS } = await import("../_shared/file-upload");
  const pathModule = await import("path");

  if (file.size === 0) throw { status: 400, message: "File is empty" };
  if (file.size > 5 * 1024 * 1024) throw { status: 400, message: "File exceeds 5 MB limit" };

  const ext = pathModule.default.extname(file.originalname).toLowerCase();
  if (DANGEROUS_EXTENSIONS.has(ext)) throw { status: 400, message: `File type "${ext}" is not allowed` };

  const safeFilename = sanitizeFilename(file.originalname);
  const filePath = await uploadFileToAzure(file.buffer, `PURCHASE-ORDERS/${poNumber}/collaboration`, safeFilename, file.mimetype, tenant);
  const id = await repo.insertPoDocument(poNumber, file.originalname, filePath, createdBy);
  return { id };
}

export async function deletePoDocumentById(poNumber: string, docId: string) {
  await repo.deletePoDocument(docId, poNumber);
  return { success: true };
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

// PO Collaboration - Comments
export async function getPoComments(poNumber: string) {
  return repo.getPoComments(poNumber);
}

export async function addPoComment(poNumber: string, body: any) {
  const { comments, created_by, created_by_name } = body;
  const id = await repo.insertPoComment(
    poNumber, comments, created_by || "system", created_by_name || "System"
  );
  return { id };
}

export async function deletePoCommentById(poNumber: string, commentId: string) {
  await repo.deletePoComment(commentId, poNumber);
  return { success: true };
}

export async function getPoStats(sessionUser: any) {
  const isSupplier = sessionUser?.userRole === "ROLE_SUPPLIER_ADMIN" || sessionUser?.userRole === "ROLE_SUPPLIER_USER";
  let supplierFilter = "";
  const params: any[] = [];
  if (isSupplier && sessionUser?.supplierId) {
    supplierFilter = `WHERE supplier_id = $1 AND po_status NOT IN ('Draft', 'Pending Approval', 'Rejected', 'More Info Required')`;
    params.push(sessionUser.supplierId);
  }
  return repo.getPoStats(supplierFilter, params,sessionUser?.userRole, sessionUser?.orgIds,sessionUser?.department,sessionUser?.id, sessionUser?.userName);
}

export async function getPoStatsByDepartment(sessionUser: any) {
  return repo.getPoStatsByDepartment(
    sessionUser?.userRole,
    sessionUser?.orgIds,
    sessionUser?.department,
    sessionUser?.id,
    sessionUser?.userName,
  );
}

export async function getPurchaseOrders(query: any, sessionUser: any) {
  const loggedInUser = await repo.getUserById(sessionUser?.id);
  if (!loggedInUser) {
    throw { status: 401, message: "Unauthorized" };
  }
  const { page, limit, offset } = parseListPageLimit(query.page, query.limit);
  const status = query.status as string;
  const exportLines = isExportAllRows(query.exportLines, limit);
  let statusArray: string[] = [];
  if (status && status.includes(",")) {
    statusArray = status.split(",");
  } else {
    statusArray = status ? [status] : [];
  }
  const search = query.search as string;
  const isSupplier = sessionUser?.userRole === "ROLE_SUPPLIER_ADMIN" || sessionUser?.userRole === "ROLE_SUPPLIER_USER";
  const isProcurement = sessionUser?.userRole === "ROLE_PROCUREMENT_OFFICER" || sessionUser?.userRole === "ROLE_PROCUREMENT_MANAGER";
  const isSuperAdmin =
    sessionUser?.userRole === "ROLE_SUPERADMIN" ||
    sessionUser?.userRole === "ROLE_SYSADMIN" ||
    sessionUser?.roles?.includes("ROLE_SUPERADMIN") ||
    sessionUser?.roles?.includes("ROLE_SYSADMIN");
  const orgIds = loggedInUser.attribute_12 || sessionUser?.orgIds || [];
  const department = loggedInUser.department_name;

  let whereClause = "WHERE 1=1";
  const params: any[] = [];
  let paramIndex = 1;

  if (isSupplier && sessionUser?.supplierId) {
    whereClause += ` AND supplier_id = $${paramIndex}`;
    params.push(sessionUser.supplierId);
    paramIndex++;
    whereClause += ` AND po_status NOT IN ('Draft', 'Pending Approval', 'Rejected', 'More Info Required')`;
  }

  if (!isSuperAdmin && !isSupplier && orgIds) {
    const orgIdArray = orgIds
      .split(",")
      .map((id: string) => id.trim())
      .filter((id: string) => id && !isNaN(Number(id)))
      .map((id: string) => Number(id));

    whereClause += ` AND ((org_id = ANY($${paramIndex++})`;
    params.push(orgIdArray);

    if (!isProcurement && department) {
      whereClause += ` AND department_name = $${paramIndex++}) OR (po_owner_id = $${paramIndex++}) OR (attribute_1 ILIKE $${paramIndex++}))`;
      params.push(department);
      params.push(Number(loggedInUser.id));
      params.push(`%${loggedInUser.user_name}%`);
    } else {
      whereClause += `) OR attribute_1 ILIKE $${paramIndex++})`;
      params.push(`%${loggedInUser.user_name}%`);
    }
  }
  if (status && status !== "all") {
    const trimmed = statusArray.map((s: string) => String(s).trim()).filter(Boolean);
    if (trimmed.length > 1) {
      whereClause += ` AND TRIM(po_status) = ANY($${paramIndex++})`;
      params.push(trimmed);
    } else if (trimmed.length === 1) {
      whereClause += ` AND TRIM(po_status) = $${paramIndex++}`;
      params.push(trimmed[0]);
    } else if (status?.trim()) {
      whereClause += ` AND TRIM(po_status) = $${paramIndex++}`;
      params.push(status.trim());
    }
  }

  if (search) {
    whereClause += ` AND (
      po_number ILIKE $${paramIndex} OR 
      company_name ILIKE $${paramIndex} OR
      po_owner_name ILIKE $${paramIndex} OR
      buyer_name ILIKE $${paramIndex} OR
      department_name ILIKE $${paramIndex}
    )`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  const supplierIdFilter = Number(query.supplierId);
  if (Number.isFinite(supplierIdFilter) && supplierIdFilter > 0) {
    whereClause += ` AND supplier_id = $${paramIndex++}`;
    params.push(supplierIdFilter);
  }

  const minAmount = String(query.minAmount ?? "").trim() === "" ? NaN : Number(query.minAmount);
  if (Number.isFinite(minAmount)) {
    whereClause += ` AND COALESCE(po_total_cost, 0)::numeric > $${paramIndex++}`;
    params.push(minAmount);
  }

  const maxAmount = String(query.maxAmount ?? "").trim() === "" ? NaN : Number(query.maxAmount);
  if (Number.isFinite(maxAmount)) {
    whereClause += ` AND COALESCE(po_total_cost, 0)::numeric < $${paramIndex++}`;
    params.push(maxAmount);
  }

  const departmentFilter = String(query.department ?? "").trim();
  if (departmentFilter) {
    whereClause += ` AND department_name ILIKE $${paramIndex++}`;
    params.push(`%${departmentFilter}%`);
  }

  const source = query.source as string;
  if (source === "non-sourcing") {
    whereClause += ` AND pr_number IS NULL`;
  } else if (source === "sourcing") {
    whereClause += ` AND pr_number IS NOT NULL`;
  }

  const paramsSnapshot = [...params];

  const result = await repo.getPurchaseOrders({
    whereClause,
    queryParams: params,
    paramIndex: paramIndex,
    limit: limit,
    offset: offset,
    username: loggedInUser.user_name,
  });

  const finalResult = await Promise.all(
    result.rows.map(async (row) => {
      const currentApprover = await repo.getCurrentApprover(row.po_number, "Purchase Order");
  
      return {
        ...row,
        currentApprover: currentApprover?.name || null,
      };
    })
  );

  const exportLineRows = exportLines ? await repo.getPoExportLineRows(whereClause, paramsSnapshot) : undefined;

  return {
    data: finalResult,
    pagination: listPaginationMeta(result.total, page, limit),
    ...(exportLineRows !== undefined ? { exportLines: exportLineRows } : {}),
  };
}

export async function createPurchaseOrder(body: any) {
  const {
    description, poType, supplierId, supplierName,
    deliveryLocation, requiredDate, requestorId, requestorName,
    requestorDepartment, buyerId, buyerName, currency,
    budgetId, budgetName, paymentTermsId, paymentTermsName, orgId,
    advanceFlag, advancePercentage, buyerEmail
  } = body;

  const poNumber = await repo.getPoPrefixAndIncrement();
  const requestor = await repo.getUserById(requestorId);
  const requestorEmail = requestor?.user_name || null;
  let departmentName = "";
  if (requestorDepartment) {
    departmentName = await repo.getDepartmentById(requestorDepartment) || "";
  }

  let locationName = "";
  let locId = deliveryLocation;
  if (deliveryLocation) {
    if(deliveryLocation.includes("LOC")) {
      locId = deliveryLocation.replace("LOC", "");
    }
    locationName = await repo.getLocLocationById(locId);
  }

  // Set budget segment from budgetId
  const budgetSegment = budgetId ? String(budgetId) : null;

  // getting active form ID
  
  await repo.insertPurchaseOrder({
    poNumber,
    description,
    poType,
    supplierId: supplierId || null,
    supplierName: supplierName || null,
    buyerId: buyerId || null,
    buyerName: buyerName || null,
    requestorId: requestorId || null,
    requestorName: requestorName || null,
    departmentName: departmentName || "",
    currency: currency || "AED",
    deliveryLocation: locId || null,
    locationName: locationName || "",
    requiredDate: requiredDate || null,
    budgetName: budgetName || null,
    budgetSegment: budgetSegment || null,
    paymentTermsId: paymentTermsId || null,
    paymentTermsName: paymentTermsName || null,
    advanceFlag: advanceFlag ? "Y" : "N",
    advancePercentage: advancePercentage ? parseFloat(advancePercentage) : null,
    createdBy: requestorName || "system",
    orgId: orgId || 0,
    buyerEmail: buyerEmail || null,
    requestorEmail: requestorEmail || null,
  });

  return { poNumber, message: "PO created successfully" };
}

export async function getPurchaseOrderDetail(poNumber: string) {
  const header = await repo.getPoByNumber(poNumber);
  if (!header) return null;

  const items = await repo.getPoLines(poNumber);

  let supplier = null;
  if (header.supplier_id) {
    supplier = await repo.getSupplierBasicInfo(header.supplier_id);
  }

  const approvalHistory = await repo.getApprovalHistory(poNumber);

  if(header.attribute_4 && header.attribute_4 !== "") 
  {
  const data = await formService.getScoreAndRatingByForm(header.attribute_4, header.po_number);
  return { ...header, items, supplier, approvalHistory,data };
  }
  else
  {
  return { ...header, items, supplier, approvalHistory };
  }
}

export async function getPoDeliveryNotes(poNumber: string) {
  return repo.getDeliveryNotes(poNumber);
}

export async function getPoGrns(poNumber: string) {
  return repo.getGrns(poNumber);
}

export async function updateTaxIncluded(poNumber: string, taxIncluded: string) {
  await repo.updateTaxIncluded(poNumber, taxIncluded);
  const poLines = await repo.getPoLines(poNumber);
    if(poLines.length > 0) {
      let netCost = 0;
      let taxTotal =0;
      let totalCost = 0;
       if(taxIncluded === "Yes") {
          for(const line of poLines) {
            const taxAmount = line.tax_amount || 0;
            const lineCost = line.line_cost || 0;
            const taxRate = line.tax_rate || 0;
            const lineTotal = Number(taxAmount) + Number(lineCost);
          
            const newTaxAmount = Number(lineTotal) * Number(taxRate)/100;
            const newLineCost = Number(lineTotal) - Number(newTaxAmount);
            const newUnitPrice = Number(newLineCost) / Number(line.line_qty);
            await repo.updatePoLineValues(line.id, {
              taxAmount: newTaxAmount,
              lineCost: newLineCost,
              unitPrice: newUnitPrice,
            });
            netCost = Number(netCost) + Number(newLineCost);
            taxTotal = Number(taxTotal) + Number(newTaxAmount);
          }
        }else{
          for(const line of poLines) {
            const taxRate = line.tax_rate || 0;
            const quantity = line.line_qty|| 0;
            const newLineCost = Number(quantity) * Number(line.line_unit_cost);
            const newTaxAmount = Number(newLineCost) * Number(taxRate)/100;
            const newUnitPrice = Number(newLineCost) / Number(quantity);
          
          await repo.updatePoLineValues(line.id, {
            taxAmount: newTaxAmount,
            lineCost: newLineCost,
            unitPrice: newUnitPrice,
          });
          netCost = Number(netCost) + Number(newLineCost);
          taxTotal = Number(taxTotal) + Number(newTaxAmount);
        }
      }
      totalCost = Number(netCost) + Number(taxTotal);
      await repo.updatePoTotals(poNumber, netCost, taxTotal, totalCost);
    }
  return { success: true };
}

export async function getPoInvoices(poNumber: string) {
  return repo.getInvoices(poNumber);
}

export async function getReceiptsForInvoice(poNumber: string) {
  const [receipts, invoices, poLines] = await Promise.all([
    repo.getReceiptsForInvoice(poNumber),
    repo.getInvoices(poNumber),
    repo.getPoLines(poNumber),
  ]);

  // Reduce invoiceable receipt amount by approved/paid prepayment invoices.
  const prepaymentDeduction = (invoices || [])
    .filter((inv: any) => {
      const invoiceType = String(inv?.invoice_type || "").toLowerCase();
      const status = String(inv?.invoice_status || "").toLowerCase();
      return (
        invoiceType === "prepayment" &&
        (status === "approved" || status === "paid")
      );
    })
    .reduce((sum: number, inv: any) => {
      const paidAmount = Number(inv?.invoice_amount_paid) || 0;
      const invoiceAmount = Number(inv?.invoice_amount) || 0;
      return sum + (paidAmount > 0 ? paidAmount : invoiceAmount);
    }, 0);

  if (prepaymentDeduction <= 0)  return receipts.map((receipt: any) => {
    const poLine = poLines?.find(
      (l: any) =>
        l.po_line_number === receipt.po_line_number
    );

    return {
      ...receipt,
      product_category:
        poLine?.product_category || null,
      product_category_name:
        poLine?.product_category_name || null,
    };
  });
  let remainingDeduction = prepaymentDeduction;
  return (receipts || []).map((line: any) => {
    const receivedCost = Number(line?.received_cost) || 0;
    const loadedCost = Number(line?.loaded_cost) || receivedCost;

    if (remainingDeduction <= 0 || receivedCost <= 0) {
      return line;
    }

    const deduct = Math.min(remainingDeduction, receivedCost);
    remainingDeduction -= deduct;

    return {
      ...line,
      product_category: poLines?.find((l: any) => l.po_line_number === line.po_line_number)?.product_category || null,
      product_category_name: poLines?.find((l: any) => l.po_line_number === line.po_line_number)?.product_category_name || null,
      received_cost: Math.max(0, receivedCost - deduct),
      loaded_cost: Math.max(0, loadedCost - deduct),
    };
  });
}

export async function createInvoice(headerData: any, receiptLines: any[], documents?: Array<{ fileName: string; filePath: string; createdBy: string; docUri?: Buffer | null }>) {
  if (!headerData.po_number) throw { status: 400, message: "PO number is required" };
  if (!headerData.invoice_number) throw { status: 400, message: "Invoice number is required" };
  if (!headerData.invoice_description) throw { status: 400, message: "Invoice description is required" };
  if (!headerData.invoice_date) throw { status: 400, message: "Invoice date is required" };
  if (!headerData.invoice_due_date) throw { status: 400, message: "Invoice due date is required" };
  if (!receiptLines || receiptLines.length === 0) throw { status: 400, message: "At least one receipt must be selected" };
 

  const po = await repo.getPoByNumber(headerData.po_number);
  if (!po) throw { status: 404, message: "Purchase order not found" };

  if (headerData.invoice_amount <= 0 && po.advance_flag !== "Y") throw { status: 400, message: "Invoice amount must be greater than zero" };

  let supplierPaymentTermsId = headerData.payment_terms_id;
  try {
    const suppResult = await getPool().query(
      `SELECT payment_terms_id FROM dbo.supp_basic_org_dtls WHERE id = $1`,
      [po.supplier_id]
    );
    if (suppResult.rows[0]?.payment_terms_id) {
      supplierPaymentTermsId = suppResult.rows[0].payment_terms_id;
    }
  } catch {}

  let siteId: string | null = null;
  try {
    const siteResult = await getPool().query(
      `SELECT id FROM dbo.supp_site_dtls WHERE supplier_id = $1 LIMIT 1`,
      [po.supplier_id]
    );
    if (siteResult.rows[0]?.id) {
      siteId = siteResult.rows[0].id.toString();
    }
  } catch {}

  const enrichedHeader = {
    ...headerData,
    supplier_id: po.supplier_id,
    supplier_name: headerData.supplier_name || po.company_name,
    org_id: po.org_id || 0,
    payment_terms_id: supplierPaymentTermsId || po.po_payment_terms_id || null,
    payment_terms_name: headerData.payment_terms_name || po.payment_terms_name || null,
    currency_code: po.po_currency || headerData.currency_code || 'AED',
    department: po.department_name || null,
    department_name: po.department_name || null,
    budget_name: po.budget_name || null,
    budget_segment: po.budget_segment || null,
    cost_center_name: po.cost_center_name || null,
    external_po_number: po.external_po_number || null,
    site_id: siteId,
    buyer: po.buyer || null,
  };
  const orgData = await adminRepo.getOrgDetails();
  const result = await repo.createInvoice(enrichedHeader, receiptLines, documents);

  try {
    const { workflowService } = await import("../../services/workflowService");

    const processName = "Invoice";
    const taskSubject = `Invoice Approval Request - ${result.supplier_name || ''} - Invoice No:${result.invoice_number} - PO No:${result.po_number}`;
    const truncatedSubject = taskSubject.length > 80 ? taskSubject.substring(0, 80) : taskSubject;

    let orgName = "";
    try {
      const orgResult = await getPool().query(
        `SELECT organization_name FROM dbo.um_org_dtls WHERE id = $1`,
        [result.org_id]
      );
      orgName = orgResult.rows[0]?.organization_name || "";
    } catch {}

    const wfParams: Record<string, any> = {
      subject: truncatedSubject,
      srmsRefNumber: result.invoice_id.toString(),
      status: "Pending Approval",
      startDate: Date.now(),
      createdBy: headerData.submitted_by || headerData.created_by,
      organization: orgName,
      department: result.department_name || "",
      amount: parseFloat(String(enrichedHeader.invoice_amount || 0)),
      orgId: result.org_id || 0,
    };

    let approversList: string[] = [];
    try {
      const checkApprList = await workflowService.getFirstStepApproversList(processName, wfParams);
      if (!checkApprList || checkApprList.length === 0) {
        throw { status: 400, message: "Approver Hierarchy or Approval Flow is not defined for this request!" };
      }
      approversList = await workflowService.getApproversList(processName, wfParams);
    } catch (err: any) {
      if (err.status) throw err;
      throw { status: 400, message: err.message || "Approval flow not configured" };
    }

    let taskId = "";
    try {
      taskId = await workflowService.startProcess(
        truncatedSubject,
        processName,
        result.invoice_id.toString(),
        wfParams,
        headerData.created_by
      );
    } catch {}

    let systemInvoiceNumber = "";
    try {
      systemInvoiceNumber = await repo.getNextInvoiceNumber(result.org_id || 0);
    } catch {}

    await repo.updateInvoiceForApproval(result.invoice_id, {
      invoice_status: "Pending Approval",
      attribute_12: taskId || undefined,
      attribute_1: orgName || undefined,
      attribute_14: systemInvoiceNumber || undefined,
      invoice_approvers: approversList.join(", ") || undefined,
      last_modified_by: headerData.created_by,
    });

    publishTaskAssignmentEvent({
      taskId,
      templateEventId: EventTypes.TASK_ASSIGNMENT.INVOICE_APPROVAL,
      taskSub: `Invoice Approval Request - ${result.supplier_name || ''} - Invoice No:${result.invoice_number} - PO No:${result.po_number}`,
      submittedBy: headerData.created_by,
      department: result.department_name || "",
      variables: {
        invoiceNumber: result.invoice_number,
        invoiceDescription: result.invoice_description,
        orgLogoPath: orgData.org_logo_path,
      },
      domain: (po as any).domain || "",
    });
  } catch (err: any) {
    if (err.status) throw err;
    throw { status: 400, message: err.message || "Invoice approval workflow submission failed" };
  }

  return result;
}

export async function getPoNotes(poNumber: string) {
  const result = await repo.getPoNotes(poNumber);
  if (!result) throw { status: 404, message: "PO not found" };
  return { notes: result.notes || "" };
}

export async function updatePoNotes(poNumber: string, notes: string) {
  await repo.updatePoNotes(poNumber, notes);
  return { success: true };
}

/**
 * The Edit Purchase Order sheet posts the whole form, but the agent's edit tools send
 * only the field the user asked to change, so the body is merged onto the stored row
 * (see purchase-order-header-patch) rather than read as the complete new header.
 */
export async function updatePurchaseOrder(poNumber: string, body: any) {
  const {
    description, deliveryLocation, requiredDate,
    requestorId, requestorName, requestorDepartment,
    supplierId, supplierName, budgetName,
    currency, paymentTermsId, paymentTermsName, notes,
    advanceFlag, advancePercentage, orgId, budgetId
  } = body;

  const existing = await repo.getPoByNumber(poNumber);
  validationHelper.validateIsEditable(existing, existing?.po_status ?? "", "Purchase order");

  const patch: PurchaseOrderHeaderPatch = {};

  if (description !== undefined) patch.description = description;
  if (requiredDate !== undefined) patch.requiredDate = requiredDate || null;
  if (currency !== undefined) patch.currency = currency;
  if (notes !== undefined) patch.notes = notes;
  if (orgId !== undefined) patch.orgId = orgId;

  if (requestorId !== undefined || requestorName !== undefined) {
    patch.requestor = { id: requestorId ?? null, name: requestorName ?? null };
  }

  if (supplierId !== undefined || supplierName !== undefined) {
    patch.supplier = { id: supplierId ?? null, name: supplierName ?? null };
  }

  if (budgetId !== undefined || budgetName !== undefined) {
    patch.budget = { id: budgetId ?? null, name: budgetName ?? null };
  }

  if (paymentTermsId !== undefined || paymentTermsName !== undefined) {
    patch.paymentTerms = { id: paymentTermsId ?? null, name: paymentTermsName ?? null };
  }

  if (advanceFlag !== undefined) {
    patch.advance = { flag: !!advanceFlag, percentage: advancePercentage ?? null };
  }

  if (deliveryLocation !== undefined) {
    patch.location = {
      id: deliveryLocation || null,
      name: deliveryLocation ? await repo.getLocLocationById(deliveryLocation) : null,
    };
  }

  if (requestorDepartment !== undefined) {
    patch.departmentName = requestorDepartment
      ? (await repo.getDepartmentById(requestorDepartment)) || ""
      : "";
  }

  await repo.updatePoFull(poNumber, mergePurchaseOrderHeader(existing, patch));
  return { success: true };
}

export async function copyPurchaseOrder(poNumber: string) {
  const header = await repo.getPoByNumber(poNumber);
  if (!header) throw { status: 404, message: "Purchase order not found" };

  const lines = await repo.getPoLines(poNumber);
  const newPoNumber = await repo.getPoPrefixAndIncrement();

  await repo.insertPurchaseOrder({
    poNumber: newPoNumber,
    description: header.po_description ? `Copy of ${header.po_description}` : `Copy of ${poNumber}`,
    poType: header.po_type || "STANDARD",
    supplierId: header.supplier_id ?? null,
    supplierName: header.company_name ?? null,
    buyerId: header.buyer ?? null,
    buyerName: header.buyer_name ?? null,
    requestorId: header.po_owner_id ?? null,
    requestorName: header.po_owner_name ?? null,
    departmentName: header.department_name ?? "",
    currency: header.po_currency || "AED",
    deliveryLocation: header.delivertto_location_id ?? null,
    locationName: header.delivertto_location_name ?? "",
    requiredDate: header.po_required_date ?? null,
    budgetName: header.budget_name ?? null,
    budgetSegment: header.budget_segment ?? null,
    paymentTermsId: header.po_payment_terms_id ?? null,
    paymentTermsName: header.payment_terms_name ?? null,
    advanceFlag: header.advance_flag || "N",
    advancePercentage: header.advance_percentage ?? null,
    createdBy: header.po_owner_name || "system",
    orgId: header.org_id ?? 0,
    buyerEmail: header.buyer_email ?? null,
    requestorEmail: header.po_owner_email ?? null,
  });

  for (const line of lines) {
    const nextId = await repo.getNextPoLineId();
    const lineNum = String((lines.indexOf(line) + 1));
    await repo.insertPoLine({
      id: nextId,
      poNumber: newPoNumber,
      lineNumber: lineNum,
      description: line.line_description,
      quantity: parseFloat(line.line_qty) || 1,
      unitPrice: parseFloat(line.line_unit_cost) || 0,
      uom: line.line_unit || "Each",
      taxRate: parseFloat(line.tax_rate) || 0,
      taxAmount: parseFloat(line.tax_amount) || 0,
      lineCost: parseFloat(line.line_cost) || 0,
      itemId: line.item_id ? String(line.item_id) : null,
      itemName: line.item_name ?? null,
      categoryCode: line.product_category ? Number(line.product_category) : null,
      categoryName: line.product_category_name ?? null,
      discount: line.discount || 0,
      taxCode: line.tax_rate_code || null,
      taxId: line.tax_id || null,
    });
  }

  let poNetCost = 0;
  let poTaxTotal = 0;
  let poTotalCost = 0;
  const newLines = await repo.getPoLines(newPoNumber);
  for (const line of newLines) {
    poNetCost += parseFloat(line.line_cost) || 0;
    poTaxTotal += parseFloat(line.tax_amount) || 0;
    poTotalCost += parseFloat(line.line_cost) + parseFloat(line.tax_amount) || 0;
  }
  await repo.updatePoTotals(newPoNumber, poNetCost, poTaxTotal, poTotalCost);

  return { success: true, poNumber: newPoNumber, message: "PO copied successfully" };
}

export async function deletePurchaseOrder(poNumber: string) {
  const po = await repo.getPoByNumber(poNumber);
  const check = await repo.getPoStatus(poNumber);
  if (!check) throw { status: 404, message: "Purchase order not found" };
  const result = await getPool().query(`select attribute_11, pr_amount from dbo.supp_pr_header_dtls where pr_number = $1`, [po.pr_number]);
  const reservedPRAmount = result.rows[0]?.attribute_11 ? Number(result.rows[0]?.attribute_11) : 0;
  const prAmount = result.rows[0]?.pr_amount ? Number(result.rows[0]?.pr_amount) : 0;
  let remainingPRAmount = reservedPRAmount;
  if((check.po_status === "Approved" || check.po_status === "approved") && reservedPRAmount < prAmount){
    remainingPRAmount = reservedPRAmount + Number(po.po_total_cost);
  }
  
 
  if(po.pr_number !== null && po.bid_award_id === null){
    const prNumber = po.pr_number;
    await getPool().query(`update dbo.supp_pr_header_dtls set attribute_7 = null, po_number = NULLIF(
      array_to_string(
        array_remove(
          string_to_array(po_number, ','),
          $1
        ),
        ','
      ),
      ''), pr_status = 'Approved', all_lines_have_po = false, attribute_11 = $2 where pr_number = $3`, [poNumber,remainingPRAmount, prNumber]);
        await getPool().query("update dbo.supp_pr_line_dtls set po_number = null where po_number = $1", [poNumber]);
   }else if(po.bid_award_id !== null){
    await getPool().query(`update dbo.supp_pr_header_dtls set po_number = NULLIF(
      array_to_string(
        array_remove(
          string_to_array(po_number, ','),
          $1
        ),
        ','
      ),
      '') where pr_number = $2`, [poNumber, po.pr_number]);
    await getPool().query(`update dbo.supp_bid_award_dtls set attribute_11 = NULLIF(
      array_to_string(
        array_remove(
          string_to_array(attribute_11, ','),
          $1
        ),
        ','
      ),
      '') where id = $2`, [poNumber, po.bid_award_id]);
    await getPool().query("update dbo.supp_bid_award_line_dtls set attribute_11 = null where attribute_11 = $1", [poNumber]);
   }else if(po.contract_ref_no !== null){
    await getPool().query("update dbo.cm_sow set po_number = null where po_number = $1", [poNumber]);
   }

  await repo.deletePoLines(poNumber);
  await repo.deletePoHeader(poNumber);
  return { success: true };
}

export async function submitPurchaseOrder(poNumber: string, reqUser: any) {
  const { workflowService } = await import("../../services/workflowService");

  if (!reqUser) throw { status: 401, message: "User not authenticated" };

  const po = await repo.getPoWithCreatorAndOrg(poNumber);
  if (!po) throw { status: 404, message: "Purchase order not found" };
  if (po.po_status !== "Draft") {
    throw { status: 400, message: "Only draft purchase orders can be submitted for approval" };
  }

  const linesResult = await getPool().query(
    `SELECT COUNT(*) as count FROM dbo.supp_po_line_dtls WHERE po_number = $1`,
    [poNumber]
  );
  if (parseInt(linesResult.rows[0].count) === 0) {
    throw { status: 400, message: "Cannot submit for approval: Purchase order must have at least one line item" };
  }

  if (po.po_total_cost == null || parseFloat(po.po_total_cost) <= 0) {
    throw { status: 400, message: "Cannot submit for approval: Purchase order amount must be greater than zero" };
  }

  const userDetailsResult = await getPool().query(
    `SELECT id, user_name, name, department_name FROM dbo.um_user_dtls WHERE id = $1`,
    [reqUser.id]
  );
  const user = userDetailsResult.rows[0];
  if (!user) throw { status: 400, message: "Could not determine user identity" };
  const username = user.user_name || "system";

  let advanceInvoiceAmount: number | null = null;
  const advanceFlag = po.advance_flag === "Y" || po.advance_flag === "Yes";
  if (advanceFlag && po.advance_percentage != null && parseFloat(po.advance_percentage) > 0 && po.po_total_cost != null) {
    const totalCost = parseFloat(po.po_total_cost);
    const advPct = parseFloat(po.advance_percentage);
    advanceInvoiceAmount = (totalCost * advPct) / 100;
  }

  if (advanceInvoiceAmount != null) {
    await getPool().query(
      `UPDATE dbo.supp_po_header_dtls 
       SET advance_invoice_amount = $1
       WHERE po_number = $2`,
      [advanceInvoiceAmount, poNumber]
    );
  }

  const processName = "Purchase Order";
  const taskSubject = `PO Approval Request - ${po.po_number} - ${po.po_description || ""}`;
  const orgNameResult = await getPool().query(
    `SELECT organization_name FROM dbo.um_org_dtls WHERE id = $1`,
    [po.org_id]
  );
  const orgName = orgNameResult.rows[0]?.organization_name || "";

  const wfParams: Record<string, any> = {
    subject: taskSubject,
    srmsRefNumber: po.po_number,
    status: "Pending Approval",
    startDate: Date.now(),
    createdBy: user.name || username,
    organization: orgName || "",
    department: po.department_name || "",
    amount: parseFloat(po.po_total_cost || "0"),
    orgId: po.org_id || 0,
  };

  let checkApprList: string[] = [];
  try {
    checkApprList = await workflowService.getFirstStepApproversList(processName, wfParams);
  } catch (err: any) {
    throw { status: 400, message: err.message || "Approval flow not configured" };
  }

  if (!checkApprList || checkApprList.length === 0) {
    throw { status: 400, message: "Approver Hierarchy or Approval Flow is not defined for this request!" };
  }

  let approversList: string[] = [];
  try {
    approversList = await workflowService.getApproversList(processName, wfParams);
  } catch {
    approversList = checkApprList;
  }

  let taskId = "";
  try {
    taskId = await workflowService.startProcess(
      taskSubject,
      processName,
      po.po_number,
      wfParams,
      username
    );
  } catch (err: any) {
    throw { status: 400, message: err.message || "Failed to start approval workflow" };
  }

  await repo.updatePoForSubmission(poNumber, {
    status: "Pending Approval",
    taskId,
    approversList: approversList.join(", "),
    lastModifiedBy: username,
  });

  await repo.updatePoLinesStatus(poNumber, "Pending Approval");

  // Send PO_APPROVAL email to each first-step approver
  try {
    const { eventBus } = await import("../../services/eventBus/index");
    const { EventTypes } = await import("../../services/eventBus/events");
    const orgData = await adminRepo.getOrgDetails();

    const requesterEmailResult = await getPool().query(
      `SELECT email_id FROM dbo.um_user_dtls WHERE id = $1`,
      [reqUser.id]
    );
    const requesterEmail: string | undefined = requesterEmailResult.rows[0]?.email_id;

    for (const approverUsername of checkApprList) {
      const approverResult = await getPool().query(
        `SELECT name, email_id FROM dbo.um_user_dtls WHERE user_name = $1 LIMIT 1`,
        [approverUsername]
      );
      const approver = approverResult.rows[0];
      if (!approver?.email_id) continue;

    const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
    const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

    const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent('PO')}&&taskId=${encodeURIComponent(taskId)}&&email=${encodeURIComponent(approver.email_id)}&&refnumber=${encodeURIComponent(poNumber)}`;
      eventBus.publish({
        eventType: EventTypes.PO_APPROVAL,
        timestamp: new Date(),
        orgName: po.organization_name || undefined,
        emailId: approver.email_id,
        poNumber: po.po_number,
        poDepartment: po.department_name || "",
        poDescription: po.po_description || "",
        poAmount: parseFloat(po.po_total_cost || "0"),
        currency: po.currency || "USD",
        vendorName: po.vendor_name || "",
        status: "pending",
        approverName: approver.name || approverUsername,
        requestorName: po.buyer_name || "",
        requesterEmail,
        orgLogoPath: orgData.org_logo_path,
        emailApprovalLink:approvalLink, 
      });
    }
  } catch (emailErr) {
    console.error("[submitPurchaseOrder] Failed to send PO approval email:", emailErr);
  }

  return { success: true, message: "Successfully submitted for approval." };
}

export async function processPoApproval(poNumber: string, body: any, reqUser: any) {
  const { workflowService } = await import("../../services/workflowService");
  const { taskId, result, comments } = body;

  if (!reqUser) throw { status: 401, message: "User not authenticated" };
  if (!taskId || taskId === "undefined") throw { status: 400, message: "Invalid task details!" };
  if (!result) throw { status: 400, message: "result is required" };

  // Aligned: use repo abstraction instead of raw pool.query
  const user = await repo.getUserDetails(reqUser.id);
  const username = user.user_name || user.email_id || "system";
  const orgData = await adminRepo.getOrgDetails();

  const wfStepInstances = await workflowService.findByTaskId(taskId);

  if (!username || username === "system") {
    throw { status: 400, message: "Could not determine user identity" };
  }

  const po = await repo.getPoWithCreatorAndOrg(poNumber);
  if (!po) throw { status: 404, message: "Purchase order not found" };

  if (result === "ReSubmit") {
    const linesResult = await getPool().query(
      `SELECT COUNT(*) as count FROM dbo.supp_po_line_dtls WHERE po_number = $1`,
      [poNumber]
    );
    if (parseInt(linesResult.rows[0].count) === 0) {
      throw { status: 400, message: "Cannot submit for approval: Purchase order must have at least one line item" };
    }
    if (po.po_total_cost == null || parseFloat(po.po_total_cost) <= 0) {
      throw { status: 400, message: "Cannot submit for approval: Purchase order amount must be greater than zero" };
    }
  }

  // Aligned: use repo abstraction instead of raw pool.query
  const taskCreationDate = await repo.getTaskCreationDate(taskId);
  const userRoles = await repo.getUserRoles(reqUser.id);

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

  const resultLower = result.toLowerCase();

  if (ntaskId && ntaskId !== "") {
    let approvers="";
    if(po.attribute_1  && po.attribute_1 !== "")
    {
        approvers=po.attribute_1.concat(",").concat(username);
    }
    else
    {       
      approvers=username;
    }
    await repo.updatePoIssueDate(poNumber);
    await repo.updatePoTaskId(poNumber, ntaskId,approvers);
    const { publishTaskAssignmentEvent } = await import("../../services/eventBus/publishTaskAssignment");
    const { EventTypes } = await import("../../services/eventBus/events");

    let templateEventId = "";
    if (resultLower === "resubmit") {
      templateEventId = EventTypes.TASK_ASSIGNMENT.PO_RESUBMIT;
    } else if (resultLower === "more" || resultLower === "more info required") {
      templateEventId = EventTypes.TASK_ASSIGNMENT.PO_MORE_INFO;
    }else if(resultLower === "approve" || resultLower === "approved") {
      templateEventId = EventTypes.TASK_ASSIGNMENT.PO_APPROVAL;
    }

    const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=$1`,[ntaskId]);
    const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
    const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

    const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent('PO')}&&taskId=${encodeURIComponent(ntaskId)}&&email=${encodeURIComponent(approverEmail.rows[0].current_assignee)}&&refnumber=${encodeURIComponent(poNumber)}`;

    publishTaskAssignmentEvent({
      taskId: ntaskId,
      taskSub: `Purchase Order ${po.po_number}${po.po_description ? ` — ${String(po.po_description).slice(0, 200)}` : ""}`.slice(0, 500),
      templateEventId,
      submittedBy: user.name || username,
      department: po.dept_name || po.department_name || "",
      entityId: po.org_id != null ? String(po.org_id) : undefined,
      srmsRefNo: po.po_number,
      domain: (reqUser as any)?.domain,
      variables: {
        poNumber: po.po_number,
        poDescription: po.po_description || "",
        poDepartment: po.department_name || "",
        requestorName: po.buyer_name || "",
        orgLogoPath: orgData.org_logo_path,
        emailApprovalLink:approvalLink,
      },
      emailApprovalLink:approvalLink,
    });
  }

  if ((!ntaskId || ntaskId === "") && (resultLower === "approved" || resultLower === "approve")) {
    let approvers="";
    if(po.attribute_1  && po.attribute_1 !== "")
    {
        approvers=po.attribute_1.concat(",").concat(username);
    }
    else       
    {
        approvers=username;
    }
    await repo.updatePoApprovedFields(poNumber, username,approvers);
    await repo.updatePoLinesStatus(poNumber, "Approved");

    if(po.pr_number && !po.bid_award_id){
      const allDone = await repo.checkAllPrLinesHavePo(po.pr_number);
      if (allDone) {
        await repo.updatePrStatus(po.pr_number, "Complete",'na');

        const budgetSegment = po.budget_segment;

        if (
          budgetSegment &&
          !Number.isNaN(Number(budgetSegment))
        ) {

          await revisePrBudgetToApprovedPoAmount(
            po.pr_number,
            Number(budgetSegment)
          );
        }
      }
      const result = await getPool().query(`select attribute_11 from dbo.supp_pr_header_dtls where pr_number = $1`, [po.pr_number]);
      const attribute_11 = result.rows[0]?.attribute_11;
      const remainingAmount = Number(attribute_11) - Number(po.po_total_cost);
      if(remainingAmount >= 0){
        await getPool().query(`update dbo.supp_pr_header_dtls set attribute_11 =  ${String(remainingAmount)} where pr_number = $1`, [po.pr_number]);
      }
    }else if(po.bid_award_id){
      const allDone = await repo.checkAllAwardLinesHavePo(po.bid_award_id);
      if (allDone) {
        if (po.pr_number) {
          await repo.updatePrStatus(po.pr_number, "Complete",'na');
        }
        const budgetSegment = po.budget_segment;

        if (
          budgetSegment &&
          !Number.isNaN(Number(budgetSegment))
        ) {
          await reviseAwardBudgetToApprovedPoAmount(
            po.bid_award_id,
            Number(budgetSegment)
          );
        }
      }
      const result = await getPool().query(`select attribute_10 from dbo.supp_bid_award_dtls where id = $1`, [po.bid_award_id]);
      const attribute_10 = result.rows[0]?.attribute_10;
      const remainingAmount = Number(attribute_10) - Number(po.po_total_cost);
      if(remainingAmount >= 0){
        await getPool().query(`update dbo.supp_bid_award_dtls set attribute_10 =  ${String(remainingAmount)} where id = $1`, [po.bid_award_id]);
      }
    }else {   
        try {
        await applyPoApprovalBudgetReservation(poNumber, po);
      } catch (ex: any) {
        console.error("[PO Approval] Budget update error:", ex?.message);
        // Continue with approval even if budget update fails
      }
    }

    const ownerEmail = String(
      (po as { creator_email?: string; po_owner_email?: string }).creator_email ||
        (po as { po_owner_email?: string }).po_owner_email ||
        ""
    ).trim();
    if(po.pr_number){
        const allDone = await repo.checkAllPrLinesHavePo(po.pr_number);
        if (allDone) {
          await repo.updatePrStatus(po.pr_number, "Complete",'na');
        }
    }
    const poSupplier = await repo.getSupplierBasicInfo(po.supplier_id);
    if(!poSupplier){
      throw { status: 404, message: "Supplier not found" };
    }
    const ownerName = String(po.creator_name || po.po_owner_name || "").trim() || "User";
    const poTitle = String(po.po_description || po.po_number || poNumber).trim();
    const { eventBus } = await import("../../services/eventBus/index");
    const { EventTypes } = await import("../../services/eventBus/events");
    const orgData = await adminRepo.getOrgDetails();
    eventBus.publish({
      eventType: EventTypes.PO_APPROVED,
      timestamp: new Date(),
      poNumber,
      poTitle,
      ownerEmail,
      ownerName,
      orgName: po.organization_name || undefined,
      domain: (reqUser as any)?.domain,
      orgLogoPath: orgData.org_logo_path,
    });

    eventBus.publish({
      eventType: EventTypes.PO_APPROVED_SUPPLIER,
      timestamp: new Date(),
      poNumber: po.po_number,
      poDescription: po.po_description || "",
      supplierEmail:poSupplier.email_id,
      poSupplierName:poSupplier.supplier_name,
      orgName: po.organization_name || undefined,
      orgLogoPath: orgData.org_logo_path,
    });
  }

  if (resultLower === "rejected" || resultLower === "reject") {

    let approvers="";
    if(po.attribute_1  && po.attribute_1 !== "")
    {
        approvers=po.attribute_1.concat(",").concat(username);
    }
    else       
    {
        approvers=username;
    }
    await repo.updatePoRejected(poNumber, comments || "", approvers);
    await repo.updatePoLinesStatus(poNumber, "Rejected");
    const rejectComments = String(comments || "").trim();
    const ownerEmail = String(
      (po as { creator_email?: string; po_owner_email?: string }).creator_email ||
        (po as { po_owner_email?: string }).po_owner_email ||
        ""
    ).trim();
    if(po.pr_number !== null && po.bid_award_id === null){
      const prNumber = po.pr_number;
      await getPool().query(`update dbo.supp_pr_header_dtls set bidno = null, attribute_7 = null, po_number = NULLIF(
    array_to_string(
      array_remove(
        string_to_array(po_number, ','),
        $1
      ),
      ','
    ),
    ''), pr_status = 'Approved', all_lines_have_po = false where pr_number = $2`, [poNumber, prNumber]);
      await getPool().query("update dbo.supp_pr_line_dtls set po_number = null where po_number = $1", [poNumber]);
    }else if(po.bid_award_id !== null){
      await getPool().query(`update dbo.supp_pr_header_dtls set po_number = NULLIF(
        array_to_string(
          array_remove(
            string_to_array(po_number, ','),
            $1
          ),
          ','
        ),
        '') where pr_number = $2`, [poNumber, po.pr_number]);
      await getPool().query(`update dbo.supp_bid_award_dtls set attribute_11 = NULLIF(
      array_to_string(
        array_remove(
          string_to_array(attribute_11, ','),
          $1
        ),
        ','
      ),
      '') where id = $2`, [poNumber, po.bid_award_id]);
    await getPool().query("update dbo.supp_bid_award_line_dtls set attribute_11 = null where attribute_11 = $1", [poNumber]);
    }
    // else {
    //   try {
    //     await releaseDirectPoBudgetReservation(po, poNumber, username);
    //   } catch (ex: any) {
    //     console.error("[PO Rejection] Budget unreservation error:", ex?.message);
    //   }
    // }
    const ownerName = String(po.creator_name || po.po_owner_name || "").trim() || "User";
    const poTitle = String(po.po_description || po.po_number || poNumber).trim();
    const { eventBus } = await import("../../services/eventBus/index");
    const { EventTypes } = await import("../../services/eventBus/events");
    const orgData = await adminRepo.getOrgDetails();
    eventBus.publish({
      eventType: EventTypes.PO_REJECTED,
      timestamp: new Date(),
      poNumber,
      poTitle,
      ownerEmail,
      ownerName,
      rejectComments,
      orgName: po.organization_name || undefined,
      domain: (reqUser as any)?.domain,
      orgLogoPath: orgData.org_logo_path,
    });
  }

  if (resultLower === "more info required" || resultLower === "more") {
    // try {
    //   await releaseDirectPoBudgetReservation(po, poNumber, username);
    // } catch (ex: any) {
    //   console.error("[PO More Info] Budget unreservation error:", ex?.message);
    // }

    await repo.updatePoMoreInfoRequired(poNumber, username);
    let taskSubject = `PO Request for More Info - ${po.po_number} - ${po.po_description || ""}`;
    if (taskSubject.length > 80) {
      taskSubject = taskSubject.substring(0, 80);
    }
    const processName = "Purchase Order";
    const params = {
      subject: taskSubject,
      srmsRefNumber: po.po_number,
      status: "Pending Approval",
      startDate: new Date().getTime(),
      createdBy: user.name || username,
      organization: po.organization_name || "",
      department: po.dept_name || po.department_name || "",
    };

    // Aligned with Budget: guard against empty approvers list
    const checkApprList = await workflowService.getFirstStepApproversList(processName, params);
    if (!checkApprList || checkApprList.length === 0) {
      throw { status: 400, message: "Approver Hierarchy or Approval Flow is not defined for this request!" };
    }
   const approvers = await workflowService.getApproversList(processName, params);
    await repo.updatePoApproversList(poNumber, approvers.join(", "));
  }

  if (resultLower === "resubmit") {
    await repo.updatePoResubmit(poNumber, username);
  }

  // Aligned: single approval history insert, before approver list update
  await repo.insertPoApprovalHistory({
    objectId: poNumber,
    supplierId: 0,
    comments: comments || "",
    approverId: user.id,
    approverName: user.name || username,
    approverEmail: user.email_id || null,
    approverDesignation: user.designation || null,
    status: resultLower,
    requestedDate: taskCreationDate || new Date(),
  });

  // Aligned: explicit approver list cleanup on approve
  const wfStepInstance = wfStepInstances[0];
  const currentApprover = await userRepository.findUserByUsername(wfStepInstance.current_assignee);
  if (resultLower === "approve" || resultLower === "approved") {
    const currentApprovers = po.approvers_list;
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
            newApprovers = currentApprovers.replace(`${currentApprover.name},`, "").replace(`, ${currentApprover?.name}`, "");
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
            newApprovers = currentApprovers.replace(`${currentApprover?.name}`, "");
          }
        }
      }
      await repo.updatePoApproversList(poNumber, newApprovers);
    }
  }

  let newStatus = "Pending Approval";
  if ((resultLower === "approve" || resultLower === "approved") && (!ntaskId || ntaskId === "")) {
    newStatus = "Approved";
  } else if (resultLower === "reject" || resultLower === "rejected") {
    newStatus = "Rejected";
  } else if (resultLower === "more info required" || resultLower === "more") {
    newStatus = "More Info Required";
  } else if (resultLower === "resubmit" || resultLower === "resubmitted") {
    newStatus = "ReSubmit";
  }

  return {
    success: true,
    message: "Successfully processed your request.",
    newStatus,
  };
}

export async function addPoLine(poNumber: string, body: any) {
  const { description, quantity, unitPrice, uom, taxRate, taxCode, taxAmount, lineCost, categoryCode, categoryName, itemId, itemName, discount,taxId, taxIncluded } = body;

  const check = await repo.getPoStatus(poNumber);
  validationHelper.validateIsEditable(check, check.po_status, "Purchase order");

  const nextLineNum = await repo.getNextPoLineNumber(poNumber);
  const nextId = await repo.getNextPoLineId();

  const id = await repo.insertPoLine({
    id: nextId,
    poNumber,
    lineNumber: String(nextLineNum),
    description,
    quantity,
    unitPrice,
    uom,
    taxRate,
    taxAmount,
    lineCost,
    itemId: itemId || null,
    itemName: itemName || null,
    categoryCode: categoryCode ? parseInt(categoryCode) : null,
    categoryName: categoryName || null,
    discount: discount || 0,
    taxCode: taxCode || null,
    taxId: taxId || null,
  });

  await updatePOTotals(getPool(), poNumber);
  return { success: true, id };
}

/**
 * Same partial-body contract as updatePurchaseOrder: the Add/Edit Line Item sheet sends
 * every field (including the line cost and tax it worked out itself), while the agent
 * sends just the quantity or price and lets the merge derive the rest.
 */
export async function updatePoLine(poNumber: string, lineId: string, body: any) {
  const { description, quantity, unitPrice, uom, taxCode, taxRate, taxAmount, lineCost, categoryCode, categoryName, itemId, itemName , discount,taxId, taxIncluded} = body;

  const check = await repo.getPoStatus(poNumber);
  validationHelper.validateIsEditable(check, check?.po_status ?? "", "Purchase order");

  const existing = await repo.getPoLineById(lineId, poNumber);
  if (!existing) throw { status: 404, message: "Purchase order line not found" };

  const patch: PurchaseOrderLinePatch = {};

  if (description !== undefined) patch.description = description;
  if (quantity !== undefined) patch.quantity = quantity;
  if (unitPrice !== undefined) patch.unitPrice = unitPrice;
  if (uom !== undefined) patch.uom = uom;
  if (taxRate !== undefined) patch.taxRate = taxRate;
  if (discount !== undefined) patch.discount = discount;
  if (taxCode !== undefined) patch.taxCode = taxCode;
  if (taxId !== undefined) patch.taxId = taxId;
  if (lineCost !== undefined) patch.lineCost = lineCost;
  if (taxAmount !== undefined) patch.taxAmount = taxAmount;

  if (itemId !== undefined || itemName !== undefined) {
    patch.item = { id: itemId ?? null, name: itemName ?? null };
  }

  if (categoryCode !== undefined || categoryName !== undefined) {
    patch.category = { code: categoryCode ?? null, name: categoryName ?? null };
  }

  await repo.updatePoLine({
    lineId,
    poNumber,
    ...mergePurchaseOrderLine(existing, patch),
  });

  await updatePOTotals(getPool(), poNumber);
  return { success: true };
}

export async function deletePoLineItem(poNumber: string, lineId: string) {
  const check = await repo.getPoStatus(poNumber);
  if (!check) throw { status: 404, message: "Purchase order not found" };

  await repo.deletePoLine(lineId, poNumber);
  await updatePOTotals(getPool(), poNumber);
  return { success: true };
}

export async function getCategories(query: any) {
  const { level, parent, search } = query;
  if (search && typeof search === "string") {
    return storage.searchCategories(search);
  } else if (level && typeof level === "string") {
    return storage.getCategoriesByLevel(level);
  } else if (parent && typeof parent === "string") {
    return storage.getCategoriesByParent(parent);
  }
  return storage.getCategories();
}

export async function getCategory(id: string) {
  return storage.getCategory(id);
}

export async function getCategoryByCode(code: string) {
  return storage.getCategoryByCode(code);
}

export async function createCategory(body: any) {
  const validatedData = insertCategorySchema.parse({
    ...body,
    createdAt: new Date().toISOString(),
  });
  return storage.createCategory(validatedData);
}

export async function updateCategory(id: string, body: any) {
  return storage.updateCategory(id, body);
}

export async function deleteCategory(id: string) {
  return storage.deleteCategory(id);
}

export async function createProductCategory(categoryData: any) {
  if (!categoryData.categoryName?.trim()) {
    throw { status: 400, message: "Category name is required" };
  }
  if (!categoryData.status?.trim()) {
    throw { status: 400, message: "Status is required" };
  }

  const user = categoryData.createdBy || "SYSTEM_USER";

  const result = await repo.createProductCategory({
    categoryName: categoryData.categoryName.trim(),
    description: categoryData.description?.trim() || null,
    status: categoryData.status.trim(),
    parentCategoryId: categoryData.parentCategoryId ? parseInt(categoryData.parentCategoryId) : 0,
    catType: categoryData.catType ? parseInt(categoryData.catType) : 0,
    extEntityRef: categoryData.extEntityRef ? parseInt(categoryData.extEntityRef) : 0,
    prodCategoryId: categoryData.prodCategoryId?.trim() || undefined,
    createdBy: user
  });

  return {
    message: "Successfully created product category!",
    categoryId: result.category_id,
    prodCategoryId: result.prod_category_id,
    categoryName: result.category_name,
    createdBy: result.created_by,
    createdDate: result.creation_date
  };
}

export async function getProductCategories(query: any) {
  const { page, limit, type = "no" } = query;

  if (page || limit || type === "full") {
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum =  Math.max( 1, parseInt(limit as string) || 10);

    const result = await repo.getProductCategoriesPaginated({
      page: pageNum,
      limit: limitNum,
      type: type as string,
    });

    return {
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: result.total,
        active: result.active,
        inactive: result.inactive,
        totalPages: Math.ceil(result.total / limitNum),
      },
    };
  }

  // Fallback for non-paginated calls to maintain backward compatibility
  const result = await repo.getProductCategoriesPaginated({
    page: 1,
    limit: 1000,
    type: type as string,
  });
  return result.rows;
}

export async function getProductCategoryByProdId(prodCategoryId: string) {
  if (!prodCategoryId?.trim()) {
    throw { status: 400, message: "Product category ID is required" };
  }
  const category = await repo.getProductCategoryByProdId(prodCategoryId.trim());
  if (!category) {
    throw { status: 404, message: "Product category not found" };
  }
  return category;
}

export async function getProductCategoryById(categoryId: string) {
  if (!categoryId?.trim()) {
    throw { status: 400, message: "Category ID is required" };
  }
  const id = parseInt(categoryId);
  if (isNaN(id)) {
    throw { status: 400, message: "Invalid category ID format" };
  }
  const category = await repo.getProductCategoryById(id);
  if (!category) {
    throw { status: 404, message: "Category not found" };
  }
  return category;
}

export async function updateProductCategory(categoryId: string, categoryData: any) {
  const id = parseInt(categoryId);
  if (isNaN(id)) {
    throw { status: 400, message: "Invalid category ID" };
  }

  const user = categoryData.lastModifiedBy || "SYSTEM_USER";

  const result = await repo.updateProductCategory(id, {
    categoryName: categoryData.categoryName,
    description: categoryData.description,
    status: categoryData.status,
    parentCategoryId: categoryData.parentCategoryId ? parseInt(categoryData.parentCategoryId) : 0,
    catType: categoryData.catType ? parseInt(categoryData.catType) : 0,
    lastModifiedBy: user
  });

  return {
    message: "Successfully updated product category!",
    categoryId: result.category_id,
    prodCategoryId: result.prod_category_id,
    categoryName: result.category_name
  };
}

export async function deleteProductCategory(categoryId: string) {
  const id = parseInt(categoryId);
  if (isNaN(id)) {
    throw { status: 400, message: "Invalid category ID" };
  }
  await repo.deleteProductCategory(id);
  return { message: "Successfully deleted product category!" };
}

export async function getItems(query: any) {
  const { search, category, status, page, limit } = query;

  if (page || limit) {
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.max(100, Math.max(1, parseInt(limit as string) || 10));

    return storage.getItemsPaginated({
      page: pageNum,
      limit: limitNum,
      search: search as string,
      category: category as string,
      status: status as string,
    });
  }

  if (search && typeof search === "string") {
    return storage.searchItems(search);
  } else if (category && typeof category === "string") {
    return storage.getItemsByCategory(category);
  }
  return storage.getItems();
}

export async function getItemCategoryStats(filters?: { search?: string; status?: string; category?: string }) {
  return storage.getItemCategoryStats(filters);
}

export async function getUncategorizedItemCount(filters?: { search?: string; status?: string; category?: string }): Promise<number> {
  return storage.getUncategorizedItemCount(filters);
}

export async function getItem(id: string) {
  return storage.getItem(id);
}

export async function getItemByCode(code: string) {
  return storage.getItemByCode(code);
}

export async function createItem(body: any) {
  if (!body.createdAt) {
    body.createdAt = new Date().toISOString();
  }
  const validatedData = insertItemSchema.parse(body);
  const item = await storage.getItemByCode(validatedData.itemCode);
  if(item){
    throw { status: 400, message: "SKU code already exists" };
  }
  return storage.createItem(validatedData);
}

export async function updateItem(id: string, body: any) {
  const updateSchema = insertItemSchema.partial();
  const validatedData = updateSchema.parse(body);
  return storage.updateItem(id, validatedData);
}

export async function deleteItem(id: string) {
  return storage.deleteItem(id);
}

export async function aiCategorize(batchSize: number) {
  const { productCategorizationService } = await import("../../services/product-categorization-service");
  const result = await productCategorizationService.categorizeProducts(batchSize);
  return {
    success: true,
    processed: result.processed,
    errors: result.errors,
    message: `Categorized ${result.processed} products with ${result.errors} errors`,
  };
}

export async function aiCategorizeAll() {
  const { productCategorizationService } = await import("../../services/product-categorization-service");
  const result = await productCategorizationService.categorizeAllProducts();
  return {
    success: true,
    total: result.total,
    processed: result.processed,
    errors: result.errors,
    message: `Categorized ${result.processed} products with ${result.errors} errors`,
  };
}

export async function aiGenerateSku(batchSize: number) {
  const { skuGenerationService } = await import("../../services/sku-generation-service");
  const result = await skuGenerationService.generateSKUs(batchSize);
  return {
    success: true,
    processed: result.processed,
    errors: result.errors,
    message: `Generated ${result.processed} SKUs with ${result.errors} errors`,
  };
}

export async function aiGenerateSkuAll() {
  const { skuGenerationService } = await import("../../services/sku-generation-service");
  const result = await skuGenerationService.generateAllSKUs();
  return {
    success: true,
    total: result.total,
    processed: result.processed,
    errors: result.errors,
    message: `Generated ${result.processed} SKUs with ${result.errors} errors`,
  };
}

export async function getMissingSkuCount(filters?: { search?: string; status?: string; category?: string }): Promise<number> {
  return storage.getMissingSkuCount(filters);
}

export async function getPoLinesForDN(poNumber: string) {
  return repo.getPoLinesForDN(poNumber);
}

export async function getDeliveryLinesByDeliveryId(deliveryId: number) {
  return repo.getDeliveryLinesByDeliveryId(deliveryId);
}

export async function createDeliveryNote(data: {
  asn_number: string;
  bill_of_landing?: string;
  carrier: string;
  ship_date: string;
  expected_arrival_date: string;
  ship_to: string;
  ship_from: string;
  po_number: string;
  supplier_id: number;
  created_by: string;
  site_id?: number;
}, lines: Array<{
  po_line_number: string;
  item_name: string;
  qty: number;
  uom: string;
  description?: string;
  po_number: string;
}>, user: any) {
  if (!data.asn_number) throw { status: 400, message: "ASN Number is required" };
  if (!data.carrier) throw { status: 400, message: "Carrier is required" };
  if (!data.ship_date) throw { status: 400, message: "Ship Date is required" };
  if (!data.expected_arrival_date) throw { status: 400, message: "Expected Arrival Date is required" };
  if (!data.ship_to) throw { status: 400, message: "Ship To Location is required" };
  if (!lines || lines.length === 0) throw { status: 400, message: "At least one line item is required" };

  for (const line of lines) {
    if (!line.qty || line.qty <= 0) {
      throw { status: 400, message: `Quantity must be greater than 0 for line ${line.po_line_number}` };
    }
  }

  const result = await repo.createDeliveryNote(data, lines);

  try {
    const po = await repo.getPoByNumber(data.po_number);
    if (po) {
      const { eventBus } = await import("../../services/eventBus");
      const { EventTypes } = await import("../../services/eventBus/events");
      const orgData = await adminRepo.getOrgDetails();
      eventBus.publish({
        eventType: EventTypes.SUPP_DELIVERY_NOTE_RAISED,
        timestamp: new Date(),
        requestorName: po.po_owner_name || po.po_buyer_name || "User",
        companyName: po.company_name || "Supplier",
        poNumber: data.po_number,
        deliveryNoteNumber: data.asn_number,
        deliveryNoteDescription: " ",
        expectedDeliveryDate: data.expected_arrival_date || "",
        date: data.ship_date,
        receiverEmail: po.owner_email ||po.buyer_email || "",
        domain: (po as any).domain || "",
        orgLogoPath: orgData.org_logo_path,
      });
    }
    if(result.id && !po.attribute_13 && user?.userRole === "ROLE_SUPERADMIN"){
      await updateSupplierPoStatus(data.po_number, "Accept", "PO accepted by SUPERADMIN", user);
    }
  } catch (err) {
    console.error("[createDeliveryNote] Notification error:", err);
  }

  return result;
}

export async function getPoLinesForReceipt(poNumber: string) {
  return repo.getPoLinesForReceipt(poNumber);
}

export async function createReceipt(data: {
  receipt_date: string;
  receipt_number: string;
  receipt_notes?: string;
  received_location: string;
  received_location_id?: string;
  po_number: string;
  supplier_name: string;
  created_by: string;
  created_by_name: string;
  requested_by?: string;
  org_id?: string;
  site_id?: string;
  currency_code?: string;
  wms_id?: string;
}, lines: Array<{
  po_line_number: string;
  item_name: string;
  received_qty: number;
  uom: string;
  unit_price: number;
  po_number: string;
  item_id?: string;
  item_type?: string;
  line_curr?: string;
  discount?: number;
  tax_rate_code?: string;
  attribute_12?: string;
  line_cost?: number;
  attribute_15?: string;
}>) {
  if (!data.receipt_number) throw { status: 400, message: "Receipt Number cannot be empty" };
  if (!data.receipt_date) throw { status: 400, message: "Receipt Date is required" };
  if (!data.received_location) throw { status: 400, message: "Received Location is required" };
  if (!lines || lines.length === 0) throw { status: 400, message: "At least one line item is required" };

  for (const line of lines) {
    if (!line.received_qty || line.received_qty <= 0) {
      throw { status: 400, message: `Received quantity must be greater than 0 for line ${line.po_line_number}` };
    }
  }

  const result = await repo.createReceipt(data, lines);

  try {
    const po = await repo.getPoByNumber(data.po_number);
    if (po) {
      const supplier = await repo.getSupplierBasicInfo(String(po.supplier_id));
      const { eventBus } = await import("../../services/eventBus");
      const { EventTypes } = await import("../../services/eventBus/events");
      const orgData = await adminRepo.getOrgDetails();
      eventBus.publish({
        eventType: EventTypes.REQUESTOR_RECEIPT_CONFIRMED,
        timestamp: new Date(),
        companyName: po.company_name || "Supplier",
        requestorName: data.created_by_name || data.created_by || "User",
        poNumber: data.po_number,
        deliveryNoteNumber: lines[0]?.attribute_12 || "",
        deliveryNoteDescription: data.receipt_notes || "",
        grnDate: data.receipt_date,
        receiptNumber: data.receipt_number,
        date: data.receipt_date,
        receiverEmail: supplier?.email_id || "",
        domain: (po as any).domain || "",
        orgLogoPath: orgData.org_logo_path,
      });
    }
  } catch (err) {
    console.error("[createReceipt] Notification error:", err);
  }

  return result;
}

export async function createPOFromPR(body: any, sessionUser: any) {
  const { prNumber, supplierId, deliveryLocationId, paymentTermsId, paymentTerms,
    advanceFlag, advancePercentage, selectedLines, budgetId } = body;

  if (!prNumber) throw { status: 400, message: "PR number is required" };
  if (!supplierId) throw { status: 400, message: "Supplier is required" };

  const prObj = await repo.getRequisitionByPrNumber(prNumber);
  if (!prObj) throw { status: 404, message: "Purchase Request not found" };

  let budgetName: string | null = prObj.budget_name || null;
  let budgetSegment: string | null = prObj.budget_segment ? String(prObj.budget_segment) : null;

  if (prObj.budgeted === false) {
    if (!budgetId) throw { status: 400, message: "Budget is required to create a PO from a non-budgeted PR" };
    const budget = await repo.getBudgetLineById(parseInt(budgetId));
    if (!budget) throw { status: 404, message: "Selected budget not found" };
    budgetName = `${budget.budget_name || ""} . ${budget.segment_dtl_name || ""}`;
    budgetSegment = String(budget.id);
  }

  const prLines = await repo.getRequisitionLines(prNumber);
  if (!prLines || prLines.length === 0) throw { status: 400, message: "PR has no line items" };

  // const selectedLines = prLineIds && prLineIds.length > 0
  //   ? prLines.filter((l: any) => prLineIds.includes(l.id) || prLineIds.includes(String(l.id)))
  //   : prLines;
  let prLineIds: string[] | null = null;
  if (selectedLines) {
    prLineIds = selectedLines.split("~");
  }
  if (prLineIds && prLineIds.length === 0) throw { status: 400, message: "No valid PR lines selected" };

  const linesSelected = prLineIds && prLineIds.length > 0
    ? prLines.filter((l: any) => prLineIds!.includes(l.id) || prLineIds!.includes(String(l.id)))
    : prLines;
  const suppInfo = await repo.getSupplierBasicInfo(String(supplierId));
  if (!suppInfo) throw { status: 404, message: "Supplier not found" };

  const poNumber = await repo.getPoPrefixAndIncrement();

  let locationName = "";
  let shipToAddress: string | null = null;
  let billToAddress: string | null = null;
  const locId = deliveryLocationId || prObj.delivertto_location_id;
  if (locId) {
    const locDetails = await repo.getLocationDetails(locId);
    if (locDetails) {
      locationName = locDetails.location_name || "";
      shipToAddress = locDetails.shipto_address || null;
      billToAddress = locDetails.billto_address || null;
    }
  }

  let requestorName = prObj.requestor_name || "";
  let requestorEmail: string | null = null;
  if (prObj.requestor_id) {
    const reqUser = await repo.getUserDetails(String(prObj.requestor_id));
    if (reqUser) {
      requestorName = reqUser.name || reqUser.user_name || requestorName;
      requestorEmail = reqUser.email_id || null;
    }
  }

  let orgId: number | null = null;
  if(prObj.org_id) {
    orgId = parseInt(prObj.org_id);
  }
  if (budgetSegment && orgId === null) {
    orgId = await repo.getBudgetOrgId(budgetSegment);
  }

  await repo.insertPurchaseOrderFromPR({
    poNumber,
    description: prObj.pr_description || `PO from ${prNumber}`,
    poType: "STANDARD",
    supplierId: suppInfo.id || supplierId,
    supplierName: suppInfo.supplier_name || null,
    buyerId: sessionUser?.id ? String(sessionUser.id) : null,
    buyerName: sessionUser?.name || sessionUser?.userName || null,
    buyerEmail: sessionUser?.email || null,
    requestorId: prObj.requestor_id ? String(prObj.requestor_id) : null,
    requestorName,
    requestorEmail,
    departmentName: prObj.department_name || "",
    currency: prObj.currency || "AED",
    deliveryLocation: locId || null,
    locationName,
    shipToAddress,
    billToAddress,
    requiredDate: prObj.delivery_date || null,
    budgetName,
    budgetSegment,
    orgId,
    paymentTermsId: paymentTermsId || null,
    paymentTermsName: paymentTerms || null,
    advanceFlag: advanceFlag || "N",
    advancePercentage: advancePercentage ? parseFloat(advancePercentage) : null,
    prNumber,
    createdBy: prObj.pr_owner_name || "system",
  });

  let poNetCost = 0;
  let poTaxTotal = 0;
  let poTotalCost = 0;

  for (let i = 0; i < linesSelected.length; i++) {
    const prLine = linesSelected[i];
    const lineId = await repo.getNextPoLineId();
    const qty = parseFloat(prLine.qty) || 0;
    const unitCost = parseFloat(prLine.unit_cost) || 0;
    const lineCost = qty * unitCost;

    let taxRate = 0;
    let taxRateCode: string | null = null;
    let taxableFlag = "N";
    let taxAmount = 0;

    // if (prLine.item_id) {
    //   const taxInfo = await repo.getItemTaxInfo(String(prLine.item_id));
    //   if (taxInfo && taxInfo.tax_code) {
    //     taxableFlag = "Y";
    //     taxRate = parseFloat(taxInfo.tax_rate) || 0;
    //     taxRateCode = taxInfo.tax_code;
    //     if (taxRate > 0) {
    //       taxAmount = lineCost * (taxRate / 100);
    //     }
    //   }
    // }

    await repo.insertPoLineFromPR({
      id: lineId,
      poNumber,
      lineNumber: String(i + 1),
      description: prLine.item_description || "",
      quantity: qty,
      unitPrice: unitCost,
      uom: prLine.uom || "Each",
      currency: prLine.curr_code || prObj.currency || "AED",
      taxRate,
      taxRateCode,
      taxableFlag,
      taxAmount,
      lineCost,
      itemId: prLine.item_id ? String(prLine.item_id) : null,
      itemName: prLine.item_description || null,
      categoryCode: prLine.product_category || null,
      categoryName: prLine.product_category_name || null,
    });

    poNetCost += lineCost;
    poTaxTotal += taxAmount;
    poTotalCost += lineCost + taxAmount;

    await repo.updatePrLinePoNumber(prLine.id, poNumber);
  }

  await repo.updatePoTotals(poNumber, poNetCost, poTaxTotal, poTotalCost);

  await repo.updatePrPoNumber(prNumber, poNumber);

   const allDone = await repo.checkAllPrLinesHavePo(prNumber);
   if(allDone){
    getPool().query(
      `UPDATE dbo.supp_pr_header_dtls SET all_lines_have_po = true WHERE pr_number = $1`, [prNumber]
    );
   }else{
    getPool().query(
      `UPDATE dbo.supp_pr_header_dtls SET all_lines_have_po = false WHERE pr_number = $1`, [prNumber]
    );
   }
  // if (allDone) {
  //   await repo.updatePrStatus(prNumber, "Complete");
  // }

  return { poNumber, message: "PO created from PR successfully" };
}

export async function getContractDetailsForPO(contractId: string) {
  const header = await repo.getContractHeaderById(contractId);
  if (!header) throw { status: 404, message: "Contract not found" };
  const lines = await repo.getContractSowLines(contractId);
  const vendor = await repo.getContractVendor(contractId);
  return { header, lines, vendor };
}

export async function createPOFromContract(body: any, sessionUser: any) {
  const { contractId, supplierId, paymentTermsId, paymentTerms, advanceFlag, advancePercentage, selectedLines, budgetId } = body;

  if (!contractId) throw { status: 400, message: "Contract is required" };
  if (!supplierId) throw { status: 400, message: "Supplier is required" };

  const contractObj = await repo.getContractHeaderById(contractId);
  if (!contractObj) throw { status: 404, message: "Contract not found" };
  if (contractObj.status !== "Approved") throw { status: 400, message: "PO can only be created from a fully approved contract" };

  const contractLines = await repo.getContractSowLines(contractId);
  if (!contractLines || contractLines.length === 0) throw { status: 400, message: "Contract has no Scope of Work lines" };

  let lineIds: string[] | null = null;
  if (selectedLines) lineIds = String(selectedLines).split("~");
  if (lineIds && lineIds.length === 0) throw { status: 400, message: "No valid contract lines selected" };

  const linesSelected = (lineIds && lineIds.length > 0
    ? contractLines.filter((l: any) => lineIds!.includes(String(l.id)))
    : contractLines
  ).filter((l: any) => !l.po_number);
  if (!linesSelected.length) throw { status: 400, message: "Please select at least one contract line that doesn't already have a PO" };

  const suppInfo = await repo.getSupplierBasicInfo(String(supplierId));
  if (!suppInfo) throw { status: 404, message: "Supplier not found" };

  let budgetName: string | null = null;
  let budgetSegment: string | null = null;
  if (budgetId) {
    const budget = await repo.getBudgetLineById(parseInt(budgetId));
    if (!budget) throw { status: 404, message: "Selected budget not found" };
    budgetName = `${budget.budget_name || ""} . ${budget.segment_dtl_name || ""}`;
    budgetSegment = String(budget.id);
  }

  const poNumber = await repo.getPoPrefixAndIncrement();
  const contractRefNo = contractObj.contr_ref_no || String(contractObj.id);

  let requestorId: string | null = contractObj.requestor ? String(contractObj.requestor) : null;
  let requestorName: string = contractObj.requestor_name || "";
  let requestorEmail: string | null = null;
  if (requestorId) {
    const rObj = await repo.getUserDetails(requestorId);
    if (rObj) {
      requestorName = rObj.name || rObj.user_name || requestorName;
      requestorEmail = rObj.email_id || null;
    }
  }
  if (!requestorName) {
    // Contract has no requestor set — fall back to the buyer creating the PO
    requestorId = sessionUser?.id ? String(sessionUser.id) : null;
    requestorName = sessionUser?.name || sessionUser?.userName || "";
    requestorEmail = sessionUser?.email || null;
  }

  await repo.insertPurchaseOrderFromContract({
    poNumber,
    description: contractObj.title || contractObj.description || `PO from Contract ${contractRefNo}`,
    poType: "STANDARD",
    supplierId: suppInfo.id || supplierId,
    supplierName: suppInfo.supplier_name || null,
    buyerId: sessionUser?.id ? String(sessionUser.id) : null,
    buyerName: sessionUser?.name || sessionUser?.userName || null,
    buyerEmail: sessionUser?.email || null,
    requestorId,
    requestorName,
    requestorEmail,
    budgetName,
    budgetSegment,
    departmentName: contractObj.department_name || "",
    currency: contractObj.currency || "AED",
    requiredDate: contractObj.end_date || null,
    orgId: sessionUser?.orgId ? parseInt(sessionUser.orgId) : null,
    paymentTermsId: paymentTermsId || null,
    paymentTermsName: paymentTerms || null,
    advanceFlag: advanceFlag || "N",
    advancePercentage: advancePercentage ? parseFloat(advancePercentage) : null,
    contractRefNo,
    createdBy: sessionUser?.name || sessionUser?.userName || "system",
  });

  let poNetCost = 0;
  let poTaxTotal = 0;
  let poTotalCost = 0;

  for (let i = 0; i < linesSelected.length; i++) {
    const line = linesSelected[i];
    const lineId = await repo.getNextPoLineId();
    const qty = parseFloat(line.quantity) || 0;
    const unitCost = parseFloat(line.unit_cost) || 0;
    const lineCost = qty * unitCost;

    await repo.insertPoLineFromPR({
      id: lineId,
      poNumber,
      lineNumber: String(i + 1),
      description: line.description || line.item_name || "",
      quantity: qty,
      unitPrice: unitCost,
      uom: line.uom || "Each",
      currency: contractObj.currency || "AED",
      taxRate: 0,
      taxRateCode: null,
      taxableFlag: "N",
      taxAmount: 0,
      lineCost,
      itemId: line.item_id ? String(line.item_id) : null,
      itemName: line.item_name || null,
      categoryCode: line.category_code || null,
      categoryName: line.category_name || null,
    });

    await repo.updateSowLinePoNumber(line.id, poNumber);

    poNetCost += lineCost;
    poTotalCost += lineCost;
  }

  await repo.updatePoTotals(poNumber, poNetCost, poTaxTotal, poTotalCost);

  return { poNumber, message: "PO created from Contract successfully" };
}

export async function createPOFromBidAward(body: any, sessionUser: any) {
  const awardNumber = body?.awardNumber ? parseInt(body.awardNumber) : null;
  if (!awardNumber || isNaN(awardNumber)) throw { status: 400, message: "Valid Award Number is required" };

  const awardDescription = body?.awardDescription || "";
  const deliverToLocationId = body?.deliverToLocationId || null;
  const departmentName = body?.departmentName || "";
  const budgetSegment = body?.budgetSegment || null;
  const budgetName = body?.budgetName || null;
  const deliveryDate = body?.deliveryDate || null;
  const requestorId = body?.requestorId || null;
  const supplierId = body?.supplierId ? parseInt(body.supplierId) : null;
  const awardCurrency = body?.awardCurrency || "AED";
  const termsId = body?.termsId || null;
  let paymentTermsName = body?.paymentTerms || null;
  const advanceFlag = body?.advanceFlag || "N";
  const advancePercentage = body?.advancePercentage ? parseFloat(body.advancePercentage) : null;
  const awardLinesStr = body?.awardLinesStr || "";


  if (!supplierId) throw { status: 400, message: "Supplier ID is required" };

  if(termsId){
    const termsResult = await getPool().query(
      `SELECT id, terms_name FROM dbo.am_payment_terms_mst WHERE id = $1`, [termsId]
    );
    const terms = termsResult.rows[0];
    if (!terms) throw { status: 404, message: "Payment terms not found" };
    paymentTermsName = terms.terms_name;
  }

  const awardResult = await getPool().query(
    `SELECT id, supplier_id, supplier_name, grosstotal, bidtotal, status, bid_resp_no, bidrefno, attribute_10, attribute_11, tax_included
     FROM dbo.supp_bid_award_dtls WHERE id = $1`, [awardNumber]
  );
  const bidAwardDtl = awardResult.rows[0];
  if (!bidAwardDtl) throw { status: 404, message: "Award not found" };

  let linkedPrNumber = body?.prNumber ? String(body.prNumber).trim() : "";
  if (!linkedPrNumber && bidAwardDtl.bidrefno) {
    const bidRow = await getPool().query(
      `SELECT pr_number FROM dbo.supp_bid_dtls WHERE id = $1`,
      [bidAwardDtl.bidrefno],
    );
    const prFromBid = bidRow.rows[0]?.pr_number;
    if (prFromBid && String(prFromBid).trim() !== "") {
      linkedPrNumber = String(prFromBid).trim();
    }
  }

  let locationName = "";
  let shipToAddress: string | null = null;
  let billToAddress: string | null = null;
  if (deliverToLocationId) {
    try {
      const locDetails = await repo.getLocationDetails(deliverToLocationId);
      if (locDetails) {
        locationName = locDetails.location_name || "";
        shipToAddress = locDetails.shipto_address || null;
        billToAddress = locDetails.billto_address || null;
      } else {
        throw { status: 400, message: "Error - Unable to process due to delivery location data not available" };
      }
    } catch (e: any) {
      if (e.status) throw e;
      throw { status: 400, message: "Error - Unable to process due to delivery location data not available" };
    }
  }

  let requiredDate: string | null = null;
  if (deliveryDate) {
    try {
      const d = new Date(deliveryDate);
      if (!isNaN(d.getTime())) requiredDate = d.toISOString();
    } catch {}
  }

  let orgId: number | null = null;
  if (budgetSegment) {
    orgId = await repo.getBudgetOrgId(String(budgetSegment));
  }
 

  let requestorName = "";
  let requestorEmail: string | null = null;
  if (requestorId) {
    const rObj = await repo.getUserDetails(String(requestorId));
    if (rObj) {
      requestorName = rObj.name || rObj.user_name || "";
      requestorEmail = rObj.email_id || null;
    }
  }

  const suppInfo = await repo.getSupplierBasicInfo(String(supplierId));
  if (!suppInfo) throw { status: 404, message: "Supplier not found" };

  const prefix = await repo.getPoPrefixAndIncrement();
  if (!prefix) throw { status: 400, message: "Error: PrefixValue not for the 'Purchase Order'" };
  const poNumber = prefix;

  await repo.insertPurchaseOrderFromPR({
    poNumber,
    description: awardDescription,
    poType: "STANDARD",
    supplierId: suppInfo.id || supplierId,
    supplierName: suppInfo.supplier_name || suppInfo.company_name || null,
    buyerId: sessionUser?.id ? String(sessionUser.id) : null,
    buyerName: sessionUser?.name || sessionUser?.userName || null,
    buyerEmail: sessionUser?.email || null,
    requestorId: requestorId ? String(requestorId) : null,
    requestorName,
    requestorEmail,
    departmentName,
    currency: awardCurrency,
    deliveryLocation: deliverToLocationId,
    locationName,
    shipToAddress,
    billToAddress,
    requiredDate,
    budgetName: budgetName || null,
    budgetSegment: budgetSegment ? String(budgetSegment) : null,
    orgId,
    paymentTermsId: termsId || null,
    paymentTermsName: paymentTermsName || null,
    advanceFlag,
    advancePercentage: advancePercentage || null,
    prNumber: linkedPrNumber,
    createdBy: requestorName || "system",
    taxIncluded: bidAwardDtl.tax_included || null,
  });

  const bidRow = await getPool().query("select * from dbo.supp_bid_dtls where id = $1", [bidAwardDtl.bidrefno]);
  const bid = bidRow.rows[0];

  const bidId = bid?.attribute_4 ? String(bid.attribute_4) : null;

  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls SET bid_award_id = $1, attribute_6 = $2, attribute_5 = $3, attribute_7 = $4 WHERE po_number = $5`,
    [String(awardNumber),  String(bidAwardDtl.bidrefno), String(bidId), poNumber, poNumber]
  );

  if (linkedPrNumber) {
    await repo.updatePrPoNumber(linkedPrNumber, poNumber);
  }

  let bidAwardLines: any[] = [];
  if (awardLinesStr) {
    const lineIds = awardLinesStr.split("~").filter((id: string) => id && id.trim() !== "");
    for (const lid of lineIds) {
      const lineResult = await getPool().query(
        `SELECT id, bid_line_id, description, currency, uom, quantity, bidprice, discprice,
                product_category, item_id, tax_code, awarded_quantity, attribute_5, rate
         FROM dbo.supp_bid_award_line_dtls WHERE bid_award_id = $1 AND bid_line_id = $2`, [awardNumber, parseInt(lid)]
      );
      if (lineResult.rows[0]) bidAwardLines.push(lineResult.rows[0]);
    }
  } else {
    const allLinesResult = await getPool().query(
      `SELECT id, bid_line_id, description, currency, uom, quantity, bidprice, discprice,
              product_category, item_id, tax_code, awarded_quantity, attribute_5, rate
       FROM dbo.supp_bid_award_line_dtls WHERE bid_award_id = $1 ORDER BY id`, [awardNumber]
    );
    bidAwardLines = allLinesResult.rows;
  }

  if (!bidAwardLines || bidAwardLines.length === 0) throw { status: 400, message: "Award has no line items" };

  let poNetCost = 0;
  let poTaxTotal = 0;
  let poTotalCost = 0;

  for (let i = 0; i < bidAwardLines.length; i++) {
    const aLine = bidAwardLines[i] as any;
    const taxRate = parseFloat(aLine.rate) || 0;
    const lineId = await repo.getNextPoLineId();
    const qty = parseFloat(aLine.awarded_quantity) || parseFloat(aLine.quantity) || 0;
    const unitPrice = parseFloat(aLine.bidprice) || 0;
    const discount = parseFloat(aLine.discprice) || 0;

    const qtyTotal = qty * unitPrice;
    const discTotal = qty * discount;
    const lineCost = qtyTotal - discTotal;

    let taxRateCode: string | null = aLine.tax_code ? String(aLine.tax_code) : null;
    let taxableFlag = "N";
    let taxAmount = 0;

    if (taxRate > 0 && bidAwardDtl.tax_included === "Yes") {
      taxAmount = (
        Math.round(
          lineCost/ 
          (1 - (Number(taxRate) || 0) / 100)
        ) * (Number(taxRate) || 0)
      ) / 100;
      taxableFlag = "Y";
    }else if (taxRate > 0 && bidAwardDtl.tax_included === "No") {
      taxAmount = lineCost * (taxRate / 100);
      taxableFlag = "Y";
    }

    // const itemIdVal = aLine.item_id ? String(aLine.item_id) : "0";
    // if (itemIdVal && itemIdVal !== "0") {
    //   try {
    //     const catItemResult = await getPool().query(
    //       `SELECT tax_rate, tax_code FROM dbo.pm_product_master WHERE id = $1`, [String(itemIdVal)]
    //     );
    //     const cItem = catItemResult.rows[0];
    //     if (cItem && cItem.tax_code) {
    //       taxableFlag = "Y";
    //       taxRate = parseFloat(cItem.tax_rate) || 0;
    //       taxRateCode = cItem.tax_code;
    //       if (taxRate > 0) {
    //         taxAmount = lineCost * (taxRate / 100);
    //       }
    //     }
    //   } catch {}
    // }
    const bidLine = await bidRepo.getDboBidLine(parseInt(aLine.bid_line_id));

    const poLineNumber = String(i + 1);

    await repo.insertPoLineFromPR({
      id: lineId,
      poNumber,
      lineNumber: poLineNumber,
      description: aLine.description || "",
      quantity: qty,
      unitPrice,
      uom: aLine.uom || "Each",
      currency: aLine.currency || awardCurrency,
      taxRate,
      taxRateCode,
      taxableFlag,
      taxAmount,
      lineCost,
      itemId: aLine.item_id ? String(aLine.item_id) : null,
      itemName: aLine.description || null,
      categoryCode: bidLine?.product_category_id ? String(bidLine.product_category_id) : "",
      categoryName: aLine.product_category || null,
    });

    await getPool().query(
      `UPDATE dbo.supp_po_line_dtls SET discount = $1, attribute_15 = $2 WHERE id = $3`,
      [discount, String(aLine.bid_line_id || ""), lineId]
    );

    poNetCost += lineCost;
    poTaxTotal += taxAmount;
    poTotalCost += lineCost + taxAmount;

    await repo.updatePoTotals(poNumber, poNetCost, poTaxTotal, poTotalCost);

    await getPool().query(
      `UPDATE dbo.supp_bid_award_line_dtls SET attribute_11 = $1 WHERE id = $2`,
      [poNumber, aLine.id]
    );
  }

  const refreshedAward = await getPool().query(
    `SELECT id, attribute_11 FROM dbo.supp_bid_award_dtls WHERE id = $1`, [awardNumber]
  );
  const currentAward = refreshedAward.rows[0];
  let awardPoNumbers = poNumber;
  if (currentAward?.attribute_11) {
    awardPoNumbers = currentAward.attribute_11 + " ," + poNumber;
  }

  const allAwardLinesResult = await getPool().query(
    `SELECT id, attribute_11 FROM dbo.supp_bid_award_line_dtls WHERE bid_award_id = $1`, [awardNumber]
  );
  const allLinesHavePo = allAwardLinesResult.rows.every((l: any) => l.attribute_11 != null && l.attribute_11 !== "");

  await getPool().query(
    `UPDATE dbo.supp_bid_award_dtls SET attribute_11 = $1, last_updated_date = NOW() WHERE id = $2`,
    [awardPoNumbers, awardNumber]
  );

  return { poNumber, allLinesHavePo, message: `PO ${poNumber} created from Bid Award successfully` };
}

export async function getApprovedPRsForPO() {
  const result = await repo.getRequisitions({ status: "Approved", page: 1, limit: 500 });
  return result.rows.filter((pr: any) => !pr.po_number || pr.po_number.trim() === "");
}

export async function getPRDetailsForPO(prNumber: string) {
  const header = await repo.getRequisitionByPrNumber(prNumber);
  if (!header) throw { status: 404, message: "PR not found" };
  const lines = await repo.getRequisitionLines(prNumber);
  return { header, lines };
}

/**
 * Legacy Spring POST /updatePOSuppStatus — supplier updates PO acknowledgement (Reject → Cancelled, etc.),
 * reverts bid response remaining qty when linked to a real bid award, clears PR PO refs, optional auction hook.
 */
export async function updateSupplierPoStatus(
  poNumber: string,
  statusRaw: string,
  comments: string,
  reqUser: any,
): Promise<string> {
  try {
    const po = await repo.getPoByNumber(poNumber);
    if (!po) return "Error occured while processing your request!";

    if ((reqUser?.supplierId != null && Number((po as any).supplier_id) !== Number(reqUser.supplierId)) && (reqUser?.userRole !== "ROLE_SUPERADMIN")) {
      return "Error occured while processing your request!";
    }

    const statusNormalized = (statusRaw || "").trim();
    const statusLower = statusNormalized.toLowerCase();
    const storedStatus =
      statusLower === "reject" ? "Cancelled" : statusNormalized;

    if (statusLower === "accept") {
      await getPool().query(
        `UPDATE dbo.supp_po_header_dtls SET attribute_13 = 'Accept', attribute_14 = $1, last_modified_date = NOW() WHERE po_number = $2`,
        [comments || "", poNumber],
      );
      // Trigger SUPP_PO_ACK
      const { eventBus } = await import("../../services/eventBus");
      const { EventTypes } = await import("../../services/eventBus/events");
      const orgData = await adminRepo.getOrgDetails();
      eventBus.publish({
        eventType: EventTypes.SUPP_PO_ACK,
        timestamp: new Date(),
        supplierName: po.company_name || "Supplier",
        poNumber: poNumber,
        poDescription: po.po_description || "PO",
        ackDate: new Date().toLocaleDateString(),
        user: reqUser.name || reqUser.userName || "Supplier User",
        reviewer: po.buyer_name || po.po_owner_name || "Buyer",
        receiverEmail: po.buyer_email || po.po_owner_email || "",
        domain: (reqUser as any)?.domain,
        orgLogoPath: orgData.org_logo_path,
      });
    } else if (statusLower === "reject") {
      try {
        if(po.pr_number !== null && po.bid_award_id === null){
          await revisePrBudgetAfterPoStatusChange(po, poNumber, reqUser?.userName || reqUser?.name);
        }else if(po.bid_award_id !== null){
          // No Condition needed as Awarded amount and PO raised amount will be same 
        }else {
          await releaseDirectPoBudgetReservation(po, poNumber, reqUser?.userName || reqUser?.name);
        }
      } catch (budgetEx: any) {
        console.error("[updateSupplierPoStatus] Budget release error:", budgetEx?.message);
      }
      await getPool().query(
        `UPDATE dbo.supp_po_header_dtls SET attribute_13 = 'Reject', po_status = 'Cancelled', attribute_5 = $1, attribute_14 = $1, last_modified_date = NOW() WHERE po_number = $2`,
        [comments || "", poNumber],
      );
      await repo.updatePoLinesStatus(poNumber, "Cancelled");

      if(po.pr_number !== null && po.bid_award_id === null){
        const prNumber = po.pr_number;
        const result = await getPool().query(`select attribute_11, pr_amount from dbo.supp_pr_header_dtls where pr_number = $1`, [prNumber]);
        const reservedPRAmount = result.rows[0]?.attribute_11 ? Number(result.rows[0]?.attribute_11) : 0;
        const prAmount = result.rows[0]?.pr_amount ? Number(result.rows[0]?.pr_amount) : 0;
        let remainingPRAmount = reservedPRAmount;
        if((po.po_status === "Approved" || po.po_status === "approved") && reservedPRAmount < prAmount){
          remainingPRAmount = reservedPRAmount + Number(po.po_total_cost);
        }
        await getPool().query(`update dbo.supp_pr_header_dtls set bidno = null, attribute_7 = null, po_number = NULLIF(
      array_to_string(
        array_remove(
          string_to_array(po_number, ','),
          $1
        ),
        ','
      ),
      ''), pr_status = 'Approved', all_lines_have_po = false, attribute_11 = $2 where pr_number = $3`, [poNumber, remainingPRAmount, prNumber]);
        await getPool().query("update dbo.supp_pr_line_dtls set po_number = null where po_number = $1", [poNumber]);
      }else if(po.bid_award_id !== null){
        const result = await getPool().query(`select attribute_10 from dbo.supp_bid_award_dtls where id = $1`, [po.bid_award_id]);
        const reservedPRAmount = result.rows[0]?.attribute_10 ? Number(result.rows[0]?.attribute_10) : 0;
        const prAmount = result.rows[0]?.pr_amount ? Number(result.rows[0]?.pr_amount) : 0;
        let remainingPRAmount = reservedPRAmount;
        if((po.po_status === "Approved" || po.po_status === "approved") && reservedPRAmount < prAmount){
          remainingPRAmount = reservedPRAmount + Number(po.po_total_cost);
        }
        await getPool().query(`update dbo.supp_pr_header_dtls set po_number = NULLIF(
          array_to_string(
            array_remove(
              string_to_array(po_number, ','),
              $1
            ),
            ','
          ),
          '') where pr_number = $2`, [poNumber, po.pr_number]);
        await getPool().query(`update dbo.supp_bid_award_dtls set attribute_11 = NULLIF(
          array_to_string(
            array_remove(
              string_to_array(attribute_11, ','),
              $1
            ),
            ','
          ),
          ''), attribute_10 = $2 where id = $3`, [poNumber, remainingPRAmount, po.bid_award_id]);
        await getPool().query("update dbo.supp_bid_award_line_dtls set attribute_11 = null where attribute_11 = $1", [poNumber]);
       }

      // Trigger SUPP_PO_REJECTED
      const { eventBus } = await import("../../services/eventBus");
      const { EventTypes } = await import("../../services/eventBus/events");
      const orgData = await adminRepo.getOrgDetails();
      eventBus.publish({
        eventType: EventTypes.SUPP_PO_REJECTED,
        timestamp: new Date(),
        companyName: po.company_name || "Supplier",
        user: reqUser.name || reqUser.userName || "Supplier User",
        reviewer: po.buyer_name || po.po_owner_name || "Buyer",
        receiverEmail: po.buyer_email || po.po_owner_email || "",
        poNumber: poNumber,
        poDescription: po.po_description || "PO",
        rejectedDate: new Date().toLocaleDateString(),
        rejectionReason: comments || "No reason provided",
        domain: (reqUser as any)?.domain,
        orgLogoPath: orgData.org_logo_path,
      });
    } else {
      if (storedStatus.toLowerCase() === "cancelled") {
        try {
          if(po.pr_number !== null && po.bid_award_id === null){
            await revisePrBudgetAfterPoStatusChange(po, poNumber, reqUser?.userName || reqUser?.name);
          }else if(po.bid_award_id !== null){
            // No Condition needed as Awarded amount and PO raised amount will be same 
          }else {
            await releaseDirectPoBudgetReservation(po, poNumber, reqUser?.userName || reqUser?.name);
          }
        } catch (budgetEx: any) {
          console.error("[updateSupplierPoStatus] Budget release error:", budgetEx?.message);
        }
        await repo.updatePoLinesStatus(poNumber, "Cancelled");
      }
      await getPool().query(
        `UPDATE dbo.supp_po_header_dtls SET po_status = $1, attribute_5 = $2, last_modified_date = NOW() WHERE po_number = $3`,
        [storedStatus, comments || "", poNumber],
      );
      if(po.pr_number !== null && po.bid_award_id === null){
        const prNumber = po.pr_number;
        const result = await getPool().query(`select attribute_11, pr_amount from dbo.supp_pr_header_dtls where pr_number = $1`, [prNumber]);
        const reservedPRAmount = result.rows[0]?.attribute_11 ? Number(result.rows[0]?.attribute_11) : 0;
        const prAmount = result.rows[0]?.pr_amount ? Number(result.rows[0]?.pr_amount) : 0;
        let remainingPRAmount = reservedPRAmount;
        if((po.po_status === "Approved" || po.po_status === "approved") && reservedPRAmount < prAmount){
          remainingPRAmount = reservedPRAmount + Number(po.po_total_cost);
        }
        await getPool().query(`update dbo.supp_pr_header_dtls set bidno = null, attribute_7 = null, po_number = NULLIF(
      array_to_string(
        array_remove(
          string_to_array(po_number, ','),
          $1
        ),
        ','
      ),
      ''), pr_status = 'Approved', all_lines_have_po = false, attribute_11 = $2 where pr_number = $3`, [poNumber, remainingPRAmount, prNumber]);
        await getPool().query("update dbo.supp_pr_line_dtls set po_number = null where po_number = $1", [poNumber]);
      }else if(po.bid_award_id !== null){
        const result = await getPool().query(`select attribute_10 from dbo.supp_bid_award_dtls where id = $1`, [po.bid_award_id]);
        const reservedPRAmount = result.rows[0]?.attribute_10 ? Number(result.rows[0]?.attribute_10) : 0;
        const prAmount = result.rows[0]?.pr_amount ? Number(result.rows[0]?.pr_amount) : 0;
        let remainingPRAmount = reservedPRAmount;
        if((po.po_status === "Approved" || po.po_status === "approved") && reservedPRAmount < prAmount){
          remainingPRAmount = reservedPRAmount + Number(po.po_total_cost);
        }
        await getPool().query(`update dbo.supp_pr_header_dtls set po_number = NULLIF(
          array_to_string(
            array_remove(
              string_to_array(po_number, ','),
              $1
            ),
            ','
          ),
          '') where pr_number = $2`, [poNumber, po.pr_number]);
        await getPool().query(`update dbo.supp_bid_award_dtls set attribute_11 = NULLIF(
          array_to_string(
            array_remove(
              string_to_array(attribute_11, ','),
              $1
            ),
            ','
          ),
          ''), attribute_10 = $2 where id = $3`, [poNumber, remainingPRAmount, po.bid_award_id]);
        await getPool().query("update dbo.supp_bid_award_line_dtls set attribute_11 = null where attribute_11 = $1", [poNumber]);
       }
    }

    const bidAwardIdRaw = (po as any).bid_award_id;
    let awardRow: { id: number; bid_resp_no: number } | null = null;
    if (bidAwardIdRaw != null && String(bidAwardIdRaw).trim() !== "") {
      const n = parseInt(String(bidAwardIdRaw), 10);
      if (!Number.isNaN(n)) {
        const r = await getPool().query(
          `SELECT id, bid_resp_no FROM dbo.supp_bid_award_dtls WHERE id = $1`,
          [n],
        );
        awardRow = r.rows[0] || null;
      }
    }

    const isReject = statusNormalized.toLowerCase() === "reject";
    const prNum = (po as any).pr_number != null ? String((po as any).pr_number).trim() : "";
    const poAttr15 = (po as any).attribute_15 != null ? String((po as any).attribute_15).trim() : "";

    if (awardRow && isReject) {
      const lines = await repo.getPoLines(poNumber);
      for (const line of lines) {
        const lineQty = parseFloat(String((line as any).line_qty ?? 0)) || 0;
        const poLineNumStr = String((line as any).po_line_number ?? "").trim();
        const attr15 = (line as any).attribute_15 != null ? String((line as any).attribute_15).trim() : "";

        const primaryId = parseInt(poLineNumStr, 10);
        if (!Number.isFinite(primaryId)) continue;

        const getRem = (bidLineId: number) =>
          bidRepo.getBidResponseLineRemainingForAward(awardRow!.id, bidLineId);

        let finalRemainQty = lineQty;
        const remainingQty = await getRem(primaryId);
        if (remainingQty == null) {
          finalRemainQty = lineQty;
        } else if (attr15 !== "") {
          const altId = parseInt(attr15, 10);
          if (!Number.isFinite(altId)) {
            finalRemainQty = lineQty;
          } else {
            const rem2 = await getRem(altId);
            if (rem2 == null) finalRemainQty = lineQty;
            else finalRemainQty = lineQty + rem2;
          }
        } else {
          finalRemainQty = lineQty + remainingQty;
        }

        await bidRepo.setBidResponseLineRemainingForAward(awardRow.id, primaryId, finalRemainQty);
      }

      const auditKey =
        (po as any).attribute_6 != null && String((po as any).attribute_6).trim() !== ""
          ? String((po as any).attribute_6)
          : poNumber;
      void logAudit({
        auditKey,
        auditAction: statusRaw,
        auditMessage: "PO Rejected and awarded quantity reverted",
        fullName: reqUser?.name || "System",
        userId: reqUser?.id || "system",
        module: "BIDS",
      });
    }else if (poAttr15 && isReject) {
      const auctionAwardId = parseInt(poAttr15, 10);
      if (!Number.isNaN(auctionAwardId)) {
        await getPool().query(
          `SELECT id, auction_id FROM dbo.au_auction_supp_award_event WHERE id = $1`,
          [auctionAwardId],
        );
      }
    }

    return "Request processd successfully";
  } catch (e) {
    console.error("[updateSupplierPoStatus]", e);
    return "Error occured while processing your request!";
  }
}

export async function getProdCategoriesByParentCategoryId(parentId: number) {
  return await repo.getProdCategoriesByParentCategoryId(parentId);
}

// --- PR Lines Bulk Import ---

export async function downloadPRLinesTemplate(_prNumber: string): Promise<Buffer> {
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;

  const [uomResult, itemResult] = await Promise.all([
    getPool().query(`SELECT description FROM dbo.am_lookup_params_dtls WHERE UPPER(key_1) = 'UOM' AND status = 'Y' ORDER BY key_2`),
    getPool().query(`SELECT TRIM(product_name) AS product_name FROM dbo.pm_product_master WHERE product_name IS NOT NULL AND TRIM(product_name) != '' ORDER BY product_name`),
  ]);
  const uoms: string[]  = uomResult.rows.map((r: any) => String(r.description).trim()).filter(Boolean);
  const items: string[] = itemResult.rows.map((r: any) => String(r.product_name).trim()).filter(Boolean);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Line Items');

  const headers = ['Item *', 'Quantity *', 'Unit Price *', 'Unit of Measure'];
  ws.columns = headers.map((h: string, i: number) => ({ header: h, key: String.fromCharCode(65 + i), width: [30, 12, 12, 10][i] }));

  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    cell.border = { bottom: { style: 'thin' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 20;

  ws.addRow([items[0] || 'Sample Item', 1, 100.00, uoms[0] || 'Each']);

  const refSheet = wb.addWorksheet('Reference Data');
  refSheet.state = 'hidden';
  const maxLen = Math.max(uoms.length, items.length, 1);
  refSheet.addRow(['Unit of Measure', 'Item']);
  for (let i = 0; i < maxLen; i++) {
    refSheet.addRow([
      i < uoms.length  ? uoms[i]  : '',
      i < items.length ? items[i] : '',
    ]);
  }

  const DATA_ROWS = 1000;
  const dv = (ws as any).dataValidations;

  if (items.length > 0) {
    dv.add(`A2:A${DATA_ROWS}`, {
      type: 'list', allowBlank: false,
      formulae: [`'Reference Data'!$B$2:$B$${items.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Invalid Item', error: 'Please select a valid item from the dropdown.',
    });
  }
  if (uoms.length > 0) {
    dv.add(`D2:D${DATA_ROWS}`, {
      type: 'list', allowBlank: true,
      formulae: [`'Reference Data'!$A$2:$A$${uoms.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Invalid UOM', error: 'Please select a valid UOM from the dropdown.',
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function validateBulkPRLinesImport(prNumber: string, file: Express.Multer.File): Promise<{
  total: number; valid: number; invalid: number;
  results: { rowNumber: number; description: string; quantity: number; unitPrice: number; valid: boolean; errors: string[] }[];
}> {
  const check = await repo.getPrStatusAndCurrency(prNumber);
  validationHelper.validateIsEditable(check, check.pr_status, 'Requisition');

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

  const normHdr = (v: any) => String(v ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[\s_\-*]+/g, ' ').trim();
  const hdr = rawRows[0].map(normHdr);
  const findCol = (...names: string[]): number => {
    for (const n of names) { const idx = hdr.indexOf(normHdr(n)); if (idx !== -1) return idx; }
    return -1;
  };
  const cols = {
    description: findCol('Item', 'Item Description', 'item description', 'description', 'item_description'),
    quantity:    findCol('Quantity', 'qty'),
    unitPrice:   findCol('Unit Price', 'unit_price', 'unit cost', 'unit_cost', 'price'),
    uom:         findCol('Unit of Measure', 'unit of measure'),
  };

  const getCell = (row: any[], idx: number): string => {
    if (idx === -1 || row[idx] === undefined || row[idx] === null) return '';
    return String(row[idx]).trim();
  };

  const dataRows = rawRows.slice(1).map((r, i) => ({ row: r, rowNum: i + 2 }))
    .filter(({ row }) => row.some(c => c !== undefined && c !== null && String(c).trim() !== ''));
  if (dataRows.length === 0) throw { status: 400, message: 'Excel file contains no data rows' };

  const results: { rowNumber: number; description: string; quantity: number; unitPrice: number; valid: boolean; errors: string[] }[] = [];
  let totalValid = 0;
  let totalInvalid = 0;

  for (const { row, rowNum } of dataRows) {
    const description = getCell(row, cols.description);
    const qtyStr     = getCell(row, cols.quantity);
    const priceStr   = getCell(row, cols.unitPrice);
    const rowErrors: string[] = [];

    if (!description) rowErrors.push('Item is required');
    const quantity = parseFloat(qtyStr.replace(/,/g, '')) || 0;
    if (!qtyStr) rowErrors.push('Quantity is required');
    else if (quantity <= 0) rowErrors.push('Quantity must be greater than 0');
    const unitPrice = parseFloat(priceStr.replace(/,/g, '')) || 0;
    if (!priceStr) rowErrors.push('Unit Price is required');
    else if (unitPrice < 0) rowErrors.push('Unit Price cannot be negative');

    if (rowErrors.length > 0) {
      results.push({ rowNumber: rowNum, description, quantity, unitPrice, valid: false, errors: rowErrors });
      totalInvalid++;
    } else {
      results.push({ rowNumber: rowNum, description, quantity, unitPrice, valid: true, errors: [] });
      totalValid++;
    }
  }

  return { total: dataRows.length, valid: totalValid, invalid: totalInvalid, results };
}

export async function bulkImportPRLines(prNumber: string, file: Express.Multer.File, _reqUser: any): Promise<{
  created: number; errors: number; total: number;
  results: { rowNumber: number; description: string; success: boolean; lineId?: number; errors?: string[] }[];
}> {
  const check = await repo.getPrStatusAndCurrency(prNumber);
  validationHelper.validateIsEditable(check, check.pr_status, 'Requisition');

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

  const normHdr = (v: any) => String(v ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[\s_\-*]+/g, ' ').trim();
  const hdr = rawRows[0].map(normHdr);
  const findCol = (...names: string[]): number => {
    for (const n of names) { const idx = hdr.indexOf(normHdr(n)); if (idx !== -1) return idx; }
    return -1;
  };
  const cols = {
    description: findCol('Item', 'Item Description', 'item description', 'description', 'item_description'),
    quantity:    findCol('Quantity', 'qty'),
    unitPrice:   findCol('Unit Price', 'unit_price', 'unit cost', 'unit_cost', 'price'),
    uom:         findCol('Unit of Measure', 'unit of measure'),
  };

  const getCell = (row: any[], idx: number): string => {
    if (idx === -1 || row[idx] === undefined || row[idx] === null) return '';
    return String(row[idx]).trim();
  };

  const dataRows = rawRows.slice(1).map((r, i) => ({ row: r, rowNum: i + 2 }))
    .filter(({ row }) => row.some(c => c !== undefined && c !== null && String(c).trim() !== ''));
  if (dataRows.length === 0) throw { status: 400, message: 'Excel file contains no data rows' };

  const itemMapResult = await getPool().query(`
    SELECT pm.id, TRIM(pm.product_name) AS product_name, pm.product_category::text AS product_category, cat.category_name
    FROM dbo.pm_product_master pm
    LEFT JOIN dbo.cat_categories cat ON pm.product_category::text = cat.category_id::text
    WHERE pm.product_name IS NOT NULL AND TRIM(pm.product_name) != ''
  `);
  const itemMap = new Map<string, { id: string; categoryId: string | null; categoryName: string | null }>(
    itemMapResult.rows.map((r: any) => [
      String(r.product_name).trim().toLowerCase(),
      { id: String(r.id), categoryId: r.product_category || null, categoryName: r.category_name || null },
    ])
  );

  const importResults: { rowNumber: number; description: string; success: boolean; lineId?: number; errors?: string[] }[] = [];
  let created = 0;
  let errors = 0;

  for (const { row, rowNum } of dataRows) {
    const description = getCell(row, cols.description);
    const qtyStr      = getCell(row, cols.quantity);
    const priceStr    = getCell(row, cols.unitPrice);
    const uom         = getCell(row, cols.uom) || 'Each';
    const rowErrors: string[] = [];

    if (!description) rowErrors.push('Item is required');
    const quantity = parseFloat(qtyStr.replace(/,/g, '')) || 0;
    if (!qtyStr) rowErrors.push('Quantity is required');
    else if (quantity <= 0) rowErrors.push('Quantity must be greater than 0');
    const unitPrice = parseFloat(priceStr.replace(/,/g, '')) || 0;
    if (!priceStr) rowErrors.push('Unit Price is required');
    else if (unitPrice < 0) rowErrors.push('Unit Price cannot be negative');

    if (rowErrors.length > 0) {
      importResults.push({ rowNumber: rowNum, description, success: false, errors: rowErrors });
      errors++;
      continue;
    }

    const itemLookup = itemMap.get(description.toLowerCase());

    try {
      const nextId  = await repo.getNextPrLineId();
      const lineNum = await repo.getNextPrLineNum(prNumber);
      const amount  = quantity * unitPrice;
      const result  = await repo.insertPrLine({
        id: nextId, prNumber, lineNum,
        itemDescription: description,
        qty: quantity, uom, unitCost: unitPrice, amount,
        categoryId: itemLookup?.categoryId ?? null,
        categoryName: itemLookup?.categoryName ?? null,
        itemId: itemLookup?.id ?? null,
        currency: check.currency || 'AED',
      });
      importResults.push({ rowNumber: rowNum, description, success: true, lineId: result?.id ?? nextId });
      created++;
    } catch (err: any) {
      importResults.push({ rowNumber: rowNum, description, success: false, errors: [err?.message || 'Failed to create line'] });
      errors++;
    }
  }

  await repo.updatePrTotalAmount(prNumber);
  return { created, errors, total: dataRows.length, results: importResults };
}

// --- PO Lines Bulk Import ---

export async function downloadPOLinesTemplate(_poNumber: string): Promise<Buffer> {
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;

  const [uomResult, taxResult, itemResult] = await Promise.all([
    getPool().query(`SELECT description FROM dbo.am_lookup_params_dtls WHERE UPPER(key_1) = 'UOM' AND status = 'Y' ORDER BY key_2`),
    getPool().query(`SELECT tax_code AS tax_code FROM dbo.am_tax_code_mapping_mst WHERE status = 'Y' ORDER BY tax_code`),
    getPool().query(`SELECT TRIM(product_name) AS product_name FROM dbo.pm_product_master WHERE product_name IS NOT NULL AND TRIM(product_name) != '' ORDER BY product_name`),
  ]);
  const uoms: string[]     = uomResult.rows.map((r: any) => String(r.description).trim()).filter(Boolean);
  const taxCodes: string[] = taxResult.rows.map((r: any) => String(r.tax_code).trim()).filter(Boolean);
  const items: string[]    = itemResult.rows.map((r: any) => String(r.product_name).trim()).filter(Boolean);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Line Items');

  const headers = ['Item *', 'Quantity *', 'Unit Price *', 'Unit of Measure', 'Tax Rate (%)'];
  ws.columns = headers.map((h: string, i: number) => ({ header: h, key: String.fromCharCode(65 + i), width: [30, 12, 12, 10, 14, 16, 20][i] }));

  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    cell.border = { bottom: { style: 'thin' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 20;

  ws.addRow([items[0] || 'Sample Item Description', 1, 100.00, uoms[0] || 'Each', taxCodes[0] ?? '']);

  const refSheet = wb.addWorksheet('Reference Data');
  refSheet.state = 'hidden';
  const maxLen = Math.max(uoms.length, taxCodes.length, items.length, 1);
  refSheet.addRow(['Unit of Measure', 'Tax Rate', 'Item']);
  for (let i = 0; i < maxLen; i++) {
    refSheet.addRow([
      i < uoms.length     ? uoms[i]     : '',
      i < taxCodes.length ? taxCodes[i] : '',
      i < items.length    ? items[i]    : '',
    ]);
  }

  const DATA_ROWS = 1000;
  const dv = (ws as any).dataValidations;

  if (items.length > 0) {
    dv.add(`A2:A${DATA_ROWS}`, {
      type: 'list', allowBlank: false,
      formulae: [`'Reference Data'!$C$2:$C$${items.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Invalid Item', error: 'Please select a valid item from the dropdown.',
    });
  }
  if (uoms.length > 0) {
    dv.add(`D2:D${DATA_ROWS}`, {
      type: 'list', allowBlank: true,
      formulae: [`'Reference Data'!$A$2:$A$${uoms.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Invalid UOM', error: 'Please select a valid UOM from the dropdown.',
    });
  }
  if (taxCodes.length > 0) {
    dv.add(`E2:E${DATA_ROWS}`, {
      type: 'list', allowBlank: true,
      formulae: [`'Reference Data'!$B$2:$B$${taxCodes.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Invalid Tax Rate', error: 'Please select a valid tax rate from the dropdown.',
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function validateBulkPOLinesImport(poNumber: string, file: Express.Multer.File): Promise<{
  total: number; valid: number; invalid: number;
  results: { rowNumber: number; description: string; quantity: number; unitPrice: number; valid: boolean; errors: string[] }[];
}> {
  const check = await repo.getPoStatus(poNumber);
  validationHelper.validateIsEditable(check, check.po_status, 'Purchase order');

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

  const normHdr = (v: any) => String(v ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[\s_\-*%()+]+/g, ' ').trim();
  const hdr = rawRows[0].map(normHdr);
  const findCol = (...names: string[]): number => {
    for (const n of names) { const idx = hdr.indexOf(normHdr(n)); if (idx !== -1) return idx; }
    return -1;
  };
  const cols = {
    description: findCol('Item', 'item ', 'description', 'item_description', 'line description'),
    quantity:    findCol('Quantity', 'qty', 'line qty'),
    unitPrice:   findCol('Unit Price', 'unit_price', 'unit cost', 'unit_cost', 'price', 'line unit cost'),
    uom:         findCol('Unit of Measure', 'unit of measure', 'line unit'),
    taxRate:     findCol('Tax Rate', 'tax rate', 'tax_rate', 'tax'),
  };

  const getCell = (row: any[], idx: number): string => {
    if (idx === -1 || row[idx] === undefined || row[idx] === null) return '';
    return String(row[idx]).trim();
  };

  const dataRows = rawRows.slice(1).map((r, i) => ({ row: r, rowNum: i + 2 }))
    .filter(({ row }) => row.some(c => c !== undefined && c !== null && String(c).trim() !== ''));
  if (dataRows.length === 0) throw { status: 400, message: 'Excel file contains no data rows' };

  const results: { rowNumber: number; description: string; quantity: number; unitPrice: number; valid: boolean; errors: string[] }[] = [];
  let totalValid = 0;
  let totalInvalid = 0;

  for (const { row, rowNum } of dataRows) {
    const description = getCell(row, cols.description);
    const qtyStr      = getCell(row, cols.quantity);
    const priceStr    = getCell(row, cols.unitPrice);
    const rowErrors: string[] = [];

    if (!description) rowErrors.push('Item is required');
    const quantity = parseFloat(qtyStr.replace(/,/g, '')) || 0;
    if (!qtyStr) rowErrors.push('Quantity is required');
    else if (quantity <= 0) rowErrors.push('Quantity must be greater than 0');
    const unitPrice = parseFloat(priceStr.replace(/,/g, '')) || 0;
    if (!priceStr) rowErrors.push('Unit Price is required');
    else if (unitPrice < 0) rowErrors.push('Unit Price cannot be negative');

    if (rowErrors.length > 0) {
      results.push({ rowNumber: rowNum, description, quantity, unitPrice, valid: false, errors: rowErrors });
      totalInvalid++;
    } else {
      results.push({ rowNumber: rowNum, description, quantity, unitPrice, valid: true, errors: [] });
      totalValid++;
    }
  }

  return { total: dataRows.length, valid: totalValid, invalid: totalInvalid, results };
}

export async function bulkImportPOLines(poNumber: string, file: Express.Multer.File, _reqUser: any): Promise<{
  created: number; errors: number; total: number;
  results: { rowNumber: number; description: string; success: boolean; lineId?: number; errors?: string[] }[];
}> {
  const check = await repo.getPoStatus(poNumber);
  validationHelper.validateIsEditable(check, check.po_status, 'Purchase order');

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

  const normHdr = (v: any) => String(v ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[\s_\-*%()+]+/g, ' ').trim();
  const hdr = rawRows[0].map(normHdr);
  const findCol = (...names: string[]): number => {
    for (const n of names) { const idx = hdr.indexOf(normHdr(n)); if (idx !== -1) return idx; }
    return -1;
  };
  const cols = {
    description: findCol('Item', 'item description', 'Item Description', 'description', 'item_description', 'line description'),
    quantity:    findCol('Quantity', 'qty', 'line qty'),
    unitPrice:   findCol('Unit Price', 'unit_price', 'unit cost', 'unit_cost', 'price', 'line unit cost'),
    uom:         findCol('Unit of Measure', 'unit of measure', 'line unit'),
    taxRate:     findCol('Tax Rate', 'tax rate', 'tax_rate', 'tax'),
  };

  const getCell = (row: any[], idx: number): string => {
    if (idx === -1 || row[idx] === undefined || row[idx] === null) return '';
    return String(row[idx]).trim();
  };

  const dataRows = rawRows.slice(1).map((r, i) => ({ row: r, rowNum: i + 2 }))
    .filter(({ row }) => row.some(c => c !== undefined && c !== null && String(c).trim() !== ''));
  if (dataRows.length === 0) throw { status: 400, message: 'Excel file contains no data rows' };

  const itemMapResult = await getPool().query(`
    SELECT pm.id, TRIM(pm.product_name) AS product_name, pm.product_category::text AS product_category, cat.category_name
    FROM dbo.pm_product_master pm
    LEFT JOIN dbo.cat_categories cat ON pm.product_category::text = cat.category_id::text
    WHERE pm.product_name IS NOT NULL AND TRIM(pm.product_name) != ''
  `);
  const itemMap = new Map<string, { id: string; categoryCode: number | null; categoryName: string | null; itemName: string }>(
    itemMapResult.rows.map((r: any) => {
      const parsed = parseInt(r.product_category, 10);
      return [
        String(r.product_name).trim().toLowerCase(),
        { id: String(r.id), categoryCode: isNaN(parsed) ? null : parsed, categoryName: r.category_name || null, itemName: String(r.product_name).trim() },
      ];
    })
  );

  const importResults: { rowNumber: number; description: string; success: boolean; lineId?: number; errors?: string[] }[] = [];
  let created = 0;
  let errors = 0;

  for (const { row, rowNum } of dataRows) {
    const description  = getCell(row, cols.description);
    const qtyStr       = getCell(row, cols.quantity);
    const priceStr     = getCell(row, cols.unitPrice);
    const uom          = getCell(row, cols.uom) || 'Each';
    const taxRateStr   = getCell(row, cols.taxRate);
    const rowErrors: string[] = [];

    if (!description) rowErrors.push('Item is required');
    const quantity = parseFloat(qtyStr.replace(/,/g, '')) || 0;
    if (!qtyStr) rowErrors.push('Quantity is required');
    else if (quantity <= 0) rowErrors.push('Quantity must be greater than 0');
    const unitPrice = parseFloat(priceStr.replace(/,/g, '')) || 0;
    if (!priceStr) rowErrors.push('Unit Price is required');
    else if (unitPrice < 0) rowErrors.push('Unit Price cannot be negative');
    const taxRate = parseFloat(taxRateStr.replace(/,/g, '')) || 0;

    if (rowErrors.length > 0) {
      importResults.push({ rowNumber: rowNum, description, success: false, errors: rowErrors });
      errors++;
      continue;
    }

    const itemLookup = itemMap.get(description.toLowerCase());

    try {
      const lineCost    = quantity * unitPrice;
      const taxAmount   = lineCost * (taxRate / 100);
      const nextLineNum = await repo.getNextPoLineNumber(poNumber);
      const nextId      = await repo.getNextPoLineId();
      const lineId      = await repo.insertPoLine({
        id: nextId, poNumber,
        lineNumber: String(nextLineNum),
        description, quantity, unitPrice, uom,
        taxRate, taxAmount, lineCost,
        itemId: itemLookup?.id ?? null,
        itemName: itemLookup?.itemName ?? null,
        categoryCode: itemLookup?.categoryCode ?? null,
        categoryName: itemLookup?.categoryName ?? null,
        discount: 0,
      });
      importResults.push({ rowNumber: rowNum, description, success: true, lineId });
      created++;
    } catch (err: any) {
      importResults.push({ rowNumber: rowNum, description, success: false, errors: [err?.message || 'Failed to create line'] });
      errors++;
    }
  }

  await updatePOTotals(getPool(), poNumber);
  return { created, errors, total: dataRows.length, results: importResults };
}
