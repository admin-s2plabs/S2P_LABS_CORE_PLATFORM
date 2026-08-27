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
import {
  matchesStatusFilter,
} from "@shared/status-filter";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Award,
  Ban,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileDown,
  FileSpreadsheet,
  FileText,
  Gavel,
  Hammer,
  Plus,
  Search,
  Send,
  Timer,
  Upload,
  Users,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import * as XLSX from "xlsx";

interface DboAuction {
  id: number;
  auctionTitle: string;
  auctionNumber: string;
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
  buyerName: string;
  departmentName: string;
  prNumber: string;
  auctionAmount: number;
  awardAmount: number;
  noInvitedSupps: number;
  auctionAcknowledges: number;
  auctionResponses: number;
  requestorName: string;
  deliverToLocation: string;
  paymentTerms: string;
  /** Comma-separated invited supplier names (API). */
  invitedSupplierNames?: string;
  currentApprover: string | null;
}

const auctionStatusConfig: Record<
  string,
  {
    label: string;
    icon: typeof Clock;
    variant: "default" | "secondary" | "destructive" | "outline";
    className?: string;
  }
> = {
  Draft: { label: "Draft", icon: FileText, variant: "secondary" },
  // Published: { label: "Published", icon: Send, variant: "default" },
  Awarded: {
    label: "Awarded",
    icon: Award,
    variant: "secondary",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  // Cancelled: { label: "Cancelled", icon: Ban, variant: "destructive" },
  "Award Under Process": {
    label: "Award Under Process",
    icon: Timer,
    variant: "outline",
    className: "border-orange-300 text-orange-600 dark:text-orange-400",
  },
};

const auctionTypeConfig: Record<string, { label: string; className: string }> =
{
  Reverse: {
    label: "Reverse Auction",
    className:
      "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  },
  Forward: {
    label: "Forward Auction",
    className:
      "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  },
  Dutch: {
    label: "Dutch Auction",
    className:
      "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  },
  English: {
    label: "English Auction",
    className:
      "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = auctionStatusConfig[status] || {
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
  const config = auctionTypeConfig[type] || auctionTypeConfig["Reverse"];
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
  if (diff <= 0)
    return { label: "Auction Closed", urgent: false, closed: true };
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
        data-testid="badge-auction-closed"
      >
        <XCircle className="h-3 w-3" />
        Auction Closed
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

export default function Auctions() {
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const queryParams = new URLSearchParams(location.split("?")[1] || "");
  const initialTypeFilter = queryParams.get("type") || "all";
  const initialStatus = queryParams.get("status") || "all";
  const initialSearch = queryParams.get("search") || "";
  const initialPage = parseInt(queryParams.get("page") || "1", 10) || 1;

  const [search, setSearch] = useState(initialSearch);
  const [typeFilter, setTypeFilter] = useState<string>(initialTypeFilter);
  const [selectedTab, setSelectedTab] = useState<"total" | "live" | "scheduled" | "closed" | "draft">("live");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [pageLive, setPageLive] = useState(initialPage);
  const [pageScheduled, setPageScheduled] = useState(initialPage);
  const [pageClosed, setPageClosed] = useState(initialPage);
  const [pageDraft, setPageDraft] = useState(initialPage);
  const [pageTotal, setPageTotal] = useState(initialPage);
  const pageSize = 10;

  useEffect(() => {
    const qp = new URLSearchParams(location.split("?")[1] || "");
    setSearch(qp.get("search") || "");
    setTypeFilter(qp.get("type") || "all");
    const st = qp.get("status") || "all";
    setStatusFilter(st);
    if (st !== "all") setSelectedTab("total");
    const page = parseInt(qp.get("page") || "1", 10) || 1;
    setPageLive(page);
    setPageScheduled(page);
    setPageClosed(page);
    setPageDraft(page);
    setPageTotal(page);
  }, [location]);

  const authData =
    typeof window !== "undefined"
      ? localStorage.getItem("prokraya-auth")
      : null;
  const authParsed = authData ? JSON.parse(authData) : null;
  const currentUserName = authParsed?.userNameId?.toLowerCase() || "";

  const {
    data: liveAuctions,
    isLoading: liveLoading,
  } = useQuery<DboAuction[]>({
    queryKey: ["/api/auctionEvents/getLiveAuctions"],
    staleTime: 60 * 1000,
    refetchOnMount: "always",
  });

  const {
    data: scheduledAuctions,
    isLoading: scheduledLoading,
  } = useQuery<DboAuction[]>({
    queryKey: ["/api/auctionEvents/getScheduledAuctions"],
    staleTime: 60 * 1000,
    refetchOnMount: "always",
  });

  const {
    data: closedAuctions,
    isLoading: closedLoading,
  } = useQuery<DboAuction[]>({
    queryKey: ["/api/auctionEvents/getClosedAuctions"],
    staleTime: 60 * 1000,
    refetchOnMount: "always",
  });
  const {
    data: draftAuctions,
    isLoading: draftLoading,
  } = useQuery<DboAuction[]>({
    queryKey: ["/api/auctionEvents/getDraftAuctions"],
    staleTime: 60 * 1000,
    refetchOnMount: "always",
  });

  const isLoading = liveLoading || scheduledLoading || closedLoading || draftLoading;

  const filterAuction = useCallback((auction: DboAuction) => {
    const matchesSearch =
      search === "" ||
      String(auction.id).includes(search) ||
      auction.auctionTitle.toLowerCase().includes(search.toLowerCase()) ||
      auction.auctionNumber.toLowerCase().includes(search.toLowerCase()) ||
      auction.departmentName.toLowerCase().includes(search.toLowerCase()) ||
      auction.prNumber.toLowerCase().includes(search.toLowerCase()) ||
      auction.buyerName.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || auction.type === typeFilter;
    return matchesSearch && matchesType;
  }, [search, typeFilter]);

  const liveBase = useMemo(
    () => liveAuctions?.filter(filterAuction) ?? [],
    [liveAuctions, filterAuction],
  );
  const scheduledBase = useMemo(
    () => scheduledAuctions?.filter(filterAuction) ?? [],
    [scheduledAuctions, filterAuction],
  );
  const closedBase = useMemo(
    () => closedAuctions?.filter(filterAuction) ?? [],
    [closedAuctions, filterAuction],
  );
  const draftBase = useMemo(
    () => draftAuctions?.filter(filterAuction) ?? [],
    [draftAuctions, filterAuction],
  );

  const applyStatus = useCallback(
    (rows: DboAuction[]) =>
      rows.filter((a) => matchesStatusFilter(a.status || "", statusFilter)),
    [statusFilter],
  );

  const liveAuctionsFiltered = useMemo(
    () => applyStatus(liveBase),
    [liveBase, applyStatus],
  );
  const scheduledAuctionsFiltered = useMemo(
    () => applyStatus(scheduledBase),
    [scheduledBase, applyStatus],
  );
  const closedAuctionsFiltered = useMemo(
    () => applyStatus(closedBase),
    [closedBase, applyStatus],
  );
  const draftAuctionsFiltered = useMemo(
    () => applyStatus(draftBase),
    [draftBase, applyStatus],
  );
  const allAuctionsFiltered = useMemo(
    () => [
      ...liveAuctionsFiltered,
      ...scheduledAuctionsFiltered,
      ...closedAuctionsFiltered,
      ...draftAuctionsFiltered,
    ],
    [
      liveAuctionsFiltered,
      scheduledAuctionsFiltered,
      closedAuctionsFiltered,
      draftAuctionsFiltered,
    ],
  );

  const tabPoolForBadges = useMemo(() => {
    switch (selectedTab) {
      case "total":
        return [...liveBase, ...scheduledBase, ...closedBase, ...draftBase];
      case "live":
        return liveBase;
      case "scheduled":
        return scheduledBase;
      case "closed":
        return closedBase;
      case "draft":
        return draftBase;
      default:
        return [];
    }
  }, [selectedTab, liveBase, scheduledBase, closedBase, draftBase]);

  const auctionStatusBadgeItems = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of tabPoolForBadges) {
      const s = a.status || "Unknown";
      counts[s] = (counts[s] || 0) + 1;
    }
    const known = Object.keys(auctionStatusConfig);
    const rest = Object.keys(counts)
      .filter((s) => !known.includes(s))
      .sort();
    const ordered = [...known, ...rest];
    return ordered.map((status) => ({
      value: status,
      label: auctionStatusConfig[status]?.label || status,
      count: counts[status] ?? 0,
    }));
  }, [tabPoolForBadges]);

  const stats = {
    total: liveBase.length + scheduledBase.length + closedBase.length + draftBase.length,
    live: liveBase.length,
    scheduled: scheduledBase.length,
    closed: closedBase.length,
    draft: draftBase.length,
  };

  const livePageCount = Math.ceil(liveAuctionsFiltered.length / pageSize) || 1;
  const scheduledPageCount =
    Math.ceil(scheduledAuctionsFiltered.length / pageSize) || 1;
  const closedPageCount = Math.ceil(closedAuctionsFiltered.length / pageSize) || 1;
  const draftPageCount = Math.ceil(draftAuctionsFiltered.length / pageSize) || 1;
  const totalPageCount = Math.ceil(allAuctionsFiltered.length / pageSize) || 1;

  const pagedLiveAuctions = liveAuctionsFiltered.slice(
    (pageLive - 1) * pageSize,
    pageLive * pageSize,
  );
  const pagedScheduledAuctions = scheduledAuctionsFiltered.slice(
    (pageScheduled - 1) * pageSize,
    pageScheduled * pageSize,
  );
  const pagedClosedAuctions = closedAuctionsFiltered.slice(
    (pageClosed - 1) * pageSize,
    pageClosed * pageSize,
  );
  const pagedDraftAuctions = draftAuctionsFiltered.slice(
    (pageDraft - 1) * pageSize,
    pageDraft * pageSize,
  );
  const pagedAllAuctions = allAuctionsFiltered.slice(
    (pageTotal - 1) * pageSize,
    pageTotal * pageSize,
  );

  const getCurrentTabData = () => {
    switch (selectedTab) {
      case "total":
        return allAuctionsFiltered;
      case "live":
        return liveAuctionsFiltered;
      case "scheduled":
        return scheduledAuctionsFiltered;
      case "closed":
        return closedAuctionsFiltered;
      case "draft":
        return draftAuctionsFiltered;
      default:
        return [];
    }
  };

  const statCards: {
    title: string;
    value: number;
    icon: typeof Hammer;
    color: string;
    bgColor: string;
    tab: "total" | "live" | "scheduled" | "closed" | "draft";
  }[] = [
    {
      title: "Total Auctions",
      value: stats.total,
      icon: Hammer,
      color: "text-primary",
      bgColor: "bg-primary/10",
      tab: "total",
    },
    {
      title: "Live",
      value: stats.live,
      icon: Send,
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-900/30",
      tab: "live",
    },
    {
      title: "Scheduled",
      value: stats.scheduled,
      icon: Calendar,
      color: "text-indigo-600",
      bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
      tab: "scheduled",
    },
    {
      title: "Closed",
      value: stats.closed,
      icon: XCircle,
      color: "text-orange-500",
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
      tab: "closed",
    },
    {
      title: "Draft",
      value: stats.draft,
      icon: FileText,
      color: "text-gray-500",
      bgColor: "bg-gray-100 dark:bg-gray-900/30",
      tab: "draft",
    },
  ];

  const getExportData = (rows: DboAuction[]) => {
    return rows.map((auction) => ({
      "Auction Number": auction.auctionNumber || "",
      Title: auction.auctionTitle || "",
      Type: auction.type || "",
      Status: auction.status || "",
      // Department: auction.departmentName || "",
      "PR Number": auction.prNumber || "",
      "Invited suppliers": auction.invitedSupplierNames || "",
      Buyer: auction.buyerName || "",
      Requestor: auction.requestorName || "",
      // Amount: auction.auctionAmount || "",
      Currency: auction.currency || "",
      // "Invited Vendors": auction.noInvitedSupps || 0,
      // Responses: auction.auctionResponses || 0,
      "Start Date": auction.startDate ? formatDate(auction.startDate) : "",
      "End Date": auction.endDate ? formatDate(auction.endDate) : "",
      "Created Date": auction.createdDate ? formatDate(auction.createdDate) : ""
    }));
  };

  const exportToCSV = () => {
    const currentData = getCurrentTabData();

    const data = getExportData(currentData);
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
    a.download = `auctions_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast({ title: "Exported to CSV" });
  };

  const exportToExcel = () => {
    const currentData = getCurrentTabData();

    const data = getExportData(currentData);
    if (data.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auctions");
    XLSX.writeFile(
      wb,
      `auctions_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
    toast({ title: "Exported to Excel" });
  };

  const renderAuctionTable = (
    rows: DboAuction[],
    page: number,
    totalPages: number,
    totalCount: number,
    onPageChange: (p: number) => void,
    emptyMessage: string,
    emptyIcon: typeof Hammer,
    tableId: string = "active",
  ) => {
    const EmptyIcon = emptyIcon;
    const isDraft = tableId === "draft";
    const tableColCount = isDraft ? 7 : 8;
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
                    Auction Number
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
                    <Hammer className="h-3.5 w-3.5" />
                    Type
                  </span>
                </TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    PR Number
                  </span>
                </TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Current Approver
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
                <TableHead className="text-xs font-medium text-left whitespace-nowrap min-w-[200px]">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Suppliers
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={tableColCount} className="h-10 px-4">
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={tableColCount} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <EmptyIcon className="h-8 w-8 opacity-50" />
                      <p className="text-sm">{emptyMessage}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((auction, index) => (
                  <TableRow
                    key={auction.id}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(isDraft ? `/app/auctions/create?draftId=${auction.id}` : `/app/auction-details/${auction.id}`)}
                  >
                    <TableCell className="text-xs text-muted-foreground">
                      {(page - 1) * pageSize + index + 1}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {auction.auctionNumber}
                    </TableCell>
                    <TableCell className="text-xs">
                      <StatusBadge status={auction.status} />
                    </TableCell>
                    <TableCell className="text-xs max-w-xs truncate">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>{auction.auctionTitle}</span>
                        </TooltipTrigger>
                        <TooltipContent>{auction.auctionTitle}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-xs">
                      <TypeBadge type={auction.type} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {auction.prNumber}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {auction.currentApprover || "-"}
                    </TableCell>
                    {!isDraft && (
                      <TableCell className="text-xs">
                        <TimeLeftBadge endDate={auction.endDate} />
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-left align-top max-w-[min(320px,40vw)]">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="line-clamp-3 whitespace-normal break-words text-left">
                            {(auction.invitedSupplierNames ?? "").trim() ||
                              "—"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-md text-xs whitespace-pre-wrap"
                        >
                          {(auction.invitedSupplierNames ?? "").trim() ||
                            "No suppliers invited"}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} ({totalCount} total)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    );
  };

  return (
    <div className="flex flex-col gap-4 p-4 min-h-screen bg-muted/30">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Auctions</h1>
          <p className="text-sm text-muted-foreground">
            Manage and track all your auctions
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/auctions/create">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Auction
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          const isActive = selectedTab === card.tab;
          return (
            <Card
              key={index}
              className={`hover-elevate cursor-pointer transition-all ${isActive ? "ring-primary border-primary bg-primary/5" : ""}`}
              onClick={() => {
                setSelectedTab(card.tab);
                setStatusFilter("all");
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">
                      {card.title}
                    </p>
                    <p className="text-2xl font-bold mt-1">{card.value}</p>
                  </div>
                  <div className={`p-2.5 rounded-lg ${card.bgColor}`}>
                    <Icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters and Search */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <StatusCountBadges
            totalCount={tabPoolForBadges.length}
            selected={statusFilter}
            loading={isLoading}
            onSelect={(v) => {
              setStatusFilter(v);
              setPageLive(1);
              setPageScheduled(1);
              setPageClosed(1);
              setPageDraft(1);
              setPageTotal(1);
            }}
            items={auctionStatusBadgeItems}
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search auctions..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setStatusFilter("all");
                  setPageLive(1);
                  setPageScheduled(1);
                  setPageClosed(1);
                  setPageDraft(1);
                  setPageTotal(1);
                }}
                className="pl-9"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v);
                setStatusFilter("all");
              }}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Reverse">Reverse Auction</SelectItem>
                <SelectItem value="Forward">Forward Auction</SelectItem>
                {/* <SelectItem value="Dutch">Dutch Auction</SelectItem>
                <SelectItem value="English">English Auction</SelectItem> */}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Upload className="h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportToCSV}>
                  <FileDown className="h-3.5 w-3.5 mr-2" />
                  Export to CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToExcel}>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
                  Export to Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Card className="border-0 shadow-sm">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <Gavel className="h-4 w-4" />
          <h2 className="font-semibold">Auctions by Status</h2>
          <div className="ml-auto flex gap-2">
            <Button
              variant={selectedTab === "live" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSelectedTab("live");
                setStatusFilter("all");
              }}
            >
              Live ({stats.live})
            </Button>
            <Button
              variant={selectedTab === "scheduled" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSelectedTab("scheduled");
                setStatusFilter("all");
              }}
            >
              Scheduled ({stats.scheduled})
            </Button>
            <Button
              variant={selectedTab === "closed" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSelectedTab("closed");
                setStatusFilter("all");
              }}
            >
              Closed ({stats.closed})
            </Button>
            <Button
              variant={selectedTab === "draft" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSelectedTab("draft");
                setStatusFilter("all");
              }}
            >
              Draft ({stats.draft})
            </Button>
          </div>
        </div>
        <div>
          {selectedTab === "total" &&
            renderAuctionTable(
              pagedAllAuctions,
              pageTotal,
              totalPageCount,
              allAuctionsFiltered.length,
              setPageTotal,
              "No auctions found",
              Hammer,
              "live",
            )}

          {selectedTab === "live" &&
            renderAuctionTable(
              pagedLiveAuctions,
              pageLive,
              livePageCount,
              liveAuctionsFiltered.length,
              setPageLive,
              "No live auctions found",
              Send,
              "live",
            )}

          {selectedTab === "scheduled" &&
            renderAuctionTable(
              pagedScheduledAuctions,
              pageScheduled,
              scheduledPageCount,
              scheduledAuctionsFiltered.length,
              setPageScheduled,
              "No scheduled auctions found",
              Calendar,
              "scheduled",
            )}

          {selectedTab === "closed" &&
            renderAuctionTable(
              pagedClosedAuctions,
              pageClosed,
              closedPageCount,
              closedAuctionsFiltered.length,
              setPageClosed,
              "No closed auctions found",
              XCircle,
              "closed",
            )}
          {selectedTab === "draft" &&
            renderAuctionTable(
              pagedDraftAuctions,
              pageDraft,
              draftPageCount,
              draftAuctionsFiltered.length,
              setPageDraft,
              "No draft auctions found",
              FileText,
              "draft",
            )}
        </div>
      </Card>
    </div>
  );
}
