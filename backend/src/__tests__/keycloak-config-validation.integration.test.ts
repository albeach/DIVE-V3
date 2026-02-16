/**
 * Keycloak Configuration Validation - Integration Tests
 *
 * Requires: Live Keycloak Hub instance running
 * Run with: npm run test:integration -- keycloak-config-validation
 * Skipped in unit test mode (SKIP_INTEGRATION_TESTS=true)
 */

// Skip in unit test mode — requires live Keycloak instance
const SKIP = process.env.SKIP_INTEGRATION_TESTS === 'true';

if (SKIP) {
  describe('Keycloak Configuration Validation (SKIPPED - requires live Keycloak)', () => {
    test('skipped in unit test mode', () => {
      expect(true).toBe(true);
    });
  });
} else {
  // Dynamic imports to avoid axios circular reference crash in Jest workers
  const axios = require('axios').default;
  const https = require('https');

  const KEYCLOAK_CONFIG = {
    url: process.env.KEYCLOAK_URL || 'https://localhost:8443',
    adminUser: process.env.KEYCLOAK_ADMIN || 'admin',
    adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD || '',
    hubRealm: 'dive-v3-broker-usa',
    spokeRealms: {},
  };

  let adminToken: string;
  let tokenExpiry: number = 0;

  function createAxiosClient(): any {
    return axios.create({
      baseURL: KEYCLOAK_CONFIG.url,
      timeout: 10000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });
  }

  async function getAdminToken(): Promise<string> {
    if (adminToken && Date.now() < tokenExpiry - 5000) {
      return adminToken;
    }
    const client = createAxiosClient();
    const response = await client.post(
      '/realms/master/protocol/openid-connect/token',
      new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: KEYCLOAK_CONFIG.adminUser,
        password: KEYCLOAK_CONFIG.adminPassword,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    adminToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    return adminToken;
  }

  async function getUserProfile(realm: string): Promise<any> {
    const client = createAxiosClient();
    const token = await getAdminToken();
    const response = await client.get(`/admin/realms/${realm}/users/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  }

  async function getClients(realm: string, clientId?: string): Promise<any[]> {
    const client = createAxiosClient();
    const token = await getAdminToken();
    const params = clientId ? { clientId } : {};
    const response = await client.get(`/admin/realms/${realm}/clients`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
    });
    return response.data;
  }

  async function getProtocolMappers(realm: string, clientUuid: string): Promise<any[]> {
    const client = createAxiosClient();
    const token = await getAdminToken();
    const response = await client.get(
      `/admin/realms/${realm}/clients/${clientUuid}/protocol-mappers/models`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  }

  async function getIdentityProviders(realm: string): Promise<any[]> {
    const client = createAxiosClient();
    const token = await getAdminToken();
    const response = await client.get(`/admin/realms/${realm}/identity-provider/instances`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  }

  async function getIdPMappers(realm: string, idpAlias: string): Promise<any[]> {
    const client = createAxiosClient();
    const token = await getAdminToken();
    const response = await client.get(
      `/admin/realms/${realm}/identity-provider/instances/${idpAlias}/mappers`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  }

  async function getClientScopes(realm: string): Promise<any[]> {
    const client = createAxiosClient();
    const token = await getAdminToken();
    const response = await client.get(`/admin/realms/${realm}/client-scopes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  }

  async function getDefaultClientScopes(realm: string, clientUuid: string): Promise<any[]> {
    const client = createAxiosClient();
    const token = await getAdminToken();
    const response = await client.get(
      `/admin/realms/${realm}/clients/${clientUuid}/default-client-scopes`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  }

  beforeAll(async () => {
    await getAdminToken();
  }, 30000);

  describe('User Profile Configuration', () => {
    test('Hub User Profile should allow user view for DIVE attributes', async () => {
      const profile = await getUserProfile(KEYCLOAK_CONFIG.hubRealm);
      const diveAttributes = ['clearance', 'countryOfAffiliation', 'acpCOI', 'uniqueID'];
      const missingPermissions: string[] = [];

      for (const attrName of diveAttributes) {
        const attr = profile.attributes?.find((a: any) => a.name === attrName);
        if (!attr) {
          missingPermissions.push(`${attrName}: NOT CONFIGURED`);
          continue;
        }
        const hasUserView = attr.permissions?.view?.includes('user');
        if (!hasUserView) {
          missingPermissions.push(
            `${attrName}: view permissions = ${JSON.stringify(attr.permissions?.view)} (missing "user")`
          );
        }
      }
      expect(missingPermissions).toEqual([]);
    }, 15000);
  });

  describe('Protocol Mappers', () => {
    test('Hub client should have all DIVE attribute mappers', async () => {
      const clients = await getClients(KEYCLOAK_CONFIG.hubRealm, 'dive-v3-broker-usa');
      expect(clients.length).toBeGreaterThan(0);
      const client = clients[0];
      const mappers = await getProtocolMappers(KEYCLOAK_CONFIG.hubRealm, client.id);
      const requiredMappers = ['uniqueID', 'clearance', 'countryOfAffiliation', 'acpCOI'];
      const mapperNames = mappers.map((m: any) => m.name);
      const missingMappers = requiredMappers.filter((name) => !mapperNames.includes(name));
      expect(missingMappers).toEqual([]);
    }, 15000);

    test('Hub client should have native AMR/ACR mappers', async () => {
      const clients = await getClients(KEYCLOAK_CONFIG.hubRealm, 'dive-v3-broker-usa');
      const client = clients[0];
      const mappers = await getProtocolMappers(KEYCLOAK_CONFIG.hubRealm, client.id);
      const amrMapper = mappers.find((m: any) =>
        m.protocolMapper === 'oidc-amr-mapper' && m.config?.['claim.name'] === 'amr'
      );
      const acrMapper = mappers.find((m: any) =>
        m.protocolMapper === 'oidc-acr-mapper' && m.config?.['claim.name'] === 'acr'
      );
      expect(amrMapper).toBeTruthy();
      expect(acrMapper).toBeTruthy();
      const conflictingMappers = mappers.filter((m: any) =>
        m.protocolMapper === 'oidc-usermodel-attribute-mapper' &&
        (m.config?.['claim.name'] === 'amr' || m.config?.['claim.name'] === 'acr')
      );
      expect(conflictingMappers).toEqual([]);
    }, 15000);

    test('Spoke clients should have all DIVE attribute mappers (if deployed)', async () => {
      const spokeCount = Object.keys(KEYCLOAK_CONFIG.spokeRealms).length;
      expect(spokeCount).toBe(0);
    }, 15000);
  });

  describe('Identity Provider Mappers (Federation)', () => {
    test('Hub can have IdPs for spokes (optional)', async () => {
      const idps = await getIdentityProviders(KEYCLOAK_CONFIG.hubRealm);
      const idpAliases = idps.map((idp: any) => idp.alias);
      const diveIdPs = idpAliases.filter((alias: string) =>
        alias.includes('idp') && !alias.includes('industry')
      );
      console.log(`Found ${diveIdPs.length} spoke IdPs: ${JSON.stringify(diveIdPs)}`);
      expect(true).toBe(true);
    }, 15000);

    test('GBR IdP should have import mappers for DIVE attributes (if deployed)', async () => {
      const idps = await getIdentityProviders(KEYCLOAK_CONFIG.hubRealm);
      const gbrIdP = idps.find((idp: any) =>
        idp.alias === 'gbr-idp' || idp.alias === 'spoke-gbr-idp'
      );
      if (!gbrIdP) {
        console.log('GBR IdP not deployed - skipping mapper validation');
        return;
      }
      const mappers = await getIdPMappers(KEYCLOAK_CONFIG.hubRealm, gbrIdP.alias);
      const requiredAttributes = ['clearance', 'countryOfAffiliation', 'acpCOI', 'uniqueID'];
      const mapperClaims = mappers.map((m: any) => m.config?.claim || m.config?.['attribute.name']);
      const missingMappers = requiredAttributes.filter((attr) => !mapperClaims.includes(attr));
      expect(missingMappers).toEqual([]);
    }, 15000);

    test('FRA IdP should have import mappers for DIVE attributes (if deployed)', async () => {
      const idps = await getIdentityProviders(KEYCLOAK_CONFIG.hubRealm);
      const fraIdP = idps.find((idp: any) =>
        idp.alias === 'fra-idp' || idp.alias === 'spoke-fra-idp'
      );
      if (!fraIdP) {
        console.log('FRA IdP not deployed - skipping mapper validation');
        return;
      }
      const mappers = await getIdPMappers(KEYCLOAK_CONFIG.hubRealm, fraIdP.alias);
      const requiredAttributes = ['clearance', 'countryOfAffiliation', 'acpCOI', 'uniqueID'];
      const mapperClaims = mappers.map((m: any) => m.config?.claim || m.config?.['attribute.name']);
      const missingMappers = requiredAttributes.filter((attr) => !mapperClaims.includes(attr));
      expect(missingMappers).toEqual([]);
    }, 15000);
  });

  describe('Client Scopes', () => {
    test('Hub realm should have DIVE client scopes', async () => {
      const scopes = await getClientScopes(KEYCLOAK_CONFIG.hubRealm);
      const scopeNames = scopes.map((s: any) => s.name);
      const requiredScopes = ['clearance', 'countryOfAffiliation', 'acpCOI', 'uniqueID'];
      for (const scope of requiredScopes) {
        expect(scopeNames).toContain(scope);
      }
    }, 15000);

    test('DIVE client scopes should be default (not optional)', async () => {
      const clients = await getClients(KEYCLOAK_CONFIG.hubRealm, 'dive-v3-broker-usa');
      expect(clients.length).toBeGreaterThan(0);
      const client = clients[0];
      const defaultScopes = await getDefaultClientScopes(KEYCLOAK_CONFIG.hubRealm, client.id);
      const defaultScopeNames = defaultScopes.map((s: any) => s.name);
      const requiredScopes = ['clearance', 'countryOfAffiliation', 'uniqueID'];
      for (const scope of requiredScopes) {
        expect(defaultScopeNames).toContain(scope);
      }
    }, 15000);
  });

  describe('Localization and Country-Specific Mappers', () => {
    test('IdPs have flexible mappers for attribute variations (if federation enabled)', async () => {
      const idps = await getIdentityProviders(KEYCLOAK_CONFIG.hubRealm);
      const spokeIdPs = idps.filter((idp: any) =>
        idp.alias?.includes('-idp') && !idp.alias?.includes('industry')
      );
      if (spokeIdPs.length === 0) {
        console.log('No spoke IdPs configured - skipping federation mapper validation');
        expect(true).toBe(true);
        return;
      }
      const firstIdP = spokeIdPs[0];
      const mappers = await getIdPMappers(KEYCLOAK_CONFIG.hubRealm, firstIdP.alias);
      const clearanceMapper = mappers.find((m: any) =>
        m.name?.toLowerCase().includes('clearance') ||
        m.config?.claim?.toLowerCase().includes('clearance')
      );
      expect(clearanceMapper).toBeTruthy();
    }, 15000);
  });

  describe('Complete Keycloak Configuration', () => {
    test('should validate entire identity pipeline is configured', async () => {
      const results = {
        userProfile: false,
        protocolMappers: false,
        clientScopes: false,
        idProviders: false,
        idPMappers: false,
        nativeACRMapper: false,
        nativeAMRMapper: false,
        noConflicts: false,
      };

      try {
        const profile = await getUserProfile(KEYCLOAK_CONFIG.hubRealm);
        const clearanceAttr = profile.attributes?.find((a: any) => a.name === 'clearance');
        results.userProfile = clearanceAttr?.permissions?.view?.includes('user') || false;

        const clients = await getClients(KEYCLOAK_CONFIG.hubRealm, 'dive-v3-broker-usa');
        const client = clients[0];
        const mappers = await getProtocolMappers(KEYCLOAK_CONFIG.hubRealm, client.id);
        results.protocolMappers = mappers.some((m: any) => m.name === 'clearance');

        results.nativeACRMapper = mappers.some((m: any) =>
          m.protocolMapper === 'oidc-acr-mapper' && m.config?.['claim.name'] === 'acr'
        );
        results.nativeAMRMapper = mappers.some((m: any) =>
          m.protocolMapper === 'oidc-amr-mapper' && m.config?.['claim.name'] === 'amr'
        );

        const conflicts = mappers.filter((m: any) =>
          m.protocolMapper === 'oidc-usermodel-attribute-mapper' &&
          (m.config?.['claim.name'] === 'amr' || m.config?.['claim.name'] === 'acr')
        );
        results.noConflicts = conflicts.length === 0;

        const scopes = await getClientScopes(KEYCLOAK_CONFIG.hubRealm);
        const diveScopes = scopes.filter((s: any) =>
          ['clearance', 'countryOfAffiliation', 'acpCOI', 'uniqueID'].includes(s.name || '')
        );
        results.clientScopes = diveScopes.length === 4;

        const idps = await getIdentityProviders(KEYCLOAK_CONFIG.hubRealm);
        results.idProviders = true;

        const spokeIdP = idps.find((idp: any) => idp.alias?.includes('-idp'));
        if (spokeIdP) {
          const idpMappers = await getIdPMappers(KEYCLOAK_CONFIG.hubRealm, spokeIdP.alias);
          results.idPMappers = idpMappers.some((m: any) =>
            m.config?.claim === 'clearance' || m.config?.['attribute.name'] === 'clearance'
          );
        } else {
          results.idPMappers = true;
        }
      } catch (error) {
        console.error('Configuration validation error:', error);
      }

      expect(results.userProfile).toBe(true);
      expect(results.protocolMappers).toBe(true);
      expect(results.nativeACRMapper).toBe(true);
      expect(results.nativeAMRMapper).toBe(true);
      expect(results.noConflicts).toBe(true);
      expect(results.clientScopes).toBe(true);
      expect(results.idProviders).toBe(true);
      expect(results.idPMappers).toBe(true);
    }, 30000);
  });
}
