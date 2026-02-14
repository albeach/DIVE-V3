# =============================================================================
# DIVE V3 CLI - Certificate Monitoring, Metrics & Runbooks
# =============================================================================
# Sourced by certificates.sh — do not execute directly.
#
# Sections: Prometheus metrics export, status report, operational runbooks
# =============================================================================

# =============================================================================
# CERTIFICATE MONITORING & METRICS (Phase 5)
# =============================================================================

##
# Export certificate metrics in Prometheus textfile collector format.
#
# Writes metrics for all hub + spoke instance certificates, plus CA certs.
# Uses atomic .tmp → mv pattern for safe concurrent reads.
#
# Metrics:
#   dive_cert_expiry_seconds{instance,issuer}  - seconds until cert expires
#   dive_cert_is_vault_pki{instance}           - 1 if Vault PKI, 0 if mkcert
#   dive_pki_root_ca_expiry_seconds            - seconds until Root CA expires
#   dive_pki_intermediate_ca_expiry_seconds    - seconds until Intermediate CA expires
##
_cert_metrics_export() {
    ensure_dive_root
    local metrics_dir="${DIVE_ROOT}/monitoring/textfile"
    mkdir -p "$metrics_dir"
    local prom_file="${metrics_dir}/cert_expiry.prom"
    local now_epoch
    now_epoch=$(date +%s)

    {
        echo "# DIVE V3 Certificate Metrics"
        echo "# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo ""
        echo "# HELP dive_cert_expiry_seconds Seconds until service certificate expires"
        echo "# TYPE dive_cert_expiry_seconds gauge"

        # Hub cert
        local hub_cert="${DIVE_ROOT}/instances/hub/certs/certificate.pem"
        if [ -f "$hub_cert" ]; then
            local days issuer_label
            days=$(_cert_days_remaining "$hub_cert" 2>/dev/null || echo "0")
            issuer_label=$(_cert_issuer_label "$hub_cert")
            echo "dive_cert_expiry_seconds{instance=\"hub\",issuer=\"${issuer_label}\"} $((days * 86400))"
        fi

        # Spoke certs
        local spoke_list="${DIVE_SPOKE_LIST:-}"
        if [ -z "$spoke_list" ] && type _get_provisioned_spokes &>/dev/null; then
            spoke_list=$(_get_provisioned_spokes)
        fi
        [ -z "$spoke_list" ] && spoke_list="gbr fra deu can"

        local code
        for code in $spoke_list; do
            local cert="${DIVE_ROOT}/instances/${code}/certs/certificate.pem"
            if [ -f "$cert" ]; then
                local days issuer_label
                days=$(_cert_days_remaining "$cert" 2>/dev/null || echo "0")
                issuer_label=$(_cert_issuer_label "$cert")
                echo "dive_cert_expiry_seconds{instance=\"${code}\",issuer=\"${issuer_label}\"} $((days * 86400))"
            fi
        done

        # Vault node certs
        local node
        for node in 1 2 3; do
            local node_cert="${DIVE_ROOT}/certs/vault/node${node}/certificate.pem"
            if [ -f "$node_cert" ]; then
                local days issuer_label
                days=$(_cert_days_remaining "$node_cert" 2>/dev/null || echo "0")
                issuer_label=$(_cert_issuer_label "$node_cert")
                echo "dive_cert_expiry_seconds{instance=\"vault-${node}\",issuer=\"${issuer_label}\"} $((days * 86400))"
            fi
        done

        echo ""
        echo "# HELP dive_cert_is_vault_pki Whether certificate was issued by Vault PKI (1) or mkcert (0)"
        echo "# TYPE dive_cert_is_vault_pki gauge"

        # Hub
        if [ -f "$hub_cert" ]; then
            local is_vault=0
            [ "$(_cert_issuer_label "$hub_cert")" = "vault-pki" ] && is_vault=1
            echo "dive_cert_is_vault_pki{instance=\"hub\"} ${is_vault}"
        fi
        for code in $spoke_list; do
            local cert="${DIVE_ROOT}/instances/${code}/certs/certificate.pem"
            if [ -f "$cert" ]; then
                local is_vault=0
                [ "$(_cert_issuer_label "$cert")" = "vault-pki" ] && is_vault=1
                echo "dive_cert_is_vault_pki{instance=\"${code}\"} ${is_vault}"
            fi
        done

        # CA certs (if Vault PKI is available)
        echo ""
        echo "# HELP dive_pki_root_ca_expiry_seconds Seconds until Root CA certificate expires"
        echo "# TYPE dive_pki_root_ca_expiry_seconds gauge"
        echo "# HELP dive_pki_intermediate_ca_expiry_seconds Seconds until Intermediate CA certificate expires"
        echo "# TYPE dive_pki_intermediate_ca_expiry_seconds gauge"

        local vault_addr="${VAULT_CLI_ADDR:-${VAULT_ADDR:-https://localhost:8200}}"
        local vault_token="${VAULT_TOKEN:-}"
        if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
            vault_token=$(cat "${DIVE_ROOT}/.vault-token")
        fi

        if [ -n "$vault_token" ]; then
            local cacert_flag
            cacert_flag=$(_vault_curl_cacert_flag 2>/dev/null || true)

            # Root CA
            local root_ca_pem
            # shellcheck disable=SC2086
            root_ca_pem=$(curl -sL $cacert_flag -H "X-Vault-Token: ${vault_token}" \
                "${vault_addr}/v1/pki/cert/ca" 2>/dev/null | jq -r '.data.certificate // empty' 2>/dev/null)
            if [ -n "$root_ca_pem" ]; then
                local root_expiry
                root_expiry=$(echo "$root_ca_pem" | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')
                if [ -n "$root_expiry" ]; then
                    local root_epoch
                    if date -j >/dev/null 2>&1; then
                        root_epoch=$(date -j -f "%b %d %H:%M:%S %Y %Z" "$root_expiry" "+%s" 2>/dev/null || echo "0")
                    else
                        root_epoch=$(date -d "$root_expiry" "+%s" 2>/dev/null || echo "0")
                    fi
                    [ "$root_epoch" -gt 0 ] && echo "dive_pki_root_ca_expiry_seconds $((root_epoch - now_epoch))"
                fi
            fi

            # Intermediate CA
            local int_ca_pem
            # shellcheck disable=SC2086
            int_ca_pem=$(curl -sL $cacert_flag -H "X-Vault-Token: ${vault_token}" \
                "${vault_addr}/v1/pki_int/cert/ca" 2>/dev/null | jq -r '.data.certificate // empty' 2>/dev/null)
            if [ -n "$int_ca_pem" ]; then
                local int_expiry
                int_expiry=$(echo "$int_ca_pem" | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')
                if [ -n "$int_expiry" ]; then
                    local int_epoch
                    if date -j >/dev/null 2>&1; then
                        int_epoch=$(date -j -f "%b %d %H:%M:%S %Y %Z" "$int_expiry" "+%s" 2>/dev/null || echo "0")
                    else
                        int_epoch=$(date -d "$int_expiry" "+%s" 2>/dev/null || echo "0")
                    fi
                    [ "$int_epoch" -gt 0 ] && echo "dive_pki_intermediate_ca_expiry_seconds $((int_epoch - now_epoch))"
                fi
            fi
        fi

    } > "${prom_file}.tmp"

    mv "${prom_file}.tmp" "$prom_file"
    log_verbose "Certificate metrics written to ${prom_file}"
}

##
# Helper: Determine certificate issuer label for metrics.
# Returns "vault-pki", "mkcert", or "unknown".
##
_cert_issuer_label() {
    local cert_file="$1"
    if openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null | grep -q "DIVE V3"; then
        echo "vault-pki"
    elif openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null | grep -q "mkcert"; then
        echo "mkcert"
    elif openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null | grep -q "Bootstrap"; then
        echo "bootstrap"
    else
        echo "unknown"
    fi
}

##
# Print a comprehensive certificate status report.
#
# Shows: hub + all spokes + Vault node certs + Root CA + Intermediate CA
# Colorized: green (>30d), yellow (14-30d), red (<14d), bold red (expired)
#
# Usage: ./dive certs status
##
cert_status_report() {
    ensure_dive_root

    echo ""
    echo -e "${BOLD}DIVE V3 Certificate Status Report${NC}"
    echo -e "${BOLD}$(date -u +"%Y-%m-%d %H:%M:%S UTC")${NC}"
    echo ""

    printf "  %-12s %-14s %-44s %-10s %-12s %s\n" \
        "Instance" "Issuer" "Serial" "Days Left" "Expiry" "Status"
    printf "  %-12s %-14s %-44s %-10s %-12s %s\n" \
        "------------" "--------------" "--------------------------------------------" "----------" "------------" "------"

    # Hub
    _cert_status_row "hub" "${DIVE_ROOT}/instances/hub/certs/certificate.pem"

    # Spokes
    local spoke_list="${DIVE_SPOKE_LIST:-}"
    if [ -z "$spoke_list" ] && type _get_provisioned_spokes &>/dev/null; then
        spoke_list=$(_get_provisioned_spokes)
    fi
    [ -z "$spoke_list" ] && spoke_list="gbr fra deu can"

    local code
    for code in $spoke_list; do
        _cert_status_row "$code" "${DIVE_ROOT}/instances/${code}/certs/certificate.pem"
    done

    # Vault node certs
    local node
    for node in 1 2 3; do
        _cert_status_row "vault-${node}" "${DIVE_ROOT}/certs/vault/node${node}/certificate.pem"
    done

    echo ""

    # CA certificates (if Vault available)
    local vault_addr="${VAULT_CLI_ADDR:-${VAULT_ADDR:-https://localhost:8200}}"
    local vault_token="${VAULT_TOKEN:-}"
    if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
        vault_token=$(cat "${DIVE_ROOT}/.vault-token")
    fi

    if [ -n "$vault_token" ]; then
        echo -e "  ${BOLD}CA Certificates:${NC}"
        local cacert_flag
        cacert_flag=$(_vault_curl_cacert_flag 2>/dev/null || true)

        # Root CA
        local root_pem
        # shellcheck disable=SC2086
        root_pem=$(curl -sL $cacert_flag -H "X-Vault-Token: ${vault_token}" \
            "${vault_addr}/v1/pki/cert/ca" 2>/dev/null | jq -r '.data.certificate // empty' 2>/dev/null)
        if [ -n "$root_pem" ]; then
            local root_days root_expiry_str
            root_expiry_str=$(echo "$root_pem" | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')
            local tmp_root
            tmp_root=$(mktemp)
            echo "$root_pem" > "$tmp_root"
            root_days=$(_cert_days_remaining "$tmp_root" 2>/dev/null || echo "?")
            rm -f "$tmp_root"
            local ca_status="${GREEN}OK${NC}"
            if [ "$root_days" != "?" ] && [ "$root_days" -lt 90 ] 2>/dev/null; then
                ca_status="${YELLOW}EXPIRING${NC}"
            fi
            printf "  %-12s %-14s %-10s " "Root CA" "Self-signed" "${root_days}d"
            echo -e "$ca_status"
        fi

        # Intermediate CA
        local int_pem
        # shellcheck disable=SC2086
        int_pem=$(curl -sL $cacert_flag -H "X-Vault-Token: ${vault_token}" \
            "${vault_addr}/v1/pki_int/cert/ca" 2>/dev/null | jq -r '.data.certificate // empty' 2>/dev/null)
        if [ -n "$int_pem" ]; then
            local int_days
            local tmp_int
            tmp_int=$(mktemp)
            echo "$int_pem" > "$tmp_int"
            int_days=$(_cert_days_remaining "$tmp_int" 2>/dev/null || echo "?")
            rm -f "$tmp_int"
            local int_status="${GREEN}OK${NC}"
            if [ "$int_days" != "?" ] && [ "$int_days" -lt 90 ] 2>/dev/null; then
                int_status="${YELLOW}EXPIRING${NC}"
            fi
            printf "  %-12s %-14s %-10s " "Interm. CA" "Root CA" "${int_days}d"
            echo -e "$int_status"
        fi
        echo ""
    fi

    # Export metrics if called interactively
    _cert_metrics_export 2>/dev/null || true
}

##
# Print one row for the status report.
##
_cert_status_row() {
    local instance="$1"
    local cert_file="$2"

    if [ ! -f "$cert_file" ]; then
        return 0
    fi

    local issuer_short serial days_left expiry_date status_label

    # Issuer
    issuer_short=$(_cert_issuer_label "$cert_file")
    case "$issuer_short" in
        vault-pki) issuer_short="Vault PKI" ;;
        bootstrap) issuer_short="Bootstrap CA" ;;
        mkcert)    issuer_short="mkcert" ;;
        *)         issuer_short="unknown" ;;
    esac

    # Serial
    serial=$(_cert_get_serial "$cert_file" 2>/dev/null || echo "n/a")
    [ "${#serial}" -gt 44 ] && serial="${serial:0:41}..."

    # Days remaining
    days_left=$(_cert_days_remaining "$cert_file" 2>/dev/null || echo "?")

    # Expiry date (short)
    expiry_date=$(openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null \
        | sed 's/notAfter=//' | cut -d' ' -f1-3 || echo "?")

    # Status with color
    if [ "$days_left" = "?" ] || { [ "$days_left" -le 0 ] 2>/dev/null; }; then
        status_label="${RED}${BOLD}EXPIRED${NC}"
    elif [ "$days_left" -lt 14 ] 2>/dev/null; then
        status_label="${RED}CRITICAL${NC}"
    elif [ "$days_left" -lt 30 ] 2>/dev/null; then
        status_label="${YELLOW}WARNING${NC}"
    else
        status_label="${GREEN}OK${NC}"
    fi

    printf "  %-12s %-14s %-44s %-10s %-12s " "$instance" "$issuer_short" "$serial" "${days_left}d" "$expiry_date"
    echo -e "$status_label"
}

# =============================================================================
# OPERATIONAL RUNBOOKS (Phase 6)
# =============================================================================

##
# Print operational runbook for a given emergency scenario.
#
# Usage: ./dive certs runbook <scenario>
# Scenarios: compromised-spoke-key, compromised-intermediate-ca,
#            compromised-root-ca, vault-cluster-failure
##
_cert_runbook() {
    local scenario="${1:-}"

    case "$scenario" in
        compromised-spoke-key)
            cat <<'RUNBOOK'
=============================================================================
  RUNBOOK: Compromised Spoke Key
=============================================================================

  Scenario: A spoke's TLS private key has been compromised.

  Impact: Attacker can impersonate the spoke, intercept MTLS traffic.

  Steps:
    1. IMMEDIATELY revoke the compromised certificate:
         ./dive certs revoke <SPOKE_CODE>

    2. Refresh the spoke's Vault AppRole SecretID:
         ./dive vault refresh-credentials <SPOKE_CODE>

    3. Emergency rotate the spoke certificate:
         ./dive certs emergency-rotate spoke <SPOKE_CODE> --force

    4. Verify the new certificate is active:
         ./dive certs status

    5. Check CRL distribution:
         ./dive certs crl-status

    6. Monitor for any authentication failures:
         docker logs dive-spoke-<code>-keycloak 2>&1 | grep -i "ssl\|tls\|cert"

    7. If the spoke was used for federation, notify other spoke operators
       and verify federation health:
         ./dive federation health

  Time to resolve: ~2 minutes (automated), ~10 minutes (with verification)

=============================================================================
RUNBOOK
            ;;
        compromised-intermediate-ca)
            cat <<'RUNBOOK'
=============================================================================
  RUNBOOK: Compromised Intermediate CA
=============================================================================

  Scenario: The Intermediate CA private key has been compromised.

  Impact: Attacker can issue certificates for ANY service. ALL certs are suspect.

  Steps:
    1. IMMEDIATELY backup current state:
         ./dive vault backup-pki

    2. Rekey the Intermediate CA (generates new key pair + re-issues all certs):
         ./dive vault rekey-intermediate --confirm

       This will:
       - Generate a new Intermediate CA key pair
       - Sign it with the Root CA
       - Revoke and re-issue ALL service certificates
       - Restart ALL services

    3. Verify all certificates are re-issued:
         ./dive certs status

    4. Verify CRL contains all old certificates:
         ./dive certs crl-status

    5. If Vault AppRoles may be compromised:
         ./dive vault refresh-credentials all

    6. Rotate all KV secrets as well (belt-and-suspenders):
         ./dive vault rotate all

    7. Review Vault audit logs for unauthorized certificate issuance:
         ls -la logs/vault/

  Time to resolve: ~5 minutes (automated), ~30 minutes (with full verification)

=============================================================================
RUNBOOK
            ;;
        compromised-root-ca)
            cat <<'RUNBOOK'
=============================================================================
  RUNBOOK: Compromised Root CA
=============================================================================

  Scenario: The Root CA private key has been compromised.

  Impact: TOTAL COMPROMISE — attacker can issue any certificate, including new
          Intermediate CAs. Trust in the entire PKI hierarchy is destroyed.

  THIS REQUIRES MANUAL INTERVENTION — there is no automated recovery.

  Steps:
    1. STOP ALL SERVICES immediately:
         ./dive nuke

    2. Backup current Vault state:
         ./dive vault backup-pki

    3. Destroy the Vault cluster data:
         docker volume rm dive-v3_vault-1-data dive-v3_vault-2-data dive-v3_vault-3-data

    4. Re-initialize Vault:
         ./dive vault init
         ./dive vault setup

    5. Re-create PKI hierarchy with new Root CA:
         ./dive vault pki-setup

    6. Re-provision all spokes:
         ./dive vault seed
         ./dive vault provision DEU
         ./dive vault provision FRA
         (repeat for all spokes)

    7. Generate new TLS certificates for Vault nodes:
         ./dive vault tls-setup

    8. Redeploy everything:
         ./dive hub deploy
         ./dive spoke deploy DEU
         (repeat for all spokes)

    9. Update any external trust stores that had the old Root CA:
         ./dive vault trust-ca

   10. Notify all federation partners that the Root CA has changed.

  Time to resolve: ~1 hour (full redeployment required)

  PREVENTION: Enable Vault audit logging, restrict access to Root CA,
  use the Intermediate CA for all day-to-day operations.

=============================================================================
RUNBOOK
            ;;
        vault-cluster-failure)
            cat <<'RUNBOOK'
=============================================================================
  RUNBOOK: Vault Cluster Failure
=============================================================================

  Scenario: Vault cluster is down — cannot issue/revoke certs, no secret access.

  Impact: New deployments blocked, secret rotation blocked, existing services
          continue operating with cached credentials until lease expiry.

  Steps:
    1. Check cluster status:
         ./dive vault status
         ./dive vault cluster status

    2. Check if seal vault is healthy:
         ./dive vault seal-status

    3. If seal vault is down, restart it:
         docker compose -f docker-compose.hub.yml up -d vault-seal

    4. Restart Vault cluster nodes:
         docker compose -f docker-compose.hub.yml restart vault-1 vault-2 vault-3

    5. Wait for auto-unseal (30s), then check:
         ./dive vault status

    6. If nodes are sealed and seal vault is healthy:
         ./dive vault unseal

    7. If data is corrupted, restore from backup:
         ./dive vault backup-list
         ./dive vault restore-pki <latest-snapshot>

    8. Verify PKI is functional:
         ./dive vault test-pki

    9. Verify all service certificates:
         ./dive certs status

   10. If restore fails completely:
         See: ./dive certs runbook compromised-root-ca
         (start fresh with new PKI hierarchy)

  Time to resolve: ~5 minutes (restart), ~15 minutes (restore from backup)

=============================================================================
RUNBOOK
            ;;
        *)
            echo ""
            echo "Available runbooks:"
            echo "  compromised-spoke-key        — Single spoke key compromised"
            echo "  compromised-intermediate-ca  — Intermediate CA key compromised"
            echo "  compromised-root-ca          — Root CA compromised (manual recovery)"
            echo "  vault-cluster-failure        — Vault cluster down, restore from backup"
            echo ""
            echo "Usage: ./dive certs runbook <scenario>"
            ;;
    esac
}

