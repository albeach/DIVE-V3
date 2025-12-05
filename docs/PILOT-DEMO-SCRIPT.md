# DIVE V3 Pilot Demo Script

**Duration: 15-20 minutes**  
**Audience: Stakeholders, Technical Leads, Coalition Partners**

---

## Pre-Demo Checklist

```bash
# Ensure instances are running
./scripts/dive-status.sh

# Expected: USA and FRA instances show "Online"
```

Browser tabs to open:
1. https://usa-app.dive25.com
2. https://fra-app.dive25.com
3. https://usa-idp.dive25.com/admin (optional: Keycloak admin)

---

## Introduction (1-2 min)

**Talking Points:**
- DIVE V3 demonstrates federated identity management across coalition partners
- Key capabilities: Multi-IdP authentication, attribute-based access control, policy enforcement
- Architecture: Keycloak (IdP broker), Next.js (UI), OPA (policy engine)
- Pilot mode: Streamlined for demonstration with real federation flows

---

## Scenario 1: Multi-Clearance Access (3 min)

**Goal:** Show different access levels within the same country.

### Setup
- Open https://usa-app.dive25.com
- Have credentials ready for `testuser-usa-1` and `testuser-usa-3`

### Steps

1. **Login as UNCLASSIFIED user**
   - Click "United States" IdP
   - Login: `testuser-usa-1` / `DiveDemo2025!`
   - **Point out:** User attributes shown in demo badge (bottom right)
   - **Result:** Can see UNCLASSIFIED resources only

2. **Logout and login as SECRET user**
   - Click logout
   - Login: `testuser-usa-3` / `DiveDemo2025!`
   - **Point out:** Clearance badge now shows "SECRET" (yellow)
   - **Result:** Can see UNCLASSIFIED, CONFIDENTIAL, and SECRET resources

### Talking Points
- "Notice the demo badge shows clearance level 1 vs level 3"
- "OPA policy evaluates clearance hierarchy automatically"
- "Same IdP, different access based on user attributes"

---

## Scenario 2: Cross-Country Federation (4 min)

**Goal:** Show a USA user authenticating through FRA instance.

### Setup
- Open https://fra-app.dive25.com (France instance)
- Have `testuser-usa-3` credentials ready

### Steps

1. **Navigate to France instance**
   - Note the instance banner shows "FRA Instance"
   - Show available IdPs (includes federated USA)

2. **Select United States IdP**
   - Click "United States" in IdP selector
   - **Point out:** "This is federation in action - FRA trusts USA as identity provider"

3. **Login with USA credentials**
   - Login: `testuser-usa-3` / `DiveDemo2025!`
   - Redirected back to FRA after authentication

4. **Show access results**
   - **Point out:** USA attributes (clearance, country) are honored
   - **Point out:** Resources shown based on USA clearance + FRA releasability rules

### Talking Points
- "The user authenticated against USA Keycloak"
- "France instance trusts that authentication and maps the attributes"
- "ACP-240 compliant attribute normalization happens automatically"
- "This is the foundation for coalition information sharing"

---

## Scenario 3: Access Denial (3 min)

**Goal:** Show policy enforcement when clearance is insufficient.

### Setup
- Use https://usa-app.dive25.com
- Login as `testuser-usa-1` (UNCLASSIFIED)

### Steps

1. **Attempt to access SECRET resource**
   - Navigate to resource list
   - Try to view a SECRET-classified document
   
2. **Show denial message**
   - **Point out:** Clear denial reason displayed
   - **Point out:** Audit trail created (mention logging)

3. **Explain policy evaluation**
   - "OPA evaluated the request against the policy"
   - "Clearance check failed: UNCLASSIFIED < SECRET"

### Talking Points
- "Default deny - everything starts as denied"
- "Specific rules must allow access"
- "Every decision is logged for compliance"

---

## Scenario 4: Partner Onboarding (4 min)

**Goal:** Demonstrate the self-service onboarding flow.

### Setup
- Open https://usa-app.dive25.com
- Login as any user (to access onboarding wizard)

### Steps

1. **Open onboarding wizard**
   - Navigate to federation settings
   - Click "Add Partner"

2. **Show Quick-Add feature**
   - **Point out:** Pre-configured partners (Italy, Spain, etc.)
   - Click on "ITA" (Italy) for quick demo

3. **Walk through wizard steps**
   - **Step 1:** Partner details auto-populated
   - **Step 2:** OIDC selected, discovery URL pre-filled
   - **Step 3:** Review summary, standards compliance checked

4. **Complete (simulated)**
   - Click "Activate Partner"
   - **Point out:** "In pilot mode, this is simulated"
   - **Point out:** "Production would require approval workflow"

### Talking Points
- "Onboarding designed to be frictionless for pilots"
- "Quick-add covers NATO partners pre-configured"
- "Attribute mapping handled automatically per ACP-240"
- "Production adds approval gates and compliance verification"

---

## Scenario 5: Trust Management (2 min)

**Goal:** Show federation trust toggle interface.

### Steps

1. **Open trust management panel**
   - Show list of federated partners
   - Show trust status indicators (green=trusted, yellow=pending)

2. **Toggle trust (demonstration)**
   - Disable trust for a partner
   - **Point out:** Pending changes indicator
   - Show "Apply Changes" button

3. **Explain governance**
   - "Federation administrators can manage trust relationships"
   - "Changes require confirmation to prevent accidents"
   - "In production, changes would sync to Keycloak"

---

## Wrap-Up (2 min)

### Summary Points

1. **Multi-IdP Federation** - Multiple identity providers, unified access
2. **Attribute-Based Access** - OPA policies, clearance hierarchy
3. **Coalition Ready** - Standards-compliant (ACP-240, STANAG acknowledgment)
4. **Self-Service** - Streamlined partner onboarding

### Next Steps

- "Full deployment includes additional partners (DEU, GBR, CAN)"
- "Production adds KAS for encrypted resources"
- "E2E testing validates all federation flows"

### Q&A

---

## Demo Recovery Tips

| Issue | Quick Fix |
|-------|-----------|
| Page not loading | `./scripts/manage-instances.sh USA restart` |
| IdPs not showing | Check Keycloak is running, refresh page |
| Login loop | Clear browser cookies, try incognito |
| Slow response | Wait 30 seconds, services may be warming up |

---

## Post-Demo

```bash
# Run test suite to validate demo didn't break anything
./scripts/tests/run-all-tests.sh
```








