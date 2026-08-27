import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  Ban,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Gavel,
  HandshakeIcon,
  MessageSquare,
  Search,
  Send,
  Timer,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";

interface SupplierBidResponse {
  id: number;
  bidRefNo: number;
  supplierId: number;
  bidTitle: string;
  bidType: string;
  bidStartDate: string | null;
  bidEndDate: string | null;
  supplierSite: string;
  status: string;
  createdBy: string;
  creationDate: string | null;
  lastModifiedBy: string;
  lastUpdatedDate: string | null;
  bidTotal: number;
  supplierContact: string;
  supplierContactNo: string;
  supplierName: string;
  grossTotal: number;
  bidDiscount: number;
  version: number;
  recommended: string;
  isCommerciallySelected: string;
  isTechnicallySelected: string;
  bidNumber: string;
  currency: string;
  departmentName: string;
  buyerName: string;
  deliveryLocation: string;
  bidStatus: string;
}

interface PendingBid {
  id: number;
  bidTitle: string;
  type: string;
  bidStatus: string;
  startDate: string | null;
  endDate: string | null;
  bidNumber: string;
  currency: string;
  departmentName: string;
  buyerName: string;
  description: string;
  deliveryLocation: string;
  inviteId: number;
  inviteStatus: string;
  invitedDate: string | null;
  ack_status: string;
}

const responseStatusConfig: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  "Draft": { label: "Draft", icon: FileText, variant: "secondary" },
  "Submitted": { label: "Submitted", icon: Send, variant: "default" },
  "Awarded": { label: "Awarded", icon: Award, variant: "secondary", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  "Rejected": { label: "Rejected", icon: Ban, variant: "destructive" },
  "Under Negotiation": { label: "Under Negotiation", icon: HandshakeIcon, variant: "outline", className: "border-orange-300 text-orange-600 dark:text-orange-400" },
  "Request Negotiation": { label: "Negotiation Requested", icon: MessageSquare, variant: "outline", className: "border-amber-300 text-amber-600 dark:text-amber-400" },
  "Closed": { label: "Closed", icon: CheckCircle2, variant: "secondary", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};

const bidTypeConfig: Record<string, { label: string; className: string }> = {
  "RFQ": { label: "RFQ", className: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
  "RFP": { label: "RFP", className: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
  "Tender": { label: "Tender", className: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" },
};

function StatusBadge({ status }: { status: string }) {
  const config = responseStatusConfig[status] || { label: status, icon: Clock, variant: "outline" as const };
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className={`gap-1 ${config.className || ""}`} data-testid={`status-badge-${status}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  const config = bidTypeConfig[type] || bidTypeConfig["RFQ"];
  return (
    <Badge variant="outline" className={`border-0 ${config.className}`} data-testid={`type-badge-${type}`}>
      {config.label}
    </Badge>
  );
}

function getTimeLeft(endDate: string | null): { label: string; urgent: boolean; closed: boolean } {
  if (!endDate) return { label: "-", urgent: false, closed: false };
  const now = new Date().getTime();
  const end = new Date(endDate).getTime();
  const diff = end - now;
  if (diff <= 0) return { label: "Bid Closed", urgent: false, closed: true };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return { label: `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`, urgent: days <= 2, closed: false };
  return { label: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`, urgent: true, closed: false };
}

function TimeLeftBadge({ endDate }: { endDate: string | null }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!endDate) return;
    const end = new Date(endDate).getTime();
    if (end - Date.now() <= 0) return;
    const interval = setInterval(() => {
      if (new Date(endDate).getTime() - Date.now() <= 0) {
        clearInterval(interval);
      }
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [endDate]);

  const tl = getTimeLeft(endDate);
  if (tl.label === "-") return <span className="text-sm text-muted-foreground">-</span>;
  if (tl.closed) {
    return (
      <Badge variant="secondary" className="gap-1 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" data-testid="badge-bid-closed">
        <XCircle className="h-3 w-3" />
        Bid Closed
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={`gap-1 font-mono ${tl.urgent ? "border-red-300 text-red-600 dark:text-red-400" : "border-emerald-300 text-emerald-600 dark:text-emerald-400"}`}
      data-testid="badge-time-left"
    >
      <Timer className="h-3 w-3" />
      {tl.label}
    </Badge>
  );
}

export default function SupplierBids() {
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const urlParams = new URLSearchParams(location.split("?")[1] || "");
  const statusFromUrl = urlParams.get("status") || "";
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: responses, isLoading, isError, error } = useQuery<SupplierBidResponse[]>({
    queryKey: ["/api/dbo/suppbids"],
  });

  const { data: pendingBids, isLoading: pendingLoading } = useQuery<PendingBid[]>({
    queryKey: ["/api/dbo/suppbids/pending"],
  });

  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingTypeFilter, setPendingTypeFilter] = useState<string>("all");
  const [pendingPage, setPendingPage] = useState(1);

  const filteredPendingBids = pendingBids?.filter((b) => {
    const matchesSearch = pendingSearch === "" ||
      b.bidTitle.toLowerCase().includes(pendingSearch.toLowerCase()) ||
      b.bidNumber.toLowerCase().includes(pendingSearch.toLowerCase()) ||
      b.departmentName.toLowerCase().includes(pendingSearch.toLowerCase()) ||
      b.buyerName.toLowerCase().includes(pendingSearch.toLowerCase());
    const matchesType = pendingTypeFilter === "all" || b.type === pendingTypeFilter;
    const matchesOpenFilter = statusFromUrl !== "Open" || b.bidStatus === "Published";
    return matchesSearch && matchesType && matchesOpenFilter;
  }) || [];

  const pendingTotalPages = Math.ceil(filteredPendingBids.length / pageSize) || 1;
  const pagedPendingBids = filteredPendingBids.slice((pendingPage - 1) * pageSize, pendingPage * pageSize);

  if (isError) {
    const errMsg = (error as any)?.message || "";
    const isForbidden = errMsg.includes("403") || errMsg.includes("Forbidden");
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <Ban className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <h3 className="text-base font-medium mb-1">
                {isForbidden ? "Access Denied" : "Failed to load bid responses"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isForbidden
                  ? "This page is only accessible to supplier users."
                  : "An error occurred while loading your bid responses. Please try again later."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredResponses = responses?.filter((r) => {
    const matchesSearch = search === "" ||
      r.bidTitle.toLowerCase().includes(search.toLowerCase()) ||
      r.bidNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.bidType.toLowerCase().includes(search.toLowerCase()) ||
      r.supplierSite.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || r.bidType === typeFilter;
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    const matchesOpenFilter = statusFromUrl !== "Open" || r.bidStatus === "Published";
    return matchesSearch && matchesType && matchesStatus && matchesOpenFilter;
  }) || [];

  const stats = {
    total: responses?.length || 0,
    draft: responses?.filter(r => r.status === "Draft").length || 0,
    submitted: responses?.filter(r => r.status === "Submitted").length || 0,
    awarded: responses?.filter(r => r.status === "Awarded").length || 0,
    underNegotiation: responses?.filter(r => r.status === "Under Negotiation" || r.status === "Request Negotiation").length || 0,
  };

  const totalPages = Math.ceil(filteredResponses.length / pageSize) || 1;
  const pagedResponses = filteredResponses.slice((page - 1) * pageSize, page * pageSize);

  const statCards = [
    { title: "Total Responses", value: stats.total, icon: Gavel, color: "text-primary", bgColor: "bg-primary/10" },
    { title: "Draft", value: stats.draft, icon: FileText, color: "text-slate-500", bgColor: "bg-slate-100 dark:bg-slate-800" },
    { title: "Submitted", value: stats.submitted, icon: Send, color: "text-blue-600", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
    { title: "Awarded", value: stats.awarded, icon: Award, color: "text-emerald-600", bgColor: "bg-emerald-100 dark:bg-emerald-900/30" },
    { title: "Negotiation", value: stats.underNegotiation, icon: HandshakeIcon, color: "text-orange-500", bgColor: "bg-orange-100 dark:bg-orange-900/30" },
  ];

  const getExportData = (rows: SupplierBidResponse[]) => {
    return rows.map((r) => ({
      "Bid Number": r.bidNumber || "",
      "Title": r.bidTitle || "",
      "Type": r.bidType || "",
      "Status": r.status || "",
      "Supplier Site": r.supplierSite || "",
      "Bid Total": r.bidTotal || "",
      "Gross Total": r.grossTotal || "",
      "Discount": r.bidDiscount || "",
      "Currency": r.currency || "",
      "Department": r.departmentName || "",
      "Buyer": r.buyerName || "",
      "Delivery Location": r.deliveryLocation || "",
      "Start Date": r.bidStartDate ? new Date(r.bidStartDate).toLocaleDateString() : "",
      "End Date": r.bidEndDate ? new Date(r.bidEndDate).toLocaleDateString() : "",
      "Submitted Date": r.creationDate ? new Date(r.creationDate).toLocaleDateString() : "",
    }));
  };

  const exportToCSV = () => {
    const data = getExportData(filteredResponses);
    if (data.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(","),
      ...data.map((row) =>
        headers.map((h) => `"${(row as Record<string, string | number>)[h] || ""}"`).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bid_responses_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast({ title: "Exported to CSV" });
  };

  const exportToExcel = () => {
    const data = getExportData(filteredResponses);
    if (data.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bid Responses");
    XLSX.writeFile(wb, `bid_responses_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Exported to Excel" });
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">My Bid Responses</h1>
          <p className="text-sm text-muted-foreground">View and manage your bid submissions</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {statCards.map((card) => (
          <Card key={card.title} className={`hover-elevate cursor-pointer transition-all ${(card.title === "Total Responses" && statusFilter === "all") || (card.title === "Negotiation" && statusFilter === "Under Negotiation") || statusFilter === card.title
            ? "ring-primary border-primary bg-primary/5"
            : ""
            }`} onClick={() => {
            if (card.title === "Draft") { setStatusFilter("Draft"); setPage(1); }
            else if (card.title === "Submitted") { setStatusFilter("Submitted"); setPage(1); }
            else if (card.title === "Awarded") { setStatusFilter("Awarded"); setPage(1); }
            else if (card.title === "Negotiation") { setStatusFilter("Under Negotiation"); setPage(1); }
            else { setStatusFilter("all"); setPage(1); }
          }}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                  {isLoading ? (
                    <Skeleton className="h-6 w-12 mt-1" />
                  ) : (
                    <p className="text-xl font-bold">{card.value}</p>
                  )}
                </div>
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <div className="p-3 border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5 text-orange-500" />
              <span className="font-semibold text-sm">Pending Bids - Awaiting Response</span>
              <Badge variant="secondary">{filteredPendingBids.length}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, bid number, department, buyer..."
                  value={pendingSearch}
                  onChange={(e) => { setPendingSearch(e.target.value); setPendingPage(1); }}
                  className="pl-8 h-8 text-sm"
                  data-testid="input-search-pending"
                />
              </div>
              <Select value={pendingTypeFilter} onValueChange={(v) => { setPendingTypeFilter(v); setPendingPage(1); }}>
                <SelectTrigger className="w-[130px] h-8 text-sm" data-testid="select-type-filter-pending">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="RFQ">RFQ</SelectItem>
                  <SelectItem value="RFP">RFP</SelectItem>
                  <SelectItem value="Tender">Tender</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Bid Number
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">Title</span>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Gavel className="h-3.5 w-3.5" />
                      Type
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      Delivery Location
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5" />
                      Time Left
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Invited On
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Participation
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : pagedPendingBids.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground/50" />
                        <span className="text-sm">
                          {pendingSearch || pendingTypeFilter !== "all"
                            ? "No matching bids found"
                            : "No pending bids - you have responded to all invited bids"}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedPendingBids.map((b) => (
                    <TableRow
                      key={b.inviteId}
                      className={`h-10 ${
                        (b.endDate && new Date(b.endDate).getTime() < Date.now()) ||
                          b.ack_status === "Not Participating"
                          ? "cursor-not-allowed"
                          : "cursor-pointer"
                        }`}
                      onClick={() => {
                        const isExpired =
                          b.endDate && new Date(b.endDate).getTime() < Date.now();
                        const isNotParticipating =
                          b.ack_status === "Not Participating";
                        if (!isExpired && !isNotParticipating) {
                          navigate(`/app/suppbids/${b.id}/view`);
                        }
                      }}
                      data-testid={`row-pending-bid-${b.id}`}
                    >
                      <TableCell className={`font-mono text-sm font-medium text-primary py-2 whitespace-nowrap ${
                        (b.endDate && new Date(b.endDate).getTime() < Date.now()) ||
                          b.ack_status === "Not Participating"
                          ? "text-gray-400 cursor-not-allowed"
                          : "text-primary cursor-pointer"
                        }`}>
                        {b.bidNumber || "-"}
                      </TableCell>
                      <TableCell className="py-2 whitespace-nowrap">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[150px] cursor-default">{b.bidTitle}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{b.bidTitle}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-2 whitespace-nowrap">
                        <TypeBadge type={b.type} />
                      </TableCell>
                      <TableCell className="py-2 text-sm whitespace-nowrap">{b.deliveryLocation || "-"}</TableCell>
                      <TableCell className="py-2 whitespace-nowrap">
                        <TimeLeftBadge endDate={b.endDate} />
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(b.invitedDate)}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground whitespace-nowrap">
                        {(b.endDate && new Date(b.endDate).getTime() < Date.now())
                          ? "Not Participating"
                          : b.ack_status ? b.ack_status : 'Not Responded'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filteredPendingBids.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {(pendingPage - 1) * pageSize + 1}-{Math.min(pendingPage * pageSize, filteredPendingBids.length)} of {filteredPendingBids.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPendingPage(pendingPage - 1)}
                  disabled={pendingPage <= 1}
                  data-testid="button-prev-page-pending"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm px-2">
                  Page {pendingPage} of {pendingTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPendingPage(pendingPage + 1)}
                  disabled={pendingPage >= pendingTotalPages}
                  data-testid="button-next-page-pending"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <div className="p-3 border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Gavel className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">Bid Responses</span>
              <Badge variant="secondary">{filteredResponses.length}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, bid number, type..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-8 h-8 text-sm"
                  data-testid="input-search-suppbids"
                />
              </div>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[130px] h-8 text-sm" data-testid="select-type-filter">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="RFQ">RFQ</SelectItem>
                  <SelectItem value="RFP">RFP</SelectItem>
                  <SelectItem value="Tender">Tender</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[180px] h-8 text-sm" data-testid="select-status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Submitted">Submitted</SelectItem>
                  <SelectItem value="Awarded">Awarded</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                  <SelectItem value="Under Negotiation">Under Negotiation</SelectItem>
                  <SelectItem value="Request Negotiation">Negotiation Requested</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8" data-testid="button-export">
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportToCSV} data-testid="menu-export-csv">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToExcel} data-testid="menu-export-excel">
                    <FileDown className="h-4 w-4 mr-2" />
                    Export as Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">Response No</span>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Status
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">Title</span>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Bid Number
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Gavel className="h-3.5 w-3.5" />
                      Type
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      Delivery Location
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5" />
                      Time Left
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : pagedResponses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <Gavel className="h-12 w-12 text-muted-foreground/50 mb-3" />
                        <h3 className="text-base font-medium mb-1">No bid responses found</h3>
                        <p className="text-sm text-muted-foreground">
                          {search || typeFilter !== "all" || statusFilter !== "all"
                            ? "Try adjusting your search or filters"
                            : "You haven't responded to any bids yet"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedResponses.map((r) => (
                    <TableRow
                      key={r.id}
                      className={`h-10 ${
                        (r.bidStartDate && new Date(r.bidStartDate).getTime() > Date.now()) &&
                          r.status === "Draft"
                          ? "cursor-not-allowed"
                          : "cursor-pointer"
                        }`}
                      data-testid={`row-suppbid-${r.id}`}
                    > 
                      <TableCell className="font-mono text-sm font-medium py-2 whitespace-nowrap">
                        <span
                          className={`text-primary hover:underline${
                            (r.bidStartDate && new Date(r.bidStartDate).getTime() > Date.now()) &&
                              r.status === "Draft"
                              ? "text-gray-400 cursor-not-allowed"
                              : "cursor-pointer hover:underline"
                            }`}
                          onClick={() => {
                            const isBidOpened = r.bidStartDate && new Date(r.bidStartDate).getTime() <= Date.now();
                            const isBidClosed = r.bidEndDate && new Date(r.bidEndDate) < new Date();
                            if (isBidClosed) {
                              navigate(`/app/suppbids/${r.bidRefNo}/response/${r.id}/view`);
                            } else if (isBidOpened) {
                              navigate(`/app/suppbids/${r.bidRefNo}/response/${r.id}`);
                            } 
                          }}
                          data-testid={`link-response-${r.id}`}
                        >
                          {r.id}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 whitespace-nowrap">
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="py-2 whitespace-nowrap">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[150px] cursor-default">{r.bidTitle}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{r.bidTitle}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium py-2 whitespace-nowrap">
                        <span
                          className={`text-blue-600 ${
                            (r.bidStartDate && new Date(r.bidStartDate).getTime() > Date.now()) &&
                              r.status === "Draft"
                              ? "text-gray-400 cursor-not-allowed"
                              : "dark:text-blue-400 cursor-pointer hover:underline"
                            }`}
                          onClick={() => 
                            {const isBidOpened = r.bidStartDate && new Date(r.bidStartDate).getTime() <= Date.now();
                            if(isBidOpened) {
                            navigate(`/app/suppbids/${r.bidRefNo}/view`)
                            }}}
                          data-testid={`link-bid-${r.bidRefNo}`}
                        >
                          {r.bidNumber || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 whitespace-nowrap">
                        <TypeBadge type={r.bidType} />
                      </TableCell>
                      <TableCell className="py-2 text-sm whitespace-nowrap">{r.deliveryLocation || "-"}</TableCell>
                      <TableCell className="py-2 whitespace-nowrap">
                        <TimeLeftBadge endDate={r.bidEndDate} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filteredResponses.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredResponses.length)} of {filteredResponses.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
