import type pkg from "pg";

export async function updatePOTotals(pool: pkg.Pool, poNumber: string): Promise<void> {
  try {
    const totalsResult = await pool.query(
      `SELECT 
        COALESCE(SUM(line_cost), 0) as total_cost,
        COALESCE(SUM(tax_amount), 0) as total_tax
       FROM dbo.supp_po_line_dtls 
       WHERE po_number = $1 AND (line_status IS NULL OR line_status != 'Deleted')`,
      [poNumber]
    );

    const totalCost = totalsResult.rows[0]?.total_cost || 0;
    const totalTax = totalsResult.rows[0]?.total_tax || 0;
    const grandTotal = parseFloat(totalCost) + parseFloat(totalTax);

    await pool.query(
      `UPDATE dbo.supp_po_header_dtls 
       SET po_net_cost = $1, po_tax = $2, po_total_cost = $3 
       WHERE po_number = $4`,
      [totalCost, totalTax, grandTotal, poNumber]
    );
  } catch (error) {
    console.error("Error updating PO totals:", error);
    throw error;
  }
}
