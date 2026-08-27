import { useState, useRef, useEffect } from "react";
import { useAgentConversation } from "@/hooks/useAgentConversation";
import { Link } from "wouter";
import {
  TrendingUp,
  Sparkles,
  Bot,
  User,
  ArrowLeft,
  BarChart3,
  PieChart,
  Target,
  AlertTriangle,
  PanelLeftOpen,
  PanelLeftClose,
  Trash2,
  MessageSquare,
  Plus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ChatComposer } from "@/components/ui/ChatComposer";
import { ThinkingTips } from "@/components/ui/ThinkingTips";
import { streamAgentQuery } from "@/lib/streamAgentQuery";
import type { ConversationMessage } from "@/hooks/useAgentConversation";
import { AgentChartMessage } from "./agent-chart-message";
import { formatDate } from "@/lib/common-functions";

const capabilities = [
  { icon: PieChart, label: "Spend Visibility", description: "Categorize and visualize spend patterns" },
  { icon: Target, label: "Savings Opportunities", description: "Identify consolidation and negotiation opportunities" },
  { icon: AlertTriangle, label: "Maverick Detection", description: "Flag off-contract and non-preferred purchases" },
  { icon: BarChart3, label: "Benchmarking", description: "Compare vendor concentration, budgets, and YoY trends" },
];

const examplePrompts = [
  "Show me total spend by category this year",
  "Which vendors have the highest spend concentration?",
  "How much maverick (off-contract) spend do we have?",
  "What are our top savings opportunities from sourcing?",
  "Compare this year's spend to last year",
];

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMarkdown(text: string) {
  const lines = text.split("\n");
  const htmlParts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      htmlParts.push('<div class="h-2"></div>');
      i++;
      continue;
    }

    const escaped = escapeHtml(line);
    const bold = (s: string) => s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    if (line.match(/^## /)) {
      htmlParts.push(`<h3 class="font-semibold text-sm mt-3 mb-1">${bold(escaped.replace(/^## /, ""))}</h3>`);
      i++;
      continue;
    }
    if (line.match(/^### /)) {
      htmlParts.push(`<h4 class="font-medium text-xs mt-2 mb-1 text-muted-foreground">${bold(escaped.replace(/^### /, ""))}</h4>`);
      i++;
      continue;
    }

    if (line.match(/^- /)) {
      while (i < lines.length && lines[i].match(/^- /)) {
        const itemText = escapeHtml(lines[i].replace(/^- /, ""));
        htmlParts.push(`<div class="flex items-start gap-1.5 text-xs py-0.5"><span class="text-muted-foreground mt-0.5">&bull;</span><span>${bold(itemText)}</span></div>`);
        i++;
      }
      continue;
    }

    htmlParts.push(`<div class="text-xs py-0.5">${bold(escaped)}</div>`);
    i++;
  }

  return htmlParts.join("");
}

export default function AISpendAgent() {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState("");
  const {
    conversation,
    setConversation,
    newConversation,
    switchConversation,
    deleteConversation,
    groupedConversations,
    currentId,
  } = useAgentConversation("spend");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const runStream = async (question: string, history: ConversationMessage[]) => {
    setIsStreaming(true);
    const placeholderMsg: ConversationMessage = { role: "assistant", content: "", timestamp: new Date(), isStreaming: true };
    setConversation((prev) => [
      ...prev,
      { role: "user" as const, content: question, timestamp: new Date() },
      placeholderMsg,
    ]);
    setPrompt("");

    const controller = new AbortController();
    abortRef.current = controller;

    await streamAgentQuery({
      endpoint: "/api/spend-agent/query/stream",
      prompt: question,
      conversationHistory: history.map((m) => ({ role: m.role, content: m.content })),
      signal: controller.signal,
      onToken: (token) => {
        setConversation((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") updated[updated.length - 1] = { ...last, content: last.content + token };
          return updated;
        });
      },
      onDone: (_pendingAction, chart) => {
        setConversation((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { ...last, isStreaming: false, chart: chart || undefined };
          }
          return updated;
        });
        setIsStreaming(false);
        abortRef.current = null;
      },
      onError: (message) => {
        setConversation((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && last.isStreaming) {
            updated[updated.length - 1] = { ...last, content: message, isStreaming: false };
          } else {
            updated.push({ role: "assistant" as const, content: message, timestamp: new Date() });
          }
          return updated;
        });
        setIsStreaming(false);
        abortRef.current = null;
      },
      onAbort: () => {
        setConversation((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && last.isStreaming) {
            updated[updated.length - 1] = { ...last, isStreaming: false, content: last.content || "_Stopped._" };
          }
          return updated;
        });
        setIsStreaming(false);
        abortRef.current = null;
      },
    });
  };

  const handleSend = () => {
    if (!prompt.trim() || isStreaming) return;
    runStream(prompt, conversation);
  };

  const handleClearConversation = () => {
    newConversation();
    setPrompt("");
  };

  return (
    <div className="px-4 pt-2 pb-3 flex flex-col overflow-hidden flex-1 min-h-0 h-full">
      <div className="flex items-center justify-between flex-wrap gap-1 mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen((p) => !p)} data-testid="button-toggle-history">
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
          <Link href="/app/ai-intelligence-suite">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              Spend Intelligence Agent
            </h1>
            <p className="text-sm text-muted-foreground">
              Spend visibility, savings opportunities, maverick detection, and benchmarking
            </p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
          <Sparkles className="h-3 w-3" />
          Active
        </Badge>
      </div>

      <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
        {sidebarOpen && (
          <Card className="w-56 flex-shrink-0 flex flex-col min-h-0 hidden lg:flex">
            <CardContent className="p-0 flex flex-col h-full">
              <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
                <span className="text-sm font-semibold">History</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSidebarOpen(false)}>
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="p-2 flex-shrink-0">
                <Button variant="outline" size="sm" className="w-full gap-2 justify-start" onClick={handleClearConversation} data-testid="button-sidebar-new-chat">
                  <Plus className="h-3.5 w-3.5" />
                  New Chat
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-1 pb-2">
                {groupedConversations.map((group) => (
                  <div key={group.label} className="mb-2">
                    <div className="text-xs text-muted-foreground px-2 py-1 font-medium">{group.label}</div>
                    {group.items.map((conv) => (
                      <div
                        key={conv.id}
                        className={`group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer rounded-md hover:bg-muted transition-colors ${currentId === conv.id ? "bg-muted" : ""}`}
                        onClick={() => switchConversation(conv.id)}
                        data-testid={`conv-item-${conv.id}`}
                      >
                        <MessageSquare className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        <span className="flex-1 text-xs truncate">{conv.title || "New Chat"}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-shrink-0"
                          onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                          data-testid={`button-delete-conv-${conv.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-0 overflow-hidden">
          <div className="lg:col-span-2 flex flex-col min-h-0">
            <Card className="flex-grow flex flex-col min-h-0">
              <CardContent className="flex-1 p-4 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto space-y-4 mb-4" data-testid="chat-messages-spend">
                  {conversation.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6">
                      <div className="p-4 rounded-full bg-orange-100 dark:bg-orange-900/30 mb-4">
                        <Bot className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                      </div>
                      <h3 className="font-semibold text-lg mb-2">Spend Intelligence Agent</h3>
                      <p className="text-sm text-muted-foreground max-w-md mb-4">
                        I can help you analyze spending patterns, identify savings, detect maverick spend, and benchmark vendors.
                        Ask me anything about your procurement spend!
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {examplePrompts.slice(0, 3).map((ex, i) => (
                          <Button
                            key={i}
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => setPrompt(ex)}
                          >
                            {ex.length > 40 ? ex.substring(0, 40) + "..." : ex}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    conversation.map((msg, i) => (
                      <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role === "assistant" && (
                          <div className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-900/30 h-fit">
                            <Bot className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                          </div>
                        )}
                        <div className={`rounded-lg p-3 max-w-[80%] ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          {msg.role === "assistant" ? (
                            msg.isStreaming && !msg.content ? (
                              <ThinkingTips />
                            ) : msg.isStreaming ? (
                              <p className="text-xs whitespace-pre-wrap">{msg.content}<span className="inline-block w-0.5 h-3 bg-current ml-0.5 align-middle animate-pulse" /></p>
                            ) : (
                              <>
                                <div
                                  className="text-sm [&_h3]:text-foreground [&_h4]:text-muted-foreground [&_strong]:text-foreground"
                                  dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                                />
                                {msg.chart ? <AgentChartMessage spec={msg.chart} /> : null}
                              </>
                            )
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          )}
                          <p className="text-xs opacity-60 mt-1">{formatDate(msg.timestamp)}</p>
                        </div>
                        {msg.role === "user" && (
                          <div className="p-1.5 rounded-lg bg-primary/10 h-fit">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                <ChatComposer
                  isCompact
                  singleRow
                  placeholder="Ask Prokraya Ai (e.g., 'Show spend by category')"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onSubmit={handleSend}
                  onStop={stopStreaming}
                  isStreaming={isStreaming}
                  colorTheme="primary"
                  submitButtonClassName="rounded-full h-9 w-9"
                  textareaDataTestId="input-spend-prompt"
                  submitDataTestId="button-send-spend"
                  onMicTranscript={(t) => setPrompt((p) => (p ? p + " " + t : t))}
                  leftActions={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 rounded-full flex-shrink-0"
                          data-testid="button-composer-plus"
                        >
                          <Plus className="h-5 w-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" side="top" className="min-w-[220px] rounded-xl p-1.5">
                        <DropdownMenuItem
                          className="gap-3 px-3 py-2.5 text-sm font-medium cursor-pointer rounded-lg"
                          onClick={handleClearConversation}
                          data-testid="button-new-chat"
                        >
                          <MessageSquare className="h-4 w-4" />
                          New Chat
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3 overflow-y-auto pr-1">
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Capabilities
                </h3>
                <div className="space-y-3">
                  {capabilities.map((cap, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="p-1 rounded bg-muted">
                        <cap.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{cap.label}</p>
                        <p className="text-xs text-muted-foreground">{cap.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium text-sm mb-3">Try Asking</h3>
                <div className="flex flex-col gap-1.5">
                  {examplePrompts.map((ex, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="text-xs h-auto py-1.5 justify-start text-left whitespace-normal"
                      onClick={() => setPrompt(ex)}
                    >
                      {ex}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
              <CardContent className="p-4">
                <div className="flex items-start gap-2">
                  <BarChart3 className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-orange-900 dark:text-orange-100">Read-Only Analytics</p>
                    <p className="text-xs text-orange-700 dark:text-orange-300">
                      This agent analyzes data but doesn't make changes
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
