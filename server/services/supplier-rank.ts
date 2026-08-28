import { Pool, PoolClient } from 'pg';
import { getAIClient, getAIModelName } from "./ai-client";

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Raw features extracted from the database for a single supplier.
 */
export interface SupplierFeatures {
    supplier_id: string;
    supplier_name: string;
    awarded_bid_count: number;
    participated_bid_count: number;
    on_time_delivered_line_items: number;
    total_items: number;
    cancelled_po_count: number;
    rej_inv_count: number;
    po_count_tot: number;
    inv_count_tot: number;
    total_received_qty: number;
    total_quantity: number;
    avg_quoted_price: number;
    avg_market_price: number;
    bidPCData: Array<{ quotedPrice: number; estimatedPrice: number; marketAvg: number }>;
}

/**
 * Calculated KPI scores for a supplier.
 */
export interface KPIScores {
    bid_win_rate: number;
    awarded_bid_count: number;
    participated_bid_count: number;
    on_time_delivery_ratio: number;
    on_time_delivered_line_items: number;
    total_items: number;
    issue_count_ratio: number;
    issue_count_ratio_inverted: number;
    cancelled_po_count: number;
    rej_inv_count: number;
    po_count_tot: number;
    inv_count_tot: number;
    fulfillment_rate: number;
    total_received_qty: number;
    total_quantity: number;
    price_competitiveness_score: number;
    avg_quoted_price: number;
    avg_market_price: number;
}

/**
 * Final score and analysis for a supplier.
 */
export interface AIAnalysis {
    summary: string;
    reasoning: string[];
}

export interface SupplierScore extends KPIScores {
    supplier_id: string;
    supplier_name: string;
    overall_supplier_score: number;
    rank?: number;
    ai_analysis?: AIAnalysis;
    metrics?: Array<{
        code: string;
        name: string;
        score: number;
        weight: number;
    }>;
}

/**
 * Aggregated raw data from database queries.
 */
export interface RawData {
    bid_awarded: any[];
    bid_participated: any[];
    items_on_time: any[];
    total_items_delivered: any[];
    cancelled_pos: any[];
    rejected_invoices: any[];
    total_pos: any[];
    total_invoices: any[];
    qty_delivered: any[];
    qty_ordered: any[];
    bid_price_lines: any[];
    suppliers: any[];
}

/**
 * Configuration for the ranking pipeline.
 */
export interface PipelineOptions {
    withAI?: boolean;
    metrics?: string[];
    onProgress?: (phase: string, message: string) => void;
}

// ============================================================================
// Constants & Weights
// ============================================================================

/**
 * Default weights for each KPI in the overall score calculation.
 */
export const WEIGHTS = {
    bid_win_rate: 0.20,
    on_time_delivery_ratio: 0.25,
    issue_count_ratio: 0.15,
    fulfillment_rate: 0.25,
    price_competitiveness_score: 0.15,
} as const;

/**
 * Mapping of UI metric codes to internal KPI keys.
 */
export const METRIC_MAP: Record<string, keyof typeof WEIGHTS> = {
    "BWR": "bid_win_rate",
    "OTDR": "on_time_delivery_ratio",
    "IC": "issue_count_ratio",
    "FR": "fulfillment_rate",
    "PC": "price_competitiveness_score",
};

/**
 * SQL queries used to extract features.
 */
export const QUERIES = {
    bid_awarded: `
    SELECT supplier_name, COUNT(DISTINCT bidrefno) AS awarded_bid_count
    FROM dbo.supp_bid_award_dtls
    WHERE status NOT IN ('Rejected', 'Cancelled', 'Deleted')
    GROUP BY supplier_name
  `,
    bid_participated: `
    SELECT supplier_name, COUNT(DISTINCT bidrefno) AS participated_bid_count
    FROM dbo.supp_bid_response_dtls
    WHERE status NOT IN ('Deleted')
    GROUP BY supplier_name
  `,
    items_on_time: `
    SELECT h.supplier_id, COUNT(*) AS on_time_delivered_line_items
    FROM dbo.supp_po_header_dtls h
    JOIN dbo.supp_po_line_dtls l ON h.po_number = l.po_number
    JOIN dbo.supp_po_grn_line_dtls g
      ON g.po_number = l.po_number
      AND g.po_line_number = l.po_line_number
    WHERE g.status IN ('Received', 'Invoice Submitted')
      AND h.po_status IN ('Complete')
      AND g.received_date IS NOT NULL
      AND h.po_required_date IS NOT NULL
      AND g.received_date <= h.po_required_date
    GROUP BY h.supplier_id
  `,
    total_items_delivered: `
    SELECT h.supplier_id, COUNT(g.*) AS total_items
    FROM dbo.supp_po_header_dtls h
    JOIN dbo.supp_po_line_dtls g ON h.po_number = g.po_number
    WHERE g.line_status IN ('Partially Received', 'Complete')
    GROUP BY h.supplier_id
  `,
    cancelled_pos: `
    SELECT supplier_id, COUNT(*) AS reject_po_count
    FROM dbo.supp_po_header_dtls
    WHERE attribute_13 = 'Reject'
    GROUP BY supplier_id
  `,
    rejected_invoices: `
    SELECT supplier_id, COUNT(*) AS rej_inv_count
    FROM dbo.supp_invoice_dtls
    WHERE invoice_status = 'Rejected'
    GROUP BY supplier_id
  `,
    total_pos: `
    SELECT supplier_id, COUNT(*) AS po_count_tot
    FROM dbo.supp_po_header_dtls
    GROUP BY supplier_id
  `,
    total_invoices: `
    SELECT supplier_id, COUNT(*) AS inv_count_tot
    FROM dbo.supp_invoice_dtls
    GROUP BY supplier_id
  `,
    qty_delivered: `
    SELECT h.supplier_id, SUM(g.received_qty) AS total_received_qty
    FROM dbo.supp_po_header_dtls h
    JOIN dbo.supp_po_grn_line_dtls g ON h.po_number = g.po_number
    WHERE g.status IN ('Received', 'Invoice Submitted')
    GROUP BY h.supplier_id
  `,
    qty_ordered: `
    SELECT h.supplier_id, SUM(g.line_qty) AS total_quantity
    FROM dbo.supp_po_header_dtls h
    JOIN dbo.supp_po_line_dtls g ON h.po_number = g.po_number
    WHERE g.line_status IN ('Partially Received', 'Complete')
    GROUP BY h.supplier_id
  `,
    bid_price_lines: `
    SELECT
      res.supplier_name,
      rl.bid_line_id,
      rl.bidprice                                          AS quoted_price,    -- Q
      bl.currentprice                                      AS estimated_price, -- E
      AVG(rl.bidprice) OVER (PARTITION BY rl.bid_line_id)  AS market_avg       -- M
    FROM dbo.supp_bid_response_line_dtls rl
    JOIN dbo.supp_bid_response_dtls res ON res.id = rl.bid_resp_id
    JOIN dbo.supp_bid_line_dtls bl ON bl.id = rl.bid_line_id
    WHERE res.status NOT IN ('Deleted')
  `,
    suppliers: `
    SELECT id AS supplier_id, company_name AS supplier_name
    FROM dbo.supp_basic_org_dtls
    WHERE TRIM(status) ILIKE 'Active'
  `,
};

// ============================================================================
// Utility Helpers
// ============================================================================

/**
 * Constrains a number between a lower and upper bound.
 */
function clip(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v));
}

/**
 * Safely parses a value into a number, returning a fallback if invalid.
 */
function safeN(v: unknown, fallback = 0): number {
    const n = parseFloat(String(v));
    return isNaN(n) ? fallback : n;
}

/**
 * Converts an array of objects into a Map indexed by a specific key.
 */
function toMap<T>(rows: T[], key: keyof T): Map<string, T> {
    const m = new Map<string, T>();
    for (const r of rows) m.set(String(r[key]), r);
    return m;
}

// ============================================================================
// Business Logic Components
// ============================================================================

/**
 * Responsible for calculating KPI scores from supplier features.
 */
class MetricsCalculator {
    /**
     * Computes various performance ratios and scores.
     */
    compute(f: SupplierFeatures): KPIScores {
        const p = safeN(f.participated_bid_count);
        const a = safeN(f.awarded_bid_count);
        const tot_items = safeN(f.total_items);
        const ot_items = safeN(f.on_time_delivered_line_items);

        const denom_ic = safeN(f.po_count_tot) + safeN(f.inv_count_tot);
        const icRaw = denom_ic > 0 ? (safeN(f.cancelled_po_count) + safeN(f.rej_inv_count)) / denom_ic : 0;

        const ordered = safeN(f.total_quantity);
        const received = safeN(f.total_received_qty);

        // Price Competitiveness = 1 - Average( (|（Q-E)/E| + |(Q-M)/M|) / 2 )
        // across the supplier's bid lines, where Q = quoted, E = estimated, M = market avg.
        let sumPc = 0;
        for (const { quotedPrice, estimatedPrice, marketAvg } of f.bidPCData) {
            const devE = Math.abs((quotedPrice - estimatedPrice) / estimatedPrice);
            const devM = Math.abs((quotedPrice - marketAvg) / marketAvg);
            sumPc += clip(1 - (devE + devM) / 2, 0, 1);
        }
        const pcScore = f.bidPCData.length > 0 ? sumPc / f.bidPCData.length : 0;

        return {
            bid_win_rate: p > 0 ? a / p : 0,
            awarded_bid_count: a,
            participated_bid_count: p,
            on_time_delivery_ratio: tot_items > 0 ? ot_items / tot_items : 0,
            on_time_delivered_line_items: ot_items,
            total_items: tot_items,
            issue_count_ratio: icRaw,
            // No PO/invoice history is "no signal", not a flawless record — contribute 0, not 1.
            issue_count_ratio_inverted: denom_ic > 0 ? clip(1 - icRaw, 0, 1) : 0,
            cancelled_po_count: safeN(f.cancelled_po_count),
            rej_inv_count: safeN(f.rej_inv_count),
            po_count_tot: safeN(f.po_count_tot),
            inv_count_tot: safeN(f.inv_count_tot),
            fulfillment_rate: ordered > 0 ? received / ordered : 0,
            total_received_qty: received,
            total_quantity: ordered,
            price_competitiveness_score: pcScore,
            avg_quoted_price: safeN(f.avg_quoted_price),
            avg_market_price: safeN(f.avg_market_price),
        };
    }
}

/**
 * Handles the composition of final scores by applying weights and active metrics.
 */
class ScoreComposer {
    private calculator = new MetricsCalculator();

    /**
     * Composes the final SupplierScore objects.
     */
    compose(features: SupplierFeatures[], activeMetricCodes?: string[]): SupplierScore[] {
        // Resolve metrics to include
        let activeMetrics: Array<keyof typeof WEIGHTS> = [];
        if (activeMetricCodes && activeMetricCodes.length > 0) {
            activeMetrics = activeMetricCodes
                .map(code => METRIC_MAP[code])
                .filter((key): key is keyof typeof WEIGHTS => !!key);
        }

        // Default to all if none or invalid
        if (activeMetrics.length === 0) {
            activeMetrics = Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>;
        }

        // Calculate dynamic weights to ensure total weight equals 1.0 even if metrics are filtered
        const totalOriginalWeight = activeMetrics.reduce((sum, key) => sum + WEIGHTS[key], 0);
        const dynamicWeights: Partial<Record<keyof typeof WEIGHTS, number>> = {};
        activeMetrics.forEach(key => {
            dynamicWeights[key] = WEIGHTS[key] / totalOriginalWeight;
        });

        return features.map(f => {
            const kpis = this.calculator.compute(f);

            // Calculate weighted score only using active metrics
            let overall = 0;
            activeMetrics.forEach(key => {
                const val = key === 'issue_count_ratio' ? kpis.issue_count_ratio_inverted : kpis[key];
                overall += val * (dynamicWeights[key] || 0);
            });

            // Suppliers with no measurable performance history have no signal to rank on —
            // score them 0 so they sort to the bottom instead of earning credit for inactivity.
            const hasActivity =
                kpis.participated_bid_count > 0 ||
                kpis.po_count_tot > 0 ||
                kpis.inv_count_tot > 0 ||
                kpis.total_items > 0 ||
                kpis.total_quantity > 0;
            overall = hasActivity ? clip(overall, 0, 1) : 0;

            // Build metrics array with scores and weights
            const metrics = activeMetrics.map(key => {
                const metricNames: Record<string, string> = {
                    'bid_win_rate': 'Bid Win Rate',
                    'on_time_delivery_ratio': 'On-Time Delivery',
                    'issue_count_ratio': 'Issue-Free Ratio',
                    'fulfillment_rate': 'Fulfillment Rate',
                    'price_competitiveness_score': 'Price Competitiveness'
                };
                
                const metricCodes: Record<string, string> = {
                    'bid_win_rate': 'BWR',
                    'on_time_delivery_ratio': 'OTDR',
                    'issue_count_ratio': 'IC',
                    'fulfillment_rate': 'FR',
                    'price_competitiveness_score': 'PC'
                };

                const val = key === 'issue_count_ratio' ? kpis.issue_count_ratio_inverted : kpis[key];
                
                return {
                    code: metricCodes[key],
                    name: metricNames[key],
                    score: clip(val, 0, 1),
                    weight: dynamicWeights[key] || 0
                };
            });

            return {
                supplier_id: f.supplier_id,
                supplier_name: f.supplier_name,
                ...kpis,
                overall_supplier_score: overall,
                metrics
            };
        });
    }
}

/**
 * Generates AI-powered insights for suppliers based on their performance metrics.
 */
export class AIInsightGenerator {
    /**
     * Calls the AI model to analyze supplier metrics and return concise insights.
     */
    async analyze(s: SupplierScore): Promise<AIAnalysis> {
        try {
            const client = await getAIClient();
            const model = await getAIModelName();

            const response = await client.chat.completions.create({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: "You are a procurement analyst assistant. Analyze the provided supplier performance metrics (BWR, OTDR, IC, FR, PC) and generate a concise 3-line paragraph explaining the supplier's performance. Consolidate the 5 metrics into 3 insightful lines. You MUST return ONLY a JSON object with a 'reasoning' field containing an array of exactly 3 strings, where each string is a single line of the paragraph. Do not include markdown formatting or any other text."
                    },
                    {
                        role: "user",
                        content: `Analyze supplier "${s.supplier_name}" performance metrics:
- Bid Win Rate (BWR): ${(s.bid_win_rate * 100).toFixed(1)}%
- On-Time Delivery (OTDR): ${(s.on_time_delivery_ratio * 100).toFixed(1)}%
- Issue-Free Ratio (IC): ${(s.issue_count_ratio_inverted * 100).toFixed(1)}%
- Fulfillment Rate (FR): ${(s.fulfillment_rate * 100).toFixed(1)}%
- Price Competitiveness (PC): ${(s.price_competitiveness_score * 100).toFixed(1)}%
Overall Score: ${(s.overall_supplier_score * 100).toFixed(1)}%`
                    }
                ],
                temperature: 0.2
            });

            let content = response.choices[0]?.message?.content || "";

            // Robust JSON cleaning for models that wrap response in code blocks
            if (content.includes("```json")) {
                content = content.split("```json")[1].split("```")[0].trim();
            } else if (content.includes("```")) {
                content = content.split("```")[1].split("```")[0].trim();
            }

            if (content) {
                try {
                    const parsed = JSON.parse(content);
                    return {
                        summary: "Rank analysis complete.",
                        reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning.slice(0, 3) : ["Supplier performance analyzed based on available metrics."]
                    };
                } catch (parseErr) {
                    console.error("[AI] JSON parse failed:", parseErr, "Content:", content);
                    throw parseErr;
                }
            }
            throw new Error("Empty AI response");
        } catch (err: any) {
            console.error("[AI] Analysis failed:", err);
            return {
                summary: "AI Insight currently unavailable.",
                reasoning: [
                    err.message || "Analysis based on profile completeness and historical data.",
                    "Check AI Model Configuration in Administration settings."
                ]
            };
        }
    }
}

// ============================================================================
// Main Execution Engine
// ============================================================================

/**
 * The core engine that orchestrates extraction, transformation, and ranking.
 */
export class SupplierRankEngine {
    private readonly pool: Pool;
    private readonly shouldClosePool: boolean;

    /**
     * Initializes the engine with an existing Pool instance or a pg connection config.
     */
    constructor(dbOrConfig: Pool | object) {
        const isPool = dbOrConfig &&
            typeof (dbOrConfig as any).query === 'function' &&
            typeof (dbOrConfig as any).connect === 'function';

        if (isPool) {
            this.pool = dbOrConfig as Pool;
            this.shouldClosePool = false;
        } else if (dbOrConfig) {
            this.pool = new Pool(dbOrConfig as object);
            this.shouldClosePool = true;
        } else {
            throw new Error("[RankEngine] Database pool or config must be provided.");
        }
    }

    /**
     * Extracts raw data from the database.
     */
    private async extract(): Promise<RawData> {
        const data: Record<string, any[]> = {};
        for (const [name, sql] of Object.entries(QUERIES)) {
            try {
                const res = await this.pool.query(sql);
                data[name] = res.rows;
            } catch (err) {
                console.warn(`[Engine] Query failed: ${name}`);
                data[name] = [];
            }
        }
        return data as unknown as RawData;
    }

    /**
     * Transforms raw database rows into structured supplier features.
     */
    private transform(data: RawData): SupplierFeatures[] {
        const nameToId = new Map<string, string>();
        const names = new Map<string, string>();

        // Normalize mapping for robust lookups
        const norm = (s: string) => String(s || '').trim().toLowerCase();

        data.suppliers.forEach(s => {
            const sid = String(s.supplier_id);
            names.set(sid, s.supplier_name);
            if (s.supplier_name) {
                nameToId.set(norm(s.supplier_name), sid);
            }
        });

        const bwrData = new Map<string, any>();
        data.bid_participated.forEach(p => {
            const n = norm(p.supplier_name);
            const sid = nameToId.get(n) || p.supplier_name;
            const awarded = data.bid_awarded.find(a => norm(a.supplier_name) === n)?.awarded_bid_count || 0;
            bwrData.set(sid, { awarded_bid_count: awarded, participated_bid_count: p.participated_bid_count });
        });

        const otdrData = toMap(data.items_on_time, 'supplier_id');
        const totItemsData = toMap(data.total_items_delivered, 'supplier_id');
        const cancelData = toMap(data.cancelled_pos, 'supplier_id');
        const rejData = toMap(data.rejected_invoices, 'supplier_id');
        const totPosData = toMap(data.total_pos, 'supplier_id');
        const totInvData = toMap(data.total_invoices, 'supplier_id');
        const recQtyData = toMap(data.qty_delivered, 'supplier_id');
        const ordQtyData = toMap(data.qty_ordered, 'supplier_id');

        // Price competitiveness is computed per response line: Q = supplier's quoted
        // line price, E = estimated/current line price, M = average quoted price of all
        // suppliers for the same bid line. Lines where E or M is non-positive carry no
        // usable signal and are skipped.
        const pcBySup = new Map<string, any>();
        data.bid_price_lines.forEach((row: any) => {
            const n = norm(row.supplier_name);
            const sid = nameToId.get(n) || row.supplier_name;
            const Q = parseFloat(row.quoted_price);
            const E = safeN(row.estimated_price);
            const M = safeN(row.market_avg);
            if (isNaN(Q) || E <= 0 || M <= 0) return;

            if (!pcBySup.has(sid)) {
                pcBySup.set(sid, { sumQ: 0, sumM: 0, cnt: 0, bids: [] });
            }

            const acc = pcBySup.get(sid);
            acc.sumQ += Q;
            acc.sumM += M;
            acc.cnt++;
            acc.bids.push({ quotedPrice: Q, estimatedPrice: E, marketAvg: M });
        });

        // CRITICAL: We only rank Active vendors identified in the suppliers query
        const activeIds = Array.from(names.keys());

        return activeIds.map(sid => {
            const bwr = bwrData.get(sid);
            const otd = otdrData.get(sid);
            const tot = totItemsData.get(sid);
            const pc = pcBySup.get(sid);

            return {
                supplier_id: sid,
                supplier_name: names.get(sid) || `Supplier ${sid}`,
                awarded_bid_count: bwr?.awarded_bid_count || 0,
                participated_bid_count: bwr?.participated_bid_count || 0,
                on_time_delivered_line_items: safeN(otd?.on_time_delivered_line_items),
                total_items: safeN(tot?.total_items),
                cancelled_po_count: safeN(cancelData.get(sid)?.reject_po_count),
                rej_inv_count: safeN(rejData.get(sid)?.rej_inv_count),
                po_count_tot: safeN(totPosData.get(sid)?.po_count_tot),
                inv_count_tot: safeN(totInvData.get(sid)?.inv_count_tot),
                total_received_qty: safeN(recQtyData.get(sid)?.total_received_qty),
                total_quantity: safeN(ordQtyData.get(sid)?.total_quantity),
                avg_quoted_price: pc ? pc.sumQ / pc.cnt : 0,
                avg_market_price: pc ? pc.sumM / pc.cnt : 0,
                bidPCData: pc?.bids || [],
            };
        });
    }

    /**
     * Upserts ranked supplier data into dbo.supp_calculation.
     */
    private async saveToDatabase(suppliers: SupplierScore[]): Promise<void> {
        const client: PoolClient = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const s of suppliers) {
                await client.query(
                    `INSERT INTO dbo.supp_calculation (
                        supplier_id, supplier_name, bid_win_rate, awarded_bid_count,
                        participated_bid_count, on_time_delivery_ratio, on_time_delivered_line_items,
                        total_items, issue_count_ratio, issue_count_ratio_inverted,
                        cancelled_po_count, rej_inv_count, po_count_tot, inv_count_tot,
                        fulfillment_rate, total_received_qty, total_quantity,
                        price_competitiveness_score, avg_quoted_price, avg_market_price,
                        overall_supplier_score, rank, calculated_at
                    ) VALUES (
                        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW()
                    )
                    ON CONFLICT (supplier_id) DO UPDATE SET
                        supplier_name               = EXCLUDED.supplier_name,
                        bid_win_rate                = EXCLUDED.bid_win_rate,
                        awarded_bid_count           = EXCLUDED.awarded_bid_count,
                        participated_bid_count      = EXCLUDED.participated_bid_count,
                        on_time_delivery_ratio      = EXCLUDED.on_time_delivery_ratio,
                        on_time_delivered_line_items = EXCLUDED.on_time_delivered_line_items,
                        total_items                 = EXCLUDED.total_items,
                        issue_count_ratio           = EXCLUDED.issue_count_ratio,
                        issue_count_ratio_inverted  = EXCLUDED.issue_count_ratio_inverted,
                        cancelled_po_count          = EXCLUDED.cancelled_po_count,
                        rej_inv_count               = EXCLUDED.rej_inv_count,
                        po_count_tot                = EXCLUDED.po_count_tot,
                        inv_count_tot               = EXCLUDED.inv_count_tot,
                        fulfillment_rate            = EXCLUDED.fulfillment_rate,
                        total_received_qty          = EXCLUDED.total_received_qty,
                        total_quantity              = EXCLUDED.total_quantity,
                        price_competitiveness_score = EXCLUDED.price_competitiveness_score,
                        avg_quoted_price            = EXCLUDED.avg_quoted_price,
                        avg_market_price            = EXCLUDED.avg_market_price,
                        overall_supplier_score      = EXCLUDED.overall_supplier_score,
                        rank                        = EXCLUDED.rank,
                        calculated_at               = NOW()`,
                    [
                        s.supplier_id, s.supplier_name, s.bid_win_rate, s.awarded_bid_count,
                        s.participated_bid_count, s.on_time_delivery_ratio, s.on_time_delivered_line_items,
                        s.total_items, s.issue_count_ratio, s.issue_count_ratio_inverted,
                        s.cancelled_po_count, s.rej_inv_count, s.po_count_tot, s.inv_count_tot,
                        s.fulfillment_rate, s.total_received_qty, s.total_quantity,
                        s.price_competitiveness_score, s.avg_quoted_price, s.avg_market_price,
                        s.overall_supplier_score, s.rank ?? null,
                    ]
                );
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Executes the full ranking pipeline.
     */
    async run(options: PipelineOptions = {}): Promise<SupplierScore[]> {
        const { withAI = false, onProgress } = options;

        try {
            onProgress?.('extracting', 'Running SQL queries...');
            const rawData = await this.extract();
            console.log(`[RankEngine] Extracted ${rawData.suppliers.length} active suppliers.`);

            onProgress?.('transforming', 'Engineering features...');
            const features = this.transform(rawData);
            console.log(`[RankEngine] Transformed ${features.length} suppliers for scoring.`);

            onProgress?.('scoring', 'Calculating KPI scores...');
            const composer = new ScoreComposer();
            let suppliers = composer.compose(features, options.metrics);

            // Sort by score (descending) and supplier_id (ascending) for stability
            suppliers.sort((a, b) => {
                const scoreDiff = (b.overall_supplier_score || 0) - (a.overall_supplier_score || 0);
                if (scoreDiff !== 0) return scoreDiff;
                return String(a.supplier_id).localeCompare(String(b.supplier_id));
            });

            // Enrichment with AI insights if requested
            if (withAI) {
                onProgress?.('enriching', 'Generating AI Insights...');
                const ai = new AIInsightGenerator();
                const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

                for (const s of suppliers) {
                    try {
                        s.ai_analysis = await ai.analyze(s);
                        // Be respectful of API rate limits
                        await delay(200);
                    } catch (e) {
                        console.warn(`[RankEngine] AI failed for ${s.supplier_id}`);
                    }
                }
            }

            // Attach final ranks (same score => same rank)
            const rankedSuppliers: SupplierScore[] = [];
            let lastScoreKey: number | null = null;
            let currentRank = 0;

            for (const s of suppliers) {
                const scoreKey = Number((s.overall_supplier_score ?? 0).toFixed(6));
                if (lastScoreKey === null || scoreKey !== lastScoreKey) {
                    currentRank += 1;
                    lastScoreKey = scoreKey;
                }
                rankedSuppliers.push({ ...s, rank: currentRank });
            }

            // Persistence
            onProgress?.('saving', 'Persisting results...');
            try {
                await this.saveToDatabase(rankedSuppliers);
                console.log(`[RankEngine] Saved ${rankedSuppliers.length} suppliers to dbo.supp_calculation.`);
            } catch (dbErr) {
                console.warn("[RankEngine] Failed to save results to dbo.supp_calculation.", dbErr);
            }

            onProgress?.('complete', `Successfully ranked ${rankedSuppliers.length} suppliers.`);
            return rankedSuppliers;
        } catch (err) {
            console.error("[RankEngine] CRITICAL FAILURE:", err);
            throw err;
        } finally {
            if (this.shouldClosePool) {
                try {
                    await this.pool.end();
                } catch (e) {
                    console.error("[RankEngine] Failed to close internal pool:", e);
                }
            }
        }
    }
}
