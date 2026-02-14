/**
 * Federation Client Setup
 *
 * Manages Keycloak client scopes, cross-border federation clients,
 * and protocol mappers for DIVE V3 federation.
 *
 * Extracted from keycloak-federation.service.ts (Phase 4C decomposition).
 *
 * @module federation-client-setup
 */

import type KcAdminClient from '@keycloak/keycloak-admin-client';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

/**
 * Keycloak context for extracted functions.
 * Provides the initialized admin client and target realm.
 */
export interface KeycloakContext {
  kcAdmin: KcAdminClient;
  realm: string;
}

/**
 * NATO country port offsets for federation client redirect URIs.
 * Each country has a unique offset: frontend = 3000 + offset, backend = 4000 + offset, keycloak = 8443 + offset.
 */
export const NATO_PORT_OFFSETS: Record<string, number> = {
  'USA': 0, 'ALB': 1, 'BEL': 2, 'BGR': 3, 'CAN': 4, 'HRV': 5, 'CZE': 6, 'DNK': 7,
  'EST': 8, 'FIN': 9, 'FRA': 10, 'DEU': 11, 'GRC': 12, 'HUN': 13, 'ISL': 14,
  'ITA': 15, 'LVA': 16, 'LTU': 17, 'LUX': 18, 'MNE': 19, 'NLD': 20, 'MKD': 21,
  'NOR': 22, 'POL': 23, 'PRT': 24, 'ROU': 25, 'SVK': 26, 'SVN': 27, 'ESP': 28,
  'SWE': 29, 'TUR': 30, 'GBR': 31,
};

// ============================================
// CLIENT SCOPE MANAGEMENT
// ============================================

/**
 * Ensure DIVE custom client scopes exist in the realm.
 *
 * Required scopes: clearance, countryOfAffiliation, acpCOI, uniqueID.
 * These allow the USA Hub's IdP to request DIVE-specific attributes.
 */
export async function ensureDiveClientScopes(ctx: KeycloakContext): Promise<void> {
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
      const existingScopes = await ctx.kcAdmin.clientScopes.find({ realm: ctx.realm });
      const exists = existingScopes.find((s: any) => s.name === scopeConfig.name);

      if (!exists) {
        // Create the scope
        await ctx.kcAdmin.clientScopes.create({
          realm: ctx.realm,
          name: scopeConfig.name,
          description: scopeConfig.description,
          protocol: scopeConfig.protocol,
          attributes: scopeConfig.attributes,
        });

        logger.info('Created DIVE client scope', {
          realm: ctx.realm,
          scope: scopeConfig.name,
        });
      } else {
        logger.debug('DIVE client scope already exists', {
          realm: ctx.realm,
          scope: scopeConfig.name,
        });
      }

      // Add protocol mapper to the scope (if it doesn't have one)
      await ensureProtocolMapperForScope(ctx, scopeConfig.name);

    } catch (error) {
      logger.warn('Failed to create DIVE client scope (may already exist)', {
        realm: ctx.realm,
        scope: scopeConfig.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Ensure a client scope has a protocol mapper to include user attributes in tokens.
 *
 * CRITICAL: Configuration for each attribute type:
 * - Single-valued (clearance, countryOfAffiliation, uniqueID):
 *   aggregate.attrs=true, multivalued=false, jsonType=String
 * - Multi-valued (acpCOI):
 *   multivalued=true, jsonType=String (NO aggregate.attrs)
 *   Keycloak v26+ requires User Profile attribute to have multivalued=true
 */
export async function ensureProtocolMapperForScope(ctx: KeycloakContext, scopeName: string): Promise<void> {
  try {
    // Get the scope
    const scopes = await ctx.kcAdmin.clientScopes.find({ realm: ctx.realm });
    const scope = scopes.find((s: any) => s.name === scopeName);

    if (!scope || !scope.id) {
      logger.warn('Client scope not found for protocol mapper', { scopeName });
      return;
    }

    // Check if mapper already exists
    const existingMappers = await ctx.kcAdmin.clientScopes.listProtocolMappers({
      id: scope.id,
      realm: ctx.realm
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

    await ctx.kcAdmin.clientScopes.addProtocolMapper({
      id: scope.id,
      realm: ctx.realm
    }, {
      name: `${scopeName}-mapper`,
      protocol: 'openid-connect',
      protocolMapper: 'oidc-usermodel-attribute-mapper',
      config: mapperConfig,
    });

    logger.info('Created protocol mapper for DIVE scope', {
      realm: ctx.realm,
      scopeName,
      mapperType: 'oidc-usermodel-attribute-mapper',
      isMultiValued,
      config: isMultiValued ? 'multivalued=true' : 'aggregate.attrs=true, multivalued=false',
    });

  } catch (error) {
    logger.warn('Failed to create protocol mapper (may already exist)', {
      realm: ctx.realm,
      scopeName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================
// CROSS-BORDER CLIENT MANAGEMENT
// ============================================

/**
 * Ensure cross-border federation client exists in the realm.
 *
 * This client is used by OTHER instances' Keycloak brokers when federating TO this instance.
 * Example: USA Hub's gbr-idp uses this client to connect to GBR Keycloak.
 */
export async function ensureCrossBorderClient(ctx: KeycloakContext, clientId: string, clientSecret: string): Promise<void> {
  try {
    // Check if client exists
    const existingClients = await ctx.kcAdmin.clients.find({
      realm: ctx.realm,
      clientId: clientId,
    });

    if (!existingClients || existingClients.length === 0) {
      // Create the client
      logger.info('Creating cross-border federation client', {
        realm: ctx.realm,
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

      await ctx.kcAdmin.clients.create({
        realm: ctx.realm,
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
        realm: ctx.realm,
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

        await ctx.kcAdmin.clients.update(
          { realm: ctx.realm, id: existingClient.id },
          {
            redirectUris,
            webOrigins: ['+'],
          }
        );
        logger.info('Cross-border federation client redirect URIs updated', {
          realm: ctx.realm,
          clientId,
        });
      }
    }

    // DISABLED: Scopes now managed by Terraform SSOT (main.tf incoming_federation_defaults)
    // Runtime assignment removed to avoid race conditions with Terraform-managed resources
    // See: terraform/modules/federated-instance/main.tf and dive-client-scopes.tf

  } catch (error) {
    logger.error('Failed to ensure cross-border client', {
      realm: ctx.realm,
      clientId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

// ============================================
// PROTOCOL MAPPER MANAGEMENT
// ============================================

/**
 * Ensure protocol mappers exist on a federation client.
 *
 * CRITICAL: Without these mappers, the client won't include user attributes in tokens.
 * Protocol mappers tell Keycloak which user attributes to include in JWT tokens.
 */
export async function ensureProtocolMappersForClient(ctx: KeycloakContext, clientId: string): Promise<void> {
  try {
    // Get the client UUID
    const clients = await ctx.kcAdmin.clients.find({
      realm: ctx.realm,
      clientId: clientId,
    });

    if (!clients || clients.length === 0) {
      logger.warn('Client not found when ensuring protocol mappers', {
        realm: ctx.realm,
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
      const existingMappers = await ctx.kcAdmin.clients.listProtocolMappers({
        id: clientUuid,
        realm: ctx.realm,
      });

      const mapperExists = existingMappers.some((m: any) => m.name === mapperName);

      if (mapperExists) {
        logger.debug('Protocol mapper already exists', { clientId, mapperName });
        continue;
      }

      // Determine if multivalued (acpCOI and amr are arrays)
      const multivalued = (attr === 'acpCOI' || attr === 'amr');

      // Create the protocol mapper
      await ctx.kcAdmin.clients.addProtocolMapper(
        { id: clientUuid, realm: ctx.realm },
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
        realm: ctx.realm,
        clientId,
        mapperName,
        attribute: attr,
        multivalued,
      });
    }

    if (created > 0) {
      logger.info('Protocol mappers ensured for federation client', {
        realm: ctx.realm,
        clientId,
        created,
        total: standardAttrs.length,
      });
    } else {
      logger.debug('All protocol mappers already exist for client', {
        realm: ctx.realm,
        clientId,
      });
    }
  } catch (error) {
    logger.error('Failed to ensure protocol mappers for client', {
      realm: ctx.realm,
      clientId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Don't throw - non-critical if mappers can't be created
  }
}

// ============================================
// FEDERATION CLIENT SETUP
// ============================================

/**
 * Ensure a country-specific federation client exists on this realm.
 *
 * Creates clients like dive-v3-broker-usa on a spoke Keycloak
 * for Hub users authenticating via federation.
 *
 * @param ctx - Initialized Keycloak context
 * @param clientId - The client ID (e.g., dive-v3-broker-usa)
 * @param clientSecret - The shared secret for the client
 * @param partnerIdpUrl - The partner's public Keycloak URL (for redirect URIs)
 * @param partnerRealm - The partner's realm name (for broker endpoint)
 */
export async function ensureFederationClientCore(
  ctx: KeycloakContext,
  clientId: string,
  clientSecret: string,
  partnerIdpUrl: string,
  partnerRealm: string
): Promise<void> {
  // Extract instance code from clientId (e.g., dive-v3-broker-usa -> usa)
  const instanceCode = clientId.replace('dive-v3-broker-', '').toUpperCase();

  // Get the frontend port for this instance from the NATO database port offsets
  const offset = NATO_PORT_OFFSETS[instanceCode] ?? 1;
  const frontendPort = 3000 + offset;

  try {
    const existingClients = await ctx.kcAdmin.clients.find({
      realm: ctx.realm,
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
        realm: ctx.realm,
        clientId,
        partnerIdpUrl,
        partnerRealm,
      });

      await ctx.kcAdmin.clients.create({
        realm: ctx.realm,
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
        realm: ctx.realm,
        clientId,
      });
    } else {
      // Update existing client's redirect URIs
      const existingClient = existingClients[0];
      if (existingClient.id) {
        await ctx.kcAdmin.clients.update(
          { realm: ctx.realm, id: existingClient.id },
          {
            redirectUris,
            webOrigins,
            secret: clientSecret,
          }
        );
        logger.info('Federation client updated', {
          realm: ctx.realm,
          clientId,
        });
      }
    }

    // DISABLED: Scopes now managed by Terraform SSOT (main.tf incoming_federation_defaults)
    // Runtime assignment removed to avoid race conditions with Terraform-managed resources
    // See: terraform/modules/federated-instance/main.tf and dive-client-scopes.tf

    // CRITICAL: Create protocol mappers to include attributes in tokens
    // Without these, federation won't work - spoke won't receive user attributes!
    await ensureProtocolMappersForClient(ctx, clientId);

  } catch (error) {
    logger.error('Failed to ensure federation client', {
      realm: ctx.realm,
      clientId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
