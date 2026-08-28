import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Eye,
  File as FileIcon,
  FileImage,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest, fetchSafe, parseJsonResponse } from "@/lib/queryClient";
import { formatDate, handleDownloadDocument } from "@/lib/common-functions";
import { Section } from "./procurement-activation/card-primitives";

/** Shape returned by GET /api/invoices/:id/documents (see invoices.service.getInvoiceDocuments). */
export type PayablesInvoiceDocument = {
  id: number;
  file_name: string;
  file_path: string;
  created_by: string;
  created_date: string;
  doc_type?: string;
  source?: string;
  preview_url?: string;
};

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];

function extensionOf(fileName?: string): string {
  return String(fileName || "").split(".").pop()?.toLowerCase() || "";
}

/**
 * SUPP_INVOICE docs live in supp_document_dtls and are served by a different
 * route than collaboration attachments — same split as the invoice detail page.
 */
function documentDownloadUrl(doc: PayablesInvoiceDocument, invoiceId: string): string {
  return doc.source === "SUPP_INVOICE"
    ? `/api/invoices/documents/${doc.id}/download`
    : `/api/invoices/${invoiceId}/documents/${doc.id}/download`;
}

function DocumentIcon({ doc }: { doc: PayablesInvoiceDocument }) {
  const ext = extensionOf(doc.file_name);
  if (doc.preview_url) {
    return (
      <img
        src={doc.preview_url}
        alt=""
        className="h-6 w-6 shrink-0 rounded-sm object-cover"
      />
    );
  }
  if (ext === "pdf") return <FileText className="h-4 w-4 shrink-0 text-red-500/80" />;
  if (IMAGE_EXTENSIONS.includes(ext)) {
    return <FileImage className="h-4 w-4 shrink-0 text-blue-500/80" />;
  }
  if (["doc", "docx"].includes(ext)) {
    return <FileText className="h-4 w-4 shrink-0 text-blue-600/80" />;
  }
  return <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground/70" />;
}

/**
 * Renders the invoice's attached documents inside the agent card. Previews open
 * in a popover anchored to the document row so reviewers never leave the chat.
 */
export function PayablesInvoiceDocuments({ invoiceId }: { invoiceId: string }) {
  const [openDocId, setOpenDocId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const documentsQuery = useQuery<PayablesInvoiceDocument[]>({
    queryKey: ["/api/invoices", invoiceId, "documents"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/invoices/${invoiceId}/documents`);
      return parseJsonResponse<PayablesInvoiceDocument[]>(res);
    },
    enabled: !!invoiceId,
  });

  const releaseObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  useEffect(() => releaseObjectUrl, []);

  const closePreview = () => {
    setOpenDocId(null);
    setPreviewUrl(null);
    setPreviewError(null);
    releaseObjectUrl();
  };

  const openPreview = async (doc: PayablesInvoiceDocument) => {
    releaseObjectUrl();
    setOpenDocId(doc.id);
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewLoading(true);

    try {
      const res = await fetchSafe(documentDownloadUrl(doc, invoiceId));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err: any) {
      setPreviewError(err?.message || "Unable to load this document.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const documents = Array.isArray(documentsQuery.data) ? documentsQuery.data : [];

  if (documentsQuery.isLoading) {
    return (
      <Section title="Invoice Document">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading documents…
        </p>
      </Section>
    );
  }

  if (documentsQuery.isError) {
    return (
      <Section title="Invoice Document">
        <p className="text-xs text-rose-600">Failed to load invoice documents.</p>
      </Section>
    );
  }

  if (documents.length === 0) {
    return (
      <Section title="Invoice Document">
        <p className="text-xs text-muted-foreground">No document attached to this invoice.</p>
      </Section>
    );
  }

  return (
    <Section title={`Invoice Document (${documents.length})`}>
      <div className="space-y-2" data-testid="payables-invoice-documents">
        {documents.map((doc) => {
          const ext = extensionOf(doc.file_name);
          const isOpen = openDocId === doc.id;
          const isPdf = ext === "pdf";
          const isImage = IMAGE_EXTENSIONS.includes(ext);
          const downloadUrl = documentDownloadUrl(doc, invoiceId);

          return (
            <div
              key={doc.id}
              className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2"
            >
              <DocumentIcon doc={doc} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium" title={doc.file_name}>
                  {doc.file_name}
                </div>
                {doc.doc_type ? (
                  <div className="text-[10px] text-muted-foreground">{doc.doc_type}</div>
                ) : null}
              </div>

              <Popover
                open={isOpen}
                onOpenChange={(open) => (open ? openPreview(doc) : closePreview())}
              >
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-[11px]"
                    data-testid={`payables-invoice-doc-preview-${doc.id}`}
                  >
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="top"
                  className="w-[420px] p-3"
                  data-testid={`payables-invoice-doc-preview-panel-${doc.id}`}
                >
                  <div className="space-y-3">
                    <div className="flex h-56 items-center justify-center overflow-hidden rounded-md border bg-muted/50">
                      {previewLoading ? (
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading document…
                        </p>
                      ) : previewError ? (
                        <p className="px-3 text-center text-xs text-rose-600">{previewError}</p>
                      ) : previewUrl && isPdf ? (
                        <iframe
                          src={previewUrl}
                          title={doc.file_name}
                          className="h-full w-full bg-white"
                        />
                      ) : previewUrl && isImage ? (
                        <img
                          src={previewUrl}
                          alt={doc.file_name}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1.5">
                          <FileIcon className="h-12 w-12 text-muted-foreground/40" />
                          <span className="text-xs font-medium text-muted-foreground">
                            {ext ? ext.toUpperCase() : "Document"}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">File Name</span>
                        <span
                          className="max-w-[240px] truncate text-right font-medium"
                          title={doc.file_name}
                        >
                          {doc.file_name}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-medium">{ext ? ext.toUpperCase() : "-"}</span>
                      </div>
                      {doc.created_by ? (
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Uploaded By</span>
                          <span className="font-medium">{doc.created_by}</span>
                        </div>
                      ) : null}
                      {doc.created_date ? (
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Date</span>
                          <span className="font-medium">{formatDate(doc.created_date)}</span>
                        </div>
                      ) : null}
                    </div>

                    <Button
                      size="sm"
                      className="h-8 w-full gap-1.5 text-xs"
                      onClick={() => handleDownloadDocument(doc, downloadUrl)}
                      data-testid={`payables-invoice-doc-preview-download-${doc.id}`}
                    >
                      <Download className="h-3.5 w-3.5" /> Download Document
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Download"
                onClick={() => handleDownloadDocument(doc, downloadUrl)}
                data-testid={`payables-invoice-doc-download-${doc.id}`}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
