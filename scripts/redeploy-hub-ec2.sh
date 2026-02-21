#!/bin/bash
set -euo pipefail

cd ~/DIVE-V3

echo "🔄 Pulling latest changes..."
git pull origin main

echo "🧹 Cleaning up previous deployment..."
sudo docker compose -f docker-compose.hub.yml down -v 2>/dev/null || true
sudo docker system prune -af --volumes || true

echo "🚀 Deploying DIVE V3 Hub..."
export ALLOW_INSECURE_LOCAL_DEVELOPMENT=true
sudo -E ./dive hub deploy

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Service Status:"
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
