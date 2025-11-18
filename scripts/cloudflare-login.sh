#!/bin/bash
# Quick fix: Authenticate with Cloudflare first

echo "======================================"
echo "Cloudflare Authentication"
echo "======================================"
echo ""
echo "Running: cloudflared tunnel login"
echo ""
echo "This will open a browser window."
echo "Select your Cloudflare account and authorize the tunnel."
echo ""

sudo cloudflared tunnel login

if [ -f ~/.cloudflared/cert.pem ] || [ -f /root/.cloudflared/cert.pem ]; then
    echo ""
    echo "✅ Authentication successful!"
    echo ""
    echo "Now run the full setup script:"
    echo "  sudo ./scripts/setup-cloudflare-tunnel.sh"
else
    echo ""
    echo "❌ Authentication failed - cert.pem not found"
    echo ""
    echo "Please ensure:"
    echo "1. You have a Cloudflare account"
    echo "2. dive25.com domain is in your Cloudflare account"
    echo "3. Zero Trust is enabled"
fi





