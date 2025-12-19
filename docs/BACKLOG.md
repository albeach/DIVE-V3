# DIVE V3 Backlog

**Version**: 1.1
**Date**: December 18, 2025
**Updated**: December 19, 2025
**Format**: GitHub Issues Style

---

## Executive Summary

This backlog contains 43 work items organized into 5 epics. Items are sized using T-shirt sizing (S/M/L/XL) and prioritized using MoSCoW (Must/Should/Could/Won't).

**Total Effort**: ~25 days
**Critical Path**: DIVE-001 → DIVE-003 → DIVE-010 → DIVE-020 → DIVE-030

### Progress Summary

| Epic | Completed | Remaining | Status |
|------|-----------|-----------|--------|
| Epic 1: Local Deployment | 9/9 | 0 | ✅ Complete |
| Epic 2: Keycloak IdP | 7/7 | 0 | ✅ Complete |
| Epic 3: Hub Management | 8/8 | 0 | ✅ Complete |
| Epic 4: CI/CD Pipeline | 5/9 | 4 | 🔄 Partial |
| Epic 5: Testing | 3/10 | 7 | 🔲 Pending |

**Overall Progress**: 32/43 items complete (74%)

---

## Reference Documentation

| Document | Path | Description |
|----------|------|-------------|
| **AUDIT** | `docs/AUDIT.md` | Security audit and compliance requirements |
| **GAP_ANALYSIS** | `docs/GAP_ANALYSIS.md` | Gap analysis with outstanding items |
| **TARGET_ARCHITECTURE** | `docs/TARGET_ARCHITECTURE.md` | Target system architecture |
| **IMPLEMENTATION_PLAN** | `docs/IMPLEMENTATION_PLAN.md` | Phased implementation plan |
| **BACKLOG** | `docs/BACKLOG.md` | Detailed backlog items (this document) |
| **CI_CD_PLAN** | `docs/CI_CD_PLAN.md` | CI/CD pipeline configuration |

---

## Epic Overview

| Epic | Items | Effort | Phase | Status |
|------|-------|--------|-------|--------|
| Epic 1: Local Deployment | 9 | 5d | 1 | ✅ Complete |
| Epic 2: Keycloak IdP | 7 | 5d | 2 | ✅ Complete |
| Epic 3: Hub Management | 8 | 6d | 3 | 🔄 In Progress |
| Epic 4: CI/CD Pipeline | 9 | 5d | 4 | 🔄 Partial |
| Epic 5: Testing | 10 | 4d | 5 | 🔲 Pending |

---

## Epic 1: Local Deployment Automation

**Goal**: Achieve idempotent, one-command local deployment with rollback capability.
**Owner**: DevOps Lead
**Phase**: 1
**Status**: ✅ COMPLETE (December 19, 2025)

### DIVE-001: Make `cmd_nuke` Fully Idempotent

**Priority**: Must Have
**Size**: S (4 hours)
**Assignee**: TBD

**Description**:
The current `cmd_nuke` function doesn't fully clean up Docker resources. Running it multiple times can leave orphaned volumes, networks, and images.

**Acceptance Criteria**:
- [ ] Running `./dive nuke --confirm` 3x consecutively produces no errors
- [ ] All containers removed
- [ ] All named volumes removed
- [ ] All dive-specific networks removed
- [ ] Dangling volumes pruned
- [ ] Optional: `--images` flag removes dive images

**Implementation**:
```bash
# File: scripts/dive-modules/deploy.sh
# Add after existing cleanup:
docker system prune -af --volumes --filter 'label=com.dive.managed=true'
docker network rm dive-v3-shared-network shared-network 2>/dev/null || true
```

**Tests**:
- `tests/docker/phase1-foundation.sh::test_nuke_idempotent`

---

### DIVE-002: Add `--confirm` Flag to Destructive Commands

**Priority**: Must Have
**Size**: S (2 hours)
**Assignee**: TBD
**Depends On**: DIVE-001

**Description**:
Destructive commands (`nuke`, `reset`) should require explicit confirmation to prevent accidental data loss.

**Acceptance Criteria**:
- [ ] `./dive nuke` prompts for confirmation
- [ ] `./dive nuke --confirm` skips prompt
- [ ] `./dive nuke --force` skips prompt (alias)
- [ ] Confirmation requires typing 'yes'
- [ ] Exit with code 1 if confirmation denied

**Implementation**:
```bash
# File: scripts/dive-modules/deploy.sh
if [ "$FORCE" != true ] && [ "$CONFIRM" != true ]; then
    echo "This will destroy ALL DIVE data including:"
    echo "  - Containers: $(docker ps -aq --filter 'name=dive' | wc -l)"
    echo "  - Volumes: $(docker volume ls -q --filter 'name=dive' | wc -l)"
    read -p "Type 'yes' to confirm: " confirm
    [ "$confirm" != "yes" ] && exit 1
fi
```

---

### DIVE-003: Implement Deploy Checkpoint System

**Priority**: Must Have
**Size**: M (6 hours)
**Assignee**: TBD
**Depends On**: DIVE-001

**Description**:
Create a checkpoint system that saves state before destructive operations, enabling rollback.

**Acceptance Criteria**:
- [ ] `./dive checkpoint create` saves current state
- [ ] Checkpoint includes: timestamp, compose state, volume snapshots
- [ ] Checkpoint stored in `.dive-checkpoint/`
- [ ] Maximum 3 checkpoints retained (oldest auto-deleted)
- [ ] `./dive checkpoint list` shows available checkpoints

**Implementation**:
```bash
# File: scripts/dive-modules/common.sh
checkpoint_create() {
    local CHECKPOINT_DIR="${DIVE_ROOT}/.dive-checkpoint"
    local TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    mkdir -p "${CHECKPOINT_DIR}/${TIMESTAMP}"

    # Save compose state
    docker compose ps --format json > "${CHECKPOINT_DIR}/${TIMESTAMP}/compose-state.json"

    # Backup volumes
    for vol in postgres_data mongo_data redis_data; do
        docker run --rm -v "dive-v3_${vol}:/data" -v "${CHECKPOINT_DIR}/${TIMESTAMP}:/backup" \
            alpine tar czf "/backup/${vol}.tar.gz" -C /data .
    done

    echo "$TIMESTAMP" > "${CHECKPOINT_DIR}/latest"
}
```

---

### DIVE-004: Implement Rollback Command

**Priority**: Must Have
**Size**: M (4 hours)
**Assignee**: TBD
**Depends On**: DIVE-003

**Description**:
Implement `./dive rollback` to restore from a checkpoint.

**Acceptance Criteria**:
- [ ] `./dive rollback` restores from latest checkpoint
- [ ] `./dive rollback --to <timestamp>` restores specific checkpoint
- [ ] Rollback stops current containers
- [ ] Rollback restores volumes from backup
- [ ] Rollback restarts services
- [ ] Health check after rollback

**Implementation**:
```bash
# File: scripts/dive-modules/deploy.sh
cmd_rollback() {
    local CHECKPOINT="${1:-$(cat .dive-checkpoint/latest)}"
    log_step "Rolling back to checkpoint: ${CHECKPOINT}"

    cmd_down

    for vol in postgres_data mongo_data redis_data; do
        docker volume rm "dive-v3_${vol}" 2>/dev/null || true
        docker volume create "dive-v3_${vol}"
        docker run --rm -v "dive-v3_${vol}:/data" \
            -v ".dive-checkpoint/${CHECKPOINT}:/backup" \
            alpine tar xzf "/backup/${vol}.tar.gz" -C /data
    done

    cmd_up
    cmd_health
}
```

---

### DIVE-005: Add `--json` Output to Health Commands

**Priority**: Should Have
**Size**: S (2 hours)
**Assignee**: TBD

**Description**:
Add structured JSON output for health commands to enable scripting and monitoring integration.

**Acceptance Criteria**:
- [ ] `./dive health --json` returns valid JSON
- [ ] JSON includes: status, timestamp, services array
- [ ] Each service has: name, healthy (bool), latency_ms
- [ ] Exit code 0 if all healthy, 1 if any unhealthy
- [ ] `--quiet` mode returns only exit code

**Implementation**:
```bash
# File: scripts/dive-modules/status.sh
cmd_health_json() {
    local result='{"status":"healthy","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","services":{'
    local all_healthy=true

    for service in keycloak backend frontend mongodb redis opa opal; do
        local start=$(date +%s%N)
        local healthy=$(check_service_health "$service")
        local end=$(date +%s%N)
        local latency=$(( (end - start) / 1000000 ))

        result+="\"$service\":{\"healthy\":$healthy,\"latency_ms\":$latency},"
        [ "$healthy" = "false" ] && all_healthy=false
    done

    result="${result%,}}}"
    [ "$all_healthy" = "false" ] && result="${result/healthy/unhealthy}"

    echo "$result" | jq .
    $all_healthy && return 0 || return 1
}
```

---

### DIVE-006: Auto-Load Secrets in Spoke Lifecycle

**Priority**: Should Have
**Size**: S (2 hours)
**Assignee**: TBD

**Description**:
Spoke commands should automatically load secrets, eliminating the need for manual `./dive secrets load`.

**Acceptance Criteria**:
- [ ] `./dive --instance fra spoke up` loads secrets automatically
- [ ] Secrets loaded based on `--instance` value
- [ ] GCP secrets used if `USE_GCP_SECRETS=true`
- [ ] Falls back to local defaults for development
- [ ] No duplicate loads if secrets already set

**Implementation**:
```bash
# File: scripts/dive-modules/spoke.sh
spoke_up() {
    # Auto-load secrets at start
    if [ -z "$POSTGRES_PASSWORD" ]; then
        log_verbose "Auto-loading secrets for instance: ${INSTANCE}"
        load_secrets
    fi

    # Existing spoke_up logic...
}
```

---

### DIVE-007: Increase Keycloak Wait Timeout

**Priority**: Should Have
**Size**: S (2 hours)
**Assignee**: TBD

**Description**:
The 60-second timeout for Keycloak startup is too short for cold starts. Increase to 180s with exponential backoff.

**Acceptance Criteria**:
- [ ] Default timeout increased to 180 seconds
- [ ] Timeout configurable via `KEYCLOAK_WAIT_TIMEOUT`
- [ ] Exponential backoff: 2s, 4s, 8s, 16s, ...
- [ ] Clear error message on timeout
- [ ] Success message includes actual wait time

**Implementation**:
```bash
# File: scripts/dive-modules/core.sh
wait_for_keycloak() {
    local timeout="${KEYCLOAK_WAIT_TIMEOUT:-180}"
    local elapsed=0
    local delay=2

    while [ $elapsed -lt $timeout ]; do
        if curl -sf "https://localhost:${KEYCLOAK_HTTPS_PORT}/realms/master" >/dev/null 2>&1; then
            log_success "Keycloak ready in ${elapsed}s"
            return 0
        fi
        sleep $delay
        elapsed=$((elapsed + delay))
        delay=$((delay * 2 > 30 ? 30 : delay * 2))  # Cap at 30s
    done

    log_error "Keycloak failed to start within ${timeout}s"
    return 1
}
```

---

### DIVE-008: Create Hub Seed Scripts Directory

**Priority**: Could Have
**Size**: S (2 hours)
**Assignee**: TBD

**Description**:
The `hub seed` command references a missing `scripts/hub-init/` directory.

**Acceptance Criteria**:
- [ ] `scripts/hub-init/` directory created
- [ ] Contains `seed-users.ts` for test users
- [ ] Contains `seed-resources.ts` for test documents
- [ ] `./dive hub seed` runs without errors
- [ ] Seed data matches ABAC test scenarios

---

### DIVE-009: Create Phase 1 Foundation Tests

**Priority**: Must Have
**Size**: S (4 hours)
**Assignee**: TBD
**Depends On**: DIVE-001 through DIVE-007

**Description**:
Create test suite for Phase 1 functionality.

**Acceptance Criteria**:
- [ ] `tests/docker/phase1-foundation.sh` created
- [ ] Tests nuke idempotency
- [ ] Tests checkpoint creation
- [ ] Tests rollback functionality
- [ ] Tests health JSON output
- [ ] Tests auto-secret loading
- [ ] All tests pass

---

## Epic 2: Keycloak IdP Automation

**Goal**: Automate Keycloak IdP creation via dynamic federation link commands.
**Owner**: Backend Lead
**Phase**: 2
**Status**: ✅ COMPLETE (December 19, 2025)

> **Note**: Implementation approach changed from hardcoded IdPs in realm JSON to dynamic IdP creation via `./dive federation link <CODE>`. User profile templates and localized mappers added for all 32 NATO nations.

### DIVE-010: Add IdP Definitions to Realm JSON

**Priority**: Must Have
**Size**: M (8 hours)
**Assignee**: TBD
**Depends On**: DIVE-001

**Description**:
Add Identity Provider definitions to the realm JSON template so they are created on realm import.

**Acceptance Criteria**:
- [ ] `keycloak/realms/dive-v3-broker.json` includes 4 IdP definitions
- [ ] IdPs: usa-idp, gbr-idp, fra-idp, deu-idp
- [ ] Each IdP has: alias, providerId, config with URLs
- [ ] Uses `${ENV_VAR}` placeholders for secrets
- [ ] IdPs enabled on import

**Implementation**:
```json
// File: keycloak/realms/dive-v3-broker.json
{
  "identityProviders": [
    {
      "alias": "usa-idp",
      "providerId": "oidc",
      "enabled": true,
      "trustEmail": true,
      "config": {
        "clientId": "dive-v3-usa-idp-client",
        "clientSecret": "${USA_IDP_CLIENT_SECRET}",
        "tokenUrl": "${USA_IDP_URL}/realms/master/protocol/openid-connect/token",
        "authorizationUrl": "${USA_IDP_URL}/realms/master/protocol/openid-connect/auth",
        "userInfoUrl": "${USA_IDP_URL}/realms/master/protocol/openid-connect/userinfo",
        "jwksUrl": "${USA_IDP_URL}/realms/master/protocol/openid-connect/certs",
        "validateSignature": "true",
        "useJwksUrl": "true"
      }
    }
  ]
}
```

---

### DIVE-011: Enhance import-realm.sh for Secret Injection

**Priority**: Must Have
**Size**: S (4 hours)
**Assignee**: TBD
**Depends On**: DIVE-010

**Description**:
Modify the realm import script to substitute environment variables before import.

**Acceptance Criteria**:
- [ ] `import-realm.sh` processes JSON with envsubst
- [ ] All `${VAR}` placeholders replaced
- [ ] Processed JSON stored in temp directory
- [ ] Original JSON unchanged
- [ ] Error if required variables missing

**Implementation**:
```bash
#!/bin/bash
# File: keycloak/scripts/import-realm.sh
set -e

REALM_DIR=/opt/keycloak/realms
PROCESSED_DIR=/tmp/processed-realms
mkdir -p $PROCESSED_DIR

for realm_file in $REALM_DIR/*.json; do
    filename=$(basename "$realm_file")
    envsubst < "$realm_file" > "$PROCESSED_DIR/$filename"
done

exec /opt/keycloak/bin/kc.sh "$@" --import-realm --dir=$PROCESSED_DIR
```

---

### DIVE-012: Add envsubst to Keycloak Dockerfile

**Priority**: Must Have
**Size**: S (1 hour)
**Assignee**: TBD
**Depends On**: DIVE-011

**Description**:
Ensure `envsubst` is available in the Keycloak container.

**Acceptance Criteria**:
- [ ] Dockerfile installs `gettext` package
- [ ] `envsubst` command available in container
- [ ] Image size impact minimal

---

### DIVE-013: Add IdP Client Secrets to GCP

**Priority**: Must Have
**Size**: S (2 hours)
**Assignee**: TBD

**Description**:
Create GCP secrets for IdP client secrets.

**Acceptance Criteria**:
- [ ] `dive-v3-idp-usa-client-secret` created
- [ ] `dive-v3-idp-gbr-client-secret` created
- [ ] `dive-v3-idp-fra-client-secret` created
- [ ] `dive-v3-idp-deu-client-secret` created
- [ ] Secrets accessible to service accounts

---

### DIVE-014: Add Protocol Mappers to Realm JSON

**Priority**: Should Have
**Size**: S (2 hours)
**Assignee**: TBD
**Depends On**: DIVE-010

**Description**:
Add identity provider mappers for DIVE attributes.

**Acceptance Criteria**:
- [ ] Mapper for `clearance` attribute
- [ ] Mapper for `countryOfAffiliation` attribute
- [ ] Mapper for `acpCOI` attribute
- [ ] Mapper for `uniqueID` attribute
- [ ] Mappers applied to all IdPs

---

### DIVE-015: Create IdP Verification Script

**Priority**: Should Have
**Size**: S (2 hours)
**Assignee**: TBD
**Depends On**: DIVE-010

**Description**:
Create a script to verify all IdPs are properly configured.

**Acceptance Criteria**:
- [ ] `scripts/verify-idps.sh` created
- [ ] Verifies 4 IdPs exist
- [ ] Verifies each IdP enabled
- [ ] Verifies client secret configured
- [ ] Verifies protocol mappers present
- [ ] Exit code 0 if all pass

---

### DIVE-016: Create Phase 2 IdP Tests

**Priority**: Must Have
**Size**: S (4 hours)
**Assignee**: TBD
**Depends On**: DIVE-010 through DIVE-015

**Description**:
Create test suite for Phase 2 IdP automation.

**Acceptance Criteria**:
- [ ] `tests/docker/phase2-idp.sh` created
- [ ] Tests IdP creation on import
- [ ] Tests secret injection
- [ ] Tests protocol mappers
- [ ] All tests pass

---

## Epic 3: Hub Enhanced Spoke Management

**Goal**: Enhance Hub capabilities for centralized spoke management and monitoring.
**Owner**: DevOps Lead
**Phase**: 3
**Status**: ✅ COMPLETE (December 19, 2025)

> **Note**: Phase 3 completed with full GCP deployment automation, Terraform GCS backend, and compute-vm module.

### DIVE-020: Configure Terraform GCS Backend ✅

**Priority**: Must Have
**Size**: S (4 hours)
**Assignee**: DevOps Lead
**Depends On**: DIVE-010
**Status**: ✅ COMPLETE

**Description**:
Configure remote state storage in GCS for shared access.

**Acceptance Criteria**:
- [x] GCS bucket `gs://dive25-tfstate` configured
- [x] Versioning enabled on bucket
- [x] Backend configured in `terraform/pilot/backend.tf`
- [x] Backend configured in `terraform/spoke/backend.tf`
- [x] State locking enabled
- [x] `terraform init` successfully uses remote backend

---

### DIVE-021: Create Compute VM Terraform Module ✅

**Priority**: Must Have
**Size**: L (8 hours)
**Assignee**: DevOps Lead
**Depends On**: DIVE-020
**Status**: ✅ COMPLETE

**Description**:
Create reusable Terraform module for provisioning Compute Engine VMs.

**Acceptance Criteria**:
- [x] Module in `terraform/modules/compute-vm/`
- [x] Variables: machine_type, zone, disk_size, network
- [x] Outputs: instance_ip, instance_name, ssh_command
- [x] Includes startup script for Docker installation
- [x] Configures firewall rules
- [x] Applies labels for identification

---

### DIVE-022: Create VM Startup Script ✅

**Priority**: Must Have
**Size**: M (4 hours)
**Assignee**: DevOps Lead
**Depends On**: DIVE-021
**Status**: ✅ COMPLETE

**Description**:
Create startup script that installs Docker and required tools.

**Acceptance Criteria**:
- [x] Installs Docker Engine
- [x] Installs Docker Compose v2
- [x] Installs gcloud SDK
- [x] Configures Docker credentials for Artifact Registry
- [x] Creates DIVE V3 directory
- [x] Creates helper scripts (health-check.sh, load-secrets.sh)

---

### DIVE-023: Implement `pilot deploy` Command ✅

**Priority**: Must Have
**Size**: M (4 hours)
**Assignee**: DevOps Lead
**Depends On**: DIVE-021, DIVE-022
**Status**: ✅ COMPLETE

**Description**:
Implement full `./dive --env gcp pilot deploy` workflow.

**Acceptance Criteria**:
- [x] Provisions VM with Terraform (--provision flag)
- [x] Waits for VM to be ready
- [x] Syncs code to VM
- [x] Loads secrets from GCP
- [x] Runs docker compose up
- [x] Verifies health
- [x] Reports endpoints

---

### DIVE-024: Implement GCP Checkpoint Storage ✅

**Priority**: Should Have
**Size**: S (2 hours)
**Assignee**: DevOps Lead
**Depends On**: DIVE-023
**Status**: ✅ COMPLETE

**Description**:
Store checkpoints in GCS for GCP deployments.

**Acceptance Criteria**:
- [x] Checkpoints stored in `gs://dive25-checkpoints/`
- [x] `./dive --env gcp pilot checkpoint create` uploads to GCS
- [x] 30-day retention policy
- [x] Checkpoints include Terraform state and volume backups

---

### DIVE-025: Implement `pilot rollback` Command ✅

**Priority**: Must Have
**Size**: M (4 hours)
**Assignee**: DevOps Lead
**Depends On**: DIVE-024
**Status**: ✅ COMPLETE

**Description**:
Implement rollback for GCP deployments.

**Acceptance Criteria**:
- [x] `./dive --env gcp pilot rollback` restores from GCS
- [x] Restores Terraform state
- [x] Restores Docker volumes
- [x] Restarts services
- [x] Verifies health
- [x] `--to <timestamp>` flag for specific checkpoint

---

### DIVE-026: Add VM Health Monitoring ✅

**Priority**: Could Have
**Size**: S (2 hours)
**Assignee**: DevOps Lead
**Depends On**: DIVE-023
**Status**: ✅ COMPLETE

**Description**:
Add health monitoring for pilot VM.

**Acceptance Criteria**:
- [x] `./dive --env gcp pilot health` checks VM
- [x] `--json` flag for structured output
- [x] Reports VM status, latency per service
- [x] Reports service health for Hub and Spoke

---

### DIVE-027: Create Phase 3 GCP Tests ✅

**Priority**: Must Have
**Size**: M (4 hours)
**Assignee**: DevOps Lead
**Depends On**: DIVE-020 through DIVE-026
**Status**: ✅ COMPLETE

**Description**:
Create test suite for Phase 3 GCP deployment.

**Acceptance Criteria**:
- [x] `tests/gcp/phase3-pilot.sh` created
- [x] Tests Terraform init with GCS backend
- [x] Tests pilot deploy dry-run
- [x] Tests pilot rollback dry-run
- [x] Tests health --json output
- [x] All 10 tests pass (4 GCP tests skipped without credentials)

---

## Epic 4: CI/CD Pipeline

**Goal**: Implement CI/CD pipeline with quality gates.
**Owner**: DevOps Lead
**Phase**: 4

### DIVE-030: Create PR Validation Workflow

**Priority**: Must Have
**Size**: M (4 hours)
**Assignee**: TBD
**Depends On**: DIVE-020

**Description**:
Create GitHub Actions workflow for PR validation.

**Acceptance Criteria**:
- [ ] `.github/workflows/dive-pr-checks.yml` created
- [ ] Runs ShellCheck on all bash scripts
- [ ] Runs Terraform validate
- [ ] Runs `./dive deploy --dry-run`
- [ ] Runs Phase 0 and 1 tests
- [ ] Blocks PR merge on failure

---

### DIVE-031: Create Deploy Workflow

**Priority**: Must Have
**Size**: M (4 hours)
**Assignee**: TBD
**Depends On**: DIVE-030

**Description**:
Create GitHub Actions workflow for deployment to dev.

**Acceptance Criteria**:
- [ ] `.github/workflows/dive-deploy.yml` created
- [ ] Triggers on merge to main
- [ ] Builds Docker images
- [ ] Pushes to Artifact Registry
- [ ] Deploys to dev environment
- [ ] Creates checkpoint before deploy

---

### DIVE-032: Add Auto-Rollback Job

**Priority**: Must Have
**Size**: S (2 hours)
**Assignee**: TBD
**Depends On**: DIVE-031

**Description**:
Add automatic rollback on E2E test failure.

**Acceptance Criteria**:
- [ ] Rollback job added to deploy workflow
- [ ] Triggers on E2E test failure
- [ ] Restores from checkpoint
- [ ] Notifies team of rollback
- [ ] Creates issue for failed deploy

---

### DIVE-033: Add Semantic Versioning

**Priority**: Should Have
**Size**: S (2 hours)
**Assignee**: TBD
**Depends On**: DIVE-031

**Description**:
Tag Docker images with semantic versions.

**Acceptance Criteria**:
- [ ] Images tagged with git SHA
- [ ] Images tagged with semver from git tags
- [ ] `latest` tag updated on main
- [ ] Version visible in container labels

---

### DIVE-034: Add GCP Service Account to GitHub

**Priority**: Must Have
**Size**: S (1 hour)
**Assignee**: TBD
**Depends On**: DIVE-030

**Description**:
Configure GCP service account in GitHub Secrets.

**Acceptance Criteria**:
- [ ] `GCP_SA_KEY` secret created
- [ ] Service account has required permissions
- [ ] Workflow can authenticate to GCP

---

### DIVE-035: Create Deployment Dashboard

**Priority**: Could Have
**Size**: S (2 hours)
**Assignee**: TBD
**Depends On**: DIVE-031

**Description**:
Create summary dashboard in GitHub Actions.

**Acceptance Criteria**:
- [ ] Summary step in deploy workflow
- [ ] Shows deployment status
- [ ] Shows endpoint URLs
- [ ] Shows version information
- [ ] Links to logs

---

### DIVE-036: Add Branch Protection Rules

**Priority**: Should Have
**Size**: S (1 hour)
**Assignee**: TBD
**Depends On**: DIVE-030

**Description**:
Configure branch protection for main branch.

**Acceptance Criteria**:
- [ ] Require PR reviews
- [ ] Require status checks to pass
- [ ] Require linear history
- [ ] No force pushes

---

### DIVE-037: Create Phase 4 CI Tests

**Priority**: Must Have
**Size**: S (4 hours)
**Assignee**: TBD
**Depends On**: DIVE-030 through DIVE-036

**Description**:
Create tests to validate CI/CD configuration.

**Acceptance Criteria**:
- [ ] `tests/ci/phase4-pipeline.sh` created
- [ ] Tests workflow syntax
- [ ] Tests secret availability
- [ ] Validates PR checks work

---

### DIVE-038: Create Workflow Status Badge

**Priority**: Could Have
**Size**: S (0.5 hours)
**Assignee**: TBD
**Depends On**: DIVE-031

**Description**:
Add workflow status badge to README.

**Acceptance Criteria**:
- [ ] Badge shows deploy workflow status
- [ ] Badge shows PR checks status
- [ ] Badges visible in README.md

---

## Epic 5: Testing Suite Completion

**Goal**: Complete test coverage and achieve 95%+ pass rate.
**Owner**: QA Lead
**Phase**: 5

### DIVE-040: Create Local Deploy E2E Test

**Priority**: Must Have
**Size**: M (4 hours)
**Assignee**: TBD
**Depends On**: DIVE-030

**Description**:
Create end-to-end test for local deployment.

**Acceptance Criteria**:
- [ ] `tests/e2e/local-deploy.test.sh` created
- [ ] Tests full nuke → deploy → verify cycle
- [ ] Validates all services healthy
- [ ] Validates API endpoints respond
- [ ] Validates Keycloak login works

---

### DIVE-041: Create GCP Deploy E2E Test

**Priority**: Should Have
**Size**: L (4 hours)
**Assignee**: TBD
**Depends On**: DIVE-027

**Description**:
Create end-to-end test for GCP deployment.

**Acceptance Criteria**:
- [ ] `tests/e2e/gcp-deploy.test.sh` created
- [ ] Tests pilot deploy lifecycle
- [ ] Tests checkpoint and rollback
- [ ] Validates endpoints accessible
- [ ] Cleans up resources after test

---

### DIVE-042: Create IdP Login Tests

**Priority**: Must Have
**Size**: M (4 hours)
**Assignee**: TBD
**Depends On**: DIVE-015

**Description**:
Create automated login tests for all IdPs.

**Acceptance Criteria**:
- [ ] `tests/e2e/idp-login.test.sh` created
- [ ] Tests login via usa-idp
- [ ] Tests login via gbr-idp
- [ ] Tests login via fra-idp
- [ ] Tests login via deu-idp
- [ ] Validates tokens contain DIVE attributes

---

### DIVE-043: Audit Missing Test Fixtures

**Priority**: Should Have
**Size**: S (2 hours)
**Assignee**: TBD

**Description**:
Audit all test scripts and identify missing fixtures.

**Acceptance Criteria**:
- [ ] All test scripts analyzed
- [ ] Missing fixtures documented
- [ ] Priority assigned to each fixture
- [ ] Issues created for missing fixtures

---

### DIVE-044: Generate Spoke Config Fixtures

**Priority**: Should Have
**Size**: M (4 hours)
**Assignee**: TBD
**Depends On**: DIVE-043

**Description**:
Generate spoke configuration fixtures for all 32 NATO countries.

**Acceptance Criteria**:
- [ ] Fixtures in `tests/fixtures/federation/spoke-configs/`
- [ ] Config for each of 32 NATO countries
- [ ] Configs include ports, URLs, secrets
- [ ] Configs validated against schema

---

### DIVE-045: Create dynamic-test-runner.sh

**Priority**: Must Have
**Size**: M (4 hours)
**Assignee**: TBD

**Description**:
Create the missing dynamic test runner script referenced in test.sh.

**Acceptance Criteria**:
- [ ] `scripts/dynamic-test-runner.sh` created
- [ ] Discovers running instances dynamically
- [ ] Runs Playwright tests against each
- [ ] Aggregates results
- [ ] Exits with appropriate code

---

### DIVE-046: Fix Flaky Tests

**Priority**: Should Have
**Size**: M (4 hours)
**Assignee**: TBD

**Description**:
Identify and fix flaky tests that fail intermittently.

**Acceptance Criteria**:
- [ ] Run full test suite 5x
- [ ] Identify tests that fail inconsistently
- [ ] Root cause each flaky test
- [ ] Apply fixes (retry logic, timeouts, isolation)
- [ ] All tests pass 5 consecutive times

---

### DIVE-047: Create Test Summary Report

**Priority**: Could Have
**Size**: S (2 hours)
**Assignee**: TBD

**Description**:
Create a test coverage summary document.

**Acceptance Criteria**:
- [ ] `tests/COVERAGE.md` created
- [ ] Lists all test suites
- [ ] Shows pass/fail counts
- [ ] Shows coverage percentage
- [ ] Updated automatically by CI

---

### DIVE-048: Achieve 95% Pass Rate

**Priority**: Must Have
**Size**: M (variable)
**Assignee**: TBD
**Depends On**: DIVE-040 through DIVE-047

**Description**:
Ensure overall test pass rate is 95% or higher.

**Acceptance Criteria**:
- [ ] Run `./dive test all`
- [ ] 95%+ tests pass
- [ ] No blocker issues
- [ ] Failing tests have issues

---

### DIVE-049: Create Phase 5 Completion Tests

**Priority**: Must Have
**Size**: S (2 hours)
**Assignee**: TBD

**Description**:
Create meta-test that validates all phases complete.

**Acceptance Criteria**:
- [ ] `tests/completion-check.sh` created
- [ ] Validates Phase 1-5 deliverables
- [ ] Reports overall completion percentage
- [ ] Exits with success when 100%

---

## Branch Strategy

### Main Branches

| Branch | Purpose | Protection |
|--------|---------|------------|
| `main` | Production-ready | Requires PR, reviews, passing CI |
| `develop` | Integration | Requires PR |

### Feature Branches

| Pattern | Purpose | Merge Target |
|---------|---------|--------------|
| `feature/DIVE-XXX-*` | Feature work | develop |
| `fix/DIVE-XXX-*` | Bug fixes | develop |
| `docs/DIVE-XXX-*` | Documentation | develop |
| `hotfix/DIVE-XXX-*` | Critical fixes | main |

### PR Workflow

```
feature/DIVE-001-nuke-idempotent
    │
    └──▶ PR to develop ──▶ Review ──▶ Merge
                                         │
                              develop ◀──┘
                                 │
                                 └──▶ PR to main ──▶ Review ──▶ Merge
                                                                   │
                                                        main ◀─────┘
                                                          │
                                                          └──▶ Auto-deploy to dev
```

---

## Appendix: Issue Template

```markdown
## Issue Title: DIVE-XXX: [Description]

### Type
- [ ] Feature
- [ ] Bug Fix
- [ ] Documentation
- [ ] Infrastructure

### Priority
- [ ] Must Have
- [ ] Should Have
- [ ] Could Have

### Size
- [ ] S (< 4 hours)
- [ ] M (4-8 hours)
- [ ] L (1-2 days)
- [ ] XL (> 2 days)

### Description
[Detailed description]

### Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

### Dependencies
- DIVE-XXX

### Files to Modify
- `path/to/file.sh`

### Tests
- `tests/path/to/test.sh`
```
