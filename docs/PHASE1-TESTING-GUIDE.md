# Phase 1: Validation Testing Guide

**Version:** 1.0  
**Date:** October 15, 2025  
**Status:** Ready for Testing

---

## Overview

This guide provides comprehensive instructions for testing Phase 1 automated security validation features. Follow these procedures to verify that IdP validation is working correctly in your environment.

---

## Prerequisites

**Before testing, ensure:**
- ✅ Docker services running (`docker-compose up -d`)
- ✅ Backend running (`cd backend && npm run dev`)
- ✅ Frontend running (`cd frontend && npm run dev`)
- ✅ MongoDB accessible (port 27017)
- ✅ You have super_admin role assigned

**Verify services:**
```bash
./scripts/preflight-check.sh
```

---

## Test Suite 1: Automated Unit Tests

### Running Unit Tests

```bash
# Run all validation tests
cd backend
npm test -- idp-validation.test.ts

# Run with coverage
npm test -- idp-validation.test.ts --coverage

# Run in watch mode (for development)
npm test -- idp-validation.test.ts --watch
```

**Expected Results:**
- ✅ All 30+ tests should pass
- ✅ Coverage >90% for validation services
- ✅ No console errors or warnings

**Test Categories:**
1. TLS Validation (8 tests)
   - TLS 1.3, 1.2, 1.1, 1.0 versions
   - Certificate expiry warnings
   - Self-signed certificates
   - Connection timeouts
   - Connection errors

2. Algorithm Validation (10 tests)
   - RS256, RS512, ES256 (strong)
   - SHA-1 (warning)
   - MD5 (fail)
   - 'none' algorithm (fail)
   - JWKS fetch errors
   - Invalid JWKS format

3. Endpoint Reachability (4 tests)
   - Successful connection
   - Connection refused
   - HTTP 500 errors
   - HTTP 404 errors

---

## Test Suite 2: Manual API Testing

### Test 1: Valid OIDC IdP (Google)

**Purpose:** Verify Gold Tier validation with real OIDC endpoints

```bash
curl -X POST http://localhost:4000/api/admin/idps \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  -d '{
    "alias": "test-google-oidc",
    "displayName": "Google Test IdP",
    "protocol": "oidc",
    "config": {
      "issuer": "https://accounts.google.com",
      "clientId": "test-client",
      "clientSecret": "test-secret"
    },
    "attributeMappings": {
      "uniqueID": "sub",
      "clearance": "clearance",
      "countryOfAffiliation": "country"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "submissionId": "...",
    "alias": "test-google-oidc",
    "status": "pending",
    "validationResults": {
      "tlsCheck": {
        "pass": true,
        "version": "TLSv1.3",
        "score": 15
      },
      "algorithmCheck": {
        "pass": true,
        "algorithms": ["RS256", "RS512"],
        "score": 25
      },
      "discoveryCheck": {
        "valid": true,
        "issuer": "https://accounts.google.com"
      },
      "mfaCheck": {
        "detected": true,
        "score": 15,
        "confidence": "high"
      },
      "endpointCheck": {
        "reachable": true,
        "score": 10
      }
    },
    "preliminaryScore": {
      "total": 65,
      "maxScore": 70,
      "tier": "gold"
    }
  }
}
```

**Verification:**
- ✅ `preliminaryScore.tier` should be "gold" or "silver"
- ✅ `validationResults.tlsCheck.pass` should be true
- ✅ `validationResults.discoveryCheck.valid` should be true

---

### Test 2: Valid OIDC IdP (Azure AD)

**Purpose:** Test with Microsoft Azure AD endpoints

```bash
curl -X POST http://localhost:4000/api/admin/idps \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  -d '{
    "alias": "test-azure-oidc",
    "displayName": "Azure AD Test",
    "protocol": "oidc",
    "config": {
      "issuer": "https://login.microsoftonline.com/common/v2.0",
      "clientId": "test-client",
      "clientSecret": "test-secret"
    },
    "attributeMappings": {
      "uniqueID": "sub",
      "clearance": "extension_clearance",
      "countryOfAffiliation": "country"
    }
  }'
```

**Expected:** Silver or Gold tier (55-70 points)

---

### Test 3: SAML IdP with Mock Metadata

**Purpose:** Verify SAML metadata parsing

First, create a test SAML metadata file:

```xml
<!-- test-saml-metadata.xml -->
<EntityDescriptor entityID="https://test-idp.example.com">
  <IDPSSODescriptor>
    <KeyDescriptor use="signing">
      <KeyInfo>
        <X509Data>
          <X509Certificate>MIIDXTCCAkWgAwIBAgIJAKJ...</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleSignOnService 
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://test-idp.example.com/saml/sso"/>
  </IDPSSODescriptor>
  <Signature>
    <SignedInfo>
      <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
    </SignedInfo>
  </Signature>
</EntityDescriptor>
```

```bash
# Read metadata file and submit
METADATA=$(cat test-saml-metadata.xml | jq -Rs .)

curl -X POST http://localhost:4000/api/admin/idps \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  -d "{
    \"alias\": \"test-saml-idp\",
    \"displayName\": \"Test SAML IdP\",
    \"protocol\": \"saml\",
    \"config\": {
      \"metadata\": $METADATA
    },
    \"attributeMappings\": {
      \"uniqueID\": \"urn:oid:1.3.6.1.4.1.5923.1.1.1.6\"
    }
  }"
```

**Expected:** Bronze or Silver tier (depending on certificate)

---

### Test 4: Invalid Configuration (TLS 1.0)

**Purpose:** Verify rejection of weak TLS

**Note:** This test requires a server with TLS 1.0. For simulation:

```bash
curl -X POST http://localhost:4000/api/admin/idps \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  -d '{
    "alias": "test-weak-tls",
    "displayName": "Weak TLS Test",
    "protocol": "oidc",
    "config": {
      "issuer": "https://tls-v1-0.badssl.com:1010"
    }
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": "Validation Failed",
  "message": "IdP configuration contains critical security issues",
  "data": {
    "criticalFailures": [
      "TLS version too old: TLSv1.0. Minimum required: TLS 1.2"
    ],
    "preliminaryScore": {
      "total": 0,
      "tier": "fail"
    }
  }
}
```

**Verification:**
- ✅ `success` should be false
- ✅ `error` should be "Validation Failed"
- ✅ `criticalFailures` array should contain TLS error

---

## Test Suite 3: UI Testing

### Test 1: Wizard Validation Display

**Steps:**
1. Navigate to http://localhost:3000/admin/idp/new
2. Complete Steps 1-4 (protocol, basic info, config, mappings)
3. Proceed to Step 5 (Review)
4. Submit for approval

**Expected Behavior:**
- ✅ After submission, validation results panel appears
- ✅ Score displayed with tier badge (Gold/Silver/Bronze/Fail)
- ✅ Each validation check shows status icon (✅⚠️❌)
- ✅ Errors show with red text and fix guidance
- ✅ Warnings show with yellow background
- ✅ Recommendations displayed for improvements

**Verification Checklist:**
- [ ] TLS check displays version and cipher
- [ ] Algorithm check lists detected algorithms
- [ ] OIDC discovery or SAML metadata status shown
- [ ] MFA detection shows confidence level
- [ ] Endpoint reachability shows latency
- [ ] Preliminary score matches backend calculation
- [ ] Tier badge color correct (Gold=yellow, Silver=gray, Bronze=orange, Fail=red)

---

### Test 2: Admin Approval Queue

**Steps:**
1. Navigate to http://localhost:3000/admin/approvals
2. View pending IdP submissions
3. Click on a submission to see details

**Expected:**
- ✅ Validation results visible in submission details
- ✅ Preliminary score displayed
- ✅ Admin can see all validation checks before approval

---

## Test Suite 4: Metrics Verification

### Check Validation Metrics

```bash
# Get metrics summary
curl http://localhost:4000/api/admin/metrics/summary | jq

# Get Prometheus format
curl http://localhost:4000/api/admin/metrics
```

**Expected Output:**
```json
{
  "validationFailures": {
    "total": 5,
    "byType": {
      "oidc_success": 3,
      "oidc_failure": 1,
      "TLS version too old": 1,
      "Weak algorithm": 1
    }
  }
}
```

**Verification:**
- ✅ Metrics recorded for each validation
- ✅ Success/failure counts accurate
- ✅ Failure types categorized correctly

---

## Test Suite 5: Performance Benchmarking

### Run Performance Tests

```bash
# Make script executable
chmod +x scripts/benchmark-validation.sh

# Run benchmark
./scripts/benchmark-validation.sh
```

**Expected Results:**
- ✅ OIDC full validation: <5000ms average
- ✅ TLS validation: <2000ms average
- ✅ Algorithm validation: <1000ms average
- ✅ Total overhead: <5 seconds

**Performance Targets:**
| Component | Target | Acceptable | Needs Optimization |
|-----------|--------|------------|-------------------|
| TLS Check | <500ms | <2000ms | >2000ms |
| Algorithm Check | <200ms | <1000ms | >1000ms |
| OIDC Discovery | <1500ms | <3000ms | >3000ms |
| SAML Parse | <500ms | <1000ms | >1000ms |
| MFA Detection | <100ms | <200ms | >200ms |
| **Total** | <2000ms | <5000ms | >5000ms |

---

## Test Suite 6: Edge Cases

### Test 1: Missing Required Fields

```bash
curl -X POST http://localhost:4000/api/admin/idps \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  -d '{
    "alias": "test-missing-fields",
    "protocol": "oidc"
  }'
```

**Expected:** 400 Bad Request with "Missing required fields" message

---

### Test 2: Malformed SAML Metadata

```bash
curl -X POST http://localhost:4000/api/admin/idps \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  -d '{
    "alias": "test-bad-saml",
    "displayName": "Malformed SAML",
    "protocol": "saml",
    "config": {
      "metadata": "<EntityDescriptor>Missing closing tag"
    }
  }'
```

**Expected:** Validation failure with "Invalid XML" error

---

### Test 3: OIDC Discovery 404

```bash
curl -X POST http://localhost:4000/api/admin/idps \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  -d '{
    "alias": "test-404-discovery",
    "displayName": "Missing Discovery",
    "protocol": "oidc",
    "config": {
      "issuer": "https://nonexistent-idp-12345.example.com"
    }
  }'
```

**Expected:** Validation failure with "Discovery endpoint unreachable" error

---

## Troubleshooting

### Issue: Tests failing with ECONNREFUSED

**Cause:** Backend not running or wrong port

**Solution:**
```bash
# Check if backend is running
curl http://localhost:4000/health

# Restart backend
cd backend
npm run dev
```

---

### Issue: Validation always returns score 0

**Cause:** Environment variables not set

**Solution:**
```bash
# Check environment variables
cd backend
cat .env

# Ensure these are set:
# TLS_MIN_VERSION=1.2
# ALLOWED_SIGNATURE_ALGORITHMS=RS256,RS512,ES256,ES512,PS256,PS512
```

---

### Issue: JWKS fetch timeouts

**Cause:** Network connectivity or external IdP down

**Solution:**
- Test with Google/Azure AD (reliable endpoints)
- Increase `ENDPOINT_TIMEOUT_MS` in `.env`
- Check firewall/proxy settings

---

## Test Checklist

### Before Marking Phase 1 Complete

**Backend:**
- [ ] All unit tests passing (30+ tests)
- [ ] TypeScript compilation: 0 errors
- [ ] ESLint: No warnings
- [ ] Test coverage >90% for validation services

**API:**
- [ ] Google OIDC validation works (Gold/Silver tier)
- [ ] Azure AD validation works (Silver tier)
- [ ] SAML metadata parsing works
- [ ] TLS <1.2 rejected
- [ ] Weak algorithms (MD5) rejected
- [ ] Malformed configs rejected with errors

**UI:**
- [ ] ValidationResultsPanel displays correctly
- [ ] Score and tier badge shown
- [ ] Status icons correct (✅⚠️❌)
- [ ] Error messages actionable
- [ ] Mobile responsive

**Metrics:**
- [ ] Validation success/failure recorded
- [ ] Metrics endpoint returns data
- [ ] Failure types categorized

**Performance:**
- [ ] Average validation time <5 seconds
- [ ] No memory leaks
- [ ] Backend stable under load

**Documentation:**
- [ ] README updated
- [ ] CHANGELOG updated
- [ ] Testing guide complete (this document)
- [ ] All environment variables documented

---

## Automated Test Script

Create and run a complete test suite:

```bash
#!/bin/bash
# Complete Phase 1 test suite

echo "Running Phase 1 Complete Test Suite..."
echo ""

# 1. Unit tests
echo "1. Running unit tests..."
cd backend
npm test -- idp-validation.test.ts --coverage
echo ""

# 2. API tests
echo "2. Testing API endpoints..."
./scripts/test-validation-api.sh
echo ""

# 3. Performance benchmarks
echo "3. Running performance benchmarks..."
./scripts/benchmark-validation.sh
echo ""

# 4. Demo scenarios
echo "4. Running demo scenarios..."
./scripts/demo-phase1-validation.sh
echo ""

echo "✅ All tests complete!"
```

---

## Success Criteria

Phase 1 validation is **production-ready** when:

1. ✅ **Functional:** All validation checks working correctly
2. ✅ **Performance:** <5 second validation overhead
3. ✅ **Reliability:** >95% uptime, no crashes
4. ✅ **Security:** Weak crypto blocked, no bypasses
5. ✅ **Usability:** Clear error messages, actionable guidance
6. ✅ **Observable:** Metrics recorded, logs captured
7. ✅ **Documented:** Testing guide complete, configuration documented

---

## Support

For questions or issues:
- Documentation: `docs/PHASE1-COMPLETE.md`
- Configuration: `backend/.env.example`
- Code reference: `backend/src/services/idp-validation.service.ts`
- Logs: `backend/logs/app.log`, `backend/logs/authz.log`

---

**Document Version:** 1.0  
**Last Updated:** October 15, 2025  
**Status:** Ready for Testing 🎯

