/**
 * Seed sample federation agreements
 * Uses native MongoDB driver (consistent with codebase)
 */

import { getDb, mongoSingleton } from '../utils/mongodb-singleton';

interface IFederationAgreement {
  spId: string;
  spName: string;
  agreementId: string;
  allowedIdPs: string[];
  allowedCountries: string[];
  allowedClassifications: string[];
  maxClassification: string;
  allowedCOIs: string[];
  minAAL: number;
  maxAuthAge: number;
  releaseAttributes: string[];
  effectiveDate: Date;
  expirationDate?: Date;
  status: 'active' | 'suspended' | 'expired';
  createdAt: Date;
  updatedAt: Date;
}

async function seedFederationAgreements() {
  await mongoSingleton.connect();
  const db = getDb();
  const collection = db.collection<IFederationAgreement>('federation_agreements');

  const now = new Date();

  const agreements: IFederationAgreement[] = [
    {
      spId: 'uk-coalition-portal',
      spName: 'United Kingdom Coalition Portal',
      agreementId: 'USA-GBR-2025-001',

      allowedIdPs: ['dive-v3-usa', 'dive-v3-gbr', 'dive-v3-can'],
      allowedCountries: ['USA', 'GBR', 'CAN'], // FVEY partners
      allowedClassifications: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET'],
      maxClassification: 'SECRET',
      allowedCOIs: ['NATO-COSMIC', 'FVEY'],

      minAAL: 2, // AAL2 required
      maxAuthAge: 1800, // 30 minutes

      releaseAttributes: [
        'uniqueID',
        'clearance',
        'countryOfAffiliation',
        'acpCOI',
        'givenName',
        'surname',
      ],

      effectiveDate: new Date('2025-01-01'),
      expirationDate: new Date('2026-12-31'),
      status: 'active',
      createdAt: now,
      updatedAt: now
    },
    {
      spId: 'france-defense-system',
      spName: 'France Ministry of Defense System',
      agreementId: 'USA-FRA-2025-002',

      allowedIdPs: ['dive-v3-usa', 'dive-v3-fra'],
      allowedCountries: ['USA', 'FRA'],
      allowedClassifications: ['UNCLASSIFIED', 'CONFIDENTIAL'],
      maxClassification: 'CONFIDENTIAL',
      allowedCOIs: ['NATO-COSMIC'],

      minAAL: 2,
      maxAuthAge: 3600, // 1 hour

      releaseAttributes: [
        'uniqueID',
        'clearance',
        'countryOfAffiliation',
        'acpCOI',
      ],

      effectiveDate: new Date('2025-06-01'),
      expirationDate: new Date('2026-05-31'),
      status: 'active',
      createdAt: now,
      updatedAt: now
    },
    {
      spId: 'industry-contractor-portal',
      spName: 'Industry Contractor Portal',
      agreementId: 'USA-IND-2025-003',

      allowedIdPs: ['dive-v3-industry'],
      allowedCountries: ['USA'],
      allowedClassifications: ['UNCLASSIFIED'],
      maxClassification: 'UNCLASSIFIED',
      allowedCOIs: [],

      minAAL: 1, // AAL1 for unclassified
      maxAuthAge: 7200, // 2 hours

      // Limited attribute release (pseudonymized)
      releaseAttributes: ['uniqueID'], // Only pseudonymous ID

      effectiveDate: new Date('2025-01-01'),
      status: 'active',
      createdAt: now,
      updatedAt: now
    },
  ];

  // Create indexes
  await collection.createIndex({ spId: 1 }, { unique: true });
  await collection.createIndex({ agreementId: 1 }, { unique: true });
  await collection.createIndex({ status: 1 });

  for (const agreement of agreements) {
    await collection.updateOne(
      { spId: agreement.spId },
      { $set: agreement },
      { upsert: true }
    );
    console.log(`✅ Federation agreement seeded: ${agreement.spId}`);
  }

  console.log(`✅ ${agreements.length} federation agreements created`);
  // Singleton manages lifecycle - no need to close
  process.exit(0);
}

seedFederationAgreements().catch((error) => {
  console.error('Failed to seed federation agreements:', error);
  process.exit(1);
});
