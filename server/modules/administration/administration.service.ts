import { date } from "drizzle-orm/mysql-core";
import { generatePdfPreview } from "../_shared";
import * as repo from "./administration.repository";
import { getTemplateRowsWithColumnValuesForEvent } from "../auctions/repositories/auctionEvents.repository";
import * as suppservice from "../vendors/vendors.service";
import * as bidservice from "../bids/bids.service";
import * as invservice from "../invoices/invoices.service";
import * as procservice from "../procurement/procurement.service";
import * as budgetservice from "../budgets/budgets.service";
import * as aucservice from "../auctions/services/auctionEvents.service";
import * as contractservice from "../contracts/contracts.controller";
import { pool } from "../_shared";
import { getContextPool } from "../../tenant-context";
const getPool = () => getContextPool() ?? pool;

import { eventBus } from "server/services/eventBus";
import { EventTypes, RequestDelegationEvent } from "server/services/eventBus/events";
import { log } from "console";
export function normalizeAuditVendorTerminology<T extends { audit_message?: string | null; audit_key?: string | null }>(
  row: T,
): T {
  const normalizeText = (text: string) =>
    text
      .replace(/\bVendors\b/g, "Suppliers")
      .replace(/\bvendors\b/g, "suppliers")
      .replace(/\bVendor\b/g, "Supplier")
      .replace(/\bvendor\b/g, "supplier");

  return {
    ...row,
    ...(row.audit_message != null ? { audit_message: normalizeText(row.audit_message) } : {}),
    ...(row.audit_key != null ? { audit_key: normalizeText(row.audit_key) } : {}),
  };
}

export async function getAuditLogs(params: {
  page: number;
  limit: number;
  search?: string;
  module?: string;
  action?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const result = await repo.getAuditLogs(params);
  return {
    data: result.data.map(normalizeAuditVendorTerminology),
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: Math.ceil(result.total / result.limit) }
  };
}

export async function getAuditLogModules() {
  return repo.getAuditLogModules();
}

export async function getAuditLogActions() {
  return repo.getAuditLogActions();
}

export async function getAuditLogStats() {
  return repo.getAuditLogStats();
}

export async function getAuditLogsForKey(key: string) {
  const logs = await repo.getAuditLogsForKey(key);
  return logs.map(normalizeAuditVendorTerminology);
}

export async function getRecentActivity(userId: string) {
  const activity = await repo.getRecentActivity(userId);
  return activity.map(normalizeAuditVendorTerminology);
}

export async function logAudit(data: {
  auditKey: string;
  auditAction: string;
  auditMessage: string;
  fullName: string;
  userId: string;
  module: string;
}) {
  return repo.createAuditLog(data);
}

export async function logAuditTxn(data: {
  auditKey: string;
  auditAction: string;
  auditDate: Date;
  auditMessage: string;
  fullName: string;
  userId: string;
  module: string;
}) {
  return repo.createAuditLogTxn(data);
}

export async function getOrganizations() {
  return repo.getOrganizations();
}

export async function getOrgDetails() {
  const org = await repo.getOrgDetails();
  if (!org) return null;
  if (org.org_logo_path) {
    if (Buffer.isBuffer(org.org_logo_path)) {
      // bytea column — decode raw bytes back to the original data URL string
      org.org_logo_path = org.org_logo_path.toString('utf-8');
    } else if (typeof org.org_logo_path === 'string' && org.org_logo_path.startsWith('\\x')) {
      // text column stored via bytea cast — PostgreSQL hex-encoded the value (\x646174…)
      // decode the hex back to the original data URL string
      org.org_logo_path = Buffer.from(org.org_logo_path.slice(2), 'hex').toString('utf-8');
    }
    // otherwise it's already a plain data URL string — use as-is
  }
  return org;
}

export async function updateOrgDetails(id: string, data: any) {
  return repo.updateOrgDetails(id, data);
}

export async function updateChatBotDetails(id: string, data: string) {
  return repo.updateChatBotDetails(id, data);
}

export async function uploadOrgLogo(file: Express.Multer.File) {
  const base64 = file.buffer.toString("base64");
  const dataUrl = `data:${file.mimetype};base64,${base64}`;
  return repo.updateOrgLogo(dataUrl);
}

export async function clearOrgLogo() {
  return repo.clearOrgLogo();
}

export async function getSubsidiaries() {
  return repo.getSubsidiaries();
}

export async function createSubsidiary(data: any) {
  const nextId = await repo.getNextOrgId();
  return repo.createSubsidiary(nextId, data);
}

export async function updateSubsidiary(id: string, data: any) {
  return repo.updateSubsidiary(id, data);
}

export async function deleteSubsidiary(id: string) {
  const deleted = await repo.deleteSubsidiary(id);
  if (!deleted) throw { status: 404, message: "Subsidiary not found" };
  return { success: true, id: deleted.id };
}

export async function getLocations() {
  return repo.getLocations();
}

export async function createLocation(data: any) {
  if (!data.location_name || data.location_name.trim() === '') {
    throw { status: 400, message: "Location name is required" };
  }
  if (!data.billto_address || data.billto_address.trim() === '') {
    throw { status: 400, message: "Billing address is required" };
  }
  if (!data.shipto_address || data.shipto_address.trim() === '') {
    throw { status: 400, message: "Shipping address is required" };
  }
  const nextId = await repo.getNextLocationId();
  const locationId = `LOC${nextId}`;
  return repo.createLocation(nextId, locationId, data);
}

export async function updateLocation(id: string, data: any) {
  if (!data.location_name || data.location_name.trim() === '') {
    throw { status: 400, message: "Location name is required" };
  }
  if (!data.billto_address || data.billto_address.trim() === '') {
    throw { status: 400, message: "Billing address is required" };
  }
  if (!data.shipto_address || data.shipto_address.trim() === '') {
    throw { status: 400, message: "Shipping address is required" };
  }
  return repo.updateLocation(id, data);
}

export async function deleteLocation(id: string) {
  return repo.deleteLocation(id);
}

export async function updateLocationStatus(id: string, status: string) {
  return repo.updateLocationStatus(id, status);
}

export async function getLookups(page: number, limit: number, search: string) {
  const result = await repo.getLookups(page, limit, search);
  return {
    data: result.data,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: Math.ceil(result.total / result.limit) }
  };
}

export async function createLookup(data: any) {
  if (!data.property_name || data.property_name.trim() === '') {
    throw { status: 400, message: "Property name is required" };
  }
  if (!data.lookup_key || data.lookup_key.trim() === '') {
    throw { status: 400, message: "Key is required" };
  }
  if (!data.lookup_value || data.lookup_value.trim() === '') {
    throw { status: 400, message: "Value is required" };
  }
  if (!data.description || data.description.trim() === '') {
    throw { status: 400, message: "Description is required" };
  }
  const nextId = await repo.getNextLookupId();
  const result = await repo.createLookup(nextId, data);
  const prop = String(data.property_name || "").toUpperCase();
  if (prop === "DELETED_FUNCTION" || prop === "DELETE_FUNCTION") {
    const { clearDeleteFunctionCache } = await import("../_shared/delete-guard");
    clearDeleteFunctionCache();
  }
  return result;
}

export async function updateLookup(id: string, data: any) {
  if (!data.property_name || data.property_name.trim() === '') {
    throw { status: 400, message: "Property name is required" };
  }
  if (!data.lookup_key || data.lookup_key.trim() === '') {
    throw { status: 400, message: "Key is required" };
  }
  if (!data.lookup_value || data.lookup_value.trim() === '') {
    throw { status: 400, message: "Value is required" };
  }
  if (!data.description || data.description.trim() === '') {
    throw { status: 400, message: "Description is required" };
  }
  const result = await repo.updateLookup(id, data);
  const prop = String(data.property_name || "").toUpperCase();
  if (prop === "DELETED_FUNCTION" || prop === "DELETE_FUNCTION") {
    const { clearDeleteFunctionCache } = await import("../_shared/delete-guard");
    clearDeleteFunctionCache();
  }
  return result;
}

export async function getLookupsByProperty(propertyKey: string) {
  return repo.getLookupsByProperty(propertyKey);
}

export async function deleteLookup(id: string) {
  const result = await repo.deleteLookup(id);
  const { clearDeleteFunctionCache } = await import("../_shared/delete-guard");
  clearDeleteFunctionCache();
  return result;
}

export async function updateLookupStatus(id: string, status: string) {
  const result = await repo.updateLookupStatus(id, status);
  const { clearDeleteFunctionCache } = await import("../_shared/delete-guard");
  clearDeleteFunctionCache();
  return result;
}

export async function getPaymentTerms(page: number, limit: number, search: string) {
  const result = await repo.getPaymentTerms(page, limit, search);
  return {
    data: result.data,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: Math.ceil(result.total / result.limit) }
  };
}

export async function createPaymentTerm(data: any) {
  if (!data.terms_name || data.terms_name.trim() === '') {
    throw { status: 400, message: "Terms name is required" };
  }
  if (!data.description || data.description.trim() === '') {
    throw { status: 400, message: "Description is required" };
  }
  const nextId = await repo.getNextPaymentTermId();
  const prefix = await repo.getPaymentTermPrefixValue();
  const paymentTermId = prefix ? `${prefix}_${String(nextId).padStart(5, '0')}` : String(nextId);
  return repo.createPaymentTerm(nextId, { ...data, payment_term_id: paymentTermId });
}

export async function updatePaymentTerm(id: string, data: any) {
  if (!data.terms_name || data.terms_name.trim() === '') {
    throw { status: 400, message: "Terms name is required" };
  }
  if (!data.description || data.description.trim() === '') {
    throw { status: 400, message: "Description is required" };
  }
  return repo.updatePaymentTerm(id, data);
}

export async function deletePaymentTerm(id: string) {
  return repo.deletePaymentTerm(id);
}

export async function updatePaymentTermStatus(id: string, status: string) {
  return repo.updatePaymentTermStatus(id, status);
}

export async function getTaxes(page: number, limit: number, search: string) {
  const result = await repo.getTaxes(page, limit, search);
  return {
    data: result.data,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: Math.ceil(result.total / result.limit) }
  };
}

export async function createTax(data: any) {
  if (!data.tax_code || data.tax_code.trim() === '') {
    throw { status: 400, message: "Tax code is required" };
  }
  if (!data.tax_code_desc || data.tax_code_desc.trim() === '') {
    throw { status: 400, message: "Description is required" };
  }
  if (data.tax_rate === undefined || data.tax_rate === '') {
    throw { status: 400, message: "Tax rate is required" };
  }
  if (!data.tax_type || data.tax_type.trim() === '') {
    throw { status: 400, message: "Tax type is required" };
  }
  const nextId = await repo.getNextTaxId();
  const prefix = await repo.getTaxPrefixValue();
  const taxCodeId = prefix ? `${prefix}_${String(nextId).padStart(5, '0')}` : String(nextId);
  return repo.createTax(nextId, { ...data, tax_code_id: taxCodeId });
}

export async function updateTax(id: string, data: any) {
  if (!data.tax_code || data.tax_code.trim() === '') {
    throw { status: 400, message: "Tax code is required" };
  }
  if (!data.tax_code_desc || data.tax_code_desc.trim() === '') {
    throw { status: 400, message: "Description is required" };
  }
  if (data.tax_rate === undefined || data.tax_rate === '') {
    throw { status: 400, message: "Tax rate is required" };
  }
  if (!data.tax_type || data.tax_type.trim() === '') {
    throw { status: 400, message: "Tax type is required" };
  }
  return repo.updateTax(id, data);
}

export async function deleteTax(id: string) {
  return repo.deleteTax(id);
}

export async function updateTaxStatus(id: string, status: string) {
  return repo.updateTaxStatus(id, status);
}

export async function getPrefixes(page: number, limit: number, search: string) {
  const result = await repo.getPrefixes(page, limit, search);
  return {
    data: result.data,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: Math.ceil(result.total / result.limit) }
  };
}

export async function createPrefix(data: any) {
  if (!data.prefix_name || data.prefix_name.trim() === '') {
    throw { status: 400, message: "Prefix name is required" };
  }
  if (!data.prefix_value || data.prefix_value.trim() === '') {
    throw { status: 400, message: "Prefix value is required" };
  }
  if (!data.prefix_key || data.prefix_key.trim() === '') {
    throw { status: 400, message: "Prefix key is required" };
  }
  return repo.createPrefix(data);
}

export async function updatePrefix(id: string, data: any) {
  if (!data.prefix_name || data.prefix_name.trim() === '') {
    throw { status: 400, message: "Prefix name is required" };
  }
  if (!data.prefix_value || data.prefix_value.trim() === '') {
    throw { status: 400, message: "Prefix value is required" };
  }
  if (!data.prefix_key || data.prefix_key.trim() === '') {
    throw { status: 400, message: "Prefix key is required" };
  }
  return repo.updatePrefix(id, data);
}

export async function deletePrefix(id: string) {
  return repo.deletePrefix(id);
}

export async function updatePrefixStatus(id: string, status: string) {
  return repo.updatePrefixStatus(id, status);
}

export async function getTermsConditions(page: number, limit: number, search: string | undefined) {
  const result = await repo.getTermsConditions(page, limit, search);
  return {
    data: result.data,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: Math.ceil(result.total / result.limit) }
  };
}

export async function getTermsConditionsByModuleName(moduleName: string) {
  if (!moduleName || moduleName.trim() === '') {
    throw { status: 400, message: "Module name is required" };
  }
  return repo.getTermsConditionsByModuleName(moduleName);
}

export async function createTermsCondition(data: any, user: any) {
  const userName = user?.user_name || user.email_id;
  if (!data.module_name || data.module_name.trim() === '') {
    throw { status: 400, message: "Module name is required" };
  }
  if (!data.tnc_text || data.tnc_text.trim() === '') {
    throw { status: 400, message: "Terms text is required" };
  }
  return repo.createTermsCondition(data, userName);
}

export async function updateTermsCondition(id: string, data: any) {
  if (!data.module_name || data.module_name.trim() === '') {
    throw { status: 400, message: "Module name is required" };
  }
  if (!data.tnc_text || data.tnc_text.trim() === '') {
    throw { status: 400, message: "Terms text is required" };
  }
  return repo.updateTermsCondition(id, data);
}

export async function deleteTermsCondition(id: string) {
  return repo.deleteTermsCondition(id);
}

export async function updateTermsConditionStatus(id: string, status: string) {
  return repo.updateTermsConditionStatus(id, status);
}

export async function getTermsConditionModules() {
  return repo.getTermsConditionModules();
}

export async function getTermsConditionDocument(tncId: string) {
  const doc = await repo.getTermsConditionDocument(tncId);
  if (doc) {
    return { ...doc, preview_image: doc.doc_path || null };
  }
  return null;
}

export async function uploadTermsConditionDocument(tncId: string, file: Express.Multer.File) {
  const moduleName = await repo.getTncModuleName(tncId);
  const docName = `${moduleName} Terms and Condition Document`;

  let previewImage: string | null = null;
  if (file.mimetype === 'application/pdf') {
    previewImage = await generatePdfPreview(file.buffer);
  }

  const existingDoc = await repo.getExistingTncDocument(tncId);
  const base64Data = file.buffer.toString('base64');

  if (existingDoc) {
    await repo.updateTncDocument(existingDoc.id, docName, file.originalname, file.mimetype, base64Data, previewImage);
    return { success: true, updated: true };
  } else {
    const newDocId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 10000);
    await repo.createTncDocument(newDocId, docName, file.originalname, file.mimetype, tncId, base64Data, previewImage);
    return { success: true, created: true };
  }
}

export async function deleteTermsConditionDocument(tncId: string) {
  return repo.deleteTncDocument(tncId);
}

export async function getSetupNotifications(page: number, limit: number, search: string | undefined) {
  const result = await repo.getSetupNotifications(page, limit, search);
  return {
    data: result.data,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: Math.ceil(result.total / result.limit) }
  };
}

export async function createSetupNotification(data: any) {
  if (!data.event_id || !data.event_name) {
    throw { status: 400, message: "Event ID and Event Name are required" };
  }
  const prefix = await repo.getNotificationPrefixValue();
  const nextId = await repo.getNextNotificationId();
  const notificationId = `${prefix}${nextId.toString().padStart(6, '0')}`;
  return repo.createSetupNotification(notificationId, data);
}

export async function updateSetupNotification(id: string, data: any) {
  return repo.updateSetupNotification(id, data);
}

export async function deleteSetupNotification(id: string) {
  return repo.deleteSetupNotification(id);
}

export async function getCostCenters(page: number, limit: number, search: string | undefined) {
  const result = await repo.getCostCenters(page, limit, search);
  return {
    data: result.data,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: Math.ceil(result.total / result.limit) }
  };
}

export async function createCostCenter(data: any) {
  if (!data.segment_type || data.segment_type.trim() === '') {
    throw { status: 400, message: "Segment type is required" };
  }
  return repo.createCostCenter(data);
}

export async function updateCostCenter(id: string, data: any) {
  if (!data.segment_type || data.segment_type.trim() === '') {
    throw { status: 400, message: "Segment type is required" };
  }
  return repo.updateCostCenter(id, data);
}

export async function deleteCostCenter(id: string) {
  const count = await repo.getCostCenterDetailCount(id);
  if (count > 0) {
    throw { status: 400, message: "Cannot delete segment type with existing items. Please delete all items first." };
  }
  return repo.deleteCostCenter(id);
}

export async function updateCostCenterStatus(id: string, status: string) {
  return repo.updateCostCenterStatus(id, status);
}

export async function getCostCenterItems(segmentId: string, page: number, limit: number, search: string | undefined) {
  const result = await repo.getCostCenterItems(segmentId, page, limit, search);
  return {
    data: result.data,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: Math.ceil(result.total / result.limit) }
  };
}

export async function createCostCenterItem(segmentId: string, data: any) {
  if (!data.code || data.code.trim() === '') {
    throw { status: 400, message: "Code is required" };
  }
  if (!data.value || data.value.trim() === '') {
    throw { status: 400, message: "Value is required" };
  }
  return repo.createCostCenterItem(segmentId, data);
}

export async function updateCostCenterItem(id: string, data: any) {
  if (!data.code || data.code.trim() === '') {
    throw { status: 400, message: "Code is required" };
  }
  if (!data.value || data.value.trim() === '') {
    throw { status: 400, message: "Value is required" };
  }
  return repo.updateCostCenterItem(id, data);
}

export async function deleteCostCenterItem(id: string) {
  return repo.deleteCostCenterItem(id);
}

export async function updateCostCenterItemStatus(id: string, status: string) {
  return repo.updateCostCenterItemStatus(id, status);
}

export async function getWorkflowDefinitions() {
  return repo.getWorkflowDefinitions();
}

export async function getWorkflowOrganizations() {
  return repo.getWorkflowOrganizations();
}

export async function getWorkflowDepartments() {
  return repo.getWorkflowDepartments();
}

export async function getWorkflowUsers() {
  return repo.getWorkflowUsers();
}

export async function getWorkflowRoles() {
  return repo.getWorkflowRoles();
}

export async function getWorkflowDetail(id: string) {
  const wf = await repo.getWorkflowDefinition(id);
  if (!wf) return null;
  const steps = await repo.getWorkflowSteps(id);
  return { ...wf, steps };
}

export async function createWorkflowStep(wfDefinitionId: string, data: any) {
  const nextOrder = await repo.getNextStepOrder(wfDefinitionId);
  const step = await repo.createWorkflowStep(data.name, nextOrder, data.step_type, wfDefinitionId);

  if (data.assignments && data.assignments.length > 0) {
    for (const assignment of data.assignments) {
      await repo.createStepAssignment(step.id, assignment);
    }
  }

  return repo.getStepWithAssignments(step.id);
}

export async function updateWorkflowStep(wfId: string, stepId: string, data: any) {
  await repo.updateWorkflowStep(stepId, data.name, data.step_type);

  const definition = await repo.getWorkflowDefinition(wfId);


  if (data.assignments !== undefined) {
    const taskCount = await repo.getTaskCountByStepId(parseInt(stepId));
    if(data.type.toLowerCase() === 'delete') {
      if (taskCount > 0) {
       throw { status: 500, message: "Error - Unable to update the step because there are pending tasks for this step. Please complete them before updating the step." };
      }
      await repo.deleteStepAssignmentById(data.assignments[0].id);
    }
    else if(data.type.toLowerCase() === 'update') {
      const step = await repo.getStepWithAssignments(parseInt(stepId));
      if (taskCount > 0) {
       throw { status: 500, message: "Error - Unable to update the step because there are pending tasks for this step. Please complete them before updating the step." };
      }else if(data.assignments[0].id !== undefined && data.assignments[0].id !== null){
        const assignment = await repo.getStepAssignment(parseInt(data.assignments[0].id));
        if(assignment && assignment.assignment_expression !== data.assignments[0].assignment_expression){
         const msg = await repo.updateApprovers(definition.name.toLowerCase(), assignment.assignment_expression, data.assignments[0].assignment_expression);
         if(msg !== "Approvers updated successfully"){
          throw { status: 500, message: msg };
         }
        }
      }
      await repo.updateStepAssignments(stepId, data.assignments);
    }else if(data.type.toLowerCase() === 'add') {
      if (data.assignments && data.assignments.length > 0) {
        for (const assignment of data.assignments) {
          await repo.createStepAssignment(parseInt(stepId), assignment);
        }
      }
    }
    
  }
  return repo.getStepWithAssignments(parseInt(stepId));
}

export async function deleteWorkflowStepAssignment(assignmentId: string) {
  return repo.deleteStepAssignmentById(assignmentId);
}

export async function deleteWorkflowStep(wfId: string, stepId: string) {
  const stepOrder = await repo.getStepOrder(stepId);
  if (stepOrder === null) {
    throw { status: 404, message: "Step not found" };
  }

  await repo.deleteStepAssignments(stepId);
  await repo.deleteWorkflowStep(stepId);
  await repo.reorderStepsAfterDelete(wfId, stepOrder);
}

export async function reorderWorkflowSteps(wfDefinitionId: string, stepIds: number[]) {
  for (let i = 0; i < stepIds.length; i++) {
    await repo.reorderStep(stepIds[i], i + 1, wfDefinitionId);
  }
}

export async function startWorkflowProcess(user: any, data: any) {
  if (!user) {
    throw { status: 401, message: "User not authenticated" };
  }
  const { workflowService } = await import("../../services/workflowService");
  const taskId = await workflowService.startProcess(
    data.subject,
    data.processName,
    data.refNumber,
    data.params || {},
    user.user_name || user.email_id
  );
  return taskId;
}

export async function completeWorkflowTask(user: any, data: any) {
  if (!user) {
    throw { status: 401, message: "User not authenticated" };
  }
  if (!["Approve", "Reject", "ReSubmit", "More"].includes(data.result)) {
    throw { status: 400, message: "Invalid result. Must be Approve, Reject, ReSubmit, or More" };
  }
  const userDetails = await repo.getUserDetails(user.id);
  const username = userDetails?.user_name || userDetails?.email_id;
  if (!username) {
    throw { status: 400, message: "Could not determine user identity" };
  }
  const userRoles = await repo.getUserRoles(user.id);
  const { workflowService } = await import("../../services/workflowService");
  const newTaskId = await workflowService.completeTask(
    data.taskId,
    data.result,
    data.remarks || "",
    username,
    userRoles
  );
  const orgData = await repo.getOrgDetails();
  if (newTaskId) {
    const { publishTaskAssignmentEvent } = await import("../../services/eventBus/publishTaskAssignment");
    publishTaskAssignmentEvent({
      taskId: newTaskId,
      templateEventId: "TASK_ASSIGNMENT",
      submittedBy: username,
      variables: {
        orgLogoPath: orgData.org_logo_path,
      },
    });
  }
  return newTaskId;
}

export async function getMyTasks(user: any) {
  if (!user) {
    throw { status: 401, message: "User not authenticated" };
  }
  const userDetails = await repo.getUserDetails(user.id);
  const { workflowService } = await import("../../services/workflowService");
  return workflowService.getMyTasks(userDetails?.user_name || userDetails?.email_id, userDetails?.email_id);
}

export async function getGroupTasks(user: any) {
  if (!user) {
    throw { status: 401, message: "User not authenticated" };
  }
  const roleNames = await repo.getUserRoles(user.id);
  const { workflowService } = await import("../../services/workflowService");
  return workflowService.getGroupTasks(roleNames);
}

export async function claimTask(user: any, taskId: string) {
  if (!user) {
    throw { status: 401, message: "User not authenticated" };
  }
  const userRoles = await repo.getUserRoles(user.id);
  const { workflowService } = await import("../../services/workflowService");
  await workflowService.claimTask(taskId, user.user_name || user.email_id, userRoles);
}

export async function getTaskHistory(refNumber: string) {
  const { workflowService } = await import("../../services/workflowService");
  return workflowService.getTaskHistory(refNumber);
}

export async function getTaskDetail(taskId: string) {
  return repo.getTaskById(taskId);
}

export async function getAIServiceSettings() {
  return repo.getAIServiceSettings();
}

const AI_VENDOR_INTELLIGENCE = "AI_VENDOR_INTELLIGENCE";
const AI_VENDOR_DOC_ANALYSIS = "AI_VENDOR_DOC_ANALYSIS";
const AI_VENDOR_COMPLIANCE = "AI_VENDOR_COMPLIANCE";

export async function updateAIServiceSetting(featureKey: string, isEnabled: boolean, updatedBy: string) {
  if (
    isEnabled &&
    (featureKey === AI_VENDOR_DOC_ANALYSIS || featureKey === AI_VENDOR_COMPLIANCE)
  ) {
    const settings = await repo.getAIServiceSettings();
    const vi = (settings as { feature_key: string; is_enabled: boolean }[]).find(
      (s) => s.feature_key === AI_VENDOR_INTELLIGENCE,
    );
    if (!vi?.is_enabled) {
      const err = new Error(
        "Enable AI Vendor Intelligence before enabling AI Document Analysis or AI Compliance Check.",
      ) as Error & { status: number };
      err.status = 400;
      throw err;
    }
  }

  const result = await repo.updateAIServiceSetting(featureKey, isEnabled, updatedBy);

  if (featureKey === AI_VENDOR_INTELLIGENCE && !isEnabled) {
    await repo.updateAIServiceSetting(AI_VENDOR_DOC_ANALYSIS, false, updatedBy);
    await repo.updateAIServiceSetting(AI_VENDOR_COMPLIANCE, false, updatedBy);
  }

  return result;
}

export async function bulkUpdateAIServiceSettings(isEnabled: boolean, updatedBy: string) {
  return repo.bulkUpdateAIServiceSettings(isEnabled, updatedBy);
}

export async function getAIModelConfigs() {
  return repo.getAIModelConfigs();
}

export async function getActiveAIModelConfig() {
  return repo.getActiveAIModelConfig(false);
}

export async function getActiveAIModelConfigWithSecrets() {
  return repo.getActiveAIModelConfig(true);
}

export async function updateAIModelConfig(providerKey: string, data: { apiBaseUrl?: string; apiKey?: string; modelName?: string }, updatedBy: string) {
  const result = await repo.updateAIModelConfig(providerKey, data, updatedBy);
  const { clearAIClientCache } = await import("../../services/ai-client");
  clearAIClientCache();
  return result;
}

export async function activateAIModelConfig(providerKey: string, updatedBy: string) {
  const result = await repo.activateAIModelConfig(providerKey, updatedBy);
  const { clearAIClientCache } = await import("../../services/ai-client");
  clearAIClientCache();
  return result;
}

export async function disconnectAIModelConfig(providerKey: string, updatedBy: string) {
  const result = await repo.disconnectAIModelConfig(providerKey, updatedBy);
  const { clearAIClientCache } = await import("../../services/ai-client");
  clearAIClientCache();
  return result;
}

export async function testAIModelConnection(providerKey: string) {
  const config = await repo.testAIModelConnection(providerKey);
  if (!config) return { success: false, message: "Provider not found" };

  const isSelfHosted = config.provider_type === "self_hosted";

  if (!config.api_key && !isSelfHosted) {
    return { success: false, message: "API key not configured. Please save your API key first, then test the connection." };
  }

  try {
    if (config.provider_key === "anthropic") {
      const AnthropicSDK = (await import("@anthropic-ai/sdk")).default;
      const anthropicClient = new AnthropicSDK({
        apiKey: config.api_key,
        ...(config.api_base_url ? { baseURL: config.api_base_url } : {}),
      });
      const response = await anthropicClient.messages.create({
        model: config.model_name || "claude-haiku-4-5-20251001",
        max_tokens: 5,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
      });
      const reply = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
      return { success: true, message: `Connection successful. Model responded: "${reply}"` };
    }

    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey: config.api_key || "none",
      baseURL: config.api_base_url || undefined,
    });
    const response = await client.chat.completions.create({
      model: config.model_name || "gpt-4o-mini",
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      max_tokens: 5,
    });
    const reply = response.choices?.[0]?.message?.content?.trim();
    return { success: true, message: `Connection successful. Model responded: "${reply}"` };
  } catch (error: any) {
    return { success: false, message: error?.message || "Connection failed" };
  }
}

type UsageResult =
  | { type: "credits"; totalGranted: number; totalUsed: number; totalAvailable: number; percentageRemaining: number; currency: string }
  | { type: "tokens"; tokensTotal: number; tokensThisMonth: number; tokensToday: number; requestCount: number }
  | { type: "unavailable"; message: string }
  | { type: "error"; message: string };

async function tryOpenAICreditGrants(apiKey: string): Promise<UsageResult | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/dashboard/billing/credit_grants", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const grants = await res.json();
    if (!grants.total_granted) return null;
    return {
      type: "credits",
      totalGranted: grants.total_granted,
      totalUsed: grants.total_used,
      totalAvailable: grants.total_available,
      percentageRemaining: Math.round((grants.total_available / grants.total_granted) * 100),
      currency: "USD",
    };
  } catch {
    return null;
  }
}

export async function getAIModelUsage(providerKey: string): Promise<UsageResult> {
  const config = await repo.getAIModelForUsage(providerKey);
  if (!config) return { type: "unavailable", message: "Provider not found" };

  // For OpenAI trial accounts: show credit percentage if available
  if (config.provider_key === "openai" && config.api_key) {
    const credits = await tryOpenAICreditGrants(config.api_key);
    if (credits) return credits;
  }

  // All providers: return internal token stats accumulated from actual AI calls
  const stats = await repo.getAIUsageStats(providerKey);
  return {
    type: "tokens",
    tokensTotal: Number(stats.tokens_total),
    tokensThisMonth: Number(stats.tokens_month),
    tokensToday: Number(stats.tokens_today),
    requestCount: Number(stats.requests_month),
  };
}

export async function getAIModelUsageSummary(providerKey: string) {
  const daily = await repo.getAIUsageDailyStats(providerKey);
  return {
    daily: daily.map((r) => ({
      // Already a 'YYYY-MM-DD' string from the repository — do not round-trip it
      // through a JS Date, which would shift the day across the UTC boundary.
      day: String(r.day).slice(0, 10),
      prompt_tokens: Number(r.prompt_tokens),
      completion_tokens: Number(r.completion_tokens),
      total_tokens: Number(r.total_tokens),
      requests: Number(r.requests),
    })),
  };
}

export async function resetAIModelUsage(providerKey: string) {
  await repo.resetAIUsageLogs(providerKey);
}

export const getTermsAndConditionsByIds = async (tncIds: number[]) => {
  return repo.getTnCByIds(tncIds);
};

function normalizeExchangeCurrency(code: string) {
  const c = String(code || "").trim().toUpperCase();
  if (c.length < 3 || c.length > 12) {
    throw { status: 400, message: "Currency codes must be between 3 and 12 characters (ISO style)." };
  }
  return c;
}

export async function getExchangeRatesLatestPairs(page: number, limit: number, search: string) {
  const result = await repo.getExchangeRatePairsLatest(page, limit, search || "");
  const totalPages = Math.max(1, Math.ceil(result.total / result.limit) || 1);
  return {
    data: result.data,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages },
  };
}

export async function getExchangeRateHistory(fromCurrency: string, toCurrency: string) {
  if (!fromCurrency?.trim() || !toCurrency?.trim()) {
    throw { status: 400, message: "From and to currency are required" };
  }
  return repo.getExchangeRateHistory(fromCurrency, toCurrency);
}

export async function createExchangeRate(data: any, createdBy: string) {
  const from_currency = normalizeExchangeCurrency(data.from_currency);
  const to_currency = normalizeExchangeCurrency(data.to_currency);
  if (from_currency === to_currency) {
    throw { status: 400, message: "From and to currency must be different" };
  }
  const conversion_rate = Number(data.conversion_rate);
  if (!Number.isFinite(conversion_rate) || conversion_rate <= 0) {
    throw { status: 400, message: "Conversion rate must be a positive number" };
  }
  const allowed = await repo.getBaseCurrencyLookupCodes();
  if (!allowed.length) {
    throw {
      status: 400,
      message: "No BASE_CURRENCY lookup entries found. Add currencies under Lookups (property BASE_CURRENCY) first.",
    };
  }
  if (!allowed.includes(from_currency) || !allowed.includes(to_currency)) {
    throw {
      status: 400,
      message: "From and To must be values from the BASE_CURRENCY lookup.",
    };
  }
  return await repo.createExchangeRateRow({
    from_currency,
    to_currency,
    conversion_rate,
    created_by: createdBy || "SYSTEM",
  });
}

export async function updateExchangeRate(id: string, data: any, _updatedBy: string) {
  const conversion_rate = Number(data.conversion_rate);
  if (!Number.isFinite(conversion_rate) || conversion_rate <= 0) {
    throw { status: 400, message: "Conversion rate must be a positive number" };
  }
  const row = await repo.updateExchangeRateRow(id, { conversion_rate });
  if (!row) {
    throw { status: 404, message: "Exchange rate record not found" };
  }
  return row;
}

export async function deleteExchangeRate(id: string) {
  const deleted = await repo.deleteExchangeRate(id);
  if (!deleted) throw { status: 404, message: "Exchange rate record not found" };
  return { success: true, id: deleted.id };
}

export async function saveWfQuestions(formQuesData: any[],username:string) 
{
   const msg = await repo.saveWfQuestions(formQuesData,username);
   return msg;
}
export async function getWfQuestionByModuleName(moduleName: string) 
{
  const data = await repo.getWfQuestionByModuleName(moduleName);
  return data;
}

export async function getResponseByRefNum(refNum: string, history: boolean)
{
  const data = await repo.getResponseByRefNum(refNum, history);
  return data;
}

export async function saveWfQuestionsResponse(formQuesData: any[], username: any) 
{
  const data = await repo.saveWfQuestionsResponse(formQuesData,username);
  return data;
}

export async function deleteQuestionbyId(quesid: string) 
{
  const data = await repo.deleteQuestionbyId(quesid);
  return data;
}
export async function enableordisablechecklist(id: string, listStatus: string, username: any) 
{
  const data = await repo.enableordisablechecklist(id,listStatus,username); 
  return data;
}

export async function approveTaskFromEmail(body: any) 
{
  const apiKey = await repo.getApiKey();
  const data = await repo.getTaskStatusByTaskId(body.taskId);
  const reqUser =await repo.getUserByEmail(body.approveremail);
  let result;
  if(body.approveremail.includes("ROLE_"))
  {
    return "Error - Please login into Protal to approve the task due to it is role based approval";
  }
  else if(apiKey !== body.apikey)
  {
    return "Error - API key validation is failed";
  }
  else if(data !== 'Ready')
  {
    return "Error - Task is not in Ready state or task is already completed";
  }
  if(reqUser)
  {
    if(body.module.includes("Vendor Registration"))
    {
      result = await suppservice.processRegistrationApprovalStep(body.refnumber,body,reqUser);
      if(result?.success)
      {
      return "Successfully approved the task";
      }
      else
      {
        return "Error - Failed to approved the task";  
      }
    }
    else if(body.module.includes("Bid"))
    {
      result = await bidservice.processAwardApproval(body.taskId,body.result,body.comments,body.refnumber,reqUser);
      if(result.success)
      {
      return "Successfully approved the task";
      }
      else
      {
        return "Error - Failed to approved the task";  
      }
    }
    else if(body.module.includes("PR"))
    {
      result = await procservice.processRequisitionApproval(body.refnumber,body,reqUser);
      if(result.success)
      {
      return "Successfully approved the task";
      }
      else
      {
        return "Error - Failed to approved the task";  
      }
    }
    else if(body.module.includes("PO"))
    {
      result = await procservice.processPoApproval(body.refnumber,body,reqUser);
      if(result.success)
      {
      return "Successfully approved the task";
      }
      else
      {
        return "Error - Failed to approved the task";  
      }
    }
    else if(body.module.includes("contract"))
    {
     
    }
    else if(body.module.includes("Invoice"))
    {
      result = await invservice.processInvoiceApproval(body.refnumber,body,reqUser);
      if(result.success)
      {
      return "Successfully approved the task";
      }
      else
      {
        return "Error - Failed to approved the task";  
      }
    }
    else if(body.module.includes("auction"))
    {
      if(body.module.includes("auction partial"))
      {
        result = await aucservice.processAwardApprPartial(body.taskId,body.result,body.comments,body.refnumber,"",reqUser);
      }
      else if(body.module.includes("auction"))
      {
        result = await aucservice.processAwardAppr(body.taskId,body.result,body.comments,body.refnumber,"",reqUser);
      }
      if(result?.includes("Successfully"))
      {
      return "Successfully approved the task";
      }
      else
      {
        return "Error - Failed to approved the task";  
      }
    }
    else if(body.module.includes("Budget"))
    {
      result = await budgetservice.processApproval(body.refnumber,body,reqUser);
      if(result.success)
      {
        return "Successfully approved the task";
      }
      else
      {
        return "Error - Failed to approved the task";  
      }
    }
  }
  else 
  {
    return "Error - User not found";
  }
}

export async function delegateRequest(body: any, sessionUser: any) {
  const { workflowService } = await import("../../services/workflowService");
  const { suppRegApprRepo } = await import("../vendor-registration/vendor-register-appr-hst.repository");
   const {
    taskId,
    userName,
    comments,
    entityId,
    module
  } = body;

  if(!taskId || !userName || !entityId || !module) {
    throw { status: 400, message: "Please fill in all mandatory fields" };
  }

    const currentUser = await repo.getUserDetails(sessionUser.id);

    const workflowSteps = await workflowService.findByTaskId(taskId);

    let originalAssignee: string = "";
    let referenceNumber = "";
    let originalEmail: string = "";
    let originalName: string = "";

    if (workflowSteps.length > 0) {
      const step = workflowSteps[0];
      originalAssignee = step.current_assignee;
      referenceNumber = step.ref_number; 
    }
    const delegatedUser = await repo.getUserDetailsByUsername(userName);
    if (!delegatedUser) {
      throw {
        status: 400,
        message: `Could not find an active approver matching "${userName}". Please choose a valid approver.`,
      };
    }
    if (originalAssignee) {
      const originalUser = await repo.getUserDetailsByUsername(originalAssignee);

      if (originalAssignee.startsWith("ROLE_") && !originalUser) {
          originalEmail = originalAssignee;
          originalName = originalAssignee;
      } else {
        originalEmail = originalUser?.email_id ?? null;
        originalName = originalUser?.name ?? null;
      }
      const delegatedEmail = delegatedUser.email_id;

      const approverList = await repo.getApproversList(module, entityId);

      if (approverList.rows.length > 0) {
        let approversList = approverList.rows[0]?.approvers_list as string;
        if ( (!approversList ||approversList==="" ) && module.toLocaleUpperCase() === "INVOICE") {
          approversList = approverList.rows[0]?.invoice_approvers as string;
        }
        if (originalAssignee.startsWith("ROLE_")) {
          approversList = approversList.replace(originalAssignee, delegatedUser.name);
        } else {
          approversList = approversList.replace(originalName, delegatedUser.name);
        }

        await repo.updateApproversList(module, entityId, approversList);
      }
    }
    await workflowService.updateOwnerOfRequest(taskId, userName);
    await workflowService.updateTaskOwnerOfRequest(taskId, userName);

    await logAudit({
      auditKey: entityId,
      auditMessage: `Request delegated to ${userName}`,
      auditAction: "Request Delegation",
      fullName: currentUser.name,
      userId: currentUser.id,
      module: module.toLocaleUpperCase()
    });

    const supplierId = module.toLocaleUpperCase() === "SUPPLIER" ? entityId : 0;

    await suppRegApprRepo.saveSuppRegApprHstDtls({
      objectId: entityId,
      attribute1: module.toLocaleUpperCase(),
      supplierId,
      comments,
      approverId: currentUser.id,
      approverName: currentUser.name,
      email: currentUser.email_id,
      attribute9: currentUser.email_id,
      attribute10: currentUser.designation,
      status: "Delegation",
      creationDate: new Date(),
      createdBy: currentUser.id,
      requestedDate: new Date(),
      approvedDate: new Date(),
      action: "Request Delegation",
      remarks: `Request delegated to ${userName}, ${delegatedUser.name}`,

    });

    if (
      originalAssignee &&
      originalAssignee.toLocaleLowerCase() !== currentUser.user_name.toLocaleLowerCase()
    ) {

      await suppRegApprRepo.saveSuppRegApprHstDtls({
        objectId: entityId,
        attribute1: module.toLocaleUpperCase(),
        supplierId,
        comments,
        approverId: delegatedUser.id,
        approverName: delegatedUser.name,
        email: delegatedUser.email_id,
        attribute9: delegatedUser.email_id,
        attribute10: delegatedUser.designation,
        status: "Delegated User",
        requestedDate: new Date(),
        approvedDate: new Date(),
        action: "Delegated User",
        remarks: `Role delegated to ${userName}, ${delegatedUser.name}`,
      });
    }
    const orgData = await repo.getOrgDetails();
    const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=$1`,[taskId]);
    const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
    const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

    if(!approverEmail || !appUrl || !apiKey || !approverEmail.rows[0].current_assignee || !appUrl.rows[0].prop_value || !apiKey.rows[0].prop_value)
    {
      log("Error - Failed to generate Approval Link for request delegation due to some internal error");
    }
    let approvalModule = module;
    if(module.toLocaleUpperCase() === "SUPPLIER")
    {
      approvalModule = "Vendor Registration";
    }
    else if(module.toLocaleUpperCase() === "INVOICE")
    {
      approvalModule = "Invoice";
    }
    else if(module.toLocaleUpperCase() === "PR")
    {
      approvalModule = "PR";
    }
    else if(module.toLocaleUpperCase() === "PO")
    {
      approvalModule = "PO";
    }
    else if(module.toLocaleUpperCase() === "BUDGET")
    {
      approvalModule = "Budget";
    }
    else if(module.toLocaleUpperCase() === "BID")
    {
      approvalModule = "Bid";
    }

    const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent(approvalModule)}&&taskId=${encodeURIComponent(taskId)}&&email=${encodeURIComponent(approverEmail.rows[0].current_assignee)}&&refnumber=${encodeURIComponent(entityId)}`;
    
    const event: RequestDelegationEvent = {
      domain: sessionUser.domain,
      eventType: EventTypes.REQUEST_DELEGATION,
      module: module.toLocaleUpperCase(),
      entityId,
      delegatedEmail: delegatedUser.email_id,
      user: delegatedUser.name,
      originalEmail: originalEmail,
      orgLogoPath: orgData.org_logo_path,
      actionByUser: currentUser.name,
      emailApprovalLink: approvalLink,
    };
    eventBus.publish(event);

  return { success: true, message: "Request delegated successfully" };

}