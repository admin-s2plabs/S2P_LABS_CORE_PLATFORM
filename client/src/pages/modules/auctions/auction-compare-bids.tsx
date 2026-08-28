import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import { CompareBidsStatementPageBody } from "./auction-compare-bids-dialog";
import type { CompareTemplateRow } from "./compare-bids-model";

function normalizeTemplateRows(rows: unknown[] | undefined): CompareTemplateRow[] {
  if (!rows?.length) return [];
  return rows.map((r) => {
    const row = r as CompareTemplateRow & {
      auctionEventRowColumn?: CompareTemplateRow["columnResponseValues"];
    };
    const cols = row.columnResponseValues ?? row.auctionEventRowColumn ?? [];
    return { ...row, columnResponseValues: cols };
  });
}

export default function AuctionCompareBids() {
  const [, params] = useRoute("/app/auction-details/:id/compare-bids");
  const id = params?.id;

  const { data: details, isLoading } = useQuery({
    queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/auctionEvents/getAuctionEventDetailsById/${id}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!id,
  });

  const templateRows = useMemo(
    () => normalizeTemplateRows(details?.templateRows as unknown[] | undefined),
    [details?.templateRows]
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={id ? `/app/auction-details/${id}` : "/app/auctions"}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Compare bids</h1>
          <p className="text-sm text-muted-foreground">
            Comparative statement — auction #{id}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base tracking-tight">COMPARATIVE STATEMENT</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <CompareBidsStatementPageBody
            details={details ?? null}
            templateRows={templateRows}
            loading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
