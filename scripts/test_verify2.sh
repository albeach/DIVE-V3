#!/bin/bash
echo -n "  1. Docker Containers (8 services):"
expected_services=("keycloak" "backend" "opa" "opal-server" "mongodb" "postgres" "redis" "redis-blacklist")
running_count=0
missing_services=""
for service in "${expected_services[@]}"; do
    container="dive-hub-${service}"
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "${container}"; then
        ((running_count++))
    elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-${service}\|dive-v3-${service}"; then
        ((running_count++))
    else
        missing_services="${missing_services} ${service}"
    fi
done

if [ $running_count -ge 6 ]; then
    echo -e "\e[32m✓ ${running_count}/8 running\e[0m"
else
    echo -e "\e[31m✗ ${running_count}/8 running (missing:${missing_services})\e[0m"
fi
echo "Test completed"
