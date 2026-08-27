import type { CreateBidPreviewSpec } from "@shared/agent-sourcing-preview";
import { bidTypeSupportsEvaluation } from "@shared/agent-sourcing-preview";
import type { BidFormData } from "../bids/bid-form-sheet";
import { emptyBidForm } from "../bids/bid-form-sheet";
import { formatDateTimeInput, toLocalISOString } from "../bids/bid-form-utils";
import { formatDateTimeDisplay, formatPublishDateTimeLocal } from "@shared/publish-bid-dates";

export function formatCreateBidDateDisplay(value?: string): string | undefined {
  if (!value) return undefined;
  return formatDateTimeDisplay(value);
}

export interface PendingActionLike {
  type: string;
  data: Record<string, unknown>;
  summary: string;
}

const CHILD_TYPES = [
  "add_bid_line",
  "add_bid_vendor",
  "add_bid_requirement",
  "add_bid_clause",
  "add_bid_team_member",
];

export function previewToBidFormData(preview: CreateBidPreviewSpec): BidFormData {
  return {
    ...emptyBidForm,
    bid_title: preview.title,
    type: preview.bidType,
    currency: preview.currency || "",
    startdate: formatDateTimeInput(preview.openDate),
    enddate: formatDateTimeInput(preview.closeDate),
    org_id: preview.orgId != null ? String(preview.orgId) : "",
    buyer_id: preview.buyerId != null ? String(preview.buyerId) : "",
    buyer_name: preview.buyer || "",
    requestor_id: preview.requestorId != null ? String(preview.requestorId) : "",
    requestor_name: preview.requestor || "",
    payment_terms_id: preview.paymentTermsId || "",
    paymentterms: preview.paymentTerms || "",
    delivery_location_id: preview.deliveryLocationId || "",
    delivertto_location_name: preview.deliveryLocationName || "",
    env_open_date: formatDateTimeInput(preview.envOpenDate),
    bid_style: preview.bidStyle || (preview.bidType === "Tender" ? "Sealed" : "Open"),
  };
}

export function bidFormDataToPreview(
  form: BidFormData,
  prev: CreateBidPreviewSpec,
  orgName?: string,
): CreateBidPreviewSpec {
  return {
    ...prev,
    title: form.bid_title,
    bidType: form.type,
    currency: form.currency,
    openDate: form.startdate ? toLocalISOString(form.startdate) : "",
    closeDate: form.enddate ? toLocalISOString(form.enddate) : "",
    orgId: form.org_id || prev.orgId,
    businessEntity: orgName || prev.businessEntity,
    buyerId: form.buyer_id || prev.buyerId,
    buyer: form.buyer_name,
    requestorId: form.requestor_id || prev.requestorId,
    requestor: form.requestor_name,
    paymentTermsId: form.payment_terms_id,
    paymentTerms: form.paymentterms,
    deliveryLocationId: form.delivery_location_id,
    deliveryLocationName: form.delivertto_location_name,
    envOpenDate: form.env_open_date ? toLocalISOString(form.env_open_date) : undefined,
    bidStyle: form.bid_style,
  };
}

export function mergeCreateBidPreviewIntoActions(
  preview: CreateBidPreviewSpec,
  actions: PendingActionLike[],
): PendingActionLike[] {
  const createType = preview.source === "create_bid_from_pr" ? "create_bid_from_pr" : "create_bid";
  const existingCreate = actions.find((a) => a.type === createType);
  if (!existingCreate) return actions;

  const createData: Record<string, unknown> = {
    ...existingCreate.data,
    title: preview.title,
    bidType: preview.bidType,
    orgId: preview.orgId ?? existingCreate.data.orgId,
    orgName: preview.businessEntity ?? existingCreate.data.orgName,
    buyerId: preview.buyerId ?? existingCreate.data.buyerId,
    buyerName: preview.buyer ?? existingCreate.data.buyerName,
    requestorId: preview.requestorId ?? existingCreate.data.requestorId,
    requestorName: preview.requestor ?? existingCreate.data.requestorName,
    currency: preview.currency ?? existingCreate.data.currency,
    openDate: preview.openDate ?? existingCreate.data.openDate,
    closingDate: preview.closeDate ?? existingCreate.data.closingDate,
    department: preview.department ?? existingCreate.data.department,
    notes: preview.notes ?? existingCreate.data.notes,
    paymentTermsId: preview.paymentTermsId ?? existingCreate.data.paymentTermsId,
    paymentTerms: preview.paymentTerms ?? existingCreate.data.paymentTerms,
    deliveryLocationId: preview.deliveryLocationId ?? existingCreate.data.deliveryLocationId,
    deliveryLocationName: preview.deliveryLocationName ?? existingCreate.data.deliveryLocationName,
    envOpenDate: preview.envOpenDate ?? existingCreate.data.envOpenDate,
    bidStyle: preview.bidStyle ?? existingCreate.data.bidStyle,
  };

  const merged: PendingActionLike[] = [
    {
      ...existingCreate,
      data: createData,
      summary: `Create ${preview.bidType}: ${preview.title}`,
    },
  ];

  const previewLines = preview.lineItems.filter((line) => line.description?.trim());
  const actionLines = actions
    .filter((a) => a.type === "add_bid_line" && !a.data?.bidId)
    .map((a) => ({
      description: String(a.data?.description || ""),
      quantity: a.data?.quantity != null ? Number(a.data.quantity) : undefined,
      unitPrice: a.data?.unitPrice != null ? Number(a.data.unitPrice) : undefined,
      uom: a.data?.uom ? String(a.data.uom) : undefined,
      itemId: a.data?.itemId as string | undefined,
      lineType: a.data?.linetype as string | undefined,
      categoryName: a.data?.product_category as string | undefined,
      categoryCode: a.data?.product_category_id as string | undefined,
      needByFrom: a.data?.needbyfrom as string | undefined,
      needByTo: a.data?.needbyto as string | undefined,
    }))
    .filter((line) => line.description);
  const queuedLines = ((existingCreate.data._queuedLines || []) as Record<string, unknown>[])
    .map((line) => ({
      description: String(line.description || ""),
      quantity: line.quantity != null ? Number(line.quantity) : undefined,
      unitPrice: line.unitPrice != null ? Number(line.unitPrice) : undefined,
      uom: line.uom ? String(line.uom) : undefined,
      itemId: line.itemId as string | undefined,
      lineType: line.linetype as string | undefined,
      categoryName: line.product_category as string | undefined,
      categoryCode: line.product_category_id as string | undefined,
      needByFrom: line.needbyfrom as string | undefined,
      needByTo: line.needbyto as string | undefined,
    }))
    .filter((line) => line.description);
  const resolvedLineItems =
    preview.source === "create_bid_from_pr"
      ? []
      : previewLines.length > 0
        ? previewLines
        : actionLines.length > 0
          ? actionLines
          : queuedLines;

  for (const line of resolvedLineItems) {
    const description = line.description?.trim();
    if (!description) continue;
    merged.push({
      type: "add_bid_line",
      data: {
        description,
        quantity: line.quantity ?? 1,
        unitPrice: line.unitPrice,
        uom: line.uom,
        itemId: line.itemId,
        linetype: line.lineType,
        product_category: line.categoryName,
        product_category_id: line.categoryCode,
        needbyfrom: line.needByFrom,
        needbyto: line.needByTo,
      },
      summary: `Add ${description} (x${line.quantity ?? 1})`,
    });
  }

  for (const vendor of preview.suppliers) {
    const supplierName = vendor.supplierName?.trim();
    if (!supplierName) continue;
    merged.push({
      type: "add_bid_vendor",
      data: {
        supplierId: vendor.supplierId,
        supplierName,
      },
      summary: `Invite ${supplierName} to bid`,
    });
  }

  // RFQs are not scored, so criteria/evaluators are never merged back into the queue for them.
  if (bidTypeSupportsEvaluation(preview.bidType)) {
    for (const criterion of preview.evaluationCriteria) {
      const question = (criterion.question || criterion.category || "").trim();
      if (!question) continue;
      merged.push({
        type: "add_bid_requirement",
        data: {
          category: criterion.category || question,
          question,
          qvoption: "Required",
          qvtype: "Text",
          weight: criterion.weight ?? 20,
        },
        summary: `Add requirement: ${question}`,
      });
    }

    for (const evaluator of preview.evaluators) {
      const userName = evaluator.userName?.trim();
      if (!userName) continue;
      merged.push({
        type: "add_bid_team_member",
        data: {
          userId: evaluator.userId,
          userName,
          teamType: evaluator.teamType || "Technical Review Team",
        },
        summary: `Add ${userName} to ${evaluator.teamType || "Technical Review Team"}`,
      });
    }
  }

  for (const clause of preview.clauses) {
    const classDesc = clause.class_desc?.trim();
    if (!classDesc) continue;
    merged.push({
      type: "add_bid_clause",
      data: {
        type: clause.type || "terms",
        class_desc: classDesc,
      },
      summary: `Add ${clause.type === "instructions" ? "instruction" : "term"}: ${classDesc}`,
    });
  }

  for (const action of actions) {
    if (action.type === createType || CHILD_TYPES.includes(action.type)) continue;
    merged.push(action);
  }

  return merged;
}
