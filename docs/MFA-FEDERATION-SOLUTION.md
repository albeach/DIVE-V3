# MFA Enforcement for Federated Users - Complete Solution

## Overview

This document describes the **working solution** for enforcing Multi-Factor Authentication (MFA) on federated users in DIVE V3. After extensive troubleshooting, we discovered that the correct approach is to use a **simple, single-authenticator Post-Broker Login Flow** as recommended by the [Keycloak documentation](https://www.keycloak.org/docs/latest/server_admin/index.html#requesting-2-factor-authentication-after-identity-provider-login).

## The Problem

Federated users were bypassing MFA because:

1. **Complex Post-Broker flows fail**: Mixing user creation steps (`idp-create-user-if-unique`, `idp-auto-link`) with MFA steps (`auth-otp-form`) in the same flow causes Keycloak to throw:
   ```
   WARN: REQUIRED and ALTERNATIVE elements at same level! Those alternative executions will be ignored
   ```

2. **Browser flow doesn't apply to federated users**: The custom browser flow with conditional MFA only runs for direct logins, not for users coming through an Identity Provider.

3. **First Broker Login vs Post Broker Login confusion**: These are separate flows with different purposes.

## The Solution

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FEDERATION LOGIN FLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. User clicks "Sign in with DIVE V3 - France" on USA app              │
│                           │                                             │
│                           ▼                                             │
│  2. USA Keycloak redirects to FRA Keycloak                              │
│                           │                                             │
│                           ▼                                             │
│  3. User authenticates on FRA with username/password                    │
│                           │                                             │
│                           ▼                                             │
│  4. FRA returns identity token to USA                                   │
│                           │                                             │
│                           ▼                                             │
│  5. USA executes "First Broker Login" flow                              │
│     └─► Creates/links user in USA realm (default Keycloak flow)         │
│                           │                                             │
│                           ▼                                             │
│  6. USA executes "Post Broker Login" flow  ◄─── THIS IS WHERE MFA GOES  │
│     └─► "Simple Post-Broker OTP" flow                                   │
│         └─► OTP Form (REQUIRED)                                         │
│             ├─► If user has OTP: Prompt for OTP code                    │
│             └─► If user has no OTP: Prompt for OTP enrollment           │
│                           │                                             │
│                           ▼                                             │
│  7. User completes MFA → Redirected to USA app                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Insight from Keycloak Documentation

> "The easiest way is to enforce authentication with one particular 2-factor method. For example, when requesting OTP, the flow can look like this with **only a single authenticator configured**."
> 
> "This type of flow asks the user to configure the OTP during the first login with the identity provider when the user does not have OTP set on the account."

Source: [Keycloak Server Admin Guide - Post Login Flow Examples](https://www.keycloak.org/docs/latest/server_admin/index.html#requesting-2-factor-authentication-after-identity-provider-login)

### Flow Configuration

#### First Broker Login Flow
- **Alias**: `first broker login` (Keycloak's built-in default)
- **Purpose**: Creates/links the federated user in the local realm
- **DO NOT MODIFY**: Use the default flow

#### Post Broker Login Flow
- **Alias**: `Simple Post-Broker OTP`
- **Purpose**: Enforces MFA after user is created/linked
- **Structure**:
  ```
  Simple Post-Broker OTP (basic-flow)
  └── OTP Form (REQUIRED)
  ```

That's it. **ONE authenticator. No subflows. No conditions.**

### Identity Provider Configuration

Each federation IdP must be configured with:

```json
{
  "firstBrokerLoginFlowAlias": "first broker login",
  "postBrokerLoginFlowAlias": "Simple Post-Broker OTP"
}
```

## Implementation

### Manual Configuration (via kcadm.sh)

```bash
# 1. Create the Simple Post-Broker OTP flow
kcadm.sh create authentication/flows \
  -r dive-v3-broker \
  -s alias="Simple Post-Broker OTP" \
  -s providerId="basic-flow" \
  -s description="Simple OTP enforcement after broker login" \
  -s topLevel=true \
  -s builtIn=false

# 2. Add OTP Form execution
kcadm.sh create "authentication/flows/Simple%20Post-Broker%20OTP/executions/execution" \
  -r dive-v3-broker \
  -s provider="auth-otp-form"

# 3. Set OTP Form to REQUIRED (via REST API)
# Get admin token
TOKEN=$(curl -sk -X POST "https://[KEYCLOAK_URL]/realms/master/protocol/openid-connect/token" \
  -d 'client_id=admin-cli' \
  -d 'username=admin' \
  -d 'password=[ADMIN_PASSWORD]' \
  -d 'grant_type=password' | jq -r '.access_token')

# Get execution ID
EXEC_ID=$(curl -sk "https://[KEYCLOAK_URL]/admin/realms/dive-v3-broker/authentication/flows/Simple%20Post-Broker%20OTP/executions" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

# Update to REQUIRED
curl -sk -X PUT "https://[KEYCLOAK_URL]/admin/realms/dive-v3-broker/authentication/flows/Simple%20Post-Broker%20OTP/executions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"$EXEC_ID\",
    \"requirement\": \"REQUIRED\",
    \"displayName\": \"OTP Form\",
    \"providerId\": \"auth-otp-form\",
    \"level\": 0,
    \"index\": 0
  }"

# 4. Bind flow to IdP
kcadm.sh update identity-provider/instances/[IDP_ALIAS]-federation \
  -r dive-v3-broker \
  -s 'firstBrokerLoginFlowAlias=first broker login' \
  -s 'postBrokerLoginFlowAlias=Simple Post-Broker OTP'
```

### Terraform Configuration (Persistent)

See `terraform/modules/realm-mfa/simple-post-broker-otp.tf`

## What NOT To Do

### ❌ DON'T mix user creation with MFA in Post-Broker flow
```
Post Broker MFA Flow
├── Create User If Unique (ALTERNATIVE)  ← WRONG
├── Auto Link (ALTERNATIVE)              ← WRONG
├── Conditional OTP (CONDITIONAL)        ← WRONG
│   └── OTP Form (REQUIRED)
```

This causes: `REQUIRED and ALTERNATIVE elements at same level!`

### ❌ DON'T use conditional subflows in Post-Broker flow
```
Post Broker MFA Flow
├── Conditional OTP AAL2 (CONDITIONAL)   ← WRONG
│   ├── Condition - user attribute       ← WRONG
│   └── OTP Form (REQUIRED)
```

Conditional flows add complexity that can break the broker flow.

### ❌ DON'T rely on browser flow for federated users
The browser flow only applies to direct logins, not federated logins.

## Verification

### Check Flow Structure
```bash
kcadm.sh get "authentication/flows/Simple%20Post-Broker%20OTP/executions" \
  -r dive-v3-broker | jq '.[] | {displayName, requirement}'
```

Expected output:
```json
{
  "displayName": "OTP Form",
  "requirement": "REQUIRED"
}
```

### Check IdP Configuration
```bash
kcadm.sh get identity-provider/instances/fra-federation \
  -r dive-v3-broker | jq '{firstBrokerLoginFlowAlias, postBrokerLoginFlowAlias}'
```

Expected output:
```json
{
  "firstBrokerLoginFlowAlias": "first broker login",
  "postBrokerLoginFlowAlias": "Simple Post-Broker OTP"
}
```

### Test Federation Login
1. Go to https://usa-app.dive25.com
2. Click "Sign in with DIVE V3 - France"
3. Login with FRA credentials
4. **You should be prompted for OTP enrollment/verification**

## Troubleshooting

### "REQUIRED and ALTERNATIVE elements at same level"
**Cause**: Your Post-Broker flow has mixed requirement types
**Fix**: Use the simple single-authenticator flow

### "invalid_user_credentials" after broker login
**Cause**: Post-Broker flow is asking for password again
**Fix**: Remove any password authenticators from Post-Broker flow

### User bypasses MFA
**Cause**: `postBrokerLoginFlowAlias` is null or points to wrong flow
**Fix**: Verify IdP configuration has correct flow alias

### "cookie_not_found" errors
**Cause**: Session expired during long flow execution
**Fix**: Simplify the flow (fewer steps = faster execution)

## Related Files

- `terraform/modules/realm-mfa/simple-post-broker-otp.tf` - Terraform IaC
- `terraform/modules/federated-instance/idp-brokers-vault.tf` - IdP configuration
- `scripts/vault/sync-secrets-to-files.sh` - Vault secret sync

## References

- [Keycloak Post Login Flow Documentation](https://www.keycloak.org/docs/latest/server_admin/index.html#_identity_broker_post_login_flow)
- [Keycloak Post Login Flow Examples](https://www.keycloak.org/docs/latest/server_admin/index.html#post-login-flow-examples)
- [Keycloak First Broker Login Flow](https://www.keycloak.org/docs/latest/server_admin/index.html#_identity_broker_first_login)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-29
**Author**: DIVE V3 Team
**Status**: VERIFIED WORKING







