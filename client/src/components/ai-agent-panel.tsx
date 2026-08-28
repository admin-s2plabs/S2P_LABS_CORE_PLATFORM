import { useState } from "react";
import { 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  Lightbulb,
  FileCheck,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  RefreshCw,
  Brain,
  Zap
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface AgentMessage {
  id: string;
  role: "agent" | "user" | "system";
  content: string;
  type?: "suggestion" | "action" | "warning" | "info";
  actions?: AgentAction[];
  timestamp: Date;
}

interface AgentAction {
  label: string;
  action: string;
  data?: any;
}

interface AgentInsight {
  type: "success" | "warning" | "info" | "action";
  title: string;
  description: string;
  action?: AgentAction;
}

interface AIAgentPanelProps {
  vendorId?: string;
  context?: "dashboard" | "profile" | "documents" | "status";
  insights?: AgentInsight[];
  onAction?: (action: string, data?: any) => void;
}

const contextMessages: Record<string, AgentMessage[]> = {
  dashboard: [
    {
      id: "1",
      role: "agent",
      content: "Welcome! I'm your AI onboarding assistant. I've analyzed your profile and have some recommendations to help speed up your approval.",
      type: "info",
      timestamp: new Date(),
    },
  ],
  profile: [
    {
      id: "1",
      role: "agent",
      content: "I'm here to help you complete your profile accurately. I can auto-fill fields from your uploaded documents and validate your entries in real-time.",
      type: "info",
      timestamp: new Date(),
    },
  ],
  documents: [
    {
      id: "1",
      role: "agent",
      content: "Upload your documents and I'll automatically extract key information. I can detect document types, verify authenticity markers, and flag any issues.",
      type: "info",
      timestamp: new Date(),
    },
  ],
  status: [
    {
      id: "1",
      role: "agent",
      content: "I'm monitoring your application progress. I'll notify you of any updates and suggest actions to resolve any blockers.",
      type: "info",
      timestamp: new Date(),
    },
  ],
};

const suggestedQuestions = [
  "What documents do I need to upload?",
  "Why is my GST number not verified?",
  "How can I speed up my approval?",
  "What's missing from my profile?",
];

export function AIAgentPanel({ 
  vendorId, 
  context = "dashboard", 
  insights = [],
  onAction 
}: AIAgentPanelProps) {
  const [messages, setMessages] = useState<AgentMessage[]>(contextMessages[context] || []);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "action":
        return <Zap className="h-4 w-4 text-primary" />;
      default:
        return <Lightbulb className="h-4 w-4 text-blue-500" />;
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: AgentMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsThinking(true);

    // Simulate AI response with agentic behavior
    setTimeout(() => {
      const responses: Record<string, AgentMessage> = {
        "documents": {
          id: (Date.now() + 1).toString(),
          role: "agent",
          content: "Based on your vendor type (Private Limited Company) and business category (IT Services), you'll need: PAN Card, GST Certificate, Company Registration (CoI), and Bank Letter. Optional but recommended: ISO certificates for quality assurance.",
          type: "info",
          actions: [
            { label: "View Checklist", action: "navigate", data: "/vendor/documents" },
          ],
          timestamp: new Date(),
        },
        "gst": {
          id: (Date.now() + 1).toString(),
          role: "agent",
          content: "I noticed your GST number format looks correct, but it hasn't been verified yet. This could be because: 1) The document hasn't been uploaded, or 2) We're still processing the uploaded document. Let me check...",
          type: "warning",
          actions: [
            { label: "Upload GST Certificate", action: "upload", data: "gst_certificate" },
          ],
          timestamp: new Date(),
        },
        "speed": {
          id: (Date.now() + 1).toString(),
          role: "agent",
          content: "To speed up your approval, I recommend: 1) Complete all required fields (currently at 35%), 2) Upload clear, high-resolution documents, 3) Ensure your GST and PAN match your company name exactly. Applications with 100% completion are typically approved 3x faster.",
          type: "suggestion",
          actions: [
            { label: "Complete Profile Now", action: "navigate", data: "/vendor/profile" },
          ],
          timestamp: new Date(),
        },
        "missing": {
          id: (Date.now() + 1).toString(),
          role: "agent",
          content: "I've analyzed your profile. Missing required items: Tax Details (PAN, GST), Bank Information (Account, IFSC), and Documents (PAN Card, GST Certificate). Your completion rate will jump to 85% once these are added.",
          type: "action",
          actions: [
            { label: "Fix Tax Details", action: "navigate", data: "/vendor/profile?tab=financial" },
            { label: "Upload Documents", action: "navigate", data: "/vendor/documents" },
          ],
          timestamp: new Date(),
        },
      };

      let response = responses["missing"]; // Default response
      
      const lowerInput = input.toLowerCase();
      if (lowerInput.includes("document")) {
        response = responses["documents"];
      } else if (lowerInput.includes("gst") || lowerInput.includes("verified")) {
        response = responses["gst"];
      } else if (lowerInput.includes("speed") || lowerInput.includes("fast") || lowerInput.includes("approval")) {
        response = responses["speed"];
      } else if (lowerInput.includes("missing") || lowerInput.includes("profile")) {
        response = responses["missing"];
      }

      setMessages((prev) => [...prev, response]);
      setIsThinking(false);
    }, 1500);
  };

  const handleQuickQuestion = (question: string) => {
    setInput(question);
    setTimeout(() => handleSendMessage(), 100);
  };

  const handleAction = (action: AgentAction) => {
    if (onAction) {
      onAction(action.action, action.data);
    }
  };

  return (
    <Card className="h-full flex flex-col" data-testid="ai-agent-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <div>
            <span>AI Onboarding Agent</span>
            <Badge variant="secondary" className="ml-2 text-xs">Beta</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Insights Section */}
        {insights.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Insights</p>
            {insights.map((insight, idx) => (
              <div 
                key={idx} 
                className="p-3 rounded-lg border bg-card"
                data-testid={`insight-${idx}`}
              >
                <div className="flex items-start gap-2">
                  {getInsightIcon(insight.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{insight.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {insight.description}
                    </p>
                    {insight.action && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-auto p-0 text-xs mt-2 text-primary"
                        onClick={() => handleAction(insight.action!)}
                        data-testid={`insight-action-${idx}`}
                      >
                        {insight.action.label}
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {insights.length > 0 && <Separator />}

        {/* Chat Section */}
        <div className="flex-1 flex flex-col min-h-0">
          <p className="text-xs text-muted-foreground font-medium mb-2">Chat with AI</p>
          
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}
                  data-testid={`message-${msg.id}`}
                >
                  {msg.role === "agent" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div 
                    className={`max-w-[85%] rounded-lg p-3 ${
                      msg.role === "user" 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {msg.actions.map((action, idx) => (
                          <Button 
                            key={idx}
                            variant="secondary" 
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleAction(action)}
                            data-testid={`action-${msg.id}-${idx}`}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}

              {isThinking && (
                <div className="flex gap-2" data-testid="agent-thinking">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                    <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Analyzing...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Quick Questions */}
        <div className="flex flex-wrap gap-2">
          {suggestedQuestions.slice(0, 2).map((q, idx) => (
            <Button
              key={idx}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleQuickQuestion(q)}
              data-testid={`quick-question-${idx}`}
            >
              <Lightbulb className="h-3 w-3 mr-1" />
              {q}
            </Button>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <Input
            placeholder="Ask the AI agent..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            data-testid="input-ai-chat"
          />
          <Button 
            size="icon" 
            onClick={handleSendMessage}
            disabled={isThinking || !input.trim()}
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
