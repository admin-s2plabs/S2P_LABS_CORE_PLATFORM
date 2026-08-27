import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { RfiLibraryQuestion, RfiQuestionType } from "./rfi-types";

const TYPE_LABELS: Record<RfiQuestionType, string> = {
  text: "Text",
  single_select: "Single-select",
  multi_select: "Multi-select",
  number: "Number",
  date: "Date",
  file_upload: "File-upload",
};

interface RfiQuestionLibrarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: number;
  addedLibraryIds: Set<string>;
}

export function RfiQuestionLibrarySheet({
  open,
  onOpenChange,
  campaignId,
  addedLibraryIds,
}: RfiQuestionLibrarySheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data } = useQuery<{ questions: RfiLibraryQuestion[] }>({
    queryKey: ["/api/rfi/question-library"],
    enabled: open,
  });

  const library = data?.questions ?? [];
  const filtered = useMemo(
    () =>
      library.filter(
        (q) =>
          !search ||
          q.text.toLowerCase().includes(search.toLowerCase()) ||
          q.category.toLowerCase().includes(search.toLowerCase()),
      ),
    [library, search],
  );

  const addMutation = useMutation({
    mutationFn: async (libraryId: string) => {
      await apiRequest("POST", `/api/rfi/campaigns/${campaignId}/questions`, { libraryId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfi/campaigns", String(campaignId)] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add question", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[520px] flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle>Question Library</SheetTitle>
          <SheetDescription>
            Click a question to add it to this campaign. Library questions carry a standardized attribute
            key.
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search library..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-library"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2.5">
          {filtered.map((q) => {
            const added = addedLibraryIds.has(q.id);
            return (
              <button
                key={q.id}
                type="button"
                disabled={added || addMutation.isPending}
                onClick={() => addMutation.mutate(q.id)}
                className={`w-full flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                  added ? "border-emerald-300 bg-emerald-50/60 cursor-not-allowed" : "hover:bg-muted/50"
                }`}
                data-testid={`button-add-library-${q.id}`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                    added ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {added ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{q.text}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{TYPE_LABELS[q.type]}</Badge>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {q.category}
                    </span>
                  </span>
                </span>
                {addMutation.isPending && addMutation.variables === q.id && (
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No library questions match that search.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
