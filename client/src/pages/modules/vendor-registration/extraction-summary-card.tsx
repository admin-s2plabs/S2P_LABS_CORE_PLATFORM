import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MANDATORY_BANKING_KEYS,
  MANDATORY_BANKING_LABELS,
  MANDATORY_COMPANY_KEYS,
  MANDATORY_COMPANY_LABELS,
} from "@/pages/modules/vendor-registration/registration-mandatory";
import type {
  VendorRegistrationDraftSession,
} from "@/pages/modules/vendor-registration/vendor-registration-draft-context";
import { AI_HIGHLIGHT_NEUTRAL_COMPANY_KEYS } from "@/pages/modules/vendor-registration/vendor-registration-field-states";
import {
  Building2,
  ClipboardList,
  Eye,
  EyeOff,
  FileBadge,
  Landmark,
  Pencil,
  Receipt,
  Save,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ExtractionSlice = {
  company: Record<string, string>;
  banking: Record<string, string>;
};

type Props = {
  draft: VendorRegistrationDraftSession;
  lastUploadExtraction?: ExtractionSlice | null;
  onApplyEdits: (next: { company: Record<string, string>; banking: Record<string, string> }) => void;
  className?: string;
};

const ROW_AMBER =
  "border-amber-500/35 bg-amber-500/[0.07]";
const ROW_RED =
  "border-destructive/40 bg-destructive/[0.06]";

function labelFor(section: "company" | "banking", key: string): string {
  const map = section === "company" ? MANDATORY_COMPANY_LABELS : MANDATORY_BANKING_LABELS;
  const known = map[key];
  if (known) return known;
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function maskAccount(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return "••••";
  const last4 = digits.slice(-4);
  return `•••• ${last4}`;
}

function isSensitive(section: "company" | "banking", key: string): boolean {
  if (section !== "banking") return false;
  return key === "account_no" || key === "confirm_account_no" || key.includes("account");
}

function pickKeys(
  draft: VendorRegistrationDraftSession,
  slice: ExtractionSlice | null | undefined,
  section: "company" | "banking",
  keys: string[],
): string[] {
  const base = section === "company" ? draft.company : draft.banking;
  const sliceObj = section === "company" ? (slice?.company ?? {}) : (slice?.banking ?? {});
  const present = new Set<string>();
  for (const k of keys) {
    const v = String(base?.[k] ?? "").trim();
    const sv = String(sliceObj?.[k] ?? "").trim();
    if (v || sv) present.add(k);
  }
  for (const k of Object.keys(sliceObj || {})) {
    if (keys.includes(k)) present.add(k);
  }
  return keys.filter((k) => present.has(k));
}

/** Include mandatory keys for this category even when empty (so “Required” rows show). */
function keysForCategory(
  draft: VendorRegistrationDraftSession,
  slice: ExtractionSlice | null | undefined,
  section: "company" | "banking",
  categoryKeys: string[],
  mandatoryForSection: readonly string[],
): string[] {
  const mandatoryInCat = mandatoryForSection.filter((k) => categoryKeys.includes(k));
  const picked = pickKeys(draft, slice, section, categoryKeys);
  const base = section === "company" ? draft.company : draft.banking;
  const missingMandatory = mandatoryInCat.filter((k) => !String(base?.[k] ?? "").trim());
  const set = new Set([...picked, ...missingMandatory]);
  return Array.from(set).sort((a, b) => {
    const ma = mandatoryInCat.includes(a);
    const mb = mandatoryInCat.includes(b);
    if (ma && !mb) return -1;
    if (!ma && mb) return 1;
    return a.localeCompare(b);
  });
}

export function ExtractionSummaryCard({ draft, lastUploadExtraction, onApplyEdits, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [revealSensitive, setRevealSensitive] = useState<Record<string, boolean>>({});

  const initial = useMemo(
    () => ({
      company: { ...(draft.company || {}) },
      banking: { ...(draft.banking || {}) },
    }),
    [draft.company, draft.banking],
  );
  const [local, setLocal] = useState(initial);

  useEffect(() => {
    setLocal(initial);
    setEditing(false);
  }, [initial]);

  const categories = useMemo(() => {
    const companyKeys = [
      "type_of_company",
      "legal_entity_type",
      "address_1",
      "address_2",
      "city",
      "state",
      "country",
      "postalcode",
      "phone",
      "email_id",
      "web_address",
    ];
    const taxKeys = [
      "pan_no",
      "tax_reg_no",
      "tax_payer_id",
      "tax_effective_date",
      "payment_terms",
      "annual_turn_over",
      "turn_over_currency",
    ];
    const bankKeys = [
      "bank_name",
      "branch_name",
      "bank_address",
      "beneficiary_name",
      "account_no",
      "confirm_account_no",
      "bank_account_type",
      "ifsccode",
      "swift_code",
      "aba_routing",
      "iban_no",
      "country",
      "currency",
      "city",
      "region",
      "postal_code",
      "street",
      "beneficiary_address",
    ];
    const licenseKeys = [
      "license_no",
      "start_date",
      "expiry_date",
      "place_of_issue",
    ];

    const companyMandatory = MANDATORY_COMPANY_KEYS as readonly string[];
    const bankingMandatory = MANDATORY_BANKING_KEYS as readonly string[];

    return [
      {
        id: "company",
        title: "Company Details",
        icon: Building2,
        section: "company" as const,
        keys: keysForCategory(draft, lastUploadExtraction, "company", companyKeys, companyMandatory),
      },
      {
        id: "tax",
        title: "Tax Details",
        icon: Receipt,
        section: "company" as const,
        keys: keysForCategory(draft, lastUploadExtraction, "company", taxKeys, companyMandatory),
      },
      {
        id: "bank",
        title: "Bank Details",
        icon: Landmark,
        section: "banking" as const,
        keys: keysForCategory(draft, lastUploadExtraction, "banking", bankKeys, bankingMandatory),
      },
      {
        id: "license",
        title: "License Details",
        icon: FileBadge,
        section: "company" as const,
        keys: keysForCategory(draft, lastUploadExtraction, "company", licenseKeys, companyMandatory),
      },
    ].filter((c) => c.keys.length > 0);
  }, [draft, lastUploadExtraction]);

  const applyEdits = () => {
    onApplyEdits(local);
    setEditing(false);
  };

  const resetEdits = () => {
    setLocal(initial);
    setEditing(false);
  };

  return (
    <Card
      className={cn(
        "overflow-hidden border-border/60 shadow-sm bg-card/95",
        className,
      )}
      data-testid="extraction-summary-card"
    >
      <div className="px-4 py-3 border-b bg-gradient-to-r from-muted/40 to-transparent flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-amber-700/90 dark:text-amber-400" />
            <p className="text-sm font-semibold truncate">Extracted information</p>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Amber = review this value. Red = required and missing. Confirm only after you have checked everything.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="button-edit-extraction">
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={resetEdits} data-testid="button-reset-extraction">
                <Undo2 className="h-3.5 w-3.5 mr-1" /> Reset
              </Button>
              <Button size="sm" onClick={applyEdits} data-testid="button-apply-extraction">
                <Save className="h-3.5 w-3.5 mr-1" /> Apply
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid gap-3">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <div key={cat.id} className="rounded-xl border bg-muted/20">
                <div className="px-3 py-2 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-background/60 border">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-xs font-semibold">{cat.title}</p>
                  </div>
                </div>
                <div className="px-3 py-2.5 grid gap-2">
                  {cat.keys.map((key) => {
                    const section = cat.section;
                    const value = section === "company" ? (local.company[key] ?? "") : (local.banking[key] ?? "");
                    const trimmed = String(value).trim();
                    const locked = section === "company" && AI_HIGHLIGHT_NEUTRAL_COMPANY_KEYS.has(key);
                    const mandatory =
                      section === "company"
                        ? MANDATORY_COMPANY_KEYS.includes(key)
                        : MANDATORY_BANKING_KEYS.includes(key);
                    const isMissing = mandatory && !trimmed && !locked;
                    const showReview = !locked && !isMissing && trimmed.length > 0;
                    const sensitive = isSensitive(section, key);
                    const revealKey = `${section}.${key}`;
                    const showSensitive = !!revealSensitive[revealKey];

                    const displayValue =
                      sensitive && !editing
                        ? (trimmed ? maskAccount(value) : "")
                        : value;

                    return (
                      <div
                        key={key}
                        className={cn(
                          "rounded-lg border px-2.5 py-2 flex items-start justify-between gap-3",
                          locked && "border-border/60 bg-background/70",
                          !locked && isMissing && ROW_RED,
                          !locked && showReview && ROW_AMBER,
                          !locked && !isMissing && !showReview && "border-border/60 bg-background/70",
                        )}
                        data-testid={`extraction-field-${section}-${key}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[11px] text-muted-foreground font-medium">
                              {labelFor(section, key)}
                            </p>
                            {isMissing && (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-destructive/45 text-destructive bg-destructive/5"
                              >
                                Required
                              </Badge>
                            )}
                            {showReview && (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-amber-500/45 text-amber-900 dark:text-amber-200 bg-amber-500/10"
                              >
                                Review
                              </Badge>
                            )}
                          </div>

                          {!editing ? (
                            <p className="text-sm mt-0.5 truncate">
                              {trimmed ? (
                                displayValue
                              ) : (
                                <span className="text-muted-foreground">
                                  {isMissing ? "Required" : "—"}
                                </span>
                              )}
                            </p>
                          ) : (
                            <div className="mt-1 flex items-center gap-2">
                              <Input
                                value={value}
                                onChange={(e) => {
                                  const nextVal = e.target.value;
                                  setLocal((prev) =>
                                    section === "company"
                                      ? { ...prev, company: { ...prev.company, [key]: nextVal } }
                                      : { ...prev, banking: { ...prev.banking, [key]: nextVal } },
                                  );
                                }}
                                type={sensitive && !showSensitive ? "password" : "text"}
                                className="h-8 text-sm"
                                data-testid={`input-extraction-${section}-${key}`}
                              />
                              {sensitive && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    setRevealSensitive((p) => ({ ...p, [revealKey]: !p[revealKey] }))
                                  }
                                  title={showSensitive ? "Hide" : "Show"}
                                  data-testid={`button-toggle-sensitive-${section}-${key}`}
                                >
                                  {showSensitive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
