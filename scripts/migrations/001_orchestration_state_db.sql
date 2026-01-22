-- ============================================================================
-- DIVE V3 Orchestration State Management Database Schema
-- ============================================================================
-- Migration: 001_orchestration_state_db
-- Author: AI Architecture Team
-- Date: 2026-01-13
-- Sprint: 1 (State Management Enhancement)
--
-- Purpose: Centralized state management with ACID guarantees, concurrent
--          access support, and comprehensive audit trails.
--
-- Deployment: Run against orchestration PostgreSQL database
-- Rollback: See 001_orchestration_state_db.rollback.sql
-- ============================================================================

-- Create database (run as postgres superuser)
-- CREATE DATABASE orchestration OWNER postgres;

-- Connect to orchestration database
\c orchestration

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Deployment states (current state snapshot)
CREATE TABLE IF NOT EXISTS deployment_states (
    id SERIAL PRIMARY KEY,
    instance_code VARCHAR(3) NOT NULL,
    state VARCHAR(20) NOT NULL,
    previous_state VARCHAR(20),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT,
    metadata JSONB,
    checkpoint_id VARCHAR(255),
    created_by VARCHAR(50) DEFAULT 'system',

    -- State validation constraint
    CONSTRAINT valid_state CHECK (state IN (
        'UNKNOWN', 'INITIALIZING', 'DEPLOYING', 'CONFIGURING',
        'VERIFYING', 'COMPLETE', 'FAILED', 'ROLLING_BACK', 'CLEANUP'
    )),

    -- Ensure only one current state per instance
    CONSTRAINT unique_current_state UNIQUE (instance_code, timestamp)
);

-- State transition audit log (immutable append-only)
CREATE TABLE IF NOT EXISTS state_transitions (
    id SERIAL PRIMARY KEY,
    instance_code VARCHAR(3) NOT NULL,
    from_state VARCHAR(20),
    to_state VARCHAR(20) NOT NULL,
    transition_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_seconds INTEGER,
    initiated_by VARCHAR(50) DEFAULT 'system',
    metadata JSONB,

    -- Audit trail integrity
    CONSTRAINT valid_transition CHECK (
        to_state IN ('UNKNOWN', 'INITIALIZING', 'DEPLOYING', 'CONFIGURING',
                     'VERIFYING', 'COMPLETE', 'FAILED', 'ROLLING_BACK', 'CLEANUP')
    )
);

-- Deployment steps tracking (granular progress)
CREATE TABLE IF NOT EXISTS deployment_steps (
    id SERIAL PRIMARY KEY,
    instance_code VARCHAR(3) NOT NULL,
    step_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    metadata JSONB,

    -- Step status validation
    CONSTRAINT valid_step_status CHECK (
        status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED')
    ),

    -- Prevent duplicate active steps
    CONSTRAINT unique_active_step UNIQUE (instance_code, step_name, started_at)
);

-- ============================================================================
-- RESILIENCE TABLES
-- ============================================================================

-- Deployment locks (GAP-001 fix - concurrent deployment protection)
-- Tracks PostgreSQL advisory locks to prevent concurrent deployments
CREATE TABLE IF NOT EXISTS deployment_locks (
    id SERIAL PRIMARY KEY,
    instance_code VARCHAR(3) NOT NULL,
    lock_id BIGINT NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acquired_by VARCHAR(50) DEFAULT 'system',
    released_at TIMESTAMPTZ,
    hostname VARCHAR(255),
    pid INTEGER,

    -- Lock must be released after acquisition
    CONSTRAINT valid_lock_release CHECK (
        released_at IS NULL OR released_at >= acquired_at
    ),

    -- Only one active lock per instance at a time
    CONSTRAINT unique_active_lock UNIQUE (instance_code, lock_id, acquired_at)
);

-- CRITICAL FIX (2026-01-22): Added IF NOT EXISTS for idempotency
CREATE INDEX IF NOT EXISTS idx_deployment_locks_instance ON deployment_locks(instance_code);
CREATE INDEX IF NOT EXISTS idx_deployment_locks_active ON deployment_locks(instance_code)
    WHERE released_at IS NULL;

-- Circuit breaker state (fail-fast pattern)
CREATE TABLE IF NOT EXISTS circuit_breakers (
    id SERIAL PRIMARY KEY,
    operation_name VARCHAR(100) NOT NULL UNIQUE,
    state VARCHAR(20) NOT NULL,
    failure_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    last_failure_time TIMESTAMPTZ,
    last_success_time TIMESTAMPTZ,
    last_state_change TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB,

    -- Circuit breaker state validation
    CONSTRAINT valid_circuit_state CHECK (
        state IN ('CLOSED', 'OPEN', 'HALF_OPEN')
    ),

    -- Ensure counts are non-negative
    CONSTRAINT non_negative_counts CHECK (
        failure_count >= 0 AND success_count >= 0
    )
);

-- Orchestration errors (structured error tracking)
CREATE TABLE IF NOT EXISTS orchestration_errors (
    id SERIAL PRIMARY KEY,
    instance_code VARCHAR(3),
    error_code VARCHAR(50) NOT NULL,
    severity INTEGER NOT NULL,
    component VARCHAR(100),
    message TEXT NOT NULL,
    remediation TEXT,
    context JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(50),

    -- Severity validation (1=CRITICAL, 2=HIGH, 3=MEDIUM, 4=LOW)
    CONSTRAINT valid_severity CHECK (severity BETWEEN 1 AND 4),

    -- Resolution timestamp must be after error timestamp
    CONSTRAINT valid_resolution_time CHECK (
        resolved_at IS NULL OR resolved_at >= timestamp
    )
);

-- ============================================================================
-- OBSERVABILITY TABLES
-- ============================================================================

-- Orchestration metrics (time-series data)
CREATE TABLE IF NOT EXISTS orchestration_metrics (
    id SERIAL PRIMARY KEY,
    instance_code VARCHAR(3) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC NOT NULL,
    metric_unit VARCHAR(20),
    labels JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Checkpoint registry (rollback points)
CREATE TABLE IF NOT EXISTS checkpoints (
    id SERIAL PRIMARY KEY,
    checkpoint_id VARCHAR(255) NOT NULL UNIQUE,
    instance_code VARCHAR(3) NOT NULL,
    checkpoint_level VARCHAR(20) NOT NULL,
    description TEXT,
    file_path TEXT, -- Path to checkpoint files on disk
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(50) DEFAULT 'system',
    metadata JSONB,

    -- Checkpoint level validation
    -- CRITICAL FIX (2026-01-22): Added all orchestration pipeline phases
    -- ROOT CAUSE: Schema only had old phase names, not the actual pipeline phases
    CONSTRAINT valid_checkpoint_level CHECK (
        checkpoint_level IN (
            -- Original phases (kept for backwards compatibility)
            'CONTAINER', 'CONFIG', 'KEYCLOAK', 'FEDERATION', 'COMPLETE',
            -- Orchestration pipeline phases (actual phases used by spoke-deploy.sh)
            'PREFLIGHT', 'INITIALIZATION', 'DEPLOYMENT', 'CONFIGURATION', 'VERIFICATION',
            -- Additional states
            'ROLLBACK', 'FAILED', 'CANCELLED'
        )
    )
);

-- ============================================================================
-- PERFORMANCE INDEXES (IDEMPOTENT - safe to run multiple times)
-- ============================================================================
-- CRITICAL FIX (2026-01-22): Added IF NOT EXISTS to all indexes
-- ROOT CAUSE: Non-idempotent indexes caused "relation already exists" errors
-- on redeployments, breaking orchestration state management

-- Deployment states indexes
CREATE INDEX IF NOT EXISTS idx_deployment_states_code ON deployment_states(instance_code);
CREATE INDEX IF NOT EXISTS idx_deployment_states_timestamp ON deployment_states(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_deployment_states_state ON deployment_states(state);
CREATE INDEX IF NOT EXISTS idx_deployment_states_code_timestamp ON deployment_states(instance_code, timestamp DESC);

-- State transitions indexes
CREATE INDEX IF NOT EXISTS idx_state_transitions_code ON state_transitions(instance_code);
CREATE INDEX IF NOT EXISTS idx_state_transitions_time ON state_transitions(transition_time DESC);
CREATE INDEX IF NOT EXISTS idx_state_transitions_code_time ON state_transitions(instance_code, transition_time DESC);

-- Deployment steps indexes
CREATE INDEX IF NOT EXISTS idx_deployment_steps_code ON deployment_steps(instance_code);
CREATE INDEX IF NOT EXISTS idx_deployment_steps_status ON deployment_steps(status);
CREATE INDEX IF NOT EXISTS idx_deployment_steps_code_status ON deployment_steps(instance_code, status);
CREATE INDEX IF NOT EXISTS idx_deployment_steps_started ON deployment_steps(started_at DESC);

-- Circuit breakers indexes
CREATE INDEX IF NOT EXISTS idx_circuit_breakers_state ON circuit_breakers(state);
CREATE INDEX IF NOT EXISTS idx_circuit_breakers_last_failure ON circuit_breakers(last_failure_time DESC);

-- Orchestration errors indexes
CREATE INDEX IF NOT EXISTS idx_orchestration_errors_code ON orchestration_errors(instance_code);
CREATE INDEX IF NOT EXISTS idx_orchestration_errors_timestamp ON orchestration_errors(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_orchestration_errors_severity ON orchestration_errors(severity);
CREATE INDEX IF NOT EXISTS idx_orchestration_errors_resolved ON orchestration_errors(resolved);
CREATE INDEX IF NOT EXISTS idx_orchestration_errors_code_timestamp ON orchestration_errors(instance_code, timestamp DESC);

-- Orchestration metrics indexes
CREATE INDEX IF NOT EXISTS idx_orchestration_metrics_code ON orchestration_metrics(instance_code);
CREATE INDEX IF NOT EXISTS idx_orchestration_metrics_name ON orchestration_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_orchestration_metrics_timestamp ON orchestration_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_orchestration_metrics_code_name_time ON orchestration_metrics(instance_code, metric_name, timestamp DESC);

-- Checkpoints indexes
CREATE INDEX IF NOT EXISTS idx_checkpoints_code ON checkpoints(instance_code);
CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON checkpoints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkpoints_level ON checkpoints(checkpoint_level);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get current deployment state for an instance
CREATE OR REPLACE FUNCTION get_current_state(p_instance_code VARCHAR(3))
RETURNS VARCHAR(20) AS $$
DECLARE
    v_state VARCHAR(20);
BEGIN
    SELECT state INTO v_state
    FROM deployment_states
    WHERE instance_code = p_instance_code
    ORDER BY timestamp DESC
    LIMIT 1;

    RETURN COALESCE(v_state, 'UNKNOWN');
END;
$$ LANGUAGE plpgsql;

-- Calculate deployment duration
CREATE OR REPLACE FUNCTION get_deployment_duration(p_instance_code VARCHAR(3))
RETURNS INTERVAL AS $$
DECLARE
    v_start_time TIMESTAMPTZ;
    v_end_time TIMESTAMPTZ;
BEGIN
    -- Get INITIALIZING timestamp
    SELECT timestamp INTO v_start_time
    FROM deployment_states
    WHERE instance_code = p_instance_code AND state = 'INITIALIZING'
    ORDER BY timestamp DESC
    LIMIT 1;

    -- Get COMPLETE or FAILED timestamp
    SELECT timestamp INTO v_end_time
    FROM deployment_states
    WHERE instance_code = p_instance_code AND state IN ('COMPLETE', 'FAILED')
    ORDER BY timestamp DESC
    LIMIT 1;

    IF v_start_time IS NOT NULL AND v_end_time IS NOT NULL THEN
        RETURN v_end_time - v_start_time;
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Count unresolved errors by severity
CREATE OR REPLACE FUNCTION count_unresolved_errors(
    p_instance_code VARCHAR(3),
    p_severity INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM orchestration_errors
    WHERE instance_code = p_instance_code
      AND severity = p_severity
      AND resolved = FALSE;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Get latest checkpoint for instance
CREATE OR REPLACE FUNCTION get_latest_checkpoint(p_instance_code VARCHAR(3))
RETURNS VARCHAR(255) AS $$
DECLARE
    v_checkpoint_id VARCHAR(255);
BEGIN
    SELECT checkpoint_id INTO v_checkpoint_id
    FROM checkpoints
    WHERE instance_code = p_instance_code
    ORDER BY created_at DESC
    LIMIT 1;

    RETURN v_checkpoint_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DATA RETENTION POLICIES
-- ============================================================================

-- Function to clean up old metrics (retain 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM orchestration_metrics
    WHERE timestamp < NOW() - INTERVAL '7 days';

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old state transitions (retain 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_transitions()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM state_transitions
    WHERE transition_time < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANTS (Adjust for your security requirements)
-- ============================================================================

-- Grant permissions to orchestration user
-- CREATE USER orchestration_user WITH PASSWORD 'change_me_in_production';
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO orchestration_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO orchestration_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO orchestration_user;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify schema creation
SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'deployment_states', 'state_transitions', 'deployment_steps',
    'deployment_locks', 'circuit_breakers', 'orchestration_errors', 'orchestration_metrics', 'checkpoints'
)
ORDER BY table_name;

-- Verify indexes
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'deployment_states', 'state_transitions', 'deployment_steps',
    'deployment_locks', 'circuit_breakers', 'orchestration_errors', 'orchestration_metrics', 'checkpoints'
)
ORDER BY tablename, indexname;

-- Verify functions
SELECT
    routine_name,
    routine_type,
    data_type AS return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_current_state', 'get_deployment_duration', 'count_unresolved_errors',
    'get_latest_checkpoint', 'cleanup_old_metrics', 'cleanup_old_transitions'
)
ORDER BY routine_name;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
