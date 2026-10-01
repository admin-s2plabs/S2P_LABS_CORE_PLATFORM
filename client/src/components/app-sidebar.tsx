import s2pLabsLogo from "@/assets/images/s2plabs_logo.jpeg";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  ChevronRight,
  ClipboardList,
  Clock,
  Database,
  FileText,
  FolderTree,
  Gavel,
  Hammer,
  Home,
  Link2,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShoppingCart,
  UserCheck,
  UserCog,
  Users,
  Wallet,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";

const FLYOUT_CLOSE_DELAY_MS = 150;
const FLYOUT_VIEWPORT_MARGIN = 8;

interface FlyoutPos {
  top: number;
  left: number;
  /** true = anchored to the LEFT of the trigger (RTL), and `left` is the trigger's left edge minus a gap — flip with translateX(-100%). */
  flipX?: boolean;
}

/** Hover-driven flyout panel, portaled to <body> so it can never be clipped by an
 *  ancestor's overflow (the sidebar's own content area scrolls, which clipped an
 *  earlier position:absolute implementation). Hovering the trigger OR the portaled
 *  panel itself keeps it open; leaving both for `FLYOUT_CLOSE_DELAY_MS` closes it. */
function Flyout({
  isOpen,
  pos,
  onEnter,
  onLeave,
  className,
  children,
}: {
  isOpen: boolean;
  pos: FlyoutPos | null;
  onEnter: () => void;
  onLeave: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);

  // Anchored to the trigger's top, a panel opened near the bottom of the screen runs
  // past the viewport — measure it and shift it up so it stays fully visible.
  useLayoutEffect(() => {
    if (!isOpen || !pos || !ref.current) return;
    const height = ref.current.offsetHeight;
    const maxTop = window.innerHeight - height - FLYOUT_VIEWPORT_MARGIN;
    setTop(Math.max(FLYOUT_VIEWPORT_MARGIN, Math.min(pos.top, maxTop)));
  }, [isOpen, pos, children]);

  if (!isOpen || !pos) return null;
  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: top ?? pos.top,
        left: pos.left,
        transform: pos.flipX ? "translateX(-100%)" : undefined,
        maxHeight: `calc(100vh - ${FLYOUT_VIEWPORT_MARGIN * 2}px)`,
        overflowY: "auto",
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={cn("z-50 rounded-md border bg-sidebar text-sidebar-foreground py-1 shadow-lg", className)}
    >
      {children}
    </div>,
    document.body
  );
}

function TruncatedLabel({ label, className }: { label: string; className?: string }) {
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
        <span ref={ref} className={cn("truncate", className)} title={label}>{label}</span>
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
  /** Parent function's id, for the 3rd nesting level (e.g. Contracts -> Contract Terms). Null/undefined = top-level item within its module. */
  parentId?: number | null;
}

interface UserMenuMeta {
  supplierId?: string | number | null;
}

/** Values are module menus (`MenuItem[]`) or `_meta` session payload from `/api/user-menu`. */
type UserMenuResponse = Record<string, MenuItem[] | UserMenuMeta | undefined>;

const iconMap: Record<string, LucideIcon> = {
  "DASHBOARD": Home,
  "SEARCH_SUPPLIERS": Users,
  "VIEW_EDIT_SUPP_PROFILE": UserCheck,
  "CATEGORIES": FolderTree,
  "ITEMS": Package,
  "PR_CATALOGUE": ClipboardList,
  "PO_VIEW": ShoppingCart,
  "BIDS_WORKBENCH": Gavel,
  "SUPP_BIDS_WORKBENCH": Gavel,
  "SUPP_AUCTIONS_WORKBENCH": Hammer,
  "NEW_CONTRACTS": ScrollText,
  "BUDGETS": Wallet,
  "SPEND ANALYSIS": BarChart3,
  "INVOICE_SEARCH": Receipt,
  "BASIC_SETTINGS": Settings,
  "COST_CENTERS": FolderTree,
  "DEPARTMENT_APPRS_SETUP": ScrollText,
  "SETUP_APPRRS_AMT_LIMITS": UserCog,
  "SETUP_NOTIFS": Clock,
  "MANAGE_LOOKUPS": Database,
  "CREATE_SRMS_USERS": Users,
  "CREATE_SRMS_ROLES": UserCog,
  "DELEGATE_USER_ROLES": Users,
  "MANAGE_MASTER_DATA": Database,
  "SYSTEM_MONITOR": Link2,
  "REPORTS": FileText,
};

function getIcon(item: MenuItem): LucideIcon {
  return iconMap[item.functionName] || FileText;
}

const MODULE_ORDER = [
  "Home",
  "Operations",
  "Suppliers",
  "Asset Management",
  "Invoices",
  "Configuration",
  "Spending & Analytics",
];

const MODULE_ICONS: Record<string, LucideIcon> = {
  "Home": Home,
  "Operations": ClipboardList,
  "Suppliers": Users,
  "Asset Management": Boxes,
  "Invoices": Receipt,
  "Configuration": Settings,
  "Spending & Analytics": BarChart3,
};

/** Ordering for 2nd-level items within a module (matches design mockups). Falls back to id order when absent. */
const NAV_ORDER: Record<string, string[]> = {
  "Operations": ["PR_CATALOGUE", "PO_VIEW", "BIDS_WORKBENCH", "SUPP_BIDS_WORKBENCH", "SUPP_AUCTIONS_WORKBENCH", "NEW_CONTRACTS"],
  "Asset Management": ["CATEGORIES", "ITEMS"],
  "Configuration": ["CONFIG_ADMINISTRATION_GROUP", "CONFIG_USER_MGMT_GROUP", "CONFIG_INTEGRATIONS_GROUP"],
  "Spending & Analytics": ["BUDGETS", "SPEND ANALYSIS", "REPORTS"],
};

/** Ordering for 3rd-level items, keyed by the parent's functionName. Falls back to id order when absent. */
const CHILD_ORDER: Record<string, string[]> = {
  "CONFIG_ADMINISTRATION_GROUP": ["BASIC_SETTINGS", "MANAGE_LOOKUPS", "COST_CENTERS", "DEPARTMENT_APPRS_SETUP", "SETUP_APPRRS_AMT_LIMITS", "SETUP_NOTIFS"],
  "CONFIG_USER_MGMT_GROUP": ["CREATE_SRMS_USERS", "CREATE_SRMS_ROLES", "DELEGATE_USER_ROLES"],
  "CONFIG_INTEGRATIONS_GROUP": ["MANAGE_MASTER_DATA", "SYSTEM_MONITOR"],
};

/** 3rd-level items matched by URL, keyed by the parent's URL — for groups whose children
 *  share the parent's functionName (all Contracts entries are NEW_CONTRACTS). */
const CHILD_URLS: Record<string, string[]> = {
  "/app/contracts": ["/app/contract-terms", "/app/contract-sections", "/app/contract-templates", "/app/supp-contracts"],
};

/** Fills in a missing `parentId` for items listed under a group in CHILD_ORDER / CHILD_URLS,
 *  so group headers (Administration, User management, Integrations, Contracts) still open
 *  their children as a flyout even when the menu API omits parent links. */
function withInferredParents(items: MenuItem[]): MenuItem[] {
  const groupIdByChild = new Map<string, number>();
  const groupIdByChildUrl = new Map<string, number>();
  for (const item of items) {
    if (item.parentId != null) continue;
    for (const child of CHILD_ORDER[item.functionName] ?? []) groupIdByChild.set(child, item.id);
    for (const url of (item.url && CHILD_URLS[item.url]) || []) groupIdByChildUrl.set(url, item.id);
  }
  return items.map((i) => {
    if (i.parentId != null) return i;
    const parentId = groupIdByChild.get(i.functionName) ?? (i.url ? groupIdByChildUrl.get(i.url) : undefined);
    return parentId != null && parentId !== i.id ? { ...i, parentId } : i;
  });
}

/** AI agent / AI settings pages were removed from the app — hide any menu rows that still point at them. */
function isAIMenuUrl(url?: string | null): boolean {
  return !!url && /^\/app\/(ai-|eva-agent)/.test(url);
}

function sortByOrder(items: MenuItem[], order?: string[]): MenuItem[] {
  if (!order) return [...items].sort((a, b) => a.id - b.id);
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

  const [openModule, setOpenModule] = useState<string | null>(null);
  const [openModulePos, setOpenModulePos] = useState<FlyoutPos | null>(null);
  const [openSubItemId, setOpenSubItemId] = useState<number | null>(null);
  const [openSubPos, setOpenSubPos] = useState<FlyoutPos | null>(null);
  const moduleCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelModuleClose = () => {
    if (moduleCloseTimer.current) {
      clearTimeout(moduleCloseTimer.current);
      moduleCloseTimer.current = null;
    }
  };
  const cancelSubClose = () => {
    if (subCloseTimer.current) {
      clearTimeout(subCloseTimer.current);
      subCloseTimer.current = null;
    }
  };
  const openModuleFlyout = (moduleName: string, rect: DOMRect) => {
    cancelModuleClose();
    setOpenModule((prev) => {
      if (prev !== moduleName) {
        cancelSubClose();
        setOpenSubItemId(null);
      }
      return moduleName;
    });
    setOpenModulePos(
      isRTL ? { top: rect.top, left: rect.left - 4, flipX: true } : { top: rect.top, left: rect.right + 4 }
    );
  };
  const scheduleModuleClose = () => {
    cancelModuleClose();
    moduleCloseTimer.current = setTimeout(() => {
      setOpenModule(null);
      setOpenSubItemId(null);
    }, FLYOUT_CLOSE_DELAY_MS);
  };
  const openSubFlyout = (itemId: number, rect: DOMRect) => {
    cancelSubClose();
    setOpenSubItemId(itemId);
    setOpenSubPos(
      isRTL ? { top: rect.top, left: rect.left - 4, flipX: true } : { top: rect.top, left: rect.right + 4 }
    );
  };
  const scheduleSubClose = () => {
    cancelSubClose();
    subCloseTimer.current = setTimeout(() => {
      setOpenSubItemId(null);
    }, FLYOUT_CLOSE_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      cancelModuleClose();
      cancelSubClose();
    };
  }, []);

  const { data: menuData, isLoading } = useQuery<UserMenuResponse>({
    queryKey: ["/api/user-menu"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user-menu");
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const closeAll = () => {
    cancelModuleClose();
    cancelSubClose();
    setOpenModule(null);
    setOpenSubItemId(null);
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
    if (!url) return url;
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
    if (!resolvedUrl) return false;
    if (resolvedUrl === "/app/dashboard") return location === resolvedUrl;
    return location === resolvedUrl || location.startsWith(resolvedUrl + "/");
  }

  const availableModules = MODULE_ORDER.filter((mod) => {
    const v = menuData?.[mod];
    return menuData && Array.isArray(v) && v.some((i) => !isAIMenuUrl(i.url));
  });

  /** Build id -> children map for a module's items (children = items whose parentId matches). */
  function childrenOf(items: MenuItem[], parentId: number | null): MenuItem[] {
    return items.filter((i) => (i.parentId ?? null) === parentId);
  }

  function isModuleActive(items: MenuItem[]): boolean {
    return items.some((i) => isItemActive(resolveUrl(i.url, i.functionName)));
  }

  return (
    <Sidebar>
      <SidebarHeader className="px-1.5 py-2">
        <Link href="/app/dashboard">
          <div className="flex flex-col items-center cursor-pointer" data-testid="link-staff-home">
            <img src={s2pLabsLogo} alt="S2P Labs" className="h-12 w-30 rounded object-contain" />
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <div className="flex flex-col items-stretch gap-0.5 py-2 px-1">
          {isLoading && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">{t("sidebar.loading")}</div>
          )}

          {availableModules.map((moduleName) => {
            const allItems = withInferredParents(((menuData![moduleName] as MenuItem[]) ?? []).filter((i) => !isAIMenuUrl(i.url)));
            const topItems = sortByOrder(childrenOf(allItems, null), NAV_ORDER[moduleName]);
            const ModuleIcon = MODULE_ICONS[moduleName] || FileText;
            const active = isModuleActive(allItems);
            const isDirectLink =
              topItems.length === 1 && !!topItems[0].url && childrenOf(allItems, topItems[0].id).length === 0;

            if (isDirectLink) {
              const resolvedUrl = resolveUrl(topItems[0].url, topItems[0].functionName);
              return (
                <Link key={moduleName} href={resolvedUrl} onClick={closeAll}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col items-center gap-1 rounded-md px-1 py-2.5 text-center hover-elevate",
                      active && "bg-sidebar-accent border-l-2 border-sidebar-primary"
                    )}
                    data-testid={`nav-${moduleName.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <ModuleIcon className={cn("h-5 w-5", active ? "text-sidebar-primary" : "text-muted-foreground")} />
                    <span className={cn("text-[11px] leading-tight", active ? "font-medium text-sidebar-primary" : "text-muted-foreground")}>
                      {t(`sidebar.modules.${moduleName}`, moduleName)}
                    </span>
                  </button>
                </Link>
              );
            }

            const isOpen = openModule === moduleName;

            return (
              <div key={moduleName} className="relative">
                <button
                  type="button"
                  onMouseEnter={(e) => openModuleFlyout(moduleName, e.currentTarget.getBoundingClientRect())}
                  onMouseLeave={scheduleModuleClose}
                  onClick={(e) => {
                    if (isOpen) {
                      closeAll();
                    } else {
                      openModuleFlyout(moduleName, e.currentTarget.getBoundingClientRect());
                    }
                  }}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 rounded-md px-1 py-2.5 text-center hover-elevate",
                    (active || isOpen) && "bg-sidebar-accent border-l-2 border-sidebar-primary"
                  )}
                  data-testid={`nav-${moduleName.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <ModuleIcon className={cn("h-5 w-5", (active || isOpen) ? "text-sidebar-primary" : "text-muted-foreground")} />
                  <span className={cn("text-[11px] leading-tight", (active || isOpen) ? "font-medium text-sidebar-primary" : "text-muted-foreground")}>
                    {t(`sidebar.modules.${moduleName}`, moduleName)}
                  </span>
                </button>

                <Flyout
                  isOpen={isOpen}
                  pos={openModulePos}
                  onEnter={cancelModuleClose}
                  onLeave={scheduleModuleClose}
                  className="min-w-[220px]"
                >
                  {topItems.map((item) => {
                    const subItems = sortByOrder(childrenOf(allItems, item.id), CHILD_ORDER[item.functionName]);
                    // A parent that is also a page (Contracts -> /app/contracts) stays reachable as the submenu's first entry.
                    const grandchildren = subItems.length > 0 && item.url ? [{ ...item, parentId: item.id }, ...subItems] : subItems;
                    const Icon = getIcon(item);
                    const resolvedUrl = resolveUrl(item.url, item.functionName);
                    const hasChildren = grandchildren.length > 0;
                    const itemActive = isItemActive(resolvedUrl) || (hasChildren && isModuleActive(grandchildren));
                    const isSubOpen = openSubItemId === item.id;

                    if (!hasChildren && !resolvedUrl) {
                      // Group-header row (e.g. Administration/User management/Integrations) with
                      // no visible children for this user — nothing sensible to navigate to or expand.
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 px-3 py-2 text-sm rounded-sm"
                          data-testid={`nav-${(item.description || item.functionName).toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <TruncatedLabel label={item.description} />
                        </div>
                      );
                    }

                    if (!hasChildren) {
                      return (
                        <Link key={item.id} href={resolvedUrl} onClick={closeAll}>
                          <div
                            className={cn(
                              "flex items-center gap-2 px-3 py-2 text-sm rounded-sm cursor-pointer hover-elevate",
                              itemActive && "text-primary font-medium"
                            )}
                            data-testid={`nav-${(item.description || item.functionName).toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <TruncatedLabel label={item.description} />
                          </div>
                        </Link>
                      );
                    }

                    return (
                      <div
                        key={item.id}
                        onMouseEnter={(e) => openSubFlyout(item.id, e.currentTarget.getBoundingClientRect())}
                        onMouseLeave={scheduleSubClose}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (isSubOpen) {
                              cancelSubClose();
                              setOpenSubItemId(null);
                            } else {
                              setOpenSubItemId(item.id);
                            }
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-sm rounded-sm cursor-pointer hover-elevate",
                            itemActive && "text-primary font-medium"
                          )}
                          data-testid={`nav-${(item.description || item.functionName).toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate text-left">{item.description}</span>
                          <ChevronRight className={cn("h-3.5 w-3.5 shrink-0", isRTL && "rotate-180")} />
                        </button>

                        <Flyout
                          isOpen={isSubOpen}
                          pos={openSubPos}
                          onEnter={cancelSubClose}
                          onLeave={scheduleSubClose}
                          className="min-w-[200px]"
                        >
                          {grandchildren.map((child) => {
                            const ChildIcon = getIcon(child);
                            const childUrl = resolveUrl(child.url, child.functionName);
                            if (!childUrl) {
                              return (
                                <div
                                  key={child.id}
                                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-sm"
                                  data-testid={`nav-${(child.description || child.functionName).toLowerCase().replace(/\s+/g, "-")}`}
                                >
                                  <ChildIcon className="h-4 w-4 shrink-0" />
                                  <TruncatedLabel label={child.description} />
                                </div>
                              );
                            }
                            return (
                              <Link key={child.id} href={childUrl} onClick={closeAll}>
                                <div
                                  className={cn(
                                    "flex items-center gap-2 px-3 py-2 text-sm rounded-sm cursor-pointer hover-elevate",
                                    isItemActive(childUrl) && "text-primary font-medium"
                                  )}
                                  data-testid={`nav-${(child.description || child.functionName).toLowerCase().replace(/\s+/g, "-")}`}
                                >
                                  <ChildIcon className="h-4 w-4 shrink-0" />
                                  <TruncatedLabel label={child.description} />
                                </div>
                              </Link>
                            );
                          })}
                        </Flyout>
                      </div>
                    );
                  })}
                </Flyout>
              </div>
            );
          })}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
