import prokrayaLogoLight from "@/assets/images/prokraya-logo-light.png";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRightLeft,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  Brain,
  BrainCircuit,
  ChevronDown,
  ClipboardList,
  Clock,
  Cpu,
  Database,
  FileBarChart,
  FileSearch,
  FileText,
  FolderTree,
  Gavel,
  GitBranch,
  GitPullRequest,
  Hammer,
  Key,
  LayoutDashboard,
  Link2,
  Package,
  ScrollText,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  UserCheck,
  UserCog,
  Users,
  Wallet,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";

function TruncatedLabel({ label }: { label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [label]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span ref={ref} className="truncate" title={label}>{label}</span>
      </TooltipTrigger>
      {isTruncated && (
        <TooltipContent side="right" className="text-xs">
          {label}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
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

/** Values are module menus (`MenuItem[]`) or `_meta` session payload from `/api/user-menu`. */
type UserMenuResponse = Record<string, MenuItem[] | UserMenuMeta | undefined>;

const iconMap: Record<string, LucideIcon> = {
  "RFI_CAMPAIGNS": ClipboardList,
  "SUPP_RFI_WORKBENCH": ClipboardList,
  "EVA_PROCUREMENT_BRAIN": Brain,
  "AI_WORKBENCH": Workflow,
  "AI_TEMPLATES": GitBranch,
  "AI_WORKFLOW_BUILDER": Wrench,
  "AI_TRACK_WORKFLOWS": Clock,
  "AI_AGENTS": Bot,
  "AI_INTELLIGENCE_SUITE": Sparkles,
  "DASHBOARD": LayoutDashboard,
  "SEARCH_SUPPLIERS": Users,
  "VIEW_EDIT_SUPP_PROFILE": UserCheck,
  "CATEGORIES": FolderTree,
  "ITEMS": Package,
  "PR_CATALOGUE": ShoppingCart,
  "PO_VIEW": ClipboardList,
  "BIDS_WORKBENCH": Gavel,
  "SUPP_AUCTIONS_WORKBENCH": Hammer,
  "BUDGETS": Wallet,
  "CATEGORIES_OLD": FolderTree,
  "NEW_CONTRACTS": ScrollText,
  "INVOICE_SEARCH": FileSearch,
  "REPORTS": FileBarChart,
  "SPEND ANALYSIS": BarChart3,
  "INVENTORY": Boxes,
  "BASIC_SETTINGS": FileText,
  "COST_CENTERS": FolderTree,
  "DEPARTMENT_APPRS_SETUP": GitPullRequest,
  "SETUP_APPRRS_AMT_LIMITS": UserCog,
  "SETUP_NOTIFS": Bell,
  "AUDIT_LOGS": FileBarChart,
  "TAT_MANAGEMENT": Clock,
  "TAT_OVERVIEW": Clock,
  "AI_MODEL_CONFIG": Cpu,
  "AI_SERVICE_SETTINGS": BrainCircuit,
  "CREATE_SRMS_USERS": Users,
  "CREATE_SRMS_ROLES": Shield,
  "DELEGATE_USER_ROLES": ArrowRightLeft,
  "MANAGE_MASTER_DATA": Database,
  "SYSTEM_MONITOR": Activity,
  "API_KEYS": Key,
  "API_DOCS": BookOpen,
};

function getIcon(item: MenuItem): LucideIcon {
  return iconMap[item.functionName] || FileText;
}

const MODULE_ORDER = ["AI Console", "Modules", "Administration", "User Management", "Integrations"];

const MODULE_ICONS: Record<string, LucideIcon> = {
  "AI Console": Bot,
  "Modules": Database,
  "Administration": Settings,
  "User Management": UserCog,
  "Integrations": Link2,
};

const MODULE_GROUP_IDS: Record<string, string> = {
  "AI Console": "ai",
  "Modules": "modules",
  "Administration": "admin",
  "User Management": "usermgmt",
  "Integrations": "integrations",
};

const CONTRACT_URLS = ["/app/contracts", "/app/contract-terms", "/app/contract-sections", "/app/contract-templates"];

const ITEM_SORT_ORDER: Record<string, string[]> = {
  "AI Console": [
    "AI_WORKBENCH", "AI_TEMPLATES", "AI_WORKFLOW_BUILDER", "AI_TRACK_WORKFLOWS", "AI_AGENTS", "AI_INTELLIGENCE_SUITE",
  ],
  "Modules": [
    "DASHBOARD", "VIEW_EDIT_SUPP_PROFILE", "SEARCH_SUPPLIERS", "CATEGORIES", "CATEGORIES_OLD", "ITEMS", "PR_CATALOGUE",
    "PO_VIEW", "INVOICE_SEARCH", "BIDS_WORKBENCH", "NEW_CONTRACTS",
    "SUPP_AUCTIONS_WORKBENCH", "BUDGETS", "REPORTS", "SPEND ANALYSIS",
  ],
  "Administration": [
    "BASIC_SETTINGS", "COST_CENTERS", "DEPARTMENT_APPRS_SETUP",
    "SETUP_APPRRS_AMT_LIMITS", "SETUP_NOTIFS", "AI_MODEL_CONFIG", "AI_SERVICE_SETTINGS", "AUDIT_LOGS",
  ],
  "User Management": [
    "CREATE_SRMS_USERS", "CREATE_SRMS_ROLES", "DELEGATE_USER_ROLES",
  ],
  "Integrations": [
    "MANAGE_MASTER_DATA", "SYSTEM_MONITOR", "API_KEYS", "API_DOCS",
  ],
};

const CONTRACT_SORT_ORDER = ["/app/contracts", "/app/contract-terms", "/app/contract-sections", "/app/contract-templates"];

function sortItems(moduleName: string, items: MenuItem[]): MenuItem[] {
  const order = ITEM_SORT_ORDER[moduleName];
  if (!order) return items;
  return [...items].sort((a, b) => {
    const idxA = order.indexOf(a.functionName);
    const idxB = order.indexOf(b.functionName);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });
}

export function AppSidebar() {
  const [location] = useLocation();
    const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    "AI Console": false,
    "Modules": true,
    "Administration": false,
    "User Management": false,
    "Integrations": false,
  });

  const { data: menuData, isLoading } = useQuery<UserMenuResponse>({
    queryKey: ["/api/user-menu"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user-menu");
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const meta = menuData?._meta;
  const supplierId =
    meta && !Array.isArray(meta) && "supplierId" in meta ? meta.supplierId : undefined;

  /** Supplier auction UI only — do not use `role === "vendor"` (backend maps many users to "vendor"). */
  const authSnapshot = useMemo(() => {
    try {
      const raw = localStorage.getItem("prokraya-auth");
      if (!raw) return { userRole: null as string | null };
      const parsed = JSON.parse(raw) as { userRole?: string | null };
      return { userRole: parsed.userRole ?? null };
    } catch {
      return { userRole: null };
    }
  }, []);

  const isSupplierAuctionUser =
    authSnapshot.userRole === "ROLE_SUPPLIER_ADMIN" ||
    authSnapshot.userRole === "ROLE_SUPPLIER_USER";

  function resolveUrl(url: string, functionName?: string): string {
    if (url.includes("{supplierId}") && supplierId) {
      return url.replace("{supplierId}", String(supplierId));
    }
    // Buyer / internal staff: menu may still point at supplier routes — normalize to buyer auctions
    if (!isSupplierAuctionUser) {
      if (url === "/app/supplier-auctions" || url.startsWith("/app/supplier-auctions/")) {
        return url.replace(/^\/app\/supplier-auctions/, "/app/auctions");
      }
      return url;
    }
    // Supplier portal: buyer auction URLs → supplier workbench
    if (functionName === "SUPP_AUCTIONS_WORKBENCH") {
      return "/app/supplier-auctions";
    }
    if (
      url === "/app/auctions" ||
      url.startsWith("/app/auctions/") ||
      /^\/app\/auctions\?/.test(url)
    ) {
      return url.replace(/^\/app\/auctions/, "/app/supplier-auctions");
    }
    return url;
  }
    function isItemActive(resolvedUrl: string): boolean {
    if (resolvedUrl === "/app/dashboard") return location === resolvedUrl;
    return location === resolvedUrl || location.startsWith(resolvedUrl + "/") || location.startsWith(resolvedUrl);
  }


  const availableModules = MODULE_ORDER.filter((mod) => {
    const v = menuData?.[mod];
    return menuData && mod !== "_meta" && mod !== "EVA" && Array.isArray(v) && v.length > 0;
  });

    const isContractsGroupActive = CONTRACT_URLS.some(u => location === u || location.startsWith(u + "/"));

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-2">
        <Link href="/app/dashboard">
          <div className="flex flex-col cursor-pointer" data-testid="link-staff-home">
            <img src={prokrayaLogoLight} alt="Prokraya" className="h-7 w-32 object-contain object-left" />
            <span className="text-[10px] text-emerald-400 font-semibold mt-0.5 uppercase tracking-wider ml-[34px] bg-emerald-500/20 px-1.5 py-0.5 rounded">AI-Powered S2P</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="py-1 pb-12">
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading && (
                <SidebarMenuItem>
                  <SidebarMenuButton className="mx-1.5 h-8 opacity-50">
                    <span className="text-xs text-muted-foreground">{t("sidebar.loading")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

                {Array.isArray(menuData?.["EVA"])
                ? menuData["EVA"].map((item) => {
                    const resolvedUrl = resolveUrl(item.url, item.functionName);
                    const isActive = location === resolvedUrl || location.startsWith(resolvedUrl + "/");
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          className="mx-1.5 h-9"
                        >
                          <Link href={resolvedUrl} data-testid="nav-eva-agent">
                            <Brain className="h-4 w-4" />
                            <span className="font-medium text-[#D3D3D3]">{item.description}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })
                : null}

              {availableModules.map((moduleName) => {
                const modItems = menuData![moduleName];
                 const allItems = sortItems(
                  moduleName,
                  Array.isArray(modItems) ? modItems : []
                );
                const ModuleIcon = MODULE_ICONS[moduleName];
                const groupId = MODULE_GROUP_IDS[moduleName];
                const isOpen = openSections[moduleName] ?? false;

                const contractItems = moduleName === "Modules"
                  ? [...allItems]
                      .filter(i => CONTRACT_URLS.includes(i.url))
                      .sort((a, b) => CONTRACT_SORT_ORDER.indexOf(a.url) - CONTRACT_SORT_ORDER.indexOf(b.url))
                  : [];
                const regularItems = moduleName === "Modules"
                  ? allItems.filter(i => !CONTRACT_URLS.includes(i.url))
                  : allItems;

                return (
                  <Collapsible
                    key={moduleName}
                    open={isOpen}
                    onOpenChange={() => toggleSection(moduleName)}
                    className={`group/${groupId}`}
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="mx-1.5 h-8" data-testid={`nav-${groupId}`}>
                          <ModuleIcon className="h-4 w-4" />
                          <span className="flex-1 font-medium text-[#D3D3D3]">{t(`sidebar.modules.${moduleName}`, moduleName)}</span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="ml-3 pl-2 border-l">
                          {(() => {
                            const moduleOrder = ITEM_SORT_ORDER[moduleName] ?? [];
                            const contractsSortPos = moduleOrder.indexOf("NEW_CONTRACTS");
                            const firstAfterContracts = contractsSortPos >= 0
                              ? regularItems.findIndex(i => moduleOrder.indexOf(i.functionName) > contractsSortPos)
                              : -1;
                            const insertAt = firstAfterContracts >= 0 ? firstAfterContracts : regularItems.length;
                            const before = regularItems.slice(0, insertAt);
                            const after = regularItems.slice(insertAt);
                            
                            const renderItem = (item: MenuItem) => {
                              const Icon = getIcon(item);
                              const resolvedUrl = resolveUrl(item.url, item.functionName);
                              const label = item.description;
                              return (
                                <SidebarMenuSubItem key={item.id}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isItemActive(resolvedUrl)}
                                    className="h-7"
                                  >
                                    <Link href={resolvedUrl} title={label} data-testid={`nav-${(item.description || item.functionName).toLowerCase().replace(/\s+/g, '-')}`}>
                                      <Icon className="h-3.5 w-3.5 shrink-0" />
                                      <TruncatedLabel label={label} />
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            };
                            return (
                              <>
                                {before.map(renderItem)}
                                {contractItems.length > 0 && (
                                  <Collapsible
                                    open={openSections["contracts-subgroup"]}
                                    onOpenChange={() => toggleSection("contracts-subgroup")}
                                  >
                                    <SidebarMenuSubItem>
                                      <CollapsibleTrigger asChild>
                                        <SidebarMenuSubButton
                                          isActive={isContractsGroupActive}
                                          className="h-7 cursor-pointer"
                                          data-testid="nav-contracts-group"
                                        >
                                          <ScrollText className="h-3.5 w-3.5 shrink-0" />
                                          <span className="flex-1 truncate">{t("sidebar.contractsGroup", "Contracts")}</span>
                                          <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${openSections["contracts-subgroup"] ? 'rotate-180' : ''}`} />
                                        </SidebarMenuSubButton>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <SidebarMenuSub className="ml-3 pl-2 border-l">
                                          {contractItems.map((item) => {
                                            const Icon = getIcon(item);
                                            const resolvedUrl = resolveUrl(item.url, item.functionName);
                                            const contractLabel = item.description;
                                            return (
                                              <SidebarMenuSubItem key={item.id}>
                                                <SidebarMenuSubButton
                                                  asChild
                                                  isActive={isItemActive(resolvedUrl)}
                                                  className="h-7"
                                                >
                                                  <Link href={resolvedUrl} title={contractLabel} data-testid={`nav-${(item.description || item.functionName).toLowerCase().replace(/\s+/g, '-')}`}>
                                                    <Icon className="h-3.5 w-3.5 shrink-0" />
                                                    <TruncatedLabel label={contractLabel} />
                                                  </Link>
                                                </SidebarMenuSubButton>
                                              </SidebarMenuSubItem>
                                            );
                                          })}
                                        </SidebarMenuSub>
                                      </CollapsibleContent>
                                    </SidebarMenuSubItem>
                                  </Collapsible>
                                )}
                                {after.map(renderItem)}
                              </>
                            );
                          })()}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
