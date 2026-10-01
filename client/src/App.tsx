import { ThemeProvider } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppPortal from "@/layouts/app-portal";
import VendorRegistrationPortal from "@/layouts/vendor-registration-portal";
import AdminSignin from "@/pages/admin-signin";
import ForgotPassword from "@/pages/forgot-password";
import FreeTrial from "@/pages/free-trial";
// import Landing from "@/pages/landing";
import Login from "@/pages/login";
import ResetPassword from "@/pages/reset-password";
import TakeWCCAction from "@/pages/take-wcc-action";
import VendorRegister from "@/pages/vendor-register";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Loader2, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { apiRequest, queryClient } from "./lib/queryClient";
import { getTenantSubdomain } from "./lib/utils";

// website routes
import { Layout } from "@/website/components/Layout";
import { AboutUsPage } from "@/website/pages/AboutUsPage";
import { BlogDetailsPage } from "@/website/pages/BlogDetailsPage";
import { BlogsPage } from "@/website/pages/BlogsPage";
import { BookDemoPage } from "@/website/pages/BookDemoPage";
import { CareersPage } from "@/website/pages/CareersPage";
import { ContactUsPage } from "@/website/pages/ContactUsPage";
import { ContractManagementPage } from "@/website/pages/ContractManagementPage";
import { CookiePolicy } from "@/website/pages/CookiePolicy";
import { DocumentationPage } from "@/website/pages/DocumentationPage";
import { EInvoicingPage } from "@/website/pages/EInvoicingPage";
import { ESourcingPage } from "@/website/pages/ESourcingPage";
import { HelpCenterPage } from "@/website/pages/HelpCenterPage";
import { HomePage } from "@/website/pages/HomePage";
import { PressPage } from "@/website/pages/PressPage";
import { PrivacyPolicy } from "@/website/pages/PrivacyPolicy";
import { PurchaseRequisitionPage } from "@/website/pages/PurchaseRequisitionPage";
import { ROICalculatorPage } from "@/website/pages/ROICalculatorPage";
import { SSFasterS2PCycle } from "@/website/pages/SSFasterS2PCycle";
import { SecurityPage } from "@/website/pages/SecurityPage";
import { SpendAnalyticsPage } from "@/website/pages/SpendAnalyticsPage";
import { SuccessStoriesPage } from "@/website/pages/SuccessStoriesPage";
import { SupplierManagementPage } from "@/website/pages/SupplierManagementPage";
import { TermsOfService } from "@/website/pages/TermsOfService";
import { WorkCulturePage } from "@/website/pages/WorkCulturePage";
import { SSProcInvoice } from "./website/pages/SSProcInvoice";
import { SSProcurementCollaboration } from "./website/pages/SSProcurementCollaboration";
import { SSProcurementDigitalTransformation } from "./website/pages/SSProcurementDigitalTransformation";
import { SSProcurementSavings } from "./website/pages/SSProcurementSavings";

function LoggedInResetNotice({ userName }: { userName: string | null }) {
  const handleLogoutAndContinue = () => {
    localStorage.clear();
    // window.location.reload();
  };

  const goToDashboard = () => {
    window.location.href = "/app/dashboard";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-yellow-100 dark:bg-yellow-900/30 mx-auto">
          <LogOut className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold">You're currently signed in</h2>
          {userName && (
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{userName}</span>
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            This link is intended for a different account. Please sign out first to proceed with the password reset.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button onClick={handleLogoutAndContinue} className="w-full">
            Sign out and continue with this link
          </Button>
          <Button variant="outline" onClick={goToDashboard} className="w-full">
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

function RedirectToSignin() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/signin", { replace: true }); }, [navigate]);
  return null;
}

type UserRole = "vendor" | "staff" | null;

interface AuthState {
  isAuthenticated: boolean;
  role: UserRole;
  userId: string | null;
  orgId: string | null;
  userName: string | null;
  vendorStatus: string | null;
  email?: string | null;
  userNameId?: string | null;
  supplierId?: string | null;
}

function AppRouter({ auth, setAuth, onLogin, onLogout }: { 
  auth: AuthState, 
  setAuth: React.Dispatch<React.SetStateAction<AuthState>>,
  onLogin: any,
  onLogout: () => void
}) {
  const [location, setLocation] = useLocation();
  const isTenantSubdomain = !!getTenantSubdomain();

  // Fetch vendor profile if authenticated as vendor
  const { data: vendorProfile, isLoading: isProfileLoading } = useQuery<any>({
    queryKey: ["/api/vendor/profile"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/profile");
      const data = await res.json();
      localStorage.setItem("vendorPrevStatus", data.attribute_4);
      if (data.attribute_4 === "Draft") {
        setLocation("/vendor/register/company-details");
      }
      return data;
    },
    enabled: auth.isAuthenticated && auth.role === "vendor",
    staleTime: 30000,
  });

  useEffect(() => {
    if (auth.isAuthenticated && (location === "/" || location === "/login" || location === "/signin" || location === "/register")) {
      setLocation("/app/dashboard");
    }
  }, [auth.isAuthenticated, location, setLocation]);

  // Authenticated user clicked a reset/setup link — show sign-out prompt instead of 404
  if (auth.isAuthenticated && location.startsWith("/resetpassword")) {
    return <LoggedInResetNotice userName={auth.userName} />;
  }
  if (location.startsWith("/approval-action")) {
    return <TakeWCCAction />;
  }

  const renderWebsiteRoute = (
    path: string,
    Component: React.ComponentType
  ) => (
    <Route path={path}>
      <Layout>
        <Component />
      </Layout>
    </Route>
  );

  if (!auth.isAuthenticated) {
    if (isTenantSubdomain) {
      return (
        <Switch>
          <Route path="/signin">
            <Login onLogin={onLogin} />
          </Route>
          <Route path="/adminsignin">
            <AdminSignin onLogin={onLogin} />
          </Route>
          <Route path="/forgot-password">
            <ForgotPassword />
          </Route>
          <Route path="/resetpassword">
            <ResetPassword />
          </Route>
          <Route path="/register">
            <VendorRegister />
          </Route>
          {/* <Route path="/approval-action">
            <TakeWCCAction />
          </Route> */}
          <Route>
            <RedirectToSignin />
          </Route>
        </Switch>
      );
    }

    return (
      <>
        {/* website routes */}
        <Switch>
          {renderWebsiteRoute("/", HomePage)}
          {renderWebsiteRoute("/about-us", AboutUsPage)}
          {renderWebsiteRoute("/work-culture", WorkCulturePage)}
          {renderWebsiteRoute("/supplier-relationship-management", SupplierManagementPage)}
          {renderWebsiteRoute("/purchase-requistion-software", PurchaseRequisitionPage)}
          {renderWebsiteRoute("/esourcing-software", ESourcingPage)}
          {renderWebsiteRoute("/contract-management-software", ContractManagementPage)}
          {renderWebsiteRoute("/einvoicing-software", EInvoicingPage)}
          {renderWebsiteRoute("/spend-analytics-software", SpendAnalyticsPage)}
          {renderWebsiteRoute("/blogs", BlogsPage)}
          {renderWebsiteRoute("/blog-details/:name", BlogDetailsPage)}
          {renderWebsiteRoute("/success-stories", SuccessStoriesPage)}
          {renderWebsiteRoute("/ss-faster-s2p-cycle", SSFasterS2PCycle)}
          {renderWebsiteRoute("/ss-procurement-collaboration", SSProcurementCollaboration)}
          {renderWebsiteRoute("/ss-procurement-savings", SSProcurementSavings)}
          {renderWebsiteRoute("/ss-procurement-digital-transformation", SSProcurementDigitalTransformation)}
          {renderWebsiteRoute("/ss-proc-invoice", SSProcInvoice)}
          {renderWebsiteRoute("/contact-us", ContactUsPage)}
          {renderWebsiteRoute("/book-demo", BookDemoPage)}
          {renderWebsiteRoute("/careers", CareersPage)}
          {renderWebsiteRoute("/press", PressPage)}
          {renderWebsiteRoute("/documentation", DocumentationPage)}
          {renderWebsiteRoute("/help-center", HelpCenterPage)}
          {renderWebsiteRoute("/privacy-policy", PrivacyPolicy)}
          {renderWebsiteRoute("/terms-of-service", TermsOfService)}
          {renderWebsiteRoute("/cookie-policy", CookiePolicy)}
          {renderWebsiteRoute("/security", SecurityPage)}
          {renderWebsiteRoute("/roi-calculator", ROICalculatorPage)}
        </Switch>
        <Switch>
          <Route path="/login">
            <Login onLogin={onLogin} />
          </Route>
          <Route path="/adminsignin">
            <AdminSignin onLogin={onLogin} />
          </Route>
          <Route path="/register">
            <VendorRegister />
          </Route>
          <Route path="/free-trial">
          <FreeTrial />
        </Route>
          <Route path="/forgot-password">
            <ForgotPassword />
          </Route>
          <Route path="/resetpassword">
            <ResetPassword />
          </Route>
          {/* <Route path="/approval-action">
            <TakeWCCAction />
          </Route> */}
        </Switch>
      </>
    );
  }

  // Handle portal switching for vendors based on attribute_4
  if (auth.role === "vendor") {
    if (isProfileLoading) {
      return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    // attribute_4 === "Active" -> Load AppPortal (Screenshot 2 type)
    // attribute_4 === null/other -> Load VendorRegistrationPortal (Screenshot 1 type)
    if (vendorProfile?.attribute_4 === "Active") {
      return <AppPortal onLogout={onLogout} />;
    }

    return <VendorRegistrationPortal onLogout={onLogout} />;
  }

  // Staff and other roles always see AppPortal
  return <AppPortal onLogout={onLogout} />;
}

function App() {
  const [auth, setAuth] = useState<AuthState>(() => {
    const stored = localStorage.getItem("prokraya-auth");
    if (stored) {
      return JSON.parse(stored);
    }
    return { isAuthenticated: false, role: null, userId: null, orgId: null, userName: null, vendorStatus: null };
  });

  useEffect(() => {
    const existing = localStorage.getItem("prokraya-auth");
    const existingData = existing ? JSON.parse(existing) : {};
    localStorage.setItem("prokraya-auth", JSON.stringify({ ...existingData, ...auth }));
  }, [auth]);

  const handleLogin = (role: "vendor" | "staff", userId: string, orgId?: string, userName?: string, vendorStatus?: string, email?: string, userNameId?: string, supplierId?: string) => {
    setAuth({ isAuthenticated: true, role, userId, orgId: orgId || null, userName: userName || null, vendorStatus: vendorStatus || null, email: email || null, userNameId: userNameId || null, supplierId: supplierId || null });
  };

  const handleLogout = () => {
    setAuth({ isAuthenticated: false, role: null, userId: null, orgId: null, userName: null, vendorStatus: null });
    localStorage.clear();
    // Use location from sub-component or handle redirect here
    window.location.href = getTenantSubdomain() ? "/signin" : "/login";
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="prokraya-theme">
        <TooltipProvider>
          <AppRouter auth={auth} setAuth={setAuth} onLogin={handleLogin} onLogout={handleLogout} />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
