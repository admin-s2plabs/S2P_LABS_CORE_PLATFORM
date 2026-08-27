import * as repo from "./invoices.repository";
import * as procurementRepo from "../procurement/procurement.repository";
import { sanitizeFilename } from "../_shared/file-upload";
import { pool } from "../../db";
import { getContextPool } from "../../tenant-context";
import { eventBus } from "../../services/eventBus";
import { EventTypes } from "../../services/eventBus/events";
import { publishTaskAssignmentEvent } from "../../services/eventBus/publishTaskAssignment";
const getPool = () => getContextPool() ?? pool;
import * as adminRepo from "../administration/administration.repository.ts";

/** Budget impact of an invoice (matches NON-PO reservation at approval). */
function getInvoiceBudgetTotal(invoice: {
  invoice_amount?: unknown;
  tax_amount?: unknown;
  invoice_source?: string | null;
}) {
  const invoiceAmount = parseFloat(String(invoice.invoice_amount ?? 0)) || 0;
  const taxAmount = parseFloat(String(invoice.tax_amount ?? 0)) || 0;
  // NON-PO header invoice_amount already includes line tax; tax_amount is breakdown only.
  if (invoice.invoice_source === "NON-PO") {
    return invoiceAmount + taxAmount;
  }
  return invoiceAmount + taxAmount;
}

function parseBudgetLineId(budgetSegment: string | number | null | undefined): number | null {
  if (budgetSegment == null || String(budgetSegment).trim() === "") return null;
  const budgetLineId = parseInt(String(budgetSegment), 10);
  return Number.isNaN(budgetLineId) ? null : budgetLineId;
}

function hasRequiredValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return true;
}

function validateNonPoInvoiceSubmission(invoice: Record<string, any>) {
  const requiredFields = [
    { field: "supplier_name", label: "Supplier" },
    { field: "department_name", label: "Department" },
    { field: "org_id", label: "Business entity" },
    { field: "invoice_number", label: "Invoice number" },
    { field: "invoice_date", label: "Invoice date" },
    { field: "invoice_type", label: "Invoice type" },
    { field: "invoice_curr_code", label: "Currency" },
    { field: "description", label: "Description" },
    { field: "invoice_reason", label: "Reason for non-PO" },
    { field: "budget_segment", label: "Budget" },
    { field: "budget_name", label: "Budget name" },
    { field: "payment_terms_name", label: "Payment terms" },
  ];

  const missingFields = requiredFields.filter(({ field }) => !hasRequiredValue(invoice[field])).map(({ label }) => label);

  if (missingFields.length > 0) {
    throw {
      status: 400,
      message: `Please fill all required fields before submission. Missing: ${missingFields.join(", ")}`,
    };
  }
}

async function assertNonPoBudgetAvailable(
  budgetSegment: string | number | null | undefined,
  amount: number
) {
  const budgetLineId = parseBudgetLineId(budgetSegment);
  if (!budgetLineId || amount <= 0) return;

  const budgetLineResult = await getPool().query(
    `SELECT amount, consumed_amount, reserved_amount FROM dbo.am_budget_lines WHERE id = $1`,
    [budgetLineId]
  );
  const budgetLine = budgetLineResult.rows[0];
  if (!budgetLine) return;

  const total = parseFloat(budgetLine.amount) || 0;
  const consumed = parseFloat(budgetLine.consumed_amount) || 0;
  const reserved = parseFloat(budgetLine.reserved_amount) || 0;
  const availableBudget = Math.max(0, total - consumed - reserved);
  if (amount > availableBudget) {
    throw {
      status: 400,
      message: `Invoice amount (${amount.toFixed(2)}) exceeds the available budget (${availableBudget.toFixed(2)}). Please reduce the invoice amount or select a different budget.`,
    };
  }
}

/** Reserve budget when a NON-PO invoice is approved (matches PR/PO reservation pattern). */
async function reserveNonPoInvoiceBudget(budgetSegment: string | number | null | undefined, amount: number) {
  const budgetLineId = parseBudgetLineId(budgetSegment);
  if (!budgetLineId || amount <= 0) return;

  await assertNonPoBudgetAvailable(budgetSegment, amount);
  await procurementRepo.reserveBudgetLineAmount(budgetLineId, amount);
  const budgetMstId = await procurementRepo.getBudgetMstIdFromLineId(budgetLineId);
  if (budgetMstId) {
    await procurementRepo.updateBudgetMstReservedAmount(budgetMstId);
  }
  console.log(`[Non-PO Invoice] Reserved ${amount} on budget line ${budgetLineId}`);
}

/** Release NON-PO invoice reservation when rejected before payment. */
async function releaseNonPoInvoiceBudget(budgetSegment: string | number | null | undefined, amount: number) {
  const budgetLineId = parseBudgetLineId(budgetSegment);
  if (!budgetLineId || amount <= 0) return;

  await procurementRepo.releaseBudgetLineOnPOCancelled(budgetLineId, amount);
  const budgetMstId = await procurementRepo.getBudgetMstIdFromLineId(budgetLineId);
  if (budgetMstId) {
    await procurementRepo.updateBudgetMstReservedAmount(budgetMstId);
  }
  console.log(`[Non-PO Invoice] Released ${amount} on budget line ${budgetLineId}`);
}

/** Move paid amount from reserved to consumed on budget line + master. */
async function moveInvoicePaymentBudgetToConsumed(budgetLineId: number, payAmount: number) {
  if (payAmount <= 0) return;

  const budgetMstResult = await getPool().query(
    `SELECT budget_mst_id, reserved_amount FROM dbo.am_budget_lines WHERE id = $1`,
    [budgetLineId]
  );
  const budgetMstId = budgetMstResult.rows[0]?.budget_mst_id;
  if (!budgetMstId) return;

  const reserved = parseFloat(budgetMstResult.rows[0]?.reserved_amount) || 0;
  const fromReserved = Math.min(payAmount, Math.max(0, reserved));

  if (fromReserved > 0) {
    await procurementRepo.moveReservedToConsumedLineOnPartialPayment(budgetLineId, fromReserved);
    await procurementRepo.moveReservedToConsumedOnPartialPayment(budgetMstId, fromReserved);
    console.log(
      `[Invoice Payment] Updated budget line ${budgetLineId}: moved ${fromReserved} from reserved to consumed`
    );
  }

  const directConsume = payAmount - fromReserved;
  if (directConsume > 0.01 && reserved <= 0.01) {
    // Legacy invoices with no prior reservation — consume from available only.
    await getPool().query(
      `UPDATE dbo.am_budget_lines 
       SET consumed_amount = COALESCE(consumed_amount, 0) + $1
       WHERE id = $2`,
      [directConsume, budgetLineId]
    );
    await getPool().query(
      `UPDATE dbo.am_budget_mst 
       SET consumed_amount = COALESCE(consumed_amount, 0) + $1
       WHERE id = $2`,
      [directConsume, budgetMstId]
    );
    console.log(
      `[Invoice Payment] Updated budget line ${budgetLineId}: consumed ${directConsume} (no prior reservation)`
    );
  }
}

export async function getInvoiceStats(sessionUser?: any) {
  return repo.getInvoiceStats(sessionUser);
}

export async function getInvoices(query: any, sessionUser?: any) {
  const data = await repo.getInvoices(query, sessionUser);
  const finalResult = await Promise.all(
    data.data.map(async (row: any) => {
      const currentApprover = await repo.getCurrentApprover(row.id, "Invoice");
      return {
        ...row,
        currentApprover: currentApprover?.name || null,
      };
    })
  );
  return {
    data: finalResult,
    pagination: data.pagination,
  };
}

export async function getInvoiceById(id: string) {
  const invoice = await repo.getInvoiceById(id);
  if (!invoice) throw { status: 404, message: "Invoice not found" };
  return invoice;
}

export async function getInvoiceLines(invoiceId: string) {
  return repo.getInvoiceLines(invoiceId);
}

export async function createInvoice(data: any) {
  // If PO number is provided, fetch PO data and populate buyer/requestor info
  if (data.po_number) {
    try {
      const po = await repo.findPOByPONumber(data.po_number, data.org_id ?? undefined);
      if (po) {
        // Keep invoice and PO org aligned so downstream lookups stay consistent.
        data.org_id = po.org_id ?? data.org_id;
        const poSupplierId = Number(po.supplier_id);
        if ((!data.supplier_id || Number(data.supplier_id) <= 0) && poSupplierId > 0) {
          data.supplier_id = poSupplierId;
        }
        if (!data.supplier_name && po.company_name) {
          data.supplier_name = po.company_name;
        }
        // Set PO buyer and requestor details from PO data
        data.po_buyer_name = data.po_buyer_name || po.buyer_name || null;
        data.po_buyer_email = data.po_buyer_email || po.buyer_email || null;
        data.po_requestor_name = data.po_requestor_name || po.po_owner_name || null;
        data.po_requestor_email = data.po_requestor_email || po.po_owner_email || null;
      }
    } catch (error: any) {
      console.warn("[Invoice Creation] Error fetching PO details:", error?.message);
      // Continue with invoice creation even if PO lookup fails
    }
  }
  return repo.createInvoice(data);
}

export async function updateInvoice(id: string, data: any, files?: Express.Multer.File[], docPreviews?: (string | null)[], tenant?: string) {
  const existing = await repo.getInvoiceById(id);
  if (!existing) throw { status: 404, message: "Invoice not found" };

  // Handle document deletions
  if (data.deletedDocIds) {
    let deletedIds: number[] = [];
    try {
      deletedIds = typeof data.deletedDocIds === "string" ? JSON.parse(data.deletedDocIds) : data.deletedDocIds;
    } catch { deletedIds = []; }

    for (const docId of deletedIds) {
      // We check both tables since we don't know the source here easily without querying
      // But deleteSuppDocument and deleteInvoiceDocument handles specific tables
      await repo.deleteSuppDocument(docId);
      await repo.deleteInvoiceDocument(id, docId);
    }
  }

  // Handle new files
  if (files && files.length > 0) {
    const { uploadFileToAzure } = await import("../../services/azure-blob.service");
    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      const safeFilename = sanitizeFilename(file.originalname);
      const uploadPath = await uploadFileToAzure(file.buffer, `INVOICES/${id}`, safeFilename, file.mimetype, tenant);

      // Cap preview at 512 KB — large bytea inserts cause DB connections to appear idle/hang
      const MAX_DOC_URI_BYTES = 512 * 1024;
      let docUriBuffer: Buffer | null = null;
      if (docPreviews && docPreviews[fi]) {
        const base64Data = docPreviews[fi]!.replace(/^data:image\/\w+;base64,/, "");
        const decoded = Buffer.from(base64Data, "base64");
        docUriBuffer = decoded.length <= MAX_DOC_URI_BYTES ? decoded : null;
      }

      await repo.insertSuppDocumentDtl({
        docNo: String(id),
        docName: "Invoice Document",
        docType: "INVOICE_DOC",
        docValue: existing.invoice_number,
        docDesc: "Supplier Invoice Doc (Updated)",
        docPath: uploadPath,
        fileName: safeFilename,
        status: "Active",
        recordType: "SUPP_INVOICE",
        supplierId: existing.supplier_id,
        attribute5: "Updated",
        createdBy: data.last_modified_by,
        docUri: docUriBuffer,
      });
    }
  }
  if(data.payment_terms_name) {
    data.payment_terms_name = data.payment_terms_name;
    const dueDate = calculateDueDate(new Date(existing.invoice_date), data.payment_terms_name);
    data.inv_due_date = dueDate;
  }

  data.budget_segment = data.budget_id;
  return repo.updateInvoice(id, data);
}

export async function deleteInvoice(id: string) {
  const existing = await repo.getInvoiceById(id);
  if (!existing) throw { status: 404, message: "Invoice not found" };
  if(existing.invoice_status !== "Draft"){
    throw { status: 400, message: "Only draft invoices can be deleted" };
  }
  return repo.deleteInvoice(id);
}

export async function submitInvoice(id: string, userEmail: string,userInfo:
   { email: string; userId: string; fullName: string; orgId: number; userName: string },
   tenant: string
) {
  const existing = await repo.getInvoiceById(id);
  if (!existing) throw { status: 404, message: "Invoice not found" };
  if (existing.invoice_status !== "Draft") {
    throw { status: 400, message: "Only draft invoices can be submitted" };
  }

  if (existing.invoice_source === "NON-PO") {
    validateNonPoInvoiceSubmission(existing);
  }

  if(existing.budget_name === null || existing.budget_name === undefined || existing.budget_name === "")
  {
    throw { status: 400, message: "Invoice must have a valid budget name" };
  }
  
  const lineData = await repo.getInvoiceLines(id);
  if(lineData.length === 0)
  {
    throw { status: 404, message: "Invoice must have at least one line item before submission" };
  }
  submitForApproval(id, userInfo,tenant);
  return repo.updateInvoice(id, {
    invoice_status: "Pending Approval",
    submitted_by: userInfo.fullName,
    org_id: existing.org_id,
    last_modified_by: userEmail,
  });
}

export async function approveInvoice(id: string, userEmail: string) {
  const existing = await repo.getInvoiceById(id);
  if (!existing) throw { status: 404, message: "Invoice not found" };
  if (existing.invoice_status !== "Pending Approval") {
    throw { status: 400, message: "Only pending invoices can be approved" };
  }
  if (existing.invoice_source === "NON-PO" && existing.budget_segment) {
    await reserveNonPoInvoiceBudget(existing.budget_segment, getInvoiceBudgetTotal(existing));
  }

  return repo.updateInvoice(id, {
    invoice_status: "Approved",
    last_modified_by: userEmail,
  });
}

export async function rejectInvoice(id: string, userEmail: string, reason: string) {
  const existing = await repo.getInvoiceById(id);
  if (!existing) throw { status: 404, message: "Invoice not found" };
  if (existing.invoice_status !== "Pending Approval") {
    throw { status: 400, message: "Only pending invoices can be rejected" };
  }
  return repo.updateInvoice(id, {
    invoice_status: "Rejected",
    invoice_reason: reason,
    last_modified_by: userEmail,
  });
}

export async function createInvoiceLine(data: any) {
  const result = await repo.createInvoiceLine(data);

  try {
    const invoiceId = result?.invoice_id;
    if (invoiceId) {
      const allLines = await repo.getInvoiceLines(invoiceId);
      let totalInvoiceAmount = 0;
      let totalTaxAmount = 0;
      for (const line of allLines) {
        const orderCost = parseFloat(line.order_cost) || 0;
        const taxAmt = parseFloat(line.tax_amount) || 0;
        totalInvoiceAmount += orderCost;
        totalTaxAmount += taxAmt;
      }
      await repo.updateInvoice(invoiceId, {
        invoice_amount: totalInvoiceAmount,
        tax_amount: totalTaxAmount,
        last_modified_by: data.last_modified_by,
      });
    } 
  } catch (err) {
    console.error("Error recalculating invoice header totals:", err);
  }
  return result;
}

export async function updateInvoiceLine(lineId: number, data: any) {
  const result = await repo.updateInvoiceLine(lineId, data);

  // Recalculate invoice header totals from all lines
  try {
    const invoiceId = result?.invoice_id;
    if (invoiceId) {
      const allLines = await repo.getInvoiceLines(invoiceId);
      let totalInvoiceAmount = 0;
      let totalTaxAmount = 0;
      for (const line of allLines) {
        const orderCost = parseFloat(line.order_cost) || 0;
        const taxAmt = parseFloat(line.tax_amount) || 0;
        totalInvoiceAmount += orderCost;
        totalTaxAmount += taxAmt;
      }
      await repo.updateInvoice(invoiceId, {
        invoice_amount: totalInvoiceAmount,
        tax_amount: totalTaxAmount,
        last_modified_by: data.last_modified_by,
      });
    }
  } catch (err) {
    console.error("Error recalculating invoice header totals:", err);
  }

  return result;
}

export async function deleteInvoiceLine(lineId: number, invoiceId: string) {
  const result = await repo.deleteInvoiceLine(lineId);
  try {
    if (invoiceId) {
      const allLines = await repo.getInvoiceLines(String(invoiceId));
      let totalInvoiceAmount = 0;
      let totalTaxAmount = 0;
      for (const line of allLines) {
        const orderCost = parseFloat(line.order_cost) || 0;
        const taxAmt = parseFloat(line.tax_amount) || 0;
        totalInvoiceAmount += orderCost;
        totalTaxAmount += taxAmt;
      }
      await repo.updateInvoice(invoiceId, {
        invoice_amount: totalInvoiceAmount,
        tax_amount: totalTaxAmount,
      });
    }
  } catch (err) {
    console.error("Error recalculating invoice header totals:", err);
  }
  return result;
}

async function resolveInvoiceSupplierId(invoice: {
  supplier_id?: unknown;
  po_number?: string | null;
  org_id?: number | null;
  site_id?: string | number | null;
}): Promise<number | null> {
  const directId = Number(invoice.supplier_id);
  if (directId > 0 && !Number.isNaN(directId)) return directId;

  if (invoice.po_number) {
    const po = await repo.findPOByPONumber(invoice.po_number, invoice.org_id ?? undefined);
    const poSupplierId = Number(po?.supplier_id);
    if (poSupplierId > 0 && !Number.isNaN(poSupplierId)) return poSupplierId;
  }

  return null;
}

export async function getVendorBankDetails(invoiceId: string) {
  const invoice = await repo.getInvoiceById(invoiceId);
  if (!invoice) throw { status: 404, message: "Invoice not found" };

  const supplierId = await resolveInvoiceSupplierId(invoice);
  if (!supplierId) return [];

  return repo.getVendorBankDetails(supplierId, invoice.site_id);
}

export async function processPayment(id: string, data: any, userEmail: string) {
  const invHdr = await repo.getInvoiceById(id);
  if (!invHdr) throw { status: 404, message: "Invoice not found" };
  if (invHdr.invoice_status !== "Approved") {
    throw { status: 400, message: "Only approved invoices can be paid" };
  }
  if (!data.payment_method) {
    throw { status: 400, message: "Payment method is required" };
  }
  if (!data.payment_date) {
    throw { status: 400, message: "Payment date is required" };
  }

  // Get pay amount from request body
  const payAmount = Number(data.amount_to_pay);
  if (!payAmount || payAmount <= 0) {
    throw { status: 400, message: "Amount to pay must be a positive number" };
  }

  const invoiceAmount = (parseFloat(invHdr.invoice_amount) || 0) + (parseFloat(invHdr.tax_amount) || 0);

  const result = await repo.processPayment(id, {
    ...data,
    amount_to_pay: payAmount,
    last_modified_by: userEmail,
  });
  if (!result) throw { status: 500, message: "Failed to process payment" };

  // Update budget: move paid amount from reserved to consumed
  try {
    let budgetLineId: number | null = null;

    if (invHdr.po_number) {
      const poResult = await getPool().query(
        `SELECT budget_segment FROM dbo.supp_po_header_dtls WHERE po_number = $1`,
        [invHdr.po_number]
      );
      budgetLineId = parseBudgetLineId(poResult.rows[0]?.budget_segment);
    } else if (invHdr.budget_segment) {
      budgetLineId = parseBudgetLineId(invHdr.budget_segment);
    }

    if (budgetLineId) {
      const budgetPayAmount = Math.min(invoiceAmount, getInvoiceBudgetTotal(invHdr));
      await moveInvoicePaymentBudgetToConsumed(budgetLineId, budgetPayAmount);
    }
  } catch (ex: any) {
    console.error("[Invoice Payment] Budget update error:", ex?.message);
    // Continue with payment even if budget update fails
  }

  // Update PO status if all invoices are paid
  let poObj: any = null;
  if (invHdr.po_number) {
    try {
      poObj = await repo.findPOByPONumber(invHdr.po_number);
    } catch (ex) {
      console.error("Error finding PO:", ex);
    }
  }

  if (poObj) {
    try {
      if (poObj.attribute_9 && poObj.attribute_9.toLowerCase() === "invoiced") {
        const prevInv = await repo.getAllInvoicesByPONumber(poObj.po_number);
        let isAllPaid = true;
        let totalAmtPaid = 0;

        if (prevInv && prevInv.length > 0) {
          for (const inv of prevInv) {
            if (inv.invoice_status === "Paid") {
              const paid = parseFloat(inv.invoice_amount_paid) || 0;
              totalAmtPaid += paid;
            } else {
              isAllPaid = false;
            }
          }
        }

        const poTotalCost = parseFloat(poObj.po_total_cost) || 0;
        if (isAllPaid && poTotalCost > 0 && Math.abs(poTotalCost - totalAmtPaid) < 0.01) {
          await repo.updatePO(poObj.po_number, {
            po_status: "Closed",
            attribute_10: "Paid",
          });
        } else {
          await repo.updatePO(poObj.po_number, {
            attribute_10: "Partially Paid",
          });
        }
      } else {
        await repo.updatePO(poObj.po_number, {
          attribute_10: "Partially Paid",
        });
      }
    } catch (ex) {
      console.error("Error updating PO payment status:", ex);
    }
  }

  const tdsPcrnt = data.tds_percentage ? Number(data.tds_percentage) : null;
  const tdsAmount = data.tds_amount ? Number(data.tds_amount) : null;

  try {
    await repo.insertPaymentRecord({
      invId: id,
      paymentMethod: data.payment_method,
      paymentDescription: data.payment_description || null,
      paymentDate: data.payment_date,
      amountPaid: data.amount_to_pay,
      invoiceAmount: invoiceAmount,
      paymentCurrCode: invHdr.invoice_curr_code || null,
      bankName: data.bank_name || null,
      bankBranch: data.branch_name || null,
      onlineTrsfdAcntNo: data.online_transfer_account_no || null,
      bankTransferRefNo: data.bank_transfer_ref_no || null,
      chequeNumber: data.cheque_number || null,
      chequeDate: data.cheque_date || null,
      chequeCollectedBy: data.cheque_collected_by || null,
      chequeCollectionDate: data.cheque_collection_date || null,
      chequeCollectorContactNo: data.cheque_collector_contact_no || null,
      chequeCollectorEmail: data.cheque_collector_email || null,
      tdsCategory: data.tds_category || null,
      tdsPcrnt: tdsPcrnt,
      tdsAmount: tdsAmount,
    });
  } catch (err) {
    console.error("Error inserting payment record:", err);
  }

  try {
    const supplier = await repo.getSupplierById(invHdr.supplier_id);
    if (supplier) {
      const isNonPOOrAdvance = invHdr.invoice_source === "NON-PO" || !invHdr.po_number || invHdr.invoice_type?.toUpperCase() === "PREPAYMENT";
      const eventPayload = {
        timestamp: new Date(),
        invoiceNo: invHdr.invoice_number,
        amountPaid: payAmount,
        currency: invHdr.invoice_curr_code || "AED",
        paymentDate: data.payment_date,
        paymentMethod: data.payment_method,
        receiverEmail: supplier.email_id || "",
        companyName: supplier.company_name,
        domain: (invHdr as any).domain || undefined,
      };
      const orgData = await adminRepo.getOrgDetails();
      if (isNonPOOrAdvance) {
        eventBus.publish({
          eventType: EventTypes.INVOICE_PAYMENT_RECEIVED_NONPO,
          ...eventPayload,
          orgLogoPath: orgData.org_logo_path,
        });
      } else {
        eventBus.publish({
          eventType: EventTypes.INVOICE_PAYMENT_RECEIVED_PO,
          ...eventPayload,
          orgLogoPath: orgData.org_logo_path,
        });
      }
    }
  } catch (err) {
    console.error("[processPayment] Notification error:", err);
  }

  return result;
}

export async function getPaymentRecord(invoiceId: string) {
  return repo.getPaymentRecord(invoiceId);
}

export async function getInvoiceDocuments(invoiceId: string, source?: string) {
  if (source === 'collaboration') {
    const collabDocs = await repo.getInvoiceDocuments(invoiceId);
    return collabDocs.map((d: any) => ({
      id: d.id,
      file_name: d.file_name,
      file_path: d.file_path,
      doc_type: d.attach_source || "COLLABORATION",
      source: "COLLABORATION",
      created_by: d.created_by,
      created_date: d.created_date,
    }));
  }

  const [collabDocs, suppDocs] = await Promise.all([
    repo.getInvoiceDocuments(invoiceId),
    repo.getInvoiceSuppDocuments(invoiceId),
  ]);
  const suppDocsNormalized = suppDocs.map((d: any) => {
    let preview_url: string | null = null;
    if (d.doc_uri && Buffer.isBuffer(d.doc_uri) && d.doc_uri.length > 0) {
      const base64 = d.doc_uri.toString("base64");
      preview_url = `data:image/png;base64,${base64}`;
    }
    return {
      id: d.id,
      file_name: d.filename || d.doc_name,
      file_path: d.doc_path,
      doc_type: d.doc_type,
      source: "SUPP_INVOICE",
      created_by: d.created_by,
      created_date: d.creation_date,
      preview_url,
    };
  });
  const collabDocsNormalized = collabDocs.map((d: any) => ({
    id: d.id,
    file_name: d.file_name,
    file_path: d.file_path,
    doc_type: d.attach_source || "COLLABORATION",
    source: "COLLABORATION",
    created_by: d.created_by,
    created_date: d.created_date,
  }));
  return [...suppDocsNormalized, ...collabDocsNormalized];
}

export async function addInvoiceDocument(invoiceId: string, file: Express.Multer.File, createdBy: string, tenant?: string) {
  const { uploadFileToAzure } = await import("../../services/azure-blob.service");
  const { sanitizeFilename, DANGEROUS_EXTENSIONS } = await import("../_shared/file-upload");
  const pathModule = await import("path");

  if (file.size === 0) throw { status: 400, message: "File is empty" };
  if (file.size > 5 * 1024 * 1024) throw { status: 400, message: "File exceeds 5 MB limit" };

  const ext = pathModule.default.extname(file.originalname).toLowerCase();
  if (DANGEROUS_EXTENSIONS.has(ext)) throw { status: 400, message: `File type "${ext}" is not allowed` };

  const safeFilename = sanitizeFilename(file.originalname);
  const filePath = await uploadFileToAzure(file.buffer, `INVOICES/${invoiceId}/collaboration`, safeFilename, file.mimetype, tenant);
  return repo.insertInvoiceDocument(invoiceId, file.originalname, filePath, createdBy);
}

export async function deleteInvoiceDocument(invoiceId: string, docId: number) {
  return repo.deleteInvoiceDocument(invoiceId, docId);
}

export async function getInvoiceComments(invoiceId: string) {
  return repo.getInvoiceComments(invoiceId);
}

export async function addInvoiceComment(invoiceId: string, data: any) {
  return repo.insertInvoiceComment(invoiceId, data.comments, data.created_by, data.created_by_name);
}

export async function deleteInvoiceComment(invoiceId: string , commentId: number) {
  return repo.deleteInvoiceComment(invoiceId, commentId);
}

export async function getInvoiceNotes(invoiceId: string) {
  const notes = await repo.getInvoiceNotes(invoiceId);
  return { notes };
}

export async function updateInvoiceNotes(invoiceId: string, notes: string) {
  await repo.updateInvoiceNotes(invoiceId, notes);
  return { notes };
}

export async function getInvoiceApprovalHistory(invoiceId: string) {
  return repo.getInvoiceApprovalHistory(String(invoiceId));
}

export async function updateTaxIncluded(invoiceId: string, taxIncluded: string) {
  const invoice = await repo.getInvoiceById(invoiceId);
  if (!invoice) throw { status: 404, message: "Invoice not found" };
  await repo.updateInvoice(invoiceId, { tax_included: taxIncluded });

  const invoiceLines = await repo.getInvoiceLines(invoiceId);
    if(invoiceLines.length > 0) {
      let netCost = 0;
      let taxTotal =0;
      let totalCost = 0;
       if(taxIncluded === "Yes") {
          for(const line of invoiceLines) {
            const taxAmount = line.tax_amount || 0;
            const lineCost = line.order_cost || 0;
            const taxRate = line.tax_rate || 0;
            const lineTotal = Number(taxAmount) + Number(lineCost);
          
            const newTaxAmount = Number(lineTotal) * Number(taxRate)/100;
            const newLineCost = Number(lineTotal) - Number(newTaxAmount);
            const newUnitPrice = Number(newLineCost) / Number(line.order_qty);
            await repo.updateInvoiceLine(line.id, {
              tax_amount: newTaxAmount,
              order_cost: newLineCost,
              order_unit_cost: newUnitPrice,
            });
            netCost = Number(netCost) + Number(newLineCost);
            taxTotal = Number(taxTotal) + Number(newTaxAmount);
          }
        }else{
          for(const line of invoiceLines) {
            const taxRate = line.tax_rate || 0;
            const quantity = line.order_qty|| 0;
            const newLineCost = Number(quantity) * Number(line.order_unit_cost);
            const newTaxAmount = Number(newLineCost) * Number(taxRate)/100;
            const newUnitPrice = Number(newLineCost) / Number(quantity);
          
          await repo.updateInvoiceLine(line.id, {
            tax_amount: newTaxAmount,
            order_cost: newLineCost,
            order_unit_cost: newUnitPrice,
          });
          netCost = Number(netCost) + Number(newLineCost);
          taxTotal = Number(taxTotal) + Number(newTaxAmount);
        }
      }
      totalCost = Number(netCost) + Number(taxTotal);
      await repo.updateInvoice(invoiceId, { invoice_amount: netCost, tax_amount: taxTotal});
    }
  return { taxIncluded };
}

export async function processInvoiceApproval(invoiceId: string, body: any, reqUser: any) 
{
  const { workflowService } = await import("../../services/workflowService");
  const { taskId, result, comments } = body;

  if (!reqUser) throw { status: 401, message: "User not authenticated" };
  if (!taskId || taskId === "undefined") throw { status: 400, message: "Invalid task details!" };
  if (!result) throw { status: 400, message: "result is required" };

  const user = await repo.getUserDetails(reqUser.id);
  if (!user) throw { status: 400, message: "Could not determine user identity" };
  const username = user.user_name || user.email_id || "system";

  if (!username || username === "system") {
    throw { status: 400, message: "Could not determine user identity" };
  }

  const invoice = await repo.getInvoiceById(invoiceId);
  if (!invoice) throw { status: 404, message: "Invoice not found" };
  const wfStepInstances = await workflowService.findByTaskId(taskId);

  const receiptLines = await procurementRepo.getReceiptsForInvoiceById(invoice.attribute_4 as string);
  const orgData = await adminRepo.getOrgDetails();

  let poObj: any = null;
  if (invoice.po_number) {
    poObj = await repo.findPOByPONumber(invoice.po_number);
  }

  let taskCreationDate: Date | null = null;
  try {
    taskCreationDate = await repo.getTaskCreationDate(taskId);
  } catch (ex) {
    console.error("Error getting task creation date:", ex);
  }

  const userRoles = await repo.getUserRoles(reqUser.id);

  let ntaskId = "";
  try {
    ntaskId = await workflowService.completeTask(
      taskId,
      result as "Approve" | "Reject" | "ReSubmit" | "More",
      comments || "",
      username,
      userRoles
    );
  } catch (e: any) {
    throw { status: 400, message: e.message };
  }

  const resultLower = result.toLowerCase();

  if (ntaskId && ntaskId !== "") {
    let approvers ="";
    if(invoice.attribute_10) {
      approvers = invoice.attribute_10 + "," + username;
    }
    else
    {
      approvers = username;
    }
    await repo.updateInvoice(invoiceId, {
      attribute_12: ntaskId,
      invoice_status: "Pending Approval",
      last_modified_by: username,
      attribute_10: approvers,
    });
    const isNonPOOrAdvance = invoice.invoice_source === "NON-PO" || !invoice.po_number || invoice.invoice_type?.toUpperCase() === "PREPAYMENT";
    if(resultLower === "approve" || resultLower === "approved") 
    {
      const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=$1`,[ntaskId]);
      const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
      const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);
      const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent('Invoice')}&&taskId=${encodeURIComponent(ntaskId)}&&email=${encodeURIComponent(approverEmail.rows[0].current_assignee)}&&refnumber=${encodeURIComponent(invoiceId)}`;
    publishTaskAssignmentEvent({
      taskId: ntaskId,
      templateEventId: EventTypes.TASK_ASSIGNMENT.INVOICE_APPROVAL,
      taskSub: `Invoice approval — ${invoice.invoice_number || String(invoiceId)}`,
      submittedBy: user.name || username,
      department: user.department_name || "",
      domain: (reqUser as any)?.domain,
      orgName: (invoice as any).attribute_1 || undefined,
      entityId: invoice.org_id != null ? String(invoice.org_id) : undefined,
      srmsRefNo: String(invoice.invoice_number || invoiceId),
      invoiceNo: invoice.invoice_number,
      description: invoice.description,
      supplierName: invoice.supplier_name,
      variables: {
        invoiceNumber: invoice.invoice_number,
        invoiceDescription: invoice.description,
        submittedBy: user.name || username,
        orgLogoPath: orgData.org_logo_path,
        emailApprovalLink: approvalLink,
      },
      emailApprovalLink: approvalLink,
    });
   }
  }

  if ((!ntaskId || ntaskId === "") && (resultLower === "approved" || resultLower === "approve")) {
    if (invoice.invoice_type?.toUpperCase() === "STANDARD" && invoice.prepay_apply_amount) {
      const prepayApplyAmount = parseFloat(invoice.prepay_apply_amount) || 0;
      if (prepayApplyAmount > 0 && invoice.prepay_inv_num) {
        try {
          await repo.prepayBusinessLogic(invoiceId, invoice.prepay_inv_num, prepayApplyAmount);
        } catch (ex) {
          console.error("Error in prepay business logic:", ex);
        }
      }
    }

    if (invoice.invoice_source === "NON-PO" && invoice.budget_segment) {
      try {
        await reserveNonPoInvoiceBudget(invoice.budget_segment, getInvoiceBudgetTotal(invoice));
      } catch (ex: any) {
        console.error("[Non-PO Invoice Approval] Budget reservation error:", ex?.message);
        throw {
          status: ex?.status || 500,
          message: ex?.message || "Failed to reserve budget for this invoice.",
        };
      }
    }

    let approvers ="";
    if(invoice.attribute_10) {
      approvers = invoice.attribute_10 + "," + username;
    }
    else
    {
      approvers = username;
    }
    
    await repo.updateInvoice(invoiceId, {
      invoice_status: "Approved",
      last_modified_by: username,
      attribute_10: approvers,
    });
    if (poObj) {
      try {
        let invAmt = 0;
        const invList = await repo.getAllApprovedInvoicesByPONumber(poObj.po_number);
        if (invList && invList.length > 0) {
          for (const tempInv of invList) {
            if (tempInv.invoice_status?.toUpperCase() === "APPROVED" &&
              tempInv.invoice_type?.toUpperCase() === "STANDARD") {
              invAmt += parseFloat(tempInv.invoice_amount) || 0;
              if (tempInv.tax_amount) {
                invAmt += parseFloat(tempInv.tax_amount) || 0;
              }
            }
          }
        }

        const poTotalCost = parseFloat(poObj.po_total_cost) || 0;
        const invoiceStatus = poTotalCost > 0 && Math.abs(poTotalCost - invAmt) < 0.01
          ? "Invoiced"
          : "Partially Invoiced";

        await repo.updatePO(poObj.po_number, {
          invoiced_amount: invAmt,
          attribute_9: invoiceStatus,
        });
      } catch (ex) {
        console.error("Error updating PO invoiced amount:", ex);
      }
    }
    const isNonPOOrAdvance = invoice.invoice_source === "NON-PO" || !invoice.po_number || invoice.invoice_type?.toUpperCase() === "PREPAYMENT";
    if (isNonPOOrAdvance) {
      eventBus.publish({
        eventType: EventTypes.INVOICE_APPROVED_NONPO,
        timestamp: new Date(),
        invoiceId: String(invoiceId),
        invoiceNo: invoice.invoice_number,
        description: invoice.description,
        invoiceAmount: invoice.invoice_amount,
        invoiceDate: invoice.invoice_date.toLocaleDateString(),
        approvedDate: new Date().toLocaleDateString(),
        supplierName: invoice.supplier_name,
        submitterEmail: invoice.created_by || invoice.submitted_by,
        submitterName: invoice.submitted_by || "User",
        domain: (reqUser as any)?.domain,
        orgName: (invoice as any).attribute_1 || undefined,
        orgLogoPath: orgData.org_logo_path,
      });
    } else {
      eventBus.publish({
        eventType: EventTypes.INVOICE_APPROVED_PO,
        timestamp: new Date(),
        invoiceId: String(invoiceId),
        invoiceNo: invoice.invoice_number,
        description: invoice.description,
        supplierName: invoice.supplier_name,
        submitterEmail: invoice.created_by || invoice.submitted_by,
        submitterName: invoice.submitted_by || "User",
        poNumber: poObj.po_number || "",
        invoiceAmount: parseFloat(invoice.invoice_amount || "0"),
        approvedDate: new Date().toLocaleDateString(),
        domain: (reqUser as any)?.domain,
        orgName: (invoice as any).attribute_1 || undefined,
        orgLogoPath: orgData.org_logo_path,
      });
    }
  }

  if (resultLower === "rejected" || resultLower === "reject") {
    for (const receiptLine of receiptLines) {
      await procurementRepo.updateGrns(receiptLine.maximo_grn_id as number, {
        status: "Received",
        attribute_9: null,
      });
    }
    let approvers ="";
    if(invoice.attribute_10) {
      approvers = invoice.attribute_10 + "," + username;
    }
    else
    {
      approvers = username;
    }
    await repo.updateInvoice(invoiceId, {
      invoice_status: "Rejected",
      attribute_5: comments || "",
      attribute_10: approvers,
      last_modified_by: username,
    });

    const isNonPOOrAdvance = invoice.invoice_source === "NON-PO" || !invoice.po_number || invoice.invoice_type?.toUpperCase() === "PREPAYMENT";
    if (isNonPOOrAdvance) {
      eventBus.publish({
        eventType: EventTypes.INVOICE_REJECTED_NONPO,
        timestamp: new Date(),
        invoiceId: String(invoiceId),
        invoiceNo: invoice.invoice_number,
        description: invoice.description,
        supplierName: invoice.supplier_name,
        invoiceAmount: parseFloat(invoice.invoice_amount || "0"),
        invoiceDate: invoice.invoice_date.toLocaleDateString(),
        rejectedDate: new Date().toLocaleDateString(),
        rejectionReason: comments || "",
        submitterEmail: invoice.created_by || invoice.submitted_by,
        submitterName: invoice.submitted_by || "User",
        domain: (reqUser as any)?.domain,
        orgName: (invoice as any).attribute_1 || undefined,
        orgLogoPath: orgData.org_logo_path,
      });
    } else {
      eventBus.publish({
        eventType: EventTypes.INVOICE_REJECTED_PO,
        timestamp: new Date(),
        invoiceId: String(invoiceId),
        invoiceNo: invoice.invoice_number,
        description: invoice.description,
        invoiceAmount: parseFloat(invoice.invoice_amount || "0"),
        rejectedDate: new Date().toLocaleDateString(),
        rejectionReason: comments || "",
        poNumber: poObj.po_number || "",
        supplierName: invoice.supplier_name,
        reason: comments || "",
        submitterEmail: invoice.created_by || invoice.submitted_by,
        submitterName: invoice.submitted_by || "User",
        domain: (reqUser as any)?.domain,
        orgName: (invoice as any).attribute_1 || undefined,
        orgLogoPath: orgData.org_logo_path,
      });
    }
  }

  if (resultLower === "more info required" || resultLower === "more") {
    await repo.updateInvoice(invoiceId, {
      invoice_status: "More Info Required",
      last_modified_by: username,
    });

    const isNonPOOrAdvance = invoice.invoice_source === "NON-PO" || !invoice.po_number || invoice.invoice_type?.toUpperCase() === "PREPAYMENT";
    if (isNonPOOrAdvance) {
      eventBus.publish({
        eventType: EventTypes.INVOICE_MORE_NONPO,
        timestamp: new Date(),
        invoiceId: String(invoiceId),
        invoiceNo: invoice.invoice_number,
        description: invoice.description,
        supplierName: invoice.supplier_name,
        submitterEmail: invoice.created_by || invoice.submitted_by,
        submitterName: invoice.submitted_by || "User",
        domain: (reqUser as any)?.domain,
        orgName: (invoice as any).attribute_1 || undefined,
        invoiceAmount: parseFloat(invoice.invoice_amount || "0"),
        requestedDate: new Date().toLocaleDateString(),
        orgLogoPath: orgData.org_logo_path,
      });
    } else {
      // eventBus.publish({
      //   eventType: EventTypes.INVOICE_MORE_INFO_PO,
      //   timestamp: new Date(),
      //   invoiceId: String(invoiceId),
      //   invoiceNo: invoice.invoice_number,
      //   description: invoice.description,
      //   supplierName: invoice.supplier_name,
      //   submitterEmail: invoice.created_by || invoice.submitted_by,
      //   submitterName: invoice.submitted_by || "User",
      //   domain: (reqUser as any)?.domain,
      //   orgName: (invoice as any).attribute_1 || undefined,
      // });

      publishTaskAssignmentEvent({
        taskId: ntaskId,
        templateEventId: EventTypes.INVOICE_MORE_INFO_PO,
        taskSub: `Invoice Approval Request - ${invoice.supplier_name || ''} - Invoice No:${invoice.invoice_number} - PO No:${invoice.po_number}`,
        submittedBy: invoice.created_by || invoice.submitted_by,
        department: invoice.department_name || "",
        domain: (reqUser as any)?.domain,
        variables: {
          invoiceNumber: invoice.invoice_number,
          invoiceDescription: invoice.description,
          invoiceAmount: parseFloat(invoice.invoice_amount || "0"),
          poNumber: invoice.po_number || "",
          supplierName: invoice.supplier_name,
          requestedDate: new Date().toLocaleDateString(),
          comments: comments || "",
          orgLogoPath: orgData.org_logo_path,
      },
    });
    }
  }

  if (resultLower === "resubmit") {

    const processName = "Invoice";

    const taskSubject =
      `Invoice Re-Submit Approval Request-${invoice.supplier_name}-Invoice No:${invoice.invoice_number}`;

  const wfParams = {
    subject: taskSubject,
    srmsRefNumber: String(invoiceId),
    status: "Pending Approval",
    startDate: Date.now(),
    createdBy: username,
    organization: invoice.attribute_1,
    department: invoice.department_name || "",
    amount: parseFloat(invoice.invoice_amount || "0"),
    orgId: invoice.org_id || 0,
  };

    let approversList = await workflowService.getApproversList(processName, wfParams);

    // let newTaskId: string;
    // try {
    //   newTaskId = await workflowService.startProcess(
    //     taskSubject,
    //     processName,
    //     String(invoiceId),
    //     wfParams,
    //     username
    //   );
    // } catch (err: any) {
    //   if (err.status) throw err;
    //   throw { status: 400, message: err.message || "Failed to start approval workflow" };
    // }

    await repo.updateInvoice(invoiceId, {
      invoice_status: "Pending Approval",
      attribute_12: ntaskId,
      invoice_approvers: approversList.join(", "),
      last_modified_by: username,
    });

    // Trigger notification for resubmission
    const isNonPOOrAdvance = invoice.invoice_source === "NON-PO" || !invoice.po_number || invoice.invoice_type?.toUpperCase() === "PREPAYMENT";
    const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=$1`,[ntaskId]);
      const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
      const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);
      const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent('Invoice')}&&taskId=${encodeURIComponent(ntaskId)}&&email=${encodeURIComponent(approverEmail.rows[0].current_assignee)}&&refnumber=${encodeURIComponent(invoiceId)}`;
    if (isNonPOOrAdvance) {
      publishTaskAssignmentEvent({
        taskId: ntaskId,
        templateEventId: EventTypes.TASK_ASSIGNMENT.INVOICE_RESUBMITTED_NONPO,
        invoiceNo: invoice.invoice_number,
        description: invoice.description,
        supplierName: invoice.supplier_name,
        domain: (reqUser as any)?.domain,
        orgName: (invoice as any).attribute_1 || undefined,
        variables: {
          invoiceNumber: invoice.invoice_number,
          invoiceDescription: invoice.description,
          invoiceAmount: parseFloat(invoice.invoice_amount || "0"),
          requestedDate: new Date().toLocaleDateString(),
          submittedBy: user.name || username,
          orgLogoPath: orgData.org_logo_path,
          emailApprovalLink: approvalLink,
        },
        emailApprovalLink: approvalLink,
      });
    } else {
      publishTaskAssignmentEvent({
        taskId: ntaskId,
        templateEventId: EventTypes.TASK_ASSIGNMENT.INVOICE_RESUBMITTED_PO,
        invoiceNo: invoice.invoice_number,
        description: invoice.description,
        supplierName: invoice.supplier_name,
        domain: (reqUser as any)?.domain,
        orgName: (invoice as any).attribute_1 || undefined,
        variables: {
          invoiceNumber: invoice.invoice_number,
          invoiceDescription: invoice.description,
          invoiceAmount: parseFloat(invoice.invoice_amount || "0"),
          requestedDate: new Date().toLocaleDateString(),
          submittedBy: user.name || username,
          orgLogoPath: orgData.org_logo_path,
          emailApprovalLink: approvalLink,
        },
        emailApprovalLink: approvalLink,
      });
    }
  }

  const wfStepInstance = wfStepInstances[0];
  const currentApprover = await adminRepo.getUserDetailsByUsername(wfStepInstance.current_assignee);
  if (resultLower === "approve" || resultLower === "approved") {
    const currentApprovers = invoice.invoice_approvers;
    if (currentApprovers) {
      let newApprovers = currentApprovers;
      if (currentApprovers.includes(",")) {
        if((wfStepInstance.assignment_type === "ROLE" && userRoles.includes(wfStepInstance.current_assignee))){
          newApprovers = currentApprovers.replace(`${wfStepInstance.current_assignee},`, "").replace(`, ${wfStepInstance.current_assignee}`, "");
        }else if((wfStepInstance.assignment_type === "USER" && user.email_id === wfStepInstance.current_assignee)){
          newApprovers = currentApprovers.replace(`${user.name},`, "").replace(`, ${user.name}`, "");
        }else if(wfStepInstance.assignment_type === "USER_HIERARCHY"){
          newApprovers = currentApprovers.replace("Manager,", "").replace(", Manager", "");
        }else if(userRoles.includes("ROLE_SUPERADMIN") || userRoles.includes("SUPERADMIN")){
          if(wfStepInstance.assignment_type === "ROLE"){
            newApprovers = currentApprovers.replace(`${wfStepInstance.current_assignee},`, "").replace(`, ${wfStepInstance.current_assignee}`, "");
          }else if(wfStepInstance.assignment_type === "USER"){
            newApprovers = currentApprovers.replace(`${currentApprover.name},`, "").replace(`, ${currentApprover.name}`, "");
          }
        }
      } else {
        if((wfStepInstance.assignment_type === "ROLE" && userRoles.includes(wfStepInstance.current_assignee))){
          newApprovers = currentApprovers.replace(`${wfStepInstance.current_assignee}`, "");
        }else if((wfStepInstance.assignment_type === "USER" && user.email_id === wfStepInstance.current_assignee)){
          newApprovers = currentApprovers.replace(`${user.name}`, "");
        }else if(wfStepInstance.assignment_type === "USER_HIERARCHY"){
          newApprovers = "";
        }else if(userRoles.includes("ROLE_SUPERADMIN") || userRoles.includes("SUPERADMIN")){
          if(wfStepInstance.assignment_type === "ROLE"){
            newApprovers = currentApprovers.replace(`${wfStepInstance.current_assignee},`, "").replace(`, ${wfStepInstance.current_assignee}`, "");
          }else if(wfStepInstance.assignment_type === "USER"){
            newApprovers = currentApprovers.replace(`${currentApprover.name},`, "").replace(`, ${currentApprover.name}`, "");
          }}
      }
      await repo.updateInvoice(invoiceId, { invoice_approvers: newApprovers });
    }
  }

  const nextId = await repo.getNextApprovalId();
  await repo.insertInvoiceApprovalHistory({
    id: nextId,
    objectId: invoice.invoice_number,
    comments: comments || "",
    approverId: reqUser.id,
    approverName: user.name || username,
    email: user.email_id || username,
    designation: user.designation || "",
    status: result,
    requestedDate: taskCreationDate || new Date(),
    createdBy: username,
  });

  let newStatus = "Pending Approval";
  if ((!ntaskId || ntaskId === "") && (resultLower === "approved" || resultLower === "approve")) {
    newStatus = "Approved";
  } else if (resultLower === "rejected" || resultLower === "reject") {
    newStatus = "Rejected";
  } else if (resultLower === "more info required" || resultLower === "more") {
    newStatus = "More Info Required";
  }

  const actionLabel = newStatus === "Approved" ? "approved"
    : newStatus === "Rejected" ? "rejected"
      : newStatus === "More Info Required" ? "sent back for more info"
        : resultLower === "resubmit" ? "resubmitted"
          : "moved to next approval step";

  return {
    success: true,
    message: `Invoice ${actionLabel} successfully`,
    newStatus,
  };
}

export async function getNextInvoiceNumber(orgId: number) {
  return repo.getNextInvoiceNumber(orgId);
}

export async function checkDuplicateInvoiceNumber(invoiceNumber: string, orgId?: number) {
  if (!invoiceNumber || !invoiceNumber.trim()) return null;
  return repo.checkDuplicateInvoiceNumber(invoiceNumber.trim(), orgId);
}

export async function processNonPOInvoice(
  invoiceData: any,
  invLines: any[],
  files: Express.Multer.File[],
  userInfo: { email: string; userId: string; fullName: string; orgId: number; userName: string },
  docPreviews?: (string | null)[],
  tenant?: string
) {
  const { workflowService } = await import("../../services/workflowService");
  const { uploadFileToAzure } = await import("../../services/azure-blob.service");

  const supplierId = Number(invoiceData.supplier_id);
  if (!supplierId || isNaN(supplierId)) throw { status: 400, message: "Supplier is required" };

  const supplier = await repo.getSupplierById(supplierId);
  if (!supplier) throw { status: 400, message: "Supplier not found" };

  const site = await repo.getSupplierFirstSite(supplierId);
  const orgData = await adminRepo.getOrgDetails();
  let totalInvoiceAmount = 0;
  let totalTaxAmount = 0;
  for (const line of invLines) {
    const qty = parseFloat(line.order_qty) || 0;
    const unitCost = parseFloat(line.unit_cost) || 0;
    const lineCost = qty * unitCost;
    const taxAmt = parseFloat(line.tax_amount) || 0;
    totalInvoiceAmount += lineCost ;
    totalTaxAmount += taxAmt;
  }

  if (invoiceData.budget_segment) {
    await assertNonPoBudgetAvailable(invoiceData.budget_segment, totalInvoiceAmount);
  }

  let orgId = invoiceData.org_id || userInfo.orgId;
  let orgName = "";
  if (orgId) {
    const org = await repo.getOrgById(orgId);
    if (org) orgName = org.organization_name;
  } else {
    const lookup = await repo.getLookupValueByKey("SYSTEM_ORG_ID");
    if (lookup) {
      orgId = parseInt(lookup.description);
      const org = await repo.getOrgById(orgId);
      if (org) orgName = org.organization_name;
    }
  }

  const invoiceHdr = await repo.createInvoice({
    invoice_number: invoiceData.invoice_number,
    invoice_type: invoiceData.invoice_type || "STANDARD",
    invoice_amount: totalInvoiceAmount,
    invoice_curr_code: invoiceData.invoice_curr_code || "AED",
    invoice_date: invoiceData.invoice_date || new Date(),
    supplier_id: supplierId,
    supplier_name: supplier.company_name,
    description: invoiceData.description,
    department_name: invoiceData.department_name,
    invoice_source: "NON-PO",
    payment_terms_name: invoiceData.payment_terms_name,
    budget_name: invoiceData.budget_name,
    created_by: userInfo.email,
    org_id: orgId,
    tax_included: invoiceData.tax_included || "N",
  });

  const invoiceId = invoiceHdr.id;

  const updateData: any = {
    last_modified_by: userInfo.email,
    gl_date: new Date(),
    site_id: site ? String(site.id) : null,
    invoice_reason: invoiceData.reason_for_non_po || null,
    attribute_1: orgName,
    budget_segment: invoiceData.budget_segment || null,
    department: invoiceData.department || invoiceData.department_name || null,
    submitted_by: userInfo.fullName,
  };

  if (totalTaxAmount > 0) {
    updateData.tax_amount = totalTaxAmount;
  }

  /*if (supplier.payment_terms_id) {
    updateData.payment_terms_id = supplier.payment_terms_id;
    const payTerm = await repo.getPaymentTermById(supplier.payment_terms_id);
    if (payTerm && payTerm.terms_name) {
      const dueDate = calculateDueDate(new Date(invoiceHdr.invoice_date), payTerm.terms_name);
      updateData.inv_due_date = dueDate;
    } else {
      updateData.inv_due_date = addDays(new Date(invoiceHdr.invoice_date), 15);
    }
  } else {*/
   if(invoiceData.payment_terms_name) {
    updateData.payment_terms_name = invoiceData.payment_terms_name;
    const dueDate = calculateDueDate(new Date(invoiceHdr.invoice_date), invoiceData.payment_terms_name);
    updateData.inv_due_date = dueDate;
  }
    
  //}

  await repo.updateInvoice(invoiceId, updateData);

  if (files && files.length > 0) {
    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      const safeFilename = sanitizeFilename(file.originalname);
      const uploadPath = await uploadFileToAzure(file.buffer, `INVOICES/${invoiceId}`, safeFilename, file.mimetype, tenant);

      const safeOriginalName = sanitizeFilename(file.originalname);

      // Cap preview at 512 KB — large bytea inserts cause DB connections to appear idle/hang
      const MAX_DOC_URI_BYTES = 512 * 1024;
      let docUriBuffer: Buffer | null = null;
      if (docPreviews && docPreviews[fi]) {
        const base64Data = docPreviews[fi]!.replace(/^data:image\/\w+;base64,/, "");
        const decoded = Buffer.from(base64Data, "base64");
        docUriBuffer = decoded.length <= MAX_DOC_URI_BYTES ? decoded : null;
      }

      await repo.insertSuppDocumentDtl({
        docNo: String(invoiceId),
        docName: "Invoice Document",
        docType: "INVOICE_DOC",
        docValue: invoiceData.invoice_number,
        docDesc: "Supplier Invoice Doc",
        docPath: uploadPath,
        fileName: safeOriginalName,
        status: "Active",
        recordType: "SUPP_INVOICE",
        supplierId: supplierId,
        attribute5: "New",
        createdBy: userInfo.email,
        docUri: docUriBuffer,
      });
    }
  }

  for (let i = 0; i < invLines.length; i++) {
    const line = invLines[i];
    const qty = parseFloat(line.order_qty) || 0;
    const unitCost = parseFloat(line.unit_cost) || 0;
    const orderCost = qty * unitCost;
    const taxRate = parseFloat(line.tax_rate) || 0;
    const taxAmt = parseFloat(line.tax_amount) || 0;

    await repo.createInvoiceLine({
      invoice_id: invoiceId,
      line_number: i + 1,
      item_name: line.item_name,
      item_type: line.category || null,
      description: line.item_name,
      order_qty: qty,
      order_unit_cost: unitCost,
      order_cost: orderCost,
      tax_amount: taxAmt,
      tax_rate: taxRate,
      tax_rate_code: line.tax_rate_code || null,
      taxable_flag: taxRate > 0 ? "Y" : "N",
      product_category_name: line.category || null,
      created_by: userInfo.email,
      org_id: orgId,
      item_id: line.item_id ? String(line.item_id) : null,
      tax_rate_id: line.tax_rate_id ? String(line.tax_rate_id) : null,
      delivery_date: line.delivery_date || null,
    });
  }
    
  if (String(invoiceData.submissionType || "").toLowerCase() === "draft") {
    return {
      success: true,
      invoiceId,
      message: "NON-PO Invoice saved successfully",
    };
  } else {
    const msg = await submitForApproval(String(invoiceId), userInfo, String(tenant));

    return {
      success: true,
      invoiceId,
      message: msg,
    };
  }
}

export async function processPoAdvanceInvoice(
  invoiceData: any,
  files: Express.Multer.File[],
  userInfo: { email: string; userId: string; fullName: string; orgId: number; userName: string },
  docPreviews?: (string | null)[]
) {
  const { workflowService } = await import("../../services/workflowService");
  const fs = await import("fs");
  const path = await import("path");

  // Validate PO Number
  const poNumber = invoiceData.po_number;
  if (!poNumber || poNumber.trim() === "") {
    throw { status: 400, message: "PO Number is required" };
  }

  // Get PO details
  const po = await repo.findPOByPONumber(poNumber);
  if (!po) {
    throw { status: 400, message: `PO ${poNumber} not found` };
  }

  // Get supplier details
  const supplierId = po.supplier_id;
  if (!supplierId) {
    throw { status: 400, message: "Supplier not found in PO" };
  }

  const supplier = await repo.getSupplierById(supplierId);
  if (!supplier) {
    throw { status: 400, message: "Supplier details not found" };
  }

  const site = await repo.getSupplierFirstSite(supplierId);

  // Validate invoice amount
  const invoiceAmount = parseFloat(invoiceData.invoice_amount) || 0;
  if (invoiceAmount <= 0) {
    throw { status: 400, message: "Invoice amount must be greater than zero" };
  }

  // Get org details
  let orgId = invoiceData.org_id || po.org_id || userInfo.orgId;
  let orgName = "";
  if (orgId) {
    const org = await repo.getOrgById(orgId);
    if (org) orgName = org.organization_name;
  }

  // Resolve payment term display label for invoice header.
  let resolvedPaymentTermsName: string | null = po.payment_terms_name || null;
  let resolvedPaymentTermMaster: any = null;
  if (po.po_payment_terms_id) {
    resolvedPaymentTermMaster = await repo.getPaymentTermById(po.po_payment_terms_id);
    if (!resolvedPaymentTermsName) {
      resolvedPaymentTermsName =
        resolvedPaymentTermMaster?.terms_name ||
        resolvedPaymentTermMaster?.description ||
        null;
    }
  }

  // Create advance invoice header
  const invoiceHdr = await repo.createInvoice({
    invoice_number: invoiceData.invoice_number,
    invoice_type: "PREPAYMENT",
    invoice_amount: invoiceAmount,
    invoice_curr_code: invoiceData.invoice_curr_code || po.po_currency || "AED",
    invoice_date: invoiceData.invoice_date || new Date(),
    supplier_id: supplierId,
    supplier_name: supplier.company_name,
    description: invoiceData.description || `Advance Payment for PO ${poNumber}`,
    department_name: po.department_name || invoiceData.department_name,
    invoice_source: "EXTERNAL",
    payment_terms_name: resolvedPaymentTermsName,
    budget_name: po.budget_name,
    created_by: userInfo.email,
    org_id: orgId,
    po_number: poNumber,
    po_buyer_name: po.buyer_name || null,
    po_buyer_email: po.buyer_email || null,
    po_requestor_name: po.po_owner_name || null,
    po_requestor_email: po.po_owner_email || null,
  });

  const invoiceId = invoiceHdr.id;

  // Update invoice details
  const updateData: any = {
    po_number: poNumber,
    last_modified_by: userInfo.email,
    gl_date: new Date(),
    site_id: site ? String(site.id) : null,
    attribute_1: orgName,
    budget_segment: po.budget_segment || null,
    department: po.department_name || null,
    submitted_by: userInfo.fullName,
    invoice_reason: invoiceData.reason || null,
  };

  // Calculate due date based on payment terms
  if (po.po_payment_terms_id) {
    const dueDateTermsName = resolvedPaymentTermMaster?.terms_name || resolvedPaymentTermsName;
    if (dueDateTermsName) {
      const dueDate = calculateDueDate(new Date(invoiceHdr.invoice_date), dueDateTermsName);
      updateData.inv_due_date = dueDate;
    } else {
      updateData.inv_due_date = addDays(new Date(invoiceHdr.invoice_date), 15);
    }
  } else {
    updateData.inv_due_date = addDays(new Date(invoiceHdr.invoice_date), 15);
  }

  await repo.updateInvoice(invoiceId, updateData);

  // Upload documents
  if (files && files.length > 0) {
    const storageDir = path.default.join(process.cwd(), "uploads", "INVOICES", String(invoiceId));
    fs.default.mkdirSync(storageDir, { recursive: true });

    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      const timestamp = Date.now();
      const safeFilename = `${timestamp}_${file.originalname.replace(/[^a-zA-Z0-9_\-().]/g, "_")}`;
      const filePath = path.default.join(storageDir, safeFilename);
      fs.default.writeFileSync(filePath, file.buffer);

      const uploadPath = `/uploads/INVOICES/${invoiceId}/${safeFilename}`;
      const safeOriginalName = sanitizeFilename(file.originalname);

      // Cap preview at 512 KB — large bytea inserts cause DB connections to appear idle/hang
      const MAX_DOC_URI_BYTES = 512 * 1024;
      let docUriBuffer: Buffer | null = null;
      if (docPreviews && docPreviews[fi]) {
        const base64Data = docPreviews[fi]!.replace(/^data:image\/\w+;base64,/, "");
        const decoded = Buffer.from(base64Data, "base64");
        docUriBuffer = decoded.length <= MAX_DOC_URI_BYTES ? decoded : null;
      }

      await repo.insertSuppDocumentDtl({
        docNo: String(invoiceId),
        docName: "Advance Invoice Document",
        docType: "INVOICE_DOC",
        docValue: invoiceData.invoice_number,
        docDesc: "PO Advance Invoice Doc",
        docPath: uploadPath,
        fileName: safeOriginalName,
        status: "Active",
        recordType: "SUPP_INVOICE",
        supplierId: supplierId,
        attribute5: "New",
        createdBy: userInfo.email,
        docUri: docUriBuffer,
      });
    }
  }

  // Create single invoice line with advance amount
  await repo.createInvoiceLine({
    invoice_id: invoiceId,
    line_number: 1,
    item_name: `Advance Payment - ${poNumber}`,
    description: `Advance Payment for Purchase Order ${poNumber}`,
    order_qty: 1,
    order_unit_cost: invoiceAmount,
    order_cost: invoiceAmount,
    tax_amount: 0,
    tax_rate: 0,
    taxable_flag: "N",
    product_category_name: "Advance Payment",
    created_by: userInfo.email,
    org_id: orgId,
  });

  // Start workflow approval process
  const processName = "Invoice";
  const taskSubject = `PO Advance Invoice Approval Request - ${supplier.company_name} - Invoice No: ${invoiceData.invoice_number} - PO No: ${poNumber}`;

  const wfParams: Record<string, any> = {
    subject: taskSubject.length > 80 ? taskSubject.substring(0, 80) : taskSubject,
    srmsRefNumber: String(invoiceId),
    status: "Pending Approval",
    startDate: Date.now(),
    createdBy: userInfo.fullName,
    organization: orgName,
    department: po.department_name || "",
    amount: invoiceAmount.toString(),
    orgId: orgId,
  };

  let approversList: string[] = [];
  try {
    const checkApprList = await workflowService.getFirstStepApproversList(processName, wfParams);
    if (!checkApprList || checkApprList.length === 0) {
      throw { status: 400, message: "Approver Hierarchy or Approval Flow is not defined for this request!" };
    }
    approversList = await workflowService.getApproversList(processName, wfParams);
  } catch (err: any) {
    if (err.status) throw err;
    throw { status: 400, message: err.message || "Approval flow not configured" };
  }

  let taskId = "";
  try {
    taskId = await workflowService.startProcess(
      taskSubject.length > 80 ? taskSubject.substring(0, 80) : taskSubject,
      processName,
      String(invoiceId),
      wfParams,
      userInfo.userName
    );
  } catch (err: any) {
    throw { status: 400, message: err.message || "Failed to start approval workflow" };
  }

  // Update invoice with approval workflow details
  await repo.updateInvoice(invoiceId, {
    invoice_status: "Pending Approval",
    attribute_12: taskId,
    attribute_1: orgName,
    invoice_approvers: approversList.join(", "),
    last_modified_by: userInfo.userName,
  });
  const orgData = await adminRepo.getOrgDetails();
  publishTaskAssignmentEvent({
    taskId,
    templateEventId: "INVOICE_APPROVAL",
    taskSub: taskSubject,
    submittedBy: userInfo.fullName,
    department: po.department_name || "",
    domain: (userInfo as any).tenant,
    orgName: orgName,
    entityId: orgId != null ? String(orgId) : undefined,
    srmsRefNo: String(invoiceId),
    invoiceNo: invoiceData.invoice_number,
    description: invoiceData.description || `Advance Payment for PO ${poNumber}`,
    supplierName: supplier.company_name,
    variables: {
      invoiceNumber: invoiceData.invoice_number,
      invoiceDescription: invoiceData.description,
      orgLogoPath: orgData.org_logo_path,
    },
  });

  return {
    success: true,
    invoiceId,
    message: "PO Advance Invoice raised and submitted for approval",
  };
}

const COLLAB_MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

export async function downloadInvoiceDocument(docId: number) {
  const pathModule = await import("path");

  const suppDoc = await repo.getSuppDocumentById(docId);
  if (suppDoc) {
    if (!suppDoc.doc_path) throw { status: 404, message: "No file available for download" };
    const ext = pathModule.default.extname(suppDoc.filename || "").toLowerCase();
    const mimeType = COLLAB_MIME_MAP[ext] || "application/octet-stream";
    return { blobUrl: suppDoc.doc_path, mimeType, filename: suppDoc.filename || "document" };
  }

  const collabDoc = await repo.getCollaborationDocumentById(docId);
  if (collabDoc) {
    if (!collabDoc.file_path) throw { status: 404, message: "No file available for download" };
    const ext = pathModule.default.extname(collabDoc.file_name || "").toLowerCase();
    const mimeType = COLLAB_MIME_MAP[ext] || "application/octet-stream";
    return { blobUrl: collabDoc.file_path, mimeType, filename: collabDoc.file_name || "document" };
  }

  throw { status: 404, message: "Document not found" };
}

function calculateDueDate(invoiceDate: Date, termsName: string): Date {
  const normalized = (termsName || "").toString().trim();
  if(normalized === 'Immediate')
  {
    return addDays(invoiceDate, 0);
  }
  else
  {
  const match = normalized.match(/(\d+)/);
  const days = match ? parseInt(match[1], 10) : 15;
  return addDays(invoiceDate, days);
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export async function submitForApproval(invoiceId:string,
  userInfo: { email: string; userId: string; fullName: string; orgId: number; userName: string },
  tenant: string
)
{
  try
  {
  const { workflowService } = await import("../../services/workflowService");
  const orgData = await adminRepo.getOrgDetails();
  const invoiceData = await getInvoiceById(invoiceId);
  const processName = "Invoice";
  const taskSubject = `Invoice Approval Request-${invoiceData.supplier_name}-Invoice No:${invoiceData.invoice_number}`;
  
  let orgId = invoiceData.org_id || userInfo.orgId;
  let orgName = "";
  if (orgId) {
    const org = await repo.getOrgById(orgId);
    if (org) orgName = org.organization_name;
  } else {
    const lookup = await repo.getLookupValueByKey("SYSTEM_ORG_ID");
    if (lookup) {
      orgId = parseInt(lookup.description);
      const org = await repo.getOrgById(orgId);
      if (org) orgName = org.organization_name;
    }
  }

  const wfParams: Record<string, any> = {
    subject: taskSubject,
    srmsRefNumber: String(invoiceId),
    status: "Pending Approval",
    startDate: Date.now(),
    createdBy: userInfo.userName,
    organization: orgName,
    department: invoiceData.department_name || "",
    amount: parseFloat(invoiceData.invoice_amount || "0"),
    orgId: orgId,
  };

  let approversList: string[] = [];
  try {
    const checkApprList = await workflowService.getFirstStepApproversList(processName, wfParams);
    if (!checkApprList || checkApprList.length === 0) {
      throw { status: 400, message: "Approver Hierarchy or Approval Flow is not defined for this request!" };
    }
    approversList = await workflowService.getApproversList(processName, wfParams);
  } catch (err: any) {
    if (err.status) throw err;
    throw { status: 400, message: err.message || "Approval flow not configured" };
  }

  let taskId = "";
  try {
    taskId = await workflowService.startProcess(
      taskSubject,
      processName,
      String(invoiceId),
      wfParams,
      userInfo.userName
    );
  } catch (err: any) {
    throw { status: 400, message: err.message || "Failed to start approval workflow" };
  }

  await repo.updateInvoice(invoiceId, {
    invoice_status: "Pending Approval",
    attribute_12: taskId,
    attribute_1: orgName,
    invoice_approvers: approversList.join(", "),
    last_modified_by: userInfo.userName,
  });

  const approverEmail = await getPool().query(`select current_assignee from dbo.wf_step_instance where task_id=$1`,[taskId]);
  const appUrl = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='APP_URL'`);
  const apiKey = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);
  const approvalLink = appUrl.rows[0].prop_value+`/approval-action?apikey=${encodeURIComponent(apiKey.rows[0].prop_value)}&&module=${encodeURIComponent('Invoice')}&&taskId=${encodeURIComponent(taskId)}&&email=${encodeURIComponent(approverEmail.rows[0].current_assignee)}&&refnumber=${encodeURIComponent(invoiceId)}`;

  publishTaskAssignmentEvent({
    taskId,
    templateEventId: EventTypes.TASK_ASSIGNMENT.INVOICE_APPROVAL,
    taskSub: taskSubject,
    submittedBy: userInfo.fullName,
    department: invoiceData.department_name || "",
    domain: tenant,
    orgName: orgName,
    entityId: orgId != null ? String(orgId) : undefined,
    srmsRefNo: invoiceData.invoice_number,
    invoiceNo: invoiceData.invoice_number,
    description: invoiceData.description,
    supplierName: invoiceData.supplier_name,
    variables: 
    {
      invoiceNumber: invoiceData.invoice_number,
      invoiceDescription: invoiceData.description,
      submittedBy: userInfo.fullName,
      orgLogoPath: orgData.org_logo_path,
      emailApprovalLink:approvalLink,
    },
    emailApprovalLink:approvalLink,
  });

  return  "Successfully submitted for approval";
}
catch(error)
{
  console.error(error);
  return "Error failed to submit for approval";
}
}
