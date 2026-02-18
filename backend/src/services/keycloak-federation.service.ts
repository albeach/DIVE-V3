/**
 * Keycloak Federation Service
 *
 * Manages Identity Provider (IdP) configurations for cross-border federation.
 * Automatically creates bidirectional OIDC trust relationships between instances.
 *
 * Phase 4C: Decomposed into focused sub-modules:
 * - federation-client-setup.ts: Client scopes, cross-border clients, protocol mappers
 * - idp-management.ts: IdP CRUD, attribute mappers, update logic
 * - bidirectional-federation.ts: URL builders, secret retrieval, remote config
 *
 * This file retains the class, initialization, bidirectional orchestration,
 * remote client creation, and re-exports for backward compatibility.
 *
 * @module keycloak-federation
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import type IdentityProviderRepresentation from '@keycloak/keycloak-admin-client/lib/defs/identityProviderRepresentation';
import https from 'https';
import { logger } from '../utils/logger';

// Sub-module imports
import type { KeycloakContext } from './federation-client-setup';
import { ensureFederationClientCore } from './federation-client-setup';
import {
  createOIDCIdentityProviderCore,
  getIdentityProviderCore,
  updateIdentityProviderCore,
  deleteIdentityProviderCore,
  listIdentityProvidersCore,
} from './idp-management';
import {
  getInternalKeycloakUrl,
  getInstanceName,
  getLocalIdpUrl,
  getLocalRealmName,
  ensureRemoteFrontendUrl,
  getFederationSecret,
} from './bidirectional-federation';

// Create HTTPS agent that accepts self-signed certificates
// This is required for local development where mkcert certificates are used
const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // Required for self-signed certs in Docker
});

// ============================================
// TYPES
// ============================================

export interface IFederationConfig {
  /** Alias for the IdP (e.g., 'gbr-idp', 'fra-idp') */
  alias: string;

  /** Display name shown to users (e.g., 'United Kingdom', 'France') */
  displayName: string;

  /** Instance code (e.g., 'GBR', 'FRA', 'USA') */
  instanceCode: string;

  /** Base URL of the IdP (e.g., 'https://localhost:8446') - for browser redirects */
  idpBaseUrl: string;

  /** Internal URL for backend communication (e.g., 'https://gbr-keycloak-gbr-1:8443'). If not set, uses idpBaseUrl. */
  idpInternalUrl?: string;

  /** Realm name on the IdP (e.g., 'dive-v3-broker-gbr') */
  idpRealm: string;

  /** Protocol: 'oidc' or 'saml' */
  protocol: 'oidc' | 'saml';

  /** OAuth client ID for cross-border federation */
  clientId: string;

  /** OAuth client secret (from GCP Secret Manager) */
  clientSecret: string;

  /** Enable immediately after creation */
  enabled?: boolean;

  /** Store user in local database on first login */
  storeToken?: boolean;

  /** Sync mode: 'IMPORT' (create local user) or 'FORCE' (use IdP as source of truth) */
  syncMode?: 'IMPORT' | 'FORCE';
}

export interface IProtocolMapper {
  name: string;
  protocol: string;
  protocolMapper: string;
  config: Record<string, string>;
}

export interface IFederationResult {
  alias: string;
  displayName: string;
  protocol: string;
  enabled: boolean;
  internalId: string;
}

// ============================================
// KEYCLOAK FEDERATION SERVICE
// ============================================

export class KeycloakFederationService {
  public kcAdmin: KcAdminClient | null = null;  // Public for remote service injection
  public realm: string;                          // Public for remote service injection
  public lastAuthTime: number = 0;               // Public for remote service injection
  private readonly TOKEN_REFRESH_THRESHOLD_MS = 30000; // Re-auth if token older than 30 seconds

  constructor(realm?: string) {
    this.realm = realm || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
  }

  /**
   * Initialize Keycloak Admin Client
   *
   * Token Management:
   * - Access tokens expire in 60 seconds (Keycloak default)
   * - Re-authenticate if last auth was more than 30 seconds ago
   */
  private async initialize(): Promise<void> {
    const now = Date.now();
    const tokenAge = now - this.lastAuthTime;

    // Re-authenticate if no client OR token is older than threshold
    if (this.kcAdmin && tokenAge < this.TOKEN_REFRESH_THRESHOLD_MS) {
      return;
    }

    const keycloakUrl = process.env.KEYCLOAK_URL || 'https://localhost:8443';
    const adminUser = process.env.KEYCLOAK_ADMIN || 'admin';

    // Get admin password - try instance-specific first, then generic
    const instanceCode = (process.env.INSTANCE_CODE || 'USA').toUpperCase();
    const adminPassword = process.env[`KEYCLOAK_ADMIN_PASSWORD_${instanceCode}`] ||
      process.env.KEYCLOAK_ADMIN_PASSWORD ||
      process.env.KC_ADMIN_PASSWORD;

    if (!adminPassword) {
      throw new Error(`KEYCLOAK_ADMIN_PASSWORD not configured (tried KEYCLOAK_ADMIN_PASSWORD_${instanceCode}, KEYCLOAK_ADMIN_PASSWORD, KC_ADMIN_PASSWORD)`);
    }

    // Create new client or reuse existing
    if (!this.kcAdmin) {
      this.kcAdmin = new KcAdminClient({
        baseUrl: keycloakUrl,
        realmName: 'master',
        requestOptions: {
          /* @ts-expect-error - httpsAgent is supported by node-fetch */
          httpsAgent, // Accept self-signed certs
        },
      });
    }

    try {
      await this.kcAdmin.auth({
        username: adminUser,
        password: adminPassword,
        grantType: 'password',
        clientId: 'admin-cli',
      });

      this.lastAuthTime = Date.now();

      // Set target realm
      this.kcAdmin.setConfig({ realmName: this.realm });

      logger.info('Keycloak Federation Service initialized', {
        keycloakUrl,
        realm: this.realm,
        tokenAgeMs: tokenAge,
        refreshReason: tokenAge >= this.TOKEN_REFRESH_THRESHOLD_MS ? 'token_expired' : 'initial_auth',
      });
    } catch (error) {
      // Reset client on auth failure to force full re-init next time
      this.kcAdmin = null;
      this.lastAuthTime = 0;
      logger.error('Failed to authenticate to Keycloak', {
        keycloakUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /** Get initialized KeycloakContext for extracted functions */
  private getContext(): KeycloakContext {
    if (!this.kcAdmin) {
      throw new Error('Keycloak Admin client not initialized');
    }
    return { kcAdmin: this.kcAdmin, realm: this.realm };
  }

  // ============================================
  // PUBLIC API — Delegates to extracted modules
  // ============================================

  /**
   * Ensure a country-specific federation client exists on this realm.
   * @see federation-client-setup.ts for implementation
   */
  async ensureFederationClient(
    clientId: string,
    clientSecret: string,
    partnerIdpUrl: string,
    partnerRealm: string
  ): Promise<void> {
    await this.initialize();
    await ensureFederationClientCore(this.getContext(), clientId, clientSecret, partnerIdpUrl, partnerRealm);
  }

  /**
   * Create or update OIDC Identity Provider.
   * @see idp-management.ts for implementation
   */
  async createOIDCIdentityProvider(config: IFederationConfig): Promise<IFederationResult> {
    await this.initialize();
    return createOIDCIdentityProviderCore(this.getContext(), config);
  }

  /**
   * Get Identity Provider by alias.
   * @see idp-management.ts for implementation
   */
  async getIdentityProvider(alias: string): Promise<{ internalId: string; config: IdentityProviderRepresentation } | null> {
    await this.initialize();
    return getIdentityProviderCore(this.getContext(), alias);
  }

  /**
   * Update existing Identity Provider with full configuration.
   * @see idp-management.ts for implementation
   */
  async updateIdentityProvider(alias: string, config: Partial<IFederationConfig>): Promise<void> {
    await this.initialize();
    await updateIdentityProviderCore(this.getContext(), alias, config);
  }

  /**
   * Delete Identity Provider.
   * @see idp-management.ts for implementation
   */
  async deleteIdentityProvider(alias: string): Promise<void> {
    await this.initialize();
    await deleteIdentityProviderCore(this.getContext(), alias);
  }

  /**
   * List all Identity Providers in the realm.
   * @see idp-management.ts for implementation
   */
  async listIdentityProviders(): Promise<Array<{ alias: string; displayName: string; enabled: boolean; protocol: string }>> {
    await this.initialize();
    return listIdentityProvidersCore(this.getContext());
  }

  // ============================================
  // BIDIRECTIONAL FEDERATION ORCHESTRATION
  // ============================================

  /**
   * Create bidirectional federation between two instances.
   *
   * TRUE BIDIRECTIONAL: Creates IdPs in BOTH Keycloak instances.
   *
   * Direction 1 (Local -> Remote): Create remote-idp in local Keycloak
   * Direction 2 (Remote -> Local): Create local-idp in remote Keycloak
   */
  async createBidirectionalFederation(options: {
    localInstanceCode: string;
    remoteInstanceCode: string;
    remoteName: string;
    remoteIdpUrl: string;
    remoteRealm: string;
    localName?: string;
    localIdpUrl?: string;
    localRealm?: string;
    remoteKeycloakAdminUrl?: string;
    remoteKeycloakAdminPassword?: string;
    federationClientId?: string;  // DEPRECATED: Use country-specific clients instead
  }): Promise<{ local: IFederationResult; remote: IFederationResult }> {
    const {
      localInstanceCode,
      remoteInstanceCode,
      remoteName,
      remoteIdpUrl,
      remoteRealm,
    } = options;

    // Use country-specific client IDs for federation
    const clientForLocalToRemote = `dive-v3-broker-${localInstanceCode.toLowerCase()}`;
    const clientForRemoteToLocal = `dive-v3-broker-${remoteInstanceCode.toLowerCase()}`;

    logger.info('Creating TRUE bidirectional federation', {
      localInstanceCode,
      remoteInstanceCode,
      remoteName,
      remoteIdpUrl,
    });

    // Get federation secret (same for both directions)
    const federationSecret = await getFederationSecret(localInstanceCode, remoteInstanceCode);

    // STEP 0: Ensure remote Keycloak has frontendUrl set
    if (options.remoteKeycloakAdminPassword) {
      const adminUrl = options.remoteKeycloakAdminUrl || remoteIdpUrl;
      await ensureRemoteFrontendUrl(
        adminUrl,
        remoteRealm,
        options.remoteKeycloakAdminPassword,
        remoteIdpUrl
      );
    } else {
      logger.warn('No remote admin password provided, skipping frontendUrl configuration', {
        remoteInstanceCode,
        impact: 'Issuer mismatch may occur if remote Keycloak accessed via internal hostname',
      });
    }

    // ============================================
    // DIRECTION 1: Create remote IdP in LOCAL Keycloak
    // ============================================
    const remoteAlias = `${remoteInstanceCode.toLowerCase()}-idp`;

    // Determine internal URL for backend communication
    const remoteInternalUrl = options.remoteKeycloakAdminUrl || getInternalKeycloakUrl(remoteInstanceCode, remoteIdpUrl);

    const localResult = await this.createOIDCIdentityProvider({
      alias: remoteAlias,
      displayName: remoteName,
      instanceCode: remoteInstanceCode,
      idpBaseUrl: remoteIdpUrl,
      idpInternalUrl: remoteInternalUrl,
      idpRealm: remoteRealm,
      protocol: 'oidc',
      clientId: clientForLocalToRemote,
      clientSecret: federationSecret,
      enabled: true,
      storeToken: true,
      syncMode: 'FORCE',
    });

    logger.info('Direction 1 complete: Remote IdP created in local Keycloak', {
      localInstanceCode,
      remoteAlias,
      remoteName,
    });

    // ============================================
    // DIRECTION 2: Create local IdP in REMOTE Keycloak
    // ============================================

    const localName = options.localName || getInstanceName(localInstanceCode);
    const localIdpUrl = options.localIdpUrl || getLocalIdpUrl();
    const localRealm = options.localRealm || getLocalRealmName(localInstanceCode);

    logger.info('Direction 2: Creating local IdP in remote Keycloak', {
      remoteInstanceCode,
      localInstanceCode,
      localName,
      localIdpUrl,
      localRealm,
    });

    try {
      const adminUrl = options.remoteKeycloakAdminUrl || remoteIdpUrl;

      logger.debug('Connecting to remote Keycloak Admin API', {
        adminUrl,
        remoteIdpUrl,
        usesSeparateAdminUrl: !!options.remoteKeycloakAdminUrl,
      });

      // Create separate Keycloak Admin client for REMOTE instance
      const remoteKeycloakService = await this.createRemoteKeycloakClient(
        adminUrl,
        remoteRealm,
        options.remoteKeycloakAdminPassword
      );

      // Ensure client for Hub users exists on the spoke
      logger.info('Ensuring client exists on remote Keycloak for local users', {
        clientId: clientForLocalToRemote,
        targetRealm: remoteRealm,
      });
      await remoteKeycloakService.ensureFederationClient(
        clientForLocalToRemote,
        federationSecret,
        localIdpUrl,
        this.realm
      );

      // Ensure client for spoke users exists on the Hub (local)
      logger.info('Ensuring client exists on local Keycloak for remote users', {
        clientId: clientForRemoteToLocal,
        targetRealm: this.realm,
      });
      await this.ensureFederationClient(
        clientForRemoteToLocal,
        federationSecret,
        remoteIdpUrl,
        remoteRealm
      );

      const localAlias = `${localInstanceCode.toLowerCase()}-idp`;

      // Determine local internal URL for backend communication
      const localInternalUrl = getInternalKeycloakUrl(localInstanceCode, localIdpUrl);

      const remoteResult = await remoteKeycloakService.createOIDCIdentityProvider({
        alias: localAlias,
        displayName: localName,
        instanceCode: localInstanceCode,
        idpBaseUrl: localIdpUrl,
        idpInternalUrl: localInternalUrl,
        idpRealm: localRealm,
        protocol: 'oidc',
        clientId: clientForRemoteToLocal,
        clientSecret: federationSecret,
        enabled: true,
        storeToken: true,
        syncMode: 'IMPORT',
      });

      logger.info('Direction 2 complete: Local IdP created in remote Keycloak', {
        remoteInstanceCode,
        localAlias,
        localName,
      });

      logger.info('TRUE bidirectional federation complete', {
        localInstanceCode,
        remoteInstanceCode,
        direction1: `${remoteAlias} in ${localInstanceCode}`,
        direction2: `${localAlias} in ${remoteInstanceCode}`,
      });

      return { local: localResult, remote: remoteResult };

    } catch (error) {
      logger.error('Failed to create reverse IdP (direction 2)', {
        remoteInstanceCode,
        localInstanceCode,
        error: error instanceof Error ? error.message : 'Unknown error',
        warning: 'Federation is UNIDIRECTIONAL - only local->remote works',
      });

      throw new Error(
        `Bidirectional federation partially failed. ` +
        `Local IdP (${remoteAlias}) created successfully, but failed to create ` +
        `remote IdP (${localInstanceCode.toLowerCase()}-idp) in ${remoteInstanceCode}: ` +
        `${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ============================================
  // REMOTE KEYCLOAK CLIENT
  // ============================================

  /**
   * Create Keycloak Admin client for remote instance.
   *
   * Allows creating IdPs in remote Keycloak, not just local.
   * For local development, tries common passwords.
   */
  private async createRemoteKeycloakClient(
    remoteIdpUrl: string,
    remoteRealm: string,
    remoteAdminPassword?: string
  ): Promise<KeycloakFederationService> {
    const baseUrl = remoteIdpUrl.replace(/\/realms\/.*$/, '');
    const adminUsername = process.env.KEYCLOAK_ADMIN || 'admin';
    const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

    let passwordsToTry: string[];

    if (isDevelopment) {
      passwordsToTry = [
        remoteAdminPassword,
        process.env.KEYCLOAK_ADMIN_PASSWORD,
        'admin',
      ].filter(Boolean) as string[];
    } else {
      if (!remoteAdminPassword) {
        throw new Error(
          'Remote Keycloak admin password required for production. ' +
          'Set KEYCLOAK_ADMIN_PASSWORD_{CODE} or configure GCP Secret Manager.'
        );
      }
      passwordsToTry = [remoteAdminPassword];
    }

    logger.debug('Creating remote Keycloak client', {
      baseUrl,
      realm: remoteRealm,
      environment: isDevelopment ? 'development' : 'production',
      attemptsAllowed: passwordsToTry.length,
    });

    for (const password of passwordsToTry) {
      try {
        const remoteService = new KeycloakFederationService(remoteRealm);

        remoteService.kcAdmin = new KcAdminClient({
          baseUrl,
          realmName: 'master',
          requestOptions: {
            /* @ts-expect-error - httpsAgent is supported by node-fetch */
            httpsAgent,
          },
        });

        await remoteService.kcAdmin.auth({
          username: adminUsername,
          password,
          grantType: 'password',
          clientId: 'admin-cli',
        });

        // CRITICAL: Set lastAuthTime so initialize() won't re-authenticate with wrong password
        remoteService.lastAuthTime = Date.now();

        remoteService.kcAdmin.setConfig({ realmName: remoteRealm });
        remoteService.realm = remoteRealm;

        logger.info('Remote Keycloak client initialized successfully', {
          baseUrl,
          realm: remoteRealm,
          environment: isDevelopment ? 'development' : 'production',
        });

        return remoteService;
      } catch (error) {
        logger.debug('Failed to auth with password, trying next', {
          baseUrl,
          error: error instanceof Error ? error.message : 'Unknown',
        });
        continue;
      }
    }

    throw new Error(
      `Could not authenticate to remote Keycloak at ${baseUrl}. ` +
      `Tried ${passwordsToTry.length} password(s). ` +
      `Ensure KEYCLOAK_ADMIN_PASSWORD_{CODE} is set or configure GCP Secret Manager.`
    );
  }
}

// Singleton instance
export const keycloakFederationService = new KeycloakFederationService();

// ============================================
// RE-EXPORTS for backward compatibility
// ============================================

// federation-client-setup.ts
export type { KeycloakContext } from './federation-client-setup';
export {
  NATO_PORT_OFFSETS,
  ensureDiveClientScopes,
  ensureProtocolMapperForScope,
  ensureCrossBorderClient,
  ensureProtocolMappersForClient,
  ensureFederationClientCore,
} from './federation-client-setup';

// idp-management.ts
export {
  getIdentityProviderCore,
  createOIDCIdentityProviderCore,
  createDIVEAttributeMappers,
  updateIdentityProviderCore,
  deleteIdentityProviderCore,
  listIdentityProvidersCore,
} from './idp-management';

// bidirectional-federation.ts
export {
  getInternalKeycloakUrl,
  getInstanceName,
  getLocalIdpUrl,
  getLocalRealmName,
  ensureRemoteFrontendUrl,
  getFederationSecret,
} from './bidirectional-federation';
