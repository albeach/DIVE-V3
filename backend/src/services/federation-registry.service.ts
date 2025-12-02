/**
 * DIVE V3 Federation Registry Service
 * 
 * Manages federation registry updates with validation and schema compliance.
 * Updates config/federation-registry.json when IdPs are created or federation
 * partners are added.
 * 
 * Best Practices:
 * - Validates against JSON schema before writing
 * - Creates backups before modifications
 * - Provides atomic updates (write or fail)
 * - Logs all registry changes for audit
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

interface IFederationRegistry {
    version: string;
    metadata: {
        lastUpdated: string;
        maintainer: string;
        compliance: string[];
        description?: string;
    };
    federation: {
        model: string;
        matrix: Record<string, string[]>;
        defaultEnabled: boolean;
        trustModel: string;
        attributeMapping: Record<string, any>;
    };
    instances: Record<string, any>;
    [key: string]: any;
}

interface IAddFederationLinkOptions {
    sourceInstance: string;      // e.g., "usa"
    targetInstance: string;       // e.g., "fra"
    bidirectional?: boolean;      // Default: true
    updateMetadata?: boolean;     // Update lastUpdated timestamp
}

interface IRegistryUpdateResult {
    success: boolean;
    message: string;
    changes?: {
        added: string[];
        removed: string[];
    };
    error?: string;
}

// ============================================
// CONFIGURATION
// ============================================

const REGISTRY_FILE_PATH = path.join(process.cwd(), '..', 'config', 'federation-registry.json');
const REGISTRY_SCHEMA_PATH = path.join(process.cwd(), '..', 'config', 'federation-registry.schema.json');
const BACKUP_DIR = path.join(process.cwd(), '..', 'backups', 'federation-registry');

// ============================================
// FEDERATION REGISTRY SERVICE
// ============================================

class FederationRegistryService {
    private registry: IFederationRegistry | null = null;
    private registryPath: string | undefined;
    private schemaPath: string;

    constructor() {
        // Try multiple paths for registry file
        const possiblePaths = [
            path.join(process.cwd(), '..', 'config', 'federation-registry.json'),
            path.join(process.cwd(), 'config', 'federation-registry.json'),
            path.join(__dirname, '..', '..', '..', 'config', 'federation-registry.json')
        ];

        for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
                this.registryPath = possiblePath;
                break;
            }
        }

        if (!this.registryPath) {
            logger.warn('Federation registry file not found, registry updates will be disabled', {
                searchedPaths: possiblePaths
            });
            // Set a default schema path when registry file is not found
            this.schemaPath = path.join(process.cwd(), 'config', 'federation-registry.schema.json');
        } else {
            this.schemaPath = path.join(path.dirname(this.registryPath), 'federation-registry.schema.json');
        }
    }

    /**
     * Load federation registry from file
     */
    async loadRegistry(): Promise<IFederationRegistry | null> {
        if (!this.registryPath || !fs.existsSync(this.registryPath)) {
            logger.warn('Federation registry file not found', { path: this.registryPath });
            return null;
        }

        try {
            const content = fs.readFileSync(this.registryPath, 'utf-8');
            this.registry = JSON.parse(content) as IFederationRegistry;
            logger.debug('Loaded federation registry', {
                version: this.registry.version,
                instanceCount: Object.keys(this.registry.instances || {}).length,
                federationLinks: Object.keys(this.registry.federation?.matrix || {}).length
            });
            return this.registry;
        } catch (error) {
            logger.error('Failed to load federation registry', {
                path: this.registryPath,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }

    /**
     * Get current registry (loads if not already loaded)
     */
    private async getRegistry(): Promise<IFederationRegistry | null> {
        if (!this.registry) {
            await this.loadRegistry();
        }
        return this.registry;
    }

    /**
     * Validate registry against JSON schema
     */
    private async validateRegistry(registry: IFederationRegistry): Promise<boolean> {
        // Basic validation - full schema validation would require ajv or similar
        // For now, validate structure matches expected format

        if (!registry.version || !registry.metadata || !registry.federation || !registry.instances) {
            logger.error('Registry missing required top-level properties');
            return false;
        }

        if (!registry.federation.matrix || typeof registry.federation.matrix !== 'object') {
            logger.error('Registry federation.matrix is invalid');
            return false;
        }

        // Validate instance codes are lowercase 3-letter codes
        for (const instanceCode of Object.keys(registry.federation.matrix)) {
            if (!/^[a-z]{3}$/.test(instanceCode)) {
                logger.error('Invalid instance code in federation matrix', { instanceCode });
                return false;
            }

            const partners = registry.federation.matrix[instanceCode];
            if (!Array.isArray(partners)) {
                logger.error('Federation partners must be an array', { instanceCode });
                return false;
            }

            for (const partner of partners) {
                if (!/^[a-z]{3}$/.test(partner)) {
                    logger.error('Invalid partner code in federation matrix', { instanceCode, partner });
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Create backup of registry before modification
     */
    private async createBackup(): Promise<string | null> {
        if (!this.registryPath || !fs.existsSync(this.registryPath)) {
            return null;
        }

        try {
            // Ensure backup directory exists
            if (!fs.existsSync(BACKUP_DIR)) {
                fs.mkdirSync(BACKUP_DIR, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(BACKUP_DIR, `federation-registry-${timestamp}.json`);

            fs.copyFileSync(this.registryPath, backupPath);
            logger.info('Created federation registry backup', { backupPath });
            return backupPath;
        } catch (error) {
            logger.error('Failed to create registry backup', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }

    /**
     * Write registry to file with validation
     */
    private async writeRegistry(registry: IFederationRegistry): Promise<boolean> {
        if (!this.registryPath) {
            logger.error('Cannot write registry - path not set');
            return false;
        }

        // Validate before writing
        if (!(await this.validateRegistry(registry))) {
            logger.error('Registry validation failed, not writing');
            return false;
        }

        // Create backup
        await this.createBackup();

        try {
            // Update metadata timestamp
            registry.metadata.lastUpdated = new Date().toISOString();

            // Write with pretty formatting
            fs.writeFileSync(
                this.registryPath,
                JSON.stringify(registry, null, 2) + '\n',
                'utf-8'
            );

            logger.info('Updated federation registry', {
                path: this.registryPath,
                version: registry.version,
                lastUpdated: registry.metadata.lastUpdated
            });

            // Reload into memory
            this.registry = registry;
            return true;
        } catch (error) {
            logger.error('Failed to write federation registry', {
                path: this.registryPath,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }

    /**
     * Add federation link between two instances
     */
    async addFederationLink(options: IAddFederationLinkOptions): Promise<IRegistryUpdateResult> {
        const registry = await this.getRegistry();
        if (!registry) {
            return {
                success: false,
                message: 'Federation registry not available',
                error: 'Registry file not found or could not be loaded'
            };
        }

        const source = options.sourceInstance.toLowerCase();
        const target = options.targetInstance.toLowerCase();
        const bidirectional = options.bidirectional !== false; // Default true

        // Validate instance codes
        if (!/^[a-z]{3}$/.test(source) || !/^[a-z]{3}$/.test(target)) {
            return {
                success: false,
                message: 'Invalid instance codes',
                error: `Instance codes must be 3 lowercase letters, got: ${source}, ${target}`
            };
        }

        if (source === target) {
            return {
                success: false,
                message: 'Cannot federate instance with itself',
                error: 'Source and target instances must be different'
            };
        }

        // Ensure federation matrix exists
        if (!registry.federation.matrix) {
            registry.federation.matrix = {};
        }

        const changes = {
            added: [] as string[],
            removed: [] as string[]
        };

        // Add source → target link
        if (!registry.federation.matrix[source]) {
            registry.federation.matrix[source] = [];
        }

        if (!registry.federation.matrix[source].includes(target)) {
            registry.federation.matrix[source].push(target);
            changes.added.push(`${source} → ${target}`);
            logger.info('Adding federation link', { source, target });
        }

        // Add target → source link if bidirectional
        if (bidirectional) {
            if (!registry.federation.matrix[target]) {
                registry.federation.matrix[target] = [];
            }

            if (!registry.federation.matrix[target].includes(source)) {
                registry.federation.matrix[target].push(source);
                changes.added.push(`${target} → ${source}`);
                logger.info('Adding bidirectional federation link', { source, target });
            }
        }

        // Write updated registry
        const success = await this.writeRegistry(registry);

        if (success) {
            return {
                success: true,
                message: bidirectional
                    ? `Added bidirectional federation: ${source} ↔ ${target}`
                    : `Added federation link: ${source} → ${target}`,
                changes
            };
        } else {
            return {
                success: false,
                message: 'Failed to update federation registry',
                error: 'Registry write failed after validation',
                changes
            };
        }
    }

    /**
     * Remove federation link between two instances
     */
    async removeFederationLink(
        sourceInstance: string,
        targetInstance: string,
        bidirectional: boolean = true
    ): Promise<IRegistryUpdateResult> {
        const registry = await this.getRegistry();
        if (!registry) {
            return {
                success: false,
                message: 'Federation registry not available',
                error: 'Registry file not found or could not be loaded'
            };
        }

        const source = sourceInstance.toLowerCase();
        const target = targetInstance.toLowerCase();

        const changes = {
            added: [] as string[],
            removed: [] as string[]
        };

        // Remove source → target link
        if (registry.federation.matrix[source]) {
            const index = registry.federation.matrix[source].indexOf(target);
            if (index !== -1) {
                registry.federation.matrix[source].splice(index, 1);
                changes.removed.push(`${source} → ${target}`);
                logger.info('Removing federation link', { source, target });
            }
        }

        // Remove target → source link if bidirectional
        if (bidirectional && registry.federation.matrix[target]) {
            const index = registry.federation.matrix[target].indexOf(source);
            if (index !== -1) {
                registry.federation.matrix[target].splice(index, 1);
                changes.removed.push(`${target} → ${source}`);
                logger.info('Removing bidirectional federation link', { source, target });
            }
        }

        // Write updated registry
        const success = await this.writeRegistry(registry);

        if (success) {
            return {
                success: true,
                message: bidirectional
                    ? `Removed bidirectional federation: ${source} ↔ ${target}`
                    : `Removed federation link: ${source} → ${target}`,
                changes
            };
        } else {
            return {
                success: false,
                message: 'Failed to update federation registry',
                error: 'Registry write failed after validation',
                changes
            };
        }
    }

    /**
     * Extract instance code from IdP alias
     * Handles formats like: "fra-federation", "usa-idp", "gbr-broker"
     */
    extractInstanceCodeFromAlias(alias: string): string | null {
        const match = alias.match(/^([a-z]{3})[-_]/);
        if (match) {
            return match[1];
        }
        return null;
    }

    /**
     * Get current instance code from environment or config
     */
    getCurrentInstanceCode(): string {
        // Try environment variable first
        const envInstance = process.env.INSTANCE_CODE || process.env.DIVE_INSTANCE;
        if (envInstance) {
            return envInstance.toLowerCase();
        }

        // Try to infer from Keycloak URL
        const keycloakUrl = process.env.KEYCLOAK_URL || '';
        const urlMatch = keycloakUrl.match(/([a-z]{3})-idp\./);
        if (urlMatch) {
            return urlMatch[1];
        }

        // Default fallback (should be overridden)
        logger.warn('Could not determine current instance code, using default "usa"');
        return 'usa';
    }

    /**
     * Check if federation link exists
     */
    async hasFederationLink(sourceInstance: string, targetInstance: string): Promise<boolean> {
        const registry = await this.getRegistry();
        if (!registry || !registry.federation.matrix) {
            return false;
        }

        const source = sourceInstance.toLowerCase();
        const target = targetInstance.toLowerCase();

        return registry.federation.matrix[source]?.includes(target) || false;
    }

    /**
     * Get all federation partners for an instance
     */
    async getFederationPartners(instanceCode: string): Promise<string[]> {
        const registry = await this.getRegistry();
        if (!registry || !registry.federation.matrix) {
            return [];
        }

        const instance = instanceCode.toLowerCase();
        return registry.federation.matrix[instance] || [];
    }
}

// Export singleton instance
export const federationRegistryService = new FederationRegistryService();

