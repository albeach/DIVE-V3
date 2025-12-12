# DIVE V3 Federation Documentation

## 🚀 START HERE (Pilot Mode)

| Document | Description |
|----------|-------------|
| **[⚡ Pilot Onboarding Guide](./PILOT-ONBOARDING-GUIDE.md)** | **Add a new partner in 3 steps, demo scenarios, test users** |

## 📚 Future Vision (Post-Pilot)

| Document | Description |
|----------|-------------|
| [Federation Admin Architecture](./FEDERATION-ADMIN-ARCHITECTURE.md) | Delegated administration & self-service onboarding design |
| [Trust Framework](./FEDERATION-TRUST-FRAMEWORK.md) | Governance, vetting criteria, compliance requirements |

---

## Executive Summary

### The Problem

Currently, DIVE V3 federation management is:
- **Centralized**: All IdP management requires Super Admin intervention
- **Manual**: 2-4 weeks to onboard a new partner
- **Inflexible**: No partner-specific customization
- **Opaque**: Partners have no visibility into their configuration

### The Solution

A **delegated federation administration** model that enables:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   SELF-SERVICE          DELEGATED             MAINTAINED         │
│   ONBOARDING     +      ADMIN          +      ISOLATION          │
│                                                                  │
│   3-5 days              Partner-specific      OPA policy         │
│   vs 2-4 weeks          customization         guardrails         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Capabilities

### A. Federation Administrator Role

New role enabling partner administrators to:

| Capability | Example |
|------------|---------|
| 🎨 **UI Theming** | France instance uses blue/white/red palette |
| 🤝 **Trust Toggles** | Germany disables Spain IdP for their users |
| 🔄 **Attribute Mapping** | Map `habilitation` → `clearance` |
| 👥 **User Management** | Manage users in their realm |
| 📊 **Audit Access** | View authentication logs for their users |

### B. Self-Service IdP Onboarding

Streamlined workflow:

```
Request → Auto-Validate → Review → Map Attributes → Test → Go Live
   │           │            │           │            │        │
   └───────────┴────────────┴───────────┴────────────┴────────┘
                        3-5 DAYS (vs 2-4 weeks)
```

### C. Interactive Attribute Mapping

Visual tool for claim normalization:

```
YOUR CLAIMS                    DIVE ATTRIBUTES
───────────                    ───────────────
sub: "12345"          →        uniqueID: "12345"
habilitation: "SECRET" →       clearance: "SECRET"  
pays: "FR"            →        countryOfAffiliation: "FRA"
```

---

## Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **1. Foundation** | Weeks 1-4 | Role definitions, schemas, trust framework |
| **2. Admin Portal** | Weeks 5-8 | Theme editor, trust toggles, config API |
| **3. Onboarding** | Weeks 9-12 | Request wizard, workflow engine, attr mapper |
| **4. Sandbox** | Weeks 13-16 | Test environment, automated validation |
| **5. Production** | Weeks 17-20 | Security review, pilot, rollout |

---

## Architecture Decisions

### Why Delegated Administration?

| Alternative | Rejected Because |
|-------------|------------------|
| Fully centralized | Doesn't scale, bottleneck on Super Admin |
| Fully decentralized | Security risk, no governance |
| **Delegated with guardrails** ✅ | Balances autonomy with control |

### Why OPA for Policy Enforcement?

| Alternative | Rejected Because |
|-------------|------------------|
| Keycloak RBAC only | Can't express complex attribute constraints |
| Custom middleware | Reinventing the wheel, harder to audit |
| **OPA policies** ✅ | Declarative, auditable, industry standard |

### Why Interactive Attribute Mapping?

| Alternative | Rejected Because |
|-------------|------------------|
| Manual mapping by Super Admin | Slow, error-prone, doesn't scale |
| Fixed schema (no mapping) | Different IdPs use different claim names |
| **Self-service with validation** ✅ | Fast, validated, partner-controlled |

---

## Industry Standards Alignment

| Standard | How DIVE Aligns |
|----------|-----------------|
| **NIST 800-63** | Assurance levels for IdP vetting |
| **FICAM** | Trust framework governance model |
| **InCommon** | Metadata aggregation patterns |
| **eIDAS** | Level of Assurance mapping |
| **ISO 27001** | Security review criteria |

---

## Next Steps

1. **Review** this documentation with stakeholders
2. **Prioritize** Phase 1 tasks
3. **Assign** owners for each workstream
4. **Schedule** kickoff meeting
5. **Begin** implementation

---

## Hub-Spoke Federation CLI (Phase 3)

### Quick Reference

#### Spoke Commands

```bash
# Deploy a new spoke (Phase 2)
./dive spoke deploy NZL "New Zealand"

# Register spoke with hub (Phase 3 - includes CSR submission)
./dive --instance nzl spoke register

# Register and poll for approval (auto-configures token when approved)
./dive --instance nzl spoke register --poll

# Refresh token before expiry
./dive --instance nzl spoke token-refresh

# Check spoke status (includes token and cert info)
./dive --instance nzl spoke status

# Verify connectivity after approval
./dive --instance nzl spoke verify
```

#### Hub Commands

```bash
# View pending spoke registrations (rich display)
./dive hub spokes pending

# Approve a spoke (interactive with scope selection)
./dive hub spokes approve spoke-nzl-abc123

# Approve with specific options (non-interactive)
./dive hub spokes approve spoke-nzl-abc123 \
  --scopes "policy:base,data:federation_matrix" \
  --trust-level partner \
  --max-classification CONFIDENTIAL

# Reject a spoke with reason
./dive hub spokes reject spoke-xyz-123 --reason "Failed security review"

# Rotate spoke token (revoke old + issue new)
./dive hub spokes rotate-token spoke-fra-456
```

### Registration Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      SPOKE REGISTRATION FLOW                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. SPOKE ADMIN                       2. HUB ADMIN                       │
│  ────────────                         ──────────                         │
│                                                                          │
│  ./dive spoke deploy NZL              (waits for registrations)          │
│       │                                                                  │
│       ▼                                                                  │
│  ./dive spoke register ──────────────► ./dive hub spokes pending        │
│  (generates CSR, submits)                    │                          │
│       │                                      ▼                          │
│       │                              ./dive hub spokes approve <id>      │
│       │                              (selects scopes, trust level)       │
│       │                                      │                          │
│       ▼                                      │                          │
│  ./dive spoke register --poll ◄──────────────┘                          │
│  (receives token, auto-configures)           (generates token)          │
│       │                                                                  │
│       ▼                                                                  │
│  ./dive spoke up                                                         │
│  ./dive spoke verify ──────────────► OPAL sync established              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Token Management

| Command | Description |
|---------|-------------|
| `spoke register --poll` | Auto-configure token when approved |
| `spoke token-refresh` | Refresh token before expiry |
| `hub spokes token <id>` | Generate new token for spoke |
| `hub spokes rotate-token <id>` | Revoke old + issue new token |

### Scope Reference

| Scope | Description |
|-------|-------------|
| `policy:base` | Base policy rules |
| `policy:coalition` | Coalition-wide policies |
| `policy:<instance>` | Instance-specific policies |
| `data:federation_matrix` | Federation trust matrix |
| `data:trusted_issuers` | Trusted IdP issuers list |
| `heartbeat:write` | Send heartbeats to hub |

### Trust Levels

| Level | Description | Typical Use |
|-------|-------------|-------------|
| `development` | Limited access, for testing | Test instances |
| `partner` | Standard partner access | NATO partners |
| `bilateral` | Elevated trust | Bilateral agreements |
| `national` | Full access | Core national instances |

---

## Policy Distribution (Phase 4)

### Overview

Phase 4 implements hub-controlled policy bundle distribution with:
- **Scoped bundles**: Spokes receive only policies they're authorized for
- **Bundle signing**: X.509 signature verification for integrity
- **Version tracking**: Sync status monitoring across all spokes
- **Delta updates**: Efficient incremental sync for policy changes

### Policy CLI Commands (Hub)

```bash
# Build policy bundle with specific scopes
./dive policy build --scopes "policy:base,policy:nzl" --sign
# Output:
#   ✓ Collected 12 policy files
#   ✓ OPA check passed
#   ✓ Bundle created: bundle-abc123
#   ✓ Bundle signed with hub key
#   Version: 2025.12.11-001
#   Hash: sha256:abc123...

# Push policy to OPAL Server
./dive policy push
# Output:
#   ✓ Bundle uploaded to OPAL Server
#   ✓ Refresh triggered for 3 spokes

# Check policy distribution status
./dive policy status
```

### Policy CLI Commands (Spoke)

```bash
# Check policy status on spoke
./dive --instance nzl spoke policy status
# Output:
#   Hub Policy Version:     2025.12.11-001
#   Hub Hash:               sha256:abc123...
#   Local OPA Status:       ✓ Running
#   OPAL Client Status:     ✓ Connected
#   Scopes:                 ["policy:base", "policy:nzl"]

# Force sync from hub
./dive --instance nzl spoke policy sync
# Output:
#   ✓ Fetched latest bundle from hub
#   ✓ Verified signature
#   ✓ Applied 12 policies
#   Version: 2025.12.11-001

# Verify bundle signature
./dive --instance nzl spoke policy verify
# Output:
#   Bundle Hash:     sha256:abc123...
#   Signature:       ✓ Valid
#   Signed By:       dive-v3-bundle-signer
#   Signed At:       2025-12-11T10:25:00Z
```

### Policy Distribution Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      POLICY DISTRIBUTION FLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. HUB ADMIN                           2. SPOKE                         │
│  ──────────                             ─────────                        │
│                                                                          │
│  ./dive policy build --sign ────────────► (Bundle signed & stored)      │
│       │                                                                  │
│       ▼                                                                  │
│  ./dive policy push ────────────────────► OPAL Server notified          │
│       │                                         │                        │
│       │                                         ▼                        │
│       │                                  OPAL Clients pull update        │
│       │                                         │                        │
│       │                                         ▼                        │
│       │                                  ./dive spoke policy status      │
│       │                                  (shows new version synced)      │
│       │                                                                  │
│       ▼                                                                  │
│  ./dive policy status ◄─────────────────── Sync confirmed               │
│  (shows all spokes current)                                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### API Endpoints (Phase 4)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/opal/version` | Get current policy version | None |
| GET | `/api/opal/bundle/:scope` | Download scoped bundle | Spoke Token |
| GET | `/api/opal/bundle/verify/:hash` | Verify bundle signature | None |
| POST | `/api/opal/bundle/build` | Build policy bundle | Admin Key |
| POST | `/api/opal/bundle/publish` | Publish to OPAL Server | Admin Key |
| POST | `/api/opal/force-sync` | Force sync for spokes | Admin Key |
| GET | `/api/opal/sync-status` | Get sync status all spokes | Admin Key |

### Bundle Manifest Format

```json
{
  "revision": "2025.12.11-001",
  "roots": ["dive.base", "dive.tenant.nzl"],
  "files": [
    {
      "path": "base/guardrails/guardrails.rego",
      "hash": "sha256:...",
      "size": 4096
    }
  ],
  "signatures": [
    {
      "keyid": "dive-v3-bundle-signer",
      "algorithm": "RS256",
      "signatures": ["base64-signature..."]
    }
  ]
}
```

### Scope Mapping

| Scope | Directory | Description |
|-------|-----------|-------------|
| `policy:base` | `policies/base/` | Core guardrail policies |
| `policy:fvey` | `policies/org/fvey/` | Five Eyes policies |
| `policy:nato` | `policies/org/nato/` | NATO policies |
| `policy:<tenant>` | `policies/tenant/<tenant>/` | Tenant-specific policies |

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Spoke shows "behind" status | Run `./dive spoke policy sync` |
| Bundle signature invalid | Check signing key configuration |
| Scope access denied | Verify spoke's allowed scopes in hub |
| OPAL client not connected | Check `SPOKE_OPAL_TOKEN` in `.env` |
| Version mismatch after sync | Force full sync: `./dive spoke policy sync --force` |

---

## Resilience & Failover (Phase 5)

### Overview

Phase 5 implements resilience and failover capabilities that allow spokes to continue operating during hub disconnection:

- **Circuit Breaker**: Automatic detection and recovery from hub failures
- **Maintenance Mode**: Controlled degradation for planned outages
- **Audit Queue**: Disk-backed queue ensuring no audit data is lost during offline operation

### Circuit Breaker States

```
         ┌───────────────────────────────────────────────────────────┐
         │                                                            │
         │   CLOSED ──────(5 failures)──────► OPEN                   │
         │      ▲                                │                    │
         │      │                                │                    │
         │  (3 successes)                  (30s timeout)              │
         │      │                                │                    │
         │      └──────── HALF_OPEN ◄────────────┘                    │
         │                    │                                       │
         │               (any failure)                                │
         │                    │                                       │
         │                    └──────────────────► OPEN               │
         │                                                            │
         └────────────────────────────────────────────────────────────┘
```

- **CLOSED**: Normal operation, all requests pass through to hub
- **OPEN**: Hub failure detected, using cached policies, blocking hub requests
- **HALF_OPEN**: Testing recovery, allowing limited probe requests

### Failover CLI Commands

```bash
# Check circuit breaker status
./dive --instance nzl spoke failover status
# Output:
#   Circuit State:    CLOSED
#   Hub Healthy:      ✓ Yes
#   OPAL Healthy:     ✓ Yes
#   Total Failures:   0
#   Total Successes:  142
#   Uptime:           99.98%

# Force circuit to open (simulate hub outage for testing)
./dive --instance nzl spoke failover force-open

# Force circuit to closed (manual recovery)
./dive --instance nzl spoke failover force-closed

# Reset circuit breaker metrics
./dive --instance nzl spoke failover reset
```

### Maintenance Mode CLI Commands

```bash
# Check maintenance status
./dive --instance nzl spoke maintenance status
# Output:
#   Maintenance Mode: Inactive
#   Circuit State:    CLOSED

# Enter maintenance mode (blocks all hub requests)
./dive --instance nzl spoke maintenance enter "Scheduled patching"
# Output:
#   ✓ Entered maintenance mode
#   Reason: Scheduled patching
#   Time: 2025-12-11T14:30:00Z

# Exit maintenance mode
./dive --instance nzl spoke maintenance exit
# Output:
#   ✓ Exited maintenance mode
#   Duration: 45 minutes
```

### Audit Queue CLI Commands

```bash
# Check audit queue status
./dive --instance nzl spoke audit-status
# Output:
#   Queue Size:       0
#   Pending Sync:     0
#   Failed Entries:   0
#   Total Enqueued:   1,234
#   Total Synced:     1,234
#   Last Sync:        2025-12-11T14:00:00Z
```

### API Endpoints (Phase 5)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/spoke/failover/status` | Get circuit breaker state and metrics | Internal |
| POST | `/api/spoke/failover/force` | Force circuit state (OPEN/CLOSED/HALF_OPEN) | Internal |
| POST | `/api/spoke/failover/reset` | Reset circuit and metrics to CLOSED | Internal |
| POST | `/api/spoke/maintenance/enter` | Enter maintenance mode | Internal |
| POST | `/api/spoke/maintenance/exit` | Exit maintenance mode | Internal |
| GET | `/api/spoke/audit/status` | Get queue size and metrics | Internal |
| POST | `/api/spoke/audit/sync` | Force flush queue to hub | Internal |
| POST | `/api/spoke/audit/clear` | Clear queue (destructive, requires confirm) | Internal |
| GET | `/api/spoke/metrics` | Prometheus metrics | Internal |
| GET | `/api/spoke/health-score` | Calculated health score | Internal |
| GET | `/api/spoke/status` | Comprehensive spoke status | Internal |

### Configuration Defaults

```typescript
// Circuit Breaker Configuration
{
    failureThreshold: 5,        // Consecutive failures to open circuit
    recoveryTimeoutMs: 30000,   // Time before half-open (30s)
    successThreshold: 3,        // Successes to close circuit
    halfOpenTimeoutMs: 60000,   // Max time in half-open (60s)
    failureWindowMs: 60000,     // Sliding window for failures (60s)
    halfOpenRequestPercentage: 20  // % of requests in half-open
}

// Audit Queue Configuration
{
    queuePath: './data/audit-queue',
    maxQueueSize: 10000,
    maxQueueFileSize: 50 * 1024 * 1024,  // 50MB
    batchSize: 100,
    maxRetries: 5,
    initialRetryDelayMs: 1000,
    maxRetryDelayMs: 60000,
    flushIntervalMs: 30000
}
```

### Offline Operation Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      OFFLINE OPERATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. NORMAL OPERATION                 2. HUB FAILURE DETECTED            │
│  ──────────────────                  ───────────────────────            │
│                                                                          │
│  Circuit: CLOSED                     Circuit: OPEN                       │
│  Hub: ✓ Connected                    Hub: ✗ Disconnected                │
│  Policy: Live                        Policy: Cached                      │
│  Audit: Direct to hub                Audit: Queued to disk              │
│       │                                      │                          │
│       │     (5 consecutive failures)         │                          │
│       └──────────────────────────────────────┘                          │
│                                              │                          │
│  3. RECOVERY TESTING                         │ (30s timeout)            │
│  ───────────────────                         ▼                          │
│                                                                          │
│  Circuit: HALF_OPEN                 4. RECOVERY COMPLETE                │
│  Hub: Testing...                    ────────────────────                │
│  Policy: Cached                                                          │
│  Audit: Still queued                Circuit: CLOSED                     │
│       │                             Hub: ✓ Connected                    │
│       │  (3 successes)              Policy: Synced                      │
│       └─────────────────────────►   Audit: Queue flushed                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Circuit stuck in OPEN | Hub not reachable | Check hub connectivity, `./dive hub status` |
| Circuit repeatedly opens | Intermittent hub issues | Check network, increase `failureThreshold` |
| Audit queue growing | Hub unreachable for sync | Check hub, force sync when available |
| Maintenance mode stuck | Exit failed | `POST /api/spoke/maintenance/exit` |
| Policy cache expired | Offline too long | Reconnect to hub, trigger sync |
| High failure count | Network issues | Review `failover status`, check logs |

### Testing Failover

```bash
# Run E2E failover tests
./tests/e2e/federation/failover.test.sh

# Manual testing
# 1. Simulate hub outage
docker stop dive-v3-hub-opal-server-1

# 2. Verify circuit opens
./dive --instance nzl spoke failover status
# Expected: State: OPEN

# 3. Verify spoke continues operating
./dive --instance nzl spoke health
# Expected: All local services healthy

# 4. Restore hub
docker start dive-v3-hub-opal-server-1

# 5. Verify recovery
./dive --instance nzl spoke failover status
# Expected: State: CLOSED (after recovery)
```

---

## Questions?

Contact the DIVE Platform Team:
- Technical: `techops@dive.example`
- Policy: `federation@dive.example`

