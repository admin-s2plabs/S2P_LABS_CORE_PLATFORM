export const PlatformDocs = {
  feature_matrix: `
Module Feature Matrix
Dashboard: Super Admin view of metrics, snapshot of pending approval requests, tasks, recent activity, available budgets, user settings, security (change password), delegation, role-based email notifications, feedback submission.
Supplier Onboarding: New supplier registration, upload relevant documents and banking details, select scope of supply categories, update profile details.
Suppliers: List view of suppliers, view contact details, scope of supply, banking details, documents, approval history. Invite new supplier, create supplier on behalf of supplier, export suppliers.
Purchase Requisition (PR): PR creation, approved PR can be redirected to PO creation or bid creation, budget selection, cost estimation, PR list, export, filter PRs, consolidate multiple PRs.
Auction: Create or reuse auction templates, Excel upload, rank auction and price auction strategies, scheduling, lot-based and partial allocation, search and invite suppliers, event extension, savings analysis, supplier-wise price cap, T&C, draft mode, withdraw auction, proxy bid, broadcast message, compare bids, bid summary, auction overview, copy auction, bid details, reports, partial awarding.
Bids / RFQ / RFP: List of draft and published bids, export bids, create RFQ/RFP/sealed tender, add bid preparation team, create bid from template, track audit logs, upload specs, cancel awarded bid, compare technical and financial responses, request negotiation in sealed bids, evaluation members and approvals, notifications to suppliers and buyers, track bid lifecycle.
Purchase Orders (PO): PO list, export, filter POs, add advance payment, view budgets during PO creation, attach documents for suppliers, track delivery notes and receipts, track invoices per receipt, cancel PO, 3-way match, supplier confirms PO, create new PO from template, modify issued PO, split PO across suppliers.
Invoices: Supplier can raise invoice, invoice allowed only if receipt exists, delivery notes, partial invoicing, prevent duplicate delivery note and invoice numbers, view invoice payment delays, non-PO invoices, upload invoice lines via template, approval history logs, export invoices, automated invoice data extraction (OCR).
Items: Add/edit items, upload items via Excel, export item list.
User Management: Super admin creates organization users, edit user profiles, assign multiple roles, reset password, create custom roles, role-based portal access.
Administration: System settings, cost center setup, configure approval workflows, advanced configuration, multi-level approvals, track system activities, support multiple languages.
Budget: Create and revise budgets, export budget data, validate budgets during procurement.
Spend Analysis & Reports: Analyze overall spending, procurement personnel activity analysis, customizable reports with insights, generate reports dynamically, AI-driven analytics, track procurement spend.
Security & Access: MFA login, centralized access management.
  `,

  ai_features: `
AI Features
AI Award Recommendation: Optimal award decisions with split/single strategy analysis.
AI Bid Strategy Advisor: Get AI-recommended bid strategies for optimal sourcing outcomes.
AI Clause Generation: Generate legally sound T&C clauses tailored to each bid.
AI Commercial Evaluation: Automated commercial evaluation with price benchmarking.
AI Market Price Intelligence: Know the market price before you negotiate with vendors.
AI Negotiation Suggestions: Walk into vendor negotiations with data-backed talking points.
AI Requirements Generation: Auto-generate evaluation criteria in minutes.
AI Smart Vendor Suggestions: Invite the right vendors based on expertise and past performance.
AI Technical Evaluation: Pre-score technical responses automatically.
AI Budget Amount Suggestion & Creation: Set accurate budgets based on historical spending intelligence.
AI Clause Builder: Generate a full clause library for any contract type.
AI Legal Advisor (Chat): Chat with an AI legal advisor for clause recommendations.
AI Risk Analysis: Weighted risk scoring across financial, compliance, and delivery for every contract.
Clause Risk Analysis: Identify legal and commercial risk in any clause instantly.
Duplicate Clause Detection: Detect and eliminate duplicate clauses.
Extract Contract Clauses: Extract every clause from uploaded contracts automatically.
Generate Clause from Description: Draft legally sound clauses from a plain-text description.
Improve / Rewrite Clause: Rewrite or improve clauses to match any negotiation style.
Variable Suggestions: Automatically tag dynamic values as reusable variable placeholders.
Vendor Contract Summary: Give vendors a plain-English summary with red flags before they sign.
AI Fraud Detection: Catch fraudulent invoices.
AI Invoice Matching: Process invoices 10x faster with vision-powered OCR matching.
AI Auto-Categorization (UNSPSC): Auto-classify thousands of items in minutes.
AI SKU Generation: Standardize your product catalog with consistent AI-generated SKUs.
AI Item Suggestions: Reduce PR creation time by 60% with smart item suggestions.
AI Vendor Recommendations: Find the best vendor in seconds.
Budget Validation: Prevent budget overruns before they happen.
Duplicate PR Detection: Eliminate duplicate spending.
Natural Language Line Items: Type naturally, get structured line items instantly.
Quantity Prediction: Order the right quantity every time based on consumption patterns.
AI PO Anomaly Detection: Detect pricing anomalies and duplicate POs automatically.
AI Spend Insights: Executive-ready spend analytics and savings opportunities in one click.
AI Compliance Check: Ensure 100% vendor compliance.
AI Document Analysis: Verify vendor documents in seconds.
AI Smart Autofill: Cut vendor onboarding time by 80%.
AI Vendor Intelligence: Deep risk assessment and performance scoring.
  `,

  ai_agents: `
AI Agents
1. Vendor Agent
Capabilities: Vendor Onboarding, Vendor Invitation, Risk Assessment, Vendor Search, Vendor Analytics, Vendor Comparison.
Example: "Onboard [supplier name] from [Location]", "What's the risk assessment for supplier ID?", "Compare vendors A and B"

2. Sourcing Agent
Capabilities: Bid Creation, Supplier Bid Analysis, Supplier Discovery, Negotiation Insights.
Example: "Create an RFQ for [item] quantity X with delivery date Y", "Analyze bids for RFQ Z"

3. Procurement Ops Agent
Capabilities: Purchase Requisition Creation, PO Creation, Order Tracking, Procurement Insights.
Example: "Create purchase requisition for [item] quantity X", "Create PO from PR ID", "Track delivery status for PO X"

4. Payables Agent
Capabilities: Invoice Processing, 3-Way Matching, Payment Scheduling, Payment Status.
Example: "Process invoice X for PO Y", "Perform 3-way match for invoice X", "Schedule payment for vendor A invoices due this week"
  `,

  business_user_platform: `
Business User Platform
Dashboard: Top summary cards (Total Users, Active Org Users, Supplier Users), pending approvals (PRs, POs, Invoices, Bids), tasks to do, recent activity, available budgets.
Vendors: Invite supplier, create supplier. Search/filter. Columns: ID, Name, Status, Type, Country, Email, Contact No, Created By, Registered.
Category Management: UNSPSC-based hierarchy.
Item Master: SKU Code, Name, UoM, Category, Standard Price, Min Order Qty, Manufacturer, Part Number, Lead Time, Description.
Purchase Requisitions (PR): Delivery Location, Need By Date, Requestor, Buyer, Currency, Budget. PR line items (Description, Category, Qty, UoM, Price).
Purchase Orders (PO): Advance Payment option. PO Line Items. Sub-sections: Delivery Notes, Receipts, Invoices.
Invoices: NON-PO invoice requires Vendor, Department, Invoice Number, Invoice Date, Type, Currency, Reason, Budget, Payment Terms, Upload Docs, Invoice Lines.
Bids: Active/Draft Bids. Create new bid: Title, Type (RFQ/RFP/Tender), Buyer, Currency, Open/Close dates, Payment Terms, Delivery Location. Add Scope of Work, Invited Vendors, Evaluation Criteria, Evaluation Team.
Contracts: Draft/Active/In Negotiation/Pending Signature/Expired. Clauses (use from library or create new), Templates.
Auctions: Live, Scheduled, Closed, Draft. Rank or Price strategy, Lot Based or Partial Allotment, Event Extension, Savings tracking.
Budgets: Budget Name, Business Entity, Owner, Period, Start/End Date. Cost Centre, Location, Department.
Reports: Supplier Export by Category, Requisitions Export by Item, PO Overview, Invoice Summary, Application User Report, Budget Summary.
Spend Analysis: Budgets vs Spend, Total Budget, Consumed, Reserved, Available. Maverick Spend Detection, Savings Analysis, Supplier Spend Concentration, YoY Spend Growth.
  `,

  procurement_workflows: `
Procurement Workflows & Lifecycle
Approval Workflows: Parallel Approval (multiple approvers simultaneously), Sequential Approval (predefined order).
Purchase Requisition (PR): Requisitioner creates PR → Approved PR converts to PO or Sourcing Event.
Sourcing Options: RFQ, RFP, Auctions. Bid Evaluation includes Technical vs Commercial teams. Partial or line-level awarding.
Purchase Order (PO): Issued after award or directly from PR. Advance payments supported.
Supplier Delivery: ASN, Bill of Lading, expected arrival date.
Goods Receipt (GRN): Receiving department confirms delivery against PO.
Invoice Management: Supplier raises invoice against PO and GRN. 3-way match validation. Finance approves for payment.
  `,

  administration: `
Administration Module
Basic Settings: Company info, logo, contact, default payment terms/tax rate/currency. Subsidiaries. Locations. Lookup properties. Payment Terms. Taxes. Terms and Conditions. Prefix setup.
System Settings: Scheduler Enabled, Email Notifications Enabled.
Cost Center Setup: Segment Types, Cost Center ID.
Approval Workflow: Set up for Supplier Registration, PR, PO, Invoice, Budget, Bid, Contract, Auction.
Setup Notifications: Notif ID, Event ID, From Role, To Role, Email Subject Template, Body Template.
User Management: Roles include Super Admin, System Admin, Procurement Manager, Procurement Officer, Finance Manager, Finance Officer, Department Head, Department User. Role delegation supported.
  `,

  supplier_platform: `
Supplier User Platform
Self-Onboarding Registration: Sign up (organization name, email, password). Company Details. Contact Details. Scope of Supply (categories). Banking Details. Certificates (PDF, JPEG, PNG with expiry dates).
Supplier Dashboard: Active POs, Pending Payments, Open Bids, Active Auctions.
Purchase Orders (Supplier View): Accept or Reject PO. Raise Delivery Note (ASN, Bill of Lading, Carrier, Ship Date, Expected Arrival).
Invoices (Supplier View): Raise invoice against GRN. Track payment status.
Bids (Supplier View): Respond to bids.
Contracts (Supplier View): Negotiate and sign contracts.
  `,
};
