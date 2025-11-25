#!/bin/bash
# Multi-Location Cloudflare Tunnel Setup for DIVE V3
# Best Practice: Named tunnels with location-specific configuration

set -e

echo "=========================================="
echo "DIVE V3 Multi-Location Tunnel Setup"
echo "=========================================="
echo ""

# Configuration
DOMAIN="dive25.com"
TUNNEL_BASE_NAME="dive-v3"

# Location detection and configuration
detect_location() {
    echo "Detecting deployment location..."
    echo ""
    echo "Available locations:"
    echo "1. Primary (Production)"
    echo "2. Secondary (DR/Backup)"
    echo "3. Development (Dev/Test)"
    echo "4. Custom Location"
    echo ""
    
    read -p "Select location [1-4]: " LOCATION_CHOICE
    
    case $LOCATION_CHOICE in
        1)
            LOCATION="primary"
            ENVIRONMENT="prod"
            SUBDOMAIN_PREFIX="app"
            TUNNEL_PRIORITY="primary"
            ;;
        2)
            LOCATION="secondary"
            ENVIRONMENT="prod"
            SUBDOMAIN_PREFIX="backup"
            TUNNEL_PRIORITY="secondary"
            ;;
        3)
            LOCATION="development"
            ENVIRONMENT="dev"
            SUBDOMAIN_PREFIX="dev-app"
            TUNNEL_PRIORITY="development"
            ;;
        4)
            read -p "Enter custom location name: " LOCATION
            read -p "Enter environment (prod/staging/dev): " ENVIRONMENT
            read -p "Enter subdomain prefix: " SUBDOMAIN_PREFIX
            TUNNEL_PRIORITY="custom"
            ;;
        *)
            echo "Invalid selection"
            exit 1
            ;;
    esac
    
    TUNNEL_NAME="${TUNNEL_BASE_NAME}-${LOCATION}"
    
    echo ""
    echo "Configuration:"
    echo "  Location: $LOCATION"
    echo "  Environment: $ENVIRONMENT"
    echo "  Tunnel Name: $TUNNEL_NAME"
    echo "  Subdomain Prefix: $SUBDOMAIN_PREFIX"
    echo "  Priority: $TUNNEL_PRIORITY"
    echo ""
}

# Create location-specific configuration
create_tunnel_config() {
    local tunnel_id=$1
    
    # Create location-specific config directory
    mkdir -p ~/.cloudflared/$LOCATION
    
    # Generate configuration based on location
    cat > ~/.cloudflared/$LOCATION/config.yml <<EOF
# DIVE V3 Cloudflare Tunnel Configuration
# Location: $LOCATION
# Environment: $ENVIRONMENT
# Generated: $(date)

tunnel: $tunnel_id
credentials-file: ~/.cloudflared/$LOCATION/${tunnel_id}.json

# Logging configuration
loglevel: info
log-directory: ~/.cloudflared/$LOCATION/logs

# Connection settings for reliability
protocol: quic
grace-period: 30s
retries: 5

# Location-specific ingress rules
ingress:
  # Frontend (Next.js)
  - hostname: ${SUBDOMAIN_PREFIX}.${DOMAIN}
    service: https://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      tlsTimeout: 10s
      keepAliveTimeout: 90s
      keepAliveConnections: 100
      httpHostHeader: ${SUBDOMAIN_PREFIX}.${DOMAIN}
  
  # Backend API
  - hostname: ${SUBDOMAIN_PREFIX/app/api}.${DOMAIN}
    service: https://localhost:4000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      tlsTimeout: 10s
      keepAliveTimeout: 90s
      keepAliveConnections: 100
      httpHostHeader: ${SUBDOMAIN_PREFIX/app/api}.${DOMAIN}
  
  # Keycloak (Authentication)
  - hostname: ${SUBDOMAIN_PREFIX/app/auth}.${DOMAIN}
    service: https://localhost:8443
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      tlsTimeout: 10s
      keepAliveTimeout: 90s
      keepAliveConnections: 100
      httpHostHeader: ${SUBDOMAIN_PREFIX/app/auth}.${DOMAIN}
  
  # Health check endpoint
  - hostname: ${SUBDOMAIN_PREFIX/app/health}.${DOMAIN}
    service: https://localhost:4000/health
    originRequest:
      noTLSVerify: true
      connectTimeout: 10s
  
  # Catch-all rule (required)
  - service: http_status:404
EOF

    echo "✅ Configuration created: ~/.cloudflared/$LOCATION/config.yml"
}

# Create systemd service for location
create_systemd_service() {
    local tunnel_name=$1
    
    cat > /etc/systemd/system/cloudflared-${LOCATION}.service <<EOF
[Unit]
Description=Cloudflare Tunnel - DIVE V3 ${LOCATION}
After=network.target
StartLimitIntervalSec=0

[Service]
Type=notify
ExecStart=/usr/local/bin/cloudflared tunnel --config ~/.cloudflared/$LOCATION/config.yml run
ExecReload=/bin/kill -HUP \$MAINPID
KillMode=mixed
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cloudflared-${LOCATION}
User=root
Group=root

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/root/.cloudflared/$LOCATION

# Environment variables
Environment=TUNNEL_LOCATION=$LOCATION
Environment=TUNNEL_ENVIRONMENT=$ENVIRONMENT

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    echo "✅ Systemd service created: cloudflared-${LOCATION}"
}

# Main setup function
main() {
    # Check if running as root
    if [ "$EUID" -ne 0 ]; then 
        echo "Please run as root (sudo)"
        exit 1
    fi
    
    # Install cloudflared if not present
    if ! command -v cloudflared &> /dev/null; then
        echo "Installing cloudflared..."
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        dpkg -i cloudflared-linux-amd64.deb
        rm cloudflared-linux-amd64.deb
        echo "✅ cloudflared installed"
    fi
    
    # Detect location and configure
    detect_location
    
    # Authenticate if needed
    if [ ! -f ~/.cloudflared/cert.pem ]; then
        echo "Authenticating with Cloudflare..."
        cloudflared tunnel login
    fi
    
    # Create tunnel
    echo "Creating tunnel: $TUNNEL_NAME"
    cloudflared tunnel create $TUNNEL_NAME
    
    # Get tunnel ID
    TUNNEL_ID=$(cloudflared tunnel list | grep $TUNNEL_NAME | awk '{print $1}')
    
    if [ -z "$TUNNEL_ID" ]; then
        echo "❌ Failed to create tunnel"
        exit 1
    fi
    
    echo "✅ Tunnel created: $TUNNEL_NAME (ID: $TUNNEL_ID)"
    
    # Move credentials to location-specific directory
    mkdir -p ~/.cloudflared/$LOCATION
    mv ~/.cloudflared/${TUNNEL_ID}.json ~/.cloudflared/$LOCATION/
    
    # Create configuration
    create_tunnel_config $TUNNEL_ID
    
    # Create DNS records
    echo "Creating DNS records..."
    cloudflared tunnel route dns $TUNNEL_NAME ${SUBDOMAIN_PREFIX}.${DOMAIN}
    cloudflared tunnel route dns $TUNNEL_NAME ${SUBDOMAIN_PREFIX/app/api}.${DOMAIN}
    cloudflared tunnel route dns $TUNNEL_NAME ${SUBDOMAIN_PREFIX/app/auth}.${DOMAIN}
    cloudflared tunnel route dns $TUNNEL_NAME ${SUBDOMAIN_PREFIX/app/health}.${DOMAIN}
    
    echo "✅ DNS records created"
    
    # Create systemd service
    create_systemd_service $TUNNEL_NAME
    
    # Start service
    systemctl enable cloudflared-${LOCATION}
    systemctl start cloudflared-${LOCATION}
    
    echo ""
    echo "=========================================="
    echo "✅ Multi-Location Tunnel Setup Complete"
    echo "=========================================="
    echo ""
    echo "Location: $LOCATION"
    echo "Tunnel: $TUNNEL_NAME"
    echo "Service: cloudflared-${LOCATION}"
    echo ""
    echo "URLs:"
    echo "  Frontend: https://${SUBDOMAIN_PREFIX}.${DOMAIN}"
    echo "  API:      https://${SUBDOMAIN_PREFIX/app/api}.${DOMAIN}"
    echo "  Auth:     https://${SUBDOMAIN_PREFIX/app/auth}.${DOMAIN}"
    echo "  Health:   https://${SUBDOMAIN_PREFIX/app/health}.${DOMAIN}"
    echo ""
    echo "Service Management:"
    echo "  Start:   systemctl start cloudflared-${LOCATION}"
    echo "  Stop:    systemctl stop cloudflared-${LOCATION}"
    echo "  Status:  systemctl status cloudflared-${LOCATION}"
    echo "  Logs:    journalctl -u cloudflared-${LOCATION} -f"
    echo ""
}

# Run main function
main "$@"




