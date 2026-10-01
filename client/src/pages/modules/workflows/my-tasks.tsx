import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/common-functions";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  FileText,
  Search,
  User,
  UserCheck
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

interface TaskItem {
  subject: string;
  srmsRefNumber: string;
  startDate: string;
  inboxDate: string;
  lastUpdateTime: string;
  initiator: string;
  currentStatus: string;
  taskId: string;
  potentialOwners: string[];
  taskName: string;
  lastActionDate: string;
  lastActionBy: string;
  processInstanceId: string;
  contextSite: string;
  businessEntity: string;
  dueDate: string;
  totalRecords: number;
}

interface TasksResponse {
  tasks: TaskItem[];
  total: number;
}

export default function MyTasks() {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");

  // Navigate to the appropriate detail page based on taskName and subject
  const viewDetails = async (task: TaskItem) => {
    const { taskName, subject, srmsRefNumber, taskId } = task;
    let navigation = "";

    if (taskName === "Purchase Request") {
      navigation = `/app/requisitions/${srmsRefNumber}`;
    } else if (taskName === "Purchase Order") {
      navigation = `/app/purchase-orders/${srmsRefNumber}`;
    } else if (taskName === "Invoice") {
      navigation = `/app/invoices/${srmsRefNumber}`;
    } else if (
      taskName === "Vendor Registration" ||
      taskName === "Supplier Registration" ||
      taskName === "Approve by Procurement"
    ) {
      navigation = `/app/vendors/${srmsRefNumber}`;
    } else if (taskName === "Budget") {
      navigation = `/app/budgets/${srmsRefNumber}`;
    } else if (taskName === "Bid") {
      if (subject?.includes("Bid Publish") || subject?.includes("Bid Extension Approval")) {
        navigation = `/app/bids/${srmsRefNumber}`;
      } else if (subject?.includes("Bid Award")) {
        // srmsRefNumber is awardId for workflow award tasks; fetch bidId from server
        try {
          const res = await apiRequest("GET", `/api/dbo/bids/awards/${srmsRefNumber}/award-details`);
          if (res.ok) {
            const awardData = await res.json();
            const bidId = awardData.bidAwards?.bidrefno;
            navigation = bidId ? `/app/bids/${bidId}/award` : `/app/bids/${srmsRefNumber}/award`;
          } else {
            navigation = `/app/bids/${srmsRefNumber}/award`;
          }
        } catch {
          navigation = `/app/bids/${srmsRefNumber}/award`;
        }
      } else if (subject?.includes("Tender award accept")) {
        // srmsRefNumber is bid_id for database-sourced tasks
        navigation = `/app/bids/${srmsRefNumber}/award`;
      } else if (subject?.includes("Technical scoring")) {
        navigation = `/app/bids/${srmsRefNumber}/tech-score`;
      } else if (subject?.includes("Commercial scoring")) {
        navigation = `/app/bids/${srmsRefNumber}/comm-score`;
      } else if (subject?.includes("Tender opening")) {
        navigation = `/app/bids/${srmsRefNumber}/evaluate`;
      } else {
        navigation = `/app/bids/${srmsRefNumber}`;
      }
    } else if (taskName === "Purchase Agreement" || taskName === "Contract") {
      navigation = `/app/contracts/${srmsRefNumber}`;
    } else if (taskName === "Auction") {
      if (subject?.includes("Auction Award")) {
        navigation = `/app/auction-award-details/${srmsRefNumber}`;
      } else {
        navigation = `/app/auction-details/${srmsRefNumber}`;
      }
    }

    if (navigation) {
      // Store taskId in sessionStorage for approval actions
      console.log("Storing taskId in sessionStorage:", taskId);
      sessionStorage.setItem("currentTaskId", taskId);
      sessionStorage.setItem("linkToBack", "/app/my-tasks");
      navigate(navigation);
    }
  };

  const { data, isLoading } = useQuery<TasksResponse>({
    queryKey: ["/api/dashboard/all-tasks", page, limit],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/dashboard/all-tasks?pageNo=${page - 1}&pageSize=${limit}`);
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
  });

  const tasks = data?.tasks || [];
  const totalRecords = data?.total || 0;
  const totalPages = Math.ceil(totalRecords / limit);

  const filteredTasks = search 
    ? tasks.filter(task => 
        task.subject?.toLowerCase().includes(search.toLowerCase()) ||
        task.srmsRefNumber?.toLowerCase().includes(search.toLowerCase()) ||
        task.initiator?.toLowerCase().includes(search.toLowerCase()) ||
        task.potentialOwners?.[0]?.toLowerCase().includes(search.toLowerCase())
      )
    : tasks;

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-primary" data-testid="text-page-title">My Tasks</h1>
        <p className="text-sm text-muted-foreground">List of Pending Approval Tasks!</p>
      </div>

      <Card>
        <div className="p-3 border-b">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Entity ID, Subject, Submitter..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-search-tasks"
              />
            </div>
          </div>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <h3 className="text-base font-medium mb-1">No pending tasks found</h3>
              <p className="text-sm text-muted-foreground">
                {search ? "Try adjusting your search" : "No tasks available in the system"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="table-my-tasks">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-medium w-[120px]">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        Entity Id
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium max-w-[280px]">
                      <span className="flex items-center gap-1.5">
                        <ClipboardList className="h-3.5 w-3.5" />
                        Subject
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[150px]">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        Submitted By
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[120px]">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        Submitted Date
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[180px]">
                      <span className="flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5" />
                        Current Owner
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[80px] text-center">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map((task, index) => (
                    <TableRow 
                      key={task.taskId} 
                      className="cursor-pointer hover-elevate"
                      onClick={() => viewDetails(task)}
                      data-testid={`task-row-${index}`}
                    >
                      <TableCell className="font-mono text-sm font-medium text-primary py-2" data-testid={`task-entity-${index}`}>
                        {task.srmsRefNumber}
                      </TableCell>
                      <TableCell className="text-sm py-2 max-w-[280px] truncate" data-testid={`task-subject-${index}`}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[280px] cursor-default">
                              {task.subject || task.taskName}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{task.subject || task.taskName}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-sm py-2 max-w-[150px] truncate" data-testid={`task-submitter-${index}`}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[150px] cursor-default">
                              {task.initiator || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{task.initiator || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-2 whitespace-nowrap" data-testid={`task-date-${index}`}>
                        {formatDate(task.inboxDate)}
                      </TableCell>
                      <TableCell className="text-sm py-2 max-w-[180px] truncate" data-testid={`task-owner-${index}`}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[180px] cursor-default">
                              {task.potentialOwners?.[0] || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{task.potentialOwners?.[0] || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            viewDetails(task);
                          }}
                          data-testid={`button-view-task-${index}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {totalRecords > 0 && (
            <div className="flex items-center justify-between border-t px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rows per page:</span>
                <Select
                  value={limit.toString()}
                  onValueChange={(v) => {
                    setLimit(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-7 w-16 text-xs" data-testid="select-rows-per-page">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  {totalRecords > 0 
                    ? `${((page - 1) * limit) + 1}-${Math.min(page * limit, totalRecords)} of ${totalRecords.toLocaleString()}`
                    : "0 results"
                  }
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs px-1">
                  {page}/{totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
