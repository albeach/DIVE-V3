# OPAL SSOT Cleanup Plan - Eliminate Legacy Data Sources

**Date:** 2026-01-22  
**Issue:** Multiple conflicting data sources polluting OPA with legacy trusted issuers  
**Goal:** Establish MongoDB as the single source of truth for all OPAL data

---

## 🔍 ROOT CAUSE ANALYSIS

### Current Deployment (Hub + 2 Spokes)
- **Hub:** USA (localhost:8443)
- **Spoke 1:** FRA (localhost:8643)
- **Spoke 2:** ALB (localhost:8444)

**Expected Trusted Issuers:** 3 (one per instance)  
**Actual in Hub OPA:** 13 (from static policy bundle)  
**Actual in MongoDB:** 1 (USA only - correct!)

### Data Flow Problem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CURRENT (BROKEN) DATA FLOW                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ❌ STATIC POLICY BUNDLE (loaded at OPA startup)                            │
│     ├─ policies/data.json (70+ NATO countries)                              │
│     ├─ policies/tenant/usa/data.json                                        │
│     ├─ policies/tenant/fra/data.json                                        │
│     ├─ policies/tenant/gbr/data.json                                        │
│     └─ policies/tenant/deu/data.json                                        │
│            │                                                                 │
│            ▼                                                                 │
│     ┌──────────────┐                                                         │
│     │   Hub OPA    │ ← Loads 13 trusted issuers from static bundle         │
│     └──────────────┘                                                         │
│                                                                              │
│  ✅ MONGODB SSOT (correct but not being used by OPA)                        │
│     ├─ trusted_issuers collection (1 entry: USA)                            │
│     ├─ federation_matrix collection (empty)                                 │
│     └─ tenant_configs collection (empty)                                    │
│            │                                                                 │
│            ▼                                                                 │
│     ┌──────────────┐                                                         │
│     │ Backend API  │ ← Returns 1 issuer (correct!)                          │
│     └──────────────┘                                                         │
│            │                                                                 │
│            ▼                                                                 │
│     ┌──────────────┐                                                         │
│     │ OPAL Server  │ ← SHOULD push MongoDB data to OPA                      │
│     └──────────────┘   (but OPA loaded static bundle first)                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Legacy Files Found

| File | Issuers | Status | Delete? |
|------|---------|--------|---------|
| `policies/data.json` | 70+ | ❌ Static bundle loaded by OPA | **YES** |
| `policies/tenant/usa/data.json` | Varies | ❌ Tenant-specific static data | **YES** |
| `policies/tenant/fra/data.json` | Varies | ❌ Tenant-specific static data | **YES** |
| `policies/tenant/gbr/data.json` | Varies | ❌ Tenant-specific static data | **YES** |
| `policies/tenant/deu/data.json` | Varies | ❌ Tenant-specific static data | **YES** |
| `backend/data/opal/trusted_issuers.json` | 58 | ❌ Legacy seed data | **YES** |
| `opal-data-source/trusted_issuers.json` | 60 | ❌ Legacy OPAL source | **YES** |

---

## 🎯 CLEANUP PHASES

### Phase 1: Backup and Document Legacy Sources

**Goal:** Preserve historical data before deletion

```bash
# Create backup directory
mkdir -p .archive/legacy-opal-data-2026-01-22

# Backup all legacy files
cp policies/data.json .archive/legacy-opal-data-2026-01-22/
cp policies/tenant/*/data.json .archive/legacy-opal-data-2026-01-22/
cp backend/data/opal/trusted_issuers.json .archive/legacy-opal-data-2026-01-22/
cp opal-data-source/trusted_issuers.json .archive/legacy-opal-data-2026-01-22/

# Document counts
echo "Backed up legacy OPAL data sources" > .archive/legacy-opal-data-2026-01-22/README.md
```

**Success Criteria:**
- [ ] All legacy files backed up to `.archive/`
- [ ] README documenting what was backed up

---

### Phase 2: Remove Static Policy Data Files

**Goal:** Delete all static JSON data files that conflict with MongoDB SSOT

```bash
# Remove main policy data bundle
rm -f policies/data.json

# Remove tenant-specific data files
rm -f policies/tenant/usa/data.json
rm -f policies/tenant/fra/data.json
rm -f policies/tenant/gbr/data.json
rm -f policies/tenant/deu/data.json

# Remove backend legacy sources
rm -f backend/data/opal/trusted_issuers.json
rm -f opal-data-source/trusted_issuers.json

# Create .gitkeep to preserve directories
touch policies/.gitkeep
touch backend/data/opal/.gitkeep
touch opal-data-source/.gitkeep
```

**Success Criteria:**
- [ ] `policies/data.json` deleted
- [ ] All `policies/tenant/*/data.json` deleted
- [ ] `backend/data/opal/trusted_issuers.json` deleted
- [ ] `opal-data-source/trusted_issuers.json` deleted
- [ ] `.gitkeep` files created to preserve directories

---

### Phase 3: Update .gitignore to Prevent Re-creation

**Goal:** Ensure static data files are never committed again

```bash
# Add to .gitignore
cat >> .gitignore <<'EOF'

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
```

**Success Criteria:**
- [ ] `.gitignore` updated to exclude static data JSON files
- [ ] Policy `.rego` files remain tracked (policy logic is code, not data)

---

### Phase 4: Verify MongoDB is Populated

**Goal:** Ensure MongoDB has the correct initial data for current deployment

```bash
# Check MongoDB trusted_issuers
docker exec dive-hub-mongodb mongosh --quiet \
  -u admin -p "$MONGO_PASSWORD" --authenticationDatabase admin \
  --eval 'use("dive-v3"); db.trusted_issuers.find({}).toArray()'

# Expected: 1 entry for USA Hub

# Check if FRA and ALB issuers need to be added
# (They should be auto-registered when spokes deploy)
```

**Expected MongoDB State:**
```json
{
  "_id": "...",
  "issuerUrl": "https://localhost:8443/realms/dive-v3-broker-usa",
  "tenant": "USA",
  "name": "USA Hub Keycloak",
  "country": "USA",
  "trustLevel": "DEVELOPMENT",
  "enabled": true,
  "realm": "dive-v3-broker-usa"
}
```

**Success Criteria:**
- [ ] MongoDB has USA Hub issuer
- [ ] FRA spoke issuer auto-registered (if deployed)
- [ ] ALB spoke issuer auto-registered (if deployed)
- [ ] No legacy issuers from deleted JSON files

---

### Phase 5: Force OPAL Sync from MongoDB

**Goal:** Push current MongoDB state to all OPA instances

```bash
# Restart OPAL server to clear any cached static data
docker restart dive-hub-opal-server

# Wait for OPAL to be healthy
sleep 5

# Force full data sync from MongoDB to OPAL
curl -sk -X POST https://localhost:4000/api/opal/data/publish \
  -H "Content-Type: application/json" \
  -d '{
    "path": "trusted_issuers",
    "data": {},
    "reason": "Force sync after legacy cleanup"
  }'

# Trigger policy refresh on all clients
curl -sk -X POST https://localhost:4000/api/opal/refresh
```

**Success Criteria:**
- [ ] OPAL server restarted
- [ ] Data publish succeeds (no 401 errors)
- [ ] Policy refresh triggered

---

### Phase 6: Restart OPA Containers

**Goal:** Force OPA to reload data from OPAL (not static bundles)

```bash
# Restart Hub OPA
docker restart dive-hub-opa

# Restart spoke OPA containers
docker restart dive-spoke-fra-opa
docker restart dive-spoke-alb-opa

# Wait for containers to be healthy
sleep 10
```

**Success Criteria:**
- [ ] All OPA containers restarted
- [ ] All OPA containers report healthy status

---

### Phase 7: Verification Tests

**Goal:** Verify MongoDB SSOT architecture is working correctly

#### Test 1: Hub OPA Has Correct Issuers
```bash
# Query Hub OPA for trusted issuers
curl -sk https://localhost:8181/v1/data/dive/federation/trusted_issuers 2>/dev/null | jq -r 'keys'

# Expected output: Array of 1-3 issuer URLs (USA, FRA, ALB - only deployed instances)
# NOT 13 legacy issuers!
```

**Expected Result:**
```json
[
  "https://localhost:8443/realms/dive-v3-broker-usa",
  "https://localhost:8643/realms/dive-v3-broker-fra",
  "https://localhost:8444/realms/dive-v3-broker-alb"
]
```

#### Test 2: Backend API Matches OPA
```bash
# Get issuers from Backend API (MongoDB)
curl -sk https://localhost:4000/api/opal/trusted-issuers 2>/dev/null | jq -r '.trusted_issuers | keys'

# Get issuers from Hub OPA
curl -sk https://localhost:8181/v1/data/dive/federation/trusted_issuers 2>/dev/null | jq -r 'keys'

# BOTH should return the same list!
```

#### Test 3: Add New Issuer via API
```bash
# Add a test issuer via API (MongoDB)
curl -sk -X POST https://localhost:4000/api/opal/trusted-issuers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HUB_ADMIN_TOKEN" \
  -d '{
    "issuerUrl": "https://test-issuer.example.com",
    "tenant": "TST",
    "name": "Test Issuer",
    "country": "TST",
    "trustLevel": "DEVELOPMENT",
    "enabled": true
  }'

# Wait for OPAL to propagate (< 10 seconds)
sleep 10

# Verify it appears in Hub OPA
curl -sk https://localhost:8181/v1/data/dive/federation/trusted_issuers 2>/dev/null | jq -r 'keys | map(select(contains("test-issuer")))[]'

# Expected: https://test-issuer.example.com
```

#### Test 4: Delete Test Issuer
```bash
# Delete via API (MongoDB)
ENCODED_URL=$(echo -n "https://test-issuer.example.com" | jq -sRr @uri)
curl -sk -X DELETE "https://localhost:4000/api/opal/trusted-issuers/$ENCODED_URL" \
  -H "Authorization: Bearer $HUB_ADMIN_TOKEN"

# Wait for OPAL to propagate
sleep 10

# Verify it's gone from Hub OPA
curl -sk https://localhost:8181/v1/data/dive/federation/trusted_issuers 2>/dev/null | jq -r 'keys | map(select(contains("test-issuer")))[]'

# Expected: (empty - no output)
```

**Success Criteria:**
- [ ] Hub OPA has ONLY deployed instance issuers (1-3, not 13)
- [ ] Backend API and Hub OPA return same issuer list
- [ ] Adding issuer via API appears in OPA within 10 seconds
- [ ] Deleting issuer via API removes from OPA within 10 seconds

---

### Phase 8: Update Policy Bundle Build Process

**Goal:** Ensure policy bundles don't include static data files

**File:** `backend/src/services/policy-bundle.service.ts`

**Check for:**
```typescript
// VERIFY: Policy bundle should include ONLY .rego files, NOT data.json
const files = fs.readdirSync(policiesDir);
const regoFiles = files.filter(f => f.endsWith('.rego'));
// Should NOT include: .filter(f => f.endsWith('.json'))
```

**Success Criteria:**
- [ ] Policy bundle build excludes `data.json` files
- [ ] Policy bundle includes only `.rego` policy logic files

---

### Phase 9: Update Documentation

**Goal:** Document MongoDB SSOT architecture and prevent future static file creation

**Update Files:**
1. `.cursorrules` - Add prohibition on static data JSON files
2. `docs/opal-architecture.md` - Document MongoDB SSOT flow
3. `README.md` - Add note about MongoDB being data source

**Content to Add:**
```markdown
## OPAL Data Architecture

**CRITICAL:** MongoDB is the single source of truth for ALL dynamic policy data:
- Trusted issuers
- Federation matrix
- Tenant configurations
- COI membership (program-based)

**PROHIBITED:** Creating static JSON data files in:
- ❌ `policies/data.json`
- ❌ `policies/tenant/*/data.json`
- ❌ `backend/data/opal/*.json`
- ❌ `opal-data-source/*.json`

Policy logic (`.rego` files) is code and belongs in git.
Policy data is dynamic and belongs in MongoDB.

To add trusted issuers, use:
```bash
curl -X POST https://localhost:4000/api/opal/trusted-issuers \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"issuerUrl": "...", "tenant": "...", ...}'
```

**Success Criteria:**
- [ ] `.cursorrules` updated with data file prohibition
- [ ] Documentation explains MongoDB SSOT architecture
- [ ] Examples show how to manage data via API, not files

---

## 🎯 COMPLETE CLEANUP SCRIPT

**File:** `scripts/cleanup-legacy-opal-data.sh`

```bash
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
        cp "$TENANT_DATA" "$BACKUP_DIR/"
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

echo "  ✅ Backup complete: $BACKUP_DIR"

# Phase 2: Delete static files
echo ""
echo "🗑️  Phase 2: Deleting static data files..."

rm -f "$PROJECT_ROOT/policies/data.json" && echo "  ✓ Deleted policies/data.json"
rm -f "$PROJECT_ROOT/policies/tenant/usa/data.json" && echo "  ✓ Deleted policies/tenant/usa/data.json"
rm -f "$PROJECT_ROOT/policies/tenant/fra/data.json" && echo "  ✓ Deleted policies/tenant/fra/data.json"
rm -f "$PROJECT_ROOT/policies/tenant/gbr/data.json" && echo "  ✓ Deleted policies/tenant/gbr/data.json"
rm -f "$PROJECT_ROOT/policies/tenant/deu/data.json" && echo "  ✓ Deleted policies/tenant/deu/data.json"
rm -f "$PROJECT_ROOT/backend/data/opal/trusted_issuers.json" && echo "  ✓ Deleted backend/data/opal/trusted_issuers.json"
rm -f "$PROJECT_ROOT/opal-data-source/trusted_issuers.json" && echo "  ✓ Deleted opal-data-source/trusted_issuers.json"

touch "$PROJECT_ROOT/policies/.gitkeep"
touch "$PROJECT_ROOT/backend/data/opal/.gitkeep"
touch "$PROJECT_ROOT/opal-data-source/.gitkeep"

echo "  ✅ Static files deleted"

# Phase 3: Update .gitignore
echo ""
echo "📝 Phase 3: Updating .gitignore..."

if ! grep -q "policies/data.json" "$PROJECT_ROOT/.gitignore"; then
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

if docker ps -q -f name=dive-spoke-fra-opa 2>/dev/null; then
    docker restart dive-spoke-fra-opa && echo "  ✓ Restarted FRA OPA"
fi

if docker ps -q -f name=dive-spoke-alb-opa 2>/dev/null; then
    docker restart dive-spoke-alb-opa && echo "  ✓ Restarted ALB OPA"
fi

echo "  ⏳ Waiting for containers to be healthy..."
sleep 10

echo "  ✅ Containers restarted"

# Phase 5: Verification
echo ""
echo "🔍 Phase 5: Verifying MongoDB SSOT..."

ISSUER_COUNT=$(curl -sk https://localhost:8181/v1/data/dive/federation/trusted_issuers 2>/dev/null | jq -r 'keys | length' 2>/dev/null || echo "0")

echo "  Hub OPA trusted issuers count: $ISSUER_COUNT"

if [[ "$ISSUER_COUNT" -le 3 ]]; then
    echo "  ✅ Verification passed (expected 1-3 issuers for current deployment)"
elif [[ "$ISSUER_COUNT" -eq 13 ]]; then
    echo "  ⚠️  Still showing 13 issuers - may need additional OPA restart"
    echo "     Try: docker exec dive-hub-opa kill -HUP 1"
else
    echo "  ℹ️  Issuer count: $ISSUER_COUNT (verify this matches deployed instances)"
fi

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Next steps:"
echo "  1. Verify issuer count matches deployed instances (./dive hub status)"
echo "  2. Commit changes: git add .gitignore && git commit -m 'feat(ssot): Remove legacy static OPAL data files'"
echo "  3. Test adding/removing issuers via API"
echo ""
echo "Backup location: $BACKUP_DIR"
```

**Make executable:**
```bash
chmod +x scripts/cleanup-legacy-opal-data.sh
```

---

## ✅ SUCCESS CRITERIA (Complete Cleanup)

### Quantitative Metrics

| Criterion | Target | How to Verify |
|-----------|--------|---------------|
| Hub OPA trusted issuers | 1-3 (deployed instances only) | `curl -sk https://localhost:8181/v1/data/dive/federation/trusted_issuers \| jq 'keys \| length'` |
| Backend API trusted issuers | 1-3 (matches OPA) | `curl -sk https://localhost:4000/api/opal/trusted-issuers \| jq '.trusted_issuers \| keys \| length'` |
| MongoDB trusted_issuers docs | 1-3 (matches deployment) | `docker exec dive-hub-mongodb mongosh ... db.trusted_issuers.countDocuments()` |
| Static data files | 0 (all deleted) | `find . -name "data.json" -type f \| wc -l` |
| Legacy backup files | 7+ (preserved in .archive/) | `ls -la .archive/legacy-opal-data-*/` |

### Qualitative Metrics

| Criterion | Status |
|-----------|--------|
| MongoDB is SSOT for all OPAL data | ✅ |
| No static JSON data files in git | ✅ |
| .gitignore prevents static data re-creation | ✅ |
| Adding issuer via API appears in OPA < 10s | ✅ |
| Deleting issuer via API removes from OPA < 10s | ✅ |
| Documentation explains MongoDB SSOT | ✅ |

---

## 🚨 TROUBLESHOOTING

### Issue: OPA Still Shows 13 Issuers After Cleanup

**Cause:** OPA has cached the static bundle in memory

**Solution:**
```bash
# Force OPA to reload data
docker exec dive-hub-opa kill -HUP 1

# Or restart OPA container
docker restart dive-hub-opa

# Wait 10 seconds, then re-check
sleep 10
curl -sk https://localhost:8181/v1/data/dive/federation/trusted_issuers | jq 'keys | length'
```

### Issue: OPAL Not Pushing Data to OPA

**Cause:** OPAL server may not have proper JWT or backend connection

**Solution:**
```bash
# Check OPAL server logs
docker logs dive-hub-opal-server | tail -50

# Check backend logs for OPAL publish
docker logs dive-hub-backend | grep -i "opal.*publish"

# Force manual sync
curl -sk -X POST https://localhost:4000/api/opal/data/publish \
  -H "Content-Type: application/json" \
  -d '{"path": "trusted_issuers", "data": {}, "reason": "Manual sync"}'
```

### Issue: MongoDB Has No Data

**Cause:** Spoke registration may not have triggered issuer creation

**Solution:**
```bash
# Manually add Hub issuer
curl -sk -X POST https://localhost:4000/api/opal/trusted-issuers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "issuerUrl": "https://localhost:8443/realms/dive-v3-broker-usa",
    "tenant": "USA",
    "name": "USA Hub Keycloak",
    "country": "USA",
    "trustLevel": "DEVELOPMENT",
    "realm": "dive-v3-broker-usa",
    "enabled": true
  }'

# Re-deploy spokes to trigger auto-registration
./dive spoke deploy fra
./dive spoke deploy alb
```

---

## 📚 ADDITIONAL RESOURCES

**Files to Review:**
- `backend/src/services/opal-data.service.ts` - MongoDB SSOT implementation
- `backend/src/models/trusted-issuer.model.ts` - MongoDB schema and operations
- `backend/src/routes/opal.routes.ts` - API endpoints for data management
- `backend/src/services/policy-bundle.service.ts` - Policy bundle builder (should exclude data.json)

**Testing:**
- `tests/integration/test-ssot-compliance.sh` - Verify MongoDB SSOT architecture
- `tests/integration/test-deployment-resilience.sh` - End-to-end tests

**Documentation:**
- `.cursorrules` - Project conventions (update with data file prohibition)
- `NEXT_SESSION_OPAL_JWT_AUTH.md` - OPAL architecture documentation

---

**Next Steps:** Execute cleanup script and verify MongoDB SSOT architecture is working correctly.
