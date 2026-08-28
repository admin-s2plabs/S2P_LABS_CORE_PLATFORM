import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Gavel,
  Hammer,
  Loader2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";

const PAGE_SIZE = 5;

function getAuthSupplierId(): number | null {
  try {
    const raw = localStorage.getItem("prokraya-auth");
    if (!raw) return null;
    const p = JSON.parse(raw) as { supplierId?: string | number | null };
    const sid = p.supplierId;
    if (sid == null || sid === "") return null;
    const n = Number(sid);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

interface AuctionCard {
  id?: number;
  name?: string;
  auctionType?: string;
  expiyTime?: string;
  /** camelCase (some serializers) */
  startScheduledTime?: string;
  endTime?: string;
  /** Raw SQL / pg row shape */
  start_time?: string;
  end_time?: string;
  auctionLocations?: string[];
  status?: string;
  [key: string]: unknown;
}

function parseAuctionDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Remaining time until `end`; updates when `nowMs` changes. */
function formatRemainingUntil(end: Date, nowMs: number): string {
  const distance = end.getTime() - nowMs;
  if (distance < 0) return "Closed";
  const days = Math.floor(distance / (1000 * 60 * 60 * 24));
  const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((distance % (1000 * 60)) / 1000);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  if (seconds > 0) return `${seconds}s`;
  return "Ending now";
}

function resolveEndTime(item: AuctionCard): Date | null {
  return (
    parseAuctionDate(item.endTime) ??
    parseAuctionDate(item.end_time) ??
    parseAuctionDate(item.expiyTime)
  );
}

function resolveStartTime(item: AuctionCard): Date | null {
  return (
    parseAuctionDate(item.startScheduledTime) ??
    parseAuctionDate(item.start_time)
  );
}

function AuctionCardView({
  item,
  mode,
  onOpen,
  nowMs,
}: {
  item: AuctionCard;
  mode: "live" | "scheduled" | "closed";
  onOpen: () => void;
  nowMs: number;
}) {
  const locs = item.auctionLocations
    ? Array.from(new Set((item.auctionLocations as string[]).filter(Boolean)))
    : [];
  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={onOpen}
    >
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="rounded-lg bg-primary/10 p-2">
            <Hammer className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold truncate">
              {item.name ?? `Auction #${item.id}`}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {locs.length > 0 ? (
                <>Locations: {locs.join(", ")}</>
              ) : (
                <>Auction ID: {item.id}</>
              )}
            </p>
            {item.auctionType ? (
              <Badge variant="outline" className="mt-2">
                {String(item.auctionType)}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="text-sm text-center sm:text-right shrink-0">
          {mode === "live" && (
            <>
              <span className="text-muted-foreground block">Ends in</span>
              <span className="font-medium tabular-nums">
                {(() => {
                  const end = resolveEndTime(item);
                  return end ? formatRemainingUntil(end, nowMs) : "—";
                })()}
              </span>
            </>
          )}
          {mode === "scheduled" && (
            <>
              <span className="text-muted-foreground block">Starts in</span>
              <span className="font-medium tabular-nums">
                {(() => {
                  const start = resolveStartTime(item);
                  return start ? formatRemainingUntil(start, nowMs) : "—";
                })()}
              </span>
            </>
          )}
          {mode === "closed" && (
            <>
              <span className="text-muted-foreground block">Closed</span>
              <span className="font-medium text-muted-foreground">View</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SupplierAuctions() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const supplierId = useMemo(() => getAuthSupplierId(), []);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [tab, setTab] = useState<"live" | "scheduled" | "closed">("live");
  const [pageLive, setPageLive] = useState(0);
  const [pageScheduled, setPageScheduled] = useState(0);
  const [pageClosed, setPageClosed] = useState(0);

  const liveQuery = useQuery<AuctionCard[]>({
    queryKey: [
      "/api/auctionEvents/getAllActiveAuctionBySupplier",
      supplierId,
      pageLive,
      PAGE_SIZE,
    ],
    queryFn: async () => {
      const u = `/api/auctionEvents/getAllActiveAuctionBySupplier/${supplierId}?pageNo=${pageLive}&pageSize=${PAGE_SIZE}`;
      const res = await apiRequest("GET", u);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: supplierId != null,
  });

  const scheduledQuery = useQuery<AuctionCard[]>({
    queryKey: [
      "/api/auctionEvents/getAllUpcomingAuctionBySupplier",
      supplierId,
      pageScheduled,
      PAGE_SIZE,
    ],
    queryFn: async () => {
      const u = `/api/auctionEvents/getAllUpcomingAuctionBySupplier/${supplierId}?pageNo=${pageScheduled}&pageSize=${PAGE_SIZE}`;
      const res = await apiRequest("GET", u);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: supplierId != null && tab === "scheduled",
  });

  const closedQuery = useQuery<AuctionCard[]>({
    queryKey: [
      "/api/auctionEvents/getAllCompletedAuctionBySupplier",
      supplierId,
      pageClosed,
      PAGE_SIZE,
    ],
    queryFn: async () => {
      const u = `/api/auctionEvents/getAllCompletedAuctionBySupplier/${supplierId}?pageNo=${pageClosed}&pageSize=${PAGE_SIZE}`;
      const res = await apiRequest("GET", u);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: supplierId != null && tab === "closed",
  });

  const redirectToWorkbench = async (
    auctionId: number,
    sourceTab: "live" | "scheduled" | "closed"
  ) => {
    if (!supplierId) return;

    // Scheduled auctions cannot have responses yet — go straight to view-only.
    if (sourceTab === "scheduled") {
      navigate(`/app/supplier-auctions/${auctionId}/view?source=scheduled`);
      return;
    }

    try {
      const res = await apiRequest("GET", 
        `/api/auctionEvents/getAuctionEventDetailsBySupp/${auctionId}/${supplierId}`
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const hasResp = Array.isArray(data?.auAuctionSuppResponseEventList)
        ? data.auAuctionSuppResponseEventList.length > 0
        : !!data?.auAuctionSuppResponseEventList;

      if (sourceTab === "closed") {
        // Closed: show content but disable all action buttons via ?source=closed.
        const closedMode = hasResp ? "response" : "view";
        navigate(`/app/supplier-auctions/${auctionId}/${closedMode}?source=closed`);
      } else {
        // Live: supplier can bid or revise.
        if (hasResp) {
          navigate(`/app/supplier-auctions/${auctionId}/response`);
        } else {
          navigate(`/app/supplier-auctions/${auctionId}/view`);
        }
      }
    } catch (e) {
      toast({
        title: "Could not open auction",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  if (supplierId == null) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center">
            <Gavel className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-xl font-semibold">Supplier auctions</h1>
            <p className="text-muted-foreground mt-2">
              Link your supplier account to a supplier ID to see invited auctions. Sign in as a
              supplier user with a registered supplier profile.
            </p>
            <Button asChild className="mt-6">
              <Link href="/app/vendors">Supplier registration</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const liveList = Array.isArray(liveQuery.data) ? liveQuery.data : [];
  const schedList = Array.isArray(scheduledQuery.data) ? scheduledQuery.data : [];
  const closedList = Array.isArray(closedQuery.data) ? closedQuery.data : [];

  const loading =
    (tab === "live" && liveQuery.isLoading) ||
    (tab === "scheduled" && scheduledQuery.isLoading) ||
    (tab === "closed" && closedQuery.isLoading);

  const Pagination = ({
    page,
    setPage,
    hasMore,
  }: {
    page: number;
    setPage: (n: number) => void;
    hasMore: boolean;
  }) => (
    <div className="flex items-center justify-center gap-2 mt-4">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 0}
        onClick={() => setPage(Math.max(0, page - 1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm text-muted-foreground">Page {page + 1}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasMore}
        onClick={() => setPage(page + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/app/dashboard">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gavel className="h-7 w-7" />
            Supplier auctions
          </h1>
          <p className="text-muted-foreground text-sm">
            Live, scheduled, and completed auctions where you are invited.
          </p>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="live" className="gap-1">
            <Hammer className="h-4 w-4" />
            Live
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="gap-1">
            <Calendar className="h-4 w-4" />
            Scheduled
          </TabsTrigger>
          <TabsTrigger value="closed" className="gap-1">
            <CheckCircle2 className="h-4 w-4" />
            Closed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-6 space-y-4">
          {liveQuery.isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : liveList.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No live auctions.</p>
          ) : (
            <>
              {liveList.map((item) => (
                <AuctionCardView
                  key={item.id ?? Math.random()}
                  item={item}
                  mode="live"
                  nowMs={nowMs}
                  onOpen={() => item.id && redirectToWorkbench(item.id, "live")}
                />
              ))}
              <Pagination
                page={pageLive}
                setPage={setPageLive}
                hasMore={liveList.length >= PAGE_SIZE}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="scheduled" className="mt-6 space-y-4">
          {loading && tab === "scheduled" ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : schedList.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No scheduled auctions.</p>
          ) : (
            <>
              {schedList.map((item) => (
                <AuctionCardView
                  key={item.id ?? Math.random()}
                  item={item}
                  mode="scheduled"
                  nowMs={nowMs}
                  onOpen={() => item.id && redirectToWorkbench(item.id, "scheduled")}
                />
              ))}
              <Pagination
                page={pageScheduled}
                setPage={setPageScheduled}
                hasMore={schedList.length >= PAGE_SIZE}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="closed" className="mt-6 space-y-4">
          {loading && tab === "closed" ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : closedList.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No closed auctions.</p>
          ) : (
            <>
              {closedList.map((item) => (
                <AuctionCardView
                  key={item.id ?? Math.random()}
                  item={item}
                  mode="closed"
                  nowMs={nowMs}
                  onOpen={() => item.id && redirectToWorkbench(item.id, "closed")}
                />
              ))}
              <Pagination
                page={pageClosed}
                setPage={setPageClosed}
                hasMore={closedList.length >= PAGE_SIZE}
              />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
