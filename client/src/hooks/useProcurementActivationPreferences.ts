import { useCallback, useState } from "react";
import {
  defaultActivationPreferences,
  isActivationStageEnabled,
  normalizeActivationPreferences,
  type ProcurementActivationPreferences,
  type ProcurementActivationStageId,
} from "@shared/procurement-activation-signals";

const STORAGE_KEY = "prokraya-procurement-activation-preferences";

export function readProcurementActivationPreferences(): ProcurementActivationPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultActivationPreferences();
    return normalizeActivationPreferences(JSON.parse(raw));
  } catch {
    return defaultActivationPreferences();
  }
}

export function useProcurementActivationPreferences() {
  const [preferences, setPreferences] = useState<Record<ProcurementActivationStageId, boolean>>(
    readProcurementActivationPreferences,
  );

  const setStageEnabled = useCallback((id: ProcurementActivationStageId, enabled: boolean) => {
    setPreferences((prev) => {
      const next = normalizeActivationPreferences({ ...prev, [id]: enabled });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isStageEnabled = useCallback(
    (id: ProcurementActivationStageId) => isActivationStageEnabled(preferences, id),
    [preferences],
  );

  return { preferences, setStageEnabled, isStageEnabled };
}
