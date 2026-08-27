import { useState } from "react";
import { 
  Brain, 
  ShieldCheck, 
  ShieldAlert, 
  ShieldX,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileSearch,
  TrendingUp,
  TrendingDown,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Flag,
  ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface RiskFactor {
  category: string;
  score: number;
  weight: number;
  findings: string[];
  status: "pass" | "warning" | "fail";
}

interface AnomalyFlag {
  severity: "high" | "medium" | "low";
  type: string;
  description: string;
  recommendation: string;
}

interface AIAnalysis {
  overallScore: number;
  riskLevel: "low" | "medium" | "high";
  recommendation: "approve" | "review" | "reject";
  confidence: number;
  summary: string;
  reasoning: string[];
  riskFactors: RiskFactor[];
  anomalies: AnomalyFlag[];
  estimatedProcessingTime: string;
}

interface AIAnalysisPanelProps {
  vendorId: string;
  vendorName: string;
  analysis?: AIAnalysis;
  onApprove?: () => void;
  onReject?: () => void;
  onRequestInfo?: () => void;
}

// Mock AI analysis for demo
const generateMockAnalysis = (vendorId: string): AIAnalysis => {
  const isHighRisk = vendorId.startsWith("1") || vendorId.includes("eco");
  const isMediumRisk = vendorId.includes("quick") || vendorId.includes("global");
  
  if (isHighRisk) {
    return {
      overallScore: 45,
      riskLevel: "high",
      recommendation: "review",
      confidence: 78,
      summary: "This vendor application requires additional review due to incomplete documentation and verification gaps.",
      reasoning: [
        "GST certificate not uploaded - unable to verify tax compliance",
        "Bank details incomplete - IFSC code missing",
        "Company registration date is recent (< 1 year)",
        "No references or previous contract history available",
      ],
      riskFactors: [
        {
          category: "Document Completeness",
          score: 35,
          weight: 30,
          findings: ["Missing: GST Certificate", "Missing: Bank Authorization Letter"],
          status: "fail",
        },
        {
          category: "Financial Verification",
          score: 40,
          weight: 25,
          findings: ["Bank IFSC not verified", "No credit history available"],
          status: "warning",
        },
        {
          category: "Compliance History",
          score: 60,
          weight: 20,
          findings: ["New business - limited compliance history"],
          status: "warning",
        },
        {
          category: "Business Profile",
          score: 55,
          weight: 25,
          findings: ["Company registered < 1 year ago", "Limited online presence"],
          status: "warning",
        },
      ],
      anomalies: [
        {
          severity: "high",
          type: "Missing Critical Document",
          description: "GST Certificate is mandatory for B2B transactions but hasn't been uploaded.",
          recommendation: "Request vendor to upload GST certificate before proceeding.",
        },
        {
          severity: "medium",
          type: "Incomplete Banking Info",
          description: "Bank account details are partially filled. IFSC code format appears incorrect.",
          recommendation: "Verify banking details through cancelled cheque or bank letter.",
        },
      ],
      estimatedProcessingTime: "2-3 business days",
    };
  }
  
  if (isMediumRisk) {
    return {
      overallScore: 72,
      riskLevel: "medium",
      recommendation: "review",
      confidence: 85,
      summary: "Vendor profile is mostly complete with minor verification items pending. Recommend proceeding with standard due diligence.",
      reasoning: [
        "All primary documents uploaded and verified",
        "GST number validated against government database",
        "One document (ISO certificate) is approaching expiry",
        "Strong financial profile with 5+ years of operation",
      ],
      riskFactors: [
        {
          category: "Document Completeness",
          score: 85,
          weight: 30,
          findings: ["All required documents uploaded", "ISO cert expires in 60 days"],
          status: "pass",
        },
        {
          category: "Financial Verification",
          score: 80,
          weight: 25,
          findings: ["Bank details verified", "Credit score: Good"],
          status: "pass",
        },
        {
          category: "Compliance History",
          score: 65,
          weight: 20,
          findings: ["Minor GST filing delay in Q2 2024", "Currently compliant"],
          status: "warning",
        },
        {
          category: "Business Profile",
          score: 70,
          weight: 25,
          findings: ["Established business", "Industry reputation: Average"],
          status: "pass",
        },
      ],
      anomalies: [
        {
          severity: "medium",
          type: "Expiring Certificate",
          description: "ISO 9001 certificate expires on March 15, 2025 (in 68 days).",
          recommendation: "Flag for renewal reminder and conditional approval.",
        },
      ],
      estimatedProcessingTime: "1-2 business days",
    };
  }
  
  // Low risk / approved
  return {
    overallScore: 92,
    riskLevel: "low",
    recommendation: "approve",
    confidence: 95,
    summary: "Excellent vendor profile with complete documentation and strong verification scores. Recommended for immediate approval.",
    reasoning: [
      "All required documents verified and valid",
      "GST and PAN cross-verified with government databases",
      "Strong credit history and financial stability",
      "Multiple successful contracts with similar organizations",
      "ISO 9001:2015 certified with valid certification",
    ],
    riskFactors: [
      {
        category: "Document Completeness",
        score: 100,
        weight: 30,
        findings: ["All documents verified", "Certifications current"],
        status: "pass",
      },
      {
        category: "Financial Verification",
        score: 95,
        weight: 25,
        findings: ["Excellent credit score", "Stable revenue growth"],
        status: "pass",
      },
      {
        category: "Compliance History",
        score: 90,
        weight: 20,
        findings: ["No compliance issues", "Timely tax filings"],
        status: "pass",
      },
      {
        category: "Business Profile",
        score: 88,
        weight: 25,
        findings: ["10+ years in operation", "Strong market reputation"],
        status: "pass",
      },
    ],
    anomalies: [],
    estimatedProcessingTime: "Immediate",
  };
};

export function AIAnalysisPanel({ 
  vendorId, 
  vendorName,
  analysis: providedAnalysis,
  onApprove,
  onReject,
  onRequestInfo
}: AIAnalysisPanelProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(providedAnalysis || null);
  const [expandedFactors, setExpandedFactors] = useState<string[]>([]);

  const runAnalysis = () => {
    setIsRunning(true);
    setTimeout(() => {
      setAnalysis(generateMockAnalysis(vendorId));
      setIsRunning(false);
    }, 2000);
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case "low":
        return <ShieldCheck className="h-5 w-5 text-emerald-500" />;
      case "medium":
        return <ShieldAlert className="h-5 w-5 text-amber-500" />;
      case "high":
        return <ShieldX className="h-5 w-5 text-red-500" />;
      default:
        return <ShieldAlert className="h-5 w-5" />;
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "low":
        return "text-emerald-600 dark:text-emerald-400";
      case "medium":
        return "text-amber-600 dark:text-amber-400";
      case "high":
        return "text-red-600 dark:text-red-400";
      default:
        return "";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "fail":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "medium":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      case "low":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      default:
        return "";
    }
  };

  const toggleFactor = (category: string) => {
    setExpandedFactors((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  if (!analysis && !isRunning) {
    return (
      <Card data-testid="ai-analysis-empty">
        <CardContent className="py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
            <Brain className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium mb-2">AI Risk Analysis</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
            Run AI-powered analysis to assess vendor risk, verify documents, and get approval recommendations.
          </p>
          <Button onClick={runAnalysis} data-testid="button-run-analysis">
            <Brain className="h-4 w-4 mr-2" />
            Run Analysis
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isRunning) {
    return (
      <Card data-testid="ai-analysis-running">
        <CardContent className="py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto mb-4">
            <RefreshCw className="h-8 w-8 text-primary animate-spin" />
          </div>
          <h3 className="font-medium mb-2">Analyzing Vendor Profile</h3>
          <p className="text-sm text-muted-foreground mb-4">
            The AI agent is reviewing documents, verifying data, and assessing risk...
          </p>
          <div className="max-w-xs mx-auto space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Document verification</span>
              <span>Complete</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Cross-referencing databases</span>
              <span>In progress...</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Risk assessment</span>
              <span>Pending</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="ai-analysis-panel">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI Risk Analysis
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={runAnalysis} data-testid="button-refresh-analysis">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Score & Recommendation */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="p-4 rounded-lg border bg-card" data-testid="risk-score-card">
            <div className="flex items-center gap-3 mb-3">
              {getRiskIcon(analysis!.riskLevel)}
              <div>
                <p className="text-sm text-muted-foreground">Risk Level</p>
                <p className={`font-semibold capitalize ${getRiskColor(analysis!.riskLevel)}`}>
                  {analysis!.riskLevel} Risk
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Score</span>
                <span className="font-mono font-semibold">{analysis!.overallScore}/100</span>
              </div>
              <Progress value={analysis!.overallScore} className="h-2" />
            </div>
          </div>

          <div className="p-4 rounded-lg border bg-card" data-testid="recommendation-card">
            <div className="flex items-center gap-3 mb-3">
              <Lightbulb className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">AI Recommendation</p>
                <p className="font-semibold capitalize">
                  {analysis!.recommendation === "approve" && "Approve"}
                  {analysis!.recommendation === "review" && "Needs Review"}
                  {analysis!.recommendation === "reject" && "Reject"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-xs">
                {analysis!.confidence}% confidence
              </Badge>
              <span>|</span>
              <Clock className="h-3 w-3" />
              <span>{analysis!.estimatedProcessingTime}</span>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 rounded-lg bg-muted/50" data-testid="analysis-summary">
          <p className="text-sm font-medium mb-2">Summary</p>
          <p className="text-sm text-muted-foreground">{analysis!.summary}</p>
        </div>

        {/* Reasoning */}
        <div data-testid="analysis-reasoning">
          <p className="text-sm font-medium mb-3">Agent Reasoning</p>
          <ul className="space-y-2">
            {analysis!.reasoning.map((reason, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        <Separator />

        {/* Risk Factors */}
        <div data-testid="risk-factors">
          <p className="text-sm font-medium mb-3">Risk Factor Breakdown</p>
          <div className="space-y-2">
            {analysis!.riskFactors.map((factor) => (
              <Collapsible
                key={factor.category}
                open={expandedFactors.includes(factor.category)}
                onOpenChange={() => toggleFactor(factor.category)}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between h-auto py-3 px-3"
                    data-testid={`factor-${factor.category.toLowerCase().replace(/\s/g, '-')}`}
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(factor.status)}
                      <span className="text-sm">{factor.category}</span>
                      <Badge variant="outline" className="text-xs">
                        {factor.weight}% weight
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono">{factor.score}/100</span>
                      {expandedFactors.includes(factor.category) ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3 pt-1">
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {factor.findings.map((finding, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-muted-foreground">-</span>
                          <span>{finding}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </div>

        {/* Anomalies */}
        {analysis!.anomalies.length > 0 && (
          <>
            <Separator />
            <div data-testid="anomaly-flags">
              <div className="flex items-center gap-2 mb-3">
                <Flag className="h-4 w-4 text-amber-500" />
                <p className="text-sm font-medium">Anomaly Flags ({analysis!.anomalies.length})</p>
              </div>
              <div className="space-y-3">
                {analysis!.anomalies.map((anomaly, idx) => (
                  <div 
                    key={idx} 
                    className={`p-3 rounded-lg border ${getSeverityColor(anomaly.severity)}`}
                    data-testid={`anomaly-${idx}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-medium">{anomaly.type}</p>
                      <Badge 
                        variant="outline" 
                        className={`text-xs capitalize ${getSeverityColor(anomaly.severity)}`}
                      >
                        {anomaly.severity}
                      </Badge>
                    </div>
                    <p className="text-xs mb-2">{anomaly.description}</p>
                    <div className="flex items-start gap-1.5 text-xs">
                      <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{anomaly.recommendation}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator />

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3" data-testid="analysis-actions">
          {analysis!.recommendation === "approve" ? (
            <Button onClick={onApprove} className="flex-1" data-testid="button-approve-vendor">
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve Vendor
            </Button>
          ) : (
            <>
              <Button onClick={onApprove} variant="outline" className="flex-1" data-testid="button-approve-anyway">
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve Anyway
              </Button>
              {analysis!.recommendation === "review" && (
                <Button onClick={onRequestInfo} variant="secondary" className="flex-1" data-testid="button-request-info">
                  <FileSearch className="h-4 w-4 mr-2" />
                  Request More Info
                </Button>
              )}
            </>
          )}
          <Button onClick={onReject} variant="destructive" data-testid="button-reject-vendor">
            <XCircle className="h-4 w-4 mr-2" />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
