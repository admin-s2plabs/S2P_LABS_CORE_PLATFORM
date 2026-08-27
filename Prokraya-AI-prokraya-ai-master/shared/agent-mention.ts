export interface SupplierMention {
  supplierId: number;
  companyName: string;
  emailId: string | null;
  start: number;
  end: number;
  display: string;
}

export interface BusinessUserMention {
  userId: number;
  name: string;
  emailId: string | null;
  userName: string | null;
  start: number;
  end: number;
  display: string;
}

export interface ItemMention {
  itemId: string;
  name: string;
  sku: string | null;
  categoryName: string | null;
  start: number;
  end: number;
  display: string;
}

export interface BidMention {
  bidId: number;
  bidNumber: string;
  bidTitle: string | null;
  bidStatus: string | null;
  start: number;
  end: number;
  display: string;
}

export interface PrMention {
  prNumber: string;
  prDescription: string | null;
  prStatus: string | null;
  start: number;
  end: number;
  display: string;
}

export interface PoMention {
  poNumber: string;
  poDescription: string | null;
  poStatus: string | null;
  companyName: string | null;
  start: number;
  end: number;
  display: string;
}

export interface InvoiceMention {
  invoiceId: string;
  invoiceNumber: string;
  invoiceStatus: string | null;
  supplierName: string | null;
  poNumber: string | null;
  start: number;
  end: number;
  display: string;
}

export interface NormalizedSupplierMention {
  supplierId: number;
  companyName: string;
  emailId: string | null;
  display: string;
}

export interface NormalizedBusinessUserMention {
  userId: number;
  name: string;
  emailId: string | null;
  userName: string | null;
  display: string;
}

export interface NormalizedItemMention {
  itemId: string;
  name: string;
  sku: string | null;
  categoryName: string | null;
  display: string;
}

export interface NormalizedBidMention {
  bidId: number;
  bidNumber: string;
  bidTitle: string | null;
  bidStatus: string | null;
  display: string;
}

export interface NormalizedPrMention {
  prNumber: string;
  prDescription: string | null;
  prStatus: string | null;
  display: string;
}

export interface NormalizedPoMention {
  poNumber: string;
  poDescription: string | null;
  poStatus: string | null;
  companyName: string | null;
  display: string;
}

export interface NormalizedInvoiceMention {
  invoiceId: string;
  invoiceNumber: string;
  invoiceStatus: string | null;
  supplierName: string | null;
  poNumber: string | null;
  display: string;
}

export interface AgentMentionPayload {
  mentions?: SupplierMention[];
  businessUserMentions?: BusinessUserMention[];
  itemMentions?: ItemMention[];
  bidMentions?: BidMention[];
  prMentions?: PrMention[];
  poMentions?: PoMention[];
  invoiceMentions?: InvoiceMention[];
}

export function normalizeSupplierMentions(
  mentions: SupplierMention[] = [],
): NormalizedSupplierMention[] {
  return Array.isArray(mentions)
    ? mentions
        .map((mention) => ({
          supplierId: Number(mention?.supplierId),
          companyName: String(mention?.companyName || "").trim(),
          emailId: mention?.emailId ? String(mention.emailId) : null,
          display: String(mention?.display || "").trim(),
        }))
        .filter(
          (mention) =>
            Number.isFinite(mention.supplierId) &&
            mention.supplierId > 0 &&
            mention.companyName.length > 0,
        )
    : [];
}

export function normalizeBusinessUserMentions(
  mentions: BusinessUserMention[] = [],
): NormalizedBusinessUserMention[] {
  return Array.isArray(mentions)
    ? mentions
        .map((mention) => ({
          userId: Number(mention?.userId),
          name: String(mention?.name || "").trim(),
          emailId: mention?.emailId ? String(mention.emailId) : null,
          userName: mention?.userName ? String(mention.userName) : null,
          display: String(mention?.display || "").trim(),
        }))
        .filter(
          (mention) =>
            Number.isFinite(mention.userId) && mention.userId > 0 && mention.name.length > 0,
        )
    : [];
}

export function normalizeItemMentions(mentions: ItemMention[] = []): NormalizedItemMention[] {
  return Array.isArray(mentions)
    ? mentions
        .map((mention) => ({
          itemId: String(mention?.itemId || "").trim(),
          name: String(mention?.name || "").trim(),
          sku: mention?.sku ? String(mention.sku) : null,
          categoryName: mention?.categoryName ? String(mention.categoryName) : null,
          display: String(mention?.display || "").trim(),
        }))
        .filter((mention) => mention.itemId.length > 0 && mention.name.length > 0)
    : [];
}

export function normalizeBidMentions(mentions: BidMention[] = []): NormalizedBidMention[] {
  return Array.isArray(mentions)
    ? mentions
        .map((mention) => ({
          bidId: Number(mention?.bidId),
          bidNumber: String(mention?.bidNumber || "").trim(),
          bidTitle: mention?.bidTitle ? String(mention.bidTitle) : null,
          bidStatus: mention?.bidStatus ? String(mention.bidStatus) : null,
          display: String(mention?.display || "").trim(),
        }))
        .filter(
          (mention) =>
            Number.isFinite(mention.bidId) && mention.bidId > 0 && mention.bidNumber.length > 0,
        )
    : [];
}

export function normalizePrMentions(mentions: PrMention[] = []): NormalizedPrMention[] {
  return Array.isArray(mentions)
    ? mentions
        .map((mention) => ({
          prNumber: String(mention?.prNumber || "").trim(),
          prDescription: mention?.prDescription ? String(mention.prDescription) : null,
          prStatus: mention?.prStatus ? String(mention.prStatus) : null,
          display: String(mention?.display || "").trim(),
        }))
        .filter((mention) => mention.prNumber.length > 0)
    : [];
}

export function normalizePoMentions(mentions: PoMention[] = []): NormalizedPoMention[] {
  return Array.isArray(mentions)
    ? mentions
        .map((mention) => ({
          poNumber: String(mention?.poNumber || "").trim(),
          poDescription: mention?.poDescription ? String(mention.poDescription) : null,
          poStatus: mention?.poStatus ? String(mention.poStatus) : null,
          companyName: mention?.companyName ? String(mention.companyName) : null,
          display: String(mention?.display || "").trim(),
        }))
        .filter((mention) => mention.poNumber.length > 0)
    : [];
}

export function normalizeInvoiceMentions(
  mentions: InvoiceMention[] = [],
): NormalizedInvoiceMention[] {
  return Array.isArray(mentions)
    ? mentions
        .map((mention) => ({
          invoiceId: String(mention?.invoiceId || "").trim(),
          invoiceNumber: String(mention?.invoiceNumber || "").trim(),
          invoiceStatus: mention?.invoiceStatus ? String(mention.invoiceStatus) : null,
          supplierName: mention?.supplierName ? String(mention.supplierName) : null,
          poNumber: mention?.poNumber ? String(mention.poNumber) : null,
          display: String(mention?.display || "").trim(),
        }))
        .filter((mention) => mention.invoiceNumber.length > 0)
    : [];
}

/** Append all user-selected mention kinds as authoritative structured entities. */
export function applyAllMentionsToPrompt(
  prompt: string,
  payload: AgentMentionPayload = {},
): string {
  const blocks: string[] = [];

  const suppliers = normalizeSupplierMentions(payload.mentions);
  if (suppliers.length > 0) {
    blocks.push(
      `Use these user-selected supplier mentions as authoritative structured entities:
${suppliers
  .map(
    (mention) =>
      `- ${mention.display || `@${mention.companyName}`} => Supplier ID: ${mention.supplierId}, Company Name: ${mention.companyName}, Email: ${mention.emailId || "N/A"}`,
  )
  .join("\n")}

When the user @-mentions a supplier, use that Supplier ID and Company Name — never invent vendor names or IDs.`,
    );
  }

  const users = normalizeBusinessUserMentions(payload.businessUserMentions);
  if (users.length > 0) {
    blocks.push(
      `Use these user-selected business user mentions as authoritative structured entities (active organization users from User Management):
${users
  .map(
    (mention) =>
      `- ${mention.display || `#${mention.name}`} => User ID: ${mention.userId}, Name: ${mention.name}, Email: ${mention.emailId || "N/A"}, User Name: ${mention.userName || "N/A"}`,
  )
  .join("\n")}

When you need organization user IDs, prefer these User IDs over guessed name matches.`,
    );
  }

  const items = normalizeItemMentions(payload.itemMentions);
  if (items.length > 0) {
    blocks.push(
      `Use these user-selected Item Master mentions as authoritative structured entities:
${items
  .map(
    (mention) =>
      `- ${mention.display || `/${mention.name}`} => Item ID: ${mention.itemId}, Name: ${mention.name}, SKU: ${mention.sku || "N/A"}, Category: ${mention.categoryName || "N/A"}`,
  )
  .join("\n")}

When you need catalog items, prefer these Item IDs/SKUs over guessed name matches.`,
    );
  }

  const bids = normalizeBidMentions(payload.bidMentions);
  if (bids.length > 0) {
    blocks.push(
      `Use these user-selected Bid mentions as authoritative structured entities:
${bids
  .map(
    (mention) =>
      `- ${mention.display || `^${mention.bidNumber}`} => Bid ID: ${mention.bidId}, Bid Number: ${mention.bidNumber}, Title: ${mention.bidTitle || "N/A"}, Status: ${mention.bidStatus || "N/A"}`,
  )
  .join("\n")}

When the user refers to a bid, use these Bid IDs and Bid Numbers — never invent bid references.`,
    );
  }

  const prs = normalizePrMentions(payload.prMentions);
  if (prs.length > 0) {
    blocks.push(
      `Use these user-selected Purchase Requisition (PR) mentions as authoritative structured entities:
${prs
  .map(
    (mention) =>
      `- ${mention.display || `&${mention.prNumber}`} => PR Number: ${mention.prNumber}, Description: ${mention.prDescription || "N/A"}, Status: ${mention.prStatus || "N/A"}`,
  )
  .join("\n")}

When the user refers to a PR, use these PR Numbers — never invent PR references.`,
    );
  }

  const pos = normalizePoMentions(payload.poMentions);
  if (pos.length > 0) {
    blocks.push(
      `Use these user-selected Purchase Order (PO) mentions as authoritative structured entities:
${pos
  .map(
    (mention) =>
      `- ${mention.display || `%${mention.poNumber}`} => PO Number: ${mention.poNumber}, Description: ${mention.poDescription || "N/A"}, Status: ${mention.poStatus || "N/A"}, Supplier: ${mention.companyName || "N/A"}`,
  )
  .join("\n")}

When the user refers to a PO, use these PO Numbers — never invent PO references.`,
    );
  }

  const invoices = normalizeInvoiceMentions(payload.invoiceMentions);
  if (invoices.length > 0) {
    blocks.push(
      `Use these user-selected Invoice mentions as authoritative structured entities:
${invoices
  .map(
    (mention) =>
      `- ${mention.display || `$${mention.invoiceNumber}`} => Invoice ID: ${mention.invoiceId}, Invoice Number: ${mention.invoiceNumber}, Status: ${mention.invoiceStatus || "N/A"}, Supplier: ${mention.supplierName || "N/A"}, PO Number: ${mention.poNumber || "N/A"}`,
  )
  .join("\n")}

When the user refers to an invoice, use these Invoice IDs and Invoice Numbers — never invent invoice references.`,
    );
  }

  if (blocks.length === 0) return prompt;
  return `${prompt}\n\n${blocks.join("\n\n")}`;
}

export function applySupplierMentionsToPrompt(
  prompt: string,
  mentions: SupplierMention[] = [],
): string {
  return applyAllMentionsToPrompt(prompt, { mentions });
}
