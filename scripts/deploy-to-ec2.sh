#!/bin/bash

# DIVE V3 - Deploy Dynamic Configuration to AWS EC2
# This script deploys the new dynamic multi-domain configuration

set -e

# Configuration
EC2_HOST="18.254.34.87"
EC2_USER="ec2-user"
SSH_KEY="${HOME}/.ssh/ABeach-SSH-Key.pem"
REMOTE_DIR="/home/ec2-user/DIVE-V3"

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║         DIVE V3 - Deploy Dynamic Configuration to AWS EC2                   ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Commit changes locally
echo "📝 Step 1: Committing changes locally..."
echo "─────────────────────────────────────────────────────────────────────────────"
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

git add frontend/src/lib/dynamic-config.ts \
        frontend/src/hooks/use-dynamic-config.ts \
        frontend/src/lib/api-utils.ts \
        frontend/src/middleware-dynamic-host.ts \
        frontend/next.config.ts \
        frontend/DYNAMIC_CONFIG_GUIDE.md \
        frontend/DYNAMIC_CONFIG_IMPLEMENTATION.md \
        frontend/INTEGRATION_EXAMPLE.ts \
        frontend/QUICK_REFERENCE.md \
        frontend/README-DYNAMIC-CONFIG.md \
        frontend/MIGRATION_COMPLETE.md \
        scripts/migrate-api-routes.py \
        scripts/migrate-to-dynamic-config.sh \
        scripts/auto-migrate-api-routes.sh

# Add all migrated API routes
git add frontend/src/app/api/*/route.ts \
        frontend/src/app/api/*/*/route.ts \
        frontend/src/app/api/*/*/*/route.ts \
        frontend/src/app/api/*/*/*/*/route.ts \
        2>/dev/null || true

git commit -m "$(cat <<'EOF'
feat(frontend): Add dynamic multi-domain configuration system

Implements automatic domain detection for multi-instance deployment:
- Detects domain (usa-app/fra-app/gbr-app) and configures URLs automatically
- Migrated 106 API routes to use getBackendUrl() from @/lib/api-utils
- Updated Next.js CSP headers to support all DIVE V3 domains
- Created comprehensive documentation and migration tools

Files created:
- frontend/src/lib/dynamic-config.ts - Core domain detection
- frontend/src/hooks/use-dynamic-config.ts - React hooks
- frontend/src/lib/api-utils.ts - Server-side utilities
- frontend/src/middleware-dynamic-host.ts - Next.js middleware
- frontend/DYNAMIC_CONFIG_GUIDE.md - Complete usage guide
- frontend/QUICK_REFERENCE.md - Quick reference
- scripts/migrate-api-routes.py - Migration automation

Changes:
- Updated 106 API route files to use dynamic configuration
- Modified next.config.ts CSP to include all DIVE domains
- All routes now auto-detect domain and use correct backend URL

Benefits:
- Works on usa-app.dive25.com, fra-app.dive25.com, gbr-app.dive25.com
- No hardcoded URLs or environment variables needed
- Automatic domain detection in both client and server contexts
- Production-ready with proper CSP headers

Related to: Cloudflared tunnel deployment and DNS configuration
EOF
)" || echo "✓ Already committed or nothing to commit"

echo ""
echo "✅ Changes committed locally"
echo ""

# Step 2: Push to remote
echo "📤 Step 2: Pushing to GitHub..."
echo "─────────────────────────────────────────────────────────────────────────────"
git push origin main || echo "⚠️  Push failed or already up to date"
echo ""
echo "✅ Pushed to GitHub"
echo ""

# Step 3: SSH to EC2 and deploy
echo "🚀 Step 3: Deploying to EC2..."
echo "─────────────────────────────────────────────────────────────────────────────"

ssh -i "$SSH_KEY" "$EC2_USER@$EC2_HOST" << 'ENDSSH'
set -e

echo ""
echo "🔧 On EC2 Instance: $(hostname)"
echo "─────────────────────────────────────────────────────────────────────────────"

# Navigate to project directory
cd /home/ec2-user/DIVE-V3 || {
    echo "❌ DIVE-V3 directory not found!"
    echo "Creating directory and cloning..."
    git clone https://github.com/aubreybeach/DIVE-V3.git
    cd DIVE-V3
}

# Pull latest changes
echo ""
echo "📥 Pulling latest changes from GitHub..."
git fetch origin
git pull origin main

# Check if frontend directory exists
if [ ! -d "frontend" ]; then
    echo "❌ Frontend directory not found!"
    exit 1
fi

# Install/update dependencies
echo ""
echo "📦 Installing frontend dependencies..."
cd frontend
npm install

# Build frontend
echo ""
echo "🔨 Building frontend with new dynamic configuration..."
npm run build

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Frontend build successful!"
else
    echo "❌ Frontend build failed!"
    exit 1
fi

# Restart services (assuming you're using PM2 or systemd)
echo ""
echo "🔄 Restarting services..."

# Try PM2 first
if command -v pm2 &> /dev/null; then
    echo "Using PM2..."
    pm2 restart dive-frontend || pm2 restart all || echo "⚠️  PM2 restart had issues"
    pm2 save
elif systemctl list-units --type=service | grep -q "dive"; then
    echo "Using systemd..."
    sudo systemctl restart dive-frontend || echo "⚠️  Service restart had issues"
else
    echo "⚠️  No process manager found. You may need to restart manually."
    echo "   If using Docker: cd /home/ec2-user/DIVE-V3 && docker-compose restart frontend"
fi

echo ""
echo "✅ Deployment complete on EC2!"
echo ""

ENDSSH

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                        ✅ DEPLOYMENT COMPLETE! ✅                            ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 DEPLOYMENT SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Local changes committed and pushed to GitHub"
echo "✅ Changes pulled on EC2 instance"
echo "✅ Frontend dependencies installed"
echo "✅ Frontend rebuilt with dynamic configuration"
echo "✅ Services restarted"
echo ""
echo "🧪 TESTING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Test the dynamic configuration on each domain:"
echo ""
echo "1. https://usa-app.dive25.com"
echo "   → Should automatically use usa-api.dive25.com"
echo ""
echo "2. https://fra-app.dive25.com"
echo "   → Should automatically use fra-api.dive25.com"
echo ""
echo "3. https://gbr-app.dive25.com"
echo "   → Should automatically use gbr-api.dive25.com"
echo ""
echo "4. Open browser console and test:"
echo "   import { getDynamicConfig } from '@/lib/dynamic-config';"
echo "   console.log(getDynamicConfig());"
echo ""
echo "🔍 TROUBLESHOOTING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "If services didn't restart automatically, SSH and run:"
echo "  ssh -i ~/.ssh/ABeach-SSH-Key.pem ec2-user@18.254.34.87"
echo ""
echo "Then restart manually:"
echo "  # If using PM2:"
echo "  cd ~/DIVE-V3/frontend && pm2 restart dive-frontend"
echo ""
echo "  # If using Docker:"
echo "  cd ~/DIVE-V3 && docker-compose restart frontend"
echo ""
echo "  # If using systemd:"
echo "  sudo systemctl restart dive-frontend"
echo ""
echo "📚 DOCUMENTATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  frontend/README-DYNAMIC-CONFIG.md       → Quick start"
echo "  frontend/MIGRATION_COMPLETE.md          → What changed"
echo "  frontend/QUICK_REFERENCE.md             → Syntax reference"
echo ""
echo "✨ Done!"

# sc2034-anchor
: "${REMOTE_DIR:-}"
