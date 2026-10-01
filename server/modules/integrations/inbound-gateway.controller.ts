import { Router, Request, Response, NextFunction } from "express";
import * as service from "./integrations.service";
import { createReceipt } from "../procurement/procurement.service";
import { pool } from "../_shared";
import { getContextPool } from "../../tenant-context";
const getPool = () => getContextPool() ?? pool;

const router = Router();

async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"] as string;
  if (!apiKey) {
    return res.status(401).json({
      error: "Authentication required",
      message: "Missing X-API-Key header. Provide a valid API key.",
    });
  }

  const key = await service.validateApiKey(apiKey);
  if (!key) {
    return res.status(403).json({
      error: "Invalid or expired API key",
      message: "The provided API key is invalid, revoked, or expired.",
    });
  }

  (req as any).apiKeyInfo = key;
  next();
}

router.get("/api/v1/integration/health", authenticateApiKey, (_req, res) => {
  res.json({
    status: "ok",
    service: "S2P Labs Integration Gateway",
    version: "1.0",
    timestamp: new Date().toISOString(),
  });
});

router.post("/api/v1/integration/inbound/receipt", authenticateApiKey, async (req: Request, res: Response) => {
  const apiKeyInfo = (req as any).apiKeyInfo;
  const startTime = Date.now();
  let logId: any = null;

  try {
    const body = req.body;

    if (!body.po_number) {
      const errMsg = "po_number is required";
      await service.logInboundTransaction({
        business_entity: "RECEIPT_CREATION",
        business_entity_method: "INBOUND_CREATE_RECEIPT",
        transaction_type: "Inbound",
        transaction_system: `API (${apiKeyInfo.key_name})`,
        status: "Error",
        log_msg: errMsg,
        log_msg_desc: JSON.stringify(body),
        http_status: "400",
        created_by: apiKeyInfo.key_name,
      });
      return res.status(400).json({ error: errMsg, field: "po_number" });
    }

    if (!body.receipt_number) {
      const errMsg = "receipt_number is required";
      await service.logInboundTransaction({
        business_entity: "RECEIPT_CREATION",
        business_entity_method: "INBOUND_CREATE_RECEIPT",
        transaction_type: "Inbound",
        transaction_system: `API (${apiKeyInfo.key_name})`,
        status: "Error",
        log_msg: errMsg,
        log_msg_desc: JSON.stringify(body),
        http_status: "400",
        created_by: apiKeyInfo.key_name,
      });
      return res.status(400).json({ error: errMsg, field: "receipt_number" });
    }

    if (!body.receipt_date) {
      const errMsg = "receipt_date is required";
      await service.logInboundTransaction({
        business_entity: "RECEIPT_CREATION",
        business_entity_method: "INBOUND_CREATE_RECEIPT",
        transaction_type: "Inbound",
        transaction_system: `API (${apiKeyInfo.key_name})`,
        status: "Error",
        log_msg: errMsg,
        log_msg_desc: JSON.stringify(body),
        http_status: "400",
        created_by: apiKeyInfo.key_name,
      });
      return res.status(400).json({ error: errMsg, field: "receipt_date" });
    }

    if (!body.received_location) {
      const errMsg = "received_location is required";
      await service.logInboundTransaction({
        business_entity: "RECEIPT_CREATION",
        business_entity_method: "INBOUND_CREATE_RECEIPT",
        transaction_type: "Inbound",
        transaction_system: `API (${apiKeyInfo.key_name})`,
        status: "Error",
        log_msg: errMsg,
        log_msg_desc: JSON.stringify(body),
        http_status: "400",
        created_by: apiKeyInfo.key_name,
      });
      return res.status(400).json({ error: errMsg, field: "received_location" });
    }

    if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
      const errMsg = "lines array is required with at least one line item";
      await service.logInboundTransaction({
        business_entity: "RECEIPT_CREATION",
        business_entity_method: "INBOUND_CREATE_RECEIPT",
        transaction_type: "Inbound",
        transaction_system: `API (${apiKeyInfo.key_name})`,
        status: "Error",
        log_msg: errMsg,
        log_msg_desc: JSON.stringify(body),
        http_status: "400",
        created_by: apiKeyInfo.key_name,
      });
      return res.status(400).json({ error: errMsg, field: "lines" });
    }

    const header = {
      receipt_date: body.receipt_date,
      receipt_number: body.receipt_number,
      receipt_notes: body.receipt_notes || "",
      received_location: body.received_location,
      received_location_id: body.received_location_id || "",
      po_number: body.po_number,
      supplier_name: body.supplier_name || "",
      created_by: body.created_by || apiKeyInfo.key_name,
      created_by_name: body.created_by_name || apiKeyInfo.key_name,
      requested_by: body.requested_by || null,
      org_id: body.org_id || null,
      site_id: body.site_id || null,
      currency_code: body.currency_code || null,
      wms_id: body.wms_id || null,
    };

    const lines = body.lines.map((line: any) => ({
      po_line_number: line.po_line_number,
      item_name: line.item_name || line.item_description || "",
      received_qty: parseFloat(line.received_qty) || 0,
      uom: line.uom || "EA",
      unit_price: parseFloat(line.unit_price) || 0,
      po_number: body.po_number,
      item_id: line.item_id || null,
      item_type: line.item_type || null,
      line_curr: line.currency || line.line_curr || null,
      discount: line.discount ? parseFloat(line.discount) : null,
      tax_rate_code: line.tax_rate_code || null,
    }));

    const result = await createReceipt(header, lines);

    const elapsed = Date.now() - startTime;
    await service.logInboundTransaction({
      business_entity: "RECEIPT_CREATION",
      business_entity_method: "INBOUND_CREATE_RECEIPT",
      transaction_type: "Inbound",
      transaction_system: `API (${apiKeyInfo.key_name})`,
      status: "Success",
      log_msg: `Receipt ${result.receiptnum} created for PO ${body.po_number}`,
      log_msg_desc: `Created successfully in ${elapsed}ms. Receipt: ${result.receiptnum}, Supplier Receipt: ${result.supp_receipt_no || 'N/A'}`,
      key_values: JSON.stringify({ po_number: body.po_number, receipt_number: result.receiptnum }),
      http_status: "201",
      created_by: apiKeyInfo.key_name,
    });

    res.status(201).json({
      success: true,
      message: "Receipt created successfully",
      data: {
        receipt_number: result.receiptnum,
        supplier_receipt_number: result.supp_receipt_no,
        po_number: body.po_number,
      },
    });
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    const statusCode = error?.status || 500;
    const errorMsg = error?.message || "Internal server error";

    await service.logInboundTransaction({
      business_entity: "RECEIPT_CREATION",
      business_entity_method: "INBOUND_CREATE_RECEIPT",
      transaction_type: "Inbound",
      transaction_system: `API (${apiKeyInfo.key_name})`,
      status: "Error",
      log_msg: errorMsg,
      log_msg_desc: `Failed after ${elapsed}ms. Error: ${errorMsg}. Payload: ${JSON.stringify(req.body).substring(0, 2000)}`,
      key_values: JSON.stringify({ po_number: req.body?.po_number }),
      http_status: String(statusCode),
      created_by: apiKeyInfo.key_name,
    }).catch(() => {});

    res.status(statusCode).json({ error: errorMsg });
  }
});

router.post("/api/v1/integration/inbound/purchase-requisition", authenticateApiKey, async (req: Request, res: Response) => {
  const apiKeyInfo = (req as any).apiKeyInfo;
  const startTime = Date.now();

  try {
    const body = req.body;

    const requiredChecks = [
      { field: "pr_number", msg: "pr_number is required" },
      { field: "pr_description", msg: "pr_description is required" },
    ];

    for (const check of requiredChecks) {
      if (!body[check.field]) {
        await service.logInboundTransaction({
          business_entity: "PR_CREATION",
          business_entity_method: "INBOUND_CREATE_PR",
          transaction_type: "Inbound",
          transaction_system: `API (${apiKeyInfo.key_name})`,
          status: "Error",
          log_msg: check.msg,
          log_msg_desc: JSON.stringify(body),
          http_status: "400",
          created_by: apiKeyInfo.key_name,
        });
        return res.status(400).json({ error: check.msg, field: check.field });
      }
    }

    if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
      const errMsg = "lines array is required with at least one line item";
      await service.logInboundTransaction({
        business_entity: "PR_CREATION",
        business_entity_method: "INBOUND_CREATE_PR",
        transaction_type: "Inbound",
        transaction_system: `API (${apiKeyInfo.key_name})`,
        status: "Error",
        log_msg: errMsg,
        log_msg_desc: JSON.stringify(body),
        http_status: "400",
        created_by: apiKeyInfo.key_name,
      });
      return res.status(400).json({ error: errMsg, field: "lines" });
    }

    const existing = await getPool().query(
      `SELECT pr_number FROM dbo.supp_pr_header_dtls WHERE pr_number = $1`,
      [body.pr_number]
    );
    if (existing.rows.length > 0) {
      const errMsg = `PR number '${body.pr_number}' already exists`;
      await service.logInboundTransaction({
        business_entity: "PR_CREATION",
        business_entity_method: "INBOUND_CREATE_PR",
        transaction_type: "Inbound",
        transaction_system: `API (${apiKeyInfo.key_name})`,
        status: "Error",
        log_msg: errMsg,
        log_msg_desc: JSON.stringify(body),
        http_status: "409",
        created_by: apiKeyInfo.key_name,
      });
      return res.status(409).json({ error: errMsg, field: "pr_number" });
    }

    const prStatus = body.pr_status || "Approved";
    const currency = body.currency || "AED";

    await getPool().query(
      `INSERT INTO dbo.supp_pr_header_dtls (
        pr_number, pr_description, pr_status, pr_type, 
        department_name, requestor_name, requestor_email,
        pr_owner_name, pr_owner_email,
        delivertto_location_name, delivery_date,
        budget_name, currency, pr_amount, notes,
        pr_created_date, creation_date, org_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW(), $16, $17)`,
      [
        body.pr_number, body.pr_description, prStatus, body.pr_type || "STANDARD",
        body.department_name || null, body.requestor_name || null, body.requestor_email || null,
        body.pr_owner_name || null, body.pr_owner_email || null,
        body.delivertto_location_name || null, body.delivery_date || null,
        body.budget_name || null, currency, 0, body.notes || null,
        body.org_id || null, body.created_by || apiKeyInfo.key_name,
      ]
    );

    let totalAmount = 0;
    const maxIdResult = await getPool().query(`SELECT COALESCE(MAX(id), 0) as max_id FROM dbo.supp_pr_line_dtls`);
    let nextId = maxIdResult.rows[0].max_id + 1;

    for (const line of body.lines) {
      const qty = parseFloat(line.qty) || 0;
      const unitCost = parseFloat(line.unit_cost) || 0;
      const amount = line.amount ? parseFloat(line.amount) : qty * unitCost;
      totalAmount += amount;

      await getPool().query(
        `INSERT INTO dbo.supp_pr_line_dtls 
         (id, pr_number, line_num, item_description, qty, uom, unit_cost, amount, 
          product_category_name, item_id, curr_code, status, creation_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
        [
          nextId++, body.pr_number, line.line_num || 1,
          line.item_description || "", qty, line.uom || "EA",
          unitCost, amount,
          line.product_category_name || null, line.item_id || null,
          line.curr_code || currency, prStatus,
        ]
      );
    }

    await getPool().query(
      `UPDATE dbo.supp_pr_header_dtls SET pr_amount = $1 WHERE pr_number = $2`,
      [totalAmount, body.pr_number]
    );

    const elapsed = Date.now() - startTime;
    await service.logInboundTransaction({
      business_entity: "PR_CREATION",
      business_entity_method: "INBOUND_CREATE_PR",
      transaction_type: "Inbound",
      transaction_system: `API (${apiKeyInfo.key_name})`,
      status: "Success",
      log_msg: `PR ${body.pr_number} created with ${body.lines.length} lines`,
      log_msg_desc: `Created successfully in ${elapsed}ms. Amount: ${totalAmount}`,
      key_values: JSON.stringify({ pr_number: body.pr_number }),
      http_status: "201",
      created_by: apiKeyInfo.key_name,
    });

    res.status(201).json({
      success: true,
      message: "Purchase Requisition created successfully",
      data: {
        pr_number: body.pr_number,
        pr_status: prStatus,
        pr_amount: totalAmount,
      },
    });
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    const statusCode = error?.status || 500;
    const errorMsg = error?.message || "Internal server error";

    await service.logInboundTransaction({
      business_entity: "PR_CREATION",
      business_entity_method: "INBOUND_CREATE_PR",
      transaction_type: "Inbound",
      transaction_system: `API (${apiKeyInfo.key_name})`,
      status: "Error",
      log_msg: errorMsg,
      log_msg_desc: `Failed after ${elapsed}ms. Error: ${errorMsg}`,
      key_values: JSON.stringify({ pr_number: req.body?.pr_number }),
      http_status: String(statusCode),
      created_by: apiKeyInfo.key_name,
    }).catch(() => {});

    res.status(statusCode).json({ error: errorMsg });
  }
});

router.post("/api/v1/integration/inbound/purchase-order", authenticateApiKey, async (req: Request, res: Response) => {
  const apiKeyInfo = (req as any).apiKeyInfo;
  const startTime = Date.now();

  try {
    const body = req.body;

    const requiredChecks = [
      { field: "po_number", msg: "po_number is required" },
      { field: "po_description", msg: "po_description is required" },
      { field: "company_name", msg: "company_name is required" },
    ];

    for (const check of requiredChecks) {
      if (!body[check.field]) {
        await service.logInboundTransaction({
          business_entity: "PO_CREATION",
          business_entity_method: "INBOUND_CREATE_PO",
          transaction_type: "Inbound",
          transaction_system: `API (${apiKeyInfo.key_name})`,
          status: "Error",
          log_msg: check.msg,
          log_msg_desc: JSON.stringify(body),
          http_status: "400",
          created_by: apiKeyInfo.key_name,
        });
        return res.status(400).json({ error: check.msg, field: check.field });
      }
    }

    if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
      const errMsg = "lines array is required with at least one line item";
      await service.logInboundTransaction({
        business_entity: "PO_CREATION",
        business_entity_method: "INBOUND_CREATE_PO",
        transaction_type: "Inbound",
        transaction_system: `API (${apiKeyInfo.key_name})`,
        status: "Error",
        log_msg: errMsg,
        log_msg_desc: JSON.stringify(body),
        http_status: "400",
        created_by: apiKeyInfo.key_name,
      });
      return res.status(400).json({ error: errMsg, field: "lines" });
    }

    const existing = await getPool().query(
      `SELECT po_number FROM dbo.supp_po_header_dtls WHERE po_number = $1`,
      [body.po_number]
    );
    if (existing.rows.length > 0) {
      const errMsg = `PO number '${body.po_number}' already exists`;
      await service.logInboundTransaction({
        business_entity: "PO_CREATION",
        business_entity_method: "INBOUND_CREATE_PO",
        transaction_type: "Inbound",
        transaction_system: `API (${apiKeyInfo.key_name})`,
        status: "Error",
        log_msg: errMsg,
        log_msg_desc: JSON.stringify(body),
        http_status: "409",
        created_by: apiKeyInfo.key_name,
      });
      return res.status(409).json({ error: errMsg, field: "po_number" });
    }

    const poStatus = body.po_status || "Approved";
    const currency = body.po_currency || "AED";

    await getPool().query(
      `INSERT INTO dbo.supp_po_header_dtls (
        po_number, po_description, po_type, po_status, 
        supplier_id, company_name, 
        buyer_name, buyer_email,
        po_owner_name, po_owner_email,
        department_name, po_currency, 
        delivertto_location_name,
        shipto_address, billto_address,
        po_required_date, creation_date, po_issue_date,
        budget_name, payment_terms_name,
        advance_flag, advance_percentage,
        pr_number, org_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW(), $17, $18, $19, $20, $21, $22)`,
      [
        body.po_number, body.po_description, body.po_type || "STANDARD", poStatus,
        body.supplier_id || null, body.company_name,
        body.buyer_name || null, body.buyer_email || null,
        body.po_owner_name || null, body.po_owner_email || null,
        body.department_name || null, currency,
        body.delivertto_location_name || null,
        body.shipto_address || null, body.billto_address || null,
        body.po_required_date || null,
        body.budget_name || null, body.payment_terms_name || null,
        body.advance_flag || null, body.advance_percentage || null,
        body.pr_number || null, body.org_id || null,
      ]
    );

    let netCost = 0;
    let taxTotal = 0;
    const maxLineIdResult = await getPool().query(`SELECT COALESCE(MAX(id), 0) as max_id FROM dbo.supp_po_line_dtls`);
    let nextLineId = maxLineIdResult.rows[0].max_id + 1;

    for (const line of body.lines) {
      const qty = parseFloat(line.line_qty) || 0;
      const unitCost = parseFloat(line.line_unit_cost) || 0;
      const lineNet = qty * unitCost;
      const taxRate = parseFloat(line.tax_rate) || 0;
      const taxAmount = line.tax_amount != null ? parseFloat(line.tax_amount) : lineNet * (taxRate / 100);
      const lineCost = line.line_cost != null ? parseFloat(line.line_cost) : lineNet + taxAmount;

      netCost += lineNet;
      taxTotal += taxAmount;

      await getPool().query(
        `INSERT INTO dbo.supp_po_line_dtls 
         (id, po_number, po_line_number, line_description, line_qty, line_unit_cost, line_unit, line_curr,
          tax_rate, tax_rate_code, taxable_flag, tax_amount, line_cost, line_status, 
          item_id, item_name, product_category_name, creation_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())`,
        [
          nextLineId++, body.po_number, line.po_line_number || 1,
          line.line_description || "", qty, unitCost,
          line.line_unit || "EA", line.line_curr || currency,
          taxRate, line.tax_rate_code || null, line.taxable_flag || null,
          taxAmount, lineCost, poStatus,
          line.item_id || null, line.item_name || null,
          line.product_category_name || null,
        ]
      );
    }

    const totalCost = netCost + taxTotal;
    await getPool().query(
      `UPDATE dbo.supp_po_header_dtls 
       SET po_net_cost = $1, po_tax = $2, po_total_cost = $3
       WHERE po_number = $4`,
      [netCost, taxTotal, totalCost, body.po_number]
    );

    const elapsed = Date.now() - startTime;
    await service.logInboundTransaction({
      business_entity: "PO_CREATION",
      business_entity_method: "INBOUND_CREATE_PO",
      transaction_type: "Inbound",
      transaction_system: `API (${apiKeyInfo.key_name})`,
      status: "Success",
      log_msg: `PO ${body.po_number} created with ${body.lines.length} lines`,
      log_msg_desc: `Created successfully in ${elapsed}ms. Total: ${totalCost}`,
      key_values: JSON.stringify({ po_number: body.po_number }),
      http_status: "201",
      created_by: apiKeyInfo.key_name,
    });

    res.status(201).json({
      success: true,
      message: "Purchase Order created successfully",
      data: {
        po_number: body.po_number,
        po_status: poStatus,
        po_total_cost: totalCost,
      },
    });
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    const statusCode = error?.status || 500;
    const errorMsg = error?.message || "Internal server error";

    await service.logInboundTransaction({
      business_entity: "PO_CREATION",
      business_entity_method: "INBOUND_CREATE_PO",
      transaction_type: "Inbound",
      transaction_system: `API (${apiKeyInfo.key_name})`,
      status: "Error",
      log_msg: errorMsg,
      log_msg_desc: `Failed after ${elapsed}ms. Error: ${errorMsg}`,
      key_values: JSON.stringify({ po_number: req.body?.po_number }),
      http_status: String(statusCode),
      created_by: apiKeyInfo.key_name,
    }).catch(() => {});

    res.status(statusCode).json({ error: errorMsg });
  }
});

router.post("/api/v1/integration/inbound/payment", authenticateApiKey, async (req: Request, res: Response) => {
  const apiKeyInfo = (req as any).apiKeyInfo;
  const startTime = Date.now();

  try {
    const body = req.body;

    const requiredChecks = [
      { field: "invoice_number", msg: "invoice_number is required" },
      { field: "payment_method", msg: "payment_method is required" },
      { field: "payment_date", msg: "payment_date is required" },
      { field: "amount_paid", msg: "amount_paid is required" },
    ];

    for (const check of requiredChecks) {
      if (!body[check.field] && body[check.field] !== 0) {
        await service.logInboundTransaction({
          business_entity: "PAYMENT_CREATION",
          business_entity_method: "INBOUND_CREATE_PAYMENT",
          transaction_type: "Inbound",
          transaction_system: `API (${apiKeyInfo.key_name})`,
          status: "Error",
          log_msg: check.msg,
          log_msg_desc: JSON.stringify(body),
          http_status: "400",
          created_by: apiKeyInfo.key_name,
        });
        return res.status(400).json({ error: check.msg, field: check.field });
      }
    }

    const invoiceResult = await getPool().query(
      `SELECT id, invoice_number, invoice_amount, invoice_curr_code FROM dbo.supp_invoice_dtls WHERE invoice_number = $1`,
      [body.invoice_number]
    );
    if (invoiceResult.rows.length === 0) {
      const errMsg = `Invoice '${body.invoice_number}' not found`;
      await service.logInboundTransaction({
        business_entity: "PAYMENT_CREATION",
        business_entity_method: "INBOUND_CREATE_PAYMENT",
        transaction_type: "Inbound",
        transaction_system: `API (${apiKeyInfo.key_name})`,
        status: "Error",
        log_msg: errMsg,
        log_msg_desc: JSON.stringify(body),
        http_status: "404",
        created_by: apiKeyInfo.key_name,
      });
      return res.status(404).json({ error: errMsg, field: "invoice_number" });
    }

    const invoice = invoiceResult.rows[0];
    const amountPaid = parseFloat(body.amount_paid) || 0;

    const paymentId = Math.floor(Math.random() * (2000000000 - 100000000)) + 100000000;
    await getPool().query(
      `INSERT INTO dbo.supp_invoice_payment_dtls (
         id, invid, paymentmethod, paymentdescription, payment_date,
         amountpaid, invoiceamount, paymentcurrcode, invpaymentstatus, invoicestatus,
         bankname, bankbranch, onlinetrsfdacntno, banktransferrefno,
         checknumber, checkdate, checkcollectedby, checkcollectiondate,
         checkcollectorcontactno, checkcollectoremail,
         tdscategory, tdspcrnt, tdsamount
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, 'Paid', 'Paid',
         $9, $10, $11, $12,
         $13, $14, $15, $16,
         $17, $18,
         $19, $20, $21
       )`,
      [
        paymentId, invoice.id, body.payment_method, body.payment_description || null, body.payment_date,
        amountPaid, invoice.invoice_amount || amountPaid, body.payment_curr_code || invoice.invoice_curr_code || "AED",
        body.bank_name || null, body.bank_branch || null,
        body.online_transfer_account_no || null, body.bank_transfer_ref_no || null,
        body.cheque_number || null, body.cheque_date || null,
        body.cheque_collected_by || null, body.cheque_collection_date || null,
        body.cheque_collector_contact_no || null, body.cheque_collector_email || null,
        body.tds_category || null, body.tds_percentage || null, body.tds_amount || 0,
      ]
    );

    await getPool().query(
      `UPDATE dbo.supp_invoice_dtls 
       SET inv_payment_status = 'Paid', 
           invoice_status = 'Paid',
           ppayment_amount = $1,
           last_modified_date = NOW()
       WHERE id = $2`,
      [amountPaid, invoice.id]
    );

    const elapsed = Date.now() - startTime;
    await service.logInboundTransaction({
      business_entity: "PAYMENT_CREATION",
      business_entity_method: "INBOUND_CREATE_PAYMENT",
      transaction_type: "Inbound",
      transaction_system: `API (${apiKeyInfo.key_name})`,
      status: "Success",
      log_msg: `Payment recorded for invoice ${body.invoice_number}`,
      log_msg_desc: `Created successfully in ${elapsed}ms. Amount: ${amountPaid}, Method: ${body.payment_method}`,
      key_values: JSON.stringify({ invoice_number: body.invoice_number, amount_paid: amountPaid }),
      http_status: "201",
      created_by: apiKeyInfo.key_name,
    });

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data: {
        invoice_number: body.invoice_number,
        payment_status: "Paid",
        amount_paid: amountPaid,
        payment_method: body.payment_method,
      },
    });
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    const statusCode = error?.status || 500;
    const errorMsg = error?.message || "Internal server error";

    await service.logInboundTransaction({
      business_entity: "PAYMENT_CREATION",
      business_entity_method: "INBOUND_CREATE_PAYMENT",
      transaction_type: "Inbound",
      transaction_system: `API (${apiKeyInfo.key_name})`,
      status: "Error",
      log_msg: errorMsg,
      log_msg_desc: `Failed after ${elapsed}ms. Error: ${errorMsg}`,
      key_values: JSON.stringify({ invoice_number: req.body?.invoice_number }),
      http_status: String(statusCode),
      created_by: apiKeyInfo.key_name,
    }).catch(() => {});

    res.status(statusCode).json({ error: errorMsg });
  }
});

router.get("/api/v1/integration/inbound/endpoints", authenticateApiKey, (_req, res) => {
  res.json({
    service: "S2P Labs Integration Gateway",
    version: "1.0",
    endpoints: [
      {
        method: "POST",
        path: "/api/v1/integration/inbound/receipt",
        description: "Create a Goods Receipt Note (GRN) against a Purchase Order",
        authentication: "X-API-Key header",
      },
      {
        method: "POST",
        path: "/api/v1/integration/inbound/purchase-requisition",
        description: "Create a Purchase Requisition from ERP",
        authentication: "X-API-Key header",
      },
      {
        method: "POST",
        path: "/api/v1/integration/inbound/purchase-order",
        description: "Create a Purchase Order from ERP",
        authentication: "X-API-Key header",
      },
      {
        method: "POST",
        path: "/api/v1/integration/inbound/payment",
        description: "Record payment details against an Invoice",
        authentication: "X-API-Key header",
      },
      {
        method: "GET",
        path: "/api/v1/integration/health",
        description: "Check if the integration gateway is running",
        authentication: "X-API-Key header",
      },
    ],
    error_codes: {
      "400": "Bad Request — Missing or invalid required fields",
      "401": "Unauthorized — Missing X-API-Key header",
      "403": "Forbidden — Invalid, revoked, or expired API key",
      "404": "Not Found — Referenced entity (e.g., PO, Invoice) not found",
      "409": "Conflict — Duplicate record already exists",
      "500": "Internal Server Error — Unexpected server error",
    },
  });
});

export const inboundGatewayController = router;
