import pkg from "pg";
import { uploadFileToAzure } from "../../services/azure-blob.service";
import { getContextPool } from "../../tenant-context";
import { ALLOWED_MIME_TYPES, pool, sanitizeFilename, validateUploadedFile } from "../_shared";
import { getWorkflowApprovalHistory as getHistoryFromVendors } from "../vendors/vendors.service";
import * as repo from "./vendor-registration.repository";
import * as adminRepo from "../administration/administration.repository.ts";
import {eventBus} from "../../services/eventBus";
import * as helper from "../_shared/helper-utils.ts";

const getPool = () => getContextPool() ?? pool;

const VENDOR_ROLES = ["ROLE_SUPPLIER_ADMIN", "ROLE_SUPPLIER_USER","ROLE_SUPERADMIN","ROLE_SYSADMIN","ROLE_PROCUREMENT_MANAGER","ROLE_PROCUREMENT_USER","ROLE_FINANCE_MANAGER","ROLE_FINANCE_OFFICER","ROLE_PROCUREMENT_OFFICER"];

function assertVendorRole(sessionUser: any) {
  if (!sessionUser) throw { status: 401, message: "Not authenticated" };
  if (!VENDOR_ROLES.includes(sessionUser.userRole)) throw { status: 403, message: "Access denied" };
}

function assertVendorWithSupplier(sessionUser: any) {
  assertVendorRole(sessionUser);
//  if (!sessionUser.supplierId) throw { status: 403, message: "Access denied" };
}

export async function getProfile(sessionUser: any) {
  assertVendorRole(sessionUser);

  if (!sessionUser.supplierId) {
    const org = await repo.getOrgDetails(parseInt(sessionUser.orgId));
    return {
      id: null,
      company_name: org?.organization_name || sessionUser.name || "",
      country: org?.org_country || "",
      email_id: org?.org_email || sessionUser.email || "",
      phone: org?.org_phone_no || "",
      status: "Draft"
    };
  }

  const profile = await repo.getSupplierProfile(parseInt(sessionUser.supplierId));
  if (!profile) throw { status: 404, message: "Vendor profile not found" };
  return profile;
}

export async function getStatus(sessionUser: any) {
  if (!sessionUser) throw { status: 401, message: "Not authenticated" };
  if (!sessionUser.supplierId) return { status: null };

  const row = await repo.getSupplierStatus(parseInt(sessionUser.supplierId));
  return {
    status: row?.status || null,
    companyName: row?.company_name || null
  };
}

export async function saveCompanyDetails(sessionUser: any, data: any, req: any) {
  assertVendorRole(sessionUser);

  let supplierId = sessionUser.supplierId;
  const modifiedBy = sessionUser.userName || sessionUser.email;

  let paymentTermsId: number | null = null;
  let paymentTermsDesc: string | null = data.payment_terms || null;
  if (data.payment_terms) {
    try {
      const pt = await repo.resolvePaymentTerms(parseInt(data.payment_terms));
      if (pt) {
        paymentTermsId = pt.id;
        paymentTermsDesc = pt.description;
      }
    } catch (_e) { }
  }

  let locations: string | null = null;
  try {
    const orgId = await repo.getOperatingUnitOrgId();
    if (orgId) locations = orgId + ',';
  } catch (_e) { }

  if (data.start_date && !data.bus_trading_date) {
    data.bus_trading_date = data.start_date;
  }

  const taxEligibility = 'Y';
  const taxRegNo = taxEligibility === 'Y' ? (data.tax_reg_no || null) : null;
  const taxCntry = taxEligibility === 'Y' ? (data.country || null) : null;
  const taxPayerId = taxEligibility === 'Y' ? (data.tax_payer_id || null) : null;
  const panNo = taxEligibility === 'Y' ? (data.pan_no || null) : null;
  const pAnnualRevenue = taxEligibility === 'Y' && data.p_annual_revenue ? parseFloat(data.p_annual_revenue) : null;
  const taxEffectiveDate = taxEligibility === 'Y' ? (data.tax_effective_date || null) : null;

  if (!supplierId) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      const newSupplierId = await repo.createSupplierTransaction(client, {
        sessionUser, data, modifiedBy,
        taxEligibility, taxRegNo, taxCntry, taxPayerId, panNo, pAnnualRevenue, taxEffectiveDate,
        paymentTermsDesc, paymentTermsId, locations,
      });

      await client.query('COMMIT');

      supplierId = String(newSupplierId);
      sessionUser.supplierId = supplierId;
      (req as any).session.user = sessionUser;
      await new Promise<void>((resolve, reject) => {
        (req as any).session.save((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return { success: true, message: "Supplier profile created successfully", supplierId: newSupplierId };
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  }

  const currentStatus = await repo.getSupplierStatus(parseInt(supplierId));
  const isApprovedVendor = ['Approved', 'Active', 'InActive'].includes(currentStatus?.status || '');
  const isChangesInDraft = currentStatus?.status === 'Changes In Draft' || currentStatus?.status === 'More Info Required';

  const needsPrevCopy = isApprovedVendor || (isChangesInDraft && !(await repo.hasOrgPrevValues(parseInt(supplierId))));

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    await repo.updateSupplierTransaction(client, {
      supplierId: parseInt(supplierId),
      data, modifiedBy,
      taxEligibility, taxRegNo, taxCntry, taxPayerId, panNo, pAnnualRevenue, taxEffectiveDate,
      paymentTermsDesc, paymentTermsId,
      isVendorSelfEdit: needsPrevCopy,
    });

    if (isChangesInDraft) {
      await client.query(`UPDATE dbo.supp_basic_org_dtls SET last_modified_by = $1, last_modified_date = CURRENT_TIMESTAMP WHERE id = $2`, [modifiedBy, parseInt(supplierId)]);
    }

    await client.query('COMMIT');
    if(currentStatus?.attribute_4 === 'Active' || currentStatus?.attribute_4 === 'Draft')
    {
      deleteReviewDocument(String(supplierId));
    }
    return { success: true, message: (isApprovedVendor || isChangesInDraft) ? "Changes saved. Submit for approval when ready." : "Company details saved successfully" };
  } catch (txError) {
    await client.query('ROLLBACK');
    throw txError;
  } finally {
    client.release();
  }
}

export async function getLookup(type: string) {
  switch (type) {
    case 'countries':
      return await repo.getLookupCountries();
    case 'supp-doc-types':
      return await repo.getLookupSuppDocTypes();
    case 'currencies':
      return await repo.getLookupCurrencies();
    case 'payment-terms':
      return await repo.getLookupPaymentTerms();
    case 'legal-entities':
      return await repo.getLookupLegalEntities();
    case 'enterprise-classifications':
      return await repo.getLookupEnterpriseClassifications();
    case 'working-days':
      return [
        { value: 'Monday', label: 'Monday' },
        { value: 'Tuesday', label: 'Tuesday' },
        { value: 'Wednesday', label: 'Wednesday' },
        { value: 'Thursday', label: 'Thursday' },
        { value: 'Friday', label: 'Friday' },
        { value: 'Saturday', label: 'Saturday' },
        { value: 'Sunday', label: 'Sunday' },
      ];
    case 'working-times': {
      const times: any[] = [];
      for (let h = 0; h < 24; h++) {
        for (const m of ['00', '30']) {
          const time = `${h.toString().padStart(2, '0')}:${m}`;
          times.push({ value: time, label: time });
        }
      }
      return times;
    }
    default:
      throw { status: 400, message: "Invalid lookup type" };
  }
}

export async function getContacts(sessionUser: any) {
  assertVendorRole(sessionUser);
  if (!sessionUser.supplierId) return [];
  return await repo.getContacts(parseInt(sessionUser.supplierId));
}

export async function createContact(sessionUser: any, data: any) {
  assertVendorWithSupplier(sessionUser);
  const supplierId = parseInt(sessionUser.supplierId);
  const currentStatus = await repo.getSupplierStatus(supplierId);
  const isApproved = ['Approved', 'Active', 'InActive'].includes(currentStatus?.status || '');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (isApproved) {
      await client.query(`UPDATE dbo.supp_basic_org_dtls SET status = 'Changes In Draft', last_modified_date = CURRENT_TIMESTAMP WHERE id = $1`, [supplierId]);
    }
    const result = await repo.createContact(parseInt(sessionUser.supplierId), data, sessionUser.userName, client);
    await client.query('COMMIT');
    if(currentStatus?.attribute_4 === 'Active' || currentStatus?.attribute_4 === 'Draft')
    {
      deleteReviewDocument(String(supplierId));
    }
    return result;
  } catch (txError) {
    await client.query('ROLLBACK');
    throw txError;
  } finally {
    client.release();
  }
}

export async function updateContact(sessionUser: any, contactId: string, data: any) {
  assertVendorWithSupplier(sessionUser);
  const supplierId = parseInt(sessionUser.supplierId);
  const currentStatus = await repo.getSupplierStatus(supplierId);
  const isApproved = ['Approved', 'Active', 'InActive'].includes(currentStatus?.status || '');
  const isChangesInDraft = currentStatus?.status === 'Changes In Draft';
  
  if (isApproved || isChangesInDraft) {
    const client = await getPool().connect();
    const needsPrevCopy = isApproved || (isChangesInDraft && !(await repo.hasContactPrevValues(supplierId)));
    
    try {
      await client.query('BEGIN');
      if (needsPrevCopy) {
        await repo.copyContactCurrentToPrev(client, supplierId);
      }
      if (isApproved) {
        await client.query(`UPDATE dbo.supp_basic_org_dtls SET status = 'Changes In Draft', last_modified_date = CURRENT_TIMESTAMP WHERE id = $1`, [supplierId]);
      }
      const result = await repo.updateContact(parseInt(contactId), supplierId, data, sessionUser.userName, client);
      await client.query('COMMIT');
      if (!result) throw { status: 404, message: "Contact not found" };
    if(currentStatus?.attribute_4 === 'Active' || currentStatus?.attribute_4 === 'Draft')
    {
      deleteReviewDocument(String(supplierId));
    }
      return result;
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  }
  const result = await repo.updateContact(parseInt(contactId), supplierId, data, sessionUser.userName);
  if (!result) throw { status: 404, message: "Contact not found" };
  return result;
}

export async function deleteContact(sessionUser: any, contactId: string) {
  assertVendorWithSupplier(sessionUser);
  const supplierId = parseInt(sessionUser.supplierId);
  const contactIdNum = parseInt(contactId);
  const isPrimary = await repo.isContactPrimary(contactIdNum);
  if (isPrimary) {
    const primaryCount = await repo.checkContactPrimaryCount(supplierId);
    if (primaryCount <= 1) {
      throw {
        status: 400,
        message: "At least one primary contact must exist!"
      };
    }
  }
  const currentStatus = await repo.getSupplierStatus(supplierId);
  const isApproved = ['Approved', 'Active', 'InActive'].includes(currentStatus?.status || '');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (isApproved) {
      await client.query(`UPDATE dbo.supp_basic_org_dtls SET status = 'Changes In Draft', last_modified_date = CURRENT_TIMESTAMP WHERE id = $1`, [supplierId]);
    }
    const result = await repo.deleteContact(contactIdNum, supplierId, client);
    await client.query('COMMIT');
    if(currentStatus?.attribute_4 === 'Active' || currentStatus?.attribute_4 === 'Draft')
    {
      deleteReviewDocument(String(supplierId));
    }
    return result;
  } catch (txError) {
    await client.query('ROLLBACK');
    throw txError;
  } finally {
    client.release();
  }
}

export async function getBankAccounts(sessionUser: any) {
  assertVendorRole(sessionUser);
  if (!sessionUser.supplierId) return [];
  return await repo.getBankAccounts(parseInt(sessionUser.supplierId));
}

export async function createBankAccount(sessionUser: any, data: any) {
  assertVendorWithSupplier(sessionUser);
  const supplierId = parseInt(sessionUser.supplierId);
  const currentStatus = await repo.getSupplierStatus(supplierId);
  const isApproved = ['Approved', 'Active', 'InActive'].includes(currentStatus?.status || '');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (data.primary_account === 'Y') {
      await repo.setPrimaryBankAccount(supplierId, undefined, client);
    }
    if (isApproved) {
      await client.query(`UPDATE dbo.supp_basic_org_dtls SET status = 'Changes In Draft', last_modified_date = CURRENT_TIMESTAMP WHERE id = $1`, [supplierId]);
    }
    const result = await repo.createBankAccount(parseInt(sessionUser.supplierId), data, sessionUser.userName, client);
    await client.query('COMMIT');
    if(currentStatus?.attribute_4 === 'Active' || currentStatus?.attribute_4 === 'Draft')
    {
      deleteReviewDocument(String(supplierId));
    }
    return result;
  } catch (txError) {
    await client.query('ROLLBACK');
    throw txError;
  } finally {
    client.release();
  }
}

export async function updateBankAccount(sessionUser: any, bankId: string, data: any, tenantPool?: pkg.Pool) {
  assertVendorWithSupplier(sessionUser);
  const supplierId = parseInt(sessionUser.supplierId);
  const currentStatus = await repo.getSupplierStatus(supplierId);
  const isApproved = ['Approved', 'Active', 'InActive'].includes(currentStatus?.status || '');
  const isChangesInDraft = currentStatus?.status === 'Changes In Draft';
  if (isApproved || isChangesInDraft) {
    const needsPrevCopy = isApproved || (isChangesInDraft && !(await repo.hasBankPrevValues(supplierId)));
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      if (needsPrevCopy) {
        await repo.copyBankCurrentToPrev(client, supplierId);
      }
      if (isApproved) {
        await client.query(`UPDATE dbo.supp_basic_org_dtls SET status = 'Changes In Draft', last_modified_date = CURRENT_TIMESTAMP WHERE id = $1`, [supplierId]);
      }
      if (data.primary_account === 'Y') {
        await repo.setPrimaryBankAccount(supplierId, parseInt(bankId), client);
      }
      if (data.primary_account === 'N') {
        const count = await repo.checkBankPrimaryCount(supplierId);
        if (count === 1) {
          throw { status: 400, message: "At least one primary bank account must exist!" };
        }
      }
      const result = await repo.updateBankAccount(parseInt(bankId), supplierId, data, sessionUser.userName, client);
      await client.query('COMMIT');
      if(currentStatus?.attribute_4 === 'Active' || currentStatus?.attribute_4 === 'Draft')
    {
      deleteReviewDocument(String(supplierId));
    }
      if (!result) throw { status: 404, message: "Bank account not found" };
      return result;
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  }
  if(currentStatus?.attribute_4 === 'Active' || currentStatus?.attribute_4 === 'Draft')
    {
      deleteReviewDocument(String(supplierId));
    }
  if (data.primary_account === 'Y') {
    await repo.setPrimaryBankAccount(supplierId, parseInt(bankId));
  }
  const result = await repo.updateBankAccount(parseInt(bankId), supplierId, data, sessionUser.userName);
  if (!result) throw { status: 404, message: "Bank account not found" };
  return result;
}

export async function deleteBankAccount(sessionUser: any, bankId: string) {
  assertVendorWithSupplier(sessionUser);
  const bankIdNum = parseInt(bankId);
  const isPrimary = await repo.isBankPrimary(bankIdNum);
  if (isPrimary) {
    throw {
      status: 400,
      message: "Primary bank account cannot be deleted!"
    };
  }
  const supplierId = parseInt(sessionUser.supplierId);
  const currentStatus = await repo.getSupplierStatus(supplierId);
  const isApproved = ['Approved', 'Active', 'InActive'].includes(currentStatus?.status || '');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (isApproved) {
      await client.query(`UPDATE dbo.supp_basic_org_dtls SET status = 'Changes In Draft', last_modified_date = CURRENT_TIMESTAMP WHERE id = $1`, [supplierId]);
    }
    await repo.deleteBankAccount(parseInt(bankId), parseInt(sessionUser.supplierId), client);
    await client.query('COMMIT');
    if(currentStatus?.attribute_4 === 'Active'|| currentStatus?.attribute_4 === 'Draft')
    {
      deleteReviewDocument(String(supplierId));
    }
    return { success: true };
  } catch (txError) {
    await client.query('ROLLBACK');
    throw txError;
  } finally {
    client.release();
  }
}

export async function submitChangesForApproval(sessionUser: any) {
  assertVendorWithSupplier(sessionUser);
  const supplierId = parseInt(sessionUser.supplierId);
  const username = sessionUser.userName || sessionUser.email || "system";

  const currentStatus = await repo.getSupplierStatus(supplierId);
  if (currentStatus?.status !== 'Changes In Draft') {
    throw { status: 400, message: "No draft changes to submit" };
  }

  const validationError = await repo.validateSupplierBeforeSubmit(supplierId);
  if (validationError) {
    throw { status: 400, message: validationError };
  }

  const suppObj = await repo.getSupplierWithOrg(supplierId);
  if (!suppObj) {
    throw { status: 404, message: "Supplier not found" };
  }
  const orgData = await adminRepo.getOrgDetails();

  const processName = "Vendor Registration";
  let taskSubject = `Update Supplier Registration Approval Request-${suppObj.company_name}`;
  if (taskSubject.length > 80) {
    taskSubject = taskSubject.substring(0, 80);
  }

  let organizationName = "";
  try {
    const userOrgCountry = suppObj.org_country || suppObj.country || "";
    if (userOrgCountry) {
      const orgByCountry = await repo.findInternalOrgByCountry(userOrgCountry);
      if (orgByCountry) {
        organizationName = orgByCountry.organization_name;
      }
    }
    if (!organizationName) {
      const mainOrg = await repo.getMainOrganization();
      organizationName = mainOrg?.organization_name || "";
    }
  } catch {
    const mainOrg = await repo.getMainOrganization();
    organizationName = mainOrg?.organization_name || "";
  }

  const userAttr13 = await repo.getUserAttribute13(supplierId);
  if (userAttr13) {
    organizationName = userAttr13;
  }

  const params: Record<string, any> = {
    subject: taskSubject,
    srmsRefNumber: String(supplierId),
    status: "Pending Approval",
    startDate: Date.now(),
    createdBy: sessionUser.name || username,
    organization: organizationName,
  };

  const { workflowService } = await import("../../services/workflowService");

  const checkApprList = await workflowService.getFirstStepApproversList(processName, params);
  if (!checkApprList || checkApprList.length === 0) {
    throw { status: 400, message: "Approver Hierarchy or Approval Flow is not defined for this request!" };
  }

  let taskId: string;
  try {
    taskId = await workflowService.startProcess(
      taskSubject, processName, String(supplierId), params, username
    );
  } catch (err: any) {
    if (err.status) throw err;
    throw { status: 400, message: err.message || "Failed to start approval workflow" };
  }

  const approversList = await workflowService.getApproversList(processName, params);

  await repo.submitRegistration(supplierId, username, taskId, approversList.join(", "));

  // Publish RegistrationSubmitEvent to notify the supplier
  try {
    const { eventBus } = await import("../../services/eventBus");
    const supplierEmail = suppObj.email_id || suppObj.email || sessionUser.email || "";
    const supplierName = suppObj.company_name || String(supplierId);
    if (supplierEmail) {
      const event: import("../../services/eventBus/events").RegistrationSubmitEvent = {
        eventType: 'REGISTRATION_SUBMIT',
        timestamp: new Date(),
        emailId: supplierEmail,
        userName: supplierName,
        orgLogoPath: orgData.org_logo_path,
      };
      eventBus.publish(event);
      console.log(`[submitChangesForApproval] Published REGISTRATION_SUBMIT event for supplier ${supplierId} (${supplierEmail})`);
    }
  } catch (e) {
    console.error("[submitChangesForApproval] Failed to publish RegistrationSubmitEvent:", e);
  }

  // Publish SUPP_APPR_INITIATOR to notify each first-step approver
  try {
    const { eventBus } = await import("../../services/eventBus");
    const supplierCompanyName = suppObj.company_name || String(supplierId);
    for (const approverEmail of checkApprList) {
      if (!approverEmail?.trim()) continue;

      // Look up the approver's name from um_user_dtls
      let approverName = approverEmail.trim(); // fallback to email if name not found
      try {
        const userResult = await getPool().query(
          `SELECT name FROM dbo.um_user_dtls WHERE LOWER(email_id) = LOWER($1) LIMIT 1`,
          [approverEmail.trim()]
        );
        if (userResult.rows[0]?.name) {
          approverName = userResult.rows[0].name;
        }
      } catch (lookupErr) {
        console.warn(`[submitChangesForApproval] Could not look up approver name for ${approverEmail}:`, lookupErr);
      }

      const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
      const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

      const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent('Vendor Registration')}&&taskId=${encodeURIComponent(taskId)}&&email=${encodeURIComponent(approverEmail.trim())}&&refnumber=${encodeURIComponent(supplierId)}`;
      const pdfData = await generatepdfReview(String(supplierId), approverName);
      if (!Buffer.isBuffer(pdfData)) {
        console.error(`[submitChangesForApproval] Failed to generate PDF: ${pdfData.message}`);
        continue;
      }

      const apprEvent: import("../../services/eventBus/events").SupplierApprInitiatorEvent = {
        eventType: 'SUPP_APPR_INITIATOR',
        timestamp: new Date(),
        receiverEmail: approverEmail.trim(),
        userName: approverName,
        companyName: supplierCompanyName,
        orgLogoPath: orgData.org_logo_path, 
        emailApprovalLink: approvalLink,
        attachments:[
          {
            filename: "Registration Summary.pdf",
            content: pdfData,
            contentType: "application/pdf",
          }
        ]
      };
      eventBus.publish(apprEvent);
      console.log(`[submitChangesForApproval] Published SUPP_APPR_INITIATOR event to approver ${approverEmail} (${approverName}) for supplier ${supplierId}`);
    }
  } catch (e) {
    console.error("[submitChangesForApproval] Failed to publish SUPP_APPR_INITIATOR event:", e);
  }

  return { success: true, message: "Successfully processed your request.", taskId, approvers: approversList };
}

export async function getScopeOfSupply(sessionUser: any) {
  assertVendorRole(sessionUser);
  if (!sessionUser.supplierId) return { categories: [], profile: {} };
  const [categories, serviceInfo] = await Promise.all([
    repo.getScopeOfSupply(parseInt(sessionUser.supplierId)),
    repo.getScopeServiceInfo(parseInt(sessionUser.supplierId)),
  ]);
  return { categories, serviceInfo };
}

export async function updateServiceInfo(sessionUser: any, data: any) {
  assertVendorWithSupplier(sessionUser);
  const supplierId = parseInt(sessionUser.supplierId);
  const currentStatus = await repo.getSupplierStatus(supplierId);
  const isApproved = ['Approved', 'Active', 'InActive'].includes(currentStatus?.status || '');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (isApproved) {
      await client.query(`UPDATE dbo.supp_basic_org_dtls SET status = 'Changes In Draft', last_modified_date = CURRENT_TIMESTAMP WHERE id = $1`, [supplierId]);
    }
    await repo.updateServiceInfo(parseInt(sessionUser.supplierId), data, sessionUser.userName, client);
    await client.query('COMMIT');
    if(currentStatus?.attribute_4 === 'Active' || currentStatus?.attribute_4 === 'Draft')
    {
      deleteReviewDocument(String(supplierId));
    }
    return { success: true };
  } catch (txError) {
    await client.query('ROLLBACK');
    throw txError;
  } finally {
    client.release();
  }
}

export async function addCategory(sessionUser: any, data: any) {
  assertVendorWithSupplier(sessionUser);
  const supplierId = parseInt(sessionUser.supplierId);
  const currentStatus = await repo.getSupplierStatus(supplierId);
  const isApproved = ['Approved', 'Active', 'InActive'].includes(currentStatus?.status || '');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (isApproved) {
      await client.query(`UPDATE dbo.supp_basic_org_dtls SET status = 'Changes In Draft', last_modified_date = CURRENT_TIMESTAMP WHERE id = $1`, [supplierId]);
    }
    const result = await repo.addCategory(parseInt(sessionUser.supplierId), data, sessionUser.userName, client);
    await client.query('COMMIT');
    if(currentStatus?.attribute_4 === 'Active' || currentStatus?.attribute_4 === 'Draft')
    {
      deleteReviewDocument(String(supplierId));
    }
    return result;
  } catch (txError) {
    await client.query('ROLLBACK');
    throw txError;
  } finally {
    client.release();
  }
}

export async function removeCategory(sessionUser: any, categoryId: string) {
  assertVendorWithSupplier(sessionUser);
  const supplierId = parseInt(sessionUser.supplierId);
  const currentStatus = await repo.getSupplierStatus(supplierId);
  const isApproved = ['Approved', 'Active', 'InActive'].includes(currentStatus?.status || '');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (isApproved) {
      await client.query(`UPDATE dbo.supp_basic_org_dtls SET status = 'Changes In Draft', last_modified_date = CURRENT_TIMESTAMP WHERE id = $1`, [supplierId]);
    }
    await repo.removeCategory(parseInt(categoryId), parseInt(sessionUser.supplierId), client);
    await client.query('COMMIT');
    if(currentStatus?.attribute_4 === 'Active' || currentStatus?.attribute_4 === 'Draft')
    {
      deleteReviewDocument(String(supplierId));
    }
    return { success: true };
  } catch (txError) {
    await client.query('ROLLBACK');
    throw txError;
  } finally {
    client.release();
  }
}

export async function getVendorCategories(level?: string, parentCode?: string) {
  return await repo.getCategories(level, parentCode);
}

export async function getDocuments(sessionUser: any) {
  assertVendorRole(sessionUser);
  if (!sessionUser.supplierId) return [];
  const rows = await repo.getDocuments(parseInt(sessionUser.supplierId));
  return rows.map((row: any) => ({
    ...row,
    doc_uri: row.doc_uri ? Buffer.from(row.doc_uri).toString('base64') : null,
  }));
}

export async function uploadDocument(sessionUser: any, data: any, uploadedFile?: Express.Multer.File, tenant?: string, tenantPool?: pkg.Pool) {
  assertVendorWithSupplier(sessionUser);
  const supplierId = parseInt(sessionUser.supplierId);

  // Cap preview at 512 KB — large bytea inserts cause DB connections to appear idle/hang
  const MAX_DOC_URI_BYTES = 512 * 1024;
  const rawDocUri = data.doc_uri ? Buffer.from(data.doc_uri, 'base64') : null;
  const docUriBuffer = rawDocUri && rawDocUri.length > MAX_DOC_URI_BYTES ? null : rawDocUri;

  if (uploadedFile) {
    const validation = validateUploadedFile(uploadedFile);
    if (!validation.valid) {
      throw { status: 400, message: validation.error };
    }
  }

  const rawFilename = uploadedFile?.originalname || data.filename || 'document';
  const filename = sanitizeFilename(rawFilename);
  const filetype = uploadedFile?.mimetype || data.filetype || (filename?.match(/\.(pdf)$/i) ? 'application/pdf' : filename?.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg' : filename?.match(/\.(png)$/i) ? 'image/png' : null);

  let docPath: string | null = null;
  if (uploadedFile) {
    docPath = await uploadFileToAzure(uploadedFile.buffer, `SUPPLIERS/${supplierId}`, filename, uploadedFile.mimetype, tenant);
  }

  const existing = await repo.findExistingDocument(supplierId, data.doc_type, data.doc_no, tenantPool);
  let row;
  if (existing) {
    row = await repo.updateDocument(existing.id, supplierId, {
      docName: data.doc_name || filename, docNo: data.doc_no || '', docDesc: data.doc_desc || '',
      filename, expiryDate: data.expiry_date || null, docUri: docUriBuffer, filetype,
      docPath, modifiedBy: sessionUser.userName,
    }, tenantPool);
  } else {
    row = await repo.insertDocument(supplierId, {
      docName: data.doc_name || filename, docType: data.doc_type, docNo: data.doc_no || '', docDesc: data.doc_desc || '',
      filename, filetype, expiryDate: data.expiry_date || null, docUri: docUriBuffer,
      docPath, createdBy: sessionUser.userName,
    }, tenantPool);
  }
  const currentStatus = await repo.getSupplierStatus(supplierId);
  const isApproved = ['Approved', 'Active', 'InActive'].includes(currentStatus?.status || '');
  if (isApproved) {
    await getPool().query(`UPDATE dbo.supp_basic_org_dtls SET status = 'Changes In Draft', last_modified_date = CURRENT_TIMESTAMP WHERE id = $1`, [supplierId]);
  }
  row.doc_uri = row.doc_uri ? Buffer.from(row.doc_uri).toString('base64') : null;
  if(data.doc_type !== 'Review Document' && (currentStatus?.attribute_4 === 'Active' || currentStatus?.attribute_4 === 'Draft'))
  {
    deleteReviewDocument(String(supplierId));
  }
  return row;
}

export async function linkBankingDocumentToBankAccount(
  sessionUser: any,
  docId: string,
  bankId: string,
  tenantPool?: pkg.Pool,
) {
  assertVendorWithSupplier(sessionUser);
  const supplierId = parseInt(sessionUser.supplierId);
  const parsedDocId = parseInt(docId, 10);
  const parsedBankId = parseInt(bankId, 10);
  if (!Number.isFinite(parsedDocId) || !Number.isFinite(parsedBankId)) {
    throw { status: 400, message: "Invalid document or bank account id" };
  }
  const row = await repo.linkSupplierBankDocumentToAccount(
    parsedDocId,
    supplierId,
    parsedBankId,
    sessionUser.userName || sessionUser.email || "system",
    tenantPool,
  );
  if (!row) {
    throw { status: 404, message: "Document not found, already linked, or bank account not found" };
  }
  return {
    ...row,
    doc_uri: row.doc_uri ? Buffer.from(row.doc_uri).toString("base64") : null,
  };
}

export async function deleteDocument(sessionUser: any, docId: string) {
  assertVendorWithSupplier(sessionUser);
  await repo.softDeleteDocument(parseInt(docId), parseInt(sessionUser.supplierId));
  return { success: true };
}

export async function downloadDocument(sessionUser: any, docId: string) {
  assertVendorWithSupplier(sessionUser);
  const doc = await repo.getDocumentForDownload(parseInt(docId), parseInt(sessionUser.supplierId));
  if (!doc) throw { status: 404, message: "Document not found" };
  if (!doc.doc_path) throw { status: 404, message: "No file available for download" };

  const allowedDownloadMimes = new Set(Object.keys(ALLOWED_MIME_TYPES));
  allowedDownloadMimes.add('application/octet-stream');
  const mimeType = doc.filetype && allowedDownloadMimes.has(doc.filetype) ? doc.filetype : 'application/octet-stream';
  const filename = sanitizeFilename(doc.filename || 'document');

  return { blobUrl: doc.doc_path, mimeType, filename };
}

export function getDocumentTypes() {
  return [
    { value: "tradelicense", label: "Trade License" },
    { value: "commercemembership", label: "Chamber of Commerce Membership" },
    { value: "vatcertificate", label: "VAT Certificate" },
    { value: "companyprofile", label: "Company Profile" },
    { value: "memorandum", label: "Memorandum of Association" },
    { value: "listofemployees", label: "List of Employees" },
    { value: "attroney", label: "Power of Attorney" },
  ];
}

export async function getReferences(sessionUser: any) {
  assertVendorWithSupplier(sessionUser);
  return await repo.getReferences(parseInt(sessionUser.supplierId));
}

export async function createReference(sessionUser: any, data: any) {
  assertVendorWithSupplier(sessionUser);
  if (!data.ref_company_name || !data.contact_name) {
    throw { status: 400, message: "Company name and contact name are required" };
  }
  const supplierId = parseInt(sessionUser.supplierId);
  const currentStatus = await repo.getSupplierStatus(supplierId);
  const isApproved = ['Approved', 'Active', 'InActive'].includes(currentStatus?.status || '');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (isApproved) {
      await client.query(`UPDATE dbo.supp_basic_org_dtls SET status = 'Changes In Draft', last_modified_date = CURRENT_TIMESTAMP WHERE id = $1`, [supplierId]);
    }
    const result = await repo.createReference(parseInt(sessionUser.supplierId), data, sessionUser.userName, client);
    await client.query('COMMIT');
    if(currentStatus?.attribute_4 === 'Active' || currentStatus?.attribute_4 === 'Draft')
    {
      deleteReviewDocument(String(supplierId));
    }
    return result;
  } catch (txError) {
    await client.query('ROLLBACK');
    throw txError;
  } finally {
    client.release();
  }
}

export async function updateReference(sessionUser: any, refId: string, data: any) {
  assertVendorWithSupplier(sessionUser);
  const supplierId = parseInt(sessionUser.supplierId);
  const currentStatus = await repo.getSupplierStatus(supplierId);
  const isApproved = ['Approved', 'Active', 'InActive'].includes(currentStatus?.status || '');
  const isChangesInDraft = currentStatus?.status === 'Changes In Draft';
  if (isApproved || isChangesInDraft) {
    const needsPrevCopy = isApproved || (isChangesInDraft && !(await repo.hasRefPrevValues(supplierId)));
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      if (needsPrevCopy) {
        await repo.copyRefCurrentToPrev(client, supplierId);
      }
      if (isApproved) {
        await client.query(`UPDATE dbo.supp_basic_org_dtls SET status = 'Changes In Draft', last_modified_date = CURRENT_TIMESTAMP WHERE id = $1`, [supplierId]);
      }
      const result = await repo.updateReference(parseInt(refId), parseInt(sessionUser.supplierId), data, sessionUser.userName, client);
      await client.query('COMMIT');
      if (!result) throw { status: 404, message: "Reference not found" };
      if(currentStatus?.attribute_4 === 'Active' || currentStatus?.attribute_4 === 'Draft')
      {
        deleteReviewDocument(String(supplierId));
      }
      return result;
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  }
}

export async function deleteReference(sessionUser: any, refId: string) {
  assertVendorWithSupplier(sessionUser);
  const supplierId = parseInt(sessionUser.supplierId);
  const currentStatus = await repo.getSupplierStatus(supplierId);
  const isApproved = ['Approved', 'Active', 'InActive'].includes(currentStatus?.status || '');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (isApproved) {
      await client.query(`UPDATE dbo.supp_basic_org_dtls SET status = 'Changes In Draft', last_modified_date = CURRENT_TIMESTAMP WHERE id = $1`, [supplierId]);
    }
    await repo.softDeleteReference(parseInt(refId), parseInt(sessionUser.supplierId), sessionUser.userName, client);
    await client.query('COMMIT');
    if(currentStatus?.attribute_4 === 'Active' || currentStatus?.attribute_4 === 'Draft')
    {
      deleteReviewDocument(String(supplierId));
    }
    return { success: true };
  } catch (txError) {
    await client.query('ROLLBACK');
    throw txError;
  } finally {
    client.release();
  }
}

export async function getRegistrationSummary(sessionUser: any) {
  assertVendorWithSupplier(sessionUser);
  const summary = await repo.getRegistrationSummary(parseInt(sessionUser.supplierId));
  summary.documents = summary.documents.map((row: any) => ({
    ...row,
    doc_uri: row.doc_uri ? Buffer.from(row.doc_uri).toString('base64') : null,
  }));
  return summary;
}

export async function getWorkflowApprovalHistory(sessionUser: any) {
  assertVendorWithSupplier(sessionUser);
  return await getHistoryFromVendors(Number(sessionUser.supplierId));
}

export async function resetDraftSupplierRegistration(sessionUser: any): Promise<{ profileReset: boolean }> {
  assertVendorRole(sessionUser);
  if (!sessionUser.supplierId) {
    return { profileReset: false };
  }
  const supplierId = parseInt(String(sessionUser.supplierId), 10);
  if (Number.isNaN(supplierId)) {
    return { profileReset: false };
  }
  const row = await repo.getSupplierStatus(supplierId);
  if (!row || String(row.status || "").trim() !== "Draft") {
    return { profileReset: false };
  }
  const orgIdNum = parseInt(String(sessionUser.orgId ?? ""), 10);
  const org = Number.isFinite(orgIdNum) ? await repo.getOrgDetails(orgIdNum) : null;
  const defaultCompany =
    (org?.organization_name || sessionUser.name || row.company_name || "").trim() || String(row.company_name || "").trim();
  const modifiedBy = sessionUser.userName || sessionUser.email || "system";
  await repo.resetDraftSupplierData(supplierId, defaultCompany, modifiedBy);
  return { profileReset: true };
}


export async function submitRegistration(sessionUser: any) {
  assertVendorWithSupplier(sessionUser);
  const supplierId = parseInt(sessionUser.supplierId);
  const username = sessionUser.userName || sessionUser.email || "system";
  const orgData = await adminRepo.getOrgDetails();
  const validationError = await repo.validateSupplierBeforeSubmit(supplierId);
  if (validationError) {
    throw { status: 400, message: validationError };
  }

  const suppObj = await repo.getSupplierWithOrg(supplierId);
  if (!suppObj) {
    throw { status: 404, message: "Supplier not found" };
  }

  const processName = "Vendor Registration";
  let taskSubject = `Vendor Registration Approval Request-${suppObj.company_name}`;
  if (taskSubject.length > 80) {
    taskSubject = taskSubject.substring(0, 80);
  }

  // Organization lookup: try findInternalOrgByCountry first, fallback to main org
  let organizationName = "";
  try {
    const userOrgCountry = suppObj.org_country || suppObj.country || "";
    if (userOrgCountry) {
      const orgByCountry = await repo.findInternalOrgByCountry(userOrgCountry);
      if (orgByCountry) {
        organizationName = orgByCountry.organization_name;
      }
    }
    if (!organizationName) {
      const mainOrg = await repo.getMainOrganization();
      organizationName = mainOrg?.organization_name || "";
    }
  } catch {
    const mainOrg = await repo.getMainOrganization();
    organizationName = mainOrg?.organization_name || "";
  }

  // Override with user's attribute13 if set (matches Java: uObj.getAttribute13())
  const userAttr13 = await repo.getUserAttribute13(supplierId);
  if (userAttr13) {
    organizationName = userAttr13;
  }

  const params: Record<string, any> = {
    subject: taskSubject,
    srmsRefNumber: String(supplierId),
    status: "Pending Approval",
    startDate: Date.now(),
    createdBy: sessionUser.name || username,
    organization: organizationName,
  };

  const { workflowService } = await import("../../services/workflowService");

  const checkApprList = await workflowService.getFirstStepApproversList(processName, params);

  const approverEmail = checkApprList?.[0];

  let approverName = approverEmail.trim(); // fallback to email

    try {
      const userResult = await getPool().query(
          `SELECT name FROM dbo.um_user_dtls WHERE LOWER(email_id) = LOWER($1) LIMIT 1`,
          [approverEmail.trim()]
      );

      if (userResult.rows[0]?.name) {
        approverName = userResult.rows[0].name;
      }
    } catch (lookupErr) {
      console.warn(
          `[submitChangesForApproval] Could not look up approver name for ${approverEmail}:`,
          lookupErr
      );
    }
  
  if (!checkApprList || checkApprList.length === 0) {
    throw { status: 400, message: "Approver Hierarchy or Approval Flow is not defined for this request!" };
  }

  let taskId: string;
  try {
    taskId = await workflowService.startProcess(
      taskSubject, processName, String(supplierId), params, username
    );
  } catch (err: any) {
    if (err.status) throw err;
    throw { status: 400, message: err.message || "Failed to start approval workflow" };
  }

  const approversList = await workflowService.getApproversList(processName, params);

  await repo.submitRegistration(supplierId, username, taskId, approversList.join(", "));

  const attrRow = await getPool().query(
    `SELECT attribute_4 FROM dbo.supp_basic_org_dtls WHERE id = $1`,
    [supplierId],
  );
  const currentAttr4 = String(attrRow.rows[0]?.attribute_4 || "").trim();
  if (currentAttr4 !== "Active") {
    await repo.updateSupplierAttribute4(supplierId, "Draft", username);
  }
  
  // Publish RegistrationSubmitEvent to notify the supplier
  try 
  {
    const { eventBus } = await import("../../services/eventBus");
    const supplierEmail = suppObj.email_id || suppObj.email || sessionUser.email || "";
    const supplierName = suppObj.company_name || String(supplierId);
    // apiKeymodulename taskid approverEmail 
        if (supplierEmail) {
      const event: import("../../services/eventBus/events").RegistrationSubmitEvent = {
        eventType: 'REGISTRATION_SUBMIT',
        timestamp: new Date(),
        emailId: supplierEmail,
        userName: supplierName,
        orgLogoPath: orgData.org_logo_path,
      };
      eventBus.publish(event);
      console.log(`[submitRegistration] Published REGISTRATION_SUBMIT event for supplier ${supplierId} (${supplierEmail})`);
    }

    const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
    const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);

    const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}
       &&module=${encodeURIComponent('Vendor Registration')}&&taskId=${encodeURIComponent(taskId)}&&email=${encodeURIComponent(approverEmail.trim())}
       &&refnumber=${encodeURIComponent(supplierId)}`;

    const byteData = await generatepdfReview(String(supplierId),supplierName);
    if (!Buffer.isBuffer(byteData)) {
      throw new Error(`Failed to generate PDF: ${byteData.message}`);
    }
    const apprEvent: import("../../services/eventBus/events").SupplierApprInitiatorEvent = {
      eventType: 'SUPP_APPR_INITIATOR',
      timestamp: new Date(),
      receiverEmail: approverEmail.trim(),
      userName: approverName,
      companyName: suppObj.company_name,
      orgLogoPath: orgData.org_logo_path,
      emailApprovalLink:approvalLink,
      attachments:[
        {
          filename: "Registration Summary.pdf",
          content: byteData,
          contentType: "application/pdf",
        }
      ],
    };
  eventBus.publish(apprEvent);
  } 
  catch (e) 
  {
    console.error("[submitRegistration] Failed to publish RegistrationSubmitEvent:", e);
  }

  return { success: true, message: "Successfully processed your request.", taskId, approvers: approversList };
}
export async function generatepdfReview(suppId: string,userName:string) 
{
   const data = await helper.generatepdfReview(suppId,"supplier",userName);
   return data;
}

export async function deleteReviewDocument(suppId: string)
{
  try
  {
   await repo.deleteReviewDocument(suppId);
   }
   catch(error)
   {
    console.error(error);
   }
}