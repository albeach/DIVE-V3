# DIVE V3 Module Consolidation Roadmap

## Overview

This document outlines the plan to consolidate 91 shell script modules down to 30 modules (67% reduction) as part of the orchestration framework refactoring.

**Status**: IN PROGRESS
**Started**: 2026-01-22
**Target**: 30 modules in organized directory structure

## Current State: 91 Modules

```
scripts/dive-modules/
├── Core (15 modules)
│   ├── common.sh               # KEEP - Foundation utilities
│   ├── logging.sh              # KEEP - Logging functions
│   ├── help.sh                 # KEEP - CLI help
│   ├── core.sh                 # MERGE → deployment/
│   ├── deploy.sh               # MERGE → deployment/
│   ├── status.sh               # MERGE → deployment/verification.sh
│   ├── db.sh                   # MERGE → deployment/
│   ├── naming.sh               # MERGE → core/common.sh
│   ├── certificates.sh         # KEEP → configuration/
│   ├── terraform.sh            # KEEP → configuration/
│   ├── terraform-apply.sh      # MERGE → configuration/terraform.sh
│   ├── policy.sh               # KEEP → utilities/
│   ├── kas.sh                  # MERGE → deployment/
│   ├── redis.sh                # MERGE → deployment/
│   └── pilot.sh                # KEEP → utilities/
│
├── Hub (12 modules)
│   ├── hub.sh                  # KEEP → deployment/hub.sh
│   ├── hub/deploy.sh           # MERGE → deployment/hub.sh
│   ├── hub/init.sh             # MERGE → deployment/hub.sh
│   ├── hub/seed.sh             # MERGE → deployment/hub.sh
│   ├── hub/services.sh         # MERGE → deployment/hub.sh
│   ├── hub/status.sh           # MERGE → deployment/verification.sh
│   ├── hub/spokes.sh           # MERGE → deployment/hub.sh
│   ├── hub/amr.sh              # MERGE → configuration/
│   ├── hub/cleanup.sh          # MERGE → deployment/rollback.sh
│   ├── hub/fix.sh              # MERGE → utilities/troubleshooting.sh
│   ├── hub/reset.sh            # MERGE → deployment/rollback.sh
│   └── hub/policy.sh           # MERGE → utilities/policy.sh
│
├── Spoke (28 modules)
│   ├── spoke.sh                # KEEP → deployment/spoke.sh
│   ├── spoke/spoke-deploy.sh   # MERGE → deployment/spoke.sh
│   ├── spoke/spoke-init.sh     # MERGE → deployment/spoke.sh
│   ├── spoke/operations.sh     # MERGE → deployment/spoke.sh
│   ├── spoke/localization.sh   # MERGE → deployment/spoke.sh
│   ├── spoke/federation.sh     # MERGE → federation/setup.sh
│   ├── spoke/pipeline/*.sh     # MERGE → deployment/spoke.sh, containers.sh
│   └── ...                     # See detailed mapping below
│
├── Federation (10 modules)
│   ├── federation.sh           # KEEP → federation/setup.sh
│   ├── federation-link.sh      # MERGE → federation/setup.sh
│   ├── federation-setup.sh     # MERGE → federation/setup.sh
│   ├── federation-test.sh      # MERGE → federation/verification.sh
│   ├── federation-diagnose.sh  # MERGE → utilities/troubleshooting.sh
│   ├── federation-mappers.sh   # MERGE → federation/setup.sh
│   ├── federation-state.sh     # MERGE → federation/health.sh
│   ├── federation-state-db.sh  # KEEP → orchestration/state.sh
│   └── ...                     # See detailed mapping below
│
├── State Management (8 modules)
│   ├── orchestration-framework.sh      # KEEP → orchestration/framework.sh
│   ├── orchestration-state-db.sh       # MERGE → orchestration/state.sh
│   ├── orchestration-state-recovery.sh # MERGE → orchestration/state.sh
│   ├── orchestration-dependencies.sh   # MERGE → orchestration/framework.sh
│   ├── orchestration-test-framework.sh # MERGE → utilities/testing.sh
│   ├── deployment-state.sh             # DEPRECATED - DB only
│   ├── error-recovery.sh               # KEEP → orchestration/errors.sh
│   └── lock-cleanup.sh                 # MERGE → orchestration/locks.sh
│
└── Support (18 modules)
    ├── secrets.sh              # MERGE → configuration/secrets.sh
    ├── secret-sync.sh          # MERGE → configuration/secrets.sh
    ├── sp.sh                   # KEEP → utilities/
    └── ...
```

## Target State: 30 Modules

```
scripts/dive-modules/
├── core/                           # Foundation (3 modules)
│   ├── cli.sh                      # CLI entry point
│   ├── common.sh                   # Shared utilities, logging
│   └── logging.sh                  # Structured logging
│
├── orchestration/                  # State & Coordination (6 modules)
│   ├── framework.sh                # Core orchestration
│   ├── state.sh                    # State management (DB-only)
│   ├── locks.sh                    # Lock management (DB-only)
│   ├── errors.sh                   # Error handling & recovery
│   ├── circuit-breaker.sh          # Resilience patterns
│   └── metrics.sh                  # Observability metrics
│
├── deployment/                     # Deployment Operations (6 modules)
│   ├── hub.sh                      # Hub deployment
│   ├── spoke.sh                    # Spoke deployment
│   ├── preflight.sh                # Pre-deployment checks
│   ├── containers.sh               # Container orchestration
│   ├── verification.sh             # Post-deployment verification
│   └── rollback.sh                 # Rollback procedures
│
├── configuration/                  # Configuration Management (4 modules)
│   ├── terraform.sh                # Terraform operations
│   ├── secrets.sh                  # Secret management (GCP only)
│   ├── certificates.sh             # Certificate generation
│   └── templates.sh                # Config template generation
│
├── federation/                     # Federation Operations (4 modules)
│   ├── setup.sh                    # Federation setup
│   ├── verification.sh             # Federation verification
│   ├── drift-detection.sh          # Drift detection
│   └── health.sh                   # Health monitoring
│
└── utilities/                      # Support Functions (7 modules)
    ├── backup.sh                   # Backup operations
    ├── testing.sh                  # Testing utilities
    ├── troubleshooting.sh          # Diagnostic tools
    ├── policy.sh                   # Policy operations
    ├── help.sh                     # CLI help
    ├── pilot.sh                    # Pilot VM operations
    └── sp.sh                       # SP client operations
```

## Migration Strategy

### Phase 1: Foundation (COMPLETED)
- [x] core/common.sh - Keep existing, already centralized
- [x] core/logging.sh - Keep existing
- [x] orchestration/state.sh - Updated to database-only
- [x] orchestration/locks.sh - Updated to PostgreSQL-only

### Phase 2: Consolidate Secret Management
- [ ] configuration/secrets.sh
  - Merge: secrets.sh, secret-sync.sh, spoke/pipeline/spoke-secrets.sh
  - Use gcp-secrets.ts patterns for consistency

### Phase 3: Consolidate Container Management
- [ ] deployment/containers.sh
  - Merge: spoke/pipeline/spoke-containers.sh
  - Extract common container operations from hub/spoke

### Phase 4: Consolidate Federation
- [ ] federation/setup.sh
  - Merge: federation.sh, federation-link.sh, federation-setup.sh
  - Merge: spoke/federation.sh, spoke/pipeline/spoke-federation.sh
- [ ] federation/verification.sh
  - Merge: federation-test.sh, spoke/spoke-federation-health.sh
- [ ] federation/drift-detection.sh
  - Merge: spoke/spoke-drift.sh

### Phase 5: Consolidate Deployment Pipelines
- [ ] deployment/hub.sh
  - Merge: hub.sh, hub/*.sh (except status)
- [ ] deployment/spoke.sh
  - Merge: spoke.sh, spoke/spoke-*.sh, spoke/pipeline/phase-*.sh
- [ ] deployment/verification.sh
  - Merge: hub/status.sh, spoke/status.sh, spoke/verification.sh

### Phase 6: Cleanup
- [ ] Remove deprecated files
- [ ] Update imports in dive CLI
- [ ] Test all pathways

## Breaking Changes

1. **File-based state removed**: `.dive-state/` directory no longer used
2. **File-based locks removed**: PostgreSQL advisory locks only
3. **Module paths changed**: Update all `source` statements
4. **Function signatures unchanged**: API compatibility maintained

## Backward Compatibility

For transition period, create compatibility shims:
```bash
# In old location: scripts/dive-modules/secrets.sh
# Redirect to new location
source "$(dirname "${BASH_SOURCE[0]}")/configuration/secrets.sh"
log_warn "DEPRECATED: Use configuration/secrets.sh directly"
```

## Testing Requirements

1. Hub deployment: `./dive hub deploy`
2. Spoke deployment: `./dive spoke deploy ALB`
3. Federation: `./dive federation link ALB`
4. All CLI commands: `./dive help`

## Timeline

- Phase 1: Foundation - COMPLETED
- Phase 2: Secret consolidation - 1 day
- Phase 3: Container consolidation - 1 day
- Phase 4: Federation consolidation - 2 days
- Phase 5: Deployment consolidation - 2 days
- Phase 6: Cleanup and testing - 1 day

Total: ~7 days

## Notes

- Keep function signatures identical during migration
- Add deprecation warnings, not hard breaks
- Test each phase before proceeding
- Document all changes in CHANGELOG
