/**
 * Deployment: Audit Infrastructure Validation
 *
 * Requires live PostgreSQL with audit tables.
 * Skipped during unit tests (SKIP_INTEGRATION_TESTS=true).
 * Run manually: SKIP_INTEGRATION_TESTS=false npx jest deployment/audit-validation
 */

const SKIP = process.env.SKIP_INTEGRATION_TESTS === 'true';

if (SKIP) {
  describe('Deployment: Audit Infrastructure Validation', () => {
    it('skipped — requires live PostgreSQL', () => {
      expect(true).toBe(true);
    });
  });
} else {
  // Dynamic imports to avoid loading pg in unit test context
  const { Pool } = require('pg');
  const { auditService } = require('../../services/audit.service');

  describe('Deployment: Audit Infrastructure Validation', () => {
    let pgPool: any;

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

      await new Promise(resolve => setTimeout(resolve, 1000));

      const result = await pgPool.query(`
        SELECT COUNT(*) as count
        FROM authorization_log
        WHERE request_id = 'test-deployment-validation'
      `);
      expect(parseInt(result.rows[0].count)).toBeGreaterThan(0);
    });
  });
}
