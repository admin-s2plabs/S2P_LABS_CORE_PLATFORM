# Prokraya - Local Development Setup Guide

## Prerequisites

Before you begin, ensure the following are installed on your system:

- **Node.js** v20.x or later — [Download](https://nodejs.org/)
- **npm** v10.x or later (comes with Node.js)
- **PostgreSQL** 15 or later — [Download](https://www.postgresql.org/download/)
- **Git** — [Download](https://git-scm.com/)

---

## Step 1: Clone the Repository

```bash
git clone <your-repo-url>
cd prokraya
```

---

## Step 2: Install Dependencies

```bash
npm install
```

---

## Step 3: Set Up PostgreSQL Database

### 3.1 Create a Database

Open a terminal and run:

```bash
# Login to PostgreSQL (use your local postgres superuser)
psql -U postgres

# Create the database
CREATE DATABASE prokraya;

# Create the dbo schema (all tables live in dbo schema)
\c prokraya
CREATE SCHEMA IF NOT EXISTS dbo;

# Exit psql
\q
```

### 3.2 Restore the Database Backup

Make sure the `database_backup.backup` file is in your project root, then run:

```bash
pg_restore --clean --if-exists --no-owner --no-privileges -d "postgresql://postgres:your_password@localhost:5432/prokraya" database_backup.backup
```

**Parameter explanation:**
- `--clean` — Drops existing objects before restoring
- `--if-exists` — Avoids errors if objects don't exist yet
- `--no-owner` — Skips original ownership (uses your local user instead)
- `--no-privileges` — Skips original permissions

**If you get role-related warnings**, they are safe to ignore. The data will restore correctly.

**If restoring to a fresh database (first time)**, you can omit `--clean`:

```bash
pg_restore --no-owner --no-privileges -d "postgresql://postgres:your_password@localhost:5432/prokraya" database_backup.backup
```

### 3.3 Verify the Restore

```bash
psql -U postgres -d prokraya -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'dbo' ORDER BY table_name LIMIT 10;"
```

You should see tables like `um_user_dtls`, `supp_pr_header_dtls`, `supp_po_header_dtls`, etc.

---

## Step 4: Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your local values:

```env
# DATABASE — update with your local PostgreSQL credentials
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/prokraya
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_password
PGDATABASE=prokraya

# SESSION — generate a random string or use any secret
SESSION_SECRET=any-random-secret-string-here

# APPLICATION
NODE_ENV=development
PORT=5000
APP_URL=http://localhost:5000

# SMTP — for email notifications (optional for basic testing)
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@yourdomain.com
SMTP_PASS=your-email-password
SMTP_FROM=your-email@yourdomain.com

# OPENAI — for AI features (optional for basic testing)
AI_INTEGRATIONS_OPENAI_API_KEY=sk-your-openai-api-key
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
```

**Notes:**
- Database config is **required** — the app won't start without it.
- SMTP config is **optional** — email notifications won't work without it, but the app runs fine.
- OpenAI config is **optional** — AI features (agents, suggestions, invoice matching) won't work without it, but the app runs fine.

---

## Step 5: Start the Application

```bash
npm run dev
```

The application will start on **http://localhost:5000**

This single command starts both:
- Express backend server
- Vite frontend dev server (with hot reload)

---

## Step 6: Login

Open http://localhost:5000 in your browser.

Use one of the existing accounts from the database. Example:
- **SuperAdmin**: Check the `dbo.um_user_dtls` table for available users
- Passwords are hashed in the database — use the "Forgot Password" flow or update directly in the database if needed

---

## Troubleshooting

### "relation dbo.xxx does not exist"
The `dbo` schema may not have been created. Run:
```bash
psql -U postgres -d prokraya -c "CREATE SCHEMA IF NOT EXISTS dbo;"
```
Then re-run the restore command.

### "password authentication failed"
Double-check your PostgreSQL username and password in the `.env` file.

### "ECONNREFUSED" on startup
Make sure PostgreSQL is running:
```bash
# Linux
sudo systemctl start postgresql

# macOS (Homebrew)
brew services start postgresql

# Windows
net start postgresql-x64-15
```

### SMTP connection errors on startup
If you don't need email notifications, the app will still start but log SMTP errors. These are non-blocking.

### AI features not working
Ensure your `AI_INTEGRATIONS_OPENAI_API_KEY` is valid and has sufficient credits.

---

## Project Structure

```
prokraya/
├── client/                  # Frontend (React + Vite)
│   └── src/
│       ├── pages/           # Page components
│       ├── components/      # Reusable UI components
│       └── lib/             # Utilities
├── server/                  # Backend (Express)
│   ├── modules/             # Feature modules (controllers, services, repositories)
│   ├── services/            # Shared services (AI, email, workflow)
│   └── db.ts                # Database connection
├── shared/                  # Shared types and schemas
├── .env.example             # Environment variable template
├── database_backup.backup   # PostgreSQL database backup
└── package.json             # Dependencies and scripts
```

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run db:push` | Sync Drizzle schema to database |

---

## Taking a Fresh Database Backup

To create a new backup from your local database:

```bash
pg_dump --format=custom --file=database_backup.backup "postgresql://postgres:your_password@localhost:5432/prokraya"
```
