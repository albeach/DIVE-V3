/**
 * IdP Themes Migration Script
 * 
 * Initializes idp_themes collection with default themes for existing IdPs
 * Creates indexes for performance
 * Sets country-specific flag colors
 * 
 * Phase 5: Database Migrations
 */

import { MongoClient } from 'mongodb';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';

// Default themes for each IdP
const DEFAULT_THEMES = [
    {
        idpAlias: 'usa-realm-broker',
        enabled: true,
        colors: {
            primary: '#B22234',
            secondary: '#FFFFFF',
            accent: '#3C3B6E',
            background: '#F9FAFB',
            text: '#111827'
        },
        background: {
            type: 'gradient',
            blur: 0,
            overlayOpacity: 0.1,
            gradientDirection: 'top-bottom'
        },
        logo: {
            url: '',
            position: 'top-center'
        },
        layout: {
            formPosition: 'center',
            formWidth: '400px',
            cardStyle: 'glassmorphism',
            buttonStyle: 'rounded',
            inputStyle: 'outlined'
        },
        typography: {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 'medium'
        },
        localization: {
            defaultLanguage: 'en',
            enableToggle: true,
            supportedLanguages: ['en', 'fr']
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system'
    },
    {
        idpAlias: 'fra-realm-broker',
        enabled: true,
        colors: {
            primary: '#0055A4',
            secondary: '#FFFFFF',
            accent: '#EF4135',
            background: '#F9FAFB',
            text: '#111827'
        },
        background: {
            type: 'gradient',
            blur: 0,
            overlayOpacity: 0.1,
            gradientDirection: 'top-bottom'
        },
        logo: {
            url: '',
            position: 'top-center'
        },
        layout: {
            formPosition: 'center',
            formWidth: '400px',
            cardStyle: 'glassmorphism',
            buttonStyle: 'rounded',
            inputStyle: 'outlined'
        },
        typography: {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 'medium'
        },
        localization: {
            defaultLanguage: 'fr',
            enableToggle: true,
            supportedLanguages: ['fr', 'en']
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system'
    },
    {
        idpAlias: 'can-realm-broker',
        enabled: true,
        colors: {
            primary: '#FF0000',
            secondary: '#FFFFFF',
            accent: '#FF0000',
            background: '#F9FAFB',
            text: '#111827'
        },
        background: {
            type: 'gradient',
            blur: 0,
            overlayOpacity: 0.1,
            gradientDirection: 'top-bottom'
        },
        logo: {
            url: '',
            position: 'top-center'
        },
        layout: {
            formPosition: 'center',
            formWidth: '400px',
            cardStyle: 'glassmorphism',
            buttonStyle: 'rounded',
            inputStyle: 'outlined'
        },
        typography: {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 'medium'
        },
        localization: {
            defaultLanguage: 'en',
            enableToggle: true,
            supportedLanguages: ['en', 'fr']
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system'
    },
    {
        idpAlias: 'industry-realm-broker',
        enabled: false,
        colors: {
            primary: '#6B46C1',
            secondary: '#FFFFFF',
            accent: '#9333EA',
            background: '#F9FAFB',
            text: '#111827'
        },
        background: {
            type: 'gradient',
            blur: 0,
            overlayOpacity: 0.1,
            gradientDirection: 'top-bottom'
        },
        logo: {
            url: '',
            position: 'top-center'
        },
        layout: {
            formPosition: 'center',
            formWidth: '400px',
            cardStyle: 'glassmorphism',
            buttonStyle: 'rounded',
            inputStyle: 'outlined'
        },
        typography: {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 'medium'
        },
        localization: {
            defaultLanguage: 'en',
            enableToggle: true,
            supportedLanguages: ['en']
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system'
    }
];

async function migrateIdPThemes() {
    let client: MongoClient | null = null;

    try {
        console.log('🔄 Starting IdP themes migration...');

        // Connect to MongoDB
        client = await MongoClient.connect(MONGODB_URL);
        const db = client.db(DB_NAME);
        const collection = db.collection('idp_themes');

        console.log('✅ Connected to MongoDB');

        // Create indexes
        await collection.createIndex({ idpAlias: 1 }, { unique: true });
        await collection.createIndex({ createdBy: 1 });
        await collection.createIndex({ createdAt: -1 });

        console.log('✅ Created indexes');

        // Insert default themes (upsert to avoid duplicates)
        let inserted = 0;
        let updated = 0;

        for (const theme of DEFAULT_THEMES) {
            const result = await collection.updateOne(
                { idpAlias: theme.idpAlias },
                { $setOnInsert: theme },
                { upsert: true }
            );

            if (result.upsertedCount > 0) {
                inserted++;
                console.log(`✅ Created theme for ${theme.idpAlias}`);
            } else {
                updated++;
                console.log(`ℹ️  Theme for ${theme.idpAlias} already exists`);
            }
        }

        console.log('');
        console.log('🎉 Migration complete!');
        console.log(`   - Inserted: ${inserted} theme(s)`);
        console.log(`   - Skipped: ${updated} existing theme(s)`);
        console.log(`   - Total: ${DEFAULT_THEMES.length} theme(s)`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
            console.log('✅ MongoDB connection closed');
        }
    }
}

// Run migration
if (require.main === module) {
    migrateIdPThemes()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Migration error:', error);
            process.exit(1);
        });
}

export { migrateIdPThemes };

