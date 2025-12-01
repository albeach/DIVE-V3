# MFA Federation Runbook

## Overview

This runbook covers operational procedures for managing MFA enforcement on federated users in DIVE V3.

## Quick Reference

| Task | Command/Location |
|------|------------------|
| Check MFA flow exists | `kcadm.sh get authentication/flows -r dive-v3-broker` |
| Check IdP binding | `kcadm.sh get identity-provider/instances/{idp}-federation -r dive-v3-broker` |
| Apply Terraform | `terraform apply -var-file={instance}.tfvars` |
| Test federation | https://usa-app.dive25.com → Sign in with DIVE V3 - France |

## Architecture

```
User → USA App → USA Keycloak → [Select FRA IdP] → FRA Keycloak
                                                         ↓
                                                   Authenticate
                                                         ↓
User ← USA App ← USA Keycloak ← [Post-Broker OTP] ← Token
                                        ↓
                                   OTP Form (REQUIRED)
                                        ↓
                              Enroll/Verify OTP
```

## Procedures

### 1. Verify MFA Configuration

```bash
# Set variables
INSTANCE="usa"
URL="https://usa-idp.dive25.com"
ADMIN_PASSWORD="DivePilot2025!SecureAdmin"

# Get admin token
TOKEN=$(curl -sk -X POST "$URL/realms/master/protocol/openid-connect/token" \
  -d 'client_id=admin-cli' \
  -d 'username=admin' \
  -d "password=$ADMIN_PASSWORD" \
  -d 'grant_type=password' | jq -r '.access_token')

# Check flow exists
curl -sk "$URL/admin/realms/dive-v3-broker/authentication/flows" \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | select(.alias == "Simple Post-Broker OTP")'

# Check flow structure (should show OTP Form as REQUIRED)
curl -sk "$URL/admin/realms/dive-v3-broker/authentication/flows/Simple%20Post-Broker%20OTP/executions" \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | {displayName, requirement}'

# Check IdP binding
curl -sk "$URL/admin/realms/dive-v3-broker/identity-provider/instances/fra-federation" \
  -H "Authorization: Bearer $TOKEN" | jq '{firstBrokerLoginFlowAlias, postBrokerLoginFlowAlias}'
```

Expected output:
```json
{
  "displayName": "OTP Form",
  "requirement": "REQUIRED"
}

{
  "firstBrokerLoginFlowAlias": "first broker login",
  "postBrokerLoginFlowAlias": "Simple Post-Broker OTP"
}
```

### 2. Deploy MFA Configuration via Terraform

```bash
cd terraform/instances

# Set admin password
export TF_VAR_keycloak_admin_password="DivePilot2025!SecureAdmin"

# Apply to specific instance
terraform workspace select usa
terraform apply -var-file=usa.tfvars

# Apply to all instances
for instance in usa fra gbr deu; do
  terraform workspace select $instance
  terraform apply -var-file=${instance}.tfvars -auto-approve
done
```

### 3. Emergency: Recreate MFA Flow Manually

If the flow is deleted or corrupted:

```bash
# Create flow
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh create authentication/flows \
  -r dive-v3-broker \
  -s alias="Simple Post-Broker OTP" \
  -s providerId="basic-flow" \
  -s description="Simple OTP enforcement after broker login" \
  -s topLevel=true \
  -s builtIn=false

# Add OTP Form execution
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh create \
  "authentication/flows/Simple%20Post-Broker%20OTP/executions/execution" \
  -r dive-v3-broker \
  -s provider="auth-otp-form"

# Set OTP Form to REQUIRED (via REST API)
TOKEN=$(curl -sk -X POST "https://usa-idp.dive25.com/realms/master/protocol/openid-connect/token" \
  -d 'client_id=admin-cli' -d 'username=admin' -d 'password=DivePilot2025!SecureAdmin' \
  -d 'grant_type=password' | jq -r '.access_token')

EXEC_ID=$(curl -sk "https://usa-idp.dive25.com/admin/realms/dive-v3-broker/authentication/flows/Simple%20Post-Broker%20OTP/executions" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

curl -sk -X PUT "https://usa-idp.dive25.com/admin/realms/dive-v3-broker/authentication/flows/Simple%20Post-Broker%20OTP/executions" \
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

# Bind to IdP
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update \
  identity-provider/instances/fra-federation \
  -r dive-v3-broker \
  -s 'firstBrokerLoginFlowAlias=first broker login' \
  -s 'postBrokerLoginFlowAlias=Simple Post-Broker OTP'
```

### 4. Add New Federation Partner

When adding a new partner (e.g., ESP):

1. **Update federation-registry.json**:
   ```json
   {
     "esp": {
       "idpUrl": "https://esp-idp.dive25.com",
       "appUrl": "https://esp-app.dive25.com",
       "type": "local"
     }
   }
   ```

2. **Create Terraform tfvars file** (`terraform/instances/esp.tfvars`):
   ```hcl
   instance_code = "esp"
   instance_name = "Spain"
   idp_url       = "https://esp-idp.dive25.com"
   app_url       = "https://esp-app.dive25.com"
   api_url       = "https://esp-api.dive25.com"
   ```

3. **Apply Terraform**:
   ```bash
   cd terraform/instances
   terraform workspace new esp
   terraform apply -var-file=esp.tfvars
   ```

The MFA flow and IdP bindings will be automatically created.

### 5. Troubleshooting

#### MFA Bypassed

**Symptom**: User logs in via federation without OTP prompt.

**Check**:
```bash
# Verify postBrokerLoginFlowAlias is set
curl -sk "$URL/admin/realms/dive-v3-broker/identity-provider/instances/fra-federation" \
  -H "Authorization: Bearer $TOKEN" | jq '.postBrokerLoginFlowAlias'
```

**Fix**: If null or wrong value, run Terraform apply or manual bind.

#### "REQUIRED and ALTERNATIVE elements at same level"

**Symptom**: Keycloak logs show this warning.

**Cause**: Post-Broker flow has mixed requirement types.

**Fix**: Use the Simple Post-Broker OTP flow (single authenticator only).

#### "invalid_user_credentials" after broker login

**Symptom**: User authenticates at external IdP but gets credential error.

**Cause**: Post-Broker flow contains password authenticator.

**Fix**: Remove any password authenticators from Post-Broker flow.

#### OTP Enrollment Not Shown

**Symptom**: User logs in but isn't prompted to set up OTP.

**Check**:
```bash
# Verify OTP Form is REQUIRED
curl -sk "$URL/admin/realms/dive-v3-broker/authentication/flows/Simple%20Post-Broker%20OTP/executions" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0].requirement'
```

**Fix**: If not "REQUIRED", update via REST API.

### 6. Monitoring

#### Key Metrics to Watch

- `keycloak_login_total{provider="fra-federation"}` - Federation logins
- `keycloak_login_error_total{error="invalid_user_credentials"}` - Credential errors
- `keycloak_authentication_execution_total{authenticator="auth-otp-form"}` - OTP challenges

#### Log Patterns to Alert On

```
# MFA bypass (should never happen with correct config)
type="LOGIN", identity_provider="*-federation", auth_method="openid-connect"
# Without subsequent OTP event = MFA bypassed

# Flow error
REQUIRED and ALTERNATIVE elements at same level

# Credential error
error="invalid_user_credentials", identity_provider="*-federation"
```

## Files Reference

| File | Purpose |
|------|---------|
| `terraform/modules/realm-mfa/simple-post-broker-otp.tf` | Terraform for Simple Post-Broker OTP flow |
| `terraform/modules/federated-instance/idp-brokers-vault.tf` | IdP configuration with flow binding |
| `docs/MFA-FEDERATION-SOLUTION.md` | Detailed solution documentation |

## Change History

| Date | Change | Author |
|------|--------|--------|
| 2025-11-29 | Initial creation | DIVE V3 Team |

---

**Document Version**: 1.0
**Last Updated**: 2025-11-29




