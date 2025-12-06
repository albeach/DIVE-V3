#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Federation & Hub Commands Module
# =============================================================================
# Commands: federation (status, register, sync-policies, sync-idps, push-audit)
#           hub (start, status, instances, push-policy)
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# FEDERATION COMMANDS
# =============================================================================

federation_status() {
    echo -e "${BOLD}Federation Status:${NC}"
    echo ""
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query hub API for registered instances"
    else
        echo "  Registered Instances:"
        echo "    USA: https://usa-app.dive25.com"
        echo "    FRA: https://fra-app.dive25.com (pending)"
        echo "    GBR: https://gbr-app.dive25.com (pending)"
        echo "    DEU: https://deu-app.dive25.com (pending)"
    fi
}

federation_register() {
    local instance_url="${1:-}"
    if [ -z "$instance_url" ]; then
        echo "Usage: ./dive federation register <instance-url>"
        return 1
    fi
    log_step "Registering instance: $instance_url"
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to hub API: /api/federation/register"
        log_dry "  instance_url: $instance_url"
        log_dry "  instance_code: $INSTANCE"
    else
        echo "Registration would connect to hub API..."
        echo "TODO: Implement hub registration endpoint"
    fi
}

federation_sync_policies() {
    log_step "Syncing policies from hub..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would pull policy bundle from OPAL server"
        log_dry "Would update local OPA with new policies"
    else
        curl -X POST http://localhost:7002/data/config -d '{"entries": ["/"]}' 2>/dev/null || {
            log_warn "OPAL client not running locally"
            echo "Manual sync: policies are in policies/ directory"
        }
    fi
}

federation_sync_idps() {
    log_step "Syncing IdP metadata from hub..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would fetch IdP metadata from hub registry"
        log_dry "Would update local Keycloak IdP configurations"
    else
        echo "IdP sync would connect to hub metadata registry..."
        echo "TODO: Implement IdP metadata sync"
    fi
}

federation_push_audit() {
    log_step "Pushing audit logs to hub..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would export local audit logs"
        log_dry "Would POST to hub audit aggregator"
    else
        echo "Audit push would export logs to hub..."
        echo "TODO: Implement audit log aggregation"
    fi
}

# =============================================================================
# HUB COMMANDS
# =============================================================================

hub_start() {
    log_step "Starting DIVE Hub services..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would start: opal-server, metadata-registry, federation-api"
    else
        echo "Hub services would start here..."
        echo "TODO: Create docker-compose.hub.yml"
    fi
}

hub_status() {
    echo -e "${BOLD}DIVE Hub Status:${NC}"
    echo ""
    echo "  OPAL Server:       $(curl -s -o /dev/null -w '%{http_code}' http://localhost:7002/healthcheck 2>/dev/null || echo 'offline')"
    echo "  Federation API:    $(curl -s -o /dev/null -w '%{http_code}' https://localhost:4000/health -k 2>/dev/null || echo 'offline')"
}

hub_instances() {
    echo -e "${BOLD}Registered Instances:${NC}"
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query hub database for instances"
    else
        echo "  Would list all registered federation instances..."
    fi
}

hub_push_policy() {
    log_step "Pushing policy update to all instances..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would trigger OPAL server to push updates"
        log_dry "All connected OPAL clients would receive new policies"
    else
        curl -X POST http://localhost:7002/policy-update 2>/dev/null || {
            log_warn "OPAL server not running"
        }
    fi
}

# =============================================================================
# HUB BOOTSTRAP (Local/Pilot)
# =============================================================================

_hub_require_secret() {
    local name="$1"
    local value="${!name}"
    if [ -z "$value" ]; then
        log_error "Missing required secret: $name"
        return 1
    fi
    return 0
}

_hub_wait_for_keycloak() {
    local timeout="${1:-90}"
    local elapsed=0
    log_info "Waiting for Keycloak (up to ${timeout}s)..."
    while [ $elapsed -lt $timeout ]; do
        if curl -kfs --max-time 3 "https://localhost:8443/health" >/dev/null 2>&1; then
            log_success "Keycloak is healthy"
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
        echo "  ${elapsed}s elapsed..."
    done
    log_warn "Keycloak health not confirmed after ${timeout}s"
    return 1
}

_hub_apply_terraform() {
    ensure_dive_root
    cd "${DIVE_ROOT}/terraform/pilot"
    [ ! -d ".terraform" ] && terraform init -input=false
    TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET}" \
    TF_VAR_keycloak_admin_password="${KEYCLOAK_ADMIN_PASSWORD}" \
    KEYCLOAK_USER="${KEYCLOAK_ADMIN_USERNAME:-admin}" \
    KEYCLOAK_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD}" \
    terraform apply -input=false -auto-approve
    cd "${DIVE_ROOT}"
}

_hub_init_nextauth_db() {
    local compose_file="docker-compose.pilot.yml"
    local pg_pass="${POSTGRES_PASSWORD:-DivePilot2025!}"
    # Create DB if missing
    docker compose -f "$compose_file" exec -T postgres \
      psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='dive_v3_app';" | grep -q 1 || \
      docker compose -f "$compose_file" exec -T postgres \
      psql -U postgres -c "CREATE DATABASE dive_v3_app;"
    # Apply drizzle SQL migrations
    docker compose -f "$compose_file" exec -T -u 0 frontend sh -lc "
      set -e
      cd /app/drizzle
      for f in \$(ls -1 *.sql 2>/dev/null | sort); do
        PGPASSWORD=${pg_pass} psql -h postgres -U postgres -d dive_v3_app -f \"\$f\"
      done
    "
}

_hub_seed_data() {
    local compose_file="docker-compose.pilot.yml"
    log_step "Seeding sample users/resources (backend)"
    docker compose -f "$compose_file" exec -T backend sh -lc "npm run seed:usa -- --count=100" 2>/dev/null || {
        log_warn "Seeding failed or not available; continuing"
    }
}

_hub_generate_local_secrets() {
    # Generate ephemeral secrets for local/pilot if not provided
    KEYCLOAK_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-$(openssl rand -base64 24 | tr -d '/+=')}"
    KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-$(openssl rand -base64 16 | tr -d '/+=')}"
    POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -base64 12 | tr -d '/+=')}"
    AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -base64 32)}"
    export KEYCLOAK_CLIENT_SECRET KEYCLOAK_ADMIN_PASSWORD POSTGRES_PASSWORD AUTH_SECRET
    log_info "Generated local secrets for pilot bootstrap (not persisted; set env to override)."
}

hub_bootstrap() {
    print_header
    echo -e "${BOLD}DIVE Hub Bootstrap (local/pilot)${NC}"
    echo ""
    ensure_dive_root

    # Generate local secrets if not provided (dev/pilot convenience)
    _hub_generate_local_secrets
    _hub_require_secret KEYCLOAK_CLIENT_SECRET || return 1
    _hub_require_secret KEYCLOAK_ADMIN_PASSWORD || return 1

    # 1) Generate dev certs (local only)
    log_step "Generating dev certificates (local)"
    if [ "$DRY_RUN" = true ]; then
        log_dry "scripts/generate-dev-certs.sh"
    else
        if [ -x "${DIVE_ROOT}/scripts/generate-dev-certs.sh" ]; then
            "${DIVE_ROOT}/scripts/generate-dev-certs.sh" || log_warn "Cert generation script failed (ensure mkcert installed)"
        else
            log_warn "generate-dev-certs.sh not found or not executable; skipping cert generation"
        fi
    fi

    # 2) Bring up stack
    log_step "Starting services (docker-compose.pilot.yml)"
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f docker-compose.pilot.yml up -d"
    else
        docker compose -f docker-compose.pilot.yml up -d
    fi

    # 3) Wait for Keycloak
    [ "$DRY_RUN" = true ] || _hub_wait_for_keycloak 90

    # 4) Terraform apply (broker realm, theme, IdPs)
    log_step "Applying Terraform (pilot)"
    if [ "$DRY_RUN" = true ]; then
        log_dry "cd terraform/pilot && terraform apply -input=false -auto-approve"
    else
        _hub_apply_terraform || return 1
    fi

    # 5) NextAuth DB + migrations
    log_step "Ensuring NextAuth database and schema"
    if [ "$DRY_RUN" = true ]; then
        log_dry "Create DB dive_v3_app if missing via postgres container"
        log_dry "Apply drizzle SQL files from /app/drizzle in frontend container"
    else
        _hub_init_nextauth_db || log_warn "DB init/migrations may need review"
    fi

    # 6) Seed sample data
    [ "$DRY_RUN" = true ] || _hub_seed_data

    log_success "Hub bootstrap complete."
    echo ""
    echo "  Frontend: https://localhost:3000"
    echo "  Backend:  https://localhost:4000"
    echo "  Keycloak: https://localhost:8443"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_federation() {
    local action="${1:-status}"
    shift || true
    
    case "$action" in
        status)        federation_status ;;
        register)      federation_register "$@" ;;
        sync-policies) federation_sync_policies ;;
        sync-idps)     federation_sync_idps ;;
        push-audit)    federation_push_audit ;;
        *)             module_federation_help ;;
    esac
}

module_hub() {
    local action="${1:-help}"
    shift || true
    
    case "$action" in
        start)       hub_start ;;
        status)      hub_status ;;
        instances)   hub_instances ;;
        push-policy) hub_push_policy ;;
        bootstrap)   hub_bootstrap ;;
        *)           module_hub_help ;;
    esac
}

module_federation_help() {
    echo -e "${BOLD}Federation Commands:${NC}"
    echo "  status           Show federation status"
    echo "  register <url>   Register instance with hub"
    echo "  sync-policies    Pull latest policies from hub"
    echo "  sync-idps        Sync IdP metadata from hub"
    echo "  push-audit       Push audit logs to hub"
}

module_hub_help() {
    echo -e "${BOLD}Hub Commands (run from central hub):${NC}"
    echo "  start         Start hub services"
    echo "  status        Show hub service status"
    echo "  instances     List registered instances"
    echo "  push-policy   Push policy update to all instances"
    echo "  bootstrap     Local/pilot hub bootstrap (certs, compose up, terraform, NextAuth DB)"
}



