import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FmpSupplierHint, type SupplierFmpView } from "@/components/fmpi/fmp-supplier-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent,
  SheetDescription, SheetFooter,
  SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  ClipboardList,
  CreditCard,
  DollarSign,
  File,
  Gavel,
  Loader2,
  Mail, MapPin,
  Paperclip, Plus,
  Send,
  Timer,
  Trash2,
  User
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";

function formatDateTime(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function numberToWords(num: number): string {
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const scales = ["", "Thousand", "Lakh", "Crore"];

  if (num < 0) return "Minus " + numberToWords(-num);
  num = Math.floor(num);

  const groups: number[] = [];
  groups.push(num % 1000);
  num = Math.floor(num / 1000);
  while (num > 0) {
    groups.push(num % 100);
    num = Math.floor(num / 100);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    let s = "";
    if (g >= 100) {
      s += ones[Math.floor(g / 100)] + " Hundred";
      const rem = g % 100;
      if (rem > 0) {
        s += " " + (rem < 20 ? ones[rem] : tens[Math.floor(rem / 10)] + (rem % 10 ? " " + ones[rem % 10] : ""));
      }
    } else {
      s = g < 20 ? ones[g] : tens[Math.floor(g / 10)] + (g % 10 ? " " + ones[g % 10] : "");
    }
    if (scales[i]) s += " " + scales[i];
    parts.push(s);
  }
  return parts.join(" ") || "Zero";
}

const bidTypeLabels: Record<string, { label: string; full: string; className: string }> = {
  RFQ: { label: "RFQ", full: "Request for Quotation", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  RFP: { label: "RFP", full: "Request for Proposal", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  Tender: { label: "Tender", full: "Open Tender", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

const statusConfig: Record<string, { className: string }> = {
  Published: { className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  Submitted: { className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  Draft: { className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  Closed: { className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

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

export default function SupplierBidResponse() {
  const [, params] = useRoute("/app/suppbids/:bidId/response/:id");
  const responseId = params?.id;
  const bidId = params?.bidId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("technical");
  const [reqResponses, setReqResponses] = useState<Record<number, { response: string; remarks: string }>>({});
  const [lineData, setLineData] = useState<Record<number, { total_amount?: string; bidprice: string; discprice: string; promised_date: string, tax_code: string | null, tax_rate: number | null }>>({});
  const [comments, setComments] = useState("");
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showTechAttachSheet, setShowTechAttachSheet] = useState(false);
  const [showFinAttachSheet, setShowFinAttachSheet] = useState(false);
  const [techAttachForm, setTechAttachForm] = useState({ attach_name: "", attach_desc: "", attach_type: "application/pdf" });
  const [finAttachForm, setFinAttachForm] = useState({ attach_name: "", attach_desc: "", attach_type: "application/pdf" });
  const [selectedTechFile, setSelectedTechFile] = useState<globalThis.File | null>(null);
  const [selectedFinFile, setSelectedFinFile] = useState<globalThis.File | null>(null);
  const techFileInputRef = useRef<HTMLInputElement>(null);
  const finFileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError } = useQuery<{ response: any; requirements: any[]; lines: any[] }>({
    queryKey: ["/api/dbo/suppbids/response", responseId],
    enabled: !!responseId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: attachments } = useQuery<any[]>({
    queryKey: ["/api/dbo/suppbids/response", responseId, "attachments"],
    enabled: !!responseId,
  });

  const { data: taxCodesData } = useQuery<
    {
      id: number;
      tax_code_id: string;
      tax_code: string;
      tax_code_desc: string;
      tax_rate: number;
      tax_type: string;
    }[]
  >({
    queryKey: ["/api/tax-codes"],
  });
  const taxCodes = taxCodesData || [];

  const addAttachmentMutation = useMutation({
    mutationFn: async ({ formData, source }: { formData: FormData; source: string }) => {
      formData.append("attach_source", source);
      const response = await apiRequest("POST", `/api/dbo/suppbids/response/${responseId}/attachments`, formData);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppbids/response", responseId, "attachments"] });
      toast({ title: "Attachment Added", description: "Document has been attached successfully." });
      if (variables.source === "Technical") {
        setShowTechAttachSheet(false);
        setTechAttachForm({ attach_name: "", attach_desc: "", attach_type: "application/pdf" });
        setSelectedTechFile(null);
        if (techFileInputRef.current) techFileInputRef.current.value = "";
      } else {
        setShowFinAttachSheet(false);
        setFinAttachForm({ attach_name: "", attach_desc: "", attach_type: "application/pdf" });
        setSelectedFinFile(null);
        if (finFileInputRef.current) finFileInputRef.current.value = "";
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to add attachment.", variant: "destructive" });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachId: number) => {
      await apiRequest("DELETE", `/api/dbo/suppbids/response/${responseId}/attachments/${attachId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppbids/response", responseId, "attachments"] });
      toast({ title: "Attachment Removed", description: "Attachment has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove attachment.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (data?.requirements) {
      const initial: Record<number, { response: string; remarks: string }> = {};
      data.requirements.forEach((r: any) => {
        initial[r.id] = { response: r.response || "", remarks: r.remarks || "" };
      });
      setReqResponses(initial);
    }
  }, [data?.requirements]);

  useEffect(() => {
    if (data?.lines) {
      const isTaxInclusive = data.response?.tax_included === "Yes";
      const initial: Record<number, { total_amount?: string; bidprice: string; discprice: string; promised_date: string, tax_code: string | null, tax_rate: number | null }> = {};
      data.lines.forEach((l: any) => {
        const qty = parseFloat(l.quantity) || 1;
        const uPrice = parseFloat(l.bidprice != null ? String(l.bidprice) : "0") || 0;
        const taxRate = parseFloat(l.rate || "0") || 0;
        const calculatedTotalAmount = isTaxInclusive ? (taxRate < 100 ? Math.round((uPrice * qty) / (1 - taxRate / 100)) : 0).toString() : "";

        initial[l.id] = {
          total_amount: calculatedTotalAmount,
          bidprice: l.bidprice != null ? String(l.bidprice) : "",
          discprice: l.discprice != null ? String(l.discprice) : "",
          promised_date: l.promised_date ? new Date(l.promised_date).toISOString().split("T")[0] : "",
          tax_code: l.tax_code || null,
          tax_rate: l.rate || null,
        };
      });
      setLineData(initial);
    }
    if (data?.response) {
      setComments(data.response.amtcomments || "");
    }
  }, [data?.lines, data?.response]);

  const resp = data?.response;
  useEffect(() => {
    const type = resp?.bidtype;
    if (type === "RFQ") {
      setActiveTab("financial");
    }
  }, [resp]);
  const requirements = data?.requirements || [];
  const lines = data?.lines || [];
  const currency = resp?.currency || "AED";

  // Published fair market price per bid line. The server returns
  // `enabled: false` with no lines unless the buyer switched visibility on, so
  // there is nothing to hide client-side.
  const targetBidId = bidId || resp?.bidrefno || resp?.bid_id;
  const { data: fmpData } = useQuery<{ enabled: boolean; lines: Record<string, SupplierFmpView> }>({
    queryKey: ["/api/dbo/suppbids", targetBidId, "fmp"],
    enabled: !!targetBidId,
  });
  const fmpLines = fmpData?.enabled ? fmpData.lines : undefined;
  const isProxySubmitted = resp?.attribute_5 === "Y";
  const isSubmitted = isProxySubmitted;
  const isNonEditable = isSubmitted || resp?.status === "Closed" || resp?.status === "Submitted";
  const bidNumber = resp?.bid_number || "";

  const totals = useMemo(() => {
    let totalAmt = 0;
    let totalDisc = 0;
    let totalTax = 0;
    const isTaxInclusive = resp?.tax_included === "Yes";
    if (isTaxInclusive) {
      lines.forEach((l: any) => {
        const ld = lineData[l.id];
        const totalAmount = Math.max(0, Number(ld?.total_amount || 0));
        const taxRate = Math.max(0, Number(ld?.tax_rate || 0));
        const qty = Math.max(0, parseFloat(l.quantity) || 1);
        const lineTax = (totalAmount * taxRate) / 100;
        totalAmt += Math.max(0, totalAmount - lineTax);
        totalDisc += 0;
        totalTax += lineTax;
      });
    } else {
      lines.forEach((l: any) => {
        const ld = lineData[l.id];
        const totalAmount = Math.max(0, parseFloat(ld?.bidprice || "0") || 0);
        const disc = Math.max(0, Math.abs(parseFloat(ld?.discprice || "0") || 0));
        const taxRate = Math.max(0, Number(ld?.tax_rate || 0));
        const qty = Math.max(0, parseFloat(l.quantity) || 0);
        const lineTotal = totalAmount * qty;
        const lineDiscount = Math.min(lineTotal, disc * qty);
        const taxableAmount = Math.max(0, lineTotal - lineDiscount);
        const lineTax = (taxableAmount * taxRate) / 100;
        totalAmt += lineTotal;
        totalDisc += lineDiscount;
        totalTax += lineTax;
      });
    }

    const gross = Math.max(0, isTaxInclusive ? totalAmt + totalTax : totalAmt - totalDisc + totalTax);

    return {
      totalAmt,
      totalDisc,
      totalTax,
      gross,
      amountInWords: numberToWords(Math.round(gross)),
    };
  }, [lines, lineData]);

  const autoSaveRequirement = useCallback(async (reqId: number, data: { response: string; remarks: string }) => {
    if (!responseId) return;
    try {
      await apiRequest("PUT", `/api/dbo/suppbids/response/${responseId}/requirement/${reqId}`, data);
    } catch (err: any) {
      toast({ title: "Auto-save failed", description: err.message || "Failed to save requirement", variant: "destructive" });
    }
  }, [responseId, toast]);

  const autoSaveLine = useCallback(async (lineId: number, data: { bidprice: string; discprice: string; promised_date: string, tax_code: string | null, tax_rate: number | null }) => {
    if (!responseId || (data.bidprice && parseFloat(data.bidprice) <= parseFloat(data.discprice || "0"))) return;
    try {
      await apiRequest("PUT", `/api/dbo/suppbids/response/${responseId}/line/${lineId}`, {
        bidprice: data.bidprice ? parseFloat(data.bidprice) : null,
        discprice: data.discprice ? Math.abs(parseFloat(data.discprice)) : null,
        promised_date: data.promised_date || null,
        tax_code: data.tax_code || null,
        tax_rate: data.tax_rate !== null ? parseFloat(data.tax_rate?.toString()) : null,
      });
    } catch (err: any) {
      toast({ title: "Auto-save failed", description: err.message || "Failed to save line", variant: "destructive" });
    }
  }, [responseId, toast]);

  const autoSaveTotals = useCallback(async (commentsVal?: string) => {
    if (!responseId || totals.totalAmt <= totals.totalDisc) return;
    try {
      await apiRequest("PUT", `/api/dbo/suppbids/response/${responseId}/totals`, {
        bidtotal: totals.totalAmt,
        biddisc: totals.totalDisc,
        totalTax: totals.totalTax,
        grosstotal: totals.gross,
        amtcomments: commentsVal ?? comments,
        amount_in_words: totals.amountInWords,
      });
    } catch (err: any) {
      toast({ title: "Auto-save failed", description: err.message || "Failed to save totals", variant: "destructive" });
    }
  }, [responseId, totals, comments, toast]);

  const saveAllData = useCallback(async () => {
    if (!responseId) return;
    setSaving(true);
    try {
      const reqPromises = Object.entries(reqResponses).map(([id, val]) =>
        apiRequest("PUT", `/api/dbo/suppbids/response/${responseId}/requirement/${id}`, val)
      );
      const linePromises = Object.entries(lineData).map(([id, val]) =>
        apiRequest("PUT", `/api/dbo/suppbids/response/${responseId}/line/${id}`, {
          bidprice: val.bidprice ? parseFloat(val.bidprice) : null,
          discprice: val.discprice ? Math.abs(parseFloat(val.discprice)) : null,
          promised_date: val.promised_date || null,
          tax_code: val.tax_code || null,
          tax_rate: val.tax_rate !== null ? parseFloat(val.tax_rate?.toString()) : null,
        })
      );
      await Promise.all([...reqPromises, ...linePromises]);
      await apiRequest("PUT", `/api/dbo/suppbids/response/${responseId}/totals`, {
        bidtotal: totals.totalAmt,
        biddisc: totals.totalDisc,
        totalTax: totals.totalTax,
        grosstotal: totals.gross,
        amtcomments: comments,
        amount_in_words: totals.amountInWords,
      });
      toast({ title: "Saved", description: "Your response has been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppbids/response", responseId] });
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message || "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [responseId, reqResponses, lineData, totals, comments, toast]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      await saveAllData();
      return apiRequest("POST", `/api/dbo/suppbids/response/${responseId}/submit`, {
        comments: comments || "",
        notes: "",
        bondReason: "",
      });
    },
    onSuccess: () => {
      toast({ title: "Submitted", description: "Your bid response has been submitted successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppbids/response", responseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppbids"] });
      setShowSubmitDialog(false);
      navigate("/app/suppbids");
    },
    onError: (err: any) => {
      toast({ title: "Submit Failed", description: err.message || "Failed to submit response", variant: "destructive" });
    },
  });

  const updateTaxMutation = useMutation({
    mutationFn: async (data: string) => {
      return apiRequest("PUT", `/api/dbo/suppbids/response/${responseId}/update-tax-included`, {
        tax_included: data
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Tax Included updated successfully",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/suppbids/response", responseId],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update Tax Included",
        description: error.message,
        variant: "destructive",
      });
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

  if (isError || !resp) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Bid Response Not Found</h2>
            <p className="text-sm text-muted-foreground mb-4">The requested bid response could not be found.</p>
            <Link href="/app/suppbids">
              <Button variant="outline" data-testid="button-not-found-back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to My Bids
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sConfig = statusConfig[resp.status] || statusConfig["Draft"];
  const bidType = resp.bidtype || "RFQ";
  const typeConfig = bidTypeLabels[bidType] || bidTypeLabels["RFQ"];

  return (
    <div className="p-4 space-y-3 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 flex-wrap" data-testid="breadcrumb-response">
        <Link href="/app/suppbids">
          <Button variant="ghost" size="icon" data-testid="button-back-to-suppbids">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
          <Gavel className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold" data-testid="text-response-title">{bidNumber || `RESP-${resp.id}`}</h1>
            <Badge variant="outline" className={`border-0 ${typeConfig.className}`} data-testid="badge-bid-type">
              {typeConfig.full}
            </Badge>
            <Badge variant="secondary" className={sConfig.className} data-testid="badge-response-status">
              {resp.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="text-bid-title">{resp.bidtitle}</p>
        </div>
        <div className="ml-2">
          <CountdownTimer endDate={resp.bidenddate} />
        </div>
        <div className="ml-auto">
          {!isSubmitted && (
            <Button
              size="sm"
              onClick={() => setShowSubmitDialog(true)}
              data-testid="button-submit-response"
            >
              <Send className="h-4 w-4 mr-1" />
              Submit Response
            </Button>
          )}
        </div>
      </div>

      {isProxySubmitted && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-400" data-testid="banner-proxy-submitted">
          <AlertCircle className="h-4 w-4 shrink-0" />
          This bid response was submitted on your behalf by the buyer (place proxy). No further changes can be made.
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoItem label="Start Date" value={formatDateTime(resp.bidstartdate)} icon={Calendar} testId="text-bid-start" />
            <InfoItem label="End Date" value={formatDateTime(resp.bidenddate)} icon={Calendar} testId="text-bid-end" />
            <InfoItem label="Currency" value={currency} icon={DollarSign} testId="text-currency" />
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3" />
                Buyer
              </p>
              <p className="text-sm font-medium" data-testid="text-buyer-name">{resp.buyer_name || "-"}</p>
              {resp.buyer_email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" />{resp.buyer_email}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <InfoItem label="Payment Terms" value={resp.paymentterms} icon={CreditCard} testId="text-payment-terms" />
            <InfoItem label="Delivery Location" value={resp.delivertto_location_name} icon={MapPin} testId="text-delivery-loc" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionHeader icon={ClipboardList} title="Bid Response" />
            {fmpLines && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 text-purple-900 border border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/60 text-xs font-medium whitespace-nowrap shadow-xs">
                <AlertCircle className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 shrink-0" aria-hidden="true" />
                <span>AI can make mistakes. Please verify.</span>
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3" data-testid="text-instructions">
            Please provide your technical and financial response / quotes for the bid. Please attach all relevant technical and financial proposals support documents. Add any specific notes / comments / documents related to the proposal.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-response">
            <TabsList data-testid="tabs-list-response">
              {bidType !== "RFQ" && <TabsTrigger value="technical" className="gap-1.5" data-testid="tab-technical">
                Technical Response
              </TabsTrigger>}
              <TabsTrigger value="financial" className="gap-1.5" data-testid="tab-financial">
                Financial Response
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center space-y-2">
              <div className="flex items-center space-y-2">
                <Label className="w-[150px] mr-4" htmlFor="incl-of-tax">Type of Tax</Label>
                <Select
                  value={resp?.tax_included || "No"}
                  onValueChange={(v) =>
                    updateTaxMutation.mutate(v)
                  }
                  disabled={(isSubmitted || isNonEditable) ? true : false}
                >
                  <SelectTrigger id="incl-of-tax" data-testid="select-incl-of-tax">
                    <SelectValue placeholder="Select Type of Tax" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Inclusive</SelectItem>
                    <SelectItem value="No">Exclusive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TabsContent value="technical" className="mt-4" data-testid="tabcontent-technical">
              {requirements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No requirements defined for this bid.</p>
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
                        <TableRow key={req.id} data-testid={`row-req-${req.id}`}>
                          <TableCell className="text-sm py-2">
                            <Badge variant="outline" className="text-xs">{req.category}</Badge>
                          </TableCell>
                          <TableCell className="text-sm py-2">{req.question}</TableCell>
                          <TableCell className="text-sm text-muted-foreground py-2">{req.qvoption}</TableCell>
                          <TableCell className="py-2">
                            {isSubmitted ? (
                              <span className="text-sm">{reqResponses[req.id]?.response || "-"}</span>
                            ) : req.qvtype === "Dropdown" || req.qvtype === "Drop Down List" ? (
                              <Select
                                value={reqResponses[req.id]?.response || ""}
                                onValueChange={(val) => {
                                  const updated = { ...reqResponses[req.id], response: val };
                                  setReqResponses((prev) => ({ ...prev, [req.id]: updated }));
                                  autoSaveRequirement(req.id, updated);
                                }}
                              >
                                <SelectTrigger data-testid={`select-req-response-${req.id}`}>
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {req.lov && String(req.lov).trim() ? (
                                    String(req.lov).split(",").map((opt: string) => (
                                      <SelectItem key={opt.trim()} value={opt.trim()}>{opt.trim()}</SelectItem>
                                    ))
                                  ) : (
                                    <>
                                      <SelectItem value="Yes">Yes</SelectItem>
                                      <SelectItem value="No">No</SelectItem>
                                      <SelectItem value="Partially">Partially</SelectItem>
                                      <SelectItem value="N/A">N/A</SelectItem>
                                    </>
                                  )}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                placeholder="Enter response"
                                value={reqResponses[req.id]?.response || ""}
                                onChange={(e) =>
                                  setReqResponses((prev) => ({
                                    ...prev,
                                    [req.id]: { ...prev[req.id], response: e.target.value },
                                  }))
                                }
                                onBlur={() => autoSaveRequirement(req.id, reqResponses[req.id] || { response: "", remarks: "" })}
                                data-testid={`input-req-response-${req.id}`}
                                disabled={isProxySubmitted}
                              />
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            {isSubmitted || isProxySubmitted ? (
                              <span className="text-sm">{reqResponses[req.id]?.remarks || "-"}</span>
                            ) : (
                              <Input
                                placeholder="Remarks"
                                value={reqResponses[req.id]?.remarks || ""}
                                onChange={(e) =>
                                  setReqResponses((prev) => ({
                                    ...prev,
                                    [req.id]: { ...prev[req.id], remarks: e.target.value },
                                  }))
                                }
                                onBlur={() => autoSaveRequirement(req.id, reqResponses[req.id] || { response: "", remarks: "" })}
                                data-testid={`input-req-remarks-${req.id}`}
                                disabled={isProxySubmitted}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="mt-6 pt-4 border-t">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <span className="text-sm font-semibold flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Technical Attachments
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">Please attach any detail technical specification proposal documents related to the bid.</p>
                  </div>
                  {!isSubmitted && (
                    <Button size="sm" variant="outline" onClick={() => setShowTechAttachSheet(true)} data-testid="button-attach-tech-document">
                      <Plus className="h-4 w-4 mr-2" />
                      Attach Document
                    </Button>
                  )}
                </div>
                {(() => {
                  const techAttachments = (attachments || []).filter((a: any) => a.attach_source === "Technical" || !a.attach_source);
                  return techAttachments.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm">No documents attached yet</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                        <TableHeader>
                          <TableRow>
                            <TableHead>File Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Last Updated By</TableHead>
                            <TableHead>Last Updated Date</TableHead>
                            <TableHead>Status</TableHead>
                            {!isSubmitted && <TableHead className="w-10"></TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {techAttachments.map((att: any) => (
                            <TableRow key={att.id} data-testid={`row-tech-attachment-${att.id}`}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                  {att.attach_path ? (
                                    <a
                                      href={`/api/dbo/suppbids/response/${responseId}/attachments/${att.id}/download`}
                                      download
                                      className="font-medium text-sm text-primary hover:underline cursor-pointer"
                                      data-testid={`link-download-tech-attachment-${att.id}`}
                                    >
                                      {att.attach_name}
                                    </a>
                                  ) : (
                                    <span className="font-medium text-sm">{att.attach_name}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{att.attach_desc || "-"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{att.created_by || "-"}</TableCell>
                              <TableCell className="text-sm">{formatDate(att.created_date)}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">Active</Badge>
                              </TableCell>
                              {!isSubmitted && (
                                <TableCell>
                                  <Button variant="ghost" size="icon"
                                    onClick={() => deleteAttachmentMutation.mutate(att.id)}
                                    data-testid={`button-delete-tech-attachment-${att.id}`}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })()}
              </div>
            </TabsContent>

            <TabsContent value="financial" className="mt-4" data-testid="tabcontent-financial">
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No line items defined for this bid.</p>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Bid Qty</TableHead>
                        <TableHead>UOM</TableHead>
                        {resp.tax_included === "Yes" ?
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
                        <TableHead className="w-[60px]">Curr.</TableHead>
                        <TableHead className="w-[170px] min-w-[170px] max-w-[170px]">Promised Date</TableHead>
                        <TableHead>Need By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line: any) => {
                        const ld = lineData[line.id] || { bidprice: "", discprice: "", tax_rate: "", promised_date: "" };
                        return (
                          <TableRow key={line.id} data-testid={`row-line-${line.id}`}>
                            <TableCell className="py-2">
                              <div className="text-sm font-medium">{line.description}</div>
                              {line.product_category && <div className="text-xs text-muted-foreground">{line.product_category}</div>}
                              <FmpSupplierHint
                                fmp={line.bid_line_id ? (fmpLines?.[String(line.bid_line_id)] || fmpLines?.[String(line.id)]) : fmpLines?.[String(line.id)]}
                                currency={currency}
                                testId={`text-fmp-line-${line.id}`}
                              />
                            </TableCell>
                            <TableCell className="text-sm text-right font-mono py-2">{line.quantity}</TableCell>
                            <TableCell className="text-sm py-2">{line.uom || "-"}</TableCell>
                            {resp.tax_included === "Yes" ?
                              <>
                                <TableCell className="py-2">
                                  <Input
                                    type="number"
                                    value={ld.total_amount}
                                    placeholder="Total Amount"
                                    onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                                    onChange={(e) => {
                                      const totalVal = parseFloat(e.target.value) || 0;
                                      const taxRateVal = ld?.tax_rate ?? 0;
                                      const qtyVal = parseFloat(line.quantity) || 1;
                                      const taxAmt = (totalVal * taxRateVal) / 100;
                                      const uPrice = Math.max(0, totalVal - taxAmt) / qtyVal;
                                      setLineData((prev) => ({
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
                                      const currentLine = lineData[line.id];
                                      const totalVal = parseFloat(currentLine?.total_amount || "0") || 0;
                                      const roundedTotal = Math.round(totalVal);
                                      const taxRateVal = currentLine?.tax_rate ?? 0;
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

                                      setLineData(prev => ({ ...prev, [line.id]: updatedLine }));

                                      // If unit price is missing or <= 0, clear discount
                                      if (!currentLine?.total_amount || bidPrice <= 0) {
                                        const corrected = { ...updatedLine, discprice: "0" };
                                        setLineData(prev => ({ ...prev, [line.id]: corrected }));
                                        autoSaveLine(line.id, corrected);
                                      } else {
                                        autoSaveLine(line.id, {
                                          bidprice: updatedLine.bidprice,
                                          discprice: "0",
                                          promised_date: updatedLine.promised_date || "",
                                          tax_code: updatedLine.tax_code || null,
                                          tax_rate: updatedLine.tax_rate ?? null,
                                        });
                                      }
                                      autoSaveTotals();
                                    }}
                                    data-testid={`input-line-price-${line.id}`}
                                    disabled={isProxySubmitted}
                                  />
                                </TableCell>
                                <TableCell className="py-2">
                                  {isSubmitted || isProxySubmitted ? (
                                    <span className="text-sm font-mono">{ld.bidprice || "-"}</span>
                                  ) : (
                                    <Select
                                      data-testid={"input-product-taxcode-" + line.id}
                                      value={ld.tax_code ? String(taxCodes.find(t => t.tax_code === ld.tax_code)?.tax_code_id ?? "") : (ld.tax_rate ? String(taxCodes.find(t => Number(t.tax_rate) === Number(ld.tax_rate))?.tax_code_id ?? "") : "")}
                                      onValueChange={(value) => {
                                        const selectedTax = taxCodes.find(
                                          (t) => Number(t.tax_code_id) === Number(value)
                                        );
                                        const currentLine = lineData[line.id] || {};
                                        const totalVal = parseFloat(currentLine.total_amount || "0") || 0;
                                        const taxRateVal = selectedTax?.tax_rate ?? 0;
                                        const qtyVal = parseFloat(line.quantity) || 1;
                                        const taxAmt = (totalVal * taxRateVal) / 100;
                                        const uPrice = Math.max(0, totalVal - taxAmt) / qtyVal;

                                        setLineData(prev => ({
                                          ...prev,
                                          [line.id]: {
                                            ...prev[line.id],
                                            tax_code: selectedTax?.tax_code || null,
                                            tax_rate: selectedTax?.tax_rate || null,
                                            bidprice: uPrice.toFixed(2),
                                            discprice: "0",
                                          },
                                        }));
                                        autoSaveLine(line.id, {
                                          bidprice: uPrice.toFixed(2),
                                          discprice: "0",
                                          promised_date: ld.promised_date || "",
                                          tax_code: selectedTax?.tax_code || null,
                                          tax_rate: selectedTax?.tax_rate != null ? parseFloat(selectedTax.tax_rate.toString()) : null,
                                        });
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
                                  )}
                                </TableCell>
                                <TableCell className="py-2">
                                  {formatCurrency(
                                    (Number(ld?.total_amount || 0) * Number(ld?.tax_rate || 0)) / 100,
                                    line.currency || currency
                                  )}
                                </TableCell>
                                <TableCell className="py-2">
                                  <Input
                                    type="text"
                                    value={formatCurrency(Number(ld.bidprice || "0.00"), line.currency || currency)}
                                    readOnly
                                    className="h-9 bg-muted/40 font-mono text-sm"
                                    data-testid={`input-line-unit-price-readonly-${line.id}`}
                                  />
                                </TableCell>
                              </> : <>
                                <TableCell className="py-2">
                                  {isSubmitted || isProxySubmitted ? (
                                    <span className="text-sm font-mono">{ld.bidprice || "-"}</span>
                                  ) : (
                                    <Input
                                      type="number"
                                      placeholder="Unit Price"
                                      value={ld.bidprice}
                                      onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                                      onChange={(e) =>
                                        setLineData((prev) => ({
                                          ...prev,
                                          [line.id]: { ...prev[line.id], bidprice: e.target.value },
                                        }))
                                      }
                                      onBlur={() => {
                                        const currentLine = lineData[line.id];
                                        const bidPrice = parseFloat(currentLine?.bidprice || "0");
                                        const discPrice = parseFloat(currentLine?.discprice || "0");

                                        if (!currentLine?.bidprice || bidPrice <= 0) {
                                          const corrected = { ...currentLine, discprice: "" };
                                          setLineData(prev => ({ ...prev, [line.id]: corrected }));
                                          autoSaveLine(line.id, corrected);
                                        } else if (currentLine?.discprice && (discPrice < 0 || discPrice > bidPrice)) {
                                          toast({
                                            title: "Invalid Discount",
                                            description: discPrice < 0
                                              ? "Discount unit price cannot be negative."
                                              : "Discount unit price cannot exceed unit price.",
                                            variant: "destructive"
                                          });
                                          const corrected = { ...currentLine, discprice: "" };
                                          setLineData(prev => ({ ...prev, [line.id]: corrected }));
                                          autoSaveLine(line.id, corrected);
                                        } else {
                                          autoSaveLine(line.id, currentLine || { bidprice: "", discprice: "", promised_date: "" });
                                        }
                                        autoSaveTotals();
                                      }}
                                      data-testid={`input-line-price-${line.id}`}
                                    />
                                  )}
                                </TableCell>
                                <TableCell className="py-2">
                                  {isSubmitted || isProxySubmitted ? (
                                    <span className="text-sm font-mono">{ld.tax_rate || "-"}</span>
                                  ) : (
                                    <Select
                                      data-testid={"input-product-taxcode-" + line.id}
                                      value={ld.tax_code ? String(taxCodes.find(t => t.tax_code === ld.tax_code)?.tax_code_id ?? "") : (ld.tax_rate ? String(taxCodes.find(t => Number(t.tax_rate) === Number(ld.tax_rate))?.tax_code_id ?? "") : "")}
                                      onValueChange={(value) => {
                                        const selectedTax = taxCodes.find(
                                          (t) => Number(t.tax_code_id) === Number(value)
                                        );
                                        setLineData(prev => ({
                                          ...prev,
                                          [line.id]: {
                                            ...prev[line.id],
                                            tax_code: selectedTax?.tax_code || null,
                                            tax_rate: selectedTax?.tax_rate || null,
                                          },
                                        }));
                                        const currentLine = lineData[line.id];
                                        const bidPrice = parseFloat(currentLine?.bidprice || "0");
                                        const discPrice = parseFloat(currentLine?.discprice || "0");
                                        autoSaveLine(line.id, {
                                          bidprice: String(bidPrice),
                                          discprice: String(discPrice),
                                          promised_date: ld.promised_date || "",
                                          tax_code: selectedTax?.tax_code || null,
                                          tax_rate: selectedTax?.tax_rate || null,
                                        });
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
                                  )}
                                </TableCell>
                                <TableCell className="py-2">
                                  {isSubmitted || isProxySubmitted ? (
                                    <span className="text-sm font-mono">{ld.discprice || "-"}</span>
                                  ) : (
                                    <Input
                                      type="number"
                                      placeholder="Disc Unit Price"
                                      disabled={!ld.bidprice || parseFloat(ld.bidprice) <= 0}
                                      value={ld.discprice}
                                      onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                                      onChange={(e) =>
                                        setLineData((prev) => ({
                                          ...prev,
                                          [line.id]: { ...prev[line.id], discprice: e.target.value },
                                        }))
                                      }
                                      onBlur={() => {
                                        const currentLine = lineData[line.id];
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
                                          const corrected = { ...currentLine, discprice: "" };
                                          setLineData(prev => ({ ...prev, [line.id]: corrected }));
                                          autoSaveLine(line.id, corrected);
                                        } else {
                                          autoSaveLine(line.id, currentLine || { bidprice: "", discprice: "", promised_date: "" });
                                        }
                                        autoSaveTotals();
                                      }}
                                      data-testid={`input-line-disc-${line.id}`}
                                    />
                                  )}
                                </TableCell>
                              </>}
                            <TableCell className="text-sm py-2">{line.currency || currency}</TableCell>
                            <TableCell className="py-2 w-[170px] min-w-[170px] max-w-[170px]">
                              {isSubmitted || isProxySubmitted ? (
                                <span className="text-sm">{ld.promised_date ? formatDate(ld.promised_date) : "N/A"}</span>
                              ) : (
                                <Input
                                  type="date"
                                  className="w-full"
                                  value={ld.promised_date}
                                  min={new Date().toISOString().split("T")[0]}
                                  onChange={(e) => {
                                    const updated = { ...lineData[line.id], promised_date: e.target.value };
                                    setLineData((prev) => ({ ...prev, [line.id]: updated }));
                                    autoSaveLine(line.id, updated);
                                  }}
                                  data-testid={`input-line-date-${line.id}`}
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground py-2">
                              {formatDate(line.attribute_1) || "N/A"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="mt-4">
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">All prices quoted should be excluding applicable taxes. Also note that Discount price is the discount amount to be deducted from the quoted price and the final Price. Also ensure that your gross total price when submitting your quote is not zero.</p>
              </div>

              <div className="mt-4 flex flex-col items-end gap-1.5 text-[0.9rem]">
                <div className="flex items-center gap-3">
                  <span className="font-medium">Total Amount:</span>
                  <span className="w-36 text-right" data-testid="text-total-amount">{formatCurrency(totals.totalAmt, currency)}</span>
                </div>
                {data.response?.tax_included!== "Yes" && <div className="flex items-center gap-3">
                  <span className="font-medium">Discount Amount:</span>
                  <span className="w-36 text-right" data-testid="text-discount-amount">{formatCurrency(totals.totalDisc, currency)}</span>
                </div>}
                <div className="flex items-center gap-3">
                  <span className="font-medium">Tax Amount:</span>
                  <span className="w-36 text-right" data-testid="text-tax-amount">{formatCurrency(totals.totalTax, currency)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">Net Total Amount:</span>
                  <span className="font-semibold w-36 text-right" data-testid="text-gross-total">{formatCurrency(totals.gross, currency)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">Amount in Words:</span>
                  <span className="text-muted-foreground" data-testid="text-amount-words">{totals.amountInWords}</span>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-1">Comments</p>
                {isSubmitted || isProxySubmitted ? (
                  <p className="text-sm">{comments || "-"}</p>
                ) : (
                  <Textarea
                    placeholder="Add comments about your financial response..."
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    onBlur={(e) => autoSaveTotals(e.target.value)}
                    className="resize-none"
                    rows={3}
                    data-testid="input-comments"
                  />
                )}
              </div>

              <Separator className="my-4" />

              <div className="mt-6 pt-4 border-t">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <span className="text-sm font-semibold flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Financial Attachments
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">Attach financial specification documents related to Products / Services.</p>
                  </div>
                  {!isSubmitted && (
                    <Button size="sm" variant="outline" onClick={() => setShowFinAttachSheet(true)} data-testid="button-attach-fin-document">
                      <Plus className="h-4 w-4 mr-2" />
                      Attach Document
                    </Button>
                  )}
                </div>
                {(() => {
                  const finAttachments = (attachments || []).filter((a: any) => a.attach_source === "Financial");
                  return finAttachments.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm">No documents attached yet</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                        <TableHeader>
                          <TableRow>
                            <TableHead>File Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Last Updated By</TableHead>
                            <TableHead>Last Updated Date</TableHead>
                            <TableHead>Status</TableHead>
                            {!isSubmitted && <TableHead className="w-10"></TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {finAttachments.map((att: any) => (
                            <TableRow key={att.id} data-testid={`row-fin-attachment-${att.id}`}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                  {att.attach_path ? (
                                    <a
                                      href={`/api/dbo/suppbids/response/${responseId}/attachments/${att.id}/download`}
                                      download
                                      className="font-medium text-sm text-primary hover:underline cursor-pointer"
                                      data-testid={`link-download-fin-attachment-${att.id}`}
                                    >
                                      {att.attach_name}
                                    </a>
                                  ) : (
                                    <span className="font-medium text-sm">{att.attach_name}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{att.attach_desc || "-"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{att.created_by || "-"}</TableCell>
                              <TableCell className="text-sm">{formatDate(att.created_date)}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">Active</Badge>
                              </TableCell>
                              {!isSubmitted && (
                                <TableCell>
                                  <Button variant="ghost" size="icon"
                                    onClick={() => deleteAttachmentMutation.mutate(att.id)}
                                    data-testid={`button-delete-fin-attachment-${att.id}`}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })()}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="dialog-title-submit">Confirm Submission</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Are you sure you want to submit your bid response? Once submitted, you will not be able to make changes.</p>
                <div className="bg-muted/50 rounded-md p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Amount:</span>
                    <span className="font-medium text-foreground">{formatCurrency(totals.totalAmt, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discount Amount:</span>
                    <span className="font-medium text-foreground">{formatCurrency(totals.totalDisc, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax Amount:</span>
                    <span className="font-medium text-foreground">{formatCurrency(totals.totalTax, currency)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="font-semibold text-foreground">Gross Total:</span>
                    <span className="font-semibold text-foreground">{formatCurrency(totals.gross, currency)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{totals.amountInWords}</div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-submit">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              data-testid="button-confirm-submit"
            >
              {submitMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {submitMutation.isPending ? "Submitting..." : "Submit Response"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={showTechAttachSheet} onOpenChange={(open) => {
        setShowTechAttachSheet(open);
        if (!open) { setTechAttachForm({ attach_name: "", attach_desc: "", attach_type: "application/pdf" }); setSelectedTechFile(null); }
      }}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Attach Technical Document
            </SheetTitle>
            <SheetDescription>
              Attach a technical specification document to your bid response.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-6 pt-2 pb-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="tech-attach-desc">Description</Label>
                <Input id="tech-attach-desc" value={techAttachForm.attach_desc} onChange={e => setTechAttachForm(f => ({ ...f, attach_desc: e.target.value }))}
                  placeholder="Enter description"
                  data-testid="input-tech-attach-desc" />
              </div>
              <div>
                <Label htmlFor="tech-attach-file">Attach File</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="tech-attach-file"
                    value={techAttachForm.attach_name}
                    readOnly
                    placeholder="No File Chosen"
                    className="flex-1"
                    data-testid="input-tech-attach-name"
                  />
                  <Input
                    type="file"
                    className="hidden"
                    ref={techFileInputRef}
                    data-testid="file-input-tech-attach"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 5 * 1024 * 1024) {
                          toast({ title: "File Too Large", description: "Maximum allowed size is 5MB.", variant: "destructive" });
                          e.target.value = "";
                          return;
                        }
                        setSelectedTechFile(file);
                        setTechAttachForm(f => ({ ...f, attach_name: file.name, attach_type: file.type || "application/octet-stream" }));
                      }
                    }}
                  />
                  <Button variant="default" onClick={() => techFileInputRef.current?.click()} data-testid="button-select-tech-file">
                    Select
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Maximum allowed size is 5MB</p>
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setShowTechAttachSheet(false)} data-testid="button-cancel-tech-attach">
                Cancel
              </Button>
              <Button onClick={() => {
                if (!techAttachForm.attach_desc) {
                  toast({ title: "Required", description: "Description is required.", variant: "destructive" });
                  return;
                }
                if (!techAttachForm.attach_name || !selectedTechFile) {
                  toast({ title: "Required", description: "Please select a file.", variant: "destructive" });
                  return;
                }
                const formData = new FormData();
                formData.append("file", selectedTechFile);
                formData.append("attach_desc", techAttachForm.attach_desc);
                formData.append("attach_name", techAttachForm.attach_name);
                formData.append("attach_type", techAttachForm.attach_type);
                addAttachmentMutation.mutate({ formData, source: "Technical" });
              }} disabled={addAttachmentMutation.isPending} data-testid="button-submit-tech-attach">
                {addAttachmentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Attach
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showFinAttachSheet} onOpenChange={(open) => {
        setShowFinAttachSheet(open);
        if (!open) { setFinAttachForm({ attach_name: "", attach_desc: "", attach_type: "application/pdf" }); setSelectedFinFile(null); }
      }}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Attach Financial Document
            </SheetTitle>
            <SheetDescription>
              Attach a financial specification document to your bid response.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-6 pt-2 pb-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="fin-attach-desc">Description</Label>
                <Input id="fin-attach-desc" value={finAttachForm.attach_desc} onChange={e => setFinAttachForm(f => ({ ...f, attach_desc: e.target.value }))}
                  placeholder="Enter description"
                  data-testid="input-fin-attach-desc" />
              </div>
              <div>
                <Label htmlFor="fin-attach-file">Attach File</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="fin-attach-file"
                    value={finAttachForm.attach_name}
                    readOnly
                    placeholder="No File Chosen"
                    className="flex-1"
                    data-testid="input-fin-attach-name"
                  />
                  <Input
                    type="file"
                    className="hidden"
                    ref={finFileInputRef}
                    data-testid="file-input-fin-attach"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 5 * 1024 * 1024) {
                          toast({ title: "File Too Large", description: "Maximum allowed size is 5MB.", variant: "destructive" });
                          e.target.value = "";
                          return;
                        }
                        setSelectedFinFile(file);
                        setFinAttachForm(f => ({ ...f, attach_name: file.name, attach_type: file.type || "application/octet-stream" }));
                      }
                    }}
                  />
                  <Button variant="default" onClick={() => finFileInputRef.current?.click()} data-testid="button-select-fin-file">
                    Select
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Maximum allowed size is 5MB</p>
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setShowFinAttachSheet(false)} data-testid="button-cancel-fin-attach">
                Cancel
              </Button>
              <Button onClick={() => {
                if (!finAttachForm.attach_desc) {
                  toast({ title: "Required", description: "Description is required.", variant: "destructive" });
                  return;
                }
                if (!finAttachForm.attach_name || !selectedFinFile) {
                  toast({ title: "Required", description: "Please select a file.", variant: "destructive" });
                  return;
                }
                const formData = new FormData();
                formData.append("file", selectedFinFile);
                formData.append("attach_desc", finAttachForm.attach_desc);
                formData.append("attach_name", finAttachForm.attach_name);
                formData.append("attach_type", finAttachForm.attach_type);
                addAttachmentMutation.mutate({ formData, source: "Financial" });
              }} disabled={addAttachmentMutation.isPending} data-testid="button-submit-fin-attach">
                {addAttachmentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Attach
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
