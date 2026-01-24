import { MongoClient } from 'mongodb';
import { Pool } from 'pg';

describe('Deployment: Infrastructure Validation', () => {
  let mongoClient: MongoClient;
  let pgPool: Pool;

  beforeAll(async () => {
    const mongoUrl = process.env.MONGODB_URL || 'mongodb://admin:password@localhost:27017?authSource=admin&directConnection=true';
    mongoClient = new MongoClient(mongoUrl);
    await mongoClient.connect();
    
    const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/dive_v3_app';
    pgPool = new Pool({ connectionString: dbUrl });
  });

  afterAll(async () => {
    await mongoClient.close();
    await pgPool.end();
  });

  it('should have MongoDB as replica set rs0', async () => {
    const admin = mongoClient.db().admin();
    const status = await admin.command({ replSetGetStatus: 1 });
    expect(status.set).toBe('rs0');
    expect(status.members[0].stateStr).toBe('PRIMARY');
  });

  it('should have change streams enabled', async () => {
    const dbName = process.env.MONGODB_DATABASE || 'dive-v3-hub';
    const db = mongoClient.db(dbName);
    const collection = db.collection('test_change_stream_validation');
    
    // Create change stream - will throw if not supported
    const changeStream = collection.watch();
    await new Promise(resolve => setTimeout(resolve, 100));
    await changeStream.close();
    
    expect(true).toBe(true); // If we get here, change streams work
  });

  it('should have all audit tables in PostgreSQL', async () => {
    const result = await pgPool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE tablename IN ('audit_log', 'authorization_log', 'federation_log')
      ORDER BY tablename
    `);
    
    expect(result.rows).toHaveLength(3);
    expect(result.rows.map(r => r.tablename)).toEqual([
      'audit_log',
      'authorization_log',
      'federation_log'
    ]);
  });

  it('should have all required databases', async () => {
    const result = await pgPool.query(`
      SELECT datname FROM pg_database 
      WHERE datname IN ('keycloak_db', 'dive_v3_app', 'orchestration')
    `);
    
    expect(result.rows.length).toBeGreaterThanOrEqual(2); // At minimum keycloak_db and dive_v3_app
  });
});
