import type {
  BidMention,
  BusinessUserMention,
  InvoiceMention,
  ItemMention,
  PoMention,
  PrMention,
  SupplierMention,
} from "@shared/agent-mention";

export type SourcingMentionDropdownKind =
  | "supplier"
  | "businessUser"
  | "item"
  | "bid"
  | "pr"
  | "po"
  | "invoice";

export interface TextSpanMention {
  start: number;
  end: number;
  display: string;
}

export const MENTION_SEARCH_DELAY_MS = 220;
export const MENTION_SEARCH_LIMIT = 8;

export interface MentionTrigger {
  start: number;
  end: number;
  query: string;
}

export interface VendorMentionOption {
  id: number;
  companyName: string | null;
  emailId: string | null;
}

function deriveEditRange(previous: string, next: string) {
  const previousLen = previous.length;
  const nextLen = next.length;

  let prefixLen = 0;
  while (
    prefixLen < previousLen &&
    prefixLen < nextLen &&
    previous[prefixLen] === next[prefixLen]
  ) {
    prefixLen += 1;
  }

  let suffixLen = 0;
  while (
    suffixLen < previousLen - prefixLen &&
    suffixLen < nextLen - prefixLen &&
    previous[previousLen - 1 - suffixLen] === next[nextLen - 1 - suffixLen]
  ) {
    suffixLen += 1;
  }

  return {
    previousStart: prefixLen,
    previousEnd: previousLen - suffixLen,
    nextEnd: nextLen - suffixLen,
    delta: nextLen - previousLen,
  };
}

export function reconcileMentionsAfterTextChange<T extends TextSpanMention>(
  previousMentions: T[],
  previousText: string,
  nextText: string,
): T[] {
  if (previousMentions.length === 0) return previousMentions;
  const edit = deriveEditRange(previousText, nextText);
  const nextMentions: T[] = [];

  for (const mention of previousMentions) {
    if (mention.end <= edit.previousStart) {
      if (nextText.slice(mention.start, mention.end) === mention.display) {
        nextMentions.push(mention);
      }
      continue;
    }
    if (mention.start >= edit.previousEnd) {
      const shifted = {
        ...mention,
        start: mention.start + edit.delta,
        end: mention.end + edit.delta,
      };
      if (nextText.slice(shifted.start, shifted.end) === shifted.display) {
        nextMentions.push(shifted);
      }
      continue;
    }
  }

  return nextMentions.sort((a, b) => a.start - b.start);
}

/** Shift every mention list when prompt text changes (required on pick — not only the picked type). */
export function reconcileAllSourcingMentionsAfterTextChange(
  oldText: string,
  newText: string,
  suppliers: SupplierMention[],
  businessUsers: BusinessUserMention[],
  items: ItemMention[],
  bids: BidMention[] = [],
  prs: PrMention[] = [],
  pos: PoMention[] = [],
  invoices: InvoiceMention[] = [],
) {
  return {
    suppliers: reconcileMentionsAfterTextChange(suppliers, oldText, newText),
    businessUsers: reconcileMentionsAfterTextChange(businessUsers, oldText, newText),
    items: reconcileMentionsAfterTextChange(items, oldText, newText),
    bids: reconcileMentionsAfterTextChange(bids, oldText, newText),
    prs: reconcileMentionsAfterTextChange(prs, oldText, newText),
    pos: reconcileMentionsAfterTextChange(pos, oldText, newText),
    invoices: reconcileMentionsAfterTextChange(invoices, oldText, newText),
  };
}

export function insertTextAtMentionTrigger(
  text: string,
  trigger: MentionTrigger,
  replacement: string,
  selectionEnd?: number | null,
) {
  const replaceEnd =
    typeof selectionEnd === "number"
      ? Math.max(trigger.end, Math.min(selectionEnd, text.length))
      : trigger.end;
  const nextText = text.slice(0, trigger.start) + replacement + text.slice(replaceEnd);
  return { nextText, replaceStart: trigger.start, replaceEnd };
}

/** Backdrop chip styles without horizontal padding — keeps mirror layer aligned with textarea glyphs. */
export const composerMentionBackdropClass: Record<SourcingMentionDropdownKind, string> = {
  supplier: "rounded-sm bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  businessUser: "rounded-sm bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  item: "rounded-sm bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  bid: "rounded-sm bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  pr: "rounded-sm bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  po: "rounded-sm bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  invoice: "rounded-sm bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
};

/** Anchor dropdown top to the caret line, then shift up via {@link mentionDropdownAboveLineStyle}. */
export const MENTION_DROPDOWN_ABOVE_LINE_TRANSFORM = "translateY(calc(-100% - 8px))";

export function mentionDropdownAboveLineStyle(
  pos: { top: number; left: number } | null,
): { top: number; left: number; transform: string } {
  return {
    top: pos?.top ?? 8,
    left: pos?.left ?? 8,
    transform: MENTION_DROPDOWN_ABOVE_LINE_TRANSFORM,
  };
}

export function getMentionDropdownPosition(
  textarea: HTMLTextAreaElement,
  caretPosition: number,
  anchor?: HTMLElement | null,
): { top: number; left: number } {
  const coords = getTextareaCaretCoordinates(textarea, caretPosition);
  let top = coords.top;
  let left = coords.left + 8;

  if (anchor) {
    const textareaRect = textarea.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    top = textareaRect.top - anchorRect.top + top;
    left = textareaRect.left - anchorRect.left + left;
  }

  return {
    top: Math.max(8, top),
    left: Math.max(8, left),
  };
}

export type MentionHighlightSegment = {
  key: string;
  text: string;
  isMention: boolean;
  mention?: SupplierMention;
};

export function buildMentionHighlightSegments(
  text: string,
  mentions: SupplierMention[],
): MentionHighlightSegment[] {
  if (!text) return [{ key: "text-0", text: "", isMention: false }];
  const validMentions = mentions
    .filter(
      (mention) =>
        mention.start >= 0 &&
        mention.end > mention.start &&
        mention.end <= text.length &&
        text.slice(mention.start, mention.end) === mention.display,
    )
    .sort((a, b) => a.start - b.start);

  const segments: MentionHighlightSegment[] = [];
  let cursor = 0;

  validMentions.forEach((mention, idx) => {
    if (mention.start > cursor) {
      segments.push({
        key: `plain-${idx}-${cursor}`,
        text: text.slice(cursor, mention.start),
        isMention: false,
      });
    }
    segments.push({
      key: `mention-${idx}-${mention.start}`,
      text: text.slice(mention.start, mention.end),
      isMention: true,
      mention,
    });
    cursor = mention.end;
  });

  if (cursor < text.length) {
    segments.push({
      key: `plain-tail-${cursor}`,
      text: text.slice(cursor),
      isMention: false,
    });
  }

  return segments;
}

export function UserMessageBubbleContent({
  content,
  mentions,
}: {
  content: string;
  mentions?: SupplierMention[];
}) {
  if (!mentions?.length) {
    return <p className="text-sm whitespace-pre-wrap">{content}</p>;
  }

  const segments = buildMentionHighlightSegments(content, mentions);

  return (
    <p className="text-sm whitespace-pre-wrap">
      {segments.map((segment) =>
        segment.isMention && segment.mention ? (
          <span
            key={segment.key}
            className="inline rounded-sm bg-primary-foreground/20 px-0.5 font-medium"
          >
            {segment.mention.companyName}
          </span>
        ) : (
          <span key={segment.key}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

function getActiveCharMentionTrigger(
  text: string,
  caret: number,
  triggerChar: string,
  mentions: TextSpanMention[],
  otherMentions: TextSpanMention[],
  forbiddenInQuery: RegExp,
): MentionTrigger | null {
  if (caret < 0 || caret > text.length) return null;
  const insideMention = [...mentions, ...otherMentions].some(
    (mention) => caret > mention.start && caret <= mention.end,
  );
  if (insideMention) return null;
  const beforeCaret = text.slice(0, caret);
  const charIndex = beforeCaret.lastIndexOf(triggerChar);
  if (charIndex < 0) return null;
  const prefixChar = charIndex > 0 ? beforeCaret[charIndex - 1] : "";
  if (prefixChar && !/[\s([{,;:]/.test(prefixChar)) return null;
  const query = beforeCaret.slice(charIndex + 1);
  if (!forbiddenInQuery.test(query)) return null;
  return { start: charIndex, end: caret, query };
}

/** Characters allowed in @ supplier mention queries (name, numeric id, supplier ref, email). */
const SUPPLIER_MENTION_QUERY_PATTERN = /^[\w.@%+-]*$/i;

export function getActiveMentionTrigger(
  text: string,
  caret: number,
  mentions: SupplierMention[],
  otherMentions: TextSpanMention[] = [],
): MentionTrigger | null {
  if (caret < 0 || caret > text.length) return null;
  const insideMention = [...mentions, ...otherMentions].some(
    (mention) => caret > mention.start && caret <= mention.end,
  );
  if (insideMention) return null;

  const beforeCaret = text.slice(0, caret);
  for (let i = caret - 1; i >= 0; i--) {
    const ch = beforeCaret[i];
    if (ch === "@") {
      const prefixChar = i > 0 ? beforeCaret[i - 1] : "";
      if (prefixChar && !/[\s([{,;:]/.test(prefixChar)) {
        continue;
      }
      const query = beforeCaret.slice(i + 1);
      if (/\s/.test(query)) return null;
      if (!SUPPLIER_MENTION_QUERY_PATTERN.test(query)) return null;
      return { start: i, end: caret, query };
    }
    if (/\s/.test(ch)) break;
  }
  return null;
}

export function getActiveHashMentionTrigger(
  text: string,
  caret: number,
  mentions: BusinessUserMention[],
  otherMentions: TextSpanMention[] = [],
): MentionTrigger | null {
  return getActiveCharMentionTrigger(text, caret, "#", mentions, otherMentions, /^[^\s#]*$/);
}

export function getActiveSlashMentionTrigger(
  text: string,
  caret: number,
  mentions: ItemMention[],
  otherMentions: TextSpanMention[] = [],
): MentionTrigger | null {
  return getActiveCharMentionTrigger(text, caret, "/", mentions, otherMentions, /^[^\s/]*$/);
}

export function getActiveCaretMentionTrigger(
  text: string,
  caret: number,
  mentions: BidMention[],
  otherMentions: TextSpanMention[] = [],
): MentionTrigger | null {
  return getActiveCharMentionTrigger(text, caret, "^", mentions, otherMentions, /^[^\s^]*$/);
}

export function getActiveAmpersandMentionTrigger(
  text: string,
  caret: number,
  mentions: PrMention[],
  otherMentions: TextSpanMention[] = [],
): MentionTrigger | null {
  return getActiveCharMentionTrigger(text, caret, "&", mentions, otherMentions, /^[^\s&]*$/);
}

export function getActivePercentMentionTrigger(
  text: string,
  caret: number,
  mentions: PoMention[],
  otherMentions: TextSpanMention[] = [],
): MentionTrigger | null {
  return getActiveCharMentionTrigger(text, caret, "%", mentions, otherMentions, /^[^\s%]*$/);
}

export function getActiveDollarMentionTrigger(
  text: string,
  caret: number,
  mentions: InvoiceMention[],
  otherMentions: TextSpanMention[] = [],
): MentionTrigger | null {
  return getActiveCharMentionTrigger(text, caret, "$", mentions, otherMentions, /^[^\s$]*$/);
}

export function otherMentionSpans(
  supplierMentions: SupplierMention[],
  businessUserMentions: BusinessUserMention[],
  itemMentions: ItemMention[],
  exclude: SourcingMentionDropdownKind,
  bidMentions: BidMention[] = [],
  prMentions: PrMention[] = [],
  poMentions: PoMention[] = [],
  invoiceMentions: InvoiceMention[] = [],
): TextSpanMention[] {
  const spans: TextSpanMention[] = [];
  if (exclude !== "supplier") spans.push(...supplierMentions);
  if (exclude !== "businessUser") spans.push(...businessUserMentions);
  if (exclude !== "item") spans.push(...itemMentions);
  if (exclude !== "bid") spans.push(...bidMentions);
  if (exclude !== "pr") spans.push(...prMentions);
  if (exclude !== "po") spans.push(...poMentions);
  if (exclude !== "invoice") spans.push(...invoiceMentions);
  return spans;
}

export function pickActiveMentionDropdown(
  atTrigger: MentionTrigger | null,
  hashTrigger: MentionTrigger | null,
  slashTrigger: MentionTrigger | null = null,
  caretTrigger: MentionTrigger | null = null,
  ampersandTrigger: MentionTrigger | null = null,
  percentTrigger: MentionTrigger | null = null,
  dollarTrigger: MentionTrigger | null = null,
): SourcingMentionDropdownKind | null {
  const candidates: Array<{ kind: SourcingMentionDropdownKind; trigger: MentionTrigger }> = [];
  if (atTrigger) candidates.push({ kind: "supplier", trigger: atTrigger });
  if (hashTrigger) candidates.push({ kind: "businessUser", trigger: hashTrigger });
  if (slashTrigger) candidates.push({ kind: "item", trigger: slashTrigger });
  if (caretTrigger) candidates.push({ kind: "bid", trigger: caretTrigger });
  if (ampersandTrigger) candidates.push({ kind: "pr", trigger: ampersandTrigger });
  if (percentTrigger) candidates.push({ kind: "po", trigger: percentTrigger });
  if (dollarTrigger) candidates.push({ kind: "invoice", trigger: dollarTrigger });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.trigger.start - a.trigger.start);
  return candidates[0].kind;
}

export type CombinedHighlightSegment = {
  key: string;
  text: string;
  isMention: boolean;
  kind?: SourcingMentionDropdownKind;
  label?: string;
};

export function buildCombinedMentionHighlightSegments(
  text: string,
  supplierMentions: SupplierMention[],
  businessUserMentions: BusinessUserMention[],
  itemMentions: ItemMention[] = [],
  bidMentions: BidMention[] = [],
  prMentions: PrMention[] = [],
  poMentions: PoMention[] = [],
  invoiceMentions: InvoiceMention[] = [],
): CombinedHighlightSegment[] {
  if (!text) return [{ key: "text-0", text: "", isMention: false }];

  type Tagged = {
    start: number;
    end: number;
    display: string;
    kind: SourcingMentionDropdownKind;
    label: string;
  };
  const tagged: Tagged[] = [
    ...supplierMentions
      .filter(
        (m) =>
          m.start >= 0 &&
          m.end > m.start &&
          m.end <= text.length &&
          text.slice(m.start, m.end) === m.display,
      )
      .map((m) => ({
        start: m.start,
        end: m.end,
        display: m.display,
        kind: "supplier" as const,
        label: m.companyName,
      })),
    ...businessUserMentions
      .filter(
        (m) =>
          m.start >= 0 &&
          m.end > m.start &&
          m.end <= text.length &&
          text.slice(m.start, m.end) === m.display,
      )
      .map((m) => ({
        start: m.start,
        end: m.end,
        display: m.display,
        kind: "businessUser" as const,
        label: m.name,
      })),
    ...itemMentions
      .filter(
        (m) =>
          m.start >= 0 &&
          m.end > m.start &&
          m.end <= text.length &&
          text.slice(m.start, m.end) === m.display,
      )
      .map((m) => ({
        start: m.start,
        end: m.end,
        display: m.display,
        kind: "item" as const,
        label: m.name,
      })),
    ...bidMentions
      .filter(
        (m) =>
          m.start >= 0 &&
          m.end > m.start &&
          m.end <= text.length &&
          text.slice(m.start, m.end) === m.display,
      )
      .map((m) => ({
        start: m.start,
        end: m.end,
        display: m.display,
        kind: "bid" as const,
        label: m.bidNumber,
      })),
    ...prMentions
      .filter(
        (m) =>
          m.start >= 0 &&
          m.end > m.start &&
          m.end <= text.length &&
          text.slice(m.start, m.end) === m.display,
      )
      .map((m) => ({
        start: m.start,
        end: m.end,
        display: m.display,
        kind: "pr" as const,
        label: m.prNumber,
      })),
    ...poMentions
      .filter(
        (m) =>
          m.start >= 0 &&
          m.end > m.start &&
          m.end <= text.length &&
          text.slice(m.start, m.end) === m.display,
      )
      .map((m) => ({
        start: m.start,
        end: m.end,
        display: m.display,
        kind: "po" as const,
        label: m.poNumber,
      })),
    ...invoiceMentions
      .filter(
        (m) =>
          m.start >= 0 &&
          m.end > m.start &&
          m.end <= text.length &&
          text.slice(m.start, m.end) === m.display,
      )
      .map((m) => ({
        start: m.start,
        end: m.end,
        display: m.display,
        kind: "invoice" as const,
        label: m.invoiceId,
      })),
  ].sort((a, b) => a.start - b.start);

  const segments: CombinedHighlightSegment[] = [];
  let cursor = 0;

  tagged.forEach((mention, idx) => {
    if (mention.start > cursor) {
      segments.push({
        key: `plain-${idx}-${cursor}`,
        text: text.slice(cursor, mention.start),
        isMention: false,
      });
    }
    segments.push({
      key: `mention-${mention.kind}-${idx}-${mention.start}`,
      text: text.slice(mention.start, mention.end),
      isMention: true,
      kind: mention.kind,
      label: mention.label,
    });
    cursor = mention.end;
  });

  if (cursor < text.length) {
    segments.push({
      key: `plain-tail-${cursor}`,
      text: text.slice(cursor),
      isMention: false,
    });
  }

  return segments.length > 0 ? segments : [{ key: "text-0", text, isMention: false }];
}

export function buildComposerMentionBackdrop(
  text: string,
  supplierMentions: SupplierMention[],
  businessUserMentions: BusinessUserMention[],
  itemMentions: ItemMention[] = [],
  bidMentions: BidMention[] = [],
  prMentions: PrMention[] = [],
  poMentions: PoMention[] = [],
  invoiceMentions: InvoiceMention[] = [],
) {
  return buildCombinedMentionHighlightSegments(
    text,
    supplierMentions,
    businessUserMentions,
    itemMentions,
    bidMentions,
    prMentions,
    poMentions,
    invoiceMentions,
  ).map((segment) =>
    segment.isMention && segment.kind ? (
      <span key={segment.key} className={composerMentionBackdropClass[segment.kind]}>
        {segment.text}
      </span>
    ) : (
      <span key={segment.key} className="text-foreground">
        {segment.text}
      </span>
    ),
  );
}

export interface BusinessUserMentionOption {
  id: number;
  name: string;
  email_id: string | null;
  user_name?: string | null;
  department_name?: string | null;
}

export interface ItemMentionOption {
  id: string;
  name: string;
  itemCode?: string | null;
  sku?: string | null;
  categoryName?: string | null;
}

export interface BidMentionOption {
  id: number;
  bidNumber: string;
  bidTitle: string | null;
  bidStatus: string | null;
}

export interface PrMentionOption {
  prNumber: string;
  prDescription: string | null;
  prStatus: string | null;
}

export interface PoMentionOption {
  poNumber: string;
  poDescription: string | null;
  poStatus: string | null;
  companyName: string | null;
}

export interface InvoiceMentionOption {
  invoiceId: string;
  invoiceNumber: string;
  invoiceStatus: string | null;
  supplierName: string | null;
  poNumber: string | null;
}

export function itemMentionLabel(item: ItemMentionOption) {
  const name = String(item.name || "").trim();
  if (name.length > 0) return name;
  const sku = String(item.sku || item.itemCode || "").trim();
  return sku || "Unnamed item";
}

export function SourcingUserMessageBubbleContent({
  content,
  mentions,
  businessUserMentions,
  itemMentions,
  bidMentions,
  prMentions,
  poMentions,
  invoiceMentions,
}: {
  content: string;
  mentions?: SupplierMention[];
  businessUserMentions?: BusinessUserMention[];
  itemMentions?: ItemMention[];
  bidMentions?: BidMention[];
  prMentions?: PrMention[];
  poMentions?: PoMention[];
  invoiceMentions?: InvoiceMention[];
}) {
  if (
    !mentions?.length &&
    !businessUserMentions?.length &&
    !itemMentions?.length &&
    !bidMentions?.length &&
    !prMentions?.length &&
    !poMentions?.length &&
    !invoiceMentions?.length
  ) {
    return <p className="text-sm whitespace-pre-wrap">{content}</p>;
  }

  const segments = buildCombinedMentionHighlightSegments(
    content,
    mentions || [],
    businessUserMentions || [],
    itemMentions || [],
    bidMentions || [],
    prMentions || [],
    poMentions || [],
    invoiceMentions || [],
  );

  return (
    <p className="text-sm whitespace-pre-wrap">
      {segments.map((segment) =>
        segment.isMention ? (
          <span
            key={segment.key}
            className="inline rounded-sm bg-primary-foreground/20 px-0.5 font-medium"
          >
            {segment.label || segment.text}
          </span>
        ) : (
          <span key={segment.key}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

export function getTextareaCaretCoordinates(textarea: HTMLTextAreaElement, position: number) {
  const div = document.createElement("div");
  const style = window.getComputedStyle(textarea);
  const properties = [
    "boxSizing",
    "width",
    "height",
    "overflowX",
    "overflowY",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "fontFamily",
    "lineHeight",
    "letterSpacing",
    "textTransform",
    "textAlign",
    "textIndent",
    "whiteSpace",
    "wordBreak",
  ] as const;

  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordBreak = "break-word";

  for (const property of properties) {
    div.style[property] = style[property];
  }

  div.textContent = textarea.value.slice(0, position);
  const span = document.createElement("span");
  span.textContent = textarea.value.slice(position) || " ";
  div.appendChild(span);
  document.body.appendChild(div);

  const top = span.offsetTop - textarea.scrollTop;
  const left = span.offsetLeft - textarea.scrollLeft;

  document.body.removeChild(div);
  return { top, left };
}

export function buildVendorMentionSearchEndpoint(query: string, scopeOfSupplyOnly?: boolean) {
  const q = query.trim();
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("limit", String(MENTION_SEARCH_LIMIT));
  if (scopeOfSupplyOnly) {
    params.set("scope_of_supply_only", "true");
  }
  if (!q) {
    params.set("offset", "0");
  }
  return `/api/vendor-agent/vendors/search?${params.toString()}`;
}

export function buildBusinessUserMentionSearchEndpoint(query: string) {
  const q = query.trim();
  const params = new URLSearchParams({
    page: "1",
    limit: String(MENTION_SEARCH_LIMIT),
  });
  if (q) params.set("search", q);
  return `/api/users/dropdown?${params.toString()}`;
}

export function buildItemMentionSearchEndpoint(query: string) {
  const q = query.trim();
  const params = new URLSearchParams({
    page: "1",
    limit: String(MENTION_SEARCH_LIMIT),
  });
  if (q) params.set("search", q);
  return `/api/items?${params.toString()}`;
}

export function buildBidMentionSearchEndpoint(query: string) {
  const q = query.trim();
  const params = new URLSearchParams({ limit: String(MENTION_SEARCH_LIMIT) });
  if (q) params.set("q", q);
  return `/api/bids/mention-search?${params.toString()}`;
}

export function buildPrMentionSearchEndpoint(query: string) {
  const q = query.trim();
  const params = new URLSearchParams({ limit: String(MENTION_SEARCH_LIMIT) });
  if (q) params.set("q", q);
  return `/api/requisitions/mention-search?${params.toString()}`;
}

export function buildPoMentionSearchEndpoint(query: string) {
  const q = query.trim();
  const params = new URLSearchParams({ limit: String(MENTION_SEARCH_LIMIT) });
  if (q) params.set("q", q);
  return `/api/purchase-orders/mention-search?${params.toString()}`;
}

export function buildInvoiceMentionSearchEndpoint(query: string) {
  const q = query.trim();
  const params = new URLSearchParams({ limit: String(MENTION_SEARCH_LIMIT) });
  if (q) params.set("q", q);
  return `/api/invoices/mention-search?${params.toString()}`;
}
