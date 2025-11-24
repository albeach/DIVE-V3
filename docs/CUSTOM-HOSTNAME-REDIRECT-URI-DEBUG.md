# Custom Hostname - Redirect URI Issue: Root Cause Analysis

## Problem Report

**Symptoms**:
1. User accesses frontend via custom hostname (e.g., `https://kas.js.usa.divedeeper.internal:3000`) ✅
2. User clicks on an IdP to log in ❌
3. Browser is redirected to `localhost:8443/realms/...` instead of custom hostname ❌
4. Keycloak shows "Invalid redirect URI" error ❌
5. Keycloak Admin Console shows redirect URIs do NOT include custom hostname ❌

## Executive Summary: Root Causes Found

**PRIMARY ROOT CAUSE**: Terraform's `keycloak_url` variable is hardcoded to `https://localhost:8443` in the deployment script, which propagates to ALL realm URLs, IdP broker configurations, and redirect URIs.

**SECONDARY ISSUES**:
1. Terraform variables need two separate concepts: `keycloak_admin_url` (for Terraform provider) vs `keycloak_public_url` (for client redirects)
2. National realm client redirect URIs point to broker realm using `var.keycloak_url`
3. IdP broker authorization/token endpoints use `local.realm_urls.*` which derives from `var.keycloak_url`
4. Frontend NextAuth gets correct URLs via docker-compose, but Keycloak's database has wrong URLs

## Detailed Investigation

### Issue #1: Terraform Variable Confusion

**File**: `scripts/deploy-ubuntu.sh` (lines 807-812)

```bash
terraform apply -auto-approve \
  -var="keycloak_admin_username=admin" \
  -var="keycloak_admin_password=admin" \
  -var="keycloak_url=https://localhost:8443" \      # ❌ PROBLEM!
  -var="app_url=https://${CUSTOM_HOSTNAME}:3000" \
  -var="backend_url=https://${CUSTOM_HOSTNAME}:4000"
```

**Analysis**:
- `keycloak_url` is passed as `localhost:8443` even when custom hostname is configured
- Comment says: "keycloak_url MUST always be localhost:8443 because Terraform runs on the HOST machine"
- This is TRUE for the Terraform **provider** connection
- But WRONG for the Keycloak **client redirect URIs**!

**Consequence**:
- All realm URLs become `https://localhost:8443/realms/...`
- All IdP broker endpoints become `https://localhost:8443/realms/.../protocol/openid-connect/auth`
- All redirect URIs in national realm clients become `https://localhost:8443/realms/dive-v3-broker/broker/.../endpoint`

### Issue #2: Terraform Locals Propagate Wrong URL

**File**: `terraform/main.tf` (lines 29-44)

```terraform
locals {
  keycloak_base = var.keycloak_url  # ❌ Gets localhost:8443
  
  realm_urls = {
    usa      = "${local.keycloak_base}/realms/dive-v3-usa"      # localhost
    fra      = "${local.keycloak_base}/realms/dive-v3-fra"      # localhost
    can      = "${local.keycloak_base}/realms/dive-v3-can"      # localhost
    gbr      = "${local.keycloak_base}/realms/dive-v3-gbr"      # localhost
    deu      = "${local.keycloak_base}/realms/dive-v3-deu"      # localhost
    esp      = "${local.keycloak_base}/realms/dive-v3-esp"      # localhost
    ita      = "${local.keycloak_base}/realms/dive-v3-ita"      # localhost
    nld      = "${local.keycloak_base}/realms/dive-v3-nld"      # localhost
    pol      = "${local.keycloak_base}/realms/dive-v3-pol"      # localhost
    industry = "${local.keycloak_base}/realms/dive-v3-industry" # localhost
    broker   = "${local.keycloak_base}/realms/dive-v3-broker"   # localhost
  }
}
```

**Consequence**:
- Every IdP broker's `authorization_url`, `token_url`, `jwks_url`, `logout_url` uses localhost
- When user clicks IdP, they're redirected to localhost, not custom hostname

### Issue #3: National Realm Client Redirect URIs

**File**: `terraform/usa-realm.tf` (lines 108-110)

```terraform
valid_redirect_uris = [
  "${var.keycloak_url}/realms/dive-v3-broker/broker/usa-realm-broker/endpoint"
]
```

**Analysis**:
- National realm clients (usa, fra, can, etc.) redirect back to broker realm
- They use `${var.keycloak_url}` directly
- This becomes `https://localhost:8443/realms/dive-v3-broker/...`

**Same pattern in**:
- `fra-realm.tf` (line 101)
- `can-realm.tf` (line 76)
- `gbr-realm.tf` (line 109)
- `deu-realm.tf` (line 109)
- `esp-realm.tf` (line 109)
- `ita-realm.tf` (line 109)
- `nld-realm.tf` (line 109)
- `pol-realm.tf` (line 109)
- `industry-realm.tf` (line 108)

### Issue #4: IdP Broker Endpoint URLs

**File**: `terraform/usa-broker.tf` (lines 17-20)

```terraform
authorization_url = "${local.realm_urls.usa}${local.oidc_auth_path}"
token_url         = "${local.realm_urls.usa}${local.oidc_token_path}"
jwks_url          = "${local.realm_urls.usa}${local.oidc_certs_path}"
user_info_url     = "${local.realm_urls.usa}${local.oidc_userinfo_path}"
```

**Analysis**:
- IdP brokers use `local.realm_urls.usa` which comes from `local.keycloak_base`
- Which comes from `var.keycloak_url`
- Which is localhost!

**Same pattern in**:
- `fra-broker.tf`
- `can-broker.tf`
- `gbr-broker.tf`
- `deu-broker.tf`
- `esp-broker.tf`
- `ita-broker.tf`
- `nld-broker.tf`
- `pol-broker.tf`
- `industry-broker.tf`

### Issue #5: Frontend Environment Variables (Actually CORRECT)

**File**: `scripts/deploy-ubuntu.sh` (lines 449-457)

```yaml
nextjs:
  environment:
    NEXT_PUBLIC_API_URL: https://${CUSTOM_HOSTNAME}:4000
    NEXT_PUBLIC_BACKEND_URL: https://${CUSTOM_HOSTNAME}:4000
    NEXT_PUBLIC_BASE_URL: https://${CUSTOM_HOSTNAME}:3000
    NEXT_PUBLIC_KEYCLOAK_URL: https://${CUSTOM_HOSTNAME}:8443  # ✅ CORRECT
    AUTH_URL: https://${CUSTOM_HOSTNAME}:3000
    NEXTAUTH_URL: https://${CUSTOM_HOSTNAME}:3000
    KEYCLOAK_BASE_URL: https://${CUSTOM_HOSTNAME}:8443          # ✅ CORRECT
    KEYCLOAK_URL: https://${CUSTOM_HOSTNAME}:8443               # ✅ CORRECT
```

**Analysis**:
- Frontend environment variables are SET CORRECTLY
- NextAuth `issuer` and `authorization` URLs will use custom hostname
- **BUT** Keycloak's database already has localhost URLs from Terraform!

### Issue #6: The Mismatch

**What happens**:

1. User clicks IdP on landing page
2. Frontend calls NextAuth `signIn('keycloak', {}, { kc_idp_hint: 'usa-realm-broker' })`
3. NextAuth builds authorization URL: `https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker/protocol/openid-connect/auth?kc_idp_hint=usa-realm-broker`
4. User is redirected to Keycloak broker realm
5. Keycloak sees `kc_idp_hint=usa-realm-broker` and automatically redirects to USA realm
6. **BUT** the IdP broker configuration in Keycloak has `authorization_url = https://localhost:8443/realms/dive-v3-usa/...`
7. Browser tries to go to localhost → DNS fails or shows different Keycloak instance

**OR**:

1. User successfully authenticates in USA realm
2. USA realm tries to redirect back to broker realm
3. Redirect URI is `https://localhost:8443/realms/dive-v3-broker/broker/usa-realm-broker/endpoint`
4. Keycloak broker checks if this is a valid redirect URI
5. The valid_redirect_uris in Keycloak's database has localhost
6. **BUT** the actual redirect came from custom hostname → MISMATCH → "Invalid redirect URI"

## The Architectural Confusion

### What `keycloak_url` Variable Was Intended For

**Original Intent**: Terraform provider needs to connect to Keycloak Admin API

```terraform
provider "keycloak" {
  url = var.keycloak_url  # How Terraform connects to Keycloak
}
```

**Correct Usage**: `https://localhost:8443` because Terraform runs on HOST, Keycloak port-forwards to localhost

### What `keycloak_url` Is ACTUALLY Used For

**Reality**: It's used for EVERYTHING:
- ✅ Terraform provider connection (correct)
- ❌ IdP broker authorization/token URLs (should be custom hostname)
- ❌ National realm client redirect URIs (should be custom hostname)
- ❌ Logout URLs (should be custom hostname)
- ❌ Token/JWKS endpoints (should be custom hostname)

## The Solution Required

We need **TWO separate variables**:

### 1. `keycloak_admin_url` (Terraform Provider Connection)
- **Purpose**: How Terraform connects to Keycloak Admin API
- **Value**: Always `https://localhost:8443`
- **Reason**: Terraform runs on host machine with port-forwarding
- **Used for**: `provider "keycloak"` block only

### 2. `keycloak_public_url` (Client-Facing URLs)
- **Purpose**: How browsers and clients access Keycloak
- **Value**: `https://${CUSTOM_HOSTNAME}:8443` when custom hostname configured
- **Reason**: Browsers must resolve the hostname via DNS
- **Used for**:
  - IdP broker authorization/token/logout URLs
  - National realm client redirect URIs
  - All client-facing endpoints

## Affected Configuration Count

**29 hard-coded references found** across:
- 1× `variables.tf` (default value)
- 1× `main.tf` (locals block)
- 6× `main.tf.legacy-all-resources.disabled`
- 5× `main.tf.disabled-legacy`
- 3× `idp-brokers/fra-broker.tf`
- 3× `idp-brokers/industry-broker.tf`
- 3× `idp-brokers/can-broker.tf`
- 3× `idp-brokers/usa-broker.tf`
- 1× `realms/industry-realm.tf`
- 1× `realms/usa-realm.tf`
- 1× `realms/can-realm.tf`
- 1× `realms/fra-realm.tf`

## Impact Map

```
var.keycloak_url (localhost)
    ↓
local.keycloak_base (localhost)
    ↓
local.realm_urls.* (all localhost)
    ↓
┌───────────────────────────────────┬──────────────────────────────────┐
│ IdP Broker Configs                │ National Realm Clients           │
│ - authorization_url               │ - valid_redirect_uris            │
│ - token_url                       │ - root_url                       │
│ - jwks_url                        │ - base_url                       │
│ - user_info_url                   │                                  │
│ - logout_url                      │                                  │
└───────────────────────────────────┴──────────────────────────────────┘
                          ↓
          ALL use localhost:8443 instead of custom hostname
                          ↓
          Browser cannot resolve → ERR_NAME_NOT_RESOLVED
                    OR
          Redirect URI mismatch → Invalid redirect URI
```

## Why This Wasn't Caught Earlier

1. **Default deployment uses localhost**: Most testing done with `localhost`, which works
2. **Docker networking hides issue**: Inside Docker, `keycloak:8080` works, but browsers use external URLs
3. **Environment variables look correct**: Frontend env vars ARE correct, but Keycloak database is wrong
4. **Comment was misleading**: "keycloak_url MUST always be localhost" was only true for provider, not clients

## Verification Commands

### Check Keycloak Database for Actual Redirect URIs

```bash
# Connect to Keycloak database
docker compose exec -T postgres psql -U postgres keycloak_db

# Check broker realm client redirect URIs
SELECT client_id, redirect_uri 
FROM client JOIN redirect_uris ON client.id = redirect_uris.client_id 
WHERE client.realm_id = (SELECT id FROM realm WHERE name = 'dive-v3-broker');

# Check USA realm client redirect URIs  
SELECT client_id, redirect_uri
FROM client JOIN redirect_uris ON client.id = redirect_uris.client_id
WHERE client.realm_id = (SELECT id FROM realm WHERE name = 'dive-v3-usa');
```

### Check IdP Broker Configuration

```bash
# Check USA realm broker authorization URL
docker compose exec -T postgres psql -U postgres keycloak_db -c \
  "SELECT alias, authorization_url FROM identity_provider WHERE alias = 'usa-realm-broker';"
```

### Expected vs Actual

**Expected (with custom hostname)**:
```
authorization_url: https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-usa/protocol/openid-connect/auth
redirect_uri: https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker/broker/usa-realm-broker/endpoint
```

**Actual (current state)**:
```
authorization_url: https://localhost:8443/realms/dive-v3-usa/protocol/openid-connect/auth
redirect_uri: https://localhost:8443/realms/dive-v3-broker/broker/usa-realm-broker/endpoint
```

## Conclusion

The root cause is a **design flaw in the Terraform variable structure**. The `keycloak_url` variable conflates two distinct purposes:

1. **Admin API connection** (should always be localhost for Terraform)
2. **Client-facing URLs** (should be custom hostname when configured)

This single variable cannot serve both purposes correctly. The fix requires:

1. ✅ Split `keycloak_url` into `keycloak_admin_url` and `keycloak_public_url`
2. ✅ Update `deploy-ubuntu.sh` to pass custom hostname as `keycloak_public_url`
3. ✅ Update `main.tf` locals to use `keycloak_public_url` for `realm_urls`
4. ✅ Update provider to use `keycloak_admin_url` (always localhost)
5. ✅ Reapply Terraform to update Keycloak database
6. ✅ Restart services to pick up new configuration

**This is NOT a DNS issue, NOT an environment variable issue, NOT a frontend issue. This is a Terraform configuration architecture issue.**


