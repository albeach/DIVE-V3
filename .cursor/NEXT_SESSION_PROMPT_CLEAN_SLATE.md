# DIVE V3 - Next Session Prompt: Clean Slate Validation & Production Readiness

## Context

You are continuing work on DIVE V3, a coalition-friendly federated identity and access management (ICAM) system. The previous session (2026-01-19, 8+ hours) completed **comprehensive soft fail elimination** through rigorous user testing, discovering and fixing **29+ soft fail patterns** and **14 critical bugs**.

**Git Commit**: `8934b2e6` - "fix(federation): eliminate 29+ soft fails, fix critical federation bugs"
**Status**: Federation working end-to-end, ZTDF encryption working, authorization working
**Validated**: User tested actual login flows, all issues found and fixed

---

## Complete Background & Handoff

**READ THIS FIRST**: @.cursor/NEXT_SESSION_HANDOFF_COMPLETE.md

This comprehensive handoff document (500+ lines) includes:
- Complete session summary (what was fixed, why, how)
- Current system state (what's deployed, what's working)
- Scope gap analysis (what works, what needs validation)
- Phased implementation plan with SMART goals
- All deferred actions and recommendations
- Critical lessons learned
- Validation commands (copy-paste ready)
- Common issues and solutions
- Architecture decisions and SSOT principles

**Also Review**:
- @docs/architecture/TOKEN_FLOW_ARCHITECTURE.md - Why uniqueID was missing
- @docs/architecture/TERRAFORM_FEDERATION_SSOT_ARCHITECTURE.md - How Terraform manages federation
- @docs/architecture/MAPPER_SSOT_DECISION.md - Why Terraform is SSOT for mappers

---

## Your Mission

**Primary Objective**: Validate all soft fail fixes work from **complete clean slate** deployment

**Success Criteria**:
- Deploy Hub + FRA spoke from `./dive nuke all` with ZERO soft fail messages
- Federation login working (FRA IdP → USA Hub)
- Authorization working (uniqueID in access tokens)
- All validation tests pass
- Exactly 7 IdP mappers (no 37+ duplicates)
- Deployment completes in < 30 minutes total

---

## Critical Constraints (MUST FOLLOW)

### 1. DIVE CLI ONLY - NO MANUAL DOCKER COMMANDS

**✅ CORRECT**:
```bash
./dive nuke all --confirm
./dive hub deploy
./dive spoke deploy FRA "France"
./dive spoke register FRA
```

**❌ FORBIDDEN**:
```bash
docker-compose up           # Never use directly
docker exec ... curl        # Only for inspection/validation
docker restart              # Use ./dive restart instead
terraform apply             # Only via DIVE CLI or deployment scripts
```

**Why**: DIVE CLI includes orchestration logic, state management, error recovery

### 2. NO EXCEPTIONS, NO SHORTCUTS, NO WORKAROUNDS

**Quality Standard**:
- ❌ NO manual configuration fixes
- ❌ NO "skip this step" logic
- ❌ NO "this is acceptable" for critical failures
- ✅ ONLY fix root causes
- ✅ ONLY validate success claims
- ✅ ONLY solutions that work from clean slate

### 3. All Data is DUMMY/FAKE

**Authorization**: Full authority to nuke Docker resources as needed
- Test users: testuser-fra-3 (fake)
- Passwords: TestUser2025!Pilot (test)
- Resources: Seed data for testing

**Testing Philosophy**: Nuke and redeploy as many times as needed

---

## Starting Actions (Execute In Order)

### Step 1: Verify Current State

```bash
# Check what's deployed
docker ps --filter "name=dive-" --format "{{.Names}}" | wc -l
# Should show: 20 (11 Hub + 9 FRA)

# Check federation working
./tests/orchestration/validate-federation-user-import.sh testuser-fra-3 FRA
# Should show: ✅ All attributes correct

# Check soft fails eliminated
./tests/orchestration/validate-soft-fail-fixes.sh
# Should show: All checks pass
```

### Step 2: Clean Slate Validation (CRITICAL)

```bash
# Complete nuke
./dive nuke all --confirm

# Deploy Hub
export ALLOW_INSECURE_LOCAL_DEVELOPMENT=true
./dive hub deploy 2>&1 | tee /tmp/hub-clean-slate-$(date +%Y%m%d-%H%M%S).log

# Validate Hub deployment
# - Check for soft fail messages: grep "continuing\|had issues" /tmp/hub-clean-slate-*.log
# - Should find: 0 soft fail messages
# - Verify: Federation schema created (3 tables)
# - Verify: Client scopes have claim.name

# Deploy FRA
./dive spoke deploy FRA "France" 2>&1 | tee /tmp/fra-clean-slate-$(date +%Y%m%d-%H%M%S).log

# Validate FRA deployment
# - No soft fail messages
# - Honest reporting (plaintext vs encrypted distinguished)
# - DIVE scopes assigned to federation client

# Register FRA
./dive spoke register FRA

# Validate registration
# - MongoDB: FRA entry exists
# - PostgreSQL: fra↔usa links ACTIVE
# - No duplicate mappers created

# Test Federation Login
# - Navigate to https://localhost:3000
# - Select France IdP
# - Login as testuser-fra-3
# - Verify attributes in session
# - Try accessing resource
# - Should work with no "Missing uniqueID" errors

# Run validation suite
./tests/orchestration/validate-soft-fail-fixes.sh
./tests/orchestration/validate-federation-user-import.sh testuser-fra-3 FRA
./tests/orchestration/validate-100-percent-automation.sh
```

**Success**: All tests pass, federation works, zero soft fails

### Step 3: Proceed to Next Phase

Once clean slate validation passes:
- **Phase 2**: Terraform SSOT enforcement (see handoff doc)
- **Phase 3**: hub.auto.tfvars regeneration
- **Phase 4**: Multi-spoke testing
- **Phase 5**: Production readiness

---

## Critical Files to Review

**Before making changes, review**:
- @scripts/dive-modules/spoke/pipeline/spoke-federation.sh (mapper deduplication fix)
- @scripts/hub-init/configure-hub-client.sh (client secret sync)
- @backend/src/scripts/seed-instance-resources.ts (Hub KAS query for spokes)
- @terraform/modules/federated-instance/dive-client-scopes.tf (scope SSOT)
- @terraform/hub/hub.tfvars (empty federation_partners - MongoDB SSOT)

---

## What NOT to Do (Common Pitfalls)

❌ **Don't trust success messages** - Validate actual state
❌ **Don't add `|| true`** - Makes failures visible
❌ **Don't skip validation** - Every claim must be checked
❌ **Don't use manual docker commands** - Use DIVE CLI only
❌ **Don't accept duplicates** - Single SSOT for everything
❌ **Don't create local users in Hub** - Should only be federated users from spokes
❌ **Don't assume old tokens work** - User must logout/login after scope changes

---

## Key Questions to Answer

1. **Does clean slate deployment work?** (Most critical validation)
2. **Are soft fails truly eliminated?** (Check logs for `|| true`, "continuing")
3. **Do mappers duplicate on redeploy?** (Should stay at 7, not grow to 37)
4. **Does hub.auto.tfvars reflect MongoDB?** (Should have only registered spokes)
5. **Can multiple spokes coexist?** (FRA + DEU + GBR simultaneously)

---

## Expected Outcomes

**After This Session**:
- ✅ Clean slate deployment validated (Hub + 3 spokes)
- ✅ Terraform SSOT enforced (no duplication)
- ✅ All tests passing
- ✅ Production-ready deployment
- ✅ Complete documentation
- ✅ Team can deploy independently

---

**Quality Bar**: Best practice, persistent, resilient solutions with full testing
**Authorization**: Nuke/clean Docker resources as needed (all data is DUMMY/FAKE)
**Constraint**: DIVE CLI ONLY - NO manual docker commands
**Standard**: NO EXCEPTIONS, NO SHORTCUTS, NO WORKAROUNDS
