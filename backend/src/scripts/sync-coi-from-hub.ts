/**
 * DIVE V3 - Sync COI Definitions from Hub
 *
 * CRITICAL FIX (Issue #2 - 2026-02-03):
 * Spokes need to sync COI definitions from Hub's MongoDB SSOT.
 * Without this, spokes fail COI validation with "Failed to load COI membership from MongoDB".
 *
 * This script:
 * 1. Fetches COI definitions from Hub API (/api/federation/coi/sync)
 * 2. Populates spoke's local coi_definitions collection
 * 3. Verifies sync by counting documents
 *
 * Usage:
 *   # From spoke instance
 *   npm run sync-coi
 *
 *   # Or with explicit Hub URL
 *   HUB_API_URL=https://hub.dive.example.com npm run sync-coi
 *
 * @version 1.0.0
 * @date 2026-02-03
 */

import { MongoClient } from 'mongodb';
import axios from 'axios';
import https from 'https';
import { logger } from '../utils/logger';

// Environment configuration
const MONGODB_URL = process.env.MONGODB_URL || (() => { throw new Error('MONGODB_URL not set'); })();
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
const INSTANCE_CODE = process.env.INSTANCE_CODE || process.env.INSTANCE_REALM || 'USA';
const HUB_API_URL = process.env.HUB_API_URL || process.env.HUB_URL || 'https://dive-hub:3002';
const SPOKE_TOKEN = process.env.SPOKE_TOKEN || process.env.FEDERATION_TOKEN;

// Skip SSL verification for internal Docker networks
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

interface ICoiDefinitionSync {
    coiId: string;
    name: string;
    type: 'country-based' | 'program-based' | 'coalition';
    members: string[];
    description?: string;
    status: string;
    color?: string;
    icon?: string;
    mutable?: boolean;
    autoUpdate?: boolean;
    priority?: number;
    mutuallyExclusiveWith?: string[];
    subsetOf?: string;
    supersetOf?: string[];
}

async function main() {
    console.log('🔄 Syncing COI Definitions from Hub');
    console.log('====================================\n');
    console.log(`Instance: ${INSTANCE_CODE}`);
    console.log(`Hub API: ${HUB_API_URL}`);
    console.log(`MongoDB: ${DB_NAME}\n`);

    // Step 1: Fetch COI definitions from Hub
    let coiDefinitions: ICoiDefinitionSync[];

    try {
        const endpoint = `${HUB_API_URL}/api/federation/coi/sync`;
        console.log(`📡 Fetching COI definitions from Hub: ${endpoint}\n`);

        const headers: Record<string, string> = {
            'X-Origin-Realm': INSTANCE_CODE,
            'X-Request-ID': `coi-sync-${Date.now()}`
        };

        // Add authorization if spoke token is available
        if (SPOKE_TOKEN) {
            headers['Authorization'] = `Bearer ${SPOKE_TOKEN}`;
            console.log('✅ Using spoke token for authentication\n');
        } else {
            console.log('⚠️  No spoke token found - attempting unauthenticated sync\n');
        }

        const response = await axios.get(endpoint, {
            headers,
            httpsAgent,
            timeout: 10000
        });

        if (!response.data.success || !Array.isArray(response.data.coiDefinitions)) {
            throw new Error(`Invalid response from Hub: ${JSON.stringify(response.data)}`);
        }

        coiDefinitions = response.data.coiDefinitions;
        console.log(`✅ Fetched ${coiDefinitions.length} COI definitions from Hub\n`);

    } catch (error) {
        console.error('❌ Failed to fetch COI definitions from Hub:', error);
        if (axios.isAxiosError(error)) {
            console.error('   Status:', error.response?.status);
            console.error('   Message:', error.response?.data?.message || error.message);
            console.error('   Endpoint:', error.config?.url);
        }
        process.exit(1);
    }

    // Step 2: Connect to spoke's MongoDB
    const client = new MongoClient(MONGODB_URL);

    try {
        await client.connect();
        console.log('✅ Connected to spoke MongoDB\n');

        const db = client.db(DB_NAME);
        const collection = db.collection('coi_definitions');

        // Step 3: Drop existing collection (fresh sync)
        try {
            await collection.drop();
            console.log('🗑️  Dropped existing coi_definitions collection\n');
        } catch (error) {
            // Collection might not exist, that's okay
            console.log('ℹ️  No existing coi_definitions collection to drop\n');
        }

        // Step 4: Create indexes
        await collection.createIndex({ coiId: 1 }, { unique: true });
        await collection.createIndex({ type: 1 });
        await collection.createIndex({ members: 1 });
        await collection.createIndex({ enabled: 1 });
        console.log('✅ Created indexes\n');

        // Step 5: Insert COI definitions
        const now = new Date();
        const documents = coiDefinitions.map(def => ({
            coiId: def.coiId,
            name: def.name,
            type: def.type,
            members: def.members,
            memberCountries: def.members, // Alias for compatibility
            description: def.description,
            enabled: def.status === 'active',
            color: def.color || '#6B7280',
            icon: def.icon || '🔑',
            mutable: def.mutable ?? true,
            autoUpdate: def.autoUpdate ?? false,
            priority: def.priority ?? 70,
            mutuallyExclusiveWith: def.mutuallyExclusiveWith,
            subsetOf: def.subsetOf,
            supersetOf: def.supersetOf,
            metadata: {
                createdAt: now,
                updatedAt: now,
                source: 'hub-sync' as const,
                syncedFrom: 'hub'
            },
            createdAt: now,
            updatedAt: now
        }));

        const result = await collection.insertMany(documents);
        console.log(`✅ Inserted ${result.insertedCount} COI definitions\n`);

        // Step 6: Verify sync
        const count = await collection.countDocuments();
        console.log(`✅ Verification: ${count} COI definitions in local database\n`);

        // Display summary
        console.log('📊 COI Definitions Summary:');
        console.log('==========================\n');

        const coiGroups = {
            'Coalition': coiDefinitions.filter(c => c.type === 'coalition').length,
            'Country-Based': coiDefinitions.filter(c => c.type === 'country-based').length,
            'Program-Based': coiDefinitions.filter(c => c.type === 'program-based').length
        };

        for (const [type, count] of Object.entries(coiGroups)) {
            if (count > 0) {
                console.log(`${type}: ${count} COIs`);
            }
        }

        console.log('\n📍 Sample COIs:');
        coiDefinitions.slice(0, 5).forEach(coi => {
            console.log(`   ${coi.icon || '🔑'} ${coi.coiId} (${coi.name}) - ${coi.members.length} members`);
        });

        console.log(`\n✅ COI sync completed successfully!\n`);

    } catch (error) {
        console.error('❌ Error syncing COI definitions:', error);
        process.exit(1);
    } finally {
        await client.close();
        console.log('👋 MongoDB connection closed\n');
    }
}

// Execute with proper error handling
main()
    .then(() => {
        console.log('✅ COI sync complete - exiting\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
