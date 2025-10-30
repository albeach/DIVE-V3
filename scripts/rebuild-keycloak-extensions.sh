#!/bin/bash
# ============================================
# Rebuild Keycloak Extensions and Restart Container
# ============================================
# Purpose: Compile custom SPI, copy JAR to Keycloak, and restart service
# Usage: ./scripts/rebuild-keycloak-extensions.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "======================================"
echo "Rebuilding Keycloak Custom Extensions"
echo "======================================"

# Step 1: Build the extension using Docker (Maven container)
echo ""
echo "[1/4] Building extension JAR with Maven..."
docker run --rm \
  -v "$PROJECT_ROOT/keycloak/extensions:/app" \
  -w /app \
  maven:3.9-eclipse-temurin-17 \
  mvn clean package -DskipTests

# Verify JAR was created
if [ ! -f "$PROJECT_ROOT/keycloak/extensions/target/dive-keycloak-extensions.jar" ]; then
  echo "❌ ERROR: JAR file not created"
  exit 1
fi

echo "✅ JAR built successfully: keycloak/extensions/target/dive-keycloak-extensions.jar"

# Step 2: Stop Keycloak container
echo ""
echo "[2/4] Stopping Keycloak container..."
docker-compose stop keycloak

# Step 3: Start Keycloak (it will pick up the new JAR from mounted volume)
echo ""
echo "[3/4] Starting Keycloak container..."
docker-compose up -d keycloak

# Step 4: Wait for Keycloak to be healthy
echo ""
echo "[4/4] Waiting for Keycloak to be healthy..."
MAX_WAIT=120
WAIT_COUNT=0

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
  if docker-compose exec -T keycloak curl -s -f http://localhost:8080/health/ready > /dev/null 2>&1; then
    echo "✅ Keycloak is healthy and ready"
    break
  fi
  echo -n "."
  sleep 2
  WAIT_COUNT=$((WAIT_COUNT + 2))
done

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
  echo ""
  echo "⚠️  WARNING: Keycloak health check timeout after ${MAX_WAIT}s"
  echo "Check logs: docker-compose logs keycloak"
  exit 1
fi

echo ""
echo "======================================"
echo "✅ Keycloak Extensions Rebuild Complete"
echo "======================================"
echo ""
echo "Extension JAR: keycloak/extensions/target/dive-keycloak-extensions.jar"
echo "Keycloak logs: docker-compose logs -f keycloak"
echo ""
echo "Debug logging enabled for:"
echo "  - org.keycloak.credential (OTP validation)"
echo "  - org.keycloak.authentication (Custom SPI)"
echo ""

