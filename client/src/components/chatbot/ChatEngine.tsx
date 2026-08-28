import { useState, useCallback, useRef } from "react";
import {
  buildSystemPrompt,
  detectModule,
  isInScope,
  OUT_OF_SCOPE_MESSAGE,
  MODULE_LABELS,
  ChatbotContext,
} from "./SystemPrompt";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
  timestamp?: number;
}

export interface EngineState {
  messages: ChatMessage[];
  loading: boolean;
  context: ChatbotContext;
  moduleLabel: string | null;
}

export interface ChatEngineActions {
  send: (text: string) => Promise<void>;
  setRole: (role: string | null) => void;
  setModule: (module: string | null) => void;
  setScreen: (screenUrl: string | null) => void;
  setRbac: (rbac: ChatbotContext["rbac"]) => void;
  setSetupProgress: (progress: ChatbotContext["setupProgress"]) => void;
  setActiveWorkflows: (wf: string | null) => void;
  pushAssistant: (text: string) => void;
}

export type ChatEngine = EngineState & ChatEngineActions;

// ── Constants ─────────────────────────────────────────────────────────────────

const PROXY_URL = "/api/chatbot/train";
const MAX_TOKENS = 600;
const MAX_HISTORY = 8;

// ── SSE reader ────────────────────────────────────────────────────────────────

async function readSSE(
  url: string,
  payload: object,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
  } catch (err) {
    onError("Network error — please try again.");
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let msg = `Server error ${response.status}`;
    try {
      const j = JSON.parse(text);
      if (j.error) msg = j.error;
    } catch {
      // ignore
    }
    onError(msg);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let lastEventType = "message";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          lastEventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          const raw = line.slice(5).trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (lastEventType === "done" || parsed.done) {
              onDone();
              return;
            }
            if (lastEventType === "error" || parsed.error) {
              onError(parsed.error || "Unknown error");
              return;
            }
            if (typeof parsed.t === "string") {
              onToken(parsed.t);
            }
          } catch {
            // non-JSON line, skip
          }
          lastEventType = "message";
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  onDone();
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChatEngine(initialContext: ChatbotContext = {}): ChatEngine {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<ChatbotContext>(initialContext);
  const abortRef = useRef<boolean>(false);

  const moduleLabel = context.module ? (MODULE_LABELS[context.module] || context.module) : null;

  // ── Context setters ─────────────────────────────────────────────────────────

  const setRole = useCallback((role: string | null) => {
    setContext((prev) => ({ ...prev, role }));
  }, []);

  const setModule = useCallback((module: string | null) => {
    setContext((prev) => ({ ...prev, module }));
  }, []);

  const setScreen = useCallback((screenUrl: string | null) => {
    setContext((prev) => ({ ...prev, screenUrl }));
  }, []);

  const setRbac = useCallback((rbac: ChatbotContext["rbac"]) => {
    setContext((prev) => ({ ...prev, rbac }));
  }, []);

  const setSetupProgress = useCallback((setupProgress: ChatbotContext["setupProgress"]) => {
    setContext((prev) => ({ ...prev, setupProgress }));
  }, []);

  const setActiveWorkflows = useCallback((activeWorkflows: string | null) => {
    setContext((prev) => ({ ...prev, activeWorkflows }));
  }, []);

  // ── Direct assistant injection ──────────────────────────────────────────────

  const pushAssistant = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: text, timestamp: Date.now() },
    ]);
  }, []);

  // ── Main send ───────────────────────────────────────────────────────────────

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      // Scope guardrail
      if (!isInScope(trimmed)) {
        setMessages((prev) => [
          ...prev,
          { role: "user", content: trimmed, timestamp: Date.now() },
          { role: "assistant", content: OUT_OF_SCOPE_MESSAGE, timestamp: Date.now() },
        ]);
        return;
      }

      // Auto-detect module from text if not already set
      const detected = detectModule(trimmed);
      let activeContext = context;
      if (detected && !context.module) {
        activeContext = { ...context, module: detected };
        setContext(activeContext);
      }

      const userMsg: ChatMessage = { role: "user", content: trimmed, timestamp: Date.now() };

      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      abortRef.current = false;

      // Placeholder assistant message for streaming
      const placeholderIdx = messages.length + 1;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", timestamp: Date.now() },
      ]);

      const systemPrompt = buildSystemPrompt(activeContext);

      // Build history (exclude the empty placeholder we just appended)
      const history = [...messages, userMsg]
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role, content: m.content }));

      let accumulated = "";

      await readSSE(
        PROXY_URL,
        {
          system: systemPrompt,
          messages: history,
          max_tokens: MAX_TOKENS,
        },
        (token) => {
          if (abortRef.current) return;
          accumulated += token;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = { ...last, content: accumulated };
            }
            return next;
          });
        },
        () => {
          setLoading(false);
          if (!accumulated) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant" && !last.content) {
                next[next.length - 1] = { ...last, content: "Sorry, I didn't get a response. Please try again." };
              }
              return next;
            });
          }
        },
        (err) => {
          setLoading(false);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = {
                ...last,
                content: `Sorry, something went wrong: ${err}`,
              };
            }
            return next;
          });
        }
      );
    },
    [messages, loading, context]
  );

  return {
    messages,
    loading,
    context,
    moduleLabel,
    send,
    setRole,
    setModule,
    setScreen,
    setRbac,
    setSetupProgress,
    setActiveWorkflows,
    pushAssistant,
  };
}
