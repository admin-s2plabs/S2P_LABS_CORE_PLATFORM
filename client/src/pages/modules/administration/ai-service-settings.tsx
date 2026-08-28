import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  BrainCircuit, Search, Power, PowerOff, Sparkles,
  ShoppingCart, Package, Users, FileText, Gavel,
  BarChart3, Wallet, ClipboardList, Zap, Bot, Eye,
  ArrowLeft, CheckCircle2, Trophy, Lightbulb,
  ScanSearch, MessageSquareText, Hash, TrendingUp,
  ShieldCheck, FileSearch, FileInput, Brain,
  Target, Scale, ScrollText, BadgeDollarSign,
  AlertTriangle, PieChart, Crown, Gem,
  Calculator, Wand2, Copy, BarChart, BookOpen,
  Award,
} from "lucide-react";
import { Link } from "wouter";

// Managed from Admin -> Basic Settings -> Services instead of this page.
export const BASIC_SETTINGS_SERVICE_KEYS: string[] = [
  "AI_NLP_LINE_ITEMS",
  "AI_BUDGET_VALIDATION",
  "AI_DUPLICATE_PR_DETECTION",
  "AI_AUTO_CATEGORIZATION",
  "AI_SKU_GENERATION",
];

export interface AIServiceSetting {
  id: number;
  feature_key: string;
  feature_name: string;
  module_name: string;
  description: string;
  is_enabled: boolean;
  updated_by: string | null;
  updated_date: string | null;
}

export const moduleConfig: Record<string, { gradient: string; iconBg: string; textColor: string }> = {
  "Procurement": {
    gradient: "from-blue-500 to-cyan-500",
    iconBg: "bg-blue-50 dark:bg-blue-950/40",
    textColor: "text-blue-600 dark:text-blue-400",
  },
  "Items": {
    gradient: "from-purple-500 to-pink-500",
    iconBg: "bg-purple-50 dark:bg-purple-950/40",
    textColor: "text-purple-600 dark:text-purple-400",
  },
  "Vendors": {
    gradient: "from-green-500 to-emerald-500",
    iconBg: "bg-green-50 dark:bg-green-950/40",
    textColor: "text-green-600 dark:text-green-400",
  },
  "Invoices": {
    gradient: "from-orange-500 to-amber-500",
    iconBg: "bg-orange-50 dark:bg-orange-950/40",
    textColor: "text-orange-600 dark:text-orange-400",
  },
  "Purchase Orders": {
    gradient: "from-amber-500 to-yellow-500",
    iconBg: "bg-amber-50 dark:bg-amber-950/40",
    textColor: "text-amber-600 dark:text-amber-400",
  },
  "Bids & Sourcing": {
    gradient: "from-indigo-500 to-violet-500",
    iconBg: "bg-indigo-50 dark:bg-indigo-950/40",
    textColor: "text-indigo-600 dark:text-indigo-400",
  },
  "Spend Analysis": {
    gradient: "from-cyan-500 to-teal-500",
    iconBg: "bg-cyan-50 dark:bg-cyan-950/40",
    textColor: "text-cyan-600 dark:text-cyan-400",
  },
  "Budgets": {
    gradient: "from-emerald-500 to-green-500",
    iconBg: "bg-emerald-50 dark:bg-emerald-950/40",
    textColor: "text-emerald-600 dark:text-emerald-400",
  },
  "Contracts": {
    gradient: "from-violet-500 to-purple-600",
    iconBg: "bg-violet-50 dark:bg-violet-950/40",
    textColor: "text-violet-600 dark:text-violet-400",
  },
  "Netra Intelligence": {
    gradient: "from-fuchsia-500 to-rose-500",
    iconBg: "bg-fuchsia-50 dark:bg-fuchsia-950/40",
    textColor: "text-fuchsia-600 dark:text-fuchsia-400",
  },
};

export const defaultModuleConfig = {
  gradient: "from-gray-500 to-gray-600",
  iconBg: "bg-gray-50 dark:bg-gray-900/40",
  textColor: "text-gray-600 dark:text-gray-400",
};

const moduleFilterIcons: Record<string, any> = {
  "Procurement": ShoppingCart,
  "Items": Package,
  "Vendors": Users,
  "Invoices": FileText,
  "Purchase Orders": ClipboardList,
  "Bids & Sourcing": Gavel,
  "Spend Analysis": BarChart3,
  "Budgets": Wallet,
  "Contracts": BookOpen,
  "Netra Intelligence": Eye,
};

export const featureMeta: Record<string, { icon: any; benefit: string; tier: "Basic" | "Professional" | "Enterprise" }> = {
  AI_ITEM_SUGGESTIONS: {
    icon: Lightbulb,
    benefit: "Reduce PR creation time by 60% with smart item suggestions",
    tier: "Basic",
  },
  AI_VENDOR_RECOMMENDATIONS: {
    icon: Target,
    benefit: "Find the best vendor in seconds, not hours of manual comparison",
    tier: "Basic",
  },
  AI_BUDGET_VALIDATION: {
    icon: Calculator,
    benefit: "Prevent budget overruns before they happen",
    tier: "Basic",
  },
  AI_DUPLICATE_PR_DETECTION: {
    icon: Copy,
    benefit: "Eliminate duplicate spending and save up to 15% on procurement",
    tier: "Basic",
  },
  AI_NLP_LINE_ITEMS: {
    icon: MessageSquareText,
    benefit: "Type naturally, get structured line items instantly",
    tier: "Professional",
  },
  AI_QUANTITY_PREDICTION: {
    icon: TrendingUp,
    benefit: "Order the right quantity every time based on consumption patterns",
    tier: "Professional",
  },
  AI_AUTO_CATEGORIZATION: {
    icon: Package,
    benefit: "Auto-classify thousands of items in minutes using UNSPSC standards",
    tier: "Basic",
  },
  AI_SKU_GENERATION: {
    icon: Hash,
    benefit: "Standardize your product catalog with consistent AI-generated SKUs",
    tier: "Basic",
  },
  AI_VENDOR_COMPLIANCE: {
    icon: ShieldCheck,
    benefit: "Ensure 100% vendor compliance without manual document reviews",
    tier: "Professional",
  },
  AI_VENDOR_DOC_ANALYSIS: {
    icon: FileSearch,
    benefit: "Verify vendor documents in seconds instead of days",
    tier: "Professional",
  },
  AI_VENDOR_AUTOFILL: {
    icon: FileInput,
    benefit: "Cut vendor onboarding time by 80% with smart form auto-fill",
    tier: "Basic",
  },
  AI_VENDOR_INTELLIGENCE: {
    icon: Brain,
    benefit: "Deep risk assessment and performance scoring for every vendor",
    tier: "Enterprise",
  },
  AI_INVOICE_MATCHING: {
    icon: ScanSearch,
    benefit: "Process invoices 10x faster with vision-powered OCR matching",
    tier: "Professional",
  },
  AI_FRAUD_DETECTION: {
    icon: AlertTriangle,
    benefit: "Catch fraudulent invoices before they cost your business",
    tier: "Enterprise",
  },
  AI_PO_ANOMALY_DETECTION: {
    icon: AlertTriangle,
    benefit: "Detect pricing anomalies and duplicate POs automatically",
    tier: "Professional",
  },
  AI_BID_STRATEGY: {
    icon: Lightbulb,
    benefit: "Get AI-recommended bid strategies for optimal sourcing outcomes",
    tier: "Professional",
  },
  AI_SMART_VENDOR_SUGGEST: {
    icon: Target,
    benefit: "Invite the right vendors based on expertise and past performance",
    tier: "Professional",
  },
  AI_GENERATE_REQUIREMENTS: {
    icon: ScrollText,
    benefit: "Auto-generate evaluation criteria in minutes, not hours",
    tier: "Professional",
  },
  AI_GENERATE_CLAUSES: {
    icon: Wand2,
    benefit: "Generate legally sound T&C clauses tailored to each bid",
    tier: "Professional",
  },
  AI_MARKET_INTELLIGENCE: {
    icon: BadgeDollarSign,
    benefit: "Know the market price before you negotiate with vendors",
    tier: "Enterprise",
  },
  AI_FMP_INTELLIGENCE: {
    icon: BadgeDollarSign,
    benefit: "Official fair-price benchmark on every line from PR through PO",
    tier: "Enterprise",
  },
  AI_TECH_EVALUATION: {
    icon: BarChart,
    benefit: "Pre-score technical responses automatically and save weeks",
    tier: "Enterprise",
  },
  AI_COMM_EVALUATION: {
    icon: Scale,
    benefit: "Automated commercial evaluation with price benchmarking",
    tier: "Enterprise",
  },
  AI_NEGOTIATION_SUGGESTIONS: {
    icon: MessageSquareText,
    benefit: "Walk into vendor negotiations with data-backed talking points",
    tier: "Enterprise",
  },
  AI_AWARD_RECOMMENDATION: {
    icon: Trophy,
    benefit: "Optimal award decisions with split/single strategy analysis",
    tier: "Enterprise",
  },
  AI_SPEND_INSIGHTS: {
    icon: PieChart,
    benefit: "Executive-ready spend analytics and savings opportunities in one click",
    tier: "Professional",
  },
  AI_BUDGET_AMOUNT_SUGGESTION: {
    icon: Calculator,
    benefit: "Set accurate budgets based on historical spending intelligence",
    tier: "Basic",
  },
  AI_BUDGET_CREATION: {
    icon: Wand2,
    benefit: "Create complete budgets from a simple text description",
    tier: "Professional",
  },
  AI_CONTRACT_LIBRARY_INIT: {
    icon: Sparkles,
    benefit: "Generate a full clause library for any contract type in seconds",
    tier: "Professional",
  },
  AI_CONTRACT_EXTRACT: {
    icon: FileSearch,
    benefit: "Extract every clause from uploaded contracts automatically",
    tier: "Professional",
  },
  AI_CONTRACT_GENERATE: {
    icon: Wand2,
    benefit: "Draft legally sound clauses from a plain-text description",
    tier: "Professional",
  },
  AI_CONTRACT_IMPROVE: {
    icon: Zap,
    benefit: "Rewrite or improve clauses to match any negotiation style",
    tier: "Professional",
  },
  AI_CONTRACT_RISK: {
    icon: ShieldCheck,
    benefit: "Identify legal and commercial risk in any clause instantly",
    tier: "Enterprise",
  },
  AI_CONTRACT_VARIABLES: {
    icon: Hash,
    benefit: "Automatically tag dynamic values as reusable variable placeholders",
    tier: "Professional",
  },
  AI_CONTRACT_DUPLICATES: {
    icon: Copy,
    benefit: "Detect and eliminate duplicate clauses to keep the library clean",
    tier: "Basic",
  },
  AI_CONTRACT_ADVISOR: {
    icon: Bot,
    benefit: "Chat with an AI legal advisor for clause recommendations 24/7",
    tier: "Enterprise",
  },
  AI_CONTRACT_RISK_ANALYSIS: {
    icon: ShieldCheck,
    benefit: "Weighted risk scoring across financial, compliance, and delivery for every contract",
    tier: "Professional",
  },
  AI_CONTRACT_SUMMARY: {
    icon: FileText,
    benefit: "Give vendors a plain-English summary with red flags before they sign",
    tier: "Basic",
  },
  AI_SUPPLIER_RANK: {
    icon: Award,
    benefit: "Rank suppliers based on their performance scores",
    tier: "Professional",
  },
};

export const tierConfig: Record<string, { label: string; icon: any; className: string }> = {
  "Basic": {
    label: "Basic",
    icon: CheckCircle2,
    className: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800",
  },
  "Professional": {
    label: "Professional",
    icon: Gem,
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  },
  "Enterprise": {
    label: "Enterprise",
    icon: Crown,
    className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800",
  },
};

const animationStyles = `
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-8px); }
}
@keyframes pulseGlow {
  0%, 100% { opacity: 0.15; transform: scale(1); }
  50% { opacity: 0.25; transform: scale(1.05); }
}
@keyframes gradientShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.ai-card-animate {
  opacity: 0;
  animation: fadeInUp 0.5s ease-out forwards;
}
.ai-hero-gradient {
  background-size: 200% 200%;
  animation: gradientShift 8s ease infinite;
}
.ai-shimmer-text {
  background: linear-gradient(90deg, currentColor 40%, rgba(139,92,246,0.6) 50%, currentColor 60%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  animation: shimmer 3s linear infinite;
}
.ai-float {
  animation: float 4s ease-in-out infinite;
}
.ai-glow-orb {
  animation: pulseGlow 4s ease-in-out infinite;
}
.ai-slide-in {
  opacity: 0;
  animation: slideInRight 0.6s ease-out forwards;
}
.ai-card-hover {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.ai-card-hover:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px -8px rgba(0,0,0,0.12), 0 4px 8px -4px rgba(0,0,0,0.06);
}
`;

export default function AIServiceSettings() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: allSettings = [], isLoading } = useQuery<AIServiceSetting[]>({
    queryKey: ["/api/ai-service-settings"],
  });
  const settings = allSettings.filter(s => !BASIC_SETTINGS_SERVICE_KEYS.includes(s.feature_key));

  const toggleMutation = useMutation({
    mutationFn: async ({ featureKey, isEnabled }: { featureKey: string; isEnabled: boolean }) => {
      await apiRequest("PUT", `/api/ai-service-settings/${featureKey}`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-service-settings"] });
    },
    onError: () => {
      toast({ title: "Failed to update setting", variant: "destructive" });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (isEnabled: boolean) => {
      await apiRequest("PUT", "/api/ai-service-settings/bulk", { isEnabled });
    },
    onSuccess: (_, isEnabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-service-settings"] });
      toast({ title: `All AI features ${isEnabled ? "enabled" : "disabled"}` });
    },
    onError: () => {
      toast({ title: "Failed to update settings", variant: "destructive" });
    },
  });

  const modules = Array.from(new Set(settings.map(s => s.module_name))).sort();

  const filteredSettings = settings.filter(s => {
    const matchesSearch = search === "" ||
      s.feature_name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()) ||
      s.module_name.toLowerCase().includes(search.toLowerCase());
    const matchesModule = moduleFilter === "all" || s.module_name === moduleFilter;
    return matchesSearch && matchesModule;
  });

  const enabledCount = settings.filter(s => s.is_enabled).length;
  const totalCount = settings.length;
  const allEnabled = totalCount > 0 && enabledCount === totalCount;
  const allDisabled = totalCount > 0 && enabledCount === 0;

  const vendorIntelSetting = allSettings.find(s => s.feature_key === "AI_VENDOR_INTELLIGENCE");
  const vendorIntelEnabled = vendorIntelSetting ? vendorIntelSetting.is_enabled : true;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-16 h-16">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500 to-purple-500 animate-ping opacity-20" />
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-r from-violet-500 to-purple-500 flex items-center justify-center">
              <BrainCircuit className="h-8 w-8 text-white animate-pulse" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Loading AI capabilities...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto" data-testid="page-ai-service-settings">
      <style>{animationStyles}</style>
      <div className="ai-hero-gradient relative overflow-hidden bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-700 dark:from-violet-900 dark:via-purple-900 dark:to-indigo-950">
        <div className="absolute inset-0 overflow-hidden">
          <div className="ai-glow-orb absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/5 blur-3xl" />
          <div className="ai-glow-orb absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-violet-400/10 blur-3xl" style={{ animationDelay: "2s" }} />
          <div className="ai-glow-orb absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-purple-300/5 blur-3xl" style={{ animationDelay: "1s" }} />
        </div>

        <div className="relative px-6 lg:px-10 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/app/dashboard">
                <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10" data-testid="button-back-dashboard">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              </Link>
              <div className="h-6 w-px bg-white/20" />
              <div className="flex items-center gap-2.5">
                <div className="ai-float h-9 w-9 rounded-lg bg-white/15 flex items-center justify-center border border-white/20">
                  <BrainCircuit className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white" data-testid="text-page-title">
                    AI-Powered Intelligence
                  </h1>
                  <p className="text-violet-200 text-xs">
                    {totalCount} AI features across {modules.length} modules
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3 text-white/80">
                <div className="text-center">
                  <p className="text-xl font-bold text-white" data-testid="text-total-features">{totalCount}</p>
                  <p className="text-[10px] text-violet-200 uppercase tracking-wider">Features</p>
                </div>
                <div className="h-8 w-px bg-white/20" />
                <div className="text-center">
                  <p className="text-xl font-bold text-green-300" data-testid="text-enabled-count">{enabledCount}</p>
                  <p className="text-[10px] text-violet-200 uppercase tracking-wider">Active</p>
                </div>
                <div className="h-8 w-px bg-white/20" />
                <div className="text-center">
                  <p className="text-xl font-bold text-white" data-testid="text-module-count">{modules.length}</p>
                  <p className="text-[10px] text-violet-200 uppercase tracking-wider">Modules</p>
                </div>
              </div>
              <div className="hidden sm:block h-8 w-px bg-white/20" />
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkMutation.mutate(false)}
                  disabled={allDisabled || bulkMutation.isPending}
                  className="border-white/20 text-white hover:bg-white/10 bg-white/5"
                  data-testid="button-disable-all"
                >
                  <PowerOff className="h-3.5 w-3.5 mr-1" />
                  Disable All
                </Button>
                <Button
                  size="sm"
                  onClick={() => bulkMutation.mutate(true)}
                  disabled={allEnabled || bulkMutation.isPending}
                  className="bg-white text-violet-700 hover:bg-white/90"
                  data-testid="button-enable-all"
                >
                  <Power className="h-3.5 w-3.5 mr-1" />
                  Enable All
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-10 pt-6 pb-5">
        {/* <div className={`mb-6 ${mounted ? "ai-slide-in" : ""}`} data-testid="section-marketing-text">
          <h2 className="text-base font-bold text-foreground mb-1.5 ai-shimmer-text">
            
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Prokraya embeds intelligence directly into every step of your Source-to-Pay workflow — from smart requisitions
            that write themselves, to vendor risk scoring that runs in the background, to fraud detection that catches
            what humans miss. These aren't bolt-on tools. They're native AI capabilities built into the platform,
            trained on procurement data, and designed to save your team thousands of hours every year.
            Each feature below is ready to activate — no setup, no integrations, no waiting.
          </p>
        </div> */}

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search AI features..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
              data-testid="input-search-ai-features"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant={moduleFilter === "all" ? "default" : "outline"}
              className="cursor-pointer text-xs px-2.5 py-0.5"
              onClick={() => setModuleFilter("all")}
              data-testid="filter-all-modules"
            >
              All
            </Badge>
            {modules.map(mod => {
              const FilterIcon = moduleFilterIcons[mod] || BrainCircuit;
              return (
                <Badge
                  key={mod}
                  variant={moduleFilter === mod ? "default" : "outline"}
                  className="cursor-pointer text-xs px-2.5 py-0.5"
                  onClick={() => setModuleFilter(mod)}
                  data-testid={`filter-module-${mod.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <FilterIcon className="h-3 w-3 mr-1" />
                  {mod}
                </Badge>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSettings.map((feature, index) => {
            const requiresVendorIntelligence =
              feature.feature_key === "AI_VENDOR_DOC_ANALYSIS" ||
              feature.feature_key === "AI_VENDOR_COMPLIANCE";
            const modConfig = moduleConfig[feature.module_name] || defaultModuleConfig;
            const meta = featureMeta[feature.feature_key];
            const FeatureIcon = meta?.icon || BrainCircuit;
            const benefit = meta?.benefit || feature.description;
            const tier = meta?.tier || "Basic";
            const tierInfo = tierConfig[tier];
            const TierIcon = tierInfo.icon;

            return (
              <Card
                key={feature.feature_key}
                className={`ai-card-hover border overflow-hidden ${feature.is_enabled ? "shadow-sm" : "opacity-70"
                  } ${mounted ? "ai-card-animate" : ""}`}
                style={{ animationDelay: mounted ? `${index * 60}ms` : "0ms" }}
                data-testid={`card-feature-${feature.feature_key}`}
              >
                <div className={`h-1 bg-gradient-to-r ${modConfig.gradient} ${!feature.is_enabled ? "opacity-30" : ""}`} />
                <CardContent className="p-4 flex flex-col h-full">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className={`h-10 w-10 rounded-lg ${modConfig.iconBg} flex items-center justify-center shrink-0`}>
                      <FeatureIcon className={`h-5 w-5 ${modConfig.textColor}`} />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {feature.is_enabled ? (
                        <Badge variant="outline" className="text-[10px] h-5 bg-green-50 text-green-600 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800 shrink-0">
                          <CheckCircle2 className="h-3 w-3 mr-0.5" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground shrink-0">
                          Inactive
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-[10px] h-5 shrink-0 ${tierInfo.className}`}>
                        <TierIcon className="h-3 w-3 mr-0.5" />
                        {tierInfo.label}
                      </Badge>
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold leading-tight mb-1" data-testid={`text-feature-name-${feature.feature_key}`}>
                    {feature.feature_name}
                  </h3>
                  <Badge variant="secondary" className="text-[10px] h-4 mb-2 w-fit">
                    {feature.module_name}
                  </Badge>

                  <p className="text-xs font-medium text-foreground/80 leading-relaxed mb-1.5 line-clamp-2 min-h-[2rem]">
                    {benefit}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 flex-1">
                    {feature.description}
                  </p>
                  {requiresVendorIntelligence && !vendorIntelEnabled && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5">
                      Requires AI Vendor Intelligence to be enabled.
                    </p>
                  )}

                  <div className="mt-3 pt-3 border-t flex items-center justify-between">
                    <Button
                      variant={feature.is_enabled ? "outline" : "default"}
                      size="sm"
                      className="h-7 text-xs px-3"
                      disabled={true}
                      data-testid={`button-subscribe-${feature.feature_key}`}
                    >
                      {feature.is_enabled ? (
                        <>
                          <PowerOff className="h-3 w-3 mr-1" />
                          Unsubscribe
                        </>
                      ) : (
                        <>
                          <Zap className="h-3 w-3 mr-1" />
                          Subscribe
                        </>
                      )}
                    </Button>
                    <Switch
                      checked={feature.is_enabled}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ featureKey: feature.feature_key, isEnabled: checked })
                      }
                      disabled={
                        toggleMutation.isPending ||
                        (requiresVendorIntelligence && !vendorIntelEnabled)
                      }
                      data-testid={`switch-feature-${feature.feature_key}`}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredSettings.length === 0 && (
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Search className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <h3 className="text-base font-medium">No AI features found</h3>
            <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or module filter</p>
          </div>
        )}

        <div className={`mt-8 rounded-xl border bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 p-5 ${mounted ? "ai-card-animate" : ""}`} style={{ animationDelay: "1.8s" }} data-testid="section-ai-agents">
          <div className="flex items-start gap-4">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold">AI Agents — Beyond Features</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Beyond {totalCount} embedded AI features, Prokraya includes autonomous AI agents that execute
                end-to-end procurement workflows through natural conversation. EVA orchestrates 65+ tools across all modules.
              </p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                <Link href="/app/eva-agent">
                  <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white" data-testid="button-eva-agent">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Launch EVA
                  </Button>
                </Link>
                <Link href="/app/ai-agents">
                  <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="button-specialist-agents">
                    <Eye className="h-3 w-3 mr-1" />
                    Specialist Agents
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
