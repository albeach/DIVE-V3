# ADR: Hub-Spoke Command Asymmetry

## Status
**ACCEPTED** - December 27, 2025

## Context

The DIVE V3 CLI implements a hub-spoke federation model where the USA Hub acts as the central authority and NATO country spokes connect as distributed nodes. During development, questions arose about why hub and spoke commands are intentionally different rather than symmetric.

## Decision

We maintain **intentional asymmetry** between hub and spoke command sets based on their fundamentally different roles in the federation architecture.

## Rationale

### Hub: Permanent Central Authority

The hub is the **source of truth** for the entire federation and must be:
- ✅ Always available (no offline mode)
- ✅ Authoritative for policy distribution
- ✅ Centralized spoke management
- ✅ Permanent (no cleanup/teardown)

**Hub Commands Focus:**
```bash
./dive hub deploy       # Initial deployment only
./dive hub seed         # Populate test data
./dive hub spokes list  # Manage registered spokes
./dive hub spokes approve <id>
./dive hub push-policy  # Distribute updates
./dive hub verify       # 10-point health check
```

**Intentionally Missing from Hub:**
- ❌ `hub reset` - Hub is permanent, no reset needed
- ❌ `hub clean` - Hub volumes are persistent
- ❌ `hub teardown` - Hub cannot be torn down
- ❌ `hub failover` - Hub has no offline mode
- ❌ `hub maintenance` - Hub cannot enter maintenance mode

### Spoke: Ephemeral Distributed Node

Spokes are **ephemeral nodes** that may:
- 🔄 Connect and disconnect from hub
- 🔄 Enter maintenance mode for upgrades
- 🔄 Operate offline with cached policies
- 🔄 Be deployed and removed dynamically

**Spoke Commands Focus:**
```bash
./dive spoke deploy EST "Estonia"    # Dynamic deployment
./dive spoke clean                   # Remove volumes
./dive spoke reset                   # Clean slate
./dive spoke teardown                # Full removal
./dive spoke failover status         # Circuit breaker state
./dive spoke failover force-open     # Enter offline mode
./dive spoke maintenance enter       # Planned maintenance
./dive spoke policy sync             # Pull from hub
./dive spoke sync-secrets            # Fix mismatches
```

**Intentionally Missing from Spoke:**
- ❌ `spoke spokes list` - Spoke doesn't manage other spokes
- ❌ `spoke push-policy` - Spokes pull, not push
- ❌ `spoke approve` - Spoke can't approve itself

## Hub vs Spoke Feature Matrix

| Feature | Hub | Spoke | Rationale |
|---------|-----|-------|-----------|
| **Lifecycle Management** |
| Deploy | ✅ `hub deploy` | ✅ `spoke deploy` | Both need initial deployment |
| Up/Down | ✅ `hub up/down` | ✅ `spoke up/down` | Both control services |
| Reset | ❌ No reset | ✅ `spoke reset` | Only spoke can be reset |
| Clean | ❌ No cleanup | ✅ `spoke clean` | Only spoke has cleanup |
| Teardown | ❌ No teardown | ✅ `spoke teardown` | Only spoke can be removed |
| **Resilience** |
| Failover | ❌ No failover | ✅ `spoke failover` | Only spoke disconnects |
| Maintenance Mode | ❌ No maintenance | ✅ `spoke maintenance` | Only spoke goes offline |
| Offline Operation | ❌ Must be online | ✅ Cached policies | Spoke can work offline |
| **Policy Management** |
| Push Policy | ✅ `hub push-policy` | ❌ No push | Hub pushes to spokes |
| Sync Policy | ❌ No sync needed | ✅ `spoke policy sync` | Spoke pulls from hub |
| Policy Version | ✅ `policy version` | ✅ `spoke policy version` | Both can check version |
| **Spoke Management** |
| List Spokes | ✅ `hub spokes list` | ❌ No spoke mgmt | Only hub manages spokes |
| Approve Spoke | ✅ `hub spokes approve` | ❌ No approval | Only hub approves |
| Reject Spoke | ✅ `hub spokes reject` | ❌ No rejection | Only hub rejects |
| Rotate Token | ✅ `hub spokes rotate-token` | ❌ No rotation | Only hub rotates |
| **Secret Management** |
| Sync Secrets | 🔶 Auto-sync on deploy | ✅ `spoke sync-secrets` | Spoke may need manual sync |
| Sync All Secrets | ❌ Hub-only | ✅ `spoke sync-all-secrets` | Batch sync for all spokes |
| **Health & Status** |
| Health Check | ✅ `hub health` | ✅ `spoke health` | Both need health checks |
| Verify | ✅ `hub verify` (10 checks) | ✅ `spoke verify` (13 checks) | Both comprehensive |
| Status | ✅ `hub status` | ✅ `spoke status` | Both show status |
| **Audit & Compliance** |
| Audit Queue | ❌ No queue | ✅ `spoke audit-status` | Spoke queues offline |
| Audit Logs | ✅ Central aggregation | ✅ `spoke audit-status` | Hub aggregates, spoke queues |

## Consequences

### Positive

1. **Clear Separation of Concerns**
   - Hub = source of truth
   - Spoke = distributed node with resilience

2. **Prevents Dangerous Operations**
   - Can't accidentally reset the hub
   - Can't tear down the central authority
   - Can't push policy from spoke (security)

3. **Enables Resilience**
   - Spokes can fail independently
   - Hub remains stable and available
   - Offline operation for spokes

4. **Intuitive Command Structure**
   - Hub commands reflect central authority
   - Spoke commands reflect distributed nature
   - No confusing symmetric commands that don't make sense

### Negative

1. **Learning Curve**
   - Users must learn two different command sets
   - Documentation must clearly explain asymmetry
   - May confuse users expecting symmetry

2. **Code Duplication**
   - Some commands have similar names but different implementations
   - Example: `hub verify` vs `spoke verify` (different checks)

### Mitigation

1. **Documentation**
   - Clear explanation in user guide (Section: Architecture Reference)
   - This ADR documents the rationale
   - Examples show appropriate command usage

2. **Helpful Error Messages**
   ```bash
   $ ./dive hub reset
   ERROR: 'hub reset' does not exist.

   Reason: Hub is permanent and cannot be reset.

   Did you mean:
     ./dive hub deploy    # Redeploy hub
     ./dive spoke reset   # Reset a spoke
   ```

3. **Feature Matrix**
   - Maintain hub vs spoke feature matrix (shown above)
   - Update with each new command
   - Reference in user guide

## Related Decisions

- **Port Calculation SSOT** (Dec 2025) - Centralized in common.sh
- **Admin Token Centralization** (Dec 2025) - 15-retry logic
- **Deprecation Timeline** (Dec 2025) - docs/DEPRECATION-TIMELINE.md

## References

- User Guide: `DIVE-V3-CLI-USER-GUIDE.md` (Architecture Reference section)
- Implementation Plan: `dive-v3-implementation-plan.md`
- Requirements: `dive-v3-requirements.md`
- SSOT Documentation: `scripts/dive-modules/common.sh` (header)

## Review History

| Date | Reviewer | Decision |
|------|----------|----------|
| 2025-12-27 | CLI Audit Team | Accepted |

---

**Author**: DIVE V3 CLI Audit Team
**Date**: December 27, 2025
**Version**: 1.0
**Status**: ACCEPTED
