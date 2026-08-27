import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog, DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAISettings } from "@/hooks/use-ai-settings";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Brain,
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  ClipboardList,
  CreditCard,
  DollarSign,
  Download,
  File,
  FileText,
  FolderTree,
  Gavel,
  History,
  Lightbulb,
  Loader2,
  Lock,
  Mail, MapPin,
  MessageSquare,
  Package,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Scale, ScrollText,
  Search,
  Shield,
  Sparkles,
  Timer,
  Trash2,
  User,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import BidFormSheet from "./bid-form-sheet";

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
  const isHighValue = parseFloat(bid.attribute_10 || "0") >= 500000;
  const hasTenderSteps = isTender || isHighValue;

  const hasTechReviewTeam = approvers.some((a: any) => a.teamtype === "Technical Review Team");
  const hasTechApproveTeam = approvers.some((a: any) => a.teamtype === "Technical Approve Team");
  const hasCommReviewTeam = approvers.some((a: any) => a.teamtype === "Commercial Review Team");
  const hasCommApproveTeam = approvers.some((a: any) => a.teamtype === "Commercial Approve Team");

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

  if (status === "Closed") {
    const envOpened = bid.env_opened === "Y";
    const techScoreComplete = bid.tech_score_complete === "Y";
    const finScoreComplete = bid.fin_score_complete === "Y";
    const base = hasTenderSteps
      ? ["prepareBid", "publishApprove", "published", "closed"]
      : isRFP
        ? ["prepareBid", "published", "closed"]
        : ["prepareBid", "published", "closed"];

    const techScoreApproved = bid.techscoreapproved === "Y";
    const finScoreApproved = bid.finscoreapproved === "Y";

    if (hasTenderSteps || isRFP) {
      const completed = [...base];
      if (hasTenderSteps && envOpened) completed.push("openBid");

      if (hasTenderSteps) {
        if (techScoreApproved && finScoreApproved) {
          return {
            completedSteps: [
              ...completed,
              "technicalReview",
              "technicalApprove",
              "commercialReview",
              "commercialApprove",
            ],
            activeStep: "prepareAward",
          };
        }
        if (techScoreApproved && finScoreComplete) {
          return {
            completedSteps: [
              ...completed,
              "technicalReview",
              "technicalApprove",
              "commercialReview",
            ],
            activeStep: "commercialApprove",
          };
        }
        if (techScoreApproved) {
          return {
            completedSteps: [
              ...completed,
              "technicalReview",
              "technicalApprove",
            ],
            activeStep: "commercialReview",
          };
        }
        if (techScoreComplete) {
          return {
            completedSteps: [...completed, "technicalReview"],
            activeStep: "technicalApprove",
          };
        }
      } else if (isRFP) {
        if (finScoreComplete) {
          return {
            completedSteps: [...completed, "technicalReview", "commercialReview"],
            activeStep: "prepareAward",
          };
        }
        if (techScoreComplete) {
          return {
            completedSteps: [...completed, "technicalReview"],
            activeStep: "commercialReview",
          };
        }
      }
      if (envOpened || isRFP) {
        return { completedSteps: completed, activeStep: "technicalReview" };
      }
      else if (isTender && !envOpened) {
        return { completedSteps: completed, activeStep: "openBid" };
      }
      return { completedSteps: completed, activeStep: "technicalReview" };
    }

    if (techScoreComplete && finScoreComplete) {
      return { completedSteps: [...base, "technicalReview", "commercialReview"], activeStep: "prepareAward" };
    }
    if (techScoreComplete) {
      return { completedSteps: [...base, "technicalReview"], activeStep: "commercialReview" };
    }
    return { completedSteps: base, activeStep: "technicalReview" };
  }

  if (status === "Award Under Process" || status === "Finalize") {
    const base = hasTenderSteps
      ? ["prepareBid", "publishApprove", "published", "closed", "openBid", "technicalReview", "technicalApprove", "commercialReview", "commercialApprove", "prepareAward"]
      : isRFP
        ? ["prepareBid", "published", "closed", "technicalReview", "commercialReview", "prepareAward"]
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

const stepKeyToLabel: Record<string, string> = {
  prepareBid: "Prepare Bid",
  publishApprove: "Publish Approved",
  published: "Publish",
  closed: "Closed",
  openBid: "Tender Opened",
  technicalReview: "Technical Review",
  technicalApprove: "Technical Approve",
  commercialReview: "Commercial Review",
  commercialApprove: "Commercial Approve",
  prepareAward: "Prepare Award",
  awardApproved: "Award Approval",
  awarded: "Awarded",
};

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
    stepKeys.push(
      "prepareBid",
      "published",
      "closed",
      "technicalReview",
      "commercialReview",
      "prepareAward",
      "awardApproved",
      "awarded",
    );
  } else {
    stepKeys.push("prepareBid", "published", "closed", "technicalReview", "commercialReview", "prepareAward", "awardApproved", "awarded");
  }

  return (
    <Card data-testid="card-bid-stepper">
      <CardContent className="px-4 py-3">
        <p className="text-xs text-muted-foreground mb-2">Indicating current step to track the Flow Status of the Bid.</p>
        <div className="flex items-center flex-wrap gap-y-1">
          {steps.map((step, idx) => {
            const key = stepKeys[idx];
            const isCompleted = !isCancelled && completedSteps.includes(key);
            const isCurrent = !isCancelled && activeStep === key;

            return (
              <div key={idx} className="flex items-center" data-testid={`step-${idx}`}>
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

function CountdownTimer({ endDate }: { endDate: string | null }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!endDate) return;
    const end = new Date(endDate).getTime();
    if (end - Date.now() <= 0) return;
    const interval = setInterval(() => {
      if (new Date(endDate).getTime() - Date.now() <= 0) clearInterval(interval);
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [endDate]);

  if (!endDate) return null;
  const now = Date.now();
  const end = new Date(endDate).getTime();
  const diff = end - now;

  if (diff <= 0) return null;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const urgent = days <= 2;

  return (
    <div className="flex items-center gap-3" data-testid="countdown-timer">
      <Timer className={`h-5 w-5 ${urgent ? "text-red-500" : "text-emerald-500"}`} />
      <div className="flex items-center gap-1 font-mono text-lg font-semibold tracking-wider">
        {days > 0 && (
          <>
            <span className={`inline-flex items-center justify-center rounded px-2 py-0.5 min-w-[2.5rem] ${urgent ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
              {days}
            </span>
            <span className="text-xs text-muted-foreground font-sans font-normal mx-0.5">d</span>
          </>
        )}
        <span className={`inline-flex items-center justify-center rounded px-2 py-0.5 min-w-[2.5rem] ${urgent ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
          {pad(hours)}
        </span>
        <span className="text-muted-foreground">:</span>
        <span className={`inline-flex items-center justify-center rounded px-2 py-0.5 min-w-[2.5rem] ${urgent ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
          {pad(minutes)}
        </span>
        <span className="text-muted-foreground">:</span>
        <span className={`inline-flex items-center justify-center rounded px-2 py-0.5 min-w-[2.5rem] ${urgent ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
          {pad(seconds)}
        </span>
      </div>
      <span className="text-xs text-muted-foreground ml-1">remaining</span>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count }: { icon: any; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {count !== undefined && (
        <Badge variant="secondary" className="ml-1">{count}</Badge>
      )}
    </div>
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

interface BroadcastMessage {
  id: number;
  bid_broad_cast_message: string;
  created_by: string;
  creation_time: string;
}

interface Organization {
  id: number;
  organization_name: string;
}

export default function BidView() {
  const [, params] = useRoute("/app/bids/:id/view");
  const bidId = params?.id;
  const [auditPage, setAuditPage] = useState(1);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenStartDate, setReopenStartDate] = useState("");
  const [reopenEndDate, setReopenEndDate] = useState("");
  const [reopenenvopenDate, setReopenenvopenDate] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [broadCaseMessageOpen, setBroadcastMessageOpen] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Supplier invitation states
  const [showAddSupplierDialog, setShowAddSupplierDialog] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [debouncedSupplierSearch, setDebouncedSupplierSearch] = useState("");
  const [supplierPage, setSupplierPage] = useState(1);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<number[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("");
  const [vendorCategoryOpen, setVendorCategoryOpen] = useState(false);
  const [showAIVendorPanel, setShowAIVendorPanel] = useState(false);
  const [aiVendorRecs, setAiVendorRecs] = useState<any[]>([]);
  const [aiVendorLoading, setAiVendorLoading] = useState(false);

  const [showProxySheet, setShowProxySheet] = useState(false);
  const [proxySupplier, setProxySupplier] = useState<any>(null);
  const [proxyLines, setProxyLines] = useState<Record<number, { bidprice: string; discprice: string; promisedDate: string; taxCode: string | null; taxRate: number | null; uom: string | null; total_amount?: string; }>>({});
  const [proxyRequirements, setProxyRequirements] = useState<Record<number, { answer: string; remarks: string }>>({});
  const [proxyComments, setProxyComments] = useState("");
  const [proxyRefNumber, setProxyRefNumber] = useState("");
  const [proxyActiveTab, setProxyActiveTab] = useState("financial");
  const [proxyTaxIncluded, setProxyTaxIncluded] = useState<"Yes" | "No">("No");
  const [proxyAttachList, setProxyAttachList] = useState<{ file: File; desc: string }[]>([]);
  const [proxyAttachDesc, setProxyAttachDesc] = useState("");
  const proxyFileRef = useRef<HTMLInputElement>(null);

  const { isAIEnabled } = useAISettings();

  const reopenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/dbo/bids/${bidId}/reopen`, {
        startDate: new Date(reopenStartDate).toISOString(),
        endDate: new Date(reopenEndDate).toISOString(),
        envOpenDate: reopenenvopenDate ? new Date(reopenenvopenDate).toISOString() : null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bid reopened successfully" });
      setReopenDialogOpen(false);
      setReopenStartDate("");
      setReopenEndDate("");
      setReopenenvopenDate("");
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to reopen bid", description: error.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/dbo/bids/${bidId}/cancel`, {
        cancelReason: cancelReason.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bid cancelled successfully" });
      setCancelDialogOpen(false);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to cancel bid", description: error.message, variant: "destructive" });
    },
  });

  const closeBidMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/dbo/bids/closeBid/${bidId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids"] });
      toast({
        title: "Bid Closed",
        description: "The bid has been closed successfully.",
      });
      setLocation("/app/bids");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to close bid.",
        variant: "destructive",
      });
    },
  });

  const fmpVisibilityMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PUT", `/api/dbo/bids/${bidId}/fmp-visibility`, { enabled });
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId] });
      const enabled = !!data?.showFmpToSupplier;
      const pending = Number(data?.pendingBenchmarks) || 0;
      toast({
        title: enabled ? "FMPI shared with suppliers" : "FMPI hidden from suppliers",
        description: enabled
          ? pending > 0
            ? `Suppliers can now see the fair market price on each line. Benchmarking ${pending} line item${pending === 1 ? "" : "s"} in the background.`
            : "Suppliers can now see the fair market price on each line."
          : "Suppliers can no longer see the fair market price on this bid.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update FMPI visibility.",
        variant: "destructive",
      });
    },
  });

  const broadCastMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/dbo/bids/${bidId}/broadcast-message`, {
        message: broadcastMessage,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Message broadcasted successfully" });
      setBroadcastMessageOpen(false);
      setBroadcastMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids/get-broadcast-messages", bidId] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to broadcasted message", description: error.message, variant: "destructive" });
    },
  });

  const placeProxyMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", `/api/dbo/bids/${bidId}/proxy-response`, payload);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async (data: any) => {
      const responseId = data?.responseId;
      if (responseId && proxyAttachList.length > 0) {
        for (const item of proxyAttachList) {
          const formData = new FormData();
          formData.append("file", item.file);
          formData.append("attach_desc", item.desc);
          formData.append("attach_name", item.file.name);
          formData.append("attach_type", item.file.type || "application/octet-stream");
          formData.append("attach_source", "Financial");
          await apiRequest("POST", `/api/dbo/bids/${bidId}/proxy-response/${responseId}/attachments`, formData);
        }
      }
      toast({ title: "Proxy bid response submitted successfully" });
      setShowProxySheet(false);
      setProxyAttachList([]);
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId, "suppliers"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to submit proxy response", description: error.message, variant: "destructive" });
    },
  });

  const { data: boradcastMessages } = useQuery<BroadcastMessage[]>({
    queryKey: ["/api/dbo/bids/get-broadcast-messages", bidId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/dbo/bids/${bidId}/get-broadcast-messages`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  const addSupplierMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/suppliers`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "suppliers"],
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to invite supplier.",
        variant: "destructive",
      });
    },
  });

  const authData = typeof window !== "undefined" ? localStorage.getItem("prokraya-auth") : null;
  const authParsed = authData ? JSON.parse(authData) : null;
  const isSupplier = authParsed.role === "vendor";

  const { data: bid, isLoading } = useQuery<any>({
    queryKey: ["/api/dbo/bids", bidId],
    enabled: !!bidId,
  });

  const { data: lines } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "lines"],
    enabled: !!bidId,
  });

  const { data: suppliers } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "suppliers"],
    enabled: !!bidId,
  });

  const { data: requirements } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "requirements"],
    enabled: !!bidId,
  });

  const { data: clauses } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "clauses"],
    enabled: !!bidId,
  });

  const { data: approvers } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "approvers"],
    enabled: !!bidId,
  });

  const { data: attachments } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "attachments"],
    enabled: !!bidId,
  });

  const { data: categoryTypeLookups = [] } = useQuery<any[]>({
    queryKey: ["/api/lookups/by-property/CATEGORY_TYPE"],
  });

  const categoryTypeLookup = categoryTypeLookups.find(
    (l) => l.lookup_key === "CATEGORY",
  );
  const isNonUnspsc = categoryTypeLookup?.lookup_value === "NON-UNSPSC";

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const { data: productCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/product-categories"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/product-categories");
      if (!res.ok) throw new Error("Failed to fetch product categories");
      return res.json();
    },
    enabled: isNonUnspsc && showAddSupplierDialog,
  });

  const { data: categoriesData } = useQuery<
    { id: string; code: string; name: string; level: string }[]
  >({
    queryKey: ["/api/categories"],
    enabled: !isNonUnspsc && showAddSupplierDialog,
  });

  const { data: taxCodesData } = useQuery<{ id: number; tax_code_id: string; tax_code: string; tax_code_desc: string; tax_rate: number; tax_type: string }[]>({
    queryKey: ["/api/tax-codes"],
    enabled: showProxySheet,
  });
  const taxCodes = taxCodesData || [];

  const categories = isNonUnspsc
    ? productCategories.map((pc: any) => ({
      id: String(pc.category_id || pc.categoryId || pc.id),
      code: pc.category_code || pc.categoryCode || String(pc.category_id || pc.categoryId || pc.id),
      name: pc.category_name || pc.categoryName || pc.name,
      level: "1",
    }))
    : categoriesData || [];

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSupplierSearch(supplierSearch);
      setSupplierPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [supplierSearch]);

  const { data: approvedSuppliersData } = useQuery<{
    data: any[];
    total: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: [
      "/api/dbo/approved-suppliers",
      supplierPage,
      debouncedSupplierSearch,
      selectedCategoryFilter,
    ],
    queryFn: async ({ queryKey }) => {
      const [_url, page, search, category] = queryKey as any;
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        search: search || "",
        category: category || "",
      });
      const res = await apiRequest("GET", `/api/dbo/approved-suppliers?${params}`);
      return res.json();
    },
    enabled: showAddSupplierDialog,
  });

  const fetchAIVendorRecs = async () => {
    setAiVendorLoading(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/ai/vendor-recommendations`,
        {},
      );
      const data = await res.json();
      setAiVendorRecs(Array.isArray(data) ? data : []);
      setSelectedSupplierIds([]);
      setShowAIVendorPanel(true);
    } catch (e) {
      setAiVendorRecs([]);
      setShowAIVendorPanel(true);
    } finally {
      setAiVendorLoading(false);
    }
  };

  const inviteSelectedSuppliers = async () => {
    const approvedSuppliers = approvedSuppliersData?.data || [];
    const selected = approvedSuppliers.filter((s: any) =>
      selectedSupplierIds.includes(s.id),
    );
    for (const s of selected) {
      await addSupplierMutation.mutateAsync({
        supplier_id: s.id,
        supplier_name: s.supplier_name,
        supplier_site: `${s.supplier_name}-${s.city || ""}-${s.country || ""}`,
        supplier_contact: s.supplier_name || "",
        supplier_contact_email: s.email_id || "",
        supplier_contact_no: s.phone || "",
      });
    }
    toast({
      title: "Suppliers Invited",
      description: `${selected.length} supplier(s) have been invited to this bid.`,
    });
    setSelectedSupplierIds([]);
    setShowAddSupplierDialog(false);
  };

  const inviteAIVendors = async () => {
    const recsToInvite = aiVendorRecs.filter((v: any) =>
      selectedSupplierIds.includes(v.supplierId),
    );
    for (const v of recsToInvite) {
      await addSupplierMutation.mutateAsync({
        supplier_id: v.supplierId,
        supplier_name: v.supplierName,
        supplier_site: v.supplierSite || `${v.supplierName}`,
        supplier_contact: v.contactName || "",
        supplier_contact_email: v.contactEmail || "",
        supplier_contact_no: "",
      });
    }
    toast({
      title: "Suppliers Invited",
      description: `${recsToInvite.length} AI-recommended supplier(s) invited.`,
    });
    setSelectedSupplierIds([]);
    setShowAIVendorPanel(false);
    setAiVendorRecs([]);
  };

  const handleSubmitProxy = () => {
    if (!proxySupplier) {
      toast({ title: "Please select a supplier", variant: "destructive" });
      return;
    }
    // if (!proxyRefNumber.trim()) {
    //   toast({ title: "Reference number is required", variant: "destructive" });
    //   return;
    // }
    if (!proxyComments.trim()) {
      toast({ title: "Comments are required", variant: "destructive" });
      return;
    }
    if (proxyAttachList.length === 0) {
      toast({ title: "Document is required", description: "Please attach at least one document before submitting.", variant: "destructive" });
      return;
    }
    if ((requirements || []).length > 0) {
      for (const req of (requirements || [])) {
        if (!proxyRequirements[req.id]?.answer?.trim()) {
          toast({ title: "Technical response incomplete", description: `Please provide a response for: "${req.question || `Requirement #${req.id}`}"`, variant: "destructive" });
          return;
        }
      }
    }
    const now = new Date();
    for (const line of (lines || [])) {
      const ld = proxyLines[line.id];
      const price = ld?.bidprice ? parseFloat(ld.bidprice) : null;
      const currency = bid?.currency || "AED";
      if (price == null || price < 0) {
        toast({ title: "Please enter positive value in unit price.", variant: "destructive" });
        return;
      }
      if (!ld?.promisedDate) {
        toast({ title: "Please enter promise date for all line items.", variant: "destructive" });
        return;
      }
      if (now > new Date(ld.promisedDate)) {
        toast({ title: "Please enter promise date after current date.", variant: "destructive" });
        return;
      }
    }
    const linePayload = (lines || []).map((line: any) => ({
      bidLineId: line.id,
      bidprice: proxyLines[line.id]?.bidprice ? parseFloat(proxyLines[line.id].bidprice) : null,
      discprice: proxyLines[line.id]?.discprice ? parseFloat(proxyLines[line.id].discprice) : null,
      promisedDate: proxyLines[line.id]?.promisedDate || null,
      taxCode: proxyLines[line.id]?.taxCode || null,
      taxRate: proxyLines[line.id]?.taxRate ?? null,
      uom: proxyLines[line.id]?.uom || null,

    }));
    const reqPayload = (requirements || []).map((req: any) => ({
      reqId: req.id,
      answer: proxyRequirements[req.id]?.answer || "",
      remarks: proxyRequirements[req.id]?.remarks || "",
    }));
    placeProxyMutation.mutate({
      supplierId: proxySupplier.supplier_id,
      lines: linePayload,
      requirements: reqPayload,
      comments: proxyComments.trim(),
      refNumber: proxyRefNumber.trim(),
      taxIncluded: proxyTaxIncluded,
    });
  };

  const proxyTotals = useMemo(() => {
    let totalAmt = 0;
    let totalDisc = 0;
    let totalTax = 0;
    const isTaxInclusive = proxyTaxIncluded === "Yes";
    if (isTaxInclusive) {
      for (const line of (lines || [])) {
        const ld = proxyLines[line.id];
        const totalAmount = Math.max(0, Number(ld?.total_amount || 0));
        const taxRate = Math.max(0, Number(ld?.taxRate || 0));
        const qty = Math.max(0, parseFloat(line.quantity) || 1);
        const lineTax = (totalAmount * taxRate) / 100;
        totalAmt += Math.max(0, totalAmount - lineTax);
        totalDisc += 0;
        totalTax += lineTax;
      }
    } else {
      for (const line of (lines || [])) {
        const ld = proxyLines[line.id];
        const unitPrice = Math.max(0, parseFloat(ld?.bidprice || "0") || 0);
        const discPrice = Math.max(0, Math.abs(parseFloat(ld?.discprice || "0") || 0));
        const taxRate = Math.max(0, Number(ld?.taxRate || 0));
        const qty = Math.max(0, parseFloat(line.quantity) || 0);
        const lineTotal = unitPrice * qty;
        const lineDiscount = Math.min(lineTotal, discPrice * qty);
        const taxableAmount = Math.max(0, lineTotal - lineDiscount);
        totalAmt += lineTotal;
        totalDisc += lineDiscount;
        totalTax += (taxableAmount * taxRate) / 100;
      }
    }
    return {
      totalAmt,
      totalDisc,
      totalTax,
      gross: Math.max(0, isTaxInclusive ? totalAmt + totalTax : totalAmt - totalDisc + totalTax),
    };
  }, [lines, proxyLines, proxyTaxIncluded]);

  const invitedSupplierIds = suppliers?.map((s: any) => s.supplier_id) || [];
  const approvedSuppliers = approvedSuppliersData?.data || [];
  const availableSuppliers = approvedSuppliers.filter(
    (s: any) => !invitedSupplierIds.includes(s.id),
  );

  const { data: auditData } = useQuery<any>({
    queryKey: ["/api/bids", bidId, "audit-logs", auditPage],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/bids/${bidId}/audit-logs?page=${auditPage}&limit=5`);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
    enabled: !!bidId,
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

  if (!bid) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Bid Not Found</h2>
            <p className="text-sm text-muted-foreground mb-4">The requested bid could not be found.</p>
            <Link href="/app/bids">
              <Button variant="outline" data-testid="button-not-found-back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Bids
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const bidType = bid.type || "RFQ";
  const typeConfig = bidTypeLabels[bidType] || bidTypeLabels["RFQ"];
  const bidNumber = bid.bid_number || bid.attribute_4 || `BID-${bid.id}`;
  const sConfig = statusConfig[bid.status] || statusConfig["Draft"];
  const currentUserId = authParsed?.userId?.toLowerCase() || "";
  const isBidBuyer = bid.buyer && currentUserId && bid.buyer.toLowerCase() === currentUserId;
  const isPrCancelled = bid.attribute_15 === "PR Cancelled";

  const termsClauses = clauses?.filter((c: any) => c.type === "terms") || [];
  const instructionsClauses = clauses?.filter((c: any) => c.type === "instructions") || [];

  const lineAttachments = (attachments || []).filter((a: any) => a.attach_source === "Lines" && a.status !== "Deleted");
  const requirementAttachments = (attachments || []).filter((a: any) => a.attach_source === "Requirements" && a.status !== "Deleted");
  const termsAttachments = (attachments || []).filter((a: any) => a.attach_source === "Terms" && a.status !== "Deleted");

  const teamTypes =
    bidType === "Tender"
      ? [
        "Technical Review Team",
        "Technical Approve Team",
        "Commercial Review Team",
        "Commercial Approve Team",
        "Committee Team",
      ]
      : bidType === "RFP"
        ? ["Technical Review Team", "Commercial Review Team"]
        : [
          "Technical Review Team",
          "Technical Approve Team",
          "Commercial Review Team",
          "Commercial Approve Team",
        ];

  const groupedApprovers: Record<string, any[]> = {};
  teamTypes.forEach(tt => { groupedApprovers[tt] = []; });
  (approvers || []).forEach((a: any) => {
    if (!groupedApprovers[a.teamtype]) groupedApprovers[a.teamtype] = [];
    groupedApprovers[a.teamtype].push(a);
  });

  const techRequirements = (requirements || []).filter((r: any) => r.category !== "Finance");
  const finRequirements = (requirements || []).filter((r: any) => r.category === "Finance");
  const totalTechWeight = techRequirements.reduce((sum: number, r: any) => sum + (parseInt(r.weight || "0", 10) || 0), 0);

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
  const downloadTemplate = async () => {
    try {
      const response = await fetch(
        `/api/bid/reviewpdf/${bidId}/bid`,
        {
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to download template");
      }

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `bid_${bidId}_Audit_Report.pdf`;

      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
    }
  };


  return (
    <div className="p-4 space-y-3 max-w-6xl mx-auto">

      {boradcastMessages && boradcastMessages?.length > 0 &&
        <div className="overflow-hidden">
          <div className="whitespace-nowrap animate-marquee">
            <div className="inline-block text-sm text-destructive">
              {boradcastMessages?.map((message: BroadcastMessage) => (
                <span key={message.id} className="font-bold mx-4">
                  * {message.bid_broad_cast_message}
                </span>
              ))}
            </div>
          </div>
        </div>}

      <div className="relative flex items-center gap-3 flex-wrap" data-testid="breadcrumb-bids">
        <Link href="/app/bids">
          <Button variant="ghost" size="icon" data-testid="button-back-to-bids">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
          <Gavel className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold" data-testid="text-view-bid-number">{bidNumber}</h1>
            <Badge variant="outline" className={`border-0 ${typeConfig.className}`} data-testid="badge-view-bid-type">
              {typeConfig.full}
            </Badge>
            <Badge variant="secondary" className={`${sConfig.className}`} data-testid="badge-view-bid-status">
              {bid.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="text-view-bid-title">{bid.bid_title}</p>
        </div>
        <div className="flex-1" />
        {isBidBuyer && !isPrCancelled && bid.status !== "Published" && bid.status !== "Closed" && bid.status !== "Draft" && bid.status !== "Cancelled" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" data-testid="button-cancel-bid" onClick={() => setCancelDialogOpen(true)}>
              <Lock className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        )}
        {isBidBuyer && !isPrCancelled && bid.status === "Closed" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" data-testid="button-cancel-bid" onClick={() => setCancelDialogOpen(true)}>
              <Lock className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            {(bid?.tech_score_complete !== "Y" || bid?.fin_score_complete !== "Y") && 
              <Button variant="outline" size="sm" data-testid="button-reopen-bid" onClick={() => setReopenDialogOpen(true)}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Re Open
              </Button>
            }
            <Button variant="outline" size="sm" data-testid="button-hold-bid">
              <Clock className="h-4 w-4 mr-2" />
              Hold
            </Button>
          </div>
        )}
        {isBidBuyer &&  bid.status !== "Draft" && bid.status !== "Pending Approval" && bid.status !== "Published" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" data-testid="button-download-audit-logs" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Audit Logs
            </Button>
          </div>
        )}
        {isBidBuyer && !isPrCancelled && bid.status === "Published" && (
          <div className="flex items-center gap-2">
            {(bidType === "RFQ" || bidType === "RFP") && (
              <Button
                variant="outline"
                size="sm"
                data-testid="button-place-proxy"
                onClick={() => {
                  setProxySupplier(null);
                  setProxyLines({});
                  setProxyRequirements({});
                  setProxyComments("");
                  setProxyRefNumber("");
                  setProxyActiveTab("financial");
                  setProxyTaxIncluded("No");
                  setProxyAttachList([]);
                  setProxyAttachDesc("");
                  setShowProxySheet(true);
                }}
              >
                <ClipboardList className="h-4 w-4 mr-2" />
                Place Proxy
              </Button>
            )}
            <Button variant="outline" size="sm" data-testid="button-edit-bid" onClick={() => setEditSheetOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              data-testid="button-close-bid"
              onClick={() => setCloseDialogOpen(true)}
            >
              <Lock className="h-4 w-4 mr-2" />
              Close
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="button-broadcast-bid"
              onClick={() => setBroadcastMessageOpen(true)}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Broadcast Message
            </Button>
            {/* <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-actions-menu">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Broadcast Message
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="gap-2" data-testid="menu-broadcast-message" onClick={() => setBroadcastMessageOpen(true)}>
                  <MessageSquare className="h-4 w-4" />
                  Broadcast Message
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" data-testid="menu-schedule-meeting">
                  <CalendarPlus className="h-4 w-4" />
                  Schedule Meeting
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" data-testid="menu-upcoming-meetings">
                  <CalendarClock className="h-4 w-4" />
                  Upcoming Meetings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu> */}
          </div>
        )}
      </div>

      <div className="relative flex items-center justify-center pointer-events-none">
        <CountdownTimer endDate={bid.enddate} />
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
            <InfoItem label="Start Date" value={formatDateTime(bid.startdate)} icon={Calendar} testId="text-start-date" />
            <InfoItem label="End Date" value={formatDateTime(bid.enddate)} icon={Calendar} testId="text-end-date" />
            <InfoItem label="Currency" value={bid.currency} icon={DollarSign} testId="text-currency" />
            <InfoItem label="Bid Style" value={bid.bid_style || "-"} icon={Shield} testId="text-bid-style" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <InfoItem label="Payment Terms" value={bid.paymentterms} icon={CreditCard} testId="text-payment-terms" />
            <InfoItem label="Delivery Location" value={bid.delivertto_location_name || bid.shiptoaddress} icon={MapPin} testId="text-delivery-location" />
            <InfoItem label="Business Entity" value={organizations?.find(org => String(org.id) === bid.org_id)?.organization_name || "-"} icon={FolderTree} testId="text-business-entity" />
            {bid.pr_number && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Linked PR
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium" data-testid="text-linked-pr">{bid.pr_number}</p>
                  {isPrCancelled && (
                    <Badge variant="destructive" className="text-xs px-1.5 py-0" data-testid="badge-pr-cancelled">
                      PR Cancelled
                    </Badge>
                  )}
                </div>
              </div>
            )}
            {!isSupplier && (
              <InfoItem label="Budget" value={bid.budget_name} icon={DollarSign} testId="text-eval-linked-budget" />
            )}
            {bidType === "Tender" && (
              <InfoItem label="Envelope Open Date" value={formatDateTime(bid.env_open_date)} icon={Clock} testId="text-env-open-date" />
            )}
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3" />
                Buyer
              </p>
              <p className="text-sm font-medium" data-testid="text-buyer-name">{bid.buyer_name || bid.buyer_email || "-"}</p>
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
              <p className="text-sm font-medium" data-testid="text-requestor-name">{bid.requestor_name || "-"}</p>
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
              <p className="text-sm font-medium" data-testid="text-department">{bid.department_name || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <Users className="h-3 w-3" />
                Suppliers Invited
              </p>
              <p className="text-sm font-medium" data-testid="text-vendors-invited">{bid.no_invited_supps || suppliers?.length || 0}</p>
            </div>
          </div>

          {bid.notes_to_supplier && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Notes to Suppliers</p>
                <p className="text-sm bg-muted/50 rounded-md p-3" data-testid="text-notes-to-vendor">{bid.notes_to_supplier}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between gap-4">
            <SectionHeader icon={Package} title="Scope of Work" count={lines?.length || 0} />
            {isBidBuyer && isAIEnabled("AI_FMP_INTELLIGENCE") && (
              <div className="flex items-center gap-2 mb-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label
                      htmlFor="switch-show-fmp-to-supplier"
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground cursor-pointer whitespace-nowrap"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Show FMPI to Suppliers
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px]">
                    When enabled, invited suppliers see the AI fair market price and its range on
                    every line item while quoting. Lines that have not been benchmarked yet are
                    computed in the background.
                  </TooltipContent>
                </Tooltip>
                {fmpVisibilityMutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
                <Switch
                  id="switch-show-fmp-to-supplier"
                  checked={!!bid.show_fmp_to_supplier}
                  disabled={fmpVisibilityMutation.isPending}
                  onCheckedChange={(checked: boolean) => fmpVisibilityMutation.mutate(checked)}
                  data-testid="switch-show-fmp-to-supplier"
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 text-sm">
          {(!lines || lines.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-6">No line items defined.</p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead>Need By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line: any, idx: number) => (
                    <TableRow key={line.id} data-testid={`row-view-line-${line.id}`}>
                      <TableCell className="text-muted-foreground text-sm py-2">{idx + 1}</TableCell>
                      <TableCell className="text-sm font-medium max-w-[250px] py-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate cursor-default">{line.description}</span>
                          </TooltipTrigger>
                          <TooltipContent><p>{line.description}</p></TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className="text-xs">{line.linetype}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-2">{line.product_category || "-"}</TableCell>
                      <TableCell className="text-sm text-right font-mono py-2">{line.quantity}</TableCell>
                      <TableCell className="text-sm py-2">{line.uom}</TableCell>
                      <TableCell className="text-sm text-right font-mono py-2">
                        {line.currentprice && parseFloat(line.currentprice) > 0 ? formatCurrency(line.currentprice, line.currency || bid.currency) : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-2">{formatDate(line.needbyto)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {lineAttachments.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                Scope Attachments
              </p>
              <div className="flex flex-wrap gap-2">
                {lineAttachments.map((att: any) => (
                  <a
                    key={att.id}
                    href={`/${att.attach_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs border rounded-md px-2.5 py-1.5 hover-elevate"
                    data-testid={`link-attachment-${att.id}`}
                  >
                    <File className="h-3 w-3 text-muted-foreground" />
                    <span>{att.attach_name}</span>
                    <Download className="h-3 w-3 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <SectionHeader icon={Users} title="Invited Suppliers" count={suppliers?.length || 0} />
            {isBidBuyer && !isPrCancelled && (bid.status === "Published" || bid.status === "Draft") && (
              <div className="flex items-center gap-2">
                {isAIEnabled("AI_VENDOR_RECOMMENDATIONS") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs border-primary/20 hover:bg-primary/5"
                    onClick={fetchAIVendorRecs}
                    disabled={aiVendorLoading}
                    data-testid="button-ai-suggest-suppliers"
                  >
                    {aiVendorLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Brain className="h-3.5 w-3.5 text-primary" />
                    )}
                    AI Smart Suggest
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => setShowAddSupplierDialog(true)}
                  data-testid="button-invite-supplier-view"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Invite Supplier
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 text-sm">
          {(!suppliers || suppliers.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-6">No suppliers invited.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {suppliers.map((s: any) => (
                <div
                  key={s.id}
                  className="border rounded-md p-3 space-y-1.5"
                  data-testid={`card-vendor-${s.id}`}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {(s.supplier_name || "V").substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{s.supplier_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.supplier_site || "-"}</p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{s.status || "Invited"}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5 pl-10">
                    {s.supplier_contact && (
                      <p className="flex items-center gap-1"><User className="h-3 w-3" />{s.supplier_contact}</p>
                    )}
                    {s.supplier_contact_email && (
                      <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.supplier_contact_email}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-4 pb-4 pt-3">
          <Tabs defaultValue={bidType === "RFQ" && !isSupplier ? "terms" : "criteria"} data-testid="tabs-evaluation">
            <TabsList className="w-full justify-start" data-testid="tabs-list-evaluation">
              {bidType !== "RFQ" && !isSupplier && (
                <>
                  <TabsTrigger value="criteria" className="gap-1.5" data-testid="tab-criteria">
                    <Scale className="h-3.5 w-3.5" />
                    Evaluation Criteria
                    {requirements && requirements.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs">{requirements.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="team" className="gap-1.5" data-testid="tab-team">
                    <Users className="h-3.5 w-3.5" />
                    Evaluation Team
                    {approvers && approvers.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs">{approvers.length}</Badge>
                    )}
                  </TabsTrigger>
                </>
              )}
              <TabsTrigger value="terms" className="gap-1.5" data-testid="tab-terms">
                <ScrollText className="h-3.5 w-3.5" />
                Terms & Instructions
                {(termsClauses.length + instructionsClauses.length) > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">{termsClauses.length + instructionsClauses.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {bidType !== "RFQ" && (
              <TabsContent value="criteria" data-testid="tabcontent-criteria">
                {(!requirements || requirements.length === 0) ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No evaluation criteria defined.</p>
                ) : (
                  <div className="space-y-4">
                    {techRequirements.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium">Technical / Business / Commercial Criteria</h4>
                          <Badge variant="outline" className="font-mono">
                            Weightage: {totalTechWeight}%
                          </Badge>
                        </div>
                        <div className="border rounded-md overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">#</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Question / Requirement</TableHead>
                                <TableHead>Response Type</TableHead>
                                <TableHead>Option</TableHead>
                                <TableHead className="text-right">Weight %</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {techRequirements.map((req: any, idx: number) => (
                                <TableRow key={req.id} data-testid={`row-view-req-${req.id}`}>
                                  <TableCell className="text-muted-foreground text-sm py-2">{idx + 1}</TableCell>
                                  <TableCell className="py-2">
                                    <Badge variant="outline" className="text-xs">{req.category}</Badge>
                                  </TableCell>
                                  <TableCell className="text-sm py-2">{req.question}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground py-2">{req.qvtype}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground py-2">{req.qvoption}</TableCell>
                                  <TableCell className="text-sm text-right font-mono font-medium py-2">{req.weight}%</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {finRequirements.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Financial Criteria</h4>
                        <div className="border rounded-md overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">#</TableHead>
                                <TableHead>Question / Requirement</TableHead>
                                <TableHead>Response Type</TableHead>
                                <TableHead>Option</TableHead>
                                <TableHead className="text-right">Weight %</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {finRequirements.map((req: any, idx: number) => (
                                <TableRow key={req.id} data-testid={`row-view-fin-req-${req.id}`}>
                                  <TableCell className="text-muted-foreground text-sm py-2">{idx + 1}</TableCell>
                                  <TableCell className="text-sm py-2">{req.question}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground py-2">{req.qvtype}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground py-2">{req.qvoption}</TableCell>
                                  <TableCell className="text-sm text-right font-mono font-medium py-2">{req.weight}%</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {requirementAttachments.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                          <Paperclip className="h-3 w-3" />
                          Evaluation Attachments
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {requirementAttachments.map((att: any) => (
                            <a
                              key={att.id}
                              href={`/${att.attach_path}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs border rounded-md px-2.5 py-1.5 hover-elevate"
                              data-testid={`link-req-attachment-${att.id}`}
                            >
                              <File className="h-3 w-3 text-muted-foreground" />
                              <span>{att.attach_name}</span>
                              <Download className="h-3 w-3 text-muted-foreground" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            )}

            {bidType !== "RFQ" && (
              <TabsContent value="team" data-testid="tabcontent-team">
                {(!approvers || approvers.length === 0) ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No team members assigned.</p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {teamTypes.map((tt) => {
                      const members = groupedApprovers[tt] || [];
                      if (members.length === 0) return null;
                      return (
                        <div key={tt} className="border rounded-md p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Shield className="h-3.5 w-3.5 text-primary" />
                            <h4 className="text-sm font-medium">{tt}</h4>
                            <Badge variant="secondary" className="ml-auto text-xs">{members.length}</Badge>
                          </div>
                          <div className="space-y-2">
                            {members.map((m: any) => (
                              <div key={m.id} className="flex items-center gap-2" data-testid={`team-member-${m.id}`}>
                                <Avatar className="h-6 w-6">
                                  <AvatarFallback className="text-[10px] bg-muted">
                                    {(m.user_name || "U").substring(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm truncate">{m.user_name}</p>
                                  {m.user_email && (
                                    <p className="text-xs text-muted-foreground truncate">{m.user_email}</p>
                                  )}
                                </div>
                                {m.user_department && (
                                  <span className="text-xs text-muted-foreground shrink-0">{m.user_department}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            )}

            <TabsContent value="terms" data-testid="tabcontent-terms">
              <div className="space-y-4">
                {termsClauses.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                      Terms & Conditions
                    </h4>
                    <div className="space-y-2">
                      {termsClauses.map((c: any, idx: number) => (
                        <div key={c.id} className="flex gap-3 text-sm border-l-2 border-primary/20 pl-3 py-1" data-testid={`clause-term-${c.id}`}>
                          <span className="text-muted-foreground font-mono text-xs mt-0.5">{idx + 1}.</span>
                          <p>{c.class_desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {instructionsClauses.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      Instructions to Suppliers
                    </h4>
                    <div className="space-y-2">
                      {instructionsClauses.map((c: any, idx: number) => (
                        <div key={c.id} className="flex gap-3 text-sm border-l-2 border-primary/20 pl-3 py-1" data-testid={`clause-instruction-${c.id}`}>
                          <span className="text-muted-foreground font-mono text-xs mt-0.5">{idx + 1}.</span>
                          <p>{c.class_desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {termsClauses.length === 0 && instructionsClauses.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No terms or instructions defined.</p>
                )}

                {termsAttachments.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <Paperclip className="h-3 w-3" />
                      Terms & Instructions Attachments
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {termsAttachments.map((att: any) => (
                        <a
                          key={att.id}
                          href={`/api/dbo/bids/${bidId}/attachments/${att.id}/download`}
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs border rounded-md px-2.5 py-1.5 hover-elevate"
                          data-testid={`link-terms-attachment-${att.id}`}
                        >
                          <File className="h-3 w-3 text-muted-foreground" />
                          <span>{att.attach_name}</span>
                          <Download className="h-3 w-3 text-muted-foreground" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <SectionHeader icon={History} title="Audit History" count={auditData?.total || 0} />
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 text-sm">
          {(!auditData?.records || auditData.records.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-6">No audit records found.</p>
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
                      data-testid="button-audit-prev"
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
                      data-testid="button-audit-next"
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

      {bid && (
        <BidFormSheet
          open={editSheetOpen}
          onOpenChange={setEditSheetOpen}
          editBidId={bidId}
          publishedEdit
          initialData={{
            bid_title: bid.bid_title || "",
            type: bid.type || "RFQ",
            currency: bid.currency || "USD",
            startdate: bid.startdate ? bid.startdate : "",
            enddate: bid.enddate ? bid.enddate : "",
            org_id: bid.org_id ? String(bid.org_id) : "",
            bid_style: bid.bid_style || "Sealed",
            buyer_id: bid.buyer_id ? String(bid.buyer_id) : "",
            buyer_name: bid.buyer_name || "",
            requestor_id: bid.requestor_id ? String(bid.requestor_id) : "",
            requestor_name: bid.requestor_name || "",
            payment_terms_id: bid.payment_terms_id ? String(bid.payment_terms_id) : "",
            paymentterms: bid.paymentterms || "",
            delivery_location_id: bid.delivery_location_id ? String(bid.delivery_location_id) : "",
            delivertto_location_name: bid.delivertto_location_name || "",
            template_name: bid.template_name || "",
            env_open_date: bid.env_open_date ? bid.env_open_date : "",
          }}
          prNumber={bid?.pr_number}
        />
      )}

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-close-bid">
          <DialogHeader>
            <DialogTitle>Close Bid</DialogTitle>
            <DialogDescription>
              Are you sure you want to close this bid? This will prevent any further supplier responses and move the bid to the "Closed" state.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)} data-testid="button-close-dialog-cancel">
              No, Keep Open
            </Button>
            <Button
              variant="destructive"
              onClick={() => closeBidMutation.mutate()}
              disabled={closeBidMutation.isPending}
              data-testid="button-close-dialog-confirm"
            >
              {closeBidMutation.isPending ? "Closing..." : "Yes, Close Bid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-cancel-bid">
          <DialogHeader>
            <DialogTitle>Cancel Bid</DialogTitle>
            <DialogDescription>Are you sure you want to cancel this bid? This action cannot be undone. Please provide a reason.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Reason for Cancellation</Label>
              <Input
                id="cancel-reason"
                placeholder="Enter reason for cancelling this bid"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                data-testid="input-cancel-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} data-testid="button-cancel-dialog-close">No, Keep Bid</Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={!cancelReason.trim() || cancelMutation.isPending}
              data-testid="button-cancel-confirm"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Yes, Cancel Bid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-reopen-bid">
          <DialogHeader>
            <DialogTitle>Re-Open Bid</DialogTitle>
            <DialogDescription>Set new publish and close dates to reopen this bid for supplier responses.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reopen-start-date">Publish Date</Label>
              <Input
                id="reopen-start-date"
                type="datetime-local"
                value={reopenStartDate}
                onChange={(e) => setReopenStartDate(e.target.value)}
                data-testid="input-reopen-start-date"
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reopen-end-date">Close Date</Label>
              <Input
                id="reopen-end-date"
                type="datetime-local"
                value={reopenEndDate}
                onChange={(e) => setReopenEndDate(e.target.value)}
                data-testid="input-reopen-end-date"
                min={reopenStartDate}
              />
            </div>
            {bid.type === "Tender" && (
              <div className="space-y-2">
                <Label htmlFor="reopenenv-end-date">Envelope Open Date</Label>
                <Input
                  id="reopenenv-end-date"
                  type="datetime-local"
                  value={reopenenvopenDate}
                  onChange={(e) => setReopenenvopenDate(e.target.value)}
                  data-testid="input-reopenenv-end-date"
                  min={reopenEndDate}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)} data-testid="button-reopen-cancel">Cancel</Button>
            <Button
              onClick={() => reopenMutation.mutate()}
              disabled={!reopenStartDate || !reopenEndDate || (bid.type === "Tender" && !reopenenvopenDate) || reopenMutation.isPending}
              data-testid="button-reopen-confirm"
            >
              {reopenMutation.isPending ? "Reopening..." : "Re-Open Bid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={broadCaseMessageOpen} onOpenChange={(open) => setBroadcastMessageOpen(open)}>
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Broadcast Message
            </DialogTitle>
            <DialogDescription>
              This message will be visible for all the invited suppliers
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="broadcast-message">Message <span className="text-red-500">*</span></Label>
            <Textarea
              id="broadcast-message"
              placeholder={"Please write message..."}
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              className="mt-2"
              rows={3}
              data-testid="input-broadcast-message"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setBroadcastMessageOpen(false);
                setBroadcastMessage("");
                document.body.style.pointerEvents = "auto";
              }}
              data-testid="button-broadcast-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => {
                if (!broadcastMessage) {
                  return;
                }
                setBroadcastMessageOpen(false);
                document.body.style.pointerEvents = "auto";
                setTimeout(() => {
                  broadCastMutation.mutate();
                }, 50);
              }}
              disabled={broadCastMutation.isPending || !broadcastMessage}
              data-testid="button-confirm-approval"
            >
              {broadCastMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Send Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADD SUPPLIER SHEET */}
      <Sheet
        open={showAddSupplierDialog}
        onOpenChange={(open: boolean) => {
          setShowAddSupplierDialog(open);
          if (!open) {
            setSelectedSupplierIds([]);
            setSupplierSearch("");
            setSelectedCategoryFilter("");
          }
        }}
      >
        <SheetContent
          className="w-[800px] sm:max-w-[800px] flex flex-col p-0"
          side="right"
        >
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle>Invite Suppliers</SheetTitle>
            <SheetDescription>
              Search and select suppliers to invite to this bid.
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 py-4 border-b bg-muted/30 space-y-4">
            <Popover open={vendorCategoryOpen} onOpenChange={setVendorCategoryOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={vendorCategoryOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {selectedCategoryFilter || "Filter by Category..."}
                  </span>
                  {selectedCategoryFilter ? (
                    <span
                      className="ml-2 h-4 w-4 shrink-0 opacity-50 hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedCategoryFilter("");
                        setSupplierPage(1);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </span>
                  ) : (
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[540px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search category..." />
                  <CommandList>
                    <CommandEmpty>No category found.</CommandEmpty>
                    <CommandGroup>
                      {categories.map((cat) => (
                        <CommandItem
                          key={cat.id}
                          value={cat.name}
                          onSelect={() => {
                            setSelectedCategoryFilter(cat.name);
                            setVendorCategoryOpen(false);
                            setSupplierPage(1);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedCategoryFilter === cat.name
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          {cat.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by supplier name, country, or email"
                className="pl-9"
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                data-testid="input-search-supplier"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6">
            <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="min-w-[160px]">Supplier Name</TableHead>
                  <TableHead className="min-w-[100px]">Country</TableHead>
                  <TableHead className="min-w-[160px]">Email</TableHead>
                  <TableHead className="min-w-[110px]">Contact No</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No matching suppliers found
                    </TableCell>
                  </TableRow>
                ) : (
                  availableSuppliers.map((s: any) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      data-testid={`row-supplier-${s.id}`}
                      onClick={() => {
                        setSelectedSupplierIds((prev) =>
                          prev.includes(s.id)
                            ? prev.filter((id) => id !== s.id)
                            : [...prev, s.id],
                        );
                      }}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedSupplierIds.includes(s.id)}
                          onCheckedChange={(checked: boolean) => {
                            setSelectedSupplierIds((prev) =>
                              checked
                                ? [...prev, s.id]
                                : prev.filter((id) => id !== s.id),
                            );
                          }}
                          data-testid={`checkbox-supplier-${s.id}`}
                        />
                      </TableCell>
                      <TableCell
                        className="font-medium max-w-[160px] truncate"
                        title={s.supplier_name}
                      >
                        {s.supplier_name}
                      </TableCell>
                      <TableCell>{s.country || "-"}</TableCell>
                      <TableCell
                        className="max-w-[160px] truncate"
                        title={s.email_id || ""}
                      >
                        {s.email_id || "-"}
                      </TableCell>
                      <TableCell>{s.phone || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {(approvedSuppliersData?.totalPages || 1) > 1 && (
            <div className="flex items-center justify-between px-6 py-2 border-t">
              <span className="text-xs text-muted-foreground">
                Page {supplierPage} of {approvedSuppliersData?.totalPages || 1}{" "}
                ({approvedSuppliersData?.total || 0} suppliers)
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={supplierPage <= 1}
                  onClick={() => setSupplierPage((p) => p - 1)}
                  data-testid="button-supplier-prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={
                    supplierPage >= (approvedSuppliersData?.totalPages || 1)
                  }
                  onClick={() => setSupplierPage((p) => p + 1)}
                  data-testid="button-supplier-next"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          <SheetFooter className="px-6 py-4 border-t">
            <div className="flex items-center justify-between w-full">
              <span className="text-sm text-muted-foreground">
                {selectedSupplierIds.length} supplier(s) selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowAddSupplierDialog(false)}
                  data-testid="button-cancel-invite"
                >
                  Cancel
                </Button>
                <Button
                  onClick={inviteSelectedSuppliers}
                  disabled={
                    selectedSupplierIds.length === 0 ||
                    addSupplierMutation.isPending
                  }
                  data-testid="button-invite-suppliers"
                >
                  {addSupplierMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Invite ({selectedSupplierIds.length})
                </Button>
              </div>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* PLACE PROXY SHEET */}
      <Sheet open={showProxySheet} onOpenChange={setShowProxySheet}>
        <SheetContent className="w-[1100px] sm:max-w-[1100px] flex flex-col p-0" side="right">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle>Place Proxy Response</SheetTitle>
            <SheetDescription>
              Submit a bid response on behalf of an invited supplier.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="space-y-2">
              <Label>Supplier <span className="text-red-500">*</span></Label>
              <Select
                value={proxySupplier ? String(proxySupplier.supplier_id) : ""}
                onValueChange={(val) => {
                  const s = (suppliers || []).find((s: any) => String(s.supplier_id) === val);
                  setProxySupplier(s || null);
                }}
              >
                <SelectTrigger data-testid="select-proxy-supplier">
                  <SelectValue placeholder="Select a supplier..." />
                </SelectTrigger>
                <SelectContent>
                  {(suppliers || []).filter((s: any) => s.ack_status !== "Not Participating").map((s: any) => (
                    <SelectItem key={s.supplier_id} value={String(s.supplier_id)}>
                      {s.supplier_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Tabs value={proxyActiveTab} onValueChange={setProxyActiveTab}>
              <TabsList>
                {(requirements || []).length > 0 && (
                  <TabsTrigger value="technical">Technical</TabsTrigger>
                )}
                <TabsTrigger value="financial">Financial</TabsTrigger>
              </TabsList>
              <TabsContent value="financial" className="mt-3">
                <div className="flex items-center gap-3 mb-3">
                  <Label htmlFor="proxy-tax-type" className="w-[150px] shrink-0">Type of Tax <span className="text-red-500">*</span></Label>
                  <Select
                    value={proxyTaxIncluded}
                    onValueChange={(v) => setProxyTaxIncluded(v as "Yes" | "No")}
                  >
                    <SelectTrigger id="proxy-tax-type" className="w-40" data-testid="select-proxy-tax-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Yes">Inclusive</SelectItem>
                      <SelectItem value="No">Exclusive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(!lines || lines.length === 0) ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No line items.</p>
                ) : (
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>UOM</TableHead>
                          {proxyTaxIncluded === "Yes" ?
                            <>
                              <TableHead className="w-[150px]">Total Amount</TableHead>
                              <TableHead className="w-[150px]">Tax Rate</TableHead>
                              <TableHead className="w-[150px]">Tax Amount</TableHead>
                              <TableHead className="w-[150px]">Unit Price</TableHead>
                            </>
                            : <>
                              <TableHead className="w-[150px]">Unit Price</TableHead>
                              <TableHead className="w-[150px]">Tax Rate</TableHead>
                              <TableHead className="w-[150px]">Disc Unit Price</TableHead>
                            </>}
                          <TableHead className="w-[170px] min-w-[170px] max-w-[170px]">Promised Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((line: any, idx: number) => {
                          const ld = proxyLines[line.id] || { bidprice: "", discprice: "", promisedDate: "", taxCode: null, taxRate: null, total_amount: "" };
                          return (
                            <TableRow key={line.id}>
                              <TableCell className="text-sm max-w-[120px] truncate py-2">{line.description}</TableCell>
                              <TableCell className="text-sm py-2">{line.quantity}</TableCell>
                              <TableCell className="text-sm py-2">{line.uom}</TableCell>
                              {proxyTaxIncluded === "Yes" ?
                                <>
                                  <TableCell className="py-2">
                                    <Input
                                      type="number"
                                      value={ld.total_amount ?? ""}
                                      placeholder="Total Amount"
                                      onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                                      onChange={(e) => {
                                        const totalVal = parseFloat(e.target.value) || 0;
                                        const taxRateVal = ld?.taxRate ?? 0;
                                        const qtyVal = parseFloat(line.quantity) || 1;
                                        const taxAmt = (totalVal * taxRateVal) / 100;
                                        const uPrice = Math.max(0, totalVal - taxAmt) / qtyVal;
                                        setProxyLines((prev) => ({
                                          ...prev,
                                          [line.id]: {
                                            ...prev[line.id],
                                            total_amount: e.target.value,
                                            bidprice: uPrice.toFixed(2),
                                            discprice: "0",
                                          },
                                        }));
                                      }}
                                      onBlur={() => {
                                        const currentLine = proxyLines[line.id];
                                        const totalVal = parseFloat(currentLine?.total_amount || "0") || 0;
                                        const roundedTotal = Math.round(totalVal);
                                        const taxRateVal = currentLine?.taxRate ?? 0;
                                        const qtyVal = parseFloat(line.quantity) || 1;
                                        const taxAmt = (roundedTotal * taxRateVal) / 100;
                                        const uPrice = Math.max(0, roundedTotal - taxAmt) / qtyVal;
                                        const bidPrice = roundedTotal;
                                        const updatedLine = {
                                          ...currentLine,
                                          total_amount: roundedTotal.toString(),
                                          bidprice: uPrice.toFixed(2),
                                          discprice: "0",
                                        };
                                        if (!currentLine?.total_amount || bidPrice <= 0) {
                                          setProxyLines(prev => ({ ...prev, [line.id]: { ...updatedLine, discprice: "0" } }));
                                        } else {
                                          setProxyLines(prev => ({ ...prev, [line.id]: updatedLine }));
                                        }
                                      }}
                                      data-testid={`input-line-price-${line.id}`}
                                    />
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Select
                                      data-testid={"input-product-taxcode-" + line.id}
                                      value={ld.taxCode ? String(taxCodes.find(t => t.tax_code === ld.taxCode)?.tax_code_id ?? "") : (ld.taxRate ? String(taxCodes.find(t => Number(t.tax_rate) === Number(ld.taxRate))?.tax_code_id ?? "") : "")}
                                      onValueChange={(value) => {
                                        const selectedTax = taxCodes.find(
                                          (t) => Number(t.tax_code_id) === Number(value)
                                        );
                                        const currentLine = proxyLines[line.id] || {};
                                        const totalVal = parseFloat(currentLine.total_amount || "0") || 0;
                                        const taxRateVal = selectedTax?.tax_rate ?? 0;
                                        const qtyVal = parseFloat(line.quantity) || 1;
                                        const taxAmt = (totalVal * taxRateVal) / 100;
                                        const uPrice = Math.max(0, totalVal - taxAmt) / qtyVal;
                                        setProxyLines(prev => ({
                                          ...prev,
                                          [line.id]: {
                                            ...prev[line.id],
                                            taxCode: selectedTax?.tax_code || null,
                                            taxRate: selectedTax?.tax_rate != null ? parseFloat(selectedTax.tax_rate.toString()) : null,
                                            bidprice: uPrice.toFixed(2),
                                            discprice: "0",
                                          },
                                        }));
                                      }}
                                    >
                                      <SelectTrigger data-testid="select-line-tax-rate" style={{ textAlign: "left" }}>
                                        <SelectValue placeholder="Select tax" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {taxCodes.map((tax) => (
                                          <SelectItem
                                            key={tax.tax_code_id}
                                            value={String(tax.tax_code_id)}
                                            data-testid={`select-tax-${tax.tax_code_id}`}
                                          >
                                            {tax.tax_code} - {tax.tax_rate}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className="py-2">
                                    {formatCurrency(
                                      (Number(ld?.total_amount || 0) * Number(ld?.taxRate || 0)) / 100,
                                      line.currency || bid?.currency || ""
                                    )}
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Input
                                      type="text"
                                      value={formatCurrency(Number(ld.bidprice || "0.00"), line.currency || bid?.currency || "")}
                                      readOnly
                                      className="h-9 bg-muted/40 font-mono text-sm"
                                      data-testid={`input-line-unit-price-readonly-${line.id}`}
                                    />
                                  </TableCell>
                                </> : <>
                                  <TableCell className="py-2">
                                    <Input
                                      type="number"
                                      placeholder="Unit Price"
                                      value={ld.bidprice}
                                      onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                                      onChange={(e) =>
                                        setProxyLines((prev) => ({
                                          ...prev,
                                          [line.id]: { ...prev[line.id], bidprice: e.target.value },
                                        }))
                                      }
                                      onBlur={() => {
                                        const currentLine = proxyLines[line.id];
                                        const bidPrice = parseFloat(currentLine?.bidprice || "0");
                                        const discPrice = parseFloat(currentLine?.discprice || "0");
                                        if (!currentLine?.bidprice || bidPrice <= 0) {
                                          setProxyLines(prev => ({ ...prev, [line.id]: { ...prev[line.id], discprice: "" } }));
                                        } else if (currentLine?.discprice && (discPrice < 0 || discPrice > bidPrice)) {
                                          toast({
                                            title: "Invalid Discount",
                                            description: discPrice < 0
                                              ? "Discount unit price cannot be negative."
                                              : "Discount unit price cannot exceed unit price.",
                                            variant: "destructive"
                                          });
                                          setProxyLines(prev => ({ ...prev, [line.id]: { ...prev[line.id], discprice: "" } }));
                                        }
                                      }}
                                      data-testid={`input-line-price-${line.id}`}
                                    />
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Select
                                      data-testid={"input-product-taxcode-" + line.id}
                                      value={ld.taxCode ? String(taxCodes.find(t => t.tax_code === ld.taxCode)?.tax_code_id ?? "") : (ld.taxRate ? String(taxCodes.find(t => Number(t.tax_rate) === Number(ld.taxRate))?.tax_code_id ?? "") : "")}
                                      onValueChange={(value) => {
                                        const selectedTax = taxCodes.find(
                                          (t) => Number(t.tax_code_id) === Number(value)
                                        );
                                        setProxyLines(prev => ({
                                          ...prev,
                                          [line.id]: {
                                            ...prev[line.id],
                                            taxCode: selectedTax?.tax_code || null,
                                            taxRate: selectedTax?.tax_rate || null,
                                          },
                                        }));
                                      }}
                                    >
                                      <SelectTrigger data-testid="select-line-tax-rate" style={{ textAlign: "left" }}>
                                        <SelectValue placeholder="Select tax" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {taxCodes.map((tax) => (
                                          <SelectItem
                                            key={tax.tax_code_id}
                                            value={String(tax.tax_code_id)}
                                            data-testid={`select-tax-${tax.tax_code_id}`}
                                          >
                                            {tax.tax_code} - {tax.tax_rate}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Input
                                      type="number"
                                      placeholder="Disc Unit Price"
                                      disabled={!ld.bidprice || parseFloat(ld.bidprice) <= 0}
                                      value={ld.discprice}
                                      onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                                      onChange={(e) =>
                                        setProxyLines((prev) => ({
                                          ...prev,
                                          [line.id]: { ...prev[line.id], discprice: e.target.value },
                                        }))
                                      }
                                      onBlur={() => {
                                        const currentLine = proxyLines[line.id];
                                        const bidPrice = parseFloat(currentLine?.bidprice || "0");
                                        const discPrice = parseFloat(currentLine?.discprice || "0");
                                        if (discPrice < 0 || (discPrice > 0 && (bidPrice <= 0 || discPrice > bidPrice))) {
                                          toast({
                                            title: "Invalid Discount",
                                            description: discPrice < 0
                                              ? "Discount unit price cannot be negative."
                                              : bidPrice <= 0
                                                ? "Cannot apply discount when unit price is zero or empty."
                                                : "Discount unit price cannot exceed unit price.",
                                            variant: "destructive"
                                          });
                                          setProxyLines(prev => ({ ...prev, [line.id]: { ...prev[line.id], discprice: "" } }));
                                        }
                                      }}
                                      data-testid={`input-line-disc-${line.id}`}
                                    />
                                  </TableCell>
                                </>}
                              <TableCell className="py-2">
                                <Input
                                  type="date"
                                  className="w-full h-9 text-sm"
                                  value={ld.promisedDate || ""}
                                  onChange={(e) => setProxyLines(prev => ({
                                    ...prev,
                                    [line.id]: { ...prev[line.id], promisedDate: e.target.value },
                                  }))}
                                  data-testid={`input-line-promised-date-${line.id}`}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {(lines || []).length > 0 && (
                  <div className="mt-3 flex flex-col items-end gap-1 text-sm border-t pt-3">
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">Total Amount:</span>
                      <span className="w-32 text-right font-mono">{formatCurrency(proxyTotals.totalAmt, bid?.currency || "")}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">Discount Amount:</span>
                      <span className="w-32 text-right font-mono">{formatCurrency(proxyTotals.totalDisc, bid?.currency || "")}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">Tax Amount:</span>
                      <span className="w-32 text-right font-mono">{formatCurrency(proxyTotals.totalTax, bid?.currency || "")}</span>
                    </div>
                    <div className="flex items-center gap-4 border-t pt-1 mt-1">
                      <span className="font-semibold">Net Total:</span>
                      <span className="w-32 text-right font-mono font-semibold">{formatCurrency(proxyTotals.gross, bid?.currency || "")}</span>
                    </div>
                  </div>
                )}
              </TabsContent>
              {(requirements || []).length > 0 && (
                <TabsContent value="technical" className="mt-3">
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Requirement</TableHead>
                          <TableHead>Answer</TableHead>
                          <TableHead>Remarks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(requirements || []).map((req: any, idx: number) => (
                          <TableRow key={req.id}>
                            <TableCell className="text-sm text-muted-foreground py-2">{idx + 1}</TableCell>
                            <TableCell className="text-sm max-w-[160px] py-2">{req.question}</TableCell>
                            <TableCell className="py-2">
                              <Select
                                value={proxyRequirements[req.id]?.answer || ""}
                                onValueChange={(val) => setProxyRequirements(prev => ({
                                  ...prev,
                                  [req.id]: { answer: val, remarks: prev[req.id]?.remarks || "" },
                                }))}
                              >
                                <SelectTrigger className="w-24 h-7 text-sm">
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Yes">Yes</SelectItem>
                                  <SelectItem value="No">No</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-2">
                              <Input
                                className="w-36 h-7 text-sm"
                                placeholder="Remarks"
                                value={proxyRequirements[req.id]?.remarks || ""}
                                onChange={(e) => setProxyRequirements(prev => ({
                                  ...prev,
                                  [req.id]: { answer: prev[req.id]?.answer || "", remarks: e.target.value },
                                }))}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              )}
            </Tabs>
            <div className="space-y-2">
              <Label htmlFor="proxy-comments">Comments <span className="text-red-500">*</span></Label>
              <Textarea
                id="proxy-comments"
                placeholder="Add comments for this proxy response"
                value={proxyComments}
                onChange={(e) => setProxyComments(e.target.value)}
                rows={3}
                data-testid="textarea-proxy-comments"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" />
                  Attachments
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Description"
                    className="h-7 w-40 text-sm"
                    value={proxyAttachDesc}
                    onChange={(e) => setProxyAttachDesc(e.target.value)}
                    data-testid="input-proxy-attach-desc"
                  />
                  <Input
                    type="file"
                    className="hidden"
                    ref={proxyFileRef}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt"
                    data-testid="file-input-proxy-attach"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) {
                        toast({ title: "File Too Large", description: "Maximum allowed size is 5MB.", variant: "destructive" });
                        e.target.value = "";
                        return;
                      }
                      setProxyAttachList(prev => [...prev, { file, desc: proxyAttachDesc }]);
                      setProxyAttachDesc("");
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => proxyFileRef.current?.click()}
                    data-testid="button-proxy-attach-select"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add File
                  </Button>
                </div>
              </div>
              {proxyAttachList.length > 0 && (
                <div className="border rounded-md divide-y text-sm">
                  {proxyAttachList.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate font-medium">{item.file.name}</span>
                      {item.desc && <span className="text-muted-foreground text-xs truncate max-w-[120px]">{item.desc}</span>}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => setProxyAttachList(prev => prev.filter((_, i) => i !== idx))}
                        data-testid={`button-proxy-remove-attach-${idx}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Files will be uploaded after the response is submitted. Max 5MB per file.</p>
            </div>
          </div>
          <SheetFooter className="px-6 py-4 border-t">
            <div className="flex items-center justify-end gap-2 w-full">
              <Button variant="outline" onClick={() => setShowProxySheet(false)} data-testid="button-proxy-cancel">
                Cancel
              </Button>
              <Button onClick={handleSubmitProxy} disabled={placeProxyMutation.isPending} data-testid="button-proxy-submit">
                {placeProxyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit Response
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* AI SUGGEST PANEL */}
      <Sheet open={showAIVendorPanel} onOpenChange={(open: boolean) => setShowAIVendorPanel(open)}>
        <SheetContent className="w-[800px] sm:max-w-[800px] flex flex-col p-0" side="right">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              AI Supplier Recommendations
            </SheetTitle>
            <SheetDescription>
              AI has analyzed your bid requirements and suggested these top-matching suppliers from our database.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {aiVendorRecs.length === 0 ? (
              <div className="text-center py-12">
                <Lightbulb className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No smart recommendations found</p>
                <p className="text-sm text-muted-foreground mt-1">Try adding more specific line items or requirements to improve AI accuracy.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {aiVendorRecs.map((rec: any) => {
                  const alreadyInvited = invitedSupplierIds.includes(rec.supplierId);
                  const isSelected = selectedSupplierIds.includes(rec.supplierId);

                  return (
                    <div
                      key={rec.supplierId}
                      className={cn(
                        "p-4 border rounded-lg transition-colors",
                        alreadyInvited ? "bg-muted/50 opacity-80" : "hover:border-primary/50 cursor-pointer",
                        isSelected && "border-primary bg-primary/5"
                      )}
                      onClick={() => {
                        if (alreadyInvited) return;
                        setSelectedSupplierIds(prev =>
                          prev.includes(rec.supplierId) ? prev.filter(id => id !== rec.supplierId) : [...prev, rec.supplierId]
                        );
                      }}
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-base truncate">{rec.supplierName}</h4>
                            <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] uppercase font-bold px-1.5 py-0">
                              {Math.round(rec.score || 0)}% Match
                            </Badge>
                          </div>
                          {rec.contactEmail && (
                            <p className="text-xs text-muted-foreground truncate">{rec.contactEmail}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(rec.reasons || []).slice(0, 3).map((reason: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs font-normal">
                                {reason}
                              </Badge>
                            ))}
                          </div>
                          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                            <span>{rec.pastBidsParticipated ?? 0} bids participated</span>
                            <span>{rec.pastBidsWon ?? 0} bids won</span>
                          </div>
                        </div>
                        {alreadyInvited ? (
                          <Badge variant="outline" className="shrink-0 bg-green-50 text-green-700 border-green-200">Already Invited</Badge>
                        ) : (
                          <Checkbox checked={isSelected} onCheckedChange={() => { }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <SheetFooter className="px-6 py-4 border-t">
            <div className="flex items-center justify-between w-full">
              <span className="text-sm text-muted-foreground">
                {selectedSupplierIds.length} recommended supplier(s) selected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowAIVendorPanel(false)}>Cancel</Button>
                <Button
                  onClick={inviteAIVendors}
                  disabled={selectedSupplierIds.length === 0 || addSupplierMutation.isPending}
                >
                  {addSupplierMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Invite Selected ({selectedSupplierIds.length})
                </Button>
              </div>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}