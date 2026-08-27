/** Platform training knowledge base – injected into the widget's system prompt. */
export const KB: Record<string, string> = {

  platform_overview: `
WHAT PROKRAYA IS
Prokraya is an AI-powered Source-to-Pay (S2P) platform. It digitizes, automates, and optimizes the
complete procurement lifecycle – from identifying a purchase need through to supplier payment. It sits
ON TOP of your existing ERP and adds the intelligence, workflow, and supplier-engagement layer ERPs
were never built to provide.

It serves TWO user types on ONE interface:
- Organization users (internal) – raise requests, run sourcing, approve, process invoices, analyse spend.
- Supplier users (external, ALWAYS FREE, unlimited) – self-register, respond to bids, acknowledge POs,
  raise delivery notes/invoices, track payment.

CORE PRINCIPLES
- Single workspace for all internal users + all suppliers.
- Role-driven: every user sees only what their role + organization allows.
- The ERP stays the system of record. Prokraya integrates bi-directionally.
- Three-step document creation: PRs, bids, POs, invoices all follow the same 3-step pattern.
- AI embedded natively in every module.
- Configurable, not coded: workflows, fields, roles, approvals set up in the UI.

TRUST & DEPLOYMENT
ISO 27001 certified, GDPR compliant. Deploy as SaaS (Microsoft Azure), on-premise, or private cloud.
~6–8 week go-live, 50+ pre-built ERP connectors.
Key outcomes: 2.6× ROI, 58% faster cycles, 95%+ invoice-match accuracy, 60–80% less manual work.
  `,

  navigation: `
NAVIGATION & LAYOUT
A persistent LEFT navigation panel holds all modules. TOP-RIGHT has three items: the email/envelope icon
(notification inbox), the bell icon (pending tasks + approval requests), and your profile.

Left nav sections:
- EVA – conversational AI assistant (top).
- AI Console – AI Workbench, Templates, Workflow Builder, Track Workflows, AI Agents.
- Modules – Dashboard, Suppliers, Categories, Items, Requisitions, Purchase Orders, Invoices, Bids,
  Contracts (→ Contracts, Contract Terms, Clauses, Templates), Auctions, Budgets, Reports, Spend Analysis.
- Administration – Basic Settings, Cost Center Setup, Approval Workflow, Setup Approvers,
  Setup Notifications, AI Model Config, AI Service Settings, Audit Logs.
- User Management – Manage Users, Manage Roles, Role Delegation.
- Integrations – Manage Master Data, Interface Monitor, API Keys, API Documentation.

THE ONE PATTERN IN EVERY MODULE: a list/grid → a "Create/New" button (top-right) → a detail view with tabs.
  `,

  golden_path: `
THE END-TO-END "GOLDEN PATH":
1. Onboard the supplier (Invite → self-register → AI due-diligence → review & approve).
2. Raise a PR (3 steps: details → people & budget → line items; real-time budget check → approval).
3. From the approved PR, either Create Bid (competitive sourcing) or Create PO (supplier already known).
4. Bid: set type (RFQ/RFP/Tender) + criteria → invite qualified suppliers → publish.
5. Suppliers respond; buyer manages the live window (broadcast, extend, force-close).
6. Close → evaluate (technical scoring with commercials hidden, then commercial) → AI award recommendation.
7. Award (approval workflow) → convert to PO and/or Contract.
8. Send PO → supplier accepts → raises delivery note (ASN) → buyer records GRN.
9. Supplier raises invoice → AI 3-way match (PO+GRN+Invoice) + fraud check → approve → parked in SAP.
10. Finance posts & pays in the ERP → payment status syncs back → supplier sees "Paid".
  `,

  dashboard: `
MODULE: Dashboard / Home
- User statistics row: Total Users, Active Organization Users, Supplier Users.
- Pending Approval Requests: cards counting documents awaiting YOUR action.
- Tasks To Do: prioritised action queue.
- My Requests: your in-progress documents (Draft/Pending Requisitions, Draft/Approved Orders, Pending Invoices).
- Recent Activity, Available Budgets, Recent Comments.

SUPPLIER DASHBOARD: Active POs, open bids they're invited to, invoices submitted + payment status, notifications.
  `,

  suppliers: `
MODULE: Suppliers – complete vendor lifecycle.

LIST VIEW: status filters (Total, Active, Draft, Pending Approval, More Info Required, Changes in Draft, Rejected).
STATUS MEANINGS: Active = approved, can bid + receive POs. Draft = started, not submitted. Pending Approval = submitted, awaiting review. More Info Required = reviewer asked for more. Rejected = declined.

SUPPLIER PROFILE sections: Business Details, Tax Details, Scope of Supply, Contact Details, Banking Details, Documents, References, Approval History.

ONBOARDING – two methods + bulk:
1. Invite Supplier: enter name + email → system emails self-registration link → supplier completes → internal team reviews.
2. Create Supplier: internal user enters data → supplier gets login credentials to complete.
3. Bulk import at go-live from SAP/Excel.

AI SUPPLIER DUE DILIGENCE (runs on submission): Overall risk level, compliance score, validation checks, missing-documents flagged, recommendation (Approve/More info/Reject).
  `,

  categories: `
MODULE: Categories – procurement TAXONOMY (hierarchy classifying all spend, suppliers, and events).
LIST: Category ID, Status, Name, Parent Category, Description. Subcategories link to parents.
WHY IT MATTERS: every supplier's scope, every PR line, every bid/auction maps to a category – drives spend-by-category analytics.
  `,

  items: `
MODULE: Items – Item Master (product/service catalog). Each item has a unique SKU code, name, category, tax code.
ADDING: Add Item (manual). AI Auto Categorize → AI reads name/description and assigns the correct category.
AI Generate SKU → AI creates standardised SKU codes from name/category/description.
  `,

  requisitions: `
MODULE: Purchase Requisition (PR) – the formal internal request to buy; the START of every procurement transaction.

LIST: status cards – Total PRs, Draft, Pending Approval, Approved, Complete, More Info Required, Rejected, Cancelled.

CREATING A PR (3 steps):
- Step 1 – Requisition Details: Description, Department, Created Date (auto), Delivery Date, Deliver To.
- Step 2 – People & Budget: Requester, PR Owner (buyer), Business Entity, Budget, and "Check Budget" (real-time available balance check).
- Step 3 – Line Items: each line = Item (from Item Master), Quantity, Unit Price, Tax Code, Description.
Submit for Approval → routes automatically per the PR Approval Workflow.

APPROVAL: approver reviews → Approve / Reject / request More Information (mandatory remark); recorded in Approval History.
TWO PATHS FROM AN APPROVED PR: Create Bid (competitive sourcing) or Create PO (supplier already known).
  `,

  bids: `
MODULE: Bids – complete sourcing process (create/publish competitive events, manage responses, evaluate, award).

BID TYPES: RFQ (price-focused) · RFP (complex, multi-criteria) · Tender (formal/regulated).

CREATING A BID (3 steps):
- Step 1 – Bid Details: title, type, start/end date-time, payment terms, delivery location, linked PR, bid style (Open or Sealed), Templates.
- Step 2 – Scope & Line Items: items, qty, target price, specs. Evaluation Criteria (weighted scoring totalling 100%). "AI Generate Evaluation Criteria" suggests relevant criteria.
- Step 3 – Invite Suppliers: select from the QUALIFIED vendor list (filtered by category).

SIX-STAGE FLOW TRACKER: Prepare Bid → Publish → Closed → Prepare Award → Award Approval → Awarded.

SUPPLIER RESPONSE: Technical Response (criteria answers, docs) + Financial Response (per-line pricing). Suppliers can update any time while the window is open.

EVALUATION (after close): Technical review (commercial hidden during scoring) → Commercial review → Side-by-side comparison → AI award recommendation.
AWARD: select winner → Award → Award Approval workflow → winner notified → Convert to PO or Contract.
  `,

  auctions: `
MODULE: Auctions – real-time competitive bidding where suppliers bid simultaneously and prices move live.

TYPES: Reverse Auction (suppliers bid price DOWN). Forward Auction (bidders bid UP – selling surplus/scrap).
SERIAL AUCTION: products auction one-at-a-time sequentially.
STRATEGY: Rank Auction (suppliers see their rank but NOT competitors' prices) vs Price Auction (full price transparency).
ALLOTMENT: Lot Based (split into predefined lots) vs Partial Based (no lots; buyer decides split after close).

ADVANCED OPTIONS: Event Extension (anti-sniping) · Savings (measure per-line vs reference budget) · Supplier Price Cap · Terms & Conditions (must accept before bidding).
  `,

  purchase_orders: `
MODULE: Purchase Orders (PO) – the formal binding commitment to buy.

CREATING: from an approved PR, from an awarded bid, or directly (manual). Three panels:
- Order Details: description, source PR ref, dates, buyer, owner, department.
- Supplier & Delivery: supplier info, delivery location, Advance Payment %.
- Payment & Amount: budget, Net + Tax + Total (auto from lines), currency.

THREE LIVE STATUS FLAGS: Not Received/Received · Not Invoiced/Invoiced · Not Paid/Paid.

SUPPLIER PO FLOW: supplier sees it → Accept or Reject → Raise Delivery Note (ASN, full/partial toggle) → Advance Invoice or Raise Invoice.

GOODS RECEIPT (GRN): records physical receipt; validates received vs delivered qty. Rejected qty tracked (damaged/defective). GRN posted in connected ERP syncs to Prokraya in real time.

AI PO ANALYSIS (on an approved PO): supplier performance, benchmarking, anomaly detection, delivery-risk prediction.
  `,

  invoices: `
MODULE: Invoices – AP invoice lifecycle: supplier submission → 3-way match → approval → payment.

SUPPLIER SUBMISSION (from accepted PO → Raise Invoice): invoice number, date, type, line items (limited to GRN-confirmed qty), upload invoice document, due date, accept T&C → submit.

AI 3-WAY MATCH (auto on submission): compares PO + GRN + Invoice. 95%+ accuracy. Finance notified only on EXCEPTIONS.
AI FRAUD CHECK: every invoice scanned vs historical patterns.

APPROVAL: finance reviews exceptions → Approve / Reject / Request More Info.
PARKED INVOICE IN SAP: on approval, pushed to SAP as PARKED invoice; finance validates + posts from SAP.
PAYMENT: once paid in ERP, status syncs back; PO flips to Paid; supplier sees payment status live.
NON-PO INVOICE: for invoices not tied to a PO (utilities, subscriptions). Create Non-PO Invoice.
  `,

  contracts: `
MODULE: Contracts – full contract lifecycle (creation, negotiation, execution, digital signing, renewal).

CREATING: from scratch, from a Template, or Convert to Contract from an awarded bid.
STRUCTURE: Scope of Work + Clauses (from Clause Library or AI-generated).

CLAUSE LIBRARY + AI SUITE:
- AI Clause Builder: describe a clause → AI drafts a formal legal clause.
- AI Clause Extraction: upload an existing contract → AI extracts and categorises all clauses.
- AI Rewrite & Improve: highlight a clause → AI rewrites for clarity or strength.
- Duplicate Detection: flags duplicate/contradictory clauses.
- AI Legal Advisor (chat): ask about clauses, request missing-clause recommendations, risk assessments.
- Clause Risk Analysis: scores each clause's risk + overall weighted contract risk score.

NEGOTIATION: share with supplier; both add comments + suggest changes; full version history.
DIGITAL SIGNATURE: sent for e-signing; signed copy stored automatically.
RENEWAL ALERTS: auto-monitors end dates; alerts owner at configured intervals.
  `,

  budgets: `
MODULE: Budgets – create, manage, and track procurement budgets; every PR and PO checked in real time.

CREATING: Create New (manual) · Import from Excel · Create with AI (AI analyses historical spend to recommend amounts).
REAL-TIME CHECK: "Check Budget" queries available balance (total – approved PRs/POs) + % utilised.
APPROVAL: new budgets go through the Budget Approval workflow.
  `,

  reports: `
MODULE: Reports – standard MIS report templates that export procurement data to Excel.
Six standard templates:
1. Supplier Export by Category
2. Requisitions Export by Item
3. Purchase Order Overview by Department
4. Invoice Summary Report
5. Application User Report
6. Budget Summary Report
  `,

  spend_analysis: `
MODULE: Spend Analysis – strategic intelligence layer (tabs: Spend Analysis, Operational Analysis, Strategic Insights, AI Insights).
DASHBOARDS: spend by category (drill to supplier transaction), by supplier, by department, by time period, by entity, by currency.

AI SPEND INSIGHTS: Maverick spend detection, Savings opportunities, Preferred-vendor matching, Procurement performance KPIs, Predictive insights (future spend projections).
  `,

  ai_layer: `
AI CONSOLE + EVA – the AI automation hub: AI Workbench, Templates, Workflow Builder, Track Workflows, AI Agents.

EVA: conversational AI assistant reachable from any screen.

AI AGENTS (4 active):
- Vendor Agent – vendor search, onboarding, invitation, risk analysis, performance insights.
- Procurement Ops Agent – Create & update PRs, add PR/PO lines, submit for approval, manage catalog, track deliveries, record GRNs. (29 tools)
- Payables Agent – Create invoices, add lines, submit, process payments, AI 3-way PO-GRN match, fraud detection. (16 tools)
- Sourcing Agent – Create RFQ/RFP/Tender from natural language, add lines + vendors, publish, track responses, evaluate, award recommendations. (24 tools)

AI WORKBENCH: chain agents into automated workflows that run on triggers. Example live workflows: Auto-Source High-Value PRs · Vendor Compliance Monitor · Contract Renewal Pipeline · New Vendor Onboarding.

WORKFLOW BUILDER: build custom workflows. AI Workflow Generator → describe in plain English → Generate creates the full trigger/conditions/agent-steps. Components: Triggers, Agents, Conditions, Approvals, Actions, Notifications.

TEMPLATES: 35 pre-built workflow templates across 6 categories, deployed 6,262 times.

TRACK WORKFLOWS: monitor all runs. Each run shows current step, timestamp, duration, status. Full governance traceability.
  `,

  administration: `
ADMINISTRATION – the configuration backbone.

BASIC SETTINGS: company info, logo, contact, subsidiaries, locations, lookup values, payment terms, taxes, T&C, document prefixes, exchange rates, session/MFA settings.

COST CENTER SETUP: defines the structure for spend tracking + budget allocation. Every PR/PO maps to a cost center.

APPROVAL WORKFLOW: governance engine – who must approve each document type. Eight independent workflows:
Supplier Registration, Purchase Request, Purchase Order, Invoice, Budget, Bid, Contracts, Auction.
Built as sequential numbered steps with assignee + conditions (amount, department, category, role). Multi-level and parallel supported.

SETUP APPROVERS: each approver's monetary authority – From Amount, To Amount, User, Currency.

SETUP NOTIFICATIONS: 102 event-driven email/SMS templates across all modules.

AUDIT LOGS: tamper-proof record of every action by every user. Filter by module/action/user/date; export. Critical for compliance/audit prep.
  `,

  user_management: `
USER MANAGEMENT.

MANAGE ROLES – nine system roles:
- Super Administrator – full control.
- System Administrator – system config, User Mgmt, Administration settings (not transactional procurement).
- Procurement Manager – runs procurement + team; creates/approves sourcing, POs, bids.
- Procurement Officer – buyer for PRs/POs/sourcing day-to-day.
- Finance Manager – runs payment processes + team; oversees invoice approval/payment.
- Finance Officer – handles invoice payments.
- Department Head – approves their department's PRs.
- Department User – raises PRs for their department (most restricted).
- Supplier User – supplier profile mgmt, PO management, invoice submission, bid participation.
CUSTOM ROLES: admins can create custom roles with granular module-level permissions.

MANAGE USERS: Organization (internal) and Supplier (vendor) tabs. Create New User → assign department/role/entity → user gets email invite.

ROLE DELEGATION: temporarily transfer approval authority to another user for a defined period. Auto-reverts. Logged in Audit Logs.
  `,

  integrations: `
INTEGRATIONS – ERP connections + master-data migration.

MANAGE MASTER DATA: 14 entity types migratable from connected ERP (vendor master, GL accounts, items, categories, POs, GRNs, invoices, exchange rates, etc.). Re-sync manually or on schedule.

INTERFACE MONITOR: tracks every inbound/outbound API transaction in real time (success/failure/pending). Each entry: timestamp, entity, direction, status, message.

API KEYS: manages credentials for external systems pushing data into Prokraya via Inbound Integration Gateway.

API DOCUMENTATION: built-in reference. Auth: every request needs X-API-Key header. Key endpoints: POST /api/v1/integration/inbound/receipt (GRN), /purchase-requisition, /purchase-order, /payment, GET /health.
  `,

  sap_integration: `
SAP INTEGRATION – seven touchpoints (INT01a–INT07), bi-directional. SAP stays system of record.
- INT01a – One-time master-data load (vendor master, categories, items, GL accounts, WBS elements).
- INT01b – Ongoing vendor import (scheduled REST pull).
- INT02 – Vendor data updates (Prokraya→SAP, real-time; no manual re-entry in SAP).
- INT03 – Approved MR/PR sync (SAP→Prokraya, real-time).
- INT04 – PO sync (SAP→Prokraya, real-time; suppliers access POs via portal without SAP access).
- INT05 – GRPO sync (SAP→Prokraya, real-time; PO's Not Received flag flips to Received).
- INT06 – Park approved invoice (Prokraya→SAP, real-time; eliminates manual AP re-entry).
- INT07 – Payment status sync (SAP→Prokraya; PO flips to Paid; supplier sees status live).
  `,

  roles: `
ROLES (nine system roles; custom roles possible):
SuperAdministrator (full control) · System Administrator (system config, not transactional) ·
Procurement Manager (runs sourcing/POs/bids + team) · Procurement Officer (buyer, day-to-day) ·
Finance Manager (payment processes + team) · Finance Officer (invoice payments) ·
Department Head (approves their dept's PRs) · Department User (raises PRs, most restricted) ·
Supplier User (profile, PO mgmt, invoice submission, bid participation).
  `,

  supplier_portal: `
SUPPLIER-SIDE EXPERIENCE (free portal, email or OTP login):
- Complete registration + upload documents.
- Receive + respond to RFx/auctions.
- Submit quotes/proposals + docs; participate in live auctions.
- Acknowledge + accept/reject POs; raise delivery notes/ASNs (full/partial).
- Submit invoices (Standard/Prepayment, limited to GRN qty); track payment status live.
Supplier nav shows only: Registration Profile, Purchase Orders, Invoices, Bids.
  `,

  key_numbers: `
KEY NUMBERS (documented platform/client outcomes):
60–80% reduction in routine procurement work · 95%+ AI invoice 3-way-match accuracy · 2.6× ROI ·
58% faster procurement cycles · 40% reduction in sourcing time · 90%+ spend under control ·
25–30% lower procurement processing costs · 50–60% faster invoice processing · 70%+ reduction in maverick buying ·
10% supply savings via AI-assisted negotiation · 25% better supplier delivery performance ·
6–8 week typical go-live · 50+ pre-built ERP connectors · 102 notification templates ·
35 workflow templates (6,262 deployments) · 7 AI agents · 29 tools in Procurement Ops Agent ·
24 tools in Sourcing Agent · sub-second ERP sync · unlimited supplier users at no extra cost.
  `,

  glossary: `
GLOSSARY:
S2P (Source-to-Pay) · P2P (Procure-to-Pay) · PR (Purchase Requisition) · RFx (RFQ/RFP/RFI) ·
RFQ (Request for Quotation) · RFP (Request for Proposal) · Tender (formal/regulated sourcing) ·
PO (Purchase Order) · GRN/GRPO (Goods Receipt Note) · ASN (Advance Shipment Notice) ·
3-way match (PO+GRN+Invoice) · MR (Material Request) · WBS (project work-breakdown element) ·
GL (General Ledger) · CLM (Contract Lifecycle Management) · AMC (Annual Maintenance Contract) ·
RBAC (Role-Based Access Control) · Sealed bid (hidden until committee opening) ·
Reverse/Forward auction (price down/up) · Serial auction (products sequentially) ·
Rank vs Price auction (rank-only vs full price transparency) ·
Lot-based vs Partial-based allotment · Maverick spend (off-contract buying) ·
Parked invoice (pushed to SAP, posted by finance) · EVA (Prokraya's AI agent) ·
Cost centre (budget/spend unit) · System of record (the ERP).
  `,

  faq: `
COMMON FAQ:
- "Do I create my to-do tasks?" No – the system assigns them by workflow + role.
- "Does the supplier enter their own data?" Yes – they self-populate; you review/approve.
- "Can anyone see bids before evaluation?" No – sealed bids stay hidden until committee opens them.
- "Where is master data held?" In your ERP; Prokraya syncs bi-directionally.
- "Can I run Prokraya without an ERP?" Yes – standalone or integrated.
- "What happens to a partial delivery?" Record a partial GRN; the balance stays open.
- "Can an invoice be checked before it hits the ERP?" Yes – it's approved + parked in SAP, then finance posts.
- "What if an approver is on leave?" Use Role Delegation (logged in the audit trail).
- "Are auctions extra?" No – built in. "Do suppliers pay?" No – supplier access is always free.
- "Reverse vs forward auction?" Reverse = suppliers bid price DOWN (buying); forward = bid UP (selling surplus).
  `,
};
