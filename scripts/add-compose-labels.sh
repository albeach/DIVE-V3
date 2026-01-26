#!/usr/bin/env bash
# =============================================================================
# Add Service Classification Labels to docker-compose.hub.yml
# =============================================================================
# This script adds dive.service.class labels to all services
# One-time operation for Phase 2: Dynamic Service Discovery
# =============================================================================

set -e

COMPOSE_FILE="docker-compose.hub.yml"

# Service classifications from Phase 0 Audit
declare -A SERVICE_CLASSES=(
    ["postgres"]="core"
    ["mongodb"]="core"
    ["redis"]="core"
    ["redis-blacklist"]="core"
    ["keycloak"]="core"
    ["opa"]="core"
    ["backend"]="core"
    ["frontend"]="core"
    ["kas"]="stretch"
    ["opal-server"]="stretch"
    ["otel-collector"]="optional"
)

declare -A SERVICE_DESCRIPTIONS=(
    ["postgres"]="PostgreSQL database for Keycloak user/realm storage"
    ["mongodb"]="MongoDB database for resource metadata and audit logs"
    ["redis"]="Redis cache for session state and policy decisions"
    ["redis-blacklist"]="Redis blacklist for revoked JWT tokens"
    ["keycloak"]="Keycloak IdP broker for multi-nation SSO"
    ["opa"]="Open Policy Agent for ABAC authorization decisions"
    ["backend"]="Express.js API with PEP for authorization enforcement"
    ["frontend"]="Next.js React application with NextAuth.js"
    ["kas"]="Key Access Service for TDF encrypted resources (stretch goal)"
    ["opal-server"]="OPAL server for real-time policy distribution (stretch goal)"
    ["otel-collector"]="OpenTelemetry collector for traces/metrics (optional)"
)

echo "Adding service classification labels to $COMPOSE_FILE..."

for service in "${!SERVICE_CLASSES[@]}"; do
    class="${SERVICE_CLASSES[$service]}"
    description="${SERVICE_DESCRIPTIONS[$service]}"
    
    echo "  Processing $service (class: $class)"
    
    # Check if labels already exist
    if grep -A 5 "^  ${service}:" "$COMPOSE_FILE" | grep -q "labels:"; then
        echo "    Labels section already exists, skipping"
        continue
    fi
    
    # Find the service and add labels after restart line
    # Look for: "  servicename:" followed by image/restart lines
    # Insert labels after "restart:" line
    
    if grep -q "^  ${service}:" "$COMPOSE_FILE"; then
        # Use sed to insert labels after "restart:" line for this service
        # This is tricky - need to insert after restart line but before next key
        
        # Strategy: Find the service, then find "restart:", then insert labels
        sed -i.bak "/^  ${service}:/,/^  [a-z]/ {
            /restart:/ {
                a\\
    labels:\\
      dive.service.class: \"${class}\"\\
      dive.service.description: \"${description}\"
            }
        }" "$COMPOSE_FILE"
        
        echo "    ✅ Added labels"
    else
        echo "    ⚠️  Service not found in compose file"
    fi
done

echo ""
echo "✅ Label addition complete!"
echo ""
echo "Backup saved as: ${COMPOSE_FILE}.bak"
echo ""
echo "Verifying labels..."
echo ""

# Verify by counting labels
total_services=${#SERVICE_CLASSES[@]}
labeled_services=$(grep -c "dive.service.class:" "$COMPOSE_FILE" || echo "0")

echo "  Services defined: $total_services"
echo "  Services labeled: $labeled_services"

if [ "$labeled_services" -eq "$total_services" ]; then
    echo ""
    echo "  ✅ All services successfully labeled!"
else
    echo ""
    echo "  ⚠️  Some services may not be labeled. Check manually."
fi

echo ""
echo "To test the labels, run:"
echo "  source scripts/dive-modules/common.sh"
echo "  source scripts/dive-modules/utilities/compose-parser.sh"
echo "  compose_print_stats docker-compose.hub.yml"
