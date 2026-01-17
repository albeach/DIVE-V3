#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Hub Spoke Management Module
# =============================================================================
# Extracted from hub.sh during refactoring for modularity
# Commands: hub spokes list|pending|approve|reject|suspend|revoke|token|rotate-token
# =============================================================================
# Version: 1.0.0
# Date: 2025-12-23
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Mark this module as loaded
export DIVE_HUB_SPOKES_LOADED=1

# =============================================================================
# CONSTANTS (inherit from hub.sh if not set)
# =============================================================================

HUB_BACKEND_URL="${HUB_BACKEND_URL:-https://localhost:${BACKEND_PORT:-4000}}"
FEDERATION_ADMIN_KEY="${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}"

# =============================================================================
# SPOKE MANAGEMENT
# =============================================================================

hub_spokes_main() {
    local action="${1:-list}"
    shift || true

    case "$action" in
        list)         hub_spokes_list "$@" ;;
        pending)      hub_spokes_pending "$@" ;;
        approve)      hub_spokes_approve "$@" ;;
        reject)       hub_spokes_reject "$@" ;;
        suspend)      hub_spokes_suspend "$@" ;;
        unsuspend)    hub_spokes_unsuspend "$@" ;;  # ADDED (Dec 2025)
        revoke)       hub_spokes_revoke "$@" ;;
        token)        hub_spokes_token "$@" ;;
        rotate-token) hub_spokes_rotate_token "$@" ;;
        *)            hub_spokes_help ;;
    esac
}

hub_spokes_list() {
    echo -e "${BOLD}Registered Spokes${NC}"
    echo ""

    # Check if hub MongoDB is running
    if ! docker ps --filter "name=dive-hub-mongodb" --format "{{.Names}}" | grep -q "dive-hub-mongodb"; then
        echo "  ${RED}❌ Hub MongoDB not running - cannot query federation registry${NC}"
        echo ""
        echo "  Check that the hub is running:"
        echo "    ./dive hub status"
        return 1
    fi

    # Get MongoDB credentials from hub .env
    local mongo_password
    mongo_password=$(grep "^MONGO_PASSWORD=" "${DIVE_ROOT}/instances/hub/.env" | cut -d'=' -f2 | tr -d '"')

    if [ -z "$mongo_password" ]; then
        echo "  ${RED}❌ Cannot find MongoDB password in hub .env file${NC}"
        return 1
    fi

    # Query federation_spokes collection directly from MongoDB SSOT
    local spokes_data
    spokes_data=$(docker exec dive-hub-mongodb mongosh --username admin --password "$mongo_password" --authenticationDatabase admin dive-v3-hub --eval "
        db.federation_spokes.find({}, {
            spokeId: 1,
            instanceCode: 1,
            name: 1,
            status: 1,
            trustLevel: 1,
            baseUrl: 1,
            createdAt: 1,
            _id: 0
        }).toArray()
    " 2>/dev/null | sed '1d;$d' | tr -d '\r')  # Remove MongoDB shell output lines

    if [ -z "$spokes_data" ] || [ "$spokes_data" = "[]" ]; then
        echo "  ${YELLOW}⚠️  No spokes registered in MongoDB SSOT${NC}"
        echo ""
        echo "  ${CYAN}Note:${NC} Spoke deployment updates federation-registry.json but"
        echo "  ${CYAN}      MongoDB federation_spokes collection is not populated${NC}"
        echo "  ${CYAN}      This indicates a gap between intended SSOT and implementation${NC}"
        echo ""
        echo "  ${CYAN}MongoDB SSOT:${NC} federation_spokes collection"
        return 0
    fi

    # Parse and display spokes data
    echo "$spokes_data" | jq -r '
        .[] |
        "  \(.instanceCode // "N/A")\t\(.status // "unknown")\t\(.trustLevel // "N/A")\t\(.name // "Unknown")"
    ' 2>/dev/null | column -t -s $'\t'

    # Show statistics
    echo ""
    local total_spokes active_spokes pending_spokes suspended_spokes
    total_spokes=$(echo "$spokes_data" | jq '. | length' 2>/dev/null || echo "0")
    active_spokes=$(echo "$spokes_data" | jq '[.[] | select(.status == "approved")] | length' 2>/dev/null || echo "0")
    pending_spokes=$(echo "$spokes_data" | jq '[.[] | select(.status == "pending")] | length' 2>/dev/null || echo "0")
    suspended_spokes=$(echo "$spokes_data" | jq '[.[] | select(.status == "suspended")] | length' 2>/dev/null || echo "0")

    echo "Total: $total_spokes | Active: $active_spokes | Pending: $pending_spokes | Suspended: $suspended_spokes"
    echo ""
    echo "  ${CYAN}MongoDB SSOT:${NC} federation_spokes collection"
}

hub_spokes_pending() {
    echo -e "${BOLD}Pending Spoke Registrations${NC}"
    echo ""

    # Check if hub MongoDB is running
    if ! docker ps --filter "name=dive-hub-mongodb" --format "{{.Names}}" | grep -q "dive-hub-mongodb"; then
        log_error "Hub MongoDB not running - cannot query federation registry"
        return 1
    fi

    # Get MongoDB credentials from hub .env
    local mongo_password
    mongo_password=$(grep "^MONGO_PASSWORD=" "${DIVE_ROOT}/instances/hub/.env" | cut -d'=' -f2 | tr -d '"')

    if [ -z "$mongo_password" ]; then
        log_error "Cannot find MongoDB password in hub .env file"
        return 1
    fi

    # Query pending spokes from MongoDB SSOT
    local pending_data
    pending_data=$(docker exec dive-hub-mongodb mongosh --username admin --password "$mongo_password" --authenticationDatabase admin dive-v3-hub --eval "
        db.federation_spokes.find({status: 'pending'}, {
            spokeId: 1,
            instanceCode: 1,
            name: 1,
            contactEmail: 1,
            baseUrl: 1,
            idpUrl: 1,
            registeredAt: 1,
            requestedScopes: 1,
            certificatePEM: 1,
            csrPEM: 1,
            _id: 0
        }).toArray()
    " 2>/dev/null | sed '1d;$d' | tr -d '\r')  # Remove MongoDB shell output lines

    if [ -z "$pending_data" ] || [ "$pending_data" = "[]" ]; then
        echo -e "  ${GREEN}✓${NC} No pending approvals"
        echo ""
        echo "  ${CYAN}Note:${NC} MongoDB federation_spokes collection is currently empty"
        echo "  ${CYAN}      Spoke deployment updates federation-registry.json but${NC}"
        echo "  ${CYAN}      does not populate the MongoDB SSOT collection${NC}"
        echo ""
        echo "  ${CYAN}MongoDB SSOT:${NC} federation_spokes collection"
        return 0
    fi

    local count=$(echo "$pending_data" | jq '. | length' 2>/dev/null || echo "0")
    echo -e "  ${YELLOW}$count pending approval(s)${NC}"
    echo ""

    # Rich display for each pending spoke
    echo "$pending_data" | jq -r '
        .[] |
        "┌─────────────────────────────────────────────────────────────┐",
        "│ Spoke: \(.spokeId | .[0:50])",
        "├─────────────────────────────────────────────────────────────┤",
        "│  Instance Code:  \(.instanceCode)",
        "│  Name:           \(.name)",
        "│  Contact:        \(.contactEmail // "Not provided")",
        "│  Base URL:       \(.baseUrl)",
        "│  IdP URL:        \(.idpUrl // "Not provided")",
        "│  Registered:     \(.registeredAt)",
        "│  Requested Scopes:",
        (.requestedScopes // [] | map("│    • \(.)") | join("\n")),
        (if .certificatePEM then "│  Certificate:    ✓ Submitted" else "│  Certificate:    ○ Not submitted" end),
        (if .csrPEM then "│  CSR:            ✓ Submitted" else "│  CSR:            ○ Not submitted" end),
        "└─────────────────────────────────────────────────────────────┘",
        ""
    ' 2>/dev/null

    echo ""
    echo -e "${CYAN}Actions:${NC}"
    echo "  Approve:  ./dive hub spokes approve <spoke-id>"
    echo "  Reject:   ./dive hub spokes reject <spoke-id>"
    echo ""
    echo -e "${CYAN}Example:${NC}"
    local first_spoke=$(echo "$pending_data" | jq -r '.[0].spokeId // empty' 2>/dev/null)
    if [ -n "$first_spoke" ]; then
        echo "  ./dive hub spokes approve $first_spoke"
    fi
}

hub_spokes_approve() {
    local spoke_id="$1"
    shift || true

    # Parse options
    local scopes=""
    local trust_level=""
    local max_class=""
    local interactive=true

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --scopes)
                scopes="$2"
                interactive=false
                shift 2
                ;;
            --trust|--trust-level)
                trust_level="$2"
                interactive=false
                shift 2
                ;;
            --classification|--max-classification)
                max_class="$2"
                interactive=false
                shift 2
                ;;
            --yes|-y)
                interactive=false
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    if [ -z "$spoke_id" ]; then
        echo -e "${BOLD}Approve Spoke Registration${NC}"
        echo ""
        echo "Usage: ./dive hub spokes approve <spoke-id> [options]"
        echo ""
        echo "Options:"
        echo "  --scopes <scopes>         Comma-separated scopes"
        echo "  --trust-level <level>     Trust level: development|partner|bilateral|national"
        echo "  --max-classification <c>  Max classification: UNCLASSIFIED|CONFIDENTIAL|SECRET|TOP_SECRET"
        echo "  --yes, -y                 Skip interactive prompts"
        echo ""
        echo "Examples:"
        echo "  ./dive hub spokes approve spoke-nzl-abc123"
        echo "  ./dive hub spokes approve spoke-nzl-abc123 --scopes 'policy:base,data:federation_matrix' --trust-level partner"
        return 1
    fi

    # Fetch spoke details for display
    log_step "Fetching spoke details: ${spoke_id}"

    local spoke_details=$(curl -kfs --max-time 10 \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}" 2>/dev/null)

    if [ -z "$spoke_details" ] || echo "$spoke_details" | grep -q '"error"'; then
        # Try by instance code
        spoke_details=$(curl -kfs --max-time 10 \
            -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
            "${HUB_BACKEND_URL}/api/federation/spokes" 2>/dev/null | \
            jq ".spokes[] | select(.instanceCode == \"$(echo $spoke_id | tr '[:lower:]' '[:upper:]')\")" 2>/dev/null)

        if [ -z "$spoke_details" ]; then
            log_error "Spoke not found: ${spoke_id}"
            return 1
        fi

        # Extract the actual spokeId field for API calls
        spoke_id=$(echo "$spoke_details" | jq -r '.spokeId // .spokeId // ._id // .id // "'$spoke_id'"' 2>/dev/null)
    fi

    # Extract spoke info
    local spoke_name=$(echo "$spoke_details" | jq -r '.spoke.name // .name // "Unknown"' 2>/dev/null)
    local instance_code=$(echo "$spoke_details" | jq -r '.spoke.instanceCode // .instanceCode // "?"' 2>/dev/null)
    local requested_scopes=$(echo "$spoke_details" | jq -r '.spoke.requestedScopes // .requestedScopes // [] | join(", ")' 2>/dev/null)
    local contact=$(echo "$spoke_details" | jq -r '.spoke.contactEmail // .contactEmail // "Not provided"' 2>/dev/null)
    local has_cert=$(echo "$spoke_details" | jq -r 'if (.spoke.certificatePEM // .certificatePEM) then "✓" else "○" end' 2>/dev/null)

    echo ""
    echo -e "${BOLD}Spoke Details:${NC}"
    echo "  Instance Code:     $instance_code"
    echo "  Name:              $spoke_name"
    echo "  Contact:           $contact"
    echo "  Certificate:       $has_cert"
    echo "  Requested Scopes:  $requested_scopes"
    echo ""

    # Interactive mode: prompt for options
    if [ "$interactive" = true ]; then
        echo -e "${CYAN}Configure Approval:${NC}"
        echo ""

        # Scope selection
        if [ -z "$scopes" ]; then
            echo "  Available scopes:"
            echo "    1. policy:base          - Base policy access"
            echo "    2. policy:coalition     - Coalition policy access"
            echo "    3. policy:<instance>    - Instance-specific policy"
            echo "    4. data:federation_matrix - Federation trust matrix"
            echo "    5. data:trusted_issuers - Trusted IdP issuers"
            echo "    6. heartbeat:write      - Send heartbeats"
            echo ""
            echo "  Enter scopes (comma-separated, or press Enter for default):"
            echo "  Default: policy:base,heartbeat:write"
            read -p "  Scopes: " scopes
            if [ -z "$scopes" ]; then
                scopes="policy:base,heartbeat:write"
            fi
        fi

        # Trust level selection
        if [ -z "$trust_level" ]; then
            echo ""
            echo "  Trust levels:"
            echo "    1. development  - Development/testing (limited access)"
            echo "    2. partner      - Partner nation (standard access)"
            echo "    3. bilateral    - Bilateral agreement (elevated access)"
            echo "    4. national     - National/core instance (full access)"
            echo ""
            read -p "  Trust level [partner]: " trust_level
            if [ -z "$trust_level" ]; then
                trust_level="partner"
            fi
        fi

        # TRUST LEVEL VALIDATION
        case "$trust_level" in
            development|partner|bilateral|national)
                # Valid trust level
                ;;
            *)
                log_error "Invalid trust level: $trust_level"
                echo ""
                echo "Valid trust levels:"
                echo "  - development  (most restrictive)"
                echo "  - partner      (standard)"
                echo "  - bilateral    (elevated)"
                echo "  - national     (full access)"
                echo ""
                return 1
                ;;
        esac

        # Classification selection
        if [ -z "$max_class" ]; then
            echo ""
            echo "  Max classification:"
            echo "    1. UNCLASSIFIED"
            echo "    2. CONFIDENTIAL"
            echo "    3. SECRET"
            echo "    4. TOP_SECRET"
            echo ""
            read -p "  Max classification [CONFIDENTIAL]: " max_class
            if [ -z "$max_class" ]; then
                max_class="CONFIDENTIAL"
            fi
        fi

        echo ""
        echo -e "${BOLD}Approval Summary:${NC}"
        echo "  Spoke:              $spoke_name ($instance_code)"
        echo "  Scopes:             $scopes"
        echo "  Trust Level:        $trust_level"
        echo "  Max Classification: $max_class"
        echo ""
        read -p "  Proceed with approval? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "  Cancelled"
            return 0
        fi
    else
        # Use defaults if not specified
        scopes="${scopes:-policy:base,heartbeat:write}"
        trust_level="${trust_level:-partner}"
        max_class="${max_class:-CONFIDENTIAL}"
    fi

    log_step "Approving spoke: ${spoke_id}"

    local payload=$(cat << EOF
{
    "allowedScopes": $(echo "$scopes" | jq -R 'split(",")'),
    "trustLevel": "${trust_level}",
    "maxClassification": "${max_class}",
    "dataIsolationLevel": "filtered"
}
EOF
)

    if [ "$DRY_RUN" = true ]; then
        log_dry "POST ${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/approve"
        log_dry "Payload: ${payload}"
        return 0
    fi

    local response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d "$payload" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/approve" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "Failed to approve spoke (no response from hub)"
        return 1
    fi

    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)

    if [ "$success" = "true" ]; then
        log_success "Spoke approved successfully!"
        echo ""

        local token=$(echo "$response" | jq -r '.token.token' 2>/dev/null)
        local expires=$(echo "$response" | jq -r '.token.expiresAt' 2>/dev/null)
        local token_scopes=$(echo "$response" | jq -r '.token.scopes | join(", ")' 2>/dev/null)

        # Check for OPAL client token (new in Phase 2)
        local opal_token=$(echo "$response" | jq -r '.opalToken.token // empty' 2>/dev/null)
        local opal_expires=$(echo "$response" | jq -r '.opalToken.expiresAt // empty' 2>/dev/null)

        echo -e "${BOLD}Hub API Token for Spoke:${NC}"
        echo ""
        echo "┌─────────────────────────────────────────────────────────────┐"
        echo "│ SPOKE_TOKEN (for Hub API access):                           │"
        echo "├─────────────────────────────────────────────────────────────┤"
        echo "│"
        echo "$token"
        echo "│"
        echo "└─────────────────────────────────────────────────────────────┘"
        echo ""
        echo "  Expires:  $expires"
        echo "  Scopes:   $token_scopes"

        if [ -n "$opal_token" ]; then
            echo ""
            echo -e "${BOLD}OPAL Client JWT (for policy sync):${NC}"
            echo ""
            echo "┌─────────────────────────────────────────────────────────────┐"
            echo "│ OPAL_CLIENT_JWT (for OPAL server connection):               │"
            echo "├─────────────────────────────────────────────────────────────┤"
            echo "│"
            echo "${opal_token:0:80}..."
            echo "│"
            echo "└─────────────────────────────────────────────────────────────┘"
            echo ""
            echo "  Expires:  $opal_expires"
            echo ""
            echo -e "${GREEN}✓ Both tokens generated automatically!${NC}"
        else
            echo ""
            echo -e "${YELLOW}⚠ OPAL token not generated (may require manual setup)${NC}"
        fi

        echo ""
        echo -e "${CYAN}Instructions for Spoke Admin:${NC}"
        echo "  1. Add tokens to spoke .env:"
        echo "     SPOKE_TOKEN=$token"
        if [ -n "$opal_token" ]; then
            echo "     OPAL_CLIENT_JWT=${opal_token:0:50}..."
        fi
        echo "  2. Restart spoke services: ./dive --instance <code> spoke up"
        echo "  3. Verify connection: ./dive spoke verify <CODE>"
        echo ""
        echo "  Or auto-configure by running on the spoke:"
        echo "  ./dive spoke register <CODE> --poll"
    else
        log_error "Approval failed: $(echo "$response" | jq -r '.error // .message' 2>/dev/null)"
        return 1
    fi
}

hub_spokes_reject() {
    local spoke_id="$1"
    shift || true

    local reason=""
    local interactive=true

    # Parse options
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --reason)
                reason="$2"
                interactive=false
                shift 2
                ;;
            --yes|-y)
                interactive=false
                shift
                ;;
            *)
                if [ -z "$reason" ]; then
                    reason="$1"
                    interactive=false
                fi
                shift
                ;;
        esac
    done

    if [ -z "$spoke_id" ]; then
        echo -e "${BOLD}Reject Spoke Registration${NC}"
        echo ""
        echo "Usage: ./dive hub spokes reject <spoke-id> [--reason 'reason'] [--yes]"
        echo ""
        echo "Options:"
        echo "  --reason <text>  Reason for rejection"
        echo "  --yes, -y        Skip confirmation prompt"
        return 1
    fi

    # Interactive mode: prompt for reason
    if [ "$interactive" = true ]; then
        echo -e "${BOLD}Reject Spoke Registration${NC}"
        echo ""
        echo "  Spoke ID: $spoke_id"
        echo ""

        if [ -z "$reason" ]; then
            echo "  Common rejection reasons:"
            echo "    1. Incomplete registration information"
            echo "    2. Failed security review"
            echo "    3. Invalid organization"
            echo "    4. Duplicate registration"
            echo "    5. Other (enter custom reason)"
            echo ""
            read -p "  Enter rejection reason: " reason
        fi

        if [ -z "$reason" ]; then
            reason="Rejected by administrator"
        fi

        echo ""
        echo "  Reason: $reason"
        read -p "  Proceed with rejection? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "  Cancelled"
            return 0
        fi
    else
        reason="${reason:-Rejected by administrator}"
    fi

    log_step "Rejecting spoke: ${spoke_id}"

    if [ "$DRY_RUN" = true ]; then
        log_dry "POST ${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/revoke"
        log_dry "Reason: ${reason}"
        return 0
    fi

    local response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d "{\"reason\": \"${reason}\"}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/revoke" 2>/dev/null)

    if echo "$response" | jq -e '.success' >/dev/null 2>&1; then
        log_success "Spoke registration rejected"
        echo ""
        echo "  Spoke ID: $spoke_id"
        echo "  Reason:   $reason"
        echo ""
        echo "  The spoke will be notified of the rejection."
    else
        log_error "Failed to reject spoke: $(echo "$response" | jq -r '.error // .message' 2>/dev/null)"
        return 1
    fi
}

hub_spokes_rotate_token() {
    local spoke_id="$1"
    shift || true

    local force=false

    # Parse options
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force|-f)
                force=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    if [ -z "$spoke_id" ]; then
        echo -e "${BOLD}Rotate Spoke Token${NC}"
        echo ""
        echo "Usage: ./dive hub spokes rotate-token <spoke-id> [--force]"
        echo ""
        echo "Options:"
        echo "  --force, -f   Skip confirmation prompt"
        echo ""
        echo "This will:"
        echo "  1. Revoke the current token (spoke loses access immediately)"
        echo "  2. Generate a new token"
        echo "  3. Display the new token for the spoke admin"
        return 1
    fi

    echo -e "${BOLD}Rotate Spoke Token${NC}"
    echo ""
    echo "  Spoke ID: $spoke_id"
    echo ""

    if [ "$force" != true ]; then
        log_warn "This will revoke the current token. The spoke will lose access until the new token is configured."
        read -p "  Continue? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "  Cancelled"
            return 0
        fi
    fi

    log_step "Revoking current token..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would revoke current token and generate new one"
        return 0
    fi

    # First revoke existing tokens
    curl -kfs --max-time 10 \
        -X POST \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/revoke-tokens" 2>/dev/null || true

    log_step "Generating new token..."

    # Generate new token
    local response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/token" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "Failed to generate new token"
        return 1
    fi

    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)

    if [ "$success" = "true" ]; then
        log_success "Token rotated successfully!"
        echo ""

        local token=$(echo "$response" | jq -r '.token.token' 2>/dev/null)
        local expires=$(echo "$response" | jq -r '.token.expiresAt' 2>/dev/null)
        local scopes=$(echo "$response" | jq -r '.token.scopes | join(", ")' 2>/dev/null)

        echo -e "${BOLD}New Token:${NC}"
        echo ""
        echo "┌─────────────────────────────────────────────────────────────┐"
        echo "│ Token (provide to spoke admin):                             │"
        echo "├─────────────────────────────────────────────────────────────┤"
        echo "│"
        echo "$token"
        echo "│"
        echo "└─────────────────────────────────────────────────────────────┘"
        echo ""
        echo "  Expires:  $expires"
        echo "  Scopes:   $scopes"
        echo ""
        echo -e "${YELLOW}⚠️  Important:${NC}"
        echo "  The spoke admin must update their .env with this new token"
        echo "  and restart the OPAL client for policy sync to resume."
    else
        log_error "Token rotation failed: $(echo "$response" | jq -r '.error' 2>/dev/null)"
        return 1
    fi
}

hub_spokes_suspend() {
    local spoke_id="$1"
    local reason="${2:-Suspended by administrator}"

    if [ -z "$spoke_id" ]; then
        echo "Usage: ./dive hub spokes suspend <spoke-id> [reason]"
        return 1
    fi

    log_step "Suspending spoke: ${spoke_id}"

    local response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d "{\"reason\": \"${reason}\"}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/suspend" 2>/dev/null)

    if echo "$response" | jq -e '.success' >/dev/null 2>&1; then
        log_success "Spoke suspended"
    else
        log_error "Failed to suspend spoke"
        return 1
    fi
}

# ADDED (Dec 2025): Unsuspend/reactivate a suspended spoke
hub_spokes_unsuspend() {
    local spoke_id="$1"
    local retry_federation="${2:-false}"

    if [ -z "$spoke_id" ]; then
        echo "Usage: ./dive hub spokes unsuspend <spoke-id> [--retry-federation]"
        echo ""
        echo "Options:"
        echo "  --retry-federation    Also retry bidirectional federation setup"
        return 1
    fi

    # Check for --retry-federation flag
    if [ "$2" = "--retry-federation" ] || [ "$2" = "-r" ]; then
        retry_federation="true"
    fi

    log_step "Unsuspending spoke: ${spoke_id}"
    if [ "$retry_federation" = "true" ]; then
        log_info "Will also retry bidirectional federation"
    fi

    local response=$(curl -kfs --max-time 30 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d "{\"retryFederation\": ${retry_federation}}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/unsuspend" 2>/dev/null)

    if echo "$response" | jq -e '.success' >/dev/null 2>&1; then
        log_success "Spoke unsuspended!"
        local new_status=$(echo "$response" | jq -r '.spoke.status // "unknown"')
        echo ""
        echo "  Status:  ${new_status}"
        if [ "$retry_federation" = "true" ]; then
            local fed_alias=$(echo "$response" | jq -r '.spoke.federationIdPAlias // "not configured"')
            echo "  IdP:     ${fed_alias}"
        else
            echo ""
            echo "  To restore bidirectional SSO, run:"
            echo "  ./dive federation-setup configure $(echo "$response" | jq -r '.spoke.instanceCode // "SPOKE"' | tr '[:upper:]' '[:lower:]')"
        fi
    else
        local error_msg=$(echo "$response" | jq -r '.message // "Unknown error"')
        log_error "Failed to unsuspend spoke: ${error_msg}"
        return 1
    fi
}

hub_spokes_revoke() {
    local spoke_id="$1"
    local reason="${2:-Revoked by administrator}"

    if [ -z "$spoke_id" ]; then
        echo "Usage: ./dive hub spokes revoke <spoke-id> [reason]"
        return 1
    fi

    log_warn "This will permanently revoke the spoke. All tokens will be invalidated."
    read -p "Continue? (y/N) " confirm

    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "Cancelled"
        return 0
    fi

    log_step "Revoking spoke: ${spoke_id}"

    local response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d "{\"reason\": \"${reason}\"}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/revoke" 2>/dev/null)

    if echo "$response" | jq -e '.success' >/dev/null 2>&1; then
        log_success "Spoke revoked permanently"
    else
        log_error "Failed to revoke spoke"
        return 1
    fi
}

hub_spokes_token() {
    local spoke_id="$1"

    if [ -z "$spoke_id" ]; then
        echo "Usage: ./dive hub spokes token <spoke-id>"
        return 1
    fi

    log_step "Generating new token for spoke: ${spoke_id}"

    local response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/token" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "Failed to generate token"
        return 1
    fi

    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)

    if [ "$success" = "true" ]; then
        log_success "New token generated"
        echo ""
        echo "Token: $(echo "$response" | jq -r '.token.token' 2>/dev/null)"
        echo "Expires: $(echo "$response" | jq -r '.token.expiresAt' 2>/dev/null)"
        echo "Scopes: $(echo "$response" | jq -r '.token.scopes | join(", ")' 2>/dev/null)"
    else
        log_error "Token generation failed: $(echo "$response" | jq -r '.error' 2>/dev/null)"
        return 1
    fi
}

hub_spokes_help() {
    echo -e "${BOLD}Spoke Management Commands (Phase 3):${NC}"
    echo ""
    echo -e "${CYAN}Registration Workflow:${NC}"
    echo "  pending              Show spokes pending approval (with details)"
    echo "  approve <id>         Approve a pending spoke (interactive)"
    echo "  reject <id>          Reject a pending spoke (with reason)"
    echo ""
    echo -e "${CYAN}Spoke Operations:${NC}"
    echo "  list                 List all registered spokes"
    echo "  suspend <id>         Temporarily suspend a spoke"
    echo "  unsuspend <id>       Reactivate a suspended spoke [--retry-federation]"
    echo "  revoke <id>          Permanently revoke a spoke"
    echo ""
    echo -e "${CYAN}Token Management:${NC}"
    echo "  token <id>           Generate new token for a spoke"
    echo "  rotate-token <id>    Revoke current token and issue new one"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./dive hub spokes pending"
    echo "  ./dive hub spokes approve spoke-nzl-abc123"
    echo "  ./dive hub spokes approve spoke-nzl-abc123 --scopes 'policy:base' --trust-level partner"
    echo "  ./dive hub spokes reject spoke-xyz-123 --reason 'Failed security review'"
    echo "  ./dive hub spokes unsuspend spoke-fra-456 --retry-federation"
    echo "  ./dive hub spokes rotate-token spoke-fra-456"
}

