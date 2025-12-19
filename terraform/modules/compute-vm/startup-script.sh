#!/bin/bash
# =============================================================================
# DIVE V3 - VM Startup Script
# =============================================================================
# This script runs on VM boot to install Docker, required tools, and
# configure the environment for DIVE V3 deployments.
#
# Logs: /var/log/startup-script.log
# Status: /opt/dive-v3/.startup-complete
# =============================================================================

set -e

LOGFILE="/var/log/dive-startup.log"
exec > >(tee -a "$LOGFILE") 2>&1

echo "=========================================="
echo "DIVE V3 Startup Script"
echo "Started: $(date)"
echo "=========================================="

# -----------------------------------------------------------------------------
# System Updates
# -----------------------------------------------------------------------------
echo "[1/8] Updating system packages..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -yq

# -----------------------------------------------------------------------------
# Install Required Packages
# -----------------------------------------------------------------------------
echo "[2/8] Installing required packages..."
DEBIAN_FRONTEND=noninteractive apt-get install -yq \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    jq \
    git \
    unzip \
    htop \
    netcat-openbsd \
    openssl \
    python3-pip

# -----------------------------------------------------------------------------
# Install Docker
# -----------------------------------------------------------------------------
echo "[3/8] Installing Docker..."

# Add Docker's official GPG key
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
fi

# Add Docker repository
if [ ! -f /etc/apt/sources.list.d/docker.list ]; then
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
        $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
fi

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -yq \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

# Enable and start Docker
systemctl enable docker
systemctl start docker

# Add ubuntu user to docker group
usermod -aG docker ubuntu

# -----------------------------------------------------------------------------
# Install Google Cloud SDK
# -----------------------------------------------------------------------------
echo "[4/8] Installing Google Cloud SDK..."

if ! command -v gcloud &> /dev/null; then
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee /etc/apt/sources.list.d/google-cloud-sdk.list
    apt-get update -qq && apt-get install -yq google-cloud-cli
fi

# -----------------------------------------------------------------------------
# Configure Docker for Artifact Registry
# -----------------------------------------------------------------------------
echo "[5/8] Configuring Docker for Artifact Registry..."

# Configure gcloud credential helper for Docker
gcloud auth configure-docker us-east4-docker.pkg.dev --quiet 2>/dev/null || true

# -----------------------------------------------------------------------------
# Create DIVE V3 Directory
# -----------------------------------------------------------------------------
echo "[6/8] Creating DIVE V3 directory..."

mkdir -p /opt/dive-v3
chown ubuntu:ubuntu /opt/dive-v3

# Clone or update repository (if accessible)
if [ -d /opt/dive-v3/.git ]; then
    echo "Updating existing repository..."
    cd /opt/dive-v3
    sudo -u ubuntu git pull origin main 2>/dev/null || echo "Git pull failed (may be private repo)"
else
    echo "Repository will be synced via ./dive pilot sync"
fi

# -----------------------------------------------------------------------------
# Create Helper Scripts
# -----------------------------------------------------------------------------
echo "[7/8] Creating helper scripts..."

# Health check script
cat > /opt/dive-v3/health-check.sh << 'HEALTH_EOF'
#!/bin/bash
# DIVE V3 Health Check Script

HEALTHY=true
RESULTS=()

check_service() {
    local name="$1"
    local url="$2"
    local timeout="${3:-10}"
    
    if curl -sfk --max-time "$timeout" "$url" >/dev/null 2>&1; then
        RESULTS+=("{\"name\":\"$name\",\"healthy\":true}")
    else
        RESULTS+=("{\"name\":\"$name\",\"healthy\":false}")
        HEALTHY=false
    fi
}

# Check Hub services
check_service "hub-keycloak" "https://localhost:8443/realms/master"
check_service "hub-backend" "https://localhost:4000/health"
check_service "hub-frontend" "http://localhost:3000"

# Check Spoke services (if configured)
if [ -f /opt/dive-v3/.env ]; then
    SPOKE_KC_PORT=$(grep SPOKE_KEYCLOAK_HTTPS_PORT /opt/dive-v3/.env | cut -d= -f2)
    SPOKE_API_PORT=$(grep SPOKE_BACKEND_PORT /opt/dive-v3/.env | cut -d= -f2)
    SPOKE_APP_PORT=$(grep SPOKE_FRONTEND_PORT /opt/dive-v3/.env | cut -d= -f2)
    
    if [ -n "$SPOKE_KC_PORT" ]; then
        check_service "spoke-keycloak" "https://localhost:${SPOKE_KC_PORT}/realms/master"
        check_service "spoke-backend" "https://localhost:${SPOKE_API_PORT}/health"
        check_service "spoke-frontend" "http://localhost:${SPOKE_APP_PORT}"
    fi
fi

# Get system metrics
UPTIME=$(uptime -p)
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}')
MEMORY_USAGE=$(free -m | awk 'NR==2 {printf "%.1f%%", $3/$2*100}')
CPU_LOAD=$(cat /proc/loadavg | awk '{print $1}')

# Output JSON
echo "{"
echo "  \"status\": $(if $HEALTHY; then echo '\"healthy\"'; else echo '\"unhealthy\"'; fi),"
echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
echo "  \"uptime\": \"$UPTIME\","
echo "  \"disk_usage\": \"$DISK_USAGE\","
echo "  \"memory_usage\": \"$MEMORY_USAGE\","
echo "  \"cpu_load\": \"$CPU_LOAD\","
echo "  \"services\": ["
echo "    $(IFS=,; echo "${RESULTS[*]}")"
echo "  ]"
echo "}"

if $HEALTHY; then exit 0; else exit 1; fi
HEALTH_EOF

chmod +x /opt/dive-v3/health-check.sh

# Secrets loader script
cat > /opt/dive-v3/load-secrets.sh << 'SECRETS_EOF'
#!/bin/bash
# DIVE V3 Secrets Loader
# Loads secrets from GCP Secret Manager

set -e

PROJECT_ID="${GCP_PROJECT_ID:-dive25}"
INSTANCE="${1:-usa}"
INSTANCE_UPPER="${INSTANCE^^}"

echo "Loading secrets for instance: $INSTANCE_UPPER"

# Function to get secret
get_secret() {
    local secret_name="$1"
    local env_var="$2"
    local value
    
    value=$(gcloud secrets versions access latest --secret="$secret_name" --project="$PROJECT_ID" 2>/dev/null) || {
        echo "Warning: Could not load $secret_name" >&2
        return 1
    }
    
    export "$env_var=$value"
    echo "  Loaded: $env_var"
}

# Load instance-specific secrets
get_secret "dive-v3-postgres-${INSTANCE}" "POSTGRES_PASSWORD" || true
get_secret "dive-v3-keycloak-${INSTANCE}" "KEYCLOAK_ADMIN_PASSWORD" || true
get_secret "dive-v3-mongodb-${INSTANCE}" "MONGO_PASSWORD" || true
get_secret "dive-v3-auth-secret-${INSTANCE}" "AUTH_SECRET" || true
get_secret "dive-v3-redis-blacklist" "REDIS_PASSWORD_BLACKLIST" || true
get_secret "dive-v3-keycloak-client-secret" "KEYCLOAK_CLIENT_SECRET" || true

echo "Secrets loaded successfully"
SECRETS_EOF

chmod +x /opt/dive-v3/load-secrets.sh

# -----------------------------------------------------------------------------
# Mark Startup Complete
# -----------------------------------------------------------------------------
echo "[8/8] Marking startup complete..."

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /opt/dive-v3/.startup-complete
chown ubuntu:ubuntu /opt/dive-v3/.startup-complete

echo "=========================================="
echo "DIVE V3 Startup Script Complete"
echo "Finished: $(date)"
echo "=========================================="

# Verify Docker is running
docker version
docker compose version

echo ""
echo "VM is ready for DIVE V3 deployment!"
echo "Next steps:"
echo "  1. Sync code: ./dive --env gcp pilot sync"
echo "  2. Start services: ./dive --env gcp pilot up"

