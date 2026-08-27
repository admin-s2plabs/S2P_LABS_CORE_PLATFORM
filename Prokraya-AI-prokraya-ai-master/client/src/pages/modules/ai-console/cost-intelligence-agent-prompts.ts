export interface PromptCategory {
  module: string;
  icon: string;
  prompts: string[];
}

export const costIntelligenceAgentPrompts: PromptCategory[] = [
  {
    module: "Manual Economics Analysis",
    icon: "TrendingDown",
    prompts: [
      "Analyze supplier economics for quote ",
      "get cost estimate for supplier ",
    ],
  },
];
