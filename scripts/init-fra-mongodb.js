// MongoDB Initialization for FRA Instance
// This script runs when MongoDB container starts

// Switch to the dive-v3-fra database
db = db.getSiblingDB('dive-v3-fra');

// Create collections
db.createCollection('resources');
db.createCollection('decision_logs');
db.createCollection('federation_sync');
db.createCollection('audit_trails');

// Create indexes for performance
db.resources.createIndex({ "resourceId": 1 });
db.resources.createIndex({ "classification": 1, "releasabilityTo": 1 });
db.resources.createIndex({ "originRealm": 1 });
db.decision_logs.createIndex({ "correlationId": 1 });
db.decision_logs.createIndex({ "timestamp": -1 });

// Insert sample FRA resources with French-specific data
db.resources.insertMany([
  {
    resourceId: 'FRA-001',
    title: 'Plan de Défense Nationale',
    classification: 'SECRET',
    releasabilityTo: ['FRA', 'USA', 'GBR'],
    COI: ['NATO-COSMIC'],
    originRealm: 'FRA',
    creationDate: new Date('2025-11-01'),
    content: 'Contenu classifié du plan de défense française...',
    encrypted: false,
    metadata: {
      author: 'Ministère des Armées',
      department: 'État-Major',
      language: 'fr'
    }
  },
  {
    resourceId: 'FRA-002',
    title: 'Rapport de Cybersécurité ANSSI',
    classification: 'CONFIDENTIAL',
    releasabilityTo: ['FRA', 'USA'],
    COI: ['FVEY'],
    originRealm: 'FRA',
    creationDate: new Date('2025-11-15'),
    content: 'Analyse des menaces cyber pour le secteur défense...',
    encrypted: false,
    metadata: {
      author: 'ANSSI',
      department: 'Cyber Défense',
      language: 'fr'
    }
  },
  {
    resourceId: 'FRA-003',
    title: 'Coopération Franco-Américaine',
    classification: 'SECRET',
    releasabilityTo: ['FRA', 'USA'],
    COI: ['NATO'],
    originRealm: 'FRA',
    creationDate: new Date('2025-11-20'),
    content: 'Protocole de coopération militaire France-USA...',
    encrypted: true,
    metadata: {
      author: 'Direction Générale',
      department: 'Relations Internationales',
      language: 'fr'
    }
  },
  {
    resourceId: 'FRA-004',
    title: 'Exercice NATO 2025',
    classification: 'UNCLASSIFIED',
    releasabilityTo: ['FRA', 'USA', 'GBR', 'DEU', 'CAN'],
    COI: ['NATO'],
    originRealm: 'FRA',
    creationDate: new Date('2025-11-10'),
    content: 'Planning des exercices conjoints NATO...',
    encrypted: false,
    metadata: {
      author: 'Commandement Opérationnel',
      department: 'Opérations',
      language: 'fr'
    }
  },
  {
    resourceId: 'FRA-005',
    title: 'Technologies Spatiales Défense',
    classification: 'TOP_SECRET',
    releasabilityTo: ['FRA'],
    COI: ['FRA-ONLY'],
    originRealm: 'FRA',
    creationDate: new Date('2025-10-01'),
    content: 'CLASSIFIÉ - Accès restreint France uniquement',
    encrypted: true,
    metadata: {
      author: 'DGA',
      department: 'Spatial Militaire',
      language: 'fr'
    }
  },
  {
    resourceId: 'FRA-006',
    title: 'Rapport FVEY Intelligence',
    classification: 'SECRET',
    releasabilityTo: ['FRA', 'USA', 'GBR', 'CAN', 'AUS'],
    COI: ['FVEY'],
    originRealm: 'FRA',
    creationDate: new Date('2025-11-18'),
    content: 'Intelligence partagée dans le cadre FVEY...',
    encrypted: false,
    metadata: {
      author: 'DGSE',
      department: 'Renseignement',
      language: 'fr'
    }
  }
]);

// Create sample decision logs with French users
db.decision_logs.insertMany([
  {
    timestamp: new Date(),
    correlationId: 'fra-init-001',
    subject: 'marie.dubois@fra.mil',
    clearance: 'SECRET_DEFENSE',
    resource: 'FRA-001',
    action: 'read',
    decision: 'allow',
    reason: 'Clearance and nationality match',
    realm: 'FRA'
  },
  {
    timestamp: new Date(),
    correlationId: 'fra-init-002',
    subject: 'pierre.martin@fra.mil',
    clearance: 'CONFIDENTIEL_DEFENSE',
    resource: 'FRA-002',
    action: 'read',
    decision: 'allow',
    reason: 'Clearance sufficient for CONFIDENTIAL',
    realm: 'FRA'
  }
]);

// Create admin user for MongoDB
db.createUser({
  user: 'fra_admin',
  pwd: 'fra_admin_password',
  roles: [
    { role: 'readWrite', db: 'dive-v3-fra' },
    { role: 'dbAdmin', db: 'dive-v3-fra' }
  ]
});

print('FRA MongoDB initialization complete');
print('Created 6 resources and 2 decision log entries');
print('Database: dive-v3-fra');
print('Collections: resources, decision_logs, federation_sync, audit_trails');