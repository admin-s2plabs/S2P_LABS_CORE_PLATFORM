import { useQuery } from "@tanstack/react-query";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import type { SourcingActivationSignalsResponse } from "@shared/sourcing-activation-signals";

export const ACTIVATION_SIGNALS_QUERY_KEY = ["/api/sourcing-agent/activation-signals"] as const;

/** Always returns real pending counts for every stage (toggle OFF does not zero them). */
export function useSourcingActivationSignals() {
  return useQuery<SourcingActivationSignalsResponse>({
    queryKey: ACTIVATION_SIGNALS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/sourcing-agent/activation-signals");
      return parseJsonResponse<SourcingActivationSignalsResponse>(res);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
