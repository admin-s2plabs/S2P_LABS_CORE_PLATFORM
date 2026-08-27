import { useQuery } from "@tanstack/react-query";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import type { SupplierActivationSignalsResponse } from "@shared/supplier-activation-signals";

export const SUPPLIER_ACTIVATION_SIGNALS_QUERY_KEY = [
  "/api/vendor-agent/activation-signals",
] as const;

export function useSupplierActivationSignals() {
  return useQuery<SupplierActivationSignalsResponse>({
    queryKey: SUPPLIER_ACTIVATION_SIGNALS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor-agent/activation-signals");
      return parseJsonResponse<SupplierActivationSignalsResponse>(res);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
