import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/common-functions";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import { dashboardPendingApprovalListUrl } from "@shared/status-filter";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Building2,
  ClipboardList,
  Clock,
  CreditCard,
  FileCheck,
  FileText,
  Gavel,
  Handshake,
  Package,
  Receipt,
  ShoppingCart,
  Truck,
  UserCheck,
  Users,
  Wallet
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

interface UserCounts {
  totalUsers: number;
  totalUsersNew: number;
  organizationUsers: number;
  organizationUsersNew: number;
  supplierUsers: number;
  supplierUsersNew: number;
}

interface SupplierSpendRow {
  name: string;
  amount: number;
}

const DONUT_COLORS = [
  "var(--swatch-1)",
  "var(--swatch-2)",
  "var(--swatch-3)",
  "var(--swatch-4)",
  "var(--swatch-5)",
];

interface SupplierStats {
  activePOs: number;
  pendingPayments: number;
  openBids: number;
  activeAuctions: number;
  activeContracts: number;
}

interface SupplierActivity {
  activity_type: string;
  description: string;
  activity_date: string;
}

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

interface PendingApprovalCounts {
  [key: string]: number;
}

function StatCard({
  title,
  value,
  newValue,
  icon: Icon,
  bgColor,
  textColor,
  swatchVar,
  onClick,
}: {
  title: string;
  value: number;
  newValue?: number;
  icon: typeof Users;
  bgColor: string;
  textColor: string;
  /** CSS custom property name (e.g. "--swatch-1") to color this card's icon from —
   *  lets a set of cards cycle through the selected accent's swatches instead of
   *  all sharing one flat color. Falls back to bgColor/textColor when omitted. */
  swatchVar?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`hover-elevate ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
      data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <CardContent className="flex items-start gap-3 p-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-primary flex items-center gap-1.5">
            <span className="truncate">{title}</span>
            {newValue !== undefined && (
              <span className="text-sm normal-case shrink-0">· {value + newValue}</span>
            )}
          </p>
          {newValue === undefined ? (
            <p
              className="text-xl font-bold text-primary"
              data-testid={`stat-value-${title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {value}
            </p>
          ) : (
            <div className="flex items-center gap-6 mt-1">
              <div>
                <p className="text-lg font-bold text-primary" data-testid={`stat-value-${title.toLowerCase().replace(/\s+/g, "-")}`}>
                  {value}
                </p>
                <p className="text-[10px] uppercase text-muted-foreground">Active</p>
              </div>
              <div>
                <p className="text-lg font-bold text-primary">{newValue}</p>
                <p className="text-[10px] uppercase text-muted-foreground">New</p>
              </div>
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            !swatchVar && bgColor,
            !swatchVar && textColor
          )}
          style={
            swatchVar
              ? {
                  backgroundColor: `color-mix(in srgb, var(${swatchVar}) 15%, transparent)`,
                  color: `var(${swatchVar})`,
                }
              : undefined
          }
        >
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function ListRow({
  label,
  count,
  onClick,
}: {
  label: string;
  count: number;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-2.5 border-b last:border-0",
        onClick && "cursor-pointer hover-elevate rounded-sm px-2 -mx-2"
      )}
      onClick={onClick}
      data-testid={`list-row-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <span className="text-sm truncate">{label}</span>
      <span className="text-sm font-semibold text-primary shrink-0 ml-3">{count}</span>
    </div>
  );
}

function TaskItemComponent({ task, index }: { task: TaskItem; index: number }) {
  const [, navigate] = useLocation();

  const currentOwner =
    task.potentialOwners?.length > 0
      ? task.potentialOwners[0]
      : task.initiator || "Unknown";

  const viewDetails = async () => {
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
      if (
        subject?.includes("Bid Publish") ||
        subject?.includes("Bid Extension Approval")
      ) {
        navigation = `/app/bids/${srmsRefNumber}`;
      } else if (subject?.includes("Bid Award")) {
        // srmsRefNumber is awardId for workflow award tasks; fetch bidId from server
        try {
          const res = await apiRequest("GET", `/api/dbo/bids/awards/${srmsRefNumber}/award-details`);
          const awardData = await parseJsonResponse<any>(res);
          const bidId = awardData.bidAwards?.bidrefno;
          navigation = bidId ? `/app/bids/${bidId}/award` : `/app/bids/${srmsRefNumber}/award`;
        } catch (error) {
          console.error("Error fetching award details:", error);
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
      console.log("Dashboard: Storing taskId in sessionStorage:", taskId);
      sessionStorage.setItem("currentTaskId", taskId);
      sessionStorage.setItem("linkToBack", "/app/my-tasks");
      navigate(navigation);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-4 py-6 px-4 -mx-3 border-b last:border-0 cursor-pointer hover-elevate",
        index % 2 === 0 && "bg-primary/5"
      )}
      onClick={viewDetails}
      data-testid={`task-item-${index}`}
    >
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          title={task.subject || task.taskName || "Approval Request"}
          data-testid={`task-subject-${index}`}
        >
          {task.subject || task.taskName || "Approval Request"}
        </p>
        <p
          className="text-xs text-muted-foreground mt-1.5"
          data-testid={`task-requester-${index}`}
        >
          {currentOwner}
        </p>
        <p
          className="text-xs text-muted-foreground mt-2"
          data-testid={`task-date-${index}`}
        >
          {formatDate(task.inboxDate)}
        </p>
      </div>
      <Button
        size="sm"
        className="shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          viewDetails();
        }}
        data-testid={`button-view-task-${index}`}
      >
        View
      </Button>
    </div>
  );
}

function ActivityItem({
  activity,
  index,
}: {
  activity: { description: string; date: string };
  index: number;
}) {
  return (
    <div
      className="flex items-center justify-between py-2.5 border-b last:border-0"
      data-testid={`activity-item-${index}`}
    >
      <p className="text-sm text-muted-foreground truncate flex-1 mr-4" title={activity.description}>
        {activity.description}
      </p>
      <p className="text-xs text-muted-foreground whitespace-nowrap">
        {activity.date}
      </p>
    </div>
  );
}

function BudgetItem({
  budget,
  index,
}: {
  budget: {
    name: string;
    owner: string;
    available: number;
    used: number;
    currency: string;
  };
  index: number;
}) {
  const total = budget.available + budget.used;
  const usedPercent = total > 0 ? (budget.used / total) * 100 : 0;

  return (
    <div
      className="py-3 border-b last:border-0"
      data-testid={`budget-item-${index}`}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate">{budget.name}</p>
          <p className="text-xs text-muted-foreground">{budget.owner}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs mt-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">
            {budget.currency} {budget.available.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-muted-foreground">
            {budget.currency} {budget.used.toLocaleString()}
          </span>
        </div>
      </div>
      <Progress value={usedPercent} className="h-1.5 mt-2" />
    </div>
  );
}

function getActivityIcon(type: string) {
  switch (type) {
    case "BID":
      return Gavel;
    case "PO":
      return ShoppingCart;
    case "INVOICE":
      return Receipt;
    default:
      return Activity;
  }
}

function getActivityColors(type: string) {
  switch (type) {
    case "BID":
      return {
        bg: "bg-purple-100 dark:bg-purple-900/30",
        text: "text-purple-500",
      };
    case "PO":
      return { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-500" };
    case "INVOICE":
      return {
        bg: "bg-amber-100 dark:bg-amber-900/30",
        text: "text-amber-500",
      };
    default:
      return { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-500" };
  }
}

function SupplierDashboard() {
  const [, navigate] = useLocation();
  const authData = localStorage.getItem("prokraya-auth");
  const parsed = authData ? JSON.parse(authData) : null;
  const userName = parsed?.userName || "Supplier";

  const { data: supplierStats, isLoading: statsLoading } =
    useQuery<SupplierStats>({
      queryKey: ["/api/dashboard/supplier-stats"],
      staleTime: 30000,
      refetchOnMount: true,
      retry: 1,
    });

  const { data: activities = [], isLoading: activitiesLoading } = useQuery<
    SupplierActivity[]
  >({
    queryKey: ["/api/dashboard/supplier-activities"],
    staleTime: 30000,
    refetchOnMount: true,
    retry: 1,
  });

  const supplierStatCategories = [
    {
      key: "Active POs",
      title: "Active POs",
      value: supplierStats?.activePOs || 0,
      icon: ShoppingCart,
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      textColor: "text-blue-500",
    },
    {
      key: "Pending Payments",
      title: "Pending Payments",
      value: supplierStats?.pendingPayments || 0,
      icon: CreditCard,
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
      textColor: "text-emerald-500",
    },
    {
      key: "Open Bids",
      title: "Open Bids",
      value: supplierStats?.openBids || 0,
      icon: Gavel,
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
      textColor: "text-purple-500",
    },
    {
      key: "Active Auctions",
      title: "Active Auctions",
      value: supplierStats?.activeAuctions || 0,
      icon: Activity,
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
      textColor: "text-amber-500",
    },
    {
      key: "Contracts",
      title: "Under Negotiation",
      value: supplierStats?.activeContracts || 0,
      icon: Handshake,
      bgColor: "bg-teal-100 dark:bg-teal-900/30",
      textColor: "text-teal-500",
    },
  ];

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-primary" data-testid="text-page-title">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Browse and manage all actions from here.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {statsLoading ? (
          <>
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </>
        ) : (
          <>
            {supplierStatCategories.map((category) => {
              const getNavigation = () => {
                switch (category.key) {
                  case "Active POs":
                    return "/app/purchase-orders?status=Approved&page=1&limit=10";
                  case "Pending Payments":
                    return "/app/invoices?status=Approved&page=1&limit=10";
                  case "Open Bids":
                    return "/app/suppbids?status=Open&page=1&limit=10";
                  case "Active Auctions":
                    return "/app/supplier-auctions?status=Active&page=1&limit=10";
                  case "Contracts":
                    return "/app/supp-contracts?filter=In+Negotiation";
                  default:
                    return "";
                }
              };

              return (
                <StatCard
                  key={category.key}
                  title={category.title}
                  value={category.value}
                  icon={category.icon}
                  bgColor={category.bgColor}
                  textColor={category.textColor}
                  onClick={() => {
                    if (!category.value) return;
                    const nav = getNavigation();
                    if (nav) navigate(nav);
                  }}
                />
              );
            })}
          </>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-medium">Recent Activities</h2>
            <p className="text-xs text-muted-foreground">
              Your latest Bid, PO, and invoice activities.
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="p-4">
            {activitiesLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No recent activities
                </p>
              </div>
            ) : (
              <div>
                {activities.map((activity, index) => {
                  const Icon = getActivityIcon(activity.activity_type);
                  const colors = getActivityColors(activity.activity_type);
                  return (
                    <div
                      key={index}
                      className="flex items-center gap-3 py-3 border-b last:border-0"
                      data-testid={`supplier-activity-${index}`}
                    >
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${colors.bg} ${colors.text}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">
                          {activity.description}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(activity.activity_date)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface ActivityRow {
  module: string;
  audit_action: string;
  audit_message: string;
  full_name: string;
  audit_date: string;
}

interface RequestStats {
  draftRequisitions: number;
  pendingRequisitions: number;
  draftOrders: number;
  approvedOrders: number;
  pendingInvoices: number;
}

interface BudgetRow {
  id: number;
  budget_name: string;
  budget_owner_name: string;
  budget_amount: string;
  consumed_amount: string;
  reserved_amount: string;
  budget_curr: string;
  status: string;
}

function AppDashboardContent() {
  const [, navigate] = useLocation();
  const authData = localStorage.getItem("prokraya-auth");
  const parsedAuth = authData ? JSON.parse(authData) : null;
  const userRole: string = parsedAuth?.userRole || "";
  const isAdminUser = ["ROLE_SYSADMIN", "ROLE_SUPERADMIN"].includes(userRole);
  const { data: userCounts, isLoading: userCountsLoading } =
    useQuery<UserCounts>({
      queryKey: ["/api/dashboard/user-counts"],
      staleTime: 30000,
      gcTime: 60000,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      retry: 1,
    });

  const { data: pendingCounts = {}, isLoading: pendingLoading } =
    useQuery<PendingApprovalCounts>({
      queryKey: ["/api/dashboard/pending-approvals"],
      staleTime: 30000,
      gcTime: 60000,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      retry: 1,
    });

  const { data: tasksData, isLoading: tasksLoading } = useQuery<{
    tasks: TaskItem[];
    total: number;
  }>({
    queryKey: ["/api/dashboard/all-tasks", 0, 5],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/dashboard/all-tasks?pageNo=0&pageSize=5");
      if (!res.ok) return { tasks: [], total: 0 };
      return res.json();
    },
    staleTime: 30000,
    gcTime: 60000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const tasks = tasksData?.tasks || [];

  const { data: recentActivitiesData = [], isLoading: activitiesLoading } =
    useQuery<ActivityRow[]>({
      queryKey: ["/api/dashboard/recent-activities"],
      staleTime: 30000,
      retry: 1,
    });

  const { data: requestStats, isLoading: requestStatsLoading } =
    useQuery<RequestStats>({
      queryKey: ["/api/dashboard/my-request-stats"],
      staleTime: 30000,
      retry: 1,
    });

  const { data: budgetsData = [], isLoading: budgetsLoading } = useQuery<
    BudgetRow[]
  >({
    queryKey: ["/api/dashboard/available-budgets"],
    staleTime: 30000,
    retry: 1,
    enabled: ["ROLE_SUPERADMIN", "ROLE_SYSADMIN", "ROLE_FINANCE_OFFICER", "ROLE_FINANCE_MANAGER"].includes(userRole),
  });

  const { data: suppliersSpend = [], isLoading: suppliersSpendLoading } = useQuery<
    SupplierSpendRow[]
  >({
    queryKey: ["/api/dashboard/suppliers-spend-chart"],
    staleTime: 30000,
    retry: 1,
    enabled: ["ROLE_SUPERADMIN", "ROLE_SYSADMIN", "ROLE_FINANCE_OFFICER", "ROLE_FINANCE_MANAGER"].includes(userRole),
  });

  const allApprovalCategories = [
    {
      key: "Vendor Registration",
      title: "Supplier Registrations",
      icon: UserCheck,
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
      textColor: "text-purple-500",
    },
    {
      key: "Supplier Registration",
      title: "Supplier Registrations",
      icon: UserCheck,
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
      textColor: "text-purple-500",
    },
    {
      key: "Purchase Request",
      title: "Purchase Requests",
      icon: ClipboardList,
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
      textColor: "text-orange-500",
    },
    {
      key: "Purchase Order",
      title: "Purchase Orders",
      icon: ShoppingCart,
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      textColor: "text-blue-500",
    },
    {
      key: "Budget",
      title: "Budgets",
      icon: Wallet,
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
      textColor: "text-emerald-500",
    },
    {
      key: "Invoice",
      title: "Invoices",
      icon: Receipt,
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
      textColor: "text-amber-500",
    },
   /* {
      key: "Bid",
      title: "Bids",
      icon: Gavel,
      bgColor: "bg-red-100 dark:bg-red-900/30",
      textColor: "text-red-500",
    },
    {
      key: "Contract",
      title: "Contracts",
      icon: Handshake,
      bgColor: "bg-teal-100 dark:bg-teal-900/30",
      textColor: "text-teal-600",
    },
    {
      key: "Auction",
      title: "Auctions",
      icon: Hammer,
      bgColor: "bg-violet-100 dark:bg-violet-900/30",
      textColor: "text-violet-600",
    },*/
  ];

  const mergedCounts: PendingApprovalCounts = { ...pendingCounts };
  // workflowService already merges Supplier Registration into Vendor Registration
  if (mergedCounts["Supplier Registration"]) {
    mergedCounts["Vendor Registration"] =
      (mergedCounts["Vendor Registration"] || 0) +
      mergedCounts["Supplier Registration"];
    delete mergedCounts["Supplier Registration"];
  }

  const approvalCategories = allApprovalCategories.filter(
    (c) => c.key !== "Supplier Registration",
  );

  const recentActivities = recentActivitiesData?.map((a) => ({
    description: a.audit_message,
    date: formatDate(a.audit_date),
  }));

  const myRequestStats = [
    {
      title: "Draft Requisitions",
      count: requestStats?.draftRequisitions || 0,
      icon: FileText,
      bgColor: "bg-slate-100 dark:bg-slate-800",
      textColor: "text-slate-500",
    },
    {
      title: "Pending Requisitions",
      count: requestStats?.pendingRequisitions || 0,
      icon: Clock,
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
      textColor: "text-orange-500",
    },
    {
      title: "Draft Orders",
      count: requestStats?.draftOrders || 0,
      icon: Package,
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      textColor: "text-blue-500",
    },
    {
      title: "Approved Orders",
      count: requestStats?.approvedOrders || 0,
      icon: Truck,
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
      textColor: "text-purple-500",
    },
    {
      title: "Pending Invoices",
      count: requestStats?.pendingInvoices || 0,
      icon: CreditCard,
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
      textColor: "text-emerald-500",
    },
  ];

  const availableBudgets = budgetsData.map((b) => ({
    name: b.budget_name || "",
    owner: b.budget_owner_name || "",
    available:
      parseFloat(b.budget_amount || "0") -
      parseFloat(b.consumed_amount || "0") -
      parseFloat(b.reserved_amount || "0"),
    used:
      parseFloat(b.consumed_amount || "0") +
      parseFloat(b.reserved_amount || "0"),
    currency: b.budget_curr || "USD",
  }));

  const isFinanceRole = ["ROLE_SUPERADMIN", "ROLE_SYSADMIN", "ROLE_FINANCE_OFFICER", "ROLE_FINANCE_MANAGER"].includes(userRole);
  const budgetDonutData = availableBudgets.map((b) => ({ name: b.name, value: b.available + b.used }));

  return (
    <div className="p-4 space-y-4 max-w-[1440px] mx-auto">
      <div>
        <h1 className="text-xl font-bold text-primary" data-testid="text-page-title">
          My Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Browse and manage all actions from here.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {isAdminUser && (
            <div className="grid gap-4 md:grid-cols-3">
              {userCountsLoading ? (
                <>
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                </>
              ) : (
                <>
                  <StatCard
                    title="Total Users"
                    value={userCounts?.totalUsers || 0}
                    newValue={userCounts?.totalUsersNew || 0}
                    icon={Users}
                    bgColor="bg-primary/10"
                    textColor="text-primary"
                    swatchVar="--swatch-1"
                    onClick={() => navigate("/app/users")}
                  />
                  <StatCard
                    title="Organization Users"
                    value={userCounts?.organizationUsers || 0}
                    newValue={userCounts?.organizationUsersNew || 0}
                    icon={Building2}
                    bgColor="bg-primary/10"
                    textColor="text-primary"
                    swatchVar="--swatch-2"
                    onClick={() =>
                      navigate("/app/users?type=organization&status=active")
                    }
                  />
                  <StatCard
                    title="Supplier Users"
                    value={userCounts?.supplierUsers || 0}
                    newValue={userCounts?.supplierUsersNew || 0}
                    icon={Users}
                    bgColor="bg-primary/10"
                    textColor="text-primary"
                    swatchVar="--swatch-3"
                    onClick={() => navigate("/app/users?type=supplier")}
                  />
                </>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            {isFinanceRole && (
              <Card className="h-full flex flex-col">
                <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b">
                  <Wallet className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-sm font-semibold uppercase text-primary">Available Budgets</h2>
                </div>
                <CardContent className="p-3 flex-1 flex flex-col justify-center">
                  {budgetsLoading ? (
                    <Skeleton className="h-[220px]" />
                  ) : budgetDonutData.length === 0 ? (
                    <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                      No budgets available
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="h-[140px] w-[140px] shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={budgetDonutData}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={40}
                              outerRadius={62}
                              paddingAngle={2}
                            >
                              {budgetDonutData.map((_, i) => (
                                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-1.5 min-w-0 flex-1">
                        {budgetDonutData.map((b, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs">
                            <span
                              className="h-2.5 w-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                            />
                            <span className="truncate text-muted-foreground">{b.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="h-full flex flex-col">
              <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b">
                <FileCheck className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase text-primary whitespace-nowrap">Pending Approval Requests</h2>
              </div>
              <CardContent className="p-3 flex-1 flex flex-col">
                {pendingLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-6" />
                    ))}
                  </div>
                ) : (
                  <div>
                    {approvalCategories.map((category) => (
                      <ListRow
                        key={category.key}
                        label={category.title}
                        count={mergedCounts[category.key] || 0}
                        onClick={() => {
                          const nav = dashboardPendingApprovalListUrl(category.key);
                          if (nav) navigate(nav);
                        }}
                      />
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground text-center mt-auto pt-3">
                  Tasks where action is required from me.
                </p>
              </CardContent>
            </Card>

            <Card className="h-full flex flex-col">
              <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase text-primary">My Requests</h2>
              </div>
              <CardContent className="p-3 flex-1 flex flex-col">
                {requestStatsLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-6" />
                    ))}
                  </div>
                ) : (
                  <div>
                    {myRequestStats.map((stat, index) => {
                      const getNavigation = () => {
                        switch (stat.title) {
                          case "Draft Requisitions":
                            return "/app/purchase-requests?status=Draft&page=1&limit=10";
                          case "Pending Requisitions":
                            return "/app/purchase-requests?status=Pending%20Approval,More%20Info%20Required&page=1&limit=10";
                          case "Draft Orders":
                            return "/app/purchase-orders?status=Draft&page=1&limit=10";
                          case "Approved Orders":
                            return "/app/purchase-orders?status=Approved&page=1&limit=10";
                          case "Pending Invoices":
                            return "/app/invoices?status=Pending%20Approval,More%20Info%20Required&page=1&limit=10";
                          default:
                            return "";
                        }
                      };
                      return (
                        <ListRow
                          key={index}
                          label={stat.title}
                          count={stat.count}
                          onClick={() => {
                            const nav = getNavigation();
                            if (nav) navigate(nav);
                          }}
                        />
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground text-center mt-auto pt-3">
                  Work in progress activities.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="h-full flex flex-col">
              <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b">
                <Activity className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase text-primary">Recent Activity</h2>
              </div>
              <CardContent className="p-3 flex-1">
                {activitiesLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-8" />
                    ))}
                  </div>
                ) : recentActivities.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    No recent activities
                  </div>
                ) : (
                  <div>
                    {recentActivities.map((activity, index) => (
                      <ActivityItem
                        key={index}
                        activity={activity}
                        index={index}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {isFinanceRole && (
              <Card className="h-full flex flex-col">
                <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b">
                  <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-sm font-semibold uppercase text-primary">Suppliers vs Amount</h2>
                </div>
                <CardContent className="p-3 flex-1 min-h-[220px]">
                  {suppliersSpendLoading ? (
                    <Skeleton className="h-full" />
                  ) : suppliersSpend.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      No supplier spend data
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={suppliersSpend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                        <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                        <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

        </div>

        <div className="flex flex-col h-full">
          <Card className="flex-1 flex flex-col">
            <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <h2 className="text-sm font-semibold uppercase text-primary">Tasks To Do</h2>
              </div>
              <Link href="/app/my-tasks">
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="link-view-all-tasks"
                >
                  View All
                  <ArrowUpRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>

            <CardContent className="p-3 flex-1 flex flex-col">
              {tasksLoading ? (
                <div className="space-y-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  ))}
                </div>
              ) : tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No pending tasks
                  </p>
                </div>
              ) : (
                <div>
                  {tasks.slice(0, 5).map((task, index) => (
                    <TaskItemComponent
                      key={task.taskId || index}
                      task={task}
                      index={index}
                    />
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground text-center mt-auto pt-3">
                List of tasks to be completed on priority.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function AppDashboard() {
  const authData = localStorage.getItem("prokraya-auth");
  const parsed = authData ? JSON.parse(authData) : null;
  const role = parsed?.role;

  if (role === "vendor") {
    return <SupplierDashboard />;
  }

  return <AppDashboardContent />;
}
