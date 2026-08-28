import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ClipboardList, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { RfiAnswerField } from "./rfi-answer-field";
import type { RfiAnswerValue, RfiSupplierCampaignView } from "./rfi-types";

interface SuppRfiResponseProps {
  id: string;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function SuppRfiResponse({ id }: SuppRfiResponseProps) {
  const campaignId = Number(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryKey = ["/api/rfi/supplier/campaigns", String(campaignId)];
  const { data, isLoading, isError, error } = useQuery<RfiSupplierCampaignView>({
    queryKey,
    enabled: Number.isFinite(campaignId),
  });

  const [answers, setAnswers] = useState<Record<number, RfiAnswerValue>>({});
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!data) return;
    const existing: Record<number, RfiAnswerValue> = {};
    for (const r of data.responses) existing[r.questionId] = r.value;
    setAnswers(existing);
  }, [data]);

  const setAnswer = (questionId: number, value: RfiAnswerValue) =>
    setAnswers((prev) => ({ ...prev, [questionId]: value }));

  const handleFileSelect = async (questionId: number, file: File | undefined) => {
    if (!file) return;
    setUploadingFor(questionId);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiRequest("POST", `/api/rfi/supplier/campaigns/${campaignId}/responses/upload`, form);
      const uploaded = await res.json();
      setAnswer(questionId, uploaded);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingFor(null);
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/rfi/supplier/campaigns/${campaignId}/responses`, { answers }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/rfi/supplier/campaigns"] });
      toast({ title: "Response submitted", description: "Thank you — your answers have been recorded." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to submit response", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading || !data) {
    if (isError) {
      return (
        <div className="p-6">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <p className="text-sm font-semibold">Couldn't load this campaign</p>
              <p className="text-sm text-muted-foreground">{(error as Error)?.message || "Please try again."}</p>
              <Button variant="outline" onClick={() => navigate("/app/supp-rfi")}>
                Back to RFI Invitations
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { campaign, questions } = data;
  const isClosed = campaign.status === "closed";
  const missingRequired = questions.filter((q) => {
    const v = answers[q.id];
    return q.required && (v === undefined || v === null || v === "");
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/supp-rfi")} data-testid="button-back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ClipboardList className="h-6 w-6" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold" data-testid="text-campaign-title">{campaign.title}</h1>
            <Badge variant={isClosed ? "secondary" : "default"}>{isClosed ? "Closed" : "Open for responses"}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {campaign.campaignCode} · Response deadline: {formatDate(campaign.deadline)}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="mb-1 text-xs text-muted-foreground">Description</p>
          <p className="text-sm leading-relaxed">{campaign.description}</p>
        </CardContent>
      </Card>

      {isClosed && (
        <div className="rounded-lg border border-muted bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          This campaign is closed. Your answers are shown below for reference and can no longer be edited.
        </div>
      )}

      <Card>
        <CardContent className="pt-6 space-y-7">
          {questions.map((q, index) => {
            const value = answers[q.id];
            const showError = touched && q.required && (value === undefined || value === null || value === "");
            return (
              <div key={q.id}>
                <Label className="block mb-2">
                  {index + 1}. {q.text} {q.required && <span className="text-destructive">*</span>}
                </Label>
                <RfiAnswerField
                  question={q}
                  value={value ?? null}
                  onChange={(v) => setAnswer(q.id, v)}
                  onFileSelect={(file) => handleFileSelect(q.id, file)}
                  uploading={uploadingFor === q.id}
                  disabled={isClosed}
                />
                {showError && <p className="mt-1 text-xs text-destructive">This question is required.</p>}
              </div>
            );
          })}
          {questions.length === 0 && (
            <p className="text-sm text-muted-foreground">This campaign has no questions.</p>
          )}
        </CardContent>
      </Card>

      {!isClosed && (
        <div className="flex items-center justify-between rounded-lg border px-4 py-3.5">
          <p className="text-sm text-muted-foreground">
            {questions.filter((q) => q.required).length} required question(s) ·{" "}
            {missingRequired.length === 0 ? "ready to submit" : `${missingRequired.length} still to answer`}
          </p>
          <Button
            onClick={() => {
              setTouched(true);
              if (missingRequired.length > 0) return;
              submitMutation.mutate();
            }}
            disabled={submitMutation.isPending}
            data-testid="button-submit-response"
          >
            {submitMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            {data.myStatus === "responded" ? "Save Changes" : "Submit Response"}
          </Button>
        </div>
      )}
    </div>
  );
}
