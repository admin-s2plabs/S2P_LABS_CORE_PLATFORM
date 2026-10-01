import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, FileText, Send, CircleCheck, Clock, Search, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RfiCampaignFormSheet } from "./rfi-campaign-form-sheet";

export interface RfiCampaign {
  id: number;
  campaignCode: string;
  title: string;
  status: "draft" | "published" | "closed";
  deadline: string;
  sourcePrNumber: string | null;
  creationTime: string;
  supplierCount: number;
  respondedCount: number;
}

interface RfiCampaignsResponse {
  campaigns: RfiCampaign[];
  stats: { total: number; draft: number; published: number; closed: number; awaiting: number };
}

export function RfiStatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return (
      <Badge className="gap-1" data-testid={`status-badge-${status}`}>
        <Send className="h-3 w-3" /> Published
      </Badge>
    );
  }
  if (status === "closed") {
    return (
      <Badge variant="secondary" className="gap-1" data-testid={`status-badge-${status}`}>
        <CircleCheck className="h-3 w-3" /> Closed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1" data-testid={`status-badge-${status}`}>
      <FileText className="h-3 w-3" /> Draft
    </Badge>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function RfiCampaigns() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"published" | "draft">("published");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const fromPr = useMemo(() => new URLSearchParams(window.location.search).get("fromPr"), []);
  const [createOpen, setCreateOpen] = useState(!!fromPr);

  const { data, isLoading } = useQuery<RfiCampaignsResponse>({
    queryKey: ["/api/rfi/campaigns"],
  });

  const campaigns = data?.campaigns ?? [];
  const stats = data?.stats ?? { total: 0, draft: 0, published: 0, closed: 0, awaiting: 0 };

  const published = campaigns.filter((c) => c.status !== "draft");
  const draft = campaigns.filter((c) => c.status === "draft");

  const filtered = useMemo(() => {
    const source = tab === "published" ? published : draft;
    return source.filter((c) => {
      const matchesSearch =
        !search ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.campaignCode?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tab, published, draft, search, statusFilter]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary" data-testid="text-page-title">RFI Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Launch and track supplier information requests
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-create-campaign">
          <Plus className="h-4 w-4 mr-2" /> Create RFI Campaign
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        <StatCard icon={ClipboardList} label="Total Campaigns" value={stats.total} highlight />
        <StatCard icon={FileText} label="Draft" value={stats.draft} />
        <StatCard icon={Send} label="Published" value={stats.published} />
        <StatCard icon={CircleCheck} label="Closed" value={stats.closed} />
        <StatCard icon={Clock} label="Awaiting Response" value={stats.awaiting} />
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "published" | "draft")}>
            <TabsList>
              <TabsTrigger value="published" data-testid="tab-published">
                Published ({published.length})
              </TabsTrigger>
              <TabsTrigger value="draft" data-testid="tab-draft">
                Draft ({draft.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by campaign ID or title"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-campaigns"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Suppliers</TableHead>
                    <TableHead className="text-right">Responded</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Source PR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                        No campaigns match your filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((c) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/app/rfi/${c.id}`)}
                        data-testid={`row-campaign-${c.id}`}
                      >
                        <TableCell className="font-semibold text-primary">{c.campaignCode}</TableCell>
                        <TableCell className="max-w-[320px] truncate">{c.title}</TableCell>
                        <TableCell>
                          <RfiStatusBadge status={c.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.supplierCount}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.status === "draft" ? "—" : `${c.respondedCount}/${c.supplierCount}`}
                        </TableCell>
                        <TableCell>{formatDate(c.deadline)}</TableCell>
                        <TableCell>
                          {c.sourcePrNumber ? (
                            <Badge variant="outline">{c.sourcePrNumber}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RfiCampaignFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultSourcePrNumber={fromPr ?? undefined}
        onCreated={(id) => navigate(`/app/rfi/${id}`)}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: any;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary" : undefined}>
      <CardContent className="flex items-center gap-3 pt-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
