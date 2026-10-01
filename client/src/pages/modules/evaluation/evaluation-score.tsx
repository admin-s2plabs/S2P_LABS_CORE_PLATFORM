import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, useEffect } from "react";
import { AnswerType, EvaluationPreviewQuestionResponse, EvaluationPreviewResponse, Option, Question } from "./evaluation-preview";

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex items-center gap-1 mt-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          className="focus:outline-none transition-transform hover:scale-110"
          aria-label={`${i} star`}
        >
          <svg
            className={`w-7 h-7 transition-colors duration-150 ${i <= (hover || value) ? "text-amber-400" : "text-slate-200"
              }`}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      ))}
      <span className="ml-2 text-sm text-slate-500 font-medium">{value} of 5</span>
    </div>
  );
}

function ScoreRow({ label, weight, value }: { label: string; weight: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-slate-500">{label} — {weight}</span>
      <span className="text-sm font-semibold text-slate-700 tabular-nums">{value.toFixed(1)}</span>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-5 ${className}`}>
      {children}
    </div>
  );
}

function WeightBadge({ percentage }: { percentage: string }) {
  return (
    <span className="ml-auto text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-100 rounded-lg px-2 py-0.5">
      {percentage}%
    </span>
  );
}

export default function EvaluationScore({ 
  poNumber, 
  evaluationId, 
  closeScoreModal,
  status,
  initialResponses
}: { 
  poNumber: string, 
  evaluationId: string | null, 
  closeScoreModal: (questions: Question[], comment: string, isDraft?: boolean) => void,
  status?: string | null,
  initialResponses?: { questions: Question[]; comment: string } | null
}) {
  const queryClient = useQueryClient();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (initialResponses?.questions && initialResponses.questions.length > 0) {
      setQuestions(initialResponses.questions);
      if (initialResponses.comment !== undefined) {
        setComment(initialResponses.comment);
      }
    }
  }, [initialResponses]);

  const { data: _suppEvalPreview } = useQuery<EvaluationPreviewResponse>({
    queryKey: [`/api/forms/getformbyid/${evaluationId}`],
    queryFn: async () => {
      const formRes = await apiRequest("GET", `/api/forms/getformbyid/${evaluationId}`);
      const evalData: EvaluationPreviewResponse = await formRes.json();

      let existingAnswers: any[] = [];
      let existingComment = "";
      try {
        const respRes = await apiRequest("GET", `/api/form/surveyformresponse/${evaluationId}/${poNumber}`);
        const respData = await respRes.json();
        existingAnswers = respData?.respLineAnswer || [];
        existingComment = respData?.response?.attribute_15 || "";
      } catch (err) {
        console.warn("No existing response found or failed to fetch:", err);
      }

      const questionsList: Question[] =
        evalData?.questions?.map((item: EvaluationPreviewQuestionResponse) => {
          const initialQ = initialResponses?.questions?.find(
            (q) => Number(q.id) === Number(item.id)
          );
          const matchingAnswer = existingAnswers.find(
            (ans: any) => Number(ans.ques_id) === Number(item.id)
          );
          
          let opts: Option[] = [];
          try {
            opts = item.ques_options ? JSON.parse(item.ques_options) as Option[] : [];
          } catch (e) {
            opts = [];
          }
          if (item.type === "Yes / No" && opts.length === 0) {
            opts = [
              { id: 1, label: "Yes", color: "#22c55e", weight: 0 },
              { id: 2, label: "No", color: "#7c3aed", weight: 0 },
            ];
          }

          const val = initialQ && initialQ.value !== undefined && initialQ.value !== ""
            ? String(initialQ.value ?? "")
            : matchingAnswer
              ? String(matchingAnswer.ques_answer ?? "")
              : "";

          return {
            id: Number(item.id),
            text: item.text,
            type: item.type as AnswerType,
            weight: item.weightage,
            options: opts,
            value: val
          };
        }) || [];

      if (initialResponses?.questions && initialResponses.questions.length > 0) {
        setQuestions(initialResponses.questions);
      } else {
        setQuestions(questionsList);
      }

      if (initialResponses?.comment !== undefined && initialResponses.comment !== "") {
        setComment(initialResponses.comment);
      } else if (existingComment) {
        setComment(existingComment);
      }
      return evalData;
    },
    staleTime: 0,
    refetchOnMount: "always",
    enabled: !!poNumber && !!evaluationId,
  });

  const onChangeInput = (value: number | string | boolean, id: number | string) => {
    setQuestions((prev) =>
      prev.map((question) =>
        question.id === Number(id)
          ? { ...question, value }
          : question
      )
    );
  };

  const unansweredQuestions = questions.filter(
    (q) =>
      q.value === "" ||
      q.value === null ||
      q.value === undefined
  );

  const answeredQuestions = questions.filter(
    (q) =>
      q.value !== "" &&
      q.value !== null &&
      q.value !== undefined
  );

  const saveMutation = useMutation({
    mutationFn: async ({ payload, type, commentVal }: { payload: any; type: string; commentVal: string }) => {
      const response = await apiRequest("POST", `/api/form/surveyanswer/${evaluationId}/${poNumber}`, {
        payload,
        comment: commentVal,
        type,
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: variables.type === "draft"
          ? "Survey Form saved as draft successfully"
          : "Survey Form submitted successfully"
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber],
      });
      closeScoreModal(questions, comment, variables.type === "draft");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save Survey Form",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = (type: "draft" | "submit") => {
    if(type === "draft" && answeredQuestions.length < 1)
    {
     toast({
        title: "Validation Failure!",
        description: "Please answer at least one question",
        variant: "destructive",
      });
      return;
    }
    if (type === "submit" && unansweredQuestions.length > 0) {
      toast({
        title: "Validation Failure!",
        description: "Please answer for all Questions",
        variant: "destructive",
      });
      return;
    }

    if(!comment && type === "submit")
    {
      toast({
        title: "Validation Failure",
        description: "Please fill the comment field before submitting the evaluation.",
        variant: "destructive",
      });
      return;
    }
    const payload = questions.map(({ id, value, weight, options, type }) => {
      let optionWeight = weight;
      if (type === "Single Choice" || type === "Yes / No") {
        const selectedOpt = options?.find((o) => o.label === value);
        if (selectedOpt !== undefined) {
          optionWeight = selectedOpt.weight;
        }
      }
      return {
        ques_id: id,
        answer: value,
        optionWeitage: optionWeight
      };
    });

    if (type === "submit") {
      closeScoreModal(questions, comment, false);
    } else {
      saveMutation.mutate({ payload, type, commentVal: comment });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="max-w-6xl mx-auto p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-primary" data-testid="text-page-title">
              Evaluation
            </h1>
            <p className="text-sm text-muted-foreground">
              View and manage supplier evaluations across all purchase orders
            </p>
          </div>

          <div className="flex items-center gap-2">
            {status !== "Submitted" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSave("draft")}
                disabled={saveMutation.isPending}
                data-testid="button-save-as-draft-evaluation"
              >
                Save as Draft
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => handleSave("submit")}
              disabled={saveMutation.isPending}
              data-testid="button-submit-evaluation"
            >
              Submit for Review
            </Button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 flex flex-col gap-4">
            {questions?.map((item: Question) => (
              <Card key={item.id}>
                <div className="flex items-center">
                  <p className="text-sm font-medium text-slate-700 leading-snug">
                    {item.text}
                  </p>
                  <WeightBadge percentage={String(item.weight)} />
                </div>
                {item.type === "Rating 1-5" ? <StarRating value={Number(item.value) || 0} onChange={(value) => onChangeInput(value, item.id)} /> : item.type === "Yes / No" ?
                  <label className="flex items-center gap-2 mt-2">
                    {([true, false] as const).map((option) => {
                      const isSelected =
                        (option && item.value === "Yes") ||
                        (!option && item.value === "No");
                      return (
                        <Fragment key={String(option)}>
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${isSelected
                              ? "bg-violet-600 border-violet-600"
                              : "border-slate-300 bg-white hover:border-violet-400"
                              }`
                            } onClick={() => {
                              const label = option ? "Yes" : "No";
                              onChangeInput(label, item.id);
                            }}
                          >
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                            </svg>
                          </div>
                          <span className="text-sm text-slate-600 cursor-pointer mr-3">{option ? "Yes" : "No"}</span>
                        </Fragment>
                      )
                    })}
                  </label> : item.type === "Single Choice" ? item.options?.map((option: Option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onChangeInput(option.label, item.id)}
                      className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-all mr-3 mt-2 ${item.value === option.label
                        ? "bg-violet-600 border-violet-600 text-white shadow-sm"
                        : "border-slate-200 text-slate-600 bg-white hover:border-violet-300 hover:text-violet-700"
                        }`}
                    >
                      {option.label}
                    </button>
                  )) : <></>}
              </Card>
            ))}

            <Card>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700 mb-3">PO Performance Comment</p>
                {/* <span className="text-xs text-slate-400">Optional</span> */}
              </div>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Add any context about this supplier's performance this cycle…"
              />
            </Card>
          </div>

          {/* <div className="w-full lg:w-64 flex-shrink-0">
            <div className="sticky top-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-100 px-5 py-3">
                  <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
                    Live Score
                  </p>
                </div>

                <div className="px-5 pt-4 pb-2 divide-y divide-slate-50">
                  <ScoreRow label="Q1" weight="30%" value={24.0} />
                  <ScoreRow label="Q2" weight="25%" value={17.5} />
                  <ScoreRow label="Q3" weight="20%" value={12.0} />
                  <ScoreRow label="Q4" weight="15%" value={15.0} />
                  <ScoreRow label="Q5" weight="10%" value={7.5} />
                </div>

                <div className="px-5 pb-5 pt-3 text-center">
                  <p className="text-xs text-slate-400 mb-1">Total Score</p>
                  <p className="text-5xl font-extrabold text-slate-800 tabular-nums leading-none">
                    {76.0}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 mb-3">out of 100</p>

                  <div className="inline-flex items-center gap-1.5 bg-violet-50 border border-violet-100 rounded-xl px-3 py-1.5">
                    <span className="text-amber-400 text-sm">
                      {"★".repeat(1)}{"☆".repeat(4)}
                    </span>
                    <span className={`text-sm font-semibold`}>
                      Poor
                    </span>
                  </div>

                  <p className="text-[12px] text-slate-400 mt-3 leading-snug">
                    Score updates as each question is answered
                  </p>
                </div>
              </div>
            </div>
          </div> */}
        </div>
      </div>
    </div>
  );
}