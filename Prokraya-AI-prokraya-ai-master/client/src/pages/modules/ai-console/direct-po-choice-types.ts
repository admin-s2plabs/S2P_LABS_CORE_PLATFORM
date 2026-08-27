/** Client-side mirror of server/services/direct-po-choice.ts shapes. */

export interface AgentChoiceOption {
  id: string;
  label: string;
  prompt: string;
  description?: string;
}

export interface AgentChoiceSpec {
  field: string;
  title: string;
  options: AgentChoiceOption[];
}

export function isSelectOptionPendingAction(
  action: { type?: string; data?: unknown } | null | undefined,
): action is { type: "select_option"; summary: string; data: AgentChoiceSpec } {
  if (!action || action.type !== "select_option") return false;
  const data = action.data as AgentChoiceSpec | undefined;
  return !!data && Array.isArray(data.options) && data.options.length >= 2;
}
