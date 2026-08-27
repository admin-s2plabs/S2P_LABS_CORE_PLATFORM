import envelopeSealedImg from "@/assets/images/envolope-sealed.png";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAISettings } from "@/hooks/use-ai-settings";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BarChart3,
  Bot,
  Brain,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  Crown,
  DollarSign,
  Download,
  File,
  FileText,
  Gavel,
  HandCoins,
  History,
  Lightbulb,
  Loader2,
  Mail,
  MapPin,
  Paperclip,
  Plus,
  Scale,
  Send,
  Shield,
  Sparkles,
  Star,
  Target,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Trophy,
  User,
  Users,
  XCircle
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { AWARD_ACTIONS_DENIED_MESSAGE } from "@shared/bid-award-auth";
import { addHoursToLocalDateTime, clampDateTimeLocal, getCurrentLocalDateTime, validateNegotiationDates } from "./bid-form-utils";

function formatDateTime(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const bidTypeLabels: Record<string, { label: string; full: string; className: string }> = {
  RFQ: { label: "RFQ", full: "Request for Quotation", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  RFP: { label: "RFP", full: "Request for Proposal", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  Tender: { label: "Tender", full: "Open Tender", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

const statusConfig: Record<string, { className: string }> = {
  Published: { className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  Closed: { className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  Awarded: { className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  "Award Under Process": { className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  Draft: { className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

function getWorkflowSteps(bidType: string, isHighValue: boolean): string[] {
  if (bidType === "Tender") {
    return [
      "Prepare Bid", "Publish Approved", "Publish", "Closed",
      "Tender Opened", "Technical Review", "Technical Approve",
      "Commercial Review", "Commercial Approve",
      "Prepare Award", "Award Approval", "Awarded",
    ];
  }
  if (bidType === "RFP") {
    return [
      "Prepare Bid", "Publish", "Closed",
      "Technical Review",
      "Commercial Review",
      "Prepare Award", "Award Approval", "Awarded",
    ];
  }
  return [
    "Prepare Bid", "Publish", "Closed",
    "Prepare Award", "Award Approval", "Awarded",
  ];
}

function deriveStepPosition(bid: any, approvers: any[]): { completedSteps: string[]; activeStep: string } {
  const bidType = bid.type || "RFQ";
  const status = bid.status || "";
  const envOpened = bid.env_opened === "Y";
  const isTender = bidType === "Tender";
  const isRFP = bidType === "RFP";
  const isRFQ = bidType === "RFQ";
  const isHighValue = parseFloat(bid.attribute_10 || "0") >= 500000;
  const hasTenderSteps = isTender || isHighValue;

  if (status === "Cancelled") return { completedSteps: [], activeStep: "" };

  if (status === "Draft" || status === "Pending Approval") {
    if (hasTenderSteps) return { completedSteps: ["prepareBid"], activeStep: "prepareBid" };
    return { completedSteps: ["prepareBid"], activeStep: "prepareBid" };
  }

  if (status === "Published" || status === "Negotiation") {
    if (hasTenderSteps) return { completedSteps: ["prepareBid", "publishApprove", "published"], activeStep: "published" };
    if (isRFP) return { completedSteps: ["prepareBid", "published"], activeStep: "closed" };
    return { completedSteps: ["prepareBid", "published"], activeStep: "closed" };
  }

  if (status === "Closed" ) {
    const techScoreComplete = bid.tech_score_complete === "Y";
    const finScoreComplete = bid.fin_score_complete === "Y";
    const base = hasTenderSteps
      ? ["prepareBid", "publishApprove", "published", "closed"]
      : isRFP
        ? ["prepareBid", "published", "closed"]
        : ["prepareBid", "published", "closed"];
    const envOpened = bid.env_opened === "Y";
    const techScoreApproved = bid.techscoreapproved === "Y";
    const finScoreApproved = bid.finscoreapproved === "Y";

    if (!isRFQ) {
      const completed = [...base];
      if (hasTenderSteps && envOpened) completed.push("openBid");

      if (hasTenderSteps) {
        if (techScoreApproved && finScoreApproved) {
          return { completedSteps: [...completed, "technicalReview", "technicalApprove", "commercialReview", "commercialApprove"], activeStep: "prepareAward" };
        }
        if (techScoreApproved && finScoreComplete) {
          return { completedSteps: [...completed, "technicalReview", "technicalApprove", "commercialReview"], activeStep: "commercialApprove" };
        }
        if (techScoreApproved) {
          return { completedSteps: [...completed, "technicalReview", "technicalApprove"], activeStep: "commercialReview" };
        }
        if (techScoreComplete) {
          return { completedSteps: [...completed, "technicalReview"], activeStep: "technicalApprove" };
        }
      } else if (isRFP) {
        if (finScoreComplete) {
          return { completedSteps: [...completed, "technicalReview", "commercialReview"], activeStep: "prepareAward" };
        }
        if (techScoreComplete) {
          return { completedSteps: [...completed, "technicalReview"], activeStep: "commercialReview" };
        }
      }
      if (envOpened || isRFP) {
        return { completedSteps: completed, activeStep: "technicalReview" };
      }
      else if (isTender && !envOpened) {
        return { completedSteps: completed, activeStep: "openBid" };
      }
    } else {
      const completed = [...base];
      return { completedSteps: completed, activeStep: "prepareAward" };
    }
  }

  if (status === "Award Under Process" || status === "Finalize") {
    const base = hasTenderSteps
      ? ["prepareBid", "publishApprove", "published", "closed", "openBid", "technicalReview", "technicalApprove", "commercialReview", "commercialApprove", "prepareAward"]
      : isRFP
        ? ["prepareBid", "published", "closed", "openBid", "technicalReview", "technicalApprove", "commercialReview", "commercialApprove", "prepareAward"]
        : ["prepareBid", "published", "closed", "technicalReview", "commercialReview", "prepareAward"];
    return { completedSteps: base, activeStep: "awardApproved" };
  }

  if (status === "Awarded") {
    const base = hasTenderSteps
      ? ["prepareBid", "publishApprove", "published", "closed", "openBid", "technicalReview", "technicalApprove", "commercialReview", "commercialApprove", "prepareAward", "awardApproved", "awarded"]
      : isRFP
        ? ["prepareBid", "published", "closed", "technicalReview", "commercialReview", "prepareAward", "awardApproved", "awarded"]
        : ["prepareBid", "published", "closed", "technicalReview", "commercialReview", "prepareAward", "awardApproved", "awarded"];
    return { completedSteps: base, activeStep: "awarded" };
  }

  return { completedSteps: ["prepareBid"], activeStep: "prepareBid" };
}

function BidStepper({ bid, approvers }: { bid: any; approvers: any[] }) {
  const bidType = bid.type || "RFQ";
  const isHighValue = parseFloat(bid.attribute_10 || "0") >= 500000;
  const steps = getWorkflowSteps(bidType, isHighValue);
  const { completedSteps, activeStep } = deriveStepPosition(bid, approvers);
  const isCancelled = bid.status === "Cancelled";

  const stepKeys: string[] = [];
  if (bidType === "Tender" || isHighValue) {
    stepKeys.push("prepareBid", "publishApprove", "published", "closed", "openBid", "technicalReview", "technicalApprove", "commercialReview", "commercialApprove", "prepareAward", "awardApproved", "awarded");
  } else if (bidType === "RFP") {
    stepKeys.push("prepareBid", "published", "closed", "technicalReview", "commercialReview", "prepareAward", "awardApproved", "awarded");
  } else {
    stepKeys.push("prepareBid", "published", "closed", "prepareAward", "awardApproved", "awarded");
  }

  return (
    <Card data-testid="card-eval-stepper">
      <CardContent className="px-4 py-3">
        <p className="text-xs text-muted-foreground mb-2">Indicating current step to track the Flow Status of the Bid.</p>
        <div className="flex items-center flex-wrap gap-y-1">
          {steps.map((step, idx) => {
            const key = stepKeys[idx];
            const isCompleted = !isCancelled && completedSteps.includes(key);
            const isCurrent = !isCancelled && activeStep === key;

            return (
              <div key={idx} className="flex items-center" data-testid={`eval-step-${idx}`}>
                <div
                  className={`
                    flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors
                    ${isCompleted
                      ? "bg-emerald-600 text-white dark:bg-emerald-700"
                      : isCurrent
                        ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                        : isCancelled
                          ? "bg-muted text-muted-foreground line-through"
                          : "bg-muted text-muted-foreground"
                    }
                  `}
                >
                  <span className={`
                    flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold shrink-0
                    ${isCompleted
                      ? "bg-white/20"
                      : isCurrent
                        ? "bg-white/20"
                        : "bg-foreground/10"
                    }
                  `}>
                    {isCompleted ? <Check className="h-2.5 w-2.5" /> : idx + 1}
                  </span>
                  {step}
                </div>
                {idx < steps.length - 1 && (
                  <div className={`w-3 h-0.5 shrink-0 ${isCompleted ? "bg-emerald-600 dark:bg-emerald-700" : "bg-muted"}`} />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoItem({ label, value, icon: Icon, testId }: { label: string; value: string | null | undefined; icon?: any; testId?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className="text-sm font-medium" data-testid={testId}>{value || "-"}</p>
    </div>
  );
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

interface BudgetLine {
  id: number;
  segment_dtl_code: string;
  segment_dtl_name: string;
  amount: string;
  consumed_amount: string;
  reserved_amount: string;
  business_entity: string;
  budget_mst_id: number;
  budget_name: string;
  budget_curr: string;
}

export default function BidEvaluate({ id }: { id?: string }) {
  const [, params] = useRoute("/app/bids/:id/evaluate");
  const bidId = id || params?.id;
  const { isAIEnabled } = useAISettings();
  const { data, isLoading, error } = useQuery<any>({
    queryKey: [`/api/dbo/bids/${bidId}/evaluate`],
    enabled: !!bidId,
  });

  const { data: approvers } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "approvers"],
    enabled: !!bidId,
  });

  let currentUser: any = {};
  try {
    const authData = JSON.parse(localStorage.getItem("prokraya-auth") || "{}");
    currentUser = authData?.state?.user || authData?.user || authData || {};
  } catch (e) {
    console.error("Failed to parse auth data", e);
  }

  const openEnvelopeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/dbo/bids/${bidId}/evaluate/open-envelope`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Action Submitted", description: "Your request to open the envelope has been recorded." });
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bidId}/evaluate`] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId, "approvers"] });
    },
    onError: (err: any) => {
      toast({ title: "Action Failed", description: err.message || "Failed to process envelope opening", variant: "destructive" });
    }
  });

  const [auditPage, setAuditPage] = useState(1);
  const { data: auditData } = useQuery<any>({
    queryKey: ["/api/bids", bidId, "audit-logs", auditPage],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/bids/${bidId}/audit-logs?page=${auditPage}&limit=5`);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
    enabled: !!bidId,
  });

  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [negotiationOpen, setNegotiationOpen] = useState(false);
  const { toast } = useToast();
  const [aiMarketData, setAiMarketData] = useState<any>(null);
  const [aiMarketLoading, setAiMarketLoading] = useState(false);
  const [aiQualityData, setAiQualityData] = useState<any>(null);
  const [aiQualityLoading, setAiQualityLoading] = useState(false);
  const [aiNegotiationData, setAiNegotiationData] = useState<any>(null);
  const [aiNegotiationLoading, setAiNegotiationLoading] = useState(false);
  const [creatingPOForAward, setCreatingPOForAward] = useState<number | null>(null);
  const [bidToPOData, setBidtoPOData] = useState<any>(null);
  const [createPODialogOpen, setCreatePODialogOpen] = useState(false);
  const [bidToPOForm, setBidToPOForm] = useState({
    budgetId: "",
    budgetName: "",
    needByDate: "",
    payment_term: "",
    payment_term_name: "",
    advance_flag: false,
    advance_percentage: "",
    deliverToLocationId: "",
    deliverToLocationName: "",
    selectedLines: ""
  });

  const { data: budgetLinesData } = useQuery<BudgetLine[]>({
    queryKey: ["/api/budgets/approved-lines"],
  });

  const { data: paymentTermsData } = useQuery<{
    data: {
      id: number;
      payment_term_id: string;
      terms_name: string;
      status: string;
    }[];
  }>({
    queryKey: ["/api/payment-terms?limit=100"],
  });

  const { data: locationsData } = useQuery<any[]>({
    queryKey: ["/api/locations"],
  });

  const paymentTerms = (paymentTermsData?.data || []).filter(
    (pt) => pt.status === "Y",
  );

  const submitBidToPOModal = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!bidToPOForm?.budgetId || bidToPOForm?.budgetId === "null") {
      toast({ title: "Validation Failure", description: "Please select Budget", variant: "destructive" });
      return;
    }
    if (!bidToPOForm?.needByDate) {
      toast({ title: "Validation Failure", description: "Please select Need by Date", variant: "destructive" });
      return;
    }
    if (!bidToPOForm?.deliverToLocationId) {
      toast({ title: "Validation Failure", description: "Please select Delivery Location", variant: "destructive" });
      return;
    }
    if (!bidToPOForm?.payment_term) {
      toast({ title: "Validation Failure", description: "Please select Payment Terms", variant: "destructive" });
      return;
    }
    if (bidToPOForm?.advance_flag && (!bidToPOForm?.advance_percentage === null || !bidToPOForm?.advance_percentage === undefined || bidToPOForm?.advance_percentage === "" || !bidToPOForm?.advance_percentage)) {
      toast({
        title: "Validation Failure",
        description:
          "Please add Advance Percentage to Continue!",
        variant: "destructive",
      });
      return;
    }
    if (bidToPOForm?.selectedLines?.trim() === "") {
      toast({ title: "Validation Failure", description: "Please select Lines to proceed", variant: "destructive" });
      return;
    }
    createPOMutation.mutate({
      award: bidToPOData,
      bid,
      awardLineIds: (bidToPOForm?.selectedLines || "")?.split(",")?.join("~"),
    });
  };

  const createPOMutation = useMutation({
    mutationFn: async (params: { award: any; bid: any; awardLineIds: string }) => {
      const res = await apiRequest("POST", "/api/purchase-orders/from-bid-award", {
        awardNumber: String(params.award.id),
        prNumber: params.bid.pr_number || params.bid.prNumber || "",
        awardDescription: params.bid.bid_title || params.award.bidtitle || "",
        deliverToLocationId: bidToPOForm?.deliverToLocationId || params.bid.delivertto_location_id || "",
        departmentName: params.bid.department_name || "",
        budgetSegment: bidToPOForm?.budgetId || "",
        budgetName: bidToPOForm?.budgetName,
        deliveryDate: bidToPOForm?.needByDate,
        requestorId: params.bid.requestor || "",
        supplierId: String(params.award.supplier_id),
        awardCurrency: params.bid.currency || "AED",
        termsId: bidToPOForm?.payment_term,
        paymentTerms: bidToPOForm?.payment_term_name,
        advanceFlag: bidToPOForm?.advance_flag === true ? "Y" : "N",
        advancePercentage: bidToPOForm?.advance_percentage,
        awardLinesStr: params.awardLineIds,
      });
      return res.json();
    },
    onSuccess: (result: any) => {
      toast({ title: "Purchase Order Created", description: result.message || `PO ${result.poNumber} created successfully` });
      queryClient.invalidateQueries({ queryKey: ["/api/bids", bidId] });
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bidId}/evaluate`] });
      setCreatingPOForAward(null);
      setBidtoPOData(null);
      setCreatePODialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to Create PO", description: err.message || "Something went wrong", variant: "destructive" });
      setCreatingPOForAward(null);
    },
  });

  const [cancellingAward, setCancellingAward] = useState<number | null>(null);
  const cancelAwardMutation = useMutation({
    mutationFn: async (awardId: number) => {
      const res = await apiRequest("POST", `/api/dbo/bids/awards/${awardId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Award Cancelled", description: "The award has been cancelled successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bidId}/evaluate`] });
      setCancellingAward(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to Cancel Award", description: err.message || "Something went wrong", variant: "destructive" });
      setCancellingAward(null);
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data?.bid) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Evaluation Data Not Found</h2>
            <p className="text-sm text-muted-foreground mb-4">Could not load evaluation data for this bid.</p>
            <Link href="/app/bids">
              <Button variant="outline" data-testid="button-eval-back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Bids
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fetchAIMarketIntelligence = async () => {
    setAiMarketLoading(true);
    try {
      const res = await apiRequest("GET", `/api/dbo/bids/${data.bid.id}/ai/market-intelligence`);
      const result = await res.json();
      setAiMarketData(result);
    } catch (e: any) {
      toast({ title: "AI Error", description: e.message || "Could not generate market intelligence.", variant: "destructive" });
    } finally {
      setAiMarketLoading(false);
    }
  };

  const fetchAIQualityScores = async () => {
    setAiQualityLoading(true);
    try {
      const res = await apiRequest("GET", `/api/dbo/bids/${data.bid.id}/ai/response-quality`);
      const result = await res.json();
      setAiQualityData(result);
    } catch (e: any) {
      toast({ title: "AI Error", description: e.message || "Could not generate quality scores.", variant: "destructive" });
    } finally {
      setAiQualityLoading(false);
    }
  };

  const fetchAINegotiation = async () => {
    setAiNegotiationLoading(true);
    try {
      const res = await apiRequest("GET", `/api/dbo/bids/${data.bid.id}/ai/negotiation-suggestions`);
      const result = await res.json();
      setAiNegotiationData(result);
    } catch (e: any) {
      toast({ title: "AI Error", description: e.message || "Could not generate negotiation suggestions.", variant: "destructive" });
    } finally {
      setAiNegotiationLoading(false);
    }
  };

  const { bid, responses, lines: allLines, requirements: allRequirements, scores: allScores, awards = [], allLinesHavePo, awardLines } = data;

  const bidBudgetLines = budgetLinesData?.filter(
    (item) => item.business_entity === bid.org_id && item.id != null,
  );
  const uniqueBudgets = Array.from(
    new Map(bidBudgetLines?.map((item) => [item.id, item])).values(),
  );

  const bidType = bid.type || "RFQ";
  const typeConfig = bidTypeLabels[bidType] || bidTypeLabels["RFQ"];
  const bidNumber = bid.bid_number || bid.attribute_4 || `BID-${bid.id}`;
  const sConfig = statusConfig[bid.status] || statusConfig["Draft"];
  const totalResponses = (responses || []).length;

  const isHighValue = parseFloat(bid.attribute_10 || "0") >= 500000;
  const steps = getWorkflowSteps(bidType, isHighValue);
  const { activeStep } = deriveStepPosition(bid, approvers || []);
  const isCancelled = bid.status === "Cancelled";

  const stepKeys: string[] = [];
  if (bidType === "Tender" || isHighValue) {
    stepKeys.push("prepareBid", "publishApprove", "published", "closed", "openBid", "technicalReview", "technicalApprove", "commercialReview", "commercialApprove", "prepareAward", "awardApproved", "awarded");
  } else if (bidType === "RFP") {
    stepKeys.push("prepareBid", "published", "closed", "technicalReview", "commercialReview", "prepareAward", "awardApproved", "awarded");
  } else {
    stepKeys.push("prepareBid", "published", "closed", "prepareAward", "awardApproved", "awarded");
  }

  const stepsWithState = steps.map((_, key) => ({
    key: stepKeys[key],
    isCurrent: !isCancelled && activeStep === stepKeys[key],
  }));
  const currentStep = stepsWithState.find((stepItem) => stepItem.isCurrent);

  return (
    <div className="p-4 space-y-3 overflow-hidden">
      <div className="flex items-center gap-3 flex-wrap" data-testid="breadcrumb-evaluate">
        <Link href="/app/bids">
          <Button variant="ghost" size="icon" data-testid="button-back-to-bids-list">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
          <Gavel className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold" data-testid="text-eval-bid-number">{bidNumber}</h1>
            <Badge variant="outline" className={`border-0 ${typeConfig.className}`} data-testid="badge-eval-bid-type">
              {typeConfig.full}
            </Badge>
            <Badge variant="secondary" className={`${sConfig.className}`} data-testid="badge-eval-bid-status">
              {bid.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="text-eval-bid-title">{bid.bid_title}</p>
        </div>
      </div>

      <BidStepper bid={bid} approvers={approvers || []} />

      <Card>
        <CardContent className="p-4">
          {bid.description && (
            <div className="mb-4">
              <p className="text-sm text-muted-foreground max-w-2xl">{bid.description}</p>
              <Separator className="mt-4" />
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoItem label="Start Date" value={formatDateTime(bid.startdate)} icon={Calendar} testId="text-eval-start-date" />
            <InfoItem label="End Date" value={formatDateTime(bid.enddate)} icon={Calendar} testId="text-eval-end-date" />
            <InfoItem label="Currency" value={bid.currency} icon={DollarSign} testId="text-eval-currency" />
            <InfoItem label="Bid Style" value={bid.bid_style || "-"} icon={Shield} testId="text-eval-bid-style" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <InfoItem label="Payment Terms" value={bid.paymentterms} icon={CreditCard} testId="text-eval-payment-terms" />
            <InfoItem label="Delivery Location" value={bid.delivertto_location_name || bid.shiptoaddress} icon={MapPin} testId="text-eval-delivery-location" />
            {bid.pr_number && (
              <InfoItem label="Linked PR" value={bid.pr_number} icon={FileText} testId="text-eval-linked-pr" />
            )}
            {bid.budget_name && (
              <InfoItem label="Budget" value={bid.budget_name} icon={DollarSign} testId="text-eval-linked-budget" />
            )}
            {bidType === "Tender" && (
              <InfoItem label="Envelope Open Date" value={formatDateTime(bid.env_open_date)} icon={Clock} testId="text-eval-env-open-date" />
            )}
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3" />
                Buyer
              </p>
              <p className="text-sm font-medium" data-testid="text-eval-buyer-name">{bid.buyer_name || bid.buyer || "-"}</p>
              {bid.buyer_email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" />{bid.buyer_email}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3" />
                Requestor
              </p>
              <p className="text-sm font-medium" data-testid="text-eval-requestor-name">{bid.requestor_name || "-"}</p>
              {bid.requestor_email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" />{bid.requestor_email}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                Department
              </p>
              <p className="text-sm font-medium" data-testid="text-eval-department">{bid.department_name || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <Users className="h-3 w-3" />
                Responses / Invited
              </p>
              <p className="text-sm font-medium" data-testid="text-eval-responses-count">
                {totalResponses} / {bid.no_invited_supps || 0}
              </p>
            </div>
          </div>

        </CardContent>
      </Card>

      <Tabs defaultValue="responses" className="w-full">
        <TabsList data-testid="tabs-evaluate">
          <TabsTrigger value="responses" data-testid="tab-responses">Responses</TabsTrigger>
          <TabsTrigger value="awards" data-testid="tab-awards">Awards</TabsTrigger>
          {isAIEnabled('AI_MARKET_INTELLIGENCE') && (
            <TabsTrigger value="ai-analysis" data-testid="tab-ai-analysis">
              <Bot className="h-3.5 w-3.5 mr-1" />
              AI Analysis
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="responses" className="mt-3 space-y-3">
          <EvaluationHierarchyCard
            approvers={approvers || []}
            bid={bid}
            bidType={bidType}
            openEnvelopeMutation={openEnvelopeMutation}
            currentUser={currentUser}
          />

          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">List of Supplier Responses related to this Bid.</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {bid.status === "Closed" && (
                    <Button variant="outline" size="sm" data-testid="button-request-negotiation" onClick={() => setNegotiationOpen(true)}>
                      <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
                      Request Negotiation
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)} data-testid="button-compare-bids">
                    <Scale className="h-3.5 w-3.5 mr-1.5" />
                    Compare Bids
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" data-testid="button-download-documents">
                        <Download className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {bidType !== "RFQ" && <DropdownMenuItem
                        data-testid="menu-download-technical"
                        onClick={async () => {
                          try {
                            const res = await apiRequest("GET", `/api/dbo/bids/${bid.id}/documents/download?type=technical`);
                            if (!res.ok) {
                              const err = await res.json().catch(() => ({ error: "Download failed" }));
                              toast({ title: "No documents", description: err.error || "No technical documents found", variant: "destructive" });
                              return;
                            }
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `BID_${bid.id}_Technical_Documents.zip`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            URL.revokeObjectURL(url);
                          } catch {
                            toast({ title: "Error", description: "Failed to download technical documents", variant: "destructive" });
                          }
                        }}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Technical Documents
                      </DropdownMenuItem>}
                      <DropdownMenuItem
                        data-testid="menu-download-financial"
                        onClick={async () => {
                          try {
                            const res = await apiRequest("GET", `/api/dbo/bids/${bid.id}/documents/download?type=financial`);
                            if (!res.ok) {
                              const err = await res.json().catch(() => ({ error: "Download failed" }));
                              toast({ title: "No documents", description: err.error || "No financial documents found", variant: "destructive" });
                              return;
                            }
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `BID_${bid.id}_Financial_Documents.zip`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            URL.revokeObjectURL(url);
                          } catch {
                            toast({ title: "Error", description: "Failed to download financial documents", variant: "destructive" });
                          }
                        }}
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        Financial Documents
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <SupplierResponsesTable responses={responses} bid={bid} onViewResponse={(id) => setSelectedResponseId(id)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="awards" className="mt-3">
          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">Awards created for this bid.</p>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {awards.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  <Scale className="h-8 w-8 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No Awards Yet</p>
                  <p className="text-sm mt-1">Award recommendations will appear here once created.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead data-testid="th-award-id">Award Id</TableHead>
                        <TableHead className="text-right" data-testid="th-award-amount">Awarded Amount</TableHead>
                        <TableHead data-testid="th-award-to">Awarded To</TableHead>
                        <TableHead data-testid="th-award-response">Bid Response</TableHead>
                        <TableHead data-testid="th-award-contract">Contract No</TableHead>
                        <TableHead data-testid="th-award-po">PO#</TableHead>
                        <TableHead data-testid="th-award-status">Status</TableHead>
                        <TableHead data-testid="th-award-actions">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {awards.map((aw: any) => {
                        const awardStatusStyle: Record<string, string> = {
                          Draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
                          Approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                          Rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                          "Pending Approval": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                          Cancelled: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
                        };
                        return (
                          <TableRow key={aw.id} className="hover-elevate cursor-pointer" data-testid={`row-award-${aw.id}`} onClick={() => (window.location.href = `/app/bids/${bid.id}/award`)}>
                            <TableCell className="text-sm py-2">
                              <span className="text-primary underline underline-offset-2 font-medium" data-testid={`link-award-${aw.id}`}>{aw.id}</span>
                            </TableCell>
                            <TableCell className="text-sm text-right font-medium py-2" data-testid={`text-award-amount-${aw.id}`}>
                              {formatCurrency(aw.grosstotal, bid.currency)}
                            </TableCell>
                            <TableCell className="py-2" data-testid={`text-award-to-${aw.id}`}>
                              <div>
                                <p className="text-sm font-medium">{aw.supplier_name || "-"}</p>
                                {aw.supplier_contact && <p className="text-xs text-muted-foreground">{aw.supplier_contact}</p>}
                                {aw.supplier_contact_no && <p className="text-xs text-muted-foreground">{aw.supplier_contact_no}</p>}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm font-medium py-2" data-testid={`text-award-response-${aw.id}`}>
                              {aw.bid_resp_no || "-"}
                            </TableCell>
                            <TableCell className="text-sm py-2" data-testid={`text-award-contract-${aw.id}`}>{aw.contract_no || "NA"}</TableCell>
                            <TableCell className="text-sm py-2" data-testid={`text-award-po-${aw.id}`}>
                              {aw.po_number && (
                                () => {
                                  const poNumbers = aw.po_number?.split(",") ?? [];
                                  return poNumbers.map((po: any, index: number) => (
                                    <span key={po.trim()}>
                                      <span
                                        className="text-primary underline underline-offset-2 font-medium cursor-pointer"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          window.location.href = `/app/purchase-orders/${po.trim()}`;
                                        }}
                                      >
                                        {po.trim()}
                                      </span>
                                      {index < poNumbers.length - 1 && ", "}
                                    </span>
                                  ));
                                })()}
                              {aw.status === "Approved" && allLinesHavePo === false ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs"
                                  disabled={creatingPOForAward === aw.id}
                                  data-testid={`button-create-po-${aw.id}`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setCreatingPOForAward(aw.id);
                                    setBidtoPOData(aw);
                                    setBidToPOForm({
                                      ...bidToPOForm,
                                      budgetId: String(bid.budget_segment) || "",
                                      budgetName: bid.budget_name,
                                      deliverToLocationId: String(bid.delivertto_location_id) || "",
                                      deliverToLocationName: bid.delivertto_location_name || bid.shiptoaddress || "",
                                      selectedLines: ""
                                    });
                                    setCreatePODialogOpen(true);
                                  }}
                                >
                                  {creatingPOForAward === aw.id ? (
                                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Creating...</>
                                  ) : (
                                    <><FileText className="h-3 w-3 mr-1" />Create PO</>
                                  )}
                                </Button>
                              ) : (
                                ""
                              )}
                            </TableCell>
                            <TableCell className="py-2">
                              <Badge variant="secondary" className={awardStatusStyle[aw.status] || ""} data-testid={`badge-award-status-${aw.id}`}>
                                {aw.status || "Draft"}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2" data-testid={`text-award-actions-${aw.id}`}>
                              {aw.status !== "Approved" && aw.status !== "Cancelled" && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      disabled={cancellingAward === aw.id}
                                      data-testid={`button-cancel-award-${aw.id}`}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (window.confirm("Are you sure you want to cancel this award?")) {
                                          setCancellingAward(aw.id);
                                          cancelAwardMutation.mutate(aw.id);
                                        }
                                      }}
                                    >
                                      {cancellingAward === aw.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <XCircle className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Cancel Award</TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isAIEnabled('AI_MARKET_INTELLIGENCE') && (
          <TabsContent value="ai-analysis" className="mt-3 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-emerald-100 dark:bg-emerald-900/30">
                        <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Market Price Intelligence</p>
                        <p className="text-xs text-muted-foreground">Compare pricing against PO history & previous bids</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={fetchAIMarketIntelligence}
                      disabled={aiMarketLoading}
                      data-testid="button-ai-market-intel"
                    >
                      {aiMarketLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                      {aiMarketLoading ? "Analyzing..." : aiMarketData ? "Refresh" : "Analyze Prices"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  {!aiMarketData && !aiMarketLoading && (
                    <div className="text-center py-8 text-muted-foreground">
                      <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Click "Analyze Prices" to get AI-powered market price intelligence for this bid's line items.</p>
                    </div>
                  )}
                  {aiMarketLoading && (
                    <div className="text-center py-8">
                      <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary mb-2" />
                      <p className="text-sm text-muted-foreground">Analyzing pricing data across historical bids...</p>
                    </div>
                  )}
                  {aiMarketData && !aiMarketLoading && (
                    <div className="space-y-3">
                      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 rounded-lg p-3 border border-emerald-200/50 dark:border-emerald-800/30">
                        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">{aiMarketData.overallInsight}</p>
                        {aiMarketData.savingsOpportunity && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {aiMarketData.savingsOpportunity}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {aiMarketData.lineAnalysis?.map((line: any, idx: number) => (
                          <div key={idx} className="border rounded-lg p-3" data-testid={`market-line-${idx}`}>
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-sm font-medium truncate max-w-[60%]">{line.description}</p>
                              <Badge variant="outline" className={`text-xs ${line.marketPosition === "below" ? "border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : line.marketPosition === "above" ? "border-red-300 text-red-600 bg-red-50 dark:bg-red-950/30" : "border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/30"}`}>
                                {line.marketPosition === "below" ? "Below Market" : line.marketPosition === "above" ? "Above Market" : "At Market"}
                                {line.deviation !== 0 && ` (${line.deviation > 0 ? "+" : ""}${line.deviation}%)`}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-5 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">Current</span>
                                <p className="font-medium">{line.currentPrice || "N/A"}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">PO Avg</span>
                                <p className="font-medium">{line.poAvg || "N/A"}</p>
                                {line.poCount > 0 && <p className="text-[10px] text-muted-foreground">{line.poCount} POs</p>}
                              </div>
                              <div>
                                <span className="text-muted-foreground">Bid Avg</span>
                                <p className="font-medium">{line.bidHistAvg || "N/A"}</p>
                                {line.bidHistCount > 0 && <p className="text-[10px] text-muted-foreground">{line.bidHistCount} bids</p>}
                              </div>
                              <div>
                                <span className="text-muted-foreground">Min</span>
                                <p className="font-medium">{line.historicalMin || "N/A"}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Max</span>
                                <p className="font-medium">{line.historicalMax || "N/A"}</p>
                              </div>
                            </div>
                            {line.submittedPrices?.length > 0 && (
                              <div className="mt-1.5 pt-1.5 border-t">
                                <span className="text-xs text-muted-foreground">Supplier Prices: </span>
                                <span className="text-xs font-medium">{line.submittedPrices.join(", ")}</span>
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-1 italic">{line.insight}</p>
                          </div>
                        ))}
                      </div>
                      {aiMarketData.recommendations?.length > 0 && (
                        <div className="border-t pt-2">
                          <p className="text-sm font-medium mb-1 flex items-center gap-1"><Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Recommendations</p>
                          <ul className="space-y-1">
                            {aiMarketData.recommendations.map((rec: string, i: number) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                <span className="text-primary mt-0.5">•</span>
                                {rec}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {isAIEnabled('AI_TECH_EVALUATION') && (
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-violet-100 dark:bg-violet-900/30">
                          <Award className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Response Quality Scores</p>
                          <p className="text-xs text-muted-foreground">AI-powered scoring of supplier responses</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={fetchAIQualityScores}
                        disabled={aiQualityLoading}
                        data-testid="button-ai-quality-score"
                      >
                        {aiQualityLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                        {aiQualityLoading ? "Scoring..." : aiQualityData ? "Refresh" : "Score Responses"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    {!aiQualityData && !aiQualityLoading && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Award className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Click "Score Responses" to auto-evaluate supplier submissions for completeness and quality.</p>
                      </div>
                    )}
                    {aiQualityLoading && (
                      <div className="text-center py-8">
                        <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary mb-2" />
                        <p className="text-sm text-muted-foreground">Evaluating supplier responses...</p>
                      </div>
                    )}
                    {aiQualityData && !aiQualityLoading && (
                      <div className="space-y-3">
                        {aiQualityData.topRecommendation && (
                          <div className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 rounded-lg p-3 border border-violet-200/50 dark:border-violet-800/30">
                            <p className="text-sm font-medium text-violet-800 dark:text-violet-300 flex items-center gap-1">
                              <Star className="h-3.5 w-3.5" /> Top Recommendation
                            </p>
                            <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">{aiQualityData.topRecommendation}</p>
                          </div>
                        )}
                        <div className="space-y-2 max-h-[350px] overflow-y-auto">
                          {aiQualityData.responses?.map((resp: any, idx: number) => (
                            <div key={idx} className="border rounded-lg p-3" data-testid={`quality-vendor-${idx}`}>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-semibold">{resp.supplierName}</p>
                                <div className="flex items-center gap-1">
                                  <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold ${resp.overallScore >= 75 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : resp.overallScore >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"}`}>
                                    {resp.overallScore}
                                  </div>
                                </div>
                              </div>
                              <div className="grid grid-cols-4 gap-1.5 mb-2">
                                {[
                                  { label: "Completeness", score: resp.completenessScore },
                                  { label: "Technical", score: resp.technicalScore },
                                  { label: "Financial", score: resp.financialScore },
                                  { label: "Timeliness", score: resp.timelinessScore },
                                ].map((item, i) => (
                                  <div key={i} className="text-center">
                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-0.5">
                                      <div className={`h-full rounded-full ${item.score >= 75 ? "bg-emerald-500" : item.score >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${item.score}%` }} />
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">{item.label}</p>
                                    <p className="text-xs font-medium">{item.score}</p>
                                  </div>
                                ))}
                              </div>
                              {resp.strengths?.length > 0 && (
                                <div className="mb-1">
                                  <div className="flex flex-wrap gap-1">
                                    {resp.strengths.map((s: string, i: number) => (
                                      <span key={i} className="inline-flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                                        <ThumbsUp className="h-3 w-3" /> {s}
                                        {i < resp.strengths.length - 1 && <span className="text-muted-foreground mx-0.5">|</span>}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {resp.weaknesses?.length > 0 && (
                                <div>
                                  <div className="flex flex-wrap gap-1">
                                    {resp.weaknesses.map((w: string, i: number) => (
                                      <span key={i} className="inline-flex items-center gap-0.5 text-xs text-red-500 dark:text-red-400">
                                        <ThumbsDown className="h-3 w-3" /> {w}
                                        {i < resp.weaknesses.length - 1 && <span className="text-muted-foreground mx-0.5">|</span>}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <p className="text-xs text-muted-foreground mt-1 italic">{resp.summary}</p>
                            </div>
                          ))}
                        </div>
                        {aiQualityData.comparativeSummary && (
                          <div className="border-t pt-2">
                            <p className="text-sm font-medium mb-1 flex items-center gap-1"><Brain className="h-3.5 w-3.5 text-violet-500" /> Comparative Summary</p>
                            <p className="text-xs text-muted-foreground">{aiQualityData.comparativeSummary}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>


            {isAIEnabled('AI_NEGOTIATION_SUGGESTIONS') && (
              <Card>
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-amber-100 dark:bg-amber-900/30">
                        <HandCoins className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">AI Negotiation Suggestions</p>
                        <p className="text-xs text-muted-foreground">Supplier-by-supplier negotiation actions with target prices</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={fetchAINegotiation} disabled={aiNegotiationLoading} data-testid="button-ai-negotiation">
                      {aiNegotiationLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <HandCoins className="h-3.5 w-3.5 mr-1" />}
                      {aiNegotiationLoading ? "Analyzing..." : aiNegotiationData ? "Refresh" : "Get Suggestions"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  {!aiNegotiationData && !aiNegotiationLoading && (
                    <div className="text-center py-8 text-muted-foreground">
                      <HandCoins className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Click "Get Suggestions" to get clear, supplier-specific negotiation instructions with target prices.</p>
                    </div>
                  )}
                  {aiNegotiationLoading && (
                    <div className="text-center py-8">
                      <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary mb-2" />
                      <p className="text-sm text-muted-foreground">Analyzing supplier quotes and preparing negotiation plan...</p>
                    </div>
                  )}
                  {aiNegotiationData && !aiNegotiationLoading && (
                    <div className="space-y-3">
                      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 rounded-lg p-3 border border-amber-200/50 dark:border-amber-800/30">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{aiNegotiationData.summary}</p>
                        {aiNegotiationData.estimatedTotalSavings && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                            <Target className="h-3 w-3" /> Estimated Total Savings: {formatCurrency(aiNegotiationData.currency, aiNegotiationData.estimatedTotalSavings)}
                          </p>
                        )}
                      </div>

                      {(!aiNegotiationData.vendorActions || aiNegotiationData.vendorActions.length === 0) && (
                        <div className="text-center py-4 text-muted-foreground">
                          <p className="text-sm">No supplier-specific suggestions could be generated. Ensure suppliers have submitted pricing for line items.</p>
                        </div>
                      )}

                      <div className="space-y-3">
                        {aiNegotiationData.vendorActions?.map((vendor: any, idx: number) => (
                          <div key={idx} className="border rounded-lg overflow-hidden" data-testid={`negotiation-vendor-${idx}`}>
                            <div className={`px-3 py-2.5 flex items-center justify-between ${vendor.priority === "high" ? "bg-red-50 dark:bg-red-950/20 border-b border-red-200/50 dark:border-red-800/30" : vendor.priority === "low" ? "bg-emerald-50 dark:bg-emerald-950/20 border-b border-emerald-200/50 dark:border-emerald-800/30" : "bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200/50 dark:border-amber-800/30"}`}>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={`text-[10px] ${vendor.priority === "high" ? "border-red-300 text-red-600 bg-white dark:bg-red-950/30" : vendor.priority === "low" ? "border-emerald-300 text-emerald-600 bg-white dark:bg-emerald-950/30" : "border-amber-300 text-amber-600 bg-white dark:bg-amber-950/30"}`}>
                                  {vendor.priority} priority
                                </Badge>
                                <p className="text-sm font-semibold">{vendor.vendorName}</p>
                              </div>
                              {vendor.totalSavings > 0 && (
                                <span className="text-xs font-semibold text-emerald-600">Save {formatCurrency(vendor.currency, vendor.totalSavings)}</span>
                              )}
                            </div>

                            <div className="p-3 space-y-2.5">
                              <div className={`rounded-md px-3 py-2 text-sm font-medium ${vendor.priority === "high" ? "bg-red-50 text-red-800 dark:bg-red-950/20 dark:text-red-300" : vendor.priority === "low" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300" : "bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"}`}>
                                {vendor.action}
                              </div>

                              {vendor.items?.length > 0 && (
                                <div className="border rounded-md overflow-x-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-xs">Item</TableHead>
                                        <TableHead className="text-xs text-right">Current Price</TableHead>
                                        <TableHead className="text-xs text-right">Target Price</TableHead>
                                        <TableHead className="text-xs text-right">Savings</TableHead>
                                        <TableHead className="text-xs">Why</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {vendor.items.map((item: any, ii: number) => (
                                        <TableRow key={ii}>
                                          <TableCell className="text-xs font-medium max-w-[180px] truncate">{item.description}</TableCell>
                                          <TableCell className="text-xs text-right">{formatCurrency(item.currency, item.vendorPrice)}</TableCell>
                                          <TableCell className="text-xs text-right font-semibold text-primary">{formatCurrency(item.currency, item.targetPrice)}</TableCell>
                                          <TableCell className="text-xs text-right">
                                            {item.savingsPercent > 0 ? (
                                              <span className="text-emerald-600 font-medium">-{item.savingsPercent}%</span>
                                            ) : (
                                              <span className="text-muted-foreground">-</span>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-xs text-muted-foreground max-w-[200px]">{item.reason}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}

                              {vendor.keyArguments?.length > 0 && (
                                <div className="bg-muted/30 rounded-md p-2.5">
                                  <p className="text-xs font-medium mb-1 flex items-center gap-1"><Lightbulb className="h-3 w-3 text-amber-500" /> What to say to this supplier:</p>
                                  <ul className="space-y-0.5">
                                    {vendor.keyArguments.map((arg: string, ai: number) => (
                                      <li key={ai} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                        <span className="text-primary mt-0.5">•</span> {arg}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>

      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Audit History</h3>
            {auditData?.total > 0 && (
              <Badge variant="secondary" className="text-xs">{auditData.total}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 text-sm">
          {(!auditData?.records || auditData.records.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-audit">No audit records found.</p>
          ) : (
            <>
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Performed By</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditData.records.map((log: any, idx: number) => (
                      <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                        <TableCell className="text-muted-foreground text-sm py-2">{(auditPage - 1) * 5 + idx + 1}</TableCell>
                        <TableCell className="text-sm py-2">{log.audit_message}</TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-[9px] bg-muted">
                                {(log.full_name || "U").substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{log.full_name || log.user_id}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground py-2">{formatDateTime(log.audit_date)}</TableCell>
                        <TableCell className="text-sm font-medium py-2">{log.audit_action}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {auditData.totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 pt-3">
                  <span className="text-xs text-muted-foreground">
                    Showing {(auditPage - 1) * 5 + 1}–{Math.min(auditPage * 5, auditData.total)} of {auditData.total} records
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={auditPage <= 1}
                      onClick={() => setAuditPage((p: number) => p - 1)}
                      data-testid="button-eval-audit-prev"
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground px-2">
                      Page {auditPage} of {auditData.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={auditPage >= auditData.totalPages}
                      onClick={() => setAuditPage((p: number) => p + 1)}
                      data-testid="button-eval-audit-next"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ResponseDetailSheet
        responseId={selectedResponseId}
        onClose={() => setSelectedResponseId(null)}
      />

      <CompareBidsSheet
        open={compareOpen}
        onOpenChange={setCompareOpen}
        bid={bid}
        responses={responses}
        lines={allLines || []}
        requirements={allRequirements || []}
        scores={allScores || []}
        currentStep={currentStep?.key || ''}
      />

      <NegotiationSheet
        open={negotiationOpen}
        onOpenChange={setNegotiationOpen}
        bid={bid}
        responses={responses}
      />

      <Sheet
        open={createPODialogOpen} 
        onOpenChange={() => {
          setCreatePODialogOpen(false);
          setCreatingPOForAward(null);
        }}
      >
        <SheetContent className="w-[55vw] sm:max-w-[55vw] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Create PO from Award Bid</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pr-budget">
                  Budget <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={bidToPOForm.budgetId}
                  onValueChange={(v) => {
                    const selected = uniqueBudgets.find((bl) => String(bl.id) === v);
                    setBidToPOForm({ ...bidToPOForm, budgetId: v, budgetName: selected?.budget_name ? `${selected.budget_name} . ${selected.segment_dtl_name}` : "" });
                  }}
                  disabled={bid.pr_number ? true : false}
                >
                  <SelectTrigger data-testid="select-budget">
                    <SelectValue placeholder="Select Budget">
                      {bidToPOForm.budgetId &&
                        (() => {
                          const selected = uniqueBudgets.find(
                            (bl) => String(bl.id) === bidToPOForm.budgetId,
                          );
                          return selected
                            ? `${selected.budget_name} . ${selected.segment_dtl_name}`
                            : "Select Budget";
                        })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueBudgets.length > 0 ? uniqueBudgets
                        .map((budgetLine) => {
                          const lineAmount = Math.max(
                            0,
                            (parseFloat(budgetLine.amount) || 0) -
                              (parseFloat(budgetLine.consumed_amount) || 0) -
                              (parseFloat(budgetLine.reserved_amount) || 0),
                          );
                          const currencySymbol =
                            budgetLine.budget_curr === "INR"
                              ? "₹ "
                              : budgetLine.budget_curr === "USD"
                                ? "$ "
                                : budgetLine.budget_curr === "AED"
                                  ? "AED "
                                  : budgetLine.budget_curr === "EUR"
                                    ? "€ "
                                    : budgetLine.budget_curr === "GBP"
                                      ? "£ "
                                      : budgetLine.budget_curr + " ";
                          return (
                            <SelectItem
                              key={budgetLine.id}
                              value={String(budgetLine.id)}
                              className="py-2"
                            >
                              <div className="flex flex-col">
                                <span>
                                  {budgetLine.budget_name} .{" "}
                                  {budgetLine.segment_dtl_name}
                                </span>
                                <span className="text-xs text-green-600">
                                  Available Budget - {currencySymbol}
                                  {lineAmount.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                            </SelectItem>
                          );
                        }) : <div className="p-2 text-sm text-muted-foreground">
                      No budgets available in selected entity
                    </div>}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pr-need-by-date">
                  Need By Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="pr-need-by-date"
                  type="date"
                  value={bidToPOForm.needByDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) =>
                    setBidToPOForm({ ...bidToPOForm, needByDate: e.target.value })
                  }
                  data-testid="input-need-by-date"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Delivery Location <span className="text-destructive">*</span></Label>
                <Select
                  value={bidToPOForm.deliverToLocationId}
                  onValueChange={(v) => {
                    const selected = locationsData?.find((l) => String(l.id) === v);
                    setBidToPOForm({ ...bidToPOForm, deliverToLocationId: v, deliverToLocationName: selected?.location_name });
                  }}
                >
                  <SelectTrigger data-testid="select-delivery-location-po">
                    <SelectValue placeholder="Select Delivery Location" />
                  </SelectTrigger>
                  <SelectContent>
                    {(locationsData || [])
                      .filter((l) => l.status === "Y")
                      .map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.location_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Payment Terms <span className="text-destructive">*</span></Label>
                <Select
                  value={bidToPOForm.payment_term}
                  onValueChange={(v) => {
                    const selected = paymentTerms?.filter((item) => String(item.id) === bidToPOForm.payment_term);
                    setBidToPOForm({ ...bidToPOForm, payment_term: v, payment_term_name: selected[0]?.terms_name });
                  }}
                >
                  <SelectTrigger data-testid="select-payment-terms-po">
                    <SelectValue placeholder="Select Payment Terms" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentTerms.map((pt) => (
                      <SelectItem key={pt.id} value={String(pt.id)}>
                        {pt.terms_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 mt-6">
                  <Checkbox
                    id="po-advance-flag-pr"
                    checked={bidToPOForm.advance_flag}
                    onCheckedChange={(checked) => {
                      setBidToPOForm({ ...bidToPOForm, advance_flag: !!checked });
                    }}
                    data-testid="checkbox-advance-flag-po"
                  />
                  <Label
                    htmlFor="po-advance-flag-pr"
                    className="cursor-pointer"
                  >
                    Advance Payment %
                  </Label>
                </div>
                {bidToPOForm.advance_flag && (
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="e.g. 10"
                    value={bidToPOForm.advance_percentage}
                    onChange={(e) => {
                      let value = e.target.value;
                      if (value === "") {
                        setBidToPOForm({ ...bidToPOForm, advance_percentage: value });
                        return;
                      }
                      if (!/^\d*\.?\d*$/.test(value)) return;
                      let num = Number(value);
                      if (num < 0 || num > 100) return;
                      setBidToPOForm({ ...bidToPOForm, advance_percentage: value });
                    }}
                    inputMode="decimal"
                    data-testid="input-advance-percentage-po"
                  />
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-medium w-[50px]">
                      #
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[50px]">
                      Line
                    </TableHead>
                    <TableHead className="text-xs font-medium">
                      Description
                    </TableHead>
                    <TableHead className="text-xs font-medium">
                      Category
                    </TableHead>
                    <TableHead className="text-xs font-medium text-right">
                      Qty
                    </TableHead>
                    <TableHead className="text-xs font-medium">UoM</TableHead>
                    <TableHead className="text-xs font-medium text-right">
                      Unit Price
                    </TableHead>
                    <TableHead className="text-xs font-medium text-right">
                      Discount
                    </TableHead>
                    <TableHead className="text-xs font-medium">
                      Tax Code
                    </TableHead>
                    <TableHead className="text-xs font-medium text-right">
                      Amount
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {awardLines?.filter((fItem: any) => fItem.bid_award_id === bidToPOData?.id)?.map((item: any, index: any) => (
                    <TableRow
                      key={item.id || index}
                      data-testid={`row-line-${index}`}
                    >
                      <TableCell className="font-mono text-sm py-2">
                        <Checkbox
                          id={"bid-to-po-line" + item.id}
                          checked={bidToPOForm?.selectedLines?.split(",")?.includes(String(item.bid_line_id))}
                          onCheckedChange={(checked) => {
                            const existingIds = bidToPOForm?.selectedLines
                              ? bidToPOForm.selectedLines?.split(",")?.filter(Boolean)
                              : [];
                            let updatedIds = [...existingIds];
                            if (checked) {
                              if (!updatedIds.includes(String(item.bid_line_id))) {
                                updatedIds.push(String(item.bid_line_id));
                              }
                            } else {
                              updatedIds = updatedIds.filter(
                                (bid_line_id) => bid_line_id !== String(item.bid_line_id)
                              );
                            }
                            setBidToPOForm({
                              ...bidToPOForm,
                              selectedLines: updatedIds.join(","),
                            });
                          }}
                          data-testid={"bid-to-po-line-test-id" + item.id}
                          disabled={item?.po_number !== null ? true : false}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm py-2">
                        {item.po_line_number || index + 1}
                      </TableCell>
                      <TableCell className="py-2">
                        <div>
                          <p className="text-sm font-medium">
                            {item.orig_description || item.description || "-"}
                          </p>
                          {item.orig_description && item.description && (
                            <p
                              className="text-xs text-muted-foreground truncate max-w-[250px]"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[250px] cursor-default">
                                    {item.description}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{item.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm py-2">
                        {item.linetype || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm py-2">
                        {item.quantity || 0}
                      </TableCell>
                      <TableCell className="text-sm py-2">
                        {item.uom || "EA"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm py-2">
                        {formatCurrency(
                          item.bidprice,
                          item.currency,
                        )}
                      </TableCell>
                      <TableCell className="text-sm py-2">
                        {item.discprice || '-'}
                      </TableCell>
                      <TableCell className="text-sm py-2">
                        {item.tax_code || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium py-2">
                        {formatCurrency(
                          Number(item.bidprice) * Number(item.quantity),
                          item.currency,
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setCreatePODialogOpen(false);
                  setCreatingPOForAward(null);
                }}
                data-testid="button-cancel-po-from-pr"
              >
                Cancel
              </Button>
              <Button
                onClick={submitBidToPOModal}
                disabled={
                  createPOMutation.isPending
                }
                data-testid="button-create-po-from-pr"
              >
                {createPOMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                )}
                Create PO
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function ResponseDetailSheet({ responseId, onClose }: { responseId: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ response: any; requirements: any[]; lines: any[]; attachments: any[] }>({
    queryKey: ["/api/dbo/bids/response", responseId, "detail"],
    enabled: !!responseId,
  });

  const resp = data?.response;
  const requirements = data?.requirements || [];
  const lines = data?.lines || [];
  const allAttachments = data?.attachments || [];
  const currency = resp?.currency || "AED";

  const totalAmt = resp?.bidtotal ? parseFloat(resp.bidtotal) : 0;
  const totalDisc = resp?.biddisc ? parseFloat(resp.biddisc) : 0;
  const grossTotal = resp?.grosstotal ? parseFloat(resp.grosstotal) : 0;
  const amountInWords = resp?.amount_in_words || "";

  const techAttachments = allAttachments.filter((a: any) => a.attach_source === "Technical" || !a.attach_source);
  const finAttachments = allAttachments.filter((a: any) => a.attach_source === "Financial");

  return (
    <Sheet open={!!responseId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="sm:max-w-4xl overflow-y-auto" data-testid="sheet-response-detail">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Supplier Response — {responseId}
          </SheetTitle>
          <SheetDescription>
            {resp ? `${resp.supplier_name || "Supplier"} — ${resp.bidtitle || ""}` : "Loading response details..."}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 mt-6">
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </div>
        ) : !resp ? (
          <div className="mt-6 text-center text-muted-foreground">
            <p className="text-sm">Response data not available.</p>
          </div>
        ) : (
          <div className="space-y-5 mt-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
                  <ClipboardList className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-sm font-semibold">Technical Bid</h4>
              </div>
              {requirements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No requirements defined.</p>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Category</TableHead>
                        <TableHead>Requirement</TableHead>
                        <TableHead className="w-[80px]">Option</TableHead>
                        <TableHead className="w-[25%]">Response</TableHead>
                        <TableHead className="w-[20%]">Remarks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requirements.map((req: any) => (
                        <TableRow key={req.id} data-testid={`row-sheet-req-${req.id}`}>
                          <TableCell className="text-sm py-2">
                            <Badge variant="outline" className="text-xs">{req.category}</Badge>
                          </TableCell>
                          <TableCell className="text-sm py-2">{req.question}</TableCell>
                          <TableCell className="text-sm text-muted-foreground py-2">{req.qvoption}</TableCell>
                          <TableCell className="text-sm py-2">{req.response || "-"}</TableCell>
                          <TableCell className="text-sm py-2 text-muted-foreground">{req.remarks || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {techAttachments.length > 0 && (
                <div className="mt-3 pt-2 border-t">
                  <span className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <Paperclip className="h-3.5 w-3.5" />
                    Technical Attachments
                  </span>
                  <div className="overflow-x-auto">
                    <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                      <TableHeader>
                        <TableRow>
                          <TableHead>File Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {techAttachments.map((att: any) => (
                          <TableRow key={att.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                {att.attach_path ? (
                                  <a
                                    href={`/api/dbo/bids/response/attachments/${att.id}/download`}
                                    download
                                    className="font-medium text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {att.attach_name}
                                  </a>
                                ) : (
                                  <span className="text-sm">{att.attach_name}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{att.attach_desc || "-"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(att.created_date)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
                  <DollarSign className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-sm font-semibold">Financial Bid</h4>
              </div>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No line items defined.</p>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Bid Qty</TableHead>
                        <TableHead>UOM</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Disc Unit Price</TableHead>
                        <TableHead className="text-right">Tax Rate</TableHead>
                        <TableHead className="text-right">Tax Amount</TableHead>
                        <TableHead className="w-[60px]">Curr.</TableHead>
                        <TableHead>Promised Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line: any) => (
                        <TableRow key={line.id} data-testid={`row-sheet-line-${line.id}`}>
                          <TableCell className="py-2">
                            <div className="text-sm font-medium">{line.description}</div>
                            {line.product_category && <div className="text-xs text-muted-foreground">{line.product_category}</div>}
                          </TableCell>
                          <TableCell className="text-sm text-right font-mono py-2">{line.quantity}</TableCell>
                          <TableCell className="text-sm py-2">{line.uom || "-"}</TableCell>
                          <TableCell className="text-sm text-right font-mono py-2">
                            {line.bidprice != null ? formatCurrency(line.bidprice, line.currency || currency) : "-"}
                          </TableCell>
                          <TableCell className="text-sm text-right font-mono py-2">
                            {line.discprice != null ? formatCurrency(line.discprice, line.currency || currency) : "-"}
                          </TableCell>
                          <TableCell className="text-sm py-2">{line.rate ? line.rate + "%" : "-"}</TableCell>
                          <TableCell className="text-sm py-2">
                            {line.rate ? (
                              resp?.tax_included === "Yes" ? (
                                formatCurrency(
                                  (Math.round(((Number(line.bidprice) || 0) * (Number(line.quantity) || 0)) / (1 - (Number(line.rate) || 0) / 100)) * (Number(line.rate) || 0)) / 100,
                                  line.currency || currency
                                )
                              ) : (
                                formatCurrency(
                                  ((Number(line.bidprice) || 0) * (Number(line.quantity) || 0) - (Number(line.discprice) || 0) * (Number(line.quantity) || 0)) * ((Number(line.rate) || 0) / 100),
                                  line.currency || currency
                                )
                              )
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-sm py-2">{line.currency || currency}</TableCell>
                          <TableCell className="text-sm py-2">
                            {line.promised_date ? formatDate(line.promised_date) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="mt-3 flex flex-col items-end gap-1 text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-medium">Total Amount:</span>
                  <span className="w-32 text-right font-mono">{formatCurrency(totalAmt, currency)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">Discount:</span>
                  <span className="w-32 text-right font-mono">{formatCurrency(totalDisc, currency)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">Tax Amount:</span>
                  <span className="w-32 text-right font-mono">{formatCurrency(resp?.tax_amount ?? 0, currency)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">Net Total Amount:</span>
                  <span className="font-semibold w-32 text-right font-mono">{formatCurrency(grossTotal, currency)}</span>
                </div>
                {amountInWords && (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="font-medium">In Words:</span>
                    <span className="text-muted-foreground">{amountInWords}</span>
                  </div>
                )}
              </div>

              {resp.amtcomments && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-1">Comments</p>
                  <p className="text-sm bg-muted/50 rounded-md p-3">{resp.amtcomments}</p>
                </div>
              )}

              {finAttachments.length > 0 && (
                <div className="mt-3 pt-2 border-t">
                  <span className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <Paperclip className="h-3.5 w-3.5" />
                    Financial Attachments
                  </span>
                  <div className="overflow-x-auto">
                    <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                      <TableHeader>
                        <TableRow>
                          <TableHead>File Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {finAttachments.map((att: any) => (
                          <TableRow key={att.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                {att.attach_path ? (
                                  <a
                                    href={`/api/dbo/bids/response/attachments/${att.id}/download`}
                                    download
                                    className="font-medium text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {att.attach_name}
                                  </a>
                                ) : (
                                  <span className="text-sm">{att.attach_name}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{att.attach_desc || "-"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(att.created_date)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function SupplierResponsesTable({ responses, bid, onViewResponse }: { responses: any[]; bid: any; onViewResponse?: (id: string) => void }) {
  if (!responses || responses.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="font-medium">No supplier responses found</p>
        <p className="text-sm mt-1">Suppliers have not yet submitted their bid responses.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-md overflow-x-auto" data-testid="table-supplier-responses">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead className="min-w-[150px]">Supplier</TableHead>
            <TableHead>Response#</TableHead>
            <TableHead className="text-right">Bid Total</TableHead>
            {bid.type !== 'RFQ' ?
              <>
                <TableHead className="text-center">Tech Score</TableHead>
                <TableHead className="text-center">Comm Score</TableHead>
                <TableHead className="text-center">Total Score</TableHead>
              </> :
              <></>
            }
            <TableHead className="text-center">Version</TableHead>
            <TableHead>Time Left</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {responses.map((r: any, idx: number) => (
            <TableRow key={r.id} data-testid={`row-response-${r.id}`}>
              <TableCell className="text-muted-foreground text-sm py-2">{idx + 1}</TableCell>
              <TableCell className="py-2">
                <div>
                  <p className="text-sm font-medium">{r.supplier_name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{r.supplier_contact || "-"}</p>
                  {r.supplier_contact_no && (
                    <p className="text-xs text-muted-foreground">{r.supplier_contact_no}</p>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm font-mono py-2" data-testid={`text-response-id-${r.id}`}>
                <span
                  className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  onClick={() => onViewResponse?.(r.id)}
                  data-testid={`link-view-response-${r.id}`}
                >{r.id}</span>
              </TableCell>
              <TableCell className="text-sm text-right font-mono py-2">
                {formatCurrency(r.grosstotal, bid.currency)}
              </TableCell>
              {bid.type !== 'RFQ' ?
                <>
                  <TableCell className="text-sm text-center py-2">{r.total_score ?? "NA"}</TableCell>
                  <TableCell className="text-sm text-center py-2">{r.totalcommercialscore ?? "NA"}</TableCell>
                  <TableCell className="text-sm text-center font-medium py-2">{r.total_tech_and_fin_score ?? 0}</TableCell>
                </> :
                <></>
              }
              <TableCell className="text-sm text-center py-2">{r.version ?? 0}</TableCell>
              <TableCell className="py-2">
                <TimeLeftCell endDate={r.bidenddate} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function TimeLeftCell({ endDate }: { endDate: string | null }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!endDate) return <span className="text-sm text-muted-foreground">-</span>;

  const end = new Date(endDate).getTime();
  const diff = end - now;

  if (diff <= 0) {
    return (
      <Badge variant="secondary" className="text-[10px]">
        Bid Closed
      </Badge>
    );
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  let display = "";
  if (days > 0) display = `${days}d ${hours}h`;
  else if (hours > 0) display = `${hours}h ${minutes}m`;
  else display = `${minutes}m ${seconds}s`;

  return (
    <span className="text-xs font-mono text-muted-foreground" data-testid="text-time-left">
      {display}
    </span>
  );
}

export function CompareBidsPanel({
  bid,
  responses,
  lines,
  requirements,
  scores,
  currentStep,
  embedded = false,
  active = true,
  onClose,
  onAwardComplete,
  externalAwardRequest,
  onExternalAwardHandled,
  onSaveEvaluationComplete,
  awardActionsAllowed = true,
}: {
  bid: any;
  responses: any[];
  lines: any[];
  requirements: any[];
  scores: any[];
  currentStep: string;
  embedded?: boolean;
  active?: boolean;
  onClose?: () => void;
  /** Set false by callers that gate awarding themselves (e.g. the Sourcing Agent awarding card). */
  awardActionsAllowed?: boolean;
  onAwardComplete?: (details?: { supplierName?: string; comments?: string }) => void;
  externalAwardRequest?: {
    nonce: number;
    kind: "start" | "confirm" | "cancel";
    action?: "award" | "save_evaluation";
    supplierId?: string;
    comments?: string;
  } | null;
  onExternalAwardHandled?: () => void;
  onSaveEvaluationComplete?: () => void;
}) {
  const [, setLocation] = useLocation();
  const { isAIEnabled } = useAISettings();
  const [activeTab, setActiveTab] = useState("technical");
  const [recommendedSupplier, setRecommendedSupplier] = useState<string>("");
  const [evalComments, setEvalComments] = useState<Record<string, string>>({});
  const [recommendComments, setRecommendComments] = useState("");
  const [finRecommendedSupplier, setFinRecommendedSupplier] = useState<string>("");
  const [finEvalComments, setFinEvalComments] = useState<Record<string, string>>({});
  const [finRecommendComments, setFinRecommendComments] = useState("");
  const [awardSupplier, setAwardSupplier] = useState<string>("");
  const [awardComments, setAwardComments] = useState("");
  const [awardSelectedLines, setAwardSelectedLines] = useState<Set<number>>(new Set());
  const [awardQty, setAwardQty] = useState<Record<number, string>>({});
  const [aiAwardData, setAiAwardData] = useState<any>(null);
  const [aiAwardLoading, setAiAwardLoading] = useState(false);
  const { toast } = useToast();

  const downloadTemplate = async () => {
    try {
      const response = await fetch(`/api/bid/reviewpdf/${bid.id}/comparisionsheet`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Failed to download template");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bid_${bid.id}_Audit_Report.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
    }
  };

  const getAuthHeaders = (): Record<string, string> => {
    try {
      const parsed = JSON.parse(localStorage.getItem("prokraya-auth") || "{}");
      return {
        "x-user-email": parsed.userId || "",
        "x-user-name": parsed.userName || "",
      };
    } catch {
      return {};
    }
  };

  const suppliers = (responses || []);
  const supplierCount = suppliers.length;
  const handleAwardBid = async (
    supplierOverride?: string,
    commentsOverride?: string,
  ) => {
    const selectedSupplierId = supplierOverride || awardSupplier;
    const comments = (commentsOverride ?? awardComments).trim();
    try {
      if (!awardActionsAllowed) {
        toast({ title: "Access denied", description: AWARD_ACTIONS_DENIED_MESSAGE, variant: "destructive" });
        return;
      }
      if (!selectedSupplierId) {
        toast({ title: "Selection required", description: "Please select a supplier to award the bid.", variant: "destructive" });
        return;
      }
      if (!comments) {
        toast({ title: "Comments required", description: "Please enter award comments.", variant: "destructive" });
        return;
      }
      const selectedResp = suppliers.find((s: any) => String(s.id) === selectedSupplierId);
      const awardPayload: any = {
        awardSupplierId: selectedResp?.supplier_id || parseInt(selectedSupplierId),
        awardComments: comments,
      };
      await apiRequest("POST", `/api/dbo/bids/${bid.id}/award`, awardPayload);
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bid.id}/evaluate`] });
      toast({ title: "Bid awarded", description: "Bid has been awarded successfully." });
      if (onAwardComplete) {
        onAwardComplete({
          supplierName: selectedResp?.supplier_name || undefined,
          comments,
        });
      } else {
        setLocation(`/app/bids/${bid.id}/award`);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to award bid", variant: "destructive" });
    }
  };

  const handleSaveEvaluation = async (): Promise<boolean> => {
    try {
      if (!awardActionsAllowed) {
        toast({ title: "Access denied", description: AWARD_ACTIONS_DENIED_MESSAGE, variant: "destructive" });
        return false;
      }
      const evalPayload = suppliers.map((s: any) => ({
        bidRespId: s.id,
        techEvalComments: evalComments[s.id] ?? s.eval_comments ?? "",
        techRecmd: recommendedSupplier === String(s.id) ? "Y" : "N",
        techRecmdComments:
          recommendedSupplier === String(s.id) ? (recommendComments || "") : "",
        finEvalComments: finEvalComments[s.id] ?? s.fin_eval_comments ?? "",
        finRecmd: finRecommendedSupplier === String(s.id) ? "Y" : "N",
        finRecmdComments:
          finRecommendedSupplier === String(s.id) ? (finRecommendComments || "") : "",
      }));
      await apiRequest("POST", `/api/dbo/bids/${bid.id}/store-evaluation`, evalPayload);
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bid.id}/evaluate`] });
      toast({ title: "Evaluation saved", description: "Bid evaluation has been updated successfully." });
      onSaveEvaluationComplete?.();
      return true;
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save evaluation", variant: "destructive" });
      return false;
    }
  };

  useEffect(() => {
    if (active && suppliers.length > 0) {
      if (bid.status === "Closed") {
        const techRec = suppliers.find((s: any) => s.recommended === "Y");
        setRecommendedSupplier(techRec ? String(techRec.id) : "");
        const finRec = suppliers.find((s: any) => s.fin_recommended === "Y");
        setFinRecommendedSupplier(finRec ? String(finRec.id) : "");
        setEvalComments({});
        setFinEvalComments({});
        setRecommendComments(techRec?.recommend_comments || "");
        setFinRecommendComments(finRec?.fin_recommend_comments || "");
        const commerciallySelected = suppliers.find((s: any) => s.is_commercially_selected === "Y");
        setAwardSupplier(commerciallySelected ? String(commerciallySelected.id) : "");
      } else {
        setRecommendedSupplier("");
        setFinRecommendedSupplier("");
        setEvalComments({});
        setFinEvalComments({});
        setRecommendComments("");
        setFinRecommendComments("");
        setAwardSupplier("");
      }
      setAwardComments("");
      setAwardSelectedLines(new Set());
      setAwardQty({});
    } else if (!active) {
      setRecommendedSupplier("");
      setFinRecommendedSupplier("");
      setEvalComments({});
      setFinEvalComments({});
      setRecommendComments("");
      setFinRecommendComments("");
      setAwardSupplier("");
      setAwardComments("");
      setAwardSelectedLines(new Set());
      setAwardQty({});
    }
  }, [active, bid.status, JSON.stringify(suppliers.map((s: any) => s.id))]);

  useEffect(() => {
    if (!externalAwardRequest) return;
    if (externalAwardRequest.kind === "cancel") {
      onExternalAwardHandled?.();
      return;
    }
    if (externalAwardRequest.action === "save_evaluation") {
      if (externalAwardRequest.kind === "confirm") {
        void handleSaveEvaluation().finally(() => onExternalAwardHandled?.());
        return;
      }
      onExternalAwardHandled?.();
      return;
    }
    setActiveTab("award");
    if (externalAwardRequest.supplierId) {
      setAwardSupplier(externalAwardRequest.supplierId);
    }
    if (externalAwardRequest.comments !== undefined) {
      setAwardComments(externalAwardRequest.comments);
    }
    if (externalAwardRequest.kind === "confirm") {
      void handleAwardBid(
        externalAwardRequest.supplierId,
        externalAwardRequest.comments,
      );
    }
    onExternalAwardHandled?.();
    // React only to a new request nonce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalAwardRequest]);

  const gridCols = `minmax(200px, 1.2fr) repeat(${supplierCount}, minmax(180px, 1fr))`;

  useEffect(() => {
    const type = bid?.type;
    if (type === "RFQ") {
      setActiveTab("financial");
    }
  }, [bid]);

  const aiAwardEnabled = isAIEnabled("AI_AWARD_RECOMMENDATION");

  useEffect(() => {
    // Auto-run only in the Sourcing Agent (embedded). Standalone Compare Bids keeps the manual button.
    if (!embedded || !active || !aiAwardEnabled || !bid?.id || supplierCount === 0) {
      if (!active) {
        setAiAwardData(null);
        setAiAwardLoading(false);
      }
      return;
    }
    let cancelled = false;
    setAiAwardLoading(true);
    setAiAwardData(null);
    (async () => {
      try {
        const resp = await apiRequest("GET", `/api/dbo/bids/${bid.id}/ai/award-recommendation`);
        if (!resp.ok) throw new Error((await resp.json()).error || "Failed");
        const data = await resp.json();
        if (!cancelled) setAiAwardData(data);
      } catch (err: any) {
        if (!cancelled) {
          toast({ title: "AI Error", description: err.message, variant: "destructive" });
        }
      } finally {
        if (!cancelled) setAiAwardLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [embedded, active, aiAwardEnabled, bid?.id, supplierCount]);

  const panelHeader = (
    <div className={embedded ? "space-y-3" : "px-4 pt-4 pb-0 sticky top-0 z-10 bg-background"}>
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <Scale className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          {embedded ? (
            <h4 className="text-sm font-semibold">Compare Bids</h4>
          ) : (
            <SheetTitle>Compare Bids</SheetTitle>
          )}
          <p className="text-sm text-muted-foreground">
            Side-by-side comparison of {supplierCount} supplier response{supplierCount !== 1 ? "s" : ""} for {bid.bid_number || bid.attribute_4 || `BID-${bid.id}`}
          </p>
        </div>
      </div>
      <div className={embedded ? "" : "pt-3"}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid={embedded ? "tabs-agent-compare-bids" : "tabs-compare"}>
            {bid.type !== "RFQ" && (
              <TabsTrigger value="technical" data-testid={embedded ? "tab-agent-compare-technical" : "tab-compare-technical"}>
                <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
                Technical Response
              </TabsTrigger>
            )}
            <TabsTrigger value="financial" data-testid={embedded ? "tab-agent-compare-financial" : "tab-compare-financial"}>
              <DollarSign className="h-3.5 w-3.5 mr-1.5" />
              Financial Response
            </TabsTrigger>
            {currentStep === "prepareAward" && awardActionsAllowed ? (
              <TabsTrigger value="award" data-testid={embedded ? "tab-agent-compare-award" : "tab-compare-award"}>
                <Trophy className="h-3.5 w-3.5 mr-1.5" />
                Award Bid
              </TabsTrigger>
            ) : null}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );

  const panelBody = (
    <div className={embedded ? "pt-2" : "px-4 pb-4 pt-3"}>
          {supplierCount === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No supplier responses to compare.</p>
              <p className="text-xs mt-1">Suppliers have not yet submitted their bid responses.</p>
            </div>
          )}

          {supplierCount > 0 && activeTab === "technical" && (() => {
            const techTabCategories = ["technical", "business", "commercial"];
            const techRequirements = (requirements || []).filter((r: any) => techTabCategories.includes(r.category?.toLowerCase()));
            const uniqueTechQuestions = Array.from(new Map(techRequirements.map((r: any) => [r.bid_req_id, r])).values());
            const techCategories = Array.from(new Set(uniqueTechQuestions.map((q: any) => q.category || "General")));
            const getTechResponse = (suppId: number, reqId: number) => techRequirements.find((r: any) => r.bid_resp_id === suppId && r.bid_req_id === reqId);
            const getTechScore = (suppId: number, respReqId: number) => (scores || []).find((s: any) => s.bid_resp_req_id === respReqId);
            return (
              <div className="space-y-4">
                <div className="border rounded-md overflow-x-auto">
                  <div className="min-w-[600px]">
                    <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: gridCols }}>
                      <div className="px-3 py-1.5 text-sm font-medium text-muted-foreground">Supplier Name</div>
                      {suppliers.map((s: any) => (
                        <div key={s.id} className="px-3 py-1.5 border-l" data-testid={`compare-supplier-${s.id}`}>
                          <p className="text-sm font-semibold text-primary">{s.supplier_name}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid" style={{ gridTemplateColumns: gridCols }}>
                      <div className="px-3 py-1.5 text-sm text-muted-foreground">Supplier Responses</div>
                      {suppliers.map((s: any) => (
                        <div key={s.id} className="px-3 py-1.5 border-l text-sm font-mono text-primary">{s.id}</div>
                      ))}
                    </div>

                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
                      <ClipboardCheck className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <h4 className="text-sm font-semibold">Technical Scoring</h4>
                  </div>
                  <div className="border rounded-md overflow-x-auto">
                    <div className="min-w-[600px]">
                      <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm font-medium text-muted-foreground">Criteria</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l text-sm font-medium text-center">{s.supplier_name}</div>
                        ))}
                      </div>
                      <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm font-semibold">Technical Evaluation Score</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l text-sm text-center font-semibold text-primary">
                            {s.total_score ?? "NA"}
                          </div>
                        ))}
                      </div>
                      <div className="grid border-b bg-muted/20" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm font-medium text-muted-foreground">Detailed Score Breakdown</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l text-xs text-muted-foreground text-center">Score / Remarks</div>
                        ))}
                      </div>
                      {uniqueTechQuestions.length > 0 ? uniqueTechQuestions.map((q: any) => (
                        <div key={q.bid_req_id} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: gridCols }}>
                          <div className="px-3 py-1.5">
                            <p className="text-sm">{q.question}</p>
                            {q.weight != null && <p className="text-xs text-muted-foreground">Weightage — {q.weight}</p>}
                          </div>
                          {suppliers.map((s: any) => {
                            const resp = getTechResponse(s.id, q.bid_req_id);
                            const score = resp ? getTechScore(s.id, resp.id) : undefined;
                            return (
                              <div key={s.id} className="px-3 py-1.5 border-l">
                                <table className="w-full border text-sm rounded-sm overflow-hidden">
                                  <thead>
                                    <tr className="bg-primary text-primary-foreground">
                                      <th className="px-2 py-0.5 text-xs font-medium text-left border-r border-primary-foreground/20">Score</th>
                                      <th className="px-2 py-0.5 text-xs font-medium text-left">Supplier Remarks</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr>
                                      <td className="px-2 py-1 text-sm border-r">{score?.score ?? resp?.score ?? ""}</td>
                                      <td className="px-2 py-1 text-sm">{resp?.remarks || resp?.response || ""}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            );
                          })}
                        </div>
                      )) : (
                        <div className="grid" style={{ gridTemplateColumns: gridCols }}>
                          <div className="px-3 py-3 text-sm text-muted-foreground" style={{ gridColumn: `span ${supplierCount + 1}` }}>
                            No technical requirements defined for this bid.
                          </div>
                        </div>
                      )}
                      <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm">Evaluation Comments</div>
                       {suppliers.map((s: any) => (
                          <div
                            key={s.id}
                            className="px-3 py-1.5 border-l text-sm text-left text-primary"
                          >
                            {s.technical_comments ? (
                              s.technical_comments.split("~").map((comment: string, index: number) => (
                                <div key={index}>{comment}</div>
                              ))
                            ) : (
                              "NA"
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
                      <Shield className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <h4 className="text-sm font-semibold">Technical Recommendations</h4>
                  </div>
                  <div className="border rounded-md overflow-x-auto">
                    <div className="min-w-[600px]">
                      <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm font-medium text-muted-foreground">Field</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l text-sm font-medium text-center">{s.supplier_name}</div>
                        ))}
                      </div>
                      <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm">Evaluator Comments</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l">
                            <textarea
                              className="w-full text-sm border rounded-md p-1.5 bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                              rows={2}
                              placeholder="Enter comments..."
                              value={evalComments[s.id] ?? s.eval_comments ?? ""}
                              onChange={(e) => setEvalComments(prev => ({ ...prev, [s.id]: e.target.value }))}
                              data-testid={`input-eval-comments-${s.id}`}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm">Recommended Supplier</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l">
                            <button
                              type="button"
                              onClick={() => setRecommendedSupplier(String(s.id))}
                              className={`flex items-center gap-2 w-full rounded-md border p-2 text-sm transition-colors cursor-pointer hover-elevate ${recommendedSupplier === String(s.id)
                                ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                                : "border-border"
                                }`}
                              data-testid={`radio-recommend-${s.id}`}
                            >
                              {recommendedSupplier === String(s.id) ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <span className="truncate">{s.supplier_name}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="grid" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm">Recommendation Comments</div>
                        <div className="px-3 py-1.5 border-l" style={{ gridColumn: `span ${supplierCount}` }}>
                          <textarea
                            className="w-full text-sm border rounded-md p-1.5 bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                            rows={2}
                            placeholder="Enter overall recommendation comments..."
                            value={recommendComments}
                            onChange={(e) => setRecommendComments(e.target.value)}
                            data-testid="input-recommend-comments"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {supplierCount > 0 && activeTab === "financial" && (() => {
            const bidLineIds = Array.from(new Set((lines || []).map((l: any) => l.bid_line_id)));
            const commRequirements = (requirements || []).filter((r: any) => r.category?.toLowerCase() === "finance");
            const uniqueCommQuestions = Array.from(new Map(commRequirements.map((r: any) => [r.bid_req_id, r])).values());
            const getCommResponse = (suppId: number, reqId: number) => commRequirements.find((r: any) => r.bid_resp_id === suppId && r.bid_req_id === reqId);
            const getCommScore = (suppId: number, respReqId: number) => (scores || []).find((s: any) => s.bid_resp_req_id === respReqId);
            return (
              <div className="space-y-4">
                <div className="border rounded-md overflow-x-auto">
                  <div className="min-w-[600px]">
                    <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: gridCols }}>
                      <div className="px-3 py-1.5 text-sm font-medium text-muted-foreground">Supplier Name</div>
                      {suppliers.map((s: any) => (
                        <div key={s.id} className="px-3 py-1.5 border-l" data-testid={`fin-supplier-${s.id}`}>
                          <p className="text-sm font-semibold text-primary">{s.supplier_name}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid" style={{ gridTemplateColumns: gridCols }}>
                      <div className="px-3 py-1.5 text-sm text-muted-foreground">Supplier Responses</div>
                      {suppliers.map((s: any) => (
                        <div key={s.id} className="px-3 py-1.5 border-l text-sm font-mono text-primary">{s.id}</div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
                      <DollarSign className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <h4 className="text-sm font-semibold">Financial Data</h4>
                  </div>
                  <div className="border rounded-md overflow-x-auto">
                    <div className="min-w-[600px]">
                      {bidLineIds.map((lineId: any, idx: number) => {
                        const sampleLine = (lines || []).find((l: any) => l.bid_line_id === lineId);
                        return (
                          <div key={lineId} className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                            <div className="px-3 py-1.5">
                              <span className="text-sm">
                                <span className="text-muted-foreground mr-2">{idx + 1}</span>
                                <span className="font-medium">{sampleLine?.orig_description || sampleLine?.description || "-"}</span>
                                <span className="text-muted-foreground ml-2">Qty: {sampleLine?.orig_quantity || sampleLine?.quantity || "-"}</span>
                              </span>
                            </div>
                            {suppliers.map((s: any) => {
                              const sLine = (lines || []).find((l: any) => l.bid_resp_id === s.id && l.bid_line_id === lineId);
                              return (
                                <div key={s.id} className="px-3 py-1.5 border-l text-sm font-mono">
                                  {sLine ? formatCurrency(sLine.bidprice, bid.currency) : "-"}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                      <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm font-medium">Bid Total</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l text-sm font-mono font-medium">
                            {formatCurrency(s.bidtotal, bid.currency)}
                          </div>
                        ))}
                      </div>
                      <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm">Total Discount</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l text-sm font-mono">
                            {formatCurrency(s.biddisc || 0, bid.currency)}
                          </div>
                        ))}
                      </div>
                      <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm">Tax Amount</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l text-sm font-mono">
                            {formatCurrency(s.tax_amount || 0, bid.currency)}
                          </div>
                        ))}
                      </div>
                      <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm">Net Total Amount</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l text-sm font-mono">
                            {formatCurrency(s.grosstotal, bid.currency)}
                          </div>
                        ))}
                      </div>
                      <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm font-medium text-primary">Final Quote Amount</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l text-sm font-mono font-medium text-primary">
                            {formatCurrency(s.grosstotal, bid.currency)}
                          </div>
                        ))}
                      </div>
                      <div className="grid" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm">Supplier Comments</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l text-sm">
                            {s.supplier_comments || s.eval_comments || "NA"}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
                      <ClipboardCheck className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <h4 className="text-sm font-semibold">Financial Scoring</h4>
                  </div>
                  <div className="border rounded-md overflow-x-auto">
                    <div className="min-w-[600px]">
                      <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm">Financial Evaluation Score</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l text-sm font-medium text-primary">
                            {s.totalcommercialscore?? "NA"}
                          </div>
                        ))}
                      </div>
                      <div className="grid border-b bg-muted/20" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm font-medium text-muted-foreground">Detailed Score Breakdown</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l text-xs text-muted-foreground text-center">Score / Remarks</div>
                        ))}
                      </div>
                      {uniqueCommQuestions.map((q: any) => (
                        <div key={q.bid_req_id} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: gridCols }}>
                          <div className="px-3 py-1.5">
                            <p className="text-sm">{q.question}</p>
                            {q.weight != null && <p className="text-xs text-muted-foreground">Weightage — {q.weight}</p>}
                          </div>
                          {suppliers.map((s: any) => {
                            const resp = getCommResponse(s.id, q.bid_req_id);
                            const score = resp ? getCommScore(s.id, resp.id) : undefined;
                            return (
                              <div key={s.id} className="px-3 py-1.5 border-l">
                                <table className="w-full border text-sm rounded-sm overflow-hidden">
                                  <thead>
                                    <tr className="bg-primary text-primary-foreground">
                                      <th className="px-2 py-0.5 text-xs font-medium text-left border-r border-primary-foreground/20">Score</th>
                                      <th className="px-2 py-0.5 text-xs font-medium text-left">SupplierRemarks</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr>
                                      <td className="px-2 py-1 text-sm border-r">{score?.score ?? resp?.score ?? ""}</td>
                                      <td className="px-2 py-1 text-sm">{resp?.response || ""}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm">Evaluation Comments</div>
                       {suppliers.map((s: any) => (
                          <div
                            key={s.id}
                            className="px-3 py-1.5 border-l text-sm text-left text-primary"
                          >
                            {s.finance_comments ? (
                              s.finance_comments.split("~").map((comment: string, index: number) => (
                                <div key={index}>{comment}</div>
                              ))
                            ) : (
                              "NA"
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
                      <Shield className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <h4 className="text-sm font-semibold">Financial Recommendations</h4>
                  </div>
                  <div className="border rounded-md overflow-x-auto">
                    <div className="min-w-[600px]">
                      <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm font-medium text-muted-foreground">Field</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l text-sm font-medium text-center">{s.supplier_name}</div>
                        ))}
                      </div>
                      <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm">Evaluator Comments</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l">
                            <textarea
                              className="w-full text-sm border rounded-md p-1.5 bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                              rows={2}
                              placeholder="Enter comments..."
                              value={finEvalComments[s.id] ?? s.fin_eval_comments ?? ""}
                              onChange={(e) => setFinEvalComments(prev => ({ ...prev, [s.id]: e.target.value }))}
                              data-testid={`input-fin-eval-comments-${s.id}`}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm">Recommended Supplier</div>
                        {suppliers.map((s: any) => (
                          <div key={s.id} className="px-3 py-1.5 border-l">
                            <button
                              type="button"
                              onClick={() => setFinRecommendedSupplier(String(s.id))}
                              className={`flex items-center gap-2 w-full rounded-md border p-1.5 text-sm transition-colors cursor-pointer hover-elevate ${finRecommendedSupplier === String(s.id)
                                ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                                : "border-border"
                                }`}
                              data-testid={`radio-fin-recommend-${s.id}`}
                            >
                              {finRecommendedSupplier === String(s.id) ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <span className="truncate">{s.supplier_name}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="grid" style={{ gridTemplateColumns: gridCols }}>
                        <div className="px-3 py-1.5 text-sm">Recommendation Comments</div>
                        <div className="px-3 py-1.5 border-l" style={{ gridColumn: `span ${supplierCount}` }}>
                          <textarea
                            className="w-full text-sm border rounded-md p-1.5 bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                            rows={2}
                            placeholder="Enter overall recommendation comments..."
                            value={finRecommendComments}
                            onChange={(e) => setFinRecommendComments(e.target.value)}
                            data-testid="input-fin-recommend-comments"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {supplierCount > 0 && activeTab === "award" && (() => {
            const techRecommended = suppliers.find((s: any) => s.recommended === "Y");
            const finRecommended = suppliers.find((s: any) => s.fin_recommended === "Y");
            return (
              <div className="space-y-4">
                <div className="border rounded-md overflow-x-auto">
                  <div className="min-w-[600px]">
                    <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: gridCols }}>
                      <div className="px-3 py-1.5 text-sm font-medium text-muted-foreground">Supplier Name</div>
                      {suppliers.map((s: any) => (
                        <div key={s.id} className="px-3 py-1.5 border-l">
                          <p className="text-sm font-semibold text-primary">{s.supplier_name}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid" style={{ gridTemplateColumns: gridCols }}>
                      <div className="px-3 py-1.5 text-sm text-muted-foreground">Supplier Responses</div>
                      {suppliers.map((s: any) => (
                        <div key={s.id} className="px-3 py-1.5 border-l text-sm font-mono text-primary">{s.id}</div>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  Based on Technical and Finance responses evaluations, comments and recommendations select appropriate supplier to award bid.
                  Please provide appropriate selection comments for review and approval process.
                </p>

                {aiAwardEnabled && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 px-3 py-2.5 flex items-center justify-between border-b">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-900/40">
                          <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold">AI Award Recommendation</h4>
                          <p className="text-[11px] text-muted-foreground">AI analyzes scores, pricing, and evaluations to recommend optimal award</p>
                        </div>
                      </div>
                      {!embedded && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 gap-1"
                          disabled={aiAwardLoading}
                          onClick={async () => {
                            setAiAwardLoading(true);
                            setAiAwardData(null);
                            try {
                              const resp = await apiRequest("GET", `/api/dbo/bids/${bid.id}/ai/award-recommendation`);
                              if (!resp.ok) throw new Error((await resp.json()).error || "Failed");
                              setAiAwardData(await resp.json());
                            } catch (err: any) {
                              toast({ title: "AI Error", description: err.message, variant: "destructive" });
                            } finally {
                              setAiAwardLoading(false);
                            }
                          }}
                          data-testid="button-ai-award-recommend"
                        >
                          {aiAwardLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                          {aiAwardLoading ? "Analyzing..." : aiAwardData ? "Re-analyze" : "Get AI Recommendation"}
                        </Button>
                      )}
                    </div>

                    <div className="p-3">
                      {aiAwardLoading && (
                        <div className="text-center py-6" data-testid="ai-award-loading">
                          <Loader2 className="h-7 w-7 mx-auto animate-spin text-violet-500 mb-2" />
                          <p className="text-sm text-muted-foreground">Analyzing supplier scores, pricing, and evaluations...</p>
                        </div>
                      )}
                      {!aiAwardData && !aiAwardLoading && (
                        <div className="text-center py-4 text-muted-foreground">
                          <Bot className="h-6 w-6 mx-auto mb-1.5 opacity-40" />
                          <p className="text-xs">
                            {embedded
                              ? "Unable to generate an award recommendation right now."
                              : 'Click "Get AI Recommendation" to analyze all supplier responses and get an optimal award suggestion.'}
                          </p>
                        </div>
                      )}
                      {aiAwardData && !aiAwardLoading && (
                        <div className="space-y-3">
                          <div className="bg-muted/30 rounded-md p-2.5 border">
                            <p className="text-sm font-medium">{aiAwardData.summary}</p>
                            {aiAwardData.strategyReason && (
                              <p className="text-xs text-muted-foreground mt-1">{aiAwardData.strategyReason}</p>
                            )}
                            {aiAwardData.estimatedSavings && (
                              <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400 mt-2">
                                <TrendingUp className="h-3 w-3 mr-1" /> Savings: {aiAwardData.estimatedSavings}
                              </Badge>
                            )}
                          </div>

                          {aiAwardData.strategyAnalysis && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Strategy Comparison</p>
                              <div className="grid grid-cols-1 gap-2">
                                {([
                                  { key: 'single' as const, label: 'Single Vendor', icon: '1', recBorder: 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-700', recCircle: 'bg-emerald-600 text-white', recBadge: 'bg-emerald-600 hover:bg-emerald-700' },
                                  { key: 'split_by_item' as const, label: 'Split by Item', icon: '2', recBorder: 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700', recCircle: 'bg-amber-600 text-white', recBadge: 'bg-amber-600 hover:bg-amber-700' },
                                  { key: 'split_by_quantity' as const, label: 'Split by Quantity', icon: '3', recBorder: 'border-violet-400 bg-violet-50/50 dark:bg-violet-950/20 dark:border-violet-700', recCircle: 'bg-violet-600 text-white', recBadge: 'bg-violet-600 hover:bg-violet-700' },
                                ]).map(({ key, label, icon, recBorder, recCircle, recBadge }) => {
                                  const detail = aiAwardData.strategyAnalysis?.[key];
                                  if (!detail || !detail.explanation || detail.explanation === 'Not analyzed') return null;
                                  const isRecommended = aiAwardData.recommendedStrategy === key || aiAwardData.strategy === key;
                                  return (
                                    <div key={key} className={`border rounded-lg p-2.5 text-xs ${isRecommended ? recBorder : 'bg-muted/20'}`} data-testid={`strategy-${key}`}>
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${isRecommended ? recCircle : 'bg-muted text-muted-foreground'}`}>{icon}</span>
                                          <span className="font-semibold">{label}</span>
                                          {isRecommended && <Badge className={`text-[9px] h-4 ${recBadge}`}>Recommended</Badge>}
                                        </div>
                                        {detail.totalCost > 0 && (
                                          <span className="font-mono font-bold">{Number(detail.totalCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        )}
                                      </div>
                                      <p className="text-muted-foreground leading-relaxed mb-1">{detail.explanation}</p>
                                      <div className="flex flex-col gap-0.5 mt-1">
                                        {detail.pros && <span className="text-emerald-600 dark:text-emerald-400">+ {detail.pros}</span>}
                                        {detail.cons && <span className="text-red-600 dark:text-red-400">- {detail.cons}</span>}
                                      </div>
                                      {detail.savingsVsSingle && <p className="text-blue-600 dark:text-blue-400 mt-0.5">Savings vs single: {detail.savingsVsSingle}</p>}
                                      {detail.savingsVsItemSplit && <p className="text-blue-600 dark:text-blue-400">Savings vs item split: {detail.savingsVsItemSplit}</p>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="space-y-2.5">
                            <p className="text-xs font-semibold text-muted-foreground">Supplier Ranking & Item Allocation (based on recommended strategy)</p>
                            {aiAwardData.recommendations?.map((rec: any, idx: number) => {
                              const isTopPick = idx === 0;
                              return (
                                <div key={idx} className={`border rounded-lg overflow-hidden ${isTopPick ? 'border-emerald-300 dark:border-emerald-700' : ''}`} data-testid={`award-rec-vendor-${idx}`}>
                                  <div className={`px-3 py-2 flex items-center justify-between ${isTopPick ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-muted/20'}`}>
                                    <div className="flex items-center gap-2">
                                      <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${isTopPick ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                                        {rec.rank || idx + 1}
                                      </div>
                                      <span className="text-sm font-semibold">{rec.vendorName}</span>
                                      {isTopPick && <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-700">Recommended</Badge>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">{aiAwardData.scoringBasis === 'price' ? 'Price Score:' : 'Score:'}</span>
                                      <span className={`text-sm font-bold ${rec.overallScore >= 75 ? 'text-emerald-600' : rec.overallScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                        {rec.overallScore}/100
                                      </span>
                                    </div>
                                  </div>
                                  <div className="p-2.5 space-y-2">
                                    {rec.awardedItems && rec.awardedItems.length > 0 && (
                                      <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">
                                          {aiAwardData.strategy === 'split_by_quantity' ? 'Awarded Items & Quantities' : 'Recommended Items to Award'}
                                        </p>
                                        <table className="w-full text-xs border rounded-sm overflow-hidden">
                                          <thead>
                                            <tr className="bg-muted/50">
                                              <th className="px-2 py-1 text-left font-medium">Item</th>
                                              <th className="px-2 py-1 text-right font-medium">Qty</th>
                                              <th className="px-2 py-1 text-right font-medium">Unit Price</th>
                                              <th className="px-2 py-1 text-right font-medium">Total</th>
                                              <th className="px-2 py-1 text-left font-medium">Reason</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {rec.awardedItems.map((item: any, iIdx: number) => (
                                              <tr key={iIdx} className="border-t">
                                                <td className="px-2 py-1">{item.description}</td>
                                                <td className="px-2 py-1 text-right font-mono">{item.quantity}</td>
                                                <td className="px-2 py-1 text-right font-mono">{Number(item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td className="px-2 py-1 text-right font-mono font-medium">{Number(item.totalValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td className="px-2 py-1 text-muted-foreground">{item.reason}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr className="border-t bg-muted/30">
                                              <td colSpan={3} className="px-2 py-1 font-medium text-right">Total Award Value:</td>
                                              <td className="px-2 py-1 text-right font-mono font-bold text-primary">{Number(rec.totalAwardValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                              <td></td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    )}
                                    <div className="flex gap-3">
                                      {rec.strengths && rec.strengths.length > 0 && (
                                        <div className="flex-1">
                                          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-0.5 flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> Strengths</p>
                                          <ul className="text-xs space-y-0.5">
                                            {rec.strengths.map((s: string, sIdx: number) => (
                                              <li key={sIdx} className="flex items-start gap-1"><span className="text-emerald-500 mt-0.5">+</span> {s}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {rec.risks && rec.risks.length > 0 && (
                                        <div className="flex-1">
                                          <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-0.5 flex items-center gap-1"><ThumbsDown className="h-3 w-3" /> Risks</p>
                                          <ul className="text-xs space-y-0.5">
                                            {rec.risks.map((r: string, rIdx: number) => (
                                              <li key={rIdx} className="flex items-start gap-1"><span className="text-red-500 mt-0.5">-</span> {r}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                    {(isTopPick || aiAwardData.strategy !== 'single') && rec.awardedItems?.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7 gap-1 mt-1"
                                        onClick={() => {
                                          setAwardSupplier(String(rec.responseId));
                                          const strategyLabel = aiAwardData.strategy === 'single' ? '' : aiAwardData.strategy === 'split_by_quantity' ? 'Quantity split — ' : 'Split award — ';
                                          const itemsText = rec.awardedItems.map((i: any) => `${i.description} (Qty: ${i.quantity})`).join(', ');
                                          const scoreLabel = aiAwardData.scoringBasis === 'price' ? 'Price Score' : 'Score';
                                          const recText = `[AI Recommendation] ${strategyLabel}Award to ${rec.vendorName} (${scoreLabel}: ${rec.overallScore}/100). Items: ${itemsText}. ${rec.strengths?.[0] ? `Strength: ${rec.strengths[0]}.` : ''} ${aiAwardData.estimatedSavings ? `Est. savings: ${aiAwardData.estimatedSavings}` : ''}`.trim();
                                          setAwardComments(recText);
                                          toast({ title: "Supplier selected", description: `${rec.vendorName} selected for award. Review comments and click "Award Bid" to confirm.` });
                                        }}
                                        data-testid={`button-apply-ai-award-${idx}`}
                                      >
                                        <Award className="h-3 w-3" /> Select This Supplier
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="border rounded-md overflow-x-auto">
                  <div className="min-w-[600px]">
                    <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                      <div className="px-3 py-1.5 text-sm font-medium">Total Evaluation Score</div>
                      {suppliers.map((s: any) => (
                        <div key={s.id} className="px-3 py-1.5 border-l text-sm">
                          {s.total_tech_and_fin_score ?? "NA"}
                        </div>
                      ))}
                    </div>
                    <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                      <div className="px-3 py-1.5 text-sm font-medium">Technical Recommendation Supplier</div>
                      <div className="px-3 py-1.5 border-l text-sm" style={{ gridColumn: `span ${supplierCount}` }}>
                        {techRecommended?.supplier_name || "NA"}
                      </div>
                    </div>
                    <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                      <div className="px-3 py-1.5 text-sm font-medium">Financial Recommendation Supplier</div>
                      <div className="px-3 py-1.5 border-l text-sm" style={{ gridColumn: `span ${supplierCount}` }}>
                        {finRecommended?.supplier_name || "NA"}
                      </div>
                    </div>
                    <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                      <div className="px-3 py-1.5 text-sm font-medium">Select Supplier to Award</div>
                      {suppliers.map((s: any) => (
                        <div key={s.id} className="px-3 py-1.5 border-l">
                          <button
                            type="button"
                            onClick={() => setAwardSupplier(String(s.id))}
                            className={`flex items-center gap-2 w-full rounded-md border p-1.5 text-sm transition-colors cursor-pointer hover-elevate ${awardSupplier === String(s.id)
                              ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                              : "border-border"
                              }`}
                            data-testid={`radio-award-supplier-${s.id}`}
                          >
                            {awardSupplier === String(s.id) ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="truncate">{s.supplier_name}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Line-level award selection commented out - awarding all lines by default */}

                <div className="border rounded-md overflow-x-auto">
                  <div className="min-w-[600px]">
                    <div className="grid" style={{ gridTemplateColumns: gridCols }}>
                      <div className="px-3 py-1.5 text-sm font-medium">
                        Award Comments <span className="text-destructive">*</span>
                      </div>
                      <div className="px-3 py-1.5 border-l" style={{ gridColumn: `span ${supplierCount}` }}>
                        <textarea
                          className="w-full text-sm border rounded-md p-1.5 bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                          rows={3}
                          placeholder="Enter award comments..."
                          value={awardComments}
                          onChange={(e) => setAwardComments(e.target.value)}
                          data-testid="input-award-comments"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
    </div>
  );

  const panelFooter = (
    <div className={`border-t px-4 py-2 flex items-center justify-end gap-2 shrink-0 ${embedded ? "px-0" : ""}`}>
      {onClose && !embedded && (
        <Button variant="outline" onClick={onClose} data-testid="button-compare-close">
          Close
        </Button>
      )}
      {activeTab !== "award" && (
  <>
    {awardActionsAllowed && (
    <Button
      onClick={() => void handleSaveEvaluation()}
      data-testid="button-save-evaluation"
    >
      Save Evaluation
    </Button>
    )}

    <Button onClick={downloadTemplate}>
      Download Comparison Sheet
    </Button>
  </>
  )}
      {activeTab === "award" && awardActionsAllowed && (
        <Button
          onClick={() => void handleAwardBid()}
          data-testid="button-award-bid"
        >
          Award Bid
        </Button>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3 overflow-x-auto" data-testid="embedded-compare-bids">
        {panelHeader}
        {panelBody}
        {panelFooter}
      </div>
    );
  }

  return (
    <>
      {panelHeader}
      {panelBody}
      {panelFooter}
    </>
  );
}

function CompareBidsSheet({
  open,
  onOpenChange,
  bid,
  responses,
  lines,
  requirements,
  scores,
  currentStep,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bid: any;
  responses: any[];
  lines: any[];
  requirements: any[];
  scores: any[];
  currentStep: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-[88vw] w-[88vw] p-0 overflow-y-auto [&>button.absolute]:z-20"
        data-testid="sheet-compare-bids"
      >
        <CompareBidsPanel
          bid={bid}
          responses={responses}
          lines={lines}
          requirements={requirements}
          scores={scores}
          currentStep={currentStep}
          active={open}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function TeamStepBlock({ label, members, icon: Icon }: { label: string; members: any[]; icon: any }) {
  return (
    <div className="border rounded-md p-2.5 min-w-0 flex-1" data-testid={`team-step-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">{label}</p>
      </div>
      {members.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No members</p>
      ) : (
        <div className="space-y-1.5">
          {members.map((m: any) => (
            <Tooltip key={m.id}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-default" data-testid={`team-member-${m.id}`}>
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="text-[9px] bg-muted">
                      {(m.user_name || "U").substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-sm font-medium truncate flex-1 min-w-0">{m.user_name}</p>
                  <Badge
                    variant="secondary"
                    className={`text-[9px] shrink-0 ${m.score_submitted === "Y"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : ""
                      }`}
                  >
                    {m.score_submitted === "Y" ? "Scored" : "Pending"}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="font-medium">{m.user_name}</p>
                {m.login_id && <p className="text-xs">{m.login_id}</p>}
                <p className="text-xs text-muted-foreground">{m.user_department || "-"}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}

const TEAM_TYPES = [
  { value: "Technical Review Team", label: "Technical Review" },
  { value: "Technical Approve Team", label: "Technical Approve" },
  { value: "Commercial Review Team", label: "Commercial Review" },
  { value: "Commercial Approve Team", label: "Commercial Approve" },
  { value: "Committee Board", label: "Committee Board" },
];

function AddMemberSheet({ open, onOpenChange, bidId }: { open: boolean; onOpenChange: (v: boolean) => void; bidId: string }) {
  const { toast } = useToast();
  const [teamType, setTeamType] = useState("");
  const [selectedUser, setSelectedUser] = useState("");

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users/dropdown"],
    enabled: open,
  });

  const addMember = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/dbo/bids/${bidId}/team`, {
        bid_team_type: teamType,
        bid_apprs_list: selectedUser,
      });
    },
    onSuccess: () => {
      toast({ title: "Member added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId, "approvers"] });
      setTeamType("");
      setSelectedUser("");
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to add member", description: err?.message || "Something went wrong", variant: "destructive" });
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Add Team Member</SheetTitle>
          <SheetDescription>Select a team type and user to add to the evaluation team.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label>Team Type</Label>
            <Select value={teamType} onValueChange={setTeamType}>
              <SelectTrigger data-testid="select-team-type">
                <SelectValue placeholder="Select team type" />
              </SelectTrigger>
              <SelectContent>
                {TEAM_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>User</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger data-testid="select-user">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u: any) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email_id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            disabled={!teamType || !selectedUser || addMember.isPending}
            onClick={() => addMember.mutate()}
            data-testid="button-add-member-submit"
          >
            {addMember.isPending ? "Adding..." : "Add Member"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NegotiationSheet({ open, onOpenChange, bid, responses }: { open: boolean; onOpenChange: (v: boolean) => void; bid: any; responses: any[] }) {
  const { toast } = useToast();
  const [selectedSuppliers, setSelectedSuppliers] = useState<number[]>([]);
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [openDate, setOpenDate] = useState(getCurrentLocalDateTime());
  const [closeDate, setCloseDate] = useState(() => addHoursToLocalDateTime(getCurrentLocalDateTime(), 1));
  const [envOpenDate, setEnvOpenDate] = useState(getCurrentLocalDateTime());
  const [comments, setComments] = useState("");

  useEffect(() => {
    if (open) {
      const now = getCurrentLocalDateTime();
      setOpenDate(now);
      setCloseDate(addHoursToLocalDateTime(now, 1));
      setEnvOpenDate(now);
      setSelectedSuppliers([]);
      setComments("");
    }
  }, [open]);

  const handleOpenDateChange = (value: string) => {
    if (!value) {
      setOpenDate(value);
      return;
    }
    const finalValue = clampDateTimeLocal(value);
    if (finalValue !== value) {
      toast({
        title: "Invalid Open Date",
        description: "Open date cannot be in the past.",
        variant: "destructive",
      });
    }
    setOpenDate(finalValue);
    if (closeDate && new Date(closeDate) <= new Date(finalValue)) {
      setCloseDate(addHoursToLocalDateTime(finalValue, 1));
    }
  };

  const handleCloseDateChange = (value: string) => {
    if (!value) {
      setCloseDate(value);
      return;
    }
    if (openDate && new Date(value) <= new Date(openDate)) {
      toast({
        title: "Invalid Close Date",
        description: "Close date must be after the open date.",
        variant: "destructive",
      });
      return;
    }
    setCloseDate(value);
  };

  const allSelected = responses.length > 0 && selectedSuppliers.length === responses.length;

  const toggleSupplier = (id: number) => {
    setSelectedSuppliers((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedSuppliers([]);
    } else {
      setSelectedSuppliers(responses.map((r: any) => r.supplier_id));
    }
  };

  const selectedNames = responses
    .filter((r: any) => selectedSuppliers.includes(r.supplier_id))
    .map((r: any) => r.supplier_name);

  const sendNegotiation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/dbo/bids/${bid.id}/request-negotiation`, {
        supplierIds: selectedSuppliers,
        openDate: new Date(openDate),
        closeDate: new Date(closeDate),
        envOpenDate: new Date(envOpenDate),
        comments,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Negotiation request sent successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bid.id}/evaluate`] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to send negotiation", description: err?.message || "Something went wrong", variant: "destructive" });
    },
  });

  const dateError = validateNegotiationDates(openDate, closeDate);
  const canSend = selectedSuppliers.length > 0 && closeDate && comments.trim() && !dateError;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto" data-testid="sheet-negotiation">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Request for Negotiation Details
          </SheetTitle>
          <SheetDescription>
            <span className="text-destructive text-xs">*Indicates mandatory fields.</span>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pt-2 pb-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Supplier <span className="text-destructive">*</span></Label>
              <Popover open={supplierDropdownOpen} onOpenChange={setSupplierDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                    data-testid="select-negotiation-suppliers"
                  >
                    <span className="truncate text-left text-sm">
                      {selectedNames.length > 0 ? selectedNames.join(", ") : "Select Supplier"}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 rotate-90 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <div className="p-2 space-y-0.5">
                    <label className="flex items-center gap-3 px-2 py-2 rounded-md hover-elevate cursor-pointer">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        data-testid="checkbox-select-all-suppliers"
                      />
                      <span className="text-sm font-medium">Select All Suppliers</span>
                    </label>
                    <Separator />
                    {responses.map((r: any) => (
                      <label key={r.supplier_id} className="flex items-center gap-3 px-2 py-2 rounded-md hover-elevate cursor-pointer">
                        <Checkbox
                          checked={selectedSuppliers.includes(r.supplier_id)}
                          onCheckedChange={() => toggleSupplier(r.supplier_id)}
                          data-testid={`checkbox-supplier-${r.supplier_id}`}
                        />
                        <span className="text-sm">{r.supplier_name}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Open Date <span className="text-destructive">*</span></Label>
                <Input
                  type="datetime-local"
                  value={openDate}
                  min={getCurrentLocalDateTime()}
                  onChange={(e) => handleOpenDateChange(e.target.value)}
                  className="text-sm"
                  data-testid="input-negotiation-open-date"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Close Date <span className="text-destructive">*</span></Label>
                <Input
                  type="datetime-local"
                  value={closeDate}
                  min={openDate}
                  onChange={(e) => handleCloseDateChange(e.target.value)}
                  className="text-sm"
                  data-testid="input-negotiation-close-date"
                />
              </div>
            </div>
            {dateError && (
              <p className="text-xs text-destructive">{dateError}</p>
            )}

            {bid.type === "Tender" && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Envelope Open Date <span className="text-destructive">*</span></Label>
                <Input
                  type="datetime-local"
                  value={envOpenDate}
                  onChange={(e) => setEnvOpenDate(e.target.value)}
                  className="text-sm"
                  data-testid="input-negotiation-env-open-date"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium">Negotiation Comments <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="Please Enter Comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={4}
                className="text-sm"
                data-testid="textarea-negotiation-comments"
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-negotiation-cancel">
              Cancel
            </Button>
            <Button
              disabled={!canSend || sendNegotiation.isPending}
              onClick={() => sendNegotiation.mutate()}
              data-testid="button-negotiation-send"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {sendNegotiation.isPending ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function EvaluationHierarchyCard({ approvers, bid, bidType, openEnvelopeMutation, currentUser }: { approvers: any[]; bid: any; bidType: string; openEnvelopeMutation: any; currentUser: any }) {
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const committeeMembers = approvers.filter((a: any) => a.teamtype?.toLowerCase().includes("committee"));
  const techReview = approvers.filter((a: any) => a.teamtype === "Technical Review Team");
  const techApprove = approvers.filter((a: any) => a.teamtype === "Technical Approve Team");
  const commReview = approvers.filter((a: any) => a.teamtype === "Commercial Review Team");
  const commApprove = approvers.filter((a: any) => a.teamtype === "Commercial Approve Team");

  if (approvers.length === 0) {
    if (bidType === "RFQ") return null;
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Users className="h-7 w-7 mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium">No evaluation team assigned.</p>
          {(bid.status !== "Awarded" && bid.status !== "Award Under Process") && (
            <>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setAddMemberOpen(true)} data-testid="button-add-member-empty">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Member
              </Button>
              <AddMemberSheet open={addMemberOpen} onOpenChange={setAddMemberOpen} bidId={String(bid.id)} />
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-evaluation-hierarchy">
      <CardHeader className="py-2 px-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground font-medium">Evaluation Team</p>
          </div>
          {(bid.status !== "Awarded" && bid.status !== "Award Under Process") && (
            <Button variant="outline" size="sm" onClick={() => setAddMemberOpen(true)} data-testid="button-add-member">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Member
            </Button>
          )}
        </div>
      </CardHeader>
      {bid.status === "Closed" && (
        <AddMemberSheet open={addMemberOpen} onOpenChange={setAddMemberOpen} bidId={String(bid.id)} />
      )}
      <CardContent className="px-4 pb-3 pt-0">
        <div className="flex gap-2 items-stretch min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="border rounded-md p-2.5 flex flex-col items-center justify-center shrink-0 w-[120px] cursor-default" data-testid="team-buyer">
                <Avatar className="h-7 w-7 mb-1">
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                    {(bid.buyer_name || bid.buyer || "B").substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <p className="text-sm font-semibold text-center truncate w-full">{bid.buyer_name || bid.buyer || "-"}</p>
                <p className="text-[10px] text-muted-foreground text-center">Buyer</p>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="font-medium">{bid.buyer_name || bid.buyer || "-"}</p>
              {bid.buyer_login_id && <p className="text-xs">{bid.buyer_login_id}</p>}
              <p className="text-xs text-muted-foreground">{bid.buyer_department || "Buyer / Coordinator"}</p>
            </TooltipContent>
          </Tooltip>

          <div className="flex items-center shrink-0">
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            {bidType === "Tender" && committeeMembers.length > 0 && (
              <div className="border rounded-md p-2.5 relative overflow-hidden min-h-[200px]" data-testid="team-committee-row">
                {bid.status === "Closed" && bid.env_opened !== "Y" && (() => {
                  const myApprover = committeeMembers.find((m: any) => {
                    if (!currentUser) return false;
                    const uIdStr = String(currentUser.id || currentUser.userId || "");
                    const uEmail = String(currentUser.email || currentUser.email_id || currentUser.userName || "").toLowerCase();
                    const mIdStr = String(m.user_id || "");
                    const mLogin = String(m.login_id || "").toLowerCase();
                    return (uIdStr && mIdStr === uIdStr) || (uEmail && mLogin === uEmail);
                  });

                  const hasTask = myApprover && myApprover.logged_id !== "Y";

                  if (hasTask) {
                    return (
                      <div className="absolute inset-0 z-10 bg-background/85 flex items-center justify-center backdrop-blur-[2px]">
                        <div className="relative group cursor-pointer transition-transform hover:scale-105" onClick={() => openEnvelopeMutation.mutate()}>
                          <img
                            src={envelopeSealedImg}
                            alt="Sealed Envelope"
                            className="max-h-[140px] w-auto object-contain opacity-95 group-hover:opacity-100 transition-opacity drop-shadow-xl"
                          />
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="flex items-center gap-1.5 mb-1.5 text-balance">
                  <div className="flex items-center gap-1.5">
                    <Crown className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Committee Board</p>
                  </div>
                  {bid.status === "Closed" && bid.env_opened !== "Y" && (
                    <Badge variant="outline" className="text-[10px] h-4 bg-amber-50 text-amber-600 border-amber-200">
                      {committeeMembers.filter((m: any) => m.logged_id === 'Y').length} / 3 members opened
                    </Badge>
                  )}
                </div>
                <div className="flex gap-3 flex-wrap">
                  {committeeMembers.map((m: any) => (
                    <Tooltip key={m.id}>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5 cursor-default" data-testid={`committee-member-${m.id}`}>
                          <div className="relative">
                            <Avatar className="h-6 w-6 shrink-0">
                              <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                                {(m.user_name || "U").substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {m.logged_id === "Y" && (
                              <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 border border-green-500">
                                <CheckCircle2 className="h-2 w-2 text-green-500" />
                              </div>
                            )}
                          </div>
                          <p className="text-sm font-medium truncate max-w-[100px]">{m.user_name}</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="font-medium">{m.user_name}</p>
                        {m.login_id && <p className="text-xs">{m.login_id}</p>}
                        <p className="text-xs text-muted-foreground">{m.user_department || "-"}</p>
                        <p className="text-[10px] font-bold mt-1">
                          Status: {m.logged_id === "Y" ? "Opened Envelope" : "Pending Opening"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-stretch gap-0 min-w-0">
              <TeamStepBlock label="Tech Review" members={techReview} icon={ClipboardCheck} />
              {bidType !== "RFP" && (
                <>
                  <div className="flex items-center shrink-0 px-1">
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <TeamStepBlock label="Tech Approve" members={techApprove} icon={Check} />
                </>
              )}
              <div className="flex items-center shrink-0 px-1">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <TeamStepBlock label="Comm Review" members={commReview} icon={DollarSign} />
              {bidType !== "RFP" && (
                <>
                  <div className="flex items-center shrink-0 px-1">
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <TeamStepBlock label="Comm Approve" members={commApprove} icon={Check} />
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

}
