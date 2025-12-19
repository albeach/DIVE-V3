/**
 * DIVE V3 - OPAL Data Service
 * 
 * Manages dynamic data publishing to OPAL for policy decisions.
 * This service synchronizes the following data sources:
 * 
 * 1. Trusted Issuers - Token issuer registry for JWT validation
 * 2. Federation Matrix - Bilateral trust relationships
 * 3. COI Members - Community of Interest membership
 * 4. Tenant Configs - Per-tenant policy configuration
 * 
 * Data can be loaded from:
 * - Static JSON files (policies/data/*.json)
 * - MongoDB collections (for dynamic updates)
 * - Federation Registry (config/federation-registry.json)
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import fs from 'fs';
import path from 'path';
import { opalClient, IOPALPublishResult, IOPALDataEntry } from './opal-client';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface ITrustedIssuer {
  tenant: string;
  name: string;
  country: string;
  trust_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'DEVELOPMENT';
  enabled?: boolean;
  protocol?: 'oidc' | 'saml';
  federation_class?: 'NATIONAL' | 'PARTNER' | 'LOCAL';
  jwks_uri?: string;
}

export interface IFederationPartner {
  enabled: boolean;
  trustLevel: string;
  maxClassification: string;
  allowedCOI: string[];
  attributeMapping?: string;
}

export interface ITenantConfig {
  code: string;
  name: string;
  locale: string;
  mfa_required_above: string;
  max_session_hours: number;
  default_coi: string[];
  aal_requirements?: Record<string, number>;
  classification_system?: string;
  clearance_mapping?: Record<string, string>;
  allowed_protocols?: string[];
  require_device_compliance?: boolean;
  allow_industry_access?: boolean;
  industry_max_classification?: string;
}

export interface IOPALDataState {
  trusted_issuers: Record<string, ITrustedIssuer>;
  federation_matrix: Record<string, string[]>;
  coi_members: Record<string, string[]>;
  tenant_configs: Record<string, ITenantConfig>;
}

export interface IDataSyncResult {
  success: boolean;
  message: string;
  syncedAt: string;
  sources: {
    trusted_issuers: 'file' | 'mongodb' | 'error';
    federation_matrix: 'file' | 'mongodb' | 'error';
    coi_members: 'file' | 'mongodb' | 'error';
    tenant_configs: 'file' | 'mongodb' | 'error';
  };
  opalResult?: IOPALPublishResult;
}

// ============================================
// CONFIGURATION
// ============================================

// Data file paths (relative to backend directory)
// Backend-specific detailed JSON files live in backend/data/opal/
// OPA-compatible simplified data lives in policies/data/data.json
const DATA_DIR = process.env.OPAL_DATA_DIR || 
  path.join(process.cwd(), 'data', 'opal');

// Data file names used by the service
const TRUSTED_ISSUERS_FILE = 'trusted_issuers.json';
const FEDERATION_MATRIX_FILE = 'federation_matrix.json';
const COI_MEMBERS_FILE = 'coi_members.json';
const TENANT_CONFIGS_FILE = 'tenant_configs.json';

// Alternative paths for different runtime contexts
const ALT_DATA_DIRS = [
  path.join(process.cwd(), 'data', 'opal'),
  path.join(process.cwd(), '..', 'backend', 'data', 'opal'),
  path.join(__dirname, '..', '..', 'data', 'opal'),
  '/app/data/opal'
];

// ============================================
// OPAL DATA SERVICE CLASS
// ============================================

class OPALDataService {
  private dataDir: string;
  private lastSyncTime: Date | null = null;
  private dataState: IOPALDataState | null = null;

  constructor() {
    this.dataDir = this.findDataDirectory();
    logger.info('OPAL Data Service initialized', {
      dataDir: this.dataDir,
      opalEnabled: opalClient.isOPALEnabled()
    });
  }

  /**
   * Find the policies/data directory
   */
  private findDataDirectory(): string {
    // Check configured path first
    if (fs.existsSync(DATA_DIR)) {
      return DATA_DIR;
    }

    // Try alternative paths
    for (const altDir of ALT_DATA_DIRS) {
      if (fs.existsSync(altDir)) {
        return altDir;
      }
    }

    // Create default directory if none exists
    const defaultDir = path.join(process.cwd(), 'policies', 'data');
    logger.warn('Data directory not found, creating default', { path: defaultDir });
    
    try {
      fs.mkdirSync(defaultDir, { recursive: true });
      return defaultDir;
    } catch (error) {
      logger.error('Failed to create data directory', { error });
      return DATA_DIR; // Return configured path even if it doesn't exist
    }
  }

  /**
   * Get path to a data file
   */
  private getDataFilePath(filename: string): string {
    return path.join(this.dataDir, filename);
  }

  /**
   * Load JSON data from file
   */
  private loadJsonFile<T>(filepath: string): T | null {
    try {
      if (!fs.existsSync(filepath)) {
        logger.warn('Data file not found', { filepath });
        return null;
      }

      const content = fs.readFileSync(filepath, 'utf-8');
      const data = JSON.parse(content);
      
      logger.debug('Loaded data file', {
        filepath,
        size: content.length
      });

      return data as T;
    } catch (error) {
      logger.error('Failed to load data file', {
        filepath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Save JSON data to file
   */
  private saveJsonFile(filepath: string, data: unknown): boolean {
    try {
      const content = JSON.stringify(data, null, 2);
      fs.writeFileSync(filepath, content + '\n', 'utf-8');
      
      logger.debug('Saved data file', {
        filepath,
        size: content.length
      });

      return true;
    } catch (error) {
      logger.error('Failed to save data file', {
        filepath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Load all data from JSON files
   */
  async loadAllData(): Promise<IOPALDataState> {
    logger.info('Loading all OPAL data from files');

    const trustedIssuersData = this.loadJsonFile<{ trusted_issuers: Record<string, ITrustedIssuer> }>(
      this.getDataFilePath(TRUSTED_ISSUERS_FILE)
    );

    const federationData = this.loadJsonFile<{ federation_matrix: Record<string, string[]> }>(
      this.getDataFilePath(FEDERATION_MATRIX_FILE)
    );

    const coiData = this.loadJsonFile<{ coi_members: Record<string, string[]> }>(
      this.getDataFilePath(COI_MEMBERS_FILE)
    );

    const tenantData = this.loadJsonFile<{ tenant_configs: Record<string, ITenantConfig> }>(
      this.getDataFilePath(TENANT_CONFIGS_FILE)
    );

    this.dataState = {
      trusted_issuers: trustedIssuersData?.trusted_issuers || {},
      federation_matrix: federationData?.federation_matrix || {},
      coi_members: coiData?.coi_members || {},
      tenant_configs: tenantData?.tenant_configs || {}
    };

    logger.info('OPAL data loaded', {
      trustedIssuersCount: Object.keys(this.dataState.trusted_issuers).length,
      federationTenantsCount: Object.keys(this.dataState.federation_matrix).length,
      coiCount: Object.keys(this.dataState.coi_members).length,
      tenantsCount: Object.keys(this.dataState.tenant_configs).length
    });

    return this.dataState;
  }

  /**
   * Sync all data to OPAL Server
   * This publishes all data files to OPAL, which then pushes to connected OPA instances
   */
  async syncAllToOPAL(): Promise<IDataSyncResult> {
    const syncedAt = new Date().toISOString();
    const sources: IDataSyncResult['sources'] = {
      trusted_issuers: 'error',
      federation_matrix: 'error',
      coi_members: 'error',
      tenant_configs: 'error'
    };

    try {
      // Load all data first
      const data = await this.loadAllData();

      // Build entries for OPAL update
      const entries: IOPALDataEntry[] = [];

      // Add trusted issuers
      if (Object.keys(data.trusted_issuers).length > 0) {
        entries.push({
          dst_path: 'trusted_issuers',
          data: data.trusted_issuers
        });
        sources.trusted_issuers = 'file';
      }

      // Add federation matrix
      if (Object.keys(data.federation_matrix).length > 0) {
        entries.push({
          dst_path: 'federation_matrix',
          data: data.federation_matrix
        });
        sources.federation_matrix = 'file';
      }

      // Add COI members
      if (Object.keys(data.coi_members).length > 0) {
        entries.push({
          dst_path: 'coi_members',
          data: data.coi_members
        });
        sources.coi_members = 'file';
      }

      // Add tenant configs
      if (Object.keys(data.tenant_configs).length > 0) {
        entries.push({
          dst_path: 'tenant_configs',
          data: data.tenant_configs
        });
        sources.tenant_configs = 'file';
      }

      // Publish to OPAL
      const opalResult = await opalClient.publishDataUpdate({
        entries,
        reason: 'Full data sync from DIVE V3'
      });

      this.lastSyncTime = new Date();

      return {
        success: opalResult.success,
        message: opalResult.success 
          ? `Synced ${entries.length} data sources to OPAL`
          : `OPAL sync failed: ${opalResult.error}`,
        syncedAt,
        sources,
        opalResult
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to sync data to OPAL', { error: errorMessage });

      return {
        success: false,
        message: `Data sync failed: ${errorMessage}`,
        syncedAt,
        sources
      };
    }
  }

  /**
   * Update trusted issuer and sync to OPAL
   */
  async updateTrustedIssuer(
    issuerUrl: string,
    issuer: ITrustedIssuer
  ): Promise<IOPALPublishResult> {
    logger.info('Updating trusted issuer', { issuerUrl, tenant: issuer.tenant });

    // Load current data
    const data = this.loadJsonFile<{ trusted_issuers: Record<string, ITrustedIssuer> }>(
      this.getDataFilePath(TRUSTED_ISSUERS_FILE)
    ) || { trusted_issuers: {} };

    // Update issuer
    data.trusted_issuers[issuerUrl] = issuer;

    // Save to file
    this.saveJsonFile(this.getDataFilePath(TRUSTED_ISSUERS_FILE), {
      ...data,
      _metadata: {
        ...(data as any)._metadata,
        lastUpdated: new Date().toISOString()
      }
    });

    // Publish to OPAL
    return opalClient.publishInlineData(
      'trusted_issuers',
      data.trusted_issuers,
      `Updated trusted issuer: ${issuerUrl}`
    );
  }

  /**
   * Remove trusted issuer and sync to OPAL
   */
  async removeTrustedIssuer(issuerUrl: string): Promise<IOPALPublishResult> {
    logger.info('Removing trusted issuer', { issuerUrl });

    // Load current data
    const data = this.loadJsonFile<{ trusted_issuers: Record<string, ITrustedIssuer> }>(
      this.getDataFilePath(TRUSTED_ISSUERS_FILE)
    ) || { trusted_issuers: {} };

    // Remove issuer
    delete data.trusted_issuers[issuerUrl];

    // Save to file
    this.saveJsonFile(this.getDataFilePath(TRUSTED_ISSUERS_FILE), {
      ...data,
      _metadata: {
        ...(data as any)._metadata,
        lastUpdated: new Date().toISOString()
      }
    });

    // Publish to OPAL
    return opalClient.publishInlineData(
      'trusted_issuers',
      data.trusted_issuers,
      `Removed trusted issuer: ${issuerUrl}`
    );
  }

  /**
   * Update federation matrix and sync to OPAL
   */
  async updateFederationMatrix(
    tenant: string,
    partners: string[]
  ): Promise<IOPALPublishResult> {
    logger.info('Updating federation matrix', { tenant, partners });

    // Load current data
    const data = this.loadJsonFile<{ federation_matrix: Record<string, string[]> }>(
      this.getDataFilePath(FEDERATION_MATRIX_FILE)
    ) || { federation_matrix: {} };

    // Update tenant's partners
    data.federation_matrix[tenant] = partners;

    // Save to file
    this.saveJsonFile(this.getDataFilePath(FEDERATION_MATRIX_FILE), {
      ...data,
      _metadata: {
        ...(data as any)._metadata,
        lastUpdated: new Date().toISOString()
      }
    });

    // Publish to OPAL
    return opalClient.publishInlineData(
      'federation_matrix',
      data.federation_matrix,
      `Updated federation partners for: ${tenant}`
    );
  }

  /**
   * Get current federation matrix (read-only)
   */
  async getFederationMatrix(): Promise<Record<string, string[]>> {
    const data = this.loadJsonFile<{ federation_matrix: Record<string, string[]> }>(
      this.getDataFilePath(FEDERATION_MATRIX_FILE)
    );
    return data?.federation_matrix || {};
  }

  /**
   * Add bidirectional federation link
   */
  async addFederationLink(
    tenantA: string,
    tenantB: string
  ): Promise<IOPALPublishResult> {
    logger.info('Adding federation link', { tenantA, tenantB });

    // Load current data
    const data = this.loadJsonFile<{ federation_matrix: Record<string, string[]> }>(
      this.getDataFilePath(FEDERATION_MATRIX_FILE)
    ) || { federation_matrix: {} };

    // Ensure arrays exist
    if (!data.federation_matrix[tenantA]) {
      data.federation_matrix[tenantA] = [];
    }
    if (!data.federation_matrix[tenantB]) {
      data.federation_matrix[tenantB] = [];
    }

    // Add bidirectional links
    if (!data.federation_matrix[tenantA].includes(tenantB)) {
      data.federation_matrix[tenantA].push(tenantB);
    }
    if (!data.federation_matrix[tenantB].includes(tenantA)) {
      data.federation_matrix[tenantB].push(tenantA);
    }

    // Save to file
    this.saveJsonFile(this.getDataFilePath(FEDERATION_MATRIX_FILE), {
      ...data,
      _metadata: {
        ...(data as any)._metadata,
        lastUpdated: new Date().toISOString()
      }
    });

    // Publish to OPAL
    return opalClient.publishInlineData(
      'federation_matrix',
      data.federation_matrix,
      `Added federation link: ${tenantA} ↔ ${tenantB}`
    );
  }

  /**
   * Remove bidirectional federation link
   */
  async removeFederationLink(
    tenantA: string,
    tenantB: string
  ): Promise<IOPALPublishResult> {
    logger.info('Removing federation link', { tenantA, tenantB });

    // Load current data
    const data = this.loadJsonFile<{ federation_matrix: Record<string, string[]> }>(
      this.getDataFilePath(FEDERATION_MATRIX_FILE)
    ) || { federation_matrix: {} };

    // Remove bidirectional links
    if (data.federation_matrix[tenantA]) {
      data.federation_matrix[tenantA] = data.federation_matrix[tenantA].filter(
        t => t !== tenantB
      );
    }
    if (data.federation_matrix[tenantB]) {
      data.federation_matrix[tenantB] = data.federation_matrix[tenantB].filter(
        t => t !== tenantA
      );
    }

    // Save to file
    this.saveJsonFile(this.getDataFilePath(FEDERATION_MATRIX_FILE), {
      ...data,
      _metadata: {
        ...(data as any)._metadata,
        lastUpdated: new Date().toISOString()
      }
    });

    // Publish to OPAL
    return opalClient.publishInlineData(
      'federation_matrix',
      data.federation_matrix,
      `Removed federation link: ${tenantA} ↔ ${tenantB}`
    );
  }

  /**
   * Update COI membership and sync to OPAL
   */
  async updateCOIMembership(
    coiName: string,
    members: string[]
  ): Promise<IOPALPublishResult> {
    logger.info('Updating COI membership', { coiName, memberCount: members.length });

    // Load current data
    const data = this.loadJsonFile<{ coi_members: Record<string, string[]> }>(
      this.getDataFilePath(COI_MEMBERS_FILE)
    ) || { coi_members: {} };

    // Update COI members
    data.coi_members[coiName] = members;

    // Save to file
    this.saveJsonFile(this.getDataFilePath(COI_MEMBERS_FILE), {
      ...data,
      _metadata: {
        ...(data as any)._metadata,
        lastUpdated: new Date().toISOString()
      }
    });

    // Publish to OPAL
    return opalClient.publishInlineData(
      'coi_members',
      data.coi_members,
      `Updated COI membership: ${coiName}`
    );
  }

  /**
   * Update tenant configuration and sync to OPAL
   */
  async updateTenantConfig(
    tenant: string,
    config: Partial<ITenantConfig>
  ): Promise<IOPALPublishResult> {
    logger.info('Updating tenant configuration', { tenant });

    // Load current data
    const data = this.loadJsonFile<{ tenant_configs: Record<string, ITenantConfig> }>(
      this.getDataFilePath(TENANT_CONFIGS_FILE)
    ) || { tenant_configs: {} };

    // Merge config
    data.tenant_configs[tenant] = {
      ...data.tenant_configs[tenant],
      ...config,
      code: tenant
    } as ITenantConfig;

    // Save to file
    this.saveJsonFile(this.getDataFilePath(TENANT_CONFIGS_FILE), {
      ...data,
      _metadata: {
        ...(data as any)._metadata,
        lastUpdated: new Date().toISOString()
      }
    });

    // Publish to OPAL
    return opalClient.publishInlineData(
      'tenant_configs',
      data.tenant_configs,
      `Updated tenant configuration: ${tenant}`
    );
  }

  /**
   * Get current data state
   */
  async getCurrentData(): Promise<IOPALDataState> {
    if (!this.dataState) {
      await this.loadAllData();
    }
    return this.dataState!;
  }

  /**
   * Get last sync time
   */
  getLastSyncTime(): Date | null {
    return this.lastSyncTime;
  }

  /**
   * Check if data needs sync (e.g., files changed since last sync)
   */
  async needsSync(): Promise<boolean> {
    if (!this.lastSyncTime) {
      return true;
    }

    // Check if any data file has been modified since last sync
    const files = [
      TRUSTED_ISSUERS_FILE,
      FEDERATION_MATRIX_FILE,
      COI_MEMBERS_FILE,
      TENANT_CONFIGS_FILE
    ];

    for (const file of files) {
      const filepath = this.getDataFilePath(file);
      if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        if (stats.mtime > this.lastSyncTime) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get data directory path
   */
  getDataDirectory(): string {
    return this.dataDir;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const opalDataService = new OPALDataService();

export default OPALDataService;
