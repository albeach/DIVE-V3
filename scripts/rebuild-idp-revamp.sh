#!/bin/bash

###############################################################################
# IdP Management Revamp - Complete Docker Rebuild
#
# This script:
# 1. Stops all containers
# 2. Clears Docker build cache
# 3. Rebuilds images from scratch
# 4. Starts all services
# 5. Runs database migration
# 6. Verifies deployment
###############################################################################

set -e

echo "🔄 IdP Management Revamp - Complete Docker Rebuild"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Step 1: Stop all containers
echo "🛑 Step 1/7: Stopping all containers..."
docker-compose down
echo -e "${GREEN}✅ Containers stopped${NC}"
echo ""

# Step 2: Remove old images
echo "🗑️  Step 2/7: Removing old images..."
docker rmi dive-v3-backend dive-v3-nextjs 2>/dev/null || echo "Images already removed"
echo -e "${GREEN}✅ Old images removed${NC}"
echo ""

# Step 3: Clear build cache
echo "🧹 Step 3/7: Clearing Docker build cache..."
docker builder prune -f
echo -e "${GREEN}✅ Build cache cleared${NC}"
echo ""

# Step 4: Rebuild images (no cache)
echo "🔨 Step 4/7: Rebuilding images from scratch..."
docker-compose build --no-cache backend nextjs
echo -e "${GREEN}✅ Images rebuilt${NC}"
echo ""

# Step 5: Start all services
echo "🚀 Step 5/7: Starting all services..."
docker-compose up -d
echo -e "${YELLOW}⏳ Waiting 60 seconds for services to initialize...${NC}"
sleep 60
echo -e "${GREEN}✅ Services started${NC}"
echo ""

# Step 6: Run database migration
echo "💾 Step 6/7: Running database migration..."
docker exec dive-v3-backend npx ts-node src/scripts/migrate-idp-themes.ts
echo -e "${GREEN}✅ Migration complete${NC}"
echo ""

# Step 7: Verify deployment
echo "🔍 Step 7/7: Verifying deployment..."
echo ""

# Check services
echo "Checking Docker services:"
docker-compose ps

echo ""
echo "Checking backend health:"
curl -s http://localhost:4000/health | jq -r '"\(.status) - \(.timestamp)"' || echo "Backend not ready yet"

echo ""
echo "Checking MongoDB themes:"
THEME_COUNT=$(docker exec dive-v3-mongo mongosh -u admin -p password --authenticationDatabase admin dive-v3 --quiet --eval "db.idp_themes.countDocuments()")
echo "Themes in database: $THEME_COUNT"

if [ "$THEME_COUNT" == "4" ]; then
    echo -e "${GREEN}✅ Database verification passed${NC}"
else
    echo -e "${RED}⚠️  Expected 4 themes, found $THEME_COUNT${NC}"
fi

echo ""
echo "Checking frontend:"
if curl -s http://localhost:3000 > /dev/null; then
    echo -e "${GREEN}✅ Frontend accessible${NC}"
else
    echo -e "${RED}⚠️  Frontend not responding${NC}"
fi

echo ""
echo "=================================================="
echo -e "${GREEN}🎉 Rebuild Complete!${NC}"
echo "=================================================="
echo ""
echo "🌐 Access Points:"
echo "   Frontend:  http://localhost:3000/admin/idp"
echo "   Backend:   http://localhost:4000/health"
echo "   Custom Login: http://localhost:3000/login/usa-realm-broker"
echo ""
echo "📊 View Logs:"
echo "   Backend:  docker logs -f dive-v3-backend"
echo "   Frontend: docker logs -f dive-v3-frontend"
echo ""
echo "🧪 Run Tests:"
echo "   cd backend && npm test -- --testPathPattern=\"idp-theme|keycloak-admin-mfa|idp-management-api\""
echo ""

