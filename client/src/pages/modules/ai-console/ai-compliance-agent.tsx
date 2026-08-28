import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChatComposer } from "@/components/ui/ChatComposer";
import { ThinkingTips } from "@/components/ui/ThinkingTips";
import { formatDate } from "@/lib/common-functions";
import {
  AGENT_MENTION_PLACEHOLDER_HINT,
  useAgentMentions,
} from "@/hooks/useAgentMentions";
import { SourcingUserMessageBubbleContent } from "@/lib/supplier-mention-utils";
import type {
  BidMention,
  BusinessUserMention,
  InvoiceMention,
  ItemMention,
  PoMention,
  PrMention,
  SupplierMention,
} from "@shared/agent-mention";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileCheck,
  Scale,
  Shield,
  Sparkles,
  User
} from "lucide-react";
import { useState, useRef } from "react";
import { Link } from "wouter";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  mentions?: SupplierMention[];
  businessUserMentions?: BusinessUserMention[];
  itemMentions?: ItemMention[];
  bidMentions?: BidMention[];
  prMentions?: PrMention[];
  poMentions?: PoMention[];
  invoiceMentions?: InvoiceMention[];
}

const capabilities = [
  { icon: FileCheck, label: "Policy Compliance", description: "Monitor adherence to procurement policies" },
  { icon: ClipboardCheck, label: "Audit Support", description: "Generate audit trails and reports" },
  { icon: AlertTriangle, label: "Risk Monitoring", description: "Identify and flag compliance risks" },
  { icon: Scale, label: "Regulatory Updates", description: "Track regulatory changes and impact" },
];

const examplePrompts = [
  "Check if vendor VND-2024-0089 has all required certifications",
  "Show me all PRs that bypassed approval workflow",
  "Are there any vendors with expired compliance documents?",
  "Generate an audit report for Q4 procurement activities",
  "What regulatory changes affect our IT procurement?",
];

export default function AIComplianceAgent() {
  const mention = useAgentMentions();
  const { prompt, setPromptText, reset: resetMentions, streamMentions } = mention;
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel the in-flight (simulated) response.
  const stopProcessing = () => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    setIsProcessing(false);
  };

  const handleSend = async () => {
    if (!prompt.trim() || isProcessing) return;

    const userMessage: ConversationMessage = {
      role: "user",
      content: prompt,
      timestamp: new Date(),
      mentions: streamMentions.mentions,
      businessUserMentions: streamMentions.businessUserMentions,
      itemMentions: streamMentions.itemMentions,
      bidMentions: streamMentions.bidMentions,
      prMentions: streamMentions.prMentions,
      poMentions: streamMentions.poMentions,
      invoiceMentions: streamMentions.invoiceMentions,
    };

    setConversation(prev => [...prev, userMessage]);
    resetMentions();
    setIsProcessing(true);

    processingTimeoutRef.current = setTimeout(() => {
      const assistantMessage: ConversationMessage = {
        role: "assistant",
        content: `I understand you want to: "${userMessage.content}"\n\nThis capability is being configured. Soon I'll be able to:\n\n• Monitor policy compliance across procurement\n• Generate audit trails and reports\n• Identify compliance risks\n• Track regulatory changes\n\nPlease check back soon!`,
        timestamp: new Date(),
      };
      setConversation(prev => [...prev, assistantMessage]);
      setIsProcessing(false);
      processingTimeoutRef.current = null;
    }, 1500);
  };

  return (
    <div className="px-4 pt-2 pb-3 flex flex-col overflow-hidden flex-1 min-h-0 h-full">
      <div className="flex items-center justify-between flex-wrap gap-1 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/app/ai-agents">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30">
                <Shield className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              Compliance Agent
            </h1>
            <p className="text-sm text-muted-foreground">
              Policy compliance, audit support, risk monitoring, and regulatory updates
            </p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
          <Sparkles className="h-3 w-3" />
          Active
        </Badge>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-0 overflow-hidden">
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <Card className="flex-grow flex flex-col min-h-0">
            <CardContent className="flex-1 p-4 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                {conversation.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <div className="p-4 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
                      <Bot className="h-8 w-8 text-red-600 dark:text-red-400" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Compliance Agent</h3>
                    <p className="text-sm text-muted-foreground max-w-md mb-4">
                      I can help you monitor compliance, generate audit reports, identify risks, and track regulations.
                      Ask me about any compliance concern!
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {examplePrompts.slice(0, 3).map((ex, i) => (
                        <Button 
                          key={i} 
                          variant="outline" 
                          size="sm" 
                          className="text-xs"
                          onClick={() => setPromptText(ex)}
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
                        <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 h-fit">
                          <Bot className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </div>
                      )}
                      <div className={`rounded-lg p-3 max-w-[80%] ${
                        msg.role === "user" 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted"
                      }`}>
                        {msg.role === "user" ? (
                          <SourcingUserMessageBubbleContent
                            content={msg.content}
                            mentions={msg.mentions}
                            businessUserMentions={msg.businessUserMentions}
                            itemMentions={msg.itemMentions}
                            bidMentions={msg.bidMentions}
                            prMentions={msg.prMentions}
                            poMentions={msg.poMentions}
                            invoiceMentions={msg.invoiceMentions}
                          />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        )}
                        <p className="text-xs opacity-60 mt-1">
                          {formatDate(msg.timestamp)}
                        </p>
                      </div>
                      {msg.role === "user" && (
                        <div className="p-1.5 rounded-lg bg-primary/10 h-fit">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                      )}
                    </div>
                  ))
                )}
                {isProcessing && (
                  <div className="flex gap-3">
                    <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 h-fit">
                      <Bot className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="rounded-lg p-3 bg-muted">
                      <ThinkingTips />
                    </div>
                  </div>
                )}
              </div>

              <div className="relative w-full flex-shrink-0" ref={mention.composerRef}>
              <ChatComposer
                isCompact
                singleRow
                ref={mention.inputRef}
                placeholder={`Ask Prokraya Ai ${AGENT_MENTION_PLACEHOLDER_HINT}`}
                {...mention.composerProps}
                onSubmit={handleSend}
                onStop={stopProcessing}
                isStreaming={isProcessing}
                colorTheme="primary"
                submitButtonClassName="rounded-full h-9 w-9"
                textareaDataTestId="input-compliance-prompt"
                submitDataTestId="button-send-compliance"
                onMicTranscript={(t) => setPromptText(prompt ? `${prompt} ${t}` : t)}
              />
              {mention.dropdown}
              </div>
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
              <h3 className="font-medium text-sm mb-3">Modules Covered</h3>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">All Modules</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-900 dark:text-red-100">Audit Trail</p>
                  <p className="text-xs text-red-700 dark:text-red-300">
                    All compliance checks are logged for audit purposes
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
