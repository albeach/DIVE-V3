#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/.archive/legacy-opal-data-$(date +%Y-%m-%d-%H%M%S)"

echo "🧹 DIVE V3 - Legacy OPAL Data Cleanup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This script will:"
echo "  1. Backup legacy static data files"
echo "  2. Delete conflicting static data sources"
echo "  3. Update .gitignore to prevent re-creation"
echo "  4. Restart OPAL and OPA containers"
echo "  5. Verify MongoDB SSOT architecture"
echo ""
read -p "Continue? (yes/no): " CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
    echo "❌ Cleanup cancelled"
    exit 1
fi

# Phase 1: Backup
echo ""
echo "📦 Phase 1: Backing up legacy files..."
mkdir -p "$BACKUP_DIR"

if [[ -f "$PROJECT_ROOT/policies/data.json" ]]; then
    cp "$PROJECT_ROOT/policies/data.json" "$BACKUP_DIR/"
    echo "  ✓ Backed up policies/data.json"
fi

for TENANT_DATA in "$PROJECT_ROOT/policies/tenant"/*/data.json; do
    if [[ -f "$TENANT_DATA" ]]; then
        TENANT_NAME=$(basename "$(dirname "$TENANT_DATA")")
        cp "$TENANT_DATA" "$BACKUP_DIR/tenant-$TENANT_NAME-data.json"
        echo "  ✓ Backed up $TENANT_DATA"
    fi
done

if [[ -f "$PROJECT_ROOT/backend/data/opal/trusted_issuers.json" ]]; then
    cp "$PROJECT_ROOT/backend/data/opal/trusted_issuers.json" "$BACKUP_DIR/"
    echo "  ✓ Backed up backend/data/opal/trusted_issuers.json"
fi

if [[ -f "$PROJECT_ROOT/opal-data-source/trusted_issuers.json" ]]; then
    cp "$PROJECT_ROOT/opal-data-source/trusted_issuers.json" "$BACKUP_DIR/"
    echo "  ✓ Backed up opal-data-source/trusted_issuers.json"
fi

# Create backup README
cat > "$BACKUP_DIR/README.md" <<EOF
# Legacy OPAL Data Backup

**Date:** $(date)
**Reason:** Migration to MongoDB SSOT architecture

This backup contains static JSON data files that were replaced by MongoDB as the single source of truth.

## Files Backed Up:
- policies/data.json (70+ NATO country issuers - loaded by OPA at startup)
- policies/tenant/*/data.json (tenant-specific static data)
- backend/data/opal/trusted_issuers.json (58 legacy issuers)
- opal-data-source/trusted_issuers.json (60 legacy issuers)

## Architecture Change:
**Before:** OPA loaded static JSON files at startup
**After:** OPA receives data from OPAL, which fetches from MongoDB

## Restoration (if needed):
To restore these files (NOT recommended):
\`\`\`bash
cp -r $BACKUP_DIR/* /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/
\`\`\`

**IMPORTANT:** Restoring these files will break MongoDB SSOT architecture!
EOF

echo "  ✅ Backup complete: $BACKUP_DIR"

# Phase 2: Delete static files
echo ""
echo "🗑️  Phase 2: Deleting static data files..."

FILES_DELETED=0

if [[ -f "$PROJECT_ROOT/policies/data.json" ]]; then
    rm -f "$PROJECT_ROOT/policies/data.json"
    echo "  ✓ Deleted policies/data.json"
    ((FILES_DELETED++))
fi

for TENANT in usa fra gbr deu; do
    if [[ -f "$PROJECT_ROOT/policies/tenant/$TENANT/data.json" ]]; then
        rm -f "$PROJECT_ROOT/policies/tenant/$TENANT/data.json"
        echo "  ✓ Deleted policies/tenant/$TENANT/data.json"
        ((FILES_DELETED++))
    fi
done

if [[ -f "$PROJECT_ROOT/backend/data/opal/trusted_issuers.json" ]]; then
    rm -f "$PROJECT_ROOT/backend/data/opal/trusted_issuers.json"
    echo "  ✓ Deleted backend/data/opal/trusted_issuers.json"
    ((FILES_DELETED++))
fi

if [[ -f "$PROJECT_ROOT/opal-data-source/trusted_issuers.json" ]]; then
    rm -f "$PROJECT_ROOT/opal-data-source/trusted_issuers.json"
    echo "  ✓ Deleted opal-data-source/trusted_issuers.json"
    ((FILES_DELETED++))
fi

# Create .gitkeep files
touch "$PROJECT_ROOT/policies/.gitkeep"
touch "$PROJECT_ROOT/backend/data/opal/.gitkeep"
touch "$PROJECT_ROOT/opal-data-source/.gitkeep"

echo "  ✅ Deleted $FILES_DELETED static data files"

# Phase 3: Update .gitignore
echo ""
echo "📝 Phase 3: Updating .gitignore..."

if ! grep -q "# OPAL SSOT: MongoDB is the single source of truth" "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
    cat >> "$PROJECT_ROOT/.gitignore" <<'EOF'

# OPAL SSOT: MongoDB is the single source of truth
# Static JSON data files should NOT be committed
policies/data.json
policies/tenant/*/data.json
backend/data/opal/trusted_issuers.json
backend/data/opal/federation_matrix.json
backend/data/opal/tenant_configs.json
opal-data-source/trusted_issuers.json
opal-data-source/federation_matrix.json

# Exception: Keep policy .rego files (policy logic, not data)
!policies/**/*.rego
EOF
    echo "  ✅ .gitignore updated"
else
    echo "  ℹ️  .gitignore already has OPAL SSOT rules"
fi

# Phase 4: Restart containers
echo ""
echo "🔄 Phase 4: Restarting OPAL and OPA containers..."

docker restart dive-hub-opal-server && echo "  ✓ Restarted OPAL server"
sleep 5
docker restart dive-hub-opa && echo "  ✓ Restarted Hub OPA"

if docker ps -q -f name=dive-spoke-fra-opa 2>/dev/null | grep -q .; then
    docker restart dive-spoke-fra-opa && echo "  ✓ Restarted FRA OPA"
fi

if docker ps -q -f name=dive-spoke-alb-opa 2>/dev/null | grep -q .; then
    docker restart dive-spoke-alb-opa && echo "  ✓ Restarted ALB OPA"
fi

echo "  ⏳ Waiting for containers to be healthy..."
sleep 10

echo "  ✅ Containers restarted"

# Phase 5: Force OPAL sync
echo ""
echo "🔄 Phase 5: Forcing OPAL data sync from MongoDB..."

# Trigger data refresh
curl -sk -X POST https://localhost:4000/api/opal/data/publish \
  -H "Content-Type: application/json" \
  -d '{
    "path": "trusted_issuers",
    "data": {},
    "reason": "Force sync after legacy cleanup"
  }' > /dev/null 2>&1 && echo "  ✓ Triggered OPAL data publish" || echo "  ⚠️  OPAL publish may have failed (check manually)"

sleep 5

echo "  ✅ OPAL sync triggered"

# Phase 6: Verification
echo ""
echo "🔍 Phase 6: Verifying MongoDB SSOT..."

# Check Hub OPA
ISSUER_COUNT=$(curl -sk https://localhost:8181/v1/data/dive/federation/trusted_issuers 2>/dev/null | jq -r 'keys | length' 2>/dev/null || echo "0")

echo ""
echo "  Hub OPA trusted issuers count: $ISSUER_COUNT"

if [[ "$ISSUER_COUNT" -le 3 ]] && [[ "$ISSUER_COUNT" -gt 0 ]]; then
    echo "  ✅ Verification passed (expected 1-3 issuers for current deployment)"
    echo ""
    echo "  Issuers in Hub OPA:"
    curl -sk https://localhost:8181/v1/data/dive/federation/trusted_issuers 2>/dev/null | jq -r 'keys[]' | sed 's/^/    - /'
elif [[ "$ISSUER_COUNT" -eq 0 ]]; then
    echo "  ⚠️  No issuers found - OPAL may need time to sync"
    echo "     Wait 30 seconds and run: curl -sk https://localhost:8181/v1/data/dive/federation/trusted_issuers | jq 'keys'"
elif [[ "$ISSUER_COUNT" -eq 13 ]]; then
    echo "  ⚠️  Still showing 13 issuers - OPA may have cached static bundle"
    echo "     Try manual OPA restart: docker restart dive-hub-opa"
    echo "     Then wait 30 seconds and re-check"
else
    echo "  ℹ️  Issuer count: $ISSUER_COUNT (verify this matches deployed instances)"
fi

# Check MongoDB
echo ""
echo "  MongoDB trusted_issuers count: "
docker exec dive-hub-mongodb mongosh --quiet \
  -u admin -p "${MONGO_PASSWORD:-admin}" --authenticationDatabase admin \
  --eval 'use("dive-v3"); db.trusted_issuers.countDocuments({})' 2>/dev/null || echo "    ⚠️  Could not query MongoDB"

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Next steps:"
echo "  1. Verify issuer count: ./dive hub status"
echo "  2. Check OPA data: curl -sk https://localhost:8181/v1/data/dive/federation/trusted_issuers | jq 'keys'"
echo "  3. Commit changes: git add -A && git commit -m 'feat(ssot): Remove legacy static OPAL data files'"
echo ""
echo "Backup location: $BACKUP_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
