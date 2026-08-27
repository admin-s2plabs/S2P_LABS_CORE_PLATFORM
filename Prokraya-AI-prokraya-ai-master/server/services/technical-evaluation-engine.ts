import { sql } from "drizzle-orm";
import { db } from "../db";
import { downloadFileFromAzure } from "./azure-blob.service";
import { getAIClient, getAIModelName } from "./ai-client";
import type {
  TechnicalEvalEvidence,
  TechnicalEvalResult,
  TechnicalRequirementScore,
  TechnicalScoringPath,
  TechnicalEvalAiDetails,
} from "@shared/technical-evaluation";
import { buildReviewRemark, getPersistedReviewRemark } from "@shared/technical-evaluation-remarks";

const MAX_RESPONSE_CHARS = 2000;
const MAX_DOC_BYTES = 4 * 1024 * 1024;
const MAX_DOCS_PER_RESPONSE = 3;
const MAX_DOC_EXCERPT_CHARS = 1500;

type EvaluationMode = "dropdown" | "compliance" | "binary" | "comparative" | "text";

interface BidRequirementRow {
  id: number;
  category: string;
  question: string;
  qvoption: string | null;
  qvtype: string | null;
  weight: string | number | null;
  scoringmethod: string | null;
  lov: string | null;
  knockoutscore: string | number | null;
}

interface VendorResponseRow {
  responseId: number;
  supplierName: string;
  supplierId: number;
  reqResponses: Array<{
    reqId: number;
    response: string;
    remarks: string;
  }>;
  documentSnippets: TechnicalEvalEvidence[];
}

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseWeight(value: unknown): number {
  const n = parseFloat(String(value ?? "0"));
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function parseLovOptions(req: BidRequirementRow): string[] {
  const raw = String(req.lov || req.qvoption || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function toSuggestedScore(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 100) / 10;
}

function clampScore(score: number, maxScore: number): number {
  return Math.min(Math.max(0, score), maxScore);
}

function isEmptyResponse(response: string): boolean {
  const t = String(response || "").trim();
  return !t || t === "-" || t.toLowerCase() === "n/a" || t.toLowerCase() === "not answered";
}

function isDisqualifierQuestion(question: string): boolean {
  const q = normalizeText(question);
  const patterns = [
    "terrorist",
    "sanction",
    "blacklist",
    "debarred",
    "convicted",
    "criminal",
    "illegal",
    "banned",
    "affiliated with any terrorist",
  ];
  return patterns.some((p) => q.includes(p));
}

function isPartialOption(option: string): boolean {
  const o = normalizeText(option);
  const partialPatterns = [
    "partial",
    "partially",
    "in progress",
    "in development",
    "under development",
    "being developed",
    "limited",
    "minimal",
    "some",
    "under review",
    "pending",
    "planned",
    "not yet",
    "working toward",
    "in process",
  ];
  return partialPatterns.some((p) => o.includes(p));
}

function isObjectivelyMeasurableQuestion(question: string, scoringmethod: string | null): boolean {
  const q = normalizeText(question);
  const patterns = [
    "delivery time",
    "lead time",
    "turnaround",
    "response time",
    "cycle time",
    "time to deliver",
    "time to complete",
    "how many days",
    "how many weeks",
    "how many months",
    "how many years",
    "number of years",
    "years of experience",
    "cost",
    "price",
    "budget",
    "fee",
    "rate",
    "sla",
    "uptime",
    "warranty",
    "how much",
    "how many",
    "percent",
    "percentage",
    "%",
    "volume",
    "capacity",
    "throughput",
    "headcount",
    "fte",
    "resources",
  ];
  if (patterns.some((p) => q.includes(p))) return true;
  const sm = normalizeText(scoringmethod || "");
  return sm.includes("measurable") || sm.includes("quantitative");
}

function isLowerBetterForRequirement(question: string): boolean {
  const q = normalizeText(question);
  const lowerBetter = [
    "delivery time",
    "lead time",
    "turnaround",
    "response time",
    "cycle time",
    "time to",
    "days to",
    "weeks to",
    "cost",
    "price",
    "budget",
    "fee",
    "defect",
    "error rate",
    "downtime",
  ];
  return lowerBetter.some((p) => q.includes(p));
}

function extractComparableValue(response: string, question: string): number | null {
  const text = String(response || "");
  if (isEmptyResponse(text)) return null;

  const norm = normalizeText(text);
  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) return parseFloat(percentMatch[1]);

  const currencyMatch = text.match(/(?:\$|usd|eur|gbp|inr)\s*(\d+(?:[,\d]{3})*(?:\.\d+)?)/i)
    || text.match(/(\d+(?:[,\d]{3})*(?:\.\d+)?)\s*(?:\$|usd|eur|gbp|inr)/i);
  if (currencyMatch && /cost|price|budget|fee|rate|amount/i.test(question)) {
    return parseFloat(currencyMatch[1].replace(/,/g, ""));
  }

  const unitPatterns: Array<{ regex: RegExp; multiplier: number }> = [
    { regex: /(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/i, multiplier: 365 },
    { regex: /(\d+(?:\.\d+)?)\s*(?:months?|mos?)\b/i, multiplier: 30 },
    { regex: /(\d+(?:\.\d+)?)\s*(?:weeks?|wks?)\b/i, multiplier: 7 },
    { regex: /(\d+(?:\.\d+)?)\s*(?:days?)\b/i, multiplier: 1 },
    { regex: /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i, multiplier: 1 / 24 },
  ];

  for (const { regex, multiplier } of unitPatterns) {
    const m = text.match(regex);
    if (m) return parseFloat(m[1]) * multiplier;
  }

  const rangeMatch = text.match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const a = parseFloat(rangeMatch[1]);
    const b = parseFloat(rangeMatch[2]);
    return (a + b) / 2;
  }

  const lessThanMatch = text.match(/(?:less than|under|below|max(?:imum)?|up to)\s*(\d+(?:\.\d+)?)/i);
  if (lessThanMatch) return parseFloat(lessThanMatch[1]) * 0.75;

  const moreThanMatch = text.match(/(?:more than|over|above|min(?:imum)?|at least)\s*(\d+(?:\.\d+)?)/i);
  if (moreThanMatch) return parseFloat(moreThanMatch[1]) * 1.25;

  const numbers = text.match(/\d+(?:\.\d+)?/g);
  if (!numbers?.length) return null;

  const parsed = numbers.map((n) => parseFloat(n)).filter((n) => Number.isFinite(n));
  if (!parsed.length) return null;

  if (/experience|years|project|headcount|fte|resource/i.test(question)) {
    return Math.max(...parsed);
  }
  if (isLowerBetterForRequirement(question)) {
    return Math.min(...parsed);
  }
  return parsed[0];
}

function isComparativeQuestion(question: string, scoringmethod: string | null): boolean {
  if (isObjectivelyMeasurableQuestion(question, scoringmethod)) return true;
  const sm = normalizeText(scoringmethod || "");
  if (sm.includes("comparative")) return true;
  const q = normalizeText(question);
  const comparativePatterns = [
    "experience",
    "methodology",
    "approach",
    "technical capability",
    "capability",
    "capabilities",
    "team expertise",
    "expertise",
    "innovation",
    "similar project",
    "past performance",
    "track record",
    "case study",
    "case studies",
    "reference project",
    "how will you",
    "describe your",
    "proposed solution",
    "solution approach",
    "implementation plan",
    "delivery approach",
    "delivery methodology",
    "years of",
    "relevant project",
    "project experience",
    "technical approach",
    "quality of",
    "depth of",
    "demonstrate your",
    "explain your",
    "outline your",
  ];
  return comparativePatterns.some((p) => q.includes(p));
}

function isComplianceQuestion(question: string, scoringmethod: string | null): boolean {
  if (isComparativeQuestion(question, scoringmethod)) return false;
  const sm = normalizeText(scoringmethod || "");
  if (sm.includes("compliance") || sm.includes("mandatory") || sm.includes("knockout")) return true;
  const q = normalizeText(question);
  const complianceSignals =
    q.includes("certification") ||
    q.includes("certified") ||
    q.includes("iso ") ||
    q.includes("compliance") ||
    q.includes("regulatory") ||
    q.includes("license") ||
    q.includes("licence") ||
    q.includes("permit") ||
    q.includes("registered with");
  if (!complianceSignals) return false;
  return true;
}

function classifyRequirement(req: BidRequirementRow): EvaluationMode {
  const qvtype = normalizeText(req.qvtype || "");
  const options = parseLovOptions(req);
  const scoringmethod = normalizeText(req.scoringmethod || "");

  if (scoringmethod.includes("comparative")) return "comparative";
  if (isComparativeQuestion(req.question, req.scoringmethod)) return "comparative";
  if (qvtype.includes("dropdown") && options.length >= 2) {
    if (options.length === 2 && (isDisqualifierQuestion(req.question) || scoringmethod.includes("binary"))) {
      return "binary";
    }
    return "dropdown";
  }
  if (isDisqualifierQuestion(req.question)) return "binary";
  if (isComplianceQuestion(req.question, req.scoringmethod)) return "compliance";
  return "text";
}

function matchOptionExact(response: string, options: string[]): string | null {
  const norm = normalizeText(response);
  if (!norm) return null;
  for (const opt of options) {
    if (normalizeText(opt) === norm) return opt;
  }
  return null;
}

function matchOptionFuzzy(response: string, options: string[]): string | null {
  const exact = matchOptionExact(response, options);
  if (exact) return exact;
  const norm = normalizeText(response);
  if (!norm) return null;
  for (const opt of options) {
    const optNorm = normalizeText(opt);
    if (norm.includes(optNorm) || optNorm.includes(norm)) return opt;
  }
  return null;
}

function isPositiveOption(option: string): boolean {
  const o = normalizeText(option);
  return ["yes", "y", "true", "affirmative", "agree", "confirmed"].some(
    (p) => o === p || o.startsWith(`${p} `),
  );
}

function isNegativeOption(option: string): boolean {
  const o = normalizeText(option);
  return ["no", "n", "false", "none", "not applicable", "na"].some(
    (p) => o === p || o.startsWith(`${p} `),
  );
}

type OptionTier = "best" | "intermediate" | "worst" | "disqualifying";

/** Semantic option ranking for a requirement — built once and cached (deterministic scoring). */
interface SemanticOptionScoreMap {
  scaleType: "binary" | "ordinal" | "disqualifier";
  /** Options ordered from most favorable to least favorable (semantic, not DB order). */
  orderedFromBestToWorst: string[];
  tiers: Record<string, OptionTier>;
}

const semanticOptionMapCache = new Map<string, SemanticOptionScoreMap>();

function semanticMapCacheKey(req: BidRequirementRow): string {
  const options = parseLovOptions(req);
  return `${req.id}:${normalizeText(req.question)}:${options.map(normalizeText).join("|")}`;
}

function findOptionIndex(matchedOption: string, options: string[]): number {
  const norm = normalizeText(matchedOption);
  for (let i = 0; i < options.length; i++) {
    if (normalizeText(options[i]) === norm) return i;
  }
  for (let i = 0; i < options.length; i++) {
    const optNorm = normalizeText(options[i]);
    if (norm.includes(optNorm) || optNorm.includes(norm)) return i;
  }
  return -1;
}

function inferRuleBasedSemanticMap(req: BidRequirementRow): SemanticOptionScoreMap | null {
  const options = parseLovOptions(req);
  if (options.length < 2) return null;

  const disqualifier = isDisqualifierQuestion(req.question);
  const hasYesNo =
    options.some((o) => isPositiveOption(o)) && options.some((o) => isNegativeOption(o));

  if (hasYesNo) {
    const best = disqualifier
      ? options.find((o) => isNegativeOption(o)) || options[1]
      : options.find((o) => isPositiveOption(o)) || options[0];
    const partials = options.filter((o) => o !== best && isPartialOption(o));
    const negatives = options.filter((o) => o !== best && !isPartialOption(o) && isNegativeOption(o));
    const others = options.filter((o) => o !== best && !partials.includes(o) && !negatives.includes(o));
    const ordered = [best, ...partials, ...negatives, ...others];
    const hasPartial = partials.length > 0;
    const scaleType: SemanticOptionScoreMap["scaleType"] =
      disqualifier ? "disqualifier" : hasPartial || options.length > 2 ? "ordinal" : "binary";

    const tiers: Record<string, OptionTier> = { [best]: "best" };
    for (const o of partials) tiers[o] = "intermediate";
    for (const o of negatives) tiers[o] = disqualifier && isPositiveOption(o) ? "disqualifying" : "worst";
    for (const o of others) {
      tiers[o] = isPartialOption(o) ? "intermediate" : "worst";
    }

    return { scaleType, orderedFromBestToWorst: ordered, tiers };
  }

  const normOpts = options.map(normalizeText);
  const validIdx = normOpts.findIndex((o) => o.includes("valid") && !o.includes("invalid"));
  const invalidIdx = normOpts.findIndex((o) => o.includes("invalid") || o.includes("not valid"));
  if (validIdx >= 0 && invalidIdx >= 0) {
    const valid = options[validIdx];
    const invalid = options[invalidIdx];
    const rest = options.filter((o) => o !== valid && o !== invalid);
    return {
      scaleType: rest.length > 0 ? "ordinal" : "binary",
      orderedFromBestToWorst: [valid, ...rest, invalid],
      tiers: {
        [valid]: "best",
        [invalid]: "worst",
        ...Object.fromEntries(rest.map((o) => [o, "intermediate"])),
      },
    };
  }

  return null;
}

async function buildSemanticOptionScoreMap(req: BidRequirementRow): Promise<SemanticOptionScoreMap> {
  const cacheKey = semanticMapCacheKey(req);
  const cached = semanticOptionMapCache.get(cacheKey);
  if (cached) return cached;

  const options = parseLovOptions(req);
  const ruleMap = inferRuleBasedSemanticMap(req);
  if (ruleMap) {
    semanticOptionMapCache.set(cacheKey, ruleMap);
    return ruleMap;
  }

  try {
    const parsed = await callJsonLlm(
      "Classify procurement dropdown/radio options by business meaning. Do NOT score numerically. Return valid JSON only.",
      JSON.stringify({
        task: "semantic_option_classification",
        question: req.question,
        options,
        instructions: [
          "Order options from BEST (most favorable to buyer) to WORST (least favorable).",
          "Do NOT use option list position — use semantic meaning from question + option text.",
          "Assign each option a tier: best | intermediate | worst | disqualifying.",
          "Exactly one or more options may be 'best' only if equally favorable; usually one best.",
          "Disqualifying = unacceptable (e.g. Yes to terrorist affiliation).",
          "scaleType: 'disqualifier' for pass/fail risk questions, 'binary' for two-level good/bad, 'ordinal' for graduated scales (turnover, experience, %).",
          "Examples: Valid License=best, Invalid=worst; Less than 30 days=best; 90%=best; No (terrorist Q)=best, Yes=disqualifying.",
        ],
        returnFormat: {
          scaleType: "binary | ordinal | disqualifier",
          orderedFromBestToWorst: ["exact option labels from the list"],
          optionTiers: { "option label": "best | intermediate | worst | disqualifying" },
        },
      }),
    );

    const ordered: string[] = [];
    for (const label of parsed.orderedFromBestToWorst || []) {
      const match = options.find((o) => normalizeText(o) === normalizeText(String(label)) || o === label);
      if (match && !ordered.includes(match)) ordered.push(match);
    }
    for (const opt of options) {
      if (!ordered.includes(opt)) ordered.push(opt);
    }

    const tiers: Record<string, OptionTier> = {};
    const rawTiers = parsed.optionTiers || {};
    for (const opt of options) {
      const tierRaw = String(
        rawTiers[opt] ||
          rawTiers[options.find((o) => normalizeText(o) === normalizeText(opt)) || ""] ||
          "",
      ).toLowerCase();
      if (tierRaw.includes("disqualif")) tiers[opt] = "disqualifying";
      else if (tierRaw.includes("best")) tiers[opt] = "best";
      else if (tierRaw.includes("inter")) tiers[opt] = "intermediate";
      else tiers[opt] = "worst";
    }
    if (ordered.length > 0) {
      const first = ordered[0];
      if (!tiers[first] || tiers[first] === "worst") tiers[first] = "best";
    }

    const scaleTypeRaw = String(parsed.scaleType || "ordinal").toLowerCase();
    const scaleType: SemanticOptionScoreMap["scaleType"] = scaleTypeRaw.includes("disqualif")
      ? "disqualifier"
      : scaleTypeRaw.includes("binary")
        ? "binary"
        : "ordinal";

    const map: SemanticOptionScoreMap = { scaleType, orderedFromBestToWorst: ordered, tiers };
    semanticOptionMapCache.set(cacheKey, map);
    return map;
  } catch {
    const fallback: SemanticOptionScoreMap = {
      scaleType: "ordinal",
      orderedFromBestToWorst: [...options],
      tiers: Object.fromEntries(
        options.map((o, i) => [o, i === 0 ? "best" : i === options.length - 1 ? "worst" : "intermediate"]),
      ),
    };
    semanticOptionMapCache.set(cacheKey, fallback);
    return fallback;
  }
}

function scoreFromSemanticMap(
  matchedOption: string,
  map: SemanticOptionScoreMap,
  weight: number,
): { score: number; rationale: string; tier: OptionTier } {
  const idx = findOptionIndex(matchedOption, map.orderedFromBestToWorst);
  const canonical = idx >= 0 ? map.orderedFromBestToWorst[idx] : matchedOption;
  const tier: OptionTier =
    map.tiers[canonical] ||
    map.tiers[map.orderedFromBestToWorst.find((o) => normalizeText(o) === normalizeText(canonical)) || ""] ||
    (idx === 0 ? "best" : idx < 0 ? "worst" : "intermediate");

  if (tier === "disqualifying") {
    return {
      score: 0,
      tier,
      rationale: `Option "${canonical}" is disqualifying — score 0/${weight}.`,
    };
  }

  if (tier === "best") {
    return {
      score: weight,
      tier,
      rationale: `Option "${canonical}" fully satisfies this requirement — maximum score ${weight}/${weight}.`,
    };
  }

  if (tier === "intermediate") {
    const n = map.orderedFromBestToWorst.length;
    if (map.scaleType === "ordinal" && idx >= 0 && n > 2) {
      const step = weight / (2 * (n - 1));
      const score = clampScore(Math.round((weight - idx * step) * 10) / 10, weight);
      return {
        score,
        tier,
        rationale: `Option "${canonical}" partially satisfies this requirement — score ${score}/${weight}.`,
      };
    }
    const partialScore = clampScore(Math.round(weight * 0.5 * 10) / 10, weight);
    return {
      score: partialScore,
      tier,
      rationale: `Option "${canonical}" partially satisfies this requirement — score ${partialScore}/${weight}.`,
    };
  }

  const n = map.orderedFromBestToWorst.length;

  if (map.scaleType === "binary" || map.scaleType === "disqualifier") {
    if (tier === "worst" || idx < 0) {
      return {
        score: 0,
        tier,
        rationale: `Option "${canonical}" does not meet the requirement — score 0/${weight}.`,
      };
    }
  }

  if (n <= 2) {
    return {
      score: 0,
      tier,
      rationale: `Option "${canonical}" does not meet the requirement — score 0/${weight}.`,
    };
  }

  // Ordinal semantic scale: best=full weight, then stepped down (e.g. 40 → 30 → 20)
  if (idx < 0) {
    return { score: 0, tier, rationale: `Option "${canonical}" could not be ranked — score 0/${weight}.` };
  }

  const step = weight / (2 * (n - 1));
  const score = clampScore(Math.round((weight - idx * step) * 10) / 10, weight);
  return {
    score,
    tier,
    rationale: `Option "${canonical}" scores ${score}/${weight} based on semantic value (${tier} tier in ordinal scale).`,
  };
}

function scoreBinaryFromOption(
  matchedOption: string,
  weight: number,
  disqualifier: boolean,
): { score: number; rationale: string } {
  const yes = isPositiveOption(matchedOption);
  const no = isNegativeOption(matchedOption);
  if (disqualifier) {
    if (yes) return { score: 0, rationale: "Disqualifying response selected — score set to zero per evaluation rules." };
    if (no) return { score: weight, rationale: "Acceptable response — no disqualifying affiliation indicated." };
  } else {
    if (yes) return { score: weight, rationale: "Requirement fully met based on selected response." };
    if (no) return { score: 0, rationale: "Requirement not met based on selected response." };
  }
  return {
    score: 0,
    rationale: `Scored based on selected option: "${matchedOption}".`,
  };
}

async function scoreDropdownRule(
  req: BidRequirementRow,
  matchedOption: string,
): Promise<{ score: number; rationale: string; normalizedAnswer: string }> {
  const weight = parseWeight(req.weight);
  const options = parseLovOptions(req);
  const disqualifier = isDisqualifierQuestion(req.question);

  if (options.length === 2 && (isPositiveOption(options[0]) || isPositiveOption(options[1]))) {
    const hasPartial = options.some((o) => isPartialOption(o));
    if (!hasPartial) {
      const binary = scoreBinaryFromOption(matchedOption, weight, disqualifier);
      return { ...binary, normalizedAnswer: matchedOption };
    }
  }

  const semanticMap = await buildSemanticOptionScoreMap(req);
  const { score, rationale } = scoreFromSemanticMap(matchedOption, semanticMap, weight);
  return {
    score,
    normalizedAnswer: matchedOption,
    rationale,
  };
}

function scoreComplianceRule(
  req: BidRequirementRow,
  response: string,
  evidence: TechnicalEvalEvidence[],
): { score: number; rationale: string; confidence: number; path: TechnicalScoringPath } | null {
  if (isEmptyResponse(response)) {
    return {
      score: 0,
      rationale: "Vendor did not provide a response to this requirement.",
      confidence: 1,
      path: "rule",
    };
  }

  const norm = normalizeText(response);
  const weight = parseWeight(req.weight);
  const disqualifier = isDisqualifierQuestion(req.question);

  if (isPartialOption(response) || /\bpartial(ly)?\b|\bin progress\b|\bunder development\b|\bin development\b|\blimited evidence\b/.test(norm)) {
    const partialScore = clampScore(Math.round(weight * 0.5 * 10) / 10, weight);
    return {
      score: partialScore,
      rationale: "Requirement partially met — response indicates partial compliance or work in progress.",
      confidence: 0.88,
      path: "rule",
    };
  }

  if (disqualifier) {
    if (isPositiveOption(response) || norm.startsWith("yes")) {
      return { score: 0, rationale: "Disqualifying affirmative response — zero score applied.", confidence: 0.95, path: "rule" };
    }
    if (isNegativeOption(response) || norm.startsWith("no")) {
      return { score: weight, rationale: "Requirement satisfied — negative/disqualifying answer not indicated.", confidence: 0.95, path: "rule" };
    }
  }

  const affirmative =
    norm.startsWith("yes") ||
    norm.includes("certified") ||
    norm.includes("compliant") ||
    norm.includes("we have") ||
    norm.includes("available") ||
    norm.includes("maintained");

  if (affirmative && !norm.startsWith("no")) {
    const hasDoc = evidence.some((e) => e.source === "attachment");
    return {
      score: weight,
      rationale: hasDoc
        ? "Requirement fully met — response confirms compliance and supporting document evidence was found."
        : "Requirement fully met — response confirms compliance. Response length does not affect scoring.",
      confidence: hasDoc ? 0.98 : 0.9,
      path: hasDoc ? "hybrid" : "rule",
    };
  }

  if (norm.startsWith("no") || norm.includes("not available") || norm.includes("do not")) {
    return {
      score: 0,
      rationale: "Requirement not met — response indicates non-compliance or absence.",
      confidence: 0.9,
      path: "rule",
    };
  }

  return null;
}

async function callJsonLlm(system: string, user: string, temperature = 0): Promise<any> {
  const openai = await getAIClient();
  const response = await openai.chat.completions.create({
    model: await getAIModelName(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    temperature,
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");
  return JSON.parse(content);
}

async function normalizeResponseToOption(
  question: string,
  options: string[],
  response: string,
): Promise<{ option: string | null; confidence: number; rationale: string }> {
  if (isEmptyResponse(response)) {
    return { option: null, confidence: 1, rationale: "No response provided." };
  }

  const fuzzy = matchOptionFuzzy(response, options);
  if (fuzzy) {
    return {
      option: fuzzy,
      confidence: matchOptionExact(response, options) ? 1 : 0.92,
      rationale: `Response matched option "${fuzzy}".`,
    };
  }

  try {
    const parsed = await callJsonLlm(
      "Map supplier bid responses to exactly one predefined dropdown option when semantically equivalent. Return valid JSON only.",
      JSON.stringify({
        task: "normalize_to_option",
        question,
        allowedOptions: options,
        supplierResponse: response.substring(0, MAX_RESPONSE_CHARS),
        rules: [
          "Pick the single best matching option if the response is equivalent (e.g. 'Yes, ISO certified' → 'Yes').",
          "If no option fits, return matchedOption: null.",
          "Response length must not affect matching — only meaning.",
        ],
        returnFormat: {
          matchedOption: "string | null",
          confidence: "0-1",
          rationale: "string",
        },
      }),
    );
    const matched = parsed.matchedOption ? String(parsed.matchedOption) : null;
    const valid =
      matched && options.find((o) => normalizeText(o) === normalizeText(matched) || o === matched);
    return {
      option: valid || null,
      confidence: Number(parsed.confidence) || 0.7,
      rationale: String(parsed.rationale || "LLM normalized free-text to closest option."),
    };
  } catch {
    return { option: null, confidence: 0.5, rationale: "Could not normalize response to a dropdown option." };
  }
}

async function evaluateComplianceWithLlm(
  req: BidRequirementRow,
  response: string,
  evidence: TechnicalEvalEvidence[],
): Promise<{ score: number; rationale: string; confidence: number; path: TechnicalScoringPath }> {
  const weight = parseWeight(req.weight);
  if (isEmptyResponse(response) && evidence.length === 0) {
    return {
      score: 0,
      rationale: "Vendor did not provide a response or supporting documents for this requirement.",
      confidence: 1,
      path: "rule",
    };
  }

  const parsed = await callJsonLlm(
    "Evaluate procurement compliance requirements. Score fairly: full satisfaction = full marks regardless of response length. Return valid JSON only.",
    JSON.stringify({
      task: "compliance_evaluation",
      requirement: req.question,
      weight,
      supplierResponse: response.substring(0, MAX_RESPONSE_CHARS),
      documentEvidence: evidence.filter((e) => e.source === "attachment").slice(0, 5),
      scoringRules: {
        fullyMet: weight,
        partiallyMet: Math.round(weight * 0.5 * 10) / 10,
        notMet: 0,
      },
      returnFormat: {
        satisfactionLevel: "fully_met | partially_met | not_met",
        score: `0-${weight}`,
        rationale: "string",
        confidence: "0-1",
      },
    }),
  );

  const level = String(parsed.satisfactionLevel || "").toLowerCase();
  let score = Number(parsed.score);
  if (Number.isNaN(score)) {
    if (level.includes("full")) score = weight;
    else if (level.includes("partial")) score = Math.round(weight * 0.5 * 10) / 10;
    else score = 0;
  }
  return {
    score: clampScore(score, weight),
    rationale: String(parsed.rationale || "AI evaluated compliance against requirement intent."),
    confidence: Number(parsed.confidence) || 0.75,
    path: evidence.length > 0 ? "hybrid" : "llm",
  };
}

async function evaluateTextRequirement(
  req: BidRequirementRow,
  response: string,
  evidence: TechnicalEvalEvidence[],
): Promise<{ score: number; rationale: string; confidence: number; path: TechnicalScoringPath }> {
  const weight = parseWeight(req.weight);
  if (isEmptyResponse(response) && evidence.length === 0) {
    return {
      score: 0,
      rationale: "Vendor did not provide a response to this requirement.",
      confidence: 1,
      path: "rule",
    };
  }

  const parsed = await callJsonLlm(
    "Evaluate supplier technical responses against requirement intent. Full satisfaction earns full weight regardless of answer length. Return valid JSON only.",
    JSON.stringify({
      task: "text_evaluation",
      requirement: req.question,
      weight,
      supplierResponse: response.substring(0, MAX_RESPONSE_CHARS),
      documentEvidence: evidence.slice(0, 5),
      returnFormat: {
        score: `0-${weight}`,
        rationale: "string",
        confidence: "0-1",
      },
    }),
  );

  const score = clampScore(Number(parsed.score) || 0, weight);
  return {
    score,
    rationale: String(parsed.rationale || "AI evaluated response against requirement intent."),
    confidence: Number(parsed.confidence) || 0.75,
    path: evidence.length > 0 ? "hybrid" : "llm",
  };
}

/** Deterministic relative scores: rank sets tier band; qualityScore fine-tunes within the band. */
function distributeComparativeScores(
  weight: number,
  entries: Array<{
    responseId: number;
    rank: number;
    qualityScore?: number;
    rationale: string;
    confidence: number;
    hasResponse: boolean;
  }>,
): Map<number, number> {
  const scores = new Map<number, number>();
  for (const e of entries) {
    if (!e.hasResponse) {
      scores.set(e.responseId, 0);
    }
  }

  const withResponse = entries
    .filter((e) => e.hasResponse)
    .sort((a, b) => a.rank - b.rank || a.responseId - b.responseId);

  const n = withResponse.length;
  if (n === 0) return scores;

  if (n === 1) {
    const soleResponderAmongPeers = entries.length > 1;
    const q = clampScore((withResponse[0].qualityScore ?? 70) / 100, 1) * weight;
    const base = soleResponderAmongPeers ? weight : clampScore(Math.round(weight * 0.85 * 10) / 10, weight);
    const blended = clampScore(Math.round((base * 0.7 + q * 0.3) * 10) / 10, weight);
    scores.set(withResponse[0].responseId, blended);
    return scores;
  }

  const step = weight / (2 * (n - 1));
  let position = 0;
  let i = 0;
  while (i < n) {
    const currentRank = withResponse[i].rank;
    const group: typeof withResponse = [];
    while (i < n && withResponse[i].rank === currentRank) {
      group.push(withResponse[i]);
      i++;
    }

    const tierCeiling = clampScore(Math.round((weight - position * step) * 10) / 10, weight);
    const nextPosition = position + group.length;
    const tierFloor =
      nextPosition < n
        ? clampScore(Math.round((weight - nextPosition * step) * 10) / 10, weight)
        : 0;
    const bandWidth = Math.max(tierCeiling - tierFloor, 0);

    const qualities = group.map((e) =>
      Number.isFinite(e.qualityScore) ? clampScore((e.qualityScore ?? 50) / 100, 1) : 0.5,
    );
    const qMin = Math.min(...qualities);
    const qMax = Math.max(...qualities);

    for (let gi = 0; gi < group.length; gi++) {
      const entry = group[gi];
      const qNorm = qualities[gi];
      let withinBand: number;
      if (qMax === qMin || bandWidth <= 0) {
        withinBand = tierCeiling;
      } else {
        const qRatio = (qNorm - qMin) / (qMax - qMin);
        withinBand = tierFloor + bandWidth * qRatio;
      }
      const score = clampScore(Math.round(withinBand * 10) / 10, weight);
      scores.set(entry.responseId, score);
    }

    position = nextPosition;
  }

  return scores;
}

function tryNumericComparativeScoring(
  req: BidRequirementRow,
  vendors: VendorResponseRow[],
): Map<
  number,
  {
    score: number;
    rationale: string;
    confidence: number;
    evidence: TechnicalEvalEvidence[];
    rank?: number;
    peerCount?: number;
  }
> | null {
  if (!isObjectivelyMeasurableQuestion(req.question, req.scoringmethod)) return null;

  const weight = parseWeight(req.weight);
  const lowerBetter = isLowerBetterForRequirement(req.question);

  const measured = vendors.map((v) => {
    const rr = v.reqResponses.find((r) => r.reqId === req.id);
    const response = rr?.response || "";
    const value = extractComparableValue(response, req.question);
    return {
      responseId: v.responseId,
      response,
      value,
      hasResponse: !isEmptyResponse(response) && value !== null,
    };
  });

  const withValues = measured.filter((m) => m.hasResponse && m.value !== null) as Array<{
    responseId: number;
    response: string;
    value: number;
    hasResponse: true;
  }>;

  if (withValues.length < 2) return null;

  const sorted = [...withValues].sort((a, b) =>
    lowerBetter ? a.value - b.value : b.value - a.value,
  );

  const bestVal = sorted[0].value;
  const worstVal = sorted[sorted.length - 1].value;
  const range = Math.abs(bestVal - worstVal);

  let rank = 0;
  let prevValue: number | null = null;
  const rankEntries: Array<{
    responseId: number;
    rank: number;
    qualityScore: number;
    rationale: string;
    confidence: number;
    hasResponse: boolean;
  }> = [];

  for (const entry of sorted) {
    if (prevValue === null || entry.value !== prevValue) {
      rank += 1;
      prevValue = entry.value;
    }
    let qualityScore = 100;
    if (range > 0) {
      if (lowerBetter) {
        qualityScore = clampScore(((worstVal - entry.value) / range) * 100, 100);
      } else {
        qualityScore = clampScore(((entry.value - worstVal) / range) * 100, 100);
      }
    }
    rankEntries.push({
      responseId: entry.responseId,
      rank,
      qualityScore,
      rationale: `The supplier's value of ${entry.value} for this criterion is ${lowerBetter ? "less favorable when lower is better" : "less favorable when higher is better"} compared with other suppliers.`,
      confidence: 0.95,
      hasResponse: true,
    });
  }

  for (const m of measured) {
    if (!m.hasResponse) {
      rankEntries.push({
        responseId: m.responseId,
        rank: 9999,
        qualityScore: 0,
        rationale: "Vendor did not provide a measurable response to this requirement.",
        confidence: 1,
        hasResponse: false,
      });
    }
  }

  const distributed = distributeComparativeScores(weight, rankEntries);
  const respondingCount = withValues.length;
  const results = new Map<
    number,
    {
      score: number;
      rationale: string;
      confidence: number;
      evidence: TechnicalEvalEvidence[];
      rank?: number;
      peerCount?: number;
    }
  >();

  for (const entry of rankEntries) {
    const vendor = vendors.find((v) => v.responseId === entry.responseId);
    const rr = vendor?.reqResponses.find((r) => r.reqId === req.id);
    results.set(entry.responseId, {
      score: distributed.get(entry.responseId) ?? 0,
      rationale: entry.rationale,
      confidence: entry.confidence,
      evidence: rr?.response
        ? [{ source: "response_text", excerpt: String(rr.response).substring(0, 200) }]
        : [],
      rank: entry.hasResponse ? entry.rank : undefined,
      peerCount: respondingCount > 1 ? respondingCount : undefined,
    });
  }

  return results;
}

async function evaluateComparativeRequirement(
  req: BidRequirementRow,
  vendors: VendorResponseRow[],
): Promise<
  Map<
    number,
    {
      score: number;
      rationale: string;
      confidence: number;
      evidence: TechnicalEvalEvidence[];
      rank?: number;
      peerCount?: number;
    }
  >
> {
  const weight = parseWeight(req.weight);
  const results = new Map<
    number,
    {
      score: number;
      rationale: string;
      confidence: number;
      evidence: TechnicalEvalEvidence[];
      rank?: number;
      peerCount?: number;
    }
  >();

  const vendorPayload = vendors.map((v) => {
    const rr = v.reqResponses.find((r) => r.reqId === req.id);
    const responseText = (rr?.response || "").substring(0, MAX_RESPONSE_CHARS);
    return {
      responseId: v.responseId,
      supplierName: v.supplierName,
      response: responseText,
      hasResponse: !isEmptyResponse(responseText),
      documentEvidence: v.documentSnippets.slice(0, 2),
    };
  });

  const respondingCount = vendorPayload.filter((v) => v.hasResponse).length;

  if (respondingCount === 0) {
    for (const v of vendors) {
      results.set(v.responseId, {
        score: 0,
        rationale: "No supplier provided a response for this comparative requirement.",
        confidence: 1,
        evidence: [],
      });
    }
    return results;
  }

  const numericResults = tryNumericComparativeScoring(req, vendors);
  if (numericResults) return numericResults;

  const parsed = await callJsonLlm(
    "You compare supplier technical responses for a procurement requirement. Rank by relative quality — do NOT give high scores for merely answering. Return valid JSON only.",
    JSON.stringify({
      task: "comparative_evaluation",
      requirement: req.question,
      maxWeight: weight,
      suppliers: vendorPayload,
      rules: [
        "Compare ALL suppliers relative to each other for this requirement only.",
        "Rank by strength of experience, evidence, capability, methodology, innovation, delivery time, cost, or other measurable factors — not response length.",
        "For numeric or time-based criteria, rank by the most favorable value relative to requirement intent (e.g. shorter delivery is better unless stated otherwise).",
        "Do NOT award maximum marks simply because a supplier provided a valid answer.",
        "Reserve the highest rank (rank=1) for the strongest response(s) only.",
        "Weaker or less detailed responses must receive lower ranks even if they address the question.",
        "Unanswered or non-substantive responses receive the lowest rank and qualityScore near 0.",
        "Return rank (1=best) and qualityScore 0-100 for relative strength within the peer group.",
        "In rationale, write 1-2 concise business sentences explaining this supplier's strength or weakness vs other suppliers (e.g. longer delivery, fewer years of experience, higher cost). Do NOT mention rank numbers or scores.",
      ],
      returnFormat: {
        scores: [
          {
            responseId: "number",
            rank: "number (1=best)",
            qualityScore: "0-100 relative strength",
            rationale: "why this rank vs peers",
            confidence: "0-1",
          },
        ],
        comparativeNote: "brief comparison across suppliers",
      },
    }),
  );

  const rankEntries: Array<{
    responseId: number;
    rank: number;
    qualityScore: number;
    rationale: string;
    confidence: number;
    hasResponse: boolean;
  }> = [];

  for (const v of vendorPayload) {
    const entry = (parsed.scores || []).find((s: any) => Number(s.responseId) === Number(v.responseId));
    if (!v.hasResponse) {
      rankEntries.push({
        responseId: v.responseId,
        rank: 9999,
        qualityScore: 0,
        rationale: "Vendor did not provide a response to this requirement.",
        confidence: 1,
        hasResponse: false,
      });
      continue;
    }
    const rawQuality = Number(entry?.qualityScore);
    rankEntries.push({
      responseId: v.responseId,
      rank: Number(entry?.rank) || respondingCount,
      qualityScore: Number.isFinite(rawQuality) ? clampScore(rawQuality, 100) : 50,
      rationale: String(
        entry?.rationale ||
          parsed.comparativeNote ||
          "Comparative evaluation against peer responses.",
      ),
      confidence: Number(entry?.confidence) || 0.8,
      hasResponse: true,
    });
  }

  const distributed = distributeComparativeScores(weight, rankEntries);

  for (const entry of rankEntries) {
    const vendor = vendors.find((v) => v.responseId === entry.responseId);
    const rr = vendor?.reqResponses.find((r) => r.reqId === req.id);
    const finalScore = distributed.get(entry.responseId) ?? 0;
    results.set(entry.responseId, {
      score: finalScore,
      rationale: entry.rationale,
      confidence: entry.confidence,
      evidence: rr?.response
        ? [{ source: "response_text", excerpt: String(rr.response).substring(0, 200) }]
        : [],
      rank: entry.hasResponse ? entry.rank : undefined,
      peerCount: respondingCount > 1 ? respondingCount : undefined,
    });
  }

  for (const v of vendors) {
    if (!results.has(v.responseId)) {
      results.set(v.responseId, {
        score: 0,
        rationale: "No comparative score returned — response may be missing.",
        confidence: 0.5,
        evidence: [],
      });
    }
  }

  return results;
}

function buildRequirementScore(
  req: BidRequirementRow,
  response: string,
  result: {
    score: number;
    rationale: string;
    confidence: number;
    path: TechnicalScoringPath;
    normalizedAnswer?: string;
    evidence?: TechnicalEvalEvidence[];
    rank?: number;
    peerCount?: number;
  },
): TechnicalRequirementScore {
  const weight = parseWeight(req.weight);
  const score = clampScore(result.score, weight);
  const evidence: TechnicalEvalEvidence[] = [...(result.evidence || [])];
  if (response && !isEmptyResponse(response) && !evidence.some((e) => e.source === "response_text")) {
    evidence.unshift({
      source: "response_text",
      excerpt: response.substring(0, 300),
    });
  }

  const aiDetails: TechnicalEvalAiDetails = {
    scoringPath: result.path,
    confidence: result.confidence,
    score,
    maxScore: weight,
    normalizedAnswer: result.normalizedAnswer,
    supportingEvidence: evidence.slice(0, 5),
    internalRationale: result.rationale,
    rank: result.rank,
    comparativePeerCount: result.peerCount,
  };

  const reviewRemark = buildReviewRemark(req.question, score, weight, {
    vendorResponse: response,
    normalizedAnswer: result.normalizedAnswer,
    llmRationale: result.rationale,
    scoringPath: result.path,
    rank: result.rank,
    peerCount: result.peerCount,
  });

  return {
    requirementId: req.id,
    question: req.question,
    weight,
    vendorResponse: response,
    score,
    suggestedScore: toSuggestedScore(score, weight),
    maxScore: weight,
    rationale: result.rationale,
    reviewRemark,
    confidence: result.confidence,
    scoringPath: result.path,
    normalizedAnswer: result.normalizedAnswer,
    supportingEvidence: evidence.slice(0, 5),
    aiDetails,
  };
}

async function scoreDeterministicRequirement(
  req: BidRequirementRow,
  mode: EvaluationMode,
  response: string,
  evidence: TechnicalEvalEvidence[],
): Promise<TechnicalRequirementScore> {
  const options = parseLovOptions(req);

  if (mode === "dropdown" || mode === "binary") {
    if (isEmptyResponse(response)) {
      return buildRequirementScore(req, response, {
        score: 0,
        rationale: "Vendor did not provide a response to this requirement.",
        confidence: 1,
        path: "rule",
      });
    }

    let matched = matchOptionFuzzy(response, options);
    let path: TechnicalScoringPath = "rule";
    let confidence = 1;
    let normRationale = "";

    if (!matched) {
      const normalized = await normalizeResponseToOption(req.question, options, response);
      matched = normalized.option;
      confidence = normalized.confidence;
      normRationale = normalized.rationale;
      path = "hybrid";
    }

    if (matched) {
      const ruled = await scoreDropdownRule(req, matched);
      const usedLlmNormalization = path === "hybrid";
      return buildRequirementScore(req, response, {
        score: ruled.score,
        rationale: normRationale ? `${ruled.rationale} ${normRationale}` : ruled.rationale,
        confidence,
        path: usedLlmNormalization ? "hybrid" : "rule",
        normalizedAnswer: ruled.normalizedAnswer,
        evidence,
      });
    }

    return buildRequirementScore(req, response, {
      score: 0,
      rationale: "Response could not be mapped to any allowed option.",
      confidence: 0.6,
      path: "hybrid",
    });
  }

  if (mode === "compliance") {
    const ruleResult = scoreComplianceRule(req, response, evidence);
    if (ruleResult) {
      return buildRequirementScore(req, response, { ...ruleResult, evidence });
    }
    const llmResult = await evaluateComplianceWithLlm(req, response, evidence);
    return buildRequirementScore(req, response, { ...llmResult, evidence });
  }

  return buildRequirementScore(req, response, {
    score: 0,
    rationale: "Unsupported deterministic mode.",
    confidence: 0,
    path: "rule",
    evidence,
  });
}

async function extractDocumentSnippets(
  bidId: number,
  supplierId: number,
  supplierName: string,
): Promise<TechnicalEvalEvidence[]> {
  const result = await db.execute(sql`
    SELECT attach_name, attach_path, attach_type
    FROM dbo.supp_bid_attachment_dtls
    WHERE bidrefno = ${bidId}
      AND supplier_id = ${supplierId}
      AND attach_source IN ('Technical', 'Technical-line')
      AND status = 'Active'
    ORDER BY id
    LIMIT ${MAX_DOCS_PER_RESPONSE}
  `);

  const snippets: TechnicalEvalEvidence[] = [];
  for (const row of result.rows as any[]) {
    const path = String(row.attach_path || "");
    if (!path.startsWith("http")) continue;
    try {
      const buffer = await downloadFileFromAzure(path);
      if (buffer.length === 0 || buffer.length > MAX_DOC_BYTES) continue;

      const mimeType = String(row.attach_type || "application/pdf");
      const isImage = mimeType.startsWith("image/");
      const isPdf = mimeType.includes("pdf");
      if (!isImage && !isPdf) continue;

      const base64 = buffer.toString("base64");
      try {
        const openai = await getAIClient();
        const visionResponse = await openai.chat.completions.create({
          model: await getAIModelName(),
          temperature: 0,
          max_tokens: 600,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract the most relevant technical facts from this supplier document for bid evaluation (certifications, capabilities, dates). Return JSON: { excerpt: string }",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${base64.substring(0, Math.min(base64.length, 8_000_000))}`,
                  },
                },
              ],
            },
          ],
          response_format: { type: "json_object" },
        });
        const visionParsed = JSON.parse(visionResponse.choices[0]?.message?.content || "{}");
        const excerpt = String(visionParsed.excerpt || "").substring(0, MAX_DOC_EXCERPT_CHARS);
        if (excerpt) {
          snippets.push({
            source: "attachment",
            documentName: String(row.attach_name || "document"),
            excerpt,
          });
        }
      } catch {
        // skip unreadable document
      }
    } catch (err: any) {
      console.warn(`[TechEval] Document extract skipped for ${supplierName}:`, err?.message);
    }
  }
  return snippets;
}

function computeOverallScore(scores: TechnicalRequirementScore[]): number {
  const totalWeight = scores.reduce((s, r) => s + r.weight, 0);
  const totalScore = scores.reduce((s, r) => s + (r.score ?? 0), 0);
  if (totalWeight <= 0) return 0;
  return Math.round((totalScore / totalWeight) * 100);
}

function buildOverallRationale(scores: TechnicalRequirementScore[]): string {
  const met = scores.filter((s) => (s.score ?? 0) >= s.maxScore).length;
  const partial = scores.filter((s) => {
    const sc = s.score ?? 0;
    return sc > 0 && sc < s.maxScore;
  }).length;
  const missed = scores.filter((s) => (s.score ?? 0) === 0).length;
  return `Technical evaluation: ${met} requirements fully met, ${partial} partially met, ${missed} not met (AI-assisted hybrid scoring).`;
}

export function formatTechnicalEvalRemark(score: TechnicalRequirementScore): string {
  return getPersistedReviewRemark(score);
}

export async function runHybridTechnicalEvaluation(bidId: number): Promise<TechnicalEvalResult> {
  const requirements = await db.execute(sql`
    SELECT id, category, question, qvoption, qvtype, weight, scoringmethod, lov, knockoutscore
    FROM dbo.supp_bid_requirement_dtls
    WHERE bidrefno = ${bidId}
      AND LOWER(category) NOT IN ('commercial', 'finance', 'financial')
    ORDER BY id
  `);
  const reqRows = requirements.rows as unknown as BidRequirementRow[];
  if (reqRows.length === 0) throw { status: 400, message: "No technical requirements found for this bid" };

  const responses = await db.execute(sql`
    SELECT r.id, r.supplier_name, r.supplier_id, r.status
    FROM dbo.supp_bid_response_dtls r
    WHERE r.bidrefno = ${bidId} AND r.status NOT IN ('Draft', 'Cancelled')
    ORDER BY r.id
  `);
  const respRows = responses.rows as any[];
  if (respRows.length === 0) throw { status: 400, message: "No submitted responses found for this bid" };

  const vendorData: VendorResponseRow[] = [];
  for (const resp of respRows) {
    const reqResponses = await db.execute(sql`
      SELECT rr.bid_req_id, rr.response, rr.remarks, rr.question, rr.category
      FROM dbo.supp_bid_response_reqmnt_dtls rr
      WHERE rr.bid_resp_id = ${resp.id}
    `);
    const documentSnippets = await extractDocumentSnippets(
      bidId,
      Number(resp.supplier_id),
      String(resp.supplier_name || ""),
    );
    vendorData.push({
      responseId: resp.id,
      supplierName: resp.supplier_name,
      supplierId: Number(resp.supplier_id),
      reqResponses: (reqResponses.rows as any[]).map((rr) => {
        let reqId = Number(rr.bid_req_id);
        if (!reqId || reqId === 0) {
          const match = reqRows.find(
            (br) =>
              normalizeText(br.question) === normalizeText(String(rr.question || "")) &&
              normalizeText(br.category) === normalizeText(String(rr.category || "")),
          );
          if (match) reqId = match.id;
        }
        return {
          reqId,
          response: String(rr.response || "").substring(0, MAX_RESPONSE_CHARS),
          remarks: String(rr.remarks || "").substring(0, 200),
        };
      }),
      documentSnippets,
    });
  }

  const scoresByResponse = new Map<number, TechnicalRequirementScore[]>();
  for (const v of vendorData) {
    scoresByResponse.set(v.responseId, []);
  }

  // Pre-build semantic option maps once per structured requirement (cached; LLM classifies intent only)
  const structuredReqs = reqRows.filter((req) => {
    const mode = classifyRequirement(req);
    return mode === "dropdown" || mode === "binary";
  });
  await Promise.all(structuredReqs.map((req) => buildSemanticOptionScoreMap(req)));

  const comparativeReqs: BidRequirementRow[] = [];
  const textReqs: BidRequirementRow[] = [];

  for (const req of reqRows) {
    const mode = classifyRequirement(req);

    if (mode === "comparative") {
      comparativeReqs.push(req);
      continue;
    }

    if (mode === "text") {
      textReqs.push(req);
      continue;
    }

    for (const vendor of vendorData) {
      const rr = vendor.reqResponses.find((r) => r.reqId === req.id);
      const response = rr?.response || "";
      const score = await scoreDeterministicRequirement(req, mode, response, vendor.documentSnippets);
      scoresByResponse.get(vendor.responseId)!.push(score);
    }
  }

  for (const req of comparativeReqs) {
    const compResults = await evaluateComparativeRequirement(req, vendorData);
    for (const vendor of vendorData) {
      const rr = vendor.reqResponses.find((r) => r.reqId === req.id);
      const response = rr?.response || "";
      const cr = compResults.get(vendor.responseId)!;
      scoresByResponse.get(vendor.responseId)!.push(
        buildRequirementScore(req, response, {
          score: cr.score,
          rationale: cr.rationale,
          confidence: cr.confidence,
          path: "llm",
          evidence: [...cr.evidence, ...vendor.documentSnippets.slice(0, 2)],
          rank: cr.rank,
          peerCount: cr.peerCount,
        }),
      );
    }
  }

  for (const req of textReqs) {
    for (const vendor of vendorData) {
      const rr = vendor.reqResponses.find((r) => r.reqId === req.id);
      const response = rr?.response || "";
      const tr = await evaluateTextRequirement(req, response, vendor.documentSnippets);
      scoresByResponse.get(vendor.responseId)!.push(
        buildRequirementScore(req, response, {
          ...tr,
          evidence: vendor.documentSnippets.slice(0, 3),
        }),
      );
    }
  }

  const responseResults = vendorData.map((v) => {
    const reqScores = scoresByResponse.get(v.responseId) || [];
    reqScores.sort((a, b) => a.requirementId - b.requirementId);
    return {
      responseId: v.responseId,
      supplierName: v.supplierName,
      suggestedTechScore: computeOverallScore(reqScores),
      requirementScores: reqScores,
      overallRationale: buildOverallRationale(reqScores),
    };
  });

  let comparativeSummary = "";
  if (responseResults.length > 1) {
    try {
      const parsed = await callJsonLlm(
        "Summarize comparative technical evaluation across suppliers. Return valid JSON only.",
        JSON.stringify({
          task: "comparative_summary",
          suppliers: responseResults.map((r) => ({
            name: r.supplierName,
            overallScore: r.suggestedTechScore,
            highlights: r.overallRationale,
          })),
          returnFormat: { comparativeSummary: "2-3 sentences" },
        }),
      );
      comparativeSummary = String(parsed.comparativeSummary || "");
    } catch {
      comparativeSummary = responseResults
        .sort((a, b) => b.suggestedTechScore - a.suggestedTechScore)
        .map((r, i) => `${i + 1}. ${r.supplierName} (${r.suggestedTechScore}%)`)
        .join("; ");
    }
  }

  return {
    responses: responseResults,
    comparativeSummary,
  };
}

/** Resolve persisted score (weight units preferred, else legacy 0–10 scale). */
export function resolveTechnicalEvalPersistedScore(
  aiReqScore: { score?: number; suggestedScore?: number },
  maxWeight: number,
): number {
  const direct = Number(aiReqScore.score);
  if (Number.isFinite(direct) && direct >= 0) {
    return clampScore(Math.round(direct * 10) / 10, maxWeight);
  }
  const raw = Number(aiReqScore.suggestedScore);
  if (Number.isNaN(raw)) return 0;
  const scaled = Math.round((raw / 10) * maxWeight * 10) / 10;
  return clampScore(scaled, maxWeight);
}
