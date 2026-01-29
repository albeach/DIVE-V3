/**
 * DIVE V3 - Seed Hub KAS Instance
 *
 * Initializes the Hub's own KAS instance in the kas_registry MongoDB collection.
 * This is CRITICAL for:
 * 1. Hub ZTDF encryption/decryption operations
 * 2. Spoke instances discovering Hub KAS for cross-instance resource access
 * 3. KAS federation trust relationships
 *
 * Runs during:
 * - Hub initial deployment (`./dive deploy hub`)
 * - Hub re-deployment/updates
 * - Manual KAS registry reset
 *
 * Usage:
 *   npm run seed:hub-kas                    # Seed Hub KAS (USA by default)
 *   npm run seed:hub-kas -- --instance=GBR # Seed for specific Hub instance
 *   npm run seed:hub-kas -- --dry-run      # Preview without committing
 *
 * SSOT Architecture: MongoDB kas_registry collection
 *
 * @version 1.0.0
 * @date 2026-01-28
 */

import { mongoKasRegistryStore } from '../models/kas-registry.model';
import { opalDataService } from '../services/opal-data.service';
import { logger } from '../utils/logger';
import { MongoClient } from 'mongodb';
import * as fs from 'fs';

// ============================================
// CONFIGURATION
// ============================================

const INSTANCE_CODE = (process.env.INSTANCE_CODE || 'USA').toUpperCase();
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// Parse command-line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

// Extract instance from args if provided
let targetInstance = INSTANCE_CODE;
const instanceArg = args.find(arg => arg.startsWith('--instance='));
if (instanceArg) {
  targetInstance = instanceArg.split('=')[1].toUpperCase();
}

// Detect Docker environment
const IS_DOCKER = process.env.CONTAINER === 'docker' || fs.existsSync('/.dockerenv');

// ============================================
// KAS INSTANCE CONFIGURATION
// ============================================

interface IKasConfig {
  kasId: string;
  organization: string;
  countryCode: string;
  kasUrl: string;
  internalKasUrl: string;
  jwtIssuer: string;
  supportedCountries: string[];
  trustLevel: 'high' | 'medium' | 'low';
}

/**
 * Get KAS configuration for the Hub instance
 */
function getHubKasConfig(instanceCode: string): IKasConfig {
  const kasId = `${instanceCode.toLowerCase()}-kas`;
  const instanceLower = instanceCode.toLowerCase();

  // Port allocation for development
  const portOffset = getPortOffset(instanceCode);
  const kasPort = 10000 + portOffset; // Hub KAS on 10000, FRA on 10001, etc.
  const keycloakPort = 8443 + portOffset;

  // URLs based on environment
  const isDev = NODE_ENV === 'development' || !IS_PRODUCTION;

  const kasUrl = isDev
    ? `https://localhost:${kasPort}`
    : `https://${instanceLower}-kas.dive25.com`;

  const internalKasUrl = `https://dive-hub-kas:8080`;

  const jwtIssuer = isDev
    ? `https://localhost:${keycloakPort}/realms/dive-v3-broker-${instanceLower}`
    : `https://${instanceLower}-idp.dive25.com/realms/dive-v3-broker-${instanceLower}`;

  return {
    kasId,
    organization: getOrganizationName(instanceCode),
    countryCode: instanceCode,
    kasUrl,
    internalKasUrl,
    jwtIssuer,
    supportedCountries: [instanceCode],
    trustLevel: 'high',
  };
}

/**
 * Get organization name from instance code
 */
function getOrganizationName(code: string): string {
  const orgs: Record<string, string> = {
    USA: 'United States',
    GBR: 'United Kingdom',
    FRA: 'France',
    DEU: 'Germany',
    CAN: 'Canada',
    AUS: 'Australia',
    NZL: 'New Zealand',
    ITA: 'Italy',
    ESP: 'Spain',
    NLD: 'Netherlands',
    BEL: 'Belgium',
    POL: 'Poland',
    NOR: 'Norway',
    DNK: 'Denmark',
    SWE: 'Sweden',
  };
  return orgs[code] || code;
}

/**
 * Get port offset for instance (for development multi-instance setup)
 */
function getPortOffset(code: string): number {
  const offsets: Record<string, number> = {
    USA: 0,    // Hub: 10000, 8443
    FRA: 1,    // Spoke: 10001, 8444
    GBR: 2,    // Spoke: 10002, 8445
    DEU: 3,    // Spoke: 10003, 8446
    CAN: 4,
    AUS: 5,
    NZL: 6,
    ITA: 7,
    ESP: 8,
    NLD: 9,
    BEL: 10,
  };
  return offsets[code] || 0;
}

// ============================================
// MAIN SEEDING FUNCTION
// ============================================

/**
 * Seed Hub KAS instance to MongoDB
 */
async function seedHubKAS(): Promise<void> {
  console.log('\n=== DIVE V3 - Seed Hub KAS Instance ===\n');
  console.log(`Instance:     ${targetInstance}`);
  console.log(`Environment:  ${NODE_ENV}`);
  console.log(`Docker:       ${IS_DOCKER ? 'Yes' : 'No'}`);
  console.log(`Mode:         ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  let mongoClient: MongoClient | null = null;

  try {
    // Get KAS configuration
    const kasConfig = getHubKasConfig(targetInstance);

    console.log('📦 Hub KAS Configuration:');
    console.log(`   KAS ID:           ${kasConfig.kasId}`);
    console.log(`   Organization:     ${kasConfig.organization}`);
    console.log(`   Public URL:       ${kasConfig.kasUrl}`);
    console.log(`   Internal URL:     ${kasConfig.internalKasUrl}`);
    console.log(`   JWT Issuer:       ${kasConfig.jwtIssuer}`);
    console.log(`   Supported:        ${kasConfig.supportedCountries.join(', ')}`);
    console.log(`   Trust Level:      ${kasConfig.trustLevel}\n`);

    if (DRY_RUN) {
      console.log('✅ DRY RUN - No changes made to MongoDB\n');
      return;
    }

    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoKasRegistryStore.initialize();

    // Check if KAS already exists
    const existing = await mongoKasRegistryStore.findById(kasConfig.kasId);

    if (existing && !FORCE) {
      console.log(`⚠️  Hub KAS already exists: ${kasConfig.kasId}`);
      console.log(`   Status:       ${existing.status}`);
      console.log(`   Enabled:      ${existing.enabled}`);
      console.log(`   Registered:   ${existing.createdAt}`);
      console.log(`\n   Use --force to update existing KAS instance\n`);
      return;
    }

    if (existing && FORCE) {
      console.log(`🔄 Updating existing Hub KAS: ${kasConfig.kasId}`);

      // Update existing KAS
      await mongoKasRegistryStore.update(kasConfig.kasId, {
        organization: kasConfig.organization,
        kasUrl: kasConfig.kasUrl,
        internalKasUrl: kasConfig.internalKasUrl,
        authConfig: {
          jwtIssuer: kasConfig.jwtIssuer,
        },
        trustLevel: kasConfig.trustLevel,
        supportedCountries: kasConfig.supportedCountries,
        enabled: true,
      });

      // Ensure it's approved
      await mongoKasRegistryStore.approve(kasConfig.kasId);

      console.log(`✅ Hub KAS updated successfully: ${kasConfig.kasId}\n`);
    } else {
      console.log(`📝 Registering new Hub KAS: ${kasConfig.kasId}`);

      // Register new KAS instance
      await mongoKasRegistryStore.register({
        kasId: kasConfig.kasId,
        organization: kasConfig.organization,
        countryCode: kasConfig.countryCode,
        kasUrl: kasConfig.kasUrl,
        internalKasUrl: kasConfig.internalKasUrl,
        authMethod: 'jwt',
        authConfig: {
          jwtIssuer: kasConfig.jwtIssuer,
        },
        trustLevel: kasConfig.trustLevel,
        supportedCountries: kasConfig.supportedCountries,
        supportedCOIs: [],
        metadata: {
          version: '1.0.0',
          capabilities: ['encrypt', 'decrypt', 'rewrap', 'policy-evaluation'],
          contact: `admin@${targetInstance.toLowerCase()}.dive25.com`,
          registeredAt: new Date(),
          lastHeartbeat: new Date(),
        },
        enabled: true,
      });

      // Auto-approve Hub KAS
      await mongoKasRegistryStore.approve(kasConfig.kasId);

      console.log(`✅ Hub KAS registered and approved: ${kasConfig.kasId}\n`);
    }

    // Publish to OPAL for distribution to all instances
    console.log('📡 Publishing KAS registry to OPAL...');
    try {
      const publishResult = await opalDataService.publishKasRegistry();

      if (publishResult.success) {
        console.log(`✅ KAS registry published to OPAL`);
        console.log(`   Transaction ID: ${publishResult.transactionId || 'N/A'}`);
        console.log(`   All connected instances will receive the update\n`);
      } else {
        console.log(`⚠️  OPAL publish failed: ${publishResult.error}`);
        console.log(`   KAS registered in MongoDB but not distributed via OPAL`);
        console.log(`   Run manual sync: curl -X POST /api/opal/sync/force\n`);
      }
    } catch (opalError) {
      console.log(`⚠️  OPAL publish error: ${opalError instanceof Error ? opalError.message : 'Unknown'}`);
      console.log(`   KAS registered but not yet distributed to other instances\n`);
    }

    // Verify registration
    const verified = await mongoKasRegistryStore.findById(kasConfig.kasId);
    if (verified) {
      console.log('✅ Verification successful:');
      console.log(`   KAS ID:       ${verified.kasId}`);
      console.log(`   Status:       ${verified.status}`);
      console.log(`   Enabled:      ${verified.enabled}`);
      console.log(`   Countries:    ${verified.supportedCountries.join(', ')}`);
      console.log(`   Last Updated: ${verified.updatedAt || verified.createdAt}\n`);
    }

    console.log('🎉 Hub KAS seeding complete!\n');

  } catch (error) {
    console.error('\n❌ Hub KAS seeding failed:', error);
    if (error instanceof Error) {
      console.error('   Error:', error.message);
      if (process.env.DEBUG) {
        console.error('   Stack:', error.stack);
      }
    }
    process.exit(1);
  } finally {
    // Cleanup
    if (mongoClient) {
      try {
        await mongoClient.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

// ============================================
// SCRIPT EXECUTION
// ============================================

// Only run if invoked directly (not imported)
if (require.main === module) {
  seedHubKAS()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { seedHubKAS, getHubKasConfig };
