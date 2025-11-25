# DIVE V3 Federation Gap Analysis

## Executive Summary

The federation flow between DEU (prosecurity.biz) and USA (dive25.com) is broken due to **URL mismatches** in the Terraform configurations. When DEU attempts to federate to USA, it sends:

```
redirect_uri=https://deu-idp.prosecurity.biz/realms/dive-v3-broker/broker/usa-federation/endpoint
```

But USA's Keycloak expects:
```
redirect_uri=https://deu-idp.dive25.com/realms/dive-v3-broker/broker/usa-federation/endpoint
```

This causes `Invalid parameter: redirect_uri` errors.

---

## Root Cause Analysis

### Current State

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     FEDERATION CONFIGURATION FLOW                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   usa.tfvars                    fra.tfvars                              │
│   ┌───────────────┐             ┌───────────────┐                       │
│   │ federation_   │             │ federation_   │                       │
│   │ partners:     │             │ partners:     │                       │
│   │   deu:        │             │   deu:        │                       │
│   │     idp_url:  │             │     idp_url:  │                       │
│   │     dive25.com│ ❌ WRONG    │     dive25.com│ ❌ WRONG              │
│   └───────┬───────┘             └───────┬───────┘                       │
│           │                             │                               │
│           ▼                             ▼                               │
│   ┌───────────────────────────────────────────────────────────┐         │
│   │ USA Keycloak: dive-v3-deu-federation client               │         │
│   │ valid_redirect_uris:                                      │         │
│   │   - https://deu-idp.dive25.com/.../usa-federation/endpoint│ ❌      │
│   └───────────────────────────────────────────────────────────┘         │
│                                                                         │
│   ACTUAL DEU IdP:                                                       │
│   ┌───────────────────────────────────────────────────────────┐         │
│   │ https://deu-idp.prosecurity.biz                           │ ✓       │
│   │ Sends redirect_uri: prosecurity.biz/...                   │         │
│   └───────────────────────────────────────────────────────────┘         │
│                                                                         │
│                        ❌ MISMATCH = FEDERATION FAILS                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Identified Gaps

| Gap ID | Category | Severity | Description |
|--------|----------|----------|-------------|
| **GAP-FED-01** | Architecture | 🔴 Critical | No single source of truth for instance URLs |
| **GAP-FED-02** | Configuration | 🔴 Critical | Federation partner URLs hardcoded in each tfvars |
| **GAP-FED-03** | Validation | 🟠 High | No validation that federation URLs match actual deployments |
| **GAP-FED-04** | Documentation | 🟡 Medium | No centralized registry of all instances and their URLs |
| **GAP-FED-05** | Process | 🟠 High | Terraform workspaces applied separately without coordination |
| **GAP-FED-06** | Testing | 🟠 High | No automated testing of federation flows after Terraform apply |
| **GAP-FED-07** | Monitoring | 🟡 Medium | No alerting when federation endpoints become unreachable |
| **GAP-FED-08** | Recovery | 🟡 Medium | No documented procedure to fix federation mismatches |

---

## Detailed Gap Analysis

### GAP-FED-01: No Single Source of Truth

**Current State:**
- Each instance's URLs are defined in separate `.tfvars` files
- Federation partner URLs are copied/pasted across files
- Changes require updating multiple files manually

**Impact:**
- URL changes (like DEU moving to prosecurity.biz) don't propagate
- High risk of configuration drift
- No automated synchronization

**Evidence:**
```hcl
# usa.tfvars - outdated DEU URL
federation_partners = {
  deu = {
    idp_url = "https://deu-idp.dive25.com"  # WRONG
  }
}

# deu-prosecurity.tfvars - correct URL
idp_url = "https://deu-idp.prosecurity.biz"  # RIGHT
```

### GAP-FED-02: Hardcoded Federation Partner URLs

**Current State:**
- Each instance defines its federation partners with static URLs
- When an instance's URL changes, ALL other instances must be updated
- N instances = N-1 updates required for each URL change

**Impact:**
- O(n²) configuration complexity
- Easy to miss updates
- Federation breaks silently

### GAP-FED-03: No URL Validation

**Current State:**
- Terraform applies configurations without checking if URLs are reachable
- No pre-apply validation
- No post-apply verification

**Impact:**
- Broken configurations can be deployed
- Issues only discovered when users try to federate
- No early warning system

### GAP-FED-04: No Centralized Instance Registry

**Current State:**
- Instance information scattered across multiple files
- No single view of all instances and their configurations
- Manual documentation updates required

**Impact:**
- Difficult to audit federation configuration
- No visibility into the federation topology
- Onboarding new instances is error-prone

### GAP-FED-05: Uncoordinated Terraform Applies

**Current State:**
- Each workspace is applied independently
- No dependency tracking between instances
- Order of applies matters but isn't enforced

**Impact:**
- Race conditions possible
- Incomplete configurations during updates
- No transactional updates across instances

### GAP-FED-06: No Federation Testing

**Current State:**
- Federation flow is only tested manually
- No automated validation after Terraform apply
- Issues discovered by users, not monitoring

**Impact:**
- Delayed issue detection
- Poor user experience
- No confidence in configuration changes

---

## Recommended Solution Architecture

### Target State

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     TARGET: CENTRALIZED FEDERATION REGISTRY             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   federation-registry.json (SINGLE SOURCE OF TRUTH)                     │
│   ┌───────────────────────────────────────────────────────────┐         │
│   │ {                                                          │         │
│   │   "instances": {                                           │         │
│   │     "usa": {                                               │         │
│   │       "app_url": "https://usa-app.dive25.com",            │         │
│   │       "idp_url": "https://usa-idp.dive25.com",            │         │
│   │       "api_url": "https://usa-api.dive25.com"             │         │
│   │     },                                                     │         │
│   │     "fra": { ... },                                        │         │
│   │     "deu": {                                               │         │
│   │       "app_url": "https://deu-app.prosecurity.biz",       │ ✓       │
│   │       "idp_url": "https://deu-idp.prosecurity.biz",       │ ✓       │
│   │       "api_url": "https://deu-api.prosecurity.biz"        │ ✓       │
│   │     }                                                      │         │
│   │   },                                                       │         │
│   │   "federation_matrix": {                                   │         │
│   │     "usa": ["fra", "deu"],                                │         │
│   │     "fra": ["usa", "deu"],                                │         │
│   │     "deu": ["usa", "fra"]                                 │         │
│   │   }                                                        │         │
│   │ }                                                          │         │
│   └───────────────────────────────────────────────────────────┘         │
│                          │                                              │
│                          ▼                                              │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │           generate-tfvars.sh                                │       │
│   │  Generates all *.tfvars from federation-registry.json      │       │
│   └─────────────────────────────────────────────────────────────┘       │
│                          │                                              │
│           ┌──────────────┼──────────────┐                              │
│           ▼              ▼              ▼                              │
│      usa.tfvars     fra.tfvars     deu.tfvars                          │
│      (generated)    (generated)    (generated)                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phased Implementation Plan

### Phase 1: Immediate Fix (Day 1) 🔴 CRITICAL

**Objective:** Fix the DEU→USA federation redirect_uri error

**Tasks:**
1. Update `usa.tfvars` with correct DEU prosecurity.biz URL
2. Update `fra.tfvars` with correct DEU prosecurity.biz URL
3. Re-apply USA Terraform workspace
4. Re-apply FRA Terraform workspace
5. Validate federation flow

**Success Criteria:**
- [ ] DEU→USA federation works
- [ ] DEU→FRA federation works
- [ ] USA→DEU federation works
- [ ] FRA→DEU federation works

**Effort:** 2-4 hours

### Phase 2: Centralized Registry (Days 2-3) 🟠 HIGH

**Objective:** Create single source of truth for all instance configurations

**Tasks:**
1. Create `federation-registry.json` with all instances
2. Create `scripts/generate-tfvars.sh` to generate tfvars from registry
3. Create `scripts/validate-federation.sh` to verify all URLs are reachable
4. Migrate existing configurations to use generated tfvars

**Deliverables:**
- `config/federation-registry.json` - Single source of truth
- `scripts/federation/generate-tfvars.sh` - tfvars generator
- `scripts/federation/validate-urls.sh` - URL validator
- `scripts/federation/apply-all.sh` - Coordinated apply script

**Success Criteria:**
- [ ] All tfvars generated from registry
- [ ] URL validation passes for all instances
- [ ] Federation works after applying generated configs

**Effort:** 4-8 hours

### Phase 3: Automated Testing (Days 4-5) 🟡 MEDIUM

**Objective:** Automated federation flow testing

**Tasks:**
1. Create federation test script that validates all federation paths
2. Add federation tests to CI/CD pipeline
3. Create monitoring alerts for federation endpoint failures

**Deliverables:**
- `scripts/federation/test-federation.sh` - Federation flow tester
- `scripts/federation/federation-matrix.sh` - Test all N×N combinations
- Updated monitoring with federation endpoint checks

**Success Criteria:**
- [ ] All N×(N-1) federation paths tested automatically
- [ ] Tests run after each Terraform apply
- [ ] Alerts triggered on federation failures

**Effort:** 4-6 hours

### Phase 4: Documentation & Runbooks (Day 6) 🟢 LOW

**Objective:** Document federation management procedures

**Tasks:**
1. Document adding a new instance to the federation
2. Document changing an instance's URLs
3. Create troubleshooting runbook for federation issues
4. Update architecture documentation

**Deliverables:**
- `docs/FEDERATION-MANAGEMENT.md` - Operations guide
- `docs/ADDING-NEW-INSTANCE.md` - Onboarding guide
- `docs/FEDERATION-TROUBLESHOOTING.md` - Runbook

**Success Criteria:**
- [ ] Any engineer can add a new instance following the guide
- [ ] URL changes can be made safely following the procedure
- [ ] Common issues can be resolved using the runbook

**Effort:** 2-4 hours

---

## Implementation Priority Matrix

```
                    Impact
                    High ─────────────────────────────────┐
                         │                               │
                         │  Phase 1     Phase 2          │
                         │  (Fix Now)   (Centralize)     │
                         │                               │
                         │                               │
                         │  Phase 3     Phase 4          │
                         │  (Testing)   (Docs)           │
                         │                               │
                    Low  │───────────────────────────────│
                         Low                         High
                                    Effort
```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Phase 1 breaks existing federation | Medium | High | Test in staging first, have rollback plan |
| Registry JSON becomes stale | Medium | High | Add CI validation, require registry update before tfvars |
| Terraform state conflicts | Low | High | Use workspace locking, coordinate applies |
| Missing instance in registry | Low | Medium | Add validation that all workspaces have registry entries |

---

## Success Metrics

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Federation success rate | ~33% | 100% | Phase 1 |
| Configuration drift incidents | Unknown | 0 | Phase 2 |
| Mean time to add new instance | Days | Hours | Phase 2 |
| Federation test coverage | 0% | 100% | Phase 3 |
| URL mismatch detection time | Manual | Automated | Phase 3 |

---

## Appendix A: Current vs. Required Redirect URIs

### USA Keycloak (dive-v3-deu-federation client)

| Current | Required |
|---------|----------|
| `https://deu-idp.dive25.com/realms/dive-v3-broker/broker/usa-federation/endpoint` | `https://deu-idp.prosecurity.biz/realms/dive-v3-broker/broker/usa-federation/endpoint` |

### FRA Keycloak (dive-v3-deu-federation client)

| Current | Required |
|---------|----------|
| `https://deu-idp.dive25.com/realms/dive-v3-broker/broker/fra-federation/endpoint` | `https://deu-idp.prosecurity.biz/realms/dive-v3-broker/broker/fra-federation/endpoint` |

---

## Appendix B: Full Federation Matrix

```
            TO →
FROM ↓      USA     FRA     DEU
  USA       -       ✓       ❌ (redirect_uri)
  FRA       ✓       -       ❌ (redirect_uri)
  DEU       ❌      ❌      -
```

**Legend:**
- ✓ = Working
- ❌ = Broken (with reason)
- - = N/A (same instance)

