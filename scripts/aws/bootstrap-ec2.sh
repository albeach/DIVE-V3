#!/usr/bin/env bash
# =============================================================================
# DIVE V3 — EC2 Bootstrap Script
# =============================================================================
# Installs all dependencies on a fresh EC2 instance (Amazon Linux 2023 or
# Ubuntu 24.04) so that the full hub-spoke stack can run via Docker Compose.
#
# Usage:
#   curl -sSL <raw-github-url>/scripts/aws/bootstrap-ec2.sh | bash
#   -- or --
#   ./scripts/aws/bootstrap-ec2.sh            # after cloning the repo
#
# Supports:
#   - Amazon Linux 2023 (al2023)
#   - Ubuntu 22.04 / 24.04
#
# What gets installed:
#   Docker Engine + Compose v2, Node.js 24 (via nvm), mkcert, jq, curl, git,
#   rsync, AWS CLI v2, Terraform 1.13.4, Vault CLI 1.21.0, OPA CLI 1.12.3
# =============================================================================
set -euo pipefail

# =============================================================================
# CONFIGURATION (override via environment)
# =============================================================================
DIVE_USER="${DIVE_USER:-dive}"
DIVE_DIR="${DIVE_DIR:-/opt/dive-v3}"
DIVE_REPO="${DIVE_REPO:-https://github.com/albeach/DIVE-V3.git}"
DIVE_BRANCH="${DIVE_BRANCH:-main}"
NODE_MAJOR="${NODE_MAJOR:-24}"
TERRAFORM_VERSION="${TERRAFORM_VERSION:-1.13.4}"
VAULT_VERSION="${VAULT_VERSION:-1.21.0}"
OPA_VERSION="${OPA_VERSION:-1.12.3}"

# =============================================================================
# HELPERS
# =============================================================================
log()  { echo -e "\033[0;32m[BOOTSTRAP]\033[0m $*"; }
warn() { echo -e "\033[1;33m[BOOTSTRAP]\033[0m $*"; }
err()  { echo -e "\033[0;31m[BOOTSTRAP]\033[0m $*" >&2; }
die()  { err "$@"; exit 1; }

detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        case "$ID" in
            amzn)  OS="amzn" ;;
            ubuntu) OS="ubuntu" ;;
            *)     die "Unsupported OS: $ID. Use Amazon Linux 2023 or Ubuntu 24.04." ;;
        esac
    else
        die "Cannot detect OS — /etc/os-release not found."
    fi
    log "Detected OS: $OS ($PRETTY_NAME)"
}

detect_arch() {
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64)  ARCH_ALT="amd64" ;;
        aarch64) ARCH_ALT="arm64" ;;
        *)       die "Unsupported architecture: $ARCH" ;;
    esac
    log "Architecture: $ARCH ($ARCH_ALT)"
}

# =============================================================================
# 1. SYSTEM PACKAGES
# =============================================================================
install_system_packages() {
    log "Installing system packages..."
    if [ "$OS" = "amzn" ]; then
        sudo dnf update -y -q
        sudo dnf install -y -q \
            git jq curl wget unzip tar gzip openssl rsync \
            gcc-c++ make nss-tools \
            iptables-services
    else
        export DEBIAN_FRONTEND=noninteractive
        # Pre-seed debconf to prevent interactive prompts from iptables-persistent
        echo iptables-persistent iptables-persistent/autosave_v4 boolean true | sudo debconf-set-selections
        echo iptables-persistent iptables-persistent/autosave_v6 boolean true | sudo debconf-set-selections
        sudo apt-get update -qq
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
            git jq curl wget unzip tar gzip openssl rsync \
            build-essential libnss3-tools \
            apt-transport-https ca-certificates gnupg lsb-release \
            iptables-persistent
    fi
    log "System packages installed."
}

# =============================================================================
# 2. DOCKER ENGINE + COMPOSE v2
# =============================================================================
install_docker() {
    if command -v docker >/dev/null 2>&1; then
        log "Docker already installed: $(docker --version)"
        return 0
    fi

    log "Installing Docker Engine..."
    if [ "$OS" = "amzn" ]; then
        sudo dnf install -y -q docker
        sudo systemctl enable docker
        sudo systemctl start docker
    else
        # Official Docker GPG + repo
        sudo install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        sudo chmod a+r /etc/apt/keyrings/docker.gpg
        echo \
          "deb [arch=${ARCH_ALT} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
          $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        sudo apt-get update -qq
        sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    fi

    # Docker daemon configuration
    sudo mkdir -p /etc/docker
    sudo tee /etc/docker/daemon.json > /dev/null <<'DAEMON'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  },
  "storage-driver": "overlay2",
  "default-ulimits": {
    "nofile": { "Name": "nofile", "Hard": 65536, "Soft": 65536 }
  },
  "metrics-addr": "127.0.0.1:9323",
  "experimental": false
}
DAEMON

    sudo systemctl restart docker
    log "Docker installed: $(docker --version)"
}

install_compose() {
    if docker compose version >/dev/null 2>&1; then
        log "Docker Compose v2 already available: $(docker compose version --short)"
        return 0
    fi

    log "Installing Docker Compose v2 plugin..."
    local compose_ver
    compose_ver=$(curl -sSL https://api.github.com/repos/docker/compose/releases/latest | jq -r '.tag_name')
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -sSL "https://github.com/docker/compose/releases/download/${compose_ver}/docker-compose-linux-${ARCH}" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    log "Docker Compose installed: $(docker compose version --short)"
}

# =============================================================================
# 3. NODE.JS (via nvm, for tooling — apps run inside Docker)
# =============================================================================
install_node() {
    if command -v node >/dev/null 2>&1; then
        log "Node.js already installed: $(node --version)"
        return 0
    fi

    log "Installing Node.js ${NODE_MAJOR} via nvm..."
    export NVM_DIR="/opt/nvm"
    sudo mkdir -p "$NVM_DIR"
    sudo chown "$(whoami)" "$NVM_DIR"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
    nvm install "$NODE_MAJOR"
    nvm alias default "$NODE_MAJOR"
    nvm use default

    # Make node available system-wide
    sudo ln -sf "$NVM_DIR/versions/node/$(nvm current)/bin/node" /usr/local/bin/node
    sudo ln -sf "$NVM_DIR/versions/node/$(nvm current)/bin/npm" /usr/local/bin/npm
    sudo ln -sf "$NVM_DIR/versions/node/$(nvm current)/bin/npx" /usr/local/bin/npx
    log "Node.js installed: $(node --version)"
}

# =============================================================================
# 4. mkcert (local CA for development TLS)
# =============================================================================
install_mkcert() {
    if command -v mkcert >/dev/null 2>&1; then
        log "mkcert already installed: $(mkcert --version)"
        return 0
    fi

    log "Installing mkcert..."
    local mkcert_ver="v1.4.4"
    local mkcert_bin="mkcert-${mkcert_ver}-linux-${ARCH_ALT}"
    curl -sSL "https://github.com/FiloSottile/mkcert/releases/download/${mkcert_ver}/${mkcert_bin}" \
        -o /tmp/mkcert
    sudo install -m 0755 /tmp/mkcert /usr/local/bin/mkcert
    rm -f /tmp/mkcert

    # Install local CA
    mkcert -install 2>/dev/null || true
    log "mkcert installed: $(mkcert --version)"
}

# =============================================================================
# 5. AWS CLI v2
# =============================================================================
install_awscli() {
    if command -v aws >/dev/null 2>&1; then
        log "AWS CLI already installed: $(aws --version)"
        return 0
    fi

    log "Installing AWS CLI v2..."
    local tmpdir
    tmpdir=$(mktemp -d)
    if [ "$ARCH" = "x86_64" ]; then
        curl -sSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "$tmpdir/awscli.zip"
    else
        curl -sSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "$tmpdir/awscli.zip"
    fi
    unzip -q "$tmpdir/awscli.zip" -d "$tmpdir"
    sudo "$tmpdir/aws/install" --update
    rm -rf "$tmpdir"
    log "AWS CLI installed: $(aws --version)"
}

# =============================================================================
# 6. TERRAFORM
# =============================================================================
install_terraform() {
    if command -v terraform >/dev/null 2>&1; then
        log "Terraform already installed: $(terraform version -json | jq -r '.terraform_version')"
        return 0
    fi

    log "Installing Terraform ${TERRAFORM_VERSION}..."
    local url="https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${ARCH_ALT}.zip"
    curl -sSL "$url" -o /tmp/terraform.zip
    sudo unzip -o -q /tmp/terraform.zip -d /usr/local/bin/
    rm -f /tmp/terraform.zip
    sudo chmod +x /usr/local/bin/terraform
    log "Terraform installed: $(terraform version -json | jq -r '.terraform_version')"
}

# =============================================================================
# 7. HASHICORP VAULT CLI
# =============================================================================
install_vault() {
    if command -v vault >/dev/null 2>&1; then
        log "Vault CLI already installed: $(vault version)"
        return 0
    fi

    log "Installing Vault CLI ${VAULT_VERSION}..."
    local url="https://releases.hashicorp.com/vault/${VAULT_VERSION}/vault_${VAULT_VERSION}_linux_${ARCH_ALT}.zip"
    curl -sSL "$url" -o /tmp/vault.zip
    sudo unzip -o -q /tmp/vault.zip -d /usr/local/bin/
    rm -f /tmp/vault.zip
    sudo chmod +x /usr/local/bin/vault
    log "Vault CLI installed: $(vault version)"
}

# =============================================================================
# 8. OPA CLI
# =============================================================================
install_opa() {
    if command -v opa >/dev/null 2>&1; then
        log "OPA CLI already installed: $(opa version | head -1)"
        return 0
    fi

    log "Installing OPA CLI ${OPA_VERSION}..."
    local opa_arch="$ARCH_ALT"
    [ "$opa_arch" = "arm64" ] && opa_arch="arm64_static"
    local url="https://github.com/open-policy-agent/opa/releases/download/v${OPA_VERSION}/opa_linux_${opa_arch}"
    curl -sSL "$url" -o /tmp/opa
    sudo install -m 0755 /tmp/opa /usr/local/bin/opa
    rm -f /tmp/opa
    log "OPA CLI installed: $(opa version | head -1)"
}

# =============================================================================
# 9. yq (YAML processor — required for parallel service startup)
# =============================================================================
install_yq() {
    if command -v yq >/dev/null 2>&1; then
        log "yq already installed: $(yq --version)"
        return 0
    fi

    log "Installing yq..."
    local yq_ver="v4.44.6"
    local url="https://github.com/mikefarah/yq/releases/download/${yq_ver}/yq_linux_${ARCH_ALT}"
    curl -sSL "$url" -o /tmp/yq
    sudo install -m 0755 /tmp/yq /usr/local/bin/yq
    rm -f /tmp/yq
    log "yq installed: $(yq --version)"
}

# =============================================================================
# 10. DIVE USER + REPO SETUP
# =============================================================================
setup_user_and_repo() {
    # Create dive user if not exists
    if ! id "$DIVE_USER" >/dev/null 2>&1; then
        log "Creating user: $DIVE_USER"
        sudo useradd -m -s /bin/bash "$DIVE_USER"
    fi

    # Add to docker group
    sudo usermod -aG docker "$DIVE_USER" 2>/dev/null || true

    # Add current user to docker group too
    sudo usermod -aG docker "$(whoami)" 2>/dev/null || true

    # Create project directory (may already exist if cloned by user-data shim)
    if [ ! -d "$DIVE_DIR/.git" ]; then
        log "Cloning DIVE V3 repository..."
        sudo mkdir -p "$DIVE_DIR"
        sudo chown "$DIVE_USER:$DIVE_USER" "$DIVE_DIR"
        sudo -u "$DIVE_USER" git clone --branch "$DIVE_BRANCH" "$DIVE_REPO" "$DIVE_DIR"
    else
        log "DIVE V3 directory exists, fixing ownership and pulling latest..."
        sudo chown -R "$DIVE_USER:$DIVE_USER" "$DIVE_DIR"
        sudo -u "$DIVE_USER" git -C "$DIVE_DIR" pull --ff-only origin "$DIVE_BRANCH" 2>/dev/null || true
    fi

    # Create required directories
    sudo -u "$DIVE_USER" mkdir -p \
        "$DIVE_DIR/instances" \
        "$DIVE_DIR/data" \
        "$DIVE_DIR/certs" \
        "$DIVE_DIR/.dive-state" \
        "$DIVE_DIR/.dive-locks" \
        "$DIVE_DIR/.dive-checkpoint"

    log "Repository ready at $DIVE_DIR"
}

# =============================================================================
# 10. SYSTEM TUNING
# =============================================================================
tune_system() {
    log "Applying system tuning..."

    # Increase file descriptors
    sudo tee /etc/security/limits.d/dive.conf > /dev/null <<'LIMITS'
*    soft    nofile    65536
*    hard    nofile    65536
dive soft    nofile    65536
dive hard    nofile    65536
LIMITS

    # Kernel tuning for Docker + MongoDB + Redis
    sudo tee /etc/sysctl.d/99-dive.conf > /dev/null <<'SYSCTL'
# VM overcommit for Redis background save
vm.overcommit_memory = 1

# Network tuning
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1

# Increase inotify watchers (for Node.js file watching)
fs.inotify.max_user_watches = 524288
fs.inotify.max_user_instances = 512

# Disable THP for MongoDB/Redis
SYSCTL
    sudo sysctl --system -q 2>/dev/null || true

    # Disable Transparent Huge Pages (THP) for MongoDB/Redis
    if [ -f /sys/kernel/mm/transparent_hugepage/enabled ]; then
        echo never | sudo tee /sys/kernel/mm/transparent_hugepage/enabled > /dev/null 2>&1 || true
        echo never | sudo tee /sys/kernel/mm/transparent_hugepage/defrag > /dev/null 2>&1 || true
    fi

    log "System tuning applied."
}

# =============================================================================
# 11. SWAP (important for t3.xlarge with lots of containers)
# =============================================================================
setup_swap() {
    if swapon --show | grep -q '/swapfile'; then
        log "Swap already configured."
        return 0
    fi

    log "Creating 4GB swap..."
    sudo fallocate -l 4G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile

    # Make persistent
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
    fi
    log "Swap configured: $(swapon --show)"
}

# =============================================================================
# 12. FIREWALL (open required ports for DIVE services)
# =============================================================================
configure_firewall() {
    log "Configuring firewall rules..."

    # Use iptables directly (works on both AL2023 and Ubuntu)
    # Allow SSH
    sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT 2>/dev/null || true

    # Caddy reverse proxy (HTTP + HTTPS)
    sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
    sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true

    # Hub services
    for port in 3000 4000 8080 8443 9000 7002 8181 8200 8085; do
        sudo iptables -A INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || true
    done

    # Spoke port range (offsets 0-39 from base ports)
    # Frontend: 3000-3039, Backend: 4000-4039, Keycloak: 8443-8482
    sudo iptables -A INPUT -p tcp --dport 3000:3039 -j ACCEPT 2>/dev/null || true
    sudo iptables -A INPUT -p tcp --dport 4000:4039 -j ACCEPT 2>/dev/null || true
    sudo iptables -A INPUT -p tcp --dport 8443:8482 -j ACCEPT 2>/dev/null || true

    log "Firewall rules applied."
}

# =============================================================================
# 13. VERIFICATION
# =============================================================================
verify_installation() {
    log "Verifying installation..."
    local failed=0

    for cmd in docker git jq curl rsync node npm terraform vault opa mkcert aws yq; do
        if command -v "$cmd" >/dev/null 2>&1; then
            log "  $cmd: OK"
        else
            err "  $cmd: MISSING"
            failed=$((failed + 1))
        fi
    done

    if docker compose version >/dev/null 2>&1; then
        log "  docker compose: OK"
    else
        err "  docker compose: MISSING"
        failed=$((failed + 1))
    fi

    # Check Docker is running
    if docker info >/dev/null 2>&1; then
        log "  docker daemon: RUNNING"
    else
        err "  docker daemon: NOT RUNNING"
        failed=$((failed + 1))
    fi

    echo ""
    if [ "$failed" -eq 0 ]; then
        log "All dependencies verified successfully!"
    else
        err "$failed dependencies missing — review output above."
        return 1
    fi
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    echo ""
    echo "============================================================"
    echo "  DIVE V3 — EC2 Bootstrap"
    echo "============================================================"
    echo ""

    detect_os
    detect_arch

    install_system_packages
    install_docker
    install_compose
    install_node
    install_mkcert
    install_awscli
    install_terraform
    install_vault
    install_opa
    install_yq
    setup_user_and_repo
    tune_system
    setup_swap
    configure_firewall
    verify_installation

    echo ""
    echo "============================================================"
    echo "  Bootstrap complete!"
    echo "============================================================"
    echo ""
    echo "  Project directory: $DIVE_DIR"
    echo "  User:              $DIVE_USER"
    echo ""
    echo "  Next steps:"
    echo "    cd $DIVE_DIR"
    echo "    ./dive hub deploy"
    echo ""
}

main "$@"
