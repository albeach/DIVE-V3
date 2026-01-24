-- =============================================================================
-- DIVE V3 Audit Infrastructure - Database Tables
-- =============================================================================
-- Purpose:
--   Create comprehensive audit logging tables for ACP-240 compliance
--   with 90-day retention and queryable audit trail.
--
-- Tables:
--   1. audit_log: General system events (login, logout, admin actions)
--   2. authorization_log: PEP/PDP authorization decisions  
--   3. federation_log: Cross-instance federation events
--
-- Compliance:
--   - ACP-240: All authorization decisions logged
--   - 90-day retention via automated cleanup job
--   - Indexed for fast queries and reporting
--
-- Date: 2026-01-24
-- Version: 1.0.0
-- =============================================================================

-- Drop existing tables if they exist (clean slate)
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS authorization_log CASCADE;
DROP TABLE IF EXISTS federation_log CASCADE;

-- =============================================================================
-- General Audit Log Table
-- =============================================================================
-- Captures all system events: authentication, admin actions, configuration changes

CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type VARCHAR(100) NOT NULL,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    resource_id VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    decision VARCHAR(20),
    reason TEXT,
    metadata JSONB,
    instance_code VARCHAR(10),
    source_ip INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    
    -- Indexes for fast queries
    CONSTRAINT audit_log_event_type_valid CHECK (event_type IN (
        'LOGIN', 'LOGOUT', 'LOGIN_ERROR', 'LOGOUT_ERROR',
        'MFA_SETUP', 'MFA_VERIFY', 'PASSWORD_CHANGE',
        'ADMIN_ACTION', 'CONFIG_CHANGE', 'USER_CREATE', 'USER_DELETE',
        'RESOURCE_CREATE', 'RESOURCE_DELETE', 'RESOURCE_UPDATE',
        'FEDERATION_LINK', 'FEDERATION_UNLINK',
        'KAS_REGISTER', 'KAS_APPROVE', 'KAS_SUSPEND',
        'COI_UPDATE', 'POLICY_UPDATE', 'OTHER'
    ))
);

-- Indexes for audit_log
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX idx_audit_log_instance ON audit_log(instance_code);
CREATE INDEX idx_audit_log_session ON audit_log(session_id);
CREATE INDEX idx_audit_log_request ON audit_log(request_id);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_id);

-- GIN index for JSONB metadata queries
CREATE INDEX idx_audit_log_metadata ON audit_log USING GIN(metadata);

-- Comment
COMMENT ON TABLE audit_log IS 'ACP-240 compliant audit log for all system events';
COMMENT ON COLUMN audit_log.metadata IS 'Extensible JSONB field for event-specific data';

-- =============================================================================
-- Authorization Decision Log Table
-- =============================================================================
-- Captures all PEP/PDP authorization decisions with full context

CREATE TABLE authorization_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    clearance VARCHAR(50),
    country_code VARCHAR(10),
    coi_memberships TEXT[], -- Array of COI IDs user has
    resource_id VARCHAR(255) NOT NULL,
    classification VARCHAR(50),
    releasability_to TEXT[], -- Array of country codes
    resource_cois TEXT[], -- Array of COI IDs on resource
    decision BOOLEAN NOT NULL,
    reason TEXT,
    opa_decision JSONB, -- Full OPA response
    latency_ms INTEGER,
    instance_code VARCHAR(10),
    source_ip INET,
    user_agent TEXT,
    
    -- Derived fields for analytics
    clearance_check BOOLEAN,
    releasability_check BOOLEAN,
    coi_check BOOLEAN,
    
    CONSTRAINT authorization_log_decision_valid CHECK (decision IN (true, false)),
    CONSTRAINT authorization_log_latency_positive CHECK (latency_ms >= 0)
);

-- Indexes for authorization_log
CREATE INDEX idx_authz_log_timestamp ON authorization_log(timestamp DESC);
CREATE INDEX idx_authz_log_user_id ON authorization_log(user_id);
CREATE INDEX idx_authz_log_resource_id ON authorization_log(resource_id);
CREATE INDEX idx_authz_log_decision ON authorization_log(decision);
CREATE INDEX idx_authz_log_instance ON authorization_log(instance_code);
CREATE INDEX idx_authz_log_request ON authorization_log(request_id);
CREATE INDEX idx_authz_log_clearance ON authorization_log(clearance);
CREATE INDEX idx_authz_log_classification ON authorization_log(classification);

-- Composite indexes for common queries
CREATE INDEX idx_authz_log_user_decision ON authorization_log(user_id, decision, timestamp DESC);
CREATE INDEX idx_authz_log_resource_decision ON authorization_log(resource_id, decision, timestamp DESC);
CREATE INDEX idx_authz_log_deny_reasons ON authorization_log(decision, timestamp DESC) WHERE decision = false;

-- GIN index for OPA decision JSONB queries
CREATE INDEX idx_authz_log_opa_decision ON authorization_log USING GIN(opa_decision);

-- Comment
COMMENT ON TABLE authorization_log IS 'PEP/PDP authorization decisions for ACP-240 compliance and analytics';
COMMENT ON COLUMN authorization_log.opa_decision IS 'Full OPA policy decision response (evaluation_details, obligations, etc.)';

-- =============================================================================
-- Federation Event Log Table
-- =============================================================================
-- Captures all cross-instance federation events

CREATE TABLE federation_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_realm VARCHAR(100) NOT NULL,
    target_realm VARCHAR(100) NOT NULL,
    user_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    metadata JSONB,
    latency_ms INTEGER,
    source_ip INET,
    
    CONSTRAINT federation_log_event_type_valid CHECK (event_type IN (
        'FEDERATION_LOGIN', 'FEDERATION_LOGOUT', 'FEDERATION_ERROR',
        'TOKEN_EXCHANGE', 'ATTRIBUTE_MAPPING',
        'SPOKE_REGISTER', 'SPOKE_APPROVE', 'SPOKE_SUSPEND', 'SPOKE_REVOKE',
        'CROSS_INSTANCE_SEARCH', 'CROSS_INSTANCE_ACCESS',
        'HEARTBEAT', 'SYNC', 'OTHER'
    )),
    CONSTRAINT federation_log_latency_positive CHECK (latency_ms >= 0)
);

-- Indexes for federation_log
CREATE INDEX idx_federation_log_timestamp ON federation_log(timestamp DESC);
CREATE INDEX idx_federation_log_source_realm ON federation_log(source_realm);
CREATE INDEX idx_federation_log_target_realm ON federation_log(target_realm);
CREATE INDEX idx_federation_log_event_type ON federation_log(event_type);
CREATE INDEX idx_federation_log_success ON federation_log(success);
CREATE INDEX idx_federation_log_user ON federation_log(user_id);

-- Composite indexes for federation analytics
CREATE INDEX idx_federation_log_realms ON federation_log(source_realm, target_realm, timestamp DESC);
CREATE INDEX idx_federation_log_errors ON federation_log(success, timestamp DESC) WHERE success = false;

-- GIN index for metadata JSONB queries
CREATE INDEX idx_federation_log_metadata ON federation_log USING GIN(metadata);

-- Comment
COMMENT ON TABLE federation_log IS 'Cross-instance federation events for audit and troubleshooting';
COMMENT ON COLUMN federation_log.metadata IS 'Federation-specific data (attributes, claims, token info)';

-- =============================================================================
-- Audit Retention Policy (90-day requirement)
-- =============================================================================

-- Create function to delete old audit records
CREATE OR REPLACE FUNCTION cleanup_old_audit_records()
RETURNS void AS $$
DECLARE
    cutoff_date TIMESTAMPTZ := NOW() - INTERVAL '90 days';
    deleted_audit_count INTEGER;
    deleted_authz_count INTEGER;
    deleted_federation_count INTEGER;
BEGIN
    -- Delete audit_log records older than 90 days
    DELETE FROM audit_log WHERE timestamp < cutoff_date;
    GET DIAGNOSTICS deleted_audit_count = ROW_COUNT;
    
    -- Delete authorization_log records older than 90 days
    DELETE FROM authorization_log WHERE timestamp < cutoff_date;
    GET DIAGNOSTICS deleted_authz_count = ROW_COUNT;
    
    -- Delete federation_log records older than 90 days
    DELETE FROM federation_log WHERE timestamp < cutoff_date;
    GET DIAGNOSTICS deleted_federation_count = ROW_COUNT;
    
    RAISE NOTICE 'Audit cleanup: audit_log=%, authorization_log=%, federation_log=%',
        deleted_audit_count, deleted_authz_count, deleted_federation_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_audit_records() IS 'Delete audit records older than 90 days (ACP-240 retention policy)';

-- =============================================================================
-- Analytics Views
-- =============================================================================

-- View: Recent authorization denials (last 24 hours)
CREATE OR REPLACE VIEW recent_authorization_denials AS
SELECT 
    timestamp,
    user_id,
    clearance,
    resource_id,
    classification,
    reason,
    instance_code
FROM authorization_log
WHERE decision = false
  AND timestamp >= NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

COMMENT ON VIEW recent_authorization_denials IS 'Authorization denials in last 24 hours for security monitoring';

-- View: Federation activity summary
CREATE OR REPLACE VIEW federation_activity_summary AS
SELECT 
    source_realm,
    target_realm,
    event_type,
    COUNT(*) as event_count,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failure_count,
    AVG(latency_ms) as avg_latency_ms,
    MAX(timestamp) as last_event
FROM federation_log
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY source_realm, target_realm, event_type
ORDER BY event_count DESC;

COMMENT ON VIEW federation_activity_summary IS 'Federation activity summary for last 24 hours';

-- =============================================================================
-- Grant Permissions
-- =============================================================================

-- Grant SELECT to read-only audit analyst role (if exists)
-- DO $$ 
-- BEGIN
--     IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_analyst') THEN
--         GRANT SELECT ON audit_log, authorization_log, federation_log TO audit_analyst;
--         GRANT SELECT ON recent_authorization_denials, federation_activity_summary TO audit_analyst;
--     END IF;
-- END $$;

-- =============================================================================
-- Verification Queries
-- =============================================================================

-- Verify tables created
SELECT 
    'audit_log' as table_name,
    COUNT(*) as row_count
FROM audit_log
UNION ALL
SELECT 'authorization_log', COUNT(*) FROM authorization_log
UNION ALL
SELECT 'federation_log', COUNT(*) FROM federation_log;

-- Show table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename IN ('audit_log', 'authorization_log', 'federation_log')
ORDER BY tablename;

\echo '✅ Audit tables created successfully'
\echo '📊 Tables: audit_log, authorization_log, federation_log'
\echo '📈 Views: recent_authorization_denials, federation_activity_summary'  
\echo '🔧 Function: cleanup_old_audit_records() (90-day retention)'
