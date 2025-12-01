# DIVE V3 - Bugs to Fix

This document tracks critical bugs discovered during development and deployment that need systematic fixes.

---

## BUG-001: Terraform Keycloak Provider Fails to Apply User Attributes

**Severity:** CRITICAL  
**Discovered:** 2025-12-01  
**Status:** WORKAROUND APPLIED (needs systematic fix)

### Description

When running `terraform apply` for a new instance (e.g., FRA), the Keycloak Terraform provider creates test users but **fails to apply their attributes** in a single pass. This results in users having:

```json
{
  "username": "testuser-fra-1",
  "attributes": null  // CRITICAL: Missing identity attributes!
}
```

Instead of the expected:

```json
{
  "username": "testuser-fra-1",
  "attributes": {
    "countryOfAffiliation": ["FRA"],
    "clearance": ["UNCLASSIFIED"],
    "uniqueID": ["testuser-fra-1"],
    "organizationType": ["GOV"],
    ...
  }
}
```

### Impact

- **Identity Corruption:** Users authenticated without proper attributes
- **Wrong Country:** Frontend shows "USA" for FRA users (defaults)
- **Authorization Failures:** OPA policies may incorrectly evaluate without proper claims
- **Security Risk:** Users could access resources without proper clearance verification

### Root Cause

The Keycloak Terraform provider (`mrparkers/keycloak`) has a known issue where it:
1. Creates the user in one API call
2. Attempts to update attributes in a separate call
3. The second call can silently fail or be ignored

The Terraform state shows `attributes = {}` even though the HCL specifies attributes.

### Workaround Applied

Run a targeted Terraform apply specifically for user resources:

```bash
terraform apply -auto-approve -var-file=fra.tfvars \
  -target='module.instance.keycloak_user.pilot_users' \
  -target='module.instance.keycloak_user.industry_partner'
```

### Permanent Fix Needed

1. **Update instance sync script** to run Terraform apply twice or with targeted user apply
2. **Add post-apply verification** that checks user attributes via Keycloak Admin API
3. **Consider alternative:** Use Keycloak Admin API directly for user creation instead of Terraform
4. **Add CI/CD check:** Validate user attributes after deployment

### Verification Command

```bash
# Check user attributes via Keycloak Admin API
TOKEN=$(curl -s -k -X POST "https://${INSTANCE}-idp.dive25.com/realms/master/protocol/openid-connect/token" \
  -d "username=admin&password=$KEYCLOAK_ADMIN_PASSWORD&grant_type=password&client_id=admin-cli" | jq -r '.access_token')

curl -s -k "https://${INSTANCE}-idp.dive25.com/admin/realms/dive-v3-broker/users?username=testuser-${INSTANCE,,}-1" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0].attributes'
```

### Files Affected

- `terraform/modules/federated-instance/test-users.tf` - User creation logic
- `scripts/sync-gcp-secrets.sh` - Instance sync script (needs verification step)

---

## BUG-002: Frontend Missing BACKEND_URL Environment Variable

**Severity:** HIGH  
**Discovered:** 2025-12-01  
**Status:** FIXED for FRA (needs fix for all instances)

### Description

The frontend API routes (`/api/resources/search`) use `process.env.BACKEND_URL` for server-side requests to the backend, but only `NEXT_PUBLIC_BACKEND_URL` was configured in docker-compose files.

### Impact

- `/api/resources/search` returns 500 error
- `ECONNREFUSED` when frontend API routes try to reach backend
- Resources page shows "Something went wrong"

### Root Cause

- `NEXT_PUBLIC_*` variables are for client-side JavaScript only
- Server-side API routes need non-prefixed environment variables
- `BACKEND_URL` was missing from docker-compose environment

### Fix Applied (FRA only)

Added to `docker-compose.fra.yml`:

```yaml
environment:
  BACKEND_URL: https://backend:4000  # Server-side API routes use Docker network
  NEXT_PUBLIC_BACKEND_URL: https://fra-api.dive25.com  # Client-side uses tunnel
```

### Files Needing Same Fix

- [ ] `docker-compose.yml` (USA)
- [x] `docker-compose.fra.yml` (FRA) - FIXED
- [ ] `docker-compose.gbr.yml` (GBR)
- [ ] `docker-compose.deu.yml` (DEU)

---

## BUG-003: Keycloak Client Secret Mismatch After Terraform Apply

**Severity:** HIGH  
**Discovered:** 2025-12-01  
**Status:** WORKAROUND APPLIED (needs systematic fix)

### Description

When Terraform creates the `dive-v3-client-broker` OIDC client, it generates a random client secret instead of using the secret from GCP Secret Manager. This causes NextAuth to fail with "Invalid client credentials".

### Impact

- Authentication fails after fresh Terraform apply
- Users see "Server error - There is a problem with the server configuration"
- NextAuth callback returns 401 from Keycloak

### Root Cause

The `keycloak_openid_client.broker_client` resource in Terraform doesn't have `client_secret` explicitly set, so Keycloak auto-generates one.

### Workaround Applied

Manually update client secret via Keycloak Admin API after Terraform apply:

```bash
# Update client secret to match GCP secret
curl -s -k -X PUT "https://${INSTANCE}-idp.dive25.com/admin/realms/dive-v3-broker/clients/$CLIENT_UUID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "'$CLIENT_UUID'", "clientId": "dive-v3-client-broker", "secret": "'$KEYCLOAK_CLIENT_SECRET'"}'
```

### Permanent Fix Needed

Update `terraform/modules/federated-instance/main.tf` to accept client secret as input variable:

```hcl
resource "keycloak_openid_client" "broker_client" {
  # ... existing config ...
  client_secret = var.keycloak_client_secret  # Use GCP secret
}
```

### Files Affected

- `terraform/modules/federated-instance/main.tf`
- `terraform/modules/federated-instance/variables.tf`
- `terraform/instances/fra.tfvars` (and all instance tfvars)

---

## BUG-004: Resources Page Hardcoded 'USA' Instance Defaults

**Severity:** CRITICAL  
**Discovered:** 2025-12-01  
**Status:** ✅ FIXED

### Description

The resources page (`frontend/src/app/resources/page.tsx`) had hardcoded `'USA'` as the default instance in multiple places:

1. `selectedInstances` initial state: `useState<string[]>(['USA'])`
2. `selectedFilters.instances` initial state: `instances: ['USA']`
3. `clearAllFilters` reset value: `instances: ['USA']`
4. Instance pill disabled logic: `instance !== 'USA'`
5. BentoDashboard `activeInstances` prop: `['USA']`

This caused FRA, GBR, and DEU instances to show USA as the default/selected instance.

### Impact

- **Wrong Instance Filter:** FRA users see USA selected by default
- **Wrong Bento Dashboard:** "Local" card shows USA instead of FRA
- **Wrong Filter Badge:** USA badge shown in filters panel
- **Confusing UX:** Users think they're searching USA when on FRA

### Root Cause

Developer oversight - hardcoded `'USA'` instead of using `NEXT_PUBLIC_INSTANCE` environment variable which is correctly set per instance.

### Fix Applied

Added `CURRENT_INSTANCE` constant that reads from `process.env.NEXT_PUBLIC_INSTANCE`:

```typescript
// Get current instance from environment (FRA, USA, GBR, DEU)
const CURRENT_INSTANCE = process.env.NEXT_PUBLIC_INSTANCE || 'USA';

// Then replaced all hardcoded 'USA' with CURRENT_INSTANCE
const [selectedInstances, setSelectedInstances] = useState<string[]>([CURRENT_INSTANCE]);
```

### Files Fixed

- `frontend/src/app/resources/page.tsx` - All 5 hardcoded references replaced

### Commit

`697eb0c` - fix(resources): Use NEXT_PUBLIC_INSTANCE for instance-aware defaults

---

## Template for New Bugs

```markdown
## BUG-XXX: [Title]

**Severity:** CRITICAL | HIGH | MEDIUM | LOW  
**Discovered:** YYYY-MM-DD  
**Status:** OPEN | WORKAROUND APPLIED | FIXED

### Description
[What is the bug?]

### Impact
[What does this break?]

### Root Cause
[Why did this happen?]

### Workaround Applied
[Temporary fix if any]

### Permanent Fix Needed
[What should be done to fix this properly?]

### Files Affected
[List of files]
```

