/**
 * EXAMPLE HOOK — Developer Reference
 *
 * This file shows how to write a post-mapping hook for an entity.
 * Copy this file, rename it to match your entity (e.g., purchase-requests.ts),
 * and register your hook in index.ts.
 *
 * USE CASE: When the ERP API returns an ID (e.g., RequestorID = "USR001")
 * but you also need to fill in a related field (e.g., RequestorName = "Rajesh Kumar")
 * by looking it up from Prokraya's own tables.
 *
 * HOW IT WORKS:
 *   1. Sync engine fetches records from ERP
 *   2. Direct field mapping fills attributes from API response
 *   3. YOUR HOOK runs here — you can read the mapped attributes, do lookups,
 *      and set additional fields
 *   4. Sync engine saves the final record to the database
 *
 * HOOK FUNCTION RECEIVES:
 *   - ctx.businessEntity: The entity key (e.g., "PURCHASE_REQUESTS")
 *   - ctx.erpRecord: The raw record from the ERP API (all fields from the API)
 *   - ctx.attributes: The mapped attributes (attribute_1, attribute_2, etc.) — you modify these
 *   - ctx.mappings: The field mapping config (prokraya column → ERP field name)
 *
 * HOOK FUNCTION RETURNS:
 *   - The modified attributes object with any additional fields set
 *
 * EXAMPLE SCENARIO:
 *   Entity: PURCHASE_REQUESTS
 *   Mapping: attribute_3 → RequestorID, attribute_4 is unmapped (RequestorName)
 *   ERP returns: { RequestorID: "USR001", PRNumber: "PR-001", ... }
 *   Hook: Looks up "USR001" in um_user_dtls → finds "Rajesh Kumar" → sets attribute_4
 */

// import { registerHook, HookContext } from "./hook-registry";
// import { pool } from "../../../db";
//
// async function purchaseRequestHook(ctx: HookContext): Promise<Record<string, string | null>> {
//   const { attributes } = ctx;
//
//   // Example: Look up requestor name from user ID
//   const requestorId = attributes["attribute_3"]; // mapped from RequestorID
//   if (requestorId) {
//     try {
//       const result = await pool.query(
//         `SELECT full_name FROM dbo.um_user_dtls WHERE user_id = $1 LIMIT 1`,
//         [requestorId]
//       );
//       if (result.rows.length > 0) {
//         attributes["attribute_4"] = result.rows[0].full_name;
//       }
//     } catch (err) {
//       console.warn(`[Hook] Could not look up requestor name for ID: ${requestorId}`);
//     }
//   }
//
//   // Example: Combine two fields into one
//   // const firstName = attributes["attribute_5"];
//   // const lastName = attributes["attribute_6"];
//   // if (firstName && lastName) {
//   //   attributes["attribute_7"] = `${firstName} ${lastName}`;
//   // }
//
//   // Example: Format a date field
//   // const rawDate = attributes["attribute_8"];
//   // if (rawDate) {
//   //   attributes["attribute_8"] = new Date(rawDate).toISOString().split("T")[0];
//   // }
//
//   return attributes;
// }
//
// // Register the hook — the entity key must match exactly
// registerHook("PURCHASE_REQUESTS", purchaseRequestHook);
