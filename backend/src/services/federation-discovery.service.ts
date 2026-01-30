/**
 * Federation Discovery Service
 *
 * SSOT: MongoDB federation_spokes collection (for Hub)
 * Replaces static federation-registry.json with dynamic MongoDB queries
 *
 * Architecture:
 * - Hub: Queries local MongoDB federation_spokes
 * - Spokes: Query Hub's API to discover federation partners
 */

import https from 'https';
import { logger } from '../utils/logger';
import { hubSpokeRegistry } from './hub-spoke-registry.service';

// Create HTTPS agent for self-signed certificates (local development)
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

export interface IFederationInstance {
    code: string;
    name: string;
    type: 'hub' | 'spoke';
    enabled: boolean;
    endpoints: {
        api: string;          // External API URL
        apiInternal?: string; // Internal Docker network URL
        frontend: string;
        keycloak: string;
    };
    services?: {
        backend?: {
            containerName: string;
            internalPort: number;
            externalPort: number;
        };
        frontend?: {
            containerName: string;
            internalPort: number;
            externalPort: number;
        };
    };
}

class FederationDiscoveryService {
    private instanceCode: string;
    private isHub: boolean;
    private cachedInstances: IFederationInstance[] | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL_MS = 60000; // 1 minute

    constructor() {
        this.instanceCode = process.env.INSTANCE_CODE || 'USA';
        this.isHub = this.instanceCode === 'USA' || process.env.IS_HUB === 'true';
    }

    /**
     * Get all federation instances (Hub or Spoke)
     *
     * Hub: Queries MongoDB federation_spokes
     * Spoke: Queries Hub's API with retry logic
     */
    async getInstances(retryCount: number = 0): Promise<IFederationInstance[]> {
        // Check cache
        const now = Date.now();
        if (this.cachedInstances && (now - this.cacheTimestamp) < this.CACHE_TTL_MS) {
            return this.cachedInstances;
        }

        let instances: IFederationInstance[];

        if (this.isHub) {
            instances = await this.getInstancesFromMongoDB();
        } else {
            // Spoke: Query Hub API with retry logic
            try {
                instances = await this.getInstancesFromHubAPI();
            } catch (error) {
                // Retry up to 3 times with exponential backoff
                if (retryCount < 3) {
                    const delayMs = 1000 * Math.pow(2, retryCount); // 1s, 2s, 4s
                    logger.warn('Hub API query failed, retrying', {
                        attempt: retryCount + 1,
                        delayMs,
                        error: error instanceof Error ? error.message : 'Unknown'
                    });

                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    return this.getInstances(retryCount + 1);
                }

                // All retries failed - return just self
                logger.error('All Hub API queries failed, federation limited to local instance');
                instances = [this.createCurrentSpokeInstance()];
            }
        }

        // Update cache
        this.cachedInstances = instances;
        this.cacheTimestamp = now;

        logger.info('Federation instances loaded', {
            source: this.isHub ? 'MongoDB' : 'Hub API',
            count: instances.length,
            codes: instances.map(i => i.code)
        });

        return instances;
    }

    /**
     * Hub: Query MongoDB federation_spokes collection
     */
    private async getInstancesFromMongoDB(): Promise<IFederationInstance[]> {
        const instances: IFederationInstance[] = [];

        // Add self (Hub)
        instances.push(this.createHubInstance());

        // Query approved spokes from MongoDB
        try {
            const approvedSpokes = await hubSpokeRegistry.listActiveSpokes();

            for (const spoke of approvedSpokes) {
                // Validate required fields
                if (!spoke.apiUrl || !spoke.instanceCode) {
                    logger.warn('Skipping spoke with missing required fields', {
                        instanceCode: spoke.instanceCode,
                        hasApiUrl: !!spoke.apiUrl
                    });
                    continue;
                }

                // Construct frontend URL from API URL (typically API port - 1000)
                const frontendUrl = spoke.apiUrl.replace(/:\d+$/, (match) => {
                    const apiPort = parseInt(match.substring(1));
                    return `:${apiPort - 1000}`;
                });

                instances.push({
                    code: spoke.instanceCode,
                    name: spoke.name || spoke.instanceCode,
                    type: 'spoke',
                    enabled: spoke.status === 'approved',
                    endpoints: {
                        api: spoke.apiUrl,
                        apiInternal: (spoke as any).internalApiUrl || spoke.apiUrl,
                        frontend: frontendUrl,
                        keycloak: spoke.idpPublicUrl || ''
                    },
                    services: {
                        backend: {
                            containerName: `dive-spoke-${spoke.instanceCode.toLowerCase()}-backend`,
                            internalPort: 4000,
                            externalPort: parseInt(spoke.apiUrl.split(':').pop() || '4000')
                        },
                        frontend: {
                            containerName: `dive-spoke-${spoke.instanceCode.toLowerCase()}-frontend`,
                            internalPort: 3000,
                            externalPort: parseInt(frontendUrl.split(':').pop() || '3000')
                        }
                    }
                });
            }

            logger.info('Loaded federation instances from MongoDB', {
                total: instances.length,
                spokes: approvedSpokes.length
            });
        } catch (error) {
            logger.error('Failed to load spokes from MongoDB', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }

        return instances;
    }

    /**
     * Spoke: Query Hub's API for federation partners
     * Throws error if query fails (caller handles retry logic)
     */
    private async getInstancesFromHubAPI(): Promise<IFederationInstance[]> {
        const instances: IFederationInstance[] = [];

        // Add self (current spoke)
        instances.push(this.createCurrentSpokeInstance());

        // Query Hub API - let errors propagate to caller for retry logic
        // Use Docker internal URL for inter-container communication
        // HUB_API_URL can override for production deployments
        const hubUrl = process.env.HUB_API_URL || 'https://dive-hub-backend:4000';
        const response = await fetch(`${hubUrl}/api/federation/discovery`, {
            headers: {
                'Authorization': `Bearer ${process.env.SPOKE_TOKEN || ''}`
            },
            // @ts-ignore - Node fetch doesn't have agent option in types
            agent: httpsAgent
        });

        if (!response.ok) {
            throw new Error(`Hub API returned ${response.status}`);
        }

        const data = await response.json() as any;
        if (data.instances && Array.isArray(data.instances)) {
            // Filter out self and ensure all are marked as remote (use API mode)
            const remoteInstances = (data.instances as IFederationInstance[])
                .filter((i: IFederationInstance) => i.code !== this.instanceCode)
                .map((i: IFederationInstance) => ({
                    ...i,
                    type: 'spoke' as const, // Force spoke type for API mode
                    services: {
                        ...i.services,
                        backend: {
                            ...i.services?.backend,
                            // Use Docker internal container names for inter-container communication
                            containerName: i.code === 'USA'
                                ? 'dive-hub-backend'
                                : `dive-spoke-${i.code.toLowerCase()}-backend`
                        }
                    }
                }));

            instances.push(...remoteInstances);
        }

        logger.info('Loaded federation instances from Hub API', {
            hubUrl,
            total: instances.length,
            codes: instances.map(i => i.code)
        });

        return instances;
    }

    /**
     * Create Hub instance config
     */
    private createHubInstance(): IFederationInstance {
        return {
            code: 'USA',
            name: 'United States',
            type: 'hub',
            enabled: true,
            endpoints: {
                api: 'https://localhost:4000',
                apiInternal: 'https://dive-hub-backend:4000',
                frontend: 'https://localhost:3000',
                keycloak: 'https://localhost:8443'
            },
            services: {
                backend: {
                    containerName: 'dive-hub-backend',
                    internalPort: 4000,
                    externalPort: 4000
                },
                frontend: {
                    containerName: 'dive-hub-frontend',
                    internalPort: 3000,
                    externalPort: 3000
                }
            }
        };
    }

    /**
     * Create current spoke instance config
     */
    private createCurrentSpokeInstance(): IFederationInstance {
        const code = this.instanceCode;
        const port = parseInt(process.env.PORT || '4000');

        return {
            code,
            name: process.env.INSTANCE_NAME || code,
            type: 'spoke',
            enabled: true,
            endpoints: {
                api: `https://localhost:${port}`,
                apiInternal: `https://dive-spoke-${code.toLowerCase()}-backend:4000`,
                frontend: `https://localhost:${port - 1000}`,
                keycloak: process.env.KEYCLOAK_ISSUER || `https://localhost:8453`
            },
            services: {
                backend: {
                    containerName: `dive-spoke-${code.toLowerCase()}-backend`,
                    internalPort: 4000,
                    externalPort: port
                },
                frontend: {
                    containerName: `dive-spoke-${code.toLowerCase()}-frontend`,
                    internalPort: 3000,
                    externalPort: port - 1000
                }
            }
        };
    }

    /**
     * Invalidate cache (call when federation topology changes)
     */
    invalidateCache(): void {
        this.cachedInstances = null;
        this.cacheTimestamp = 0;
        logger.info('Federation instances cache invalidated');
    }
}

export const federationDiscovery = new FederationDiscoveryService();
