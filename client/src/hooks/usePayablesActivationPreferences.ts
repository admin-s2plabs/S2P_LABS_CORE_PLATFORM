import { useCallback, useEffect, useState } from "react";
import {
  defaultPayablesActivationPreferences,
  isPayablesActivationStageEnabled,
  normalizePayablesActivationPreferences,
  type PayablesActivationPreferences,
  type PayablesActivationStageId,
} from "@shared/payables-activation-signals";

const STORAGE_KEY = "prokraya-payables-activation-preferences";
const CHANGE_EVENT = "prokraya-payables-activation-preferences-change";

export function readPayablesActivationPreferences(): PayablesActivationPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPayablesActivationPreferences();
    return normalizePayablesActivationPreferences(JSON.parse(raw));
  } catch {
    return defaultPayablesActivationPreferences();
  }
}

export function usePayablesActivationPreferences() {
  const [preferences, setPreferences] = useState<PayablesActivationPreferences>(
    readPayablesActivationPreferences,
  );

  const setStageEnabled = useCallback((id: PayablesActivationStageId, enabled: boolean) => {
    setPreferences((prev) => {
      const next = normalizePayablesActivationPreferences({ ...prev, [id]: enabled });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
      return next;
    });
  }, []);

  const isStageEnabled = useCallback(
    (id: PayablesActivationStageId) => isPayablesActivationStageEnabled(preferences, id),
    [preferences],
  );

  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<PayablesActivationPreferences>).detail;
      setPreferences(normalizePayablesActivationPreferences(detail || readPayablesActivationPreferences()));
    };
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);

  return { preferences, setStageEnabled, isStageEnabled };
}
