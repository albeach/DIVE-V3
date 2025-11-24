# FRA Rollout Risk Register
**Version:** 1.0  
**Date:** November 24, 2025  
**Classification:** UNCLASSIFIED // FOR OFFICIAL USE ONLY

## Risk Assessment Matrix

| Likelihood → | Very Low (1) | Low (2) | Medium (3) | High (4) | Very High (5) |
|--------------|--------------|---------|------------|----------|---------------|
| **Impact ↓** |              |         |            |          |               |
| **Critical (5)** | Medium | High | Very High | Very High | Very High |
| **Major (4)** | Low | Medium | High | Very High | Very High |
| **Moderate (3)** | Low | Low | Medium | High | High |
| **Minor (2)** | Very Low | Low | Low | Medium | Medium |
| **Negligible (1)** | Very Low | Very Low | Low | Low | Medium |

## Identified Risks

### R001: Trust Anchor Lifecycle Management
**Category:** Security  
**Probability:** High (4)  
**Impact:** Critical (5)  
**Risk Score:** 20 (Very High)  
**Status:** Open

**Description:** No automated process for JWKS rotation, mTLS certificate renewal, or service token refresh between FRA and USA instances.

**Impact if Realized:**
- Authentication failures after certificate expiry
- Service outages during manual rotation
- Security vulnerability if compromised keys not rotated

**Mitigation Strategy:**
1. Implement automated certificate rotation using cert-manager
2. Create JWKS rotation schedule (quarterly)
3. Deploy monitoring for certificate expiry (30-day warning)
4. Document emergency rotation procedures

**Owner:** Security Team  
**Target Resolution:** Phase 2

---

### R002: Attribute Normalization Failures
**Category:** Interoperability  
**Probability:** High (4)  
**Impact:** Major (4)  
**Risk Score:** 16 (Very High)  
**Status:** Open

**Description:** French SAML attributes use different vocabulary (CONFIDENTIEL_DEFENSE vs CONFIDENTIAL) requiring complex mapping.

**Impact if Realized:**
- Authorization failures for French users
- Incorrect clearance level assignments
- Data spillage if mappings fail open

**Mitigation Strategy:**
1. Implement fail-secure attribute mapper in Keycloak
2. Add validation layer in backend PEP
3. Log all mapping transformations for audit
4. Create test suite for all clearance combinations

**Owner:** IdP Team  
**Target Resolution:** Phase 3

---

### R003: Resource Namespace Collisions
**Category:** Data Integrity  
**Probability:** Medium (3)  
**Impact:** Major (4)  
**Risk Score:** 12 (High)  
**Status:** Open

**Description:** Without proper namespacing, FRA and USA resources could have ID collisions causing data corruption.

**Impact if Realized:**
- Wrong resource served to users
- Data overwrite during sync
- Audit trail corruption

**Mitigation Strategy:**
1. Enforce "FRA-" prefix for all French resources
2. Add originRealm field to all resources
3. Implement version control with conflict detection
4. Create unique compound indexes in MongoDB

**Owner:** Backend Team  
**Target Resolution:** Phase 5

---

### R004: Cloudflare Tunnel Single Point of Failure
**Category:** Availability  
**Probability:** Medium (3)  
**Impact:** Critical (5)  
**Risk Score:** 15 (Very High)  
**Status:** Open

**Description:** Single Cloudflare tunnel for FRA instance creates availability risk.

**Impact if Realized:**
- Complete FRA instance outage
- No failover capability
- Loss of federation during outage

**Mitigation Strategy:**
1. Deploy secondary tunnel in standby mode
2. Implement health check monitoring
3. Create automated failover scripts
4. Document manual failover procedures
5. Consider multi-region deployment

**Owner:** Infrastructure Team  
**Target Resolution:** Phase 2

---

### R005: Multi-KAS Key Authority Divergence
**Category:** Security  
**Probability:** Medium (3)  
**Impact:** Critical (5)  
**Risk Score:** 15 (Very High)  
**Status:** Open

**Description:** FRA KAS and USA KAS could make different authorization decisions for same resource.

**Impact if Realized:**
- Unauthorized access to encrypted content
- Security policy bypass
- Compliance violations

**Mitigation Strategy:**
1. Origin realm KAS is authoritative
2. Log all cross-realm KAS requests
3. Alert on decision mismatches
4. Implement key revocation protocol

**Owner:** KAS Team  
**Target Resolution:** Phase 6

---

### R006: Cross-Realm Audit Correlation
**Category:** Compliance  
**Probability:** High (4)  
**Impact:** Moderate (3)  
**Risk Score:** 12 (High)  
**Status:** Open

**Description:** Different log formats and timestamps between realms prevent correlation during investigations.

**Impact if Realized:**
- Cannot trace cross-realm incidents
- Compliance audit failures
- Incomplete forensic analysis

**Mitigation Strategy:**
1. Standardize log format (JSON schema)
2. Use UTC timestamps everywhere
3. Include correlation IDs in all logs
4. Deploy centralized log aggregation
5. Create cross-realm trace tools

**Owner:** Monitoring Team  
**Target Resolution:** Phase 7

---

### R007: Network Latency Impact
**Category:** Performance  
**Probability:** Medium (3)  
**Impact:** Moderate (3)  
**Risk Score:** 9 (Medium)  
**Status:** Open

**Description:** Geographic distance between FRA and USA instances could cause unacceptable latency.

**Impact if Realized:**
- Slow federation sync
- Poor user experience
- Timeout failures

**Mitigation Strategy:**
1. Deploy edge caching (Cloudflare)
2. Implement async federation protocol
3. Use connection pooling
4. Monitor p95 latency metrics
5. Set appropriate timeout values

**Owner:** Performance Team  
**Target Resolution:** Phase 4

---

### R008: Data Residency Violations
**Category:** Compliance  
**Probability:** Low (2)  
**Impact:** Critical (5)  
**Risk Score:** 10 (High)  
**Status:** Open

**Description:** French data protection laws may prohibit certain data from leaving France.

**Impact if Realized:**
- Legal penalties
- Loss of authorization to operate
- Diplomatic incident

**Mitigation Strategy:**
1. Review GDPR and French data laws
2. Classify data by residency requirements
3. Implement data filtering in federation
4. Deploy FRA data only in EU regions
5. Legal review of all data flows

**Owner:** Legal/Compliance Team  
**Target Resolution:** Phase 1

---

### R009: Insufficient Incident Response Coordination
**Category:** Operations  
**Probability:** Medium (3)  
**Impact:** Major (4)  
**Risk Score:** 12 (High)  
**Status:** Open

**Description:** No established protocol for coordinating security incidents across FRA and USA teams.

**Impact if Realized:**
- Delayed incident response
- Incomplete remediation
- Cascading compromises

**Mitigation Strategy:**
1. Create joint incident response plan
2. Establish 24/7 contact protocols
3. Define escalation procedures
4. Conduct joint drills quarterly
5. Deploy shared incident tracking

**Owner:** Security Operations  
**Target Resolution:** Phase 7

---

### R010: Configuration Drift
**Category:** Operations  
**Probability:** High (4)  
**Impact:** Moderate (3)  
**Risk Score:** 12 (High)  
**Status:** Open

**Description:** Manual configuration changes could cause FRA and USA instances to drift from standard.

**Impact if Realized:**
- Inconsistent behavior
- Failed integrations
- Security gaps

**Mitigation Strategy:**
1. Use Infrastructure as Code (Terraform)
2. Implement configuration management (Ansible)
3. Deploy drift detection monitoring
4. Regular configuration audits
5. Automated compliance checks

**Owner:** DevOps Team  
**Target Resolution:** Phase 3

---

### R011: Keycloak Realm Isolation Breach
**Category:** Security  
**Probability:** Low (2)  
**Impact:** Critical (5)  
**Risk Score:** 10 (High)  
**Status:** Open

**Description:** Misconfiguration could allow cross-realm access between FRA and USA.

**Impact if Realized:**
- Unauthorized access to other realm's data
- Privilege escalation
- Compliance violations

**Mitigation Strategy:**
1. Regular security audits of realm configs
2. Implement realm isolation tests
3. Monitor for cross-realm access attempts
4. Use separate databases per realm
5. Deploy realm-specific admin roles

**Owner:** IdP Team  
**Target Resolution:** Phase 3

---

### R012: Service Token Compromise
**Category:** Security  
**Probability:** Low (2)  
**Impact:** Critical (5)  
**Risk Score:** 10 (High)  
**Status:** Open

**Description:** Cloudflare Access service tokens could be compromised allowing unauthorized access.

**Impact if Realized:**
- Full instance compromise
- Data exfiltration
- Service impersonation

**Mitigation Strategy:**
1. Rotate service tokens monthly
2. Use separate tokens per service
3. Implement token usage monitoring
4. Deploy anomaly detection
5. Store tokens in secure vault

**Owner:** Security Team  
**Target Resolution:** Phase 2

---

## Risk Mitigation Timeline

### Phase 1 (Planning)
- R008: Data Residency Violations - Legal review

### Phase 2 (Cloudflare)
- R001: Trust Anchor Lifecycle - Begin implementation
- R004: Cloudflare Tunnel SPOF - Deploy redundancy
- R012: Service Token Compromise - Security hardening

### Phase 3 (Keycloak)
- R002: Attribute Normalization - Implement mappers
- R010: Configuration Drift - Deploy IaC
- R011: Keycloak Realm Isolation - Security audit

### Phase 4 (Backend/OPA)
- R007: Network Latency - Performance optimization

### Phase 5 (Metadata)
- R003: Resource Namespace Collisions - Implement prefixing

### Phase 6 (KAS)
- R005: Multi-KAS Divergence - Authority protocol

### Phase 7 (Validation)
- R006: Audit Correlation - Log standardization
- R009: Incident Response - Joint procedures

## Risk Monitoring Dashboard

```yaml
Critical Risks (Score ≥ 15):
  - R001: Trust Anchor Lifecycle [20]
  - R002: Attribute Normalization [16]
  - R004: Cloudflare Tunnel SPOF [15]
  - R005: Multi-KAS Divergence [15]

High Risks (Score 10-14):
  - R003: Resource Collisions [12]
  - R006: Audit Correlation [12]
  - R009: Incident Response [12]
  - R010: Configuration Drift [12]
  - R008: Data Residency [10]
  - R011: Realm Isolation [10]
  - R012: Token Compromise [10]

Medium Risks (Score 5-9):
  - R007: Network Latency [9]
```

## Risk Acceptance Criteria

Risks can be accepted if:
1. Mitigation cost exceeds potential impact
2. Probability reduced below threshold after controls
3. Compensating controls provide adequate protection
4. Business decision with documented acceptance

## Review Schedule

- **Weekly:** During active rollout phases
- **Monthly:** Post-deployment operational phase
- **Quarterly:** Strategic risk review with stakeholders

## Escalation Path

1. **Level 1:** Technical Team Lead (Score < 10)
2. **Level 2:** Project Manager (Score 10-15)
3. **Level 3:** Security Officer (Score > 15)
4. **Level 4:** Executive Sponsor (Critical risks)

---
*End of Risk Register*
