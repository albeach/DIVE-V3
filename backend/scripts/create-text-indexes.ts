/**
 * MongoDB Text Index Creation Script
 * 
 * Phase 2: Search & Discovery Enhancement
 * Creates text indexes for full-text search across all federation instances
 * 
 * Usage:
 *   npx ts-node scripts/create-text-indexes.ts
 *   npm run create-text-indexes
 * 
 * Features:
 * - Creates compound text index on title, resourceId, and content
 * - Weighted relevance scoring (title > resourceId > content)
 * - Creates additional performance indexes
 * - Supports all federation instances (USA, FRA, GBR, DEU)
 */

import { MongoClient, Db } from 'mongodb';

// ============================================
// Configuration
// ============================================

const INSTANCES = ['USA', 'FRA', 'GBR', 'DEU'];
const COLLECTION_NAME = 'resources';

// MongoDB connection URLs per instance
const MONGODB_URLS: Record<string, string> = {
  USA: process.env.MONGODB_URL_USA || 'mongodb://localhost:27017',
  FRA: process.env.MONGODB_URL_FRA || 'mongodb://localhost:27018',
  GBR: process.env.MONGODB_URL_GBR || 'mongodb://localhost:27019',
  DEU: process.env.MONGODB_URL_DEU || 'mongodb://localhost:27020',
};

const DB_NAMES: Record<string, string> = {
  USA: process.env.MONGODB_DB_USA || 'dive_v3_usa',
  FRA: process.env.MONGODB_DB_FRA || 'dive_v3_fra',
  GBR: process.env.MONGODB_DB_GBR || 'dive_v3_gbr',
  DEU: process.env.MONGODB_DB_DEU || 'dive_v3_deu',
};

// ============================================
// Index Definitions
// ============================================

interface IndexDefinition {
  name: string;
  keys: Record<string, number | string>;
  options?: Record<string, unknown>;
}

const TEXT_INDEX: IndexDefinition = {
  name: 'resources_text_search',
  keys: {
    title: 'text',
    resourceId: 'text',
    'content.text': 'text',
    displayMarking: 'text',
  },
  options: {
    weights: {
      title: 10,           // Title is most important
      resourceId: 5,       // Resource ID second
      'content.text': 2,   // Content text third
      displayMarking: 1,   // Display marking least
    },
    name: 'resources_text_search',
    default_language: 'english',
    language_override: 'language',
  },
};

const PERFORMANCE_INDEXES: IndexDefinition[] = [
  // Classification lookup
  {
    name: 'idx_classification',
    keys: { classification: 1 },
  },
  // ZTDF classification lookup
  {
    name: 'idx_ztdf_classification',
    keys: { 'ztdf.policy.securityLabel.classification': 1 },
  },
  // Releasability array lookup
  {
    name: 'idx_releasability',
    keys: { releasabilityTo: 1 },
  },
  // COI array lookup
  {
    name: 'idx_coi',
    keys: { COI: 1 },
  },
  // Origin realm (federation instance)
  {
    name: 'idx_origin_realm',
    keys: { originRealm: 1 },
  },
  // Encrypted status
  {
    name: 'idx_encrypted',
    keys: { encrypted: 1 },
  },
  // Creation date for sorting and range queries
  {
    name: 'idx_creation_date',
    keys: { creationDate: -1 },
  },
  // Compound index for common queries
  {
    name: 'idx_classification_origin',
    keys: { classification: 1, originRealm: 1 },
  },
  // Resource ID unique index
  {
    name: 'idx_resource_id',
    keys: { resourceId: 1 },
    options: { unique: true },
  },
  // Title for alphabetical sorting
  {
    name: 'idx_title',
    keys: { title: 1 },
  },
];

// ============================================
// Index Creation Functions
// ============================================

async function createIndexes(db: Db, instance: string): Promise<void> {
  const collection = db.collection(COLLECTION_NAME);
  
  console.log(`\n📦 Creating indexes for ${instance}...`);

  // Check existing indexes
  const existingIndexes = await collection.indexes();
  const existingIndexNames = new Set(existingIndexes.map(idx => idx.name));

  // Create text index
  try {
    if (existingIndexNames.has(TEXT_INDEX.name)) {
      console.log(`  ⏭️  Text index '${TEXT_INDEX.name}' already exists`);
    } else {
      await collection.createIndex(TEXT_INDEX.keys, TEXT_INDEX.options);
      console.log(`  ✅ Created text index: ${TEXT_INDEX.name}`);
    }
  } catch (error) {
    console.error(`  ❌ Failed to create text index:`, error);
  }

  // Create performance indexes
  for (const index of PERFORMANCE_INDEXES) {
    try {
      if (existingIndexNames.has(index.name)) {
        console.log(`  ⏭️  Index '${index.name}' already exists`);
      } else {
        await collection.createIndex(index.keys, { name: index.name, ...index.options });
        console.log(`  ✅ Created index: ${index.name}`);
      }
    } catch (error) {
      if ((error as Error).message.includes('already exists')) {
        console.log(`  ⏭️  Index '${index.name}' already exists`);
      } else {
        console.error(`  ❌ Failed to create index '${index.name}':`, error);
      }
    }
  }
}

async function validateIndexes(db: Db, instance: string): Promise<boolean> {
  const collection = db.collection(COLLECTION_NAME);
  
  console.log(`\n🔍 Validating indexes for ${instance}...`);

  const indexes = await collection.indexes();
  const indexNames = indexes.map(idx => idx.name);

  // Check text index
  const hasTextIndex = indexes.some(idx => 
    idx.name === TEXT_INDEX.name || 
    Object.values(idx.key || {}).includes('text')
  );

  if (hasTextIndex) {
    console.log(`  ✅ Text index is present`);
  } else {
    console.log(`  ❌ Text index is MISSING`);
    return false;
  }

  // Check performance indexes
  let allPresent = true;
  for (const index of PERFORMANCE_INDEXES) {
    if (indexNames.includes(index.name)) {
      console.log(`  ✅ Index '${index.name}' is present`);
    } else {
      console.log(`  ⚠️  Index '${index.name}' is missing`);
      allPresent = false;
    }
  }

  return allPresent;
}

async function testTextSearch(db: Db, instance: string): Promise<void> {
  const collection = db.collection(COLLECTION_NAME);
  
  console.log(`\n🧪 Testing text search for ${instance}...`);

  try {
    // Test basic text search
    const testResults = await collection.find(
      { $text: { $search: 'fuel inventory' } },
      { projection: { score: { $meta: 'textScore' }, title: 1, resourceId: 1 } }
    )
    .sort({ score: { $meta: 'textScore' } })
    .limit(5)
    .toArray();

    if (testResults.length > 0) {
      console.log(`  ✅ Text search working - found ${testResults.length} results`);
      testResults.slice(0, 3).forEach((doc, i) => {
        console.log(`     ${i + 1}. ${doc.title} (score: ${doc.score?.toFixed(2)})`);
      });
    } else {
      console.log(`  ⚠️  Text search returned no results (may be empty collection)`);
    }
  } catch (error) {
    console.error(`  ❌ Text search test failed:`, error);
  }
}

async function getCollectionStats(db: Db, instance: string): Promise<void> {
  const collection = db.collection(COLLECTION_NAME);
  
  console.log(`\n📊 Collection stats for ${instance}...`);

  try {
    const count = await collection.countDocuments();
    const stats = await db.command({ collStats: COLLECTION_NAME });

    console.log(`  📄 Document count: ${count.toLocaleString()}`);
    console.log(`  💾 Storage size: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  📇 Index size: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  📁 Total indexes: ${stats.nindexes}`);
  } catch (error) {
    console.error(`  ❌ Failed to get stats:`, error);
  }
}

// ============================================
// Main Execution
// ============================================

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   DIVE V3 - MongoDB Text Index Creation');
  console.log('   Phase 2: Search & Discovery Enhancement');
  console.log('═══════════════════════════════════════════════════════════════');

  const args = process.argv.slice(2);
  const targetInstances = args.length > 0 
    ? args.filter(arg => INSTANCES.includes(arg.toUpperCase())).map(a => a.toUpperCase())
    : INSTANCES;

  if (targetInstances.length === 0) {
    console.error(`\n❌ No valid instances specified. Available: ${INSTANCES.join(', ')}`);
    process.exit(1);
  }

  console.log(`\n🎯 Target instances: ${targetInstances.join(', ')}`);

  for (const instance of targetInstances) {
    const url = MONGODB_URLS[instance];
    const dbName = DB_NAMES[instance];

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   Processing: ${instance}`);
    console.log(`   URL: ${url.replace(/:[^:]*@/, ':****@')}`);
    console.log(`   Database: ${dbName}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    let client: MongoClient | null = null;

    try {
      client = new MongoClient(url, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });

      await client.connect();
      console.log(`\n✅ Connected to MongoDB for ${instance}`);

      const db = client.db(dbName);

      // Create indexes
      await createIndexes(db, instance);

      // Validate indexes
      await validateIndexes(db, instance);

      // Test text search
      await testTextSearch(db, instance);

      // Get collection stats
      await getCollectionStats(db, instance);

    } catch (error) {
      console.error(`\n❌ Failed to process ${instance}:`, error);
    } finally {
      if (client) {
        await client.close();
        console.log(`\n🔌 Disconnected from ${instance}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('   Index creation complete!');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

// Run the script
main().catch(console.error);





