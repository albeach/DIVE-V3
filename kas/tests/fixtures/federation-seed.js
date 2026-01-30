// ACP-240 KAS Phase 3.5: MongoDB Seed Data for 3-KAS Federation Testing
// Seeds federation_spokes collection with USA, FRA, GBR KAS instances

db = db.getSiblingDB('dive-v3-kas-test');

// Drop existing data for clean test environment
db.federation_spokes.drop();

// Insert KAS federation registry
db.federation_spokes.insertMany([
  {
    spokeId: "kas-usa",
    instanceCode: "USA",
    organization: "United States",
    kasUrl: "https://kas-usa:8080/rewrap",
    trustLevel: "high",
    supportedCountries: ["USA", "CAN", "GBR"],
    supportedCOIs: ["US-ONLY", "FVEY", "NATO"],
    authMethod: "jwt",
    capabilities: {
      rewrap: true,
      dpop: true,
      federation: true,
      policyBinding: true,
      signatureVerification: true
    },
    federationAgreements: {
      "kas-fra": {
        maxClassification: "SECRET",
        allowedCOIs: ["NATO", "FVEY"],
        allowedCountries: ["FRA", "DEU", "BEL"],
        mtlsRequired: true,
        signatureRequired: true,
        maxDepth: 3
      },
      "kas-gbr": {
        maxClassification: "TOP_SECRET",
        allowedCOIs: ["FVEY", "NATO", "AUKUS"],
        allowedCountries: ["GBR", "AUS", "NZL"],
        mtlsRequired: true,
        signatureRequired: true,
        maxDepth: 3
      }
    },
    mtlsConfig: {
      enabled: true,
      clientCertPath: "/certs/usa/client.crt",
      clientKeyPath: "/certs/usa/client.key",
      caCertPath: "/certs/ca/ca.crt"
    },
    metadata: {
      version: "1.0.0-acp240",
      contact: "kas-admin@usa.mil",
      description: "USA Hub KAS - Primary Federation Point",
      lastVerified: "2026-01-30T00:00:00Z",
      circuitBreakerConfig: {
        errorThreshold: 50,
        timeout: 60000,
        resetTimeout: 30000
      }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    spokeId: "kas-fra",
    instanceCode: "FRA",
    organization: "France",
    kasUrl: "https://kas-fra:8080/rewrap",
    trustLevel: "high",
    supportedCountries: ["FRA", "DEU", "BEL"],
    supportedCOIs: ["NATO", "EU-RESTRICTED"],
    authMethod: "jwt",
    capabilities: {
      rewrap: true,
      dpop: true,
      federation: true,
      policyBinding: true,
      signatureVerification: true
    },
    federationAgreements: {
      "kas-usa": {
        maxClassification: "SECRET",
        allowedCOIs: ["NATO", "FVEY"],
        allowedCountries: ["USA", "CAN", "GBR"],
        mtlsRequired: true,
        signatureRequired: true,
        maxDepth: 3
      },
      "kas-gbr": {
        maxClassification: "SECRET",
        allowedCOIs: ["NATO"],
        allowedCountries: ["GBR"],
        mtlsRequired: true,
        signatureRequired: true,
        maxDepth: 3
      }
    },
    mtlsConfig: {
      enabled: true,
      clientCertPath: "/certs/fra/client.crt",
      clientKeyPath: "/certs/fra/client.key",
      caCertPath: "/certs/ca/ca.crt"
    },
    metadata: {
      version: "1.0.0-acp240",
      contact: "kas-admin@defense.gouv.fr",
      description: "France Spoke KAS - NATO Partner",
      lastVerified: "2026-01-30T00:00:00Z",
      circuitBreakerConfig: {
        errorThreshold: 50,
        timeout: 60000,
        resetTimeout: 30000
      }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    spokeId: "kas-gbr",
    instanceCode: "GBR",
    organization: "United Kingdom",
    kasUrl: "https://kas-gbr:8080/rewrap",
    trustLevel: "high",
    supportedCountries: ["GBR", "USA", "CAN"],
    supportedCOIs: ["FVEY", "NATO", "AUKUS"],
    authMethod: "jwt",
    capabilities: {
      rewrap: true,
      dpop: true,
      federation: true,
      policyBinding: true,
      signatureVerification: true
    },
    federationAgreements: {
      "kas-usa": {
        maxClassification: "TOP_SECRET",
        allowedCOIs: ["FVEY", "NATO", "AUKUS"],
        allowedCountries: ["USA", "CAN", "AUS", "NZL"],
        mtlsRequired: true,
        signatureRequired: true,
        maxDepth: 3
      },
      "kas-fra": {
        maxClassification: "SECRET",
        allowedCOIs: ["NATO"],
        allowedCountries: ["FRA", "DEU"],
        mtlsRequired: true,
        signatureRequired: true,
        maxDepth: 3
      }
    },
    mtlsConfig: {
      enabled: true,
      clientCertPath: "/certs/gbr/client.crt",
      clientKeyPath: "/certs/gbr/client.key",
      caCertPath: "/certs/ca/ca.crt"
    },
    metadata: {
      version: "1.0.0-acp240",
      contact: "kas-admin@mod.gov.uk",
      description: "UK Spoke KAS - FVEY Partner",
      lastVerified: "2026-01-30T00:00:00Z",
      circuitBreakerConfig: {
        errorThreshold: 50,
        timeout: 60000,
        resetTimeout: 30000
      }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

print('✅ Federation registry seeded with 3 KAS instances (USA, FRA, GBR)');
print('✅ Total documents inserted: ' + db.federation_spokes.countDocuments());

// Create indexes
db.federation_spokes.createIndex({ spokeId: 1 }, { unique: true });
db.federation_spokes.createIndex({ instanceCode: 1 });
db.federation_spokes.createIndex({ kasUrl: 1 });

print('✅ Indexes created');
print('');
print('Federation Registry Summary:');
db.federation_spokes.find().forEach(spoke => {
  print('   • ' + spoke.spokeId + ' (' + spoke.organization + ')');
  print('     URL: ' + spoke.kasUrl);
  print('     Countries: ' + spoke.supportedCountries.join(', '));
  print('     COIs: ' + spoke.supportedCOIs.join(', '));
  print('     Federation Agreements: ' + Object.keys(spoke.federationAgreements).join(', '));
});
