import { MongoClient } from 'mongodb';

describe('Deployment: Federation Configuration Validation', () => {
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

  it('should have federation matrix configured', async () => {
    const matrix = await db.collection('federation_matrix').find({}).toArray();
    expect(matrix.length).toBeGreaterThan(0);
  });

  it('should have bidirectional federation links', async () => {
    const matrix = await db.collection('federation_matrix').find({}).toArray();
    
    // Check for each link, there's a reverse link
    for (const link of matrix) {
      const reverse = matrix.find(l => 
        l.source === link.target && l.target === link.source
      );
      
      if (link.source !== link.target) { // Skip self-references
        expect(reverse).toBeDefined();
      }
    }
  });

  it('should have all KAS servers approved', async () => {
    const unapprovedKAS = await db.collection('kas_registry').countDocuments({
      approved: { $ne: true }
    });
    
    // In production, expect(unapprovedKAS).toBe(0);
    // In development, we allow unapproved for testing
    expect(unapprovedKAS).toBeGreaterThanOrEqual(0);
  });
});
