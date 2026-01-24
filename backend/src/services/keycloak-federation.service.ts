/**
 * Keycloak Federation Service
 *
 * Manages Identity Provider (IdP) configurations for cross-border federation.
 * Automatically creates bidirectional OIDC trust relationships between instances.
 *
 * Phase 3 Enhancement: Auto-link IdPs during spoke approval
 *
 * Security:
 * - Uses GCP Secret Manager for federation client secrets
 * - Validates IdP endpoints before configuration
 * - Configures protocol mappers for DIVE attributes
 * - Supports both OIDC and SAML protocols
 *
 * @module keycloak-federation
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import https from 'https';
import { logger } from '../utils/logger';

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
    this.realm = realm || process.env.KEYCLOAK_REALM || 'dive-v3-broker';
  }

  /**
   * Initialize Keycloak Admin Client
   *
   * Token Management:
   * - Access tokens expire in 60 seconds (Keycloak default)
   * - Re-authenticate if last auth was more than 30 seconds ago
   * - This ensures we always have a valid token for API calls
   */
  private async initialize(): Promise<void> {
    const now = Date.now();
    const tokenAge = now - this.lastAuthTime;

    // Re-authenticate if no client OR token is older than threshold
    if (this.kcAdmin && tokenAge < this.TOKEN_REFRESH_THRESHOLD_MS) {
      return;
    }

    const keycloakUrl = process.env.KEYCLOAK_URL || 'https://localhost:8443';
    // KEYCLOAK 26+ UPDATE: Use KC_BOOTSTRAP_ADMIN_USERNAME (new standard)
    const adminUser = process.env.KC_BOOTSTRAP_ADMIN_USERNAME 
                   || process.env.KEYCLOAK_ADMIN 
                   || 'admin';

    // Get admin password - try instance-specific first, then generic
    // Hub uses _USA suffix for normalized naming convention
    const instanceCode = (process.env.INSTANCE_CODE || 'USA').toUpperCase();
    const adminPassword = process.env[`KC_BOOTSTRAP_ADMIN_PASSWORD_${instanceCode}`] 
                       || process.env[`KEYCLOAK_ADMIN_PASSWORD_${instanceCode}`]
                       || process.env.KC_BOOTSTRAP_ADMIN_PASSWORD_USA
                       || process.env.KC_BOOTSTRAP_ADMIN_PASSWORD
                       || process.env.KEYCLOAK_ADMIN_PASSWORD
                       || process.env.KC_ADMIN_PASSWORD;

    if (!adminPassword) {
      throw new Error(
        `Keycloak admin password not configured!\n` +
        `Tried (in order):\n` +
        `  - KC_BOOTSTRAP_ADMIN_PASSWORD_${instanceCode}\n` +
        `  - KEYCLOAK_ADMIN_PASSWORD_${instanceCode} (legacy)\n` +
        `  - KC_BOOTSTRAP_ADMIN_PASSWORD_USA (Hub)\n` +
        `  - KC_BOOTSTRAP_ADMIN_PASSWORD\n` +
        `  - KEYCLOAK_ADMIN_PASSWORD (legacy)\n` +
        `  - KC_ADMIN_PASSWORD (legacy)`
      );
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

  /**
   * Ensure DIVE custom client scopes exist in the realm
   *
   * These scopes are required for federation to work properly.
   * They allow the USA Hub's IdP to request DIVE-specific attributes.
   *
   * Required scopes:
   * - clearance: User's security clearance level
   * - countryOfAffiliation: User's country code
   * - acpCOI: Community of Interest memberships
   * - uniqueID: User's unique identifier
   */
  private async ensureDiveClientScopes(): Promise<void> {
    if (!this.kcAdmin) {
      throw new Error('Keycloak Admin client not initialized');
    }

    const requiredScopes = [
      {
        name: 'clearance',
        description: 'User security clearance level',
        protocol: 'openid-connect',
        attributes: {
          'display.on.consent.screen': 'false',
          'include.in.token.scope': 'true',
        },
      },
      {
        name: 'countryOfAffiliation',
        description: 'User country of affiliation',
        protocol: 'openid-connect',
        attributes: {
          'display.on.consent.screen': 'false',
          'include.in.token.scope': 'true',
        },
      },
      {
        name: 'acpCOI',
        description: 'ACP Community of Interest memberships',
        protocol: 'openid-connect',
        attributes: {
          'display.on.consent.screen': 'false',
          'include.in.token.scope': 'true',
        },
      },
      {
        name: 'uniqueID',
        description: 'Unique user identifier',
        protocol: 'openid-connect',
        attributes: {
          'display.on.consent.screen': 'false',
          'include.in.token.scope': 'true',
        },
      },
    ];

    for (const scopeConfig of requiredScopes) {
      try {
        // Check if scope exists
        const existingScopes = await this.kcAdmin.clientScopes.find({ realm: this.realm });
        const exists = existingScopes.find((s: any) => s.name === scopeConfig.name);

        if (!exists) {
          // Create the scope
          await this.kcAdmin.clientScopes.create({
            realm: this.realm,
            name: scopeConfig.name,
            description: scopeConfig.description,
            protocol: scopeConfig.protocol,
            attributes: scopeConfig.attributes,
          });

          logger.info('Created DIVE client scope', {
            realm: this.realm,
            scope: scopeConfig.name,
          });
        } else {
          logger.debug('DIVE client scope already exists', {
            realm: this.realm,
            scope: scopeConfig.name,
          });
        }

        // Add protocol mapper to the scope (if it doesn't have one)
        await this.ensureProtocolMapperForScope(scopeConfig.name);

      } catch (error) {
        logger.warn('Failed to create DIVE client scope (may already exist)', {
          realm: this.realm,
          scope: scopeConfig.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Ensure a client scope has a protocol mapper to include user attributes in tokens
   *
   * CRITICAL: Configuration for each attribute type:
   * - Single-valued (clearance, countryOfAffiliation, uniqueID):
   *   aggregate.attrs=true, multivalued=false, jsonType=String
   * - Multi-valued (acpCOI):
   *   multivalued=true, jsonType=String (NO aggregate.attrs)
   *   Keycloak v26+ requires User Profile attribute to have multivalued=true
   */
  private async ensureProtocolMapperForScope(scopeName: string): Promise<void> {
    if (!this.kcAdmin) {
      throw new Error('Keycloak Admin client not initialized');
    }

    try {
      // Get the scope
      const scopes = await this.kcAdmin.clientScopes.find({ realm: this.realm });
      const scope = scopes.find((s: any) => s.name === scopeName);

      if (!scope || !scope.id) {
        logger.warn('Client scope not found for protocol mapper', { scopeName });
        return;
      }

      // Check if mapper already exists
      const existingMappers = await this.kcAdmin.clientScopes.listProtocolMappers({
        id: scope.id,
        realm: this.realm
      });

      const mapperExists = existingMappers.some((m: any) => m.name === `${scopeName}-mapper`);

      if (mapperExists) {
        logger.debug('Protocol mapper already exists for scope', { scopeName });
        return;
      }

      // Determine mapper configuration based on attribute type
      const isMultiValued = scopeName === 'acpCOI';

      const mapperConfig: Record<string, string> = {
        'user.attribute': scopeName,
        'claim.name': scopeName,
        'jsonType.label': 'String',
        'id.token.claim': 'true',
        'access.token.claim': 'true',
        'userinfo.token.claim': 'true',
        'introspection.token.claim': 'true',
        'multivalued': isMultiValued ? 'true' : 'false',
      };

      // For single-valued attributes, use aggregate.attrs to extract first element
      // For multi-valued attributes (like acpCOI), omit aggregate.attrs to keep array
      if (!isMultiValued) {
        mapperConfig['aggregate.attrs'] = 'true';
      }

      await this.kcAdmin.clientScopes.addProtocolMapper({
        id: scope.id,
        realm: this.realm
      }, {
        name: `${scopeName}-mapper`,
        protocol: 'openid-connect',
        protocolMapper: 'oidc-usermodel-attribute-mapper',
        config: mapperConfig,
      });

      logger.info('Created protocol mapper for DIVE scope', {
        realm: this.realm,
        scopeName,
        mapperType: 'oidc-usermodel-attribute-mapper',
        isMultiValued,
        config: isMultiValued ? 'multivalued=true' : 'aggregate.attrs=true, multivalued=false',
      });

    } catch (error) {
      logger.warn('Failed to create protocol mapper (may already exist)', {
        realm: this.realm,
        scopeName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Ensure cross-border federation client exists in the realm
   *
   * This client is used by OTHER instances' Keycloak brokers when federating TO this instance.
   * Example: USA Hub's gbr-idp uses this client to connect to GBR Keycloak.
   */
  private async ensureCrossBorderClient(clientId: string, clientSecret: string): Promise<void> {
    if (!this.kcAdmin) {
      throw new Error('Keycloak Admin client not initialized');
    }

    try {
      // Check if client exists
      const existingClients = await this.kcAdmin.clients.find({
        realm: this.realm,
        clientId: clientId,
      });

      if (!existingClients || existingClients.length === 0) {
        // Create the client
        logger.info('Creating cross-border federation client', {
          realm: this.realm,
          clientId,
        });

        // Build comprehensive redirect URIs for cross-border federation
        // Must include all Keycloak broker endpoints AND frontend callback URLs
        const redirectUris = [
          // Keycloak broker endpoints (internal and external)
          'https://localhost:*/realms/*/broker/*/endpoint',
          'https://dive-hub-keycloak:*/realms/*/broker/*/endpoint',
          'https://dive-spoke-*-keycloak:*/realms/*/broker/*/endpoint',
          // Frontend OAuth callbacks (all possible ports)
          'https://localhost:3000/*',   // Hub frontend
          'https://localhost:300?/*',   // Spoke frontends 3001-3009
          'https://localhost:30??/*',   // Spoke frontends 3010-3099
          // Wild card for development flexibility
          'https://localhost:*/*',
          // Production URLs
          'https://*-app.dive25.com/*',
          'https://*-idp.dive25.com/*',
        ];

        await this.kcAdmin.clients.create({
          realm: this.realm,
          clientId: clientId,
          enabled: true,
          clientAuthenticatorType: 'client-secret',
          secret: clientSecret,
          protocol: 'openid-connect',
          publicClient: false,
          standardFlowEnabled: true,
          directAccessGrantsEnabled: false,
          serviceAccountsEnabled: false,
          redirectUris,
          webOrigins: ['+'],  // Allow all origins that match redirect URIs
          attributes: {
            'pkce.code.challenge.method': 'S256',
          },
        });

        logger.info('Cross-border federation client created', {
          realm: this.realm,
          clientId,
        });
      } else {
        // Client exists - update redirect URIs to ensure they're comprehensive
        const existingClient = existingClients[0];
        if (existingClient.id) {
          // Build comprehensive redirect URIs
          const redirectUris = [
            'https://localhost:*/realms/*/broker/*/endpoint',
            'https://dive-hub-keycloak:*/realms/*/broker/*/endpoint',
            'https://dive-spoke-*-keycloak:*/realms/*/broker/*/endpoint',
            'https://localhost:3000/*',
            'https://localhost:300?/*',
            'https://localhost:30??/*',
            'https://localhost:*/*',
            'https://*-app.dive25.com/*',
            'https://*-idp.dive25.com/*',
          ];

          await this.kcAdmin.clients.update(
            { realm: this.realm, id: existingClient.id },
            {
              redirectUris,
              webOrigins: ['+'],
            }
          );
          logger.info('Cross-border federation client redirect URIs updated', {
            realm: this.realm,
            clientId,
          });
        }
      }

      // DISABLED: Scopes now managed by Terraform SSOT (main.tf incoming_federation_defaults)
      // Runtime assignment removed to avoid race conditions with Terraform-managed resources
      // See: terraform/modules/federated-instance/main.tf and dive-client-scopes.tf
      // await this.assignDiveScopesToClient(clientId);

    } catch (error) {
      logger.error('Failed to ensure cross-border client', {
        realm: this.realm,
        clientId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Ensure a country-specific federation client exists on this realm
   *
   * This creates clients like dive-v3-broker-usa on a spoke Keycloak
   * for Hub users authenticating via federation.
   *
   * @param clientId - The client ID (e.g., dive-v3-broker-usa)
   * @param clientSecret - The shared secret for the client
   * @param partnerIdpUrl - The partner's public Keycloak URL (for redirect URIs)
   * @param partnerRealm - The partner's realm name (for broker endpoint)
   */
  async ensureFederationClient(
    clientId: string,
    clientSecret: string,
    partnerIdpUrl: string,
    partnerRealm: string
  ): Promise<void> {
    await this.initialize();

    if (!this.kcAdmin) {
      throw new Error('Keycloak Admin client not initialized');
    }

    // Extract instance code from clientId (e.g., dive-v3-broker-usa -> usa)
    const instanceCode = clientId.replace('dive-v3-broker-', '').toUpperCase();

    // Get the frontend port for this instance from the NATO database port offsets
    // Each country has a unique offset: frontend = 3000 + offset, backend = 4000 + offset, keycloak = 8443 + offset
    const natoOffsets: Record<string, number> = {
      'USA': 0, 'ALB': 1, 'BEL': 2, 'BGR': 3, 'CAN': 4, 'HRV': 5, 'CZE': 6, 'DNK': 7,
      'EST': 8, 'FIN': 9, 'FRA': 10, 'DEU': 11, 'GRC': 12, 'HUN': 13, 'ISL': 14,
      'ITA': 15, 'LVA': 16, 'LTU': 17, 'LUX': 18, 'MNE': 19, 'NLD': 20, 'MKD': 21,
      'NOR': 22, 'POL': 23, 'PRT': 24, 'ROU': 25, 'SVK': 26, 'SVN': 27, 'ESP': 28,
      'SWE': 29, 'TUR': 30, 'GBR': 31,
    };
    const offset = natoOffsets[instanceCode] ?? 1;
    const frontendPort = 3000 + offset;

    try {
      const existingClients = await this.kcAdmin.clients.find({
        realm: this.realm,
        clientId: clientId,
      });

      const redirectUris = [
        `${partnerIdpUrl}/realms/${partnerRealm}/broker/*-idp/endpoint`,
        `${partnerIdpUrl}/realms/${partnerRealm}/broker/*-idp/endpoint/*`,
        `${partnerIdpUrl}/*`,
        'https://localhost:*/*',  // Development flexibility
        `https://localhost:${frontendPort}/*`,  // Spoke frontend
        `https://localhost:${frontendPort}/api/auth/callback/keycloak`,  // NextAuth callback
        `https://${instanceCode.toLowerCase()}-app.dive25.com/*`,  // Production domain
      ];

      const webOrigins = [partnerIdpUrl, '+'];

      if (!existingClients || existingClients.length === 0) {
        logger.info('Creating federation client for partner', {
          realm: this.realm,
          clientId,
          partnerIdpUrl,
          partnerRealm,
        });

        await this.kcAdmin.clients.create({
          realm: this.realm,
          clientId,
          name: `Federation Client for ${instanceCode}`,
          enabled: true,
          clientAuthenticatorType: 'client-secret',
          secret: clientSecret,
          protocol: 'openid-connect',
          publicClient: false,
          standardFlowEnabled: true,
          directAccessGrantsEnabled: false,
          serviceAccountsEnabled: false,
          redirectUris,
          webOrigins,
          attributes: {
            'pkce.code.challenge.method': 'S256',
          },
        });

        logger.info('Federation client created', {
          realm: this.realm,
          clientId,
        });
      } else {
        // Update existing client's redirect URIs
        const existingClient = existingClients[0];
        if (existingClient.id) {
          await this.kcAdmin.clients.update(
            { realm: this.realm, id: existingClient.id },
            {
              redirectUris,
              webOrigins,
              secret: clientSecret,
            }
          );
          logger.info('Federation client updated', {
            realm: this.realm,
            clientId,
          });
        }
      }

      // DISABLED: Scopes now managed by Terraform SSOT (main.tf incoming_federation_defaults)
      // Runtime assignment removed to avoid race conditions with Terraform-managed resources
      // See: terraform/modules/federated-instance/main.tf and dive-client-scopes.tf
      // await this.assignDiveScopesToClient(clientId);

      // CRITICAL: Create protocol mappers to include attributes in tokens
      // Without these, federation won't work - spoke won't receive user attributes!
      await this.ensureProtocolMappersForClient(clientId);

    } catch (error) {
      logger.error('Failed to ensure federation client', {
        realm: this.realm,
        clientId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // ============================================================================
  // REMOVED: assignDiveScopesToClient() method
  // ============================================================================
  // Client scopes are now managed exclusively by Terraform (SSOT principle)
  // See: terraform/modules/federated-instance/main.tf (incoming_federation_defaults)
  // See: terraform/modules/federated-instance/dive-client-scopes.tf
  //
  // All 9 DIVE scopes are assigned by Terraform:
  // - Core identity: uniqueID, clearance, countryOfAffiliation, acpCOI
  // - ACR/AMR for MFA: dive_acr, dive_amr, user_acr, user_amr, acr (built-in)
  //
  // This eliminates race conditions between Terraform and runtime code,
  // and ensures consistent scope assignments from clean slate deployments.
  // ============================================================================

  /**
   * Ensure protocol mappers exist on a federation client
   *
   * CRITICAL: Without these mappers, the client won't include user attributes in tokens.
   * This is why spoke federation clients were showing "no mappers" in verification.
   *
   * Protocol mappers tell Keycloak which user attributes to include in JWT tokens.
   * Each DIVE attribute needs its own mapper configured correctly.
   */
  private async ensureProtocolMappersForClient(clientId: string): Promise<void> {
    if (!this.kcAdmin) {
      throw new Error('Keycloak Admin client not initialized');
    }

    try {
      // Get the client UUID
      const clients = await this.kcAdmin.clients.find({
        realm: this.realm,
        clientId: clientId,
      });

      if (!clients || clients.length === 0) {
        logger.warn('Client not found when ensuring protocol mappers', {
          realm: this.realm,
          clientId,
        });
        return;
      }

      const client = clients[0];
      const clientUuid = client.id;

      if (!clientUuid) {
        logger.error('Client UUID is undefined', { clientId });
        return;
      }

      // Standard DIVE attributes to include in tokens (including AMR for MFA)
      const standardAttrs = ['clearance', 'countryOfAffiliation', 'acpCOI', 'uniqueID', 'amr'];
      let created = 0;

      for (const attr of standardAttrs) {
        const mapperName = `federation-std-${attr}`;

        // Check if mapper already exists
        const existingMappers = await this.kcAdmin.clients.listProtocolMappers({
          id: clientUuid,
          realm: this.realm,
        });

        const mapperExists = existingMappers.some((m: any) => m.name === mapperName);

        if (mapperExists) {
          logger.debug('Protocol mapper already exists', { clientId, mapperName });
          continue;
        }

        // Determine if multivalued (acpCOI and amr are arrays)
        const multivalued = (attr === 'acpCOI' || attr === 'amr');

        // Create the protocol mapper
        await this.kcAdmin.clients.addProtocolMapper(
          { id: clientUuid, realm: this.realm },
          {
            name: mapperName,
            protocol: 'openid-connect',
            protocolMapper: 'oidc-usermodel-attribute-mapper',
            config: {
              'userinfo.token.claim': 'true',
              'id.token.claim': 'true',
              'access.token.claim': 'true',
              'claim.name': attr,
              'user.attribute': attr,
              'jsonType.label': 'String',
              'multivalued': String(multivalued),
            },
          }
        );

        created++;
        logger.info('Created protocol mapper', {
          realm: this.realm,
          clientId,
          mapperName,
          attribute: attr,
          multivalued,
        });
      }

      if (created > 0) {
        logger.info('Protocol mappers ensured for federation client', {
          realm: this.realm,
          clientId,
          created,
          total: standardAttrs.length,
        });
      } else {
        logger.debug('All protocol mappers already exist for client', {
          realm: this.realm,
          clientId,
        });
      }
    } catch (error) {
      logger.error('Failed to ensure protocol mappers for client', {
        realm: this.realm,
        clientId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - non-critical if mappers can't be created
    }
  }

  /**
   * Create or update OIDC Identity Provider
   *
   * This establishes trust with another DIVE instance's Keycloak.
   * Users from the remote instance can authenticate here via federation.
   */
  async createOIDCIdentityProvider(config: IFederationConfig): Promise<IFederationResult> {
    await this.initialize();

    if (!this.kcAdmin) {
      throw new Error('Keycloak Admin client not initialized');
    }

    const { alias, displayName, idpBaseUrl, idpInternalUrl, idpRealm, clientId, clientSecret, protocol } = config;

    if (protocol !== 'oidc') {
      throw new Error('This method only supports OIDC protocol');
    }

    // Use internal URL for backend calls, public URL for browser redirects
    const backendUrl = idpInternalUrl || idpBaseUrl;

    logger.info('Creating OIDC Identity Provider', {
      alias,
      displayName,
      idpBaseUrl,
      idpInternalUrl: backendUrl,
      idpRealm,
      targetRealm: this.realm,
    });

    // STEP 1: Ensure DIVE custom scopes exist in this realm
    await this.ensureDiveClientScopes();

    // STEP 2: Ensure cross-border client exists and has DIVE scopes
    await this.ensureCrossBorderClient(clientId, clientSecret);

    // Check if IdP already exists
    const existing = await this.getIdentityProvider(alias);
    if (existing) {
      logger.warn('Identity Provider already exists, updating', { alias });
      await this.updateIdentityProvider(alias, config);
      return {
        alias,
        displayName,
        protocol: 'oidc',
        enabled: config.enabled !== false,
        internalId: existing.internalId,
      };
    }

    // Build discovery endpoint (use backend URL)
    const discoveryUrl = `${backendUrl}/realms/${idpRealm}/.well-known/openid-configuration`;

    // Create IdP configuration
    const idpConfig = {
      alias,
      displayName,
      providerId: 'oidc',
      enabled: config.enabled !== false,
      updateProfileFirstLoginMode: 'on',
      trustEmail: true,
      storeToken: config.storeToken !== false,
      addReadTokenRoleOnCreate: false,
      authenticateByDefault: false,
      linkOnly: false,
      firstBrokerLoginFlowAlias: 'first broker login',
      config: {
        // OIDC Discovery (backend URL for API calls)
        useJwksUrl: 'true',
        discoveryEndpoint: discoveryUrl,

        // Manual endpoint configuration
        // HYBRID URL STRATEGY (Critical for Docker environments):
        // - authorizationUrl: PUBLIC URL (browser redirects from host machine)
        // - issuer: PUBLIC URL (must match token's 'iss' claim from frontendUrl)
        // - tokenUrl, jwksUrl, userInfoUrl, logoutUrl: INTERNAL URL (backend-to-backend via Docker network)
        //
        // Why internal URLs for backend communication:
        // - Containers cannot reach localhost:8446 (host port mapping)
        // - Must use container hostnames (e.g., gbr-keycloak-gbr-1:8443)
        // - Remote Keycloak's frontendUrl ensures it returns public issuer even when accessed internally
        authorizationUrl: `${idpBaseUrl}/realms/${idpRealm}/protocol/openid-connect/auth`,
        tokenUrl: `${backendUrl}/realms/${idpRealm}/protocol/openid-connect/token`,
        logoutUrl: `${backendUrl}/realms/${idpRealm}/protocol/openid-connect/logout`,
        userInfoUrl: `${backendUrl}/realms/${idpRealm}/protocol/openid-connect/userinfo`,
        jwksUrl: `${backendUrl}/realms/${idpRealm}/protocol/openid-connect/certs`,
        issuer: `${idpBaseUrl}/realms/${idpRealm}`,

        // OAuth credentials
        clientId,
        clientSecret,
        clientAuthMethod: 'client_secret_post',

        // Scopes - Request BOTH standard OIDC AND DIVE custom scopes
        // CRITICAL FIX (2026-01-24): Must request DIVE custom scopes for attributes to be included
        // The remote instance has protocol mappers on the federation client that map attributes to claims,
        // but those claims are only included if the corresponding scope is requested!
        // 
        // Without requesting 'countryOfAffiliation' scope:
        //   - FRA has mapper on dive-v3-broker-usa client ✅
        //   - FRA user has countryOfAffiliation attribute ✅
        //   - But mapper doesn't execute (scope not requested) ❌
        //   - Token missing countryOfAffiliation claim ❌
        //   - Hub IdP mapper has nothing to import ❌
        //
        // Fix: Request all DIVE custom scopes so remote mappers execute
        defaultScope: 'openid profile email clearance countryOfAffiliation uniqueID acpCOI dive_acr dive_amr user_acr user_amr',

        // Token validation
        // In development: disable signature validation for self-signed certs
        // In production: enable signature validation
        validateSignature: process.env.NODE_ENV === 'production' ? 'true' : 'false',
        backchannelSupported: 'false',

        // Sync mode - FORCE to always update user attributes from IdP
        syncMode: config.syncMode || 'FORCE',

        // PKCE (Proof Key for Code Exchange) - Required for security
        pkceEnabled: 'true',
        pkceMethod: 'S256',

        // UI hints
        guiOrder: '',
        hideOnLoginPage: 'false',
      },
    };

    try {
      await this.kcAdmin.identityProviders.create(idpConfig);

      logger.info('Identity Provider created successfully', {
        alias,
        displayName,
        realm: this.realm,
      });

      // Create protocol mappers for DIVE attributes
      await this.createDIVEAttributeMappers(alias);

      // Get internal ID
      const created = await this.getIdentityProvider(alias);

      return {
        alias,
        displayName,
        protocol: 'oidc',
        enabled: config.enabled !== false,
        internalId: created?.internalId || alias,
      };
    } catch (error) {
      logger.error('Failed to create Identity Provider', {
        alias,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Create protocol mappers for DIVE V3 attributes
   *
   * Maps claims from the federated IdP to user attributes:
   * - uniqueID → sub (or preferred_username)
   * - clearance → clearance
   * - countryOfAffiliation → countryOfAffiliation
   * - acpCOI → acpCOI (array)
   */
  private async createDIVEAttributeMappers(idpAlias: string): Promise<void> {
    if (!this.kcAdmin) {
      throw new Error('Keycloak Admin client not initialized');
    }

    // IdP Mappers use different structure than protocol mappers
    // identityProviderMapper is the mapper type, config contains claim mapping
    const mappers = [
      {
        name: 'uniqueID-mapper',
        identityProviderMapper: 'oidc-user-attribute-idp-mapper',
        identityProviderAlias: idpAlias,
        config: {
          'claim': 'uniqueID',
          'user.attribute': 'uniqueID',
          'syncMode': 'FORCE',  // Always update from IdP
        },
      },
      {
        name: 'clearance-mapper',
        identityProviderMapper: 'oidc-user-attribute-idp-mapper',
        identityProviderAlias: idpAlias,
        config: {
          'claim': 'clearance',
          'user.attribute': 'clearance',
          'syncMode': 'FORCE',
        },
      },
      {
        name: 'countryOfAffiliation-mapper',
        identityProviderMapper: 'oidc-user-attribute-idp-mapper',
        identityProviderAlias: idpAlias,
        config: {
          'claim': 'countryOfAffiliation',
          'user.attribute': 'countryOfAffiliation',
          'syncMode': 'FORCE',
        },
      },
      {
        name: 'acpCOI-mapper',
        identityProviderMapper: 'oidc-user-attribute-idp-mapper',
        identityProviderAlias: idpAlias,
        config: {
          'claim': 'acpCOI',
          'user.attribute': 'acpCOI',
          'syncMode': 'FORCE',
        },
      },
      {
        name: 'email-mapper',
        identityProviderMapper: 'oidc-user-attribute-idp-mapper',
        identityProviderAlias: idpAlias,
        config: {
          'claim': 'email',
          'user.attribute': 'email',
          'syncMode': 'FORCE',
        },
      },
      {
        name: 'firstName-mapper',
        identityProviderMapper: 'oidc-user-attribute-idp-mapper',
        identityProviderAlias: idpAlias,
        config: {
          'claim': 'given_name',
          'user.attribute': 'firstName',
          'syncMode': 'FORCE',
        },
      },
      {
        name: 'lastName-mapper',
        identityProviderMapper: 'oidc-user-attribute-idp-mapper',
        identityProviderAlias: idpAlias,
        config: {
          'claim': 'family_name',
          'user.attribute': 'lastName',
          'syncMode': 'FORCE',
        },
      },
      {
        name: 'username-mapper',
        identityProviderMapper: 'oidc-username-idp-mapper',
        identityProviderAlias: idpAlias,
        config: {
          'syncMode': 'FORCE',
          'template': '${CLAIM.preferred_username}',
        },
      },
    ];

    for (const mapper of mappers) {
      try {
        // Keycloak Admin Client expects the mapper object directly
        await this.kcAdmin.identityProviders.createMapper({
          alias: idpAlias,
          identityProviderMapper: mapper as any,
        });

        logger.debug('Created IdP attribute mapper', {
          idpAlias,
          mapperName: mapper.name,
          mapperType: mapper.identityProviderMapper,
        });
      } catch (error) {
        logger.warn('Failed to create IdP mapper (may already exist)', {
          idpAlias,
          mapperName: mapper.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info('DIVE IdP attribute mappers created', {
      idpAlias,
      mapperCount: mappers.length,
      mappers: mappers.map(m => m.name),
    });
  }

  /**
   * Get Identity Provider by alias
   */
  async getIdentityProvider(alias: string): Promise<{ internalId: string; config: any } | null> {
    await this.initialize();

    if (!this.kcAdmin) {
      throw new Error('Keycloak Admin client not initialized');
    }

    try {
      const idp = await this.kcAdmin.identityProviders.findOne({ alias });
      return idp ? { internalId: idp.internalId!, config: idp } : null;
    } catch (error) {
      logger.debug('Identity Provider not found', { alias });
      return null;
    }
  }

  /**
   * Update existing Identity Provider with full configuration
   * This method ensures all URL endpoints are updated when container names change
   */
  async updateIdentityProvider(alias: string, config: Partial<IFederationConfig>): Promise<void> {
    await this.initialize();

    if (!this.kcAdmin) {
      throw new Error('Keycloak Admin client not initialized');
    }

    const existing = await this.getIdentityProvider(alias);
    if (!existing) {
      throw new Error(`Identity Provider not found: ${alias}`);
    }

    // existing.config contains the full IdP configuration from Keycloak
    const existingIdp = existing.config;

    // Build complete updates including URL endpoints
    const updates: any = {
      alias: existingIdp.alias,
      providerId: existingIdp.providerId,
      enabled: config.enabled !== undefined ? config.enabled : existingIdp.enabled,
      displayName: config.displayName || existingIdp.displayName,
      config: {
        ...existingIdp.config,
      },
    };

    // Update client credentials if provided
    if (config.clientId) {
      updates.config.clientId = config.clientId;
    }
    if (config.clientSecret) {
      updates.config.clientSecret = config.clientSecret;
    }

    // Update ALL URL endpoints if idpBaseUrl or idpInternalUrl are provided
    // This ensures container name changes are reflected
    const idpBaseUrl = config.idpBaseUrl;
    const idpInternalUrl = config.idpInternalUrl || idpBaseUrl;
    const idpRealm = config.idpRealm;

    if (idpBaseUrl && idpRealm) {
      // Browser-facing URL (authorization, logout)
      updates.config.authorizationUrl = `${idpBaseUrl}/realms/${idpRealm}/protocol/openid-connect/auth`;
      updates.config.logoutUrl = `${idpBaseUrl}/realms/${idpRealm}/protocol/openid-connect/logout`;
      updates.config.issuer = `${idpBaseUrl}/realms/${idpRealm}`;
    }

    if (idpInternalUrl && idpRealm) {
      // Backend-to-backend URLs (token, userInfo, jwks)
      updates.config.tokenUrl = `${idpInternalUrl}/realms/${idpRealm}/protocol/openid-connect/token`;
      updates.config.userInfoUrl = `${idpInternalUrl}/realms/${idpRealm}/protocol/openid-connect/userinfo`;
      updates.config.jwksUrl = `${idpInternalUrl}/realms/${idpRealm}/protocol/openid-connect/certs`;
    }

    await this.kcAdmin.identityProviders.update({ alias }, updates);

    logger.info('Identity Provider updated with full configuration', {
      alias,
      hasBaseUrl: !!idpBaseUrl,
      hasInternalUrl: !!idpInternalUrl,
      realm: idpRealm,
    });
  }

  /**
   * Delete Identity Provider
   */
  async deleteIdentityProvider(alias: string): Promise<void> {
    await this.initialize();

    if (!this.kcAdmin) {
      throw new Error('Keycloak Admin client not initialized');
    }

    await this.kcAdmin.identityProviders.del({ alias });

    logger.info('Identity Provider deleted', { alias });
  }

  /**
   * List all Identity Providers in the realm
   */
  async listIdentityProviders(): Promise<Array<{ alias: string; displayName: string; enabled: boolean; protocol: string }>> {
    await this.initialize();

    if (!this.kcAdmin) {
      throw new Error('Keycloak Admin client not initialized');
    }

    const idps = await this.kcAdmin.identityProviders.find();

    return idps.map((idp) => ({
      alias: idp.alias!,
      displayName: idp.displayName || idp.alias!,
      enabled: idp.enabled || false,
      protocol: idp.providerId || 'unknown',
    }));
  }

  /**
   * Create bidirectional federation between two instances
   *
   * TRUE BIDIRECTIONAL: Creates IdPs in BOTH Keycloak instances.
   *
   * Direction 1 (Local → Remote): Create remote-idp in local Keycloak
   * Direction 2 (Remote → Local): Create local-idp in remote Keycloak
   *
   * Example: USA ↔ GBR
   *   - Creates gbr-idp in USA Hub Keycloak
   *   - Creates usa-idp in GBR Spoke Keycloak
   *
   * Result: Users from both instances can authenticate at either instance
   */
  async createBidirectionalFederation(options: {
    localInstanceCode: string;
    remoteInstanceCode: string;
    remoteName: string;
    remoteIdpUrl: string;
    remoteRealm: string;
    localName?: string;           // NEW: For reverse IdP display name
    localIdpUrl?: string;         // NEW: For reverse IdP endpoint
    localRealm?: string;          // NEW: For reverse IdP realm
    remoteKeycloakAdminUrl?: string;  // NEW: Remote Keycloak Admin API
    remoteKeycloakAdminPassword?: string;  // NEW: Remote admin password
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
    // Pattern: dive-v3-broker-{country_code} - matches realm naming convention
    // - Direction 1 (lva-idp in Hub): Hub authenticates with LVA → uses client on LVA for Hub (dive-v3-broker-usa)
    // - Direction 2 (usa-idp in LVA): LVA authenticates with Hub → uses client on Hub for LVA (dive-v3-broker-lva)
    const clientForLocalToRemote = `dive-v3-broker-${localInstanceCode.toLowerCase()}`;  // Client on remote Keycloak
    const clientForRemoteToLocal = `dive-v3-broker-${remoteInstanceCode.toLowerCase()}`; // Client on local Keycloak

    logger.info('Creating TRUE bidirectional federation', {
      localInstanceCode,
      remoteInstanceCode,
      remoteName,
      remoteIdpUrl,
    });

    // Get federation secret (same for both directions)
    const federationSecret = await this.getFederationSecret(localInstanceCode, remoteInstanceCode);

    // ============================================
    // STEP 0: Ensure remote Keycloak has frontendUrl set
    // ============================================
    // CRITICAL: This ensures the remote Keycloak always returns the public issuer,
    // even when accessed via internal Docker hostname
    if (options.remoteKeycloakAdminPassword) {
      const adminUrl = options.remoteKeycloakAdminUrl || remoteIdpUrl;
      await this.ensureRemoteFrontendUrl(
        adminUrl,
        remoteRealm,
        options.remoteKeycloakAdminPassword,
        remoteIdpUrl // Public URL to use as frontend
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
    const remoteInternalUrl = options.remoteKeycloakAdminUrl || this.getInternalKeycloakUrl(remoteInstanceCode, remoteIdpUrl);

    // Direction 1: Create IdP in local Keycloak to authenticate with remote
    // The client used here must exist on the REMOTE Keycloak (e.g., dive-v3-broker-usa on LVA)
    // This client is created when the remote spoke registers with the Hub
    const localResult = await this.createOIDCIdentityProvider({
      alias: remoteAlias,
      displayName: remoteName,
      instanceCode: remoteInstanceCode,
      idpBaseUrl: remoteIdpUrl,        // Public URL for browser
      idpInternalUrl: remoteInternalUrl, // Internal URL for backend
      idpRealm: remoteRealm,
      protocol: 'oidc',
      clientId: clientForLocalToRemote,  // Client on remote Keycloak for local users
      clientSecret: federationSecret,
      enabled: true,
      storeToken: true,
      syncMode: 'FORCE',  // Use FORCE to update user attributes from IdP on each login
    });

    logger.info('Direction 1 complete: Remote IdP created in local Keycloak', {
      localInstanceCode,
      remoteAlias,
      remoteName,
    });

    // ============================================
    // DIRECTION 2: Create local IdP in REMOTE Keycloak
    // ============================================

    // Determine local instance details
    const localName = options.localName || this.getInstanceName(localInstanceCode);
    const localIdpUrl = options.localIdpUrl || this.getLocalIdpUrl();
    const localRealm = options.localRealm || this.getLocalRealmName(localInstanceCode);

    logger.info('Direction 2: Creating local IdP in remote Keycloak', {
      remoteInstanceCode,
      localInstanceCode,
      localName,
      localIdpUrl,
      localRealm,
    });

    try {
      // Use remoteKeycloakAdminUrl if provided, otherwise use remoteIdpUrl
      const adminUrl = options.remoteKeycloakAdminUrl || remoteIdpUrl;

      logger.debug('Connecting to remote Keycloak Admin API', {
        adminUrl,
        remoteIdpUrl,
        usesSeparateAdminUrl: !!options.remoteKeycloakAdminUrl,
      });

      // Create separate Keycloak Admin client for REMOTE instance
      const remoteKeycloakService = await this.createRemoteKeycloakClient(
        adminUrl,  // Use admin URL for API connection
        remoteRealm,
        options.remoteKeycloakAdminPassword
      );

      // CRITICAL: Ensure the client for Hub users exists on the spoke
      // e.g., dive-v3-broker-usa on LVA Keycloak for USA Hub users
      logger.info('Ensuring client exists on remote Keycloak for local users', {
        clientId: clientForLocalToRemote,
        targetRealm: remoteRealm,
      });
      await remoteKeycloakService.ensureFederationClient(
        clientForLocalToRemote,
        federationSecret,
        localIdpUrl,  // Hub's public URL for redirect
        this.realm    // Hub's realm for broker endpoint
      );

      // CRITICAL: Ensure the client for spoke users exists on the Hub (local)
      // e.g., dive-v3-broker-lva on Hub Keycloak for LVA spoke users
      logger.info('Ensuring client exists on local Keycloak for remote users', {
        clientId: clientForRemoteToLocal,
        targetRealm: this.realm,
      });
      await this.ensureFederationClient(
        clientForRemoteToLocal,
        federationSecret,
        remoteIdpUrl,  // Spoke's public URL for redirect
        remoteRealm    // Spoke's realm for broker endpoint
      );

      const localAlias = `${localInstanceCode.toLowerCase()}-idp`;

      // Determine local internal URL for backend communication
      const localInternalUrl = this.getInternalKeycloakUrl(localInstanceCode, localIdpUrl);

      // Direction 2: Create IdP in remote Keycloak to authenticate with local
      // The client used here must exist on the LOCAL Keycloak (e.g., dive-v3-broker-lva on Hub)
      // This client was created when the spoke registered with the Hub
      const remoteResult = await remoteKeycloakService.createOIDCIdentityProvider({
        alias: localAlias,
        displayName: localName,
        instanceCode: localInstanceCode,
        idpBaseUrl: localIdpUrl,           // Public URL for browser
        idpInternalUrl: localInternalUrl,  // Internal URL for backend
        idpRealm: localRealm,
        protocol: 'oidc',
        clientId: clientForRemoteToLocal,  // Client on local Keycloak for remote users
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
        warning: 'Federation is UNIDIRECTIONAL - only local→remote works',
      });

      // Return partial success with remote as undefined
      // This maintains backward compatibility if remote creation fails
      throw new Error(
        `Bidirectional federation partially failed. ` +
        `Local IdP (${remoteAlias}) created successfully, but failed to create ` +
        `remote IdP (${localInstanceCode.toLowerCase()}-idp) in ${remoteInstanceCode}: ` +
        `${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get internal Keycloak URL for backend-to-backend communication
   *
   * In local development: uses Docker container names (e.g., gbr-keycloak-gbr-1:8443)
   * In production: uses external domains (same as public URL)
   */
  private getInternalKeycloakUrl(instanceCode: string, publicUrl: string): string {
    const env = process.env.NODE_ENV || 'development';
    const code = instanceCode.toUpperCase();

    if (env === 'development' || env === 'local') {
      // Local development: use Docker container names for internal communication
      // Container naming convention: dive-spoke-{code}-keycloak (or dive-hub-keycloak for USA)
      let internalUrl: string;

      if (code === 'USA') {
        // USA Hub uses dive-hub-keycloak with HTTPS on port 8443
        internalUrl = 'https://dive-hub-keycloak:8443';
      } else {
        // All spokes use dive-spoke-{code}-keycloak with HTTPS on 8443
        internalUrl = `https://dive-spoke-${code.toLowerCase()}-keycloak:8443`;
      }

      logger.debug('Using internal Docker URL for backend communication', {
        instanceCode: code,
        publicUrl,
        internalUrl,
      });
      return internalUrl;
    }

    // Production or unknown instance: use public URL for everything
    logger.debug('Using public URL for backend communication (production mode)', {
      instanceCode: code,
      publicUrl,
    });
    return publicUrl;
  }

  /**
   * Create Keycloak Admin client for remote instance
   *
   * This allows us to create IdPs in the remote Keycloak, not just local.
   * For local development, tries common passwords.
   *
   * Environment-aware:
   * - Local dev: Uses Docker internal URLs (gbr-keycloak-gbr-1:8443)
   * - Production: Uses external domains (gbr-idp.dive25.com)
   */
  private async createRemoteKeycloakClient(
    remoteIdpUrl: string,
    remoteRealm: string,
    remoteAdminPassword?: string
  ): Promise<KeycloakFederationService> {
    // Extract base URL from IdP URL (remove /realms/... path)
    const baseUrl = remoteIdpUrl.replace(/\/realms\/.*$/, '');

    // Get admin credentials
    // KEYCLOAK 26+ UPDATE: Use KC_BOOTSTRAP_ADMIN_USERNAME (new standard)
    const adminUsername = process.env.KC_BOOTSTRAP_ADMIN_USERNAME 
                       || process.env.KEYCLOAK_ADMIN 
                       || 'admin';

    // Determine password based on environment
    const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

    let passwordsToTry: string[];

    if (isDevelopment) {
      // Local dev: Try multiple common passwords (Keycloak 26+ and legacy)
      // Extract instance code from realm for instance-specific passwords
      const instanceCode = remoteRealm.replace('dive-v3-broker-', '').toUpperCase();
      
      passwordsToTry = [
        remoteAdminPassword,
        process.env[`KC_BOOTSTRAP_ADMIN_PASSWORD_${instanceCode}`],
        process.env[`KEYCLOAK_ADMIN_PASSWORD_${instanceCode}`],
        process.env.KC_BOOTSTRAP_ADMIN_PASSWORD_USA, // Hub
        process.env.KC_BOOTSTRAP_ADMIN_PASSWORD,
        process.env.KEYCLOAK_ADMIN_PASSWORD,
        'admin',  // Default for local dev
      ].filter(Boolean) as string[];
    } else {
      // Production: Only use provided password (no fallbacks!)
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

    // Try each password until one works
    for (const password of passwordsToTry) {
      try {
        const remoteService = new KeycloakFederationService(remoteRealm);

        remoteService.kcAdmin = new KcAdminClient({
          baseUrl,
          realmName: 'master',
          requestOptions: {
            /* @ts-expect-error - httpsAgent is supported by node-fetch */
            httpsAgent, // Accept self-signed certs
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

    // If all passwords failed
    throw new Error(
      `Could not authenticate to remote Keycloak at ${baseUrl}. ` +
      `Tried ${passwordsToTry.length} password(s). ` +
      `Ensure KC_BOOTSTRAP_ADMIN_PASSWORD_{CODE} or KEYCLOAK_ADMIN_PASSWORD_{CODE} (legacy) is set or configure GCP Secret Manager.`
    );
  }

  /**
   * Get instance display name by code
   */
  private getInstanceName(instanceCode: string): string {
    const names: Record<string, string> = {
      'USA': 'United States',
      'FRA': 'France',
      'GBR': 'United Kingdom',
      'DEU': 'Germany',
      'CAN': 'Canada',
    };
    return names[instanceCode.toUpperCase()] || instanceCode;
  }

  /**
   * Get local IdP URL from environment
   */
  private getLocalIdpUrl(): string {
    // Try environment variable first
    if (process.env.KEYCLOAK_PUBLIC_URL) {
      return process.env.KEYCLOAK_PUBLIC_URL;
    }

    // Fallback: construct from KEYCLOAK_URL
    const keycloakUrl = process.env.KEYCLOAK_URL || 'https://localhost:8443';

    // For local development, map internal URLs to external
    if (keycloakUrl.includes('keycloak:')) {
      // Container name → localhost mapping
      const instance = (process.env.INSTANCE_CODE || 'USA').toUpperCase();
      const portMap: Record<string, string> = {
        'USA': '8081',
        'FRA': '8444',
        'GBR': '8446',
        'DEU': '8447',
      };
      const port = portMap[instance] || '8443';
      return `https://localhost:${port}`;
    }

    return keycloakUrl;
  }

  /**
   * Get local realm name by instance code
   */
  private getLocalRealmName(instanceCode: string): string {
    const code = instanceCode.toLowerCase();

    // USA uses base realm name, others have suffix
    if (code === 'usa') {
      return 'dive-v3-broker';
    }

    return `dive-v3-broker-${code}`;
  }

  /**
   * Ensure remote Keycloak realm has frontendUrl set
   *
   * CRITICAL: This forces the remote realm to always return the public issuer URL,
   * regardless of whether it's accessed via internal Docker hostname or public URL.
   *
   * Why this matters:
   * - When USA Hub contacts GBR via internal hostname (gbr-keycloak-gbr-1:8443),
   *   GBR would normally return issuer: https://gbr-keycloak-gbr-1:8443/realms/...
   * - But USA Hub expects issuer: https://localhost:8446/realms/...
   * - By setting frontendUrl, GBR ALWAYS returns the public URL as issuer
   *
   * This enables the hybrid strategy:
   * - Backend communication: Internal hostnames (fast, Docker network)
   * - Token validation: Public issuer (consistent, matches browser flow)
   */
  private async ensureRemoteFrontendUrl(
    remoteKeycloakUrl: string,
    remoteRealm: string,
    remoteAdminPassword: string,
    publicFrontendUrl: string
  ): Promise<void> {
    try {
      const KcAdminClient = (await import('@keycloak/keycloak-admin-client')).default;
      const remoteAdmin = new KcAdminClient({
        baseUrl: remoteKeycloakUrl,
        realmName: 'master',
        requestOptions: {
          /* @ts-expect-error - httpsAgent is supported by node-fetch */
          httpsAgent, // Accept self-signed certs
        },
      });

      await remoteAdmin.auth({
        username: 'admin',
        password: remoteAdminPassword,
        grantType: 'password',
        clientId: 'admin-cli',
      });

      // Get current realm config
      const realm = await remoteAdmin.realms.findOne({ realm: remoteRealm });
      if (!realm) {
        logger.warn('Remote realm not found, cannot set frontendUrl', { remoteRealm });
        return;
      }

      // Set frontendUrl if not already set or different
      const currentFrontendUrl = realm.attributes?.frontendUrl;
      if (currentFrontendUrl !== publicFrontendUrl) {
        await remoteAdmin.realms.update(
          { realm: remoteRealm },
          {
            ...realm,
            attributes: {
              ...realm.attributes,
              frontendUrl: publicFrontendUrl,
            },
          }
        );
        logger.info('Set frontendUrl on remote Keycloak realm for consistent issuer', {
          remoteRealm,
          frontendUrl: publicFrontendUrl,
          reason: 'Ensures public issuer is returned even when accessed via internal hostname',
        });
      } else {
        logger.debug('Remote frontendUrl already correctly set', {
          remoteRealm,
          frontendUrl: currentFrontendUrl,
        });
      }
    } catch (error) {
      logger.warn('Failed to set frontendUrl on remote Keycloak (non-fatal, but may cause issuer mismatch)', {
        remoteRealm,
        publicFrontendUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
        impact: 'Token validation may fail if issuer does not match',
      });
    }
  }

  /**
   * Get or create federation client secret
   *
   * Secrets are stored in GCP Secret Manager:
   * Format: dive-v3-federation-{from}-{to}
   * Example: dive-v3-federation-usa-gbr
   */
  private async getFederationSecret(fromInstance: string, toInstance: string): Promise<string> {
    const from = fromInstance.toLowerCase();
    const to = toInstance.toLowerCase();

    // Federation secrets are bidirectional, use alphabetical order for consistency
    const instances = [from, to].sort();
    const secretName = `federation-${instances[0]}-${instances[1]}`;

    try {
      // Try to get secret from GCP (if USE_GCP_SECRETS is enabled)
      if (process.env.USE_GCP_SECRETS === 'true') {
        const { getSecret } = await import('../utils/gcp-secrets');
        const secret = await getSecret(secretName as any);
        if (secret) {
          logger.debug('Retrieved federation secret from GCP', { secretName });
          return secret;
        }
      }
    } catch (error) {
      logger.warn('Federation secret not found in GCP, using fallback', {
        secretName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Fallback: Use env var only (no hardcoded defaults)
    const envSecret = process.env.CROSS_BORDER_CLIENT_SECRET;
    if (envSecret && envSecret.length >= 16) {
      logger.debug('Using CROSS_BORDER_CLIENT_SECRET from environment', { secretName });
      return envSecret;
    }

    // FAIL FAST: No hardcoded fallbacks - security requirement
    const errorMessage = `FATAL: Federation secret not found for ${secretName}.\n` +
      `Required: Configure secret in one of:\n` +
      `  1. GCP Secret Manager: ${secretName} (project: dive25)\n` +
      `  2. Environment variable: CROSS_BORDER_CLIENT_SECRET\n\n` +
      `To create the secret:\n` +
      `  gcloud secrets create ${secretName} --project=dive25\n` +
      `  echo -n "$(openssl rand -base64 32)" | gcloud secrets versions add ${secretName} --data-file=-`;

    logger.error('Federation secret not available - failing fast', {
      secretName,
      message: 'No hardcoded fallbacks allowed'
    });

    throw new Error(errorMessage);
  }
}

// Singleton instance
export const keycloakFederationService = new KeycloakFederationService();
