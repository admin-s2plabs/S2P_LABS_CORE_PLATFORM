import { Router } from "express";
import * as service from "./spend-analysis.service";
import { CurrencyConversionError } from "./spend-analysis.currency";

const router = Router();

function handleError(res: any, error: any, fallbackMessage: string) {
  console.error(fallbackMessage + ":", error);
  const status = error?.status === 400 || error instanceof CurrencyConversionError ? 400 : 500;
  res.status(status).json({ error: error?.message || fallbackMessage });
}

function parseBaseCurrency(req: any): string | undefined {
  const c = (req.query.baseCurrency as string)?.trim();
  return c || undefined;
}

function parseYear(req: any): number | undefined {
  const y = parseInt(req.query.year);
  return isNaN(y) ? undefined : y;
}

function parseOrgId(req: any): number | undefined {
  const o = parseInt(req.query.orgId);
  return isNaN(o) ? undefined : o;
}

router.get("/api/spend-analysis/summary", async (req, res) => {
  try {
    const data = await service.getSummary(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch spend summary");
  }
});

router.get("/api/spend-analysis/budget-summary", async (req, res) => {
  try {
    const data = await service.getBudgetSummary(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch budget summary");
  }
});

router.get("/api/spend-analysis/consumed-amount", async (req, res) => {
  try {
    const type = (req.query.type as string) || "total";
    const value = await service.getConsumedAmount(type, parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json({ type, value });
  } catch (error) {
    handleError(res, error, "Failed to fetch consumed amount");
  }
});

router.get("/api/spend-analysis/budget-vs-spend", async (req, res) => {
  try {
    const data = await service.getBudgetVsSpend(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch budget vs spend");
  }
});

router.get("/api/spend-analysis/spend-by-category", async (req, res) => {
  try {
    const data = await service.getSpendByCategory(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch spend by category");
  }
});

router.get("/api/spend-analysis/spend-by-supplier", async (req, res) => {
  try {
    const data = await service.getSpendBySupplier(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch spend by supplier");
  }
});

router.get("/api/spend-analysis/spend-by-department", async (req, res) => {
  try {
    const data = await service.getSpendByDepartment(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch spend by department");
  }
});

router.get("/api/spend-analysis/spend-trend", async (req, res) => {
  try {
    const data = await service.getSpendTrend(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch spend trend");
  }
});

router.get("/api/spend-analysis/po-status-distribution", async (req, res) => {
  try {
    const data = await service.getPoStatusDistribution(parseYear(req), parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch PO status distribution");
  }
});

router.get("/api/spend-analysis/available-years", async (req, res) => {
  try {
    const data = await service.getAvailableYears();
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch available years");
  }
});

router.get("/api/spend-analysis/business-entities", async (req, res) => {
  try {
    const data = await service.getBusinessEntities();
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch business entities");
  }
});

router.get("/api/spend-analysis/purchase-cycle-time", async (req, res) => {
  try {
    const data = await service.getPurchaseCycleTime(parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch purchase cycle time");
  }
});

router.get("/api/spend-analysis/late-payment-percent", async (req, res) => {
  try {
    const data = await service.getLatePaymentPercent(parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch late payment percent");
  }
});

router.get("/api/spend-analysis/invoice-status-counts", async (req, res) => {
  try {
    const data = await service.getInvoiceStatusCounts(parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch invoice status counts");
  }
});

router.get("/api/spend-analysis/open-po-aging", async (req, res) => {
  try {
    const data = await service.getOpenPOAging(parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch open PO aging");
  }
});

router.get("/api/spend-analysis/uninvoiced-grns", async (req, res) => {
  try {
    const data = await service.getUninvoicedGRNs(parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch uninvoiced GRNs");
  }
});

router.get("/api/spend-analysis/top-approvers", async (req, res) => {
  try {
    const data = await service.getTopApprovers(parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch top approvers");
  }
});

router.get("/api/spend-analysis/supplier-activity", async (req, res) => {
  try {
    const data = await service.getSupplierActivityStats(parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch supplier activity");
  }
});

router.get("/api/spend-analysis/po-year-trend", async (req, res) => {
  try {
    const data = await service.getPOYearTrend(parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch PO year trend");
  }
});

router.get("/api/spend-analysis/avg-approval-days", async (req, res) => {
  try {
    const data = await service.getAvgApprovalDays(parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch avg approval days");
  }
});

router.get("/api/spend-analysis/po-vs-nonpo-spend", async (req, res) => {
  try {
    const data = await service.getPoVsNonPoSpend(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch PO vs Non-PO spend");
  }
});

router.get("/api/spend-analysis/spend-by-currency", async (req, res) => {
  try {
    const data = await service.getSpendByCurrency(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch spend by currency");
  }
});

router.get("/api/spend-analysis/savings-analysis", async (req, res) => {
  try {
    const data = await service.getSavingsAnalysis(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch savings analysis");
  }
});

router.get("/api/spend-analysis/contract-vs-spot", async (req, res) => {
  try {
    const data = await service.getContractVsSpotSpend(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch contract vs spot spend");
  }
});

router.get("/api/spend-analysis/maverick-spend", async (req, res) => {
  try {
    const data = await service.getMaverickSpend(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch maverick spend");
  }
});

router.get("/api/spend-analysis/bid-savings-summary", async (req, res) => {
  try {
    const data = await service.getBidSavingsSummary(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch bid savings summary");
  }
});

router.get("/api/spend-analysis/bid-savings-by-type", async (req, res) => {
  try {
    const data = await service.getBidSavingsByType(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch bid savings by type");
  }
});

router.get("/api/spend-analysis/competitive-savings", async (req, res) => {
  try {
    const data = await service.getCompetitiveSavings(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch competitive savings");
  }
});

router.get("/api/spend-analysis/bid-status-distribution", async (req, res) => {
  try {
    const data = await service.getBidStatusDistribution(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch bid status distribution");
  }
});

router.get("/api/spend-analysis/top-savings-bids", async (req, res) => {
  try {
    const data = await service.getTopSavingsBids(parseYear(req), parseOrgId(req), parseBaseCurrency(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch top savings bids");
  }
});

router.get("/api/spend-analysis/yoy-spend", async (req, res) => {
  try {
    const data = await service.getYoYSpendComparison(parseYear(req), parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch YoY spend comparison");
  }
});

router.get("/api/spend-analysis/vendor-concentration", async (req, res) => {
  try {
    const data = await service.getVendorConcentrationRisk(parseYear(req), parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch vendor concentration risk");
  }
});

router.get("/api/spend-analysis/payment-terms-analysis", async (req, res) => {
  try {
    const data = await service.getPaymentTermsAnalysis(parseYear(req), parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch payment terms analysis");
  }
});

router.get("/api/spend-analysis/upcoming-payments", async (req, res) => {
  try {
    const data = await service.getUpcomingPaymentObligations(parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch upcoming payment obligations");
  }
});

router.get("/api/spend-analysis/contract-portfolio", async (req, res) => {
  try {
    const data = await service.getContractPortfolio(parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch contract portfolio stats");
  }
});

router.get("/api/spend-analysis/contract-pipeline", async (req, res) => {
  try {
    const data = await service.getContractPipeline(parseOrgId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to fetch contract pipeline");
  }
});

router.get("/api/spend-analysis/ai-insights", async (req, res) => {
  try {
    const currency = (req.query.currency as string) || "USD";
    const data = await service.getAISpendInsights(parseYear(req), parseOrgId(req), currency);
    res.json(data);
  } catch (error) {
    handleError(res, error, "Failed to generate AI insights");
  }
});

export const spendAnalysisController = router;
