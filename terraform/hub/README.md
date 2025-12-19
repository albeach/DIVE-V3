# Hub MFA Deployment - Terraform Infrastructure

## Overview
Created Terraform infrastructure-as-code for the DIVE V3 Hub to manage MFA authentication flows.

## What Was Created

### Directory: `terraform/hub/`

```
terraform/hub/
├── main.tf         # Hub MFA configuration (imports existing realm, adds MFA flows)
├── provider.tf     # Keycloak provider configuration
├── variables.tf    # Input variables (keycloak_admin_password)
├── backend.tf      # Local state backend
└── hub.tfvars      # Variable overrides
```

### Key Resources

1. **Data Source: `keycloak_realm.hub`**
   - Imports existing `dive-v3-broker` realm (created by docker-compose)

2. **Data Source: `keycloak_openid_client.broker_client`**
   - Gets existing broker client for protocol mapper configuration

3. **Module: `mfa`** (from `../modules/realm-mfa`)
   - Creates `Classified Access Browser Flow - DIVE V3 - Hub`
   - Creates conditional MFA flows for AAL1/AAL2/AAL3
   - Binds browser flow to realm
   - Enables `dive-amr-enrichment` event listener

4. **Protocol Mappers: `keycloak_generic_protocol_mapper`**
   - `amr_mapper` - Native `oidc-amr-mapper` for AMR claims
   - `acr_mapper` - Native `oidc-acr-mapper` for ACR claims
   - These are required because the hub doesn't use `federated-instance` module

5. **Authentication Flows Created:**
   - Classified Access Browser Flow (main)
   - Conditional WebAuthn AAL3 (TOP_SECRET users)
   - Conditional OTP AAL2 (CONFIDENTIAL/SECRET users)
   - 2FA Options (existing credentials)
   - Force OTP Enrollment (new users)
   - Simple Post-Broker OTP
   - Post Broker MFA

## MFA Requirements by Clearance Level

| Clearance | MFA Requirement | AAL Level |
|-----------|-----------------|-----------|
| UNCLASSIFIED | No MFA | AAL1 (password only) |
| CONFIDENTIAL | OTP/TOTP required | AAL2 (password + OTP) |
| SECRET | OTP/TOTP required | AAL2 (password + OTP) |
| TOP_SECRET | WebAuthn/Hardware Key required | AAL3 (password + WebAuthn) |

## Deployment Commands

### Apply Terraform (already done)
```bash
cd terraform/hub
terraform init
source ../../.env.hub
TF_VAR_keycloak_admin_password="${KEYCLOAK_ADMIN_PASSWORD}" \
  terraform apply -var-file=hub.tfvars -auto-approve
```

### Via DIVE CLI
```bash
./dive hub deploy    # Full deployment including Terraform
```

## Verification

### Check MFA Flows Exist
```bash
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh \
  get authentication/flows -r dive-v3-broker | grep "Classified Access"
```

### Verify Browser Flow is Bound
```bash
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh \
  get realms/dive-v3-broker | grep browserFlow
```
**Expected:** `"browserFlow" : "Classified Access Browser Flow - DIVE V3 - Hub"`

### Test Login
1. Go to https://localhost:3000
2. Log in as a user with CONFIDENTIAL or SECRET clearance
3. Should be prompted for OTP enrollment/validation
4. UNCLASSIFIED users skip MFA

## Integration with Hub Module

Updated `scripts/dive-modules/hub.sh`:
- Changed `_hub_apply_terraform()` to use `terraform/hub` instead of `terraform/pilot`
- Hub deployment now automatically applies Terraform during step 5

## State Management

- **Backend:** Local state (`terraform.tfstate`)
- **Location:** `terraform/hub/terraform.tfstate`
- **Separate from:** pilot and spoke states

## Terraform State

Current state includes:
- 41 resources created
- Classified browser flow + all subflows
- Keycloak authentication bindings
- Execution configurations for AAL enforcement

## Next Steps

To test MFA:
1. Create test users with different clearances
2. Verify CONFIDENTIAL/SECRET users are prompted for OTP
3. Verify TOP_SECRET users are prompted for WebAuthn
4. Verify UNCLASSIFIED users bypass MFA

## Troubleshooting

### MFA Not Triggering
- Verify flow is bound: `./dive hub verify`
- Check user clearance attribute exists
- Review Keycloak event logs

### AMR/ACR Claims Incorrect
If tokens show `amr: ["pwd"]` and `acr: "1"` after WebAuthn login:

1. **Verify native protocol mappers exist:**
   ```bash
   docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh \
     get clients/<client-id>/protocol-mappers/models -r dive-v3-broker | \
     grep -A5 "oidc-amr-mapper\|oidc-acr-mapper"
   ```

2. **Verify event listener is enabled:**
   ```bash
   docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh \
     get realms/dive-v3-broker --fields eventsListeners
   ```
   Should show: `["dive-amr-enrichment", "jboss-logging"]`

3. **Apply Terraform to fix:**
   ```bash
   cd terraform/hub
   source ../../.env.hub
   TF_VAR_keycloak_admin_password="${KEYCLOAK_ADMIN_PASSWORD}" \
     terraform apply -var-file=hub.tfvars -auto-approve
   ```

**Expected token claims:**
| Authentication | AMR | ACR |
|---------------|-----|-----|
| Password only | `["pwd"]` | `"0"` |
| Password + OTP | `["pwd", "otp"]` | `"1"` |
| Password + WebAuthn | `["pwd", "hwk"]` | `"3"` |

### Terraform Errors
- Ensure `.env.hub` is sourced
- Verify Keycloak is running: `docker ps | grep keycloak`
- Check admin credentials are correct

## References

- Terraform Module: `terraform/modules/realm-mfa/`
- Hub Deployment: `scripts/dive-modules/hub.sh`
- Authentication Flow Design: `terraform/modules/realm-mfa/README.md`
