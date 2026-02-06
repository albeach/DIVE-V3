# AAL/MFA Authentication Chain Preservation

## Critical Security Requirement

**NEVER** break the authentication context chain by replacing user tokens with service account tokens.

## The Authentication Chain

```
┌─────────────────────────────────────────────────────────────────────┐
│  DIVE V3 End-to-End Authentication Context Flow                    │
└─────────────────────────────────────────────────────────────────────┘

User Authentication (Keycloak)
  ↓
  JWT with AAL/MFA Context:
  - acr: "3" (AAL3 = hardware token)
  - amr: ["pwd", "hwk"] (password + hardware key)
  - auth_time: 1770354985
  - clearance, countryOfAffiliation, acpCOI, etc.
  ↓
Frontend (Next.js)
  ↓ [Authorization: Bearer <USER_TOKEN>]
  ↓
Backend API (Express.js)
  ↓ [Authorization: Bearer <USER_TOKEN>] ← MUST PRESERVE!
  ↓
KAS (Key Access Service)
  ↓ Verifies JWT signature
  ↓ Extracts: acr, amr, auth_time, clearance, etc.
  ↓ Constructs OPA input with FULL context
  ↓
OPA (Policy Decision Point)
  ↓ Evaluates AAL requirements (acp240.rego)
  ↓ Checks authentication_strength_sufficient
  ↓ Validates MFA (if AAL < required level)
  ↓
Decision: ALLOW or DENY
```

## What Breaks the Chain (DON'T DO THIS!)

### ❌ WRONG: Service Account Token

```typescript
// backend/src/controllers/resource.controller.ts

// ❌ BAD: Replaces user context with machine context
const kasServiceToken = await getKASServiceAccountToken({
    uniqueID: subject.uniqueID,
    clearance: subject.clearance,
    // ...
});

kasResponse = await axios.post(kasUrl, {
    bearerToken: kasServiceToken, // ❌ Lost AAL/MFA context!
    // ...
});
```

**Why it fails:**
- Service account uses `client_credentials` grant
- No user authentication event → `acr: "1"` (AAL1)
- No MFA proof → `amr: undefined` or minimal
- OPA sees AAL1 instead of AAL3
- MFA validation fails even for hardware token users

### ✅ CORRECT: User Token Preservation

```typescript
// backend/src/controllers/resource.controller.ts

// ✅ GOOD: Preserves user's AAL/MFA context
const bearerToken = req.headers.authorization?.replace('Bearer ', '');

kasResponse = await axios.post(kasUrl, {
    bearerToken, // ✅ Preserves acr: "3", amr: ["pwd", "hwk"]
    userIdentity: subject, // For audit (redundant but useful)
    resourceMetadata,
    // ...
});
```

## OPA Policy Requirements

### AAL/MFA Evaluation Order

```rego
# policies/org/nato/acp240.rego

# 1. FIRST: Check AAL (Authentication Assurance Level)
check_authentication_strength_sufficient if {
    required_aal := get_required_aal(input.resource.classification)
    actual_aal := parse_aal(input.context.acr)
    actual_aal >= required_aal
}

# 2. SECOND: Check MFA (only if AAL check didn't pass)
is_mfa_not_verified := msg if {
    input.resource.classification in ["CONFIDENTIAL", "SECRET", "TOP_SECRET"]
    
    # ✅ CRITICAL: Skip if AAL is already sufficient
    not check_authentication_strength_sufficient
    
    # Fallback: Check AMR has 2+ factors
    input.context.amr
    amr_factors := parse_amr(input.context.amr)
    count(amr_factors) < 2
    msg := sprintf("MFA required for %v: need 2+ factors, got %v", [
        input.resource.classification,
        count(amr_factors),
    ])
}
```

**Why this order matters:**
- AAL3 (hardware token) already proves MFA
- Checking AMR count after AAL fails is redundant
- Prevents false negatives for valid AAL3 sessions

## KAS OPA Input Requirements

### Complete Context Structure

```typescript
// kas/src/server.ts

const opaInput = {
    input: {
        subject: {
            authenticated: true,
            uniqueID: tokenPayload.uniqueID,
            clearance: tokenPayload.clearance,
            countryOfAffiliation: tokenPayload.countryOfAffiliation,
            acpCOI: tokenPayload.acpCOI || [],
            issuer: tokenPayload.iss, // For federation trust
            mfa_used: Array.isArray(tokenPayload.amr) && tokenPayload.amr.length >= 2,
        },
        action: { operation: 'get' },
        resource: {
            resourceId,
            classification,
            releasabilityTo,
            COI,
            creationDate,
            encrypted: true,
        },
        context: {
            requestId,
            currentTime: new Date().toISOString(),
            sourceIP: req.ip,
            deviceCompliant: true,
            // ✅ CRITICAL: Include AAL/MFA context
            acr: tokenPayload.acr,        // Authentication Context Class
            amr: tokenPayload.amr,        // Authentication Methods Reference
            auth_time: tokenPayload.auth_time, // Session validation
            tenant: tokenPayload.countryOfAffiliation || 'USA',
        },
    },
};
```

### Missing Context Symptoms

If you see OPA logs like this, the context is incomplete:

```json
{
  "context": {
    "acr": "1",           // ❌ Should be "3" for AAL3
    "amr_type": "undefined", // ❌ Should be ["pwd", "hwk"]
    "acr_type": "string"
  }
}
```

**Fix**: Ensure KAS passes `tokenPayload.acr` and `tokenPayload.amr` to OPA input.

## AAL Level Mapping

| Classification | Required AAL | Authentication Methods |
|---------------|--------------|----------------------|
| UNCLASSIFIED  | AAL1 | Single factor (password) |
| RESTRICTED    | AAL1 | Single factor (password) |
| CONFIDENTIAL  | AAL2 | MFA (2+ factors) |
| SECRET        | AAL2 | MFA (2+ factors) |
| TOP SECRET    | AAL3 | Hardware token + PIN/biometric |

**acr values:**
- `"1"` = AAL1 (single factor)
- `"2"` = AAL2 (multi-factor)
- `"3"` = AAL3 (hardware-based)

**amr examples:**
- `["pwd"]` = Password only (AAL1)
- `["pwd", "otp"]` = Password + OTP (AAL2)
- `["pwd", "hwk"]` = Password + Hardware Key (AAL3)

## Policy Distribution (OPAL)

### Git-Based Policy Management

```bash
# Setup (one-time)
./scripts/setup-git-policy-repo.sh

# After editing policies
cd policies
git add -A
git commit -m "fix: update AAL validation logic"

# OPAL detects commit and distributes to all OPA instances (5s poll)
```

### Production Webhook Setup

```yaml
# docker-compose.hub.yml
opal-server:
  environment:
    OPAL_POLICY_REPO_URL: https://github.com/albeach/dive-v3-policies.git
    OPAL_POLICY_REPO_WEBHOOK_SECRET: ${GITHUB_WEBHOOK_SECRET}
    OPAL_POLICY_REPO_POLLING_INTERVAL: 30 # Fallback
```

**Flow:**
1. Developer commits to `dive-v3-policies` repo
2. GitHub webhook triggers OPAL server
3. OPAL server pulls latest policies
4. OPAL broadcasts to all clients (hub + spokes) via Redis
5. Each OPA instance reloads policies (zero downtime)

## Troubleshooting

### Issue: "MFA required for TOP_SECRET access" (despite AAL3)

**Check:**
1. Backend is using user token (not service account):
   ```bash
   docker logs dive-hub-backend | grep "service account token"
   # Should see: "with USER token (preserves AAL/MFA)"
   ```

2. KAS receives correct acr/amr:
   ```bash
   docker logs dive-hub-kas | grep "Policy Re-Evaluation Input" | tail -1 | jq '.context'
   # Should show: "acr": "3", "amr": ["pwd", "hwk"]
   ```

3. OPA policy has AAL-first check:
   ```bash
   curl -sk https://localhost:8181/v1/policies/policies/org/nato/acp240.rego \
     | jq -r '.result.raw' | grep -A 5 "is_mfa_not_verified"
   # Should show: "not check_authentication_strength_sufficient"
   ```

### Issue: Policy changes not taking effect

**Check:**
1. Policies committed to Git:
   ```bash
   cd policies
   git log -1
   git status
   ```

2. OPAL server detected change:
   ```bash
   docker logs dive-hub-opal-server | grep -i "policy\|git\|update"
   ```

3. OPA loaded new policy:
   ```bash
   curl -sk https://localhost:8181/v1/policies | jq 'keys'
   ```

## Testing Checklist

Before deploying authentication changes:

- [ ] Test AAL1 users can access UNCLASSIFIED/RESTRICTED
- [ ] Test AAL2 users can access CONFIDENTIAL/SECRET
- [ ] Test AAL3 users can access TOP_SECRET
- [ ] Test AAL1 users are DENIED access to SECRET
- [ ] Test service account tokens are NOT used for user operations
- [ ] Test OPA receives complete context (acr, amr, auth_time)
- [ ] Test policy changes propagate to all OPA instances
- [ ] Test KAS audit logs show correct user identity
- [ ] Test cross-instance federation preserves AAL context

## Related Documentation

- [Session Management](./session-management.md) - Token lifecycle
- [OPAL Policy Distribution](../scripts/setup-git-policy-repo.sh) - Git setup
- [ACP-240 Compliance](../policies/org/nato/acp240.rego) - NATO policy
- [KAS Architecture](../kas/README.md) - Key Access Service

## Commit Reference

This architecture was established in commit `6609ec39`:
- **Title**: fix(auth): preserve user AAL/MFA context in KAS authorization chain
- **Date**: 2026-02-06
- **Files Changed**: 
  - `backend/src/controllers/resource.controller.ts`
  - `kas/src/server.ts`
  - `kas/src/utils/jwt-validator.ts`
  - `scripts/setup-git-policy-repo.sh`

**Never break this chain again!**
