# NEW SESSION PROMPT - DIVE V3 Deployment Optimization

```markdown
# DIVE V3 Deployment Optimization - Session Continuation

## 🎯 MISSION

Continue **Phase 3 Sprint 1+: Deployment Optimization** for DIVE V3 coalition ICAM application. Previous sessions resolved P0/P1 blockers (MongoDB replica set, service classification, otel-collector health check). Your task: **eliminate remaining technical debt**, **implement production-grade orchestration**, and **establish comprehensive testing**.

---

## 📊 CURRENT STATE

**Deployment Status**: 11/12 services operational (92%)
- ⏱️ **Time**: 146s (target: <60s)
- ✅ **CORE**: 8/8 operational (postgres, mongodb, redis, redis-blacklist, keycloak, opa, backend, frontend)
- ✅ **STRETCH**: 2/2 operational (kas, opal-server)
- ✅ **OPTIONAL**: 1/2 operational (otel-collector fixed, authzforce broken)
- ⚠️ **Blocker**: authzforce times out (90s) - Tomcat context startup failure

**Recent Commits**:
- `cef80eb4` - P0 fixes (MongoDB replica set Phase 2.5, service classification)
- `3e9fba60` - P1 fix (otel-collector health check)

**Critical Files**:
- `scripts/dive-modules/deployment/hub.sh` (1253 lines - orchestration logic)
- `docker-compose.hub.yml` (12 services with health checks)
- `monitoring/otel-collector-config.yaml` (health_check extension enabled)

---

## 🔴 IMMEDIATE PRIORITIES

### P2: Resolve authzforce Timeout (90s blocker)

**Symptoms**:
```
❌ authzforce: Timeout after 90s (health: starting)
SEVERE: Context [/authzforce-ce] startup failed due to previous errors
```

**Investigate**:
1. `./dive logs authzforce | grep -i error`
2. Review `./authzforce/conf/` configuration
3. Check XML validity in domain configs
4. **Decision**: Fix OR Exclude (document in ADR)

**Expected Outcome**: Deployment time 146s → ~56s

### Gap: Hardcoded Service Management

**Current**: Service lists hardcoded in 3+ locations
**Desired**: Dynamic discovery from docker-compose.yml
**Impact**: Adding service requires code changes in hub.sh

### Gap: No Automated Testing

**Current**: Manual testing only
**Desired**: 100% test coverage with CI
**Impact**: Regressions undetected, changes risky

---

## 🛠️ TECHNICAL REQUIREMENTS

### CRITICAL RULES

1. **ONLY use `./dive` CLI** for deployment/orchestration:
   - ✅ `./dive nuke all --confirm` (cleanup)
   - ✅ `./dive hub deploy` (deployment)
   - ✅ `./dive logs <service>` (debugging)
   - ❌ NO direct `docker` or `docker compose` commands

2. **NO WORKAROUNDS/SHORTCUTS**: Best practice approach only
3. **HTTPS ONLY**: All services use TLS/HTTPS (no HTTP exceptions)
4. **TEST EVERYTHING**: Every change needs automated tests
5. **DOCUMENT DECISIONS**: Use ADRs for architecture choices

### Code Standards

- Use `${DOCKER_CMD:-docker}` in scripts (macOS PATH compatibility)
- Quote all variables: `"${var}"`
- Use arrays not strings for lists
- No hardcoded service names (use dynamic discovery)
- Structured logging (JSON where possible)

---

## 📚 ARTIFACTS TO REFERENCE

**MUST READ** (Before starting):
- `docs/SESSION-AUDIT.md` (928 lines) - Root cause analysis for P0/P1
- `docs/P0-FIXES-COMPLETE.md` - What was fixed and how
- `docs/P1-FIX-COMPLETE.md` - otel-collector health check fix
- `docs/NEXT-SESSION-HANDOFF.md` - Full handoff (THIS FILE)

**Key Scripts**:
- `scripts/dive` - Main CLI
- `scripts/dive-modules/deployment/hub.sh` - Deployment orchestration
- `scripts/dive-modules/orchestration-framework.sh` - 57 orch_* functions (underutilized)

**Configuration**:
- `docker-compose.hub.yml` - Service definitions
- `.env.hub` - Environment variables (GCP secrets)

---

## 🚀 NEXT STEPS

### Immediate (Session 3)
1. **authzforce Investigation** (1-2 hours)
   - Root cause analysis
   - Fix OR exclude (document decision)
   - Test deployment time improvement

2. **Validation Enhancement** (1 hour)
   - Complete `scripts/validate-hub-deployment.sh`
   - Add HTTP endpoint checks
   - Add MongoDB replica set verification

### Short-term (Session 4-5)
3. **Dynamic Service Discovery** (2-3 hours)
   - Create compose-parser.sh
   - Add docker-compose labels
   - Update hub_parallel_startup

4. **Testing Infrastructure** (4-5 hours)
   - Setup testing framework
   - Write orchestration unit tests
   - Create integration test suite

### Long-term (Session 6+)
5. **Production Hardening** (3-4 hours)
   - Error handling & retry logic
   - Observability enhancement
   - Documentation & runbooks

---

## 📈 SUCCESS METRICS

**Target Goals**:
- ⏱️ Deployment: <60s (p95)
- ✅ Services: 12/12 operational
- ✅ Tests: 100% coverage
- ✅ Reliability: 99% success rate

**Current Performance**:
- ⏱️ Deployment: 146s
- ✅ Services: 11/12
- ⚠️ Tests: 0% coverage
- ✅ Reliability: 100% (with warnings)

---

## 🚀 START HERE

**First Commands**:
```bash
# 1. Read documentation
cat docs/SESSION-AUDIT.md | less
cat docs/P0-FIXES-COMPLETE.md | less
cat docs/P1-FIX-COMPLETE.md | less

# 2. Clean deployment test
./dive nuke all --confirm
time ./dive hub deploy 2>&1 | tee /tmp/session3-audit-$(date +%s).log

# 3. Investigate authzforce
./dive logs authzforce > /tmp/authzforce-full-$(date +%s).log
grep -i "error\|severe\|exception" /tmp/authzforce-full-*.log

# 4. Decision: Fix or exclude authzforce
# Document in: docs/AUTHZFORCE-DECISION.md
```

**Authorization**: Use `./dive nuke all --confirm` freely (all data is DUMMY/FAKE).

**Constraint**: ONLY use `./dive` commands for orchestration.

**Goal**: Production-ready deployment with <60s time, 100% test coverage, zero technical debt.
```

---

**Save this prompt for next session** - Contains full context, gaps, and phased plan.
