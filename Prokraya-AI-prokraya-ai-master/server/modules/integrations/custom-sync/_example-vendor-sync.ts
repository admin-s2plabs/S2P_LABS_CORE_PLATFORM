/**
 * EXAMPLE: Custom Sync Handler for Vendors (Parent-Child Pattern)
 *
 * This file demonstrates how to write a custom sync handler for entities
 * with parent-child relationships — where one ERP API returns data that
 * needs to be written to multiple Prokraya tables.
 *
 * EXAMPLE SCENARIO:
 *   ERP endpoint: /VendorsV2
 *   Response contains nested arrays: Contacts[], BankAccounts[]
 *
 *   Parent table: supp_basic_org_dtls
 *     attribute_1 = VendorID
 *     attribute_2 = VendorName
 *     attribute_3 = Country
 *
 *   Child table 1: supp_contact_dtls
 *     attribute_1 = VendorID (parent link)
 *     attribute_2 = ContactName
 *     attribute_3 = Phone
 *
 *   Child table 2: supp_bank_dtls
 *     attribute_1 = VendorID (parent link)
 *     attribute_2 = BankName
 *     attribute_3 = AccountNumber
 *
 * HOW TO USE:
 *   1. Copy this file and rename it (e.g., vendor-sync.ts)
 *   2. Uncomment and customize the handler logic
 *   3. Import it in ./index.ts to auto-register on server start
 *   4. Set the entity's sync_mode to "custom" and custom_sync_handler
 *      to "vendor_sync" (the name you register with)
 */

// import { registerSyncHandler, CustomSyncContext, CustomSyncResult } from "./sync-handler-registry";
// import { pool } from "../../_shared";
//
// async function vendorSyncHandler(ctx: CustomSyncContext): Promise<CustomSyncResult> {
//   const { entity, helpers, modifiedBy } = ctx;
//   const counts = { inserted: 0, updated: 0, failed: 0, skipped: 0 };
//
//   const BATCH_SIZE = 100;
//   let skip = 0;
//   let hasMore = true;
//
//   while (hasMore) {
//     // Fetch parent records from ERP
//     const url = `${ctx.connection.api_url}/VendorsV2?$skip=${skip}&$top=${BATCH_SIZE}`;
//     const data = await helpers.fetchJson(url);
//     const vendors = data?.value || [];
//
//     if (vendors.length === 0) break;
//
//     for (const vendor of vendors) {
//       try {
//         // --- PARENT: Save vendor to supp_basic_org_dtls ---
//         const vendorId = vendor.VendorAccountNumber;
//         await pool.query(`
//           INSERT INTO dbo.supp_basic_org_dtls (attribute_1, attribute_2, attribute_3, created_by, creation_date)
//           VALUES ($1, $2, $3, $4, NOW())
//           ON CONFLICT (attribute_1) DO UPDATE SET
//             attribute_2 = EXCLUDED.attribute_2,
//             attribute_3 = EXCLUDED.attribute_3,
//             last_modified_by = $4, last_modified_date = NOW()
//         `, [vendorId, vendor.VendorName, vendor.Country, modifiedBy]);
//         counts.inserted++;
//
//         // --- CHILD 1: Save contacts to supp_contact_dtls ---
//         const contacts = vendor.Contacts || [];
//         for (const contact of contacts) {
//           await pool.query(`
//             INSERT INTO dbo.supp_contact_dtls (attribute_1, attribute_2, attribute_3, created_by, creation_date)
//             VALUES ($1, $2, $3, $4, NOW())
//             ON CONFLICT (attribute_1, attribute_2) DO UPDATE SET
//               attribute_3 = EXCLUDED.attribute_3,
//               last_modified_by = $4, last_modified_date = NOW()
//           `, [vendorId, contact.ContactName, contact.Phone, modifiedBy]);
//         }
//
//         // --- CHILD 2: Save bank accounts to supp_bank_dtls ---
//         const banks = vendor.BankAccounts || [];
//         for (const bank of banks) {
//           await pool.query(`
//             INSERT INTO dbo.supp_bank_dtls (attribute_1, attribute_2, attribute_3, created_by, creation_date)
//             VALUES ($1, $2, $3, $4, NOW())
//             ON CONFLICT (attribute_1, attribute_2) DO UPDATE SET
//               attribute_3 = EXCLUDED.attribute_3,
//               last_modified_by = $4, last_modified_date = NOW()
//           `, [vendorId, bank.BankName, bank.AccountNumber, modifiedBy]);
//         }
//
//         await helpers.createLogDetail("inserted", vendorId, null);
//       } catch (err: any) {
//         counts.failed++;
//         const recId = vendor.VendorAccountNumber || "unknown";
//         await helpers.createLogDetail("failed", recId, err?.message || "Error processing vendor");
//       }
//     }
//
//     skip += vendors.length;
//     hasMore = vendors.length >= BATCH_SIZE;
//     await helpers.updateLogCounts(counts, "IN_PROGRESS");
//   }
//
//   const status = counts.failed === 0 ? "SUCCESS" : (counts.inserted + counts.updated > 0 ? "PARTIAL" : "FAILED");
//   return { counts, status };
// }
//
// registerSyncHandler("vendor_sync", vendorSyncHandler);
