# DIVE V3 Quick Reference Card
**ZTDF Encryption + KAS + Federation**

---

## 🔐 ZTDF (Zero Trust Data Format)

**What is it?** Encrypted file format with embedded access control policy

**Three Parts:**
1. **Manifest** - Metadata (ID, owner, type, size)
2. **Policy** - Rules (classification, releasability, COI) - *Digitally signed*
3. **Payload** - Encrypted content + Key Access Objects (KAOs)

**Encryption**: AES-256-GCM (32-byte DEK, 12-byte IV, 16-byte auth tag)

---

## 🔑 KAS (Key Access Service)

**What is it?** Smart key guardian that enforces policy before releasing decryption keys

**Decision Flow:**
```
1. Validate JWT → 2. Extract attributes → 3. Fetch policy →
4. Check OPA → 5. Unwrap DEK → 6. Log → 7. Return key (or deny)
```

**Checks:**
- ✅ Clearance sufficient? (hierarchical: TOP_SECRET > SECRET > CONFIDENTIAL > UNCLASSIFIED)
- ✅ Country in releasabilityTo? (exact match)
- ✅ COI intersects? (ANY match, unless coiOperator=ALL)
- ✅ Embargo expired? (creationDate + ±5min tolerance)
- ✅ MFA completed? (acr >= 1 for AAL2)

**Response Time:** p95 < 200ms | **Throughput:** 100+ req/s

---

## 🌐 Federation

**What is it?** Protocol to connect external identity providers and service providers

**Two Integration Types:**

### Option 1: You as Identity Provider (IdP)
**Time:** 2-4 hours (config only)
**You provide:** OIDC/SAML endpoint + user attributes
**DIVE V3 does:** Accepts your tokens, enforces policies, manages encryption

**Required Attributes:**
- `uniqueID` - Unique identifier
- `clearance` - UNCLASSIFIED | CONFIDENTIAL | SECRET | TOP_SECRET
- `countryOfAffiliation` - ISO 3166-1 alpha-3 (USA, GBR, FRA, etc.)
- `acpCOI` - (optional) Communities of Interest array

### Option 2: You as Service Provider (SP)
**Time:** 1-2 days (dev required)
**You do:** OAuth 2.0 client, token validation, authorization
**DIVE V3 provides:** Authentication, user attributes, federated search

**Endpoints:**
- `GET /.well-known/openid-configuration` - OIDC discovery
- `GET /protocol/openid-connect/certs` - JWKS for token validation
- `POST /oauth/token` - Token exchange

---

## 📊 API Endpoints

### Resources (ZTDF)
```http
GET    /api/resources              # List resources
GET    /api/resources/:id          # Get resource (auto-decrypts if authorized)
POST   /api/resources/upload       # Upload & encrypt
DELETE /api/resources/:id          # Delete resource
```

### KAS
```http
GET  /health                       # KAS health check
POST /request-key                  # Request decryption key
  Body: {resourceId, kaoId, bearerToken, wrappedKey}
```

### Federation
```http
GET  /.well-known/federation-metadata       # Federation capabilities
POST /api/federation/resources/search       # Federated search
POST /api/federation/resources/request-access  # Access remote resource
GET  /api/federation/partners               # List partners
```

### OAuth 2.0
```http
GET  /.well-known/openid-configuration      # OIDC discovery
GET  /protocol/openid-connect/certs         # JWKS
POST /protocol/openid-connect/token         # Token endpoint
POST /protocol/openid-connect/token/introspect  # Token validation
```

### SCIM 2.0
```http
GET    /scim/v2/Users                       # List users
POST   /scim/v2/Users                       # Create user
PUT    /scim/v2/Users/:id                   # Update user
DELETE /scim/v2/Users/:id                   # Delete user
GET    /scim/v2/ServiceProviderConfig       # Server capabilities
```

---

## 🔒 Security Standards

**Encryption:**
- Content: AES-256-GCM (symmetric)
- Keys: RSA-OAEP-256 or AES-256-KW (key wrapping)
- Signatures: RSA-SHA256 (min 2048-bit, prefer 4096-bit)
- Tokens: RS256 JWT

**Protocols:**
- OIDC: OpenID Connect Core 1.0
- OAuth: RFC 6749 + RFC 7636 (PKCE mandatory)
- SAML: 2.0 with RSA_SHA256 signatures (not SHA1)
- SCIM: RFC 7644

**NATO Standards:**
- ACP-240 (A): Data-Centric Security
- STANAG 4774: Security Labels
- STANAG 5636: Display Markings
- STANAG 4778: Cryptographic Binding

**NIST Standards:**
- SP 800-63B: Authentication (AAL2 with MFA)
- SP 800-63C: Federation (OIDC/SAML)
- SP 800-53: Security Controls
- NIST ABAC: Attribute-Based Access Control

---

## 🚨 Common Error Codes

| Code | Error | Reason | Solution |
|------|-------|--------|----------|
| 401 | Unauthorized | Invalid/expired token | Re-authenticate |
| 403 | Forbidden | Authorization denied | Check clearance/country/COI |
| 404 | Not Found | Resource doesn't exist | Verify resourceId |
| 500 | Internal Error | Service error | Check logs, retry |
| 503 | Service Unavailable | KAS/OPA down | Wait & retry (fail-closed) |

---

## 🔍 Troubleshooting

**"Insufficient clearance"**
- User clearance < document classification
- Solution: Clearance upgrade or request downgrade review

**"Country not in releasabilityTo"**
- User's country not in document's release list
- Solution: Request releasability expansion or use shared COI

**"COI not satisfied"**
- User lacks required COI membership
- Solution: Join COI or request resource COI exemption

**"Token expired"**
- Access token lifetime: 15 minutes
- Solution: Use refresh token or re-authenticate

**"KAS denied (Backend allowed)"**
- Policy changed between checks
- Solution: Expected (defense in depth); check audit logs

---

## 📈 Performance Targets

| Operation | Target Latency | Throughput |
|-----------|---------------|------------|
| Auth (OIDC) | < 500ms p95 | 1000 req/s |
| Resource Get | < 200ms p95 | 500 req/s |
| KAS Key Request | < 200ms p95 | 100 req/s |
| OPA Decision | < 100ms p95 | 2000 req/s |
| Federated Search | < 1s p95 | 100 req/s |

---

## 📝 Example JWT Token

```json
{
  "sub": "12345-abcde-67890",
  "uniqueID": "bob.smith@raf.uk",
  "clearance": "SECRET",
  "countryOfAffiliation": "GBR",
  "acpCOI": ["FVEY", "NATO-COSMIC"],
  "dutyOrg": "Royal Air Force",
  "orgUnit": "RAF Northolt",
  "acr": "1",
  "amr": ["pwd", "otp"],
  "auth_time": 1730736600,
  "iss": "https://keycloak.dive-v3.mil/realms/dive-v3-broker",
  "aud": "dive-v3-client",
  "exp": 1730737500,
  "iat": 1730736600,
  "nbf": 1730736600
}
```

**Key Claims:**
- `acr` (Authentication Context): 0=AAL1, 1=AAL2, 2=AAL3
- `amr` (Authentication Methods): ["pwd", "otp"] = password + MFA
- `auth_time`: Unix timestamp of authentication
- `exp`: Expiration (15 min from iat)

---

## 🎯 15-Minute Demo Script

**Scenario:** U.K. user accessing U.S. SECRET fuel inventory (FVEY)

1. **Login** (2 min)
   - Open DIVE V3 → Click "Login with UK"
   - Authenticate with MFA (AAL2)
   - Token issued with clearance=SECRET, country=GBR, coi=[FVEY]

2. **Upload** (3 min)
   - Upload "fuel_report.pdf"
   - Set: classification=SECRET, releaseTo=[USA,GBR,CAN], COI=[FVEY]
   - Backend encrypts → Stores ZTDF → Registers with KAS

3. **View (Authorized)** (3 min)
   - Click document
   - Backend checks OPA → ALLOW (SECRET >= SECRET, GBR in list, FVEY match)
   - Backend requests key from KAS → KAS re-checks → ALLOW
   - Content decrypted → Displayed

4. **View Denial** (2 min)
   - Switch to French user (country=FRA, not in releaseTo)
   - Click same document
   - Backend checks OPA → DENY (FRA not in [USA,GBR,CAN])
   - Error shown: "Country FRA not in releasability list"

5. **Federation Search** (3 min)
   - Search "logistics"
   - Results from DIVE V3 + Partner system (UK MOD)
   - Click partner document → Federated access request
   - Partner authorizes → Content displayed

6. **Audit Log** (2 min)
   - Admin views audit logs
   - All decisions logged: timestamps, users, resources, allow/deny

**Result:** Live demo of policy-bound encryption + federation!

---

## 📞 Support

- **Documentation:** `docs/ZTDF-KAS-FEDERATION-LAYMANS-GUIDE.md`
- **Postman Collection:** `docs/postman/DIVE-V3-Federation-API.postman_collection.json`
- **API Docs:** `https://api.dive-v3.mil/docs`
- **Keycloak:** `https://keycloak.dive-v3.mil/admin`
- **OPA Playground:** `http://localhost:8181/v1/data`

**Contacts:**
- Technical: dive-v3-support@mil
- Security: dive-v3-security@mil
- Federation: aubrey.beach@example.mil

---

**Version:** 2.0 | **Last Updated:** November 4, 2025

