/**
 * DIVE V3 - Spoke Trusted Issuer Seeding Script
 *
 * PURPOSE:
 * Registers spoke's own Keycloak realm as a trusted OIDC issuer in spoke MongoDB.
 * This enables the spoke's frontend to display the spoke's IdP in the resources page
 * and allows spoke users to authenticate via their own Keycloak realm.
 *
 * PROBLEM SOLVED:
 * - FRA spoke frontend (/resources) doesn't show FRA as trusted issuer
 * - /api/idps/public only returns Hub issuer, not spoke's own issuer
 *
 * ROOT CAUSE:
 * - Hub registers its own issuer in Hub MongoDB ✅
 * - Hub registers spoke issuers in Hub MongoDB on approval ✅
 * - Spoke does NOT register its own issuer in spoke MongoDB ❌
 *
 * SOLUTION:
 * - Spoke calls this script during deployment to self-register
 * - Idempotent: Safe to run multiple times
 * - Non-blocking: Logs warnings but doesn't fail deployment
 *
 * ARCHITECTURE:
 * - MongoDB SSOT: Single source of truth for trusted issuers
 * - OPAL Distribution: Hub distributes federated issuers to spokes
 * - Self-Registration: Spoke registers itself locally for immediate availability
 *
 * INTEGRATION:
 * Add to spoke deployment: phase-seeding.sh after Keycloak realm creation
 *
 * @version 1.1.0
 * @date 2026-02-13
 */

import { MongoClient, Db } from 'mongodb';
import { config } from 'dotenv';
import * as path from 'path';

// ============================================
// CONFIGURATION
// ============================================

interface SpokeConfig {
  instanceCode: string;
  keycloakPort: number;
  keycloakHost: string;
  realmName: string;
  issuerUrl: string;
  internalIssuerUrl?: string;
  trustLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  enabled: boolean;
}

interface TrustedIssuer {
  issuerUrl: string;
  tenant: string;
  name: string;
  country: string;
  trustLevel: string;
  realm: string;
  enabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// ENVIRONMENT DETECTION
// ============================================

function loadEnvironment(): void {
  // Try to load .env file from instances directory
  const instanceCode = process.env.INSTANCE_CODE || 'FRA';
  const instanceDir = path.join(process.cwd(), '../../instances', instanceCode.toLowerCase());
  const envPath = path.join(instanceDir, '.env');

  // Load .env if it exists
  try {
    config({ path: envPath });
    console.log(`✓ Loaded environment from ${envPath}`);
  } catch (error) {
    console.log(`⚠ Could not load ${envPath}, using system environment variables`);
  }

  // Also try root .env
  try {
    config({ path: path.join(process.cwd(), '../../.env') });
  } catch (error) {
    // Ignore - not critical
  }
}

// ============================================
// SPOKE CONFIGURATION BUILDER
// ============================================

/**
 * Get port offset for instance
 * SSOT: Must match scripts/nato-countries.sh NATO_PORT_OFFSETS
 *
 * Priority:
 * 1. Environment variable SPOKE_PORT_OFFSET (set by deployment pipeline)
 * 2. Hardcoded NATO offsets (fallback)
 */
function getPortOffset(code: string): number {
  // First, check for environment-provided offset (set by deploy pipeline)
  const envOffset = process.env.SPOKE_PORT_OFFSET;
  if (envOffset) {
    return parseInt(envOffset, 10);
  }

  // Fallback: NATO_PORT_OFFSETS from scripts/nato-countries.sh (SSOT)
  // IMPORTANT: Keep synchronized with nato-countries.sh
  const offsets: Record<string, number> = {
    // Hub
    USA: 0,    // 8443

    // NATO countries (alphabetical, offsets 1-31)
    ALB: 1,    // 8444
    BEL: 2,    // 8445
    BGR: 3,    // 8446
    CAN: 4,    // 8447
    HRV: 5,    // 8448
    CZE: 6,    // 8449
    DNK: 7,    // 8450
    EST: 8,    // 8451
    FIN: 9,    // 8452
    FRA: 10,   // 8453
    DEU: 11,   // 8454
    GRC: 12,   // 8455
    HUN: 13,   // 8456
    ISL: 14,   // 8457
    ITA: 15,   // 8458
    LVA: 16,   // 8459
    LTU: 17,   // 8460
    LUX: 18,   // 8461
    MNE: 19,   // 8462
    NLD: 20,   // 8463
    MKD: 21,   // 8464
    NOR: 22,   // 8465
    POL: 23,   // 8466
    PRT: 24,   // 8467
    ROU: 25,   // 8468
    SVK: 26,   // 8469
    SVN: 27,   // 8470
    ESP: 28,   // 8471
    SWE: 29,   // 8472
    TUR: 30,   // 8473
    GBR: 31,   // 8474

    // Partner nations (offsets 32-39)
    AUS: 32,   // 8475
    NZL: 33,   // 8476
    JPN: 34,   // 8477
    KOR: 35,   // 8478
    ISR: 36,   // 8479
    UKR: 37,   // 8480
  };
  return offsets[code] || 0;
}

function getSpokeTrustedIssuerConfig(instanceCode?: string): SpokeConfig {
  const code = (instanceCode || process.env.INSTANCE_CODE || 'FRA').toUpperCase();
  const codeLower = code.toLowerCase();

  // Get Keycloak configuration
  // Priority: Environment variable > Calculated from instance > Default
  const portOffset = getPortOffset(code);
  const keycloakPort = parseInt(
    process.env.KEYCLOAK_PORT ||
    process.env[`KEYCLOAK_PORT_${code}`] ||
    String(8443 + portOffset) // Calculate port based on instance offset
  );

  const keycloakHost = process.env.KEYCLOAK_HOST || 'localhost';
  const realmName = `dive-v3-broker-${codeLower}`;

  // Build PUBLIC issuer URL (what appears in JWT tokens)
  const issuerUrl = process.env.NODE_ENV === 'production'
    ? `https://${codeLower}-idp.dive25.com/realms/${realmName}`
    : `https://${keycloakHost}:${keycloakPort}/realms/${realmName}`;

  // Build INTERNAL issuer URL (Docker network communication)
  const internalIssuerUrl = process.env.NODE_ENV === 'production'
    ? undefined // Production uses public URLs for all communication
    : `https://dive-spoke-${codeLower}-keycloak:8443/realms/${realmName}`;

  return {
    instanceCode: code,
    keycloakPort,
    keycloakHost,
    realmName,
    issuerUrl,
    internalIssuerUrl,
    trustLevel: 'HIGH',
    enabled: true,
  };
}

// ============================================
// MONGODB CONNECTION
// ============================================

async function getMongoConnection(): Promise<{ client: MongoClient; db: Db }> {
  const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DATABASE || 'dive-v3-spoke';

  console.log(`Connecting to MongoDB: ${mongoUrl}`);
  console.log(`Database: ${dbName}`);

  const client = new MongoClient(mongoUrl);
  await client.connect();

  console.log('✓ MongoDB connection established');

  const db = client.db(dbName);
  return { client, db };
}

// ============================================
// TRUSTED ISSUER REGISTRATION
// ============================================

async function registerTrustedIssuer(
  db: Db,
  config: SpokeConfig
): Promise<{ registered: boolean; existed: boolean; error?: string }> {
  try {
    const collection = db.collection('trusted_issuers');

    // Check if issuer already exists (PUBLIC URL)
    const existingPublic = await collection.findOne({
      issuerUrl: config.issuerUrl,
    });

    if (existingPublic) {
      console.log(`⚠️  Spoke trusted issuer already exists (PUBLIC URL)`);
      console.log(`   Issuer URL:  ${config.issuerUrl}`);
      console.log(`   Tenant:      ${existingPublic.tenant}`);
      console.log(`   Enabled:     ${existingPublic.enabled}`);
      console.log(`   Trust Level: ${existingPublic.trustLevel}`);
      return { registered: true, existed: true };
    }

    // Register PUBLIC issuer URL
    const publicIssuer: TrustedIssuer = {
      issuerUrl: config.issuerUrl,
      tenant: config.instanceCode,
      name: `${config.instanceCode} Spoke Keycloak`,
      country: config.instanceCode,
      trustLevel: config.trustLevel,
      realm: config.realmName,
      enabled: config.enabled,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await collection.insertOne(publicIssuer);

    console.log(`✅ Spoke trusted issuer registered (PUBLIC URL)`);
    console.log(`   Issuer URL:  ${config.issuerUrl}`);
    console.log(`   Tenant:      ${config.instanceCode}`);
    console.log(`   Trust Level: ${config.trustLevel}`);
    console.log(`   Realm:       ${config.realmName}`);

    // Register INTERNAL issuer URL (Docker network communication)
    if (config.internalIssuerUrl && config.internalIssuerUrl !== config.issuerUrl) {
      const existingInternal = await collection.findOne({
        issuerUrl: config.internalIssuerUrl,
      });

      if (!existingInternal) {
        const internalIssuer: TrustedIssuer = {
          issuerUrl: config.internalIssuerUrl,
          tenant: config.instanceCode,
          name: `${config.instanceCode} Spoke Keycloak (internal)`,
          country: config.instanceCode,
          trustLevel: config.trustLevel,
          realm: config.realmName,
          enabled: config.enabled,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await collection.insertOne(internalIssuer);

        console.log(`✅ Spoke trusted issuer registered (INTERNAL URL)`);
        console.log(`   Issuer URL:  ${config.internalIssuerUrl}`);
        console.log(`   Purpose:     Docker network communication`);
      } else {
        console.log(`✓ Internal issuer already exists: ${config.internalIssuerUrl}`);
      }
    }

    return { registered: true, existed: false };
  } catch (error) {
    console.error('❌ Failed to register trusted issuer');
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    return {
      registered: false,
      existed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// HUB ISSUER CROSS-REGISTRATION
// ============================================

/**
 * Register the Hub's Keycloak issuer in the spoke's MongoDB.
 * This enables the spoke to validate JWT tokens issued by the Hub,
 * which is required for federated queries (Hub forwards user tokens to spokes).
 *
 * Without this, federated queries from Hub fail with 401:
 *   "Issuer https://localhost:8443/realms/dive-v3-broker-usa is not in the list of trusted issuers"
 */
async function registerHubTrustedIssuer(
  db: Db,
  spokeCode: string
): Promise<{ registered: number; skipped: number; error?: string }> {
  // Skip if this IS the hub
  if (spokeCode === 'USA') {
    console.log('ℹ Skipping hub issuer cross-registration (this IS the hub)');
    return { registered: 0, skipped: 0 };
  }

  try {
    const collection = db.collection('trusted_issuers');
    let registered = 0;
    let skipped = 0;

    const hubRealmName = 'dive-v3-broker-usa';

    // Hub PUBLIC issuer URL (what appears in JWT tokens)
    const hubPublicUrl = process.env.NODE_ENV === 'production'
      ? `https://usa-idp.dive25.com/realms/${hubRealmName}`
      : `https://localhost:8443/realms/${hubRealmName}`;

    // Hub INTERNAL issuer URL (Docker network)
    const hubInternalUrl = process.env.NODE_ENV === 'production'
      ? undefined
      : `https://dive-hub-keycloak:8443/realms/${hubRealmName}`;

    // Register hub PUBLIC issuer
    const existingPublic = await collection.findOne({ issuerUrl: hubPublicUrl });
    if (existingPublic) {
      console.log(`✓ Hub trusted issuer already exists (PUBLIC): ${hubPublicUrl}`);
      skipped++;
    } else {
      const hubPublicIssuer: TrustedIssuer = {
        issuerUrl: hubPublicUrl,
        tenant: 'USA',
        name: 'USA Hub Keycloak',
        country: 'USA',
        trustLevel: 'HIGH',
        realm: hubRealmName,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await collection.insertOne(hubPublicIssuer);
      console.log(`✅ Hub trusted issuer registered (PUBLIC URL)`);
      console.log(`   Issuer URL:  ${hubPublicUrl}`);
      registered++;
    }

    // Register hub INTERNAL issuer (Docker network)
    if (hubInternalUrl) {
      const existingInternal = await collection.findOne({ issuerUrl: hubInternalUrl });
      if (existingInternal) {
        console.log(`✓ Hub trusted issuer already exists (INTERNAL): ${hubInternalUrl}`);
        skipped++;
      } else {
        const hubInternalIssuer: TrustedIssuer = {
          issuerUrl: hubInternalUrl,
          tenant: 'USA',
          name: 'USA Hub Keycloak (internal)',
          country: 'USA',
          trustLevel: 'HIGH',
          realm: hubRealmName,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await collection.insertOne(hubInternalIssuer);
        console.log(`✅ Hub trusted issuer registered (INTERNAL URL)`);
        console.log(`   Issuer URL:  ${hubInternalUrl}`);
        console.log(`   Purpose:     Docker network / federated query auth`);
        registered++;
      }
    }

    return { registered, skipped };
  } catch (error) {
    console.error('❌ Failed to register hub trusted issuer');
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    return {
      registered: 0,
      skipped: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// VERIFICATION
// ============================================

async function verifyTrustedIssuer(
  db: Db,
  config: SpokeConfig
): Promise<{ verified: boolean; count: number }> {
  try {
    const collection = db.collection('trusted_issuers');

    // Find all issuers (spoke's own + hub cross-registered)
    const issuers = await collection.find({}).toArray();

    console.log('');
    console.log('='.repeat(80));
    console.log('VERIFICATION RESULTS');
    console.log('='.repeat(80));
    console.log(`Spoke Instance:       ${config.instanceCode}`);
    console.log(`Trusted Issuers:      ${issuers.length} found`);
    console.log('');

    if (issuers.length > 0) {
      issuers.forEach((issuer, index) => {
        console.log(`Issuer ${index + 1}:`);
        console.log(`  URL:         ${issuer.issuerUrl}`);
        console.log(`  Tenant:      ${issuer.tenant}`);
        console.log(`  Realm:       ${issuer.realm}`);
        console.log(`  Trust Level: ${issuer.trustLevel}`);
        console.log(`  Enabled:     ${issuer.enabled}`);
        console.log('');
      });
    }

    console.log('='.repeat(80));

    return {
      verified: issuers.length > 0,
      count: issuers.length,
    };
  } catch (error) {
    console.error('❌ Verification failed');
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    return { verified: false, count: 0 };
  }
}

// ============================================
// OPAL NOTIFICATION (Optional)
// ============================================

/**
 * Optionally notify OPAL that trusted issuers have changed
 * This triggers OPAL to re-fetch data and distribute to OPA clients
 *
 * NOTE: For spokes, this is optional because:
 * - Hub OPAL manages federated issuer distribution
 * - Spoke's local OPA will be updated via Hub OPAL sync
 * - This is just for spoke's local immediate use
 */
async function notifyOpalIfAvailable(config: SpokeConfig): Promise<void> {
  try {
    // Check if OPAL client is available (may not be during early deployment)
    const opalUrl = process.env.OPAL_SERVER_URL || 'https://localhost:7002';

    console.log('');
    console.log('📡 Checking OPAL availability...');

    // Quick healthcheck with 3s timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${opalUrl}/healthcheck`, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
    }).catch(() => null);

    clearTimeout(timeout);

    if (response && response.ok) {
      console.log('✓ OPAL server reachable');
      console.log('ℹ Hub OPAL will distribute federated issuers to spoke');
      console.log('ℹ Spoke\'s local issuer is available immediately in MongoDB');
    } else {
      console.log('⚠ OPAL server not reachable (may not be deployed yet)');
      console.log('ℹ This is OK - trusted issuer is registered in MongoDB');
    }
  } catch (error) {
    // Non-critical - OPAL sync happens separately
    console.log('⚠ Could not check OPAL status (non-critical)');
  }
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main(): Promise<void> {
  console.log('');
  console.log('='.repeat(80));
  console.log('DIVE V3 - Spoke Trusted Issuer Seeding');
  console.log('='.repeat(80));
  console.log('');

  // Load environment
  loadEnvironment();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const instanceCode = args[0] || process.env.INSTANCE_CODE;
  const forceFlag = args.includes('--force');

  if (!instanceCode) {
    console.error('❌ Error: Instance code not specified');
    console.error('');
    console.error('Usage:');
    console.error('  npm run seed:spoke-issuer [INSTANCE_CODE] [--force]');
    console.error('');
    console.error('Examples:');
    console.error('  npm run seed:spoke-issuer FRA');
    console.error('  npm run seed:spoke-issuer GBR --force');
    console.error('');
    console.error('Or set INSTANCE_CODE environment variable:');
    console.error('  INSTANCE_CODE=FRA npm run seed:spoke-issuer');
    process.exit(1);
  }

  console.log(`Instance Code:        ${instanceCode}`);
  console.log(`Force Mode:           ${forceFlag ? 'Yes' : 'No'}`);
  console.log(`Environment:          ${process.env.NODE_ENV || 'development'}`);
  console.log('');

  let client: MongoClient | null = null;

  try {
    // Step 1: Build configuration
    console.log('Step 1/5: Building spoke trusted issuer configuration...');
    const spokeConfig = getSpokeTrustedIssuerConfig(instanceCode);
    console.log('✓ Configuration built');
    console.log('');

    // Step 2: Connect to MongoDB
    console.log('Step 2/5: Connecting to MongoDB...');
    const connection = await getMongoConnection();
    client = connection.client;
    const db = connection.db;
    console.log('');

    // Step 3: Register spoke's own trusted issuer
    console.log('Step 3/5: Registering spoke trusted issuer...');
    const result = await registerTrustedIssuer(db, spokeConfig);
    console.log('');

    if (!result.registered && !result.existed) {
      console.error('❌ Registration failed');
      if (result.error) {
        console.error(`Error: ${result.error}`);
      }
      process.exit(1);
    }

    // Step 4: Cross-register hub issuer (enables federated query auth)
    console.log('Step 4/5: Cross-registering hub trusted issuer...');
    const hubResult = await registerHubTrustedIssuer(db, instanceCode.toUpperCase());
    if (hubResult.error) {
      console.warn(`⚠ Hub issuer cross-registration failed: ${hubResult.error}`);
      console.warn('  Impact: Federated queries from hub may fail with 401');
    } else if (hubResult.registered > 0) {
      console.log(`✅ Hub issuer cross-registered (${hubResult.registered} new, ${hubResult.skipped} existing)`);
    }
    console.log('');

    // Step 5: Verify registration
    console.log('Step 5/5: Verifying trusted issuer registration...');
    const verification = await verifyTrustedIssuer(db, spokeConfig);
    console.log('');

    if (!verification.verified) {
      console.error('❌ Verification failed - issuer not found in database');
      process.exit(1);
    }

    // Optional: Notify OPAL
    await notifyOpalIfAvailable(spokeConfig);

    // Success summary
    console.log('');
    console.log('='.repeat(80));
    console.log('✅ SUCCESS - Spoke Trusted Issuer Seeding Complete');
    console.log('='.repeat(80));
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Verify issuer appears in /api/idps/public:');
    console.log(`     curl -sk "https://localhost:${spokeConfig.keycloakPort - 4000 + 4010}/api/idps/public"`);
    console.log('');
    console.log('  2. Check resources page shows spoke as trusted issuer:');
    console.log(`     https://localhost:${spokeConfig.keycloakPort - 4000 + 3010}/resources`);
    console.log('');
    console.log('  3. Test federated search from Hub:');
    console.log('     curl -sk -X POST https://localhost:4000/api/resources/federated-query -d \'{"instances":["USA","FRA"]}\'');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('❌ FATAL ERROR');
    console.error('='.repeat(80));
    console.error('');
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    console.error('');

    if (error instanceof Error && error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
      console.error('');
    }

    console.error('Troubleshooting:');
    console.error('  1. Check MongoDB is running:');
    console.error('     docker ps | grep mongodb');
    console.error('');
    console.error('  2. Check MongoDB connection string:');
    console.error(`     ${process.env.MONGODB_URL || 'mongodb://localhost:27017'}`);
    console.error('');
    console.error('  3. Check environment variables are set:');
    console.error('     echo $INSTANCE_CODE');
    console.error('     echo $MONGODB_URL');
    console.error('');

    process.exit(1);
  } finally {
    // Cleanup: Close MongoDB connection
    if (client) {
      await client.close();
      console.log('✓ MongoDB connection closed');
      console.log('');
    }
  }
}

// ============================================
// ENTRY POINT
// ============================================

// Only run if executed directly (not imported)
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error in main():', error);
    process.exit(1);
  });
}

// Export for testing
export {
  getSpokeTrustedIssuerConfig,
  registerTrustedIssuer,
  registerHubTrustedIssuer,
  verifyTrustedIssuer,
  type SpokeConfig,
  type TrustedIssuer,
};
