/**
 * Programmatic COI Keys Initialization
 * Initializes COI keys collection with sample data
 * Run with: node init-coi-keys-programmatic.js
 */

const { MongoClient } = require('mongodb');
const { getMongoDBUrl, getMongoDBName } = require('../dist/utils/mongodb-config');

async function initializeCOIKeys() {
    let client;

    try {
        const MONGODB_URL = getMongoDBUrl();
        const DB_NAME = getMongoDBName();

        console.log('Connecting to MongoDB...');
        client = new MongoClient(MONGODB_URL);
        await client.connect();

        const db = client.db(DB_NAME);
        const collection = db.collection('coi_keys');

        // Clear existing
        await collection.deleteMany({});
        console.log('Cleared existing COI keys');

        // Create indexes
        await collection.createIndex({ coiId: 1 }, { unique: true });
        await collection.createIndex({ status: 1 });
        await collection.createIndex({ memberCountries: 1 });
        console.log('Created indexes');

        // Insert all 15 COIs
        const cois = [
            {coiId: "FVEY", name: "Five Eyes", description: "Intelligence alliance: USA, GBR, CAN, AUS, NZL", memberCountries: ["USA", "GBR", "CAN", "AUS", "NZL"], status: "active", color: "#8B5CF6", icon: "👁️", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()},
            {coiId: "NATO", name: "NATO", description: "North Atlantic Treaty Organization", memberCountries: ["ALB", "BEL", "BGR", "CAN", "HRV", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GBR", "GRC", "HUN", "ISL", "ITA", "LVA", "LTU", "LUX", "MNE", "NLD", "MKD", "NOR", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE", "TUR", "USA"], status: "active", color: "#3B82F6", icon: "⭐", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()},
            {coiId: "NATO-COSMIC", name: "NATO COSMIC", description: "NATO COSMIC TOP SECRET", memberCountries: ["ALB", "BEL", "BGR", "CAN", "HRV", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GBR", "GRC", "HUN", "ISL", "ITA", "LVA", "LTU", "LUX", "MNE", "NLD", "MKD", "NOR", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE", "TUR", "USA"], status: "active", color: "#1E40AF", icon: "🌟", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()},
            {coiId: "US-ONLY", name: "US Only", description: "United States personnel only", memberCountries: ["USA"], status: "active", color: "#DC2626", icon: "🇺🇸", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()},
            {coiId: "CAN-US", name: "Canada-US", description: "Bilateral Canada-US partnership", memberCountries: ["CAN", "USA"], status: "active", color: "#6366F1", icon: "🤝", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()},
            {coiId: "GBR-US", name: "UK-US (UKUSA)", description: "Bilateral UK-US partnership", memberCountries: ["GBR", "USA"], status: "active", color: "#6366F1", icon: "🤝", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()},
            {coiId: "FRA-US", name: "France-US", description: "Bilateral France-US partnership", memberCountries: ["FRA", "USA"], status: "active", color: "#6366F1", icon: "🤝", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()},
            {coiId: "AUKUS", name: "AUKUS", description: "Australia-UK-US trilateral security partnership", memberCountries: ["AUS", "GBR", "USA"], status: "active", color: "#10B981", icon: "🛡️", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()},
            {coiId: "QUAD", name: "QUAD", description: "Quadrilateral Security Dialogue: USA, AUS, IND, JPN", memberCountries: ["USA", "AUS", "IND", "JPN"], status: "active", color: "#10B981", icon: "◆", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()},
            {coiId: "EU-RESTRICTED", name: "EU Restricted", description: "European Union members only", memberCountries: ["AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE"], status: "active", color: "#3B82F6", icon: "🇪🇺", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()},
            {coiId: "NORTHCOM", name: "NORTHCOM", description: "U.S. Northern Command - North American defense", memberCountries: ["USA", "CAN", "MEX"], status: "active", color: "#F59E0B", icon: "🗺️", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()},
            {coiId: "EUCOM", name: "EUCOM", description: "U.S. European Command - European theater", memberCountries: ["USA", "DEU", "GBR", "FRA", "ITA", "ESP", "POL"], status: "active", color: "#F59E0B", icon: "🗺️", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()},
            {coiId: "PACOM", name: "PACOM (INDOPACOM)", description: "U.S. Indo-Pacific Command", memberCountries: ["USA", "JPN", "KOR", "AUS", "NZL", "PHL"], status: "active", color: "#F59E0B", icon: "🗺️", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()},
            {coiId: "CENTCOM", name: "CENTCOM", description: "U.S. Central Command - Middle East theater", memberCountries: ["USA", "SAU", "ARE", "QAT", "KWT", "BHR", "JOR", "EGY"], status: "active", color: "#F59E0B", icon: "🗺️", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()},
            {coiId: "SOCOM", name: "SOCOM", description: "U.S. Special Operations Command - FVEY special ops", memberCountries: ["USA", "GBR", "CAN", "AUS", "NZL"], status: "active", color: "#EF4444", icon: "⚡", resourceCount: 0, algorithm: "AES-256-GCM", keyVersion: 1, createdAt: new Date(), updatedAt: new Date()}
        ];

        const result = await collection.insertMany(cois);
        console.log(`✅ Inserted ${result.insertedCount} COI Keys`);

        // Verify
        const count = await collection.countDocuments();
        console.log(`✅ Verification: Count = ${count}`);

        console.log('\n📊 COI Keys:');
        const allCois = await collection.find({}, { projection: { coiId: 1, name: 1, memberCountries: 1, icon: 1, _id: 0 } }).toArray();
        allCois.forEach(coi => {
            console.log(`  ${coi.icon || '🔑'} ${coi.coiId}: ${coi.name} (${coi.memberCountries.length} countries)`);
        });

    } catch (error) {
        console.error('❌ Error initializing COI keys:', error);
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

initializeCOIKeys().catch(console.error);
