import Rating from "@/components/rating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FormSheet } from "@/components/form-sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery, keepPreviousData } from "@tanstack/react-query";
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileText, Loader2, Package, Plus, Search, Trash2, History } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import EvaluationReview from "@/pages/modules/evaluation/evaluation-review";

interface SuppEvalResponse {
    data: any[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
    statusCounts: Record<string, number>;
}

interface SurveyForm {
    survey_title: string;
    copied_template: string;
    copied_template_name: string;
}

interface EvaluationStarsStats {
    "5_Stars": string;
    "4_Stars": string;
    "3_Stars": string;
    "2_Stars": string;
    "1_Stars": string;
}

interface EvaluationStats {
    total: string;
    draft_evaluation: string;
    pending_evaluation: string;
    completed_evaluation: string;
    avg_supplier_rating?: string | null;
    stars?: EvaluationStarsStats[];
    suppliers?: Array<{
        supplier_id: number;
        supplier_name: string;
        star_rate: number | null;
        max_score: string;
        po_count: string;
    }>;
    moduleIsActive:string;
}

export interface EvaluationResponse {
    data: EvaluationRecord[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

interface EvaluationRecord {
    id: number;
    type: string;
    title: string;
    status: string;
}

function SectionHeader({ icon: Icon, title, count }: { icon: any; title: string; count?: number }) {
    return (
        <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
                <Icon className="h-3.5 w-3.5 text-primary" />
            </div>
            <h3 className="text-base font-semibold">{title}</h3>
            {count !== undefined && (
                <Badge variant="secondary" className="ml-1">{count}</Badge>
            )}
        </div>
    );
}

export default function Evaluation() {
    const [location, setLocation] = useLocation();
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [search, setSearch] = useState<string>("");
    const [page, setPage] = useState(1);
    const [evalPage, setEvalPage] = useState(1);
    const [evalLimit, setEvalLimit] = useState(10);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [selectedPoNumber, setSelectedPoNumber] = useState<string | null>(null);
    const [selectedEvaluationId, setSelectedEvaluationId] = useState<string | null>(null);
    const [showEvaluationDetails, setShowEvaluationDetails] = useState<boolean>(false);
    const [selectedHistoryForm, setSelectedHistoryForm] = useState<EvaluationRecord | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
    const [formData, setFormData] = useState<SurveyForm>({
        survey_title: "",
        copied_template: "",
        copied_template_name: ""
    })
    const [statsModalOpen, setStatsModalOpen] = useState(false);
    const [statsModalType, setStatsModalType] = useState<"Pending" | "Submitted" | null>(null);
    const [statsPage, setStatsPage] = useState(1);
    const [statsLimit, setStatsLimit] = useState(10);
    function getSearchParams(): URLSearchParams {
        if (typeof window !== "undefined" && window.location?.search) {
            return new URLSearchParams(window.location.search);
        }
        return new URLSearchParams(location.split("?")[1] || "");
    }

    const initialQueryParams = getSearchParams();
    const initialStatus = initialQueryParams.get("status") || "all";
    const initialSearch = initialQueryParams.get("search") || "";
    const initialLimit =
        parseInt(initialQueryParams.get("limit") || "10", 10) || 10;
    const [limit, setLimit] = useState(initialLimit);

    const { data: suppliersData, isLoading } = useQuery<SuppEvalResponse>({
        queryKey: ["/api/dbo/suppliers"],
        queryFn: () =>
            apiRequest(
                "GET",
                `/api/dbo/suppliers`
            ).then((res) => res.json()),
        staleTime: 0,
        refetchOnMount: "always",
    });

    const suppliers = suppliersData?.data || [];
    const pagination = suppliersData?.pagination;
    const statusCounts = suppliersData?.statusCounts || {};
    const totalSuppliers = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    const handleStatusChange = (value: string) => {
        setStatusFilter(value);
        setPage(1);
    };

    const { data: stats } = useQuery<EvaluationStats>({
        queryKey: ["/api/form/stats"],
        staleTime: 0,
        refetchOnMount: "always",
    });

    const { data: moduleStatus } = useQuery<EvaluationStats>({
        queryKey: ["/api/form/modulestatus"],
        staleTime: 0,
        refetchOnMount: "always",
    });

    const toggleChatBotMutation = useMutation({
          mutationFn: async ({ chatBot }: { chatBot: string }) => {
              const response = await apiRequest(
                  "PATCH",
                  `/api/form/modulestatus/${chatBot}`
              );
    
              const data = await response.json();
    
              if (!response.ok) {
                  throw new Error(data);
              }
    
              return data;
          },
    
         onSuccess: async () => {
          localStorage.removeItem("orgDetails");
          await queryClient.invalidateQueries({ queryKey: ["/api/form/modulestatus"] });
          toast({
            title: "Success",
            description: "Evaluation Status updated successfully",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to update Evaluation Status",
            variant: "destructive",
          });
        },
      });

    const { data: statsData, isLoading: isStatsLoading } = useQuery<any>({
        queryKey: ["/api/form/responsestats", statsModalType, statsPage, statsLimit],
        queryFn: async () => {
            if (!statsModalType) return null;
            const res = await apiRequest("GET", `/api/form/responsestats/${statsModalType}?page=${statsPage}&limit=${statsLimit}`);
            return res.json();
        },
        enabled: !!statsModalType && statsModalOpen,
        placeholderData: keepPreviousData,
        staleTime: 0,
        refetchOnMount: "always",
    });

    const starsObj: EvaluationStarsStats = (stats?.stars?.[0] || {
        "5_Stars": "0",
        "4_Stars": "0",
        "3_Stars": "0",
        "2_Stars": "0",
        "1_Stars": "0",
    }) as EvaluationStarsStats;

    const ratingDistribution = [
        { label: "5 Stars", value: Number(starsObj["5_Stars"] || 0), color: "bg-emerald-500" },
        { label: "4 Stars", value: Number(starsObj["4_Stars"] || 0), color: "bg-violet-600" },
        { label: "3 Stars", value: Number(starsObj["3_Stars"] || 0), color: "bg-violet-400" },
        { label: "2 Stars", value: Number(starsObj["2_Stars"] || 0), color: "bg-amber-600" },
        { label: "1 Star", value: Number(starsObj["1_Stars"] || 0), color: "bg-red-600" },
    ];

    const COLORS = ["bg-emerald-500", "bg-violet-600", "bg-violet-400", "bg-amber-500", "bg-red-600"];
    const avgSupplierRating = Number(stats?.avg_supplier_rating ?? 0);
    const avgSupplierRatingStars = avgSupplierRating > 5 ? (avgSupplierRating / 100) * 5 : avgSupplierRating;
    const topPerformingSuppliers = (stats?.suppliers || []).map((supplier, index) => ({
        name: supplier.supplier_name === "{}" ? `Supplier #${supplier.supplier_id}` : supplier.supplier_name,
        color: COLORS[index % COLORS.length],
        stars: Number(supplier.star_rate || (Number(supplier.max_score || 0) / 100) * 5),
        score: Number(supplier.max_score || 0),
        pocount: Number(supplier.po_count || 0),
    }));

    const statusStyles: any = {
        Published: "bg-blue-100 text-blue-700",
        Completed: "bg-emerald-100 text-emerald-700",
        Pending: "bg-yellow-100 text-yellow-700",
        Draft: "bg-gray-100 text-gray-700",
    };

    const statCards = useMemo(
        () => [
            {
                title: "Total Evaluation Forms",
                value: Number(stats?.total || 0),
                icon: Building2,
                color: "text-primary",
                bgColor: "bg-primary/10",
                filterValue: "all",
            },
            {
                title: "Avg Supplier Rating",
                value: Rating({ rating: avgSupplierRatingStars, showRatingNumber: true, className: "pt-2" }),
                icon: CheckCircle2,
                color: "text-emerald-500",
                bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
                filterValue: "Active",
            },
            {
                title: "Pending Evaluations",
                value: Number(stats?.pending_evaluation || 0),
                icon: Clock,
                color: "text-orange-500",
                bgColor: "bg-orange-100 dark:bg-orange-900/30",
                filterValue: "pending_evaluation",
            },
            {
                title: "Completed Evaluations",
                value: Number(stats?.completed_evaluation || 0),
                icon: CheckCircle2,
                color: "text-emerald-500",
                bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
                filterValue: "completed_evaluation",
            },
        ],
        [avgSupplierRatingStars, stats]
    );

    const buildInvoiceFilterParams = (options?: { page?: number; limit?: number; exportLines?: boolean }) => {
        const params = new URLSearchParams();
        params.set("page", String(options?.page ?? evalPage));
        params.set("limit", String(options?.limit ?? evalLimit));
        return params;
    };

    const queryParams = buildInvoiceFilterParams();

    const { data: suppEvalLines } = useQuery<EvaluationResponse>({
        queryKey: [`/api/form/getAllForms?${queryParams.toString()}`],
        placeholderData: keepPreviousData,
        staleTime: 0,
        refetchOnMount: "always",
    });

    const toggleLocationStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: number; status: string }) => {
            const response = await apiRequest(
                "POST",
                "/api/form/enableordisableform",
                {
                    id,
                    status,
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data);
            }

            return data;
        },

        onSuccess: (data) => {
            console.log("Mutation Success", data);
            queryClient.invalidateQueries({ queryKey: [`/api/form/getAllForms?${queryParams.toString()}`] });

            toast({
                title: "Success",
                description: data,
            });
        },

        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const recentQueryParams = useMemo(() => {
        const params = new URLSearchParams();
        const trimmed = search.trim();
        if (trimmed) {
            if (/^p/i.test(trimmed) || /\d/.test(trimmed)) {
                params.set("poNumber", trimmed);
            } else {
                params.set("supplier", trimmed);
            }
        }
        if (statusFilter !== "all") {
            params.set("status", statusFilter);
        }
        params.set("page", String(page || 1));
        params.set("limit", String(limit));
        return params;
    }, [search, statusFilter, page, limit]);

    const { data: recentEvaluations } = useQuery<any>({
        queryKey: ["/api/form/surveyformresponse", recentQueryParams.toString()],
        queryFn: async () => {
            const res = await apiRequest("GET", `/api/form/surveyformresponse?${recentQueryParams.toString()}`);
            return res.json();
        },
        placeholderData: keepPreviousData,
        staleTime: 0,
        refetchOnMount: "always",
    });

    const recentEvaluationsData = recentEvaluations?.data || [];
    const recentPagination = recentEvaluations?.pagination;

    const { data: historyData, isLoading: isHistoryLoading } = useQuery<any[]>({
        queryKey: [`/api/form/mappedponumber/${selectedHistoryForm?.id}`],
        queryFn: async () => {
            if (!selectedHistoryForm?.id) return [];
            const res = await apiRequest("GET", `/api/form/mappedponumber/${selectedHistoryForm.id}`);
            if (!res.ok) return [];
            return res.json();
        },
        enabled: !!selectedHistoryForm?.id && historyOpen,
        staleTime: 0,
        refetchOnMount: "always",
    });

    const templates_list = [{
        id: "1",
        name: "FMCG Supplier Standard Template v1"
    }, {
        id: "2",
        name: "Vendor Annual Survey Template"
    }, {
        id: "3",
        name: "PO Performance Rating Template"
    }];

    const handleCreateSubmit = () => {
        if (!formData.survey_title) {
            toast({ title: "Survey Title is required", variant: "destructive" });
            return;
        }
        createEvaluation.mutate(formData);
    }

    const createEvaluation = useMutation({
        mutationFn: async (data: SurveyForm) => {
            const response = await apiRequest("POST", "/api/form/saveform", {
                title: data.survey_title,
                type: "PO Evaluation",
                template: data.copied_template || 0,
            });
            return response.json();
        },
        onSuccess: (data: number) => {
            toast({ title: "Survey Form created successfully" });
            setIsCreateOpen(false);
            setFormData({ survey_title: "", copied_template: "", copied_template_name: "" });
            setLocation(`/app/evaluation-preview/${data}`);
        },
        onError: (error: Error) => {
            toast({
                title: "Failed to create Survey Form",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const deleteEvaluation = useMutation({
        mutationFn: async (id: number) => {
            const response = await apiRequest("DELETE", `/api/form/deleteformbyid/${id}`);
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.message || "Failed to delete evaluation form");
            }
            return response.json();
        },
        onSuccess: () => {
            toast({ title: "Evaluation Form deleted successfully" });
            queryClient.invalidateQueries({ queryKey: [`/api/form/getAllForms?${queryParams.toString()}`] });
            queryClient.invalidateQueries({ queryKey: ["/api/form/stats"] });
        },
        onError: (error: Error) => {
            toast({
                title: "Failed to delete Evaluation Form",
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
                        Evaluation &nbsp; 
                         <Switch
                      checked={moduleStatus?.moduleIsActive === "Yes" ? true : false}
                      onCheckedChange={(checked) => {
                             toggleChatBotMutation.mutate({
                              chatBot: checked ? "Y" : "N",
                          });
                      }}
                      data-testid="chat-bot-enabled"
                    />
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        View and manage supplier evaluations across all purchase orders
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        onClick={() => setIsCreateOpen(true)}
                        data-testid="button-create-supplier-evaluation"
                    >
                        <Plus className="h-4 w-4 mr-1" />
                        Create Evaluation
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
                {statCards.map((stat) => (
                    <Card
                        key={stat.title}
                        className="hover-elevate cursor-pointer transition-all"
                        onClick={() => {
                            if (stat.title === "Pending Evaluations") {
                                setStatsModalType("Pending");
                                setStatsPage(1);
                                setStatsModalOpen(true);
                            } else if (stat.title === "Completed Evaluations") {
                                setStatsModalType("Submitted");
                                setStatsPage(1);
                                setStatsModalOpen(true);
                            }
                        }}
                    >
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs text-muted-foreground">{stat.title}</p>
                                    <p className="text-xl font-bold">{stat.value}</p>
                                </div>
                                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                    <div className="flex items-center gap-2 mb-5 pb-2">
                        <h3 className="text-sm font-semibold text-gray-800">
                            Rating Distribution
                        </h3>
                        <span className="text-xs text-gray-500">
                            Completed evaluations only
                        </span>
                    </div>
                    <div className="space-y-3">
                        {ratingDistribution.map((item) => (
                            <div key={item.label} className="flex items-center gap-3 pb-4">
                                <span className="w-12 text-xs text-gray-700">{item.label}</span>
                                <div className="h-2 flex-1 rounded-full bg-gray-200 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${item.color}`}
                                        style={{
                                            width: `${Math.max(item.value, 1)}%`,
                                        }}
                                    />
                                </div>
                                <span className="w-5 text-right text-xs text-gray-500">
                                    {item.value}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">
                        Top Performing Suppliers
                    </h3>

                    {topPerformingSuppliers.map((supplier) => (
                        <div
                            key={supplier.name}
                            className="flex items-center justify-between border-t border-gray-200 py-3 first:border-t-0 first:pt-0"
                        >
                            <div className="flex items-center gap-3">
                                <span
                                    className={`h-2 w-2 rounded-full ${supplier.color}`}
                                />
                                <span className="text-sm text-gray-800">
                                    {supplier.name}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm tracking-wide text-amber-500">
                                    {Rating({ rating: (supplier.score / 100) * 5, showRatingNumber: false })}
                                </span>
                                { <span className="w-10 text-right text-sm text-gray-500">
                                    {`(${supplier.pocount})`}
                                </span> }
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <Card>
                <CardHeader className="py-3 px-4">
                    <SectionHeader icon={Package} title="Evaluation Forms" count={suppEvalLines?.pagination?.total || 0} />
                </CardHeader>
                <CardContent className="p-0 text-sm">
                    {(!suppEvalLines?.data || suppEvalLines?.data?.length === 0) ? (
                        <p className="text-sm text-muted-foreground text-center py-6">No Evaluations found.</p>
                    ) : (
                        <div className="border rounded-md overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Evaluation ID</TableHead>
                                        <TableHead>Title</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="w-12"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {suppEvalLines?.data?.map((line: EvaluationRecord) => (
                                        <TableRow key={line.id} data-testid={`row-view-line-${line.id}`} className="cursor-pointer" onClick={() =>
                                            (window.location.href = `/app/evaluation-preview/${line.id}`)
                                        }>
                                            <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                                                <Switch
                                                    checked={line.status === "Active"}
                                                    onCheckedChange={(checked) => {
                                                        toggleLocationStatusMutation.mutate({
                                                            id: line.id,
                                                            status: checked ? "Y" : "N",
                                                        });
                                                    }}
                                                    data-testid={`switch-evaluation-status-${line.id}`}
                                                />
                                            </TableCell>
                                            <TableCell className="font-mono text-sm font-medium text-primary py-2">
                                                {line.id}
                                            </TableCell>
                                            <TableCell className="text-sm font-medium max-w-[250px] py-2">
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span className="block truncate cursor-default">{line.title}</span>
                                                    </TooltipTrigger>
                                                    <TooltipContent><p>{line.title}</p></TooltipContent>
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground py-2">
                                                <span
                                                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusStyles[line.status] || "bg-gray-100 text-gray-700"
                                                        }`}
                                                >
                                                    {line.status}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                                                {line.status === "Draft" && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                                        onClick={() => {
                                                            deleteEvaluation.mutate(line.id);
                                                        }}
                                                        data-testid={`button-delete-evaluation-${line.id}`}
                                                    >
                                                        {deleteEvaluation.isPending ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                )}
                                                {(line.status === "InActive" || line.status === "Active") && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                                        onClick={() => {
                                                            setSelectedHistoryForm(line);
                                                            setHistoryOpen(true);
                                                        }}
                                                        title="PO History"
                                                        data-testid={`button-history-evaluation-${line.id}`}
                                                    >
                                                        <History className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>

                {pagination && (
                    <div className="flex items-center justify-between border-t px-3 py-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                                Rows per page:
                            </span>
                            <Select
                                value={evalLimit.toString()}
                                onValueChange={(v) => {
                                    setEvalLimit(parseInt(v));
                                    setEvalPage(1);
                                }}
                            >
                                <SelectTrigger
                                    className="h-7 w-[60px] text-xs"
                                    data-testid="select-rows-per-page"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                            </Select>
                            <span className="text-xs text-muted-foreground">
                                {pagination.total > 0
                                    ? `${(pagination.page - 1) * evalLimit + 1}-${Math.min(pagination.page * evalLimit, pagination.total)} of ${pagination.total.toLocaleString()}`
                                    : "0 results"}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setEvalPage((p) => Math.max(1, p - 1))}
                                disabled={pagination.page <= 1}
                                data-testid="button-prev-page"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <span className="text-xs px-1">
                                {pagination.page}/{pagination.totalPages || 1}
                            </span>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() =>
                                    setEvalPage((p) => Math.min(pagination.totalPages, p + 1))
                                }
                                disabled={pagination.page >= pagination.totalPages}
                                data-testid="button-next-page"
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            <Card>
                <CardHeader className="py-3 px-4">
                    <div className="flex justify-between"><SectionHeader icon={FileText} title="Recent Evaluations" />
                        <div className="p-3">
                            <div className="flex flex-col sm:flex-row gap-2 justify-between">
                                <div className="relative w-[220px] sm:w-[320px]">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by PO number or supplier"
                                        value={search}
                                        onChange={(e) => {
                                            setSearch(e.target.value);
                                            setPage(1);
                                        }}
                                        className="pl-8 h-8 text-sm w-full"
                                        data-testid="input-search-pr"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Select
                                        value={statusFilter}
                                        onValueChange={(v) => {
                                            setStatusFilter(v);
                                            setPage(1);
                                        }}
                                    >
                                        <SelectTrigger
                                            className="w-[140px] h-8 text-sm"
                                            data-testid="select-status"
                                        >
                                            <SelectValue placeholder="All Status" />
                                        </SelectTrigger>
                                        <SelectContent onCloseAutoFocus={(e) => e.preventDefault()}>
                                            <SelectItem value="all">All Status</SelectItem>
                                            <SelectItem value="Draft">Draft
                                                {/* Draft ({stats?.draft || 0}) */}
                                            </SelectItem>
                                            <SelectItem value="Submitted">Submitted
                                                {/* Pending ({stats?.pending || 0}) */}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0 text-sm">
                    {(!recentEvaluationsData || recentEvaluationsData.length === 0) ? (
                        <p className="text-sm text-muted-foreground text-center py-6">No Evaluations found.</p>
                    ) : (
                        <div className="border rounded-md overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>PO Number</TableHead>
                                        <TableHead>Supplier</TableHead>
                                        <TableHead>Assigned To</TableHead>
                                        <TableHead>Score</TableHead>
                                        <TableHead>Rating</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recentEvaluationsData.map((line: any, idx: number) => {
                                        const score = line.attribute_12 ? Number(line.attribute_12) : null;
                                        return (
                                            <TableRow key={line.id || idx} data-testid={`row-view-line-${line.po_number}`} className="cursor-pointer">
                                                <TableCell
                                                    className="font-mono text-sm font-medium text-primary py-2 hover:underline cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedPoNumber(line.po_number);
                                                        setSelectedEvaluationId(String(line.survey_id));
                                                        setShowEvaluationDetails(true);
                                                    }}
                                                >
                                                    {line.po_number}
                                                </TableCell>
                                                <TableCell className="text-sm font-medium max-w-[250px] py-2">
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="block truncate cursor-default">{line.supplier_name}</span>
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>{line.supplier_name}</p></TooltipContent>
                                                    </Tooltip>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground py-2">
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="block truncate cursor-default">{line.attribute_14}</span>
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>{line.attribute_14}</p></TooltipContent>
                                                    </Tooltip>
                                                </TableCell>
                                                <TableCell className={"text-sm font-semibold py-2" + (score !== null && score > 85 ? " text-[green]" : "") + (score !== null && score < 50 ? " text-[red]" : "")}>{score !== null ? score : "-"}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground py-2">{score !== null ? Rating({ rating: (score / 100) * 5, showRatingNumber: false }) : "-"}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground py-2">
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusStyles[line.status] || "bg-gray-100 text-gray-700"
                                                            }`}
                                                    >
                                                        {line.status}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground py-2">{formatDate(line.creation_date)}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>

                {recentPagination && (
                    <div className="flex items-center justify-between border-t px-3 py-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                                Rows per page:
                            </span>
                            <Select
                                value={limit.toString()}
                                onValueChange={(v) => {
                                    setLimit(parseInt(v));
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger
                                    className="h-7 w-[60px] text-xs"
                                    data-testid="select-rows-per-page"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                            </Select>
                            <span className="text-xs text-muted-foreground">
                                {recentPagination.total > 0
                                    ? `${(recentPagination.page - 1) * limit + 1}-${Math.min(recentPagination.page * limit, recentPagination.total)} of ${recentPagination.total.toLocaleString()}`
                                    : "0 results"}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={recentPagination.page <= 1}
                                data-testid="button-prev-page"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <span className="text-xs px-1">
                                {recentPagination.page}/{recentPagination.totalPages || 1}
                            </span>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() =>
                                    setPage((p) => Math.min(recentPagination.totalPages, p + 1))
                                }
                                disabled={recentPagination.page >= recentPagination.totalPages}
                                data-testid="button-next-page"
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            <FormSheet
                open={isCreateOpen}
                onOpenChange={() => {
                    setIsCreateOpen(false);
                    setFormData({ survey_title: "", copied_template: "", copied_template_name: "" });
                }}
                title="Create Evaluation"
                description="Set up a new supplier evaluation form"
                onSubmit={handleCreateSubmit}
                submitLabel="Create"
                isSubmitting={createEvaluation.isPending}
                submitDisabled={createEvaluation.isPending}
                widthClassName="sm:max-w-md"
            >
                    <p className="text-xs text-muted-foreground mb-4">
                        <span className="text-destructive">*</span> Indicates mandatory fields
                    </p>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="survey_title">
                                Survey Form Title <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="survey_title"
                                value={formData.survey_title}
                                onChange={(e) =>
                                    setFormData({ ...formData, survey_title: e.target.value })
                                }
                                placeholder="Enter survey form title"
                                data-testid="input-survey-title"
                            />
                        </div>

                        <div className="space-y-2 pb-3 border-b">
                            <Label htmlFor="copied_template">
                                Copy From Template
                            </Label>
                            <Select
                                value={formData.copied_template}
                                onValueChange={(value) => {
                                    const template = templates_list?.find(e => e.id === value);
                                    setFormData({
                                        ...formData,
                                        copied_template: value,
                                        copied_template_name: template?.name || ""
                                    });
                                }}
                            >
                                <SelectTrigger data-testid="select-template">
                                    <SelectValue placeholder="Select Template" />
                                </SelectTrigger>
                                <SelectContent>
                                    {templates_list?.map((template) => (
                                        <SelectItem key={template.id} value={template.id}>
                                            {template.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Optionally pre-fill questions from an existing template
                            </p>
                        </div>

                        <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">
                                Questions will be added after creation
                            </p>
                            <p className="rounded-md p-4 text-xs bg-blue-100 text-blue-700">After creating the form, you can add questions with types: <span className="font-bold">Rating 1-5, Yes / No</span>, and <span className="font-bold">Single Choice</span>. Assign weightage to each question totalling 100%.</p>
                        </div>
                    </div>
            </FormSheet>

            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogContent className="max-w-xl rounded-2xl p-6 bg-white shadow-xl">
                    <DialogHeader className="border-b pb-4 mb-4">
                        <DialogTitle className="text-lg font-bold text-slate-900">
                            PO History — Forms Utilization
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-800">
                                Form: EVAL_{String(selectedHistoryForm?.id || "").padStart(4, "0")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {selectedHistoryForm?.title} • {selectedHistoryForm?.status}
                            </p>
                            <p className="text-sm font-semibold text-violet-700">
                                {isHistoryLoading ? "Loading history..." : `${historyData?.length || 0} POs using this form`}
                            </p>
                        </div>

                        <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                            {isHistoryLoading ? (
                                <div className="space-y-2 py-4">
                                    <div className="h-14 rounded-xl bg-slate-100 animate-pulse w-full" />
                                    <div className="h-14 rounded-xl bg-slate-100 animate-pulse w-full" />
                                </div>
                            ) : !historyData || historyData.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">No PO history found for this form.</p>
                            ) : (
                                historyData.map((item: any, index: number) => (
                                    <div
                                        key={index}
                                        className="border border-violet-200 rounded-xl px-4 py-3 shadow-sm bg-white flex justify-between items-center"
                                    >
                                        <div>
                                            <p className="text-sm font-bold text-violet-700">{item.po_number}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {item.supplier_name === "{}" ? "System Supplier" : item.supplier_name || "-"}
                                            </p>
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium">{formatDate(item.creation_date)}</span>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="flex justify-center pt-2">
                            <Button
                                className="bg-violet-700 hover:bg-violet-800 text-white rounded-lg px-8 font-medium"
                                onClick={() => setHistoryOpen(false)}
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={statsModalOpen} onOpenChange={setStatsModalOpen}>
                <DialogContent className="max-w-3xl rounded-2xl p-6 bg-white shadow-xl max-h-[90vh] flex flex-col">
                    <DialogHeader className="border-b pb-4 mb-4">
                        <DialogTitle className="text-lg font-bold text-slate-900">
                            {statsModalType === "Pending" ? "Pending Evaluations" : "Completed Evaluations"}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            {statsModalType === "Pending" ? "List of pending supplier evaluations" : "List of completed supplier evaluations"}
                        </DialogDescription>
                    </DialogHeader>

                    {isStatsLoading ? (
                        <div className="flex justify-center items-center py-10">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : !statsData?.data || statsData.data.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-10">No records found.</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="border rounded-md overflow-auto max-h-[50vh] flex-1">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>PO Number</TableHead>
                                            <TableHead>Supplier</TableHead>
                                            <TableHead>Assigned To</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {statsData.data.map((item: any, idx: number) => (
                                            <TableRow key={item.po_number || idx}>
                                                <TableCell className="font-mono text-sm font-medium text-primary py-2">
                                                    {item.po_number}
                                                </TableCell>
                                                <TableCell className="text-sm font-medium py-2">
                                                    {item.supplier_name || "-"}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground py-2">
                                                    {item.po_owner_name || "-"}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {statsData.pagination && (
                                <div className="flex items-center justify-between border-t pt-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            Rows per page:
                                        </span>
                                        <Select
                                            value={statsLimit.toString()}
                                            onValueChange={(v) => {
                                                setStatsLimit(parseInt(v));
                                                setStatsPage(1);
                                            }}
                                        >
                                            <SelectTrigger
                                                className="h-7 w-[60px] text-xs"
                                                data-testid="select-stats-rows-per-page"
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="10">10</SelectItem>
                                                <SelectItem value="25">25</SelectItem>
                                                <SelectItem value="50">50</SelectItem>
                                                <SelectItem value="100">100</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <span className="text-xs text-muted-foreground">
                                            {statsData.pagination.total > 0
                                                ? `${(statsData.pagination.page - 1) * statsLimit + 1}-${Math.min(statsData.pagination.page * statsLimit, statsData.pagination.total)} of ${statsData.pagination.total.toLocaleString()}`
                                                : "0 results"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => setStatsPage((p) => Math.max(1, p - 1))}
                                            disabled={statsData.pagination.page <= 1}
                                            data-testid="button-stats-prev-page"
                                        >
                                            <ChevronLeft className="h-3.5 w-3.5" />
                                        </Button>
                                        <span className="text-xs px-1">
                                            {statsData.pagination.page}/{statsData.pagination.totalPages || 1}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() =>
                                                setStatsPage((p) => Math.min(statsData.pagination.totalPages, p + 1))
                                            }
                                            disabled={statsData.pagination.page >= statsData.pagination.totalPages}
                                            data-testid="button-stats-next-page"
                                        >
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Sheet open={showEvaluationDetails} onOpenChange={setShowEvaluationDetails}>
                <SheetContent side="right" className="w-[80vw] sm:max-w-[80vw] overflow-y-auto p-0 pt-10">
                    {selectedPoNumber && selectedEvaluationId && (
                        <EvaluationReview
                            poNumber={selectedPoNumber}
                            evaluationId={selectedEvaluationId}
                            savedResponses={{ questions: [], comment: "" }}
                            submittedResponse={() => { }}
                            openResult={true}
                        />
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}