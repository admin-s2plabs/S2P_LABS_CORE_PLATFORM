/**
 * Condensed Prokraya sales corpus – used to ground /api/chatbot/ask responses.
 * Keep in sync with reference-data.js if that changes materially.
 */
export const CONDENSED_CORPUS = `S2P LABS – CONDENSED REFERENCE (grounding for Ask S2P Labs)

WHAT IT IS: AI-native Source-to-Pay (S2P) platform covering the full procurement lifecycle – supplier onboarding through invoice payment – on a single unified platform with a free supplier portal. It sits on top of the ERP (does not replace it); the ERP stays the system of record. It can also run fully standalone.

MODULES (9): Supplier/Vendor Management; Purchase Requisition; Sourcing & RFQ (RFx); Auctions (forward & reverse); Contracts & Catalogs; Purchase Orders; e-Invoicing; Spend Analytics; Payables.

AI LAYER: EVA autonomous agent (65+ tools); AI Invoice Fraud Detection; AI Three-Way Match (Vision OCR); AI Vendor Risk & Intelligence; AI PO Anomaly Detection; AI Clause Generation; AI Item Suggestions; AI Smart Auto-Fill; AI Spend Insights; 37 embedded AI features across all modules. AI agents are an add-on (annual recurring); embedded AI features sit within the platform. Accuracy: functional from day one, below ~80% confidence until trained on ~3 months of the client's historical data, then above ~90%. Genuinely-live agents: vendor onboarding and vendor evaluation; others (sourcing, procurement-ops, payables, workbench/voice) are roadmap – do NOT present roadmap agents as live. "60–80% automation" and "95% accuracy" are headline benchmarks, not hard guarantees.

INTEGRATION / CONNECTORS: SAP EBS & S/4HANA, Oracle EBS & Fusion Cloud, JD Edwards, MS Dynamics 365 & Business Central, NetSuite, Workday, QuickBooks – 50+ pre-built bi-directional connectors, sub-second sync. API / web-services integration with tokenised authentication; each touchpoint (vendors, GL, categories, PR, bid award, PO, GRN, invoice) configured independently, one-directional or bidirectional, synced on schedule, on-trigger (within seconds), or one-time load. Master data (vendors, GL, categories, items) is owned by the ERP and loaded into S2P Labs; supplier self-registration can originate in S2P Labs and sync back to the ERP.

DEPLOYMENT: (1) on-premise on the client's server (e.g. Government of India) – S2P Labs has no data access; (2) public/region cloud on Azure with DR; (3) private cloud on the client's managed AWS/Azure (e.g. Almoyad). LLM choice: OpenAI GPT-4o, Azure OpenAI (client's tenant), or AWS Bedrock (Llama/Mistral) – data sovereignty configurable.

SECURITY & COMPLIANCE: ISO 27001 and GDPR; Azure/AWS platform certifications per chosen region. Every action is auditable (timestamped logs across all modules, exportable CSV/PDF). Multi-tenant SaaS with strict tenant isolation; on-prem and private-cloud single-tenant options exist.

PRICING: per internal named user. SaaS annual recurring, or perpetual (unlimited users) for large/government/on-prem. NO charge for suppliers, invoices, transactions, documents, or auction events. Indicative ballpark: standard 20-user public-cloud SaaS (licence + implementation + integration) ~ USD 55–80k; on-prem perpetual (unlimited users) from ~ USD 400–500k+; a real Qatar deployment integrated to Oracle NetSuite via middleware was ~ USD 900k. Final pricing follows scope. Sales trial licence: typically 7–30 days.

IMPLEMENTATION: standard SaaS – 3–4 weeks (range 3–6 weeks); larger on-prem – 2–3 months. Most workflows, fields, approvals, roles, and process logic are configured (not coded) during onboarding; genuine custom development is scoped separately. Use "live today / configurable in setup / on the roadmap".

CONFIRMED METRICS: 2.6× ROI; 58% faster procurement cycles; 95%+ AI invoice match accuracy; 60–80% manual-effort reduction; 40% sourcing-cycle reduction; 90% of spend under control; maverick buying down 70%+; 25–30% lower processing costs; up to 10% supply savings via AI-assisted negotiation.

LIVE CLIENTS: DAFZA (Dubai Airport Freezone), Eagle Hills, Hassad Food (Qatar Investment Authority), Almoyad Group (Bahrain – 100+ companies on SAP B1, 15,000 suppliers), IntelliSmart (Government of India, S/4HANA), United Colors of Benetton (India), Akar Group, Ivor Connect, iWorld.

REGIONS: India; GCC (UAE, Qatar, Bahrain, KSA, Oman); SEA (Malaysia, Philippines); Sub-Saharan Africa.

FIVE UNIVERSAL DIFFERENTIATORS:
1. Suppliers always free – no per-supplier, per-invoice, per-transaction, or per-document charge; you pay only for internal users.
2. ERP-agnostic & portable – 50+ bi-directional connectors; if you change ERP, S2P Labs travels with you.
3. Deployment sovereignty – on-prem, private cloud, or public cloud, your choice.
4. Modern LLM-native AI – EVA (65+ tools) on OpenAI / Azure OpenAI / AWS Bedrock, embedded across all modules.
5. Speed & low TCO – standard SaaS in 3–6 weeks, no change-request billing, per-user pricing, no transaction fees.

COMPETITOR POSITIONING:
- SAP Ariba: WIN – suppliers always free (Ariba charges suppliers, inflating real TCO 3–5×), ERP-agnostic, deployment choice, 3–6 weeks vs 6–18 months. LEAD – Ariba Network (6M+ suppliers, supplier discovery); deep S/4HANA PO configurability.
- Coupa: WIN – suppliers free, deployment sovereignty, mid-market TCO, on-prem + Arabic UI. LEAD – Coupa BSM supplier network; Coupa Pay.
- Oracle Procurement Cloud: WIN – ERP-agnostic, 3–6 weeks vs 8–18 months, per-user pricing, true on-prem. LEAD – deep PO configurability; powerful Oracle BI analytics.
- Jaggaer: WIN – no change-request billing, faster deploy, native invoicing/payment. LEAD – strong SLM; deep spend-analytics classification.
- GEP SMART: WIN – pure software, speed, fits $20M–$500M. LEAD – strategic-sourcing suite; supply-chain risk intelligence.
- Ivalua: WIN – 3–6 weeks vs 6–24 months, transparent per-user pricing, modern LLM-native AI. LEAD – most configurable large S2P; very strong CLM.
- Zycus: WIN – LLM-native EVA vs Zycus older Merlin AI, more ERP connectors, faster deploy, true on-prem. LEAD – deep India penetration; established iComply.
- Microsoft Dynamics 365: S2P Labs EXTENDS it – adds external supplier portal, full RFx + auctions, AI three-way match, native CLM.
- Basware: WIN – full upstream S2P, native CLM, on-prem/private cloud, free supplier portal. LEAD – market-leading e-invoicing.
- SME tools (Tradogram/Procurify/Kissflow): WIN – full S2P vs PR/PO + basic reporting; enterprise governance. LEAD – much cheaper at small scale.

INTELLIGENCE SUITE (PriceIQ™ & Netra™):
- Tagline: "KNOW WHAT YOU SHOULD PAY, BEFORE YOU NEGOTIATE."
- PriceIQ™ (Supplier Cost Intelligence): Rebuilds supplier costs from first principles to deliver a should-cost target.
- Netra™ (Negotiation Intelligence): Equips the buyer with live data, market conditions, and leverage before negotiation.

HONEST GAPS:
- Global supplier-discovery network: Ariba (6M+) and Coupa BSM lead.
- Multi-country VAT / e-invoicing compliance across 30+ regimes: Basware's speciality.
- Automated external financial-ratio analysis: not native.
- Arabic / non-English invoice OCR: English-only today.

ICP FIT: best fit = organisations ~USD 10–20M+ turnover with many suppliers – real estate, manufacturing, construction, contracting, government, energy/oil & gas.`;
