import { Router } from "express";
import { upload } from "../_shared";
import { generatePdfPreview } from "../_shared";												
import * as service from "./administration.service";
import { propertiesService } from "../../services/propertiesService";
import { rewrapTenantContext } from "../../tenant-context";
const router = Router();

function handleError(res: any, error: any, fallbackMessage: string) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallbackMessage + ":", error);
  res.status(500).json({ error: error?.message || fallbackMessage });
}

function audit(req: any, auditKey: string, auditAction: string, auditMessage: string, module: string) {
  const user = (req as any).user;
  service.logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: user?.name || "System",
    userId: user?.id || "system",
    module,
  }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));
}

router.get("/api/organizations", async (req, res) => {
  try {
    const orgs = await service.getOrganizations();
    res.json(orgs);
  } catch (error) {
    handleError(res, error, "Failed to fetch organizations");
  }
});

router.get("/api/org-details", async (req, res) => {
  try {
    const org = await service.getOrgDetails();
    if (!org) {
      return res.status(404).json({ error: "Organization details not found" });
    }
    res.json(org);
  } catch (error) {
    handleError(res, error, "Failed to fetch organization details");
  }
});

router.patch("/api/org-details/:id", async (req, res) => {
  try {
    const result = await service.updateOrgDetails(req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ error: "Organization not found" });
    }
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Organization details updated", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update organization details");
  }
});

router.patch("/api/org-details/:id/:chatBot", async (req, res) => {
  try {
    const result = await service.updateChatBotDetails(req.params.id, req.params.chatBot);
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Chat bot details updated", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update Chat bot details");
  }
});

router.post("/api/org-details/:id/logo", upload.single("logo"), rewrapTenantContext, async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No logo file provided" });
    }
    const result = await service.uploadOrgLogo(file);
    if (!result) {
      return res.status(404).json({ error: "Organization not found" });
    }
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Organization logo uploaded", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to upload logo");
  }
});

router.delete("/api/org-details/logo", async (req, res) => {
  try {
    const result = await service.clearOrgLogo();
    if (!result) {
      return res.status(404).json({ error: "Organization not found" });
    }
    res.json({ success: true });
    audit(req, "org", "DELETE", "Organization logo removed", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to clear logo");
  }
});

router.get("/api/subsidiaries", async (req, res) => {
  try {
    const subsidiaries = await service.getSubsidiaries();
    res.json(subsidiaries);
  } catch (error) {
    handleError(res, error, "Failed to fetch subsidiaries");
  }
});

router.post("/api/subsidiaries", async (req, res) => {
  try {
    const result = await service.createSubsidiary(req.body);
    res.json({ success: true, id: result.id });
    audit(req, String(result.id), "CREATE", "Subsidiary created", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to create subsidiary");
  }
});

router.put("/api/subsidiaries/:id", async (req, res) => {
  try {
    const result = await service.updateSubsidiary(req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ error: "Subsidiary not found" });
    }
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Subsidiary updated", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update subsidiary");
  }
});

router.delete("/api/subsidiaries/:id", async (req, res) => {
  try {
    const result = await service.deleteSubsidiary(req.params.id);
    res.json(result);
    audit(req, req.params.id, "DELETE", "Subsidiary deleted", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to delete subsidiary");
  }
});

router.get("/api/locations", async (req, res) => {
  try {
    const locations = await service.getLocations();
    res.json(locations);
  } catch (error) {
    handleError(res, error, "Failed to fetch locations");
  }
});

router.post("/api/locations", async (req, res) => {
  try {
    const result = await service.createLocation(req.body);
    res.json({ success: true, id: result.id });
    audit(req, String(result.id), "CREATE", "Location created", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to create location");
  }
});

router.put("/api/locations/:id", async (req, res) => {
  try {
    await service.updateLocation(req.params.id, req.body);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Location updated", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update location");
  }
});

router.delete("/api/locations/:id", async (req, res) => {
  try {
    await service.deleteLocation(req.params.id);
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", "Location deleted", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to delete location");
  }
});

router.patch("/api/locations/:id/status", async (req, res) => {
  try {
    await service.updateLocationStatus(req.params.id, req.body.status);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Location status changed to " + req.body.status, "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update location status");
  }
});

router.get("/api/lookups", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const result = await service.getLookups(page, limit, search);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch lookups");
  }
});

router.post("/api/lookups", async (req, res) => {
  try {
    const result = await service.createLookup(req.body);
    res.json({ success: true, id: result.id });
    audit(req, String(result.id), "CREATE", "Lookup created", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to create lookup");
  }
});

router.put("/api/lookups/:id", async (req, res) => {
  try {
    await service.updateLookup(req.params.id, req.body);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Lookup updated", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update lookup");
  }
});

router.get("/api/lookups/by-property/:propertyKey", async (req, res) => {
  try {
    const result = await service.getLookupsByProperty(req.params.propertyKey);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch lookups");
  }
});

router.delete("/api/lookups/:id", async (req, res) => {
  try {
    await service.deleteLookup(req.params.id);
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", "Lookup deleted", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to delete lookup");
  }
});

router.patch("/api/lookups/:id/status", async (req, res) => {
  try {
    await service.updateLookupStatus(req.params.id, req.body.status);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Lookup status changed to " + req.body.status, "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update lookup status");
  }
});

router.delete("/api/exchange-rates/:id", async (req, res) => {
  try {
    const result = await service.deleteExchangeRate(req.params.id);
    res.json(result);
    audit(req, req.params.id, "DELETE", "Exchange rate deleted", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to delete exchange rate");
  }
});

router.get("/api/payment-terms", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const result = await service.getPaymentTerms(page, limit, search);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch payment terms");
  }
});

router.post("/api/payment-terms", async (req, res) => {
  try {
    const result = await service.createPaymentTerm(req.body);
    res.json({ success: true, id: result.id });
    audit(req, String(result.id), "CREATE", "Payment term created", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to create payment term");
  }
});

router.put("/api/payment-terms/:id", async (req, res) => {
  try {
    await service.updatePaymentTerm(req.params.id, req.body);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Payment term updated", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update payment term");
  }
});

router.delete("/api/payment-terms/:id", async (req, res) => {
  try {
    await service.deletePaymentTerm(req.params.id);
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", "Payment term deleted", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to delete payment term");
  }
});

router.put("/api/payment-terms/:id/status", async (req, res) => {
  try {
    await service.updatePaymentTermStatus(req.params.id, req.body.status);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Payment term status changed to " + req.body.status, "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update payment term status");
  }
});

router.get("/api/taxes", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const result = await service.getTaxes(page, limit, search);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch taxes");
  }
});

router.post("/api/taxes", async (req, res) => {
  try {
    const result = await service.createTax(req.body);
    res.json({ success: true, id: result.id });
    audit(req, String(result.id), "CREATE", "Tax created", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to create tax");
  }
});

router.put("/api/taxes/:id", async (req, res) => {
  try {
    await service.updateTax(req.params.id, req.body);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Tax updated", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update tax");
  }
});

router.delete("/api/taxes/:id", async (req, res) => {
  try {
    await service.deleteTax(req.params.id);
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", "Tax deleted", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to delete tax");
  }
});

router.put("/api/taxes/:id/status", async (req, res) => {
  try {
    await service.updateTaxStatus(req.params.id, req.body.status);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Tax status changed to " + req.body.status, "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update tax status");
  }
});

router.get("/api/prefixes", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const result = await service.getPrefixes(page, limit, search);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch prefixes");
  }
});

router.post("/api/prefixes", async (req, res) => {
  try {
    const result = await service.createPrefix(req.body);
    res.json({ success: true, id: result.id });
    audit(req, String(result.id), "CREATE", "Prefix created", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to create prefix");
  }
});

router.put("/api/prefixes/:id", async (req, res) => {
  try {
    await service.updatePrefix(req.params.id, req.body);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Prefix updated", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update prefix");
  }
});

router.delete("/api/prefixes/:id", async (req, res) => {
  try {
    await service.deletePrefix(req.params.id);
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", "Prefix deleted", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to delete prefix");
  }
});

router.put("/api/prefixes/:id/status", async (req, res) => {
  try {
    await service.updatePrefixStatus(req.params.id, req.body.status);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Prefix status changed to " + req.body.status, "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update prefix status");
  }
});

router.get("/api/exchange-rates", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const result = await service.getExchangeRatesLatestPairs(page, limit, search);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch exchange rates");
  }
});

router.get("/api/exchange-rates/history", async (req, res) => {
  try {
    const fromCurrency = (req.query.from_currency as string) || "";
    const toCurrency = (req.query.to_currency as string) || "";
    const rows = await service.getExchangeRateHistory(fromCurrency, toCurrency);
    res.json({ data: rows });
  } catch (error) {
    handleError(res, error, "Failed to fetch exchange rate history");
  }
});

router.post("/api/exchange-rates", async (req, res) => {
  try {
    const user = (req as any).user;
    const label = user?.name || user?.email_id || user?.email || "SYSTEM";
    const result = await service.createExchangeRate(req.body, label);
    res.json({ success: true, ...result });
    audit(req, String(result.id), "CREATE", `Exchange rate ${result.from_currency}->${result.to_currency}`, "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to create exchange rate");
  }
});

router.put("/api/exchange-rates/:id", async (req, res) => {
  try {
    const user = (req as any).user;
    const label = user?.name || user?.email_id || user?.email || "SYSTEM";
    const result = await service.updateExchangeRate(req.params.id, req.body, label);
    res.json({ success: true, ...result });
    audit(
      req,
      String(result.id),
      "CREATE",
      `Exchange rate revised ${result.from_currency}->${result.to_currency}`,
      "ADMINISTRATION"
    );
  } catch (error) {
    handleError(res, error, "Failed to update exchange rate");
  }
});

router.get("/api/terms-conditions/modules", async (req, res) => {
  try {
    const modules = await service.getTermsConditionModules();
    res.json(modules);
  } catch (error) {
    handleError(res, error, "Failed to fetch module names");
  }
});

router.get("/api/terms-conditions", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const result = await service.getTermsConditions(page, limit, search);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch terms conditions");
  }
});

router.get("/api/terms-conditions-by-name/:moduleName", async (req, res) => {
  try {
    const result = await service.getTermsConditionsByModuleName(req.params.moduleName);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch terms condition");
  }
});

router.post("/api/terms-conditions", async (req, res) => {
  try {
    const user = (req as any).user || (req as any).session?.user || "Unknown User";
    const result = await service.createTermsCondition(req.body, user);
    res.json(result);
    audit(req, String(result.id), "CREATE", "Terms & Conditions created", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to create terms condition");
  }
});

router.put("/api/terms-conditions/:id", async (req, res) => {
  try {
    await service.updateTermsCondition(req.params.id, req.body);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Terms & Conditions updated", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update terms condition");
  }
});

router.delete("/api/terms-conditions/:id", async (req, res) => {
  try {
    await service.deleteTermsCondition(req.params.id);
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", "Terms & Conditions deleted", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to delete terms condition");
  }
});

router.put("/api/terms-conditions/:id/status", async (req, res) => {
  try {
    await service.updateTermsConditionStatus(req.params.id, req.body.status);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Terms & Conditions status changed to " + req.body.status, "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update terms condition status");
  }
});

router.get("/api/terms-conditions/:id/document", async (req, res) => {
  try {
    const doc = await service.getTermsConditionDocument(req.params.id);
    res.json(doc);
  } catch (error) {
    handleError(res, error, "Failed to fetch document");
  }
});

router.post("/api/terms-conditions/:id/document", upload.single('document'), rewrapTenantContext, async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const result = await service.uploadTermsConditionDocument(req.params.id, file);
    res.json(result);
    audit(req, req.params.id, "CREATE", "Terms & Conditions document uploaded", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to upload document");
  }
});

router.delete("/api/terms-conditions/:id/document", async (req, res) => {
  try {
    await service.deleteTermsConditionDocument(req.params.id);
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", "Terms & Conditions document deleted", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to delete document");
  }
});

router.get("/api/setup-notifications", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const result = await service.getSetupNotifications(page, limit, search);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch notification templates");
  }
});

router.post("/api/setup-notifications", async (req, res) => {
  try {
    const result = await service.createSetupNotification(req.body);
    res.json(result);
    audit(req, String(result.id), "CREATE", "Notification template created", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to create notification template");
  }
});

router.put("/api/setup-notifications/:id", async (req, res) => {
  try {
    const result = await service.updateSetupNotification(req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ error: "Notification template not found" });
    }
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Notification template updated", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update notification template");
  }
});

router.delete("/api/setup-notifications/:id", async (req, res) => {
  try {
    const result = await service.deleteSetupNotification(req.params.id);
    if (!result) {
      return res.status(404).json({ error: "Notification template not found" });
    }
    res.json({ message: "Notification template deleted successfully" });
    audit(req, req.params.id, "DELETE", "Notification template deleted", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to delete notification template");
  }
});

router.get("/api/cost-centers", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const result = await service.getCostCenters(page, limit, search);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch cost centers");
  }
});

router.post("/api/cost-centers", async (req, res) => {
  try {
    const result = await service.createCostCenter(req.body);
    res.json(result);
    audit(req, String(result.id), "CREATE", "Cost center created", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to create cost center");
  }
});

router.put("/api/cost-centers/:id", async (req, res) => {
  try {
    await service.updateCostCenter(req.params.id, req.body);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Cost center updated", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update cost center");
  }
});

router.delete("/api/cost-centers/:id", async (req, res) => {
  try {
    await service.deleteCostCenter(req.params.id);
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", "Cost center deleted", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to delete cost center");
  }
});

router.put("/api/cost-centers/:id/status", async (req, res) => {
  try {
    await service.updateCostCenterStatus(req.params.id, req.body.status);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Cost center status changed to " + req.body.status, "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update cost center status");
  }
});

router.get("/api/cost-centers/:segmentId/items", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const result = await service.getCostCenterItems(req.params.segmentId, page, limit, search);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch cost center items");
  }
});

router.post("/api/cost-centers/:segmentId/items", async (req, res) => {
  try {
    const result = await service.createCostCenterItem(req.params.segmentId, req.body);
    res.json(result);
    audit(req, String(result.id), "CREATE", "Cost center item created", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to create cost center item");
  }
});

router.put("/api/cost-center-items/:id", async (req, res) => {
  try {
    await service.updateCostCenterItem(req.params.id, req.body);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Cost center item updated", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update cost center item");
  }
});

router.delete("/api/cost-center-items/:id", async (req, res) => {
  try {
    await service.deleteCostCenterItem(req.params.id);
    res.json({ success: true });
    audit(req, req.params.id, "DELETE", "Cost center item deleted", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to delete cost center item");
  }
});

router.put("/api/cost-center-items/:id/status", async (req, res) => {
  try {
    await service.updateCostCenterItemStatus(req.params.id, req.body.status);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Cost center item status changed to " + req.body.status, "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update cost center item status");
  }
});

router.get("/api/workflows/organizations", async (req, res) => {
  try {
    const orgs = await service.getWorkflowOrganizations();
    res.json(orgs);
  } catch (error) {
    handleError(res, error, "Failed to fetch organizations");
  }
});

router.get("/api/workflows/departments", async (req, res) => {
  try {
    const depts = await service.getWorkflowDepartments();
    res.json(depts);
  } catch (error) {
    handleError(res, error, "Failed to fetch departments");
  }
});

router.get("/api/workflows/users", async (req, res) => {
  try {
    const users = await service.getWorkflowUsers();
    res.json(users);
  } catch (error) {
    handleError(res, error, "Failed to fetch users");
  }
});

router.get("/api/workflows/roles", async (req, res) => {
  try {
    const roles = await service.getWorkflowRoles();
    res.json(roles);
  } catch (error) {
    handleError(res, error, "Failed to fetch roles");
  }
});

router.get("/api/workflows", async (req, res) => {
  try {
    const workflows = await service.getWorkflowDefinitions();
    res.json(workflows);
  } catch (error) {
    handleError(res, error, "Failed to fetch workflow definitions");
  }
});

router.get("/api/workflows/:id", async (req, res) => {
  try {
    const wf = await service.getWorkflowDetail(req.params.id);
    if (!wf) {
      return res.status(404).json({ error: "Workflow not found" });
    }
    res.json(wf);
  } catch (error) {
    handleError(res, error, "Failed to fetch workflow");
  }
});

router.post("/api/workflows/:id/steps", async (req, res) => {
  try {
    const result = await service.createWorkflowStep(req.params.id, req.body);
    res.status(201).json(result);
    audit(req, req.params.id, "CREATE", "Workflow step created", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to create workflow step");
  }
});

router.put("/api/workflows/:wfId/steps/:stepId", async (req, res) => {
  try {
    const result = await service.updateWorkflowStep(req.params.wfId, req.params.stepId, req.body);
    res.json(result);
    audit(req, req.params.stepId, "UPDATE", "Workflow step updated", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update workflow step");
  }
});

router.delete("/api/workflows/:wfId/assignments/:assignmentId", async (req, res) => {
  try {
    const result = await service.deleteWorkflowStepAssignment(req.params.assignmentId);
    res.json(result);
    audit(req, req.params.assignmentId, "DELETE", "Workflow step assignment deleted", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to delete workflow step assignment");
  }
});

router.delete("/api/workflows/:wfId/steps/:stepId", async (req, res) => {
  try {
    await service.deleteWorkflowStep(req.params.wfId, req.params.stepId);
    res.json({ success: true });
    audit(req, req.params.stepId, "DELETE", "Workflow step deleted", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to delete workflow step");
  }
});

router.put("/api/workflows/:id/reorder", async (req, res) => {
  try {
    await service.reorderWorkflowSteps(req.params.id, req.body.stepIds);
    res.json({ success: true });
    audit(req, req.params.id, "UPDATE", "Workflow steps reordered", "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to reorder workflow steps");
  }
});

router.post("/api/workflow-engine/start", async (req, res) => {
  try {
    const user = (req as any).user;
    const taskId = await service.startWorkflowProcess(user, req.body);
    res.json({ success: true, taskId });
    audit(req, String(taskId), "CREATE", "Workflow process started", "WORKFLOW");
  } catch (error: any) {
    handleError(res, error, "Failed to start workflow");
  }
});

router.post("/api/workflow-engine/complete", async (req, res) => {
  try {
    const user = (req as any).user;
    const newTaskId = await service.completeWorkflowTask(user, req.body);
    res.json({ success: true, newTaskId });
    audit(req, String(newTaskId), "UPDATE", "Workflow task completed", "WORKFLOW");
  } catch (error: any) {
    handleError(res, error, "Failed to complete task");
  }
});

router.get("/api/workflow-engine/my-tasks", async (req, res) => {
  try {
    const user = req.user as any;
    const tasks = await service.getMyTasks(user);
    res.json(tasks);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch tasks");
  }
});

router.get("/api/workflow-engine/group-tasks", async (req, res) => {
  try {
    const user = req.user as any;
    const tasks = await service.getGroupTasks(user);
    res.json(tasks);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch group tasks");
  }
});

router.post("/api/workflow-engine/claim", async (req, res) => {
  try {
    const user = req.user as any;
    await service.claimTask(user, req.body.taskId);
    res.json({ success: true });
    audit(req, req.body.taskId, "UPDATE", "Workflow task claimed", "WORKFLOW");
  } catch (error: any) {
    handleError(res, error, "Failed to claim task");
  }
});

router.get("/api/workflow-engine/history/:refNumber", async (req, res) => {
  try {
    const history = await service.getTaskHistory(req.params.refNumber);
    res.json(history);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch task history");
  }
});

router.get("/api/workflow-engine/task/:taskId", async (req, res) => {
  try {
    const task = await service.getTaskDetail(req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json(task);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch task details");
  }
});

router.get("/api/audit-logs", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const module = req.query.module as string;
    const action = req.query.action as string;
    const userId = req.query.userId as string;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;
    const result = await service.getAuditLogs({ page, limit, search, module, action, userId, dateFrom, dateTo });
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch audit logs");
  }
});

router.get("/api/audit-logs/modules", async (req, res) => {
  try {
    const modules = await service.getAuditLogModules();
    res.json(modules);
  } catch (error) {
    handleError(res, error, "Failed to fetch audit log modules");
  }
});

router.get("/api/audit-logs/actions", async (req, res) => {
  try {
    const actions = await service.getAuditLogActions();
    res.json(actions);
  } catch (error) {
    handleError(res, error, "Failed to fetch audit log actions");
  }
});

router.get("/api/audit-logs/stats", async (req, res) => {
  try {
    const stats = await service.getAuditLogStats();
    res.json(stats);
  } catch (error) {
    handleError(res, error, "Failed to fetch audit log stats");
  }
});

router.get("/api/audit-logs/key/:key", async (req, res) => {
  try {
    const logs = await service.getAuditLogsForKey(req.params.key);
    res.json(logs);
  } catch (error) {
    handleError(res, error, "Failed to fetch audit logs for key");
  }
});

router.get("/api/audit-logs/user/:userId", async (req, res) => {
  try {
    const logs = await service.getRecentActivity(req.params.userId);
    res.json(logs);
  } catch (error) {
    handleError(res, error, "Failed to fetch recent activity");
  }
});

router.post("/api/audit-logs", async (req, res) => {
  try {
    const { auditKey, auditAction, auditMessage, fullName, userId, module } = req.body;
    if (!auditKey || !auditAction || !module) {
      return res.status(400).json({ error: "auditKey, auditAction, and module are required" });
    }
    const log = await service.logAudit({ auditKey, auditAction, auditMessage, fullName, userId, module });
    res.status(201).json(log);
  } catch (error) {
    handleError(res, error, "Failed to create audit log");
  }
});

router.get("/api/ai-service-settings", async (req, res) => {
  try {
    const settings = await service.getAIServiceSettings();
    res.json(settings);
  } catch (error) {
    handleError(res, error, "Failed to fetch AI service settings");
  }
});

router.put("/api/ai-service-settings/bulk", async (req, res) => {
  try {
    const { isEnabled } = req.body;
    if (typeof isEnabled !== "boolean") {
      return res.status(400).json({ error: "isEnabled must be a boolean" });
    }
    const user = (req as any).user;
    const updatedBy = user?.name || user?.userName || "system";
    await service.bulkUpdateAIServiceSettings(isEnabled, updatedBy);
    res.json({ success: true });
    audit(req, "AI_SETTINGS", "UPDATE", `All AI features ${isEnabled ? "enabled" : "disabled"}`, "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update AI service settings");
  }
});

router.put("/api/ai-service-settings/:featureKey", async (req, res) => {
  try {
    const { featureKey } = req.params;
    const { isEnabled } = req.body;
    if (typeof isEnabled !== "boolean") {
      return res.status(400).json({ error: "isEnabled must be a boolean" });
    }
    const user = (req as any).user;
    const updatedBy = user?.name || user?.userName || "system";
    const result = await service.updateAIServiceSetting(featureKey, isEnabled, updatedBy);
    if (!result) {
      return res.status(404).json({ error: "Feature not found" });
    }
    res.json(result);
    audit(req, featureKey, "UPDATE", `AI feature ${featureKey} ${isEnabled ? "enabled" : "disabled"}`, "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update AI service setting");
  }
});

router.get("/api/ai-model-config", async (req, res) => {
  try {
    const configs = await service.getAIModelConfigs();
    res.json(configs);
  } catch (error) {
    handleError(res, error, "Failed to fetch AI model configurations");
  }
});

router.get("/api/ai-model-config/active", async (req, res) => {
  try {
    const config = await service.getActiveAIModelConfig();
    res.json(config);
  } catch (error) {
    handleError(res, error, "Failed to fetch active AI model config");
  }
});

router.put("/api/ai-model-config/:providerKey", async (req, res) => {
  try {
    const { providerKey } = req.params;
    const { apiBaseUrl, apiKey, modelName } = req.body;
    const user = (req as any).user;
    const updatedBy = user?.name || user?.userName || "system";
    const result = await service.updateAIModelConfig(providerKey, { apiBaseUrl, apiKey, modelName }, updatedBy);
    if (!result) {
      return res.status(404).json({ error: "Provider not found" });
    }
    res.json(result);
    audit(req, "AI_MODEL_CONFIG", "UPDATE", `AI model config updated for ${providerKey}`, "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to update AI model configuration");
  }
});

router.put("/api/ai-model-config/:providerKey/activate", async (req, res) => {
  try {
    const { providerKey } = req.params;
    const user = (req as any).user;
    const updatedBy = user?.name || user?.userName || "system";
    const result = await service.activateAIModelConfig(providerKey, updatedBy);
    if (!result) {
      return res.status(404).json({ error: "Provider not found" });
    }
    res.json(result);
    audit(req, "AI_MODEL_CONFIG", "UPDATE", `AI model provider activated: ${providerKey}`, "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to activate AI model provider");
  }
});

router.put("/api/ai-model-config/:providerKey/disconnect", async (req, res) => {
  try {
    const { providerKey } = req.params;
    const user = (req as any).user;
    const updatedBy = user?.name || user?.userName || "system";
    const result = await service.disconnectAIModelConfig(providerKey, updatedBy);
    if (!result) {
      return res.status(404).json({ error: "Provider not found or not active" });
    }
    res.json(result);
    audit(req, "AI_MODEL_CONFIG", "UPDATE", `AI model provider disconnected: ${providerKey}`, "ADMINISTRATION");
  } catch (error) {
    handleError(res, error, "Failed to disconnect AI model provider");
  }
});

router.post("/api/ai-model-config/:providerKey/test", async (req, res) => {
  try {
    const { providerKey } = req.params;
    const result = await service.testAIModelConnection(providerKey);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to test AI model connection");
  }
});

router.get("/api/ai-model-config/:providerKey/usage", async (req, res) => {
  try {
    const { providerKey } = req.params;
    const result = await service.getAIModelUsage(providerKey);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch AI model usage");
  }
});

router.get("/api/ai-model-config/:providerKey/usage/summary", async (req, res) => {
  try {
    const { providerKey } = req.params;
    const result = await service.getAIModelUsageSummary(providerKey);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch AI usage summary");
  }
});

router.delete("/api/ai-model-config/:providerKey/usage", async (req, res) => {
  try {
    const { providerKey } = req.params;
    await service.resetAIModelUsage(providerKey);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, "Failed to reset AI usage");
  }
});

// ── System Settings (Scheduler + Email Notifications) ────────────────────────

router.get("/api/system-settings", async (req, res) => {
  try {
    const schedulerEnabled = await propertiesService.get('SCHEDULER_ENABLED', 'true');
    const emailNotificationsEnabled = await propertiesService.get('EMAIL_NOTIFICATIONS_ENABLED', 'true');
    const supplierEmailNotificationsEnabled = await propertiesService.get('SUPPLIER_EMAIL_NOTIFICATIONS_ENABLED', 'true');
    res.json({
      schedulerEnabled: schedulerEnabled !== 'false',
      emailNotificationsEnabled: emailNotificationsEnabled !== 'false',
      supplierEmailNotificationsEnabled: supplierEmailNotificationsEnabled !== 'false',
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch system settings");
  }
});

router.put("/api/system-settings", async (req, res) => {
  try {
    const { schedulerEnabled, emailNotificationsEnabled, supplierEmailNotificationsEnabled } = req.body;
    if (typeof schedulerEnabled === 'boolean') {
      await propertiesService.set('SCHEDULER_ENABLED', schedulerEnabled ? 'true' : 'false');
    }
    if (typeof emailNotificationsEnabled === 'boolean') {
      await propertiesService.set('EMAIL_NOTIFICATIONS_ENABLED', emailNotificationsEnabled ? 'true' : 'false');
    }
    if (typeof supplierEmailNotificationsEnabled === 'boolean') {
      await propertiesService.set('SUPPLIER_EMAIL_NOTIFICATIONS_ENABLED', supplierEmailNotificationsEnabled ? 'true' : 'false');
    }
    audit(req, 'SYSTEM_SETTINGS', 'UPDATE', 'System settings updated', 'Administration');
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, "Failed to update system settings");
  }
});

router.post("/api/wf/savequestions/:wfid", async(req,res) =>
{
    const wfId = req.params.wfid;
    const body = req.body;
    const sessionUser = (req as any).user;
    const formQuesData: any[] = Array.isArray(body.payload) ? body.payload : body;
    
    if (!Array.isArray(formQuesData)) 
    {
      return res.status(400).json({
      success: false,
      message: "Invalid request body: expected an array of questions or { payload: [] }",
      });
    }

    const wfData = service.getWorkflowDetail(wfId);
    if(!wfData)
    {
      return res.status(204).json({
      success: false,
      message: "Invalid Workflow Id please check",
      });
    }

    const msg = await service.saveWfQuestions(formQuesData,sessionUser?.name || sessionUser?.userName || "system");
     return res.status(200).json({msg});  
});

router.get("/api/wf/questionformodule/:modulename", async(req,res) =>
{
    const moduleName = req.params.modulename;

    const data = await service.getWfQuestionByModuleName(moduleName);
    return res.status(200).json(data);
});

router.get("/api/wf/loadresponse/:refnumber", async (req,res)=>
{
    const refNum = req.params.refnumber;
    const data = await service.getResponseByRefNum(refNum,false);
    const history = await service.getResponseByRefNum(refNum,true);
    return res.status(200).json({ data, history });
});
router.post("/api/wf/saveresponse/:refnumber", async(req,res) =>
{
    const body = req.body;
    const sessionUser = (req as any).user;
    const formQuesData: any[] = Array.isArray(body.payload) ? body.payload : body;
    
    if (!Array.isArray(formQuesData)) 
    {
      return res.status(400).json({
      success: false,
      message: "Invalid request body: expected an array of questions or { payload: [] }",
      });
    }
    
    const msg = service.saveWfQuestionsResponse(formQuesData,sessionUser?.name || sessionUser?.userName || "system");
    return res.status(200).json(msg);
}); 

router.delete("/api/wf/deletequestionbyid/:quesid", async (req,res) =>
{
   const data = await service.deleteQuestionbyId(req.params.quesid);
   return res.status(200).json(data);
});

router.patch("/api/wf/enableordisablechecklist/:wfid/:status",async(req,res) =>
{
  const listStatus= req.params.status;
  const id=req.params.wfid;
  const sessionUser = (req as any).user;
  const wfData = service.getWorkflowDetail(id);
    if(!wfData)
    {
      return res.status(204).json({
      success: false,
      message: "Invalid Workflow Id please check",
      });
    }
  const data = await service.enableordisablechecklist(id,listStatus,sessionUser?.name || sessionUser?.userName || "system")
  return res.status(200).json(data);
});

router.post("/api/email/taskapproval", async(req,res) => {

  try
  {
    const body = req.body;
    const result = await service.approveTaskFromEmail(body);
    if(result && !(result.includes("Failed") || result.includes("Error")))
    {
      return res.status(200).json(result);
    }
    else
    {
      return res.status(500).json(result);
    }
  }
  catch(error)
  {
    console.error(error);
    return res.status(500).json(error);
  }
});

router.post("/api/workflow/delegate-request", async (req, res) => {
  try {
    const sessionUser = (req as any).user;
      await service.delegateRequest(req.body, sessionUser);
      res.json({ success: true });
  } catch (err) {
      handleError(res, err, "Failed to delegate request");
  }
});

export const administrationController = router;
