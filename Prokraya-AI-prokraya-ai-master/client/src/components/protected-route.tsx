import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";

interface UserMenuResponse {
  [module: string]: Array<{
    functionName: string;
    url: string;
  }>;
}

const ALWAYS_ACCESSIBLE = [
  "/app/dashboard",
  "/app/profile",
  "/app/feedback",
  "/app/email-notifications",
  "/app/my-tasks",
  "/app/approval-queue",
];

/** Same `functionName` can appear for buyer and supplier menus; use session role from login. */
function isVendorSession(): boolean {
  try {
    const raw = localStorage.getItem("prokraya-auth");
    if (!raw) return false;
    const p = JSON.parse(raw) as { role?: string | null };
    return p.role === "vendor";
  } catch {
    return false;
  }
}

function extractAllowedUrls(menuData: UserMenuResponse | undefined): { exact: Set<string>; prefixes: string[] } {
  const exact = new Set<string>();
  const prefixes: string[] = [];
  const vendor = isVendorSession();
  if (!menuData) return { exact, prefixes };
  for (const [key, items] of Object.entries(menuData)) {
    if (key === "_meta" || !Array.isArray(items)) continue;
    for (const item of items) {
      if (item.url) {
        if (item.url.includes("{")) {
          const prefix = item.url.replace(/\/\{[^}]+\}.*$/, "");
          if (prefix) prefixes.push(prefix);
        } else {
          exact.add(item.url);
        }
      }
      if (item.functionName === "SUPP_AUCTIONS_WORKBENCH" && vendor) {
        exact.add("/app/supplier-auctions");
        prefixes.push("/app/supplier-auctions");
        exact.add("/app/auctions");
      }
    }
  }
  return { exact, prefixes };
}

const ROUTE_PARENT_MAP: Record<string, string> = {
  "/app/requisitions": "/app/purchase-requests",
  "/app/eva-agent": "/app/ai-agents",
  "/app/ai-sourcing-agent": "/app/ai-agents",
  "/app/ai-vendor-agent": "/app/ai-agents",
  "/app/ai-procurement-agent": "/app/ai-agents",
  "/app/ai-contracting-agent": "/app/ai-agents",
  "/app/ai-payables-agent": "/app/ai-agents",
  "/app/ai-compliance-agent": "/app/ai-agents",
  "/app/ai-negotiation-agent": "/app/ai-intelligence-suite",
  "/app/ai-cost-intelligence-agent": "/app/ai-intelligence-suite",
  "/app/ai-spend-agent": "/app/ai-intelligence-suite",
  "/app/workflow-builder": "/app/workflows",
  "/app/workflow-templates": "/app/workflows",
  "/app/workflow-runs": "/app/workflows",
  /** Detail / sub-routes not listed as separate menu URLs in um_functions_dtls */
  "/app/tat": "/app/basic-settings",
  "/app/tat-overview": "/app/basic-settings",
  "/app/auction-details": "/app/auctions",
  "/app/auction-award-details": "/app/auctions",
  "/app/supp-contract-details": "/app/supp-contracts",
  "/app/contract-performance": "/app/contracts",
  "/app/categories-old": "/app/categories",
  "/app/evaluation-preview": "/app/evaluation",
};

function isPathAllowed(path: string, allowed: { exact: Set<string>; prefixes: string[] }): boolean {
  if (ALWAYS_ACCESSIBLE.some(p => path === p || path.startsWith(p + "/"))) {
    return true;
  }

  if (allowed.exact.has(path)) {
    return true;
  }

  for (const prefix of allowed.prefixes) {
    if (path === prefix || path.startsWith(prefix + "/")) {
      return true;
    }
  }

  const segments = path.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 2; i--) {
    const ancestorPath = "/" + segments.slice(0, i).join("/");
    if (allowed.exact.has(ancestorPath)) {
      return true;
    }
  }

  for (const [prefix, parentUrl] of Object.entries(ROUTE_PARENT_MAP)) {
    if (path === prefix || path.startsWith(prefix + "/")) {
      if (allowed.exact.has(parentUrl)) {
        return true;
      }
    }
  }

  return false;
}

interface ProtectedRouteProps {
  component?: React.ComponentType<any>;
  children?: React.ReactNode;
  path?: string;
  componentProps?: Record<string, any>;
}

export function ProtectedRoute({ component: Component, children, componentProps }: ProtectedRouteProps) {
  const [location, navigate] = useLocation();

  const { data: menuData, isLoading } = useQuery<UserMenuResponse>({
    queryKey: ["/api/user-menu"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user-menu");
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return null;
  }

  const allowed = extractAllowedUrls(menuData);
  const currentPath = location;

  if (!isPathAllowed(currentPath, allowed)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6" data-testid="access-denied">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold">Access Denied</h2>
            <p className="text-sm text-muted-foreground text-center">
              You don't have permission to access this page. Please contact your administrator if you believe this is an error.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/app/dashboard")}
              data-testid="button-go-dashboard"
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (Component) {
    return <Component {...(componentProps || {})} />;
  }

  return <>{children}</>;
}
