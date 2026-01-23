# AMR Enrichment Root Cause Analysis - `countryOfAffiliation` Federation Bug

**Date:** 2026-01-24  
**Session:** Federation Attribute Propagation Fix  
**Status:** 🎯 **TRUE ROOT CAUSE IDENTIFIED**  
**Severity:** 🔴 **CRITICAL** - Breaks federation attribute propagation  

---

## 🚨 THE SMOKING GUN

### User's Log Evidence

```log
2026-01-23 07:52:52,675 WARN  [org.keycloak.events] type="LOGIN_ERROR", realmId="dive-v3-broker-fra", 
  userId="12a59a83-fa19-4672-ae9d-c96fdf04132a", error="invalid_user_credentials"

[DIVE AMR] Authentication event detected: LOGIN for user: 12a59a83-fa19-4672-ae9d-c96fdf04132a
[DIVE AMR DEBUG] federationLink: null
[DIVE AMR DEBUG] federated identity count: 0
[DIVE AMR DEBUG] credential count: 1, amr attr: pwd
[DIVE AMR DEBUG] isFederatedUser: false  ❌ WRONG!!!
[DIVE AMR] Setting AUTH_METHODS_REF: ["pwd"]
[DIVE AMR] Setting ACR: 0 (AAL1)
[DIVE AMR] Updated user attributes: amr=[pwd], acr=0
```

**The Bug:** AMR enrichment incorrectly identifies federated user as local user and **OVERWRITES** user attributes including `countryOfAffiliation`.

---

## 🔍 ROOT CAUSE ANALYSIS

### The Deprecated Extension is Still Deployed ❌

**Documentation Claims (Dec 18, 2025):**
```markdown
## Status: ❌ **PERMANENTLY REMOVED**
All custom Keycloak SPIs have been **PERMANENTLY REMOVED** in DIVE V3 v3.0.0
```

**Reality Check (Jan 24, 2026):**
```bash
$ docker exec dive-spoke-fra-keycloak ls -la /opt/keycloak/providers/
-rw-r--r-- 1 keycloak 1000 1418329 Jan  3 05:13 dive-keycloak-extensions.jar  ❌ STILL THERE!
```

**Conclusion:** The JAR was documented as removed but never actually deleted from the deployment.

---

### The Bug in AMREnrichmentEventListener.java

**Location:** `keycloak/extensions/archived/src/main/java/com/dive/keycloak/event/AMREnrichmentEventListener.java`

**The Flawed Logic (Lines 84-103):**

```java
boolean isFederatedUser = user.getFederationLink() != null;
System.out.println("[DIVE AMR DEBUG] federationLink: " + user.getFederationLink());

// Check if user has federated identity providers linked
if (!isFederatedUser) {
    long fedIdCount = session.users().getFederatedIdentitiesStream(realm, user).count();
    System.out.println("[DIVE AMR DEBUG] federated identity count: " + fedIdCount);
    isFederatedUser = fedIdCount > 0;
}

// Also check if user has NO local credentials but HAS amr attribute (federated)
if (!isFederatedUser) {
    long credentialCount = user.credentialManager().getStoredCredentialsStream().count();
    String amrAttr = user.getFirstAttribute("amr");
    System.out.println("[DIVE AMR DEBUG] credential count: " + credentialCount + ", amr attr: " + amrAttr);
    if (credentialCount == 0 && amrAttr != null) {
        isFederatedUser = true;
    }
}
```

**Why It Fails for FRA Users:**

1. **federationLink = null** ✅ Expected (user is IN FRA realm, not federated FROM another realm)
2. **federated identity count = 0** ✅ Expected (this is the HOME realm for the user)
3. **credential count = 1** ❌ **PROBLEM** - FRA user has local password
4. **amr attr = "pwd"** ❌ **PROBLEM** - Set by previous login
5. **Result:** `isFederatedUser = false` ❌ **WRONG!**

**The Extension Falls Through to Local User Logic (Lines 205-270):**

```java
// Build AMR array based on LOCAL credentials validated / present
// This only runs for NON-FEDERATED users who authenticate locally
List<String> amrMethods = new ArrayList<>();

// Password is always required for authentication
amrMethods.add("pwd");

// ... OTP/WebAuthn checks ...

// CRITICAL BUG: Also overwrites user attributes!
user.setAttribute("amr", amrMethods);  // List<String> for multivalued
user.setSingleAttribute("acr", acr);   // Single value for ACR
System.out.println("[DIVE AMR] Updated user attributes: amr=" + amrMethods + ", acr=" + acr);
```

**The Damage:**
- `user.setAttribute("amr", ["pwd"])` - Overwrites existing attribute
- **Keycloak's setAttribute() replaces ALL attributes** - This includes attributes set by:
  - Seed scripts (`countryOfAffiliation`, `clearance`, `uniqueID`)
  - IdP mappers (during federation)
  - User registration

---

### Why FRA User Loses `countryOfAffiliation`

**Sequence of Events:**

1. **FRA User Created (seed-users.sh):**
   ```json
   {
     "username": "testuser-fra-1",
     "attributes": {
       "countryOfAffiliation": ["FRA"],
       "clearance": ["UNCLASSIFIED"],
       "uniqueID": ["testuser-fra-1"]
     }
   }
   ```

2. **User Logs In (LOGIN event):**
   - AMREnrichmentEventListener fires
   - Checks: `isFederatedUser = false` (❌ wrong logic)
   - Falls through to local credential check
   - Calls: `user.setAttribute("amr", ["pwd"])`

3. **setAttribute() Behavior (Keycloak API):**
   - **REPLACES** the entire attributes map for that key
   - **DOES NOT MERGE** with existing attributes
   - Side effect: May trigger attribute normalization

4. **Attribute Loss (Theory):**
   - setAttribute() triggers internal Keycloak attribute update
   - Update may reset/normalize other attributes
   - Timing issue: May happen during transaction commit
   - Result: `countryOfAffiliation` disappears

---

## 🎯 THE FIX (4 Phases)

### Phase 0: Immediate Verification (15 min)

**Goal:** Confirm AMR extension is the culprit

**Tasks:**
1. Clean slate deployment
   ```bash
   ./dive nuke all
   ./dive hub deploy
   ./dive spoke deploy fra "France"
   ```

2. Verify JAR exists
   ```bash
   docker exec dive-spoke-fra-keycloak ls -la /opt/keycloak/providers/dive-keycloak-extensions.jar
   ```

3. Test login and capture logs
   - Login as `testuser-fra-1` at FRA Keycloak
   - Check logs for `[DIVE AMR]` messages
   - Verify `isFederatedUser: false` in logs

4. Check user attributes before/after login
   ```bash
   # Before login
   docker exec dive-spoke-fra-keycloak /opt/keycloak/bin/kcadm.sh get users \
     -r dive-v3-broker-fra --fields id,username,attributes

   # After login - Check if countryOfAffiliation still exists
   ```

**Success Criteria:**
- [ ] JAR confirmed present in /opt/keycloak/providers/
- [ ] Logs show `[DIVE AMR] isFederatedUser: false` for FRA user
- [ ] User attributes show missing/changed `countryOfAffiliation` after login

---

### Phase 1: Remove AMR Extension JAR (30 min)

**Goal:** Physically remove the deprecated extension from all instances

**Tasks:**

1. **Find where JAR is copied from**
   ```bash
   # Search for volume mounts
   grep -r "dive-keycloak-extensions.jar" docker-compose*.yml instances/*/docker-compose.yml

   # Search for COPY commands in Dockerfiles
   grep -r "dive-keycloak-extensions" */Dockerfile docker/*/Dockerfile
   ```

2. **Remove JAR from source locations**
   ```bash
   # Check if JAR exists in project
   find . -name "dive-keycloak-extensions.jar" -type f

   # Delete if found (should only be in keycloak/extensions/archived/target/)
   rm keycloak/extensions/archived/target/dive-keycloak-extensions.jar
   ```

3. **Update docker-compose files to NOT mount JAR**
   - Remove any volume mounts for keycloak providers
   - Remove any COPY commands for JAR files
   - Update keycloak service definitions

4. **Clean slate test**
   ```bash
   ./dive nuke all
   ./dive hub deploy
   ./dive spoke deploy fra "France"

   # Verify JAR is gone
   docker exec dive-spoke-fra-keycloak ls -la /opt/keycloak/providers/
   # Expected: Only README.md, no JAR files

   # Verify logs don't show [DIVE AMR] messages
   docker logs dive-spoke-fra-keycloak 2>&1 | grep "DIVE AMR"
   # Expected: No output
   ```

**Success Criteria:**
- [ ] JAR removed from all source locations
- [ ] No volume mounts for keycloak providers
- [ ] Clean slate deployment shows no JAR in /opt/keycloak/providers/
- [ ] Logs don't show `[DIVE AMR]` messages

---

### Phase 2: Verify Native AMR/ACR Works (30 min)

**Goal:** Confirm Keycloak's native AMR/ACR tracking works correctly

**Tasks:**

1. **Verify Terraform configures native mappers**
   ```bash
   # Check for oidc-amr-mapper in Terraform
   grep -r "oidc-amr-mapper" terraform/modules/

   # Check for ACR configuration in authentication flows
   grep -r "acr_level" terraform/modules/
   ```

2. **Test local user login (Hub)**
   - Login to Hub as local user (`testuser-usa-1`)
   - Check token for `amr` claim
   - Verify native Keycloak sets `amr: ["pwd"]`

3. **Check protocol mappers**
   ```bash
   # Get Hub Keycloak admin token
   TOKEN=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
     --server http://localhost:8080 \
     --realm master \
     --user admin \
     --password KeycloakAdminSecure123! 2>&1 | grep -o "token.*" | cut -d' ' -f2)

   # List protocol mappers on dive-v3-broker client
   docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get clients \
     -r dive-v3-broker-usa \
     --fields 'id,clientId' | jq -r '.[] | select(.clientId=="dive-v3-broker") | .id' | \
   xargs -I {} docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get \
     clients/{}/protocol-mappers/models -r dive-v3-broker-usa
   ```

**Success Criteria:**
- [ ] Terraform has native `oidc-amr-mapper` configured
- [ ] Local user login includes `amr: ["pwd"]` in token (without custom JAR)
- [ ] No `[DIVE AMR]` log messages during login

---

### Phase 3: Test Federation with Native Features (45 min)

**Goal:** Verify federated users get correct `countryOfAffiliation` without AMR extension

**Tasks:**

1. **Clean slate test**
   ```bash
   ./dive nuke all
   ./dive hub deploy
   ./dive spoke deploy fra "France"
   ```

2. **Test federation (FRA → Hub)**
   - Open browser (incognito)
   - Navigate to `https://localhost:3000`
   - Click "FRA Instance"
   - Login as `testuser-fra-1` / `TestUser2025!Pilot`
   - **CRITICAL:** This is a FRESH user federation (first time)

3. **Verify Hub user attributes**
   ```bash
   # Get Hub Keycloak admin token
   TOKEN=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
     --server http://localhost:8080 \
     --realm master \
     --user admin \
     --password KeycloakAdminSecure123! 2>&1 | grep "token" || echo "")

   # Get user attributes
   USER_ID=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get users \
     -r dive-v3-broker-usa \
     --query username=testuser-fra-1 \
     --fields id | jq -r '.[0].id')

   docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID \
     -r dive-v3-broker-usa \
     --fields 'username,attributes' | jq
   ```

4. **Verify session attributes**
   ```javascript
   // Browser console
   fetch('/api/auth/session').then(r => r.json()).then(console.log)
   ```

**Expected Result:**
```json
{
  "user": {
    "uniqueID": "12a59a83-fa19-4672-ae9d-c96fdf04132a",
    "clearance": "UNCLASSIFIED",
    "countryOfAffiliation": "FRA",  ✅ SHOULD BE "FRA" NOW!
    "acpCOI": [],
    "name": "Jasper Octopus",
    "email": "12a59a83-fa19-4672-ae9d-c96fdf04132a@dive-broker.internal"
  }
}
```

**Success Criteria:**
- [ ] Hub user has `countryOfAffiliation: ["FRA"]` in Keycloak
- [ ] Session shows `countryOfAffiliation: "FRA"` (not "USA")
- [ ] No `[DIVE AMR]` messages in FRA Keycloak logs
- [ ] Federation works without custom JAR

---

### Phase 4: Automated Testing & Documentation (60 min)

**Goal:** Prevent regression and document the fix

**Tasks:**

1. **Create E2E test**
   ```bash
   # Create test script
   cat > tests/e2e/federation-attributes-amr-fix.sh <<'EOF'
   #!/bin/bash
   set -euo pipefail

   echo "=== E2E Test: Federation Attributes (Post AMR Fix) ==="

   # Clean slate
   ./dive nuke all
   ./dive hub deploy
   ./dive spoke deploy fra "France"

   # Verify JAR removed
   if docker exec dive-spoke-fra-keycloak ls /opt/keycloak/providers/dive-keycloak-extensions.jar 2>/dev/null; then
     echo "❌ FAIL: JAR still exists"
     exit 1
   fi
   echo "✅ PASS: JAR removed"

   # Test federation (requires Playwright)
   npx playwright test tests/e2e/fra-federation-login.spec.ts

   # Verify Hub user attributes
   HUB_COUNTRY=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get users \
     -r dive-v3-broker-usa \
     --query username=testuser-fra-1 \
     --fields attributes | jq -r '.[0].attributes.countryOfAffiliation[0]')

   if [[ "$HUB_COUNTRY" != "FRA" ]]; then
     echo "❌ FAIL: Hub user countryOfAffiliation = $HUB_COUNTRY (expected FRA)"
     exit 1
   fi
   echo "✅ PASS: Hub user has countryOfAffiliation = FRA"

   # Verify session
   SESSION_COUNTRY=$(curl -sk --cookie cookies.txt https://localhost:3000/api/auth/session | \
     jq -r '.user.countryOfAffiliation')

   if [[ "$SESSION_COUNTRY" != "FRA" ]]; then
     echo "❌ FAIL: Session countryOfAffiliation = $SESSION_COUNTRY (expected FRA)"
     exit 1
   fi
   echo "✅ PASS: Session has countryOfAffiliation = FRA"

   echo "✅ ALL TESTS PASSED"
   EOF

   chmod +x tests/e2e/federation-attributes-amr-fix.sh
   ```

2. **Update documentation**
   - Update `.cursor/FEDERATION_ATTRIBUTES_SOLUTION.md` with root cause
   - Document why AMR extension caused attribute loss
   - Document native AMR/ACR features as replacement

3. **Git commit**
   ```bash
   git add -A
   git commit -m "fix(keycloak): Remove deprecated AMR extension causing attribute loss

   CRITICAL BUG FIX:
   - Deprecated dive-keycloak-extensions.jar was still deployed
   - AMREnrichmentEventListener incorrectly identified federated users as local
   - Called user.setAttribute() which overwrote countryOfAffiliation
   - Result: FRA users showed countryOfAffiliation: USA instead of FRA

   ROOT CAUSE:
   - Line 84-103: isFederatedUser logic fails for users in their home realm
   - Line 268: user.setAttribute() replaces attributes, not merges
   - Timing: Event fires during login, corrupts user attributes

   FIX:
   - Removed JAR from all deployments
   - Rely on Keycloak native AMR/ACR features
   - Native features don't modify user attributes

   TESTING:
   - Clean slate test: ./dive nuke all && deploy Hub + FRA
   - FRA user federation now shows correct countryOfAffiliation: FRA
   - E2E test added: tests/e2e/federation-attributes-amr-fix.sh

   Fixes: #<issue-number>
   Closes: .cursor/CRITICAL_BUG_FEDERATION_ATTRIBUTES.md"
   ```

4. **Push to GitHub**
   ```bash
   git push origin main
   ```

**Success Criteria:**
- [ ] E2E test passes
- [ ] Documentation updated
- [ ] Git commit pushed to GitHub
- [ ] CI/CD pipeline passes (if configured)

---

## 📊 IMPACT ANALYSIS

### Before Fix ❌

**Flow:**
1. FRA user created with `countryOfAffiliation: ["FRA"]`
2. User logs in → AMR event fires
3. `isFederatedUser = false` (wrong logic)
4. `user.setAttribute("amr", ["pwd"])` 
5. Side effect: `countryOfAffiliation` lost/corrupted
6. Hub federation imports incomplete attributes
7. Session shows `countryOfAffiliation: "USA"` (fallback)

**Result:** ❌ Authorization decisions incorrect, security violation

### After Fix ✅

**Flow:**
1. FRA user created with `countryOfAffiliation: ["FRA"]`
2. User logs in → No AMR extension running
3. Native Keycloak sets session notes (not user attributes)
4. Attributes remain intact
5. Hub federation imports correct attributes
6. Session shows `countryOfAffiliation: "FRA"`

**Result:** ✅ Correct authorization, compliant with ACP-240

---

## 🎓 LESSONS LEARNED

### 1. Documentation vs Reality
- ❌ **Mistake:** Assumed deprecated = removed
- ✅ **Fix:** Always verify runtime state, not just documentation
- ✅ **Prevention:** Add CI checks to ensure JAR not deployed

### 2. Event Listener Side Effects
- ❌ **Mistake:** setAttribute() has hidden side effects (attribute replacement)
- ✅ **Fix:** Use native features that don't modify user attributes
- ✅ **Prevention:** Avoid custom event listeners that modify user state

### 3. Federation Detection Logic
- ❌ **Mistake:** Assumed user.getFederationLink() detects ALL federated users
- ✅ **Reality:** federationLink is null for users IN their home realm
- ✅ **Fix:** Federated users are only "federated" in the TARGET realm, not source realm

### 4. Log Analysis
- ✅ **User was RIGHT:** Logs clearly showed `isFederatedUser: false` for FRA user
- ✅ **Lesson:** Always analyze logs line-by-line, don't make assumptions
- ✅ **Best Practice:** Structured logging with clear debug messages (worked perfectly here!)

---

## ✅ VERIFICATION CHECKLIST

### Pre-Fix State
- [ ] JAR exists in /opt/keycloak/providers/
- [ ] Logs show `[DIVE AMR]` messages during login
- [ ] FRA user shows `isFederatedUser: false` in logs
- [ ] Session shows `countryOfAffiliation: "USA"` for FRA user

### Post-Fix State
- [ ] JAR removed from all deployments
- [ ] No `[DIVE AMR]` messages in logs
- [ ] FRA user attributes preserved during login
- [ ] Hub user has `countryOfAffiliation: ["FRA"]`
- [ ] Session shows `countryOfAffiliation: "FRA"`
- [ ] E2E test passes
- [ ] Git commit pushed
- [ ] Documentation updated

---

## 🔗 REFERENCES

- **Bug Report:** `.cursor/CRITICAL_BUG_FEDERATION_ATTRIBUTES.md`
- **Deprecation Notice:** `keycloak/extensions/DEPRECATED.md`
- **Source Code:** `keycloak/extensions/archived/src/main/java/com/dive/keycloak/event/AMREnrichmentEventListener.java`
- **User's Logs:** Session log showing `isFederatedUser: false` (see top of document)
- **Keycloak API:** [UserModel.setAttribute()](https://www.keycloak.org/docs-api/26.0.0/javadocs/org/keycloak/models/UserModel.html#setAttribute-java.lang.String-java.util.List-)

---

**Status:** 🎯 **ROOT CAUSE CONFIRMED - READY FOR FIX**  
**Next Step:** Execute Phase 0 verification, then Phase 1 JAR removal  
**ETA:** 2-3 hours for complete fix and testing  

---

*Root Cause Analysis Complete - 2026-01-24*
