import { CONDENSED_CORPUS } from "./chatbot.corpus";

// ── System prompts ────────────────────────────────────────────────────────────

export const LIGHT_SYSTEM =
  `You are the Prokraya sales-engineering assistant. Use ONLY facts present in the context provided in ` +
  `this message – never invent metrics, client names, certifications, or capabilities. If something ` +
  `isn't in the context, leave it out. Be concise and practical.`;

export const ASK_SYSTEM =
  `You are "AI Ask Prokraya", an elite enterprise sales-engineering assistant. A Prokraya Account Executive asks you a question; ` +
  `your job is to give an answer so clear, confident, and perfectly structured that they could turn around and say it to a ` +
  `prospect and sound like an absolute expert.\n\n` +
  `GROUNDING (non-negotiable): use ONLY the reference data below. Never invent or infer beyond it. Use the ` +
  `exact Prokraya numbers and names from the data. If a specific figure, timeline, or technical detail ` +
  `isn't in the data, don't estimate – say plainly that it's not something we publish.\n\n` +
  `WRITE FOR FLOW AND IMPACT:\n` +
  `- Lead with a sharp, bolded executive summary (1-2 confident sentences).\n` +
  `- For complex questions, START WITH POINTERS (a bulleted list) outlining the core concepts.\n` +
  `- Then, smoothly transition into prose paragraphs to explain the 'how' and 'why it matters'.\n` +
  `- Use **bolding** heavily for key metrics, taglines, product names, and core capabilities.\n` +
  `- Close with one short, natural line offering 2-3 directions to go deeper.\n\n` +
  `CRITICAL USP RULE: If the rep asks about USPs or key differentiators, adopt the persona of a Senior Product Marketing Manager and follow this structure:\n` +
  `**🎯 The "TL;DR" (Top 3 USP Bullets):** Concise, scannable bulleted list of the top 3 core differentiators.\n` +
  `**📊 The "Why it Matters" (Detailed Breakdown):** For each bullet: What it is, The Mechanism, The Business Impact.\n` +
  `**🎯 The Final Pitch:** One-paragraph summary with a specific Call to Action.\n\n` +
  `Tone: confident and crisp. No hedging words.\n` +
  `End with exactly ONE final italicized line naming sources: *Sources: Platform overview, Q&A playbook*\n\n` +
  `=== PROKRAYA GTM STRATEGY & CAPABILITIES ===\n` +
  `THE INTELLIGENCE-AND-EXECUTION LAYER (KNOW – PLAN – EXECUTE – PROVE)\n` +
  `1. KNOW (Cost Intelligence / PriceIQ): Rebuilds supplier costs from first principles to deliver a should-cost target.\n` +
  `2. PLAN (Netra Strategy): Builds the negotiation strategy, BATNA, posture, and recommended demands.\n` +
  `3. EXECUTE (Netra Action): Recommend-and-approve mode or autonomous execution.\n` +
  `4. PROVE (Savings Ledger): Achieved price vs. a signed baseline. Every dollar attributed.\n\n` +
  `THE COMMERCIAL ARC & PRICING:\n` +
  `1. PROVE (90-Day Pilot): $20K flat. 3 categories. Savings Covenant + money-back guarantee.\n` +
  `2. ALIGN (Annual Tier): $32K - $72K/yr. (Pro tier is $52K/yr for both agents + 4-6 categories).\n` +
  `3. SHARE (Ledger Live): $24K base + 13% verified uncapped share-rate on banked savings.\n\n` +
  `COMPETITIVE MOAT:\n` +
  `- Global Suites (Ariba/Coupa): No supplier cost intelligence, no negotiation AI.\n` +
  `- The GCC Moat: GCC-native ICV (In-Country Value) in negotiation. Uncontested by global suites.\n` +
  `=== END GTM STRATEGY ===\n\n` +
  `=== PROKRAYA REFERENCE DATA ===\n` +
  CONDENSED_CORPUS +
  `\n=== END REFERENCE DATA ===`;

// ── Talktrack helpers ─────────────────────────────────────────────────────────

export const TT_METRICS =
  "2.6× ROI, 58% faster procurement cycles, 95%+ invoice matching accuracy, " +
  "6–8 weeks to go live, 7 specialized AI agents, 50+ pre-built connectors, " +
  "90%+ spend under management, 40% faster approval cycles, 70%+ reduction in maverick spend";

export const TT_CLIENTS = "DAFZA, Eagle Hills, Hassad Food, IntelliSmart, Benetton";

/** Derive a prospect company name from cfg without inventing one. */
export function deriveCompanyName(cfg: Record<string, any>): string {
  const notes = String(cfg.notes || "").trim();
  const blocked =
    /^(SAP|Oracle|NetSuite|Dynamics|Microsoft Dynamics|Coupa|Ariba|SAP Ariba|Jaggaer|GEP|Ivalua|Zycus|Basware|procurement|sourcing|the team|the client)$/i;
  if (notes) {
    let cand = "";
    const m = notes.match(
      /\b(?:at|for|with|client[:]?)\s+([A-Z][A-Za-z0-9&'.\- ]{2,40})/
    );
    if (m?.[1]) cand = m[1].trim().replace(/[.,;].*$/, "");
    if (!cand) {
      const m2 = notes.match(
        /\b([A-Z][A-Za-z0-9&.'\- ]{1,40}?\s(?:Corp|Inc|Ltd|LLC|PLC|Group|Holdings|Company|Co\.|GmbH|SA|FZE|FZCO|LLP))\b/
      );
      if (m2?.[1]) cand = m2[1].trim();
    }
    if (cand && cand.length >= 3 && !blocked.test(cand)) return cand;
  }
  const size = String(cfg.size || "").replace(/\s*\(.*\)/, "").toLowerCase();
  const ind = String(cfg.industry || "organization").split(" /")[0].toLowerCase();
  const reg = cfg.region ? ` in ${cfg.region}` : "";
  const sizeWord = size.includes("enterprise")
    ? "an enterprise"
    : size.includes("smb")
    ? "an SMB"
    : "a mid-market";
  return `${sizeWord} ${ind} organization${reg}`;
}

export function renderRunSheet(rs: any[]): string {
  if (!Array.isArray(rs) || !rs.length)
    return "(no run sheet – pace evenly across the selected modules)";
  return rs
    .map((r) => `${r.t || ""} ${r.label || ""}: ${r.detail || ""}`.trim())
    .join("  |  ")
    .slice(0, 1100);
}

export function renderProof(p: any): string {
  if (!p)
    return `Metrics only (2.6× ROI; 58% faster procurement cycles; 95%+ invoice matching accuracy) – woven in at peak relevance. Name no client.`;
  const refs =
    Array.isArray(p.refs) && p.refs.length
      ? `Named clients valid for this industry (you MAY name them): ${p.refs.join(", ")}.`
      : `No industry-matched client – use "comparable enterprise deployments" and name no one.`;
  const metrics =
    Array.isArray(p.metrics) && p.metrics.length
      ? ` Metrics to lean on: ${p.metrics.join("; ")}.`
      : "";
  const note = p.note ? ` Guidance: ${p.note}` : "";
  return `${refs}${metrics}${note}`.slice(0, 700);
}

export function renderClose(c: any): string {
  if (!c) return "Close on the strategic angle and ask for a concrete next step.";
  const strip = (s: any) =>
    String(s || "")
      .replace(/^\s*"|"\s*$/g, "")
      .trim();
  return `End on this idea: ${strip(c.line)} Then ask, in your own words: ${strip(c.ask)}`;
}

export function renderCompetitor(
  comp: string,
  ccObj: any,
  hasComp: boolean
): string {
  if (!hasComp || !comp || comp === "None" || !ccObj) return "";
  const parts: string[] = [];
  if (ccObj.respect) parts.push(`Respect: ${ccObj.respect}`);
  if (ccObj.pivot) parts.push(`Pivot: ${ccObj.pivot}`);
  if (ccObj.edge) parts.push(`Edge: ${ccObj.edge}`);
  return parts.join(" ").slice(0, 600);
}

export function scopeExclusions(selected: string[]): string {
  const sel = new Set(Array.isArray(selected) ? selected : []);
  if (!sel.size) return "";
  const map: Record<string, string> = {
    "Governance & approvals": "approval workflows or audit logs",
    "Suppliers & onboarding": "supplier onboarding or the supplier portal",
    "Sourcing / Bids (RFx)": "bids, RFx, sourcing events, or auctions",
    "Purchase orders": "purchase-order creation or PO workflows",
    "Invoicing & 3-way match": "invoicing, 3-way match, or Peppol",
    "Budgets & spend control": "budget control or spend limits",
    "AI agents": "the AI Console or agent automation as a demo section",
    "Spend analytics": "spend-analytics dashboards or savings tracking",
    "ERP integration": "ERP-sync / integration architecture as a section",
    Contracts: "contract lifecycle management or clause extraction",
  };
  const excl = Object.keys(map)
    .filter((k) => !sel.has(k))
    .map((k) => map[k]);
  if (!excl.length) return "";
  return "Specifically, do not walk through or pitch: " + excl.join("; ") + ".";
}

export function audiencePriority(aud: string, isChannel: boolean): string {
  if (isChannel)
    return "This is a CHANNEL audience: lead each module with what it lets the PARTNER sell and deliver – recurring margin, fast clean deployment (6–8 weeks to go live), and the client ROI it produces (2.6× ROI).";
  switch (aud) {
    case "CFO / Finance":
      return "CFO / Finance: lead with control and spend visibility – money decisions made with context before commitment, budget control, approval speed.";
    case "CIO / CISO / IT":
      return "CIO / CISO / IT: lead with integration and security – clean bi-directional sync, no middleware, data isolation, low deployment risk.";
    case "CPO / Procurement":
      return "CPO / Procurement: lead with supplier workflow and AI – self-service onboarding, the supplier-portal switch, and the routine work the AI agents take off the team.";
    default:
      return "Mixed executive: balance all three – control & spend visibility for finance, integration & security for IT, supplier workflow & AI for procurement – and read the room as you go.";
  }
}

export function lengthForTime(t: string): {
  minutes: number;
  wordTarget: string;
  directive: string;
} {
  const m = parseInt(t, 10) || 30;
  const table: Record<number, { wordTarget: string; directive: string }> = {
    15: { wordTarget: "600–700", directive: "Tight. One short paragraph per module, no detours." },
    20: { wordTarget: "800–900", directive: "Lean. Slightly more room on the one or two pivotal modules." },
    30: { wordTarget: "1100–1300", directive: "Full but disciplined. Dwell on the differentiator module, keep the rest crisp." },
    45: { wordTarget: "1700–1900", directive: "Room to breathe; still one paragraph per module – depth, not repetition." },
    60: { wordTarget: "2300–2500", directive: "Longest format; add a short spend-analytics or leadership-view beat only if those modules are selected." },
  };
  const spec = table[m] || table[30];
  return { minutes: m, wordTarget: spec.wordTarget, directive: spec.directive };
}

export function maxTokensForTime(t: string): number {
  const m = parseInt(t, 10) || 30;
  return ({ 15: 1200, 20: 1500, 30: 2200, 45: 2900, 60: 3600 } as Record<number, number>)[m] || 2200;
}

// ── Autofill schema ───────────────────────────────────────────────────────────

export const CFG_SCHEMA = {
  type: "object",
  properties: {
    engagement: { type: "string", enum: ["Direct client", "Channel partner"] },
    region: {
      type: "string",
      enum: [
        "GCC / Middle East",
        "Europe",
        "APAC / SEA",
        "North America",
        "LATAM",
        "India / South Asia",
        "Sub-Saharan Africa",
      ],
    },
    time: {
      type: "string",
      enum: ["15 min", "20 min", "30 min", "45 min", "60 min"],
    },
    modules: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "Governance & approvals",
          "Suppliers & onboarding",
          "Sourcing / Bids (RFx)",
          "Purchase orders",
          "Invoicing & 3-way match",
          "Budgets & spend control",
          "AI agents",
          "Spend analytics",
          "ERP integration",
          "Contracts",
        ],
      },
    },
    industry: {
      type: "string",
      enum: [
        "Real estate / Construction",
        "Food & beverage / Agri",
        "Government / Public sector",
        "Retail / Consumer",
        "Manufacturing / Industrial",
        "Logistics / Distribution",
        "Healthcare / Pharma",
        "Energy / Oil & Gas",
        "Other / Mixed",
      ],
    },
    size: {
      type: "string",
      enum: ["SMB (<250 staff)", "Mid-market (250–2000)", "Enterprise (2000+)"],
    },
    erp: {
      type: "string",
      enum: [
        "SAP",
        "Oracle",
        "NetSuite",
        "Microsoft Dynamics",
        "Other / Legacy",
        "None",
      ],
    },
    audience: {
      type: "string",
      enum: [
        "CPO / Procurement",
        "CFO / Finance",
        "CIO / CISO / IT",
        "Mixed executive",
      ],
    },
    competitor: {
      type: "string",
      enum: [
        "None",
        "SAP Ariba",
        "Coupa",
        "Oracle",
        "Jaggaer",
        "GEP",
        "Ivalua",
        "Zycus",
        "Microsoft D365",
        "Basware",
        "SME tool",
        "Other",
      ],
    },
    state: {
      type: "string",
      enum: [
        "Fully manual / spreadsheets",
        "Legacy ERP only",
        "Competitor platform",
        "Mixed / partial",
      ],
    },
    suppliers: {
      type: "string",
      enum: [
        "Small (<50)",
        "Medium (50–250)",
        "Large (250–1000)",
        "Very large (1000+)",
      ],
    },
    pocName: { type: "string" },
    pocRole: {
      type: "string",
      enum: [
        "Founder / CEO",
        "Head of Alliances",
        "BD / Sales lead",
        "Practice / Delivery head",
        "Technical lead",
        "Other",
      ],
    },
    notes: { type: "string" },
  },
};

export function optionsHint(): string {
  return Object.entries(CFG_SCHEMA.properties)
    .map(([k, v]: [string, any]) => {
      if (v.enum) return `${k}: ${v.enum.join(" | ")}`;
      if (v.type === "array" && v.items?.enum)
        return `${k} (array, any of): ${v.items.enum.join(" | ")}`;
      return `${k}: free text`;
    })
    .join("\n");
}

function optionsFor(field: string): string[] {
  const d = (CFG_SCHEMA.properties as any)[field];
  if (!d) return [];
  if (d.enum) return d.enum;
  if (d.type === "array" && d.items?.enum) return d.items.enum;
  return [];
}

function snapValue(val: any, options: string[]): string | undefined {
  if (typeof val !== "string") return undefined;
  const v = val.trim();
  if (!v) return undefined;
  if (options.includes(v)) return v;
  const lv = v.toLowerCase();
  const ci = options.find((o) => o.toLowerCase() === lv);
  if (ci) return ci;
  const sub = options.find((o) => {
    const lo = o.toLowerCase();
    return lo.includes(lv) || lv.includes(lo);
  });
  if (sub) return sub;
  const toks = lv.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  let best: string | undefined;
  let bestScore = 0;
  for (const o of options) {
    const ot = o.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    const score = toks.filter((t) => ot.includes(t)).length;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return bestScore >= 1 ? best : undefined;
}

const TITLE_RE =
  /\b(co-?founder|founder|ceo|cto|coo|cfo|cmo|cio|head|vp|vice president|director|president|manager|owner|consultant|lead)\b/i;

export function sanitizeReview(parsed: any): any {
  const p = parsed || {};
  const cfgRaw = p.cfg || {};
  const cfg: Record<string, any> = {};
  for (const [k, v] of Object.entries(cfgRaw)) {
    const def = (CFG_SCHEMA.properties as any)[k];
    if (!def) continue;
    if (def.enum) {
      const s = snapValue(v, def.enum);
      if (s !== undefined) cfg[k] = s;
    } else if (def.type === "array" && def.items?.enum) {
      if (Array.isArray(v)) {
        const mapped: string[] = [];
        for (const item of v) {
          const s = snapValue(item, def.items.enum);
          if (s && !mapped.includes(s)) mapped.push(s);
        }
        if (mapped.length) cfg[k] = mapped;
      }
    } else if (typeof v === "string" && (v as string).trim()) {
      cfg[k] = (v as string).trim();
    }
  }
  if (cfg.pocName && TITLE_RE.test(cfg.pocName)) delete cfg.pocName;

  const missing = (Array.isArray(p.missing) ? p.missing : [])
    .filter((m: any) => m && typeof m.field === "string" && (CFG_SCHEMA.properties as any)[m.field])
    .map((m: any) => {
      let options = Array.isArray(m.options)
        ? m.options.map((o: any) => snapValue(o, optionsFor(m.field))).filter(Boolean)
        : [];
      if (!options.length) options = optionsFor(m.field).slice(0, 4);
      return {
        field: m.field,
        question: String(m.question || `What's the ${m.field}?`).slice(0, 240),
        options: Array.from(new Set(options)),
      };
    })
    .filter((m: any) => m.options.length)
    .slice(0, 8);

  const assumptions = (Array.isArray(p.assumptions) ? p.assumptions : [])
    .filter((a: any) => typeof a === "string" && a.trim())
    .map((a: any) => a.trim().slice(0, 240))
    .slice(0, 8);

  const confidence =
    p.confidence && typeof p.confidence === "object" && !Array.isArray(p.confidence)
      ? p.confidence
      : {};

  return { cfg, missing, assumptions, confidence };
}

export function parseLooseJSON(text: string): any {
  let t = String(text).trim();
  if (t.startsWith("```")) t = t.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(t);
}
