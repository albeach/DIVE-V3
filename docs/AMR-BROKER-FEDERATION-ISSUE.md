# AMR Claims Issue in Federated Architecture

## Problem Summary

AMR (Authentication Methods Reference) claims are not appearing in tokens when users authenticate through IdP federation (broker realm), resulting in:
- Frontend showing `amr = N/A`
- Backend rejecting requests: "Invalid or expired JWT token, classification unknown"
- Users unable to access classified resources

## Root Cause Analysis

### Understanding Session Notes vs. Claims vs. User Attributes

**Session notes** are set during an authentication flow WITHIN a realm and exist only in that realm's user session. They do NOT automatically propagate through IdP federation.

**Claims** are values in JWT tokens (ID tokens, access tokens).

**User attributes** are persistent properties stored on the user object.

### The Current Flow (BROKEN)

1. **National Realm** (e.g., `dive-v3-fra`):
   - User authenticates → authentication flow sets session notes:
     - `AUTH_METHODS_REF` = `["pwd","otp"]`
     - `AUTH_CONTEXT_CLASS_REF` = `"1"`
   - Protocol mapper reads session notes → includes in ID token as claims:
     - `amr`: `["pwd","otp"]`
     - `acr`: `"1"`
   
2. **Broker Realm** (dive-v3-broker):
   - Receives ID token with `amr` and `acr` as **CLAIMS**
   - IdP mapper (`oidc-user-attribute-idp-mapper`) maps claims → **user attributes**:
     - `amr` claim → `amr` user attribute
     - `acr` claim → `acr` user attribute
   - **PROBLEM**: Protocol mapper (`oidc-usersessionmodel-note-mapper`) tries to read from **session notes** (`AUTH_METHODS_REF`), but these session notes DON'T EXIST in broker realm session!
   - Result: `amr` claim in final token is empty/missing

### Why Session Notes Don't Exist in Broker Realm

When a user logs in through an IdP broker:
- The authentication happens in the NATIONAL realm
- The broker realm doesn't re-run the authentication flow
- The broker realm creates a NEW session, but this session doesn't have the session notes from the national realm
- Session notes are realm-specific and don't transfer through OIDC federation

## The Fix

We need to support BOTH direct logins AND federated logins in the broker realm:

### Option 1: Dual Protocol Mappers (RECOMMENDED)

Add protocol mappers that can read from BOTH sources:

1. **Keep existing session note mapper** (for direct broker realm logins - like super_admin)
2. **Add user attribute mappers** (for federated logins via IdP brokers)

This way:
- Direct logins: Session notes → protocol mapper → token claims  
- Federated logins: IdP claims → user attributes → protocol mapper → token claims

### Option 2: Post-Broker Flow with Session Note Setting

Create a post-broker authentication flow that:
1. Reads `amr`/`acr` from user attributes
2. Sets them as session notes
3. Existing session note mappers work

This is more complex and requires custom authenticators.

### Option 3: Hybrid Mapper (Custom SPI - NOT RECOMMENDED)

Create a custom protocol mapper that tries session notes first, falls back to user attributes. This requires custom Java code.

## Recommended Solution: Dual Protocol Mappers

### Terraform Changes Needed

For the broker realm client (`dive_v3_app_broker`), add:

```hcl
# EXISTING: Session note mapper (for direct logins)
resource "keycloak_generic_protocol_mapper" "broker_amr" {
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "amr-from-session"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "AUTH_METHODS_REF"
    "claim.name"           = "amr"
    "jsonType.label"       = "JSON"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

# NEW: User attribute mapper (for federated logins)
resource "keycloak_generic_protocol_mapper" "broker_amr_attribute" {
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "amr-from-attribute"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "amr"
    "claim.name"           = "amr"
    "jsonType.label"       = "JSON"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
    "aggregate.attrs"      = "false"
  }
}

# Similar for ACR...
```

### Mapper Priority

Keycloak applies mappers in order. If both mappers add the same claim:
- The LAST mapper in the list wins
- Order: Session note mapper should come AFTER attribute mapper
- This way: If session note exists (direct login), it overwrites. If not, attribute value is used.

## Testing Strategy

1. **Direct Login Test** (super_admin to broker realm):
   ```bash
   # Should get AMR from session notes
   curl -X POST https://keycloak.dive-v3.mil/realms/dive-v3-broker/protocol/openid-connect/token \
     -d "client_id=dive-v3-app" \
     -d "grant_type=password" \
     -d "username=super_admin" \
     -d "password=..." | jq -r '.id_token' | jwt decode -
   ```
   Expected: `amr` claim present

2. **Federated Login Test** (testuser-fr through fra-realm-broker):
   ```bash
   # Should get AMR from user attributes (mapped from IdP)
   # Login through UI, capture token, decode
   ```
   Expected: `amr` claim present

3. **Backend API Test**:
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     https://api.dive-v3.mil/api/resources/doc-123
   ```
   Expected: No "classification unknown" error

## Implementation Steps

1. Add dual protocol mappers to broker realm (Terraform)
2. Apply: `terraform apply`
3. Clear user sessions in Keycloak admin console
4. Test direct login
5. Test federated login
6. Verify backend accepts tokens
7. Update documentation

## References

- Keycloak Docs: [Available User Session Data](https://www.keycloak.org/docs/latest/server_admin/index.html#available-user-session-data)
- Keycloak Docs: [Authentication Flows - AMR](https://www.keycloak.org/docs/latest/server_admin/index.html#_authentication-flows)
- RFC 8176: [Authentication Method Reference Values](https://www.rfc-editor.org/rfc/rfc8176.html)

