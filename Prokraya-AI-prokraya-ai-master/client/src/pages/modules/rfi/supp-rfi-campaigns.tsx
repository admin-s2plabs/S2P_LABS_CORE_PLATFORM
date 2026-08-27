import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RfiSupplierCampaignListItem } from "./rfi-types";

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function MyStatusBadge({ status }: { status: string }) {
  if (status === "responded") {
    return <Badge data-testid={`mystatus-badge-${status}`}>Responded</Badge>;
  }
  return (
    <Badge variant="outline" data-testid={`mystatus-badge-${status}`}>
      Awaiting your response
    </Badge>
  );
}

export default function SuppRfiCampaigns() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, error } = useQuery<RfiSupplierCampaignListItem[]>({
    queryKey: ["/api/rfi/supplier/campaigns"],
  });

  const campaigns = data ?? [];
  const filtered = campaigns.filter(
    (c) =>
      !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.campaignCode?.toLowerCase().includes(search.toLowerCase()),
  );

  if (isError) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <p className="text-sm font-semibold">Couldn't load your RFI invitations</p>
            <p className="text-sm text-muted-foreground">{(error as Error)?.message || "Please try again."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">RFI Invitations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Requests for information you've been invited to respond to
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by campaign ID or title"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-campaigns"
            />
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
                    <TableHead>Your Status</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <ClipboardList className="h-6 w-6 text-muted-foreground" />
                          No RFI invitations {search ? "match your search" : "yet"}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((c) => (
                      <TableRow key={c.id} data-testid={`row-campaign-${c.id}`}>
                        <TableCell className="font-semibold text-primary">{c.campaignCode}</TableCell>
                        <TableCell className="max-w-[360px] truncate">{c.title}</TableCell>
                        <TableCell>
                          <MyStatusBadge status={c.myStatus} />
                        </TableCell>
                        <TableCell>{formatDate(c.deadline)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={c.myStatus === "responded" ? "outline" : "default"}
                            disabled={c.status === "closed" && c.myStatus !== "responded"}
                            onClick={() => navigate(`/app/supp-rfi/${c.id}`)}
                            data-testid={`button-open-campaign-${c.id}`}
                          >
                            {c.status === "closed" ? "View" : c.myStatus === "responded" ? "Edit Response" : "Respond"}
                          </Button>
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
    </div>
  );
}
