import { useCallback, useState } from "react";
import {
  defaultActivationPreferences,
  normalizeActivationPreferences,
  type SourcingActivationPreferences,
  type SourcingActivationStageId,
} from "@shared/sourcing-activation-signals";

const STORAGE_KEY = "prokraya-sourcing-activation-preferences";

export function readSourcingActivationPreferences(): SourcingActivationPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultActivationPreferences();
    return normalizeActivationPreferences(JSON.parse(raw));
  } catch {
    return defaultActivationPreferences();
  }
}

export function useSourcingActivationPreferences() {
  const [preferences, setPreferences] = useState<Record<SourcingActivationStageId, boolean>>(
    readSourcingActivationPreferences,
  );

  const setStageEnabled = useCallback((id: SourcingActivationStageId, enabled: boolean) => {
    setPreferences((prev) => {
      const next = { ...prev, [id]: enabled };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isStageEnabled = useCallback(
    (id: SourcingActivationStageId) => preferences[id] !== false,
    [preferences],
  );

  return { preferences, setStageEnabled, isStageEnabled };
}
