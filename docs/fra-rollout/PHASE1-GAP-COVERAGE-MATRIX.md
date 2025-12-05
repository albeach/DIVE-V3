# FRA Rollout Gap Coverage Matrix
**Version:** 1.0  
**Date:** November 24, 2025  
**Classification:** UNCLASSIFIED // FOR OFFICIAL USE ONLY

## Executive Summary

This matrix maps previously identified gaps and newly discovered risks to specific remediation tasks across all implementation phases. Each gap is tracked with owner, status, and verification method.

## Gap Categories

- **🔒 Security**: Authentication, authorization, encryption
- **🔄 Interoperability**: Cross-realm compatibility, standards
- **📊 Data**: Consistency, integrity, residency
- **🚀 Performance**: Latency, availability, scalability
- **📝 Compliance**: Audit, regulations, standards
- **🛠️ Operations**: Monitoring, incident response, maintenance

## Gap Coverage Matrix

| Gap ID | Category | Description | Risk Impact | Remediation Task | Phase | Owner | Status | Verification |
|--------|----------|-------------|-------------|------------------|-------|-------|--------|--------------|
| **GAP-001** | 🔒 Security | **Trust Anchor Lifecycle** | Very High (20) | | | | | |
| | | No automated JWKS rotation | Token validation failures | Implement quarterly JWKS rotation schedule | 2 | Security | 🔴 Open | Rotation audit log |
| | | Manual mTLS cert renewal | Service outages | Deploy cert-manager with auto-renewal | 2 | DevOps | 🔴 Open | Certificate monitoring |
| | | Static service tokens | Compromise risk | Monthly token rotation via Vault | 2 | Security | 🔴 Open | Token age metrics |
| | | | | Create runbook for emergency rotation | 2 | Security | 🔴 Open | Drill completion |
| **GAP-002** | 🔄 Interoperability | **Attribute Normalization** | Very High (16) | | | | | |
| | | French clearance terms differ | Auth failures | Map CONFIDENTIEL_DEFENSE → CONFIDENTIAL | 3 | IdP Team | 🔴 Open | Mapping test suite |
| | | Missing attribute enrichment | Incomplete claims | Add fallback enrichment service | 3 | Backend | 🔴 Open | Claim validation |
| | | No fail-secure default | Security bypass | Implement default-deny on unmapped | 3 | Security | 🔴 Open | Negative test cases |
| **GAP-003** | 📊 Data | **Resource Consistency** | High (12) | | | | | |
| | | No origin realm tracking | Collision risk | Add originRealm field to all resources | 5 | Backend | 🔴 Open | Schema validation |
| | | Missing resource prefixes | ID conflicts | Enforce FRA- prefix for French resources | 5 | Backend | 🔴 Open | Regex validation |
| | | No version control | Sync conflicts | Implement optimistic locking with versions | 5 | Backend | 🔴 Open | Conflict tests |
| | | | | Add lastModified timestamp tracking | 5 | Backend | 🔴 Open | Timestamp audit |
| **GAP-004** | 📝 Compliance | **Decision/Audit Correlation** | High (12) | | | | | |
| | | Different log formats | Cannot correlate | Standardize JSON log schema | 7 | Monitoring | 🔴 Open | Schema validator |
| | | No correlation IDs | Broken trace | Add X-Request-ID to all operations | 4 | Backend | 🔴 Open | Trace testing |
| | | Timezone inconsistency | Time mismatch | Enforce UTC everywhere | 7 | All Teams | 🔴 Open | Timestamp audit |
| | | No log aggregation | Siloed data | Deploy ELK stack for central logging | 7 | DevOps | 🔴 Open | Query testing |
| **GAP-005** | 🔒 Security | **Multi-KAS Divergence** | Very High (15) | | | | | |
| | | Conflicting decisions | Policy bypass | Origin realm KAS is authoritative | 6 | KAS Team | 🔴 Open | Decision logs |
| | | No mismatch detection | Silent failures | Log and alert on divergent decisions | 6 | Monitoring | 🔴 Open | Alert testing |
| | | Missing revocation | Stale access | Implement cross-realm key revocation | 6 | Security | 🔴 Open | Revocation test |
| **GAP-006** | 🚀 Performance | **Availability/Latency** | High (15/9) | | | | | |
| | | Single tunnel SPOF | Total outage | Deploy secondary standby tunnel | 2 | Infrastructure | 🔴 Open | Failover test |
| | | No health monitoring | Silent failures | Cloudflare health checks every 30s | 2 | Monitoring | 🔴 Open | Uptime metrics |
| | | Missing timeout handling | Hung requests | Set 30s timeouts with retry logic | 4 | Backend | 🔴 Open | Timeout tests |
| | | No CDN caching | High latency | Enable Cloudflare edge caching | 2 | Infrastructure | 🔴 Open | Cache hit ratio |
| **GAP-007** | 📝 Compliance | **Data Residency** | High (10) | | | | | |
| | | Unclear French data laws | Legal risk | Legal review of GDPR/French requirements | 1 | Legal | 🔴 Open | Legal opinion |
| | | No data classification | Spillage risk | Tag data with residency requirements | 5 | Data Team | 🔴 Open | Classification audit |
| | | Missing geo-filtering | Violation risk | Filter federation by releasability | 5 | Backend | 🔴 Open | Filter tests |
| **GAP-008** | 🛠️ Operations | **Incident Response** | High (12) | | | | | |
| | | No joint procedures | Slow response | Create bi-national incident playbook | 7 | SecOps | 🔴 Open | Playbook review |
| | | Missing escalation path | Confusion | Define 24/7 contact matrix | 7 | Management | 🔴 Open | Contact test |
| | | No shared tracking | Lost context | Deploy shared incident dashboard | 7 | DevOps | 🔴 Open | Dashboard demo |
| | | | | Quarterly joint incident drills | 7 | All Teams | 🔴 Open | Drill report |

## New Gaps Discovered (Phase 1 Analysis)

| Gap ID | Category | Description | Risk Impact | Remediation Task | Phase | Owner | Status |
|--------|----------|-------------|-------------|------------------|-------|-------|--------|
| **GAP-009** | 🔒 Security | **WebAuthn Cross-Domain** | Medium (9) | | | | |
| | | RP ID mismatch fra.dive25.com | Auth failures | Configure subdomain-specific RP ID | 3 | IdP Team | 🔴 Open |
| **GAP-010** | 📊 Data | **MongoDB Isolation** | High (12) | | | | |
| | | Shared database risk | Data leakage | Separate MongoDB instances per realm | 4 | Data Team | 🔴 Open |
| **GAP-011** | 🔄 Interoperability | **SAML vs OIDC** | Medium (8) | | | | |
| | | France prefers SAML | Integration complexity | Support both protocols in broker | 3 | IdP Team | 🔴 Open |
| **GAP-012** | 🛠️ Operations | **Backup Strategy** | High (12) | | | | |
| | | No FRA backup plan | Data loss | Implement 3-2-1 backup strategy | 2 | DevOps | 🔴 Open |

## Implementation Priority Matrix

### Critical Priority (Must Fix Before Production)
1. **GAP-001**: Trust Anchor Lifecycle - Security foundation
2. **GAP-002**: Attribute Normalization - Core functionality
3. **GAP-005**: Multi-KAS Divergence - Security compliance
4. **GAP-006**: Availability/Latency - User experience

### High Priority (Fix During Rollout)
1. **GAP-003**: Resource Consistency - Data integrity
2. **GAP-004**: Decision/Audit Correlation - Compliance
3. **GAP-007**: Data Residency - Legal requirement
4. **GAP-010**: MongoDB Isolation - Security

### Medium Priority (Post-Deployment)
1. **GAP-008**: Incident Response - Operational maturity
2. **GAP-009**: WebAuthn Cross-Domain - Enhanced auth
3. **GAP-011**: SAML Support - Partner flexibility
4. **GAP-012**: Backup Strategy - Disaster recovery

## Phase-by-Phase Coverage

### Phase 1: Planning & Baseline ✅
- [x] Document all gaps in matrix
- [x] Assign owners and priorities
- [x] Create verification criteria
- [ ] Legal review for GAP-007

### Phase 2: Cloudflare Zero Trust
- [ ] GAP-001: Deploy cert-manager
- [ ] GAP-001: Setup Vault for tokens
- [ ] GAP-006: Create standby tunnel
- [ ] GAP-006: Enable CDN caching
- [ ] GAP-012: Implement backups

### Phase 3: Keycloak Realm
- [ ] GAP-002: Attribute mappers
- [ ] GAP-002: Fail-secure defaults
- [ ] GAP-009: WebAuthn RP config
- [ ] GAP-011: SAML support

### Phase 4: Backend & OPA
- [ ] GAP-004: Add correlation IDs
- [ ] GAP-006: Timeout handling
- [ ] GAP-010: MongoDB isolation

### Phase 5: Metadata Federation
- [ ] GAP-003: Origin realm tracking
- [ ] GAP-003: Resource prefixing
- [ ] GAP-003: Version control
- [ ] GAP-007: Data filtering

### Phase 6: KAS Deployment
- [ ] GAP-005: Authority protocol
- [ ] GAP-005: Mismatch detection
- [ ] GAP-005: Key revocation

### Phase 7: E2E Validation
- [ ] GAP-004: Log aggregation
- [ ] GAP-004: UTC enforcement
- [ ] GAP-008: Incident procedures
- [ ] GAP-008: Joint drills

## Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Critical Gaps Closed | 100% | 0% | 🔴 |
| High Priority Gaps | 75% | 0% | 🔴 |
| Automated Tests Coverage | 80% | 0% | 🔴 |
| Security Validations | 100% | 0% | 🔴 |
| Documentation Complete | 100% | 25% | 🟡 |

## Verification Methods

### Automated Testing
```bash
# Run gap verification suite
npm run test:gaps

# Security validation
npm run test:security

# Integration tests
npm run test:integration
```

### Manual Verification
1. **Security Audit**: Quarterly penetration testing
2. **Compliance Review**: Monthly log analysis
3. **Performance Testing**: Load tests before go-live
4. **Disaster Recovery**: Annual DR exercise

## Risk Acceptance

Gaps may be accepted as technical debt if:
1. Compensating controls are in place
2. Business accepts the risk
3. Fix scheduled within 90 days
4. Monitoring deployed for risk indicators

## Review Cadence

- **Daily**: During active phases (standup review)
- **Weekly**: Progress against gap closure
- **Phase Gate**: 100% verification before next phase
- **Monthly**: Executive dashboard update

---
*End of Gap Coverage Matrix*










