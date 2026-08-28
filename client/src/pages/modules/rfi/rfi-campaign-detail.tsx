import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChartColumn,
  ClipboardList,
  FileOutput,
  FileText,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Plus,
  Send,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  InviteSuppliersSheet,
  mapApprovedSupplierToInvitePayload,
  type ApprovedSupplierRow,
} from "@/components/invite-suppliers-sheet";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { RfiStatusBadge } from "./rfi-campaigns";
import { RfiCampaignFormSheet } from "./rfi-campaign-form-sheet";
import { RfiQuestionLibrarySheet } from "./rfi-question-library-sheet";
import { RfiRecordResponseSheet } from "./rfi-record-response-sheet";
import type { RfiCampaignDetail as RfiCampaignDetailData, RfiQuestion, RfiSupplier } from "./rfi-types";

const TYPE_LABELS: Record<string, string> = {
  text: "Text",
  single_select: "Single-select",
  multi_select: "Multi-select",
  number: "Number",
  date: "Date",
  file_upload: "File-upload",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface RfiCampaignDetailProps {
  id: string;
}

export default function RfiCampaignDetail({ id }: RfiCampaignDetailProps) {
  const campaignId = Number(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"suppliers" | "questions">("suppliers");
  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [questionDialog, setQuestionDialog] = useState<{ open: boolean; question?: RfiQuestion }>({
    open: false,
  });
  const [responseSheet, setResponseSheet] = useState<{ open: boolean; supplier: RfiSupplier | null }>({
    open: false,
    supplier: null,
  });

  const queryKey = ["/api/rfi/campaigns", String(campaignId)];
  const { data, isLoading } = useQuery<RfiCampaignDetailData>({
    queryKey,
    enabled: Number.isFinite(campaignId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ["/api/rfi/campaigns"] });

  const publishMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/rfi/campaigns/${campaignId}/publish`),
    onSuccess: () => {
      invalidate();
      invalidateList();
      toast({ title: "Campaign published", description: "Record responses on the Suppliers tab as they come in." });
    },
    onError: (err: Error) => toast({ title: "Failed to publish", description: err.message, variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/rfi/campaigns/${campaignId}/close`),
    onSuccess: () => {
      invalidate();
      invalidateList();
      toast({ title: "Campaign closed" });
    },
    onError: (err: Error) => toast({ title: "Failed to close", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/rfi/campaigns/${campaignId}`),
    onSuccess: () => {
      invalidateList();
      toast({ title: "Campaign deleted", variant: "destructive" });
      navigate("/app/rfi");
    },
    onError: (err: Error) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
  });

  const inviteMutation = useMutation({
    mutationFn: async (suppliers: ApprovedSupplierRow[]) =>
      apiRequest("POST", `/api/rfi/campaigns/${campaignId}/suppliers`, {
        suppliers: suppliers.map(mapApprovedSupplierToInvitePayload),
      }),
    onSuccess: (_data, suppliers) => {
      invalidate();
      setInviteOpen(false);
      toast({ title: `${suppliers.length} supplier(s) invited` });
    },
    onError: (err: Error) => toast({ title: "Failed to invite suppliers", description: err.message, variant: "destructive" }),
  });

  const removeSupplierMutation = useMutation({
    mutationFn: async (supplierId: string) =>
      apiRequest("DELETE", `/api/rfi/campaigns/${campaignId}/suppliers/${supplierId}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Supplier removed", variant: "destructive" });
    },
    onError: (err: Error) => toast({ title: "Failed to remove supplier", description: err.message, variant: "destructive" }),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: number) =>
      apiRequest("DELETE", `/api/rfi/campaigns/${campaignId}/questions/${questionId}`),
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast({ title: "Failed to delete question", description: err.message, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { campaign, suppliers, questions, responses, activity } = data;
  const isDraft = campaign.status === "draft";
  const isPublished = campaign.status === "published";
  const isClosed = campaign.status === "closed";
  const canPublish = suppliers.length > 0 && questions.length > 0;
  const respondedIds = new Set(suppliers.filter((s) => s.status === "responded").map((s) => s.supplierId));

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/app/rfi")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ClipboardList className="h-6 w-6" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold" data-testid="text-campaign-title">{campaign.title}</h1>
              <RfiStatusBadge status={campaign.status} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {campaign.campaignCode} · Response deadline: {formatDate(campaign.deadline)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="text-destructive" onClick={() => setDeleteOpen(true)} data-testid="button-delete-campaign">
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </Button>
          {isDraft && (
            <Button variant="outline" onClick={() => setEditOpen(true)} data-testid="button-edit-campaign">
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
          )}
          {isDraft && (
            <span title={canPublish ? undefined : "Invite at least one supplier and add at least one question first"}>
              <Button
                disabled={!canPublish || publishMutation.isPending}
                onClick={() => publishMutation.mutate()}
                data-testid="button-publish-campaign"
              >
                {publishMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Publish
              </Button>
            </span>
          )}
          {isPublished && (
            <>
              <Button
                variant="outline"
                onClick={() => closeMutation.mutate()}
                disabled={closeMutation.isPending}
                data-testid="button-close-campaign"
              >
                <Lock className="h-4 w-4 mr-2" /> Close Campaign
              </Button>
              <Button onClick={() => navigate(`/app/rfi/${campaignId}/compare`)} data-testid="button-view-responses">
                <ChartColumn className="h-4 w-4 mr-2" /> View Responses
              </Button>
            </>
          )}
          {isClosed && (
            <Button onClick={() => navigate(`/app/rfi/${campaignId}/compare`)} data-testid="button-view-responses">
              <ChartColumn className="h-4 w-4 mr-2" /> View Responses
            </Button>
          )}
        </div>
      </div>

      {isDraft && !canPublish && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Publish is disabled.</span>
          {suppliers.length === 0 && <span>&nbsp;Invite at least one supplier on the Suppliers tab.</span>}
          {questions.length === 0 && <span>&nbsp;Add at least one question on the Questions tab.</span>}
        </div>
      )}

      {!isDraft && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <MiniStat icon={Send} label="Sent" value={suppliers.length} />
          <MiniStat icon={Mail} label="Responded" value={campaign.respondedCount} />
          <MiniStat icon={CalendarDays} label="Pending" value={suppliers.length - campaign.respondedCount} />
          <MiniStat
            icon={CalendarDays}
            label={isClosed ? "Closed on" : "Deadline"}
            value={isClosed ? formatDate(campaign.closedTime) : formatDate(campaign.deadline)}
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <FileText className="h-5 w-5 text-muted-foreground" /> Campaign Details
            </h2>
            <p className="mb-1 text-xs text-muted-foreground">Description</p>
            <p className="mb-6 text-sm leading-relaxed">{campaign.description}</p>
            <div className="grid gap-5 border-t pt-5 sm:grid-cols-3">
              <MiniField icon={CalendarDays} label="Response Deadline" value={formatDate(campaign.deadline)} />
              <MiniField icon={CalendarDays} label="Created Date" value={formatDateTime(campaign.creationTime)} />
              <MiniField icon={Users} label="Suppliers" value={`${suppliers.length} invited`} />
            </div>
            {campaign.sourcePrNumber && (
              <div className="mt-5 border-t pt-5">
                <Badge variant="outline" className="gap-1.5">
                  <FileOutput className="h-3 w-3" /> Raised from {campaign.sourcePrNumber}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <User className="h-5 w-5 text-muted-foreground" /> People
            </h2>
            <MiniField icon={User} label="Created By" value={campaign.createdBy} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "suppliers" | "questions")}>
            <TabsList>
              <TabsTrigger value="suppliers" data-testid="tab-suppliers">
                Suppliers ({suppliers.length})
              </TabsTrigger>
              <TabsTrigger value="questions" data-testid="tab-questions">
                Questions ({questions.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="suppliers" className="mt-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold">Invited Suppliers</h3>
                <Button onClick={() => setInviteOpen(true)} data-testid="button-invite-supplier">
                  <Plus className="h-4 w-4 mr-2" /> Invite Supplier
                </Button>
              </div>
              {suppliers.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No suppliers invited yet"
                  hint="Invite the suppliers who should receive this information request."
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {suppliers.map((s) => (
                    <div key={s.id} className="flex items-start gap-3 rounded-lg border px-4 py-3.5" data-testid={`card-supplier-${s.supplierId}`}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                        {s.supplierName.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{s.supplierName}</p>
                        <p className="truncate text-xs text-muted-foreground">{s.supplierEmail || "—"}</p>
                        {!isDraft && (
                          <div className="mt-2">
                            <Badge variant={s.status === "responded" ? "default" : "outline"} className="text-[11px]">
                              {s.status === "responded" ? "Responded" : "Pending"}
                            </Badge>
                          </div>
                        )}
                        {/* {isPublished && (
                          <button
                            type="button"
                            className="mt-2.5 text-xs font-semibold text-primary hover:underline"
                            onClick={() => setResponseSheet({ open: true, supplier: s })}
                            data-testid={`button-record-response-${s.supplierId}`}
                          >
                            {s.status === "responded" ? "Edit Response" : "Record Response"}
                          </button>
                        )} */}
                      </div>
                      {isDraft && (
                        <button
                          type="button"
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => removeSupplierMutation.mutate(s.supplierId)}
                          data-testid={`button-remove-supplier-${s.supplierId}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="questions" className="mt-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold">Questions</h3>
                {isDraft && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setLibraryOpen(true)} data-testid="button-add-from-library">
                      Add from Library
                    </Button>
                    <Button onClick={() => setQuestionDialog({ open: true })} data-testid="button-add-question">
                      <Plus className="h-4 w-4 mr-2" /> Add Question
                    </Button>
                  </div>
                )}
              </div>
              {questions.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No questions yet"
                  hint="Add questions from the curated library, or write your own. You need at least one to publish."
                />
              ) : (
                <div className="space-y-3">
                  {questions.map((q, index) => (
                    <div key={q.id} className="flex items-start gap-4 rounded-lg border px-4 py-3.5" data-testid={`row-question-${q.id}`}>
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{q.text}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{TYPE_LABELS[q.type] || q.type}</Badge>
                          {q.required && (
                            <Badge variant="destructive" className="bg-destructive/10 text-destructive border-transparent">
                              Required
                            </Badge>
                          )}
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                            {q.source}
                          </span>
                        </div>
                      </div>
                      {isDraft && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                            onClick={() => setQuestionDialog({ open: true, question: q })}
                            data-testid={`button-edit-question-${q.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => deleteQuestionMutation.mutate(q.id)}
                            data-testid={`button-delete-question-${q.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {!isDraft && activity.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-5 text-lg font-bold">Activity</h2>
            <ol className="space-y-4">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {a.type === "published" && <Send className="h-4 w-4" />}
                    {a.type === "response" && <Mail className="h-4 w-4" />}
                    {a.type === "closed" && <Lock className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{a.text}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(a.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <RfiCampaignFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        campaign={campaign}
        onUpdated={() => setEditOpen(false)}
      />

      <InviteSuppliersSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        excludeSupplierIds={suppliers.map((s) => s.supplierId)}
        title="Invite Suppliers"
        description={`Select suppliers to invite to ${campaign.campaignCode}.`}
        isConfirming={inviteMutation.isPending}
        onConfirm={(selected) => inviteMutation.mutate(selected)}
      />

      <RfiQuestionLibrarySheet
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        campaignId={campaignId}
        addedLibraryIds={new Set(questions.map((q) => q.libraryId).filter(Boolean) as string[])}
      />

      <QuestionFormDialog
        open={questionDialog.open}
        onOpenChange={(open) => setQuestionDialog({ open })}
        campaignId={campaignId}
        question={questionDialog.question}
      />

      <RfiRecordResponseSheet
        open={responseSheet.open}
        onOpenChange={(open) => setResponseSheet((prev) => ({ ...prev, open }))}
        campaignId={campaignId}
        supplier={responseSheet.supplier}
        questions={questions}
        responses={responses}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{campaign.campaignCode}</span> — {campaign.title} will be
              permanently removed, along with {questions.length} question(s) and {responses.length} response(s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              data-testid="button-confirm-delete"
            >
              Delete campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniField({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: any; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

const SELECT_TYPES = new Set(["single_select", "multi_select"]);

function QuestionFormDialog({
  open,
  onOpenChange,
  campaignId,
  question,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: number;
  question?: RfiQuestion;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!question;

  const [text, setText] = useState(question?.text ?? "");
  const [type, setType] = useState<string>(question?.type ?? "text");
  const [required, setRequired] = useState(question?.required ?? false);
  const [optionsText, setOptionsText] = useState((question?.options ?? []).join(", "));

  useMemo(() => {
    if (open) {
      setText(question?.text ?? "");
      setType(question?.type ?? "text");
      setRequired(question?.required ?? false);
      setOptionsText((question?.options ?? []).join(", "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, question]);

  const mutation = useMutation({
    mutationFn: async () => {
      const options = optionsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (isEdit && question) {
        return apiRequest("PATCH", `/api/rfi/campaigns/${campaignId}/questions/${question.id}`, {
          text,
          type,
          required,
          options: SELECT_TYPES.has(type) ? options : undefined,
        });
      }
      return apiRequest("POST", `/api/rfi/campaigns/${campaignId}/questions`, {
        text,
        type,
        required,
        options: SELECT_TYPES.has(type) ? options : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfi/campaigns", String(campaignId)] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: "Failed to save question", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Question" : "Add Question"}</DialogTitle>
          <DialogDescription>Write a custom question for this campaign.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Question text</Label>
            <Input className="mt-1.5" value={text} onChange={(e) => setText(e.target.value)} data-testid="input-question-text" />
          </div>
          <div>
            <Label>Question type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1.5" data-testid="select-question-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="single_select">Single-select</SelectItem>
                <SelectItem value="multi_select">Multi-select</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="file_upload">File-upload</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {SELECT_TYPES.has(type) && (
            <div>
              <Label>Options (comma separated)</Label>
              <Input className="mt-1.5" value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />
            </div>
          )}
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox checked={required} onCheckedChange={(v) => setRequired(!!v)} />
            Required question
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!text.trim() || mutation.isPending}
            data-testid="button-save-question"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save Changes" : "Add Question"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
