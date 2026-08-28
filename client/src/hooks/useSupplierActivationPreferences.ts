import { useCallback, useState } from "react";
import {
  defaultActivationPreferences,
  normalizeActivationPreferences,
  type SupplierActivationPreferences,
  type SupplierActivationStageId,
} from "@shared/supplier-activation-signals";

const STORAGE_KEY = "prokraya-supplier-activation-preferences";

export function readSupplierActivationPreferences(): SupplierActivationPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultActivationPreferences();
    return normalizeActivationPreferences(JSON.parse(raw));
  } catch {
    return defaultActivationPreferences();
  }
}

export function useSupplierActivationPreferences() {
  const [preferences, setPreferences] = useState<SupplierActivationPreferences>(
    readSupplierActivationPreferences,
  );

  const setStageEnabled = useCallback((id: SupplierActivationStageId, enabled: boolean) => {
    setPreferences((prev) => {
      const next = { ...prev, [id]: enabled };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isStageEnabled = useCallback(
    (id: SupplierActivationStageId) => preferences[id] !== false,
    [preferences],
  );

  return { preferences, setStageEnabled, isStageEnabled };
}
