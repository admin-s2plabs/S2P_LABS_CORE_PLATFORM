// Shared design tokens for the Negotiation Intelligence and Supplier Cost
// Intelligence agent results panels. Ported from a Figma-Make reference
// (flat cards, "Google Sans" typography, navy/steel/sky chart accents).
// Deliberately light-theme only, matching the reference — these two panels
// don't follow the app's dark-mode toggle.
//
// Recharts needs literal color strings (stroke/fill/tick.fill), so these
// stay as plain hex constants rather than Tailwind classes.

export const INTEL_COLOR = {
  ink: "#1a1a18",
  border: "#ebebeb",
  borderLight: "#f5f5f4",
  bgSubtle: "#fafafa",
  textMuted: "#888888",
  textFaint: "#bbbbbb",
  textBody: "#333333",
  navy: "#1e3a5f",
  steel: "#2d6a8f",
  sky: "#4a9bbe",
  skyPale: "#8ec6db",
  green: "#43a047",
  greenAlt: "#16a34a",
  red: "#e53935",
  redAlt: "#dc2626",
  amber: "#f59e0b",
  amberDeep: "#e65100",
  amberAlt: "#b45309",
  blue: "#3b82f6",
} as const;

export const INTEL_FONT = "'Google Sans', sans-serif";
export const INTEL_FONT_MONO = "'Google Sans Mono', 'Google Sans', sans-serif";

// Flat white card — the base building block for every section on both pages.
export const INTEL_CARD =
  "bg-white border border-[#ebebeb] rounded-lg p-[18px_20px] font-['Google_Sans']";

// Small uppercase section heading used above every card's content.
export const INTEL_LABEL =
  "font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.1em] mb-3";

export const INTEL_BODY = "font-['Google_Sans'] text-[#333333]";
