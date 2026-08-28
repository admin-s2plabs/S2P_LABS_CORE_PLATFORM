# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start both Express backend (port 5000) and Vite dev server
- `npm run build` - Build for production via `script/build.ts`
- `npm run start` - Run production build (`dist/index.cjs`)
- `npm run check` - TypeScript type checking (covers `client/`, `server/`, `shared/`)
- `npm run db:push` - Sync Drizzle schema to database
- `npm run test:e2e` - Playwright end-to-end tests (`:ui` / `:debug` variants)

There is **no unit-test framework or linter** configured — `npm run check` (tsc, no emit) is the verification gate. Run it before considering a change done. **`npm run check` is not green on a clean checkout** — there is a pre-existing baseline of ~115 errors in files unrelated to most changes. Don't chase zero; verify your change by diffing the error count/list against the baseline and confirming none of the reported errors point at files you touched. `npm run build` bundles the client with Vite and the server into `dist/index.cjs` with esbuild.

### E2E Tests (Playwright)
Specs live in `e2e/` (`playwright.config.ts` at the repo root); `e2e/fixtures/index.ts` is the shared `test`/`expect` entry point to extend with auth or tenant fixtures. The config's `webServer` runs `npm run dev` and reuses an already-running server, so a live Postgres is required. Only the `chromium` project is installed — add firefox/webkit to `projects` (and `npx playwright install`) if cross-browser coverage is needed.

**E2E gotchas**: `e2e/` is *not* in the tsconfig `include`, so `npm run check` does not type-check specs and Playwright only transpiles them — type errors there surface at runtime. `baseURL` defaults to `http://localhost:5000` (override with `E2E_BASE_URL`), which has no subdomain and therefore renders the **marketing website**; testing the authenticated portal needs `http://<tenant>.localhost:5000` plus a seeded tenant row in `dbo.am_tenant_mst`.

**Build allowlist gotcha**: `script/build.ts` esbuilds the server with an explicit `allowlist` of dependencies to bundle (the rest stay external). When you add a new server-side npm dependency that must ship in the bundle, add it to that `allowlist` — otherwise the production `dist/index.cjs` will fail to resolve it at runtime even though `npm run dev` works fine.

**Schema changes**: `npm run db:push` (drizzle-kit push) is the primary path — it syncs `shared/schema.ts` directly to the database. `drizzle.config.ts` points `out` at `migrations/`, but that directory is currently empty; there is no generated-migration workflow in use, so treat `shared/schema.ts` as the source of truth.

### Database Setup
1. Install PostgreSQL 15+
2. `createdb prokraya`
3. `psql -d prokraya -c "CREATE SCHEMA IF NOT EXISTS dbo;"`
4. Restore: `pg_restore --clean --if-exists --no-owner --no-privileges -d "postgresql://postgres:password@localhost:5432/prokraya" database_backup.backup`
5. Copy `.env.example` → `.env`

### Environment Variables
- Required: `DATABASE_URL`, `SESSION_SECRET`
- Optional: `PORT` (default 5000), `NODE_ENV`, `APP_URL`
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- AI: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
- JWT (prod): `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` — RS256 PEM keys; auto-generated in dev but not stable across restarts

## Architecture Overview

### Full-Stack Structure
- `client/` — React 18 + Vite + Tailwind + wouter (not react-router)
- `server/` — Express + TypeScript, ESM via `tsx`
- `shared/` — Drizzle ORM table definitions (`schema.ts`) and Zod DTOs shared by both sides

TypeScript path aliases: `@/*` → `client/src/*`, `@shared/*` → `shared/*`

### Multi-Tenancy (Critical)
Routing is **subdomain-based**. On each request:
1. The subdomain is extracted from the `Host` header
2. `tenant-db.ts` looks up `dbo.am_tenant_mst` in the master DB to find the tenant's `db_name`
3. A per-tenant Postgres pool + Drizzle instance is resolved and stored in `AsyncLocalStorage`

In any module/service code, **always use `getContextDb()` / `getContextPool()` from `tenant-context.ts`** — never import the master `pool` or `db` from `server/db.ts` directly. The master DB is only for tenant lookup and session storage.

**Multipart upload gotcha**: multer breaks `AsyncLocalStorage`. On any `multer`-using route, apply `rewrapTenantContext` (from `tenant-context.ts`) as middleware immediately after multer to restore the tenant context.

### Request Lifecycle (server/index.ts)
1. Session middleware (PostgreSQL-backed, stored in `dbo.session`)
2. `req.user` populated from session or JWT Bearer token (`populateUserFromBearer`)
3. Tenant DB resolution middleware → `tenantStorage.run(...)` wraps downstream async chain
4. Controllers in `routes.ts` → registered as Express routers

### Authentication & Authorization
Two auth mechanisms coexist, both write to `req.user` as `SessionUser`:
- **Session cookies** — browser clients; `express-session` + `connect-pg-simple`
- **JWT Bearer** — API/mobile; RS256-signed, 15-min access + 7-day refresh tokens

Guards in `server/modules/_shared/auth.ts`:
- `requireAuth` — either mechanism
- `requireStaff` — `userType === 0` (internal)
- `requireVendor` — `userType === 1` (supplier)
- `requirePermission(PERMISSIONS.X)` — RBAC check from `server/modules/auth/rbac.ts`

**`requireStaff`/`requireVendor` gotcha**: until the RFI module, nothing in the codebase actually called these two guards, so their `userType` numbers had silently drifted from reality (they checked `1`/`2`; the real convention set at login — see `CommonService.buildLoginResult`'s `isVendor = user.user_type === 1`, and `user-management.repository.ts`'s `WHERE user_type = 0` staff queries — is `0` = staff, `1` = vendor). Fixed in both places now, but if a `403`-on-a-legitimate-user bug ever resurfaces here, check `userType` against the DB convention above rather than trusting these numbers blindly again.

Permission format: `"<resource>:<action>"` (e.g. `"procurement:write"`). Role → permission map is in `rbac.ts`; `ROLE_ADMIN` maps to `["*"]` (wildcard).

### Module Pattern
Each feature module under `server/modules/<name>/` follows:
```
<name>.controller.ts   → Express Router, auth guards, calls service
<name>.service.ts      → Business logic
<name>.repository.ts   → DB queries via getContextDb() or req-based helpers
```

Some modules (e.g. `auctions`, `contracts`) have sub-directories (`controller/`, `services/`, `repositories/`). All controllers are registered in `server/routes.ts`.

**Audit logging (required)**: Every new or modified CREATE/UPDATE/DELETE/action endpoint MUST emit an audit log — GET endpoints do not. Use the local `audit(req, auditKey, auditAction, auditMessage, module)` helper (fire-and-forget) that wraps `logAudit` from `../administration/administration.service`; see `server/modules/vendors/vendors.controller.ts` for the canonical pattern. Call it after `res.json(...)`, before the `catch`. If a controller lacks the `audit()` helper, add it.

Shared module utilities (`server/modules/_shared/`):
- `auth.ts` — `requireAuth`, `requireStaff`, `requireVendor`, RBAC re-exports
- `errors.ts` — `ErrorCodes` enum + `appError()` factory; use these instead of raw strings
- `file-upload.ts` — multer config, MIME allowlist, magic-byte validation, `sanitizeFilename`
- `list-pagination.ts` — `parseListPageLimit()`, `listPaginationMeta()` for paginated APIs
- `db.ts` — `getTenantDb(req)`, `getTenantPool(req)`, `getTenantDomain(req)`

### AI Services (`server/services/`)
All AI services call `getAIClient()` from `ai-client.ts`, which reads active config from `dbo.am_ai_model_config` first, then falls back to `AI_INTEGRATIONS_OPENAI_API_KEY`. Throws `AINotConfiguredError` if neither is set — callers should surface this as a 400/422.

Every agent's `/query` and `/query/stream` endpoints are registered in a single controller, `server/modules/ai-console/ai-console.controller.ts` (not one controller per agent) — this is also where `/api/agent-conversations/:agentType` (chat history, persisted to `dbo.am_agent_conversations`) and `/api/ai-console/speech-to-text` are handled.

Key services:
- `procurement-agent-service.ts` / `pr-ai-service.ts` — PR creation
- `bid-ai-service.ts` — bid evaluation
- `negotiation-agent-service.ts` — chat-based negotiation
- `vendor-agent-service.ts` / `vendor-registration-agent-service.ts` / `vendor-registration-extraction.ts` — vendor onboarding
- `invoice-match-service.ts` / `invoice-fraud-service.ts` — invoice processing
- `eva-agent-service.ts` — EVA general assistant
- `sourcing-agent-service.ts` / `sourcing-agent-preview.ts` / `cost-intelligence-agent-service.ts` — spend intelligence
- `market-supplier-scraper.ts` / `ogd-market-price.ts` — live data tools for cost intelligence: puppeteer scraper (ExportersIndia/Made-in-China; IndiaMART/Alibaba are bot-walled, don't re-attempt) and data.gov.in mandi price lookup, feeding `cost-intelligence-agent-service.ts`'s Fair Market Price / Local Suppliers
- `payables-agent-service.ts` — accounts-payable assistant
- `po-anomaly-service.ts` / `po-delivery-risk-service.ts` — purchase-order anomaly + delivery-risk scoring
- `product-categorization-service.ts` / `sku-generation-service.ts` — catalog enrichment
- `supplier-rank.ts` — supplier ranking
- `document-extraction.ts` — generic document field extraction
- `workflow-ai-service.ts` — workflow suggestions

### Event Bus (`server/services/eventBus/`)
In-process `EventEmitter`-based pub/sub. Publish with `eventBus.publish(event)` or `eventBus.publishAsync(event)`. Register handlers in `handlers/` and wire them in `registerAllHandlers()` (called at startup). Use for side effects (email notifications, audit logs) triggered by domain actions.

### Frontend Routing
`App.tsx` uses **wouter** (not react-router). The app serves two distinct portals based on whether a tenant subdomain is detected (`getTenantSubdomain()` in `client/src/lib/utils.ts`):
- **No subdomain** → marketing website (`client/src/website/`) at `/`
- **Tenant subdomain** → authenticated app via `AppPortal` layout at `/app/*` and vendor portal via `VendorRegistrationPortal`

`AppPortal` (`client/src/layouts/app-portal.tsx`) wires all authenticated module routes. The page components themselves live in `client/src/pages/modules/<name>/` (directories mirror the server module names). A new page means a component under `pages/modules/` **and** a route entry in `app-portal.tsx`. Routes are inside a wouter `<Switch>`, so **order matters (first match wins)** — register a literal child route (e.g. `/app/contracts/copilot`) before its dynamic sibling (`/app/contracts/:id`), or the dynamic one swallows it.

**Route access control (gotcha)**: every `/app/*` route is wrapped in `ProtectedRoute` (`client/src/components/protected-route.tsx`), which allows a path only if it's in the user's `/api/user-menu` response, in the `ALWAYS_ACCESSIBLE` list, or mapped via `ROUTE_PARENT_MAP` to a parent URL the user can access. A brand-new route that isn't a real menu item (detail pages, sub-tools, the AI agents under `/app/ai-*`) will render **"Access Denied"** until you add a `ROUTE_PARENT_MAP` entry pointing it at an allowed parent (the AI agent pages all map to `/app/ai-agents`). AI agent pages live in `client/src/pages/modules/ai-console/` and are routed as `/app/ai-*-agent`.

### Frontend Data Fetching
React Query (`@tanstack/react-query`) is the data layer; the shared client lives in `client/src/lib/queryClient.ts`.
- **The default `queryFn` builds the request URL by joining the `queryKey` segments with `/`** — so `useQuery({ queryKey: ["/api/dbo/suppliers", id] })` fetches `/api/dbo/suppliers/<id>` with no explicit `queryFn`. Only supply a custom `queryFn` when the URL isn't a plain path join (e.g. query-string params).
- Query defaults are `staleTime: Infinity`, `retry: false`, no refetch-on-focus/interval. Nothing refetches on its own — after a write you must **explicitly `queryClient.invalidateQueries({ queryKey: [...] })`**.
- All non-GET calls go through `apiRequest(method, url, body)`: it injects the `x-user-email` / `x-user-name` auth headers from `localStorage["prokraya-auth"]`, throws on non-2xx (unwrapping `{ error | message }`), and centrally handles 401 session-expiry. Use `parseJsonResponse(res)` when a JSON body is required and an HTML app-shell response would otherwise produce an opaque error.
- UI gotcha: dialogs and toasts are both Radix (`@radix-ui/react-dialog` / `react-toast`). Closing a modal dialog in the same tick a success toast mounts can leave `pointer-events: none` on `<body>`, freezing the page; reset it in the mutation's `onSettled` (see `vendor-detail-review.tsx`).

### Database
All tables live in the `dbo` schema, but not every table is defined in `shared/schema.ts` — contracts, workflow, invoices, and bids are largely queried via raw SQL through `getContextPool()`/`getContextDb()` with no Drizzle definition. Naming prefixes:
- `supp_*` — supplier/procurement, and (despite the name) also bids, invoices, and POs (e.g. `supp_bid_response_dtls`, `supp_invoice_dtls`, `supp_po_header_dtls`) — there is no separate `bid_*`/`inv_*` prefix in practice
- `um_*` — user management
- `am_*` — admin/tenant
- `au_*` — auctions
- `cm_*` — contracts (not `ct_*`)
- `wf_*` — workflow definitions/instances (custom tables)
- `act_*` — Activiti/Camunda-schema BPM tables (`act_ru_task`, `act_hi_taskinst`, `act_ru_identitylink`, …), manipulated directly via raw SQL from `workflowService.ts` for task assignment/approval routing — there is no embedded BPM engine, just that schema convention reused
- `pm_*` / `cat_*` — product/category master

### Infrastructure Services
- **File storage**: Azure Blob Storage (`azure-blob.service.ts`), tenant-scoped folders
- **Email**: Nodemailer (`emailService.ts`), initialized at startup
- **Scheduled jobs**: node-cron, registered in `scheduledEvents.ts`
- **Properties**: runtime config from DB via `propertiesService.ts`

### CI/CD & Deployment
Deployment is via GitHub Actions in `.github/workflows/`, building a Docker image (`Dockerfile`) and pushing to Azure (ACR → AKS). There is a separate workflow per environment — QA, Stage, Prod, and the `CRITICALRIVER`/`AIG` tenant builds — so confirm which workflow/branch maps to the target environment before relying on a deploy. `claude-review.yml` runs an automated PR review on the `qa` and `prokraya-ai-master` branches. `playwright.yml` runs the e2e suite against a Postgres service container.

**Workflow gotcha**: `.github/` is listed in `.gitignore`. The existing workflows are tracked because they predate that rule, but any **new** workflow file needs `git add -f` or it will silently never be committed.

## Additional Reference Docs
- `replit.md` — product overview, deeper notes on AI features (EVA + agent tool counts, invoice matching/fraud, AI model config), and the audit-logging rule.
- `design_guidelines.md` — frontend design system (Material Design 3, Inter font, typography/spacing/grid conventions).
- `LOCAL_SETUP_GUIDE.md` — extended local setup walkthrough.
