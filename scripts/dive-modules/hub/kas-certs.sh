#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - KAS Certificate & Test Functions
# =============================================================================
# Extracted from hub/kas-extended.sh (Phase 13e)
# =============================================================================

[ -n "${DIVE_KAS_CERTS_LOADED:-}" ] && return 0

# =============================================================================
# CERTIFICATE MANAGEMENT
# =============================================================================

# Rotate KAS certificates
kas_certs_rotate() {
    local instance="${1:-usa}"

    echo -e "${BOLD}Rotate KAS Certificates - ${instance^^}${NC}"
    echo ""

    local kas_cert_dir="${DIVE_ROOT}/kas/certs"
    local backup_dir
    backup_dir="${kas_cert_dir}/backup-$(date +%Y%m%d-%H%M%S)"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would backup current certificates to $backup_dir"
        log_dry "Would generate new self-signed certificates"
        log_dry "Would restart KAS container"
        return 0
    fi

    # Backup existing certificates
    if [ -f "$kas_cert_dir/certificate.pem" ]; then
        log_info "Backing up current certificates to $backup_dir"
        mkdir -p "$backup_dir"
        cp "$kas_cert_dir/certificate.pem" "$backup_dir/"
        cp "$kas_cert_dir/key.pem" "$backup_dir/" 2>/dev/null || true
        log_success "Certificates backed up"
    fi

    # Generate new certificates
    log_info "Generating new self-signed certificates..."
    mkdir -p "$kas_cert_dir"

    openssl req -x509 -newkey rsa:4096 \
        -keyout "$kas_cert_dir/key.pem" \
        -out "$kas_cert_dir/certificate.pem" \
        -days 365 -nodes \
        -subj "/CN=kas.${DIVE_DEFAULT_DOMAIN:-dive25.com}/O=DIVE V3/C=US/ST=Virginia/L=Arlington" \
        -addext "subjectAltName=DNS:kas.${DIVE_DEFAULT_DOMAIN:-dive25.com},DNS:localhost,DNS:kas,IP:127.0.0.1" \
        2>/dev/null

    if [ $? -eq 0 ]; then
        log_success "New certificates generated"

        # Show certificate info
        echo ""
        echo -e "${BOLD}New Certificate Info:${NC}"
        openssl x509 -noout -subject -enddate -in "$kas_cert_dir/certificate.pem" | sed 's/^/  /'

        # Restart KAS if running
        local container
        container="$(get_kas_container "$instance")"
        if docker ps --format "{{.Names}}" | grep -q "^${container}$"; then
            echo ""
            log_info "Restarting KAS to use new certificates..."
            kas_restart "$instance"
        else
            echo ""
            log_info "Start KAS to use new certificates: ./dive hub deploy"
        fi
    else
        log_error "Failed to generate certificates"
        return 1
    fi
}

# Show KAS certificate status
kas_certs_status() {
    local instance="${1:-usa}"

    echo -e "${BOLD}KAS Certificate Status - ${instance^^}${NC}"
    echo ""

    local kas_cert_dir="${DIVE_ROOT}/kas/certs"

    if [ ! -f "$kas_cert_dir/certificate.pem" ]; then
        log_error "KAS certificate not found at $kas_cert_dir/certificate.pem"
        echo ""
        echo "Generate certificates with: ./dive kas certs rotate"
        return 1
    fi

    echo -e "${BOLD}Certificate Details:${NC}"
    openssl x509 -noout -text -in "$kas_cert_dir/certificate.pem" 2>/dev/null | \
        grep -E "Subject:|Issuer:|Not Before|Not After|DNS:|IP Address:" | \
        sed 's/^[[:space:]]*/  /'

    echo ""
    echo -e "${BOLD}Validity:${NC}"
    local expiry
    expiry=$(openssl x509 -enddate -noout -in "$kas_cert_dir/certificate.pem" 2>/dev/null | cut -d= -f2)
    echo "  Expires: $expiry"

    # Calculate days remaining
    local expiry_epoch now_epoch days_remaining
    expiry_epoch=$(date -j -f "%b %d %T %Y %Z" "$expiry" "+%s" 2>/dev/null || date -d "$expiry" "+%s" 2>/dev/null || echo "0")
    now_epoch=$(date "+%s")
    days_remaining=$(( (expiry_epoch - now_epoch) / 86400 ))

    if [ "$days_remaining" -lt 0 ]; then
        log_error "Certificate has EXPIRED!"
    elif [ "$days_remaining" -lt 30 ]; then
        log_warn "Certificate expires in $days_remaining days - consider rotating"
    else
        log_success "Certificate valid for $days_remaining more days"
    fi

    echo ""
    echo -e "${BOLD}Private Key:${NC}"
    if [ -f "$kas_cert_dir/key.pem" ]; then
        echo -n "  Status: "
        log_success_inline "EXISTS"
        echo ""
        echo "  Type: $(openssl rsa -in "$kas_cert_dir/key.pem" -text -noout 2>/dev/null | head -1 | sed 's/^//')"
    else
        echo -n "  Status: "
        log_error_inline "MISSING"
        echo ""
    fi

    echo ""
    echo -e "${BOLD}Backup Certificates:${NC}"
    local backups
    backups=$(ls -d "$kas_cert_dir"/backup-* 2>/dev/null | wc -l | tr -d ' ')
    echo "  Available backups: $backups"
    if [ "$backups" -gt 0 ]; then
        ls -dt "$kas_cert_dir"/backup-* 2>/dev/null | head -3 | while read -r dir; do
            echo "    - $(basename "$dir")"
        done
    fi
}

# Certificate command dispatcher
kas_certs() {
    local subcommand="${1:-status}"
    shift || true

    case "$subcommand" in
        status)
            kas_certs_status "$@"
            ;;
        rotate)
            kas_certs_rotate "$@"
            ;;
        *)
            echo -e "${BOLD}KAS Certificate Commands:${NC}"
            echo ""
            echo "Usage: ./dive kas certs <command>"
            echo ""
            echo "Commands:"
            echo "  status    Show certificate status and expiry"
            echo "  rotate    Generate new certificates (with backup)"
            ;;
    esac
}

# =============================================================================
# TEST COMMANDS
# =============================================================================

# Run KAS test suite
kas_test() {
    echo -e "${BOLD}KAS Test Suite${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would run KAS test suite"
        return 0
    fi

    local kas_dir="${DIVE_ROOT}/kas"

    if [ ! -d "$kas_dir" ]; then
        log_error "KAS directory not found: $kas_dir"
        return 1
    fi

    log_info "Running KAS tests..."
    echo ""

    cd "$kas_dir" || return 1

    if [ -f "package.json" ]; then
        # Check if node_modules exists
        if [ ! -d "node_modules" ]; then
            log_info "Installing dependencies..."
            npm install --silent 2>/dev/null
        fi

        # Run tests
        npm test 2>&1

        local exit_code=$?
        echo ""

        if [ $exit_code -eq 0 ]; then
            log_success "All KAS tests passed"
        else
            log_error "Some KAS tests failed"
        fi

        return $exit_code
    else
        log_error "No package.json found in KAS directory"
        return 1
    fi
}

export DIVE_KAS_CERTS_LOADED=1
