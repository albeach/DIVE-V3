/**
 * Origin Realm Migration Script
 * Phase 4, Task 1.5: Add originRealm and kasAuthority to all resources
 *
 * This migration ensures 100% resource origin tracking for cross-instance
 * KAS integration. Resources without originRealm cannot be properly routed
 * to their authoritative KAS for key requests.
 *
 * Usage:
 *   INSTANCE_REALM=USA ts-node src/scripts/add-origin-realm-migration.ts
 *   INSTANCE_REALM=FRA ts-node src/scripts/add-origin-realm-migration.ts
 *   INSTANCE_REALM=GBR ts-node src/scripts/add-origin-realm-migration.ts
 *   INSTANCE_REALM=DEU ts-node src/scripts/add-origin-realm-migration.ts
 *
 * NATO Compliance: ACP-240 §5.3 (Resource Origin Authority)
 */

import { Db, Collection } from 'mongodb';
import dotenv from 'dotenv';
import { getDb, mongoSingleton } from '../utils/mongodb-singleton';

// Load environment
dotenv.config();

// Configuration
const INSTANCE_REALM = process.env.INSTANCE_REALM || 'USA';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'dive-v3';
const DRY_RUN = process.env.DRY_RUN === 'true';

// Valid country codes (ISO 3166-1 alpha-3)
const VALID_COUNTRIES = ['USA', 'FRA', 'GBR', 'DEU', 'CAN', 'AUS', 'NZL', 'ITA', 'ESP', 'NLD', 'BEL', 'POL', 'NOR', 'DNK'];

// Resource ID prefix patterns for origin detection
const RESOURCE_ID_PATTERNS: Record<string, RegExp> = {
  'USA': /^(doc|res|fuel|intel|ops)-usa-/i,
  'FRA': /^(doc|res|fuel|intel|ops)-fra-/i,
  'GBR': /^(doc|res|fuel|intel|ops)-gbr-/i,
  'DEU': /^(doc|res|fuel|intel|ops)-deu-/i,
  'CAN': /^(doc|res|fuel|intel|ops)-can-/i,
};

interface MigrationStats {
  total: number;
  updated: number;
  skipped: number;
  errors: number;
  byOriginRealm: Record<string, number>;
}

interface ResourceDocument {
  _id: unknown;
  resourceId: string;
  originRealm?: string;
  kasAuthority?: string;
  importedFrom?: string;
  classification?: string;
  releasabilityTo?: string[];
  ztdf?: {
    policy?: {
      securityLabel?: {
        originatingCountry?: string;
      };
    };
  };
}

/**
 * Infer origin realm from resource data
 */
function inferOriginRealm(resource: ResourceDocument): string {
  // 1. Check if explicitly set
  if (resource.originRealm && VALID_COUNTRIES.includes(resource.originRealm)) {
    return resource.originRealm;
  }

  // 2. Check importedFrom (indicates federation sync)
  if (resource.importedFrom && VALID_COUNTRIES.includes(resource.importedFrom)) {
    return resource.importedFrom;
  }

  // 3. Check ZTDF originatingCountry
  const originatingCountry = resource.ztdf?.policy?.securityLabel?.originatingCountry;
  if (originatingCountry && VALID_COUNTRIES.includes(originatingCountry)) {
    return originatingCountry;
  }

  // 4. Check resourceId prefix patterns
  if (resource.resourceId) {
    for (const [country, pattern] of Object.entries(RESOURCE_ID_PATTERNS)) {
      if (pattern.test(resource.resourceId)) {
        return country;
      }
    }

    // 5. Try extracting from resourceId directly (e.g., "doc-usa-001")
    const parts = resource.resourceId.toLowerCase().split('-');
    if (parts.length >= 2) {
      const prefix = parts[1].toUpperCase();
      if (VALID_COUNTRIES.includes(prefix)) {
        return prefix;
      }
    }
  }

  // 6. Default to current instance realm
  return INSTANCE_REALM;
}

/**
 * Generate KAS authority from origin realm
 */
function generateKASAuthority(originRealm: string): string {
  return `${originRealm.toLowerCase()}-kas`;
}

/**
 * Run the migration
 */
async function runMigration(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DIVE V3 - Origin Realm Migration Script');
  console.log('  Phase 4, Task 1.5: Cross-Instance KAS Support');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Instance Realm: ${INSTANCE_REALM}`);
  console.log(`  MongoDB URI:    ${MONGODB_URI}`);
  console.log(`  Database:       ${MONGODB_DB}`);
  console.log(`  Dry Run:        ${DRY_RUN ? 'YES (no changes)' : 'NO (will modify data)'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const stats: MigrationStats = {
    total: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    byOriginRealm: {}
  };

  try {
    // Connect to MongoDB singleton
    console.log('Connecting to MongoDB...');
    await mongoSingleton.connect();
    const db: Db = getDb();
    const collection: Collection<ResourceDocument> = db.collection('resources');

    // Count resources without originRealm
    const totalResources = await collection.countDocuments();
    const withoutOriginRealm = await collection.countDocuments({
      $or: [
        { originRealm: { $exists: false } },
        { originRealm: { $eq: null } as any },
        { originRealm: '' }
      ]
    });

    console.log(`Total resources in database: ${totalResources}`);
    console.log(`Resources without originRealm: ${withoutOriginRealm}`);
    console.log('');

    if (withoutOriginRealm === 0) {
      console.log('✅ All resources already have originRealm set. No migration needed.');
      return;
    }

    // Fetch resources that need migration
    const cursor = collection.find({
      $or: [
        { originRealm: { $exists: false } },
        { originRealm: { $eq: null } as any },
        { originRealm: '' }
      ]
    });

    console.log('Processing resources...\n');

    while (await cursor.hasNext()) {
      const resource = await cursor.next();
      if (!resource) continue;

      stats.total++;

      try {
        // Infer origin realm
        const originRealm = inferOriginRealm(resource);
        const kasAuthority = generateKASAuthority(originRealm);

        // Track by origin
        stats.byOriginRealm[originRealm] = (stats.byOriginRealm[originRealm] || 0) + 1;

        // Log progress (every 100 resources)
        if (stats.total % 100 === 0) {
          console.log(`  Processed: ${stats.total}/${withoutOriginRealm}`);
        }

        // Debug log for first 10 resources
        if (stats.total <= 10) {
          console.log(`  [${stats.total}] ${resource.resourceId}`);
          console.log(`      → originRealm: ${originRealm}, kasAuthority: ${kasAuthority}`);
        }

        // Skip if dry run
        if (DRY_RUN) {
          stats.updated++;
          continue;
        }

        // Update resource
        const updateResult = await collection.updateOne(
          { _id: resource._id },
          {
            $set: {
              originRealm,
              kasAuthority,
              _originRealmMigrated: true,
              _migrationTimestamp: new Date().toISOString()
            }
          }
        );

        if (updateResult.modifiedCount > 0) {
          stats.updated++;
        } else {
          stats.skipped++;
        }

      } catch (error) {
        stats.errors++;
        console.error(`  ERROR processing ${resource.resourceId}:`, error);
      }
    }

    // Create index on originRealm for performance
    if (!DRY_RUN) {
      console.log('\nCreating indexes...');

      await collection.createIndex({ originRealm: 1 });
      console.log('  ✓ Index created: originRealm');

      await collection.createIndex({ kasAuthority: 1 });
      console.log('  ✓ Index created: kasAuthority');

      await collection.createIndex({ originRealm: 1, classification: 1 });
      console.log('  ✓ Compound index created: originRealm + classification');
    }

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  MIGRATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Total Processed:  ${stats.total}`);
    console.log(`  Updated:          ${stats.updated}`);
    console.log(`  Skipped:          ${stats.skipped}`);
    console.log(`  Errors:           ${stats.errors}`);
    console.log('');
    console.log('  Resources by Origin Realm:');
    for (const [realm, count] of Object.entries(stats.byOriginRealm).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${realm}: ${count}`);
    }
    console.log('═══════════════════════════════════════════════════════════════');

    if (DRY_RUN) {
      console.log('\n⚠️  DRY RUN COMPLETE - No changes were made.');
      console.log('   Run without DRY_RUN=true to apply changes.\n');
    } else {
      console.log('\n✅ MIGRATION COMPLETE\n');
    }

    // Verify 100% coverage
    const remainingWithout = await collection.countDocuments({
      $or: [
        { originRealm: { $exists: false } },
        { originRealm: { $eq: null } as any },
        { originRealm: '' }
      ]
    });

    if (remainingWithout === 0) {
      console.log('✅ 100% origin realm coverage achieved!');
    } else {
      console.log(`⚠️  ${remainingWithout} resources still without originRealm`);
    }

  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error);
    process.exit(1);
  } finally {
    // Singleton manages lifecycle - no need to close
    console.log('\nMigration complete.');
  }
}

/**
 * Verify migration results
 */
async function verifyMigration(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  MIGRATION VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    await mongoSingleton.connect();
    const db: Db = getDb();
    const collection = db.collection('resources');

    // Check coverage
    const totalResources = await collection.countDocuments();
    const withOriginRealm = await collection.countDocuments({
      originRealm: { $exists: true, $nin: [null, ''] }
    });
    const withKASAuthority = await collection.countDocuments({
      kasAuthority: { $exists: true, $nin: [null, ''] }
    });

    const coveragePercent = totalResources > 0
      ? ((withOriginRealm / totalResources) * 100).toFixed(2)
      : '0.00';

    console.log(`  Total Resources:      ${totalResources}`);
    console.log(`  With originRealm:     ${withOriginRealm} (${coveragePercent}%)`);
    console.log(`  With kasAuthority:    ${withKASAuthority}`);

    // Distribution by originRealm
    const distribution = await collection.aggregate([
      { $group: { _id: '$originRealm', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    console.log('\n  Distribution by Origin Realm:');
    for (const item of distribution) {
      console.log(`    ${item._id || '(null)'}: ${item.count}`);
    }

    // Check index exists
    const indexes = await collection.indexes();
    const hasOriginRealmIndex = indexes.some(idx =>
      idx.key && 'originRealm' in idx.key
    );

    console.log(`\n  Index on originRealm: ${hasOriginRealmIndex ? '✓ Yes' : '✗ No'}`);

    console.log('\n═══════════════════════════════════════════════════════════════\n');

  } finally {
    // Singleton manages lifecycle - no need to close
  }
}

// Main execution
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--verify')) {
    await verifyMigration();
  } else {
    await runMigration();
    await verifyMigration();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
