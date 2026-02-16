#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Nuke Cleanup Helpers
# =============================================================================
# Extracted from deploy-nuke.sh (Phase 13e)
# Contains: volume, network, image removal, system prune, state cleanup
# =============================================================================

[ -n "${DIVE_NUKE_CLEANUP_LOADED:-}" ] && return 0

_nuke_remove_volumes() {
    local removed_volumes=0

    for v in $dive_volumes; do
        if ${DOCKER_CMD:-docker} volume rm -f "$v" 2>/dev/null; then
            removed_volumes=$((removed_volumes + 1))
        fi
    done

    # Also remove by compose project label — ONLY for the current target (surgical nuke)
    case "$target_type" in
        hub)
            for v in $(docker volume ls -q --filter "label=com.docker.compose.project=dive-hub" 2>/dev/null); do
                if ${DOCKER_CMD:-docker} volume rm -f "$v" 2>/dev/null; then
                    removed_volumes=$((removed_volumes + 1))
                fi
            done
            ;;
        spoke)
            local instance_lower=$(echo "$target_instance" | tr '[:upper:]' '[:lower:]')
            for v in $(docker volume ls -q --filter "label=com.docker.compose.project=dive-spoke-${instance_lower}" 2>/dev/null); do
                if ${DOCKER_CMD:-docker} volume rm -f "$v" 2>/dev/null; then
                    removed_volumes=$((removed_volumes + 1))
                fi
            done
            ;;
        all)
            for label in "com.docker.compose.project=dive-hub" "com.docker.compose.project=dive-v3"; do
                for v in $(docker volume ls -q --filter "label=$label" 2>/dev/null); do
                    if ${DOCKER_CMD:-docker} volume rm -f "$v" 2>/dev/null; then
                        removed_volumes=$((removed_volumes + 1))
                    fi
                done
            done
            for v in $(docker volume ls -q --filter "label=com.docker.compose.project" 2>/dev/null); do
                local project_label=$(docker volume inspect --format '{{index .Labels "com.docker.compose.project"}}' "$v" 2>/dev/null)
                if echo "$project_label" | grep -qE "^dive-spoke-|^dive-hub$"; then
                    if ${DOCKER_CMD:-docker} volume rm -f "$v" 2>/dev/null; then
                        removed_volumes=$((removed_volumes + 1))
                    fi
                fi
            done
            for v in $(docker volume ls -q --filter "label=dive.resource.type" 2>/dev/null); do
                if ${DOCKER_CMD:-docker} volume rm -f "$v" 2>/dev/null; then
                    removed_volumes=$((removed_volumes + 1))
                fi
            done
            ;;
        *) ;;
    esac

    # Dangling volumes only in deep-clean mode, and only when target is "all" to avoid touching other projects
    if [ "$deep_clean" = true ] && [ "$target_type" = "all" ]; then
        log_verbose "  Deep clean: removing ALL dangling volumes..."
        for v in $(docker volume ls -qf dangling=true 2>/dev/null); do
            if ${DOCKER_CMD:-docker} volume rm -f "$v" 2>/dev/null; then
                removed_volumes=$((removed_volumes + 1))
            fi
        done
    fi

    echo "$removed_volumes"
}

##
# Remove discovered networks
# Uses global variables: dive_networks, target_type, target_instance
# Returns: Number of networks removed
##
_nuke_remove_networks() {
    local removed_networks=0
    for n in $dive_networks; do
        for container in $(docker network inspect "$n" --format='{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null); do
            ${DOCKER_CMD:-docker} network disconnect -f "$n" "$container" 2>/dev/null || true
        done
        if ${DOCKER_CMD:-docker} network rm "$n" 2>/dev/null; then
            removed_networks=$((removed_networks + 1))
        fi
    done

    # Also remove by compose project label — ONLY for the current target (surgical nuke)
    case "$target_type" in
        hub)
            for n in $(docker network ls -q --filter "label=com.docker.compose.project=dive-hub" 2>/dev/null); do
                for container in $(docker network inspect "$n" --format='{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null); do
                    ${DOCKER_CMD:-docker} network disconnect -f "$n" "$container" 2>/dev/null || true
                done
                ${DOCKER_CMD:-docker} network rm "$n" 2>/dev/null && removed_networks=$((removed_networks + 1)) || true
            done
            ;;
        spoke)
            local instance_lower=$(echo "$target_instance" | tr '[:upper:]' '[:lower:]')
            # First, find ALL networks for this spoke (by name pattern - not just labeled ones)
            for n in $(docker network ls --format '{{.Name}}' 2>/dev/null | grep -E "dive-spoke-${instance_lower}|dive_spoke_${instance_lower}"); do
                # Disconnect ALL containers from this network (forcefully)
                for container in $(docker network inspect "$n" --format='{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null); do
                    log_verbose "    Disconnecting $container from network $n"
                    ${DOCKER_CMD:-docker} network disconnect -f "$n" "$container" 2>/dev/null || true
                done
                # Now remove the network
                if ${DOCKER_CMD:-docker} network rm "$n" 2>/dev/null; then
                    removed_networks=$((removed_networks + 1))
                    log_verbose "    ✓ Removed network: $n"
                fi
            done

            # Also check by compose label
            for n in $(docker network ls -q --filter "label=com.docker.compose.project=dive-spoke-${instance_lower}" 2>/dev/null); do
                for container in $(docker network inspect "$n" --format='{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null); do
                    ${DOCKER_CMD:-docker} network disconnect -f "$n" "$container" 2>/dev/null || true
                done
                ${DOCKER_CMD:-docker} network rm "$n" 2>/dev/null && removed_networks=$((removed_networks + 1)) || true
            done
            ;;
        all)
            for label in "com.docker.compose.project=dive-hub" "com.docker.compose.project=dive-v3"; do
                for n in $(docker network ls -q --filter "label=$label" 2>/dev/null); do
                    for container in $(docker network inspect "$n" --format='{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null); do
                        ${DOCKER_CMD:-docker} network disconnect -f "$n" "$container" 2>/dev/null || true
                    done
                    ${DOCKER_CMD:-docker} network rm "$n" 2>/dev/null && removed_networks=$((removed_networks + 1)) || true
                done
            done
            for n in $(docker network ls -q --filter "label=com.docker.compose.project" 2>/dev/null); do
                local project_label=$(docker network inspect --format '{{index .Labels "com.docker.compose.project"}}' "$n" 2>/dev/null)
                if echo "$project_label" | grep -qE "^dive-spoke-|^dive-hub$"; then
                    for container in $(docker network inspect "$n" --format='{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null); do
                        ${DOCKER_CMD:-docker} network disconnect -f "$n" "$container" 2>/dev/null || true
                    done
                    ${DOCKER_CMD:-docker} network rm "$n" 2>/dev/null && removed_networks=$((removed_networks + 1)) || true
                fi
            done
            for n in $(docker network ls -q --filter "label=dive.network.type" 2>/dev/null); do
                for container in $(docker network inspect "$n" --format='{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null); do
                    ${DOCKER_CMD:-docker} network disconnect -f "$n" "$container" 2>/dev/null || true
                done
                ${DOCKER_CMD:-docker} network rm "$n" 2>/dev/null && removed_networks=$((removed_networks + 1)) || true
            done
            ;;
        *) ;;
    esac

    echo "$removed_networks"
}

##
# Remove Docker images
# Uses global variables: keep_images, target_type, target_instance
# Returns: Number of images removed
##
_nuke_remove_images() {
    local removed_images=0

    # Remove by name pattern (respect target_type)
    case "$target_type" in
        spoke)
            # For spoke targeting, only remove images for that spoke
            local instance_lower=$(echo "$target_instance" | tr '[:upper:]' '[:lower:]')
            for img in $(docker images --format '{{.ID}} {{.Repository}}' 2>/dev/null | grep "dive-spoke-${instance_lower}" | awk '{print $1}'); do
                if ${DOCKER_CMD:-docker} image rm -f "$img" 2>/dev/null; then
                    removed_images=$((removed_images + 1))
                fi
            done
            ;;
        hub)
            # For hub targeting, only remove hub images
            for img in $(docker images --format '{{.ID}} {{.Repository}}' 2>/dev/null | grep "dive-hub" | awk '{print $1}'); do
                if ${DOCKER_CMD:-docker} image rm -f "$img" 2>/dev/null; then
                    removed_images=$((removed_images + 1))
                fi
            done
            ;;
        all)
            # For all targeting, remove all DIVE images
            for pattern in "dive" "ghcr.io/opentdf"; do
                for img in $(docker images --format '{{.ID}} {{.Repository}}' 2>/dev/null | grep "$pattern" | awk '{print $1}'); do
                    if ${DOCKER_CMD:-docker} image rm -f "$img" 2>/dev/null; then
                        removed_images=$((removed_images + 1))
                    fi
                done
            done
            ;;
    esac

    # Remove dangling images
    ${DOCKER_CMD:-docker} image prune -f 2>/dev/null || true
    log_verbose "  Removed $removed_images images"
}

##
# System prune for full cleanup
# Uses global variables: target_type, deep_clean
##
_nuke_system_prune() {
    if [ "$deep_clean" = true ]; then
        log_verbose "  Deep clean: Removing ALL unused images including base images..."
        ${DOCKER_CMD:-docker} system prune -af --volumes 2>/dev/null || true
        log_verbose "  Deep clean complete (all unused images removed)"
    else
        ${DOCKER_CMD:-docker} system prune -f --volumes 2>/dev/null || true
        log_verbose "  Standard prune complete (use --deep to remove base images like mongo, postgres, redis)"
    fi
}

##
# Clean local state files and directories
# Uses global variables: target_type, reset_spokes, target_instance, deep_clean
##
_nuke_cleanup_state() {
    # Checkpoint directory: only remove when nuking "all" (surgical nuke preserves checkpoints for hub/spoke)
    if [ "$target_type" = "all" ]; then
        rm -rf "${CHECKPOINT_DIR}"
        log_verbose "  Checkpoint directory removed"
    fi

    # Clear spoke registrations if requested (scoped: --reset-spokes with spoke target = that spoke only; with all = all)
    if [ "$reset_spokes" = true ]; then
        log_verbose "  Clearing spoke registrations..."
        if [ "$target_type" = "spoke" ] && [ -n "$target_instance" ]; then
            local instance_lower=$(echo "$target_instance" | tr '[:upper:]' '[:lower:]')
            local spoke_dir="${DIVE_ROOT}/instances/${instance_lower}"
            if [ -f "$spoke_dir/config.json" ] && command -v jq &> /dev/null; then
                jq 'del(.identity.registeredSpokeId) | .federation.status = "unregistered" | del(.federation.registeredAt)' \
                    "$spoke_dir/config.json" > "$spoke_dir/config.json.tmp" && mv "$spoke_dir/config.json.tmp" "$spoke_dir/config.json"
                rm -f "$spoke_dir/.federation-registered"
                log_verbose "  Cleared registration for ${target_instance^^}"
            fi
        else
            if [ -f "${DIVE_ROOT}/scripts/clear-stale-spoke-registration.sh" ]; then
                bash "${DIVE_ROOT}/scripts/clear-stale-spoke-registration.sh" --all 2>/dev/null || log_warn "Could not clear spoke registrations"
            else
                for spoke_dir in "${DIVE_ROOT}/instances"/*; do
                    if [ -f "$spoke_dir/config.json" ]; then
                        local instance_code=$(basename "$spoke_dir" | tr '[:lower:]' '[:upper:]')
                        if command -v jq &> /dev/null; then
                            jq 'del(.identity.registeredSpokeId) | .federation.status = "unregistered" | del(.federation.registeredAt)' \
                                "$spoke_dir/config.json" > "$spoke_dir/config.json.tmp" && \
                                mv "$spoke_dir/config.json.tmp" "$spoke_dir/config.json"
                            log_verbose "  Cleared registration for $instance_code"
                        fi
                        rm -f "$spoke_dir/.federation-registered"
                    fi
                done
            fi
        fi
    fi

    # =========================================================================
    # TERRAFORM STATE CLEANUP (SCOPED — only clean state for the nuked target)
    # =========================================================================
    log_verbose "  Cleaning Terraform state for target: ${target_type}..."

    if [ "$target_type" = "hub" ] || [ "$target_type" = "all" ]; then
        if [ -d "${DIVE_ROOT}/terraform/hub" ]; then
            rm -rf "${DIVE_ROOT}/terraform/hub/.terraform" 2>/dev/null || true
            rm -f "${DIVE_ROOT}/terraform/hub/terraform.tfstate"* 2>/dev/null || true
            rm -f "${DIVE_ROOT}/terraform/hub/.terraform.lock.hcl" 2>/dev/null || true
            rm -f "${DIVE_ROOT}/terraform/hub/hub.auto.tfvars" 2>/dev/null || true
            log_verbose "    ✓ Hub Terraform state cleaned"
        fi
    fi

    if [ "$target_type" = "spoke" ] || [ "$target_type" = "all" ]; then
        if [ -d "${DIVE_ROOT}/terraform/spoke" ]; then
            rm -rf "${DIVE_ROOT}/terraform/spoke/.terraform" 2>/dev/null || true
            rm -f "${DIVE_ROOT}/terraform/spoke/terraform.tfstate"* 2>/dev/null || true
            rm -f "${DIVE_ROOT}/terraform/spoke/.terraform.lock.hcl" 2>/dev/null || true
            rm -f "${DIVE_ROOT}/terraform/spoke/spoke.auto.tfvars" 2>/dev/null || true

            # BEST PRACTICE: Deep clean spoke-specific workspace state and locks
            if [ "$target_type" = "spoke" ] && [ -n "$target_instance" ]; then
                local instance_lower=$(echo "$target_instance" | tr '[:upper:]' '[:lower:]')
                if [ -d "${DIVE_ROOT}/terraform/spoke/terraform.tfstate.d/${instance_lower}" ]; then
                    log_verbose "    Cleaning Terraform workspace for ${target_instance^^}..."
                    # Always remove lock files (critical for re-deployment)
                    rm -f "${DIVE_ROOT}/terraform/spoke/terraform.tfstate.d/${instance_lower}/.terraform.tfstate.lock.info" 2>/dev/null || true

                    if [ "$deep_clean" = true ]; then
                        # Deep clean: Remove entire workspace
                        rm -rf "${DIVE_ROOT}/terraform/spoke/terraform.tfstate.d/${instance_lower}" 2>/dev/null || true
                        log_verbose "      ✓ Deep clean: Workspace ${target_instance^^} removed"
                    else
                        # Standard clean: Just state file, keep workspace structure
                        rm -f "${DIVE_ROOT}/terraform/spoke/terraform.tfstate.d/${instance_lower}/terraform.tfstate" 2>/dev/null || true
                        log_verbose "      ✓ Workspace state cleaned (use --deep to remove workspace)"
                    fi
                fi
            fi

            log_verbose "    ✓ Spoke Terraform state cleaned"
        fi
    fi

    if [ "$target_type" = "all" ]; then
        if [ -d "${DIVE_ROOT}/terraform/pilot" ]; then
            rm -rf "${DIVE_ROOT}/terraform/pilot/.terraform" 2>/dev/null || true
            rm -f "${DIVE_ROOT}/terraform/pilot/terraform.tfstate"* 2>/dev/null || true
            rm -f "${DIVE_ROOT}/terraform/pilot/.terraform.lock.hcl" 2>/dev/null || true
            log_verbose "    ✓ Pilot Terraform state cleaned"
        fi
    fi

    if [ "$deep_clean" = true ] && [ "$target_type" = "all" ]; then
        log_verbose "  Deep clean: removing all Terraform caches..."
        find "${DIVE_ROOT}/terraform" -type d -name ".terraform" -exec rm -rf {} + 2>/dev/null || true
        find "${DIVE_ROOT}/terraform" -type f -name "terraform.tfstate*" -delete 2>/dev/null || true
        find "${DIVE_ROOT}/terraform" -type f -name ".terraform.lock.hcl" -delete 2>/dev/null || true
        find "${DIVE_ROOT}/terraform" -type f -name "*.auto.tfvars" -delete 2>/dev/null || true
        log_verbose "    ✓ All Terraform state removed"
    fi

    # SSOT ARCHITECTURE (2026-01-22): Clean spoke instance directories
    # These directories cause stale IdPs to be created when Hub deploys
    # Only preserve hub/ and shared/ directories
    if [ "$target_type" = "all" ]; then
        log_verbose "  Cleaning spoke instance directories (SSOT)..."
        for spoke_dir in "${DIVE_ROOT}/instances"/*; do
            local dirname=$(basename "$spoke_dir")
            # Preserve hub and shared directories
            if [[ "$dirname" != "hub" && "$dirname" != "shared" && "$dirname" != "usa" ]]; then
                log_verbose "    Removing ${dirname}/..."
                # Clear macOS extended attributes and flags
                xattr -rc "$spoke_dir" 2>/dev/null || true
                chflags -R nouchg "$spoke_dir" 2>/dev/null || true
                # Try Docker cleanup first (for root-owned files)
                if command -v ${DOCKER_CMD:-docker} &> /dev/null; then
                    ${DOCKER_CMD:-docker} run --rm -v "$spoke_dir:/target" alpine sh -c "rm -rf /target/* /target/.*" 2>/dev/null || true
                fi
                rm -rf "$spoke_dir" 2>/dev/null || true
            fi
        done
        log_verbose "  Spoke instance directories cleaned"
    elif [ "$target_type" = "spoke" ] && [ -n "$target_instance" ]; then
        local instance_lower=$(echo "$target_instance" | tr '[:upper:]' '[:lower:]')
        local spoke_instance_dir="${DIVE_ROOT}/instances/${instance_lower}"
        if [ -d "$spoke_instance_dir" ]; then
            log_verbose "  Removing instance directory: ${instance_lower}/"

            # Step 1: Clear macOS extended attributes and immutable flags
            log_verbose "    Clearing macOS extended attributes and flags..."
            xattr -rc "$spoke_instance_dir" 2>/dev/null || true
            chflags -R nouchg "$spoke_instance_dir" 2>/dev/null || true
            chmod -R u+w "$spoke_instance_dir" 2>/dev/null || true

            # Step 2: Try Docker alpine container for root-owned files (if Docker available)
            if command -v ${DOCKER_CMD:-docker} &> /dev/null; then
                if ${DOCKER_CMD:-docker} info &> /dev/null 2>&1; then
                    log_verbose "    Using Docker alpine to clean root-owned files..."
                    ${DOCKER_CMD:-docker} run --rm -v "$spoke_instance_dir:/target" alpine sh -c "rm -rf /target/* /target/.*" 2>/dev/null || true
                fi
            fi

            # Step 3: Direct removal (should work now)
            if rm -rf "$spoke_instance_dir" 2>/dev/null; then
                log_verbose "    ✓ Instance directory removed"
            else
                log_warn "Could not remove ${instance_lower}/ (macOS SIP or ACL restriction)"
                log_info "Manual cleanup: sudo rm -rf $spoke_instance_dir"
            fi
        fi
    fi

    # =========================================================================
    # VAULT-DERIVED CERTIFICATE CLEANUP
    # =========================================================================
    # When Vault is nuked (volumes destroyed), the PKI hierarchy is gone.
    # All derived cert artifacts must be invalidated so the next deploy
    # regenerates them from the new PKI. This is the SSOT principle:
    # destroy the source → invalidate all derivatives.
    if [ "$target_type" = "hub" ] || [ "$target_type" = "all" ]; then
        log_verbose "  Cleaning Vault-derived certificate artifacts..."

        # Vault PKI CA chain (issuance artifact written by _vault_pki_issue_cert)
        rm -rf "${DIVE_ROOT}/certs/vault-pki" 2>/dev/null || true

        # Combined CA trust bundle (derived from Vault PKI + mkcert)
        rm -rf "${DIVE_ROOT}/certs/ca-bundle" 2>/dev/null || true

        # Hub instance certs (issued by Vault PKI)
        rm -rf "${DIVE_ROOT}/instances/hub/certs" 2>/dev/null || true

        # Vault bootstrap CA (used for Vault node TLS before PKI exists)
        rm -rf "${DIVE_ROOT}/certs/vault-bootstrap-ca" 2>/dev/null || true

        # Vault token files (tokens reference destroyed Vault instance)
        rm -f "${DIVE_ROOT}/.vault-token" 2>/dev/null || true
        rm -f "${DIVE_ROOT}/.vault-init.txt" 2>/dev/null || true

        log_verbose "    ✓ Vault-derived certs, CA bundle, and tokens cleaned"
    fi

    if [ "$target_type" = "spoke" ] && [ -n "$target_instance" ]; then
        local cert_instance_lower=$(echo "$target_instance" | tr '[:upper:]' '[:lower:]')
        local spoke_cert_dir="${DIVE_ROOT}/instances/${cert_instance_lower}/certs"
        if [ -d "$spoke_cert_dir" ]; then
            rm -rf "$spoke_cert_dir" 2>/dev/null || true
            log_verbose "    ✓ Spoke ${target_instance^^} certs cleaned"
        fi
    fi

    # =========================================================================
    # CLEAN SLATE: Additional cleanup for full reset (target_type=all)
    # =========================================================================
    if [ "$target_type" = "all" ]; then
        log_verbose "  Cleaning orchestration state..."

        # Orchestration SQLite database
        if [ -f "${DIVE_ROOT}/.dive-orch.db" ]; then
            rm -f "${DIVE_ROOT}/.dive-orch.db"
            log_verbose "    ✓ Orchestration database removed (.dive-orch.db)"
        fi

        # State directory (file-based state)
        if [ -d "${DIVE_ROOT}/.dive-state" ]; then
            rm -rf "${DIVE_ROOT}/.dive-state"
            log_verbose "    ✓ State directory removed (.dive-state/)"
        fi

        # Legacy state files
        rm -f "${DIVE_ROOT}/.dive-deployment-state" 2>/dev/null || true
        rm -f "${DIVE_ROOT}/.dive-federation-state" 2>/dev/null || true

        # Docker builder cache (only with --deep flag to avoid slow operations)
        if [ "$deep_clean" = true ]; then
            log_verbose "  Deep clean: Pruning Docker builder cache..."
            local cache_freed
            cache_freed=$(${DOCKER_CMD:-docker} builder prune -af 2>&1 | grep -i "reclaimed" || echo "0B reclaimed")
            log_verbose "    ✓ Builder cache pruned ($cache_freed)"
        fi

        log_verbose "  Clean slate complete"
    fi
}

##
# Verify nuke completion
# Uses global variables: container_patterns, volume_patterns, network_patterns,
#                        scope_description
# Checks for remaining resources and reports success/warnings
##
_nuke_verify_clean() {
    local remaining_containers=0
    local remaining_volumes=0
    local remaining_networks=0
    local final_containers=""
    local final_volumes=""
    local final_networks=""

    if [ -n "$container_patterns" ]; then
        while IFS=$'\t' read -r c_id c_name; do
            [ -z "$c_id" ] && continue
            if echo "$c_name" | grep -qE "$container_patterns"; then
                final_containers="$final_containers $c_id"
            fi
        done <<< "$(docker ps -a --format '{{.ID}}\t{{.Names}}' 2>/dev/null)"
        remaining_containers=$(echo $final_containers | wc -w | tr -d ' ')
    fi

    if [ -n "$volume_patterns" ]; then
        for v in $(docker volume ls -q 2>/dev/null); do
            if echo "$v" | grep -qE "$volume_patterns"; then
                final_volumes="$final_volumes $v"
            fi
        done
        remaining_volumes=$(echo $final_volumes | wc -w | tr -d ' ')
    fi

    if [ -n "$network_patterns" ]; then
        for n in $(docker network ls --format '{{.Name}}' 2>/dev/null); do
            if [[ "$n" == "bridge" || "$n" == "host" || "$n" == "none" || "$n" == "ingress" || "$n" == "docker_gwbridge" ]]; then
                continue
            fi
            if echo "$n" | grep -qE "$network_patterns"; then
                final_networks="$final_networks $n"
            fi
        done
        remaining_networks=$(echo $final_networks | wc -w | tr -d ' ')
    fi

    echo ""
    if [ "$remaining_containers" -eq 0 ] && [ "$remaining_volumes" -eq 0 ] && [ "$remaining_networks" -eq 0 ]; then
        echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║  ✅ TARGET CLEAN                                                     ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    else
        echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${YELLOW}║  ⚠️  SOME TARGET RESOURCES REMAIN                                     ║${NC}"
        echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo "  Remaining for this target:"
        [ "$remaining_containers" -gt 0 ] && echo "    - Containers: $remaining_containers ($final_containers)"
        [ "$remaining_volumes" -gt 0 ] && echo "    - Volumes: $remaining_volumes ($final_volumes)"
        [ "$remaining_networks" -gt 0 ] && echo "    - Networks: $remaining_networks ($final_networks)"
        echo ""
        if [ "$target_type" = "all" ]; then
            echo "  Run with --deep for more aggressive cleanup: ./dive nuke all --confirm --deep"
        else
            echo "  Re-run the same nuke command or use: ./dive nuke all --confirm"
        fi
    fi
}

export DIVE_NUKE_CLEANUP_LOADED=1
