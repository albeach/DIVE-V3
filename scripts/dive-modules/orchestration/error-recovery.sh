#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Guided Error Recovery
# =============================================================================
# When a deployment phase fails, displays specific remediation steps and
# offers interactive retry/skip/abort. Non-interactive mode auto-aborts.
# =============================================================================

# Prevent multiple sourcing
if [ -n "${ERROR_RECOVERY_LOADED:-}" ]; then
    return 0
fi
export ERROR_RECOVERY_LOADED=1

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# REMEDIATION CATALOG
# =============================================================================

# Returns remediation text for a given phase
# Arguments: $1 - phase name, $2 - deployment type (hub|spoke)
_error_get_remediation() {
    local phase="$1"
    local type="${2:-hub}"

    case "$phase" in
        VAULT_BOOTSTRAP)
            cat <<'REMEDIATION'
  Vault Bootstrap Failed
  ──────────────────────
  Common causes:
    • Docker daemon not running or out of disk space
    • Port 8200 already in use by another process
    • Vault container failed to initialize (corrupted storage)

  Remediation steps:
    1. Check Docker: docker info
    2. Check port: lsof -i :8200
    3. Check Vault logs: docker logs dive-hub-vault 2>&1 | tail -20
    4. If corrupted: docker volume rm dive-hub-vault-data && retry
    5. If init failed: check .dive-state/hub/vault-init.json
REMEDIATION
            ;;
        DATABASE_INIT)
            cat <<'REMEDIATION'
  Database Init Failed
  ────────────────────
  Common causes:
    • PostgreSQL container failed to start
    • Port 5432 already in use
    • Insufficient disk space for database initialization

  Remediation steps:
    1. Check PostgreSQL: docker logs dive-hub-postgres 2>&1 | tail -20
    2. Check port: lsof -i :5432
    3. Check disk: df -h
    4. Restart: docker restart dive-hub-postgres && retry
REMEDIATION
            ;;
        PREFLIGHT)
            cat <<'REMEDIATION'
  Preflight Check Failed
  ──────────────────────
  Common causes:
    • Required dependencies not installed (Docker, jq, curl)
    • Docker daemon not running
    • Previous deployment in progress (stale state)

  Remediation steps:
    1. Run bootstrap: ./dive bootstrap --check
    2. Clear stale state: rm -rf .dive-state/hub/.phases/PREFLIGHT.done
    3. Check Docker: docker info
REMEDIATION
            ;;
        INITIALIZATION)
            cat <<'REMEDIATION'
  Initialization Failed
  ─────────────────────
  Common causes:
    • Environment file missing or malformed
    • Certificate generation failed (mkcert not installed)
    • Docker network creation failed

  Remediation steps:
    1. Check env file: cat .env.hub
    2. Install mkcert: ./dive bootstrap
    3. Check networks: docker network ls | grep dive
    4. Remove stale: docker network prune
REMEDIATION
            ;;
        MONGODB_INIT)
            cat <<'REMEDIATION'
  MongoDB Init Failed
  ───────────────────
  Common causes:
    • MongoDB container failed to start
    • Port 27017 already in use
    • Authentication setup failed

  Remediation steps:
    1. Check MongoDB: docker logs dive-hub-mongodb 2>&1 | tail -20
    2. Check port: lsof -i :27017
    3. Verify password: grep MONGODB_PASSWORD .env.hub
REMEDIATION
            ;;
        BUILD)
            cat <<'REMEDIATION'
  Build Failed
  ────────────
  Common causes:
    • npm install failed (network issues or corrupted cache)
    • Docker build failed (Dockerfile syntax or missing files)
    • Out of disk space

  Remediation steps:
    1. Check disk: df -h
    2. Clean Docker: docker system prune -f
    3. Clear npm cache: cd backend && rm -rf node_modules && npm install
    4. Rebuild: docker compose build --no-cache
REMEDIATION
            ;;
        SERVICES)
            cat <<'REMEDIATION'
  Services Start Failed
  ─────────────────────
  Common causes:
    • Container startup crash (check logs)
    • Port conflicts with running services
    • Missing environment variables

  Remediation steps:
    1. Check all logs: docker compose -f docker/docker-compose.hub.yml logs --tail=20
    2. Check ports: docker ps --format "{{.Names}}: {{.Ports}}"
    3. Restart: docker compose -f docker/docker-compose.hub.yml restart
REMEDIATION
            ;;
        VAULT_DB_ENGINE)
            cat <<'REMEDIATION'
  Vault DB Engine Failed
  ──────────────────────
  Common causes:
    • Vault not unsealed or not initialized
    • PostgreSQL not reachable from Vault
    • Database credentials incorrect

  Remediation steps:
    1. Check Vault status: ./dive vault status
    2. Unseal if needed: ./dive vault unseal
    3. Check DB connectivity: docker exec dive-hub-vault vault read database/creds/backend
    4. Check PostgreSQL: docker exec dive-hub-postgres pg_isready
REMEDIATION
            ;;
        KEYCLOAK_CONFIG)
            cat <<'REMEDIATION'
  Keycloak Configuration Failed
  ─────────────────────────────
  Common causes:
    • Keycloak container not healthy
    • Terraform apply failed (state drift)
    • Admin password incorrect

  Remediation steps:
    1. Check Keycloak: docker logs dive-hub-keycloak 2>&1 | tail -20
    2. Check health: curl -sk https://localhost:8443/health
    3. Verify admin password: grep KEYCLOAK_ADMIN_PASSWORD .env.hub
    4. Re-apply Terraform: cd terraform/keycloak && terraform apply
    5. If state drift: terraform destroy && terraform apply
REMEDIATION
            ;;
        REALM_VERIFY)
            cat <<'REMEDIATION'
  Realm Verification Failed
  ─────────────────────────
  Common causes:
    • Keycloak realm not created (Terraform failed silently)
    • Realm name mismatch (expected: dive-v3-broker-usa)
    • Keycloak still starting up

  Remediation steps:
    1. List realms: curl -sk https://localhost:8443/admin/realms -H "Authorization: Bearer $(./dive keycloak token)"
    2. Check realm: curl -sk https://localhost:8443/realms/dive-v3-broker-usa
    3. Wait and retry: sleep 30 && retry
REMEDIATION
            ;;
        KAS_REGISTER|KAS_INIT)
            cat <<'REMEDIATION'
  KAS Registration/Init Failed
  ────────────────────────────
  Common causes:
    • Backend API not responding
    • KAS certificates missing or expired
    • MongoDB not reachable

  Remediation steps:
    1. Check backend: curl -sk https://localhost:4000/health
    2. Check KAS certs: ls -la certs/kas/
    3. Check MongoDB: docker exec dive-hub-mongodb mongosh --eval "db.runCommand({ping:1})"
    4. Restart backend: docker restart dive-hub-backend
REMEDIATION
            ;;
        SEEDING)
            cat <<'REMEDIATION'
  Data Seeding Failed
  ───────────────────
  Common causes:
    • Backend API not responding or unhealthy
    • MongoDB connection error
    • Seed data format invalid

  Remediation steps:
    1. Check backend health: curl -sk https://localhost:4000/health
    2. Check MongoDB: docker logs dive-hub-mongodb 2>&1 | tail -10
    3. Retry seeding: ./dive hub deploy --resume
REMEDIATION
            ;;
        DEPLOYMENT)
            cat <<'REMEDIATION'
  Spoke Deployment Failed
  ───────────────────────
  Common causes:
    • Docker compose up failed
    • Container startup crash
    • Port conflicts with hub or other spokes

  Remediation steps:
    1. Check compose: docker compose logs --tail=20
    2. Check ports: docker ps --format "{{.Names}}: {{.Ports}}"
    3. Check hub connectivity: curl -sk https://localhost:4000/health
REMEDIATION
            ;;
        CONFIGURATION)
            cat <<'REMEDIATION'
  Spoke Configuration Failed
  ──────────────────────────
  Common causes:
    • Keycloak realm/client creation failed
    • Hub Keycloak not reachable
    • IdP broker configuration error

  Remediation steps:
    1. Check spoke Keycloak: docker logs dive-spoke-*-keycloak 2>&1 | tail -20
    2. Check hub connectivity: curl -sk https://localhost:8443/health
    3. Verify admin password for this spoke
    4. Resume: ./dive spoke deploy <CODE> --resume
REMEDIATION
            ;;
        VERIFICATION)
            cat <<'REMEDIATION'
  Spoke Verification Failed
  ─────────────────────────
  Common causes:
    • One or more of the 12-point checks failed
    • Service not yet fully started
    • Federation not yet established

  Remediation steps:
    1. Run detailed verification: ./dive spoke verify <CODE>
    2. Check federation: ./dive federation verify <CODE>
    3. Wait for services: sleep 30 && retry
REMEDIATION
            ;;
        *)
            echo "  Phase $phase failed. Check logs for details."
            echo "  General steps: check Docker logs, verify configuration, retry."
            ;;
    esac
}

# =============================================================================
# INTERACTIVE RECOVERY
# =============================================================================

# Non-fatal phases that can be skipped
_ERROR_SKIPPABLE_PHASES="REALM_VERIFY SEEDING VERIFICATION KAS_INIT"

##
# Offer error recovery options for a failed phase
#
# Arguments:
#   $1 - Phase name
#   $2 - Deployment type (hub|spoke)
#   $3 - Instance code
#
# Returns:
#   0 - Retry the phase
#   1 - Abort the pipeline
#   2 - Skip the phase (non-fatal only)
##
error_recovery_suggest() {
    local phase="$1"
    local deploy_type="${2:-hub}"
    local instance_code="${3:-USA}"

    echo ""
    echo "==============================================================================="
    echo "  Phase Failed: $phase"
    echo "==============================================================================="
    echo ""

    # Show remediation
    _error_get_remediation "$phase" "$deploy_type"

    echo ""
    echo "==============================================================================="

    # Non-interactive: auto-abort
    if ! is_interactive; then
        log_warn "Non-interactive mode: aborting pipeline after $phase failure"
        return 1
    fi

    # Determine if phase is skippable
    local can_skip=false
    if [[ " $_ERROR_SKIPPABLE_PHASES " == *" $phase "* ]]; then
        can_skip=true
    fi

    # Interactive: offer choices
    echo ""
    if [ "$can_skip" = true ]; then
        echo "  Options:"
        echo "    [r] Retry this phase"
        echo "    [s] Skip this phase (non-fatal)"
        echo "    [a] Abort the pipeline"
        echo ""
        local choice
        read -r -p "  Choose [r/s/a]: " choice
        case "$choice" in
            [Rr]) return 0 ;;
            [Ss]) return 2 ;;
            *)    return 1 ;;
        esac
    else
        echo "  Options:"
        echo "    [r] Retry this phase"
        echo "    [a] Abort the pipeline"
        echo ""
        local choice
        read -r -p "  Choose [r/a]: " choice
        case "$choice" in
            [Rr]) return 0 ;;
            *)    return 1 ;;
        esac
    fi
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f error_recovery_suggest
export -f _error_get_remediation

log_verbose "Error recovery module loaded"
