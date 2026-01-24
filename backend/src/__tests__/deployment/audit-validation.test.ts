import { Pool } from 'pg';
import { auditService } from '../../services/audit.service';

describe('Deployment: Audit Infrastructure Validation', () => {
  let pgPool: Pool;

  beforeAll(() => {
    const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/dive_v3_app';
    pgPool = new Pool({ connectionString: dbUrl });
  });

  afterAll(async () => {
    await pgPool.end();
  });

  it('should have 3 audit tables in PostgreSQL', async () => {
    const result = await pgPool.query(`
      SELECT COUNT(*) as count
      FROM pg_tables 
      WHERE tablename IN ('audit_log', 'authorization_log', 'federation_log')
    `);
    
    expect(parseInt(result.rows[0].count)).toBe(3);
  });

  it('should have analytics views created', async () => {
    const result = await pgPool.query(`
      SELECT COUNT(*) as count
      FROM pg_views 
      WHERE viewname IN ('recent_authorization_denials', 'federation_activity_summary')
    `);
    
    expect(parseInt(result.rows[0].count)).toBe(2);
  });

  it('should have 90-day retention function', async () => {
    const result = await pgPool.query(`
      SELECT COUNT(*) as count
      FROM pg_proc 
      WHERE proname = 'cleanup_old_audit_records'
    `);
    
    expect(parseInt(result.rows[0].count)).toBe(1);
  });

  it('should persist audit entries to PostgreSQL', async () => {
    // Generate test audit entry
    auditService.logAccessGrant({
      subject: {
        uniqueID: 'test-user-deployment-validation',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA'
      },
      resource: {
        resourceId: 'test-resource-deployment',
        classification: 'CONFIDENTIAL'
      },
      decision: {
        allow: true,
        reason: 'Deployment validation test'
      },
      context: {
        correlationId: 'test-deployment-validation'
      }
    });

    // Wait for async persistence
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify entry in database
    const result = await pgPool.query(`
      SELECT COUNT(*) as count
      FROM authorization_log
      WHERE request_id = 'test-deployment-validation'
    `);
    
    expect(parseInt(result.rows[0].count)).toBeGreaterThan(0);
  });
});
