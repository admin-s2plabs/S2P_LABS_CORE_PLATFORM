import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useChatEngine, ChatMessage } from "./ChatEngine";
import { detectModule, MODULE_LABELS } from "./SystemPrompt";

// ── Icons (inline SVG to avoid extra deps) ────────────────────────────────────

function IconBot() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <path d="M8 14h.01M12 14h.01M16 14h.01" strokeLinecap="round" />
    </svg>
  );
}

function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
    </svg>
  );
}

// ── Route → module mapping ────────────────────────────────────────────────────

function routeToModule(pathname: string): string | null {
  if (pathname.startsWith("/app/dashboard")) return "dashboard";
  if (pathname.startsWith("/app/vendors") || pathname.startsWith("/app/vendor")) return "suppliers";
  if (pathname.startsWith("/app/categories")) return "categories";
  if (pathname.startsWith("/app/items")) return "items";
  if (pathname.startsWith("/app/purchase-requests") || pathname.startsWith("/app/requisitions")) return "requisitions";
  if (pathname.startsWith("/app/bids") || pathname.startsWith("/app/suppbids") || pathname.startsWith("/app/evaluation")) return "bids";
  if (pathname.startsWith("/app/auctions") || pathname.startsWith("/app/auction") || pathname.startsWith("/app/supplier-auctions")) return "auctions";
  if (pathname.startsWith("/app/contracts") || pathname.startsWith("/app/supp-contract") || pathname.startsWith("/app/contract-")) return "contracts";
  if (pathname.startsWith("/app/purchase-orders")) return "purchase_orders";
  if (pathname.startsWith("/app/invoices")) return "invoices";
  if (pathname.startsWith("/app/budgets")) return "budgets";
  if (pathname.startsWith("/app/spend-analysis")) return "spend_analysis";
  if (pathname.startsWith("/app/reports")) return "reports";
  if (pathname.startsWith("/app/users") || pathname.startsWith("/app/roles") || pathname.startsWith("/app/role-delegation")) return "user_management";
  if (pathname.startsWith("/app/basic-settings") || pathname.startsWith("/app/approval-workflow") || pathname.startsWith("/app/cost-center-setup") || pathname.startsWith("/app/audit-logs")) return "administration";
  if (pathname.startsWith("/app/ai")) return "ai_layer";
  if (pathname.startsWith("/app/master-data") || pathname.startsWith("/app/system-monitor") || pathname.startsWith("/app/api")) return "integrations";
  return null;
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-2`}>
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center mr-2 mt-0.5">
          <IconBot />
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? "bg-indigo-600 text-white rounded-br-none"
            : "bg-gray-100 text-gray-900 rounded-bl-none border border-gray-200"
        }`}
      >
        {msg.content || (
          <span className="inline-flex gap-1 items-center text-gray-400">
            <span className="animate-bounce" style={{ animationDelay: "0ms" }}>•</span>
            <span className="animate-bounce" style={{ animationDelay: "150ms" }}>•</span>
            <span className="animate-bounce" style={{ animationDelay: "300ms" }}>•</span>
          </span>
        )}
      </div>
      {isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center ml-2 mt-0.5 text-xs font-bold text-gray-600">
          U
        </div>
      )}
    </div>
  );
}

// ── Suggested prompts ──────────────────────────────────────────────────────────

const MODULE_SUGGESTIONS: Record<string, string[]> = {
  dashboard: ["What do the dashboard cards show?", "How do I action a pending approval?"],
  suppliers: ["How do I invite a new supplier?", "What documents does a supplier need to upload?"],
  requisitions: ["How do I create a purchase requisition?", "What happens after PR approval?"],
  bids: ["How do I create an RFQ?", "How does bid evaluation work?"],
  auctions: ["How do I set up a reverse auction?", "What is lot-based allocation?"],
  contracts: ["How do I create a contract from a template?", "How does e-signing work?"],
  purchase_orders: ["How do I issue a PO?", "What is a goods receipt note?"],
  invoices: ["How does 3-way matching work?", "How do I raise an invoice as a supplier?"],
  budgets: ["How do I create a budget?", "How is budget consumed by PRs?"],
  spend_analysis: ["How do I read the spend analysis dashboard?", "What is maverick spend?"],
  ai_layer: ["What AI agents are available?", "What can EVA help me with?"],
};

const DEFAULT_SUGGESTIONS = [
  "How do I get started?",
  "What modules does Prokraya have?",
  "How does the approval workflow work?",
];

// ── Main widget ────────────────────────────────────────────────────────────────

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [location] = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Read auth from localStorage
  const authRaw = localStorage.getItem("prokraya-auth");
  const auth = authRaw ? (() => { try { return JSON.parse(authRaw); } catch { return null; } })() : null;
  const role = auth?.userRole || auth?.role || null;
  const tenantName = auth?.orgName || null;

  const module = routeToModule(location);

  const engine = useChatEngine({
    role,
    module,
    screenUrl: location,
    tenantName,
  });

  // Sync module when route changes
  useEffect(() => {
    const detected = routeToModule(location);
    engine.setModule(detected);
    engine.setScreen(location);
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to latest message
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [engine.messages, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Greet on first open
  const greetedRef = useRef(false);
  useEffect(() => {
    if (open && !greetedRef.current && engine.messages.length === 0) {
      greetedRef.current = true;
      const modLabel = engine.moduleLabel || "Prokraya";
      engine.pushAssistant(
        `Hi! 👋 I'm Ask Prokraya, your training guide. I can help you learn how to use any module on the platform.\n\nYou're currently on **${modLabel}**. What would you like to know?`
      );
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    const text = input.trim();
    if (!text || engine.loading) return;
    setInput("");
    await engine.send(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestions =
    (module && MODULE_SUGGESTIONS[module]) || DEFAULT_SUGGESTIONS;

  const moduleLabel = engine.moduleLabel
    ? MODULE_LABELS[engine.context.module!] || engine.context.module
    : null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        aria-label="Open Prokraya training assistant"
        title="Ask Prokraya — your AI training assistant"
      >
        {open ? <IconX /> : (
          <div className="relative">
            <IconBot />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-indigo-600" />
          </div>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl flex flex-col border border-gray-200 overflow-hidden"
          style={{ height: "490px" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <IconBot />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm flex items-center gap-1.5">
                Ask Prokraya
                <IconSparkle />
              </div>
              <div className="text-xs text-indigo-200 truncate">
                {moduleLabel ? `${moduleLabel} module` : "Platform guide"}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full p-1 hover:bg-white/20 transition-colors"
              aria-label="Close"
            >
              <IconX />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
            {engine.messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}

            {/* Suggested prompts — only when no messages yet */}
            {engine.messages.length <= 1 && !engine.loading && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs text-gray-400 text-center">Quick questions</p>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setInput(s);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    className="w-full text-left text-xs px-3 py-2 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 px-3 py-2 bg-gray-50">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about any Prokraya feature…"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400 max-h-24 overflow-y-auto"
                style={{ minHeight: "38px" }}
                disabled={engine.loading}
              />
              <button
                onClick={handleSend}
                disabled={engine.loading || !input.trim()}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
                aria-label="Send"
              >
                {engine.loading ? (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <IconSend />
                )}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-1.5">
              Prokraya platform guide · scope limited to platform topics
            </p>
          </div>
        </div>
      )}
    </>
  );
}
