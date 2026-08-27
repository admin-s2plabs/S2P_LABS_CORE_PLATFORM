import { useQuery } from "@tanstack/react-query";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import type { ProcurementActivationSignalsResponse } from "@shared/procurement-activation-signals";

export const PROCUREMENT_ACTIVATION_SIGNALS_QUERY_KEY = [
  "/api/procurement-agent/activation-signals",
] as const;

/** Always returns real pending counts for every stage (toggle OFF does not zero them). */
export function useProcurementActivationSignals() {
  return useQuery<ProcurementActivationSignalsResponse>({
    queryKey: PROCUREMENT_ACTIVATION_SIGNALS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/procurement-agent/activation-signals");
      return parseJsonResponse<ProcurementActivationSignalsResponse>(res);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
