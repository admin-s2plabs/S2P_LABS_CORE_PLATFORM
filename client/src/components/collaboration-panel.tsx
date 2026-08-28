import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSidebar } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Download,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Send,
  StickyNote,
  Trash2,
  X
} from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

const ALLOWED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

interface Document {
  id: number;
  file_name: string;
  file_path: string;
  created_by: string;
  created_date: string;
}

interface Comment {
  id: number;
  comments: string;
  created_by: string;
  created_by_name: string;
  creation_date: string;
}

type EntityType = "PR" | "BUDGET" | "PO" | "BID" | "CONTRACT" | "INVOICE";

interface CollaborationCounts {
  documentsCount: number;
  commentsCount: number;
  hasNotes: boolean;
  totalCount: number;
}

interface CollaborationPanelProps {
  entityType: EntityType;
  entityId: string;
  notes?: string;
  notesLoading?: boolean;
  onSaveNotes?: (notes: string) => Promise<void>;
  notesLabel?: string;
  onCountsChange?: (counts: CollaborationCounts) => void;
  onPinChange?: (pinned: boolean) => void;
  currentUserName?: string;
  /** panel = fixed side drawer (default); inline = embed tabs inside a parent card */
  variant?: "panel" | "inline";
  /** Controlled open state for variant="inline" */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export interface CollaborationPanelRef {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
  isPinned: boolean;
  documentsCount: number;
  commentsCount: number;
  hasNotes: boolean;
}

const getApiBasePath = (entityType: EntityType, entityId: string) => {
  switch (entityType) {
    case "PR":
      return `/api/requisitions/${entityId}`;
    case "BUDGET":
      return `/api/budgets/${entityId}`;
    case "PO":
      return `/api/purchase-orders/${entityId}`;
    case "BID":
      return `/api/dbo/bids/${entityId}`;
    case "CONTRACT":
      return `/api/contracts/${entityId}`;
    case "INVOICE":
      return `/api/invoices/${entityId}`;
  }
};

export const CollaborationPanel = forwardRef<CollaborationPanelRef, CollaborationPanelProps>(
  (
    {
      entityType,
      entityId,
      notes: externalNotes,
      notesLoading,
      onSaveNotes,
      notesLabel,
      onCountsChange,
      onPinChange,
      currentUserName,
      variant = "panel",
      open: openProp,
      onOpenChange,
      className,
    },
    ref,
  ) => {
    const { toast } = useToast();
    const isInline = variant === "inline";
    // Sidebar is only needed for the side-panel pin behavior; AppPortal always provides it.
    const { setOpen: setSidebarOpen } = useSidebar();
    
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = isInline ? !!openProp : internalOpen;
    const setIsOpen = (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === "function" ? next(isOpen) : next;
      if (isInline) {
        onOpenChange?.(resolved);
      } else {
        setInternalOpen(resolved);
      }
    };
    const [isPinned, setIsPinned] = useState(false);
    const [activeTab, setActiveTab] = useState<"documents" | "notes" | "comments">("documents");
    const [commentText, setCommentText] = useState("");
    const [notesText, setNotesText] = useState("");
    const [isNotesEditing, setIsNotesEditing] = useState(false);
    const [isAddDocOpen, setIsAddDocOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [fileValidationError, setFileValidationError] = useState<string | null>(null);
    const [isSavingNotes, setIsSavingNotes] = useState(false);

    const basePath = getApiBasePath(entityType, entityId);
    const docsUrl = entityType === "INVOICE"
      ? `${basePath}/documents?source=collaboration`
      : `${basePath}/documents`;

    const { data: documentsData } = useQuery<Document[]>({
      queryKey: [docsUrl],
      enabled: !!entityId,
    });
    const documents = documentsData || [];

    const { data: commentsData } = useQuery<Comment[]>({
      queryKey: [`${basePath}/comments`],
      enabled: !!entityId,
    });
    const comments = commentsData || [];

    useImperativeHandle(ref, () => ({
      open: () => setIsOpen(true),
      close: () => {
        setIsOpen(false);
        if (!isInline) {
          setIsPinned(false);
          setSidebarOpen(true);
        }
      },
      toggle: () => setIsOpen((prev) => !prev),
      isOpen,
      isPinned,
      documentsCount: documents.length,
      commentsCount: comments.length,
      hasNotes: !!(externalNotes && externalNotes.trim().length > 0)
    }), [isOpen, isPinned, isInline, documents.length, comments.length, externalNotes, setSidebarOpen]);

    useEffect(() => {
      if (isInline) return;
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape" && isOpen && !isPinned) {
          setIsOpen(false);
        }
      };
      window.addEventListener("keydown", handleEscape);
      return () => window.removeEventListener("keydown", handleEscape);
    }, [isOpen, isPinned, isInline]);

    useEffect(() => {
      if (isInline) return;
      if (isPinned) {
        setSidebarOpen(false);
      }
    }, [isPinned, setSidebarOpen, isInline]);

    useEffect(() => {
      if (onCountsChange) {
        const hasNotes = !!(externalNotes && externalNotes.trim().length > 0);
        onCountsChange({
          documentsCount: documents.length,
          commentsCount: comments.length,
          hasNotes,
          totalCount: documents.length + comments.length + (hasNotes ? 1 : 0)
        });
      }
    }, [documents.length, comments.length, externalNotes, onCountsChange]);

    useEffect(() => {
      if (externalNotes !== undefined) {
        setNotesText(externalNotes);
      }
    }, [externalNotes]);

    const getAuthHeaders = (): Record<string, string> => {
      try {
        const parsed = JSON.parse(localStorage.getItem("prokraya-auth") || "{}");
        return {
          "x-user-email": parsed.userId || "",
          "x-user-name": parsed.userName || "",
        };
      } catch {
        return {};
      }
    };

    const addDocumentMutation = useMutation({
      mutationFn: async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`${basePath}/documents`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: formData,
          credentials: "include",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as any).error || "Failed to upload document");
        }
        return res.json();
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [docsUrl] });
        setIsAddDocOpen(false);
        setSelectedFile(null);
        toast({ title: "Document added", description: `Document has been attached to this ${entityType.toLowerCase()}.` });
      },
      onError: (error: Error) => {
        toast({ title: "Failed to add document", description: error.message, variant: "destructive" });
      }
    });

    const fetchDocumentBlob = async (docId: number): Promise<Blob> => {
      const res = await fetch(`${basePath}/documents/${docId}/download`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch document");
      return res.blob();
    };

    const handleDownloadDocument = async (doc: Document) => {
      try {
        const blob = await fetchDocumentBlob(doc.id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        toast({ title: "Failed to download document", variant: "destructive" });
      }
    };

    const handleViewDocument = async (doc: Document) => {
      try {
        const blob = await fetchDocumentBlob(doc.id);
        const url = URL.createObjectURL(blob);
        const tab = window.open(url, "_blank");
        if (!tab) toast({ title: "Allow pop-ups to view documents", variant: "destructive" });
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch {
        toast({ title: "Failed to open document", variant: "destructive" });
      }
    };

    const deleteDocumentMutation = useMutation({
      mutationFn: async (docId: number) => {
        return apiRequest("DELETE", `${basePath}/documents/${docId}`);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [docsUrl] });
        toast({ title: "Document deleted" });
      },
      onError: () => {
        toast({ title: "Failed to delete document", variant: "destructive" });
      }
    });

    const addCommentMutation = useMutation({
      mutationFn: async (commentMsg: string) => {
        return apiRequest("POST", `${basePath}/comments`, {
          comments: commentMsg,
          created_by: "system",
          created_by_name: currentUserName || "Unknown"
        });
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`${basePath}/comments`] });
        setCommentText("");
        toast({ title: "Comment added" });
      },
      onError: () => {
        toast({ title: "Failed to add comment", variant: "destructive" });
      }
    });

    const deleteCommentMutation = useMutation({
      mutationFn: async (commentId: number) => {
        return apiRequest("DELETE", `${basePath}/comments/${commentId}`);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`${basePath}/comments`] });
        toast({ title: "Comment deleted" });
      },
      onError: () => {
        toast({ title: "Failed to delete comment", variant: "destructive" });
      }
    });

    const handleSaveNotes = async () => {
      if (onSaveNotes) {
        setIsSavingNotes(true);
        try {
          await onSaveNotes(notesText);
          setIsNotesEditing(false);
          toast({ title: "Notes saved" });
        } catch {
          toast({ title: "Failed to save notes", variant: "destructive" });
        } finally {
          setIsSavingNotes(false);
        }
      }
    };

    const validateFile = (file: File): { valid: boolean; error?: string } => {
      if (file.size === 0) {
        return { valid: false, error: "File is empty (0 KB). Please select a valid file." };
      }
      if (file.size > MAX_FILE_SIZE) {
        return { valid: false, error: `File size exceeds 5 MB limit (${(file.size / 1024 / 1024).toFixed(2)} MB)` };
      }
      const fileName = file.name.toLowerCase();
      const extension = fileName.substring(fileName.lastIndexOf('.'));
      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        return { valid: false, error: `File type "${extension}" is not supported.` };
      }
      return { valid: true };
    };

    const handleFileSelect = (file: File | undefined) => {
      if (file) {
        const validation = validateFile(file);
        if (!validation.valid) {
          setFileValidationError(validation.error || "Invalid file");
          setSelectedFile(null);
        } else {
          setSelectedFile(file);
          setFileValidationError(null);
        }
      }
    };

    const handlePinToggle = () => {
      if (isInline) return;
      if (isPinned) {
        setIsPinned(false);
        setIsOpen(false);
        setSidebarOpen(true);
        onPinChange?.(false);
      } else {
        setIsPinned(true);
        onPinChange?.(true);
      }
    };

    const handleClose = () => {
      setIsOpen(false);
      if (!isInline) {
        setIsPinned(false);
        setSidebarOpen(true);
        onPinChange?.(false);
      }
    };

    const tabBar = (
      <div className={`flex border-b gap-1 ${isInline ? "px-1" : "px-2"}`} role="tablist">
        <Button
          variant="ghost"
          size="sm"
          className={`flex-1 rounded-none border-b-2 ${
            activeTab === "documents" ? "border-foreground" : "border-transparent"
          }`}
          onClick={() => setActiveTab("documents")}
          aria-label={`Documents (${documents.length})`}
          aria-selected={activeTab === "documents"}
          role="tab"
          data-testid="tab-documents"
        >
          <FileText className="h-4 w-4 mr-1" />
          <span>{documents.length}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`flex-1 rounded-none border-b-2 ${
            activeTab === "notes" ? "border-foreground" : "border-transparent"
          }`}
          onClick={() => setActiveTab("notes")}
          aria-label="Notes"
          aria-selected={activeTab === "notes"}
          role="tab"
          data-testid="tab-notes"
        >
          <StickyNote className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`flex-1 rounded-none border-b-2 ${
            activeTab === "comments" ? "border-foreground" : "border-transparent"
          }`}
          onClick={() => setActiveTab("comments")}
          aria-label={`Comments (${comments.length})`}
          aria-selected={activeTab === "comments"}
          role="tab"
          data-testid="tab-comments"
        >
          <MessageSquare className="h-4 w-4 mr-1" />
          <span>{comments.length}</span>
        </Button>
      </div>
    );

    const tabContent = (
      <div className={`flex-1 overflow-y-auto ${isInline ? "max-h-64 p-3" : "p-4"}`}>
        {activeTab === "comments" && (
          <div className="space-y-3" data-testid="content-comments">
            <div className="flex gap-2">
              <Input
                placeholder="Add a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="flex-1"
                data-testid="input-comment"
              />
              <Button
                size="icon"
                onClick={() => commentText.trim() && addCommentMutation.mutate(commentText)}
                disabled={!commentText.trim() || addCommentMutation.isPending}
                aria-label="Send comment"
                data-testid="button-add-comment"
              >
                {addCommentMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            {comments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No comments yet</p>
                <p className="text-xs">Be the first to add a comment</p>
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => {
                  const senderName = comment.created_by_name || comment.created_by || "Unknown";
                  const isCurrentUser = currentUserName && senderName === currentUserName;
                  return (
                    <div
                      key={comment.id}
                      className={`flex flex-col gap-1 ${isCurrentUser ? "items-end" : "items-start"}`}
                      data-testid={`comment-${comment.id}`}
                    >
                      <span className="text-xs text-muted-foreground px-1">{senderName}</span>
                      <div className={`flex items-end gap-1 max-w-[85%] ${isCurrentUser ? "flex-row-reverse" : "flex-row"}`}>
                        <div
                          className={`px-3 py-2 rounded-2xl text-sm break-words ${
                            isCurrentUser
                              ? "bg-primary text-primary-foreground rounded-tr-sm"
                              : "bg-muted rounded-tl-sm"
                          }`}
                        >
                          {comment.comments}
                        </div>
                        {isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="flex-shrink-0 h-5 w-5 opacity-50 hover:opacity-100"
                            onClick={() => deleteCommentMutation.mutate(comment.id)}
                            data-testid={`button-delete-comment-${comment.id}`}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground px-1">
                        {comment.creation_date ? formatDate(comment.creation_date) : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "documents" && (
          <div className="space-y-3" data-testid="content-documents">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setIsAddDocOpen(true)}
              data-testid="button-add-document"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Document
            </Button>

            {documents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No documents attached</p>
                <p className="text-xs">Add supporting documents</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-md border bg-muted/30"
                    data-testid={`document-${doc.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.file_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {doc.created_date ? formatDate(doc.created_date) : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleViewDocument(doc)}
                        title="View document"
                        data-testid={`button-view-document-${doc.id}`}
                      >
                        <Eye className="h-3 w-3 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleDownloadDocument(doc)}
                        title="Download document"
                        data-testid={`button-download-document-${doc.id}`}
                      >
                        <Download className="h-3 w-3 text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => deleteDocumentMutation.mutate(doc.id)}
                        data-testid={`button-delete-document-${doc.id}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "notes" && (
          <div className="space-y-3" data-testid="content-notes">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{notesLabel || "Notes"}</span>
              {onSaveNotes && (
                isNotesEditing ? (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setNotesText(externalNotes || "");
                        setIsNotesEditing(false);
                      }}
                      data-testid="button-cancel-note"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveNotes}
                      disabled={isSavingNotes || notesLoading}
                      data-testid="button-save-note"
                    >
                      {isSavingNotes && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNotesText(externalNotes || "");
                      setIsNotesEditing(true);
                    }}
                    data-testid="button-edit-note"
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                )
              )}
            </div>

            {isNotesEditing && onSaveNotes ? (
              <Textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder={`Enter notes for this ${entityType.toLowerCase()}...`}
                rows={isInline ? 5 : 8}
                className="resize-none"
                data-testid="input-notes"
              />
            ) : (
              <div className={`p-3 rounded-md border bg-muted/30 ${isInline ? "min-h-[100px]" : "min-h-[150px]"}`}>
                {notesLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : externalNotes ? (
                  <p className="text-sm whitespace-pre-wrap">{externalNotes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {onSaveNotes ? "No notes added. Click Edit to add notes." : "No notes available."}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );

    const addDocumentSheet = (
      <Sheet open={isAddDocOpen} onOpenChange={(open) => {
        setIsAddDocOpen(open);
        if (!open) {
          setSelectedFile(null);
          setFileValidationError(null);
        }
      }}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Add Document</SheetTitle>
            <SheetDescription>Upload a document to attach to this {entityType.toLowerCase()}.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="document-file">Select File</Label>
              <Input
                id="document-file"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.bmp"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
                data-testid="input-document-file"
              />
              {fileValidationError && (
                <p className="text-sm text-destructive">{fileValidationError}</p>
              )}
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedFile.name}
                </p>
              )}
            </div>
          </div>
          <SheetFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDocOpen(false);
                setSelectedFile(null);
                setFileValidationError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedFile) {
                  addDocumentMutation.mutate(selectedFile);
                }
              }}
              disabled={!selectedFile || addDocumentMutation.isPending}
              data-testid="button-upload-document"
            >
              {addDocumentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Upload
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );

    if (isInline) {
      if (!isOpen) {
        return addDocumentSheet;
      }
      return (
        <>
          <div
            className={`rounded-md border bg-background ${className || ""}`}
            data-testid="panel-collaboration-inline"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <h3 className="text-sm font-semibold">Collaboration</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleClose}
                aria-label="Close collaboration"
                data-testid="button-close-panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {tabBar}
            {tabContent}
          </div>
          {addDocumentSheet}
        </>
      );
    }

    if (!isOpen && !isPinned) {
      return addDocumentSheet;
    }

    return (
      <>
        <div
          className={`${
            isPinned 
              ? "w-72 bg-background border-l flex-shrink-0" 
              : `fixed top-14 right-0 h-[calc(100vh-3.5rem)] w-72 bg-background border-l shadow-lg transform transition-transform duration-300 z-50 ${
                  isOpen ? "translate-x-0" : "translate-x-full"
                }`
          } ${!isOpen && !isPinned ? "hidden" : ""} ${className || ""}`}
          data-testid="panel-collaboration"
        >
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold">Collaboration</h3>
              <div className="flex items-center gap-1">
                <Button
                  variant={isPinned ? "default" : "ghost"}
                  size="icon"
                  onClick={handlePinToggle}
                  aria-label={isPinned ? "Unpin panel" : "Pin panel"}
                  data-testid="button-pin-panel"
                >
                  {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  aria-label="Close collaboration panel"
                  data-testid="button-close-panel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {tabBar}
            {tabContent}
          </div>
        </div>
        
        {isOpen && !isPinned && (
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setIsOpen(false)}
            data-testid="overlay-collaboration"
          />
        )}

        {addDocumentSheet}
      </>
    );
  }
);

CollaborationPanel.displayName = "CollaborationPanel";

export function CollaborationTrigger({ 
  onClick, 
  className 
}: { 
  onClick: () => void; 
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={className}
      data-testid="button-open-collaboration"
    >
      <MessageSquare className="h-4 w-4 mr-2" />
      Collaborate
    </Button>
  );
}
