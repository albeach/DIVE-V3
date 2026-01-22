# 🚀 DIVE V3 Federation Robustness - Session Start Prompt

**Copy this entire prompt to start the next session:**

---

## Context & Background

I'm working on DIVE V3, a NATO coalition-friendly ICAM system with federated identity management. This session continues critical federation robustness work.

**Read Full Context**: `@.cursor/NEXT_SESSION_FEDERATION_ROBUSTNESS.md` (comprehensive 2000+ line handoff document)

## Current State
- ✅ Hub (USA) deployed and running
- ✅ FRA spoke deployed with fixes applied
- ⚠️ Terraform apply running to fix federation client scopes (adding uniqueID scope)
- ❌ DEU spoke not yet deployed
- 🔴 CRITICAL: uniqueID showing as UUID instead of username
- 🔴 CRITICAL: Hub KAS not in registry

## Required Tools & Constraints

**MANDATORY**: Use `@dive` CLI (DIVE orchestration manager) for ALL operations:
- ✅ Deployment: `./dive hub deploy`, `./dive spoke deploy FRA`
- ✅ Management: `./dive hub up/down/logs`, `./dive federation verify FRA`
- ❌ NEVER use direct Docker commands

**Authorization**: Full cleanup/nuke authorized (all data is dummy/test data)

## Immediate Tasks (Priority Order)

### 1. Verify Terraform Apply Completed ⏰ URGENT
Check terminal output to confirm federation client scope fix:
```bash
cat /Users/aubreybeach/.cursor/projects/Users-aubreybeach-Documents-GitHub-DIVE-V3-DIVE-V3/terminals/208801.txt | tail -50
```
Look for: "Apply complete! Resources: X modified"

### 2. Validate uniqueID Scope Assignment ⏰ URGENT
Verify federation clients now have uniqueID in default scopes:
```bash
# Get FRA client scopes from Hub Keycloak
# Expected: uniqueID should appear in list
```

### 3. Implement Hub KAS Auto-Registration 🔧 CRITICAL
Add KAS registration to `@scripts/dive-modules/hub/seed.sh`:
- Function: `_hub_register_kas()`
- Registers hub-kas-usa with MongoDB registry
- Auto-approves Hub KAS
- Called during hub deployment

### 4. Clean Redeploy Everything ✅ VALIDATION
```bash
./dive nuke --all --confirm
./dive hub deploy
./dive spoke deploy FRA
./dive spoke deploy DEU
./dive federation verify FRA
./dive federation verify DEU
```

## Root Causes Identified

### Issue #1: uniqueID Showing UUID
**ROOT CAUSE**: Federation clients (`dive-v3-broker-fra`, `dive-v3-broker-deu`) created by Hub don't have `uniqueID` client scope assigned.

**WHY**: Terraform resource existed but wasn't applied to existing clients (only new clients)

**FIX**: Terraform targeted apply already running (terminal 208801)

**VERIFICATION**: After fix, testuser-usa-1 on FRA should show `uniqueID: "testuser-usa-1"` not UUID

### Issue #2: Hub KAS Missing from Registry
**ROOT CAUSE**: Hub deployment never calls KAS registration API endpoint

**WHY**: No script calls `POST /api/kas/register` for Hub KAS

**FIX**: Add `_hub_register_kas()` to seed script (deferred to this session)

**VERIFICATION**: `curl -sk https://localhost:4000/api/kas/registry | jq` should return hub-kas-usa

## Key Architectural Points

### Database as SSOT
- ✅ MongoDB stores federation registry, trusted issuers, KAS registry
- ✅ Legacy JSON loading removed (dual-write eliminated)
- ✅ All configuration via API endpoints

### Container Networking
- `internalApiUrl`: Docker container-to-container (https://dive-spoke-fra-backend:4000)
- `apiUrl`: Browser-to-container (https://localhost:4010)
- Hub backend uses `internalApiUrl` for federated search

### Keycloak 26+ Requirements
- User Profile MUST be configured BEFORE creating users with custom attributes
- Client scopes MUST be assigned for claims to appear in federated tokens
- `view: ["admin", "user"]` required for attributes to federate

## Success Criteria (End of Session)

- [ ] Terraform apply completed successfully (no errors)
- [ ] Federation clients have uniqueID in default scopes
- [ ] testuser-usa-1 on FRA shows `uniqueID: "testuser-usa-1"` (not UUID)
- [ ] Hub KAS appears in registry with status APPROVED
- [ ] FRA and DEU spokes deployed with bidirectional federation verified
- [ ] Cross-instance SSO works (USA user → FRA, FRA user → Hub)
- [ ] Federated search returns resources from all instances

## Monitoring Assets (Available for Phase 3)

Existing Prometheus/Grafana infrastructure ready for integration:
```
docker/instances/shared/
├── docker-compose.yml          # Prometheus, Grafana, Alertmanager
└── config/
    ├── prometheus.yml
    └── grafana/provisioning/
        └── dashboards/
            ├── federation-metrics.json  # 10 pre-built dashboards
            └── kas-federation.json
```

**Gap**: Backend services don't expose `/metrics` endpoint yet (Phase 3 work)

## Commands Reference

```bash
# Check service status
./dive hub status
./dive spoke status FRA

# View logs
./dive hub logs backend
./dive spoke logs FRA keycloak

# Verify federation
./dive federation verify FRA

# Nuclear cleanup
./dive nuke --all --confirm

# API health checks
curl -sk https://localhost:4000/health
curl -sk https://localhost:4010/health
```

## Key Files to Review

- `@scripts/dive-modules/hub/seed.sh` - Add KAS registration here (line ~150)
- `@scripts/dive-modules/hub/deployment.sh` - Call KAS registration in deployment flow
- `@backend/src/services/hub-spoke-registry.service.ts` - Spoke registration (has internalApiUrl fix)
- `@terraform/modules/federated-instance/main.tf` - Federation client scopes (line 850)

## Phased Implementation Plan

**Phase 1** (THIS SESSION): Fix critical federation issues
- Verify Terraform fix
- Implement Hub KAS registration
- Clean redeploy Hub + FRA + DEU
- Validate uniqueID mapping and federation

**Phase 2** (Next session): Multi-instance validation
- Cross-instance SSO testing (12+ paths)
- Federated resource search testing
- Authorization policy validation

**Phase 3**: Monitoring integration
- Connect Prometheus to DIVE backends
- Update Grafana dashboards
- Configure federation alerts

**Phase 4**: Automated testing
- Unit tests (80% coverage target)
- Integration tests (federation flows)
- E2E tests (cross-instance SSO)

**Phase 5**: Production hardening
- Security hardening (rate limiting, token rotation)
- Performance optimization (caching, indexing)
- Operational readiness (runbooks, backup strategy)

## Request to AI Assistant

Please help me:

1. **First**: Check Terraform apply status (terminal 208801.txt) and validate fix worked
2. **Second**: Implement Hub KAS auto-registration in seed script using best practices (robust, persistent, database-driven)
3. **Third**: Perform clean redeploy of Hub + FRA + DEU with full validation
4. **Fourth**: Verify all success criteria are met

**CRITICAL CONSTRAINTS**:
- ❌ NO manual steps or workarounds
- ✅ ONLY use `@dive` CLI for all operations
- ✅ Database is SSOT (no JSON file loading)
- ✅ Best practice approach (robust, resilient, persistent)
- ✅ All changes must be in scripts/services (no one-off commands)

**AUTHORIZATION**:
- ✅ Full cleanup/nuke authorized (all data is dummy/test)
- ✅ Can delete and recreate users/resources as needed
- ✅ Can restart services multiple times for testing

Let's systematically resolve these critical federation issues using proper engineering practices. Start with checking the Terraform apply status.
