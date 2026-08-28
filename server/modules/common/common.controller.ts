import { Router } from "express";
import { resolveRequestUser } from "../_shared/auth";
import { isSuperadminUser } from "../_shared/delete-guard";
import { upload } from "../_shared/file-upload";
import { logAudit } from "../administration/administration.service";
import { loadDraftBackup, deleteDraftBackup } from "../vendor-registration/vendor-registration.repository";
import { createOAuthTokensForUser } from "../auth/oidc.controller";
import { decryptPassword, getPublicKeySpkiBase64 } from "../auth/password-crypto";
import { findUserByUsername, getUserRoleNames } from "./common.repository";
import { CommonService } from "./common.service";

const router = Router();
const commonService = new CommonService();

function audit(req: any, auditKey: string, auditAction: string, auditMessage: string, module: string) {
  const user = resolveRequestUser(req);
  logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: user?.name || user?.userName || "System",
    userId: user?.id || user?.userName || "system",
    module,
  }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));
}

router.get("/api/settings/delete-function-enabled", async (req, res) => {
  try {
    const user = resolveRequestUser(req);
    const roleNames = user ? await getUserRoleNames(user.id) : [];
    const enabled = true //await isDeleteFunctionEnabled();
    res.json({
      enabled,
      canDelete: Boolean(user && isSuperadminUser(user, roleNames) && enabled),
    });
  } catch (error) {
    console.error("Error checking delete function:", error);
    res.status(500).json({ error: "Failed to check delete function setting" });
  }
});

router.get("/api/auth/public-key", (_req, res) => {
  res.json({ publicKey: getPublicKeySpkiBase64() });
});

router.get("/api/auth/verify-domain/:domain", async (req, res) => {
  try {
    const { domain } = req.params;
    if (!domain || !/^[a-z][a-z0-9-]*$/.test(domain)) {
      return res.json({ valid: false, message: "Invalid domain format" });
    }
    const { db } = await import("../../db");
    const { sql } = await import("drizzle-orm");
    const result = await db.execute(
      sql`SELECT tenant_id, company_name, domain_name FROM dbo.am_tenant_mst WHERE domain_name = ${domain} LIMIT 1`
    );
    if (result.rows && result.rows.length > 0) {
      const tenant = result.rows[0] as any;
      return res.json({ valid: true, companyName: tenant.company_name, domain: tenant.domain_name });
    }
    return res.json({ valid: false, message: "Domain not registered. Please check your domain name or contact your administrator." });
  } catch (error) {
    console.error("Verify domain error:", error);
    res.json({ valid: false, message: "Unable to verify domain" });
  }
});

router.post("/api/auth/reset-password-link", async (req, res) => {
  try {
    const { userName: rawUserName, randomId, password: rawPassword, domain, encrypted } = req.body;
    if (!rawUserName || !randomId || !rawPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    let userName: string;
    let password: string;
    try {
      userName = encrypted ? decryptPassword(rawUserName) : rawUserName;
      password = encrypted ? decryptPassword(rawPassword) : rawPassword;
    } catch {
      return res.status(400).json({ error: "Invalid request" });
    }

    let tenantPool = (req as any).tenantPool || undefined;
    if (!tenantPool && domain) {
      const { resolveTenantDb } = await import("../../tenant-db");
      const tenantContext = await resolveTenantDb(domain);
      if (tenantContext) {
        tenantPool = tenantContext.pool;
      } else {
        return res.status(401).json({ error: "Invalid domain or credentials" });
      }
    }

    const result = await commonService.resetPasswordViaLink(userName, randomId, password, tenantPool);
    if ("error" in result) {
      return res.status(result.status!).json({ error: result.error });
    }
    res.json(result);
    audit(req, userName, "UPDATE", "Password reset via forgot password link", "AUTH");
  } catch (error) {
    console.error("Reset password via link error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

router.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { emailId, mobileNo, domain } = req.body;
    if (!emailId) {
      return res.status(400).json({ error: "Email ID is required" });
    }

    let tenantPool = (req as any).tenantPool || undefined;
    if (!tenantPool && domain) {
      const { resolveTenantDb } = await import("../../tenant-db");
      const tenantContext = await resolveTenantDb(domain);
      if (tenantContext) {
        tenantPool = tenantContext.pool;
      } else {
        return res.status(401).json({ error: "Invalid domain or credentials" });
      }
    }

    const result = await commonService.forgotPassword(emailId.trim(), mobileNo, tenantPool);
    if ("error" in result) {
      return res.status(result.status!).json({ error: result.error });
    }
    res.json(result);
    audit(req, emailId, "UPDATE", "Forgot Password Initiated", "AUTH");
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Failed to process forgot password request" });
  }
});

router.post("/api/auth/login", async (req, res) => {
  try {
    const { email: rawEmail, password: rawPassword, role, domain: bodyDomain, encrypted } = req.body;
    // Use domain from body, or fall back to subdomain extracted by tenant middleware
    const domain = bodyDomain || (req as any).tenantDomain || null;

    let email: string;
    let password: string;
    try {
      email = encrypted ? decryptPassword(rawEmail) : rawEmail;
      password = encrypted ? decryptPassword(rawPassword) : rawPassword;
    } catch {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    let loginPool = (req as any).tenantPool || undefined;

    if (!loginPool && domain) {
      const { resolveTenantDb } = await import("../../tenant-db");
      const tenantContext = await resolveTenantDb(domain);
      if (tenantContext) {
        loginPool = tenantContext.pool;
        (req as any).tenantDb = tenantContext.db;
        (req as any).tenantPool = tenantContext.pool;
        (req as any).tenantDomain = domain;
        (req as any).tenantDbName = tenantContext.dbName;
      } else {
        // Domain was supplied but is not a registered tenant — reject to prevent
        // falling through to the master DB with tenant-context credentials.
        return res.status(401).json({ error: "Invalid domain or credentials" });
      }
    }


    const result = await commonService.loginUser(email, password, role, loginPool);

    if ("error" in result) {
      return res.status(result.status!).json({ error: result.error });
    }

    if (domain) {
      (result as any).sessionData.domain = domain;
      (result as any).responseData.domain = domain;
    }

    (req as any).session.user = result.sessionData;
    (req as any).user = result.sessionData;

    const includeTokens =
      req.body?.include_tokens === true ||
      req.body?.include_tokens === "true" ||
      req.body?.include_tokens === 1;

    if (includeTokens) {
      const userRow = await findUserByUsername(email, loginPool);
      if (userRow) {
        const tokens = await createOAuthTokensForUser(
          userRow,
          domain,
          loginPool ?? null
        );
        return res.json({ ...result.responseData, ...tokens });
      }
    }

    res.json(result.responseData);
    audit(req, result.sessionData?.userName || "login", "LOGIN", "User logged in: " + (result.sessionData?.userName || "") + (domain ? ` (domain: ${domain})` : ""), "AUTH");
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/api/auth/send-login-otp", async (req, res) => {
  try {
    const { email, domain } = req.body;

    let tenantPool = (req as any).tenantPool || undefined;
    if (!tenantPool && domain) {
      const { resolveTenantDb } = await import("../../tenant-db");
      const tenantContext = await resolveTenantDb(domain);
      if (tenantContext) {
        tenantPool = tenantContext.pool;
      } else {
        return res.status(401).json({ error: "Invalid domain or credentials" });
      }
    }

    const result = await commonService.sendLoginOTP(email, tenantPool);

    if ("error" in result) {
      return res.status(result.status!).json({ error: result.error });
    }

    res.json(result.responseData);
    audit(req, email || "loginotp", "EMAIL OTP LOGIN", "OTP sent to registered email address: " + (email || "") + (domain ? ` (domain: ${domain})` : ""), "AUTH");
  } catch (error) {
    console.error("Sending OTP to Email Failed:", error);
    res.status(500).json({ error: "Sending OTP to Email Failed" });
  }
});

router.post("/api/auth/verify-login-otp", async (req, res) => {
  try {
    const { email, domain: bodyDomain, otp } = req.body;
    // Use domain from body, or fall back to subdomain extracted by tenant middleware
    const domain = bodyDomain || (req as any).tenantDomain || null;

    let loginPool = (req as any).tenantPool || undefined;

    if (!loginPool && domain) {
      const { resolveTenantDb } = await import("../../tenant-db");
      const tenantContext = await resolveTenantDb(domain);
      if (tenantContext) {
        loginPool = tenantContext.pool;
        (req as any).tenantDb = tenantContext.db;
        (req as any).tenantPool = tenantContext.pool;
        (req as any).tenantDomain = domain;
        (req as any).tenantDbName = tenantContext.dbName;
      } else {
        // Domain was supplied but is not a registered tenant — reject to prevent
        // falling through to the master DB with tenant-context credentials.
        return res.status(401).json({ error: "Invalid domain or credentials" });
      }
    }

    const result = await commonService.loginWithOTP(email, otp, loginPool);

    if ("error" in result) {
      return res.status(result.status!).json({ error: result.error });
    }

    if (domain) {
      (result as any).sessionData.domain = domain;
      (result as any).responseData.domain = domain;
    }

    const prevOtpUser = (req as any).session?.user;
    if (prevOtpUser && prevOtpUser.userName !== result.sessionData?.userName) {
      delete (req as any).session.vendorRegistrationDraft;
      (req as any).session.pendingAiDocuments = [];
    }
    (req as any).session.user = result.sessionData;

    if (!(req as any).session.vendorRegistrationDraft && result.sessionData?.userName && result.sessionData?.orgId) {
      try {
        const backup = await loadDraftBackup(result.sessionData.userName, Number(result.sessionData.orgId));
        if (backup?.draft) {
          (req as any).session.vendorRegistrationDraft = backup.draft;
          if (Array.isArray(backup.pendingDocs) && backup.pendingDocs.length > 0) {
            (req as any).session.pendingAiDocuments = backup.pendingDocs;
          }
          await new Promise<void>((resolve, reject) => {
            (req as any).session.save((err: any) => (err ? reject(err) : resolve()));
          });
          await deleteDraftBackup(result.sessionData.userName, Number(result.sessionData.orgId));
        }
      } catch (err: any) {
        console.error("[OTP Login] Failed to restore vendor registration draft backup:", err?.message);
      }
    }
    
    const userRow = await findUserByUsername(email, loginPool);
      if (userRow) 
      {
        const tokens = await createOAuthTokensForUser(userRow,domain,loginPool ?? null);

        audit(req, result.sessionData?.userName || "loginotp", "LOGIN WITH OTP", "User logged in with OTP: " + (result.sessionData?.userName || "") + (domain ? ` (domain: ${domain})` : ""), "AUTH");
        return res.json({ ...result.responseData, ...tokens });
      }
  } 
  catch (error) 
  {
    console.error("Verifying OTP error:", error);
    res.status(500).json({ error: "Verifying OTP failed" });
  }
});

router.post("/api/auth/check-org-name", async (req, res) => {
  try {
    const { companyName } = req.body;
    if (!companyName) return res.json({ exists: false });
    const { checkOrgNameExists } = await import("./common.repository");
    const exists = await checkOrgNameExists(companyName.trim());
    res.json({ exists });
  } catch (error) {
    console.error("Check org name error:", error);
    res.status(500).json({ error: "Check failed" });
  }
});

router.post("/api/auth/check-email", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ exists: false });
    const { checkEmailExists } = await import("./common.repository");
    const exists = await checkEmailExists(email.trim());
    res.json({ exists });
  } catch (error) {
    console.error("Check email error:", error);
    res.status(500).json({ error: "Check failed" });
  }
});

router.post("/api/auth/check-mobile", async (req, res) => {
  try {
    const { mobile } = req.body;
    if (!mobile) return res.json({ exists: false });
    const { checkMobileExists } = await import("./common.repository");
    const exists = await checkMobileExists(mobile.trim());
    res.json({ exists });
  } catch (error) {
    console.error("Check mobile error:", error);
    res.status(500).json({ error: "Check failed" });
  }
});

router.post("/api/auth/check-username", async (req, res) => {
  try {
    const { userName } = req.body;
    if (!userName) return res.json({ exists: false });
    const { checkUsernameExists } = await import("./common.repository");
    const exists = await checkUsernameExists(userName.trim());
    res.json({ exists });
  } catch (error) {
    console.error("Check username error:", error);
    res.status(500).json({ error: "Check failed" });
  }
});

router.get("/api/auth/invitation/:enc", async (req, res) => {
  try {
    const decoded = Buffer.from(req.params.enc, 'base64').toString('utf-8');
    const params: Record<string, string> = {};
    decoded.split('&').forEach(pair => {
      const [key, val] = pair.split('=');
      if (key && val) params[key] = decodeURIComponent(val.replace(/\+/g, ' '));
    });
    const { email_id, companyName, invitationId, domain } = params;
    if (!invitationId) return res.status(400).json({ error: "Invalid invitation link" });

    const { findInvitation } = await import("./common.repository");
    const inv = await findInvitation(parseInt(invitationId));
    if (!inv) return res.status(404).json({ error: "Invitation not found" });
    if (inv.status === 'Registered') return res.status(400).json({ error: "This invitation has already been used" });
    if (inv.status === 'Cancelled') return res.status(400).json({ error: "This invitation has been cancelled" });
    if (inv.status === 'Expired' || (inv.end_date && new Date(inv.end_date) < new Date())) {
      return res.status(400).json({ error: "This invitation has expired" });
    }

    res.json({
      email: email_id || inv.email_id,
      companyName: companyName || inv.company_name,
      invitationId: invitationId,
      domain: domain || null,
    });
  } catch (error) {
    console.error("Invitation decode error:", error);
    res.status(400).json({ error: "Invalid invitation link" });
  }
});

router.post("/api/auth/register-vendor", async (req, res) => {
  try {
    const result = await commonService.registerVendor(req.body);

    if ("error" in result) {
      return res.status(result.status!).json({ error: result.error });
    }

    res.status(201).json(result);
    audit(req, req.body.userName || req.body.email || "supplier", "CREATE", "Supplier registered: " + (req.body.companyName || ""), "AUTH");
  } catch (error: any) {
    console.error("Vendor registration error:", error);
    res.status(500).json({ error: error.message || "Registration failed" });
  }
});


router.get("/api/user-menu", async (req, res) => {
  try {
    const sessionUser = (req as any).user ?? (req as any).session?.user;
    if (!sessionUser) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const result = await commonService.getUserMenu(sessionUser.id, sessionUser.supplierId);
    res.json(result);
  } catch (error) {
    console.error("Error fetching user menu:", error);
    res.status(500).json({ error: "Failed to fetch user menu" });
  }
});

router.get("/api/profile/:identifier", async (req, res) => {
  try {
    const result = await commonService.getProfile(req.params.identifier);
    if ("error" in result) {
      return res.status(result.status!).json({ error: result.error });
    }
    res.json(result);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

router.patch("/api/profile/:id", async (req, res) => {
  try {
    const { userEmail, ...profileData } = req.body;
    const result = await commonService.updateProfile(req.params.id, profileData, userEmail);
    if ("error" in result) {
      return res.status(result.status!).json({ error: result.error });
    }
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Profile updated", "PROFILE");
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.post("/api/profile/:id/change-password", async (req, res) => {
  try {
    const { currentPassword, newPassword, userEmail } = req.body;
    const result = await commonService.changePassword(req.params.id, currentPassword, newPassword, userEmail);
    if ("error" in result) {
      return res.status(result.status!).json({ error: result.error });
    }
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Password changed", "PROFILE");
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

router.post("/api/users/:id/reset-password", async (req, res) => {
  try {
    const tenantDomain = (req as any).tenantDomain || undefined;
    const result = await commonService.resetPassword(req.params.id, tenantDomain);
    if ("error" in result) {
      return res.status(result.status!).json({ error: result.error });
    }
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Password reset by admin", "USER_MANAGEMENT");
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

router.post("/api/profile/:id/photo", async (req, res) => {
  try {
    const { photo } = req.body;
    const result = await commonService.uploadPhoto(req.params.id, photo);
    if ("error" in result) {
      return res.status(result.status!).json({ error: result.error });
    }
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Profile photo updated", "PROFILE");
  } catch (error) {
    console.error("Error uploading photo:", error);
    res.status(500).json({ error: "Failed to upload photo" });
  }
});

router.delete("/api/profile/:id/photo", async (req, res) => {
  try {
    const result = await commonService.removePhoto(req.params.id);
    if ("error" in result) {
      return res.status(result.status!).json({ error: result.error });
    }
    res.json(result);
    audit(req, req.params.id, "DELETE", "Profile photo removed", "PROFILE");
  } catch (error) {
    console.error("Error removing photo:", error);
    res.status(500).json({ error: "Failed to remove photo" });
  }
});

router.post("/api/feedback", async (req, res) => {
  try {
    const userId = req.headers["x-user-email"] as string;
    const result = await commonService.submitFeedback(userId, req.body);
    if ("error" in result) {
      return res.status(result.status!).json({ error: result.error });
    }
    res.json(result);
    audit(req, "feedback", "CREATE", "Feedback submitted", "COMMON");
  } catch (error) {
    console.error("Error submitting feedback:", error);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

router.get("/api/feedback/history", async (req, res) => {
  try {
    const userId = req.headers["x-user-email"] as string;
    const result = await commonService.getFeedbackHistory(userId);
    res.json(result);
  } catch (error) {
    console.error("Error fetching feedback history:", error);
    res.status(500).json({ error: "Failed to fetch feedback history" });
  }
});

router.get("/api/departments", async (req, res) => {
  try {
    const result = await commonService.getDepartments();
    res.json(result);
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

router.get("/api/dashboard/inbox", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const pageNo = parseInt(req.query.pageNo as string) || 0;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const result = await commonService.getDashboardInbox(user, pageNo, pageSize);
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching inbox:", error);
    res.status(500).json({ error: error.message || "Failed to fetch inbox" });
  }
});

router.get("/api/dashboard/inbox-dash", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const result = await commonService.getInboxDash(user);
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching inbox dashboard:", error);
    res.status(500).json({ error: error.message || "Failed to fetch inbox dashboard" });
  }
});

router.get("/api/dashboard/all-tasks", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const pageNo = parseInt(req.query.pageNo as string) || 0;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const result = await commonService.getAllTasks(user, pageNo, pageSize);
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching all tasks:", error);
    res.status(500).json({ error: error.message || "Failed to fetch all tasks" });
  }
});

router.get("/api/dashboard/inbox-count", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const count = await commonService.getInboxCount(user);
    res.json({ count });
  } catch (error: any) {
    console.error("Error fetching inbox count:", error);
    res.status(500).json({ error: error.message || "Failed to fetch inbox count" });
  }
});

router.get("/api/dashboard/pending-approvals", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const result = await commonService.getPendingApprovals(user);
    if (!res.headersSent) res.json(result);
  } catch (error: any) {
    console.error("Error fetching pending approval counts:", error);
    if (!res.headersSent) res.status(500).json({ error: error.message || "Failed to fetch pending approval counts" });
  }
});

router.get("/api/dashboard/user-counts", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const result = await commonService.getUserCounts();
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching user counts:", error);
    res.status(500).json({ error: error.message || "Failed to fetch user counts" });
  }
});

router.get("/api/dashboard/supplier-stats", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const isSupplier = sessionUser?.userRole === "ROLE_SUPPLIER_ADMIN" || sessionUser?.userRole === "ROLE_SUPPLIER_USER";
    if (!isSupplier || !sessionUser?.supplierId) {
      return res.status(403).json({ error: "Access denied - supplier role required" });
    }
    const result = await commonService.getSupplierStats(sessionUser.supplierId);
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching supplier stats:", error);
    res.status(500).json({ error: "Failed to fetch supplier stats" });
  }
});

router.get("/api/dashboard/supplier-activities", async (req, res) => {
  try {
    const sessionUser = (req as any).session?.user;
    const isSupplier = sessionUser?.userRole === "ROLE_SUPPLIER_ADMIN" || sessionUser?.userRole === "ROLE_SUPPLIER_USER";
    if (!isSupplier || !sessionUser?.supplierId) {
      return res.status(403).json({ error: "Access denied - supplier role required" });
    }
    const result = await commonService.getSupplierActivities(sessionUser.supplierId);
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching supplier activities:", error);
    res.status(500).json({ error: "Failed to fetch supplier activities" });
  }
});

router.get("/api/dashboard/recent-activities", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const result = await commonService.getRecentActivities(user);
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching recent activities:", error);
    res.status(500).json({ error: "Failed to fetch recent activities" });
  }
});

router.get("/api/dashboard/my-request-stats", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const result = await commonService.getMyRequestStats(user);
    if (!res.headersSent) res.json(result);
  } catch (error: any) {
    console.error("Error fetching request stats:", error);
    if (!res.headersSent) res.status(500).json({ error: "Failed to fetch request stats" });
  }
});

router.get("/api/dashboard/available-budgets", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const result = await commonService.getAvailableBudgets();
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching available budgets:", error);
    res.status(500).json({ error: "Failed to fetch available budgets" });
  }
});

router.get("/api/dashboard/recent-comments", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const result = await commonService.getRecentComments(user);
    res.json(result);
  } catch (error: any) {
    console.error("Error fetching recent comments:", error);
    res.status(500).json({ error: "Failed to fetch recent comments" });
  }
});

router.post("/api/saasmgmt/contactsUs",async (req, res) => {
  try 
  {
    const { user,email, message,mobile,companyName,firstname,lastName,contactUs } = req.body;
    await commonService.contactUs(user, companyName,firstname, email, mobile, message,lastName,contactUs);
    res.json({ success: true, message: "Your message has been received. We will contact you shortly." });

  }
  catch (error: any) {
    console.error("Error fetching recent comments:", error);
    res.status(500).json({ error: "Failed to fetch recent comments" });
  }
  });

  router.post("/api/makeRightChoice", async (req, res) => {
    try 
    {
        const makeRightChoice = req.body;
        const params = 
        {
            user: "Prokraya Team",
            companyName: makeRightChoice.companyName,
            contactName: makeRightChoice.contactName,
            email: makeRightChoice.email,
            mobile: makeRightChoice.mobile,
            message: makeRightChoice.message
        };
        await commonService.makeRightChoice(params);
        res.json({ success: true, message: "Your application has been submitted successfully." });
      }
      catch (error: any) 
      {
        console.error("Error in makeRightChoice:", error);
        res.status(500).json({ error: "Failed to process your request" });
      }
  });

  router.post("/api/career",upload.single("resume"), async (req, res) => 
    {
    try 
    {
      const career = JSON.parse(req.body.career);
      const uploadedFile = (req as any).file as Express.Multer.File | undefined;

      commonService.submitCareerForm(career, uploadedFile);
      res.json({ success: true, message: "Your application has been submitted successfully." });
    } 
    catch (error: any) 
    {
      return res.status(400).json({ error: "Invalid career data" });
    }
  });

router.post("/api/addScriptGoogle", async (req, res) => {
  try {
    const thirdPartyUrl = "https://script.google.com/macros/s/AKfycbxnFxqpUWUDlu0XkH-mdfdbYSgnyyyaV_eMDxq7IcNongn1-6U_oLlQFG7HuZsbvh9ofA/exec";

    const response = await fetch(thirdPartyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();
    return res.status(response.status).send(text);
  } catch (error: any) {
    console.error("Error forwarding Google script request:", error);
    return res.status(500).json({ error: "Failed to forward request" });
  }
});

router.post("/api/auth/send-login-otp", async (req, res) => {
  try {
    const { email, domain } = req.body;
 
    let tenantPool = (req as any).tenantPool || undefined;
    if (!tenantPool && domain) {
      const { resolveTenantDb } = await import("../../tenant-db");
      const tenantContext = await resolveTenantDb(domain);
      if (tenantContext) {
        tenantPool = tenantContext.pool;
      } else {
        return res.status(401).json({ error: "Invalid domain or credentials" });
      }
    }
 
    const result = await commonService.sendLoginOTP(email, tenantPool);
 
    if ("error" in result) {
      return res.status(result.status!).json({ error: result.error });
    }
 
    res.json(result.responseData);
    audit(req, email || "loginotp", "EMAIL OTP LOGIN", "OTP sent to registered email address: " + (email || "") + (domain ? ` (domain: ${domain})` : ""), "AUTH");
  } catch (error) {
    console.error("Sending OTP to Email Failed:", error);
    res.status(500).json({ error: "Sending OTP to Email Failed" });
  }
});

export { router as commonController };

