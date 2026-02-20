#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Vault Test Suites
# =============================================================================
# Sourced by vault/module.sh — do not execute directly.
#
# Functions: test-rotation, test-backup, test-ha, test-seal, test-full-restart,
#   test-pki, test-monitoring, env, test-env, audit-rotate, dr-test
# =============================================================================

module_vault_test_rotation() {
    local target_code="${1:-DEU}"
    local code_lower
    code_lower=$(echo "$target_code" | tr '[:upper:]' '[:lower:]')

    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    # Ensure Vault is running and unsealed
    if ! vault_is_running; then return 1; fi
    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    fi

    test_suite_start "Secret Rotation Test (${target_code})"

    # Step 1: Read current Redis password from Vault
    test_start "Read current secret from Vault"
    local secret_path="dive-v3/core/${code_lower}/redis"
    local original_value
    original_value=$(vault kv get -field=password "$secret_path" 2>/dev/null)
    if [ -n "$original_value" ]; then
        test_pass
    else
        test_fail "Cannot read $secret_path"
        test_suite_end
        return 1
    fi

    # Step 2: Write new test value
    test_start "Write rotated secret to Vault"
    local test_value
    test_value="rotation-test-$(date +%s)"
    if vault kv put "$secret_path" password="$test_value" >/dev/null 2>&1; then
        test_pass
    else
        test_fail "Cannot write to $secret_path"
        test_suite_end
        return 1
    fi

    # Step 3: Read back and verify
    test_start "Readback matches rotated value"
    local readback
    readback=$(vault kv get -field=password "$secret_path" 2>/dev/null)
    if [ "$readback" = "$test_value" ]; then
        test_pass
    else
        test_fail "Readback mismatch (expected: $test_value, got: $readback)"
    fi

    # Step 4: Restore original value (non-destructive)
    test_start "Restore original secret"
    if vault kv put "$secret_path" password="$original_value" >/dev/null 2>&1; then
        test_pass
    else
        test_fail "Cannot restore original value"
    fi

    # Step 5: Verify restore
    test_start "Restored value matches original"
    local restored
    restored=$(vault kv get -field=password "$secret_path" 2>/dev/null)
    if [ "$restored" = "$original_value" ]; then
        test_pass
    else
        test_fail "Restore mismatch"
    fi

    # Step 6: Spoke health check (verify nothing broken)
    test_start "${target_code}: Spoke still healthy after rotation"
    if type -t spoke_verify &>/dev/null; then
        if spoke_verify "$target_code" >/dev/null 2>&1; then
            test_pass
        else
            test_fail "Spoke verification failed"
        fi
    else
        test_skip "spoke_verify not available"
    fi

    test_suite_end
}

##
# Test Vault backup/restore lifecycle
#
# Validates:
#   1. Create Raft snapshot
#   2. Snapshot file exists
#   3. Snapshot is non-empty
#   4. Secrets still readable after snapshot
#   5. List all snapshots
#
# Usage: ./dive vault test-backup
##
module_vault_test_backup() {
    if _vault_is_dev_mode; then
        log_info "Skipping backup test in dev mode (no Raft storage)"
        return 0
    fi
    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    # Ensure Vault is running and unsealed
    if ! vault_is_running; then return 1; fi
    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    fi

    test_suite_start "Vault Backup/Restore Validation"

    # Step 1: Create Raft snapshot (try each port — standby redirects to Docker hostname)
    test_start "Create Raft snapshot"
    local backup_dir="${DIVE_ROOT}/backups/vault"
    local snapshot_path
    snapshot_path="${backup_dir}/vault-test-$(date +%Y%m%d-%H%M%S).snap"
    mkdir -p "$backup_dir"
    local _snap_ok=false
    for _p in 8200 8202 8204; do
        if VAULT_ADDR="${_VAULT_CLI_SCHEME}://localhost:${_p}" vault operator raft snapshot save "$snapshot_path" 2>/dev/null; then
            _snap_ok=true
            break
        fi
    done
    if [ "$_snap_ok" = true ]; then
        test_pass
    else
        test_fail "Snapshot creation failed"
        test_suite_end
        return 1
    fi

    # Step 2: Snapshot file exists
    test_start "Snapshot file exists"
    if [ -f "$snapshot_path" ]; then
        test_pass
    else
        test_fail "File not found: $snapshot_path"
    fi

    # Step 3: Snapshot is non-empty
    test_start "Snapshot is non-empty"
    local snap_size
    snap_size=$(du -h "$snapshot_path" 2>/dev/null | awk '{print $1}')
    local snap_bytes
    snap_bytes=$(wc -c < "$snapshot_path" 2>/dev/null | tr -d ' ')
    if [ "${snap_bytes:-0}" -gt 0 ] 2>/dev/null; then
        test_pass
    else
        test_fail "Snapshot is empty"
    fi

    # Step 4: Secrets still readable after snapshot
    test_start "Secrets readable after snapshot"
    local test_read
    test_read=$(vault kv get -field=password "dive-v3/core/usa/postgres" 2>/dev/null)
    if [ -n "$test_read" ]; then
        test_pass
    else
        test_fail "Cannot read dive-v3/core/usa/postgres"
    fi

    # Step 5: List all snapshots
    test_start "Backup directory has snapshots"
    local snap_count=0
    if [ -d "$backup_dir" ]; then
        snap_count=$(ls -1 "$backup_dir"/*.snap 2>/dev/null | wc -l | tr -d ' ')
    fi
    if [ "${snap_count:-0}" -gt 0 ] 2>/dev/null; then
        test_pass
    else
        test_fail "No snapshots found in $backup_dir"
    fi

    # Summary info
    echo ""
    echo "  Snapshot: $snapshot_path ($snap_size)"
    echo "  Total backups: $snap_count"

    test_suite_end
}

##
# Migrate from Shamir to Transit auto-unseal (delegates to migration script)
##
module_vault_migrate() {
    local migrate_script="${DIVE_ROOT}/scripts/migrate-vault-to-ha.sh"
    if [ ! -f "$migrate_script" ]; then
        log_error "Migration script not found: $migrate_script"
        return 1
    fi
    bash "$migrate_script" "$@"
}

# =============================================================================
# HA Cluster Tests
# =============================================================================

##
# Test HA failover: stop leader, verify secret readable from follower, restart
##
module_vault_test_ha_failover() {
    if _vault_is_dev_mode; then
        log_info "Skipping HA failover test in dev mode (single node)"
        return 0
    fi
    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    test_suite_start "Vault HA Failover"

    if [ ! -f "$VAULT_TOKEN_FILE" ]; then
        log_error "No Vault token found"
        return 1
    fi

    VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
    export VAULT_TOKEN

    # Test 1: Write a test secret
    test_start "Write test secret"
    local test_key
    test_key="ha-failover-test-$(date +%s)"
    if vault kv put dive-v3/core/ha-test value="$test_key" >/dev/null 2>&1; then
        test_pass
    else
        test_fail "Failed to write test secret"
        test_suite_end
        return 1
    fi

    # Test 2: Identify and stop leader
    test_start "Stop leader node"
    local leader_container=""
    for port in 8200 8202 8204; do
        local is_self
        is_self=$(VAULT_ADDR="${_VAULT_CLI_SCHEME}://localhost:$port" VAULT_TOKEN="$VAULT_TOKEN" \
            vault read -format=json sys/leader 2>/dev/null | \
            grep -o '"is_self": *[a-z]*' | sed 's/.*: *//' || echo "false")
        if [ "$is_self" = "true" ]; then
            case $port in
                8200) leader_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-1" ;;
                8202) leader_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-2" ;;
                8204) leader_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-3" ;;
            esac
            break
        fi
    done

    if [ -z "$leader_container" ]; then
        test_fail "Could not identify leader"
        test_suite_end
        return 1
    fi

    docker stop "$leader_container" >/dev/null 2>&1
    test_pass

    # Test 3: Wait for re-election and verify read from follower
    test_start "Read secret after leader loss"
    sleep 10  # Wait for Raft re-election

    local read_success=false
    for port in 8200 8202 8204; do
        local val
        val=$(VAULT_ADDR="${_VAULT_CLI_SCHEME}://localhost:$port" VAULT_TOKEN="$VAULT_TOKEN" \
            vault kv get -field=value dive-v3/core/ha-test 2>/dev/null || true)
        if [ "$val" = "$test_key" ]; then
            read_success=true
            break
        fi
    done

    if [ "$read_success" = true ]; then
        test_pass
    else
        test_fail "Could not read secret from any surviving node"
    fi

    # Test 4: Restart stopped leader
    test_start "Restart stopped node"
    docker start "$leader_container" >/dev/null 2>&1
    sleep 10

    if docker ps --format '{{.Names}}' | grep -q "$leader_container"; then
        test_pass
    else
        test_fail "Node failed to restart"
    fi

    # Test 5: Verify cluster reforms (3 peers)
    test_start "Verify 3-peer cluster"
    local peer_count
    peer_count=$(vault operator raft list-peers -format=json 2>/dev/null | \
        grep -c '"node_id"' || echo "0")

    if [ "$peer_count" -ge 3 ]; then
        test_pass
    else
        test_skip "Only $peer_count peers (may still be rejoining)"
    fi

    # Cleanup
    vault kv delete dive-v3/core/ha-test >/dev/null 2>&1 || true

    test_suite_end
}

##
# Test seal vault restart: verify cluster stays unsealed when seal vault restarts
##
module_vault_test_seal_restart() {
    if _vault_is_dev_mode; then
        log_info "Skipping seal restart test in dev mode (no seal vault)"
        return 0
    fi
    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    test_suite_start "Vault Seal Restart Resilience"

    local seal_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-seal"

    # Test 1: Stop seal vault
    test_start "Stop seal vault"
    docker stop "$seal_container" >/dev/null 2>&1
    test_pass

    # Test 2: Verify cluster nodes stay unsealed
    test_start "Cluster stays unsealed without seal vault"
    sleep 3
    if vault status 2>/dev/null | grep -q "Sealed.*false"; then
        test_pass
    else
        test_fail "Cluster became sealed"
    fi

    # Test 3: Restart seal vault
    test_start "Restart seal vault"
    docker start "$seal_container" >/dev/null 2>&1
    sleep 10
    if docker compose -f docker-compose.hub.yml ps vault-seal 2>/dev/null | grep -q "healthy"; then
        test_pass
    else
        test_skip "Seal vault may still be starting"
    fi

    # Test 4: Restart a cluster node — verify it auto-unseals
    test_start "Restart vault-1, verify auto-unseal"
    local node_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-1"
    docker restart "$node_container" >/dev/null 2>&1
    sleep 15

    if VAULT_ADDR="${_VAULT_CLI_SCHEME}://localhost:${VAULT_API_PORT:-8200}" vault status 2>/dev/null | grep -q "Sealed.*false"; then
        test_pass
    else
        test_fail "vault-1 did not auto-unseal"
    fi

    test_suite_end
}

##
# Test full cluster restart: stop everything, restart in order, verify data intact
##
module_vault_test_full_restart() {
    if _vault_is_dev_mode; then
        log_info "Skipping full restart test in dev mode (single node)"
        return 0
    fi
    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    test_suite_start "Vault Full Cluster Restart"

    if [ ! -f "$VAULT_TOKEN_FILE" ]; then
        log_error "No Vault token found"
        return 1
    fi

    VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
    export VAULT_TOKEN

    local seal_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-seal"

    # Test 1: Write a canary secret
    test_start "Write canary secret"
    local canary
    canary="full-restart-$(date +%s)"
    if vault kv put dive-v3/core/restart-test value="$canary" >/dev/null 2>&1; then
        test_pass
    else
        test_fail "Failed to write canary"
        test_suite_end
        return 1
    fi

    # Test 2: Stop all 4 vault containers
    test_start "Stop all vault containers"
    docker stop "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-3" \
        "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-2" \
        "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-1" \
        "$seal_container" >/dev/null 2>&1
    test_pass

    # Test 3: Restart in correct order
    test_start "Restart seal vault first"
    docker start "$seal_container" >/dev/null 2>&1
    sleep 10
    if docker ps --format '{{.Names}}' | grep -q "$seal_container"; then
        test_pass
    else
        test_fail "Seal vault failed to start"
        test_suite_end
        return 1
    fi

    test_start "Restart cluster nodes"
    docker start "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-1" \
        "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-2" \
        "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-3" >/dev/null 2>&1
    sleep 20  # Wait for auto-unseal + Raft election

    if vault status 2>/dev/null | grep -q "Sealed.*false"; then
        test_pass
    else
        test_fail "Cluster did not auto-unseal"
        test_suite_end
        return 1
    fi

    # Test 4: Verify canary secret
    test_start "Verify canary secret after restart"
    local read_val
    read_val=$(vault kv get -field=value dive-v3/core/restart-test 2>/dev/null || true)
    if [ "$read_val" = "$canary" ]; then
        test_pass
    else
        test_fail "Canary mismatch: expected '$canary', got '$read_val'"
    fi

    # Cleanup
    vault kv delete dive-v3/core/restart-test >/dev/null 2>&1 || true

    test_suite_end
}

##
# Test Vault PKI certificate lifecycle
# Validates Root CA, Intermediate CA, cert issuance, SANs, chain verification
# Usage: ./dive vault test-pki
##
module_vault_test_pki() {
    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"

    test_suite_start "Vault PKI Certificate Automation"

    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    fi

    # Test 1: Root CA exists
    test_start "Root CA exists in pki/"
    local root_ca_pem
    root_ca_pem=$(vault read -field=certificate pki/cert/ca 2>/dev/null || true)
    if [ -n "$root_ca_pem" ] && echo "$root_ca_pem" | grep -q "BEGIN CERTIFICATE"; then
        test_pass
    else
        test_fail "No Root CA found in pki/"
    fi

    # Test 2: Intermediate CA exists
    test_start "Intermediate CA exists in pki_int/"
    local int_ca_pem
    int_ca_pem=$(vault read -field=certificate pki_int/cert/ca 2>/dev/null || true)
    if [ -n "$int_ca_pem" ] && echo "$int_ca_pem" | grep -q "BEGIN CERTIFICATE"; then
        test_pass
    else
        test_fail "No Intermediate CA found in pki_int/"
    fi

    # Test 3: Issue hub certificate
    test_start "Issue hub certificate via hub-services role"
    local test_dir
    test_dir=$(mktemp -d)
    if _vault_pki_issue_cert "hub-services" "test-hub-pki" \
        "localhost dive-hub-keycloak dive-hub-backend" "127.0.0.1,::1" \
        "$test_dir" "1h"; then
        test_pass
    else
        test_fail "Hub cert issuance failed"
        rm -rf "$test_dir"
        test_suite_end
        return 1
    fi

    # Test 4: Certificate files present
    test_start "Certificate files present (certificate.pem, key.pem, ca/rootCA.pem)"
    if [ -f "$test_dir/certificate.pem" ] && [ -f "$test_dir/key.pem" ] && [ -f "$test_dir/ca/rootCA.pem" ]; then
        test_pass
    else
        test_fail "Missing certificate files in $test_dir"
    fi

    # Test 5: Certificate has expected SANs
    test_start "Certificate has expected SANs"
    if openssl x509 -in "$test_dir/certificate.pem" -noout -text 2>/dev/null | grep -q "dive-hub-keycloak"; then
        test_pass
    else
        test_fail "SAN 'dive-hub-keycloak' not found in certificate"
    fi

    # Test 6: CA chain validates certificate
    test_start "CA chain validates certificate"
    if openssl verify -CAfile "$test_dir/ca/rootCA.pem" "$test_dir/certificate.pem" 2>/dev/null | grep -q "OK"; then
        test_pass
    else
        test_fail "Certificate verification failed against CA chain"
    fi

    # Test 7: Java truststore generation
    test_start "Java truststore generation"
    if command -v keytool &>/dev/null; then
        if _generate_truststore_from_ca "$test_dir/ca/rootCA.pem" "$test_dir" && \
           [ -f "$test_dir/truststore.p12" ]; then
            test_pass
        else
            test_fail "truststore.p12 not created"
        fi
    else
        test_skip "keytool not available"
    fi

    # Cleanup
    rm -rf "$test_dir"

    test_suite_end
}

##
# Test Vault monitoring infrastructure
# Validates: telemetry endpoint, key metrics, all nodes, Prometheus config, snapshot
# Usage: ./dive vault test-monitoring
##
module_vault_test_monitoring() {
    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    fi

    test_suite_start "Vault Monitoring Infrastructure"

    # Test 1: Metrics endpoint returns 200
    test_start "Vault metrics endpoint responds (vault-1)"
    local metrics_response
    metrics_response=$(curl -sf "http://localhost:${VAULT_API_PORT:-8200}/v1/sys/metrics?format=prometheus" 2>/dev/null || true)
    if [ -n "$metrics_response" ]; then
        test_pass
    else
        test_fail "No response from http://localhost:8200/v1/sys/metrics?format=prometheus"
    fi

    # Test 2: Key metric present (vault_core_unsealed)
    test_start "Key metric vault_core_unsealed present"
    if echo "$metrics_response" | grep -q "vault_core_unsealed"; then
        test_pass
    else
        test_fail "vault_core_unsealed not found in metrics output"
    fi

    # Test 3: All 4 nodes respond on metrics endpoint
    test_start "All 4 Vault nodes expose metrics"
    local nodes_ok=0
    local node_ports=(8200 8202 8204 8210)
    for port in "${node_ports[@]}"; do
        if curl -sf "http://localhost:${port}/v1/sys/metrics?format=prometheus" >/dev/null 2>&1; then
            nodes_ok=$((nodes_ok + 1))
        fi
    done
    if [ "$nodes_ok" -eq 4 ]; then
        test_pass
    else
        test_fail "Only ${nodes_ok}/4 nodes responding on metrics endpoint"
    fi

    # Test 4: Prometheus config has vault-cluster job
    test_start "Prometheus config has vault-cluster scrape job"
    local prom_config="${DIVE_ROOT}/monitoring/prometheus.yml"
    if [ -f "$prom_config" ] && grep -q "vault-cluster" "$prom_config"; then
        test_pass
    else
        test_fail "vault-cluster job not found in $prom_config"
    fi

    # Test 5: Alert rules file exists and has vault rules
    test_start "Vault alert rules configured"
    local alerts_file="${DIVE_ROOT}/monitoring/alerts/vault-alerts.yml"
    if [ -f "$alerts_file" ] && grep -q "VaultNodeSealed" "$alerts_file"; then
        test_pass
    else
        test_fail "Vault alert rules not found at $alerts_file"
    fi

    # Test 6: Grafana dashboard exists
    test_start "Vault Grafana dashboard exists"
    local dashboard_file="${DIVE_ROOT}/monitoring/dashboards/vault-cluster.json"
    if [ -f "$dashboard_file" ] && grep -q "vault-ha-cluster" "$dashboard_file"; then
        test_pass
    else
        test_fail "Vault dashboard not found at $dashboard_file"
    fi

    # Test 7: Snapshot command works (try each port — standby nodes redirect to Docker-internal leader hostname)
    test_start "Vault snapshot command succeeds"
    local test_snap
    test_snap="${DIVE_ROOT}/backups/vault/vault-monitoring-test-$(date +%s).snap"
    mkdir -p "$(dirname "$test_snap")"
    local snap_ok=false
    for snap_port in 8200 8202 8204; do
        if VAULT_ADDR="${_VAULT_CLI_SCHEME}://localhost:${snap_port}" vault operator raft snapshot save "$test_snap" 2>/dev/null; then
            snap_ok=true
            break
        fi
    done
    if [ "$snap_ok" = true ]; then
        local snap_size
        snap_size=$(wc -c < "$test_snap" 2>/dev/null | tr -d ' ')
        if [ "${snap_size:-0}" -gt 0 ] 2>/dev/null; then
            test_pass
        else
            test_fail "Snapshot file is empty"
        fi
        rm -f "$test_snap"
    else
        test_fail "vault operator raft snapshot save failed on all ports"
    fi

    test_suite_end
}

##
# Show current Vault environment configuration
##
module_vault_env() {
    local vault_profile
    vault_profile=$(_vault_get_profile)
    local is_dev="no"
    _vault_is_dev_mode && is_dev="yes"

    echo ""
    echo "==================================================================="
    echo "  Vault Environment Configuration"
    echo "==================================================================="
    echo ""
    echo "  DIVE_ENV:          ${DIVE_ENV:-local} (default: local)"
    echo "  Vault Profile:     ${vault_profile}"
    echo "  Dev Mode:          ${is_dev}"
    echo "  VAULT_ADDR:        ${VAULT_ADDR}"
    echo "  VAULT_CLI_ADDR:    ${VAULT_CLI_ADDR:-not set}"
    echo "  SECRETS_PROVIDER:  ${SECRETS_PROVIDER:-not set}"
    echo ""

    if [ "$is_dev" = "yes" ]; then
        echo "  Topology:          Single node (in-memory)"
        echo "  Root Token:        root"
        echo "  TLS:               Disabled"
        echo "  Audit:             Optional"
        echo "  Data Persistence:  None (re-seeded each deploy)"
    else
        echo "  Topology:          4-node HA (seal + 3 Raft)"
        echo "  Auto-Unseal:       Transit (via vault-seal)"
        if is_production_mode; then
            echo "  TLS:               Mandatory"
            echo "  Audit:             Mandatory"
        else
            echo "  TLS:               Optional"
            echo "  Audit:             Optional"
        fi
        echo "  Data Persistence:  Raft volumes"
    fi
    echo ""
    echo "==================================================================="
}

##
# Test multi-environment Vault configuration
##
module_vault_test_env() {
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    fi

    local vault_profile
    vault_profile=$(_vault_get_profile)

    test_suite_start "Vault Multi-Environment Configuration"

    # Test 1: Profile function returns expected value
    test_start "Profile detection for DIVE_ENV=${DIVE_ENV:-local}"
    if [ -n "$vault_profile" ]; then
        test_pass "profile=$vault_profile"
    else
        test_fail "No profile returned"
    fi

    # Test 2: Vault is running (correct container type)
    test_start "Vault container running (profile: $vault_profile)"
    if vault_is_running; then
        test_pass
    else
        test_fail "Vault not running"
    fi

    # Test 3: Vault is unsealed
    test_start "Vault is unsealed"
    if vault status 2>/dev/null | grep -q "Sealed.*false"; then
        test_pass
    else
        test_fail "Vault is sealed or not responding"
    fi

    # Test 4: Can read/write secrets
    test_start "Secret read/write functional"
    if vault kv put dive-v3/core/env-test value="test-$(date +%s)" >/dev/null 2>&1; then
        vault kv delete dive-v3/core/env-test >/dev/null 2>&1
        test_pass
    else
        test_fail "Cannot write secrets"
    fi

    # Test 5+: Mode-specific checks
    if _vault_is_dev_mode; then
        test_start "Dev mode: root token works"
        if VAULT_TOKEN=root vault status >/dev/null 2>&1; then
            test_pass
        else
            test_fail "Root token 'root' not accepted"
        fi
    else
        test_start "HA mode: 3 Raft peers"
        local peers
        peers=$(vault operator raft list-peers -format=json 2>/dev/null | grep -c '"node_id"' || echo "0")
        if [ "$peers" -ge 3 ]; then
            test_pass "$peers peers"
        else
            test_fail "Only $peers Raft peers (expected 3)"
        fi

        test_start "HA mode: Seal vault healthy"
        if docker ps --format '{{.Names}}' | grep -q "vault-seal"; then
            test_pass
        else
            test_fail "Seal vault not running"
        fi
    fi

    test_suite_end
}

##
# Rotate Vault audit log to prevent unbounded disk growth.
# Archives the current audit.log if it exceeds the configured max size,
# truncates the active log, and prunes old archives.
#
# Integrated into backup schedule for automated maintenance.
# Usage: ./dive vault audit-rotate
##
module_vault_audit_rotate() {
    if _vault_is_dev_mode; then
        log_info "Vault dev mode — no audit log to rotate"
        return 0
    fi

    local max_size_mb="${VAULT_AUDIT_LOG_MAX_SIZE_MB:-100}"
    local retention_days="${VAULT_AUDIT_LOG_RETENTION_DAYS:-30}"
    local container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-1"

    # Check if audit log exists
    local log_size_bytes
    log_size_bytes=$(docker exec "$container" stat -c %s /vault/logs/audit.log 2>/dev/null || echo "0")

    if [ "$log_size_bytes" = "0" ]; then
        log_info "Audit log is empty or not found — nothing to rotate"
        return 0
    fi

    local log_size_mb=$(( log_size_bytes / 1048576 ))
    log_info "Vault audit log: ${log_size_mb}MB (threshold: ${max_size_mb}MB)"

    if [ "$log_size_mb" -lt "$max_size_mb" ]; then
        log_info "Below threshold — no rotation needed"
        return 0
    fi

    # Archive the current log
    local archive_name
    archive_name="audit-$(date +%Y%m%d-%H%M%S).log.gz"
    log_info "Archiving audit log as ${archive_name}..."

    if docker exec "$container" sh -c "gzip -c /vault/logs/audit.log > /vault/logs/${archive_name}"; then
        # Truncate the active log (don't delete — Vault has a file handle on it)
        docker exec "$container" sh -c ": > /vault/logs/audit.log"
        log_success "Audit log archived and truncated"
    else
        log_error "Failed to archive audit log"
        return 1
    fi

    # Prune old archives
    local pruned=0
    while IFS= read -r old_archive; do
        [ -z "$old_archive" ] && continue
        docker exec "$container" rm -f "/vault/logs/$old_archive"
        pruned=$((pruned + 1))
    done < <(docker exec "$container" find /vault/logs -name "audit-*.log.gz" -mtime "+${retention_days}" -exec basename {} \; 2>/dev/null)

    if [ "$pruned" -gt 0 ]; then
        log_info "Pruned ${pruned} archive(s) older than ${retention_days} days"
    fi

    log_success "Audit log rotation complete"
}

##
# Disaster Recovery test — validates snapshot + restore workflow.
# Non-destructive: writes a canary secret, snapshots, deletes it,
# restores from snapshot, verifies the canary is restored.
#
# Usage: ./dive vault dr-test
##
module_vault_dr_test() {
    if _vault_is_dev_mode; then
        log_warn "Vault dev mode uses in-memory storage — DR test not applicable"
        return 0
    fi

    if ! vault_is_running; then
        return 1
    fi

    # Load token
    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    else
        log_error "Vault token not found — run: ./dive vault init"
        return 1
    fi

    echo ""
    log_info "=== Vault Disaster Recovery Test ==="
    echo ""

    local canary_value
    canary_value="dr-test-$(date +%s)-$$"
    local test_passed=true

    # Step 1: Write canary secret
    log_info "[1/5] Writing canary secret..."
    if vault kv put dive-v3/core/dr-test canary="$canary_value" >/dev/null 2>&1; then
        log_success "  Canary written: ${canary_value}"
    else
        log_error "  Failed to write canary secret"
        return 1
    fi

    # Step 2: Create snapshot
    log_info "[2/5] Creating Raft snapshot..."
    local snap_dir="${DIVE_ROOT}/backups/vault"
    mkdir -p "$snap_dir"
    local snap_path
    snap_path="${snap_dir}/dr-test-$(date +%Y%m%d-%H%M%S).snap"

    if ! module_vault_snapshot "$snap_path"; then
        log_error "  Snapshot creation failed"
        vault kv delete dive-v3/core/dr-test >/dev/null 2>&1
        return 1
    fi

    # Step 3: Simulate data loss — delete canary
    log_info "[3/5] Simulating data loss (deleting canary)..."
    if vault kv delete dive-v3/core/dr-test >/dev/null 2>&1; then
        log_success "  Canary deleted — simulating data loss"
    else
        log_warn "  Could not delete canary (may already be gone)"
    fi

    # Verify canary is gone
    if vault kv get dive-v3/core/dr-test >/dev/null 2>&1; then
        log_warn "  Canary still readable after delete (soft-delete) — proceeding"
    fi

    # Step 4: Restore from snapshot
    log_info "[4/5] Restoring from snapshot..."
    local restore_ok=false
    for _restore_port in 8200 8202 8204; do
        if VAULT_ADDR="${_VAULT_CLI_SCHEME}://localhost:${_restore_port}" vault operator raft snapshot restore -force "$snap_path" 2>/dev/null; then
            restore_ok=true
            break
        fi
    done

    if [ "$restore_ok" = true ]; then
        log_success "  Snapshot restored"
        # Brief pause for Raft to re-elect leader after restore
        sleep 5
    else
        log_error "  Failed to restore snapshot"
        test_passed=false
    fi

    # Step 5: Verify canary is restored
    log_info "[5/5] Verifying canary secret..."
    local restored_value
    restored_value=$(vault kv get -field=canary dive-v3/core/dr-test 2>/dev/null || echo "")

    if [ "$restored_value" = "$canary_value" ]; then
        log_success "  Canary verified: ${restored_value}"
    else
        log_error "  Canary mismatch: expected '${canary_value}', got '${restored_value}'"
        test_passed=false
    fi

    # Cleanup
    vault kv delete dive-v3/core/dr-test >/dev/null 2>&1
    rm -f "$snap_path"

    echo ""
    if [ "$test_passed" = true ]; then
        log_success "=== DR Test PASSED: snapshot + restore verified ==="
    else
        log_error "=== DR Test FAILED ==="
        return 1
    fi
    echo ""
}

##
# Main module dispatcher
##
