import { pool } from "../db";
import { getContextPool } from "../tenant-context";

const getPool = () => getContextPool() ?? pool;

class PropertiesService {
  private cache: Map<string, string> = new Map();
  private initialized: boolean = false;
  private lastLoadTime: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  async initialize(): Promise<void> {
    await this.loadAll();
    this.initialized = true;
    console.log(`[PropertiesService] Loaded ${this.cache.size} properties from am_property_mst`);
  }

  private async loadAll(): Promise<void> {
    try {
      const result = await getPool().query(
        `SELECT prop_code, prop_value FROM dbo.am_property_mst`
      );
      this.cache.clear();
      for (const row of result.rows) {
        if (row.prop_code && row.prop_value != null) {
          this.cache.set(row.prop_code, (row.prop_value || '').trim());
        }
      }
      this.lastLoadTime = Date.now();
    } catch (error) {
      console.error("[PropertiesService] Failed to load properties:", error);
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.initialized || Date.now() - this.lastLoadTime > this.CACHE_TTL_MS) {
      await this.loadAll();
      this.initialized = true;
    }
  }

  async get(propCode: string, defaultValue: string = ''): Promise<string> {
    await this.ensureLoaded();
    return this.cache.get(propCode) ?? defaultValue;
  }

  async getAppUrl(): Promise<string> {
    const url = await this.get('APP_URL', process.env.APP_URL || 'http://localhost:5000');
    return url.replace(/\/+$/, '');
  }

  async getAppUrlForDomain(domain?: string): Promise<string> {
    // Always start with master DB value as the base
    let appUrl = await this.getAppUrl();

    if (domain) {
      try {
        const { resolveTenantDb } = await import('../tenant-db');
        const tenantCtx = await resolveTenantDb(domain);
        if (tenantCtx) {
          const result = await tenantCtx.pool.query(
            `SELECT prop_value FROM dbo.am_property_mst WHERE prop_code = 'APP_URL' LIMIT 1`
          );
          const tenantUrl = (result.rows[0]?.prop_value || '').trim().replace(/\/+$/, '');
          if (tenantUrl) appUrl = tenantUrl; // tenant value overrides master
        }
      } catch (e) {
        console.error('[PropertiesService] Failed to get tenant APP_URL for domain:', domain, e);
      }
    }

    return appUrl;
  }

  async getMailFrom(): Promise<string> {
    return this.get('MAIL_FROM', process.env.SMTP_FROM || process.env.SMTP_USER || '');
  }

  async getBaseCurrency(): Promise<string> {
    return this.get('BASE_CURRENCY', 'USD');
  }

  async getBaseCountry(): Promise<string> {
    return this.get('BASE_COUNTRY', 'US');
  }

  async getOgdApiKey(): Promise<string> {
    const fromDb = await this.get('OGD_INDIA_API_KEY');
    return fromDb || process.env.OGD_INDIA_API_KEY || '';
  }

  async getGoogleApiKey(): Promise<string> {
    const fromDb =
      (await this.get('google_api')) ||
      (await this.get('GOOGLE_API_KEY')) ||
      (await this.get('GOOGLE_MAPS_API_KEY')) ||
      (await this.get('GOOGLE_PLACES_API_KEY')) ||
      (await this.get('GOOGLE_MERCHANT_API_KEY'));
    return (
      fromDb ||
      process.env.google_api ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_MERCHANT_API_KEY ||
      ''
    );
  }

  async getGoogleMapsApiKey(): Promise<string> {
    const fromDb =
      (await this.get('GOOGLE_MAPS_API_KEY')) ||
      (await this.get('google_api')) ||
      (await this.get('GOOGLE_API_KEY'));
    return (
      fromDb ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.google_api ||
      process.env.GOOGLE_API_KEY ||
      ''
    );
  }

  async getGooglePlacesApiKey(): Promise<string> {
    const fromDb =
      (await this.get('GOOGLE_PLACES_API_KEY')) ||
      (await this.get('google_api')) ||
      (await this.get('GOOGLE_API_KEY'));
    return (
      fromDb ||
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.google_api ||
      process.env.GOOGLE_API_KEY ||
      ''
    );
  }

  async getAll(): Promise<Record<string, string>> {
    await this.ensureLoaded();
    return Object.fromEntries(this.cache);
  }

  async set(propCode: string, propValue: string): Promise<void> {
    await getPool().query(
      `INSERT INTO dbo.am_property_mst (prop_code, prop_value) VALUES ($1, $2)
       ON CONFLICT (prop_code) DO UPDATE SET prop_value = $2`,
      [propCode, propValue]
    );
    this.cache.set(propCode, propValue);
  }

  invalidateCache(): void {
    this.initialized = false;
    this.cache.clear();
  }
}

export const propertiesService = new PropertiesService();
