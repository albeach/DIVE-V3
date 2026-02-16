/**
 * Identity Provider Management
 *
 * Manages OIDC Identity Provider CRUD operations and DIVE attribute mappers
 * for Keycloak federation.
 *
 * Extracted from keycloak-federation.service.ts (Phase 4C decomposition).
 *
 * @module idp-management
 */

import { logger } from '../utils/logger';
import type { KeycloakContext } from './federation-client-setup';
import { ensureDiveClientScopes, ensureCrossBorderClient } from './federation-client-setup';
import type { IFederationConfig, IFederationResult } from './keycloak-federation.service';
import type IdentityProviderRepresentation from '@keycloak/keycloak-admin-client/lib/defs/identityProviderRepresentation';

// ============================================
// IDP CRUD OPERATIONS
// ============================================

/**
 * Get Identity Provider by alias.
 * Assumes Keycloak context is already initialized.
 */
export async function getIdentityProviderCore(
  ctx: KeycloakContext,
  alias: string
): Promise<{ internalId: string; config: IdentityProviderRepresentation } | null> {
  try {
    const idp = await ctx.kcAdmin.identityProviders.findOne({ alias });
    return idp ? { internalId: idp.internalId!, config: idp } : null;
  } catch (error) {
    logger.debug('Identity Provider not found', { alias });
    return null;
  }
}

/**
 * Delete Identity Provider by alias.
 * Assumes Keycloak context is already initialized.
 */
export async function deleteIdentityProviderCore(
  ctx: KeycloakContext,
  alias: string
): Promise<void> {
  await ctx.kcAdmin.identityProviders.del({ alias });
  logger.info('Identity Provider deleted', { alias });
}

/**
 * List all Identity Providers in the realm.
 * Assumes Keycloak context is already initialized.
 */
export async function listIdentityProvidersCore(
  ctx: KeycloakContext
): Promise<Array<{ alias: string; displayName: string; enabled: boolean; protocol: string }>> {
  const idps = await ctx.kcAdmin.identityProviders.find();

  return idps.map((idp) => ({
    alias: idp.alias!,
    displayName: idp.displayName || idp.alias!,
    enabled: idp.enabled || false,
    protocol: idp.providerId || 'unknown',
  }));
}

// ============================================
// IDP CREATION
// ============================================

/**
 * Create or update OIDC Identity Provider.
 *
 * Establishes trust with another DIVE instance's Keycloak.
 * Users from the remote instance can authenticate here via federation.
 *
 * Assumes Keycloak context is already initialized.
 */
export async function createOIDCIdentityProviderCore(
  ctx: KeycloakContext,
  config: IFederationConfig
): Promise<IFederationResult> {
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
    targetRealm: ctx.realm,
  });

  // STEP 1: Ensure DIVE custom scopes exist in this realm
  await ensureDiveClientScopes(ctx);

  // STEP 2: Ensure cross-border client exists and has DIVE scopes
  await ensureCrossBorderClient(ctx, clientId, clientSecret);

  // Check if IdP already exists
  const existing = await getIdentityProviderCore(ctx, alias);
  if (existing) {
    logger.warn('Identity Provider already exists, updating', { alias });
    await updateIdentityProviderCore(ctx, alias, config);
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
      defaultScope: 'openid profile email clearance countryOfAffiliation uniqueID acpCOI dive_acr dive_amr user_acr user_amr',

      // Token validation
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
    await ctx.kcAdmin.identityProviders.create(idpConfig);

    logger.info('Identity Provider created successfully', {
      alias,
      displayName,
      realm: ctx.realm,
    });

    // Create protocol mappers for DIVE attributes
    await createDIVEAttributeMappers(ctx, alias);

    // Get internal ID
    const created = await getIdentityProviderCore(ctx, alias);

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

// ============================================
// IDP ATTRIBUTE MAPPERS
// ============================================

/**
 * Create protocol mappers for DIVE V3 attributes on an IdP.
 *
 * Maps claims from the federated IdP to user attributes:
 * - uniqueID -> sub (or preferred_username)
 * - clearance -> clearance
 * - countryOfAffiliation -> countryOfAffiliation
 * - acpCOI -> acpCOI (array)
 */
export async function createDIVEAttributeMappers(ctx: KeycloakContext, idpAlias: string): Promise<void> {
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
      await ctx.kcAdmin.identityProviders.createMapper({
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

// ============================================
// IDP UPDATE
// ============================================

/**
 * Update existing Identity Provider with full configuration.
 * Ensures all URL endpoints are updated when container names change.
 *
 * Assumes Keycloak context is already initialized.
 */
export async function updateIdentityProviderCore(
  ctx: KeycloakContext,
  alias: string,
  config: Partial<IFederationConfig>
): Promise<void> {
  const existing = await getIdentityProviderCore(ctx, alias);
  if (!existing) {
    throw new Error(`Identity Provider not found: ${alias}`);
  }

  // existing.config contains the full IdP configuration from Keycloak
  const existingIdp = existing.config;

  // Build complete updates including URL endpoints
  const updates: IdentityProviderRepresentation = {
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

  await ctx.kcAdmin.identityProviders.update({ alias }, updates);

  logger.info('Identity Provider updated with full configuration', {
    alias,
    hasBaseUrl: !!idpBaseUrl,
    hasInternalUrl: !!idpInternalUrl,
    realm: idpRealm,
  });
}
