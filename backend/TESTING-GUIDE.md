# DIVE V3 Backend Testing Guide

**Version**: 1.0  
**Last Updated**: October 14, 2025  
**Test Coverage**: ~60-65% (Target: ≥80%)

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Test Infrastructure](#test-infrastructure)
3. [Running Tests](#running-tests)
4. [Writing New Tests](#writing-new-tests)
5. [Test Helpers](#test-helpers)
6. [Coverage Reports](#coverage-reports)
7. [Debugging Tests](#debugging-tests)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Running All Tests
```bash
cd backend
npm test
```

### Running Tests with Coverage
```bash
npm run test:coverage
open coverage/index.html
```

### Running Specific Test File
```bash
npm test -- ztdf.utils.test
```

### Watch Mode (Development)
```bash
npm run test:watch
```

---

## 🏗️ Test Infrastructure

### Test Organization

```
backend/src/__tests__/
├── helpers/                        # Reusable test utilities
│   ├── mock-jwt.ts                # JWT token generation
│   ├── mock-opa.ts                # OPA response mocking
│   ├── test-fixtures.ts           # Sample ZTDF resources
│   └── mongo-test-helper.ts       # MongoDB test utilities
│
├── ztdf.utils.test.ts             # ZTDF cryptography (55 tests) ✅
├── authz.middleware.test.ts       # PEP authorization (40 tests)
├── resource.service.test.ts       # Resource management (35 tests)
├── enrichment.middleware.test.ts  # Claim enrichment (30 tests)
├── error.middleware.test.ts       # Error handling (40 tests)
├── policy.service.test.ts         # Policy management (45 tests)
│
├── setup.ts                       # Jest global setup
└── globalTeardown.ts              # Jest cleanup
```

### Test Types

1. **Unit Tests**: Individual function isolation
2. **Integration Tests**: Multi-component workflows
3. **E2E Tests**: Complete request-to-response flows

---

## 🧪 Running Tests

### All Test Commands

```bash
# Run all tests (no coverage)
npm test

# Run all tests with coverage
npm run test:coverage

# Run only unit tests (excludes integration)
npm run test:unit

# Run only integration tests
npm run test:integration

# Run in watch mode
npm run test:watch

# Run specific test file
npm test -- ztdf.utils.test

# Run specific test by name
npm test -- -t "should encrypt and decrypt"

# Run with verbose output
npm test -- --verbose

# CI mode (runInBand, no workers)
npm run test:ci
```

### Test Execution Flags

| Flag | Purpose | Example |
|------|---------|---------|
| `--no-coverage` | Skip coverage (faster) | `npm test -- --no-coverage` |
| `--testPathPattern` | Filter by file path | `npm test -- --testPathPattern=ztdf` |
| `-t` or `--testNamePattern` | Filter by test name | `npm test -- -t "encrypt"` |
| `--verbose` | Show all test results | `npm test -- --verbose` |
| `--detectOpenHandles` | Find async issues | `npm test -- --detectOpenHandles` |
| `--runInBand` | No parallel execution | `npm test -- --runInBand` |
| `--watch` | Watch mode | `npm test -- --watch` |

---

## ✍️ Writing New Tests

### Basic Test Structure

```typescript
/**
 * My Feature Test Suite
 * Description of what's being tested
 * 
 * Target Coverage: 90%
 * Priority: HIGH/MEDIUM/LOW
 */

import { myFunction } from '../path/to/module';

// Mock external dependencies
jest.mock('axios');
jest.mock('../utils/logger');

describe('My Feature', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('myFunction', () => {
        it('should handle valid input', () => {
            const result = myFunction('valid input');
            expect(result).toBe('expected output');
        });

        it('should reject invalid input', () => {
            expect(() => myFunction('')).toThrow('Validation error');
        });

        it('should handle edge cases', () => {
            const result = myFunction('special 你好 chars');
            expect(result).toBeDefined();
        });
    });
});
```

### Using Test Helpers

```typescript
import { createUSUserJWT, createExpiredJWT } from './helpers/mock-jwt';
import { mockOPAAllow, mockOPADeny } from './helpers/mock-opa';
import { TEST_RESOURCES } from './helpers/test-fixtures';
import { setupMongoDB, teardownMongoDB } from './helpers/mongo-test-helper';

describe('My Integration Test', () => {
    let mongoHelper: any;

    beforeAll(async () => {
        mongoHelper = await setupMongoDB();
    });

    afterAll(async () => {
        await teardownMongoDB();
    });

    beforeEach(async () => {
        await mongoHelper.clearDatabase();
    });

    it('should work with MongoDB', async () => {
        const resource = TEST_RESOURCES.fveySecretDocument;
        await mongoHelper.insertResource(resource);

        const fetched = await mongoHelper.findResourceById('doc-fvey-001');
        expect(fetched).toBeDefined();
    });

    it('should work with JWT tokens', () => {
        const token = createUSUserJWT({ clearance: 'TOP_SECRET' });
        expect(token).toBeDefined();
    });

    it('should mock OPA decisions', () => {
        const decision = mockOPAAllow('All checks passed');
        expect(decision.result.allow).toBe(true);
    });
});
```

---

## 🛠️ Test Helpers

### 1. mock-jwt.ts

Generate JWT tokens for testing:

```typescript
import { createUSUserJWT, createFrenchUserJWT, createExpiredJWT } from './helpers/mock-jwt';

// US user with SECRET clearance
const token = createUSUserJWT();

// French user with CONFIDENTIAL clearance
const frToken = createFrenchUserJWT();

// Custom attributes
const customToken = createUSUserJWT({
    clearance: 'TOP_SECRET',
    acpCOI: ['FVEY', 'NATO-COSMIC']
});

// Expired token (for negative testing)
const expired = createExpiredJWT();
```

**Available Functions**:
- `createUSUserJWT(overrides?)` - US military user
- `createFrenchUserJWT(overrides?)` - French user
- `createCanadianUserJWT(overrides?)` - Canadian user
- `createContractorJWT(overrides?)` - Industry contractor
- `createExpiredJWT(claims?)` - Expired token
- `createInvalidJWT(missingClaims?)` - Invalid token
- `createMockJWT(claims, secret?)` - Generic token

### 2. mock-opa.ts

Mock OPA authorization decisions:

```typescript
import {
    mockOPAAllow,
    mockOPADeny,
    mockOPADenyInsufficientClearance,
    mockOPADenyReleasability,
    createOPAInput
} from './helpers/mock-opa';

// Allow decision
const allowDecision = mockOPAAllow('All conditions satisfied');

// Deny decision
const denyDecision = mockOPADeny('Insufficient clearance');

// Specific denial reasons
const clearanceDeny = mockOPADenyInsufficientClearance('CONFIDENTIAL', 'SECRET');
const releasabilityDeny = mockOPADenyReleasability('FRA', ['USA']);

// Create OPA input structure
const opaInput = createOPAInput({
    uniqueID: 'testuser',
    clearance: 'SECRET',
    countryOfAffiliation: 'USA',
    resourceId: 'doc-001',
    classification: 'SECRET',
    releasabilityTo: ['USA']
});
```

**Available Functions**:
- `mockOPAAllow(reason?, obligations?)` - ALLOW decision
- `mockOPADeny(reason, details?)` - DENY decision
- `mockOPADenyInsufficientClearance(user, required)` - Clearance failure
- `mockOPADenyReleasability(userCountry, allowed)` - Releasability failure
- `mockOPADenyCOI(userCOI, required)` - COI failure
- `mockOPADenyEmbargo(creationDate, currentTime)` - Embargo failure
- `mockOPAAllowWithKASObligation(resourceId)` - KAS obligation
- `createOPAInput(params)` - Input structure builder

### 3. test-fixtures.ts

Pre-built ZTDF resources:

```typescript
import { TEST_RESOURCES, TEST_USERS, createTestZTDFResource } from './helpers/test-fixtures';

// Use pre-built resources
const fveyDoc = TEST_RESOURCES.fveySecretDocument;
const natoDoc = TEST_RESOURCES.natoConfidentialDocument;
const usOnlyDoc = TEST_RESOURCES.usOnlyTopSecretDocument;

// Create custom resource
const customDoc = createTestZTDFResource({
    resourceId: 'doc-custom-001',
    title: 'Custom Document',
    classification: 'SECRET',
    releasabilityTo: ['USA', 'GBR'],
    COI: ['FVEY'],
    content: 'Custom content'
});

// Use test user profiles
const usUser = TEST_USERS.usSecret;
const frenchUser = TEST_USERS.frenchConfidential;
```

**Available Resources**:
- `TEST_RESOURCES.fveySecretDocument` - FVEY SECRET
- `TEST_RESOURCES.natoConfidentialDocument` - NATO CONFIDENTIAL
- `TEST_RESOURCES.usOnlyTopSecretDocument` - US TOP_SECRET
- `TEST_RESOURCES.unclassifiedDocument` - Public UNCLASSIFIED
- `TEST_RESOURCES.franceSecretDocument` - FRA SECRET

**Available Users**:
- `TEST_USERS.usSecret` - US/SECRET/FVEY
- `TEST_USERS.usTopSecret` - US/TOP_SECRET/US-ONLY
- `TEST_USERS.frenchConfidential` - FRA/CONFIDENTIAL/NATO-COSMIC
- `TEST_USERS.canadianSecret` - CAN/SECRET/FVEY
- `TEST_USERS.contractor` - US/UNCLASSIFIED

### 4. mongo-test-helper.ts

MongoDB test lifecycle:

```typescript
import { setupMongoDB, teardownMongoDB, getMongoTestHelper } from './helpers/mongo-test-helper';

describe('MongoDB Integration Test', () => {
    let mongoHelper: any;

    beforeAll(async () => {
        mongoHelper = await setupMongoDB();
    });

    afterAll(async () => {
        await teardownMongoDB();
    });

    beforeEach(async () => {
        await mongoHelper.clearDatabase();
        await mongoHelper.seedResources(); // Optional: pre-populate
    });

    it('should work with MongoDB', async () => {
        const resource = createTestZTDFResource({...});
        await mongoHelper.insertResource(resource);

        const fetched = await mongoHelper.findResourceById('doc-001');
        expect(fetched).toBeDefined();
    });
});
```

**Available Methods**:
- `setupMongoDB()` - Connect and initialize
- `teardownMongoDB()` - Cleanup and disconnect
- `getMongoTestHelper()` - Get helper instance
- `helper.clearDatabase()` - Clear all data
- `helper.seedResources()` - Populate test resources
- `helper.insertResource(resource)` - Add single resource
- `helper.findResourceById(id)` - Query resource
- `helper.countResources()` - Count documents
- `helper.createIndexes()` - Add indexes

---

## 📊 Coverage Reports

### Viewing Coverage

```bash
# Generate coverage report
npm run test:coverage

# Open HTML report
open coverage/index.html

# View text summary
npm run test:coverage | grep "Coverage summary" -A 10
```

### Coverage Thresholds

Configured in `jest.config.js`:

```javascript
{
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 65,
      functions: 70,
      lines: 70
    },
    './src/middleware/authz.middleware.ts': {
      statements: 85,
      branches: 80,
      functions: 85,
      lines: 85
    },
    './src/utils/ztdf.utils.ts': {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90
    },
    './src/services/resource.service.ts': {
      statements: 85,
      branches: 80,
      functions: 85,
      lines: 85
    }
  }
}
```

### Understanding Coverage Metrics

- **Statements**: Individual code statements executed
- **Branches**: If/else paths taken (e.g., both `if` and `else`)
- **Functions**: Functions/methods called
- **Lines**: Lines of code executed

**Target**: All metrics ≥80% (critical components ≥90%)

---

## 🐛 Debugging Tests

### Common Issues

#### 1. Test Timeouts
```bash
# Increase timeout for slow tests
npm test -- --testTimeout=30000

# Or in test file:
it('slow test', async () => {
    // ...
}, 30000); // 30 second timeout
```

#### 2. Async Handling
```bash
# Detect open handles
npm test -- --detectOpenHandles

# Force exit if hanging
npm test -- --forceExit
```

#### 3. MongoDB Connection Issues
```bash
# Check MongoDB is running
docker ps | grep mongo

# Check connection string
echo $MONGODB_URI

# Clear test database
mongosh dive-v3-test --eval "db.dropDatabase()"
```

#### 4. Mock Issues
```bash
# Clear Jest cache
npm test -- --clearCache

# Run without cache
npm test -- --no-cache
```

### Debugging Single Test

```bash
# Run single test with console logs
npm test -- -t "test name" --verbose

# Add console.log in test
it('debug test', () => {
    console.log('Debug:', someVariable);
    expect(someVariable).toBeDefined();
});
```

### VS Code Debugging

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/backend/node_modules/.bin/jest",
  "args": [
    "--runInBand",
    "--no-coverage",
    "${file}"
  ],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

---

## 📖 Best Practices

### 1. Test Isolation
✅ **DO**: Mock all external dependencies
```typescript
jest.mock('axios');
jest.mock('../utils/logger');
jest.mock('../services/resource.service');
```

❌ **DON'T**: Rely on shared state
```typescript
// Bad: Tests depend on execution order
let sharedState;
it('test 1', () => { sharedState = 'value'; });
it('test 2', () => { expect(sharedState).toBe('value'); });
```

### 2. Clear Test Names
✅ **DO**: Descriptive test names
```typescript
it('should deny access when user clearance is below resource classification', () => {
    // ...
});
```

❌ **DON'T**: Vague names
```typescript
it('test 1', () => {
    // What does this test?
});
```

### 3. Edge Case Coverage
✅ **DO**: Test edge cases
```typescript
describe('encryptContent', () => {
    it('should handle empty strings', () => { /* ... */ });
    it('should handle large payloads (10MB)', () => { /* ... */ });
    it('should handle unicode characters', () => { /* ... */ });
    it('should handle special characters', () => { /* ... */ });
});
```

### 4. Error Testing
✅ **DO**: Test error scenarios
```typescript
it('should throw error for invalid input', () => {
    expect(() => validateInput('')).toThrow('Invalid input');
});

it('should handle MongoDB connection errors', async () => {
    mockedMongoClient.connect.mockRejectedValue(new Error('Connection failed'));
    await expect(getResource('id')).rejects.toThrow();
});
```

### 5. Mock Strategy

**Always Mock**:
- External HTTP calls (axios)
- File system operations (fs)
- Database connections (in unit tests)
- Time-dependent functions (Date.now)
- External services (Keycloak, OPA)

**Sometimes Mock**:
- OPA (mock in unit, real in integration)
- MongoDB (mock in unit, real in integration)
- Logger (mock to avoid noise)

**Never Mock**:
- Business logic being tested
- Data transformations
- Validation functions
- Utility functions within same module

---

## 🎯 Test Examples

### Example 1: Testing Cryptography

```typescript
import { encryptContent, decryptContent } from '../utils/ztdf.utils';

describe('ZTDF Encryption', () => {
    it('should encrypt and decrypt successfully', () => {
        const plaintext = 'Secret message';
        const encrypted = encryptContent(plaintext);
        const decrypted = decryptContent(encrypted);

        expect(decrypted).toBe(plaintext);
    });

    it('should fail with wrong key', () => {
        const plaintext = 'Secret';
        const encrypted = encryptContent(plaintext);

        const wrongKey = Buffer.from('wrong-key-32bytes', 'utf8').toString('base64');

        expect(() => {
            decryptContent({
                ...encrypted,
                dek: wrongKey
            });
        }).toThrow();
    });
});
```

### Example 2: Testing Middleware

```typescript
import { Request, Response, NextFunction } from 'express';
import { authzMiddleware } from '../middleware/authz.middleware';
import { createUSUserJWT } from './helpers/mock-jwt';
import { mockOPAAllow } from './helpers/mock-opa';

jest.mock('axios');
jest.mock('../services/resource.service');

describe('Authorization Middleware', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: jest.MockedFunction<NextFunction>;

    beforeEach(() => {
        req = {
            headers: {
                authorization: `Bearer ${createUSUserJWT()}`
            },
            params: { id: 'doc-001' }
        };

        const statusMock = jest.fn().mockReturnThis();
        const jsonMock = jest.fn().mockReturnThis();
        res = {
            status: statusMock,
            json: jsonMock
        };

        next = jest.fn();
    });

    it('should allow access when authorized', async () => {
        // Mock resource fetch
        mockedGetResourceById.mockResolvedValue(testResource);

        // Mock OPA decision
        mockedAxios.post.mockResolvedValue({
            data: { result: { decision: mockOPAAllow().result } }
        });

        await authzMiddleware(req as Request, res as Response, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalledWith(403);
    });
});
```

### Example 3: Testing Service with MongoDB

```typescript
import { getResourceById, createZTDFResource } from '../services/resource.service';
import { setupMongoDB, teardownMongoDB } from './helpers/mongo-test-helper';
import { createTestZTDFResource } from './helpers/test-fixtures';

describe('Resource Service', () => {
    let mongoHelper: any;

    beforeAll(async () => {
        mongoHelper = await setupMongoDB();
    });

    afterAll(async () => {
        await teardownMongoDB();
    });

    it('should create and fetch resource', async () => {
        const resource = createTestZTDFResource({
            resourceId: 'doc-test-001',
            title: 'Test Document',
            classification: 'SECRET',
            releasabilityTo: ['USA'],
            content: 'Test content'
        });

        await createZTDFResource(resource);

        const fetched = await getResourceById('doc-test-001');
        expect(fetched).toBeDefined();
        expect(fetched?.resourceId).toBe('doc-test-001');
    });
});
```

---

## 🔍 Troubleshooting

### Issue: Tests Hanging
```bash
# Find open handles
npm test -- --detectOpenHandles

# Common causes:
# - Unclosed database connections
# - Unclosed HTTP connections
# - Timers not cleared
```

### Issue: MongoDB Connection Error
```bash
# 1. Verify MongoDB is running
docker ps | grep mongo

# 2. Check connection string
echo $MONGODB_URI

# 3. Restart MongoDB
docker-compose restart mongodb

# 4. Clear test database
mongosh dive-v3-test --eval "db.dropDatabase()"
```

### Issue: OPA Mock Not Working
```bash
# Verify axios is mocked
jest.mock('axios');

# Check mock configuration
mockedAxios.post.mockResolvedValue({ data: { result: mockOPAAllow() } });

# Debug axios calls
console.log(mockedAxios.post.mock.calls);
```

### Issue: Test Pass Locally But Fail in CI
```bash
# Run in CI mode
npm run test:ci

# Check for:
# - Timing issues (use Jest fake timers)
# - Environment variables
# - Docker service availability
# - File system paths
```

### Issue: Coverage Not Increasing
```bash
# 1. Check which files are excluded
grep collectCoverageFrom jest.config.js

# 2. View uncovered lines
npm run test:coverage
open coverage/index.html
# Red lines = uncovered

# 3. Check file is being tested
npm test -- --coverage --collectCoverageFrom=src/path/to/file.ts
```

---

## 📈 Coverage Targets

### Global Targets
- Statements: ≥70%
- Branches: ≥65%
- Functions: ≥70%
- Lines: ≥70%

### Critical Components (Higher Thresholds)
- `authz.middleware.ts`: ≥85%
- `ztdf.utils.ts`: ≥90%
- `resource.service.ts`: ≥85%

### Running Coverage Checks
```bash
# Check if thresholds are met
npm run test:coverage

# Will fail if below thresholds
# Success = all thresholds met
```

---

## 🎓 Testing Philosophy

### Security-First Testing
1. **Fail-Secure**: Always test failure scenarios
2. **Boundary Testing**: Test limits (empty, max, special chars)
3. **Negative Testing**: Test what should NOT work
4. **Integrity**: Test tamper detection
5. **Audit**: Verify logging occurs

### Test Pyramid
```
       /\
      /E2E\        Few, slow, comprehensive
     /------\
    /Integration\  Some, medium, multi-component
   /------------\
  /  Unit Tests  \  Many, fast, isolated
 /________________\
```

**DIVE V3 Balance**:
- 70% Unit Tests (fast, isolated)
- 20% Integration Tests (multi-component)
- 10% E2E Tests (full system)

---

## 📚 Additional Resources

### Documentation
- `WEEK3.4.1-IMPLEMENTATION-SUMMARY.md` - Implementation overview
- `WEEK3.4.1-QA-RESULTS.md` - Quality metrics
- `WEEK3.4.1-COMPLETION-SUMMARY.md` - Final summary
- `CHANGELOG.md` - All changes documented

### Reference Tests
- `ztdf.utils.test.ts` - Best practice example (55 tests, 100% passing)
- `acp240-logger-mongodb.test.ts` - MongoDB integration pattern
- `admin.test.ts` - Controller testing pattern

### External Resources
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [ts-jest](https://kulshekhar.github.io/ts-jest/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

## 🎯 Quick Reference

### Essential Commands
```bash
npm test                          # Run all tests
npm run test:coverage             # With coverage
npm test -- ztdf.utils.test       # Specific file
npm test -- -t "encrypt"          # Specific test
npm run test:watch                # Watch mode
open coverage/index.html          # View coverage
```

### Test File Template
```typescript
import { functionToTest } from '../path/to/module';

jest.mock('external-dependency');

describe('Module Name', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('functionToTest', () => {
        it('should work correctly', () => {
            const result = functionToTest('input');
            expect(result).toBe('expected');
        });

        it('should handle errors', () => {
            expect(() => functionToTest('')).toThrow();
        });
    });
});
```

---

**DIVE V3 Backend Testing Guide**  
**Status**: Foundation Established | Critical Path Complete | 60-65% Coverage Achieved  
**Next Milestone**: 80% Coverage | Estimated: 2-3 days additional effort




