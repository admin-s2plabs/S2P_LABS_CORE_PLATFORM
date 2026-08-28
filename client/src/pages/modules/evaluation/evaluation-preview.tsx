import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useRoute } from "wouter";

export interface EvaluationPreviewResponse {
    data: EvaluationPreviewData;
    questions: EvaluationPreviewQuestionResponse[];
}

interface EvaluationPreviewData {
    id: string;
    creation_date: string;
    status: string;
    title: string;
    type: string;
}

export interface EvaluationPreviewQuestionResponse {
    id: string;
    text: string;
    type: string;
    weightage: number;
    ques_options: string;
}

export type AnswerType = "Rating 1-5" | "Yes / No" | "Single Choice";

export interface Option {
    id: number;
    label: string;
    color: string;
    weight: number;
}

export interface Question {
    id: number;
    text: string;
    type: AnswerType;
    weight: number;
    options: Option[];
    value?: number | string | boolean;
    score?: number;
}

const ANSWER_TYPES: AnswerType[] = ["Rating 1-5", "Yes / No", "Single Choice"];

const DOT_COLORS: string[] = [
    "#22c55e", "#7c3aed", "#f97316", "#ef4444", "#3b82f6", "#eab308",
];

const defaultOptions = (): Option[] => [
    { id: Date.now(), label: "New option", color: "#22c55e", weight: 0 },
];

const defaultYesNoOptions = (): Option[] => [
    { id: Date.now(), label: "Yes", color: "#22c55e", weight: 0 },
    { id: Date.now() + 1, label: "No", color: "#7c3aed", weight: 0 },
];

const initialQuestions: Question[] = [];

function getEvaluationValidationError(questions: Question[]): string | null {
    if (!questions.length) {
        return "At least 1 question is required.";
    }

    const zeroWeightQuestion = questions.find((question) => question.weight === 0);
    if (zeroWeightQuestion) {
        const questionLabel = zeroWeightQuestion.text?.trim() || `Question ${questions.indexOf(zeroWeightQuestion) + 1}`;
        return `Question "${questionLabel}" must have a weight greater than 0.`;
    }

    for (const question of questions) {
        const questionLabel = question.text?.trim() || `Question ${questions.indexOf(question) + 1}`;

        if (question.type === "Single Choice") {
            if (!question.options?.length || question.options.length < 2) {
                return `Single Choice question "${questionLabel}" must have at least 2 options.`;
            }

            const optionWeights = question.options.map((option) => Number(option.weight || 0));
            if (optionWeights.some((optionWeight) => optionWeight < 1 || optionWeight > 100)) {
                return `Single Choice question "${questionLabel}" cannot have an option with weight outside the range 1-100.`;
            }
        }

        if (question.type === "Yes / No") {
            const optionWeights = question.options.map((option) => Number(option.weight || 0));
             if (optionWeights.some((optionWeight) => optionWeight < 1 || optionWeight > 100)) {
                return `"${questionLabel}" cannot have an option with weight outside the range 1-100.`;
            }
        }
    }

    const totalWeight = questions.reduce((sum, question) => sum + Number(question.weight || 0), 0);
    if (totalWeight !== 100) {
        return `Total weightage must be exactly 100% (currently ${totalWeight}%).`;
    }

    return null;
}

interface CustomBadgeProps {
    children: React.ReactNode;
    className?: string;
}

function CustomBadge({ children, className = "" }: CustomBadgeProps) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${className}`}>
            {children}
        </span>
    );
}

interface WeightInputProps {
    value: number;
    onChange: (value: number) => void;
    disabled: boolean;
}

function WeightInput({ value, onChange, disabled }: WeightInputProps) {
    const [localVal, setLocalVal] = useState<string>(String(value));

    useEffect(() => {
        const currentNum = localVal === "" ? 0 : Number(localVal);
        if (value !== currentNum) {
            setLocalVal(String(value));
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const valStr = e.target.value;

        if (valStr !== "" && isNaN(Number(valStr))) {
            return;
        }

        setLocalVal(valStr);

        const num = valStr === "" ? 0 : Number(valStr);
        const val = Math.min(100, Math.max(0, num));
        onChange(val);
    };

    const handleBlur = () => {
        setLocalVal(String(value));
    };

    return (
        <Input
            className="w-14"
            type="text"
            value={localVal}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={disabled}
        />
    );
}

interface OptionRowProps {
    opt: Option;
    onChange: (updated: Option) => void;
    onDelete: () => void;
    disabled: boolean;
    hideDelete?: boolean;
}

function OptionRow({ opt, onChange, onDelete, disabled, hideDelete }: OptionRowProps) {
    return (
        <div className="flex items-center gap-3 py-1.5">
            <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: opt.color }}
            />
            <Input
                type="text"
                value={opt.label}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onChange({ ...opt, label: e.target.value })
                }
                disabled={disabled || hideDelete}
            />
            <WeightInput
                value={opt.weight}
                onChange={(w) => onChange({ ...opt, weight: w })}
                disabled={disabled}
            />
            {!hideDelete && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title="Delete Evaluation"
                    onClick={onDelete}
                    data-testid={`button-delete-evaluation-${opt.id}`}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            )}
        </div>
    );
}

interface OptionsPanelProps {
    options: Option[];
    onChange: (options: Option[]) => void;
    disabled: boolean;
    isYesNo?: boolean;
}

function OptionsPanel({ options, onChange, disabled, isYesNo }: OptionsPanelProps) {
    const total = options.reduce((s, o) => s + o.weight, 0);
    const hasInvalidWeightOption = options.some((option) => Number(option.weight || 0) < 1 || Number(option.weight || 0) > 100);
    const isValid = total === 100 && !hasInvalidWeightOption;

    const updateOption = (id: number, updated: Option): void =>
        onChange(options.map((o) => (o.id === id ? updated : o)));

    const deleteOption = (id: number): void =>
        onChange(options.filter((o) => o.id !== id));

    const addOption = (): void => {
        if (options.length >= 4) return;
        const usedColors = options.map((option) => option.color);
        const color = DOT_COLORS.find((c) => !usedColors.includes(c)) ?? DOT_COLORS[0];
        onChange([...options, { id: Date.now(), label: "New option", color, weight: 0 }]);
    };

    return (
        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold tracking-widest text-violet-600 uppercase">
                    Option Weightage
                </span>
            </div>

            <div className="space-y-0.5">
                {options.map((opt) => (
                    <OptionRow
                        key={opt.id}
                        opt={opt}
                        onChange={(updated) => updateOption(opt.id, updated)}
                        onDelete={() => deleteOption(opt.id)}
                        disabled={disabled}
                        hideDelete={isYesNo}
                    />
                ))}
            </div>

            {!isYesNo && options.length < 4 ?
                <button
                    onClick={addOption}
                    className="my-3 flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 transition font-medium"
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add option
                </button>
                : <></>}
            {/* <span className={`text-xs ${isValid ? "text-[green]" : "text-red-500 font-medium"}`}>
                (Total: 100% - Currently {total}% - {isValid ? "Valid" : "Invalid"})
            </span> */}
        </div>
    );
}

interface QuestionRowProps {
    q: Question;
    index: number;
    onChangeInput: (updated: Question) => void;
    onDelete: () => void;
    totalWeight: number;
    disabled: boolean;
    showDelete: boolean;
}

function QuestionRow({ q, index, onChangeInput, onDelete, disabled }: QuestionRowProps) {
    const showOptions = q.type === "Single Choice" || q.type === "Yes / No";
    return (
        <div className="border-b border-gray-100 last:border-0 py-4">
            <div className="grid grid-cols-[32px_1fr_180px_100px_40px] items-start gap-3">

                <span className="mt-2 text-xs font-medium text-gray-300 select-none pt-1">
                    {String(index + 1).padStart(2, "0")}
                </span>

                <div>
                    <div className="flex items-start gap-2 flex-wrap">
                        <Input
                            type="text"
                            value={q.text}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                onChangeInput({ ...q, text: e.target.value })
                            }
                            className="w-full"
                            disabled={disabled}
                        />
                    </div>
                    {showOptions && (
                        <OptionsPanel
                            options={q.options}
                            onChange={(opts) => onChangeInput({ ...q, options: opts })}
                            disabled={disabled}
                            isYesNo={q.type === "Yes / No"}
                        />
                    )}
                </div>

                <Select
                    value={q.type}
                    onValueChange={(value: any) => {
                        let newOptions = q.options;
                        if (value === "Single Choice" && q.options.length === 0) {
                            newOptions = defaultOptions();
                        } else if (value === "Yes / No") {
                            newOptions = defaultYesNoOptions();
                        }
                        onChangeInput({
                            ...q,
                            type: value,
                            options: newOptions,
                        });
                    }}
                    disabled={disabled}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {ANSWER_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                                {t}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="flex items-center gap-1">
                    <WeightInput
                        value={q.weight}
                        onChange={(w) => onChangeInput({ ...q, weight: w })}
                        disabled={disabled}
                    />
                    <span className="text-xs text-gray-500">%</span>
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title="Delete Evaluation"
                    onClick={onDelete}
                    data-testid={`button-delete-evaluation-${q.id}`}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
}

export default function EvaluationPreview() {
    const [, params] = useRoute("/app/evaluation-preview/:evaluation");
    const evaluationId = params?.evaluation;

    const [formName, setFormName] = useState<string>("");
    const [evaluationStatus, setEvaluationStatus] = useState<string>("");
    const [questions, setQuestions] = useState<Question[]>(initialQuestions);

    const { data: _suppEvalPreview } = useQuery<EvaluationPreviewResponse>({
        queryKey: [`/api/forms/getformbyid/${evaluationId}`],
        queryFn: async () => {
            const res = await apiRequest("GET", `/api/forms/getformbyid/${evaluationId}`);
            const evalData: EvaluationPreviewResponse = await res.json();
            setFormName(evalData?.data?.title);
            setEvaluationStatus(evalData?.data?.status);
            const questionsList: Question[] =
                evalData?.questions?.map((item: EvaluationPreviewQuestionResponse) => {
                    let opts: Option[] = [];
                    try {
                        opts = item.ques_options ? JSON.parse(item.ques_options) as Option[] : [];
                    } catch (e) {
                        opts = [];
                    }
                    if (item.type === "Yes / No" && opts.length === 0) {
                        opts = defaultYesNoOptions();
                    }
                    return {
                        id: Number(item.id),
                        text: item.text,
                        type: item.type as AnswerType,
                        weight: item.weightage,
                        options: opts,
                    };
                }) || [];
            setQuestions(questionsList);
            return evalData;
        },
        staleTime: 0,
        refetchOnMount: "always",
        enabled: !!evaluationId,
    });

    const totalWeight = questions.reduce((s, q) => s + q.weight, 0);
    const weightValid = totalWeight === 100;

    const isTimestamp = (id: number | string) => {
        const num = Number(id);
        return num > 946684800000 && num < 4102444800000;
    };

    const hasSavedQuestion = questions.some((question) => !isTimestamp(question.id));

    const updateQuestion = (id: number, updated: Question): void => {
        setQuestions(questions.map((q) => (q.id === id ? updated : q)));
    }

    const deleteQuestion = (id: number): void => {
        if (isTimestamp(id)) {
            setQuestions(questions.filter((q) => q.id !== id));
        } else {
            deleteMutation.mutate(id);
        }
    }

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await apiRequest("DELETE", `/api/form/deletequestionbyid/${id}`);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: [`/api/forms/getformbyid/${evaluationId}`],
            });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    });

    const addQuestion = (): void => {
        setQuestions([
            ...questions,
            {
                id: Date.now(),
                text: "New question",
                type: "Rating 1-5",
                weight: 0,
                options: [],
            },
        ]);
    };

    const handleSaveAsDraft = (): void => {
        if (!formName) {
            toast({
                title: "Validation Failure",
                description: "Please enter Form Name",
                variant: "destructive",
            });
            return;
        }

        const validationError = getEvaluationValidationError(questions);
        if (validationError) {
            toast({
                title: "Validation Failure",
                description: validationError,
                variant: "destructive",
            });
            return;
        }

        saveEvalFormOpts.mutate();
    }
    const handlePublish = (): void => {
        if (!formName) {
            toast({
                title: "Validation Failure",
                description: "Please enter Form Name",
                variant: "destructive",
            });
            return;
        }

        const validationError = getEvaluationValidationError(questions);
        if (validationError) {
            toast({
                title: "Validation Failure",
                description: validationError,
                variant: "destructive",
            });
            return;
        }

        const validQuestions = questions.filter(
            (q) => q.text?.trim() || q.options?.length > 0
        );
        const invalidQuestion = validQuestions.find(
            (q) => q.type === "Single Choice" && q.options.length < 2
        );
        if (invalidQuestion) {
            toast({
                title: "Validation Failure",
                description: "Single Choice questions must have at least 2 options.",
                variant: "destructive",
            });
            return;
        }
        for (const question of questions) {
            if (!question.options?.length)
                continue;
            /*const total = question.options.reduce(
                (sum, option) => sum + Number(option.weight || 0),
                0
            );
            if (total !== 100) {
                toast({
                    title: "Validation Failure",
                    description: `"${question.text}" option weightage must total exactly 100%`,
                    variant: "destructive",
                });
                return;
            }*/
        }
        publishEvalFormOpts.mutate();
    };

    const saveEvalFormOpts = useMutation({
        mutationFn: async () => {
            const payload = questions.map(({ id, options, ...question }) => ({
                ...(isTimestamp(id) ? {} : { id }),
                ...question,
                options: options,
            }));
            const response = await apiRequest("POST", "/api/forms/savequestions/" + evaluationId, { survey_title: formName, payload });
            return response.json();
        },
        onSuccess: () => {
            toast({ title: "Survey Form saved successfully" });
            setQuestions([]);
            queryClient.invalidateQueries({
                queryKey: [`/api/forms/getformbyid/${evaluationId}`],
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Failed to save Survey Form",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const publishEvalFormOpts = useMutation({
        mutationFn: async () => {
            const response = await apiRequest(
                "POST",
                "/api/form/publishform",
                {
                    id: evaluationId,
                }
            );
            return response.json();
        },
        onSuccess: () => {
            toast({ title: "Survey Form published successfully" });
            setQuestions([]);
            queryClient.invalidateQueries({
                queryKey: [`/api/forms/getformbyid/${evaluationId}`],
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Failed to publish Survey Form",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-5xl mx-auto space-y-5">

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href={"/app/evaluation"}>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                data-testid="button-back"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <h1 className="text-xl font-medium text-gray-900">
                            {formName || "Untitled form"}
                        </h1>
                        <Badge variant="secondary">
                            {evaluationStatus}
                        </Badge>
                    </div>
                    {evaluationStatus !== "Active" && (
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                onClick={handleSaveAsDraft}
                                data-testid="button-publish"
                                disabled={publishEvalFormOpts.isPending}
                            >
                                {publishEvalFormOpts.isPending && (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                )}
                                Save As Draft
                            </Button>
                            <Button
                                size="sm"
                                onClick={handlePublish}
                                data-testid="button-publish"
                                disabled={publishEvalFormOpts.isPending || saveEvalFormOpts.isPending || !hasSavedQuestion}
                            >
                                {publishEvalFormOpts.isPending && (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                )}
                                Publish
                            </Button>
                        </div>
                    )}
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                        Form name <span className="text-red-400">*</span>
                    </label>
                    <Input
                        type="text"
                        value={formName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setFormName(e.target.value)
                        }
                        disabled={publishEvalFormOpts.isPending}
                        placeholder="Enter form name"
                    />
                </div>

                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                            <span className="text-base font-medium text-gray-900">Questions</span>
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-violet-50 text-violet-700 text-xs font-semibold">
                                {questions.length}
                            </span>
                        </div>
                        {evaluationStatus !== "Active" && (
                        <Button
                            size="sm"
                            onClick={addQuestion}
                            data-testid="button-add-question"
                            disabled={publishEvalFormOpts.isPending}
                        >
                            {publishEvalFormOpts.isPending && (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            )}
                            <Plus className="h-4 w-4 mr-1" />
                            Add question
                        </Button>
                        )}
                    </div>

                    <div className="border-b border-gray-100 last:border-0 bg-gray-50 px-5 py-2">
                        <div className="grid grid-cols-[32px_1fr_180px_100px_40px] items-start gap-3">
                            <span className="w-5 flex-shrink-0" />
                            <span className="flex-1 text-xs font-semibold tracking-widest text-gray-500 uppercase">
                                Question
                            </span>
                            <span className="w-32 text-xs font-semibold tracking-widest text-gray-500 uppercase">
                                Answer type
                            </span>
                            <span className="text-xs font-semibold tracking-widest text-gray-500 uppercase whitespace-nowrap">
                                Weightage %
                            </span>
                            <span className="w-6" />
                        </div></div>

                    <div className="px-5">
                        {questions.length === 0 ? (
                            <div className="py-12 text-center text-sm text-gray-400">
                                No questions added yet - click "Add question" to start.
                            </div>
                        ) : (
                            questions.map((q, i) => (
                                <QuestionRow
                                    key={q.id}
                                    q={q}
                                    index={i}
                                    onChangeInput={(updated) => updateQuestion(q.id, updated)}
                                    onDelete={() => deleteQuestion(q.id)}
                                    showDelete={evaluationStatus !== "Active"}
                                    totalWeight={totalWeight}
                                    disabled={publishEvalFormOpts.isPending}
                                />
                            ))
                        )}
                    </div>

                    {questions.length > 0 && (
                        <div
                            className={`flex items-center justify-between gap-2 px-5 py-3 border-t text-sm ${weightValid ? "border-gray-100 bg-gray-50" : "border-red-100 bg-red-50"
                                }`}
                        >
                            <span className={`text-xs ${weightValid ? "text-[green]" : "text-red-500 font-medium"}`}>
                                Total weightage: {totalWeight}% - {weightValid ? "Valid" : "Invalid"}
                            </span>
                            <span className="text-xs text-gray-400">
                                Answer types: Rating 1-5 · Yes/No · Single Choice
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}