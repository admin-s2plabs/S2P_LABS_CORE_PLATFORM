import { Router } from "express";
import { requireAuth } from "../_shared/auth";
import { AINotConfiguredError } from "../../services/ai-client";
import * as service from "./chatbot.service";

const router = Router();

function handleAIError(res: any, error: any, fallback: string) {
  if (error instanceof AINotConfiguredError) {
    return res.status(503).json({ error: error.message, code: "AI_NOT_CONFIGURED" });
  }
  console.error(fallback + ":", error);
  res.status(500).json({ error: fallback });
}

// ── Health ────────────────────────────────────────────────────────────────────

router.get("/api/chatbot/health", async (_req, res) => {
  const result = await service.healthCheck();
  res.json(result);
});

// ── Grounded Q&A (streaming SSE) ──────────────────────────────────────────────

router.post("/api/chatbot/ask", requireAuth, async (req, res) => {
  try {
    const q = String((req.body && req.body.question) || "").slice(0, 2000);
    if (!q.trim()) return res.status(400).json({ error: "empty question" });
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-2) : [];
    return service.handleAsk(res, q, history);
  } catch (error) {
    handleAIError(res, error, "Failed to process ask request");
  }
});

// ── Training assistant proxy (streaming SSE) ──────────────────────────────────

router.post("/api/chatbot/train", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const system = String(body.system || "").slice(0, 24000);
    const maxTokens = Math.min(Math.max(parseInt(body.max_tokens, 10) || 600, 64), 1024);
    const incoming: any[] = Array.isArray(body.messages) ? body.messages.slice(-8) : [];

    if (!system.trim() || !incoming.length) {
      return res.status(400).json({ error: "system prompt and at least one message are required" });
    }

    return service.handleTrain(res, system, incoming, maxTokens);
  } catch (error) {
    handleAIError(res, error, "Failed to process train request");
  }
});

// ── Auto-fill from prospect text ──────────────────────────────────────────────

router.post("/api/chatbot/autofill", requireAuth, async (req, res) => {
  try {
    const text = String((req.body && req.body.text) || "").slice(0, 12000);
    if (!text.trim()) return res.status(400).json({ error: "empty text" });
    const result = await service.handleAutofill(text);
    res.json(result);
  } catch (error) {
    handleAIError(res, error, "Failed to process autofill request");
  }
});

// ── Talk track (streaming SSE) ────────────────────────────────────────────────

router.post("/api/chatbot/talktrack", requireAuth, async (req, res) => {
  try {
    const ctx = (req.body && req.body.context) || {};
    return service.handleTalktrack(res, ctx);
  } catch (error) {
    handleAIError(res, error, "Failed to generate talk track");
  }
});

// ── Follow-up email (streaming SSE) ──────────────────────────────────────────

router.post("/api/chatbot/email", requireAuth, async (req, res) => {
  try {
    const ctx = (req.body && req.body.context) || {};
    return service.handleEmail(res, ctx);
  } catch (error) {
    handleAIError(res, error, "Failed to generate email");
  }
});

// ── Sales pitch playbook (streaming SSE) ─────────────────────────────────────

router.post("/api/chatbot/salespitch", requireAuth, async (req, res) => {
  try {
    const ctx = (req.body && req.body.context) || {};
    return service.handleSalesPitch(res, ctx);
  } catch (error) {
    handleAIError(res, error, "Failed to generate sales pitch");
  }
});

// ── Speaker notes (streaming SSE) ────────────────────────────────────────────

router.post("/api/chatbot/speakernotes", requireAuth, async (req, res) => {
  try {
    const ctx = (req.body && req.body.context) || {};
    const time = String(req.body?.time || "7 min");
    return service.handleSpeakerNotes(res, ctx, time);
  } catch (error) {
    handleAIError(res, error, "Failed to generate speaker notes");
  }
});

// ── Sales sparring simulator ──────────────────────────────────────────────────

router.post("/api/chatbot/sparring/start", requireAuth, async (req, res) => {
  try {
    const { rep_id, context, preset } = req.body;
    if (!rep_id || !preset) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const result = await service.startSparring(rep_id, context || {}, preset);
    res.json(result);
  } catch (error) {
    handleAIError(res, error, "Failed to initialize sparring session");
  }
});

router.post("/api/chatbot/sparring/message", requireAuth, async (req, res) => {
  try {
    const { session_id, rep_message } = req.body;
    if (!session_id || !rep_message) {
      return res.status(400).json({ error: "session_id and rep_message are required" });
    }
    const result = await service.sendSparringMessage(session_id, rep_message);
    res.json(result);
  } catch (error: any) {
    if (error?.message === "Session not found") {
      return res.status(404).json({ error: "Session not found" });
    }
    handleAIError(res, error, "Failed to process sparring message");
  }
});

router.post("/api/chatbot/sparring/end", requireAuth, async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: "session_id is required" });
    const result = await service.endSparring(session_id);
    res.json(result);
  } catch (error: any) {
    if (error?.message === "Session not found") {
      return res.status(404).json({ error: "Session not found" });
    }
    handleAIError(res, error, "Failed to generate debrief");
  }
});

router.get("/api/chatbot/sparring/history/:rep_id", requireAuth, (req, res) => {
  const history = service.getSparringHistory(req.params.rep_id);
  res.json(history);
});

export { router as chatbotController };
