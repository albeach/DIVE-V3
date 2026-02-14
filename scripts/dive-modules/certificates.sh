#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Certificate Management Module (Dispatcher)
# =============================================================================
# Commands: prepare-federation, update-hub-sans, install-ca, verify-certs,
#           revoke, crl-*, status, metrics-export, emergency-rotate, runbook
#
# This file sources the sub-modules and provides the CLI dispatch entry point.
# Sub-modules:
#   certs/core.sh        — generation (mkcert + Vault PKI), SAN SSOT, truststore
#   certs/vault-nodes.sh — verification, system trust store, Vault node TLS
#   certs/revocation.sh  — CRL management, spoke/hub revocation, emergency rotation
#   certs/monitoring.sh  — Prometheus metrics, status report, operational runbooks
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Source sub-modules
_CERTS_DIR="$(dirname "${BASH_SOURCE[0]}")/certs"
source "${_CERTS_DIR}/core.sh"
source "${_CERTS_DIR}/vault-nodes.sh"
source "${_CERTS_DIR}/revocation.sh"
source "${_CERTS_DIR}/monitoring.sh"
unset _CERTS_DIR

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_certificates() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        prepare-federation)
            prepare_federation_certificates "$@"
            ;;
        prepare-all)
            prepare_all_certificates
            ;;
        update-hub-sans)
            update_hub_certificate_sans "$@"
            ;;
        install-hub-ca)
            install_mkcert_ca_in_hub "$@"
            ;;
        install-spoke-ca)
            install_mkcert_ca_in_spoke "$@"
            ;;
        generate-spoke)
            generate_spoke_certificate "$@"
            ;;
        sync-ca)
            sync_mkcert_ca_to_all
            ;;
        trust-ca)
            install_vault_ca_to_system_truststore
            ;;
        untrust-ca)
            remove_vault_ca_from_system_truststore
            ;;
        vault-tls-setup)
            generate_vault_node_certs
            ;;
        vault-rotate-to-pki)
            _rotate_vault_node_certs_to_pki
            ;;
        verify)
            verify_federation_certificates "$@"
            ;;
        verify-all)
            verify_all_certificates
            ;;
        check)
            check_mkcert_ready
            ;;
        revoke)
            revoke_spoke_certificates "$@"
            ;;
        revoke-hub)
            revoke_hub_certificate
            ;;
        crl-status)
            show_crl_status
            ;;
        crl-rotate)
            rotate_crl
            ;;
        crl-distribute)
            _distribute_crl
            ;;
        status)
            cert_status_report
            ;;
        metrics-export)
            _cert_metrics_export
            ;;
        emergency-rotate)
            cert_emergency_rotate "$@"
            ;;
        runbook)
            _cert_runbook "$@"
            ;;
        *)
            module_certificates_help
            ;;
    esac
}

module_certificates_help() {
    echo -e "${BOLD}Certificate Management Commands:${NC}"
    echo ""
    echo "  ${CYAN}prepare-federation${NC} <spoke>  Complete certificate setup for federation"
    echo "  ${CYAN}prepare-all${NC}                 Prepare certificates for all spokes"
    echo "  ${CYAN}update-hub-sans${NC}             Update Hub cert with all spoke SANs"
    echo "  ${CYAN}install-hub-ca${NC}              Install mkcert CA in Hub truststore"
    echo "  ${CYAN}install-spoke-ca${NC} <spoke>    Install mkcert CA in spoke truststore"
    echo "  ${CYAN}generate-spoke${NC} <spoke>      Generate spoke certificate"
    echo "  ${CYAN}sync-ca${NC}                     Sync local mkcert CA to all instances"
    echo "  ${CYAN}trust-ca${NC}                    Install Vault Root CA in system trust store"
    echo "  ${CYAN}untrust-ca${NC}                  Remove Vault Root CA from system trust store"
    echo "  ${CYAN}vault-tls-setup${NC}             Generate TLS certs for Vault HA nodes"
    echo "  ${CYAN}vault-rotate-to-pki${NC}         Rotate Vault node certs to Vault PKI (post-init)"
    echo "  ${CYAN}verify${NC} [spoke]              Verify certificate configuration"
    echo "  ${CYAN}verify-all${NC}                  Verify certificates for all spokes"
    echo "  ${CYAN}check${NC}                       Check mkcert prerequisites"
    echo ""
    echo "Monitoring:"
    echo "  ${CYAN}status${NC}                       Certificate status report (all instances + CAs)"
    echo "  ${CYAN}metrics-export${NC}               Export Prometheus certificate metrics"
    echo ""
    echo "Emergency (Phase 6):"
    echo "  ${CYAN}emergency-rotate${NC} <hub|spoke|all> [CODE] [--force]"
    echo "                                 Revoke + reissue + restart services"
    echo "  ${CYAN}runbook${NC} <scenario>            Print operational runbook for scenario"
    echo "                                 Scenarios: compromised-spoke-key, compromised-intermediate-ca,"
    echo "                                            compromised-root-ca, vault-cluster-failure"
    echo ""
    echo "Revocation (Vault PKI):"
    echo "  ${CYAN}revoke${NC} <spoke>              Revoke spoke certificate and rebuild CRL"
    echo "  ${CYAN}revoke-hub${NC}                  Revoke hub certificate and rebuild CRL"
    echo "  ${CYAN}crl-status${NC}                  Show CRL status and certificate inventory"
    echo "  ${CYAN}crl-rotate${NC}                  Force CRL rebuild on Intermediate CA"
    echo "  ${CYAN}crl-distribute${NC}              Download and distribute CRL to all instances"
    echo ""
    echo "Examples:"
    echo "  ./dive certs sync-ca                   # Sync local mkcert CA everywhere"
    echo "  ./dive certs prepare-federation alb    # Full setup for ALB spoke"
    echo "  ./dive certs prepare-all               # Full setup for all spokes"
    echo "  ./dive certs update-hub-sans           # Add all spokes to Hub cert"
    echo "  ./dive certs verify alb                # Verify ALB certificates"
    echo "  ./dive certs verify-all                # Verify all spokes"
    echo "  ./dive certs revoke deu                # Revoke DEU spoke certificate"
    echo "  ./dive certs crl-status                # Show revocation list status"
    echo ""
}
