import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ChecklistQuestion {
  id: number;
  question_text: string;
  option_required?: string;
  remarks_required?: string;
}

interface ChecklistResponse {
  id: number;
  question_id: number;
  question_answer: string;
  remarks_data: string | null;
}

interface ChecklistHistoryRow {
  question_id: number;
  question_text: string;
  question_answer: string;
  remarks_data: string | null;
  answered_by: string | null;
  answered_date: string | null;
}

export interface ChecklistDraftItem {
  questionId: number;
  responseId?: number;
  text: string;
  checked: boolean;
  remarks: string;
  itemMandatory: boolean;
  remarkMandatory: boolean;
}

export interface ChecklistHistoryItem {
  questionId: number;
  text: string;
  checked: boolean;
  remarks: string;
}

export interface ChecklistHistoryStep {
  step: number;
  approvedBy: string;
  completedDate: string | null;
  checkedCount: number;
  total: number;
  items: ChecklistHistoryItem[];
}

async function fetchJsonArray(url: string): Promise<any[]> {
  const res = await apiRequest("GET", url);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Groups the raw response-history rows (one row per question per save) into one card per approver/step. */
function groupHistoryBySteps(history: ChecklistHistoryRow[]): ChecklistHistoryStep[] {
  const byApprover = new Map<string, ChecklistHistoryRow[]>();
  for (const row of history) {
    const key = row.answered_by || "Unknown";
    if (!byApprover.has(key)) byApprover.set(key, []);
    byApprover.get(key)!.push(row);
  }

  const groups = Array.from(byApprover.entries()).map(([approvedBy, rows]) => {
    // Keep only the latest saved answer per question for this approver.
    const latestByQuestion = new Map<number, ChecklistHistoryRow>();
    for (const row of rows) {
      const existing = latestByQuestion.get(row.question_id);
      if (!existing || (row.answered_date || "") >= (existing.answered_date || "")) {
        latestByQuestion.set(row.question_id, row);
      }
    }
    const items = Array.from(latestByQuestion.values());
    const completedDate = items.reduce<string | null>(
      (latest, item) => (!latest || (item.answered_date || "") > latest ? item.answered_date : latest),
      null
    );
    return {
      approvedBy,
      completedDate,
      checkedCount: items.filter((i) => i.question_answer === "Yes").length,
      total: items.length,
      items: items.map((i) => ({
        questionId: i.question_id,
        text: i.question_text,
        checked: i.question_answer === "Yes",
        remarks: i.remarks_data || "",
      })),
    };
  });

  groups.sort((a, b) => (a.completedDate || "").localeCompare(b.completedDate || ""));
  return groups.map((g, index) => ({ ...g, step: index + 1 }));
}

export function formatChecklistDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Checks whether a module has an active checklist before any dialog opens.
 * The API returns an array of questions when the checklist is active (possibly empty),
 * or an error string (e.g. "Error - Check list is In Active for selected module") when it
 * isn't. Seeds the query cache on success so the checklist dialog doesn't re-fetch.
 */
export async function resolveApprovalChecklistAvailability(moduleName: string): Promise<boolean> {
  const res = await apiRequest("GET", `/api/wf/questionformodule/${encodeURIComponent(moduleName)}`);
  const data = await res.json();
  const available = Array.isArray(data);
  if (available) {
    queryClient.setQueryData(["/api/wf/questionformodule", moduleName], data);
  }
  return available;
}

/** Loads a module's approval checklist and (if a refNumber is known) any responses already recorded for it. */
export function useApprovalChecklist(moduleName: string, refNumber: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const [draftItems, setDraftItems] = useState<ChecklistDraftItem[]>([]);

  const questionsQuery = useQuery<ChecklistQuestion[]>({
    queryKey: ["/api/wf/questionformodule", moduleName],
    queryFn: () => fetchJsonArray(`/api/wf/questionformodule/${encodeURIComponent(moduleName)}`),
    enabled,
  });

  const responsesQuery = useQuery<{ data: ChecklistResponse[]; history: ChecklistHistoryRow[] }>({
    queryKey: ["/api/wf/loadresponse", refNumber],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/wf/loadresponse/${encodeURIComponent(refNumber as string)}`);
      const json = await res.json();
      return {
        data: Array.isArray(json?.data) ? json.data : [],
        history: Array.isArray(json?.history) ? json.history : [],
      };
    },
    enabled: enabled && !!refNumber,
  });

  const questions = questionsQuery.data || [];
  const hasChecklist = questions.length > 0;
  const isLoading = questionsQuery.isLoading || responsesQuery.isLoading;
  const historySteps = groupHistoryBySteps(responsesQuery.data?.history || []);

  useEffect(() => {
    if (!enabled || isLoading) return;
    const responses = responsesQuery.data?.data || [];
    setDraftItems(
      questions.map((q) => {
        const existing = responses.find((r) => r.question_id === q.id);
        return {
          questionId: q.id,
          responseId: existing?.id,
          text: q.question_text,
          checked: !!existing && existing.question_answer === "Yes",
          remarks: existing?.remarks_data || "",
          itemMandatory: q.option_required === "Yes",
          remarkMandatory: q.remarks_required === "Yes",
        };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isLoading, questions.length, responsesQuery.data]);

  const toggleChecked = (questionId: number, checked: boolean) => {
    setDraftItems((items) => items.map((i) => (i.questionId === questionId ? { ...i, checked } : i)));
  };

  const setRemarks = (questionId: number, remarks: string) => {
    setDraftItems((items) => items.map((i) => (i.questionId === questionId ? { ...i, remarks } : i)));
  };

  const checkedCount = draftItems.filter((i) => i.checked).length;
  const mandatoryItems = draftItems.filter((i) => i.itemMandatory);
  const itemsRemaining = mandatoryItems.filter((i) => !i.checked).length;
  const remarksRemaining = draftItems.filter((i) => i.remarkMandatory && !i.remarks.trim()).length;
  const canApprove = itemsRemaining === 0 && remarksRemaining === 0;

  const saveResponsesMutation = useMutation({
    mutationFn: async () => {
      const payload = draftItems.map((item) => ({
        ...(item.responseId ? { id: item.responseId } : {}),
        ques_id: item.questionId,
        answer: item.checked ? "Yes" : "No",
        refNumber,
        remarks: item.remarks,
      }));
      return apiRequest("POST", `/api/wf/saveresponse/${encodeURIComponent(refNumber as string)}`, { payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wf/loadresponse", refNumber] });
    },
  });

  return {
    isLoading,
    hasChecklist,
    historySteps,
    draftItems,
    checkedCount,
    itemsRemaining,
    remarksRemaining,
    canApprove,
    toggleChecked,
    setRemarks,
    saveResponsesMutation,
  };
}
