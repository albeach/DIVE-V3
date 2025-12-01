#!/bin/bash
# DIVE V3 SSH Helper for Remote Instances
# Provides consistent, non-interactive SSH access to remote federation partners
#
# Usage:
#   source scripts/remote/ssh-helper.sh
#   ssh_remote deu "docker ps"
#   rsync_remote deu local_path remote_path

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# sshpass location (project-local)
SSHPASS="$PROJECT_ROOT/bin/sshpass"

# SSH options for reliable non-interactive connections
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PubkeyAuthentication=no -o PreferredAuthentications=password -o ConnectTimeout=30 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o LogLevel=ERROR"

# Get remote instance configuration
# P0 Fix (Dec 2025): Passwords now fetched from GCP Secret Manager for security
get_remote_config() {
    local instance="$1"
    local field="$2"
    
    case "$instance" in
        deu)
            case "$field" in
                host) echo "mike@192.168.42.120" ;;
                password) 
                    # Fetch from GCP Secret Manager (persistent, secure)
                    local secret=$(gcloud secrets versions access latest --secret=dive-v3-ssh-deu --project=dive25 2>/dev/null)
                    if [ -n "$secret" ]; then
                        echo "$secret"
                    else
                        # Fallback for local development without GCP access
                        echo "${SSH_DEU_PASSWORD:-}" 
                    fi
                    ;;
                dir) echo "/opt/dive-v3" ;;
                domain) echo "prosecurity.biz" ;;
            esac
            ;;
        *)
            echo ""
            return 1
            ;;
    esac
}

# Helper function: Execute command on remote instance
ssh_remote() {
    local instance="$1"
    shift
    local cmd="$*"
    
    local host=$(get_remote_config "$instance" "host")
    local password=$(get_remote_config "$instance" "password")
    
    if [ -z "$host" ]; then
        echo "Error: Unknown instance '$instance'" >&2
        echo "Available instances: deu" >&2
        return 1
    fi
    
    "$SSHPASS" -p "$password" ssh $SSH_OPTS "$host" "$cmd"
}

# Helper function: Execute sudo command on remote instance
# Usage: sudo_remote deu "mkdir -p /opt/dive-v3/keycloak/themes"
sudo_remote() {
    local instance="$1"
    shift
    local cmd="$*"
    
    local host=$(get_remote_config "$instance" "host")
    local password=$(get_remote_config "$instance" "password")
    
    if [ -z "$host" ]; then
        echo "Error: Unknown instance '$instance'" >&2
        return 1
    fi
    
    # Pipe password to sudo -S for non-interactive sudo
    "$SSHPASS" -p "$password" ssh $SSH_OPTS "$host" "echo '$password' | sudo -S $cmd"
}

# Helper function: Rsync to remote instance
rsync_remote() {
    local instance="$1"
    local local_path="$2"
    local remote_path="$3"
    
    local host=$(get_remote_config "$instance" "host")
    local password=$(get_remote_config "$instance" "password")
    
    if [ -z "$host" ]; then
        echo "Error: Unknown instance '$instance'" >&2
        return 1
    fi
    
    echo "Transfer starting: $(find "$local_path" -type f | wc -l | tr -d ' ') files"
    "$SSHPASS" -p "$password" rsync -avz -e "ssh $SSH_OPTS" "$local_path" "$host:$remote_path"
}

# Helper function: Get remote project directory
get_remote_dir() {
    local instance="$1"
    get_remote_config "$instance" "dir"
}

# Helper function: Get remote domain
get_remote_domain() {
    local instance="$1"
    get_remote_config "$instance" "domain"
}

# Helper function: Sync Keycloak themes to remote instance
# Usage: sync_themes deu
sync_themes() {
    local instance="$1"
    local remote_dir=$(get_remote_config "$instance" "dir")
    local password=$(get_remote_config "$instance" "password")
    
    if [ -z "$remote_dir" ]; then
        echo "Error: Unknown instance '$instance'" >&2
        return 1
    fi
    
    echo "=== Syncing Keycloak themes to $instance ==="
    
    # 1. Create tar archive locally (avoids macOS extended attributes issues)
    local tmp_archive="/tmp/dive-v3-themes-$(date +%s).tar.gz"
    echo "Creating archive..."
    tar -czf "$tmp_archive" -C "$PROJECT_ROOT/keycloak/themes" dive-v3
    
    # 2. Transfer archive to remote
    echo "Transferring to $instance..."
    rsync_remote "$instance" "$tmp_archive" "/tmp/"
    
    # 3. Extract on remote with sudo
    echo "Installing themes on $instance..."
    sudo_remote "$instance" "mkdir -p $remote_dir/keycloak/themes"
    sudo_remote "$instance" "rm -rf $remote_dir/keycloak/themes/dive-v3.bak 2>/dev/null; mv $remote_dir/keycloak/themes/dive-v3 $remote_dir/keycloak/themes/dive-v3.bak 2>/dev/null || true"
    sudo_remote "$instance" "tar -xzf /tmp/$(basename $tmp_archive) -C $remote_dir/keycloak/themes/"
    sudo_remote "$instance" "chown -R 1000:1000 $remote_dir/keycloak/themes/dive-v3"
    
    # 4. Restart Keycloak to apply changes
    echo "Restarting Keycloak on $instance..."
    ssh_remote "$instance" "docker restart dive-v3-keycloak-$instance"
    
    # 5. Cleanup
    rm -f "$tmp_archive"
    ssh_remote "$instance" "rm -f /tmp/dive-v3-themes-*.tar.gz"
    
    echo "✅ Theme sync complete for $instance"
}

# Helper function: Restart services on remote instance
# Usage: restart_services deu [service...]
restart_services() {
    local instance="$1"
    shift
    local services="${*:-keycloak frontend backend cloudflared}"
    
    echo "=== Restarting services on $instance ==="
    for svc in $services; do
        echo "Restarting dive-v3-${svc}-${instance}..."
        ssh_remote "$instance" "docker restart dive-v3-${svc}-${instance}" 2>/dev/null || \
        ssh_remote "$instance" "docker restart dive-v3-${svc}" 2>/dev/null || \
        echo "  Warning: Could not restart $svc"
    done
    
    echo "Waiting for services to be healthy..."
    sleep 10
    ssh_remote "$instance" "docker ps --format '{{.Names}}: {{.Status}}' | grep -E 'keycloak|frontend|backend'"
}

# Helper function: Sync tunnel config from SSOT to remote instance
# Usage: sync_tunnel deu
# This regenerates the tunnel config from federation-registry.json and syncs to remote
sync_tunnel() {
    local instance="$1"
    local remote_dir=$(get_remote_config "$instance" "dir")
    
    if [ -z "$remote_dir" ]; then
        echo "Error: Unknown instance '$instance'" >&2
        return 1
    fi
    
    local registry_file="$PROJECT_ROOT/config/federation-registry.json"
    local generator="$PROJECT_ROOT/scripts/federation/generate-tunnel-configs.sh"
    
    echo "=== Syncing Cloudflare tunnel config to $instance (from SSOT) ==="
    
    # 1. Generate tunnel config from SSOT
    echo "  Step 1: Regenerating config from federation-registry.json..."
    if [ -x "$generator" ]; then
        "$generator" "$instance" || {
            echo "  ERROR: Failed to generate tunnel config"
            return 1
        }
    else
        echo "  ERROR: generate-tunnel-configs.sh not found at $generator"
        return 1
    fi
    
    # 2. Get config file path from registry
    local config_file=$(jq -r ".instances.${instance}.cloudflare.configFile // empty" "$registry_file")
    if [ -z "$config_file" ]; then
        echo "  ERROR: configFile not found for instance $instance in registry"
        return 1
    fi
    
    local local_config="$PROJECT_ROOT/$config_file"
    local remote_config="$remote_dir/$config_file"
    
    # 3. Transfer to remote
    echo "  Step 2: Transferring to $instance..."
    echo "    Local:  $local_config"
    echo "    Remote: $remote_config"
    
    sudo_remote "$instance" "mkdir -p $(dirname $remote_config)"
    rsync_remote "$instance" "$local_config" "$remote_config"
    
    # 4. Restart cloudflared
    echo "  Step 3: Restarting cloudflared..."
    ssh_remote "$instance" "docker restart cloudflared-${instance} 2>/dev/null || docker restart dive-v3-cloudflared-${instance} 2>/dev/null" || \
        echo "  Warning: Could not restart cloudflared"
    
    # 5. Verify tunnel is running
    sleep 5
    echo "  Step 4: Verifying tunnel status..."
    ssh_remote "$instance" "docker ps --format '{{.Names}}: {{.Status}}' | grep cloudflared"
    
    echo "✅ Tunnel config sync complete for $instance"
}

# Check if sshpass is available
check_ssh_prereqs() {
    if [ ! -x "$SSHPASS" ]; then
        echo "Error: sshpass not found at $SSHPASS" >&2
        echo "Run: cd /tmp && curl -L -O https://sourceforge.net/projects/sshpass/files/sshpass/1.09/sshpass-1.09.tar.gz && tar xf sshpass-1.09.tar.gz && cd sshpass-1.09 && ./configure && make && cp sshpass $PROJECT_ROOT/bin/" >&2
        return 1
    fi
    return 0
}

# Export functions if sourced
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    export -f ssh_remote 2>/dev/null || true
    export -f sudo_remote 2>/dev/null || true
    export -f rsync_remote 2>/dev/null || true
    export -f sync_themes 2>/dev/null || true
    export -f sync_tunnel 2>/dev/null || true
    export -f restart_services 2>/dev/null || true
    export -f get_remote_dir 2>/dev/null || true
    export -f get_remote_domain 2>/dev/null || true
    export -f check_ssh_prereqs 2>/dev/null || true
    export -f get_remote_config 2>/dev/null || true
fi
