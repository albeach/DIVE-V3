# Week 3.4.1: Comprehensive Backend Testing Implementation

**Project**: DIVE V3 - Coalition ICAM Pilot  
**Phase**: Week 3.4.1 (Between Week 3 and Week 4)  
**Focus**: Backend Test Coverage Enhancement  
**Start Date**: October 14, 2025  
**Duration**: 3-5 days  
**Priority**: HIGH - Production Readiness Requirement

---

## 🎯 Mission Statement

Enhance backend test coverage from current **7.45%** to **≥80%** across all modules to meet production-grade standards. Implement comprehensive unit tests, integration tests, and E2E tests for all backend services, controllers, middleware, and utilities while ensuring 100% CI/CD pipeline success.

---

## 📊 Current State Assessment

### Test Coverage Baseline (Current)
```
Statements:   7.43%  (137/1843)
Branches:     4.24%  (37/871)
Functions:   12.57%  (22/175)
Lines:        7.45%  (134/1798)
```

### Existing Test Files (11 total)
1. `acp240-logger-mongodb.test.ts` - ACP-240 audit logging tests
2. `admin-auth.test.ts` - Admin authentication middleware tests
3. `admin.test.ts` - Admin controller integration tests
4. `audit-log-service.test.ts` - Audit log service tests
5. `audit-log.test.ts` - Audit log integration tests
6. `federation.integration.test.ts` - Multi-IdP federation tests
7. `idp-approval.test.ts` - IdP approval workflow tests
8. `session-lifecycle.test.ts` - Session management tests
9. `upload.test.ts` - File upload integration tests
10. `setup.ts` - Jest test setup
11. `globalTeardown.ts` - Jest cleanup

### Coverage Gaps (Components Without Tests)

#### **Controllers (40% untested)**
- ❌ `policy.controller.ts` - No tests
- ❌ `resource.controller.ts` - Minimal coverage
- ❌ `upload.controller.ts` - Partial coverage
- ✅ `admin.controller.ts` - Tested
- ✅ `admin-log.controller.ts` - Tested

#### **Middleware (60% untested)**
- ❌ `authz.middleware.ts` - Critical PEP logic, no tests
- ❌ `enrichment.middleware.ts` - No tests
- ❌ `upload.middleware.ts` - Partial coverage
- ❌ `error.middleware.ts` - No tests
- ✅ `admin-auth.middleware.ts` - Tested

#### **Services (50% untested)**
- ❌ `resource.service.ts` - Critical ZTDF logic, no tests
- ❌ `policy.service.ts` - No tests
- ❌ `upload.service.ts` - Partial coverage
- ❌ `keycloak-admin.service.ts` - Partial coverage
- ✅ `audit-log.service.ts` - Tested
- ✅ `idp-approval.service.ts` - Tested

#### **Utilities (66% untested)**
- ❌ `ztdf.utils.ts` - Critical security logic, no tests
- ❌ `logger.ts` - No tests
- ✅ `acp240-logger.ts` - Tested

#### **Routes (80% untested)**
- ❌ `resource.routes.ts` - No tests
- ❌ `policy.routes.ts` - No tests
- ❌ `upload.routes.ts` - No tests
- ❌ `health.routes.ts` - No tests
- ✅ `admin.routes.ts` - Tested

---

## 🏗️ Project Context & Architecture

### DIVE V3 Overview
DIVE V3 is a **4-week NATO/USA coalition ICAM pilot** demonstrating:
- **Federated Identity**: Multi-IdP (U.S., France, Canada, Industry) via Keycloak
- **ABAC Authorization**: Policy-driven access control via OPA/Rego
- **PEP/PDP Pattern**: Backend API enforces OPA decisions
- **Data-Centric Security**: ZTDF with STANAG 4774/4778 compliance
- **ACP-240 Compliance**: NATO data-centric security standards

### Tech Stack
- **Backend**: Node.js 20+, Express.js 4.18, TypeScript 5.3
- **Database**: MongoDB 7 (resource metadata), PostgreSQL 15 (Keycloak)
- **Authorization**: OPA v0.68.0+ (Rego policies)
- **Authentication**: Keycloak (IdP broker), JWT (RS256)
- **Testing**: Jest 29.7, ts-jest, supertest (planned)

### Critical Backend Components

#### 1. **PEP Middleware** (`authz.middleware.ts`)
**Purpose**: Policy Enforcement Point - calls OPA for every resource access decision  
**Criticality**: ⚠️ **HIGHEST** - Core security component  
**Lines**: ~400  
**Current Coverage**: **~0%**  

**Key Functions**:
- `authzMiddleware()` - Main PEP handler
- `authenticateJWT()` - JWT validation with JWKS
- `constructOPAInput()` - Build OPA decision request
- `callOPA()` - HTTP POST to OPA endpoint
- Decision caching (60s TTL)
- ACP-240 audit logging

**Test Requirements**:
- ✅ Valid JWT with all attributes → OPA called
- ✅ Invalid JWT → 401 Unauthorized
- ✅ OPA allows → 200 OK
- ✅ OPA denies → 403 Forbidden with reason
- ✅ OPA unavailable → 503 Service Unavailable
- ✅ Decision caching works (no duplicate OPA calls)
- ✅ Missing attributes handled gracefully
- ✅ Audit logs written for all decisions

#### 2. **Resource Service** (`resource.service.ts`)
**Purpose**: ZTDF resource management, integrity validation  
**Criticality**: ⚠️ **HIGH** - ZTDF compliance  
**Lines**: ~350  
**Current Coverage**: **~5%**  

**Key Functions**:
- `getResourceById()` - Fetch resource with ZTDF validation
- `getAllResources()` - List resources
- `createZTDFResource()` - Create encrypted resource
- `validateZTDFIntegrity()` - SHA-384 hash verification
- `getZTDFObject()` - Extract ZTDF metadata

**Test Requirements**:
- ✅ Valid ZTDF resource → Integrity validation passes
- ✅ Tampered ZTDF → Integrity validation fails, 403
- ✅ Missing policy hash → Validation fails
- ✅ Missing payload hash → Validation fails
- ✅ Legacy resource format → Backward compatibility
- ✅ MongoDB connection error → Graceful error
- ✅ Resource not found → 404

#### 3. **ZTDF Utilities** (`ztdf.utils.ts`)
**Purpose**: Cryptographic functions for STANAG 4778 compliance  
**Criticality**: ⚠️ **HIGHEST** - Security foundation  
**Lines**: ~400  
**Current Coverage**: **~0%**  

**Key Functions**:
- `computeSHA384Hash()` - STANAG 4778 hashes
- `encryptPayload()` - AES-256-GCM encryption
- `decryptPayload()` - AES-256-GCM decryption
- `validateIntegrity()` - Cryptographic binding verification
- `generateDisplayMarking()` - STANAG 4774 labels
- `createKeyAccessObject()` - KAS integration

**Test Requirements**:
- ✅ SHA-384 hash deterministic (same input = same hash)
- ✅ Encryption/decryption round-trip successful
- ✅ Tampered ciphertext → Decryption fails
- ✅ Integrity validation with valid hashes → Pass
- ✅ Integrity validation with mismatched hashes → Fail
- ✅ Display marking format correct: `CLASS//COI//REL COUNTRIES`
- ✅ Edge cases: empty arrays, special characters

#### 4. **Enrichment Middleware** (`enrichment.middleware.ts`)
**Purpose**: Infer missing attributes (country from email domain)  
**Criticality**: **MEDIUM** - Coalition interop  
**Lines**: ~320  
**Current Coverage**: **~0%**  

**Key Functions**:
- `enrichmentMiddleware()` - Main enrichment handler
- `inferCountryFromEmail()` - Domain → country mapping
- `setDefaultClearance()` - UNCLASSIFIED fallback
- `setDefaultCOI()` - Empty array fallback
- Enrichment audit logging

**Test Requirements**:
- ✅ `@example.mil` → USA
- ✅ `@gouv.fr` → FRA
- ✅ `@gc.ca` → CAN
- ✅ Unknown domain → USA (default, logged)
- ✅ Missing clearance → UNCLASSIFIED (logged)
- ✅ Missing COI → `[]` (logged)
- ✅ All enrichments logged for audit

#### 5. **Upload Service** (`upload.service.ts`)
**Purpose**: Secure file upload with ZTDF conversion  
**Criticality**: **HIGH** - User-generated content security  
**Lines**: ~320  
**Current Coverage**: **~15%**  

**Key Functions**:
- `processUpload()` - Main upload handler
- `validateUploadMetadata()` - Security label validation
- `convertToZTDF()` - Automatic ZTDF conversion
- `sanitizeFilename()` - XSS prevention
- Upload authorization check

**Test Requirements**:
- ✅ Valid upload with all metadata → ZTDF created
- ✅ Upload above user clearance → 403 Forbidden
- ✅ Upload not releasable to uploader → 403 Forbidden
- ✅ Invalid classification → 400 Bad Request
- ✅ Invalid country code → 400 Bad Request
- ✅ File too large → 413 Payload Too Large
- ✅ XSS in filename → Sanitized
- ✅ ENCRYPT event logged

#### 6. **Policy Service** (`policy.service.ts`)
**Purpose**: OPA policy management and testing  
**Criticality**: **MEDIUM** - Policy transparency  
**Lines**: ~190  
**Current Coverage**: **~0%**  

**Key Functions**:
- `getAllPolicies()` - List Rego policies
- `getPolicyById()` - Fetch policy source
- `testPolicyDecision()` - Interactive policy testing
- Policy metadata extraction

---

## 📋 Week 3.4.1 Implementation Plan

### **Phase 1: Critical Path Testing (Day 1-2)** 🔴

**Objective**: Test the most critical security components first

#### 1.1 ZTDF Utilities Tests (`ztdf.utils.test.ts`) - **Priority 1**
**Target**: 95% coverage of `ztdf.utils.ts`

```typescript
describe('ZTDF Utilities', () => {
  describe('computeSHA384Hash', () => {
    it('should return consistent hash for same input');
    it('should return different hashes for different inputs');
    it('should handle empty strings');
    it('should handle unicode characters');
  });

  describe('encryptPayload / decryptPayload', () => {
    it('should successfully encrypt and decrypt data');
    it('should fail decryption with wrong key');
    it('should fail decryption with tampered ciphertext');
    it('should handle large payloads (10MB)');
  });

  describe('validateIntegrity', () => {
    it('should pass validation for valid ZTDF resource');
    it('should fail validation for tampered policy section');
    it('should fail validation for tampered payload section');
    it('should fail validation for missing hashes');
    it('should fail validation for mismatched hashes');
  });

  describe('generateDisplayMarking', () => {
    it('should format SECRET//FVEY//REL USA, GBR');
    it('should format TOP_SECRET//NATO-COSMIC//REL USA, GBR, FRA, DEU, CAN');
    it('should handle missing COI');
    it('should handle single country');
    it('should sort countries alphabetically');
  });

  describe('createKeyAccessObject', () => {
    it('should create valid KAO structure');
    it('should include wrapped DEK');
    it('should include KAS endpoint');
  });
});
```

**Success Criteria**:
- ✅ 95%+ coverage of `ztdf.utils.ts`
- ✅ All SHA-384 hash tests pass
- ✅ All encryption/decryption tests pass
- ✅ All integrity validation tests pass
- ✅ All display marking tests pass
- ✅ Zero TypeScript errors
- ✅ Jest tests run in <5s

**Estimated Lines**: 400-500 lines of test code

---

#### 1.2 PEP Middleware Tests (`authz.middleware.test.ts`) - **Priority 1**
**Target**: 90% coverage of `authz.middleware.ts`

```typescript
describe('Authorization Middleware (PEP)', () => {
  describe('authenticateJWT', () => {
    it('should validate JWT signature using JWKS');
    it('should reject expired JWT');
    it('should reject JWT with invalid issuer');
    it('should reject JWT with missing claims');
    it('should attach decoded user to req.user');
  });

  describe('authzMiddleware', () => {
    it('should call OPA with correct input structure');
    it('should return 200 when OPA allows');
    it('should return 403 when OPA denies');
    it('should return 503 when OPA unavailable');
    it('should cache decisions for 60 seconds');
    it('should not call OPA twice for cached decision');
    it('should log all authorization decisions');
  });

  describe('constructOPAInput', () => {
    it('should include all subject attributes');
    it('should include all resource attributes');
    it('should include context (timestamp, requestId)');
    it('should handle enriched attributes');
  });

  describe('Error Handling', () => {
    it('should return 401 for missing Authorization header');
    it('should return 401 for invalid JWT format');
    it('should return 500 for MongoDB connection error');
    it('should return 404 for resource not found');
  });
});
```

**Mock Requirements**:
- Mock `axios` for OPA calls
- Mock `jsonwebtoken` for JWT validation
- Mock MongoDB `collection.findOne()`
- Mock JWKS endpoint

**Success Criteria**:
- ✅ 90%+ coverage of `authz.middleware.ts`
- ✅ All JWT validation tests pass
- ✅ All OPA integration tests pass
- ✅ All caching tests pass
- ✅ All error handling tests pass
- ✅ Zero TypeScript errors

**Estimated Lines**: 600-800 lines of test code

---

#### 1.3 Resource Service Tests (`resource.service.test.ts`) - **Priority 1**
**Target**: 90% coverage of `resource.service.ts`

```typescript
describe('Resource Service', () => {
  describe('getResourceById', () => {
    it('should return valid ZTDF resource');
    it('should validate ZTDF integrity on fetch');
    it('should return 403 for failed integrity check');
    it('should return 404 for non-existent resource');
    it('should handle legacy resource format');
    it('should handle MongoDB connection error');
  });

  describe('getAllResources', () => {
    it('should return all resources');
    it('should include display markings');
    it('should include ZTDF metadata');
    it('should handle empty collection');
  });

  describe('createZTDFResource', () => {
    it('should create valid ZTDF structure');
    it('should compute policy hash');
    it('should compute payload hash');
    it('should encrypt content');
    it('should create KAO');
    it('should validate created resource');
  });

  describe('validateZTDFIntegrity', () => {
    it('should pass for valid resource');
    it('should fail for tampered policy section');
    it('should fail for tampered payload section');
    it('should fail for missing hashes');
  });

  describe('getZTDFObject', () => {
    it('should extract ZTDF metadata');
    it('should include version, hashes, KAO count');
    it('should handle legacy format');
  });
});
```

**Success Criteria**:
- ✅ 90%+ coverage of `resource.service.ts`
- ✅ All ZTDF validation tests pass
- ✅ All integrity check tests pass
- ✅ All error handling tests pass

**Estimated Lines**: 500-600 lines of test code

---

### **Phase 2: Middleware & Service Testing (Day 2-3)** 🟡

**Objective**: Test remaining middleware and services

#### 2.1 Enrichment Middleware Tests (`enrichment.middleware.test.ts`)
**Target**: 90% coverage

```typescript
describe('Enrichment Middleware', () => {
  describe('inferCountryFromEmail', () => {
    it('should infer USA from @example.mil');
    it('should infer FRA from @gouv.fr');
    it('should infer CAN from @gc.ca');
    it('should default to USA for unknown domains');
    it('should log all inferences');
  });

  describe('setDefaultClearance', () => {
    it('should not modify existing clearance');
    it('should set UNCLASSIFIED for missing clearance');
    it('should log enrichment');
  });

  describe('setDefaultCOI', () => {
    it('should not modify existing COI');
    it('should set [] for missing COI');
    it('should log enrichment');
  });

  describe('Integration', () => {
    it('should enrich all missing attributes in one pass');
    it('should attach enrichedUser to req');
    it('should set wasEnriched flag');
  });
});
```

**Estimated Lines**: 300-400 lines

---

#### 2.2 Upload Service Tests (`upload.service.test.ts`)
**Target**: 90% coverage (currently 15%)

```typescript
describe('Upload Service', () => {
  describe('validateUploadMetadata', () => {
    it('should validate classification enum');
    it('should validate country codes (ISO 3166-1 alpha-3)');
    it('should validate COI values');
    it('should reject invalid classification');
    it('should reject invalid country code');
    it('should require title');
    it('should sanitize title (XSS)');
  });

  describe('processUpload', () => {
    it('should convert file to ZTDF');
    it('should generate display marking');
    it('should compute integrity hashes');
    it('should store in MongoDB');
    it('should log ENCRYPT event');
  });

  describe('Authorization Checks', () => {
    it('should reject upload above user clearance');
    it('should reject upload not releasable to uploader');
    it('should allow valid upload');
  });

  describe('File Validation', () => {
    it('should validate file type by magic number');
    it('should validate MIME type');
    it('should enforce size limit (10MB)');
    it('should sanitize filename');
  });
});
```

**Estimated Lines**: 400-500 lines

---

#### 2.3 Policy Service Tests (`policy.service.test.ts`)
**Target**: 90% coverage

```typescript
describe('Policy Service', () => {
  describe('getAllPolicies', () => {
    it('should list all .rego files');
    it('should extract metadata');
    it('should count rules');
    it('should count tests');
  });

  describe('getPolicyById', () => {
    it('should return policy source code');
    it('should return 404 for non-existent policy');
    it('should include line count');
  });

  describe('testPolicyDecision', () => {
    it('should call OPA with test input');
    it('should return decision and evaluation_details');
    it('should measure execution time');
    it('should handle OPA errors gracefully');
  });
});
```

**Estimated Lines**: 300-400 lines

---

#### 2.4 Error Middleware Tests (`error.middleware.test.ts`)
**Target**: 95% coverage

```typescript
describe('Error Middleware', () => {
  describe('errorHandler', () => {
    it('should format validation errors');
    it('should format 404 errors');
    it('should format 500 errors');
    it('should log error details');
    it('should not expose stack trace in production');
  });

  describe('notFoundHandler', () => {
    it('should return 404 for unknown routes');
    it('should include requested path');
  });
});
```

**Estimated Lines**: 200-250 lines

---

### **Phase 3: Controller & Route Testing (Day 3-4)** 🟢

**Objective**: Test API layer

#### 3.1 Resource Controller Tests (`resource.controller.test.ts`)
**Target**: 90% coverage

```typescript
describe('Resource Controller', () => {
  describe('GET /api/resources', () => {
    it('should return all resources with 200');
    it('should include display markings');
    it('should require authentication');
  });

  describe('GET /api/resources/:id', () => {
    it('should return resource with 200 (authorized)');
    it('should return 403 (unauthorized)');
    it('should return 404 (not found)');
    it('should include evaluation_details');
    it('should log authorization decision');
  });
});
```

**Estimated Lines**: 300-400 lines

---

#### 3.2 Policy Controller Tests (`policy.controller.test.ts`)
**Target**: 90% coverage

```typescript
describe('Policy Controller', () => {
  describe('GET /api/policies', () => {
    it('should list all policies');
    it('should include metadata');
  });

  describe('GET /api/policies/:id', () => {
    it('should return policy source');
    it('should return 404 for invalid id');
  });

  describe('POST /api/policies/:id/test', () => {
    it('should test policy with custom input');
    it('should require authentication');
    it('should return decision and details');
  });
});
```

**Estimated Lines**: 300-400 lines

---

#### 3.3 Upload Controller Tests (`upload.controller.test.ts`)
**Target**: 90% coverage (currently ~15%)

**Expand existing tests to cover**:
- All error scenarios
- Authorization failures
- File type validation
- Size validation
- ZTDF conversion success

**Estimated Lines**: +200-300 lines (additions to existing)

---

#### 3.4 Route Integration Tests

**Test all routes**:
- `health.routes.test.ts` - Health check endpoints
- `resource.routes.test.ts` - Resource API
- `policy.routes.test.ts` - Policy API
- `upload.routes.test.ts` - Upload API

**Estimated Lines**: 400-500 lines total

---

### **Phase 4: CI/CD Integration & Verification (Day 4-5)** 🔵

**Objective**: Ensure all tests pass in CI/CD pipeline

#### 4.1 GitHub Actions Workflow Update

Update `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:7
        ports:
          - 27017:27017
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: keycloak
          POSTGRES_USER: keycloak
          POSTGRES_PASSWORD: password
        ports:
          - 5432:5432
      opa:
        image: openpolicyagent/opa:latest
        ports:
          - 8181:8181
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      
      - name: Install dependencies
        run: cd backend && npm ci
      
      - name: Run linter
        run: cd backend && npm run lint
      
      - name: Run type check
        run: cd backend && npm run typecheck
      
      - name: Run unit tests
        run: cd backend && npm run test:unit
        env:
          NODE_ENV: test
          MONGODB_URI: mongodb://localhost:27017/dive-v3-test
          OPA_URL: http://localhost:8181
      
      - name: Run integration tests
        run: cd backend && npm run test:integration
        env:
          NODE_ENV: test
          MONGODB_URI: mongodb://localhost:27017/dive-v3-test
          OPA_URL: http://localhost:8181
      
      - name: Generate coverage report
        run: cd backend && npm run test:coverage
      
      - name: Enforce coverage thresholds
        run: |
          cd backend
          npm run test:coverage -- --coverage --coverageThreshold='{"global":{"statements":80,"branches":75,"functions":80,"lines":80}}'
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/lcov.info
          flags: backend
          name: backend-coverage
```

#### 4.2 Coverage Thresholds

Update `backend/jest.config.js`:

```javascript
module.exports = {
  // ... existing config ...
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80
    },
    // Critical files - higher thresholds
    './src/middleware/authz.middleware.ts': {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90
    },
    './src/utils/ztdf.utils.ts': {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95
    },
    './src/services/resource.service.ts': {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90
    }
  }
};
```

#### 4.3 Pre-commit Hooks

Create `.husky/pre-commit`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

cd backend
npm run lint
npm run typecheck
npm run test:unit
```

---

## ✅ Success Criteria

### **Acceptance Criteria (All Must Pass)**

#### Coverage Targets
- [ ] **Overall Coverage ≥ 80%**
  - Statements: ≥ 80% (current: 7.43%)
  - Branches: ≥ 75% (current: 4.24%)
  - Functions: ≥ 80% (current: 12.57%)
  - Lines: ≥ 80% (current: 7.45%)

#### Critical Components (Higher Thresholds)
- [ ] `authz.middleware.ts`: ≥ 90% coverage
- [ ] `ztdf.utils.ts`: ≥ 95% coverage
- [ ] `resource.service.ts`: ≥ 90% coverage
- [ ] `enrichment.middleware.ts`: ≥ 90% coverage
- [ ] `upload.service.ts`: ≥ 90% coverage

#### Test Quality
- [ ] All tests pass (100% pass rate)
- [ ] Zero TypeScript errors
- [ ] Zero ESLint errors
- [ ] Test execution time < 30s
- [ ] All mocks properly isolated
- [ ] No test interdependencies

#### CI/CD
- [ ] GitHub Actions pipeline passes
- [ ] Coverage thresholds enforced in CI
- [ ] Pre-commit hooks configured
- [ ] Coverage reports uploaded to Codecov

#### Documentation
- [ ] Test README with running instructions
- [ ] Mocking strategy documented
- [ ] Test data fixtures documented
- [ ] Coverage report accessible

---

## 📁 Deliverables

### **Code Deliverables**

1. **New Test Files (15 total)**
   - `ztdf.utils.test.ts` (400-500 lines)
   - `authz.middleware.test.ts` (600-800 lines)
   - `resource.service.test.ts` (500-600 lines)
   - `enrichment.middleware.test.ts` (300-400 lines)
   - `upload.service.test.ts` (400-500 lines, enhanced)
   - `policy.service.test.ts` (300-400 lines)
   - `error.middleware.test.ts` (200-250 lines)
   - `resource.controller.test.ts` (300-400 lines)
   - `policy.controller.test.ts` (300-400 lines)
   - `upload.controller.test.ts` (enhanced)
   - `health.routes.test.ts` (100-150 lines)
   - `resource.routes.test.ts` (150-200 lines)
   - `policy.routes.test.ts` (150-200 lines)
   - `upload.routes.test.ts` (150-200 lines)
   - `logger.test.ts` (150-200 lines)

   **Total**: ~5,000-6,500 new lines of test code

2. **Updated Test Files**
   - Enhanced existing `upload.test.ts`
   - Enhanced existing `admin.test.ts`

3. **Test Utilities**
   - `__tests__/helpers/` directory
     - `test-fixtures.ts` - Sample ZTDF resources
     - `mock-jwt.ts` - JWT generation helpers
     - `mock-opa.ts` - OPA response mocks
     - `mongo-test-helper.ts` - MongoDB test utilities

4. **Configuration Updates**
   - `jest.config.js` - Coverage thresholds
   - `.github/workflows/ci.yml` - Updated CI pipeline
   - `.husky/pre-commit` - Pre-commit hooks
   - `backend/README.md` - Testing documentation

### **Documentation Deliverables**

1. **`WEEK3.4.1-TESTING-IMPLEMENTATION.md`** (This document)
   - Complete implementation plan
   - Success criteria
   - Phased approach

2. **`backend/TESTING-GUIDE.md`**
   - How to run tests
   - Mocking strategy
   - Test data fixtures
   - Debugging failing tests
   - Writing new tests

3. **`backend/COVERAGE-REPORT.md`**
   - Before/after metrics
   - Coverage by module
   - Critical path coverage
   - Remaining gaps

4. **`WEEK3.4.1-QA-RESULTS.md`**
   - Test execution results
   - Coverage report
   - CI/CD verification
   - Known issues

5. **Updated `CHANGELOG.md`**
   - Week 3.4.1 entry
   - Testing improvements
   - Coverage metrics

6. **Updated `README.md`**
   - Testing section
   - Coverage badge
   - CI/CD status

---

## 🔍 Testing Strategy

### Unit Tests
**Scope**: Individual functions in isolation  
**Tools**: Jest, ts-jest  
**Mocking**: Mock all external dependencies  
**Coverage Target**: ≥ 90% per module

### Integration Tests
**Scope**: Multiple components working together  
**Tools**: Jest, supertest, MongoDB Memory Server  
**Mocking**: Mock external services (Keycloak, OPA), real database  
**Coverage Target**: ≥ 80% per flow

### E2E Tests
**Scope**: Complete request-to-response flows  
**Tools**: Jest, supertest, Docker Compose services  
**Mocking**: Minimal - test against real services where possible  
**Coverage Target**: All critical user journeys

### Mocking Strategy

#### **Mock Hierarchy**
1. **Always Mock**:
   - Keycloak Admin API (`@keycloak/keycloak-admin-client`)
   - External HTTP calls (axios)
   - File system operations
   - Time-dependent functions (Date.now)

2. **Sometimes Mock**:
   - OPA (mock in unit, real in integration)
   - MongoDB (mock in unit, real in integration)
   - JWT validation (mock in unit, real in integration)

3. **Never Mock**:
   - Business logic functions
   - Data transformations
   - Validation functions
   - Utility functions (within same module)

#### **Mock Implementations**

**JWT Mock**:
```typescript
// __tests__/helpers/mock-jwt.ts
export const createMockJWT = (claims: Partial<JWTPayload>): string => {
  const defaultClaims = {
    sub: 'testuser-us',
    uniqueID: 'testuser-us',
    clearance: 'SECRET',
    countryOfAffiliation: 'USA',
    acpCOI: ['FVEY'],
    iss: 'http://localhost:8081/realms/dive-v3-pilot',
    exp: Math.floor(Date.now() / 1000) + 3600
  };
  return jwt.sign({ ...defaultClaims, ...claims }, 'test-secret');
};
```

**OPA Mock**:
```typescript
// __tests__/helpers/mock-opa.ts
export const mockOPAAllow = () => {
  return {
    result: {
      decision: {
        allow: true,
        reason: 'All conditions satisfied',
        evaluation_details: { /* ... */ }
      }
    }
  };
};

export const mockOPADeny = (reason: string) => {
  return {
    result: {
      decision: {
        allow: false,
        reason,
        evaluation_details: { /* ... */ }
      }
    }
  };
};
```

**MongoDB Mock**:
```typescript
// __tests__/helpers/mongo-test-helper.ts
export class MongoTestHelper {
  private client: MongoClient;
  
  async connect() { /* ... */ }
  async disconnect() { /* ... */ }
  async seedResources() { /* ... */ }
  async clearDatabase() { /* ... */ }
}
```

---

## 🚨 Critical Path Components (Must Test First)

1. **ZTDF Utilities** (`ztdf.utils.ts`) - Security foundation
2. **PEP Middleware** (`authz.middleware.ts`) - Authorization enforcement
3. **Resource Service** (`resource.service.ts`) - ZTDF validation
4. **Upload Service** (`upload.service.ts`) - User-generated content
5. **Enrichment Middleware** (`enrichment.middleware.ts`) - Coalition interop

---

## 📚 Reference Documentation

### Project Documentation
- **Implementation Plan**: `/notes/dive-v3-implementation-plan.md`
- **Backend Spec**: `/notes/dive-v3-backend.md`
- **Security Spec**: `/notes/dive-v3-security.md`
- **Tech Stack**: `/notes/dive-v3-techStack.md`
- **ACP-240 Spec**: `/notes/ACP240-llms.txt`

### Code References
- **Existing Tests**: `/backend/src/__tests__/`
- **Test Setup**: `/backend/src/__tests__/setup.ts`
- **Jest Config**: `/backend/jest.config.js`
- **Package Scripts**: `/backend/package.json`

### Best Practices
- **DIVE Conventions**: `/.cursorrules`
- **Week 3.3 QA**: `/notes/WEEK3.3-QA-RESULTS.md`
- **Week 3.2 QA**: `/notes/WEEK3.2-QA-RESULTS.md`

### External References
- **Jest Documentation**: https://jestjs.io/docs/getting-started
- **ts-jest**: https://kulshekhar.github.io/ts-jest/
- **Supertest**: https://github.com/ladjs/supertest
- **MongoDB Memory Server**: https://github.com/nodkz/mongodb-memory-server

---

## 🎯 Execution Checklist

### **Phase 1: Critical Path (Day 1-2)**
- [ ] Create `ztdf.utils.test.ts` with 95% coverage
- [ ] Create `authz.middleware.test.ts` with 90% coverage
- [ ] Create `resource.service.test.ts` with 90% coverage
- [ ] Verify all Phase 1 tests pass
- [ ] Run coverage report: `npm run test:coverage`
- [ ] Verify Phase 1 critical components ≥ 90%

### **Phase 2: Middleware & Services (Day 2-3)**
- [ ] Create `enrichment.middleware.test.ts`
- [ ] Enhance `upload.service.test.ts`
- [ ] Create `policy.service.test.ts`
- [ ] Create `error.middleware.test.ts`
- [ ] Create `logger.test.ts`
- [ ] Verify all Phase 2 tests pass
- [ ] Run coverage report
- [ ] Verify overall coverage ≥ 60%

### **Phase 3: Controllers & Routes (Day 3-4)**
- [ ] Create `resource.controller.test.ts`
- [ ] Create `policy.controller.test.ts`
- [ ] Enhance `upload.controller.test.ts`
- [ ] Create route integration tests
- [ ] Verify all Phase 3 tests pass
- [ ] Run coverage report
- [ ] Verify overall coverage ≥ 80%

### **Phase 4: CI/CD & Documentation (Day 4-5)**
- [ ] Update `jest.config.js` with coverage thresholds
- [ ] Update `.github/workflows/ci.yml`
- [ ] Configure pre-commit hooks
- [ ] Write `TESTING-GUIDE.md`
- [ ] Write `COVERAGE-REPORT.md`
- [ ] Write `WEEK3.4.1-QA-RESULTS.md`
- [ ] Update `CHANGELOG.md`
- [ ] Update `README.md`
- [ ] Verify GitHub Actions pipeline passes
- [ ] Create pull request with all changes
- [ ] Merge to main after review

---

## 🚀 Getting Started

### **Step 1: Environment Setup**
```bash
cd backend
npm install
npm run test -- --version  # Verify Jest installed
```

### **Step 2: Run Existing Tests (Baseline)**
```bash
npm run test:coverage
# Note baseline: 7.45% lines, 137/1843 statements
```

### **Step 3: Create Test Helpers**
```bash
mkdir -p src/__tests__/helpers
touch src/__tests__/helpers/test-fixtures.ts
touch src/__tests__/helpers/mock-jwt.ts
touch src/__tests__/helpers/mock-opa.ts
touch src/__tests__/helpers/mongo-test-helper.ts
```

### **Step 4: Start with Critical Path (Phase 1)**
```bash
touch src/__tests__/ztdf.utils.test.ts
# Implement 400-500 lines of ZTDF tests
npm run test -- ztdf.utils.test.ts
```

### **Step 5: Iterate Through Phases**
- Complete Phase 1 before moving to Phase 2
- Run coverage after each phase
- Verify thresholds incrementally

### **Step 6: Verify CI/CD**
```bash
# Local CI simulation
npm run lint
npm run typecheck
npm run test:coverage
# All must pass before commit
```

---

## 📊 Progress Tracking

### Coverage Milestones

| Milestone | Target | Current | Remaining | Phase |
|-----------|--------|---------|-----------|-------|
| Baseline | 7.45% | ✅ 7.45% | 0% | Initial |
| Phase 1 Complete | 40% | 🔄 TBD | 32.55% | Day 2 |
| Phase 2 Complete | 65% | 🔄 TBD | 25% | Day 3 |
| Phase 3 Complete | 80% | 🔄 TBD | 15% | Day 4 |
| Final Target | ≥80% | 🔄 TBD | TBD | Day 5 |

### Test File Completion

| File | Priority | Status | Coverage | Phase |
|------|----------|--------|----------|-------|
| `ztdf.utils.test.ts` | 🔴 Critical | 🔄 TODO | 0% → 95% | 1 |
| `authz.middleware.test.ts` | 🔴 Critical | 🔄 TODO | 0% → 90% | 1 |
| `resource.service.test.ts` | 🔴 Critical | 🔄 TODO | 5% → 90% | 1 |
| `enrichment.middleware.test.ts` | 🟡 High | 🔄 TODO | 0% → 90% | 2 |
| `upload.service.test.ts` | 🟡 High | 🔄 TODO | 15% → 90% | 2 |
| `policy.service.test.ts` | 🟡 High | 🔄 TODO | 0% → 90% | 2 |
| `error.middleware.test.ts` | 🟢 Medium | 🔄 TODO | 0% → 95% | 2 |
| `resource.controller.test.ts` | 🟢 Medium | 🔄 TODO | 0% → 90% | 3 |
| `policy.controller.test.ts` | 🟢 Medium | 🔄 TODO | 0% → 90% | 3 |
| Route tests | 🟢 Medium | 🔄 TODO | 0% → 80% | 3 |

---

## 🎉 Definition of Done

**Week 3.4.1 is complete when**:

1. ✅ Overall backend coverage ≥ 80% (all metrics)
2. ✅ Critical components ≥ 90% coverage
3. ✅ All 200+ tests pass (100% pass rate)
4. ✅ Zero TypeScript errors
5. ✅ Zero ESLint errors
6. ✅ GitHub Actions CI/CD pipeline passes
7. ✅ Coverage thresholds enforced in CI
8. ✅ Pre-commit hooks configured
9. ✅ All documentation complete
10. ✅ CHANGELOG.md updated
11. ✅ README.md updated
12. ✅ Changes committed to main branch
13. ✅ PR approved and merged
14. ✅ Coverage report published

---

## 🔗 Related Work

### Completed Weeks
- **Week 1**: Foundation (Keycloak, Next.js, MongoDB) ✅
- **Week 2**: Authorization (OPA, PEP/PDP, 53 tests) ✅
- **Week 3**: Multi-IdP (SAML/OIDC, enrichment, 78 tests) ✅
- **Week 3.1**: ACP-240 (ZTDF, KAS, STANAG, 87 tests) ✅
- **Week 3.2**: Policy Viewer + Upload (106 tests) ✅
- **Week 3.3**: IdP Wizard + Admin Console (126 tests) ✅
- **Week 3.4**: Session Management (Advanced features) ✅

### Current Week
- **Week 3.4.1**: Backend Testing (THIS WEEK)
  - Increase coverage from 7.45% to ≥ 80%
  - Add 5,000-6,500 lines of test code
  - Ensure production readiness

### Next Week
- **Week 4**: E2E Testing, Demos, Pilot Report

---

## 💡 Key Success Factors

1. **Prioritize Critical Path**: Test security components first
2. **Incremental Progress**: Verify coverage after each phase
3. **Proper Mocking**: Isolate units, mock external dependencies
4. **CI/CD First**: Ensure tests pass in pipeline, not just locally
5. **Documentation**: Write tests that serve as documentation
6. **Code Quality**: Zero TypeScript errors, zero linting errors
7. **Team Communication**: Daily progress updates
8. **Realistic Timeline**: 3-5 days, don't rush quality

---

## 📞 Support & Questions

### If Tests Fail
1. Check test setup (`__tests__/setup.ts`)
2. Verify mocks are properly configured
3. Check MongoDB connection string
4. Review error messages carefully
5. Run single test: `npm test -- -t "test name"`

### If Coverage Doesn't Increase
1. Run coverage report: `npm run test:coverage`
2. Review HTML report: `open coverage/index.html`
3. Identify untested lines (red in report)
4. Add tests for uncovered branches
5. Check coverage thresholds in `jest.config.js`

### If CI/CD Fails
1. Check GitHub Actions logs
2. Verify all environment variables set
3. Ensure services (MongoDB, OPA) running
4. Test locally with: `npm run test:ci`
5. Review `.github/workflows/ci.yml`

---

**End of Week 3.4.1 Implementation Prompt**

**Status**: Ready for Implementation  
**Target Start**: October 14, 2025  
**Target Completion**: October 18, 2025  
**Expected Outcome**: Production-ready backend with ≥80% test coverage

---

*This prompt provides complete context for implementing comprehensive backend testing. All references, success criteria, and phases are defined. Ready for execution in a new chat session.*

