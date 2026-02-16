/**
 * Deployment: Resource Encryption Validation
 *
 * Requires live deployment with encrypted resources and KAS registry.
 * Skipped during unit tests (SKIP_INTEGRATION_TESTS=true).
 * Run manually: SKIP_INTEGRATION_TESTS=false npx jest deployment/encryption-validation
 */

import { MongoClient } from 'mongodb';

const SKIP = process.env.SKIP_INTEGRATION_TESTS === 'true';

if (SKIP) {
  describe('Deployment: Resource Encryption Validation', () => {
    it('skipped — requires live deployment with encrypted resources', () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe('Deployment: Resource Encryption Validation', () => {
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

    it('should have 100% ZTDF encrypted resources', async () => {
      const totalResources = await db.collection('resources').countDocuments();
      const encryptedResources = await db.collection('resources').countDocuments({
        encrypted: true
      });

      expect(totalResources).toBeGreaterThan(0);
      expect(encryptedResources).toBe(totalResources);
    });

    it('should have zero plaintext resources', async () => {
      const plaintextCount = await db.collection('resources').countDocuments({
        encrypted: { $ne: true }
      });

      expect(plaintextCount).toBe(0);
    });

    it('should have all resources with keyAccessObjects', async () => {
      const totalResources = await db.collection('resources').countDocuments();
      const resourcesWithKeys = await db.collection('resources').countDocuments({
        keyAccessObjects: { $exists: true, $ne: [] }
      });

      expect(resourcesWithKeys).toBe(totalResources);
    });

    it('should have approved KAS servers configured', async () => {
      const approvedKAS = await db.collection('kas_registry').countDocuments({
        approved: true
      });

      expect(approvedKAS).toBeGreaterThan(0);
    });
  });
}
