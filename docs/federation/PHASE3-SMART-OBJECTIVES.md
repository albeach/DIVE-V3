# Phase 3: Instance Management - SMART Objectives

## Overview
**Duration:** Days 5-6  
**Goal:** Unified instance lifecycle management with auto-federation

---

## SMART Objectives

### Objective 3.1: Auto-Federation During Deployment

| SMART | Definition |
|-------|------------|
| **S**pecific | Add `--federate` flag to deploy script that automatically sets up bidirectional trust with all existing instances |
| **M**easurable | New instance is fully federated within 3 minutes of `--new --federate` |
| **A**chievable | Combine deploy script with add-federation-partner script |
| **R**elevant | "Deploy Italy and federate with everyone" in one command |
| **T**ime-bound | Complete by end of Day 5 |

**Success Criteria:**
- [ ] `./scripts/deploy-dive-instance.sh ITA --new --federate` deploys and federates
- [ ] New instance has IdP brokers for all existing instances
- [ ] All existing instances have IdP broker for new instance
- [ ] Test users can authenticate cross-instance immediately

---

### Objective 3.2: Instance Health Dashboard

| SMART | Definition |
|-------|------------|
| **S**pecific | Create `dive-status.sh` command that shows health of all instances |
| **M**easurable | Shows status of all services in < 5 seconds |
| **A**chievable | Query Docker and Cloudflare APIs |
| **R**elevant | Quick debugging for demo coordinators |
| **T**ime-bound | Complete by end of Day 5 |

**Success Criteria:**
- [ ] Shows all running instances
- [ ] Shows health of each service (Keycloak, Backend, Frontend, OPA, KAS)
- [ ] Shows Cloudflare tunnel status
- [ ] Color-coded status (green=healthy, yellow=degraded, red=down)
- [ ] JSON output option

---

### Objective 3.3: Instance Lifecycle Commands

| SMART | Definition |
|-------|------------|
| **S**pecific | Add start, stop, restart, logs commands to manage-instances.sh |
| **M**easurable | Each command completes in < 30 seconds |
| **A**chievable | Wrapper around docker-compose with instance awareness |
| **R**elevant | Simplifies demo operations |
| **T**ime-bound | Complete by end of Day 6 |

**Success Criteria:**
- [ ] `./scripts/manage-instances.sh start USA` works
- [ ] `./scripts/manage-instances.sh stop FRA` works
- [ ] `./scripts/manage-instances.sh restart DEU` works
- [ ] `./scripts/manage-instances.sh logs USA frontend` works
- [ ] `./scripts/manage-instances.sh status` shows all instances

---

## Test Suite Requirements

### Test 3.1: Deploy with Federation Tests
```bash
# test-phase3-deploy-federate.sh
- Test --federate flag exists
- Test dry-run with --federate shows federation plan
- Test existing instances detected
```

### Test 3.2: Health Dashboard Tests
```bash
# test-phase3-health.sh
- Test dive-status.sh returns valid output
- Test --json produces valid JSON
- Test service health detection
```

### Test 3.3: Lifecycle Command Tests
```bash
# test-phase3-lifecycle.sh
- Test start command
- Test stop command
- Test restart command
- Test logs command
- Test status command
```

---

## Acceptance Criteria

Phase 3 is complete when:
1. ✅ All SMART objectives met
2. ✅ Test suite passes (all tests)
3. ✅ Can deploy new instance with auto-federation
4. ✅ Can view health status of all instances
5. ✅ Can manage instance lifecycle with simple commands
6. ✅ Changes committed to GitHub









