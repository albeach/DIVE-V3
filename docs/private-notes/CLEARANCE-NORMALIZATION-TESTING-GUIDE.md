# DIVE V3 - Clearance Normalization Testing Guide

**Visual Walkthrough for Testing Multi-National Clearance Normalization**

---

## 🎯 What We're Testing

This guide walks you through testing the **clearance normalization** and **AAL attributes** fix across multiple countries and clearance levels.

### Key Points to Verify:
1. ✅ JWT tokens contain both `clearance` (for display) and `clearanceOriginal` (Spanish/French/German original)
2. ✅ Backend normalizes country clearances to standard (SECRETO → SECRET, GEHEIM → SECRET, etc.)
3. ✅ AAL attributes (`acr`, `amr`) are from session, NOT hardcoded
4. ✅ MFA required for CONFIDENTIAL+ users (AAL2)
5. ✅ NO MFA for UNCLASSIFIED users (AAL1)

---

## 📋 Test Scenarios

### Test 1: 🇪🇸 Spanish User - SECRET Clearance (SECRETO)

**User**: `carlos.garcia` / `Password123!`  
**Expected Clearance**: SECRETO (Spanish) → SECRET (normalized)  
**Expected AAL**: AAL2 (MFA required)

#### Steps:

1. **Open DIVE V3**: http://localhost:3000
2. **Click**: 🇪🇸 Spain (Ministerio de Defensa)
3. **Login**: carlos.garcia / Password123!
4. **Complete MFA**: Scan QR code if first time, or enter OTP
5. **Open DevTools**: F12 → Application → Cookies
6. **Find Cookie**: `next-auth.session-token`
7. **Decode JWT**: Copy value → Paste at https://jwt.io

#### Expected JWT Payload:
```json
{
  "sub": "fdc1f35c-12e5-4ba6-99b4-986658ddeea2",
  "uniqueID": "550e8400-e29b-41d4-a716-446655440011",
  "clearance": "SECRETO",  ✅ Spanish clearance preserved
  "clearanceOriginal": "SECRETO",  ✅ NEW: Original tracking
  "countryOfAffiliation": "ESP",
  "acpCOI": ["NATO-COSMIC"],
  "dutyOrg": "SPANISH_ARMY",
  "orgUnit": "CYBER_DEFENSE",
  "acr": "urn:mace:incommon:iap:silver",  ✅ From session (AAL2)
  "amr": ["pwd", "otp"],  ✅ From session (MFA used)
  "name": "Carlos García",
  "email": "carlos.garcia@defensa.es"
}
```

#### Backend Normalization Log:
```
[INFO] Clearance normalized via exact match
{
  original: "SECRETO",
  normalized: "SECRET",
  country: "ESP",
  wasNormalized: true,
  confidence: "exact"
}
```

---

### Test 2: 🇩🇪 German User - SECRET Clearance (GEHEIM)

**User**: `hans.mueller` / `Password123!`  
**Expected Clearance**: GEHEIM (German) → SECRET (normalized)  
**Expected AAL**: AAL2 (MFA required)

#### Steps:

1. **Logout** if logged in
2. **Open**: http://localhost:3000
3. **Click**: 🇩🇪 Germany (Bundeswehr)
4. **Login**: hans.mueller / Password123!
5. **Complete MFA**: Enter OTP
6. **Check JWT** (DevTools → Application → Cookies)

#### Expected JWT Payload:
```json
{
  "sub": "...",
  "uniqueID": "550e8400-e29b-41d4-a716-446655440203",
  "clearance": "GEHEIM",  ✅ German clearance preserved
  "clearanceOriginal": "GEHEIM",  ✅ NEW: Original tracking
  "countryOfAffiliation": "DEU",
  "acpCOI": ["NATO-COSMIC"],
  "acr": "urn:mace:incommon:iap:silver",  ✅ AAL2
  "amr": ["pwd", "otp"]  ✅ MFA verified
}
```

#### Backend Normalization:
```
GEHEIM (DEU) → SECRET
```

---

### Test 3: 🇮🇹 Italian User - SECRET Clearance (SEGRETO)

**User**: `marco.rossi` / `Password123!`  
**Expected Clearance**: SEGRETO (Italian) → SECRET (normalized)

#### Steps:

1. **Open**: http://localhost:3000
2. **Click**: 🇮🇹 Italy (Ministero della Difesa)
3. **Login**: marco.rossi / Password123!
4. **Check JWT**

#### Expected JWT:
```json
{
  "clearance": "SEGRETO",  ✅ Italian
  "clearanceOriginal": "SEGRETO",  ✅ Original
  "countryOfAffiliation": "ITA"
}
```

---

### Test 4: 🇳🇱 Dutch User - SECRET Clearance (GEHEIM)

**User**: `pieter.devries` / `Password123!`  
**Expected Clearance**: GEHEIM (Dutch) → SECRET (normalized)

#### Expected JWT:
```json
{
  "clearance": "GEHEIM",  ✅ Dutch (same word as German!)
  "clearanceOriginal": "GEHEIM",
  "countryOfAffiliation": "NLD"  ✅ Country distinguishes Dutch vs German
}
```

**Note**: Both Dutch and German use "GEHEIM" for SECRET, but `countryOfAffiliation` distinguishes them!

---

### Test 5: 🇵🇱 Polish User - SECRET Clearance (TAJNY)

**User**: `jan.kowalski` / `Password123!`  
**Expected Clearance**: TAJNY (Polish) → SECRET (normalized)

#### Expected JWT:
```json
{
  "clearance": "TAJNY",  ✅ Polish
  "clearanceOriginal": "TAJNY",
  "countryOfAffiliation": "POL"
}
```

---

### Test 6: 🇬🇧 UK User - CONFIDENTIAL Clearance (OFFICIAL-SENSITIVE)

**User**: `emma.jones` / `Password123!`  
**Expected Clearance**: OFFICIAL-SENSITIVE (UK) → CONFIDENTIAL (normalized)

#### Expected JWT:
```json
{
  "clearance": "OFFICIAL-SENSITIVE",  ✅ UK specific
  "clearanceOriginal": "OFFICIAL-SENSITIVE",
  "countryOfAffiliation": "GBR"
}
```

#### Backend Normalization:
```
OFFICIAL-SENSITIVE (GBR) → CONFIDENTIAL
```

---

### Test 7: 🇨🇦 Canadian User - CONFIDENTIAL Clearance (PROTECTED B)

**User**: `emily.tremblay` / `Password123!`  
**Expected Clearance**: PROTECTED B (Canadian) → CONFIDENTIAL (normalized)

#### Expected JWT:
```json
{
  "clearance": "PROTECTED B",  ✅ Canadian specific
  "clearanceOriginal": "PROTECTED B",
  "countryOfAffiliation": "CAN"
}
```

#### Backend Normalization:
```
PROTECTED B (CAN) → CONFIDENTIAL
```

---

### Test 8: 🏢 Industry User - SECRET Equivalent (SENSITIVE)

**User**: `bob.contractor` / `Password123!`  
**Expected Clearance**: SENSITIVE (Industry) → SECRET (normalized)

#### Expected JWT:
```json
{
  "clearance": "SENSITIVE",  ✅ Industry/commercial
  "clearanceOriginal": "SENSITIVE",
  "countryOfAffiliation": "USA"  ✅ Industry uses USA affiliation
}
```

#### Backend Normalization:
```
SENSITIVE (IND) → SECRET
```

---

### Test 9: 🇺🇸 US User - UNCLASSIFIED (No MFA)

**User**: `bob.contractor` (USA) / `Password123!`  
**Expected Clearance**: UNCLASSIFIED (standard, no normalization needed)  
**Expected AAL**: AAL1 (NO MFA required!)

#### Steps:

1. **Open**: http://localhost:3000
2. **Click**: 🇺🇸 United States (DoD)
3. **Login**: bob.contractor / Password123!
4. **Verify**: NO MFA prompt! (UNCLASSIFIED users skip MFA)
5. **Check JWT**

#### Expected JWT:
```json
{
  "clearance": "UNCLASSIFIED",  ✅ Standard English
  "clearanceOriginal": "UNCLASSIFIED",  ✅ Same (no normalization)
  "countryOfAffiliation": "USA",
  "acr": "urn:mace:incommon:iap:bronze",  ✅ AAL1 (password only)
  "amr": ["pwd"]  ✅ NO otp! (no MFA used)
}
```

**Key Difference**: Notice `acr` is `bronze` (AAL1) not `silver` (AAL2), and `amr` has only `["pwd"]` without `"otp"`!

---

### Test 10: 🇫🇷 French User - TOP SECRET (TRÈS SECRET DÉFENSE)

**User**: `sophie.general` / `Password123!`  
**Expected Clearance**: TRÈS SECRET DÉFENSE (French) → TOP_SECRET (normalized)

#### Expected JWT:
```json
{
  "clearance": "TRES SECRET DEFENSE",  ✅ French (accents might normalize)
  "clearanceOriginal": "TRES SECRET DEFENSE",
  "countryOfAffiliation": "FRA"
}
```

#### Backend Normalization:
```
TRÈS SECRET DÉFENSE (FRA) → TOP_SECRET
```

---

## 🔍 How to Verify clearanceOriginal in Keycloak Admin Console

### Manual Verification:

1. **Open Keycloak Admin**: http://localhost:8081/admin
2. **Login**: admin / admin
3. **Navigate to Realm**: 
   - Click realm dropdown (top-left)
   - Select **dive-v3-esp** (or any other realm)
4. **Go to Users**: Left sidebar → "Users"
5. **Click User**: e.g., `carlos.garcia`
6. **Scroll Down**: Find "Attributes" section
7. **Verify Attributes**:
   ```
   clearance: SECRETO
   clearanceOriginal: SECRETO  ← NEW ATTRIBUTE!
   countryOfAffiliation: ESP
   acpCOI: ["NATO-COSMIC"]
   dutyOrg: SPANISH_ARMY
   ```

8. **Repeat for Other Realms**:
   - **dive-v3-deu** → `hans.mueller` → clearanceOriginal: GEHEIM
   - **dive-v3-ita** → `marco.rossi` → clearanceOriginal: SEGRETO
   - **dive-v3-nld** → `pieter.devries` → clearanceOriginal: GEHEIM
   - **dive-v3-pol** → `jan.kowalski` → clearanceOriginal: TAJNY
   - **dive-v3-gbr** → `emma.jones` → clearanceOriginal: OFFICIAL-SENSITIVE
   - **dive-v3-can** → `emily.tremblay` → clearanceOriginal: PROTECTED B
   - **dive-v3-industry** → `bob.contractor` → clearanceOriginal: SENSITIVE

---

## 🧪 Testing AAL Attributes (Session-Based vs Hardcoded)

### Test: Verify AAL Attributes are Dynamic

#### Before the Fix (❌ WRONG):
User attributes in Keycloak had:
```
acr: "urn:mace:incommon:iap:silver"  ← HARDCODED!
amr: "[\"pwd\",\"otp\"]"            ← HARDCODED!
```

Problem: Even if user only used password, token still claimed MFA was used!

#### After the Fix (✅ CORRECT):
User attributes in Keycloak have:
```
clearance: SECRET
clearanceOriginal: SECRET
(NO acr or amr hardcoded!)
```

JWT token gets `acr`/`amr` from **Keycloak session**:
- If user used **password only** → `acr: bronze`, `amr: ["pwd"]`
- If user used **password + MFA** → `acr: silver`, `amr: ["pwd", "otp"]`

#### How to Verify:

1. **Login as UNCLASSIFIED user** (e.g., `bob.contractor` from USA)
2. **Skip MFA** (UNCLASSIFIED users don't need MFA)
3. **Check JWT**:
   ```json
   {
     "acr": "urn:mace:incommon:iap:bronze",  ← AAL1
     "amr": ["pwd"]  ← Only password, NO otp
   }
   ```

4. **Login as SECRET user** (e.g., `john.doe` from USA)
5. **Complete MFA** (SECRET requires MFA)
6. **Check JWT**:
   ```json
   {
     "acr": "urn:mace:incommon:iap:silver",  ← AAL2
     "amr": ["pwd", "otp"]  ← Password + MFA
   }
   ```

**Result**: AAL attributes now accurately reflect what authentication methods were ACTUALLY used!

---

## 📊 Complete Test Matrix

| Country | User | Clearance (Original) | Normalized To | MFA Required | AAL |
|---------|------|---------------------|---------------|--------------|-----|
| 🇪🇸 Spain | carlos.garcia | SECRETO | SECRET | Yes | AAL2 |
| 🇪🇸 Spain | isabel.general | ALTO SECRETO | TOP_SECRET | Yes | AAL2 |
| 🇫🇷 France | pierre.dubois | SECRET DEFENSE | SECRET | Yes | AAL2 |
| 🇫🇷 France | sophie.general | TRES SECRET DEFENSE | TOP_SECRET | Yes | AAL2 |
| 🇩🇪 Germany | hans.mueller | GEHEIM | SECRET | Yes | AAL2 |
| 🇩🇪 Germany | lisa.general | STRENG GEHEIM | TOP_SECRET | Yes | AAL2 |
| 🇮🇹 Italy | marco.rossi | SEGRETO | SECRET | Yes | AAL2 |
| 🇮🇹 Italy | elena.generale | SEGRETISSIMO | TOP_SECRET | Yes | AAL2 |
| 🇳🇱 Netherlands | pieter.devries | GEHEIM | SECRET | Yes | AAL2 |
| 🇳🇱 Netherlands | emma.general | ZEER GEHEIM | TOP_SECRET | Yes | AAL2 |
| 🇵🇱 Poland | jan.kowalski | TAJNY | SECRET | Yes | AAL2 |
| 🇵🇱 Poland | maria.general | ŚCIŚLE TAJNY | TOP_SECRET | Yes | AAL2 |
| 🇬🇧 UK | emma.jones | OFFICIAL-SENSITIVE | CONFIDENTIAL | Yes | AAL2 |
| 🇬🇧 UK | sophia.general | TOP SECRET | TOP_SECRET | Yes | AAL2 |
| 🇨🇦 Canada | emily.tremblay | PROTECTED B | CONFIDENTIAL | Yes | AAL2 |
| 🇨🇦 Canada | sarah.general | TOP SECRET | TOP_SECRET | Yes | AAL2 |
| 🏢 Industry | bob.contractor | SENSITIVE | SECRET | Yes | AAL2 |
| 🇺🇸 USA | bob.contractor | UNCLASSIFIED | UNCLASSIFIED | **NO** | **AAL1** |

---

## 🔬 Advanced Testing: Backend Normalization Service

### Test Backend Normalization Directly

Run this command to see normalization in action:

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend

# Start backend if not running
npm run dev

# In another terminal, test the service:
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "carlos.garcia",
    "password": "Password123!",
    "idpAlias": "esp-realm-broker"
  }' | jq .
```

### Check Backend Logs:

```bash
# Watch backend logs for normalization
tail -f /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend/logs/combined.log | grep "Clearance normalized"
```

Expected log output:
```json
{
  "timestamp": "2025-10-28T20:00:00.000Z",
  "level": "info",
  "message": "Clearance normalized via exact match",
  "original": "SECRETO",
  "normalized": "SECRET",
  "country": "ESP",
  "wasNormalized": true,
  "confidence": "exact"
}
```

---

## 🎨 Visual Comparison

### Before the Fix:
```
Spanish User Login
↓
JWT Token: { clearance: "SECRETO" }  ← Original value
                                      ← NO clearanceOriginal!
↓
Backend: Tries to normalize "SECRETO" 
         but original value is lost
↓
OPA Policy: Evaluates "SECRETO" (might fail if not normalized properly)
```

### After the Fix:
```
Spanish User Login
↓
JWT Token: { 
  clearance: "SECRETO",           ← Original preserved
  clearanceOriginal: "SECRETO"    ← ✅ NEW: Audit trail!
}
↓
Backend: normalizeClearance("SECRETO", "ESP")
         Returns: "SECRET"
         Logs: original="SECRETO", normalized="SECRET"
↓
OPA Policy: Evaluates normalized "SECRET" ✅
            Audit log has both values ✅
```

---

## 🚀 Quick Test Script

Save this as `test-clearance-normalization.sh`:

```bash
#!/usr/bin/env bash

echo "🧪 DIVE V3 - Clearance Normalization Test"
echo "=========================================="
echo ""

# Test countries
countries=("ESP" "DEU" "ITA" "NLD" "POL" "GBR" "CAN" "USA")
users=("carlos.garcia" "hans.mueller" "marco.rossi" "pieter.devries" "jan.kowalski" "emma.jones" "emily.tremblay" "bob.contractor")
clearances=("SECRETO" "GEHEIM" "SEGRETO" "GEHEIM" "TAJNY" "OFFICIAL-SENSITIVE" "PROTECTED B" "UNCLASSIFIED")

for i in "${!countries[@]}"; do
  country="${countries[$i]}"
  user="${users[$i]}"
  clearance="${clearances[$i]}"
  
  echo "Testing: $country - $user (clearance: $clearance)"
  echo "→ Navigate to http://localhost:3000"
  echo "→ Select country: $country"
  echo "→ Login: $user / Password123!"
  echo "→ Check JWT for clearanceOriginal: $clearance"
  echo ""
done

echo "✅ Test complete! Check JWT tokens in browser DevTools"
```

---

## 📝 Verification Checklist

### For Each Country Test:

- [ ] User successfully authenticates
- [ ] JWT token contains `clearance` field
- [ ] JWT token contains `clearanceOriginal` field  ← **NEW!**
- [ ] `clearanceOriginal` matches country-specific name
- [ ] `countryOfAffiliation` is correct (ISO 3166-1 alpha-3)
- [ ] CONFIDENTIAL+ users prompted for MFA
- [ ] UNCLASSIFIED users skip MFA
- [ ] JWT token contains `acr` from session
- [ ] JWT token contains `amr` from session
- [ ] AAL1 users have `acr: bronze`, `amr: ["pwd"]`
- [ ] AAL2 users have `acr: silver`, `amr: ["pwd", "otp"]`
- [ ] Backend logs show clearance normalization
- [ ] OPA policy evaluates normalized clearance

---

## 🎯 Success Criteria

### You'll know it's working when:

1. **Spanish users** have JWT tokens with `clearanceOriginal: "SECRETO"`
2. **German users** have `clearanceOriginal: "GEHEIM"`
3. **Italian users** have `clearanceOriginal: "SEGRETO"`
4. **Dutch users** have `clearanceOriginal: "GEHEIM"` + `countryOfAffiliation: "NLD"`
5. **Polish users** have `clearanceOriginal: "TAJNY"`
6. **UK users** have `clearanceOriginal: "OFFICIAL-SENSITIVE"`
7. **Canadian users** have `clearanceOriginal: "PROTECTED B"`
8. **Industry users** have `clearanceOriginal: "SENSITIVE"`
9. **UNCLASSIFIED users skip MFA** and have `amr: ["pwd"]` only
10. **CONFIDENTIAL+ users require MFA** and have `amr: ["pwd", "otp"]`

---

## 🔧 Troubleshooting

### Issue: Can't see clearanceOriginal in JWT

**Solution**:
1. Verify terraform was applied: `cd terraform && terraform state list | grep clearance_original`
2. Check protocol mapper exists: Keycloak Admin → Realm → Clients → dive-v3-broker-client → Client scopes → Mappers
3. Re-login to get fresh token

### Issue: AAL attributes still hardcoded

**Solution**:
1. Check user attributes in Keycloak: Should NOT have `acr` or `amr` as user attributes
2. Check broker realm client mappers: Should have `broker_acr_session` and `broker_amr_session`
3. Re-authenticate to trigger session-based mappers

### Issue: Backend not normalizing clearances

**Solution**:
1. Check backend logs: `tail -f backend/logs/combined.log | grep "Clearance"`
2. Verify backend service updated: `backend/src/services/clearance-normalization.service.ts`
3. Restart backend: `cd backend && npm run dev`

---

## 📚 Additional Resources

- **Completion Report**: `CRITICAL-CLEARANCE-AAL-FIX-COMPLETION.md`
- **Optional Steps**: `OPTIONAL-NEXT-STEPS-COMPLETE.md`
- **Backend Service**: `backend/src/services/clearance-normalization.service.ts`
- **OPA Tests**: `policies/clearance_normalization_test.rego`
- **CHANGELOG**: See entry `[2025-10-28-CLEARANCE-NORMALIZATION-AAL-FIX]`
- **README**: See "🌍 Clearance Normalization & AAL Attributes" section

---

**Happy Testing! 🎉**

You now have clearance normalization working across 10 countries with full audit trail!

