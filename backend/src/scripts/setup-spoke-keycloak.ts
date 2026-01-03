#!/usr/bin/env ts-node
/**
 * DIVE V3 - Setup Spoke Keycloak
 *
 * Automates Keycloak realm configuration for spoke instances.
 * Creates the dive-v3-broker realm with proper client and IdP settings.
 *
 * Usage:
 *   npx ts-node setup-spoke-keycloak.ts [options]
 *
 * Options:
 *   --instance, -i     Instance code (required)
 *   --keycloak-url     Keycloak URL          [default: http://localhost:8080]
 *   --admin-user       Admin username        [default: admin]
 *   --admin-password   Admin password        [default from env]
 *   --hub-idp-url      Hub IdP URL for federation
 *   --dry-run          Show what would be created
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import https from 'https';
import http from 'http';

// ============================================
// TYPES
// ============================================

interface KeycloakConfig {
  instanceCode: string;
  keycloakUrl: string;
  adminUser: string;
  adminPassword: string;
  hubIdpUrl?: string;
  dryRun: boolean;
}

interface RealmConfig {
  realm: string;
  enabled: boolean;
  displayName: string;
  displayNameHtml: string;
  loginTheme?: string;
  accountTheme?: string;
  sslRequired: string;
  registrationAllowed: boolean;
  registrationEmailAsUsername: boolean;
  rememberMe: boolean;
  verifyEmail: boolean;
  loginWithEmailAllowed: boolean;
  duplicateEmailsAllowed: boolean;
  resetPasswordAllowed: boolean;
  accessTokenLifespan: number;
  ssoSessionIdleTimeout: number;
  ssoSessionMaxLifespan: number;
  accessCodeLifespan: number;
  accessCodeLifespanUserAction: number;
}

interface ClientConfig {
  clientId: string;
  name: string;
  description: string;
  enabled: boolean;
  clientAuthenticatorType: string;
  redirectUris: string[];
  webOrigins: string[];
  protocol: string;
  publicClient: boolean;
  standardFlowEnabled: boolean;
  implicitFlowEnabled: boolean;
  directAccessGrantsEnabled: boolean;
  serviceAccountsEnabled: boolean;
  authorizationServicesEnabled: boolean;
  attributes: Record<string, string>;
}

// ============================================
// DEFAULTS
// ============================================

const DEFAULT_CONFIG: Partial<KeycloakConfig> = {
  keycloakUrl: 'http://localhost:8080',
  adminUser: 'admin',
  dryRun: false,
};

// ============================================
// KEYCLOAK ADMIN API
// ============================================

class KeycloakAdmin {
  private config: KeycloakConfig;
  private accessToken: string | null = null;

  constructor(config: KeycloakConfig) {
    this.config = config;
  }

  /**
   * Login and get access token
   */
  async login(): Promise<void> {
    console.log('  Logging in to Keycloak admin...');

    const formData = new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: this.config.adminUser,
      password: this.config.adminPassword,
    });

    const response = await this.httpRequest<{ access_token: string }>(
      'POST',
      '/realms/master/protocol/openid-connect/token',
      formData.toString(),
      'application/x-www-form-urlencoded'
    );

    if (response.access_token) {
      this.accessToken = response.access_token;
      console.log('  ✓ Logged in successfully');
    } else {
      throw new Error('Failed to get access token');
    }
  }

  /**
   * Create realm
   */
  async createRealm(realm: RealmConfig): Promise<void> {
    console.log(`  Creating realm: ${realm.realm}...`);

    if (this.config.dryRun) {
      console.log('    [DRY RUN] Would create realm:', realm.realm);
      return;
    }

    try {
      await this.httpRequest(
        'POST',
        '/admin/realms',
        JSON.stringify(realm),
        'application/json'
      );
      console.log(`  ✓ Realm created: ${realm.realm}`);
    } catch (error) {
      if ((error as Error).message.includes('409')) {
        console.log(`  ⚠ Realm already exists: ${realm.realm}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Create client
   */
  async createClient(realmName: string, client: ClientConfig): Promise<string | null> {
    console.log(`  Creating client: ${client.clientId}...`);

    if (this.config.dryRun) {
      console.log('    [DRY RUN] Would create client:', client.clientId);
      return null;
    }

    try {
      await this.httpRequest(
        'POST',
        `/admin/realms/${realmName}/clients`,
        JSON.stringify(client),
        'application/json'
      );
      console.log(`  ✓ Client created: ${client.clientId}`);

      // Get client UUID
      const clients = await this.httpRequest<{ id: string; clientId: string }[]>(
        'GET',
        `/admin/realms/${realmName}/clients?clientId=${client.clientId}`
      );

      return clients[0]?.id || null;
    } catch (error) {
      if ((error as Error).message.includes('409')) {
        console.log(`  ⚠ Client already exists: ${client.clientId}`);
        const clients = await this.httpRequest<{ id: string; clientId: string }[]>(
          'GET',
          `/admin/realms/${realmName}/clients?clientId=${client.clientId}`
        );
        return clients[0]?.id || null;
      }
      throw error;
    }
  }

  /**
   * Get client secret
   */
  async getClientSecret(realmName: string, clientUuid: string): Promise<string> {
    const response = await this.httpRequest<{ value: string }>(
      'GET',
      `/admin/realms/${realmName}/clients/${clientUuid}/client-secret`
    );
    return response.value;
  }

  /**
   * Create protocol mapper
   */
  async createProtocolMapper(
    realmName: string,
    clientUuid: string,
    mapper: {
      name: string;
      protocol: string;
      protocolMapper: string;
      consentRequired: boolean;
      config: Record<string, string>;
    }
  ): Promise<void> {
    console.log(`    Creating mapper: ${mapper.name}...`);

    if (this.config.dryRun) {
      console.log('      [DRY RUN] Would create mapper:', mapper.name);
      return;
    }

    try {
      await this.httpRequest(
        'POST',
        `/admin/realms/${realmName}/clients/${clientUuid}/protocol-mappers/models`,
        JSON.stringify(mapper),
        'application/json'
      );
      console.log(`    ✓ Mapper created: ${mapper.name}`);
    } catch (error) {
      if ((error as Error).message.includes('409')) {
        console.log(`    ⚠ Mapper already exists: ${mapper.name}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * HTTP request helper
   */
  private httpRequest<T>(
    method: string,
    path: string,
    body?: string,
    contentType?: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.config.keycloakUrl);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          ...(contentType && { 'Content-Type': contentType }),
          ...(this.accessToken && { 'Authorization': `Bearer ${this.accessToken}` }),
          ...(body && { 'Content-Length': Buffer.byteLength(body) }),
        },
      };

      if (isHttps) {
        (options as https.RequestOptions).rejectUnauthorized = false;
      }

      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(data ? JSON.parse(data) : ({} as T));
            } catch {
              resolve(data as unknown as T);
            }
          } else if (res.statusCode === 409) {
            reject(new Error(`409 Conflict: Resource already exists`));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }
}

// ============================================
// SETUP FUNCTIONS
// ============================================

async function setupSpokeKeycloak(config: KeycloakConfig): Promise<void> {
  const code = config.instanceCode.toUpperCase();
  const codeLower = config.instanceCode.toLowerCase();

  console.log(`\n🔐 Setting up Keycloak for spoke: ${code}`);
  console.log(`   URL: ${config.keycloakUrl}`);
  if (config.dryRun) {
    console.log('   Mode: DRY RUN (no changes will be made)\n');
  } else {
    console.log('');
  }

  const admin = new KeycloakAdmin(config);

  // 1. Login
  await admin.login();

  // 2. Create realm
  const realm: RealmConfig = {
    realm: 'dive-v3-broker',
    enabled: true,
    displayName: `DIVE V3 Broker (${code})`,
    displayNameHtml: `<div class="kc-logo-text"><span>DIVE V3 Broker</span><br><small>${code} Instance</small></div>`,
    sslRequired: 'external',
    registrationAllowed: false,
    registrationEmailAsUsername: false,
    rememberMe: true,
    verifyEmail: false,
    loginWithEmailAllowed: true,
    duplicateEmailsAllowed: false,
    resetPasswordAllowed: true,
    accessTokenLifespan: 900, // 15 minutes
    ssoSessionIdleTimeout: 1800, // 30 minutes
    ssoSessionMaxLifespan: 28800, // 8 hours
    accessCodeLifespan: 60,
    accessCodeLifespanUserAction: 300,
  };

  await admin.createRealm(realm);

  // 3. Create broker client
  const brokerClient: ClientConfig = {
    clientId: 'dive-v3-broker',
    name: 'DIVE V3 Client',
    description: `DIVE V3 application client for ${code} instance`,
    enabled: true,
    clientAuthenticatorType: 'client-secret',
    redirectUris: [
      `https://${codeLower}-app.dive25.com/*`,
      'http://localhost:3000/*',
    ],
    webOrigins: [
      `https://${codeLower}-app.dive25.com`,
      'http://localhost:3000',
    ],
    protocol: 'openid-connect',
    publicClient: false,
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    authorizationServicesEnabled: false,
    attributes: {
      'post.logout.redirect.uris': `https://${codeLower}-app.dive25.com/*`,
      'pkce.code.challenge.method': 'S256',
    },
  };

  const clientUuid = await admin.createClient('dive-v3-broker', brokerClient);

  // 4. Create protocol mappers for DIVE attributes
  if (clientUuid) {
    console.log('  Creating protocol mappers...');

    const mappers = [
      {
        name: 'uniqueID',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-usermodel-attribute-mapper',
        consentRequired: false,
        config: {
          'user.attribute': 'uniqueID',
          'claim.name': 'uniqueID',
          'jsonType.label': 'String',
          'id.token.claim': 'true',
          'access.token.claim': 'true',
          'userinfo.token.claim': 'true',
        },
      },
      {
        name: 'clearance',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-usermodel-attribute-mapper',
        consentRequired: false,
        config: {
          'user.attribute': 'clearance',
          'claim.name': 'clearance',
          'jsonType.label': 'String',
          'id.token.claim': 'true',
          'access.token.claim': 'true',
          'userinfo.token.claim': 'true',
        },
      },
      {
        name: 'countryOfAffiliation',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-usermodel-attribute-mapper',
        consentRequired: false,
        config: {
          'user.attribute': 'countryOfAffiliation',
          'claim.name': 'countryOfAffiliation',
          'jsonType.label': 'String',
          'id.token.claim': 'true',
          'access.token.claim': 'true',
          'userinfo.token.claim': 'true',
        },
      },
      {
        name: 'acpCOI',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-usermodel-attribute-mapper',
        consentRequired: false,
        config: {
          'user.attribute': 'acpCOI',
          'claim.name': 'acpCOI',
          'jsonType.label': 'JSON',
          'id.token.claim': 'true',
          'access.token.claim': 'true',
          'userinfo.token.claim': 'true',
          'multivalued': 'true',
        },
      },
    ];

    for (const mapper of mappers) {
      await admin.createProtocolMapper('dive-v3-broker', clientUuid, mapper);
    }

    // Get and display client secret
    if (!config.dryRun) {
      const secret = await admin.getClientSecret('dive-v3-broker', clientUuid);
      console.log(`\n  📋 Client Secret: ${secret}`);
      console.log('     Save this secret - you will need it for NextAuth configuration!');
    }
  }

  console.log(`\n✅ Keycloak setup complete for ${code}!`);
  console.log(`\n📋 Configuration summary:`);
  console.log(`   Realm:     dive-v3-broker`);
  console.log(`   Client ID: dive-v3-broker`);
  console.log(`   URL:       ${config.keycloakUrl}/realms/dive-v3-broker`);
  console.log(`\n   Next steps:`);
  console.log('   1. Create test users with clearance, countryOfAffiliation attributes');
  console.log('   2. Configure IdP federation (if using Hub IdP)');
  console.log('   3. Update frontend .env with client secret');
  console.log('');
}

// ============================================
// CLI
// ============================================

function parseArgs(args: string[]): KeycloakConfig {
  const config: Partial<KeycloakConfig> = { ...DEFAULT_CONFIG };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '-i':
      case '--instance':
        config.instanceCode = args[++i];
        break;
      case '--keycloak-url':
        config.keycloakUrl = args[++i];
        break;
      case '--admin-user':
        config.adminUser = args[++i];
        break;
      case '--admin-password':
        config.adminPassword = args[++i];
        break;
      case '--hub-idp-url':
        config.hubIdpUrl = args[++i];
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
      default:
        if (!arg.startsWith('-') && !config.instanceCode) {
          config.instanceCode = arg;
        } else {
          console.error(`Unknown option: ${arg}`);
          printUsage();
          process.exit(1);
        }
    }
    i++;
  }

  // Get admin password from environment if not provided
  if (!config.adminPassword) {
    config.adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';
  }

  if (!config.instanceCode) {
    console.error('Error: Instance code is required');
    printUsage();
    process.exit(1);
  }

  if (config.instanceCode.length !== 3) {
    console.error('Error: Instance code must be exactly 3 characters');
    process.exit(1);
  }

  return config as KeycloakConfig;
}

function printUsage(): void {
  console.log(`
DIVE V3 - Setup Spoke Keycloak

Usage:
  npx ts-node setup-spoke-keycloak.ts <instance-code> [options]

Arguments:
  instance-code       3-letter country code (ISO 3166-1 alpha-3)

Options:
  -i, --instance      Instance code (alternative to positional arg)
  --keycloak-url      Keycloak URL          [default: http://localhost:8080]
  --admin-user        Admin username        [default: admin]
  --admin-password    Admin password        [default: from KEYCLOAK_ADMIN_PASSWORD env]
  --hub-idp-url       Hub IdP URL for federation
  --dry-run           Show what would be created without making changes
  -h, --help          Show this help message

Examples:
  # Setup Keycloak for New Zealand instance
  npx ts-node setup-spoke-keycloak.ts NZL

  # Setup with custom Keycloak URL
  npx ts-node setup-spoke-keycloak.ts FRA --keycloak-url https://keycloak-fra:8443

  # Dry run to see what would be created
  npx ts-node setup-spoke-keycloak.ts DEU --dry-run

Environment Variables:
  KEYCLOAK_ADMIN_PASSWORD    Admin password (if not using --admin-password)
`);
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  try {
    const config = parseArgs(args);
    await setupSpokeKeycloak(config);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { setupSpokeKeycloak, KeycloakConfig };

