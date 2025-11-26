# DIVE V3 - Terraform Infrastructure as Code Audit

## Executive Summary

**Critical Finding:** The DIVE V3 infrastructure has **TWO SEPARATE Terraform configurations** that have been confused, resulting in a deployed system that doesn't match either configuration.

| Aspect | Expected | Actual |
|--------|----------|--------|
| Identity Providers | 10+ (USA, FRA, DEU, CAN, etc.) | **1 (Spain SAML only)** |
| Test Users | 44+ across all clearance levels | **1 (admin-dive only)** |
| Realms | Multiple national realms | **2 (broker + external-sp)** |
| Federation | Full partner federation | **None functional** |

---

## Root Cause Analysis

### Problem 1: Two Competing Terraform Configurations

```
terraform/                          <-- LEGACY (being used incorrectly)
├── *.tf (9 active files)           
├── archive/ (22 archived files)    <-- These WERE the IdPs & users!
├── modules/                        
└── terraform.tfstate               <-- Old state (652 resources)

terraform/instances/                <-- CORRECT NEW APPROACH
├── instance.tf                     <-- Calls federated-instance module
├── provider.tf
├── variables.tf
├── *.tfvars                        <-- Instance configs (USA, FRA, DEU)
└── terraform.tfstate.d/            <-- Workspace states
    ├── usa/
    ├── fra/
    └── deu/
```

### Problem 2: Terraform Run from Wrong Directory

**What happened:**
```bash
# Someone ran this (WRONG):
cd terraform
terraform apply

# This used the legacy config with 22 files ARCHIVED
# Result: Only Spain SAML IdP created, no test users
```

**What should happen:**
```bash
# CORRECT approach:
cd terraform/instances
terraform workspace select usa
terraform apply -var-file=usa.tfvars
```

### Problem 3: State Drift and Workspace Confusion

| Directory | Workspace | Resources in State | Resources in Keycloak |
|-----------|-----------|-------------------|----------------------|
| terraform/ | default | 652 (stale!) | Does not match |
| terraform/instances/ | usa | 6 | Minimal |
| terraform/instances/ | fra | 61 | ~50% applied |
| terraform/instances/ | deu | 72 | ~50% applied |

The `terraform/` directory has **stale state** referencing resources that:
- Were deleted when the database was reset
- Were never recreated because files were archived
- Are referenced but the Terraform config no longer defines them

---

## Architectural Assessment

### Intended Architecture (terraform/instances/)

```
┌─────────────────────────────────────────────────────────────────┐
│                    FEDERATED INSTANCE MODULE                     │
│                  (modules/federated-instance/)                   │
├─────────────────────────────────────────────────────────────────┤
│  INPUTS (from .tfvars):                                         │
│  - instance_code (USA, FRA, DEU, etc.)                         │
│  - app_url, api_url, idp_url                                   │
│  - federation_partners (map of partner instances)               │
│  - create_test_users (boolean)                                  │
├─────────────────────────────────────────────────────────────────┤
│  CREATES:                                                       │
│  ├── Keycloak Realm (dive-v3-broker)                           │
│  ├── OIDC Client (dive-v3-client-broker)                       │
│  ├── Protocol Mappers (uniqueID, clearance, country, etc.)     │
│  ├── Federation IdPs (from federation_partners)                 │
│  ├── Test Users (by clearance level)                           │
│  └── MFA Authentication Flow                                    │
└─────────────────────────────────────────────────────────────────┘
```

This is a **well-designed** modular approach! The problem is it was never used.

### What Was Actually Run (terraform/)

```
┌─────────────────────────────────────────────────────────────────┐
│                    LEGACY CONFIGURATION                          │
│                       (terraform/)                               │
├─────────────────────────────────────────────────────────────────┤
│  ACTIVE FILES (9):                                              │
│  ├── broker-realm.tf (core realm only)                         │
│  ├── broker-mfa-only.tf (MFA flows)                            │
│  ├── external-idp-spain-saml.tf (Spain only!)                  │
│  ├── keycloak-external-sp-realm.tf                             │
│  └── main.tf, variables.tf, outputs.tf, modules.tf, multi-realm.tf │
├─────────────────────────────────────────────────────────────────┤
│  ARCHIVED FILES (22):                                           │
│  ├── all-test-users.tf          ← WHERE THE USERS WERE!        │
│  ├── usa-broker.tf              ← WHERE USA IdP WAS!           │
│  ├── fra-broker.tf              ← WHERE FRA IdP WAS!           │
│  ├── deu-broker.tf, gbr-broker.tf, etc.                        │
│  └── usa-realm.tf, fra-realm.tf, etc.                          │
└─────────────────────────────────────────────────────────────────┘
```

When `terraform apply` was run from `terraform/`, only the **9 active files** were processed. The IdPs and users were in the **22 archived files**!

---

## Impact Assessment

| Impact Area | Severity | Description |
|-------------|----------|-------------|
| Authentication | 🔴 CRITICAL | No IdPs to select - users can't log in |
| Testing | 🔴 CRITICAL | No test users - E2E tests impossible |
| Federation | 🔴 CRITICAL | No partner IdPs - federation broken |
| Demo/Pilot | 🔴 CRITICAL | Cannot demonstrate core functionality |
| State Management | 🟡 HIGH | 652 stale resources in state |
| Confusion | 🟡 HIGH | Two configs, unclear which to use |

---

## Recommended Remediation

### Option A: Use the New Modular Approach (RECOMMENDED)

This is the cleaner, more maintainable approach:

```bash
# 1. Navigate to the instances directory
cd terraform/instances

# 2. Initialize Terraform
terraform init

# 3. For USA instance:
terraform workspace select usa || terraform workspace new usa
terraform apply -var-file=usa.tfvars

# 4. For FRA instance:
terraform workspace select fra || terraform workspace new fra  
terraform apply -var-file=fra.tfvars

# 5. For DEU instance:
terraform workspace select deu || terraform workspace new deu
terraform apply -var-file=deu.tfvars
```

**Pros:**
- Clean, modular design
- Each instance has its own state
- Easy to add new instances
- Follows Terraform best practices

**Cons:**
- Need to understand workspace concept
- Multiple apply commands needed

### Option B: Restore Legacy Configuration

Move archived files back to active:

```bash
cd terraform
mv archive/*.tf ./
terraform apply
```

**Pros:**
- Single terraform apply
- Familiar structure

**Cons:**
- Monolithic configuration
- Harder to manage per-instance
- Against IaC best practices

---

## Immediate Actions Required

### Step 1: Decide on Architecture

**Decision required:** Which approach will you use going forward?

- [ ] Option A: New modular approach (terraform/instances/)
- [ ] Option B: Legacy monolithic approach (terraform/)

### Step 2: Clean Up State (if using Option A)

```bash
# Delete stale state from legacy directory
cd terraform
rm -rf terraform.tfstate*
rm -rf .terraform

# Use instances/ as the source of truth
cd instances
terraform init
```

### Step 3: Apply Configuration

For Option A:
```bash
cd terraform/instances
terraform workspace select usa
terraform apply -var-file=usa.tfvars -auto-approve
```

### Step 4: Verify Deployment

```bash
# Check IdPs
curl -sk "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances" \
  -H "Authorization: Bearer $TOKEN" | jq '.[].alias'

# Check Users  
curl -sk "https://localhost:8443/admin/realms/dive-v3-broker/users?max=50" \
  -H "Authorization: Bearer $TOKEN" | jq '.[].username'
```

---

## Lessons Learned

### 1. Single Source of Truth
Never have two competing Terraform configurations. Either:
- Use one directory
- Or clearly document which is deprecated

### 2. Don't Archive Active Resources
When refactoring Terraform:
- Migrate state, don't just move files
- Use `terraform state mv` for resource moves
- Or `terraform import` for existing resources

### 3. Document the Workflow
The `terraform/instances/` approach is good, but:
- README.md should explain "run from HERE"
- Scripts should enforce correct directory
- CI/CD should codify the correct path

### 4. Validate After Apply
Always verify what Terraform claims to create:
```bash
# After terraform apply, CHECK:
- Are the IdPs actually in Keycloak?
- Are the users actually created?
- Can you actually log in?
```

### 5. State is Source of Truth (for Terraform)
If state says 652 resources but Keycloak has 3:
- State is WRONG
- Either import existing, or
- Delete state and start fresh

---

## Summary

The DIVE V3 Terraform setup has a well-designed modular approach in `terraform/instances/` that was **never used**. Instead, Terraform was run from `terraform/` with most configuration files archived, resulting in a minimal deployment (1 IdP, 1 user).

**Recommended Action:** Use the `terraform/instances/` approach with workspace-based deployment. This is the correct IaC pattern for multi-instance federated architectures.

---

*Audit Date: 2025-11-25*
*Auditor: Infrastructure Assessment*


