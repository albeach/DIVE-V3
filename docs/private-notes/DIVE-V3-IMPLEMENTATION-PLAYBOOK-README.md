# DIVE-V3 Phased Implementation Playbook — Master Index

**Document Suite**: Keycloak, Terraform, ABAC & ZTDF/OpenTDF  
**Version**: 1.0  
**Generated**: October 29, 2025  
**Status**: ✅ READY FOR EXECUTION

---

## 📚 Document Structure

This implementation plan is divided into **three comprehensive parts**:

### **Part 1**: Executive Overview & Phases 0-3
- **File**: `DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-1.md`
- **Contents**:
  - Executive Overview (goals, scope, risks, metrics)
  - Readiness Checklist (Phase 0)
  - Phase 1: Federation & MFA Hardening (5-7 days)
  - Phase 2: Attribute Normalization & Mapper Consolidation (4-6 days)
  - Phase 3: ABAC Policy Tightening (5-7 days)

### **Part 2**: Phases 4-7
- **File**: `DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-2.md`
- **Contents**:
  - Phase 4: Data-Centric Security (ZTDF → OpenTDF) (7-10 days)
  - Phase 5: Terraform Refactors & Provider Hygiene (4-6 days)
  - Phase 6: Audit, Telemetry, & SIEM (3-5 days)
  - Phase 7: CI/CD Guardrails & Documentation (3-4 days)

### **Part 3**: Governance & Acceptance
- **File**: `DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-3.md`
- **Contents**:
  - RACI Matrix & Timeline (7-10 weeks)
  - Risk Register & Mitigations (15 risks tracked)
  - Acceptance Criteria (80 criteria across 8 phases)
  - Exit Report Template
  - Executive Brief (2 pages)
  - Risk Heatmap (1 page)

---

## 🎯 Quick Start

### For Executives
1. Read: Executive Brief (Part 3, bottom section)
2. Review: Risk Heatmap (Part 3)
3. Approve: Timeline & RACI (Part 3, top section)

### For Implementation Teams
1. Start: Phase 0 Readiness Checklist (Part 1)
2. Execute: Phases 1-7 sequentially
3. Validate: DoD criteria per phase
4. Document: Exit Report (Part 3 template)

### For Auditors
1. Review: Compliance requirements (Part 1, Executive Overview)
2. Verify: Acceptance Criteria (Part 3)
3. Inspect: Evidence links (Exit Report template, Part 3)

---

## 📊 At-a-Glance Summary

| Metric | Value |
|--------|-------|
| **Total Phases** | 8 (P0-P7) |
| **Duration** | 7-10 weeks (35-50 days) |
| **Engineering Hours** | 400-500 hours |
| **Roles Involved** | 9 (Security Architect, Keycloak Admin, IAM Eng, Backend Dev, Crypto Eng, Infra Eng, SecOps, SRE, DevOps) |
| **Deliverables** | 26 documents + code artifacts |
| **Acceptance Criteria** | 80 total |
| **Test Coverage Target** | ≥95% |
| **Performance SLO** | OPA p95 <200ms, KAS p95 <300ms |
| **Compliance Standards** | ACP-240, ADatP-5663, NIST 800-63B, STANAG 4774/4778 |

---

## 🗺️ Phase Roadmap

```
┌─────────────────────────────────────────────────────────────┐
│ Week 1-2: FOUNDATION                                        │
│  P0: Readiness → P1: Federation & MFA Hardening            │
│  ✅ Broker-only auth, conditional 2FA, external MFA respect │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Week 2-4: IDENTITY & POLICY                                 │
│  P2: Attributes → P3: ABAC Policies                         │
│  ✅ Canonical schema, OPA tightening, decision replay       │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Week 5-7: DATA PROTECTION & INFRASTRUCTURE                  │
│  P4: Data-Centric Security → P5: Terraform                  │
│  ✅ Crypto binding, KEK wrapping, IaC consolidation         │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Week 7-9: OPERATIONS & AUTOMATION                           │
│  P6: Audit & SIEM → P7: CI/CD                               │
│  ✅ 90-day logs, SIEM forwarding, automated testing         │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Week 9-10: FINAL QA & SIGN-OFF                              │
│  Exit Report → Production Readiness Review                  │
│  ✅ 80/80 criteria met, compliance attestation              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔍 Navigation Guide

### By Role

**Security Architect**:
- Start: [Part 1 - Executive Overview](#)
- Focus: Phase 1 (Federation), Phase 3 (ABAC), Phase 4 (Crypto)
- Review: Risk Register (Part 3)

**Keycloak Admin**:
- Start: [Part 1 - Phase 0 Readiness](#)
- Focus: Phase 1 (MFA flows), Phase 2 (Mappers)
- Reference: Keycloak-LLMS.txt (grounding doc)

**IAM Engineer**:
- Start: [Part 1 - Phase 2](#)
- Focus: Attribute normalization, mapper consolidation
- Reference: clearance-mapper.service.ts

**Backend Developer**:
- Start: [Part 2 - Phase 4](#)
- Focus: ZTDF crypto service, KAS hardening, OpenTDF pilot
- Reference: CUSTOM-SPI-IMPLEMENTATION-GUIDE.md

**Infrastructure Engineer**:
- Start: [Part 2 - Phase 5](#)
- Focus: Terraform modules, `for_each` loops, remote state
- Reference: terraform/ directory structure

**Security Operations**:
- Start: [Part 2 - Phase 6](#)
- Focus: Audit logs, SIEM forwarding, anomaly rules
- Reference: ADATP-5663-ACP-240-INTEGRATION-COMPLETE.md

**DevOps Engineer**:
- Start: [Part 2 - Phase 7](#)
- Focus: CI/CD workflows, drift detection, runbooks
- Reference: .github/workflows/

---

## 📋 Critical Path Items

### Must-Complete Before Production

1. ✅ **Phase 0**: All 13 preflight checks PASS
2. ✅ **Phase 1**: 12/12 MFA tests PASS, zero SSO bypass
3. ✅ **Phase 2**: 40/40 users have canonical attributes
4. ✅ **Phase 3**: OPA p95 < 200ms, 40+ tests PASS
5. ✅ **Phase 4**: Metadata signatures verified, KEK wrapping active
6. ✅ **Phase 5**: Zero Terraform drift
7. ✅ **Phase 6**: 90-day audit retention confirmed
8. ✅ **Phase 7**: All CI/CD workflows GREEN

**Blocker Policy**: Any phase with < 90% DoD completion blocks next phase.

---

## 🚨 Top Risks & Mitigations

| Rank | Risk | Mitigation |
|------|------|------------|
| 🔴 #1 | **Key Custody Loss** (R6) | HSM/KMS integration + automated backups |
| 🔴 #2 | **Mapper Regression** (R3) | Integration tests per IdP + repair script |
| 🟠 #3 | **Terraform Provider Drift** (R1) | Version lock (5.5.0) + daily drift detection |
| 🟠 #4 | **KAS Latency Spike** (R5) | Async key fetch + local cache + 300ms SLO |
| 🟡 #5 | **OPA Performance** (R4) | Load testing + caching (60s TTL) |

**See Part 3 for full risk register (15 risks tracked)**

---

## 📦 Deliverables Checklist

### Documentation (26 items)
- [ ] 21 phase-specific docs (7 phases × 3 docs)
- [ ] 5 cross-cutting docs (RACI, risk register, exit report, exec brief, risk heatmap)

### Code Artifacts
- [ ] Terraform modules (realms, IdPs, mappers)
- [ ] OPA Rego policies (7 policies + tests)
- [ ] Backend services (ZTDF crypto, KMS, OpenTDF pilot)
- [ ] CI/CD workflows (4 GitHub Actions)
- [ ] Scripts (10+ automation scripts)

### Test Suites
- [ ] 40+ OPA tests (≥95% coverage)
- [ ] 80+ backend tests (Jest)
- [ ] 35+ frontend tests (RTL)
- [ ] 12 E2E scenarios (Playwright)
- [ ] 10 XACML parity tests

---

## 📞 Support & Resources

### Grounding Documents (Already Read)
- ✅ DIVE-V3-TECH-STACK-AUDIT.md (current state)
- ✅ FINAL-CLEARANCE-NORMALIZATION-SUMMARY.md (10 countries)
- ✅ CLEARANCE-NORMALIZATION-ISSUES.md (drift issues)
- ✅ POST-BROKER-MFA-ARCHITECTURE.md (best practices)
- ✅ CUSTOM-SPI-IMPLEMENTATION-GUIDE.md (OTP setup)
- ✅ ADATP-5663-ACP-240-INTEGRATION-COMPLETE.md (standards)
- ✅ Keycloak-LLMS.txt (Keycloak 26 migration notes)

### Standards to Align
- **ACP-240**: NATO access control policy (§5.1-5.4)
- **ADatP-5663**: Identity, Credential and Access Management (§4.4, 5.1.3, 6.2-6.8)
- **NIST SP 800-63B**: Digital Identity Guidelines (AAL1/AAL2/AAL3)
- **NIST SP 800-63C**: Federation and Assertions (FAL2)
- **STANAG 4774/4778**: NATO labeling & cryptographic binding

### External References
- OpenTDF: https://github.com/opentdf
- Keycloak Docs: https://www.keycloak.org/docs/26.0.0/
- OPA Docs: https://www.openpolicyagent.org/docs/latest/
- Terraform Keycloak Provider: https://registry.terraform.io/providers/keycloak/keycloak/

---

## 🎓 How to Use This Playbook

### Step 1: Read Executive Brief
**Location**: Part 3, bottom section  
**Time**: 10 minutes  
**Outcome**: Understand goals, timeline, ROI

### Step 2: Execute Phase 0
**Location**: Part 1, Readiness Checklist  
**Time**: 2-4 hours  
**Outcome**: 13/13 checks PASS, ready to proceed

### Step 3: Execute Phases 1-7 Sequentially
**Location**: Part 1 (P1-P3), Part 2 (P4-P7)  
**Time**: 35-50 days total  
**Outcome**: All DoD criteria met per phase

### Step 4: Complete Exit Report
**Location**: Part 3, Exit Report Template  
**Time**: 1-2 days  
**Outcome**: Evidence gathered, sign-off obtained

### Step 5: Production Deployment
**Prerequisites**: Exit Report APPROVED  
**Go-Live**: Staged rollout per environment (dev → staging → prod)

---

## 🏆 Success Criteria

### Technical Excellence
- [ ] 95%+ test coverage (OPA, backend, frontend)
- [ ] OPA p95 < 200ms
- [ ] KAS p95 < 300ms
- [ ] Zero Terraform drift
- [ ] 100% IaC coverage

### Compliance & Security
- [ ] ACP-240 §5.1-5.4 (ZTDF, KAS, crypto) ✅
- [ ] ADatP-5663 §4.4, 5.1.3, 6.2-6.8 (Federation, ABAC) ✅
- [ ] NIST SP 800-63B (AAL1/AAL2/AAL3) ✅
- [ ] 90-day audit trail ✅
- [ ] STANAG 4774/4778 (labeling, crypto binding) ✅

### Operational Readiness
- [ ] All CI/CD workflows GREEN
- [ ] 10 runbooks documented
- [ ] SIEM forwarding active
- [ ] 10 anomaly rules deployed
- [ ] Rollback procedures tested

**Overall Target**: **99%+ Compliance (PLATINUM+ rating)**

---

## 📅 Next Steps

### Immediate (This Week)
1. Review all three parts of this playbook
2. Assemble implementation team (9 roles)
3. Assign RACI responsibilities (Part 3)
4. Schedule kickoff meeting

### Week 1
1. Execute Phase 0 (Readiness Checklist)
2. Resolve any blockers
3. Begin Phase 1 (Federation & MFA)

### Ongoing
1. Daily standups (15 min)
2. Weekly phase reviews
3. Bi-weekly risk assessments
4. Monthly stakeholder updates

---

## 📝 Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-29 | Claude Sonnet 4.5 | Initial release (3-part playbook) |

---

## 🤝 Acknowledgments

**Based on**:
- DIVE-V3 current implementation (10 NATO nations, Keycloak 26, OPA, Terraform)
- Industry best practices (Keycloak, OPA, OpenTDF, NIST, NATO)
- Grounding documents (8 technical docs, 1,426 tests, 150+ completion reports)

**Special Thanks**:
- DIVE-V3 development team (federation, ABAC, MFA implementation)
- Standards bodies (NATO, NIST, IETF, OASIS)
- Open-source communities (Keycloak, OPA, OpenTDF, Terraform)

---

**READY TO BEGIN IMPLEMENTATION**

**First Action**: Open `DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-1.md` and start Phase 0.

**Questions?** Refer to Contact & Escalation section (Part 3, bottom).

**Good luck! 🚀**

