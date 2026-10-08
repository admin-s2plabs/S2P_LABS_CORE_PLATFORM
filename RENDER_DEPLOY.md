# Deploying to Render (free tier)

The whole app (Express API + built React client) runs as **one Docker web service** on Render.
Postgres is hosted on **Neon** (free), since Render's free Postgres is deleted after 30 days.
`render.yaml` at the repo root defines the service; every push to `main` auto-deploys.

## 1. Database (Neon)

1. Create a Neon project. Copy the connection string, e.g.
   `postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/prokraya?sslmode=require`
2. In the **same project**, create the master DB (`prokraya`) and the tenant DB (`s2p`).
   Tenant connections reuse `DATABASE_URL` with only the database name swapped
   (`server/tenant-db.ts`), so all DBs must share one server and one set of credentials.
3. Restore the backup into each DB (change the DB name in the URL each time):
   ```bash
   pg_restore --clean --if-exists --no-owner --no-privileges -d "<neon-connection-string>" database_backup.backup
   ```

## 2. Tenant row for the Render hostname

The tenant is taken from the first label of the hostname. On `s2p.onrender.com`
that is `s2p` (the `name` in `render.yaml`), so register it in the master DB:

```sql
INSERT INTO dbo.am_tenant_mst
  (tenant_id, db_name, url, company_name, country, domain_name, email, first_name, last_name, mobile, user_name)
VALUES
  ('S2PRender01', 's2p', 's2p', 'S2P Labs', 'India', 's2p',
   'admin@yourcompany.com', 'Admin', 'User', '9999999999', 'admin@yourcompany.com');
```

If you rename the service in `render.yaml`, use the new name here and in `APP_URL`.
If `s2p` is already taken on Render, it will append a suffix — check the actual URL
in the dashboard and use that first label.

## 3. JWT keys

Generate a stable key pair once (otherwise logins break on every restart / wake-up):

```bash
node scripts/generate-jwt-keys.mjs
```

Paste each printed value (everything after `=`) into the matching env var in step 4.

## 4. Create the service

1. Push this repo (with `render.yaml`) to GitHub.
2. Render Dashboard → **New → Blueprint** → select the repo → branch `main`.
3. Fill in the prompted env vars:
   - **Required:** `DATABASE_URL`, `APP_URL` (`https://s2p.onrender.com`), `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`
   - **Optional:** SMTP (email), Azure Storage (file uploads), AI key, SSO, OGD.
     `SESSION_SECRET` is generated automatically.
4. Click **Apply**. The first Docker build takes ~10–15 minutes.

From now on, **every push to `main` rebuilds and redeploys automatically**. Render only
switches traffic once `/healthz` responds, so a broken build keeps the previous version live.

## Free-tier limits

- Sleeps after ~15 min idle; the next request takes 30–60 s to wake it. Cron jobs
  (`scheduledEvents.ts`) don't run while asleep.
- 512 MB RAM. Puppeteer-based scraping (cost-intelligence agent) may exceed it; if the
  service restarts with out-of-memory errors, move to the Starter plan (`plan: starter`).
- Local `uploads/` is ephemeral — configure Azure Blob Storage for persistent files.
- One tenant per `*.onrender.com` URL. For multiple tenants, add a custom domain with a
  wildcard (`*.yourdomain.com`) in Render and add that root domain to the exclusion list in
  `getTenantSubdomain()` (`client/src/lib/utils.ts`) and `server/tenant-db.ts`.
