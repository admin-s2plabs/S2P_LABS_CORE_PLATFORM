import { db } from "../db";
import { dboProductMaster, dboPmCatCategories } from "@shared/schema";
import { eq, isNull, or, sql } from "drizzle-orm";
import { getAIClient, getAIModelName } from "./ai-client";
import { getContextDb } from "../tenant-context";
const getDb = () => getContextDb() ?? db;

interface Category {
  id: string;
  code: string;
  name: string;
}

interface CategorizationResult {
  productId: number;
  productName: string;
  categoryCode: string;
  categoryName: string;
  confidence: string;
}

export class ProductCategorizationService {
  private categories: Category[] = [];

  async loadCategories(): Promise<void> {
    const cats = await getDb()
      .select({
        id: dboPmCatCategories.id,
        code: dboPmCatCategories.code,
        name: dboPmCatCategories.name,
      })
      .from(dboPmCatCategories)
      .where(eq(dboPmCatCategories.level, "commodity"));
    
    this.categories = cats.map(c => ({
      id: c.id,
      code: c.code,
      name: c.name || ""
    }));
    
    console.log(`Loaded ${this.categories.length} commodity categories`);
  }

  async categorizeProducts(batchSize: number = 20): Promise<{ processed: number; errors: number }> {
    if (this.categories.length === 0) {
      await this.loadCategories();
    }

    // Get uncategorized products
    const products = await getDb()
      .select({
        id: dboProductMaster.id,
        productName: dboProductMaster.productName,
      })
      .from(dboProductMaster)
      .where(
        or(
          isNull(dboProductMaster.productCategory),
          eq(dboProductMaster.productCategory, 0)
        )
      )
      .limit(batchSize);

    if (products.length === 0) {
      return { processed: 0, errors: 0 };
    }

    console.log(`Processing ${products.length} products...`);

    // Create category list for prompt
    const categoryList = this.categories
      .map(c => `${c.code}: ${c.name}`)
      .join("\n");

    // Create product list for prompt
    const productList = products
      .map(p => `ID:${p.id} - ${p.productName}`)
      .join("\n");

    const prompt = `You are a procurement category expert. Match each product to the most appropriate UNSPSC category from the list.

CATEGORIES (code: name):
${categoryList}

PRODUCTS TO CATEGORIZE:
${productList}

For each product, respond with ONLY the product ID and category code in this exact format, one per line:
ID:category_code

Example:
123:43211501
456:39111501

Be accurate - match based on product name meaning. If unsure, pick the closest match.`;

    try {
      const openai = await getAIClient();
      const modelName = await getAIModelName();
      const response = await openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: "system", content: "You are an expert at categorizing procurement items using UNSPSC codes. Respond only with the ID:code mappings, nothing else." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 2000
      });

      const content = response.choices[0]?.message?.content || "";
      const lines = content.trim().split("\n");

      let processed = 0;
      let errors = 0;

      for (const line of lines) {
        const match = line.trim().match(/^(\d+):(\d+)$/);
        if (match) {
          const productId = parseInt(match[1]);
          const categoryCode = match[2];

          // Find category by code
          const category = this.categories.find(c => c.code === categoryCode);
          if (category) {
            try {
                await getDb()
                .update(dboProductMaster)
                .set({ productCategory: parseInt(categoryCode) })
                .where(eq(dboProductMaster.id, productId));
              processed++;
              console.log(`Updated product ${productId} -> category ${categoryCode}`);
            } catch (err) {
              console.error(`Failed to update product ${productId}:`, err);
              errors++;
            }
          } else {
            console.warn(`Category code ${categoryCode} not found for product ${productId}`);
            errors++;
          }
        }
      }

      return { processed, errors };
    } catch (err) {
      console.error("AI categorization error:", err);
      return { processed: 0, errors: products.length };
    }
  }

  async categorizeAllProducts(): Promise<{ total: number; processed: number; errors: number }> {
    await this.loadCategories();
    
    let totalProcessed = 0;
    let totalErrors = 0;
    let batchNumber = 0;
    const batchSize = 25;

    while (true) {
      batchNumber++;
      console.log(`\n--- Batch ${batchNumber} ---`);
      
      const result = await this.categorizeProducts(batchSize);
      
      if (result.processed === 0 && result.errors === 0) {
        console.log("No more products to categorize.");
        break;
      }

      totalProcessed += result.processed;
      totalErrors += result.errors;

      console.log(`Batch complete: ${result.processed} processed, ${result.errors} errors`);
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return { total: totalProcessed + totalErrors, processed: totalProcessed, errors: totalErrors };
  }

  async getProductDetailsById(id: number): Promise<any>{
    return getDb().select().from(dboProductMaster).where(eq(dboProductMaster.id, id));
  }
}

export const productCategorizationService = new ProductCategorizationService();
