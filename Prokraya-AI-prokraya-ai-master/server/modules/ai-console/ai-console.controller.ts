import { Router } from "express";
import { upload } from "../_shared";
import * as service from "./ai-console.service";
import { AINotConfiguredError } from "../../services/ai-client";
import * as repo from "./ai-console.repository";
import { sanitizeNegotiationInsightsData, parseFinalAgentResponse, searchSuppliers as searchNegotiationSuppliers, refreshNegotiationSupplier, getSupplierBidsForScope, getBidResponses as getNegotiationBidResponses, getBidNegotiations } from "../../services/negotiation-agent-service";
import { getScopeOfSupply } from "../vendor-registration/vendor-registration.repository";
import { parseFinalAgentResponse as parseCostFinalAgentResponse } from "../../services/cost-intelligence-agent-service";
import { normalizeActivationPreferences } from "@shared/sourcing-activation-signals";
import { normalizeActivationPreferences as normalizeSupplierActivationPreferences } from "@shared/supplier-activation-signals";
import { logAudit } from "../administration/administration.service";
import { normalizeActivationPreferences as normalizeProcurementActivationPreferences } from "@shared/procurement-activation-signals";

function handleAIError(res: any, error: any, fallbackMsg: string) {
  if (error instanceof AINotConfiguredError) {
    return res.status(503).json({ error: error.message, code: "AI_NOT_CONFIGURED" });
  }
  console.error(fallbackMsg + ":", error);
  res.status(500).json({ error: fallbackMsg });
}

/** Prefer req.user (populated from session or Bearer) over raw session.user. */
function getRequestSessionUser(req: any) {
  return req.user || req.session?.user || null;
}

/**
 * Canonical user identifier. Must match how am_agent_conversations keys its rows, or a
 * user's feedback and their conversations would be attributed to different ids.
 */
function getCanonicalUserId(req: any): string | null {
  const user = getRequestSessionUser(req);
  return user?.id || user?.userId || null;
}

/** Fire-and-forget audit log, mirroring the pattern in vendors.controller.ts. */
function audit(req: any, auditKey: string, auditAction: string, auditMessage: string, module: string) {
  const user = getRequestSessionUser(req);
  logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: user?.name || "System",
    userId: user?.id || user?.userId || "system",
    module,
  }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));
}

const router = Router();

/**
 * ─── AI agent feedback (Knowledge Layer, Phase 4) ────────────────────────────────
 * Thumbs up/down on an assistant reply, plus an optional comment. A thumbs-down is
 * distilled in the background into a short lesson that is injected into THIS USER's
 * next similar prompt. All rows are per-user and per-agent; nothing here can affect
 * another user's responses.
 */
router.post("/api/agent-feedback", async (req, res) => {
  try {
    const userId = getCanonicalUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const { agentType, conversationId, messageIndex, rating, comment, queryText, responseText } = req.body ?? {};

    if (!agentType || typeof agentType !== "string") {
      return res.status(400).json({ error: "agentType is required" });
    }
    if (rating !== 1 && rating !== -1) {
      return res.status(400).json({ error: "rating must be 1 (up) or -1 (down)" });
    }
    if (!Number.isInteger(messageIndex) || messageIndex < 0) {
      return res.status(400).json({ error: "messageIndex must be a non-negative integer" });
    }

    const { recordFeedback, supersedeConflictingLessons } = await import("../../services/knowledge-layer/feedback-service");

    const { id } = await recordFeedback({
      userId,
      agentType,
      conversationId: Number.isInteger(conversationId) ? conversationId : null,
      messageIndex,
      rating,
      comment,
      queryText,
      responseText,
    });

    res.json({ id, ok: true });

    audit(
      req,
      "AI_AGENT_FEEDBACK",
      rating === 1 ? "CREATE" : "UPDATE",
      `${rating === 1 ? "Positive" : "Negative"} feedback on ${agentType} agent response (message ${messageIndex})`,
      "AI Console",
    );

    // Everything below runs after the response has been sent.
    if (rating === -1) {
      const { distillFeedbackInBackground } = await import("../../services/knowledge-layer/feedback-distiller");
      distillFeedbackInBackground({ id, userId, agentType, queryText: queryText ?? null, responseText: responseText ?? null, comment: comment ?? null });
    } else {
      // A thumbs-up retires this user's stale corrections on the same topic.
      void supersedeConflictingLessons(userId, agentType, queryText ?? "");
    }
  } catch (error) {
    handleAIError(res, error, "Failed to record feedback");
  }
});

/** This user's own feedback history. Read-only, so no audit log. */
router.get("/api/agent-feedback/mine", async (req, res) => {
  try {
    const userId = getCanonicalUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const agentType = String(req.query.agentType || "");
    if (!agentType) return res.status(400).json({ error: "agentType is required" });

    const { listFeedbackForUser } = await import("../../services/knowledge-layer/feedback-service");
    res.json({ feedback: await listFeedbackForUser(userId, agentType) });
  } catch (error) {
    handleAIError(res, error, "Failed to load feedback");
  }
});

/** How much feedback this user has for an agent — shown in the reset confirmation. */
router.get("/api/agent-feedback/count", async (req, res) => {
  try {
    const userId = getCanonicalUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const agentType = String(req.query.agentType || "");
    if (!agentType) return res.status(400).json({ error: "agentType is required" });

    const { countFeedbackForUser } = await import("../../services/knowledge-layer/feedback-service");
    res.json(await countFeedbackForUser(userId, agentType));
  } catch (error) {
    handleAIError(res, error, "Failed to count feedback");
  }
});

/**
 * Reset — permanently delete THIS user's feedback for ONE agent.
 *
 * Both `user_id` and `agent_type` are in the DELETE predicate, so no other user's rows and
 * no other agent's rows can be affected. Irreversible, hence the UI confirmation step.
 */
router.delete("/api/agent-feedback/mine", async (req, res) => {
  try {
    const userId = getCanonicalUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const agentType = String(req.query.agentType || req.body?.agentType || "");
    if (!agentType) return res.status(400).json({ error: "agentType is required" });

    const { deleteAllFeedbackForUser } = await import("../../services/knowledge-layer/feedback-service");
    const deleted = await deleteAllFeedbackForUser(userId, agentType);

    res.json({ ok: true, deleted });

    audit(req, "AI_AGENT_FEEDBACK", "DELETE", `Reset all ${agentType} agent feedback (${deleted} row(s))`, "AI Console");
  } catch (error) {
    handleAIError(res, error, "Failed to reset feedback");
  }
});

/** Retract (or restore) one of this user's own lessons. Ownership is in the SQL predicate. */
router.patch("/api/agent-feedback/:id", async (req, res) => {
  try {
    const userId = getCanonicalUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid feedback id" });

    const status = req.body?.status;
    if (status !== "disabled" && status !== "active") {
      return res.status(400).json({ error: "status must be 'active' or 'disabled'" });
    }

    const { setFeedbackStatusForUser } = await import("../../services/knowledge-layer/feedback-service");
    const updated = await setFeedbackStatusForUser(id, userId, status);
    if (!updated) return res.status(404).json({ error: "Feedback not found" });

    res.json({ ok: true });

    audit(req, "AI_AGENT_FEEDBACK", "UPDATE", `Feedback ${id} set to ${status}`, "AI Console");
  } catch (error) {
    handleAIError(res, error, "Failed to update feedback");
  }
});

/**
 * Example-prompt chips for an agent page, served from the knowledge layer
 * (ai/prompts/suggestions/) instead of being compiled into the client bundle.
 * Read-only, so no audit log is required.
 */
router.get("/api/agent-prompts/:agentType", async (req, res) => {
  try {
    const { loadSuggestions } = await import("../../services/knowledge-layer/suggestions-loader");
    const suggestions = loadSuggestions(req.params.agentType);
    if (!suggestions) {
      return res.status(404).json({ error: `No prompt suggestions for agent "${req.params.agentType}"` });
    }
    res.json(suggestions);
  } catch (error) {
    handleAIError(res, error, "Failed to load agent prompt suggestions");
  }
});

router.post("/api/classify-scope", async (req, res) => {
  try {
    const { scope } = req.body;

    if (!scope || typeof scope !== "string") {
      return res.status(400).json({ error: "Scope description is required" });
    }

    const categories = service.classifyScope(scope);
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: "Failed to classify scope" });
  }
});

router.post("/api/documents/extract", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const documentType = req.body.documentType;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!documentType) {
      return res.status(400).json({ error: "Document type is required" });
    }

    const result = await service.extractDocument(file, documentType);
    res.json(result);
  } catch (error) {
    handleAIError(res, error, "Failed to extract document data");
  }
});

router.get("/api/vendors/:id/ai-analysis", async (req, res) => {
  try {
    const vendorId = req.params.id;
    const forceRefresh = req.query.refresh === "true";

    const analysis = await service.getVendorAiAnalysis(vendorId, forceRefresh);

    if (!analysis) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    res.json(analysis);
  } catch (error) {
    handleAIError(res, error, "Failed to analyze vendor");
  }
});

router.post("/api/vendor/autofill", async (req, res) => {
  try {
    const { extractedData } = req.body;

    if (!extractedData || typeof extractedData !== "object") {
      return res.status(400).json({ error: "Extracted data is required" });
    }

    const result = await service.autofillVendor(extractedData);
    res.json(result);
  } catch (error) {
    handleAIError(res, error, "Failed to map extracted data");
  }
});

router.post("/api/vendor-agent/query", async (req, res) => {
  try {
    const {
      prompt,
      conversationHistory,
      confirmAction,
      mentions,
      activationContext,
      activationPreferences,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
    } = req.body;
    if (!prompt && !confirmAction) {
      return res.status(400).json({ error: "Prompt or confirmAction is required" });
    }

    const sessionUser = getRequestSessionUser(req);
    const result = await service.vendorAgentQuery(
      prompt || "",
      conversationHistory || [],
      sessionUser,
      confirmAction,
      mentions,
      activationContext,
      normalizeSupplierActivationPreferences(activationPreferences),
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
    );
    res.json(result);
  } catch (error) {
    handleAIError(res, error, "Failed to process vendor query");
  }
});

router.get("/api/vendor-agent/vendors/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset ?? 0);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;
    const scopeOfSupplyOnly = req.query.scope_of_supply_only === "true";

    if (!q) {
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), 100)
        : 50;
      const { vendors, hasMore } = await service.browseVendorAgentVendors(offset, limit, scopeOfSupplyOnly);
      return res.json({ vendors, hasMore, offset, limit });
    }

    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 25) : 8;
    const vendors = await service.searchVendorAgentVendors(q, limit, scopeOfSupplyOnly);
    return res.json({ vendors });
  } catch (error) {
    return res.status(500).json({ error: "Failed to search vendors" });
  }
});

router.post("/api/procurement-agent/query", async (req, res) => {
  try {
    const {
      prompt,
      conversationHistory,
      confirmAction, activationContext, activationPreferences,
      mentions,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      applyFeedback,
      feedbackJustReset,
      poMentions,
      invoiceMentions,
    } = req.body;
    if (!prompt && !confirmAction) {
      return res.status(400).json({ error: "Prompt or confirmAction is required" });
    }

    const sessionUser = getRequestSessionUser(req);
    const result = await service.procurementAgentQuery(
      prompt || "",
      conversationHistory || [],
      sessionUser,
      confirmAction,
      activationContext,
      normalizeProcurementActivationPreferences(activationPreferences),
      mentions,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      // Only an explicit `false` disables personalisation, so any existing caller that
      // omits the flag keeps today's behaviour.
      applyFeedback !== false,
      feedbackJustReset === true,
      poMentions,
      invoiceMentions,
    );
    res.json(result);
  } catch (error) {
    handleAIError(res, error, "Failed to process procurement query");
  }
});

router.get("/api/procurement-agent/activation-signals", async (req, res) => {
  try {
    const sessionUser = getRequestSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const { getProcurementActivationSignals } = await import(
      "../../services/procurement-activation-signals.service"
    );
    // Always return real pending counts for the popover. Agent visibility is gated
    // separately via activationPreferences on query/stream requests.
    const result = await getProcurementActivationSignals(sessionUser);
    res.json(result);
  } catch (error: any) {
    console.error("Failed to fetch procurement activation signals:", error);
    res.status(500).json({ error: error.message || "Failed to fetch activation signals" });
  }
});

router.get("/api/payables-agent/activation-signals", async (req, res) => {
  try {
    const sessionUser = getRequestSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const { getPayablesActivationSignals } = await import(
      "../../services/payables-activation-signals.service"
    );
    // Counts remain live for the popover. Query/stream preferences separately
    // determine whether approval requests are exposed to the agent.
    const result = await getPayablesActivationSignals(sessionUser);
    res.json(result);
  } catch (error: any) {
    console.error("Failed to fetch payables activation signals:", error);
    res.status(500).json({ error: error.message || "Failed to fetch activation signals" });
  }
});

router.post("/api/payables-agent/query", async (req, res) => {
  try {
    const {
      prompt,
      conversationHistory,
      confirmAction,
      activationContext,
      activationPreferences,
      mentions,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
    } = req.body;
    if (!prompt && !confirmAction) {
      return res.status(400).json({ error: "Prompt or confirmAction is required" });
    }

    const sessionUser = getRequestSessionUser(req);
    const result = await service.payablesAgentQuery(
      prompt || "",
      conversationHistory || [],
      sessionUser,
      confirmAction,
      mentions,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
      activationContext,
      activationPreferences,
    );
    res.json(result);
  } catch (error) {
    handleAIError(res, error, "Failed to process payables query");
  }
});

router.get("/api/sourcing-agent/activation-signals", async (req, res) => {
  try {
    const sessionUser = getRequestSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const { getActivationSignals } = await import("../../services/sourcing-activation-signals.service");
    // Always return real pending counts for the popover. Agent visibility is gated
    // separately via activationPreferences on query/stream requests.
    const result = await getActivationSignals(sessionUser);
    res.json(result);
  } catch (error: any) {
    console.error("Failed to fetch sourcing activation signals:", error);
    res.status(500).json({ error: error.message || "Failed to fetch activation signals" });
  }
});

router.get("/api/vendor-agent/activation-signals", async (req, res) => {
  try {
    const sessionUser = getRequestSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const { getSupplierActivationSignals } = await import(
      "../../services/supplier-activation-signals.service"
    );
    // Always return real pending counts for the popover. Agent visibility is gated
    // separately via activationPreferences on query/stream requests.
    const result = await getSupplierActivationSignals(sessionUser);
    res.json(result);
  } catch (error: any) {
    console.error("Failed to fetch supplier activation signals:", error);
    res.status(500).json({ error: error.message || "Failed to fetch activation signals" });
  }
});

router.post("/api/sourcing-agent/query", async (req, res) => {
  try {
    const { prompt, conversationHistory, confirmAction, mentions, businessUserMentions, itemMentions, activationPreferences } =
      req.body;
    if (!prompt && !confirmAction) {
      return res.status(400).json({ error: "Prompt or confirmAction is required" });
    }

    const sessionUser = getRequestSessionUser(req);
    const result = await service.sourcingAgentQuery(
      prompt || "",
      conversationHistory || [],
      sessionUser,
      confirmAction,
      mentions,
      businessUserMentions,
      itemMentions,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      normalizeActivationPreferences(activationPreferences),
    );
    res.json(result);
  } catch (error) {
    handleAIError(res, error, "Failed to process sourcing query");
  }
});

router.get("/api/negotiation-agent/suppliers/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const rawLimit = Number(req.query.limit);
    // Default (8) keeps the @mention typeahead lightweight; the negotiation
    // start card's "Select Supplier" dropdown passes a high limit to list
    // effectively all active suppliers instead of a truncated top-N.
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 8;
    const suppliers = await searchNegotiationSuppliers(q, limit);
    res.json({ suppliers });
  } catch (error) {
    res.status(500).json({ error: "Failed to search suppliers" });
  }
});

// Scope-of-supply items actually registered on the supplier's profile — powers
// the "Scope of Supply (SOS)" picker on the negotiation start card. Reuses the
// same query vendor-registration's own summary/edit screens read from, so it
// only ever shows what that supplier has on file (no catalog-wide fallback).
router.get("/api/negotiation-agent/suppliers/:id/scope-of-supply", async (req, res) => {
  try {
    const supplierId = Number(req.params.id);
    if (!supplierId || Number.isNaN(supplierId)) {
      return res.status(400).json({ error: "Valid supplier id is required" });
    }
    const items = await getScopeOfSupply(supplierId);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch scope of supply" });
  }
});

// Bids the supplier responded to for the chosen Scope of Supply item — powers
// the negotiation start card's "Available Bids" step, shown between the SOS
// picker and delivery location so "Run Negotiation Analysis" can ground the
// analysis in a concrete bid instead of a freeform prompt.
router.get("/api/negotiation-agent/suppliers/:id/bids", async (req, res) => {
  try {
    const supplierId = Number(req.params.id);
    if (!supplierId || Number.isNaN(supplierId)) {
      return res.status(400).json({ error: "Valid supplier id is required" });
    }
    const scope = String(req.query.scope || "").trim();
    const { bids, itemMatched } = await getSupplierBidsForScope(supplierId, scope);
    res.json({ bids, itemMatched });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bids for supplier" });
  }
});

// Latest Submitted quote per supplier for the negotiation start card's
// "Select Supplier Quotation" step — deduped here (version DESC per supplier)
// instead of in the shared /api/dbo/bids/:id/responses endpoint, which other
// modules rely on returning every Submitted row.
router.get("/api/negotiation-agent/bids/:id/responses", async (req, res) => {
  try {
    const bidId = Number(req.params.id);
    if (!bidId || Number.isNaN(bidId)) {
      return res.status(400).json({ error: "Valid bid id is required" });
    }
    const responses = await getNegotiationBidResponses(bidId);
    res.json({ responses });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bid responses" });
  }
});

// Past negotiation rounds on a bid — powers the "Previous Negotiations" table
// on the strategy panel so the buyer sees who has already been negotiated with
// before opening another round.
router.get("/api/negotiation-agent/bids/:id/negotiations", async (req, res) => {
  try {
    const bidId = Number(req.params.id);
    if (!bidId || Number.isNaN(bidId)) {
      return res.status(400).json({ error: "Valid bid id is required" });
    }
    const negotiations = await getBidNegotiations(bidId, String(req.query.item || ""));
    res.json({ negotiations });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bid negotiations" });
  }
});

router.post("/api/negotiation-agent/query", async (req, res) => {
  try {
    const {
      prompt,
      conversationHistory,
      confirmAction,
      mentions,
      preferredCurrency,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
    } = req.body;
    if (!prompt && !confirmAction) {
      return res.status(400).json({ error: "Prompt or confirmAction is required" });
    }

    const sessionUser = getRequestSessionUser(req);
    const result = await service.negotiationAgentQuery(
      prompt || "",
      conversationHistory || [],
      sessionUser,
      confirmAction,
      mentions,
      preferredCurrency,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
    );
    res.json(result);
  } catch (error) {
    handleAIError(res, error, "Failed to process negotiation query");
  }
});

router.post("/api/cost-intelligence-agent/query", async (req, res) => {
  try {
    const {
      prompt,
      conversationHistory,
      confirmAction,
      mentions,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
    } = req.body;
    if (!prompt && !confirmAction) {
      return res.status(400).json({ error: "Prompt or confirmAction is required" });
    }

    const sessionUser = getRequestSessionUser(req);
    const result = await service.costIntelligenceAgentQuery(
      prompt || "",
      conversationHistory || [],
      sessionUser,
      confirmAction,
      mentions,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
    );
    res.json(result);
  } catch (error) {
    handleAIError(res, error, "Failed to process cost intelligence query");
  }
});

router.post("/api/spend-agent/query", async (req, res) => {
  try {
    const { prompt, conversationHistory } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const sessionUser = getRequestSessionUser(req);
    const result = await service.spendAgentQuery(prompt, conversationHistory || [], sessionUser);
    res.json(result);
  } catch (error) {
    handleAIError(res, error, "Failed to process spend query");
  }
});

router.get("/api/eva-agent/snapshot", async (req, res) => {
  try {
    const { getProcurementSnapshot, generateBriefing } = await import("../../services/eva-agent-service");
    const sessionUser = getRequestSessionUser(req);
    const userName = sessionUser?.name?.split(" ")[0] || sessionUser?.userName || "";
    const snapshot = await getProcurementSnapshot();
    const briefing = await generateBriefing(snapshot, userName);
    res.json({ snapshot, briefing });
  } catch (error) {
    handleAIError(res, error, "Failed to generate procurement snapshot");
  }
});

router.post("/api/eva-agent/query", async (req, res) => {
  try {
    const { processEvaQuery } = await import("../../services/eva-agent-service");
    const { prompt, conversationHistory, confirmAction } = req.body;
    if (!prompt && !confirmAction) {
      return res.status(400).json({ error: "Prompt or confirmAction is required" });
    }

    const sessionUser = getRequestSessionUser(req);
    const result = await processEvaQuery(prompt || "", conversationHistory || [], sessionUser, confirmAction);
    res.json(result);
  } catch (error) {
    handleAIError(res, error, "Failed to process EVA query");
  }
});

// ─── SSE Streaming Helper ─────────────────────────────────────────────────────

function streamTextSSE(
  res: any,
  text: string,
  pendingAction?: any,
  chart?: any,
  charts?: any,
  pendingActions?: any,
  compareBids?: any,
  sourcingTaskFlow?: any,
  bidApprovalReview?: any,
  openEnvelopeReview?: any,
  technicalReview?: any,
  commercialReview?: any,
  technicalEvaluation?: any,
  commercialEvaluation?: any,
  awardingReview?: any,
  bidAwardApprovalReview?: any,
  bidAwardSubmitReview?: any,
  actionPreview?: any,
  actionResult?: any,
  supplierTaskFlow?: any,
  supplierApprovalReview?: any,
  createBidSourceChoice?: any,
  procurementTaskFlow?: any,
  budgetApprovalReview?: any,
  prApprovalReview?: any,
  poApprovalReview?: any,
  procurementAlertReview?: any,
  supplierApprovalCommand?: any,
  procurementApprovalCommand?: any,
  payablesTaskFlow?: any,
  payablesInvoiceApprovalReview?: any,
  payablesApprovalCommand?: any,
) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const words = text.match(/\S+\s*/g) || [text];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 3) {
    chunks.push(words.slice(i, i + 3).join(""));
  }

  let i = 0;
  const emit = () => {
    if (i >= chunks.length) {
      const donePayload: Record<string, unknown> = {
        type: "done",
        pendingAction: pendingAction || null,
        pendingActions: pendingActions ?? null,
        chart: chart ?? null,
        compareBids: compareBids ?? null,
        sourcingTaskFlow: sourcingTaskFlow ?? null,
        bidApprovalReview: bidApprovalReview ?? null,
        openEnvelopeReview: openEnvelopeReview ?? null,
        technicalReview: technicalReview ?? null,
        commercialReview: commercialReview ?? null,
        technicalEvaluation: technicalEvaluation ?? null,
        commercialEvaluation: commercialEvaluation ?? null,
        awardingReview: awardingReview ?? null,
        bidAwardApprovalReview: bidAwardApprovalReview ?? null,
        bidAwardSubmitReview: bidAwardSubmitReview ?? null,
        actionPreview: actionPreview ?? null,
        actionResult: actionResult ?? null,
        supplierTaskFlow: supplierTaskFlow ?? null,
        supplierApprovalReview: supplierApprovalReview ?? null,
        createBidSourceChoice: createBidSourceChoice ?? null,
        procurementTaskFlow: procurementTaskFlow ?? null,
        budgetApprovalReview: budgetApprovalReview ?? null,
        prApprovalReview: prApprovalReview ?? null,
        poApprovalReview: poApprovalReview ?? null,
        procurementAlertReview: procurementAlertReview ?? null,
        supplierApprovalCommand: supplierApprovalCommand ?? null,
        procurementApprovalCommand: procurementApprovalCommand ?? null,
        payablesTaskFlow: payablesTaskFlow ?? null,
        payablesInvoiceApprovalReview: payablesInvoiceApprovalReview ?? null,
        payablesApprovalCommand: payablesApprovalCommand ?? null,
      };
      if (Array.isArray(charts) && charts.length > 0) {
        donePayload.charts = charts;
      }
      res.write(`data: ${JSON.stringify(donePayload)}\n\n`);
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({ type: "token", content: chunks[i++] })}\n\n`);
    setTimeout(emit, 15);
  };
  emit();
}

// ─── Streaming Agent Endpoints ────────────────────────────────────────────────

router.post("/api/vendor-agent/query/stream", async (req, res) => {
  const {
    prompt,
    conversationHistory,
    confirmAction,
    mentions,
    activationContext,
    activationPreferences,
    businessUserMentions,
    itemMentions,
    bidMentions,
    prMentions,
    poMentions,
    invoiceMentions,
  } = req.body;
  if (!prompt && !confirmAction) return res.status(400).json({ error: "Prompt or confirmAction is required" });
  const sessionUser = getRequestSessionUser(req);
  try {
    const result = await service.vendorAgentQuery(
      prompt || "",
      conversationHistory || [],
      sessionUser,
      confirmAction,
      mentions,
      activationContext,
      normalizeSupplierActivationPreferences(activationPreferences),
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
    );
    streamTextSSE(
      res,
      result.response,
      (result as any).pendingAction,
      (result as any).chart,
      (result as any).charts,
      undefined, // pendingActions
      undefined, // compareBids
      undefined, // sourcingTaskFlow
      undefined, // bidApprovalReview
      undefined, // openEnvelopeReview
      undefined, // technicalReview
      undefined, // commercialReview
      undefined, // technicalEvaluation
      undefined, // commercialEvaluation
      undefined, // awardingReview
      undefined, // bidAwardApprovalReview
      undefined, // bidAwardSubmitReview
      undefined, // actionPreview
      undefined, // actionResult
      (result as any).supplierTaskFlow,
      (result as any).supplierApprovalReview,
      undefined, // createBidSourceChoice
      undefined, // procurementTaskFlow
      undefined, // budgetApprovalReview
      undefined, // prApprovalReview
      undefined, // poApprovalReview
      undefined, // procurementAlertReview
      (result as any).supplierApprovalCommand,
    );
  } catch (error: any) {
    const msg = error instanceof AINotConfiguredError
      ? "AI model not configured. Please go to **Administration → AI Model Configuration** to set up and activate an AI provider before using AI features."
      : "I'm having trouble connecting to the AI service. Please try again in a moment.";
    streamTextSSE(res, msg);
  }
});

router.post("/api/sourcing-agent/bid-remediation-preview", async (req, res) => {
  const { bidId, resolveCriteria, resolveTeam, resolveVendors, resolveClauses } = req.body;
  if (!bidId) return res.status(400).json({ error: "bidId is required" });
  try {
    const result = await service.bidRemediationPreview(Number(bidId), {
      resolveCriteria,
      resolveTeam,
      resolveVendors,
      resolveClauses,
    });
    res.json(result);
  } catch (error: any) {
    handleAIError(res, error, "Failed to generate remediation preview");
  }
});

/**
 * Builds (or rebuilds) a PR recommendation. Read-only — it computes a proposal
 * and creates nothing — so no audit log is required here; the audit is emitted
 * when the requisition is actually created.
 */
router.post("/api/procurement-agent/pr-recommendation", async (req, res) => {
  const request = typeof req.body?.request === "string" ? req.body.request.trim() : "";
  if (!request) {
    return res.status(400).json({ error: "request is required" });
  }
  const sessionUser = getRequestSessionUser(req);
  if (!sessionUser) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    const result = await service.prRecommendation({
      request,
      sessionUser: {
        id: Number(sessionUser.id),
        name: sessionUser.name || sessionUser.userName || sessionUser.email || "Current user",
        department: sessionUser.departmentName ?? null,
      },
      overrides: req.body?.overrides ?? undefined,
    });
    res.json(result);
  } catch (error: any) {
    handleAIError(res, error, "Failed to build PR recommendation");
  }
});

/**
 * Builds (or rebuilds) a Direct PO recommendation. Read-only — creates nothing.
 * Audit is emitted when the PO is actually created from the card Confirm.
 */
router.post("/api/procurement-agent/po-recommendation", async (req, res) => {
  const request = typeof req.body?.request === "string" ? req.body.request.trim() : "";
  if (!request) {
    return res.status(400).json({ error: "request is required" });
  }
  const sessionUser = getRequestSessionUser(req);
  if (!sessionUser) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    const result = await service.poRecommendation({
      request,
      sessionUser: {
        id: Number(sessionUser.id),
        name: sessionUser.name || sessionUser.userName || sessionUser.email || "Current user",
        department: sessionUser.departmentName ?? null,
      },
      overrides: req.body?.overrides ?? undefined,
    });
    res.json(result);
  } catch (error: any) {
    handleAIError(res, error, "Failed to build PO recommendation");
  }
});

router.post("/api/sourcing-agent/publish-preview", async (req, res) => {
  const bidId = Number(req.body?.bidId);
  if (!Number.isFinite(bidId) || bidId <= 0) {
    return res.status(400).json({ error: "bidId is required" });
  }
  try {
    const result = await service.bidPublishPreview(bidId);
    res.json(result);
  } catch (error: any) {
    if (error?.status === 400) {
      return res.status(400).json({ error: error.message || "Failed to build publish preview" });
    }
    handleAIError(res, error, "Failed to build publish preview");
  }
});

router.post("/api/sourcing-agent/query/stream", async (req, res) => {
  const {
    prompt,
    conversationHistory,
    confirmAction,
    mentions,
    businessUserMentions,
    itemMentions,
    bidMentions,
    prMentions,
    poMentions,
    invoiceMentions,
    stagedPendingActions,
    stagedActionPreview,
    activeCreatedBid,
    activationContext,
    activationPreferences,
  } = req.body;
  if (!prompt && !confirmAction) return res.status(400).json({ error: "Prompt or confirmAction is required" });
  const sessionUser = getRequestSessionUser(req);
  try {
    const result = await service.sourcingAgentQuery(
      prompt || "",
      conversationHistory || [],
      sessionUser,
      confirmAction,
      mentions,
      businessUserMentions,
      itemMentions,
      bidMentions,
      activationContext,
      prMentions,
      stagedPendingActions,
      stagedActionPreview,
      activeCreatedBid,
      normalizeActivationPreferences(activationPreferences),
      poMentions,
      invoiceMentions,
    );
    streamTextSSE(
      res,
      result.response,
      (result as any).pendingAction,
      (result as any).chart,
      undefined,
      (result as any).pendingActions,
      (result as any).compareBids,
      (result as any).sourcingTaskFlow,
      (result as any).bidApprovalReview,
      (result as any).openEnvelopeReview,
      (result as any).technicalReview,
      (result as any).commercialReview,
      (result as any).technicalEvaluation,
      (result as any).commercialEvaluation,
      (result as any).awardingReview,
      (result as any).bidAwardApprovalReview,
      (result as any).bidAwardSubmitReview,
      (result as any).actionPreview,
      (result as any).actionResult,
      undefined, // supplierTaskFlow
      undefined, // supplierApprovalReview
      (result as any).createBidSourceChoice,
    );
  } catch (error: any) {
    const msg = error instanceof AINotConfiguredError
      ? "AI model not configured. Please go to **Administration → AI Model Configuration** to set up and activate an AI provider before using AI features."
      : "I'm having trouble connecting to the AI service. Please try again in a moment.";
    streamTextSSE(res, msg);
  }
});

router.post("/api/procurement-agent/query/stream", async (req, res) => {
  const {
    prompt,
    conversationHistory,
    confirmAction, activationContext, activationPreferences,
    mentions,
    businessUserMentions,
    itemMentions,
    bidMentions,
    prMentions,
    applyFeedback,
    feedbackJustReset,
    poMentions,
    invoiceMentions,
  } = req.body;
  if (!prompt && !confirmAction) return res.status(400).json({ error: "Prompt or confirmAction is required" });
  const sessionUser = getRequestSessionUser(req);
  try {
    const result = await service.procurementAgentQuery(
      prompt || "",
      conversationHistory || [],
      sessionUser,
      confirmAction,
      activationContext,
      normalizeProcurementActivationPreferences(activationPreferences),
      mentions,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      applyFeedback !== false,
      feedbackJustReset === true,
      poMentions,
      invoiceMentions,
    );
    streamTextSSE(
      res,
      result.response,
      (result as any).pendingAction,
      (result as any).chart,
      undefined, // charts
      undefined, // pendingActions
      undefined, // compareBids
      undefined, // sourcingTaskFlow
      undefined, // bidApprovalReview
      undefined, // openEnvelopeReview
      undefined, // technicalReview
      undefined, // commercialReview
      undefined, // technicalEvaluation
      undefined, // commercialEvaluation
      undefined, // awardingReview
      undefined, // bidAwardApprovalReview
      undefined, // bidAwardSubmitReview
      (result as any).actionPreview,
      undefined, // actionResult
      undefined, // supplierTaskFlow
      undefined, // supplierApprovalReview
      undefined, // createBidSourceChoice
      (result as any).procurementTaskFlow,
      (result as any).budgetApprovalReview,
      (result as any).prApprovalReview,
      (result as any).poApprovalReview,
      (result as any).procurementAlertReview,
      undefined, // supplierApprovalCommand
      (result as any).procurementApprovalCommand,
    );
  } catch (error: any) {
    const msg = error instanceof AINotConfiguredError
      ? "AI model not configured. Please go to **Administration → AI Model Configuration** to set up and activate an AI provider before using AI features."
      : "I'm having trouble connecting to the AI service. Please try again in a moment.";
    streamTextSSE(res, msg);
  }
});

router.post("/api/payables-agent/query/stream", async (req, res) => {
  const {
    prompt,
    conversationHistory,
    confirmAction,
    activationContext,
    activationPreferences,
    mentions,
    businessUserMentions,
    itemMentions,
    bidMentions,
    prMentions,
    poMentions,
    invoiceMentions,
  } = req.body;
  if (!prompt && !confirmAction) return res.status(400).json({ error: "Prompt or confirmAction is required" });
  const sessionUser = getRequestSessionUser(req);
  try {
    const result = await service.payablesAgentQuery(
      prompt || "",
      conversationHistory || [],
      sessionUser,
      confirmAction,
      mentions,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
      activationContext,
      activationPreferences,
    );
    streamTextSSE(
      res,
      result.response,
      (result as any).pendingAction,
      (result as any).chart,
      undefined, // charts
      (result as any).pendingActions,
      undefined, // compareBids
      undefined, // sourcingTaskFlow
      undefined, // bidApprovalReview
      undefined, // openEnvelopeReview
      undefined, // technicalReview
      undefined, // commercialReview
      undefined, // technicalEvaluation
      undefined, // commercialEvaluation
      undefined, // awardingReview
      undefined, // bidAwardApprovalReview
      undefined, // bidAwardSubmitReview
      undefined, // actionPreview
      undefined, // actionResult
      undefined, // supplierTaskFlow
      undefined, // supplierApprovalReview
      undefined, // createBidSourceChoice
      undefined, // procurementTaskFlow
      undefined, // budgetApprovalReview
      undefined, // prApprovalReview
      undefined, // poApprovalReview
      undefined, // procurementAlertReview
      undefined, // supplierApprovalCommand
      undefined, // procurementApprovalCommand
      (result as any).payablesTaskFlow,
      (result as any).payablesInvoiceApprovalReview,
      (result as any).payablesApprovalCommand,
    );
  } catch (error: any) {
    const msg = error instanceof AINotConfiguredError
      ? "AI model not configured. Please go to **Administration → AI Model Configuration** to set up and activate an AI provider before using AI features."
      : "I'm having trouble connecting to the AI service. Please try again in a moment.";
    streamTextSSE(res, msg);
  }
});

router.post("/api/negotiation-agent/query/stream", async (req, res) => {
  const {
    prompt,
    conversationHistory,
    confirmAction,
    mentions,
    preferredCurrency,
    businessUserMentions,
    itemMentions,
    bidMentions,
    prMentions,
    poMentions,
    invoiceMentions,
  } = req.body;
  if (!prompt && !confirmAction) return res.status(400).json({ error: "Prompt or confirmAction is required" });
  const sessionUser = getRequestSessionUser(req);
  try {
    const result = await service.negotiationAgentQuery(
      prompt || "",
      conversationHistory || [],
      sessionUser,
      confirmAction,
      mentions,
      preferredCurrency,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
    );
    streamTextSSE(res, result.response, result.pendingAction);
  } catch (error: any) {
    const msg = error instanceof AINotConfiguredError
      ? "AI model not configured. Please go to **Administration → AI Model Configuration** to set up and activate an AI provider before using AI features."
      : "I'm having trouble connecting to the AI service. Please try again in a moment.";
    streamTextSSE(res, msg);
  }
});

// Deterministic per-supplier strategy refresh for the Negotiation Strategy Panel.
// Read/compute only (no DB writes) → no audit log required.
router.post("/api/negotiation-agent/strategy/refresh", async (req, res) => {
  try {
    const { bidId, supplierName, marketBenchmark, marketConditions, costStructure, lineItemDescription, itemDescription } = req.body;
    const numericBidId = Number(bidId);
    if (!numericBidId || Number.isNaN(numericBidId)) {
      return res.status(400).json({ error: "bidId is required" });
    }
    const result = await refreshNegotiationSupplier({
      bidId: numericBidId,
      supplierName,
      marketBenchmark: marketBenchmark != null ? Number(marketBenchmark) : undefined,
      marketConditions,
      costStructure: Array.isArray(costStructure) ? costStructure : undefined,
      lineItemDescription: typeof lineItemDescription === "string" ? lineItemDescription : undefined,
      itemDescription: typeof itemDescription === "string" ? itemDescription : undefined,
    });
    res.json(result);
  } catch (error: any) {
    handleAIError(res, error, "Failed to refresh negotiation strategy");
  }
});

router.post("/api/cost-intelligence-agent/query/stream", async (req, res) => {
  const {
    prompt,
    conversationHistory,
    confirmAction,
    mentions,
    businessUserMentions,
    itemMentions,
    bidMentions,
    prMentions,
    poMentions,
    invoiceMentions,
  } = req.body;
  if (!prompt && !confirmAction) return res.status(400).json({ error: "Prompt or confirmAction is required" });
  const sessionUser = getRequestSessionUser(req);
  try {
    const result = await service.costIntelligenceAgentQuery(
      prompt || "",
      conversationHistory || [],
      sessionUser,
      confirmAction,
      mentions,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
    );
    streamTextSSE(res, result.response, result.pendingAction);
  } catch (error: any) {
    const msg = error instanceof AINotConfiguredError
      ? "AI model not configured. Please go to **Administration → AI Model Configuration** to set up and activate an AI provider before using AI features."
      : "I'm having trouble connecting to the AI service. Please try again in a moment.";
    streamTextSSE(res, msg);
  }
});

router.post("/api/spend-agent/query/stream", async (req, res) => {
  const { prompt, conversationHistory } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt is required" });
  const sessionUser = getRequestSessionUser(req);
  try {
    const result = await service.spendAgentQuery(prompt, conversationHistory || [], sessionUser);
    streamTextSSE(res, result.response, undefined, result.chart);
  } catch (error: any) {
    const msg = error instanceof AINotConfiguredError
      ? "AI model not configured. Please go to **Administration → AI Model Configuration** to set up and activate an AI provider before using AI features."
      : "I'm having trouble connecting to the AI service. Please try again in a moment.";
    streamTextSSE(res, msg);
  }
});

// ─── Agent Conversation Memory (multi-conversation, ChatGPT-style) ───────────

// List all conversations for sidebar
router.get("/api/agent-conversations/:agentType", async (req, res) => {
  try {
    const sessionUser = getRequestSessionUser(req);
    const uid = sessionUser?.id || sessionUser?.userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const list = await repo.listAgentConversations(String(uid), req.params.agentType);
    res.json({ conversations: list });
  } catch (error) {
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

// Create new conversation
router.post("/api/agent-conversations/:agentType", async (req, res) => {
  try {
    const sessionUser = getRequestSessionUser(req);
    const uid = sessionUser?.id || sessionUser?.userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const id = await repo.createAgentConversation(String(uid), req.params.agentType);
    res.json({ id });
  } catch (error) {
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Get messages for a specific conversation
router.get("/api/agent-conversations/:agentType/:id", async (req, res) => {
  try {
    const sessionUser = getRequestSessionUser(req);
    const uid = sessionUser?.id || sessionUser?.userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const messages = await repo.getAgentConversationById(Number(req.params.id), String(uid));

    // Sanitize historical message data on load to prevent frontend React crashes
    if (req.params.agentType === "negotiation" && Array.isArray(messages)) {
      for (const msg of messages) {
        if (msg.role === "assistant" && !msg.pendingAction) {
          const parsed = parseFinalAgentResponse(msg.content);
          if (parsed.pendingAction) {
            msg.pendingAction = parsed.pendingAction;
            if (!msg.actionStatus) {
              msg.actionStatus = "pending";
            }
          }
        }
        if (msg.pendingAction?.type === "negotiation_insights" && msg.pendingAction.data) {
          sanitizeNegotiationInsightsData(msg.pendingAction.data);
        }
      }
    }

    if (req.params.agentType === "cost-intelligence" && Array.isArray(messages)) {
      for (const msg of messages) {
        if (msg.role === "assistant" && (!msg.pendingAction || (msg.pendingAction.type !== "cost_intelligence_insights" && msg.pendingAction.type !== "fmc_card"))) {
          const parsed = parseCostFinalAgentResponse(msg.content);
          if (parsed.pendingAction) {
            msg.pendingAction = parsed.pendingAction;
            if (!msg.actionStatus) {
              msg.actionStatus = "pending";
            }
          }
        }
      }
    }

    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: "Failed to load conversation" });
  }
});

// Save messages to a specific conversation
router.put("/api/agent-conversations/:agentType/:id", async (req, res) => {
  try {
    const sessionUser = getRequestSessionUser(req);
    const uid = sessionUser?.id || sessionUser?.userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const { messages, title } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: "messages must be an array" });

    // Sanitize message data on save to keep DB clean
    if (req.params.agentType === "negotiation" && Array.isArray(messages)) {
      for (const msg of messages) {
        if (msg.role === "assistant" && !msg.pendingAction) {
          const parsed = parseFinalAgentResponse(msg.content);
          if (parsed.pendingAction) {
            msg.pendingAction = parsed.pendingAction;
            if (!msg.actionStatus) {
              msg.actionStatus = "pending";
            }
          }
        }
        if (msg.pendingAction?.type === "negotiation_insights" && msg.pendingAction.data) {
          sanitizeNegotiationInsightsData(msg.pendingAction.data);
        }
      }
    }

    if (req.params.agentType === "cost-intelligence" && Array.isArray(messages)) {
      for (const msg of messages) {
        if (msg.role === "assistant" && (!msg.pendingAction || (msg.pendingAction.type !== "cost_intelligence_insights" && msg.pendingAction.type !== "fmc_card"))) {
          const parsed = parseCostFinalAgentResponse(msg.content);
          if (parsed.pendingAction) {
            msg.pendingAction = parsed.pendingAction;
            if (!msg.actionStatus) {
              msg.actionStatus = "pending";
            }
          }
        }
      }
    }

    await repo.saveAgentConversationById(Number(req.params.id), String(uid), messages, title);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to save conversation" });
  }
});

// Delete a specific conversation
router.delete("/api/agent-conversations/:agentType/:id", async (req, res) => {
  try {
    const sessionUser = getRequestSessionUser(req);
    const uid = sessionUser?.id || sessionUser?.userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    await repo.deleteAgentConversationById(Number(req.params.id), String(uid));
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

// Bulk delete all conversations (kept for admin use)
router.delete("/api/agent-conversations", async (req, res) => {
  try {
    const sessionUser = getRequestSessionUser(req);
    const uid = sessionUser?.id || sessionUser?.userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    await repo.clearAllAgentConversations(String(uid));
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear conversations" });
  }
});

export const aiConsoleController = router;
