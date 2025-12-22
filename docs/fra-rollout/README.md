# FRA Instance Rollout Documentation
**Project:** DIVE V3 France (FRA) Federation Deployment  
**Phase:** 1 of 8 - Planning & Baseline  
**Status:** IN PROGRESS  
**Date:** November 24, 2025

## Overview

This directory contains all documentation for the France (FRA) instance rollout, establishing the template for multi-realm federation across coalition partners. The FRA deployment validates production-grade architecture before onboarding additional partners (DEU, ITA, etc.).

## Documentation Structure

### Phase 1 - Planning & Baseline (CURRENT)
- ✅ [`PHASE1-FRA-ARCHITECTURE-BRIEF.md`](PHASE1-FRA-ARCHITECTURE-BRIEF.md) - Complete technical architecture
- ✅ [`PHASE1-RISK-REGISTER.md`](PHASE1-RISK-REGISTER.md) - Identified risks with mitigations
- ✅ [`PHASE1-GAP-COVERAGE-MATRIX.md`](PHASE1-GAP-COVERAGE-MATRIX.md) - Gap analysis and remediation tracking
- ✅ [`PHASE1-IMPLEMENTATION-PLAN.md`](PHASE1-IMPLEMENTATION-PLAN.md) - SMART goals and timeline

### Upcoming Phases
- Phase 2: Cloudflare Zero Trust & Networking (Nov 25-26)
- Phase 3: Keycloak Realm Configuration (Nov 26-27)
- Phase 4: Backend & OPA Integration (Nov 27-28)
- Phase 5: Metadata Federation (Nov 28-29)
- Phase 6: FRA KAS Deployment (Nov 29-30)
- Phase 7: End-to-End Validation (Nov 30-Dec 1)
- Phase 8: Handoff Preparation (Dec 1)

## Quick Start

### Prerequisites
- Docker & Docker Compose installed
- Cloudflare account with API access
- GitHub CLI configured
- Terraform 1.5+ installed

### Current Status

#### Completed
- [x] Architecture documentation complete
- [x] Risk assessment with 12 identified risks
- [x] Gap analysis with remediation matrix
- [x] SMART goals defined for all phases

#### In Progress
- [ ] Legal review of data residency requirements
- [ ] GitHub commit and CI validation

#### Next Steps
1. Complete legal review (GAP-007)
2. Commit Phase 1 docs to GitHub
3. Begin Phase 2: Cloudflare tunnel provisioning

## Key Decisions

### Architecture
- **Deployment Model:** Segregated multi-tenant with dedicated FRA stack
- **Network:** Cloudflare Zero Trust tunnels with Access policies
- **Identity:** `dive-v3-broker-fra` Keycloak realm
- **Data:** Isolated MongoDB with FRA- prefixed resources
- **Security:** mTLS for service-to-service, JWT for API auth

### Hostnames
- Frontend: `fra-app.dive25.com`
- API: `fra-api.dive25.com`
- IdP: `fra-idp.dive25.com`
- KAS: `fra-kas.dive25.com`

### Integration Points
- USA Federation: `https://dev-api.dive25.com/federation`
- JWKS Exchange: Quarterly rotation
- Resource Sync: 5-minute intervals
- Decision Logs: Real-time streaming

## Risk Summary

### Critical Risks (Score ≥ 15)
1. **Trust Anchor Lifecycle** (20) - No automated cert rotation
2. **Attribute Normalization** (16) - French clearance mapping
3. **Cloudflare SPOF** (15) - Single tunnel point of failure
4. **Multi-KAS Divergence** (15) - Conflicting key decisions

### Mitigation Focus
- Phase 2: Deploy redundant tunnels, cert automation
- Phase 3: Implement fail-secure attribute mapping
- Phase 6: Establish KAS authority protocol

## Gap Coverage Progress

| Category | Total Gaps | Addressed | Remaining | Status |
|----------|------------|-----------|-----------|--------|
| Security | 4 | 0 | 4 | 🔴 |
| Interoperability | 3 | 0 | 3 | 🔴 |
| Data | 3 | 0 | 3 | 🔴 |
| Performance | 2 | 0 | 2 | 🔴 |
| Compliance | 3 | 0 | 3 | 🔴 |
| Operations | 3 | 0 | 3 | 🔴 |
| **TOTAL** | **18** | **0** | **18** | **0%** |

## Implementation Timeline

```
Nov 24 ━━━━━┓ Planning & Baseline
Nov 25 ━━━━━╋━━━━━┓ Cloudflare Setup
Nov 26      ┗━━━━━╋━━━━━┓ Keycloak Config
Nov 27            ┗━━━━━╋━━━━━┓ Backend/OPA
Nov 28                  ┗━━━━━╋━━━━━┓ Federation
Nov 29                        ┗━━━━━╋━━━━━┓ KAS Deploy
Nov 30                              ┗━━━━━╋━━━━━┓ E2E Testing
Dec 01                                    ┗━━━━━┛ Handoff
```

## Contact Information

### Project Team
- **Technical Lead:** TBD
- **Security Officer:** TBD
- **FRA Representative:** TBD
- **DevOps Lead:** TBD

### Communication Channels
- Slack: `#dive-v3-fra`
- Email: `dive-v3-fra@example.com`
- Escalation: Via phone tree (see runbook)

## Related Documentation

### Parent Docs
- [`/docs/dive-v3-requirements.md`](../../dive-v3-requirements.md)
- [`/docs/KEYCLOAK-FEDERATION-GUIDE.md`](../KEYCLOAK-FEDERATION-GUIDE.md)
- [`/FEDERATION-QUICK-REFERENCE.txt`](../../FEDERATION-QUICK-REFERENCE.txt)

### Scripts
- [`/scripts/multi-location-tunnel-setup.sh`](../../scripts/multi-location-tunnel-setup.sh)
- [`/scripts/setup-cloudflare-tunnel.sh`](../../scripts/setup-cloudflare-tunnel.sh)

### Terraform
- [`/terraform/fra-realm.tf`](../../terraform/fra-realm.tf)
- [`/terraform/fra-broker.tf`](../../terraform/fra-broker.tf)

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-24 | System | Initial planning documentation |

## License

UNCLASSIFIED // FOR OFFICIAL USE ONLY  
Distribution limited to authorized DIVE V3 federation partners

---
*For questions or concerns, contact the DIVE V3 FRA rollout team*

