import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Landmark,
  Loader2,
  Mail,
  Phone,
  User,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import { formatDate, handleDownloadDocument } from "@/lib/common-functions";
import type {
  DboSupplier,
  DboSupplierBank,
  DboSupplierContact,
  DboSupplierDocument,
  DboSupplierRefCompany,
  DboSupplierService,
} from "@shared/schema";
import type { SupplierApprovalReviewSpec } from "@shared/supplier-activation-signals";

export type SupplierApprovalAction = "Approve" | "Reject" | "More";
type ApprovalAction = SupplierApprovalAction;

export type SupplierApprovalChatActionRequest = {
  nonce: number;
  /** start = open confirm panel; confirm = submit with comments; cancel = dismiss panel */
  kind: "start" | "confirm" | "cancel";
  action?: SupplierApprovalAction;
  comments?: string;
};

type ApprovalStatus = "pending" | "approved" | "rejected" | "more_info";

type VendorChange = {
  section: string;
  field: string;
  label: string;
  oldValue: string | null;
  newValue: string | null;
  recordId?: number;
};

function actionResultLabel(action: ApprovalAction): "approved" | "rejected" | "more_info" {
  if (action === "Approve") return "approved";
  if (action === "Reject") return "rejected";
  return "more_info";
}

function actionConfirmTitle(action: ApprovalAction): string {
  if (action === "Approve") return "Approve";
  if (action === "Reject") return "Reject";
  return "Request More Info for";
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  const display =
    value === undefined || value === null || value === "" ? "—" : value;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground break-words">{display}</span>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-background/60 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
        <span className="text-xs font-semibold">{title}</span>
        {typeof count === "number" && (
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            {count}
          </Badge>
        )}
      </div>
      {children}
    </div>
  );
}

function fmt(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

function fmtDate(value: unknown): string | undefined {
  if (!value) return undefined;
  try {
    return formatDate(new Date(value as string));
  } catch {
    return fmt(value);
  }
}

export function SupplierApprovalReviewCard({
  spec,
  status,
  disabled,
  onComplete,
  chatActionRequest,
  onChatActionHandled,
  onConfirmationStateChange,
}: {
  spec: SupplierApprovalReviewSpec;
  status: ApprovalStatus;
  disabled?: boolean;
  onComplete: (result: "approved" | "rejected" | "more_info") => void;
  chatActionRequest?: SupplierApprovalChatActionRequest | null;
  onChatActionHandled?: () => void;
  onConfirmationStateChange?: (action: SupplierApprovalAction | null) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const [selectedAction, setSelectedAction] = useState<ApprovalAction | null>(null);
  const [approvalComments, setApprovalComments] = useState("");
  const vendorId = spec.supplierId;

  const { data: vendor, isLoading } = useQuery<DboSupplier>({
    queryKey: ["/api/dbo/suppliers", vendorId],
    enabled: !!vendorId,
  });

  const { data: contacts = [] } = useQuery<DboSupplierContact[]>({
    queryKey: ["/api/dbo/suppliers", vendorId, "contacts"],
    enabled: !!vendorId,
  });

  const { data: banks = [] } = useQuery<DboSupplierBank[]>({
    queryKey: ["/api/dbo/suppliers", vendorId, "banks"],
    enabled: !!vendorId,
  });

  const { data: documents = [] } = useQuery<DboSupplierDocument[]>({
    queryKey: ["/api/dbo/suppliers", vendorId, "documents"],
    enabled: !!vendorId,
  });

  const { data: services = [] } = useQuery<DboSupplierService[]>({
    queryKey: ["/api/dbo/suppliers", vendorId, "services"],
    enabled: !!vendorId,
  });

  const { data: refCompanies = [] } = useQuery<DboSupplierRefCompany[]>({
    queryKey: ["/api/dbo/suppliers", vendorId, "ref-companies"],
    enabled: !!vendorId,
  });

  const { data: vendorChanges = [] } = useQuery<VendorChange[]>({
    queryKey: ["/api/dbo/suppliers", vendorId, "changes"],
    enabled: !!vendorId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const filteredChanges = useMemo(
    () =>
      vendorChanges.filter((change) => {
        const oldVal = change.oldValue?.trim();
        const newVal = change.newValue?.trim();
        return (
          oldVal !== null &&
          oldVal !== undefined &&
          oldVal !== "" &&
          oldVal !== newVal
        );
      }),
    [vendorChanges],
  );

  const changesBySection = useMemo(() => {
    const grouped: Record<string, VendorChange[]> = {};
    for (const change of filteredChanges) {
      if (!grouped[change.section]) grouped[change.section] = [];
      grouped[change.section].push(change);
    }
    return Object.entries(grouped);
  }, [filteredChanges]);

  const primaryContact = useMemo(
    () =>
      contacts.find((c) => c.isPrimary === "Yes") ??
      contacts.find((c) => c.isAuthSignatory === "Yes") ??
      contacts[0],
    [contacts],
  );

  const approvalMutation = useMutation({
    mutationFn: async ({
      action,
      comments,
    }: {
      action: ApprovalAction;
      comments: string;
    }) => {
      if (!spec.taskId) {
        throw new Error("No active task found for this supplier.");
      }
      if (!comments.trim()) {
        throw new Error("Comments are required.");
      }
      const res = await apiRequest("POST", `/api/dbo/suppliers/${vendorId}/process-approval`, {
        taskId: spec.taskId,
        result: action,
        comments: comments.trim(),
      });
      return parseJsonResponse<any>(res);
    },
    onSuccess: (_data, variables) => {
      const result = actionResultLabel(variables.action);
      const actionLabel =
        variables.action === "Approve"
          ? "approved"
          : variables.action === "Reject"
            ? "rejected"
            : "returned for more information";
      toast({
        title: "Action completed",
        description: `Supplier registration has been ${actionLabel}.`,
      });
      setSelectedAction(null);
      setApprovalComments("");
      onConfirmationStateChange?.(null);
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", vendorId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", vendorId, "changes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", vendorId, "approval-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", vendorId, "workflow-approval-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-agent/activation-signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pending-approvals"] });
      onComplete(result);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to complete action",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const beginAction = (action: ApprovalAction, comments = "") => {
    setSelectedAction(action);
    setApprovalComments(comments);
    onConfirmationStateChange?.(action);
  };

  const cancelAction = () => {
    setSelectedAction(null);
    setApprovalComments("");
    onConfirmationStateChange?.(null);
  };

  const confirmAction = (overrideComments?: string) => {
    const action = selectedAction;
    if (!action) return;
    const comments = (overrideComments ?? approvalComments).trim();
    if (!comments) {
      toast({
        title: "Validation Failure",
        description: "Comments are required.",
        variant: "destructive",
      });
      return;
    }
    approvalMutation.mutate({
      action,
      comments,
    });
  };

  const isDone = status === "approved" || status === "rejected" || status === "more_info";
  const isBusy = approvalMutation.isPending || disabled;

  // Chat commands drive the same panel / mutation path as the buttons.
  useEffect(() => {
    if (!chatActionRequest || isDone || disabled) return;
    if (!spec.taskId) {
      toast({
        title: "Unable to proceed",
        description: "No workflow task is linked to this supplier.",
        variant: "destructive",
      });
      onChatActionHandled?.();
      return;
    }

    const kind = chatActionRequest.kind || "start";

    if (kind === "cancel") {
      cancelAction();
      onChatActionHandled?.();
      return;
    }

    if (kind === "confirm") {
      const action = chatActionRequest.action || selectedAction;
      const comments = chatActionRequest.comments?.trim() || "";
      if (!action) {
        onChatActionHandled?.();
        return;
      }
      if (!comments) {
        setSelectedAction(action);
        onConfirmationStateChange?.(action);
        toast({
          title: "Validation Failure",
          description: "Comments are required.",
          variant: "destructive",
        });
        onChatActionHandled?.();
        return;
      }
      setSelectedAction(action);
      setApprovalComments(comments);
      approvalMutation.mutate({ action, comments });
      onChatActionHandled?.();
      return;
    }

    // kind === "start"
    const action = chatActionRequest.action;
    if (!action) {
      onChatActionHandled?.();
      return;
    }
    const comments = chatActionRequest.comments?.trim() || "";
    // A classified chat action may select and prefill this panel, but only an
    // explicit confirm request (or the Confirm button) may execute the mutation.
    beginAction(action, comments);
    onChatActionHandled?.();
    // Only react to a new chatActionRequest identity (nonce).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatActionRequest]);

  const address = [vendor?.address1, vendor?.address2, vendor?.city, vendor?.state, vendor?.country, vendor?.postalcode]
    .filter(Boolean)
    .join(", ");

  return (
    <>
    <Card className="border-cyan-200 dark:border-cyan-800 bg-cyan-50/30 dark:bg-cyan-900/10">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-cyan-100 dark:bg-cyan-900/30 shrink-0">
              <Building2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {vendor?.companyName || spec.companyName}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Supplier #{vendorId} · Pending Approval
              </p>
            </div>
          </div>
          {status === "approved" && (
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Approved
            </Badge>
          )}
          {status === "rejected" && (
            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 gap-1">
              <XCircle className="h-3 w-3" /> Rejected
            </Badge>
          )}
          {status === "more_info" && (
            <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 gap-1">
              <AlertCircle className="h-3 w-3" /> More Info Requested
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading supplier profile…
          </div>
        ) : (
          <>
            {filteredChanges.length > 0 && (
              <div
                className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-3"
                data-testid="card-supplier-changes-review"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                      Changes Pending Review
                    </span>
                    <Badge
                      variant="outline"
                      className="border-amber-400 text-amber-700 dark:text-amber-300 h-5 px-1.5 text-[10px]"
                    >
                      {filteredChanges.length} change
                      {filteredChanges.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                    The supplier has modified their profile. Review the changes below before approving or rejecting.
                  </p>
                </div>

                {changesBySection.map(([section, items]) => (
                  <div key={section} className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                      {section}
                    </h4>
                    <div className="space-y-1.5">
                      {items.map((change, idx) => (
                        <div
                          key={`${change.field}-${change.recordId || idx}`}
                          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs rounded-md bg-white/60 dark:bg-white/5 px-2.5 py-1.5"
                          data-testid={`supplier-change-item-${change.field}`}
                        >
                          <span className="font-medium text-muted-foreground min-w-[110px]">
                            {change.label}
                          </span>
                          <span className="line-through text-destructive/70">
                            {change.oldValue || "(empty)"}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {change.newValue || "(empty)"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Section icon={Building2} title="Company Information">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Company Name" value={fmt(vendor?.companyName)} />
                <Field label="Email" value={fmt(vendor?.emailId)} />
                <Field label="Phone" value={fmt(vendor?.phone)} />
                <Field label="Website" value={fmt(vendor?.webAddress)} />
                <Field label="Supplier Type" value={fmt(vendor?.supplierType)} />
                <Field label="Category" value={fmt(vendor?.vendorCategory)} />
                <div className="col-span-2 sm:col-span-3">
                  <Field label="Address" value={address || undefined} />
                </div>
              </div>
            </Section>

            {primaryContact && (
              <Section icon={User} title="Primary Contact">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Name" value={fmt(primaryContact.contactName)} />
                  <Field label="Designation" value={fmt(primaryContact.designation)} />
                  <Field label="Department" value={fmt(primaryContact.department)} />
                  <Field label="Email" value={fmt(primaryContact.email)} />
                  <Field label="Mobile" value={fmt(primaryContact.mobile || primaryContact.phone)} />
                </div>
              </Section>
            )}

            <Section icon={FileText} title="Business Details">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="License Number" value={fmt(vendor?.licenseNo)} />
                <Field label="Place of Issue" value={fmt(vendor?.placeOfIssue)} />
                <Field label="Business Expiry Date" value={fmtDate(vendor?.expiryDate)} />
                <Field label="Legal Entity Type" value={fmt(vendor?.legalEntityType)} />
                <Field label="PAN No" value={fmt(vendor?.panNo)} />
                <Field label="Annual Turnover" value={fmt(vendor?.annualTurnOver)} />
                <Field label="Turnover Currency" value={fmt(vendor?.turnOverCurrency)} />
                <Field label="Working Days" value={[vendor?.workingdayStart, vendor?.workingdayEnd].filter(Boolean).join(" – ") || undefined} />
                <Field label="Working Hours" value={[vendor?.workingTimeStartTime, vendor?.workingTimeEndTime].filter(Boolean).join(" – ") || undefined} />
              </div>
            </Section>

            <Section icon={Landmark} title="Tax Details">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="GST/VAT Registration No" value={fmt(vendor?.taxRegNo)} />
                <Field label="Tax Identification No (TIN)" value={fmt(vendor?.taxPayerId)} />
                <Field label="Payment Terms" value={fmt(vendor?.paymentTerms)} />
                <Field label="Tax Effective Date" value={fmtDate(vendor?.taxEffectiveDate)} />
                <Field label="Transaction Currency" value={fmt(vendor?.transactCurr)} />
              </div>
            </Section>

            {services.length > 0 && (
              <Section icon={FileText} title="Scope of Supply" count={services.length}>
                <div className="flex flex-wrap gap-1.5">
                  {services.map((svc) => (
                    <Badge key={svc.id} variant="outline" className="text-[11px]">
                      {svc.subCategory || svc.categoryCode || svc.serviceDetails || "Category"}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            {contacts.length > 0 && (
              <Section icon={User} title="Contacts" count={contacts.length}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {contacts.map((c) => (
                    <div key={c.id} className="rounded border bg-background p-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{c.contactName || "Contact"}</span>
                        {c.isPrimary === "Yes" && (
                          <Badge variant="secondary" className="h-4 px-1 text-[9px]">Primary</Badge>
                        )}
                        {c.isAuthSignatory === "Yes" && (
                          <Badge variant="secondary" className="h-4 px-1 text-[9px]">Auth Signatory</Badge>
                        )}
                      </div>
                      {c.designation && (
                        <p className="text-[11px] text-muted-foreground">{c.designation}</p>
                      )}
                      <div className="mt-1 space-y-0.5">
                        {c.email && (
                          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Mail className="h-3 w-3" /> {c.email}
                          </p>
                        )}
                        {(c.mobile || c.phone) && (
                          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Phone className="h-3 w-3" /> {c.mobile || c.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {banks.length > 0 && (
              <Section icon={Landmark} title="Banking" count={banks.length}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {banks.map((b) => (
                    <div key={b.id} className="rounded border bg-background p-2 space-y-0.5">
                      <p className="text-xs font-medium">{b.bankName || "Bank"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        A/C: {b.accountNo || "—"} {b.currency ? `· ${b.currency}` : ""}
                      </p>
                      {(b.ifsccode || b.swiftCode) && (
                        <p className="text-[11px] text-muted-foreground">
                          {b.ifsccode ? `IFSC: ${b.ifsccode}` : ""} {b.swiftCode ? `· SWIFT: ${b.swiftCode}` : ""}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {documents.length > 0 && (
              <Section icon={FileText} title="Documents" count={documents.length}>
                <div className="flex flex-col gap-1">
                  {documents.map((d) => {
                    const raw = d as any;
                    const hasPreview = !!raw.doc_uri;
                    const hasDownload = !!raw.doc_path;
                    return (
                      <div key={d.id} className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="text-[11px] truncate">
                            {d.docName || d.filename || d.docType || "Document"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {d.expiryDate && (
                            <span className="text-[10px] text-muted-foreground">
                              Exp: {fmtDate(d.expiryDate)}
                            </span>
                          )}
                          {hasPreview && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => setPreviewDoc(raw)}
                              title="Preview"
                              data-testid={`button-supplier-doc-preview-${d.id}`}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {hasDownload && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() =>
                                handleDownloadDocument(raw, `/api/vendor/documents/${d.id}/download`)
                              }
                              title="Download"
                              data-testid={`button-supplier-doc-download-${d.id}`}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {refCompanies.length > 0 && (
              <Section icon={Building2} title="References" count={refCompanies.length}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {refCompanies.map((r) => (
                    <div key={r.id} className="rounded border bg-background p-2 space-y-0.5">
                      <p className="text-xs font-medium">{r.contactName || "Reference"}</p>
                      {r.refCompanyName && (
                        <p className="text-[11px] text-muted-foreground">{r.refCompanyName}</p>
                      )}
                      {r.email && (
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Mail className="h-3 w-3" /> {r.email}
                        </p>
                      )}
                      {(r.mobile || r.phone) && (
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Phone className="h-3 w-3" /> {r.mobile || r.phone}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {!isDone && (
              <div className="space-y-2 pt-1">
                {!selectedAction ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      onClick={() => beginAction("Approve")}
                      disabled={isBusy || !spec.taskId}
                      data-testid="button-supplier-approve"
                    >
                      <Check className="h-3 w-3" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-300"
                      onClick={() => beginAction("More")}
                      disabled={isBusy || !spec.taskId}
                      data-testid="button-supplier-more-info"
                    >
                      <AlertCircle className="h-3 w-3" />
                      More Info Requested
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300"
                      onClick={() => beginAction("Reject")}
                      disabled={isBusy || !spec.taskId}
                      data-testid="button-supplier-reject"
                    >
                      <X className="h-3 w-3" />
                      Reject
                    </Button>
                  </div>
                ) : (
                  <div
                    className={`rounded-md border p-3 space-y-3 ${
                      selectedAction === "Approve"
                        ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20"
                        : selectedAction === "Reject"
                          ? "border-red-300 dark:border-red-700 bg-red-50/40 dark:bg-red-950/20"
                          : "border-orange-300 dark:border-orange-700 bg-orange-50/40 dark:bg-orange-950/20"
                    }`}
                    data-testid="supplier-approval-action-panel"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        Are you sure want to {actionConfirmTitle(selectedAction)} this Supplier?
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {selectedAction === "More"
                          ? "Describe what additional information is needed. The supplier will be notified and asked to update their profile."
                          : "Add a comment to confirm this action. Comments are required."}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="supplier-approval-comments"
                        className="text-xs font-medium"
                      >
                        Comments <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        id="supplier-approval-comments"
                        value={approvalComments}
                        onChange={(e) => setApprovalComments(e.target.value)}
                        placeholder="Enter your comments..."
                        rows={4}
                        className="resize-none text-sm"
                        disabled={isBusy}
                        data-testid="input-supplier-approval-comments"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={cancelAction}
                        disabled={isBusy}
                        data-testid="button-supplier-approval-no"
                      >
                        NO
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => confirmAction()}
                        disabled={isBusy || !approvalComments.trim() || !spec.taskId}
                        className={
                          selectedAction === "Approve"
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : selectedAction === "Reject"
                              ? "bg-destructive hover:bg-destructive/90 text-white"
                              : "bg-orange-500 hover:bg-orange-600 text-white"
                        }
                        data-testid="button-supplier-approval-yes"
                      >
                        {approvalMutation.isPending ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : null}
                        YES
                      </Button>
                    </div>
                  </div>
                )}
                {!spec.taskId && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    No workflow task is linked to this supplier, so it can't be approved from here.
                  </p>
                )}
              </div>
            )}

            {isDone && (
              <div
                className={`flex items-center gap-1.5 pt-1 text-xs ${
                  status === "approved"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : status === "rejected"
                      ? "text-red-600 dark:text-red-400"
                      : "text-orange-600 dark:text-orange-400"
                }`}
              >
                {status === "approved" && <CheckCircle2 className="h-3.5 w-3.5" />}
                {status === "rejected" && <XCircle className="h-3.5 w-3.5" />}
                {status === "more_info" && <AlertCircle className="h-3.5 w-3.5" />}
                {status === "approved"
                  ? "Registration approved."
                  : status === "rejected"
                    ? "Registration rejected."
                    : "Returned for more information."}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>

    <Dialog
      open={!!previewDoc}
      onOpenChange={(open) => {
        if (!open) setPreviewDoc(null);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">
            {previewDoc?.filename || previewDoc?.doc_name || "Document Preview"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/30 rounded-md min-h-[300px]">
          {previewDoc?.doc_uri && (
            <img
              src={`data:image/png;base64,${previewDoc.doc_uri}`}
              alt="Document preview"
              className="max-w-full max-h-[65vh] object-contain"
              data-testid="img-supplier-doc-preview"
            />
          )}
        </div>
        {previewDoc?.doc_path && (
          <div className="flex justify-end pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!previewDoc) return;
                handleDownloadDocument(previewDoc, `/api/vendor/documents/${previewDoc.id}/download`);
              }}
              data-testid="button-supplier-doc-preview-download"
            >
              <Download className="h-4 w-4 mr-1" /> Download
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
