# Week 3.5 Implementation Prompt - GEOAxIS OIDC Integration

**Start Date:** October 12, 2025  
**Duration:** 3-5 days  
**Objective:** Integrate real operational IdP (GEOAxIS ICAM Services) into DIVE V3 Pilot

---

## CONTEXT FROM PREVIOUS WEEKS (Summary)

### Week 1-3 Status: ✅ COMPLETE

**Repository:** https://github.com/albeach/DIVE-V3  
**Branch:** main  
**Latest Commit:** b31e51e  
**CI/CD:** All jobs passing ✅

**What's Already Built:**
- ✅ Keycloak realm `dive-v3-pilot` with multi-IdP federation
- ✅ Next.js 15 frontend with NextAuth.js v5 (database session strategy)
- ✅ Express.js backend API with PEP (Policy Enforcement Point)
- ✅ OPA policy engine with 78 passing tests
- ✅ MongoDB with 8 sample resources
- ✅ PostgreSQL for NextAuth sessions and Keycloak
- ✅ Complete Docker Compose stack

**IdPs Currently Operational:**
1. **U.S. IdP** (direct in dive-v3-pilot) - Week 1 baseline
2. **France SAML IdP** (SAML 2.0 broker) - Week 3, demonstrates legacy systems
3. **Canada OIDC IdP** (OIDC broker) - Week 3, demonstrates modern federation
4. **Industry OIDC IdP** (OIDC broker with enrichment) - Week 3, demonstrates incomplete IdPs

**Authorization Working:**
- ✅ Clearance-based access control (UNCLASSIFIED → TOP_SECRET)
- ✅ Country releasability enforcement (USA, FRA, CAN, etc.)
- ✅ COI (Community of Interest) intersection logic
- ✅ Embargo date validation
- ✅ 78 OPA tests (53 comprehensive + 22 negative + 3 validation)

**Session Management:**
- ✅ Database session strategy with DrizzleAdapter
- ✅ Complete logout (Keycloak SSO + NextAuth + browser storage)
- ✅ events.signOut callback for database cleanup
- ✅ Frontchannel logout with iframe + postMessage
- ✅ OAuth token refresh functional

**Key Files to Reference:**
- `terraform/main.tf` - Keycloak IdP configurations (984 lines)
- `frontend/src/auth.ts` - NextAuth config with enrichment (453 lines)
- `backend/src/middleware/authz.middleware.ts` - PEP implementation (624 lines)
- `policies/fuel_inventory_abac_policy.rego` - ABAC policy (288 lines)
- `docs/PRODUCTION-READY-FEDERATION.md` - Architecture guide
- `docs/ADDING-NEW-IDP-GUIDE.md` - Template for adding IdPs

---

## WEEK 3.5 OBJECTIVE

**Primary Goal:** Integrate GEOAxIS ICAM Services as a REAL operational OIDC Identity Provider, replacing one of the mock IdPs with actual U.S. government PKI-authenticated federation.

**Why This Matters:**
- Demonstrates production interoperability with DoD identity infrastructure
- Validates DIVE V3 works with real PKI-authenticated IdP (not just mock realms)
- Shows actual attribute flow from authoritative DoD source (GEOAxIS)
- Proves architecture can support government-grade ICAM requirements

**Success Criteria:**
- ✅ U.S. users can authenticate via GEOAxIS OIDC (PKI-based)
- ✅ GEOAxIS attributes (clearance, EDIPI, country, roles) mapped to DIVE schema
- ✅ Authorization decisions based on real GEOAxIS attributes
- ✅ All 78+ OPA tests still passing
- ✅ GitHub CI/CD passing
- ✅ Logout working with GEOAxIS session termination

---

## GEOAXIS ENVIRONMENT DETAILS

### Portal Access & Configuration

**GEOAxIS Unclassified Test Portal:**
- URL: https://portal-tst.geoaxis.gs.mil/
- Access: ✅ You have credentials (PIV required)
- Environment: DIVE-V3 registered in portal
- Organization: DIVE-V3 project

**NPE (Non-Person Entity) Status:**
- NPE Created: ✅ Partial
- NPE Name: **"DIVE Fed Hub"**
- Certificate: ❌ Not yet issued (will request during implementation)
- Purpose: Machine-to-machine authentication for DIVE-V3 application

**Network Connectivity:**
- ✅ Can reach https://oauth.geoaxis.gs.mil (OAuth endpoints)
- ✅ Can reach https://oidc.geoaxis.gs.mil (OIDC discovery)
- ❌ No corporate firewall/VPN blocking
- ✅ DIVE-V3 accessible via dev.dive25.com (Cloudflare Zero Trust)

**OIDC Client Status:**
- Client Registered: ❌ Not yet
- Client ID: Will obtain during registration
- Client Secret: Will obtain during registration
- Redirect URIs: Need to configure (localhost:3000 + dev.dive25.com)

### GEOAxIS OIDC Endpoints (From Integration Guide Gx-0417 v5.2)

**Discovery Document:**
```
https://oidc.geoaxis.gs.mil/.well-known/openid-configuration
```

**Key Endpoints:**
- **Authorization:** `https://oauth.geoaxis.gs.mil/auth/oauth/v2/authorize`
- **Token:** `https://oauth.geoaxis.gs.mil/auth/oauth/v2/token`
- **UserInfo:** `https://oauth.geoaxis.gs.mil/openid/connect/v1/userinfo`
- **JWKS:** `https://oauth.geoaxis.gs.mil/openid/connect/jwks.json`
- **End Session:** `https://oauth.geoaxis.gs.mil/openid/connect/v1/endsession`
- **Token Revocation:** `https://oauth.geoaxis.gs.mil/auth/oauth/v2/revoke`

**Required Scopes:**
```
openid profile email uiasenterprise eiasenterprise
```

**Supported Flows:**
- Authorization Code Flow (recommended)
- PKCE (optional, enhanced security)
- Refresh Token (optional)

### GEOAxIS Attribute Schema (From Integration Guide)

**Standard OIDC Claims:**
- `sub` - Subject identifier (unique user ID)
- `email` - User email
- `name` - Full name
- `given_name` - First name
- `family_name` - Last name

**DoD-Specific Claims (via UserInfo endpoint):**
- `clearance` - Security clearance level (U, C, S, TS)
- `EDIPI` - DoD ID number (10-digit)
- `affiliation` - Organization/component
- `roles` - GEOAxIS roles (array)
- `country` - Country code (likely USA for GEOAxIS users)

**Mapping to DIVE Schema:**
```
GEOAxIS Claim          → DIVE Attribute
────────────────────────────────────────────
sub                    → uniqueID
email                  → (user profile)
clearance              → clearance (normalize U→UNCLASSIFIED, C→CONFIDENTIAL, S→SECRET, TS→TOP_SECRET)
EDIPI                  → (optional, can store in user attributes)
affiliation            → (optional, can map to COI or org field)
country OR "USA"       → countryOfAffiliation
roles                  → acpCOI (or separate geoaxisRoles field)
```

---

## DEPLOYMENT ARCHITECTURE

### Current (Week 1-3): Mock IdPs in Docker

```
┌─────────────────────────────┐
│  Local Docker Environment   │
│                              │
│  ┌────────────────────────┐ │
│  │ france-mock-idp        │ │
│  │ canada-mock-idp        │ │
│  │ industry-mock-idp      │ │
│  └────────┬───────────────┘ │
│           │                  │
│  ┌────────▼───────────────┐ │
│  │ dive-v3-pilot (broker) │ │
│  │ - Keycloak             │ │
│  └────────┬───────────────┘ │
│           │                  │
│  ┌────────▼───────────────┐ │
│  │ Next.js + NextAuth     │ │
│  │ Backend API + OPA      │ │
│  └────────────────────────┘ │
│                              │
│  localhost:3000              │
└─────────────────────────────┘
```

### Target (Week 3.5): GEOAxIS Integration

```
┌──────────────────────────────────────────────┐
│  GEOAxIS (Real DoD IdP)                      │
│  https://portal-tst.geoaxis.gs.mil           │
│                                               │
│  ┌────────────────────────────────────────┐  │
│  │ OIDC Authorization Server              │  │
│  │ - PKI-based authentication             │  │
│  │ - Authoritative attributes (clearance) │  │
│  └────────┬───────────────────────────────┘  │
└───────────┼──────────────────────────────────┘
            │ OIDC Protocol (HTTPS required)
            ▼
┌─────────────────────────────────────────────┐
│  DIVE-V3 Environment                        │
│  dev.dive25.com (Cloudflare) OR localhost   │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │ Keycloak dive-v3-pilot                 │ │
│  │ - HTTPS enabled (required for GEOAxIS) │ │
│  │ - GEOAxIS IdP broker configured        │ │
│  │ - NPE certificate installed (mTLS)     │ │
│  │ - Attribute mappers for GEOAxIS claims │ │
│  └────────┬───────────────────────────────┘ │
│           │                                  │
│  ┌────────▼───────────────────────────────┐ │
│  │ Next.js + NextAuth                     │ │
│  │ - Receives GEOAxIS tokens              │ │
│  │ - Extracts DoD attributes              │ │
│  └────────┬───────────────────────────────┘ │
│           │                                  │
│  ┌────────▼───────────────────────────────┐ │
│  │ Backend API (PEP) + OPA (PDP)          │ │
│  │ - Authorizes using GEOAxIS attributes  │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## PHASED IMPLEMENTATION PLAN

### DAY 1: GEOAxIS Portal Configuration & HTTPS Setup (6-8 hours)

**Morning: Portal Configuration (with your PIV access)**

**Task 1.1: Review/Update DIVE-V3 Registration**
```
Action Required (YOU via PIV login):
1. Login to https://portal-tst.geoaxis.gs.mil/
2. Navigate to your DIVE-V3 environment registration
3. Screenshot current configuration
4. Share with me for review

Configuration to verify/update:
- Environment Name: DIVE-V3
- Organization: DIVE-V3
- Contact information current?
- Services enabled: Identity Broker ✓, Authentication (OIDC) ✓
```

**Task 1.2: Complete/Verify NPE "DIVE Fed Hub"**
```
Action Required (YOU via PIV login):
1. Portal → Non-Person Entities
2. Find or complete "DIVE Fed Hub" NPE
3. Verify fields:
   - NPE Name: DIVE Fed Hub
   - Purpose: DIVE-V3 Pilot Application
   - Application Type: Web Application
   - Certificate Type: Client Authentication

If NPE incomplete:
4. Complete required fields
5. Submit for approval (if needed)
6. Screenshot NPE configuration
```

**Task 1.3: Request NPE PKI Certificate**
```
Action Required (YOU via PIV login):
1. Generate CSR (Certificate Signing Request):
   
   We'll create CSR locally:
   ```bash
   openssl req -new -newkey rsa:2048 -nodes \
     -keyout dive-fed-hub.key \
     -out dive-fed-hub.csr \
     -subj "/C=US/O=DIVE-V3/OU=DIVE Fed Hub/CN=dive-fed-hub"
   ```

2. Copy CSR content
3. Portal → NPE → DIVE Fed Hub → Request Certificate
4. Paste CSR
5. Submit certificate request
6. Note: Certificate issuance may take hours/days
   - If quick: Continue to Day 2
   - If delayed: Use client_secret authentication temporarily
```

**Afternoon: Local HTTPS Setup**

**Task 1.4: Enable HTTPS on Local Keycloak**
```
Current: Keycloak runs on http://localhost:8081
Required: GEOAxIS requires HTTPS for production OIDC

Option A - Self-Signed Certificate (for localhost testing):
```bash
# Generate self-signed cert for localhost
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout keycloak-localhost.key \
  -out keycloak-localhost.crt \
  -days 365 \
  -subj "/CN=localhost"

# Update docker-compose.yml for Keycloak:
# Add SSL cert volume mounts
# Configure Keycloak to use HTTPS on port 8443
```

Option B - Cloudflare Tunnel (for dev.dive25.com):
```bash
# If dev.dive25.com is already configured via Cloudflare:
# Cloudflare provides HTTPS termination
# Keycloak can remain HTTP internally
# Cloudflare tunnel forwards to localhost:8081

# Verify:
curl https://dev.dive25.com/realms/dive-v3-pilot/.well-known/openid-configuration
```

Recommendation: Use Option B (Cloudflare) for GEOAxIS integration
- Cloudflare provides valid HTTPS
- Easier than managing local certs
- Accessible from GEOAxIS (not just localhost)
```

**Task 1.5: Test GEOAxIS Endpoint Connectivity**
```bash
# Verify you can reach GEOAxIS from DIVE-V3 environment
curl -v https://oidc.geoaxis.gs.mil/.well-known/openid-configuration

# Should return JSON with endpoints
# If fails: Network/firewall issue to resolve

# Test OAuth authorize endpoint
curl -v https://oauth.geoaxis.gs.mil/auth/oauth/v2/authorize

# Should return 400 or redirect (not connection error)
```

**Deliverables Day 1:**
- [ ] NPE "DIVE Fed Hub" verified/completed in portal
- [ ] Certificate request submitted (pending issuance)
- [ ] HTTPS enabled (Cloudflare tunnel OR self-signed)
- [ ] GEOAxIS endpoints accessible from DIVE-V3
- [ ] Screenshots of portal configuration shared

---

### DAY 2: OIDC Client Registration in GEOAxIS (4-6 hours)

**Task 2.1: Prepare Redirect URIs**
```
GEOAxIS will ask for redirect URIs when registering OIDC client.

Based on dual deployment:
- Development: https://dev.dive25.com/api/auth/callback/keycloak
- Production: (future deployment URL)

For Week 3.5, use: https://dev.dive25.com/api/auth/callback/keycloak

Verify Cloudflare tunnel is routing to:
dev.dive25.com → localhost:3000 → Next.js

Test:
curl https://dev.dive25.com/
# Should return DIVE-V3 home page
```

**Task 2.2: Register OIDC Client in GEOAxIS Portal**
```
Action Required (YOU via PIV login):

Method A - Portal UI (Recommended):
1. Login to https://portal-tst.geoaxis.gs.mil/
2. Navigate to: Services → Authentication (OIDC) → Register Client
3. Fill in:
   - Client Name: DIVE-V3 Pilot
   - Application Type: Web Application
   - Redirect URIs: 
     * https://dev.dive25.com/api/auth/callback/keycloak
     (May also add localhost for dev: http://localhost:3000/api/auth/callback/keycloak)
   - Grant Types: authorization_code, refresh_token
   - Scopes: openid, profile, email, uiasenterprise, eiasenterprise
   - Token Endpoint Auth Method: client_secret_post (or client_secret_basic)

4. Submit registration
5. GEOAxIS will provide:
   - client_id (e.g., "dive-v3-pilot-abc123")
   - client_secret (store securely!)
6. Screenshot and share client_id (secret via secure channel)

Method B - Dynamic Registration API (if portal UI not available):
POST https://<gxisapi_VIP>/openid/connect/register
Content-Type: application/json

{
  "client_name": "DIVE-V3 Pilot",
  "redirect_uris": ["https://dev.dive25.com/api/auth/callback/keycloak"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scope": "openid profile email uiasenterprise eiasenterprise",
  "token_endpoint_auth_method": "client_secret_post"
}

# Returns: client_id and client_secret
```

**Task 2.3: Store GEOAxIS Credentials Securely**
```bash
# Add to frontend/.env.local (DO NOT commit to git):
GEOAXIS_CLIENT_ID=<client_id from portal>
GEOAXIS_CLIENT_SECRET=<client_secret from portal>

# Also add as GitHub secrets for CI/CD:
# Repository → Settings → Secrets → Actions
# Add:
# - GEOAXIS_CLIENT_ID
# - GEOAXIS_CLIENT_SECRET
```

**Deliverables Day 2:**
- [ ] OIDC client registered in GEOAxIS portal
- [ ] client_id and client_secret obtained
- [ ] Credentials stored in .env.local (excluded from git)
- [ ] Redirect URIs configured for dev.dive25.com

---

### DAY 3: Configure GEOAxIS IdP in Keycloak (4-6 hours)

**Task 3.1: Add GEOAxIS OIDC IdP to Terraform**

**File:** `terraform/main.tf`

**Add after existing IdPs:**
```hcl
# ============================================
# Week 3.5: GEOAxIS OIDC IdP (Real DoD IdP)
# ============================================
# Replaces mock U.S. IdP with real GEOAxIS PKI-authenticated federation
# Reference: GEOAxIS Integration Guide Gx-0417 v5.2

resource "keycloak_oidc_identity_provider" "geoaxis_idp" {
  realm        = keycloak_realm.dive_v3.id
  alias        = "geoaxis-idp"
  display_name = "GEOAxIS (U.S. DoD)"
  enabled      = true
  
  # GEOAxIS OIDC endpoints (Unclassified Test Environment)
  authorization_url = "https://oauth.geoaxis.gs.mil/auth/oauth/v2/authorize"
  token_url        = "https://oauth.geoaxis.gs.mil/auth/oauth/v2/token"
  user_info_url    = "https://oauth.geoaxis.gs.mil/openid/connect/v1/userinfo"
  jwks_url         = "https://oauth.geoaxis.gs.mil/openid/connect/jwks.json"
  logout_url       = "https://oauth.geoaxis.gs.mil/openid/connect/v1/endsession"
  
  # OIDC client credentials from portal registration
  client_id     = var.geoaxis_client_id
  client_secret = var.geoaxis_client_secret
  
  # Required scopes for GEOAxIS attributes
  # uiasenterprise = User Identity Attribute Service
  # eiasenterprise = Enterprise Identity Attribute Service
  default_scopes = "openid profile email uiasenterprise eiasenterprise"
  
  # GEOAxIS-specific settings
  validate_signature      = true  # Validate JWT signatures from GEOAxIS
  backchannel_supported  = false  # GEOAxIS uses frontchannel
  disable_user_info      = false  # MUST fetch UserInfo for DoD attributes
  
  store_token = true
  trust_email = true
  sync_mode   = "FORCE"  # Always sync attributes from GEOAxIS
  
  # Account linking
  link_only = false
  first_broker_login_flow_alias = "first broker login"
  
  # Additional settings
  authenticate_by_default = false
  gui_order              = "0"  # Show first in IdP list (primary U.S. IdP)
}

# Variables for GEOAxIS credentials
variable "geoaxis_client_id" {
  description = "GEOAxIS OIDC Client ID (from portal registration)"
  type        = string
  sensitive   = true
}

variable "geoaxis_client_secret" {
  description = "GEOAxIS OIDC Client Secret (from portal registration)"
  type        = string
  sensitive   = true
}
```

**Task 3.2: Add GEOAxIS Attribute Mappers**

**GEOAxIS → DIVE Schema Mapping:**
```hcl
# Mapper 1: sub → uniqueID
resource "keycloak_custom_identity_provider_mapper" "geoaxis_uniqueid_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.geoaxis_idp.alias
  name                     = "geoaxis-uniqueID-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "sub"  # GEOAxIS subject identifier
    "user.attribute" = "uniqueID"
  }
}

# Mapper 2: email → email (user property)
resource "keycloak_custom_identity_provider_mapper" "geoaxis_email_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.geoaxis_idp.alias
  name                     = "geoaxis-email-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "email"
    "user.attribute" = "email"
  }
}

# Mapper 3: clearance → clearance (with normalization)
# GEOAxIS may send: U, C, S, TS or UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP SECRET
# Need to normalize to DIVE enum: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET

# Option A: Direct mapping (if GEOAxIS uses full names)
resource "keycloak_custom_identity_provider_mapper" "geoaxis_clearance_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.geoaxis_idp.alias
  name                     = "geoaxis-clearance-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "clearance"
    "user.attribute" = "clearance"
  }
}

# Option B: JavaScript mapper for normalization (if GEOAxIS uses abbreviations)
# Will need to configure in Keycloak Admin Console:
# - Create JavaScript mapper
# - Transform: U → UNCLASSIFIED, C → CONFIDENTIAL, S → SECRET, TS → TOP_SECRET

# Mapper 4: country/affiliation → countryOfAffiliation
# GEOAxIS users are USA, but map explicitly
resource "keycloak_custom_identity_provider_mapper" "geoaxis_country_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.geoaxis_idp.alias
  name                     = "geoaxis-country-mapper"
  identity_provider_mapper = "hardcoded-attribute-idp-mapper"  # GEOAxIS users always USA
  
  extra_config = {
    "syncMode"        = "FORCE"
    "attribute"       = "countryOfAffiliation"
    "attribute.value" = "USA"
  }
}

# Mapper 5: EDIPI → edipi (optional, for reference)
resource "keycloak_custom_identity_provider_mapper" "geoaxis_edipi_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.geoaxis_idp.alias
  name                     = "geoaxis-edipi-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "EDIPI"
    "user.attribute" = "edipi"  # Store for reference, not used in authorization
  }
}

# Mapper 6: roles → acpCOI (map GEOAxIS roles to COI)
# This requires understanding what roles GEOAxIS sends
# May need to map specific roles to COI values
resource "keycloak_custom_identity_provider_mapper" "geoaxis_roles_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.geoaxis_idp.alias
  name                     = "geoaxis-roles-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "roles"  # Or "geoaxisRoles" - check UserInfo response
    "user.attribute" = "acpCOI"  # Map to COI or separate field
  }
}
```

**Task 3.3: Update Frontend IdP Selector**

**File:** `frontend/src/components/auth/idp-selector.tsx`

**Add GEOAxIS option:**
```typescript
const idpOptions = [
  {
    id: "geoaxis",
    name: "GEOAxIS (U.S. DoD)",
    subtitle: "DoD PKI Authentication",
    protocol: "OIDC • PKI",
    flag: "🇺🇸",
    hint: "geoaxis-idp",  // NEW - triggers GEOAxIS broker
  },
  {
    id: "us",
    name: "U.S. DoD (Mock)",  // Keep for comparison
    subtitle: "Test Users",
    protocol: "OIDC • Mock",
    flag: "🇺🇸",
    hint: undefined,  // Existing mock IdP
  },
  // ... France, Canada, Industry remain
];
```

**Task 3.4: Apply Terraform Configuration**
```bash
cd terraform

# Set GEOAxIS credentials (from Day 2 portal registration)
export TF_VAR_geoaxis_client_id="<client_id from portal>"
export TF_VAR_geoaxis_client_secret="<client_secret from portal>"

# Plan changes
terraform plan

# Review:
# - Should show new geoaxis_idp resource
# - Should show 6 new attribute mappers
# - Verify no unintended changes

# Apply
terraform apply

# Verify in Keycloak Admin Console:
open https://dev.dive25.com:8081/admin
# OR http://localhost:8081/admin

# Navigate to: dive-v3-pilot → Identity Providers
# Should see: geoaxis-idp configured
```

**Deliverables Day 2:**
- [ ] GEOAxIS OIDC client registered in portal
- [ ] client_id and client_secret obtained
- [ ] Keycloak GEOAxIS IdP configured in Terraform
- [ ] 6 attribute mappers configured
- [ ] Terraform applied successfully
- [ ] GEOAxIS IdP visible in Keycloak Admin Console

---

### DAY 3: Test GEOAxIS Authentication Flow (4-6 hours)

**Task 3.1: First GEOAxIS Login Test**
```
Test Environment: Use dev.dive25.com (HTTPS required by GEOAxIS)

1. Navigate to: https://dev.dive25.com
2. Click: "GEOAxIS (U.S. DoD)" button
3. Expected: Redirect to GEOAxIS OAuth authorize endpoint
4. GEOAxIS will prompt for PKI authentication:
   - Smart card / CAC insertion
   - PIN entry
   - Certificate selection

5. After PKI auth, GEOAxIS redirects back to Keycloak
6. Keycloak receives authorization code
7. Keycloak exchanges code for tokens (token endpoint)
8. Keycloak fetches UserInfo (attributes)
9. Keycloak creates/updates user in dive-v3-pilot
10. First broker login page may appear (fill in, submit)
11. NextAuth receives tokens from Keycloak
12. Redirected to dashboard

Dashboard should show:
- Name: (your real name from GEOAxIS)
- Email: (your DoD email)
- clearance: (your actual clearance - U, C, S, or TS)
- countryOfAffiliation: USA
- acpCOI: (mapped from GEOAxIS roles)
- edipi: (your EDIPI number)
```

**Task 3.2: Debug GEOAxIS Attribute Flow**
```
After successful login, check Session Details at bottom of dashboard.

Expected in session JSON:
{
  "user": {
    "uniqueID": "<your EDIPI or email>",
    "clearance": "SECRET",  // Or your actual clearance
    "countryOfAffiliation": "USA",
    "acpCOI": [...],  // From GEOAxIS roles
    "edipi": "1234567890"
  },
  "idToken": "eyJ...",  // Should be from dive-v3-pilot (not GEOAxIS directly)
  "accessToken": "eyJ..."
}

If attributes missing:
1. Check Keycloak Admin Console → Users → (your user)
2. Verify attributes tab has clearance, edipi, etc.
3. If attributes in Keycloak but not in session:
   - Check dive-v3-client protocol mappers
   - Verify they read from user attributes

If attributes not in Keycloak:
1. Check GEOAxIS → Keycloak broker mappers
2. Verify claim names match what GEOAxIS sends
3. May need to check GEOAxIS UserInfo response to see actual claim names
```

**Task 3.3: Test GEOAxIS UserInfo Response**
```bash
# After GEOAxIS login, get access token from session
# (From Session Details JSON, copy accessToken)

# Call GEOAxIS UserInfo to see what attributes are available:
curl -H "Authorization: Bearer <access_token>" \
  https://oauth.geoaxis.gs.mil/openid/connect/v1/userinfo

# Response will show actual claim names and values
# Use this to adjust Keycloak mappers if needed

# Common GEOAxIS claims (may vary):
# - sub: User ID
# - email: DoD email
# - name: Full name
# - clearance: U, C, S, TS (or full names)
# - EDIPI: 10-digit DoD ID
# - affiliation: Organization
# - roles: Array of roles
```

**Task 3.4: Clearance Normalization**
```
GEOAxIS likely sends clearance as:
- Single letter: U, C, S, TS
- OR full name: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP SECRET

DIVE expects: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET

If normalization needed:
1. Keycloak Admin Console → dive-v3-pilot → Identity Providers → geoaxis-idp
2. Mappers → Add Mapper
3. Type: Script Mapper (JavaScript)
4. Script:
```javascript
var clearanceValue = user.getAttribute('clearance');
if (clearanceValue == 'U') return 'UNCLASSIFIED';
if (clearanceValue == 'C') return 'CONFIDENTIAL';
if (clearanceValue == 'S') return 'SECRET';
if (clearanceValue == 'TS' || clearanceValue == 'TOP SECRET') return 'TOP_SECRET';
return clearanceValue;  // Pass through if already normalized
```
5. Target: clearance attribute
6. Save and test
```

**Deliverables Day 3:**
- [ ] Successful GEOAxIS PKI authentication
- [ ] User created in dive-v3-pilot from GEOAxIS
- [ ] Attributes mapped (clearance, EDIPI, country, roles)
- [ ] Dashboard displays real GEOAxIS attributes
- [ ] Clearance normalization working (if needed)

---

### DAY 4: Authorization with GEOAxIS Attributes & Testing (6-8 hours)

**Task 4.1: Verify OPA Policy Works with GEOAxIS Users**
```
Test that existing OPA policies work with real GEOAxIS attributes:

Scenario 1: GEOAxIS user with SECRET clearance
1. Login via GEOAxIS
2. Dashboard shows: SECRET clearance
3. Navigate to /resources
4. Click: doc-nato-ops-001 (SECRET, [USA])
5. Expected: ACCESS GRANTED ✅
   - User clearance (SECRET) >= Resource (SECRET)
   - User country (USA) in releasabilityTo [USA, ...]

Scenario 2: GEOAxIS user tries TOP_SECRET resource
1. Same user (SECRET clearance)
2. Click: doc-fvey-intel (TOP_SECRET)
3. Expected: ACCESS DENIED ✅
   - Reason: "Insufficient clearance: SECRET < TOP_SECRET"

Scenario 3: Test COI intersection
1. If your GEOAxIS roles map to acpCOI
2. Access resource with matching COI
3. Expected: Allowed if COI matches

These tests verify:
✅ OPA policy is protocol-agnostic (works with GEOAxIS OIDC)
✅ Real DoD attributes enforce correct access control
✅ Clearance levels properly enforced
```

**Task 4.2: Test Logout with GEOAxIS**
```
Verify complete logout including GEOAxIS session:

1. Logged in as GEOAxIS user
2. Click "Sign Out"
3. Should redirect to GEOAxIS endsession endpoint
4. GEOAxIS terminates PKI session
5. Redirect back to DIVE-V3 home
6. All cookies cleared (GEOAxIS + Keycloak + NextAuth)
7. Next login requires PKI re-authentication

Check:
- GEOAxIS logout URL in secure-logout-button.tsx
- May need to add special handling for GEOAxIS logout_url
```

**Task 4.3: Run Full OPA Test Suite**
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Verify all OPA tests still pass with GEOAxIS IdP added
docker-compose exec opa opa test /policies/ -v

# Should show: PASS: 78/78
# All existing tests should pass (protocol-agnostic)
```

**Task 4.4: Run Integration Tests**
```bash
cd backend
npm test

# Should show: 33 tests passing (22 federation + 11 session)
# Federation tests verify extensibility (can add GEOAxIS as new IdP)
```

**Task 4.5: Update Documentation**
```
Update docs/ADDING-NEW-IDP-GUIDE.md with GEOAxIS example:

Section: "Real-World Example - Adding GEOAxIS OIDC IdP"
- Show actual Terraform configuration
- Document attribute mapping decisions
- Note clearance normalization approach
- Include troubleshooting tips
```

**Deliverables Day 4:**
- [ ] Authorization working with GEOAxIS attributes
- [ ] Resource access decisions correct
- [ ] OPA tests: 78/78 passing
- [ ] Integration tests: 33/33 passing
- [ ] Logout including GEOAxIS session termination
- [ ] Documentation updated with GEOAxIS example

---

### DAY 5: NPE Certificate Installation & Production Readiness (4-6 hours)

**Task 5.1: Install NPE Certificate (if issued)**
```
If GEOAxIS has issued NPE certificate:

1. Download certificate from portal (.p12 or .pem format)
2. Convert to format needed for mTLS:
   ```bash
   # If .p12 format:
   openssl pkcs12 -in dive-fed-hub.p12 -out dive-fed-hub.pem -nodes
   
   # Extract key and cert separately:
   openssl pkcs12 -in dive-fed-hub.p12 -nocerts -out dive-fed-hub.key -nodes
   openssl pkcs12 -in dive-fed-hub.p12 -clcerts -nokeys -out dive-fed-hub.crt
   ```

3. Configure Keycloak to use certificate for mTLS:
   - May need to update Keycloak OIDC client configuration
   - Add certificate to token endpoint auth

4. Test token endpoint with mTLS:
   ```bash
   curl -v --cert dive-fed-hub.crt --key dive-fed-hub.key \
     https://oauth.geoaxis.gs.mil/auth/oauth/v2/token
   ```

If certificate not yet issued:
- Document the process for future
- Continue with client_secret authentication
- Note: NPE cert provides enhanced security but client_secret sufficient for pilot
```

**Task 5.2: Implement Token Refresh for GEOAxIS**
```
GEOAxIS tokens may have short lifetime (15-60 minutes).

Verify refresh token handling:
1. Login via GEOAxIS
2. Wait for token to expire
3. Verify automatic refresh works (NextAuth already has this)
4. Check backend logs for refresh attempts

If refresh fails:
- Check GEOAxIS client has refresh_token grant type
- Verify Keycloak storing refresh_token
- Update auth.ts refreshAccessToken() if needed for GEOAxIS specifics
```

**Task 5.3: End-to-End Testing**
```
Complete test matrix with GEOAxIS as primary U.S. IdP:

Test 1: GEOAxIS User Authentication
- PKI login works
- Attributes mapped correctly
- Dashboard displays real clearance/EDIPI

Test 2: Authorization Decisions
- Access allowed based on clearance
- Access denied for insufficient clearance
- Country releasability enforced (USA user)

Test 3: Multi-IdP Scenarios
- GEOAxIS user (USA, real clearance)
- France SAML user (FRA, mock)
- Canada OIDC user (CAN, mock)
- Cross-national resource access tested

Test 4: Logout
- GEOAxIS session terminated
- All cookies cleared
- Re-login requires PKI

Test 5: Token Refresh
- Wait for token expiration
- Verify automatic refresh
- Session remains valid
```

**Task 5.4: Update CI/CD for GEOAxIS**
```
GitHub Actions can't access real GEOAxIS (requires PKI).

Update .github/workflows/ci.yml:
- Keep existing tests (mock IdPs)
- Add note about GEOAxIS testing requiring manual validation
- Document GEOAxIS integration in README

Or set up separate staging/production CI:
- Staging: Mock IdPs (automated)
- Production: Real GEOAxIS (manual verification)
```

**Deliverables Day 5:**
- [ ] NPE certificate installed (if available)
- [ ] Token refresh tested
- [ ] Complete E2E test matrix passed
- [ ] CI/CD updated/documented
- [ ] Week 3.5 deliverable complete

---

## INTEGRATION CHECKLIST

### Prerequisites (Before Starting):
- [x] Week 1-3 complete (all mock IdPs working)
- [x] GitHub CI/CD passing (111 tests)
- [ ] GEOAxIS portal PIV access confirmed
- [ ] NPE "DIVE Fed Hub" exists (partial)
- [ ] Network access to GEOAxIS endpoints verified
- [ ] Cloudflare tunnel configured (dev.dive25.com)

### Day-by-Day Milestones:
- [ ] **Day 1:** Portal config verified, NPE complete, HTTPS enabled
- [ ] **Day 2:** OIDC client registered, credentials obtained
- [ ] **Day 3:** GEOAxIS IdP in Keycloak, attribute mappers configured
- [ ] **Day 4:** Authorization tested, OPA tests passing
- [ ] **Day 5:** E2E testing complete, production-ready

### Testing & Validation:
- [ ] GEOAxIS PKI authentication successful
- [ ] Real DoD attributes flow to DIVE-V3
- [ ] Clearance-based authorization working
- [ ] Logout terminates GEOAxIS session
- [ ] All 78+ OPA tests passing
- [ ] Integration tests passing
- [ ] Manual test matrix complete

### Documentation:
- [ ] GEOAxIS configuration documented
- [ ] Attribute mapping decisions recorded
- [ ] Troubleshooting guide updated
- [ ] Production deployment notes

---

## KNOWN CHALLENGES & MITIGATIONS

### Challenge 1: PKI Authentication Requirement

**Issue:** GEOAxIS requires PKI (CAC/PIV) for authentication  
**Impact:** Can't automate testing like mock IdPs  
**Mitigation:**
- Manual testing with your PKI credentials
- Keep mock IdPs for automated CI/CD
- Document GEOAxIS as production IdP requiring manual validation

### Challenge 2: NPE Certificate Issuance Time

**Issue:** Certificate may take hours/days to issue  
**Impact:** May delay mTLS configuration  
**Mitigation:**
- Use client_secret auth initially (supported by GEOAxIS)
- NPE cert is enhancement, not blocker
- Document cert installation procedure for when available

### Challenge 3: Attribute Claim Names

**Issue:** Don't know exact GEOAxIS claim names until UserInfo call  
**Impact:** May need to adjust mappers after first login  
**Mitigation:**
- Test with real login, inspect UserInfo response
- Adjust Keycloak mappers based on actual claims
- Use flexible mapping (check multiple claim names)

### Challenge 4: Cloudflare Tunnel Configuration

**Issue:** dev.dive25.com needs to route to localhost:3000 AND localhost:8081  
**Impact:** Both Next.js and Keycloak need external access  
**Mitigation:**
- Configure Cloudflare tunnel with multiple routes:
  - dev.dive25.com → localhost:3000 (Next.js)
  - dev.dive25.com:8081 → localhost:8081 (Keycloak)
- OR use subdomains:
  - dev.dive25.com → Next.js
  - keycloak.dive25.com → Keycloak

### Challenge 5: Localhost vs. Production URLs

**Issue:** Development (localhost) vs. GEOAxIS (HTTPS required)  
**Impact:** Need separate configs for dev/prod  
**Mitigation:**
- Use environment variables for URLs
- Terraform variables for different deployments
- Test on dev.dive25.com (HTTPS) for GEOAxIS integration

---

## REFERENCE MATERIALS

### GEOAxIS Documentation (You Should Have):
1. **Gx-0417 v5.2** - Identity Broker Integration Guide
2. **Gx-0475 v2.1** - Connectivity Guide
3. **Portal Documentation** - OIDC client registration procedures

### DIVE-V3 Documentation (In Repository):
1. `docs/PRODUCTION-READY-FEDERATION.md` - Multi-IdP architecture
2. `docs/ADDING-NEW-IDP-GUIDE.md` - Step-by-step IdP addition
3. `terraform/main.tf` - Reference IdP configurations (France SAML, Canada OIDC, Industry OIDC)
4. `WEEK3-DELIVERY-COMPLETE.md` - Week 3 status and achievements

### Technical References:
1. **Keycloak Documentation:** Identity Brokering with OIDC
2. **NextAuth.js v5 Docs:** OIDC provider configuration
3. **GEOAxIS Portal:** https://portal-tst.geoaxis.gs.mil/

---

## SUCCESS CRITERIA FOR WEEK 3.5

### Functional Requirements:
- [ ] Real GEOAxIS users can authenticate via PKI
- [ ] GEOAxIS attributes (clearance, EDIPI, country, roles) mapped to DIVE
- [ ] Authorization decisions based on real DoD clearances
- [ ] Logout terminates GEOAxIS PKI session
- [ ] All existing functionality (mock IdPs) still works

### Technical Requirements:
- [ ] HTTPS enabled for Keycloak (production requirement)
- [ ] GEOAxIS OIDC client registered and configured
- [ ] Attribute mappers handle GEOAxIS claim schema
- [ ] OPA tests: 78/78 still passing
- [ ] Integration tests: 33/33 passing
- [ ] TypeScript: 0 errors

### Documentation:
- [ ] GEOAxIS integration documented
- [ ] Attribute mapping decisions recorded
- [ ] NPE certificate procedure documented
- [ ] Production deployment guide updated

### Production Readiness:
- [ ] Can switch between mock IdPs (testing) and GEOAxIS (production)
- [ ] Clear migration path to GEOAxIS production environment
- [ ] Monitoring and error handling for GEOAxIS integration
- [ ] Fallback if GEOAxIS unavailable

---

## WEEK 3.5 DELIVERABLES

**Code:**
- GEOAxIS OIDC IdP configuration in Terraform
- Attribute mappers for GEOAxIS claims
- Frontend UI updated with GEOAxIS option
- Clearance normalization (if needed)
- Environment variables for GEOAxIS credentials

**Tests:**
- All 78 OPA tests passing (with GEOAxIS)
- All 33 integration tests passing
- Manual test matrix with real GEOAxIS user
- Cross-IdP authorization scenarios

**Documentation:**
- GEOAxIS integration guide
- NPE certificate installation procedure
- Attribute mapping reference
- Production deployment checklist
- Troubleshooting guide

**Commit:**
- GitHub commit with GEOAxIS integration
- CI/CD passing (mock IdPs automated, GEOAxIS manual)
- Production-ready code

---

## QUESTIONS FOR YOU (NEED ANSWERS BEFORE STARTING)

### Critical (Must Answer):

**1. Cloudflare Tunnel Configuration:**
How is dev.dive25.com currently configured?
- Does it route to localhost:3000 only?
- Can we add route for localhost:8081 (Keycloak)?
- OR should we use subdomain (keycloak.dive25.com)?

**2. GEOAxIS Client Registration:**
Do you want to:
- A) Register via portal UI (requires PIV, we collaborate via screenshots)
- B) Use dynamic registration API (I can script it, you execute)
- C) Have IT/admin register for you

**3. Redirect URI for Registration:**
What should we use?
- https://dev.dive25.com/api/auth/callback/keycloak (primary)
- Should we also add localhost for development?

**4. Testing Timeline:**
- Can you test GEOAxIS login immediately (have PIV available)?
- Or should I prepare everything, then you test when ready?

### Nice to Have (Answer If Known):

**5. GEOAxIS Attribute Details:**
From your GEOAxIS access, do you know:
- What clearance level you have? (U, C, S, TS)
- Your EDIPI number? (for testing)
- What roles you have in GEOAxIS?

**6. NPE Certificate:**
How quickly can you get NPE certificate?
- Hours? Days? Weeks?
- Should we wait for it or proceed with client_secret?

**7. Existing Test Users:**
Keep existing mock IdPs for:
- Automated CI/CD testing
- Multi-national scenarios (France, Canada)
- Enrichment testing (Industry)

OR replace some with GEOAxIS only?

---

## RECOMMENDED APPROACH

Based on your answers, I recommend:

**Phase 1 (Days 1-2): Portal & OIDC Setup**
- YOU: Complete NPE in portal, register OIDC client (PIV required)
- SHARE: Screenshots of portal configs, client_id/secret
- ME: Configure Terraform, prepare Keycloak IdP

**Phase 2 (Day 3): First Integration**
- ME: Apply Terraform, update frontend
- YOU: Test GEOAxIS login (PKI auth)
- TOGETHER: Debug attribute mapping based on real UserInfo response

**Phase 3 (Days 4-5): Testing & Hardening**
- YOU: Test authorization scenarios with your clearance
- ME: Update OPA tests, verify CI/CD
- TOGETHER: Document integration, prepare for Week 4

**Fallback Plan:**
- If GEOAxIS access delayed: Document detailed integration plan as Week 3.5 deliverable
- If PKI testing limited: Create thorough test plan for future validation
- Keep mock IdPs fully functional for automated testing

---

## 🚀 NEXT STEPS

**Please answer the 7 questions above, then I'll create:**

1. **Detailed Week 3.5 Implementation Prompt** (for new chat)
   - Full context from Week 1-3
   - Your specific GEOAxIS environment details
   - Step-by-step with actual commands
   - Screenshot-based collaboration workflow
   - Testing procedures
   - CI/CD integration

2. **GEOAxIS Configuration Checklist** (for portal work)
   - Exact settings to configure
   - Screenshots to capture
   - Credentials to obtain

3. **Terraform Templates** (ready to customize)
   - GEOAxIS IdP configuration
   - Attribute mappers
   - Variables for credentials

**Once you answer the questions, I'll generate the complete Week 3.5 prompt!** 🚀
