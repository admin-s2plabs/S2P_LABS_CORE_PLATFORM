import { useQuery } from "@tanstack/react-query";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import type { PayablesActivationSignalsResponse } from "@shared/payables-activation-signals";

export const PAYABLES_ACTIVATION_SIGNALS_QUERY_KEY = [
  "/api/payables-agent/activation-signals",
] as const;

/** Always returns real pending counts for the stage (toggle OFF does not zero them). */
export function usePayablesActivationSignals() {
  return useQuery<PayablesActivationSignalsResponse>({
    queryKey: PAYABLES_ACTIVATION_SIGNALS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/payables-agent/activation-signals");
      return parseJsonResponse<PayablesActivationSignalsResponse>(res);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
