/**
 * DIVE V3 - Seed Spanish-Compatible Test Resources
 * 
 * Creates test resources for Spain SAML authentication and authorization testing:
 * - NATO documents releasable to Spain
 * - Spanish-only documents
 * - Multi-nation coalition documents
 * - Various classification levels
 * - COI-tagged resources (NATO-COSMIC, OTAN-ESP, FVEY-OBSERVER)
 * 
 * Usage:
 *   ts-node scripts/seed-spanish-resources.ts
 *   or
 *   npm run seed:spanish
 */

import mongoose from 'mongoose';

// MongoDB connection
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/dive-v3';

// Resource interface (matches backend model)
interface IResource {
    resourceId: string;
    title: string;
    classification: string;
    releasabilityTo: string[];
    COI?: string[];
    coiOperator?: 'ALL' | 'ANY';
    creationDate?: string;
    encrypted: boolean;
    content?: string;
    metadata?: Record<string, any>;
}

// Spanish test resources
const SPANISH_RESOURCES: IResource[] = [
    // Resource 1: NATO SECRET - Spain releasable, NATO-COSMIC COI
    {
        resourceId: 'esp-nato-doc-001',
        title: 'NATO Southern Command Intelligence Briefing',
        classification: 'SECRET',
        releasabilityTo: ['USA', 'ESP', 'GBR', 'FRA', 'DEU', 'ITA'],
        COI: ['NATO-COSMIC'],
        coiOperator: 'ANY',
        creationDate: new Date('2025-01-15').toISOString(),
        encrypted: false,
        content: `NATO SOUTHERN COMMAND - INTELLIGENCE BRIEFING

Classification: SECRET // REL TO USA, ESP, GBR, FRA, DEU, ITA
COI: NATO-COSMIC

SUBJECT: Mediterranean Maritime Security Assessment Q1 2025

EXECUTIVE SUMMARY:
This briefing provides an overview of maritime security threats in the Mediterranean region relevant to NATO Southern Command operations.

KEY POINTS:
1. Enhanced cooperation with Spanish Navy required for Operation Sea Guardian
2. Joint intelligence sharing protocols active
3. Coalition maritime patrol coordination via NATO COSMIC channels

DISTRIBUTION: NATO-COSMIC personnel only
REVIEW DATE: 2025-07-15`,
        metadata: {
            author: 'NATO SOUTHCOM Intelligence Division',
            createdBy: 'admin@nato.int',
            organization: 'NATO SOUTHCOM'
        }
    },

    // Resource 2: Spain-only CONFIDENTIAL document
    {
        resourceId: 'esp-only-doc-002',
        title: 'Spanish Defense Modernization Plan 2025-2030',
        classification: 'CONFIDENTIAL',
        releasabilityTo: ['ESP'],
        COI: ['OTAN-ESP'],
        coiOperator: 'ANY',
        creationDate: new Date('2025-02-01').toISOString(),
        encrypted: false,
        content: `MINISTERIO DE DEFENSA DE ESPAÑA

Classification: CONFIDENCIAL // SOLO ESP
COI: OTAN-ESP

ASUNTO: Plan de Modernización de la Defensa 2025-2030

RESUMEN:
Este documento describe el plan estratégico para la modernización de las Fuerzas Armadas Españolas en el período 2025-2030.

PUNTOS CLAVE:
1. Inversión en capacidades cibernéticas
2. Modernización de la flota naval
3. Integración con sistemas NATO

DISTRIBUCIÓN: Solo personal autorizado del Ministerio de Defensa de España
FECHA DE REVISIÓN: 2030-12-31`,
        metadata: {
            author: 'Estado Mayor de la Defensa',
            createdBy: 'planning@defensa.gob.es',
            organization: 'Ministerio de Defensa de España'
        }
    },

    // Resource 3: Multi-nation UNCLASSIFIED (public)
    {
        resourceId: 'esp-public-doc-003',
        title: 'NATO Partnership for Peace Exercise Schedule 2025',
        classification: 'UNCLASSIFIED',
        releasabilityTo: ['USA', 'ESP', 'GBR', 'FRA', 'DEU', 'ITA', 'CAN', 'NLD', 'BEL', 'PRT'],
        COI: [],
        coiOperator: 'ANY',
        creationDate: new Date('2025-01-01').toISOString(),
        encrypted: false,
        content: `NATO PARTNERSHIP FOR PEACE - EXERCISE SCHEDULE 2025

Classification: UNCLASSIFIED // PUBLIC RELEASE

UPCOMING EXERCISES:
- Exercise Noble Jump 2025: May 15-30 (Spain, Germany, Poland)
- Exercise Trident Juncture 2025: October 10-25 (Multi-nation)
- Exercise Dynamic Mongoose 2025: July 1-15 (Naval exercise, Mediterranean)

Spain participation confirmed for all exercises.

Contact: exercises@nato.int`,
        metadata: {
            author: 'NATO Public Affairs',
            createdBy: 'public@nato.int',
            organization: 'NATO HQ'
        }
    },

    // Resource 4: TOP_SECRET - Should DENY for juan.garcia (SECRET clearance)
    {
        resourceId: 'esp-top-secret-doc-004',
        title: 'NATO Nuclear Sharing Arrangements - COSMIC TOP SECRET',
        classification: 'TOP_SECRET',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'ESP'],
        COI: ['NATO-COSMIC'],
        coiOperator: 'ALL',
        creationDate: new Date('2025-03-01').toISOString(),
        encrypted: true,
        content: '[ENCRYPTED CONTENT - Requires TOP_SECRET clearance and KAS key retrieval]',
        metadata: {
            author: 'NATO Nuclear Planning Group',
            createdBy: 'npg@nato.int',
            organization: 'NATO HQ',
            requiresKAS: true
        }
    },

    // Resource 5: USA-only - Should DENY for Spanish users (country check)
    {
        resourceId: 'usa-only-doc-005',
        title: 'US CENTCOM Operations Plan - SECRET',
        classification: 'SECRET',
        releasabilityTo: ['USA'],
        COI: ['US-ONLY'],
        coiOperator: 'ALL',
        creationDate: new Date('2025-02-15').toISOString(),
        encrypted: false,
        content: `UNITED STATES CENTRAL COMMAND

Classification: SECRET // NOFORN (No Foreign Nationals)
COI: US-ONLY

This document contains US-only operational planning details not releasable to foreign nationals, including coalition partners.

DISTRIBUTION: US personnel only`,
        metadata: {
            author: 'US CENTCOM',
            createdBy: 'admin@centcom.mil',
            organization: 'US Department of Defense'
        }
    },

    // Resource 6: FVEY - Should DENY for Spanish users (COI check)
    {
        resourceId: 'fvey-doc-006',
        title: 'Five Eyes Intelligence Assessment - SECRET',
        classification: 'SECRET',
        releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        COI: ['FVEY'],
        coiOperator: 'ALL',
        creationDate: new Date('2025-01-20').toISOString(),
        encrypted: false,
        content: `FIVE EYES INTELLIGENCE ASSESSMENT

Classification: SECRET // FVEY
COI: FVEY

This intelligence assessment is restricted to Five Eyes partners only.

DISTRIBUTION: FVEY personnel only (USA, GBR, CAN, AUS, NZL)`,
        metadata: {
            author: 'Five Eyes Intelligence Community',
            createdBy: 'fvey@classified.int',
            organization: 'FVEY IC'
        }
    },

    // Resource 7: Spanish CONFIDENTIAL with OTAN-ESP COI
    {
        resourceId: 'esp-bilateral-doc-007',
        title: 'Spain-NATO Bilateral Cooperation Agreement',
        classification: 'CONFIDENTIAL',
        releasabilityTo: ['ESP', 'USA'],
        COI: ['OTAN-ESP', 'NATO'],
        coiOperator: 'ANY',
        creationDate: new Date('2025-01-10').toISOString(),
        encrypted: false,
        content: `SPAIN-NATO BILATERAL COOPERATION AGREEMENT

Classification: CONFIDENCIAL // ESP, USA
COI: OTAN-ESP, NATO

This document outlines the bilateral cooperation framework between Spain and NATO for 2025-2030.

KEY AREAS:
1. Joint training exercises
2. Intelligence sharing protocols
3. Equipment standardization
4. Cyber defense collaboration

DISTRIBUTION: Authorized ESP and USA personnel`,
        metadata: {
            author: 'Spain-NATO Liaison Office',
            createdBy: 'liaison@defensa.gob.es',
            organization: 'Ministerio de Defensa de España'
        }
    },

    // Resource 8: Future-dated embargo (should DENY until date passes)
    {
        resourceId: 'esp-embargoed-doc-008',
        title: 'NATO Strategic Review 2026 (Embargoed)',
        classification: 'SECRET',
        releasabilityTo: ['USA', 'ESP', 'GBR', 'FRA', 'DEU'],
        COI: ['NATO-COSMIC'],
        coiOperator: 'ANY',
        creationDate: new Date('2026-06-01').toISOString(), // Future date - embargoed
        encrypted: false,
        content: `NATO STRATEGIC REVIEW 2026

Classification: SECRET // REL TO USA, ESP, GBR, FRA, DEU
COI: NATO-COSMIC
EMBARGO: Until 2026-06-01

This document is under embargo until June 1, 2026.

CONTENT: [Redacted until embargo lifts]`,
        metadata: {
            author: 'NATO Strategic Planning',
            createdBy: 'planning@nato.int',
            organization: 'NATO HQ',
            embargoUntil: '2026-06-01'
        }
    }
];

// Resource model (inline for seeding)
const resourceSchema = new mongoose.Schema({
    resourceId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    classification: { type: String, required: true },
    releasabilityTo: [String],
    COI: [String],
    coiOperator: { type: String, enum: ['ALL', 'ANY'], default: 'ANY' },
    creationDate: String,
    encrypted: { type: Boolean, default: false },
    content: String,
    metadata: mongoose.Schema.Types.Mixed
});

const Resource = mongoose.model('Resource', resourceSchema, 'resources');

/**
 * Seed Spanish resources into MongoDB
 */
async function seedSpanishResources() {
    try {
        console.log('🇪🇸 Spain SAML Resource Seeding Script');
        console.log('=====================================\n');

        // Connect to MongoDB
        console.log(`Connecting to MongoDB: ${MONGO_URL}`);
        await mongoose.connect(MONGO_URL);
        console.log('✓ Connected to MongoDB\n');

        // Delete existing Spanish test resources
        console.log('Removing existing Spanish test resources...');
        const deleteResult = await Resource.deleteMany({
            resourceId: { $in: SPANISH_RESOURCES.map(r => r.resourceId) }
        });
        console.log(`✓ Removed ${deleteResult.deletedCount} existing resources\n`);

        // Insert new resources
        console.log('Inserting Spanish test resources...\n');

        for (const resource of SPANISH_RESOURCES) {
            await Resource.create(resource);
            console.log(`✓ ${resource.resourceId}: ${resource.title}`);
            console.log(`  Classification: ${resource.classification}`);
            console.log(`  Releasable to: ${resource.releasabilityTo.join(', ')}`);
            console.log(`  COI: ${resource.COI?.join(', ') || 'None'}`);
            console.log('');
        }

        console.log(`✅ Successfully seeded ${SPANISH_RESOURCES.length} Spanish test resources\n`);

        // Summary
        console.log('RESOURCE SUMMARY:');
        console.log('=================');
        console.log(`UNCLASSIFIED: ${SPANISH_RESOURCES.filter(r => r.classification === 'UNCLASSIFIED').length}`);
        console.log(`CONFIDENTIAL: ${SPANISH_RESOURCES.filter(r => r.classification === 'CONFIDENTIAL').length}`);
        console.log(`SECRET: ${SPANISH_RESOURCES.filter(r => r.classification === 'SECRET').length}`);
        console.log(`TOP_SECRET: ${SPANISH_RESOURCES.filter(r => r.classification === 'TOP_SECRET').length}`);
        console.log('');
        console.log(`ESP releasable: ${SPANISH_RESOURCES.filter(r => r.releasabilityTo.includes('ESP')).length}`);
        console.log(`USA only: ${SPANISH_RESOURCES.filter(r => r.releasabilityTo.includes('USA') && !r.releasabilityTo.includes('ESP')).length}`);
        console.log('');

        console.log('\nTEST SCENARIOS:');
        console.log('===============');
        console.log('1. juan.garcia (SECRET/ESP/NATO-COSMIC) → esp-nato-doc-001: ALLOW');
        console.log('2. carlos.fernandez (UNCLASSIFIED/ESP) → esp-nato-doc-001: DENY (clearance)');
        console.log('3. juan.garcia → esp-top-secret-doc-004: DENY (clearance)');
        console.log('4. juan.garcia → usa-only-doc-005: DENY (country)');
        console.log('5. juan.garcia → fvey-doc-006: DENY (COI)');
        console.log('6. elena.sanchez (TOP_SECRET/ESP) → esp-top-secret-doc-004: ALLOW');
        console.log('7. maria.rodriguez (CONFIDENTIAL/ESP) → esp-only-doc-002: ALLOW');
        console.log('8. Any user → esp-embargoed-doc-008: DENY (embargo)');
        console.log('');

    } catch (error) {
        console.error('❌ Error seeding resources:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('✓ Disconnected from MongoDB');
    }
}

// Run seeding (auto-execute when run directly)
seedSpanishResources()
    .then(() => {
        console.log('\n✅ Spanish resource seeding complete!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Seeding failed:', error);
        process.exit(1);
    });

export { seedSpanishResources, SPANISH_RESOURCES };

