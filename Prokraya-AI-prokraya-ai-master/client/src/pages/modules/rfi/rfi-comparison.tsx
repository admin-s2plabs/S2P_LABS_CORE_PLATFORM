import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  ChartColumn,
  FileText,
  Gavel,
  Inbox,
  Search,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { RfiStatusBadge } from "./rfi-campaigns";
import { isFileAnswer, type RfiAnswerValue, type RfiCampaignDetail, type RfiQuestion } from "./rfi-types";

interface RfiComparisonProps {
  id: string;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function answerSortKey(value: RfiAnswerValue): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (isFileAnswer(value)) return value.name;
  return value as string | number;
}

function AnswerCell({ value, question }: { value: RfiAnswerValue; question: RfiQuestion }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-sm italic text-muted-foreground">No response</span>;
  }
  if (isFileAnswer(value)) {
    return (
      <a
        href={value.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm hover:bg-muted/50"
      >
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="truncate max-w-[160px]">{value.name}</span>
      </a>
    );
  }
  if (question.type === "multi_select") {
    return (
      <span className="flex flex-wrap gap-1.5">
        {String(value)
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
          .map((v) => (
            <Badge key={v} variant="secondary" className="text-[11px]">
              {v}
            </Badge>
          ))}
      </span>
    );
  }
  if (question.type === "single_select") {
    return <Badge variant="outline">{String(value)}</Badge>;
  }
  return <span className="text-sm">{String(value)}</span>;
}

export default function RfiComparison({ id }: RfiComparisonProps) {
  const campaignId = Number(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = useState<"question" | "supplier">("question");
  const [search, setSearch] = useState("");
  const [responseFilter, setResponseFilter] = useState<"responded" | "all" | "pending">("responded");
  const [sortBy, setSortBy] = useState<{ questionId: number; dir: "asc" | "desc" } | null>(null);

  const queryKey = ["/api/rfi/campaigns", String(campaignId)];
  const { data, isLoading } = useQuery<RfiCampaignDetail>({ queryKey, enabled: Number.isFinite(campaignId) });

  const shortlistMutation = useMutation({
    mutationFn: async ({ supplierId, isShortlisted }: { supplierId: string; isShortlisted: boolean }) =>
      apiRequest("PATCH", `/api/rfi/campaigns/${campaignId}/suppliers/${supplierId}/shortlist`, {
        isShortlisted,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err: Error) => toast({ title: "Failed to update shortlist", description: err.message, variant: "destructive" }),
  });

  const rows = useMemo(() => {
    if (!data) return [];
    return data.suppliers.map((s) => {
      const answers: Record<number, RfiAnswerValue> = {};
      for (const r of data.responses) {
        if (r.supplierId === s.supplierId) answers[r.questionId] = r.value;
      }
      return { supplier: s, answers };
    });
  }, [data]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (responseFilter === "responded") list = list.filter((r) => r.supplier.status === "responded");
    if (responseFilter === "pending") list = list.filter((r) => r.supplier.status !== "responded");
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.supplier.supplierName.toLowerCase().includes(q));
    }
    if (sortBy) {
      const dir = sortBy.dir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const av = answerSortKey(a.answers[sortBy.questionId] ?? null);
        const bv = answerSortKey(b.answers[sortBy.questionId] ?? null);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    } else {
      list = [...list].sort((a, b) => a.supplier.supplierName.localeCompare(b.supplier.supplierName));
    }
    return list;
  }, [rows, responseFilter, search, sortBy]);

  const shortlistedCount = data?.suppliers.filter((s) => s.isShortlisted).length ?? 0;

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { campaign, questions, suppliers } = data;

  const toggleSort = (questionId: number) => {
    setSortBy((prev) => {
      if (!prev || prev.questionId !== questionId) return { questionId, dir: "asc" };
      if (prev.dir === "asc") return { questionId, dir: "desc" };
      return null;
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/app/rfi/${campaignId}`)} data-testid="button-back-to-campaign">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ChartColumn className="h-6 w-6" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">Comparison View</h1>
              <RfiStatusBadge status={campaign.status} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {campaign.campaignCode} · {campaign.title} · Deadline {formatDate(campaign.deadline)}
            </p>
          </div>
        </div>
        <Button
          disabled={shortlistedCount === 0}
          onClick={() =>
            toast({
              title: `${shortlistedCount} supplier(s) shortlisted`,
              description: "Head to the Bids module to raise a bid with this shortlist.",
            })
          }
          data-testid="button-convert-to-bid"
        >
          <Gavel className="h-4 w-4 mr-2" />
          Shortlist & Convert to Bid
          {shortlistedCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {shortlistedCount}
            </Badge>
          )}
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
        <Card className="h-fit lg:sticky lg:top-6">
          <CardContent className="pt-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
              <Users className="h-4 w-4 text-muted-foreground" /> Suppliers
            </h2>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-emerald-50 px-3 py-2">
                <p className="text-[11px] font-medium text-emerald-700">Responded</p>
                <p className="text-lg font-bold text-emerald-800">{campaign.respondedCount}</p>
              </div>
              <div className="rounded-lg bg-amber-50 px-3 py-2">
                <p className="text-[11px] font-medium text-amber-700">Pending</p>
                <p className="text-lg font-bold text-amber-800">{suppliers.length - campaign.respondedCount}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {rows.map(({ supplier }) => (
                <button
                  key={supplier.supplierId}
                  type="button"
                  disabled={supplier.status !== "responded"}
                  onClick={() =>
                    shortlistMutation.mutate({ supplierId: supplier.supplierId, isShortlisted: !supplier.isShortlisted })
                  }
                  title={supplier.status === "responded" ? "Toggle shortlist" : "Supplier has not responded"}
                  className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    supplier.isShortlisted ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-muted/50"
                  } ${supplier.status !== "responded" ? "cursor-not-allowed opacity-55" : ""}`}
                  data-testid={`button-shortlist-${supplier.supplierId}`}
                >
                  <span
                    className={`mt-0.5 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded border ${
                      supplier.isShortlisted ? "border-primary bg-primary text-primary-foreground" : "border-input"
                    }`}
                  >
                    {supplier.isShortlisted && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{supplier.supplierName}</span>
                    <span className="mt-1 block">
                      <Badge variant={supplier.status === "responded" ? "default" : "outline"} className="text-[10px]">
                        {supplier.status === "responded" ? "Responded" : "Pending"}
                      </Badge>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <Tabs value={view} onValueChange={(v) => setView(v as "question" | "supplier")}>
              <TabsList>
                <TabsTrigger value="question" data-testid="tab-by-question">
                  By Question ({questions.length})
                </TabsTrigger>
                <TabsTrigger value="supplier" data-testid="tab-by-supplier">
                  By Supplier ({filteredRows.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="mt-4 mb-5 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search supplier"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={responseFilter} onValueChange={(v) => setResponseFilter(v as any)}>
                <SelectTrigger className="w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="responded">Responded only</SelectItem>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  <SelectItem value="pending">No response</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <Inbox className="h-6 w-6" />
                </span>
                <p className="text-sm font-semibold">No suppliers match your filters</p>
              </div>
            ) : view === "question" ? (
              <div className="space-y-4">
                {questions.map((q, index) => {
                  const active = sortBy?.questionId === q.id;
                  return (
                    <section key={q.id} className="overflow-hidden rounded-lg border">
                      <header className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/40 px-4 py-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-background text-[11px] font-bold ring-1 ring-border">
                            {index + 1}
                          </span>
                          <p className="text-sm font-semibold">{q.text}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleSort(q.id)}
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
                            active ? "border-primary/40 bg-primary/10 text-primary" : ""
                          }`}
                          data-testid={`button-sort-${q.id}`}
                        >
                          {active && sortBy?.dir === "desc" ? (
                            <ArrowDownAZ className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpAZ className="h-3.5 w-3.5" />
                          )}
                          Sort
                        </button>
                      </header>
                      <div className="divide-y">
                        {filteredRows.map(({ supplier, answers }) => (
                          <div key={supplier.supplierId} className="grid gap-3 px-4 py-3 sm:grid-cols-[200px_1fr]">
                            <span className="text-[13px] font-semibold">{supplier.supplierName}</span>
                            <AnswerCell value={answers[q.id] ?? null} question={q} />
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRows.map(({ supplier, answers }) => (
                  <section key={supplier.supplierId} className="overflow-hidden rounded-lg border">
                    <header className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
                      <span className="text-sm font-bold">{supplier.supplierName}</span>
                      <Badge variant={supplier.status === "responded" ? "default" : "outline"}>
                        {supplier.status === "responded" ? "Responded" : "Pending"}
                      </Badge>
                    </header>
                    <div className="divide-y">
                      {questions.map((q) => (
                        <div key={q.id} className="grid gap-2 px-4 py-3 sm:grid-cols-2">
                          <p className="text-[13px] text-muted-foreground">{q.text}</p>
                          <AnswerCell value={answers[q.id] ?? null} question={q} />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
