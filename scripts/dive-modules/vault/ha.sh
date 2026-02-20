#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Vault HA Cluster Management
# =============================================================================
# Purpose: Manage 3-node Raft HA cluster with Transit auto-unseal
# Usage:
#   ./dive vault cluster status       # Show cluster overview
#   ./dive vault cluster step-down    # Force leader step-down
#   ./dive vault cluster remove-peer  # Remove dead node from Raft
#   ./dive vault seal-status          # Check seal vault health
# =============================================================================

# Vault HA node container names (derived from COMPOSE_PROJECT_NAME)
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-dive-hub}"
VAULT_NODES=("${COMPOSE_PROJECT}-vault-1" "${COMPOSE_PROJECT}-vault-2" "${COMPOSE_PROJECT}-vault-3")
VAULT_SEAL_CONTAINER="${COMPOSE_PROJECT}-vault-seal"
VAULT_NODE_ADDRS=("${_VAULT_CLI_SCHEME:-https}://localhost:${VAULT_API_PORT:-8200}" "${_VAULT_CLI_SCHEME:-https}://localhost:8202" "${_VAULT_CLI_SCHEME:-https}://localhost:8204")
VAULT_SEAL_CLI_ADDR="${VAULT_SEAL_CLI_ADDR:-http://localhost:8210}"

# Colors (reuse from common.sh if available)
_HA_GREEN='\033[0;32m'
_HA_YELLOW='\033[1;33m'
_HA_RED='\033[0;31m'
_HA_CYAN='\033[0;36m'
_HA_NC='\033[0m'

##
# Show HA cluster status: seal vault + all 3 nodes + Raft peers
##
vault_ha_status() {
    if _vault_is_dev_mode; then
        log_info "Vault is running in DEV mode (no HA cluster)"
        log_info "Use './dive vault status' for dev mode status"
        return 0
    fi

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Vault HA Cluster Status"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    # 1. Seal vault status
    printf "  %-30s" "Seal Vault:"
    if docker ps --format '{{.Names}}' | grep -q "$VAULT_SEAL_CONTAINER"; then
        local seal_status
        seal_status=$(VAULT_ADDR="$VAULT_SEAL_CLI_ADDR" vault status -format=json 2>/dev/null || true)
        if [ -n "$seal_status" ]; then
            local seal_sealed
            seal_sealed=$(echo "$seal_status" | grep -o '"sealed": *[a-z]*' | sed 's/.*: *//')
            if [ "$seal_sealed" = "false" ]; then
                echo -e "${_HA_GREEN}HEALTHY${_HA_NC} (unsealed, Transit ready)"
            else
                echo -e "${_HA_RED}SEALED${_HA_NC} — Transit unavailable"
            fi
        else
            echo -e "${_HA_YELLOW}STARTING${_HA_NC} (not yet responsive)"
        fi
    else
        echo -e "${_HA_RED}DOWN${_HA_NC} — auto-unseal unavailable"
    fi

    echo ""

    # 2. Cluster nodes
    local leader_addr=""
    local healthy_count=0

    local i
    for i in 0 1 2; do
        local node_num=$((i + 1))
        local container="${VAULT_NODES[$i]}"
        local addr="${VAULT_NODE_ADDRS[$i]}"

        printf "  %-30s" "Node ${node_num} (${addr}):"

        if ! docker ps --format '{{.Names}}' | grep -q "$container"; then
            echo -e "${_HA_RED}DOWN${_HA_NC}"
            continue
        fi

        local status_json
        status_json=$(VAULT_ADDR="$addr" vault status -format=json 2>/dev/null || true)

        if [ -z "$status_json" ]; then
            echo -e "${_HA_YELLOW}NOT RESPONDING${_HA_NC}"
            continue
        fi

        local sealed
        sealed=$(echo "$status_json" | grep -o '"sealed": *[a-z]*' | sed 's/.*: *//')
        local cluster_name
        cluster_name=$(echo "$status_json" | grep -o '"cluster_name": *"[^"]*"' | sed 's/.*: *"//;s/"//')

        if [ "$sealed" = "true" ]; then
            echo -e "${_HA_RED}SEALED${_HA_NC}"
            continue
        fi

        # Check if leader or standby (need token for this)
        local is_leader="unknown"
        if [ -f "$VAULT_TOKEN_FILE" ]; then
            local leader_check
            leader_check=$(VAULT_ADDR="$addr" VAULT_TOKEN="$(cat "$VAULT_TOKEN_FILE")" \
                vault read -format=json sys/leader 2>/dev/null || true)
            if [ -n "$leader_check" ]; then
                local is_self
                is_self=$(echo "$leader_check" | grep -o '"is_self": *[a-z]*' | sed 's/.*: *//')
                if [ "$is_self" = "true" ]; then
                    is_leader="leader"
                    leader_addr="$addr"
                else
                    is_leader="follower"
                fi
            fi
        fi

        healthy_count=$((healthy_count + 1))

        case "$is_leader" in
            leader)
                echo -e "${_HA_GREEN}LEADER${_HA_NC} (unsealed, cluster: ${cluster_name:-unknown})"
                ;;
            follower)
                echo -e "${_HA_CYAN}FOLLOWER${_HA_NC} (unsealed, standby)"
                ;;
            *)
                echo -e "${_HA_GREEN}UNSEALED${_HA_NC} (role unknown — no token)"
                ;;
        esac
    done

    echo ""

    # 3. Raft peer list (if we have a token and leader)
    if [ -f "$VAULT_TOKEN_FILE" ] && [ -n "$leader_addr" ]; then
        echo "  Raft Peers:"
        local peers
        peers=$(VAULT_ADDR="$leader_addr" VAULT_TOKEN="$(cat "$VAULT_TOKEN_FILE")" \
            vault operator raft list-peers -format=json 2>/dev/null || true)

        if [ -n "$peers" ]; then
            echo "$peers" | grep -o '"node_id": *"[^"]*"' | while read -r line; do
                local node_id
                node_id=$(echo "$line" | cut -d'"' -f4)
                echo "    - $node_id"
            done
        else
            echo "    (unable to read peer list)"
        fi
    fi

    echo ""

    # 4. Summary
    if [ "$healthy_count" -ge 2 ]; then
        echo -e "  Cluster Health: ${_HA_GREEN}HEALTHY${_HA_NC} (${healthy_count}/3 nodes, quorum maintained)"
    elif [ "$healthy_count" -eq 1 ]; then
        echo -e "  Cluster Health: ${_HA_YELLOW}DEGRADED${_HA_NC} (${healthy_count}/3 nodes, NO quorum)"
    else
        echo -e "  Cluster Health: ${_HA_RED}DOWN${_HA_NC} (${healthy_count}/3 nodes)"
    fi

    echo "═══════════════════════════════════════════════════════════════"
    echo ""
}

##
# Force leader step-down (triggers re-election)
##
vault_ha_step_down() {
    if _vault_is_dev_mode; then
        log_info "Step-down not applicable in dev mode (single node)"
        return 0
    fi
    log_info "Forcing Vault leader step-down..."

    if [ ! -f "$VAULT_TOKEN_FILE" ]; then
        log_error "No Vault token found. Run './dive vault init' first."
        return 1
    fi

    VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
    export VAULT_TOKEN

    # Find the current leader node
    local leader_addr=""
    for addr in "${VAULT_NODE_ADDRS[@]}"; do
        local is_self
        is_self=$(VAULT_ADDR="$addr" VAULT_TOKEN="$VAULT_TOKEN" \
            vault read -format=json sys/leader 2>/dev/null | \
            grep -o '"is_self": *[a-z]*' | sed 's/.*: *//' || echo "false")
        if [ "$is_self" = "true" ]; then
            leader_addr="$addr"
            break
        fi
    done

    if [ -z "$leader_addr" ]; then
        log_error "Could not identify current leader"
        return 1
    fi

    log_info "Leader found at $leader_addr — requesting step-down..."

    if VAULT_ADDR="$leader_addr" vault operator step-down 2>/dev/null; then
        log_success "Leader step-down complete — re-election in progress"
        sleep 3
        log_info "New cluster state:"
        vault_ha_status
    else
        log_error "Step-down failed at $leader_addr"
        return 1
    fi
}

##
# Remove a dead peer from the Raft cluster
##
vault_ha_remove_peer() {
    if _vault_is_dev_mode; then
        log_info "Remove-peer not applicable in dev mode (single node)"
        return 0
    fi
    local node_id="${1:-}"

    if [ -z "$node_id" ]; then
        log_error "Usage: ./dive vault cluster remove-peer <node-id>"
        log_info "Node IDs: vault-1, vault-2, vault-3"
        return 1
    fi

    if [ ! -f "$VAULT_TOKEN_FILE" ]; then
        log_error "No Vault token found."
        return 1
    fi

    VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
    export VAULT_TOKEN

    log_info "Removing peer '$node_id' from Raft cluster..."

    if vault operator raft remove-peer "$node_id" 2>/dev/null; then
        log_success "Peer '$node_id' removed from cluster"
    else
        log_error "Failed to remove peer '$node_id'"
        return 1
    fi
}

##
# Show seal vault health and Transit key info
##
vault_ha_seal_status() {
    if _vault_is_dev_mode; then
        log_info "Seal status not applicable in dev mode (no seal vault)"
        return 0
    fi
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Seal Vault Diagnostics"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    # Container status
    printf "  %-25s" "Container:"
    if docker ps --format '{{.Names}}' | grep -q "$VAULT_SEAL_CONTAINER"; then
        echo -e "${_HA_GREEN}RUNNING${_HA_NC}"
    else
        echo -e "${_HA_RED}NOT RUNNING${_HA_NC}"
        echo ""
        echo "  Start with: docker compose -f docker-compose.hub.yml up -d vault-seal"
        return 1
    fi

    # Vault status
    printf "  %-25s" "Status:"
    local seal_status
    seal_status=$(VAULT_ADDR="$VAULT_SEAL_CLI_ADDR" vault status -format=json 2>/dev/null || true)
    if [ -n "$seal_status" ]; then
        local sealed
        sealed=$(echo "$seal_status" | grep -o '"sealed": *[a-z]*' | sed 's/.*: *//')
        local initialized
        initialized=$(echo "$seal_status" | grep -o '"initialized": *[a-z]*' | sed 's/.*: *//')
        echo "Initialized=$initialized, Sealed=$sealed"
    else
        echo -e "${_HA_RED}NOT RESPONDING${_HA_NC}"
        return 1
    fi

    # Transit key
    printf "  %-25s" "Transit Key:"
    local seal_root_token=""
    # Try to read root token from seal vault data volume via docker exec
    seal_root_token=$(docker exec "$VAULT_SEAL_CONTAINER" sh -c \
        'grep ROOT_TOKEN /vault/data/.seal-keys 2>/dev/null | cut -d= -f2' 2>/dev/null || true)

    if [ -n "$seal_root_token" ]; then
        local key_info
        key_info=$(VAULT_ADDR="$VAULT_SEAL_CLI_ADDR" VAULT_TOKEN="$seal_root_token" \
            vault read -format=json transit/keys/autounseal 2>/dev/null || true)

        if [ -n "$key_info" ]; then
            local key_type
            key_type=$(echo "$key_info" | grep -o '"type":"[^"]*"' | cut -d'"' -f4)
            local min_ver
            min_ver=$(echo "$key_info" | grep -o '"min_decryption_version":[0-9]*' | cut -d: -f2)
            echo -e "${_HA_GREEN}PRESENT${_HA_NC} (type=$key_type, min_version=$min_ver)"
        else
            echo -e "${_HA_RED}MISSING or INACCESSIBLE${_HA_NC}"
        fi
    else
        echo -e "${_HA_YELLOW}CANNOT READ${_HA_NC} (no root token access)"
    fi

    # Transit token
    printf "  %-25s" "Transit Token:"
    local has_token
    has_token=$(docker exec "$VAULT_SEAL_CONTAINER" sh -c \
        'test -f /vault/transit/.transit-token && echo "yes" || echo "no"' 2>/dev/null || echo "unknown")
    if [ "$has_token" = "yes" ]; then
        echo -e "${_HA_GREEN}PRESENT${_HA_NC} (shared volume)"
    else
        echo -e "${_HA_RED}MISSING${_HA_NC}"
    fi

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
}

##
# Dispatcher for cluster sub-commands
##
vault_ha_dispatch() {
    local subcmd="${1:-status}"
    shift 2>/dev/null || true

    case "$subcmd" in
        status)
            vault_ha_status
            ;;
        step-down)
            vault_ha_step_down
            ;;
        remove-peer)
            vault_ha_remove_peer "$@"
            ;;
        *)
            log_error "Unknown cluster command: $subcmd"
            echo "Usage: ./dive vault cluster <command>"
            echo ""
            echo "Commands:"
            echo "  status        Show cluster overview (leader, followers, peers)"
            echo "  step-down     Force leader step-down (triggers re-election)"
            echo "  remove-peer   Remove dead node from Raft cluster"
            return 1
            ;;
    esac
}
