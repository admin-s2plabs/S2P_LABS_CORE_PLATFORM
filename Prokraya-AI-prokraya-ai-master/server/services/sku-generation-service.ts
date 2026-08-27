import { db } from "../db";
import { dboProductMaster, dboPmCatCategories } from "@shared/schema";
import { eq, isNull, or, sql } from "drizzle-orm";
import { getAIClient, getAIModelName } from "./ai-client";

interface ProductForSKU {
  id: number;
  productName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
}

export class SKUGenerationService {
  
  async generateSKUs(batchSize: number = 20): Promise<{ processed: number; errors: number }> {
    // Get products without SKU
    const results = await db.select({
      id: dboProductMaster.id,
      productName: dboProductMaster.productName,
      categoryCode: sql<string>`${dboProductMaster.productCategory}::text`,
      categoryName: dboPmCatCategories.name
    })
      .from(dboProductMaster)
      .leftJoin(
        dboPmCatCategories,
        sql`${dboProductMaster.productCategory}::text = ${dboPmCatCategories.code}`
      )
      .where(
        sql`(${dboProductMaster.skuNo} IS NULL OR ${dboProductMaster.skuNo} = '') AND ${dboProductMaster.productName} IS NOT NULL AND ${dboProductMaster.productName} != ''`
      )
      .limit(batchSize);

    if (results.length === 0) {
      return { processed: 0, errors: 0 };
    }

    console.log(`Generating SKUs for ${results.length} products...`);

    const productList = results
      .map(p => `ID:${p.id}|NAME:${p.productName}|CAT:${p.categoryName || 'Unknown'}`)
      .join("\n");

    const prompt = `Generate SKU codes for these products. Each SKU should be:
- 8-12 characters
- Format: XX-YYYY-NNN (Category prefix 2 chars, Type 3-4 chars, Number 3 digits)
- Based on product name and category
- Unique and meaningful

Products:
${productList}

Respond with ONLY ID:SKU pairs, one per line:
123:EL-WIRE-001
456:OF-SUPP-023

Rules:
- Use category abbreviations: EL=Electrical, OF=Office, AC=AirCon, HH=Household, IT=Computer, FI=Fire, CL=Cleaning, BA=Battery
- Make type codes from product name keywords
- Number sequentially within each category prefix`;

    try {
      const openai = await getAIClient();
      const modelName = await getAIModelName();
      const response = await openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: "system", content: "You generate SKU codes for products. Respond only with ID:SKU pairs." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      const content = response.choices[0]?.message?.content || "";
      const lines = content.trim().split("\n");

      let processed = 0;
      let errors = 0;

      for (const line of lines) {
        const match = line.trim().match(/^(\d+):([A-Z0-9\-]+)$/i);
        if (match) {
          const productId = parseInt(match[1]);
          const sku = match[2].toUpperCase();

          try {
            await db
              .update(dboProductMaster)
              .set({ skuNo: sku })
              .where(eq(dboProductMaster.id, productId));
            processed++;
            console.log(`Updated product ${productId} -> SKU: ${sku}`);
          } catch (err) {
            console.error(`Failed to update product ${productId}:`, err);
            errors++;
          }
        }
      }

      return { processed, errors };
    } catch (err) {
      console.error("SKU generation error:", err);
      return { processed: 0, errors: results.length };
    }
  }

  async generateAllSKUs(): Promise<{ total: number; processed: number; errors: number }> {
    let totalProcessed = 0;
    let totalErrors = 0;
    let batchNumber = 0;
    const batchSize = 25;

    while (true) {
      batchNumber++;
      console.log(`\n--- SKU Batch ${batchNumber} ---`);
      
      const result = await this.generateSKUs(batchSize);
      
      if (result.processed === 0 && result.errors === 0) {
        console.log("No more products need SKUs.");
        break;
      }

      totalProcessed += result.processed;
      totalErrors += result.errors;

      console.log(`Batch complete: ${result.processed} SKUs generated, ${result.errors} errors`);
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return { total: totalProcessed + totalErrors, processed: totalProcessed, errors: totalErrors };
  }
}

export const skuGenerationService = new SKUGenerationService();
