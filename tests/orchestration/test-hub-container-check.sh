#!/usr/bin/env bash
# Simple test to verify Hub container check

set -x

export DIVE_ROOT="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3"

# Test the exact logic from spoke_federation_create_bidirectional
hub_container="dive-hub-keycloak"

echo "Testing Hub container check..."
echo "Container name: $hub_container"

# Check containers
echo "All running containers:"
docker ps --format '{{.Names}}'

echo ""
echo "Grep test (exact match):"
docker ps --format '{{.Names}}' | grep -q "^${hub_container}$" && echo "FOUND!" || echo "NOT FOUND"

echo ""
echo "Grep test (partial match):"
docker ps --format '{{.Names}}' | grep "$hub_container" && echo "FOUND!" || echo "NOT FOUND"
