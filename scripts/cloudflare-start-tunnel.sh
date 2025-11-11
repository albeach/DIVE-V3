#!/bin/bash
# Start the Cloudflare Tunnel service

set -e

echo "======================================"
echo "Start Cloudflare Tunnel Service"
echo "======================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo "Please run as root (sudo)"
   exit 1
fi

TUNNEL_NAME="dive-v3-tunnel"
TUNNEL_ID="f8e6c558-847b-4952-b8b2-27f98a85e36c"

# Create config directory
mkdir -p ~/.cloudflared

# Check if config exists
if [ ! -f ~/.cloudflared/config.yml ]; then
    echo "Creating tunnel configuration..."
    
    cat > ~/.cloudflared/config.yml <<EOF
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/${TUNNEL_ID}.json

# Ingress rules - route domains to local services
ingress:
  # Frontend (Next.js)
  - hostname: dev-app.dive25.com
    service: https://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # Backend API
  - hostname: dev-api.dive25.com
    service: https://localhost:4000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # Keycloak (Authentication)
  - hostname: dev-auth.dive25.com
    service: https://localhost:8443
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # Catch-all rule (required)
  - service: http_status:404
EOF
    
    echo "✅ Configuration created at ~/.cloudflared/config.yml"
else
    echo "✅ Configuration already exists"
fi

# Check if credentials file exists
if [ ! -f /root/.cloudflared/${TUNNEL_ID}.json ]; then
    echo ""
    echo "⚠️  Credentials file not found!"
    echo ""
    echo "Looking for credentials in alternate locations..."
    
    # Check if it's in the current user's home
    if [ -f ~/.cloudflared/${TUNNEL_ID}.json ]; then
        echo "Found in ~/.cloudflared/"
        cp ~/.cloudflared/${TUNNEL_ID}.json /root/.cloudflared/
        echo "✅ Copied to /root/.cloudflared/"
    else
        echo "❌ Credentials file not found"
        echo ""
        echo "The tunnel was created but credentials are missing."
        echo "This might happen if the tunnel was created with a different user."
        echo ""
        echo "Try recreating the tunnel:"
        echo "  cloudflared tunnel delete $TUNNEL_NAME"
        echo "  cloudflared tunnel create $TUNNEL_NAME"
        exit 1
    fi
fi

echo ""
echo "======================================"
echo "Installing Tunnel Service"
echo "======================================"
echo ""

# Check if service is already installed
if systemctl list-unit-files | grep -q cloudflared; then
    echo "Service already installed"
else
    echo "Installing cloudflared service..."
    cloudflared service install
    echo "✅ Service installed"
fi

echo ""
echo "======================================"
echo "Starting Tunnel"
echo "======================================"
echo ""

# Start the service
systemctl start cloudflared
systemctl enable cloudflared

echo "✅ Tunnel service started and enabled"
echo ""

# Wait a moment for tunnel to connect
echo "Waiting for tunnel to establish connection..."
sleep 5

# Check status
echo ""
echo "======================================"
echo "Tunnel Status"
echo "======================================"
echo ""

systemctl status cloudflared --no-pager

echo ""
echo "======================================"
echo "Tunnel Information"
echo "======================================"
echo ""

cloudflared tunnel info $TUNNEL_NAME

echo ""
echo "======================================"
echo "✅ Tunnel is Running!"
echo "======================================"
echo ""
echo "Your DIVE V3 application is now accessible at:"
echo ""
echo "  🌐 Frontend:  https://dev-app.dive25.com"
echo "  🔌 Backend:   https://dev-api.dive25.com"
echo "  🔐 Keycloak:  https://dev-auth.dive25.com"
echo ""
echo "Test the endpoints:"
echo "  curl -I https://dev-app.dive25.com"
echo "  curl -I https://dev-api.dive25.com/health"
echo "  curl -I https://dev-auth.dive25.com/realms/dive-v3-broker"
echo ""
echo "View logs:"
echo "  sudo journalctl -u cloudflared -f"
echo ""
echo "Restart tunnel:"
echo "  sudo systemctl restart cloudflared"
echo ""



