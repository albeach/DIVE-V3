# DIVE V3 Service Provider Onboarding Guide

> **Step-by-Step Guide for External Service Providers**
> 
> Complete guide to registering your organization, integrating with DIVE V3, and accessing federated resources.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Registration Process](#registration-process)
3. [OAuth 2.0 Configuration](#oauth-20-configuration)
4. [SCIM 2.0 User Provisioning](#scim-20-user-provisioning)
5. [Federation Protocol](#federation-protocol)
6. [Testing & Validation](#testing--validation)
7. [Production Deployment](#production-deployment)
8. [Troubleshooting](#troubleshooting)
9. [Security Best Practices](#security-best-practices)

---

## Prerequisites

Before registering your Service Provider (SP) with DIVE V3, ensure you have:

### Technical Requirements

- [ ] **HTTPS Endpoint**: All redirect URIs must use HTTPS (except localhost for testing)
- [ ] **JWKS Endpoint** (optional): If using `private_key_jwt` authentication
- [ ] **OAuth 2.0 Client Library**: For implementing authorization code flow
- [ ] **PKCE Support**: Your OAuth client must support PKCE (RFC 7636)
- [ ] **SCIM Client** (optional): For automated user provisioning

### Organizational Requirements

- [ ] **Signed Federation Agreement**: Bilateral data sharing agreement with DIVE V3 operator
- [ ] **Security Clearance Approval**: Approval for accessing classified resources
- [ ] **Technical Point of Contact**: Designated individual for integration support
- [ ] **Administrative Contact**: For approval workflows and governance

### Network Requirements

- [ ] **Outbound HTTPS**: Your network must allow HTTPS (443) to `api.dive-v3.mil`
- [ ] **TLS 1.2+**: Minimum TLS version supported
- [ ] **IP Whitelisting** (optional): Provide IP ranges for enhanced security

---

## Registration Process

### Step 1: Prepare Registration Request

Gather the following information:

```json
{
  "name": "Your Organization Name",
  "organizationType": "MILITARY | GOVERNMENT | INDUSTRY | ACADEMIC",
  "country": "ISO 3166-1 alpha-3 country code (e.g., USA, GBR, FRA)",
  "technicalContact": {
    "name": "John Smith",
    "email": "john.smith@your-org.mil",
    "phone": "+1-555-123-4567"
  },
  "redirectUris": [
    "https://your-app.your-org.mil/oauth/callback",
    "https://your-app-staging.your-org.mil/oauth/callback"
  ],
  "postLogoutRedirectUris": [
    "https://your-app.your-org.mil/logout"
  ],
  "clientType": "confidential | public",
  "tokenEndpointAuthMethod": "client_secret_basic | client_secret_post | private_key_jwt",
  "requirePKCE": true,
  "allowedScopes": [
    "resource:read",
    "resource:search",
    "scim:read",
    "scim:write"
  ],
  "allowedGrantTypes": [
    "authorization_code",
    "client_credentials",
    "refresh_token"
  ],
  "jwksUri": "https://your-app.your-org.mil/.well-known/jwks.json",
  "attributeRequirements": {
    "clearanceLevels": ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET"],
    "requiredAttributes": ["uniqueID", "clearance", "countryOfAffiliation"]
  }
}
```

### Step 2: Submit Registration Request

**API Endpoint**: `POST https://api.dive-v3.mil/api/sp/register`

**Example cURL**:
```bash
curl -X POST https://api.dive-v3.mil/api/sp/register \
  -H "Content-Type: application/json" \
  -d @sp-registration.json
```

**Response**:
```json
{
  "spId": "SP-1730659200-ABC123",
  "status": "PENDING",
  "message": "Registration submitted successfully. Awaiting admin approval.",
  "estimatedApprovalTime": "2-5 business days",
  "trackingUrl": "https://portal.dive-v3.mil/sp/track/SP-1730659200-ABC123"
}
```

### Step 3: Await Approval

**Approval Process**:
1. **Initial Review** (1-2 days): DIVE V3 administrators verify organizational information
2. **Security Review** (1-2 days): Security team validates technical requirements
3. **Federation Agreement** (1-2 days): Legal review of data sharing agreement
4. **Final Approval**: SP status changed to `ACTIVE`

**Status Check**:
```bash
curl https://api.dive-v3.mil/api/sp/status/SP-1730659200-ABC123
```

### Step 4: Receive OAuth Credentials

Upon approval, you'll receive:

**Email Notification**:
```
Subject: DIVE V3 SP Registration Approved - SP-1730659200-ABC123

Your Service Provider registration has been approved!

Client ID: sp-gbr-1730659200-abc123
Client Secret: [REDACTED - See secure portal]

Download your credentials:
https://portal.dive-v3.mil/sp/credentials/SP-1730659200-ABC123

Federation Agreement:
- Agreement ID: NATO-2025-Q4
- Countries: USA, GBR, CAN, AUS, NZL, FRA, DEU, ITA, ESP, POL
- Classifications: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET
- Valid Until: 2025-12-31T23:59:59Z
- Allowed COI: NATO-COSMIC, FVEY

Rate Limits:
- Requests per Minute: 60
- Burst Size: 10
- Daily Quota: 10,000

Next Steps:
1. Configure your OAuth client (see documentation)
2. Test in sandbox environment
3. Request production access
```

**⚠️ Security Note**: Store client_secret securely in a secrets management system (e.g., AWS Secrets Manager, HashiCorp Vault).

---

## OAuth 2.0 Configuration

### Grant Type: Authorization Code + PKCE

**Recommended for**: Web applications, mobile apps, user authentication

#### Implementation Steps

##### 1. Generate Code Verifier and Challenge

```javascript
// JavaScript/Node.js example
const crypto = require('crypto');

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

const codeVerifier = generateCodeVerifier();
const codeChallenge = generateCodeChallenge(codeVerifier);

// Store codeVerifier in session (you'll need it later)
req.session.codeVerifier = codeVerifier;
```

##### 2. Redirect User to Authorization Endpoint

```javascript
const authUrl = new URL('https://api.dive-v3.mil/oauth/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', 'sp-gbr-1730659200-abc123');
authUrl.searchParams.set('redirect_uri', 'https://your-app.your-org.mil/oauth/callback');
authUrl.searchParams.set('scope', 'resource:read resource:search');
authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');

// Store state in session for CSRF protection
req.session.oauthState = authUrl.searchParams.get('state');

// Redirect user
res.redirect(authUrl.toString());
```

##### 3. Handle Callback

```javascript
app.get('/oauth/callback', async (req, res) => {
  const { code, state } = req.query;

  // Verify state (CSRF protection)
  if (state !== req.session.oauthState) {
    return res.status(400).send('Invalid state parameter');
  }

  // Exchange code for tokens
  const tokenResponse = await fetch('https://api.dive-v3.mil/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'https://your-app.your-org.mil/oauth/callback',
      code_verifier: req.session.codeVerifier
    })
  });

  const tokens = await tokenResponse.json();

  // Store tokens securely
  req.session.accessToken = tokens.access_token;
  req.session.refreshToken = tokens.refresh_token;

  res.redirect('/dashboard');
});
```

##### 4. Use Access Token

```javascript
// Make authenticated API requests
const response = await fetch('https://api.dive-v3.mil/federation/search?classification=SECRET', {
  headers: {
    'Authorization': `Bearer ${req.session.accessToken}`
  }
});

const resources = await response.json();
```

##### 5. Refresh Token

```javascript
async function refreshAccessToken(refreshToken) {
  const response = await fetch('https://api.dive-v3.mil/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  const tokens = await response.json();
  return tokens;
}
```

### Grant Type: Client Credentials

**Recommended for**: Backend services, machine-to-machine authentication

```javascript
async function getServiceToken() {
  const response = await fetch('https://api.dive-v3.mil/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'resource:read resource:search'
    })
  });

  const tokens = await response.json();
  return tokens.access_token;
}

// Use service token
const accessToken = await getServiceToken();
const response = await fetch('https://api.dive-v3.mil/federation/search', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

---

## SCIM 2.0 User Provisioning

### Create User

```javascript
async function createUser(accessToken, user) {
  const response = await fetch('https://api.dive-v3.mil/scim/v2/Users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/scim+json'
    },
    body: JSON.stringify({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      userName: user.email,
      name: {
        givenName: user.firstName,
        familyName: user.lastName
      },
      emails: [{
        value: user.email,
        type: 'work',
        primary: true
      }],
      active: true,
      "urn:dive:params:scim:schemas:extension:2.0:User": {
        clearance: user.clearance,
        countryOfAffiliation: user.country,
        acpCOI: user.coi,
        dutyOrg: user.organization
      }
    })
  });

  return await response.json();
}

// Example usage
const newUser = await createUser(accessToken, {
  email: 'john.doe@nato.int',
  firstName: 'John',
  familyName: 'Doe',
  clearance: 'SECRET',
  country: 'USA',
  coi: ['NATO-COSMIC', 'FVEY'],
  organization: 'U.S. Army'
});
```

### Search Users

```javascript
async function searchUsers(accessToken, filter) {
  const url = new URL('https://api.dive-v3.mil/scim/v2/Users');
  url.searchParams.set('filter', filter);
  url.searchParams.set('count', '20');

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  return await response.json();
}

// Example: Find user by email
const users = await searchUsers(accessToken, 'emails[type eq "work"].value eq "john.doe@nato.int"');
```

### Update User

```javascript
async function updateUser(accessToken, userId, updates) {
  const response = await fetch(`https://api.dive-v3.mil/scim/v2/Users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/scim+json'
    },
    body: JSON.stringify({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [
        {
          op: 'replace',
          path: 'urn:dive:params:scim:schemas:extension:2.0:User:clearance',
          value: 'TOP_SECRET'
        }
      ]
    })
  });

  return await response.json();
}
```

---

## Federation Protocol

### Get Federation Metadata

```javascript
const metadata = await fetch('https://api.dive-v3.mil/federation/metadata');
const capabilities = await metadata.json();

console.log('Supported classifications:', capabilities.capabilities.classifications);
console.log('Supported countries:', capabilities.capabilities.countries);
console.log('Supported COI:', capabilities.capabilities.coi);
```

### Federated Search

```javascript
async function searchFederatedResources(accessToken, criteria) {
  const url = new URL('https://api.dive-v3.mil/federation/search');
  if (criteria.classification) url.searchParams.set('classification', criteria.classification);
  if (criteria.keywords) url.searchParams.set('keywords', criteria.keywords);
  if (criteria.coi) url.searchParams.set('coi', criteria.coi.join(','));

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  return await response.json();
}

// Example usage
const results = await searchFederatedResources(accessToken, {
  classification: 'SECRET',
  keywords: 'intelligence report',
  coi: ['NATO-COSMIC']
});
```

### Request Resource Access

```javascript
async function requestResourceAccess(accessToken, resourceId, justification) {
  const response = await fetch('https://api.dive-v3.mil/federation/resources/request', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      resourceId,
      justification
    })
  });

  return await response.json();
}

// Example usage
const request = await requestResourceAccess(
  accessToken,
  'doc-456',
  'Required for Operation Atlantic Resolve planning'
);
```

---

## Testing & Validation

### Sandbox Environment

DIVE V3 provides a sandbox environment for testing:

- **Base URL**: `https://sandbox.api.dive-v3.mil`
- **Test Users**: Pre-configured test users with various clearance levels
- **Sample Data**: Synthetic resources for testing

### Test Checklist

- [ ] **OAuth Flow**: Successfully complete authorization code flow
- [ ] **PKCE Validation**: Verify PKCE challenge/verifier works
- [ ] **Token Refresh**: Test refresh token rotation
- [ ] **SCIM User CRUD**: Create, read, update, delete users
- [ ] **Federated Search**: Search resources with classification filters
- [ ] **Rate Limiting**: Verify rate limit headers and 429 responses
- [ ] **Error Handling**: Test invalid credentials, expired tokens, etc.

### Example Test Suite

```javascript
describe('DIVE V3 Integration Tests', () => {
  let accessToken;

  it('should authenticate via authorization code flow', async () => {
    // Test implementation
  });

  it('should search federated resources', async () => {
    const results = await searchFederatedResources(accessToken, {
      classification: 'SECRET'
    });
    expect(results.results.length).toBeGreaterThan(0);
  });

  it('should create SCIM user', async () => {
    const user = await createUser(accessToken, testUserData);
    expect(user.id).toBeDefined();
  });
});
```

---

## Production Deployment

### Pre-Launch Checklist

- [ ] **Security Review**: Complete internal security review
- [ ] **Load Testing**: Test with expected production load
- [ ] **Monitoring**: Configure logging and alerting
- [ ] **Secrets Management**: Store client_secret securely
- [ ] **Disaster Recovery**: Document recovery procedures
- [ ] **Support Contacts**: Identify 24/7 support contacts

### Production Configuration

```javascript
// config/production.js
module.exports = {
  oauth: {
    authorizationUrl: 'https://api.dive-v3.mil/oauth/authorize',
    tokenUrl: 'https://api.dive-v3.mil/oauth/token',
    clientId: process.env.DIVE_V3_CLIENT_ID,
    clientSecret: process.env.DIVE_V3_CLIENT_SECRET,
    redirectUri: 'https://your-app.your-org.mil/oauth/callback',
    scope: 'resource:read resource:search scim:read',
    requirePKCE: true
  },
  scim: {
    baseUrl: 'https://api.dive-v3.mil/scim/v2',
    timeout: 30000,
    retryAttempts: 3
  },
  rateLimit: {
    maxRequestsPerMinute: 60,
    burstSize: 10
  }
};
```

### Monitoring & Logging

```javascript
// Log all OAuth requests
logger.info('OAuth token request', {
  clientId: CLIENT_ID,
  grantType: 'authorization_code',
  scope: 'resource:read',
  timestamp: new Date().toISOString()
});

// Monitor rate limit headers
if (response.headers['x-ratelimit-remaining'] < 10) {
  logger.warn('Approaching rate limit', {
    remaining: response.headers['x-ratelimit-remaining'],
    limit: response.headers['x-ratelimit-limit'],
    reset: response.headers['x-ratelimit-reset']
  });
}
```

---

## Troubleshooting

### Common Issues

#### 1. Invalid Redirect URI

**Error**: `invalid_redirect_uri`

**Solution**: Ensure redirect URI exactly matches registered URI (including protocol, port, path)

```javascript
// ❌ Wrong
redirectUri: 'http://your-app.your-org.mil/callback'  // http instead of https

// ✅ Correct
redirectUri: 'https://your-app.your-org.mil/oauth/callback'  // Exact match
```

#### 2. PKCE Verification Failed

**Error**: `invalid_grant: PKCE verification failed`

**Solution**: Ensure you're using the same code_verifier used to generate code_challenge

```javascript
// Store verifier during authorization request
req.session.codeVerifier = codeVerifier;

// Use stored verifier during token exchange
code_verifier: req.session.codeVerifier
```

#### 3. Rate Limit Exceeded

**Error**: `429 Too Many Requests`

**Solution**: Implement exponential backoff and respect rate limit headers

```javascript
if (response.status === 429) {
  const retryAfter = parseInt(response.headers['retry-after'] || '60');
  await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
  // Retry request
}
```

#### 4. SCIM Filter Syntax Error

**Error**: `400 Bad Request: Invalid filter syntax`

**Solution**: Use proper SCIM filter syntax

```javascript
// ❌ Wrong
filter: 'userName = john.doe@nato.int'

// ✅ Correct
filter: 'userName eq "john.doe@nato.int"'
```

### Support Contacts

- **Technical Support**: support@dive-v3.mil
- **Security Issues**: security@dive-v3.mil
- **Emergency (24/7)**: +1-555-DIVE-V3 (348-383)

---

## Security Best Practices

### 1. Credential Management

- ✅ **Store secrets in secure vault** (AWS Secrets Manager, HashiCorp Vault)
- ✅ **Rotate client_secret every 90 days**
- ✅ **Never commit secrets to source control**
- ✅ **Use environment variables for configuration**

### 2. Token Handling

- ✅ **Store tokens server-side** (not in browser localStorage)
- ✅ **Use httpOnly, secure cookies** for web apps
- ✅ **Implement token refresh before expiration**
- ✅ **Revoke tokens on logout**

### 3. HTTPS & TLS

- ✅ **Use TLS 1.2 or higher**
- ✅ **Validate SSL certificates**
- ✅ **Pin public keys** (optional)

### 4. Input Validation

- ✅ **Validate all user inputs**
- ✅ **Sanitize SCIM filter expressions**
- ✅ **Check resource IDs before access**

### 5. Logging & Monitoring

- ✅ **Log all authentication attempts**
- ✅ **Monitor rate limit usage**
- ✅ **Alert on security events** (repeated failures, token replay)
- ✅ **Retain logs for 90 days** minimum

### 6. Incident Response

- ✅ **Document incident response procedures**
- ✅ **Have emergency contacts readily available**
- ✅ **Test disaster recovery procedures quarterly**

---

## Additional Resources

- 📄 [Federation Enhancement Plan](./federation-enhancement-plan.md)
- 📄 [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- 📄 [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)
- 📄 [SCIM 2.0 RFC 7644](https://tools.ietf.org/html/rfc7644)
- 📄 [OWASP OAuth 2.0 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)

---

**Questions?** Contact the DIVE V3 Federation Team at `federation@dive-v3.mil`

