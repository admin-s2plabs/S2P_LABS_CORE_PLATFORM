import { apiRequest } from "@/lib/queryClient";
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
function hasMeaningfulDraftContent(d: VendorRegistrationDraftSession | null): boolean {
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
  setCompanyField: (key: string, value: string) => void;
  setBankingField: (key: string, value: string) => void;
  markUserLockedCompany: (key: string) => void;
  markUserLockedBanking: (key: string) => void;
  clearCompanyDraftLocalAndServer: () => Promise<void>;
  clearBankingDraftLocal: () => void;
  refreshDraftFromServer: () => Promise<void>;
};

const VendorRegistrationDraftContext =
  createContext<VendorRegistrationDraftContextValue | null>(null);

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
  const latestDraftRef = useRef<VendorRegistrationDraftSession | null>(null);
  latestDraftRef.current = draft;
  const draftHydratedScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (draftHydratedScopeRef.current === storageScope) {
      return;
    }
    draftHydratedScopeRef.current = storageScope;

    const raw = readScopedSessionRaw(storageScope);
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

  /** Debounced persist so manual form blur/setField stay aligned with server session. */
  useEffect(() => {
    if (!draft || !hasMeaningfulDraftContent(draft)) return;
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
    // Server holds no saved draft. Preserve any local unsaved draft.
    const localDraft = latestDraftRef.current;
    if (localDraft && hasMeaningfulDraftContent(localDraft)) {
      setMissingMandatory(computeMissing(localDraft));
      return;
    }
    setDraft(null);
    setMissingMandatory(null);
    removeAllVendorDraftKeysForScope(scopeRef.current);
  }, [applyServerDraft]);



  const value = useMemo(
    () => ({
      draft,
      missingMandatory,
      setCompanyField,
      setBankingField,
      markUserLockedCompany,
      markUserLockedBanking,
      clearCompanyDraftLocalAndServer,
      clearBankingDraftLocal,
      refreshDraftFromServer,
    }),
    [
      draft,
      missingMandatory,
      setCompanyField,
      setBankingField,
      markUserLockedCompany,
      markUserLockedBanking,
      clearCompanyDraftLocalAndServer,
      clearBankingDraftLocal,
      refreshDraftFromServer,
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
