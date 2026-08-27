import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  MANDATORY_BANKING_KEYS,
  MANDATORY_BANKING_LABELS,
  MANDATORY_COMPANY_KEYS,
  MANDATORY_COMPANY_LABELS,
} from "./registration-mandatory";
import {
  getVendorRegistrationStorageScope,
  readScopedSessionRaw,
  removeAllVendorDraftKeysForScope,
  vendorDraftStorageKey,
} from "./vendor-registration-storage-scope";

export type DraftPhase = "document_gathering" | "form_review";

export interface DraftFieldMetaEntry {
  confidence: number;
  source: "ai" | "user";
  needsReview: boolean;
  userLocked: boolean;
  lastDocumentType?: string;
}

export interface VendorRegistrationDraftSession {
  phase: DraftPhase;
  company: Record<string, string>;
  banking: Record<string, string>;
  fieldMeta: Record<string, DraftFieldMetaEntry>;
  uploadedDocumentTypes: string[];
}

export interface MissingMandatoryPayload {
  company: string[];
  banking: string[];
  companyLabels: string[];
  bankingLabels: string[];
}

function emptyDraft(): VendorRegistrationDraftSession {
  return {
    phase: "document_gathering",
    company: {},
    banking: {},
    fieldMeta: {},
    uploadedDocumentTypes: [],
  };
}

/** True only after at least one document was processed or there is extracted / user draft data. */
export function hasMeaningfulDraftContent(d: VendorRegistrationDraftSession | null): boolean {
  if (!d) return false;
  if (Array.isArray(d.uploadedDocumentTypes) && d.uploadedDocumentTypes.length > 0) return true;
  const hasValues = (obj: Record<string, string> | undefined) =>
    Object.values(obj || {}).some((v) => v != null && String(v).trim() !== "");
  if (hasValues(d.company) || hasValues(d.banking)) return true;
  if (d.fieldMeta && Object.keys(d.fieldMeta).length > 0) return true;
  return false;
}

function parsePersistedDraft(raw: string): VendorRegistrationDraftSession | null {
  try {
    const p = JSON.parse(raw) as VendorRegistrationDraftSession;
    if (!p || typeof p !== "object") return null;
    return {
      phase: p.phase === "form_review" ? "form_review" : "document_gathering",
      company: p.company || {},
      banking: p.banking || {},
      fieldMeta: p.fieldMeta || {},
      uploadedDocumentTypes: p.uploadedDocumentTypes || [],
    };
  } catch {
    return null;
  }
}

type VendorRegistrationDraftContextValue = {
  draft: VendorRegistrationDraftSession | null;
  missingMandatory: MissingMandatoryPayload | null;
  highlightFromAi: boolean;
  setHighlightFromAi: (v: boolean) => void;
  /** Enable/disable automatic server-session persistence of draft changes (off while on AI chat). */
  setServerAutoSaveEnabled: (enabled: boolean) => void;
  /** Persist the current local draft to the server session immediately (used by Confirm & Continue). */
  persistDraftToServerNow: () => Promise<void>;
  applyServerDraft: (
    draft: VendorRegistrationDraftSession,
    missing?: MissingMandatoryPayload | null
  ) => void;
  setCompanyField: (key: string, value: string) => void;
  setBankingField: (key: string, value: string) => void;
  markUserLockedCompany: (key: string) => void;
  markUserLockedBanking: (key: string) => void;
  confirmDraftOnServer: () => Promise<void>;
  clearDraftLocalAndServer: () => Promise<{ profileReset: boolean }>;
  clearCompanyDraftLocalAndServer: () => Promise<void>;
  clearBankingDraftLocal: () => void;
  refreshDraftFromServer: () => Promise<void>;
  /** Merge company/banking patch, update field meta as user, persist to server session (use for AI Apply). */
  applySessionDraftMergeAndSync: (patch: {
    company?: Record<string, string>;
    banking?: Record<string, string>;
  }) => Promise<void>;
  computeMissingLocal: (d: VendorRegistrationDraftSession) => MissingMandatoryPayload;
};

const VendorRegistrationDraftContext =
  createContext<VendorRegistrationDraftContextValue | null>(null);

function mergeUserPatchIntoDraft(
  prev: VendorRegistrationDraftSession | null,
  patch: { company?: Record<string, string>; banking?: Record<string, string> },
): VendorRegistrationDraftSession {
  const base = prev || emptyDraft();
  const company = { ...base.company, ...(patch.company || {}) };
  const banking = { ...base.banking, ...(patch.banking || {}) };
  const fieldMeta = { ...base.fieldMeta };
  for (const k of Object.keys(patch.company || {})) {
    const mk = `company.${k}`;
    const pm = base.fieldMeta[mk];
    fieldMeta[mk] = {
      confidence: pm?.confidence ?? 100,
      source: "user",
      needsReview: false,
      userLocked: true,
      lastDocumentType: pm?.lastDocumentType,
    };
  }
  for (const k of Object.keys(patch.banking || {})) {
    const mk = `banking.${k}`;
    const pm = base.fieldMeta[mk];
    fieldMeta[mk] = {
      confidence: pm?.confidence ?? 100,
      source: "user",
      needsReview: false,
      userLocked: true,
      lastDocumentType: pm?.lastDocumentType,
    };
  }
  return { ...base, company, banking, fieldMeta };
}

function computeMissing(d: VendorRegistrationDraftSession): MissingMandatoryPayload {
  const company = MANDATORY_COMPANY_KEYS.filter((k) => {
    const v = d.company[k];
    return v === undefined || v === null || String(v).trim() === "";
  });
  const banking = MANDATORY_BANKING_KEYS.filter((k) => {
    const v = d.banking[k];
    return v === undefined || v === null || String(v).trim() === "";
  });
  return {
    company,
    banking,
    companyLabels: company.map((k) => MANDATORY_COMPANY_LABELS[k] || k),
    bankingLabels: banking.map((k) => MANDATORY_BANKING_LABELS[k] || k),
  };
}

export function VendorRegistrationDraftProvider({ children }: { children: ReactNode }) {
  const { data: vendorProfile } = useQuery<unknown>({
    queryKey: ["/api/vendor/profile"],
  });
  const storageScope = useMemo(
    () => getVendorRegistrationStorageScope(vendorProfile),
    [vendorProfile],
  );
  const draftStorageKey = useMemo(
    () => vendorDraftStorageKey(storageScope),
    [storageScope],
  );
  const scopeRef = useRef(storageScope);
  scopeRef.current = storageScope;

  const [draft, setDraft] = useState<VendorRegistrationDraftSession | null>(null);
  const [missingMandatory, setMissingMandatory] = useState<MissingMandatoryPayload | null>(null);
  const [highlightFromAi, setHighlightFromAi] = useState(false);
  const latestDraftRef = useRef<VendorRegistrationDraftSession | null>(null);
  latestDraftRef.current = draft;
  // When false (e.g. while on the AI chat), draft changes are NOT auto-persisted to
  // the server session — the data lives only in local state until the user explicitly
  // confirms (Confirm & Continue), at which point persistDraftToServerNow() is called.
  const serverAutoSaveRef = useRef(true);
  const setServerAutoSaveEnabled = useCallback((enabled: boolean) => {
    serverAutoSaveRef.current = enabled;
  }, []);
  const draftHydratedScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (draftHydratedScopeRef.current === storageScope) {
      return;
    }
    draftHydratedScopeRef.current = storageScope;

    const raw = readScopedSessionRaw(storageScope, "draft");
    const persisted = raw ? parsePersistedDraft(raw) : null;
    if (persisted && hasMeaningfulDraftContent(persisted)) {
      setDraft(persisted);
      setMissingMandatory(computeMissing(persisted));
    } else {
      setDraft(null);
      setMissingMandatory(null);
      if (persisted) {
        sessionStorage.removeItem(draftStorageKey);
      }
    }
  }, [storageScope, draftStorageKey]);

  useEffect(() => {
    if (!draft) {
      sessionStorage.removeItem(draftStorageKey);
      return;
    }
    if (!hasMeaningfulDraftContent(draft)) {
      sessionStorage.removeItem(draftStorageKey);
      setDraft(null);
      setMissingMandatory(null);
      return;
    }
    sessionStorage.setItem(draftStorageKey, JSON.stringify(draft));
    setMissingMandatory(computeMissing(draft));
  }, [draft, draftStorageKey]);

  /** Debounced persist so manual form blur/setField and AI extraction stay aligned with server session. */
  useEffect(() => {
    if (!draft || !hasMeaningfulDraftContent(draft)) return;
    if (!serverAutoSaveRef.current) return;
    const t = window.setTimeout(() => {
      const d = latestDraftRef.current;
      if (!d || !hasMeaningfulDraftContent(d)) return;
      void (async () => {
        try {
          await apiRequest("POST", "/api/vendor/registration/draft", { draft: d });
        } catch {
          /* offline — sessionStorage still holds draft */
        }
      })();
    }, 450);
    return () => window.clearTimeout(t);
  }, [draft]);

  const applyServerDraft = useCallback(
    (next: VendorRegistrationDraftSession, missing?: MissingMandatoryPayload | null) => {
      setDraft(next);
      if (missing) {
        setMissingMandatory(missing);
      } else {
        setMissingMandatory(computeMissing(next));
      }
    },
    []
  );

  const metaKey = (section: "company" | "banking", key: string) => `${section}.${key}`;

  const setCompanyField = useCallback((key: string, value: string) => {
    setDraft((prev) => {
      const base = prev || emptyDraft();
      const mk = metaKey("company", key);
      const prevMeta = base.fieldMeta[mk];
      return {
        ...base,
        company: { ...base.company, [key]: value },
        fieldMeta: {
          ...base.fieldMeta,
          [mk]: {
            confidence: prevMeta?.confidence ?? 100,
            source: "user",
            needsReview: false,
            userLocked: true,
            lastDocumentType: prevMeta?.lastDocumentType,
          },
        },
      };
    });
  }, []);

  const setBankingField = useCallback((key: string, value: string) => {
    setDraft((prev) => {
      const base = prev || emptyDraft();
      const mk = metaKey("banking", key);
      const prevMeta = base.fieldMeta[mk];
      return {
        ...base,
        banking: { ...base.banking, [key]: value },
        fieldMeta: {
          ...base.fieldMeta,
          [mk]: {
            confidence: prevMeta?.confidence ?? 100,
            source: "user",
            needsReview: false,
            userLocked: true,
            lastDocumentType: prevMeta?.lastDocumentType,
          },
        },
      };
    });
  }, []);

  const markUserLockedCompany = useCallback((key: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const mk = metaKey("company", key);
      const m = prev.fieldMeta[mk];
      if (!m) return prev;
      return {
        ...prev,
        fieldMeta: {
          ...prev.fieldMeta,
          [mk]: { ...m, userLocked: true, source: "user" },
        },
      };
    });
  }, []);

  const markUserLockedBanking = useCallback((key: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const mk = metaKey("banking", key);
      const m = prev.fieldMeta[mk];
      if (!m) return prev;
      return {
        ...prev,
        fieldMeta: {
          ...prev.fieldMeta,
          [mk]: { ...m, userLocked: true, source: "user" },
        },
      };
    });
  }, []);

  const confirmDraftOnServer = useCallback(async () => {
    const res = await apiRequest("POST", "/api/vendor/registration/confirm-draft", {});
    const data = await res.json();
    if (data.draft) {
      applyServerDraft(data.draft, null);
    }
    await queryClient.invalidateQueries({ queryKey: ["/api/vendor/documents"] });
  }, [applyServerDraft]);

  const clearDraftLocalAndServer = useCallback(async (): Promise<{ profileReset: boolean }> => {
    let profileReset = false;
    try {
      const res = await apiRequest("POST", "/api/vendor/registration/clear-draft", {});
      try {
        const data = (await res.json()) as { profileReset?: boolean };
        profileReset = !!data.profileReset;
      } catch {
        /* ignore parse */
      }
    } catch {
      /* ignore */
    }
    setDraft(null);
    setMissingMandatory(null);
    setHighlightFromAi(false);
    removeAllVendorDraftKeysForScope(scopeRef.current);
    return { profileReset };
  }, []);

  const clearCompanyDraftLocalAndServer = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/vendor/registration/clear-company-draft", {});
    } catch {
      /* ignore */
    }
    setDraft((prev) => {
      if (!prev) return prev;
      const fieldMeta = { ...prev.fieldMeta };
      for (const k of Object.keys(fieldMeta)) {
        if (k.startsWith("company.")) delete fieldMeta[k];
      }
      return { ...prev, company: {}, fieldMeta };
    });
  }, []);

  const clearBankingDraftLocal = useCallback(() => {
    setDraft((prev) => {
      if (!prev) return prev;
      const fieldMeta = { ...prev.fieldMeta };
      for (const k of Object.keys(fieldMeta)) {
        if (k.startsWith("banking.")) delete fieldMeta[k];
      }
      return { ...prev, banking: {}, fieldMeta };
    });
  }, []);

  const refreshDraftFromServer = useCallback(async () => {
    const res = await fetch("/api/vendor/registration/draft", { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    if (data.draft && hasMeaningfulDraftContent(data.draft)) {
      applyServerDraft(data.draft, data.missingMandatory ?? null);
      return;
    }
    // Server holds no saved draft. Preserve any local unconfirmed draft — the AI chat
    // keeps extracted fields local until the user clicks Confirm & Continue.
    const localDraft = latestDraftRef.current;
    if (localDraft && hasMeaningfulDraftContent(localDraft)) {
      setMissingMandatory(computeMissing(localDraft));
      return;
    }
    setDraft(null);
    setMissingMandatory(null);
    removeAllVendorDraftKeysForScope(scopeRef.current);
  }, [applyServerDraft]);

  const applySessionDraftMergeAndSync = useCallback(
    async (patch: { company?: Record<string, string>; banking?: Record<string, string> }) => {
      let merged: VendorRegistrationDraftSession | null = null;
      setDraft((prev) => {
        merged = mergeUserPatchIntoDraft(prev, patch);
        return merged;
      });
      if (merged && hasMeaningfulDraftContent(merged)) {
        if (!serverAutoSaveRef.current) {
          // AI chat: keep edits local until Confirm & Continue.
          setMissingMandatory(computeMissing(merged));
          return;
        }
        try {
          const res = await apiRequest("POST", "/api/vendor/registration/draft", { draft: merged });
          try {
            const data = (await res.json()) as {
              missingMandatory?: MissingMandatoryPayload | null;
            };
            if (data.missingMandatory) {
              setMissingMandatory(data.missingMandatory);
            } else {
              setMissingMandatory(computeMissing(merged));
            }
          } catch {
            setMissingMandatory(computeMissing(merged));
          }
        } catch {
          setMissingMandatory(computeMissing(merged));
        }
      }
    },
    []
  );

  /** Push the current local draft to the server session on demand (used by Confirm & Continue). */
  const persistDraftToServerNow = useCallback(async () => {
    const d = latestDraftRef.current;
    if (!d || !hasMeaningfulDraftContent(d)) return;
    try {
      const res = await apiRequest("POST", "/api/vendor/registration/draft", { draft: d });
      try {
        const data = (await res.json()) as {
          missingMandatory?: MissingMandatoryPayload | null;
        };
        setMissingMandatory(data.missingMandatory ?? computeMissing(d));
      } catch {
        setMissingMandatory(computeMissing(d));
      }
    } catch {
      /* offline — sessionStorage still holds draft */
    }
  }, []);


  const value = useMemo(
    () => ({
      draft,
      missingMandatory,
      highlightFromAi,
      setHighlightFromAi,
      setServerAutoSaveEnabled,
      persistDraftToServerNow,
      applyServerDraft,
      setCompanyField,
      setBankingField,
      markUserLockedCompany,
      markUserLockedBanking,
      confirmDraftOnServer,
      clearDraftLocalAndServer,
      clearCompanyDraftLocalAndServer,
      clearBankingDraftLocal,
      refreshDraftFromServer,
      applySessionDraftMergeAndSync,
      computeMissingLocal: computeMissing,
    }),
    [
      draft,
      missingMandatory,
      highlightFromAi,
      setServerAutoSaveEnabled,
      persistDraftToServerNow,
      applyServerDraft,
      setCompanyField,
      setBankingField,
      markUserLockedCompany,
      markUserLockedBanking,
      confirmDraftOnServer,
      clearDraftLocalAndServer,
      clearCompanyDraftLocalAndServer,
      clearBankingDraftLocal,
      refreshDraftFromServer,
      applySessionDraftMergeAndSync,
    ]
  );

  return (
    <VendorRegistrationDraftContext.Provider value={value}>
      {children}
    </VendorRegistrationDraftContext.Provider>
  );
}

export function useVendorRegistrationDraft() {
  const ctx = useContext(VendorRegistrationDraftContext);
  if (!ctx) {
    throw new Error("useVendorRegistrationDraft must be used within VendorRegistrationDraftProvider");
  }
  return ctx;
}

export function useVendorRegistrationDraftOptional() {
  return useContext(VendorRegistrationDraftContext);
}

export {
  AI_HIGHLIGHT_NEUTRAL_COMPANY_KEYS,
  bankingFieldHighlightClass,
  companyFieldHighlightClass,
} from "./vendor-registration-field-states";
