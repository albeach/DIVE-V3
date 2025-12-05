# Phase 2: Federation Automation - SMART Objectives

## Overview
**Duration:** Days 3-4  
**Goal:** Automate bidirectional trust setup between instances

---

## SMART Objectives

### Objective 2.1: Auto-Federation Script

| SMART | Definition |
|-------|------------|
| **S**pecific | Create `add-federation-partner.sh` script that automatically configures bidirectional OIDC trust between two instances |
| **M**easurable | Adding a new partner completes in < 30 seconds; both instances can authenticate each other's users |
| **A**chievable | Build on existing Terraform modules and Keycloak API |
| **R**elevant | Enables frictionless demo: "Add Italy in 30 seconds" |
| **T**ime-bound | Complete by end of Day 3 |

**Success Criteria:**
- [ ] Script accepts source and target instance codes
- [ ] Creates OIDC IdP broker in both directions
- [ ] Configures attribute mappers (clearance, country, COI)
- [ ] Updates client redirect URIs
- [ ] Validates federation works via test authentication
- [ ] Idempotent: can be run multiple times safely

---

### Objective 2.2: Trust Relationship Dashboard

| SMART | Definition |
|-------|------------|
| **S**pecific | Create CLI tool to visualize current federation trust relationships |
| **M**easurable | Shows all active federation pairs in < 2 seconds |
| **A**chievable | Query Keycloak APIs for IdP configurations |
| **R**elevant | Helps demo coordinators understand current state |
| **T**ime-bound | Complete by end of Day 4 |

**Success Criteria:**
- [ ] `show-federation-status.sh` command works
- [ ] Shows trust matrix (who trusts whom)
- [ ] Highlights any asymmetric trust (A→B but not B→A)
- [ ] JSON output option for automation

---

### Objective 2.3: One-Command Instance + Federation

| SMART | Definition |
|-------|------------|
| **S**pecific | Enhance deploy script to automatically set up federation with all existing instances |
| **M**easurable | New instance is fully federated within 3 minutes of creation |
| **A**chievable | Combine existing scripts and Terraform |
| **R**elevant | "Deploy Italy and federate with everyone" in one command |
| **T**ime-bound | Complete by end of Day 4 |

**Success Criteria:**
- [ ] `./scripts/deploy-dive-instance.sh ITA --new --federate` deploys and federates
- [ ] New instance can authenticate users from all existing instances
- [ ] Existing instances can authenticate users from new instance
- [ ] Federation relationships persist across restarts

---

## Test Suite Requirements

### Test 2.1: Federation Script Tests
```bash
# test-phase2-federation.sh
- Test bidirectional IdP creation
- Test attribute mapper configuration
- Test cross-instance authentication
- Test idempotency (run twice)
```

### Test 2.2: Trust Status Tests
```bash
# test-phase2-trust-status.sh
- Test status shows all instances
- Test asymmetric detection
- Test JSON output format
```

---

## Acceptance Criteria

Phase 2 is complete when:
1. ✅ All SMART objectives met
2. ✅ Test suite passes
3. ✅ Can add new partner (ESP) and authenticate cross-instance
4. ✅ Changes committed to GitHub
5. ✅ Demo scenario validated: "Add Spain in 30 seconds"









