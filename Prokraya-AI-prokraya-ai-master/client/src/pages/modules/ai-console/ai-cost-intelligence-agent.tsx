import { useState, useRef, useEffect } from "react";
import { useAgentConversation, type ConversationMessage } from "@/hooks/useAgentConversation";
import { Link } from "wouter";
import {
  Send,
  Loader2,
  Brain,
  Sparkles,
  Bot,
  User,
  Search,
  ArrowLeft,
  CheckCircle2,
  Plus,
  Zap,
  ChevronDown,
  ChevronRight,
  BookOpen,
  PanelRightClose,
  PanelLeftOpen,
  PanelLeftClose,
  Trash2,
  MessageSquare,
  TrendingDown,
  Info,
  DollarSign,
  AlertTriangle,
  Play,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Percent,
  Check,
  TrendingUp,
  Target,
  MapPin,
  LocateFixed,
  RotateCcw,
  X
} from "lucide-react";
import { costIntelligenceAgentPrompts } from "./cost-intelligence-agent-prompts";
import {
  CostWaterfallChart,
  SpendTrendChart,
} from "@/components/agent-panels/market-grounding-panels";
import { CostBomPanel } from "@/components/agent-panels/cost-bom-panel";
import { MarginGauge } from "@/components/agent-panels/margin-gauge";
import { INTEL_COLOR, INTEL_FONT } from "@/components/agent-panels/intel-theme";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CapabilitiesInfoButton } from "@/components/agent-panels/capabilities-info-button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ChatComposer } from "@/components/ui/ChatComposer";
import { ThinkingTips } from "@/components/ui/ThinkingTips";
import { streamAgentQuery } from "@/lib/streamAgentQuery";
import { useSupplierMentions } from "@/hooks/useSupplierMentions";
import { AGENT_MENTION_PLACEHOLDER_HINT } from "@/hooks/useAgentMentions";
import { SourcingUserMessageBubbleContent } from "@/lib/supplier-mention-utils";
import type {
  BidMention,
  BusinessUserMention,
  InvoiceMention,
  ItemMention,
  PoMention,
  PrMention,
  SupplierMention,
} from "@shared/agent-mention";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

const capabilities = [
  { icon: Search, label: "Margin Estimation", description: "Differentiate manufacturer vs. trader structures to analyze margins" },
  { icon: TrendingDown, label: "Commodity & Freight", description: "Evaluate cost curves against commodity indices and shipping metrics" },
  { icon: BookOpen, label: "Supplier SOS Cost Estimates", description: "Get cost estimates for all or specific Scope of Supply items of a supplier" },
  { icon: Zap, label: "Automated Triggers", description: "Intercept and flag bids that exceed benchmark limits" }
];

interface PendingAction {
  type: "cost_intelligence_insights" | "select_quote" | "input_parameters" | "fmc_card";
  data: any;
  summary: string;
}



// Color scheme for the quote-source tag (matches the bid module: RFQ blue / RFP
// purple / Tender green), plus PO amber. Falls back to RFQ styling.
function quoteTypeClass(type: string) {
  const t = String(type || "").toUpperCase();
  if (t === "TENDER") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800";
  if (t === "RFP") return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800";
  if (t === "PO") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800";
  return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800";
}

// ─── Dropdown selector card for quotes ───
function DropdownQuoteSelectorCard({
  data,
  disabled,
  onSelect
}: {
  data: any;
  disabled: boolean;
  onSelect: (selected: any) => void;
}) {
  const [candidates] = useState<any[]>(() => Array.isArray(data?.initialCandidates) ? data.initialCandidates : []);

  return (
    <Card className="border-cyan-200 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-900/10">
      <CardContent className="p-3">
        <div className="flex items-start gap-2 mb-2">
          <Search className="h-4 w-4 text-cyan-600 dark:text-cyan-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-cyan-900 dark:text-cyan-100">Select Quotation</p>
            <p className="text-xs text-cyan-700 dark:text-cyan-300 mt-0.5">
              Select a quote from the database to estimate the supplier cost structure and economics.
            </p>
          </div>
        </div>
        <div className="ml-6 space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
          {candidates.map((item: any, idx) => (
            <button
              key={idx}
              disabled={disabled}
              onClick={() => onSelect(item)}
              className="w-full text-left px-3 py-2 text-xs rounded border bg-background hover:bg-muted transition-colors flex justify-between items-center"
              data-testid={`selector-quote-${idx}`}
            >
              <div>
                <span className="font-semibold block text-foreground">
                  Quote ID: {item.id} (Ref: {item.bidrefno})
                </span>
                <span className="text-muted-foreground truncate max-w-[250px] block">
                  Supplier: {item.company_name} · {item.country}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {item.quote_type && (
                  <Badge variant="outline" className={`text-[9px] uppercase ${quoteTypeClass(item.quote_type)}`}>
                    {item.quote_type}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800">
                  ${parseFloat(item.bidtotal || "0").toLocaleString()}
                </Badge>
              </div>
            </button>
          ))}
          {candidates.length === 0 && (
            <div className="text-xs text-muted-foreground py-2">No quotes found.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Dropdown selector card for SOS items ───
function DropdownSOSItemSelectorCard({
  data,
  disabled,
  onSelect
}: {
  data: any;
  disabled: boolean;
  onSelect: (selected: { type: "all" | "particular"; item?: any }) => void;
}) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const supplierName = data?.supplierName || "Supplier";

  return (
    <Card className="border-cyan-200 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-900/10">
      <CardContent className="p-3">
        <div className="flex items-start gap-2 mb-2">
          <BookOpen className="h-4 w-4 text-cyan-600 dark:text-cyan-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-cyan-900 dark:text-cyan-100">Select Scope of Supply Items</p>
            <p className="text-xs text-cyan-700 dark:text-cyan-300 mt-0.5">
              Select items from {supplierName}'s Scope of Supply to analyze.
            </p>
          </div>
        </div>
        <div className="ml-6 space-y-2">
          {/* Analyze All Items option */}
          <button
            disabled={disabled}
            onClick={() => onSelect({ type: "all" })}
            className="w-full text-left px-3 py-2 text-xs rounded border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 dark:border-cyan-700 dark:bg-cyan-950/20 dark:hover:bg-cyan-950/40 transition-colors flex justify-between items-center font-bold text-cyan-800 dark:text-cyan-300"
            data-testid="selector-sos-all"
          >
            <span>Analyze All Scope of Supply Items</span>
            <Sparkles className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
          </button>

          {/* Individual items options */}
          <div className="max-h-[200px] overflow-y-auto pr-1 space-y-1.5">
            {items.map((item: any, idx: number) => (
              <button
                key={idx}
                disabled={disabled}
                onClick={() => onSelect({ type: "particular", item })}
                className="w-full text-left px-3 py-2 text-xs rounded border bg-background hover:bg-muted transition-colors flex justify-between items-center"
                data-testid={`selector-sos-item-${idx}`}
              >
                <div>
                  <span className="font-semibold block text-foreground">
                    {item.subCategory || item.serviceDetails || "Scope Item"}
                  </span>
                  <span className="text-muted-foreground truncate max-w-[250px] block">
                    Code: {item.subCategoryCode || item.goodServiceCode || "N/A"} · Type: {item.categoryType || "Goods"}
                  </span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
            {items.length === 0 && (
              <div className="text-xs text-muted-foreground py-2">No Scope of Supply items found.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const COUNTRY_STATES: Record<string, string[]> = {
  "India": [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
  ],
  "United States": [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
  ],
  "Canada": [
    "Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Nova Scotia", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan"
  ],
  "Australia": [
    "New South Wales", "Queensland", "South Australia", "Tasmania", "Victoria", "Western Australia"
  ],
  "Germany": [
    "Baden-Württemberg", "Bavaria", "Berlin", "Brandenburg", "Bremen", "Hamburg", "Hesse", "Lower Saxony", "Mecklenburg-Vorpommern", "North Rhine-Westphalia", "Rhineland-Palatinate", "Saarland", "Saxony", "Saxony-Anhalt", "Schleswig-Holstein", "Thuringia"
  ],
  "United Kingdom": [
    "England", "Scotland", "Wales", "Northern Ireland"
  ],
  "China": [
    "Anhui", "Beijing", "Chongqing", "Fujian", "Gansu", "Guangdong", "Guangxi", "Guizhou", "Hainan", "Hebei", "Heilongjiang", "Henan", "Hubei", "Hunan", "Inner Mongolia", "Jiangsu", "Jiangxi", "Jilin", "Liaoning", "Ningxia", "Qinghai", "Shaanxi", "Shandong", "Shanghai", "Shanxi", "Sichuan", "Tianjin", "Tibet", "Xinjiang", "Yunnan", "Zhejiang"
  ],
  "Vietnam": [
    "Hanoi", "Ho Chi Minh City", "Da Nang", "Hai Phong", "Can Tho", "Binh Duong", "Dong Nai", "Bac Ninh", "Hai Duong", "Long An", "Quang Ninh"
  ],
  "United Arab Emirates": [
    "Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"
  ],
  "Qatar": [
    "Doha", "Al Rayyan", "Al Wakrah", "Al Daayen", "Umm Salal", "Al Khor and Al Thakhira", "Al Shamal", "Al Shahaniya"
  ],
  "Mexico": [
    "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas", "Chihuahua", "Coahuila", "Colima", "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "Mexico City", "Michoacán", "Morelos", "Nayarit", "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí", "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas"
  ],
  "Singapore": [
    "Central Region", "East Region", "North Region", "North-East Region", "West Region"
  ],
  "Japan": [
    "Aichi", "Akita", "Aomori", "Chiba", "Ehime", "Fukui", "Fukuoka", "Fukushima", "Gifu", "Gunma", "Hiroshima", "Hokkaido", "Hyogo", "Ibaraki", "Ishikawa", "Iwate", "Kagawa", "Kagoshima", "Kanagawa", "Kochi", "Kumamoto", "Kyoto", "Mie", "Miyagi", "Miyazaki", "Nagano", "Nagasaki", "Nara", "Niigata", "Oita", "Okayama", "Okinawa", "Osaka", "Saga", "Saitama", "Shiga", "Shimane", "Shizuoka", "Tochigi", "Tokushima", "Tokyo", "Tottori", "Toyama", "Wakayama", "Yamagata", "Yamaguchi", "Yamanashi"
  ]
};

const getStatesForCountry = (countryName: string): string[] => {
  if (!countryName) return [];
  if (COUNTRY_STATES[countryName]) {
    return COUNTRY_STATES[countryName];
  }
  return [
    "Capital Region",
    "Central Province",
    "Eastern State",
    "Northern Region",
    "Southern District",
    "Western Province"
  ];
};

export const FREQ_PER_YEAR: Record<string, number> = {
  "Weekly": 52,
  "Twice Weekly": 104,
  "Biweekly": 26,
  "Monthly": 12,
  "Bimonthly (Every 2 Months)": 6,
  "Quarterly": 4,
  "Half-Yearly": 2,
  "Annually": 1,
  "Yearly": 1
};

// ─── Interactive Form Card for Input Parameters ───
function GetEstimatesFormCard({
  disabled,
  onSubmit
}: {
  disabled: boolean;
  onSubmit: (formData: any) => void;
}) {
  const [itemService, setItemService] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [unitPrice, setUnitPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [orderFrequency, setOrderFrequency] = useState("Monthly");
  const [supplierCountry, setSupplierCountry] = useState("");
  const [supplierState, setSupplierState] = useState("");
  const [supplierType, setSupplierType] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryCountry, setDeliveryCountry] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [subCategories, setSubCategories] = useState<any[]>([]);
  const [countriesList, setCountriesList] = useState<Array<{ id: number; key_2: string; description: string }>>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/product-categories?type=full&limit=1000")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch product categories");
        return res.json();
      })
      .then((data) => {
        const rows = Array.isArray(data) ? data : (data?.data || []);
        // Filter sub-categories (parent_category_id !== 0 and not null)
        const subs = rows.filter((c: any) => c.parent_category_id && c.parent_category_id !== 0 && c.parent_category_id !== "0");
        setSubCategories(subs);
      })
      .catch((err) => {
        console.error("Error loading categories:", err);
      });

    fetch("/api/countries")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch countries");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setCountriesList(data);
        }
      })
      .catch((err) => {
        console.error("Error loading countries:", err);
      });
  }, []);

  // Annualized volume/spend preview derived from quantity, frequency, and unit price.
  const symbol = CURRENCY_SYMBOLS[currency] || "$";
  const qtyNum = parseInt(quantity, 10) || 0;
  const priceNum = parseFloat(unitPrice) || 0;
  const annualVolume = qtyNum * (FREQ_PER_YEAR[orderFrequency] || 12);
  const totalSpend = annualVolume * priceNum;

  // Fill delivery city/country from the browser's geolocation via a keyless reverse geocode.
  const handleUseCurrentLocation = () => {
    if (!("geolocation" in navigator)) {
      toast({ title: "Location unavailable", description: "Your browser does not support geolocation.", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude, accuracy } = pos.coords;
          setCoords({ lat: latitude, lng: longitude, accuracy });
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
          const geo = await res.json();
          setDeliveryCity(geo.city || geo.locality || geo.principalSubdivision || "");
          setDeliveryCountry(geo.countryName || "");
        } catch (err) {
          toast({ title: "Couldn't detect location", description: "Please enter your delivery city and country manually.", variant: "destructive" });
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        toast({ title: "Location permission denied", description: "Please enter your delivery city and country manually.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemService.trim()) return;
    if (!unitPrice || parseFloat(unitPrice) <= 0) return;
    if (!quantity || parseInt(quantity, 10) <= 0) return;
    if (!supplierCountry) return;
    if (!supplierType) return;
    onSubmit({
      itemService,
      currency,
      unitPrice: unitPrice ? parseFloat(unitPrice) : 0,
      quantity: quantity ? parseInt(quantity, 10) : 0,
      orderFrequency,
      supplierCountry,
      supplierState: supplierState === "None" ? "" : supplierState,
      supplierType,
      deliveryCity: deliveryCity.trim(),
      deliveryCountry: deliveryCountry.trim(),
      deliveryLat: coords?.lat ?? null,
      deliveryLng: coords?.lng ?? null,
      annualVolume,
      totalSpend
    });
  };

  const resetForm = () => {
    setItemService("");
    setCurrency("USD");
    setUnitPrice("");
    setQuantity("");
    setOrderFrequency("Monthly");
    setSupplierCountry("");
    setSupplierState("");
    setSupplierType("");
    setDeliveryCity("");
    setDeliveryCountry("");
    setCoords(null);
  };

  const [itemPopoverOpen, setItemPopoverOpen] = useState(false);

  const filteredSubCategories = subCategories.filter((cat) => {
    const name = String(cat.category_name || cat.categoryName || cat.name || "").toLowerCase();
    return name.includes(itemService.toLowerCase());
  });

  return (
    <div className="space-y-4 w-full animate-in fade-in slide-in-from-bottom-2 duration-200">
      <Card className="border border-border/80 bg-background/50 dark:bg-background/20 shadow-sm">
        <CardContent className="p-4 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground font-semibold">
              GET ESTIMATES – INPUT PARAMETERS
            </p>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* ITEM / SERVICE */}
              <div className="col-span-12 md:col-span-4 space-y-1">
                <Label htmlFor="itemService" className="text-[9px] font-mono tracking-widest uppercase text-muted-foreground font-bold">
                  ITEM / SERVICE <span className="text-red-500 font-sans">*</span>
                </Label>
                <Popover open={itemPopoverOpen && filteredSubCategories.length > 0} onOpenChange={setItemPopoverOpen}>
                  <PopoverTrigger asChild>
                    <div className="relative">
                      <Input
                        id="itemService"
                        placeholder="e.g. Steel Fasteners M8"
                        value={itemService}
                        onChange={(e) => {
                          setItemService(e.target.value);
                          setItemPopoverOpen(true);
                        }}
                        onFocus={() => setItemPopoverOpen(true)}
                        disabled={disabled}
                        required
                        autoComplete="off"
                        className="bg-muted/10 h-8 text-xs placeholder:text-muted-foreground/50 border border-input focus-visible:ring-1 focus-visible:ring-cyan-500 pr-7"
                      />
                      <ChevronDown className="h-3.5 w-3.5 opacity-50 absolute right-2.5 top-2.5 pointer-events-none" />
                    </div>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-1 bg-popover text-popover-foreground shadow-md border border-border rounded-md max-h-[200px] overflow-y-auto"
                    align="start"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    <div className="space-y-0.5">
                      {filteredSubCategories.slice(0, 50).map((cat, idx) => {
                        const catName = cat.category_name || cat.categoryName || cat.name;
                        return (
                          <button
                            key={cat.category_id || cat.categoryId || cat.id || idx}
                            type="button"
                            className="w-full text-left px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between transition-colors"
                            onClick={() => {
                              setItemService(catName);
                              setItemPopoverOpen(false);
                            }}
                          >
                            <span className="truncate">{catName}</span>
                            {itemService.toLowerCase() === catName.toLowerCase() && (
                              <Check className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* CURRENCY */}
              <div className="col-span-12 md:col-span-2 space-y-1">
                <Label className="text-[9px] font-mono tracking-widest uppercase text-muted-foreground font-bold">
                  CURRENCY <span className="text-red-500 font-sans">*</span>
                </Label>
                <Select
                  value={currency}
                  onValueChange={setCurrency}
                  disabled={disabled}
                >
                  <SelectTrigger className="bg-muted/10 h-8 text-xs border border-input focus:ring-1 focus:ring-cyan-500">
                    <SelectValue placeholder="USD" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD" className="text-xs">USD ($)</SelectItem>
                    <SelectItem value="AED" className="text-xs">AED (AED)</SelectItem>
                    <SelectItem value="INR" className="text-xs">INR (₹)</SelectItem>
                    <SelectItem value="EUR" className="text-xs">EUR (€)</SelectItem>
                    <SelectItem value="GBP" className="text-xs">GBP (£)</SelectItem>
                    <SelectItem value="CAD" className="text-xs">CAD (C$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* UNIT PRICE */}
              <div className="col-span-6 md:col-span-2 space-y-1">
                <Label htmlFor="unitPrice" className="text-[9px] font-mono tracking-widest uppercase text-muted-foreground font-bold">
                  UNIT PRICE <span className="text-red-500 font-sans">*</span>
                </Label>
                <Input
                  id="unitPrice"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  disabled={disabled}
                  required
                  min="0.01"
                  className="bg-muted/10 h-8 text-xs placeholder:text-muted-foreground/50 border border-input focus-visible:ring-1 focus-visible:ring-cyan-500"
                />
              </div>

              {/* QUANTITY */}
              <div className="col-span-6 md:col-span-2 space-y-1">
                <Label htmlFor="quantity" className="text-[9px] font-mono tracking-widest uppercase text-muted-foreground font-bold">
                  QUANTITY <span className="text-red-500 font-sans">*</span>
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  placeholder="e.g. 500"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={disabled}
                  required
                  min="1"
                  className="bg-muted/10 h-8 text-xs placeholder:text-muted-foreground/50 border border-input focus-visible:ring-1 focus-visible:ring-cyan-500"
                />
              </div>

              {/* ORDER FREQUENCY */}
              <div className="col-span-12 md:col-span-2 space-y-1">
                <Label className="text-[9px] font-mono tracking-widest uppercase text-muted-foreground font-bold">
                  ORDER FREQUENCY <span className="text-red-500 font-sans">*</span>
                </Label>
                <Select
                  value={orderFrequency}
                  onValueChange={setOrderFrequency}
                  disabled={disabled}
                >
                  <SelectTrigger className="bg-muted/10 h-8 text-xs border border-input focus:ring-1 focus:ring-cyan-500">
                    <SelectValue placeholder="Select Frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Weekly" className="text-xs">Weekly</SelectItem>
                    <SelectItem value="Twice Weekly" className="text-xs">Twice Weekly</SelectItem>
                    <SelectItem value="Biweekly" className="text-xs">Biweekly</SelectItem>
                    <SelectItem value="Monthly" className="text-xs">Monthly</SelectItem>
                    <SelectItem value="Bimonthly (Every 2 Months)" className="text-xs">Bimonthly (Every 2 Months)</SelectItem>
                    <SelectItem value="Quarterly" className="text-xs">Quarterly</SelectItem>
                    <SelectItem value="Half-Yearly" className="text-xs">Half-Yearly</SelectItem>
                    <SelectItem value="Annually" className="text-xs">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* SUPPLIER COUNTRY */}
              <div className="col-span-12 md:col-span-4 space-y-1">
                <Label className="text-[9px] font-mono tracking-widest uppercase text-muted-foreground font-bold">
                  SUPPLIER COUNTRY <span className="text-red-500 font-sans">*</span>
                </Label>
                <Select
                  value={supplierCountry}
                  onValueChange={(val) => {
                    setSupplierCountry(val);
                    setSupplierState(""); // Reset state when country changes
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger className="bg-muted/10 h-8 text-xs border border-input focus:ring-1 focus:ring-cyan-500">
                    <SelectValue placeholder="Select Country" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px] overflow-y-auto">
                    {countriesList.map((c) => (
                      <SelectItem key={c.id} value={c.description} className="text-xs">
                        {c.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* SUPPLIER STATE */}
              <div className="col-span-12 md:col-span-4 space-y-1">
                <Label className="text-[9px] font-mono tracking-widest uppercase text-muted-foreground font-bold">
                  SUPPLIER STATE
                </Label>
                <Select
                  value={supplierState}
                  onValueChange={setSupplierState}
                  disabled={disabled || !supplierCountry}
                >
                  <SelectTrigger className="bg-muted/10 h-8 text-xs border border-input focus:ring-1 focus:ring-cyan-500">
                    <SelectValue placeholder={supplierCountry ? "Select State" : "Select Country First"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px] overflow-y-auto">
                    {/* <SelectItem value="None" className="text-xs">None / Not Applicable</SelectItem> */}
                    {getStatesForCountry(supplierCountry).map((st) => (
                      <SelectItem key={st} value={st} className="text-xs">
                        {st}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* SUPPLIER TYPE */}
              <div className="col-span-12 md:col-span-4 space-y-1">
                <Label className="text-[9px] font-mono tracking-widest uppercase text-muted-foreground font-bold">
                  SUPPLIER TYPE <span className="text-red-500 font-sans">*</span>
                </Label>
                <Select
                  value={supplierType}
                  onValueChange={setSupplierType}
                  disabled={disabled}
                >
                  <SelectTrigger className="bg-muted/10 h-8 text-xs border border-input focus:ring-1 focus:ring-cyan-500">
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Primary producer/Manufacturer" className="text-xs">Primary producer/Manufacturer</SelectItem>
                    <SelectItem value="Distributor / Dealer" className="text-xs">Distributor / Dealer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* DELIVERY LOCATION */}
            <div className="space-y-3 pt-3 border-t border-border/60">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[10px] font-mono tracking-widest uppercase text-muted-foreground font-semibold">
                  <MapPin className="h-3 w-3" />
                  Delivery Location
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleUseCurrentLocation}
                  disabled={disabled || locating}
                  className="h-7 px-2.5 text-[9px] font-mono tracking-widest uppercase font-bold gap-1.5"
                >
                  {locating ? <Loader2 className="h-3 w-3 animate-spin" /> : <LocateFixed className="h-3 w-3" />}
                  {locating ? "Locating…" : "Use Current Location"}
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="deliveryCity" className="text-[9px] font-mono tracking-widest uppercase text-muted-foreground font-bold">
                    CITY
                  </Label>
                  <Input
                    id="deliveryCity"
                    placeholder="e.g. Hyderabad"
                    value={deliveryCity}
                    onChange={(e) => setDeliveryCity(e.target.value)}
                    disabled={disabled}
                    className="bg-muted/10 h-8 text-xs placeholder:text-muted-foreground/50 border border-input focus-visible:ring-1 focus-visible:ring-cyan-500"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="deliveryCountry" className="text-[9px] font-mono tracking-widest uppercase text-muted-foreground font-bold">
                    COUNTRY
                  </Label>
                  <Input
                    id="deliveryCountry"
                    placeholder="e.g. India"
                    value={deliveryCountry}
                    onChange={(e) => setDeliveryCountry(e.target.value)}
                    disabled={disabled}
                    className="bg-muted/10 h-8 text-xs placeholder:text-muted-foreground/50 border border-input focus-visible:ring-1 focus-visible:ring-cyan-500"
                  />
                </div>
              </div>
              {coords && (
                <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-mono text-muted-foreground/80">
                  <span className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400 font-semibold">
                    <LocateFixed className="h-3 w-3" />
                    LAT {coords.lat.toFixed(6)}°
                  </span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-semibold">LNG {coords.lng.toFixed(6)}°</span>
                  {coords.accuracy ? <span className="text-muted-foreground/50">· ±{Math.round(coords.accuracy)}m accuracy</span> : null}
                  {deliveryCity ? <span className="text-muted-foreground/50">· {[deliveryCity, deliveryCountry].filter(Boolean).join(", ")}</span> : null}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
              <p className="text-[11px] font-mono text-muted-foreground">
                {annualVolume > 0 && priceNum > 0 ? (
                  <>
                    Annual volume: <span className="font-semibold text-foreground">{annualVolume.toLocaleString()} units</span>
                    {" · "}
                    Total spend: <span className="font-semibold text-foreground">{symbol}{totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground/60">Enter quantity &amp; unit price to preview annual spend</span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetForm}
                  disabled={disabled}
                  className="h-8 px-3 text-[10px] font-mono tracking-wider uppercase font-bold gap-1.5"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
                <Button
                  type="submit"
                  disabled={
                    disabled ||
                    !itemService.trim() ||
                    !unitPrice || parseFloat(unitPrice) <= 0 ||
                    !quantity || parseInt(quantity, 10) <= 0 ||
                    !supplierCountry ||
                    !supplierType
                  }
                  className="bg-blue-600 hover:bg-blue-700 text-white font-mono text-[10px] tracking-wider uppercase px-4 h-8 font-bold rounded shadow-sm transition-colors disabled:opacity-50"
                >
                  GET ESTIMATES
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper to escape HTML characters
function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Markdown formatting helper
function formatMarkdown(text: string) {
  const lines = text.split('\n');
  const htmlParts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      htmlParts.push('<div class="h-2"></div>');
      i++;
      continue;
    }

    const escaped = escapeHtml(line);
    const bold = (s: string) => s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }

      if (tableLines.length >= 2) {
        const headerCols = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map(c => c.trim());

        const hasSeparator = tableLines[1].includes('---');
        const startRowIdx = hasSeparator ? 2 : 1;

        let tableHtml = '<div class="overflow-x-auto my-2 rounded-lg border border-stone-200 dark:border-stone-800 shadow-sm"><table class="w-full text-left border-collapse text-xs">';

        tableHtml += '<thead class="bg-stone-50 dark:bg-stone-850/60 border-b border-stone-200 dark:border-stone-800"><tr>';
        headerCols.forEach(col => {
          tableHtml += `<th class="px-3 py-2 font-mono uppercase tracking-wider text-[9px] font-bold text-muted-foreground">${bold(col)}</th>`;
        });
        tableHtml += '</tr></thead>';

        tableHtml += '<tbody class="divide-y divide-stone-100 dark:divide-stone-800/40 bg-white dark:bg-stone-900">';
        for (let r = startRowIdx; r < tableLines.length; r++) {
          const rowCols = tableLines[r]
            .split('|')
            .slice(1, -1)
            .map(c => c.trim());

          tableHtml += '<tr class="hover:bg-stone-50/50 dark:hover:bg-stone-850/20">';
          rowCols.forEach(col => {
            tableHtml += `<td class="px-3 py-2 text-foreground font-medium">${bold(col)}</td>`;
          });
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table></div>';
        htmlParts.push(tableHtml);
      }
      continue;
    }

    if (line.match(/^## /)) {
      htmlParts.push(`<h3 class="font-semibold text-sm mt-3 mb-1 text-foreground">${bold(escaped.replace(/^## /, ''))}</h3>`);
      i++;
      continue;
    }
    if (line.match(/^### /)) {
      htmlParts.push(`<h4 class="font-medium text-xs mt-2 mb-1 text-muted-foreground">${bold(escaped.replace(/^### /, ''))}</h4>`);
      i++;
      continue;
    }

    if (line.match(/^- /)) {
      while (i < lines.length && lines[i].match(/^- /)) {
        const itemText = escapeHtml(lines[i].replace(/^- /, ''));
        htmlParts.push(`<div class="flex items-start gap-1.5 text-xs py-0.5 text-foreground"><span class="text-muted-foreground mt-0.5">&bull;</span><span>${bold(itemText)}</span></div>`);
        i++;
      }
      continue;
    }

    if (line.match(/^\s{2,}/)) {
      htmlParts.push(`<div class="text-xs pl-4 py-0.5 text-muted-foreground">${bold(escaped.trim())}</div>`);
      i++;
      continue;
    }

    htmlParts.push(`<div class="text-xs py-0.5 text-foreground">${bold(escaped)}</div>`);
    i++;
  }

  return htmlParts.join('');
}

// Custom Tooltip for Recharts Trend Line
const CustomTrendTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border p-2 rounded shadow-md text-xs">
        <p className="font-semibold">{`Period: ${payload[0].payload.name || payload[0].payload.period || "Quote"}`}</p>
        <p className="text-cyan-600 font-medium">{`Quote Price: $${payload[0].value}`}</p>
        {payload[1] && <p className="text-amber-500 font-medium">{`Market Benchmark: $${payload[1].value}`}</p>}
      </div>
    );
  }
  return null;
};

// ─── Custom Waterfall Cost Chart Component ───
function WaterfallChart({ data }: { data: Array<{ component: string; cost: number }> }) {
  if (!Array.isArray(data) || data.length === 0) return null;

  // Calculate cumulative spans for float positions
  let accumulated = 0;
  const waterfallSteps = data.map((item, idx) => {
    const isFinal = idx === data.length - 1 || item.component.toLowerCase().includes("final") || item.component.toLowerCase().includes("quote");
    const isFirst = idx === 0;

    let start = accumulated;
    let end = accumulated + item.cost;

    if (isFinal) {
      start = 0;
      end = item.cost;
    } else {
      accumulated += item.cost;
    }

    return {
      name: item.component,
      cost: item.cost,
      start,
      end,
      isFinal
    };
  });

  const maxVal = Math.max(...waterfallSteps.map(s => s.end), 1);

  return (
    <div className="space-y-2 select-none">
      {waterfallSteps.map((step, idx) => {
        const leftPct = (step.start / maxVal) * 100;
        const widthPct = (step.cost / maxVal) * 100;

        let colorClass = "bg-cyan-500/80 dark:bg-cyan-600/80"; // standard components
        if (step.isFinal) {
          colorClass = "bg-primary";
        } else if (step.name.toLowerCase().includes("margin")) {
          colorClass = "bg-emerald-500 dark:bg-emerald-600";
        } else if (step.name.toLowerCase().includes("freight")) {
          colorClass = "bg-blue-500/70 dark:bg-blue-600/70";
        } else if (step.name.toLowerCase().includes("overhead")) {
          colorClass = "bg-amber-500/70 dark:bg-amber-600/70";
        }

        return (
          <div key={idx} className="flex items-center text-xs">
            <div className="w-24 text-[10px] font-medium text-muted-foreground truncate pr-1" title={step.name}>
              {step.name}
            </div>
            <div className="flex-1 bg-muted/40 rounded h-5 relative overflow-hidden">
              <div
                className={`absolute h-full rounded transition-all duration-300 flex items-center justify-end pr-1.5 ${colorClass}`}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`
                }}
              >
                {step.cost > (maxVal * 0.08) && (
                  <span className="text-[9px] font-bold text-white leading-none">
                    ${Math.round(step.cost)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Helper for spend trend y-axis
const formatAxisValue = (val: number, symbol: string = "$") => {
  if (val >= 1000000) return `${symbol}${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `${symbol}${(val / 1000).toFixed(0)}k`;
  return `${symbol}${val}`;
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  "USD": "$",
  "AED": "AED ",
  "INR": "₹",
  "EUR": "€",
  "GBP": "£",
  "CAD": "C$"
};

// ─── Fair Market Cost & Fair Market Price Comparison Stat Card ───
function FairMarketCostCard({
  item,
  currencySymbol = "$",
  quotePrice = 0,
  totalPrice = 0,
  fmcMin = 0,
  fmcMax = 0,
  fmpPrice = 0,
  fmpMin = 0,
  fmpMax = 0,
  fmpMarginAmount = 0,
  fmpMarginPercent = 0
}: {
  item?: string;
  currencySymbol?: string;
  quotePrice?: number;
  totalPrice?: number;
  fmcMin?: number;
  fmcMax?: number;
  fmpPrice?: number;
  fmpMin?: number;
  fmpMax?: number;
  fmpMarginAmount?: number;
  fmpMarginPercent?: number;
}) {
  const isAboveFmp = (fmpMarginAmount ?? 0) > 0;
  const safePercent = typeof fmpMarginPercent === "number" && !isNaN(fmpMarginPercent) ? fmpMarginPercent : 0;
  const safeAmount = typeof fmpMarginAmount === "number" && !isNaN(fmpMarginAmount) ? fmpMarginAmount : 0;

  if (!(fmcMax > 0)) return null;

  // Simple FMC view when quote price or FMP price are not provided (e.g. standalone fmc_card)
  if (!quotePrice || !fmpPrice) {
    return (
      <Card className="bg-white border border-[#ebebeb] rounded-lg p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[9px] tracking-[0.12em] text-[#aaaaaa] uppercase">Fair Market Cost (FMC)</p>
            <p className="text-[11px] text-[#888888] mt-0.5">Should-cost estimate for {item || "this item"}</p>
          </div>
          <span className="text-xl font-semibold text-[#1a1a18] whitespace-nowrap">
            {currencySymbol}{fmcMin.toLocaleString()} – {currencySymbol}{fmcMax.toLocaleString()}
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-white border border-[#ebebeb] rounded-lg p-4">
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center border-b border-[#f0f0f0] pb-2">
          <div>
            <h4 className="text-xs font-semibold text-[#1a1a18] uppercase tracking-wide">
              Cost & Price Benchmark Differentiators ({item || "Item"})
            </h4>
            <p className="text-[10px] text-[#777777] mt-0.5">
              Side-by-side comparison of Quoted Price, FMC (Should-Cost), and FMP (Market Benchmark).
            </p>
          </div>
          <Badge variant={isAboveFmp ? "destructive" : "secondary"} className="text-[10px] font-mono">
            {isAboveFmp ? `Above FMP (+${safePercent.toFixed(1)}%)` : `At/Below FMP (${safePercent.toFixed(1)}%)`}
          </Badge>
        </div>

        <div className="grid grid-cols-1 @sm:grid-cols-3 gap-3">
          {/* Quoted Price */}
          <div className="bg-[#f9f9fb] p-2.5 rounded border border-[#efeff5]">
            <p className="text-[9px] tracking-wider text-[#888888] uppercase font-semibold">1. Quoted Price</p>
            <p className="text-base font-bold text-[#1a1a18] mt-1">{currencySymbol}{quotePrice.toLocaleString()}</p>
            <p className="text-[10px] text-[#777777] mt-0.5">
              Given Unit Price
              {totalPrice > 0 && <> · Total {currencySymbol}{totalPrice.toLocaleString()}</>}
            </p>
          </div>

          {/* FMC Range */}
          <div className="bg-[#f9f9fb] p-2.5 rounded border border-[#efeff5]">
            <p className="text-[9px] tracking-wider text-[#888888] uppercase font-semibold">2. Fair Market Cost (FMC)</p>
            <p className="text-base font-bold text-[#2563eb] mt-1">
              {currencySymbol}{fmcMin.toLocaleString()} – {currencySymbol}{fmcMax.toLocaleString()}
            </p>
            <p className="text-[10px] text-[#777777] mt-0.5">Material + Labour + Overhead + Freight</p>
          </div>

          {/* FMP & Variance */}
          <div className="bg-[#f9f9fb] p-2.5 rounded border border-[#efeff5]">
            <p className="text-[9px] tracking-wider text-[#888888] uppercase font-semibold">3. Fair Market Price (FMP)</p>
            <p className="text-base font-bold text-[#16a34a] mt-1">
              {fmpMin > 0 && fmpMax > 0
                ? <>{currencySymbol}{fmpMin.toLocaleString()} – {currencySymbol}{fmpMax.toLocaleString()}</>
                : <>{currencySymbol}{fmpPrice.toLocaleString()}</>}
            </p>
            <p className="text-[10px] text-[#777777] mt-0.5">
              Variance vs FMP: <span className={isAboveFmp ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>
                {safeAmount >= 0 ? "+" : ""}{currencySymbol}{safeAmount.toLocaleString()} ({safePercent >= 0 ? "+" : ""}{safePercent.toFixed(1)}%)
              </span>
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Normalizer & Calculations for dynamic Cost Intelligence Dashboard ───
function normalizeCostIntelligenceData(data: any) {
  if (!data) return null;

  const parseNum = (val: any, fallback: number): number => {
    if (val == null) return fallback;
    const parsed = parseFloat(String(val).replace(/[^0-9.]/g, ""));
    return isNaN(parsed) ? fallback : parsed;
  };

  const item = data.overview?.item || "Steel Fasteners";
  const currency = data.overview?.currency || "USD";
  const supplier = data.overview?.supplier || "Primary Producer";
  let supplierType = data.overview?.supplierType || "Primary producer/Manufacturer";
  if (supplierType === "Manufacturer" || supplierType === "Type 1") {
    supplierType = "Primary producer/Manufacturer";
  } else if (supplierType === "Distributor" || supplierType === "Type 2") {
    supplierType = "Distributor / Dealer";
  }
  const country = data.overview?.country || "India";
  const region = data.overview?.region || "Southeast Asia";
  const uom = typeof data.overview?.uom === "string" ? data.overview.uom.trim() : "";
  const quotePrice = parseNum(data.overview?.quotePrice, 10);
  const quantity = parseNum(data.overview?.quantity, 480);
  const totalPrice = parseNum(data.overview?.totalPrice, quotePrice * quantity);
  const orderFrequency = data.overview?.orderFrequency || "Yearly";

  const marginPercent = parseNum(data.marginBenchmark?.marginPercent ?? data.marginBenchmark?.marginPercentValue, 44);
  const industryMarginMin = parseNum(data.marginBenchmark?.industryMarginMin, 22);
  const industryMarginMax = parseNum(data.marginBenchmark?.industryMarginMax, 28);
  const industryMarginText = data.marginBenchmark?.industryMargin || `${industryMarginMin}-${industryMarginMax}% benchmark`;

  const benchmarkAvg = (industryMarginMin + industryMarginMax) / 2;
  const marginGapVal = marginPercent - benchmarkAvg;
  const marginGapText = `${Math.abs(Math.round(marginPercent - benchmarkAvg))}pp ${marginPercent >= benchmarkAvg ? "above" : "below"} avg vs ${industryMarginText}`;

  const potentialSavings = parseNum(data.recommendation?.expectedSavings ?? data.marginBenchmark?.potentialSavings, 720);

  const pricingPosition = data.marginBenchmark?.pricingPosition || (marginPercent > industryMarginMax ? "Above Market" : marginPercent < industryMarginMin ? "Below Market" : "At Market");
  const pricingScore = parseNum(data.marginBenchmark?.pricingScore, Math.max(100 - Math.round(marginGapVal * 2), 30));
  const pricingAction = data.marginBenchmark?.pricingAction
    || (pricingPosition === "Above Market" ? "Negotiate now" : pricingPosition === "Below Market" ? "Lock in price" : "Hold position");

  const confidencePercent = parseNum(data.recommendation?.confidencePercent, 68);
  const confidenceSubtext = data.recommendation?.confidenceSubtext || `${quantity} units/yr model accuracy`;

  const costStructure = Array.isArray(data.costStructure) ? data.costStructure : [];

  // FMC comes from the LLM's bottom-up should-cost only — nothing is derived
  // client-side. Absent → 0, and the FMC card hides rather than showing a
  // number backed out of the price.
  const fmcMin = parseNum(data.fmc?.min, 0);
  const fmcMax = parseNum(data.fmc?.max, 0);
  const fmcPrice = parseNum(data.fmc?.mid || data.fmc?.price, parseFloat(((fmcMin + fmcMax) / 2).toFixed(2)));
  // Should-cost component breakdown from the isolated FMC call — drives the
  // margin chain and cost build-up instead of client-side templates.
  const fmcComponents: Array<{ component: string; cost: number }> = Array.isArray(data.fmc?.components)
    ? data.fmc.components
        .map((c: any) => ({ component: String(c?.component || ""), cost: parseNum(c?.cost, 0) }))
        .filter((c: any) => c.component && c.cost > 0)
    : [];

  // FMP (Fair Market Price) object extraction — no quote-derived fallback:
  // when the server sent no fmp (no market data, no LLM estimate), fmpPrice
  // stays 0 and the FMP tile falls back to the FMC-only view.
  const fmpPrice = parseNum(data.fmp?.price, 0);
  const fmpMin = parseNum(data.fmp?.rangeMin, fmpPrice > 0 ? fmpPrice * 0.92 : 0);
  const fmpMax = parseNum(data.fmp?.rangeMax, fmpPrice > 0 ? fmpPrice * 1.08 : 0);
  const fmpMarginAmount = parseNum(data.fmp?.fmpMarginAmount, fmpPrice > 0 ? quotePrice - fmpPrice : 0);
  const fmpMarginPercent = parseNum(data.fmp?.fmpMarginPercent, fmpPrice > 0 ? ((quotePrice - fmpPrice) / fmpPrice) * 100 : 0);

  let countryBenchmark = data.charts?.countryBenchmark || data.charts?.regionalBenchmark || [];

  countryBenchmark = countryBenchmark.map((cb: any) => {
    if (cb.region && !cb.country && !cb.state) {
      const rName = cb.region.toLowerCase();
      let cName = cb.region;
      if (rName.includes("your") || rName.includes("price")) cName = "Your Price";
      else if (rName.includes("asia pacific")) cName = "China";
      else if (rName.includes("se asia")) cName = "Vietnam";
      else if (rName.includes("europe")) cName = "Germany";
      else if (rName.includes("n. america")) cName = "United States";
      else if (rName.includes("india")) cName = "India";

      return {
        country: cName,
        price: cb.price,
        isSelected: cb.isSelected || rName.includes("your")
      };
    }
    return {
      country: cb.country || cb.state || "Alternative Region",
      price: cb.price,
      isSelected: cb.isSelected
    };
  });

  const selectedState = data.overview?.supplierState || data.overview?.state || "";

  // No client-side fabrication: the LLM provides the regional benchmark
  // countries and prices (charts.countryBenchmark); if it's missing, the
  // chart is simply not shown.
  if (countryBenchmark.length > 0) {
    // Deduplicate and ensure exactly one selected country/state and top 5 alternative regions
    const selectedName = (selectedState || country || "").toLowerCase();

    // Find the selected/primary entry first
    let primaryEntry = countryBenchmark.find((cb: any) => cb.isSelected || cb.country.toLowerCase().includes("your") || cb.country.toLowerCase().includes("selected") || (selectedName && cb.country.toLowerCase() === selectedName));
    if (!primaryEntry && countryBenchmark.length > 0) {
      primaryEntry = countryBenchmark[0];
    }

    const deduplicated: any[] = [];
    const seenCountries = new Set<string>();

    if (primaryEntry) {
      const displayName = selectedState || country || primaryEntry.country || "Selected Region";
      deduplicated.push({
        ...primaryEntry,
        country: displayName,
        isSelected: true
      });
      seenCountries.add(displayName.toLowerCase());
      seenCountries.add("your price");
    }

    countryBenchmark.forEach((cb: any) => {
      if (cb === primaryEntry) return;
      const cLower = cb.country.toLowerCase();
      if (cLower.includes("your") || cLower.includes("price") || (selectedName && cLower === selectedName)) {
        return; // Skip duplicate of selected entry
      }
      if (!seenCountries.has(cLower)) {
        seenCountries.add(cLower);
        deduplicated.push({
          country: cb.country,
          price: cb.price,
          isSelected: false
        });
      }
    });

    countryBenchmark = deduplicated.slice(0, 6);
  }

  // Unit-price comparison series. The backend supplies a real, deterministic
  // spendTrend: CURRENT = flat quoted unit price, SPEND = real per-PO-transaction
  // prices (null between purchases), MARKET = real external snapshot (null if
  // unresolved). Plotted on a real date axis (xAxisMode="time"), so every row
  // needs a numeric `date`, not just a category `name`.
  let spendTrend = data.charts?.spendTrend || [];
  let hasPurchaseHistory = data.charts?.hasPurchaseHistory ?? spendTrend.some((s: any) => s.spend !== null && s.spend !== undefined);

  if (spendTrend.length === 0) {
    // Fallback for older/edge responses without a backend series: flat
    // quoted-price reference across the trailing 12-month window. No SPEND/MARKET.
    const now = Date.now();
    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - 12);
    spendTrend = [
      { date: windowStart.getTime(), name: "12 mo ago", current: quotePrice, spend: null, market: null },
      { date: now, name: "Today", current: quotePrice, spend: null, market: null }
    ];
    hasPurchaseHistory = false;
  }

  // Market drivers
  let marketDrivers = data.marketDrivers || [];
  if (marketDrivers.length === 0) {
    marketDrivers = [
      {
        title: "Raw Material Inflation",
        impact: "HIGH",
        text: `Input costs up 12% YTD driven by supply chain constraints and elevated energy prices across producing regions.`
      },
      {
        title: "Currency Fluctuation",
        impact: "MEDIUM",
        text: `Local currency vs USD fluctuations over last 90 days are increasing landed costs by up to 3.2%.`
      },
      {
        title: "Alternative Supplier Pool",
        impact: "HIGH",
        text: `14 qualified alternatives in ${region || "SE Asia"} offer 18-26% lower unit economics with comparable certifications.`
      },
      {
        title: "Volume Leverage",
        impact: "MEDIUM",
        text: `At ${quantity.toLocaleString()} units/yr, consolidated purchasing could unlock 8-12% rebate tiers.`
      }
    ];
  }

  // AI Recommendations — written by the LLM from this item's own analysis.
  // No client-side templates: an empty list hides the card rather than
  // showing generic advice with an invented savings split.
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];

  // ── Fair Market Price Normalization ──
  const defaultDataSources = [
    {
      name: "Global Trade Database (GTD)",
      weightPercent: 35,
      description: "Aggregated from 680K+ cross-border transactions, last 12 months",
      rangeMin: parseFloat((fmpPrice * 0.88).toFixed(2)),
      rangeMax: parseFloat((fmpPrice * 1.12).toFixed(2))
    },
    {
      name: "Supplier RFQ Pool (2.8M txns)",
      weightPercent: 30,
      description: "Anonymous RFQ responses from verified supplier network",
      rangeMin: parseFloat((fmpPrice * 0.85).toFixed(2)),
      rangeMax: parseFloat((fmpPrice * 1.10).toFixed(2))
    },
    {
      name: "Industry Index (IHS Markit)",
      weightPercent: 20,
      description: "Published commodity & manufactured goods pricing indices",
      rangeMin: parseFloat((fmpPrice * 0.90).toFixed(2)),
      rangeMax: parseFloat((fmpPrice * 1.15).toFixed(2))
    },
    {
      name: "Peer Benchmark (Anonymised)",
      weightPercent: 15,
      description: "Comparable spend data from 94 companies in same category",
      rangeMin: parseFloat((fmpPrice * 0.86).toFixed(2)),
      rangeMax: parseFloat((fmpPrice * 1.08).toFixed(2))
    }
  ];

  let dataSources = Array.isArray(data.fairMarketPrice?.dataSources) && data.fairMarketPrice.dataSources.length === 4
    ? data.fairMarketPrice.dataSources.map((ds: any, idx: number) => ({
        name: ds.name || defaultDataSources[idx].name,
        weightPercent: parseNum(ds.weightPercent, defaultDataSources[idx].weightPercent),
        description: ds.description || defaultDataSources[idx].description,
        rangeMin: parseNum(ds.rangeMin, defaultDataSources[idx].rangeMin),
        rangeMax: parseNum(ds.rangeMax, defaultDataSources[idx].rangeMax)
      }))
    : defaultDataSources;

  const premiumPercent = fmpPrice > 0 ? parseFloat((((quotePrice - fmpPrice) / fmpPrice) * 100).toFixed(1)) : 0;
  const annualVol = quantity * (FREQ_PER_YEAR[orderFrequency] || 12);
  const annualOverpayment = Math.round(Math.max(0, quotePrice - fmpPrice) * annualVol);

  const fairMarketPrice = {
    price: fmpPrice,
    rangeMin: fmpMin,
    rangeMax: fmpMax,
    dataSources,
    premiumPercent,
    annualOverpayment
  };

  // ── Local Suppliers Normalization ──
  const rawLocalSuppliers = Array.isArray(data.localSuppliers) ? data.localSuppliers : [];
  let localSuppliers = rawLocalSuppliers.map((ls: any) => {
    const name = String(ls.name || "").trim();
    const type = ls.type || "Manufacturer";
    const city = String(ls.city || "").trim();
    const countryStr = String(ls.country || "").trim();
    const locParts = [city, countryStr].filter(Boolean);
    const location = locParts.length > 0 ? locParts.join(", ") : (country || "Local Area");
    const unitPrice = ls.unitPrice != null && !isNaN(parseFloat(ls.unitPrice)) ? parseFloat(ls.unitPrice) : null;
    const priceUnit = ls.priceUnit ? String(ls.priceUnit) : null;
    const priceCurrency = String(ls.priceCurrency || currency || "USD").toUpperCase();
    const leadTimeDays = ls.leadTimeDays != null && !isNaN(parseInt(ls.leadTimeDays, 10)) ? parseInt(ls.leadTimeDays, 10) : null;
    const moq = ls.moq != null && !isNaN(parseInt(ls.moq, 10)) ? parseInt(ls.moq, 10) : null;
    const rating = ls.rating != null && !isNaN(parseFloat(ls.rating)) ? parseFloat(ls.rating) : null;
    const verified = ls.verified !== false;
    const source = ls.source === "web" ? "web" : "estimated";
    const sourceUrl = String(ls.sourceUrl || "").trim();

    const currenciesMatch = priceCurrency === String(currency).toUpperCase();
    const deltaPercent = (unitPrice != null && quotePrice > 0 && currenciesMatch)
      ? parseFloat((((unitPrice - quotePrice) / quotePrice) * 100).toFixed(1))
      : null;

    return {
      name,
      type,
      city,
      country: countryStr,
      location,
      unitPrice,
      priceUnit,
      priceCurrency,
      leadTimeDays,
      moq,
      rating,
      verified,
      source,
      sourceUrl,
      deltaPercent,
      bestPrice: false
    };
  }).filter((ls: any) => ls.name);

  // Sort local suppliers by unitPrice ascending (null prices at end)
  localSuppliers.sort((a: any, b: any) => {
    if (a.unitPrice === null && b.unitPrice === null) return 0;
    if (a.unitPrice === null) return 1;
    if (b.unitPrice === null) return -1;
    return a.unitPrice - b.unitPrice;
  });

  // Flag cheapest supplier matching quote currency as bestPrice (or cheapest overall with price)
  const cheapestMatching = localSuppliers.find((ls: any) => ls.unitPrice !== null && ls.priceCurrency === String(currency).toUpperCase());
  if (cheapestMatching) {
    cheapestMatching.bestPrice = true;
  } else {
    const cheapestAny = localSuppliers.find((ls: any) => ls.unitPrice !== null);
    if (cheapestAny) cheapestAny.bestPrice = true;
  }

  const localSuppliersNear = data.localSuppliersNear || country || "Delivery Location";

  const marketChanges = data.marketChanges || {
    priceTrend: { value: marginPercent > 35 ? "+6.8%" : (marginPercent > 25 ? "+2.4%" : "-1.5%"), direction: marginPercent > 25 ? "up" : "down", note: "vs prior 6-month avg" },
    supplyIndex: { value: marginPercent > 35 ? "Tight" : (marginPercent > 25 ? "Balanced" : "Surplus"), direction: marginPercent > 30 ? "up" : "down", note: "global availability" },
    demandShift: { value: quantity > 1000 ? "+12% YoY" : "+5% YoY", direction: "up", note: "category demand growth" },
    bulletPoints: [
      { direction: "up", text: `Raw material input costs for ${item} rose ~${marginPercent > 30 ? 9 : 4}% over the past quarter driven by energy and logistics surcharges.` },
      { direction: "down", text: `${country} currency movements vs USD partially offset landed cost inflation for export shipments.` },
      { direction: "up", text: "Lead times extended by 6–12 days vs baseline due to port congestion and seasonal inventory buildup." },
      { direction: "down", text: "New qualified production capacity in competitive regions offers 10–16% lower unit cost options." }
    ]
  };

  return {
    item,
    supplier,
    supplierType,
    country,
    region,
    uom,
    quotePrice,
    totalPrice,
    quantity,
    orderFrequency,
    currency,
    marginPercent,
    marginGapText,
    potentialSavings,
    pricingPosition,
    pricingScore,
    pricingAction,
    confidencePercent,
    confidenceSubtext,
    costStructure,
    fmcMin,
    fmcMax,
    fmcPrice,
    fmcComponents,
    fmpPrice,
    fmpMin,
    fmpMax,
    fmpMarginAmount,
    fmpMarginPercent,
    countryBenchmark,
    spendTrend,
    hasPurchaseHistory,
    marketDrivers,
    marketChanges,
    recommendations,
    fairMarketPrice,
    localSuppliers,
    localSuppliersNear
  };
}


// ─── Visual Cost Intelligence Dashboard Component ───
interface CostIntelligenceDashboardViewProps {
  data: any;
}

function CostIntelligenceDashboardView({ data }: CostIntelligenceDashboardViewProps) {
  const norm = normalizeCostIntelligenceData(data);
  if (!norm) return null;

  const currencySymbol = CURRENCY_SYMBOLS[String(norm.currency || "USD").toUpperCase()] || "$";
  const annualQty = norm.quantity * (FREQ_PER_YEAR[norm.orderFrequency] || 12);

  return (
    <div className="space-y-4 font-['Google_Sans']">
      {/* ─── Top Cards (4-column Grid) ─── */}
      <div className="grid grid-cols-1 @sm:grid-cols-2 @3xl:grid-cols-4 gap-4">
        {/* Card 1: Est. Supplier Margin (high-contrast dark card) */}
        <div className="bg-[#1a1a18] rounded-lg p-4 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[9px] tracking-[0.12em] text-white/45 uppercase">Est. Supplier Margin</span>
            <Percent className="h-3.5 w-3.5 text-white/40" />
          </div>
          <div className="mt-4">
            <span className="text-[1.85rem] font-bold text-white leading-none">{norm.marginPercent}%</span>
            <p className="text-[10px] text-white/40 mt-2">{norm.marginGapText}</p>
          </div>
        </div>

        {/* Card 2: Potential Annual Savings */}
        <div className="bg-white border border-[#ebebeb] rounded-lg p-4 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[9px] tracking-[0.12em] text-[#aaaaaa] uppercase">Potential Annual Savings</span>
            <TrendingDown className="h-[15px] w-[15px] text-[#16a34a]" />
          </div>
          <div className="mt-4">
            <span className="text-[1.85rem] font-bold text-[#1a1a18] leading-none">{currencySymbol}{norm.potentialSavings.toLocaleString()}</span>
            <div className="flex items-center gap-1.5 mt-2 text-[11px]">
              <span className="text-[#16a34a] font-medium flex items-center gap-0.5"><ArrowDownRight className="h-2.5 w-2.5" />achievable</span>
              <span className="text-[#aaaaaa]">all levers combined</span>
            </div>
          </div>
        </div>

        {/* Card 3: Pricing Position */}
        <div className="bg-white border border-[#ebebeb] rounded-lg p-4 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[9px] tracking-[0.12em] text-[#aaaaaa] uppercase">Pricing Position</span>
            <Target className="h-[15px] w-[15px] text-[#f59e0b]" />
          </div>
          <div className="mt-4">
            <span className="text-[1.85rem] font-bold text-[#1a1a18] leading-none">{norm.pricingPosition}</span>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] flex-wrap">
              <span className="text-[#1a1a18] font-medium">{norm.pricingAction}</span>
              <span className="text-[#aaaaaa]">Score {norm.pricingScore}/100</span>
            </div>
          </div>
        </div>

        {/* Card 4: Confidence */}
        <div className="bg-white border border-[#ebebeb] rounded-lg p-4 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[9px] tracking-[0.12em] text-[#aaaaaa] uppercase">Confidence</span>
            <ShieldCheck className="h-[15px] w-[15px] text-[#3b82f6]" />
          </div>
          <div className="mt-4">
            <span className="text-[2.4rem] font-medium text-[#1a1a18] leading-none">{norm.confidencePercent}%</span>
            <p className="text-[11px] text-[#aaaaaa] mt-2.5">→ {norm.confidenceSubtext}</p>
          </div>
        </div>
      </div>
      {/* ─── Fair Market Cost & Fair Market Price Benchmark Differentiators ─── */}
      <FairMarketCostCard
        item={norm.item}
        currencySymbol={currencySymbol}
        quotePrice={norm.quotePrice}
        totalPrice={norm.totalPrice}
        fmcMin={norm.fmcMin}
        fmcMax={norm.fmcMax}
        fmpPrice={norm.fmpPrice}
        fmpMin={norm.fmpMin}
        fmpMax={norm.fmpMax}
        fmpMarginAmount={norm.fmpMarginAmount}
        fmpMarginPercent={norm.fmpMarginPercent}
      />

      {/* ─── Profit Margin Chain / BOM / Cost Distribution ─── */}
      <CostBomPanel item={norm.item} unitPrice={norm.quotePrice} uom={norm.uom} fmcMin={norm.fmcMin} fmcMax={norm.fmcMax} fmcPrice={norm.fmcPrice} fmcComponents={norm.fmcComponents} supplierType={norm.supplierType} annualQty={annualQty} isBidQuoted={norm.supplier !== "Estimated Supplier"} currencySymbol={currencySymbol} />

      {/* ─── Cost Waterfall & Price Benchmark by Region (2-column Grid) ─── */}
      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-4">
        {/* Waterfall Chart */}
        <CostWaterfallChart costStructure={norm.costStructure} currencySymbol={currencySymbol} />

        {/* Country Benchmarks — only when the LLM supplied real regional data */}
        {norm.countryBenchmark.length > 0 && (
        <Card className="bg-white border border-[#ebebeb] rounded-lg p-5">
          <p className="text-[9px] text-[#bbbbbb] uppercase tracking-[0.1em] mb-4">
            Price Benchmark by Region
          </p>
          <div className="h-[220px] w-full pr-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={norm.countryBenchmark}
                margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#f0f0f0" />
                <XAxis
                  dataKey="country"
                  tick={{ fontSize: 9, fill: "#bbbbbb", fontFamily: INTEL_FONT }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#bbbbbb", fontFamily: INTEL_FONT }}
                  tickFormatter={(val) => `${currencySymbol}${val}`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "#f9f9f9" }}
                  contentStyle={{ fontFamily: INTEL_FONT, fontSize: "10px", borderRadius: "6px", border: "1px solid #ebebeb" }}
                  formatter={(val: any) => [`${currencySymbol}${parseFloat(val).toFixed(2)}`, "Unit Price"]}
                />
                <Bar dataKey="price" radius={[3, 3, 0, 0]}>
                  {norm.countryBenchmark.map((entry: any, index: number) => {
                    const isYourPrice = entry.isSelected || entry.country.toLowerCase().includes("your") || entry.country.toLowerCase().includes("selected");
                    const barColor = isYourPrice ? INTEL_COLOR.navy : "#d4d4d2";
                    return <Cell key={`cell-${index}`} fill={barColor} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        )}
      </div>

      {/* ─── Margin Gauge & Spend Comparison (Grid) ─── */}
      <div className="grid grid-cols-1 @3xl:grid-cols-12 gap-4">
        {/* Margin Gauge (5 columns) */}
        <Card className="@3xl:col-span-5 bg-white border border-[#ebebeb] rounded-lg p-5 flex flex-col">
          <p className="text-[9px] text-[#bbbbbb] uppercase tracking-[0.1em] mb-2">
            Margin Gauge
          </p>
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <MarginGauge value={norm.marginPercent} label="Supplier Margin" />
            <div className="grid grid-cols-3 gap-1.5 w-full">
              {[
                { label: "Raw Mat.", value: Math.round(norm.marginPercent * 0.55) },
                { label: "Labor", value: Math.round(norm.marginPercent * 0.25) },
                { label: "Overhead", value: Math.round(norm.marginPercent * 0.20) },
              ].map((item, gi) => (
                <div key={`gauge-${gi}`} className="text-center py-2 px-1 bg-[#f9f9f9] border border-[#ebebeb] rounded-md">
                  <div className="text-[13px] font-medium text-[#1a1a18]">{item.value}%</div>
                  <div className="text-[9px] text-[#bbbbbb] uppercase tracking-[0.06em] mt-0.5">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Spend Comparison Line Chart (7 columns) */}
        <div className="@3xl:col-span-7">
          <SpendTrendChart
            spendTrend={norm.spendTrend}
            hasPurchaseHistory={norm.hasPurchaseHistory}
            currencySymbol={currencySymbol}
            potentialSavings={norm.potentialSavings}
            title="Marketing negotiation agent  Comparison"
            xAxisMode="time"
          />
        </div>
      </div>

      {/* ─── Market Drivers (4-column Grid) ─── */}
      <Card className="bg-white border border-[#ebebeb] rounded-lg p-5">
        <p className="text-[9px] text-[#bbbbbb] uppercase tracking-[0.1em] mb-3">
          Market Drivers
        </p>
        <div className="grid grid-cols-1 @xl:grid-cols-2 gap-2.5">
          {norm.marketDrivers.map((driver: any, index: number) => {
            const isHigh = driver.impact.toLowerCase() === "high";
            const isDown = driver.title.toLowerCase().includes("pool") || driver.title.toLowerCase().includes("leverage") || driver.title.toLowerCase().includes("alternative");
            return (
              <div key={index} className="border border-[#ebebeb] rounded-md p-3.5 flex gap-3.5">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${isDown ? "bg-[#f0fdf4]" : "bg-[#fef2f2]"}`}>
                  {isDown ? <ArrowDownRight className="h-[13px] w-[13px] text-[#16a34a]" /> : <ArrowUpRight className="h-[13px] w-[13px] text-[#dc2626]" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-medium text-[#1a1a18]">{driver.title}</span>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${isHigh ? "text-[#dc2626] bg-[#fef2f2]" : "text-[#b45309] bg-[#fffbeb]"}`}>
                      {driver.impact}
                    </span>
                  </div>
                  <p className="text-xs text-[#888888] leading-relaxed">{driver.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ─── AI Recommendations (Prioritized rows) ─── */}
      {norm.recommendations.length > 0 && (
      <Card className="bg-white border border-[#ebebeb] rounded-lg p-5">
        <p className="text-[9px] text-[#bbbbbb] uppercase tracking-[0.1em] mb-3">
          AI Recommendations
        </p>

        <div className="flex flex-col gap-2">
          {norm.recommendations.map((rec: any, idx: number) => {
            const isCritical = rec.type.toLowerCase().includes("critical");
            const isHigh = rec.type.toLowerCase().includes("high");

            const cfg = isCritical
              ? { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", Icon: AlertTriangle }
              : isHigh
                ? { color: "#b45309", bg: "#fffbeb", border: "#fde68a", Icon: ArrowUpRight }
                : { color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb", Icon: Check };

            return (
              <div key={idx} className="rounded-md p-3.5 flex gap-3.5 items-start" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                <cfg.Icon size={14} color={cfg.color} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[9px] font-medium uppercase px-1.5 py-0.5 rounded" style={{ color: cfg.color, background: "white" }}>
                      {rec.type}
                    </span>
                    <span className="text-[13px] font-medium text-[#1a1a18]">{rec.title}</span>
                    <span className="ml-auto text-xs font-medium text-[#16a34a]">{currencySymbol}{rec.savings.toLocaleString()}/yr</span>
                  </div>
                  <p className="text-xs text-[#666666] leading-relaxed">{rec.text}</p>
                </div>
              </div>
            );
          })}

          {/* Total savings row */}
          <div className="mt-1 bg-[#f9fafb] border border-[#ebebeb] rounded-md px-4 py-2.5 flex items-center gap-2.5">
            <TrendingDown size={13} color="#16a34a" />
            <span className="text-[13px] text-[#666666]">Total identified savings opportunity</span>
            <span className="ml-auto text-[13px] font-medium text-[#16a34a]">
              {currencySymbol}{norm.potentialSavings.toLocaleString()} / year
            </span>
          </div>
        </div>
      </Card>
      )}

      {/* ─── Dynamic Market Changes ─── */}
      <Card className="bg-white border border-[#ebebeb] rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[13px] font-semibold text-[#1a1a18]">Market Changes — {norm.item || "Selected Item"}</span>
          <span className="text-[9px] text-[#bbbbbb] uppercase tracking-[0.08em]">AI & Real-Data Grounded</span>
        </div>
        <div className="grid grid-cols-1 @xl:grid-cols-3 gap-2.5 mb-4">
          {[
            { label: "Price Trend", value: norm.marketChanges.priceTrend?.value || "+3.1%", dir: norm.marketChanges.priceTrend?.direction || "up", note: norm.marketChanges.priceTrend?.note || "vs prior 6-month avg" },
            { label: "Supply Index", value: norm.marketChanges.supplyIndex?.value || "Balanced", dir: norm.marketChanges.supplyIndex?.direction || "up", note: norm.marketChanges.supplyIndex?.note || "global availability" },
            { label: "Demand Shift", value: norm.marketChanges.demandShift?.value || "+4% YoY", dir: norm.marketChanges.demandShift?.direction || "up", note: norm.marketChanges.demandShift?.note || "category demand growth" },
          ].map((m, i) => (
            <div key={`mc-${i}`} className="bg-[#fafafa] border border-[#ebebeb] rounded-md p-3.5">
              <div className="text-[9px] text-[#bbbbbb] uppercase tracking-[0.08em] mb-1.5">{m.label}</div>
              <div className="flex items-center gap-1.5">
                {m.dir === "up" ? <ArrowUpRight size={14} color="#dc2626" /> : <ArrowDownRight size={14} color="#2d6a8f" />}
                <span className="text-base font-medium text-[#1a1a18]">{m.value}</span>
              </div>
              <div className="text-[10px] text-[#bbbbbb] mt-1">{m.note}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {(norm.marketChanges.bulletPoints || []).map((s: any, i: number) => {
            const dir = s.direction || "up";
            return (
              <div
                key={`ms-${i}`}
                className="flex items-start gap-2.5 p-2.5 rounded-md"
                style={{ background: dir === "up" ? "#fef9f9" : "#f6f8fc", border: `1px solid ${dir === "up" ? "#fee2e2" : "#e0eaf4"}` }}
              >
                {dir === "up" ? <ArrowUpRight size={12} color="#dc2626" className="flex-shrink-0 mt-0.5" /> : <ArrowDownRight size={12} color="#2d6a8f" className="flex-shrink-0 mt-0.5" />}
                <span className="text-xs text-[#555555] leading-relaxed">{s.text}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ─── AI Suggestion ───
          Same heuristic nature as Market Changes above. */}
      <div className="bg-[#1a1a18] rounded-lg p-[24px_28px]">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-7 h-7 rounded-md bg-white/[0.08] flex items-center justify-center">
            <Zap size={13} color="#fff" strokeWidth={1.75} />
          </div>
          <span className="text-[11px] tracking-[0.1em] uppercase text-white/50">AI Suggestion</span>
          <span className="ml-auto text-[9px] uppercase tracking-[0.08em] text-white/30">Confidence {norm.confidencePercent}%</span>
        </div>

        <div className="mb-5">
          <div className="text-[9px] uppercase tracking-[0.1em] text-white/35 mb-2">Best Immediate Action</div>
          <div className="text-[15px] font-medium text-white leading-[1.55] mb-2.5">
            {norm.marginPercent > 35
              ? `Supplier margin on ${norm.item || "this item"} is significantly above benchmark. Issue a competitive RFQ to at least 3 alternate suppliers in ${norm.country || "the same region"} and SE Asia before the next contract renewal.`
              : norm.marginPercent > 25
                ? `Pricing is at market but savings remain available through volume consolidation. Negotiate a tiered rebate structure targeting the ${currencySymbol}250K annual threshold to unlock 8–10% discounts.`
                : `Your current pricing is below market — protect this position by locking in longer-term contracts (12–24 months) before the anticipated +${Math.round(norm.marginPercent * 0.3)}% price increase driven by input cost inflation.`}
          </div>
          <div className="text-xs font-medium text-[#4a9bbe]">
            Est. impact: {currencySymbol}{Math.round(norm.potentialSavings * 0.6).toLocaleString()} – {currencySymbol}{norm.potentialSavings.toLocaleString()} / yr
          </div>
        </div>

        <div className="grid grid-cols-1 @xl:grid-cols-2 gap-2.5">
          {[
            { label: "Timing", text: `Act within 30 days — market conditions favour ${norm.marginPercent > 30 ? "buyer leverage" : "locking current rates"}.` },
            { label: "Leverage", text: `Use ${annualQty.toLocaleString()} units/yr volume as primary negotiation lever for rebate tiers.` },
            { label: "Benchmarking", text: `Share regional price data (Asia Pacific avg ${currencySymbol}${Math.round(norm.quotePrice * 0.70)}) to anchor negotiation.` },
            { label: "Risk", text: "Dual-source minimum 20% to a secondary supplier to reduce single-source dependency risk." },
          ].map((s, i) => (
            <div key={`ai-${i}`} className="bg-white/5 rounded-md p-3.5">
              <div className="text-[9px] uppercase tracking-[0.08em] text-white/35 mb-1.5">{s.label}</div>
              <div className="text-xs text-white/70 leading-[1.55]">{s.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AICostIntelligenceAgent() {
  const { toast } = useToast();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const mention = useSupplierMentions({ scopeOfSupplyOnly: true });
  const {
    conversation,
    setConversation,
    newConversation,
    switchConversation,
    deleteConversation,
    groupedConversations,
    currentId,
  } = useAgentConversation("cost-intelligence");

  const [showCapabilities, setShowCapabilities] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Insight panels render open by default; track message indices the user has collapsed.
  const [openInsights, setOpenInsights] = useState<Set<number>>(new Set());
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel an in-flight agent query and finalize the streaming placeholder.
  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  // Simulated Trigger logs
  const [simulatedEvents, setSimulatedEvents] = useState<Array<{ time: string; event: string; status: string }>>([
    { time: "16:04:10", event: "Standard benchmark limits configured", status: "Ready" }
  ]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const toggleCategory = (module: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(module)) {
        newSet.delete(module);
      } else {
        newSet.add(module);
      }
      return newSet;
    });
  };

  const runStream = async (
    promptStr: string,
    history: ConversationMessage[],
    confirmAction?: { type: string; data: any },
    mentionPayload: {
      mentions?: SupplierMention[];
      businessUserMentions?: BusinessUserMention[];
      itemMentions?: ItemMention[];
      bidMentions?: BidMention[];
      prMentions?: PrMention[];
      poMentions?: PoMention[];
      invoiceMentions?: InvoiceMention[];
    } = {},
  ) => {
    setIsStreaming(true);
    const placeholderMsg: ConversationMessage = {
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true
    };

    if (!confirmAction) {
      setConversation(prev => [
        ...prev,
        {
          role: "user" as const,
          content: promptStr,
          timestamp: new Date(),
          mentions: mentionPayload.mentions,
          businessUserMentions: mentionPayload.businessUserMentions,
          itemMentions: mentionPayload.itemMentions,
          bidMentions: mentionPayload.bidMentions,
          prMentions: mentionPayload.prMentions,
          poMentions: mentionPayload.poMentions,
          invoiceMentions: mentionPayload.invoiceMentions,
        },
        placeholderMsg,
      ]);
      mention.reset();
    } else {
      setConversation(prev => [...prev, placeholderMsg]);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    await streamAgentQuery({
      endpoint: "/api/cost-intelligence-agent/query/stream",
      prompt: promptStr,
      conversationHistory: history.map(m => ({ role: m.role, content: m.content })),
      confirmAction,
      ...mentionPayload,
      signal: controller.signal,
      onToken: (token) => {
        setConversation(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: last.content + token };
          }
          return updated;
        });
      },
      onDone: (pendingAction) => {
        setConversation(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              isStreaming: false,
              pendingAction: pendingAction || undefined,
              actionStatus: pendingAction ? "pending" as const : undefined,
            };
          }
          return updated;
        });
        setIsStreaming(false);
        abortRef.current = null;
      },
      onError: (message) => {
        setConversation(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && last.isStreaming) {
            updated[updated.length - 1] = { ...last, content: message, isStreaming: false };
          } else {
            updated.push({ role: "assistant" as const, content: message, timestamp: new Date() });
          }
          return updated;
        });
        setIsStreaming(false);
        abortRef.current = null;
      },
      onAbort: () => {
        setConversation(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && last.isStreaming) {
            updated[updated.length - 1] = {
              ...last,
              isStreaming: false,
              content: last.content || "_Stopped._",
            };
          }
          return updated;
        });
        setIsStreaming(false);
        abortRef.current = null;
      },
    });
  };

  const handleSubmit = () => {
    if (!mention.prompt.trim() || isStreaming) return;
    runStream(mention.prompt, conversation, undefined, mention.streamMentions);
  };

  const handleDropdownSelect = (msgIndex: number, selectedItem: any) => {
    const msg = conversation[msgIndex];
    if (!msg.pendingAction) return;

    setConversation(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m));

    runStream("", conversation, {
      type: msg.pendingAction.type,
      data: {
        ...msg.pendingAction.data,
        originalPrompt: mention.prompt,
        selectedQuote: selectedItem
      }
    });
  };

  const handleSOSSelect = (msgIndex: number, selected: { type: "all" | "particular"; item?: any }) => {
    const msg = conversation[msgIndex];
    if (!msg.pendingAction) return;

    setConversation(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m));

    let promptStr = "";
    if (selected.type === "all") {
      promptStr = `Analyze all Scope of Supply items for supplier ${msg.pendingAction.data.supplierName} (ID: ${msg.pendingAction.data.supplierId})`;
    } else {
      const item = selected.item;
      promptStr = `Analyze supplier economics for item "${item.subCategory || item.serviceDetails}" (Code: ${item.subCategoryCode || item.goodServiceCode || ""}) for supplier ${msg.pendingAction.data.supplierName} (ID: ${msg.pendingAction.data.supplierId})`;
    }

    runStream(promptStr, conversation);
  };

  const handleGetEstimateClick = () => {
    setConversation(prev => [
      ...prev,
      {
        role: "assistant",
        content: "Please enter the parameters below to generate cost estimates.",
        timestamp: new Date(),
        pendingAction: {
          type: "input_parameters",
          data: {},
          summary: "Get Estimates - Input Parameters"
        },
        actionStatus: "pending"
      }
    ]);
  };

  const handleFormSubmit = (msgIndex: number, formData: any) => {
    const msg = conversation[msgIndex];
    if (!msg.pendingAction) return;

    // Set form message as confirmed
    setConversation(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m));

    const item = formData.itemService;
    const currency = formData.currency || "USD";
    const unitPrice = formData.unitPrice;
    const qty = formData.quantity;
    const freq = formData.orderFrequency;
    const country = formData.supplierCountry;
    const state = formData.supplierState;
    const supplierType = formData.supplierType;
    const deliveryLocation = [formData.deliveryCity, formData.deliveryCountry].filter(Boolean).join(", ");
    const deliveryCoords = (formData.deliveryLat != null && formData.deliveryLng != null)
      ? `${Number(formData.deliveryLat).toFixed(6)}, ${Number(formData.deliveryLng).toFixed(6)}`
      : "Not specified";

    const queryPrompt = `Generate supplier cost economics, margin, and cost structure analysis estimate for the following parameters:
- Item / Service: ${item}
- Currency: ${currency}
- Unit Price: ${currency} ${unitPrice}
- Quantity: ${qty}
- Order Frequency: ${freq}
- Supplier Country: ${country}
- Supplier State: ${state}
- Supplier Type: ${supplierType}
- Delivery Location: ${deliveryLocation || "Not specified"}
- Delivery Coordinates: ${deliveryCoords}
- Annual Volume: ${formData.annualVolume ?? ""} units
- Total Annual Spend: ${currency} ${formData.totalSpend ?? ""}`;

    // Call LLM backend streaming query
    runStream(queryPrompt, conversation);
  };

  const handleClearConversation = () => {
    newConversation();
    mention.reset();
  };

  const triggerSimulation = (simType: string) => {
    const timeNow = new Date().toTimeString().split(" ")[0];
    let promptMsg = "";
    let eventName = "";

    if (simType === "new_quote") {
      promptMsg = "Simulate a new quote received for Steel Sheet from ABC Steel, quote price $120";
      eventName = "Intercepted: New Quote Received (ABC Steel)";
    } else if (simType === "benchmark_exceed") {
      promptMsg = "Simulate supplier quote exceeds benchmark limits";
      eventName = "Alert: Quote exceeds benchmark threshold (+14%)";
    } else if (simType === "evaluation") {
      promptMsg = "Simulate bid entering evaluation stage";
      eventName = "Event: Bid enters evaluation lifecycle";
    } else if (simType === "negotiation") {
      promptMsg = "Simulate supplier selected for negotiation";
      eventName = "Trigger: Selected for automated negotiation prep";
    }

    setSimulatedEvents(prev => [...prev, { time: timeNow, event: eventName, status: "Intercepting..." }]);
    runStream(promptMsg, conversation);

    setTimeout(() => {
      setSimulatedEvents(prev =>
        prev.map(evt => evt.event === eventName ? { ...evt, status: "Cost Estimated" } : evt)
      );
    }, 1200);
  };

  return (
    <div className="px-4 pt-2 pb-3 flex flex-col overflow-hidden flex-1 min-h-0 h-full">
      {/* Top Header */}
      <div className="flex items-center justify-between flex-wrap gap-1 mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen((p) => !p)} data-testid="button-toggle-history">
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
          <Link href="/app/ai-intelligence-suite">
            <Button variant="ghost" size="icon" data-testid="button-back-ai-agents">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="p-1.5 rounded-md bg-cyan-100 dark:bg-cyan-900/30">
            <Brain className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Should Cost Intelligence Agent</h1>
          <Badge variant="outline" className="gap-1 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 font-semibold">
            <Sparkles className="h-3 w-3" />
            Cost Estimator Active
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-[11px] font-semibold text-red-500 border-red-200 bg-red-50/30 hover:bg-red-100/30 dark:bg-red-950/20 dark:border-red-900/45 dark:text-red-400 dark:hover:bg-red-950/30 transition-all hover:text-red-600 dark:hover:text-red-300 rounded"
            onClick={handleGetEstimateClick}
            disabled={isStreaming}
            data-testid="button-get-estimate"
          >
            Get Estimate
          </Button>
        </div>
        <CapabilitiesInfoButton capabilities={capabilities} />
      </div>

      <div className="flex-1 flex gap-3 min-h-0 max-h-full overflow-hidden relative">
        {/* Sidebar History */}
        {sidebarOpen && (
          <Card className="w-56 flex-shrink-0 flex flex-col min-h-0 hidden lg:flex">
            <CardContent className="p-0 flex flex-col h-full">
              <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
                <span className="text-sm font-semibold">History</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSidebarOpen(false)}>
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="p-2 flex-shrink-0">
                <Button variant="outline" size="sm" className="w-full gap-2 justify-start" onClick={handleClearConversation} data-testid="button-sidebar-new-chat">
                  <Plus className="h-3.5 w-3.5" />
                  New Chat
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-1 pb-2">
                {groupedConversations.map((group) => (
                  <div key={group.label} className="mb-2">
                    <div className="text-xs text-muted-foreground px-2 py-1 font-medium">{group.label}</div>
                    {group.items.map((conv) => (
                      <div
                        key={conv.id}
                        className={`group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer rounded-md hover:bg-muted transition-colors ${currentId === conv.id ? "bg-muted" : ""}`}
                        onClick={() => switchConversation(conv.id)}
                        data-testid={`conv-item-${conv.id}`}
                      >
                        <MessageSquare className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        <span className="flex-1 text-xs truncate">{conv.title || "New Chat"}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-shrink-0"
                          onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                          data-testid={`button-delete-conv-${conv.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Central Chat Interface */}
        <Card className="flex-1 flex flex-col min-h-0">
          <CardContent className="flex-1 p-4 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4" data-testid="chat-messages-cost-intel">
              {conversation.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="p-4 rounded-full bg-cyan-100 dark:bg-cyan-900/30 w-fit mx-auto mb-4">
                      <Brain className="h-10 w-10 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Should Cost Intelligence</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Estimate margins, examine supplier pricing components, and benchmark quotes against commodity curves and freight indices.
                    </p>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => { setExpandedCategories(new Set()); setShowCapabilities(true); }} data-testid="button-open-capabilities-empty">
                      <BookOpen className="h-4 w-4" />
                      Explore Capabilities
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {conversation.map((msg, i) => (
                    <div key={i}>
                      <div className={`flex gap-3 items-start ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role === "assistant" && (
                          <div className="w-8 h-8 rounded-full border border-stone-200/50 dark:border-stone-800 bg-[#fbfbfb] dark:bg-stone-900 flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                            <Bot className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                          </div>
                        )}
                        <div className={`p-3 max-w-[80%] shadow-sm ${msg.role === "user"
                          ? "bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900 font-medium rounded-2xl rounded-tr-sm border-none"
                          : "bg-white dark:bg-stone-900 border border-stone-200/60 dark:border-stone-850 rounded-2xl rounded-tl-sm"
                          }`}>
                          {msg.role === "assistant" ? (
                            msg.isStreaming && !msg.content ? (
                              <ThinkingTips />
                            ) : msg.isStreaming ? (
                              <p className="text-xs whitespace-pre-wrap">{msg.content}<span className="inline-block w-0.5 h-3 bg-current ml-0.5 align-middle animate-pulse" /></p>
                            ) : (
                              <>
                                <div
                                  className="text-sm leading-relaxed text-stone-850 dark:text-stone-200 [&_h3]:text-foreground [&_h4]:text-muted-foreground [&_strong]:text-foreground"
                                  dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                                />
                                {msg.pendingAction?.type === "cost_intelligence_insights" && (
                                  <div className="mt-2.5">
                                    <Button
                                      size="sm"
                                      onClick={() => setOpenInsights((prev) => {
                                        const next = new Set(prev);
                                        next.has(i) ? next.delete(i) : next.add(i);
                                        return next;
                                      })}
                                      className="bg-blue-600 hover:bg-blue-700 text-white font-mono text-[9px] tracking-wider uppercase px-3 h-7 font-bold rounded shadow-sm gap-1.5"
                                      data-testid="button-toggle-insights"
                                    >
                                      <TrendingDown className="h-3.5 w-3.5" />
                                      {openInsights.has(i) ? "Close Insights" : "Open Insights"}
                                    </Button>
                                  </div>
                                )}
                              </>
                            )
                          ) : (
                            <SourcingUserMessageBubbleContent
                              content={msg.content}
                              mentions={msg.mentions}
                              businessUserMentions={msg.businessUserMentions}
                              itemMentions={msg.itemMentions}
                              bidMentions={msg.bidMentions}
                              prMentions={msg.prMentions}
                              poMentions={msg.poMentions}
                              invoiceMentions={msg.invoiceMentions}
                            />
                          )}
                          <p className="text-[10px] opacity-40 mt-1.5 text-right font-mono">
                            {formatDate(msg.timestamp, true)}
                          </p>
                        </div>
                        {msg.role === "user" && (
                          <div className="w-8 h-8 rounded-full border border-stone-200/50 dark:border-stone-800 bg-[#fbfbfb] dark:bg-stone-900 flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                            <User className="h-4 w-4 text-stone-700 dark:text-stone-300" />
                          </div>
                        )}
                      </div>

                      {/* Dropdown Selector for Quote selection */}
                      {msg.pendingAction && msg.actionStatus === "pending" && msg.pendingAction.type === "select_quote" && (
                        <div className="ml-10 mt-2">
                          <DropdownQuoteSelectorCard
                            data={msg.pendingAction.data}
                            disabled={isStreaming}
                            onSelect={(item) => handleDropdownSelect(i, item)}
                          />
                        </div>
                      )}

                      {/* Dropdown Selector for SOS item selection */}
                      {msg.pendingAction && msg.actionStatus === "pending" && msg.pendingAction.type === "select_sos_items" && (
                        <div className="ml-10 mt-2">
                          <DropdownSOSItemSelectorCard
                            data={msg.pendingAction.data}
                            disabled={isStreaming}
                            onSelect={(selected) => handleSOSSelect(i, selected)}
                          />
                        </div>
                      )}

                      {/* Interactive Form Card for Input Parameters */}
                      {msg.pendingAction && msg.actionStatus === "pending" && msg.pendingAction.type === "input_parameters" && (
                        <div className="ml-10 mt-2">
                          <GetEstimatesFormCard
                            disabled={isStreaming}
                            onSubmit={(formData) => handleFormSubmit(i, formData)}
                          />
                        </div>
                      )}

                      {/* Inline Cost Intelligence Dashboard */}
                      {msg.pendingAction?.type === "cost_intelligence_insights" && openInsights.has(i) && (
                        <div className="ml-10 mt-2 max-w-[min(80%,880px)] @container">
                          <Card className="border-cyan-100 dark:border-cyan-900/40">
                            <CardHeader className="p-3 border-b flex flex-row items-center justify-between gap-2 bg-background">
                              <div className="flex items-center gap-2 min-w-0">
                                <TrendingDown className="h-4.5 w-4.5 text-cyan-600 flex-shrink-0" />
                                <CardTitle className="text-sm font-semibold">Cost Intelligence Panel</CardTitle>
                              </div>
                              <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={() => setOpenInsights((prev) => { const next = new Set(prev); next.delete(i); return next; })} data-testid="button-close-insights">
                                <X className="h-4 w-4" />
                              </Button>
                            </CardHeader>
                            <CardContent className="p-3 bg-stone-50/30 dark:bg-stone-950/20">
                              <CostIntelligenceDashboardView data={msg.pendingAction.data} />
                            </CardContent>
                          </Card>
                        </div>
                      )}

                      {/* Standalone Fair Market Cost card (supplier @mention flows —
                          no full costStructure/dashboard, just the should-cost range) */}
                      {msg.pendingAction?.type === "fmc_card" && (
                        <div className="ml-10 mt-2 max-w-[80%]">
                          <FairMarketCostCard
                            item={msg.pendingAction.data?.item}
                            currencySymbol={CURRENCY_SYMBOLS[String(msg.pendingAction.data?.currency || "USD").toUpperCase()] || "$"}
                            fmcMin={Number(msg.pendingAction.data?.fmcMin) || 0}
                            fmcMax={Number(msg.pendingAction.data?.fmcMax) || 0}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            <div className="relative w-full flex-shrink-0" ref={mention.composerRef}>
              <ChatComposer
                isCompact
                singleRow
                placeholder={`Ask Prokraya Ai ${AGENT_MENTION_PLACEHOLDER_HINT}`}
                {...mention.composerProps}
                ref={mention.inputRef}
                onSubmit={handleSubmit}
                onStop={stopStreaming}
                isStreaming={isStreaming}
                colorTheme="cyan"
                submitButtonClassName="rounded-full h-9 w-9"
                textareaDataTestId="input-cost-prompt"
                submitDataTestId="button-cost-submit"
                onMicTranscript={(t) => mention.setPromptText((mention.composerProps.value ? mention.composerProps.value + " " + t : t))}
                leftActions={
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-full flex-shrink-0"
                        data-testid="button-composer-plus"
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top" className="min-w-[220px] rounded-xl p-1.5">
                      <DropdownMenuItem
                        className="gap-3 px-3 py-2.5 text-sm font-medium cursor-pointer rounded-lg"
                        onClick={() => {
                          setShowCapabilities((prev) => {
                            if (!prev) setExpandedCategories(new Set());
                            return !prev;
                          });
                        }}
                        data-testid="button-toggle-capabilities"
                      >
                        <BookOpen className="h-4 w-4" />
                        Explore
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-3 px-3 py-2.5 text-sm font-medium cursor-pointer rounded-lg"
                        onClick={handleClearConversation}
                        data-testid="button-new-chat"
                      >
                        <MessageSquare className="h-4 w-4" />
                        New Chat
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              />
              {mention.dropdown}
            </div>
          </CardContent>
        </Card>

        {/* Explore Capabilities */}
        {showCapabilities && (
          <Card className="w-[275px] flex-shrink-0 flex flex-col min-h-0 max-h-full hidden md:flex">
            <CardContent className="p-0 flex flex-col h-full">
              <div className="flex items-center justify-between gap-2 p-3 border-b flex-shrink-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                  <h3 className="font-semibold text-sm">Explore Capabilities</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowCapabilities(false)} data-testid="button-close-capabilities">
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              </div>
              <div className="px-3 py-2 border-b flex-shrink-0">
                <p className="text-xs text-muted-foreground">Select a standard query or simulation trigger below:</p>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1.5 custom-scrollbar min-h-0">
                {costIntelligenceAgentPrompts.map((category) => (
                  <div key={category.module} className="border rounded-md">
                    <Button
                      variant="ghost"
                      onClick={() => toggleCategory(category.module)}
                      className="w-full flex items-center justify-between gap-2 h-auto py-2 px-3"
                      data-testid={`button-category-${category.module}`}
                    >
                      <div className="flex items-center gap-2">
                        {expandedCategories.has(category.module) ? (
                          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
                        )}
                        <span className="font-medium text-xs">{category.module}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {category.prompts.length}
                      </Badge>
                    </Button>
                    {expandedCategories.has(category.module) && (
                      <div className="px-3 pb-2 pt-1 border-t space-y-1 bg-muted/30">
                        {category.prompts.map((p, idx) => (
                          <Button
                            key={idx}
                            variant="outline"
                            size="sm"
                            className="w-full justify-start text-[11px] h-auto py-1.5 text-left whitespace-normal leading-tight"
                            onClick={() => {
                              if (category.module.includes("Simulation")) {
                                const actionMap: Record<string, string> = {
                                  "Simulate a new quote received": "new_quote",
                                  "Simulate quote exceeds benchmark": "benchmark_exceed",
                                  "Simulate bid entering evaluation": "evaluation",
                                  "Simulate supplier selected for negotiation": "negotiation"
                                };
                                const trigger = Object.keys(actionMap).find(k => p.startsWith(k));
                                if (trigger) triggerSimulation(actionMap[trigger]);
                              } else {
                                mention.setPromptText(p);
                              }
                            }}
                            data-testid={`button-prompt-${category.module}-${idx}`}
                          >
                            {p}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
