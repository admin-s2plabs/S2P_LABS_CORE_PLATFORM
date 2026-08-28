import { useQuery } from "@tanstack/react-query";

interface AIServiceSetting {
  id: number;
  feature_key: string;
  feature_name: string;
  module_name: string;
  description: string;
  is_enabled: boolean;
  updated_by: string | null;
  updated_date: string | null;
}

export function useAISettings() {
  const { data, isLoading } = useQuery<AIServiceSetting[]>({
    queryKey: ["/api/ai-service-settings"],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // A 401 body ({ error: "..." }) can resolve as query data, so `data` is not guaranteed
  // to be an array — a default of `[]` only covers `undefined`.
  const settings = Array.isArray(data) ? data : [];

  const isAIEnabled = (featureKey: string): boolean => {
    if (isLoading) return false;
    if (settings.length === 0) return true;
    const setting = settings.find(s => s.feature_key === featureKey);
    const enabled = setting ? setting.is_enabled : false;

    // AI Document Analysis and AI Compliance Check require AI Vendor Intelligence.
    if (featureKey === "AI_VENDOR_DOC_ANALYSIS" || featureKey === "AI_VENDOR_COMPLIANCE") {
      const vi = settings.find(s => s.feature_key === "AI_VENDOR_INTELLIGENCE");
      const viOn = vi ? vi.is_enabled : true;
      return enabled && viOn;
    }

    return enabled;
  };

  const allEnabled = settings.length > 0 && settings.every(s => s.is_enabled);
  const allDisabled = settings.length > 0 && settings.every(s => !s.is_enabled);

  return { settings, isLoading, isAIEnabled, allEnabled, allDisabled };
}
