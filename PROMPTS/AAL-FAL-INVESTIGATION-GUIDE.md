# 🔍 AAL/FAL Investigation Guide - File-by-File Checklist

**Purpose**: Systematic investigation guide for Identity Assurance Levels gap analysis  
**Usage**: Follow this checklist to ensure nothing is missed

---

## 📋 INVESTIGATION MATRIX

For **EACH** file, complete this analysis:

1. **Read the file** (full or targeted sections)
2. **Search for keywords** (AAL/FAL-related terms)
3. **Document findings** (compliant/partial/gap)
4. **Collect evidence** (file:line numbers + code snippets)
5. **Assign priority** (if gap found: CRITICAL/HIGH/MEDIUM/LOW)

---

## 🔍 FILE-BY-FILE CHECKLIST

### 1. `backend/src/middleware/authz.middleware.ts` ⭐ CRITICAL

**Purpose**: Main authentication/authorization checkpoint

**Requirements** (from IDENTITY-ASSURANCE-LEVELS.md):
- Lines 189-211: JWT validation with `acr`, `amr`, `auth_time` checks

**Search Patterns**:
```bash
# Read the file
read_file backend/src/middleware/authz.middleware.ts

# Search for AAL/FAL keywords
grep -n "acr\|amr\|auth_time\|authentication.*strength\|aal\|fal" backend/src/middleware/authz.middleware.ts
```

**Questions to Answer**:
- [ ] Does `verifyToken()` function exist?
- [ ] Does it verify JWT signature? (Line ?)
- [ ] Does it check `exp` expiration? (Line ?)
- [ ] Does it check `aud` audience? (Line ?)
- [ ] Does it validate `acr` claim? (Line ? or **GAP**)
- [ ] Does it validate `amr` claim? (Line ? or **GAP**)
- [ ] Does it check `auth_time` freshness? (Line ? or **GAP**)

**Evidence Template**:
```markdown
### Finding: JWT Middleware

**File**: `backend/src/middleware/authz.middleware.ts`

**Compliant**:
- ✅ Signature validation (Line 45-50)
- ✅ Expiration check (Line 55)
- ✅ Audience validation (Line 60)

**Gaps**:
- ❌ No `acr` validation → **HIGH PRIORITY GAP**
  - Required by: IDENTITY-ASSURANCE-LEVELS.md Line 302
  - Impact: AAL2 not enforced for classified resources
  - Fix: Add `acr` claim check (5 lines of code)
  
- ❌ No `amr` validation → **HIGH PRIORITY GAP**
  - Required by: IDENTITY-ASSURANCE-LEVELS.md Line 303
  - Impact: MFA not verified (could allow single-factor auth)
  - Fix: Check `amr.length >= 2` (8 lines of code)
```

---

### 2. `policies/fuel_inventory_abac_policy.rego` ⭐ CRITICAL

**Purpose**: Main authorization policy

**Requirements** (from IDENTITY-ASSURANCE-LEVELS.md):
- Lines 296-326: Authentication strength checks in OPA

**Search Patterns**:
```bash
# Read the policy
read_file policies/fuel_inventory_abac_policy.rego

# Search for AAL/FAL keywords
grep -n "acr\|amr\|authentication.*strength\|context\|aal" policies/fuel_inventory_abac_policy.rego

# Check input schema
grep -n "input\." policies/fuel_inventory_abac_policy.rego | head -20
```

**Questions to Answer**:
- [ ] Does policy define `input.context`? (Line ?)
- [ ] Does `input.context` include `acr` field? (**GAP** if missing)
- [ ] Does `input.context` include `amr` field? (**GAP** if missing)
- [ ] Does policy have `is_authentication_too_weak` rule? (Line ? or **GAP**)
- [ ] Does policy check AAL for SECRET classification? (**GAP** if missing)
- [ ] Does policy check auth_time freshness? (**GAP** if missing)

**Evidence Template**:
```markdown
### Finding: OPA Authorization Policy

**File**: `policies/fuel_inventory_abac_policy.rego`

**Compliant**:
- ✅ ABAC enforcement (clearance, country, COI)
- ✅ Fail-closed (default allow := false)

**Gaps**:
- ❌ No `input.context.acr` schema → **HIGH PRIORITY GAP**
  - Required by: IDENTITY-ASSURANCE-LEVELS.md Lines 302-306
  - Impact: Authentication strength not considered in decisions
  - Fix: Add `context.acr` to input schema, add validation rules (20 lines)

- ❌ No authentication strength checks → **HIGH PRIORITY GAP**
  - Required by: IDENTITY-ASSURANCE-LEVELS.md Lines 302-326
  - Impact: AAL1 users could access SECRET resources
  - Fix: Add `is_authentication_too_weak` rule (15 lines)
```

---

### 3. `terraform/keycloak-realm.tf` ⭐ HIGH

**Purpose**: Keycloak realm configuration

**Requirements** (from IDENTITY-ASSURANCE-LEVELS.md):
- Lines 406-414: Session timeout settings for AAL2

**Search Patterns**:
```bash
# Read the file
read_file terraform/keycloak-realm.tf

# Search for timeout settings
grep -n "session\|timeout\|lifespan\|idle" terraform/keycloak-realm.tf
```

**Questions to Answer**:
- [ ] What is `sso_session_idle_timeout`? (Current value: ?)
- [ ] Should be: 900 seconds (15 min) for AAL2
- [ ] What is `access_token_lifespan`? (Current value: ?)
- [ ] Should be: 900 seconds (15 min) for AAL2
- [ ] What is `refresh_token_max_reuse`? (Current value: ?)
- [ ] Should be: 0 (single-use) for AAL2

**Evidence Template**:
```markdown
### Finding: Keycloak Session Timeouts

**File**: `terraform/keycloak-realm.tf`

**Current Configuration**:
- `sso_session_idle_timeout` = [VALUE] seconds (Line X)
- `access_token_lifespan` = [VALUE] seconds (Line Y)
- `refresh_token_max_reuse` = [VALUE] (Line Z)

**Required for AAL2** (IDENTITY-ASSURANCE-LEVELS.md Line 408-412):
- `sso_session_idle_timeout` = 900 seconds (15 min)
- `access_token_lifespan` = 900 seconds (15 min)
- `refresh_token_max_reuse` = 0 (single-use)

**Gap**:
- [If mismatch] → **MEDIUM PRIORITY GAP**
- Impact: Session timeout too long violates AAL2 reauthentication requirement
- Fix: Update Terraform values (3 lines)
```

---

### 4. `backend/src/services/idp-scoring.service.ts` ⭐ HIGH

**Purpose**: IdP approval workflow with automated scoring

**Requirements** (from IDENTITY-ASSURANCE-LEVELS.md):
- Lines 363-369: Require MFA support (AAL2) for IdP approval

**Search Patterns**:
```bash
# Read the file
read_file backend/src/services/idp-scoring.service.ts

# Search for authentication strength
grep -n "authentication.*[Ss]trength\|mfa\|aal\|multi.*factor" backend/src/services/idp-scoring.service.ts
```

**Questions to Answer**:
- [ ] Does scoring check `authenticationStrength`? (Line ?)
- [ ] Does it deduct points for weak auth? (Line ?)
- [ ] Is AAL1 rejected for SILVER+ tier? (**GAP** if not enforced)
- [ ] Does scoring require MFA support? (Line ?)

**Evidence Template**:
```markdown
### Finding: IdP Scoring Service

**File**: `backend/src/services/idp-scoring.service.ts`

**Compliant**:
- ✅ Authentication Strength scoring (25 points) (Line X)
- ✅ Deducts points for weak auth (Line Y)

**Gaps**:
- [If AAL2 not explicit] → **HIGH PRIORITY GAP**
- ❌ Doesn't explicitly require AAL2 for SILVER+ tier
- Required by: IDENTITY-ASSURANCE-LEVELS.md Lines 363-369
- Impact: AAL1-only IdPs could be approved
- Fix: Reject if `authenticationStrength === 'weak'` (3 lines)
```

---

### 5. `frontend/src/app/api/auth/[...nextauth]/route.ts` ⭐ HIGH

**Purpose**: NextAuth.js configuration (FAL2 back-channel)

**Requirements** (from IDENTITY-ASSURANCE-LEVELS.md):
- Lines 180-186: Authorization code flow (not implicit)

**Search Patterns**:
```bash
# Read the file
read_file frontend/src/app/api/auth/[...nextauth]/route.ts

# Search for flow configuration
grep -n "response.*type\|grant.*type\|authorization.*mode\|implicit" frontend/src/app/api/auth/[...nextauth]/route.ts
```

**Questions to Answer**:
- [ ] What is `response_type`? (Should be: "code" for FAL2)
- [ ] Is token exchange server-side? (Back-channel requirement)
- [ ] Does it use implicit flow? (**CRITICAL GAP** if yes)
- [ ] Is client authentication required? (Line ?)

**Evidence Template**:
```markdown
### Finding: NextAuth.js Configuration

**File**: `frontend/src/app/api/auth/[...nextauth]/route.ts`

**Compliant**:
- ✅ Authorization code flow (response_type: "code") (Line X)
- ✅ Server-side token exchange (back-channel)
- ✅ Client authentication enabled

**OR**

**Gaps**:
- ❌ Uses implicit flow → **CRITICAL PRIORITY GAP**
- Required by: IDENTITY-ASSURANCE-LEVELS.md Line 184
- Impact: FAL1 only (not FAL2), tokens exposed to browser
- Fix: Switch to authorization code flow (5 lines config)
```

---

### 6. `backend/src/utils/acp240-logger.ts` ⭐ MEDIUM

**Purpose**: ACP-240 structured audit logging

**Requirements**: Log AAL/FAL metadata for audit trail

**Search Patterns**:
```bash
# Read the file
read_file backend/src/utils/acp240-logger.ts

# Search for AAL/FAL logging
grep -n "acr\|amr\|aal\|fal\|authentication.*context" backend/src/utils/acp240-logger.ts
```

**Questions to Answer**:
- [ ] Are `acr`/`amr` values logged? (Line ? or **GAP**)
- [ ] Is AAL level logged in audit events? (**GAP** if missing)
- [ ] Is FAL level logged? (**GAP** if missing)

**Evidence Template**:
```markdown
### Finding: Audit Logging

**File**: `backend/src/utils/acp240-logger.ts`

**Compliant**:
- ✅ Structured JSON logging
- ✅ All 5 ACP-240 event categories

**Gaps**:
- ❌ No AAL/FAL metadata in logs → **MEDIUM PRIORITY GAP**
- Impact: Cannot audit authentication strength in retrospect
- Fix: Add `acr`, `amr`, `aal`, `fal` to log schema (10 lines)
```

---

### 7. `backend/src/__tests__/authz.middleware.test.ts` ⭐ HIGH

**Purpose**: JWT middleware test coverage

**Requirements**: Tests for AAL2 enforcement

**Search Patterns**:
```bash
# Check if file exists
ls -la backend/src/__tests__/authz.middleware.test.ts

# If exists, search for AAL tests
grep -n "acr\|amr\|aal\|authentication.*strength" backend/src/__tests__/authz.middleware.test.ts
```

**Questions to Answer**:
- [ ] Does test file exist? (Yes/No)
- [ ] Are there tests for `acr` validation? (Count: ?)
- [ ] Are there tests for `amr` validation? (Count: ?)
- [ ] Are there tests for AAL2 enforcement? (Count: ?)
- [ ] Total AAL/FAL test count? (Should be: 10+)

**Evidence Template**:
```markdown
### Finding: AAL/FAL Test Coverage

**File**: `backend/src/__tests__/authz.middleware.test.ts`

**Current Coverage**:
- Basic JWT tests: [COUNT] tests
- AAL/FAL tests: [COUNT] tests (SHOULD BE 10+)

**Gaps**:
- ❌ No tests for `acr` validation → **HIGH PRIORITY GAP**
- ❌ No tests for `amr` validation → **HIGH PRIORITY GAP**
- ❌ No AAL2 enforcement tests → **HIGH PRIORITY GAP**
- Impact: AAL2 enforcement unverified, could regress
- Fix: Add 20+ AAL/FAL enforcement tests (200 lines)
```

---

### 8. `policies/tests/fuel_inventory_abac_policy_test.rego` ⭐ HIGH

**Purpose**: OPA policy test coverage

**Requirements**: Tests for authentication strength rules

**Search Patterns**:
```bash
# Read the test file
read_file policies/tests/fuel_inventory_abac_policy_test.rego

# Search for AAL tests
grep -n "acr\|amr\|authentication.*strength\|aal" policies/tests/fuel_inventory_abac_policy_test.rego
```

**Questions to Answer**:
- [ ] Are there tests for authentication strength? (Count: ?)
- [ ] Do tests cover AAL2 requirement for SECRET? (**GAP** if missing)
- [ ] Do tests cover AAL1 rejection? (**GAP** if missing)

**Evidence Template**:
```markdown
### Finding: OPA Policy Test Coverage

**File**: `policies/tests/fuel_inventory_abac_policy_test.rego`

**Current Coverage**:
- Authorization tests: [COUNT] tests
- AAL-related tests: [COUNT] tests (SHOULD BE 5+)

**Gaps**:
- ❌ No AAL2 enforcement tests → **HIGH PRIORITY GAP**
- Impact: Authentication strength rules unverified
- Fix: Add 5+ OPA tests for AAL checks (50 lines)
```

---

### 9. `backend/src/types/keycloak.types.ts` ⭐ MEDIUM

**Purpose**: TypeScript interface definitions for JWT tokens

**Requirements**: Include AAL/FAL claims in interface

**Search Patterns**:
```bash
# Read the file
read_file backend/src/types/keycloak.types.ts

# Search for token interface
grep -n "interface.*Token\|acr\|amr\|auth_time" backend/src/types/keycloak.types.ts
```

**Questions to Answer**:
- [ ] Is `IKeycloakToken` interface defined? (Line ?)
- [ ] Does it include `acr?: string`? (Line ? or **GAP**)
- [ ] Does it include `amr?: string[]`? (Line ? or **GAP**)
- [ ] Does it include `auth_time?: number`? (Line ? or **GAP**)

**Evidence Template**:
```markdown
### Finding: Token Interface

**File**: `backend/src/types/keycloak.types.ts`

**Current Interface**:
```typescript
export interface IKeycloakToken {
    sub: string;
    exp: number;
    iat: number;
    aud: string;
    // acr, amr, auth_time missing?
}
```

**Gaps**:
- ❌ Missing `acr?: string` → **MEDIUM PRIORITY GAP**
- ❌ Missing `amr?: string[]` → **MEDIUM PRIORITY GAP**
- Impact: TypeScript doesn't recognize AAL/FAL claims
- Fix: Add 3 optional fields to interface
```

---

### 10. Additional Files to Check

#### `backend/src/services/resource.service.ts`
**Purpose**: Resource access logic  
**Search for**: Authentication context in OPA input
```bash
grep -n "context.*acr\|context.*amr\|authentication" backend/src/services/resource.service.ts
```

#### `backend/src/controllers/resource.controller.ts`
**Purpose**: Resource API endpoints  
**Search for**: Authentication metadata extraction
```bash
grep -n "req\.user\|token\|acr\|amr" backend/src/controllers/resource.controller.ts
```

#### `frontend/src/app/api/auth/[...nextauth]/route.ts`
**Purpose**: NextAuth providers config  
**Search for**: Authorization code flow
```bash
grep -n "authorization\|code\|implicit\|response_type" frontend/src/app/api/auth/[...nextauth]/route.ts
```

---

## 📊 GAP ANALYSIS TRACKING

### Use This Template to Track Progress

```markdown
| File | Requirement | Status | Priority | Evidence |
|------|-------------|--------|----------|----------|
| authz.middleware.ts | acr validation | ❌ GAP | HIGH | Missing, Line N/A |
| authz.middleware.ts | amr validation | ❌ GAP | HIGH | Missing, Line N/A |
| authz.middleware.ts | auth_time check | ❌ GAP | MEDIUM | Missing, Line N/A |
| fuel_inventory_abac_policy.rego | AAL strength check | ❌ GAP | HIGH | Missing, Line N/A |
| keycloak-realm.tf | Session timeout (900s) | ⚠️ PARTIAL | MEDIUM | Line 45: 1800s (wrong) |
| idp-scoring.service.ts | AAL2 requirement | ⚠️ PARTIAL | HIGH | Line 123: checks but doesn't enforce |
| authz.middleware.test.ts | AAL2 tests | ❌ GAP | HIGH | 0 tests found |
| ... | ... | ... | ... | ... |
```

---

## 🎯 QUICK GAP IDENTIFICATION

### Fast Checks (Run These First)

```bash
# 1. Check if 'acr' appears anywhere in backend
grep -r "\.acr\|acr:" backend/src/ | wc -l
# Expected: 0-5 occurrences (likely GAP if 0)

# 2. Check if 'amr' appears anywhere in backend
grep -r "\.amr\|amr:" backend/src/ | wc -l
# Expected: 0-3 occurrences (likely GAP if 0)

# 3. Check if OPA policy has authentication checks
grep -r "authentication" policies/*.rego | wc -l
# Expected: 0-2 occurrences (likely GAP if 0)

# 4. Check session timeout in Terraform
grep "session_idle_timeout\|sso_session_idle_timeout" terraform/*.tf
# Expected: Should see 900 (15 min)

# 5. Check for AAL/FAL tests
find backend/src/__tests__ -name "*aal*" -o -name "*assurance*" -o -name "*fal*"
# Expected: 0 files (likely GAP if empty)
```

**If any of these return 0/empty**: High likelihood of GAP in that area.

---

## 📝 GAP REPORT STRUCTURE

### Recommended Format

```markdown
# Identity Assurance Levels (AAL/FAL) - Gap Analysis Report

**Date**: October 19, 2025
**Scope**: NIST SP 800-63B/C enforcement vs. IDENTITY-ASSURANCE-LEVELS.md
**Status**: [COMPLIANT / PARTIAL / GAPS IDENTIFIED]

## Executive Summary

**Total Requirements Investigated**: [COUNT]
- Fully Compliant: [COUNT] ([PERCENT]%)
- Partially Compliant: [COUNT] ([PERCENT]%)
- Gaps Identified: [COUNT] ([PERCENT]%)

**Gap Breakdown by Priority**:
- CRITICAL: [COUNT] gaps (blocking production)
- HIGH: [COUNT] gaps (ACP-240 Section 2.1 compliance)
- MEDIUM: [COUNT] gaps (security best practice)
- LOW: [COUNT] gaps (nice-to-have enhancements)

**Recommendation**: [PRODUCTION READY / NEEDS REMEDIATION / BLOCKED]

---

## Detailed Findings

### 1. JWT Middleware (authz.middleware.ts)

**Requirement**: Validate acr, amr, auth_time claims (IDENTITY-ASSURANCE-LEVELS.md Lines 189-211)

**Current State**: 
[COMPLIANT / PARTIAL / GAP]

**Evidence**:
- File: `backend/src/middleware/authz.middleware.ts`
- [✅/❌] Signature validation (Line X)
- [✅/❌] Expiration check (Line Y)
- [✅/❌] Audience validation (Line Z)
- [✅/❌] ACR validation (Line A or N/A)
- [✅/❌] AMR validation (Line B or N/A)

**Gap Details** (if applicable):
- Priority: CRITICAL / HIGH / MEDIUM / LOW
- Impact: [Security/Compliance impact]
- Remediation: [Specific fix needed]
- Effort: [Hours estimated]
- Files to modify: [List]
- Tests to add: [Count]

---

[Repeat for each area investigated]

---

## Remediation Roadmap

**Phase 1: CRITICAL Gaps** (Blocking Production)
1. [Gap #X]: [Description] - [Hours] - [Files]
2. ...

**Phase 2: HIGH Priority Gaps** (ACP-240 Section 2.1)
1. [Gap #Y]: [Description] - [Hours] - [Files]
2. ...

**Phase 3: MEDIUM Priority Gaps** (Security Best Practice)
1. [Gap #Z]: [Description] - [Hours] - [Files]
2. ...

**Total Estimated Effort**: [HOURS] hours

---

## Testing Strategy

**New Tests Required**: [COUNT]

**Test Categories**:
1. AAL2 Enforcement (10 tests)
   - Valid AAL2 token → ALLOW
   - AAL1 token for SECRET → DENY
   - AMR < 2 factors → DENY

2. FAL2 Validation (5 tests)
   - Signed assertions → ALLOW
   - Unsigned assertions → DENY
   - Expired tokens → DENY

3. OPA Policy AAL Checks (5 tests)
   - Authentication strength for SECRET
   - AAL3 requirement for TOP_SECRET

**Coverage Target**: 95%+ for AAL/FAL code

---

## Compliance Impact

**ACP-240 Section 2.1**: Authentication Context
- Current: [DOCUMENTED / PARTIAL / NOT ENFORCED]
- After Remediation: **FULLY ENFORCED** ✅

**NIST SP 800-63B**: AAL2 Requirements
- Current: [% compliance]
- After Remediation: 100% ✅

**NIST SP 800-63C**: FAL2 Requirements
- Current: [% compliance]
- After Remediation: 100% ✅

---

## Conclusion

[Summary of findings and recommended next steps]
```

---

## ✅ COMPLETION CRITERIA

### Your gap analysis is complete when:

**Analysis**:
- ✅ All 10 critical files investigated
- ✅ All requirements from IDENTITY-ASSURANCE-LEVELS.md checked
- ✅ All gaps documented with evidence (file:line)
- ✅ All gaps prioritized (CRITICAL/HIGH/MEDIUM/LOW)
- ✅ Gap analysis report created (300+ lines)

**Remediation**:
- ✅ All CRITICAL gaps fixed
- ✅ All HIGH priority gaps fixed
- ✅ 20+ new tests added
- ✅ All tests passing (780+ total)

**Documentation**:
- ✅ Implementation plan updated
- ✅ CHANGELOG entry added
- ✅ README security section updated
- ✅ Gap report is actionable

**Quality**:
- ✅ No linter errors
- ✅ No type errors
- ✅ CI/CD workflows passing
- ✅ Code coverage 95%+

---

## 🎯 FINAL REMINDER

**Your mission**: Don't just read the documentation—**verify it's enforced in code**.

IDENTITY-ASSURANCE-LEVELS.md says AAL2 is required. But:
- Is `acr` actually validated? (Search the code)
- Is `amr` actually checked? (Search the code)
- Are there tests proving it works? (Check __tests__/)

**Documentation ≠ Implementation**

Prove compliance with **code + tests + CI/CD**, not just markdown files. 🎯

---

**Good luck with the investigation! 🔍**


