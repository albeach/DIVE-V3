# Phase 1: Foundation - SMART Objectives

## Overview
**Duration:** Days 1-2  
**Goal:** Establish standardized test users and enhanced deployment script

---

## SMART Objectives

### Objective 1.1: Standardized Test User Schema

| SMART | Definition |
|-------|------------|
| **S**pecific | Create Terraform module that provisions 4 test users (admin, officer, analyst, guest) with predefined clearance levels for any instance |
| **M**easurable | All 3 existing instances (USA, FRA, DEU) have consistent test users; 100% of users can authenticate |
| **A**chievable | Terraform module + apply to existing workspaces |
| **R**elevant | Enables consistent demo experience across all instances |
| **T**ime-bound | Complete by end of Day 1 |

**Success Criteria:**
- [ ] `testuser-{code}-4` user exists on all instances with TOP_SECRET clearance
- [ ] `testuser-{code}-3` user exists on all instances with SECRET clearance
- [ ] `testuser-{code}-2` user exists on all instances with CONFIDENTIAL clearance
- [ ] `testuser-{code}-1` user exists on all instances with UNCLASSIFIED clearance
- [ ] All users can authenticate with password `DiveDemo2025!`
- [ ] User attributes include `clearance`, `countryOfAffiliation`, `acpCOI`
- [ ] Naming convention is predictable: higher number = higher clearance

---

### Objective 1.2: Enhanced Deploy Script

| SMART | Definition |
|-------|------------|
| **S**pecific | Upgrade `deploy-dive-instance.sh` with pre-flight checks, progress indicators, dry-run mode, and comprehensive output |
| **M**easurable | Script completes in < 5 minutes; 0 manual intervention required; outputs all access URLs and credentials |
| **A**chievable | Build on existing script foundation |
| **R**elevant | Enables frictionless partner onboarding for demos |
| **T**ime-bound | Complete by end of Day 2 |

**Success Criteria:**
- [ ] `--help` flag shows usage documentation
- [ ] `--dry-run` flag validates without deploying
- [ ] Pre-flight checks for Docker, cloudflared, terraform, mkcert
- [ ] Detects if instance already exists
- [ ] Progress indicators for each step (1/6, 2/6, etc.)
- [ ] Summary banner with URLs and test credentials
- [ ] Exit code 0 on success, non-zero on failure

---

## Test Suite Requirements

### Test 1.1: User Provisioning Tests
```bash
# test-phase1-users.sh
- Test user exists in Keycloak
- Test user can authenticate via OIDC
- Test user attributes are correct
- Test password works
```

### Test 1.2: Deploy Script Tests
```bash
# test-phase1-deploy.sh
- Test --help flag works
- Test --dry-run doesn't create resources
- Test pre-flight check failures
- Test duplicate instance detection
- Test successful deployment (integration)
```

---

## Acceptance Criteria

Phase 1 is complete when:
1. ✅ All SMART objectives met
2. ✅ All test suite tests pass
3. ✅ Changes committed to GitHub with descriptive message
4. ✅ No regressions in existing functionality

