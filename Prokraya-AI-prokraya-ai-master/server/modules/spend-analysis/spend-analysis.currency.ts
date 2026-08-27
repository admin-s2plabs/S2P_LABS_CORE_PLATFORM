import * as procurementRepo from "../procurement/procurement.repository";
import { pool } from "../../db";
import { getContextPool } from "../../tenant-context";

const getPool = () => getContextPool() ?? pool;

export const CURRENCY_CONVERSION_ERROR =
  "No currency conversion exists. Please ask your administrator to add the exchange rate in Exchange Rates.";

export class CurrencyConversionError extends Error {
  status = 400;
  constructor(fromCurrency: string, toCurrency: string) {
    super(
      `No currency conversion exists from ${fromCurrency} to ${toCurrency}. Please ask your administrator to add it in Exchange Rates.`
    );
    this.name = "CurrencyConversionError";
  }
}

function norm(code: string | null | undefined): string {
  return (code || "").trim().toUpperCase();
}

export type RateResolver = {
  convert: (amount: number, fromCurrency: string) => Promise<number>;
  getOrgCurrency: (orgId: number) => Promise<string>;
};

export async function createRateResolver(
  baseCurrency: string,
  orgId?: number
): Promise<RateResolver> {
  const base = norm(baseCurrency);
  const rateCache = new Map<string, number>();
  const orgCurrencyCache = new Map<number, string>();

  if (orgId) {
    const single = await getOrgCurrencyById(orgId);
    orgCurrencyCache.set(orgId, single);
  } else {
    const map = await getAllOrgCurrencies();
    map.forEach((cur, id) => orgCurrencyCache.set(id, cur));
  }

  async function getRate(from: string, to: string): Promise<number> {
    const f = norm(from);
    const t = norm(to);
    if (!f || !t) throw new CurrencyConversionError(from || "?", to || "?");
    if (f === t) return 1;
    const key = `${f}|${t}`;
    if (rateCache.has(key)) return rateCache.get(key)!;
    const row = await procurementRepo.getExchangeRate(f, t);
    if (!row?.conversion_rate) {
      throw new CurrencyConversionError(f, t);
    }
    const rate = parseFloat(row.conversion_rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new CurrencyConversionError(f, t);
    }
    rateCache.set(key, rate);
    return rate;
  }

  return {
    async getOrgCurrency(id: number): Promise<string> {
      if (orgCurrencyCache.has(id)) return orgCurrencyCache.get(id)!;
      const cur = await getOrgCurrencyById(id);
      orgCurrencyCache.set(id, cur);
      return cur;
    },
    async convert(amount: number, fromCurrency: string): Promise<number> {
      const rate = await getRate(fromCurrency, base);
      return amount * rate;
    },
  };
}

export async function getOrgCurrencyById(orgId: number): Promise<string> {
  const result = await getPool().query(
    `SELECT COALESCE(NULLIF(TRIM(currency), ''), 'AED') AS currency FROM dbo.um_org_dtls WHERE TRIM(CAST(id AS VARCHAR)) = $1`,
    [String(orgId)]
  );
  return norm(result.rows[0]?.currency) || "AED";
}

export async function getAllOrgCurrencies(): Promise<Map<number, string>> {
  const result = await getPool().query(
    `SELECT id, COALESCE(NULLIF(TRIM(currency), ''), 'AED') AS currency FROM dbo.um_org_dtls`
  );
  const map = new Map<number, string>();
  for (const row of result.rows) {
    map.set(Number(row.id), norm(row.currency) || "AED");
  }
  return map;
}

export async function convertOrgGroupedAmounts(
  rows: { org_id: number | null; amount: number }[],
  resolver: RateResolver
): Promise<number> {
  let total = 0;
  for (const row of rows) {
    const amt = parseFloat(String(row.amount || 0));
    if (!amt) continue;
    const orgKey = row.org_id != null ? Number(row.org_id) : null;
    if (orgKey == null || Number.isNaN(orgKey)) continue;
    const fromCur = await resolver.getOrgCurrency(orgKey);
    total += await resolver.convert(amt, fromCur);
  }
  return total;
}

export async function convertBudgetEntityAmounts(
  rows: { business_entity: string | number | null; amount: number; budget_curr?: string | null }[],
  resolver: RateResolver
): Promise<number> {
  let total = 0;
  for (const row of rows) {
    const amt = parseFloat(String(row.amount || 0));
    if (!amt) continue;
    const entityId = row.business_entity != null ? parseInt(String(row.business_entity), 10) : NaN;
    let fromCur = row.budget_curr ? norm(row.budget_curr) : "";
    if (!fromCur && !Number.isNaN(entityId)) {
      fromCur = await resolver.getOrgCurrency(entityId);
    }
    if (!fromCur) fromCur = "AED";
    total += await resolver.convert(amt, fromCur);
  }
  return total;
}

export async function convertBidAmounts(
  rows: { org_id?: number | null; currency?: string | null; amount: number }[],
  resolver: RateResolver,
  orgId?: number
): Promise<number> {
  let total = 0;
  for (const row of rows) {
    const amt = parseFloat(String(row.amount || 0));
    if (!amt) continue;
    const bidCur = norm(row.currency);
    const oid = orgId ?? (row.org_id != null ? Number(row.org_id) : null);
    const fromCur = bidCur || (oid != null ? await resolver.getOrgCurrency(oid) : "AED");
    total += await resolver.convert(amt, fromCur);
  }
  return total;
}
