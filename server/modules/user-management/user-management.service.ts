import { umOrgMapDtls } from "@shared/schema";
import argon2 from "argon2";
import { sql } from "drizzle-orm";
import { db, pool } from "server/db";
import { getContextDb, getContextPool } from "server/tenant-context";
import { v4 as uuidv4 } from "uuid";
import { eventBus } from "../../services/eventBus";
import { EventTypes, UserCreationEvent } from "../../services/eventBus/events";
import { propertiesService } from "../../services/propertiesService";
import * as commonRepo from "../common/common.repository";
import * as repo from "./user-management.repository";
const getPool = () => getContextPool() ?? pool;
const getDb = () => getContextDb() ?? db;
import * as adminRepo from "../administration/administration.repository.ts";

export async function getUsersPaginated(params: {
  page: number;
  limit: number;
  userType?: string;
  search?: string;
  status?: string;
}) {
  return repo.getUsersPaginated(params);
}

export async function getOrgUsers() {
  return repo.getOrgUsers();
}

export async function getUsersDropdown(params: {
  page: number;
  limit: number;
  search?: string;
  roles?: string[];
}) {
  return repo.getUsersDropdown(params);
}

export async function getUserById(id: string) {
  return repo.getUserById(id);
}

export async function resolveApproverReference(reference: string) {
  return repo.resolveApproverReference(reference);
}

export async function createUser(data: {
  name: string;
  email_id: string;
  mobile_no?: string;
  department_name?: string;
  designation?: string;
  user_type?: number;
  org_id: string;
  role_id?: number;
  domain?: string;
  reporting_to?: string;
}) {
  const { name, email_id: rawEmail, mobile_no, department_name, designation, user_type, org_id, role_id, domain, reporting_to } = data;
  const email_id = rawEmail?.trim() ?? "";

  if (!name || !email_id) {
    throw { status: 400, message: "Name and email are required" };
  }

  const exists = await repo.checkEmailExists(email_id);
  if (exists) {
    throw { status: 400, message: "Email already exists" };
  }

  const existingSupplier = await repo.findSupplierByEmail(email_id);
  if (existingSupplier) {
    const ref = existingSupplier.supplier_id || existingSupplier.id;
    const company = existingSupplier.company_name || "Unknown";
    const status = existingSupplier.status || "Unknown";
    throw {
      status: 400,
      message: `Email already exists as a supplier (${company}, ref ${ref}, status: ${status}). Use Vendors to find this record, or use a different email.`,
    };
  }

  const generateStrongPassword = () => {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';
    const all = uppercase + lowercase + numbers + special;

    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    for (let i = 0; i < 8; i++) {
      password += all[Math.floor(Math.random() * all.length)];
    }

    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  const generatedPassword = generateStrongPassword();

  const hashedPassword = await argon2.hash(generatedPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4
  });

  const newId = await repo.getNextUserId();

  let org_ids: number[] = [];
  const orgId = String(org_id);
  if (orgId.includes(",")) {
    org_ids = orgId.split(",").map(id => parseInt(id.trim()));
  } else {
    org_ids.push(parseInt(orgId));
  }

  let managerName = null;
  if (reporting_to) {
    managerName = await repo.getManagerName(reporting_to);
  }

  const result = await repo.insertUser({
    id: newId,
    name,
    email_id,
    hashedPassword,
    mobile_no: mobile_no || null,
    department_name: department_name || null,
    designation: designation || null,
    user_type: user_type !== undefined ? user_type : 0,
    org_id: String(org_ids[0] ?? null),
    reporting_to: reporting_to || null,
    managerName: managerName || null
  });

  const userId = result.id;

  if (role_id) {
    await repo.assignUserRole(userId, role_id, email_id);
  }

  let orgNames ="";
  let orgIdData   = "";
 for (const orgId1 of org_ids) 
 {
  const orgDtls = await repo.getOrgById(orgId1);
  if (!orgDtls) {
    console.warn(`Org ${orgId1} not found in um_org_dtls, skipping org mapping.`);
    continue;
  }
  const existingMapping = await getDb().select().from(umOrgMapDtls).where(sql`${umOrgMapDtls.userId} = ${userId} AND ${umOrgMapDtls.orgId} = ${orgId1}`);
  if (existingMapping.length > 0) {
    console.log(`Mapping already exists for user ${userId} and org ${orgId1}, skipping insertion.`);
    orgNames = orgNames.concat(orgDtls ? orgDtls.organizationName : "") + ",";
    orgIdData = orgIdData.concat(String(orgId1)) + ",";
    continue;
  }
  
  const USER_ORG_MAP_SEQ_ID = sql`nextval('dbo.um_user_org_map_dtls_seq'::regclass)`;
  await getDb().insert(umOrgMapDtls).values({
    id: USER_ORG_MAP_SEQ_ID,
    attribute1:null,
    attribute2:null,
    attribute3:null,
    attribute4:null,
    companyCode:null,
    createdBy:null,
    creationDate:new Date(),
    orgLegalName: null,
    ipAddress:null,
    lastModifiedBy:null,
    lastModifiedDate:null,
    organizationName:orgDtls ? orgDtls.organization_name : null,
    orgType:orgDtls ? orgDtls.org_Type : null,
    orgId:orgId1,
    userId:newId
  });
  orgNames = orgNames.concat(orgDtls ? orgDtls.organization_name : "") + ",";
  orgIdData = orgIdData.concat(String(orgId1)) + ",";
}
await getPool().query(`update dbo.um_user_dtls set attribute_1=$1,attribute_12=$3 WHERE id = $2`, [orgNames, parseInt(userId),orgIdData]);
  try {
    const currency = await repo.getOrgCurrency();
    const nextApproveId = await repo.getNextApproveId();

    await repo.insertDefaultApprover({
      userId,
      name,
      currency,
      approveId: nextApproveId
    });

    console.log(`Approver record created for user ${name} with default limits (0-100 ${currency})`);
  } catch (approverError) {
    console.error("Error creating approver record:", approverError);
  }

  const rId = uuidv4();
  const appUrl = await propertiesService.getAppUrlForDomain(domain);
  const domainPart = domain ? `~domain=${domain}` : '';
  const encStr = Buffer.from(`user_id=${email_id}~linkId=${rId}${domainPart}`).toString('base64');
  const resetLinkUrl = `${appUrl}/resetpassword?enc=${encodeURIComponent(encStr)}`;

  await commonRepo.updateForgotPasswordToken(userId, rId);
  const orgData = await adminRepo.getOrgDetails();
  const event: UserCreationEvent = {
    eventType: EventTypes.SRMS_USER_CREATION,
    timestamp: new Date(),
    emailId: email_id,
    userName: name,
    loginUserName: email_id,
    resetLinkUrl,
    orgName: 'Prokraya',
    orgLogoPath: orgData.org_logo_path,
  };

  eventBus.publish(event);
  console.log(`User created: ${email_id} - Welcome email with reset link sent`);

  return { id: userId, message: "User created successfully" };
}

export async function updateUser(id: string, data: {
  name: string;
  email_id: string;
  mobile_no: string;
  department_name: string;
  designation: string;
  org_id: string;
  removedOrgIds: string;
  role_ids?: number[];
  reporting_to?: string;
  user_status: number;
}) {
  let managerName = null;
  if (data.reporting_to) {
    managerName = await repo.getManagerName(data.reporting_to);
  }

  if(data.removedOrgIds && data.removedOrgIds !== "") {
  const removedOrgs = data.removedOrgIds ? data.removedOrgIds.split(",").map((orgId: string) => parseInt(orgId.trim())) : [parseInt(data.removedOrgIds)];
  if(removedOrgs) {
    for(const orgId of removedOrgs) {
      await getPool().query(`delete from dbo.um_user_org_map_dtls where org_id = $1 and user_id = $2`, [orgId, id]);
      }
   }
  }

  const result = await repo.updateUser(id, {
    name: data.name,
    email_id: data.email_id,
    mobile_no: data.mobile_no,
    department_name: data.department_name,
    designation: data.designation,
    org_id: data.org_id,
    reporting_to: data.reporting_to || null,
    managerName,
    user_status: data.user_status
  });

  if (data.role_ids && Array.isArray(data.role_ids)) {
    await repo.deleteUserRoles(id);
    for (const roleId of data.role_ids) {
      await repo.insertUserRole(id, roleId);
    }
  }

  return result;
}

export async function deleteUser(id: string, actingUserId?: string) {
  if (!id) throw { status: 400, message: "User id is required" };
  if (actingUserId && String(actingUserId) === String(id)) {
    throw { status: 400, message: "You cannot delete your own user account" };
  }

  const existing = await repo.getUserById(id);
  if (!existing) throw { status: 404, message: "User not found" };

  const roleName = await repo.checkRoleIsSuperadmin(id);
  if (id === "100" && roleName === "ROLE_SUPERADMIN") {
    throw { status: 400, message: "Primary SUPERADMIN user cannot be deleted" };
  }

  await repo.deleteUserRoles(id);
  await repo.deleteUserOrgMappings(id);
  const deleted = await repo.deleteUserById(id);
  if (!deleted) throw { status: 500, message: "Failed to delete user" };

  return { success: true, message: "User deleted successfully", id: deleted.id };
}

export async function updateUserStatus(id: string, userStatus: number) {
  const isSuperadmin = await repo.checkRoleIsSuperadmin(id);
  if (id === "100" && isSuperadmin === "ROLE_SUPERADMIN" && userStatus === 2) {
    throw { status: 400, message: "You cannot disable Primary SUPERADMIN" };
  }
  if (userStatus === undefined || ![1, 2].includes(userStatus)) {
    throw { status: 400, message: "Invalid status. Must be 1 (Active) or 2 (Inactive)" };
  }
  return repo.updateUserStatus(id, userStatus);
}

export async function getUserRoles(userId: string) {
  return repo.getUserRoles(userId);
}

export async function getRoles() {
  return repo.getRoles();
}

export async function createRole(data: {
  role_name: string;
  role_display_name: string;
  description?: string;
  status?: number;
  role_type?: string;
}) {
  const { role_name, role_display_name, description, status = 1, role_type = "Custom Role" } = data;

  if (!role_name || !role_display_name) {
    throw { status: 400, message: "Role name and display name are required" };
  }

  const exists = await repo.checkRoleNameExists(role_name);
  if (exists) {
    throw { status: 400, message: "A role with this name already exists" };
  }

  const newId = await repo.getNextRoleId();

  return repo.insertRole({
    id: newId,
    role_name,
    role_display_name,
    description: description || '',
    status,
    role_type
  });
}

export async function getRolesDropdown() {
  return repo.getRolesDropdown();
}

export async function getRoleById(id: string) {
  return repo.getRoleById(id);
}

export async function getRoleUsers(roleId: string) {
  return repo.getRoleUsers(roleId);
}

export async function getUsersByRoleName(roleName: string,orgId: string) {
  return repo.getUsersByRoleName(roleName, orgId);
}

export async function getRoleFunctions(roleId: string) {
  return repo.getRoleFunctions(roleId);
}

export async function getFunctions(roleId?: string) {
  return repo.getFunctions(roleId);
}

export async function updateRole(id: string, data: { role_display_name: string; description: string }) {
  return repo.updateRole(id, data);
}

export async function updateRoleFunctions(roleId: string, functionIds: number[]) {
  console.log(`PUT /api/roles/${roleId}/functions - function_ids:`, functionIds);
  return repo.updateRoleFunctions(roleId, functionIds);
}

export async function deleteRole(roleId: string) {
  const role = await repo.getRoleType(roleId);
  if (!role) {
    throw { status: 404, message: "Role not found" };
  }
  if (role.role_type === "System Role") {
    throw { status: 403, message: "System roles cannot be deleted" };
  }

  await repo.deleteRoleFunctionMappings(roleId);
  await repo.deleteUserRoleMappingsByRoleId(roleId);
  const rowCount = await repo.deleteRole(roleId);

  if (!rowCount) {
    throw { status: 500, message: "Failed to delete role" };
  }

  return { message: "Role deleted successfully" };
}

export async function getRoleDelegationsPaginated(params: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
}) {
  return repo.getRoleDelegationsPaginated(params);
}

export async function createRoleDelegation(data: {
  from_user: string;
  from_user_name: string;
  to_user: string;
  to_user_name: string;
  role_id?: string;
  from_date: string;
  to_date: string;
  status?: string;
  comments?: string;
}) {
  if (!data.from_user || !data.to_user || !data.from_date || !data.to_date) {
    throw { status: 400, message: "Missing required fields" };
  }

  const newId = await repo.getNextDelegationId();

  return repo.insertRoleDelegation({
    id: newId,
    ...data,
    status: data.status || 'Active'
  });
}

export async function updateRoleDelegation(id: string, data: any) {
  return repo.updateRoleDelegation(id, data);
}

export async function deleteRoleDelegation(id: string) {
  return repo.deleteRoleDelegation(id);
}

export async function getActiveUsersForApprovers() {
  return repo.getActiveUsersForApprovers();
}

export async function getOrgCurrencyForApprovers() {
  const currency = await repo.getOrgCurrencyForApprovers();
  return { currency };
}

export async function getApproversPaginated(params: {
  page: number;
  limit: number;
  search?: string;
}) {
  return repo.getApproversPaginated(params);
}

export async function createApprover(data: {
  entity_type?: string;
  from_amount?: number;
  to_amount?: number;
  user_id: number;
  user_fullname: string;
  currency?: string;
  approve_id?: string;
}) {
  if (!data.user_id) {
    throw { status: 400, message: "User is required" };
  }
  return repo.insertApprover({
    entity_type: data.entity_type || 'ALL',
    from_amount: data.from_amount || 0,
    to_amount: data.to_amount || 0,
    user_id: data.user_id,
    user_fullname: data.user_fullname,
    currency: data.currency || 'USD',
    approve_id: data.approve_id || null
  });
}

export async function updateApprover(id: string, data: {
  entity_type: string;
  from_amount: number;
  to_amount: number;
  user_id: number;
  user_fullname: string;
  currency: string;
  approve_id?: string;
}) {
  return repo.updateApprover(id, data);
}

export async function deleteApprover(id: string) {
  return repo.deleteApprover(id);
}

export async function getOrgById(id: number) {
  return repo.getOrgById(id);
}

export async function getUsersInRoleByEntity(roleName: string, orgId: number) {
  return repo.findUsersInRoleByEntity(roleName, orgId);
}

export async function getLoggedInUser(username: string) {
  return repo.getUserByUsername(username);
}
export function getUsersByEmail(email: string) {
  return repo.getUsersByEmail(email);
}

