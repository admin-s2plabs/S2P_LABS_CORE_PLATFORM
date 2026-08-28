/**
 * Adapters for Direct PO recommendation (vendor + payment terms) on top of
 * the shared PR recommendation ports.
 */

import * as adminService from "../../modules/administration/administration.service";
import { getContextPool } from "../../tenant-context";
import { pool as masterPool } from "../../modules/_shared";
import { recommendSuppliersForPR } from "../pr-po-supplier-recommend-service";
import {
  resolveDefaultPaymentTerms,
  paymentTermsCanonicalId,
  type PaymentTermRecord,
} from "../direct-po-lookups";
import { createDefaultDeps as createPrDeps } from "../pr-recommendation/adapters";
import { generatePoLineItems } from "./catalog-line-items";
import type { PoRecommendationDeps, PaymentTermsCandidate, VendorSuggestion } from "./po-recommendation.service";

async function loadPaymentTermRecords(): Promise<PaymentTermRecord[]> {
  try {
    const result = await adminService.getPaymentTerms(1, 200, "");
    return ((result as any)?.data || result || []) as PaymentTermRecord[];
  } catch (error) {
    console.error("[po-recommendation] load payment terms failed:", error);
    return [];
  }
}

async function loadDefaultPaymentTermCode(): Promise<string | null> {
  try {
    const orgDetails = await adminService.getOrgDetails();
    const code = (orgDetails as any)?.default_paymentterms;
    return code != null ? String(code).trim() || null : null;
  } catch (error) {
    console.error("[po-recommendation] default payment terms lookup failed:", error);
    return null;
  }
}

export function createDefaultPoDeps(): PoRecommendationDeps {
  const pr = createPrDeps();
  return {
    pr: {
      ...pr,
      aiLineItems: {
        generateLineItems: (request) => generatePoLineItems(request),
        predictQuantity: pr.aiLineItems.predictQuantity,
      },
    },
    vendors: {
      async suggest({ request, lineItems, deliveryLocation }): Promise<VendorSuggestion[]> {
        try {
          const lines =
            lineItems.length > 0
              ? lineItems.map((line, i) => ({
                  description: line.description || request,
                  lineNum: i + 1,
                  qty: line.qty ?? null,
                  itemId: line.itemId ?? null,
                  productCategory: line.categoryCode ?? null,
                  productCategoryName: line.categoryName ?? null,
                }))
              : [{ description: request, lineNum: 1, qty: null as number | null }];
          const rec = await recommendSuppliersForPR({
            lineItems: lines,
            deliveryLocation: deliveryLocation || null,
          });
          return rec.vendors.map((v) => ({
            vendorId: Number(v.vendorId),
            vendorName: v.vendorName,
            matchScore: v.matchScore,
            reason: v.reasoningSummary || v.reason,
          }));
        } catch (error) {
          console.error("[po-recommendation] vendor suggest failed:", error);
          return [];
        }
      },
      async listSelectable(limit = 200): Promise<VendorSuggestion[]> {
        try {
          // Match Create PO / invoice vendor pickers: Active (+ Changes In Draft).
          // /api/suppliers (Approved|NULL) returns empty in tenants that use Active.
          // Same pool resolution as vendors.repository (tenant ALS, else master fallback).
          const dbPool = getContextPool() ?? masterPool;
          const result = await dbPool.query(
            `SELECT id, company_name, status
             FROM dbo.supp_basic_org_dtls
             WHERE status IN ('Active', 'Changes In Draft') OR status IS NULL
             ORDER BY company_name
             LIMIT $1`,
            [limit],
          );
          const rows = result.rows as Array<{
            id: number | string;
            company_name?: string | null;
            status?: string | null;
          }>;
          return rows
            .map((row) => ({
              vendorId: Number(row.id),
              vendorName: String(row.company_name || "").trim() || String(row.id),
            }))
            .filter((row) => Number.isFinite(row.vendorId) && row.vendorId > 0);
        } catch (error) {
          console.error("[po-recommendation] list selectable vendors failed:", error);
          return [];
        }
      },
    },
    paymentTerms: {
      async listActive(): Promise<PaymentTermsCandidate[]> {
        const terms = await loadPaymentTermRecords();
        return terms
          .filter((t) => !t.status || String(t.status).toUpperCase() === "Y")
          .map((t) => ({
            paymentTermsId: paymentTermsCanonicalId(t),
            paymentTermsName: String(t.terms_name || t.payment_term_id || t.id).trim(),
          }))
          .filter((t) => t.paymentTermsName);
      },
      async getDefault(): Promise<PaymentTermsCandidate | null> {
        const terms = await loadPaymentTermRecords();
        const code = await loadDefaultPaymentTermCode();
        const resolved = resolveDefaultPaymentTerms(terms, code);
        if (!resolved) return null;
        return {
          paymentTermsId: resolved.paymentTermsId,
          paymentTermsName: resolved.paymentTermsName,
        };
      },
    },
  };
}
