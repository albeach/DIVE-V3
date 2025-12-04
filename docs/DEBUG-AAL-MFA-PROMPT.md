# DIVE V3 - AAL/MFA Authentication Flow Debug Prompt

## Background Context

### Project Overview
DIVE V3 is a coalition-friendly ICAM web application demonstrating federated identity management across USA/NATO partners with policy-driven ABAC authorization. The system implements multi-level Authentication Assurance Levels (AAL1/AAL2/AAL3) based on user clearance attributes.

### Deployment Architecture

**4 Coalition Instances:**
- **USA** (Local): `docker compose -p usa -f docker-compose.yml` → https://usa-app.dive25.com
- **FRA** (Local): `docker compose -p fra -f docker-compose.fra.yml` → https://fra-app.dive25.com  
- **GBR** (Local): `docker compose -p gbr -f docker-compose.gbr.yml` → https://gbr-app.dive25.com
- **DEU** (Remote): `docker compose -p deu -f docker-compose.deu.yml` → https://deu-app.prosecurity.biz
  - Remote host: `192.168.42.120` (accessible via VPN)
  - Synced via: `scripts/remote/deploy-remote.sh` and `scripts/remote/ssh-helper.sh`

**Shared Services** (Local):
- `docker compose -p shared -f docker-compose.shared.yml` (Grafana, Prometheus, Alertmanager, Blacklist Redis)

### Instance Synchronization

**Local Instances (USA, FRA, GBR):**
- Docker Compose files in project root
- Secrets loaded via `source scripts/sync-gcp-secrets.sh <instance>`
- Keycloak realms provisioned via Terraform: `terraform -chdir=terraform/instances workspace select <inst> && terraform apply -var-file=<inst>.tfvars`

**Remote Instance (DEU):**
- Source sync: `rsync` via `scripts/remote/ssh-helper.sh`
- Commands: `ssh_remote deu "..."` and `sudo_remote deu "..."`
- Docker Compose: Same structure, different ports
- Secrets: GCP secrets synced to remote `.env` file

### GCP Secrets Management

**CRITICAL: All passwords/secrets stored in GCP Secret Manager (project: dive25)**

```bash
# Load secrets for an instance
source scripts/sync-gcp-secrets.sh usa   # or fra, gbr, deu

# Key secrets per instance:
# - dive-v3-keycloak-client-secret-{usa,fra,gbr,deu}  ← Instance-specific!
# - dive-v3-keycloak-{usa,fra,gbr,deu}
# - dive-v3-mongodb-{usa,fra,gbr,deu}
# - dive-v3-postgres-{usa,fra,gbr,deu}
# - dive-v3-auth-secret-{usa,fra,gbr,deu}
```

**Recent Fix Applied:**
The `scripts/sync-gcp-secrets.sh` was fixed to properly set instance-specific `KEYCLOAK_CLIENT_SECRET` from `KEYCLOAK_CLIENT_SECRET_{USA,FRA,GBR,DEU}`. Previously only USA was correctly aliased.

### Terraform IaC Structure

```
terraform/
├── instances/
│   ├── backend.tf          # GCS remote state (dive25-terraform-state bucket)
│   ├── provider.tf         # Keycloak provider config
│   ├── instance.tf         # Main instance configuration
│   ├── usa.tfvars          # USA-specific variables
│   ├── fra.tfvars          # FRA-specific variables
│   ├── gbr.tfvars          # GBR-specific variables
│   └── deu.tfvars          # DEU-specific variables
└── modules/
    ├── federated-instance/ # Realm, client, protocol mappers, IdP brokers
    ├── realm-mfa/          # AAL-based MFA authentication flow ← KEY MODULE
    └── realm-mfa-stepup/   # ACR-based step-up authentication
```

**Terraform Workspaces:**
```bash
cd terraform/instances
terraform workspace select usa  # or fra, gbr, deu
terraform plan -var-file=usa.tfvars
terraform apply -var-file=usa.tfvars -auto-approve
```

---

## Current AAL/MFA Configuration State

### Expected Behavior (Per Design)

| Clearance Level | AAL | Required Authentication |
|----------------|-----|------------------------|
| UNCLASSIFIED | AAL1 | Password only |
| CONFIDENTIAL | AAL2 | Password + OTP |
| SECRET | AAL2 | Password + OTP |
| TOP_SECRET | AAL3 | Password + WebAuthn/FIDO2 |

### Terraform Module: `realm-mfa/main.tf`

The `realm-mfa` module creates a "Classified Access Browser Flow" with this structure:

```
Classified Access Browser Flow - {Instance}:
├── Cookie (ALTERNATIVE) - SSO session reuse
└── Forms - {Instance} (ALTERNATIVE)
    ├── Username-Password Form (REQUIRED)
    ├── Conditional WebAuthn AAL3 - {Instance} (CONDITIONAL)
    │   ├── Condition - user attribute: clearance == "TOP_SECRET"
    │   └── WebAuthn Authenticator (REQUIRED)
    └── Conditional OTP AAL2 - {Instance} (CONDITIONAL)
        ├── Condition - user attribute: clearance matches "^(CONFIDENTIAL|SECRET)$"
        ├── 2FA Options - {Instance} (CONDITIONAL)
        │   ├── Condition - user configured (checks if OTP exists)
        │   └── OTP Form (ALTERNATIVE)
        └── Force OTP Enrollment - {Instance} (CONDITIONAL)
            ├── Condition - sub-flow executed (checks if 2FA Options NOT executed)
            └── OTP Form (REQUIRED) - forces enrollment
```

### What Was Verified

1. **Flow exists in Keycloak:**
   ```bash
   # USA Keycloak has flows:
   # - "Classified Access Browser Flow - United States" (ID: 046b9b71-9825-4698-a531-9e850c39cc1d)
   ```

2. **Realm binding is correct:**
   ```json
   {
     "browserFlow": "Classified Access Browser Flow - United States"
   }
   ```

3. **Client binding is correct:**
   ```json
   {
     "clientId": "dive-v3-client-broker",
     "authenticationFlowBindingOverrides": {
       "browser": "046b9b71-9825-4698-a531-9e850c39cc1d"
     }
   }
   ```

4. **Condition configurations:**
   - AAL3 (TOP_SECRET): `attribute_name=clearance`, `attribute_value=^TOP_SECRET$`, `negate=false`
   - AAL2 (CONFIDENTIAL/SECRET): `attribute_name=clearance`, `attribute_value=^(CONFIDENTIAL|SECRET)$`, `negate=false`
   - Force OTP Enrollment: `flow_to_check=2FA Options - United States`, `negate=true`

5. **Test user attributes (testuser-usa-3):**
   ```json
   {
     "clearance": ["SECRET"],
     "countryOfAffiliation": ["USA"],
     "acpCOI": ["[\"NATO\"]"],
     "uniqueID": ["testuser-usa-3"]
   }
   ```

6. **Test user credentials:**
   - Only has `password` credential type
   - Does NOT have OTP configured (should trigger forced enrollment)

---

## The Problem

### Observed Behavior
- User `testuser-usa-3` with `clearance=SECRET` can login with password only
- MFA/OTP enrollment is NOT being enforced
- This happens even in fresh browser sessions (incognito, cleared cookies)
- Behavior is inconsistent between:
  - **Broker realm authentication** (via IdP selection page)
  - **Direct realm login** (direct Keycloak URL)

### Hypothesis
Something is misconfigured in either:
1. The Terraform module doesn't correctly create the conditional flow structure
2. The `conditional-user-attribute` authenticator isn't matching the clearance attribute
3. The `conditional-user-configured` or `conditional-sub-flow-executed` logic is wrong
4. There's a Keycloak version-specific issue (we're using Keycloak 26.x)
5. The flow is being bypassed due to some other authenticator succeeding first

---

## What Has Been Attempted

### 1. Verified Flow Structure via Admin API
```bash
curl -ks "https://localhost:8443/admin/realms/dive-v3-broker/authentication/flows/Classified%20Access%20Browser%20Flow%20-%20United%20States/executions" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```
Result: Flow structure appears correct with proper nesting and requirements.

### 2. Verified Condition Configurations
```bash
curl -ks "https://localhost:8443/admin/realms/dive-v3-broker/authentication/config/{config-id}" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```
Result: Configurations match expected values.

### 3. Verified User Attributes
```bash
curl -ks "https://localhost:8443/admin/realms/dive-v3-broker/users/{user-id}" \
  -H "Authorization: Bearer $TOKEN" | jq '.attributes'
```
Result: User has `clearance: ["SECRET"]`.

### 4. Fixed Client Secret Sync
Fixed `scripts/sync-gcp-secrets.sh` to properly alias instance-specific secrets.

### 5. Restarted Frontends
Restarted USA, FRA, GBR frontends with correct client secrets.

### 6. Tested in Fresh Browser
Tested in incognito mode - MFA still not triggered.

---

## Debug Request

**Please thoroughly debug the Keycloak AAL/MFA authentication flow issue using:**

1. **keycloak-docs MCP** - Search for:
   - Conditional authentication flow documentation
   - `conditional-user-attribute` authenticator behavior
   - `conditional-user-configured` authenticator behavior  
   - `conditional-sub-flow-executed` authenticator behavior
   - Browser flow execution order and ALTERNATIVE/CONDITIONAL semantics
   - Keycloak 26.x specific changes to authentication flows

2. **Keycloak Admin CLI** - Investigate:
   - Actual flow execution path for a login attempt
   - Why the conditional isn't matching even when attribute exists
   - If there are any Keycloak events/logs showing flow decisions
   - Compare working broker flow vs. direct login flow

3. **Terraform Review** - Check:
   - If `keycloak_authentication_execution` resources are created correctly
   - If execution priorities/ordering is correct
   - If `CONDITIONAL` requirement is supported for the authenticator types used
   - If there are any missing dependencies between resources

4. **GCP Secrets** - Ensure:
   - Run `source scripts/sync-gcp-secrets.sh <instance>` before any Docker operations
   - Client secrets match between GCP, Terraform state, and Keycloak
   - No stale secrets in running containers

### Key Questions to Answer

1. **Why doesn't `conditional-user-attribute` match `clearance=SECRET` against `^(CONFIDENTIAL|SECRET)$`?**

2. **Is the Forms subflow even being executed, or is something else satisfying the ALTERNATIVE requirement?**

3. **What's the difference between broker realm auth and direct realm auth in terms of flow execution?**

4. **Are there Keycloak 26.x breaking changes affecting conditional flows?**

5. **Is the `auth-otp-form` authenticator capable of forcing enrollment, or do we need a different approach?**

### Commands to Start Debugging

```bash
# Load secrets for USA
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
source scripts/sync-gcp-secrets.sh usa

# Get admin token
TOKEN=$(curl -ks -X POST 'https://localhost:8443/realms/master/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=password' \
  -d 'client_id=admin-cli' \
  -d 'username=admin' \
  -d "password=$KEYCLOAK_ADMIN_PASSWORD" | jq -r '.access_token')

# List authentication flows
curl -ks "https://localhost:8443/admin/realms/dive-v3-broker/authentication/flows" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[] | "\(.id) | \(.alias)"'

# Get flow executions
curl -ks "https://localhost:8443/admin/realms/dive-v3-broker/authentication/flows/Classified%20Access%20Browser%20Flow%20-%20United%20States/executions" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

# Enable Keycloak debug logging
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server https://localhost:8443 --realm master --user admin --password "$KEYCLOAK_ADMIN_PASSWORD"
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update realms/dive-v3-broker \
  -s 'eventsEnabled=true' -s 'eventsExpiration=86400' \
  -s 'enabledEventTypes=["LOGIN","LOGIN_ERROR","LOGOUT","CODE_TO_TOKEN","CODE_TO_TOKEN_ERROR"]'

# View authentication events
curl -ks "https://localhost:8443/admin/realms/dive-v3-broker/events?type=LOGIN&type=LOGIN_ERROR" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

### Expected Outcome

A working AAL2/AAL3 enforcement where:
- UNCLASSIFIED users: Password only login ✓
- CONFIDENTIAL/SECRET users: Forced to enroll/use OTP
- TOP_SECRET users: Forced to enroll/use WebAuthn

The fix should be persistent (Terraform IaC) and resilient (survive container restarts).

---

## File References

- **MFA Terraform Module**: `terraform/modules/realm-mfa/main.tf`
- **Instance Config**: `terraform/instances/instance.tf`
- **Secrets Sync**: `scripts/sync-gcp-secrets.sh`
- **Remote Sync**: `scripts/remote/deploy-remote.sh`, `scripts/remote/ssh-helper.sh`
- **Docker Compose**: `docker-compose.yml` (USA), `docker-compose.{fra,gbr,deu}.yml`
- **Keycloak Docs MCP**: Available for searching Keycloak documentation






