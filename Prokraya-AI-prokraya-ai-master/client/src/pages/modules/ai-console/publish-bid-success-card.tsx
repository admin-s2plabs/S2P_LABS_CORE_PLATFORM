import { CheckCircle2, ExternalLink } from "lucide-react";
import type { PublishBidSuccessSpec } from "@shared/agent-sourcing-preview";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

export function PublishBidSuccessCard({ result }: { result: PublishBidSuccessSpec }) {
  const bidHref = `/app/bids/${result.bidId}`;

  return (
    <Card className="border-emerald-200/80 bg-background shadow-sm mt-2 dark:border-emerald-900/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Bid published successfully
              </p>
              <h3 className="text-base font-semibold leading-snug text-foreground mt-0.5 truncate">
                {result.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {result.bidNumber}
                <span className="mx-1">·</span>
                {result.bidType}
                <span className="mx-1">·</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                  {result.status}
                </Badge>
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" asChild>
            <Link href={bidHref}>
              View Bid
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground pt-1 border-t">
          Vendors can now submit their responses. Open the bid to track activity or make further
          changes.
        </p>
      </CardContent>
    </Card>
  );
}
