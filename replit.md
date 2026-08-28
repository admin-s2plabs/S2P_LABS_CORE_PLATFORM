# Prokraya Vendor AI Agent

## Overview
Prokraya is an AI-powered enterprise vendor management platform designed to streamline Source-to-Pay operations. It focuses on vendor onboarding, document verification, compliance, and risk assessment. The platform leverages AI for intelligent suggestions in purchase requests, natural language processing for line items, duplicate detection, budget validation, and vendor recommendations. The project aims to deliver a modern SaaS solution that significantly enhances procurement workflows and vendor interactions.

## User Preferences
Preferred communication style: Simple, everyday language.
- **Audit Logging Rule**: Every new or modified CRUD/action endpoint MUST include audit logging using the `audit()` helper pattern. Import `logAudit` from `../administration/administration.service`, add the `audit()` helper if not present, and call it after `res.json()` but before `} catch`. Use fire-and-forget `.catch()`. Only log CREATE/UPDATE/DELETE/action endpoints, not GETs. The `am_audit_log` table requires a manually-generated ID (handled in repository).

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, Wouter for routing, TanStack React Query for state management.
- **Styling**: Tailwind CSS with CSS variables for light/dark mode, utilizing `shadcn/ui` (built on Radix UI) components.
- **Form Handling**: React Hook Form with Zod validation.
- **Design System**: Adheres to Material Design 3 principles, uses the Inter font, and a 12-column grid system.
- **Structure**: Pages are organized into public (`client/src/pages/`) and authenticated (`client/src/pages/modules/`), mirroring backend modules. Authenticated pages use the `/app/` URL prefix and are protected by `protected-route.tsx` enforcing RBAC based on `um_functions_dtls`.

### Backend
- **Framework**: Express.js with TypeScript.
- **API Pattern**: RESTful JSON API with a `/api` prefix.
- **Authentication**: Session-based using `express-session` and `passport.js`.
- **Architecture**: Modular, separating concerns into controllers, services, and repositories per functional module.

### Data Layer
- **ORM**: Drizzle ORM for PostgreSQL.
- **Schema**: Defined in `shared/schema.ts` with `drizzle-zod` for validation.
- **Storage**: `IStorage` interface for configurable storage solutions.
- **Key Models**: Includes Users, Vendors (workflow-based), Documents, Purchase Requests, and Items.
- **Procurement Workflow**: Supports Purchase Request creation, Sourcing, and Purchase Order creation.
- **Database Schema**: All production tables reside exclusively in the `dbo` schema. The public schema is completely empty — all Drizzle definitions use `dboSchema.table()` (via `pgSchema("dbo")`). Session store also uses `dbo.session`.

### AI Model Configuration
- **Table**: `dbo.am_ai_model_config` — stores provider configurations (OpenAI, Azure OpenAI, AWS Bedrock, Google Vertex, Llama 3, Mistral, Custom).
- **Page**: `/app/ai-model-config` — full-screen admin page for selecting and configuring AI providers. Each provider card has: API Base URL, API Key (masked), Model Name, Test Connection, Connect & Activate, and Disconnect buttons.
- **Active Provider**: Only one provider is active at a time (`is_active = true`). All AI features use the active provider.
- **Centralized AI Client**: `server/services/ai-client.ts` exports `getAIClient()`, `getAIModelName()`, `clearAIClientCache()`, and `AINotConfiguredError`. ALL 19 AI service files use `getAIClient()` instead of creating `new OpenAI()` directly. The client checks the DB for active provider config first, falls back to env vars (dev only), or throws `AINotConfiguredError`.
- **Cache Invalidation**: When a provider is activated, disconnected, or updated, `clearAIClientCache()` is called so the next AI call picks up the new config.
- **Error Handling**: If no AI provider is configured, all AI endpoints return HTTP 503 with `{ error: "...", code: "AI_NOT_CONFIGURED" }`. Frontend agent pages show this as a chat message directing users to configure AI.
- **Security**: API keys are masked in list responses (`••••••••`). The `getActiveAIModelConfig()` method has an `includeSecrets` parameter — only server-side code uses `true`; the API endpoint never returns raw keys.
- **Provider Types**: `cloud` (OpenAI, Azure, AWS, Google) and `self_hosted` (Llama 3, Mistral, Custom) — with setup guides for self-hosted providers showing system requirements, deployment options (on-premise + cloud), and step-by-step Docker commands.
- **Backend**: `GET /api/ai-model-config`, `PUT /api/ai-model-config/:providerKey`, `PUT /api/ai-model-config/:providerKey/activate`, `PUT /api/ai-model-config/:providerKey/disconnect`, `POST /api/ai-model-config/:providerKey/test`.
- **Frontend**: `client/src/pages/modules/administration/ai-model-config.tsx`.

### AI-Powered Features (using Replit AI Integration - gpt-4o-mini)
- **Procurement Enhancements**: AI for item suggestions, natural language parsing, duplicate PR detection, budget validation, and quantity prediction.
- **Vendor Management**: AI-powered vendor recommendations, automated analysis (document completeness, compliance, intelligence), and autofill.
- **Sourcing**: Planned — conversational AI agent for creating bids (RFQs, RFPs, Tenders). Currently marked as "coming soon".
- **Bid AI Features** (in `bid-ai-service.ts`): Bid strategy analysis, smart vendor recommendations, AI-generated requirements & clauses, Market Price Intelligence (PO + bid history), Vendor Response Quality Scores, AI Technical Evaluation (pre-scoring), AI Commercial Evaluation (pre-scoring), AI Negotiation Suggestions (vendor-specific targets + talking points), Optimal Award Recommendation (single/split award strategy with vendor ranking, item allocation, strengths/risks).
- **PO Anomaly Detection**: Analyzes Purchase Orders against historical data to detect pricing anomalies, duplicates, and inconsistencies.
- **AI Invoice Matching**: Document-based verification using OpenAI Vision (OCR) for structured data extraction and three-way matching against system entries, POs, and GRNs.
- **AI Invoice Fraud Detection**: Analyzes historical invoices for patterns of suspicious behavior across 8 checks (e.g., duplicate numbers, round amounts, vendor frequency spikes), providing a risk score and narrative summary.
- **Action-Capable AI Agents**:
    - **EVA (Enterprise Virtual Assistant)**: The central AI agent with 65 tools covering ALL modules — procurement (PRs, POs, delivery notes, GRNs), invoices & payments, bids/sourcing, vendors (contacts, banks, docs, services, approvals), spend analysis (KPIs, category/supplier/dept spend, trends, savings, maverick spend, cycle times), budgets, administration (org, locations, payment terms, lookups, audit trail), user management (users, roles, approvers, delegations), items & categories. Supports full end-to-end procurement workflow (create bid → add lines → invite vendors → add T&C → publish) with single-confirmation execution.
    - **Vendor Agent**: Utilizes OpenAI function calling with 8 tools (READ/WRITE for vendor management, onboarding, invitation).
    - **Procurement Ops Agent**: Uses OpenAI function calling with 29 tools (READ/WRITE for requisitions, purchase orders, items, categories, delivery notes, GRNs).
    - **Payables Agent**: Uses OpenAI function calling with 16 tools (READ/WRITE for invoices, payments, and integrating AI matching/fraud checks).
- **Agent Architecture**: All action-capable agents follow a tool execution loop, two-phase confirmation for write operations, and ensure session user passthrough for audit trails.

### Vendor Self-Edit Change Tracking
- **Mechanism**: When approved vendors edit profiles, `prev_` columns store old values. Status changes to "Pending Approval". Changes are reverted on rejection or cleared on approval.
- **API**: `GET /api/dbo/suppliers/:id/changes` provides a diff of current vs. previous values.

### Core Modules & Features
- **Spend Analysis Dashboard**: Four-tab analytics page (Spend Analysis + Operational Analysis + Strategic Insights + AI Insights) with bento-grid layout, 30+ backend endpoints. Spend tab includes bid & sourcing savings (moved to top), budget overview, spend intelligence, procurement compliance, savings & risk sections. Strategic Insights tab includes Year-over-Year spend comparison, Vendor Concentration Risk assessment, Payment Terms Analysis, and Upcoming Payment Obligations (cash flow visibility). AI Insights tab uses GPT-4o-mini to analyze procurement data and generate executive summaries, spend anomalies, savings opportunities, risk alerts, strategic recommendations, and a 5-dimension health score (overall, spending, supplier risk, payment discipline, budget compliance). Results cached for 15 minutes. Bid savings section tracks estimated vs awarded amounts, competitive savings from vendor responses, savings by bid type (RFQ/Tender/RFP), bid pipeline status distribution, and top savings bids table.
- **Bids & RFQs**: Comprehensive management of RFQs, RFPs, and Tenders through a defined workflow.
- **Budgets**: Tracking and management of budgets with utilization statistics, allocations, and attachment support.
- **Administration**: Configuration of application settings, organization details, locations, lookups, and notification templates.
- **Approval Workflow Engine**: A flexible Node.js engine for defining and executing approval processes with various assignment types and conditional routing.
- **EventBus & Email Notification System**: Publish/Subscribe event bus integrated with an email service for configurable notifications.
- **Free Trial Registration**: Public signup page at `/free-trial` allowing prospects to register for a 30-day trial. Creates entries in `dbo.am_tenant_mst` with domain name, company info, and contact details. Includes domain availability check, provisioning animation, and redirect to tenant URL. Backend: `server/modules/free-trial/free-trial.controller.ts`. Frontend: `client/src/pages/free-trial.tsx`.
- **Multi-Tenant Login**: Login page (`/login`) implements a two-phase domain-first authentication flow. Phase 1: User enters their organization domain (e.g., `acme`), which is verified against `dbo.am_tenant_mst`. On production, valid domains redirect to `acme.prokraya.ai`. On localhost/dev, domain is verified via API then email/password fields appear. If URL is a subdomain (`acme.prokraya.ai`), domain auto-populates read-only. Backend endpoint: `GET /api/auth/verify-domain/:domain`. Domain is stored in session and localStorage after login.
- **Multi-Tenant DB Routing**: Middleware in `server/index.ts` extracts the tenant domain from the subdomain or session on every request, looks up the tenant's `db_name` in `dbo.am_tenant_mst` (master DB), and attaches a dedicated Drizzle ORM instance (`req.tenantDb`) and pg Pool (`req.tenantPool`) to the request. Connection pools are cached per tenant for performance. Domain-to-DB mapping is cached in memory. Helper functions `getTenantDb(req)`, `getTenantPool(req)`, `getTenantDomain(req)`, and `isTenantRequest(req)` are exported from `server/modules/_shared` for use in routes. Falls back to master DB when no tenant context is present. Infrastructure: `server/tenant-db.ts`.

### ERP Integration & Sync Engine
- **Configuration**: `dbo.am_masterdata_trans_dtls` stores entity configurations, including field mappings and ERP endpoints.
- **Sync Modes**: Supports `standard` (visual field mapping, generic batch sync) and `custom` (developer-written handlers for complex scenarios).
- **Custom Sync Handlers**: Registry pattern allows developers to create and register custom logic for syncing.
- **Post-Mapping Hooks**: Provides record-level transformations within the standard sync engine (Fetch → Map → Hook → Save).
- **Logging**: `dbo.mst_mgrt_log` and `dbo.mst_mgrt_log_dtls` for tracking sync execution and record-level details.

## External Dependencies

### Database
- PostgreSQL

### AI Services
- OpenAI
- Google Generative AI

### Third-Party Services
- Stripe
- Nodemailer