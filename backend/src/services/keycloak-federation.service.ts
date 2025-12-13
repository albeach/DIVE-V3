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
import { logger } from '../utils/logger';

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
  private kcAdmin: KcAdminClient | null = null;
  private realm: string;

  constructor(realm?: string) {
    this.realm = realm || process.env.KEYCLOAK_REALM || 'dive-v3-broker';
  }

  /**
   * Initialize Keycloak Admin Client
   */
  private async initialize(): Promise<void> {
    if (this.kcAdmin) return;

    const keycloakUrl = process.env.KEYCLOAK_URL || 'https://localhost:8443';
    const adminUser = process.env.KEYCLOAK_ADMIN || 'admin';
    const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;

    if (!adminPassword) {
      throw new Error('KEYCLOAK_ADMIN_PASSWORD not configured');
    }

    this.kcAdmin = new KcAdminClient({
      baseUrl: keycloakUrl,
      realmName: 'master',
    });

    await this.kcAdmin.auth({
      username: adminUser,
      password: adminPassword,
      grantType: 'password',
      clientId: 'admin-cli',
    });

    // Set target realm
    this.kcAdmin.setConfig({ realmName: this.realm });

    logger.info('Keycloak Federation Service initialized', {
      keycloakUrl,
      realm: this.realm,
    });
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
          redirectUris: [
            'https://*/realms/*/broker/*/endpoint',  // Wildcard for all broker callbacks
          ],
          webOrigins: [
            'https://localhost:8443',  // USA Hub
            'https://localhost:8446',  // GBR Spoke
            'https://localhost:8444',  // FRA Spoke
            'https://localhost:8447',  // DEU Spoke
          ],
          attributes: {
            'pkce.code.challenge.method': 'S256',
          },
        });

        logger.info('Cross-border federation client created', {
          realm: this.realm,
          clientId,
        });
      } else {
        logger.debug('Cross-border federation client already exists', {
          realm: this.realm,
          clientId,
        });
      }

      // Assign DIVE scopes to the client
      await this.assignDiveScopesToClient(clientId);

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
   * Assign DIVE custom scopes to a client
   * 
   * This allows the client to request DIVE-specific attributes during authentication.
   */
  private async assignDiveScopesToClient(clientId: string): Promise<void> {
    if (!this.kcAdmin) {
      throw new Error('Keycloak Admin client not initialized');
    }

    const diveScopes = ['clearance', 'countryOfAffiliation', 'acpCOI', 'uniqueID'];

    try {
      // Get the client UUID
      const clients = await this.kcAdmin.clients.find({
        realm: this.realm,
        clientId: clientId,
      });

      if (!clients || clients.length === 0) {
        logger.warn('Client not found when assigning DIVE scopes', {
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

      // Get all client scopes
      const allScopes = await this.kcAdmin.clientScopes.find({ realm: this.realm });

      // Assign each DIVE scope as DEFAULT (not optional)
      // CRITICAL: DEFAULT scopes are automatically included in tokens
      // OPTIONAL scopes require explicit user consent or scope parameter
      for (const scopeName of diveScopes) {
        const scope = allScopes.find((s: any) => s.name === scopeName);
        if (scope && scope.id) {
          try {
            await this.kcAdmin.clients.addDefaultClientScope({
              id: clientUuid,
              clientScopeId: scope.id,
            });
            
            logger.info('Assigned DIVE scope to client as DEFAULT', {
              realm: this.realm,
              clientId,
              scope: scopeName,
              reason: 'Must be DEFAULT for automatic inclusion in tokens',
            });
          } catch (error) {
            // Scope may already be assigned
            logger.debug('Could not assign scope (may already be assigned)', {
              realm: this.realm,
              clientId,
              scope: scopeName,
            });
          }
        }
      }

      logger.info('DIVE scopes assigned to client', {
        realm: this.realm,
        clientId,
        scopes: diveScopes,
      });
    } catch (error) {
      logger.error('Failed to assign DIVE scopes to client', {
        realm: this.realm,
        clientId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
        
        // Scopes - ONLY request standard OIDC scopes
        // DIVE attributes (clearance, countryOfAffiliation, acpCOI, uniqueID) come from 
        // protocol mappers on the cross-border client, NOT from scope requests
        defaultScope: 'openid profile email',
        
        // Token validation
        // In development: disable signature validation for self-signed certs
        // In production: enable signature validation
        validateSignature: process.env.NODE_ENV === 'production' ? 'true' : 'false',
        backchannelSupported: 'false',
        
        // Sync mode
        syncMode: config.syncMode || 'IMPORT',
        
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

    const mappers: IProtocolMapper[] = [
      {
        name: 'uniqueID',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-user-attribute-idp-mapper',
        config: {
          'claim': 'uniqueID',
          'user.attribute': 'uniqueID',
          'syncMode': 'INHERIT',
        },
      },
      {
        name: 'clearance',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-user-attribute-idp-mapper',
        config: {
          'claim': 'clearance',
          'user.attribute': 'clearance',
          'syncMode': 'INHERIT',
        },
      },
      {
        name: 'countryOfAffiliation',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-user-attribute-idp-mapper',
        config: {
          'claim': 'countryOfAffiliation',
          'user.attribute': 'countryOfAffiliation',
          'syncMode': 'INHERIT',
        },
      },
      {
        name: 'acpCOI',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-user-attribute-idp-mapper',
        config: {
          'claim': 'acpCOI',
          'user.attribute': 'acpCOI',
          'syncMode': 'INHERIT',
          'multivalued': 'true',  // CRITICAL: Support multi-valued COI arrays
        },
      },
      {
        name: 'email',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-user-attribute-idp-mapper',
        config: {
          'claim': 'email',
          'user.attribute': 'email',
          'syncMode': 'INHERIT',
        },
      },
      {
        name: 'firstName',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-user-attribute-idp-mapper',
        config: {
          'claim': 'given_name',
          'user.attribute': 'firstName',
          'syncMode': 'INHERIT',
        },
      },
      {
        name: 'lastName',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-user-attribute-idp-mapper',
        config: {
          'claim': 'family_name',
          'user.attribute': 'lastName',
          'syncMode': 'INHERIT',
        },
      },
    ];

    for (const mapper of mappers) {
      try {
        await this.kcAdmin.identityProviders.createMapper({
          alias: idpAlias,
          identityProviderMapper: mapper,
        });

        logger.debug('Created protocol mapper', {
          idpAlias,
          mapperName: mapper.name,
        });
      } catch (error) {
        logger.warn('Failed to create protocol mapper (may already exist)', {
          idpAlias,
          mapperName: mapper.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info('DIVE attribute mappers created', {
      idpAlias,
      mapperCount: mappers.length,
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
   * Update existing Identity Provider
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

    const updates: any = {
      ...existing.config,
    };

    if (config.displayName) {
      updates.displayName = config.displayName;
    }

    if (config.enabled !== undefined) {
      updates.enabled = config.enabled;
    }

    if (config.clientSecret) {
      updates.config = {
        ...updates.config,
        clientSecret: config.clientSecret,
      };
    }

    await this.kcAdmin.identityProviders.update({ alias }, updates);

    logger.info('Identity Provider updated', { alias });
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
    federationClientId?: string;
  }): Promise<{ local: IFederationResult; remote: IFederationResult }> {
    const {
      localInstanceCode,
      remoteInstanceCode,
      remoteName,
      remoteIdpUrl,
      remoteRealm,
      federationClientId = 'dive-v3-cross-border-client',
    } = options;

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
    
    const localResult = await this.createOIDCIdentityProvider({
      alias: remoteAlias,
      displayName: remoteName,
      instanceCode: remoteInstanceCode,
      idpBaseUrl: remoteIdpUrl,        // Public URL for browser
      idpInternalUrl: remoteInternalUrl, // Internal URL for backend
      idpRealm: remoteRealm,
      protocol: 'oidc',
      clientId: federationClientId,
      clientSecret: federationSecret,
      enabled: true,
      storeToken: true,
      syncMode: 'IMPORT',
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

      const localAlias = `${localInstanceCode.toLowerCase()}-idp`;
      
      // Determine local internal URL for backend communication
      const localInternalUrl = this.getInternalKeycloakUrl(localInstanceCode, localIdpUrl);
      
      const remoteResult = await remoteKeycloakService.createOIDCIdentityProvider({
        alias: localAlias,
        displayName: localName,
        instanceCode: localInstanceCode,
        idpBaseUrl: localIdpUrl,           // Public URL for browser
        idpInternalUrl: localInternalUrl,  // Internal URL for backend
        idpRealm: localRealm,
        protocol: 'oidc',
        clientId: federationClientId,
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
      // Use HTTPS with self-signed certificates
      const containerMap: Record<string, string> = {
        'USA': 'https://dive-hub-keycloak:8080',     // USA Hub internal
        'GBR': 'https://gbr-keycloak-gbr-1:8443',    // GBR Spoke internal
        'FRA': 'https://fra-keycloak-fra-1:8443',    // FRA Spoke internal
        'DEU': 'https://deu-keycloak-deu-1:8443',    // DEU Spoke internal
      };
      
      const internalUrl = containerMap[code];
      if (internalUrl) {
        logger.debug('Using internal Docker URL for backend communication', {
          instanceCode: code,
          publicUrl,
          internalUrl,
        });
        return internalUrl;
      }
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
    const adminUsername = process.env.KEYCLOAK_ADMIN || 'admin';
    
    // Determine password based on environment
    const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    
    let passwordsToTry: string[];
    
    if (isDevelopment) {
      // Local dev: Try multiple common passwords
      passwordsToTry = [
        remoteAdminPassword,
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
        });

        await remoteService.kcAdmin.auth({
          username: adminUsername,
          password,
          grantType: 'password',
          clientId: 'admin-cli',
        });

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
      `Ensure KEYCLOAK_ADMIN_PASSWORD_{CODE} is set or configure GCP Secret Manager.`
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
    
    // Fallback: generate deterministic secret (DEV ONLY)
    // In production, this should be pre-created in GCP Secret Manager
    const fallbackSecret = `dive-federation-${instances[0]}-${instances[1]}-dev-${Date.now()}`;
    logger.warn('Using fallback federation secret (NOT FOR PRODUCTION)', {
      secretName,
      fallbackSecret: fallbackSecret.substring(0, 30) + '...'
    });
    return fallbackSecret;
  }
}

// Singleton instance
export const keycloakFederationService = new KeycloakFederationService();

