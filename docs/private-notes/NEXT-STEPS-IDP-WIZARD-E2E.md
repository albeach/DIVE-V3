# DIVE V3 - Next Steps: IdP Onboarding Wizard E2E Use Case

**Date**: October 28, 2025  
**Objective**: Complete E2E demonstration of IdP Onboarding Wizard with Spain SAML integration  
**Status**: 📋 READY TO IMPLEMENT

---

## Executive Summary

### Current Status
✅ **IdP Onboarding Wizard exists** at `/admin/idp/new`  
✅ **Spain SAML IdP is running** (SimpleSAMLphp on port 9443)  
✅ **Terraform module is ready** (infrastructure validated)  
❌ **Spain SAML not appearing** on login page (not registered in Keycloak broker)  
❌ **No documented E2E workflow** for adding external IdPs

### Main Objectives
1. **Make Spain SAML visible** on frontend IdP selector (`http://localhost:3000/`)
2. **Create E2E use case** demonstrating IdP Onboarding Wizard
3. **Document complete workflow** from wizard submission to user login
4. **Validate automation** (risk scoring, auto-approval, attribute mapping)

---

## Problem Analysis

### Why Spain SAML Isn't Showing on Frontend

**Root Cause**: Spain SAML IdP not registered in Keycloak broker realm

**Current Flow**:
```
Frontend (IdpSelector) 
  ↓ Fetches from
Backend API GET /api/idps/public
  ↓ Queries
Keycloak Admin API (dive-v3-broker realm)
  ↓ Returns
Only registered IdPs: usa-realm-broker, can-realm-broker, fra-realm-broker, industry-realm-broker
```

**Spain SAML Status**:
- ✅ **Running**: SimpleSAMLphp container on port 9443
- ✅ **Certificate**: Extracted to `external-idps/spain-saml/cert/server.crt`
- ✅ **Terraform module**: Ready in `terraform/modules/external-idp-saml/`
- ❌ **Not registered**: Not in Keycloak `dive-v3-broker` realm

### Solution Paths

#### Option A: Terraform Deployment (Infrastructure-as-Code)
**Pro**: Clean, repeatable, version-controlled  
**Con**: Requires Terraform state management setup  
**Time**: 30 minutes setup + 5 minutes deployment

#### Option B: IdP Onboarding Wizard (User-Facing Tool)
**Pro**: Demonstrates E2E workflow, exactly what user wants to test  
**Con**: Requires admin authentication  
**Time**: 15 minutes to fill wizard + 2 minutes validation

#### ✅ **Recommended**: Option B (Wizard) → Demonstrates full E2E use case

---

## E2E Use Case Workflow

### Phase 1: Admin Onboards Spain SAML via Wizard

**Actors**: super_admin user  
**Tools**: IdP Onboarding Wizard (`/admin/idp/new`)  
**Outcome**: Spain SAML registered, validated, and auto-approved

#### Step-by-Step Process

**Step 1: Access Wizard**
```
1. Login as super_admin (admin-dive or testuser-admin)
2. Navigate to /admin → IdP Management
3. Click "+ Add New IdP" button
4. Wizard opens with 8 steps
```

**Step 2: Protocol Selection**
```
- Select: SAML 2.0
- Next →
```

**Step 3: Basic Info**
```
Alias: esp-realm-external
Display Name: Spain Ministry of Defense (External SAML)
Description: External Spain SAML IdP for coalition federation testing
Country: ESP
Organization: Spain Ministry of Defense
Next →
```

**Step 4: SAML Configuration**
```
Entity ID: https://spain-saml:9443/simplesaml/saml2/idp/metadata.php
SSO URL: https://spain-saml:9443/simplesaml/saml2/idp/SSOService.php
SLO URL: https://spain-saml:9443/simplesaml/saml2/idp/SingleLogoutService.php

Certificate: [Paste contents of external-idps/spain-saml/cert/server.crt]

Signature Algorithm: RSA_SHA256
NameID Format: urn:oasis:names:tc:SAML:2.0:nameid-format:transient

Want Assertions Signed: Yes
Want Assertions Encrypted: No
Force Authentication: No

Next →
```

**Step 5: Documentation (Optional)**
```
Skip (testing scenario) or upload compliance documents
Next →
```

**Step 6: Attribute Mapping**
```
uniqueID:
  - SAML Attribute: uid
  - User Attribute: uniqueID

clearance:
  - SAML Attribute: nivelSeguridad
  - User Attribute: clearanceOriginal
  - Note: Backend will normalize Spanish clearances

countryOfAffiliation:
  - Hardcoded: ESP
  - Note: All Spain users get ESP country code

acpCOI:
  - SAML Attribute: grupoInteresCompartido
  - User Attribute: acpCOI
  - Multi-valued: Yes

Next →
```

**Step 7: Review Configuration**
```
Review all settings
Check "I confirm this configuration is correct"
Submit for Validation →
```

**Step 8: Automated Validation & Risk Scoring**

Backend performs:
1. ✅ **Connectivity Test**: Can reach SimpleSAMLphp container
2. ✅ **SAML Metadata Validation**: Parses entity descriptor
3. ✅ **Certificate Validation**: Checks RSA key size, expiration
4. ✅ **Signature Algorithm**: Validates RSA_SHA256 (strong)
5. ✅ **Attribute Availability**: Checks uid, nivelSeguridad available
6. ⚠️ **MFA Detection**: Self-signed cert detected (risk factor)
7. ✅ **TLS Version**: HTTPS enforced
8. 📊 **Risk Score Calculation**:
   - Base: 100 points
   - Self-signed cert: -10 points
   - Strong crypto: +0 (baseline)
   - **Final Score: 90 points → Gold Tier**

**Result**:
```
✅ Validation Passed
✅ Risk Score: 90/100 (Gold Tier)
✅ Auto-Approved (85+ points)
✅ IdP Created in Keycloak
✅ Attribute Mappers Configured
✅ Ready for Use

"Spain Ministry of Defense (External SAML)" is now available for login.
```

---

### Phase 2: User Authenticates via Spain SAML

**Actors**: Spanish military user  
**Tools**: Frontend IdP selector, SimpleSAMLphp  
**Outcome**: User logs in, attributes normalized, authorization enforced

#### Step-by-Step Process

**Step 1: IdP Selection**
```
1. Navigate to http://localhost:3000/
2. See IdP selector with Spain flag 🇪🇸
3. Click "Spain Ministry of Defense (External SAML)"
4. Redirected to /login?idp=esp-realm-external
```

**Step 2: SAML Authentication Flow**
```
Frontend → NextAuth → Keycloak Broker (dive-v3-broker)
  ↓
Keycloak generates SAML AuthnRequest
  ↓
POST to https://spain-saml:9443/simplesaml/saml2/idp/SSOService.php
  ↓
SimpleSAMLphp shows login form:
  - Username: user1 (or any test user)
  - Password: user1pass
  ↓
SimpleSAMLphp generates SAML Response with assertions:
  - uid: "user1"
  - nivelSeguridad: "SECRETO" (Spanish for SECRET)
  - grupoInteresCompartido: ["NATO-COSMIC", "OTAN-ESP"]
  ↓
POST SAML Response back to Keycloak
  ↓
Keycloak processes SAML assertion
  ↓
Keycloak attribute mappers transform:
  - uid → uniqueID
  - nivelSeguridad → clearanceOriginal
  - [Hardcoded] → countryOfAffiliation = "ESP"
  - grupoInteresCompartido → acpCOI
  ↓
Keycloak issues JWT to NextAuth
  ↓
NextAuth stores session
  ↓
Redirect to /dashboard
```

**Step 3: Backend Attribute Normalization**
```
User accesses resource: GET /api/resources/doc-123

Backend authz.middleware.ts:
1. Validates JWT signature
2. Extracts claims:
   - uniqueID: "user1"
   - clearanceOriginal: "SECRETO"
   - countryOfAffiliation: "ESP"
   - acpCOI: ["NATO-COSMIC", "OTAN-ESP"]

3. Attribute Enrichment:
   - Normalizes "SECRETO" → "SECRET" (Spanish clearance mapping)
   - Keeps countryOfAffiliation: "ESP"
   - Validates COI tags

4. OPA Authorization:
   {
     "subject": {
       "uniqueID": "user1",
       "clearance": "SECRET",
       "countryOfAffiliation": "ESP",
       "acpCOI": ["NATO-COSMIC", "OTAN-ESP"]
     },
     "resource": {
       "classification": "SECRET",
       "releasabilityTo": ["ESP", "USA", "FRA"],
       "COI": ["NATO-COSMIC"]
     }
   }

5. OPA Decision:
   - Clearance check: SECRET ≥ SECRET ✅
   - Releasability: ESP in [ESP, USA, FRA] ✅
   - COI check: NATO-COSMIC intersects [NATO-COSMIC, OTAN-ESP] ✅
   - **ALLOW**

6. Return resource to user
```

---

## Implementation Plan

### Task 1: Use IdP Wizard to Onboard Spain SAML (15 min)

**Prerequisites**:
- ✅ Backend running on port 4000
- ✅ Keycloak running on port 8081
- ✅ Spain SAML running on port 9443
- ✅ Frontend running on port 3000

**Steps**:
1. Login as super_admin: `admin-dive` / `DiveAdmin2025!`
2. Navigate to `/admin/idp/new`
3. Fill wizard with Spain SAML configuration (see Phase 1 above)
4. Submit for validation
5. Verify auto-approval (Gold tier expected)
6. Check Keycloak Admin Console for new IdP
7. Check backend logs for validation events

**Expected Output**:
```
✅ IdP "esp-realm-external" created in Keycloak
✅ Attribute mappers configured (uid → uniqueID, nivelSeguridad → clearanceOriginal)
✅ Hardcoded mapper for countryOfAffiliation = ESP
✅ Risk score: 90/100 (Gold tier)
✅ Status: Enabled
```

---

### Task 2: Verify Spain SAML Appears on Frontend (2 min)

**Steps**:
1. Open fresh browser tab (or incognito)
2. Navigate to `http://localhost:3000/`
3. Observe IdP selector

**Expected Output**:
```
IdP Selector shows:
- 🇺🇸 United States (DoD)
- 🇨🇦 Canada (Forces canadiennes)
- 🇫🇷 France (Ministère des Armées)
- 🏢 Industry Partners
- 🇪🇸 Spain Ministry of Defense (External SAML)  ← NEW!
```

**Verification**:
```bash
# Check backend API
curl http://localhost:4000/api/idps/public | jq '.idps[] | select(.alias == "esp-realm-external")'

# Expected:
{
  "alias": "esp-realm-external",
  "displayName": "Spain Ministry of Defense (External SAML)",
  "protocol": "saml",
  "enabled": true
}
```

---

### Task 3: Test Spain SAML Authentication Flow (5 min)

**Prerequisites**:
- Task 1 & 2 completed
- SimpleSAMLphp test users configured

**Steps**:
1. Click "Spain Ministry of Defense (External SAML)" on homepage
2. Redirected to SimpleSAMLphp login page
3. Enter credentials:
   - Username: `user1`
   - Password: `user1pass`
4. Submit login form
5. SAML assertion posted back to Keycloak
6. Redirected to `/dashboard`
7. View user profile showing:
   - Country: Spain 🇪🇸
   - Clearance: SECRET (normalized from SECRETO)
   - COI: NATO-COSMIC, OTAN-ESP
   - uniqueID: user1

**Expected Logs**:
```
[authz.middleware] Attribute normalization:
  clearanceOriginal: SECRETO → clearance: SECRET
  countryOfAffiliation: ESP (no change)
  acpCOI: ["NATO-COSMIC", "OTAN-ESP"]
```

---

### Task 4: Test Resource Access with Spanish User (10 min)

**Scenario 1: Access NATO-COSMIC SECRET Resource**
```
Resource: doc-nato-secret-001
- Classification: SECRET
- ReleasabilityTo: ["ESP", "USA", "FRA", "GBR", "ITA"]
- COI: ["NATO-COSMIC"]

Spanish User (user1):
- Clearance: SECRET
- Country: ESP
- COI: ["NATO-COSMIC", "OTAN-ESP"]

Expected: ✅ ALLOW
Reason: SECRET ≥ SECRET, ESP in releasability, NATO-COSMIC in COI
```

**Scenario 2: Access US-ONLY Resource**
```
Resource: doc-us-confidential-002
- Classification: CONFIDENTIAL
- ReleasabilityTo: ["USA"]
- COI: ["US-ONLY"]

Spanish User (user1):
- Clearance: SECRET
- Country: ESP
- COI: ["NATO-COSMIC", "OTAN-ESP"]

Expected: ❌ DENY
Reason: ESP not in releasabilityTo ["USA"]
```

**Scenario 3: Access TOP_SECRET Resource**
```
Resource: doc-top-secret-003
- Classification: TOP_SECRET
- ReleasabilityTo: ["ESP", "USA"]
- COI: []

Spanish User (user1):
- Clearance: SECRET
- Country: ESP

Expected: ❌ DENY
Reason: SECRET < TOP_SECRET (insufficient clearance)
```

---

## Alternative: Terraform Deployment (Fallback)

If IdP Wizard has issues, deploy via Terraform:

```bash
# Create terraform.tfvars
cd terraform
cat > terraform.tfvars <<EOF
keycloak_url = "http://localhost:8081"
keycloak_admin_username = "admin"
keycloak_admin_password = "admin"
EOF

# Apply Spain SAML module
terraform init
terraform plan -target=module.spain_saml_idp
terraform apply -target=module.spain_saml_idp

# Verify
curl http://localhost:4000/api/idps/public | jq
```

---

## Success Criteria

### IdP Wizard E2E
- [x] Wizard accessible at `/admin/idp/new`
- [ ] SAML configuration form validates inputs
- [ ] Certificate pasted successfully
- [ ] Automated validation runs (connectivity, metadata, crypto)
- [ ] Risk score calculated (target: 85+ for Gold tier)
- [ ] Auto-approval triggered for Gold tier
- [ ] IdP created in Keycloak with correct configuration
- [ ] Attribute mappers created automatically

### Frontend Integration
- [ ] Spain SAML appears on IdP selector
- [ ] Flag emoji displayed (🇪🇸)
- [ ] Clicking triggers SAML authentication flow
- [ ] User redirected to SimpleSAMLphp login page
- [ ] After login, user returned to dashboard

### Backend Integration
- [ ] Spanish clearances normalized (SECRETO → SECRET)
- [ ] Country code ESP assigned correctly
- [ ] COI tags processed (NATO-COSMIC, OTAN-ESP)
- [ ] OPA authorization decisions correct
- [ ] Audit logs capture Spanish user activity

### Documentation
- [ ] E2E workflow documented
- [ ] Screenshots captured
- [ ] Risk scoring explained
- [ ] Attribute mapping documented
- [ ] Troubleshooting guide created

---

## Testing Matrix

| Test Case | User | Resource | Expected | Reason |
|-----------|------|----------|----------|--------|
| 1. NATO SECRET | ESP/SECRET/NATO-COSMIC | SECRET/[ESP,USA]/NATO-COSMIC | ✅ ALLOW | All checks pass |
| 2. US-ONLY CONF | ESP/SECRET/NATO-COSMIC | CONFIDENTIAL/[USA]/US-ONLY | ❌ DENY | Country mismatch |
| 3. TOP_SECRET | ESP/SECRET/NATO-COSMIC | TOP_SECRET/[ESP,USA]/[] | ❌ DENY | Clearance too low |
| 4. FVEY Resource | ESP/SECRET/NATO-COSMIC | SECRET/[USA,GBR,CAN,AUS,NZL]/FVEY | ❌ DENY | ESP not in FVEY |
| 5. UNCLASS Public | ESP/SECRET/NATO-COSMIC | UNCLASSIFIED/[]/[] | ✅ ALLOW | Public resource |

---

## Troubleshooting

### Issue: Spain SAML not showing on frontend after wizard submission

**Check**:
```bash
# 1. Verify IdP created in Keycloak
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:8081/admin/realms/dive-v3-broker/identity-provider/instances

# 2. Check backend API
curl http://localhost:4000/api/idps/public | jq '.idps[] | select(.protocol == "saml")'

# 3. Check frontend logs
# Open browser console at http://localhost:3000/
# Look for: "[IdP Selector] Received IdPs: ..."
```

**Solution**: Force refresh backend cache or restart backend service

---

### Issue: SAML authentication fails with "Invalid signature"

**Check**:
```bash
# Verify certificate matches
docker exec dive-spain-saml-idp cat /var/www/simplesamlphp/cert/server.crt
# Compare with what was pasted in wizard
```

**Solution**: Re-extract certificate and update IdP configuration

---

### Issue: User authenticated but attributes missing

**Check Backend Logs**:
```
[authz.middleware] JWT claims: { uniqueID: undefined, clearance: undefined }
```

**Solution**: Verify attribute mappers in Keycloak Admin Console:
1. Go to `dive-v3-broker` realm
2. Identity Providers → esp-realm-external → Mappers
3. Check `uid → uniqueID` mapper exists
4. Check `nivelSeguridad → clearanceOriginal` mapper exists

---

### Issue: Spanish clearance not normalized

**Symptom**: User has `clearanceOriginal: "SECRETO"` but no `clearance` field

**Check**:
```typescript
// backend/src/middleware/authz.middleware.ts
// Verify Spanish clearance mapping exists
const spanishClearanceMap = {
  'NO_CLASIFICADO': 'UNCLASSIFIED',
  'DIFUSION_LIMITADA': 'CONFIDENTIAL',
  'CONFIDENCIAL': 'CONFIDENTIAL',
  'SECRETO': 'SECRET',
  'ALTO_SECRETO': 'TOP_SECRET'
};
```

**Solution**: Add missing mapping or fix typo in SimpleSAMLphp attribute name

---

## Benefits of IdP Wizard Approach

### User Experience
✅ **No CLI required** - Web-based workflow  
✅ **Visual feedback** - Progress indicators, validation messages  
✅ **Error handling** - Clear error messages with suggestions  
✅ **Risk transparency** - See security score before approval  

### Security
✅ **Automated validation** - TLS, crypto, certificates checked  
✅ **Risk scoring** - Objective security assessment  
✅ **Approval workflow** - Manual review for low-scoring IdPs  
✅ **Audit trail** - All wizard submissions logged  

### Operations
✅ **Consistent configuration** - Template-based approach  
✅ **Reduced errors** - Form validation prevents misconfig  
✅ **Self-service** - Admins can onboard without DevOps  
✅ **Documentation** - Wizard captures all metadata  

---

## Next Steps (Priority Order)

### Immediate (This Session)
1. ✅ **Document E2E workflow** (this document)
2. ⏭️ **Use IdP Wizard** to onboard Spain SAML (15 min)
3. ⏭️ **Verify frontend** shows Spain option (2 min)
4. ⏭️ **Test authentication** flow (5 min)
5. ⏭️ **Test authorization** with Spanish user (10 min)
6. ⏭️ **Capture screenshots** for documentation (5 min)

### Short-Term (Next Session)
7. **Configure SimpleSAMLphp test users** with varied clearances
8. **Test clearance normalization** (SECRETO, ALTO_SECRETO, etc.)
9. **Test COI intersection** logic with NATO-COSMIC
10. **Create video demo** of complete E2E flow

### Medium-Term (This Week)
11. **Add Germany SAML IdP** via wizard (second E2E test)
12. **Add Italy OIDC IdP** via wizard (third E2E test)
13. **Performance test** wizard with 10+ concurrent submissions
14. **Stress test** attribute normalization with edge cases

### Long-Term (Next Sprint)
15. **Real CA-signed certificates** for external IdPs
16. **Production SimpleSAMLphp** configuration
17. **MFA enforcement** for external IdP users
18. **Monitoring dashboard** for IdP health

---

## Documentation Artifacts to Create

### 1. E2E Demo Video (5 min)
**Content**:
- Admin logs in
- Opens IdP Wizard
- Fills SAML configuration
- Submits for validation
- Shows risk score (Gold tier)
- Auto-approval notification
- Logs out
- New user selects Spain SAML
- Authenticates via SimpleSAMLphp
- Accesses NATO resource
- Shows authorization decision

**Tools**: Screen recording (QuickTime, OBS Studio)

---

### 2. IdP Wizard User Guide (Markdown)
**Sections**:
- Introduction
- When to use wizard vs. Terraform
- Step-by-step walkthrough (with screenshots)
- Risk scoring explained
- Approval workflow
- Troubleshooting common issues
- FAQ

---

### 3. Spain SAML Integration Report
**Content**:
- Configuration details (endpoints, certificates)
- Attribute mapping table
- Clearance normalization rules
- Test results (5 scenarios)
- Performance metrics (latency, throughput)
- Security assessment
- Recommendations

---

## Conclusion

This E2E use case demonstrates **the complete IdP onboarding lifecycle** from wizard submission to user authentication and authorization. It validates:

✅ **Wizard functionality** - All 8 steps working  
✅ **Automated validation** - Risk scoring, security checks  
✅ **Frontend integration** - Dynamic IdP selector  
✅ **SAML flow** - Full authentication cycle  
✅ **Attribute normalization** - Spanish clearances → DIVE standard  
✅ **Authorization** - OPA decisions based on normalized attributes  
✅ **Audit trail** - All events logged  

**Next Action**: Execute Task 1 (Use IdP Wizard) - **Ready to proceed**

---

**Generated**: October 28, 2025  
**Estimated Time**: 1 hour total for complete E2E  
**Priority**: HIGH (Main user objective)  
**Complexity**: MEDIUM (existing infrastructure + wizard)  
**Dependencies**: All services running (backend, Keycloak, Spain SAML, frontend)


