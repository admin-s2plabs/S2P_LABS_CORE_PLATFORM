import { pool } from "../../db";
import { emailService } from "../../services/emailService";
import { tenantStorage } from "../../tenant-context";
import { drizzle } from "drizzle-orm/node-postgres";
import { exec } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import argon2 from "argon2";
import { schema } from "../../db";
import { v4 as uuidv4 } from "uuid";

const execAsync = promisify(exec);

interface TenantData {
  tenantId: string;
  companyName: string;
  domainName: string;
  email: string;
  firstName: string;
  lastName: string;
  country: string;
  mobile: string;
  userName: string;
}

export class TenantService {

  async createTenantDB(tenant: TenantData): Promise<void> {
    try {
      await this.createDB(tenant);
      await this.prepareDB(tenant);
      await this.sendWelcomeNotification(tenant);
      console.log(`[TenantService] Tenant '${tenant.domainName}' fully provisioned`);
    } catch (error) {
      console.error("[TenantService] Error creating tenant DB:", error);
      throw error;
    }
  }

  private getConnectionParams(): { host: string; port: string; user: string; password: string; sourceDb: string } {
    const dbUrl = process.env.DATABASE_URL || "";
    const url = new URL(dbUrl);
    return {
      host: url.hostname,
      port: url.port || "5432",
      user: url.username,
      password: decodeURIComponent(url.password),
      sourceDb: url.pathname.replace("/", ""),
    };
  }

  private async createDB(tenant: TenantData): Promise<void> {
    const newDBName = tenant.domainName;
    const conn = this.getConnectionParams();

    try {
      const checkResult = await pool.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`, [newDBName]
      );
      if (checkResult.rows.length > 0) {
        console.log(`[TenantService] Database '${newDBName}' already exists, skipping creation`);
        return;
      }

      await pool.query(`CREATE DATABASE "${newDBName}"`);
      console.log(`[TenantService] Empty database '${newDBName}' created`);

      const env = { ...process.env, PGPASSWORD: conn.password };
      const pgBin = process.env.PGBIN ? process.env.PGBIN + "/" : "";
      const dumpFile = join(tmpdir(), `${newDBName}_dump.pgdump`);

      const dumpCmd = `"${pgBin}pg_dump" -h ${conn.host} -p ${conn.port} -U ${conn.user} -d ${conn.sourceDb} -Fc --no-owner --no-acl -f "${dumpFile}"`;
      await execAsync(dumpCmd, { env });
      console.log(`[TenantService] Source database '${conn.sourceDb}' dumped successfully`);

      const restoreCmd = `"${pgBin}pg_restore" -h ${conn.host} -p ${conn.port} -U ${conn.user} -d ${newDBName} --no-owner --no-acl "${dumpFile}"`;
      try {
        const { stdout, stderr } = await execAsync(restoreCmd, { env });
        if (stderr) {
          console.log(`[TenantService] pg_restore warnings: ${stderr}`);
        }
      } catch (restoreError: any) {
        const stderr: string = restoreError.stderr || "";
        const hasRealError = stderr.split("\n").some((line: string) => {
          const lower = line.toLowerCase();
          if (!lower.startsWith("pg_restore: error:")) return false;
          // FK constraint failures are non-fatal — data is restored, only post-data constraint step failed
          if (lower.includes("foreign key constraint") || lower.includes("violates foreign key")) return false;
          return true;
        });
        if (hasRealError) {
          throw restoreError;
        }
        console.log(`[TenantService] pg_restore completed with non-fatal constraint warnings`);
      }

      const { unlink } = await import("fs/promises");
      await unlink(dumpFile).catch(() => {});

      console.log(`[TenantService] Database '${newDBName}' restored from '${conn.sourceDb}'`);
    } catch (error: any) {
      console.error(`[TenantService] Failed to create database '${newDBName}':`, error.message);
      throw error;
    }
  }

  private async prepareDB(tenant: TenantData): Promise<void> {
    const { Pool } = await import("pg");
    const databaseUrl = process.env.DATABASE_URL || "";
    const baseUrl = databaseUrl.replace(/\/[^/]+$/, "");
    const tenantPool = new Pool({
      connectionString: `${baseUrl}/${tenant.domainName}`,
    });

    try {
      await tenantPool.query(`
        UPDATE dbo.um_org_dtls
        SET org_legal_name = $1, organization_name = $1, org_email = $2, org_country = $3, org_phone_no = $4
        WHERE org_type = 'INTERNAL'
      `, [tenant.companyName, tenant.email, tenant.country, tenant.mobile]);

      const defaultPassword = "Welcome@123";
      const hashedPassword = await argon2.hash(defaultPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      await tenantPool.query(`
        UPDATE dbo.um_user_dtls
        SET attribute_1 = $1, name = $2, email_id = $3, user_name = $4, mobile_no = $5, password = $6,
            user_status = 1, failed_attempt = 0, lock_time = NULL
        WHERE id = (
          SELECT urm.user_id FROM dbo.um_user_roles_map_dtls urm
          JOIN dbo.um_role_dtls r ON urm.role_id = r.id
          WHERE r.role_name IN ('SUPERADMIN', 'ROLE_SUPERADMIN', 'ROLE_ADMIN', 'ROLE_ORG_ADMIN')
          ORDER BY urm.user_id ASC
          LIMIT 1
        )
      `, [tenant.companyName, tenant.firstName, tenant.email, tenant.email, tenant.mobile, hashedPassword]);

      await tenantPool.query(`
        UPDATE dbo.saas_account 
        SET account_name = $1, account_owner_name = $2, account_url = $3, contact_no = $4, country = $5, email_id = $6, tenant_id = $7
      `, [
        tenant.companyName,
        tenant.firstName,
        `https://${tenant.domainName}.prokraya.ai`,
        tenant.mobile,
        tenant.country,
        tenant.email,
        tenant.domainName
      ]);

      const now = new Date();
      const expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await tenantPool.query(`
        UPDATE dbo.saas_subscriptions 
        SET country = $1, start_date = $2, expiry_date = $3
      `, [tenant.country, now, expiryDate]);

      await tenantPool.query(`
        UPDATE dbo.wf_step_assignment 
        SET assignment_expression = $1, assignment_name = $2
      `, [tenant.email, tenant.firstName]);

      await tenantPool.query(`
        UPDATE dbo.am_property_mst 
        SET prop_value = $1 WHERE prop_code = 'APP_URL'
      `, [`https://${tenant.domainName}.prokraya.ai`]);

      await tenantPool.query(`
        UPDATE dbo.am_property_mst 
        SET prop_value = $1 WHERE prop_code = 'docsDir'
      `, [`/mnt/share/docs/${tenant.domainName}`]);

      await tenantPool.query(`
        UPDATE dbo.am_property_mst 
        SET prop_value = $1 WHERE prop_code = 'reportsDir'
      `, [`/mnt/share/reports/${tenant.domainName}`]);

      console.log(`[TenantService] Database '${tenant.domainName}' prepared with tenant data`);
    } catch (error: any) {
      console.error(`[TenantService] Failed to prepare database '${tenant.domainName}':`, error.message);
      throw error;
    } finally {
      await tenantPool.end();
    }
  }

  private async sendWelcomeNotification(tenant: TenantData): Promise<void> {
    const { Pool } = await import("pg");
    const databaseUrl = process.env.DATABASE_URL || "";
    const baseUrl = databaseUrl.replace(/\/[^/]+$/, "");
    const tenantPool = new Pool({ connectionString: `${baseUrl}/${tenant.domainName}` });
    const tenantDb = drizzle(tenantPool, { schema  });

    try {
      const domainUrl = `https://${tenant.domainName}.prokraya.ai`;
      // const encodedParams = Buffer.from(`user_id=${tenant.userName}`).toString("base64");
      const rId = uuidv4();
      const domainPart = tenant.domainName ? `~domain=${tenant.domainName}` : '';
      const encStr = Buffer.from(`user_id=${tenant.userName}~linkId=${rId}${domainPart}`).toString('base64');
      const linkUrl = `${domainUrl}/resetpassword?enc=${encodeURIComponent(encStr)}`;
    
   
     
      await tenantPool.query(`
        UPDATE dbo.um_user_dtls
        SET attribute_10 = $1,
            last_email_date = NOW(),
            total_emails_sent = COALESCE(total_emails_sent, 0) + 1,
            last_modified_date = NOW()
        WHERE user_name = $2
      `, [String(rId), tenant.userName]);

      await tenantStorage.run({ pool: tenantPool, db: tenantDb }, () =>
        emailService.sendTemplatedEmail(
          "WELCOME_PROKRAYA",
          tenant.email,
          {
            user: tenant.firstName,
            url: linkUrl,
            domainUrl: domainUrl,
          }
        )
      );

      console.log(`[TenantService] Welcome notification sent to ${tenant.email}`);
    } catch (error: any) {
      console.error(`[TenantService] Failed to send welcome notification:`, error.message);
    } finally {
      await tenantPool.end();
    }
  }
}

export const tenantService = new TenantService();
