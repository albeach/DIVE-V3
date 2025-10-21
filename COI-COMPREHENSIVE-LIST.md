# DIVE V3 - Communities of Interest (COI) Comprehensive List

## Overview
Communities of Interest (COI) are used in DIVE V3 to implement fine-grained access control based on operational partnerships and intelligence-sharing agreements. COI encryption enables zero re-encryption when new members join a coalition.

**Generated:** October 21, 2025  
**Based on:** ACP-240 Section 5.3, STANAG 4774/5636

---

## All COI Values in DIVE V3

### Core COIs (Default Keys Generated)

#### 1. **FVEY** - Five Eyes
- **Full Name:** Five Eyes Intelligence Alliance
- **Members:** USA, GBR (United Kingdom), CAN (Canada), AUS (Australia), NZL (New Zealand)
- **Description:** Intelligence-sharing alliance established in 1946 under UKUSA Agreement
- **Classification Support:** All levels (UNCLASSIFIED → TOP_SECRET)
- **Use Case:** Highest-tier intelligence sharing among founding members
- **Key Generated:** ✅ Yes (Default COI Key Registry)
- **Status:** Active

#### 2. **NATO-COSMIC**
- **Full Name:** NATO Cosmic Top Secret
- **Members:** All NATO members (30+ countries)
- **Description:** NATO's highest classification level for top secret material
- **Classification Support:** TOP_SECRET equivalent
- **Use Case:** NATO strategic military planning, nuclear command and control
- **Key Generated:** ✅ Yes (Default COI Key Registry)
- **Status:** Active

#### 3. **US-ONLY**
- **Full Name:** United States Only
- **Members:** USA
- **Description:** Restricted to US personnel only, no foreign nationals
- **Classification Support:** All levels
- **Use Case:** Sensitive operations, domestic law enforcement, national security
- **Key Generated:** ✅ Yes (Default COI Key Registry)
- **Status:** Active
- **Related Caveats:** NOFORN (No Foreign Nationals)

#### 4. **CAN-US**
- **Full Name:** Canada-United States Bilateral
- **Members:** CAN (Canada), USA (United States)
- **Description:** Bilateral defense and intelligence partnership
- **Classification Support:** All levels
- **Use Case:** NORAD operations, border security, joint defense
- **Key Generated:** ✅ Yes (Default COI Key Registry)
- **Status:** Active

#### 5. **FRA-US**
- **Full Name:** France-United States Bilateral
- **Members:** FRA (France), USA (United States)
- **Description:** Bilateral defense cooperation
- **Classification Support:** All levels
- **Use Case:** NATO operations, counterterrorism, European security
- **Key Generated:** ✅ Yes (Default COI Key Registry)
- **Status:** Active

#### 6. **NATO**
- **Full Name:** North Atlantic Treaty Organization
- **Members:** All 30+ NATO member states
- **Description:** General NATO classified material (non-COSMIC)
- **Classification Support:** UNCLASSIFIED, CONFIDENTIAL, SECRET
- **Use Case:** Standard NATO operations, exercises, planning
- **Key Generated:** ✅ Yes (Default COI Key Registry)
- **Status:** Active

#### 7. **GBR-US** (UKUSA)
- **Full Name:** United Kingdom-United States Agreement
- **Members:** GBR (United Kingdom), USA (United States)
- **Description:** Bilateral intelligence-sharing agreement (precursor to FVEY)
- **Classification Support:** All levels
- **Use Case:** SIGINT sharing, special operations, nuclear cooperation
- **Key Generated:** ✅ Yes (Default COI Key Registry)
- **Status:** Active

---

### Extended COIs (Test Data & Large-Scale Deployment)

#### 8. **EU-RESTRICTED**
- **Full Name:** European Union Restricted
- **Members:** All EU member states
- **Description:** European Union classified information
- **Classification Support:** CONFIDENTIAL, SECRET
- **Use Case:** EU defense policy, Common Foreign and Security Policy (CFSP)
- **Key Generated:** ⚠️ On-demand
- **Status:** Active

#### 9. **QUAD**
- **Full Name:** Quadrilateral Security Dialogue
- **Members:** USA, AUS (Australia), IND (India), JPN (Japan)
- **Description:** Indo-Pacific strategic partnership
- **Classification Support:** All levels
- **Use Case:** Indo-Pacific security, maritime operations, counter-China strategy
- **Key Generated:** ⚠️ On-demand
- **Status:** Active

#### 10. **AUKUS**
- **Full Name:** Australia-United Kingdom-United States
- **Members:** AUS (Australia), GBR (United Kingdom), USA (United States)
- **Description:** Trilateral security partnership (announced 2021)
- **Classification Support:** All levels
- **Use Case:** Nuclear submarines, advanced defense technology, cyber capabilities
- **Key Generated:** ⚠️ On-demand
- **Status:** Active

#### 11. **NORTHCOM**
- **Full Name:** United States Northern Command
- **Members:** USA, CAN (Canada), MEX (Mexico - limited)
- **Description:** North American defense region
- **Classification Support:** All levels
- **Use Case:** Homeland defense, Arctic operations, disaster response
- **Key Generated:** ⚠️ On-demand
- **Status:** Active

#### 12. **EUCOM**
- **Full Name:** United States European Command
- **Members:** USA + European NATO partners
- **Description:** European theater operations
- **Classification Support:** All levels
- **Use Case:** European defense, Ukraine support, Russia deterrence
- **Key Generated:** ⚠️ On-demand
- **Status:** Active

#### 13. **PACOM**
- **Full Name:** United States Indo-Pacific Command
- **Members:** USA + Indo-Pacific partners
- **Description:** Asia-Pacific theater operations
- **Classification Support:** All levels
- **Use Case:** Pacific defense, Taiwan contingencies, South China Sea
- **Key Generated:** ⚠️ On-demand
- **Status:** Active

#### 14. **CENTCOM**
- **Full Name:** United States Central Command
- **Members:** USA + Middle East partners
- **Description:** Middle East and Central Asia theater
- **Classification Support:** All levels
- **Use Case:** Counterterrorism, Iraq/Afghanistan operations, Iran monitoring
- **Key Generated:** ⚠️ On-demand
- **Status:** Active

#### 15. **SOCOM**
- **Full Name:** United States Special Operations Command
- **Members:** USA + coalition special operations forces
- **Description:** Special operations forces collaboration
- **Classification Support:** All levels (predominantly SECRET/TOP_SECRET)
- **Use Case:** Counterterrorism, direct action, foreign internal defense
- **Key Generated:** ⚠️ On-demand
- **Status:** Active

---

## COI Key Management

### Default COI Keys (Always Available)
The following COIs have keys automatically generated at system startup:
1. FVEY
2. NATO-COSMIC
3. US-ONLY
4. CAN-US
5. FRA-US
6. NATO
7. GBR-US

### On-Demand COI Keys
Extended COIs (QUAD, AUKUS, EUCOM, etc.) have keys generated:
- When first document is uploaded with that COI
- Via `/api/compliance/coi-keys/generate` admin endpoint
- During large-scale seeding operations

### Key Algorithm
- **Algorithm:** AES-256-GCM
- **Key Size:** 256 bits (32 bytes)
- **Derivation:** HMAC-SHA256 with environment seed
- **Version:** v1 (supports key rotation)
- **Storage:** 
  - **Production:** HashiCorp Vault / AWS KMS / HSM
  - **Pilot:** In-memory registry with deterministic generation

---

## COI Usage Statistics (Test Environment)

### Documents by COI (1,000+ document corpus)
```
FVEY:           ~180 documents  (18%)
NATO-COSMIC:    ~150 documents  (15%)
US-ONLY:        ~140 documents  (14%)
NATO:           ~120 documents  (12%)
CAN-US:         ~90 documents   (9%)
EU-RESTRICTED:  ~80 documents   (8%)
QUAD:           ~70 documents   (7%)
AUKUS:          ~60 documents   (6%)
EUCOM:          ~40 documents   (4%)
PACOM:          ~30 documents   (3%)
CENTCOM:        ~20 documents   (2%)
SOCOM:          ~15 documents   (1.5%)
NORTHCOM:       ~5 documents    (0.5%)
```

### Multi-COI Documents
Many documents have multiple COI tags:
- **Example:** SECRET document with COI: ["FVEY", "NATO"]
- **Interpretation:** Requires membership in EITHER FVEY OR NATO (set intersection logic)

---

## COI Authorization Logic (OPA Policy)

### Rule: COI Intersection
```rego
# User must have at least ONE COI that matches resource COI
is_coi_violation := msg if {
    count(input.resource.COI) > 0  # Resource has COI restrictions
    count(input.subject.acpCOI) == 0  # User has no COI memberships
    msg := "User has no COI memberships but resource requires COI"
} else := msg if {
    count(input.resource.COI) > 0
    count(input.subject.acpCOI) > 0
    # Check for intersection
    intersection := input.subject.acpCOI & input.resource.COI
    count(intersection) == 0
    msg := sprintf("No COI intersection: user=%v, resource=%v", [
        input.subject.acpCOI,
        input.resource.COI
    ])
}
```

### Examples

#### ✅ ALLOW: User COI matches resource COI
- **User:** `acpCOI: ["FVEY", "NATO"]`
- **Resource:** `COI: ["FVEY"]`
- **Result:** ALLOW (intersection: FVEY)

#### ✅ ALLOW: Multiple COI match
- **User:** `acpCOI: ["NATO-COSMIC", "FVEY"]`
- **Resource:** `COI: ["NATO-COSMIC", "US-ONLY"]`
- **Result:** ALLOW (intersection: NATO-COSMIC)

#### ❌ DENY: No COI intersection
- **User:** `acpCOI: ["FVEY"]`
- **Resource:** `COI: ["US-ONLY"]`
- **Result:** DENY (no intersection)

#### ✅ ALLOW: Resource has no COI restriction
- **User:** `acpCOI: ["FVEY"]`
- **Resource:** `COI: []`
- **Result:** ALLOW (no COI restriction on resource)

#### ❌ DENY: User has no COI but resource requires it
- **User:** `acpCOI: []`
- **Resource:** `COI: ["NATO"]`
- **Result:** DENY (user lacks required COI)

---

## COI Benefits (Zero Re-Encryption Pattern)

### Problem: Traditional Per-User Encryption
```
Old Coalition: [USA, GBR, CAN] → Encrypt once with 3 keys
New Member: AUS joins FVEY
Result: Must re-encrypt 10,000 historical documents!
```

### Solution: COI-Based Encryption
```
Old Coalition: [USA, GBR, CAN] → Encrypt with FVEY COI key
New Member: AUS joins FVEY
Result: Grant AUS access to FVEY key → Instant access to all historical data!
```

### Benefits
1. ✅ **Zero Re-Encryption:** New members get instant access to historical data
2. ✅ **Scalability:** Works for coalitions of any size (NATO: 30+ countries)
3. ✅ **Performance:** No re-encryption overhead when membership changes
4. ✅ **Audit Trail:** Track COI membership changes, not individual file access
5. ✅ **Key Rotation:** Rotate COI keys without changing membership

---

## Frontend Components Using COI

### Upload Form (`security-label-form.tsx`)
- COI selector filtered by user's actual COI memberships
- Visual COI cards with descriptions
- Validation: Selected COI must match releasability countries

### Resources List (`resources/page.tsx`)
- Filter by COI tags
- Display COI badges on resource cards
- Show COI restrictions in access denied messages

### COI Keys Page (`compliance/coi-keys/page.tsx`)
- Visual guide to COI-based encryption
- List of all registered COIs with key status
- Selection algorithm explanation
- Benefits showcase

### Policy Tester (`policy/policy-tester.tsx`)
- Test authorization with different COI combinations
- Show COI intersection logic
- Explain COI-based denials

---

## Database Schema

### MongoDB Resource Schema
```typescript
interface IResource {
  resourceId: string;
  title: string;
  classification: string;
  releasabilityTo: string[];  // Country codes
  COI: string[];              // Array of COI strings
  creationDate?: string;
  encrypted: boolean;
  // ... other fields
}
```

### Example Document
```json
{
  "resourceId": "doc-fvey-intel-001",
  "title": "Five Eyes Intelligence Summary",
  "classification": "SECRET",
  "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
  "COI": ["FVEY"],
  "encrypted": true,
  "coiKey": "FVEY"
}
```

---

## Related Caveats (Dissemination Controls)

COI tags work alongside dissemination control caveats:

- **NOFORN:** No Foreign Nationals (implies US-ONLY COI)
- **ORCON:** Originator Controlled (requires originator approval)
- **RELIDO:** Releasable by Information Disclosure Official only
- **PROPIN:** Proprietary Information Involved
- **IMCON:** Imagery Controlled

**Note:** Caveats are more restrictive than COI - both must be satisfied.

---

## ACP-240 Compliance

### Section 5.3: Community Keys
✅ **Implemented:** COI-based key management  
✅ **Implemented:** Zero re-encryption pattern  
✅ **Implemented:** Key versioning for rotation  
✅ **Implemented:** Deterministic key generation (pilot)  
⚠️ **Production:** Integrate with HashiCorp Vault or AWS KMS

### Section 5.2: Data-Centric Security
✅ **Implemented:** Policy travels with data (ZTDF manifest)  
✅ **Implemented:** COI enforcement at KAS key release  
✅ **Implemented:** Dual enforcement (PDP + KAS)

---

## Testing

### OPA Test Coverage
- ✅ T-COI-01: User with FVEY accessing FVEY resource - ALLOW
- ✅ T-COI-02: User with NATO-COSMIC accessing NATO-COSMIC resource - ALLOW
- ✅ T-COI-03: User with FVEY accessing US-ONLY resource - DENY
- ✅ T-COI-04: User with multiple COI accessing single COI - ALLOW
- ✅ T-COI-05: User with single COI accessing multi-COI - ALLOW
- ✅ T-COI-06: User with no COI accessing resource with COI - DENY
- ✅ T-COI-07: User with COI accessing resource with no COI - ALLOW
- ✅ T-COI-08: Empty user COI, empty resource COI - ALLOW
- ✅ T-COI-09: User with US-ONLY accessing NATO resource - DENY

**Test Command:**
```bash
cd policies
opa test fuel_inventory_abac_policy.rego tests/
```

---

## Production Deployment Checklist

### Before Production
- [ ] Integrate COI Key Registry with HashiCorp Vault or AWS KMS
- [ ] Implement key rotation procedures (30-90 day rotation)
- [ ] Add audit logging for COI key access
- [ ] Set up COI membership management workflow
- [ ] Document COI approval authorities per country
- [ ] Establish COI change control board
- [ ] Create COI key compromise response plan
- [ ] Test COI key backup and recovery procedures

### Security Requirements
- [ ] Store COI keys in HSM (Hardware Security Module)
- [ ] Encrypt COI keys at rest with master key
- [ ] Require multi-party authorization for COI key generation
- [ ] Log all COI key access with user identity and timestamp
- [ ] Implement COI key usage monitoring and alerting
- [ ] Restrict COI key API access to authorized services only

---

## References

### Internal Documentation
- `backend/src/services/coi-key-registry.ts` - COI Key Registry implementation
- `backend/src/__tests__/coi-key-registry.test.ts` - Unit tests
- `policies/fuel_inventory_abac_policy.rego` - COI authorization logic
- `policies/tests/comprehensive_test_suite.rego` - COI test cases
- `frontend/src/components/upload/security-label-form.tsx` - COI UI
- `frontend/src/app/compliance/coi-keys/page.tsx` - COI explainer

### Standards & Specifications
- **ACP-240:** NATO Access Control Policy (Section 5.3: Community Keys)
- **STANAG 4774:** NATO Security Labeling
- **STANAG 5636:** NATO Information Assurance
- **ICD 710:** U.S. IC Classification and Control Markings
- **32 CFR 2001:** Executive Order 13526 Implementation

### External Resources
- [Five Eyes Alliance (Wikipedia)](https://en.wikipedia.org/wiki/Five_Eyes)
- [NATO COSMIC Top Secret](https://www.nato.int/cps/en/natohq/topics_69572.htm)
- [AUKUS Partnership](https://www.state.gov/aukus/)

---

**Status:** ✅ 15 COIs Defined, 7 Default Keys Generated  
**Last Updated:** October 21, 2025  
**Maintained by:** DIVE V3 Development Team

