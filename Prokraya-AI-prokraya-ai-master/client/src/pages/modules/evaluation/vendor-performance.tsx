import Rating from "@/components/rating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, FileText, Package } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

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

export default function VendorPerformance() {
    const [location, setLocation] = useLocation();
    const suppliersData: any = {};
    const pagination = suppliersData?.pagination ?? 100;
    const statusCounts: Record<string, number> = suppliersData?.statusCounts || {};
    const totalSuppliers = Object.values(statusCounts).reduce((a, b) => a + b, 0);
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
    const [page, setPage] = useState(0);

    const statCards = [
        {
            title: "Overall Rating",
            value: Rating({ rating: 4, showRatingNumber: true, className: "pt-2" }),
            icon: CheckCircle2,
            color: "text-emerald-500",
            bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
            filterValue: "Active",
        },
        {
            title: "Evaluated POs",
            value: 7,
            icon: Building2,
            color: "text-primary",
            bgColor: "bg-primary/10",
            filterValue: "all",
        },
        {
            title: "Last Evaluated",
            value: "01 Jun 2026",
            icon: FileText,
            color: "text-slate-500",
            bgColor: "bg-slate-100 dark:bg-slate-800",
            filterValue: "Completed",
        },
    ];

    const evaluationHistory = [
        {
            "po_number": "PO_00277",
            "item": "Sunfeast, Yippee",
            "evaldate": "01-06-2026",
            "reviewed_by": "Priya Sharma",
            "score": 76.0,
            "rating": 4.2,
        }, {
            "po_number": "PO_00241",
            "item": "Bingo, Aashirvaad",
            "evaldate": "08-04-2026",
            "reviewed_by": "Rahul Mehta",
            "score": 80.4,
            "rating": 5,
        }, {
            "po_number": "PO_00198",
            "item": "Sunfeast, Kitchens of India",
            "evaldate": "12-02-2026",
            "reviewed_by": "Priya Sharma",
            "score": 72.1,
            "rating": 3,
        }, {
            "po_number": "PO_00162",
            "item": "Aashirvaad Atta",
            "evaldate": "20-11-2025",
            "reviewed_by": "Anil Kumar",
            "score": 68.5,
            "rating": 2,
        }
    ];

    return (
        <div className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h1 className="text-xl font-bold" data-testid="text-page-title">
                        ITC Limited
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        FMCG Supplier · Packaged Foods · Since Mar 2022
                    </p>
                </div>
            </div>

            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
                {statCards.map((stat) => (
                    <Card
                        key={stat.title}
                        className="hover-elevate cursor-pointer transition-all"
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

            <Card>
                <CardHeader className="py-3 px-4">
                    <SectionHeader icon={Package} title="PO Evaluation History" count={7} />
                </CardHeader>
                <CardContent className="p-0 text-sm">
                    <div className="border rounded-md overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>PO Number</TableHead>
                                    <TableHead>Items Supplied</TableHead>
                                    <TableHead>Eval Date</TableHead>
                                    <TableHead>Reviewed By</TableHead>
                                    <TableHead>Score</TableHead>
                                    <TableHead>Rating</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {evaluationHistory.map((line: any, idx: number) => (
                                    <TableRow key={line.po_number} data-testid={`row-view-line-${line.po_number}`} className="cursor-pointer">
                                        <TableCell className="font-mono text-sm font-medium text-primary py-2">
                                            {line.po_number}
                                        </TableCell>
                                        <TableCell className="text-sm font-medium max-w-[250px] py-2">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span className="block truncate cursor-default">{line.item}</span>
                                                </TooltipTrigger>
                                                <TooltipContent><p>{line.item}</p></TooltipContent>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground py-2">
                                            {line.evaldate}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground py-2">
                                            {line.reviewed_by}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground py-2">
                                            {line.score}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground py-2">
                                            {Rating({ rating: Number(line.rating), showRatingNumber: false })}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>

                {pagination && (
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
                                {pagination.total > 0
                                    ? `${(pagination.page - 1) * limit + 1}-${Math.min(pagination.page * limit, pagination.total)} of ${pagination.total.toLocaleString()}`
                                    : "0 results"}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                                    setPage((p) => Math.min(pagination.totalPages, p + 1))
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
        </div>
    );
}