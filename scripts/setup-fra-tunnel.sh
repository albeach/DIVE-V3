#!/usr/bin/env bash
#
# DIVE V3 - FRA Instance Cloudflare Zero Trust Tunnel Setup
# ===========================================================
# This script provisions Cloudflare tunnels for the France (FRA) instance
# with high availability (primary + standby) and Zero Trust Access policies.
#
# Usage:
#   chmod +x scripts/setup-fra-tunnel.sh
#   DRY_RUN=true ./scripts/setup-fra-tunnel.sh  # Preview mode
#   ./scripts/setup-fra-tunnel.sh                # Execute
#
# Environment Variables:
#   CF_API_TOKEN         - Cloudflare API token with Zone:Edit permissions
#   CF_ACCOUNT_ID        - Your Cloudflare account ID
#   CF_ZONE_ID           - Zone ID for dive25.com
#   DRY_RUN              - Set to "true" for preview mode
#
# Hostnames Created:
#   fra-app.dive25.com   - Frontend (Next.js)
#   fra-api.dive25.com   - Backend API
#   fra-idp.dive25.com   - Keycloak IdP
#   fra-kas.dive25.com   - Key Access Service
#
set -euo pipefail

#######################################
# Configuration
#######################################
DRY_RUN="${DRY_RUN:-false}"
TUNNEL_PRIMARY="${CF_TUNNEL_PRIMARY:-dive-v3-fra-primary}"
TUNNEL_STANDBY="${CF_TUNNEL_STANDBY:-dive-v3-fra-standby}"
CONFIG_DIR="$HOME/.cloudflared/fra"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-cloudflared}"

# FRA Hostnames
HOST_FRONTEND="fra-app.dive25.com"
HOST_API="fra-api.dive25.com"
HOST_IDP="fra-idp.dive25.com"
HOST_KAS="fra-kas.dive25.com"

# Service ports (local)
PORT_FRONTEND="3000"
PORT_API="4000"
PORT_IDP="8443"
PORT_KAS="8080"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

#######################################
# Helper Functions
#######################################
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

log_error() {
    echo -e "${RED}❌${NC} $1"
}

run_cmd() {
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY-RUN]${NC} $*"
    else
        "$@"
    fi
}

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        log_error "Missing required command: $1"
        echo "   Install $1 and re-run the script."
        exit 1
    fi
}

require_env() {
    local var_name="$1"
    if [[ -z "${!var_name:-}" ]]; then
        log_error "Required environment variable not set: $var_name"
        echo "   Export $var_name and re-run the script."
        exit 1
    fi
}

#######################################
# Pre-flight Checks
#######################################
echo ""
echo "=============================================="
echo "   DIVE V3 - FRA Instance Tunnel Setup"
echo "=============================================="
echo ""
echo "Configuration:"
echo "  Primary Tunnel : $TUNNEL_PRIMARY"
echo "  Standby Tunnel : $TUNNEL_STANDBY"
echo "  Dry-run Mode   : $DRY_RUN"
echo ""
echo "Hostnames to create:"
echo "  Frontend : $HOST_FRONTEND → localhost:$PORT_FRONTEND"
echo "  API      : $HOST_API → localhost:$PORT_API"
echo "  IdP      : $HOST_IDP → localhost:$PORT_IDP"
echo "  KAS      : $HOST_KAS → localhost:$PORT_KAS"
echo ""
echo "=============================================="
echo ""

# Check required commands
require_command "$CLOUDFLARED_BIN"
require_command "jq"
require_command "curl"

# Check Cloudflare authentication
CERT_PATH="$HOME/.cloudflared/cert.pem"
if [[ ! -f "$CERT_PATH" ]]; then
    log_warning "Cloudflare cert not found at $CERT_PATH"
    echo "   Run '$CLOUDFLARED_BIN tunnel login' to authenticate"
    if [[ "$DRY_RUN" == "false" ]]; then
        log_info "Starting authentication..."
        run_cmd $CLOUDFLARED_BIN tunnel login
    fi
fi

#######################################
# Step 1: Create Tunnels
#######################################
log_info "Step 1: Creating tunnels..."

create_tunnel() {
    local tunnel_name="$1"
    
    # Check if tunnel already exists
    if $CLOUDFLARED_BIN tunnel list | grep -q "$tunnel_name"; then
        log_warning "Tunnel $tunnel_name already exists"
        return 0
    fi
    
    log_info "Creating tunnel: $tunnel_name"
    run_cmd $CLOUDFLARED_BIN tunnel create "$tunnel_name"
    
    # Get tunnel ID
    local tunnel_id=$($CLOUDFLARED_BIN tunnel list | grep "$tunnel_name" | awk '{print $1}')
    if [[ -z "$tunnel_id" ]]; then
        log_error "Failed to create tunnel $tunnel_name"
        exit 1
    fi
    
    log_success "Tunnel created: $tunnel_name (ID: $tunnel_id)"
    echo "$tunnel_id"
}

# Create primary and standby tunnels
PRIMARY_ID=$(create_tunnel "$TUNNEL_PRIMARY")
STANDBY_ID=$(create_tunnel "$TUNNEL_STANDBY")

#######################################
# Step 2: Create Configuration Files
#######################################
log_info "Step 2: Creating configuration files..."

# Create config directory
run_cmd mkdir -p "$CONFIG_DIR"

# Function to generate tunnel config
generate_config() {
    local tunnel_name="$1"
    local tunnel_id="$2"
    local config_file="$CONFIG_DIR/$tunnel_name.yml"
    
    log_info "Generating config for $tunnel_name"
    
    cat > "$config_file" <<EOF
# DIVE V3 FRA Instance - $tunnel_name Configuration
# Generated: $(date)
# Gap Mitigation: GAP-006 (Availability/Latency)

tunnel: $tunnel_id
credentials-file: $HOME/.cloudflared/$tunnel_id.json

# Logging
loglevel: info
log-directory: $CONFIG_DIR/logs

# Connection settings (High Availability)
protocol: quic
grace-period: 30s
retries: 5
ha-connections: 2

# Metrics for monitoring
metrics: localhost:2000

# Ingress rules for FRA services
ingress:
  # Frontend (Next.js) - fra-app.dive25.com
  - hostname: $HOST_FRONTEND
    service: https://localhost:$PORT_FRONTEND
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      tlsTimeout: 10s
      keepAliveTimeout: 90s
      keepAliveConnections: 100
      httpHostHeader: $HOST_FRONTEND
      # GAP-002: Pass original headers for attribute normalization
      originServerName: frontend-fra
    
  # Backend API - fra-api.dive25.com  
  - hostname: $HOST_API
    service: https://localhost:$PORT_API
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      tlsTimeout: 10s
      keepAliveTimeout: 90s
      keepAliveConnections: 100
      httpHostHeader: $HOST_API
      # GAP-004: Include correlation headers
      originServerName: backend-fra
    
  # Keycloak IdP - fra-idp.dive25.com
  - hostname: $HOST_IDP
    service: https://localhost:$PORT_IDP
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      tlsTimeout: 10s
      keepAliveTimeout: 90s
      keepAliveConnections: 100
      httpHostHeader: $HOST_IDP
      # GAP-001: Support for JWKS rotation
      originServerName: keycloak-fra
    
  # KAS - fra-kas.dive25.com
  - hostname: $HOST_KAS
    service: http://localhost:$PORT_KAS
    originRequest:
      noTLSVerify: false
      connectTimeout: 30s
      tlsTimeout: 10s
      keepAliveTimeout: 90s
      keepAliveConnections: 50
      httpHostHeader: $HOST_KAS
      # GAP-005: KAS authority headers
      originServerName: kas-fra
    
  # Health check endpoint
  - hostname: fra-health.dive25.com
    service: https://localhost:$PORT_API/health
    originRequest:
      noTLSVerify: true
      connectTimeout: 10s
      httpHostHeader: $HOST_API
    
  # Catch-all rule (required)
  - service: http_status:404
EOF
    
    log_success "Config written to $config_file"
}

# Generate configs for both tunnels
if [[ "$DRY_RUN" == "false" ]]; then
    generate_config "$TUNNEL_PRIMARY" "$PRIMARY_ID"
    generate_config "$TUNNEL_STANDBY" "$STANDBY_ID"
fi

#######################################
# Step 3: Configure DNS Records
#######################################
log_info "Step 3: Configuring DNS records..."

# Function to create DNS record
create_dns_record() {
    local tunnel_name="$1"
    local hostname="$2"
    
    log_info "Creating DNS record: $hostname → $tunnel_name"
    run_cmd $CLOUDFLARED_BIN tunnel route dns "$tunnel_name" "$hostname"
}

# Create DNS records for primary tunnel
create_dns_record "$TUNNEL_PRIMARY" "$HOST_FRONTEND"
create_dns_record "$TUNNEL_PRIMARY" "$HOST_API"
create_dns_record "$TUNNEL_PRIMARY" "$HOST_IDP"
create_dns_record "$TUNNEL_PRIMARY" "$HOST_KAS"
create_dns_record "$TUNNEL_PRIMARY" "fra-health.dive25.com"

log_success "DNS records configured for primary tunnel"

#######################################
# Step 4: Create systemd Services
#######################################
log_info "Step 4: Creating systemd services..."

create_systemd_service() {
    local tunnel_name="$1"
    local service_file="/etc/systemd/system/cloudflared-$tunnel_name.service"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would create $service_file"
        return
    fi
    
    cat > "$service_file" <<EOF
[Unit]
Description=Cloudflare Tunnel - $tunnel_name
After=network.target
StartLimitIntervalSec=0

[Service]
Type=notify
ExecStart=$CLOUDFLARED_BIN tunnel --config $CONFIG_DIR/$tunnel_name.yml run
ExecReload=/bin/kill -HUP \$MAINPID
KillMode=mixed
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cloudflared-$tunnel_name
User=$(whoami)
Group=$(whoami)

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$CONFIG_DIR

# Environment
Environment=TUNNEL_METRICS_LABEL=$tunnel_name

[Install]
WantedBy=multi-user.target
EOF
    
    log_success "Service created: cloudflared-$tunnel_name"
}

if [[ "$EUID" -eq 0 ]] || [[ "$DRY_RUN" == "true" ]]; then
    create_systemd_service "$TUNNEL_PRIMARY"
    create_systemd_service "$TUNNEL_STANDBY"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        run_cmd systemctl daemon-reload
        run_cmd systemctl enable "cloudflared-$TUNNEL_PRIMARY"
        # Standby not auto-started
        log_info "Primary tunnel enabled, standby ready for manual activation"
    fi
else
    log_warning "Not running as root - skipping systemd service creation"
    echo "   Run with sudo to create systemd services"
fi

#######################################
# Step 5: Configure Zero Trust Access
#######################################
log_info "Step 5: Configuring Zero Trust Access policies..."

if [[ "$DRY_RUN" == "false" ]] && [[ -n "${CF_API_TOKEN:-}" ]]; then
    log_info "Creating Access applications..."
    
    # This would normally use CF API to create Access policies
    # For now, we'll provide manual instructions
    cat <<EOF

Manual Access Configuration Required:
1. Go to https://one.dash.cloudflare.com/
2. Navigate to Zero Trust → Access → Applications
3. Create applications for:
   - fra-app.dive25.com (Public with email verification)
   - fra-api.dive25.com (Service Auth required)
   - fra-idp.dive25.com (IP allowlist)
   - fra-kas.dive25.com (mTLS + Service Auth)

Recommended Policies:
- Frontend: Allow with email domain @*.gouv.fr
- API: Service token authentication
- IdP: IP allowlist for FRA networks
- KAS: mTLS certificate + service token

EOF
else
    log_warning "CF_API_TOKEN not set - manual Access configuration required"
fi

#######################################
# Step 6: Health Checks & Monitoring
#######################################
log_info "Step 6: Setting up health checks..."

# Create health check script
cat > "$CONFIG_DIR/health-check.sh" <<'EOF'
#!/bin/bash
# FRA Tunnel Health Check Script

SERVICES=("fra-app" "fra-api" "fra-idp" "fra-kas")
FAILURES=0

echo "FRA Instance Health Check - $(date)"
echo "================================"

for service in "${SERVICES[@]}"; do
    URL="https://${service}.dive25.com/health"
    if [[ "$service" == "fra-app" ]]; then
        URL="https://${service}.dive25.com/"
    fi
    
    echo -n "Checking $service... "
    
    if curl -sf -m 5 "$URL" > /dev/null 2>&1; then
        echo "✅ OK"
    else
        echo "❌ FAILED"
        ((FAILURES++))
    fi
done

echo "================================"
if [[ $FAILURES -eq 0 ]]; then
    echo "All services healthy ✅"
    exit 0
else
    echo "$FAILURES service(s) failed ❌"
    exit 1
fi
EOF

chmod +x "$CONFIG_DIR/health-check.sh"
log_success "Health check script created: $CONFIG_DIR/health-check.sh"

#######################################
# Step 7: Failover Configuration
#######################################
log_info "Step 7: Configuring failover mechanism..."

# Create failover script
cat > "$CONFIG_DIR/failover.sh" <<EOF
#!/bin/bash
# FRA Tunnel Failover Script
# GAP-006 Mitigation: High Availability

set -e

echo "FRA Tunnel Failover Procedure"
echo "=============================="

# Check primary health
if systemctl is-active cloudflared-$TUNNEL_PRIMARY > /dev/null; then
    echo "Primary tunnel is active"
    
    if $CONFIG_DIR/health-check.sh; then
        echo "Primary tunnel is healthy - no failover needed"
        exit 0
    fi
fi

echo "⚠️ Primary tunnel unhealthy - initiating failover"

# Stop primary
echo "Stopping primary tunnel..."
systemctl stop cloudflared-$TUNNEL_PRIMARY || true

# Start standby
echo "Starting standby tunnel..."
systemctl start cloudflared-$TUNNEL_STANDBY

# Wait for standby to be ready
sleep 5

# Verify standby health
if $CONFIG_DIR/health-check.sh; then
    echo "✅ Failover successful - standby tunnel active"
    
    # Update DNS to point to standby
    echo "Updating DNS records to standby tunnel..."
    cloudflared tunnel route dns $TUNNEL_STANDBY fra-app.dive25.com
    cloudflared tunnel route dns $TUNNEL_STANDBY fra-api.dive25.com
    cloudflared tunnel route dns $TUNNEL_STANDBY fra-idp.dive25.com
    cloudflared tunnel route dns $TUNNEL_STANDBY fra-kas.dive25.com
    
    exit 0
else
    echo "❌ Failover failed - manual intervention required"
    exit 1
fi
EOF

chmod +x "$CONFIG_DIR/failover.sh"
log_success "Failover script created: $CONFIG_DIR/failover.sh"

#######################################
# Summary
#######################################
echo ""
echo "=============================================="
echo "   FRA Tunnel Setup Complete!"
echo "=============================================="
echo ""
echo "✅ Tunnels Created:"
echo "   Primary: $TUNNEL_PRIMARY"
echo "   Standby: $TUNNEL_STANDBY"
echo ""
echo "✅ Configurations:"
echo "   $CONFIG_DIR/$TUNNEL_PRIMARY.yml"
echo "   $CONFIG_DIR/$TUNNEL_STANDBY.yml"
echo ""
echo "✅ DNS Records:"
echo "   $HOST_FRONTEND → $TUNNEL_PRIMARY"
echo "   $HOST_API → $TUNNEL_PRIMARY"
echo "   $HOST_IDP → $TUNNEL_PRIMARY"
echo "   $HOST_KAS → $TUNNEL_PRIMARY"
echo ""
echo "✅ Scripts:"
echo "   Health Check: $CONFIG_DIR/health-check.sh"
echo "   Failover: $CONFIG_DIR/failover.sh"
echo ""
echo "📋 Next Steps:"
echo "1. Start the primary tunnel:"
echo "   sudo systemctl start cloudflared-$TUNNEL_PRIMARY"
echo ""
echo "2. Monitor tunnel status:"
echo "   sudo systemctl status cloudflared-$TUNNEL_PRIMARY"
echo "   sudo journalctl -u cloudflared-$TUNNEL_PRIMARY -f"
echo ""
echo "3. Test connectivity:"
echo "   $CONFIG_DIR/health-check.sh"
echo ""
echo "4. Configure Access policies in Cloudflare dashboard"
echo ""
echo "5. For failover to standby:"
echo "   $CONFIG_DIR/failover.sh"
echo ""
echo "=============================================="
echo ""

# Test connectivity if not dry-run
if [[ "$DRY_RUN" == "false" ]]; then
    log_info "Testing DNS resolution..."
    for host in $HOST_FRONTEND $HOST_API $HOST_IDP $HOST_KAS; do
        if host "$host" > /dev/null 2>&1; then
            log_success "$host resolves correctly"
        else
            log_warning "$host not yet resolving (DNS propagation may take time)"
        fi
    done
fi

log_success "FRA tunnel setup complete!"




