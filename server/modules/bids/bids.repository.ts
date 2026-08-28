import { sql } from "drizzle-orm";
import { db } from "../../db";
import { getContextDb } from "../../tenant-context";
const getDb = () => getContextDb() ?? db;

/**
 * Sentinel stored in supp_bid_requirement_dtls.created_by to mark criteria produced
 * by the AI generator/regenerator. Used to distinguish AI-authored questions from
 * manually-entered ones (styling + regeneration behavior) without a schema change.
 */
export const AI_REQUIREMENT_AUTHOR = "AI Assistant";

export async function getDboBids() {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET status = 'Closed',
        last_updated_date = NOW()
    WHERE status in ('Published', 'Negotiation')
      AND enddate IS NOT NULL
      AND enddate < NOW()
  `);

  const result = await getDb().execute(sql`
    SELECT 
      b.id,
      b.bid_title,
      b.type,
      b.status,
      b.description,
      b.currency,
      b.startdate,
      b.enddate,
      b.created_by,
      b.created_date,
      b.last_updated_by,
      b.last_updated_date,
      b.buyer,
      b.buyer_name,
      b.department_name,
      b.pr_number,
      b.pr_amount,
      b.award_amount,
      b.awarded_amount,
      COALESCE(supp.invited_count, 0) as no_invited_supps,
      b.operating_unit,
      b.category_id,
      b.attribute_4 as bid_number,
      b.requestor_name,
      b.bid_style,
      b.negotiation_style,
      b.env_open_date,
      b.notes_to_supplier,
      b.paymentterms,
      b.shiptoaddress,
      b.delivertto_location_name,
      b.template_name,
      b.tech_score_weightage,
      b.commercial_score_weightage,
      b.buyer_email,
      COALESCE(ack.ack_count, 0) as bid_acknowledges,
      COALESCE(resp.resp_count, 0) as bid_responses
    FROM dbo.supp_bid_dtls b
    LEFT JOIN (
      SELECT bidrefno, COUNT(*) as invited_count
      FROM dbo.supp_bid_supplier_dtls
      WHERE (status IS NULL OR status != 'Deleted')
      GROUP BY bidrefno
    ) supp ON supp.bidrefno = b.id
    LEFT JOIN (
      SELECT bidrefno, COUNT(*) as ack_count
      FROM dbo.supp_bid_ack_dtls
      WHERE status != 'Deleted'
      GROUP BY bidrefno
    ) ack ON ack.bidrefno = b.id
    LEFT JOIN (
      SELECT bidrefno, COUNT(*) as resp_count
      FROM dbo.supp_bid_response_dtls
      WHERE status = 'Submitted'
      GROUP BY bidrefno
    ) resp ON resp.bidrefno = b.id
    WHERE (b.status IS NULL OR b.status != 'Deleted')
    ORDER BY b.last_updated_date DESC
  `);
  return result.rows.map((row: any) => ({
    id: row.id,
    bidTitle: row.bid_title || '',
    type: row.type || 'RFQ',
    status: row.status || 'Draft',
    description: row.description || '',
    currency: row.currency || 'USD',
    startDate: row.startdate,
    endDate: row.enddate,
    createdBy: row.created_by || '',
    createdDate: row.created_date,
    lastUpdatedBy: row.last_updated_by,
    lastUpdatedDate: row.last_updated_date,
    buyer: row.buyer || '',
    buyerName: row.buyer_name || '',
    buyerEmail: row.buyer_email || '',
    departmentName: row.department_name || '',
    prNumber: row.pr_number || '',
    prAmount: row.pr_amount ? parseFloat(row.pr_amount) : 0,
    awardAmount: row.award_amount ? parseFloat(row.award_amount) : 0,
    awardedAmount: row.awarded_amount ? parseFloat(row.awarded_amount) : 0,
    noInvitedSupps: row.no_invited_supps ? parseInt(row.no_invited_supps) : 0,
    bidResponses: parseInt(row.bid_responses) || 0,
    operatingUnit: row.operating_unit,
    categoryId: row.category_id,
    bidNumber: row.bid_number || '',
    requestorName: row.requestor_name || '',
    bidStyle: row.bid_style || '',
    negotiationStyle: row.negotiation_style || '',
    envOpenDate: row.env_open_date,
    notesToSupplier: row.notes_to_supplier || '',
    paymentTerms: row.paymentterms || '',
    shipToAddress: row.shiptoaddress || '',
    deliverToLocation: row.delivertto_location_name || '',
    templateName: row.template_name || '',
    techScoreWeightage: row.tech_score_weightage || 0,
    commercialScoreWeightage: row.commercial_score_weightage || 0,
    bidAcknowledges: parseInt(row.bid_acknowledges) || 0,
  }));
}


export async function getCurrentApprover(bidId: string, processName: string) {
  const result = await getDb().execute(sql`
    SELECT u.name, si.current_assignee FROM dbo.wf_step_instance si
    join dbo.wf_instance i on si.instance_id = i.id
    join dbo.um_user_dtls u on si.current_assignee = u.email_id
    where si.ref_number = ${bidId} and si.status = 'Ready'
    and i.process_name = ${processName}`
  );
  if(result.rows.length > 0) {
    return result.rows[0];
  }
  const result2 = await getDb().execute(sql`
    SELECT si.current_assignee as name FROM dbo.wf_step_instance si
    join dbo.wf_instance i on si.instance_id = i.id
    where si.ref_number = ${bidId} and si.status = 'Ready'
    and i.process_name = ${processName}`
  );
  if(result2.rows.length > 0) {
    return result2.rows[0];
  }
}

export async function getSupplierPendingBids(supplierId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET status = 'Closed',
        last_updated_date = NOW()
    WHERE status in ('Published', 'Negotiation')
      AND enddate IS NOT NULL
      AND enddate < NOW()
  `);

  const result = await getDb().execute(sql`
    SELECT 
      b.id,
      b.bid_title,
      b.type,
      b.status as bid_status,
      b.startdate,
      b.enddate,
      b.attribute_4 as bid_number,
      b.currency,
      b.department_name,
      b.buyer_name,
      b.description,
      b.delivertto_location_name,
      s.id as invite_id,
      s.status as invite_status,
      s.creation_date as invited_date,
      c.status AS ack_status
    FROM dbo.supp_bid_supplier_dtls s
    JOIN dbo.supp_bid_dtls b ON b.id = s.bidrefno
    LEFT JOIN dbo.supp_bid_ack_dtls c 
      ON c.bidrefno = s.bidrefno
      AND c.supplier_id = s.supplier_id
    WHERE s.supplier_id = ${supplierId} AND c.status IS NULL AND b.status NOT IN ('Draft', 'Pending Approval', 'Closed', 'Deleted','Awarded','Cancelled','Rejected')
    ORDER BY b.last_updated_date DESC
  `);
  return result.rows.map((row: any) => ({
    id: row.id,
    bidTitle: row.bid_title || '',
    type: row.type || 'RFQ',
    bidStatus: row.bid_status || '',
    startDate: row.startdate,
    endDate: row.enddate,
    bidNumber: row.bid_number || '',
    currency: row.currency || 'USD',
    departmentName: row.department_name || '',
    buyerName: row.buyer_name || '',
    description: row.description || '',
    deliveryLocation: row.delivertto_location_name || '',
    inviteId: row.invite_id,
    inviteStatus: row.invite_status || '',
    invitedDate: row.invited_date,
    ack_status: row.ack_status,
  }));
}

export async function getSupplierBidResponses(supplierId: number) {
  const result = await getDb().execute(sql`
    SELECT 
      r.id,
      r.bidrefno,
      r.supplier_id,
      r.bidtitle,
      r.bidtype,
      r.bidstartdate,
      r.bidenddate,
      r.supplier_site,
      r.status,
      r.created_by,
      r.creation_date,
      r.last_modified_by,
      r.last_updated_date,
      r.bidtotal,
      r.supplier_contact,
      r.supplier_contact_no,
      r.supplier_name,
      r.grosstotal,
      r.biddisc,
      r.version,
      r.recommended,
      r.is_commercially_selected,
      r.is_technically_selected,
      b.attribute_4 as bid_number,
      b.currency,
      b.department_name,
      b.buyer_name,
      b.delivertto_location_name,
      b.status as bid_status
    FROM dbo.supp_bid_response_dtls r
    LEFT JOIN dbo.supp_bid_dtls b ON b.id = r.bidrefno
    WHERE r.supplier_id = ${supplierId} and b.status NOT IN ('Draft', 'Pending Approval')
    ORDER BY r.last_updated_date DESC
  `);
  return result.rows.map((row: any) => ({
    id: row.id,
    bidRefNo: row.bidrefno,
    supplierId: row.supplier_id,
    bidTitle: row.bidtitle || '',
    bidType: row.bidtype || 'RFQ',
    bidStartDate: row.bidstartdate,
    bidEndDate: row.bidenddate,
    supplierSite: row.supplier_site || '',
    status: row.status || 'Draft',
    createdBy: row.created_by || '',
    creationDate: row.creation_date,
    lastModifiedBy: row.last_modified_by,
    lastUpdatedDate: row.last_updated_date,
    bidTotal: row.bidtotal ? parseFloat(row.bidtotal) : 0,
    supplierContact: row.supplier_contact || '',
    supplierContactNo: row.supplier_contact_no || '',
    supplierName: row.supplier_name || '',
    grossTotal: row.grosstotal ? parseFloat(row.grosstotal) : 0,
    bidDiscount: row.biddisc ? parseFloat(row.biddisc) : 0,
    version: row.version || 1,
    recommended: row.recommended || '',
    isCommerciallySelected: row.is_commercially_selected || '',
    isTechnicallySelected: row.is_technically_selected || '',
    bidNumber: row.bid_number || '',
    currency: row.currency || 'USD',
    departmentName: row.department_name || '',
    buyerName: row.buyer_name || '',
    deliveryLocation: row.delivertto_location_name || '',
    bidStatus: row.bid_status || '',
  }));
}

export async function getSupplierBidInvite(bidId: number, supplierId: number) {
  const result = await getDb().execute(sql`
    SELECT s.id, s.status, s.supplier_id, s.supplier_name, s.supplier_site,
      s.supplier_contact, s.supplier_contact_email, s.creation_date
    FROM dbo.supp_bid_supplier_dtls s
    WHERE s.bidrefno = ${bidId} AND (s.supplier_id::text = ${supplierId}::text OR s.supplier_id = ${supplierId})
    LIMIT 1
  `);
  return result.rows[0] || null;
}

export async function updateSupplierBidInviteStatus(bidId: number, supplierId: number, status: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_supplier_dtls
    SET status = ${status}, last_modified_date = NOW()
    WHERE bidrefno = ${bidId} AND supplier_id = ${supplierId}
  `);
  return getSupplierBidInvite(bidId, supplierId);
}

async function getBidPrefixValue(bidType: string): Promise<string> {
  const defaultPrefixMap: Record<string, string> = { 'Tender': 'TND', 'RFP': 'RFP', 'RFQ': 'RFQ' };
  const defaultPrefix = defaultPrefixMap[bidType] || 'RFQ';

  let prefixResult;
  if (bidType === 'Tender') {
    prefixResult = await getDb().execute(sql`
      SELECT prefix_value FROM dbo.am_prefix_mst
      WHERE UPPER(TRIM(prefix_name)) IN ('TENDER', 'TND') AND status = 'Active' LIMIT 1
    `);
  } else if (bidType === 'RFP') {
    prefixResult = await getDb().execute(sql`
      SELECT prefix_value FROM dbo.am_prefix_mst
      WHERE UPPER(TRIM(prefix_name)) IN ('RFP', 'REQUEST FOR PROPOSAL') AND status = 'Active' LIMIT 1
    `);
  } else {
    prefixResult = await getDb().execute(sql`
      SELECT prefix_value FROM dbo.am_prefix_mst
      WHERE UPPER(TRIM(prefix_name)) IN ('RFQ', 'REQUEST FOR QUOTATION') AND status = 'Active' LIMIT 1
    `);
  }
  return ((prefixResult.rows[0] as any)?.prefix_value?.trim()) || defaultPrefix;
}

export async function generateBidNumber(bidType: string): Promise<string> {
  const prefix = await getBidPrefixValue(bidType);
  const year = new Date().getFullYear().toString().slice(-2);
  const pattern = prefix + year + '%';

  const result = await getDb().execute(sql`
    SELECT COALESCE(
      MAX(CAST(REPLACE(attribute_4, ${prefix + year}, '') AS INTEGER)), 0
    ) + 1 AS next_num
    FROM dbo.supp_bid_dtls
    WHERE attribute_4 LIKE ${pattern}
  `);
  const nextNum = (result.rows[0] as any)?.next_num || 1;
  return `${prefix}${year}${String(nextNum).padStart(4, '0')}`;
}

export async function updateBidPrefixOnly(
  bidId: number,
  bidType: string,
  existingBidNumber: string
): Promise<string> {
  if (!existingBidNumber || typeof existingBidNumber !== "string") {
    throw new Error("Invalid or missing existing bid number");
  }
  const newPrefix = await getBidPrefixValue(bidType);
  if (existingBidNumber.startsWith(newPrefix)) {
    return existingBidNumber;
  }
  // Allocate next available number for the new type (same as create-bid), 
  // instead of only swapping the prefix and keeping the numeric suffix —
  // that can collide if e.g. RFP260053 already exists when converting RFQ260053.
  const newBidNumber = await generateBidNumber(bidType);
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET attribute_4 = ${newBidNumber}
    WHERE id = ${bidId}
  `);
  return newBidNumber;
}

export async function getLocationById(locationId: number) {
  const result = await getDb().execute(sql`
    SELECT id, location_name, shipto_address, billto_address
    FROM dbo.am_locations_mst
    WHERE id = ${locationId}
  `);
  return result.rows[0] || null;
}

export async function getUserById(userId: number) {
  const result = await getDb().execute(sql`
    SELECT u.id, u.user_name, u.name, u.email_id, u.department_name,
           o.organization_name
    FROM dbo.um_user_dtls u
    LEFT JOIN dbo.um_org_dtls o ON u.org_id = o.id
    WHERE u.id = ${userId}
  `);
  return result.rows[0] || null;
}
export async function getUserByEmail(email: string) {
  const result = await getDb().execute(sql`
    SELECT name, email_id FROM dbo.um_user_dtls
    WHERE email_id = ${email}
  `);
  return result.rows[0] || null;
}

export async function getAllCommitteeMembers() {
  const result = await getDb().execute(sql`
    SELECT id, user_id, is_head FROM dbo.supp_bid_committee
  `);
  return result.rows;
}

export async function insertDboBid(data: any): Promise<any> {
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_dtls`);
  const id = (idResult.rows[0] as any).next_id;
  const result = await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_dtls (
      id, bid_title, type, bid_style, description, currency,
      startdate, enddate, env_open_date,
      buyer, buyer_name, buyer_email,
      requestor, requestor_name, requestor_email, department_name,
      pr_number, operating_unit, paymentterms,
      delivertto_location_id, delivertto_location_name,
      billtoaddress, shiptoaddress,
      is_contract_required, contract_template_id, template_name,
      payment_required, payment_amount,
      bond_required, bond_amount_pcnt,
      status, bid_responses, attribute_4,
      created_by, created_date, last_updated_by, last_updated_date,
      org_id, budget_name, budget_segment
    ) VALUES (
      ${id}, ${data.bid_title}, ${data.type}, ${data.bid_style},
      ${data.description || null}, ${data.currency || 'USD'},
      ${data.startdate || null}, ${data.enddate || null}, ${data.env_open_date || null},
      ${data.buyer || null}, ${data.buyer_name || null}, ${data.buyer_email || null},
      ${data.requestor || null}, ${data.requestor_name || null}, ${data.requestor_email || null},
      ${data.department_name || null},
      ${data.pr_number || null}, ${data.operating_unit || null}, ${data.paymentterms || null},
      ${data.delivertto_location_id || null}, ${data.delivertto_location_name || null},
      ${data.billtoaddress || null}, ${data.shiptoaddress || null},
      ${data.is_contract_required || null}, ${data.contract_template_id || null},
      ${data.template_name || null},
      ${data.payment_required || 'N'}, ${data.payment_amount || null},
      ${data.bond_required || 'N'}, ${data.bond_amount_pcnt || null},
      'Draft', 0, ${data.bid_number},
      ${data.created_by || 'System'}, NOW(), ${data.created_by || 'System'}, NOW(),
      ${data.org_id || null}, ${data.budget_name || null}, ${data.budget_segment || null}
    )
    RETURNING id, attribute_4 as bid_number
  `);
  return result.rows[0];
}

export async function updateDboBid(bidId: number, data: any): Promise<any> {
  const result = await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls SET
      bid_title = ${data.bid_title},
      type = ${data.type},
      bid_style = ${data.bid_style},
      description = ${data.description || null},
      currency = ${data.currency || 'USD'},
      startdate = ${data.startdate || null},
      enddate = ${data.enddate || null},
      env_open_date = ${data.env_open_date || null},
      buyer = ${data.buyer || null},
      buyer_name = ${data.buyer_name || null},
      buyer_email = ${data.buyer_email || null},
      requestor = ${data.requestor || null},
      requestor_name = ${data.requestor_name || null},
      requestor_email = ${data.requestor_email || null},
      department_name = ${data.department_name || null},
      pr_number = ${data.pr_number || null},
      operating_unit = ${data.operating_unit || null},
      paymentterms = ${data.paymentterms || null},
      delivertto_location_id = ${data.delivertto_location_id || null},
      delivertto_location_name = ${data.delivertto_location_name || null},
      billtoaddress = ${data.billtoaddress || null},
      shiptoaddress = ${data.shiptoaddress || null},
      is_contract_required = ${data.is_contract_required || null},
      contract_template_id = ${data.contract_template_id || null},
      template_name = ${data.template_name || null},
      payment_required = ${data.payment_required || 'N'},
      payment_amount = ${data.payment_amount || null},
      bond_required = ${data.bond_required || 'N'},
      bond_amount_pcnt = ${data.bond_amount_pcnt || null},
      last_updated_by = ${data.created_by || 'System'},
      last_updated_date = NOW(),
      org_id = COALESCE(${data.org_id || null}, org_id)
    WHERE id = ${bidId}
    RETURNING id, attribute_4 as bid_number
  `);
  return result.rows[0];
}

export async function getDboBidById(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT b.*, u.user_name as buyer_login_id, u.department_name as buyer_department
    FROM dbo.supp_bid_dtls b
    LEFT JOIN dbo.um_user_dtls u ON b.buyer = u.user_name
    WHERE b.id = ${bidId}
  `);
  return result.rows[0] || null;
}

export async function getDboBidByNumber(bidRef: string) {
  const result = await getDb().execute(sql`
    SELECT b.*, u.user_name as buyer_login_id, u.department_name as buyer_department
    FROM dbo.supp_bid_dtls b
    LEFT JOIN dbo.um_user_dtls u ON b.buyer = u.user_name
    WHERE b.attribute_4 = ${bidRef} OR b.id::text = ${bidRef}
    LIMIT 1
  `);
  return result.rows[0] || null;
}

export async function markEnvelopeOpened(bidId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET env_opened = 'Y', env_opened_date = NOW()
    WHERE id = ${bidId}
  `);
}

export async function insertBidApprover(data: { bidrefno: number; user_id: number; teamtype: string; logged_id?: string }) {
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_approvers`);
  const generatedId = (idResult.rows[0] as any).next_id;
  await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_approvers (id, bidrefno, user_id, teamtype, logged_id)
    VALUES (${generatedId}, ${data.bidrefno}, ${data.user_id}, ${data.teamtype}, ${data.logged_id || null})
  `);
}

export async function deleteBidApproversByBidId(bidId: number) {
  await getDb().execute(sql`
    DELETE FROM dbo.supp_bid_approvers WHERE bidrefno = ${bidId}
  `);
}

export async function updateBidResponseDates(
  bidId: number,
  startdate: string | null,
  enddate: string | null,
  lastModifiedBy?: string | null,
) {
  if (lastModifiedBy != null && String(lastModifiedBy).trim() !== "") {
    await getDb().execute(sql`
      UPDATE dbo.supp_bid_response_dtls
      SET bidstartdate = ${startdate},
          bidenddate = ${enddate},
          last_modified_by = ${lastModifiedBy},
          last_updated_date = NOW()
      WHERE bidrefno = ${bidId}
    `);
  } else {
    await getDb().execute(sql`
      UPDATE dbo.supp_bid_response_dtls
      SET bidstartdate = ${startdate}, bidenddate = ${enddate}
      WHERE bidrefno = ${bidId}
    `);
  }
}

/** Manual close (legacy closeBid): set end to now, status Closed, sync response window. */
export async function markBidClosedNow(bidId: number, lastUpdatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls SET
      enddate = NOW(),
      status = 'Closed',
      last_updated_by = ${lastUpdatedBy},
      last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
}

export async function getPrLinesByItemIds(itemIds: number[]) {
  if (!itemIds.length) return [];
  const placeholders = itemIds.map(id => `${id}`).join(',');
  const result = await getDb().execute(sql.raw(`
    SELECT l.*, h.pr_number, h.requestor_name as pr_requestor_name, 
           h.requestor_id as pr_requestor_id, h.delivery_date as pr_delivery_date
    FROM dbo.supp_pr_line_dtls l
    JOIN dbo.supp_pr_header_dtls h ON l.pr_number = h.pr_number
    WHERE l.id IN (${placeholders})
  `));
  return result.rows;
}

export async function insertBidLine(data: any) {
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_line_dtls`);
  const lineId = (idResult.rows[0] as any).next_id;
  await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_line_dtls (
      id, bidrefno, linetype, description, currency, uom, quantity,
      currentprice, needbyfrom, needbyto, status,
      item_id, product_category, product_category_id,
      shiptoaddress, req_line_id,
      last_purchase_date, last_purchase_rate,
      attribute_1, attribute_5, attribute_12, attribute_13, attribute_14, attribute_15,
      created_by, created_date
    ) VALUES (
      ${lineId}, ${data.bidrefno}, ${data.linetype || null}, ${data.description || null},
      ${data.currency || null}, ${data.uom || null}, ${data.quantity || 0},
      ${data.currentprice || null}, ${data.needbyfrom || null}, ${data.needbyto || null},
      ${data.status || null}, ${data.item_id || 0},
      ${data.product_category || ''}, ${data.product_category_id || null},
      ${data.shiptoaddress || ''}, ${data.req_line_id || null},
      ${data.last_purchase_date || null}, ${data.last_purchase_rate || null},
      ${data.attribute_1 || null}, ${data.attribute_5 || null},
      ${data.attribute_12 || null}, ${data.attribute_13 || null},
      ${data.attribute_14 || null}, ${data.attribute_15 || null},
      ${data.created_by || 'System'}, NOW()
    )
  `);
}

export async function updateBidLineCurrency(bidId: number, currency: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_line_dtls SET currency = ${currency} WHERE bidrefno = ${bidId}
  `);
}

export async function updatePrPoNumber(prNumber: string, poType: string, bidId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_pr_line_dtls SET po_number = ${poType}
    WHERE pr_number = ${prNumber}
  `);
}

export async function copyBidLinesFromTemplate(sourceBidId: number, targetBidId: number, createdBy: string) {
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) as max_id FROM dbo.supp_bid_line_dtls`);
  const startId = (idResult.rows[0] as any).max_id;
  await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_line_dtls (
      id, bidrefno, linetype, description, currency, uom, quantity,
      currentprice, needbyfrom, needbyto, status,
      item_id, product_category, product_category_id,
      shiptoaddress, req_line_id,
      last_purchase_date, last_purchase_rate,
      created_by, created_date
    )
    SELECT
      ${startId} + ROW_NUMBER() OVER (ORDER BY id),
      ${targetBidId}, linetype, description, currency, uom, quantity,
      currentprice, needbyfrom, needbyto, status,
      item_id, product_category, product_category_id,
      shiptoaddress, req_line_id,
      last_purchase_date, last_purchase_rate,
      ${createdBy}, NOW()
    FROM dbo.supp_bid_line_dtls
    WHERE bidrefno = ${sourceBidId}
  `);
}

export async function getPrHeaderByPrNumber(prNumber: string) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_pr_header_dtls WHERE pr_number = ${prNumber}
  `);
  return result.rows[0] || null;
}

export async function getPrLinesByPrNumber(prNumber: string) {
  const result = await getDb().execute(sql`
    SELECT l.*, h.pr_number, h.requestor_name as pr_requestor_name,
           h.requestor_id as pr_requestor_id, h.delivery_date as pr_delivery_date
    FROM dbo.supp_pr_line_dtls l
    JOIN dbo.supp_pr_header_dtls h ON l.pr_number = h.pr_number
    WHERE l.pr_number = ${prNumber}
    ORDER BY l.line_num
  `);
  return result.rows;
}

export async function getDboBidLine(bidLineId: number) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_line_dtls WHERE id = ${bidLineId}
  `);
  return result.rows[0] || null;
}

export async function updatePrHeader(prNumber: string, updates: { attribute_7?: string; bidno?: number }) {
  await getDb().execute(sql`
    UPDATE dbo.supp_pr_header_dtls
    SET attribute_7 = ${updates.attribute_7 || null},
        bidno = ${updates.bidno || null}
    WHERE pr_number = ${prNumber}
  `);
}

export async function getBidApprovers(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT ba.*, u.name as user_name_full, u.email_id, u.user_name as login_id
    FROM dbo.supp_bid_approvers ba
    LEFT JOIN dbo.um_user_dtls u ON ba.user_id = u.id
    WHERE ba.bidrefno = ${bidId}
  `);
  return result.rows;
}

export async function getApproversByUserIdsAndBid(userIds: number[], bidId: number) {
  if (!userIds.length) return [];
  const ids = userIds.join(',');
  const result = await getDb().execute(sql.raw(`
    SELECT ba.*, u.name as user_name_full, u.email_id
    FROM dbo.supp_bid_approvers ba
    LEFT JOIN dbo.um_user_dtls u ON ba.user_id = u.id
    WHERE ba.bidrefno = ${bidId} AND ba.user_id IN (${ids})
  `));
  return result.rows;
}

export async function checkUserHasAdminRole(userId: number): Promise<boolean> {
  const result = await getDb().execute(sql`
    SELECT COUNT(*) as cnt FROM dbo.um_user_roles_map_dtls urm
    JOIN dbo.um_role_dtls r ON urm.role_id = r.id
    WHERE urm.user_id = ${userId}
    AND (r.role_name = 'ROLE_SUPERADMIN' OR r.role_name = 'ROLE_SYSADMIN')
  `);
  return parseInt((result.rows[0] as any)?.cnt || '0') > 0;
}

export async function getUserEmailById(userId: number): Promise<string | null> {
  const result = await getDb().execute(sql`
    SELECT email_id FROM dbo.um_user_dtls WHERE id = ${userId}
  `);
  return (result.rows[0] as any)?.email_id || null;
}

export async function copyBidClausesFromTemplate(sourceBidId: number, targetBidId: number) {
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) as max_id FROM dbo.supp_bid_clauses`);
  const startId = (idResult.rows[0] as any).max_id;
  await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_clauses (
      id, bidrefno, class_desc, class_ref, type, weight, knockoutscore,
      attribute_1, attribute_2, attribute_3, attribute_4, attribute_5,
      attribute_6, attribute_7, attribute_8, attribute_9, attribute_10,
      attribute_11, attribute_12, attribute_13, attribute_14, attribute_15,
      created_by, creation_date
    )
    SELECT
      ${startId} + ROW_NUMBER() OVER (ORDER BY id),
      ${targetBidId}, class_desc, class_ref, type, weight, knockoutscore,
      attribute_1, attribute_2, attribute_3, attribute_4, attribute_5,
      attribute_6, attribute_7, attribute_8, attribute_9, attribute_10,
      attribute_11, attribute_12, attribute_13, attribute_14, attribute_15,
      created_by, NOW()
    FROM dbo.supp_bid_clauses
    WHERE bidrefno = ${sourceBidId}
  `);
}

export async function copyBidRequirementsFromTemplate(sourceBidId: number, targetBidId: number) {
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) as max_id FROM dbo.supp_bid_requirement_dtls`);
  const startId = (idResult.rows[0] as any).max_id;
  await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_requirement_dtls (
      id, bidrefno, category, question, qvoption, qvtype, target, weight,
      score, knockoutscore, scoringmethod, lov,
      attribute_1, attribute_2, attribute_3, attribute_4, attribute_5,
      attribute_6, attribute_7, attribute_8, attribute_9, attribute_10,
      attribute_11, attribute_12, attribute_13, attribute_14, attribute_15,
      created_by, creation_date
    )
    SELECT
      ${startId} + ROW_NUMBER() OVER (ORDER BY id),
      ${targetBidId}, category, question, qvoption, qvtype, target, weight,
      score, knockoutscore, scoringmethod, lov,
      attribute_1, attribute_2, attribute_3, attribute_4, attribute_5,
      attribute_6, attribute_7, attribute_8, attribute_9, attribute_10,
      attribute_11, attribute_12, attribute_13, attribute_14, attribute_15,
      created_by, NOW()
    FROM dbo.supp_bid_requirement_dtls
    WHERE bidrefno = ${sourceBidId}
  `);
}

export async function copyBidAttachmentsFromTemplate(sourceBidId: number, targetBidId: number) {
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) as max_id FROM dbo.supp_bid_attachment_dtls`);
  const startId = (idResult.rows[0] as any).max_id;
  await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_attachment_dtls (
      id, bidrefno, supplier_id, attach_name, attach_desc, attach_type,
      attach_source, attach_path, status,
      attribute_1, attribute_2, attribute_3, attribute_4, attribute_5,
      attribute_6, attribute_7, attribute_8, attribute_9, attribute_10,
      attribute_11, attribute_12, attribute_13, attribute_14, attribute_15,
      created_by, created_date
    )
    SELECT
      ${startId} + ROW_NUMBER() OVER (ORDER BY id),
      ${targetBidId}, supplier_id, attach_name, attach_desc, attach_type,
      attach_source, attach_path, status,
      attribute_1, attribute_2, attribute_3, attribute_4, attribute_5,
      attribute_6, attribute_7, attribute_8, attribute_9, attribute_10,
      attribute_11, attribute_12, attribute_13, attribute_14, attribute_15,
      created_by, NOW()
    FROM dbo.supp_bid_attachment_dtls
    WHERE bidrefno = ${sourceBidId}
  `);
}

export async function copyBidSuppliersFromTemplate(sourceBidId: number, targetBidId: number) {
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) as max_id FROM dbo.supp_bid_supplier_dtls`);
  const startId = (idResult.rows[0] as any).max_id;
  await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_supplier_dtls (
      id, bidrefno, supplier_id, supplier_name, supplier_site,
      supplier_contact, supplier_contact_email, supplier_contact_no,
      status, created_by, creation_date
    )
    SELECT
      ${startId} + ROW_NUMBER() OVER (ORDER BY id),
      ${targetBidId}, supplier_id, supplier_name, supplier_site,
      supplier_contact, supplier_contact_email, supplier_contact_no,
      'Invited', created_by, NOW()
    FROM dbo.supp_bid_supplier_dtls
    WHERE bidrefno = ${sourceBidId} AND supplier_id > 0
  `);
}

export async function updateDboBidTemplateFields(bidId: number, data: any) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls SET
      bid_style = COALESCE(${data.bid_style || null}, bid_style),
      type = COALESCE(${data.type || null}, type),
      tech_score_weightage = COALESCE(${data.tech_score_weightage ?? null}, tech_score_weightage),
      commercial_score_weightage = COALESCE(${data.commercial_score_weightage ?? null}, commercial_score_weightage),
      paymentterms = COALESCE(${data.paymentterms || null}, paymentterms),
      shiptoaddress = COALESCE(${data.shiptoaddress || null}, shiptoaddress),
      billtoaddress = COALESCE(${data.billtoaddress || null}, billtoaddress),
      notes_to_supplier = COALESCE(${data.notes_to_supplier || null}, notes_to_supplier),
      negotiation_style = COALESCE(${data.negotiation_style || null}, negotiation_style),
      outcome = COALESCE(${data.outcome || null}, outcome),
      price_precision = COALESCE(${data.price_precision || null}, price_precision),
      bid_title = COALESCE(${data.bid_title || null}, bid_title),
      startdate = COALESCE(${data.startdate || null}, startdate),
      enddate = COALESCE(${data.enddate || null}, enddate),
      env_open_date = COALESCE(${data.env_open_date || null}, env_open_date),
      buyer = COALESCE(${data.buyer || null}, buyer),
      buyer_name = COALESCE(${data.buyer_name || null}, buyer_name),
      buyer_email = COALESCE(${data.buyer_email || null}, buyer_email),
      requestor = COALESCE(${data.requestor || null}, requestor),
      requestor_name = COALESCE(${data.requestor_name || null}, requestor_name),
      currency = COALESCE(${data.currency || null}, currency),
      operating_unit = COALESCE(${data.operating_unit || null}, operating_unit),
      attribute_13 = COALESCE(${data.attribute_13 || null}, attribute_13),
      attribute_15 = COALESCE(${data.attribute_15 || null}, attribute_15),
      last_updated_date = NOW(),
      org_id = COALESCE(${data.org_id || null}, org_id)
    WHERE id = ${bidId}
  `);
}

export async function getLookupByKey(key: string) {
  const result = await getDb().execute(sql`
    SELECT description FROM dbo.am_lookup_values_dtls
    WHERE lookup_key = ${key} LIMIT 1
  `);
  return result.rows[0] || null;
}

export async function getDboBidDetailById(bidId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET status = 'Closed',
        last_updated_date = NOW()
    WHERE id = ${bidId}
      AND status in ('Published', 'Negotiation')
      AND enddate IS NOT NULL
      AND enddate < NOW()
  `);

  const result = await getDb().execute(sql`
    SELECT b.*,
      b.attribute_4 as bid_number,
      u.user_name as buyer_login_id, u.department_name as buyer_department
    FROM dbo.supp_bid_dtls b
    LEFT JOIN dbo.um_user_dtls u ON b.buyer = u.user_name
    WHERE b.id = ${bidId}
  `);
  return result.rows[0] || null;
}

export async function getDboBidIdStatus(bidId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET status = 'Closed',
        last_updated_date = NOW()
    WHERE id = ${bidId}
      AND status in ('Published', 'Negotiation')
      AND enddate IS NOT NULL
      AND enddate < NOW()
  `);

  const result = await getDb().execute(sql`
    SELECT id, status FROM dbo.supp_bid_dtls WHERE id = ${bidId}
  `);
  console.log("DB RESULT:", result);
  return result.rows[0] || null;
}

export async function updateDboBidHeader(bidId: number, data: any) {
  const setClauses: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  const allowedFields = [
    'bid_title', 'type', 'bid_style', 'status', 'description', 'notes_to_supplier',
    'enddate', 'startdate', 'env_open_date',
    'currency', 'paymentterms', 'shiptoaddress', 'billtoaddress',
    'buyer', 'buyer_name', 'buyer_email',
    'requestor', 'requestor_name', 'requestor_email', 'department_name',
    'delivertto_location_id', 'delivertto_location_name',
    'negotiation_style', 'tech_score_weightage', 'commercial_score_weightage',
    'bond_required', 'bond_amount_pcnt', 'payment_required', 'payment_amount',
    'template_name', 'last_updated_by', 'org_id'
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (data[field] === null) {
        setClauses.push(`${field} = NULL`);
      } else if (field === 'delivertto_location_id') {
        setClauses.push(`${field} = ${parseInt(data[field])}`);
      } else {
        setClauses.push(`${field} = '${String(data[field]).replace(/'/g, "''")}'`);
      }
    }
  }
  if (!setClauses.length) return getDboBidDetailById(bidId);
  const setStr = setClauses.join(', ');
  await getDb().execute(sql.raw(`
    UPDATE dbo.supp_bid_dtls SET ${setStr}, last_updated_date = NOW() WHERE id = ${bidId}
  `));
  return getDboBidDetailById(bidId);
}

export async function getDboBidLines(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_line_dtls WHERE bidrefno = ${bidId} ORDER BY id
  `);
  return result.rows;
}

/** Buyer switch for showing the FMPI benchmark to invited suppliers. */
export async function setBidFmpVisibility(bidId: number, enabled: boolean, updatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET show_fmp_to_supplier = ${enabled},
        last_updated_by = ${updatedBy},
        last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
}

/** Reads just the FMPI visibility flag — used to gate supplier-facing payloads. */
export async function getBidFmpVisibility(bidId: number): Promise<boolean> {
  const result = await getDb().execute(sql`
    SELECT show_fmp_to_supplier FROM dbo.supp_bid_dtls WHERE id = ${bidId}
  `);
  return (result.rows[0] as any)?.show_fmp_to_supplier === true;
}

export async function addDboBidLine(bidId: number, data: any, user?: any) {
  const createdBy = user?.email || user?.username || 'System';
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_line_dtls`);
  const nextId = idResult.rows[0].next_id;
  const bidResult = await getDb().execute(sql`SELECT delivertto_location_name, shiptoaddress FROM dbo.supp_bid_dtls WHERE id = ${bidId}`);
  const bidShipTo = bidResult.rows[0]?.delivertto_location_name || bidResult.rows[0]?.shiptoaddress || '';
  const result = await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_line_dtls (
      id, bidrefno, linetype, description, currency, uom, quantity,
      currentprice, needbyfrom, needbyto, product_category,
      product_category_id, item_id, shiptoaddress, status,
      created_by, created_date
    ) VALUES (
      ${nextId}, ${bidId}, ${data.linetype || 'Goods'}, ${data.description || ''},
      ${data.currency || 'INR'}, ${data.uom || 'EA'}, ${data.quantity || 1},
      ${data.currentprice || 0}, ${data.needbyfrom || null}, ${data.needbyto || null},
      ${data.product_category || ''}, ${data.product_category_id || null},
      ${data.item_id || null}, ${data.shiptoaddress || bidShipTo}, ${'In review'},
      ${createdBy}, NOW()
    ) RETURNING *
  `);
  return result.rows[0];
}

export async function updateDboBidLineById(lineId: number, data: any, user?: any) {
  const updatedBy = user?.email || user?.username || 'System';
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_line_dtls SET
      linetype = COALESCE(${data.linetype || null}, linetype),
      description = COALESCE(${data.description || null}, description),
      uom = COALESCE(${data.uom || null}, uom),
      quantity = COALESCE(${data.quantity || null}, quantity),
      currentprice = COALESCE(${data.currentprice || null}, currentprice),
      needbyfrom = COALESCE(${data.needbyfrom || null}, needbyfrom),
      needbyto = COALESCE(${data.needbyto || null}, needbyto),
      last_updated_by = ${updatedBy}, last_updated_date = NOW()
    WHERE id = ${lineId}
  `);
  const result = await getDb().execute(sql`SELECT * FROM dbo.supp_bid_line_dtls WHERE id = ${lineId}`);
  return result.rows[0];
}

export async function deleteDboBidLineById(lineId: number) {
  await getDb().execute(sql`DELETE FROM dbo.supp_bid_line_dtls WHERE id = ${lineId}`);
}

export async function getDboBidSuppliers(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_supplier_dtls WHERE bidrefno = ${bidId} ORDER BY id
  `);
  return result.rows;
}

export async function getBidsBySupplierName(
  supplierName: string,
  supplierId?: number,
  respondedOnly?: boolean,
  invitationStatusFilter?: string,
) {
  const result = await getDb().execute(sql`
    SELECT
      b.id                    AS bid_id,
      b.attribute_4           AS bid_number,
      b.bid_title,
      b.type                  AS bid_type,
      b.status                AS bid_status,
      b.startdate             AS start_date,
      b.enddate               AS end_date,
      b.currency,
      b.department_name,
      b.buyer_name,
      s.id                    AS invite_id,
      s.supplier_id,
      s.supplier_name,
      s.supplier_site,
      s.supplier_contact_email,
      s.status                AS invitation_status,
      s.creation_date         AS invited_date,
      a.status                AS ack_type,
      r.status                AS response_status,
      r.bidtotal              AS response_total,
      r.creation_date         AS response_date
    FROM dbo.supp_bid_supplier_dtls s
    JOIN dbo.supp_bid_dtls b ON b.id = s.bidrefno
    LEFT JOIN dbo.supp_bid_ack_dtls a
      ON a.bidrefno = s.bidrefno AND a.supplier_id = s.supplier_id
    LEFT JOIN dbo.supp_bid_response_dtls r
      ON r.bidrefno = s.bidrefno AND r.supplier_id = s.supplier_id
    WHERE (s.status IS NULL OR s.status != 'Deleted')
      AND (
        ${supplierId ? sql`s.supplier_id = ${supplierId}` : sql`s.supplier_name ILIKE ${'%' + supplierName + '%'}`}
      )
      ${respondedOnly ? sql`AND r.status IS NOT NULL AND r.status NOT IN ('Draft', 'Deleted')` : sql``}
      ${invitationStatusFilter ? sql`AND LOWER(s.status) = LOWER(${invitationStatusFilter})` : sql``}
    ORDER BY COALESCE(r.creation_date, s.creation_date) DESC
  `);
  return result.rows;
}

/**
 * Suppliers who acknowledged "Participating" on at least one bid but have NEVER
 * submitted an actual response to ANY bid across their entire history (their responses
 * are missing entirely or stuck at the Draft stub stage created at acknowledgement time).
 * This is a global, cross-supplier scan — distinct from suppliers who were merely invited
 * and never acknowledged at all.
 */
export async function getSuppliersNotResponded() {
  const result = await getDb().execute(sql`
    SELECT
      a.supplier_id,
      a.suppliername                             AS supplier_name,
      COUNT(DISTINCT a.bidrefno)                  AS bids_acknowledged_participating,
      MAX(a.creation_date)                        AS last_acknowledged_date,
      STRING_AGG(DISTINCT b.attribute_4, ', ')    AS bid_numbers
    FROM dbo.supp_bid_ack_dtls a
    JOIN dbo.supp_bid_dtls b ON b.id = a.bidrefno
    WHERE a.status = 'Participating'
    GROUP BY a.supplier_id, a.suppliername
    HAVING NOT EXISTS (
      SELECT 1
      FROM dbo.supp_bid_response_dtls r
      WHERE r.supplier_id = a.supplier_id
        AND r.status NOT IN ('Draft', 'Deleted')
    )
    ORDER BY a.suppliername
  `);
  return result.rows;
}

/**
 * Suppliers who have been invited to at least one bid but have NEVER acknowledged
 * (neither Participating nor Not Participating) ANY of their invitations across their
 * entire history. "Never" is scoped to the supplier as a whole — a supplier who
 * acknowledged even one of their invited bids is excluded, even if they left other
 * invitations un-acknowledged. This is a global, cross-supplier scan — distinct from
 * suppliers who DID acknowledge but never followed through with an actual response.
 */
export async function getSuppliersNeverAcknowledged() {
  const result = await getDb().execute(sql`
    SELECT
      s.supplier_id,
      s.supplier_name,
      COUNT(DISTINCT s.bidrefno)                  AS bids_invited_to,
      MAX(s.creation_date)                        AS last_invited_date,
      STRING_AGG(DISTINCT b.attribute_4, ', ')    AS bid_numbers
    FROM dbo.supp_bid_supplier_dtls s
    JOIN dbo.supp_bid_dtls b ON b.id = s.bidrefno
    WHERE (s.status IS NULL OR s.status != 'Deleted')
    GROUP BY s.supplier_id, s.supplier_name
    HAVING NOT EXISTS (
      SELECT 1
      FROM dbo.supp_bid_ack_dtls a
      WHERE a.supplier_id = s.supplier_id
    )
    ORDER BY s.supplier_name
  `);
  return result.rows;
}

export async function addDboBidSupplier(bidId: number, data: any, user?: any) {
  const createdBy = user?.email || user?.username || 'System';
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_supplier_dtls`);
  const id = (idResult.rows[0] as any).next_id;
  const result = await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_supplier_dtls (
      id, bidrefno, supplier_id, supplier_name, supplier_site,
      supplier_contact, supplier_contact_email, supplier_contact_no,
      status, created_by, creation_date
    ) VALUES (
      ${id}, ${bidId}, ${data.supplier_id}, ${data.supplier_name || ''},
      ${data.supplier_site || ''}, ${data.supplier_contact || ''},
      ${data.supplier_contact_email || ''}, ${data.supplier_contact_no || ''},
      ${'Invited'}, ${createdBy}, NOW()
    ) RETURNING *
  `);
  return result.rows[0];
}

export async function deleteDboBidSupplierById(suppId: number) {
  await getDb().execute(sql`DELETE FROM dbo.supp_bid_supplier_dtls WHERE id = ${suppId}`);
}

export async function getDboBidRequirements(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_requirement_dtls WHERE bidrefno = ${bidId} ORDER BY id
  `);
  return result.rows;
}

export async function addDboBidRequirement(bidId: number, data: any, user?: any) {
  // Allow callers (e.g. AI generation) to explicitly tag the source via data.createdBy;
  // otherwise fall back to the acting user.
  const createdBy = data.createdBy || user?.email || user?.username || 'System';
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_requirement_dtls`);
  const manualId = (idResult.rows[0] as any).next_id;
  const result = await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_requirement_dtls (
      id, bidrefno, category, question, qvoption, qvtype, target,
      weight, score, knockoutscore, scoringmethod, lov,
      created_by, creation_date
    ) VALUES (
      ${manualId}, ${bidId}, ${data.category || 'Technical'}, ${data.question || ''},
      ${data.qvoption || 'Required'}, ${data.qvtype || 'Text'}, ${data.target || null},
      ${data.weight || '100'}, ${data.score || null}, ${data.knockoutscore || null},
      ${data.scoringmethod || null}, ${data.lov || null},
      ${createdBy}, NOW()
    ) RETURNING *
  `);
  return result.rows[0];
}

export async function updateDboBidRequirementById(reqId: number, data: any, user?: any) {
  const updatedBy = user?.email || user?.username || 'System';
  const result = await getDb().execute(sql`
    UPDATE dbo.supp_bid_requirement_dtls SET
      category = COALESCE(${data.category || null}, category),
      question = COALESCE(${data.question || null}, question),
      qvoption = COALESCE(${data.qvoption || null}, qvoption),
      qvtype = COALESCE(${data.qvtype || null}, qvtype),
      target = COALESCE(${data.target || null}, target),
      weight = COALESCE(${data.weight || null}, weight),
      lov = COALESCE(${data.lov || null}, lov)
    WHERE id = ${reqId}
    RETURNING *
  `);
  return result.rows[0];
}


export async function deleteDboBidRequirementById(reqId: number) {
  await getDb().execute(sql`DELETE FROM dbo.supp_bid_requirement_dtls WHERE id = ${reqId}`);
}

export async function getDboBidClauses(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_clauses WHERE bidrefno = ${bidId} ORDER BY id
  `);
  return result.rows;
}

export async function addDboBidClause(bidId: number, data: any, user?: any) {
  const createdBy = user?.email || user?.username || 'System';
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_clauses`);
  const generatedId = (idResult.rows[0] as any).next_id;
  const result = await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_clauses (
      id, bidrefno, type, class_desc, class_ref, weight, knockoutscore,
      created_by, creation_date, last_updated_by, last_updated_date
    ) VALUES (
      ${generatedId}, ${bidId}, ${data.type || 'terms'}, ${data.class_desc || ''},
      ${data.class_ref || null}, ${data.weight || 0}, ${data.knockoutscore || null},
      ${createdBy}, NOW(), ${createdBy}, NOW()
    ) RETURNING *
  `);
  return result.rows[0];
}

export async function deleteDboBidClauseById(clauseId: number) {
  await getDb().execute(sql`DELETE FROM dbo.supp_bid_clauses WHERE id = ${clauseId}`);
}

export async function getDboBidApprovers(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT a.*, u.name as user_name, u.email_id as user_email, u.department_name as user_department, u.user_name as login_id
    FROM dbo.supp_bid_approvers a
    LEFT JOIN dbo.um_user_dtls u ON a.user_id = u.id
    WHERE a.bidrefno = ${bidId}
    ORDER BY a.teamtype, a.id
  `);
  return result.rows;
}

export async function deleteDboBidApproverById(approverId: number) {
  await getDb().execute(sql`DELETE FROM dbo.supp_bid_approvers WHERE id = ${approverId}`);
}

export async function getDboBidAttachments(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_attachment_dtls
    WHERE bidrefno = ${bidId} AND (status IS NULL OR status != 'Deleted') AND (supplier_id IS NULL OR supplier_id = 0)
    ORDER BY id
  `);
  return result.rows;
}

export async function addDboBidAttachment(bidId: number, data: any, user?: any) {
  const createdBy = user?.email || user?.username || 'System';
  const maxIdResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_attachment_dtls`);
  const nextId = (maxIdResult.rows[0] as any).next_id;
  const result = await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_attachment_dtls (
      id, bidrefno, supplier_id, attach_name, attach_desc, attach_type,
      attach_source, attach_path, status,
      created_by, created_date, last_modified_by, last_modified_date
    ) VALUES (
      ${nextId}, ${bidId}, 0, ${data.attach_name || ''}, ${data.attach_desc || ''},
      ${data.attach_type || 'application/pdf'}, ${data.attach_source || 'Lines'},
      ${data.attach_path || ''}, ${'Active'},
      ${createdBy}, NOW(), ${createdBy}, NOW()
    ) RETURNING *
  `);
  return result.rows[0];
}

export async function deleteDboBidAttachmentById(attachId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_attachment_dtls SET status = 'Deleted' WHERE id = ${attachId}
  `);
}

export async function deleteDboBidById(bidId: number) {
  const bidResult = await getDb().execute(sql`SELECT pr_number FROM dbo.supp_bid_dtls WHERE id = ${bidId}`);
  const prNumber = (bidResult.rows[0] as any)?.pr_number;

  await getDb().execute(sql`UPDATE dbo.supp_bid_dtls SET status = 'Deleted', last_updated_date = NOW() WHERE id = ${bidId}`);

  if (prNumber) {
    await getDb().execute(sql`
      UPDATE dbo.supp_pr_header_dtls SET bidno = NULL, attribute_7 = NULL, po_number = NULL 
      WHERE pr_number = ${prNumber}
    `);
  }
}

export async function getSupplierResponseAttachments(bidId: number, supplierId: number) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_attachment_dtls
    WHERE bidrefno = ${bidId} AND supplier_id = ${supplierId} AND (status IS NULL OR status != 'Deleted')
    ORDER BY id
  `);
  return result.rows;
}

export async function addSupplierResponseAttachment(bidId: number, supplierId: number, data: any, user?: any) {
  const createdBy = user?.email || user?.username || 'System';
  const maxIdResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_attachment_dtls`);
  const nextId = (maxIdResult.rows[0] as any).next_id;
  const result = await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_attachment_dtls (
      id, bidrefno, supplier_id, attach_name, attach_desc, attach_type,
      attach_source, attach_path, status, attribute_1,
      created_by, created_date, last_modified_by, last_modified_date
    ) VALUES (
      ${nextId}, ${bidId}, ${supplierId}, ${data.attach_name || ''}, ${data.attach_desc || ''},
      ${data.attach_type || 'application/pdf'}, ${data.attach_source || 'Technical'},
      ${data.attach_path || ''}, ${'Active'},
      ${data.response_id || ''},
      ${createdBy}, NOW(), ${createdBy}, NOW()
    ) RETURNING *
  `);
  return result.rows[0];
}

export async function deleteSupplierResponseAttachment(attachId: number, supplierId: number) {
  const result = await getDb().execute(sql`
    SELECT supplier_id FROM dbo.supp_bid_attachment_dtls WHERE id = ${attachId}
  `);
  if (result.rows.length === 0) throw { status: 404, message: "Attachment not found" };
  if (String((result.rows[0] as any).supplier_id) !== String(supplierId)) {
    throw { status: 403, message: "Access denied" };
  }
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_attachment_dtls SET status = 'Deleted' WHERE id = ${attachId}
  `);
}

export async function getSupplierResponseAttachmentById(attachId: number) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_attachment_dtls WHERE id = ${attachId} AND (status IS NULL OR status != 'Deleted')
  `);
  return result.rows[0] || null;
}

/** Invited supplier count and PR line total for publish / tender-approval flows. */
export async function getBidPublishDerivedValues(bidId: number): Promise<{ supplierCount: string; prAmount: number | null }> {
  const suppliersResult = await getDb().execute(sql`SELECT COUNT(*) as cnt FROM dbo.supp_bid_supplier_dtls WHERE bidrefno = ${bidId}`);
  const supplierCount = String(Number((suppliersResult.rows[0] as any)?.cnt || 0));

  let prAmount: number | null = null;
  try {
    const bidResult = await getDb().execute(sql`SELECT pr_number FROM dbo.supp_bid_dtls WHERE id = ${bidId}`);
    const prNumber = (bidResult.rows[0] as any)?.pr_number;
    if (prNumber) {
      const prAmtResult = await getDb().execute(sql`
        SELECT COALESCE(SUM(amount), 0) as total_amount 
        FROM dbo.supp_pr_line_dtls WHERE pr_number = ${prNumber}
      `);
      prAmount = Number((prAmtResult.rows[0] as any)?.total_amount || 0);
    }
  } catch {
    /* ignore */
  }

  return { supplierCount, prAmount };
}

export async function publishDboBid(bidId: number, data?: any) {
  const { supplierCount, prAmount } = await getBidPublishDerivedValues(bidId);

  const startdate = data?.startdate || null;
  const enddate = data?.enddate || null;
  const envOpenDate = data?.env_open_date || null;
  const contractTemplateId = data?.contract_template_id || null;

  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls SET
      status = 'Published',
      no_invited_supps = ${supplierCount},
      pr_amount = COALESCE(${prAmount}, pr_amount),
      startdate = COALESCE(${startdate}::timestamptz, startdate),
      enddate = COALESCE(${enddate}::timestamptz, enddate),
      env_open_date = COALESCE(${envOpenDate}::timestamptz, env_open_date),
      contract_template_id = COALESCE(${contractTemplateId}, contract_template_id),
      last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
  return getDboBidDetailById(bidId);
}

/** Tender publish: pending approval + workflow task id + approvers (legacy Bid Publish Approval). */
export async function publishDboBidPendingApproval(
  bidId: number,
  data: any | undefined,
  workflow: { taskId: string; approversList: string; lastUpdatedBy?: string },
) {
  const { supplierCount, prAmount } = await getBidPublishDerivedValues(bidId);

  const startdate = data?.startdate || null;
  const enddate = data?.enddate || null;
  const envOpenDate = data?.env_open_date || null;
  const contractTemplateId = data?.contract_template_id || null;
  const lastBy = workflow.lastUpdatedBy || "System";

  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls SET
      status = 'Pending Approval',
      no_invited_supps = ${supplierCount},
      pr_amount = COALESCE(${prAmount}, pr_amount),
      startdate = COALESCE(${startdate}::timestamptz, startdate),
      enddate = COALESCE(${enddate}::timestamptz, enddate),
      env_open_date = COALESCE(${envOpenDate}::timestamptz, env_open_date),
      contract_template_id = COALESCE(${contractTemplateId}, contract_template_id),
      attribute_12 = ${workflow.taskId},
      approvers_list = ${workflow.approversList},
      last_updated_by = ${lastBy},
      last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
  return getDboBidDetailById(bidId);
}

export async function getWfStepInstancesByTaskId(taskId: string) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.wf_step_instance WHERE task_id = ${taskId} ORDER BY id DESC
  `);
  return result.rows as any[];
}

export async function getActRuTaskCreateTime(taskId: string) {
  const result = await getDb().execute(sql`
    SELECT create_time_ FROM dbo.act_ru_task WHERE id_ = ${taskId} LIMIT 1
  `);
  return (result.rows[0] as any) || null;
}

export async function updateBidAttribute12ForPublishApproval(bidId: number, attribute12: string, lastUpdatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET attribute_12 = ${attribute12}, last_updated_by = ${lastUpdatedBy}, last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
}

export async function setBidPublishedAfterBidPublishApproval(bidId: number, lastUpdatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET status = 'Published', last_updated_by = ${lastUpdatedBy}, last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
}

export async function rejectBidPublishApproval(bidId: number, cancelReason: string, lastUpdatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls SET
      status = 'Rejected',
      approvers_list = NULL,
      enddate = NOW(),
      cancel_reason = ${cancelReason},
      last_updated_by = ${lastUpdatedBy},
      last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
}

export async function updateBidHeaderApproversList(bidId: number, approversList: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET approvers_list = ${approversList}, last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
}

export async function getApprovedSuppliersList(page: number = 1, limit: number = 50, search: string = "", category: string = "") {
  const offset = (page - 1) * limit;
  const searchFilter = search ? `%${search.toLowerCase()}%` : null;
  const categoryFilter = category ? `%${category.toLowerCase()}%` : null;

  const baseFrom = categoryFilter
    ? sql`FROM dbo.supp_basic_org_dtls b
          INNER JOIN dbo.supp_scope_of_supply_service ssc ON ssc.supplier_id = b.id
            AND (LOWER(ssc.category_code) LIKE ${categoryFilter} 
                 OR LOWER(ssc.sub_category) LIKE ${categoryFilter})`
    : sql`FROM dbo.supp_basic_org_dtls b`;

  const searchWhere = searchFilter
    ? sql` AND (LOWER(b.company_name) LIKE ${searchFilter}
            OR LOWER(b.city) LIKE ${searchFilter}
            OR LOWER(b.country) LIKE ${searchFilter}
            OR LOWER(b.email_id) LIKE ${searchFilter})`
    : sql``;

  const countResult = await getDb().execute(
    sql`SELECT COUNT(DISTINCT b.id) as total ${baseFrom} WHERE (b.status IN ('Active') OR b.attribute_4 = 'Active') ${searchWhere}`
  );

  const result = await getDb().execute(
    sql`SELECT DISTINCT b.id, b.company_name as supplier_name, b.email_id,
          b.country, b.city, b.phone
        ${baseFrom}
        WHERE (b.status IN ('Active') OR b.attribute_4 = 'Active') ${searchWhere}
        ORDER BY b.company_name
        LIMIT ${limit} OFFSET ${offset}`
  );

  const total = Number((countResult.rows[0] as any)?.total || 0);
  return { data: result.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getVendorInvitationStats(minInvitations: number = 0, limit: number = 10) {
  const result = await getDb().execute(sql`
    SELECT
      s.supplier_id,
      COALESCE(NULLIF(s.supplier_name, ''), b.company_name, 'Unknown') as supplier_name,
      COUNT(DISTINCT s.bidrefno) as invitation_count
    FROM dbo.supp_bid_supplier_dtls s
    LEFT JOIN dbo.supp_basic_org_dtls b ON b.id = s.supplier_id
    WHERE (s.status IS NULL OR s.status != 'Deleted')
    GROUP BY s.supplier_id, COALESCE(NULLIF(s.supplier_name, ''), b.company_name, 'Unknown')
    HAVING COUNT(DISTINCT s.bidrefno) > ${minInvitations}
    ORDER BY invitation_count DESC, supplier_name ASC
    LIMIT ${limit}
  `);

  return result.rows;
}

export async function getVendorAwardStats(minAwards: number = 0, limit: number = 10) {
  const result = await getDb().execute(sql`
    SELECT
      a.supplier_id,
      COALESCE(NULLIF(a.supplier_name, ''), b.company_name, 'Unknown') as supplier_name,
      COUNT(DISTINCT a.bidrefno) as award_count
    FROM dbo.supp_bid_award_dtls a
    LEFT JOIN dbo.supp_basic_org_dtls b ON b.id = a.supplier_id
    WHERE a.status NOT IN ('Rejected', 'Cancelled', 'Deleted')
    GROUP BY a.supplier_id, COALESCE(NULLIF(a.supplier_name, ''), b.company_name, 'Unknown')
    HAVING COUNT(DISTINCT a.bidrefno) > ${minAwards}
    ORDER BY award_count DESC, supplier_name ASC
    LIMIT ${limit}
  `);

  return result.rows;
}

export async function getSupplierOrgById(supplierId: number) {
  const result = await getDb().execute(sql`
    SELECT id, company_name, country, city, phone, email_id
    FROM dbo.supp_basic_org_dtls WHERE id = ${supplierId}
  `);
  return result.rows[0] || null;
}

export async function getSupplierSites(supplierId: number) {
  const result = await getDb().execute(sql`
    SELECT sitename, country, city FROM dbo.supp_site_dtls
    WHERE supplier_id = ${supplierId} ORDER BY id LIMIT 1
  `);
  return result.rows;
}

export async function insertBidAcknowledgment(data: {
  bidrefno: number;
  status: string;
  comments: string;
  supplier_id: number;
  suppliername: string;
  suppliersite: string;
  suppliercontact: string;
  suppliercontactno: string;
  created_by: string;
}) {
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_ack_dtls`);
  const id = (idResult.rows[0] as any).next_id;
  const result = await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_ack_dtls (
      id, bidrefno, status, comments, supplier_id,
      suppliername, suppliersite, suppliercontact, suppliercontactno,
      created_by, creation_date, last_modified_by, last_updated_date
    ) VALUES (
      ${id}, ${data.bidrefno}, ${data.status}, ${data.comments || null}, ${data.supplier_id},
      ${data.suppliername || null}, ${data.suppliersite || null},
      ${data.suppliercontact || null}, ${data.suppliercontactno || null},
      ${data.created_by || 'System'}, NOW(), ${data.created_by || 'System'}, NOW()
    ) RETURNING id
  `);
  return result.rows[0];
}

export async function getBidResponseBySuppAndBid(supplierId: number, bidId: number) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_response_dtls
    WHERE supplier_id = ${supplierId} AND bidrefno = ${bidId}
    LIMIT 1
  `);
  return result.rows[0] || null;
}

export async function insertBidResponse(data: {
  bidrefno: number;
  supplier_id: number;
  status: string;
  bidtitle: string;
  bidtype: string;
  bidstartdate: any;
  bidenddate: any;
  is_contract_required: string | null;
  contract_template_id: string | null;
  supplier_name: string;
  supplier_contact: string;
  supplier_contact_no: string;
  supplier_site: string;
  created_by: string;
}) {
  const idResult = await getDb().execute(sql`SELECT LPAD(nextval('dbo.supp_bid_response_dtls_id_seq')::text, 5, '0') as next_id`);
  const id = (idResult.rows[0] as any).next_id;
  const result = await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_response_dtls (
      id, bidrefno, supplier_id, status, bidtitle, bidtype,
      bidstartdate, bidenddate,
      is_contract_required, contract_template_id,
      supplier_name, supplier_contact, supplier_contact_no, supplier_site,
      version, created_by, creation_date, last_modified_by, last_updated_date
    ) VALUES (
      ${id}, ${data.bidrefno}, ${data.supplier_id}, ${data.status},
      ${data.bidtitle || null}, ${data.bidtype || null},
      ${data.bidstartdate || null}, ${data.bidenddate || null},
      ${data.is_contract_required || null}, ${data.contract_template_id || null},
      ${data.supplier_name || null}, ${data.supplier_contact || null},
      ${data.supplier_contact_no || null}, ${data.supplier_site || null},
      0, ${data.created_by || 'System'}, NOW(), ${data.created_by || 'System'}, NOW()
    ) RETURNING *
  `);
  return result.rows[0];
}

export async function insertBidResponseRequirement(data: {
  bid_resp_id: string;
  bid_req_id: number;
  category: string;
  question: string;
  qvoption: string;
  qvtype: string;
  target: string | null;
  weight: string | null;
  knockoutscore: string | null;
  scoringmethod: string | null;
  lov: string | null;
  created_by: string;
}) {
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_response_reqmnt_dtls`);
  const id = (idResult.rows[0] as any).next_id;
  await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_response_reqmnt_dtls (
      id, bid_resp_id, bid_req_id, category, question, qvoption, qvtype,
      target, weight, knockoutscore, scoringmethod, lov,
      created_by, creation_date, last_updated_by, last_updated_date
    ) VALUES (
      ${id}, ${data.bid_resp_id}, ${data.bid_req_id}, ${data.category || null},
      ${data.question || null}, ${data.qvoption || null}, ${data.qvtype || null},
      ${data.target || null}, ${data.weight || null}, ${data.knockoutscore || null},
      ${data.scoringmethod || null}, ${data.lov || null},
      ${data.created_by || 'System'}, NOW(), ${data.created_by || 'System'}, NOW()
    )
  `);
}

export async function insertBidResponseLine(data: {
  bid_resp_id: string;
  bid_line_id: number;
  linetype: string | null;
  description: string | null;
  currency: string | null;
  priceprecision: string | null;
  uom: string | null;
  quantity: number | null;
  shiptoaddress: string | null;
  startprice: any;
  targetprice: any;
  currentprice: any;
  needbyfrom: any;
  needbyto: any;
  product_category: string | null;
  item_id: string | null;
  req_line_id: string | null;
  tax_code: string | null;
  attribute_7: string | null;
  attribute_10: string | null;
  status?: string | null;
  created_by: string;
}) {
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_response_line_dtls`);
  const id = (idResult.rows[0] as any).next_id;
  await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_response_line_dtls (
      id, bid_resp_id, bid_line_id, linetype, description, currency,
      priceprecision, uom, quantity, shiptoaddress,
      startprice, targetprice, currentprice,
      needbyfrom, needbyto, product_category, item_id,
      req_line_id, tax_code, attribute_7, attribute_10,
      status,
      created_by, created_date, last_updated_by, last_updated_date
    ) VALUES (
      ${id}, ${data.bid_resp_id}, ${data.bid_line_id},
      ${data.linetype || null}, ${data.description || null}, ${data.currency || null},
      ${data.priceprecision || null}, ${data.uom || null}, ${data.quantity || null},
      ${data.shiptoaddress || null},
      ${data.startprice || null}, ${data.targetprice || null}, ${data.currentprice || null},
      ${data.needbyfrom || null}, ${data.needbyto || null},
      ${data.product_category || null}, ${data.item_id || null},
      ${data.req_line_id || null}, ${data.tax_code || null},
      ${data.attribute_7 || null}, ${data.attribute_10 || null},
      ${data.status ?? null},
      ${data.created_by || 'System'}, NOW(), ${data.created_by || 'System'}, NOW()
    )
  `);
}

export async function getSupplierAckForBid(bidId: number, supplierId: number) {
  const result = await getDb().execute(sql`
    SELECT id, status FROM dbo.supp_bid_ack_dtls
    WHERE bidrefno = ${bidId} AND supplier_id = ${supplierId}
    ORDER BY id DESC LIMIT 1
  `);
  return result.rows[0] || null;
}

export async function getAckCountForBid(bidId: number): Promise<number> {
  const result = await getDb().execute(sql`
    SELECT COUNT(*) as cnt FROM dbo.supp_bid_ack_dtls
    WHERE bidrefno = ${bidId} AND status != 'Deleted'
  `);
  return parseInt((result.rows[0] as any)?.cnt || '0');
}

export async function updateBidAckCount(bidId: number, count: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls SET attribute_3 = ${String(count)} WHERE id = ${bidId}
  `);
}

export async function getBidResponseById(responseId: string) {
  const result = await getDb().execute(sql`
    SELECT r.*, b.attribute_4 as bid_number, b.currency, b.buyer_name, b.buyer_email,
      b.department_name, b.delivertto_location_name, b.paymentterms,
      b.is_contract_required, b.description as bid_description
    FROM dbo.supp_bid_response_dtls r
    LEFT JOIN dbo.supp_bid_dtls b ON b.id = r.bidrefno
    WHERE r.id = ${responseId}
  `);
  return result.rows[0] || null;
}

export async function getBidResponseRequirements(responseId: string) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_response_reqmnt_dtls
    WHERE bid_resp_id = ${responseId}
    ORDER BY id
  `);
  return result.rows;
}

export async function getResponseRequirementsForBid(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT rr.* FROM dbo.supp_bid_response_reqmnt_dtls rr
    INNER JOIN dbo.supp_bid_response_dtls r ON r.id = rr.bid_resp_id
    WHERE r.bidrefno = ${bidId}
    AND LOWER(COALESCE(rr.category, '')) NOT IN ('financial', 'finance')
    ORDER BY rr.bid_resp_id, rr.id
  `);
  return result.rows;
}

export async function getResponseRequirementsForCommBid(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT rr.* FROM dbo.supp_bid_response_reqmnt_dtls rr
    INNER JOIN dbo.supp_bid_response_dtls r ON r.id = rr.bid_resp_id
    WHERE r.bidrefno = ${bidId}
    AND LOWER(COALESCE(rr.category, '')) IN ('commercial', 'finance', 'financial')
    ORDER BY rr.bid_resp_id, rr.id
  `);
  return result.rows;
}

export async function getBidResponseLines(responseId: string) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_response_line_dtls
    WHERE bid_resp_id = ${responseId}
    ORDER BY id
  `);
  return result.rows;
}

export async function updateBidResponseRequirement(reqId: number, data: { response?: string; remarks?: string }, updatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_reqmnt_dtls
    SET response = ${data.response || null},
        remarks = ${data.remarks || null},
        last_updated_by = ${updatedBy},
        last_updated_date = NOW()
    WHERE id = ${reqId}
  `);
}

export async function updateBidResponseLine(lineId: number, data: { bidprice?: number; discprice?: number; promised_date?: string, tax_code?: string | null, tax_rate?: number | null }, updatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_line_dtls
    SET bidprice = ${data.bidprice ?? null},
        discprice = ${data.discprice ?? null},
        promised_date = ${data.promised_date || null},
        tax_code = ${data.tax_code || null},
        rate = ${data.tax_rate ?? null},
        last_updated_by = ${updatedBy},
        last_updated_date = NOW()
    WHERE id = ${lineId}
  `);
}

export async function updateBidResponseTotals(responseId: string, data: { bidtotal?: number; biddisc?: number; grosstotal?: number; amtcomments?: string; amount_in_words?: string; notes?: string, totalTax?: number | null }, updatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_dtls
    SET bidtotal = ${data.bidtotal ?? null},
        biddisc = ${data.biddisc ?? null},
        grosstotal = ${data.grosstotal ?? null},
        amtcomments = ${data.amtcomments || null},
        amount_in_words = ${data.amount_in_words || null},
        tax_amount = ${data.totalTax || null},
        notes = ${data.notes || null},
        last_modified_by = ${updatedBy},
        last_updated_date = NOW()
    WHERE id = ${responseId}
  `);
}

export async function updateBidResponseTaxIncluded(responseId: string, data: { tax_included?: string }, updatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_dtls
    SET tax_included = ${data.tax_included || null},
        last_modified_by = ${updatedBy},
        last_updated_date = NOW()
    WHERE id = ${responseId}
  `);
}

export async function submitBidResponse(responseId: string, updatedBy: string, data: {
  notes?: string; amtcomments?: string; bidtotal: number; biddisc: number; grosstotal: number;
  amount_in_words?: string; supplier_site?: string; supplier_name?: string;
  supplier_contact?: string; supplier_contact_no?: string; site_id?: number;
}) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_dtls
    SET status = 'Submitted',
        notes = ${data.notes || null},
        amtcomments = ${data.amtcomments || null},
        bidtotal = ${data.bidtotal},
        biddisc = ${data.biddisc},
        grosstotal = ${data.grosstotal},
        amount_in_words = ${data.amount_in_words || null},
        supplier_site = ${data.supplier_site || null},
        supplier_name = ${data.supplier_name || null},
        supplier_contact = ${data.supplier_contact || null},
        supplier_contact_no = ${data.supplier_contact_no || null},
        site_id = ${data.site_id || null},
        last_modified_by = ${updatedBy},
        last_updated_date = NOW()
    WHERE id = ${responseId}
  `);
}

export async function markBidResponseAsProxy(responseId: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_dtls
    SET attribute_5 = 'Y'
    WHERE id = ${responseId}
  `);
}

export async function getBidSupplierByStatusList(supplierId: number, bidId: number, statuses: string[]) {
  const statusPlaceholders = sql.join(statuses.map(s => sql`${s}`), sql`, `);
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_supplier_dtls
    WHERE supplier_id = ${supplierId} AND bidrefno = ${bidId}
      AND status IN (${statusPlaceholders})
    ORDER BY id DESC LIMIT 1
  `);
  return result.rows[0] || null;
}

export async function updateBidSupplierStatus(id: number, status: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_supplier_dtls
    SET status = ${status}, last_modified_date = NOW()
    WHERE id = ${id}
  `);
}

export async function updateBidAckStatus(supplierId: number, bidId: number, status: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_ack_dtls
    SET status = ${status}, last_updated_date = NOW()
    WHERE supplier_id = ${supplierId} AND bidrefno = ${bidId}
  `);
}

export async function updateBidResponseCount(bidId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET bid_responses = (
      SELECT COUNT(DISTINCT s.supplier_id)
      FROM dbo.supp_bid_supplier_dtls s
      WHERE s.bidrefno = ${bidId} AND s.status = 'Submitted'
    )
    WHERE id = ${bidId}
  `);
}

export async function getBidHeaderById(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_dtls WHERE id = ${bidId}
  `);
  return result.rows[0] || null;
}

export async function getBidAckDetails(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT id, bidrefno, supplier_id, suppliername, suppliersite,
           suppliercontact, suppliercontactno, status, comments,
           created_by, creation_date
    FROM dbo.supp_bid_ack_dtls WHERE bidrefno = ${bidId} ORDER BY id
  `);
  return result.rows;
}

export async function getBidResponseDetails(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT id, bidrefno, supplier_id, supplier_name, supplier_site,
           supplier_contact, supplier_contact_no, status,
           bidtotal, grosstotal, biddisc, tax_amount, tax_included,
           created_by, creation_date, last_updated_date
    FROM dbo.supp_bid_response_dtls WHERE bidrefno = ${bidId} AND status = 'Submitted' ORDER BY id
  `);
  return result.rows;
}

export async function getBidEvaluationData(bidId: number, scoredByIdentifiers?: string[]) {
  const supplierDetails = await getDb().execute(sql`
    SELECT DISTINCT supplier_id
    FROM dbo.supp_bid_supplier_dtls
    WHERE bidrefno = ${bidId}
`);

const supplierIds = supplierDetails.rows.map((r: any) => r.supplier_id);

for (const supplierId of supplierIds) {

    const negotiationResponses = await getDb().execute(sql`
        SELECT *
        FROM dbo.supp_bid_response_dtls
        WHERE bidrefno = ${bidId}
          AND supplier_id = ${supplierId}
          AND status NOT IN ('Draft', 'Deleted')
        ORDER BY version DESC
        LIMIT 2
    `);

    const rows = negotiationResponses.rows;

    if (rows.length < 2) {
        continue;
    }

    const latest = rows[0];
    const previous = rows[1];

    const now = new Date();

    const negotiationExpired = latest.status === 'Request Negotiation' && new Date(latest.bidenddate as string) <= now;

    if (negotiationExpired && previous.status === 'Under Negotiation') {
        await getDb().execute(sql`
            UPDATE dbo.supp_bid_response_dtls
            SET status = 'Submitted'
            WHERE id = ${previous.id}
        `);
    }
  }
        const responses = await getDb().execute(sql`
          SELECT DISTINCT ON (r.supplier_id)
                r.id,
                r.bidrefno,
                r.supplier_id,
                r.supplier_name,
                r.supplier_site,
                r.supplier_contact,
                r.supplier_contact_no,
                r.status,
                r.bidtotal,
                r.grosstotal,
                r.biddisc,
                r.notes,
                r.amount_in_words,
                r.total_score,
                r.finscore,
                r.total_tech_and_fin_score,
                r.recommended,
                r.recommend_by,
                r.recommend_comments,
                r.fin_recommended,
                r.fin_recommend_by,
                r.fin_recommend_comments,
                r.eval_comments,
                r.fin_eval_comments,
                r.is_technically_selected,
                r.is_commercially_selected,
                r.negotiation_comments,
                r.bond_bank_name,
                r.bond_expiry_date,
                r.bond_status,
                r.tender_bond_no,
                r.tenderbondamount,
                r.is_tender_bond,
                r.created_by,
                r.creation_date,
                r.last_updated_date,
                r.tax_amount,
                r.tax_included,
                r.attribute_2 AS totalcommercialscore,
                r.attribute_1 AS commercialScore,
                r.bidenddate,
                r.version
          FROM dbo.supp_bid_response_dtls r
          WHERE r.bidrefno = ${bidId}
            AND r.status NOT IN ('Draft', 'Deleted')
            AND r.version = (
                SELECT MAX(version)
                FROM dbo.supp_bid_response_dtls
                WHERE bidrefno = ${bidId}
                  AND supplier_id = r.supplier_id
                  AND (
                        status = 'Submitted'
                    OR (status = 'Request Negotiation' AND bidenddate > NOW())
                  )
            )
          ORDER BY r.supplier_id, r.version DESC
      `);

  const responseIds = responses.rows.map((r: any) => r.id);
  if (responseIds.length === 0) {
    return { responses: [], lines: [], requirements: [], scores: [] };
  }

  const inClause = sql.join(responseIds.map((id: any) => sql`${id}`), sql`, `);

  const lines = await getDb().execute(sql`
    SELECT rl.id, rl.bid_resp_id, rl.bid_line_id, rl.linetype, rl.description,
           rl.currency, rl.uom, rl.quantity, rl.bidprice, rl.startprice,
           rl.targetprice, rl.currentprice, rl.discprice, rl.rate, rl.ratetype,
           rl.product_category, rl.promised_date, rl.status, rl.rank, rl.tax_code,
           rl.awarded_quantity, rl.awarded_quantity_total, rl.remaining_quantity,
           bl.description as orig_description, bl.uom as orig_uom,
           bl.quantity as orig_quantity, bl.startprice as orig_startprice,
           bl.targetprice as orig_targetprice
    FROM dbo.supp_bid_response_line_dtls rl
    LEFT JOIN dbo.supp_bid_line_dtls bl ON bl.id = rl.bid_line_id
    WHERE rl.bid_resp_id IN (${inClause})
    ORDER BY rl.bid_line_id, rl.bid_resp_id
  `);

  const requirements = await getDb().execute(sql`
    SELECT rr.id, rr.bid_resp_id, rr.bid_req_id, rr.category, rr.question,
           rr.response, rr.score, rr.remarks, rr.qvoption, rr.qvtype,
           rr.target, rr.weight, rr.knockoutscore, rr.scoringmethod, rr.lov,
           rr.created_by, rr.creation_date
    FROM dbo.supp_bid_response_reqmnt_dtls rr
    WHERE rr.bid_resp_id IN (${inClause})
    ORDER BY rr.category, rr.bid_req_id, rr.bid_resp_id
  `);

  const scores = (scoredByIdentifiers && scoredByIdentifiers.length > 0)
    ? await getDb().execute(sql`
        SELECT s.id, s.bid_resp_id, s.bid_resp_req_id, s.category, s.question,
               s.response, s.score, s.comments, s.remarks,
               s.scored_by, s.scored_by_name, s.scoringmethod,
               s.target, s.weight, s.knockoutscore,
               s.qvoption, s.qvtype, s.lov
        FROM dbo.supp_bid_response_reqmnt_score_dtls s
        WHERE s.bid_resp_id IN (${inClause})
          AND s.scored_by IN (${sql.join(scoredByIdentifiers.map((id: string) => sql`${id}`), sql`, `)})
        ORDER BY s.bid_resp_req_id, s.bid_resp_id
      `)
    : await getDb().execute(sql`
        SELECT s.id, s.bid_resp_id, s.bid_resp_req_id, s.category, s.question,
               s.response, s.score, s.comments, s.remarks,
               s.scored_by, s.scored_by_name, s.scoringmethod,
               s.target, s.weight, s.knockoutscore,
               s.qvoption, s.qvtype, s.lov
        FROM dbo.supp_bid_response_reqmnt_score_dtls s
        WHERE s.bid_resp_id IN (${inClause})
        ORDER BY s.bid_resp_req_id, s.bid_resp_id
      `);
    const evaluatorComments = await getDb().execute(sql`
      SELECT bid_resp_id, category, scored_by_name, comments from dbo.supp_bid_response_reqmnt_score_dtls
      WHERE bid_resp_id IN (${inClause})
    `);

    
    responses.rows.forEach((response: any) => 
    {
      let technicalComments = "";
      let financeComments = "";
      evaluatorComments.rows.filter((row: any) => row.bid_resp_id === response.id).forEach((row: any) => 
      {
        if(row.category && (String(row.category).toLowerCase() === 'finance' || String(row.category).toLowerCase() === 'commercial')){
          financeComments += row.scored_by_name + " : " + row.comments +"~";
        }else{
          technicalComments += row.scored_by_name + " : " + row.comments+"~";
        }
      });
      response.technical_comments = technicalComments;
      response.finance_comments = financeComments;
    });
      
  return {
    responses: responses.rows,
    lines: lines.rows,
    requirements: requirements.rows,
    scores: scores.rows
  };
}

export async function updateResponseScore(responseId: string, data: {
  total_score?: number;
  finscore?: number;
  total_tech_and_fin_score?: number;
  recommended?: string;
  recommend_by?: string;
  recommend_comments?: string;
  eval_comments?: string;
  fin_recommended?: string;
  fin_recommend_by?: string;
  fin_recommend_comments?: string;
  fin_eval_comments?: string;
  is_technically_selected?: string;
  is_commercially_selected?: string;
  last_modified_by: string;
}) {
  const parts: ReturnType<typeof sql>[] = [];
  if (data.total_score !== undefined) parts.push(sql`total_score = ${data.total_score}`);
  if (data.finscore !== undefined) parts.push(sql`finscore = ${data.finscore}`);
  if (data.total_tech_and_fin_score !== undefined) parts.push(sql`total_tech_and_fin_score = ${data.total_tech_and_fin_score}`);
  if (data.recommended !== undefined) parts.push(sql`recommended = ${data.recommended}`);
  if (data.recommend_by !== undefined) parts.push(sql`recommend_by = ${data.recommend_by}`);
  if (data.recommend_comments !== undefined) parts.push(sql`recommend_comments = ${data.recommend_comments}`);
  if (data.eval_comments !== undefined) parts.push(sql`eval_comments = ${data.eval_comments}`);
  if (data.fin_recommended !== undefined) parts.push(sql`fin_recommended = ${data.fin_recommended}`);
  if (data.fin_recommend_by !== undefined) parts.push(sql`fin_recommend_by = ${data.fin_recommend_by}`);
  if (data.fin_recommend_comments !== undefined) parts.push(sql`fin_recommend_comments = ${data.fin_recommend_comments}`);
  if (data.fin_eval_comments !== undefined) parts.push(sql`fin_eval_comments = ${data.fin_eval_comments}`);
  if (data.is_technically_selected !== undefined) parts.push(sql`is_technically_selected = ${data.is_technically_selected}`);
  if (data.is_commercially_selected !== undefined) parts.push(sql`is_commercially_selected = ${data.is_commercially_selected}`);
  parts.push(sql`last_modified_by = ${data.last_modified_by}`);
  parts.push(sql`last_updated_date = NOW()`);

  const setClause = sql.join(parts, sql`, `);
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_dtls
    SET ${setClause}
    WHERE id = ${responseId}
  `);
}

export async function updateAwardedLineQuantity(lineId: number, quantity: string, lastModifiedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_line_dtls
    SET awarded_quantity = ${quantity},
        last_modified_by = ${lastModifiedBy},
        last_updated_date = NOW()
    WHERE id = ${lineId}
  `);
}

export async function upsertRequirementScore(data: {
  bid_resp_id: string;
  bid_resp_req_id: number;
  score: number;
  comments: string;
  scored_by: string;
  scored_by_name: string;
  category: string;
  question: string;
  weight: string;
  scoringmethod: string;
}) {
  const existing = await getDb().execute(sql`
    SELECT id FROM dbo.supp_bid_response_reqmnt_score_dtls
    WHERE bid_resp_id = ${data.bid_resp_id} AND bid_resp_req_id = ${data.bid_resp_req_id}
      AND scored_by = ${data.scored_by}
    LIMIT 1
  `);
  if (existing.rows.length > 0) {
    await getDb().execute(sql`
      UPDATE dbo.supp_bid_response_reqmnt_score_dtls
      SET score = ${data.score}, comments = ${data.comments},
          last_updated_by = ${data.scored_by}, last_updated_date = NOW()
      WHERE id = ${(existing.rows[0] as any).id}
    `);
  } else {
    const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_response_reqmnt_score_dtls`);
    const id = (idResult.rows[0] as any).next_id;
    await getDb().execute(sql`
      INSERT INTO dbo.supp_bid_response_reqmnt_score_dtls (
        id, bid_resp_id, bid_resp_req_id, score, comments,
        scored_by, scored_by_name, category, question, weight, scoringmethod,
        created_by, creation_date, last_updated_by, last_updated_date
      ) VALUES (
        ${id}, ${data.bid_resp_id}, ${data.bid_resp_req_id}, ${data.score}, ${data.comments},
        ${data.scored_by}, ${data.scored_by_name}, ${data.category}, ${data.question},
        ${data.weight}, ${data.scoringmethod},
        ${data.scored_by}, NOW(), ${data.scored_by}, NOW()
      )
    `);
  }
}

export async function getRequirementById(reqId: number) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_response_reqmnt_dtls WHERE id = ${reqId}
  `);
  return result.rows[0] || null;
}

export async function getUserScoreForReq(reqId: number, scoredBy: string) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_response_reqmnt_score_dtls
    WHERE bid_resp_req_id = ${reqId} AND scored_by = ${scoredBy}
    LIMIT 1
  `);
  return result.rows[0] || null;
}

export async function getUserScoresForResponse(bidRespId: string, scoredBy: string | string[]) {
  const identifiers = Array.isArray(scoredBy) ? scoredBy : [scoredBy];
  const idClause = sql.join(identifiers.map((id: string) => sql`${id}`), sql`, `);
  const result = await getDb().execute(sql`
    SELECT bid_resp_req_id, score, comments
    FROM dbo.supp_bid_response_reqmnt_score_dtls
    WHERE bid_resp_id = ${bidRespId} AND scored_by IN (${idClause})
  `);
  return result.rows;
}

export async function upsertUserScore(data: {
  reqId: number;
  bidRespId: string;
  score?: string;
  comments?: string;
  scoredBy: string;
  scoredByName: string;
  category: string;
  question: string;
  weight: string;
  qvoption: string;
  qvtype: string;
  response: string;
  remarks: string;
  knockoutscore: string;
  scoringmethod: string;
}) {
  const existing = await getDb().execute(sql`
    SELECT id FROM dbo.supp_bid_response_reqmnt_score_dtls
    WHERE bid_resp_req_id = ${data.reqId} AND scored_by = ${data.scoredBy} AND bid_resp_id = ${data.bidRespId}
    LIMIT 1
  `);

  if (existing.rows.length > 0) {
    const parts: ReturnType<typeof sql>[] = [];
    if (data.score !== undefined) parts.push(sql`score = ${data.score}`);
    if (data.comments !== undefined) parts.push(sql`comments = ${data.comments}`);
    parts.push(sql`last_updated_by = ${data.scoredBy}`);
    parts.push(sql`last_updated_date = NOW()`);
    const setClause = sql.join(parts, sql`, `);
    await getDb().execute(sql`
      UPDATE dbo.supp_bid_response_reqmnt_score_dtls
      SET ${setClause}
      WHERE id = ${(existing.rows[0] as any).id}
    `);
    return (existing.rows[0] as any).id;
  } else {
    const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_response_reqmnt_score_dtls`);
    const id = (idResult.rows[0] as any).next_id;
    await getDb().execute(sql`
      INSERT INTO dbo.supp_bid_response_reqmnt_score_dtls (
        id, bid_resp_id, bid_resp_req_id, score, comments,
        scored_by, scored_by_name, category, question, weight,
        qvoption, qvtype, response, remarks, knockoutscore, scoringmethod,
        created_by, creation_date, last_updated_by, last_updated_date
      ) VALUES (
        ${id}, ${data.bidRespId}, ${data.reqId}, ${data.score || null}, ${data.comments || null},
        ${data.scoredBy}, ${data.scoredByName}, ${data.category}, ${data.question},
        ${data.weight}, ${data.qvoption}, ${data.qvtype}, ${data.response}, ${data.remarks},
        ${data.knockoutscore}, ${data.scoringmethod},
        ${data.scoredBy}, NOW(), ${data.scoredBy}, NOW()
      )
    `);
    return id;
  }
}

export async function setAverageScoreForRequirement(reqId: number) {
  const avgResult = await getDb().execute(sql`
    SELECT AVG(CAST(score AS FLOAT)) as avg_score
    FROM dbo.supp_bid_response_reqmnt_score_dtls
    WHERE bid_resp_req_id = ${reqId} AND score IS NOT NULL AND score != ''
  `);
  const avgScore = (avgResult.rows[0] as any)?.avg_score;
  if (avgScore !== null && avgScore !== undefined) {
    await getDb().execute(sql`
      UPDATE dbo.supp_bid_response_reqmnt_dtls
      SET score = ${String(Math.round(avgScore * 10) / 10)}, last_updated_date = NOW()
      WHERE id = ${reqId}
    `);
  }
}

export async function setAverageCommercialScore(respId: string) {
  const avgResult = await getDb().execute(sql`
    SELECT AVG(CAST(score AS FLOAT)) as avg_score
    FROM dbo.supp_bid_response_reqmnt_score_dtls
    WHERE bid_resp_id = ${respId} AND bid_resp_req_id = 0 AND score IS NOT NULL AND score != ''
  `);
  const avgScore = (avgResult.rows[0] as any)?.avg_score;
  if (avgScore !== null && avgScore !== undefined) {
    await getDb().execute(sql`
      UPDATE dbo.supp_bid_response_dtls
      SET attribute_1 = ${String(Math.round(avgScore * 10) / 10)}, last_updated_date = NOW()
      WHERE id = ${respId}
    `);
  }
}

export async function getAllRequirementsForResponse(bidRespId: string) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_response_reqmnt_dtls
    WHERE bid_resp_id = ${bidRespId}
    ORDER BY id
  `);
  return result.rows;
}

export async function getResponseById(responseId: string) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_response_dtls WHERE id = ${responseId}
  `);
  return result.rows[0] || null;
}

export async function updateResponseTotals(responseId: string, totalScore: string, finScore: string, totalTechAndFinScore: string, commercialScore: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_dtls
    SET total_score = ${totalScore}, finscore = ${finScore},
        total_tech_and_fin_score = ${totalTechAndFinScore},
        attribute_2 = ${commercialScore},
        last_updated_date = NOW()
    WHERE id = ${responseId}
  `);
}

export async function getBidWeightages(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT tech_score_weightage, commercial_score_weightage FROM dbo.supp_bid_dtls WHERE id = ${bidId}
  `);
  return result.rows[0] || null;
}

export async function isUserAuthorizedForScoring(bidId: number, userId: number): Promise<boolean> {
  const result = await getDb().execute(sql`
    SELECT id FROM dbo.supp_bid_approvers
    WHERE bidrefno = ${bidId}
      AND user_id = ${userId}
      AND teamtype IN ('Technical Approve Team', 'Commercial Approve Team', 'Commercial Review Team', 'Technical Review Team')
    LIMIT 1
  `);
  return result.rows.length > 0;
}

export async function getBidTasks(userId: number, isSuperAdmin: boolean = false): Promise<any[]> {
  const result = await getDb().execute(sql`
    SELECT DISTINCT b.id as bid_id, b.bid_title, b.status, b.type, b.env_opened,
           b.tech_score_complete, b.fin_score_complete, b.techscoreapproved, b.finscoreapproved,
           b.bid_responses, b.last_updated_date, b.buyer_name,
           a.teamtype, a.logged_id, a.score_submitted, a.bidaccepted
    FROM dbo.supp_bid_approvers a
    JOIN dbo.supp_bid_dtls b ON b.id = a.bidrefno
    WHERE (${isSuperAdmin} OR a.user_id = ${userId})
      AND b.bid_responses > 0
      AND b.status NOT IN ('Draft', 'Published', 'Awarded', 'Cancelled', 'Deleted')
      AND (
        (b.status = 'Closed' AND (b.env_opened IS NULL OR b.env_opened != 'Y')
          AND a.teamtype = 'Committee Team'
          AND (a.logged_id IS NULL OR a.logged_id = '' OR a.logged_id = 'N'))
        OR
        (b.status = 'Closed' AND (b.env_opened IS NULL OR b.env_opened != 'Y') AND b.type != 'Tender'
          AND (b.tech_score_complete IS NULL OR b.tech_score_complete != 'Y')
          AND a.teamtype = 'Technical Review Team'
          AND (a.score_submitted IS NULL OR a.score_submitted = '' OR a.score_submitted = 'N'))
        OR
        (b.status = 'Closed' AND b.env_opened = 'Y' AND b.type = 'Tender'
          AND (b.tech_score_complete IS NULL OR b.tech_score_complete != 'Y')
          AND a.teamtype = 'Technical Review Team'
          AND (a.score_submitted IS NULL OR a.score_submitted = '' OR a.score_submitted = 'N'))  
        OR
        (b.tech_score_complete = 'Y' AND (b.techscoreapproved IS NULL OR b.techscoreapproved != 'Y' AND (a.score_submitted IS NULL)
          AND a.teamtype = 'Technical Approve Team'
          AND (
            UPPER(TRIM(COALESCE(b.type, ''))) = 'TENDER'
            OR COALESCE(CAST(NULLIF(TRIM(b.attribute_10), '') AS NUMERIC), 0) >= 500000
          )))
        OR
        (b.techscoreapproved = 'Y'
          AND (b.fin_score_complete IS NULL OR b.fin_score_complete != 'Y')
          AND a.teamtype = 'Commercial Review Team'
          AND (a.score_submitted IS NULL OR a.score_submitted = '' OR a.score_submitted = 'N'))
        OR
        (b.fin_score_complete = 'Y' AND (b.finscoreapproved IS NULL OR b.finscoreapproved != 'Y')
          AND a.teamtype = 'Commercial Approve Team'
          AND (
            UPPER(TRIM(COALESCE(b.type, ''))) = 'TENDER'
            OR COALESCE(CAST(NULLIF(TRIM(b.attribute_10), '') AS NUMERIC), 0) >= 500000
          ))
        OR
        (b.status = 'Award Under Process'
          AND a.teamtype = 'Committee Team'
          AND (a.bidaccepted IS NULL OR a.bidaccepted = '' OR a.bidaccepted = 'N'))
      )
    ORDER BY b.last_updated_date DESC
  `);

  const tasks = (result.rows as any[]).map((row: any) => {
    let subject = "";
    const title = row.bid_title || `Bid #${row.bid_id}`;

    if (row.status === "Closed" && row.env_opened !== "Y" && row.teamtype === "Committee Team") {
      subject = `Tender opening for ${title}`;
    } else if (row.status === "Closed" && row.env_opened === "Y" && row.tech_score_complete !== "Y" && row.teamtype === "Technical Review Team") {
      subject = `Technical scoring for bid with title ${title}`;
    } else if (row.status === "Closed" && row.env_opened !== "Y" && row.tech_score_complete !== "Y" && row.teamtype === "Technical Review Team") {
      subject = `Technical scoring for bid with title ${title}`;
    }
    else if (row.tech_score_complete === "Y" && row.techscoreapproved !== "Y" && row.teamtype === "Technical Approve Team") {
      subject = `Technical scoring approval for bid with title ${title}`;
    } else if (row.techscoreapproved === "Y" && row.fin_score_complete !== "Y" && row.teamtype === "Commercial Review Team") {
      subject = `Commercial scoring for bid with title ${title}`;
    } else if (row.fin_score_complete === "Y" && row.finscoreapproved !== "Y" && row.teamtype === "Commercial Approve Team") {
      subject = `Commercial scoring approval for bid with title ${title}`;
    } else if (row.status === "Award Under Process" && row.teamtype === "Committee Team") {
      subject = `Tender award accept for ${title}`;
    }

    if (!subject) return null;

    return {
      subject,
      srmsRefNumber: String(row.bid_id),
      startDate: row.last_updated_date || null,
      inboxDate: row.last_updated_date || null,
      lastUpdateTime: row.last_updated_date || null,
      initiator: row.buyer_name || '',
      currentStatus: 'PENDING',
      taskId: `bid_task_${row.bid_id}_${row.teamtype?.replace(/\s+/g, '_')}`,
      potentialOwners: row.teamtype ? [row.teamtype] : [],
      taskName: "Bid",
      lastActionDate: row.last_updated_date || null,
      lastActionBy: '',
      processInstanceId: '',
      contextSite: '',
      businessEntity: '',
      dueDate: null,
      totalRecords: 0,
      task_type: "bid"
    };
  }).filter(Boolean);

  const seen = new Set<string>();
  return tasks.filter((t: any) => {
    if (seen.has(t.taskId)) return false;
    seen.add(t.taskId);
    return true;
  });
}

export async function getResponsesForBid(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT id, bidrefno, supplier_id, supplier_name, total_score, finscore, attribute_1, attribute_2
    FROM dbo.supp_bid_response_dtls
    WHERE bidrefno = ${bidId} and status = 'Submitted'
  `);
  return result.rows;
}

export async function markApproverScoreSubmittedByUsername(bidId: number, userName: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_approvers
    SET score_submitted = 'Y'
    WHERE bidrefno = ${bidId} AND user_id IN (
      SELECT id FROM dbo.um_user_dtls WHERE LOWER(user_name) = LOWER(${userName})
    )
  `);
}

export async function getMaxExtendedEndDate(bidId: number, supplierId: number): Promise<string | null> {
  const result = await getDb().execute(sql`
    SELECT MAX(bidenddate) as max_end_date
    FROM dbo.supp_bid_response_dtls
    WHERE bidrefno = ${bidId} AND supplier_id = ${supplierId}
  `);
  return (result.rows[0] as any)?.max_end_date || null;
}

export async function markScoreSubmitted(bidId: number, userId: number, teamType: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_approvers
    SET score_submitted = 'Y'
    WHERE bidrefno = ${bidId} AND user_id = ${userId} AND teamtype = ${teamType}
  `);
}

export async function getApproverStatus(bidId: number, userId: number, teamType: string) {
  const result = await getDb().execute(sql`
    SELECT score_submitted FROM dbo.supp_bid_approvers
    WHERE bidrefno = ${bidId} AND user_id = ${userId} AND teamtype = ${teamType}
    LIMIT 1
  `);
  return result.rows[0] || null;
}

export async function getSubmittedResponseIds(bidId: number): Promise<number[]> {
  const result = await getDb().execute(sql`
    SELECT id FROM dbo.supp_bid_response_dtls
    WHERE bidrefno = ${bidId} AND status = 'Submitted'
  `);
  return result.rows.map((r: any) => r.id);
}

export async function getUserScoreCountForResponse(bidRespId: number, scoredBy: string): Promise<{ scored: number; total: number }> {
  const totalResult = await getDb().execute(sql`
    SELECT COUNT(*) as total FROM dbo.supp_bid_response_reqmnt_dtls WHERE bid_resp_id = ${bidRespId}
  `);
  const scoredResult = await getDb().execute(sql`
    SELECT COUNT(*) as scored FROM dbo.supp_bid_response_reqmnt_score_dtls
    WHERE bid_resp_id = ${bidRespId} AND scored_by = ${scoredBy} AND score IS NOT NULL AND score != ''
  `);
  return {
    total: parseInt((totalResult.rows[0] as any)?.total || "0"),
    scored: parseInt((scoredResult.rows[0] as any)?.scored || "0"),
  };
}

export async function getBidScoringFromAll(bidId: number): Promise<boolean> {
  const result = await getDb().execute(sql`
    SELECT bid_score_from_all FROM dbo.supp_bid_dtls WHERE id = ${bidId}
  `);
  const val = (result.rows[0] as any)?.bid_score_from_all;
  return val === true || val === "true" || val === "Y" || val === 1;
}

export async function markAllApproversSubmitted(bidId: number, teamType: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_approvers
    SET score_submitted = 'Y'
    WHERE bidrefno = ${bidId} AND teamtype = ${teamType}
  `);
}

export async function getAllTechReviewApprovers(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT id, user_id, score_submitted, teamtype
    FROM dbo.supp_bid_approvers
    WHERE bidrefno = ${bidId} AND teamtype = 'Technical Review Team'
  `);
  return result.rows;
}
export async function getAllBidApprovers(bidId: number,teamType: string) {
  const result = await getDb().execute(sql`
    SELECT id, user_id, score_submitted, teamtype
    FROM dbo.supp_bid_approvers
    WHERE bidrefno = ${bidId} AND teamtype = ${teamType}
  `);
  return result.rows;
}

export async function setTechScoreComplete(bidId: number, lastUpdatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET tech_score_complete = 'Y', last_updated_by = ${lastUpdatedBy}, last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
}

export async function updateBidLastUpdated(bidId: number, lastUpdatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET last_updated_by = ${lastUpdatedBy}, last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
}

export async function setTechScoreApproved(bidId: number, lastUpdatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET techscoreapproved = 'Y', last_updated_by = ${lastUpdatedBy}, last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
}

export async function getTechScoreApprovalStatus(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT techscoreapproved, tech_score_complete FROM dbo.supp_bid_dtls WHERE id = ${bidId}
  `);
  return result.rows[0] || null;
}

export async function getCommScoreApprovalStatus(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT finscoreapproved, fin_score_complete FROM dbo.supp_bid_dtls WHERE id = ${bidId}
  `);
  return result.rows[0] || null;
}

export async function setFinScoreComplete(bidId: number, lastUpdatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET fin_score_complete = 'Y', last_updated_by = ${lastUpdatedBy}, last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
}

export async function setFinScoreApproved(bidId: number, lastUpdatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET finscoreapproved = 'Y', last_updated_by = ${lastUpdatedBy}, last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
}

// Not using now 
export async function updatRespComments(updateComments: string, id: any, arg2: string) 
{
  try
  {
    if(arg2 && String(arg2).toLowerCase() === 'finance'){
      await getDb().execute(sql`update dbo.supp_bid_response_dtls set attribute_13 = ${updateComments} where id = ${id}`);
    }else if(arg2 && String(arg2).toLowerCase() === 'technical'){
      await getDb().execute(sql`update dbo.supp_bid_response_dtls set attribute_12 = ${updateComments} where id = ${id}`);
    }
  } 
  catch(error)
  {
    console.error(error);
  }
}


export async function getAllCommReviewApprovers(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT id, user_id, score_submitted, teamtype
    FROM dbo.supp_bid_approvers
    WHERE bidrefno = ${bidId} AND teamtype = 'Commercial Review Team'
  `);
  return result.rows;
}

export async function getResponseWithLinesBySupplier(bidId: number, supplierId: number) {
  const resp = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_response_dtls
    WHERE bidrefno = ${bidId} AND supplier_id = ${supplierId}
    ORDER BY version DESC
    LIMIT 1
  `);
  if (!resp.rows[0]) return null;
  const response: any = resp.rows[0];
  const lines = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_response_line_dtls
    WHERE bid_resp_id = ${response.id}
    ORDER BY id
  `);
  response.lines = lines.rows;
  return response;
}

export async function getResponsesWithLinesByBid(bidId: number) {
  const responses = await getDb().execute(sql`
    SELECT r.* FROM dbo.supp_bid_response_dtls r
    INNER JOIN (
      SELECT supplier_id, MAX(version) as max_version
      FROM dbo.supp_bid_response_dtls
      WHERE bidrefno = ${bidId}
      GROUP BY supplier_id
    ) mv ON r.supplier_id = mv.supplier_id AND r.version = mv.max_version
    WHERE r.bidrefno = ${bidId}
  `);
  const result: any[] = [];
  for (const resp of responses.rows as any[]) {
    const lines = await getDb().execute(sql`
      SELECT * FROM dbo.supp_bid_response_line_dtls
      WHERE bid_resp_id = ${resp.id}
      ORDER BY id
    `);
    resp.lines = lines.rows;
    result.push(resp);
  }
  return result;
}

export async function createAwardHeader(data: {
  bidRespObj: any;
  createdBy: string;
  awardComments: string;
}) {
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_award_dtls`);
  const id = (idResult.rows[0] as any).next_id;
  const r = data.bidRespObj;
  await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_award_dtls (
      id, bid_resp_no, bidrefno, bidtitle, bidtype, bidstartdate, bidenddate,
      supplier_id, supplier_name, supplier_site, supplier_contact, supplier_contact_no,
      category_id, site_id, status, created_by, creation_date, award_date,
      award_comments, bidtotal, biddisc, grosstotal, amount_in_words, form_amount, tax_amount,
      notes, amtcomments, ip_address,
      attribute_1, attribute_2, attribute_3, attribute_4, attribute_5,
      attribute_6, attribute_7, attribute_8, attribute_9, attribute_10,
      attribute_11, attribute_12, attribute_13, attribute_14, attribute_15, tax_included
    ) VALUES (
      ${id}, ${r.id}, ${r.bidrefno}, ${r.bidtitle || null}, ${r.bidtype || null},
      ${r.bidstartdate || null}, ${r.bidenddate || null},
      ${r.supplier_id || 0}, ${r.supplier_name || null}, ${r.supplier_site || null},
      ${r.supplier_contact || null}, ${r.supplier_contact_no || null},
      ${r.category_id || 0}, ${r.site_id || null},
      'Draft', ${data.createdBy}, NOW(), NOW(),
      ${data.awardComments}, ${r.bidtotal || 0}, ${r.biddisc || 0}, ${r.grosstotal || 0},
      ${r.amount_in_words || null}, ${r.form_amount || null}, ${r.tax_amount ?? null},
      ${r.notes || null}, ${r.amtcomments || null}, ${r.ip_address || null},
      ${r.attribute_1 || null}, ${r.attribute_2 || null}, ${r.attribute_3 || null},
      ${r.attribute_4 || null}, ${r.attribute_5 || null}, ${r.attribute_6 || null},
      ${r.attribute_7 || null}, ${r.attribute_8 || null}, ${r.attribute_9 || null},
      ${r.attribute_10 || null}, ${r.attribute_11 || null}, ${r.attribute_12 || null},
      ${r.attribute_13 || null}, ${r.attribute_14 || null}, ${r.attribute_15 || null}, ${r.tax_included || "No"}
    )
  `);
  return id;
}

export async function createAwardLine(data: {
  awardId: number;
  respLine: any;
  totalAmount: number;
  discAmount: number;
  supplierName: string;
  supplierId: number;
  createdBy: string;
}) {
  const idResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_award_line_dtls`);
  const id = (idResult.rows[0] as any).next_id;
  const rl = data.respLine;
  await getDb().execute(sql`
    INSERT INTO dbo.supp_bid_award_line_dtls (
      id, bid_award_id, bid_line_id, linetype, description, currency, uom,
      quantity, bidprice, startprice, targetprice, currentprice, discprice,
      rate, ratetype, product_category, promised_date,
      priceprecision, needbyfrom, needbyto, shiptoaddress,
      awarded_quantity_total, selectedforquote,
      attribute_1, attribute_2, attribute_3, attribute_4, attribute_5,
      attribute_6, attribute_7, attribute_8, attribute_10,
      attribute_11, attribute_12, attribute_13, attribute_14, attribute_15,
      req_line_id, item_id, tax_code,
      created_by, created_date
    ) VALUES (
      ${id}, ${data.awardId}, ${rl.bid_line_id}, ${rl.linetype || null},
      ${rl.description || null}, ${rl.currency || null}, ${rl.uom || null},
      ${rl.quantity || 0}, ${rl.bidprice || 0},
      ${rl.startprice || null}, ${rl.targetprice || null}, ${rl.currentprice || null},
      ${rl.discprice || null}, ${rl.rate || null}, ${rl.ratetype || null},
      ${rl.product_category || ''}, ${rl.promised_date || null},
      ${rl.priceprecision || null}, ${rl.needbyfrom || null}, ${rl.needbyto || null},
      ${rl.shiptoaddress || ''},
      ${data.totalAmount - data.discAmount}, ${true},
      ${rl.attribute_1 || null}, ${rl.attribute_2 || null}, ${rl.attribute_3 || null},
      ${rl.attribute_4 || null}, ${rl.attribute_5 || null}, ${rl.attribute_6 || null},
      ${rl.attribute_7 || null}, ${rl.attribute_8 || null}, ${rl.attribute_10 || null},
      ${rl.attribute_11 || null}, ${rl.attribute_12 || null}, ${rl.attribute_13 || null},
      ${data.supplierName}, ${String(data.supplierId)},
      ${rl.req_line_id || null}, ${rl.item_id || 0}, ${rl.tax_code || null},
      ${data.createdBy}, NOW()
    )
  `);
  return id;
}

export async function updateAwardTotals(awardId: number, bidTotal: number, bidDisc: number, grossTotal: number, amountInWords: string, taxAmount: number | null) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_award_dtls
    SET bidtotal = ${bidTotal}, biddisc = ${bidDisc}, grosstotal = ${grossTotal}, tax_amount = ${taxAmount},
        amount_in_words = ${amountInWords}
    WHERE id = ${awardId}
  `);
}

export async function getResponseAttachmentsByBidAndSource(bidId: number, sourceTypes: string[]) {
  const sourceList = sourceTypes.map(s => `'${s.replace(/'/g, "''")}'`).join(",");
  const result = await getDb().execute(sql`
    SELECT a.id, a.attach_name, a.attach_path, a.attach_source, a.attach_type,
           r.supplier_name, a.supplier_id
    FROM dbo.supp_bid_attachment_dtls a
    JOIN dbo.supp_bid_response_dtls r ON r.bidrefno = a.bidrefno AND r.supplier_id = a.supplier_id
    WHERE r.bidrefno = ${bidId}
      AND a.attach_source IN (${sql.raw(sourceList)})
      AND a.status = 'Active'
      AND r.status = 'Submitted'
    ORDER BY r.supplier_name, a.attach_name
  `);
  return result.rows;
}

export async function getAwardsByBidRefNo(bidRefNo: number) {
  const result = await getDb().execute(sql`
    SELECT a.id, a.bid_resp_no, a.bidrefno, a.bidtitle, a.bidtype, a.supplier_id,
           COALESCE(a.supplier_name, r.supplier_name) as supplier_name,
           a.supplier_site, a.supplier_contact, a.supplier_contact_no, a.status, a.award_date,
           a.creation_date, a.created_by, a.last_updated_date, a.last_modified_by,
           a.bidtotal, a.biddisc, a.grosstotal, a.amount_in_words, a.award_comments,
           a.contract_ref_no, a.form_amount,
           a.attribute_11 as po_number, a.attribute_12, a.approvers_list, a.tax_amount
    FROM dbo.supp_bid_award_dtls a
    LEFT JOIN dbo.supp_bid_response_dtls r ON r.id = a.bid_resp_no
    WHERE a.bidrefno = ${bidRefNo}
    ORDER BY a.creation_date DESC
  `);
  return result.rows;
}

export async function getAwardLinesByAwardId(awardId: number) {
  const result = await getDb().execute(sql`
    SELECT id, bid_award_id, bid_line_id, linetype, description, currency, uom,
           quantity, bidprice, startprice, targetprice, currentprice, discprice,
           rate, ratetype, shiptoaddress, needbyfrom, needbyto, promised_date,
           product_category, priceprecision, item_id, tax_code,
           remaining_quantity, awarded_quantity, awarded_quantity_total,
           selectedforquote, req_line_id, attribute_11 as po_number
    FROM dbo.supp_bid_award_line_dtls
    WHERE bid_award_id = ${awardId}
    ORDER BY id
  `);
  return result.rows;
}

export async function getAwardsWithLinesByBidRefNo(bidRefNo: number) {
  const awards = await getAwardsByBidRefNo(bidRefNo);
  const awardsWithLines = await Promise.all(
    awards.map(async (award: any) => {
      const lines = await getAwardLinesByAwardId(award.id);
      return { ...award, lines };
    })
  );
  return awardsWithLines;
}

export async function requestNegotiation(bidId: number, data: {
  supplierIds: number[];
  openDate: string;
  closeDate: string;
  envOpenDate: string;
  comments: string;
  userId: number;
  userEmail: string;
}) {
  const bidResult = await getDb().execute(sql`
    SELECT bid_style FROM dbo.supp_bid_dtls WHERE id = ${bidId}
  `);
  const bidStyle = (bidResult.rows[0] as any)?.bid_style || '';

  for (const supplierId of data.supplierIds) {
    const respResult = await getDb().execute(sql`
      SELECT * FROM dbo.supp_bid_response_dtls
      WHERE supplier_id = ${supplierId} AND bidrefno = ${bidId}
      ORDER BY version DESC NULLS LAST
      LIMIT 1
    `);
    const resp = respResult.rows[0] as any;
    if (!resp) continue;

    const newVersion = (resp.version != null && resp.version >= 0) ? resp.version + 1 : 1;

    const newIdResult = await getDb().execute(sql`SELECT LPAD(nextval('dbo.supp_bid_response_dtls_id_seq')::text, 5, '0') as next_id`);
    const newRespId = (newIdResult.rows[0] as any).next_id;

    await getDb().execute(sql`
      INSERT INTO dbo.supp_bid_response_dtls (
        id, bidrefno, supplier_id, bidtitle, bidtype, bidstartdate, bidenddate,
        supplier_site, status, created_by, creation_date, last_modified_by, last_updated_date,
        bidtotal, supplier_contact, supplier_contact_no, supplier_name,
        grosstotal, biddisc, version, recommended, recommend_comments,
        is_commercially_selected, is_technically_selected, negotiation_comments,
        category_id, amount_in_words, form_amount, site_id,
        total_score, amtcomments, eval_comments, fincomments,
        fin_eval_comments, fin_recommend_comments, fin_recommended,
        fin_recommend_by, finscore, reccomments, recommend_by,
        notes, ip_address, bond_bank_name, bond_expiry_date, bond_reason,
        is_tender_bond, bond_returned_reason, bond_status, tender_bond_doc_id,
        tender_bond_no, is_contract_required, contract_response_comments,
        contract_response, contract_template_id, tenderbondamount,
        total_tech_and_fin_score,
        attribute_1, attribute_2, attribute_3, attribute_4, attribute_5,
        attribute_6, attribute_7, attribute_8, attribute_9, attribute_10,
        attribute_11, attribute_12, attribute_13, attribute_14, attribute_15, tax_included
      ) VALUES (
        ${newRespId}, ${resp.bidrefno}, ${resp.supplier_id}, ${resp.bidtitle}, ${resp.bidtype},
        ${resp.bidstartdate}, ${data.closeDate}::timestamptz,
        ${resp.supplier_site}, ${'Request Negotiation'}, ${data.userEmail}, NOW(), ${data.userEmail}, NOW(),
        ${resp.bidtotal}, ${resp.supplier_contact}, ${resp.supplier_contact_no}, ${resp.supplier_name},
        ${resp.grosstotal}, ${resp.biddisc}, ${newVersion}, ${resp.recommended}, ${resp.recommend_comments},
        ${'N'}, ${'N'}, ${data.comments},
        ${resp.category_id}, ${resp.amount_in_words}, ${resp.form_amount}, ${resp.site_id},
        ${null}, ${resp.amtcomments}, ${resp.eval_comments}, ${resp.fincomments},
        ${resp.fin_eval_comments}, ${resp.fin_recommend_comments}, ${resp.fin_recommended},
        ${resp.fin_recommend_by}, ${null}, ${resp.reccomments}, ${resp.recommend_by},
        ${resp.notes}, ${resp.ip_address}, ${resp.bond_bank_name}, ${resp.bond_expiry_date}, ${resp.bond_reason},
        ${resp.is_tender_bond}, ${resp.bond_returned_reason}, ${resp.bond_status}, ${resp.tender_bond_doc_id},
        ${resp.tender_bond_no}, ${resp.is_contract_required}, ${resp.contract_response_comments},
        ${resp.contract_response}, ${resp.contract_template_id}, ${resp.tenderbondamount},
        ${null},
        ${null}, ${null}, ${resp.attribute_3}, ${resp.attribute_4}, ${resp.attribute_5},
        ${resp.attribute_6}, ${resp.attribute_7}, ${resp.attribute_8}, ${resp.attribute_9}, ${resp.attribute_10},
        ${resp.attribute_11}, ${resp.attribute_12}, ${resp.attribute_13}, ${resp.attribute_14}, ${resp.attribute_15}, ${resp.tax_included}
      )
    `);

    await getDb().execute(sql`
      UPDATE dbo.supp_bid_response_dtls
      SET status = 'Under Negotiation',
          last_updated_date = NOW()
      WHERE id = ${resp.id}
    `);

    const linesResult = await getDb().execute(sql`
      SELECT * FROM dbo.supp_bid_response_line_dtls WHERE bid_resp_id = ${resp.id}
    `);
    for (const line of linesResult.rows as any[]) {
      const lineIdResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_response_line_dtls`);
      const newLineId = (lineIdResult.rows[0] as any).next_id;
      await getDb().execute(sql`
        INSERT INTO dbo.supp_bid_response_line_dtls (
          id, bid_resp_id, bid_line_id, linetype, description, currency, priceprecision,
          uom, quantity, shiptoaddress, startprice, targetprice, currentprice, bidprice,
          needbyfrom, needbyto, product_category, promised_date, req_line_id,
          discprice, rate, ratetype, status, item_id, tax_code,
          remaining_quantity, awarded_quantity, awarded_quantity_total, rank,
          created_by, created_date, last_updated_by, last_updated_date, ip_address,
          attribute_1, attribute_2, attribute_3, attribute_4, attribute_5,
          attribute_6, attribute_7, attribute_8, attribute_10,
          attribute_11, attribute_12, attribute_13, attribute_14, attribute_15
        ) VALUES (
          ${newLineId}, ${newRespId}, ${line.bid_line_id}, ${line.linetype}, ${line.description},
          ${line.currency}, ${line.priceprecision}, ${line.uom}, ${line.quantity},
          ${line.shiptoaddress}, ${line.startprice}, ${line.targetprice}, ${line.currentprice},
          ${line.bidprice}, ${line.needbyfrom}, ${line.needbyto}, ${line.product_category},
          ${line.promised_date}, ${line.req_line_id}, ${line.discprice}, ${line.rate},
          ${line.ratetype}, ${line.status}, ${line.item_id}, ${line.tax_code},
          ${line.remaining_quantity}, ${line.awarded_quantity}, ${line.awarded_quantity_total},
          ${line.rank}, ${data.userEmail}, NOW(), ${data.userEmail}, NOW(), ${line.ip_address},
          ${line.attribute_1}, ${line.attribute_2}, ${line.attribute_3}, ${line.attribute_4}, ${line.attribute_5},
          ${line.attribute_6}, ${line.attribute_7}, ${line.attribute_8}, ${line.attribute_10},
          ${line.attribute_11}, ${line.attribute_12}, ${line.attribute_13}, ${line.attribute_14}, ${line.attribute_15}
        )
      `);
    }

    const reqResult = await getDb().execute(sql`
      SELECT * FROM dbo.supp_bid_response_reqmnt_dtls WHERE bid_resp_id = ${resp.id}
    `);
    for (const req of reqResult.rows as any[]) {
      const reqIdResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_response_reqmnt_dtls`);
      const newReqId = (reqIdResult.rows[0] as any).next_id;
      await getDb().execute(sql`
        INSERT INTO dbo.supp_bid_response_reqmnt_dtls (
          id, bid_resp_id, bid_req_id, category, question, qvoption, qvtype,
          target, weight, knockoutscore, scoringmethod, lov,
          score, response, comments, remarks, respreqid, ip_address,
          created_by, creation_date, last_updated_by, last_updated_date,
          attribute_1, attribute_2, attribute_3, attribute_4, attribute_5,
          attribute_6, attribute_7, attribute_8, attribute_9, attribute_10,
          attribute_11, attribute_12, attribute_13, attribute_14, attribute_15
        ) VALUES (
          ${newReqId}, ${newRespId}, ${req.bid_req_id}, ${req.category}, ${req.question},
          ${req.qvoption}, ${req.qvtype}, ${req.target}, ${req.weight},
          ${req.knockoutscore}, ${req.scoringmethod}, ${req.lov},
          ${'0'}, ${req.response}, ${req.comments}, ${req.remarks}, ${req.respreqid}, ${req.ip_address},
          ${data.userEmail}, NOW(), ${data.userEmail}, NOW(),
          ${req.attribute_1}, ${req.attribute_2}, ${req.attribute_3}, ${req.attribute_4}, ${req.attribute_5},
          ${req.attribute_6}, ${req.attribute_7}, ${req.attribute_8}, ${req.attribute_9}, ${req.attribute_10},
          ${req.attribute_11}, ${req.attribute_12}, ${req.attribute_13}, ${req.attribute_14}, ${req.attribute_15}
        )
      `);
    }

    const attachTypes = ['From Supplier', 'Technical'];
    for (const attachType of attachTypes) {
      const attachResult = await getDb().execute(sql`
        SELECT * FROM dbo.supp_bid_attachment_dtls
        WHERE bidrefno = ${resp.id} AND attach_source = ${attachType}
          AND (status IS NULL OR status != 'Deleted')
      `);
      for (const att of attachResult.rows as any[]) {
        const attIdResult = await getDb().execute(sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_bid_attachment_dtls`);
        const newAttId = (attIdResult.rows[0] as any).next_id;
        await getDb().execute(sql`
          INSERT INTO dbo.supp_bid_attachment_dtls (
            id, bidrefno, supplier_id, attach_name, attach_desc, attach_type,
            attach_source, attach_path, status, expiry_date, ip_address,
            created_by, created_date, last_modified_by, last_modified_date,
            attribute_1, attribute_2, attribute_3, attribute_4, attribute_5,
            attribute_6, attribute_7, attribute_8, attribute_9, attribute_10,
            attribute_11, attribute_12, attribute_13, attribute_14, attribute_15
          ) VALUES (
            ${newAttId}, ${newRespId}, ${att.supplier_id}, ${att.attach_name}, ${att.attach_desc},
            ${att.attach_type}, ${att.attach_source}, ${att.attach_path}, ${att.status}, ${att.expiry_date}, ${att.ip_address},
            ${data.userEmail}, NOW(), ${data.userEmail}, NOW(),
            ${att.attribute_1}, ${att.attribute_2}, ${att.attribute_3}, ${att.attribute_4}, ${att.attribute_5},
            ${att.attribute_6}, ${att.attribute_7}, ${att.attribute_8}, ${att.attribute_9}, ${att.attribute_10},
            ${att.attribute_11}, ${att.attribute_12}, ${att.attribute_13}, ${att.attribute_14}, ${att.attribute_15}
          )
        `);
      }
    }
  }

  const envOpenDateClause = (bidStyle === 'Sealed' && data.envOpenDate)
    ? sql`, env_open_date = ${data.envOpenDate}::timestamptz`
    : sql``;

  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET status = 'Negotiation',
        negotiation_style = 'Negotiation',
        startdate = ${data.openDate}::timestamptz,
        enddate = ${data.closeDate}::timestamptz,
        last_updated_by = ${data.userEmail},
        last_updated_date = NOW(),
        techscoreapproved = 'N',
        finscoreapproved = 'N',
        tech_score_complete = 'N',
        fin_score_complete = 'N'
        ${envOpenDateClause}
    WHERE id = ${bidId}
  `);
}

export async function updateBidStatus(bidId: number, status: string, lastUpdatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET status = ${status}, last_updated_by = ${lastUpdatedBy}, last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
}

export async function updateResponseLineRemainingQty(bidLineId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_line_dtls rl
    SET remaining_quantity = rl.quantity - COALESCE((
      SELECT SUM(al.quantity)
      FROM dbo.supp_bid_award_line_dtls al
      WHERE al.bid_line_id = rl.bid_line_id
    ), 0),
    awarded_quantity_total = COALESCE((
      SELECT SUM(al.awarded_quantity_total)
      FROM dbo.supp_bid_award_line_dtls al
      WHERE al.bid_line_id = rl.bid_line_id
    ), 0)
    WHERE rl.bid_line_id = ${bidLineId}
  `);
}

/** Remaining qty on the awarded supplier’s response line (legacy invoiceService.getRemainingQuantity by bid line id). */
export async function getBidResponseLineRemainingForAward(
  bidAwardId: number,
  bidLineId: number,
): Promise<number | null> {
  const result = await getDb().execute(sql`
    SELECT rl.remaining_quantity
    FROM dbo.supp_bid_response_line_dtls rl
    INNER JOIN dbo.supp_bid_award_dtls a ON a.bid_resp_no = rl.bid_resp_id
    WHERE a.id = ${bidAwardId} AND rl.bid_line_id = ${bidLineId}
    LIMIT 1
  `);
  const row = result.rows[0] as { remaining_quantity?: unknown } | undefined;
  if (!row || row.remaining_quantity == null) return null;
  const n = parseFloat(String(row.remaining_quantity));
  return Number.isFinite(n) ? n : null;
}

/** Legacy invoiceService.updateBidResponseLineQuantity — sets remaining_quantity for awarded response line. */
export async function setBidResponseLineRemainingForAward(
  bidAwardId: number,
  bidLineId: number,
  finalRemainQty: number,
) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_line_dtls rl
    SET remaining_quantity = ${finalRemainQty},
        last_updated_date = NOW()
    FROM dbo.supp_bid_award_dtls a
    WHERE a.id = ${bidAwardId}
      AND rl.bid_resp_id = a.bid_resp_no
      AND rl.bid_line_id = ${bidLineId}
  `);
}

export async function getAwardById(awardId: number) {
  const result = await getDb().execute(sql`
    SELECT a.*, b.type, b.bid_style, b.bid_title as bid_title_from_bid, b.attribute_15, b.attribute_4 as bid_number
    FROM dbo.supp_bid_award_dtls a
    JOIN dbo.supp_bid_dtls b ON b.id = a.bidrefno
    WHERE a.id = ${awardId}
  `);
  return result.rows[0] as any || null;
}

export async function getReviewAwardCount(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT COUNT(*)::int as count
    FROM dbo.supp_bid_award_dtls
    WHERE bidrefno = ${bidId}
      AND status IN ('Review Committee', 'Pending Approval')
  `);
  return (result.rows[0] as any)?.count || 0;
}

export async function updateAwardStatus(awardId: number, status: string, lastModifiedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_award_dtls
    SET status = ${status}, last_modified_by = ${lastModifiedBy}, last_updated_date = NOW()
    WHERE id = ${awardId}
  `);
}

export async function updateAwardApprovers(awardId: number, approversList: string, taskId: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_award_dtls
    SET approvers_list = ${approversList}, attribute_12 = ${taskId}
    WHERE id = ${awardId}
  `);
}

export async function getAwardLinesByAwardIdForSubmit(awardId: number) {
  const result = await getDb().execute(sql`
    SELECT id, bid_line_id FROM dbo.supp_bid_award_line_dtls WHERE bid_award_id = ${awardId}
  `);
  return result.rows as any[];
}

export async function resetBidApprovalFlags(bidId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET techscoreapproved = 'N', finscoreapproved = 'N',
        tech_score_complete = 'N', fin_score_complete = 'N'
    WHERE id = ${bidId}
  `);
}

export async function getCommitteeApprovers(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT a.id, a.teamtype, a.user_id, a.bidaccepted, a.is_head,
           u.user_name, u.email_id, u.name
    FROM dbo.supp_bid_approvers a
    LEFT JOIN dbo.um_user_dtls u ON u.id = a.user_id
    WHERE a.bidrefno = ${bidId} AND a.teamtype = 'Committee Team'
  `);
  return result.rows as any[];
}

export async function setApproverAccepted(approverId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_approvers SET bidaccepted = 'Y' WHERE id = ${approverId}
  `);
}

export async function updateAwardAcceptedOnBid(bidId: number, grossTotal: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET award_accepted = 'Y',
        award_accepted_date = NOW(),
        award_amount = COALESCE(award_amount, 0) + ${grossTotal},
        awarded_amount = COALESCE(awarded_amount, 0) + ${grossTotal}
    WHERE id = ${bidId}
  `);
}

export async function getBidLineIdsByBid(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT id FROM dbo.supp_bid_line_dtls WHERE bidrefno = ${bidId}
  `);
  return result.rows as any[];
}

export async function checkAllLinesFullyAwarded(bidId: number): Promise<boolean> {
  const result = await getDb().execute(sql`
    SELECT COUNT(*)::int as has_remaining
    FROM dbo.supp_bid_line_dtls bl
    WHERE bl.bidrefno = ${bidId}
      AND (
        COALESCE(bl.quantity, 0) > COALESCE((
          SELECT SUM(al.quantity)
          FROM dbo.supp_bid_award_line_dtls al
          JOIN dbo.supp_bid_award_dtls a ON a.id = al.bid_award_id
          WHERE al.bid_line_id = bl.id
            AND a.status IN ('Approved', 'Awarded')
        ), 0)
      )
  `);
  return ((result.rows[0] as any)?.has_remaining || 0) === 0;
}

export async function setBidAwarded(bidId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET status = 'Awarded', award_accepted = 'Y'
    WHERE id = ${bidId}
  `);
}

export async function updateResponseStatusForAward(responseId: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_dtls
    SET status = 'Awarded'
    WHERE id = ${responseId}
  `);
}

export async function clearAllCommitteeAcceptance(bidId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_approvers
    SET bidaccepted = ''
    WHERE bidrefno = ${bidId} AND teamtype = 'Committee Team'
  `);
}

export async function updateAwardAttribute12(awardId: number, taskId: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_award_dtls
    SET attribute_12 = ${taskId}
    WHERE id = ${awardId}
  `);
}

export async function updateAwardForRejection(awardId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_award_dtls
    SET status = 'Rejected', approvers_list = NULL
    WHERE id = ${awardId}
  `);
}

export async function setBidStatusAndClearApprovers(bidId: number, status: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET status = ${status}, approvers_list = NULL
    WHERE id = ${bidId}
  `);
}

export async function getAwardLinesWithItemDetails(awardId: number) {
  const result = await getDb().execute(sql`
    SELECT al.id, al.bid_line_id, al.item_id, al.quantity, al.bidprice, al.discprice
    FROM dbo.supp_bid_award_line_dtls al
    WHERE al.bid_award_id = ${awardId}
  `);
  return result.rows as any[];
}

export async function updatePrLineFromAward(prNumber: string, itemId: string, unitCost: number, discount: number, lineAmount: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_pr_line_dtls
    SET unit_cost = ${unitCost},
        discount = ${discount},
        amount = ${lineAmount}
    WHERE pr_number = ${prNumber} AND item_id = ${itemId}
  `);
}

export async function updateAwardApproversList(awardId: number, approversList: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_award_dtls
    SET approvers_list = ${approversList}
    WHERE id = ${awardId}
  `);
}

export async function getStepInstanceByTaskId(taskId: string) {
  const result = await getDb().execute(sql`
    SELECT si.*, wi.wf_definition_id
    FROM dbo.wf_step_instance si
    JOIN dbo.wf_instance wi ON si.instance_id = wi.id
    WHERE si.task_id = ${taskId}
    ORDER BY si.id DESC LIMIT 1
  `);
  return result.rows[0] as any || null;
}

export async function clearBidAwardAccepted(bidId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls
    SET award_accepted = NULL,
        award_accepted_date = NULL
    WHERE id = ${bidId}
  `);
}

export async function getAwardApprovalHistory(awardId: number) {
  const result = await getDb().execute(sql`
    SELECT si.*, si.id, si.step_order, si.status, si.result, si.action_by,
           si.action_date, si.remarks, si.current_assignee,
           wi.subject, wi.started_by, wi.start_date
    FROM dbo.wf_step_instance si
    JOIN dbo.wf_instance wi ON si.instance_id = wi.id
	join dbo.wf_definition def on def.id = wi.wf_definition_id
    WHERE si.ref_number = ${String(awardId)} and def.name  = 'Bid'
    ORDER BY si.step_order ASC, si.id ASC
  `);
  return result.rows as any[];
}

export async function reopenBid(bidId: number, data: {
  startdate: string;
  enddate: string;
  env_open_date: string | null;
  last_updated_by: string;
}) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls SET
      status = 'Published',
      startdate = ${data.startdate}::timestamptz,
      enddate = ${data.enddate}::timestamptz,
      env_open_date = COALESCE(${data.env_open_date}::timestamptz, env_open_date),
      last_updated_by = ${data.last_updated_by},
      tech_score_complete = 'N',
      fin_score_complete = 'N',
      techscoreapproved = 'N',
      finscoreapproved = 'N',
      env_opened = 'N',
      env_opened_date = NULL,
      last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
}

export async function broadCastBidMessage(bidId: number, message: string, userId: string) {
  const result = await getDb().execute(sql`
    INSERT INTO dbo.bid_broadcast_message (
      bid_id,
      bid_broad_cast_message,
      created_by,
      creation_time
    ) VALUES (
      ${bidId}, ${message}, ${userId}, NOW()
    ) RETURNING *;
  `);
  return result.rows[0];
}

export async function getBroadCastBidMessage(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT id, bid_broad_cast_message, created_by, creation_time
      FROM dbo.bid_broadcast_message
      WHERE bid_id = ${bidId}
      ORDER BY creation_time DESC
  `);
  return result.rows || null;
}

export async function cancelBid(bidId: number, data: {
  cancel_reason: string;
  last_updated_by: string;
}) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_dtls SET
      status = 'Cancelled',
      enddate = NOW(),
      cancel_reason = ${data.cancel_reason},
      last_updated_by = ${data.last_updated_by},
      last_updated_date = NOW()
    WHERE id = ${bidId}
  `);
}

export async function cancelBidAward(awardId: number, sessionUser: any) {
  const userName = sessionUser?.userName || sessionUser?.user_name || sessionUser?.name || "System";
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_award_dtls
    SET status = 'Cancelled',
        last_updated_date = NOW(),
        last_modified_by = ${userName}
    WHERE id = ${awardId}
  `);
}

export async function getAllBidResponsesByBidId(bidId: number) {
  const result = await getDb().execute(sql`
    SELECT * FROM dbo.supp_bid_response_dtls WHERE bidrefno = ${bidId} ORDER BY id
  `);
  return result.rows as any[];
}

export async function updateBidResponseHeaderSync(params: {
  responseId: number;
  bidtitle: string | null;
  bidtype: string | null;
  bidstartdate: unknown;
  bidenddate: unknown;
  status: string;
  lastModifiedBy: string;
}) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_dtls SET
      bidtitle = ${params.bidtitle},
      bidtype = ${params.bidtype},
      bidstartdate = ${params.bidstartdate as any},
      bidenddate = ${params.bidenddate as any},
      status = ${params.status},
      last_modified_by = ${params.lastModifiedBy},
      last_updated_date = NOW()
    WHERE id = ${params.responseId}
  `);
}

export async function updateBidResponseRequirementFromBidTemplate(
  rowId: number,
  bidReq: any,
  updatedBy: string,
) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_reqmnt_dtls SET
      bid_req_id = ${bidReq.id},
      category = ${bidReq.category ?? null},
      knockoutscore = ${bidReq.knockoutscore ?? null},
      question = ${bidReq.question ?? null},
      qvoption = ${bidReq.qvoption ?? null},
      qvtype = ${bidReq.qvtype ?? null},
      lov = ${bidReq.lov ?? null},
      scoringmethod = ${bidReq.scoringmethod ?? null},
      target = ${bidReq.target ?? null},
      weight = ${bidReq.weight ?? null},
      last_updated_by = ${updatedBy},
      last_updated_date = NOW()
    WHERE id = ${rowId}
  `);
}

export async function updateBidResponseLineFromBidLineTemplate(lineId: number, bl: any, updatedBy: string) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_line_dtls SET
      bid_line_id = ${bl.id},
      linetype = ${bl.linetype ?? null},
      description = ${bl.description ?? null},
      currency = ${bl.currency ?? null},
      priceprecision = ${bl.priceprecision ?? null},
      uom = ${bl.uom ?? null},
      quantity = ${bl.quantity ?? null},
      shiptoaddress = ${bl.shiptoaddress ?? null},
      startprice = ${bl.startprice ?? null},
      targetprice = ${bl.targetprice ?? null},
      currentprice = ${bl.currentprice ?? null},
      needbyfrom = ${bl.needbyfrom ?? null},
      needbyto = ${bl.needbyto ?? null},
      product_category = ${bl.product_category ?? null},
      item_id = ${bl.item_id ?? null},
      req_line_id = ${bl.req_line_id != null ? String(bl.req_line_id) : null},
      status = ${bl.status ?? null},
      last_updated_by = ${updatedBy},
      last_updated_date = NOW()
    WHERE id = ${lineId}
  `);
}

/** Legacy UpdateResponses: keep supplier responses in sync with bid header, requirements, and lines. */
export async function resetBidResponsesForReopen(bidId: number) {
  await getDb().execute(sql`
    UPDATE dbo.supp_bid_response_dtls
    SET status = 'Published',
        last_updated_date = NOW()
    WHERE bidrefno = ${bidId}
      AND status IN ('Submitted', 'Closed')
  `);
}

/**
 * Bids ready for the prepareAward / Awarding stage for the current buyer:
 * - Closed (first-time award), or
 * - Award Under Process / Finalize with remaining line qty not yet covered by Approved/Awarded awards
 *   (partial qty or line-wise awards still open).
 */
export async function getAwardingReadyBidsForUser(
  username: string,
  email: string,
  isSuperAdmin: boolean,
) {
  const buyerUser = String(username || "").trim();
  const buyerEmail = String(email || "").trim();

  const result = await getDb().execute(sql`
    SELECT
      b.id AS bid_id,
      b.bid_title,
      b.attribute_4 AS bid_number,
      COALESCE(resp.cnt, 0)::int AS response_count
    FROM dbo.supp_bid_dtls b
    LEFT JOIN (
      SELECT bidrefno, COUNT(*) AS cnt
      FROM dbo.supp_bid_response_dtls
      WHERE status NOT IN ('Draft', 'Cancelled', 'Deleted')
      GROUP BY bidrefno
    ) resp ON resp.bidrefno = b.id
    WHERE (
        b.status = 'Closed'
        OR (
          b.status IN ('Award Under Process', 'Finalize')
          AND EXISTS (
            SELECT 1
            FROM dbo.supp_bid_line_dtls bl
            WHERE bl.bidrefno = b.id
              AND COALESCE(bl.quantity, 0) > COALESCE((
                SELECT SUM(al.quantity)
                FROM dbo.supp_bid_award_line_dtls al
                JOIN dbo.supp_bid_award_dtls a ON a.id = al.bid_award_id
                WHERE al.bid_line_id = bl.id
                  AND a.status IN ('Approved', 'Awarded')
              ), 0)
          )
        )
      )
      AND COALESCE(resp.cnt, 0) > 0
      AND (
        ${isSuperAdmin}
        OR LOWER(COALESCE(b.buyer, '')) = LOWER(${buyerUser})
        OR (${buyerEmail} != '' AND LOWER(COALESCE(b.buyer_email, '')) = LOWER(${buyerEmail}))
        OR (${buyerUser} != '' AND LOWER(COALESCE(b.buyer_email, '')) = LOWER(${buyerUser}))
      )
      AND (
        (
          UPPER(TRIM(COALESCE(b.type, 'RFQ'))) = 'RFQ'
          AND COALESCE(CAST(NULLIF(TRIM(b.attribute_10), '') AS NUMERIC), 0) < 500000
        )
        OR (
          UPPER(TRIM(COALESCE(b.type, ''))) = 'RFP'
          AND COALESCE(CAST(NULLIF(TRIM(b.attribute_10), '') AS NUMERIC), 0) < 500000
          AND b.fin_score_complete = 'Y'
        )
        OR (
          (
            UPPER(TRIM(COALESCE(b.type, ''))) = 'TENDER'
            OR COALESCE(CAST(NULLIF(TRIM(b.attribute_10), '') AS NUMERIC), 0) >= 500000
          )
          AND b.techscoreapproved = 'Y'
          AND b.finscoreapproved = 'Y'
        )
      )
    ORDER BY b.last_updated_date DESC
  `);

  return result.rows as Array<{
    bid_id: number;
    bid_title: string;
    bid_number: string;
    response_count: number;
  }>;
}

export async function getAuditHistoryForBid(bidId: number) 
{
    try
    {
      const auditData = await getDb().execute(sql`
      SELECT id, audit_key, audit_action, audit_date, audit_message, full_name, user_id
      FROM dbo.am_audit_log
      WHERE audit_key = ${String(bidId)} AND module = 'BIDS'
      ORDER BY audit_date ASC`);

      return auditData;
    }
    catch (error)
    {
      console.error("Error fetching audit history for bid ${bidId}:", error);
    }
}
export async function getAllReportStatus(bidId: number) 
{
  try
  {
    const data = await getDb().execute(sql`SELECT DISTINCT ON (c.supplier_name) c.supplier_name,a.status AS ack_status,b.status AS resp_status,b.last_updated_date
    FROM dbo.supp_bid_supplier_dtls c LEFT JOIN dbo.supp_bid_ack_dtls a ON c.bidrefno = a.bidrefno AND c.supplier_id = a.supplier_id LEFT JOIN dbo.supp_bid_response_dtls b
    ON c.bidrefno = b.bidrefno AND c.supplier_name = b.supplier_name WHERE c.bidrefno =${bidId}`);
    
    return data;
  } 
  catch(error)
  {
    console.error(error);
  } 
}

export async function getResponseSummaryByBidId(bidId:Number)
{
  try
  {
    const data = await getDb().execute(sql`SELECT s.supplier_id,s.supplier_name,r.status AS response_status,
    COUNT(d.id) AS document_count FROM dbo.supp_bid_supplier_dtls s LEFT JOIN dbo.supp_bid_response_dtls r
    ON r.bidrefno = s.bidrefno AND r.supplier_id = s.supplier_id LEFT JOIN dbo.supp_bid_attachment_dtls d
    ON d.bidrefno = s.bidrefno AND d.supplier_id = s.supplier_id WHERE s.bidrefno = ${bidId}
    GROUP BY s.supplier_id,s.supplier_name,r.status ORDER BY s.supplier_name;`);

    return data.rows;
  }
  catch(error)
  {
    console.error(error);
    return [];
  }
}
export async function getApprovalCount(bidId: string) 
{
    try
    {
      const awardId = await getDb().execute(sql`select id from dbo.supp_bid_award_dtls where bidrefno=${bidId} and status in ('Approved')`);
      if(awardId.rows.length >=1)
      {
        const data = await getDb().execute(sql
        `select approver_name,approved_date,status,comments from dbo.supp_regstr_appr_dtls where object_id=${String(awardId.rows[0].id)} and attribute_1 in ('BID','Award')`);
        data.rows;
      }
      else
      { 
        return [];
      }
    }
    catch(error)
    {
      console.error(error);
      return [];
    }
}

export async function getBidResponseDetailsAndRemarks(bidId:number) 
{
  try
  {
    const data = await getDb().execute(sql`SELECT a.*,MAX(CASE 
        WHEN b.category IN ('Finance') 
        THEN b.remarks END) AS finance_remarks,
    MAX(CASE WHEN b.category NOT IN ('Commercial', 'Finance') 
        THEN b.remarks END) AS technical_remarks
    FROM dbo.supp_bid_response_dtls a 
    INNER JOIN dbo.supp_bid_response_reqmnt_score_dtls b ON b.bid_resp_id = a.id WHERE a.bidrefno = ${bidId} GROUP BY a.id`);
    return data.rows;
  }
  catch(error)
  {
    console.error(error);
    return [];
  } 
}

