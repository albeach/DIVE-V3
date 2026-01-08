#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub Policy Sub-Module
# =============================================================================
# Policy management functions
# Loaded on-demand via lazy loading
# =============================================================================

# Mark policy module as loaded
export DIVE_HUB_POLICY_LOADED=1

hub_push_policy() {
    local layers="${1:-base,coalition,tenant}"
    local description="${2:-Manual policy push}"

    log_step "Pushing policy update to all spokes..."

    local payload=$(cat << EOF
{
    "layers": $(echo "$layers" | jq -R 'split(",")'),
    "priority": "normal",
    "description": "${description}"
}
EOF
)

    if [ "$DRY_RUN" = true ]; then
        log_dry "POST ${HUB_BACKEND_URL}/api/federation/policy/push"
        log_dry "Payload: ${payload}"
        return 0
    fi

    local response=$(curl -kfs --max-time 30 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d "$payload" \
        "${HUB_BACKEND_URL}/api/federation/policy/push" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "Failed to push policy update"
        return 1
    fi

    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)

    if [ "$success" = "true" ]; then
        log_success "Policy update pushed"
        echo ""
        echo "Update ID: $(echo "$response" | jq -r '.update.updateId' 2>/dev/null)"
        echo "Version:   $(echo "$response" | jq -r '.update.version' 2>/dev/null)"
    else
        log_error "Policy push failed: $(echo "$response" | jq -r '.error' 2>/dev/null)"
        return 1
    fi
}