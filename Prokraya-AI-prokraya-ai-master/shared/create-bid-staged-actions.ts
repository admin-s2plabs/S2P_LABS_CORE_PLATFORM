import type { ActiveCreatedBidContext, AgentSourcingResultSpec, CreateBidPreviewSpec } from "./agent-sourcing-preview";
import { bidTypeSupportsEvaluation, isCreateBidSuccess } from "./agent-sourcing-preview";

export interface StagedPendingAction {
  type: string;
  data: Record<string, unknown>;
  summary: string;
}

/** Rebuild executable pending actions from a create-bid preview spec (for chat edit follow-ups). */
export function buildPendingActionsFromCreateBidPreview(
  preview: CreateBidPreviewSpec,
): StagedPendingAction[] {
  const createType = preview.source === "create_bid_from_pr" ? "create_bid_from_pr" : "create_bid";
  const actions: StagedPendingAction[] = [
    {
      type: createType,
      data: {
        title: preview.title,
        bidType: preview.bidType,
        orgId: preview.orgId,
        orgName: preview.businessEntity,
        buyerId: preview.buyerId,
        buyerName: preview.buyer,
        requestorId: preview.requestorId,
        requestorName: preview.requestor,
        currency: preview.currency,
        openDate: preview.openDate,
        closingDate: preview.closeDate,
        department: preview.department,
        notes: preview.notes,
        paymentTermsId: preview.paymentTermsId,
        paymentTerms: preview.paymentTerms,
        deliveryLocationId: preview.deliveryLocationId,
        deliveryLocationName: preview.deliveryLocationName,
        envOpenDate: preview.envOpenDate,
        bidStyle: preview.bidStyle,
        prNumber: preview.prNumber,
      },
      summary: `Create ${preview.bidType}: ${preview.title}`,
    },
  ];

  // PR-sourced bids copy lines in createBidFromPR — do not queue separate add_bid_line actions.
  if (preview.source !== "create_bid_from_pr") {
    for (const line of preview.lineItems) {
      const description = line.description?.trim();
      if (!description) continue;
      actions.push({
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
  }

  for (const vendor of preview.suppliers) {
    const supplierName = vendor.supplierName?.trim();
    if (!supplierName) continue;
    actions.push({
      type: "add_bid_vendor",
      data: { supplierId: vendor.supplierId, supplierName },
      summary: `Invite ${supplierName} to bid`,
    });
  }

  // RFQs are not scored, so criteria/evaluators are never queued for them.
  if (bidTypeSupportsEvaluation(preview.bidType)) {
    for (const criterion of preview.evaluationCriteria) {
      const question = (criterion.question || criterion.category || "").trim();
      if (!question) continue;
      actions.push({
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
      actions.push({
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
    actions.push({
      type: "add_bid_clause",
      data: { type: clause.type || "terms", class_desc: classDesc },
      summary: `Add ${clause.type === "instructions" ? "instruction" : "term"}: ${classDesc}`,
    });
  }

  return actions;
}

function promoteQueuedLinesFromCreate<T extends StagedPendingAction>(
  actions: T[],
  active: ActiveCreatedBidContext,
): T[] {
  const promoted: T[] = [];
  for (const action of actions) {
    if (action.type === "create_bid" || action.type === "create_bid_from_pr") {
      const lines = (action.data?._queuedLines || []) as Array<
        Record<string, unknown> & { _summary?: string }
      >;
      if (lines.length > 0) {
        for (const line of lines) {
          const { _summary, ...data } = line;
          promoted.push({
            type: "add_bid_line",
            data: {
              ...data,
              bidId: active.bidId,
              bidNumber: active.bidNumber,
            },
            summary:
              _summary ||
              `Add ${String(data.description || "item")} (x${data.quantity ?? 1})`,
          } as unknown as T);
        }
        continue;
      }
    }
    promoted.push(action);
  }
  return promoted;
}

/** Resolve the most recently created bid from explicit context or persisted chat messages. */
export function resolveActiveCreatedBidFromHistory(
  explicit?: ActiveCreatedBidContext,
  history?: Array<{ role: string; content: string; actionResult?: AgentSourcingResultSpec }>,
): ActiveCreatedBidContext | undefined {
  if (explicit?.bidId) return explicit;
  if (!history?.length) return undefined;

  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "assistant") continue;
    if (isCreateBidSuccess(m.actionResult)) {
      return {
        bidId: m.actionResult.bidId,
        bidNumber: m.actionResult.bidNumber,
        title: m.actionResult.title,
        currency: m.actionResult.currency,
        bidType: m.actionResult.bidType,
      };
    }
    // Only treat create-success narratives as "created in this chat" (not viewed bid details).
    if (!/Bid created successfully/i.test(m.content || "")) continue;
    const idMatch = (m.content || "").match(/\(ID:\s*(\d+)\)/i);
    const numMatch =
      (m.content || "").match(/\*\*Bid Number:\*\*\s*([^\s(]+)/i) ||
      (m.content || "").match(/\b(RFQ|RFP|TND)\d{6}\b/i);
    const bidId = idMatch ? Number(idMatch[1]) : undefined;
    if (bidId && Number.isFinite(bidId)) {
      return {
        bidId,
        bidNumber: numMatch?.[1] || numMatch?.[0] || String(bidId),
      };
    }
  }
  return undefined;
}

/** Extract a bid number (RFQ/RFP/TND + digits) from assistant prose when structured headers are missing. */
function extractBidNumberFromAssistantProse(content: string): string | undefined {
  const text = String(content || "");
  if (!text.trim()) return undefined;

  const preferred = [
    /\bdetails\s+for\s+\*{0,2}((?:RFQ|RFP|TND)\d+)\*{0,2}\b/i,
    /\b(?:update\s+bid\s+header|bid\s+header\s+updated(?:\s+successfully)?)\s*(?:—|-|for)?\s*\*{0,2}((?:RFQ|RFP|TND)\d+)\*{0,2}\b/i,
    /\*\*Bid Number:\*\*\s*((?:RFQ|RFP|TND)\d+)/i,
    /\bBid:\s*\*{0,2}((?:RFQ|RFP|TND)\d+)\*{0,2}\b/i,
  ];
  for (const re of preferred) {
    const m = text.match(re);
    if (m?.[1]) return m[1].toUpperCase();
  }

  // Single-bid detail / action reply: exactly one bid number mentioned.
  const looksLikeSingleBidContext =
    /\b(title|type|status|currency|buyer|requestor|closing\s+date|start\s+date|bid\s+style|draft)\b/i.test(
      text,
    ) || /\b(details\s+for|shall\s+i\s+apply|update\s+bid\s+header)\b/i.test(text);
  if (!looksLikeSingleBidContext) return undefined;

  const all = Array.from(text.matchAll(/\b((?:RFQ|RFP|TND)\d{5,})\b/gi)).map((m) =>
    m[1].toUpperCase(),
  );
  const unique = Array.from(new Set(all));
  if (unique.length === 1) return unique[0];
  return undefined;
}

/** Last bid created OR viewed (get_bid_details) in this chat — target for header edits / "this bid". */
export function resolveDiscussedBidFromHistory(
  explicit?: ActiveCreatedBidContext,
  history?: Array<{ role: string; content: string; actionResult?: AgentSourcingResultSpec }>,
): ActiveCreatedBidContext | undefined {
  const created = resolveActiveCreatedBidFromHistory(explicit, history);
  if (created?.bidId) return created;
  if (!history?.length) return undefined;

  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "assistant") continue;
    const headerWithId = (m.content || "").match(
      /##\s*Bid:\s*((?:RFQ|RFP|TND)\d+)\s*\(ID:\s*(\d+)\)/i,
    );
    if (headerWithId) {
      const bidId = Number(headerWithId[2]);
      if (Number.isFinite(bidId)) {
        return { bidId, bidNumber: headerWithId[1].toUpperCase() };
      }
    }
    const headerOnly = (m.content || "").match(
      /##\s*Bid:\s*((?:RFQ|RFP|TND)\d+)\b/i,
    );
    if (headerOnly) {
      return { bidId: 0, bidNumber: headerOnly[1].toUpperCase() };
    }
    const idMatch = (m.content || "").match(/\(ID:\s*(\d+)\)/i);
    const numMatch =
      (m.content || "").match(/\*\*Bid Number:\*\*\s*([^\s(]+)/i) ||
      (m.content || "").match(/\b((?:RFQ|RFP|TND)\d{6})\b/i);
    const bidId = idMatch ? Number(idMatch[1]) : undefined;
    if (bidId && Number.isFinite(bidId)) {
      return {
        bidId,
        bidNumber: (numMatch?.[1] || String(bidId)).toUpperCase(),
      };
    }

    // LLM often rewrites get_bid_details as "Here are the details for **RFP260068**:"
    // without the structured ## Bid / (ID:) markers — still treat that as discussed bid.
    const proseBid = extractBidNumberFromAssistantProse(m.content || "");
    if (proseBid) {
      return { bidId: 0, bidNumber: proseBid };
    }
  }
  return undefined;
}

/** When a bid was already created in chat, strip duplicate create actions and inject bidId on line adds. */
export function sanitizeBundleForActiveCreatedBid<T extends StagedPendingAction>(
  actions: T[],
  active?: ActiveCreatedBidContext,
): T[] {
  if (!active?.bidId) return actions;

  const expanded = promoteQueuedLinesFromCreate(actions, active);

  const bidScopedTypes = new Set([
    "add_bid_line",
    "add_bid_vendor",
    "add_bid_requirement",
    "add_bid_clause",
    "add_bid_team_member",
    "update_bid_line",
    "update_bid_header",
    "remove_bid_line",
    "remove_bid_vendor",
    "remove_bid_requirement",
    "remove_bid_clause",
    "remove_bid_team_member",
  ]);

  const matchesActiveBid = (data: Record<string, unknown> | undefined) => {
    if (!data) return false;
    const dataBidId = data.bidId != null ? Number(data.bidId) : undefined;
    if (dataBidId === active.bidId) return true;
    const dataBidNum = String(data.bidNumber || "").trim().toUpperCase();
    const activeNum = String(active.bidNumber || "").trim().toUpperCase();
    return Boolean(dataBidNum && (dataBidNum === activeNum || dataBidNum === String(active.bidId)));
  };

  const injectActiveBidOnScopedActions = (list: T[]) =>
    list.map((action) => {
      if (!bidScopedTypes.has(action.type)) return action;
      if (matchesActiveBid(action.data)) return action;
      return {
        ...action,
        data: {
          ...action.data,
          bidId: active.bidId,
          bidNumber: active.bidNumber,
        },
        summary:
          typeof action.summary === "string"
            ? action.summary.replace(/\b(?:RFQ|RFP|TND)\d+\b/i, active.bidNumber || String(active.bidId))
            : action.summary,
      };
    });

  const hasCreate = expanded.some(
    (a) => a.type === "create_bid" || a.type === "create_bid_from_pr",
  );
  const hasAddLine = expanded.some((a) => a.type === "add_bid_line");
  if (hasCreate && hasAddLine) {
    return injectActiveBidOnScopedActions(
      expanded.filter((a) => a.type !== "create_bid" && a.type !== "create_bid_from_pr"),
    );
  }
  return injectActiveBidOnScopedActions(expanded);
}
