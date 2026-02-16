/**
 * Test Data Seeding for E2E Tests
 * 
 * BEST PRACTICE: Seed test resources as part of test infrastructure
 * 
 * This module provides idempotent test data seeding that:
 * - Runs automatically in globalSetup
 * - Seeds all resources needed by E2E tests
 * - Is safe to run multiple times (upsert operations)
 * - Works in local AND CI environments
 * 
 * Called by: globalSetup.ts (after MongoDB Memory Server starts)
 */

import { MongoClient, Db } from 'mongodb';
import { ClassificationLevel } from '../../types/ztdf.types';

/**
 * Seed test resources into MongoDB
 * 
 * Creates resources required by E2E tests:
 * - Various classification levels
 * - Different releasability combinations
 * - COI scenarios
 * - Country-specific resources
 * 
 * @param mongoUrl MongoDB connection URL (from globalSetup)
 */
export async function seedTestData(mongoUrl: string): Promise<void> {
    const client = new MongoClient(mongoUrl);
    
    try {
        await client.connect();
        const db = client.db('dive-v3-test');
        
        console.log('🌱 Seeding test data...');
        
        // Seed resources
        await seedTestResources(db);

        // Seed COI keys
        await seedCOIKeys(db);

        // Seed COI definitions (coi_definitions is SSOT for COI validation)
        await seedCOIDefinitions(db);

        // Seed trusted issuers (required for JWT validation in integration tests)
        await seedTrustedIssuers(db);

        console.log('✅ Test data seeded successfully');
    } catch (error) {
        console.error('❌ Failed to seed test data:', error);
        throw error;
    } finally {
        await client.close();
    }
}

/**
 * Seed test resources for E2E tests
 */
async function seedTestResources(db: Db): Promise<void> {
    const resources = db.collection('resources');
    
    // Define test resources (used by E2E tests)
    const testResources = [
        // UNCLASSIFIED resources
        {
            resourceId: 'test-unclassified-doc',
            title: 'Test Unclassified Document',
            classification: 'UNCLASSIFIED' as ClassificationLevel,
            releasabilityTo: ['USA', 'GBR', 'CAN', 'FRA', 'DEU'],
            COI: [],
            content: 'This is unclassified test content',
            encrypted: false,
            createdAt: new Date()
        },
        
        // SECRET resources
        {
            resourceId: 'test-secret-doc',
            title: 'Test Secret Document',
            classification: 'SECRET' as ClassificationLevel,
            releasabilityTo: ['USA', 'GBR', 'CAN'],
            COI: ['FVEY'],
            content: 'This is secret test content',
            encrypted: false,
            createdAt: new Date()
        },
        {
            resourceId: 'test-secret-usa',
            title: 'Test Secret USA Only',
            classification: 'SECRET' as ClassificationLevel,
            releasabilityTo: ['USA'],
            COI: ['US-ONLY'],
            content: 'US only secret content',
            encrypted: false,
            createdAt: new Date()
        },
        
        // TOP_SECRET resources
        {
            resourceId: 'test-top-secret-restricted',
            title: 'Test Top Secret Restricted',
            classification: 'TOP_SECRET' as ClassificationLevel,
            releasabilityTo: ['USA'],
            COI: ['US-ONLY'],
            content: 'Top secret restricted content',
            encrypted: false,
            createdAt: new Date()
        },
        
        // NATO resources
        {
            resourceId: 'test-secret-nato',
            title: 'Test NATO Secret',
            classification: 'SECRET' as ClassificationLevel,
            releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'CAN', 'ESP', 'ITA', 'NLD', 'POL'],  // All NATO test countries
            COI: ['NATO'],
            content: 'NATO coalition document',
            encrypted: false,
            createdAt: new Date()
        },
        
        // FVEY resources
        {
            resourceId: 'test-secret-fvey',
            title: 'Test FVEY Secret',
            classification: 'SECRET' as ClassificationLevel,
            releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
            COI: ['FVEY'],
            content: 'Five Eyes intelligence',
            encrypted: false,
            createdAt: new Date()
        },
        {
            resourceId: 'test-secret-fvey-only',
            title: 'Test FVEY Only',
            classification: 'SECRET' as ClassificationLevel,
            releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
            COI: ['FVEY'],
            content: 'FVEY exclusive content',
            encrypted: false,
            createdAt: new Date()
        },
        
        // Bilateral resources
        {
            resourceId: 'test-secret-usa-gbr-only',
            title: 'Test USA-GBR Bilateral',
            classification: 'SECRET' as ClassificationLevel,
            releasabilityTo: ['USA', 'GBR'],
            COI: ['GBR-US'],
            content: 'USA-UK bilateral intelligence',
            encrypted: false,
            createdAt: new Date()
        },
    ];
    
    // Upsert resources (idempotent - safe to run multiple times)
    const operations = testResources.map(resource => ({
        updateOne: {
            filter: { resourceId: resource.resourceId },
            update: { $set: resource },
            upsert: true
        }
    }));
    
    if (operations.length > 0) {
        await resources.bulkWrite(operations);
        console.log(`   ✓ Seeded ${testResources.length} test resources`);
    }
}

/**
 * Seed COI keys for validation tests
 */
async function seedCOIKeys(db: Db): Promise<void> {
    const coiKeys = db.collection('coi_keys');
    
    const testCOIs = [
        {
            coiId: 'US-ONLY',
            name: 'US Only',
            description: 'US Only - No Foreign Nationals',
            memberCountries: ['USA'],
            status: 'active',
            color: '#DC2626',
            icon: '🇺🇸',
            resourceCount: 0,
            algorithm: 'AES-256-GCM',
            keyVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        {
            coiId: 'CAN-US',
            name: 'Canada-US',
            description: 'Canada-US bilateral sharing',
            memberCountries: ['CAN', 'USA'],
            status: 'active',
            color: '#059669',
            icon: '🤝',
            resourceCount: 0,
            algorithm: 'AES-256-GCM',
            keyVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        {
            coiId: 'GBR-US',
            name: 'UK-US',
            description: 'United Kingdom-US bilateral sharing',
            memberCountries: ['GBR', 'USA'],
            status: 'active',
            color: '#0284C7',
            icon: '🤝',
            resourceCount: 0,
            algorithm: 'AES-256-GCM',
            keyVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        {
            coiId: 'FVEY',
            name: 'Five Eyes',
            description: 'Five Eyes intelligence alliance',
            memberCountries: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
            status: 'active',
            color: '#8B5CF6',
            icon: '👁️',
            resourceCount: 0,
            algorithm: 'AES-256-GCM',
            keyVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        {
            coiId: 'NATO',
            name: 'NATO',
            description: 'North Atlantic Treaty Organization',
            memberCountries: [
                'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
                'DEU', 'GBR', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD',
                'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'TUR', 'USA'
            ],
            status: 'active',
            color: '#3B82F6',
            icon: '🛡️',
            resourceCount: 0,
            algorithm: 'AES-256-GCM',
            keyVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        {
            coiId: 'NATO-COSMIC',
            name: 'NATO COSMIC TOP SECRET',
            description: 'NATO highest classification level',
            memberCountries: [
                'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
                'DEU', 'GBR', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD',
                'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'TUR', 'USA'
            ],
            status: 'active',
            color: '#7C3AED',
            icon: '🌌',
            resourceCount: 0,
            algorithm: 'AES-256-GCM',
            keyVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        {
            coiId: 'AUKUS',
            name: 'AUKUS',
            description: 'Australia-UK-US Security Partnership',
            memberCountries: ['AUS', 'GBR', 'USA'],
            status: 'active',
            color: '#F59E0B',
            icon: '🔱',
            resourceCount: 0,
            algorithm: 'AES-256-GCM',
            keyVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date()
        },
    ];
    
    // Upsert COI keys (idempotent)
    const operations = testCOIs.map(coi => ({
        updateOne: {
            filter: { coiId: coi.coiId },
            update: { $set: coi },
            upsert: true
        }
    }));
    
    if (operations.length > 0) {
        await coiKeys.bulkWrite(operations);
        console.log(`   ✓ Seeded ${testCOIs.length} COI keys`);
    }
}

/**
 * Seed COI definitions (coi_definitions is the SSOT collection for COI validation)
 */
async function seedCOIDefinitions(db: Db): Promise<void> {
    const natoMembers = [
        'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
        'DEU', 'GBR', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD',
        'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'TUR', 'USA'
    ];

    const coiDefinitions = [
        { coiId: 'US-ONLY', name: 'US Only', type: 'country-based', members: ['USA'] },
        { coiId: 'CAN-US', name: 'Canada-US', type: 'country-based', members: ['CAN', 'USA'] },
        { coiId: 'GBR-US', name: 'UK-US', type: 'country-based', members: ['GBR', 'USA'] },
        { coiId: 'FRA-US', name: 'France-US', type: 'country-based', members: ['FRA', 'USA'] },
        { coiId: 'FVEY', name: 'Five Eyes', type: 'coalition', members: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'] },
        { coiId: 'NATO', name: 'NATO', type: 'coalition', members: natoMembers },
        { coiId: 'NATO-COSMIC', name: 'NATO COSMIC TOP SECRET', type: 'coalition', members: natoMembers },
        { coiId: 'AUKUS', name: 'AUKUS', type: 'coalition', members: ['AUS', 'GBR', 'USA'] },
    ].map(def => ({
        ...def,
        description: `COI: ${def.name}`,
        mutable: false,
        autoUpdate: false,
        priority: 1,
        metadata: { createdAt: new Date(), updatedAt: new Date(), source: 'manual' as const },
        enabled: true
    }));

    const operations = coiDefinitions.map(def => ({
        updateOne: {
            filter: { coiId: def.coiId },
            update: { $set: def },
            upsert: true
        }
    }));

    if (operations.length > 0) {
        await db.collection('coi_definitions').bulkWrite(operations);
        console.log(`   ✓ Seeded ${coiDefinitions.length} COI definitions`);
    }
}

/**
 * Seed trusted issuers for JWT validation in integration tests
 */
async function seedTrustedIssuers(db: Db): Promise<void> {
    const issuers = [
        {
            issuerUrl: 'http://localhost:8081/realms/dive-v3-broker-usa',
            tenant: 'USA',
            name: 'Test Keycloak Instance',
            country: 'USA',
            trustLevel: 'DEVELOPMENT',
            realm: 'dive-v3-broker-usa',
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    ];

    const operations = issuers.map(issuer => ({
        updateOne: {
            filter: { issuerUrl: issuer.issuerUrl },
            update: { $set: issuer },
            upsert: true
        }
    }));

    if (operations.length > 0) {
        await db.collection('trusted_issuers').bulkWrite(operations);
        console.log(`   ✓ Seeded ${issuers.length} trusted issuers`);
    }
}

/**
 * Clear test data (for cleanup between test runs if needed)
 */
export async function clearTestData(mongoUrl: string): Promise<void> {
    const client = new MongoClient(mongoUrl);
    
    try {
        await client.connect();
        const db = client.db('dive-v3-test');
        
        // Clear collections
        await db.collection('resources').deleteMany({});
        await db.collection('coi_keys').deleteMany({});
        
        console.log('🧹 Test data cleared');
    } catch (error) {
        console.error('Error clearing test data:', error);
    } finally {
        await client.close();
    }
}
