# DIVE V3 Federation & ZTDF API - Postman Collection

## Quick Start

### 1. Import Collection

1. Open Postman
2. Click **Import** button
3. Select `DIVE-V3-Federation-API.postman_collection.json`
4. Collection appears in left sidebar

### 2. Configure Environment Variables

Click **Variables** tab in collection and update:

**Required:**
```
baseUrl: https://localhost:4000 (or your DIVE V3 backend URL)
keycloakUrl: https://localhost:8443 (or your Keycloak URL)
kasUrl: http://localhost:8080 (or your KAS URL)
realm: dive-v3-broker
clientId: dive-v3-client
username: testuser-us (or your test user)
password: your_password
```

**Optional (for federation testing):**
```
externalSpUrl: https://api.partner.mil
```

### 3. First Request

1. Expand **1. Authentication** folder
2. Click **Get Access Token (Direct Grant)**
3. Click **Send**
4. Access token is automatically saved in `{{accessToken}}` variable
5. All subsequent requests use this token automatically!

### 4. Test ZTDF Encryption

**Upload a document:**
1. Go to **2. Resources (ZTDF)** → **Upload Encrypted Resource**
2. Attach a file (any PDF, TXT, or image)
3. Set metadata (classification, releasability, COI)
4. Click **Send**
5. Document is encrypted and stored!

**View the encrypted document:**
1. Go to **2. Resources (ZTDF)** → **Get Resource by ID**
2. Use the `resourceId` from upload response (auto-saved in variable)
3. Click **Send**
4. Backend automatically requests key from KAS and decrypts!

### 5. Test KAS Directly

1. Go to **3. KAS (Key Access Service)** → **Request Decryption Key**
2. You need:
   - `resourceId` (from uploaded document)
   - `wrappedKey` (from resource metadata)
   - `accessToken` (already saved)
3. Click **Send**
4. KAS validates your clearance and releases key (or denies)

### 6. Test Federation

**Search across federated partners:**
1. Go to **4. Federation** → **Search Federated Resources**
2. Modify query (e.g., "fuel inventory")
3. Set `includeFederated: true`
4. Click **Send**
5. Results from DIVE V3 AND partner systems!

---

## Collection Structure

### 1. Authentication (4 requests)
- **Get Access Token** - Direct grant for testing (Resource Owner Password Credentials)
- **Refresh Access Token** - Renew expired token
- **Get User Info** - Retrieve user attributes
- **Logout** - Terminate session

### 2. Resources (ZTDF) (4 requests)
- **Search Local Resources** - List available documents
- **Get Resource by ID** - View specific document (auto-decrypts if authorized)
- **Upload Encrypted Resource** - Create new ZTDF-encrypted document
- **Delete Resource** - Remove document

### 3. KAS (Key Access Service) (3 requests)
- **KAS Health Check** - Verify KAS is running
- **Request Decryption Key** - Get DEK for encrypted resource (ALLOW scenario)
- **Request Key (Should Deny)** - Test denial (insufficient clearance)

### 4. Federation (4 requests)
- **Get Federation Metadata** - Discover DIVE V3 federation capabilities
- **Search Federated Resources** - Query local + partner resources
- **Request Federated Resource Access** - Access document from partner system
- **List Federation Partners** - View registered partners

### 5. OAuth 2.0 (External SP Integration) (5 requests)
- **OIDC Discovery** - OpenID Connect configuration
- **Get JWKS** - Public keys for JWT verification
- **OAuth: Authorization Code Flow (Step 1)** - Initiate OAuth flow
- **OAuth: Token Exchange (Step 2)** - Exchange code for token
- **Token Introspection** - Validate token

### 6. SCIM User Provisioning (5 requests)
- **SCIM: Get Service Provider Config** - Server capabilities
- **SCIM: List Users** - Query users (with filtering)
- **SCIM: Create User** - Provision new user
- **SCIM: Update User** - Modify user attributes (e.g., clearance upgrade)
- **SCIM: Delete User** - Deactivate user

### 7. Admin & Monitoring (3 requests)
- **Health Check** - Backend health status
- **Get Audit Logs** - Compliance logs
- **Get OPA Policy Decision** - Direct OPA query for testing

---

## Test Scenarios

### Scenario 1: Upload and View Encrypted Document (Happy Path)

1. **Authenticate**:
   ```
   POST {{keycloakUrl}}/realms/{{realm}}/protocol/openid-connect/token
   ```

2. **Upload document**:
   ```
   POST {{baseUrl}}/api/resources/upload
   File: fuel_report.pdf
   classification: SECRET
   releasabilityTo: ["USA", "GBR", "CAN"]
   COI: ["FVEY"]
   encrypted: true
   ```

3. **View document**:
   ```
   GET {{baseUrl}}/api/resources/{{resourceId}}
   ```
   Backend automatically:
   - Checks OPA authorization
   - Requests key from KAS
   - Decrypts content
   - Returns plaintext

### Scenario 2: KAS Denial (Insufficient Clearance)

1. **Authenticate as CONFIDENTIAL user**:
   ```
   username: testuser-confidential
   password: password
   ```

2. **Try to access SECRET document**:
   ```
   GET {{baseUrl}}/api/resources/doc-secret-001
   ```

3. **Result**: 403 Forbidden
   ```json
   {
     "error": "Forbidden",
     "message": "Insufficient clearance: CONFIDENTIAL < SECRET"
   }
   ```

### Scenario 3: Federated Search

1. **Authenticate**:
   ```
   username: testuser-us
   ```

2. **Search across systems**:
   ```
   POST {{baseUrl}}/api/federation/resources/search
   {
     "query": "logistics",
     "includeFederated": true
   }
   ```

3. **Result**: Combined results
   ```json
   {
     "results": [
       {
         "resourceId": "dive-doc-123",
         "title": "Logistics Plan Q4",
         "source": "local",
         "classification": "SECRET"
       },
       {
         "resourceId": "partner-doc-456",
         "title": "Supply Chain Analysis",
         "source": "partner-uk",
         "classification": "SECRET"
       }
     ]
   }
   ```

### Scenario 4: OAuth Integration (External SP)

**Your external Service Provider wants to integrate with DIVE V3.**

1. **Discover endpoints**:
   ```
   GET {{keycloakUrl}}/realms/{{realm}}/.well-known/openid-configuration
   ```

2. **Get public keys** (for JWT verification):
   ```
   GET {{keycloakUrl}}/realms/{{realm}}/protocol/openid-connect/certs
   ```

3. **Redirect user to DIVE V3** (Step 1 - Authorization):
   ```
   GET {{keycloakUrl}}/realms/{{realm}}/protocol/openid-connect/auth
     ?client_id=your-client-id
     &redirect_uri=https://your-sp.mil/callback
     &response_type=code
     &scope=openid profile email
     &code_challenge=<PKCE_CHALLENGE>
     &code_challenge_method=S256
   ```

4. **User logs in**, DIVE V3 redirects back:
   ```
   https://your-sp.mil/callback?code=AUTH_CODE_123&state=random_state
   ```

5. **Exchange code for token** (Step 2):
   ```
   POST {{keycloakUrl}}/realms/{{realm}}/protocol/openid-connect/token
   grant_type: authorization_code
   code: AUTH_CODE_123
   code_verifier: <PKCE_VERIFIER>
   ```

6. **Receive tokens**:
   ```json
   {
     "access_token": "eyJhbGc...",
     "id_token": "eyJhbGc...",
     "refresh_token": "eyJhbGc...",
     "expires_in": 900
   }
   ```

7. **Decode ID token** to get user attributes:
   ```json
   {
     "sub": "12345",
     "uniqueID": "bob.smith@raf.uk",
     "clearance": "SECRET",
     "countryOfAffiliation": "GBR",
     "acpCOI": ["FVEY"],
     "email": "bob.smith@raf.uk"
   }
   ```

8. **Your SP can now**:
   - Authorize Bob based on clearance
   - Filter resources by releasability (GBR)
   - Grant access to FVEY resources

---

## Scripts & Automation

### Automatic Token Management

The collection includes test scripts that automatically:
- Save access token to `{{accessToken}}` variable
- Save refresh token to `{{refreshToken}}` variable
- Decode and log JWT claims
- Save resourceId from upload responses
- Validate responses

Example (from "Get Access Token"):
```javascript
if (pm.response.code === 200) {
    const jsonData = pm.response.json();
    pm.collectionVariables.set('accessToken', jsonData.access_token);
    pm.collectionVariables.set('refreshToken', jsonData.refresh_token);
    
    // Decode JWT
    const tokenParts = jsonData.access_token.split('.');
    const payload = JSON.parse(atob(tokenParts[1]));
    console.log('Clearance:', payload.clearance);
    console.log('Country:', payload.countryOfAffiliation);
}
```

### Test Assertions

Requests include test assertions:
```javascript
pm.test('Status code is 200', function () {
    pm.response.to.have.status(200);
});

pm.test('Access token received', function () {
    pm.expect(jsonData.access_token).to.be.a('string');
});
```

---

## Troubleshooting

### "401 Unauthorized" Error

**Problem**: Token expired or invalid

**Solution**:
1. Run **Authentication → Get Access Token** again
2. Check token expiration: tokens expire after 15 minutes
3. Use **Refresh Access Token** if you have a refresh token

### "403 Forbidden" Error

**Problem**: Authorization denied (insufficient clearance, wrong country, etc.)

**Solution**:
1. Check your user's attributes:
   ```
   GET {{keycloakUrl}}/realms/{{realm}}/protocol/openid-connect/userinfo
   ```
2. Compare to resource requirements:
   ```
   GET {{baseUrl}}/api/resources/{{resourceId}}
   ```
3. Check audit logs for denial reason:
   ```
   GET {{baseUrl}}/api/admin/audit-logs?resourceId={{resourceId}}
   ```

### "SSL Certificate Error"

**Problem**: Self-signed certificates in dev environment

**Solution**:
1. Postman Settings → General
2. Turn OFF "SSL certificate verification"
3. (Only for testing! Enable in production)

### "KAS: No wrappedKey provided"

**Problem**: Trying to request key without wrappedKey parameter

**Solution**:
1. First get resource:
   ```
   GET {{baseUrl}}/api/resources/{{resourceId}}
   ```
2. Extract `kasObligation.wrappedKey` from response
3. Use that in KAS request

### "Connection Refused"

**Problem**: Service not running

**Solution**:
```bash
# Check all services are running
docker ps

# Should see:
# - dive-v3-backend (port 4000)
# - dive-v3-keycloak (port 8443)
# - dive-v3-kas (port 8080)
# - dive-v3-mongodb (port 27017)
# - dive-v3-opa (port 8181)

# If not running:
cd /path/to/DIVE-V3
docker-compose up -d
```

---

## API Response Examples

### Success: Resource Retrieved

```json
{
  "resourceId": "doc-fuel-001",
  "title": "Q4 2025 SPAM Inventory",
  "classification": "SECRET",
  "releasabilityTo": ["USA", "GBR", "CAN"],
  "COI": ["FVEY"],
  "encrypted": true,
  "content": "SPAM INVENTORY REPORT\n\nTotal spam on hand: 1,250,000 gallons...",
  "displayMarking": "SECRET//FVEY",
  "metadata": {
    "createdAt": "2025-11-01T10:00:00Z",
    "updatedAt": "2025-11-01T10:00:00Z"
  }
}
```

### Success: KAS Key Released

```json
{
  "success": true,
  "dek": "eXNjaGxhYm5kZm9ienZqc2RmanNkZmprbHNkZmRzZg==",
  "kaoId": "kao-doc-fuel-001",
  "kasDecision": {
    "allow": true,
    "reason": "All policy conditions satisfied",
    "timestamp": "2025-11-04T14:30:00.123Z",
    "evaluationDetails": {
      "clearanceCheck": "PASS",
      "releasabilityCheck": "PASS",
      "coiCheck": "PASS",
      "policyBinding": {
        "required": {
          "clearance": "SECRET",
          "countries": ["USA", "GBR", "CAN"],
          "coi": ["FVEY"]
        },
        "provided": {
          "clearance": "SECRET",
          "country": "GBR",
          "coi": ["FVEY"]
        }
      }
    }
  },
  "auditEventId": "kas-req-abc123",
  "executionTimeMs": 45,
  "responseTimestamp": "2025-11-04T14:30:00.123Z"
}
```

### Denial: Insufficient Clearance

```json
{
  "success": false,
  "error": "Forbidden",
  "denialReason": "Insufficient clearance: CONFIDENTIAL < SECRET",
  "details": {
    "clearance_check": "FAIL",
    "releasability_check": "PASS",
    "coi_check": "PASS",
    "required_clearance": "SECRET",
    "provided_clearance": "CONFIDENTIAL"
  },
  "kasDecision": {
    "allow": false,
    "reason": "Clearance insufficient",
    "evaluationDetails": {
      "clearanceCheck": "FAIL",
      "releasabilityCheck": "PASS",
      "coiCheck": "PASS"
    }
  },
  "responseTimestamp": "2025-11-04T14:31:00.456Z"
}
```

### Denial: Country Not Releasable

```json
{
  "success": false,
  "error": "Forbidden",
  "denialReason": "Country FRA not in releasabilityTo: [USA, GBR]",
  "details": {
    "clearance_check": "PASS",
    "releasability_check": "FAIL",
    "coi_check": "PASS",
    "required_countries": ["USA", "GBR"],
    "provided_country": "FRA"
  }
}
```

---

## Advanced Usage

### Running Collection with Newman (CLI)

```bash
# Install Newman
npm install -g newman

# Run entire collection
newman run DIVE-V3-Federation-API.postman_collection.json \
  --env-var "baseUrl=https://localhost:4000" \
  --env-var "keycloakUrl=https://localhost:8443" \
  --env-var "username=testuser-us" \
  --env-var "password=password" \
  --insecure

# Run specific folder
newman run DIVE-V3-Federation-API.postman_collection.json \
  --folder "2. Resources (ZTDF)" \
  --insecure

# Generate HTML report
newman run DIVE-V3-Federation-API.postman_collection.json \
  --reporters cli,html \
  --reporter-html-export newman-report.html \
  --insecure
```

### CI/CD Integration

```yaml
# .github/workflows/api-tests.yml
name: API Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Start DIVE V3 Stack
        run: docker-compose up -d
      
      - name: Wait for services
        run: sleep 30
      
      - name: Run Postman Tests
        run: |
          npm install -g newman
          newman run docs/postman/DIVE-V3-Federation-API.postman_collection.json \
            --env-var "baseUrl=http://localhost:4000" \
            --reporters cli,junit \
            --reporter-junit-export results.xml
      
      - name: Publish Test Results
        uses: EnricoMi/publish-unit-test-result-action@v2
        with:
          files: results.xml
```

---

## Security Notes

### Token Security

- ✅ Tokens are JWT (JSON Web Tokens), signed with RS256
- ✅ Verify signature using JWKS endpoint
- ✅ Check expiration (`exp` claim)
- ✅ Tokens expire after 15 minutes (access) / 8 hours (refresh)
- ❌ **NEVER** share tokens or commit them to Git

### PKCE (Proof Key for Code Exchange)

OAuth authorization code flow **MUST** use PKCE:

```javascript
// Generate code_verifier (64 random characters)
const codeVerifier = crypto.randomBytes(64).toString('base64url');

// Generate code_challenge (SHA256 hash)
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

// Send code_challenge in authorization request
// Send code_verifier in token exchange
```

DIVE V3 enforces PKCE with S256 method (SHA256 required, not plain).

---

**Last Updated**: November 4, 2025  
**Collection Version**: 2.0.0  
**Compatible with**: DIVE V3 v2.0+

