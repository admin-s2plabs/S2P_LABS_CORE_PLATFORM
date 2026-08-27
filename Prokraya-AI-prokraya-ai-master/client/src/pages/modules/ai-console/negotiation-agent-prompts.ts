export interface PromptCategory {
  module: string;
  icon: string;
  prompts: string[];
}

export const negotiationAgentPrompts: PromptCategory[] = [
  {
    module: "Bid Analysis",
    icon: "TrendingUp",
    prompts: [
      "Analyze negotiation opportunities for bid ",
      "Generate negotiation strategy for supplier ",
      "What leverage do we have against supplier ",
      "Can we negotiate this bid quotation?",
      "How aggressive should we negotiate with supplier",
      "negotiate supplier {{supplierId}}"
    ],
  },
  {
    module: "Pricing Intelligence",
    icon: "TrendingDown",
    prompts: [
      "Analyze bulk discounts and historical pricing for a supplier",
      "Compare normal vs bulk prices for supplier items",
    ],
  },
];
