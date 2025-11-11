#!/bin/bash
# Cloudflare Tunnel Setup for DIVE V3
# Run this script on kas.js.usa.divedeeper.internal

set -e

echo "======================================"
echo "DIVE V3 - Cloudflare Tunnel Setup"
echo "======================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo "Please run as root (sudo)"
   exit 1
fi

# Step 1: Install cloudflared
echo "Step 1: Installing cloudflared..."

# Download cloudflared for Linux
if [ ! -f /usr/local/bin/cloudflared ]; then
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    dpkg -i cloudflared-linux-amd64.deb
    rm cloudflared-linux-amd64.deb
    echo "✅ cloudflared installed"
else
    echo "✅ cloudflared already installed"
fi

# Verify installation
cloudflared version

echo ""
echo "======================================"
echo "Step 2: Authenticate with Cloudflare"
echo "======================================"
echo ""
echo "You need to authenticate with your Cloudflare account."
echo "This will open a browser window where you'll select your account."
echo ""
echo "Running: cloudflared tunnel login"
echo ""

# Run login
cloudflared tunnel login

# Check if cert was created
if [ ! -f ~/.cloudflared/cert.pem ]; then
    echo "❌ Authentication failed - cert.pem not found"
    echo ""
    echo "Please ensure:"
    echo "1. You have a Cloudflare account"
    echo "2. dive25.com domain is added to your Cloudflare account"
    echo "3. Zero Trust is enabled in your Cloudflare dashboard"
    echo ""
    exit 1
fi

echo "✅ Authentication successful"
echo ""

echo "======================================"
echo "Step 3: Create Tunnel"
echo "======================================"
echo ""
echo "Enter a name for your tunnel (default: dive-v3-tunnel):"
read -p "Tunnel name: " TUNNEL_NAME

if [ -z "$TUNNEL_NAME" ]; then
    TUNNEL_NAME="dive-v3-tunnel"
fi

echo ""
echo "Creating tunnel: $TUNNEL_NAME"
echo ""

# Create tunnel
cloudflared tunnel create $TUNNEL_NAME

# Get tunnel ID
TUNNEL_ID=$(cloudflared tunnel list | grep $TUNNEL_NAME | awk '{print $1}')

if [ -z "$TUNNEL_ID" ]; then
    echo "❌ Failed to create tunnel"
    exit 1
fi

echo "✅ Tunnel created: $TUNNEL_NAME (ID: $TUNNEL_ID)"
echo ""

# Create config directory
mkdir -p ~/.cloudflared

# Step 4: Configure tunnel
echo "======================================"
echo "Step 4: Configure Tunnel Routes"
echo "======================================"
echo ""
echo "Using dive25.com domain structure:"
echo ""
FRONTEND_DOMAIN="dev-app.dive25.com"
API_DOMAIN="dev-api.dive25.com"
AUTH_DOMAIN="dev-auth.dive25.com"

echo "  Frontend:  https://$FRONTEND_DOMAIN"
echo "  API:       https://$API_DOMAIN"
echo "  Keycloak:  https://$AUTH_DOMAIN"
echo ""

# Create tunnel configuration
cat > ~/.cloudflared/config.yml <<EOF
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/${TUNNEL_ID}.json

# Ingress rules - route domains to local services
ingress:
  # Frontend (Next.js)
  - hostname: $FRONTEND_DOMAIN
    service: https://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # Backend API
  - hostname: $API_DOMAIN
    service: https://localhost:4000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # Keycloak (Authentication)
  - hostname: $AUTH_DOMAIN
    service: https://localhost:8443
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # Catch-all rule (required)
  - service: http_status:404
EOF

echo "✅ Configuration created at ~/.cloudflared/config.yml"
echo ""

# Step 5: Create DNS records
echo "======================================"
echo "Step 5: Create DNS Records"
echo "======================================"
echo ""
echo "Creating DNS CNAME records..."

cloudflared tunnel route dns $TUNNEL_NAME $FRONTEND_DOMAIN
cloudflared tunnel route dns $TUNNEL_NAME $API_DOMAIN
cloudflared tunnel route dns $TUNNEL_NAME $AUTH_DOMAIN

echo "✅ DNS records created"
echo ""

# Step 6: Install as systemd service
echo "======================================"
echo "Step 6: Install as System Service"
echo "======================================"
echo ""

cloudflared service install

echo "✅ Service installed"
echo ""

# Start the service
echo "Starting tunnel service..."
systemctl start cloudflared
systemctl enable cloudflared

echo "✅ Tunnel service started and enabled"
echo ""

# Check status
echo "======================================"
echo "Tunnel Status"
echo "======================================"
systemctl status cloudflared --no-pager

echo ""
echo "======================================"
echo "✅ Setup Complete!"
echo "======================================"
echo ""
echo "Your DIVE V3 application is now accessible at:"
echo ""
echo "  Frontend:  https://$FRONTEND_DOMAIN"
echo "  API:       https://$API_DOMAIN"
echo "  Keycloak:  https://$AUTH_DOMAIN"
echo ""
echo "Next steps:"
echo "1. Update environment variables with new domains"
echo "2. Update Keycloak redirect URIs"
echo "3. Test the connection"
echo ""
echo "Useful commands:"
echo "  - Check tunnel status: cloudflared tunnel info $TUNNEL_NAME"
echo "  - View logs: journalctl -u cloudflared -f"
echo "  - Restart service: systemctl restart cloudflared"
echo ""

