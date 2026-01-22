#!/bin/bash
echo "  1. Docker Containers (8 services):"
expected_services=("keycloak" "backend" "opa" "opal-server" "mongodb" "postgres" "redis" "redis-blacklist")
running_count=0
missing_services=""
echo "About to start loop..."
for service in "${expected_services[@]}"; do
    echo "Checking $service..."
    container="dive-hub-${service}"
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "${container}"; then
        echo "  FOUND: $service"
        ((running_count++))
    elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-${service}\|dive-v3-${service}"; then
        echo "  FOUND (alt): $service"
        ((running_count++))
    else
        echo "  MISSING: $service"
        missing_services="${missing_services} ${service}"
    fi
done
echo "Loop complete. running_count=$running_count"
echo "Test completed successfully"
