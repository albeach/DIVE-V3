# MFA/OTP Multi-Realm Expansion & Config Sync - Tasks 3 & 4 Handoff Prompt

## Context & Background

You are continuing work on the **DIVE V3 Coalition-Friendly ICAM Pilot**, specifically the **MFA/OTP Enhancement** project. This is a **4-task initiative** to implement comprehensive Multi-Factor Authentication across all identity provider realms.

**Project Status**:
- ✅ **Task 1 (Partial)**: Technical implementation docs created
- ✅ **Task 2 (Partial)**: Testing suite created (27/54 backend tests passing, 13 E2E tests created)
- ⏳ **Task 3 (YOUR FOCUS)**: Multi-Realm Expansion
- ⏳ **Task 4 (YOUR FOCUS)**: Dynamic Config Sync

**Current Deployment**: MFA/OTP fully operational for `dive-v3-broker` realm only. Needs expansion to USA, France, Canada, and Industry realms.

---

## CRITICAL: What Has Been Completed

### ✅ Task 1 & 2 Accomplishments (DO NOT REDO)

#### MFA Implementation (Broker Realm Only - COMPLETE)
1. **Backend Controllers**:
   - `backend/src/controllers/custom-login.controller.ts` (~417 lines)
     - Keycloak Direct Access Grants authentication
     - Rate limiting (8 attempts per 15 minutes)
     - MFA enforcement based on clearance level
     - Post-auth security checks via Keycloak Admin API
   
   - `backend/src/controllers/otp-setup.controller.ts` (~339 lines)
     - TOTP secret generation using speakeasy
     - QR code generation (`otpauth://` URLs)
     - OTP verification (±1 step tolerance)
     - Keycloak user attribute storage

2. **Frontend UI**:
   - `frontend/src/app/login/[idpAlias]/page.tsx` (~882 lines)
     - Custom login page with OTP setup wizard
     - QR code display with React component
     - Shake animation on invalid OTP
     - Contextual help after 2+ failures
     - Multilingual support (EN/FR)

3. **Infrastructure**:
   - `terraform/broker-realm.tf` - MFA configuration for broker realm
   - `terraform/keycloak-mfa-flows.tf` - Direct Grant flow with conditional MFA
   - `.github/workflows/test.yml` - CI/CD testing workflow

4. **Testing**:
   - `backend/src/__tests__/custom-login.controller.test.ts` (27 tests ✅ PASSING)
   - `backend/src/__tests__/otp-setup.controller.test.ts` (27 tests ⚠️ needs speakeasy mock fix)
   - `frontend/src/__tests__/e2e/mfa-complete-flow.spec.ts` (13 tests created)

5. **Documentation** (~1,650 lines):
   - `docs/MFA-OTP-IMPLEMENTATION.md` - Technical implementation details
   - `docs/MFA-TESTING-SUITE.md` - Test documentation
   - `docs/MFA-TESTING-QUICK-START.md` - Quick reference
   - `docs/TASK-2-HANDOFF.md` - Task 2 summary
   - `docs/TEST-STATUS.md` - Current test status

**Total Completed**: ~3,400 lines of production code + ~2,950 lines of tests/docs

---

## YOUR MISSION: Tasks 3 & 4

### Task 3: Multi-Realm MFA Expansion 🌍
**Goal**: Extend MFA to all 5 realms with proper clearance mappings

### Task 4: Dynamic Config Sync ⚙️
**Goal**: Auto-sync backend rate limits with Keycloak configuration

---

## Project Directory Structure (Current State)

```
DIVE-V3/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── custom-login.controller.ts          ✅ COMPLETE (broker only)
│   │   │   ├── otp-setup.controller.ts             ✅ COMPLETE (broker only)
│   │   │   └── auth.controller.ts                  ✅ Routes defined
│   │   ├── services/
│   │   │   ├── keycloak-admin.service.ts           ✅ Exists
│   │   │   ├── clearance-mapper.service.ts         ❌ TODO (Task 3)
│   │   │   └── keycloak-config-sync.service.ts     ❌ TODO (Task 4)
│   │   ├── middleware/
│   │   │   └── rate-limit.middleware.ts            ⚠️ Needs update (Task 4)
│   │   └── __tests__/
│   │       ├── custom-login.controller.test.ts     ✅ 27 tests PASSING
│   │       ├── otp-setup.controller.test.ts        ⚠️ 27 tests (speakeasy mock issue)
│   │       ├── clearance-mapper.service.test.ts    ❌ TODO (Task 3)
│   │       └── keycloak-config-sync.test.ts        ❌ TODO (Task 4)
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   └── login/
│   │   │       └── [idpAlias]/
│   │   │           └── page.tsx                    ✅ COMPLETE
│   │   ├── components/
│   │   │   └── ui/
│   │   │       └── LanguageToggle.tsx              ✅ Implemented
│   │   └── __tests__/
│   │       └── e2e/
│   │           └── mfa-complete-flow.spec.ts       ✅ 13 tests created
│   ├── public/
│   │   ├── login-config.json                       ⚠️ Needs expansion (Task 3)
│   │   ├── login-backgrounds/
│   │   │   ├── dive-v3-broker.jpg                  ✅ Exists
│   │   │   ├── dive-v3-usa.jpg                     ❌ TODO (Task 3)
│   │   │   ├── dive-v3-fra.jpg                     ❌ TODO (Task 3)
│   │   │   ├── dive-v3-can.jpg                     ❌ TODO (Task 3)
│   │   │   └── dive-v3-industry.jpg                ❌ TODO (Task 3)
│   │   └── logos/
│   │       ├── dive-v3-logo.svg                    ✅ Exists
│   │       ├── us-flag.svg                         ❌ TODO (Task 3)
│   │       ├── france-flag.svg                     ❌ TODO (Task 3)
│   │       └── canada-flag.svg                     ❌ TODO (Task 3)
│   ├── package.json
│   └── playwright.config.ts
├── terraform/
│   ├── modules/
│   │   └── realm-mfa/                              ❌ TODO (Task 3)
│   │       ├── main.tf
│   │       ├── direct-grant.tf
│   │       ├── variables.tf
│   │       └── outputs.tf
│   ├── broker-realm.tf                             ✅ MFA configured
│   ├── usa-realm.tf                                ⚠️ Needs MFA module (Task 3)
│   ├── fra-realm.tf                                ⚠️ Needs MFA module (Task 3)
│   ├── can-realm.tf                                ⚠️ Needs MFA module (Task 3)
│   ├── industry-realm.tf                           ⚠️ Needs MFA module (Task 3)
│   └── keycloak-mfa-flows.tf                       ✅ Broker only
├── docs/
│   ├── MFA-OTP-IMPLEMENTATION.md                   ✅ Complete (1,577 lines)
│   ├── MFA-TESTING-SUITE.md                        ✅ Complete (~500 lines)
│   ├── MFA-TESTING-QUICK-START.md                  ✅ Complete (~350 lines)
│   ├── TASK-2-HANDOFF.md                           ✅ Complete (~400 lines)
│   ├── TEST-STATUS.md                              ✅ Test status tracking
│   ├── api/
│   │   └── auth-endpoints-openapi.yaml             ❌ TODO (Task 1)
│   ├── user-guides/
│   │   └── MFA-SETUP-GUIDE.md                      ❌ TODO (Task 1)
│   └── admin-guides/
│       └── MFA-ADMINISTRATION.md                   ❌ TODO (Task 1)
├── .github/
│   └── workflows/
│       ├── test.yml                                ✅ Complete
│       └── deploy.yml                              ✅ Exists
├── CHANGELOG.md                                    ✅ Updated with Task 2
├── README.md                                       ✅ Exists
└── HANDOFF-PROMPT-MFA-EXPANSION.md                 ✅ Original (1,577 lines)

Legend:
✅ Complete - Production ready
⚠️ Exists but needs updates for Tasks 3/4
❌ Not yet implemented (YOUR WORK)
```

---

## Task 3: Multi-Realm MFA Expansion - Detailed Spec

### Objective
Extend MFA functionality from `dive-v3-broker` to **all 5 realms**, with proper clearance level mappings for each nation.

### 3.1: Create Terraform Module for Realm MFA

**File**: `terraform/modules/realm-mfa/main.tf`

```hcl
# terraform/modules/realm-mfa/main.tf
# Reusable MFA configuration module for all realms

variable "realm_id" {
  description = "Keycloak realm ID"
  type        = string
}

variable "realm_name" {
  description = "Keycloak realm name"
  type        = string
}

variable "max_login_failures" {
  description = "Maximum login attempts before lockout"
  type        = number
  default     = 8
}

variable "otp_period" {
  description = "TOTP period in seconds"
  type        = number
  default     = 30
}

# Apply OTP policy to realm
resource "keycloak_realm" "realm_otp_config" {
  realm = var.realm_name

  otp_policy {
    type      = "totp"
    algorithm = "HmacSHA1"
    digits    = 6
    period    = var.otp_period
    look_ahead_window = 1
  }

  # Brute force protection
  security_defenses {
    brute_force_detection {
      enabled                    = true
      max_login_failures         = var.max_login_failures
      wait_increment_seconds     = 60
      max_failure_wait_seconds   = 300
      failure_reset_time_seconds = 3600
    }
  }
}

# Create Direct Grant flow with conditional MFA
resource "keycloak_authentication_flow" "direct_grant_mfa" {
  realm_id = var.realm_id
  alias    = "${var.realm_name}-direct-grant-mfa"
  description = "Direct Grant flow with conditional MFA for ${var.realm_name}"
}

# Output flow alias for binding
output "direct_grant_flow_alias" {
  value = keycloak_authentication_flow.direct_grant_mfa.alias
}

output "max_login_failures" {
  value = var.max_login_failures
}
```

**File**: `terraform/modules/realm-mfa/variables.tf`

```hcl
variable "realm_id" {
  description = "Keycloak realm ID"
  type        = string
}

variable "realm_name" {
  description = "Keycloak realm name"
  type        = string
}

variable "max_login_failures" {
  description = "Maximum login attempts"
  type        = number
  default     = 8
}

variable "otp_period" {
  description = "TOTP period"
  type        = number
  default     = 30
}
```

**File**: `terraform/modules/realm-mfa/outputs.tf`

```hcl
output "direct_grant_flow_alias" {
  description = "Direct Grant flow alias for realm"
  value       = keycloak_authentication_flow.direct_grant_mfa.alias
}

output "max_login_failures" {
  description = "Configured max login failures"
  value       = var.max_login_failures
}

output "otp_period" {
  description = "Configured OTP period"
  value       = var.otp_period
}
```

### 3.2: Apply Module to All Realms

**Update**: `terraform/usa-realm.tf`

```hcl
# Add MFA configuration using module
module "usa_mfa" {
  source = "./modules/realm-mfa"

  realm_id   = keycloak_realm.dive_v3_usa.id
  realm_name = "dive-v3-usa"
  
  max_login_failures = 8
  otp_period        = 30
}

# Bind Direct Grant flow to realm
resource "keycloak_authentication_bindings" "usa_bindings" {
  realm_id         = keycloak_realm.dive_v3_usa.id
  direct_grant_flow = module.usa_mfa.direct_grant_flow_alias
}
```

**Repeat for**: `fra-realm.tf`, `can-realm.tf`, `industry-realm.tf`

### 3.3: Implement Clearance Mapper Service

**File**: `backend/src/services/clearance-mapper.service.ts`

```typescript
/**
 * Clearance Mapper Service
 * 
 * Maps national clearance levels to NATO equivalents
 * Supports USA, France (FRA), Canada (CAN), Germany (DEU), Industry
 * 
 * @see ACP-240 Section 4.3: Classification Equivalency Mappings
 */

import { logger } from '../utils/logger';

export enum ClearanceLevel {
    UNCLASSIFIED = 'UNCLASSIFIED',
    CONFIDENTIAL = 'CONFIDENTIAL',
    SECRET = 'SECRET',
    TOP_SECRET = 'TOP_SECRET'
}

export class ClearanceMapperService {
    private static readonly CLEARANCE_MAP: Record<string, ClearanceLevel> = {
        // U.S. / NATO standard
        'UNCLASSIFIED': ClearanceLevel.UNCLASSIFIED,
        'CONFIDENTIAL': ClearanceLevel.CONFIDENTIAL,
        'SECRET': ClearanceLevel.SECRET,
        'TOP_SECRET': ClearanceLevel.TOP_SECRET,
        'TOP SECRET': ClearanceLevel.TOP_SECRET,

        // French (SAML from France IdP)
        'DIFFUSION_RESTREINTE': ClearanceLevel.UNCLASSIFIED,
        'CONFIDENTIEL_DEFENSE': ClearanceLevel.CONFIDENTIAL,
        'CONFIDENTIEL DEFENSE': ClearanceLevel.CONFIDENTIAL,
        'SECRET_DEFENSE': ClearanceLevel.SECRET,
        'SECRET DEFENSE': ClearanceLevel.SECRET,
        'SECRET DÉFENSE': ClearanceLevel.SECRET,
        'TRES_SECRET_DEFENSE': ClearanceLevel.TOP_SECRET,
        'TRÈS SECRET DÉFENSE': ClearanceLevel.TOP_SECRET,

        // Canadian
        'PROTECTED_A': ClearanceLevel.UNCLASSIFIED,
        'PROTECTED_B': ClearanceLevel.CONFIDENTIAL,
        'PROTECTED A': ClearanceLevel.UNCLASSIFIED,
        'PROTECTED B': ClearanceLevel.CONFIDENTIAL,
        'SECRET': ClearanceLevel.SECRET,
        'TOP_SECRET': ClearanceLevel.TOP_SECRET,

        // German (DEU)
        'VERSCHLUSSSACHE_NUR_FUR_DEN_DIENSTGEBRAUCH': ClearanceLevel.UNCLASSIFIED,
        'VS-NUR FÜR DEN DIENSTGEBRAUCH': ClearanceLevel.UNCLASSIFIED,
        'VS-VERTRAULICH': ClearanceLevel.CONFIDENTIAL,
        'GEHEIM': ClearanceLevel.SECRET,
        'STRENG GEHEIM': ClearanceLevel.TOP_SECRET,

        // Industry (contractor levels)
        'PUBLIC': ClearanceLevel.UNCLASSIFIED,
        'SENSITIVE': ClearanceLevel.CONFIDENTIAL,
        'RESTRICTED': ClearanceLevel.SECRET,
        'PROPRIETARY': ClearanceLevel.CONFIDENTIAL
    };

    /**
     * Normalize a clearance level to NATO standard
     * @param clearance Raw clearance string from IdP
     * @returns NATO-standard clearance level
     */
    public static normalize(clearance: string | undefined): ClearanceLevel {
        if (!clearance) {
            logger.warn('No clearance provided, defaulting to UNCLASSIFIED');
            return ClearanceLevel.UNCLASSIFIED;
        }

        const normalized = this.CLEARANCE_MAP[clearance.toUpperCase().trim()];
        
        if (!normalized) {
            logger.warn('Unknown clearance level, defaulting to UNCLASSIFIED', {
                rawClearance: clearance
            });
            return ClearanceLevel.UNCLASSIFIED;
        }

        logger.debug('Clearance normalized', {
            input: clearance,
            output: normalized
        });

        return normalized;
    }

    /**
     * Check if clearance requires MFA
     * @param clearance Clearance level (normalized or raw)
     * @returns true if MFA is required
     */
    public static requiresMFA(clearance: string | ClearanceLevel): boolean {
        const normalized = typeof clearance === 'string' 
            ? this.normalize(clearance)
            : clearance;

        const requiresMFA = normalized !== ClearanceLevel.UNCLASSIFIED;

        logger.debug('MFA requirement check', {
            clearance: normalized,
            requiresMFA
        });

        return requiresMFA;
    }

    /**
     * Get clearance hierarchy level (for comparison)
     * @param clearance Clearance level
     * @returns Numeric level (0-3)
     */
    public static getLevel(clearance: ClearanceLevel): number {
        const levels: Record<ClearanceLevel, number> = {
            [ClearanceLevel.UNCLASSIFIED]: 0,
            [ClearanceLevel.CONFIDENTIAL]: 1,
            [ClearanceLevel.SECRET]: 2,
            [ClearanceLevel.TOP_SECRET]: 3
        };

        return levels[clearance];
    }

    /**
     * Check if user clearance is sufficient for resource
     * @param userClearance User's clearance level
     * @param resourceClassification Resource classification
     * @returns true if user has sufficient clearance
     */
    public static hasSufficientClearance(
        userClearance: string | ClearanceLevel,
        resourceClassification: string | ClearanceLevel
    ): boolean {
        const userLevel = this.getLevel(
            typeof userClearance === 'string' 
                ? this.normalize(userClearance)
                : userClearance
        );

        const resourceLevel = this.getLevel(
            typeof resourceClassification === 'string'
                ? this.normalize(resourceClassification)
                : resourceClassification
        );

        return userLevel >= resourceLevel;
    }
}
```

### 3.4: Update Custom Login Controller

**Update**: `backend/src/controllers/custom-login.controller.ts`

Add import:
```typescript
import { ClearanceMapperService } from '../services/clearance-mapper.service';
```

Replace clearance check (around line 209):
```typescript
// OLD:
const clearance = (userAttributes.clearance && Array.isArray(userAttributes.clearance))
    ? userAttributes.clearance[0]
    : (userAttributes.clearance || 'UNCLASSIFIED');

const needsMFA = clearance && clearance !== 'UNCLASSIFIED';

// NEW:
const rawClearance = (userAttributes.clearance && Array.isArray(userAttributes.clearance))
    ? userAttributes.clearance[0]
    : (userAttributes.clearance || 'UNCLASSIFIED');

const clearance = ClearanceMapperService.normalize(rawClearance);
const needsMFA = ClearanceMapperService.requiresMFA(clearance);

logger.info('Post-auth clearance check', {
    requestId,
    username,
    rawClearance,
    normalizedClearance: clearance,
    needsMFA,
    hasOTPConfigured,
    totpConfigured
});
```

### 3.5: Update Frontend Login Config

**Update**: `frontend/public/login-config.json`

```json
{
  "dive-v3-broker": {
    "displayName": {
      "en": "DIVE V3 Super Administrator",
      "fr": "Super Administrateur DIVE V3"
    },
    "description": {
      "en": {
        "title": "Welcome to DIVE V3",
        "subtitle": "Super Admin Portal",
        "content": "Manage all identity providers and access control policies.",
        "features": [
          { "icon": "🔐", "text": "Multi-Factor Authentication" },
          { "icon": "🛡️", "text": "NATO ACP-240 Compliant" },
          { "icon": "⚡", "text": "Real-Time Authorization" }
        ]
      },
      "fr": {
        "title": "Bienvenue à DIVE V3",
        "subtitle": "Portail Super Administrateur",
        "content": "Gérez tous les fournisseurs d'identité et les politiques de contrôle d'accès.",
        "features": [
          { "icon": "🔐", "text": "Authentification Multi-Facteurs" },
          { "icon": "🛡️", "text": "Conforme ACP-240 OTAN" },
          { "icon": "⚡", "text": "Autorisation en Temps Réel" }
        ]
      }
    },
    "theme": {
      "colors": {
        "primary": "#6B46C1",
        "secondary": "#F59E0B",
        "accent": "#9333EA"
      },
      "background": {
        "imageUrl": "/login-backgrounds/dive-v3-broker.jpg"
      },
      "logo": "/logos/dive-v3-logo.svg"
    }
  },
  "dive-v3-usa": {
    "displayName": {
      "en": "U.S. Government Users",
      "fr": "Utilisateurs du gouvernement américain"
    },
    "description": {
      "en": {
        "title": "Welcome, U.S. Users",
        "subtitle": "Secure Authentication Portal",
        "content": "Access classified resources with your DoD credentials. MFA required for CONFIDENTIAL and above.",
        "features": [
          { "icon": "🇺🇸", "text": "DoD CAC/PIV Compatible" },
          { "icon": "🔐", "text": "NIST AAL2 MFA Required" },
          { "icon": "⚡", "text": "15-Minute Session Timeout" }
        ]
      },
      "fr": {
        "title": "Bienvenue, utilisateurs américains",
        "subtitle": "Portail d'authentification sécurisé",
        "content": "Accédez aux ressources classifiées avec vos identifiants DoD. MFA requis pour CONFIDENTIEL et au-dessus.",
        "features": [
          { "icon": "🇺🇸", "text": "Compatible DoD CAC/PIV" },
          { "icon": "🔐", "text": "MFA NIST AAL2 requis" },
          { "icon": "⚡", "text": "Délai de session de 15 minutes" }
        ]
      }
    },
    "theme": {
      "colors": {
        "primary": "#B22234",
        "secondary": "#3C3B6E",
        "accent": "#FFFFFF"
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
    "description": {
      "en": {
        "title": "Bienvenue, French Users",
        "subtitle": "Portail d'Authentification Sécurisé",
        "content": "Access classified resources with your French defense credentials. MFA required for CONFIDENTIEL DÉFENSE and above.",
        "features": [
          { "icon": "🇫🇷", "text": "French Defense Compatible" },
          { "icon": "🔐", "text": "ANSSI RGS Level 2+ MFA" },
          { "icon": "⚡", "text": "30-Minute Session Timeout" }
        ]
      },
      "fr": {
        "title": "Bienvenue, utilisateurs français",
        "subtitle": "Portail d'authentification sécurisé",
        "content": "Accédez aux ressources classifiées avec vos identifiants de défense française. MFA requis pour CONFIDENTIEL DÉFENSE et au-dessus.",
        "features": [
          { "icon": "🇫🇷", "text": "Compatible Défense Française" },
          { "icon": "🔐", "text": "MFA ANSSI RGS Niveau 2+" },
          { "icon": "⚡", "text": "Délai de session de 30 minutes" }
        ]
      }
    },
    "theme": {
      "colors": {
        "primary": "#0055A4",
        "secondary": "#EF4135",
        "accent": "#FFFFFF"
      },
      "background": {
        "imageUrl": "/login-backgrounds/dive-v3-fra.jpg"
      },
      "logo": "/logos/france-flag.svg"
    }
  },
  "dive-v3-can": {
    "displayName": {
      "en": "Canadian Defense Users",
      "fr": "Utilisateurs de la défense canadienne"
    },
    "description": {
      "en": {
        "title": "Welcome, Canadian Users",
        "subtitle": "Secure Authentication Portal",
        "content": "Access classified resources with your Canadian defense credentials. MFA required for PROTECTED B and above.",
        "features": [
          { "icon": "🇨🇦", "text": "Canadian Defense Compatible" },
          { "icon": "🔐", "text": "GCCF Level 2+ MFA Required" },
          { "icon": "⚡", "text": "20-Minute Session Timeout" }
        ]
      },
      "fr": {
        "title": "Bienvenue, utilisateurs canadiens",
        "subtitle": "Portail d'authentification sécurisé",
        "content": "Accédez aux ressources classifiées avec vos identifiants de défense canadienne. MFA requis pour PROTÉGÉ B et au-dessus.",
        "features": [
          { "icon": "🇨🇦", "text": "Compatible Défense Canadienne" },
          { "icon": "🔐", "text": "MFA GCCF Niveau 2+ requis" },
          { "icon": "⚡", "text": "Délai de session de 20 minutes" }
        ]
      }
    },
    "theme": {
      "colors": {
        "primary": "#FF0000",
        "secondary": "#FFFFFF",
        "accent": "#FF0000"
      },
      "background": {
        "imageUrl": "/login-backgrounds/dive-v3-can.jpg"
      },
      "logo": "/logos/canada-flag.svg"
    }
  },
  "dive-v3-industry": {
    "displayName": {
      "en": "Defense Industry Partners",
      "fr": "Partenaires de l'industrie de défense"
    },
    "description": {
      "en": {
        "title": "Welcome, Industry Partners",
        "subtitle": "Contractor Access Portal",
        "content": "Access shared resources with your company credentials. MFA required for SENSITIVE and above.",
        "features": [
          { "icon": "🏢", "text": "Defense Contractor Access" },
          { "icon": "🔐", "text": "MFA Required for Sensitive" },
          { "icon": "⚡", "text": "60-Minute Session Timeout" }
        ]
      },
      "fr": {
        "title": "Bienvenue, partenaires industriels",
        "subtitle": "Portail d'accès contractant",
        "content": "Accédez aux ressources partagées avec vos identifiants d'entreprise. MFA requis pour SENSIBLE et au-dessus.",
        "features": [
          { "icon": "🏢", "text": "Accès entrepreneur de défense" },
          { "icon": "🔐", "text": "MFA requis pour Sensible" },
          { "icon": "⚡", "text": "Délai de session de 60 minutes" }
        ]
      }
    },
    "theme": {
      "colors": {
        "primary": "#6B46C1",
        "secondary": "#9333EA",
        "accent": "#F59E0B"
      },
      "background": {
        "imageUrl": "/login-backgrounds/dive-v3-industry.jpg"
      },
      "logo": "/logos/dive-v3-logo.svg"
    }
  }
}
```

### 3.6: Create Clearance Mapper Tests

**File**: `backend/src/__tests__/clearance-mapper.service.test.ts`

```typescript
import { ClearanceMapperService, ClearanceLevel } from '../services/clearance-mapper.service';

describe('ClearanceMapperService', () => {
    describe('normalize', () => {
        it('should normalize U.S. clearances', () => {
            expect(ClearanceMapperService.normalize('UNCLASSIFIED')).toBe(ClearanceLevel.UNCLASSIFIED);
            expect(ClearanceMapperService.normalize('CONFIDENTIAL')).toBe(ClearanceLevel.CONFIDENTIAL);
            expect(ClearanceMapperService.normalize('SECRET')).toBe(ClearanceLevel.SECRET);
            expect(ClearanceMapperService.normalize('TOP_SECRET')).toBe(ClearanceLevel.TOP_SECRET);
            expect(ClearanceMapperService.normalize('TOP SECRET')).toBe(ClearanceLevel.TOP_SECRET);
        });

        it('should normalize French clearances', () => {
            expect(ClearanceMapperService.normalize('DIFFUSION_RESTREINTE')).toBe(ClearanceLevel.UNCLASSIFIED);
            expect(ClearanceMapperService.normalize('CONFIDENTIEL_DEFENSE')).toBe(ClearanceLevel.CONFIDENTIAL);
            expect(ClearanceMapperService.normalize('SECRET_DEFENSE')).toBe(ClearanceLevel.SECRET);
            expect(ClearanceMapperService.normalize('SECRET DÉFENSE')).toBe(ClearanceLevel.SECRET);
            expect(ClearanceMapperService.normalize('TRES_SECRET_DEFENSE')).toBe(ClearanceLevel.TOP_SECRET);
        });

        it('should normalize Canadian clearances', () => {
            expect(ClearanceMapperService.normalize('PROTECTED_A')).toBe(ClearanceLevel.UNCLASSIFIED);
            expect(ClearanceMapperService.normalize('PROTECTED_B')).toBe(ClearanceLevel.CONFIDENTIAL);
            expect(ClearanceMapperService.normalize('SECRET')).toBe(ClearanceLevel.SECRET);
            expect(ClearanceMapperService.normalize('TOP_SECRET')).toBe(ClearanceLevel.TOP_SECRET);
        });

        it('should normalize German clearances', () => {
            expect(ClearanceMapperService.normalize('VS-VERTRAULICH')).toBe(ClearanceLevel.CONFIDENTIAL);
            expect(ClearanceMapperService.normalize('GEHEIM')).toBe(ClearanceLevel.SECRET);
            expect(ClearanceMapperService.normalize('STRENG GEHEIM')).toBe(ClearanceLevel.TOP_SECRET);
        });

        it('should normalize industry clearances', () => {
            expect(ClearanceMapperService.normalize('PUBLIC')).toBe(ClearanceLevel.UNCLASSIFIED);
            expect(ClearanceMapperService.normalize('SENSITIVE')).toBe(ClearanceLevel.CONFIDENTIAL);
            expect(ClearanceMapperService.normalize('RESTRICTED')).toBe(ClearanceLevel.SECRET);
        });

        it('should handle case insensitivity', () => {
            expect(ClearanceMapperService.normalize('secret')).toBe(ClearanceLevel.SECRET);
            expect(ClearanceMapperService.normalize('Secret')).toBe(ClearanceLevel.SECRET);
            expect(ClearanceMapperService.normalize('SECRET')).toBe(ClearanceLevel.SECRET);
        });

        it('should handle undefined/null gracefully', () => {
            expect(ClearanceMapperService.normalize(undefined)).toBe(ClearanceLevel.UNCLASSIFIED);
            expect(ClearanceMapperService.normalize('')).toBe(ClearanceLevel.UNCLASSIFIED);
        });

        it('should default unknown clearances to UNCLASSIFIED', () => {
            expect(ClearanceMapperService.normalize('UNKNOWN_LEVEL')).toBe(ClearanceLevel.UNCLASSIFIED);
            expect(ClearanceMapperService.normalize('RANDOM')).toBe(ClearanceLevel.UNCLASSIFIED);
        });
    });

    describe('requiresMFA', () => {
        it('should require MFA for CONFIDENTIAL', () => {
            expect(ClearanceMapperService.requiresMFA(ClearanceLevel.CONFIDENTIAL)).toBe(true);
            expect(ClearanceMapperService.requiresMFA('CONFIDENTIAL')).toBe(true);
        });

        it('should require MFA for SECRET', () => {
            expect(ClearanceMapperService.requiresMFA(ClearanceLevel.SECRET)).toBe(true);
            expect(ClearanceMapperService.requiresMFA('SECRET')).toBe(true);
        });

        it('should require MFA for TOP_SECRET', () => {
            expect(ClearanceMapperService.requiresMFA(ClearanceLevel.TOP_SECRET)).toBe(true);
            expect(ClearanceMapperService.requiresMFA('TOP_SECRET')).toBe(true);
        });

        it('should NOT require MFA for UNCLASSIFIED', () => {
            expect(ClearanceMapperService.requiresMFA(ClearanceLevel.UNCLASSIFIED)).toBe(false);
            expect(ClearanceMapperService.requiresMFA('UNCLASSIFIED')).toBe(false);
        });

        it('should require MFA for French CONFIDENTIEL DEFENSE', () => {
            expect(ClearanceMapperService.requiresMFA('CONFIDENTIEL_DEFENSE')).toBe(true);
        });

        it('should require MFA for Canadian PROTECTED_B', () => {
            expect(ClearanceMapperService.requiresMFA('PROTECTED_B')).toBe(true);
        });
    });

    describe('hasSufficientClearance', () => {
        it('should allow TOP_SECRET user to access SECRET resource', () => {
            expect(ClearanceMapperService.hasSufficientClearance(
                ClearanceLevel.TOP_SECRET,
                ClearanceLevel.SECRET
            )).toBe(true);
        });

        it('should allow SECRET user to access CONFIDENTIAL resource', () => {
            expect(ClearanceMapperService.hasSufficientClearance(
                ClearanceLevel.SECRET,
                ClearanceLevel.CONFIDENTIAL
            )).toBe(true);
        });

        it('should deny CONFIDENTIAL user accessing SECRET resource', () => {
            expect(ClearanceMapperService.hasSufficientClearance(
                ClearanceLevel.CONFIDENTIAL,
                ClearanceLevel.SECRET
            )).toBe(false);
        });

        it('should deny UNCLASSIFIED user accessing CONFIDENTIAL resource', () => {
            expect(ClearanceMapperService.hasSufficientClearance(
                ClearanceLevel.UNCLASSIFIED,
                ClearanceLevel.CONFIDENTIAL
            )).toBe(false);
        });

        it('should allow equal clearance levels', () => {
            expect(ClearanceMapperService.hasSufficientClearance(
                ClearanceLevel.SECRET,
                ClearanceLevel.SECRET
            )).toBe(true);
        });

        it('should work with raw clearance strings', () => {
            expect(ClearanceMapperService.hasSufficientClearance(
                'SECRET_DEFENSE',  // French SECRET
                'CONFIDENTIAL'
            )).toBe(true);

            expect(ClearanceMapperService.hasSufficientClearance(
                'PROTECTED_B',  // Canadian CONFIDENTIAL equivalent
                'SECRET'
            )).toBe(false);
        });
    });
});
```

---

## Task 4: Dynamic Config Sync - Detailed Spec

### Objective
Automatically synchronize backend rate limiting with Keycloak brute force configuration, eliminating hardcoded values.

### 4.1: Create Keycloak Config Sync Service

**File**: `backend/src/services/keycloak-config-sync.service.ts`

```typescript
/**
 * Keycloak Config Sync Service
 * 
 * Automatically syncs backend rate limiting with Keycloak brute force configuration
 * Eliminates hardcoded MAX_ATTEMPTS and WINDOW_MS values
 * 
 * Usage:
 *   const maxAttempts = await KeycloakConfigSyncService.getMaxAttempts('dive-v3-broker');
 *   const windowMs = await KeycloakConfigSyncService.getWindowMs('dive-v3-broker');
 */

import axios from 'axios';
import { logger } from '../utils/logger';

interface BruteForceConfig {
    maxLoginFailures: number;
    waitIncrementSeconds: number;
    maxFailureWaitSeconds: number;
    failureResetTimeSeconds: number;
    lastSynced: number;
}

export class KeycloakConfigSyncService {
    private static configCache: Map<string, BruteForceConfig> = new Map();
    private static readonly SYNC_INTERVAL_MS = 60000; // 1 minute cache TTL
    private static adminTokenCache: { token: string; expiresAt: number } | null = null;

    /**
     * Get max login attempts for a realm
     * @param realmId Keycloak realm ID
     * @returns Max login attempts before lockout
     */
    public static async getMaxAttempts(realmId: string): Promise<number> {
        await this.syncIfNeeded(realmId);
        const config = this.configCache.get(realmId);
        return config?.maxLoginFailures || 8; // Fallback to 8
    }

    /**
     * Get rate limit window in milliseconds
     * @param realmId Keycloak realm ID
     * @returns Window in milliseconds
     */
    public static async getWindowMs(realmId: string): Promise<number> {
        await this.syncIfNeeded(realmId);
        const config = this.configCache.get(realmId);
        const seconds = config?.failureResetTimeSeconds || 900; // Fallback to 15 minutes
        return seconds * 1000;
    }

    /**
     * Get full brute force configuration
     * @param realmId Keycloak realm ID
     * @returns Complete brute force config
     */
    public static async getConfig(realmId: string): Promise<BruteForceConfig | null> {
        await this.syncIfNeeded(realmId);
        return this.configCache.get(realmId) || null;
    }

    /**
     * Force immediate sync (bypass cache)
     * @param realmId Keycloak realm ID
     */
    public static async forceSync(realmId: string): Promise<void> {
        this.configCache.delete(realmId);
        await this.syncFromKeycloak(realmId);
    }

    /**
     * Sync all known realms
     */
    public static async syncAllRealms(): Promise<void> {
        const realms = [
            'dive-v3-broker',
            'dive-v3-usa',
            'dive-v3-fra',
            'dive-v3-can',
            'dive-v3-industry'
        ];

        await Promise.all(realms.map(realm => this.forceSync(realm)));
        
        logger.info('Synced all realm configurations', {
            realms,
            cachedConfigs: Array.from(this.configCache.entries()).map(([realm, config]) => ({
                realm,
                maxAttempts: config.maxLoginFailures
            }))
        });
    }

    /**
     * Sync if cache is stale
     */
    private static async syncIfNeeded(realmId: string): Promise<void> {
        const cached = this.configCache.get(realmId);
        const now = Date.now();

        if (!cached || (now - cached.lastSynced) > this.SYNC_INTERVAL_MS) {
            await this.syncFromKeycloak(realmId);
        }
    }

    /**
     * Fetch configuration from Keycloak Admin API
     */
    private static async syncFromKeycloak(realmId: string): Promise<void> {
        try {
            const keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
            const adminToken = await this.getAdminToken();

            // Fetch realm configuration
            const realmResponse = await axios.get(
                `${keycloakUrl}/admin/realms/${realmId}`,
                {
                    headers: { Authorization: `Bearer ${adminToken}` },
                    timeout: 5000
                }
            );

            const realmData = realmResponse.data;

            // Extract brute force settings
            const config: BruteForceConfig = {
                maxLoginFailures: realmData.bruteForceProtected 
                    ? (realmData.maxFailureWaitSeconds || 8)
                    : 8,
                waitIncrementSeconds: realmData.waitIncrementSeconds || 60,
                maxFailureWaitSeconds: realmData.maxFailureWaitSeconds || 300,
                failureResetTimeSeconds: realmData.failureResetTime || 900,
                lastSynced: Date.now()
            };

            this.configCache.set(realmId, config);

            logger.info('Synced brute force config from Keycloak', {
                realmId,
                maxAttempts: config.maxLoginFailures,
                windowSeconds: config.failureResetTimeSeconds,
                cacheTTL: this.SYNC_INTERVAL_MS / 1000
            });

        } catch (error) {
            logger.error('Failed to sync Keycloak config', {
                realmId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });

            // If sync fails and no cache exists, use defaults
            if (!this.configCache.has(realmId)) {
                this.configCache.set(realmId, {
                    maxLoginFailures: 8,
                    waitIncrementSeconds: 60,
                    maxFailureWaitSeconds: 300,
                    failureResetTimeSeconds: 900,
                    lastSynced: Date.now()
                });
                
                logger.warn('Using default brute force config', {
                    realmId,
                    reason: 'Keycloak sync failed'
                });
            }
        }
    }

    /**
     * Get admin access token (cached with expiration)
     */
    private static async getAdminToken(): Promise<string> {
        const now = Date.now();

        // Return cached token if still valid (with 30s buffer)
        if (this.adminTokenCache && this.adminTokenCache.expiresAt > (now + 30000)) {
            return this.adminTokenCache.token;
        }

        // Fetch new token
        const keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
        const adminUsername = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

        const tokenResponse = await axios.post(
            `${keycloakUrl}/realms/master/protocol/openid-connect/token`,
            new URLSearchParams({
                grant_type: 'password',
                client_id: 'admin-cli',
                username: adminUsername,
                password: adminPassword
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 5000
            }
        );

        const expiresIn = tokenResponse.data.expires_in || 60;
        this.adminTokenCache = {
            token: tokenResponse.data.access_token,
            expiresAt: now + (expiresIn * 1000)
        };

        return this.adminTokenCache.token;
    }

    /**
     * Clear all caches (useful for testing)
     */
    public static clearCaches(): void {
        this.configCache.clear();
        this.adminTokenCache = null;
    }
}
```

### 4.2: Update Custom Login Controller

**Update**: `backend/src/controllers/custom-login.controller.ts`

Replace hardcoded constants:
```typescript
// OLD (lines 30-32):
// Export for testing purposes
export const loginAttempts: LoginAttempt[] = [];
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

// NEW:
import { KeycloakConfigSyncService } from '../services/keycloak-config-sync.service';

// Export for testing purposes
export const loginAttempts: LoginAttempt[] = [];
```

Update `isRateLimited` function:
```typescript
// OLD:
function isRateLimited(ip: string, username: string): boolean {
    const now = Date.now();
    const recentAttempts = loginAttempts.filter(
        a => a.ip === ip && a.username === username && (now - a.timestamp) < WINDOW_MS
    );

    return recentAttempts.length >= MAX_ATTEMPTS;
}

// NEW:
async function isRateLimited(ip: string, username: string, realmId: string): Promise<boolean> {
    const maxAttempts = await KeycloakConfigSyncService.getMaxAttempts(realmId);
    const windowMs = await KeycloakConfigSyncService.getWindowMs(realmId);
    
    const now = Date.now();
    const recentAttempts = loginAttempts.filter(
        a => a.ip === ip && a.username === username && (now - a.timestamp) < windowMs
    );

    return recentAttempts.length >= maxAttempts;
}
```

Update handler to use async rate limiting:
```typescript
// In customLoginHandler (around line 85):
// OLD:
if (isRateLimited(clientIp, username)) {
    logger.warn('Login rate limit exceeded', { requestId, ip: clientIp, username });
    res.status(429).json({
        success: false,
        error: 'Too many login attempts. Please try again in 15 minutes.'
    });
    return;
}

// NEW:
const rateLimited = await isRateLimited(clientIp, username, realmName);
if (rateLimited) {
    const maxAttempts = await KeycloakConfigSyncService.getMaxAttempts(realmName);
    const windowMinutes = Math.floor(await KeycloakConfigSyncService.getWindowMs(realmName) / 60000);
    
    logger.warn('Login rate limit exceeded', {
        requestId,
        ip: clientIp,
        username,
        maxAttempts,
        windowMinutes
    });

    res.status(429).json({
        success: false,
        error: `Too many login attempts (${maxAttempts} max). Please try again in ${windowMinutes} minutes.`,
        details: { maxAttempts, windowMinutes }
    });
    return;
}
```

### 4.3: Add Startup Sync

**Update**: `backend/src/server.ts`

Add import:
```typescript
import { KeycloakConfigSyncService } from './services/keycloak-config-sync.service';
```

Add after server start:
```typescript
app.listen(PORT, async () => {
    logger.info('Server started', { port: PORT, env: NODE_ENV });

    // Initial sync of Keycloak brute force configurations
    try {
        await KeycloakConfigSyncService.syncAllRealms();
        logger.info('Initial Keycloak config sync complete');
    } catch (error) {
        logger.error('Initial Keycloak config sync failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }

    // Periodic sync every 5 minutes
    setInterval(async () => {
        try {
            await KeycloakConfigSyncService.syncAllRealms();
            logger.debug('Periodic Keycloak config sync complete');
        } catch (error) {
            logger.error('Periodic Keycloak config sync failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }, 5 * 60 * 1000);
});
```

### 4.4: Create Health Check Endpoint

**Update**: `backend/src/controllers/health.controller.ts` (or create if doesn't exist)

```typescript
import { Request, Response } from 'express';
import { KeycloakConfigSyncService } from '../services/keycloak-config-sync.service';

export const healthBruteForceConfigHandler = async (req: Request, res: Response) => {
    const realm = (req.query.realm as string) || 'dive-v3-broker';

    try {
        const config = await KeycloakConfigSyncService.getConfig(realm);

        if (!config) {
            return res.status(404).json({
                error: 'Configuration not found',
                realm
            });
        }

        const ageSeconds = Math.floor((Date.now() - config.lastSynced) / 1000);

        res.json({
            realm,
            bruteForceConfig: {
                maxLoginAttempts: config.maxLoginFailures,
                windowMs: config.failureResetTimeSeconds * 1000,
                windowMinutes: Math.floor(config.failureResetTimeSeconds / 60),
                waitIncrementSeconds: config.waitIncrementSeconds,
                maxFailureWaitSeconds: config.maxFailureWaitSeconds
            },
            cache: {
                lastSyncedAgo: `${ageSeconds} seconds ago`,
                lastSyncedAt: new Date(config.lastSynced).toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to retrieve configuration',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
```

Add route:
```typescript
router.get('/health/brute-force-config', healthBruteForceConfigHandler);
```

### 4.5: Create Config Sync Tests

**File**: `backend/src/__tests__/keycloak-config-sync.service.test.ts`

```typescript
import { KeycloakConfigSyncService } from '../services/keycloak-config-sync.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KeycloakConfigSyncService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        KeycloakConfigSyncService.clearCaches();
    });

    const mockRealmConfig = {
        bruteForceProtected: true,
        maxFailureWaitSeconds: 8,
        waitIncrementSeconds: 60,
        maxFailureWaitSeconds: 300,
        failureResetTime: 900
    };

    const mockAdminToken = {
        access_token: 'admin_token',
        expires_in: 60
    };

    it('should fetch and cache configuration from Keycloak', async () => {
        mockedAxios.post.mockResolvedValueOnce({ data: mockAdminToken });
        mockedAxios.get.mockResolvedValueOnce({ data: mockRealmConfig });

        const maxAttempts = await KeycloakConfigSyncService.getMaxAttempts('dive-v3-broker');

        expect(maxAttempts).toBe(8);
        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.stringContaining('/admin/realms/dive-v3-broker'),
            expect.any(Object)
        );
    });

    it('should return cached value on subsequent calls', async () => {
        mockedAxios.post.mockResolvedValueOnce({ data: mockAdminToken });
        mockedAxios.get.mockResolvedValueOnce({ data: mockRealmConfig });

        // First call
        await KeycloakConfigSyncService.getMaxAttempts('dive-v3-broker');

        // Second call (should use cache)
        await KeycloakConfigSyncService.getMaxAttempts('dive-v3-broker');

        // Should only call Keycloak once
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it('should convert seconds to milliseconds for window', async () => {
        mockedAxios.post.mockResolvedValueOnce({ data: mockAdminToken });
        mockedAxios.get.mockResolvedValueOnce({ data: mockRealmConfig });

        const windowMs = await KeycloakConfigSyncService.getWindowMs('dive-v3-broker');

        expect(windowMs).toBe(900 * 1000); // 15 minutes in ms
    });

    it('should use default values on Keycloak failure', async () => {
        mockedAxios.post.mockRejectedValueOnce(new Error('Connection refused'));

        const maxAttempts = await KeycloakConfigSyncService.getMaxAttempts('dive-v3-broker');

        expect(maxAttempts).toBe(8); // Default fallback
    });

    it('should sync all realms', async () => {
        mockedAxios.post.mockResolvedValue({ data: mockAdminToken });
        mockedAxios.get.mockResolvedValue({ data: mockRealmConfig });

        await KeycloakConfigSyncService.syncAllRealms();

        // Should call Keycloak for each realm
        expect(mockedAxios.get).toHaveBeenCalledTimes(5); // 5 realms
    });

    it('should force sync bypass cache', async () => {
        mockedAxios.post.mockResolvedValue({ data: mockAdminToken });
        mockedAxios.get.mockResolvedValue({ data: mockRealmConfig });

        // First call
        await KeycloakConfigSyncService.getMaxAttempts('dive-v3-broker');

        // Force sync
        await KeycloakConfigSyncService.forceSync('dive-v3-broker');

        // Should call Keycloak twice
        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it('should cache admin token', async () => {
        mockedAxios.post.mockResolvedValue({ data: mockAdminToken });
        mockedAxios.get.mockResolvedValue({ data: mockRealmConfig });

        // First call
        await KeycloakConfigSyncService.getMaxAttempts('dive-v3-broker');

        // Second call for different realm
        await KeycloakConfigSyncService.getMaxAttempts('dive-v3-usa');

        // Should only fetch admin token once
        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
});
```

---

## Testing Requirements

### Unit Tests to Create

1. **Clearance Mapper Tests** (Task 3):
   - File: `backend/src/__tests__/clearance-mapper.service.test.ts`
   - Tests: ~15 tests
   - Coverage: 100% of normalize(), requiresMFA(), hasSufficientClearance()

2. **Config Sync Tests** (Task 4):
   - File: `backend/src/__tests__/keycloak-config-sync.service.test.ts`
   - Tests: ~8 tests
   - Coverage: Cache behavior, fallbacks, error handling

3. **Integration Tests**:
   - Update `custom-login.controller.test.ts` to test all 5 realms
   - Test clearance mapper in login flow
   - Test dynamic rate limiting

### E2E Tests to Update

1. **Multi-Realm E2E**:
   - Test USA realm login with CONFIDENTIAL clearance
   - Test France realm login with SECRET_DEFENSE clearance
   - Test Canada realm login with PROTECTED_B clearance
   - Test Industry realm login with SENSITIVE clearance

2. **Performance Tests**:
   - Verify config sync doesn't slow down auth (<50ms overhead)
   - Test cache behavior under load

---

## Implementation Checklist

### Task 3: Multi-Realm Expansion

- [ ] **Step 1**: Create Terraform module
  - [ ] Create `terraform/modules/realm-mfa/main.tf`
  - [ ] Create `terraform/modules/realm-mfa/variables.tf`
  - [ ] Create `terraform/modules/realm-mfa/outputs.tf`

- [ ] **Step 2**: Apply module to realms
  - [ ] Update `terraform/usa-realm.tf`
  - [ ] Update `terraform/fra-realm.tf`
  - [ ] Update `terraform/can-realm.tf`
  - [ ] Update `terraform/industry-realm.tf`

- [ ] **Step 3**: Create clearance mapper
  - [ ] Create `backend/src/services/clearance-mapper.service.ts`
  - [ ] Create `backend/src/__tests__/clearance-mapper.service.test.ts`
  - [ ] Run tests: `npm run test -- clearance-mapper.service.test.ts`

- [ ] **Step 4**: Update controllers
  - [ ] Update `backend/src/controllers/custom-login.controller.ts` (clearance normalization)
  - [ ] Update `backend/src/controllers/otp-setup.controller.ts` (realm-aware labels)

- [ ] **Step 5**: Update frontend config
  - [ ] Update `frontend/public/login-config.json` (add all 5 realms)
  - [ ] Add background images for each realm
  - [ ] Add flag logos for each realm

- [ ] **Step 6**: Deploy and test
  - [ ] Run `terraform plan` to verify changes
  - [ ] Run `terraform apply` to deploy MFA to all realms
  - [ ] Test each realm manually
  - [ ] Run E2E tests

### Task 4: Dynamic Config Sync

- [ ] **Step 1**: Create config sync service
  - [ ] Create `backend/src/services/keycloak-config-sync.service.ts`
  - [ ] Create `backend/src/__tests__/keycloak-config-sync.service.test.ts`
  - [ ] Run tests: `npm run test -- keycloak-config-sync.service.test.ts`

- [ ] **Step 2**: Update custom login controller
  - [ ] Replace hardcoded MAX_ATTEMPTS and WINDOW_MS
  - [ ] Update `isRateLimited()` to use async config
  - [ ] Update error messages to include dynamic values

- [ ] **Step 3**: Add startup sync
  - [ ] Update `backend/src/server.ts` (initial sync + periodic sync)
  - [ ] Test startup behavior

- [ ] **Step 4**: Create health check
  - [ ] Create/update `backend/src/controllers/health.controller.ts`
  - [ ] Add `/health/brute-force-config` endpoint
  - [ ] Test endpoint: `curl http://localhost:4000/health/brute-force-config?realm=dive-v3-broker`

- [ ] **Step 5**: Update documentation
  - [ ] Update `docs/MFA-OTP-IMPLEMENTATION.md` (add config sync section)
  - [ ] Create admin guide for monitoring sync status

---

## Verification & Testing

### Manual Testing Checklist

**Task 3 Verification**:
1. [ ] Login to `dive-v3-usa` with CONFIDENTIAL clearance → MFA required
2. [ ] Login to `dive-v3-fra` with SECRET_DEFENSE clearance → MFA required
3. [ ] Login to `dive-v3-can` with PROTECTED_B clearance → MFA required
4. [ ] Login to `dive-v3-industry` with SENSITIVE clearance → MFA required
5. [ ] Login to any realm with UNCLASSIFIED → No MFA
6. [ ] Verify QR code labels are realm-appropriate
7. [ ] Verify multilingual support works (EN/FR)
8. [ ] Verify all 5 realm backgrounds display correctly

**Task 4 Verification**:
1. [ ] Check health endpoint: `curl http://localhost:4000/health/brute-force-config`
2. [ ] Verify rate limit matches Keycloak config
3. [ ] Make 8 failed login attempts → should be blocked
4. [ ] Update Keycloak config in Terraform (change max attempts to 5)
5. [ ] Run `terraform apply`
6. [ ] Wait 1 minute for sync
7. [ ] Make 5 failed attempts → should be blocked
8. [ ] Verify error message shows correct attempt count
9. [ ] Check logs for sync events

### Automated Testing

```bash
# Backend unit tests
cd backend
npm run test -- clearance-mapper.service.test.ts
npm run test -- keycloak-config-sync.service.test.ts
npm run test -- custom-login.controller.test.ts

# E2E tests
cd frontend
npm run test:e2e -- mfa-complete-flow.spec.ts

# Full test suite
cd backend && npm run test:coverage
cd frontend && npm run test:e2e
```

### Performance Testing

```bash
# Test config sync overhead
time curl -X POST http://localhost:4000/api/auth/custom-login \
  -H "Content-Type: application/json" \
  -d '{"idpAlias":"dive-v3-broker","username":"test","password":"test"}'

# Should complete in <200ms (including config sync)
```

---

## Success Criteria

### Task 3 Success Metrics
- [ ] All 5 realms have MFA configured in Terraform
- [ ] Clearance mapper service has 100% test coverage
- [ ] French clearances (e.g., SECRET_DEFENSE) correctly map to NATO levels
- [ ] Canadian clearances (e.g., PROTECTED_B) correctly map to NATO levels
- [ ] All realms display correct branding (backgrounds, logos, text)
- [ ] Multilingual support works for all realms
- [ ] No degradation in authentication performance (<200ms)

### Task 4 Success Metrics
- [ ] Backend rate limiting is 100% dynamic (no hardcoded values)
- [ ] Config sync service has ≥80% test coverage
- [ ] Health check endpoint returns current config
- [ ] Rate limits automatically update within 60 seconds
- [ ] Fallback to defaults on Keycloak failure
- [ ] No impact on authentication performance (<50ms overhead)
- [ ] Admin can monitor sync status via health endpoint

---

## Documentation Updates Required

### After Task 3
1. Update `docs/MFA-OTP-IMPLEMENTATION.md`:
   - Add "Multi-Realm Support" section
   - Document clearance mappings table
   - Add examples for each nation

2. Update `README.md`:
   - Update "MFA" section with multi-realm info
   - Add clearance mapping table

3. Update `CHANGELOG.md`:
   - Add Task 3 completion entry

### After Task 4
1. Update `docs/MFA-OTP-IMPLEMENTATION.md`:
   - Add "Dynamic Configuration Sync" section
   - Document health check endpoint
   - Add troubleshooting guide

2. Create `docs/admin-guides/MFA-CONFIGURATION-MONITORING.md`:
   - How to monitor sync status
   - How to force sync
   - How to troubleshoot sync failures

3. Update `CHANGELOG.md`:
   - Add Task 4 completion entry

---

## Common Issues & Troubleshooting

### Task 3 Issues

**Issue**: French clearances not mapping correctly
```
Solution:
- Check clearance-mapper.service.ts for exact string matching
- Verify SAML attribute names in Keycloak mappers
- Test with both underscore and space variants (e.g., SECRET_DEFENSE vs SECRET DEFENSE)
```

**Issue**: Terraform apply fails with "flow already exists"
```
Solution:
- Check if Direct Grant flow already exists in Keycloak
- Use `terraform import` to import existing flows
- Or delete existing flows manually via Keycloak Admin Console
```

**Issue**: Background images not displaying
```
Solution:
- Verify images are in /frontend/public/login-backgrounds/
- Check file names match login-config.json exactly
- Ensure images are publicly accessible (not in .gitignore)
```

### Task 4 Issues

**Issue**: Config sync failing with "Connection refused"
```
Solution:
- Verify Keycloak is running: curl http://localhost:8080/health
- Check KEYCLOAK_URL environment variable
- Verify admin credentials (KEYCLOAK_ADMIN_USERNAME, KEYCLOAK_ADMIN_PASSWORD)
```

**Issue**: Rate limiting not updating after Terraform apply
```
Solution:
- Wait 60 seconds for cache to expire
- Or force sync: curl -X POST http://localhost:4000/health/brute-force-config/sync
- Check logs for sync errors
```

**Issue**: Health check endpoint returns 404
```
Solution:
- Verify route is registered in backend/src/routes/health.routes.ts
- Check server logs for startup errors
- Restart backend: npm run dev
```

---

## Reference Documentation

### Already Created (READ THESE FIRST)
1. **`docs/MFA-OTP-IMPLEMENTATION.md`** (1,577 lines)
   - Complete technical implementation details
   - Architecture diagrams
   - Security considerations
   - Current implementation status

2. **`docs/MFA-TESTING-SUITE.md`** (~500 lines)
   - Test coverage summary
   - How to run tests
   - Expected outcomes
   - Known issues

3. **`docs/MFA-TESTING-QUICK-START.md`** (~350 lines)
   - Quick commands
   - Troubleshooting
   - Prerequisites

4. **`docs/TASK-2-HANDOFF.md`** (~400 lines)
   - Task 2 completion summary
   - Files created
   - Test results

5. **`docs/TEST-STATUS.md`**
   - Current test status
   - Known test issues
   - Speakeasy mock fix needed

6. **`CHANGELOG.md`**
   - Task 2 completion entry
   - Full project history

### Original Specifications
1. **`HANDOFF-PROMPT-MFA-EXPANSION.md`** (1,577 lines)
   - Original 4-task handoff document
   - Tasks 1-4 specifications
   - Detailed requirements

2. **Project README**: `README.md`
   - Project overview
   - Architecture
   - Tech stack

3. **Terraform Configuration**:
   - `terraform/broker-realm.tf` - MFA reference implementation
   - `terraform/keycloak-mfa-flows.tf` - Flow configuration

### Tech Stack Documentation
- **Keycloak**: https://www.keycloak.org/docs/latest/
- **Terraform Keycloak Provider**: https://registry.terraform.io/providers/mrparkers/keycloak/latest/docs
- **Speakeasy (TOTP)**: https://github.com/speakeasyjs/speakeasy
- **Jest**: https://jestjs.io/
- **Playwright**: https://playwright.dev/

---

## Key Reminders

### DO NOT REDO (Already Complete)
- ✅ MFA implementation for broker realm
- ✅ Custom login controller (basic functionality)
- ✅ OTP setup controller (basic functionality)
- ✅ Frontend login page with OTP UI
- ✅ Terraform for broker realm
- ✅ 27 passing custom-login tests
- ✅ 13 E2E tests created
- ✅ CI/CD workflow created
- ✅ Documentation created (~1,650 lines)

### YOUR FOCUS
- ❌ Multi-realm expansion (Task 3)
- ❌ Dynamic config sync (Task 4)
- ⚠️ Fix OTP setup tests (speakeasy mock issue)

### Best Practices
1. **NO SHORTCUTS**: Follow specifications exactly
2. **Test-Driven**: Write tests before/alongside implementation
3. **Incremental**: Complete Task 3 fully before starting Task 4
4. **Document**: Update docs as you implement
5. **Security-First**: Never log credentials or secrets
6. **Git**: Commit after each major milestone

### Git Workflow
```bash
# After completing Task 3
git add -A
git commit -m "feat(mfa): Implement multi-realm MFA expansion - Task 3

- Created Terraform module for realm MFA configuration
- Implemented clearance mapper service for French/Canadian levels
- Applied MFA to all 5 realms (USA, FRA, CAN, Industry)
- Updated frontend login config with all realms
- Added clearance mapper tests (15 tests, 100% coverage)
- Updated custom login controller for realm-aware clearance mapping

Closes: Task 3 of MFA Enhancement"

git push origin main
```

```bash
# After completing Task 4
git add -A
git commit -m "feat(mfa): Implement dynamic Keycloak config sync - Task 4

- Created Keycloak config sync service for dynamic rate limits
- Updated custom login controller to use async config
- Added startup sync and periodic sync (5 minutes)
- Created health check endpoint for monitoring sync status
- Added config sync tests (8 tests, 80%+ coverage)
- Removed all hardcoded MAX_ATTEMPTS and WINDOW_MS values

Closes: Task 4 of MFA Enhancement"

git push origin main
```

---

## Final Checklist

Before considering Tasks 3 & 4 complete:

### Task 3 Final Checks
- [ ] Terraform module created and tested
- [ ] All 5 realms have MFA configured
- [ ] Clearance mapper service implemented and tested
- [ ] French clearances (SECRET_DEFENSE, etc.) work correctly
- [ ] Canadian clearances (PROTECTED_B, etc.) work correctly
- [ ] Frontend config includes all 5 realms
- [ ] Background images and logos added
- [ ] Manual testing completed for each realm
- [ ] E2E tests updated and passing
- [ ] Documentation updated
- [ ] CHANGELOG updated
- [ ] Code committed and pushed to GitHub

### Task 4 Final Checks
- [ ] Config sync service implemented and tested
- [ ] Custom login controller updated to use dynamic config
- [ ] Startup sync implemented in server.ts
- [ ] Periodic sync (5 minutes) implemented
- [ ] Health check endpoint created
- [ ] Manual testing completed (change config and verify sync)
- [ ] Unit tests passing (8+ tests)
- [ ] Performance verified (<50ms overhead)
- [ ] Documentation updated
- [ ] CHANGELOG updated
- [ ] Code committed and pushed to GitHub

---

## Getting Started

### Recommended Order

1. **Read Documentation** (30 minutes):
   - Read `docs/MFA-OTP-IMPLEMENTATION.md` in full
   - Skim `docs/TEST-STATUS.md` for current state
   - Review existing `backend/src/controllers/custom-login.controller.ts`

2. **Set Up Environment** (15 minutes):
   - Verify services running: `docker-compose ps`
   - Verify backend tests pass: `cd backend && npm run test -- custom-login.controller.test.ts`
   - Verify Keycloak accessible: `curl http://localhost:8080/health`

3. **Start Task 3** (4-6 hours):
   - Create Terraform module (1 hour)
   - Apply to realms (1 hour)
   - Create clearance mapper + tests (2 hours)
   - Update controllers (1 hour)
   - Update frontend config (30 minutes)
   - Test manually (30 minutes)

4. **Start Task 4** (3-4 hours):
   - Create config sync service + tests (2 hours)
   - Update custom login controller (1 hour)
   - Add startup/periodic sync (30 minutes)
   - Create health check (30 minutes)
   - Test and verify (30 minutes)

5. **Final QA** (1 hour):
   - Run full test suite
   - Manual testing of all realms
   - Performance verification
   - Documentation review

**Total Estimated Time**: **8-11 hours** for Tasks 3 & 4

---

## Contact & Support

**Project**: DIVE V3 Coalition ICAM Pilot  
**Tasks**: 3 & 4 of MFA/OTP Enhancement  
**Status**: Ready to implement

**Key Files to Reference**:
- Original Spec: `HANDOFF-PROMPT-MFA-EXPANSION.md`
- Current State: `docs/TASK-2-HANDOFF.md`
- Test Status: `docs/TEST-STATUS.md`
- Implementation: `docs/MFA-OTP-IMPLEMENTATION.md`

**GitHub**: https://github.com/albeach/DIVE-V3  
**Branch**: `main`  
**Last Commit**: feat(mfa): Add comprehensive MFA/OTP testing suite - Task 2 (Partial)

---

**Ready to begin? Start with Task 3: Multi-Realm Expansion!** 🚀

Good luck! You've got comprehensive specs, working examples, and clear success criteria. Follow the checklist, test incrementally, and commit often.

