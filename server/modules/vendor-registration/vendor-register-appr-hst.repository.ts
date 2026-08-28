import { db } from "../../db";
import { sql } from "drizzle-orm";
import { getContextDb } from "../../tenant-context";
const getDb = () => getContextDb() ?? db;
import { dboSupplierApprovalHistory, DboSupplierApprovalHistory } from "../../../shared/schema";

// 🔹 Simple cache (replace with Redis in production)
const cache = new Map<string, any[]>();

export const suppRegApprRepo = {
  // 🔥 1. Find by Supplier ID
  async findBySuppId(suppId: number) {
    const cacheKey = `supp:${suppId}`;

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const result = await getDb().execute(sql`
      SELECT DISTINCT *
      FROM supp_regstr_appr_dtls
      WHERE supplier_id = ${suppId}
      ORDER BY id ASC
    `);

    cache.set(cacheKey, result.rows);
    return result.rows;
  },

  // 🔥 2. Find by Object ID
  async findByObjectId(objId: string) {
    const cacheKey = `obj:${objId}`;

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const result = await getDb().execute(sql`
      SELECT DISTINCT *
      FROM supp_regstr_appr_dtls
      WHERE object_id = ${objId}
      ORDER BY id ASC
    `);

    cache.set(cacheKey, result.rows);
    return result.rows;
  },

  // 🔥 3. Find by Supplier + Type (IN clause)
  async findBySuppIdAndType(suppId: number, recType: string[]) {
    const cacheKey = `supp:${suppId}:type:${recType.join(",")}`;

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const result = await getDb().execute(sql`
      SELECT DISTINCT *
      FROM supp_regstr_appr_dtl
      WHERE supplier_id = ${suppId}
        AND attribute1 = ANY(${recType})
    `);

    cache.set(cacheKey, result.rows);
    return result.rows;
  },

  // 🔥 4. Save (Insert / Update)
async saveSuppRegApprHstDtls (data: any) {
  // 🔹 INSERT
  if (!data?.id) {
    const result = await getDb()
      .insert(dboSupplierApprovalHistory)
      .values(
       data
      )
      .returning();

    return result[0];
  }
  }
}