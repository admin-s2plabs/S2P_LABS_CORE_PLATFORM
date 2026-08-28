import { Loader2 } from "lucide-react";
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BidMention,
  BusinessUserMention,
  InvoiceMention,
  ItemMention,
  PoMention,
  PrMention,
  SupplierMention,
} from "@shared/agent-mention";
import {
  MENTION_SEARCH_DELAY_MS,
  buildBidMentionSearchEndpoint,
  buildBusinessUserMentionSearchEndpoint,
  buildComposerMentionBackdrop,
  buildInvoiceMentionSearchEndpoint,
  buildItemMentionSearchEndpoint,
  buildPoMentionSearchEndpoint,
  buildPrMentionSearchEndpoint,
  buildVendorMentionSearchEndpoint,
  getActiveAmpersandMentionTrigger,
  getActiveCaretMentionTrigger,
  getActiveDollarMentionTrigger,
  getActiveHashMentionTrigger,
  getActiveMentionTrigger,
  getActivePercentMentionTrigger,
  getActiveSlashMentionTrigger,
  getMentionDropdownPosition,
  insertTextAtMentionTrigger,
  itemMentionLabel,
  mentionDropdownAboveLineStyle,
  otherMentionSpans,
  pickActiveMentionDropdown,
  reconcileAllSourcingMentionsAfterTextChange,
  type BidMentionOption,
  type BusinessUserMentionOption,
  type InvoiceMentionOption,
  type ItemMentionOption,
  type MentionTrigger,
  type PoMentionOption,
  type PrMentionOption,
  type SourcingMentionDropdownKind,
  type VendorMentionOption,
} from "@/lib/supplier-mention-utils";

export const ALL_AGENT_MENTION_KINDS: SourcingMentionDropdownKind[] = [
  "supplier",
  "businessUser",
  "item",
  "bid",
  "pr",
  "po",
  "invoice",
];

export const AGENT_MENTION_PLACEHOLDER_HINT =
  "(@ supplier, # user, / item, ^ bid, & PR, % PO, $ invoice)";

export interface UseAgentMentionsOptions {
  /** Which mention triggers to enable. Defaults to all five. */
  kinds?: SourcingMentionDropdownKind[];
  /** Restrict @ supplier search to vendors with scope of supply (cost intelligence). */
  scopeOfSupplyOnly?: boolean;
}

export interface UseAgentMentionsResult {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  composerRef: React.RefObject<HTMLDivElement>;
  prompt: string;
  supplierMentions: SupplierMention[];
  businessUserMentions: BusinessUserMention[];
  itemMentions: ItemMention[];
  bidMentions: BidMention[];
  prMentions: PrMention[];
  poMentions: PoMention[];
  invoiceMentions: InvoiceMention[];
  /** Alias for supplierMentions — matches older `@`-only callers. */
  mentions: SupplierMention[];
  /** Fields to spread into `streamAgentQuery`. */
  streamMentions: {
    mentions?: SupplierMention[];
    businessUserMentions?: BusinessUserMention[];
    itemMentions?: ItemMention[];
    bidMentions?: BidMention[];
    prMentions?: PrMention[];
    poMentions?: PoMention[];
    invoiceMentions?: InvoiceMention[];
  };
  setPromptText: (text: string) => void;
  reset: () => void;
  composerProps: {
    value: string;
    backdrop: React.ReactNode;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onClick: (e: React.MouseEvent<HTMLTextAreaElement>) => void;
    onKeyUp: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  };
  dropdown: React.ReactNode;
}

type MentionLists = {
  suppliers: SupplierMention[];
  businessUsers: BusinessUserMention[];
  items: ItemMention[];
  bids: BidMention[];
  prs: PrMention[];
  pos: PoMention[];
  invoices: InvoiceMention[];
};

function kindEnabled(
  kinds: SourcingMentionDropdownKind[],
  kind: SourcingMentionDropdownKind,
) {
  return kinds.includes(kind);
}

/**
 * Multi-kind mention composer (`@` supplier, `#` user, `/` item, `^` bid, `&` PR, `%` PO, `$` invoice)
 * shared across AI agents. Returns ChatComposer props + a suggestion dropdown.
 */
export function useAgentMentions(options?: UseAgentMentionsOptions): UseAgentMentionsResult {
  const kinds = options?.kinds?.length ? options.kinds : ALL_AGENT_MENTION_KINDS;
  const scopeOfSupplyOnly = options?.scopeOfSupplyOnly;

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const [prompt, setPrompt] = useState("");
  const [supplierMentions, setSupplierMentions] = useState<SupplierMention[]>([]);
  const [businessUserMentions, setBusinessUserMentions] = useState<BusinessUserMention[]>([]);
  const [itemMentions, setItemMentions] = useState<ItemMention[]>([]);
  const [bidMentions, setBidMentions] = useState<BidMention[]>([]);
  const [prMentions, setPrMentions] = useState<PrMention[]>([]);
  const [poMentions, setPoMentions] = useState<PoMention[]>([]);
  const [invoiceMentions, setInvoiceMentions] = useState<InvoiceMention[]>([]);

  const [activeDropdown, setActiveDropdown] = useState<SourcingMentionDropdownKind | null>(null);
  const [atTrigger, setAtTrigger] = useState<MentionTrigger | null>(null);
  const [hashTrigger, setHashTrigger] = useState<MentionTrigger | null>(null);
  const [slashTrigger, setSlashTrigger] = useState<MentionTrigger | null>(null);
  const [caretTrigger, setCaretTrigger] = useState<MentionTrigger | null>(null);
  const [ampersandTrigger, setAmpersandTrigger] = useState<MentionTrigger | null>(null);
  const [percentTrigger, setPercentTrigger] = useState<MentionTrigger | null>(null);
  const [dollarTrigger, setDollarTrigger] = useState<MentionTrigger | null>(null);

  const [supplierSuggestions, setSupplierSuggestions] = useState<VendorMentionOption[]>([]);
  const [userSuggestions, setUserSuggestions] = useState<BusinessUserMentionOption[]>([]);
  const [itemSuggestions, setItemSuggestions] = useState<ItemMentionOption[]>([]);
  const [bidSuggestions, setBidSuggestions] = useState<BidMentionOption[]>([]);
  const [prSuggestions, setPrSuggestions] = useState<PrMentionOption[]>([]);
  const [poSuggestions, setPoSuggestions] = useState<PoMentionOption[]>([]);
  const [invoiceSuggestions, setInvoiceSuggestions] = useState<InvoiceMentionOption[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  const close = () => {
    setActiveDropdown(null);
    setAtTrigger(null);
    setHashTrigger(null);
    setSlashTrigger(null);
    setCaretTrigger(null);
    setAmpersandTrigger(null);
    setPercentTrigger(null);
    setDollarTrigger(null);
    setSupplierSuggestions([]);
    setUserSuggestions([]);
    setItemSuggestions([]);
    setBidSuggestions([]);
    setPrSuggestions([]);
    setPoSuggestions([]);
    setInvoiceSuggestions([]);
    setIsLoading(false);
    setHighlightIndex(0);
    setDropdownPos(null);
  };

  const applyLists = (lists: MentionLists) => {
    setSupplierMentions(lists.suppliers);
    setBusinessUserMentions(lists.businessUsers);
    setItemMentions(lists.items);
    setBidMentions(lists.bids);
    setPrMentions(lists.prs);
    setPoMentions(lists.pos);
    setInvoiceMentions(lists.invoices);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!composerRef.current) return;
      if (!composerRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const refresh = (
    nextText: string,
    caret: number | null,
    listsOverride?: MentionLists,
  ) => {
    const caretPosition = typeof caret === "number" ? caret : nextText.length;
    const lists = listsOverride ?? {
      suppliers: supplierMentions,
      businessUsers: businessUserMentions,
      items: itemMentions,
      bids: bidMentions,
      prs: prMentions,
      pos: poMentions,
      invoices: invoiceMentions,
    };

    const nextAt = kindEnabled(kinds, "supplier")
      ? getActiveMentionTrigger(
          nextText,
          caretPosition,
          lists.suppliers,
          otherMentionSpans(
            lists.suppliers,
            lists.businessUsers,
            lists.items,
            "supplier",
            lists.bids,
            lists.prs,
            lists.pos,
            lists.invoices,
          ),
        )
      : null;
    const nextHash = kindEnabled(kinds, "businessUser")
      ? getActiveHashMentionTrigger(
          nextText,
          caretPosition,
          lists.businessUsers,
          otherMentionSpans(
            lists.suppliers,
            lists.businessUsers,
            lists.items,
            "businessUser",
            lists.bids,
            lists.prs,
            lists.pos,
            lists.invoices,
          ),
        )
      : null;
    const nextSlash = kindEnabled(kinds, "item")
      ? getActiveSlashMentionTrigger(
          nextText,
          caretPosition,
          lists.items,
          otherMentionSpans(
            lists.suppliers,
            lists.businessUsers,
            lists.items,
            "item",
            lists.bids,
            lists.prs,
            lists.pos,
            lists.invoices,
          ),
        )
      : null;
    const nextCaret = kindEnabled(kinds, "bid")
      ? getActiveCaretMentionTrigger(
          nextText,
          caretPosition,
          lists.bids,
          otherMentionSpans(
            lists.suppliers,
            lists.businessUsers,
            lists.items,
            "bid",
            lists.bids,
            lists.prs,
            lists.pos,
            lists.invoices,
          ),
        )
      : null;
    const nextAmp = kindEnabled(kinds, "pr")
      ? getActiveAmpersandMentionTrigger(
          nextText,
          caretPosition,
          lists.prs,
          otherMentionSpans(
            lists.suppliers,
            lists.businessUsers,
            lists.items,
            "pr",
            lists.bids,
            lists.prs,
            lists.pos,
            lists.invoices,
          ),
        )
      : null;
    const nextPercent = kindEnabled(kinds, "po")
      ? getActivePercentMentionTrigger(
          nextText,
          caretPosition,
          lists.pos,
          otherMentionSpans(
            lists.suppliers,
            lists.businessUsers,
            lists.items,
            "po",
            lists.bids,
            lists.prs,
            lists.pos,
            lists.invoices,
          ),
        )
      : null;
    const nextDollar = kindEnabled(kinds, "invoice")
      ? getActiveDollarMentionTrigger(
          nextText,
          caretPosition,
          lists.invoices,
          otherMentionSpans(
            lists.suppliers,
            lists.businessUsers,
            lists.items,
            "invoice",
            lists.bids,
            lists.prs,
            lists.pos,
            lists.invoices,
          ),
        )
      : null;

    setAtTrigger(nextAt);
    setHashTrigger(nextHash);
    setSlashTrigger(nextSlash);
    setCaretTrigger(nextCaret);
    setAmpersandTrigger(nextAmp);
    setPercentTrigger(nextPercent);
    setDollarTrigger(nextDollar);

    const active = pickActiveMentionDropdown(
      nextAt,
      nextHash,
      nextSlash,
      nextCaret,
      nextAmp,
      nextPercent,
      nextDollar,
    );
    setActiveDropdown(active);
    setHighlightIndex(0);

    if (!active) {
      setDropdownPos(null);
      return;
    }
    const textarea = inputRef.current;
    if (!textarea) return;
    setDropdownPos(getMentionDropdownPosition(textarea, caretPosition, composerRef.current));
  };

  // Debounced searches per active dropdown kind
  useEffect(() => {
    if (activeDropdown !== "supplier" || !atTrigger) {
      setSupplierSuggestions([]);
      if (activeDropdown === "supplier") setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          buildVendorMentionSearchEndpoint(atTrigger.query, scopeOfSupplyOnly),
          { credentials: "include" },
        );
        if (!res.ok) throw new Error("Mention search failed");
        const payload = await res.json();
        if (cancelled) return;
        setSupplierSuggestions(Array.isArray(payload?.vendors) ? payload.vendors : []);
        setHighlightIndex(0);
      } catch {
        if (!cancelled) setSupplierSuggestions([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, MENTION_SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [atTrigger?.query, activeDropdown, scopeOfSupplyOnly]);

  useEffect(() => {
    if (activeDropdown !== "businessUser" || !hashTrigger) {
      setUserSuggestions([]);
      if (activeDropdown === "businessUser") setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(buildBusinessUserMentionSearchEndpoint(hashTrigger.query), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Business user search failed");
        const payload = await res.json();
        if (cancelled) return;
        const users = Array.isArray(payload) ? payload : [];
        setUserSuggestions(
          users
            .map((row: Record<string, unknown>) => ({
              id: Number(row.id),
              name: String(row.name || "").trim(),
              email_id: row.email_id ? String(row.email_id) : null,
              user_name: row.user_name ? String(row.user_name) : null,
              department_name: row.department_name ? String(row.department_name) : null,
            }))
            .filter((u: BusinessUserMentionOption) => Number.isFinite(u.id) && u.id > 0 && u.name),
        );
        setHighlightIndex(0);
      } catch {
        if (!cancelled) setUserSuggestions([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, MENTION_SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hashTrigger?.query, activeDropdown]);

  useEffect(() => {
    if (activeDropdown !== "item" || !slashTrigger) {
      setItemSuggestions([]);
      if (activeDropdown === "item") setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(buildItemMentionSearchEndpoint(slashTrigger.query), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Item search failed");
        const payload = await res.json();
        if (cancelled) return;
        const rows = Array.isArray(payload?.items) ? payload.items : [];
        setItemSuggestions(
          rows
            .map((row: Record<string, unknown>) => ({
              id: String(row.id || "").trim(),
              name: String(row.name || "").trim(),
              itemCode: row.itemCode ? String(row.itemCode) : null,
              sku: row.itemCode ? String(row.itemCode) : null,
              categoryName: row.categoryName ? String(row.categoryName) : null,
            }))
            .filter((item: ItemMentionOption) => item.id.length > 0 && item.name.length > 0),
        );
        setHighlightIndex(0);
      } catch {
        if (!cancelled) setItemSuggestions([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, MENTION_SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slashTrigger?.query, activeDropdown]);

  useEffect(() => {
    if (activeDropdown !== "bid" || !caretTrigger) {
      setBidSuggestions([]);
      if (activeDropdown === "bid") setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(buildBidMentionSearchEndpoint(caretTrigger.query), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Bid search failed");
        const payload = await res.json();
        if (cancelled) return;
        const rows = Array.isArray(payload?.bids) ? payload.bids : [];
        setBidSuggestions(
          rows
            .map((row: Record<string, unknown>) => ({
              id: Number(row.id),
              bidNumber: String(row.bidNumber || row.bid_number || "").trim(),
              bidTitle: row.bidTitle || row.bid_title ? String(row.bidTitle || row.bid_title) : null,
              bidStatus: row.bidStatus || row.status ? String(row.bidStatus || row.status) : null,
            }))
            .filter((b: BidMentionOption) => Number.isFinite(b.id) && b.id > 0 && b.bidNumber.length > 0),
        );
        setHighlightIndex(0);
      } catch {
        if (!cancelled) setBidSuggestions([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, MENTION_SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [caretTrigger?.query, activeDropdown]);

  useEffect(() => {
    if (activeDropdown !== "pr" || !ampersandTrigger) {
      setPrSuggestions([]);
      if (activeDropdown === "pr") setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(buildPrMentionSearchEndpoint(ampersandTrigger.query), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("PR search failed");
        const payload = await res.json();
        if (cancelled) return;
        const rows = Array.isArray(payload?.purchaseRequests) ? payload.purchaseRequests : [];
        setPrSuggestions(
          rows
            .map((row: Record<string, unknown>) => ({
              prNumber: String(row.prNumber || row.pr_number || "").trim(),
              prDescription:
                row.prDescription || row.pr_description
                  ? String(row.prDescription || row.pr_description)
                  : null,
              prStatus: row.prStatus || row.pr_status ? String(row.prStatus || row.pr_status) : null,
            }))
            .filter((pr: PrMentionOption) => pr.prNumber.length > 0),
        );
        setHighlightIndex(0);
      } catch {
        if (!cancelled) setPrSuggestions([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, MENTION_SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ampersandTrigger?.query, activeDropdown]);

  useEffect(() => {
    if (activeDropdown !== "po" || !percentTrigger) {
      setPoSuggestions([]);
      if (activeDropdown === "po") setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(buildPoMentionSearchEndpoint(percentTrigger.query), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("PO search failed");
        const payload = await res.json();
        if (cancelled) return;
        const rows = Array.isArray(payload?.purchaseOrders) ? payload.purchaseOrders : [];
        setPoSuggestions(
          rows
            .map((row: Record<string, unknown>) => ({
              poNumber: String(row.poNumber || row.po_number || "").trim(),
              poDescription:
                row.poDescription || row.po_description
                  ? String(row.poDescription || row.po_description)
                  : null,
              poStatus: row.poStatus || row.po_status ? String(row.poStatus || row.po_status) : null,
              companyName: row.companyName || row.company_name ? String(row.companyName || row.company_name) : null,
            }))
            .filter((po: PoMentionOption) => po.poNumber.length > 0),
        );
        setHighlightIndex(0);
      } catch {
        if (!cancelled) setPoSuggestions([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, MENTION_SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [percentTrigger?.query, activeDropdown]);

  useEffect(() => {
    if (activeDropdown !== "invoice" || !dollarTrigger) {
      setInvoiceSuggestions([]);
      if (activeDropdown === "invoice") setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(buildInvoiceMentionSearchEndpoint(dollarTrigger.query), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Invoice search failed");
        const payload = await res.json();
        if (cancelled) return;
        const rows = Array.isArray(payload?.invoices) ? payload.invoices : [];
        setInvoiceSuggestions(
          rows
            .map((row: Record<string, unknown>) => ({
              invoiceId: String(row.invoiceId || row.id || "").trim(),
              invoiceNumber: String(row.invoiceNumber || row.invoice_number || "").trim(),
              invoiceStatus:
                row.invoiceStatus || row.invoice_status
                  ? String(row.invoiceStatus || row.invoice_status)
                  : null,
              supplierName:
                row.supplierName || row.supplier_name
                  ? String(row.supplierName || row.supplier_name)
                  : null,
              poNumber: row.poNumber || row.po_number ? String(row.poNumber || row.po_number) : null,
            }))
            .filter(
              (inv: InvoiceMentionOption) =>
                inv.invoiceNumber.length > 0 && inv.invoiceId.length > 0,
            ),
        );
        setHighlightIndex(0);
      } catch {
        if (!cancelled) setInvoiceSuggestions([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, MENTION_SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dollarTrigger?.query, activeDropdown]);

  const handlePromptChange = (nextValue: string, caret: number | null) => {
    const nextLists = reconcileAllSourcingMentionsAfterTextChange(
      prompt,
      nextValue,
      supplierMentions,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
    );
    applyLists(nextLists);
    setPrompt(nextValue);
    refresh(nextValue, caret, nextLists);
  };

  const applyMentionInsertion = (
    trigger: MentionTrigger,
    replacement: string,
    mentionDisplay: string,
    mergeNewMention: (
      reconciled: MentionLists,
      mentionStart: number,
      mentionEnd: number,
    ) => MentionLists,
  ) => {
    const el = inputRef.current;
    const selectionEnd = el?.selectionStart ?? trigger.end;
    const { nextText, replaceStart: mentionStart } = insertTextAtMentionTrigger(
      prompt,
      trigger,
      replacement,
      selectionEnd,
    );
    const mentionEnd = mentionStart + mentionDisplay.length;
    const caret = mentionStart + replacement.length;
    const reconciled = reconcileAllSourcingMentionsAfterTextChange(
      prompt,
      nextText,
      supplierMentions,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
    );
    const merged = mergeNewMention(reconciled, mentionStart, mentionEnd);
    applyLists(merged);
    setPrompt(nextText);
    close();
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
      refresh(nextText, caret, merged);
    });
  };

  const handleSupplierPick = (vendor: VendorMentionOption) => {
    if (!atTrigger) return;
    const label = vendor.companyName || "Unnamed vendor";
    const mentionDisplay = `@${label}`;
    applyMentionInsertion(atTrigger, `${mentionDisplay} `, mentionDisplay, (reconciled, mentionStart, mentionEnd) => ({
      ...reconciled,
      suppliers: [
        ...reconciled.suppliers.filter((e) => e.end <= mentionStart || e.start >= mentionEnd),
        {
          supplierId: vendor.id,
          companyName: label,
          emailId: vendor.emailId || null,
          start: mentionStart,
          end: mentionEnd,
          display: mentionDisplay,
        },
      ].sort((a, b) => a.start - b.start),
    }));
  };

  const handleUserPick = (user: BusinessUserMentionOption) => {
    if (!hashTrigger) return;
    const label = user.name || "Unnamed user";
    const mentionDisplay = `#${label}`;
    applyMentionInsertion(hashTrigger, `${mentionDisplay} `, mentionDisplay, (reconciled, mentionStart, mentionEnd) => ({
      ...reconciled,
      businessUsers: [
        ...reconciled.businessUsers.filter((e) => e.end <= mentionStart || e.start >= mentionEnd),
        {
          userId: user.id,
          name: label,
          emailId: user.email_id || null,
          userName: user.user_name || null,
          start: mentionStart,
          end: mentionEnd,
          display: mentionDisplay,
        },
      ].sort((a, b) => a.start - b.start),
    }));
  };

  const handleItemPick = (item: ItemMentionOption) => {
    if (!slashTrigger) return;
    const label = itemMentionLabel(item);
    const mentionDisplay = `/${label}`;
    const sku = String(item.sku || item.itemCode || "").trim() || null;
    applyMentionInsertion(slashTrigger, `${mentionDisplay} `, mentionDisplay, (reconciled, mentionStart, mentionEnd) => ({
      ...reconciled,
      items: [
        ...reconciled.items.filter((e) => e.end <= mentionStart || e.start >= mentionEnd),
        {
          itemId: item.id,
          name: label,
          sku,
          categoryName: item.categoryName || null,
          start: mentionStart,
          end: mentionEnd,
          display: mentionDisplay,
        },
      ].sort((a, b) => a.start - b.start),
    }));
  };

  const handleBidPick = (bid: BidMentionOption) => {
    if (!caretTrigger) return;
    const label = bid.bidNumber;
    const mentionDisplay = `^${label}`;
    applyMentionInsertion(caretTrigger, `${mentionDisplay} `, mentionDisplay, (reconciled, mentionStart, mentionEnd) => ({
      ...reconciled,
      bids: [
        ...reconciled.bids.filter((e) => e.end <= mentionStart || e.start >= mentionEnd),
        {
          bidId: bid.id,
          bidNumber: label,
          bidTitle: bid.bidTitle,
          bidStatus: bid.bidStatus,
          start: mentionStart,
          end: mentionEnd,
          display: mentionDisplay,
        },
      ].sort((a, b) => a.start - b.start),
    }));
  };

  const handlePrPick = (pr: PrMentionOption) => {
    if (!ampersandTrigger) return;
    const label = pr.prNumber;
    const mentionDisplay = `&${label}`;
    applyMentionInsertion(ampersandTrigger, `${mentionDisplay} `, mentionDisplay, (reconciled, mentionStart, mentionEnd) => ({
      ...reconciled,
      prs: [
        ...reconciled.prs.filter((e) => e.end <= mentionStart || e.start >= mentionEnd),
        {
          prNumber: label,
          prDescription: pr.prDescription,
          prStatus: pr.prStatus,
          start: mentionStart,
          end: mentionEnd,
          display: mentionDisplay,
        },
      ].sort((a, b) => a.start - b.start),
    }));
  };

  const handlePoPick = (po: PoMentionOption) => {
    if (!percentTrigger) return;
    const label = po.poNumber;
    const mentionDisplay = `%${label}`;
    applyMentionInsertion(percentTrigger, `${mentionDisplay} `, mentionDisplay, (reconciled, mentionStart, mentionEnd) => ({
      ...reconciled,
      pos: [
        ...reconciled.pos.filter((e) => e.end <= mentionStart || e.start >= mentionEnd),
        {
          poNumber: label,
          poDescription: po.poDescription,
          poStatus: po.poStatus,
          companyName: po.companyName,
          start: mentionStart,
          end: mentionEnd,
          display: mentionDisplay,
        },
      ].sort((a, b) => a.start - b.start),
    }));
  };

  const handleInvoicePick = (invoice: InvoiceMentionOption) => {
    if (!dollarTrigger) return;
    const label = invoice.invoiceId;
    const mentionDisplay = `$${label}`;
    applyMentionInsertion(dollarTrigger, `${mentionDisplay} `, mentionDisplay, (reconciled, mentionStart, mentionEnd) => ({
      ...reconciled,
      invoices: [
        ...reconciled.invoices.filter((e) => e.end <= mentionStart || e.start >= mentionEnd),
        {
          invoiceId: invoice.invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          invoiceStatus: invoice.invoiceStatus,
          supplierName: invoice.supplierName,
          poNumber: invoice.poNumber,
          start: mentionStart,
          end: mentionEnd,
          display: mentionDisplay,
        },
      ].sort((a, b) => a.start - b.start),
    }));
  };

  const activeSuggestionsCount = (() => {
    switch (activeDropdown) {
      case "supplier":
        return supplierSuggestions.length;
      case "businessUser":
        return userSuggestions.length;
      case "item":
        return itemSuggestions.length;
      case "bid":
        return bidSuggestions.length;
      case "pr":
        return prSuggestions.length;
      case "po":
        return poSuggestions.length;
      case "invoice":
        return invoiceSuggestions.length;
      default:
        return 0;
    }
  })();

  const pickHighlighted = () => {
    if (activeDropdown === "supplier" && supplierSuggestions.length > 0) {
      handleSupplierPick(supplierSuggestions[highlightIndex] || supplierSuggestions[0]);
    } else if (activeDropdown === "businessUser" && userSuggestions.length > 0) {
      handleUserPick(userSuggestions[highlightIndex] || userSuggestions[0]);
    } else if (activeDropdown === "item" && itemSuggestions.length > 0) {
      handleItemPick(itemSuggestions[highlightIndex] || itemSuggestions[0]);
    } else if (activeDropdown === "bid" && bidSuggestions.length > 0) {
      handleBidPick(bidSuggestions[highlightIndex] || bidSuggestions[0]);
    } else if (activeDropdown === "pr" && prSuggestions.length > 0) {
      handlePrPick(prSuggestions[highlightIndex] || prSuggestions[0]);
    } else if (activeDropdown === "po" && poSuggestions.length > 0) {
      handlePoPick(poSuggestions[highlightIndex] || poSuggestions[0]);
    } else if (activeDropdown === "invoice" && invoiceSuggestions.length > 0) {
      handleInvoicePick(invoiceSuggestions[highlightIndex] || invoiceSuggestions[0]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!activeDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (activeSuggestionsCount > 0) {
        setHighlightIndex((prev) => (prev + 1) % activeSuggestionsCount);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (activeSuggestionsCount > 0) {
        setHighlightIndex((prev) => (prev - 1 + activeSuggestionsCount) % activeSuggestionsCount);
      }
      return;
    }
    if (e.key === "Enter") {
      if (activeSuggestionsCount > 0) {
        e.preventDefault();
        pickHighlighted();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const setPromptText = (text: string) => {
    setPrompt(text);
    applyLists({ suppliers: [], businessUsers: [], items: [], bids: [], prs: [], pos: [], invoices: [] });
    close();
  };

  const reset = () => {
    setPrompt("");
    applyLists({ suppliers: [], businessUsers: [], items: [], bids: [], prs: [], pos: [], invoices: [] });
    close();
  };

  const backdrop = useMemo(
    () =>
      buildComposerMentionBackdrop(
        prompt,
        supplierMentions,
        businessUserMentions,
        itemMentions,
        bidMentions,
        prMentions,
        poMentions,
        invoiceMentions,
      ),
    [
      prompt,
      supplierMentions,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
    ],
  );

  const renderDropdownBody = (
    loadingLabel: string,
    emptyLabel: string,
    children: React.ReactNode,
  ) => (
    <div className="max-h-60 overflow-auto py-1">
      {isLoading ? (
        <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          {loadingLabel}
        </div>
      ) : activeSuggestionsCount === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">{emptyLabel}</div>
      ) : (
        children
      )}
    </div>
  );

  const dropdown =
    activeDropdown && dropdownPos ? (
      <div
        className="absolute z-[100] min-w-[260px] max-w-[320px] rounded-md border bg-background shadow-lg"
        style={mentionDropdownAboveLineStyle(dropdownPos)}
        data-testid={`${activeDropdown}-mention-dropdown`}
      >
        {activeDropdown === "supplier" &&
          renderDropdownBody(
            "Searching suppliers...",
            "No suppliers found",
            supplierSuggestions.map((vendor, idx) => (
              <button
                type="button"
                key={`${vendor.id}-${vendor.companyName || "vendor"}`}
                className={`w-full text-left px-3 py-2 hover:bg-muted/80 ${idx === highlightIndex ? "bg-muted" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleSupplierPick(vendor);
                }}
                data-testid={`supplier-mention-option-${vendor.id}`}
              >
                <div className="text-sm">{vendor.companyName || "Unnamed vendor"}</div>
                <div className="text-xs text-muted-foreground">{vendor.emailId || "No email"}</div>
              </button>
            )),
          )}
        {activeDropdown === "businessUser" &&
          renderDropdownBody(
            "Searching users...",
            "No users found",
            userSuggestions.map((user, idx) => (
              <button
                type="button"
                key={`${user.id}-${user.name}`}
                className={`w-full text-left px-3 py-2 hover:bg-muted/80 ${idx === highlightIndex ? "bg-muted" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleUserPick(user);
                }}
                data-testid={`user-mention-option-${user.id}`}
              >
                <div className="text-sm">{user.name}</div>
                <div className="text-xs text-muted-foreground">
                  {user.email_id || "No email"}
                  {user.department_name ? ` · ${user.department_name}` : ""}
                </div>
              </button>
            )),
          )}
        {activeDropdown === "item" &&
          renderDropdownBody(
            "Searching items...",
            "No items found",
            itemSuggestions.map((item, idx) => (
              <button
                type="button"
                key={`${item.id}-${item.name}`}
                className={`w-full text-left px-3 py-2 hover:bg-muted/80 ${idx === highlightIndex ? "bg-muted" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleItemPick(item);
                }}
                data-testid={`item-mention-option-${item.id}`}
              >
                <div className="text-sm">{itemMentionLabel(item)}</div>
                <div className="text-xs text-muted-foreground">
                  {[item.sku || item.itemCode, item.categoryName].filter(Boolean).join(" · ") || "Catalog item"}
                </div>
              </button>
            )),
          )}
        {activeDropdown === "bid" &&
          renderDropdownBody(
            "Searching bids...",
            "No bids found",
            bidSuggestions.map((bid, idx) => (
              <button
                type="button"
                key={`${bid.id}-${bid.bidNumber}`}
                className={`w-full text-left px-3 py-2 hover:bg-muted/80 ${idx === highlightIndex ? "bg-muted" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleBidPick(bid);
                }}
                data-testid={`bid-mention-option-${bid.id}`}
              >
                <div className="text-sm">{bid.bidNumber}</div>
                <div className="text-xs text-muted-foreground">
                  {[bid.bidTitle, bid.bidStatus].filter(Boolean).join(" · ") || "Bid"}
                </div>
              </button>
            )),
          )}
        {activeDropdown === "pr" &&
          renderDropdownBody(
            "Searching PRs...",
            "No PRs found",
            prSuggestions.map((pr, idx) => (
              <button
                type="button"
                key={pr.prNumber}
                className={`w-full text-left px-3 py-2 hover:bg-muted/80 ${idx === highlightIndex ? "bg-muted" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handlePrPick(pr);
                }}
                data-testid={`pr-mention-option-${pr.prNumber}`}
              >
                <div className="text-sm">{pr.prNumber}</div>
                <div className="text-xs text-muted-foreground">
                  {[pr.prDescription, pr.prStatus].filter(Boolean).join(" · ") || "Purchase requisition"}
                </div>
              </button>
            )),
          )}
        {activeDropdown === "po" &&
          renderDropdownBody(
            "Searching POs...",
            "No POs found",
            poSuggestions.map((po, idx) => (
              <button
                type="button"
                key={po.poNumber}
                className={`w-full text-left px-3 py-2 hover:bg-muted/80 ${idx === highlightIndex ? "bg-muted" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handlePoPick(po);
                }}
                data-testid={`po-mention-option-${po.poNumber}`}
              >
                <div className="text-sm">{po.poNumber}</div>
                <div className="text-xs text-muted-foreground">
                  {[po.poDescription, po.companyName, po.poStatus].filter(Boolean).join(" · ") || "Purchase order"}
                </div>
              </button>
            )),
          )}
        {activeDropdown === "invoice" &&
          renderDropdownBody(
            "Searching invoices...",
            "No invoices found",
            invoiceSuggestions.map((invoice, idx) => (
              <button
                type="button"
                key={`${invoice.invoiceId}-${invoice.invoiceNumber}`}
                className={`w-full text-left px-3 py-2 hover:bg-muted/80 ${idx === highlightIndex ? "bg-muted" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleInvoicePick(invoice);
                }}
                data-testid={`invoice-mention-option-${invoice.invoiceId}`}
              >
                <div className="text-sm">{invoice.invoiceId}</div>
                <div className="text-xs text-muted-foreground">
                  {[invoice.invoiceNumber, invoice.supplierName, invoice.poNumber, invoice.invoiceStatus]
                    .filter(Boolean)
                    .join(" · ") || "Invoice"}
                </div>
              </button>
            )),
          )}
      </div>
    ) : null;

  const streamMentions = {
    mentions: supplierMentions.length > 0 ? supplierMentions : undefined,
    businessUserMentions: businessUserMentions.length > 0 ? businessUserMentions : undefined,
    itemMentions: itemMentions.length > 0 ? itemMentions : undefined,
    bidMentions: bidMentions.length > 0 ? bidMentions : undefined,
    prMentions: prMentions.length > 0 ? prMentions : undefined,
    poMentions: poMentions.length > 0 ? poMentions : undefined,
    invoiceMentions: invoiceMentions.length > 0 ? invoiceMentions : undefined,
  };

  return {
    inputRef,
    composerRef,
    prompt,
    supplierMentions,
    businessUserMentions,
    itemMentions,
    bidMentions,
    prMentions,
    poMentions,
    invoiceMentions,
    mentions: supplierMentions,
    streamMentions,
    setPromptText,
    reset,
    composerProps: {
      value: prompt,
      backdrop,
      onChange: (e) =>
        handlePromptChange(e.target.value, e.target.selectionStart ?? e.target.value.length),
      onClick: (e) =>
        refresh(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length),
      onKeyUp: (e) =>
        refresh(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length),
      onSelect: (e) =>
        refresh(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length),
      onKeyDown: handleKeyDown,
    },
    dropdown,
  };
}
