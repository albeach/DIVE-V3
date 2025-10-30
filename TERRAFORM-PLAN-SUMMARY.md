# Terraform Plan Summary - Phase 1 and Beyond

**Plan Execution**: `terraform plan -out=tfplan-phase1-all`  
**Total Changes**: **535 changes** (148 to add, 126 to change, 261 to destroy)

---

## Summary by Change Type

| Change Type | Count | Category |
|-------------|-------|----------|
| **Resources to ADD** | 148 | New resources being created |
| **Resources to CHANGE** | 126 | Existing resources being updated |
| **Resources to DESTROY** | 261 | Resources being deleted |
| **TOTAL** | **535** | Total changes |

---

## Phase 1 Changes (ACR/AMR Token Standardization)

### ✅ Expected Phase 1 Changes

#### 1. Protocol Mappers - ACR (10 realms) ✅ DETECTED

**Action**: **REPLACE** (destroy + create)

**Reason**: Changing `protocol_mapper` type forces replacement

**Changes per realm**:
- **Before**: `protocol_mapper = "oidc-usermodel-attribute-mapper"`
- **After**: `protocol_mapper = "oidc-session-note-mapper"`
- **Config change**: `user.attribute: "acr"` → `user.session.note: "AUTH_CONTEXT_CLASS_REF"`

**Affected Resources** (10):
1. `keycloak_generic_protocol_mapper.usa_acr_mapper` - will be replaced
2. `keycloak_generic_protocol_mapper.fra_acr_mapper` - will be replaced
3. `keycloak_generic_protocol_mapper.can_acr_mapper` - will be replaced
4. `keycloak_generic_protocol_mapper.deu_acr_mapper` - will be replaced
5. `keycloak_generic_protocol_mapper.gbr_acr_mapper` - will be replaced
6. `keycloak_generic_protocol_mapper.ita_acr_mapper` - will be replaced
7. `keycloak_generic_protocol_mapper.esp_acr_mapper` - will be replaced
8. `keycloak_generic_protocol_mapper.pol_acr_mapper` - will be replaced
9. `keycloak_generic_protocol_mapper.nld_acr_mapper` - will be replaced
10. `keycloak_generic_protocol_mapper.industry_acr_mapper` - will be replaced

#### 2. Protocol Mappers - AMR (10 realms) ✅ DETECTED

**Action**: **REPLACE** (destroy + create)

**Changes per realm**:
- **Before**: `protocol_mapper = "oidc-usermodel-attribute-mapper"`
- **After**: `protocol_mapper = "oidc-session-note-mapper"`
- **Config change**: `user.attribute: "amr"` → `user.session.note: "AUTH_METHODS_REF"`

**Affected Resources** (10):
1. `keycloak_generic_protocol_mapper.usa_amr_mapper` - will be replaced
2. `keycloak_generic_protocol_mapper.fra_amr_mapper` - will be replaced
3. `keycloak_generic_protocol_mapper.can_amr_mapper` - will be replaced
4. `keycloak_generic_protocol_mapper.deu_amr_mapper` - will be replaced
5. `keycloak_generic_protocol_mapper.gbr_amr_mapper` - will be replaced
6. `keycloak_generic_protocol_mapper.ita_amr_mapper` - will be replaced
7. `keycloak_generic_protocol_mapper.esp_amr_mapper` - will be replaced
8. `keycloak_generic_protocol_mapper.pol_amr_mapper` - will be replaced
9. `keycloak_generic_protocol_mapper.nld_amr_mapper` - will be replaced
10. `keycloak_generic_protocol_mapper.industry_amr_mapper` - will be replaced

#### 3. User Attributes (10 realms) - ⚠️ NOT IN PLAN

**Expected**: User resources to be updated with `acr` and `amr` removed from attributes

**Actual**: Users are being **CREATED** (not updated), which suggests the existing users might have different names

**Affected Resources** (10 being created - NEW):
1. `keycloak_user.usa_test_user_secret[0]` - will be **created**
2. `keycloak_user.fra_test_user[0]` - will be **created**
3. `keycloak_user.can_test_user[0]` - will be **created**
4. `keycloak_user.deu_test_user_secret[0]` - will be **created**
5. `keycloak_user.gbr_test_user_secret[0]` - will be **created**
6. `keycloak_user.ita_test_user_secret[0]` - will be **created**
7. `keycloak_user.esp_test_user_secret[0]` - will be **created**
8. `keycloak_user.pol_test_user_secret[0]` - will be **created**
9. `keycloak_user.nld_test_user_secret[0]` - will be **created**
10. `keycloak_user.industry_test_user[0]` - will be **created**

**Phase 1 Subtotal**: ~20 mapper replacements + 10 user creations = **~30 resources**

---

## Non-Phase 1 Changes (Additional Scope)

### Category 1: New Realm and Client Resources

**Count**: ~60 new resources

**Resources being CREATED**:
- `keycloak_realm.dive_v3[0]` - New realm (legacy?)
- `keycloak_openid_client.dive_v3_app[0]` - New client
- `keycloak_openid_client_scope.dive_attributes[0]` - New client scope
- `keycloak_saml_identity_provider.france_idp[0]` - France SAML IdP
- `keycloak_oidc_identity_provider.canada_idp[0]` - Canada OIDC IdP
- `keycloak_oidc_identity_provider.industry_idp[0]` - Industry OIDC IdP
- 2 Realm user profiles (France, Spain)
- 3 New realm roles (user_role, admin_role, super_admin_role)

**Purpose**: Appears to be infrastructure from previous phases being applied

### Category 2: Identity Provider Mappers (Broker)

**Count**: ~80 new broker mappers

**Resources being CREATED** (examples):
- `keycloak_custom_identity_provider_mapper.usa_broker_acr[0]`
- `keycloak_custom_identity_provider_mapper.usa_broker_amr[0]`
- `keycloak_custom_identity_provider_mapper.usa_broker_uniqueid[0]`
- (Repeated for each realm: USA, FRA, CAN, DEU, GBR, ITA, ESP, POL, NLD, Industry)
- Plus France SAML mappers (username, firstname, lastname, email, etc.)
- Plus Canada OIDC mappers
- Plus Industry OIDC mappers

**Purpose**: Broker realm federation mappers (maps claims from national realms to broker)

### Category 3: Protocol Mapper Updates (Non-ACR/AMR)

**Count**: ~70 mappers being updated

**Resources being UPDATED** (in-place):
- All clearance, uniqueID, country, COI, dutyOrg, orgUnit mappers (6 per realm × 10 realms)
- Broker realm mappers
- Canada client mappers
- Industry client mappers

**Example**: `keycloak_generic_protocol_mapper.usa_clearance_mapper` - will be updated in-place

**Purpose**: General configuration drift from previous phases

### Category 4: Realm Configuration Updates

**Count**: 9 realms being updated

**Resources being UPDATED** (in-place):
- `keycloak_realm.dive_v3_usa[0]` - will be updated
- `keycloak_realm.dive_v3_fra[0]` - will be updated
- `keycloak_realm.dive_v3_can[0]` - will be updated
- `keycloak_realm.dive_v3_deu[0]` - will be updated
- `keycloak_realm.dive_v3_gbr[0]` - will be updated
- `keycloak_realm.dive_v3_ita[0]` - will be updated
- `keycloak_realm.dive_v3_esp[0]` - will be updated
- `keycloak_realm.dive_v3_pol[0]` - will be updated
- `keycloak_realm.dive_v3_nld[0]` - will be updated

**Purpose**: Realm-level configuration changes (possibly theme, token lifetime, etc.)

### Category 5: Authentication Flow Changes

**Count**: ~24 updates

**Resources being UPDATED** (in-place):
- `module.broker_mfa.keycloak_authentication_execution.direct_grant_username[0]`
- `module.broker_mfa.keycloak_authentication_execution.direct_grant_password[0]`
- `module.broker_mfa.keycloak_authentication_execution.direct_grant_condition_user_attribute[0]`
- `module.broker_mfa.keycloak_authentication_execution_config.direct_grant_condition_config[0]`
- `module.broker_mfa.keycloak_authentication_subflow.direct_grant_otp_conditional[0]`

**Plus 11 × 2 changes** (one per realm + broker):
- `module.xxx_mfa.keycloak_authentication_subflow.classified_conditional` - requirement change: `ALTERNATIVE` → `REQUIRED`
- `module.xxx_mfa.keycloak_authentication_execution_config.classified_condition_config` - attribute_value change

**Example Change**:
```terraform
# module.usa_mfa.keycloak_authentication_execution_config.classified_condition_config
~ config = {
  ~ "attribute_value" = "^(CONFIDENTIAL|SECRET|TOP_SECRET)$" → "^(?!UNCLASSIFIED$).*"
    # (2 unchanged elements hidden)
  }
```

**Purpose**: MFA flow improvements (Phase 6 changes being applied)

### Category 6: Post-Broker Flow Deletions ⚠️

**Count**: ~261 resources being DESTROYED

**Resources being DESTROYED**:
- All `post_broker_classified` authentication flows (11 realms)
- All `post_broker_conditional` subflows (11 realms)
- All `post_broker_conditional_inner` subflows (11 realms)
- All `post_broker_clearance_check` execution configs (11 realms)
- All `post_broker_otp_form` executions (11 realms)
- All `idp_redirector` execution configs (11 realms)
- Various other post-broker flow components

**Example**:
```terraform
# module.usa_mfa.keycloak_authentication_flow.post_broker_classified will be destroyed
- resource "keycloak_authentication_flow" "post_broker_classified" {
  - alias       = "Post-Broker Classified MFA - United States"
  - description = "Post-broker MFA enforcement for classified clearances (AAL2)"
  - id          = "fcd50c8c-9100-4a08-9125-543a79a5eeb8"
  - provider_id = "basic-flow"
  - realm_id    = "dive-v3-usa"
  }
```

**Purpose**: Cleanup of unused Post-Broker MFA flows (Phase 4 goal - not Phase 1!)

### Category 7: Test User Changes

**Count**: ~20 users

**Resources being CREATED** (new test users):
- 10 test users for national realms (e.g., `usa_test_user_secret`, `fra_test_user`)
- 4 broker realm test users (different clearance levels)

**Resources being UPDATED** (existing users):
- `keycloak_user.broker_super_admin[0]` - will be updated
- `keycloak_user.france_user[0]` - will be updated
- `keycloak_user.canada_user[0]` - will be updated
- `keycloak_user.industry_user[0]` - will be updated

**Resources being CREATED** (user role assignments):
- 11 `keycloak_user_roles` resources for new test users

**Purpose**: Test user creation/updates (possibly from earlier phases)

### Category 8: Client Updates

**Count**: ~12 clients

**Resources being UPDATED**:
- `keycloak_openid_client.dive_v3_app_broker[0]`
- All 10 national realm clients (usa_realm_client, fra_realm_client, etc.)

**Purpose**: Client configuration updates (possibly redirect URIs, scopes, etc.)

### Category 9: Spain SAML IdP Update

**Count**: 1 IdP update

**Resource**: `module.spain_saml_idp.keycloak_saml_identity_provider.external_idp[0]` - will be updated

**Purpose**: Spain external IdP configuration change

---

## Risk Analysis

### ⚠️ HIGH RISK Changes

1. **Deleting 261 Post-Broker Flow Resources**
   - **Risk**: Could break authentication for all realms if flows are in use
   - **Mitigation**: Verify these flows are NOT currently assigned to any realm's browser/direct grant flows
   
2. **Creating New Realm (`dive_v3`)**
   - **Risk**: Could conflict with existing realm or cause confusion
   - **Mitigation**: Check if this is intentional or terraform drift

3. **Creating New Identity Providers**
   - **Risk**: Could interfere with existing authentication flows
   - **Mitigation**: Verify these are intended additions

### ⚙️ MEDIUM RISK Changes

1. **Replacing 20 Protocol Mappers (ACR/AMR)**
   - **Risk**: Brief moment where mappers don't exist during replacement
   - **Mitigation**: This is Phase 1 - expected and tested

2. **Creating 10 New Test Users**
   - **Risk**: Could be duplicates if users already exist with different names
   - **Mitigation**: Check Keycloak for existing test users

3. **Updating Authentication Flow Conditions**
   - **Risk**: Could change MFA behavior unexpectedly
   - **Mitigation**: Verify regex changes are correct

### ✅ LOW RISK Changes

1. **Updating Realm Configurations**
   - Low risk - typically just parameter changes

2. **Creating Broker Mappers**
   - Low risk - adding new functionality

3. **Updating Client Configurations**
   - Low risk - usually safe changes

---

## Recommendations

### Option 1: Apply Everything (Risky) ❌ NOT RECOMMENDED

```bash
terraform apply tfplan-phase1-all
```

**Pros**: Applies all pending changes at once  
**Cons**: 261 deletions could break system, too many unknowns

### Option 2: Phase 1 Only (Targeted Apply) ✅ RECOMMENDED

```bash
cd terraform

# Apply ONLY Phase 1 changes (ACR/AMR mappers)
terraform apply \
  -target=keycloak_generic_protocol_mapper.usa_acr_mapper \
  -target=keycloak_generic_protocol_mapper.usa_amr_mapper \
  -target=keycloak_generic_protocol_mapper.fra_acr_mapper \
  -target=keycloak_generic_protocol_mapper.fra_amr_mapper \
  -target=keycloak_generic_protocol_mapper.can_acr_mapper \
  -target=keycloak_generic_protocol_mapper.can_amr_mapper \
  -target=keycloak_generic_protocol_mapper.deu_acr_mapper \
  -target=keycloak_generic_protocol_mapper.deu_amr_mapper \
  -target=keycloak_generic_protocol_mapper.gbr_acr_mapper \
  -target=keycloak_generic_protocol_mapper.gbr_amr_mapper \
  -target=keycloak_generic_protocol_mapper.ita_acr_mapper \
  -target=keycloak_generic_protocol_mapper.ita_amr_mapper \
  -target=keycloak_generic_protocol_mapper.esp_acr_mapper \
  -target=keycloak_generic_protocol_mapper.esp_amr_mapper \
  -target=keycloak_generic_protocol_mapper.pol_acr_mapper \
  -target=keycloak_generic_protocol_mapper.pol_amr_mapper \
  -target=keycloak_generic_protocol_mapper.nld_acr_mapper \
  -target=keycloak_generic_protocol_mapper.nld_amr_mapper \
  -target=keycloak_generic_protocol_mapper.industry_acr_mapper \
  -target=keycloak_generic_protocol_mapper.industry_amr_mapper
```

**Pros**: Only applies Phase 1, safe and controlled  
**Cons**: Leaves other drift unresolved (can be addressed later)

### Option 3: Incremental Apply (Best Practice) ✅ ALSO RECOMMENDED

Apply changes in logical groups:

1. **First**: Phase 1 (ACR/AMR mappers only)
2. **Second**: Authentication flow updates (after testing Phase 1)
3. **Third**: New IdPs and mappers (after testing flows)
4. **Fourth**: Cleanup deletions (after everything else works)

### Option 4: Refresh Terraform State (Investigation) 🔍

Before applying anything:

```bash
# Import any manually created resources
terraform state list

# Check what's actually in Keycloak vs. Terraform state
# This might reveal the source of the 261 deletions
```

---

## Phase 1 Isolation Script

To apply ONLY Phase 1 changes, save this to `scripts/apply-phase1-only.sh`:

```bash
#!/bin/bash
set -e

cd terraform

echo "Applying ONLY Phase 1 changes (ACR/AMR protocol mappers)"
echo "Total targets: 20 protocol mappers (10 realms × 2 mappers)"
echo ""

terraform apply \
  -target=keycloak_generic_protocol_mapper.usa_acr_mapper \
  -target=keycloak_generic_protocol_mapper.usa_amr_mapper \
  -target=keycloak_generic_protocol_mapper.fra_acr_mapper \
  -target=keycloak_generic_protocol_mapper.fra_amr_mapper \
  -target=keycloak_generic_protocol_mapper.can_acr_mapper \
  -target=keycloak_generic_protocol_mapper.can_amr_mapper \
  -target=keycloak_generic_protocol_mapper.deu_acr_mapper \
  -target=keycloak_generic_protocol_mapper.deu_amr_mapper \
  -target=keycloak_generic_protocol_mapper.gbr_acr_mapper \
  -target=keycloak_generic_protocol_mapper.gbr_amr_mapper \
  -target=keycloak_generic_protocol_mapper.ita_acr_mapper \
  -target=keycloak_generic_protocol_mapper.ita_amr_mapper \
  -target=keycloak_generic_protocol_mapper.esp_acr_mapper \
  -target=keycloak_generic_protocol_mapper.esp_amr_mapper \
  -target=keycloak_generic_protocol_mapper.pol_acr_mapper \
  -target=keycloak_generic_protocol_mapper.pol_amr_mapper \
  -target=keycloak_generic_protocol_mapper.nld_acr_mapper \
  -target=keycloak_generic_protocol_mapper.nld_amr_mapper \
  -target=keycloak_generic_protocol_mapper.industry_acr_mapper \
  -target=keycloak_generic_protocol_mapper.industry_amr_mapper

echo ""
echo "Phase 1 apply complete!"
echo "Next: Test token format with ./scripts/validate-token-format.sh"
```

---

## Conclusion

The terraform plan contains **far more than Phase 1 changes**:

- ✅ **Phase 1 (expected)**: 20 ACR/AMR mapper replacements
- ⚠️ **Additional scope**: 148 creates, 126 updates, 261 destroys (515 non-Phase-1 changes)

**Recommendation**: Use **targeted apply** for Phase 1 only, then investigate the other 515 changes separately.

**Phase 1 is safe to apply** using the targeted approach - it only affects protocol mappers.

---

**End of Terraform Plan Summary**

