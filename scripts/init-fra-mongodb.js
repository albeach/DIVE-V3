// MongoDB Initialization Script for FRA Instance
// GAP-003: Resource namespacing with FRA- prefix
// GAP-010: MongoDB isolation per realm

// Switch to FRA database
db = db.getSiblingDB('dive-v3-fra');

// Create admin user for FRA database
db.createUser({
  user: 'fra_admin',
  pwd: 'fra_admin_password',
  roles: [
    { role: 'readWrite', db: 'dive-v3-fra' },
    { role: 'dbAdmin', db: 'dive-v3-fra' }
  ]
});

// Create collections
db.createCollection('resources');
db.createCollection('decision_logs');
db.createCollection('federation_sync');
db.createCollection('audit_trails');

// Create indexes for performance
db.resources.createIndex({ 'resourceId': 1 }, { unique: true });
db.resources.createIndex({ 'classification': 1 });
db.resources.createIndex({ 'releasabilityTo': 1 });
db.resources.createIndex({ 'originRealm': 1 });
db.resources.createIndex({ 'lastModified': -1 });

db.decision_logs.createIndex({ 'timestamp': -1 });
db.decision_logs.createIndex({ 'subject': 1 });
db.decision_logs.createIndex({ 'resourceId': 1 });
db.decision_logs.createIndex({ 'decision': 1 });
db.decision_logs.createIndex({ 'correlationId': 1 });

db.federation_sync.createIndex({ 'syncTimestamp': -1 });
db.federation_sync.createIndex({ 'targetRealm': 1 });
db.federation_sync.createIndex({ 'status': 1 });

// Insert sample FRA resources with proper namespacing
db.resources.insertMany([
  {
    resourceId: 'FRA-001',
    title: 'Plan de Défense Nationale',
    classification: 'SECRET',
    releasabilityTo: ['FRA', 'USA', 'GBR'],
    COI: ['NATO-COSMIC'],
    originRealm: 'FRA',
    creationDate: new Date('2025-11-01'),
    version: 1,
    lastModified: new Date(),
    content: 'Contenu classifié du plan de défense...',
    encrypted: false,
    metadata: {
      author: 'Ministère des Armées',
      department: 'État-Major',
      language: 'fr'
    }
  },
  {
    resourceId: 'FRA-002',
    title: 'Rapport de Renseignement Tactique',
    classification: 'CONFIDENTIAL',
    releasabilityTo: ['FRA', 'USA', 'CAN', 'GBR', 'AUS'],
    COI: ['FVEY'],
    originRealm: 'FRA',
    creationDate: new Date('2025-11-10'),
    version: 1,
    lastModified: new Date(),
    content: 'Analyse tactique de la région...',
    encrypted: false,
    metadata: {
      author: 'DGSE',
      department: 'Renseignement',
      language: 'fr'
    }
  },
  {
    resourceId: 'FRA-003',
    title: 'Coordination OTAN - Exercice Maritime',
    classification: 'UNCLASSIFIED',
    releasabilityTo: ['FRA', 'USA', 'GBR', 'DEU', 'ITA', 'ESP', 'POL'],
    COI: ['NATO-COSMIC'],
    originRealm: 'FRA',
    creationDate: new Date('2025-11-15'),
    version: 1,
    lastModified: new Date(),
    content: 'Planning des exercices maritimes conjoints...',
    encrypted: false,
    metadata: {
      author: 'Marine Nationale',
      department: 'Opérations',
      language: 'fr'
    }
  },
  {
    resourceId: 'FRA-004',
    title: 'Protocole de Cyberdéfense',
    classification: 'TOP_SECRET',
    releasabilityTo: ['FRA'],
    COI: ['FR-CYBER'],
    originRealm: 'FRA',
    creationDate: new Date('2025-11-20'),
    version: 1,
    lastModified: new Date(),
    content: null, // Will be encrypted
    encrypted: true,
    encryptedContent: 'BASE64_ENCRYPTED_CONTENT_HERE',
    metadata: {
      author: 'ANSSI',
      department: 'Cyberdéfense',
      language: 'fr',
      kasRequired: true
    }
  },
  {
    resourceId: 'FRA-005',
    title: 'Analyse Géostratégique Europe',
    classification: 'SECRET',
    releasabilityTo: ['FRA', 'DEU', 'ITA', 'ESP'],
    COI: ['EU-CONFIDENTIAL'],
    originRealm: 'FRA',
    creationDate: new Date('2025-11-22'),
    version: 1,
    lastModified: new Date(),
    content: 'Évaluation stratégique de la situation européenne...',
    encrypted: false,
    metadata: {
      author: 'Centre de Planification',
      department: 'Stratégie',
      language: 'fr'
    }
  },
  {
    resourceId: 'FRA-006',
    title: 'Rapport Logistique - Opération Barkhane',
    classification: 'CONFIDENTIAL',
    releasabilityTo: ['FRA', 'USA', 'GBR'],
    COI: ['NATO-COSMIC'],
    originRealm: 'FRA',
    creationDate: new Date('2025-11-23'),
    version: 2,
    lastModified: new Date(),
    content: 'État des ressources et besoins logistiques...',
    encrypted: false,
    metadata: {
      author: 'Armée de Terre',
      department: 'Logistique',
      language: 'fr',
      previousVersion: 1
    }
  }
]);

// Insert sample decision logs with correlation IDs (GAP-004)
db.decision_logs.insertMany([
  {
    timestamp: new Date(),
    correlationId: 'corr-fra-001',
    requestId: 'req-fra-001',
    subject: 'pierre.dubois',
    resourceId: 'FRA-001',
    action: 'read',
    decision: 'ALLOW',
    reason: 'Subject clearance SECRET meets resource classification',
    evaluation: {
      clearanceCheck: 'PASS',
      releasabilityCheck: 'PASS',
      coiCheck: 'PASS'
    },
    originRealm: 'FRA',
    processingTime: 45
  },
  {
    timestamp: new Date(),
    correlationId: 'corr-fra-002',
    requestId: 'req-fra-002',
    subject: 'sophie.bernard',
    resourceId: 'FRA-004',
    action: 'read',
    decision: 'DENY',
    reason: 'Insufficient clearance: UNCLASSIFIED < TOP_SECRET',
    evaluation: {
      clearanceCheck: 'FAIL',
      releasabilityCheck: 'N/A',
      coiCheck: 'N/A'
    },
    originRealm: 'FRA',
    processingTime: 23
  }
]);

// Create view for federation-eligible resources
db.createView(
  'federation_resources',
  'resources',
  [
    {
      $match: {
        $and: [
          { encrypted: false },
          { classification: { $ne: 'TOP_SECRET' } },
          { 'releasabilityTo.1': { $exists: true } } // Has more than one country
        ]
      }
    },
    {
      $project: {
        resourceId: 1,
        title: 1,
        classification: 1,
        releasabilityTo: 1,
        COI: 1,
        originRealm: 1,
        version: 1,
        lastModified: 1
      }
    }
  ]
);

print('FRA MongoDB initialization complete');
print('Database: dive-v3-fra');
print('Collections created: resources, decision_logs, federation_sync, audit_trails');
print('Sample resources inserted: 6 (FRA-001 to FRA-006)');
print('Indexes created for optimal performance');
print('GAP-003: Resource namespacing with FRA- prefix implemented');
print('GAP-004: Correlation IDs in decision logs implemented');
print('GAP-010: MongoDB isolation for FRA realm implemented');
