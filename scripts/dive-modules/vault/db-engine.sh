#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Vault Database Secrets Engine
# =============================================================================
# Configures Vault's database secrets engine for PostgreSQL and MongoDB.
#
# Features:
#   - PostgreSQL static roles: keycloak_user, nextauth_user (24h rotation)
#   - MongoDB dynamic roles: backend-rw (readWrite), kas-ro (read) (12h TTL)
#   - Infrastructure admin credentials remain static in .env
#
# Usage:
#   ./dive vault db-setup    # One-time idempotent setup
#   ./dive vault db-status   # Show engine status, roles, active leases
#   ./dive vault db-test     # Run 6-point validation test
# =============================================================================

# =============================================================================
# MAIN SETUP
# =============================================================================

##
# One-time idempotent database engine setup
#
# Requires:
#   - Vault HA cluster running and unsealed
#   - PostgreSQL and MongoDB containers running on hub-internal network
#   - POSTGRES_PASSWORD_USA and MONGO_PASSWORD_USA available
#
# Steps:
#   1. Enable database/ secrets engine
#   2. Configure PostgreSQL connection
#   3. Configure MongoDB connection
#   4. Create PostgreSQL static roles (keycloak-hub, nextauth-hub)
#   5. Create MongoDB dynamic roles (backend-hub-rw, kas-hub-ro)
#   6. Apply policies
##
module_vault_db_setup() {
    log_info "Setting up Vault Database Secrets Engine..."

    if ! vault_is_running; then return 1; fi

    # Load token
    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    else
        log_error "Vault token not found - run: ./dive vault init"
        return 1
    fi

    # Check if unsealed
    if ! vault status 2>/dev/null | grep -q "Sealed.*false"; then
        log_error "Vault is sealed - check: ./dive vault seal-status"
        return 1
    fi

    # Load admin credentials from .env.hub
    local pg_password="" mongo_password=""
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        pg_password=$(grep '^POSTGRES_PASSWORD_USA=' "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2-)
        mongo_password=$(grep '^MONGO_PASSWORD_USA=' "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2-)
    fi

    if [ -z "$pg_password" ] || [ -z "$mongo_password" ]; then
        log_error "POSTGRES_PASSWORD_USA or MONGO_PASSWORD_USA not found in .env.hub"
        log_info "Run: ./dive vault seed  (to populate .env.hub)"
        return 1
    fi

    # Verify databases are reachable from vault-1
    log_info "Verifying database connectivity from vault-1..."
    if ! docker exec dive-hub-vault-1 sh -c "nc -z postgres 5432 2>/dev/null" 2>/dev/null; then
        log_error "PostgreSQL not reachable from vault-1 on hub-internal network"
        log_info "Ensure hub is deployed: ./dive hub deploy"
        return 1
    fi
    if ! docker exec dive-hub-vault-1 sh -c "nc -z mongodb 27017 2>/dev/null" 2>/dev/null; then
        log_error "MongoDB not reachable from vault-1 on hub-internal network"
        log_info "Ensure hub is deployed: ./dive hub deploy"
        return 1
    fi
    log_success "Database connectivity verified"

    local step=0

    # ======================================================================
    # Step 1: Enable database secrets engine
    # ======================================================================
    step=$((step + 1))
    log_info "Step ${step}/6: Enable database secrets engine..."

    if vault secrets list 2>/dev/null | grep -q "^database/"; then
        log_verbose "  database/ engine already enabled — skipping"
    else
        if vault secrets enable -path=database database >/dev/null 2>&1; then
            log_success "  Enabled database/ secrets engine"
        else
            log_error "  Failed to enable database secrets engine"
            return 1
        fi
    fi

    # ======================================================================
    # Step 2: Configure PostgreSQL connection
    # ======================================================================
    step=$((step + 1))
    log_info "Step ${step}/6: Configure PostgreSQL connection..."

    if vault write database/config/postgres-hub \
        plugin_name=postgresql-database-plugin \
        allowed_roles="keycloak-hub,nextauth-hub" \
        connection_url="postgresql://{{username}}:{{password}}@postgres:5432/postgres?sslmode=disable" \
        username="postgres" \
        password="${pg_password}" >/dev/null 2>&1; then
        log_success "  Configured: database/config/postgres-hub"
    else
        log_error "  Failed to configure PostgreSQL connection"
        log_info "  Ensure PostgreSQL is running and vault-1 is on hub-internal network"
        return 1
    fi

    # ======================================================================
    # Step 3: Configure MongoDB connection
    # ======================================================================
    step=$((step + 1))
    log_info "Step ${step}/6: Configure MongoDB connection..."

    if vault write database/config/mongodb-hub \
        plugin_name=mongodb-database-plugin \
        allowed_roles="backend-hub-rw,kas-hub-ro" \
        connection_url="mongodb://{{username}}:{{password}}@mongodb:27017/admin?ssl=false&directConnection=true" \
        username="admin" \
        password="${mongo_password}" >/dev/null 2>&1; then
        log_success "  Configured: database/config/mongodb-hub"
    else
        log_error "  Failed to configure MongoDB connection"
        log_info "  Ensure MongoDB is running and vault-1 is on hub-internal network"
        return 1
    fi

    # ======================================================================
    # Step 4: Create PostgreSQL static roles
    # ======================================================================
    step=$((step + 1))
    log_info "Step ${step}/6: Create PostgreSQL static roles..."

    # keycloak_user static role (24h rotation)
    if vault write database/static-roles/keycloak-hub \
        db_name=postgres-hub \
        rotation_period=86400 \
        username="keycloak_user" >/dev/null 2>&1; then
        log_success "  Created static role: keycloak-hub (keycloak_user, 24h rotation)"
    else
        log_warn "  Failed to create keycloak-hub static role"
        log_info "  Ensure keycloak_user exists in PostgreSQL (check init-db.sh)"
    fi

    # nextauth_user static role (24h rotation)
    if vault write database/static-roles/nextauth-hub \
        db_name=postgres-hub \
        rotation_period=86400 \
        username="nextauth_user" >/dev/null 2>&1; then
        log_success "  Created static role: nextauth-hub (nextauth_user, 24h rotation)"
    else
        log_warn "  Failed to create nextauth-hub static role"
        log_info "  Ensure nextauth_user exists in PostgreSQL (check init-db.sh)"
    fi

    # ======================================================================
    # Step 5: Create MongoDB dynamic roles
    # ======================================================================
    step=$((step + 1))
    log_info "Step ${step}/6: Create MongoDB dynamic roles..."

    # backend-hub-rw: readWrite on dive-v3 database
    if vault write database/roles/backend-hub-rw \
        db_name=mongodb-hub \
        creation_statements='{"db":"admin","roles":[{"role":"readWrite","db":"dive-v3"}]}' \
        revocation_statements='{"db":"admin"}' \
        default_ttl=12h \
        max_ttl=24h >/dev/null 2>&1; then
        log_success "  Created dynamic role: backend-hub-rw (readWrite on dive-v3, 12h TTL)"
    else
        log_error "  Failed to create backend-hub-rw role"
        return 1
    fi

    # kas-hub-ro: read on dive-v3 database
    if vault write database/roles/kas-hub-ro \
        db_name=mongodb-hub \
        creation_statements='{"db":"admin","roles":[{"role":"read","db":"dive-v3"}]}' \
        revocation_statements='{"db":"admin"}' \
        default_ttl=12h \
        max_ttl=24h >/dev/null 2>&1; then
        log_success "  Created dynamic role: kas-hub-ro (read on dive-v3, 12h TTL)"
    else
        log_error "  Failed to create kas-hub-ro role"
        return 1
    fi

    # ======================================================================
    # Step 6: Apply policies
    # ======================================================================
    step=$((step + 1))
    log_info "Step ${step}/6: Apply database policies..."

    # Apply db-hub policy
    local db_hub_policy="${DIVE_ROOT}/vault_config/policies/db-hub.hcl"
    if [ -f "$db_hub_policy" ]; then
        if vault policy write "dive-v3-db-hub" "$db_hub_policy" >/dev/null 2>&1; then
            log_success "  Applied policy: dive-v3-db-hub"
        else
            log_warn "  Failed to apply db-hub policy"
        fi
    fi

    # Re-apply hub admin policy (includes database/* paths)
    local hub_policy="${DIVE_ROOT}/vault_config/policies/hub.hcl"
    if [ -f "$hub_policy" ]; then
        if vault policy write "dive-v3-hub" "$hub_policy" >/dev/null 2>&1; then
            log_success "  Re-applied policy: dive-v3-hub (with database paths)"
        else
            log_warn "  Failed to re-apply hub policy"
        fi
    fi

    # Sync PG static credentials to .env.hub for Docker Compose
    _vault_db_sync_pg_creds_to_env

    echo ""
    log_info "==================================================================="
    log_info "  Vault Database Engine Setup Complete"
    log_info "==================================================================="
    log_info "  PostgreSQL static roles: keycloak-hub, nextauth-hub (24h rotation)"
    log_info "  MongoDB dynamic roles:   backend-hub-rw, kas-hub-ro (12h TTL)"
    log_info "  Next steps:"
    log_info "    1. Add VAULT_DB_ROLE=backend-hub-rw to .env.hub"
    log_info "    2. Add VAULT_DB_ROLE_KAS=kas-hub-ro to .env.hub"
    log_info "    3. ./dive hub deploy"
    log_info "    4. ./dive vault db-test"
    log_info "==================================================================="
}

##
# Sync PostgreSQL static role credentials to .env.hub
# Called after db-setup and can be called independently to refresh creds
##
_vault_db_sync_pg_creds_to_env() {
    local env_file="${DIVE_ROOT}/.env.hub"
    [ ! -f "$env_file" ] && return

    log_info "Syncing PG static credentials to .env.hub..."

    # Fetch current rotated password for keycloak_user
    local kc_password
    kc_password=$(vault read -field=password database/static-creds/keycloak-hub 2>/dev/null || true)
    if [ -n "$kc_password" ]; then
        _vault_update_env "$env_file" "KC_DB_USERNAME" "keycloak_user"
        _vault_update_env "$env_file" "KC_DB_PASSWORD" "$kc_password"
        log_success "  Synced keycloak_user credentials to .env.hub"
    else
        log_verbose "  keycloak-hub static role not ready yet (password not available)"
    fi

    # Fetch current rotated password for nextauth_user
    local na_password
    na_password=$(vault read -field=password database/static-creds/nextauth-hub 2>/dev/null || true)
    if [ -n "$na_password" ]; then
        _vault_update_env "$env_file" "FRONTEND_DATABASE_URL" "postgresql://nextauth_user:${na_password}@postgres:5432/dive_v3_app"
        log_success "  Synced nextauth_user credentials to .env.hub"
    else
        log_verbose "  nextauth-hub static role not ready yet (password not available)"
    fi
}

# =============================================================================
# STATUS
# =============================================================================

##
# Show database engine status, roles, and active leases
##
module_vault_db_status() {
    if ! vault_is_running; then return 1; fi

    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    fi

    echo ""
    log_info "=== Database Secrets Engine Status ==="
    echo ""

    # Check if engine is enabled
    if vault secrets list 2>/dev/null | grep -q "^database/"; then
        log_success "Engine: database/ (enabled)"
    else
        log_warn "Engine: database/ (NOT enabled)"
        log_info "Run: ./dive vault db-setup"
        return 0
    fi

    echo ""
    log_info "--- Database Connections ---"
    local configs
    configs=$(vault list database/config 2>/dev/null || echo "")
    if [ -n "$configs" ]; then
        echo "$configs" | while read -r config; do
            [ -z "$config" ] || [ "$config" = "Keys" ] || [ "$config" = "----" ] && continue
            log_info "  Connection: $config"
        done
    else
        log_warn "  No database connections configured"
    fi

    echo ""
    log_info "--- Static Roles (PostgreSQL) ---"
    local static_roles
    static_roles=$(vault list database/static-roles 2>/dev/null || echo "")
    if [ -n "$static_roles" ]; then
        echo "$static_roles" | while read -r role; do
            [ -z "$role" ] || [ "$role" = "Keys" ] || [ "$role" = "----" ] && continue
            local username rotation_period
            username=$(vault read -field=username "database/static-roles/$role" 2>/dev/null || echo "?")
            rotation_period=$(vault read -field=rotation_period "database/static-roles/$role" 2>/dev/null || echo "?")
            log_info "  $role → user=$username, rotation=${rotation_period}s"
        done
    else
        log_warn "  No static roles configured"
    fi

    echo ""
    log_info "--- Dynamic Roles (MongoDB) ---"
    local dynamic_roles
    dynamic_roles=$(vault list database/roles 2>/dev/null || echo "")
    if [ -n "$dynamic_roles" ]; then
        echo "$dynamic_roles" | while read -r role; do
            [ -z "$role" ] || [ "$role" = "Keys" ] || [ "$role" = "----" ] && continue
            local default_ttl max_ttl
            default_ttl=$(vault read -field=default_ttl "database/roles/$role" 2>/dev/null || echo "?")
            max_ttl=$(vault read -field=max_ttl "database/roles/$role" 2>/dev/null || echo "?")
            log_info "  $role → default_ttl=${default_ttl}, max_ttl=${max_ttl}"
        done
    else
        log_warn "  No dynamic roles configured"
    fi

    echo ""
}

# =============================================================================
# TESTING
# =============================================================================

##
# Run 6-point database credential validation test
##
module_vault_db_test() {
    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    if ! vault_is_running; then return 1; fi

    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    fi

    test_suite_start "Database Credentials Test"

    # Test 1: Engine enabled
    test_start "Database engine enabled"
    if vault secrets list 2>/dev/null | grep -q "^database/"; then
        test_pass
    else
        test_fail "database/ engine not found - run: ./dive vault db-setup"
        test_suite_end
        return 1
    fi

    # Test 2: PG static credentials readable
    test_start "PostgreSQL static credentials (keycloak-hub)"
    local pg_user pg_pass
    pg_user=$(vault read -field=username database/static-creds/keycloak-hub 2>/dev/null || true)
    pg_pass=$(vault read -field=password database/static-creds/keycloak-hub 2>/dev/null || true)
    if [ -n "$pg_user" ] && [ -n "$pg_pass" ]; then
        test_pass "user=$pg_user"
    else
        test_fail "Cannot read keycloak-hub static credentials"
    fi

    # Test 3: MongoDB dynamic credentials issuable
    test_start "MongoDB dynamic credentials (backend-hub-rw)"
    local mongo_response
    mongo_response=$(vault read -format=json database/creds/backend-hub-rw 2>/dev/null || true)
    if [ -n "$mongo_response" ]; then
        local mongo_user mongo_lease
        mongo_user=$(printf '%s\n' "$mongo_response" | jq -r '.data.username // empty' 2>/dev/null || true)
        mongo_lease=$(printf '%s\n' "$mongo_response" | jq -r '.lease_id // empty' 2>/dev/null || true)
        if [ -n "$mongo_user" ] && [ -n "$mongo_lease" ]; then
            test_pass "user=$mongo_user, lease=$mongo_lease"
        else
            test_fail "Dynamic credentials returned but missing username or lease_id"
        fi
    else
        test_fail "Cannot issue dynamic credentials from backend-hub-rw"
    fi

    # Test 4: PG user connects to scoped database
    test_start "PG keycloak_user connects to keycloak_db"
    if [ -n "$pg_pass" ]; then
        if docker exec dive-hub-postgres psql -U keycloak_user -d keycloak_db -c "SELECT 1" >/dev/null 2>&1; then
            test_pass
        else
            test_fail "keycloak_user cannot connect to keycloak_db"
        fi
    else
        test_skip "No PG credentials available"
    fi

    # Test 5: PG user denied on other database
    test_start "PG keycloak_user denied on dive_v3_app (least-privilege)"
    if [ -n "$pg_pass" ]; then
        if docker exec dive-hub-postgres psql -U keycloak_user -d dive_v3_app -c "SELECT 1" >/dev/null 2>&1; then
            test_fail "keycloak_user should NOT have access to dive_v3_app"
        else
            test_pass "Access correctly denied"
        fi
    else
        test_skip "No PG credentials available"
    fi

    # Test 6: Lease renewal works
    test_start "Lease renewal"
    if [ -n "$mongo_lease" ]; then
        if vault lease renew "$mongo_lease" >/dev/null 2>&1; then
            test_pass
            # Revoke test lease to clean up
            vault lease revoke "$mongo_lease" >/dev/null 2>&1 || true
        else
            test_fail "Cannot renew lease: $mongo_lease"
        fi
    else
        test_skip "No active lease to test"
    fi

    test_suite_end
}

# =============================================================================
# SPOKE DATABASE PROVISIONING
# =============================================================================

##
# Add database roles for a spoke instance
# Called from module_vault_provision() when database/ engine is enabled
#
# Arguments:
#   $1 - spoke code (lowercase, e.g., "fra")
##
_vault_db_provision_spoke() {
    local code="$1"
    local code_upper=$(upper "$code")

    log_info "Creating database roles for ${code_upper}..."

    # Read spoke database credentials from Vault KV
    local pg_password mongo_password
    pg_password=$(vault kv get -field=password "dive-v3/core/${code}/postgres" 2>/dev/null || true)
    mongo_password=$(vault kv get -field=password "dive-v3/core/${code}/mongodb" 2>/dev/null || true)

    if [ -z "$pg_password" ] || [ -z "$mongo_password" ]; then
        log_warn "  Spoke ${code_upper} secrets not found in Vault — skipping database role creation"
        log_info "  Database roles will be created when secrets are seeded"
        return 0
    fi

    # Configure PostgreSQL connection for spoke
    if vault write "database/config/postgres-${code}" \
        plugin_name=postgresql-database-plugin \
        allowed_roles="keycloak-${code},nextauth-${code}" \
        connection_url="postgresql://{{username}}:{{password}}@postgres-${code}:5432/postgres?sslmode=disable" \
        username="postgres" \
        password="${pg_password}" >/dev/null 2>&1; then
        log_success "  Configured: database/config/postgres-${code}"
    else
        log_warn "  Failed to configure PostgreSQL for ${code_upper} (spoke may not be deployed)"
        return 0
    fi

    # Configure MongoDB connection for spoke
    if vault write "database/config/mongodb-${code}" \
        plugin_name=mongodb-database-plugin \
        allowed_roles="backend-${code}-rw,kas-${code}-ro" \
        connection_url="mongodb://{{username}}:{{password}}@mongodb-${code}:27017/admin?ssl=false&directConnection=true" \
        username="admin" \
        password="${mongo_password}" >/dev/null 2>&1; then
        log_success "  Configured: database/config/mongodb-${code}"
    else
        log_warn "  Failed to configure MongoDB for ${code_upper} (spoke may not be deployed)"
        return 0
    fi

    # Create PostgreSQL static roles for spoke
    vault write "database/static-roles/keycloak-${code}" \
        db_name="postgres-${code}" \
        rotation_period=86400 \
        username="keycloak_user" >/dev/null 2>&1 && \
        log_success "  Created static role: keycloak-${code}" || \
        log_warn "  Failed to create keycloak-${code} static role"

    vault write "database/static-roles/nextauth-${code}" \
        db_name="postgres-${code}" \
        rotation_period=86400 \
        username="nextauth_user" >/dev/null 2>&1 && \
        log_success "  Created static role: nextauth-${code}" || \
        log_warn "  Failed to create nextauth-${code} static role"

    # Create MongoDB dynamic roles for spoke
    vault write "database/roles/backend-${code}-rw" \
        db_name="mongodb-${code}" \
        creation_statements="{\"db\":\"admin\",\"roles\":[{\"role\":\"readWrite\",\"db\":\"dive-v3-${code}\"}]}" \
        revocation_statements='{"db":"admin"}' \
        default_ttl=12h \
        max_ttl=24h >/dev/null 2>&1 && \
        log_success "  Created dynamic role: backend-${code}-rw" || \
        log_warn "  Failed to create backend-${code}-rw role"

    vault write "database/roles/kas-${code}-ro" \
        db_name="mongodb-${code}" \
        creation_statements="{\"db\":\"admin\",\"roles\":[{\"role\":\"read\",\"db\":\"dive-v3-${code}\"}]}" \
        revocation_statements='{"db":"admin"}' \
        default_ttl=12h \
        max_ttl=24h >/dev/null 2>&1 && \
        log_success "  Created dynamic role: kas-${code}-ro" || \
        log_warn "  Failed to create kas-${code}-ro role"
}
