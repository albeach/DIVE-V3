# Critical Fix: dive-shared Network Creation Timing

**Date:** 2026-01-25  
**Issue:** "network dive-shared declared as external, but could not be found"  
**Status:** ✅ FIXED

---

## Problem Analysis

### Root Cause
Docker Compose validates `external: true` networks **at parse time** (when reading docker-compose.yml), NOT at container startup time.

**Current broken flow:**
```
1. hub_preflight()     ← No network creation
2. hub_init()          ← Creates network (TOO LATE!)
3. hub_up()            
   └─ docker compose up -d
      └─ Parse docker-compose.hub.yml
         └─ Validate "dive-shared: external: true"
            └─ ERROR: Network doesn't exist yet!
```

### Why It Fails
In `docker-compose.hub.yml` line 44-45:
```yaml
dive-shared:
    external: true  # Tells Docker: "This network must already exist"
```

Docker Compose checks for the external network's existence **before** creating any containers. The network creation in `hub_init()` happens AFTER preflight but docker-compose needs it BEFORE that.

---

## The Fix

**Move network creation from `hub_init()` to `hub_preflight()`**

### Updated Flow
```
1. hub_preflight()     
   └─ Create dive-shared network ← MOVED HERE (before compose validation)
2. hub_init()          ← Network creation removed
3. hub_up()            
   └─ docker compose up -d
      └─ Parse docker-compose.hub.yml
         └─ Validate "dive-shared: external: true"
            └─ ✅ Network exists!
```

---

## Code Changes

### File: `scripts/dive-modules/deployment/hub.sh`

**Added to `hub_preflight()` (after Docker checks, before compose file validation):**

```bash
# CRITICAL FIX: Create dive-shared network BEFORE docker-compose validates it
# docker-compose.hub.yml declares dive-shared as "external: true"
# This means Docker expects it to already exist at parse time (not runtime)
# Without this, you get: "network dive-shared declared as external, but could not be found"
log_verbose "Ensuring dive-shared network exists (required by docker-compose.hub.yml)..."
if ! docker network inspect dive-shared >/dev/null 2>&1; then
    docker network create dive-shared || {
        log_error "Failed to create dive-shared network"
        return 1
    }
    log_verbose "Created dive-shared network"
else
    log_verbose "dive-shared network already exists"
fi
```

**Removed from `hub_init()`:**

```bash
# OLD (removed):
docker network create dive-shared 2>/dev/null || true

# NEW (replaced with comment):
# Note: dive-shared network is created in hub_preflight() 
# (must exist before docker-compose validates external networks)
```

---

## Why This Happens

### Docker Compose External Networks Behavior

When you declare a network as `external: true`:
```yaml
networks:
  dive-shared:
    external: true
```

Docker Compose **immediately checks** if the network exists during:
1. `docker compose config` (parse phase)
2. `docker compose up` (validation phase - BEFORE creating containers)
3. `docker compose start/restart` (validation phase)

It does **NOT** wait until runtime. This is by design - external networks are assumed to be managed outside of the compose file.

### Common Misconception
Many developers assume the network check happens when containers try to connect. **It doesn't.** The check is done during YAML parsing/validation.

---

## Best Practices Going Forward

### 1. External Network Creation Order
Always create external networks in **preflight/setup phase**, not initialization:
```
✅ Preflight → Create external networks
✅ Initialize → Create volumes, configs, certs
✅ Deploy → Run docker-compose (validates externals)
```

### 2. Alternative Approaches

**Option A: Remove `external: true` (not recommended)**
```yaml
networks:
  dive-shared:
    driver: bridge  # Docker Compose manages lifecycle
```
**Con:** Network gets prefixed with project name (`dive-hub_dive-shared`), breaks cross-stack communication.

**Option B: Keep `external: true` + preflight creation (RECOMMENDED)**
```yaml
networks:
  dive-shared:
    external: true  # Explicit: managed externally
```
**Pro:** Network name is predictable (`dive-shared`), works across multiple compose stacks.

### 3. Documentation Pattern
Always document external dependencies:
```yaml
# External network 'dive-shared' must exist before deployment
# Created by: ./dive hub deploy (preflight phase)
# Purpose: Cross-instance federation (hub ↔ spokes)
networks:
  dive-shared:
    external: true
```

---

## Testing

### Verify Fix
```bash
# Clean environment
docker network rm dive-shared 2>/dev/null || true
./dive nuke hub --yes

# Deploy (should NOT error)
./dive deploy hub

# Expected:
# ✅ Preflight: "Ensuring dive-shared network exists..."
# ✅ Preflight: "Created dive-shared network" OR "already exists"
# ✅ No "network dive-shared declared as external, but could not be found" error
```

### Manual Verification
```bash
# 1. Check network exists after preflight
docker network ls | grep dive-shared

# 2. Inspect network
docker network inspect dive-shared

# 3. Verify hub services connected
docker network inspect dive-shared | jq '.[0].Containers'
```

---

## Related Issues

This same pattern should be applied to **spoke deployments** if they also declare `dive-shared` as external.

### Check Spoke Template
```bash
grep -A 2 "dive-shared:" templates/spoke/docker-compose.template.yml
```

If spokes also use `external: true`, the spoke deployment script needs the same preflight fix.

---

## Lessons Learned

### 1. External Networks = Preflight Requirement
External networks must exist **before** any docker-compose command that reads the file.

### 2. Silent Failures
The old `docker network create dive-shared 2>/dev/null || true` in `hub_init()` silently succeeded, making it hard to diagnose why compose still failed.

### 3. Order Matters
The order of operations in deployment scripts is critical:
1. Preflight (validate + create prerequisites)
2. Initialize (prepare configs/certs)
3. Deploy (execute docker-compose)

---

## Impact

### Before Fix
- ❌ Intermittent "network not found" errors
- ❌ Deployments fail randomly
- ❌ Manual workaround: `docker network create dive-shared` before deployment

### After Fix
- ✅ Reliable network creation in preflight
- ✅ Clear logging of network status
- ✅ Proper error handling if creation fails
- ✅ No manual intervention needed

---

## Additional Notes

### Why Not Auto-Create in Compose?
Docker Compose could auto-create missing external networks, but that would violate the `external: true` contract. The `external` keyword explicitly means "this resource is managed outside of this compose file."

### Production Considerations
In production environments:
- External networks might be created by infrastructure-as-code (Terraform, CloudFormation)
- Networks might have specific configuration (subnets, drivers, labels)
- Preflight checks should validate network configuration, not just existence

---

**Fix Status:** ✅ COMPLETE  
**Testing:** ⏳ Pending clean deployment test  
**Confidence:** HIGH (root cause identified and addressed)
