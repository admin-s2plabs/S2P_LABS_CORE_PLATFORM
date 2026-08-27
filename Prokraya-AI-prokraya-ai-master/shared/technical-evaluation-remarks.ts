import type {
  TechnicalEvalAiDetails,
  TechnicalRequirementScore,
  TechnicalScoringPath,
} from "./technical-evaluation";

const MAX_REVIEW_REMARK_CHARS = 250;

type ScoreBand = "none" | "partial" | "full";
type QuestionTheme =
  | "iso"
  | "delivery"
  | "cost"
  | "experience"
  | "methodology"
  | "capability"
  | "risk"
  | "procurement"
  | "generic";

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= MAX_REVIEW_REMARK_CHARS) return t;
  return `${t.substring(0, MAX_REVIEW_REMARK_CHARS - 1).trim()}…`;
}

function isEmptyResponse(response: string): boolean {
  const t = String(response || "").trim();
  return !t || t === "-" || t.toLowerCase() === "n/a";
}

function isPositiveAnswer(text: string): boolean {
  const o = normalizeText(text);
  return ["yes", "y", "true", "affirmative", "agree", "confirmed", "certified", "available", "documented"].some(
    (p) => o === p || o.startsWith(`${p} `),
  );
}

function isNegativeAnswer(text: string): boolean {
  const o = normalizeText(text);
  return ["no", "n", "false", "none", "not applicable", "na", "not certified", "invalid", "not available"].some(
    (p) => o === p || o.startsWith(`${p} `),
  );
}

function isPartialAnswer(text: string): boolean {
  const o = normalizeText(text);
  const partialPatterns = [
    "partial",
    "partially",
    "in progress",
    "in development",
    "under development",
    "limited",
    "minimal",
    "pending",
    "planned",
    "not yet",
  ];
  return partialPatterns.some((p) => o.includes(p));
}

function scoreBand(score: number, maxScore: number): ScoreBand {
  if (maxScore <= 0 || score <= 0) return "none";
  if (score >= maxScore) return "full";
  return "partial";
}

function questionTheme(question: string): QuestionTheme {
  const q = normalizeText(question);
  if (q.includes("iso") || q.includes("certification") || q.includes("certified")) return "iso";
  if (/delivery|lead time|turnaround|response time|cycle time|time to deliver/.test(q)) return "delivery";
  if (/cost|price|budget|fee|rate|pricing/.test(q)) return "cost";
  if (/methodology|approach|implementation plan|delivery approach/.test(q)) return "methodology";
  if (/capability|capabilities|expertise|technical capacity/.test(q)) return "capability";
  if (/innovation|novel|unique approach/.test(q)) return "methodology";
  if (/experience|years|project|past performance|track record|customer base|client base/.test(q)) return "experience";
  if (q.includes("risk")) return "risk";
  if (q.includes("procurement") || q.includes("compliance")) return "procurement";
  return "generic";
}

function comparativeDimensionLabel(theme: QuestionTheme, question: string): string {
  switch (theme) {
    case "delivery":
      return "delivery time";
    case "cost":
      return "cost";
    case "experience":
      return "experience";
    case "methodology":
      return "methodology";
    case "capability":
      return "capability";
    case "iso":
      return "certification status";
    case "risk":
      return "risk management approach";
    case "procurement":
      return "procurement compliance";
    default: {
      const q = normalizeText(question);
      if (/time|days|weeks|months/.test(q)) return "timeframe";
      if (/percent|rate|volume|capacity/.test(q)) return "performance level";
      return "response quality";
    }
  }
}

function extractIsoLabel(question: string): string | null {
  const match = String(question || "").match(/\bISO\s*\d{4,5}(?:\s*:\s*\d{4})?\b/i);
  return match ? match[0].replace(/\s+/g, " ").trim() : null;
}

function isoCertName(question: string): string {
  return extractIsoLabel(question) || "the required certification";
}

function responseSignals(vendorResponse: string, normalizedAnswer?: string) {
  const combined = normalizeText(`${vendorResponse} ${normalizedAnswer || ""}`);
  return {
    inProgress: /\bin progress\b|\bunderway\b|\bpending\b/.test(combined),
    inDevelopment: /\bin development\b|\bunder development\b/.test(combined),
    notCertified: /\bnot certified\b|\bno certification\b/.test(combined),
  };
}

function quoteOption(label: string): string {
  const t = label.trim();
  if (!t) return "the selected response";
  return t.length <= 60 ? `"${t}"` : "the selected response";
}

/** Remove internal scoring metadata while preserving business meaning. */
function sanitizeRationaleForReviewers(text: string): string {
  return String(text || "")
    .replace(/\[AI\s+\w+[^\]]*\]/gi, "")
    .replace(/\bconfidence\s*:?\s*\d+%/gi, "")
    .replace(/\bscore\s*:?\s*\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?/gi, "")
    .replace(/—\s*score\s+\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?/gi, "")
    .replace(/\bmaximum score\s+\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?/gi, "")
    .replace(/normalized answer:[^\n.]*/gi, "")
    .replace(/\brank\s*\d+\s*of\s*\d+/gi, "")
    .replace(/\([^)]*\btier\b[^)]*\)/gi, "")
    .replace(/\bbased on semantic value[^.]*\.?/gi, "")
    .replace(/\bsemantic scale[^.]*\.?/gi, "")
    .replace(/\btier in ordinal scale[^.]*\.?/gi, "")
    .replace(/AI recommendations are advisory only[^\n]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuotedOption(text: string): string | null {
  const match = String(text || "").match(/Option\s+"([^"]+)"/i) || String(text || "").match(/option:\s*"([^"]+)"/i);
  return match?.[1]?.trim() || null;
}

interface RationaleTransformCtx {
  question: string;
  theme: QuestionTheme;
  band: ScoreBand;
  vendorResponse?: string;
  normalizedAnswer?: string;
  rank?: number;
  peerCount?: number;
}

/** Convert engine scoring rationale into a business-friendly review remark. */
function transformInternalRationaleToRemark(
  rawRationale: string,
  ctx: RationaleTransformCtx,
): string | null {
  const raw = String(rawRationale || "").trim();
  if (!raw) return null;

  const { question, theme, band, normalizedAnswer, vendorResponse } = ctx;
  const cert = isoCertName(question);
  const dimension = comparativeDimensionLabel(theme, question);
  const answer = normalizedAnswer || vendorResponse || extractQuotedOption(raw) || "";
  const quoted = quoteOption(answer);
  const comparative = (ctx.peerCount ?? 0) > 1;
  const lower = normalizeText(raw);

  // --- Empty / missing response ---
  if (/vendor did not provide|no response provided|no supplier provided a response|no comparative score returned/i.test(raw)) {
    return "The supplier did not provide a response to this requirement.";
  }

  if (/response could not be mapped to any allowed option/i.test(raw)) {
    return "The supplier's response could not be mapped to an allowed option; the requirement is not met.";
  }

  if (/could not normalize response to a dropdown option/i.test(raw)) {
    return "The supplier's response could not be matched to a valid option; the requirement is not met.";
  }

  // --- Option-based rule / semantic scoring ---
  const optionLabel = extractQuotedOption(raw);
  if (optionLabel || /^option\b/i.test(raw) || /scored based on selected option/i.test(raw)) {
    const opt = optionLabel || answer;
    const optQuoted = quoteOption(opt);

    if (/disqualifying/i.test(raw)) {
      return `The supplier responded ${optQuoted}, which is a disqualifying answer; the requirement is not met.`;
    }
    if (/fully satisfies|maximum score/i.test(raw)) {
      if (theme === "iso") {
        return `The supplier confirmed ${optQuoted} and meets the ${cert} requirement.`;
      }
      return `The supplier responded ${optQuoted} and fully meets this requirement.`;
    }
    if (/partially satisfies|partial/i.test(raw)) {
      if (theme === "iso") {
        return `The supplier responded ${optQuoted}; certification is incomplete and only partially satisfies the ${cert} requirement.`;
      }
      if (theme === "risk") {
        return `The supplier responded ${optQuoted}; the risk management process is still maturing and only partially meets the requirement.`;
      }
      return `The supplier responded ${optQuoted}, which only partially satisfies this requirement.`;
    }
    if (/does not meet|could not be ranked/i.test(raw)) {
      if (theme === "iso") {
        return `The supplier responded ${optQuoted} and does not meet the ${cert} requirement.`;
      }
      return `The supplier responded ${optQuoted}; the requirement is not met.`;
    }
    if (/scored based on selected option/i.test(raw)) {
      if (band === "full") {
        return `The supplier responded ${optQuoted} and fully meets this requirement.`;
      }
      if (band === "partial") {
        return `The supplier responded ${optQuoted}, which only partially satisfies this requirement.`;
      }
      return `The supplier responded ${optQuoted}; the requirement is not met.`;
    }
  }

  // --- Binary / compliance rule rationales ---
  if (/disqualifying response selected|disqualifying affirmative response/i.test(raw)) {
    return "The supplier gave a disqualifying affirmative response; the requirement is not met.";
  }
  if (/acceptable response.*no disqualifying|requirement satisfied.*disqualifying answer not indicated/i.test(raw)) {
    return "The supplier's response does not indicate a disqualifying affiliation; the requirement is met.";
  }
  if (/^requirement fully met based on selected response/i.test(lower)) {
    if (theme === "iso" && answer) {
      return `The supplier confirmed ${quoted} and meets the ${cert} requirement.`;
    }
    return answer
      ? `The supplier responded ${quoted} and fully meets this requirement.`
      : "The supplier's response fully meets this requirement.";
  }
  if (/^requirement not met based on selected response/i.test(lower)) {
    return answer
      ? `The supplier responded ${quoted}; the requirement is not met.`
      : "The supplier's response does not meet this requirement.";
  }
  if (/requirement partially met.*partial compliance|work in progress/i.test(raw)) {
    const detail = answer ? ` (${quoted})` : "";
    if (theme === "iso") {
      return `Certification${detail} is incomplete or in progress; only a partial score has been awarded.`;
    }
    return `The supplier's response${detail} indicates partial compliance or work still in progress; a partial score has been awarded.`;
  }
  if (/requirement fully met.*supporting document evidence/i.test(raw)) {
    return answer
      ? `The supplier confirmed ${quoted} with supporting documentation; the requirement is fully met.`
      : "The supplier confirmed compliance with supporting documentation; the requirement is fully met.";
  }
  if (/requirement fully met.*confirms compliance/i.test(raw)) {
    return answer
      ? `The supplier responded ${quoted} and fully meets this requirement.`
      : "The supplier's response confirms compliance and fully meets this requirement.";
  }
  if (/requirement not met.*non-compliance|absence/i.test(raw)) {
    return answer
      ? `The supplier responded ${quoted}; the requirement is not met due to non-compliance or absence.`
      : "The supplier's response indicates non-compliance; the requirement is not met.";
  }

  // --- Response normalization ---
  if (/response matched option/i.test(raw)) {
    const matched = extractQuotedOption(raw) || answer;
    const mQuoted = quoteOption(matched);
    if (band === "full") return `The supplier's response aligns with ${mQuoted} and fully meets this requirement.`;
    if (band === "partial") return `The supplier's response aligns with ${mQuoted}, which only partially satisfies this requirement.`;
    return `The supplier's response aligns with ${mQuoted}; the requirement is not met.`;
  }

  // --- Numeric comparative ---
  const valueMatch = raw.match(/value of\s+([\d.]+)/i) || raw.match(/Measured value\s+([\d.]+)/i);
  if (valueMatch) {
    const value = valueMatch[1];
    const lowerBetter = /lower is better/i.test(raw);
    const valuePhrase = `approximately ${value}`;
    if (band === "none") {
      return `The supplier's ${dimension} (${valuePhrase}) is the least favorable compared with other suppliers; the requirement is not met.`;
    }
    if (band === "partial") {
      if (theme === "delivery" && lowerBetter) {
        return `The supplier quoted ${valuePhrase} for ${dimension}, which is longer than other suppliers; a partial score has been awarded.`;
      }
      return `The supplier's ${dimension} (${valuePhrase}) is less favorable than other suppliers; a partial score has been awarded.`;
    }
    if (ctx.rank === 1) {
      return `The supplier's ${dimension} (${valuePhrase}) is the most favorable compared with other suppliers and fully meets this requirement.`;
    }
    return `The supplier's ${dimension} (${valuePhrase}) is among the stronger responses compared with other suppliers.`;
  }

  // --- Generic comparative fallback from engine ---
  if (/comparative evaluation against peer responses/i.test(raw) && comparative) {
    return null;
  }

  // --- LLM / hybrid free-text rationale: sanitize and use directly ---
  const cleaned = sanitizeRationaleForReviewers(raw);
  if (cleaned.length >= 15) {
    let remark = cleaned
      .replace(/^Option\s+"([^"]+)"\s*/i, (_, opt) => `The supplier responded "${opt}" — `)
      .replace(/^Vendor\s+/i, "The supplier ")
      .replace(/\bVendor\b/g, "The supplier");

    if (!/[.!?]$/.test(remark)) remark += ".";
    return remark;
  }

  return null;
}

/** Phrase-level alignment only — never replace the whole remark with a template. */
function enforceBandConsistency(
  remark: string,
  band: ScoreBand,
  ctx: { rank?: number; peerCount?: number; comparative?: boolean },
): string {
  let t = remark.trim();
  const comparative = ctx.comparative ?? (ctx.peerCount ?? 0) > 1;
  const rank = ctx.rank ?? 999;

  if (band === "none") {
    t = t.replace(/\b(fully meets|strongest|best among|maximum score|full marks)\b/gi, "does not fully meet");
    if (!/\bnot met\b|does not meet|non-?compliant|weaker|less favorable|insufficient|did not provide/i.test(t)) {
      t = `${t.replace(/[.!?]$/, "")}; the requirement is not met.`;
    }
  }

  if (band === "partial") {
    if (/\b(fully meets|requirement is met|strongest|best among)\b/i.test(t) && (comparative ? rank > 1 : true)) {
      t = t.replace(/\b(fully meets|requirement is met)\b/gi, "partially meets");
    }
    if (comparative && rank > 1 && /\b(strongest|best among|leading|most favorable)\b/i.test(t)) {
      t = t.replace(/\b(strongest|best among|leading|most favorable)\b/gi, "competitive");
    }
  }

  if (band === "full" && comparative && rank > 1) {
    if (/\b(strongest|best among|leading|most favorable)\b/i.test(t)) {
      t = t.replace(
        /\b(strongest|best among|leading|most favorable)\b/gi,
        "competitive",
      );
    }
  }

  return t;
}

function remarkFromSelectedOption(
  answer: string,
  band: ScoreBand,
  question: string,
  theme: QuestionTheme,
): string | null {
  if (!answer.trim()) return null;
  const quoted = quoteOption(answer);

  if (isNegativeAnswer(answer)) {
    if (theme === "iso") {
      return `The supplier responded ${quoted} and does not meet the ${isoCertName(question)} requirement.`;
    }
    return `The supplier responded ${quoted}; the requirement is not met.`;
  }

  if (isPartialAnswer(answer)) {
    if (band === "none") {
      return `The supplier responded ${quoted}; compliance is incomplete and the requirement is not met.`;
    }
    if (theme === "iso") {
      return `The supplier responded ${quoted}; certification is incomplete and only partially satisfies the requirement.`;
    }
    if (theme === "risk") {
      return `The supplier responded ${quoted}; the risk management process is still maturing and only partially meets the requirement.`;
    }
    return `The supplier responded ${quoted}, which only partially satisfies this requirement.`;
  }

  if (isPositiveAnswer(answer) && band === "full") {
    if (theme === "iso") {
      return `The supplier confirmed ${quoted} and meets the ${isoCertName(question)} requirement.`;
    }
    return `The supplier responded ${quoted} and fully meets this requirement.`;
  }

  if (isPositiveAnswer(answer) && band === "partial") {
    return `Although the supplier responded ${quoted}, supporting evidence is limited relative to the requirement.`;
  }

  return null;
}

/** Last-resort fallback when no scoring rationale is available. */
function remarkFromTemplates(
  question: string,
  band: ScoreBand,
  theme: QuestionTheme,
  ctx: {
    vendorResponse?: string;
    normalizedAnswer?: string;
  },
): string {
  const signals = responseSignals(ctx.vendorResponse || "", ctx.normalizedAnswer);
  const cert = isoCertName(question);
  const answer = ctx.normalizedAnswer || ctx.vendorResponse || "";

  const optionRemark = remarkFromSelectedOption(answer, band, question, theme);
  if (optionRemark) return optionRemark;

  if (band === "full") {
    switch (theme) {
      case "iso":
        return `The supplier holds ${cert} and meets the certification requirement.`;
      case "risk":
        return "The supplier's documented risk management process meets this requirement.";
      case "procurement":
        return "The supplier demonstrates adequate procurement compliance for this requirement.";
      default:
        return "The supplier fully meets this requirement based on the response provided.";
    }
  }

  if (band === "none") {
    switch (theme) {
      case "iso":
        if (signals.inProgress) {
          return `The supplier does not currently hold ${cert}; certification is still in progress and the requirement is not met.`;
        }
        return `The supplier does not meet the ${cert} requirement.`;
      case "risk":
        if (signals.inDevelopment) {
          return "The supplier's risk management process is under development and does not meet the documented requirement.";
        }
        return "The supplier's risk management process does not meet the documented requirement.";
      default:
        return "The requirement is not met based on the supplier's response.";
    }
  }

  switch (theme) {
    case "iso":
      if (signals.inProgress) {
        return `${cert} is in progress; the response only partially satisfies the requirement.`;
      }
      return "Certification is only partially demonstrated.";
    case "risk":
      if (signals.inDevelopment) {
        return "The supplier's risk management process is still under development and only partially meets the requirement.";
      }
      return "The supplier's risk management process only partially meets the documented requirement.";
    case "procurement":
      return "The supplier provides limited compliance evidence for this requirement.";
    default:
      return "The supplier's response only partially satisfies this requirement.";
  }
}

/**
 * Business-friendly review remark for procurement reviewers (≤250 chars).
 * Derived from scoring rationale; templates are last-resort only.
 */
export function buildReviewRemark(
  question: string,
  score: number,
  maxScore: number,
  ctx?: {
    vendorResponse?: string;
    normalizedAnswer?: string;
    llmRationale?: string;
    scoringPath?: TechnicalScoringPath;
    rank?: number;
    peerCount?: number;
  },
): string {
  const band = scoreBand(score, maxScore);
  const theme = questionTheme(question);
  const comparative = (ctx?.peerCount ?? 0) > 1;
  const transformCtx: RationaleTransformCtx = {
    question,
    theme,
    band,
    vendorResponse: ctx?.vendorResponse,
    normalizedAnswer: ctx?.normalizedAnswer,
    rank: ctx?.rank,
    peerCount: ctx?.peerCount,
  };

  if (isEmptyResponse(ctx?.vendorResponse || "") && band === "none") {
    const fromRationale = transformInternalRationaleToRemark(ctx?.llmRationale || "", transformCtx);
    if (fromRationale) return truncate(fromRationale);
    return truncate("The supplier did not provide a response to this requirement.");
  }

  const fromRationale = transformInternalRationaleToRemark(ctx?.llmRationale || "", transformCtx);
  if (fromRationale) {
    return truncate(
      enforceBandConsistency(fromRationale, band, {
        rank: ctx?.rank,
        peerCount: ctx?.peerCount,
        comparative,
      }),
    );
  }

  const answer = ctx?.normalizedAnswer || ctx?.vendorResponse || "";
  const fromOption = remarkFromSelectedOption(answer, band, question, theme);
  if (fromOption) {
    return truncate(
      enforceBandConsistency(fromOption, band, {
        rank: ctx?.rank,
        peerCount: ctx?.peerCount,
        comparative,
      }),
    );
  }

  return truncate(
    enforceBandConsistency(
      remarkFromTemplates(question, band, theme, {
        vendorResponse: ctx?.vendorResponse,
        normalizedAnswer: ctx?.normalizedAnswer,
      }),
      band,
      { rank: ctx?.rank, peerCount: ctx?.peerCount, comparative },
    ),
  );
}

export function buildAiDetails(score: TechnicalRequirementScore): TechnicalEvalAiDetails {
  return {
    scoringPath: score.scoringPath,
    confidence: score.confidence,
    score: score.score,
    maxScore: score.maxScore,
    normalizedAnswer: score.normalizedAnswer,
    supportingEvidence: score.supportingEvidence,
    internalRationale: score.rationale,
    rank: score.aiDetails?.rank,
    comparativePeerCount: score.aiDetails?.comparativePeerCount,
  };
}

/** Text persisted to Review Remarks / comments column. */
export function getPersistedReviewRemark(score: TechnicalRequirementScore): string {
  if (score.reviewRemark?.trim()) {
    return truncate(score.reviewRemark);
  }
  return buildReviewRemark(score.question, score.score ?? 0, score.maxScore, {
    vendorResponse: score.vendorResponse,
    normalizedAnswer: score.normalizedAnswer,
    llmRationale: score.rationale,
    scoringPath: score.scoringPath,
    rank: score.aiDetails?.rank,
    peerCount: score.aiDetails?.comparativePeerCount,
  });
}
