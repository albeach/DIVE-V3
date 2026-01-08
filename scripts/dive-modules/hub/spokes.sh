#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub Spokes Management Sub-Module
# =============================================================================
# Spoke registration and management functions
# Loaded on-demand via lazy loading
# =============================================================================

# Mark spokes module as loaded
export DIVE_HUB_SPOKES_LOADED=1

# =============================================================================
# CONSTANTS
# =============================================================================

HUB_BACKEND_URL="${HUB_BACKEND_URL:-https://localhost:${BACKEND_PORT:-4000}}"
FEDERATION_ADMIN_KEY="${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}"

# =============================================================================
# SPOKE MANAGEMENT FUNCTIONS
# =============================================================================

hub_spokes() {
    local action="${1:-list}"
    shift || true

    case "$action" in
        list)         hub_spokes_list "$@" ;;
        pending)      hub_spokes_pending "$@" ;;
        approve)      hub_spokes_approve "$@" ;;
        reject)       hub_spokes_reject "$@" ;;
        suspend)      hub_spokes_suspend "$@" ;;
        unsuspend)    hub_spokes_unsuspend "$@" ;;
        revoke)       hub_spokes_revoke "$@" ;;
        token)        hub_spokes_token "$@" ;;
        rotate-token) hub_spokes_rotate_token "$@" ;;
        *)            hub_spokes_help ;;
    esac
}

hub_spokes_list() {
    echo -e "${BOLD}Registered Spokes${NC}"
    echo ""

    local response=$(curl -kfs --max-time 10 \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "Failed to fetch spokes (is the hub running?)"
        return 1
    fi

    echo "$response" | jq -r '
        .spokes[] |
        "  \(.instanceCode)\t\(.status)\t\(.trustLevel // "N/A")\t\(.name)"
    ' 2>/dev/null | column -t -s $'\t' || echo "  (no spokes registered)"

    echo ""
    echo "$response" | jq -r '
        .statistics |
        "Total: \(.totalSpokes) | Active: \(.activeSpokes) | Pending: \(.pendingApprovals)"
    ' 2>/dev/null
}

hub_spokes_pending() {
    echo -e "${BOLD}Pending Spoke Registrations${NC}"
    echo ""

    local response=$(curl -kfs --max-time 10 \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/pending" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "Failed to fetch pending spokes (is the hub running?)"
        return 1
    fi

    local count=$(echo "$response" | jq '.pending | length' 2>/dev/null || echo "0")

    if [ "$count" = "0" ]; then
        echo -e "  ${GREEN}✓${NC} No pending approvals"
        return 0
    fi

    echo -e "  ${YELLOW}$count pending approval(s)${NC}"
    echo ""

    # Rich display for each pending spoke
    echo "$response" | jq -r '
        .pending[] |
        "┌─────────────────────────────────────────────────────────────┐",
        "│ Spoke: \(.spokeId | .[0:50])",
        "├─────────────────────────────────────────────────────────────┤",
        "│  Instance Code:  \(.instanceCode)",
        "│  Name:           \(.name)",
        "│  Contact:        \(.contactEmail // "Not provided")",
        "│  Base URL:       \(.baseUrl)",
        "│  IdP URL:        \(.idpUrl // "Not provided")",
        "│  Registered:     \(.registeredAt)",
        "└─────────────────────────────────────────────────────────────┘",
        ""
    ' 2>/dev/null

    echo ""
    echo -e "${CYAN}Actions:${NC}"
    echo "  Approve:  ./dive hub spokes approve <spoke-id>"
    echo "  Reject:   ./dive hub spokes reject <spoke-id>"
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
        return 1
    fi

    # Fetch spoke details for display
    log_step "Fetching spoke details: ${spoke_id}"

    local spoke_details=$(curl -kfs --max-time 10 \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}" 2>/dev/null)

    if [ -z "$spoke_details" ] || echo "$spoke_details" | grep -q '"error"'; then
        log_error "Spoke not found: ${spoke_id}"
        return 1
    fi

    # Extract spoke info
    local spoke_name=$(echo "$spoke_details" | jq -r '.spoke.name // .name // "Unknown"' 2>/dev/null)
    local instance_code=$(echo "$spoke_details" | jq -r '.spoke.instanceCode // .instanceCode // "?"' 2>/dev/null)

    echo ""
    echo -e "${BOLD}Spoke Details:${NC}"
    echo "  Instance Code:     $instance_code"
    echo "  Name:              $spoke_name"
    echo ""

    # Use defaults for simplified version
    scopes="${scopes:-policy:base,heartbeat:write}"
    trust_level="${trust_level:-partner}"
    max_class="${max_class:-CONFIDENTIAL}"

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
        echo "  Spoke: $spoke_name ($instance_code)"
        echo "  Scopes: $scopes"
        echo "  Trust Level: $trust_level"
    else
        log_error "Approval failed: $(echo "$response" | jq -r '.error // .message' 2>/dev/null)"
        return 1
    fi
}

hub_spokes_reject() {
    local spoke_id="$1"
    local reason="${2:-Rejected by administrator}"

    if [ -z "$spoke_id" ]; then
        echo "Usage: ./dive hub spokes reject <spoke-id> [reason]"
        return 1
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
    else
        log_error "Failed to reject spoke: $(echo "$response" | jq -r '.error // .message' 2>/dev/null)"
        return 1
    fi
}

hub_spokes_help() {
    echo -e "${BOLD}Spoke Management Commands:${NC}"
    echo ""
    echo -e "${CYAN}Registration Workflow:${NC}"
    echo "  pending              Show spokes pending approval"
    echo "  approve <id>         Approve a pending spoke"
    echo "  reject <id>          Reject a pending spoke"
    echo ""
    echo -e "${CYAN}Spoke Operations:${NC}"
    echo "  list                 List all registered spokes"
    echo "  suspend <id>         Temporarily suspend a spoke"
    echo "  unsuspend <id>       Reactivate a suspended spoke"
    echo "  revoke <id>          Permanently revoke a spoke"
    echo "  token <id>           Generate new token for a spoke"
    echo "  rotate-token <id>    Rotate spoke token"
}