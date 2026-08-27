import { ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";
import type { CreateBidSuccessSpec } from "@shared/agent-sourcing-preview";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { formatDateTimeDisplay } from "@shared/publish-bid-dates";

function MetaField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function formatDisplayDate(value?: string): string | undefined {
  if (!value) return undefined;
  return formatDateTimeDisplay(value);
}

export function CreateBidSuccessCard({
  result,
  onPublish,
  publishDisabled = false,
}: {
  result: CreateBidSuccessSpec;
  onPublish?: () => void;
  publishDisabled?: boolean;
}) {
  const bidHref = `/app/bids/${result.bidId}`;
  const canOfferPublish =
    Boolean(onPublish) && String(result.status || "").toLowerCase() === "draft";

  return (
    <Card className="border-emerald-200/80 bg-background shadow-sm mt-2 dark:border-emerald-900/50">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Bid created successfully
              </p>
              <h3 className="text-base font-semibold leading-snug text-foreground mt-0.5 truncate">
                {result.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {result.bidNumber}
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetaField label="Bid Type" value={result.bidType} />
          <MetaField label="Requestor" value={result.requestor} />
          {result.buyer ? <MetaField label="Buyer" value={result.buyer} /> : null}
          {result.businessEntity ? (
            <MetaField label="Business Entity" value={result.businessEntity} />
          ) : null}
          {result.currency ? <MetaField label="Currency" value={result.currency} /> : null}
          {result.paymentTerms ? <MetaField label="Payment Terms" value={result.paymentTerms} /> : null}
          {result.deliveryLocationName ? (
            <MetaField label="Delivery Location" value={result.deliveryLocationName} />
          ) : null}
          {result.openDate ? (
            <MetaField label="Open Date" value={formatDisplayDate(result.openDate)} />
          ) : null}
          {result.closeDate ? (
            <MetaField label="Close Date" value={formatDisplayDate(result.closeDate)} />
          ) : null}
          {result.envOpenDate ? (
            <MetaField label="Envelope Open Date" value={formatDisplayDate(result.envOpenDate)} />
          ) : null}
          {result.prNumber ? <MetaField label="Source PR" value={result.prNumber} /> : null}
        </div>

        {result.lineItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Line Items ({result.lineItems.length})
            </p>
            <div className="space-y-1.5">
              {result.lineItems.map((line, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs"
                >
                  <span className="font-medium text-foreground">{line.description}</span>
                  <span className="text-muted-foreground shrink-0">
                    {line.quantity != null ? `×${line.quantity}` : ""}
                    {line.unitPrice != null
                      ? ` @ ${Number(line.unitPrice).toLocaleString()}`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.suppliers.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Invited Suppliers ({result.suppliers.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {result.suppliers.map((s, i) => (
                <Badge
                  key={`${s.supplierName}-${i}`}
                  variant="secondary"
                  className="rounded-full px-2.5 py-0.5 text-xs font-normal bg-muted text-foreground"
                >
                  @{s.supplierName}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {result.evaluationCriteria.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Evaluation Criteria</p>
            <div className="space-y-1">
              {result.evaluationCriteria.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{c.category || c.question}</span>
                  {c.weight != null ? (
                    <span className="text-muted-foreground font-medium">{c.weight}%</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {result.evaluators.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Assigned Evaluators</p>
            <div className="flex flex-wrap gap-1.5">
              {result.evaluators.map((e, i) => (
                <Badge
                  key={`${e.userName}-${i}`}
                  variant="outline"
                  className="rounded-full px-2.5 py-0.5 text-xs font-normal border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
                >
                  @{e.userName}
                  {e.roleLabel ? ` (${e.roleLabel})` : ""}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="pt-1 border-t space-y-3">
          <p className="text-xs text-muted-foreground">
            {canOfferPublish
              ? "Next we'll check everything this bid needs before it can go live. You can also keep adding line items and vendors in chat."
              : (
                <>
                  You can add more line items, invite vendors, or publish this bid in chat. Reference{" "}
                  <span className="font-medium text-foreground">{result.bidNumber}</span> for follow-up
                  actions.
                </>
              )}
          </p>
          {canOfferPublish ? (
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={onPublish}
              disabled={publishDisabled}
              data-testid="button-create-bid-success-publish"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Check Readiness
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}