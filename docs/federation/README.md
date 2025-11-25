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

## Questions?

Contact the DIVE Platform Team:
- Technical: `techops@dive.example`
- Policy: `federation@dive.example`

