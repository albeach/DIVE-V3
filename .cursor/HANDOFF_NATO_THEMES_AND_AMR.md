# DIVE V3 - NATO Themes & ACR/AMR Federation Fix
## Handoff Prompt for New Chat Session

---

## 🎯 EXECUTIVE SUMMARY

**Project**: DIVE V3 - Coalition-friendly ICAM with federated identity across NATO partners  
**Current Status**: Hub + 2 Spokes deployed (NZL working, HRV partially working)  
**Session Date**: January 3, 2026

### Immediate Issues Requiring Resolution

| Priority | Issue | Impact |
|----------|-------|--------|
| **P0** | HRV Spoke AMR/ACR not propagating correctly for federated users | USA→HRV shows `amr: ["pwd"]` instead of `["pwd", "otp"]`, `acr: "0"` instead of proper level |
| **P1** | Keycloak theme locales missing for most NATO countries | HRV and others only have `messages_en.properties`, no native translations |
| **P2** | Frontend flag mappings incomplete | Some components use inline `countryFlags` objects, not centralized |

### Critical Constraint
**ALL SOLUTIONS MUST USE `./dive` (DIVE CLI) COMMANDS ONLY - NO DIRECT DOCKER COMMANDS**

---

## 📋 BACKGROUND CONTEXT

### What Was Accomplished Before This Session

1. **Hub-Spoke Architecture Deployed**:
   - USA Hub (localhost:3000/8080/8443)
   - NZL Spoke (localhost:3033/8476) - ✅ Fully working bidirectional federation
   - HRV Spoke (localhost:3005/8448) - ⚠️ Partially working

2. **Federation Fixes Applied**:
   - GCP Secret Manager as SSOT for federation client secrets (`dive-v3-federation-{spoke}-usa`)
   - Fixed port allocation SSOT in `scripts/dive-modules/common.sh`
   - Fixed `countryFlags` in dashboard components to include all 32 NATO countries

3. **NZL ACR/AMR Working** (documented in `HANDOFF_ACR_AMR_COMPLETE_FIX.md`):
   - Uses `oidc-usermodel-attribute-mapper` with `jsonType.label: "String"` 
   - NOT native `oidc-amr-mapper` (which reads from empty session notes for federated users)
   - IdP mappers import AMR from source token → user.attribute.amr
   - Protocol mappers output user.attribute.amr → amr claim

### Why HRV Is Broken

The HRV spoke was deployed AFTER the NZL fixes but the USA Hub's `dive-v3-broker-hrv` client:
1. Had a duplicate native `oidc-amr-mapper` that was manually deleted
2. The federated user `testuser-usa-2` in HRV Keycloak was missing AMR/ACR attributes
3. Manual fixes were applied but not baked into CLI properly

### Key Architecture for ACR/AMR Federation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SOURCE REALM (USA Hub)                                                       │
│                                                                              │
│ User authenticates with: password + OTP                                     │
│ Session notes: AUTH_METHODS_REF = ["pwd", "otp"], ACR = "2"                │
│                                                                              │
│ ┌────────────────────────────────────────────────────────────────────────┐  │
│ │ dive-v3-broker-hrv Client (federation client for HRV)                  │  │
│ │                                                                        │  │
│ │ Protocol Mappers (MUST HAVE):                                          │  │
│ │ • federation-std-amr: user.attribute.amr → amr (multivalued=true)     │  │
│ │ • federation-std-acr: user.attribute.acr → acr                        │  │
│ │ • federation-acr (native): oidc-acr-mapper → acr (from session)        │  │
│ │                                                                        │  │
│ │ MUST NOT HAVE:                                                         │  │
│ │ • federation-amr (native): oidc-amr-mapper → amr (reads empty!)       │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│ Token to HRV: { amr: ["pwd", "otp"], acr: "2", ...attributes }              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TARGET REALM (HRV Spoke)                                                     │
│                                                                              │
│ ┌────────────────────────────────────────────────────────────────────────┐  │
│ │ usa-idp (Identity Provider)                                            │  │
│ │                                                                        │  │
│ │ IdP Attribute Mappers (MUST HAVE):                                     │  │
│ │ • import-amr: claim.amr → user.attribute.amr (syncMode=FORCE)         │  │
│ │ • import-acr: claim.acr → user.attribute.acr (syncMode=FORCE)         │  │
│ │ • import-clearance, countryOfAffiliation, uniqueID, acpCOI            │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│ User in HRV: testuser-usa-2                                                 │
│ User attributes: { amr: ["pwd", "otp"], acr: "2", clearance: "..." }       │
│                                                                              │
│ ┌────────────────────────────────────────────────────────────────────────┐  │
│ │ dive-v3-broker-hrv Client (main frontend client)                       │  │
│ │                                                                        │  │
│ │ Protocol Mappers:                                                      │  │
│ │ • amr (user attribute): user.attribute.amr → amr claim                │  │
│ │ • acr (native): oidc-acr-mapper → acr (for local auth)                │  │
│ │ • acr_from_idp: user.attribute.acr → user_acr (fallback)              │  │
│ │ • amr_from_idp: user.attribute.amr → user_amr (fallback)              │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│ Token to Frontend: { amr: ["pwd", "otp"], acr: "2", user_amr, user_acr }   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 PROJECT DIRECTORY STRUCTURE

```
/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/
├── dive                          # DIVE CLI entry point (USE THIS!)
├── scripts/
│   ├── dive-modules/
│   │   ├── common.sh            # ✅ SSOT for port allocation
│   │   ├── spoke.sh             # Spoke management (deploy, fix-mappers, etc.)
│   │   ├── spoke-init.sh        # Generates docker-compose, .env, certs
│   │   ├── spoke-deploy.sh      # Full deployment workflow
│   │   ├── federation-setup.sh  # ✅ SSOT for federation (GCP secrets)
│   │   ├── spoke-verification.sh # Verifies spoke health
│   │   └── hub.sh               # Hub management
│   ├── nato-countries.sh        # ✅ SSOT for NATO metadata (32 countries)
│   ├── generate-spoke-theme.sh  # Generates Keycloak themes (NEEDS LOCALE FIX)
│   └── fix-federation-issues.sh # Manual federation repairs
├── keycloak/
│   └── themes/
│       ├── dive-v3/             # Base theme
│       ├── dive-v3-usa/         # Hub theme
│       ├── dive-v3-nzl/         # NZL theme (messages_en.properties only)
│       ├── dive-v3-hrv/         # HRV theme (messages_en.properties only)
│       └── dive-v3-deu/         # DEU theme (has messages_de.properties!)
├── terraform/
│   └── modules/
│       └── federated-instance/
│           ├── main.tf          # Realm, main client
│           ├── acr-amr-session-mappers.tf  # ✅ VERIFIED CORRECT
│           └── idp-brokers.tf   # IdP and IdP mappers
├── frontend/
│   └── src/
│       ├── components/
│       │   └── dashboard/
│       │       ├── dashboard-modern.tsx      # ✅ FIXED countryFlags
│       │       └── dashboard-federation.tsx  # ✅ FIXED countryFlags
│       └── i18n/
│           └── config.ts        # Supported frontend locales
├── backend/
│   └── src/
│       └── scripts/
│           └── seed-instance-resources.ts  # ZTDF resource seeder
├── instances/
│   ├── hrv/                     # HRV spoke instance files
│   │   ├── docker-compose.yml
│   │   └── .env
│   └── nzl/                     # NZL spoke instance files
├── .env.hub                     # Hub environment variables
├── HANDOFF_ACR_AMR_COMPLETE_FIX.md  # Previous ACR/AMR documentation
└── docs/
    └── ACR_AMR_SSOT_FIX.md      # ACR/AMR architecture doc
```

---

## 🔍 GAP ANALYSIS

### 1. ACR/AMR Propagation for Federated Users

| Spoke | Direction | Status | Issue |
|-------|-----------|--------|-------|
| NZL | USA→NZL | ✅ Working | - |
| NZL | NZL→USA | ✅ Working | - |
| HRV | USA→HRV | ❌ Broken | AMR showing `["pwd"]`, ACR showing `"0"` |
| HRV | HRV→USA | ⚠️ Untested | Likely broken |

**Root Cause Analysis for HRV**:
1. The `usa-idp` in HRV has correct IdP mappers (confirmed)
2. The USA Hub's `dive-v3-broker-hrv` client WAS missing correct mappers
3. Native `oidc-amr-mapper` was manually deleted but user attributes not synced
4. Federation deployed via CLI but manual fixes weren't baked in

### 2. Keycloak Theme Locales

| Country | Theme Dir | messages_en | Native Locale | Status |
|---------|-----------|-------------|---------------|--------|
| USA | dive-v3-usa | ✅ | N/A (English) | ✅ Complete |
| DEU | dive-v3-deu | ✅ | messages_de.properties | ✅ Complete |
| HRV | dive-v3-hrv | ✅ | ❌ Missing messages_hr | ⚠️ Partial |
| NZL | dive-v3-nzl | ✅ | N/A (English) | ✅ Complete |
| Other | TBD | - | - | ❌ Not generated |

**Root Cause**: `scripts/generate-spoke-theme.sh` only copies `messages_en.properties`, doesn't generate native locale files.

### 3. Frontend Localization

| Component | Status | Issue |
|-----------|--------|-------|
| `frontend/src/i18n/config.ts` | ⚠️ Partial | Only 6 locales defined |
| Flag components | ⚠️ Partial | `getFlagComponent` uses svg-country-flags |
| Dashboard countryFlags | ✅ Fixed | Now has all 32 NATO + 4 partners |

---

## 📋 PHASED IMPLEMENTATION PLAN

### Phase 1: Fix HRV ACR/AMR (P0 - IMMEDIATE)

**Goal**: Restore correct AMR/ACR propagation for USA→HRV federation

**SMART Criteria**:
- **Specific**: Fix USA Hub's `dive-v3-broker-hrv` protocol mappers and sync HRV user attributes
- **Measurable**: `testuser-usa-2` login via USA IdP shows `amr: ["pwd", "otp"]`, `acr: "2"` in session
- **Achievable**: Follow exact pattern from NZL fix
- **Relevant**: Federation is core DIVE V3 functionality
- **Time-bound**: 1 hour

**Steps**:
```bash
# 1. Verify current state
./dive federation verify HRV

# 2. Fix mappers (should use existing fix-mappers command)
./dive --instance HRV spoke fix-mappers

# 3. Sync user attributes from USA Hub
./dive federation sync-attributes HRV

# 4. Restart HRV frontend
./dive --instance HRV spoke restart frontend

# 5. Test login
# Browser: https://localhost:3005 → USA IdP → testuser-usa-2 with OTP
```

**Success Criteria**:
- [ ] Session shows `amr: ["pwd", "otp"]`
- [ ] Session shows `acr: "2"` (or appropriate level)
- [ ] `./dive federation verify HRV` passes all checks

### Phase 2: Standardize NATO Theme Locales (P1 - HIGH)

**Goal**: All NATO country themes have correct locale files

**SMART Criteria**:
- **Specific**: Update `generate-spoke-theme.sh` to generate `messages_{locale}.properties` for each country
- **Measurable**: 32 themes with correct locale files
- **Achievable**: Extend existing SSOT pattern from `nato-countries.sh`
- **Relevant**: User experience for international pilots
- **Time-bound**: 2 hours

**Implementation**:

1. **Extend `nato-countries.sh`** with locale codes:
```bash
# Format: "Full Name|Flag|Primary|Secondary|Timezone|JoinYear|LocaleCode"
["HRV"]="Croatia|🇭🇷|#FF0000|#171796|Europe/Zagreb|2009|hr"
["DEU"]="Germany|🇩🇪|#000000|#DD0000|Europe/Berlin|1955|de"
["FRA"]="France|🇫🇷|#002395|#ED2939|Europe/Paris|1949|fr"
```

2. **Update `generate-spoke-theme.sh`**:
```bash
generate_locale_messages() {
    local code="$1"
    local locale=$(get_country_locale "$code")  # e.g., "hr" for HRV
    local theme_dir="$THEMES_DIR/dive-v3-${code,,}/login/messages"
    
    # Copy base English messages
    cp "$BASE_THEME/messages_en.properties" "$theme_dir/"
    
    # Generate locale-specific file if not English
    if [[ "$locale" != "en" ]]; then
        # Either copy from existing translations OR generate stub
        if [[ -f "$TRANSLATIONS_DIR/messages_${locale}.properties" ]]; then
            cp "$TRANSLATIONS_DIR/messages_${locale}.properties" "$theme_dir/"
        else
            generate_locale_stub "$theme_dir" "$locale"
        fi
    fi
    
    # Update theme.properties with correct locales
    sed -i.bak "s/locales=en/locales=en,${locale}/" "$theme_dir/../theme.properties"
}
```

3. **Create translation stubs** in `keycloak/themes/translations/`:
   - Croatian: `messages_hr.properties`
   - French: `messages_fr.properties`
   - German: `messages_de.properties` (already exists in dive-v3-deu)
   - etc.

**Success Criteria**:
- [ ] `./scripts/generate-spoke-theme.sh --all` generates themes for all 32 countries
- [ ] Each theme has `messages_{locale}.properties` if non-English
- [ ] `theme.properties` includes correct `locales=` setting
- [ ] Keycloak displays login page in correct language

### Phase 3: Bake Fixes Into DIVE CLI (P1 - HIGH)

**Goal**: All manual fixes from this session are automated in CLI

**SMART Criteria**:
- **Specific**: Add/update CLI commands for AMR/ACR and theme management
- **Measurable**: `./dive spoke deploy` handles everything automatically
- **Achievable**: Extend existing modular architecture
- **Relevant**: Prevents regression on future spoke deployments
- **Time-bound**: 2 hours

**New/Updated Commands**:
```bash
# Already exists - ensure it handles AMR properly
./dive --instance HRV spoke fix-mappers

# New command - regenerate theme with locale
./dive --instance HRV spoke regenerate-theme

# New command - verify all mappers (both protocol and IdP)
./dive --instance HRV spoke verify-mappers

# Ensure deploy workflow includes all fixes
./dive --instance HRV spoke deploy  # Should auto-fix everything
```

**Success Criteria**:
- [ ] Fresh spoke deployment has correct ACR/AMR from start
- [ ] Theme generation includes locale files
- [ ] Verification commands catch missing mappers

### Phase 4: Full Test Suite (P2 - MEDIUM)

**Goal**: Automated tests for federation and themes

**SMART Criteria**:
- **Specific**: Create shell/TypeScript test scripts
- **Measurable**: 100% pass rate for all NATO countries
- **Achievable**: Use existing DIVE CLI infrastructure
- **Relevant**: Prevents regressions
- **Time-bound**: 3 hours

**Test Cases**:
```bash
# tests/federation-acr-amr.sh
test_federated_amr() {
    local spoke=$1
    local result=$(./dive federation test-login $spoke testuser-usa-2)
    assert_contains "$result" "amr.*pwd.*otp"
    assert_contains "$result" "acr.*2"
}

# tests/theme-locales.sh
test_theme_locale() {
    local country=$1
    local locale=$(get_country_locale $country)
    local theme_dir="keycloak/themes/dive-v3-${country,,}/login/messages"
    assert_file_exists "$theme_dir/messages_${locale}.properties"
}
```

**Success Criteria**:
- [ ] `./dive test federation` passes for all deployed spokes
- [ ] `./dive test themes` passes for all generated themes
- [ ] CI/CD pipeline runs tests automatically

---

## ⚠️ DEFERRED ACTIONS / NEXT STEPS

1. **Immediate** (This Session):
   - [ ] Fix HRV AMR/ACR using CLI only
   - [ ] Update `nato-countries.sh` with locale codes
   - [ ] Update `generate-spoke-theme.sh` for locale support

2. **Short-term** (Next Session):
   - [ ] Generate themes for all 32 NATO countries
   - [ ] Create translation stub files for major languages
   - [ ] Add test suite for federation/themes

3. **Medium-term**:
   - [ ] Professional translations for key languages (FR, DE, ES, IT)
   - [ ] Frontend i18n expansion to match Keycloak locales
   - [ ] Performance testing with all 32 spokes

---

## 🧹 CLEAN SLATE TESTING

**Authorization**: All data/users are DUMMY/FAKE - authorized to nuke Docker resources.

```bash
# Full reset for HRV spoke
./dive --instance HRV spoke destroy
./dive --instance HRV spoke deploy

# Verify from scratch
./dive --instance HRV spoke verify
./dive federation verify HRV

# Test login flows
# 1. HRV local: https://localhost:3005 → "Login as Croatia User"
# 2. USA→HRV: https://localhost:3005 → "United States" → testuser-usa-2
# 3. HRV→USA: https://localhost:3000 → "Croatia" → testuser-hrv-2
```

---

## 📚 KEY REFERENCE FILES

| Purpose | File |
|---------|------|
| ACR/AMR Architecture | `HANDOFF_ACR_AMR_COMPLETE_FIX.md` |
| NATO Country Database | `scripts/nato-countries.sh` |
| Theme Generator | `scripts/generate-spoke-theme.sh` |
| Terraform AMR/ACR Mappers | `terraform/modules/federated-instance/acr-amr-session-mappers.tf` |
| Federation Setup | `scripts/dive-modules/federation-setup.sh` |
| Port Allocation SSOT | `scripts/dive-modules/common.sh` |

---

## 🚀 COPY THIS PROMPT TO NEW CHAT

```
I need help completing DIVE V3 federation fixes. Read the following handoff document carefully:

@HANDOFF_NATO_THEMES_AND_AMR.md

Your tasks in priority order:

1. **P0**: Fix HRV Spoke AMR/ACR propagation for USA→HRV federation
   - Session currently shows amr: ["pwd"], acr: "0" 
   - Should show amr: ["pwd", "otp"], acr: "2"
   - Follow the exact pattern from NZL (documented in @HANDOFF_ACR_AMR_COMPLETE_FIX.md)

2. **P1**: Standardize NATO theme locales
   - Update @scripts/nato-countries.sh with locale codes
   - Update @scripts/generate-spoke-theme.sh to generate locale-specific messages
   - Generate themes for all 32 NATO countries

3. **P1**: Bake all fixes into @dive (DIVE CLI)
   - No manual Keycloak API calls
   - No direct docker commands
   - Everything through ./dive commands

CRITICAL CONSTRAINTS:
- ONLY use ./dive (DIVE CLI) commands
- NO direct docker commands
- All solutions must be resilient, persistent, and baked into CLI
- Refer to @scripts/dive-modules/ for existing patterns
- Test with clean slate: ./dive --instance HRV spoke destroy && ./dive --instance HRV spoke deploy

Success criteria:
- ./dive federation verify HRV passes all checks
- testuser-usa-2 login shows correct AMR/ACR
- HRV theme has messages_hr.properties
- All fixes work on fresh spoke deploy
```

---

*Generated: January 3, 2026*
*Previous Session: Fixed GCP secrets, country flags, reverted Terraform regression*
