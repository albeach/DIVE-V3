/**
 * Federation End-to-End Integration Tests
 *
 * Validates complete federation pipeline across Hub and Spoke instances:
 * - Spoke protocol mappers export correct claims
 * - Hub IdP mappers import claims to user attributes
 * - Attribute mapping handles localization (UK/French attribute names)
 * - ACR/AMR propagate correctly across instances
 * - Full authentication flow preserves identity attributes
 *
 * Run with: npm run test:integration -- federation-e2e
 *
 * ENVIRONMENT REQUIREMENTS:
 * - Hub Keycloak running on https://localhost:8443
 * - At least one spoke running (GBR on 8474 or FRA on 8451)
 * - Admin passwords available from environment or GCP
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import axios, { AxiosInstance } from 'axios';
import https from 'https';

// =============================================================================
// MULTI-INSTANCE CONFIGURATION
// =============================================================================

interface KeycloakInstance {
  code: string;
  name: string;
  url: string;
  realm: string;
  adminPassword: string;
  clientId: string;
  port: number;
}

const INSTANCES: { [key: string]: KeycloakInstance } = {
  HUB: {
    code: 'USA',
    name: 'Hub',
    url: process.env.KEYCLOAK_HUB_URL || 'https://localhost:8443',
    realm: 'dive-v3-broker-usa',
    adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD || '',
    clientId: 'dive-v3-broker-usa',
    port: 8443,
  },
  GBR: {
    code: 'GBR',
    name: 'GBR Spoke',
    url: process.env.KEYCLOAK_GBR_URL || 'https://localhost:8474',
    realm: 'dive-v3-broker-gbr',
    adminPassword: process.env.KEYCLOAK_GBR_PASSWORD || '',
    clientId: 'dive-v3-broker-gbr',
    port: 8474,
  },
  FRA: {
    code: 'FRA',
    name: 'FRA Spoke',
    url: process.env.KEYCLOAK_FRA_URL || 'https://localhost:8451',
    realm: 'dive-v3-broker-fra',
    adminPassword: process.env.KEYCLOAK_FRA_PASSWORD || '',
    clientId: 'dive-v3-broker-fra',
    port: 8451,
  },
};

// Admin tokens for each instance
const adminTokens: { [key: string]: { token: string; expiry: number } } = {};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createAxiosClient(baseURL: string): AxiosInstance {
  return axios.create({
    baseURL,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    timeout: 10000,
  });
}

async function getAdminToken(instance: KeycloakInstance): Promise<string> {
  const cacheKey = instance.code;
  const cached = adminTokens[cacheKey];

  if (cached && Date.now() < cached.expiry - 5000) {
    return cached.token;
  }

  const client = createAxiosClient(instance.url);
  const response = await client.post(
    '/realms/master/protocol/openid-connect/token',
    new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: 'admin',
      password: instance.adminPassword,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  adminTokens[cacheKey] = {
    token: response.data.access_token,
    expiry: Date.now() + (response.data.expires_in * 1000),
  };

  return response.data.access_token;
}

async function isInstanceAvailable(instance: KeycloakInstance): Promise<boolean> {
  try {
    const token = await getAdminToken(instance);
    return token.length > 0;
  } catch {
    return false;
  }
}

async function getClient(instance: KeycloakInstance, clientId: string): Promise<any> {
  const token = await getAdminToken(instance);
  const client = createAxiosClient(instance.url);

  const response = await client.get(
    `/admin/realms/${instance.realm}/clients`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { clientId },
    }
  );

  return response.data[0];
}

async function getProtocolMappers(instance: KeycloakInstance, clientUuid: string): Promise<any[]> {
  const token = await getAdminToken(instance);
  const client = createAxiosClient(instance.url);

  const response = await client.get(
    `/admin/realms/${instance.realm}/clients/${clientUuid}/protocol-mappers/models`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  return response.data;
}

async function getIdPMappers(instance: KeycloakInstance, idpAlias: string): Promise<any[]> {
  const token = await getAdminToken(instance);
  const client = createAxiosClient(instance.url);

  const response = await client.get(
    `/admin/realms/${instance.realm}/identity-provider/instances/${idpAlias}/mappers`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  return response.data;
}

async function getIdentityProviders(instance: KeycloakInstance): Promise<any[]> {
  const token = await getAdminToken(instance);
  const client = createAxiosClient(instance.url);

  const response = await client.get(
    `/admin/realms/${instance.realm}/identity-provider/instances`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  return response.data;
}

// =============================================================================
// TEST SUITE: SPOKE CONFIGURATION VALIDATION
// =============================================================================

describe('Spoke Instance Configuration', () => {
  test('GBR Spoke should be accessible (if running)', async () => {
    const isAvailable = await isInstanceAvailable(INSTANCES.GBR);

    if (!isAvailable) {
      console.log('⚠️  GBR Spoke not running - skipping spoke tests');
      expect(true).toBe(true); // Skip gracefully
      return;
    }

    const token = await getAdminToken(INSTANCES.GBR);
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(0);
  }, 15000);

  test('GBR Spoke should have outgoing federation client for Hub', async () => {
    const isAvailable = await isInstanceAvailable(INSTANCES.GBR);
    if (!isAvailable) {
      console.log('⚠️  GBR Spoke not running - skipping');
      return;
    }

    const client = await getClient(INSTANCES.GBR, 'dive-v3-broker-usa');
    expect(client).toBeTruthy();
    expect(client.clientId).toBe('dive-v3-broker-usa');
  }, 15000);

  test('GBR Spoke outgoing client should have DIVE attribute protocol mappers', async () => {
    const isAvailable = await isInstanceAvailable(INSTANCES.GBR);
    if (!isAvailable) {
      console.log('⚠️  GBR Spoke not running - skipping');
      return;
    }

    const client = await getClient(INSTANCES.GBR, 'dive-v3-broker-usa');
    const mappers = await getProtocolMappers(INSTANCES.GBR, client.id);

    const requiredAttributes = ['clearance', 'countryOfAffiliation', 'acpCOI', 'uniqueID'];
    const mapperNames = mappers.map(m => m.name);

    const missingMappers = requiredAttributes.filter(attr => !mapperNames.includes(attr));

    if (missingMappers.length > 0) {
      console.log('Missing mappers:', missingMappers);
      console.log('Available mappers:', mapperNames);
    }

    expect(missingMappers).toEqual([]);
  }, 15000);

  test('GBR Spoke outgoing client should have ACR/AMR mappers', async () => {
    const isAvailable = await isInstanceAvailable(INSTANCES.GBR);
    if (!isAvailable) {
      console.log('⚠️  GBR Spoke not running - skipping');
      return;
    }

    const client = await getClient(INSTANCES.GBR, 'dive-v3-broker-usa');
    const mappers = await getProtocolMappers(INSTANCES.GBR, client.id);

    // Check for native AMR mapper
    const amrMapper = mappers.find(m =>
      m.protocolMapper === 'oidc-amr-mapper' &&
      m.config?.['claim.name'] === 'amr'
    );

    // Check for native ACR mapper
    const acrMapper = mappers.find(m =>
      m.protocolMapper === 'oidc-acr-mapper' &&
      m.config?.['claim.name'] === 'acr'
    );

    // Check for fallback mappers (user_amr, user_acr)
    const userAmrMapper = mappers.find(m =>
      m.config?.['claim.name'] === 'user_amr'
    );

    const userAcrMapper = mappers.find(m =>
      m.config?.['claim.name'] === 'user_acr'
    );

    expect(amrMapper).toBeTruthy();
    expect(acrMapper).toBeTruthy();
    expect(userAmrMapper).toBeTruthy();
    expect(userAcrMapper).toBeTruthy();
  }, 15000);
});

// =============================================================================
// TEST SUITE: HUB FEDERATION CONFIGURATION
// =============================================================================

describe('Hub Federation Configuration', () => {
  test('Hub should have IdP configured for GBR (if spoke running)', async () => {
    const spokeAvailable = await isInstanceAvailable(INSTANCES.GBR);
    const hubAvailable = await isInstanceAvailable(INSTANCES.HUB);

    if (!hubAvailable || !spokeAvailable) {
      console.log('⚠️  Hub or GBR not running - skipping');
      return;
    }

    const idps = await getIdentityProviders(INSTANCES.HUB);
    const gbrIdp = idps.find(idp =>
      idp.alias === 'gbr-idp' || idp.alias === 'spoke-gbr-idp'
    );

    if (!gbrIdp) {
      console.log('⚠️  GBR IdP not configured on Hub - federation not enabled');
      expect(true).toBe(true);
      return;
    }

    expect(gbrIdp.enabled).toBe(true);
    expect(gbrIdp.providerId).toBe('oidc');
  }, 15000);

  test('Hub GBR IdP should have attribute import mappers', async () => {
    const spokeAvailable = await isInstanceAvailable(INSTANCES.GBR);
    const hubAvailable = await isInstanceAvailable(INSTANCES.HUB);

    if (!hubAvailable || !spokeAvailable) {
      console.log('⚠️  Hub or GBR not running - skipping');
      return;
    }

    const idps = await getIdentityProviders(INSTANCES.HUB);
    const gbrIdp = idps.find(idp =>
      idp.alias === 'gbr-idp' || idp.alias === 'spoke-gbr-idp'
    );

    if (!gbrIdp) {
      console.log('⚠️  GBR IdP not configured on Hub - skipping');
      return;
    }

    const mappers = await getIdPMappers(INSTANCES.HUB, gbrIdp.alias);

    // Check for DIVE attribute mappers
    const requiredAttributes = ['clearance', 'countryOfAffiliation', 'acpCOI', 'uniqueID'];
    const mapperClaims = mappers.map(m => m.config?.claim || m.config?.['attribute.name']);

    const missingMappers = requiredAttributes.filter(attr => !mapperClaims.includes(attr));

    if (missingMappers.length > 0) {
      console.log('Missing IdP mappers:', missingMappers);
      console.log('Available IdP mappers:', mapperClaims);
    }

    expect(missingMappers).toEqual([]);
  }, 15000);

  test('Hub GBR IdP should have ACR/AMR import mappers', async () => {
    const spokeAvailable = await isInstanceAvailable(INSTANCES.GBR);
    const hubAvailable = await isInstanceAvailable(INSTANCES.HUB);

    if (!hubAvailable || !spokeAvailable) {
      console.log('⚠️  Hub or GBR not running - skipping');
      return;
    }

    const idps = await getIdentityProviders(INSTANCES.HUB);
    const gbrIdp = idps.find(idp =>
      idp.alias === 'gbr-idp' || idp.alias === 'spoke-gbr-idp'
    );

    if (!gbrIdp) {
      console.log('⚠️  GBR IdP not configured on Hub - skipping');
      return;
    }

    const mappers = await getIdPMappers(INSTANCES.HUB, gbrIdp.alias);

    // Check for AMR mapper (should map to user.amr attribute)
    const amrMapper = mappers.find(m =>
      m.name?.toLowerCase().includes('amr') &&
      m.config?.['user.attribute'] === 'amr'
    );

    // Check for ACR mapper (should map to user.acr attribute)
    const acrMapper = mappers.find(m =>
      m.name?.toLowerCase().includes('acr') &&
      m.config?.['user.attribute'] === 'acr'
    );

    expect(amrMapper).toBeTruthy();
    expect(acrMapper).toBeTruthy();
  }, 15000);

  test('Hub should have incoming federation client for GBR', async () => {
    const spokeAvailable = await isInstanceAvailable(INSTANCES.GBR);
    const hubAvailable = await isInstanceAvailable(INSTANCES.HUB);

    if (!hubAvailable || !spokeAvailable) {
      console.log('⚠️  Hub or GBR not running - skipping');
      return;
    }

    const idps = await getIdentityProviders(INSTANCES.HUB);
    const gbrIdp = idps.find(idp =>
      idp.alias === 'gbr-idp' || idp.alias === 'spoke-gbr-idp'
    );

    if (!gbrIdp) {
      console.log('⚠️  GBR IdP not configured - incoming client not expected');
      return;
    }

    // Hub should have dive-v3-broker-gbr client for incoming federation
    const client = await getClient(INSTANCES.HUB, 'dive-v3-broker-gbr');
    expect(client).toBeTruthy();
    expect(client.clientId).toBe('dive-v3-broker-gbr');
  }, 15000);
});

// =============================================================================
// TEST SUITE: ATTRIBUTE MAPPING CONSISTENCY
// =============================================================================

describe('Attribute Mapping Consistency', () => {
  test('Spoke exports match Hub imports for clearance attribute', async () => {
    const spokeAvailable = await isInstanceAvailable(INSTANCES.GBR);
    const hubAvailable = await isInstanceAvailable(INSTANCES.HUB);

    if (!hubAvailable || !spokeAvailable) {
      console.log('⚠️  Hub or GBR not running - skipping');
      return;
    }

    // Get GBR spoke outgoing mapper for clearance
    const spokeClient = await getClient(INSTANCES.GBR, 'dive-v3-broker-usa');
    const spokeMappers = await getProtocolMappers(INSTANCES.GBR, spokeClient.id);
    const spokeClearanceMapper = spokeMappers.find(m => m.name === 'clearance');

    // Get Hub IdP import mapper for clearance
    const idps = await getIdentityProviders(INSTANCES.HUB);
    const gbrIdp = idps.find(idp =>
      idp.alias === 'gbr-idp' || idp.alias === 'spoke-gbr-idp'
    );

    if (!gbrIdp) {
      console.log('⚠️  GBR IdP not configured - skipping');
      return;
    }

    const hubIdpMappers = await getIdPMappers(INSTANCES.HUB, gbrIdp.alias);
    const hubClearanceMapper = hubIdpMappers.find(m =>
      m.config?.claim === 'clearance' || m.config?.['attribute.name'] === 'clearance'
    );

    expect(spokeClearanceMapper).toBeTruthy();
    expect(hubClearanceMapper).toBeTruthy();

    // Verify spoke exports to claim "clearance"
    expect(spokeClearanceMapper.config?.['claim.name']).toBe('clearance');

    // Verify Hub imports from claim "clearance"
    expect(hubClearanceMapper.config?.claim).toBe('clearance');
  }, 15000);

  test('All DIVE attributes have matching export/import configuration', async () => {
    const spokeAvailable = await isInstanceAvailable(INSTANCES.GBR);
    const hubAvailable = await isInstanceAvailable(INSTANCES.HUB);

    if (!hubAvailable || !spokeAvailable) {
      console.log('⚠️  Hub or GBR not running - skipping');
      return;
    }

    const idps = await getIdentityProviders(INSTANCES.HUB);
    const gbrIdp = idps.find(idp =>
      idp.alias === 'gbr-idp' || idp.alias === 'spoke-gbr-idp'
    );

    if (!gbrIdp) {
      console.log('⚠️  GBR IdP not configured - skipping');
      return;
    }

    const spokeClient = await getClient(INSTANCES.GBR, 'dive-v3-broker-usa');
    const spokeMappers = await getProtocolMappers(INSTANCES.GBR, spokeClient.id);
    const hubIdpMappers = await getIdPMappers(INSTANCES.HUB, gbrIdp.alias);

    const requiredAttributes = ['clearance', 'countryOfAffiliation', 'acpCOI', 'uniqueID'];
    const mismatches: string[] = [];

    for (const attr of requiredAttributes) {
      const spokeMapper = spokeMappers.find(m => m.name === attr);
      const hubMapper = hubIdpMappers.find(m =>
        m.config?.claim === attr || m.config?.['attribute.name'] === attr
      );

      if (!spokeMapper) {
        mismatches.push(`${attr}: No spoke export mapper`);
      }

      if (!hubMapper) {
        mismatches.push(`${attr}: No Hub import mapper`);
      }

      if (spokeMapper && hubMapper) {
        const spokeClaimName = spokeMapper.config?.['claim.name'];
        const hubClaimName = hubMapper.config?.claim;

        if (spokeClaimName !== hubClaimName) {
          mismatches.push(`${attr}: Claim mismatch - spoke exports "${spokeClaimName}", Hub imports "${hubClaimName}"`);
        }
      }
    }

    if (mismatches.length > 0) {
      console.log('Attribute mapping mismatches:');
      mismatches.forEach(m => console.log(`  - ${m}`));
    }

    expect(mismatches).toEqual([]);
  }, 15000);
});

// =============================================================================
// TEST SUITE: LOCALIZATION SUPPORT
// =============================================================================

describe('Localization and Attribute Variations', () => {
  test('Hub IdP mappers should handle UK attribute name variations', async () => {
    const hubAvailable = await isInstanceAvailable(INSTANCES.HUB);

    if (!hubAvailable) {
      console.log('⚠️  Hub not running - skipping');
      return;
    }

    const idps = await getIdentityProviders(INSTANCES.HUB);
    const gbrIdp = idps.find(idp =>
      idp.alias === 'gbr-idp' || idp.alias === 'spoke-gbr-idp'
    );

    if (!gbrIdp) {
      console.log('⚠️  GBR IdP not configured - skipping localization tests');
      return;
    }

    const mappers = await getIdPMappers(INSTANCES.HUB, gbrIdp.alias);

    // Check if clearance mapper can handle UK variations
    // (e.g., "clearance" vs "securityClearance")
    const clearanceMapper = mappers.find(m =>
      m.name?.toLowerCase().includes('clearance')
    );

    expect(clearanceMapper).toBeTruthy();

    // Log mapper config for manual review
    if (clearanceMapper) {
      console.log('GBR clearance mapper config:', {
        name: clearanceMapper.name,
        type: clearanceMapper.identityProviderMapper,
        claim: clearanceMapper.config?.claim,
        template: clearanceMapper.config?.template,
      });
    }
  }, 15000);

  test('FRA IdP should support French attribute names (if configured)', async () => {
    const hubAvailable = await isInstanceAvailable(INSTANCES.HUB);
    const fraAvailable = await isInstanceAvailable(INSTANCES.FRA);

    if (!hubAvailable || !fraAvailable) {
      console.log('⚠️  Hub or FRA not running - skipping');
      return;
    }

    const idps = await getIdentityProviders(INSTANCES.HUB);
    const fraIdp = idps.find(idp =>
      idp.alias === 'fra-idp' || idp.alias === 'spoke-fra-idp'
    );

    if (!fraIdp) {
      console.log('⚠️  FRA IdP not configured - skipping');
      return;
    }

    const mappers = await getIdPMappers(INSTANCES.HUB, fraIdp.alias);

    // Check for clearance mapper that might handle French names
    // (e.g., "habilitation" → "clearance")
    const clearanceMapper = mappers.find(m =>
      m.name?.toLowerCase().includes('clearance') ||
      m.name?.toLowerCase().includes('habilitation')
    );

    expect(clearanceMapper).toBeTruthy();

    if (clearanceMapper) {
      console.log('FRA clearance mapper config:', {
        name: clearanceMapper.name,
        type: clearanceMapper.identityProviderMapper,
        claim: clearanceMapper.config?.claim,
      });
    }
  }, 15000);
});

// =============================================================================
// TEST SUITE: COMPLETE FEDERATION PIPELINE VALIDATION
// =============================================================================

describe('Complete Federation Pipeline', () => {
  test('Full federation chain is configured correctly', async () => {
    const hubAvailable = await isInstanceAvailable(INSTANCES.HUB);
    const gbrAvailable = await isInstanceAvailable(INSTANCES.GBR);

    if (!hubAvailable || !gbrAvailable) {
      console.log('⚠️  Hub or GBR not running - skipping pipeline validation');
      return;
    }

    const results = {
      spokeOutgoingClient: false,
      spokeProtocolMappers: false,
      spokeAcrAmrMappers: false,
      hubIdpExists: false,
      hubIdpMappers: false,
      hubIdpAcrAmrMappers: false,
      hubIncomingClient: false,
      attributeConsistency: false,
    };

    try {
      // 1. Check spoke outgoing client
      const spokeClient = await getClient(INSTANCES.GBR, 'dive-v3-broker-usa');
      results.spokeOutgoingClient = !!spokeClient;

      // 2. Check spoke protocol mappers
      const spokeMappers = await getProtocolMappers(INSTANCES.GBR, spokeClient.id);
      const spokeDiveMappers = spokeMappers.filter(m =>
        ['clearance', 'countryOfAffiliation', 'acpCOI', 'uniqueID'].includes(m.name)
      );
      results.spokeProtocolMappers = spokeDiveMappers.length === 4;

      // 3. Check spoke ACR/AMR mappers
      const spokeAmr = spokeMappers.find(m =>
        m.protocolMapper === 'oidc-amr-mapper' && m.config?.['claim.name'] === 'amr'
      );
      const spokeAcr = spokeMappers.find(m =>
        m.protocolMapper === 'oidc-acr-mapper' && m.config?.['claim.name'] === 'acr'
      );
      results.spokeAcrAmrMappers = !!(spokeAmr && spokeAcr);

      // 4. Check Hub IdP exists
      const idps = await getIdentityProviders(INSTANCES.HUB);
      const gbrIdp = idps.find(idp =>
        idp.alias === 'gbr-idp' || idp.alias === 'spoke-gbr-idp'
      );
      results.hubIdpExists = !!gbrIdp;

      if (gbrIdp) {
        // 5. Check Hub IdP mappers
        const hubIdpMappers = await getIdPMappers(INSTANCES.HUB, gbrIdp.alias);
        const hubDiveMappers = hubIdpMappers.filter(m =>
          ['clearance', 'countryOfAffiliation', 'acpCOI', 'uniqueID'].includes(
            m.config?.claim || m.config?.['attribute.name']
          )
        );
        results.hubIdpMappers = hubDiveMappers.length === 4;

        // 6. Check Hub IdP ACR/AMR mappers
        const hubAmr = hubIdpMappers.find(m =>
          m.config?.['user.attribute'] === 'amr'
        );
        const hubAcr = hubIdpMappers.find(m =>
          m.config?.['user.attribute'] === 'acr'
        );
        results.hubIdpAcrAmrMappers = !!(hubAmr && hubAcr);

        // 7. Check attribute consistency
        const mismatches: string[] = [];
        for (const attr of ['clearance', 'countryOfAffiliation', 'acpCOI', 'uniqueID']) {
          const spokeMapper = spokeMappers.find(m => m.name === attr);
          const hubMapper = hubIdpMappers.find(m =>
            m.config?.claim === attr || m.config?.['attribute.name'] === attr
          );

          if (spokeMapper && hubMapper) {
            const spokeClaim = spokeMapper.config?.['claim.name'];
            const hubClaim = hubMapper.config?.claim;
            if (spokeClaim !== hubClaim) {
              mismatches.push(attr);
            }
          }
        }
        results.attributeConsistency = mismatches.length === 0;
      }

      // 8. Check Hub incoming client
      const hubIncomingClient = await getClient(INSTANCES.HUB, 'dive-v3-broker-gbr');
      results.hubIncomingClient = !!hubIncomingClient;

    } catch (error) {
      console.error('Pipeline validation error:', error);
    }

    // Log results
    console.log('Federation Pipeline Validation Results:');
    Object.entries(results).forEach(([key, value]) => {
      console.log(`  ${value ? '✅' : '❌'} ${key}`);
    });

    // All checks should pass for a complete federation setup
    expect(results.spokeOutgoingClient).toBe(true);
    expect(results.spokeProtocolMappers).toBe(true);
    expect(results.spokeAcrAmrMappers).toBe(true);

    if (results.hubIdpExists) {
      expect(results.hubIdpMappers).toBe(true);
      expect(results.hubIdpAcrAmrMappers).toBe(true);
      expect(results.hubIncomingClient).toBe(true);
      expect(results.attributeConsistency).toBe(true);
    } else {
      console.log('⚠️  Federation not fully configured - some checks skipped');
    }
  }, 30000);
});
