import { Router } from "express";
import * as service from "./vendors.service";
import { logAudit } from "../administration/administration.service";
import { getUserRoleNames, getUserDetails } from "../common/common.repository";
import { resolveRequestUser } from "../_shared/auth";

const router = Router();

function audit(req: any, auditKey: string, auditAction: string, auditMessage: string, module: string) {
  const user = resolveRequestUser(req);
  logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: user?.name || "System",
    userId: user?.id || "system",
    module,
  }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));
}

router.get("/api/vendors/invitations", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const search = req.query.search as string;

    const [result, statusCounts] = await Promise.all([
      service.getInvitationsPaginated({ page, limit, status, search }),
      service.getInvitationStatusCounts(),
    ]);
    res.json({ ...result, statusCounts });
  } catch (error) {
    console.error("Failed to fetch invitations:", error);
    res.status(500).json({ error: "Failed to fetch invitations" });
  }
});

router.post("/api/vendors/invitations", async (req, res) => {
  try {
    const sessionUser = resolveRequestUser(req);
    // Backfill domain from middleware if session predates the login fix
    if (sessionUser && !sessionUser.domain && (req as any).tenantDomain) {
      sessionUser.domain = (req as any).tenantDomain;
    }
    const result = await service.inviteSupplier(req.body, sessionUser);
    res.json(result);
    if (result.success) {
      audit(req, String(result.id), "CREATE", `Supplier invitation sent to ${req.body.email}`, "VENDORS");
    }
  } catch (error: any) {
    console.error("Failed to invite supplier:", error);
    const status = error?.status || 500;
    const message = error?.message || "Failed to send invitation";
    res.status(status).json({ error: message });
  }
});

router.post("/api/dbo/suppliers/quick-create", async (req, res) => {
  try {
    const sessionUser = resolveRequestUser(req);
    // Backfill domain from middleware if session predates the login fix
    if (sessionUser && !sessionUser.domain && (req as any).tenantDomain) {
      sessionUser.domain = (req as any).tenantDomain;
    }
    const result = await service.quickCreateSupplier(req.body, sessionUser);
    res.status(201).json(result);
    audit(req, String(result.id), "CREATE", `Quick supplier created: ${req.body.companyName}`, "VENDORS");
  } catch (error: any) {
    console.error("Failed to create supplier:", error);
    const status = error?.status || 500;
    const message = error?.message || "Failed to create supplier";
    res.status(status).json({ error: message });
  }
});

router.post("/api/vendors/invitations/:id/resend", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid invitation ID" });
    const sessionUser = resolveRequestUser(req);
    const result = await service.resendInvitation(id, sessionUser);
    res.json(result);
    audit(req, req.params.id, "UPDATE", `Supplier invitation resent`, "VENDORS");
  } catch (error: any) {
    console.error("Failed to resend invitation:", error);
    const status = error?.status || 500;
    const message = error?.message || "Failed to resend invitation";
    res.status(status).json({ error: message });
  }
});

router.post("/api/dbo/suppliers/:id/resend-invitation", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid supplier ID" });
    const sessionUser = resolveRequestUser(req);
    if (sessionUser && !sessionUser.domain && (req as any).tenantDomain) {
      sessionUser.domain = (req as any).tenantDomain;
    }
    const result = await service.resendSupplierInvitation(id, sessionUser);
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Supplier invitation resent", "VENDORS");
  } catch (error: any) {
    console.error("Failed to resend supplier invitation:", error);
    const status = error?.status || 500;
    const message = error?.message || "Failed to resend invitation";
    res.status(status).json({ error: message });
  }
});

router.post("/api/dbo/suppliers/:id/reset-password", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid supplier ID" });
    const tenantDomain = (req as any).tenantDomain || undefined;
    const result = await service.resetSupplierPassword(id, tenantDomain);
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Supplier password reset by admin", "VENDORS");
  } catch (error: any) {
    console.error("Failed to reset supplier password:", error);
    const status = error?.status || 500;
    const message = error?.message || "Failed to reset password";
    res.status(status).json({ error: message });
  }
});

router.patch("/api/vendors/invitations/:id/email", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid invitation ID" });
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    const sessionUser = resolveRequestUser(req);
    const result = await service.updateInvitationEmail(id, email, sessionUser);
    res.json(result);
    audit(req, req.params.id, "UPDATE", `Invitation email updated to ${email}`, "VENDORS");
  } catch (error: any) {
    console.error("Failed to update invitation email:", error);
    const status = error?.status || 500;
    const message = error?.message || "Failed to update email";
    res.status(status).json({ error: message });
  }
});

router.post("/api/vendors/invitations/:id/cancel", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid invitation ID" });
    const sessionUser = resolveRequestUser(req);
    const modifiedBy = sessionUser?.userName || sessionUser?.email || "ADMIN";
    await service.cancelInvitation(id, modifiedBy);
    res.json({ success: true, message: "Invitation cancelled successfully" });
    audit(req, req.params.id, "UPDATE", `Supplier invitation cancelled`, "VENDORS");
  } catch (error: any) {
    console.error("Failed to cancel invitation:", error);
    const status = error?.status || 500;
    const message = error?.message || "Failed to cancel invitation";
    res.status(status).json({ error: message });
  }
});

router.get("/api/dbo/suppliers", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limitRaw = req.query.limit as string | undefined;
    const limitParsed = limitRaw !== undefined && limitRaw !== "" ? parseInt(limitRaw, 10) : NaN;
    const limit = Number.isFinite(limitParsed) ? limitParsed : 10;
    const status = req.query.status as string;
    const search = req.query.search as string;
    const sortBy = req.query.sortBy as string;
    const metrics = req.query.metrics as string;

    const result = await service.getDboSuppliersPaginated({
      page,
      limit,
      status,
      search,
      sortBy,
      metrics,
    });
    res.json(result);
  } catch (error) {
    console.error("Failed to fetch DBO suppliers:", error);
    res.status(500).json({ error: "Failed to fetch suppliers" });
  }
});

router.get("/api/dbo/suppliers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }
    const supplier = await service.getDboSupplier(id);
    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }
    res.json(supplier);
  } catch (error) {
    console.error("Failed to fetch DBO supplier:", error);
    res.status(500).json({ error: "Failed to fetch supplier" });
  }
});

router.get("/api/dbo/suppliers/:id/contacts", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }
    const contacts = await service.getDboSupplierContacts(id);
    res.json(contacts);
  } catch (error) {
    console.error("Failed to fetch DBO supplier contacts:", error);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

router.get("/api/dbo/suppliers/:id/banks", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }
    const banks = await service.getDboSupplierBanks(id);
    res.json(banks);
  } catch (error) {
    console.error("Failed to fetch DBO supplier banks:", error);
    res.status(500).json({ error: "Failed to fetch bank details" });
  }
});

router.get("/api/dbo/suppliers/:id/documents", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }
    const rows = await service.getDboSupplierDocuments(id);
    res.json(rows);
  } catch (error) {
    console.error("Failed to fetch DBO supplier documents:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

router.get("/api/dbo/suppliers/:id/services", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }
    const services = await service.getDboSupplierServices(id);
    res.json(services);
  } catch (error) {
    console.error("Failed to fetch DBO supplier services:", error);
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

router.patch("/api/dbo/suppliers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }
    const updatedSupplier = await service.updateDboSupplierStatus(id, status);
    if (!updatedSupplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }
    res.json(updatedSupplier);
    audit(req, req.params.id, "UPDATE", "Supplier status changed to " + status, "VENDORS");
  } catch (error) {
    console.error("Failed to update DBO supplier status:", error);
    res.status(500).json({ error: "Failed to update supplier status" });
  }
});

router.patch("/api/dbo/suppliers/:id/email", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid supplier ID" });
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    const sessionUser = resolveRequestUser(req);
    const updatedSupplier = await service.updateSupplierEmail(id, email, sessionUser);
    res.json(updatedSupplier);
    audit(req, req.params.id, "UPDATE", `Supplier email updated to ${email}`, "VENDORS");
  } catch (error: any) {
    console.error("Failed to update supplier email:", error);
    const status = error?.status || 500;
    const message = error?.message || "Failed to update supplier email";
    res.status(status).json({ error: message });
  }
});

router.get("/api/dbo/suppliers/:id/ref-companies", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }
    const refCompanies = await service.getDboSupplierRefCompanies(id);
    res.json(refCompanies);
  } catch (error) {
    console.error("Failed to fetch DBO supplier reference companies:", error);
    res.status(500).json({ error: "Failed to fetch reference companies" });
  }
});

router.get("/api/dbo/suppliers/:id/approval-history", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }
    const approvalHistory = await service.getDboSupplierApprovalHistory(id);
    res.json(approvalHistory);
  } catch (error) {
    console.error("Failed to fetch DBO supplier approval history:", error);
    res.status(500).json({ error: "Failed to fetch approval history" });
  }
});

router.get("/api/dbo/suppliers/:id/workflow-approval-history", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }
    const history = await service.getWorkflowApprovalHistory(id);
    res.json(history);
  } catch (error) {
    console.error("Failed to fetch workflow approval history:", error);
    res.status(500).json({ error: "Failed to fetch workflow approval history" });
  }
});

router.get("/api/dbo/suppliers/:id/changes", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }
    const changes = await service.getSupplierChanges(id);
    res.json(changes);
  } catch (error) {
    console.error("Failed to fetch supplier changes:", error);
    res.status(500).json({ error: "Failed to fetch changes" });
  }
});

router.delete("/api/dbo/suppliers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid supplier ID" });
    const result = await service.deleteDboSupplier(id);
    res.json(result);
    audit(req, req.params.id, "DELETE", "Supplier deleted", "VENDORS");
  } catch (error: any) {
    const status = error?.status || 500;
    res.status(status).json({ error: error?.message || "Failed to delete supplier" });
  }
});

router.delete("/api/dbo/suppliers/:id/contacts/:contactId", async (req, res) => {
  try {
    const supplierId = parseInt(req.params.id);
    const contactId = parseInt(req.params.contactId);
    if (isNaN(supplierId) || isNaN(contactId)) {
      return res.status(400).json({ error: "Invalid supplier or contact ID" });
    }
    const result = await service.deleteDboSupplierContact(supplierId, contactId);
    res.json(result);
    audit(req, `${supplierId}:${contactId}`, "DELETE", "Supplier contact deleted", "VENDORS");
  } catch (error: any) {
    const status = error?.status || 500;
    res.status(status).json({ error: error?.message || "Failed to delete contact" });
  }
});

router.delete("/api/dbo/suppliers/:id/banks/:bankId", async (req, res) => {
  try {
    const supplierId = parseInt(req.params.id);
    const bankId = parseInt(req.params.bankId);
    if (isNaN(supplierId) || isNaN(bankId)) {
      return res.status(400).json({ error: "Invalid supplier or bank ID" });
    }
    const result = await service.deleteDboSupplierBank(supplierId, bankId);
    res.json(result);
    audit(req, `${supplierId}:${bankId}`, "DELETE", "Supplier bank deleted", "VENDORS");
  } catch (error: any) {
    const status = error?.status || 500;
    res.status(status).json({ error: error?.message || "Failed to delete bank account" });
  }
});

router.delete("/api/dbo/suppliers/:id/documents/:docId", async (req, res) => {
  try {
    const supplierId = parseInt(req.params.id);
    const docId = parseInt(req.params.docId);
    if (isNaN(supplierId) || isNaN(docId)) {
      return res.status(400).json({ error: "Invalid supplier or document ID" });
    }
    const result = await service.deleteDboSupplierDocument(supplierId, docId);
    res.json(result);
    audit(req, `${supplierId}:${docId}`, "DELETE", "Supplier document deleted", "VENDORS");
  } catch (error: any) {
    const status = error?.status || 500;
    res.status(status).json({ error: error?.message || "Failed to delete document" });
  }
});

router.post("/api/dbo/suppliers/:id/process-approval", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }
    const reqUser = req.user as any;
    if (!reqUser) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const result = await service.processRegistrationApprovalStep(id, req.body, reqUser);
    res.json(result);
    audit(req, req.params.id, "APPROVAL", "Supplier registration approval processed", "VENDORS");
  } catch (error: any) {
    console.error("Failed to process vendor registration approval:", error);
    const status = error?.status || 500;
    const message = error?.message || "Failed to process vendor registration approval";
    res.status(status).json({ error: message });
  }
});


router.get("/api/suppliers", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const result = await service.getSuppliersList(limit);
    res.json(result);
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({ error: "Failed to fetch suppliers" });
  }
});

router.get("/api/tax-codes", async (req, res) => {
  try {
    const result = await service.getTaxCodes();
    res.json(result);
  } catch (error) {
    console.error("Error fetching tax codes:", error);
    res.status(500).json({ error: "Failed to fetch tax codes" });
  }
});

async function resolveNotifUserEmails(req: any): Promise<string[]> {
  const sessionUser = resolveRequestUser(req);
  const user = (req as any).user;
  const userId = user?.id || sessionUser?.id;
  if (!userId) return [];

  const sessionRole = sessionUser?.userRole || user?.userRole || "";
  if (sessionRole === "SUPERADMIN" || sessionRole === "ROLE_SUPERADMIN") return [];

  const roles = await getUserRoleNames(userId);
  const isSuperAdmin = roles.includes('SUPERADMIN') || roles.includes('ROLE_SUPERADMIN');
  if (isSuperAdmin) return [];

  const details = await getUserDetails(String(userId));
  const emails: string[] = [];
  if (details?.user_name) emails.push(details.user_name);
  if (details?.email_id && details.email_id !== details.user_name) emails.push(details.email_id);
  if (emails.length === 0 && sessionUser?.userName) emails.push(sessionUser.userName);
  return emails;
}

router.get("/api/email-notifications/latest", async (req, res) => {
  try {
    const userEmails = await resolveNotifUserEmails(req);
    const result = await service.getLatestEmailNotifications(userEmails);
    res.json(result);
  } catch (error) {
    console.error("Error fetching latest email notifications:", error);
    res.status(500).json({ error: "Failed to fetch latest email notifications" });
  }
});

router.get("/api/email-notifications/unread-count", async (req, res) => {
  try {
    const userEmails = await resolveNotifUserEmails(req);
    const count = await service.getUnreadNotificationCount(userEmails);
    res.json({ count });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

router.get("/api/email-notifications", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;

    const userEmails = await resolveNotifUserEmails(req);

    const result = await service.getEmailNotifications({
      page,
      limit,
      search,
      userEmails,
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching email notifications:", error);
    res.status(500).json({ error: "Failed to fetch email notifications" });
  }
});

router.post("/api/email-notifications/:id/mark-read", async (req, res) => {
  try {
    await service.markNotificationRead(req.params.id);
    res.json({ message: "Marked as read" });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

router.post("/api/email-notifications/mark-all-read", async (req, res) => {
  try {
    const userEmails = await resolveNotifUserEmails(req);
    await service.markAllNotificationsRead(userEmails);
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ error: "Failed to mark all as read" });
  }
});

router.get("/api/budget-lines", async (req, res) => {
  try {
    const result = await service.getBudgetLines();
    res.json(result);
  } catch (error) {
    console.error("Error fetching budget lines:", error);
    res.status(500).json({ error: "Failed to fetch budget lines" });
  }
});

export const vendorsController = router;
