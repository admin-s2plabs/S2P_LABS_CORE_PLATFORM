import { Router } from "express";
import { logAudit } from "../administration/administration.service";
import * as service from "./user-management.service";
import { extractDomainFromRequest } from "../../tenant-db";

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
  logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: user?.name || "System",
    userId: user?.id || "system",
    module,
  }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));
}

router.get("/api/users/org-users", async (req, res) => {
  try {
    const result = await service.getOrgUsers();
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch organization users");
  }
});

router.get("/api/users/dropdown", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const search = req.query.search as string;
    const rolesParam = req.query.roles as string;
    const roles = rolesParam
      ? rolesParam.split(",").map((r) => r.trim())
      : [];
    const result = await service.getUsersDropdown({ page, limit, search, roles });
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch users");
  }
});

router.get("/api/users", async (req, res) => {
  try {
    const page =parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) ?? 10;
    const userType = req.query.userType as string;
    const search = req.query.search as string;
    const status = req.query.status as string;

    const result = await service.getUsersPaginated({ page, limit, userType, search, status });
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch users");
  }
});

router.get("/api/users/:id", async (req, res) => {
  try {
    const user = await service.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    handleError(res, error, "Failed to fetch user");
  }
});

router.post("/api/users", async (req, res) => {
  try {
    const result = await service.createUser({ ...req.body, domain: extractDomainFromRequest(req) });
    res.status(201).json(result);
    audit(req, String(result.id), "CREATE", "User created: " + (req.body.name || ""), "USER_MANAGEMENT");
  } catch (error) {
    handleError(res, error, "Failed to create user");
  }
});

router.put("/api/users/:id", async (req, res) => {
  try {
    const result = await service.updateUser(req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(result);
    audit(req, req.params.id, "UPDATE", "User updated", "USER_MANAGEMENT");
  } catch (error) {
    handleError(res, error, "Failed to update user");
  }
});

router.patch("/api/users/:id/status", async (req, res) => {
  try {
    const result = await service.updateUserStatus(req.params.id, req.body.user_status);
    if (!result) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true, user: result });
    audit(req, req.params.id, "UPDATE", "User status changed to " + req.body.user_status, "USER_MANAGEMENT");
  } catch (error) {
    handleError(res, error, "Failed to update user status");
  }
});

router.delete("/api/users/:id", async (req, res) => {
  try {
    const actingUser = (req as any).user;
    const result = await service.deleteUser(req.params.id, actingUser?.id);
    res.json(result);
    audit(req, req.params.id, "DELETE", "User deleted", "USER_MANAGEMENT");
  } catch (error) {
    handleError(res, error, "Failed to delete user");
  }
});

router.get("/api/users/:id/roles", async (req, res) => {
  try {
    const result = await service.getUserRoles(req.params.id);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch user roles");
  }
});

router.get("/api/roles/dropdown", async (req, res) => {
  try {
    const result = await service.getRolesDropdown();
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch roles");
  }
});

router.get("/api/roles/by-name/:roleName/:orgId/users", async (req, res) => {
  try {
    const result = await service.getUsersByRoleName(req.params.roleName,req.params.orgId);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch users by role name");
  }
});

router.get("/api/roles", async (req, res) => {
  try {
    const result = await service.getRoles();
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch roles");
  }
});

router.post("/api/roles", async (req, res) => {
  try {
    const result = await service.createRole(req.body);
    res.status(201).json(result);
    audit(req, String(result.id), "CREATE", "Role created: " + (req.body.role_name || ""), "USER_MANAGEMENT");
  } catch (error) {
    handleError(res, error, "Failed to create role");
  }
});

router.get("/api/roles/:id", async (req, res) => {
  try {
    const role = await service.getRoleById(req.params.id);
    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }
    res.json(role);
  } catch (error) {
    handleError(res, error, "Failed to fetch role");
  }
});

router.get("/api/roles/:id/users", async (req, res) => {
  try {
    const result = await service.getRoleUsers(req.params.id);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch role users");
  }
});

router.get("/api/roles/:id/functions", async (req, res) => {
  try {
    const result = await service.getRoleFunctions(req.params.id);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch role functions");
  }
});

router.get("/api/functions", async (req, res) => {
  try {
    const roleId = req.query.roleId as string | undefined;
    const result = await service.getFunctions(roleId);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch functions");
  }
});

router.patch("/api/roles/:id", async (req, res) => {
  try {
    const result = await service.updateRole(req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ error: "Role not found" });
    }
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Role updated", "USER_MANAGEMENT");
  } catch (error) {
    handleError(res, error, "Failed to update role");
  }
});

router.put("/api/roles/:id/functions", async (req, res) => {
  try {
    const result = await service.updateRoleFunctions(req.params.id, req.body.function_ids);
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Role functions updated", "USER_MANAGEMENT");
  } catch (error) {
    handleError(res, error, "Failed to update role functions");
  }
});

router.delete("/api/roles/:id", async (req, res) => {
  try {
    const result = await service.deleteRole(req.params.id);
    res.json(result);
    audit(req, req.params.id, "DELETE", "Role deleted", "USER_MANAGEMENT");
  } catch (error) {
    handleError(res, error, "Failed to delete role");
  }
});

router.get("/api/role-delegations", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "all";

    const result = await service.getRoleDelegationsPaginated({ page, limit, search, status });
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch role delegations");
  }
});

router.post("/api/role-delegations", async (req, res) => {
  try {
    const result = await service.createRoleDelegation(req.body);
    res.status(201).json(result);
    audit(req, String(result.id), "CREATE", "Role delegation created", "USER_MANAGEMENT");
  } catch (error) {
    handleError(res, error, "Failed to create role delegation");
  }
});

router.patch("/api/role-delegations/:id", async (req, res) => {
  try {
    const result = await service.updateRoleDelegation(req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ error: "Delegation not found" });
    }
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Role delegation updated", "USER_MANAGEMENT");
  } catch (error) {
    handleError(res, error, "Failed to update role delegation");
  }
});

router.delete("/api/role-delegations/:id", async (req, res) => {
  try {
    const result = await service.deleteRoleDelegation(req.params.id);
    if (!result) {
      return res.status(404).json({ error: "Delegation not found" });
    }
    res.json({ success: true, id: result.id });
    audit(req, req.params.id, "DELETE", "Role delegation deleted", "USER_MANAGEMENT");
  } catch (error) {
    handleError(res, error, "Failed to delete role delegation");
  }
});

router.get("/api/approvers/active-users", async (req, res) => {
  try {
    const result = await service.getActiveUsersForApprovers();
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch active users");
  }
});

router.get("/api/approvers/org-currency", async (req, res) => {
  try {
    const result = await service.getOrgCurrencyForApprovers();
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch org currency");
  }
});

router.get("/api/approvers", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;

    const result = await service.getApproversPaginated({ page, limit, search });
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch approvers");
  }
});

router.post("/api/approvers", async (req, res) => {
  try {
    const result = await service.createApprover(req.body);
    res.json(result);
    audit(req, String(result.id), "CREATE", "Approver created", "USER_MANAGEMENT");
  } catch (error) {
    handleError(res, error, "Failed to create approver");
  }
});

router.put("/api/approvers/:id", async (req, res) => {
  try {
    const result = await service.updateApprover(req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ error: "Approver not found" });
    }
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Approver updated", "USER_MANAGEMENT");
  } catch (error) {
    handleError(res, error, "Failed to update approver");
  }
});

router.delete("/api/approvers/:id", async (req, res) => {
  try {
    const result = await service.deleteApprover(req.params.id);
    if (!result) {
      return res.status(404).json({ error: "Approver not found" });
    }
    res.json({ message: "Approver deleted successfully" });
    audit(req, req.params.id, "DELETE", "Approver deleted", "USER_MANAGEMENT");
  } catch (error) {
    handleError(res, error, "Failed to delete approver");
  }
});

export const userManagementController = router;
