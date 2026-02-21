#!/usr/bin/env bash
#===============================================================================
# DIVE V3 - PKI Infrastructure Initialization
#===============================================================================
# This script initializes the X.509 PKI infrastructure for the hub-spoke model.
#
# Hub Mode (USA):
#   - Generates Root CA (10 years validity)
#   - Generates Intermediate CA signed by Root CA (5 years validity)
#   - Generates Hub Policy Signing Certificate (1 year validity)
#
# Spoke Mode:
#   - Generates Certificate Signing Request (CSR)
#   - (Requires manual step: Submit CSR to Hub for signing)
#   - Imports Hub-signed certificate
#
# Usage:
#   ./scripts/pki/init-pki.sh hub              # Initialize Hub PKI
#   ./scripts/pki/init-pki.sh spoke <code>     # Generate Spoke CSR
#   ./scripts/pki/init-pki.sh import <code>    # Import signed certificate
#
# ACP-240 Section 5.4: Digital Signatures (X.509 PKI)
#===============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Certificate directories
HUB_PKI_DIR="${PROJECT_ROOT}/certs/hub-pki"
SPOKE_PKI_DIR=""  # Set per spoke

# Certificate validity periods
ROOT_CA_DAYS=3650        # 10 years
INTERMEDIATE_CA_DAYS=1825 # 5 years
SIGNING_CERT_DAYS=365     # 1 year

# Key sizes
ROOT_KEY_SIZE=4096
INTERMEDIATE_KEY_SIZE=4096
SIGNING_KEY_SIZE=4096

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_header() { echo -e "\n${PURPLE}═══════════════════════════════════════════════════════════════${NC}"; echo -e "${PURPLE}  $1${NC}"; echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}\n"; }

# Convert ISO 3166-1 alpha-3 to alpha-2 country codes for X.509 certificates
# (X.509 requires 2-letter country codes)
alpha3_to_alpha2() {
    local alpha3="$1"
    case "${alpha3^^}" in
        USA) echo "US" ;;
        GBR) echo "GB" ;;
        FRA) echo "FR" ;;
        DEU) echo "DE" ;;
        ITA) echo "IT" ;;
        ESP) echo "ES" ;;
        CAN) echo "CA" ;;
        NLD) echo "NL" ;;
        BEL) echo "BE" ;;
        PRT) echo "PT" ;;
        DNK) echo "DK" ;;
        NOR) echo "NO" ;;
        POL) echo "PL" ;;
        CZE) echo "CZ" ;;
        HUN) echo "HU" ;;
        GRC) echo "GR" ;;
        TUR) echo "TR" ;;
        BGR) echo "BG" ;;
        EST) echo "EE" ;;
        LVA) echo "LV" ;;
        LTU) echo "LT" ;;
        ROU) echo "RO" ;;
        SVK) echo "SK" ;;
        SVN) echo "SI" ;;
        ALB) echo "AL" ;;
        HRV) echo "HR" ;;
        MNE) echo "ME" ;;
        MKD) echo "MK" ;;
        FIN) echo "FI" ;;
        SWE) echo "SE" ;;
        ISL) echo "IS" ;;
        LUX) echo "LU" ;;
        AUS) echo "AU" ;;
        NZL) echo "NZ" ;;
        *) echo "${alpha3:0:2}" ;;  # Fallback: first 2 characters
    esac
}

#===============================================================================
# HUB PKI INITIALIZATION
#===============================================================================
init_hub_pki() {
    log_header "DIVE V3 Hub PKI Initialization (USA)"

    mkdir -p "${HUB_PKI_DIR}/ca" "${HUB_PKI_DIR}/signing" "${HUB_PKI_DIR}/csr" "${HUB_PKI_DIR}/issued"

    # Check if already initialized
    if [[ -f "${HUB_PKI_DIR}/ca/root.crt" ]]; then
        log_warn "Hub PKI already initialized. Use --force to regenerate."
        log_info "Root CA:          ${HUB_PKI_DIR}/ca/root.crt"
        log_info "Intermediate CA:  ${HUB_PKI_DIR}/ca/intermediate.crt"
        log_info "Hub Signing:      ${HUB_PKI_DIR}/signing/policy-signer.crt"
        return 0
    fi

    #---------------------------------------------------------------------------
    # Step 1: Generate Root CA
    #---------------------------------------------------------------------------
    log_info "Step 1/4: Generating Root CA (${ROOT_KEY_SIZE}-bit RSA, ${ROOT_CA_DAYS} days)..."

    # Generate Root CA private key
    openssl genrsa -out "${HUB_PKI_DIR}/ca/root.key" ${ROOT_KEY_SIZE} 2>/dev/null
    chmod 600 "${HUB_PKI_DIR}/ca/root.key"

    # Create Root CA certificate
    openssl req -new -x509 -days ${ROOT_CA_DAYS} \
        -key "${HUB_PKI_DIR}/ca/root.key" \
        -out "${HUB_PKI_DIR}/ca/root.crt" \
        -subj "/C=US/O=NATO Coalition/OU=DIVE V3 PKI/CN=DIVE V3 Root CA" \
        -addext "basicConstraints=critical,CA:TRUE" \
        -addext "keyUsage=critical,keyCertSign,cRLSign" \
        -addext "subjectKeyIdentifier=hash" \
        2>/dev/null

    log_success "Root CA created: ${HUB_PKI_DIR}/ca/root.crt"

    #---------------------------------------------------------------------------
    # Step 2: Generate Intermediate CA
    #---------------------------------------------------------------------------
    log_info "Step 2/4: Generating Intermediate CA (${INTERMEDIATE_KEY_SIZE}-bit RSA, ${INTERMEDIATE_CA_DAYS} days)..."

    # Generate Intermediate CA private key
    openssl genrsa -out "${HUB_PKI_DIR}/ca/intermediate.key" ${INTERMEDIATE_KEY_SIZE} 2>/dev/null
    chmod 600 "${HUB_PKI_DIR}/ca/intermediate.key"

    # Create CSR for Intermediate CA
    openssl req -new \
        -key "${HUB_PKI_DIR}/ca/intermediate.key" \
        -out "${HUB_PKI_DIR}/ca/intermediate.csr" \
        -subj "/C=US/O=NATO Coalition/OU=DIVE V3 PKI/CN=DIVE V3 Intermediate CA" \
        2>/dev/null

    # Sign Intermediate CA with Root CA
    openssl x509 -req -days ${INTERMEDIATE_CA_DAYS} \
        -in "${HUB_PKI_DIR}/ca/intermediate.csr" \
        -CA "${HUB_PKI_DIR}/ca/root.crt" \
        -CAkey "${HUB_PKI_DIR}/ca/root.key" \
        -CAcreateserial \
        -out "${HUB_PKI_DIR}/ca/intermediate.crt" \
        -extfile <(echo -e "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always,issuer") \
        2>/dev/null

    log_success "Intermediate CA created: ${HUB_PKI_DIR}/ca/intermediate.crt"

    #---------------------------------------------------------------------------
    # Step 3: Generate Hub Policy Signing Certificate
    #---------------------------------------------------------------------------
    log_info "Step 3/4: Generating Hub Policy Signing Certificate (${SIGNING_KEY_SIZE}-bit RSA, ${SIGNING_CERT_DAYS} days)..."

    # Generate signing key
    openssl genrsa -out "${HUB_PKI_DIR}/signing/policy-signer.key" ${SIGNING_KEY_SIZE} 2>/dev/null
    chmod 600 "${HUB_PKI_DIR}/signing/policy-signer.key"

    # Create CSR
    openssl req -new \
        -key "${HUB_PKI_DIR}/signing/policy-signer.key" \
        -out "${HUB_PKI_DIR}/signing/policy-signer.csr" \
        -subj "/C=US/O=NATO Coalition/OU=DIVE V3 Policy Signing/CN=DIVE V3 Policy Signer (USA)" \
        2>/dev/null

    # Sign with Intermediate CA
    openssl x509 -req -days ${SIGNING_CERT_DAYS} \
        -in "${HUB_PKI_DIR}/signing/policy-signer.csr" \
        -CA "${HUB_PKI_DIR}/ca/intermediate.crt" \
        -CAkey "${HUB_PKI_DIR}/ca/intermediate.key" \
        -CAcreateserial \
        -out "${HUB_PKI_DIR}/signing/policy-signer.crt" \
        -extfile <(echo -e "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=codeSigning\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always,issuer") \
        2>/dev/null

    log_success "Policy Signing Certificate created: ${HUB_PKI_DIR}/signing/policy-signer.crt"

    #---------------------------------------------------------------------------
    # Step 4: Create Certificate Chain Bundle
    #---------------------------------------------------------------------------
    log_info "Step 4/4: Creating certificate chain bundle..."

    cat "${HUB_PKI_DIR}/ca/intermediate.crt" "${HUB_PKI_DIR}/ca/root.crt" > "${HUB_PKI_DIR}/ca/chain.pem"
    cat "${HUB_PKI_DIR}/signing/policy-signer.crt" "${HUB_PKI_DIR}/ca/chain.pem" > "${HUB_PKI_DIR}/signing/policy-signer-bundle.pem"

    log_success "Certificate chain created: ${HUB_PKI_DIR}/ca/chain.pem"

    #---------------------------------------------------------------------------
    # Summary
    #---------------------------------------------------------------------------
    echo ""
    log_header "Hub PKI Initialization Complete"
    echo "  Root CA:              ${HUB_PKI_DIR}/ca/root.crt"
    echo "  Root CA Key:          ${HUB_PKI_DIR}/ca/root.key"
    echo "  Intermediate CA:      ${HUB_PKI_DIR}/ca/intermediate.crt"
    echo "  Intermediate Key:     ${HUB_PKI_DIR}/ca/intermediate.key"
    echo "  Policy Signer:        ${HUB_PKI_DIR}/signing/policy-signer.crt"
    echo "  Policy Signer Key:    ${HUB_PKI_DIR}/signing/policy-signer.key"
    echo "  Chain Bundle:         ${HUB_PKI_DIR}/ca/chain.pem"
    echo ""
    echo -e "${CYAN}Next Steps:${NC}"
    echo "  1. Deploy Hub with: ./dive hub up"
    echo "  2. Generate Spoke CSRs: ./dive --instance <code> spoke pki-request"
    echo "  3. Sign Spoke CSRs: ./dive hub pki-sign --spoke <code>"
}

#===============================================================================
# SPOKE CSR GENERATION
#===============================================================================
generate_spoke_csr() {
    local spoke_code="${1:-}"

    if [[ -z "$spoke_code" ]]; then
        log_error "Spoke code is required. Usage: $0 spoke <code>"
        exit 1
    fi

    spoke_code=$(echo "$spoke_code" | tr '[:lower:]' '[:upper:]')
    SPOKE_PKI_DIR="${PROJECT_ROOT}/instances/${spoke_code,,}/pki"

    log_header "DIVE V3 Spoke CSR Generation (${spoke_code})"

    mkdir -p "${SPOKE_PKI_DIR}/signing"

    # Check if CSR already exists
    if [[ -f "${SPOKE_PKI_DIR}/signing/policy-signer.csr" ]]; then
        log_warn "CSR already exists for ${spoke_code}."
        log_info "CSR: ${SPOKE_PKI_DIR}/signing/policy-signer.csr"
        return 0
    fi

    #---------------------------------------------------------------------------
    # Generate Signing Key and CSR
    #---------------------------------------------------------------------------
    log_info "Generating Policy Signing Key (${SIGNING_KEY_SIZE}-bit RSA)..."

    openssl genrsa -out "${SPOKE_PKI_DIR}/signing/policy-signer.key" ${SIGNING_KEY_SIZE} 2>/dev/null
    chmod 600 "${SPOKE_PKI_DIR}/signing/policy-signer.key"

    log_info "Creating Certificate Signing Request..."

    # Convert alpha-3 to alpha-2 for X.509 country code
    local country_alpha2
    country_alpha2=$(alpha3_to_alpha2 "$spoke_code")

    openssl req -new \
        -key "${SPOKE_PKI_DIR}/signing/policy-signer.key" \
        -out "${SPOKE_PKI_DIR}/signing/policy-signer.csr" \
        -subj "/C=${country_alpha2}/O=NATO Coalition/OU=DIVE V3 Policy Signing/CN=DIVE V3 Policy Signer (${spoke_code})" \
        2>/dev/null

    log_success "CSR created: ${SPOKE_PKI_DIR}/signing/policy-signer.csr"

    #---------------------------------------------------------------------------
    # Copy CSR to Hub's incoming directory
    #---------------------------------------------------------------------------
    if [[ -d "${HUB_PKI_DIR}/csr" ]]; then
        cp "${SPOKE_PKI_DIR}/signing/policy-signer.csr" "${HUB_PKI_DIR}/csr/${spoke_code,,}-policy-signer.csr"
        log_success "CSR copied to Hub: ${HUB_PKI_DIR}/csr/${spoke_code,,}-policy-signer.csr"
    else
        log_warn "Hub PKI not found. Please manually submit CSR to Hub."
    fi

    echo ""
    log_header "Spoke CSR Generation Complete (${spoke_code})"
    echo "  CSR:       ${SPOKE_PKI_DIR}/signing/policy-signer.csr"
    echo "  Key:       ${SPOKE_PKI_DIR}/signing/policy-signer.key"
    echo ""
    echo -e "${CYAN}Next Steps:${NC}"
    echo "  1. Submit CSR to Hub: ./dive hub pki-sign --spoke ${spoke_code,,}"
    echo "  2. Import signed certificate: ./dive --instance ${spoke_code,,} spoke pki-import"
}

#===============================================================================
# HUB SIGNS SPOKE CSR
#===============================================================================
sign_spoke_csr() {
    local spoke_code="${1:-}"

    if [[ -z "$spoke_code" ]]; then
        log_error "Spoke code is required. Usage: $0 sign <code>"
        exit 1
    fi

    spoke_code=$(echo "$spoke_code" | tr '[:lower:]' '[:upper:]')
    local csr_path="${HUB_PKI_DIR}/csr/${spoke_code,,}-policy-signer.csr"
    local cert_path="${HUB_PKI_DIR}/issued/${spoke_code,,}-policy-signer.crt"

    log_header "DIVE V3 Hub Signing Spoke Certificate (${spoke_code})"

    # Check prerequisites
    if [[ ! -f "${HUB_PKI_DIR}/ca/intermediate.crt" ]]; then
        log_error "Hub PKI not initialized. Run: $0 hub"
        exit 1
    fi

    if [[ ! -f "$csr_path" ]]; then
        log_error "CSR not found: $csr_path"
        log_info "Generate CSR first: ./dive --instance ${spoke_code,,} spoke pki-request"
        exit 1
    fi

    #---------------------------------------------------------------------------
    # Sign CSR with Intermediate CA
    #---------------------------------------------------------------------------
    log_info "Signing ${spoke_code} CSR with Intermediate CA..."

    openssl x509 -req -days ${SIGNING_CERT_DAYS} \
        -in "$csr_path" \
        -CA "${HUB_PKI_DIR}/ca/intermediate.crt" \
        -CAkey "${HUB_PKI_DIR}/ca/intermediate.key" \
        -CAcreateserial \
        -out "$cert_path" \
        -extfile <(echo -e "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=codeSigning\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always,issuer") \
        2>/dev/null

    log_success "Certificate signed: $cert_path"

    #---------------------------------------------------------------------------
    # Copy signed certificate to spoke's directory
    #---------------------------------------------------------------------------
    SPOKE_PKI_DIR="${PROJECT_ROOT}/instances/${spoke_code,,}/pki"
    if [[ -d "${SPOKE_PKI_DIR}" ]]; then
        mkdir -p "${SPOKE_PKI_DIR}/signing"
        cp "$cert_path" "${SPOKE_PKI_DIR}/signing/policy-signer.crt"
        cp "${HUB_PKI_DIR}/ca/chain.pem" "${SPOKE_PKI_DIR}/signing/chain.pem"
        cp "${HUB_PKI_DIR}/ca/root.crt" "${SPOKE_PKI_DIR}/signing/root.crt"
        cp "${HUB_PKI_DIR}/ca/intermediate.crt" "${SPOKE_PKI_DIR}/signing/intermediate.crt"
        log_success "Certificate and chain copied to spoke: ${SPOKE_PKI_DIR}/signing/"
    fi

    echo ""
    log_header "Spoke Certificate Signed (${spoke_code})"
    echo "  Signed Certificate: $cert_path"
    echo ""
    echo -e "${CYAN}Next Steps:${NC}"
    echo "  Import on spoke: ./dive --instance ${spoke_code,,} spoke pki-import"
}

#===============================================================================
# SPOKE IMPORTS SIGNED CERTIFICATE
#===============================================================================
import_spoke_certificate() {
    local spoke_code="${1:-}"

    if [[ -z "$spoke_code" ]]; then
        log_error "Spoke code is required. Usage: $0 import <code>"
        exit 1
    fi

    spoke_code=$(echo "$spoke_code" | tr '[:lower:]' '[:upper:]')
    SPOKE_PKI_DIR="${PROJECT_ROOT}/instances/${spoke_code,,}/pki"
    local target_certs_dir="${PROJECT_ROOT}/instances/${spoke_code,,}/certs/pki"

    log_header "DIVE V3 Spoke Certificate Import (${spoke_code})"

    # Check prerequisites
    if [[ ! -f "${SPOKE_PKI_DIR}/signing/policy-signer.crt" ]]; then
        log_error "Signed certificate not found: ${SPOKE_PKI_DIR}/signing/policy-signer.crt"
        log_info "Get certificate signed first: ./dive hub pki-sign --spoke ${spoke_code,,}"
        exit 1
    fi

    #---------------------------------------------------------------------------
    # Setup PKI directory structure for backend
    #---------------------------------------------------------------------------
    log_info "Setting up PKI directory structure..."

    mkdir -p "${target_certs_dir}/ca" "${target_certs_dir}/signing"

    # Copy certificates to backend-accessible location
    cp "${SPOKE_PKI_DIR}/signing/root.crt" "${target_certs_dir}/ca/root.crt"
    cp "${SPOKE_PKI_DIR}/signing/intermediate.crt" "${target_certs_dir}/ca/intermediate.crt"
    cp "${SPOKE_PKI_DIR}/signing/chain.pem" "${target_certs_dir}/ca/chain.pem"
    cp "${SPOKE_PKI_DIR}/signing/policy-signer.crt" "${target_certs_dir}/signing/policy-signer.crt"
    cp "${SPOKE_PKI_DIR}/signing/policy-signer.key" "${target_certs_dir}/signing/policy-signer.key"

    # Create bundle
    cat "${target_certs_dir}/signing/policy-signer.crt" "${target_certs_dir}/ca/chain.pem" > "${target_certs_dir}/signing/policy-signer-bundle.pem"

    log_success "PKI imported to: ${target_certs_dir}"

    #---------------------------------------------------------------------------
    # Verify certificate chain
    #---------------------------------------------------------------------------
    log_info "Verifying certificate chain..."

    if openssl verify -CAfile "${target_certs_dir}/ca/chain.pem" "${target_certs_dir}/signing/policy-signer.crt" 2>/dev/null | grep -q "OK"; then
        log_success "Certificate chain verified successfully!"
    else
        log_error "Certificate chain verification failed!"
        exit 1
    fi

    echo ""
    log_header "Spoke PKI Import Complete (${spoke_code})"
    echo "  Root CA:            ${target_certs_dir}/ca/root.crt"
    echo "  Intermediate CA:    ${target_certs_dir}/ca/intermediate.crt"
    echo "  Policy Signer:      ${target_certs_dir}/signing/policy-signer.crt"
    echo "  Chain Bundle:       ${target_certs_dir}/ca/chain.pem"
    echo ""
    echo -e "${CYAN}Next Steps:${NC}"
    echo "  Restart spoke to apply PKI: ./dive --instance ${spoke_code,,} spoke restart"
}

#===============================================================================
# MAIN
#===============================================================================
main() {
    local command="${1:-}"
    local arg="${2:-}"

    case "$command" in
        hub)
            init_hub_pki
            ;;
        spoke)
            generate_spoke_csr "$arg"
            ;;
        sign)
            sign_spoke_csr "$arg"
            ;;
        import)
            import_spoke_certificate "$arg"
            ;;
        *)
            echo "DIVE V3 PKI Infrastructure Management"
            echo ""
            echo "Usage:"
            echo "  $0 hub                 Initialize Hub PKI (Root CA + Intermediate CA)"
            echo "  $0 spoke <code>        Generate Spoke CSR"
            echo "  $0 sign <code>         Sign Spoke CSR (run on Hub)"
            echo "  $0 import <code>       Import signed certificate (run on Spoke)"
            echo ""
            echo "Phased Implementation:"
            echo "  Phase 1: Initialize Hub:      $0 hub"
            echo "  Phase 2: Generate Spoke CSR:  $0 spoke ita"
            echo "  Phase 3: Hub signs CSR:       $0 sign ita"
            echo "  Phase 4: Spoke imports cert:  $0 import ita"
            exit 1
            ;;
    esac
}

main "$@"
