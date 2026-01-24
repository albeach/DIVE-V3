import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';

describe('Deployment: COI SSOT Validation', () => {
  let mongoClient: MongoClient;
  let db: any;

  beforeAll(async () => {
    const mongoUrl = process.env.MONGODB_URL || 'mongodb://admin:password@localhost:27017?authSource=admin&directConnection=true';
    mongoClient = new MongoClient(mongoUrl);
    await mongoClient.connect();
    const dbName = process.env.MONGODB_DATABASE || 'dive-v3-hub';
    db = mongoClient.db(dbName);
  });

  afterAll(async () => {
    await mongoClient.close();
  });

  it('should have exactly 22 COI definitions in MongoDB', async () => {
    const count = await db.collection('coi_definitions').countDocuments();
    expect(count).toBe(22);
  });

  it('should have all required COIs', async () => {
    const cois = await db.collection('coi_definitions').find({}).toArray();
    const coiIds = cois.map(c => c.coiId);
    
    const required = [
      'FVEY', 'NATO', 'NATO-COSMIC', 'US-ONLY',
      'CAN-US', 'GBR-US', 'FRA-US', 'DEU-US',
      'AUKUS', 'QUAD', 'EU-RESTRICTED',
      'NORTHCOM', 'EUCOM', 'PACOM', 'CENTCOM', 'SOCOM',
      'Alpha', 'Beta', 'Gamma',
      'TEST-COI', 'NEW-COI', 'PACIFIC-ALLIANCE'
    ];
    
    expect(coiIds.sort()).toEqual(required.sort());
  });

  it('should have OPAL file matching MongoDB count', async () => {
    const opalFilePath = path.join(process.cwd(), 'data', 'opal', 'coi_members.json');
    expect(fs.existsSync(opalFilePath)).toBe(true);
    
    const opalData = JSON.parse(fs.readFileSync(opalFilePath, 'utf-8'));
    const opalCOIs = Object.keys(opalData);
    
    const mongoCount = await db.collection('coi_definitions').countDocuments();
    expect(opalCOIs.length).toBe(mongoCount);
    expect(opalCOIs.length).toBe(22);
  });
});
