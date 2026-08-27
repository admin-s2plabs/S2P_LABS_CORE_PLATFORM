/**
 * Server-side re-exports of shared mention helpers (kept so existing
 * `from "./agent-mention-utils"` imports keep working).
 */
export {
  applyAllMentionsToPrompt,
  applySupplierMentionsToPrompt,
  normalizeBidMentions,
  normalizeBusinessUserMentions,
  normalizeInvoiceMentions,
  normalizeItemMentions,
  normalizePoMentions,
  normalizePrMentions,
  normalizeSupplierMentions,
  type AgentMentionPayload,
  type NormalizedBidMention,
  type NormalizedBusinessUserMention,
  type NormalizedInvoiceMention,
  type NormalizedItemMention,
  type NormalizedPoMention,
  type NormalizedPrMention,
  type NormalizedSupplierMention,
} from "@shared/agent-mention";
