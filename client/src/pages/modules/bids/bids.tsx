import { StatusCountBadges } from "@/components/status-count-badges";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import {
  matchesStatusFilter,
  parseStatusFilter,
} from "@shared/status-filter";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  Ban,
  Building2,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileDown,
  FileSpreadsheet,
  FileText,
  Gavel,
  Plus,
  Search,
  Send,
  ThumbsDown,
  ThumbsUp,
  Timer,
  Upload,
  User,
  Users,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import * as XLSX from "xlsx";
import BidFormSheet from "./bid-form-sheet";

interface BidSupplier {
  id: number;
  supplier_name: string;
  supplier_contact: string;
  supplier_contact_email: string;
  supplier_contact_no: string;
  status: string;
  creation_date: string | null;
}

type SupplierSheetType = "invited" | "acknowledged" | "responded" | null;

interface DboBid {
  id: number;
  currentApprover: string | null;
  bidTitle: string;
  type: string;
  status: string;
  description: string;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  createdBy: string;
  createdDate: string | null;
  lastUpdatedBy: string | null;
  lastUpdatedDate: string | null;
  buyer: string;
  buyerEmail: string;
  buyerName: string;
  departmentName: string;
  prNumber: string;
  prAmount: number;
  awardAmount: number;
  awardedAmount: number;
  noInvitedSupps: number;
  bidAcknowledges: number;
  bidResponses: number;
  bidNumber: string;
  requestorName: string;
  bidStyle: string;
  deliverToLocation: string;
  paymentTerms: string;
  templateName: string;
  envOpenDate: string | null;
}

const bidStatusConfig: Record<
  string,
  {
    label: string;
    icon: typeof Clock;
    variant: "default" | "secondary" | "destructive" | "outline";
    className?: string;
  }
> = {
  Draft: { label: "Draft", icon: FileText, variant: "secondary" },
  Published: { label: "Published", icon: Send, variant: "default" },
  Closed: {
    label: "Closed",
    icon: CheckCircle2,
    variant: "secondary",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  Awarded: {
    label: "Awarded",
    icon: Award,
    variant: "secondary",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  Cancelled: { label: "Cancelled", icon: Ban, variant: "destructive" },
  "Award Under Process": {
    label: "Award Under Process",
    icon: Timer,
    variant: "outline",
    className: "border-orange-300 text-orange-600 dark:text-orange-400",
  },
  "Pending Approval": {
    label: "Pending Approval",
    icon: Clock,
    variant: "outline",
    className: "border-orange-300 text-orange-600 dark:text-orange-400",
  },
};

const bidTypeConfig: Record<string, { label: string; className: string }> = {
  RFQ: {
    label: "RFQ",
    className:
      "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  },
  RFP: {
    label: "RFP",
    className:
      "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  },
  Tender: {
    label: "Tender",
    className:
      "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  },
};

/** Rows in these statuses are listed under the Published (active) section. */
const PUBLISHED_BID_SECTION_STATUSES: readonly string[] = [
  "Published",
  "Closed",
  "Negotiation",
  "Awarded",
  "Cancelled",
  "Pending Approval",
  "On Hold",
  "Award Under Process",
  "Finalize",
  "Under Negotiation",
  "Rejected",
];

function StatusBadge({ status }: { status: string }) {
  const config = bidStatusConfig[status] || {
    label: status,
    icon: Clock,
    variant: "outline" as const,
  };
  const Icon = config.icon;
  return (
    <Badge
      variant={config.variant}
      className={`gap-1 ${config.className || ""}`}
      data-testid={`status-badge-${status}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  const config = bidTypeConfig[type] || bidTypeConfig["RFQ"];
  return (
    <Badge
      variant="outline"
      className={`border-0 ${config.className}`}
      data-testid={`type-badge-${type}`}
    >
      {config.label}
    </Badge>
  );
}

function getTimeLeft(endDate: string | null): {
  label: string;
  urgent: boolean;
  closed: boolean;
} {
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
  if (days > 0)
    return {
      label: `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
      urgent: days <= 2,
      closed: false,
    };
  return {
    label: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    urgent: true,
    closed: false,
  };
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
  if (tl.label === "-")
    return <span className="text-sm text-muted-foreground">-</span>;
  if (tl.closed) {
    return (
      <Badge
        variant="secondary"
        className="gap-1 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
        data-testid="badge-bid-closed"
      >
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

export default function Bids() {
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const queryParams = new URLSearchParams(location.split("?")[1] || "");
  const initialTypeFilter = queryParams.get("type") || "all";
  const initialStatus = queryParams.get("status") || "all";
  const initialSearch = queryParams.get("search") || "";
  const initialActivePage = parseInt(queryParams.get("page") || "1", 10) || 1;
  const initialDraftPage =
    parseInt(queryParams.get("draftPage") || "1", 10) || 1;

  const [search, setSearch] = useState(initialSearch);
  const [publishedTypeFilter, setPublishedTypeFilter] =
    useState<string>(initialTypeFilter);
  const [draftTypeFilter, setDraftTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [draftStatusFilter, setDraftStatusFilter] = useState<string>("all");
  const [activePage, setActivePage] = useState(initialActivePage);
  const [draftPage, setDraftPage] = useState(initialDraftPage);
  const [listTab, setListTab] = useState<"published" | "draft">("published");
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [supplierSheetOpen, setSupplierSheetOpen] = useState(false);
  const [supplierSheetType, setSupplierSheetType] =
    useState<SupplierSheetType>(null);
  const [supplierSheetBidId, setSupplierSheetBidId] = useState<number | null>(
    null,
  );
  const [supplierSheetBidNumber, setSupplierSheetBidNumber] = useState("");

  useEffect(() => {
    const qp = new URLSearchParams(location.split("?")[1] || "");
    const st = qp.get("status") || "all";
    if (st === "all") return;
    const statuses = parseStatusFilter(st);
    const hasPublished = statuses.some((s) =>
      PUBLISHED_BID_SECTION_STATUSES.includes(s),
    );
    const hasDraft = statuses.some(
      (s) => !PUBLISHED_BID_SECTION_STATUSES.includes(s),
    );
    if (hasPublished) {
      setStatusFilter(st);
      setListTab("published");
      if (!hasDraft) setDraftStatusFilter("all");
    }
    if (hasDraft) {
      setDraftStatusFilter(st);
      setListTab("draft");
      if (!hasPublished) setStatusFilter("all");
    }
  }, [location]);

  const authData =
    typeof window !== "undefined"
      ? localStorage.getItem("prokraya-auth")
      : null;
  const authParsed = authData ? JSON.parse(authData) : null;
  const currentUserName = authParsed?.userNameId?.toLowerCase() || "";
  const isSuperadmin = authParsed?.userRole === "ROLE_SUPERADMIN" || authParsed?.userRole === "ROLE_SYSADMIN";

  const { data: bids, isLoading } = useQuery<DboBid[]>({
    queryKey: ["/api/dbo/bids"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const supplierEndpoint =
    supplierSheetType === "acknowledged"
      ? "acknowledgements"
      : supplierSheetType === "responded"
        ? "responses"
        : "suppliers";

  const { data: sheetData, isLoading: suppliersLoading } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", supplierSheetBidId, supplierEndpoint],
    enabled: !!supplierSheetBidId && supplierSheetOpen,
  });

  const openSupplierSheet = (
    bidId: number,
    bidNumber: string,
    type: SupplierSheetType,
  ) => {
    setSupplierSheetBidId(bidId);
    setSupplierSheetBidNumber(bidNumber);
    setSupplierSheetType(type);
    setSupplierSheetOpen(true);
  };

  const sheetItems = sheetData || [];

  const supplierSheetTitle =
    supplierSheetType === "invited"
      ? "Invited Suppliers"
      : supplierSheetType === "acknowledged"
        ? "Acknowledged Suppliers"
        : "Responded Suppliers";

  const publishedStatuses = [...PUBLISHED_BID_SECTION_STATUSES];

  const publishedStatusOrder = [
    "Published",
    "Negotiation",
    "Award Under Process",
    "Awarded",
    "Closed",
    "Pending Approval",
    "Cancelled",
    "On Hold",
    "Finalize",
    "Under Negotiation",
    "Rejected",
  ] as const;

  const isPublishedBid = (status: string) => publishedStatuses.includes(status);

  const bidsMatchingSearch = useMemo(() => {
    if (!bids) return [];
    return bids.filter((bid) => {
      const matchesSearch =
        search === "" ||
        String(bid.id).includes(search) ||
        bid.bidTitle.toLowerCase().includes(search.toLowerCase()) ||
        bid.bidNumber.toLowerCase().includes(search.toLowerCase()) ||
        bid.departmentName.toLowerCase().includes(search.toLowerCase()) ||
        bid.prNumber.toLowerCase().includes(search.toLowerCase()) ||
        bid.buyerName.toLowerCase().includes(search.toLowerCase()) ||
        bid.status.toLowerCase().includes(search.toLowerCase()) ||
        bid.type.toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
    });
  }, [bids, search]);

  const publishedBidPool = useMemo(
    () =>
      bidsMatchingSearch
        .filter((b) => PUBLISHED_BID_SECTION_STATUSES.includes(b.status))
        .filter(
          (b) =>
            publishedTypeFilter === "all" || b.type === publishedTypeFilter,
        ),
    [bidsMatchingSearch, publishedTypeFilter],
  );

  const activeBids = useMemo(
    () =>
      publishedBidPool.filter(
        (bid) => matchesStatusFilter(bid.status, statusFilter),
      ),
    [publishedBidPool, statusFilter],
  );

  const draftPool = useMemo(
    () =>
      bidsMatchingSearch
        .filter((b) => !PUBLISHED_BID_SECTION_STATUSES.includes(b.status))
        .filter(
          (b) => draftTypeFilter === "all" || b.type === draftTypeFilter,
        ),
    [bidsMatchingSearch, draftTypeFilter],
  );

  /** Draft rows matching search only — used so type badge counts stay visible for every type. */
  const draftBidsMatchingSearchOnly = useMemo(() => {
    if (!bids) return [];
    return bids.filter((bid) => {
      if (PUBLISHED_BID_SECTION_STATUSES.includes(bid.status)) return false;
      const matchesSearch =
        search === "" ||
        String(bid.id).includes(search) ||
        bid.bidTitle.toLowerCase().includes(search.toLowerCase()) ||
        bid.bidNumber.toLowerCase().includes(search.toLowerCase()) ||
        bid.departmentName.toLowerCase().includes(search.toLowerCase()) ||
        bid.prNumber.toLowerCase().includes(search.toLowerCase()) ||
        bid.buyerName.toLowerCase().includes(search.toLowerCase()) ||
        bid.type.toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
    });
  }, [bids, search]);

  const draftBids = useMemo(
    () =>
      draftPool.filter(
        (bid) => matchesStatusFilter(bid.status, draftStatusFilter),
      ),
    [draftPool, draftStatusFilter],
  );

  const publishedBidsMatchingSearchOnly = useMemo(
    () =>
      bidsMatchingSearch.filter((b) =>
        PUBLISHED_BID_SECTION_STATUSES.includes(b.status),
      ),
    [bidsMatchingSearch],
  );

  const publishedTypeBadgeItems = useMemo(
    () =>
      (["RFQ", "RFP", "Tender"] as const).map((t) => ({
        value: t,
        label: t,
        count: publishedBidsMatchingSearchOnly.filter((b) => b.type === t)
          .length,
      })),
    [publishedBidsMatchingSearchOnly],
  );

  const draftTypeBadgeItems = useMemo(
    () =>
      (["RFQ", "RFP", "Tender"] as const).map((t) => ({
        value: t,
        label: t,
        count: draftBidsMatchingSearchOnly.filter((b) => b.type === t).length,
      })),
    [draftBidsMatchingSearchOnly],
  );

  const statCards = useMemo(() => {
    const list = bids ?? [];
    const total = list.length;
    const draftCount = list.filter((b) => !isPublishedBid(b.status)).length;

    const publishedCards = publishedStatusOrder.map((status) => {
      const cfg = bidStatusConfig[status];
      const Icon = cfg?.icon ?? FileText;
      let color = "text-slate-600";
      let bgColor = "bg-slate-100 dark:bg-slate-800";
      if (status === "Published") {
        color = "text-green-600";
        bgColor = "bg-green-100 dark:bg-green-900/30";
      } else if (status === "Awarded") {
        color = "text-blue-600";
        bgColor = "bg-blue-100 dark:bg-blue-900/30";
      } else if (status === "Closed" || status === "Pending Approval") {
        color = "text-orange-500";
        bgColor = "bg-orange-100 dark:bg-orange-900/30";
      }else if (status === "Negotiation") {
        color = "text-orange-500";
        bgColor = "bg-orange-100 dark:bg-orange-900/30";
      } else if (status === "Cancelled" || status === "Rejected") {
        color = "text-destructive";
        bgColor = "bg-destructive/10";
      } else if (
        status === "Award Under Process" ||
        status === "Under Negotiation"
      ) {
        color = "text-orange-600";
        bgColor = "bg-orange-100 dark:bg-orange-900/30";
      } else if (status === "On Hold") {
        color = "text-amber-600";
        bgColor = "bg-amber-100 dark:bg-amber-900/30";
      } else if (status === "Finalize") {
        color = "text-violet-600";
        bgColor = "bg-violet-100 dark:bg-violet-900/30";
      }
      return {
        title:
          status === "Award Under Process"
            ? "Award process"
            : status,
        value: list.filter((b) => b.status === status).length,
        icon: Icon,
        color,
        bgColor,
        kind: "publishedStatus" as const,
        publishedStatus: status,
      };
    });

    return [
      {
        title: "Total Bids",
        value: total,
        icon: Gavel,
        color: "text-primary",
        bgColor: "bg-primary/10",
        kind: "total" as const,
      },
      {
        title: "Draft",
        value: draftCount,
        icon: FileText,
        color: "text-slate-500",
        bgColor: "bg-slate-100 dark:bg-slate-800",
        kind: "draftAll" as const,
      },
      ...publishedCards,
    ];
  }, [bids]);

  const activePageCount = Math.ceil(activeBids.length / pageSize) || 1;
  const draftPageCount = Math.ceil(draftBids.length / pageSize) || 1;
  const pagedActiveBids = activeBids.slice(
    (activePage - 1) * pageSize,
    activePage * pageSize,
  );
  const pagedDraftBids = draftBids.slice(
    (draftPage - 1) * pageSize,
    draftPage * pageSize,
  );

  const getExportData = (rows: DboBid[]) => {
    return rows.map((bid) => ({
      "Bid Number": bid.bidNumber || "",
      Title: bid.bidTitle || "",
      Type: bid.type || "",
      Status: bid.status || "",
      Department: bid.departmentName || "",
      "PR Number": bid.prNumber || "",
      Buyer: bid.buyerName || "",
      Requestor: bid.requestorName || "",
      Amount: bid.prAmount || "",
      Currency: bid.currency || "",
      "Invited Suppliers": bid.noInvitedSupps || 0,
      Responses: bid.bidResponses || 0,
      "Start Date": bid.startDate
        ? formatDate(bid.startDate)
        : "",
      "End Date": bid.endDate ? formatDate(bid.endDate) : "",
      "Created Date": bid.createdDate
        ? formatDate(bid.createdDate)
        : "",
    }));
  };

  const exportToCSV = (bids: DboBid[], type: "published" | "draft") => {
    const data = getExportData(bids);
    if (data.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((h) => `"${(row as Record<string, string | number>)[h] || ""}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}_bids_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast({ title: "Exported to CSV" });
  };

  const exportToExcel = (bids: DboBid[], type: "published" | "draft") => {
    const data = getExportData(bids);
    if (data.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bids");
    XLSX.writeFile(wb, `${type}_bids_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Exported to Excel" });
  };

  const renderBidTable = (
    rows: DboBid[],
    page: number,
    totalPages: number,
    totalCount: number,
    onPageChange: (p: number) => void,
    emptyMessage: string,
    emptyIcon: typeof Gavel,
    tableId: string = "active",
  ) => {
    const EmptyIcon = emptyIcon;
    const isDraft = tableId === "draft";
    return (
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-medium whitespace-nowrap">
                  <span className="flex items-center gap-1.5">#</span>
                </TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Bid Number
                  </span>
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
                    <Gavel className="h-3.5 w-3.5" />
                    Type
                  </span>
                </TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    PR Number
                  </span>
                </TableHead>
                {!isDraft && (
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5" />
                      Time Left
                    </span>
                  </TableHead>
                )}
                <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      Current Approver
                    </span>
                  </TableHead>
                {!isDraft && (
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center justify-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Invited Suppliers</TooltipContent>
                    </Tooltip>
                  </TableHead>
                )}
                {!isDraft && (
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center justify-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Acknowledged</TooltipContent>
                    </Tooltip>
                  </TableHead>
                )}
                {!isDraft && (
                  <TableHead className="text-xs font-medium text-center whitespace-nowrap">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center justify-center gap-1">
                          <Send className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Responses</TooltipContent>
                    </Tooltip>
                  </TableHead>
                )}
                {isDraft && (
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Gavel className="h-3.5 w-3.5" />
                      Bid Style
                    </span>
                  </TableHead>
                )}
                {!isDraft && (
                  <TableHead className="text-xs font-medium whitespace-nowrap">
                    Actions
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: isDraft ? 7 : 11 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isDraft ? 7 : 11}
                    className="text-center py-12 text-muted-foreground"
                  >
                    <div className="flex flex-col items-center justify-center">
                      <EmptyIcon className="h-12 w-12 text-muted-foreground/50 mb-3" />
                      <h3 className="text-base font-medium mb-1">
                        {emptyMessage}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {search ||
                          (isDraft
                            ? draftTypeFilter !== "all"
                            : publishedTypeFilter !== "all") ||
                          (!isDraft && statusFilter !== "all") ||
                          (isDraft && draftStatusFilter !== "all")
                          ? "Try adjusting your search or filters"
                          : "No bids available"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((bid) => {
                  const displayValue =
                    bid.awardedAmount || bid.awardAmount || bid.prAmount || 0;
                  return (
                    <TableRow
                      key={bid.id}
                      className="h-10"
                      data-testid={`row-bid-${bid.id}`}
                    >
                      <TableCell className="py-2 text-sm text-muted-foreground whitespace-nowrap">
                        {bid.id}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium py-2 whitespace-nowrap">
                        <Link
                          href={
                            bid.status === "Draft"
                              ? `/app/bids/${bid.id}`
                              : `/app/bids/${bid.id}/view`
                          }
                          className="text-primary hover:underline"
                          data-testid={`link-bid-${bid.id}`}
                        >
                          {bid.bidNumber || "-"}
                        </Link>
                      </TableCell>
                      <TableCell className="py-2 whitespace-nowrap">
                        <StatusBadge status={bid.status} />
                      </TableCell>
                      <TableCell className="py-2 whitespace-nowrap">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[150px] cursor-default">
                              {bid.bidTitle}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{bid.bidTitle}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-2 whitespace-nowrap">
                        <TypeBadge type={bid.type} />
                      </TableCell>
                      <TableCell className="py-2 text-sm whitespace-nowrap">
                        {bid.prNumber || "-"}
                      </TableCell>
                      {!isDraft && (
                        <TableCell className="py-2 whitespace-nowrap">
                          <TimeLeftBadge endDate={bid.endDate} />
                        </TableCell>
                      )}
                      <TableCell className="py-2 text-sm whitespace-nowrap">
                        {bid.currentApprover || "-"}
                      </TableCell>
                      {!isDraft && (
                        <TableCell className="py-2 text-sm text-center whitespace-nowrap">
                          <button
                            className="text-primary hover:underline font-medium cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              openSupplierSheet(
                                bid.id,
                                bid.bidNumber,
                                "invited",
                              );
                            }}
                            data-testid={`link-invited-${bid.id}`}
                          >
                            {bid.noInvitedSupps}
                          </button>
                        </TableCell>
                      )}
                      {!isDraft && (
                        <TableCell className="py-2 text-sm text-center whitespace-nowrap">
                          <button
                            className="text-primary hover:underline font-medium cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              if(bid.bidAcknowledges >= 1){
                                openSupplierSheet(
                                  bid.id,
                                  bid.bidNumber,
                                  "acknowledged",
                                );
                              } else {
                                toast({ title: "No suppliers participated!", variant: "destructive" });
                                return;
                              }
                            }}
                            data-testid={`link-acknowledged-${bid.id}`}
                          >
                            {bid.bidAcknowledges}
                          </button>
                        </TableCell>
                      )}
                      {!isDraft && (
                        <TableCell className="py-2 text-sm text-center whitespace-nowrap">
                          <button
                            className="text-primary hover:underline font-medium cursor-pointer"
                            onClick={(e) => {
                            if(bid.bidAcknowledges >= 1){
                                openSupplierSheet(
                                  bid.id,
                                  bid.bidNumber,
                                  "responded",
                                );
                              } else {
                                toast({ title: "No suppliers responded!", variant: "destructive" });
                                return;
                              }
                            }}
                            data-testid={`link-responded-${bid.id}`}
                          >
                            {bid.bidResponses}
                          </button>
                        </TableCell>
                      )}
                      {isDraft && (
                        <TableCell className="py-2 text-sm whitespace-nowrap">
                          {bid.bidStyle || "-"}
                        </TableCell>
                      )}
                      {!isDraft && (
                        <TableCell className="py-2 whitespace-nowrap">
                          {(() => {
                            const isBuyer =
                              bid.buyerEmail?.toLowerCase() === currentUserName;
                            const isNotPublishedOrCancelled =
                              bid.status !== "Published" &&
                              bid.status !== "Cancelled";
                            let showEvaluate = false;

                            if ((isBuyer || isSuperadmin) && isNotPublishedOrCancelled) {
                              if (bid.type === "Tender") {
                                const envOpenDate = bid.envOpenDate
                                  ? new Date(bid.envOpenDate)
                                  : null;
                                showEvaluate = envOpenDate
                                  ? new Date() > envOpenDate
                                  : false;
                              } else {
                                showEvaluate = true;
                              }
                            }

                            return showEvaluate ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                onClick={() =>
                                  navigate(`/app/bids/${bid.id}/evaluate`)
                                }
                                data-testid={`button-evaluate-${bid.id}`}
                              >
                                <ClipboardCheck className="h-3.5 w-3.5" />
                                {bid.status === "Awarded" ||
                                  bid.status === "Award Under Process"
                                  ? "Re Evaluate"
                                  : "Evaluate"}
                              </Button>
                            ) : null;
                          })()}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {totalCount > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * pageSize + 1}-
              {Math.min(page * pageSize, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={pageSize.toString()}
                onValueChange={(v) => {
                  setPageSize(parseInt(v));
                  setActivePage(1);
                }}
              >
                <SelectTrigger className="w-[70px] h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                data-testid={`button-prev-page-${tableId}`}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm px-2">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                data-testid={`button-next-page-${tableId}`}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    );
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">
            Bids
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage RFQs, RFPs, and Tenders
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {statCards.map((card) => (
          <Card
            key={card.title}
            className={`hover-elevate cursor-pointer transition-all ${
              (
                (card.title === "Award process" && statusFilter === "Award Under Process") ||
                (card.title === "Draft" && listTab === "draft" && statusFilter === "all") ||
                (card.title === "Total Bids" && listTab === "published" && statusFilter === "all") ||
                (
                  !["all", "Draft", "Total Bids", "Award process"].includes(
                    card.title
                  ) &&
                  statusFilter === card.title
                )
              )
                ? "ring-primary border-primary bg-primary/5"
                : ""
            }`}
            onClick={() => {
              if (card.kind === "total") {
                setListTab("published");
                setStatusFilter("all");
                setDraftStatusFilter("all");
                setPublishedTypeFilter("all");
                setDraftTypeFilter("all");
                setActivePage(1);
                setDraftPage(1);
              } else if (card.kind === "draftAll") {
                setListTab("draft");
                setStatusFilter("all");
                setDraftStatusFilter("all");
                setActivePage(1);
                setDraftPage(1);
              } else if (
                card.kind === "publishedStatus" &&
                card.publishedStatus
              ) {
                setListTab("published");
                setDraftStatusFilter("all");
                setStatusFilter(card.publishedStatus);
                setActivePage(1);
              }
            }}
          >
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
        <Tabs
          value={listTab}
          onValueChange={(v) => setListTab(v as "published" | "draft")}
          className="w-full"
        >
          <div className="p-3 border-b flex flex-wrap items-center justify-between gap-3">
            <TabsList className="h-9" data-testid="tabs-bid-list">
              <TabsTrigger value="published" className="gap-1.5 px-3" data-testid="tab-published-bids">
                <Gavel className="h-4 w-4" />
                Published
                <Badge variant="secondary" className="ml-0.5 font-normal tabular-nums">
                  {activeBids.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="draft" className="gap-1.5 px-3" data-testid="tab-draft-bids">
                <FileText className="h-4 w-4" />
                Draft
                <Badge variant="secondary" className="ml-0.5 font-normal tabular-nums">
                  {draftBids.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              data-testid="button-create-bid"
            >
              <Plus className="h-4 w-4 mr-1" />
              Create Bid
            </Button>
          </div>

          <TabsContent value="published" className="mt-0 focus-visible:ring-0 focus-visible:ring-offset-0">
            <div className="p-3 border-b space-y-2">
              <StatusCountBadges
                totalLabel="All Types"
                totalCount={publishedBidsMatchingSearchOnly.length}
                selected={publishedTypeFilter}
                loading={isLoading}
                onSelect={(v) => {
                  setPublishedTypeFilter(v);
                  setActivePage(1);
                }}
                items={publishedTypeBadgeItems}
              />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by ID, title, bid number, department, PR, buyer, status, type"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setActivePage(1);
                      setDraftPage(1);
                    }}
                    className="pl-8 h-8 text-sm"
                    data-testid="input-search-bids"
                  />
                </div>
                <Select
                  value={publishedTypeFilter}
                  onValueChange={(v) => {
                    setPublishedTypeFilter(v);
                    setActivePage(1);
                  }}
                >
                  <SelectTrigger
                    className="w-[130px] h-8 text-sm"
                    data-testid="select-type-filter"
                  >
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="RFQ">RFQ</SelectItem>
                    <SelectItem value="RFP">RFP</SelectItem>
                    <SelectItem value="Tender">Tender</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v);
                    setActivePage(1);
                  }}
                >
                  <SelectTrigger
                    className="w-[160px] h-8 text-sm"
                    data-testid="select-status-filter"
                  >
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="Published">Published</SelectItem>
                    <SelectItem value="Award Under Process">
                      Award Under Process
                    </SelectItem>
                    <SelectItem value="Awarded">Awarded</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                    <SelectItem value="Pending Approval">Pending Approval</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                    <SelectItem value="On Hold">On Hold</SelectItem>
                    <SelectItem value="Finalize">Finalize</SelectItem>
                    <SelectItem value="Under Negotiation">Under Negotiation</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      data-testid="button-export"
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => exportToCSV(activeBids, "published")}
                      data-testid="menu-export-csv"
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => exportToExcel(activeBids, "published")}
                      data-testid="menu-export-excel"
                    >
                      <FileDown className="h-4 w-4 mr-2" />
                      Export as Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {renderBidTable(
              pagedActiveBids,
              activePage,
              activePageCount,
              activeBids.length,
              setActivePage,
              "No published bids found",
              Gavel,
              "published",
            )}
          </TabsContent>

          <TabsContent value="draft" className="mt-0 focus-visible:ring-0 focus-visible:ring-offset-0">
            <div className="p-3 border-b space-y-2">
              <StatusCountBadges
                totalLabel="All Types"
                totalCount={draftBidsMatchingSearchOnly.length}
                selected={draftTypeFilter}
                loading={isLoading}
                onSelect={(v) => {
                  setDraftTypeFilter(v);
                  setDraftPage(1);
                  setDraftStatusFilter("all");
                }}
                items={draftTypeBadgeItems}
              />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by ID, title, bid number, PR, status, type..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setActivePage(1);
                      setDraftPage(1);
                    }}
                    className="pl-8 h-8 text-sm"
                    data-testid="input-search-drafts"
                  />
                </div>
                <Select
                  value={draftTypeFilter}
                  onValueChange={(v) => {
                    setDraftTypeFilter(v);
                    setActivePage(1);
                    setDraftPage(1);
                  }}
                >
                  <SelectTrigger
                    className="w-[130px] h-8 text-sm"
                    data-testid="select-type-filter-draft"
                  >
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="RFQ">RFQ</SelectItem>
                    <SelectItem value="RFP">RFP</SelectItem>
                    <SelectItem value="Tender">Tender</SelectItem>
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      data-testid="button-export-draft"
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => exportToCSV(draftBids, "draft")}
                      data-testid="menu-export-csv-draft"
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => exportToExcel(draftBids, "draft")}
                      data-testid="menu-export-excel-draft"
                    >
                      <FileDown className="h-4 w-4 mr-2" />
                      Export as Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {renderBidTable(
              pagedDraftBids,
              draftPage,
              draftPageCount,
              draftBids.length,
              setDraftPage,
              "No draft bids",
              FileText,
              "draft",
            )}
          </TabsContent>
        </Tabs>
      </Card>

      <BidFormSheet open={createOpen} onOpenChange={setCreateOpen} />

      <Sheet open={supplierSheetOpen} onOpenChange={setSupplierSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{supplierSheetTitle}</SheetTitle>
            <SheetDescription>
              {supplierSheetBidNumber ? `Bid: ${supplierSheetBidNumber}` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {suppliersLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-3 border rounded-md space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))
            ) : sheetItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No suppliers found</p>
              </div>
            ) : (
              sheetItems.map((item: any) => {
                const name = item.supplier_name || item.suppliername || "-";
                const contact =
                  item.supplier_contact || item.suppliercontact || "";
                const email = item.supplier_contact_email || "";
                const phone =
                  item.supplier_contact_no || item.suppliercontactno || "";
                const site = item.supplier_site || item.suppliersite || "";
                const status = item.status || "";
                const comments = item.comments || "";
                const total = item.grosstotal || item.bidtotal;
                const currency = item.currency;
                return (
                  <div
                    key={item.id}
                    className="flex justify-between items-center p-4 border rounded-lg shadow-sm bg-white"
                    data-testid={`supplier-card-${item.id}`}
                  >
                    <div className="space-y-2">
                      <span className="text-sm font-medium truncate">
                        {name}
                      </span>
                      {site && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Building2 className="h-3 w-3" />
                          {site}
                        </p>
                      )}
                      {contact && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <User className="h-3 w-3" />
                          {contact}
                        </p>
                      )}
                      {email && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Send className="h-3 w-3" />
                          {email}
                        </p>
                      )}
                      {phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          {phone}
                        </p>
                      )}
                      {/* {supplierSheetType === "acknowledged" && comments && (
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          "{comments}"
                        </p>
                      )} */}
                      {/* {supplierSheetType === "responded" && total != null && (
                        <p className="text-xs font-medium mt-1">
                          Total: {currency}{" "}
                          {Number(total).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      )} */}
                    </div>
                    {supplierSheetType === "responded" && (
                      <div className="flex items-center gap-1 text-xs text-medium text-green-600">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        Responded
                      </div>
                    )}
                    {supplierSheetType === "acknowledged" && status === "Participating" && (
                      <div className="flex items-center gap-1 text-xs text-medium text-green-600">
                        <ThumbsUp className="h-4 w-4 text-green-500" />
                        Acknowledged
                      </div>
                    )}
                    {supplierSheetType === "acknowledged" && status === "Submitted" && (
                      <div className="flex items-center gap-1 text-xs text-medium text-green-600">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        Responded
                      </div>
                    )}
                    {supplierSheetType === "acknowledged" && status === "Not Participating" && (
                      <div className="flex items-center gap-1 text-xs text-medium text-gray-600">
                        <ThumbsDown className="h-4 w-4 text-gray-500" />
                        Acknowledged
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
