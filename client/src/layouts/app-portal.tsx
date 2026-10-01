import { AppSidebar } from "@/components/app-sidebar";
import { Footer } from "@/components/footer";
import { ProtectedRoute } from "@/components/protected-route";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { UserMenu } from "@/components/user-menu";
import { useQuery } from "@tanstack/react-query";
import { Bell, Mail } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Link, Redirect, Route, Switch, useLocation } from "wouter";


import ApprovalWorkflow from "@/pages/modules/administration/approval-workflow";
import AuditLogs from "@/pages/modules/administration/audit-logs";
import BasicSettings from "@/pages/modules/administration/basic-settings";
import CostCenterSetup from "@/pages/modules/administration/cost-center-setup";
import SetupApprovers from "@/pages/modules/administration/setup-approvers";
import SetupNotifications from "@/pages/modules/administration/setup-notifications";
import BidAwardDetail from "@/pages/modules/bids/bid-award-dtl";
import BidCommScore from "@/pages/modules/bids/bid-comm-score";
import BidDetail from "@/pages/modules/bids/bid-detail";
import BidEvaluate from "@/pages/modules/bids/bid-evaluate";
import BidTechScore from "@/pages/modules/bids/bid-tech-score";
import BidView from "@/pages/modules/bids/bid-view";
import Bids from "@/pages/modules/bids/bids";
import SupplierBidResponse from "@/pages/modules/bids/supp-bid-response";
import SupplierBidResponseView from "@/pages/modules/bids/supp-bid-response-view";
import SupplierBidView from "@/pages/modules/bids/supp-bid-view";
import SupplierBids from "@/pages/modules/bids/supp-bids";
import BudgetDetail from "@/pages/modules/budgets/budget-detail";
import Budgets from "@/pages/modules/budgets/budgets";
import AppDashboard from "@/pages/modules/common/app-dashboard";
import EmailNotifications from "@/pages/modules/common/email-notifications";
import Feedback from "@/pages/modules/common/feedback";
import Profile from "@/pages/modules/common/profile";
import ContractDetail from "@/pages/modules/contracts/contract-detail";
import ContractPerformance from "@/pages/modules/contracts/contract-performance";
import ContractSections from "@/pages/modules/contracts/contract-sections";
import ContractTemplateDetail from "@/pages/modules/contracts/contract-template-detail";
import ContractTemplates from "@/pages/modules/contracts/contract-templates";
import ContractTerms from "@/pages/modules/contracts/contract-terms";
import Contracts from "@/pages/modules/contracts/contracts";
import SupplierContractDetail from "@/pages/modules/contracts/supp-contract-details";
import SupplierContracts from "@/pages/modules/contracts/supp-contracts";
import ApiDocs from "@/pages/modules/integrations/api-docs";
import ApiKeys from "@/pages/modules/integrations/api-keys";
import EntityConfigDetail from "@/pages/modules/integrations/entity-config-detail";
import InterfaceMonitor from "@/pages/modules/integrations/interface-monitor";
import ManageMasterData from "@/pages/modules/integrations/master-data";
import MasterDataDetail from "@/pages/modules/integrations/master-data-detail";
import Categories from "@/pages/modules/procurement/categories";
import CategoriesOld from "@/pages/modules/procurement/categories-old";
import CreateNonPoInvoice from "@/pages/modules/procurement/create-non-po-invoice";
import InvoiceDetail from "@/pages/modules/procurement/invoice-detail";
import Invoices from "@/pages/modules/procurement/invoices";
import Items from "@/pages/modules/procurement/items";
import PurchaseOrderDetail from "@/pages/modules/procurement/purchase-order-detail";
import PurchaseOrders from "@/pages/modules/procurement/purchase-orders";
import PurchaseRequests from "@/pages/modules/procurement/purchase-requests";
import RequisitionDetail from "@/pages/modules/procurement/requisition-detail";
import Reports from "@/pages/modules/reports/reports";
import RfiCampaigns from "@/pages/modules/rfi/rfi-campaigns";
import RfiCampaignDetail from "@/pages/modules/rfi/rfi-campaign-detail";
import RfiComparison from "@/pages/modules/rfi/rfi-comparison";
import SuppRfiCampaigns from "@/pages/modules/rfi/supp-rfi-campaigns";
import SuppRfiResponse from "@/pages/modules/rfi/supp-rfi-response";
import SpendAnalysis from "@/pages/modules/spend-analysis/spend-analysis";
import TatManagement from "@/pages/modules/tat/tat-management";
import TatOverview from "@/pages/modules/tat/tat-overview";
import RoleDelegation from "@/pages/modules/user-management/role-delegation";
import ManageRoles from "@/pages/modules/user-management/roles";
import ManageUsers from "@/pages/modules/user-management/users";
import VendorBanking from "@/pages/modules/vendor-registration/vendor-banking";
import VendorCertificates from "@/pages/modules/vendor-registration/vendor-certificates";
import VendorCompanyDetails from "@/pages/modules/vendor-registration/vendor-company-details";
import VendorContacts from "@/pages/modules/vendor-registration/vendor-contacts";
import { VendorRegistrationDraftProvider } from "@/pages/modules/vendor-registration/vendor-registration-draft-context";
import VendorRegistrationReview from "@/pages/modules/vendor-registration/vendor-review";
import VendorScopeOfSupply from "@/pages/modules/vendor-registration/vendor-scope-of-supply";
import VendorDetail from "@/pages/modules/vendors/vendor-detail-review";
import VendorReview from "@/pages/modules/vendors/vendor-review";
import ApprovalQueue from "@/pages/modules/workflows/approval-queue";
import MyTasks from "@/pages/modules/workflows/my-tasks";
import WorkflowBuilder from "@/pages/modules/workflows/workflow-builder";
import WorkflowRuns from "@/pages/modules/workflows/workflow-runs";
import WorkflowTemplates from "@/pages/modules/workflows/workflow-templates";
import Workflows from "@/pages/modules/workflows/workflows";
import NotFound from "@/pages/not-found";
// Import auction components
import { formatDate } from "@/lib/common-functions";
import { apiRequest } from "@/lib/queryClient";
import AuctionAward from "@/pages/modules/auctions/auction-award";
import AuctionAwardDetail from "@/pages/modules/auctions/auction-award-detail";
import AuctionAwardList from "@/pages/modules/auctions/auction-award-list";
import AuctionCompareBids from "@/pages/modules/auctions/auction-compare-bids";
import AuctionDetail from "@/pages/modules/auctions/auction-detail";
import Auctions from "@/pages/modules/auctions/auctions";
import CreateAuctions from "@/pages/modules/auctions/create-auctions";
import SuppAuctions from "@/pages/modules/auctions/supp-auctions";
import SupplierAuctionWorkbench from "@/pages/modules/auctions/supplier-auction-workbench";
// supplier evaluation
import { VendorRegistrationWizardActionBar } from "@/layouts/vendor-registration-wizard-action-bar";
import Evaluation from "@/pages/modules/evaluation/evaluation";
import EvaluationPreview from "@/pages/modules/evaluation/evaluation-preview";

interface MenuItem {
  id: number;
  functionName: string;
  description: string;
  url: string;
  category: string;
  iconName: string;
}

interface UserMenuMeta {
  supplierId?: string | number | null;
}

type UserMenuResponse = Record<string, MenuItem[] | UserMenuMeta | undefined>;


interface AppPortalProps {
  onLogout: () => void;
}

/** Buyer workbench at `/app/auctions`; vendors always use `/app/supplier-auctions`. */
function BuyerAuctionsRoute() {
  try {
    const raw = localStorage.getItem("prokraya-auth");
    if (raw) {
      const p = JSON.parse(raw) as { role?: string | null };
      if (p.role === "vendor") {
        return <Redirect to="/app/supplier-auctions" />;
      }
    }
  } catch {
    /* ignore */
  }
  return <Auctions />;
}

function DynamicCategories() {
  const { data: menuData } = useQuery<UserMenuResponse>({
    queryKey: ["/api/user-menu"],
  });

  const categoryItem = React.useMemo(() => {
    if (!menuData) return null;
    for (const key in menuData) {
      const items = menuData[key];
      if (Array.isArray(items)) {
        const found = items.find(i => i.url === "/app/categories");
        if (found) return found;
      }
    }
    return null;
  }, [menuData]);

  if (categoryItem?.description === "Categories UNSPSC") {
    return <Categories />;
  }

  if (categoryItem?.description === "Categories") {
    return <CategoriesOld />;
  }

  return <Categories />;
}

interface TaskItem {
  subject: string;
  srmsRefNumber: string;
  inboxDate: string;
  initiator: string;
  taskId: string;
  potentialOwners: string[];
  taskName: string;
}

interface TasksResponse {
  tasks: TaskItem[];
  total: number;
}

interface EmailNotification {
  id: number;
  notification_id: string;
  notif_subject: string;
  from_user: string;
  to_user: string;
  status: string | null;
  recieved_date: string | null;
}

interface UserProfile {
  id: number;
  name: string;
  email_id: string;
  user_name: string;
  photo_path: string | null;
  last_login_date?: string | null;
  orgids: string;
  roleName: string;
  user_status: number;
}

export default function AppPortal({ onLogout }: AppPortalProps) {
  const [location, navigate] = useLocation();
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  // Navigate to the appropriate detail page based on taskName and subject
  const viewTaskDetails = async (task: TaskItem) => {
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
      console.log("Bell Icon: Storing taskId in sessionStorage:", taskId);
      sessionStorage.setItem("currentTaskId", taskId);
      sessionStorage.setItem("linkToBack", "/app/my-tasks");
      setNotificationOpen(false);
      navigate(navigation);
    }
  };

  const sidebarStyle = {
    "--sidebar-width": "6rem",
    "--sidebar-width-icon": "3rem",
  };

  // Get current user from localStorage
  const authData = localStorage.getItem("prokraya-auth");
  const parsedAuth = authData ? JSON.parse(authData) : null;
  const userId = parsedAuth?.userId || null;
  const storedUserName = parsedAuth?.userName || null;
  // Fetch current user profile
  const { data: currentUser } = useQuery<UserProfile>({
    queryKey: ["/api/profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await apiRequest("GET", `/api/profile/${encodeURIComponent(userId)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!userId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  const previousLocation = useRef(location);

  useEffect(() => {
    const allowedRoutes = [
      /^\/app\/invoices\/[^/]+$/,
      /^\/app\/requisitions\/[^/]+$/,
      /^\/app\/purchase-orders\/[^/]+$/,
      /^\/app\/bids\/[^/]+$/,
      /^\/app\/bids\/[^/]+\/award$/,
      /^\/app\/contracts\/[^/]+$/,
      /^\/app\/auction-award-details\/[^/]+$/,
    ];
    const isAllowedRoute = allowedRoutes.some((route) =>
      route.test(location)
    );
    if (
      previousLocation.current !== location &&
      !isAllowedRoute
    ) {
      sessionStorage.removeItem("currentTaskId");
    }
    previousLocation.current = location;
  }, [location]);

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.user_status !== 1) {
      localStorage.clear();
      window.location.href = "/login";
      return;
    }
    const existing = localStorage.getItem("prokraya-auth");
    const existingData = existing ? JSON.parse(existing) : {};
    const updatedAuth = {
      ...existingData,
      orgIds: currentUser.orgids,
      userRole: currentUser.roleName,
    };
    localStorage.setItem("prokraya-auth", JSON.stringify(updatedAuth));
  }, [currentUser]);

  const { data: orgDetails } = useQuery({
    queryKey: ["/api/org-details"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/org-details");
      const data = await res.json();
      localStorage.setItem("orgDetails", JSON.stringify(data));
      return data;
    },
  });

  const { data: tasksData } = useQuery<TasksResponse>({
    queryKey: ["/api/dashboard/all-tasks", "notifications", 0, 3],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/dashboard/all-tasks?pageNo=0&pageSize=3");
      if (!res.ok) return { tasks: [], total: 0 };
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  // Email notifications
  const { data: latestEmails } = useQuery<EmailNotification[]>({
    queryKey: ["/api/email-notifications/latest"],
  });

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: ["/api/email-notifications/unread-count"],
    refetchInterval: 30000,
  });

  const pendingCount = tasksData?.total || 0;
  const latestTasks = tasksData?.tasks || [];
  const emailCount = unreadCount?.count || 0;
  const emails = latestEmails || [];

  const isVendorRegisterWizardPage =
    location.startsWith("/vendor/register/") &&
    location !== "/vendor/register" &&
    location !== "/vendor/register/";

  return (
    <>
      <VendorRegistrationDraftProvider>
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex h-screen w-full overflow-hidden">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="sticky top-0 flex items-center justify-between gap-2 h-14 px-4 border-b bg-background shrink-0 z-40">
              <div className="flex items-center gap-3">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
              </div>
              <div className="flex items-center gap-2">
                <Popover open={emailOpen} onOpenChange={setEmailOpen}>
                  <PopoverTrigger asChild>
                    <button className="p-2 hover:bg-muted rounded-md relative" data-testid="button-email">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      {emailCount > 0 && (
                        <span
                          className="absolute top-0 -right-2 h-4 min-w-4 px-1 bg-blue-500 text-white text-[10px] font-semibold flex items-center justify-center rounded-full"
                          data-testid="badge-email-count"
                        >
                          {emailCount}
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="end">
                    <div className="px-3 py-2 border-b">
                      <h4 className="text-xs font-medium">Email Notifications</h4>
                      <p className="text-[10px] text-muted-foreground">{emailCount} unread notifications</p>
                    </div>
                    <div className="max-h-[220px] overflow-y-auto">
                      {emails.length === 0 ? (
                        <div className="p-3 text-center text-xs text-muted-foreground">
                          No email notifications
                        </div>
                      ) : (
                        emails.map((email, index) => (
                          <div
                            key={email.id}
                            className={`flex items-start gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer ${email.status === 'New' || !email.status ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                            data-testid={`email-notification-${index}`}
                            onClick={() => { setEmailOpen(false); navigate("/app/email-notifications"); }}
                          >
                            <div className="h-6 w-6 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-[10px] font-medium text-blue-500">
                                {(email.notif_subject || "E").charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate" title={email.notif_subject}>
                                {email.notif_subject || "-"}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {email.to_user || "System"} · {formatDate(email.recieved_date)}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    {emailCount >= 0 && (
                      <div className="px-2 py-1.5 border-t">
                        <Link href="/app/email-notifications" onClick={() => setEmailOpen(false)}>
                          <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-primary" data-testid="link-view-all-emails">
                            View All
                          </Button>
                        </Link>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                <Popover open={notificationOpen} onOpenChange={setNotificationOpen}>
                  <PopoverTrigger asChild>
                    <button className="p-2 hover:bg-muted rounded-md relative" data-testid="button-notifications">
                      <Bell className="h-5 w-5 text-muted-foreground" />
                      {pendingCount > 0 && (
                        <span
                          className="absolute top-0 -right-1 h-4 min-w-4 px-1 bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center rounded-full"
                          data-testid="badge-notification-count"
                        >
                          {pendingCount}
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="end">
                    <div className="px-3 py-2 border-b">
                      <h4 className="text-xs font-medium">Pending Tasks</h4>
                      <p className="text-[10px] text-muted-foreground">{pendingCount} tasks awaiting action</p>
                    </div>
                    <div className="max-h-[220px] overflow-y-auto">
                      {latestTasks.length === 0 ? (
                        <div className="p-3 text-center text-xs text-muted-foreground">
                          No pending tasks
                        </div>
                      ) : (
                        latestTasks.map((task, index) => (
                          <div
                            key={task.taskId}
                            className="flex items-start gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer"
                            onClick={() => viewTaskDetails(task)}
                            data-testid={`notification-task-${index}`}
                          >
                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-[10px] font-medium text-primary">
                                {(task.subject || task.taskName || "T").charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate" title={task.subject || task.taskName}>
                                {task.subject || task.taskName}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {task.initiator} · {formatDate(task.inboxDate)}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    {pendingCount > 0 && (
                      <div className="px-2 py-1.5 border-t">
                        <Link href="/app/my-tasks" onClick={() => setNotificationOpen(false)}>
                          <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-primary" data-testid="link-view-all-notifications">
                            View All
                          </Button>
                        </Link>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                <UserMenu
                  userName={currentUser?.name || storedUserName || "User"}
                  userEmail={currentUser?.user_name || ""}
                  userInitials={currentUser?.name ? currentUser.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() : storedUserName ? storedUserName.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase() : "U"}
                  userPhoto={currentUser?.photo_path || undefined}
                  userRole={currentUser?.roleName}
                  onLogout={onLogout}
                />
              </div>
            </header>
            <main className="flex-1 bg-muted/30 overflow-hidden flex flex-col min-h-0">
              <div className="relative flex-1 min-h-0 overflow-auto">
                <Switch>
                  <Route path="/app/dashboard" component={AppDashboard} />
                  <Route path="/app/profile" component={Profile} />
                  <Route path="/app/feedback" component={Feedback} />
                  <Route path="/app/email-notifications" component={EmailNotifications} />
                  <Route path="/app/my-tasks" component={MyTasks} />
                  <Route path="/app/approval-queue" component={ApprovalQueue} />

                  <Route path="/vendor/register/company-details" component={VendorCompanyDetails} />
                  <Route path="/vendor/register/contacts" component={VendorContacts} />
                  <Route path="/vendor/register/banking" component={VendorBanking} />
                  <Route path="/vendor/register/scope-of-supply" component={VendorScopeOfSupply} />
                  <Route path="/vendor/register/certificates" component={VendorCertificates} />
                  <Route path="/vendor/register/review" component={VendorRegistrationReview} />

                  <Route path="/app/vendors">{() => <ProtectedRoute component={VendorReview} />}</Route>
                  <Route path="/app/vendors/:id">{(params) => <ProtectedRoute component={VendorDetail} componentProps={params} />}</Route>
                  <Route path="/app/purchase-requests">{() => <ProtectedRoute component={PurchaseRequests} />}</Route>
                  <Route path="/app/requisitions/:prNumber">{(params) => <ProtectedRoute component={RequisitionDetail} componentProps={params} />}</Route>
                  <Route path="/app/purchase-orders">{() => <ProtectedRoute component={PurchaseOrders} />}</Route>
                  <Route path="/app/purchase-orders/:poNumber">{(params) => <ProtectedRoute component={PurchaseOrderDetail} componentProps={params} />}</Route>
                  <Route path="/app/invoices">{() => <ProtectedRoute component={Invoices} />}</Route>
                  <Route path="/app/invoices/create-non-po">{() => <ProtectedRoute component={CreateNonPoInvoice} />}</Route>
                  <Route path="/app/invoices/:id">{(params) => <ProtectedRoute component={InvoiceDetail} componentProps={params} />}</Route>
                  <Route path="/app/bids">{() => <ProtectedRoute component={Bids} />}</Route>
                  <Route path="/app/suppbids">{() => <ProtectedRoute component={SupplierBids} />}</Route>
                  <Route path="/app/suppbids/:bidId/response/:id/view">{(params) => <ProtectedRoute component={SupplierBidResponseView} componentProps={params} />}</Route>
                  <Route path="/app/suppbids/:bidId/response/:id">{(params) => <ProtectedRoute component={SupplierBidResponse} componentProps={params} />}</Route>
                  <Route path="/app/suppbids/:id/view">{(params) => <ProtectedRoute component={SupplierBidView} componentProps={params} />}</Route>
                  <Route path="/app/bids/:id/award">{(params) => <ProtectedRoute component={BidAwardDetail} componentProps={params} />}</Route>
                  <Route path="/app/bids/:id/evaluate">{(params) => <ProtectedRoute component={BidEvaluate} componentProps={params} />}</Route>
                  <Route path="/app/bids/:id/tech-score">{(params) => <ProtectedRoute component={BidTechScore} componentProps={params} />}</Route>
                  <Route path="/app/bids/:id/comm-score">{(params) => <ProtectedRoute component={BidCommScore} componentProps={params} />}</Route>
                  <Route path="/app/bids/:id/view">{(params) => <ProtectedRoute component={BidView} componentProps={params} />}</Route>
                  <Route path="/app/bids/:id">{(params) => <ProtectedRoute component={BidDetail} componentProps={params} />}</Route>
                  <Route path="/app/budgets">{() => <ProtectedRoute component={Budgets} />}</Route>
                  <Route path="/app/budgets/:id">{(params) => <ProtectedRoute component={BudgetDetail} componentProps={params} />}</Route>
                  <Route path="/app/categories">{() => <ProtectedRoute component={DynamicCategories} />}</Route>
                  <Route path="/app/categories-old">{() => <ProtectedRoute component={CategoriesOld} />}</Route>
                  <Route path="/app/items">{() => <ProtectedRoute component={Items} />}</Route>
                  <Route path="/app/reports/:rest*">{(params) => <ProtectedRoute component={Reports} componentProps={params} />}</Route>
                  <Route path="/app/reports">{() => <ProtectedRoute component={Reports} />}</Route>
                  <Route path="/app/rfi">{() => <ProtectedRoute component={RfiCampaigns} />}</Route>
                  <Route path="/app/rfi/:id/compare">{(params) => <ProtectedRoute component={RfiComparison} componentProps={params} />}</Route>
                  <Route path="/app/rfi/:id">{(params) => <ProtectedRoute component={RfiCampaignDetail} componentProps={params} />}</Route>
                  <Route path="/app/supp-rfi">{() => <ProtectedRoute component={SuppRfiCampaigns} />}</Route>
                  <Route path="/app/supp-rfi/:id">{(params) => <ProtectedRoute component={SuppRfiResponse} componentProps={params} />}</Route>
                  <Route path="/app/contracts">{() => <ProtectedRoute component={Contracts} />}</Route>
                  <Route path="/app/contracts/:id">{(params) => <ProtectedRoute component={ContractDetail} componentProps={params} />}</Route>
                  <Route path="/app/contract-templates">{() => <ProtectedRoute component={ContractTemplates} />}</Route>
                  <Route path="/app/contract-templates/:id">{(params) => <ProtectedRoute component={ContractTemplateDetail} componentProps={params} />}</Route>
                  <Route path="/app/contract-sections">{() => <ProtectedRoute component={ContractSections} />}</Route>
                  <Route path="/app/contract-terms">{() => <ProtectedRoute component={ContractTerms} />}</Route>
                  <Route path="/app/contract-performance">{() => <ProtectedRoute component={ContractPerformance} />}</Route>
                  <Route path="/app/supp-contracts">{() => <ProtectedRoute component={SupplierContracts} />}</Route>
                  <Route path="/app/supp-contract-details/:id">{(params) => <ProtectedRoute component={SupplierContractDetail} componentProps={params} />}</Route>
                  <Route path="/app/spend-analysis">{() => <ProtectedRoute component={SpendAnalysis} />}</Route>
                  <Route path="/app/workflows">{() => <ProtectedRoute component={Workflows} />}</Route>
                  <Route path="/app/workflow-builder">{() => <ProtectedRoute component={WorkflowBuilder} />}</Route>
                  <Route path="/app/workflow-templates">{() => <ProtectedRoute component={WorkflowTemplates} />}</Route>
                  <Route path="/app/workflow-runs">{() => <ProtectedRoute component={WorkflowRuns} />}</Route>
                  <Route path="/app/users">{() => <ProtectedRoute component={ManageUsers} />}</Route>
                  <Route path="/app/roles">{() => <ProtectedRoute component={ManageRoles} />}</Route>
                  <Route path="/app/role-delegation">{() => <ProtectedRoute component={RoleDelegation} />}</Route>
                  <Route path="/app/basic-settings">{() => <ProtectedRoute component={BasicSettings} />}</Route>
                  <Route path="/app/cost-center-setup">{() => <ProtectedRoute component={CostCenterSetup} />}</Route>
                  <Route path="/app/approval-workflow">{() => <ProtectedRoute component={ApprovalWorkflow} />}</Route>
                  <Route path="/app/setup-approvers">{() => <ProtectedRoute component={SetupApprovers} />}</Route>
                  <Route path="/app/setup-notifications">{() => <ProtectedRoute component={SetupNotifications} />}</Route>
                  <Route path="/app/audit-logs">{() => <ProtectedRoute component={AuditLogs} />}</Route>
                  <Route path="/app/tat">{() => <ProtectedRoute component={TatManagement} />}</Route>
                  <Route path="/app/tat-overview">{() => <ProtectedRoute component={TatOverview} />}</Route>
                  <Route path="/app/master-data">{() => <ProtectedRoute component={ManageMasterData} />}</Route>
                  <Route path="/app/master-data/config/:entityKey">{(params) => <ProtectedRoute component={EntityConfigDetail} componentProps={params} />}</Route>
                  <Route path="/app/master-data/:entityName">{(params) => <ProtectedRoute component={MasterDataDetail} componentProps={params} />}</Route>
                  <Route path="/app/system-monitor">{() => <ProtectedRoute component={InterfaceMonitor} />}</Route>
                  <Route path="/app/api-keys">{() => <ProtectedRoute component={ApiKeys} />}</Route>
                  <Route path="/app/api-docs">{() => <ProtectedRoute component={ApiDocs} />}</Route>
                  <Route path="/app/auctions">{() => <ProtectedRoute component={BuyerAuctionsRoute} />}</Route>
                  <Route path="/app/auctions/create">{() => <ProtectedRoute component={CreateAuctions} />}</Route>
                  <Route path="/app/auction-details/:id/compare-bids">
                    {(params) => <ProtectedRoute component={AuctionCompareBids} componentProps={params} />}
                  </Route>
                  <Route path="/app/auction-details/:id/award">
                    {(params) => <ProtectedRoute component={AuctionAward} componentProps={params} />}
                  </Route>
                  <Route path="/app/auction-details/:id/awards">
                    {(params) => <ProtectedRoute component={AuctionAwardList} componentProps={params} />}
                  </Route>
                  <Route path="/app/auction-details/:id">
                    {(params) => <ProtectedRoute component={AuctionDetail} componentProps={params} />}
                  </Route>
                  <Route path="/app/auction-award-details/:awardNo">
                    {(params) => <ProtectedRoute component={AuctionAwardDetail} componentProps={params} />}
                  </Route>
                  <Route path="/app/supplier-auctions/:auctionId/:mode">
                    {(params) => <ProtectedRoute component={SupplierAuctionWorkbench} componentProps={params} />}
                  </Route>
                  <Route path="/app/supplier-auctions">{() => <ProtectedRoute component={SuppAuctions} />}</Route>
                  <Route path="/app/evaluation">{() => <ProtectedRoute component={Evaluation} />}</Route>
                  <Route path="/app/evaluation-preview/:evaluation">{(params) => <ProtectedRoute component={EvaluationPreview} componentProps={params} />}</Route>
                  <Route path="/">
                    <AppDashboard />
                  </Route>
                  <Route component={NotFound} />
                </Switch>
              </div>
              {parsedAuth?.role === "vendor" && isVendorRegisterWizardPage && (
                <VendorRegistrationWizardActionBar />
              )}
              <Footer lastLoginDate={currentUser?.last_login_date || null} />
            </main>
          </div>
        </div>
      </SidebarProvider>
      </VendorRegistrationDraftProvider>
    </>
  );
}
