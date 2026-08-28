import { Router, Request, Response } from "express";
import { ReportsService } from "./reports.service";

const reportsService = new ReportsService();

export const reportsController = Router();

const VALID_REPORT_IDS = [
  "supplier-by-category", "requisitions-by-item", "po-by-department",
  "invoice-summary", "user-report", "budget-summary",
  "p2p-overview", "grn-report", "supplier-performance",
  "aging-report", "bid-summary",
   "contract-register", "contract-expiry", "contract-spend",													   
];

function isValidReportId(id: string): boolean {
  return VALID_REPORT_IDS.includes(id);
}

function sanitizeFilters(body: any): Record<string, any> {
  const allowed: Record<string, "string" | "string[]" | "number"> = {
    fromDate: "string", toDate: "string",
    status: "string[]", department: "string[]", supplier: "string[]",
    category: "string[]", budget: "string[]", location: "string[]",
    requestor: "string[]", buyer: "string[]", invoiceType: "string[]",
    paymentTerms: "string[]", userType: "string[]", roles: "string[]",
    businessEntity: "string[]", budgetOwner: "string[]",
    costCenter: "string[]", warehouse: "string[]", bidType: "string[]",
	contractType: "string[]", contractOwner: "string[]",													
    page: "number", pageSize: "number",
  };

  const result: Record<string, any> = {};
  for (const [key, type] of Object.entries(allowed)) {
    if (body[key] === undefined || body[key] === null) continue;
    if (type === "string" && typeof body[key] === "string") {
      result[key] = body[key];
    } else if (type === "string[]" && Array.isArray(body[key])) {
      result[key] = body[key].filter((v: any) => typeof v === "string");
    } else if (type === "number" && (typeof body[key] === "number" || !isNaN(Number(body[key])))) {
      result[key] = Number(body[key]);
    }
  }
  return result;
}

reportsController.get("/api/reports/definitions", async (_req: Request, res: Response) => {
  try {
    const definitions = reportsService.getReportDefinitions();
    res.json(definitions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

reportsController.get("/api/reports/definitions/:reportId", async (req: Request, res: Response) => {
  try {
    if (!isValidReportId(req.params.reportId)) {
      return res.status(400).json({ error: "Invalid report ID" });
    }
    const definition = reportsService.getReportDefinition(req.params.reportId);
    if (!definition) {
      return res.status(404).json({ error: "Report not found" });
    }
    res.json(definition);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

reportsController.get("/api/reports/filters/:reportId", async (req: Request, res: Response) => {
  try {
    if (!isValidReportId(req.params.reportId)) {
      return res.status(400).json({ error: "Invalid report ID" });
    }
    const options = await reportsService.getFilterOptions(req.params.reportId);
    res.json(options);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

reportsController.post("/api/reports/summary/:reportId", async (req: Request, res: Response) => {
  try {
    if (!isValidReportId(req.params.reportId)) {
      return res.status(400).json({ error: "Invalid report ID" });
    }
    const filters = sanitizeFilters(req.body || {});
    const result = await reportsService.getReportSummary(req.params.reportId, filters);
    res.json(result);
  } catch (error: any) {
    console.error("Report summary error:", error);
    res.status(500).json({ error: error.message });
  }
});

reportsController.post("/api/reports/generate/:reportId", async (req: Request, res: Response) => {
  try {
    if (!isValidReportId(req.params.reportId)) {
      return res.status(400).json({ error: "Invalid report ID" });
    }
    const filters = sanitizeFilters(req.body || {});
    const result = await reportsService.generateReport(req.params.reportId, filters);
    res.json(result);
  } catch (error: any) {
    console.error("Report generation error:", error);
    res.status(500).json({ error: error.message });
  }
});

reportsController.get("/api/reports/templates", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
    const reportId = req.query.reportId as string | undefined;
    const templates = await reportsService.getTemplates(user.id, reportId);
    res.json(templates);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

reportsController.post("/api/reports/templates", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
    const { reportId, name, filters } = req.body;
    if (!reportId || !name) return res.status(400).json({ error: "reportId and name are required" });
    const template = await reportsService.createTemplate(user.id, reportId, name, filters || {});
    res.json(template);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

reportsController.put("/api/reports/templates/:id", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid template ID" });
    const { name, filters } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const template = await reportsService.updateTemplate(id, user.id, name, filters || {});
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json(template);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

reportsController.delete("/api/reports/templates/:id", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid template ID" });
    const deleted = await reportsService.deleteTemplate(id, user.id);
    if (!deleted) return res.status(404).json({ error: "Template not found" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
