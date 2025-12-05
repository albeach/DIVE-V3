# DIVE V3 Federation Trust Framework

## Overview

This document defines the governance model, vetting criteria, and operational policies for participation in the DIVE V3 federation.

---

## 1. Trust Framework Governance

### 1.1 Governance Bodies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DIVE FEDERATION GOVERNANCE STRUCTURE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    FEDERATION POLICY BOARD                            │   │
│  │                                                                        │   │
│  │  Composition: Representatives from founding members (USA, FRA, DEU)   │   │
│  │  Meeting: Quarterly                                                    │   │
│  │  Responsibilities:                                                     │   │
│  │    • Approve new member nations                                        │   │
│  │    • Set interoperability standards                                    │   │
│  │    • Resolve disputes                                                  │   │
│  │    • Annual policy review                                              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    TECHNICAL STEERING COMMITTEE                       │   │
│  │                                                                        │   │
│  │  Composition: Technical leads from each member                        │   │
│  │  Meeting: Monthly                                                      │   │
│  │  Responsibilities:                                                     │   │
│  │    • Attribute schema evolution                                        │   │
│  │    • Protocol standards (OIDC/SAML versions)                          │   │
│  │    • Security requirements                                             │   │
│  │    • Interoperability testing                                          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    OPERATIONS WORKING GROUP                           │   │
│  │                                                                        │   │
│  │  Composition: Operations staff from each member                       │   │
│  │  Meeting: Weekly                                                       │   │
│  │  Responsibilities:                                                     │   │
│  │    • Incident response coordination                                    │   │
│  │    • Onboarding support                                                │   │
│  │    • Health monitoring                                                 │   │
│  │    • Issue escalation                                                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Member Categories

| Category | Description | Vetting Level | Example |
|----------|-------------|---------------|---------|
| **Founding Member** | Original federation participants | Full governance rights | USA, FRA, DEU |
| **Full Member** | NATO/FVEY nation with ratified agreement | Voting rights | GBR, CAN, ITA |
| **Associate Member** | Allied nation pending full membership | Observer status | JPN, AUS, KOR |
| **Technical Partner** | Industry/contractor organization | No voting, sponsored | Defense contractors |

---

## 2. Identity Provider Vetting Criteria

### 2.1 Technical Requirements

| Requirement | Minimum Standard | Verification Method |
|-------------|------------------|---------------------|
| **Protocol** | OIDC 1.0 or SAML 2.0 | Metadata validation |
| **Encryption** | TLS 1.2+ with AEAD cipher | Endpoint scan |
| **Certificates** | Publicly trusted CA, 2048-bit RSA or P-256 ECDSA | Certificate chain validation |
| **Token Signing** | RS256, RS384, RS512, ES256, ES384 | JWKS validation |
| **Token Lifetime** | Access: ≤ 15 min, Refresh: ≤ 8 hours | Policy review |
| **MFA Support** | MUST support MFA for SECRET+ clearance | Configuration review |
| **Metadata** | Well-known endpoints, valid schema | Automated parsing |

### 2.2 Security Requirements

| Requirement | Standard | Evidence Required |
|-------------|----------|-------------------|
| **Security Assessment** | ISO 27001 or equivalent | Certification copy |
| **Vulnerability Management** | Patches within 30 days (critical: 7 days) | Policy document |
| **Incident Response** | 24/7 security contact, < 1 hour response | Contact verification |
| **Logging** | Authentication logs retained 90+ days | Policy document |
| **Penetration Testing** | Annual by accredited third party | Test summary (redacted) |
| **Data Residency** | User data within member nation | Attestation |

### 2.3 Operational Requirements

| Requirement | Standard | Evidence Required |
|-------------|----------|-------------------|
| **Availability** | 99.9% uptime (excl. maintenance) | SLA document |
| **Maintenance Windows** | Advance notice: 72 hours (planned), ASAP (emergency) | Process document |
| **Support** | Business hours support minimum | Contact information |
| **Documentation** | Integration guide, troubleshooting | Documentation URL |
| **Change Management** | Breaking changes: 90-day notice | Change policy |

### 2.4 Compliance Requirements

| Requirement | Standard | Verification |
|-------------|----------|--------------|
| **Data Protection** | GDPR (EU), Privacy Act (US), or equivalent | Legal attestation |
| **Export Control** | ITAR/EAR compliance (if US data involved) | Attestation |
| **Personnel Security** | Background checks for admin staff | Policy document |
| **Audit Rights** | Annual compliance audit participation | Agreement clause |

---

## 3. Onboarding Checklist

### 3.1 Pre-Application

- [ ] Review DIVE Trust Framework documentation
- [ ] Verify eligibility (member category)
- [ ] Identify technical and business sponsors
- [ ] Gather required evidence/documentation
- [ ] Ensure IdP meets technical requirements

### 3.2 Application

- [ ] Complete onboarding request form
- [ ] Upload IdP metadata (SAML) or discovery URL (OIDC)
- [ ] Provide sample token for attribute mapping
- [ ] Attach compliance attestations
- [ ] Identify Federation Administrator(s)
- [ ] Sign Memorandum of Agreement (MOA)

### 3.3 Technical Review

- [ ] Metadata validation passed
- [ ] Endpoint connectivity verified
- [ ] Certificate chain valid
- [ ] Token signing verified
- [ ] Attribute mapping completed

### 3.4 Security Review

- [ ] Security assessment reviewed
- [ ] Vulnerability scan completed
- [ ] Incident response contacts verified
- [ ] Data residency confirmed

### 3.5 Business Review

- [ ] MOA signed by authorized representative
- [ ] Sponsorship confirmed (if required)
- [ ] Budget/resource allocation confirmed
- [ ] Legal review completed

### 3.6 Provisioning

- [ ] Keycloak IdP configured
- [ ] Terraform resources applied
- [ ] DNS/tunnel routes created
- [ ] Federation Admin accounts created

### 3.7 Testing

- [ ] Sandbox environment provisioned
- [ ] Authentication flow tested
- [ ] Attribute mapping verified
- [ ] Authorization scenarios tested
- [ ] Load/performance baseline established

### 3.8 Production

- [ ] Production deployment completed
- [ ] Monitoring/alerting configured
- [ ] Documentation published
- [ ] Support contacts registered
- [ ] Go-live announced

---

## 4. Attribute Normalization

### 4.1 DIVE Core Attribute Schema

```yaml
# Required Attributes (MUST be present in all tokens)
uniqueID:
  description: Globally unique user identifier
  type: string
  format: "[issuer]:[subject]" or opaque string
  source: IdP sub/nameID claim
  
clearance:
  description: User's security clearance level
  type: enum
  values: [UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET]
  source: Mapped from IdP-specific claim
  
countryOfAffiliation:
  description: User's sponsoring nation
  type: string
  format: ISO 3166-1 alpha-3
  source: Mapped from IdP-specific claim or IdP metadata

# Optional Attributes (MAY be present)
acpCOI:
  description: Access Control Policy Communities of Interest
  type: array[string]
  values: [FVEY, NATO-COSMIC, CAN-US, US-ONLY, ...]
  source: Mapped from IdP group claims
  
userType:
  description: Employment category
  type: enum
  values: [military, civilian, contractor]
  default: military
  source: Mapped from IdP-specific claim
  
organization:
  description: User's organization/unit
  type: string
  source: Mapped from IdP org claim
  
displayName:
  description: Human-readable name (for UI only, not logged)
  type: string
  source: Mapped from IdP name claim
  
email:
  description: Email address (for notifications only)
  type: string
  format: email
  source: Mapped from IdP email claim
```

### 4.2 Clearance Level Mappings

| Country | Local Term | DIVE Mapping |
|---------|------------|--------------|
| 🇺🇸 USA | UNCLASSIFIED | UNCLASSIFIED |
| 🇺🇸 USA | CONFIDENTIAL | CONFIDENTIAL |
| 🇺🇸 USA | SECRET | SECRET |
| 🇺🇸 USA | TOP SECRET | TOP_SECRET |
| 🇫🇷 FRA | NON PROTÉGÉ | UNCLASSIFIED |
| 🇫🇷 FRA | DIFFUSION RESTREINTE | UNCLASSIFIED |
| 🇫🇷 FRA | CONFIDENTIEL DÉFENSE | CONFIDENTIAL |
| 🇫🇷 FRA | SECRET DÉFENSE | SECRET |
| 🇫🇷 FRA | TRÈS SECRET DÉFENSE | TOP_SECRET |
| 🇩🇪 DEU | OFFEN | UNCLASSIFIED |
| 🇩🇪 DEU | VS-NUR FÜR DEN DIENSTGEBRAUCH | UNCLASSIFIED |
| 🇩🇪 DEU | VS-VERTRAULICH | CONFIDENTIAL |
| 🇩🇪 DEU | GEHEIM | SECRET |
| 🇩🇪 DEU | STRENG GEHEIM | TOP_SECRET |
| 🇬🇧 GBR | OFFICIAL | UNCLASSIFIED |
| 🇬🇧 GBR | OFFICIAL-SENSITIVE | UNCLASSIFIED |
| 🇬🇧 GBR | SECRET | SECRET |
| 🇬🇧 GBR | TOP SECRET | TOP_SECRET |
| 🇨🇦 CAN | UNCLASSIFIED | UNCLASSIFIED |
| 🇨🇦 CAN | PROTECTED A/B | UNCLASSIFIED |
| 🇨🇦 CAN | PROTECTED C | CONFIDENTIAL |
| 🇨🇦 CAN | CONFIDENTIAL | CONFIDENTIAL |
| 🇨🇦 CAN | SECRET | SECRET |
| 🇨🇦 CAN | TOP SECRET | TOP_SECRET |

### 4.3 Country Code Normalization

| Input Format | Example | DIVE Output |
|--------------|---------|-------------|
| ISO 3166-1 alpha-2 | US, FR, DE | USA, FRA, DEU |
| ISO 3166-1 alpha-3 | USA, FRA, DEU | (no change) |
| Full name | United States, France | USA, FRA |
| Common variants | UK, Britain | GBR |
| IdP issuer domain | .mil, .gouv.fr | USA, FRA |

---

## 5. Compliance & Audit

### 5.1 Continuous Compliance Monitoring

| Check | Frequency | Automated | Action on Failure |
|-------|-----------|-----------|-------------------|
| Certificate expiry | Daily | ✅ | Alert at 30/14/7 days |
| Endpoint availability | Every 5 min | ✅ | Alert after 3 failures |
| Metadata validity | Daily | ✅ | Alert, suspend after 7 days |
| Token validation | Every auth | ✅ | Reject, log security event |
| Attribute compliance | Every auth | ✅ | Reject if required missing |

### 5.2 Periodic Reviews

| Review | Frequency | Conducted By | Output |
|--------|-----------|--------------|--------|
| Security Assessment | Annual | Security Team | Compliance report |
| Penetration Test | Annual | Third party | Test summary |
| Policy Compliance | Quarterly | Operations | Compliance scorecard |
| Business Review | Annual | Policy Board | Membership renewal |
| Technical Health | Monthly | Tech Committee | Health report |

### 5.3 Incident Classification

| Severity | Description | Response Time | Notification |
|----------|-------------|---------------|--------------|
| **SEV-1** | Federation-wide outage, security breach | < 15 min | All members, Policy Board |
| **SEV-2** | Single member outage, suspected breach | < 1 hour | Affected members, Ops WG |
| **SEV-3** | Degraded service, configuration issue | < 4 hours | Affected members |
| **SEV-4** | Minor issue, documentation update | < 24 hours | Ticket tracking |

---

## 6. Offboarding Process

### 6.1 Voluntary Withdrawal

1. Member submits withdrawal notice (90 days minimum)
2. Operations WG coordinates transition plan
3. User migration/communication completed
4. IdP disabled (soft delete)
5. 90-day grace period for dispute resolution
6. IdP permanently removed
7. Audit records retained per policy (7 years)

### 6.2 Involuntary Suspension

Grounds for immediate suspension:
- Security breach affecting federation
- Repeated compliance failures (3+ in 12 months)
- Violation of trust framework
- Non-payment of fees (if applicable)
- Legal/regulatory prohibition

Process:
1. Security Team documents incident
2. Operations WG implements suspension
3. Member notified with evidence
4. 30-day appeal window
5. Policy Board final decision
6. If upheld: proceed with offboarding

### 6.3 Emergency Revocation

In case of active security threat:
1. Operations WG can immediately disable IdP
2. Policy Board notified within 4 hours
3. Member notified when safe to do so
4. Post-incident review within 7 days

---

## 7. Appendices

### Appendix A: Sample Memorandum of Agreement

[Template provided separately]

### Appendix B: Technical Integration Guide

[Link to integration documentation]

### Appendix C: Contact Directory

| Role | Contact | Escalation |
|------|---------|------------|
| Technical Support | support@dive.example | techops@dive.example |
| Security Incidents | security@dive.example | ciso@dive.example |
| Business Inquiries | federation@dive.example | board@dive.example |

---

*Document Version: 1.0*  
*Last Updated: November 2025*  
*Next Review: February 2026*








