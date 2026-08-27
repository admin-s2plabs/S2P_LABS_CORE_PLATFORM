import { resolveDefaultEnvelopeOpenDate } from "@shared/publish-bid-dates";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { getContextDb } from "../../tenant-context";
const getDb = () => getContextDb() ?? db;
import { eventBus } from "../../services/eventBus";
import { EventTypes, type BidCancelledEvent } from "../../services/eventBus/events";
import { generateWorkflowFromText } from "../../services/workflow-ai-service";
import * as bidAI from "../../services/bid-ai-service";
import { resolveTechnicalEvalPersistedScore } from "../../services/technical-evaluation-engine";
import { getPersistedReviewRemark } from "@shared/technical-evaluation-remarks";
import type { TechnicalRequirementScore } from "@shared/technical-evaluation";
import { logApproversHistory } from "../_shared/helper-utils";
import { logAudit } from "../administration/administration.service";
import {
  getLoggedInUser,
  getUsersDropdown,
  getUsersInRoleByEntity,
} from "../user-management/user-management.service";
import * as repo from "./bids.repository";
import * as fmpService from "../fmpi/fmpi.service";
import * as fmpRepo from "../fmpi/fmpi.repository";
import * as adminRepo from "../administration/administration.repository.ts";
import * as helper from "../_shared/helper-utils";

export function isDateNotPast(dateStr: string): boolean {
  const inputDate = new Date(dateStr);
  if (isNaN(inputDate.getTime())) return false;
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMilliseconds(0);
  const compared = new Date(inputDate);
  compared.setSeconds(0, 0);
  compared.setMilliseconds(0);
  return compared >= now;
}

const COMMERCIAL_CRITERIA_CATEGORIES = ["Finance", "Financial"];

function getMaxCommercialPriceWeight(allReqs: any[]): number {
  const hasFinanceReqs = allReqs.some((r) => COMMERCIAL_CRITERIA_CATEGORIES.includes(r.category));
  return hasFinanceReqs ? 50 : 100;
}

function computeResponseScoreTotals(
  allReqs: any[],
  priceScoreRaw: string | number | null | undefined,
): { totalScore: string; finScore: string; totalTechAndFinScore: string; commercialScore: string } {
  let techTotal = 0;
  let techWeightTotal = 0;
  let commTotal = 0;
  let commWeightTotal = 0;

  for (const r of allReqs) {
    const w = parseFloat(r.weight) || 0;
    const s = parseFloat(r.score) || 0;
    if (w > 0 && r.score) {
      if (COMMERCIAL_CRITERIA_CATEGORIES.includes(r.category)) {
        commTotal += s;
        commWeightTotal += w;
      } else {
        techTotal += s;
        techWeightTotal += w;
      }
    }
  }

  const maxPriceWeight = getMaxCommercialPriceWeight(allReqs);
  const totalScore = techWeightTotal > 0 ? String(Math.round((techTotal * 100) / techWeightTotal)) : "";
  const finScore = commWeightTotal > 0 ? String(Math.round((commTotal * 100) / commWeightTotal)) : "";

  const rawPrice = priceScoreRaw != null && priceScoreRaw !== "" ? Number(priceScoreRaw) : 0;
  const priceScorePct = rawPrice > 0 ? (rawPrice * 100) / maxPriceWeight : 0;

  let commercialTotal = 0;
  if (finScore !== "") {
    commercialTotal = Number(finScore) * 0.5 + priceScorePct * 0.5;
  } else if (priceScorePct > 0) {
    commercialTotal = priceScorePct;
  }

  const commercialScore = String(Math.round(commercialTotal));
  let totalTechAndFinScore = "";
  try {
    totalTechAndFinScore = String(Math.round((Number(totalScore) + Number(commercialScore)) / 2));
  } catch (e) {
    console.error(e);
  }

  return { totalScore, finScore, totalTechAndFinScore, commercialScore };
}

export async function listDboBids() {
  const bids = await repo.getDboBids();
  let finalResult = [];
  for (const bid of bids) {
    let bidId = bid.id;
    if(bid.status === 'Award Under Process'){
      const award = await repo.getAwardsByBidRefNo(bidId);
      if(award && award.length > 0){
        bidId = award[0].id;
      }
    }
    const currentApprover = await repo.getCurrentApprover(bidId, 'Bid');
    finalResult.push({
      ...bid,
      currentApprover: currentApprover?.name || null,
    });
  }
  return finalResult;
}

export async function listSupplierBidResponses(supplierId: number) {
  return repo.getSupplierBidResponses(supplierId);
}

export async function listSupplierPendingBids(supplierId: number) {
  return repo.getSupplierPendingBids(supplierId);
}

export async function getSupplierBidInvite(bidId: number, supplierId: number) {
  return repo.getSupplierBidInvite(bidId, supplierId);
}

export async function getBidResponseBySuppAndBid(supplierId: number, bidId: number) {
  return repo.getBidResponseBySuppAndBid(supplierId, bidId);
}

export async function acknowledgeSupplierBid(
  bidId: number,
  supplierId: number,
  body: { acknowledgement_type?: string; notes_to_buyer?: string; terms_accepted?: boolean },
  sessionUser?: any
) {
  if (!body.acknowledgement_type) {
    throw { status: 400, message: "Acknowledgement type is required" };
  }
  if (!body.terms_accepted) {
    throw { status: 400, message: "You must accept the terms and conditions" };
  }

  const invite = await repo.getSupplierBidInvite(bidId, supplierId);
  if (!invite) throw { status: 404, message: "You are not invited to this bid" };
  if (invite.status !== 'Invited') throw { status: 400, message: `Cannot acknowledge - current status is "${invite.status}"` };

  const bid = await repo.getDboBidById(bidId);
  if (!bid) throw { status: 404, message: "Bid not found" };
  const bidObj = bid as any;

  const ackStatus = body.acknowledgement_type;
  const comments = body.notes_to_buyer || '';
  const loggedUser = sessionUser || {};
  const createdBy = loggedUser.user_name || loggedUser.name || 'System';

  let supplierName = '';
  let supplierSite = '';
  let supplierContact = loggedUser.name || '';
  let supplierContactNo = loggedUser.mobileNo || loggedUser.phone || '';

  if (supplierId > 0) {
    const supp = await repo.getSupplierOrgById(supplierId);
    if (supp) {
      const s = supp as any;
      supplierName = s.company_name || '';
      const sites = await repo.getSupplierSites(supplierId);
      if (sites && sites.length > 0) {
        const site = sites[0] as any;
        supplierSite = `${site.sitename || ''}-${site.country || ''}-${site.city || ''}`;
      }
    }
  }

  await repo.insertBidAcknowledgment({
    bidrefno: bidId,
    status: ackStatus,
    comments,
    supplier_id: supplierId,
    suppliername: supplierName,
    suppliersite: supplierSite,
    suppliercontact: supplierContact,
    suppliercontactno: supplierContactNo,
    created_by: createdBy,
  });

  if (ackStatus === 'Participating') {
    const existingResponse = await repo.getBidResponseBySuppAndBid(supplierId, bidId);
    let respId: string;

    if (!existingResponse) {
      const bidReqs = await repo.getDboBidRequirements(bidId);

      let effectiveEndDate = bidObj.enddate;
      try {
        const extendedDate = await repo.getMaxExtendedEndDate(bidId, supplierId);
        if (extendedDate && new Date(extendedDate) > new Date(bidObj.enddate)) {
          effectiveEndDate = extendedDate;
        }
      } catch (e) {}

      const responseRecord = await repo.insertBidResponse({
        bidrefno: bidId,
        supplier_id: supplierId,
        status: 'Draft',
        bidtitle: bidObj.bid_title || '',
        bidtype: bidObj.type || '',
        bidstartdate: bidObj.startdate,
        bidenddate: effectiveEndDate,
        is_contract_required: bidObj.is_contract_required || null,
        contract_template_id: bidObj.contract_template_id ? String(bidObj.contract_template_id) : null,
        supplier_name: supplierName,
        supplier_contact: supplierContact,
        supplier_contact_no: supplierContactNo,
        supplier_site: supplierSite,
        created_by: createdBy,
      });

      respId = (responseRecord as any).id;

      for (const req of bidReqs) {
        const r = req as any;
        await repo.insertBidResponseRequirement({
          bid_resp_id: respId,
          bid_req_id: r.id,
          category: r.category || '',
          question: r.question || '',
          qvoption: r.qvoption || '',
          qvtype: r.qvtype || '',
          target: r.target || null,
          weight: r.weight || null,
          knockoutscore: r.knockoutscore || null,
          scoringmethod: r.scoringmethod || null,
          lov: r.lov || null,
          created_by: createdBy,
        });
      }
    } else {
      respId = String((existingResponse as any).id);
    }

    // Always sync scope-of-work lines from the bid master (PR-sourced lines may be added after a prior ack).
    await syncBidResponseLinesForResponse(bidId, respId, createdBy);
  }

  await repo.updateSupplierBidInviteStatus(bidId, supplierId, 'Acknowledged');

  const ackCount = await repo.getAckCountForBid(bidId);
  await repo.updateBidAckCount(bidId, ackCount);

  return { success: true, status: ackStatus, message: "Bid acknowledgement submitted successfully" };
}

export async function declineSupplierBid(bidId: number, supplierId: number) {
  const invite = await repo.getSupplierBidInvite(bidId, supplierId);
  if (!invite) throw { status: 404, message: "You are not invited to this bid" };
  if (invite.status !== 'Invited' && invite.status !== 'Acknowledged') throw { status: 400, message: `Cannot decline - current status is "${invite.status}"` };
  return repo.updateSupplierBidInviteStatus(bidId, supplierId, 'Not Interested');
}

export async function createDboBid(body: any, sessionUser?: any) {
  if (!body.bid_title || !body.bid_title.trim()) {
    throw { status: 400, message: "Bid title is required" };
  }
  // Session users expose `userName`; DB rows expose `user_name`. Normalize so the audit
  // columns below record the actual creator instead of falling through to 'System'.
  const loggedInUser = sessionUser
    ? { ...sessionUser, user_name: sessionUser.user_name ?? sessionUser.userName }
    : {} as any;
  if (!body.org_id) {
    // Business entities assigned on Manage Users win; `orgId` is a legacy single-value column.
    const assignedOrgIds = String(loggedInUser.orgIds ?? "")
      .split(",")
      .map((id: string) => id.trim())
      .filter(Boolean);
    body.org_id =
      assignedOrgIds[0] ||
      loggedInUser.org_id ||
      loggedInUser.orgId ||
      loggedInUser.business_entity ||
      loggedInUser.businessEntity ||
      null;
  }
  if (!body.buyer_id && loggedInUser.id) {
    body.buyer_id = loggedInUser.id;
  }
  if (!body.org_id) {
    throw { status: 400, message: "Business Entity is required" };
  }
  if (!body.buyer_id) {
    throw { status: 400, message: "Buyer is required" };
  }
  if (!body.currency) {
    throw { status: 400, message: "Currency is required" };
  }

  const bidType = body.type || 'RFQ';
  const isUpdate = body.bid_ref_no && body.bid_ref_no !== '';
  const orgId = body.org_id;
  let existingBid: any = null;

  if (isUpdate) {
    existingBid = await repo.getDboBidById(parseInt(body.bid_ref_no));
    if (!existingBid) {
      throw { status: 404, message: "Bid not found" };
    }
  }

  const buyerUser = await repo.getUserById(parseInt(body.buyer_id || loggedInUser.id || '0'));

  let requestorUser: any = null;
  if (body.requestor_id) {
    try {
      requestorUser = await repo.getUserById(parseInt(body.requestor_id));
    } catch (e) {}
  }

  let locationObj: any = null;
  if (body.delivery_location_id) {
    try {
      locationObj = await repo.getLocationById(parseInt(body.delivery_location_id));
    } catch (e) {}
  }

  if (!isUpdate) {
    if (body.startdate) {
      if (!isDateNotPast(body.startdate)) {
        throw { status: 400, message: "Bid Publish Date Must be Today's Date with Future time or Future Date!" };
      }
    }
    if (body.startdate && body.enddate) {
      const openDate = new Date(body.startdate);
      const closeDate = new Date(body.enddate);
      if (closeDate <= openDate) {
        throw { status: 400, message: "Bid close date must be after the open date" };
      }
    }
  }

  const bidStyle = body.bid_style || (bidType === 'Tender' ? 'Sealed' : 'Open');

  const bidData: any = {
    bid_title: body.bid_title,
    type: bidType,
    bid_style: bidStyle,
    description: body.description || null,
    currency: body.currency || 'USD',
    startdate: body.startdate || null,
    enddate: body.enddate || null,
    env_open_date: bidType === 'Tender' && body.env_open_date ? body.env_open_date : null,
    buyer: body.buyer || (buyerUser?.id ? String(buyerUser.id) : null),
    buyer_name: buyerUser?.name || body.buyer_name || loggedInUser.name || null,
    buyer_email: buyerUser?.email_id || loggedInUser.email_id || null,
    requestor: body.requestor_id || null,
    requestor_name: requestorUser?.name || body.requestor_name || null,
    requestor_email: requestorUser?.email_id || null,
    department_name: requestorUser?.department_name || body.department_name || null,
    pr_number: body.pr_number || null,
    operating_unit: buyerUser?.organization_name || null,
    paymentterms: body.paymentterms || null,
    delivertto_location_id: body.delivery_location_id ? parseInt(body.delivery_location_id) : null,
    delivertto_location_name: locationObj?.location_name || body.delivertto_location_name || null,
    billtoaddress: locationObj?.billto_address || null,
    shiptoaddress: locationObj?.shipto_address || null,
    is_contract_required: body.contract_required || null,
    contract_template_id: body.contract_template_id || null,
    template_name: body.template_name || null,
    payment_required: body.payment_required === 'Y' ? 'Y' : 'N',
    payment_amount: body.payment_required === 'Y' && body.payment_amount ? parseFloat(body.payment_amount) : null,
    bond_required: body.bond_required === 'Y' ? 'Y' : 'N',
    bond_amount_pcnt: body.bond_required === 'Y' ? body.bond_amount_pcnt || null : null,
    created_by: loggedInUser.user_name || 'System',
    org_id: orgId,
    budget_name: null,
    budget_segment: null,
  };

  let result: any;

  if (isUpdate) {
    result = await repo.updateDboBid(parseInt(body.bid_ref_no), bidData);

    await repo.updateBidResponseDates(
      parseInt(body.bid_ref_no),
      bidData.startdate,
      bidData.enddate
    );
  } else {
    const bidNumber = await repo.generateBidNumber(bidType);
    bidData.bid_number = bidNumber;

    result = await repo.insertDboBid(bidData);

    if (body.bid_template_id) {
      try {
        await copyFromTemplate(parseInt(body.bid_template_id), result.id, bidData, loggedInUser);
      } catch (e) {
        console.error("Error copying from template:", e);
      }
    } else if (bidData.pr_number) {
      try {
        await copyFromPR(bidData.pr_number, result.id, bidData, loggedInUser);
      } catch (e) {
        console.error("Error copying from PR:", e);
      }
    }

    if (bidType === 'Tender' && !body.bid_template_id) {
      const committee = await repo.getAllCommitteeMembers();
      for (const comm of committee) {
        await repo.insertBidApprover({
          bidrefno: result.id,
          user_id: (comm as any).user_id,
          teamtype: 'Committee Team',
          logged_id: loggedInUser.user_name || null,
        });
      }
    }
  }

  if (body.item_ids && body.item_ids.length > 0) {
    const prLines = await repo.getPrLinesByItemIds(body.item_ids);
    for (const line of prLines) {
      const l = line as any;
      await repo.insertBidLine({
        bidrefno: result.id,
        linetype: l.line_type,
        description: l.item_description,
        currency: l.curr_code,
        uom: l.uom,
        quantity: l.qty ? parseInt(l.qty) : null,
        currentprice: l.unit_cost,
        needbyfrom: l.need_by_date,
        needbyto: l.need_by_date || l.pr_delivery_date || null,
        status: l.status,
        item_id: l.item_id || 0,
        product_category: l.product_category_name || null,
        product_category_id: l.product_category || null,
        shiptoaddress: l.deliver_to_location_id ? String(l.deliver_to_location_id) : null,
        req_line_id: l.req_line_id,
        last_purchase_date: l.last_purchase_date,
        last_purchase_rate: l.last_purchase_rate,
        attribute_14: l.pr_requestor_name || null,
        attribute_13: l.pr_requestor_id ? String(l.pr_requestor_id) : null,
        attribute_5: l.line_num ? String(l.line_num) : null,
        attribute_15: l.pr_number || null,
        created_by: loggedInUser.user_name || 'System',
      });

      if (l.pr_number) {
        await repo.updatePrPoNumber(l.pr_number, 'Bid', result.id);
      }
    }

    if (body.currency) {
      await repo.updateBidLineCurrency(result.id, body.currency);
    }
  }

  if (body.bid_apprs_list && body.bid_team_type) {
    await processNewBidTeam(result.id, body.bid_apprs_list, body.bid_team_type);
  }
  const orgData = await adminRepo.getOrgDetails();

  if (!isUpdate) {
    eventBus.publish({
      eventType: EventTypes.BID_CREATED,
      bidId: String(result.id),
      bidNumber: result.bid_number,
      bidTitle: bidData.bid_title,
      requestorName: bidData.requestor_name || "N/A",
      receiverEmail: bidData.requestor_email || bidData.buyer_email || "",
      timestamp: new Date(),
      orgLogoPath: orgData.org_logo_path,
      
    });
  }

  return result;
}

export async function createBidFromPR(
  prNumber: string,
  body: { templateId?: string; bidType: string; openDate: string; closeDate: string; envelopeOpenDate?: string },
  sessionUser: any
) {
  if (!prNumber || prNumber.trim() === '') {
    throw { status: 400, message: "PR Number is required" };
  }

  const prObj = await repo.getPrHeaderByPrNumber(prNumber);
  if (!prObj) {
    throw { status: 404, message: "Purchase Request not found" };
  }

  // Only PRs the user can see on their Requisitions list may be sourced. Reported as 404 so
  // a PR outside their visibility is indistinguishable from one that does not exist.
  const { canUserAccessPr } = await import("../procurement/procurement.service");
  if (!(await canUserAccessPr(prNumber, sessionUser))) {
    throw { status: 404, message: "Purchase Request not found" };
  }

  const pr = prObj as any;

  if (pr.pr_status !== 'Approved') {
    throw { status: 400, message: "Only Approved Purchase Requests can be converted to Bids" };
  }

  if (pr.bidno) {
    throw { status: 400, message: `This PR already has a Bid (BID-${pr.bidno})` };
  }

  const bidType = body.bidType || 'RFQ';
  const loggedInUser = sessionUser || {};

  if (body.openDate) {
    if (!isDateNotPast(body.openDate)) {
      throw { status: 400, message: "Bid Publish Date must be today's date with future time or a future date" };
    }
  }

  if (body.openDate && body.closeDate) {
    const openDate = new Date(body.openDate);
    const closeDate = new Date(body.closeDate);
    if (closeDate <= openDate) {
      throw { status: 400, message: "Bid close date must be after the open date" };
    }
  }
  
  if (bidType === 'Tender') {
    if (!body.closeDate) {
      throw { status: 400, message: "Bid close date is required for tender bid" };
    }
    if (!body.envelopeOpenDate) {
      body.envelopeOpenDate = resolveDefaultEnvelopeOpenDate({
        closeDate: new Date(body.closeDate),
      }).toISOString();
    }
  }
  if (body.envelopeOpenDate && body.closeDate) {
    const envelopeOpenDate = new Date(body.envelopeOpenDate);
    const closeDate = new Date(body.closeDate);
    if (envelopeOpenDate <= closeDate) {
      throw { status: 400, message: "Envelope open date must be after the close date" };
    }
  }



  const bidStyle = bidType === 'Tender' ? 'Sealed' : 'Open';
  const bidNumber = await repo.generateBidNumber(bidType);

  let techScore: number | null = null;
  let commercialScore: number | null = null;
  try {
    const lookup = await repo.getLookupByKey('TECHNICAL_SCORE_WEIGHTAGE');
    if (lookup) techScore = parseInt((lookup as any).description);
  } catch (e) {}
  try {
    const lookup = await repo.getLookupByKey('COMMERCIAL_SCORE_WEIGHTAGE');
    if (lookup) commercialScore = parseInt((lookup as any).description);
  } catch (e) {}

  const openDateISO = body.openDate ? new Date(body.openDate).toISOString() : null;
  const closeDateISO = body.closeDate ? new Date(body.closeDate).toISOString() : null;
  const envelopeOpenDateISO = body.envelopeOpenDate ? new Date(body.envelopeOpenDate).toISOString() : null;
  const bidData: any = {
    bid_title: pr.pr_description || pr.pr_number || 'Bid from PR',
    type: bidType,
    bid_style: bidStyle,
    description: pr.pr_description || null,
    currency: pr.currency || 'USD',
    startdate: openDateISO,
    enddate: closeDateISO,
    env_open_date: envelopeOpenDateISO,
    buyer: pr.pr_owner_id ? String(pr.pr_owner_id) : (loggedInUser.user_name || null),
    buyer_name: pr.pr_owner_name || loggedInUser.name || null,
    buyer_email: pr.pr_owner_email || loggedInUser.email_id || null,
    requestor: pr.requestor_id ? String(pr.requestor_id) : null,
    requestor_name: pr.requestor_name || null,
    requestor_email: pr.requestor_email || null,
    department_name: pr.department_name || null,
    pr_number: prNumber,
    operating_unit: pr.operating_unit ? String(pr.operating_unit) : null,
    paymentterms: 'NA',
    delivertto_location_id: pr.delivertto_location_id || null,
    delivertto_location_name: pr.delivertto_location_name || null,
    is_contract_required: pr.is_contract_required || null,
    bid_number: bidNumber,
    created_by: loggedInUser.user_name || 'System',
    org_id: prObj.org_id || null,
    budget_name: pr.budget_name || null,
    budget_segment: pr.budget_segment ? String(pr.budget_segment) : null,
  };

  console.log("bidData", bidData);

  const result = await repo.insertDboBid(bidData);
  const newBidId = result.id;

  if (body.templateId && body.templateId.trim() !== '') {
    try {
      await copyFromTemplate(parseInt(body.templateId), newBidId, bidData, loggedInUser);
    } catch (e) {
      console.error("Error copying from template:", e);
      await copyFromPR(prNumber, newBidId, bidData, loggedInUser);
    }
  } else {
    await copyFromPR(prNumber, newBidId, bidData, loggedInUser);
  }

  if (bidType === 'Tender') {
    const committee = await repo.getAllCommitteeMembers();
    for (const comm of committee) {
      await repo.insertBidApprover({
        bidrefno: newBidId,
        user_id: (comm as any).user_id,
        teamtype: 'Committee Team',
        logged_id: loggedInUser.user_name || null,
      });
    }
  }

  const postUpdates: any = {};
  if (techScore != null) postUpdates.tech_score_weightage = techScore;
  if (commercialScore != null) postUpdates.commercial_score_weightage = commercialScore;
  if (pr.attribute_8) postUpdates.attribute_13 = pr.attribute_8;
  if (Object.keys(postUpdates).length > 0) {
    await repo.updateDboBidTemplateFields(newBidId, postUpdates);
  }
  const orgData = await adminRepo.getOrgDetails();

  eventBus.publish({
    eventType: EventTypes.BID_CREATED,
    bidId: String(newBidId),
    bidNumber: result.bid_number || bidNumber,
    bidTitle: bidData.bid_title,
    requestorName: bidData.requestor_name || "N/A",
    receiverEmail: bidData.requestor_email || bidData.buyer_email || "",
    timestamp: new Date(),
    orgLogoPath: orgData.org_logo_path,
    
  });

  return { id: newBidId, bid_number: result.bid_number || bidNumber };
}

async function copyFromPR(prNumber: string, newBidId: number, bidData: any, loggedInUser: any) {
  const prHdr = await repo.getPrHeaderByPrNumber(prNumber);
  if (!prHdr) return;

  const p = prHdr as any;
  const prLines = await repo.getPrLinesByPrNumber(prNumber);

  const updateFields: any = {};
  if (p.pr_description) updateFields.bid_title = p.pr_description;
  updateFields.attribute_15 = p.attribute_8 || null;
  updateFields.org_id = p.org_id || null;

  if (!bidData.startdate) {
    updateFields.startdate = new Date().toISOString();
  }
  if (!bidData.enddate) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 10);
    updateFields.enddate = endDate.toISOString();
  }

  if (prLines.length > 0) {
    const firstLine = prLines[0] as any;
    if (firstLine.buyer_id && firstLine.buyer_id > 0) {
      const buyerUser = await repo.getUserById(firstLine.buyer_id);
      if (buyerUser) {
        updateFields.buyer = (buyerUser as any).user_name;
        updateFields.buyer_name = (buyerUser as any).name;
      }
    }
    if (firstLine.requestor_id && firstLine.requestor_id > 0) {
      const reqUser = await repo.getUserById(firstLine.requestor_id);
      if (reqUser) {
        updateFields.requestor = (reqUser as any).user_name?.toUpperCase();
        updateFields.requestor_name = (reqUser as any).name;
      }
    }
    if (firstLine.curr_code) {
      updateFields.currency = firstLine.curr_code;
    }
  }

  if (bidData.type === 'Tender' && !bidData.env_open_date) {
    const envDate = new Date();
    envDate.setDate(envDate.getDate() + 10);
    updateFields.env_open_date = envDate.toISOString();
  }

  if (p.operating_unit) updateFields.operating_unit = String(p.operating_unit);

  if (Object.keys(updateFields).length > 0) {
    const setClauses = Object.entries(updateFields)
      .map(([k, _]) => `${k} = $${k}`)
      .join(', ');
    await repo.updateDboBidTemplateFields(newBidId, updateFields);
  }

  await repo.updatePrHeader(prNumber, { attribute_7: 'Draft', bidno: newBidId });

  for (const line of prLines) {
    const l = line as any;
    await repo.insertBidLine({
      bidrefno: newBidId,
      linetype: l.line_type,
      description: l.item_description,
      currency: l.curr_code,
      uom: l.uom,
      quantity: l.qty ? parseInt(l.qty) : null,
      currentprice: l.unit_cost,
      needbyfrom: l.need_by_date,
      needbyto: l.need_by_date || l.pr_delivery_date || null,
      status: l.status,
      item_id: l.item_id || 0,
      product_category: l.product_category_name || null,
      product_category_id: l.product_category || null,
      shiptoaddress: l.deliver_to_location_id ? String(l.deliver_to_location_id) : null,
      req_line_id: l.req_line_id,
      last_purchase_date: l.last_purchase_date,
      last_purchase_rate: l.last_purchase_rate,
      attribute_14: l.pr_requestor_name || null,
      attribute_13: l.pr_requestor_id ? String(l.pr_requestor_id) : null,
      attribute_5: l.line_num ? String(l.line_num) : null,
      attribute_15: l.pr_number || null,
      attribute_12: l.attribute_13 || null,
      attribute_1: l.attribute_1 || null,
      created_by: loggedInUser.user_name || 'System',
    });
  }
}

async function copyFromTemplate(templateBidId: number, newBidId: number, bidData: any, loggedInUser: any) {
  if (bidData.pr_number) {
    await copyFromPR(bidData.pr_number, newBidId, bidData, loggedInUser);
    return;
  }

  const templateBid = await repo.getDboBidById(templateBidId);
  if (!templateBid) return;
  const t = templateBid as any;

  await repo.copyBidLinesFromTemplate(templateBidId, newBidId, loggedInUser.user_name || 'System');

  let techScore = t.tech_score_weightage;
  let commercialScore = t.commercial_score_weightage;

  if (techScore == null) {
    try {
      const lookup = await repo.getLookupByKey('TECHNICAL_SCORE_WEIGHTAGE');
      if (lookup) techScore = parseInt((lookup as any).description);
    } catch (e) {}
  }
  if (commercialScore == null) {
    try {
      const lookup = await repo.getLookupByKey('COMMERCIAL_SCORE_WEIGHTAGE');
      if (lookup) commercialScore = parseInt((lookup as any).description);
    } catch (e) {}
  }

  const templateApprovers = await repo.getBidApprovers(templateBidId);
  const committee = await repo.getAllCommitteeMembers();
  const committeeUserIds = new Set((committee as any[]).map(c => c.user_id));

  for (const appr of templateApprovers) {
    const a = appr as any;
    if (bidData.type === 'Tender' && committeeUserIds.has(a.user_id)) {
      continue;
    }
    await repo.insertBidApprover({
      bidrefno: newBidId,
      user_id: a.user_id,
      teamtype: a.teamtype,
      logged_id: loggedInUser.user_name || null,
    });
  }

  if (bidData.type === 'Tender') {
    for (const comm of committee) {
      await repo.insertBidApprover({
        bidrefno: newBidId,
        user_id: (comm as any).user_id,
        teamtype: 'Committee Team',
        logged_id: loggedInUser.user_name || null,
      });
    }
  }

  await repo.copyBidClausesFromTemplate(templateBidId, newBidId);
  await repo.copyBidRequirementsFromTemplate(templateBidId, newBidId);
  await repo.copyBidAttachmentsFromTemplate(templateBidId, newBidId);
  await repo.copyBidSuppliersFromTemplate(templateBidId, newBidId);

  await repo.updateDboBidTemplateFields(newBidId, {
    bid_style: t.bid_style,
    type: t.type,
    tech_score_weightage: techScore,
    commercial_score_weightage: commercialScore,
    paymentterms: t.paymentterms,
    shiptoaddress: t.shiptoaddress,
    billtoaddress: t.billtoaddress,
    notes_to_supplier: t.notes_to_supplier,
    negotiation_style: t.negotiation_style,
    outcome: t.outcome,
    price_precision: t.price_precision,
  });
}

export async function processNewBidTeam(bidRefNo: number, bidApprsList: string, bidTeamType: string) {
  if (!bidApprsList || bidApprsList === '') {
    throw { status: 400, message: "Approvers list is required" };
  }

  let cleanedList = bidApprsList;
  if (cleanedList.endsWith(',')) {
    cleanedList = cleanedList.substring(0, cleanedList.length - 1);
  }

  const userIdStrings = cleanedList.split(',').filter(s => s.trim() !== '');
  const userIds = userIdStrings.map(s => parseInt(s.trim()));

  const bid = await repo.getDboBidById(bidRefNo);
  if (!bid) {
    throw { status: 404, message: "Bid not found" };
  }
  const bidObj = bid as any;

  const existingApprovers = await repo.getApproversByUserIdsAndBid(userIds, bidRefNo);

  if (existingApprovers.length > 0) {
    for (const appr of existingApprovers) {
      const a = appr as any;
      if (a.teamtype && a.teamtype.toLowerCase() === bidTeamType.toLowerCase()) {
        return `Failure-${a.user_name_full} team member is already added under '${a.teamtype}'`;
      }
    }
  }

  for (const userId of userIds) {
    const isAdmin = await repo.checkUserHasAdminRole(userId);
    if (isAdmin) {
      return "Failure- user with superadmin or sysadmin role can't be added as team member";
    }

    const emailId = await repo.getUserEmailById(userId);
    if (emailId && bidObj.buyer_email && bidObj.buyer_email.toLowerCase() === emailId.toLowerCase()) {
      return "Failure- buyer of the bid can't be added as team member";
    }

    await repo.insertBidApprover({
      bidrefno: bidRefNo,
      user_id: userId,
      teamtype: bidTeamType,
    });

    const userDetails = await repo.getUserById(userId) as any;
    const userName = userDetails?.user_name_full || userDetails?.user_name || emailId || "";
    const orgData = await adminRepo.getOrgDetails();
    if (bidTeamType === "Technical Review Team") {
      eventBus.publish({
        eventType: EventTypes.TECHNICAL_SCORER_ASSIGNED,
        bidId: String(bidRefNo),
        bidNumber: bidObj.attribute_4 || "",
        bidTitle: bidObj.bid_title || "",
        scorerName: userName,
        receiverEmail: emailId || "",
        timestamp: new Date(),
        orgLogoPath: orgData.org_logo_path,
      });
    } else if (bidTeamType === "Technical Approve Team") {
      eventBus.publish({
        eventType: EventTypes.TECHNICAL_APPROVER_ASSIGNED,
        bidId: String(bidRefNo),
        bidNumber: bidObj.attribute_4 || "",
        bidTitle: bidObj.bid_title || "",
        approverName: userName,
        receiverEmail: emailId || "",
        timestamp: new Date(),
        orgLogoPath: orgData.org_logo_path,
      });
    } else if (bidTeamType === "Commercial Review Team") {
      eventBus.publish({
        eventType: EventTypes.COMMERCIAL_SCORER_ASSIGNED,
        bidId: String(bidRefNo),
        bidNumber: bidObj.attribute_4 || "",
        bidTitle: bidObj.bid_title || "",
        scorerName: userName,
        receiverEmail: emailId || "",
        timestamp: new Date(),
        orgLogoPath: orgData.org_logo_path,
      });
    } else if (bidTeamType === "Commercial Approve Team") {
      eventBus.publish({
        eventType: EventTypes.COMMERCIAL_APPROVER_ASSIGNED,
        bidId: String(bidRefNo),
        bidNumber: bidObj.attribute_4 || "",
        bidTitle: bidObj.bid_title || "",
        approverName: userName,
        receiverEmail: emailId || "",
        timestamp: new Date(),
        orgLogoPath: orgData.org_logo_path,
      });
    }
  }

  return "Successfully processed your request!";
}

export async function suggestEvaluationTeam(bidRefNo: number) {
  const bid = await repo.getDboBidById(bidRefNo);
  if (!bid) {
    throw { status: 404, message: "Bid not found" };
  }

  const bidObj = bid as any;
  const bidType = String(bidObj.type || "RFQ");
  const bidTypeUpper = bidType.toUpperCase();
  const statusUpper = String(bidObj.status || "").trim().toUpperCase();
  const isDraft = statusUpper === "DRAFT" || statusUpper.startsWith("DRAFT ");
  const isDraftRfp = statusUpper === "DRAFT RFP" || (isDraft && bidTypeUpper === "RFP");
  const isDraftTender = statusUpper === "DRAFT TENDER" || (isDraft && bidTypeUpper === "TENDER");

  if (!isDraftRfp && !isDraftTender) {
    throw {
      status: 400,
      message: "AI team suggestion is available only for Draft RFP or Draft Tender bids.",
    };
  }

  const requirements = await repo.getDboBidRequirements(bidRefNo);
  if (!requirements || requirements.length === 0) {
    throw {
      status: 400,
      message: "No evaluation criteria added",
    };
  }

  const teamTypes =
    bidTypeUpper === "TENDER"
      ? [
          "Technical Review Team",
          "Technical Approve Team",
          "Commercial Review Team",
          "Commercial Approve Team",
          "Committee Team",
        ]
      : ["Technical Review Team", "Commercial Review Team"];

  const requiredCounts: Record<string, number> = {
    "Technical Review Team": 1,
    "Commercial Review Team": 1,
    "Technical Approve Team": 1,
    "Commercial Approve Team": 1,
    "Committee Team": 3,
  };

  const approvers = await repo.getDboBidApprovers(bidRefNo);
  const existingCounts: Record<string, number> = {};
  for (const tt of teamTypes) {
    existingCounts[tt] = 0;
  }
  (approvers || []).forEach((a: any) => {
    const tt = a.teamtype || "";
    existingCounts[tt] = (existingCounts[tt] || 0) + 1;
  });

  const teamNeeds: Record<string, number> = {};
  for (const tt of teamTypes) {
    const required = requiredCounts[tt] ?? 1;
    const existing = existingCounts[tt] || 0;
    const missing = Math.max(0, required - existing);
    if (missing > 0) teamNeeds[tt] = missing;
  }

  if (Object.keys(teamNeeds).length === 0) {
    return {
      added: 0,
      skipped: 0,
      message: "Evaluation team already configured.",
      suggestions: {},
      errors: [],
    };
  }

  const usersResult = await getDb().execute(sql`
    SELECT 
      u.id, 
      u.name, 
      u.user_name, 
      u.email_id, 
      COALESCE(u.mobile_no, u.phone_no, '') as contact, 
      u.department_name, 
      r.role_name, 
      r.description as role_description, 
      r.role_type 
    FROM dbo.um_user_dtls u 
    LEFT JOIN dbo.um_user_roles_map_dtls urm ON u.id = urm.user_id 
    LEFT JOIN dbo.um_role_dtls r ON urm.role_id = r.id 
    WHERE u.user_status = 1 AND u.user_type = 0
  `);
  const usersRows = (usersResult as any).rows || [];

  const userMap = new Map<number, any>();
  for (const row of usersRows) {
    const userId = Number(row.id);
    if (!Number.isFinite(userId)) continue;
    if (!userMap.has(userId)) {
      userMap.set(userId, {
        id: userId,
        name: row.name,
        user_name: row.user_name,
        email_id: row.email_id,
        contact: row.contact,
        department_name: row.department_name,
        roles: []
      });
    }
    if (row.role_name) {
      userMap.get(userId).roles.push({
        role_name: row.role_name,
        role_description: row.role_description,
        role_type: row.role_type
      });
    }
  }

  const existingUserIds = new Set(
    (approvers || []).map((a: any) => String(a.user_id)),
  );
  const buyerEmail = String(bidObj.buyer_email || "").toLowerCase();

  const candidates = Array.from(userMap.values()).filter((u: any) => {
    if (!u.id) return false;
    if (existingUserIds.has(String(u.id))) return false;
    if (buyerEmail && String(u.email_id || "").toLowerCase() === buyerEmail) {
      return false;
    }

    // Exclude users with superadmin/sysadmin role - mirrors checkUserHasAdminRole
    const hasAdminRole = u.roles.some((r: any) => {
      const roleNameUpper = String(r.role_name || "").toUpperCase();
      const roleDescUpper = String(r.role_description || "").toUpperCase();
      return (
        roleNameUpper.includes("SUPERADMIN") ||
        roleDescUpper.includes("SUPERADMIN") ||
        roleNameUpper.includes("SYSADMIN") ||
        roleDescUpper.includes("SYSADMIN")
      );
    });
    if (hasAdminRole) return false;

    return true;
  });

  if (candidates.length === 0) {
    return {
      added: 0,
      skipped: 0,
      message: "No eligible users found for AI team suggestion.",
      suggestions: {},
      errors: [],
    };
  }

  const candidateIds = candidates
    .map((c: any) => Number(c.id))
    .filter((id: number) => Number.isFinite(id));
  let statsRows: any[] = [];

  if (candidateIds.length > 0) {
    const statsResult = await getDb().execute(sql`
      SELECT a.user_id, a.teamtype, COUNT(*)::int as cnt
      FROM dbo.supp_bid_approvers a
      JOIN dbo.supp_bid_dtls b ON b.id = a.bidrefno
      WHERE a.user_id IN (${sql.join(candidateIds.map((id) => sql`${id}`), sql`, `)})
        AND b.status NOT IN ('Deleted')
        AND UPPER(b.type) = ${bidTypeUpper}
      GROUP BY a.user_id, a.teamtype
    `);
    statsRows = (statsResult as any).rows || [];
  }

  const statsMap = new Map<number, Record<string, number>>();
  for (const row of statsRows) {
    const userId = Number(row.user_id);
    if (!Number.isFinite(userId)) continue;
    const teamCounts = statsMap.get(userId) || {};
    teamCounts[String(row.teamtype)] = Number(row.cnt || row.count || 0);
    statsMap.set(userId, teamCounts);
  }

  const candidatePayload = candidates.map((u: any) => {
    const id = Number(u.id);
    const teamCounts = statsMap.get(id) || {};
    const totalAssignments = Object.values(teamCounts).reduce(
      (sum, v) => sum + Number(v || 0),
      0,
    );
    return {
      id,
      name: u.name || u.user_name || u.email_id || `User ${id}`,
      user_name: u.user_name || "",
      email_id: u.email_id || "",
      contact: u.contact || "",
      department: u.department_name || "",
      roles: u.roles,
      teamCounts,
      totalAssignments,
    };
  });

  const lines = await repo.getDboBidLines(bidRefNo);
  const categories = Array.from(
    new Set((lines || []).map((l: any) => l.product_category).filter(Boolean)),
  );

  const scopeOfWork = (lines || []).map((l: any) => ({
    itemName: l.description || "",
    category: l.product_category || "",
  })).filter((item: any) => item.itemName || item.category);

  const suggestions = await bidAI.suggestEvaluationTeam({
    bidTitle: bidObj.bid_title || "",
    bidType: bidTypeUpper,
    categories,
    scopeOfWork,
    evaluationCriteria: (requirements || []).map((r: any) => ({
      category: r.category || "Technical",
      question: r.question || "",
      weight: parseInt(r.weight || "0", 10) || 0,
    })),
    teamNeeds,
    candidates: candidatePayload,
  });

  const result = {
    added: 0,
    skipped: 0,
    errors: [] as string[],
    suggestions,
  };

  const usedIds = new Set(existingUserIds);
  for (const teamType of Object.keys(teamNeeds)) {
    const needed = teamNeeds[teamType];
    const ids = suggestions?.[teamType] || [];
    let filled = 0;
    const roleErrors: string[] = [];

    for (const userId of ids) {
      if (filled >= needed) break;
      const userIdStr = String(userId);
      if (usedIds.has(userIdStr)) continue;

      const response = await processNewBidTeam(bidRefNo, userIdStr, teamType);
      if (typeof response === "string" && response.startsWith("Failure")) {
        // Rejected candidate (e.g. buyer, admin role, already added) - try
        // the next spare from `ids` instead of leaving the slot short.
        roleErrors.push(response.replace(/^Failure-?/, "").trim());
        continue;
      }

      result.added += 1;
      filled += 1;
      usedIds.add(userIdStr);
    }

    if (filled < needed) {
      // Fallback: Autofill remaining slots with eligible candidates
      const remainingCandidates = candidates
        .filter((c) => !usedIds.has(String(c.id)))
        .sort(() => Math.random() - 0.5);

      for (const candidate of remainingCandidates) {
        if (filled >= needed) break;
        const candidateIdStr = String(candidate.id);
        const response = await processNewBidTeam(bidRefNo, candidateIdStr, teamType);
        if (typeof response === 'string' && response.startsWith('Failure')) {
          continue;
        }

        result.added += 1;
        filled += 1;
        usedIds.add(candidateIdStr);
      }

      if (filled < needed) {
        result.skipped += needed - filled;
        result.errors.push(...roleErrors);
      }
    }
  }

  const messageParts: string[] = [];
  if (result.added > 0) messageParts.push(`Added ${result.added} member(s).`);
  if (result.skipped > 0) messageParts.push(`${result.skipped} skipped.`);
  if (result.errors.length > 0) {
    messageParts.push("Some members could not be added.");
  }

  return {
    ...result,
    message: messageParts.join(" ") || "No team members were added.",
  };
}


export async function publishDboBid(bidId: number, data?: any, reqUser?: any) {
  const bid = await repo.getDboBidDetailById(bidId);
  if (!bid) throw { status: 404, message: "Bid not found" };

  const endDate = (bid as any).enddate || (bid as any).end_date || (bid as any).closingDate;
  if (endDate) {
    if (!isDateNotPast(endDate)) {
      throw { status: 400, message: "Cannot publish a bid with a closing date in the past. Please update the closing date to a future date." };
    }
  }

  const bidType = (bid as any).type || "";

  const lines = await repo.getDboBidLines(bidId);
  if (!lines || lines.length === 0) {
    throw { status: 400, message: "Please add at least one scope of work line for the bid." };
  }

  const suppliers = await repo.getDboBidSuppliers(bidId);
  if (!suppliers || suppliers.length === 0) {
    throw { status: 400, message: "Please add at least one vendor to invite for quotations." };
  }
  const orgData = await adminRepo.getOrgDetails();
  if (bidType && !bidType.includes("RFQ")) {
    const requirements = await repo.getDboBidRequirements(bidId);
    if (!requirements || requirements.length === 0) {
      throw { status: 400, message: "Please add at least one requirement for technical evaluation!" };
    }

    let techExists = false;
    let finExists = false;
    let totalWeightage = 0;
    for (const req of requirements) {
      const cat = (req as any).category || "";
      if (cat !== "Financial" && cat !== "Finance") {
        techExists = true;
      }
      // if(cat === "Finance" || cat === "Commercial") {
      //   finExists = true;
      // }
      const w = parseInt((req as any).weight || "0", 10);
      if (!isNaN(w)) totalWeightage += w;
    }

    if (!techExists) {
      throw { status: 400, message: "Please add at least one technical requirement for technical evaluation!" };
    }
    // if (!finExists) {
    //   throw { status: 400, message: "Please add at least one financial requirement for commercial evaluation!" };
    // }

    if (totalWeightage !== 100) {
      throw { status: 400, message: "Please make sure weightage of the total Evaluation must be equal to 100." };
    }
    let techWeight = 0;
    let finWeight = 0;
    for (const req of requirements) {
      const cat = (req as any).category || "";

      if (cat === "Finance" || cat === "Commercial") {
        finWeight += parseInt((req as any).weight || "0", 10);
      } else {
        techWeight += parseInt((req as any).weight || "0", 10);
      }
    }
    await getDb().execute(sql`
      UPDATE dbo.supp_bid_dtls SET
        tech_score_weightage = ${techWeight},
        commercial_score_weightage = ${finWeight}
      WHERE id = ${bidId}
    `);

  }

  // For RFQ, evaluation team members and complex criteria are not required
  if (!bidType || !bidType.includes("RFQ")) {
    const approvers = await repo.getDboBidApprovers(bidId);
    if (!approvers || approvers.length === 0) {
      throw { status: 400, message: "Please add evaluation team members for the bid." };
    }

    let hasTechReview = false;
    let hasCommReview = false;
    let hasTechApprove = false;
    let hasCommApprove = false;
    let hasCommittee = false;
    let committeeCount = 0;

    for (const appr of approvers) {
      const tt = (appr as any).teamtype || "";
      if (tt === "Technical Review Team" || tt.includes("Techno")) hasTechReview = true;
      if (tt === "Commercial Review Team" || tt.includes("Techno")) hasCommReview = true;
      if ((tt === "Technical Approve Team" || tt.includes("Techno")) && bidType !== "RFP") hasTechApprove = true;
      if ((tt === "Commercial Approve Team" || tt.includes("Techno")) && bidType !== "RFP") hasCommApprove = true;
      if (tt === "Committee Team") {
        hasCommittee = true;
        committeeCount++;
      }
    }

    if (!hasTechReview) {
      throw { status: 400, message: "Please add at least one member in Technical Review Team." };
    }

    if (!hasCommReview && bidType && !bidType.includes("RFP")) {
      throw { status: 400, message: "Please add at least one member in Commercial Review Team." };
    }

    if (bidType === "Tender") {
      if (!hasTechApprove) {
        throw { status: 400, message: "Please add at least one member in Technical Approve Team." };
      }
      if (!hasCommApprove) {
        throw { status: 400, message: "Please add at least one member in Commercial Approve Team." };
      }
      if (!hasCommittee || committeeCount < 3) {
        throw { status: 400, message: "Please add at least three committee members." };
      }
    }

    if (bidType && !bidType.includes("RFP") && !hasTechApprove) {
      throw { status: 400, message: "Please add at least one member in Technical Approve Team." };
    }
  }

  if (!(bid as any).requestor) {
    throw { status: 400, message: "Please define requestor from Header tab." };
  }

  const b = bid as any;
  if (bidType === "Tender") {
    const { workflowService } = await import("../../services/workflowService");
    const { publishTaskAssignmentEvent } = await import("../../services/eventBus/publishTaskAssignment");
    const procurementRepo = await import("../procurement/procurement.repository");
    const adminService = await import("../administration/administration.service");

    const username =
      reqUser?.userName ||
      reqUser?.user_name ||
      reqUser?.username ||
      reqUser?.email_id ||
      reqUser?.email ||
      "system";
    const userDisplayName = reqUser?.name || reqUser?.userName || "System";

    let taskSubject = `Bid Publish Approval Request - ${b.bid_title || ""}`;
    if (taskSubject.length > 80) {
      taskSubject = taskSubject.substring(0, 80);
    }

    const { prAmount } = await repo.getBidPublishDerivedValues(bidId);
    const mainOrg = await adminService.getOrgDetails();
    const bidCurrency = String(b.currency || "USD").trim();
    let amountStr = "0";
    if (prAmount != null && !Number.isNaN(Number(prAmount))) {
      const mainCur = mainOrg?.currency ? String(mainOrg.currency).trim() : "";
      if (mainCur && bidCurrency && mainCur !== bidCurrency) {
        try {
          const ex = await procurementRepo.getExchangeRate(bidCurrency, mainCur);
          const rate =
            ex && (ex as any).conversion_rate != null ? Number((ex as any).conversion_rate) : NaN;
          if (!Number.isNaN(rate)) {
            amountStr = String(Number(prAmount) * rate);
          } else {
            amountStr = String(prAmount);
          }
        } catch {
          amountStr = String(prAmount);
        }
      } else {
        amountStr = String(prAmount);
      }
    }

    const processName = "Bid";
    const params: Record<string, unknown> = {
      subject: taskSubject,
      srmsRefNumber: String(bidId),
      status: "Pending Approval",
      startDate: Date.now(),
      createdBy: userDisplayName,
      organization: b.attribute_15 || reqUser?.organization_name || "",
      department: reqUser?.department_name || b.buyer_department || b.department_name || "",
      amount: amountStr,
      orgId: b.org_id
    };

    const checkApprList = await workflowService.getFirstStepApproversList(processName, params);
    if (!checkApprList || checkApprList.length === 0) {
      throw {
        status: 400,
        message: "Approver Hierarchy or Approval Flow is not defined for this request!",
      };
    }

    let taskId: string;
    try {
      taskId = await workflowService.startProcess(
        taskSubject,
        processName,
        String(bidId),
        params,
        username,
      );
    } catch (err: any) {
      if (err.status) throw err;
      throw { status: 400, message: err.message || "Failed to start approval workflow" };
    }

    const approversArr = await workflowService.getApproversList(processName, params);
    const approversList = approversArr.join(", ");

    const result = await repo.publishDboBidPendingApproval(bidId, data, {
      taskId,
      approversList,
      lastUpdatedBy: username,
    });

    const buyerName = b.buyer_name || b.buyerName || "";
    const approverName = approversArr[0];
    const approver = await getDb().execute(sql`select current_assignee from dbo.wf_step_instance where task_id=${taskId}`);
    const appUrl = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
    const apiKey = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

    const approvalLink = appUrl.rows[0].prop_value + `/approval-action?apikey=${encodeURIComponent(String(apiKey?.rows[0].prop_value))}&&module=${encodeURIComponent('Bid')}&&taskId=${encodeURIComponent(taskId)}&&email=${encodeURIComponent(String(approver.rows[0].current_assignee))}&&refnumber=${encodeURIComponent(bidId)}`;
    publishTaskAssignmentEvent({
      taskId,
      templateEventId: "BIDPUBLISH_APP",
      srmsRefNo: String(bidId),
      submittedBy: userDisplayName,
      department: String(reqUser?.department_name || b.department_name || ""),
      taskSub: `${bidType} - ${b.bid_title || ""} - ${buyerName}`,
      entityId: String(bidId),
      variables: {
        userName: approverName,
        bidNumber: (bid as any).attribute_4,
        orgLogoPath: orgData.org_logo_path,
        domain: reqUser?.domain
      },
    });

    return result;
  } else {
    const result = await repo.publishDboBid(bidId, data);
    // Notify Buyer
    // eventBus.publish({
    //   eventType: EventTypes.BID_PUBLISHED,
    //   bidId: String(bidId),
    //   bidNumber: (bid as any).attribute_4 || "",
    //   bidTitle: (bid as any).bid_title || "",
    //   receiverEmail: (bid as any).buyer_email || "",
    //   timestamp: new Date(),
    //   orgLogoPath: orgData.org_logo_path,
    // });

    // Notify Invited Vendors
    const invitedSupps = await repo.getDboBidSuppliers(bidId);
    for (const supp of invitedSupps) {
      const s = supp as any;
      if (s.supplier_contact_email) {
        eventBus.publish({
          eventType: EventTypes.NEW_BID_PUBLISH,
          bidId: String(bidId),
          bidNumber: (bid as any).attribute_4 || "",
          bidTitle: (bid as any).bid_title || "",
          receiverEmail: s.supplier_contact_email || "",
          supplierName: s.supplier_name || "",
          timestamp: new Date(),
          domain: reqUser?.domain,
          orgLogoPath: orgData.org_logo_path,
        });
      }
    }

    return result;
  }
}

export async function generateWorkflow(prompt: string) {
  if (!prompt) {
    throw { status: 400, message: "Prompt is required" };
  }
  return generateWorkflowFromText(prompt);
}

export async function getDboBidDetail(bidId: number) {
  return repo.getDboBidDetailById(bidId);
}

export async function getDboBidIdStatus(bidId: number) {
  return repo.getDboBidIdStatus(bidId);
}

/** Sync header currency onto all line items (matches create-bid behavior). */
export async function syncBidLineCurrency(bidId: number, currency: string) {
  if (!currency) return;
  await repo.updateBidLineCurrency(bidId, currency);
}

export async function updateDboBidHeader(bidId: number, data: any) {
  const updateData = { ...data };

  if (data.buyer_id) {
    try {
      const buyerUser = await repo.getUserById(parseInt(data.buyer_id));
      if (buyerUser) {
        updateData.buyer = data.buyer_id || String((buyerUser as any).id) || (buyerUser as any).email_id || null;
        updateData.buyer_name = (buyerUser as any).name || data.buyer_name || null;
        updateData.buyer_email = (buyerUser as any).email_id || null;
      }
    } catch (e) { }
  }

  if (data.requestor_id) {
    try {
      const requestorUser = await repo.getUserById(parseInt(data.requestor_id));
      if (requestorUser) {
        updateData.requestor = data.requestor_id || String((requestorUser as any).id) || (requestorUser as any).email_id || null;
        updateData.requestor_name = (requestorUser as any).name || data.requestor_name || null;
        updateData.requestor_email = (requestorUser as any).email_id || null;
        updateData.department_name = (requestorUser as any).department_name || null;
      }
    } catch (e) { }
  }

  if (data.delivery_location_id) {
    try {
      const locationObj = await repo.getLocationById(parseInt(data.delivery_location_id));
      if (locationObj) {
        updateData.delivertto_location_id = parseInt(data.delivery_location_id);
        updateData.delivertto_location_name = (locationObj as any).location_name || data.delivertto_location_name || null;
        updateData.shiptoaddress = (locationObj as any).shipto_address || null;
        updateData.billtoaddress = (locationObj as any).billto_address || null;
      }
    } catch (e) { }
  }

  if (data.type) {
    updateData.type = data.type;
    updateData.bid_style = data.type === 'Tender' ? 'Sealed' : 'Open';
    if (data.type !== 'Tender') {
      updateData.env_open_date = null;
    }
  }

  const currentBid = await repo.getDboBidById(bidId);
  if (currentBid && (currentBid as any).status === 'Published' && updateData.enddate) {
    const newEndDate = new Date(updateData.enddate);
    if (newEndDate < new Date()) {
      updateData.status = 'Closed';
    }
  }
  if (data.type && data.type !== currentBid?.type) {
    if (data.type === 'Tender' && (data.env_open_date === "" || data.env_open_date === null)) {
      throw { status: 400, message: "Envelope open date is required for tender bid." };
    }
    await repo.updateBidPrefixOnly(bidId, updateData.type, (currentBid as any).attribute_4);
  }

  return repo.updateDboBidHeader(bidId, updateData);
}

/** Next bid number for a type (same allocator as create-bid). */
export async function generateNextBidNumber(bidType: string) {
  return repo.generateBidNumber(bidType);
}

export async function saveAsTemplate(bidId: number, templateName: string, sessionUser: any) {
  const allBids = await repo.getDboBids();
  const duplicate = allBids.find((b: any) =>
    b.templateName && b.templateName.toLowerCase() === templateName.toLowerCase() && b.id !== bidId
  );
  if (duplicate) {
    throw new Error(`Template Name '${templateName}' Already Exist!`);
  }

  const userName = sessionUser?.user_name || sessionUser?.email_id || 'System';
  await repo.updateDboBidHeader(bidId, {
    template_name: templateName,
    last_updated_by: userName,
  });

  return { message: "Success" };
}

export async function getDboBidLines(bidId: number) {
  return repo.getDboBidLines(bidId);
}

// ----------------------------------------------------------------------------
// FMPI supplier visibility
// ----------------------------------------------------------------------------

/**
 * Computes and publishes the benchmark for every bid line that doesn't have a
 * published snapshot yet, so suppliers never see a half-filled sheet where only
 * the lines the buyer happened to open manually carry a price.
 *
 * Runs sequentially and detached from the request: a single line can take
 * several seconds (live scrape + model call), so the toggle must not block on
 * it. Failures are logged and skipped — a line without a snapshot simply shows
 * no benchmark to the supplier.
 */
async function backfillLineSnapshots(bidId: number, userName: string) {
  const lines = await repo.getDboBidLines(bidId);
  if (!lines.length) return;
  const existing = await fmpRepo.getSnapshotLineIds("BID", String(bidId));
  const pending = lines.filter((l: any) => !existing.has(String(l.id)) && (l.item_id || l.description));

  for (const line of pending as any[]) {
    try {
      const snapshot = await fmpService.getOrComputeSnapshot({
        itemId: line.item_id ? String(line.item_id) : `LINE_${line.id}`,
        itemName: line.description || "",
        itemDescription: line.description || null,
        // `product_category` on a bid line is the category *name* (text);
        // `product_category_id` is the numeric code the FMPI lookups want.
        categoryCode:
          line.product_category_id != null && Number.isFinite(Number(line.product_category_id))
            ? Number(line.product_category_id)
            : null,
        categoryName: line.product_category != null ? String(line.product_category) : null,
        currCode: line.currency || "INR",
        uom: line.uom || null,
        deliveryLocation: line.shiptoaddress || null,
        quantity: line.quantity != null ? Number(line.quantity) : null,
      });
      await fmpRepo.upsertSnapshot(
        { docType: "BID", docId: String(bidId), docLineId: line.id },
        snapshot as any,
        userName,
      );
    } catch (err: any) {
      console.error(`[BIDS] FMPI backfill failed for bid ${bidId} line ${line.id}:`, err?.message);
    }
  }
}

/**
 * Buyer switch controlling whether invited suppliers see the fair market price
 * and range on each line of this bid.
 */
export async function setFmpVisibility(bidIdInput: number | string, enabled: boolean, sessionUser?: any) {
  let bidId = Number(bidIdInput);
  if (!Number.isFinite(bidId) || bidId <= 0) {
    const bidObj = await repo.getDboBidByNumber(String(bidIdInput));
    if (!bidObj) throw { status: 404, message: "Bid not found" };
    bidId = bidObj.id;
  }

  const bid = await repo.getDboBidById(bidId);
  if (!bid) throw { status: 404, message: "Bid not found" };

  const userName = sessionUser?.user_name || sessionUser?.email_id || sessionUser?.name || "System";
  await repo.setBidFmpVisibility(bidId, enabled, userName);

  let pendingCount = 0;
  if (enabled) {
    const lines = await repo.getDboBidLines(bidId);
    const existing = await fmpRepo.getSnapshotLineIds("BID", String(bidId));
    pendingCount = lines.filter((l: any) => !existing.has(String(l.id)) && (l.item_id || l.description)).length;
    // Detached on purpose — see backfillLineSnapshots.
    void backfillLineSnapshots(bidId, userName);
  }

  return { success: true, showFmpToSupplier: enabled, pendingBenchmarks: pendingCount };
}

/** Supplier-facing projection of a published snapshot — price and range only. */
export interface SupplierFmpView {
  fairMarketPrice: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  currCode: string | null;
  confidenceScore: number;
  calculatedDate: unknown;
}

/**
 * Published benchmarks for a bid, as an invited supplier is allowed to see them.
 *
 * Kept as its own read rather than folded into the bid/response payloads: the
 * existing line reads are shared with the buyer's award screens, and this way
 * the visibility flag is the single gate. Returns `enabled: false` with no lines
 * when the buyer hasn't switched it on, so the number is never reachable from
 * the API regardless of what the client asks for.
 *
 * Keyed by *bid* line id (`supp_bid_line_dtls.id`) — response lines carry that
 * as `bid_line_id`, so both the invitation view and the quote sheet can look up
 * against the same map. Only price/range/confidence are exposed; the buyer's
 * reasoning and source list stay internal.
 */
export async function getSupplierFmpForBid(bidIdInput: number | string, supplierId: number) {
  let bidId = Number(bidIdInput);
  if (!Number.isFinite(bidId) || bidId <= 0) {
    const bidObj = await repo.getDboBidByNumber(String(bidIdInput));
    if (bidObj) bidId = bidObj.id;
  }

  if (Number.isFinite(bidId) && bidId > 0) {
    const invite = await repo.getSupplierBidInvite(bidId, supplierId);
    if (!invite) throw { status: 403, message: "You are not invited to this bid" };

    if (!(await repo.getBidFmpVisibility(bidId))) {
      return { enabled: false, lines: {} as Record<string, SupplierFmpView> };
    }

    const snapshots = await fmpRepo.getSnapshotsByDoc("BID", String(bidId));
    const lines: Record<string, SupplierFmpView> = {};
    for (const [lineId, snap] of Object.entries(snapshots)) {
      lines[lineId] = {
        fairMarketPrice: snap.fairMarketPrice ?? null,
        rangeMin: snap.rangeMin ?? null,
        rangeMax: snap.rangeMax ?? null,
        currCode: snap.currCode ?? null,
        confidenceScore: snap.confidenceScore ?? 0,
        calculatedDate: snap.calculatedDate ?? null,
      };
    }
    return { enabled: true, lines };
  }
  return { enabled: false, lines: {} as Record<string, SupplierFmpView> };
}

export async function addDboBidLine(bidId: number, data: any, user?: any) {
  if (data.currentprice === null || (data.currentprice != null && Number(data.currentprice) <= 0)) {
    throw { status: 400, message: "Please enter positive value in unit price." };
  }
  const line = await repo.addDboBidLine(bidId, data, user);
  await syncPublishedBidResponseLines(bidId, user);
  return line;
}

export async function updateDboBidLine(lineId: number, data: any, user?: any) {
  if (data.currentprice === null || (data.currentprice != null && Number(data.currentprice) <= 0)) {
    throw { status: 400, message: "Please enter positive value in unit price." };
  }
  const line = await repo.updateDboBidLineById(lineId, data, user);
  const bidId = Number((line as any)?.bidrefno);
  if (bidId) await syncPublishedBidResponseLines(bidId, user);
  return line;
}

export async function deleteDboBidLine(lineId: number) {
  const existing = await repo.getDboBidLine(lineId);
  const bidId = Number((existing as any)?.bidrefno);
  await repo.deleteDboBidLineById(lineId);
  if (bidId) await syncPublishedBidResponseLines(bidId);
}

export async function getDboBidSuppliers(bidId: number) {
  return repo.getDboBidSuppliers(bidId);
}

export async function getBidsBySupplierName(
  supplierName: string,
  supplierId?: number,
  respondedOnly?: boolean,
  invitationStatusFilter?: string,
) {
  return repo.getBidsBySupplierName(supplierName, supplierId, respondedOnly, invitationStatusFilter);
}

export async function getSuppliersNotResponded() {
  return repo.getSuppliersNotResponded();
}

export async function getSuppliersNeverAcknowledged() {
  return repo.getSuppliersNeverAcknowledged();
}

export async function getBidAckDetails(bidId: number) {
  return repo.getBidAckDetails(bidId);
}

export async function getBidResponseDetails(bidId: number) {
  return repo.getBidResponseDetails(bidId);
}

export async function addDboBidSupplier(bidId: number, data: any, user?: any) {
  return repo.addDboBidSupplier(bidId, data, user);
}

export async function deleteDboBidSupplier(suppId: number) {
  return repo.deleteDboBidSupplierById(suppId);
}

export async function getDboBidRequirements(bidId: number) {
  return repo.getDboBidRequirements(bidId);
}

export async function addDboBidRequirement(bidId: number, data: any, user?: any) {
  return repo.addDboBidRequirement(bidId, data, user);
}

export async function updateDboBidRequirement(reqId: number, data: any, user?: any) {
  return repo.updateDboBidRequirementById(reqId, data, user);
}

export async function deleteDboBidRequirement(reqId: number) {
  return repo.deleteDboBidRequirementById(reqId);
}

/**
 * Apply a user-approved set of reconciled (regenerated) evaluation criteria actions.
 * - "new": insert a new AI-authored question
 * - "update": update the existing question in place (origin/created_by preserved)
 * - "remove": delete the existing question
 * - "keep": no-op
 * Only the actions passed in are applied (selective approval from the preview).
 */
export async function applyReconciledRequirements(
  bidId: number,
  actions: any[],
  user?: any,
) {
  const summary = { created: 0, updated: 0, removed: 0 };

  for (const action of actions || []) {
    const lov =
      action.qvtype === "Dropdown" &&
      Array.isArray(action.lovOptions) &&
      action.lovOptions.length > 0
        ? action.lovOptions.join(",")
        : null;

    if (action.action === "new") {
      await repo.addDboBidRequirement(
        bidId,
        {
          category: action.category,
          question: action.question,
          qvoption: action.qvoption || "Required",
          qvtype: action.qvtype || "Text",
          weight: String(action.weight || 1),
          target: action.value ?? action.target ?? null,
          lov,
          createdBy: repo.AI_REQUIREMENT_AUTHOR,
        },
        user,
      );
      summary.created += 1;
    } else if (action.action === "update" && action.id != null) {
      await repo.updateDboBidRequirementById(
        Number(action.id),
        {
          category: action.category,
          question: action.question,
          qvtype: action.qvtype || "Text",
          weight: String(action.weight || 1),
          target: action.value ?? action.target ?? null,
          lov,
        },
        user,
      );
      summary.updated += 1;
    } else if (action.action === "remove" && action.id != null) {
      await repo.deleteDboBidRequirementById(Number(action.id));
      summary.removed += 1;
    }
  }

  return summary;
}

export async function getDboBidClauses(bidId: number) {
  return repo.getDboBidClauses(bidId);
}

export async function addDboBidClause(bidId: number, data: any, user?: any) {
  return repo.addDboBidClause(bidId, data, user);
}

export async function deleteDboBidClause(clauseId: number) {
  return repo.deleteDboBidClauseById(clauseId);
}

export async function getDboBidApprovers(bidId: number) {
  return repo.getDboBidApprovers(bidId);
}

export async function deleteDboBidApprover(approverId: number) {
  return repo.deleteDboBidApproverById(approverId);
}

export async function getDboBidAttachments(bidId: number) {
  return repo.getDboBidAttachments(bidId);
}

export async function addDboBidAttachment(bidId: number, data: any, user?: any) {
  return repo.addDboBidAttachment(bidId, data, user);
}

export async function deleteDboBidAttachment(attachId: number) {
  return repo.deleteDboBidAttachmentById(attachId);
}

export async function deleteDboBid(bidId: number) {
  return repo.deleteDboBidById(bidId);
}

export async function getApprovedSuppliersList(page: number, limit: number, search: string, category: string) {
  return repo.getApprovedSuppliersList(page, limit, search, category);
}

export async function getVendorInvitationStats(minInvitations: number, limit: number) {
  return repo.getVendorInvitationStats(minInvitations, limit);
}

export async function getVendorAwardStats(minAwards: number, limit: number) {
  return repo.getVendorAwardStats(minAwards, limit);
}

async function verifyResponseOwnership(responseId: string, supplierId: number | string) {
  const response = await repo.getBidResponseById(responseId);
  if (!response) throw { status: 404, message: "Bid response not found" };
  if (String((response as any).supplier_id) !== String(supplierId)) throw { status: 403, message: "Access denied: this response does not belong to you" };
  return response;
}

export async function getBidResponseDetail(responseId: string, supplierId: number | string) {
  const response = await verifyResponseOwnership(responseId, supplierId);
  const requirements = await repo.getBidResponseRequirements(responseId);
  const lines = await repo.getBidResponseLines(responseId);
  return { response, requirements, lines };
}

export async function getBidResponseDetailForBuyer(responseId: string) {
  const response = await repo.getBidResponseById(responseId);
  if (!response) throw { status: 404, message: "Bid response not found" };
  const requirements = await repo.getBidResponseRequirements(responseId);
  const lines = await repo.getBidResponseLines(responseId);
  const supplierId = (response as any).supplier_id;
  const bidId = (response as any).bidrefno;
  const attachments = await repo.getSupplierResponseAttachments(bidId, Number(supplierId), responseId);
  return { response, requirements, lines, attachments };
}

export async function saveBidResponseRequirement(responseId: string, reqId: number, data: { response?: string; remarks?: string }, sessionUser?: any) {
  await verifyResponseOwnership(responseId, sessionUser?.supplierId);
  const updatedBy = sessionUser?.displayName || sessionUser?.username || "system";
  await repo.updateBidResponseRequirement(reqId, data, updatedBy);
  return { success: true };
}

export async function saveBidResponseLine(responseId: string, lineId: number, data: { bidprice?: number; discprice?: number; promised_date?: string, tax_code?: string | null, rate?: number | null }, sessionUser?: any) {
  await verifyResponseOwnership(responseId, sessionUser?.supplierId);
  if (data.bidprice != null && Number(data.bidprice) < 0) {
    throw { status: 400, message: "Please enter positive value in unit price." };
  }
  if (data.discprice != null && Number(data.discprice) < 0) {
    throw { status: 400, message: "Please enter positive value in discount price." };
  }
  if (data.tax_code != null && Number(data.rate) < 0) {
    throw { status: 400, message: "Please enter positive value in tax rate." };
  }
  if (
    data.bidprice != null &&
    data.discprice != null &&
    Number(data.discprice) > Number(data.bidprice)
  ) {
    throw { status: 400, message: "Discount unit price cannot exceed unit price." };
  }
  const updatedBy = sessionUser?.displayName || sessionUser?.username || "system";
  await repo.updateBidResponseLine(lineId, data, updatedBy);
  return { success: true };
}


export async function updateResponseTaxIncluded(responseId: string, data: any, sessionUser?: any) {
  await verifyResponseOwnership(responseId, sessionUser?.supplierId);
  const updatedBy = sessionUser?.displayName || sessionUser?.username || "system";
  const response = await repo.getBidResponseById(responseId);
  const responseLines = await repo.getBidResponseLines(responseId);
  if ((response as any).tax_included !== data.tax_included) {
    for (const line of responseLines) {
      await getDb().execute(sql`update dbo.supp_bid_response_line_dtls 
        set bidprice = null, discprice = null, rate = null, tax_code = null where id = ${line.id}`);
    }
  }
  await repo.updateBidResponseTaxIncluded(responseId, data, updatedBy);
  return { success: true };
}

export async function saveBidResponseTotals(responseId: string, data: any, sessionUser?: any) {
  await verifyResponseOwnership(responseId, sessionUser?.supplierId);
  const updatedBy = sessionUser?.displayName || sessionUser?.username || "system";
  await repo.updateBidResponseTotals(responseId, data, updatedBy);
  return { success: true };
}

export async function submitBidResponse(responseId: string, body: { notes?: string; comments?: string; bondReason?: string }, sessionUser?: any) {
  const supplierId = sessionUser?.supplierId;
  const resp = await verifyResponseOwnership(responseId, supplierId) as any;
  const updatedBy = sessionUser?.displayName || sessionUser?.username || "system";

  const bid = await repo.getBidHeaderById(resp.bidrefno);
  if (!bid) throw { status: 400, message: "Invalid bid id" };

  const now = new Date();
  if (resp.bidenddate && now > new Date(resp.bidenddate)) {
    throw { status: 400, message: "Bid is closed" };
  }

  const lines = await repo.getBidResponseLines(responseId) as any[];
  const requirements = await repo.getBidResponseRequirements(responseId) as any[];

  if (lines.length > 0) {
    const firstCurrency = lines[0].currency || "";

    for (const line of lines) {
      if (line.bidprice == null || parseFloat(line.bidprice) < 0) {
        throw { status: 400, message: "Please enter positive value in unit price." };
      }
      if (!line.promised_date) {
        throw { status: 400, message: "Please enter promise date for all line items." };
      }
      if (now > new Date(line.promised_date)) {
        throw { status: 400, message: "Please enter promise date after current date." };
      }
      if (line.currency && line.currency !== firstCurrency) {
        throw { status: 400, message: "Please choose same currency for all lines." };
      }
    }
  }

  const bidType = (bid as any).type || resp.bidtype || "";
  if (bidType && !bidType.includes("RFQ")) {
    for (const req of requirements) {
      if (req.qvoption === "Required" && (!req.response || req.response.trim() === "")) {
        throw { status: 400, message: "Some of the requirements which are mandatory are not answered. Please select technical response and answer." };
      }
    }
  }

  let totalAmount = 0;
  let discountAmount = 0;
  const taxAmount = Number(resp.tax_amount) || 0;
  const bidCurrency = (bid as any).currency || "";
  for (const line of lines) {
    const qty = parseFloat(line.quantity) || 0;
    const lineCurrency = line.currency || "";
    if (!lineCurrency || lineCurrency === bidCurrency) {
      if (line.bidprice != null) totalAmount += parseFloat(line.bidprice) * qty;
      if (line.discprice != null) discountAmount += Math.abs(parseFloat(line.discprice)) * qty;
    }
  }
  const grossTotal = (totalAmount - discountAmount) + taxAmount;

  function numberToWords(num: number): string {
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
      "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    if (num === 0) return "Zero";
    if (num < 0) return "Minus " + numberToWords(-num);
    let words = "";
    if (Math.floor(num / 10000000) > 0) { words += numberToWords(Math.floor(num / 10000000)) + " Crore "; num %= 10000000; }
    if (Math.floor(num / 100000) > 0) { words += numberToWords(Math.floor(num / 100000)) + " Lakh "; num %= 100000; }
    if (Math.floor(num / 1000) > 0) { words += numberToWords(Math.floor(num / 1000)) + " Thousand "; num %= 1000; }
    if (Math.floor(num / 100) > 0) { words += numberToWords(Math.floor(num / 100)) + " Hundred "; num %= 100; }
    if (num > 0) { if (num < 20) words += ones[num]; else { words += tens[Math.floor(num / 10)]; if (num % 10 > 0) words += " " + ones[num % 10]; } }
    return words.trim();
  }

  const amountInWords = numberToWords(Math.round(grossTotal));

  let supplierSite = "";
  let supplierName = "";
  let supplierContact = "";
  let supplierContactNo = "";
  let siteId: number | undefined;

  const bidSupplier = await repo.getBidSupplierByStatusList(Number(supplierId), resp.bidrefno, ["Acknowledged", "Submitted", "Invited"]) as any;

  if (bidSupplier) {
    supplierName = bidSupplier.supplier_name || "";
    supplierContact = bidSupplier.supplier_contact || "";
    supplierContactNo = bidSupplier.supplier_contact_no || "";

    if (bidSupplier.status !== "Submitted") {
      await repo.updateBidSupplierStatus(bidSupplier.id, "Submitted");
      try {
        await repo.updateBidAckStatus(Number(supplierId), resp.bidrefno, "Submitted");
      } catch (e) {}
    }
  }

  const supp = await repo.getSupplierOrgById(Number(supplierId)) as any;
  if (supp) {
    const sites = await repo.getSupplierSites(Number(supplierId)) as any[];
    if (sites && sites.length > 0) {
      const site = sites[0];
      siteId = site.id;
      supplierSite = `${site.sitename || ""}-${site.country || ""}-${site.city || ""}`;
    }
  }

  await repo.submitBidResponse(responseId, updatedBy, {
    notes: body.notes || "",
    amtcomments: body.comments || "",
    bidtotal: totalAmount,
    biddisc: discountAmount,
    grosstotal: grossTotal,
    amount_in_words: amountInWords,
    supplier_site: supplierSite,
    supplier_name: supplierName || (supp?.company_name || ""),
    supplier_contact: supplierContact,
    supplier_contact_no: supplierContactNo,
    site_id: siteId,
  });

  await repo.updateBidResponseCount(resp.bidrefno);
  const orgData = await adminRepo.getOrgDetails();
  // Notify Buyer/Requestor
  if ((bid as any).status === "Negotiation") {
    eventBus.publish({
      eventType: EventTypes.NEGOTIATION_RESPONSE_SUBMITTED,
      bidId: String(resp.bidrefno),
      bidNumber: (bid as any).attribute_4 || "",
      bidTitle: (bid as any).bid_title || "",
      vendorName: supplierName || (supp?.company_name || ""),
      requestorName: (bid as any).buyer_name || "",
      receiverEmail: (bid as any).buyer_email || "",
      timestamp: new Date(),
      orgLogoPath: orgData.org_logo_path,
    });
  } else {
    eventBus.publish({
      eventType: EventTypes.VENDOR_RESPONSE_SUBMITTED,
      bidId: String(resp.bidrefno),
      bidNumber: (bid as any).attribute_4 || "",
      bidTitle: (bid as any).bid_title || "",
      vendorName: supplierName || (supp?.company_name || ""),
      receiverEmail: (bid as any).buyer_email || "",
      timestamp: new Date(),
      orgLogoPath: orgData.org_logo_path,
    });
  }

  return { success: true, message: "Bid Response Submitted Successfully" };
}

export async function getSupplierResponseAttachments(responseId: string, supplierId: number | string) {
  const response = await verifyResponseOwnership(responseId, supplierId);
  const bidId = (response as any).bidrefno;
  return repo.getSupplierResponseAttachments(bidId, Number(supplierId), responseId);
}

export async function addSupplierResponseAttachment(responseId: string, supplierId: number | string, data: any, user?: any) {
  const response = await verifyResponseOwnership(responseId, supplierId);
  if ((response as any).status === "Submitted") throw { status: 400, message: "Cannot add attachments to a submitted response" };
  const bidId = (response as any).bidrefno;
  data.response_id = String(responseId);
  return repo.addSupplierResponseAttachment(bidId, Number(supplierId), data, user);
}

export async function deleteSupplierResponseAttachment(responseId: string, attachId: number, supplierId: number | string) {
  await verifyResponseOwnership(responseId, supplierId);
  return repo.deleteSupplierResponseAttachment(attachId, Number(supplierId));
}

export async function getBidResponseAttachmentForBuyer(attachId: number) {
  const att = await repo.getSupplierResponseAttachmentById(attachId);
  if (!att) throw { status: 404, message: "Attachment not found" };
  return att;
}

export async function getSupplierResponseAttachmentById(attachId: number, supplierId: number | string) {
  const att = await repo.getSupplierResponseAttachmentById(attachId);
  if (!att) throw { status: 404, message: "Attachment not found" };
  if (String((att as any).supplier_id) !== String(supplierId)) throw { status: 403, message: "Access denied" };
  return att;
}

export async function checkAndOpenEnvelope(bidId: number, sessionUser: any) {
  const bid = await repo.getDboBidById(bidId) as any;
  if (!bid) return null;
  const bidApprovers = await repo.getBidApprovers(bidId);
  const orgData = await adminRepo.getOrgDetails();

  if (bid.type === 'Tender' && bid.env_open_date && bid.env_opened !== 'Y') {
    const envOpenDate = new Date(bid.env_open_date);
    const loggedApprovers = await getDb().execute(sql`SELECT COUNT(*) as count FROM dbo.supp_bid_approvers WHERE bidrefno = ${bidId} AND teamtype = 'Committee Team' AND logged_id = 'Y'`);
    if (Number(loggedApprovers.rows[0].count) >= 3) {
      await repo.markEnvelopeOpened(bidId);
      eventBus.publish({
        eventType: EventTypes.TENDER_ENVELOPE_OPENED,
        bidId: String(bidId),
        bidNumber: bid.attribute_4 || "",
        bidTitle: bid.bid_title || "",
        requestorName: bid.buyer_name || "",
        receiverEmail: bid.buyer_email || "",
        timestamp: new Date(),
        orgLogoPath: orgData.org_logo_path,
      });
      return true;
    }
    if (envOpenDate <= new Date() && bid.bid_style === 'Open') {
      await repo.markEnvelopeOpened(bidId);
      eventBus.publish({
        eventType: EventTypes.TENDER_ENVELOPE_OPENED,
        bidId: String(bidId),
        bidNumber: bid.attribute_4 || "",
        bidTitle: bid.bid_title || "",
        requestorName: bid.buyer_name || "",
        receiverEmail: bid.buyer_email || "",
        timestamp: new Date(),
        orgLogoPath: orgData.org_logo_path,
      });
      return true;
    }
  }
  return false;
}

export async function openEnvelope(bidId: number, sessionUser: any) {
  const bid = await repo.getDboBidById(bidId) as any;
  if (!bid) return null;
  const bidApprovers = await repo.getBidApprovers(bidId) as any[];

  if (bid.type === 'Tender' && bid.env_open_date && bid.env_opened !== 'Y') {
    const envOpenDate = new Date(bid.env_open_date);
    if (envOpenDate <= new Date() && bid.bid_style === 'Sealed') {
      if (bidApprovers.length > 0) {
        const identifiers = new Set<string>();
        const addId = (value: unknown) => {
          const text = String(value || "").trim().toLowerCase();
          if (text) identifiers.add(text);
        };
        addId(sessionUser?.id);
        addId(sessionUser?.userId);
        addId(sessionUser?.email);
        addId(sessionUser?.email_id);
        addId(sessionUser?.userName);
        addId(sessionUser?.user_name);

        const userId = Number(sessionUser?.id || sessionUser?.userId || 0);
        if (userId) {
          try {
            const { getUserDetails } = await import("../common/common.repository");
            const userDetails = await getUserDetails(String(userId));
            addId(userDetails?.user_name);
            addId(userDetails?.email_id);
            addId(userDetails?.id);
          } catch {
            // optional enrichment
          }
        }

        for (const approver of bidApprovers) {
          if (approver.teamtype !== 'Committee Team') continue;

          const approverUserId = String(approver.user_id || "").trim();
          const sessionIds = [
            String(sessionUser?.id || "").trim(),
            String(sessionUser?.userId || "").trim(),
          ].filter(Boolean);
          const idMatch = approverUserId && sessionIds.includes(approverUserId);

          const approverKeys = [
            approver.login_id,
            approver.email_id,
            approver.user_name_full,
          ]
            .map((value) => String(value || "").trim().toLowerCase())
            .filter(Boolean);
          const identifierMatch = approverKeys.some((key) => identifiers.has(key));

          if (idMatch || identifierMatch) {
            const committeeApprovers = bidApprovers.filter(a => a.teamtype === 'Committee Team');
            if (committeeApprovers.length > 0) {
              for (const approver of committeeApprovers) {
                if (String(approver.user_id) === String(sessionUser.id) || String(approver.user_id) === String(sessionUser.userId)) {
                  await getDb().execute(sql`UPDATE dbo.supp_bid_approvers
                                            SET logged_id = 'Y'
                                            WHERE id = ${approver.id}`);
                  approver.logged_id = 'Y';

                  const allOpened = committeeApprovers.every(a => a.logged_id === 'Y');
                  if (allOpened) {
                    await repo.markEnvelopeOpened(bidId);
                    const orgData = await adminRepo.getOrgDetails();
                    const reviewApprovers = bidApprovers.filter(a => a.teamtype === 'Technical Review Team');
                    for (const reviewer of reviewApprovers) {
                      const userDetails = await repo.getUserById(reviewer?.user_id) as any;
                      eventBus.publish({
                        eventType: EventTypes.TECHNICAL_SCORER_ASSIGNED,
                        bidId: String(bidId),
                        bidNumber: bid.attribute_4 || "",
                        bidTitle: bid.bid_title || "",
                        scorerName: userDetails?.name || "",
                        receiverEmail: userDetails?.email_id || "",
                        timestamp: new Date(),
                        domain: sessionUser?.domain,
                        orgLogoPath: orgData.org_logo_path,
                      });
                    }
                  }
                  return true;
                }
              }
            }
          }
        }
      }
    }
  }
  return false;
}

export async function getBidEvaluationData(bidId: number, scoredByIdentifiers?: string[]) {
  return repo.getBidEvaluationData(bidId, scoredByIdentifiers);
}

export async function getTechScoreStatus(bidId: number, userId: number) {
  const reviewApprover = await repo.getApproverStatus(bidId, userId, "Technical Review Team");
  const approveApprover = await repo.getApproverStatus(bidId, userId, "Technical Approve Team");
  const bidStatus = (await repo.getTechScoreApprovalStatus(bidId)) as any;

  const userTeams: string[] = [];
  if (reviewApprover) userTeams.push("Technical Review Team");
  if (approveApprover) userTeams.push("Technical Approve Team");

  return {
    submitted: (reviewApprover as any)?.score_submitted === "Y",
    approved: bidStatus?.techscoreapproved === "Y",
    techScoreComplete: bidStatus?.tech_score_complete === "Y",
    userTeams,
  };
}

export async function getCommScoreStatus(bidId: number, userId: number) {
  const reviewApprover = await repo.getApproverStatus(bidId, userId, "Commercial Review Team");
  const approveApprover = await repo.getApproverStatus(bidId, userId, "Commercial Approve Team");
  const bidStatus = (await repo.getCommScoreApprovalStatus(bidId)) as any;

  const userTeams: string[] = [];
  if (reviewApprover) userTeams.push("Commercial Review Team");
  if (approveApprover) userTeams.push("Commercial Approve Team");

  return {
    submitted: (reviewApprover as any)?.score_submitted === "Y",
    approved: bidStatus?.finscoreapproved === "Y",
    commScoreComplete: bidStatus?.fin_score_complete === "Y",
    userTeams,
  };
}

export async function getBidTasks(userId: number, isSuperAdmin: boolean = false) {
  return repo.getBidTasks(userId, isSuperAdmin);
}

export async function updateResponseScore(responseId: string, data: any) {
  return repo.updateResponseScore(responseId, data);
}

export async function getResponsesByBidNo(bidId: number) {
  return repo.getResponsesForBid(bidId);
}

export async function upsertRequirementScore(data: any) {
  return repo.upsertRequirementScore(data);
}

export async function updateAwardedLineQuantity(lineId: number, quantity: string, lastModifiedBy: string) {
  return repo.updateAwardedLineQuantity(lineId, quantity, lastModifiedBy);
}

export async function getUserScoresForResponse(bidRespId: string, scoredBy: string | string[]) {
  return repo.getUserScoresForResponse(bidRespId, scoredBy);
}

export async function updateBidReqScore(respReqId: number, score: string, userId: string, userName: string, sessionUserId?: number) {
  if (!score || score.trim() === "") throw new Error("Score value is required");
  const numScore = parseFloat(score);
  if (isNaN(numScore)) throw new Error("Only integers to be entered in values");
  if (numScore < 0) throw new Error("Score cannot be negative");

  const respReqObj = await repo.getRequirementById(respReqId);
  if (!respReqObj) throw new Error("Requirement not found");

  const req: any = respReqObj;

  const maxWeight = parseFloat(req.weight) || 0;
  if (maxWeight > 0 && numScore > maxWeight) {
    throw new Error(`Score cannot exceed the weightage (${maxWeight})`);
  }

  const response = await repo.getResponseById(req.bid_resp_id) as any;
  if (!response) throw new Error("Response not found");

  if (sessionUserId) {
    const authorized = await repo.isUserAuthorizedForScoring(response.bidrefno, sessionUserId);
    if (!authorized) throw new Error("Not authorized to perform the action");
  }

  await repo.upsertUserScore({
    reqId: respReqId,
    bidRespId: req.bid_resp_id,
    score,
    scoredBy: userId,
    scoredByName: userName,
    category: req.category || "",
    question: req.question || "",
    weight: req.weight || "0",
    qvoption: req.qvoption || "",
    qvtype: req.qvtype || "",
    response: req.response || "",
    remarks: req.remarks || "",
    knockoutscore: req.knockoutscore || "",
    scoringmethod: req.scoringmethod || "",
  });

  await repo.setAverageScoreForRequirement(respReqId);

  const allReqs = await repo.getAllRequirementsForResponse(req.bid_resp_id) as any[];
  const updatedResponseObj = await repo.getResponseById(String(req.bid_resp_id)) as any;
  const { totalScore, finScore, totalTechAndFinScore, commercialScore } = computeResponseScoreTotals(
    allReqs,
    updatedResponseObj?.attribute_1,
  );

  await repo.updateResponseTotals(String(req.bid_resp_id), totalScore, finScore, totalTechAndFinScore, commercialScore);

  return { totalScore, finScore, totalTechAndFinScore };
}

export async function updateCommercialPriceScore(respId: string, score: string, userId: string, userName: string, sessionUserId?: number, remarks?: string) {
  if (!score || score.trim() === "") throw new Error("Score value is required");
  const numScore = parseFloat(score);
  if (isNaN(numScore)) throw new Error("Only integers to be entered in values");
  if (numScore < 0) throw new Error("Score cannot be negative");

  const respObj = await repo.getResponseById(respId);
  if (!respObj) throw new Error("Response not found");
  let maxWeight = 50;
  const allReqs = await repo.getAllRequirementsForResponse(respId) as any[];
  const commercialCategories = ["Finance", "Financial"];

  const isFinancialCriteriaExists = allReqs.some(r => commercialCategories.includes(r.category));
  if (!isFinancialCriteriaExists) {
    maxWeight = 100;
  }

  if (maxWeight > 0 && numScore > maxWeight) {
    throw new Error(`Score cannot exceed the weightage (${maxWeight})`);
  }

  if (sessionUserId) {
    const authorized = await repo.isUserAuthorizedForScoring(Number(respObj.bidrefno), sessionUserId);
    if (!authorized) throw new Error("Not authorized to perform the action");
  }

  await repo.upsertUserScore({
    reqId: 0,
    bidRespId: String(respObj.id),
    score,
    comments: remarks || "",
    scoredBy: userId,
    scoredByName: userName,
    category: "Commercial",
    question: "Commercial Price Score",
    weight: String(maxWeight),
    qvoption: "",
    qvtype: "Number",
    response: "",
    remarks: remarks || "",
    knockoutscore: "",
    scoringmethod: "Manual",
  });

  await repo.setAverageCommercialScore(String(respObj.id));

  const updatedReqs = await repo.getAllRequirementsForResponse(respId) as any[];
  const updatedRespObj = await repo.getResponseById(String(respObj.id)) as any;
  const { totalScore, finScore, totalTechAndFinScore, commercialScore } = computeResponseScoreTotals(
    updatedReqs,
    updatedRespObj?.attribute_1,
  );

  await repo.updateResponseTotals(String(respObj.id), totalScore, finScore, totalTechAndFinScore, commercialScore);

  return { totalScore, finScore, totalTechAndFinScore, commercialScore };
}

export async function updateBidReqComments(respReqId: number, comments: string, userId: string, userName: string, sessionUserId?: number) {
  if (!comments || comments.trim() === "") throw new Error("Comments are required");

  const respReqObj = await repo.getRequirementById(respReqId);
  if (!respReqObj) throw new Error("Requirement not found");

  const req: any = respReqObj;

  const response = await repo.getResponseById(req.bid_resp_id) as any;
  if (!response) throw new Error("Response not found");

  if (sessionUserId) {
    const authorized = await repo.isUserAuthorizedForScoring(response.bidrefno, sessionUserId);
    if (!authorized) throw new Error("Not authorized to perform the action");
  }

  await repo.upsertUserScore({
    reqId: respReqId,
    bidRespId: req.bid_resp_id,
    comments,
    scoredBy: userId,
    scoredByName: userName,
    category: req.category || "",
    question: req.question || "",
    weight: req.weight || "0",
    qvoption: req.qvoption || "",
    qvtype: req.qvtype || "",
    response: req.response || "",
    remarks: req.remarks || "",
    knockoutscore: req.knockoutscore || "",
    scoringmethod: req.scoringmethod || "",
  });


  return "Success";
}

export async function submitTechScore(bidId: number, sessionUserId: number, reqUser?: any) {
  const responseIds = await repo.getSubmittedResponseIds(bidId);

  for (const respId of responseIds) {
    const allReqs = await repo.getAllRequirementsForResponse(String(respId)) as any[];

    for (const req of allReqs) {
      await repo.setAverageScoreForRequirement(req.id);
    }

    const updatedReqs = await repo.getAllRequirementsForResponse(String(respId)) as any[];
    const updatedResponseObj = await repo.getResponseById(String(respId)) as any;
    const { totalScore, finScore, totalTechAndFinScore, commercialScore } = computeResponseScoreTotals(
      updatedReqs,
      updatedResponseObj?.attribute_1,
    );

    await repo.updateResponseTotals(String(respId), totalScore, finScore, totalTechAndFinScore, commercialScore);
  }

  for (const respId of responseIds) {
    const resp = (await repo.getResponseById(String(respId))) as any;
    if (!resp?.total_score || resp.total_score === "") {
      return { status: "failure", message: "Not all responses are scored. Please score all before submitting." };
    }
  }

  const user = await repo.getUserById(sessionUserId) as any;
  const loggedInUser = user?.user_name || "";

  const bidObj = await repo.getDboBidById(bidId) as any;

  const bidScoringFromAll = await repo.getBidScoringFromAll(bidId);
  const allApprovers = await repo.getAllTechReviewApprovers(bidId) as any[];

  if (bidScoringFromAll) {
    await repo.markScoreSubmitted(bidId, sessionUserId, "Technical Review Team");

    let allSubmitted = true;
    for (const appr of allApprovers) {
      const isCurrentUser = appr.user_id === sessionUserId;
      const submitted = isCurrentUser ? "Y" : (appr.score_submitted || "");
      if (!submitted || submitted === "" || submitted === "N") {
        allSubmitted = false;
      }
    }

    if (allSubmitted) {
      await repo.setTechScoreComplete(bidId, loggedInUser);
    } else {
      await repo.updateBidLastUpdated(bidId, loggedInUser);
      return { status: "information", message: "Not all reviewers submitted for approval. Will only process after all submitted." };
    }

    if (allSubmitted && bidObj.type === "RFP") {
      await repo.setTechScoreApproved(bidId, loggedInUser);
    }
  } else {
    await repo.markScoreSubmitted(bidId, sessionUserId, "Technical Review Team");
    const techApprovers = await repo.getAllTechReviewApprovers(bidId) as any[];
    let techScoreComplete = true;
    for (const appr of techApprovers) {
      if (appr.score_submitted !== "Y" || appr.score_submitted === null || appr.score_submitted === "" || appr.score_submitted === "N") {
        techScoreComplete = false;
      }
    }
    if (techScoreComplete) {
      await repo.setTechScoreComplete(bidId, loggedInUser);
    }
    if (techScoreComplete && bidObj.type === "RFP") {
      await repo.setTechScoreApproved(bidId, loggedInUser);
    }
  }

  await repo.updateBidLastUpdated(bidId, loggedInUser);
  const orgData = await adminRepo.getOrgDetails();

  eventBus.publish({
    eventType: EventTypes.TECHNICAL_SCORE_SUBMITTED,
    bidId: String(bidId),
    bidNumber: String(bidObj?.attribute_4 || ""),
    bidTitle: String(bidObj?.bid_title || ""),
    scorerName: loggedInUser,
    requestorName: String(bidObj?.buyer_name || ""),
    receiverEmail: String(bidObj?.buyer_email || ""),
    timestamp: new Date(),
    orgLogoPath: orgData.org_logo_path,
  });


  const reviewApprovers = await repo.getAllTechReviewApprovers(bidId) as any[];
  const allReviewersSubmitted = reviewApprovers.length > 0 && reviewApprovers.every(appr => appr.score_submitted === "Y");

  if (allReviewersSubmitted) {
    if (bidObj.type === "Tender") {
      const approvers = await repo.getAllBidApprovers(bidId, "Technical Approve Team") as any[];
      for (const approver of approvers) {
        const userDetails = await repo.getUserById(approver?.user_id) as any;
        eventBus.publish({
          eventType: EventTypes.TECHNICAL_APPROVER_ASSIGNED,
          bidId: String(bidId),
          bidNumber: bidObj?.attribute_4 || "",
          bidTitle: bidObj?.bid_title || "",
          approverName: userDetails?.name || "",
          receiverEmail: userDetails?.email_id || "",
          timestamp: new Date(),
          domain: reqUser?.domain,
          orgLogoPath: orgData.org_logo_path,
        });
      }
    } else if (bidObj.type === "RFP") {
      const approvers = await repo.getAllBidApprovers(bidId, "Commercial Review Team") as any[];
      for (const approver of approvers) {
        const userDetails = await repo.getUserById(approver?.user_id) as any;

        eventBus.publish({
          eventType: EventTypes.COMMERCIAL_SCORER_ASSIGNED,
          bidId: String(bidId),
          bidNumber: bidObj?.attribute_4 || "",
          bidTitle: bidObj?.bid_title || "",
          scorerName: userDetails?.name || "",
          receiverEmail: userDetails?.email_id || "",
          timestamp: new Date(),
          domain: reqUser?.domain,
          orgLogoPath: orgData.org_logo_path,
        });
      }

    }

  }

  return { status: "success", message: "Technical scores submitted successfully" };
}

export interface TechnicalAutoScoreResult {
  success: boolean;
  scored: number;
  errors?: string[];
  message: string;
}

/**
 * Runs AI technical scoring for every supplier response on a bid and persists the
 * scores. Shared by the AI Auto Score button (auto-score-all endpoint) and the
 * Sourcing Agent technical score query flow.
 */
export async function runTechnicalAutoScore(
  bidId: number,
  sessionUser: any,
): Promise<TechnicalAutoScoreResult> {
  const userId = sessionUser?.userName || sessionUser?.user_name || sessionUser?.userId || "System";
  const userName = sessionUser?.name || sessionUser?.userName || "System";
  const sessionUserId = sessionUser?.id;

  const aiResult = await bidAI.getTechnicalEvaluationScores(bidId);
  if (!aiResult.responses || aiResult.responses.length === 0) {
    return { success: true, scored: 0, message: "No vendor responses found to score." };
  }

  const responseReqs = await repo.getResponseRequirementsForBid(bidId);

  const bidRequirements = await getDb().execute(sql`
    SELECT id, category, question FROM dbo.supp_bid_requirement_dtls
    WHERE bidrefno = ${bidId}
      AND LOWER(category) NOT IN ('commercial', 'finance', 'financial')
  `);
  const bidReqRows = (bidRequirements as any).rows || [];

  let scored = 0;
  const errors: string[] = [];

  for (const aiResp of aiResult.responses) {
    const vendorReqs = responseReqs.filter((rr: any) => String(rr.bid_resp_id) === String(aiResp.responseId));

    const scoredReqIds = new Set<string>();
    for (const aiReqScore of (aiResp.requirementScores || [])) {
      const maxWeight = parseFloat(String(aiReqScore.maxScore ?? aiReqScore.weight ?? "0")) || 10;
      const clampedScore = resolveTechnicalEvalPersistedScore(aiReqScore, maxWeight);
      const remark =
        aiReqScore.reviewRemark?.trim() ||
        getPersistedReviewRemark(aiReqScore as TechnicalRequirementScore) ||
        aiReqScore.rationale ||
        (clampedScore === 0
          ? "The supplier did not provide a response to this requirement."
          : "AI scored this requirement.");

      const matchByBidReqId = vendorReqs.filter((rr: any) => String(rr.bid_req_id) === String(aiReqScore.requirementId));
      const bidReq = bidReqRows.find((br: any) => String(br.id) === String(aiReqScore.requirementId));
      const matchByQuestion = bidReq ? vendorReqs.filter((rr: any) =>
        String(rr.bid_req_id) === "0" &&
        (rr.question || "").toLowerCase().trim() === (bidReq.question || "").toLowerCase().trim() &&
        (rr.category || "").toLowerCase() === (bidReq.category || "").toLowerCase().trim()
      ) : [];

      const allMatches = [...matchByBidReqId, ...matchByQuestion];

      for (const matchingReq of allMatches) {
        if (scoredReqIds.has(String(matchingReq.id))) continue;
        scoredReqIds.add(String(matchingReq.id));
        const reqMaxWeight = parseFloat((matchingReq as any).weight) || maxWeight;
        const finalScore = Math.min(clampedScore, reqMaxWeight);
        try {
          await updateBidReqScore(Number(matchingReq.id), String(finalScore), userId, userName, sessionUserId);
          await updateBidReqComments(Number(matchingReq.id), remark, userId, userName, sessionUserId);
          scored++;
        } catch (e: any) {
          errors.push(`Req ${matchingReq.id}: ${e.message}`);
        }
      }
    }
  }

  return {
    success: true,
    scored,
    errors: errors.length > 0 ? errors : undefined,
    message: `AI scored ${scored} requirements across ${aiResult.responses.length} vendor responses.`,
  };
}

export interface CommercialAutoScoreResult {
  success: boolean;
  scored: number;
  reqScored: number;
  priceScored: number;
  errors?: string[];
  message: string;
}

/**
 * Runs AI commercial + financial-bid scoring for every supplier response on a bid
 * and persists the blended scores. Shared by the AI Auto Score button
 * (auto-score-comm endpoint) and the Sourcing Agent commercial score query flow.
 */
export async function runCommercialAutoScore(
  bidId: number,
  sessionUser: any,
): Promise<CommercialAutoScoreResult> {
  const userId = sessionUser?.userName || sessionUser?.user_name || sessionUser?.userId || "System";
  const userName = sessionUser?.name || sessionUser?.userName || "System";
  const sessionUserId = sessionUser?.id;

  const bidRequirements = await getDb().execute(sql`
    SELECT id, category, question FROM dbo.supp_bid_requirement_dtls
    WHERE bidrefno = ${bidId} AND LOWER(category) IN ('commercial', 'finance', 'financial')
  `);
  const bidReqRows = (bidRequirements as any).rows || [];
  const hasFinanceReqs = bidReqRows.length > 0;
  const maxPriceWeight = hasFinanceReqs ? 50 : 100;

  let reqScored = 0;
  let priceScored = 0;
  const errors: string[] = [];

  if (hasFinanceReqs) {
    try {
      const aiResult = await bidAI.getCommercialEvaluationScores(bidId);
      const responseReqs = await repo.getResponseRequirementsForCommBid(bidId);

      for (const aiResp of aiResult.responses || []) {
        const vendorReqs = responseReqs.filter((rr: any) => String(rr.bid_resp_id) === String(aiResp.responseId));
        const scoredReqIds = new Set<string>();
        for (const aiReqScore of (aiResp.requirementScores || [])) {
          const rawAiScore = Number(aiReqScore.suggestedScore);
          if (isNaN(rawAiScore)) continue;
          const remark = aiReqScore.rationale || (rawAiScore === 0 ? "Vendor did not provide a response to this requirement." : "AI scored this requirement.");

          const matchByBidReqId = vendorReqs.filter((rr: any) => String(rr.bid_req_id) === String(aiReqScore.requirementId));
          const bidReq = bidReqRows.find((br: any) => String(br.id) === String(aiReqScore.requirementId));
          const matchByQuestion = bidReq ? vendorReqs.filter((rr: any) =>
            String(rr.bid_req_id) === "0" &&
            (rr.question || "").toLowerCase().trim() === (bidReq.question || "").toLowerCase().trim() &&
            (rr.category || "").toLowerCase() === (bidReq.category || "").toLowerCase()
          ) : [];

          const allMatches = [...matchByBidReqId, ...matchByQuestion];
          for (const matchingReq of allMatches) {
            if (scoredReqIds.has(String(matchingReq.id))) continue;
            scoredReqIds.add(String(matchingReq.id));
            const maxWeight = parseFloat((matchingReq as any).weight) || 10;
            const scaledScore = Math.round((rawAiScore / 10) * maxWeight * 10) / 10;
            const clampedScore = Math.min(scaledScore, maxWeight);
            try {
              await updateBidReqScore(Number(matchingReq.id), String(clampedScore), userId, userName, sessionUserId);
              await updateBidReqComments(Number(matchingReq.id), remark, userId, userName, sessionUserId);
              reqScored++;
            } catch (e: any) {
              errors.push(`Req ${matchingReq.id}: ${e.message}`);
            }
          }
        }
      }
    } catch (e: any) {
      errors.push(`Finance criteria: ${e.message || "scoring failed"}`);
    }
  }

  try {
    const financialResult = await bidAI.getFinancialBidLineItemScores(bidId);
    for (const aiResp of financialResult.responses || []) {
      const scaledScore = Math.round((Number(aiResp.suggestedPriceScore) / 100) * maxPriceWeight * 10) / 10;
      const clampedScore = Math.min(scaledScore, maxPriceWeight);
      try {
        await updateCommercialPriceScore(
          String(aiResp.responseId),
          String(clampedScore),
          userId,
          userName,
          sessionUserId,
          aiResp.overallRationale || "",
        );
        priceScored++;
      } catch (e: any) {
        errors.push(`Response ${aiResp.responseId} financial bid: ${e.message}`);
      }
    }
  } catch (e: any) {
    errors.push(`Financial bid: ${e.message || "scoring failed"}`);
  }

  if (reqScored === 0 && priceScored === 0) {
    return {
      success: false,
      scored: 0,
      reqScored: 0,
      priceScored: 0,
      errors: errors.length > 0 ? errors : undefined,
      message: errors[0] || "No commercial or financial bid scores could be applied.",
    };
  }

  const parts: string[] = [];
  if (reqScored > 0) parts.push(`${reqScored} finance requirement score(s)`);
  if (priceScored > 0) parts.push(`${priceScored} financial bid score(s)`);

  return {
    success: true,
    scored: reqScored + priceScored,
    reqScored,
    priceScored,
    errors: errors.length > 0 ? errors : undefined,
    message: `AI applied ${parts.join(" and ")}. Comm Score column updated with blended totals.`,
  };
}

export async function submitCommScore(bidId: number, sessionUserId: number, reqUser?: any) {
  const responses = await repo.getResponsesForBid(bidId) as any[];

  const commercialCategories = ["Finance", "Financial"];
  for (const resp of responses) {
    const finCriteria = await repo.getAllRequirementsForResponse(String(resp.id)) as any[];
    const isFinancialCriteriaExists = finCriteria.some(r => commercialCategories.includes(r.category));

    if ((isFinancialCriteriaExists && (!resp.finscore || resp.finscore === "" || resp.finscore === '0')) || (resp.attribute_1 === null || resp.attribute_1 === "")) {
      return { status: "failure", message: "Not all responses are scored. Please score all before approve." };
    }
  }

  let allSubmitted = true;

  const user = await repo.getUserById(sessionUserId) as any;
  const loggedInUser = user?.user_name || "";

  const bidObj = await repo.getDboBidById(bidId) as any;
  const bidScoringFromAll = bidObj?.bid_score_from_all;

  const allApprovers = await repo.getAllCommReviewApprovers(bidId) as any[];

  if (bidScoringFromAll) {
    await repo.markApproverScoreSubmittedByUsername(bidId, loggedInUser);

    const refreshedApprovers = await repo.getAllCommReviewApprovers(bidId) as any[];
    for (const appr of refreshedApprovers) {
      if (appr.score_submitted !== "Y" || appr.score_submitted === "" || appr.score_submitted === "N") {
        allSubmitted = false;
      }
    }

    if (allSubmitted && bidObj.type === "RFP") {
      await repo.setFinScoreApproved(bidId, loggedInUser);
    }
    if (allSubmitted) {
      await repo.setFinScoreComplete(bidId, loggedInUser);
    } else {
      await repo.updateBidLastUpdated(bidId, loggedInUser);
      return { status: "information", message: "Not all reviewers submitted for approval. Will only process after all submitted" };
    }

  } else {
    await repo.markApproverScoreSubmittedByUsername(bidId, loggedInUser);
    const comApprovers = await repo.getAllCommReviewApprovers(bidId) as any[];
    let comScoreComplete = true;
    for (const appr of comApprovers) {
      if (appr.score_submitted !== "Y" || appr.score_submitted === null || appr.score_submitted === "" || appr.score_submitted === "N") {
        comScoreComplete = false;
      }
    }
    if (comScoreComplete) {
      await repo.setFinScoreComplete(bidId, loggedInUser);
    }
    if (comScoreComplete && bidObj.type === "RFP") {
      await repo.setFinScoreApproved(bidId, loggedInUser);
    }
  }

  await repo.updateBidLastUpdated(bidId, loggedInUser);
  const orgData = await adminRepo.getOrgDetails();

  eventBus.publish({
    eventType: EventTypes.COMMERCIAL_SCORE_SUBMITTED,
    bidId: String(bidId),
    bidNumber: bidObj?.attribute_4 || "",
    bidTitle: bidObj?.bid_title || "",
    scorerName: loggedInUser,
    requestorName: bidObj?.buyer_name || "",
    receiverEmail: bidObj?.buyer_email || "",
    timestamp: new Date(),
    orgLogoPath: orgData.org_logo_path,
  });

  const reviewApprovers = await repo.getAllBidApprovers(bidId, "Commercial Review Team") as any[];
  const allReviewersSubmitted = reviewApprovers.length > 0 && reviewApprovers.every(appr => appr.score_submitted === "Y");

  if (allReviewersSubmitted) {
    if (bidObj.type === "Tender") {
      const approvers = await repo.getAllBidApprovers(bidId, "Commercial Approve Team") as any[];
      for (const approver of approvers) {
        const userDetails = await repo.getUserById(approver?.user_id) as any;
        eventBus.publish({
          eventType: EventTypes.COMMERCIAL_APPROVER_ASSIGNED,
          bidId: String(bidId),
          bidNumber: bidObj?.attribute_4 || "",
          bidTitle: bidObj?.bid_title || "",
          approverName: userDetails?.name || "",
          receiverEmail: userDetails?.email_id || "",
          timestamp: new Date(),
          domain: reqUser?.domain,
          orgLogoPath: orgData.org_logo_path,
        });
      }
    }
    else if (bidObj.type === "RFP") {
      eventBus.publish({
        eventType: EventTypes.BID_EVALUATION_COMPLETED,
        bidId: String(bidId),
        bidNumber: bidObj?.attribute_4 || "",
        bidTitle: bidObj?.bid_title || "",
        approverName: bidObj?.buyer_name || "",
        receiverEmail: bidObj?.buyer_email || "",
        timestamp: new Date(),
        domain: reqUser?.domain,
        orgLogoPath: orgData.org_logo_path,
      });
    }
  }
  return { status: "success", message: "Financial score submitted." };
}

export async function approveCommScore(bidId: number, sessionUserId: number, sessionUser?: any) {
  const responses = await repo.getResponsesForBid(bidId) as any[];

  const commercialCategories = ["Finance", "Financial"];
  for (const resp of responses) {
    const finCriteria = await repo.getAllRequirementsForResponse(String(resp.id)) as any[];
    const isFinancialCriteriaExists = finCriteria.some(r => commercialCategories.includes(r.category));
    if ((isFinancialCriteriaExists && (!resp.finscore || resp.finscore === "")) || (resp.attribute_1 === null || resp.attribute_1 === "")) {
      return { status: "failure", message: "Not all responses are scored. Please score all before approve." };
    }
  }

  const user = await repo.getUserById(sessionUserId) as any;
  const loggedInUser = user?.user_name || "";

  await repo.markApproverScoreSubmittedByUsername(bidId, loggedInUser);
  await repo.updateBidLastUpdated(bidId, loggedInUser);

  await repo.updateBidLastUpdated(bidId, loggedInUser);

  const bidObj = await repo.getDboBidById(bidId) as any;
  const orgData = await adminRepo.getOrgDetails();
  eventBus.publish({
    eventType: EventTypes.COMMERCIAL_APPROVED,
    bidId: String(bidId),
    bidNumber: bidObj?.attribute_4 || "",
    bidTitle: bidObj?.bid_title || "",
    requestorName: bidObj?.buyer_name || "",
    receiverEmail: bidObj?.buyer_email || "",
    timestamp: new Date(),
    orgLogoPath: orgData.org_logo_path,
  });

  const reviewApprovers = await repo.getAllBidApprovers(bidId, "Commercial Approve Team") as any[];
  const allReviewersSubmitted = reviewApprovers.length > 0 && reviewApprovers.every(appr => appr.score_submitted === "Y");

  if (allReviewersSubmitted) {
    await repo.setFinScoreApproved(bidId, loggedInUser);
    eventBus.publish({
      eventType: EventTypes.BID_EVALUATION_COMPLETED,
      bidId: String(bidId),
      bidNumber: bidObj?.attribute_4 || "",
      bidTitle: bidObj?.bid_title || "",
      approverName: bidObj?.buyer_name || "",
      receiverEmail: bidObj?.buyer_email || "",
      timestamp: new Date(),
      domain: sessionUser?.domain,
      orgLogoPath: orgData.org_logo_path,
    });
  }


  return { status: "success", message: "Financial score approved." };
}

export async function approveTechScore(bidId: number, sessionUserId: number, reqUser?: any) {
  const responses = await repo.getResponsesForBid(bidId) as any[];
  if (!responses || responses.length === 0) {
    return { status: "failure", message: "No responses found for this bid." };
  }

  for (const resp of responses) {
    if (!resp.total_score || resp.total_score === "") {
      return { status: "failure", message: "Not all responses are scored. Please score all before approve." };
    }
  }

  const user = await repo.getUserById(sessionUserId) as any;
  const loggedInUser = user?.user_name || "";

  if (!loggedInUser) {
    return { status: "failure", message: "User not found." };
  }

  await repo.markApproverScoreSubmittedByUsername(bidId, loggedInUser);
  const bidObj = await repo.getDboBidById(bidId) as any;
  const orgData = await adminRepo.getOrgDetails();
  eventBus.publish({
    eventType: EventTypes.TECHNICAL_APPROVED,
    bidId: String(bidId),
    bidNumber: bidObj?.attribute_4 || "",
    bidTitle: bidObj?.bid_title || "",
    requestorName: bidObj?.buyer_name || "",
    receiverEmail: bidObj?.buyer_email || "",
    timestamp: new Date(),
    orgLogoPath: orgData.org_logo_path,
  });
  const reviewApprovers = await repo.getAllBidApprovers(bidId, "Technical Approve Team") as any[];
  const allReviewersSubmitted = reviewApprovers.length > 0 && reviewApprovers.every(appr => appr.score_submitted === "Y");

  if (allReviewersSubmitted) {
    const approvers = await repo.getAllBidApprovers(bidId, "Commercial Review Team") as any[];
    await repo.setTechScoreApproved(bidId, loggedInUser);
    for (const approver of approvers) {
      const userDetails = await repo.getUserById(approver?.user_id) as any;

      eventBus.publish({
        eventType: EventTypes.COMMERCIAL_SCORER_ASSIGNED,
        bidId: String(bidId),
        bidNumber: bidObj?.attribute_4 || "",
        bidTitle: bidObj?.bid_title || "",
        scorerName: userDetails?.name || "",
        receiverEmail: userDetails?.email_id || "",
        timestamp: new Date(),
        domain: reqUser?.domain,
        orgLogoPath: orgData.org_logo_path,
      });
    }
  }

  return { status: "success", message: "Technical scores approved successfully." };
}

const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function convertHundreds(n: number): string {
  let result = "";
  if (n >= 100) { result += ones[Math.floor(n / 100)] + " Hundred "; n = n % 100; }
  if (n >= 20) { result += tens[Math.floor(n / 10)] + " "; if (n % 10) result += ones[n % 10] + " "; }
  else if (n > 0) { result += ones[n] + " "; }
  return result;
}

function numberToWords(n: number): string {
  if (n === 0) return "Zero";
  if (n < 0) return "Minus " + numberToWords(-n);
  const num = Math.floor(n);
  let result = "";
  if (num >= 1000000000) { result += convertHundreds(Math.floor(num / 1000000000)) + "Billion "; }
  const rem9 = num % 1000000000;
  if (rem9 >= 1000000) { result += convertHundreds(Math.floor(rem9 / 1000000)) + "Million "; }
  const rem6 = rem9 % 1000000;
  if (rem6 >= 1000) { result += convertHundreds(Math.floor(rem6 / 1000)) + "Thousand "; }
  result += convertHundreds(rem6 % 1000);
  return result.trim();
}

export async function awardBid(bidId: number, supplierId: number, awardComments: string, createdBy: string) {
  const suppBid = await repo.getDboBidById(bidId) as any;
  if (!suppBid) throw { status: 404, message: "Bid not found" };

  const responses = await repo.getResponsesWithLinesByBid(bidId);
  if (!responses || responses.length === 0) {
    throw { status: 400, message: "No responses found for this bid" };
  }

  for (const resp of responses) {
    if (resp.bidenddate && new Date(resp.bidenddate) > new Date()) {
      throw { status: 400, message: "Bid end date is not yet completed" };
    }
  }

  if (suppBid.event !== "Proxy" && suppBid.type !== "RFQ") {
    const selectedResp = responses.find((r: any) => r.supplier_id === supplierId);
    const finCriteria = await repo.getAllRequirementsForResponse(String(selectedResp.id)) as any[];
    const isFinancialCriteriaExists = finCriteria.some(r => ["Finance", "Financial"].includes(r.category));
    if (selectedResp) {
      if (!selectedResp.total_score && selectedResp.total_score !== 0)
        throw { status: 400, message: "Please complete Technical score before award." };
      if ((isFinancialCriteriaExists && (!selectedResp.finscore || selectedResp.finscore === "" || selectedResp.finscore === '0')) || (selectedResp.attribute_1 === null || selectedResp.attribute_1 === ""))
        throw { status: 400, message: "Please complete commercial score before award." };
      if (!suppBid.techscoreapproved)
        throw { status: 400, message: "Technical score is not approved" };
      if (!suppBid.finscoreapproved)
        throw { status: 400, message: "Commercial score is not approved" };
    }
  }

  const bidRespObj = responses.find((r: any) => r.supplier_id === supplierId);
  if (!bidRespObj) {
    throw { status: 400, message: "Selected supplier response not found" };
  }

  const awardId = await repo.createAwardHeader({
    bidRespObj,
    createdBy,
    awardComments,
  });

  let totalAmount = 0;
  let discAmount = 0;
  let taxAmount = Number(bidRespObj.tax_amount) || 0;

  for (const line of (bidRespObj as any).lines || []) {
    const bidprice = parseFloat(line.bidprice) || 0;
    const qty = parseInt(line.quantity) || 0;
    const disc = Math.abs(parseFloat(line.discprice) || 0);
    const lineTotal = bidprice * qty;
    const lineDisc = disc * qty;



    await repo.createAwardLine({
      awardId,
      respLine: line,
      totalAmount: lineTotal,
      discAmount: lineDisc,
      supplierName: bidRespObj.supplier_name || "",
      supplierId: bidRespObj.supplier_id,
      createdBy,
    });

    totalAmount += lineTotal;
    discAmount += lineDisc;

    await repo.updateResponseLineRemainingQty(line.bid_line_id);
  }

  const grossTotal = totalAmount - discAmount + taxAmount;
  const amountInWords = numberToWords(grossTotal);

  await repo.updateAwardTotals(awardId, totalAmount, discAmount, grossTotal, amountInWords, taxAmount);
  await repo.updateBidStatus(bidId, "Award Under Process", createdBy);

  return { awardId, grossTotal, amountInWords };
}

export async function submitBidAward(awardId: number, awardNotes: string, reqUser: any) {
  const { workflowService } = await import("../../services/workflowService");
  const username = reqUser?.userName || reqUser?.user_name || reqUser?.username || reqUser?.email_id || reqUser?.email || "system";
  const userName = reqUser?.name || reqUser?.userName || "System";

  const award = await repo.getAwardById(awardId);
  if (!award) throw { status: 404, message: "Award not found" };

  const bid = award;
  const bidId = award.bidrefno;
  const isSealed = bid.type === "Tender" && bid.bid_style === "Sealed";
  const processName = "Bid";
  const orgData = await adminRepo.getOrgDetails();
  if (isSealed) {
    const reviewCount = await repo.getReviewAwardCount(bidId);
    if (reviewCount > 0) {
      throw { status: 400, message: "Submission failed. A bid award is already in process." };
    }

    await repo.updateAwardStatus(awardId, "Review Committee", username);
    if (awardNotes) {
      await getDb().execute(sql`UPDATE dbo.supp_bid_award_dtls SET notes = ${awardNotes} WHERE id = ${awardId}`);
    }

    await repo.resetBidApprovalFlags(bidId);
    await repo.updateBidStatus(bidId, "Award Under Process", username);
    const approvers = await repo.getAllBidApprovers(bidId, "Committee Team") as any[];

    for (const approver of approvers) {
      const userDetails = await repo.getUserById(approver?.user_id) as any;
      eventBus.publish({
        eventType: EventTypes.AWARD_INITIATED,
        bidId: String(bidId),
        bidNumber: bid?.attribute_4 || bid?.bid_number || "",
        bidTitle: bid?.bid_title || bid?.bidtitle || bid?.bid_title_from_bid || "",
        memberName: userDetails?.name,
        receiverEmail: userDetails?.email_id,
        timestamp: new Date(),
        domain: reqUser?.domain,
        orgLogoPath: orgData.org_logo_path,
      });
    }
  } else {
    let taskSubject = `Bid Award Request for  - ${award.bidtitle || bid.bid_title_from_bid || ""}`;
    if (taskSubject.length > 80) {
      taskSubject = taskSubject.substring(0, 80);
    }

    const params: any = {
      subject: taskSubject,
      srmsRefNumber: String(awardId),
      status: "Pending Approval",
      startDate: Date.now(),
      createdBy: userName,
      organization: bid.attribute_15 || reqUser?.organization_name || "",
      department: reqUser?.department_name || bid.buyer_department || bid.department_name || "",
      amount: award.grosstotal ? String(award.grosstotal) : "0",
      orgId: bid.org_id || 0,
    };

    const checkApprList = await workflowService.getFirstStepApproversList(processName, params);
    if (!checkApprList || checkApprList.length === 0) {
      throw { status: 400, message: "Approver Hierarchy or Approval Flow is not defined for this request!" };
    }

    let taskId: string;
    try {
      taskId = await workflowService.startProcess(
        taskSubject, processName, String(awardId), params, username
      );
    } catch (err: any) {
      if (err.status) throw err;
      throw { status: 400, message: err.message || "Failed to start approval workflow" };
    }

    const approversList = await workflowService.getApproversList(processName, params);

    await repo.updateAwardStatus(awardId, "Pending Approval", username);
    await repo.updateAwardApprovers(awardId, approversList.join(", "), taskId);

    const bidObj = await repo.getDboBidById(bidId) as any;
    if (bidObj !== "Tender") {
      for (const approver of checkApprList) {

        const appUrl = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
        const apiKey = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

        const approvalLink = appUrl.rows[0].prop_value + `/approval-action?apikey=${encodeURIComponent(String(apiKey?.rows[0].prop_value))}&&module=${encodeURIComponent('Bid')}&&taskId=${encodeURIComponent(taskId)}&&email=${encodeURIComponent(approver)}&&refnumber=${encodeURIComponent(awardId)}`;
        const userDetails = await repo.getUserByEmail(approver) as any;
        eventBus.publish({
          eventType: EventTypes.AWARD_INITIATED,
          bidId: String(bidId),
          bidNumber: bid?.attribute_4 || bid?.bid_number || "",
          bidTitle: bid?.bid_title || bid?.bidtitle || bid?.bid_title_from_bid || "",
          memberName: userDetails?.name,
          receiverEmail: userDetails?.email_id,
          timestamp: new Date(),
          domain: reqUser?.domain,
          orgLogoPath: orgData.org_logo_path,
          emailApprovalLink: approvalLink,
        });
      }
    }

    if (awardNotes) {
      await getDb().execute(sql`UPDATE dbo.supp_bid_award_dtls SET notes = ${awardNotes} WHERE id = ${awardId}`);
    }
  }

  const awardLines = await repo.getAwardLinesByAwardIdForSubmit(awardId);
  for (const line of awardLines) {
    await repo.updateResponseLineRemainingQty(line.bid_line_id);
  }

  return { success: true, message: "Award submitted for approval successfully" };
}

export async function acceptBidAward(awardId: number, reqUser: any) {
  const username = reqUser?.userName || reqUser?.user_name || reqUser?.username || reqUser?.email_id || reqUser?.email || "system";

  const award = await repo.getAwardById(awardId);
  if (!award) throw { status: 404, message: "Award not found" };

  const bidId = award.bidrefno;
  const grossTotal = parseFloat(award.grosstotal) || 0;

  const committeeApprovers = await repo.getCommitteeApprovers(bidId);

  const myApprover = committeeApprovers.find(
    (a: any) => a.user_name?.toLowerCase() === username.toLowerCase()
      || a.email_id?.toLowerCase() === username.toLowerCase()
  );

  if (!myApprover) {
    throw { status: 403, message: "You are not a Committee Team member for this bid." };
  }

  if (myApprover.bidaccepted === "Y") {
    throw { status: 400, message: "You have already accepted this award." };
  }

  await repo.setApproverAccepted(myApprover.id);

  const updatedApprovers = await repo.getCommitteeApprovers(bidId);
  const acceptedCount = updatedApprovers.filter(
    (a: any) => a.bidaccepted === "Y"
  ).length;

  if (acceptedCount >= 3) {
    const { syncPrBudgetReservationAfterAwardLinesUpdated } = await import(
      "../procurement/procurement.service"
    );
    const bidRow = await repo.getDboBidById(bidId);
    if (bidRow?.award_accepted === "Y") {
      return { success: true, message: "Your acceptance has been recorded." };
    }

    await repo.updateAwardStatus(awardId, "Approved", username);

    await repo.updateAwardAcceptedOnBid(bidId, grossTotal);

    const awardLines = await repo.getAwardLinesByAwardIdForSubmit(awardId);
    for (const line of awardLines) {
      await repo.updateResponseLineRemainingQty(line.bid_line_id);
    }

    const allAwarded = await repo.checkAllLinesFullyAwarded(bidId);
    if (allAwarded) {
      await repo.setBidAwarded(bidId);
    }
    const bid = await repo.getDboBidById(bidId);
    if (committeeApprovers.length > 0) {
      const latestCommitteApprovers = await repo.getCommitteeApprovers(bidId);
      const allAccepted = latestCommitteApprovers.every(a => a.bidaccepted === 'Y');
      if (allAccepted) {
        const orgData = await adminRepo.getOrgDetails();
        eventBus.publish({
          eventType: EventTypes.AWARD_APPROVED,
          bidId: String(bidId),
          bidNumber: (bid as any).attribute_4 || "",
          bidTitle: (bid as any).bid_title || (bid as any).bidtitle || "",
          buyerName: (bid as any).buyer_name || "",
          receiverEmail: (bid as any).buyer_email || "",
          timestamp: new Date(),
          domain: reqUser?.domain,
          orgLogoPath: orgData.org_logo_path
        });
      }

      if (award.bid_resp_no) {
        await repo.updateResponseStatusForAward(award.bid_resp_no);
      }
      await getDb().execute(sql`UPDATE dbo.supp_bid_award_dtls
                                SET attribute_10 = ${String(award.grosstotal)}
                                WHERE id = ${awardId}`);
      if (bidRow?.pr_number) {
        await syncPrBudgetReservationAfterAwardLinesUpdated(String(bidRow?.pr_number), Number(award.grosstotal));
      }

      return { success: true, message: "Award approved by Committee Team." };
    }
  }

  return {
    success: true,
    message: `Your acceptance has been recorded. ${acceptedCount} of ${committeeApprovers.length} committee members have accepted.`
  };
}

export async function processAwardApproval(
  taskId: string,
  result: string,
  comments: string,
  bidAwardId: number,
  reqUser: any
) {
  const username = reqUser?.userName || reqUser?.user_name || reqUser?.username || reqUser?.email_id || reqUser?.email || "system";
  const userId = reqUser?.id || reqUser?.userId;
  let userRoles: string[] = [];
  if (userId) {
    const { getUserRoleNames } = await import("../common/common.repository");
    userRoles = await getUserRoleNames(userId);
  } else {
    const rawRole = reqUser?.userRole || reqUser?.roles || reqUser?.role || "";
    userRoles = Array.isArray(rawRole) ? rawRole : (rawRole ? [rawRole] : []);
  }

  const award = await repo.getAwardById(bidAwardId);
  if (!award) throw { status: 404, message: "Award not found" };
  const orgData = await adminRepo.getOrgDetails();

  const bidId = award.bidrefno;
  const bid = await repo.getDboBidById(bidId);
  if (!bid) throw { status: 404, message: "Bid not found" };

  const stepInstance = await repo.getStepInstanceByTaskId(taskId);

  const wfResult = result === "Approved" ? "Approve" : result === "Rejected" ? "Reject" : result;
  const { workflowService } = await import("../../services/workflowService");
  const nextTaskId = await workflowService.completeTask(
    taskId,
    wfResult as any,
    comments,
    username,
    userRoles
  );

  if (nextTaskId) {
    await repo.updateAwardAttribute12(bidAwardId, nextTaskId);

    const approver = await getDb().execute(sql`select current_assignee from dbo.wf_step_instance where task_id=${nextTaskId}`);
    const appUrl = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
    const apiKey = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

    const approvalLink = appUrl.rows[0].prop_value + `/approval-action?apikey=${encodeURIComponent(String(apiKey?.rows[0].prop_value))}&&module=${encodeURIComponent('Bid')}&&taskId=${encodeURIComponent(nextTaskId)}&&email=${encodeURIComponent(String(approver.rows[0].current_assignee))}&&refnumber=${encodeURIComponent(bidAwardId)}`;

    const userDetails = await repo.getUserByEmail(String(approver?.rows[0].current_assignee)) as any;
    eventBus.publish({
      eventType: EventTypes.AWARD_INITIATED,
      bidId: String(bidId),
      bidNumber: String(bid?.attribute_4) || "",
      bidTitle: String(bid?.bid_title) || String(bid?.bidtitle) || String(bid?.bid_title_from_bid) || "",
      memberName: userDetails?.name,
      receiverEmail: userDetails?.email_id,
      timestamp: new Date(),
      domain: reqUser?.domain,
      orgLogoPath: orgData.org_logo_path,
      emailApprovalLink: approvalLink,
    });

    //  const { publishTaskAssignmentEvent } = await import("../../services/eventBus/publishTaskAssignment");
    // publishTaskAssignmentEvent({
    //   taskId: nextTaskId,
    //   templateEventId: "AWARD_APP",
    //   taskSub: `Bid award approval — ${bid.bid_title_from_bid || bid.bidtitle || String(bidAwardId)}`,
    //   submittedBy: username,
    //   department: "",
    //   srmsRefNo: String(bidAwardId),
    //   variables: {
    //   orgLogoPath: orgData.org_logo_path,
    //   },
    // emailApprovalLink:approvalLink,      
    // });

  }

  if (!nextTaskId && result === "Approved") {
    await repo.updateAwardStatus(bidAwardId, "Approved", username);

    const grossTotal = parseFloat(award.grosstotal) || 0;
    await repo.updateAwardAcceptedOnBid(bidId, grossTotal);

    const awardLines = await repo.getAwardLinesWithItemDetails(bidAwardId);
    for (const line of awardLines) {
      await repo.updateResponseLineRemainingQty(line.bid_line_id);
    }

    // only for partial awarding 
    // const allAwarded = await repo.checkAllLinesFullyAwarded(bidId);
    // if (allAwarded) {
      await repo.setBidAwarded(bidId);

      // if (bid.pr_number) {
        await repo.setBidStatusAndClearApprovers(bidId, "Awarded");
      // }
    // }

    if (award.bid_resp_no) {
      await repo.updateResponseStatusForAward(award.bid_resp_no);
    }

    const prNumber = bid.pr_number as string;
    if (prNumber) {
      try {
        const { getRequisitionLines } = await import("../procurement/procurement.repository");
        const { syncPrBudgetReservationAfterAwardLinesUpdated } = await import(
          "../procurement/procurement.service"
        );
        const { sumPrLinePreTaxAmounts } = await import("../_shared/budget-amounts");
        const prLinesBefore = await getRequisitionLines(prNumber);
        const previousPrLineTotal = sumPrLinePreTaxAmounts(prLinesBefore);

        // pr Lines should not be updated as per award 
        // for (const awardLine of awardLines) {
        //   if (awardLine.item_id) {
        //     const qty = parseFloat(awardLine.quantity) || 0;
        //     const bidprice = parseFloat(awardLine.bidprice) || 0;
        //     const discprice = Math.abs(parseFloat(awardLine.discprice) || 0);
        //     const lineAmount = (qty * bidprice) - (qty * discprice);
        //     await repo.updatePrLineFromAward(
        //       prNumber,
        //       awardLine.item_id,
        //       bidprice,
        //       discprice,
        //       lineAmount
        //     );
        //   }
        // }

        await syncPrBudgetReservationAfterAwardLinesUpdated(prNumber, Number(award.grosstotal));
        await getDb().execute(sql`UPDATE dbo.supp_bid_award_dtls SET attribute_10 = ${String(award.grosstotal)} WHERE id = ${bidAwardId}`);
      } catch (e) {
        console.error("Error updating PR lines from award:", e);
      }
    }
    eventBus.publish({
      eventType: EventTypes.AWARD_APPROVED,
      bidId: String(bidId),
      bidNumber: (bid as any).attribute_4 || "",
      bidTitle: (bid as any).bid_title || (bid as any).bidtitle || "",
      buyerName: (bid as any).buyer_name || "",
      receiverEmail: (bid as any).buyer_email || "",
      timestamp: new Date(),
      domain: reqUser?.domain,
      orgLogoPath: orgData.org_logo_path,
    });
  }

  if (result === "Rejected") {
    await repo.updateAwardForRejection(bidAwardId);
    await repo.setBidStatusAndClearApprovers(bidId, "Award Under Process");

    const awardLines = await repo.getAwardLinesByAwardIdForSubmit(bidAwardId);
    for (const line of awardLines) {
      await repo.updateResponseLineRemainingQty(line.bid_line_id);
    }

    eventBus.publish({
      eventType: EventTypes.AWARD_REJECTED,
      bidId: String(bidId),
      bidNumber: (bid as any).attribute_4 || "",
      bidTitle: (bid as any).bid_title || (bid as any).bidtitle || "",
      buyerName: (bid as any).buyer_name || "",
      receiverEmail: (bid as any).buyer_email || "",
      timestamp: new Date(),
      domain: reqUser?.domain,
      orgLogoPath: orgData.org_logo_path
    });
  }

  if (result === "Approved" && stepInstance) {
    let approversList = award.approvers_list || "";
    const currentAssignee = stepInstance.current_assignee || "";
    const assignmentType = String(stepInstance.assignment_type || "").toUpperCase();

    if (approversList) {
      if (assignmentType === "USER_HIERARCHY") {
        approversList = approversList.replace("Manager,", "").replace(", Manager", "").replace("Manager", "");
      } else if (currentAssignee) {
        approversList = approversList.replace(currentAssignee.trim() + ",", "");
        approversList = approversList.replace(currentAssignee.trim(), "");
      }
    }

    await repo.updateAwardApproversList(bidAwardId, approversList);
  }

  await helper.logApproversHistory(
        stepInstance,
        "AWARD",
        String(bidAwardId),
        "0",
        reqUser,
        comments,
        new Date(),
        result,
        "",
        reqUser
      );
  return { success: true, message: "Successfully processed your request." };
}

/**
 * Legacy processBidApprovalStep: complete workflow task for bid publish approval (Tender → Published / Rejected).
 */
export async function processBidPublishApprovalStep(
  taskId: string,
  result: string,
  comments: string,
  bidRefNo: number,
  reqUser: any,
) {
  const bidId = bidRefNo;
  const bid = await repo.getDboBidById(bidId);
  if (!bid) throw { status: 404, message: "Bid not found" };

  const wfStepInstances = await repo.getWfStepInstancesByTaskId(taskId);
  let taskCreationDate: Date | null = null;
  try {
    const taskRow = await repo.getActRuTaskCreateTime(taskId);
    if (taskRow?.create_time_) {
      taskCreationDate = new Date(taskRow.create_time_);
    }
  } catch {
    /* ignore */
  }

  const username =
    reqUser?.userName ||
    reqUser?.user_name ||
    reqUser?.username ||
    reqUser?.email_id ||
    reqUser?.email ||
    "system";
  const userId = reqUser?.id || reqUser?.userId;
  let userRoles: string[] = [];
  if (userId) {
    const { getUserRoleNames } = await import("../common/common.repository");
    userRoles = await getUserRoleNames(userId);
  } else {
    const rawRole = reqUser?.userRole || reqUser?.roles || reqUser?.role || "";
    userRoles = Array.isArray(rawRole) ? rawRole : (rawRole ? [rawRole] : []);
  }
  const wfResult = result === "Approved" ? "Approve" : result === "Rejected" ? "Reject" : result;

  const { workflowService } = await import("../../services/workflowService");
  let ntaskId: string;
  try {
    ntaskId = await workflowService.completeTask(
      taskId,
      wfResult as "Approve" | "Reject" | "ReSubmit" | "More",
      comments || "",
      username,
      userRoles,
    );
  } catch (e: any) {
    const msg = e?.message || "Error occured while processing your request!";
    throw { status: 400, message: msg };
  }
  const orgData = await adminRepo.getOrgDetails();
  if (ntaskId) {
    await repo.updateBidAttribute12ForPublishApproval(bidId, ntaskId, username);
    const { publishTaskAssignmentEvent } = await import("../../services/eventBus/publishTaskAssignment");
    const b = bid as any;
    let department = "";
    try {
      if (b.buyer) {
        const deptResult = await getDb().execute(sql`
          SELECT department_name FROM dbo.um_user_dtls
          WHERE user_name = ${String(b.buyer)} OR email_id = ${String(b.buyer)} LIMIT 1
        `);
        department = String((deptResult.rows[0] as any)?.department_name || "");
      }
    } catch {
      /* ignore */
    }
    const approver = await getDb().execute(sql`select current_assignee from dbo.wf_step_instance where task_id=${ntaskId}`);
    const appUrl = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
    const apiKey = await getDb().execute(sql`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

    const approvalLink = appUrl.rows[0].prop_value + `/approval-action?apikey=${encodeURIComponent(String(apiKey?.rows[0].prop_value))}&&module=${encodeURIComponent('Bid')}&&taskId=${encodeURIComponent(ntaskId)}&&email=${encodeURIComponent(String(approver.rows[0].current_assignee))}&&refnumber=${encodeURIComponent(bidId)}`;
    publishTaskAssignmentEvent({
      taskId: ntaskId,
      srmsRefNo: String(bidRefNo),
      submittedBy: b.buyer_name || b.buyerName || "",
      department,
      taskSub: `${b.type || ""} - ${b.bid_title || ""} - ${b.buyer_name || b.buyerName || ""}`,
      entityId: String(bidId),
      variables: {
        orgLogoPath: orgData.org_logo_path,
        emailApprovalLink:approvalLink,
      },
      emailApprovalLink:approvalLink,
    });
  }
  if (!ntaskId && result === "Approved") {
    await repo.setBidPublishedAfterBidPublishApproval(bidId, username);
    eventBus.publish({
      eventType: EventTypes.BID_PUBLISH_APPROVED,
      bidId,
      timestamp: new Date(),
      orgLogoPath: orgData.org_logo_path,
    });

    eventBus.publish({
      eventType: EventTypes.BID_APPROVED,
      bidId: String(bidId),
      bidNumber: (bid as any).attribute_4 || "",
      bidTitle: (bid as any).bid_title || "",
      requestorName: (bid as any).buyer_name || "",
      receiverEmail: (bid as any).buyer_email || "",
      timestamp: new Date(),
      domain: reqUser?.domain,
      orgLogoPath: orgData.org_logo_path
    });

    // eventBus.publish({
    //   eventType: EventTypes.BID_PUBLISHED,
    //   bidId: String(bidId),
    //   bidNumber: (bid as any).attribute_4 || "",
    //   bidTitle: (bid as any).bid_title || "",
    //   requestorName: (bid as any).buyer_name || "",
    //   receiverEmail: (bid as any).buyer_email || "",
    //   timestamp: new Date(),
    //   orgLogoPath: orgData.org_logo_path,
    // });

    const invitedSupps = await repo.getDboBidSuppliers(bidId);
    for (const supp of invitedSupps) {
      const s = supp as any;
      if (s.supplier_contact_email) {
        eventBus.publish({
          eventType: EventTypes.NEW_BID_PUBLISH,
          bidId: String(bidId),
          bidNumber: (bid as any).attribute_4 || "",
          bidTitle: (bid as any).bid_title || "",
          supplierName: s.supplier_name || "",
          receiverEmail: s.supplier_contact_email,
          timestamp: new Date(),
          domain: reqUser?.domain,
          orgLogoPath: orgData.org_logo_path,
        });
      }
    }

    if ((bid as any).type === "Tender" && (bid as any).bid_style === "Sealed") {
      const committeeApprovers = await repo.getCommitteeApprovers(bidId);
      for (const approver of committeeApprovers) {
        if (approver.email_id) {
          eventBus.publish({
            eventType: EventTypes.TENDER_ENVELOPE_CREATED,
            bidId: String(bidId),
            bidNumber: (bid as any).attribute_4 || "",
            bidTitle: (bid as any).bid_title || "",
            memberName: approver.user_name || approver.user_name_full || approver.email_id || "",
            receiverEmail: approver.email_id,
            timestamp: new Date(),
            orgLogoPath: orgData.org_logo_path,
          });
        }
      }
    }
    void logAudit({
      auditKey: String(bidRefNo),
      auditAction: "APPROVED",
      auditMessage: "Bid Publish Request is Approved",
      fullName: reqUser?.name || username,
      userId: String(reqUser?.id ?? username),
      module: "BIDS",
    });
  }

  if (result === "Rejected") {
    await repo.rejectBidPublishApproval(bidId, comments || "", username);
    eventBus.publish({
      eventType: EventTypes.BID_PUBLISH_REJECTED,
      bidId,
      timestamp: new Date(),
      orgLogoPath: orgData.org_logo_path,
    });

    eventBus.publish({
      eventType: EventTypes.BID_REJECTED,
      bidId: String(bidId),
      bidNumber: (bid as any).attribute_4 || "",
      bidTitle: (bid as any).bid_title || "",
      requestorName: (bid as any).buyer_name || "",
      receiverEmail: (bid as any).buyer_email || "",
      reason: comments || "No reason provided",
      timestamp: new Date(),
      domain: reqUser?.domain,
      orgLogoPath: orgData.org_logo_path,
    });
    void logAudit({
      auditKey: String(bidRefNo),
      auditAction: "REJECTED",
      auditMessage: "Bid Publish Request is Rejected",
      fullName: reqUser?.name || username,
      userId: String(reqUser?.id ?? username),
      module: "BIDS",
    });
  }

  if (result === "Approved" && wfStepInstances.length > 0) {
    const fresh = await repo.getDboBidById(bidId);
    let approversList = String((fresh as any)?.approvers_list || "");
    const step = wfStepInstances[0] as any;
    const currentAssignee = String(step.current_assignee || step.currentAssignee || "").trim();
    const assignmentType = String(step.assignment_type || step.assignmentType || "").toUpperCase();
    const userEmail = String(reqUser?.email_id || reqUser?.email || "").trim();
    const userName = String(reqUser?.name) || String(reqUser?.user_name_full || "");

    if (approversList) {
      if (assignmentType === "ROLE" && userRoles.includes(currentAssignee)) {
        approversList = approversList.replace(currentAssignee + ",", "");
        approversList = approversList.replace(currentAssignee, "");
      } else if (assignmentType === "USER" && userEmail === currentAssignee) {
        approversList = approversList.replace(userName + ",", "");
        approversList = approversList.replace(userName, "");
      } else if (assignmentType === "USER_HIERARCHY") {
        approversList = approversList.replace("Manager,", "").replace(", Manager", "").replace("Manager", "");
      }
    }
    await repo.updateBidHeaderApproversList(bidId, approversList);
  }

  const uObj = {
    id: reqUser?.id,
    name: reqUser?.name,
    emailId: reqUser?.email_id || reqUser?.email,
    userName: reqUser?.userName || reqUser?.user_name || username,
    designation: reqUser?.designation || "",
  };
  const mappedSteps = wfStepInstances.map((row: any) => ({
    ...row,
    currentAssignee: row.current_assignee,
    assignmentType: row.assignment_type,
  }));
  const sessionUserForHistory = {
    userName: username,
    userRole: reqUser?.userRole || reqUser?.roles,
    ...reqUser,
  };
  await logApproversHistory(
    mappedSteps,
    "BID",
    String(bidRefNo),
    "0",
    uObj,
    comments || "",
    taskCreationDate,
    result,
    "",
    sessionUserForHistory,
  );

  return { success: true, message: "Successfully processed your request." };
}

export async function rejectBidAward(awardId: number, reqUser: any) {
  const award = await repo.getAwardById(awardId);
  if (!award) throw { status: 404, message: "Award not found" };

  const bidId = award.bidrefno;

  await repo.updateAwardForRejection(awardId);
  await repo.setBidStatusAndClearApprovers(bidId, "Award Under Process");

  await repo.clearAllCommitteeAcceptance(bidId);

  const awardLines = await repo.getAwardLinesByAwardIdForSubmit(awardId);
  for (const line of awardLines) {
    await repo.updateResponseLineRemainingQty(line.bid_line_id);
  }

  await repo.clearBidAwardAccepted(bidId);
  const orgData = await adminRepo.getOrgDetails();
  const bid = await repo.getDboBidById(bidId);
  eventBus.publish({
    eventType: EventTypes.AWARD_REJECTED,
    bidId: String(bidId),
    bidNumber: (bid as any).attribute_4 || "",
    bidTitle: (bid as any).bid_title || (bid as any).bidtitle || "",
    buyerName: (bid as any).buyer_name || "",
    receiverEmail: (bid as any).buyer_email || "",
    timestamp: new Date(),
    domain: reqUser?.domain,
    orgLogoPath: orgData.org_logo_path
  });

  return { success: true, message: "Award rejected by Committee Team." };
}

/** Sync scope-of-work lines from bid master into one supplier response (no status changes). */
export async function syncBidResponseLinesForResponse(
  bidId: number,
  responseId: string,
  updatedBy: string,
) {
  const bidLines = await repo.getDboBidLines(bidId);
  const respLines = await repo.getBidResponseLines(responseId);

  for (const bl of bidLines) {
    const bidLine = bl as any;
    const existing = respLines.find(
      (l: any) => Number(l.bid_line_id) === Number(bidLine.id),
    );
    if (existing) {
      await repo.updateBidResponseLineFromBidLineTemplate(existing.id as number, bidLine, updatedBy);
    } else {
      await repo.insertBidResponseLine({
        bid_resp_id: responseId,
        bid_line_id: bidLine.id,
        linetype: bidLine.linetype ?? null,
        description: bidLine.description ?? null,
        currency: bidLine.currency ?? null,
        priceprecision: bidLine.priceprecision ?? null,
        uom: bidLine.uom ?? null,
        quantity: bidLine.quantity != null ? Number(bidLine.quantity) : null,
        shiptoaddress: bidLine.shiptoaddress ?? null,
        startprice: bidLine.startprice ?? null,
        targetprice: bidLine.targetprice ?? null,
        currentprice: bidLine.currentprice ?? null,
        needbyfrom: bidLine.needbyfrom ?? null,
        needbyto: bidLine.needbyto ?? null,
        product_category: bidLine.product_category ?? null,
        item_id: bidLine.item_id != null ? String(bidLine.item_id) : null,
        req_line_id: bidLine.req_line_id != null ? String(bidLine.req_line_id) : null,
        tax_code: bidLine.tax_code ?? null,
        attribute_7: bidLine.attribute_7 ?? null,
        attribute_10: bidLine.attribute_10 ?? null,
        status: bidLine.status ?? null,
        created_by: updatedBy,
      });
    }
  }
}

async function syncPublishedBidResponseLines(bidId: number, user?: any) {
  const bid = await repo.getDboBidById(bidId);
  if (!bid || (bid as any).status !== "Published") return;
  const updatedBy = user?.user_name || user?.name || user?.email || "System";
  const responses = await repo.getAllBidResponsesByBidId(bidId);
  for (const res of responses) {
    await syncBidResponseLinesForResponse(bidId, String((res as any).id), updatedBy);
  }
}

/**
 * Legacy UpdateResponses: sync each supplier response header, requirement rows, and line rows from the bid master.
 */
export async function syncBidResponsesFromBidTemplate(bidId: number, updatedBy: string) {
  const bid = await repo.getDboBidDetailById(bidId);
  if (!bid) return;

  const bidStatus = String((bid as any).status || "");
  const requirements = await repo.getDboBidRequirements(bidId);
  const responses = await repo.getAllBidResponsesByBidId(bidId);


  if (bidStatus === "Published") {
    void logAudit({
      auditKey: String(bidId),
      auditAction: "UPDATE",
      auditMessage: "Bid details updated.",
      fullName: updatedBy,
      userId: updatedBy,
      module: "BIDS",
    });
  }

  const bidtitle = (bid as any).bid_title ?? null;
  const bidtype = (bid as any).type ?? null;
  const bidstart = (bid as any).startdate ?? null;
  const bidend = (bid as any).enddate ?? null;

  for (const res of responses) {
    const resAny = res as any;
    let newStatus = String(resAny.status || "");

    if (bidStatus === "Cancelled") {
      newStatus = "Cancelled";
    }

    await repo.updateBidResponseHeaderSync({
      responseId: resAny.id,
      bidtitle,
      bidtype,
      bidstartdate: bidstart,
      bidenddate: bidend,
      status: newStatus,
      lastModifiedBy: updatedBy,
    });

    const respId = resAny.id;
    const respReqs = await repo.getBidResponseRequirements(respId);

    for (const br of requirements) {
      const bidReq = br as any;
      const existing = respReqs.find(
        (r: any) => Number(r.bid_req_id) === Number(bidReq.id),
      );
      if (existing) {
        await repo.updateBidResponseRequirementFromBidTemplate(existing.id as number, bidReq, updatedBy);
      } else {
        await repo.insertBidResponseRequirement({
          bid_resp_id: respId,
          bid_req_id: bidReq.id,
          category: String(bidReq.category || ""),
          question: String(bidReq.question || ""),
          qvoption: String(bidReq.qvoption || ""),
          qvtype: String(bidReq.qvtype || ""),
          target: bidReq.target != null ? String(bidReq.target) : null,
          weight: bidReq.weight != null ? String(bidReq.weight) : null,
          knockoutscore: bidReq.knockoutscore != null ? String(bidReq.knockoutscore) : null,
          scoringmethod: bidReq.scoringmethod != null ? String(bidReq.scoringmethod) : null,
          lov: bidReq.lov != null ? String(bidReq.lov) : null,
          created_by: updatedBy,
        });
      }
    }

    await syncBidResponseLinesForResponse(bidId, respId, updatedBy);
  }
  const orgData = await adminRepo.getOrgDetails();
  if (bidStatus === "Published") {
    eventBus.publish({
      eventType: EventTypes.BID_MODIFIED,
      bidId,
      timestamp: new Date(),
      orgLogoPath: orgData.org_logo_path,
    });
  }
}

export async function reopenBid(bidId: number, data: { startDate: string; endDate: string, envOpenDate: string | null }, userId: string, reqUser?: any) {
  const bid = await repo.getDboBidDetailById(bidId);
  const orgData = await adminRepo.getOrgDetails();
  if (!bid) throw { status: 404, message: "Bid not found" };

  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  const envOpenDate = data.envOpenDate ? new Date(data.envOpenDate) : null;

  if (!isDateNotPast(data.startDate)) {
    throw { status: 400, message: "Bid Publish Date must be today's date with future time or a future date." };
  }

  if (endDate <= startDate) {
    throw { status: 400, message: "Bid close date must be after the publish date." };
  }

  if ((envOpenDate === undefined || envOpenDate === null || (envOpenDate && envOpenDate <= endDate)) && bid.type === 'Tender') {
    throw { status: 400, message: "Envelope open date must be after the close date." };
  }

  await repo.reopenBid(bidId, {
    startdate: startDate.toISOString(),
    enddate: endDate.toISOString(),
    env_open_date: envOpenDate ? envOpenDate.toISOString() : null,
    last_updated_by: userId,
  });

  await syncBidResponsesFromBidTemplate(bidId, userId);
  await clearSuppBidApproversResponses(bidId);


  const invitedSupps = await repo.getDboBidSuppliers(bidId);
  for (const supp of invitedSupps) {
    const s = supp as any;
    if (s.supplier_contact_email) {
      eventBus.publish({
        eventType: EventTypes.BID_SUPP_REOPEN,
        bidId: String(bidId),
        bidNumber: (bid as any).attribute_4 || "",
        bidTitle: (bid as any).bid_title || "",
        receiverEmail: s.supplier_contact_email || "",
        supplierName: s.supplier_name || "",
        timestamp: new Date(),
        domain: reqUser?.domain,
        orgLogoPath: orgData.org_logo_path,
      });
    }
  }

  return { success: true, message: "Bid reopened successfully" };
}

export async function clearSuppBidApproversResponses(bidId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_approvers SET
      score_submitted = NULL,
      bidaccepted = NULL,
      logged_id = NULL
    WHERE bidrefno = ${bidId}
  `);
}

export async function broadCastBidMessage(bidId: number, message: string, userId: string) {
  const bid = await repo.getDboBidDetailById(bidId);
  if (!bid) throw { status: 404, message: "Bid not found" };
  await repo.broadCastBidMessage(bidId, message, userId);
  return { success: true, message: "Message broadcasted successfully" };
}

export async function getBidBroadCastMessage(bidId: number) {
  const bid = await repo.getDboBidDetailById(bidId);
  if (!bid) throw { status: 404, message: "Bid not found" };
  const result = await repo.getBroadCastBidMessage(bidId);
  return result ?? [];
}

/** Matches legacy @PreAuthorize SUPERADMIN, PROCUREMENT_OFFICER, PROCUREMENT_MANAGER. */
function canManualCloseBid(user: any): boolean {
  if (!user?.userRole) return false;
  const blocked = new Set([
    "SUPPLIER_ADMIN",
    "ROLE_SUPPLIER_ADMIN",
    "SUPPLIER_USER",
    "ROLE_SUPPLIER_USER",
  ]);
  return blocked.has(String(user.userRole));
}

/** Legacy Java closeBid: end now, status Closed, BidCancelEvent, sync response bid dates. */
export async function closeBid(bidId: number, sessionUser: any) {
  const bid = await repo.getDboBidById(bidId);
  if (!bid) throw { status: 404, message: "Bid not found" };
  if (!sessionUser || (!canManualCloseBid(sessionUser) && sessionUser.email !== bid.buyer_email)) {
    throw { status: 403, error: "Not authorized to close bids" };
  }
  const status = (bid as any).status;
  if (status === "Deleted") throw { status: 400, message: "Bid not found" };
  if (status === "Cancelled") throw { status: 400, message: "Bid is cancelled" };

  const userName =
    sessionUser?.user_name ||
    sessionUser?.userName ||
    sessionUser?.email ||
    sessionUser?.email_id ||
    "System";

  await repo.markBidClosedNow(bidId, userName);
  const orgData = await adminRepo.getOrgDetails();

  const invitedSupps = await repo.getDboBidSuppliers(bidId);
  for (const supp of invitedSupps) {
    const s = supp as any;
    if (s.supplier_contact_email) {
      eventBus.publish({
        eventType: EventTypes.BID_CLOSED,
        bidId: String(bidId),
        bidNumber: (bid as any).attribute_4 || "",
        bidTitle: (bid as any).bid_title || "",
        vendorName: s.supplier_name || "",
        receiverEmail: s.supplier_contact_email,
        timestamp: new Date(),
        orgLogoPath: orgData.org_logo_path,
      });
    }
  }

  const cancelEvent: BidCancelledEvent = {
    eventType: EventTypes.BID_CANCELLED,
    bidId,
    timestamp: new Date(),
    orgId: sessionUser?.orgId,
    orgLogoPath: orgData.org_logo_path,
  };
  eventBus.publish(cancelEvent);

  const after = await repo.getDboBidById(bidId);
  await repo.updateBidResponseDates(
    bidId,
    (after as any)?.startdate ?? (bid as any).startdate ?? null,
    (after as any)?.enddate ?? null,
    userName,
  );

  return { success: true, message: "Success" };
}

export async function cancelBid(bidId: number, cancelReason: string, userId: string) {
  const bid = await repo.getDboBidDetailById(bidId);
  if (!bid) throw { status: 404, message: "Bid not found" };

  const award = await getDb().execute(sql`SELECT * from dbo.supp_bid_award_dtls where bidrefno = ${bidId} and status != 'Cancelled'`);
  if (award.rows.length > 0) {
    throw { status: 400, message: "Cannot cancel bid as it is already awarded. Please cancel the award and cancel the bid." };
  }
  if (bid.pr_number) {
    await repo.updatePrHeader(bid.pr_number as string, { attribute_7: '', bidno: 0 });
  }

  await repo.cancelBid(bidId, {
    cancel_reason: cancelReason,
    last_updated_by: userId,
  });

  return { success: true, message: "Bid cancelled successfully" };
}

export async function awardDetailsById(awardId: number) {
  const awardDTO: any = {};

  const bidAwardObj = await repo.getAwardById(awardId);
  if (!bidAwardObj) {
    throw { status: 404, message: "Bid award not found" };
  }

  awardDTO.bidAwards = bidAwardObj;

  const bidId = Number((bidAwardObj as any).bidrefno);
  if (!bidId || Number.isNaN(bidId)) {
    throw { status: 400, message: "Invalid bid reference on award" };
  }

  const suppBid = await repo.getBidHeaderById(bidId);
  if (!suppBid) {
    throw { status: 404, message: "Bid not found" };
  }

  const suppliers = (await repo.getDboBidSuppliers(bidId)) as any[] || [];
  const finalBidResponseDtls: any[] = [];

  for (const supplier of suppliers) {
    const supplierId = Number(supplier.supplier_id || supplier.supplierId || 0);
    if (!supplierId) continue;

    const latestResponse = await repo.getResponseWithLinesBySupplier(bidId, supplierId);
    if (latestResponse) {
      finalBidResponseDtls.push(latestResponse);
    }
  }

  if (finalBidResponseDtls.length > 0) {
    awardDTO.bidResponses = finalBidResponseDtls;
  }

  awardDTO.bidObj = suppBid;
  awardDTO.bidApprovers = await repo.getDboBidApprovers(bidId);

  const roleNames = new Set([
    "ROLE_PROCUREMENT_OFFICER",
    "ROLE_PROCUREMENT_MANAGER",
    "ROLE_FINANCE_OFFICER",
    "ROLE_FINANCE_MANAGER",
    "ROLE_STORE_USER",
    "ROLE_STORE_ENGINEER",
    "ROLE_CALLCENTER_USER",
    "ROLE_HOD",
    "ROLE_DEPARTMENT_USER",
    "ROLE_DEPARTMENT_HEAD",
  ]);

  const arList = (bidAwardObj as any).approvers_list || (bidAwardObj as any).approversList || "";
  const finalApprs: string[] = [];
  const approvers: any[] = [];

  if (arList) {
    const apprs = arList.split(",");
    for (const raw of apprs) {
      const uStr = (raw || "").trim();
      if (!uStr) continue;

      if (roleNames.has(uStr.toUpperCase())) {
        finalApprs.push(`Any User in ${uStr} Role`);
        const users = await getUsersInRoleByEntity(uStr, 0);
        if (Array.isArray(users) && users.length > 0) {
          approvers.push(...users);
        }
      } else {
        try {
          const obj = await getLoggedInUser(uStr);
          if (obj) {
            finalApprs.push(obj.name || obj.user_name || uStr);
            approvers.push(obj);
          }
        } catch (error) {
          // ignore invalid approver identifiers
        }
      }
    }
  }

  awardDTO.approversList = finalApprs;
  awardDTO.approvers = approvers;
  awardDTO.approvalHstDetails = await repo.getAwardApprovalHistory(awardId);
  return awardDTO;
}

export async function addProxyResponseAttachment(responseId: string, data: any, user?: any) {
  const response = await repo.getBidResponseById(responseId);
  if (!response) throw { status: 404, message: "Response not found" };
  const r = response as any;
  return repo.addSupplierResponseAttachment(Number(r.bidrefno), Number(r.supplier_id), data, user);
}

export async function placeProxyBidResponse(
  bidId: number,
  body: {
    supplierId: number;
    lines: Array<{ bidLineId: number; bidprice: number | null; discprice: number | null; promisedDate: string | null; taxCode: string | null; taxRate: number | null }>;
    requirements: Array<{ reqId: number; answer: string; remarks: string }>;
    comments: string;
    refNumber: string;
    taxIncluded?: string;
  },
  sessionUser?: any,
) {
  const bid = await repo.getBidHeaderById(bidId);
  if (!bid) throw { status: 404, message: "Bid not found" };
  const bidObj = bid as any;

  if (!["Draft", "Published"].includes(bidObj.status)) {
    throw { status: 400, message: "Proxy response can only be placed on Draft or Published bids" };
  }

  const invite = await repo.getSupplierBidInvite(bidId, body.supplierId);
  if (!invite) throw { status: 404, message: "Supplier is not invited to this bid" };

  const ack = await repo.getSupplierAckForBid(bidId, body.supplierId);
  if (ack && (ack as any).status === "Not Participating") {
    throw { status: 400, message: "This supplier has acknowledged as Not Participating. Proxy response cannot be placed." };
  }

  const existingResponse = await repo.getBidResponseBySuppAndBid(body.supplierId, bidId) as any;
  if (existingResponse && existingResponse.status === "Submitted") {
    throw { status: 400, message: "This vendor has already submitted a response. Proxy response cannot be placed." };
  }

  const createdBy = sessionUser?.displayName || sessionUser?.username || "system";
  const inviteObj = invite as any;
  const supplierName = inviteObj.supplier_name || "";

  let respId: string;

  if (!existingResponse) {
    await repo.insertBidAcknowledgment({
      bidrefno: bidId,
      status: "Participating",
      comments: body.comments || "",
      supplier_id: body.supplierId,
      suppliername: supplierName,
      suppliersite: inviteObj.supplier_site || "",
      suppliercontact: inviteObj.supplier_contact || "",
      suppliercontactno: "",
      created_by: createdBy,
    });

    const responseRecord = await repo.insertBidResponse({
      bidrefno: bidId,
      supplier_id: body.supplierId,
      status: "Draft",
      bidtitle: bidObj.bid_title || "",
      bidtype: bidObj.type || "",
      bidstartdate: bidObj.startdate,
      bidenddate: bidObj.enddate,
      is_contract_required: bidObj.is_contract_required || null,
      contract_template_id: bidObj.contract_template_id ? String(bidObj.contract_template_id) : null,
      supplier_name: supplierName,
      supplier_contact: inviteObj.supplier_contact || "",
      supplier_contact_no: "",
      supplier_site: inviteObj.supplier_site || "",
      created_by: createdBy,
    });

    respId = String((responseRecord as any).id);

    const bidReqs = await repo.getDboBidRequirements(bidId);
    for (const r of bidReqs as any[]) {
      await repo.insertBidResponseRequirement({
        bid_resp_id: respId,
        bid_req_id: r.id,
        category: r.category || "",
        question: r.question || "",
        qvoption: r.qvoption || "",
        qvtype: r.qvtype || "",
        target: r.target || null,
        weight: r.weight || null,
        knockoutscore: r.knockoutscore || null,
        scoringmethod: r.scoringmethod || null,
        lov: r.lov || null,
        created_by: createdBy,
      });
    }

    await syncBidResponseLinesForResponse(bidId, respId, createdBy);
    await repo.updateSupplierBidInviteStatus(bidId, body.supplierId, "Acknowledged");
    const ackCount = await repo.getAckCountForBid(bidId);
    await repo.updateBidAckCount(bidId, ackCount);
  } else {
    respId = String(existingResponse.id);
  }

  const responseLines = await repo.getBidResponseLines(respId) as any[];
  const responseReqs = await repo.getBidResponseRequirements(respId) as any[];

  const now = new Date();
  for (const lineData of body.lines) {
    if (lineData.bidprice == null || Number(lineData.bidprice) < 0) {
      throw { status: 400, message: "Please enter positive value in unit price." };
    }
    if (!lineData.promisedDate) {
      throw { status: 400, message: "Please enter promise date for all line items." };
    }
    if (now > new Date(lineData.promisedDate)) {
      throw { status: 400, message: "Please enter promise date after current date." };
    }
    if (lineData.discprice != null && Number(lineData.discprice) < 0) {
      throw { status: 400, message: "Please enter positive value in discount price." };
    }
    if (lineData.bidprice != null && lineData.discprice != null &&
      Number(lineData.discprice) > Number(lineData.bidprice)) {
      throw { status: 400, message: "Discount unit price cannot exceed unit price." };
    }
    const responseLine = responseLines.find((rl: any) => String(rl.bid_line_id) === String(lineData.bidLineId));
    if (!responseLine) continue;
    await repo.updateBidResponseLine(responseLine.id, {
      bidprice: lineData.bidprice ?? undefined,
      discprice: lineData.discprice ?? undefined,
      promised_date: lineData.promisedDate ?? undefined,
      tax_code: lineData.taxCode ?? null,
      tax_rate: lineData.taxRate ?? null,
    }, createdBy);
  }

  for (const reqData of body.requirements) {
    const responseReq = responseReqs.find((rr: any) => String(rr.bid_req_id) === String(reqData.reqId));
    if (!responseReq) continue;
    await repo.updateBidResponseRequirement(responseReq.id, {
      response: reqData.answer,
      remarks: reqData.remarks,
    }, createdBy);
  }

  const updatedLines = await repo.getBidResponseLines(respId) as any[];
  let totalAmount = 0;
  let discountAmount = 0;
  for (const line of updatedLines) {
    const qty = parseFloat(line.quantity) || 0;
    if (line.bidprice != null) totalAmount += parseFloat(line.bidprice) * qty;
    if (line.discprice != null) discountAmount += Math.abs(parseFloat(line.discprice)) * qty;
  }
  const grossTotal = totalAmount - discountAmount;

  await repo.submitBidResponse(respId, createdBy, {
    notes: body.refNumber ? `Ref: ${body.refNumber}` : "",
    amtcomments: body.comments || "",
    bidtotal: totalAmount,
    biddisc: discountAmount,
    grosstotal: grossTotal,
    supplier_name: supplierName,
    supplier_site: inviteObj.supplier_site || "",
    supplier_contact: inviteObj.supplier_contact || "",
  });
  await repo.markBidResponseAsProxy(respId);
  if (body.taxIncluded) {
    await repo.updateBidResponseTaxIncluded(respId, { tax_included: body.taxIncluded }, createdBy);
  }

  return { success: true, responseId: respId };
}

export async function getAuditHistoryForBid(bidId: number) {
  const data = await repo.getAuditHistoryForBid(bidId);
  return data;
}

export async function getAllReportStatus(bidId: number) {
  const data = await repo.getAllReportStatus(bidId);
  return data;
}

export async function generatepdfReview(suppId: string,type: string, userName: string) {
  const data = await helper.generatepdfReview(suppId, type, userName);
  return data;
}
export async function getResponseSummaryByBidId(bidId: number) {
  const data = await repo.getResponseSummaryByBidId(bidId);
  return data;
}

export async function getApprovalCount(bidId: string) {
  const data = await repo.getApprovalCount(bidId);
  return data;
}


export async function getBidResponseDetailsAndRemarks(bidId: number) 
{
  const data = await  repo.getBidResponseDetailsAndRemarks(bidId);
  return data; 
}
