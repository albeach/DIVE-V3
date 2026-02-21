-- =============================================================================
-- DIVE V3 Federation State Schema
-- =============================================================================
-- Part of Orchestration Architecture Review Phase 1
-- Creates tables for database-driven federation state management
-- =============================================================================
-- Version: 1.0.0
-- Date: 2026-01-16
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- FEDERATION LINKS TABLE
-- =============================================================================
-- Tracks bidirectional Hub<->Spoke federation relationships
-- Replaces: instances/*/federation-*.json files
-- =============================================================================

CREATE TABLE IF NOT EXISTS federation_links (
    id SERIAL PRIMARY KEY,
    
    -- Link identification
    source_code VARCHAR(3) NOT NULL,           -- e.g., 'usa' (hub) or 'svk' (spoke)
    target_code VARCHAR(3) NOT NULL,           -- e.g., 'svk' (spoke) or 'usa' (hub)
    direction VARCHAR(20) NOT NULL,            -- 'HUB_TO_SPOKE' or 'SPOKE_TO_HUB'
    
    -- Keycloak configuration
    idp_alias VARCHAR(50) NOT NULL,            -- Keycloak IdP alias (e.g., 'svk-idp', 'usa-idp')
    client_id VARCHAR(100),                    -- Keycloak client ID for this federation
    client_secret_hash VARCHAR(64),            -- SHA256 hash of client secret (not plaintext!)
    
    -- State tracking
    status VARCHAR(20) DEFAULT 'PENDING',      -- Current status
    retry_count INTEGER DEFAULT 0,             -- Number of retry attempts
    last_error_code VARCHAR(10),               -- Last error code from spoke-error-codes.sh
    error_message TEXT,                        -- Detailed error message
    
    -- Verification tracking
    last_verified_at TIMESTAMPTZ,              -- Last successful verification
    last_verification_result JSONB,            -- Last verification details
    
    -- Metadata
    metadata JSONB,                            -- Flexible metadata (ports, URLs, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100) DEFAULT 'system',
    
    -- Constraints
    CONSTRAINT chk_direction CHECK (direction IN ('HUB_TO_SPOKE', 'SPOKE_TO_HUB')),
    CONSTRAINT chk_status CHECK (status IN (
        'PENDING',      -- Initial state, not yet attempted
        'CREATING',     -- In progress
        'ACTIVE',       -- Successfully created and verified
        'FAILED',       -- Creation failed
        'DISABLED',     -- Manually disabled
        'STALE'         -- Needs re-verification
    )),
    CONSTRAINT uq_federation_link UNIQUE (source_code, target_code, direction)
);

-- Add comments for documentation
COMMENT ON TABLE federation_links IS 'Tracks bidirectional Hub<->Spoke federation relationships. SSOT for federation state.';
COMMENT ON COLUMN federation_links.source_code IS 'Source instance code (lowercase, e.g., usa, svk)';
COMMENT ON COLUMN federation_links.target_code IS 'Target instance code (lowercase, e.g., svk, usa)';
COMMENT ON COLUMN federation_links.direction IS 'HUB_TO_SPOKE: Hub can auth to Spoke. SPOKE_TO_HUB: Spoke can auth to Hub.';
COMMENT ON COLUMN federation_links.status IS 'Current state of the federation link';
COMMENT ON COLUMN federation_links.client_secret_hash IS 'SHA256 hash for verification only - never store plaintext secrets';

-- =============================================================================
-- FEDERATION HEALTH TABLE
-- =============================================================================
-- Tracks automated health check history for federation links
-- Used for monitoring, alerting, and auto-recovery decisions
-- =============================================================================

CREATE TABLE IF NOT EXISTS federation_health (
    id SERIAL PRIMARY KEY,
    
    -- Link identification (denormalized for query performance)
    source_code VARCHAR(3) NOT NULL,
    target_code VARCHAR(3) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    
    -- Health check timestamp
    check_timestamp TIMESTAMPTZ DEFAULT NOW(),
    
    -- Component health status (individual checks)
    source_idp_exists BOOLEAN,                 -- IdP exists in source Keycloak
    source_idp_enabled BOOLEAN,                -- IdP is enabled
    source_client_exists BOOLEAN,              -- Client exists in source Keycloak
    target_idp_exists BOOLEAN,                 -- IdP exists in target Keycloak
    target_idp_enabled BOOLEAN,                -- IdP is enabled
    target_client_exists BOOLEAN,              -- Client exists in target Keycloak
    
    -- End-to-end SSO test results
    sso_test_attempted BOOLEAN DEFAULT FALSE,
    sso_test_passed BOOLEAN,
    sso_latency_ms INTEGER,                    -- Round-trip time for SSO test
    
    -- Error tracking
    error_code VARCHAR(10),                    -- From spoke-error-codes.sh
    error_message TEXT,
    error_component VARCHAR(50),               -- Which component failed
    
    -- Raw response data for debugging
    raw_response JSONB,
    
    -- Constraints
    CONSTRAINT chk_health_direction CHECK (direction IN ('HUB_TO_SPOKE', 'SPOKE_TO_HUB'))
);

-- Add comments
COMMENT ON TABLE federation_health IS 'Tracks automated health check history for federation links';
COMMENT ON COLUMN federation_health.sso_latency_ms IS 'End-to-end SSO authentication latency in milliseconds';

-- =============================================================================
-- FEDERATION OPERATIONS TABLE
-- =============================================================================
-- Tracks all federation operations (create, update, delete, verify)
-- Provides audit trail and supports auto-recovery
-- =============================================================================

CREATE TABLE IF NOT EXISTS federation_operations (
    id SERIAL PRIMARY KEY,
    
    -- Operation identification
    operation_id UUID DEFAULT uuid_generate_v4(),
    source_code VARCHAR(3) NOT NULL,
    target_code VARCHAR(3) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    
    -- Operation details
    operation_type VARCHAR(30) NOT NULL,       -- CREATE_IDP, CREATE_CLIENT, VERIFY, DELETE, UPDATE
    operation_status VARCHAR(20) DEFAULT 'PENDING',
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    
    -- Retry tracking
    attempt_number INTEGER DEFAULT 1,
    max_attempts INTEGER DEFAULT 5,
    next_retry_at TIMESTAMPTZ,
    
    -- Error handling
    error_code VARCHAR(10),
    error_message TEXT,
    error_recoverable BOOLEAN DEFAULT TRUE,
    
    -- Context
    triggered_by VARCHAR(100) DEFAULT 'system', -- 'deployment', 'manual', 'recovery', 'health_check'
    context JSONB,                              -- Additional context (deployment_id, etc.)
    
    -- Constraints
    CONSTRAINT chk_op_direction CHECK (direction IN ('HUB_TO_SPOKE', 'SPOKE_TO_HUB')),
    CONSTRAINT chk_op_type CHECK (operation_type IN (
        'CREATE_IDP', 'CREATE_CLIENT', 'UPDATE_IDP', 'UPDATE_CLIENT',
        'DELETE_IDP', 'DELETE_CLIENT', 'VERIFY', 'SYNC_SECRET', 'RECOVER'
    )),
    CONSTRAINT chk_op_status CHECK (operation_status IN (
        'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRYING'
    ))
);

-- Add comments
COMMENT ON TABLE federation_operations IS 'Audit trail for all federation operations';
COMMENT ON COLUMN federation_operations.triggered_by IS 'What initiated this operation';

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Federation Links indexes
CREATE INDEX IF NOT EXISTS idx_fed_links_source ON federation_links(source_code);
CREATE INDEX IF NOT EXISTS idx_fed_links_target ON federation_links(target_code);
CREATE INDEX IF NOT EXISTS idx_fed_links_status ON federation_links(status);
CREATE INDEX IF NOT EXISTS idx_fed_links_updated ON federation_links(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fed_links_direction ON federation_links(direction);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_fed_links_lookup 
    ON federation_links(source_code, target_code, direction);

-- Index for finding failed links needing retry
CREATE INDEX IF NOT EXISTS idx_fed_links_failed 
    ON federation_links(status, retry_count) 
    WHERE status = 'FAILED';

-- Federation Health indexes
CREATE INDEX IF NOT EXISTS idx_fed_health_codes ON federation_health(source_code, target_code);
CREATE INDEX IF NOT EXISTS idx_fed_health_timestamp ON federation_health(check_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_fed_health_direction ON federation_health(direction);

-- Index for recent health checks
CREATE INDEX IF NOT EXISTS idx_fed_health_recent 
    ON federation_health(source_code, target_code, direction, check_timestamp DESC);

-- Federation Operations indexes
CREATE INDEX IF NOT EXISTS idx_fed_ops_operation_id ON federation_operations(operation_id);
CREATE INDEX IF NOT EXISTS idx_fed_ops_codes ON federation_operations(source_code, target_code);
CREATE INDEX IF NOT EXISTS idx_fed_ops_status ON federation_operations(operation_status);
CREATE INDEX IF NOT EXISTS idx_fed_ops_started ON federation_operations(started_at DESC);

-- Index for pending retries
CREATE INDEX IF NOT EXISTS idx_fed_ops_retry 
    ON federation_operations(next_retry_at) 
    WHERE operation_status = 'RETRYING' AND next_retry_at IS NOT NULL;

-- =============================================================================
-- VIEWS FOR EASY QUERYING
-- =============================================================================

-- Current federation status view (joins links with latest health)
CREATE OR REPLACE VIEW federation_status AS
SELECT 
    fl.id AS link_id,
    fl.source_code,
    fl.target_code,
    fl.direction,
    fl.idp_alias,
    fl.status,
    fl.retry_count,
    fl.last_verified_at,
    fl.error_message AS link_error,
    fl.created_at AS link_created_at,
    fl.updated_at AS link_updated_at,
    -- Latest health check
    fh.check_timestamp AS last_health_check,
    fh.sso_test_passed AS last_sso_result,
    fh.sso_latency_ms AS last_sso_latency,
    fh.error_message AS health_error,
    -- Computed fields
    CASE 
        WHEN fl.status = 'ACTIVE' AND fh.sso_test_passed = TRUE THEN 'HEALTHY'
        WHEN fl.status = 'ACTIVE' AND fh.sso_test_passed = FALSE THEN 'DEGRADED'
        WHEN fl.status = 'FAILED' THEN 'UNHEALTHY'
        WHEN fl.status = 'PENDING' THEN 'PENDING'
        WHEN fl.status = 'CREATING' THEN 'CREATING'
        ELSE 'UNKNOWN'
    END AS health_status,
    CASE 
        WHEN fl.last_verified_at IS NULL THEN 'NEVER'
        WHEN fl.last_verified_at > NOW() - INTERVAL '1 hour' THEN 'RECENT'
        WHEN fl.last_verified_at > NOW() - INTERVAL '24 hours' THEN 'STALE'
        ELSE 'VERY_STALE'
    END AS verification_freshness
FROM federation_links fl
LEFT JOIN LATERAL (
    SELECT 
        check_timestamp, 
        sso_test_passed, 
        sso_latency_ms, 
        error_message
    FROM federation_health
    WHERE source_code = fl.source_code 
      AND target_code = fl.target_code
      AND direction = fl.direction
    ORDER BY check_timestamp DESC
    LIMIT 1
) fh ON true;

-- Bidirectional federation pairs view
CREATE OR REPLACE VIEW federation_pairs AS
SELECT 
    CASE 
        WHEN h2s.source_code = 'usa' THEN h2s.target_code 
        ELSE s2h.source_code 
    END AS spoke_code,
    -- Hub to Spoke direction
    h2s.status AS hub_to_spoke_status,
    h2s.idp_alias AS hub_to_spoke_idp,
    h2s.last_verified_at AS hub_to_spoke_verified,
    -- Spoke to Hub direction
    s2h.status AS spoke_to_hub_status,
    s2h.idp_alias AS spoke_to_hub_idp,
    s2h.last_verified_at AS spoke_to_hub_verified,
    -- Overall bidirectional status
    CASE 
        WHEN h2s.status = 'ACTIVE' AND s2h.status = 'ACTIVE' THEN 'BIDIRECTIONAL_ACTIVE'
        WHEN h2s.status = 'ACTIVE' OR s2h.status = 'ACTIVE' THEN 'PARTIAL'
        WHEN h2s.status = 'FAILED' OR s2h.status = 'FAILED' THEN 'FAILED'
        WHEN h2s.status = 'PENDING' OR s2h.status = 'PENDING' THEN 'PENDING'
        ELSE 'UNKNOWN'
    END AS bidirectional_status
FROM federation_links h2s
LEFT JOIN federation_links s2h 
    ON h2s.target_code = s2h.source_code 
    AND h2s.source_code = s2h.target_code
WHERE h2s.direction = 'HUB_TO_SPOKE'
  AND (s2h.direction = 'SPOKE_TO_HUB' OR s2h.direction IS NULL);

COMMENT ON VIEW federation_status IS 'Current status of all federation links with latest health check';
COMMENT ON VIEW federation_pairs IS 'Bidirectional federation pairs showing both directions';

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to update link status and timestamp atomically
CREATE OR REPLACE FUNCTION fed_update_link_status(
    p_source_code VARCHAR(3),
    p_target_code VARCHAR(3),
    p_direction VARCHAR(20),
    p_status VARCHAR(20),
    p_error_message TEXT DEFAULT NULL,
    p_error_code VARCHAR(10) DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE federation_links
    SET 
        status = p_status,
        error_message = COALESCE(p_error_message, error_message),
        last_error_code = COALESCE(p_error_code, last_error_code),
        retry_count = CASE 
            WHEN p_status = 'FAILED' THEN retry_count + 1 
            WHEN p_status = 'ACTIVE' THEN 0
            ELSE retry_count 
        END,
        updated_at = NOW()
    WHERE source_code = p_source_code 
      AND target_code = p_target_code 
      AND direction = p_direction;
END;
$$ LANGUAGE plpgsql;

-- Function to record health check
CREATE OR REPLACE FUNCTION fed_record_health_check(
    p_source_code VARCHAR(3),
    p_target_code VARCHAR(3),
    p_direction VARCHAR(20),
    p_source_idp_exists BOOLEAN,
    p_source_idp_enabled BOOLEAN,
    p_target_idp_exists BOOLEAN,
    p_target_idp_enabled BOOLEAN,
    p_sso_test_passed BOOLEAN DEFAULT NULL,
    p_sso_latency_ms INTEGER DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    INSERT INTO federation_health (
        source_code, target_code, direction,
        source_idp_exists, source_idp_enabled,
        target_idp_exists, target_idp_enabled,
        sso_test_attempted, sso_test_passed, sso_latency_ms,
        error_message
    ) VALUES (
        p_source_code, p_target_code, p_direction,
        p_source_idp_exists, p_source_idp_enabled,
        p_target_idp_exists, p_target_idp_enabled,
        (p_sso_test_passed IS NOT NULL), p_sso_test_passed, p_sso_latency_ms,
        p_error_message
    ) RETURNING id INTO v_id;
    
    -- Update last_verified_at on the link if health check passed
    IF p_sso_test_passed = TRUE THEN
        UPDATE federation_links
        SET last_verified_at = NOW(), status = 'ACTIVE', updated_at = NOW()
        WHERE source_code = p_source_code 
          AND target_code = p_target_code 
          AND direction = p_direction;
    END IF;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get failed links needing retry
CREATE OR REPLACE FUNCTION fed_get_failed_links_for_retry(
    p_max_retries INTEGER DEFAULT 3
) RETURNS TABLE (
    source_code VARCHAR(3),
    target_code VARCHAR(3),
    direction VARCHAR(20),
    retry_count INTEGER,
    last_error_code VARCHAR(10),
    error_message TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fl.source_code,
        fl.target_code,
        fl.direction,
        fl.retry_count,
        fl.last_error_code,
        fl.error_message
    FROM federation_links fl
    WHERE fl.status = 'FAILED' 
      AND fl.retry_count < p_max_retries
    ORDER BY fl.updated_at ASC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGER FOR UPDATED_AT
-- =============================================================================

CREATE OR REPLACE FUNCTION update_federation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to federation_links
DROP TRIGGER IF EXISTS trg_federation_links_updated ON federation_links;
CREATE TRIGGER trg_federation_links_updated
    BEFORE UPDATE ON federation_links
    FOR EACH ROW
    EXECUTE FUNCTION update_federation_timestamp();

-- =============================================================================
-- INITIAL DATA (if needed)
-- =============================================================================

-- Insert Hub (USA) as initial partner if not exists
INSERT INTO federation_links (source_code, target_code, direction, idp_alias, status)
SELECT 'usa', 'usa', 'HUB_TO_SPOKE', 'self', 'ACTIVE'
WHERE NOT EXISTS (
    SELECT 1 FROM federation_links WHERE source_code = 'usa' AND target_code = 'usa'
);

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON federation_links TO dive_app;
-- GRANT SELECT, INSERT ON federation_health TO dive_app;
-- GRANT SELECT, INSERT, UPDATE ON federation_operations TO dive_app;
-- GRANT SELECT ON federation_status TO dive_app;
-- GRANT SELECT ON federation_pairs TO dive_app;
-- GRANT USAGE ON SEQUENCE federation_links_id_seq TO dive_app;
-- GRANT USAGE ON SEQUENCE federation_health_id_seq TO dive_app;
-- GRANT USAGE ON SEQUENCE federation_operations_id_seq TO dive_app;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify tables were created
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'federation_links') THEN
        RAISE EXCEPTION 'federation_links table was not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'federation_health') THEN
        RAISE EXCEPTION 'federation_health table was not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'federation_operations') THEN
        RAISE EXCEPTION 'federation_operations table was not created';
    END IF;
    RAISE NOTICE 'Federation schema created successfully';
END $$;
