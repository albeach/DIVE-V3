-- =============================================================================
-- DIVE V3 - Audit Tables for Backend Authorization/Federation Logging
-- =============================================================================
-- Database: dive_v3_app
-- Used by: backend audit.service.ts (PostgreSQL audit persistence)
-- =============================================================================

-- Authorization decisions log (ACCESS_GRANT / ACCESS_DENY)
CREATE TABLE IF NOT EXISTS authorization_log (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_id      TEXT,
    user_id         TEXT,
    clearance       TEXT,
    country_code    TEXT,
    coi_memberships TEXT,
    resource_id     TEXT,
    classification  TEXT,
    releasability_to TEXT,
    resource_cois   TEXT,
    decision        TEXT NOT NULL,
    reason          TEXT,
    opa_decision    JSONB,
    latency_ms      INTEGER,
    instance_code   TEXT,
    source_ip       TEXT,
    user_agent      TEXT
);

-- Federation authentication events log
CREATE TABLE IF NOT EXISTS federation_log (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_realm    TEXT,
    target_realm    TEXT,
    user_id         TEXT,
    event_type      TEXT NOT NULL,
    success         BOOLEAN,
    error_message   TEXT,
    metadata        JSONB,
    latency_ms      INTEGER,
    source_ip       TEXT
);

-- General audit log (all other event types)
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type      TEXT NOT NULL,
    user_id         TEXT,
    session_id      TEXT,
    resource_id     TEXT,
    action          TEXT,
    decision        TEXT,
    reason          TEXT,
    metadata        JSONB,
    instance_code   TEXT,
    source_ip       TEXT,
    request_id      TEXT
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_authz_log_timestamp ON authorization_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_authz_log_user_id ON authorization_log (user_id);
CREATE INDEX IF NOT EXISTS idx_authz_log_resource_id ON authorization_log (resource_id);
CREATE INDEX IF NOT EXISTS idx_authz_log_decision ON authorization_log (decision);

CREATE INDEX IF NOT EXISTS idx_fed_log_timestamp ON federation_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_fed_log_user_id ON federation_log (user_id);
CREATE INDEX IF NOT EXISTS idx_fed_log_event_type ON federation_log (event_type);

CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log (user_id);
