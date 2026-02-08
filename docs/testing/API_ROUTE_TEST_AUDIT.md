# API Route Test Coverage Audit - Phase 1 Critical Stability

**Date**: 2026-02-08  
**Status**: 🔴 Critical - Only 1 of 143 API routes tested  
**Priority**: P0 - Must Have (Weeks 1-4)

---

## Executive Summary

DIVE V3 frontend has **143 API route files** (`frontend/src/app/api/**/*.ts`) with only **1 test file** (`admin/idps/__tests__/route.test.ts`), representing **<1% test coverage** of critical API endpoints:

- ❌ **Total API Routes**: 143 route files
- ❌ **Routes with Tests**: 1 (0.7%)
- ❌ **Routes without Tests**: 142 (99.3%)
- ✅ **Test Infrastructure**: Next.js API testing supported via `next/testing`
- ❌ **Critical Gap**: No validation of auth, resources, admin, or federation endpoints

**Target Phase 1**: Add tests for **40 most critical API routes** covering authentication, resources, admin, and federation.

---

## Current API Route Inventory

### Total: 143 API Route Files

#### Authentication Routes (5 routes)
1. `/api/auth/logout` - POST logout endpoint ❌ NO TEST
2. `/api/auth/otp/status` - GET OTP enrollment status ❌ NO TEST
3. `/api/auth/otp/enable` - POST enable OTP ❌ NO TEST
4. `/api/auth/otp/qrcode` - GET OTP QR code ❌ NO TEST
5. `/api/session/refresh` - POST session refresh ❌ NO TEST

#### Resource Management Routes (11 routes)
1. `/api/upload` - POST file upload ❌ NO TEST
2. `/api/resources` - GET list resources ❌ NO TEST
3. `/api/resources/[id]` - GET single resource ❌ NO TEST
4. `/api/resources/[id]/metadata` - GET metadata ❌ NO TEST
5. `/api/resources/[id]/preview` - GET preview ❌ NO TEST
6. `/api/resources/[id]/download` - GET download ❌ NO TEST
7. `/api/resources/[id]/bookmark` - POST bookmark ❌ NO TEST
8. `/api/resources/[id]/share` - POST share ❌ NO TEST
9. `/api/resources/search` - POST search ❌ NO TEST
10. `/api/resources/federated/search` - POST federated search ❌ NO TEST
11. `/api/kas/request-key` - POST KAS key request ❌ NO TEST

#### Admin - User Management Routes (11 routes)
1. `/api/admin/users` - GET/POST users ❌ NO TEST
2. `/api/admin/users/[userId]` - GET/PUT/DELETE user ❌ NO TEST
3. `/api/admin/users/[userId]/reset-password` - POST reset password ❌ NO TEST
4. `/api/admin/users/provision` - POST provision users ❌ NO TEST
5. `/api/admin/users/provisioning-history` - GET provisioning history ❌ NO TEST
6. `/api/admin/sessions` - GET user sessions ❌ NO TEST
7. `/api/admin/sessions/analytics` - GET session analytics ❌ NO TEST
8. `/api/admin/security/sessions` - GET security sessions ❌ NO TEST
9. `/api/admin/security/sessions/[sessionId]` - DELETE session ❌ NO TEST
10. `/api/admin/security/password-policy` - GET/PUT password policy ❌ NO TEST
11. `/api/admin/security/mfa-config` - GET/PUT MFA config ❌ NO TEST

#### Admin - IdP Management Routes (6 routes)
1. `/api/admin/idps` - GET/POST IdPs ✅ **HAS TEST** (only tested route!)
2. `/api/admin/idps/[alias]` - GET/PUT/DELETE IdP ❌ NO TEST
3. `/api/admin/idps/[alias]/health` - GET IdP health ❌ NO TEST
4. `/api/admin/idps/[alias]/sync` - POST sync IdP ❌ NO TEST
5. `/api/admin/approvals/pending` - GET pending approvals ❌ NO TEST
6. `/api/idps/public` - GET public IdP list ❌ NO TEST

#### Admin - Federation Routes (8 routes)
1. `/api/admin/federation/health` - GET federation health ❌ NO TEST
2. `/api/admin/federation/instances` - GET federation instances ❌ NO TEST
3. `/api/admin/federation/constraints` - GET/POST federation constraints ❌ NO TEST
4. `/api/admin/federation/sync` - POST sync federation ❌ NO TEST
5. `/api/admin/federation/spokes` - GET spoke instances ❌ NO TEST
6. `/api/admin/federation/spokes/[spokeId]` - GET/PUT spoke ❌ NO TEST
7. `/api/admin/federation/test` - POST test federation ❌ NO TEST
8. `/api/admin/tenants` - GET/POST tenants ❌ NO TEST

#### Admin - Policy Routes (11 routes)
1. `/api/admin/opa/policy` - GET/POST OPA policy ❌ NO TEST
2. `/api/admin/opa/policy/toggle-rule` - POST toggle rule ❌ NO TEST
3. `/api/admin/opa/status` - GET OPA status ❌ NO TEST
4. `/api/admin/policies/simulate` - POST simulate policy ❌ NO TEST
5. `/api/admin/policies/diff` - POST policy diff ❌ NO TEST
6. `/api/policies/hierarchy` - GET policy hierarchy ❌ NO TEST
7. `/api/policies-lab/upload` - POST upload policy ❌ NO TEST
8. `/api/policies-lab/load-samples` - POST load samples ❌ NO TEST
9. `/api/policies-lab/list` - GET list policies ❌ NO TEST
10. `/api/opal/server-status` - GET OPAL status ❌ NO TEST
11. `/api/opal/clients` - GET OPAL clients ❌ NO TEST

#### Admin - Clearance/COI Routes (8 routes)
1. `/api/admin/clearance/countries` - GET countries ❌ NO TEST
2. `/api/admin/clearance/countries/[country]` - GET/PUT country clearance ❌ NO TEST
3. `/api/admin/clearance/mappings` - GET/POST clearance mappings ❌ NO TEST
4. `/api/admin/clearance/validate` - POST validate clearance ❌ NO TEST
5. `/api/admin/clearance/stats` - GET clearance stats ❌ NO TEST
6. `/api/admin/clearance/audit/[country]` - GET audit clearance ❌ NO TEST
7. `/api/admin/coi/definitions` - GET/POST COI definitions ❌ NO TEST
8. `/api/admin/coi/hierarchy` - GET COI hierarchy ❌ NO TEST

#### Admin - Compliance/Audit Routes (13 routes)
1. `/api/admin/audit` - GET audit logs ❌ NO TEST
2. `/api/admin/logs` - GET logs ❌ NO TEST
3. `/api/admin/logs/stats` - GET log stats ❌ NO TEST
4. `/api/admin/logs/violations` - GET violations ❌ NO TEST
5. `/api/admin/logs/retention` - GET/PUT retention policy ❌ NO TEST
6. `/api/admin/logs/export` - POST export logs ❌ NO TEST
7. `/api/admin/compliance/reports/nato` - GET NATO compliance ❌ NO TEST
8. `/api/admin/compliance/reports/nist` - GET NIST compliance ❌ NO TEST
9. `/api/admin/compliance/reports/export` - POST export compliance ❌ NO TEST
10. `/api/admin/analytics/compliance-trends` - GET compliance trends ❌ NO TEST
11. `/api/admin/analytics/authz-metrics` - GET authz metrics ❌ NO TEST
12. `/api/admin/analytics/security-posture` - GET security posture ❌ NO TEST
13. `/api/admin/analytics/sla-metrics` - GET SLA metrics ❌ NO TEST

#### Admin - Certificate Management Routes (8 routes)
1. `/api/admin/certificates` - GET certificates ❌ NO TEST
2. `/api/admin/certificates/health` - GET certificate health ❌ NO TEST
3. `/api/admin/certificates/rotate` - POST rotate certificates ❌ NO TEST
4. `/api/admin/certificates/revoke` - POST revoke certificate ❌ NO TEST
5. `/api/admin/certificates/revocation-list` - GET CRL ❌ NO TEST
6. `/api/admin/security/certificates` - GET security certificates ❌ NO TEST
7. `/api/admin/security/headers` - GET/PUT security headers ❌ NO TEST
8. `/api/admin/risk/scoring/thresholds` - GET/PUT risk thresholds ❌ NO TEST

#### Admin - Service Provider Registry Routes (8 routes)
1. `/api/admin/sp-registry` - GET/POST SP registry ❌ NO TEST
2. `/api/admin/sp-registry/[spId]` - GET/PUT/DELETE SP ❌ NO TEST
3. `/api/admin/sp-registry/[spId]/approve` - POST approve SP ❌ NO TEST
4. `/api/admin/sp-registry/[spId]/suspend` - POST suspend SP ❌ NO TEST
5. `/api/admin/sp-registry/[spId]/credentials` - POST rotate credentials ❌ NO TEST
6. `/api/admin/sp-registry/[spId]/activity` - GET SP activity ❌ NO TEST
7. `/api/admin/sp-registry/metadata/preview` - POST preview metadata ❌ NO TEST
8. `/api/admin/sp-registry/[spId]/health` - GET SP health ❌ NO TEST

#### OPAL Routes (15 routes)
1. `/api/opal/clients` - GET OPAL clients ❌ NO TEST
2. `/api/opal/clients/[clientId]/ping` - POST ping client ❌ NO TEST
3. `/api/opal/clients/[clientId]/force-sync` - POST force sync ❌ NO TEST
4. `/api/opal/bundle/current` - GET current bundle ❌ NO TEST
5. `/api/opal/bundle/publish` - POST publish bundle ❌ NO TEST
6. `/api/opal/bundle/build-and-publish` - POST build and publish ❌ NO TEST
7. `/api/opal/bundle/scopes` - GET bundle scopes ❌ NO TEST
8. `/api/opal/transactions` - GET transactions ❌ NO TEST
9. `/api/opal/transactions/export` - POST export transactions ❌ NO TEST
10. `/api/opal/server-status` - GET server status ❌ NO TEST
11. `/api/opal/policies/evaluate` - POST evaluate policy ❌ NO TEST
12. `/api/opal/policies/batch` - POST batch evaluate ❌ NO TEST
13. `/api/opal/data/push` - POST push data ❌ NO TEST
14. `/api/opal/webhook` - POST webhook ❌ NO TEST
15. `/api/opal/health` - GET OPAL health ❌ NO TEST

#### Notification Routes (4 routes)
1. `/api/notifications` - GET/POST notifications ❌ NO TEST
2. `/api/notifications/preferences` - GET/PUT preferences ❌ NO TEST
3. `/api/notifications/preferences/me` - GET/PUT my preferences ❌ NO TEST
4. `/api/notifications/create` - POST create notification ❌ NO TEST

#### Utility Routes (5 routes)
1. `/api/health` - GET health check ❌ NO TEST
2. `/api/health/detailed` - GET detailed health ❌ NO TEST
3. `/api/openapi` - GET OpenAPI spec ❌ NO TEST
4. `/api/activity` - GET activity feed ❌ NO TEST
5. `/api/admin/metrics/summary` - GET metrics summary ❌ NO TEST

#### Other Admin Routes (30+ routes)
- Tenant bulk operations (3 routes)
- Risk analytics (5 routes)
- Advanced admin features (20+ routes)

---

## Single Tested Route Analysis

### `/api/admin/idps/__tests__/route.test.ts`

**Location**: `frontend/src/app/api/admin/idps/__tests__/route.test.ts`

**What It Tests**:
- ✅ GET `/api/admin/idps` - List IdPs
- ✅ POST `/api/admin/idps` - Create IdP
- ✅ Authentication checks (requires admin role)
- ✅ Validation (Zod schema)
- ✅ Backend API integration

**Test Quality**: ✅ Good
- Uses `createRequest` helper for Next.js Request objects
- Mocks NextAuth session
- Tests both success and error cases
- Validates response structure

**Template Value**: ✅ Excellent starting point for other routes

---

## Priority API Routes for Phase 1 (40 Routes)

### Week 1: Authentication & Core Resource Routes (10 routes)

#### Authentication Routes (P0 - CRITICAL)

1. **`/api/auth/logout`** - POST logout
   - **Test Priority**: CRITICAL
   - **Why**: Session management, security
   - **Test Cases**:
     - ✅ Successful logout clears session
     - ✅ Token blacklist updated
     - ❌ Unauthenticated request returns 401
     - ❌ Invalid session returns 400
   - **Effort**: 4 hours

2. **`/api/session/refresh`** - POST session refresh
   - **Test Priority**: CRITICAL
   - **Why**: Token rotation, session continuity
   - **Test Cases**:
     - ✅ Valid refresh token returns new access token
     - ✅ Expired refresh token returns 401
     - ❌ Invalid token signature returns 403
     - ❌ Blacklisted token returns 403
   - **Effort**: 4 hours

3. **`/api/auth/otp/status`** - GET OTP status
   - **Test Priority**: HIGH
   - **Why**: MFA setup, user onboarding
   - **Test Cases**:
     - ✅ User with OTP enabled returns status
     - ✅ User without OTP returns empty status
     - ❌ Unauthenticated returns 401
   - **Effort**: 3 hours

4. **`/api/auth/otp/enable`** - POST enable OTP
   - **Test Priority**: HIGH
   - **Why**: MFA enrollment
   - **Test Cases**:
     - ✅ Valid OTP code enables MFA
     - ❌ Invalid OTP code returns 400
     - ❌ Already enabled returns 409
     - ❌ Weak password policy returns 400
   - **Effort**: 4 hours

#### Resource Routes (P0 - CRITICAL)

5. **`/api/upload`** - POST file upload
   - **Test Priority**: CRITICAL
   - **Why**: Core functionality, authorization
   - **Test Cases**:
     - ✅ Authorized user uploads file
     - ✅ File metadata extracted
     - ✅ Classification assigned
     - ❌ Insufficient clearance returns 403
     - ❌ Invalid file type returns 400
   - **Effort**: 6 hours

6. **`/api/resources`** - GET list resources
   - **Test Priority**: CRITICAL
   - **Why**: Core functionality, ABAC filtering
   - **Test Cases**:
     - ✅ Authorized user sees filtered resources
     - ✅ Pagination works
     - ✅ ABAC filters applied (clearance, COI, releasability)
     - ❌ Unauthenticated returns 401
   - **Effort**: 5 hours

7. **`/api/resources/[id]`** - GET single resource
   - **Test Priority**: CRITICAL
   - **Why**: Authorization decision enforcement
   - **Test Cases**:
     - ✅ Authorized user retrieves resource
     - ❌ Insufficient clearance returns 403
     - ❌ Wrong country returns 403
     - ❌ Wrong COI returns 403
     - ❌ Not found returns 404
   - **Effort**: 5 hours

8. **`/api/resources/[id]/download`** - GET download
   - **Test Priority**: CRITICAL
   - **Why**: Authorization + KAS integration
   - **Test Cases**:
     - ✅ Authorized user downloads file
     - ✅ KAS key requested if encrypted
     - ❌ Insufficient clearance returns 403
     - ❌ KAS denies key returns 403
   - **Effort**: 5 hours

9. **`/api/resources/search`** - POST search
   - **Test Priority**: HIGH
   - **Why**: ABAC filtering, performance
   - **Test Cases**:
     - ✅ Search results filtered by ABAC
     - ✅ Full-text search works
     - ✅ Classification filter works
     - ❌ Invalid query returns 400
   - **Effort**: 5 hours

10. **`/api/kas/request-key`** - POST KAS key request
    - **Test Priority**: HIGH
    - **Why**: Encryption/decryption workflow
    - **Test Cases**:
      - ✅ Authorized user receives key
      - ✅ Re-evaluation by KAS succeeds
      - ❌ KAS denies key returns 403
      - ❌ Policy mismatch logged
    - **Effort**: 5 hours

**Week 1 Total**: 10 routes, **46 hours** (5.75 days)

---

### Week 2: Admin - User & IdP Management Routes (10 routes)

#### Admin - User Management (P0 - CRITICAL)

11. **`/api/admin/users`** - GET/POST users
    - **Test Priority**: CRITICAL
    - **Why**: User CRUD, admin authorization
    - **Test Cases**:
      - ✅ Admin lists users
      - ✅ Admin creates user
      - ❌ Non-admin returns 403
      - ❌ Invalid user data returns 400
    - **Effort**: 5 hours

12. **`/api/admin/users/[userId]`** - GET/PUT/DELETE user
    - **Test Priority**: CRITICAL
    - **Why**: User management, authorization
    - **Test Cases**:
      - ✅ Admin retrieves user
      - ✅ Admin updates user
      - ✅ Admin deletes user
      - ❌ Non-admin returns 403
    - **Effort**: 5 hours

13. **`/api/admin/users/provision`** - POST provision users
    - **Test Priority**: HIGH
    - **Why**: Bulk operations, Keycloak sync
    - **Test Cases**:
      - ✅ Admin provisions multiple users
      - ✅ Keycloak users created
      - ❌ Invalid bulk data returns 400
      - ❌ Duplicate users handled
    - **Effort**: 5 hours

14. **`/api/admin/sessions`** - GET user sessions
    - **Test Priority**: MEDIUM
    - **Why**: Session monitoring, security
    - **Test Cases**:
      - ✅ Admin lists active sessions
      - ✅ Pagination works
      - ❌ Non-admin returns 403
    - **Effort**: 4 hours

15. **`/api/admin/security/sessions/[sessionId]`** - DELETE session
    - **Test Priority**: HIGH
    - **Why**: Force logout, security incident response
    - **Test Cases**:
      - ✅ Admin terminates session
      - ✅ Token blacklisted
      - ❌ Non-admin returns 403
      - ❌ Invalid session ID returns 404
    - **Effort**: 4 hours

#### Admin - IdP Management (P0 - CRITICAL)

16. **`/api/admin/idps/[alias]`** - GET/PUT/DELETE IdP
    - **Test Priority**: CRITICAL
    - **Why**: IdP lifecycle, federation
    - **Test Cases**:
      - ✅ Admin retrieves IdP
      - ✅ Admin updates IdP config
      - ✅ Admin deletes IdP
      - ❌ Non-admin returns 403
    - **Effort**: 5 hours

17. **`/api/admin/idps/[alias]/health`** - GET IdP health
    - **Test Priority**: HIGH
    - **Why**: Monitoring, troubleshooting
    - **Test Cases**:
      - ✅ Health check returns IdP status
      - ✅ OIDC discovery tested
      - ❌ IdP unreachable returns 503
    - **Effort**: 4 hours

18. **`/api/admin/idps/[alias]/sync`** - POST sync IdP
    - **Test Priority**: HIGH
    - **Why**: Configuration synchronization
    - **Test Cases**:
      - ✅ Sync updates Keycloak config
      - ✅ Attributes synced
      - ❌ Sync failure returns 500
    - **Effort**: 5 hours

19. **`/api/admin/approvals/pending`** - GET pending approvals
    - **Test Priority**: MEDIUM
    - **Why**: Workflow management
    - **Test Cases**:
      - ✅ Admin lists pending IdP approvals
      - ✅ Pagination works
      - ❌ Non-admin returns 403
    - **Effort**: 3 hours

20. **`/api/idps/public`** - GET public IdP list
    - **Test Priority**: HIGH
    - **Why**: Login page, IdP selection
    - **Test Cases**:
      - ✅ Public route returns IdP list
      - ✅ Only enabled IdPs returned
      - ✅ No authentication required
    - **Effort**: 3 hours

**Week 2 Total**: 10 routes, **43 hours** (5.4 days)

---

### Week 3: Admin - Federation & Policy Routes (10 routes)

#### Admin - Federation (P0 - CRITICAL)

21. **`/api/admin/federation/health`** - GET federation health
    - **Test Priority**: CRITICAL
    - **Why**: Multi-instance monitoring
    - **Test Cases**:
      - ✅ Returns health of all spokes
      - ✅ Connectivity tests pass
      - ❌ Non-admin returns 403
    - **Effort**: 4 hours

22. **`/api/admin/federation/instances`** - GET federation instances
    - **Test Priority**: CRITICAL
    - **Why**: Spoke management
    - **Test Cases**:
      - ✅ Lists all federation spokes
      - ✅ Includes metadata (status, version)
      - ❌ Non-admin returns 403
    - **Effort**: 4 hours

23. **`/api/admin/federation/spokes/[spokeId]`** - GET/PUT spoke
    - **Test Priority**: HIGH
    - **Why**: Spoke configuration
    - **Test Cases**:
      - ✅ Admin retrieves spoke config
      - ✅ Admin updates spoke config
      - ❌ Non-admin returns 403
    - **Effort**: 5 hours

24. **`/api/admin/federation/test`** - POST test federation
    - **Test Priority**: MEDIUM
    - **Why**: Troubleshooting, validation
    - **Test Cases**:
      - ✅ Test returns connectivity status
      - ✅ Attribute sync tested
      - ❌ Non-admin returns 403
    - **Effort**: 4 hours

#### Admin - Policy Management (P0 - CRITICAL)

25. **`/api/admin/opa/policy`** - GET/POST OPA policy
    - **Test Priority**: CRITICAL
    - **Why**: Policy lifecycle
    - **Test Cases**:
      - ✅ Admin retrieves current policy
      - ✅ Admin uploads new policy
      - ✅ Policy validated before deployment
      - ❌ Non-admin returns 403
      - ❌ Invalid Rego returns 400
    - **Effort**: 6 hours

26. **`/api/admin/opa/status`** - GET OPA status
    - **Test Priority**: HIGH
    - **Why**: Monitoring, troubleshooting
    - **Test Cases**:
      - ✅ Returns OPA health
      - ✅ Policy bundle version shown
      - ❌ OPA unreachable returns 503
    - **Effort**: 3 hours

27. **`/api/admin/policies/simulate`** - POST simulate policy
    - **Test Priority**: HIGH
    - **Why**: Policy testing, validation
    - **Test Cases**:
      - ✅ Simulates policy decision
      - ✅ Returns evaluation details
      - ❌ Invalid input returns 400
    - **Effort**: 5 hours

28. **`/api/admin/policies/diff`** - POST policy diff
    - **Test Priority**: MEDIUM
    - **Why**: Change management
    - **Test Cases**:
      - ✅ Returns policy diff
      - ✅ Highlights breaking changes
      - ❌ Non-admin returns 403
    - **Effort**: 4 hours

29. **`/api/policies-lab/upload`** - POST upload policy
    - **Test Priority**: MEDIUM
    - **Why**: Policy experimentation
    - **Test Cases**:
      - ✅ Uploads policy to sandbox
      - ✅ Policy validated
      - ❌ Invalid Rego returns 400
    - **Effort**: 4 hours

30. **`/api/opal/server-status`** - GET OPAL status
    - **Test Priority**: HIGH
    - **Why**: Policy distribution monitoring
    - **Test Cases**:
      - ✅ Returns OPAL server status
      - ✅ Client count shown
      - ❌ OPAL unreachable returns 503
    - **Effort**: 3 hours

**Week 3 Total**: 10 routes, **42 hours** (5.25 days)

---

### Week 4: Admin - Compliance & Analytics Routes (10 routes)

#### Admin - Compliance/Audit (P1 - IMPORTANT)

31. **`/api/admin/audit`** - GET audit logs
    - **Test Priority**: HIGH
    - **Why**: Compliance, security monitoring
    - **Test Cases**:
      - ✅ Admin retrieves audit logs
      - ✅ Filters work (user, action, date)
      - ✅ Pagination works
      - ❌ Non-admin returns 403
    - **Effort**: 5 hours

32. **`/api/admin/logs`** - GET logs
    - **Test Priority**: MEDIUM
    - **Why**: Troubleshooting, compliance
    - **Test Cases**:
      - ✅ Admin retrieves application logs
      - ✅ Log levels filtered
      - ❌ Non-admin returns 403
    - **Effort**: 4 hours

33. **`/api/admin/logs/export`** - POST export logs
    - **Test Priority**: MEDIUM
    - **Why**: Compliance reporting
    - **Test Cases**:
      - ✅ Exports logs as CSV/JSON
      - ✅ Date range filtering works
      - ❌ Non-admin returns 403
    - **Effort**: 4 hours

34. **`/api/admin/compliance/reports/nato`** - GET NATO compliance
    - **Test Priority**: HIGH
    - **Why**: ACP-240 compliance
    - **Test Cases**:
      - ✅ Returns NATO compliance report
      - ✅ Includes violation counts
      - ❌ Non-admin returns 403
    - **Effort**: 5 hours

35. **`/api/admin/compliance/reports/nist`** - GET NIST compliance
    - **Test Priority**: MEDIUM
    - **Why**: NIST compliance
    - **Test Cases**:
      - ✅ Returns NIST compliance report
      - ✅ Includes control assessments
      - ❌ Non-admin returns 403
    - **Effort**: 4 hours

#### Admin - Analytics (P1 - IMPORTANT)

36. **`/api/admin/analytics/compliance-trends`** - GET compliance trends
    - **Test Priority**: MEDIUM
    - **Why**: Dashboard visualizations
    - **Test Cases**:
      - ✅ Returns time-series compliance data
      - ✅ Trends calculated
      - ❌ Non-admin returns 403
    - **Effort**: 4 hours

37. **`/api/admin/analytics/authz-metrics`** - GET authz metrics
    - **Test Priority**: HIGH
    - **Why**: Performance monitoring
    - **Test Cases**:
      - ✅ Returns authorization metrics (p50, p95, p99)
      - ✅ Cache hit rate shown
      - ❌ Non-admin returns 403
    - **Effort**: 5 hours

38. **`/api/admin/analytics/security-posture`** - GET security posture
    - **Test Priority**: MEDIUM
    - **Why**: Security dashboard
    - **Test Cases**:
      - ✅ Returns security metrics
      - ✅ Risk score calculated
      - ❌ Non-admin returns 403
    - **Effort**: 4 hours

39. **`/api/admin/clearance/validate`** - POST validate clearance
    - **Test Priority**: HIGH
    - **Why**: Clearance verification
    - **Test Cases**:
      - ✅ Validates clearance equivalency
      - ✅ Cross-country mapping works
      - ❌ Invalid clearance returns 400
    - **Effort**: 4 hours

40. **`/api/health/detailed`** - GET detailed health
    - **Test Priority**: MEDIUM
    - **Why**: System monitoring
    - **Test Cases**:
      - ✅ Returns detailed health (DB, Redis, OPA, Keycloak)
      - ✅ No authentication required
      - ✅ Degraded state handled
    - **Effort**: 3 hours

**Week 4 Total**: 10 routes, **42 hours** (5.25 days)

---

## Phase 1 Summary

**Total Routes to Test**: 40 routes  
**Total Effort**: 173 hours (21.6 days at 8h/day)  
**Timeline**: 4 weeks with 1-2 engineers  
**Expected Coverage**: 1 route → 41 routes tested (40x improvement)  
**Coverage %**: 0.7% → 28.7% (+28 percentage points)

---

## API Route Test Template

### Basic Route Test Template

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, DELETE } from './route';

// Mock NextAuth
jest.mock('@/lib/auth', () => ({
  getServerSession: jest.fn(),
}));

// Mock backend API client
jest.mock('@/lib/api-client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

import { getServerSession } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';

describe('API Route: /api/your-route', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      uniqueID: 'john.doe@mil',
      clearance: 'SECRET',
      countryOfAffiliation: 'USA',
      role: 'user',
    },
    accessToken: 'mock-token',
  };

  const mockAdminSession = {
    ...mockSession,
    user: { ...mockSession.user, role: 'admin' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    it('should return data for authenticated user', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue(mockSession);
      (apiClient.get as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: 'test-data' }),
      });

      const request = new NextRequest('http://localhost:3000/api/your-route');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual({ data: 'test-data' });
      expect(apiClient.get).toHaveBeenCalledWith('/your-route', {
        headers: { Authorization: `Bearer ${mockSession.accessToken}` },
      });
    });

    it('should return 401 for unauthenticated user', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/your-route');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('should return 403 for non-admin user accessing admin route', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue(mockSession); // Non-admin

      const request = new NextRequest('http://localhost:3000/api/admin/your-route');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(403);
      expect(data).toEqual({ error: 'Forbidden' });
    });

    it('should handle backend API errors gracefully', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue(mockSession);
      (apiClient.get as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error' }),
      });

      const request = new NextRequest('http://localhost:3000/api/your-route');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
    });
  });

  describe('POST', () => {
    it('should create resource with valid input', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue(mockSession);
      (apiClient.post as jest.Mock).mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: 'new-id', name: 'New Resource' }),
      });

      const requestBody = { name: 'New Resource', classification: 'SECRET' };
      const request = new NextRequest('http://localhost:3000/api/your-route', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(201);
      expect(data).toMatchObject({ id: 'new-id', name: 'New Resource' });
      expect(apiClient.post).toHaveBeenCalledWith('/your-route', {
        body: requestBody,
        headers: { Authorization: `Bearer ${mockSession.accessToken}` },
      });
    });

    it('should return 400 for invalid input', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue(mockSession);

      const invalidBody = { name: '' }; // Missing required field
      const request = new NextRequest('http://localhost:3000/api/your-route', {
        method: 'POST',
        body: JSON.stringify(invalidBody),
        headers: { 'Content-Type': 'application/json' },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('validation');
    });
  });
});
```

### Testing Pattern Checklist

For each API route, test:

1. **Authentication** ✅
   - [ ] Authenticated user succeeds
   - [ ] Unauthenticated user returns 401
   - [ ] Expired token returns 401

2. **Authorization** ✅
   - [ ] Authorized user (correct role/clearance) succeeds
   - [ ] Unauthorized user returns 403
   - [ ] Admin-only route blocks non-admin

3. **Validation** ✅
   - [ ] Valid input succeeds
   - [ ] Invalid input returns 400
   - [ ] Missing required fields returns 400
   - [ ] Zod schema validation tested

4. **Business Logic** ✅
   - [ ] Happy path succeeds
   - [ ] Edge cases handled (empty arrays, null values)
   - [ ] Resource not found returns 404
   - [ ] Duplicate resource returns 409

5. **Error Handling** ✅
   - [ ] Backend API errors handled
   - [ ] Network errors handled
   - [ ] Database errors handled
   - [ ] Proper error messages returned

6. **Integration** ✅
   - [ ] Backend API called with correct params
   - [ ] Request headers set correctly
   - [ ] Response format matches spec

---

## Test Infrastructure Setup

### Required Dependencies

```json
{
  "devDependencies": {
    "@testing-library/react": "^16.3.1",
    "@testing-library/jest-dom": "^6.9.1",
    "jest": "^30.2.0",
    "jest-environment-jsdom": "^30.2.0",
    "@types/jest": "^29.5.14"
  }
}
```

### Mock Setup

Create `__mocks__` directory:

```
frontend/src/app/api/
├── __mocks__/
│   ├── auth.ts          # Mock NextAuth
│   ├── api-client.ts    # Mock backend API
│   └── session.ts       # Mock session helpers
```

### Jest Config Updates

```javascript
// frontend/jest.config.js
module.exports = {
  // ... existing config
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}',
    '<rootDir>/src/app/api/**/__tests__/**/*.test.{js,ts}', // Add API route tests
  ],
};
```

---

## Success Metrics

### Immediate (Week 1)
- ✅ 10 critical routes tested (auth + resources)
- ✅ Test template established and documented
- ✅ Mock infrastructure set up

### Phase 1 Midpoint (Week 2)
- ✅ 20 routes tested (auth + resources + admin users/IdPs)
- ✅ Coverage ≥14% (from <1%)
- ✅ CI runs API route tests

### Phase 1 Complete (Week 4)
- ✅ 40 critical routes tested
- ✅ Coverage ≥28% (40/143 routes)
- ✅ All critical paths covered (auth, resources, admin)
- ✅ CI fails on API route test failures

### Ongoing Monitoring
- Track API route coverage weekly
- Add tests for new routes before merge
- Review API test patterns in PR reviews

---

## Next Steps

After completing Phase 1 (Weeks 1-4), proceed to:
- **Phase 2**: Expand to remaining 103 routes (weeks 5-12)
- **Phase 2**: Add contract tests (OpenAPI validation)
- **Phase 2**: Add performance tests for critical routes
- **Phase 3**: Visual regression tests for UI components

---

**Document Owner**: Principal Software Architect  
**Last Updated**: 2026-02-08  
**Review Frequency**: Weekly during Phase 1, monthly thereafter
