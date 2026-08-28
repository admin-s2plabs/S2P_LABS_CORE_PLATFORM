import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAISettings } from "@/hooks/use-ai-settings";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import {
  PROCUREMENT_ALERT_TYPE_LABELS,
  type ProcurementAlertReviewSpec,
} from "@shared/procurement-activation-signals";
import {
  AiSummaryBlock,
  Field,
  FieldGrid,
  fmt,
  fmtDate,
  fmtMoney,
  Section,
  StatusPill,
} from "./procurement-activation/card-primitives";

export function ProcurementAlertReviewCard({
  spec,
  status = "pending",
}: {
  spec: ProcurementAlertReviewSpec;
  status?: "pending" | "acknowledged" | "resolved";
}) {
  const { isAIEnabled } = useAISettings();
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [anomaly, setAnomaly] = useState<any>(null);
  const [deliveryRisk, setDeliveryRisk] = useState<any>(null);
  const [invoiceMatch, setInvoiceMatch] = useState<any>(null);
  const [invoiceFraud, setInvoiceFraud] = useState<any>(null);

  const isInvoice = !!spec.invoiceId;
  const isPo = !!spec.poNumber;

  const poQuery = useQuery({
    queryKey: ["/api/purchase-orders", spec.poNumber, "alert"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/purchase-orders/${spec.poNumber}`);
      return parseJsonResponse<any>(res);
    },
    enabled: isPo,
  });

  const invoiceQuery = useQuery({
    queryKey: ["/api/invoices", spec.invoiceId, "alert"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/invoices/${spec.invoiceId}`);
      return parseJsonResponse<any>(res);
    },
    enabled: isInvoice,
  });

  const dnQuery = useQuery({
    queryKey: ["/api/purchase-orders", spec.poNumber, "delivery-notes"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/purchase-orders/${spec.poNumber}/delivery-notes`);
      return parseJsonResponse<any[]>(res);
    },
    enabled: isPo && (spec.alertType === "dnUpdated" || !!spec.dnId),
  });

  const receiptQuery = useQuery({
    queryKey: ["/api/purchase-orders", spec.poNumber, "grns"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/purchase-orders/${spec.poNumber}/grns`);
      return parseJsonResponse<any>(res);
    },
    enabled:
      isPo &&
      (spec.alertType === "receiptPending" ||
        spec.alertType === "deliveryOverdue" ||
        spec.alertType === "grnReadyToInvoice"),
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isPo && (spec.alertType === "poRiskCandidate" || spec.alertType === "poAnomalyCandidate" || spec.alertType === "deliveryOverdue")) {
        if (!isAIEnabled("AI_PO_ANOMALY_DETECTION")) return;
        setAiLoading(true);
        setAiError(null);
        try {
          const res = await apiRequest("POST", `/api/purchase-orders/${spec.poNumber}/ai-analyze`);
          const data = await parseJsonResponse<any>(res);
          if (!cancelled) setAnomaly(data);
          try {
            const riskRes = await apiRequest("GET", `/api/purchase-orders/${spec.poNumber}/delivery-risk`);
            const riskData = await parseJsonResponse<any>(riskRes);
            if (!cancelled) setDeliveryRisk(riskData);
          } catch {
            /* best-effort */
          }
        } catch (err: any) {
          if (!cancelled) setAiError(err?.message || "AI analysis failed");
        } finally {
          if (!cancelled) setAiLoading(false);
        }
      }

      if (isInvoice) {
        setAiLoading(true);
        setAiError(null);
        try {
          try {
            const matchRes = await apiRequest("POST", `/api/invoices/${spec.invoiceId}/ai-match`);
            const matchData = await parseJsonResponse<any>(matchRes);
            if (!cancelled) setInvoiceMatch(matchData);
          } catch {
            /* optional */
          }
          try {
            const fraudRes = await apiRequest("POST", `/api/invoices/${spec.invoiceId}/ai-fraud-check`);
            const fraudData = await parseJsonResponse<any>(fraudRes);
            if (!cancelled) setInvoiceFraud(fraudData);
          } catch {
            /* optional */
          }
        } catch (err: any) {
          if (!cancelled) setAiError(err?.message || "Invoice AI checks failed");
        } finally {
          if (!cancelled) setAiLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spec.alertType, spec.poNumber, spec.invoiceId, isPo, isInvoice, isAIEnabled]);

  const po = poQuery.data || {};
  const invoice = invoiceQuery.data?.header || invoiceQuery.data || {};
  const label = PROCUREMENT_ALERT_TYPE_LABELS[spec.alertType] || spec.alertType;

  return (
    <Card className="mt-3 border-amber-200/80 dark:border-amber-900/50" data-testid="procurement-alert-review-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">{spec.title}</div>
            <div className="text-xs text-muted-foreground">{spec.subtitle || label}</div>
          </div>
          <StatusPill status={label} tone="warning" />
        </div>

        {(poQuery.isLoading || invoiceQuery.isLoading) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading alert details…
          </div>
        )}

        {isPo && !poQuery.isLoading && (
          <>
            <Section title="PO Details">
              <FieldGrid>
                <Field label="PO Number" value={fmt(spec.poNumber)} />
                <Field label="Status" value={fmt(po.po_status)} />
                <Field label="Supplier" value={fmt(po.company_name || po.supplier?.company_name)} />
                <Field label="Required Date" value={fmtDate(po.po_required_date)} />
                <Field label="Receipt Status" value={fmt(po.attribute_8 || "Not Received")} />
                <Field label="Supplier Ack" value={fmt(po.attribute_13 || "Pending")} />
                <Field label="Buyer" value={fmt(po.buyer_name || po.buyer)} />
                <Field label="Total" value={fmtMoney(po.total_amount, po.currency_code)} />
              </FieldGrid>
            </Section>

            {(spec.alertType === "dnUpdated" || spec.dnId) && (
              <Section title="Delivery Details">
                {(dnQuery.data || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No delivery notes found.</p>
                ) : (
                  <div className="space-y-2">
                    {(dnQuery.data || []).slice(0, 5).map((dn: any) => (
                      <div key={dn.id} className="rounded-md border px-2 py-1.5 text-xs">
                        <div className="font-medium">{dn.asn_number || dn.id}</div>
                        <div className="text-muted-foreground">
                          {[dn.status, dn.expected_arrival_date && `ETA ${String(dn.expected_arrival_date).slice(0, 10)}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {(spec.alertType === "receiptPending" ||
              spec.alertType === "deliveryOverdue" ||
              spec.alertType === "grnReadyToInvoice") && (
              <Section title="Receipt / GRN Details">
                {receiptQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Loading receipts…</p>
                ) : (
                  <FieldGrid>
                    <Field label="Fulfillment" value={fmt(po.attribute_8 || "Not Received")} />
                    <Field
                      label="Open receipts"
                      value={
                        Array.isArray(receiptQuery.data)
                          ? String(receiptQuery.data.length)
                          : receiptQuery.data
                            ? "Available"
                            : "—"
                      }
                    />
                  </FieldGrid>
                )}
              </Section>
            )}
          </>
        )}

        {isInvoice && !invoiceQuery.isLoading && (
          <Section title="Invoice Details">
            <FieldGrid>
              <Field label="Invoice #" value={fmt(invoice.invoice_number || spec.invoiceId)} />
              <Field label="Status" value={fmt(invoice.invoice_status)} />
              <Field label="PO" value={fmt(invoice.po_number || spec.poNumber)} />
              <Field label="Supplier" value={fmt(invoice.supplier_name)} />
              <Field label="Amount" value={fmtMoney(invoice.invoice_amount, invoice.invoice_curr_code)} />
              <Field label="Due Date" value={fmtDate(invoice.inv_due_date)} />
              <Field label="Match Status" value={fmt(invoice.inv_match_status)} />
            </FieldGrid>
          </Section>
        )}

        <AiSummaryBlock loading={aiLoading} error={aiError}>
          <div className="space-y-2 text-xs">
            {anomaly?.summary && (
              <p>
                Anomaly risk: <strong>{String(anomaly.summary.overallRisk || "n/a").toUpperCase()}</strong>
                {anomaly.summary.narrative ? ` — ${anomaly.summary.narrative}` : ""}
              </p>
            )}
            {deliveryRisk && (
              <p>
                Delivery risk: <strong>{String(deliveryRisk.riskLevel || "n/a").toUpperCase()}</strong>
                {deliveryRisk.narrative ? ` — ${deliveryRisk.narrative}` : ""}
              </p>
            )}
            {invoiceMatch && (
              <p>
                Match result:{" "}
                <strong>
                  {invoiceMatch.status || invoiceMatch.matchStatus || invoiceMatch.summary || "Completed"}
                </strong>
              </p>
            )}
            {invoiceFraud && (
              <p>
                Fraud check:{" "}
                <strong>
                  {invoiceFraud.riskLevel || invoiceFraud.status || "Completed"}
                </strong>
              </p>
            )}
            {!anomaly && !deliveryRisk && !invoiceMatch && !invoiceFraud && !aiLoading && (
              <p className="text-muted-foreground">
                Review the details above. Take action in the related PO or invoice workflow as needed.
              </p>
            )}
          </div>
        </AiSummaryBlock>

        {status !== "pending" && (
          <p className="text-[11px] text-muted-foreground capitalize">Alert {status}</p>
        )}
      </CardContent>
    </Card>
  );
}
