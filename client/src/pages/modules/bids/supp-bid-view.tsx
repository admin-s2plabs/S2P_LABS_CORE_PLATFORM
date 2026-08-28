import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FmpSupplierHint, type SupplierFmpView } from "@/components/fmpi/fmp-supplier-hint";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Download,
  File,
  FileText,
  Gavel,
  Mail, MapPin,
  Package,
  Paperclip,
  Scale, ScrollText,
  Timer,
  User
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import TermsConditions from "../common/terms-conditions";

function formatDateTime(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatCurrency(amount: number | string | null, currency?: string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!num && num !== 0) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: currency || "AED", maximumFractionDigits: 2,
  }).format(num);
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

const inviteStatusConfig: Record<string, { label: string; className: string }> = {
  Invited: { label: "Invited", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  Acknowledged: { label: "Acknowledged", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  Participating: { label: "Participating", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  "Not Interested": { label: "Not Interested", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  Responded: { label: "Responded", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  Submitted: { label: "Submitted", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
};

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

export default function SupplierBidView() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/app/suppbids/:id/view");
  const bidId = params?.id;
  const { toast } = useToast();
  const [ackSheetOpen, setAckSheetOpen] = useState(false);
  const [ackType, setAckType] = useState("");
  const [ackNotes, setAckNotes] = useState("");
  const [ackTermsAccepted, setAckTermsAccepted] = useState(false);

  const authData = typeof window !== "undefined" ? localStorage.getItem("prokraya-auth") : null;
  const authParsed = authData ? JSON.parse(authData) : null;
  const isSupplier = authParsed.role === "vendor";

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

  const { data, isLoading, isError } = useQuery<{ bid: any; invite: any; hasResponse?: boolean; lines?: any[] }>({
    queryKey: ["/api/dbo/suppbids", bidId, "view"],
    enabled: !!bidId,
  });

  const lines = data?.lines;

  const { data: fmpData } = useQuery<{ enabled: boolean; lines: Record<string, SupplierFmpView> }>({
    queryKey: ["/api/dbo/suppbids", bidId, "fmp"],
    enabled: !!bidId,
  });
  const fmpLines = fmpData?.enabled ? fmpData.lines : undefined;

  const { data: requirements } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "requirements"],
    enabled: !!bidId,
  });

  const { data: clauses } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "clauses"],
    enabled: !!bidId,
  });

  const { data: attachments } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "attachments"],
    enabled: !!bidId,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/dbo/suppbids/${bidId}/acknowledge`, {
      acknowledgement_type: ackType,
      notes_to_buyer: ackNotes,
      terms_accepted: ackTermsAccepted,
    }),
    onSuccess: () => {
      toast({ title: "Bid Acknowledged", description: "You have acknowledged this bid invitation." });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppbids", bidId, "view"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppbids/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppbids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppbids/response"] });
      setAckSheetOpen(false);
      navigate("/app/suppbids");
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message || "Failed to acknowledge bid", variant: "destructive" });
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

  if (isError || !data?.bid) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Bid Not Found</h2>
            <p className="text-sm text-muted-foreground mb-4">The requested bid could not be found or you don't have access to it.</p>
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

  const bid = data.bid;
  const invite = data.invite;
  const bidType = bid.type || "RFQ";
  const typeConfig = bidTypeLabels[bidType] || bidTypeLabels["RFQ"];
  const bidNumber = bid.bid_number || bid.attribute_4 || `BID-${bid.id}`;
  const sConfig = statusConfig[bid.status] || statusConfig["Draft"];
  const effectiveInviteStatus = data?.hasResponse && invite?.status === "Invited" ? "Acknowledged" : invite?.status;
  const inviteConfig = inviteStatusConfig[effectiveInviteStatus] || inviteStatusConfig["Invited"];

  const termsClauses = clauses?.filter((c: any) => c.type === "terms") || [];
  const instructionsClauses = clauses?.filter((c: any) => c.type === "instructions") || [];

  const lineAttachments = (attachments || []).filter((a: any) => a.attach_source === "Lines" && a.status !== "Deleted");
  const requirementAttachments = (attachments || []).filter((a: any) => a.attach_source === "Requirements" && a.status !== "Deleted");
  const termsAttachments = (attachments || []).filter((a: any) => a.attach_source === "Terms" && a.status !== "Deleted");

  const techRequirements = (requirements || []).filter((r: any) => r.category !== "Finance");
  const finRequirements = (requirements || []).filter((r: any) => r.category === "Finance");
  const totalTechWeight = techRequirements.reduce((sum: number, r: any) => sum + (parseInt(r.weight || "0", 10) || 0), 0);

  const canAcknowledge = invite?.status === "Invited" && !data?.hasResponse;

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
      
      <div className="flex items-center gap-3 flex-wrap" data-testid="breadcrumb-suppbids">
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
        <div className="ml-2">
          <CountdownTimer endDate={bid.enddate} />
        </div>
        <div className="ml-auto">
          {canAcknowledge && (
            <Button
              size="sm"
              onClick={() => setAckSheetOpen(true)}
              data-testid="button-acknowledge"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Acknowledge
            </Button>
          )}
        </div>
      </div>

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
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3" />
                Buyer
              </p>
              <p className="text-sm font-medium" data-testid="text-buyer-name">{bid.buyer_name || bid.buyer || "-"}</p>
              {bid.buyer_email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" />{bid.buyer_email}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <InfoItem label="Payment Terms" value={bid.paymentterms} icon={CreditCard} testId="text-payment-terms" />
            <InfoItem label="Delivery Location" value={bid.delivertto_location_name || bid.shiptoaddress} icon={MapPin} testId="text-delivery-location" />
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
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionHeader icon={Package} title="Scope of Work" count={lines?.length || 0} />
            {fmpLines && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 text-purple-900 border border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/60 text-xs font-medium whitespace-nowrap shadow-xs">
                <AlertCircle className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 shrink-0" aria-hidden="true" />
                <span>AI can make mistakes. Please verify.</span>
              </span>
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
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead>Need By From</TableHead>
                    <TableHead>Need By To</TableHead>
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
                        <FmpSupplierHint
                          fmp={fmpLines?.[String(line.id)]}
                          currency={bid?.currency || "INR"}
                          testId={`text-fmp-line-${line.id}`}
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className="text-xs">{line.linetype}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-2">{line.product_category || "-"}</TableCell>
                      <TableCell className="text-sm text-right font-mono py-2">{line.quantity}</TableCell>
                      <TableCell className="text-sm py-2">{line.uom}</TableCell>
                      <TableCell className="text-sm text-muted-foreground py-2">{formatDate(line.needbyfrom)}</TableCell>
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
        <CardContent className="px-4 pb-4 pt-3">
          <Tabs defaultValue={!isSupplier ? "criteria" : "terms"} data-testid="tabs-evaluation">
            <TabsList className="w-full justify-start" data-testid="tabs-list-evaluation">
              {!isSupplier && <TabsTrigger value="criteria" className="gap-1.5" data-testid="tab-criteria">
                <Scale className="h-3.5 w-3.5" />
                Evaluation Criteria
                {requirements && requirements.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">{requirements.length}</Badge>
                )}
              </TabsTrigger>}
              <TabsTrigger value="terms" className="gap-1.5" data-testid="tab-terms">
                <ScrollText className="h-3.5 w-3.5" />
                Terms & Instructions
                {(termsClauses.length + instructionsClauses.length) > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">{termsClauses.length + instructionsClauses.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

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

      <Sheet open={ackSheetOpen} onOpenChange={(open) => {
        if (!open) {
          setAckSheetOpen(false);
          setAckType("");
          setAckNotes("");
          setAckTermsAccepted(false);
        }
      }}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Bid Acknowledge</SheetTitle>
            <SheetDescription>
              Please fill in the required details to acknowledge this bid.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="ack-type">
                Acknowledgement Type <span className="text-destructive">*</span>
              </Label>
              <Select value={ackType} onValueChange={setAckType}>
                <SelectTrigger id="ack-type" data-testid="select-ack-type">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Participating">Participating</SelectItem>
                  <SelectItem value="Not Participating">Not Participating</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ack-notes">
                Notes to Buyer <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="ack-notes"
                placeholder="Enter Notes to Buyer"
                value={ackNotes}
                onChange={(e) => setAckNotes(e.target.value)}
                rows={4}
                data-testid="textarea-ack-notes"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ack-terms"
                checked={ackTermsAccepted}
                onCheckedChange={(checked) => setAckTermsAccepted(checked === true)}
                data-testid="checkbox-ack-terms"
              />
              <Label htmlFor="ack-terms" className="text-sm font-normal cursor-pointer">
                Read and Accept{' '}
                <TermsConditions type="Bid Acknowledge - Supplier" className="text-primary font-medium" dataTestId="link-terms" />
              </Label>
            </div>
          </div>
          <SheetFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setAckSheetOpen(false)}
              data-testid="button-cancel-ack"
            >
              Cancel
            </Button>
            <Button
              onClick={() => acknowledgeMutation.mutate()}
              disabled={acknowledgeMutation.isPending || !ackType || !ackNotes.trim() || !ackTermsAccepted}
              data-testid="button-submit-ack"
            >
              {acknowledgeMutation.isPending ? "Processing..." : "Submit"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

    </div>
  );
}
