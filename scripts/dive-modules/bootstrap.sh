#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Bootstrap Module — Auto-Install All Dependencies
# =============================================================================
# Detects missing tools and installs them. Fully idempotent — safe to run
# repeatedly. Supports Ubuntu 22/24, Amazon Linux 2023, and macOS (brew).
#
# Usage:
#   ./dive bootstrap              # Install all missing dependencies
#   ./dive bootstrap --full       # Also: system tuning, swap, firewall, user
#   ./dive bootstrap --check      # Dry-run — list what's missing without installing
#
# Called automatically by preflight when dependencies are missing.
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_BOOTSTRAP_LOADED:-}" ] && return 0
export DIVE_BOOTSTRAP_LOADED=1

# =============================================================================
# VERSION SSOT — override via environment
# =============================================================================
BOOTSTRAP_NODE_MAJOR="${BOOTSTRAP_NODE_MAJOR:-24}"
BOOTSTRAP_TERRAFORM_VERSION="${BOOTSTRAP_TERRAFORM_VERSION:-1.13.4}"
BOOTSTRAP_VAULT_VERSION="${BOOTSTRAP_VAULT_VERSION:-1.21.0}"
BOOTSTRAP_OPA_VERSION="${BOOTSTRAP_OPA_VERSION:-1.12.3}"
BOOTSTRAP_YQ_VERSION="${BOOTSTRAP_YQ_VERSION:-v4.44.6}"
BOOTSTRAP_MKCERT_VERSION="${BOOTSTRAP_MKCERT_VERSION:-v1.4.4}"

# =============================================================================
# OS / ARCH DETECTION
# =============================================================================
_bootstrap_detect_os() {
    [ -n "${BOOTSTRAP_OS:-}" ] && return 0
    case "$(uname -s)" in
        Darwin)
            export BOOTSTRAP_OS="darwin"
            ;;
        Linux)
            if [ -f /etc/os-release ]; then
                # shellcheck source=/dev/null
                . /etc/os-release
                case "$ID" in
                    ubuntu) export BOOTSTRAP_OS="ubuntu" ;;
                    amzn)   export BOOTSTRAP_OS="amzn" ;;
                    *)      export BOOTSTRAP_OS="linux-unknown" ;;
                esac
            else
                export BOOTSTRAP_OS="linux-unknown"
            fi
            ;;
        *)
            export BOOTSTRAP_OS="unknown"
            ;;
    esac
}

_bootstrap_detect_arch() {
    [ -n "${BOOTSTRAP_ARCH:-}" ] && return 0
    BOOTSTRAP_ARCH="$(uname -m)"
    case "$BOOTSTRAP_ARCH" in
        x86_64)  BOOTSTRAP_ARCH_ALT="amd64" ;;
        aarch64) BOOTSTRAP_ARCH_ALT="arm64" ;;
        arm64)   BOOTSTRAP_ARCH_ALT="arm64" ;;  # macOS
        *)       BOOTSTRAP_ARCH_ALT="amd64" ;;
    esac
    export BOOTSTRAP_ARCH BOOTSTRAP_ARCH_ALT
}

# Helper: run with sudo if not root
_bs_sudo() {
    if [ "$(id -u)" -eq 0 ]; then
        "$@"
    else
        sudo "$@"
    fi
}

# Helper: get the real (non-root) user — handles sudo, su, SSH
_bs_real_user() {
    if [ -n "${SUDO_USER:-}" ]; then
        echo "$SUDO_USER"
    elif [ -n "${LOGNAME:-}" ] && [ "$LOGNAME" != "root" ]; then
        echo "$LOGNAME"
    else
        whoami
    fi
}

# =============================================================================
# INDIVIDUAL INSTALL FUNCTIONS (all idempotent)
# =============================================================================

_bootstrap_system_packages() {
    _bootstrap_detect_os
    local need_install=false
    for cmd in jq curl openssl rsync git wget unzip; do
        command -v "$cmd" >/dev/null 2>&1 || { need_install=true; break; }
    done
    $need_install || return 0

    log_info "Installing system packages..."
    case "$BOOTSTRAP_OS" in
        ubuntu)
            export DEBIAN_FRONTEND=noninteractive
            echo iptables-persistent iptables-persistent/autosave_v4 boolean true | _bs_sudo debconf-set-selections 2>/dev/null || true
            echo iptables-persistent iptables-persistent/autosave_v6 boolean true | _bs_sudo debconf-set-selections 2>/dev/null || true
            _bs_sudo apt-get update -qq
            _bs_sudo apt-get install -y -qq \
                git jq curl wget unzip tar gzip openssl rsync \
                build-essential libnss3-tools \
                apt-transport-https ca-certificates gnupg lsb-release \
                iptables-persistent 2>/dev/null || true
            ;;
        amzn)
            _bs_sudo dnf update -y -q
            _bs_sudo dnf install -y -q \
                git jq curl wget unzip tar gzip openssl rsync \
                gcc-c++ make nss-tools iptables-services
            ;;
        darwin)
            if ! command -v brew >/dev/null 2>&1; then
                log_error "Homebrew required on macOS. Install: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
                return 1
            fi
            brew install jq curl openssl rsync git wget 2>/dev/null || true
            ;;
        *)
            log_error "Unsupported OS for auto-install: ${BOOTSTRAP_OS}"
            return 1
            ;;
    esac
    log_success "System packages installed"
}

_bootstrap_docker() {
    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        log_verbose "Docker already running: $(docker --version)"
        return 0
    fi

    _bootstrap_detect_os
    _bootstrap_detect_arch
    log_info "Installing Docker Engine..."

    case "$BOOTSTRAP_OS" in
        ubuntu)
            _bs_sudo install -m 0755 -d /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg | _bs_sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
            _bs_sudo chmod a+r /etc/apt/keyrings/docker.gpg
            echo "deb [arch=${BOOTSTRAP_ARCH_ALT} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
                | _bs_sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
            _bs_sudo apt-get update -qq
            _bs_sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        amzn)
            _bs_sudo dnf install -y -q docker
            ;;
        darwin)
            log_error "Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
            return 1
            ;;
        *)
            log_error "Unsupported OS for Docker auto-install: ${BOOTSTRAP_OS}"
            return 1
            ;;
    esac

    # Configure Docker daemon (Linux only)
    if [ "$BOOTSTRAP_OS" != "darwin" ]; then
        _bs_sudo mkdir -p /etc/docker
        _bs_sudo tee /etc/docker/daemon.json > /dev/null <<'DAEMON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "5" },
  "storage-driver": "overlay2",
  "default-ulimits": { "nofile": { "Name": "nofile", "Hard": 65536, "Soft": 65536 } },
  "metrics-addr": "127.0.0.1:9323",
  "experimental": false
}
DAEMON
        _bs_sudo systemctl enable docker
        _bs_sudo systemctl start docker

        # Add the real user (not root) to docker group
        local _real_user
        _real_user="$(_bs_real_user)"
        _bs_sudo usermod -aG docker "$_real_user" 2>/dev/null || true
        # Also add root if running under sudo (so docker works in this session)
        if [ "$(id -u)" -eq 0 ] && [ "$_real_user" != "root" ]; then
            _bs_sudo usermod -aG docker root 2>/dev/null || true
        fi
    fi

    # Make socket accessible for current session (group membership takes effect on next login)
    if [ -S /var/run/docker.sock ] && ! docker info >/dev/null 2>&1; then
        _bs_sudo chmod 666 /var/run/docker.sock
        log_verbose "Docker socket opened for current session (group membership applies on next login)"
    fi

    log_success "Docker installed: $(docker --version 2>/dev/null || echo 'pending group refresh')"
}

_bootstrap_compose() {
    if docker compose version >/dev/null 2>&1; then
        log_verbose "Docker Compose v2 available: $(docker compose version --short 2>/dev/null)"
        return 0
    fi

    _bootstrap_detect_arch
    log_info "Installing Docker Compose v2 plugin..."
    local compose_ver
    compose_ver=$(curl -sSL https://api.github.com/repos/docker/compose/releases/latest | jq -r '.tag_name' 2>/dev/null)
    [ -z "$compose_ver" ] && compose_ver="v2.32.4"

    _bs_sudo mkdir -p /usr/local/lib/docker/cli-plugins
    _bs_sudo curl -sSL "https://github.com/docker/compose/releases/download/${compose_ver}/docker-compose-linux-${BOOTSTRAP_ARCH}" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
    _bs_sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    log_success "Docker Compose installed: $(docker compose version --short 2>/dev/null)"
}

##
# Auto-detect and mount extra data volumes.
#
# Scenarios handled:
#   1. EC2: Separate EBS volume (NVMe/xvd) → format + mount to /data
#   2. Home server: Large root disk (>50GB free) → create /data dir on root
#   3. Home server: Separate data disk → format + mount to /data
#   4. macOS: No-op (Docker Desktop manages storage)
#
# The /data directory is used by Docker storage and large persistent data.
# If no separate volume exists and root has enough space, /data is just
# a directory on root (no separate mount needed).
##
_bootstrap_ebs_automount() {
    [ "$BOOTSTRAP_OS" = "darwin" ] && return 0
    mountpoint -q /data 2>/dev/null && { log_verbose "/data already mounted"; return 0; }

    # Find unmounted, unpartitioned block devices > 20GB
    local best_dev="" best_size=0
    local dev size
    for dev in /dev/nvme*n1 /dev/xvd[b-z] /dev/sd[b-z] /dev/vd[b-z]; do
        [ -b "$dev" ] || continue
        # Skip if device has partitions (likely root or OS disk)
        if lsblk -n "$dev" 2>/dev/null | grep -q part; then
            continue
        fi
        size=$(lsblk -b -dn -o SIZE "$dev" 2>/dev/null || echo 0)
        if [ "$size" -gt "$best_size" ] 2>/dev/null; then
            best_size=$size
            best_dev=$dev
        fi
    done

    if [ -n "$best_dev" ]; then
        local best_gb=$((best_size / 1073741824))
        if [ "$best_gb" -ge 20 ]; then
            log_info "Mounting data volume: $best_dev (${best_gb}GB) → /data"

            # Format only if no filesystem exists
            if ! blkid "$best_dev" 2>/dev/null | grep -q TYPE; then
                _bs_sudo mkfs.ext4 -F "$best_dev" >/dev/null 2>&1
            fi

            _bs_sudo mkdir -p /data
            _bs_sudo mount "$best_dev" /data

            # Persist in fstab (use UUID for reliability)
            local uuid
            uuid=$(blkid -s UUID -o value "$best_dev" 2>/dev/null || echo "")
            if [ -n "$uuid" ] && ! grep -q "$uuid" /etc/fstab 2>/dev/null; then
                echo "UUID=${uuid} /data ext4 defaults,nofail 0 2" | _bs_sudo tee -a /etc/fstab > /dev/null
            fi

            local real_user
            real_user=$(_bs_real_user 2>/dev/null || echo "ubuntu")
            _bs_sudo chown -R "${real_user}:${real_user}" /data

            log_success "Data volume mounted: $best_dev → /data (${best_gb}GB)"
            return 0
        fi
    fi

    # No separate data volume — check if root has enough space
    local root_avail_kb
    root_avail_kb=$(df -k / 2>/dev/null | tail -1 | awk '{print $4}')
    local root_avail_gb=$(( (root_avail_kb + 0) / 1048576 ))

    if [ "$root_avail_gb" -ge 50 ] 2>/dev/null; then
        # Root has enough space — just create /data on root filesystem
        _bs_sudo mkdir -p /data
        local real_user
        real_user=$(_bs_real_user 2>/dev/null || echo "ubuntu")
        _bs_sudo chown -R "${real_user}:${real_user}" /data
        log_info "Using root filesystem for /data (${root_avail_gb}GB available)"
    else
        log_verbose "No extra volume and root has ${root_avail_gb}GB free — /data not created"
    fi
}

_bootstrap_docker_storage() {
    [ "$BOOTSTRAP_OS" = "darwin" ] && return 0

    local data_mount=""
    if mountpoint -q /data 2>/dev/null; then
        data_mount="/data"
    elif [ -d /data ] && [ "$(df /data --output=target 2>/dev/null | tail -1)" != "/" ]; then
        data_mount="/data"
    fi
    [ -z "$data_mount" ] && return 0

    log_info "Configuring Docker + containerd storage on ${data_mount}..."
    local changed=0

    # Docker data-root
    local docker_data="${data_mount}/docker"
    if ! grep -q '"data-root"' /etc/docker/daemon.json 2>/dev/null; then
        _bs_sudo mkdir -p "$docker_data"
        _bs_sudo sed -i 's|^{|{\n  "data-root": "'"$docker_data"'",|' /etc/docker/daemon.json
        changed=1
    fi

    # Containerd root
    local ctrd_data="${data_mount}/containerd"
    local ctrd_conf="/etc/containerd/config.toml"
    _bs_sudo mkdir -p "$ctrd_data"
    if [ ! -f "$ctrd_conf" ] || ! grep -q "root = \"${ctrd_data}\"" "$ctrd_conf" 2>/dev/null; then
        _bs_sudo mkdir -p /etc/containerd
        if [ ! -f "$ctrd_conf" ]; then
            if command -v containerd >/dev/null 2>&1; then
                containerd config default | _bs_sudo tee "$ctrd_conf" > /dev/null
            else
                _bs_sudo tee "$ctrd_conf" > /dev/null <<CTRD
version = 2
root = "${ctrd_data}"
CTRD
            fi
        fi
        _bs_sudo sed -i "s|^root = .*|root = \"${ctrd_data}\"|" "$ctrd_conf"
        changed=1
    fi

    if [ "$changed" -eq 1 ]; then
        if [ -d /var/lib/containerd ] && [ ! -L /var/lib/containerd ]; then
            _bs_sudo systemctl stop docker containerd 2>/dev/null || true
            _bs_sudo rsync -a /var/lib/containerd/ "$ctrd_data/" 2>/dev/null || true
            _bs_sudo rm -rf /var/lib/containerd
            _bs_sudo ln -sf "$ctrd_data" /var/lib/containerd
        fi
        _bs_sudo systemctl restart containerd docker 2>/dev/null || true
        log_success "Docker storage relocated to ${data_mount}"
    fi
}

_bootstrap_node() {
    if command -v node >/dev/null 2>&1; then
        log_verbose "Node.js already installed: $(node --version)"
        return 0
    fi

    _bootstrap_detect_os
    if [ "$BOOTSTRAP_OS" = "darwin" ]; then
        brew install node@${BOOTSTRAP_NODE_MAJOR} 2>/dev/null || brew install node
        return $?
    fi

    log_info "Installing Node.js ${BOOTSTRAP_NODE_MAJOR} via nvm..."
    export NVM_DIR="${NVM_DIR:-/opt/nvm}"
    _bs_sudo mkdir -p "$NVM_DIR"
    _bs_sudo chown "$(_bs_real_user)" "$NVM_DIR"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
    nvm install "$BOOTSTRAP_NODE_MAJOR"
    nvm alias default "$BOOTSTRAP_NODE_MAJOR"
    nvm use default

    # System-wide symlinks
    _bs_sudo ln -sf "$NVM_DIR/versions/node/$(nvm current)/bin/node" /usr/local/bin/node
    _bs_sudo ln -sf "$NVM_DIR/versions/node/$(nvm current)/bin/npm" /usr/local/bin/npm
    _bs_sudo ln -sf "$NVM_DIR/versions/node/$(nvm current)/bin/npx" /usr/local/bin/npx
    log_success "Node.js installed: $(node --version)"
}

_bootstrap_mkcert() {
    if command -v mkcert >/dev/null 2>&1; then
        log_verbose "mkcert already installed"
        return 0
    fi

    _bootstrap_detect_os
    _bootstrap_detect_arch

    if [ "$BOOTSTRAP_OS" = "darwin" ]; then
        brew install mkcert && mkcert -install 2>/dev/null || true
        return 0
    fi

    log_info "Installing mkcert ${BOOTSTRAP_MKCERT_VERSION}..."
    local bin="mkcert-${BOOTSTRAP_MKCERT_VERSION}-linux-${BOOTSTRAP_ARCH_ALT}"
    curl -sSL "https://github.com/FiloSottile/mkcert/releases/download/${BOOTSTRAP_MKCERT_VERSION}/${bin}" -o /tmp/mkcert
    _bs_sudo install -m 0755 /tmp/mkcert /usr/local/bin/mkcert
    rm -f /tmp/mkcert
    mkcert -install 2>/dev/null || true
    log_success "mkcert installed"
}

_bootstrap_terraform() {
    if command -v terraform >/dev/null 2>&1; then
        log_verbose "Terraform already installed: $(terraform version -json 2>/dev/null | jq -r '.terraform_version' 2>/dev/null || terraform --version | head -1)"
        return 0
    fi

    _bootstrap_detect_os
    _bootstrap_detect_arch

    if [ "$BOOTSTRAP_OS" = "darwin" ]; then
        brew tap hashicorp/tap 2>/dev/null || true
        brew install hashicorp/tap/terraform
        return $?
    fi

    log_info "Installing Terraform ${BOOTSTRAP_TERRAFORM_VERSION}..."
    curl -sSL "https://releases.hashicorp.com/terraform/${BOOTSTRAP_TERRAFORM_VERSION}/terraform_${BOOTSTRAP_TERRAFORM_VERSION}_linux_${BOOTSTRAP_ARCH_ALT}.zip" -o /tmp/terraform.zip
    _bs_sudo unzip -o -q /tmp/terraform.zip -d /usr/local/bin/
    rm -f /tmp/terraform.zip
    _bs_sudo chmod +x /usr/local/bin/terraform
    log_success "Terraform ${BOOTSTRAP_TERRAFORM_VERSION} installed"
}

_bootstrap_vault() {
    if command -v vault >/dev/null 2>&1; then
        log_verbose "Vault CLI already installed: $(vault version 2>/dev/null)"
        return 0
    fi

    _bootstrap_detect_os
    _bootstrap_detect_arch

    if [ "$BOOTSTRAP_OS" = "darwin" ]; then
        brew tap hashicorp/tap 2>/dev/null || true
        brew install hashicorp/tap/vault
        return $?
    fi

    log_info "Installing Vault CLI ${BOOTSTRAP_VAULT_VERSION}..."
    curl -sSL "https://releases.hashicorp.com/vault/${BOOTSTRAP_VAULT_VERSION}/vault_${BOOTSTRAP_VAULT_VERSION}_linux_${BOOTSTRAP_ARCH_ALT}.zip" -o /tmp/vault.zip
    _bs_sudo unzip -o -q /tmp/vault.zip -d /usr/local/bin/
    rm -f /tmp/vault.zip
    _bs_sudo chmod +x /usr/local/bin/vault
    log_success "Vault CLI ${BOOTSTRAP_VAULT_VERSION} installed"
}

_bootstrap_opa() {
    if command -v opa >/dev/null 2>&1; then
        log_verbose "OPA already installed"
        return 0
    fi

    _bootstrap_detect_os
    _bootstrap_detect_arch

    if [ "$BOOTSTRAP_OS" = "darwin" ]; then
        brew install opa
        return $?
    fi

    log_info "Installing OPA CLI ${BOOTSTRAP_OPA_VERSION}..."
    local opa_arch="$BOOTSTRAP_ARCH_ALT"
    [ "$opa_arch" = "arm64" ] && opa_arch="arm64_static"
    curl -sSL "https://github.com/open-policy-agent/opa/releases/download/v${BOOTSTRAP_OPA_VERSION}/opa_linux_${opa_arch}" -o /tmp/opa
    _bs_sudo install -m 0755 /tmp/opa /usr/local/bin/opa
    rm -f /tmp/opa
    log_success "OPA CLI ${BOOTSTRAP_OPA_VERSION} installed"
}

_bootstrap_yq() {
    if command -v yq >/dev/null 2>&1; then
        log_verbose "yq already installed"
        return 0
    fi

    _bootstrap_detect_os
    _bootstrap_detect_arch

    if [ "$BOOTSTRAP_OS" = "darwin" ]; then
        brew install yq
        return $?
    fi

    log_info "Installing yq ${BOOTSTRAP_YQ_VERSION}..."
    curl -sSL "https://github.com/mikefarah/yq/releases/download/${BOOTSTRAP_YQ_VERSION}/yq_linux_${BOOTSTRAP_ARCH_ALT}" -o /tmp/yq
    _bs_sudo install -m 0755 /tmp/yq /usr/local/bin/yq
    rm -f /tmp/yq
    log_success "yq installed"
}

_bootstrap_awscli() {
    if command -v aws >/dev/null 2>&1; then
        log_verbose "AWS CLI already installed"
        return 0
    fi

    _bootstrap_detect_os
    _bootstrap_detect_arch

    if [ "$BOOTSTRAP_OS" = "darwin" ]; then
        brew install awscli
        return $?
    fi

    log_info "Installing AWS CLI v2..."
    local tmpdir
    tmpdir=$(mktemp -d)
    if [ "$BOOTSTRAP_ARCH" = "x86_64" ]; then
        curl -sSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "$tmpdir/awscli.zip"
    else
        curl -sSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "$tmpdir/awscli.zip"
    fi
    unzip -q "$tmpdir/awscli.zip" -d "$tmpdir"
    _bs_sudo "$tmpdir/aws/install" --update 2>/dev/null || true
    rm -rf "$tmpdir"
    log_success "AWS CLI installed"
}

_bootstrap_gcloud() {
    if command -v gcloud >/dev/null 2>&1; then
        log_verbose "gcloud CLI already installed"
        return 0
    fi

    _bootstrap_detect_os

    case "$BOOTSTRAP_OS" in
        darwin)
            brew install --cask google-cloud-sdk
            ;;
        ubuntu)
            log_info "Installing Google Cloud CLI..."
            _bs_sudo apt-get update -qq
            _bs_sudo apt-get install -y -qq apt-transport-https ca-certificates gnupg curl
            curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | _bs_sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg 2>/dev/null
            echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | _bs_sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list >/dev/null
            _bs_sudo apt-get update -qq
            _bs_sudo apt-get install -y -qq google-cloud-cli
            ;;
        amzn)
            log_info "Installing Google Cloud CLI..."
            _bs_sudo dnf install -y -q google-cloud-cli || {
                log_warn "google-cloud-cli package unavailable via dnf; attempting bundled installer"
                local tmpdir
                tmpdir=$(mktemp -d)
                local gcloud_ver="google-cloud-cli-543.0.0-linux-x86_64.tar.gz"
                curl -sSL "https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/${gcloud_ver}" -o "${tmpdir}/gcloud.tar.gz"
                _bs_sudo mkdir -p /opt
                _bs_sudo tar -C /opt -xzf "${tmpdir}/gcloud.tar.gz"
                _bs_sudo /opt/google-cloud-sdk/install.sh --quiet --usage-reporting=false --path-update=true --command-completion=true
                _bs_sudo ln -sf /opt/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud
                rm -rf "$tmpdir"
            }
            ;;
        *)
            log_error "Unsupported OS for gcloud auto-install: ${BOOTSTRAP_OS}"
            return 1
            ;;
    esac

    log_success "gcloud CLI installed"
}

_bootstrap_jdk() {
    if command -v keytool >/dev/null 2>&1 && command -v java >/dev/null 2>&1; then
        log_verbose "Java JDK already installed"
        return 0
    fi

    _bootstrap_detect_os

    case "$BOOTSTRAP_OS" in
        darwin)
            brew install openjdk
            ;;
        ubuntu)
            log_info "Installing Java JDK..."
            _bs_sudo apt-get update -qq
            _bs_sudo apt-get install -y -qq default-jdk
            ;;
        amzn)
            log_info "Installing Java JDK..."
            _bs_sudo dnf install -y -q java-21-amazon-corretto-devel
            ;;
        *)
            log_error "Unsupported OS for Java JDK auto-install: ${BOOTSTRAP_OS}"
            return 1
            ;;
    esac

    log_success "Java JDK installed"
}

# =============================================================================
# SYSTEM TUNING (--full mode only)
# =============================================================================
_bootstrap_system_tuning() {
    [ "$BOOTSTRAP_OS" = "darwin" ] && return 0

    log_info "Applying system tuning..."

    # File descriptors
    _bs_sudo tee /etc/security/limits.d/dive.conf > /dev/null <<'LIMITS'
*    soft    nofile    65536
*    hard    nofile    65536
LIMITS

    # Kernel tuning
    _bs_sudo tee /etc/sysctl.d/99-dive.conf > /dev/null <<'SYSCTL'
vm.overcommit_memory = 1
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
fs.inotify.max_user_watches = 524288
fs.inotify.max_user_instances = 512
SYSCTL
    _bs_sudo sysctl --system -q 2>/dev/null || true

    # Disable THP for MongoDB/Redis
    if [ -f /sys/kernel/mm/transparent_hugepage/enabled ]; then
        echo never | _bs_sudo tee /sys/kernel/mm/transparent_hugepage/enabled > /dev/null 2>&1 || true
        echo never | _bs_sudo tee /sys/kernel/mm/transparent_hugepage/defrag > /dev/null 2>&1 || true
    fi

    log_success "System tuning applied"
}

_bootstrap_swap() {
    [ "$BOOTSTRAP_OS" = "darwin" ] && return 0
    if swapon --show 2>/dev/null | grep -q '/swapfile'; then
        log_verbose "Swap already configured"
        return 0
    fi

    log_info "Creating 4GB swap..."
    _bs_sudo fallocate -l 4G /swapfile 2>/dev/null || _bs_sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 2>/dev/null
    _bs_sudo chmod 600 /swapfile
    _bs_sudo mkswap /swapfile >/dev/null
    _bs_sudo swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab 2>/dev/null; then
        echo '/swapfile none swap sw 0 0' | _bs_sudo tee -a /etc/fstab > /dev/null
    fi
    log_success "4GB swap configured"
}

_bootstrap_firewall() {
    [ "$BOOTSTRAP_OS" = "darwin" ] && return 0

    log_info "Configuring firewall rules..."
    for port in 22 80 443 3000 4000 8080 8443 9000 7002 8181 8200 8085; do
        _bs_sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || \
            _bs_sudo iptables -A INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || true
    done
    # Spoke port ranges
    _bs_sudo iptables -C INPUT -p tcp --dport 3000:3039 -j ACCEPT 2>/dev/null || \
        _bs_sudo iptables -A INPUT -p tcp --dport 3000:3039 -j ACCEPT 2>/dev/null || true
    _bs_sudo iptables -C INPUT -p tcp --dport 4000:4039 -j ACCEPT 2>/dev/null || \
        _bs_sudo iptables -A INPUT -p tcp --dport 4000:4039 -j ACCEPT 2>/dev/null || true
    _bs_sudo iptables -C INPUT -p tcp --dport 8443:8482 -j ACCEPT 2>/dev/null || \
        _bs_sudo iptables -A INPUT -p tcp --dport 8443:8482 -j ACCEPT 2>/dev/null || true
    log_success "Firewall rules applied"
}

_bootstrap_user_and_dirs() {
    local _real_user
    _real_user="$(_bs_real_user)"

    # Add the real user (not root) to docker group
    if [ "$BOOTSTRAP_OS" != "darwin" ]; then
        _bs_sudo usermod -aG docker "$_real_user" 2>/dev/null || true
    fi

    # Create required directories
    local _dirs=(
        "${DIVE_ROOT}/instances"
        "${DIVE_ROOT}/data"
        "${DIVE_ROOT}/certs"
        "${DIVE_ROOT}/.dive-state"
        "${DIVE_ROOT}/.dive-locks"
        "${DIVE_ROOT}/.dive-checkpoint"
    )
    for _dir in "${_dirs[@]}"; do
        _bs_sudo mkdir -p "$_dir" 2>/dev/null || true
    done

    # Ensure the real user owns the DIVE_ROOT tree (not root)
    if [ "$_real_user" != "root" ]; then
        _bs_sudo chown -R "$_real_user" "${DIVE_ROOT}" 2>/dev/null || true
    fi
}

# =============================================================================
# VERIFICATION
# =============================================================================
_bootstrap_verify() {
    log_info "Verifying dependencies..."
    local failed=0 total=0

    for cmd in docker git jq curl rsync openssl terraform vault yq aws gcloud mkcert keytool java; do
        total=$((total + 1))
        if command -v "$cmd" >/dev/null 2>&1; then
            log_verbose "  $cmd: OK"
        else
            log_error "  $cmd: MISSING"
            failed=$((failed + 1))
        fi
    done

    # Docker Compose (plugin, not standalone)
    total=$((total + 1))
    if docker compose version >/dev/null 2>&1; then
        log_verbose "  docker compose: OK"
    else
        log_error "  docker compose: MISSING"
        failed=$((failed + 1))
    fi

    # Optional tools (warn but don't fail)
    for cmd in node npm opa javac; do
        if command -v "$cmd" >/dev/null 2>&1; then
            log_verbose "  $cmd: OK"
        else
            log_warn "  $cmd: not found (optional)"
        fi
    done

    if [ "$failed" -eq 0 ]; then
        log_success "All $total required dependencies verified"
        return 0
    else
        log_error "$failed of $total required dependencies missing"
        return 1
    fi
}

# =============================================================================
# CHECK-ONLY MODE (no install, just report)
# =============================================================================
_bootstrap_check() {
    echo ""
    log_step "DIVE V3 Dependency Check"
    echo ""

    local missing=()
    local present=()

    for cmd in docker jq curl openssl rsync git terraform vault yq aws gcloud mkcert keytool java; do
        if command -v "$cmd" >/dev/null 2>&1; then
            present+=("$cmd")
        else
            missing+=("$cmd")
        fi
    done

    # Docker Compose
    if docker compose version >/dev/null 2>&1; then
        present+=("docker-compose-v2")
    else
        missing+=("docker-compose-v2")
    fi

    # Optional
    local optional_missing=()
    for cmd in node npm opa javac; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            optional_missing+=("$cmd")
        fi
    done

    echo "  Present:          ${present[*]:-none}"
    echo "  Missing:          ${missing[*]:-none}"
    echo "  Optional missing: ${optional_missing[*]:-none}"
    echo ""

    if [ ${#missing[@]} -eq 0 ]; then
        log_success "All required dependencies present"
        return 0
    else
        log_warn "${#missing[@]} required dependencies missing — run: ./dive bootstrap"
        return 1
    fi
}

# =============================================================================
# MAIN ENTRY POINT
# =============================================================================
cmd_bootstrap() {
    local full_mode=false
    local check_only=false

    while [ $# -gt 0 ]; do
        case "$1" in
            --full)  full_mode=true; shift ;;
            --check) check_only=true; shift ;;
            *)       shift ;;
        esac
    done

    if $check_only; then
        _bootstrap_check
        return $?
    fi

    echo ""
    echo "============================================================"
    echo "  DIVE V3 — Bootstrap Dependencies"
    echo "============================================================"
    echo ""

    _bootstrap_detect_os
    _bootstrap_detect_arch
    log_info "OS: ${BOOTSTRAP_OS}, Arch: ${BOOTSTRAP_ARCH} (${BOOTSTRAP_ARCH_ALT})"

    # Core tools (always)
    _bootstrap_system_packages
    _bootstrap_docker
    _bootstrap_compose
    _bootstrap_ebs_automount
    _bootstrap_docker_storage
    _bootstrap_node
    _bootstrap_mkcert
    _bootstrap_awscli
    _bootstrap_gcloud
    _bootstrap_jdk
    _bootstrap_terraform
    _bootstrap_vault
    _bootstrap_opa
    _bootstrap_yq
    _bootstrap_user_and_dirs

    # Full mode: system tuning, swap, firewall (typically for cloud instances)
    if $full_mode; then
        _bootstrap_system_tuning
        _bootstrap_swap
        _bootstrap_firewall
    fi

    # Verify
    echo ""
    _bootstrap_verify

    echo ""
    echo "============================================================"
    echo "  Bootstrap complete!"
    echo "============================================================"
    echo ""
    echo "  Next: ./dive hub deploy"
    echo ""
}
