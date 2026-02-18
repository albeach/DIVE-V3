#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Vault Node Certificate Bootstrap
# =============================================================================
# Extracted from certs/vault-nodes.sh (Phase 13e)
# =============================================================================

[ -n "${DIVE_CERTS_VAULT_BOOTSTRAP_LOADED:-}" ] && return 0

# =============================================================================
# VAULT NODE TLS CERTIFICATES
# =============================================================================
# Two-phase approach for Vault node TLS:
#   Phase A (cold start):  OpenSSL bootstrap CA — used when Vault PKI is not
#                          yet available (initial cluster startup).
#   Phase B (steady state): After module_vault_pki_setup(), re-issue node certs
#                          from Vault PKI Intermediate CA via rolling restart.
#   Local dev fallback:    mkcert used only on local macOS/Linux workstations.
# =============================================================================

## Bootstrap CA directory (one-time, 7-day TTL, OpenSSL self-signed)
VAULT_BOOTSTRAP_CA_DIR="${DIVE_ROOT:-$(pwd)}/certs/vault/bootstrap-ca"

## Vault node cert validity (OpenSSL bootstrap certs)
VAULT_BOOTSTRAP_CERT_DAYS="${VAULT_BOOTSTRAP_CERT_DAYS:-7}"

##
# Get the path to the CA certificate that should be used for CLI→Vault TLS.
#
# Priority:
#   1. node1/ca.pem (Vault PKI or bootstrap CA — matches current node cert issuer)
#   2. Bootstrap CA ca.pem (from certs/vault/bootstrap-ca/)
#   3. mkcert CA (local dev only — never on cloud/EC2)
#   4. Empty string (Vault TLS disabled / HTTP mode)
#
# Output: absolute path to CA PEM file (or empty string)
##
_vault_cacert_path() {
    local node1_ca="${DIVE_ROOT:-$(pwd)}/certs/vault/node1/ca.pem"

    # If node1 has a ca.pem, use it (works for both bootstrap and Vault PKI)
    if [ -f "$node1_ca" ]; then
        echo "$node1_ca"
        return 0
    fi

    # Bootstrap CA fallback
    local bootstrap_ca="${DIVE_ROOT:-$(pwd)}/certs/vault/bootstrap-ca/ca.pem"
    if [ -f "$bootstrap_ca" ]; then
        echo "$bootstrap_ca"
        return 0
    fi

    # mkcert fallback (local dev only — cloud uses bootstrap CA or Vault PKI)
    if ! is_cloud_environment 2>/dev/null && command -v mkcert &>/dev/null; then
        local mkcert_ca
        mkcert_ca="$(mkcert -CAROOT 2>/dev/null)/rootCA.pem"
        if [ -f "$mkcert_ca" ]; then
            echo "$mkcert_ca"
            return 0
        fi
    fi

    # No CA available
    echo ""
}

##
# Generate a one-time OpenSSL self-signed bootstrap CA for Vault node TLS.
# Only used during initial Vault cluster startup before Vault PKI is available.
# Stored in certs/vault/bootstrap-ca/ with a 7-day TTL.
#
# Idempotent: skips generation if bootstrap CA exists and is still valid.
#
# Returns:
#   0 - Bootstrap CA ready (generated or already valid)
#   1 - OpenSSL not available or generation failed
##
_generate_bootstrap_ca() {
    ensure_dive_root
    local ca_dir="$VAULT_BOOTSTRAP_CA_DIR"
    local ca_key="$ca_dir/ca-key.pem"
    local ca_cert="$ca_dir/ca.pem"

    # Idempotent: reuse if CA cert exists and has >1 day remaining
    if [ -f "$ca_cert" ] && [ -f "$ca_key" ]; then
        local days_left
        days_left=$(_cert_days_remaining "$ca_cert")
        if [ "$days_left" -gt 1 ] 2>/dev/null; then
            log_verbose "Bootstrap CA valid for ${days_left} days — reusing"
            return 0
        fi
        log_info "Bootstrap CA expires in ${days_left} days — regenerating"
    fi

    if ! command -v openssl &>/dev/null; then
        log_error "OpenSSL is required for bootstrap CA generation"
        return 1
    fi

    mkdir -p "$ca_dir"

    log_info "Generating bootstrap CA for Vault node TLS (${VAULT_BOOTSTRAP_CERT_DAYS}-day TTL)..."

    # Generate RSA 4096 CA key
    if ! openssl genrsa -out "$ca_key" 4096 2>/dev/null; then
        log_error "Failed to generate bootstrap CA key"
        return 1
    fi
    chmod 600 "$ca_key"

    # Generate self-signed CA certificate
    if ! openssl req -x509 -new -nodes \
        -key "$ca_key" \
        -sha256 \
        -days "$VAULT_BOOTSTRAP_CERT_DAYS" \
        -out "$ca_cert" \
        -subj "/O=DIVE Federation/CN=DIVE V3 Vault Bootstrap CA" 2>/dev/null; then
        log_error "Failed to generate bootstrap CA certificate"
        rm -f "$ca_key"
        return 1
    fi
    chmod 644 "$ca_cert"

    log_success "Bootstrap CA generated: $ca_cert (${VAULT_BOOTSTRAP_CERT_DAYS}-day TTL)"
    return 0
}

##
# Generate a TLS certificate for a single Vault node using the bootstrap CA.
#
# Arguments:
#   $1 - Node name (node1, node2, node3)
#   $2 - Output directory (e.g., certs/vault/node1)
#
# Returns:
#   0 - Certificate generated
#   1 - Failed
##
_generate_bootstrap_node_cert() {
    local node="${1:?Node name required}"
    local node_dir="${2:?Output directory required}"
    local ca_key="$VAULT_BOOTSTRAP_CA_DIR/ca-key.pem"
    local ca_cert="$VAULT_BOOTSTRAP_CA_DIR/ca.pem"

    if [ ! -f "$ca_key" ] || [ ! -f "$ca_cert" ]; then
        log_error "Bootstrap CA not found — run _generate_bootstrap_ca() first"
        return 1
    fi

    mkdir -p "$node_dir"

    # Build SANs from SSOT
    local dns_sans ip_sans
    dns_sans=$(_vault_node_dns_sans "$node")
    ip_sans=$(_vault_node_ip_sans)

    # Create OpenSSL extensions config for SANs
    local ext_file
    ext_file=$(mktemp)
    {
        echo "[v3_req]"
        echo "basicConstraints = CA:FALSE"
        echo "keyUsage = digitalSignature, keyEncipherment"
        echo "extendedKeyUsage = serverAuth, clientAuth"
        echo "subjectAltName = @alt_names"
        echo ""
        echo "[alt_names]"
        local i=1
        local san
        for san in $dns_sans; do
            echo "DNS.${i} = ${san}"
            i=$((i + 1))
        done
        i=1
        for san in $ip_sans; do
            echo "IP.${i} = ${san}"
            i=$((i + 1))
        done
    } > "$ext_file"

    # Generate node key
    if ! openssl genrsa -out "$node_dir/key.pem" 2048 2>/dev/null; then
        log_error "Failed to generate key for Vault ${node}"
        rm -f "$ext_file"
        return 1
    fi
    chmod 644 "$node_dir/key.pem"  # 644: Vault container runs as uid 100 (vault), needs read access

    # Generate CSR
    if ! openssl req -new \
        -key "$node_dir/key.pem" \
        -out "$node_dir/node.csr" \
        -subj "/O=DIVE Federation/CN=${node}" 2>/dev/null; then
        log_error "Failed to generate CSR for Vault ${node}"
        rm -f "$ext_file"
        return 1
    fi

    # Sign with bootstrap CA
    if ! openssl x509 -req \
        -in "$node_dir/node.csr" \
        -CA "$ca_cert" \
        -CAkey "$ca_key" \
        -CAcreateserial \
        -out "$node_dir/certificate.pem" \
        -days "$VAULT_BOOTSTRAP_CERT_DAYS" \
        -sha256 \
        -extensions v3_req \
        -extfile "$ext_file" 2>/dev/null; then
        log_error "Failed to sign certificate for Vault ${node}"
        rm -f "$ext_file" "$node_dir/node.csr"
        return 1
    fi

    chmod 644 "$node_dir/certificate.pem"

    # Copy bootstrap CA cert for retry_join TLS verification
    cp "$ca_cert" "$node_dir/ca.pem"
    chmod 644 "$node_dir/ca.pem"

    # Clean up temp files
    rm -f "$ext_file" "$node_dir/node.csr"

    log_success "Vault ${node}: bootstrap certificate generated (${VAULT_BOOTSTRAP_CERT_DAYS}-day TTL)"
    return 0
}

##
# Check whether current Vault node certs were issued by the bootstrap CA
# (as opposed to Vault PKI Intermediate CA).
#
# Returns:
#   0 - Bootstrap certs detected (or no certs)
#   1 - Vault PKI certs already in place
##
_vault_node_certs_are_bootstrap() {
    ensure_dive_root
    local cert_file="${DIVE_ROOT}/certs/vault/node1/certificate.pem"

    if [ ! -f "$cert_file" ]; then
        return 0  # No certs = treat as bootstrap needed
    fi

    # Check issuer — bootstrap CA has "Bootstrap" in CN, Vault PKI has "Intermediate"
    if openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null | grep -q "Bootstrap"; then
        return 0
    fi

    return 1
}

##
# Rotate Vault node TLS certificates from bootstrap CA to Vault PKI.
#
# After Vault PKI is initialized (module_vault_pki_setup), this function:
#   1. Creates a "vault-node-services" PKI role in pki_int/
#   2. Issues new certs for each node via Vault PKI Intermediate CA
#   3. Performs rolling restart: one node at a time, verifying cluster health
#
# Prerequisites:
#   - Vault is running and PKI is initialized (pki_int/ exists)
#   - VAULT_TOKEN is set (or .vault-token exists)
#
# Idempotent: skips if node certs already issued by Vault PKI.
#
# Usage: ./dive certs vault-rotate-to-pki  OR  ./dive vault rotate-node-certs
#
# Returns:
#   0 - All nodes rotated (or already on Vault PKI)
#   1 - Failed
##
_rotate_vault_node_certs_to_pki() {
    ensure_dive_root

    # Skip if not in production mode or if already on Vault PKI certs
    if ! _vault_node_certs_are_bootstrap; then
        log_info "Vault node certs already issued by Vault PKI — skipping rotation"
        return 0
    fi

    log_info "Rotating Vault node TLS from bootstrap CA to Vault PKI..."

    local vault_addr="${VAULT_CLI_ADDR:-${VAULT_ADDR:-https://localhost:8200}}"
    local vault_token="${VAULT_TOKEN:-}"

    if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
        vault_token=$(cat "${DIVE_ROOT}/.vault-token")
    fi

    if [ -z "$vault_token" ]; then
        log_warn "Vault token not available — cannot rotate to PKI (will use bootstrap certs)"
        return 0
    fi

    # Build --cacert flag for bootstrap CA (current TLS cert issuer)
    local cacert_flag
    cacert_flag=$(_vault_curl_cacert_flag)

    # Check that Vault PKI Intermediate CA is available
    local int_ca_check
    # shellcheck disable=SC2086
    int_ca_check=$(curl -sL $cacert_flag -H "X-Vault-Token: $vault_token" \
        "${vault_addr}/v1/pki_int/cert/ca" 2>/dev/null | jq -r '.data.certificate // empty' 2>/dev/null)
    if [ -z "$int_ca_check" ] || ! echo "$int_ca_check" | grep -q "BEGIN CERTIFICATE"; then
        log_warn "Vault PKI Intermediate CA not available — keeping bootstrap certs"
        return 0
    fi

    # Step 1: Create vault-node-services PKI role (idempotent)
    local node_dns_all="vault-1,vault-2,vault-3,dive-hub-vault,localhost"
    log_info "Creating PKI role: vault-node-services..."

    local role_response
    # shellcheck disable=SC2086
    role_response=$(curl -sL $cacert_flag -X POST \
        -H "X-Vault-Token: $vault_token" \
        -H "Content-Type: application/json" \
        -d "{
            \"allowed_domains\": \"$node_dns_all\",
            \"allow_bare_domains\": true,
            \"allow_subdomains\": false,
            \"allow_any_name\": false,
            \"enforce_hostnames\": true,
            \"allow_ip_sans\": true,
            \"allow_localhost\": true,
            \"server_flag\": true,
            \"client_flag\": true,
            \"max_ttl\": \"2160h\",
            \"key_type\": \"rsa\",
            \"key_bits\": 2048,
            \"require_cn\": false
        }" \
        "${vault_addr}/v1/pki_int/roles/vault-node-services" 2>/dev/null)

    local role_errors
    role_errors=$(printf '%s\n' "$role_response" | jq -r '.errors // empty' 2>/dev/null)
    if [ -n "$role_errors" ] && [ "$role_errors" != "null" ] && [ "$role_errors" != "" ]; then
        log_error "Failed to create vault-node-services PKI role: $role_errors"
        return 1
    fi
    log_success "  PKI role: vault-node-services (constrained to vault-1,vault-2,vault-3)"

    # Step 2: Issue new certs for each node (atomic: all-or-nothing)
    local vault_certs_dir="${DIVE_ROOT}/certs/vault"
    local nodes=("node1" "node2" "node3")
    local node_containers=("vault-1" "vault-2" "vault-3")
    local i=0
    local rotation_ok=true

    # Phase A: Issue all certs to a staging directory (no overwrites yet)
    local staging_dir="${vault_certs_dir}/.rotation-staging"
    rm -rf "$staging_dir"
    mkdir -p "$staging_dir"

    for node in "${nodes[@]}"; do
        local container_name="${node_containers[$i]}"

        log_info "Issuing Vault PKI cert for ${node} (${container_name})..."

        local dns_sans ip_sans
        dns_sans=$(_vault_node_dns_sans "$node")
        ip_sans=$(_vault_node_ip_sans)

        local dns_csv ip_csv
        dns_csv=$(echo "$dns_sans" | tr ' ' ',')
        ip_csv=$(echo "$ip_sans" | tr ' ' ',')

        # Issue cert via Vault PKI (with retry for transient failures)
        local response curl_err attempt=0 max_attempts=3
        while [ $attempt -lt $max_attempts ]; do
            curl_err=""
            # shellcheck disable=SC2086
            response=$(curl -sL $cacert_flag -X POST \
                -H "X-Vault-Token: $vault_token" \
                -H "Content-Type: application/json" \
                -d "{
                    \"common_name\": \"${container_name}\",
                    \"alt_names\": \"$dns_csv\",
                    \"ip_sans\": \"$ip_csv\",
                    \"ttl\": \"2160h\",
                    \"format\": \"pem\"
                }" \
                "${vault_addr}/v1/pki_int/issue/vault-node-services" 2>&1) || curl_err="curl exit $?"
            # Non-empty JSON response with certificate data = success
            if [ -n "$response" ] && printf '%s\n' "$response" | jq -e '.data.certificate' &>/dev/null; then
                break
            fi
            attempt=$((attempt + 1))
            [ $attempt -lt $max_attempts ] && { log_warn "Vault PKI: retry ${attempt}/${max_attempts} for ${node} (${curl_err:-empty response})"; sleep 2; }
        done

        local errors
        errors=$(printf '%s\n' "$response" | jq -r '.errors // empty' 2>/dev/null)
        if [ -n "$errors" ] && [ "$errors" != "null" ] && [ "$errors" != "" ]; then
            log_error "Failed to issue cert for ${node}: $errors"
            rotation_ok=false
            break
        fi

        # Extract certificate components
        local certificate private_key issuing_ca ca_chain
        certificate=$(printf '%s\n' "$response" | jq -r '.data.certificate // empty')
        private_key=$(printf '%s\n' "$response" | jq -r '.data.private_key // empty')
        issuing_ca=$(printf '%s\n' "$response" | jq -r '.data.issuing_ca // empty')
        ca_chain=$(printf '%s\n' "$response" | jq -r 'if .data.ca_chain then .data.ca_chain | join("\n") else empty end' 2>/dev/null || true)

        if [ -z "$certificate" ] || [ -z "$private_key" ]; then
            log_error "Vault PKI returned empty cert/key for ${node}"
            rotation_ok=false
            break
        fi

        # Stage cert files (don't overwrite originals yet)
        mkdir -p "$staging_dir/$node"
        printf '%s\n' "$certificate" > "$staging_dir/$node/certificate.pem"
        printf '%s\n' "$private_key" > "$staging_dir/$node/key.pem"
        {
            printf '%s\n' "$issuing_ca"
            if [ -n "$ca_chain" ] && [ "$ca_chain" != "null" ]; then
                printf '%s\n' "$ca_chain"
            fi
        } > "$staging_dir/$node/ca.pem"

        log_success "  ${node}: Vault PKI cert issued (90-day TTL)"
        i=$((i + 1))
    done

    # Phase B: Commit staged certs only if ALL nodes succeeded
    if [ "$rotation_ok" = "true" ]; then
        for node in "${nodes[@]}"; do
            local node_dir="${vault_certs_dir}/${node}"
            cp "$staging_dir/$node/certificate.pem" "$node_dir/certificate.pem"
            cp "$staging_dir/$node/key.pem" "$node_dir/key.pem"
            cp "$staging_dir/$node/ca.pem" "$node_dir/ca.pem"
            chmod 644 "$node_dir/key.pem" "$node_dir/certificate.pem" "$node_dir/ca.pem"
        done
    else
        log_warn "Partial rotation failed — keeping bootstrap CA certs (no changes made)"
        rm -rf "$staging_dir"
        return 0
    fi

    rm -rf "$staging_dir"

    # Step 3: Rolling restart of Vault nodes
    log_info "Performing rolling restart of Vault nodes..."

    local compose_project="${COMPOSE_PROJECT_NAME:-dive-hub}"

    for node in "${nodes[@]}"; do
        local container_name
        case "$node" in
            node1) container_name="${compose_project}-vault-1" ;;
            node2) container_name="${compose_project}-vault-2" ;;
            node3) container_name="${compose_project}-vault-3" ;;
        esac

        # Check if container is running
        if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
            log_verbose "  ${container_name} not running — skip restart"
            continue
        fi

        log_info "  Restarting ${container_name}..."
        docker restart "$container_name" >/dev/null 2>&1

        # Wait for node to become healthy (up to 30s)
        local wait_time=0
        while [ $wait_time -lt 30 ]; do
            local health
            health=$(docker inspect "$container_name" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
            if [ "$health" = "healthy" ]; then
                log_success "  ${container_name}: healthy (${wait_time}s)"
                break
            fi
            sleep 2
            wait_time=$((wait_time + 2))
        done

        if [ $wait_time -ge 30 ]; then
            log_warn "  ${container_name}: did not become healthy within 30s (continuing)"
        fi

        # Brief pause between restarts to allow Raft consensus
        sleep 3
    done

    log_success "Vault node TLS rotated to Vault PKI Intermediate CA"
    log_info "  Verify: openssl x509 -in certs/vault/node1/certificate.pem -noout -issuer"
    return 0
}

##
# Generate TLS certificates for Vault HA cluster nodes.
#
# Production mode:  Uses OpenSSL bootstrap CA (no mkcert dependency).
# Dev/local mode:   Uses mkcert (existing behavior).
#
# Output: certs/vault/node{1,2,3}/{certificate.pem, key.pem, ca.pem}
# Idempotent: skips nodes whose certs have >30 days remaining.
#
# Usage: ./dive certs vault-tls-setup  OR  ./dive vault tls-setup
##
generate_vault_node_certs() {
    ensure_dive_root

    local vault_certs_dir="${DIVE_ROOT}/certs/vault"

    # ── Bootstrap CA mode: production, EC2, or any non-local environment ──
    # mkcert is a development-only tool and should NEVER be used on EC2/cloud
    local use_bootstrap_ca=false
    if is_production_mode; then
        use_bootstrap_ca=true
    elif [ -n "${HUB_EXTERNAL_ADDRESS:-}" ] && [ "$HUB_EXTERNAL_ADDRESS" != "localhost" ]; then
        use_bootstrap_ca=true
    elif [ -n "${INSTANCE_PRIVATE_IP:-}" ]; then
        use_bootstrap_ca=true
    elif curl -sX PUT "http://169.254.169.254/latest/api/token" \
            -H "X-aws-ec2-metadata-token-ttl-seconds: 60" -m 1 >/dev/null 2>&1; then
        use_bootstrap_ca=true  # IMDSv2
    elif curl -sf -m 1 http://169.254.169.254/latest/meta-data/ >/dev/null 2>&1; then
        use_bootstrap_ca=true  # IMDSv1
    fi

    if [ "$use_bootstrap_ca" = "true" ]; then
        log_info "Non-local environment: generating Vault node TLS via bootstrap CA..."

        if ! _generate_bootstrap_ca; then
            log_error "Failed to generate bootstrap CA"
            return 1
        fi

        local node nodes=("node1" "node2" "node3")
        local generated=0 skipped=0

        for node in "${nodes[@]}"; do
            local node_dir="${vault_certs_dir}/${node}"
            local cert_file="${node_dir}/certificate.pem"

            # Idempotent: skip if cert exists and has >1 day remaining
            # (bootstrap certs are short-lived; 1 day is the floor)
            if [ -f "$cert_file" ]; then
                local days_left
                days_left=$(_cert_days_remaining "$cert_file")
                if [ "$days_left" -gt 1 ] 2>/dev/null; then
                    log_verbose "Vault ${node} cert valid for ${days_left} days — skipping"
                    skipped=$((skipped + 1))
                    continue
                fi
                log_info "Vault ${node} cert expires in ${days_left} days — regenerating"
            fi

            if _generate_bootstrap_node_cert "$node" "$node_dir"; then
                generated=$((generated + 1))
            else
                return 1
            fi
        done

        echo ""
        log_success "Vault node TLS (bootstrap): ${generated} generated, ${skipped} skipped"
        echo "  Output: ${vault_certs_dir}/node{1,2,3}/"
        echo ""
        return 0
    fi

    # ── Dev / local mode: use mkcert (original behavior) ──
    # Fall back to bootstrap CA if mkcert is unavailable (e.g., EC2 instances)
    if ! check_mkcert_ready; then
        log_warn "mkcert not available — falling back to OpenSSL bootstrap CA"
        if ! _generate_bootstrap_ca; then
            log_error "Failed to generate bootstrap CA"
            return 1
        fi
        local node nodes=("node1" "node2" "node3")
        local generated=0 skipped=0
        for node in "${nodes[@]}"; do
            local node_dir="${vault_certs_dir}/${node}"
            local cert_file="${node_dir}/certificate.pem"
            if [ -f "$cert_file" ]; then
                local days_left
                days_left=$(_cert_days_remaining "$cert_file")
                if [ "$days_left" -gt 1 ] 2>/dev/null; then
                    log_verbose "Vault ${node} cert valid for ${days_left} days — skipping"
                    skipped=$((skipped + 1))
                    continue
                fi
            fi
            if _generate_bootstrap_node_cert "$node" "$node_dir"; then
                generated=$((generated + 1))
            else
                return 1
            fi
        done
        log_success "Vault node TLS (bootstrap fallback): ${generated} generated, ${skipped} skipped"
        return 0
    fi

    local mkcert_ca
    mkcert_ca="$(mkcert -CAROOT)/rootCA.pem"

    if [ ! -f "$mkcert_ca" ]; then
        log_error "mkcert Root CA not found at ${mkcert_ca}"
        return 1
    fi

    log_info "Generating TLS certificates for Vault HA cluster nodes (mkcert)..."

    local node nodes=("node1" "node2" "node3")
    local generated=0 skipped=0

    for node in "${nodes[@]}"; do
        local node_dir="${vault_certs_dir}/${node}"
        local cert_file="${node_dir}/certificate.pem"

        # Idempotent: skip if cert exists and has >30 days remaining
        if [ -f "$cert_file" ]; then
            local days_left
            days_left=$(_cert_days_remaining "$cert_file")
            if [ "$days_left" -gt 30 ] 2>/dev/null; then
                log_verbose "Vault ${node} cert valid for ${days_left} days — skipping"
                skipped=$((skipped + 1))
                continue
            fi
            log_info "Vault ${node} cert expires in ${days_left} days — regenerating"
        fi

        mkdir -p "$node_dir"

        # Build SANs for this node (mkcert format: space-separated DNS + IP)
        local sans
        sans=$(_vault_node_cert_sans "$node")

        # Generate cert with mkcert (skip trust store updates)
        # shellcheck disable=SC2086
        if TRUST_STORES="" mkcert -key-file "$node_dir/key.pem" \
                  -cert-file "$node_dir/certificate.pem" \
                  $sans 2>/dev/null; then
            chmod 644 "$node_dir/key.pem"  # 644: Vault container runs as uid 100 (vault), needs read access
            chmod 644 "$node_dir/certificate.pem"

            # Copy mkcert Root CA for retry_join TLS verification
            cp "$mkcert_ca" "$node_dir/ca.pem"
            chmod 644 "$node_dir/ca.pem"

            generated=$((generated + 1))
            log_success "Vault ${node}: certificate generated (SANs: ${sans})"
        else
            log_error "Failed to generate certificate for Vault ${node}"
            return 1
        fi
    done

    echo ""
    log_success "Vault node TLS certificates: ${generated} generated, ${skipped} skipped (valid)"
    echo "  Output: ${vault_certs_dir}/node{1,2,3}/"
    echo ""
    return 0
}

##
# Return DNS SANs for a Vault node (no IP addresses).
# Node 1 includes the dive-hub-vault alias (primary entry point).
#
# Arguments:
#   $1 - Node name: node1, node2, or node3
##
_vault_node_dns_sans() {
    local node="${1:?Node name required}"

    case "$node" in
        node1) echo "vault-1 dive-hub-vault localhost" ;;
        node2) echo "vault-2 localhost" ;;
        node3) echo "vault-3 localhost" ;;
        *)     log_error "Unknown vault node: $node"; return 1 ;;
    esac
}

##
# Return IP SANs for Vault nodes (loopback + EC2 instance IP if available).
##
_vault_node_ip_sans() {
    local sans="127.0.0.1 ::1"
    [ -n "${INSTANCE_PRIVATE_IP:-}" ] && sans="$sans ${INSTANCE_PRIVATE_IP}"
    [ -n "${INSTANCE_PUBLIC_IP:-}" ] && sans="$sans ${INSTANCE_PUBLIC_IP}"
    echo "$sans"
}

##
# Return combined DNS + IP SANs for a Vault node (mkcert format).
# mkcert accepts mixed DNS/IP as space-separated arguments.
#
# Arguments:
#   $1 - Node name: node1, node2, or node3
##
_vault_node_cert_sans() {
    local node="${1:?Node name required}"
    echo "$(_vault_node_dns_sans "$node") $(_vault_node_ip_sans)"
}

##
# Calculate days until a certificate expires.
# Compatible with macOS (LibreSSL) and Linux (OpenSSL).
#
# Arguments:
#   $1 - Path to PEM certificate file
##
_cert_days_remaining() {
    local cert_file="${1:?Certificate path required}"
    local expiry_epoch now_epoch

    expiry_epoch=$(openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null \
        | sed 's/notAfter=//' \
        | xargs -I{} date -j -f "%b %d %T %Y %Z" "{}" "+%s" 2>/dev/null \
        || openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null \
        | sed 's/notAfter=//' \
        | xargs -I{} date -d "{}" "+%s" 2>/dev/null)

    now_epoch=$(date +%s)

    if [ -n "$expiry_epoch" ] && [ -n "$now_epoch" ]; then
        echo $(( (expiry_epoch - now_epoch) / 86400 ))
    else
        echo "0"
    fi
}


export DIVE_CERTS_VAULT_BOOTSTRAP_LOADED=1
