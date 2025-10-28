# External SAML IdP Terraform Module

This module automates the onboarding of external SAML identity providers into the DIVE V3 Keycloak broker.

**Provider**: `keycloak/keycloak` v5.x (official Keycloak provider)  
**Keycloak Version**: 23.0+ (tested with Keycloak 26.0)

## ⚠️ Breaking Changes (v2.0 - Provider Migration)

This module has been migrated from `mrparkers/keycloak` v4.x to `keycloak/keycloak` v5.x. Key changes:

- **NameID Format**: Now uses simple strings (`"Transient"`) instead of URN format (`"urn:oasis:names:tc:SAML:2.0:nameid-format:transient"`)
- **Provider**: Updated to official `keycloak/keycloak` v5.x provider

See `SAML-MODULE-MIGRATION-REPORT.md` for full migration guide.

## Features

- ✅ Automated SAML IdP configuration in Keycloak
- ✅ Standard attribute mappers (uniqueID, email, country)
- ✅ Custom attribute mapping support
- ✅ Certificate validation
- ✅ Signature and encryption configuration
- ✅ First broker login flow integration

## Usage

### Basic Example

```hcl
module "spain_saml_idp" {
  source = "./modules/external-idp-saml"

  realm_id         = "dive-v3-broker"
  idp_alias        = "spain-external"
  idp_display_name = "Spain Ministry of Defense"
  idp_entity_id    = "https://spain-saml:8443/simplesaml/saml2/idp/metadata.php"
  idp_sso_url      = "https://spain-saml:8443/simplesaml/saml2/idp/SSOService.php"
  idp_slo_url      = "https://spain-saml:8443/simplesaml/saml2/idp/SingleLogoutService.php"
  idp_certificate  = file("${path.module}/certs/spain-saml.crt")
  country_code     = "ESP"
}
```

### Advanced Example with Custom Attributes

```hcl
module "spain_saml_idp" {
  source = "./modules/external-idp-saml"

  realm_id         = "dive-v3-broker"
  idp_alias        = "spain-external"
  idp_display_name = "Spain Ministry of Defense"
  idp_entity_id    = "https://spain-idp.mde.es/saml2/idp/metadata.php"
  idp_sso_url      = "https://spain-idp.mde.es/saml2/idp/SSOService.php"
  idp_slo_url      = "https://spain-idp.mde.es/saml2/idp/SingleLogoutService.php"
  idp_certificate  = file("${path.module}/certs/spain-production.crt")
  country_code     = "ESP"

  # Security Configuration
  want_assertions_signed    = true
  want_assertions_encrypted = true
  force_authn              = false

  # Custom Attribute Mappings
  attribute_mappings = {
    clearance = {
      saml_attribute_name        = "nivelSeguridad"
      saml_attribute_name_format = "urn:oasis:names:tc:SAML:2.0:attrname-format:basic"
      user_attribute_name        = "clearance"
      sync_mode                  = "INHERIT"
    }
    coi = {
      saml_attribute_name        = "grupoInteresCompartido"
      saml_attribute_name_format = "urn:oasis:names:tc:SAML:2.0:attrname-format:basic"
      user_attribute_name        = "acpCOI"
      sync_mode                  = "INHERIT"
    }
    organization = {
      saml_attribute_name        = "organizacion"
      saml_attribute_name_format = "urn:oasis:names:tc:SAML:2.0:attrname-format:basic"
      user_attribute_name        = "organization"
      sync_mode                  = "INHERIT"
    }
  }
}
```

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| realm_id | Keycloak realm ID | `string` | `"dive-v3-broker"` | no |
| idp_alias | Unique alias for the IdP | `string` | n/a | yes |
| idp_display_name | Display name for the IdP | `string` | n/a | yes |
| idp_entity_id | SAML Entity ID | `string` | n/a | yes |
| idp_sso_url | SAML SSO URL | `string` | n/a | yes |
| idp_slo_url | SAML SLO URL | `string` | `""` | no |
| idp_certificate | X.509 certificate (PEM) | `string` | n/a | yes |
| country_code | ISO 3166-1 alpha-3 code | `string` | n/a | yes |
| name_id_policy_format | SAML NameID format (Transient, Persistent, Email, Kerberos, X.509 Subject Name, Unspecified, Windows Domain Qualified Name) | `string` | `"Transient"` | no |
| signature_algorithm | SAML signature algorithm | `string` | `"RSA_SHA256"` | no |
| want_assertions_signed | Require signed assertions | `bool` | `true` | no |
| want_assertions_encrypted | Require encrypted assertions | `bool` | `false` | no |
| force_authn | Force re-authentication | `bool` | `false` | no |
| enabled | Enable the IdP | `bool` | `true` | no |
| trust_email | Trust email from IdP | `bool` | `true` | no |
| store_token | Store IdP tokens | `bool` | `false` | no |
| link_only | Link-only mode | `bool` | `false` | no |
| attribute_mappings | Custom attribute mappings | `map(object)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| idp_alias | The alias of the created IdP |
| idp_internal_id | The internal ID of the created IdP |
| idp_redirect_uri | The redirect URI for external IdP configuration |
| attribute_mappers | List of created attribute mappers |
| idp_config_summary | Summary of IdP configuration |

## Attribute Mapping

### Standard Mappings (Automatic)

The module automatically creates mappers for:
- `uid` → `uniqueID`
- `mail` → `email`
- `<country_code>` → `countryOfAffiliation` (hardcoded)

### Custom Mappings

Define custom attribute mappings using the `attribute_mappings` variable:

```hcl
attribute_mappings = {
  attribute_key = {
    saml_attribute_name        = "samlAttributeName"
    saml_attribute_name_format = "urn:oasis:names:tc:SAML:2.0:attrname-format:basic"
    user_attribute_name        = "userAttributeName"
    sync_mode                  = "INHERIT"  # or "FORCE", "LEGACY"
  }
}
```

## Certificate Management

### Development (Self-Signed)

```bash
# Extract certificate from SimpleSAMLphp
openssl x509 -in spain-saml/cert/server.crt -out spain-saml.crt
```

### Production (CA-Signed)

```bash
# Get certificate from external IdP metadata
curl -k https://spain-idp.mde.es/saml2/idp/metadata.php | \
  xmllint --xpath "//ds:X509Certificate/text()" - | \
  base64 -d > spain-production.crt
```

## Security Best Practices

1. **Certificate Validation**: Always use `want_assertions_signed = true`
2. **Encryption**: Enable `want_assertions_encrypted = true` for sensitive data
3. **Token Storage**: Set `store_token = false` to prevent token leakage
4. **Email Trust**: Only set `trust_email = true` if external IdP is trusted
5. **Force Auth**: Use `force_authn = true` for high-security scenarios

## Troubleshooting

### Invalid Certificate

**Error**: `Certificate validation failed`

**Solution**: Ensure certificate is in PEM format without headers:
```bash
# Remove headers
sed '/BEGIN CERTIFICATE/d; /END CERTIFICATE/d' cert.pem > cert_clean.pem
```

### Attribute Not Mapped

**Error**: Attribute not appearing in Keycloak user

**Solution**: Check attribute name format in external IdP metadata:
```bash
curl -k https://idp/metadata.php | grep -A 5 AttributeStatement
```

### SSO URL Not Reachable

**Error**: `Connection refused to SSO URL`

**Solution**: Verify network connectivity and use internal Docker DNS:
```bash
# Use Docker service name instead of localhost
idp_sso_url = "https://spain-saml:8443/..."  # Not https://localhost:8443/...
```

## Examples

See `terraform/examples/spain-saml-idp/` for complete examples.

## Testing

```bash
# Validate configuration
terraform validate

# Plan changes
terraform plan

# Apply configuration
terraform apply

# Test IdP
curl -k "https://keycloak:8443/realms/dive-v3-broker/broker/spain-external/login"
```

## References

- Keycloak SAML Documentation: https://www.keycloak.org/docs/latest/server_admin/#saml
- Terraform Keycloak Provider (Official): https://registry.terraform.io/providers/keycloak/keycloak/latest/docs
- SAML 2.0 Specification: http://docs.oasis-open.org/security/saml/v2.0/
- Provider Migration Report: `../../SAML-MODULE-MIGRATION-REPORT.md`


