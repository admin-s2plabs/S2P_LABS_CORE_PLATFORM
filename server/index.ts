import "./polyfills";
import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool } from "./db";
import { emailService } from "./services/emailService";
import { registerAllHandlers } from "./services/eventBus/handlers";
import { initAzureBlobContainer } from "./services/azure-blob.service";
import { extractDomainFromRequest, extractSubdomainFromHostname, resolveTenantDb } from "./tenant-db";
import { tenantStorage } from "./tenant-context";
import { registerScheduledEvents } from "./services/scheduledEvents";
import { extractBearerToken, initializeJwtKeys } from "./modules/auth/jwt";
import { populateUserFromBearer } from "./modules/_shared/auth";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

// Liveness probe for the hosting platform (Render healthCheckPath). Registered before
// session/tenant middleware so it never touches the database or creates a session.
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    user: {
      id: string;
      email: string;
      name: string;
      userName: string;
      userRole: string;
      roleDisplayName: string;
      userType: number;
      orgId: string;
      suppOrgId: string;
      domain?: string;
    } | null;
  }
}

// Create PostgreSQL session store for persistence across server restarts
const PgStore = pgSession(session);

// Session middleware - must be before routes
app.use(
  session({
    store: new PgStore({
      pool: pool,
      schemaName: "dbo",
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "prokraya-vendor-ai-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "lax",
    },
  })
);

app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.use(async (req, res, next) => {
  const path = req.path.toLowerCase();
  const isApiRoute = path.includes("/api/");
  const isPublicAuthRoute =
    path.includes("/api/auth/login") ||
    path.includes("/api/auth/public-key") ||
    path.includes("/api/auth/forgot-password") ||
    path.includes("/api/auth/reset-password") ||
    path.includes("/api/auth/verify-email") ||
    path.includes("/api/auth/token") ||
    path.includes("/api/auth/invitation") ||
    path.includes("/api/auth/check-mobile") ||
    path.includes("/api/auth/register-vendor") ||
    path.includes("/api/countries") ||
    path.includes("/api/auth/check-org-name") ||
    path.includes("/api/auth/check-email") ||
    path.includes("/api/free-trial/register") ||
    path.includes("ai-prokraya-storage") ||
    path.includes("agenticprokraya") ||
    path.includes("verify-domain") ||
    path.includes("/api/auth/send-login-otp") ||
    path.includes("/api/auth/verify-login-otp") ||
    path.includes("/api/addscriptgoogle") ||
    path.includes("/api/makerightchoice") ||
    path.includes("/api/auth/sso/") ||
    path.includes("/api/email/taskapproval");

  if (isApiRoute && !isPublicAuthRoute) {
    return await populateUserFromBearer(req, res, next);
  }

  next();
});

// Middleware to populate req.user from session.
// If the request is for a specific tenant subdomain, only load the session user
// when their domain matches that subdomain — prevents master-DB users from
// being treated as authenticated on tenant subdomains.
app.use((req, _res, next) => {
  if (req.session?.user) {
    const hostnameSubdomain = extractSubdomainFromHostname(req);
    const userDomain = req.session.user.domain;
    if (hostnameSubdomain && hostnameSubdomain !== userDomain) {
      // Session belongs to a different tenant — do not honour it here.
    } else {
      (req as any).user = req.session.user;
    }
  }
  next();
});

// Tenant DB resolution middleware — resolves tenant database from subdomain or session
app.use(async (req, _res, next) => {
  try {
    const domain = extractDomainFromRequest(req);
    if (domain) {
      // Always set tenantDomain from subdomain so file uploads go to the correct folder
      (req as any).tenantDomain = domain;
      const tenantContext = await resolveTenantDb(domain);
      if (tenantContext) {
        (req as any).tenantDb = tenantContext.db;
        (req as any).tenantPool = tenantContext.pool;
        (req as any).tenantDbName = tenantContext.dbName;
        // Propagate tenant context through the entire async call chain so
        // repositories can pick it up without needing req passed explicitly.
        tenantStorage.run({ pool: tenantContext.pool, db: tenantContext.db }, next);
        return;
      }
    }
  } catch (err) {
    console.error("[TenantMiddleware] Error resolving tenant:", err);
  }
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

/**
 * Validate the AI knowledge layer before serving traffic. Catches a missing ai/ tree
 * (e.g. an image built without `COPY ai ./ai`), a template that no longer compiles, and
 * any drift between a skills catalog and its dispatcher — at boot rather than on a
 * user's first agent query.
 */
async function verifyKnowledgeLayer(): Promise<void> {
  const { assertAssetsPresent, aiAssetsDir } = await import("./services/knowledge-layer/asset-path");
  const { precompilePrompts } = await import("./services/knowledge-layer/prompt-renderer");
  const { verifyProcurementKnowledgeLayer } = await import("./services/procurement-agent-service");

  assertAssetsPresent();
  const { templates, partials } = precompilePrompts();
  const { tools } = verifyProcurementKnowledgeLayer();
  console.log(
    `[knowledge-layer] ready — ${templates} template(s), ${partials} partial(s), ` +
    `procurement: ${tools} tools verified (assets: ${aiAssetsDir()})`,
  );
}

(async () => {
  // Initialise RS256 key pair for JWT signing before any route is registered
  await initializeJwtKeys();
  await verifyKnowledgeLayer();
  await emailService.initialize();
  const { propertiesService } = await import("./services/propertiesService");
  await propertiesService.initialize();
  registerAllHandlers();
  registerScheduledEvents();
  await initAzureBlobContainer().catch((err) =>
    console.error("[AzureBlob] Failed to initialize container:", err)
  );

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      ...(process.platform !== "win32" ? { reusePort: true } : {}),
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();