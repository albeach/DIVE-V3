# DIVE V3 Documentation Index

**Complete technical documentation for the DIVE V3 Coalition ICAM Pilot**

---

## 📖 Core Documentation

**Located in project root:**

### Week Status Reports
- **[WEEK1-STATUS-FINAL.md](../WEEK1-STATUS-FINAL.md)** - Week 1 implementation summary and status
- **[WEEK2-STATUS.md](../WEEK2-STATUS.md)** - Week 2 detailed implementation status
- **[WEEK2-COMPLETE.md](../WEEK2-COMPLETE.md)** - Week 2 final delivery summary
- **[CHANGELOG.md](../CHANGELOG.md)** - All project changes with dates
- **[START-HERE.md](../START-HERE.md)** - New developer onboarding guide

### Architecture & Planning
- **[dive-v3-implementation-plan.md](../dive-v3-implementation-plan.md)** - Complete 4-week implementation plan
- **[dive-v3-requirements.md](../dive-v3-requirements.md)** - Project requirements and acceptance criteria
- **[dive-v3-backend.md](../dive-v3-backend.md)** - Backend API specification
- **[dive-v3-frontend.md](../dive-v3-frontend.md)** - Frontend UI specification
- **[dive-v3-security.md](../dive-v3-security.md)** - Security guidelines and best practices
- **[dive-v3-techStack.md](../dive-v3-techStack.md)** - Technology stack decisions

---

## 🧪 Testing Documentation

**Located in `docs/testing/`:**

### Week 2 Testing
- **[WEEK2-MANUAL-TESTING-GUIDE.md](testing/WEEK2-MANUAL-TESTING-GUIDE.md)** - Complete manual testing procedures
  - 8 test scenarios (4 allow, 4 deny)
  - Step-by-step instructions
  - Expected results and verification steps
  - Troubleshooting common issues

- **[WEEK2-STARTUP-GUIDE.md](testing/WEEK2-STARTUP-GUIDE.md)** - Service startup procedures
  - Pre-flight checks
  - Terminal setup
  - Health monitoring
  - Common issues and fixes

---

## 🔧 Troubleshooting Documentation

**Located in `docs/troubleshooting/`:**

### Authentication & Session Issues
- **[SESSION-MANAGEMENT-ARCHITECTURE.md](troubleshooting/SESSION-MANAGEMENT-ARCHITECTURE.md)** - Database sessions explained
  - Why database sessions vs JWT
  - Cookie size limits
  - Performance analysis
  - Architecture diagrams

- **[SESSION-LIFECYCLE-COMPLETE.md](troubleshooting/SESSION-LIFECYCLE-COMPLETE.md)** - Complete session lifecycle
  - Fresh login flow
  - Token refresh flow
  - Re-login handling
  - Robust error handling

- **[TOKEN-REFRESH-FIX.md](troubleshooting/TOKEN-REFRESH-FIX.md)** - OAuth 2.0 token refresh
  - Token expiration handling
  - Automatic refresh pattern
  - Keycloak integration
  - Performance impact

### Cookie & PKCE Issues
- **[PKCE-COOKIE-FIX.md](troubleshooting/PKCE-COOKIE-FIX.md)** - PKCE cookie configuration
  - NextAuth v5 cookie requirements
  - OAuth flow cookies
  - Explicit configuration needed
  - Testing procedures

- **[EDGE-RUNTIME-FIX.md](troubleshooting/EDGE-RUNTIME-FIX.md)** - Edge runtime compatibility
  - Why auth() can't be in middleware
  - Authorized callback pattern
  - Edge vs Node.js runtime
  - Architecture best practices

### JWT Verification Issues
- **[JWKS-VERIFICATION-FIX.md](troubleshooting/JWKS-VERIFICATION-FIX.md)** - JWKS key retrieval
  - Direct JWKS fetch implementation
  - jwk-to-pem conversion
  - jwks-rsa library issues
  - Caching strategy

- **[JWT-TOKEN-DIAGNOSTIC.md](troubleshooting/JWT-TOKEN-DIAGNOSTIC.md)** - JWT troubleshooting guide
  - Diagnostic procedures
  - Common issues and fixes
  - Verification commands
  - Error interpretation

### Configuration Issues
- **[ENV-LOADING-FIX.md](troubleshooting/ENV-LOADING-FIX.md)** - Environment variable loading
  - Backend .env.local path issue
  - Monorepo configuration
  - Variable verification
  - Debugging steps

- **[LOGOUT-FIX-SUMMARY.md](troubleshooting/LOGOUT-FIX-SUMMARY.md)** - Keycloak federated logout
  - OIDC RP-Initiated logout
  - Session termination
  - Redirect handling
  - Testing procedures

### Quick Reference
- **[WEEK2-SESSION-FIX-SUMMARY.md](troubleshooting/WEEK2-SESSION-FIX-SUMMARY.md)** - Quick session fix reference

---

## 🛠️ Utility Scripts

**Located in `scripts/`:**

### Diagnostic Scripts
- **`preflight-check.sh`** - Comprehensive health check (RUN BEFORE EVERY TEST SESSION)
  - Verifies all Docker services
  - Checks OPA policy loaded
  - Validates database state
  - Confirms token expiration
  - Returns pass/fail status

- **`diagnose-jwt.sh`** - Complete JWT diagnostics
  - Checks Keycloak JWKS
  - Validates database tokens
  - Tests token issuance
  - Decodes custom claims

- **`test-jwt-flow.sh`** - End-to-end JWT flow testing

### Fix Scripts  
- **`fix-keycloak-user-coi.sh`** - Fix COI attributes via Keycloak Admin API
- **`fix-user-coi-final.sh`** - Final COI format fix
- **`dev-start.sh`** - Start all infrastructure services

---

## 📋 Documentation Guidelines

### When to Use Each Document

**For new developers:**
1. Start with [START-HERE.md](../START-HERE.md)
2. Read [README.md](../README.md)
3. Review implementation plan

**For testing:**
1. Run `./scripts/preflight-check.sh`
2. Follow [WEEK2-STARTUP-GUIDE.md](testing/WEEK2-STARTUP-GUIDE.md)
3. Use [WEEK2-MANUAL-TESTING-GUIDE.md](testing/WEEK2-MANUAL-TESTING-GUIDE.md)

**For troubleshooting:**
1. Check relevant fix document in `docs/troubleshooting/`
2. Run diagnostic scripts in `scripts/`
3. Search CHANGELOG.md for similar issues

**For understanding architecture:**
1. [SESSION-MANAGEMENT-ARCHITECTURE.md](troubleshooting/SESSION-MANAGEMENT-ARCHITECTURE.md)
2. [dive-v3-implementation-plan.md](../dive-v3-implementation-plan.md)
3. [dive-v3-security.md](../dive-v3-security.md)

---

## 🔍 Quick Reference

### Common Commands

```bash
# Health check (always run first)
./scripts/preflight-check.sh

# Start services
docker-compose up -d

# Start application
cd backend && npm run dev    # Terminal 1
cd frontend && npm run dev   # Terminal 2

# Run OPA tests
docker-compose exec opa opa test /policies/ -v

# Check logs
tail -f backend/logs/authz.log  # Authorization decisions
docker-compose logs -f opa       # OPA policy evaluation
docker-compose logs -f keycloak  # Authentication events
```

### Common Issues

| Error | Document | Quick Fix |
|-------|----------|-----------|
| Session cookie size | SESSION-MANAGEMENT-ARCHITECTURE.md | Already fixed (database sessions) |
| PKCE parsing | PKCE-COOKIE-FIX.md | Already fixed (explicit cookies) |
| Edge runtime | EDGE-RUNTIME-FIX.md | Already fixed (removed auth from middleware) |
| Token expired | TOKEN-REFRESH-FIX.md | Re-login or wait for auto-refresh |
| JWKS error | JWKS-VERIFICATION-FIX.md | Already fixed (direct fetch) |
| Invalid URL | ENV-LOADING-FIX.md | Already fixed (correct .env path) |
| COI encoding | SESSION-LIFECYCLE-COMPLETE.md | Already fixed (defensive parsing) |

---

## 📊 Week 2 Deliverables

**All documentation supporting Week 2:**

### Implementation
- OPA Rego policy: `policies/fuel_inventory_abac_policy.rego`
- OPA tests: `policies/tests/comprehensive_test_suite.rego`
- PEP middleware: `backend/src/middleware/authz.middleware.ts`
- Decision UI: `frontend/src/app/resources/`
- Session management: `frontend/src/auth.ts`

### Documentation
- Status: WEEK2-STATUS.md
- Completion: WEEK2-COMPLETE.md
- Testing: docs/testing/WEEK2-MANUAL-TESTING-GUIDE.md
- Startup: docs/testing/WEEK2-STARTUP-GUIDE.md
- Troubleshooting: 10 guides in docs/troubleshooting/

### Scripts
- preflight-check.sh (health monitoring)
- diagnose-jwt.sh (JWT debugging)
- fix-keycloak-user-coi.sh (Admin API usage)

**Total:** 53 tests, 8 scenarios verified, 10 troubleshooting guides, 100% objectives met

---

**Last Updated:** October 11, 2025  
**Status:** Week 2 Complete - All documentation organized

