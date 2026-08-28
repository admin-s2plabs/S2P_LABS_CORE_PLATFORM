/**
 * Agent-only PO context adapter for the shared add-line resolution pipeline.
 * Item Master, AI-assisted price/UOM, and quantity prediction remain wired by
 * createAddPrLineDeps; only the document context lookup changes from PR to PO.
 */

import * as procService from "../../modules/procurement/procurement.service";
import { createAddPrLineDeps } from "../add-pr-line/adapters";
import type { AddPrLineDeps } from "../add-pr-line/resolver";

const positive = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export function createAddPoLineDeps(): AddPrLineDeps {
  const shared = createAddPrLineDeps();
  return {
    ...shared,
    async loadPrContext(poNumber) {
      const detail = (await procService.getPurchaseOrderDetail(poNumber)) as any;
      if (!detail?.po_number) return null;
      return {
        // The shared resolver calls this field prNumber, but it is just the
        // target document number and stays a PO number throughout this adapter.
        prNumber: String(detail.po_number),
        currency: String(detail.po_currency ?? "").trim(),
        department: detail.department_name ? String(detail.department_name) : null,
        budgetLineId: positive(detail.budget_segment),
      };
    },
  };
}
