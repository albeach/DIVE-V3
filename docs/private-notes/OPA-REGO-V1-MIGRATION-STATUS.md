# OPA Rego v1 Migration Status Report

**Date:** October 26, 2025
**Status:** 🚧 IN PROGRESS - Syntax Issues Blocking
**OPA Version:** 1.9.0 (latest, multi-arch support confirmed)

---

## 🎯 Objective

Upgrade OPA from v0.68.0 to latest (v1.9.0) to resolve:
1. Health check failures (OPA crashing at startup)
2. Multi-architecture support (ARM64/AMD64)
3. Rego v1 compliance

---

## ✅ Completed Steps

### 1. Docker Configuration
- ✅ Updated `docker-compose.yml` to use `openpolicyagent/opa:latest`
- ✅ Added `platform: linux/amd64` for cross-platform compatibility
- ✅ Updated health check to use `wget` instead of `curl`

### 2. Keycloak Health Check
- ✅ Fixed Keycloak health check endpoint
- ✅ Changed from `/health/ready` (404) to `/realms/master` (working)
- ✅ Keycloak now starting successfully (health: starting)

### 3. Rego Policy Updates
- ✅ Removed `default` keyword from rules referenced in objects (`allow`, `decision_reason`, `obligations`, `evaluation_details`)
- ✅ Changed decision objects to use rule body syntax: `decision := d if { d := {...} }`
- ✅ Updated 4 policy files:
  - `policies/federation_abac_policy.rego`
  - `policies/object_abac_policy.rego`
  - `policies/fuel_inventory_abac_policy.rego`
  - `policies/admin_authorization_policy.rego`

---

## ❌ Blocking Issue

**Error:** Persistent Rego parse error across federation and object policies

```
/policies/federation_abac_policy.rego:200: rego_parse_error: unexpected identifier token: non-terminated object
	"allow": allow,
	         ^
```

### Root Cause Analysis

The issue appears to be that OPA 1.9.0's parser is rejecting the pattern:

```rego
decision := d if {
    d := {
        "allow": allow,          # ← Error here
        "reason": decision_reason,
        "evaluation_details": { ... }
    }
}
```

**Despite:**
- ✅ Syntax validating in isolated test files
- ✅ `allow` and `decision_reason` having correct definitions
- ✅ No `default` keyword on referenced rules
- ✅ File encoding verified as UTF-8
- ✅ No invisible characters detected

---

## 🔍 Attempted Fixes (All Failed)

1. ❌ Partial object rules (`decision["allow"] := allow`)
2. ❌ Separate evaluation_details rule
3. ❌ Using intermediate variables in rule body
4. ❌ Inlining nested objects
5. ❌ Removing default keywords
6. ❌ Full container recreation
7. ❌ Direct OPA fmt migration tool

---

## 💡 Recommended Path Forward

### Option A: Simplify Decision Structure (Recommended)
Remove nested `evaluation_details` and flatten the decision object:

```rego
decision := d if {
    d := {
        "allow": allow,
        "reason": decision_reason
    }
}
```

**Pros:** Simpler, likely to work
**Cons:** Loses detailed evaluation info (can add back incrementally)

### Option B: Use OPA v0.68.0 with Fixed Health Check
Revert OPA version but keep health check fixes:

```yaml
opa:
  image: openpolicyagent/opa:0.68.0
  healthcheck:
    test: ["CMD-SHELL", "wget --spider --quiet http://localhost:8181/health || exit 1"]
```

**Pros:** Policies work as-is
**Cons:** Doesn't resolve ARM64 compatibility, older Rego version

### Option C: Complete Policy Rewrite for Rego v1
Rewrite all 4 policies from scratch using Rego v1 best practices from OPA documentation.

**Pros:** Future-proof, clean implementation
**Cons:** Time-intensive (4-6 hours), high risk of new bugs

---

## 📊 Current State

| Component | Status | Health |
|-----------|--------|--------|
| **Keycloak** | ✅ Fixed | Starting |
| **OPA** | ❌ Crashing | Down |
| **Postgres** | ✅ Working | Healthy |
| **MongoDB** | ✅ Working | Healthy |
| **Redis** | ✅ Working | Healthy |
| **AuthzForce** | ⚠️ Unknown | N/A |
| **Backend API** | ✅ Working | Up |
| **Frontend** | ✅ Working | Up |

---

## 🚀 Next Steps (Your Choice)

1. **Option A** (15 min): Simplify decision structure, test OPA startup
2. **Option B** (5 min): Revert to v0.68.0 with health fix
3. **Option C** (4-6 hrs): Complete Rego v1 rewrite

**My Recommendation:** Option A first (quick win), then Option C when time permits.

---

##Files Modified

- `docker-compose.yml` - OPA version + health checks
- `policies/federation_abac_policy.rego` - Rego v1 syntax
- `policies/object_abac_policy.rego` - Rego v1 syntax
- `policies/fuel_inventory_abac_policy.rego` - Rego v1 syntax
- `policies/admin_authorization_policy.rego` - Rego v1 syntax




