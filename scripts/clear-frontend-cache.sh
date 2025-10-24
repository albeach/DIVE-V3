#!/bin/bash
set -e

echo "════════════════════════════════════════════════════════════════"
echo "  CLEARING ALL FRONTEND CACHES & FORCING REBUILD"
echo "════════════════════════════════════════════════════════════════"
echo ""

echo "Step 1: Stopping frontend..."
docker-compose stop nextjs

echo "Step 2: Removing frontend container..."
docker-compose rm -f nextjs

echo "Step 3: Clearing .next cache on HOST..."
rm -rf frontend/.next/*
echo "✓ Cleared frontend/.next/"

echo "Step 4: Clearing node_modules cache on HOST..."
rm -rf frontend/node_modules/.cache
echo "✓ Cleared frontend/node_modules/.cache"

echo "Step 5: Rebuilding with --no-cache..."
docker-compose build --no-cache nextjs

echo "Step 6: Starting fresh container..."
docker-compose up -d nextjs

echo ""
echo "Waiting for frontend to compile..."
sleep 20

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ✅ COMPLETE REBUILD FINISHED"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "All caches cleared. Test: http://localhost:3000"
echo ""

# Verify the change is in place
echo "Verifying idp-selector.tsx changes..."
docker exec dive-v3-frontend grep -A 5 "handleIdpClick" /app/src/components/auth/idp-selector.tsx | head -10
