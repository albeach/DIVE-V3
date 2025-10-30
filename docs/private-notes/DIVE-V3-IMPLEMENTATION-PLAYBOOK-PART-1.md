# DIVE-V3 Phased Implementation Plan — Keycloak, Terraform, ABAC & ZTDF/OpenTDF

**Document Version**: 1.0  
**Generated**: October 29, 2025  
**Status**: IMPLEMENTATION READY  
**Target Audience**: Security Architects, DevOps Engineers, Coalition Operators

---

## Executive Overview

### Goals

This implementation plan delivers a **production-hardened, standards-compliant ICAM + data-centric security platform** for DIVE-V3, addressing 7 critical improvement areas across federation, authorization, and data protection.

**Primary Objectives**:
1. **Federation & MFA Hardening** – Enforce broker-only onboarding, conditional 2FA per clearance, external MFA respect
2. **Attribute Normalization & Governance** – Canonical schema, mapper consolidation, drift repair
3. **ABAC Policy Tightening** – Default-deny reinforcement, AAL/FAL gates, freshness checks, releasability enforcement
4. **Data-Centric Security Evolution** – ZTDF→OpenTDF readiness, cryptographic bindings, KAS hardening
5. **Terraform Consolidation** – Modularization, provider hygiene, secrets management
6. **Observability & Audit** – Decision logs, SIEM integration, anomaly detection
7. **CI/CD Guardrails** – Automated testing, drift detection, policy validation

### Scope

**IN SCOPE**:
- 10 NATO nation realms + broker (11 total Keycloak realms)
- 10 external IdPs (9 national + 1 industry)
- OPA Rego policies (7 existing → enhanced)
- XACML parity validation (AuthzForce)
- KAS key custody & cryptographic binding
- Terraform infrastructure as code (100% IaC)
- CI/CD workflows (GitHub Actions)

**OUT OF SCOPE**:
- Stack replacement (Keycloak, OPA, MongoDB remain)
- AAL3 hardware token implementation (future)
- Full OpenTDF adoption (pilot only)
- X.509 certificate-based authN (future)
- Multi-datacenter HA (single-site pilot)

### Non-Goals

- ❌ **Complete rewrite** – We improve, not replace, the existing system
- ❌ **Stack migration** – OpenTDF assessed for readiness, not mandated
- ❌ **Breaking changes** – All enhancements backward-compatible
- ❌ **Production downtime** – Blue-green deployment pattern

### Primary Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Terraform provider drift** | Medium | High | Lock provider versions, automated validation |
| **IdP metadata changes** | Low | Medium | Health checks, automated sync |
| **Mapper regression** | Low | Critical | Integration tests per IdP |
| **OPA performance** | Low | Medium | Load testing, caching, 200ms SLO |
| **KAS latency** | Medium | Medium | Local caching, async key fetch |
| **Key custody loss** | Low | Critical | HSM/KMS integration, backup strategy |

### Success Metrics

**Technical**:
- ✅ 100% Terraform-managed resources (no manual config)
- ✅ OPA decision p95 < 200ms
- ✅ KAS key-release p95 < 300ms
- ✅ 95%+ policy test coverage
- ✅ Zero critical linter errors
- ✅ Zero Terraform drift after 30 days

**Compliance**:
- ✅ ACP-240 §5.1-5.4 (ZTDF, KAS, crypto binding)
- ✅ STANAG 5663 (ADatP-5663) §4.4, 5.1.3, 6.2-6.8
- ✅ NIST SP 800-63B AAL1/AAL2/AAL3 enforcement
- ✅ 90-day audit trail retention
- ✅ STANAG 4774/4778 labeling & crypto binding

**Operational**:
- ✅ < 5% false-deny rate (legitimate denials only)
- ✅ < 1% attribute drift after enrichment
- ✅ 99.9% uptime (excluding planned maintenance)

---

## Readiness Checklist (Phase 0)

**Objective**: Validate current state before proceeding with phases

### Pre-Flight Table

| Check | Expected | Command | Go/No-Go |
|-------|----------|---------|----------|
| **Keycloak Version** | 26.4.2 | `docker exec dive-v3-keycloak /opt/keycloak/bin/kc.sh --version` | ⬜ |
| **PostgreSQL** | 15.x | `docker exec dive-v3-postgres psql --version` | ⬜ |
| **MongoDB** | 7.0.x | `docker exec dive-v3-mongo mongod --version` | ⬜ |
| **OPA** | ≥ 0.68.0 | `docker exec dive-v3-opa opa version` | ⬜ |
| **Terraform** | ≥ 1.13.4 | `terraform version` | ⬜ |
| **Terraform Provider** | keycloak/keycloak v5.5.0 | `grep 'keycloak/keycloak' terraform/.terraform.lock.hcl` | ⬜ |
| **Realms Count** | 11 (1 broker + 10 nations) | `kcadm.sh get realms --fields realm \| wc -l` | ⬜ |
| **IdP Count** | 10 external | `kcadm.sh get identity-provider/instances -r dive-v3-broker \| jq length` | ⬜ |
| **MFA Flow** | Post-broker AAL2 | `kcadm.sh get authentication/flows -r dive-v3-broker \| grep "Post-Broker"` | ⬜ |
| **OPA Policies** | 7 policies | `ls -1 policies/*.rego \| wc -l` | ⬜ |
| **Backend Health** | HTTP 200 | `curl -f http://localhost:4000/health` | ⬜ |
| **Frontend Health** | HTTP 200 | `curl -f http://localhost:3000/api/health` | ⬜ |
| **KAS Health** | HTTP 200 | `curl -f http://localhost:8080/health` | ⬜ |
| **Terraform State** | Clean (no drift) | `cd terraform && terraform plan` (expect "No changes") | ⬜ |

**GO Criteria**: 12/13 checks pass (allow 1 transient failure)  
**NO-GO Criteria**: Any critical service down, Terraform drift > 10 resources

### Uncertainty Assumptions

**Identified Uncertainties** (from grounding docs):

1. **ACP240-llms.txt not found** → Assume ACP-240 content from ADATP-5663-ACP-240-INTEGRATION-COMPLETE.md sufficient
2. **Clearance attribute drift** → 5 users missing `clearanceOriginal` (documented in CLEARANCE-NORMALIZATION-ISSUES.md)
3. **AuthzForce 13.3.2 unavailable** → Use v12.0.1 (mocked XACML tests acceptable)
4. **OPA CLI local corruption** → Use Docker OPA for validation (`docker exec dive-v3-opa opa`)
5. **Keycloak health check false-negative** → Service is operational despite health=unhealthy
6. **OpenTDF integration level** → Pilot PoC only (no production mandate)
7. **AAL3 implementation** → Deferred (not in scope)
8. **External IdP metadata refresh** → Manual sync acceptable (automated sync future)
9. **Multi-site deployment** → Single-site only
10. **Performance baselines** → Establish in P6 (assume current metrics)

**Proposed Defaults**:
- Use existing ACP-240 content from integration docs
- Repair clearance drift in P2
- Proceed with AuthzForce 12.0.1
- Standardize on Docker OPA CLI
- Ignore Keycloak health check (validate /realms/master)
- OpenTDF PoC in P4 (no breaking changes)
- AAL3 marked future work
- IdP metadata sync manual (document procedure)
- Single-site HA patterns
- Performance baseline captured in P0

---

## Phase 1: Federation & MFA Hardening

**Duration**: 5-7 days  
**Owner**: Security Architect + Keycloak Admin  
**Risk Level**: MEDIUM

### Goal

Enforce broker-only authentication, conditional 2FA per clearance, external MFA respect, and eliminate SSO bypass vulnerabilities.

### Inputs

- Current Keycloak 26.4.2 configuration
- POST-BROKER-MFA-ARCHITECTURE.md (best practices)
- CRITICAL-CLEARANCE-AAL-FIX-COMPLETION.md (session-based ACR/AMR)
- Terraform modules: `modules/realm-mfa/`
- Custom SPI: `keycloak/extensions/dive-keycloak-extensions.jar`

### Step-by-Step Tasks

#### Task 1.1: Disable Direct Realm Logins (Broker-Only Enforcement)

**Objective**: Force all external IdP users through broker for consistent attribute normalization

**Command**:
```bash
# For each nation realm (USA, ESP, FRA, etc.)
for realm in usa esp fra gbr deu ita nld pol can industry; do
  docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update realms/dive-v3-${realm} \
    -s enabled=false \
    -s loginWithEmailAllowed=false
done
```

**Terraform Equivalent** (preferred):
```hcl
# Add to each *-realm.tf file
resource "keycloak_realm" "dive_v3_<nation>" {
  # ...
  enabled                = false  # Disable direct login
  login_with_email_allowed = false
}
```

**Artifact**: Updated Terraform files (7 realms)  
**Test**: `curl -X POST http://localhost:8081/realms/dive-v3-usa/protocol/openid-connect/token` → expect 401  
**DoD**: All direct realm logins return 401; only broker login succeeds

#### Task 1.2: Configure Conditional MFA (Clearance-Based)

**Objective**: Enforce OTP for CONFIDENTIAL+ clearances; skip for UNCLASSIFIED

**Files**:
- `terraform/modules/realm-mfa/main.tf` (already exists, verify config)

**Verification**:
```hcl
# Ensure this structure exists in main.tf:
resource "keycloak_authentication_subflow" "classified_otp_conditional" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.classified_conditional.alias
  alias             = "Conditional OTP for Classified - ${var.realm_display_name}"
  requirement       = "CONDITIONAL"
}

resource "keycloak_authentication_execution_config" "classified_condition_config" {
  # ...
  config = {
    attribute_name  = "clearance"
    attribute_value = "^(CONFIDENTIAL|SECRET|TOP_SECRET)$"  # Regex
    negate          = "false"
  }
}
```

**Test**:
```bash
# Test UNCLASSIFIED user (no MFA)
./scripts/test-mfa-skip.sh john.doe@mil USA

# Test SECRET user (require MFA)
./scripts/test-mfa-enforce.sh mike.johnson@mil USA
```

**DoD**: UNCLASSIFIED users skip OTP; CONFIDENTIAL+ users prompted for OTP

#### Task 1.3: Respect External IdP MFA (ACR claim)

**Objective**: If external IdP asserts AAL2 via `acr` claim, skip duplicate OTP

**Implementation**:
```hcl
# Add to modules/realm-mfa/main.tf
resource "keycloak_authentication_execution" "conditional_acr_check" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.post_broker_conditional_inner.alias
  authenticator     = "conditional-acr"
  requirement       = "REQUIRED"
}

resource "keycloak_authentication_execution_config" "conditional_acr_config" {
  execution_id = keycloak_authentication_execution.conditional_acr_check.id
  alias        = "Skip OTP if AAL2 from IdP"
  config = {
    acr_value = "http://www.example.org/aal2"  # ADatP-5663 AAL2 URN
    negate    = "true"  # Skip OTP if ACR >= AAL2
  }
}
```

**Test**:
```bash
# Mock SAML assertion with ACR=AAL2
curl -X POST http://localhost:9443/saml/idp \
  -d "acr=http://www.example.org/aal2" \
  -d "username=juan.garcia"

# Verify no OTP prompt (ACR respected)
```

**DoD**: External AAL2 assertions skip Keycloak OTP

#### Task 1.4: Export & Document Flows

**Objective**: Version-control authentication flows as JSON

**Command**:
```bash
# Export broker flow
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get \
  authentication/flows/Post-Broker%20Classified%20MFA%20-%20DIVE%20V3%20Broker \
  -r dive-v3-broker > flows/post-broker-mfa-flow.json

# Export browser flow
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get \
  authentication/flows/Classified%20Access%20Browser%20Flow%20-%20DIVE%20V3%20Broker \
  -r dive-v3-broker > flows/classified-browser-flow.json
```

**Artifact**: `flows/post-broker-mfa-flow.json`, `flows/classified-browser-flow.json`  
**Test**: Re-import flows to test realm, verify identical structure  
**DoD**: JSON flows committed to Git, documented in README

#### Task 1.5: Playwright E2E MFA Tests

**Objective**: Automated end-to-end MFA validation

**File**: `frontend/tests/e2e/mfa-conditional.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Conditional MFA Enforcement', () => {
  test('UNCLASSIFIED user skips MFA', async ({ page }) => {
    // Login as john.doe (UNCLASSIFIED)
    await page.goto('http://localhost:3000/login/usa-realm-broker');
    await page.fill('#username', 'john.doe');
    await page.fill('#password', 'Password123!');
    await page.click('button[type=submit]');
    
    // Expect direct dashboard redirect (no OTP page)
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('SECRET user prompted for MFA', async ({ page }) => {
    // Login as mike.johnson (SECRET)
    await page.goto('http://localhost:3000/login/usa-realm-broker');
    await page.fill('#username', 'mike.johnson');
    await page.fill('#password', 'Password123!');
    await page.click('button[type=submit]');
    
    // Expect OTP prompt
    await expect(page.locator('#otp-input')).toBeVisible();
  });

  test('External AAL2 skips duplicate OTP', async ({ page }) => {
    // Mock external IdP with ACR=AAL2
    await page.route('**/saml/idp', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ acr: 'http://www.example.org/aal2' })
      });
    });
    
    // Login via SAML
    await page.goto('http://localhost:3000/login/esp-realm-external');
    await page.fill('#username', 'juan.garcia');
    await page.fill('#password', 'EspanaDefensa2025!');
    await page.click('button[type=submit]');
    
    // Expect dashboard (no OTP)
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
```

**DoD**: 3/3 E2E tests pass

### Artifacts to Produce

| Artifact | Type | Location |
|----------|------|----------|
| Updated realm configs | Terraform | `terraform/*-realm.tf` |
| MFA flow exports | JSON | `flows/*.json` |
| Mapper configs | Terraform | `terraform/modules/realm-mfa/main.tf` |
| E2E tests | TypeScript | `frontend/tests/e2e/mfa-conditional.spec.ts` |
| Realm diffs | Markdown | `docs/P1-realm-changes.md` |

### Tests/Checks

```bash
# Test Matrix: 4 clearance levels × 3 scenarios = 12 tests
for clearance in UNCLASSIFIED CONFIDENTIAL SECRET TOP_SECRET; do
  for scenario in direct-login broker-login external-aal2; do
    ./scripts/test-mfa-flow.sh $clearance $scenario
  done
done
```

**Expected Results**:
- UNCLASSIFIED: No MFA in all scenarios
- CONFIDENTIAL/SECRET: MFA required (direct/broker), skipped (external-aal2)
- TOP_SECRET: MFA required in all scenarios

### Definition of Done (DoD)

- [ ] All direct realm logins disabled (Terraform applied)
- [ ] Post-broker MFA flow active on all 10 IdPs
- [ ] Conditional MFA regex matches CONFIDENTIAL|SECRET|TOP_SECRET
- [ ] External ACR conditional execution configured
- [ ] 12/12 MFA flow tests pass
- [ ] 3/3 Playwright E2E tests pass
- [ ] Flow JSON exports committed to Git
- [ ] Documentation updated (README + P1-realm-changes.md)
- [ ] Zero Terraform drift after apply
- [ ] PR approved by 2 reviewers (security + ops)

### Rollback

**If DoD not met**:
```bash
# Restore previous Terraform state
cd terraform
terraform state push terraform.tfstate.backup

# Re-enable direct logins (emergency)
for realm in usa esp fra gbr deu ita nld pol can industry; do
  docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update realms/dive-v3-${realm} \
    -s enabled=true
done
```

**Rollback Criteria**: > 10% false-deny rate, critical path broken, security regression

---

## Phase 2: Attribute Normalization & Mapper Consolidation

**Duration**: 4-6 days  
**Owner**: IAM Engineer + Backend Developer  
**Risk Level**: HIGH (attribute drift risk)

### Goal

Establish canonical attribute schema, consolidate mappers into Terraform modules, enforce `sync_mode=FORCE` for security-critical claims, repair attribute drift.

### Inputs

- FINAL-CLEARANCE-NORMALIZATION-SUMMARY.md (40 test users, 10 countries)
- CLEARANCE-NORMALIZATION-ISSUES.md (drift issues)
- `backend/src/services/clearance-mapper.service.ts` (normalization logic)
- Existing protocol mappers (200+ across 11 realms)

### Canonical Attribute Schema

| Attribute | Source | Type | Required | Sync Mode | Notes |
|-----------|--------|------|----------|-----------|-------|
| `uniqueID` | IdP | String | ✅ | FORCE | Email or URN identifier |
| `countryOfAffiliation` | IdP/Enriched | String (ISO-3166-1 alpha-3) | ✅ | FORCE | USA, FRA, ESP, etc. |
| `clearance` | IdP/Normalized | Enum (4 levels) | ✅ | FORCE | UNCLASSIFIED → TOP_SECRET |
| `clearanceOriginal` | IdP | String | ✅ | FORCE | Audit trail (e.g., "GEHEIM") |
| `acpCOI` | IdP/Enriched | Array\<String\> | ❌ | IMPORT | NATO-COSMIC, FVEY, etc. |
| `acr` | Session Note | String (AAL URN) | ✅ | N/A | Set by auth flow |
| `amr` | Session Note | Array\<String\> | ✅ | N/A | ["pwd", "otp"] |
| `auth_time` | Session Note | Integer (Unix) | ✅ | N/A | Authentication timestamp |

### Step-by-Step Tasks

#### Task 2.1: Create Shared Mapper Module

**Objective**: DRY principle – one module for all IdP mappers

**File**: `terraform/modules/shared-mappers/main.tf`

```hcl
variable "realm_id" { type = string }
variable "idp_alias" { type = string }
variable "country_code" { type = string }

# uniqueID Mapper
resource "keycloak_custom_identity_provider_mapper" "unique_id" {
  realm                    = var.realm_id
  name                     = "uniqueID-mapper"
  identity_provider_alias  = var.idp_alias
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    syncMode         = "FORCE"
    claim            = "email"  # or "sub" for non-email IdPs
    user.attribute   = "uniqueID"
  }
}

# clearance Mapper (normalized)
resource "keycloak_custom_identity_provider_mapper" "clearance" {
  realm                    = var.realm_id
  name                     = "clearance-mapper"
  identity_provider_alias  = var.idp_alias
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    syncMode         = "FORCE"
    claim            = "clearance"
    user.attribute   = "clearance"
  }
}

# clearanceOriginal Mapper (audit trail)
resource "keycloak_custom_identity_provider_mapper" "clearance_original" {
  realm                    = var.realm_id
  name                     = "clearanceOriginal-mapper"
  identity_provider_alias  = var.idp_alias
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    syncMode         = "FORCE"
    claim            = "clearance"  # Same source
    user.attribute   = "clearanceOriginal"
  }
}

# countryOfAffiliation Mapper
resource "keycloak_custom_identity_provider_mapper" "country" {
  realm                    = var.realm_id
  name                     = "country-mapper"
  identity_provider_alias  = var.idp_alias
  identity_provider_mapper = "hardcoded-attribute-idp-mapper"
  
  extra_config = {
    syncMode       = "FORCE"
    attribute      = "countryOfAffiliation"
    attribute.value = var.country_code  # Hardcoded per IdP (USA, FRA, etc.)
  }
}

# acpCOI Mapper (optional)
resource "keycloak_custom_identity_provider_mapper" "coi" {
  realm                    = var.realm_id
  name                     = "acpCOI-mapper"
  identity_provider_alias  = var.idp_alias
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    syncMode         = "IMPORT"  # Don't overwrite user-managed COIs
    claim            = "coi"
    user.attribute   = "acpCOI"
  }
}
```

**Usage**:
```hcl
# In usa-broker.tf
module "usa_mappers" {
  source       = "./modules/shared-mappers"
  realm_id     = keycloak_realm.dive_v3_broker.id
  idp_alias    = keycloak_oidc_identity_provider.usa_realm_broker.alias
  country_code = "USA"
}
```

**DoD**: 10 IdPs using shared module (DRY), zero duplication

#### Task 2.2: Mapper Conformance Matrix

**Objective**: Audit & verify all IdPs have canonical mappers

**File**: `docs/P2-mapper-matrix.md`

| IdP | uniqueID | country | clearance | clearanceOriginal | acpCOI | acr | amr | auth_time |
|-----|----------|---------|-----------|-------------------|--------|-----|-----|-----------|
| USA | ✅ FORCE | ✅ USA | ✅ FORCE | ✅ FORCE | ✅ IMPORT | ✅ Session | ✅ Session | ✅ Session |
| ESP | ✅ FORCE | ✅ ESP | ✅ FORCE | ✅ FORCE | ✅ IMPORT | ✅ Session | ✅ Session | ✅ Session |
| FRA | ✅ FORCE | ✅ FRA | ✅ FORCE | ✅ FORCE | ✅ IMPORT | ✅ Session | ✅ Session | ✅ Session |
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

**Command** (automated verification):
```bash
./scripts/verify-mapper-conformance.sh
```

**Expected Output**:
```
✅ USA: 8/8 mappers configured correctly
✅ ESP: 8/8 mappers configured correctly
⚠️  FRA: 7/8 mappers (missing acpCOI) - FIXED
✅ Conformance: 100%
```

#### Task 2.3: Drift Repair Script

**Objective**: Fix 5 users with missing `clearanceOriginal` (from CLEARANCE-NORMALIZATION-ISSUES.md)

**File**: `scripts/repair-clearance-drift.sh`

```bash
#!/bin/bash
# Repair clearance attribute drift for 5 users

USERS=(
  "james.smith@mod.uk:GBR:SECRET"
  "marco.rossi@difesa.it:ITA:SEGRETO"
  "pieter.devries@defensie.nl:NLD:GEHEIM"
  "jan.kowalski@mon.gov.pl:POL:TAJNY"
  "bob.contractor@lockheed.com:IND:SENSITIVE"
)

for user_data in "${USERS[@]}"; do
  IFS=':' read -r email country clearance <<< "$user_data"
  
  # Find user ID
  user_id=$(docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users \
    -r dive-v3-broker -q "email=${email}" --fields id --format csv --noquotes)
  
  if [ -z "$user_id" ]; then
    echo "❌ User not found: $email"
    continue
  fi
  
  # Set clearanceOriginal attribute
  docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update users/$user_id \
    -r dive-v3-broker -s "attributes.clearanceOriginal=[\"${clearance}\"]"
  
  echo "✅ Repaired: $email → clearanceOriginal=$clearance"
done
```

**Test**:
```bash
./scripts/repair-clearance-drift.sh
./scripts/verify-clearance-attributes.sh  # Verify all 40 users
```

**DoD**: 40/40 test users have `clearanceOriginal` attribute

#### Task 2.4: Backend Normalization Service Update

**Objective**: Ensure normalization service handles all 10 countries

**File**: `backend/src/services/clearance-mapper.service.ts` (already complete per grounding docs)

**Verification**:
```typescript
// Test all 10 countries
import { normalizeClearance } from './clearance-mapper.service';

const testCases = [
  { country: 'DEU', clearance: 'GEHEIM', expected: 'SECRET' },
  { country: 'ITA', clearance: 'SEGRETO', expected: 'SECRET' },
  { country: 'NLD', clearance: 'GEHEIM', expected: 'SECRET' },
  { country: 'POL', clearance: 'TAJNY', expected: 'SECRET' },
  { country: 'GBR', clearance: 'SECRET', expected: 'SECRET' },
  { country: 'IND', clearance: 'SENSITIVE', expected: 'CONFIDENTIAL' },
];

testCases.forEach(({ country, clearance, expected }) => {
  const result = normalizeClearance(clearance, country);
  console.assert(result === expected, `${country}: ${clearance} → ${result} (expected ${expected})`);
});
```

**DoD**: All assertions pass

#### Task 2.5: OPA Clearance Normalization Tests

**File**: `policies/clearance_normalization_test.rego` (already exists, verify 14/14 pass)

```bash
cd policies
docker exec dive-v3-opa opa test . -v clearance_normalization_test.rego
```

**Expected**: `PASS: 14/14`

### Artifacts

| Artifact | Type | Location |
|----------|------|----------|
| Shared mapper module | Terraform | `terraform/modules/shared-mappers/` |
| Mapper matrix | Markdown | `docs/P2-mapper-matrix.md` |
| Drift repair script | Bash | `scripts/repair-clearance-drift.sh` |
| Conformance report | Markdown | `docs/P2-conformance-report.md` |
| Updated IdP brokers | Terraform | `terraform/*-broker.tf` (10 files) |

### Tests/Checks

```bash
# 1. Terraform validation
cd terraform && terraform validate

# 2. Mapper conformance
./scripts/verify-mapper-conformance.sh

# 3. Attribute drift check
./scripts/verify-clearance-attributes.sh

# 4. Backend normalization tests
cd backend && npm test -- clearance-mapper.service.spec.ts

# 5. OPA normalization tests
docker exec dive-v3-opa opa test /policies clearance_normalization_test.rego
```

**Pass Criteria**: 5/5 test suites green

### Definition of Done (DoD)

- [ ] Shared mapper module created & tested
- [ ] All 10 IdPs using shared module (zero duplication)
- [ ] Mapper matrix 100% compliant
- [ ] 40/40 test users have all canonical attributes
- [ ] 5 drift users repaired
- [ ] Backend normalization tests 100% pass
- [ ] OPA tests 14/14 pass
- [ ] Zero non-null attribute violations
- [ ] Conformance report published
- [ ] PR approved by 2 reviewers

### Rollback

```bash
# Restore previous mapper configs
cd terraform
terraform state push terraform.tfstate.backup

# Manual attribute repair (if needed)
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update users/<USER_ID> \
  -r dive-v3-broker -s "attributes.clearance=[\"PREVIOUS_VALUE\"]"
```

---

## Phase 3: ABAC Policy Tightening (OPA/XACML)

**Duration**: 5-7 days  
**Owner**: Security Engineer + Policy Analyst  
**Risk Level**: MEDIUM

### Goal

Reinforce default-deny, add `auth_time` freshness checks, AAL gating, releasability enforcement, COI intersection, embargo validation, decision replay tracing.

### Inputs

- `policies/federation_abac_policy.rego` (ADatP-5663 focused)
- `policies/fuel_inventory_abac_policy.rego` (ACP-240 focused)
- `policies/object_abac_policy.rego` (STANAG 4778 labeling)
- ADATP-5663-ACP-240-INTEGRATION-COMPLETE.md (decision replay architecture)
- OPA test framework

### Step-by-Step Tasks

#### Task 3.1: Rego Default-Deny Audit

**Objective**: Verify all policies start with `default allow := false`

**Script**: `scripts/audit-default-deny.sh`

```bash
#!/bin/bash
# Audit all Rego policies for default-deny pattern

POLICIES=$(find policies -name "*.rego" -not -path "*/tests/*")

for policy in $POLICIES; do
  if grep -q "default allow := false" "$policy"; then
    echo "✅ $policy"
  else
    echo "❌ $policy (MISSING default-deny)"
  fi
done
```

**Fix** (if missing):
```rego
package dive.authorization

import rego.v1

default allow := false  # ADD THIS LINE
```

**DoD**: 7/7 policies have default-deny

#### Task 3.2: Add `auth_time` Freshness Check

**Objective**: Enforce 15-minute token lifetime per ADatP-5663

**File**: `policies/federation_abac_policy.rego` (already exists, verify implementation)

```rego
# Token Lifetime Check (ADatP-5663 §5.1.3)
is_token_expired := msg if {
  input.subject.auth_time
  current_time_unix := to_unix_seconds(input.context.currentTime)
  auth_time_unix := input.subject.auth_time
  lifetime_seconds := current_time_unix - auth_time_unix
  lifetime_seconds > 900  # 15 minutes
  msg := sprintf("Token expired: %v seconds since authentication (max 900)", [lifetime_seconds])
}
```

**Test**:
```bash
docker exec dive-v3-opa opa eval \
  -d policies/federation_abac_policy.rego \
  -i test-data/expired-token.json \
  'data.dive.federation.is_token_expired'

# Expected: "Token expired: 1200 seconds since authentication (max 900)"
```

**DoD**: Token lifetime violations correctly denied

#### Task 3.3: AAL Gating for Classifications

**Objective**: Map clearance levels to required AAL

| Classification | Required AAL | Enforcement |
|----------------|--------------|-------------|
| UNCLASSIFIED | AAL1 (password) | ✅ Existing |
| CONFIDENTIAL | AAL2 (password + OTP) | ✅ Existing |
| SECRET | AAL2 | ✅ Existing |
| TOP_SECRET | AAL3 (hardware token) | ⚠️ Fallback to AAL2 (AAL3 not implemented) |

**Policy** (verify in `federation_abac_policy.rego`):
```rego
get_required_aal(classification) := 2 if {
  classification in ["CONFIDENTIAL", "SECRET"]
}

get_required_aal(classification) := 3 if {
  classification == "TOP_SECRET"
}
```

**Test Matrix**: 4 clearances × 3 AAL levels = 12 tests

```bash
docker exec dive-v3-opa opa test /policies -v \
  --run "test_aal_enforcement"
```

**DoD**: 12/12 AAL tests pass

#### Task 3.4: Releasability & COI Enforcement

**Objective**: Strict enforcement of `releasabilityTo` and `COI` intersection

**Policy**:
```rego
# Releasability Check
is_not_releasable_to_country := msg if {
  count(input.resource.releasabilityTo) == 0
  msg := "Resource has empty releasabilityTo (deny all)"
}

is_not_releasable_to_country := msg if {
  count(input.resource.releasabilityTo) > 0
  not input.subject.countryOfAffiliation in input.resource.releasabilityTo
  msg := sprintf("Country %v not in releasabilityTo: %v", [
    input.subject.countryOfAffiliation,
    input.resource.releasabilityTo
  ])
}

# COI Intersection Check
is_coi_violation := msg if {
  count(input.resource.COI) > 0
  count(input.subject.acpCOI) > 0
  intersection := input.subject.acpCOI & input.resource.COI
  count(intersection) == 0
  msg := sprintf("No COI match: user=%v, resource=%v", [
    input.subject.acpCOI,
    input.resource.COI
  ])
}
```

**Test**:
```bash
# Test releasability denial
docker exec dive-v3-opa opa eval \
  -d policies/fuel_inventory_abac_policy.rego \
  -i test-data/releasability-deny.json \
  'data.dive.authorization.allow'

# Expected: false (FRA user accessing USA-only resource)

# Test COI violation
docker exec dive-v3-opa opa eval \
  -d policies/fuel_inventory_abac_policy.rego \
  -i test-data/coi-violation.json \
  'data.dive.authorization.allow'

# Expected: false (NATO-COSMIC resource, user only has FVEY COI)
```

**DoD**: Releasability & COI tests pass

#### Task 3.5: Embargo Enforcement (Creation Date)

**Objective**: Enforce 7-day embargo with ±5 minute clock skew tolerance

**Policy**:
```rego
# Embargo Check (with clock skew tolerance)
is_embargo_violation := msg if {
  input.resource.creationDate
  current_time := time.parse_rfc3339_ns(input.context.currentTime)
  creation_time := time.parse_rfc3339_ns(input.resource.creationDate)
  
  # 7 days = 604800 seconds, minus 5 minutes tolerance = 604500
  embargo_seconds := 604500
  time_since_creation := current_time - creation_time
  time_since_creation < embargo_seconds
  
  msg := sprintf("Embargo active: %v seconds since creation (min %v)", [
    time_since_creation / 1000000000,  # Convert ns to seconds
    embargo_seconds
  ])
}
```

**Test**:
```bash
# Test embargo denial (resource created 3 days ago)
docker exec dive-v3-opa opa eval \
  -d policies/fuel_inventory_abac_policy.rego \
  -i test-data/embargo-3days.json \
  'data.dive.authorization.allow'

# Expected: false (embargo violation)

# Test embargo allowed (resource created 8 days ago)
docker exec dive-v3-opa opa eval \
  -d policies/fuel_inventory_abac_policy.rego \
  -i test-data/embargo-8days.json \
  'data.dive.authorization.allow'

# Expected: true (embargo expired)
```

**DoD**: Embargo tests pass (5 test cases)

#### Task 3.6: Decision Replay Tracing

**Objective**: Add reason codes & evaluation details for troubleshooting

**Policy Enhancement**:
```rego
decision := {
  "allow": allow,
  "reason": get_decision_reason,
  "evaluation_details": {
    "clearance_check": clearance_check_result,
    "releasability_check": releasability_check_result,
    "coi_check": coi_check_result,
    "aal_check": aal_check_result,
    "token_lifetime_check": token_lifetime_check_result,
    "embargo_check": embargo_check_result
  },
  "obligations": obligations
}

get_decision_reason := "Access granted" if {
  allow
}

get_decision_reason := msg if {
  not allow
  msg := concat("; ", [
    m | violations[_] = m
  ])
}

clearance_check_result := "PASS" if { not is_insufficient_clearance }
clearance_check_result := "FAIL" if { is_insufficient_clearance }

# ... similar for other checks
```

**Test**:
```bash
docker exec dive-v3-opa opa eval \
  -d policies/fuel_inventory_abac_policy.rego \
  -i test-data/complex-decision.json \
  'data.dive.authorization.decision'

# Expected:
# {
#   "allow": false,
#   "reason": "Country FRA not in releasabilityTo: [USA]; Insufficient AAL: user AAL1 < required AAL2",
#   "evaluation_details": {
#     "clearance_check": "PASS",
#     "releasability_check": "FAIL",
#     "coi_check": "PASS",
#     "aal_check": "FAIL",
#     "token_lifetime_check": "PASS",
#     "embargo_check": "N/A"
#   }
# }
```

**DoD**: Decision structure includes reason & evaluation_details

#### Task 3.7: XACML Parity Tests

**Objective**: Validate OPA decisions match XACML (via AuthzForce)

**Script**: `scripts/test-opa-xacml-parity.sh`

```bash
#!/bin/bash
# Compare OPA vs XACML decisions for 10 test cases

for test_case in test-data/parity-test-*.json; do
  echo "Testing: $test_case"
  
  # Get OPA decision
  opa_result=$(docker exec dive-v3-opa opa eval \
    -d policies/fuel_inventory_abac_policy.rego \
    -i "$test_case" \
    'data.dive.authorization.allow' | jq -r '.result[0].expressions[0].value')
  
  # Get XACML decision (via AuthzForce)
  xacml_result=$(curl -s -X POST http://localhost:8282/authzforce-ce/domains/DIVE-V3/pdp \
    -H "Content-Type: application/xml" \
    -d @"${test_case%.json}.xacml.xml" | grep -oP '<Decision>\K[^<]+')
  
  # Compare
  if [ "$opa_result" == "true" ] && [ "$xacml_result" == "Permit" ]; then
    echo "✅ MATCH (both ALLOW)"
  elif [ "$opa_result" == "false" ] && [ "$xacml_result" == "Deny" ]; then
    echo "✅ MATCH (both DENY)"
  else
    echo "❌ MISMATCH: OPA=$opa_result, XACML=$xacml_result"
  fi
done
```

**DoD**: 10/10 parity tests match

#### Task 3.8: OPA Test Suite Expansion

**Objective**: Achieve 95%+ policy coverage

**File**: `policies/tests/comprehensive_abac_test.rego`

```rego
package dive.authorization.test

import rego.v1
import data.dive.authorization

# Test clearance levels (4 tests)
test_unclassified_allow if {
  result := authorization.allow with input as {
    "subject": {"authenticated": true, "clearance": "SECRET", "country": "USA"},
    "resource": {"classification": "UNCLASSIFIED", "releasabilityTo": ["USA"]},
    "context": {}
  }
  result == true
}

test_insufficient_clearance_deny if {
  result := authorization.allow with input as {
    "subject": {"authenticated": true, "clearance": "CONFIDENTIAL", "country": "USA"},
    "resource": {"classification": "SECRET", "releasabilityTo": ["USA"]},
    "context": {}
  }
  result == false
}

# Test releasability (5 tests)
test_releasability_allowed if {
  result := authorization.allow with input as {
    "subject": {"authenticated": true, "clearance": "SECRET", "country": "USA"},
    "resource": {"classification": "SECRET", "releasabilityTo": ["USA", "GBR"]},
    "context": {}
  }
  result == true
}

test_releasability_denied if {
  result := authorization.allow with input as {
    "subject": {"authenticated": true, "clearance": "SECRET", "country": "FRA"},
    "resource": {"classification": "SECRET", "releasabilityTo": ["USA"]},
    "context": {}
  }
  result == false
}

# Test COI (5 tests)
test_coi_intersection_allowed if {
  result := authorization.allow with input as {
    "subject": {"authenticated": true, "clearance": "SECRET", "country": "USA", "acpCOI": ["NATO-COSMIC", "FVEY"]},
    "resource": {"classification": "SECRET", "releasabilityTo": ["USA"], "COI": ["NATO-COSMIC"]},
    "context": {}
  }
  result == true
}

test_coi_no_intersection_denied if {
  result := authorization.allow with input as {
    "subject": {"authenticated": true, "clearance": "SECRET", "country": "USA", "acpCOI": ["FVEY"]},
    "resource": {"classification": "SECRET", "releasabilityTo": ["USA"], "COI": ["NATO-COSMIC"]},
    "context": {}
  }
  result == false
}

# Test AAL (10 tests)
test_aal1_for_unclassified_allowed if {
  result := authorization.allow with input as {
    "subject": {"authenticated": true, "clearance": "UNCLASSIFIED", "country": "USA", "acr": "AAL1"},
    "resource": {"classification": "UNCLASSIFIED", "releasabilityTo": ["USA"]},
    "context": {}
  }
  result == true
}

test_aal1_for_secret_denied if {
  result := authorization.allow with input as {
    "subject": {"authenticated": true, "clearance": "SECRET", "country": "USA", "acr": "AAL1"},
    "resource": {"classification": "SECRET", "releasabilityTo": ["USA"]},
    "context": {}
  }
  result == false
}

# Test token lifetime (5 tests)
test_fresh_token_allowed if {
  result := authorization.allow with input as {
    "subject": {"authenticated": true, "clearance": "SECRET", "country": "USA", "acr": "AAL2", "auth_time": 1730217600},
    "resource": {"classification": "SECRET", "releasabilityTo": ["USA"]},
    "context": {"currentTime": "2025-10-29T12:05:00Z"}  # 5 minutes after auth
  }
  result == true
}

test_expired_token_denied if {
  result := authorization.allow with input as {
    "subject": {"authenticated": true, "clearance": "SECRET", "country": "USA", "acr": "AAL2", "auth_time": 1730216400},
    "resource": {"classification": "SECRET", "releasabilityTo": ["USA"]},
    "context": {"currentTime": "2025-10-29T12:30:00Z"}  # 20 minutes after auth
  }
  result == false
}

# Test embargo (5 tests)
test_embargo_active_denied if {
  result := authorization.allow with input as {
    "subject": {"authenticated": true, "clearance": "SECRET", "country": "USA", "acr": "AAL2"},
    "resource": {"classification": "SECRET", "releasabilityTo": ["USA"], "creationDate": "2025-10-26T12:00:00Z"},
    "context": {"currentTime": "2025-10-29T12:00:00Z"}  # 3 days after creation
  }
  result == false
}

test_embargo_expired_allowed if {
  result := authorization.allow with input as {
    "subject": {"authenticated": true, "clearance": "SECRET", "country": "USA", "acr": "AAL2"},
    "resource": {"classification": "SECRET", "releasabilityTo": ["USA"], "creationDate": "2025-10-20T12:00:00Z"},
    "context": {"currentTime": "2025-10-29T12:00:00Z"}  # 9 days after creation
  }
  result == true
}

# Total: 40+ tests
```

**Run Tests**:
```bash
docker exec dive-v3-opa opa test /policies -v

# Expected: PASS: 40+/40+
```

**DoD**: 40+ OPA tests pass, coverage ≥ 95%

### Artifacts

| Artifact | Type | Location |
|----------|------|----------|
| Updated Rego policies | Rego | `policies/*.rego` (7 files) |
| Comprehensive test suite | Rego | `policies/tests/comprehensive_abac_test.rego` |
| OPA/XACML parity script | Bash | `scripts/test-opa-xacml-parity.sh` |
| Default-deny audit script | Bash | `scripts/audit-default-deny.sh` |
| Decision trace examples | JSON | `test-data/decision-traces/*.json` |
| P3 completion report | Markdown | `docs/P3-policy-tightening-report.md` |

### Tests/Checks

```bash
# 1. Default-deny audit
./scripts/audit-default-deny.sh

# 2. OPA test suite
docker exec dive-v3-opa opa test /policies -v

# 3. OPA/XACML parity
./scripts/test-opa-xacml-parity.sh

# 4. Performance (latency SLO)
ab -n 1000 -c 10 http://localhost:8181/v1/data/dive/authorization/decision \
  -p test-data/sample-decision.json \
  -T application/json

# Expected: p95 < 200ms
```

**Pass Criteria**: 4/4 test suites pass, latency SLO met

### Definition of Done (DoD)

- [ ] 7/7 policies have default-deny
- [ ] `auth_time` freshness check active
- [ ] AAL gating tests 12/12 pass
- [ ] Releasability tests 5/5 pass
- [ ] COI intersection tests 5/5 pass
- [ ] Embargo tests 5/5 pass
- [ ] Decision traces include reason codes
- [ ] OPA/XACML parity 10/10 match
- [ ] 40+ OPA tests pass
- [ ] OPA p95 latency < 200ms
- [ ] PR approved by 2 reviewers

### Rollback

```bash
# Restore previous policies
git checkout HEAD~1 -- policies/*.rego

# Restart OPA with old policies
docker restart dive-v3-opa
```

---

**END OF PART 1**

*Continued in DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-2.md*

