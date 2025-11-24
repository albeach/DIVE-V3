# KAS Partner Testing Guide

## Overview
This guide explains how to test against the DIVE V3 Key Access Service (KAS) as an external partner.

## Service Information

**Service**: DIVE V3 Key Access Service (KAS)  
**Version**: 1.0.0-acp240  
**Compliance**: NATO ACP-240 Section 5.2  
**Base URL**: *[Will be provided by DIVE operator]*

## Endpoints

### 1. Health Check
**Endpoint**: `GET /health`  
**Authentication**: None required  
**Purpose**: Verify service availability

**Example Request**:
```bash
curl https://your-kas-url.ngrok.io/health
```

**Example Response**:
```json
{
  "status": "healthy",
  "service": "dive-v3-kas",
  "version": "1.0.0-acp240",
  "timestamp": "2025-11-06T14:30:00.123Z",
  "message": "KAS Service Operational (ACP-240 Compliant)",
  "features": [
    "Policy re-evaluation via OPA",
    "DEK/KEK management (mock)",
    "ACP-240 audit logging",
    "Fail-closed enforcement"
  ]
}
```

---

### 2. Request Decryption Key
**Endpoint**: `POST /request-key`  
**Authentication**: Bearer token (JWT from Keycloak)  
**Purpose**: Request decryption key for an encrypted resource

**Request Schema**:
```json
{
  "resourceId": "string (required)",
  "kaoId": "string (required)",
  "bearerToken": "string (required - JWT token)",
  "wrappedKey": "string (optional - base64 encoded DEK)"
}
```

**Required JWT Claims**:
- `uniqueID` - Unique user identifier
- `clearance` - UNCLASSIFIED | CONFIDENTIAL | SECRET | TOP_SECRET
- `countryOfAffiliation` - ISO 3166-1 alpha-3 (USA, FRA, CAN, etc.)
- `acpCOI` - Array of Community of Interest tags (optional)

**Example Request**:
```bash
curl -X POST https://your-kas-url.ngrok.io/request-key \
  -H "Content-Type: application/json" \
  -d '{
    "resourceId": "doc-fuel-inventory-2024",
    "kaoId": "kao-123456",
    "bearerToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "wrappedKey": "dGhpc2lzYWJhc2U2NGVuY29kZWRrZXk="
  }'
```

**Success Response** (200):
```json
{
  "success": true,
  "dek": "base64-encoded-decryption-key",
  "kaoId": "kao-123456",
  "authzDecision": {
    "allow": true,
    "reason": "Authorization successful: All policy conditions satisfied"
  },
  "kasDecision": {
    "allow": true,
    "reason": "Authorization successful: All policy conditions satisfied",
    "timestamp": "2025-11-06T14:30:00.123Z",
    "evaluationDetails": {
      "clearanceCheck": "PASS",
      "releasabilityCheck": "PASS",
      "coiCheck": "PASS",
      "policyBinding": {
        "required": {
          "clearance": "SECRET",
          "countries": ["USA", "GBR"],
          "coi": ["FVEY"]
        },
        "provided": {
          "clearance": "SECRET",
          "country": "USA",
          "coi": ["FVEY", "NATO-COSMIC"]
        }
      }
    }
  },
  "auditEventId": "kas-1699282200-abc123",
  "executionTimeMs": 245,
  "responseTimestamp": "2025-11-06T14:30:00.368Z"
}
```

**Denial Response** (403):
```json
{
  "success": false,
  "error": "Forbidden",
  "denialReason": "Insufficient clearance: SECRET required, CONFIDENTIAL provided",
  "authzDecision": {
    "allow": false,
    "reason": "Insufficient clearance: SECRET required, CONFIDENTIAL provided"
  },
  "kasDecision": {
    "allow": false,
    "reason": "Insufficient clearance: SECRET required, CONFIDENTIAL provided",
    "timestamp": "2025-11-06T14:30:00.123Z",
    "evaluationDetails": {
      "clearanceCheck": "FAIL",
      "releasabilityCheck": "PASS",
      "coiCheck": "PASS",
      "policyBinding": {
        "required": {
          "clearance": "SECRET",
          "countries": ["USA"],
          "coi": []
        },
        "provided": {
          "clearance": "CONFIDENTIAL",
          "country": "USA",
          "coi": []
        }
      }
    }
  },
  "auditEventId": "kas-1699282200-xyz789",
  "executionTimeMs": 198,
  "responseTimestamp": "2025-11-06T14:30:00.321Z"
}
```

**Error Responses**:
- `400 Bad Request` - Missing required fields
- `401 Unauthorized` - Invalid or expired JWT token
- `403 Forbidden` - Authorization denied by policy
- `503 Service Unavailable` - Backend or policy service unavailable
- `500 Internal Server Error` - Unexpected error

---

## Testing Scenarios

### Scenario 1: Health Check
Verify service is reachable:
```bash
curl https://your-kas-url.ngrok.io/health
```

Expected: `200 OK` with service status

---

### Scenario 2: Valid Request (Success)
Request key with valid credentials matching resource requirements:

**Prerequisites**:
- User clearance: `SECRET`
- User country: `USA`
- User COI: `["FVEY"]`
- Resource classification: `SECRET`
- Resource releasability: `["USA", "GBR"]`
- Resource COI: `["FVEY"]`

**Expected Result**: `200 OK` with DEK

---

### Scenario 3: Insufficient Clearance (Denial)
Request key with insufficient clearance:

**Prerequisites**:
- User clearance: `CONFIDENTIAL`
- Resource classification: `SECRET`

**Expected Result**: `403 Forbidden` - clearance check fails

---

### Scenario 4: Country Not Releasable (Denial)
Request key from non-releasable country:

**Prerequisites**:
- User country: `FRA`
- Resource releasability: `["USA"]` (France not included)

**Expected Result**: `403 Forbidden` - releasability check fails

---

### Scenario 5: Missing COI (Denial)
Request key without required COI:

**Prerequisites**:
- User COI: `[]` (empty)
- Resource COI: `["NATO-COSMIC"]` (required)

**Expected Result**: `403 Forbidden` - COI check fails

---

### Scenario 6: Invalid JWT Token
Request with invalid/expired token:

**Expected Result**: `401 Unauthorized`

---

### Scenario 7: Missing Required Fields
Request without required fields (resourceId, kaoId, bearerToken):

**Expected Result**: `400 Bad Request`

---

## Obtaining a Test JWT Token

To get a valid JWT token for testing, you need to:

### Option 1: Use DIVE Frontend (Recommended)
1. Navigate to DIVE frontend: `https://your-frontend-url`
2. Login via IdP
3. Open browser DevTools → Application → Cookies
4. Copy the `session-token` or `access_token` value

### Option 2: Direct Keycloak Token Request
```bash
# Get token from Keycloak
curl -X POST https://keycloak-url/realms/dive-v3-broker/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=dive-v3-broker-client" \
  -d "username=testuser-us" \
  -d "password=password123" \
  -d "scope=openid profile"
```

### Option 3: Request Test Token from DIVE Operator
Contact the DIVE operator to provision test user accounts with specific attributes.

---

## Security & Compliance

### Authentication
- KAS verifies JWT signatures using Keycloak JWKS (RS256)
- Tokens must be valid (not expired)
- Required claims: `uniqueID`, `clearance`, `countryOfAffiliation`

### Authorization (ACP-240)
KAS re-evaluates OPA policy before releasing keys:
1. **Clearance Check**: User clearance >= resource classification
2. **Releasability Check**: User country in resource releasability list
3. **COI Check**: User COI intersects with resource COI (if required)

### Audit Logging
All key requests are logged per ACP-240 Section 6:
- Subject (uniqueID, clearance, country, COI)
- Resource (resourceId, classification, releasability)
- Decision (ALLOW/DENY with reason)
- Timestamp and latency

### Fail-Closed Enforcement
- Policy evaluation failure → Deny access
- Backend unavailable → Deny access
- Invalid JWT → Deny access

---

## Rate Limits

**Current Limits** (ngrok free tier):
- 40 requests per minute
- 20 connections per minute

**Production Limits** (to be configured):
- 100 requests per minute per IP
- 10,000 requests per day per user

---

## Support & Contact

**Issues**: Contact DIVE operator at `<operator-email>`  
**Documentation**: See `docs/` in DIVE repository  
**Compliance**: ACP-240, STANAG 4774/5636, ISO 3166-1 alpha-3

---

## Example: Full Test Workflow

```bash
#!/bin/bash
# KAS Integration Test

BASE_URL="https://your-kas-url.ngrok.io"
TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."  # Your JWT token

echo "=== KAS Integration Test ==="
echo

# 1. Health check
echo "1. Health Check..."
curl -s "$BASE_URL/health" | jq .
echo

# 2. Valid request (should succeed)
echo "2. Valid Request (SECRET clearance, USA, FVEY)..."
curl -s -X POST "$BASE_URL/request-key" \
  -H "Content-Type: application/json" \
  -d "{
    \"resourceId\": \"doc-fuel-inventory-2024\",
    \"kaoId\": \"kao-test-001\",
    \"bearerToken\": \"$TOKEN\",
    \"wrappedKey\": \"dGVzdGtleQ==\"
  }" | jq .
echo

# 3. Invalid token (should fail with 401)
echo "3. Invalid Token Test..."
curl -s -X POST "$BASE_URL/request-key" \
  -H "Content-Type: application/json" \
  -d "{
    \"resourceId\": \"doc-fuel-inventory-2024\",
    \"kaoId\": \"kao-test-002\",
    \"bearerToken\": \"invalid-token\"
  }" | jq .
echo

echo "=== Test Complete ==="
```

---

## Troubleshooting

### Issue: "JWT verification failed"
**Cause**: Token signature invalid or expired  
**Solution**: Obtain a fresh token from Keycloak

### Issue: "Resource metadata unavailable"
**Cause**: Backend cannot find the resource  
**Solution**: Verify resourceId exists in DIVE backend

### Issue: "Policy evaluation service unavailable"
**Cause**: OPA service is down  
**Solution**: Contact DIVE operator

### Issue: Connection timeout
**Cause**: Tunnel may be down or rate limited  
**Solution**: Contact DIVE operator to verify service status

---

## API Client Examples

### Python
```python
import requests

BASE_URL = "https://your-kas-url.ngrok.io"
TOKEN = "your-jwt-token"

# Health check
response = requests.get(f"{BASE_URL}/health")
print(response.json())

# Request key
payload = {
    "resourceId": "doc-fuel-inventory-2024",
    "kaoId": "kao-123456",
    "bearerToken": TOKEN,
    "wrappedKey": "dGVzdGtleQ=="
}
response = requests.post(f"{BASE_URL}/request-key", json=payload)
print(response.json())
```

### JavaScript/Node.js
```javascript
const axios = require('axios');

const BASE_URL = 'https://your-kas-url.ngrok.io';
const TOKEN = 'your-jwt-token';

// Health check
const healthCheck = async () => {
  const response = await axios.get(`${BASE_URL}/health`);
  console.log(response.data);
};

// Request key
const requestKey = async () => {
  const payload = {
    resourceId: 'doc-fuel-inventory-2024',
    kaoId: 'kao-123456',
    bearerToken: TOKEN,
    wrappedKey: 'dGVzdGtleQ=='
  };
  const response = await axios.post(`${BASE_URL}/request-key`, payload);
  console.log(response.data);
};

healthCheck();
requestKey();
```

### cURL
```bash
# Health check
curl https://your-kas-url.ngrok.io/health

# Request key
curl -X POST https://your-kas-url.ngrok.io/request-key \
  -H "Content-Type: application/json" \
  -d '{
    "resourceId": "doc-fuel-inventory-2024",
    "kaoId": "kao-123456",
    "bearerToken": "your-jwt-token",
    "wrappedKey": "dGVzdGtleQ=="
  }'
```

---

## Next Steps

1. **Verify connectivity**: Test health endpoint
2. **Obtain JWT token**: Get test credentials from operator
3. **Run test scenarios**: Use provided examples
4. **Review responses**: Check decision details and audit logs
5. **Report issues**: Contact operator with requestId for debugging

For more information, see the [DIVE V3 Documentation](../README.md).


