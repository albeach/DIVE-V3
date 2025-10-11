# Adding New Identity Providers to DIVE V3

**Purpose:** Guide for administrators to add new SAML or OIDC IdPs to DIVE V3  
**Audience:** System administrators, DevOps engineers  
**Status:** Production-Ready Procedure

---

## 🎯 Prerequisites

**Any IdP can be added if it provides:**
1. ✅ User unique identifier (email, username, or custom ID)
2. ✅ Security clearance (or can be defaulted/enriched)
3. ✅ Country affiliation (or can be inferred from email)
4. ⚠️ COI memberships (optional - can default to empty)

**Supported Protocols:**
- ✅ SAML 2.0 (for legacy government systems)
- ✅ OIDC / OAuth 2.0 (for modern cloud IdPs)

---

## 📋 Procedure: Adding New OIDC IdP

### Example: Adding UK Ministry of Defence (MOD) OIDC IdP

**Step 1: Gather IdP Information**
```
Required Information:
- Authorization URL: https://sso.mod.uk/oauth2/authorize
- Token URL: https://sso.mod.uk/oauth2/token
- JWKS URL: https://sso.mod.uk/oauth2/jwks
- Client ID: (provided by UK MOD)
- Client Secret: (provided by UK MOD)
- Claim names: (ask UK MOD what claims they send)
```

**Step 2: Configure in Terraform**

**File:** `terraform/main.tf`

```hcl
# UK MOD OIDC IdP
resource "keycloak_oidc_identity_provider" "uk_idp" {
  realm        = keycloak_realm.dive_v3.id
  alias        = "uk-idp"
  display_name = "United Kingdom (OIDC)"
  enabled      = true
  
  # Endpoints from UK MOD
  authorization_url = "https://sso.mod.uk/oauth2/authorize"
  token_url        = "https://sso.mod.uk/oauth2/token"
  jwks_url         = "https://sso.mod.uk/oauth2/jwks"
  
  # Credentials from UK MOD
  client_id     = var.uk_mod_client_id
  client_secret = var.uk_mod_client_secret
  
  default_scopes = "openid profile email"
  
  store_token = true
  trust_email = true
  sync_mode   = "FORCE"
}
```

**Step 3: Map UK Attributes to DIVE Schema**

**Ask UK MOD:** What claim names do you use?
- User ID claim: `nino` (National Insurance Number)
- Clearance claim: `sc_level` (Security Clearance Level)
- Country claim: `nationality`
- COI claim: `groups`

**Create Mappers:**
```hcl
# UK User ID → DIVE uniqueID
resource "keycloak_custom_identity_provider_mapper" "uk_uniqueid_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.uk_idp.alias
  name                     = "uk-uniqueID-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "nino"  # UK claim name
    "user.attribute" = "uniqueID"  # DIVE attribute name
  }
}

# UK Security Clearance → DIVE clearance (with normalization)
resource "keycloak_custom_identity_provider_mapper" "uk_clearance_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.uk_idp.alias
  name                     = "uk-clearance-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "sc_level"  # UK claim name
    "user.attribute" = "clearance"
  }
}

# May need JavaScript mapper for clearance normalization:
# UK "SC" → DIVE "SECRET"
# UK "DV" → DIVE "TOP_SECRET"
# etc.

# UK Nationality → DIVE countryOfAffiliation
resource "keycloak_custom_identity_provider_mapper" "uk_country_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.uk_idp.alias
  name                     = "uk-country-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "nationality"
    "user.attribute" = "countryOfAffiliation"
  }
}

# UK Groups → DIVE acpCOI
resource "keycloak_custom_identity_provider_mapper" "uk_coi_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.uk_idp.alias
  name                     = "uk-coi-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "groups"
    "user.attribute" = "acpCOI"
  }
}
```

**Step 4: Add UK Email Domain to Enrichment**

**File:** `frontend/src/auth.ts`

```typescript
const EMAIL_DOMAIN_COUNTRY_MAP: Record<string, string> = {
    // ... existing mappings ...
    'mod.uk': 'GBR',  # Add UK domain
    'ministry-of-defence.uk': 'GBR',
};
```

**Step 5: Apply Configuration**
```bash
cd terraform
terraform plan  # Review changes
terraform apply  # Apply new IdP
```

**Step 6: Test New IdP**
```
1. http://localhost:3000
2. Click new "United Kingdom (OIDC)" button
3. Login with UK credentials
4. Verify attributes mapped correctly
5. Test resource access
```

---

## 📋 Procedure: Adding New SAML IdP

### Example: Adding German IdP with SAML

**Step 1: Obtain SAML Metadata from Partner**
```xml
<!-- German IdP provides this -->
<EntityDescriptor entityID="https://sso.bundeswehr.org">
  <IDPSSODescriptor>
    <SingleSignOnService 
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://sso.bundeswehr.org/saml/sso"/>
    <SigningCertificate>...</SigningCertificate>
  </IDPSSODescriptor>
</EntityDescriptor>
```

**Step 2: Configure SAML IdP in Terraform**

```hcl
resource "keycloak_saml_identity_provider" "germany_idp" {
  realm        = keycloak_realm.dive_v3.id
  alias        = "germany-idp"
  display_name = "Germany (SAML)"
  enabled      = true
  
  # From German metadata
  entity_id                  = "https://sso.bundeswehr.org"
  single_sign_on_service_url = "https://sso.bundeswehr.org/saml/sso"
  
  # Production SAML settings
  validate_signature = true  # Enable for production
  # Import signing certificate from metadata
  
  post_binding_response      = true
  post_binding_authn_request = true
  
  store_token = true
  trust_email = true
  sync_mode   = "FORCE"
}
```

**Step 3: Map German SAML Attributes**

**German Attribute Names** (example):
- `BenutzerID` → uniqueID
- `Freigabe` → clearance
- `Land` → countryOfAffiliation
- `Gemeinschaft` → acpCOI

```hcl
resource "keycloak_custom_identity_provider_mapper" "germany_uniqueid" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_saml_identity_provider.germany_idp.alias
  name                     = "germany-uniqueID-mapper"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "attribute.name" = "BenutzerID"  # German SAML attribute name
    "user.attribute" = "uniqueID"     # DIVE standard attribute
  }
}

# Similar for clearance, country, COI...
```

**Step 4: Configure Clearance Normalization**

**German Clearance Levels:**
- VS-VERTRAULICH → CONFIDENTIAL
- GEHEIM → SECRET
- STRENG GEHEIM → TOP_SECRET

**Option A: Hardcoded Mapper**
```hcl
resource "keycloak_custom_identity_provider_mapper" "germany_clearance_hardcoded" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_saml_identity_provider.germany_idp.alias
  name                     = "germany-clearance-transform"
  identity_provider_mapper = "hardcoded-attribute-idp-mapper"
  
  extra_config = {
    "attribute"       = "clearance"
    "attribute.value" = "SECRET"  # Default for testing
  }
}
```

**Option B: JavaScript Mapper** (Recommended for production)
```javascript
// In Keycloak Admin Console:
// Create JavaScript mapper with transformation logic
if (attributes.Freigabe == 'VS-VERTRAULICH') return 'CONFIDENTIAL';
if (attributes.Freigabe == 'GEHEIM') return 'SECRET';
if (attributes.Freigabe == 'STRENG GEHEIM') return 'TOP_SECRET';
return 'UNCLASSIFIED';  // Default
```

**Step 5: Test German IdP**
```
1. Add UI button for Germany
2. Login with German test user
3. Verify attributes: DEU, SECRET (or normalized), [NATO-COSMIC]
4. Test resource access
5. Administrator approves for production
```

---

## ✅ Administrator Approval Checklist

**Before approving new IdP for production:**

**Security:**
- [ ] IdP uses HTTPS (TLS 1.2+)
- [ ] SAML: Signature validation enabled and tested
- [ ] OIDC: JWT signature verification working
- [ ] Client credentials secured (not in git)
- [ ] IdP metadata/discovery endpoint validated

**Attribute Mapping:**
- [ ] All 4 required DIVE attributes mapped (uniqueID, clearance, country, COI)
- [ ] Country codes use ISO 3166-1 alpha-3
- [ ] Clearance levels normalize to DIVE enum
- [ ] COI values map to recognized communities
- [ ] Test user verified with correct attributes

**Functional Testing:**
- [ ] User can authenticate successfully
- [ ] Dashboard displays correct attributes
- [ ] Resource authorization decisions correct
- [ ] Logout clears session properly
- [ ] Second login auto-links (no duplicate users)

**Compliance:**
- [ ] Audit logs capture IdP source
- [ ] PII minimization followed (only uniqueID logged)
- [ ] Enrichment logged if applied
- [ ] Authorization decisions logged with IdP context

**Documentation:**
- [ ] IdP configuration documented
- [ ] Attribute mapping documented
- [ ] Clearance normalization rules documented
- [ ] Support contact for IdP documented

---

## 🎓 Best Practices

### 1. Use Claim Mapping Templates

**Standard Template for Any OIDC IdP:**
```hcl
# Replace <idp_alias> and claim names

# Mapper 1: uniqueID (required)
resource "keycloak_custom_identity_provider_mapper" "<idp>_uniqueid" {
  identity_provider_alias = "<idp_alias>"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  extra_config = {
    "claim" = "<idp_unique_id_claim>"
    "user.attribute" = "uniqueID"
  }
}

# Mapper 2: clearance (required)
resource "keycloak_custom_identity_provider_mapper" "<idp>_clearance" {
  identity_provider_alias = "<idp_alias>"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  extra_config = {
    "claim" = "<idp_clearance_claim>"
    "user.attribute" = "clearance"
  }
}

# Mapper 3: countryOfAffiliation (required)
resource "keycloak_custom_identity_provider_mapper" "<idp>_country" {
  identity_provider_alias = "<idp_alias>"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  extra_config = {
    "claim" = "<idp_country_claim>"
    "user.attribute" = "countryOfAffiliation"
  }
}

# Mapper 4: acpCOI (recommended)
resource "keycloak_custom_identity_provider_mapper" "<idp>_coi" {
  identity_provider_alias = "<idp_alias>"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  extra_config = {
    "claim" = "<idp_coi_claim>"
    "user.attribute" = "acpCOI"
  }
}
```

### 2. Handle Missing Attributes Gracefully

**If IdP doesn't provide clearance:**
- System will enrich to UNCLASSIFIED (via session callback)
- Administrator can manually assign clearance in Keycloak
- Or configure hardcoded mapper with approved default

**If IdP doesn't provide country:**
- System will infer from email domain (if configured)
- Or administrator can manually set
- Or deny access (fail-secure)

**If IdP doesn't provide COI:**
- System will default to empty array
- User gets base access, no COI-restricted resources

### 3. Test Before Production

**Test Checklist:**
```
1. Create test user in new IdP
2. Configure IdP in Keycloak (non-production realm first)
3. Test authentication flow
4. Verify all 4 attributes map correctly
5. Test resource access scenarios
6. Test logout
7. Test error cases (invalid claims, missing attributes)
8. Review audit logs
9. Administrator approves
10. Deploy to production
```

---

## 📊 Current IdP Roster (Week 3)

| IdP | Protocol | Status | Attributes | Purpose |
|-----|----------|--------|------------|---------|
| U.S. DoD | OIDC (direct) | ✅ Production | All 4 | Baseline |
| France | SAML 2.0 | ✅ Production | All 4 | Legacy system demo |
| Canada | OIDC | ✅ Production | All 4 | Modern federation |
| Industry | OIDC | ✅ Production | 2 + enriched | Incomplete IdP demo |

**Capacity:** Unlimited (Keycloak supports dozens of IdP brokers)

---

## 🔧 Troubleshooting New IdP

### Issue: Attributes showing "Not Set"

**Check:**
1. IdP broker mappers configured? (dive-v3-pilot realm)
2. Claim names correct? (match what IdP sends)
3. User attribute names correct? (must be exact)
4. SyncMode = "FORCE"?

**Debug:**
```bash
# Check token contents
# Login as test user
# In browser console: Copy id_token from session
# Decode at jwt.io
# Verify claims present in token
```

### Issue: "User already exists"

**Solution:**
```
This is normal on first login if email matches existing user.
Options:
1. Delete existing user from dive-v3-pilot
2. Configure account linking
3. Use different test email
```

### Issue: Clearance levels don't match

**Solution:**
```
Configure clearance normalization:
- Use JavaScript mapper in Keycloak
- Or hardcoded mapper with transformed value
- Or document acceptable mappings
```

---

## ✅ Summary

**DIVE V3 can support ANY IdP that:**
1. Uses SAML 2.0 or OIDC protocol ✅
2. Provides user identifier ✅
3. Provides or allows enrichment of clearance/country ✅
4. Is approved by administrator ✅

**Steps to add new IdP:**
1. Gather IdP metadata/endpoints
2. Configure in Terraform
3. Map foreign attributes to DIVE schema
4. Test with test user
5. Administrator approves
6. Deploy to production

**Production-ready:** ✅ **Yes - Extensible architecture**

---

**Document Status:** ✅ Complete  
**Audience:** System administrators  
**Purpose:** Enable adding new coalition partners as approved

