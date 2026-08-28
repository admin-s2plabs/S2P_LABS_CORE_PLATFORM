import type { SupplierMention } from "@shared/agent-mention";
import {
  useAgentMentions,
  type UseAgentMentionsResult,
} from "@/hooks/useAgentMentions";

/**
 * @deprecated Prefer {@link useAgentMentions}. Kept as a thin wrapper so
 * Negotiation / Cost Intelligence keep working while they migrate.
 *
 * Now enables the full mention set (`@ # / ^ & %`) so all agents share the
 * same capability; `mentions` remains an alias for supplier mentions.
 */
export type UseSupplierMentionsResult = UseAgentMentionsResult & {
  /** @deprecated Use supplierMentions */
  mentions: SupplierMention[];
};

export function useSupplierMentions(options?: {
  scopeOfSupplyOnly?: boolean;
}): UseSupplierMentionsResult {
  return useAgentMentions({
    scopeOfSupplyOnly: options?.scopeOfSupplyOnly,
  });
}
