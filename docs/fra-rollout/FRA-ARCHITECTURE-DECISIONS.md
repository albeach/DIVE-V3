# FRA Instance - Architecture Decision Records

## Overview
This document captures key architectural decisions made during the FRA instance implementation, providing rationale and trade-offs for future reference and replication (DEU instance).

## Decision Records

### ADR-001: Multi-Realm Keycloak vs Separate Instances
**Date**: 2025-11-24  
**Status**: Accepted

#### Context
Need to support multiple coalition partners (USA, FRA, DEU, etc.) with identity federation.

#### Decision
Use **separate Keycloak realms** within shared infrastructure rather than completely separate Keycloak instances.

#### Rationale
- Simplified realm-to-realm trust configuration
- Shared JWKS endpoints for validation
- Reduced infrastructure overhead
- Easier attribute mapping management

#### Trade-offs
- (+) Centralized management
- (+) Resource efficiency
- (-) Single point of failure risk
- (-) Potential realm isolation concerns

#### Mitigation
- Implement realm-level access controls
- Regular security audits
- Backup realm configurations independently

---

### ADR-002: Attribute Normalization Location
**Date**: 2025-11-24  
**Status**: Accepted

#### Context
French clearance terms (SECRET_DEFENSE) need mapping to NATO standard (SECRET).

#### Decision
Implement normalization at **two layers**:
1. Keycloak protocol mappers (primary)
2. OPA policy fallback (secondary)

#### Rationale
- Keycloak normalization ensures consistent tokens
- OPA fallback handles edge cases and legacy tokens
- Double validation improves security

#### Implementation
```javascript
// Keycloak mapper
if (clearance === "SECRET_DEFENSE") {
  return "SECRET";
}

// OPA policy
clearance_map := {
  "SECRET_DEFENSE": "SECRET"
}
```

---

### ADR-003: KAS Divergence Detection Strategy
**Date**: 2025-11-24  
**Status**: Accepted

#### Context
Need to detect when KAS and OPA make different authorization decisions.

#### Decision
Implement **independent re-evaluation** with comparison logging.

#### Approach
1. KAS fetches resource metadata
2. KAS calls OPA for decision
3. KAS applies additional rules
4. Compare and log any divergence
5. Alert on divergence threshold

#### Benefits
- Catches policy inconsistencies
- Identifies KAS-specific issues
- Provides security audit trail
- Enables root cause analysis

---

### ADR-004: Resource Namespace Strategy
**Date**: 2025-11-24  
**Status**: Accepted

#### Context
Prevent resource ID collisions between FRA and USA instances.

#### Decision
Enforce **realm prefixes** on all resource IDs (e.g., FRA-001, USA-001).

#### Implementation
- Database constraint on resourceId format
- Validation in backend API
- Federation filters by prefix
- Origin realm tracking

#### Benefits
- Zero collision possibility
- Clear resource ownership
- Simplified federation logic
- Audit trail clarity

---

### ADR-005: Cloudflare Tunnel Architecture
**Date**: 2025-11-24  
**Status**: Accepted

#### Context
Need secure, resilient external access without exposing servers directly.

#### Decision
Use **dual Cloudflare tunnels** (primary + standby) with health checks.

#### Architecture
```
Internet → Cloudflare → Primary Tunnel → Services
                    ↘ Standby Tunnel ↗
```

#### Configuration
- Automatic failover on primary failure
- Health checks every 30s
- DNS managed by Cloudflare
- Zero-downtime updates possible

---

### ADR-006: Federation Sync Strategy
**Date**: 2025-11-24  
**Status**: Accepted

#### Context
Need to synchronize resources between FRA and USA while handling conflicts.

#### Decision
Implement **bidirectional periodic sync** with version-based conflict resolution.

#### Rules
1. Origin realm always wins for its resources
2. Higher version number wins for foreign resources
3. Timestamp comparison as tiebreaker
4. Manual intervention for critical conflicts

#### Frequency
- Automated: Every 5 minutes
- Manual: On-demand via API
- Real-time: Future enhancement (WebSocket)

---

### ADR-007: Correlation ID Strategy
**Date**: 2025-11-24  
**Status**: Accepted

#### Context
Need to trace requests across distributed services and realms.

#### Decision
Use **UUID-based correlation IDs** propagated via headers.

#### Implementation
```javascript
// Middleware
if (!req.headers['x-correlation-id']) {
  req.headers['x-correlation-id'] = `corr-${uuidv4()}`;
}
```

#### Propagation
- Frontend → Backend: HTTP header
- Backend → OPA: In request context
- Backend → KAS: HTTP header
- FRA → USA: In federation calls
- All services → Logs: Structured field

---

### ADR-008: Secret Management
**Date**: 2025-11-24  
**Status**: Accepted

#### Context
Need secure management of JWT secrets, API keys, and certificates.

#### Decision
Use **environment variables** for development, **Docker secrets** for production.

#### Development
```bash
# .env.fra (git-ignored)
JWT_SECRET=dev-secret-change-in-prod
FEDERATION_TOKEN=dev-token
```

#### Production
```bash
docker secret create fra_jwt_secret
docker secret create fra_federation_token
```

---

### ADR-009: MongoDB Isolation Strategy
**Date**: 2025-11-24  
**Status**: Accepted

#### Context
Need data isolation between FRA and USA instances.

#### Decision
Use **separate MongoDB instances** with different ports.

#### Configuration
- FRA: Port 27018, Database: dive-v3-fra
- USA: Port 27017, Database: dive-v3-usa
- No cross-instance queries
- Independent backup schedules

#### Benefits
- Complete data isolation
- Independent scaling
- Separate compliance boundaries
- Simplified security audit

---

### ADR-010: OPA Policy Organization
**Date**: 2025-11-24  
**Status**: Accepted

#### Context
Need maintainable, testable authorization policies.

#### Decision
Use **modular Rego policies** with comprehensive test coverage.

#### Structure
```
policies/
├── fra-authorization-policy.rego     # Main policy
├── lib/
│   ├── clearance.rego               # Clearance helpers
│   ├── releasability.rego           # Release checks
│   └── coi.rego                     # COI logic
└── tests/
    └── fra-authorization-test.rego   # Test cases
```

#### Testing
- Minimum 80% coverage
- Positive and negative cases
- Edge case validation
- Performance benchmarks

---

### ADR-011: Performance Optimization Strategy
**Date**: 2025-11-24  
**Status**: Accepted

#### Context
Need to meet <200ms p95 latency target under load.

#### Decision
Implement **multi-layer caching and optimization**.

#### Layers
1. **CDN**: Cloudflare cache for static assets
2. **Application**: Redis for session/decision cache
3. **Database**: MongoDB indexes on common queries
4. **Policy**: OPA decision cache (60s TTL)

#### Monitoring
- Application metrics (Prometheus)
- Distributed tracing (future)
- Performance alerts
- Capacity planning

---

### ADR-012: Audit Log Retention
**Date**: 2025-11-24  
**Status**: Accepted

#### Context
Compliance requires 90-day minimum audit retention.

#### Decision
Implement **tiered retention strategy**.

#### Tiers
1. **Hot** (0-30 days): MongoDB, instant query
2. **Warm** (31-90 days): Compressed, indexed
3. **Cold** (90+ days): S3/Archive, compliance only

#### Implementation
- Daily rotation job
- Automated compression
- Indexed by correlation ID
- Encrypted at rest

---

### ADR-013: WebAuthn Implementation
**Date**: 2025-11-24  
**Status**: Accepted

#### Context
Need strong authentication for sensitive resources.

#### Decision
Support **WebAuthn as optional 2FA** with realm-specific RP IDs.

#### Configuration
- FRA: RP ID = `fra.dive25.com`
- USA: RP ID = `usa.dive25.com`
- Graceful fallback to TOTP
- User choice of authenticator

---

### ADR-014: CI/CD Strategy
**Date**: 2025-11-24  
**Status**: Proposed

#### Context
Need automated testing and deployment pipeline.

#### Decision
Use **GitHub Actions** with environment-specific workflows.

#### Workflows
1. **PR Validation**: Lint, unit tests, security scan
2. **Integration**: Deploy to staging, run E2E tests
3. **Production**: Blue-green deployment with rollback

#### Environments
- Development: Auto-deploy on main
- Staging: Deploy on tag
- Production: Manual approval required

---

### ADR-015: Monitoring and Observability
**Date**: 2025-11-24  
**Status**: Proposed

#### Context
Need visibility into system health and performance.

#### Decision
Implement **comprehensive observability stack**.

#### Components
- **Metrics**: Prometheus + Grafana
- **Logs**: ELK Stack or Loki
- **Traces**: Jaeger (future)
- **Alerts**: PagerDuty/Slack integration

#### Key Metrics
- API latency (p50, p95, p99)
- Error rates by endpoint
- OPA decision time
- KAS divergence rate
- Federation sync duration

---

## Decision Log

| ADR | Title | Status | Impact |
|-----|-------|--------|--------|
| 001 | Multi-Realm Keycloak | Accepted | High |
| 002 | Attribute Normalization | Accepted | High |
| 003 | KAS Divergence Detection | Accepted | High |
| 004 | Resource Namespacing | Accepted | Medium |
| 005 | Cloudflare Tunnels | Accepted | High |
| 006 | Federation Sync | Accepted | High |
| 007 | Correlation IDs | Accepted | Medium |
| 008 | Secret Management | Accepted | High |
| 009 | MongoDB Isolation | Accepted | High |
| 010 | OPA Organization | Accepted | Medium |
| 011 | Performance Strategy | Accepted | High |
| 012 | Audit Retention | Accepted | Medium |
| 013 | WebAuthn | Accepted | Medium |
| 014 | CI/CD | Proposed | High |
| 015 | Monitoring | Proposed | High |

## Lessons for DEU Instance

### Do Repeat
1. Start with infrastructure automation
2. Implement correlation IDs early
3. Test federation from day one
4. Use Docker Compose for local dev
5. Document decisions as you go

### Do Differently
1. Set up monitoring before deployment
2. Implement CI/CD pipeline earlier
3. Use IaC for all infrastructure
4. Create integration tests first
5. Automate security scanning

### Templates Available
- Cloudflare tunnel configuration
- Docker Compose structure
- OPA policy framework
- Federation service
- Test suites

---

*Last Updated: 2025-11-24*
*Version: 1.0*




