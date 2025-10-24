# MFA/OTP Enhancement & Multi-Realm Expansion - Handoff Prompt

## Context & Background

You are continuing work on the **DIVE V3 Coalition-Friendly ICAM Pilot**, a 4-week federated identity management demonstration for USA/NATO partners. The system implements **Attribute-Based Access Control (ABAC)** with **policy-driven Multi-Factor Authentication (MFA)** enforcement.

**Current Status**: MFA/OTP implementation is COMPLETE and TESTED for the `dive-v3-broker` realm. However, it needs to be:
1. Extended to all other realms (USA, France, Canada, Industry)
2. Enhanced with comprehensive testing (unit + E2E)
3. Improved for scalability and maintainability
4. Fully documented and committed to GitHub with passing CI/CD

---

## Project Overview

### Tech Stack
- **Frontend**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Express.js, Node.js 20, TypeScript
- **Auth/IdP**: Keycloak 24+ (OIDC/SAML broker)
- **Policy Engine**: Open Policy Agent (OPA) v0.68+, Rego
- **Database**: MongoDB (resource metadata), PostgreSQL (Keycloak)
- **Infrastructure**: Docker Compose, Terraform (IaC)
- **Testing**: Jest (unit), Playwright (E2E)

### Architecture Pattern
```
User → Next.js UI → Backend API (PEP) → Keycloak (IdP) ← Terraform (IaC)
                        ↓
                    OPA (PDP) - ABAC policies
                        ↓
                    MongoDB - Resource metadata
```

### Current MFA Implementation (Broker Realm Only)

**Policy**: MFA required when `clearance ∈ {CONFIDENTIAL, SECRET, TOP_SECRET}`

**Flow**:
1. User logs in with username/password
2. Backend checks clearance via Keycloak Admin API
3. If MFA required but not configured → OTP setup flow
4. User scans QR code with authenticator app (Google Authenticator, Authy, etc.)
5. User enters 6-digit TOTP code
6. Backend verifies OTP using `speakeasy` library
7. TOTP secret stored in Keycloak user attributes
8. User re-authenticates with username + password + OTP
9. Session created, redirect to dashboard

**Key Files Implemented**:
- `backend/src/controllers/custom-login.controller.ts` (authentication orchestration)
- `backend/src/controllers/otp-setup.controller.ts` (TOTP generation/verification)
- `frontend/src/app/login/[idpAlias]/page.tsx` (custom login UI with OTP setup)
- `terraform/broker-realm.tf` (Keycloak MFA configuration)
- `terraform/keycloak-mfa-flows.tf` (Direct Grant flow with conditional OTP)

**UX Enhancements Completed**:
- ✅ React QR code component (`qrcode.react`)
- ✅ Shake animation on invalid OTP (CSS keyframes)
- ✅ Empty OTP validation (button disabled)
- ✅ Error message positioning (near input)
- ✅ Contextual help tips (after 2+ attempts)
- ✅ Remaining attempts warning (parsed from errors)
- ✅ Custom QR labels ("DIVE ICAM (God Mode)" for admin)
- ✅ Relaxed brute force (8 attempts vs 3)

---

## Your Mission: Four Critical Tasks

### Task 1: Generate Extensive Documentation ✅ (PARTIALLY COMPLETE)

**What's Done**:
- ✅ Created `docs/MFA-OTP-IMPLEMENTATION.md` (comprehensive technical documentation)

**What's Still Needed**:
1. **API Documentation**: Generate OpenAPI/Swagger spec for auth endpoints
   - Document `/api/auth/custom-login`, `/api/auth/otp/setup`, `/api/auth/otp/verify`
   - Include request/response schemas, error codes, rate limits
   - Generate from TypeScript interfaces using `tsoa` or similar

2. **User Guide**: Create end-user documentation
   - How to set up MFA (with screenshots)
   - Troubleshooting common issues
   - Recovery procedures

3. **Admin Guide**: Document administrative procedures
   - How to force MFA reset for a user
   - How to adjust brute force settings
   - How to monitor MFA adoption rates

4. **Architecture Decision Records (ADRs)**:
   - ADR-001: Why use Keycloak Direct Grant instead of Authorization Code flow?
   - ADR-002: Why store TOTP secrets in user attributes vs credentials API?
   - ADR-003: Why implement custom login form instead of Keycloak's UI?

**Deliverables**:
- [ ] `docs/api/auth-endpoints-openapi.yaml`
- [ ] `docs/user-guides/MFA-SETUP-GUIDE.md`
- [ ] `docs/admin-guides/MFA-ADMINISTRATION.md`
- [ ] `docs/adr/` directory with ADR files

---

### Task 2: Create Extensive Unit Tests & E2E Testing Logic

**Current State**: NO TESTS EXIST (critical gap!)

**Required Test Coverage**:

#### 2.1 Backend Unit Tests (Jest)

**File**: `backend/src/__tests__/custom-login.controller.test.ts`

Test categories:
1. **Rate Limiting** (5 tests):
   - ✅ Allow 8 login attempts
   - ✅ Block 9th attempt within 15-minute window
   - ✅ Reset after window expires
   - ✅ Track attempts per username + IP (not just IP)
   - ✅ Handle concurrent requests safely

2. **MFA Enforcement** (8 tests):
   - ✅ Require MFA for CONFIDENTIAL clearance
   - ✅ Require MFA for SECRET clearance
   - ✅ Require MFA for TOP_SECRET clearance
   - ✅ NOT require MFA for UNCLASSIFIED
   - ✅ Detect missing OTP configuration (check `totp_configured` attribute)
   - ✅ Detect existing OTP configuration (user.totp || totp_configured)
   - ✅ Return `mfaSetupRequired: true` when needed
   - ✅ Accept OTP parameter in Direct Grant request

3. **Error Handling** (6 tests):
   - ✅ Return generic error for invalid credentials (prevent account enumeration)
   - ✅ Handle Keycloak connection failures gracefully
   - ✅ Handle Admin API failures (fallback to allow login)
   - ✅ Validate required fields (idpAlias, username, password)
   - ✅ Handle malformed OTP (non-numeric, wrong length)
   - ✅ Log security events (all auth failures, MFA denials)

4. **Keycloak Integration** (4 tests):
   - ✅ Successfully authenticate with valid credentials
   - ✅ Include TOTP parameter when OTP provided
   - ✅ Parse access token and refresh token
   - ✅ Query Keycloak Admin API for user attributes

**File**: `backend/src/__tests__/otp-setup.controller.test.ts`

Test categories:
1. **Secret Generation** (5 tests):
   - ✅ Generate valid Base32 secret (regex `/^[A-Z2-7]+$/`)
   - ✅ Create scannable `otpauth://` URL
   - ✅ Include issuer "DIVE ICAM"
   - ✅ Customize label for admin-dive ("God Mode")
   - ✅ Use default label (username) for others

2. **OTP Verification** (7 tests):
   - ✅ Verify valid OTP within time window
   - ✅ Reject expired OTP codes (> 60 seconds old)
   - ✅ Apply ±1 step tolerance (90-second acceptance window)
   - ✅ Reject OTP with wrong secret
   - ✅ Reject non-numeric OTP
   - ✅ Reject OTP with wrong length (<6 or >6 digits)
   - ✅ Handle concurrent OTP verifications

3. **Keycloak Integration** (6 tests):
   - ✅ Store secret in user attributes (`totp_secret`)
   - ✅ Set `totp_configured` flag to "true"
   - ✅ Set `user.totp` to `true`
   - ✅ Remove `CONFIGURE_TOTP` required action
   - ✅ Handle Keycloak Admin API errors gracefully
   - ✅ Validate user exists before storing secret

4. **Security** (4 tests):
   - ✅ Require valid credentials before initiating setup
   - ✅ Validate OTP before storing secret
   - ✅ Log all OTP setup attempts (success/failure)
   - ✅ Rate limit OTP setup endpoint (prevent abuse)

**Total Backend Tests**: ~35 unit tests

---

#### 2.2 Frontend Unit Tests (React Testing Library + Jest)

**File**: `frontend/src/__tests__/login-otp-flow.test.tsx`

Test categories:
1. **UI Rendering** (8 tests):
   - ✅ Display username/password fields initially
   - ✅ Show OTP setup UI when `mfaSetupRequired`
   - ✅ Display QR code using `QRCodeSVG` component
   - ✅ Show manual entry (collapsible details)
   - ✅ Display 6-digit OTP input with placeholder "000000"
   - ✅ Show "Verify & Complete Setup" button
   - ✅ Hide username/password during OTP setup
   - ✅ Show "Cancel" button during OTP setup

2. **Input Validation** (6 tests):
   - ✅ Disable button when OTP field is empty
   - ✅ Disable button when OTP < 6 digits
   - ✅ Enable button when OTP = 6 digits
   - ✅ Strip non-numeric characters from OTP input
   - ✅ Limit OTP input to 6 characters max
   - ✅ Auto-focus OTP input on render

3. **Error Handling** (8 tests):
   - ✅ Apply `animate-shake` class on error
   - ✅ Display error message near OTP input
   - ✅ Clear OTP input after invalid submission
   - ✅ Show contextual help after 2+ attempts
   - ✅ Display remaining attempts warning
   - ✅ Parse attempt count from error message
   - ✅ Persist QR code on invalid OTP (don't regenerate)
   - ✅ Show generic error for network failures

4. **API Integration** (6 tests):
   - ✅ Call `/api/auth/custom-login` with credentials
   - ✅ Call `/api/auth/otp/setup` when `mfaSetupRequired`
   - ✅ Call `/api/auth/otp/verify` with OTP
   - ✅ Call `/api/auth/custom-session` after successful auth
   - ✅ Include OTP in re-authentication request
   - ✅ Handle 429 (rate limit) responses

5. **User Flow** (5 tests):
   - ✅ Complete login flow (no MFA)
   - ✅ Complete OTP setup flow (new user)
   - ✅ Complete OTP login flow (returning user)
   - ✅ Cancel OTP setup (return to login)
   - ✅ Back button from MFA prompt

**Total Frontend Tests**: ~33 unit tests

---

#### 2.3 E2E Tests (Playwright)

**File**: `frontend/e2e/mfa-complete-flow.spec.ts`

Test scenarios:
1. **Happy Path - New User OTP Setup** (1 test):
   ```typescript
   test('complete OTP setup and login for TOP_SECRET user', async ({ page }) => {
       // 1. Navigate to login
       // 2. Enter admin-dive credentials
       // 3. Verify OTP setup screen appears
       // 4. Extract secret from manual entry
       // 5. Generate valid OTP using speakeasy
       // 6. Submit OTP
       // 7. Verify redirect to dashboard
       // 8. Check session is created
   });
   ```

2. **Happy Path - Returning User with MFA** (1 test):
   ```typescript
   test('login with existing OTP for TOP_SECRET user', async ({ page }) => {
       // Assumes user already has OTP configured
       // 1. Enter credentials
       // 2. Get prompted for OTP (not setup)
       // 3. Enter valid OTP
       // 4. Verify successful login
   });
   ```

3. **Happy Path - UNCLASSIFIED User (No MFA)** (1 test):
   ```typescript
   test('login without MFA for UNCLASSIFIED user', async ({ page }) => {
       // 1. Login as UNCLASSIFIED user
       // 2. Verify NO OTP prompt
       // 3. Verify direct redirect to dashboard
   });
   ```

4. **Error Handling - Invalid OTP** (1 test):
   ```typescript
   test('handle invalid OTP with shake animation', async ({ page }) => {
       // 1. Complete setup flow up to OTP entry
       // 2. Enter invalid OTP
       // 3. Verify shake animation applied
       // 4. Verify error message displayed
       // 5. Verify OTP input cleared
       // 6. Verify QR code persists
   });
   ```

5. **Error Handling - Empty OTP** (1 test):
   ```typescript
   test('prevent empty OTP submission', async ({ page }) => {
       // 1. Reach OTP input screen
       // 2. Click "Verify" without entering OTP
       // 3. Verify button remains disabled
       // 4. Verify no API call made
   });
   ```

6. **Error Handling - Rate Limiting** (1 test):
   ```typescript
   test('enforce rate limiting at 8 attempts', async ({ page }) => {
       // 1. Make 8 failed login attempts
       // 2. Verify 9th attempt blocked
       // 3. Verify lockout message displayed
       // 4. Wait 15 minutes (or mock time)
       // 5. Verify can login again
   });
   ```

7. **UX - Remaining Attempts Warning** (1 test):
   ```typescript
   test('display remaining attempts warning', async ({ page }) => {
       // 1. Make 6 failed attempts
       // 2. Verify "2 attempts remaining" shown
       // 3. Make 1 more attempt
       // 4. Verify "1 attempt remaining" shown
   });
   ```

8. **UX - Contextual Help** (1 test):
   ```typescript
   test('show contextual help after 2 failed OTP attempts', async ({ page }) => {
       // 1. Enter invalid OTP twice
       // 2. Verify help tip appears
       // 3. Verify tip mentions 30-second refresh
   });
   ```

9. **Accessibility** (1 test):
   ```typescript
   test('keyboard navigation and screen reader support', async ({ page }) => {
       // 1. Tab through form fields
       // 2. Verify focus order correct
       // 3. Verify ARIA labels present
       // 4. Verify error announcements
   });
   ```

10. **Performance** (2 tests):
    ```typescript
    test('OTP setup completes within 3 seconds', async ({ page }) => {
        // Measure time from login to QR display
    });

    test('OTP verification responds within 1 second', async ({ page }) => {
        // Measure time from submit to response
    });
    ```

**Total E2E Tests**: ~11 end-to-end scenarios

---

**Test Coverage Goals**:
- Backend: **≥80%** code coverage
- Frontend: **≥75%** code coverage
- E2E: **100%** of critical user paths

**Deliverables**:
- [ ] `backend/src/__tests__/custom-login.controller.test.ts` (~500 lines)
- [ ] `backend/src/__tests__/otp-setup.controller.test.ts` (~400 lines)
- [ ] `frontend/src/__tests__/login-otp-flow.test.tsx` (~600 lines)
- [ ] `frontend/e2e/mfa-complete-flow.spec.ts` (~400 lines)
- [ ] CI/CD integration (`.github/workflows/test.yml`)

---

### Task 3: Extend MFA Logic Globally to All Realms

**Problem**: MFA currently only implemented for `dive-v3-broker` realm. Need to extend to:
- ✅ `dive-v3-broker` (DONE)
- ❌ `dive-v3-usa` (TODO)
- ❌ `dive-v3-fra` (TODO)
- ❌ `dive-v3-can` (TODO)
- ❌ `dive-v3-industry` (TODO)

**Challenge**: Each realm may have different:
- Attribute names (e.g., French SAML uses URN-style attribute names)
- Clearance mappings (e.g., `CONFIDENTIEL_DEFENSE` → `CONFIDENTIAL`)
- IdP configurations (OIDC vs SAML)

**Requirements**:

#### 3.1 Terraform - Replicate MFA Configuration

**Current** (`terraform/broker-realm.tf`):
```hcl
# OTP Policy
otp_policy {
  digits    = 6
  period    = 30
  type      = "totp"
  algorithm = "HmacSHA1"
  look_ahead_window = 1
}

# Brute Force
security_defenses {
  brute_force_detection {
    max_login_failures         = 8
    wait_increment_seconds     = 60
    max_failure_wait_seconds   = 300
    failure_reset_time_seconds = 3600
  }
}
```

**Needed**: Apply same to `usa-realm.tf`, `fra-realm.tf`, `can-realm.tf`, `industry-realm.tf`

**Action**:
1. Extract OTP policy into a Terraform module (`modules/realm-mfa/`)
2. Apply module to all realm definitions
3. Create Direct Grant flow for each realm
4. Bind Direct Grant flow to realm authentication bindings

**File Structure**:
```
terraform/
├── modules/
│   └── realm-mfa/
│       ├── main.tf          # OTP policy + brute force
│       ├── direct-grant.tf  # Direct Grant flow
│       ├── variables.tf     # Realm-specific inputs
│       └── outputs.tf       # Flow IDs
├── broker-realm.tf          # Use module
├── usa-realm.tf             # Use module
├── fra-realm.tf             # Use module
├── can-realm.tf             # Use module
└── industry-realm.tf        # Use module
```

**Example Module Usage**:
```hcl
# usa-realm.tf
module "usa_mfa" {
  source = "./modules/realm-mfa"

  realm_id   = keycloak_realm.dive_v3_usa.id
  realm_name = "dive-v3-usa"
  
  # Realm-specific overrides
  max_login_failures = 8
  totp_period        = 30
}

resource "keycloak_authentication_bindings" "usa_bindings" {
  realm_id         = keycloak_realm.dive_v3_usa.id
  direct_grant_flow = module.usa_mfa.direct_grant_flow_alias
}
```

---

#### 3.2 Backend - Realm-Aware Clearance Mapping

**Current** (`backend/src/controllers/custom-login.controller.ts`):
```typescript
// Hardcoded for broker realm
const clearance = userAttributes.clearance?.[0] || 'UNCLASSIFIED';
const needsMFA = clearance !== 'UNCLASSIFIED';
```

**Problem**: French realm uses `CONFIDENTIEL_DEFENSE`, `SECRET_DEFENSE`, etc.

**Solution**: Create clearance mapping service

**File**: `backend/src/services/clearance-mapper.service.ts`

```typescript
export class ClearanceMapperService {
    private static readonly CLEARANCE_MAP: Record<string, string> = {
        // U.S. / NATO standard
        'UNCLASSIFIED': 'UNCLASSIFIED',
        'CONFIDENTIAL': 'CONFIDENTIAL',
        'SECRET': 'SECRET',
        'TOP_SECRET': 'TOP_SECRET',
        'TOP SECRET': 'TOP_SECRET',

        // French (SAML from France IdP)
        'DIFFUSION_RESTREINTE': 'UNCLASSIFIED',
        'CONFIDENTIEL_DEFENSE': 'CONFIDENTIAL',
        'SECRET_DEFENSE': 'SECRET',
        'TRES_SECRET_DEFENSE': 'TOP_SECRET',

        // Canadian
        'PROTECTED_A': 'UNCLASSIFIED',
        'PROTECTED_B': 'CONFIDENTIAL',
        'SECRET': 'SECRET',
        'TOP_SECRET': 'TOP_SECRET',

        // Industry (contractor levels)
        'PUBLIC': 'UNCLASSIFIED',
        'SENSITIVE': 'CONFIDENTIAL',
        'RESTRICTED': 'SECRET'
    };

    public static normalize(clearance: string): string {
        const normalized = this.CLEARANCE_MAP[clearance?.toUpperCase()] || 'UNCLASSIFIED';
        logger.debug('Clearance normalized', { input: clearance, output: normalized });
        return normalized;
    }

    public static requiresMFA(clearance: string): boolean {
        const normalized = this.normalize(clearance);
        return normalized !== 'UNCLASSIFIED';
    }
}
```

**Update `custom-login.controller.ts`**:
```typescript
import { ClearanceMapperService } from '../services/clearance-mapper.service';

// Post-auth check
const rawClearance = userAttributes.clearance?.[0] || 'UNCLASSIFIED';
const clearance = ClearanceMapperService.normalize(rawClearance);
const needsMFA = ClearanceMapperService.requiresMFA(clearance);
```

**Test**:
```typescript
describe('ClearanceMapperService', () => {
    it('should normalize French clearances', () => {
        expect(ClearanceMapperService.normalize('CONFIDENTIEL_DEFENSE')).toBe('CONFIDENTIAL');
        expect(ClearanceMapperService.normalize('SECRET_DEFENSE')).toBe('SECRET');
    });

    it('should require MFA for classified levels', () => {
        expect(ClearanceMapperService.requiresMFA('CONFIDENTIAL')).toBe(true);
        expect(ClearanceMapperService.requiresMFA('UNCLASSIFIED')).toBe(false);
    });
});
```

---

#### 3.3 Frontend - Dynamic Realm Detection

**Current**: Frontend assumes `dive-v3-broker`

**Needed**: Support all realms via dynamic routing

**File**: `frontend/src/app/login/[idpAlias]/page.tsx` (already dynamic!)

**Verify** each realm has:
1. Entry in `frontend/public/login-config.json`
2. Background image in `frontend/public/login-backgrounds/`
3. Logo in `frontend/public/logos/`

**Example `login-config.json`**:
```json
{
  "dive-v3-broker": { ... },
  "dive-v3-usa": {
    "displayName": {
      "en": "U.S. Government Users",
      "fr": "Utilisateurs du gouvernement américain"
    },
    "description": { ... },
    "theme": {
      "colors": {
        "primary": "#002868",
        "secondary": "#BF0A30"
      },
      "background": {
        "imageUrl": "/login-backgrounds/dive-v3-usa.jpg"
      },
      "logo": "/logos/us-flag.svg"
    }
  },
  "dive-v3-fra": {
    "displayName": {
      "en": "French Defense Users",
      "fr": "Utilisateurs de la défense française"
    },
    "description": { ... },
    "theme": {
      "colors": {
        "primary": "#0055A4",
        "secondary": "#EF4135"
      },
      "background": {
        "imageUrl": "/login-backgrounds/dive-v3-fra.jpg"
      },
      "logo": "/logos/france-flag.svg"
    }
  }
  // ... Canada, Industry
}
```

---

#### 3.4 Scalability - IdP Management Integration

**Problem**: Adding new realms requires manual Terraform changes

**Solution**: Integrate with existing IdP Management API (`/admin/idp`)

**Current IdP Management Features** (from `docs/IDP-MANAGEMENT-USER-GUIDE.md`):
- ✅ Create/edit/delete IdPs via UI
- ✅ Auto-generate Terraform on submit
- ✅ Theme customization
- ✅ Approval workflows

**Needed**: Extend IdP creation to include MFA configuration

**File**: `backend/src/services/idp-management.service.ts`

**Add Method**:
```typescript
public async enableMFAForRealm(realmId: string): Promise<void> {
    // 1. Apply OTP policy via Keycloak Admin API
    await this.keycloakAdmin.updateRealm(realmId, {
        otpPolicyType: 'totp',
        otpPolicyAlgorithm: 'HmacSHA1',
        otpPolicyDigits: 6,
        otpPolicyPeriod: 30,
        otpPolicyLookAheadWindow: 1
    });

    // 2. Create Direct Grant flow
    const flowId = await this.createDirectGrantFlow(realmId);

    // 3. Bind flow to realm
    await this.keycloakAdmin.updateAuthenticationExecutionConfig(realmId, {
        directGrantFlow: flowId
    });

    // 4. Update Terraform (auto-generate)
    await this.terraformGenerator.addMFAConfig(realmId);

    logger.info('MFA enabled for realm', { realmId });
}
```

**UI Change**: Add "Require MFA" checkbox to IdP creation form (`frontend/src/app/admin/idp/create/page.tsx`)

---

**Deliverables for Task 3**:
- [ ] `terraform/modules/realm-mfa/` (Terraform module)
- [ ] Updated `usa-realm.tf`, `fra-realm.tf`, `can-realm.tf`, `industry-realm.tf`
- [ ] `backend/src/services/clearance-mapper.service.ts`
- [ ] `backend/src/__tests__/clearance-mapper.service.test.ts`
- [ ] Updated `frontend/public/login-config.json` (all realms)
- [ ] Background images for each realm
- [ ] Extended IdP Management API with MFA toggle
- [ ] Testing matrix for all 5 realms

---

### Task 4: Sync Brute Force Middleware with Keycloak

**Problem**: Backend rate limiting hardcoded, not synced with Keycloak

**Current State**:
- **Backend**: `MAX_ATTEMPTS = 8` (hardcoded in `custom-login.controller.ts`)
- **Keycloak**: `max_login_failures = 8` (Terraform in `broker-realm.tf`)

**Issue**: If Terraform is updated, backend doesn't reflect change

**Goal**: Automatically sync backend rate limit with Keycloak configuration

---

#### 4.1 Implement Dynamic Configuration Service

**File**: `backend/src/services/keycloak-config-sync.service.ts`

```typescript
import axios from 'axios';
import { logger } from '../utils/logger';

interface BruteForceConfig {
    maxLoginFailures: number;
    waitIncrementSeconds: number;
    maxFailureWaitSeconds: number;
    failureResetTimeSeconds: number;
}

export class KeycloakConfigSyncService {
    private static config: BruteForceConfig | null = null;
    private static lastSync: number = 0;
    private static readonly SYNC_INTERVAL_MS = 60000; // 1 minute

    public static async getMaxAttempts(realmId: string): Promise<number> {
        await this.syncIfNeeded(realmId);
        return this.config?.maxLoginFailures || 8; // Fallback
    }

    public static async getWindowMs(realmId: string): Promise<number> {
        await this.syncIfNeeded(realmId);
        const seconds = this.config?.failureResetTimeSeconds || 900;
        return seconds * 1000;
    }

    private static async syncIfNeeded(realmId: string): Promise<void> {
        const now = Date.now();
        if (this.config && (now - this.lastSync) < this.SYNC_INTERVAL_MS) {
            return; // Cache valid
        }

        await this.syncFromKeycloak(realmId);
    }

    private static async syncFromKeycloak(realmId: string): Promise<void> {
        try {
            // Get admin token
            const keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
            const tokenResponse = await axios.post(
                `${keycloakUrl}/realms/master/protocol/openid-connect/token`,
                new URLSearchParams({
                    grant_type: 'password',
                    client_id: 'admin-cli',
                    username: 'admin',
                    password: 'admin'
                })
            );

            const adminToken = tokenResponse.data.access_token;

            // Fetch realm configuration
            const realmResponse = await axios.get(
                `${keycloakUrl}/admin/realms/${realmId}`,
                {
                    headers: { Authorization: `Bearer ${adminToken}` }
                }
            );

            // Extract brute force settings
            this.config = {
                maxLoginFailures: realmResponse.data.maxFailureWaitSeconds || 8,
                waitIncrementSeconds: realmResponse.data.waitIncrementSeconds || 60,
                maxFailureWaitSeconds: realmResponse.data.maxFailureWaitSeconds || 300,
                failureResetTimeSeconds: realmResponse.data.failureResetTime || 900
            };

            this.lastSync = Date.now();

            logger.info('Synced brute force config from Keycloak', {
                realmId,
                maxAttempts: this.config.maxLoginFailures,
                windowSeconds: this.config.failureResetTimeSeconds
            });

        } catch (error) {
            logger.error('Failed to sync Keycloak config', {
                realmId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            // Keep existing config or use defaults
        }
    }

    // Force immediate sync (for testing or after Terraform apply)
    public static async forceSync(realmId: string): Promise<void> {
        this.lastSync = 0; // Invalidate cache
        await this.syncFromKeycloak(realmId);
    }
}
```

---

#### 4.2 Update Custom Login Controller

**File**: `backend/src/controllers/custom-login.controller.ts`

**Before**:
```typescript
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(ip: string, username: string): boolean {
    const recentAttempts = loginAttempts.filter(/* ... */);
    return recentAttempts.length >= MAX_ATTEMPTS;
}
```

**After**:
```typescript
import { KeycloakConfigSyncService } from '../services/keycloak-config-sync.service';

async function isRateLimited(ip: string, username: string, realmId: string): Promise<boolean> {
    const maxAttempts = await KeycloakConfigSyncService.getMaxAttempts(realmId);
    const windowMs = await KeycloakConfigSyncService.getWindowMs(realmId);

    const now = Date.now();
    const recentAttempts = loginAttempts.filter(
        a => a.ip === ip && a.username === username && (now - a.timestamp) < windowMs
    );

    return recentAttempts.length >= maxAttempts;
}

// In handler
const rateLimited = await isRateLimited(clientIp, username, realmName);
if (rateLimited) {
    const maxAttempts = await KeycloakConfigSyncService.getMaxAttempts(realmName);
    return res.status(429).json({
        error: `Too many login attempts. Please try again later.`,
        details: { maxAttempts, windowMinutes: 15 }
    });
}
```

---

#### 4.3 Startup Sync

**File**: `backend/src/server.ts`

```typescript
import { KeycloakConfigSyncService } from './services/keycloak-config-sync.service';

// After server start
app.listen(PORT, async () => {
    logger.info('Server started', { port: PORT });

    // Initial sync on startup
    const realms = ['dive-v3-broker', 'dive-v3-usa', 'dive-v3-fra', 'dive-v3-can', 'dive-v3-industry'];
    for (const realm of realms) {
        await KeycloakConfigSyncService.forceSync(realm);
    }

    // Periodic sync every 5 minutes
    setInterval(async () => {
        for (const realm of realms) {
            await KeycloakConfigSyncService.forceSync(realm);
        }
    }, 5 * 60 * 1000);
});
```

---

#### 4.4 Health Check Endpoint

**File**: `backend/src/controllers/health.controller.ts`

```typescript
router.get('/health/brute-force-config', async (req: Request, res: Response) => {
    const realm = req.query.realm as string || 'dive-v3-broker';

    const maxAttempts = await KeycloakConfigSyncService.getMaxAttempts(realm);
    const windowMs = await KeycloakConfigSyncService.getWindowMs(realm);

    res.json({
        realm,
        maxLoginAttempts: maxAttempts,
        windowMs,
        windowMinutes: Math.floor(windowMs / 60000),
        lastSyncAgo: '< 1 minute' // Implement actual tracking
    });
});
```

**Test**:
```bash
curl http://localhost:4000/health/brute-force-config?realm=dive-v3-broker
# {
#   "realm": "dive-v3-broker",
#   "maxLoginAttempts": 8,
#   "windowMs": 900000,
#   "windowMinutes": 15,
#   "lastSyncAgo": "< 1 minute"
# }
```

---

#### 4.5 Terraform Output

**File**: `terraform/outputs.tf`

```hcl
output "brute_force_config" {
  description = "Brute force configuration for reference"
  value = {
    broker = {
      max_login_failures         = keycloak_realm.dive_v3_broker.security_defenses[0].brute_force_detection[0].max_login_failures
      failure_reset_time_seconds = keycloak_realm.dive_v3_broker.security_defenses[0].brute_force_detection[0].failure_reset_time_seconds
    }
    # Add other realms...
  }
}
```

**Usage**:
```bash
terraform output brute_force_config
# {
#   broker = {
#     max_login_failures = 8
#     failure_reset_time_seconds = 3600
#   }
# }
```

---

**Deliverables for Task 4**:
- [ ] `backend/src/services/keycloak-config-sync.service.ts`
- [ ] `backend/src/__tests__/keycloak-config-sync.service.test.ts`
- [ ] Updated `custom-login.controller.ts` (async rate limiting)
- [ ] Updated `server.ts` (startup sync)
- [ ] New health check endpoint `/health/brute-force-config`
- [ ] Updated Terraform outputs
- [ ] Documentation: "How backend syncs with Keycloak"

---

## Additional Enhancements to Consider

### 1. Backup Recovery Codes
Generate 10 single-use codes during OTP setup for account recovery.

**Implementation**:
```typescript
// otp-setup.controller.ts
const recoveryCodes = Array.from({ length: 10 }, () => 
    crypto.randomBytes(4).toString('hex').toUpperCase()
);

// Store in Keycloak attributes
attributes: {
    totp_secret: [secret],
    recovery_codes: recoveryCodes
}

// Return to user (display once)
res.json({
    success: true,
    secret,
    qrCodeUrl,
    recoveryCodes,
    warning: 'Save these codes in a secure location. They cannot be recovered.'
});
```

**UI**: Display recovery codes in a printable/downloadable format.

---

### 2. Admin MFA Management

**Features**:
- View users with/without MFA
- Force MFA reset for a user
- Generate new recovery codes
- View MFA adoption rate

**Endpoint**: `GET /admin/users/:id/mfa-status`

**UI**: Add "MFA Status" column to user list, "Reset MFA" button.

---

### 3. Analytics & Monitoring

**Metrics to Track**:
- MFA adoption rate by realm
- Failed OTP attempts by user
- Rate limit hits per hour
- Average OTP setup time

**Tools**: Prometheus + Grafana dashboard

**Implementation**:
```typescript
// backend/src/metrics/mfa-metrics.ts
import { Counter, Histogram } from 'prom-client';

export const otpSetupCounter = new Counter({
    name: 'mfa_otp_setup_total',
    help: 'Total OTP setups',
    labelNames: ['realm', 'status']
});

export const otpSetupDuration = new Histogram({
    name: 'mfa_otp_setup_duration_seconds',
    help: 'OTP setup duration',
    labelNames: ['realm']
});
```

---

### 4. Compliance Reporting

**Generate Reports**:
- "Users without MFA (classified clearances)"
- "MFA setup failures last 30 days"
- "Brute force incidents"

**Format**: PDF, CSV, JSON

**Endpoint**: `POST /admin/reports/mfa-compliance`

---

## Success Criteria

### Task 1: Documentation
- [ ] OpenAPI spec generated and validated
- [ ] User guide with screenshots
- [ ] Admin guide with procedures
- [ ] 3+ ADRs documenting design decisions

### Task 2: Testing
- [ ] ≥35 backend unit tests, ≥80% coverage
- [ ] ≥33 frontend unit tests, ≥75% coverage
- [ ] ≥11 E2E tests, 100% critical paths
- [ ] All tests passing in CI/CD
- [ ] `npm run test` and `npm run test:e2e` work locally

### Task 3: Multi-Realm
- [ ] Terraform module created and applied to 5 realms
- [ ] `clearance-mapper.service.ts` handles all realm variations
- [ ] `login-config.json` includes all 5 realms
- [ ] Manual testing completed for each realm
- [ ] IdP Management UI includes MFA toggle

### Task 4: Config Sync
- [ ] `keycloak-config-sync.service.ts` implemented
- [ ] Backend rate limiting is dynamic (reads from service)
- [ ] Health check endpoint shows current config
- [ ] Documentation explains sync mechanism
- [ ] Terraform outputs include brute force config

---

## Existing Resources to Reference

### Documentation Files
1. `docs/MFA-OTP-IMPLEMENTATION.md` (this file - comprehensive technical docs)
2. `LOGIN-UX-ENHANCEMENTS-2025.md` (UX improvements changelog)
3. `LOGIN-PAGE-CUSTOMIZATION-GUIDE.md` (how to customize login page)
4. `docs/IDP-MANAGEMENT-USER-GUIDE.md` (IdP management features)
5. `docs/AAL2-MFA-TESTING-GUIDE.md` (previous MFA testing notes)
6. `CHANGELOG.md` (project changelog)
7. `README.md` (project overview)

### Code Files (Current Implementation)
**Backend**:
- `backend/src/controllers/custom-login.controller.ts` (450 lines)
- `backend/src/controllers/otp-setup.controller.ts` (325 lines)
- `backend/src/controllers/auth.controller.ts` (routes)
- `backend/src/middleware/rate-limit.middleware.ts`

**Frontend**:
- `frontend/src/app/login/[idpAlias]/page.tsx` (850 lines)
- `frontend/src/app/globals.css` (includes shake animation)
- `frontend/public/login-config.json`

**Infrastructure**:
- `terraform/broker-realm.tf`
- `terraform/keycloak-mfa-flows.tf`
- `terraform/main.tf`

### Reference Projects
Located in `resources/` directory:
1. `keycloak-react-main/` - Next.js + Keycloak integration patterns
2. `mpe-experiment-main/` - OPA policy examples
3. `ztdf-main/` - Zero Trust architecture reference

---

## Project Directory Structure

```
DIVE-V3/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── custom-login.controller.ts     ✅ Implemented
│   │   │   ├── otp-setup.controller.ts        ✅ Implemented
│   │   │   └── auth.controller.ts             ✅ Routes defined
│   │   ├── services/
│   │   │   ├── clearance-mapper.service.ts    ❌ TODO (Task 3)
│   │   │   └── keycloak-config-sync.service.ts ❌ TODO (Task 4)
│   │   ├── middleware/
│   │   │   └── rate-limit.middleware.ts       ✅ Exists, needs update
│   │   └── __tests__/
│   │       ├── custom-login.controller.test.ts ❌ TODO (Task 2)
│   │       └── otp-setup.controller.test.ts    ❌ TODO (Task 2)
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   └── login/
│   │   │       └── [idpAlias]/
│   │   │           └── page.tsx               ✅ Implemented
│   │   ├── components/
│   │   │   └── ui/
│   │   │       └── LanguageToggle.tsx         ✅ Implemented
│   │   └── __tests__/
│   │       └── login-otp-flow.test.tsx        ❌ TODO (Task 2)
│   ├── e2e/
│   │   └── mfa-complete-flow.spec.ts          ❌ TODO (Task 2)
│   ├── public/
│   │   ├── login-config.json                  ✅ Exists, needs expansion
│   │   ├── login-backgrounds/
│   │   │   ├── dive-v3-broker.jpg             ✅ Exists
│   │   │   ├── dive-v3-usa.jpg                ❌ TODO (Task 3)
│   │   │   ├── dive-v3-fra.jpg                ❌ TODO (Task 3)
│   │   │   ├── dive-v3-can.jpg                ❌ TODO (Task 3)
│   │   │   └── dive-v3-industry.jpg           ❌ TODO (Task 3)
│   │   └── logos/
│   │       ├── dive-v3-logo.svg               ✅ Exists
│   │       ├── us-flag.svg                    ❌ TODO (Task 3)
│   │       ├── france-flag.svg                ❌ TODO (Task 3)
│   │       └── canada-flag.svg                ❌ TODO (Task 3)
│   ├── package.json
│   └── playwright.config.ts
├── terraform/
│   ├── modules/
│   │   └── realm-mfa/                         ❌ TODO (Task 3)
│   │       ├── main.tf
│   │       ├── direct-grant.tf
│   │       ├── variables.tf
│   │       └── outputs.tf
│   ├── broker-realm.tf                        ✅ Implemented
│   ├── usa-realm.tf                           ⚠️ Needs MFA module
│   ├── fra-realm.tf                           ⚠️ Needs MFA module
│   ├── can-realm.tf                           ⚠️ Needs MFA module
│   ├── industry-realm.tf                      ⚠️ Needs MFA module
│   └── keycloak-mfa-flows.tf                  ✅ Implemented (broker only)
├── docs/
│   ├── MFA-OTP-IMPLEMENTATION.md              ✅ Created (this file)
│   ├── api/
│   │   └── auth-endpoints-openapi.yaml        ❌ TODO (Task 1)
│   ├── user-guides/
│   │   └── MFA-SETUP-GUIDE.md                 ❌ TODO (Task 1)
│   ├── admin-guides/
│   │   └── MFA-ADMINISTRATION.md              ❌ TODO (Task 1)
│   └── adr/
│       ├── ADR-001-direct-grant-choice.md     ❌ TODO (Task 1)
│       ├── ADR-002-user-attributes-storage.md ❌ TODO (Task 1)
│       └── ADR-003-custom-login-form.md       ❌ TODO (Task 1)
├── .github/
│   └── workflows/
│       ├── test.yml                           ⚠️ Needs expansion
│       └── deploy.yml                         ✅ Exists
├── CHANGELOG.md                               ⚠️ Needs update
├── README.md                                  ⚠️ Needs MFA section
└── package.json

Legend:
✅ Complete
⚠️ Exists but needs updates
❌ Not yet implemented (TODO)
```

---

## Changelog Update Required

Add to `CHANGELOG.md`:

```markdown
## [Unreleased]

### Added - MFA/OTP Implementation (October 24, 2025)

#### Security
- **Multi-Factor Authentication (MFA)** enforcement for classified clearances
  - TOTP-based (RFC 6238) with 6-digit codes, 30-second period
  - Policy-driven: MFA required for CONFIDENTIAL, SECRET, TOP_SECRET
  - Custom login flow using Keycloak Direct Access Grants
  - OTP setup UI with QR code generation (React component)
  - Speakeasy library for TOTP generation/verification

#### Backend API (`backend/`)
- `/api/auth/custom-login` - Authentication with optional OTP parameter
- `/api/auth/otp/setup` - Initiate TOTP secret generation and QR code
- `/api/auth/otp/verify` - Verify OTP and enable for user
- Rate limiting: 8 attempts per 15 minutes (synced with Keycloak)
- Clearance-based conditional MFA enforcement
- TOTP secrets stored in Keycloak user attributes
- Post-authentication security checks via Admin API

#### Frontend UI (`frontend/`)
- Custom login page with split layout (`/login/[idpAlias]`)
- OTP setup wizard with QR code display
- Real-time OTP input validation (6-digit requirement)
- Shake animation on invalid OTP (CSS keyframes)
- Contextual help tips after 2+ failed attempts
- Remaining attempts warning (parsed from backend errors)
- Empty OTP submission prevention
- Custom QR labels ("DIVE ICAM (God Mode)" for admins)
- Multilingual support (EN/FR) for error messages

#### Infrastructure (`terraform/`)
- Keycloak OTP policy configuration (TOTP, HmacSHA1, 6 digits, 30s period)
- Direct Grant authentication flow with conditional MFA
- Brute force protection: 8 failures, 5-min lockout, 1-hour reset
- Applied to `dive-v3-broker` realm

#### Documentation
- `docs/MFA-OTP-IMPLEMENTATION.md` - Complete technical documentation
- `LOGIN-UX-ENHANCEMENTS-2025.md` - UX improvements summary
- Architecture diagrams, API specs, security design

#### Known Limitations
- MFA currently only implemented for `dive-v3-broker` realm
- Backend rate limiting hardcoded (not dynamically synced with Keycloak)
- No backup recovery codes
- No admin MFA reset functionality

### Changed
- Login flow now supports two-step authentication (credentials → OTP)
- Frontend login page hides username/password during MFA prompts
- Backend clearance checks now query Keycloak Admin API post-auth
- Brute force limit increased from 3 to 8 attempts (better UX for MFA setup)

### Security Notes
- TOTP secrets stored in Keycloak user attributes (not credential objects)
  - Workaround for Keycloak Direct Grant API limitations
  - Secrets encrypted at rest by Keycloak
- Clock skew tolerance: ±30 seconds (window=1)
- All OTP setup attempts logged for security monitoring
```

---

## README Update Required

Add to `README.md` under "Features":

```markdown
### 🔐 Multi-Factor Authentication (MFA)

**Policy-Driven Security**: MFA automatically enforced based on security clearance level.

| Clearance | MFA Required | Method |
|-----------|--------------|--------|
| UNCLASSIFIED | ❌ No | Password only |
| CONFIDENTIAL | ✅ Yes | Password + TOTP |
| SECRET | ✅ Yes | Password + TOTP |
| TOP SECRET | ✅ Yes | Password + TOTP |

**Setup Process**:
1. User logs in with classified clearance
2. System detects MFA requirement
3. QR code displayed for authenticator app (Google Authenticator, Authy, etc.)
4. User scans QR code or enters secret manually
5. User enters 6-digit TOTP code
6. MFA enabled for future logins

**Features**:
- 🎨 Modern UX with shake animations on errors
- 📱 Compatible with all TOTP authenticator apps
- ⚠️ Remaining attempts warnings (8 attempts per 15 minutes)
- 💡 Contextual help after multiple failures
- 🌍 Multilingual support (English/French)
- 🔄 Custom QR labels per user role

**Security**:
- RFC 6238 compliant (TOTP standard)
- 30-second time window with ±30s clock skew tolerance
- Secrets stored encrypted in Keycloak
- Rate limiting: 8 attempts per 15 minutes
- All setup/login attempts logged

**Documentation**: See `docs/MFA-OTP-IMPLEMENTATION.md` for complete details.

**Current Status**: ✅ Implemented for `dive-v3-broker` realm. Multi-realm expansion in progress.
```

---

## GitHub CI/CD Workflow Update

**File**: `.github/workflows/test.yml`

Add jobs for backend/frontend testing:

```yaml
name: Test Suite

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        working-directory: ./backend
        run: npm ci
      
      - name: Run unit tests
        working-directory: ./backend
        run: npm run test -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          directory: ./backend/coverage
          flags: backend

  frontend-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        working-directory: ./frontend
        run: npm ci
      
      - name: Run unit tests
        working-directory: ./frontend
        run: npm run test -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          directory: ./frontend/coverage
          flags: frontend

  e2e-tests:
    runs-on: ubuntu-latest
    
    services:
      keycloak:
        image: quay.io/keycloak/keycloak:24.0
        env:
          KEYCLOAK_ADMIN: admin
          KEYCLOAK_ADMIN_PASSWORD: admin
        ports:
          - 8080:8080
        options: --health-cmd "curl -f http://localhost:8080/health" --health-interval 10s
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install Playwright
        working-directory: ./frontend
        run: npx playwright install --with-deps
      
      - name: Start services
        run: docker-compose up -d
      
      - name: Wait for services
        run: sleep 30
      
      - name: Run E2E tests
        working-directory: ./frontend
        run: npm run test:e2e
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

---

## Implementation Plan Update

**File**: `dive-v3-implementation-plan.md`

Add Phase 4.3 (MFA/OTP Implementation):

```markdown
### Phase 4.3: Multi-Factor Authentication (MFA) - [CURRENT]

**Timeline**: Week 4, Days 22-28
**Status**: ✅ Broker realm complete, ⚠️ Multi-realm expansion needed

#### Objectives
- [x] Design MFA policy (clearance-based enforcement)
- [x] Implement TOTP generation/verification (speakeasy)
- [x] Create OTP setup UI with QR code
- [x] Integrate with Keycloak Direct Access Grants
- [x] Apply to broker realm
- [ ] **TODO**: Extend to all realms (USA, FRA, CAN, Industry)
- [ ] **TODO**: Comprehensive testing (unit + E2E)
- [ ] **TODO**: Dynamic config sync (backend ↔ Keycloak)

#### Acceptance Criteria
- [x] Users with classified clearances prompted for MFA
- [x] QR code scannable by Google Authenticator
- [x] Valid OTP codes accepted within time window
- [x] Invalid OTP codes rejected with clear error
- [x] Rate limiting prevents brute force (8 attempts)
- [x] Shake animation on errors (modern UX)
- [ ] **TODO**: All 5 realms support MFA
- [ ] **TODO**: ≥80% test coverage
- [ ] **TODO**: Passing CI/CD pipeline
- [ ] **TODO**: Full documentation

#### Dependencies
- Keycloak 24+ (Direct Grant flow support)
- speakeasy v2.0+ (TOTP library)
- qrcode.react v4.2+ (QR rendering)

#### Risks & Mitigation
- **Risk**: Keycloak Direct Grant doesn't support programmatic credential creation
  - **Mitigation**: Store TOTP secrets in user attributes, verify in backend
- **Risk**: Users lose access to authenticator app
  - **Mitigation**: TODO - Implement backup recovery codes
- **Risk**: Rate limiting out of sync with Keycloak
  - **Mitigation**: TODO - Dynamic config sync service

#### Next Steps (Priority Order)
1. [ ] Create comprehensive test suite (Task 2)
2. [ ] Extend to all realms with clearance mapper (Task 3)
3. [ ] Implement dynamic config sync (Task 4)
4. [ ] Generate API documentation (Task 1)
5. [ ] Add backup recovery codes (Enhancement)
6. [ ] Build admin MFA management UI (Enhancement)
```

---

## Best Practices to Follow

### 1. **NO SHORTCUTS**
- Write complete, production-ready code
- Include error handling for all edge cases
- Log all security-relevant events
- Validate all inputs (server-side)

### 2. **Testing First**
- Write tests BEFORE extending to new realms
- Use Test-Driven Development (TDD) where possible
- Mock external dependencies (Keycloak, speakeasy)
- Test error paths, not just happy paths

### 3. **Security Focus**
- Never log TOTP secrets or OTP codes
- Sanitize all error messages (prevent information leakage)
- Use constant-time comparison for OTP verification
- Rate limit all authentication endpoints

### 4. **Scalability**
- Use Terraform modules for realm configuration
- Implement configuration as code (no manual Keycloak changes)
- Design for 10+ realms, not just 5
- Cache Keycloak config (1-minute TTL)

### 5. **Documentation**
- Document EVERY design decision (ADRs)
- Include diagrams for complex flows
- Write code comments for non-obvious logic
- Keep README updated with each feature

### 6. **Code Quality**
- Follow TypeScript strict mode
- Use ESLint/Prettier for consistency
- No `any` types (use `unknown` or proper interfaces)
- Prefer functional programming (pure functions)

---

## Questions to Answer

Before starting, consider:

1. **Multi-Realm Testing**: How will you test all 5 realms efficiently?
   - Suggested: Parametrize tests, run same suite for each realm

2. **Clearance Normalization**: What if a realm adds a NEW clearance level?
   - Suggested: Default to `UNCLASSIFIED` if unmapped, log warning

3. **Config Sync Frequency**: How often should backend sync with Keycloak?
   - Suggested: 1-minute TTL, force sync on startup, expose `/health/sync` endpoint

4. **Test Data**: How to generate realistic test users for each realm?
   - Suggested: Seed script that creates 1 user per clearance level per realm

5. **E2E Performance**: Should E2E tests run against Docker or mocked services?
   - Suggested: Docker for CI/CD (real Keycloak), mocks for local dev speed

---

## Final Checklist

Before marking complete:

### Code
- [ ] All TypeScript compiles without errors (`tsc --noEmit`)
- [ ] All ESLint rules pass (`npm run lint`)
- [ ] All tests pass (`npm run test && npm run test:e2e`)
- [ ] Code coverage ≥80% backend, ≥75% frontend

### Infrastructure
- [ ] Terraform plan succeeds for all realms (`terraform plan`)
- [ ] Terraform apply succeeds for all realms (`terraform apply`)
- [ ] All 5 realms have MFA enabled in Keycloak Admin Console
- [ ] Brute force settings consistent across realms

### Documentation
- [ ] `MFA-OTP-IMPLEMENTATION.md` complete
- [ ] OpenAPI spec generated and validated
- [ ] User guide written with screenshots
- [ ] Admin guide written with procedures
- [ ] ADRs created for design decisions
- [ ] README updated with MFA section
- [ ] CHANGELOG updated with MFA entry

### Testing
- [ ] 35+ backend unit tests written and passing
- [ ] 33+ frontend unit tests written and passing
- [ ] 11+ E2E tests written and passing
- [ ] Manual testing completed for all 5 realms
- [ ] Performance tests show <3s OTP setup, <1s verification

### CI/CD
- [ ] GitHub Actions workflow updated
- [ ] Tests run automatically on PR
- [ ] Coverage reports uploaded to Codecov
- [ ] All checks passing on main branch

### Deployment
- [ ] Changes deployed to dev environment
- [ ] Smoke tests completed in dev
- [ ] Changes deployed to staging
- [ ] Full QA completed in staging
- [ ] Ready for production deployment

---

## Getting Help

If stuck:

1. **Check existing docs**: `docs/MFA-OTP-IMPLEMENTATION.md`, `LOGIN-UX-ENHANCEMENTS-2025.md`
2. **Review reference projects**: `resources/keycloak-react-main/`, `resources/mpe-experiment-main/`
3. **Search codebase**: Use `grep -r "keyword" backend/` or `codebase_search`
4. **Check Terraform state**: `terraform show` for current configuration
5. **Inspect Keycloak**: Use Admin Console or `kcadm.sh` CLI

---

**This prompt provides ALL context needed to continue the MFA/OTP implementation independently. Follow the task order (2 → 3 → 4 → 1), use best practices, and deliver production-ready code with comprehensive testing.**

**Good luck! 🚀**

