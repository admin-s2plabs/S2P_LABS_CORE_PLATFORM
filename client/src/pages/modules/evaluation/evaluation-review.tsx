import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AnswerType, Option, Question } from "./evaluation-preview";

interface EvaluationResultPreviewResponse {
    respLineAnswer: EvaluationResponseLine[];
    response: {
        attribute_15: string | null;
    }
}

interface EvaluationResponseLine {
    id: number;
    ques_answer: string | number
    ques_id: number;
    ques_option: string;
    ques_text: string
    ques_type: string;
    survey_resp_id: string;
    weitage: string;
    ques_score?: string | number;
}

export default function EvaluationReview({ poNumber, evaluationId, savedResponses, submittedResponse, openResult, goBack }: { poNumber: string, evaluationId: string | null, savedResponses: { questions: Question[], comment: string }, submittedResponse: () => void, openResult: boolean, goBack?: () => void }) {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [comment, setComment] = useState("");

    const { data: _suppEvalResultPreview } = useQuery<EvaluationResultPreviewResponse>({
        queryKey: [`/api/form/surveyformresponse/${evaluationId}/${poNumber}`],
        queryFn: async () => {
            const res = await apiRequest("GET", `/api/form/surveyformresponse/${evaluationId}/${poNumber}`);
            const evalData: EvaluationResultPreviewResponse = await res.json();
            const questionsList: Question[] =
                evalData?.respLineAnswer?.map((item: EvaluationResponseLine) => ({
                    id: Number(item.ques_id),
                    text: item.ques_text,
                    type: item.ques_type as AnswerType,
                    weight: Number(item.weitage),
                    options: item.ques_option
                        ? (JSON.parse(item.ques_option) as Option[])
                        : [],
                    value: String(item.ques_answer ?? ""),
                    score: item.ques_score !== undefined && item.ques_score !== null && item.ques_score !== "" ? Number(item.ques_score) : undefined,
                })) || [];
            setQuestions(questionsList);
            setComment(evalData?.response?.attribute_15 ?? "");
            return evalData;
        },
        staleTime: 0,
        refetchOnMount: "always",
        enabled: !!poNumber && !!evaluationId && openResult,
    });
    
    const targetQuestions = openResult ? questions : savedResponses?.questions;

    const answersSerialized = JSON.stringify(
        targetQuestions?.map((q) => ({ id: q.id, value: q.value })) || []
    );

    const { data: calculatedScores } = useQuery({
        queryKey: ["calculateScore", evaluationId, poNumber, answersSerialized],
        queryFn: async () => {
            console.log("Calling caluclatescore API for evaluationId:", evaluationId, "poNumber:", poNumber, "targetQuestions:", targetQuestions);
            const payload = targetQuestions?.map((que) => {
                let optionWeight = que.weight;
                if (que.type === "Single Choice" || que.type === "Yes / No") {
                    const selectedOpt = que.options?.find((o: Option) => o.label === que.value);
                    if (selectedOpt !== undefined) {
                        optionWeight = selectedOpt.weight;
                    }
                }
                return {
                    ques_id: que.id,
                    answer: que.value,
                    optionWeitage: optionWeight,
                };
            });
            const res = await apiRequest("POST", `/api/form/caluclatescore/${evaluationId}/${poNumber}`, { payload });
            const data = await res.json();
            return data.payload as Array<{ ques_id: number; answer: any; optionWeitage: number; score: number }>;
        },
        staleTime: 0,
        refetchOnMount: "always",
        enabled: !openResult && !!evaluationId && !!poNumber && !!targetQuestions && targetQuestions.length > 0,
    });

    const saveEvaluation = () => {
        const payload = savedResponses?.questions.map(({ id, value, weight, options, type }) => {
            let optionWeight = weight;
            if (type === "Single Choice" || type === "Yes / No") {
                const selectedOpt = options?.find((o: Option) => o.label === value);
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
        evaluationSubmit.mutate(payload);
    };

    const evaluationSubmit = useMutation({
        mutationFn: async (payload: any) => {
            const response = await apiRequest("POST", `/api/form/surveyanswer/${evaluationId}/${poNumber}`, { payload: payload, comment: savedResponses.comment, type: "submit" });
            return response.json();
        },
        onSuccess: () => {
            toast({ title: "Survey Form submitted successfully" });
            submittedResponse();
        },
        onError: (error: Error) => {
            toast({
                title: "Failed to submit Survey Form",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    return (
        <div className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h1 className="text-xl font-bold text-primary" data-testid="text-page-title">
                        {openResult ? "Evaluation Results" : "Review & Submit"}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {openResult ? "Evaluation Responses provided to the Vendor" : "Review your responses before final submission"}
                    </p>
                </div>
                {!openResult ? <div className="flex items-center gap-2">
                    {goBack && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={goBack}
                            data-testid="button-back-supplier-evaluation"
                        >
                            Back
                        </Button>
                    )}
                    <Button
                        type="button"
                        size="sm"
                        onClick={saveEvaluation}
                        disabled={evaluationSubmit.isPending}
                        data-testid="button-create-supplier-evaluation"
                    >
                        Submit Evaluation
                    </Button>
                </div> : <></>}
            </div>

            <Card>
                <CardContent className="p-0 text-sm">
                    <div className="border rounded-md overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Q No.</TableHead>
                                    <TableHead>Question</TableHead>
                                    <TableHead>Weightage</TableHead>
                                    <TableHead>Response</TableHead>
                                    <TableHead>Score</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(openResult ? questions : savedResponses?.questions).map((line: Question, idx: number) => {
                                    const scoreValue = openResult
                                        ? line.score
                                        : (calculatedScores?.find(s => s.ques_id === line.id)?.score ?? line.score);

                                    return (
                                        <TableRow key={line.id} data-testid={`row-view-line-${line.id}`}>
                                            <TableCell className="font-mono text-sm font-medium text-primary py-2">
                                                Q{idx + 1}
                                            </TableCell>
                                            <TableCell className="text-sm font-medium max-w-[250px] py-2">
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span className="block truncate cursor-default">{line.text}</span>
                                                    </TooltipTrigger>
                                                    <TooltipContent><p>{line.text}</p></TooltipContent>
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground py-2">
                                                {line.weight}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground py-2 break-all">
                                                {line.type === "Rating 1-5" ? <div className="inline-flex items-center gap-1.5">
                                                    <span className="text-amber-400 text-sm">
                                                        {"★".repeat(Number(line.value))}
                                                        {"☆".repeat(5 - Number(line.value))}
                                                    </span>
                                                </div> : line.value}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground py-2">
                                                {scoreValue !== undefined ? scoreValue : "—"}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-3 text-sm">
                    <p className="text-sm text-muted-foreground mb-2">PO Performance Comment</p>
                    <p className="text-sm italic">"{openResult ? comment || "NA" : savedResponses?.comment || "NA"}"</p>
                </CardContent>
            </Card>
        </div>
    );
}