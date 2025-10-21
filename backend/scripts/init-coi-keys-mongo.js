// COI Keys MongoDB Initialization Script (Direct MongoDB Insert)
// Run inside MongoDB container with: mongosh mongodb://admin:password@localhost:27017/dive-v3?authSource=admin < init-coi-keys.js

db = db.getSiblingDB('dive-v3');

// Clear existing
db.coi_keys.deleteMany({});
print("Deleted existing COI keys");

// Create indexes
db.coi_keys.createIndex({ coiId: 1 }, { unique: true });
db.coi_keys.createIndex({ status: 1 });
db.coi_keys.createIndex({ memberCountries: 1 });
print("Created indexes");

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

db.coi_keys.insertMany(cois);
print("\n✅ Inserted", cois.length, "COI Keys");
print("✅ Verification: Count =", db.coi_keys.countDocuments());
print("\n📊 COI Keys:");
db.coi_keys.find({}, {coiId: 1, name: 1, memberCountries: 1, _id: 0}).forEach(c => {
  print(`  ${c.icon || '🔑'} ${c.coiId}: ${c.name} (${c.memberCountries.length} countries)`);
});

