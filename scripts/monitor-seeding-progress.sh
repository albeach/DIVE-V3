#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Monitor Seeding Progress
# =============================================================================
# Monitors the progress of MongoDB seeding operations across all instances
#
# Usage:
#   ./scripts/monitor-seeding-progress.sh [instance]
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTANCE_FILTER="${1:-}"

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       DIVE V3 - Seeding Progress Monitor                        ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check running processes
echo -e "${BLUE}Running Seeding Processes:${NC}"
ps aux | grep -E "seed.*instance|tsx.*seed-instance-resources" | grep -v grep || echo "  No seeding processes running"
echo ""

# Check MongoDB document counts
echo -e "${BLUE}Current MongoDB Document Counts:${NC}"
echo ""

for instance in usa fra gbr deu; do
    if [[ -n "$INSTANCE_FILTER" && "$instance" != "$INSTANCE_FILTER" ]]; then
        continue
    fi
    
    instance_upper=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
    
    # Load secrets
    source ./scripts/sync-gcp-secrets.sh "$instance" >/dev/null 2>&1 || true
    
    # Get MongoDB connection info from federation registry
    config_json=$(cat config/federation-registry.json)
    host=$(echo "$config_json" | jq -r ".instances.${instance}.deployment.host // \"localhost\"")
    port=$(echo "$config_json" | jq -r ".instances.${instance}.services.mongodb.externalPort // 27017")
    database=$(echo "$config_json" | jq -r ".instances.${instance}.mongodb.database // \"dive-v3-${instance}\"")
    user=$(echo "$config_json" | jq -r ".instances.${instance}.mongodb.user // \"admin\"")
    password_var="MONGO_PASSWORD_${instance_upper}"
    password="${!password_var:-}"
    
    if [[ -z "$password" ]]; then
        echo "  ${instance_upper}: ⚠️  Cannot load password"
        continue
    fi
    
    # Count documents
    count=$(mongosh "mongodb://${user}:${password}@${host}:${port}/${database}?authSource=admin" \
        --quiet \
        --eval "db.resources.countDocuments({})" \
        2>/dev/null || echo "0")
    
    echo "  ${instance_upper}: ${count} documents"
done

echo ""

# Check checkpoint files
echo -e "${BLUE}Checkpoint Files:${NC}"
if [ -d "backend/logs/seed" ]; then
    ls -lh backend/logs/seed/*checkpoint*.json 2>/dev/null | tail -5 || echo "  No checkpoint files found"
else
    echo "  Checkpoint directory not found"
fi

echo ""

# Check manifest files
echo -e "${BLUE}Latest Seed Manifests:${NC}"
if [ -d "backend/logs/seed" ]; then
    ls -lt backend/logs/seed/*manifest*.json 2>/dev/null | head -5 | awk '{print "  " $9 " (" $6 " " $7 " " $8 ")"}' || echo "  No manifest files found"
else
    echo "  Manifest directory not found"
fi

echo ""

