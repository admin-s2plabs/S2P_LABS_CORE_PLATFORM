import { Router } from "express";
import { pool as defaultPool } from "../../db";
import { SupplierRankEngine } from "../../services/supplier-rank";

const router = Router();

router.post("/api/supplier-rank/run", async (req, res) => {
    try {
        const dbPool = (req as any).tenantPool || defaultPool;
        const engine = new SupplierRankEngine(dbPool);
        const results = await engine.run({ withAI: false });
        res.json({ success: true, count: results.length, data: results });
    } catch (err: any) {
        console.error("[SupplierRank] Failed to run ranking pipeline:", err);
        res.status(500).json({ success: false, error: err.message || "Ranking failed" });
    }
});

export { router as supplierRankController };
