import { Router, Request, Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { tenantService } from "./free-trial.service";

export const freeTrialController = Router();

freeTrialController.get("/api/countries", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT id, description, key_2 FROM dbo.am_country_info_dtls ORDER BY description`
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch countries" });
  }
});

freeTrialController.get("/api/free-trial/check-domain/:domain", async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    const result = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM dbo.am_tenant_mst WHERE domain_name = ${domain}`
    );
    const count = parseInt(result.rows[0]?.cnt as string || "0");
    res.json({ available: count === 0 });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to check domain" });
  }
});

freeTrialController.post("/api/free-trial/verify-tenant", async (req: Request, res: Response) => {
  try {
    const { domainName } = req.body;

    if (!domainName) {
      return res.status(400).json({ message: "Domain name is required" });
    }

    const result = await db.execute(
      sql`SELECT tenant_id, company_name, domain_name FROM dbo.am_tenant_mst WHERE domain_name = ${domainName}`
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid domain name. Domain is not registered!" });
    }

    res.json({ status: "success", tenant: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to verify tenant" });
  }
});

freeTrialController.post("/api/free-trial/register", async (req: Request, res: Response) => {
  try {
    const { companyName, domainName, contactName, email, country, mobile } = req.body;

    if (!companyName || !domainName || !contactName || !email || !country || !mobile) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!/^[a-z]+$/.test(domainName)) {
      return res.status(400).json({ message: "Domain name must contain only lowercase letters, no spaces, numbers or special characters" });
    }

    const existing = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM dbo.am_tenant_mst WHERE domain_name = ${domainName}`
    );
    if (parseInt(existing.rows[0]?.cnt as string || "0") > 0) {
      return res.status(400).json({ message: "Hey, seems like you already have a S2P Labs free trial for the given domain name. We have sent you an email with a link to log into your account. Please kindly check your email!" });
    }

    const emailExists = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM dbo.am_tenant_mst WHERE email = ${email}`
    );
    if (parseInt(emailExists.rows[0]?.cnt as string || "0") > 0) {
      return res.status(400).json({ message: "Hey, seems like you already have a S2P Labs free trial for the given email. We have sent you an email with a link to log into your account. Please kindly check your email!" });
    }

    const nameParts = contactName.trim().split(" ");
    const firstName = nameParts[0] || contactName;
    const lastName = nameParts.slice(1).join(" ") || contactName;
    const userName = email;

    const tenantId = generateTenantId();

    await db.execute(
      sql`INSERT INTO dbo.am_tenant_mst (tenant_id, db_name, url, company_name, country, domain_name, email, first_name, last_name, mobile, user_name) 
          VALUES (${tenantId}, ${domainName}, ${domainName}, ${companyName}, ${country}, ${domainName}, ${email}, ${firstName}, ${lastName}, ${mobile}, ${userName})`
    );

    const tenantData = {
      tenantId,
      companyName,
      domainName,
      email,
      firstName,
      lastName,
      country,
      mobile,
      userName,
    };

    tenantService.createTenantDB(tenantData).catch((error) => {
      console.error(`[FreeTrial] Async DB creation failed for tenant '${domainName}':`, error.message);
    });

    res.json({ 
      status: "success", 
      message: "Your free trial has been registered successfully!",
      tenantId,
      domain: `${domainName}.prokraya.ai`
    });
  } catch (error: any) {
    console.error("Free trial registration error:", error);
    res.status(500).json({ message: "Registration failed. Please try again." });
  }
});

function generateTenantId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 11; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
