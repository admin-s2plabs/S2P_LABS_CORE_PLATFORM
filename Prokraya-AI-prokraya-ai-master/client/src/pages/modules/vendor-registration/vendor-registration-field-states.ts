/**
 * AI-assisted registration: two visual states only (amber = review, red = required missing).
 * Locked company fields stay neutral (read-only / not part of review highlights).
 */

import type { VendorRegistrationDraftSession } from "@/pages/modules/vendor-registration/vendor-registration-draft-context";

/** No amber/red — neutral disabled styling only (parent uses disabled UI). */
export const AI_HIGHLIGHT_NEUTRAL_COMPANY_KEYS = new Set(["phone", "email_id"]);

const AMBER =
  "ring-2 ring-amber-500/45 border-amber-500/30 bg-amber-500/[0.07] rounded-md";
const RED =
  "ring-2 ring-destructive/50 border-destructive/35 bg-destructive/[0.06] rounded-md";

/**
 * Manual company form: when AI highlight mode is on, mandatory empty → red; any other non-empty, non-locked field → amber.
 */
export function companyFieldHighlightClass(
  draft: VendorRegistrationDraftSession | null,
  fieldKey: string,
  highlightMode: boolean,
  isMissingMandatory: boolean,
  hasValue: boolean,
): string {
  if (!draft || !highlightMode) return "";
  if (AI_HIGHLIGHT_NEUTRAL_COMPANY_KEYS.has(fieldKey)) return "";
  if (isMissingMandatory) return RED;
  if (hasValue) return AMBER;
  return "";
}

/**
 * Banking form (sheet): same two-state rules; no locked keys in banking highlight set.
 */
export function bankingFieldHighlightClass(
  draft: VendorRegistrationDraftSession | null,
  fieldKey: string,
  highlightMode: boolean,
  isMissingMandatory: boolean,
  hasValue: boolean,
): string {
  if (!draft || !highlightMode) return "";
  if (isMissingMandatory) return RED;
  if (hasValue) return AMBER;
  return "";
}
