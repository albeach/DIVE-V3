# 🚨 EMERGENCY: Federation Restoration Required

## Problem Statement

The Keycloak database volumes were reset to fix admin credential issues. This **wiped all federation IdP brokers** that were previously configured between:

- USA ↔ FRA (bidirectional)
- USA ↔ GBR (bidirectional)  
- USA ↔ DEU (bidirectional)
- FRA ↔ GBR (bidirectional)
- FRA ↔ DEU (bidirectional)
- GBR ↔ DEU (bidirectional)

## Current State

| Instance | Keycloak Status | dive-v3-broker Realm | Federation IdPs |
|----------|-----------------|---------------------|-----------------|
| USA | ✅ Running | ✅ Created | ❌ Only Spain SAML |
| FRA | ✅ Running | ✅ Created | ❌ Only Spain SAML |
| GBR | ✅ Running | ✅ Created | ❌ Only Spain SAML |
| DEU | ⚠️ Remote | Unknown | Unknown |

## Required Federation Matrix

From `config/federation-registry.json`:

```
USA → [FRA, GBR, DEU]
FRA → [USA, GBR, DEU]
GBR → [USA, FRA, DEU]
DEU → [USA, FRA, GBR]
```

## Restoration Approach

### Option 1: Use `add-federation-partner.sh` Script

The script creates bidirectional OIDC IdP brokers automatically:

```bash
# Federate USA ↔ FRA
./scripts/add-federation-partner.sh USA FRA

# Federate USA ↔ GBR
./scripts/add-federation-partner.sh USA GBR

# Federate FRA ↔ GBR  
./scripts/add-federation-partner.sh FRA GBR

# Federate with DEU (remote)
./scripts/add-federation-partner.sh USA DEU
./scripts/add-federation-partner.sh FRA DEU
./scripts/add-federation-partner.sh GBR DEU
```

**Issues:**
- Script uses `admin` password but instances have different passwords
- DEU is remote at prosecurity.biz

### Option 2: Manual Keycloak Admin API

Create IdP brokers directly via Keycloak Admin API.

### Option 3: Terraform

Add IdP broker resources to terraform configuration.

## Admin Passwords (Current)

| Instance | Password |
|----------|----------|
| USA | `DivePilot2025!` |
| FRA | `admin` |
| GBR | `DivePilot2025!SecureAdmin` |
| DEU | Unknown (remote) |

## Recommended Next Steps

1. **Standardize passwords** - Update FRA and GBR to use `DivePilot2025!`
2. **Run federation script** with correct passwords
3. **Verify DEU remote** instance status
4. **Create federation** using script or API
5. **Test cross-instance authentication**

---

**Status:** PENDING - Awaiting user decision on approach









