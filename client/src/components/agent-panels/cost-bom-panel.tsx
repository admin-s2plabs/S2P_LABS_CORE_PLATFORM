// Profit Margin Chain / Cost-of-Manufacturing build-up / Bill of Materials /
// Cost Distribution donut for the Should Cost Intelligence agent.
//
// Every cost number here comes from FMC (Fair Market Cost) — the bottom-up
// should-cost produced by `estimateFairMarketCost()` in
// server/services/cost-intelligence-agent-service.ts, an isolated LLM call
// that is never told the quoted price. The quote appears only where it is
// genuinely the subject: the "you pay" tile, the supplier-margin gap, and
// the Rate Sold footer. Nothing is back-solved out of the quote — when FMC
// is unavailable the affected sections say so rather than falling back.
//
// `detectCategory` / `detectUOM` remain client-side heuristics, used only
// for the category pill and the UOM label.
import { useState } from "react";
import { PieChart, Pie, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowRight, ChevronDown, ChevronRight as ChevronRightIcon } from "lucide-react";
import { INTEL_FONT } from "./intel-theme";

// ── Category detection ─────────────────────────────────────────────────────

type Category =
  | "hardware" | "electronics" | "chemical" | "textile"
  | "food" | "machinery" | "packaging" | "plastics" | "general";

function detectCategory(item: string): Category {
  const s = item.toLowerCase();
  if (/fastener|bolt|screw|nut|washer|bracket|fitting|valve|pipe|tube|rod|bar|steel|alumin|iron|copper|brass|metal|cast|forge|stamp|bearing|spring|gear|shaft|flange|hinge|rivet/.test(s)) return "hardware";
  if (/pcb|electronic|circuit|module|sensor|chip|led|resistor|capacitor|battery|motor|controller|semiconductor|display|transistor|ic |processor|relay|diode|switch|connector/.test(s)) return "electronics";
  if (/chemical|powder|resin|polymer|adhesive|coating|paint|oil|lubricant|solvent|acid|pigment|dye|catalyst|compound|gel|epoxy|surfact/.test(s)) return "chemical";
  if (/fabric|textile|yarn|thread|cloth|fiber|cotton|polyester|wool|linen|nylon|knit|woven|denim|fleece|velvet/.test(s)) return "textile";
  if (/food|grain|sugar|flour|coffee|cocoa|soy|wheat|spice|dairy|fruit|vegetable|meat|rice|cereal|beverage|snack|oil|fat/.test(s)) return "food";
  if (/machine|pump|compressor|generator|conveyor|press|equipment|tool|device|instrument|actuator|cylinder|turbine|drill|lathe/.test(s)) return "machinery";
  if (/package|box|carton|bag|container|bottle|pouch|label|wrap|pallet|crate|sachet|blister/.test(s)) return "packaging";
  if (/plastic|rubber|foam|pvc|abs|pp |pe |hdpe|ldpe|nylon|acrylic|silicone|elastomer/.test(s)) return "plastics";
  return "general";
}

const CATEGORY_LABELS: Record<Category, string> = {
  hardware: "Industrial Hardware", electronics: "Electronics", chemical: "Chemicals",
  textile: "Textiles", food: "Food / Agriculture", machinery: "Machinery & Equipment",
  packaging: "Packaging", plastics: "Plastics & Rubber", general: "General Goods",
};

// ── UOM detection ────────────────────────────────────────────────────────

function detectUOM(cat: Category, item: string): { uom: string; uomFull: string } {
  const s = item.toLowerCase();
  if (/per kg|per ton|per mt|\/kg/.test(s) || ["chemical", "food"].includes(cat))
    return { uom: "kg", uomFull: "Kilogram (kg)" };
  if (/per m\b|per meter|per metre|\/m\b/.test(s) || cat === "textile")
    return { uom: "m", uomFull: "Metre (m)" };
  if (/per l\b|per lit|litre|liter|\/l\b/.test(s))
    return { uom: "L", uomFull: "Litre (L)" };
  if (/per m2|m²|sheet|panel|board/.test(s))
    return { uom: "m²", uomFull: "Sq. Metre (m²)" };
  if (/set|kit|assembly/.test(s))
    return { uom: "set", uomFull: "Set / Assembly" };
  if (cat === "machinery") return { uom: "unit", uomFull: "Unit" };
  return { uom: "pcs", uomFull: "Piece (pcs)" };
}

// ── BOM templates per category ──────────────────────────────────────────

type BOMGroup = "direct-material" | "direct-labour" | "overhead" | "operating" | "compliance";

interface BOMLine {
  name: string;
  group: BOMGroup;
  pct: number;       // % of manufacturing COGS
  shouldPct: number; // benchmark %
}

// DEAD as of the FMC-derived BOM: no remaining reader — the Bill of Materials
// is now built from the LLM's should-cost components. Kept for one release in
// case the FMC path needs to be reverted; remove once it has soaked.
const BOM_TEMPLATES: Record<Category, BOMLine[]> = {
  hardware: [
    { name: "Raw Materials",              group: "direct-material", pct: 34,  shouldPct: 30   },
    { name: "Components",                 group: "direct-material", pct: 6,   shouldPct: 5.5  },
    { name: "Consumables",                group: "direct-material", pct: 2,   shouldPct: 1.5  },
    { name: "Direct Labour",              group: "direct-labour",   pct: 17,  shouldPct: 13   },
    { name: "Machine Cost",               group: "direct-labour",   pct: 12,  shouldPct: 11   },
    { name: "Utilities",                  group: "overhead",        pct: 5,   shouldPct: 4    },
    { name: "Manufacturing Overheads",    group: "overhead",        pct: 8,   shouldPct: 7    },
    { name: "Quality Control",            group: "overhead",        pct: 4,   shouldPct: 3.5  },
    { name: "Packaging",                  group: "overhead",        pct: 3,   shouldPct: 2.5  },
    { name: "Logistics",                  group: "operating",       pct: 3.5, shouldPct: 2.8  },
    { name: "Procurement",                group: "operating",       pct: 1.5, shouldPct: 1.2  },
    { name: "Finance Costs",              group: "operating",       pct: 1,   shouldPct: 0.8  },
    { name: "Compliance",                 group: "compliance",      pct: 1.5, shouldPct: 1.5  },
    { name: "Taxes & Duties",             group: "compliance",      pct: 1.5, shouldPct: 1.5  },
  ],
  electronics: [
    { name: "Raw Materials",              group: "direct-material", pct: 15,  shouldPct: 13   },
    { name: "Components",                 group: "direct-material", pct: 25,  shouldPct: 21   },
    { name: "Consumables",                group: "direct-material", pct: 2,   shouldPct: 1.5  },
    { name: "Direct Labour",              group: "direct-labour",   pct: 11,  shouldPct: 9    },
    { name: "Machine Cost",               group: "direct-labour",   pct: 8,   shouldPct: 7    },
    { name: "Utilities",                  group: "overhead",        pct: 3,   shouldPct: 2.5  },
    { name: "Manufacturing Overheads",    group: "overhead",        pct: 5,   shouldPct: 4.5  },
    { name: "Quality Control",            group: "overhead",        pct: 7,   shouldPct: 6    },
    { name: "Packaging",                  group: "overhead",        pct: 2,   shouldPct: 1.8  },
    { name: "Engineering & Development",  group: "operating",       pct: 8,   shouldPct: 7    },
    { name: "Logistics",                  group: "operating",       pct: 4,   shouldPct: 3    },
    { name: "Procurement",                group: "operating",       pct: 2,   shouldPct: 1.5  },
    { name: "Finance Costs",              group: "operating",       pct: 2,   shouldPct: 1.5  },
    { name: "After-Sales Support",        group: "operating",       pct: 2,   shouldPct: 1.8  },
    { name: "Compliance",                 group: "compliance",      pct: 3,   shouldPct: 3    },
    { name: "Taxes & Duties",             group: "compliance",      pct: 1,   shouldPct: 1    },
  ],
  chemical: [
    { name: "Raw Materials",              group: "direct-material", pct: 44,  shouldPct: 40   },
    { name: "Consumables",                group: "direct-material", pct: 3,   shouldPct: 2.5  },
    { name: "Direct Labour",              group: "direct-labour",   pct: 8,   shouldPct: 6.5  },
    { name: "Machine Cost",               group: "direct-labour",   pct: 6,   shouldPct: 5.5  },
    { name: "Utilities",                  group: "overhead",        pct: 9,   shouldPct: 7.5  },
    { name: "Manufacturing Overheads",    group: "overhead",        pct: 7,   shouldPct: 6    },
    { name: "Quality Control",            group: "overhead",        pct: 5,   shouldPct: 4.5  },
    { name: "Packaging",                  group: "overhead",        pct: 4,   shouldPct: 3.5  },
    { name: "Logistics",                  group: "operating",       pct: 4,   shouldPct: 3.5  },
    { name: "Engineering & Development",  group: "operating",       pct: 3,   shouldPct: 2.5  },
    { name: "Finance Costs",              group: "operating",       pct: 2,   shouldPct: 1.5  },
    { name: "Compliance",                 group: "compliance",      pct: 4,   shouldPct: 4    },
    { name: "Taxes & Duties",             group: "compliance",      pct: 1,   shouldPct: 1    },
  ],
  textile: [
    { name: "Raw Materials",              group: "direct-material", pct: 40,  shouldPct: 36   },
    { name: "Consumables",                group: "direct-material", pct: 3,   shouldPct: 2.5  },
    { name: "Direct Labour",              group: "direct-labour",   pct: 21,  shouldPct: 17   },
    { name: "Machine Cost",               group: "direct-labour",   pct: 8,   shouldPct: 7    },
    { name: "Utilities",                  group: "overhead",        pct: 5,   shouldPct: 4    },
    { name: "Manufacturing Overheads",    group: "overhead",        pct: 6,   shouldPct: 5.5  },
    { name: "Quality Control",            group: "overhead",        pct: 4,   shouldPct: 3.5  },
    { name: "Packaging",                  group: "overhead",        pct: 3,   shouldPct: 2.5  },
    { name: "Logistics",                  group: "operating",       pct: 4,   shouldPct: 3.5  },
    { name: "Procurement",                group: "operating",       pct: 1.5, shouldPct: 1.2  },
    { name: "Finance Costs",              group: "operating",       pct: 1.5, shouldPct: 1.2  },
    { name: "Compliance",                 group: "compliance",      pct: 2,   shouldPct: 2    },
    { name: "Taxes & Duties",             group: "compliance",      pct: 1,   shouldPct: 1    },
  ],
  food: [
    { name: "Raw Materials",              group: "direct-material", pct: 47,  shouldPct: 43   },
    { name: "Consumables",                group: "direct-material", pct: 3,   shouldPct: 2.5  },
    { name: "Direct Labour",              group: "direct-labour",   pct: 9,   shouldPct: 7.5  },
    { name: "Machine Cost",               group: "direct-labour",   pct: 5,   shouldPct: 4.5  },
    { name: "Utilities",                  group: "overhead",        pct: 8,   shouldPct: 6.5  },
    { name: "Manufacturing Overheads",    group: "overhead",        pct: 5,   shouldPct: 4.5  },
    { name: "Quality Control",            group: "overhead",        pct: 5,   shouldPct: 4.5  },
    { name: "Packaging",                  group: "overhead",        pct: 5,   shouldPct: 4.5  },
    { name: "Logistics",                  group: "operating",       pct: 5,   shouldPct: 4    },
    { name: "Compliance",                 group: "compliance",      pct: 5,   shouldPct: 5    },
    { name: "Taxes & Duties",             group: "compliance",      pct: 3,   shouldPct: 3    },
  ],
  machinery: [
    { name: "Raw Materials",              group: "direct-material", pct: 24,  shouldPct: 21   },
    { name: "Components",                 group: "direct-material", pct: 21,  shouldPct: 18   },
    { name: "Consumables",                group: "direct-material", pct: 2,   shouldPct: 1.5  },
    { name: "Direct Labour",              group: "direct-labour",   pct: 14,  shouldPct: 11   },
    { name: "Machine Cost",               group: "direct-labour",   pct: 7,   shouldPct: 6.5  },
    { name: "Utilities",                  group: "overhead",        pct: 4,   shouldPct: 3.5  },
    { name: "Manufacturing Overheads",    group: "overhead",        pct: 7,   shouldPct: 6    },
    { name: "Quality Control",            group: "overhead",        pct: 5,   shouldPct: 4.5  },
    { name: "Packaging",                  group: "overhead",        pct: 2,   shouldPct: 1.8  },
    { name: "Engineering & Development",  group: "operating",       pct: 6,   shouldPct: 5    },
    { name: "Logistics",                  group: "operating",       pct: 3,   shouldPct: 2.5  },
    { name: "After-Sales Support",        group: "operating",       pct: 3,   shouldPct: 2.5  },
    { name: "Compliance",                 group: "compliance",      pct: 1,   shouldPct: 1    },
    { name: "Taxes & Duties",             group: "compliance",      pct: 1,   shouldPct: 1    },
  ],
  packaging: [
    { name: "Raw Materials",              group: "direct-material", pct: 37,  shouldPct: 33   },
    { name: "Consumables",                group: "direct-material", pct: 3,   shouldPct: 2.5  },
    { name: "Direct Labour",              group: "direct-labour",   pct: 15,  shouldPct: 12   },
    { name: "Machine Cost",               group: "direct-labour",   pct: 12,  shouldPct: 11   },
    { name: "Utilities",                  group: "overhead",        pct: 6,   shouldPct: 5    },
    { name: "Manufacturing Overheads",    group: "overhead",        pct: 8,   shouldPct: 7    },
    { name: "Quality Control",            group: "overhead",        pct: 4,   shouldPct: 3.5  },
    { name: "Logistics",                  group: "operating",       pct: 5,   shouldPct: 4    },
    { name: "Finance Costs",              group: "operating",       pct: 2,   shouldPct: 1.5  },
    { name: "Procurement",                group: "operating",       pct: 2,   shouldPct: 1.5  },
    { name: "Compliance",                 group: "compliance",      pct: 3,   shouldPct: 3    },
    { name: "Taxes & Duties",             group: "compliance",      pct: 3,   shouldPct: 3    },
  ],
  plastics: [
    { name: "Raw Materials",              group: "direct-material", pct: 38,  shouldPct: 34   },
    { name: "Consumables",                group: "direct-material", pct: 3,   shouldPct: 2.5  },
    { name: "Direct Labour",              group: "direct-labour",   pct: 14,  shouldPct: 11   },
    { name: "Machine Cost",               group: "direct-labour",   pct: 13,  shouldPct: 12   },
    { name: "Utilities",                  group: "overhead",        pct: 8,   shouldPct: 6.5  },
    { name: "Manufacturing Overheads",    group: "overhead",        pct: 7,   shouldPct: 6    },
    { name: "Quality Control",            group: "overhead",        pct: 4,   shouldPct: 3.5  },
    { name: "Packaging",                  group: "overhead",        pct: 2,   shouldPct: 1.8  },
    { name: "Logistics",                  group: "operating",       pct: 4,   shouldPct: 3.5  },
    { name: "Engineering & Development",  group: "operating",       pct: 2,   shouldPct: 1.8  },
    { name: "Finance Costs",              group: "operating",       pct: 2,   shouldPct: 1.5  },
    { name: "Compliance",                 group: "compliance",      pct: 2,   shouldPct: 2    },
    { name: "Taxes & Duties",             group: "compliance",      pct: 1,   shouldPct: 1    },
  ],
  general: [
    { name: "Raw Materials",              group: "direct-material", pct: 33,  shouldPct: 29   },
    { name: "Components",                 group: "direct-material", pct: 5,   shouldPct: 4.5  },
    { name: "Consumables",                group: "direct-material", pct: 2,   shouldPct: 1.5  },
    { name: "Direct Labour",              group: "direct-labour",   pct: 15,  shouldPct: 12   },
    { name: "Machine Cost",               group: "direct-labour",   pct: 10,  shouldPct: 9    },
    { name: "Utilities",                  group: "overhead",        pct: 5,   shouldPct: 4    },
    { name: "Manufacturing Overheads",    group: "overhead",        pct: 8,   shouldPct: 7    },
    { name: "Quality Control",            group: "overhead",        pct: 4,   shouldPct: 3.5  },
    { name: "Packaging",                  group: "overhead",        pct: 3,   shouldPct: 2.5  },
    { name: "Logistics",                  group: "operating",       pct: 4,   shouldPct: 3.5  },
    { name: "Procurement",                group: "operating",       pct: 2,   shouldPct: 1.5  },
    { name: "Finance Costs",              group: "operating",       pct: 2,   shouldPct: 1.5  },
    { name: "Compliance",                 group: "compliance",      pct: 2,   shouldPct: 2    },
    { name: "Taxes & Duties",             group: "compliance",      pct: 3,   shouldPct: 3    },
    { name: "Contingency / Risk",         group: "operating",       pct: 2,   shouldPct: 1.5  },
  ],
};

const GROUP_LABELS: Record<BOMGroup, string> = {
  "direct-material": "Direct Material",
  "direct-labour":   "Direct Labour",
  "overhead":        "Manufacturing Overhead",
  "operating":       "Operating Cost",
  "compliance":      "Compliance & Tax",
};

const GROUP_ORDER: BOMGroup[] = ["direct-material", "direct-labour", "overhead", "operating", "compliance"];

const GROUP_DOT_COLOR: Record<BOMGroup, string> = {
  "direct-material": "#1e3a5f",
  "direct-labour":   "#2d6a8f",
  "overhead":        "#4a9bbe",
  "operating":       "#7fbdd6",
  "compliance":      "#b8d4e3",
};

// LLM should-cost component names are free text, so bucket them into the five
// display groups. First matching rule wins; the order reproduces the previous
// display convention (packaging + quality/scrap read as overhead, freight as
// operating, energy/machine as labour). Unknown names fall to overhead so the
// table still totals correctly without inflating direct material.
// ponytail: regex mapping, sufficient for the eight names the server prompt
// asks for — raw material→direct-material, labour→direct-labour,
// energy/machine→direct-labour, packaging→overhead, overhead→overhead,
// quality/scrap→overhead, inbound freight→operating, outbound freight→
// operating. Upgrade to a server-supplied group field if names drift.
const COMPONENT_GROUP_RULES: Array<[RegExp, BOMGroup]> = [
  [/labour|labor|wage|worker|conversion|assembly|machin|energy|power|electric|fuel|tooling/, "direct-labour"],
  [/freight|logistic|shipping|transport|handling|delivery|inbound|outbound|warehous|distribut/, "operating"],
  [/complian|certif|regulat|licen|tariff|customs|duty|duties|\btax/, "compliance"],
  [/overhead|utilit|plant|factory|facility|deprecia|rent|indirect|quality|scrap|reject|yield|inspect|test|packag/, "overhead"],
  [/material|raw|resin|steel|metal|alloy|polymer|component|part|ingredient|consumable|substrate|fabric|chemical/, "direct-material"],
];

function groupForComponent(name: string): BOMGroup {
  const s = name.toLowerCase();
  return COMPONENT_GROUP_RULES.find(([re]) => re.test(s))?.[1] ?? "overhead";
}

// ── Margin chain ─────────────────────────────────────────────────────────

interface MarginNode {
  key: string;
  label: string;
  sublabel: string;
  margin: number;
  buyPrice: number;
  sellPrice: number;
  show: boolean;
}

// Two visible nodes: what the item costs to make and ship (FMC), and the gap
// to what the supplier charges. The intermediary nodes stay in the array so
// the MarginNode shape and the render loop are unchanged, but they are never
// shown — FMC already contains inbound and outbound freight, so a separate
// "Selling & Delivery" node would double-count it.
function buildMarginChain(unitPrice: number, cogs: number): MarginNode[] {
  const supplierMargin = unitPrice - cogs;

  return [
    { key: "factory", label: "Factory / Producer", sublabel: "FMC bottom-up should-cost", margin: Math.round((cogs / unitPrice) * 100), buyPrice: cogs, sellPrice: cogs, show: true },
    { key: "distributor", label: "Distributor", sublabel: "Distribution margin", margin: 0, buyPrice: cogs, sellPrice: cogs, show: false },
    { key: "wholesaler", label: "Wholesaler", sublabel: "Wholesale margin", margin: 0, buyPrice: cogs, sellPrice: cogs, show: false },
    { key: "selling", label: "Selling & Delivery", sublabel: "Included in FMC", margin: 0, buyPrice: cogs, sellPrice: cogs, show: false },
    { key: "netprofit", label: "Supplier Margin", sublabel: "Quoted price − FMC", margin: Math.round((supplierMargin / unitPrice) * 100), buyPrice: 0, sellPrice: supplierMargin, show: true },
  ];
}

// ── Sub-components ───────────────────────────────────────────────────────

function Pill({ children, subtle }: { children: React.ReactNode; subtle?: boolean }) {
  return (
    <span
      className={`font-['Google_Sans'] text-[10px] tracking-[0.06em] uppercase px-[9px] py-[3px] rounded whitespace-nowrap ${subtle ? "bg-[#f5f5f4] text-[#888888]" : "bg-[#1a1a18] text-white"}`}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-['Google_Sans'] text-[10px] tracking-[0.1em] uppercase text-[#bbbbbb] mb-3">{children}</div>;
}

// ── Main component ───────────────────────────────────────────────────────

interface Props {
  item: string;
  unitPrice: number;
  uom?: string;
  fmcMin?: number;
  fmcMax?: number;
  fmcPrice?: number;
  fmcComponents?: Array<{ component: string; cost: number }>;
  supplierType: string;
  annualQty: number;
  isBidQuoted?: boolean;
  currencySymbol: string;
}

export function CostBomPanel({ item, unitPrice, uom: uomProp, fmcMin, fmcMax, fmcPrice, fmcComponents, supplierType, annualQty, isBidQuoted = false, currencySymbol }: Props) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(GROUP_ORDER));

  if (!(unitPrice > 0)) return null;

  const isPrimary = /primary|manufacturer/i.test(supplierType);
  const cat      = detectCategory(item);
  // Item-specific UOM from the analysis payload (quote line / LLM) wins over
  // the client-side regex guess.
  const detected = detectUOM(cat, item);
  const UOM_LABELS: Record<string, string> = {
    kg: "Kilogram (kg)", mt: "Metric Ton (MT)", g: "Gram (g)", l: "Litre (L)", ml: "Millilitre (mL)",
    m: "Metre (m)", "m²": "Sq. Metre (m²)", m2: "Sq. Metre (m²)", "m³": "Cubic Metre (m³)", m3: "Cubic Metre (m³)",
    ft: "Foot (ft)", pcs: "Piece (pcs)", set: "Set / Assembly", unit: "Unit", pair: "Pair", roll: "Roll",
    sheet: "Sheet", box: "Box", bag: "Bag", drum: "Drum", ream: "Ream",
  };
  const uom = uomProp || detected.uom;
  const uomFull = uomProp ? (UOM_LABELS[uomProp.toLowerCase()] || uomProp) : detected.uomFull;

  // The should-cost lines are the only cost input. No rescaling, no
  // quote-anchored fallback: whatever the isolated FMC call returned is what
  // gets displayed.
  const fmcLines = (fmcComponents || [])
    .filter((c) => c && c.component && Number(c.cost) > 0)
    .map((c) => ({ name: c.component, group: groupForComponent(c.component), cost: +Number(c.cost).toFixed(2) }));
  const fmcLinesTotal = +fmcLines.reduce((s, l) => s + l.cost, 0).toFixed(2);
  const bandMid = fmcMin && fmcMax && fmcMin > 0 && fmcMax >= fmcMin ? (fmcMin + fmcMax) / 2 : 0;

  // COGS is the FMC should-cost total — always. Never unitPrice / anything.
  const cogs = fmcLinesTotal > 0 ? fmcLinesTotal : (fmcPrice && fmcPrice > 0 ? fmcPrice : bandMid);
  const hasBom = fmcLines.length > 0;

  const supplierLabel = isPrimary ? "Manufacturer" : "Distributor";

  const PIE_SHADES = [
    "#1e3a5f", "#fcd34d", "#555552", "#4a9bbe", "#1a1a18", "#fde68a",
    "#2d6a8f", "#a0a09e", "#8ec6db", "#fef9c3", "#0d1b2a", "#d4d4d2",
  ];

  // No FMC at all — say so rather than inventing a cost from the quote.
  if (!(cogs > 0)) {
    return (
      <div className="bg-white border border-[#ebebeb] rounded-lg p-[24px_28px]">
        <div className="font-['Google_Sans'] text-[15px] font-semibold text-[#1a1a18]">Should Cost Intelligence</div>
        <div className="font-['Google_Sans'] text-xs text-[#aaaaaa] mt-0.5 mb-4">{item || "Product"}</div>
        <div className="bg-[#fafafa] border border-[#ebebeb] rounded-md p-4">
          <div className="font-['Google_Sans'] text-xs font-medium text-[#1a1a18]">Fair Market Cost unavailable</div>
          <div className="font-['Google_Sans'] text-[11px] text-[#888888] mt-1 leading-relaxed">
            No bottom-up should-cost estimate was returned for this item, so the cost-of-manufacturing
            breakdown cannot be shown. Nothing here is derived from the quoted price.
          </div>
        </div>
      </div>
    );
  }

  const chain    = buildMarginChain(unitPrice, cogs);
  const visChain = chain.filter((n) => n.show);

  // Should-cost target is the low end of the FMC band (efficient plant,
  // favourable input costs) — a real, item-specific spread, unlike the old
  // fixed percentage haircut.
  const totalActual      = cogs;
  const hasBand          = !!(fmcMin && fmcMin > 0 && fmcMin < cogs);
  const totalShouldCost  = hasBand ? fmcMin : cogs;
  const totalVariance    = +(totalActual - totalShouldCost).toFixed(2);
  const totalVariancePct = totalActual > 0 ? ((totalVariance / totalActual) * 100).toFixed(1) : "0.0";

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    label: GROUP_LABELS[g],
    lines: fmcLines.filter((l) => l.group === g),
  })).filter((g) => g.lines.length > 0);

  const chartData = fmcLines.map((l, i) => ({
    name: l.name.length > 14 ? l.name.slice(0, 13) + "…" : l.name,
    fullName: l.name,
    cost: l.cost,
    fill: PIE_SHADES[i % PIE_SHADES.length],
  }));

  const supplierMargin = +(unitPrice - cogs).toFixed(2);

  const buildUpLines = hasBom
    ? fmcLines.map((l, i) => ({ name: l.name, value: l.cost, color: PIE_SHADES[i % PIE_SHADES.length] }))
    : [{ name: "Fair Market Cost (FMC)", value: +cogs.toFixed(2), color: PIE_SHADES[0] }];

  return (
    <div className="bg-white border border-[#ebebeb] rounded-lg p-[24px_28px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2.5">
        <div>
          <div className="font-['Google_Sans'] text-[15px] font-semibold text-[#1a1a18]">Should Cost Intelligence</div>
          <div className="font-['Google_Sans'] text-xs text-[#aaaaaa] mt-0.5">{item || "Product"} · {CATEGORY_LABELS[cat]}</div>
        </div>
        <div className="flex items-center gap-2">
          <Pill subtle>{CATEGORY_LABELS[cat]}</Pill>
          <div className="flex items-center gap-1.5 bg-[#f5f5f4] border border-[#ebebeb] rounded-md px-2.5 py-1">
            <span className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.08em]">UOM</span>
            <span className="font-['Google_Sans'] text-xs font-medium text-[#1a1a18]">{uomFull}</span>
          </div>
        </div>
      </div>

      {/* Margin Chain */}
      <div className="mb-6">
        <SectionLabel>Profit Margin Chain</SectionLabel>
        <div className="flex items-stretch gap-0 overflow-x-auto">
          {visChain.map((node, i) => {
            const isNetProfit = node.key === "netprofit";
            const isLast = i === visChain.length - 1;
            return (
              <div key={node.key} className={`flex items-center ${isNetProfit ? "flex-none" : "flex-1"}`}>
                <div
                  className={`flex-1 p-[14px_16px] min-w-[110px] border ${isNetProfit ? "bg-[#1a1a18] border-[#1a1a18]" : i === 0 ? "bg-[#fafafa] border-[#ebebeb]" : "bg-white border-[#ebebeb]"}`}
                  style={{ borderRadius: i === 0 ? "6px 0 0 6px" : isLast ? "0 6px 6px 0" : 0, borderLeft: i > 0 ? "none" : undefined }}
                >
                  <div className={`font-['Google_Sans'] text-[9px] uppercase tracking-[0.08em] mb-1.5 ${isNetProfit ? "text-white/45" : "text-[#bbbbbb]"}`}>
                    {node.label}
                  </div>
                  <div className={`font-['Google_Sans'] text-lg font-medium leading-none ${isNetProfit ? "text-white" : "text-[#1a1a18]"}`}>
                    {node.margin}%
                  </div>
                  <div className={`font-['Google_Sans'] text-[10px] mt-1.5 ${isNetProfit ? "text-white/40" : "text-[#aaaaaa]"}`}>
                    {isNetProfit
                      ? `${currencySymbol}${node.sellPrice.toFixed(2)} / ${uom}`
                      : node.key === "factory"
                        ? `FMC: ${currencySymbol}${node.buyPrice.toFixed(2)}`
                        : `+${currencySymbol}${(node.sellPrice - node.buyPrice).toFixed(2)}`}
                  </div>
                  <div className={`font-['Google_Sans'] text-[9px] mt-0.5 ${isNetProfit ? "text-white/30" : "text-[#cccccc]"}`}>
                    {node.sublabel}
                  </div>
                </div>
                {!isLast && <ArrowRight size={14} color="#cccccc" className="flex-shrink-0 -mx-px z-[1]" />}
              </div>
            );
          })}
        </div>

        <div className="grid gap-2 mt-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          {[
            { label: "Quoted price (you pay)", value: `${currencySymbol}${unitPrice.toFixed(2)} / ${uom}` },
            { label: "Fair Market Cost (FMC)", value: `${currencySymbol}${cogs.toFixed(2)} / ${uom}` },
            { label: "FMC as % of quoted price", value: `${((cogs / unitPrice) * 100).toFixed(0)}%` },
            { label: "Supplier margin (quote − FMC)", value: `${(((unitPrice - cogs) / unitPrice) * 100).toFixed(1)}%` },
          ].map((m, i) => (
            <div key={`ms-${i}`} className="bg-[#fafafa] border border-[#ebebeb] rounded-md p-[8px_12px]">
              <div className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.07em] mb-1">{m.label}</div>
              <div className="font-['Google_Sans'] text-[13px] font-medium text-[#1a1a18]">{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cost Build-up */}
      <div className="mb-6">
        <SectionLabel>Cost of Manufacturing (FMC) → Rate Sold</SectionLabel>
        <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-5 items-start">
          <div>
            {buildUpLines.map((d, i) => {
              const pct = (d.value / cogs) * 100;
              return (
                <div key={`bu-${i}`} className="mb-1.5">
                  <div className="flex justify-between mb-[3px] gap-2">
                    <span className="font-['Google_Sans'] text-xs text-[#444444] truncate" title={d.name}>{d.name}</span>
                    <span className="font-['Google_Sans'] text-xs text-[#1a1a18] flex-shrink-0">{currencySymbol}{d.value.toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: d.color }} />
                  </div>
                  <div className="font-['Google_Sans'] text-[9px] text-[#cccccc] mt-0.5">{pct.toFixed(1)}% of FMC</div>
                </div>
              );
            })}

            <div className="border-t border-[#ebebeb] mt-2.5 pt-2.5 flex justify-between">
              <span className="font-['Google_Sans'] text-xs font-semibold text-[#1a1a18]">Total FMC (cost to make + ship)</span>
              <span className="font-['Google_Sans'] text-[13px] font-semibold text-[#1a1a18]">{currencySymbol}{cogs.toFixed(2)} / {uom}</span>
            </div>

            {supplierMargin > 0 ? (
              <div className="mt-2.5">
                <div className="flex justify-between mb-[3px] gap-2">
                  <span className="font-['Google_Sans'] text-xs text-[#444444] truncate">Supplier Profit (Quote − FMC)</span>
                  <span className="font-['Google_Sans'] text-xs text-[#1a1a18] flex-shrink-0">{currencySymbol}{supplierMargin.toFixed(2)}</span>
                </div>
                <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (supplierMargin / unitPrice) * 100)}%`, background: "#fcd34d" }} />
                </div>
                <div className="font-['Google_Sans'] text-[9px] text-[#cccccc] mt-0.5">{((supplierMargin / unitPrice) * 100).toFixed(1)}% of quoted price</div>
              </div>
            ) : (
              <div className="font-['Google_Sans'] text-[10px] text-[#b45309] mt-2.5 leading-relaxed">
                Quoted price is {currencySymbol}{Math.abs(supplierMargin).toFixed(2)} below FMC should-cost — no supplier margin implied.
              </div>
            )}

            <div className="border-t border-[#ebebeb] mt-2.5 pt-2.5 flex justify-between">
              <span className="font-['Google_Sans'] text-xs font-semibold text-[#1a1a18]">Rate Sold (Quoted Price)</span>
              <span className="font-['Google_Sans'] text-[13px] font-semibold text-[#1a1a18]">{currencySymbol}{unitPrice.toFixed(2)} / {uom}</span>
            </div>
          </div>

          {hasBom && (
            <div>
              <div className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.08em] mb-2.5">
                Should-Cost Roll-up — {supplierLabel}
              </div>
              {grouped.map((g, i) => {
                const groupTotal = g.lines.reduce((s, l) => s + l.cost, 0);
                return (
                  <div key={`ca-${i}`} className={`flex justify-between py-[7px] gap-2 ${i < grouped.length - 1 ? "border-b border-[#f5f5f4]" : ""}`}>
                    <span className="font-['Google_Sans'] text-xs text-[#666666] truncate" title={g.label}>{g.label}</span>
                    <span className="font-['Google_Sans'] text-xs flex-shrink-0 text-[#1a1a18]">
                      {currencySymbol}{groupTotal.toFixed(2)}
                      <span className="text-[#bbbbbb] text-[10px]"> /{uom}</span>
                    </span>
                  </div>
                );
              })}
              <div className="flex justify-between py-[7px] gap-2 border-t border-[#ebebeb] mt-1">
                <span className="font-['Google_Sans'] text-xs text-[#666666]">Supplier Margin</span>
                <span className="font-['Google_Sans'] text-xs flex-shrink-0 text-[#b45309] font-medium">
                  {currencySymbol}{supplierMargin.toFixed(2)}
                  <span className="text-[#bbbbbb] text-[10px]"> /{uom}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOM */}
      {!hasBom ? (
        <div className="bg-[#fafafa] border border-[#ebebeb] rounded-md p-4">
          <div className="font-['Google_Sans'] text-xs font-medium text-[#1a1a18]">Should-cost component breakdown unavailable</div>
          <div className="font-['Google_Sans'] text-[11px] text-[#888888] mt-1 leading-relaxed">
            The FMC band is available but not its component build-up, so the Bill of Materials cannot be shown.
          </div>
        </div>
      ) : (
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <SectionLabel>Bill of Materials — FMC Should-Cost</SectionLabel>
          <div className="flex gap-1.5">
            <button
              onClick={() => setCollapsedGroups(new Set())}
              className="font-['Google_Sans'] text-[10px] tracking-[0.06em] bg-transparent border border-[#e0e0e0] rounded px-2.5 py-1 text-[#666666] hover:bg-[#fafafa]"
            >
              Expand All
            </button>
            <button
              onClick={() => setCollapsedGroups(new Set(grouped.map((g) => g.group)))}
              className="font-['Google_Sans'] text-[10px] tracking-[0.06em] bg-transparent border border-[#e0e0e0] rounded px-2.5 py-1 text-[#666666] hover:bg-[#fafafa]"
            >
              Collapse All
            </button>
          </div>
        </div>

        {(() => {
          const stats = [
            { label: "Fair Market Cost (Mid)", value: `${currencySymbol}${totalActual.toFixed(2)}`, sub: `per ${uom} · sum of should-cost lines`, variant: "default" as const },
            ...(hasBand
              ? [{ label: "FMC Low End (Target)", value: `${currencySymbol}${totalShouldCost.toFixed(2)}`, sub: "efficient-plant scenario", variant: "default" as const }]
              : []),
            ...(hasBand && isBidQuoted
              ? [{ label: "Cost Reduction Headroom", value: `${currencySymbol}${totalVariance.toFixed(2)}`, sub: `${totalVariancePct}% below mid-case FMC`, variant: "variance" as const }]
              : []),
            ...(hasBand
              ? [{ label: "Annual Savings (BOM)", value: `${currencySymbol}${(totalVariance * annualQty).toLocaleString()}`, sub: "if low-end FMC achieved", variant: "highlight" as const }]
              : []),
          ];
          const gridCols = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[stats.length] || "grid-cols-4";
          return (
            <div className={`grid gap-2 mb-3.5 ${gridCols}`}>
              {stats.map((s, i) => (
                <div key={`bs-${i}`} className={`rounded-md p-[10px_14px] border ${s.variant === "highlight" ? "bg-[#1a1a18] border-[#1a1a18]" : "bg-[#fafafa] border-[#ebebeb]"}`}>
                  <div className={`font-['Google_Sans'] text-[9px] uppercase tracking-[0.08em] mb-1 ${s.variant === "highlight" ? "text-white/40" : "text-[#bbbbbb]"}`}>{s.label}</div>
                  <div className={`font-['Google_Sans'] text-[15px] font-medium ${s.variant === "highlight" ? "text-white" : s.variant === "variance" ? "text-[#dc2626]" : "text-[#1a1a18]"}`}>{s.value}</div>
                  <div className={`font-['Google_Sans'] text-[9px] mt-0.5 ${s.variant === "highlight" ? "text-white/30" : "text-[#cccccc]"}`}>{s.sub}</div>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="border border-[#ebebeb] rounded-md overflow-hidden">
          <div className="grid gap-0 bg-[#fafafa] border-b border-[#ebebeb] px-3.5 py-2" style={{ gridTemplateColumns: "1fr 90px 60px" }}>
            {["Cost Item", "Cost", "Share"].map((h, i) => (
              <div key={`th-${i}`} className={`font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.08em] ${i > 0 ? "text-right" : "text-left"}`}>{h}</div>
            ))}
          </div>

          {grouped.map((g, gi) => {
            const isCollapsed = collapsedGroups.has(g.group);
            const groupTotal = g.lines.reduce((s, l) => s + l.cost, 0);
            const dotColor = GROUP_DOT_COLOR[g.group];

            return (
              <div key={`grp-${gi}`}>
                <button
                  onClick={() =>
                    setCollapsedGroups((prev) => {
                      const next = new Set(prev);
                      next.has(g.group) ? next.delete(g.group) : next.add(g.group);
                      return next;
                    })
                  }
                  className={`w-full grid gap-0 px-3.5 py-2 bg-[#f5f5f4] border-b border-[#ebebeb] items-center text-left cursor-pointer ${gi > 0 ? "border-t border-t-[#ebebeb]" : ""}`}
                  style={{ gridTemplateColumns: "1fr 90px 60px", borderLeft: `3px solid ${dotColor}` }}
                >
                  <div className="flex items-center gap-1.5">
                    {isCollapsed ? <ChevronRightIcon size={11} color="#aaaaaa" /> : <ChevronDown size={11} color="#aaaaaa" />}
                    <span className="font-['Google_Sans'] text-[10px] uppercase tracking-[0.09em] text-[#555555] font-medium">{g.label}</span>
                    <span className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] ml-1">{g.lines.length} items</span>
                  </div>
                  <div className="font-['Google_Sans'] text-[11px] text-[#1a1a18] text-right font-medium">{currencySymbol}{groupTotal.toFixed(2)}</div>
                  <div className="font-['Google_Sans'] text-[10px] text-[#aaaaaa] text-right">{((groupTotal / totalActual) * 100).toFixed(1)}%</div>
                </button>

                {!isCollapsed &&
                  g.lines.map((line, li) => {
                    const barPct = (line.cost / totalActual) * 100;
                    return (
                      <div
                        key={`line-${gi}-${li}`}
                        className={`grid gap-0 px-3.5 py-[7px] items-center hover:bg-[#fafafa] ${li < g.lines.length - 1 ? "border-b border-[#f5f5f5]" : ""}`}
                        style={{ gridTemplateColumns: "1fr 90px 60px", paddingLeft: 33 }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: dotColor }} />
                          <span className="font-['Google_Sans'] text-xs text-[#444444]">{line.name}</span>
                        </div>
                        <div className="font-['Google_Sans'] text-xs text-[#1a1a18] text-right">{currencySymbol}{line.cost.toFixed(2)}</div>
                        <div className="text-right">
                          <div className="font-['Google_Sans'] text-[10px] text-[#aaaaaa]">{barPct.toFixed(1)}%</div>
                          <div className="h-0.5 bg-[#f0f0f0] rounded-full overflow-hidden mt-0.5">
                            <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: dotColor }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}

          <div className="grid gap-0 px-3.5 py-2.5 bg-[#fafafa] border-t-2 border-t-[#ebebeb]" style={{ gridTemplateColumns: "1fr 90px 60px" }}>
            <div className="font-['Google_Sans'] text-[11px] font-semibold text-[#1a1a18] uppercase tracking-[0.06em]">Total FMC</div>
            <div className="font-['Google_Sans'] text-xs font-semibold text-[#1a1a18] text-right">{currencySymbol}{totalActual.toFixed(2)}</div>
            <div className="font-['Google_Sans'] text-[10px] text-[#bbbbbb] text-right">100%</div>
          </div>
        </div>

        {/* BOM donut chart */}
        <div className="mt-4">
          <div className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.1em] mb-2.5">
            Should-Cost Distribution by Component
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="cost"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={56}
                outerRadius={90}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              />
              <Tooltip
                formatter={(v: any, _n: any, entry: any) => [`${currencySymbol}${Number(v).toFixed(2)}`, entry?.payload?.fullName]}
                contentStyle={{ fontFamily: INTEL_FONT, fontSize: 10, border: "1px solid #ebebeb", borderRadius: 4 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}
    </div>
  );
}
