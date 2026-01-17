/**
 * DIVE V3 - KAS Router Service
 *
 * Routes key access requests to the appropriate KAS instance based on:
 * - Resource origin (which instance owns the resource)
 * - Federation agreements (trust relationships between nations)
 * - KAS registry (available KAS instances and their capabilities)
 *
 * Phase 3: Cross-KAS Key Request Routing
 *
 * @version 1.0.0
 * @date 2025-01-03
 */

import axios, { AxiosError } from 'axios';
import { logger } from '../utils/logger';
import { mongoKasRegistryStore, IKasInstance, IKasFederationAgreement } from '../models/kas-registry.model';

/**
 * Key request routing result
 */
export interface IKasRouteResult {
  success: boolean;
  kasServer?: IKasInstance;
  routedToUrl?: string;
  reason: string;
  fallbackUsed?: boolean;
}

/**
 * Key request parameters
 */
export interface IKeyRequestParams {
  resourceId: string;
  kaoId: string;
  originInstance: string; // Country code of resource owner
  requesterInstance: string; // Country code of requester
  bearerToken: string;
  wrappedKey?: string;
  requestId: string;
}

/**
 * Key request response from KAS
 */
export interface IKasResponse {
  success: boolean;
  decryptedContent?: string;
  key?: string;
  error?: string;
  denialReason?: string;
  kasId?: string;
  dek?: string;
  auditEventId?: string;
  organization?: string;
  latencyMs?: number;
}

/**
 * KAS Router Service - Routes key requests to appropriate KAS instances
 */
class KasRouterService {
  private initialized = false;

  /**
   * Initialize the KAS router
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await mongoKasRegistryStore.initialize();
    this.initialized = true;
    logger.info('KAS Router Service initialized');
  }

  /**
   * Find the appropriate KAS for a key request
   */
  async findKasForRequest(
    originInstance: string,
    requesterInstance: string
  ): Promise<IKasRouteResult> {
    await this.initialize();

    const origin = originInstance.toUpperCase();
    const requester = requesterInstance.toUpperCase();

    logger.debug('Finding KAS for request', { origin, requester });

    // Step 1: Check if origin has a registered KAS
    const originKasId = `kas-${origin.toLowerCase()}`;
    const originKas = await mongoKasRegistryStore.findById(originKasId);

    if (!originKas) {
      // Try to find any KAS that supports the origin country
      const supportingKas = await mongoKasRegistryStore.findByCountry(origin);
      if (supportingKas.length === 0) {
        logger.warn('No KAS found for origin instance', { origin });
        return {
          success: false,
          reason: `No KAS registered for ${origin}`,
        };
      }

      // Use first supporting KAS
      const kas = supportingKas[0];
      logger.info('Using supporting KAS for origin', {
        origin,
        kasId: kas.kasId,
        organization: kas.organization,
      });

      return {
        success: true,
        kasServer: kas,
        routedToUrl: kas.kasUrl,
        reason: `Routed to supporting KAS: ${kas.kasId}`,
        fallbackUsed: true,
      };
    }

    // Step 2: Check if origin KAS is active
    if (originKas.status !== 'active' || !originKas.enabled) {
      logger.warn('Origin KAS not active', { kasId: originKas.kasId, status: originKas.status });
      return {
        success: false,
        reason: `KAS ${originKas.kasId} is ${originKas.status}`,
      };
    }

    // Step 3: Check federation agreement (does origin trust requester?)
    const agreement = await mongoKasRegistryStore.getFederationAgreement(origin);
    if (agreement) {
      const isTrusted = agreement.trustedKAS.includes(originKasId) ||
        origin === requester; // Same-nation is always trusted

      if (!isTrusted && origin !== requester) {
        logger.warn('Federation agreement check', {
          origin,
          requester,
          trustedKAS: agreement.trustedKAS,
        });
        // Don't block - just log the warning. Policy evaluation will handle access control.
      }
    }

    logger.info('Routing key request', {
      origin,
      requester,
      kasId: originKas.kasId,
      kasUrl: originKas.kasUrl,
    });

    return {
      success: true,
      kasServer: originKas,
      routedToUrl: originKas.kasUrl,
      reason: `Routed to origin KAS: ${originKas.kasId}`,
    };
  }

  /**
   * Route and execute a key request to the appropriate KAS
   */
  async routeKeyRequest(params: IKeyRequestParams): Promise<IKasResponse> {
    const { resourceId, kaoId, originInstance, requesterInstance, bearerToken, wrappedKey, requestId } = params;

    // Find appropriate KAS
    const routeResult = await this.findKasForRequest(originInstance, requesterInstance);

    if (!routeResult.success || !routeResult.kasServer) {
      logger.error('Failed to route key request', {
        requestId,
        resourceId,
        origin: originInstance,
        reason: routeResult.reason,
      });
      return {
        success: false,
        error: 'Routing failed',
        denialReason: routeResult.reason,
      };
    }

    const kasServer = routeResult.kasServer;
    const kasUrl = routeResult.routedToUrl!;

    logger.info('Executing cross-KAS key request', {
      requestId,
      resourceId,
      kasId: kasServer.kasId,
      kasUrl,
      origin: originInstance,
      requester: requesterInstance,
    });

    try {
      // Make request to target KAS
      const response = await axios.post(
        kasUrl,
        {
          resourceId,
          kaoId,
          wrappedKey,
          bearerToken,
          requestTimestamp: new Date().toISOString(),
          requestId,
          federatedFrom: requesterInstance,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${bearerToken}`,
            'X-Request-Id': requestId,
            'X-Federated-From': requesterInstance,
            'X-KAS-Router': 'dive-v3-cross-kas',
          },
          timeout: 30000, // 30 second timeout for KAS operations
          // Trust self-signed certs in development
          ...(process.env.NODE_ENV !== 'production' && {
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
          }),
        }
      );

      logger.info('Cross-KAS request completed', {
        requestId,
        resourceId,
        kasId: kasServer.kasId,
        status: response.status,
        success: response.data?.success,
      });

      // Update heartbeat for this KAS
      await mongoKasRegistryStore.heartbeat(kasServer.kasId);

      return {
        success: response.data?.success || false,
        decryptedContent: response.data?.decryptedContent,
        key: response.data?.key,
        error: response.data?.error,
        denialReason: response.data?.denialReason,
        kasId: kasServer.kasId,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const errorData = axiosError.response?.data as Record<string, unknown>;

      logger.error('Cross-KAS request failed', {
        requestId,
        resourceId,
        kasId: kasServer.kasId,
        kasUrl,
        status,
        error: axiosError.message,
      });

      // If target KAS is unreachable, mark it as potentially offline
      if (!axiosError.response) {
        logger.warn('KAS instance may be offline', { kasId: kasServer.kasId });
        // Don't suspend automatically - just log for monitoring
      }

      return {
        success: false,
        error: errorData?.error as string || 'KAS request failed',
        denialReason: errorData?.denialReason as string || axiosError.message,
        kasId: kasServer.kasId,
      };
    }
  }

  /**
   * Get current routing table (for debugging/monitoring)
   */
  async getRoutingTable(): Promise<{
    kasServers: Array<{
      kasId: string;
      organization: string;
      kasUrl: string;
      status: string;
      supportedCountries: string[];
    }>;
    federationAgreements: Record<string, IKasFederationAgreement>;
  }> {
    await this.initialize();

    const instances = await mongoKasRegistryStore.findAll();
    const agreements = await mongoKasRegistryStore.getAllFederationAgreements();

    return {
      kasServers: instances.map((kas) => ({
        kasId: kas.kasId,
        organization: kas.organization,
        kasUrl: kas.kasUrl,
        status: kas.status,
        supportedCountries: kas.supportedCountries,
      })),
      federationAgreements: agreements,
    };
  }

  /**
   * Test connectivity to a KAS instance
   */
  async testKasConnectivity(kasId: string): Promise<{
    success: boolean;
    latencyMs?: number;
    error?: string;
  }> {
    await this.initialize();

    const kas = await mongoKasRegistryStore.findById(kasId);
    if (!kas) {
      return { success: false, error: 'KAS not found' };
    }

    const startTime = Date.now();
    try {
      // Try health endpoint
      const healthUrl = kas.kasUrl.replace('/request-key', '/health');
      await axios.get(healthUrl, {
        timeout: 5000,
        ...(process.env.NODE_ENV !== 'production' && {
          httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
        }),
      });

      const latencyMs = Date.now() - startTime;
      await mongoKasRegistryStore.heartbeat(kasId);

      return { success: true, latencyMs };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export singleton
export const kasRouterService = new KasRouterService();

export default KasRouterService;
