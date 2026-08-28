import evaHumanoidImg from "@/assets/images/eva-humanoid.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MicButton } from "@/components/ui/MicButton";
import { ThinkingTips } from "@/components/ui/ThinkingTips";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Gavel,
  Loader2,
  MessageSquare,
  Package,
  RefreshCw,
  Send,
  Shield,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Users,
  Wallet,
  X,
  Zap
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "wouter";

interface PendingAction {
  type: string;
  data: any;
  summary: string;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  pendingAction?: PendingAction;
  actionStatus?: "pending" | "confirmed" | "cancelled";
}

function parseStructuredItems(content: string): { summary: string; items: Array<{ title: string; details: string[] }>; hasItems: boolean; rawIntro: string; rawOutro: string } {
  const lines = content.split('\n');
  const items: Array<{ title: string; details: string[] }> = [];
  let currentItem: { title: string; details: string[] } | null = null;
  const introLines: string[] = [];
  const outroLines: string[] = [];
  let foundFirstItem = false;
  let doneWithItems = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const numberedMatch = trimmed.match(/^\d+\.\s+\*\*(.+?)\*\*\s*(?:—|[-–])\s*(.+)/);
    const numberedSimple = trimmed.match(/^\d+\.\s+\*\*(.+?)\*\*/);

    if (numberedMatch) {
      foundFirstItem = true;
      doneWithItems = false;
      if (currentItem) items.push(currentItem);
      currentItem = { title: `${numberedMatch[1]} — ${numberedMatch[2]}`, details: [] };
    } else if (numberedSimple) {
      foundFirstItem = true;
      doneWithItems = false;
      if (currentItem) items.push(currentItem);
      currentItem = { title: numberedSimple[1], details: [] };
    } else if (currentItem && (trimmed.startsWith('- ') || trimmed.startsWith('• '))) {
      currentItem.details.push(trimmed.replace(/^[-•]\s*/, '').replace(/\*\*/g, ''));
    } else if (!foundFirstItem && trimmed) {
      introLines.push(trimmed);
    } else if (foundFirstItem && trimmed && !trimmed.startsWith('- ') && !trimmed.startsWith('• ') && !trimmed.match(/^\d+\./)) {
      doneWithItems = true;
      outroLines.push(trimmed);
    }
  }
  if (currentItem) items.push(currentItem);

  const hasItems = items.length >= 2;
  const intro = introLines.join(' ').replace(/\*\*/g, '');
  const summary = hasItems
    ? `${intro || `Found ${items.length} items.`} Check the workspace for details.`
    : content;

  return { summary, items, hasItems, rawIntro: introLines.join('\n'), rawOutro: outroLines.join('\n') };
}

function WorkspaceItemsView({ items, intro, outro, onAction }: { items: Array<{ title: string; details: string[] }>; intro: string; outro: string; onAction: (text: string) => void }) {
  return (
    <div className="space-y-3">
      {intro && (
        <p className="text-sm text-muted-foreground mb-2" dangerouslySetInnerHTML={{ __html: formatMarkdown(intro) }} />
      )}
      <div className="border rounded-lg overflow-hidden divide-y">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group" data-testid={`workspace-item-${i}`}>
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-6 h-6 rounded-md bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-[10px] font-bold text-violet-600 dark:text-violet-400">
                {i + 1}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{item.title.replace(/\*\*/g, '')}</p>
              {item.details.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  {item.details.map((d, j) => (
                    <span key={j} className="text-xs text-muted-foreground">{d}</span>
                  ))}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7 px-2 text-violet-600 hover:text-violet-700 hover:bg-violet-100 dark:text-violet-400 dark:hover:bg-violet-900/30 flex-shrink-0"
              onClick={() => onAction(`Tell me more about ${item.title.replace(/\*\*/g, '').split('—')[0].trim()}`)}
              data-testid={`button-workspace-action-${i}`}
            >
              View Details
            </Button>
          </div>
        ))}
      </div>
      {outro && (
        <p className="text-xs text-muted-foreground mt-2" dangerouslySetInnerHTML={{ __html: formatMarkdown(outro) }} />
      )}
    </div>
  );
}

const evaCapabilities = [
  {
    icon: ShoppingCart,
    title: "Procurement",
    description: "Create PRs, POs, manage requisitions, track deliveries and GRNs",
    color: "from-blue-500 to-cyan-500",
    examples: ["Buy me 50 laptops", "Create a PR for office supplies", "What POs are pending delivery?"],
  },
  {
    icon: Gavel,
    title: "Sourcing",
    description: "Create RFQs, evaluate bids, recommend vendors, award contracts",
    color: "from-violet-500 to-purple-500",
    examples: ["Source 100 office chairs under $200 each", "Analyze bids for RFQ-2024-089", "Which vendors should I invite for IT equipment?"],
  },
  {
    icon: Users,
    title: "Vendors",
    description: "Onboard, qualify, monitor performance, track compliance",
    color: "from-emerald-500 to-teal-500",
    examples: ["Onboard a new IT vendor", "Which vendors have expiring documents?", "Show me top performing vendors"],
  },
  {
    icon: Wallet,
    title: "Payables",
    description: "Process invoices, detect fraud, match documents, track payments",
    color: "from-orange-500 to-amber-500",
    examples: ["Process pending invoices", "Check for invoice fraud patterns", "What's our payment aging?"],
  },
  {
    icon: BarChart3,
    title: "Spend Intelligence",
    description: "Analyze spending, find savings, monitor budgets, forecast trends",
    color: "from-rose-500 to-pink-500",
    examples: ["How's our spend this quarter?", "Where can we save money?", "Give me a budget health check"],
  },
  {
    icon: Shield,
    title: "Risk & Compliance",
    description: "Monitor vendor risk, track compliance, flag anomalies proactively",
    color: "from-slate-500 to-zinc-500",
    examples: ["Any compliance risks I should know about?", "Which vendors are high risk?", "Audit our PO anomalies"],
  },
];

const goalBasedPrompts = [
  {
    text: "Buy me 50 laptops",
    description: "Full procurement cycle — PR to PO",
    icon: Target,
  },
  {
    text: "Find the best vendor for office furniture and get me quotes",
    description: "Sourcing + vendor selection + RFQ",
    icon: Gavel,
  },
  {
    text: "What should I focus on today?",
    description: "Daily briefing across all operations",
    icon: Clock,
  },
  {
    text: "Process all pending invoices and flag any issues",
    description: "Invoice processing + fraud detection",
    icon: FileText,
  },
  {
    text: "Give me a complete procurement health check",
    description: "Spend, budgets, vendors, compliance",
    icon: TrendingUp,
  },
  {
    text: "Onboard Acme Corp as a new vendor and invite them to our open RFQs",
    description: "Vendor onboarding + sourcing",
    icon: Users,
  },
];

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMarkdown(text: string) {
  const lines = text.split('\n');
  const htmlParts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { htmlParts.push('<div class="h-2"></div>'); i++; continue; }
    const escaped = escapeHtml(line);
    const bold = (s: string) => s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    if (line.match(/^## /)) { htmlParts.push(`<h3 class="font-semibold text-sm mt-3 mb-1">${bold(escaped.replace(/^## /, ''))}</h3>`); i++; continue; }
    if (line.match(/^### /)) { htmlParts.push(`<h4 class="font-medium text-xs mt-2 mb-1 text-muted-foreground">${bold(escaped.replace(/^### /, ''))}</h4>`); i++; continue; }
    if (line.match(/^- /)) {
      while (i < lines.length && lines[i].match(/^- /)) {
        const itemText = escapeHtml(lines[i].replace(/^- /, ''));
        htmlParts.push(`<div class="flex gap-1.5 items-start text-sm ml-1"><span class="text-muted-foreground mt-1.5 text-[6px]">●</span><span>${bold(itemText)}</span></div>`);
        i++;
      }
      continue;
    }
    if (line.match(/^\d+\. /)) {
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        const itemText = escapeHtml(lines[i].replace(/^\d+\.\s*/, ''));
        const num = lines[i].match(/^(\d+)\./)?.[1] || "";
        htmlParts.push(`<div class="flex gap-1.5 items-start text-sm ml-1"><span class="text-muted-foreground text-xs font-medium min-w-[16px]">${num}.</span><span>${bold(itemText)}</span></div>`);
        i++;
      }
      continue;
    }
    htmlParts.push(`<p class="text-sm">${bold(escaped)}</p>`);
    i++;
  }
  return htmlParts.join('\n');
}

export default function AIEvaAgent() {
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [briefingExpanded, setBriefingExpanded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const snapshotQuery = useQuery<{ snapshot: any; briefing: string }>({
    queryKey: ["/api/eva-agent/snapshot"],
  });

  const evaQueryMutation = useMutation({
    mutationFn: async (data: { prompt?: string; conversationHistory?: any[]; confirmAction?: any }) => {
      const res = await apiRequest("POST", "/api/eva-agent/query", data);
      return res.json();
    },
    onSuccess: (data) => {
      setConversation(prev => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          timestamp: new Date(),
          pendingAction: data.pendingAction,
          actionStatus: data.pendingAction ? "pending" : undefined,
        },
      ]);
    },
    onError: (error: any) => {
      const errMsg = error?.message || "";
      const isNotConfigured = errMsg.includes("AI_NOT_CONFIGURED") || errMsg.includes("AI model not configured");
      const displayMsg = isNotConfigured
        ? "AI model not configured. Please go to **Administration → AI Model Configuration** to set up and activate an AI provider before using AI features."
        : "Failed to process your request. Please try again.";
      setConversation(prev => [...prev, { role: "assistant", content: displayMsg, timestamp: new Date() }]);
      if (!isNotConfigured) {
        toast({ title: "Error", description: displayMsg, variant: "destructive" });
      }
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, evaQueryMutation.isPending]);

  const handleSubmit = () => {
    if (!prompt.trim() || evaQueryMutation.isPending) return;
    const userMsg = prompt.trim();
    setShowChat(true);
    setConversation(prev => [...prev, { role: "user", content: userMsg, timestamp: new Date() }]);
    const history = conversation.map(m => ({ role: m.role, content: m.content }));
    evaQueryMutation.mutate({ prompt: userMsg, conversationHistory: history });
    setPrompt("");
  };

  const handleConfirmAction = (msgIndex: number) => {
    const msg = conversation[msgIndex];
    if (!msg?.pendingAction) return;
    setConversation(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m));
    evaQueryMutation.mutate({
      prompt: "",
      conversationHistory: conversation.map(m => ({ role: m.role, content: m.content })),
      confirmAction: msg.pendingAction,
    });
  };

  const handleCancelAction = (msgIndex: number) => {
    setConversation(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: "cancelled" as const } : m));
    setConversation(prev => [...prev, { role: "assistant", content: "No problem, cancelled. What else can I help with?", timestamp: new Date() }]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const handleGoalPrompt = (text: string) => {
    setPrompt(text);
    setShowChat(true);
    setConversation(prev => [...prev, { role: "user", content: text, timestamp: new Date() }]);
    const history = conversation.map(m => ({ role: m.role, content: m.content }));
    evaQueryMutation.mutate({ prompt: text, conversationHistory: history });
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const briefing = snapshotQuery.data?.briefing;

  const pendingActions = conversation.filter(m => m.pendingAction && m.actionStatus === "pending");
  const confirmedActions = conversation.filter(m => m.pendingAction && m.actionStatus === "confirmed");
  const lastAssistantMsg = [...conversation].reverse().find(m => m.role === "assistant");
  const lastAssistantParsed = lastAssistantMsg ? parseStructuredItems(lastAssistantMsg.content) : null;
  const hasWorkspaceContent = pendingActions.length > 0 || confirmedActions.length > 0 || (lastAssistantParsed?.hasItems ?? false);

  if (showChat) {
    return (
      <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-2 pb-2 flex-shrink-0 border-b bg-background z-10">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Link href="/app/ai-agents">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground" data-testid="button-back-to-app-chat">
                  <ArrowRight className="h-4 w-4 rotate-180" />
                  AI Agents
                </Button>
              </Link>
              <span className="text-muted-foreground/50">/</span>
              <Button variant="ghost" size="sm" onClick={() => { setShowChat(false); setConversation([]); }} data-testid="button-eva-back">
                EVA
              </Button>
            </div>
            <div className="h-5 w-px bg-border"></div>
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-gradient-to-br from-violet-500 to-purple-600">
                <Brain className="h-3.5 w-3.5 text-white" />
              </div>
              <Badge className="gap-1 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0 text-[10px] py-0.5">
                <Zap className="h-2.5 w-2.5" />
                Autonomous
              </Badge>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Active</span>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="rounded-lg gap-1.5 text-xs" onClick={() => { setConversation([]); }} data-testid="button-eva-new-chat">
            <RefreshCw className="h-3 w-3" />
            New Chat
          </Button>
        </div>

        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="w-[420px] min-w-[380px] flex flex-col h-full border-r bg-muted/20">
            <div className="px-3 py-2 border-b bg-muted/30 flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Conversation</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3" data-testid="eva-chat-area">
              {conversation.map((msg, i) => (
                <div key={i}>
                  <div className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                    {msg.role === "assistant" && (
                      <div className="p-1 rounded-md bg-gradient-to-br from-violet-500/20 to-purple-500/20 h-fit flex-shrink-0 mt-0.5">
                        <Brain className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                      </div>
                    )}
                    {msg.role === "user" ? (
                      <div className="rounded-lg px-3 py-1.5 bg-violet-600 text-white max-w-[85%]">
                        <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
                        <p className="text-[10px] opacity-40 mt-1">{formatDate(msg.timestamp)}</p>
                      </div>
                    ) : (() => {
                      const parsed = parseStructuredItems(msg.content);
                      if (parsed.hasItems) {
                        return (
                          <div className="max-w-[90%]">
                            <p className="text-xs leading-relaxed text-muted-foreground">{parsed.summary}</p>
                            <p className="text-[10px] text-violet-500 mt-1 flex items-center gap-1">
                              <Package className="h-2.5 w-2.5" />
                              {parsed.items.length} items in workspace
                            </p>
                            <p className="text-[10px] opacity-40 mt-1">{formatDate(msg.timestamp)}</p>
                          </div>
                        );
                      }
                      return (
                        <div className="max-w-[90%]">
                          <div
                            className="text-xs leading-relaxed text-muted-foreground [&_strong]:text-foreground [&_p]:text-xs"
                            dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                          />
                          <p className="text-[10px] opacity-40 mt-1">{formatDate(msg.timestamp)}</p>
                        </div>
                      );
                    })()}
                    {msg.role === "user" && (
                      <div className="p-1 rounded-md bg-violet-100 dark:bg-violet-900/30 h-fit flex-shrink-0 mt-0.5">
                        <User className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {evaQueryMutation.isPending && (
                <div className="flex gap-2">
                  <div className="p-1 rounded-md bg-gradient-to-br from-violet-500/20 to-purple-500/20 h-fit flex-shrink-0">
                    <Brain className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 animate-pulse" />
                  </div>
                  <div className="rounded-xl px-3 py-2.5 bg-background border">
                    <ThinkingTips />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="px-3 pb-3 flex-shrink-0 border-t pt-2 bg-muted/30">
              <div className="flex items-center gap-2">
                <Textarea
                  placeholder="Continue the conversation..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="flex-1 min-h-[40px] max-h-[40px] resize-none rounded-lg text-xs bg-background"
                  onKeyDown={handleKeyDown}
                  data-testid="input-eva-prompt"
                />
                <MicButton
                  onTranscript={(t) => setPrompt((p) => (p ? p + " " + t : t))}
                  compact
                />
                <Button
                  onClick={handleSubmit}
                  disabled={!prompt.trim() || evaQueryMutation.isPending}
                  size="sm"
                  className="bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg h-10 w-10 p-0"
                  data-testid="button-eva-submit"
                >
                  {evaQueryMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
            <div className="px-4 py-2 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Workspace</span>
                </div>
                {(pendingActions.length > 0 || confirmedActions.length > 0) && (
                  <div className="flex items-center gap-2">
                    {pendingActions.length > 0 && (
                      <Badge variant="outline" className="text-[10px] py-0 gap-1 border-amber-300 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {pendingActions.length} Pending
                      </Badge>
                    )}
                    {confirmedActions.length > 0 && (
                      <Badge variant="outline" className="text-[10px] py-0 gap-1 border-emerald-300 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        {confirmedActions.length} Done
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5" data-testid="eva-workspace">
              {!hasWorkspaceContent && !evaQueryMutation.isPending && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-sm">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/20 mb-4">
                      <Package className="h-7 w-7 text-violet-400" />
                    </div>
                    <h3 className="font-semibold text-sm mb-1.5">EVA's Workspace</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      This is where EVA's work appears — purchase orders, vendor profiles, charts, reports, approvals, and more. Start a conversation and watch EVA work.
                    </p>
                  </div>
                </div>
              )}

              {evaQueryMutation.isPending && !hasWorkspaceContent && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="relative inline-block mb-4">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center animate-pulse">
                        <Brain className="h-7 w-7 text-white" />
                      </div>
                    </div>
                    <p className="text-sm font-medium mb-1">EVA is analyzing your request</p>
                    <p className="text-xs text-muted-foreground">Preparing workspace output...</p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {pendingActions.map((msg, idx) => {
                  const msgIndex = conversation.indexOf(msg);
                  return (
                    <Card key={idx} className="border-amber-200 dark:border-amber-800 shadow-sm overflow-hidden" data-testid={`workspace-action-${idx}`}>
                      <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-400"></div>
                      <CardContent className="p-5">
                        <div className="flex items-start gap-3 mb-4">
                          <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/30">
                            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-100">Action Requires Your Approval</h3>
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">{msg.pendingAction!.summary}</p>
                            <div className="mt-1">
                              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">{msg.pendingAction!.type}</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 flex-1" onClick={() => handleConfirmAction(msgIndex)} disabled={evaQueryMutation.isPending} data-testid={`button-confirm-${msgIndex}`}>
                            <Check className="h-4 w-4" /> Approve & Execute
                          </Button>
                          <Button variant="outline" className="gap-1.5 flex-1" onClick={() => handleCancelAction(msgIndex)} disabled={evaQueryMutation.isPending} data-testid={`button-cancel-${msgIndex}`}>
                            <X className="h-4 w-4" /> Reject
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {confirmedActions.map((msg, idx) => (
                  <Card key={`done-${idx}`} className="border-emerald-200 dark:border-emerald-800/50 shadow-sm overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-emerald-400 to-teal-400"></div>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Executed Successfully</p>
                          <p className="text-xs text-emerald-700 dark:text-emerald-300">{msg.pendingAction!.summary}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {lastAssistantMsg && !lastAssistantMsg.pendingAction && lastAssistantParsed?.hasItems && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Brain className="h-3.5 w-3.5 text-violet-500" />
                        <span className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">Results</span>
                        <span className="text-[10px] text-muted-foreground">{formatDate(lastAssistantMsg.timestamp)}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] py-0 gap-1">
                        {lastAssistantParsed.items.length} items
                      </Badge>
                    </div>
                    <WorkspaceItemsView
                      items={lastAssistantParsed.items}
                      intro={lastAssistantParsed.rawIntro}
                      outro={lastAssistantParsed.rawOutro}
                      onAction={handleGoalPrompt}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden h-full relative bg-gradient-to-br from-white via-violet-50/30 to-purple-50/40 dark:from-gray-950 dark:via-violet-950/20 dark:to-purple-950/10">
      <style>{`
        @keyframes eva-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.3), 0 0 60px rgba(139, 92, 246, 0.1); }
          50% { box-shadow: 0 0 30px rgba(139, 92, 246, 0.5), 0 0 80px rgba(139, 92, 246, 0.2); }
        }
        @keyframes eva-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes eva-pulse-ring {
          0% { transform: scale(0.8); opacity: 0.8; }
          50% { transform: scale(1.2); opacity: 0; }
          100% { transform: scale(0.8); opacity: 0; }
        }
        @keyframes eva-particle {
          0% { transform: translateY(0) translateX(0) scale(1); opacity: 0.6; }
          50% { opacity: 1; }
          100% { transform: translateY(-80px) translateX(20px) scale(0); opacity: 0; }
        }
        @keyframes eva-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes eva-slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes eva-orbit {
          0% { transform: rotate(0deg) translateX(40px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(40px) rotate(-360deg); }
        }
        @keyframes eva-walk-in {
          0% { opacity: 0; transform: scale(0.5) translateY(30px); filter: blur(6px); }
          40% { opacity: 0.6; filter: blur(2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
        }
        @keyframes eva-shadow-grow {
          0% { opacity: 0; transform: scaleX(0.3); }
          100% { opacity: 0.15; transform: scaleX(1); }
        }
        .eva-hero-glow { animation: eva-glow 3s ease-in-out infinite; }
        .eva-float { animation: eva-float 4s ease-in-out infinite; }
        .eva-pulse-ring { animation: eva-pulse-ring 2.5s ease-out infinite; }
        .eva-fade-in { animation: eva-fade-in 0.6s ease-out forwards; }
        .eva-fade-in-delayed { animation: eva-fade-in 0.6s ease-out 0.15s forwards; opacity: 0; }
        .eva-fade-in-delayed-2 { animation: eva-fade-in 0.6s ease-out 0.3s forwards; opacity: 0; }
        .eva-slide-up { animation: eva-slide-up 0.5s ease-out forwards; }
        .eva-slide-up-delayed { animation: eva-slide-up 0.5s ease-out 0.1s forwards; opacity: 0; }
        .eva-walk-in { animation: eva-walk-in 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .eva-shadow-grow { animation: eva-shadow-grow 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .eva-orbit-1 { animation: eva-orbit 8s linear infinite; }
        .eva-orbit-2 { animation: eva-orbit 12s linear infinite reverse; }
        .eva-orbit-3 { animation: eva-orbit 10s linear infinite; animation-delay: -3s; }
        .eva-particle-1 { animation: eva-particle 3s ease-out infinite; }
        .eva-particle-2 { animation: eva-particle 4s ease-out infinite; animation-delay: 1s; }
        .eva-particle-3 { animation: eva-particle 3.5s ease-out infinite; animation-delay: 2s; }
      `}</style>


      <div className="absolute top-6 right-8 z-10">
        <div className="relative eva-float">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center eva-hero-glow">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-background flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
          </div>
          <div className="absolute inset-0 rounded-2xl eva-pulse-ring border-2 border-violet-400/50"></div>
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2">
            <span className="text-[8px] font-bold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/50 px-1.5 py-0.5 rounded-full whitespace-nowrap">ONLINE</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6 eva-fade-in">
            <Link href="/app/ai-agents">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" data-testid="button-back-to-app">
                <ArrowRight className="h-4 w-4 rotate-180" />
                Back to AI Agents
              </Button>
            </Link>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              EVA v2.0
            </Badge>
          </div>

          <div className="flex items-center gap-8 mb-8 eva-fade-in">
            <div className="relative flex-shrink-0">
              <div className="relative w-52 h-64 rounded-3xl overflow-hidden eva-hero-glow">
                <div className="absolute inset-0 bg-gradient-to-b from-violet-500/10 via-transparent to-purple-600/20 z-10 pointer-events-none"></div>
                <img
                  src={evaHumanoidImg}
                  alt="EVA - Autonomous Procurement AI"
                  className="w-full h-full object-cover object-top eva-float"
                  data-testid="img-eva-humanoid"
                />
              </div>
              <div className="absolute -top-2 -right-2 eva-particle-1">
                <Sparkles className="h-4 w-4 text-violet-400" />
              </div>
              <div className="absolute -bottom-2 -left-2 eva-particle-2">
                <Sparkles className="h-3 w-3 text-purple-400" />
              </div>
              <div className="absolute top-1/2 -right-3 eva-particle-3">
                <Sparkles className="h-3 w-3 text-fuchsia-400" />
              </div>
              <div className="absolute -inset-3 rounded-[2rem] eva-pulse-ring border-2 border-violet-400/30 pointer-events-none"></div>
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold tracking-tight mb-2" data-testid="text-eva-title">
                {greeting}. I'm <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">EVA</span>.
              </h1>
              <p className="text-lg text-muted-foreground mb-1">
                Your Autonomous Procurement Intelligence
              </p>
              <p className="text-sm text-muted-foreground/70 mb-4">
                Tell me your goal — I'll plan the steps, coordinate agents, execute across all modules, and come back to you only when I need your decision.
              </p>
              <div className="flex items-center gap-2 flex-wrap eva-fade-in-delayed">
                <Badge className="gap-1.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0 py-1 px-3">
                  <Zap className="h-3 w-3" />
                  Autonomous Execution
                </Badge>
                <Badge variant="outline" className="gap-1.5 py-1 px-3">
                  <Bot className="h-3 w-3" />
                  4 Specialized Agents
                </Badge>
                <Badge variant="outline" className="gap-1.5 py-1 px-3">
                  <Shield className="h-3 w-3" />
                  Human-in-the-Loop
                </Badge>
              </div>
            </div>
          </div>

          <div className="mb-8 eva-fade-in-delayed">
            <div className="relative max-w-3xl mx-auto">
              <div className="absolute -inset-1 bg-gradient-to-r from-violet-500/20 via-purple-500/20 to-fuchsia-500/20 rounded-3xl blur-lg"></div>
              <div className="relative flex items-center gap-2 p-1.5 border-2 border-violet-200 dark:border-violet-800 rounded-2xl bg-background shadow-xl shadow-violet-500/10 focus-within:border-violet-400 dark:focus-within:border-violet-600 transition-colors">
                <Brain className="h-5 w-5 text-violet-500 ml-3 flex-shrink-0" />
                <Textarea
                  placeholder="Tell me what you need — &quot;Buy me 50 laptops&quot;, &quot;Find the best vendor for office furniture&quot;, &quot;Process all pending invoices&quot;..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="flex-1 min-h-[60px] max-h-[60px] resize-none border-0 shadow-none focus-visible:ring-0 bg-transparent text-sm"
                  onKeyDown={handleKeyDown}
                  data-testid="input-eva-main-prompt"
                />
                <MicButton
                  onTranscript={(t) => setPrompt((p) => (p ? p + " " + t : t))}
                />
                <Button
                  onClick={handleSubmit}
                  disabled={!prompt.trim() || evaQueryMutation.isPending}
                  size="sm"
                  className="bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl mr-1 px-5 h-10"
                  data-testid="button-eva-main-submit"
                >
                  {evaQueryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {briefing && (
            <div className="mb-6 max-w-3xl mx-auto eva-fade-in-delayed-2">
              <Card className="border border-violet-200 dark:border-violet-800/50 shadow-sm bg-gradient-to-br from-violet-50/50 to-purple-50/50 dark:from-violet-950/20 dark:to-purple-950/10" data-testid="eva-briefing-card">
                <CardContent className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                    <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                      Today's Priorities
                    </span>
                  </div>
                  <div className="text-sm leading-relaxed text-muted-foreground">
                    {briefing.split('\n').map((line, i) => {
                      const trimmed = line.trim();
                      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
                        const bulletText = trimmed.replace(/^[•\-*]\s*/, '').replace(/\*\*/g, '');
                        const displayHtml = trimmed.replace(/^[•\-*]\s*/, '');
                        return (
                          <button
                            key={i}
                            className="w-full text-left flex items-start gap-2 px-2.5 py-1.5 my-0.5 rounded-lg hover:bg-violet-100/70 dark:hover:bg-violet-900/30 cursor-pointer transition-colors group"
                            onClick={() => handleGoalPrompt(`Let's work on this: ${bulletText}`)}
                            data-testid={`button-briefing-item-${i}`}
                          >
                            <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-violet-400 group-hover:text-violet-600 dark:group-hover:text-violet-300 flex-shrink-0 transition-colors" />
                            <span
                              className="[&_strong]:text-violet-700 dark:[&_strong]:text-violet-300 [&_strong]:font-semibold group-hover:text-foreground transition-colors"
                              dangerouslySetInnerHTML={{ __html: formatMarkdown(displayHtml) }}
                            />
                          </button>
                        );
                      }
                      if (trimmed) {
                        return (
                          <p key={i} className="mb-1.5 [&_strong]:text-violet-700 dark:[&_strong]:text-violet-300 [&_strong]:font-semibold" dangerouslySetInnerHTML={{ __html: formatMarkdown(trimmed) }} />
                        );
                      }
                      return null;
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="mb-8 eva-fade-in-delayed-2">
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-4 w-4 text-violet-500" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Try a Goal</h2>
              <div className="flex-1 h-px bg-border"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {goalBasedPrompts.map((goal, i) => (
                <Card
                  key={i}
                  className="cursor-pointer border-violet-100 dark:border-violet-900/30 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-300 group"
                  onClick={() => handleGoalPrompt(goal.text)}
                  data-testid={`card-goal-${i}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/40 dark:to-purple-900/30 flex-shrink-0 group-hover:from-violet-200 group-hover:to-purple-200 dark:group-hover:from-violet-900/60 dark:group-hover:to-purple-900/50 transition-colors">
                        <goal.icon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors leading-snug">"{goal.text}"</p>
                        <p className="text-xs text-muted-foreground mt-1.5">{goal.description}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-violet-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="eva-fade-in-delayed-2">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-4 w-4 text-violet-500" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">What EVA Can Do</h2>
              <div className="flex-1 h-px bg-border"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {evaCapabilities.map((cap, i) => (
                <Card key={i} className="overflow-hidden hover:shadow-lg transition-shadow duration-300" data-testid={`card-capability-${i}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className={`p-2 rounded-xl bg-gradient-to-br ${cap.color} flex-shrink-0 shadow-sm`}>
                        <cap.icon className="h-4 w-4 text-white" />
                      </div>
                      <h3 className="font-semibold text-sm">{cap.title}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{cap.description}</p>
                    <div className="space-y-1.5">
                      {cap.examples.map((ex, j) => (
                        <button
                          key={j}
                          className="w-full text-left text-xs px-3 py-2 rounded-lg bg-muted/40 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-600 dark:hover:text-violet-400 transition-all cursor-pointer truncate border border-transparent hover:border-violet-200 dark:hover:border-violet-800"
                          onClick={() => handleGoalPrompt(ex)}
                          data-testid={`button-example-${i}-${j}`}
                        >
                          "{ex}"
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="mt-10 text-center pb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20 border border-violet-200/50 dark:border-violet-800/30">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              <p className="text-xs text-muted-foreground">
                EVA orchestrates across <span className="font-semibold text-violet-600 dark:text-violet-400">4 specialized AI agents</span> and all procurement modules autonomously
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
