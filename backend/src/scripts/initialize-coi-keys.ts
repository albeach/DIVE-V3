/**
 * Initialize COI Keys Database
 * 
 * Migration script to populate MongoDB with COI Keys from existing
 * COI_MEMBERSHIP definitions in coi-validation.service.ts
 * 
 * This creates the centralized COI registry and establishes the
 * single source of truth for COI metadata.
 * 
 * Date: October 21, 2025
 */

import { MongoClient } from 'mongodb';
import { ICreateCOIKeyRequest } from '../types/coi-key.types';

// CRITICAL: No hardcoded passwords - use MONGODB_URL from GCP Secret Manager
const MONGODB_URL = process.env.MONGODB_URL || (() => { throw new Error('MONGODB_URL not set'); })();
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';

/**
 * Authoritative COI definitions with complete metadata
 * Migrated from COI_MEMBERSHIP + compliance.controller.ts + seed data
 */
const COI_DEFINITIONS: ICreateCOIKeyRequest[] = [
    {
        coiId: 'FVEY',
        name: 'Five Eyes',
        description: 'Intelligence alliance between USA, United Kingdom, Canada, Australia, and New Zealand. Established post-WWII for signals intelligence sharing.',
        memberCountries: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        status: 'active',
        color: '#8B5CF6', // Purple
        icon: '👁️',
        supersetOf: ['CAN-US', 'GBR-US', 'AUKUS']
    },
    {
        coiId: 'NATO',
        name: 'NATO',
        description: 'North Atlantic Treaty Organization - 32-member collective defense alliance.',
        memberCountries: [
            'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
            'DEU', 'GBR', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD',
            'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'TUR', 'USA'
        ],
        status: 'active',
        color: '#3B82F6', // Blue
        icon: '⭐',
        supersetOf: ['NATO-COSMIC']
    },
    {
        coiId: 'NATO-COSMIC',
        name: 'NATO COSMIC',
        description: 'NATO COSMIC TOP SECRET clearance for highly classified NATO defense information. Requires NATO membership and COSMIC clearance.',
        memberCountries: [
            'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
            'DEU', 'GBR', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD',
            'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'TUR', 'USA'
        ],
        status: 'active',
        color: '#1E40AF', // Dark blue
        icon: '🌟',
        subsetOf: 'NATO',
        mutuallyExclusiveWith: ['US-ONLY', 'EU-RESTRICTED']
    },
    {
        coiId: 'US-ONLY',
        name: 'US Only',
        description: 'United States personnel only - no foreign nationals. Typically paired with NOFORN caveat.',
        memberCountries: ['USA'],
        status: 'active',
        color: '#DC2626', // Red
        icon: '🇺🇸',
        mutuallyExclusiveWith: ['CAN-US', 'GBR-US', 'FRA-US', 'DEU-US', 'FVEY', 'NATO', 'NATO-COSMIC', 'EU-RESTRICTED', 'AUKUS', 'QUAD', 'NORTHCOM', 'EUCOM', 'PACOM', 'CENTCOM', 'SOCOM']
    },
    {
        coiId: 'CAN-US',
        name: 'Canada-US',
        description: 'Bilateral partnership between Canada and United States for defense and intelligence sharing.',
        memberCountries: ['CAN', 'USA'],
        status: 'active',
        color: '#6366F1', // Indigo
        icon: '🤝',
        subsetOf: 'FVEY',
        mutuallyExclusiveWith: ['US-ONLY']
    },
    {
        coiId: 'GBR-US',
        name: 'UK-US (UKUSA)',
        description: 'Bilateral United Kingdom-US partnership, foundation of FVEY. Special relationship dating to WWII.',
        memberCountries: ['GBR', 'USA'],
        status: 'active',
        color: '#6366F1', // Indigo
        icon: '🤝',
        subsetOf: 'FVEY',
        mutuallyExclusiveWith: ['US-ONLY']
    },
    {
        coiId: 'FRA-US',
        name: 'France-US',
        description: 'Bilateral France-US partnership for defense cooperation and intelligence sharing.',
        memberCountries: ['FRA', 'USA'],
        status: 'active',
        color: '#6366F1', // Indigo
        icon: '🤝',
        mutuallyExclusiveWith: ['US-ONLY']
    },
    {
        coiId: 'DEU-US',
        name: 'Germany-US',
        description: 'Bilateral Germany-US partnership for defense cooperation and intelligence sharing. Strategic NATO partners.',
        memberCountries: ['DEU', 'USA'],
        status: 'active',
        color: '#FACC15', // Yellow (German flag)
        icon: '🤝',
        subsetOf: 'NATO',
        mutuallyExclusiveWith: ['US-ONLY']
    },
    {
        coiId: 'AUKUS',
        name: 'AUKUS',
        description: 'Trilateral security partnership between Australia, United Kingdom, and United States. Focus on Indo-Pacific security, advanced defense tech.',
        memberCountries: ['AUS', 'GBR', 'USA'],
        status: 'active',
        color: '#10B981', // Green
        icon: '🛡️',
        subsetOf: 'FVEY',
        mutuallyExclusiveWith: ['US-ONLY']
    },
    {
        coiId: 'QUAD',
        name: 'QUAD',
        description: 'Quadrilateral Security Dialogue between USA, Australia, India, and Japan. Indo-Pacific strategic cooperation.',
        memberCountries: ['USA', 'AUS', 'IND', 'JPN'],
        status: 'active',
        color: '#10B981', // Green
        icon: '◆',
        mutuallyExclusiveWith: ['US-ONLY', 'EU-RESTRICTED']
    },
    {
        coiId: 'EU-RESTRICTED',
        name: 'EU Restricted',
        description: 'European Union members only - restricted to EU27 member states. Not releasable to USA or non-EU NATO allies.',
        memberCountries: [
            'AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
            'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD',
            'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE'
        ],
        status: 'active',
        color: '#3B82F6', // Blue
        icon: '🇪🇺',
        mutuallyExclusiveWith: ['US-ONLY', 'NATO-COSMIC']
    },
    {
        coiId: 'NORTHCOM',
        name: 'NORTHCOM',
        description: 'U.S. Northern Command - North American defense region (USA, Canada, Mexico).',
        memberCountries: ['USA', 'CAN', 'MEX'],
        status: 'active',
        color: '#F59E0B', // Amber
        icon: '🗺️',
        mutuallyExclusiveWith: ['US-ONLY']
    },
    {
        coiId: 'EUCOM',
        name: 'EUCOM',
        description: 'U.S. European Command - European theater operations with key NATO partners.',
        memberCountries: ['USA', 'DEU', 'GBR', 'FRA', 'ITA', 'ESP', 'POL'],
        status: 'active',
        color: '#F59E0B', // Amber
        icon: '🗺️',
        mutuallyExclusiveWith: ['US-ONLY']
    },
    {
        coiId: 'PACOM',
        name: 'PACOM (INDOPACOM)',
        description: 'U.S. Indo-Pacific Command - Pacific theater with key regional allies.',
        memberCountries: ['USA', 'JPN', 'KOR', 'AUS', 'NZL', 'PHL'],
        status: 'active',
        color: '#F59E0B', // Amber
        icon: '🗺️',
        mutuallyExclusiveWith: ['US-ONLY']
    },
    {
        coiId: 'CENTCOM',
        name: 'CENTCOM',
        description: 'U.S. Central Command - Middle East theater with regional partners.',
        memberCountries: ['USA', 'SAU', 'ARE', 'QAT', 'KWT', 'BHR', 'JOR', 'EGY'],
        status: 'active',
        color: '#F59E0B', // Amber
        icon: '🗺️',
        mutuallyExclusiveWith: ['US-ONLY']
    },
    {
        coiId: 'SOCOM',
        name: 'SOCOM',
        description: 'U.S. Special Operations Command - Special operations with FVEY partners.',
        memberCountries: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        status: 'active',
        color: '#EF4444', // Red
        icon: '⚡',
        mutuallyExclusiveWith: ['US-ONLY']
    },
    {
        coiId: 'Alpha',
        name: 'Alpha',
        description: 'Alpha community - no specific country affiliation. Access granted based on COI membership only.',
        memberCountries: [],
        status: 'active',
        color: '#9333EA', // Purple
        icon: 'Α'
    },
    {
        coiId: 'Beta',
        name: 'Beta',
        description: 'Beta community - no specific country affiliation. Access granted based on COI membership only.',
        memberCountries: [],
        status: 'active',
        color: '#0EA5E9', // Sky blue
        icon: 'Β'
    },
    {
        coiId: 'Gamma',
        name: 'Gamma',
        description: 'Gamma community - no specific country affiliation. Access granted based on COI membership only.',
        memberCountries: [],
        status: 'active',
        color: '#14B8A6', // Teal
        icon: 'Γ'
    },
    {
        coiId: 'TEST-COI',
        name: 'Test COI',
        description: 'Test community of interest for development and testing purposes.',
        memberCountries: ['USA', 'GBR', 'CAN'],
        status: 'active',
        color: '#6B7280', // Gray
        icon: '🧪'
    },
    {
        coiId: 'NEW-COI',
        name: 'New COI',
        description: 'Newly established community of interest.',
        memberCountries: ['USA'],
        status: 'active',
        color: '#84CC16', // Lime
        icon: '🆕'
    },
    {
        coiId: 'PACIFIC-ALLIANCE',
        name: 'Pacific Alliance',
        description: 'Pacific regional security partnership between USA, Japan, Australia, and South Korea.',
        memberCountries: ['USA', 'JPN', 'AUS', 'KOR'],
        status: 'active',
        color: '#06B6D4', // Cyan
        icon: '🌊'
    }
];

async function main() {
    console.log('🔑 Initializing COI Keys Database');
    console.log('==================================\n');

    // Note: When running from host (outside Docker), use .env.local connection without auth
    // When running inside Docker, use docker-compose MONGODB_URL with auth
    const client = new MongoClient(MONGODB_URL);

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db(DB_NAME);
        
        // SSOT: Use coi_definitions collection (matches coi-definition.model.ts)
        // The coi_keys collection is legacy and no longer used
        const collection = db.collection('coi_definitions');

        // Drop existing collection (fresh start)
        try {
            await collection.drop();
            console.log('🗑️  Dropped existing coi_definitions collection\n');
        } catch (error) {
            // Collection might not exist, that's okay
            console.log('ℹ️  No existing coi_definitions collection to drop\n');
        }

        // Create indexes
        await collection.createIndex({ coiId: 1 }, { unique: true });
        await collection.createIndex({ status: 1 });
        await collection.createIndex({ memberCountries: 1 });
        console.log('✅ Created indexes\n');

        // Insert all COI definitions with proper schema for coi_definitions collection
        const now = new Date();
        const documents = COI_DEFINITIONS.map(def => ({
            coiId: def.coiId,
            name: def.name,
            type: 'coalition' as const, // Most COIs are coalitions
            members: def.memberCountries,
            memberCountries: def.memberCountries, // Alias for service compatibility
            description: def.description,
            status: def.status || 'active', // Map to status field
            color: def.color || '#6B7280', // Include color
            icon: def.icon || '🔑', // Include icon
            resourceCount: 0, // Will be computed dynamically
            algorithm: 'AES-256-GCM',
            keyVersion: 1,
            mutuallyExclusiveWith: def.mutuallyExclusiveWith,
            subsetOf: def.subsetOf,
            supersetOf: def.supersetOf,
            mutable: true, // Allow updates via API
            autoUpdate: false, // Manual management
            priority: def.mutuallyExclusiveWith?.includes('US-ONLY') ? 90 : 70, // Higher priority for exclusive COIs
            metadata: {
                createdAt: now,
                updatedAt: now,
                source: 'migration' as const
            },
            enabled: true,
            createdAt: now,
            updatedAt: now
        }));

        const result = await collection.insertMany(documents);
        console.log(`✅ Inserted ${result.insertedCount} COI Keys\n`);

        // Display summary
        console.log('📊 COI Keys Summary:');
        console.log('===================\n');

        for (const coi of COI_DEFINITIONS) {
            console.log(`${coi.icon} ${coi.coiId} (${coi.name})`);
            console.log(`   Members: ${coi.memberCountries.length} countries`);
            console.log(`   Status: ${coi.status}`);
            if (coi.mutuallyExclusiveWith && coi.mutuallyExclusiveWith.length > 0) {
                console.log(`   Excludes: ${coi.mutuallyExclusiveWith.slice(0, 3).join(', ')}${coi.mutuallyExclusiveWith.length > 3 ? '...' : ''}`);
            }
            if (coi.subsetOf) {
                console.log(`   Subset of: ${coi.subsetOf}`);
            }
            if (coi.supersetOf && coi.supersetOf.length > 0) {
                console.log(`   Superset of: ${coi.supersetOf.join(', ')}`);
            }
            console.log('');
        }

        // Count unique countries
        const allCountries = new Set<string>();
        COI_DEFINITIONS.forEach(def => {
            def.memberCountries.forEach(c => allCountries.add(c));
        });

        console.log(`📍 Total COIs: ${COI_DEFINITIONS.length}`);
        console.log(`🌍 Total Countries: ${allCountries.size}`);
        console.log(`✅ COI Keys database initialized successfully!\n`);

    } catch (error) {
        console.error('❌ Error initializing COI Keys:', error);
        process.exit(1);
    } finally {
        await client.close();
        console.log('👋 MongoDB connection closed\n');
    }
}

// Properly handle async main function
main()
    .then(() => {
        console.log('✅ COI Keys initialization complete - exiting\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
