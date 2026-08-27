import { useQuery } from "@tanstack/react-query";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import type { DelegateApproverOption } from "@/pages/modules/ai-console/payables-activation-chat-actions";

/**
 * Shared query key so the Payables page and the invoice review card read the
 * same approver list from cache. A high limit is used so name resolution isn't
 * silently capped at the endpoint's default page size of 100.
 */
export const PAYABLES_DELEGATE_APPROVERS_QUERY_KEY = [
  "/api/users/dropdown",
  { limit: 500 },
] as const;

export function usePayablesDelegateApprovers(enabled = true) {
  return useQuery({
    queryKey: PAYABLES_DELEGATE_APPROVERS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users/dropdown?limit=500");
      const json = await parseJsonResponse<any>(res);
      const rows = Array.isArray(json) ? json : json?.data || [];
      return (rows as DelegateApproverOption[]).filter((user) => !!user?.id);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
