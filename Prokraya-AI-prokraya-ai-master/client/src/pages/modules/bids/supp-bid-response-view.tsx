import { FmpSupplierHint, type SupplierFmpView } from "@/components/fmpi/fmp-supplier-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  ClipboardList,
  CreditCard,
  DollarSign,
  File,
  Gavel,
  Mail, MapPin,
  Paperclip,
  User
} from "lucide-react";
import { Link, useRoute } from "wouter";

function formatDateTime(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const bidTypeLabels: Record<string, { label: string; full: string; className: string }> = {
  RFQ: { label: "RFQ", full: "Request for Quotation", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  RFP: { label: "RFP", full: "Request for Proposal", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  Tender: { label: "Tender", full: "Open Tender", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

const statusConfig: Record<string, { className: string }> = {
  Published: { className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  Submitted: { className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  Draft: { className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  Closed: { className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

function InfoItem({ label, value, icon: Icon, testId }: { label: string; value: string | null | undefined; icon?: any; testId?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className="text-sm font-medium" data-testid={testId}>{value || "-"}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count }: { icon: any; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {count !== undefined && (
        <Badge variant="secondary" className="ml-1">{count}</Badge>
      )}
    </div>
  );
}

export default function SupplierBidResponseView() {
  const [, params] = useRoute("/app/suppbids/:bidId/response/:id/view");
  const responseId = params?.id;
  const bidId = params?.bidId;

  const { data, isLoading, isError } = useQuery<{ response: any; requirements: any[]; lines: any[] }>({
    queryKey: ["/api/dbo/suppbids/response", responseId],
    enabled: !!responseId,
  });

  const { data: attachments } = useQuery<any[]>({
    queryKey: ["/api/dbo/suppbids/response", responseId, "attachments"],
    enabled: !!responseId,
  });

  const targetBidId = bidId || data?.response?.bidrefno || data?.response?.bid_id;
  const { data: fmpData } = useQuery<{ enabled: boolean; lines: Record<string, SupplierFmpView> }>({
    queryKey: ["/api/dbo/suppbids", targetBidId, "fmp"],
    enabled: !!targetBidId,
  });
  const fmpLines = fmpData?.enabled ? fmpData.lines : undefined;

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const resp = data?.response;
  const requirements = data?.requirements || [];
  const lines = data?.lines || [];

  if (isError || !resp) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-lg font-medium mb-2">Bid Response Not Found</h2>
            <p className="text-sm text-muted-foreground mb-4">The requested bid response could not be found.</p>
            <Link href="/app/suppbids">
              <Button variant="outline" data-testid="button-not-found-back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to My Bids
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currency = resp?.currency || "AED";
  const bidNumber = resp?.bid_number || "";
  const sConfig = statusConfig[resp.status] || statusConfig["Draft"];
  const bidType = resp.bidtype || "RFQ";
  const typeConfig = bidTypeLabels[bidType] || bidTypeLabels["RFQ"];

  const totalAmt = resp.bidtotal ? parseFloat(resp.bidtotal) : 0;
  const totalDisc = resp.biddisc ? parseFloat(resp.biddisc) : 0;
  const totalTax = resp.tax_amount ? parseFloat(resp.tax_amount) : 0;
  const grossTotal = resp.grosstotal ? parseFloat(resp.grosstotal) : 0;
  const amountInWords = resp.amount_in_words || "";

  const techAttachments = (attachments || []).filter((a: any) => a.attach_source === "Technical" || !a.attach_source);
  const finAttachments = (attachments || []).filter((a: any) => a.attach_source === "Financial");

  return (
    <div className="p-4 space-y-3 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 flex-wrap" data-testid="breadcrumb-response-view">
        <Link href="/app/suppbids">
          <Button variant="ghost" size="icon" data-testid="button-back-to-suppbids">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
          <Gavel className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold" data-testid="text-response-title">{bidNumber || `RESP-${resp.id}`}</h1>
            <Badge variant="outline" className={`border-0 ${typeConfig.className}`} data-testid="badge-bid-type">
              {typeConfig.full}
            </Badge>
            <Badge variant="secondary" className={sConfig.className} data-testid="badge-response-status">
              {resp.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="text-bid-title">{resp.bidtitle}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoItem label="Start Date" value={formatDateTime(resp.bidstartdate)} icon={Calendar} testId="text-bid-start" />
            <InfoItem label="End Date" value={formatDateTime(resp.bidenddate)} icon={Calendar} testId="text-bid-end" />
            <InfoItem label="Currency" value={currency} icon={DollarSign} testId="text-currency" />
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3" />
                Buyer
              </p>
              <p className="text-sm font-medium" data-testid="text-buyer-name">{resp.buyer_name || "-"}</p>
              {resp.buyer_email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" />{resp.buyer_email}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <InfoItem label="Payment Terms" value={resp.paymentterms} icon={CreditCard} testId="text-payment-terms" />
            <InfoItem label="Delivery Location" value={resp.delivertto_location_name} icon={MapPin} testId="text-delivery-loc" />
          </div>
          {resp.last_updated_date && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                Last submitted on {formatDateTime(resp.last_updated_date)} by {resp.last_modified_by || "-"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <SectionHeader icon={ClipboardList} title="Technical Bid" />
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {requirements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No requirements defined for this bid.</p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Category</TableHead>
                    <TableHead>Requirement</TableHead>
                    <TableHead className="w-[80px]">Option</TableHead>
                    <TableHead className="w-[25%]">Response</TableHead>
                    <TableHead className="w-[20%]">Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requirements.map((req: any) => (
                    <TableRow key={req.id} data-testid={`row-req-${req.id}`}>
                      <TableCell className="text-sm py-2">
                        <Badge variant="outline" className="text-xs">{req.category}</Badge>
                      </TableCell>
                      <TableCell className="text-sm py-2">{req.question}</TableCell>
                      <TableCell className="text-sm text-muted-foreground py-2">{req.qvoption}</TableCell>
                      <TableCell className="text-sm py-2" data-testid={`text-req-response-${req.id}`}>
                        {req.response || "-"}
                      </TableCell>
                      <TableCell className="text-sm py-2 text-muted-foreground" data-testid={`text-req-remarks-${req.id}`}>
                        {req.remarks || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4 pt-3 border-t">
            <span className="text-sm font-semibold flex items-center gap-2 mb-2">
              <Paperclip className="h-4 w-4" />
              Technical Attachments
            </span>
            {techAttachments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No technical documents attached.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                  <TableHeader>
                    <TableRow>
                      <TableHead>File Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Uploaded By</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {techAttachments.map((att: any) => (
                      <TableRow key={att.id} data-testid={`row-tech-attachment-${att.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <File className="h-4 w-4 text-muted-foreground shrink-0" />
                            {att.attach_path ? (
                              <a
                                href={`/api/dbo/suppbids/response/${responseId}/attachments/${att.id}/download`}
                                download
                                className="font-medium text-sm text-primary hover:underline cursor-pointer"
                                data-testid={`link-download-tech-attachment-${att.id}`}
                              >
                                {att.attach_name}
                              </a>
                            ) : (
                              <span className="font-medium text-sm">{att.attach_name}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{att.attach_desc || "-"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{att.created_by || "-"}</TableCell>
                        <TableCell className="text-sm">{formatDate(att.created_date)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionHeader icon={ClipboardList} title="Financial Bid" />
            {fmpLines && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 text-purple-900 border border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/60 text-xs font-medium whitespace-nowrap shadow-xs">
                <AlertCircle className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 shrink-0" aria-hidden="true" />
                <span>AI can make mistakes. Please verify.</span>
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No line items defined for this bid.</p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Bid Qty</TableHead>
                    <TableHead>UOM</TableHead>
                    {resp.tax_included === "Yes" ?
                      <>
                        <TableHead className="w-[150px]">Total Amount</TableHead>
                        <TableHead className="w-[150px]">Tax Rate</TableHead>
                        <TableHead className="w-[150px]">Tax Amount</TableHead>
                        <TableHead className="w-[150px]">Unit Price</TableHead>
                      </> : <>
                        <TableHead className="w-[150px]">Unit Price</TableHead>
                        <TableHead className="w-[150px]">Tax</TableHead>
                        <TableHead className="w-[150px]">Disc Unit Price</TableHead>
                      </>}
                    <TableHead className="w-[60px]">Curr.</TableHead>
                    <TableHead>Promised Date</TableHead>
                    <TableHead>Need By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line: any) => (
                    <TableRow key={line.id} data-testid={`row-line-${line.id}`}>
                      <TableCell className="py-2">
                        <div className="text-sm font-medium">{line.description}</div>
                        {line.product_category && <div className="text-xs text-muted-foreground">{line.product_category}</div>}
                        <FmpSupplierHint
                          fmp={line.bid_line_id ? (fmpLines?.[String(line.bid_line_id)] || fmpLines?.[String(line.id)]) : fmpLines?.[String(line.id)]}
                          currency={currency}
                          testId={`text-fmp-line-${line.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-right font-mono py-2">{line.quantity}</TableCell>
                      <TableCell className="text-sm py-2">{line.uom || "-"}</TableCell>
                      {resp.tax_included === "Yes" ?
                        <>
                          <TableCell className="text-sm font-mono py-2" data-testid={`text-line-total-price-${line.id}`}>
                            {formatCurrency(
                              Math.round(
                                ((Number(line.bidprice) || 0) * (Number(line.quantity) || 0)) / 
                                (1 - (Number(line.rate) || 0) / 100)
                              ),
                              line.currency || currency
                            )}
                          </TableCell>
                          <TableCell className="text-sm font-mono py-2" data-testid={`text-line-tax-${line.id}`}>
                            {line.rate ? line.rate + "%" : "-"}
                          </TableCell>
                          <TableCell className="text-sm font-mono py-2" data-testid={`text-line-tax-amount-${line.id}`}>
                            {formatCurrency(
                              (
                                Math.round(
                                  ((Number(line.bidprice) || 0) * (Number(line.quantity) || 0)) / 
                                  (1 - (Number(line.rate) || 0) / 100)
                                ) * (Number(line.rate) || 0)
                              ) / 100,
                              line.currency || currency
                            )}
                          </TableCell>
                          <TableCell className="text-sm font-mono py-2" data-testid={`text-line-base-price-${line.id}`}>
                            {line.bidprice}
                          </TableCell>
                        </>
                        : <>
                          <TableCell className="text-sm font-mono py-2" data-testid={`text-line-price-${line.id}`}>
                            {line.bidprice != null ? formatCurrency(line.bidprice, line.currency || currency) : "-"}
                          </TableCell>
                          <TableCell className="text-sm font-mono py-2" data-testid={`text-line-tax-${line.id}`}>
                            {line.rate ? line.rate + "%" : "-"}
                          </TableCell>
                          <TableCell className="text-sm font-mono py-2" data-testid={`text-line-disc-${line.id}`}>
                            {line.discprice != null ? formatCurrency(line.discprice, line.currency || currency) : "-"}
                          </TableCell>
                        </>}
                      <TableCell className="text-sm py-2">{line.currency || currency}</TableCell>
                      <TableCell className="text-sm py-2" data-testid={`text-line-date-${line.id}`}>
                        {line.promised_date ? formatDate(line.promised_date) : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-2">
                        {formatDate(line.attribute_1) || "N/A"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4 flex flex-col items-end gap-1.5 text-[0.9rem]">
            <div className="flex items-center gap-3">
              <span className="font-medium">Total Amount:</span>
              <span className="w-36 text-right" data-testid="text-total-amount">{formatCurrency(totalAmt, currency)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium">Discount Amount:</span>
              <span className="w-36 text-right" data-testid="text-discount-amount">{formatCurrency(totalDisc, currency)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium">Tax Amount:</span>
              <span className="w-36 text-right" data-testid="text-tax-amount">{formatCurrency(totalTax, currency)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold">Net Total Amount:</span>
              <span className="font-semibold w-36 text-right" data-testid="text-gross-total">{formatCurrency(grossTotal, currency)}</span>
            </div>
            {amountInWords && (
              <div className="flex items-center gap-3">
                <span className="font-medium">Amount in Words:</span>
                <span className="text-muted-foreground" data-testid="text-amount-words">{amountInWords}</span>
              </div>
            )}
          </div>

          {resp.amtcomments && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-1">Comments</p>
              <p className="text-sm bg-muted/50 rounded-md p-3" data-testid="text-comments">{resp.amtcomments}</p>
            </div>
          )}

          <div className="mt-4 pt-3 border-t">
            <span className="text-sm font-semibold flex items-center gap-2 mb-2">
              <Paperclip className="h-4 w-4" />
              Financial Attachments
            </span>
            {finAttachments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No financial documents attached.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                  <TableHeader>
                    <TableRow>
                      <TableHead>File Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Uploaded By</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {finAttachments.map((att: any) => (
                      <TableRow key={att.id} data-testid={`row-fin-attachment-${att.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <File className="h-4 w-4 text-muted-foreground shrink-0" />
                            {att.attach_path ? (
                              <a
                                href={`/api/dbo/suppbids/response/${responseId}/attachments/${att.id}/download`}
                                download
                                className="font-medium text-sm text-primary hover:underline cursor-pointer"
                                data-testid={`link-download-fin-attachment-${att.id}`}
                              >
                                {att.attach_name}
                              </a>
                            ) : (
                              <span className="font-medium text-sm">{att.attach_name}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{att.attach_desc || "-"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{att.created_by || "-"}</TableCell>
                        <TableCell className="text-sm">{formatDate(att.created_date)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {resp.notes && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm" data-testid="text-notes">{resp.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
