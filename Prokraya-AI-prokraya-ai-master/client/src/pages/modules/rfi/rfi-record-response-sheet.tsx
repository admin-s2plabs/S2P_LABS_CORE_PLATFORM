import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { RfiAnswerField } from "./rfi-answer-field";
import type { RfiAnswerValue, RfiQuestion, RfiResponse, RfiSupplier } from "./rfi-types";

interface RfiRecordResponseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: number;
  supplier: RfiSupplier | null;
  questions: RfiQuestion[];
  responses: RfiResponse[];
}

export function RfiRecordResponseSheet({
  open,
  onOpenChange,
  campaignId,
  supplier,
  questions,
  responses,
}: RfiRecordResponseSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<number, RfiAnswerValue>>({});
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);

  const isEdit = supplier?.status === "responded";

  useEffect(() => {
    if (!open || !supplier) return;
    const existing: Record<number, RfiAnswerValue> = {};
    for (const r of responses) {
      if (r.supplierId === supplier.supplierId) existing[r.questionId] = r.value;
    }
    setAnswers(existing);
    setTouched(false);
  }, [open, supplier, responses]);

  const setAnswer = (questionId: number, value: RfiAnswerValue) =>
    setAnswers((prev) => ({ ...prev, [questionId]: value }));

  const handleFileSelect = async (questionId: number, file: File | undefined) => {
    if (!file || !supplier) return;
    setUploadingFor(questionId);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiRequest(
        "POST",
        `/api/rfi/campaigns/${campaignId}/responses/upload`,
        form,
      );
      const uploaded = await res.json();
      setAnswer(questionId, uploaded);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingFor(null);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!supplier) return;
      await apiRequest("POST", `/api/rfi/campaigns/${campaignId}/responses`, {
        supplierId: supplier.supplierId,
        answers,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfi/campaigns", String(campaignId)] });
      toast({
        title: isEdit ? "Response updated" : "Response recorded",
        description: `${supplier?.supplierName}'s answers are now reflected in the tracker.`,
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save response", description: err.message, variant: "destructive" });
    },
  });

  if (!supplier) return null;

  const missingRequired = questions.filter((q) => {
    const v = answers[q.id];
    return q.required && (v === undefined || v === null || v === "");
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[640px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Recorded Response" : "Record Response"}</SheetTitle>
          <SheetDescription>On behalf of {supplier.supplierName}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-7">
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
                />
                {showError && <p className="mt-1 text-xs text-destructive">This question is required.</p>}
              </div>
            );
          })}
          {questions.length === 0 && (
            <p className="text-sm text-muted-foreground">This campaign has no questions yet.</p>
          )}
        </div>

        <div className="mt-8 border-t pt-4 text-sm text-muted-foreground">
          {questions.filter((q) => q.required).length} required question(s) ·{" "}
          {missingRequired.length === 0 ? "ready to save" : `${missingRequired.length} still to answer`}
        </div>

        <SheetFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-response">
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTouched(true);
              if (missingRequired.length > 0) return;
              saveMutation.mutate();
            }}
            disabled={saveMutation.isPending}
            data-testid="button-save-response"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            {isEdit ? "Save Changes" : "Save Response"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
