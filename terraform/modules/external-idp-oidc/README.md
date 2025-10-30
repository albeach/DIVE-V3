# External OIDC IdP Terraform Module

This module automates the onboarding of external OIDC identity providers into the DIVE V3 Keycloak broker.

## Features

- ✅ Automated OIDC IdP configuration in Keycloak
- ✅ Support for OIDC Discovery (auto-configuration)
- ✅ Manual endpoint configuration support
- ✅ Standard claim mappers (uniqueID, email, country)
- ✅ Custom claim mapping support
- ✅ PKCE support (S256 and plain)
- ✅ JWT signature validation
- ✅ First broker login flow integration

## Usage

### Basic Example (with Discovery)

```hcl
module "usa_oidc_idp" {
  source = "./modules/external-idp-oidc"

  realm_id         = "dive-v3-broker"
  idp_alias        = "usa-external"
  idp_display_name = "U.S. Department of Defense"
  discovery_url    = "http://usa-oidc:8082/realms/us-dod/.well-known/openid-configuration"
  client_id        = "dive-v3-client"
  client_secret    = var.usa_client_secret
  country_code     = "USA"
}
```

### Advanced Example with Custom Claims

```hcl
module "usa_oidc_idp" {
  source = "./modules/external-idp-oidc"

  realm_id         = "dive-v3-broker"
  idp_alias        = "usa-external"
  idp_display_name = "U.S. Department of Defense"
  discovery_url    = "https://login.mil/realms/dod/.well-known/openid-configuration"
  client_id        = "dive-v3-production"
  client_secret    = var.usa_client_secret
  country_code     = "USA"

  # Security Configuration
  validate_signature = true
  use_jwks_url      = true
  pkce_enabled      = true
  pkce_method       = "S256"
  store_token       = false

  # Custom Claim Mappings
  claim_mappings = {
    clearance = {
      claim_name     = "clearance"
      user_attribute = "clearance"
      sync_mode      = "INHERIT"
    }
    coi = {
      claim_name     = "acpCOI"
      user_attribute = "acpCOI"
      sync_mode      = "INHERIT"
    }
    organization = {
      claim_name     = "organization"
      user_attribute = "organization"
      sync_mode      = "INHERIT"
    }
    rank = {
      claim_name     = "rank"
      user_attribute = "rank"
      sync_mode      = "INHERIT"
    }
  }

  # Scopes
  default_scopes = "openid profile email clearance organization"
}
```

### Manual Endpoint Configuration

```hcl
module "custom_oidc_idp" {
  source = "./modules/external-idp-oidc"

  realm_id          = "dive-v3-broker"
  idp_alias         = "custom-idp"
  idp_display_name  = "Custom OIDC Provider"
  
  # Manual endpoints (no discovery)
  authorization_url = "https://custom-idp.example.com/oauth2/authorize"
  token_url         = "https://custom-idp.example.com/oauth2/token"
  userinfo_url      = "https://custom-idp.example.com/oauth2/userinfo"
  jwks_url          = "https://custom-idp.example.com/oauth2/jwks"
  logout_url        = "https://custom-idp.example.com/oauth2/logout"
  issuer            = "https://custom-idp.example.com"
  
  client_id     = "dive-v3"
  client_secret = var.custom_client_secret
  country_code  = "GBR"
}
```

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| realm_id | Keycloak realm ID | `string` | `"dive-v3-broker"` | no |
| idp_alias | Unique alias for the IdP | `string` | n/a | yes |
| idp_display_name | Display name for the IdP | `string` | n/a | yes |
| discovery_url | OIDC Discovery URL | `string` | `""` | no |
| authorization_url | Authorization endpoint | `string` | `""` | no |
| token_url | Token endpoint | `string` | `""` | no |
| userinfo_url | UserInfo endpoint | `string` | `""` | no |
| jwks_url | JWKS endpoint | `string` | `""` | no |
| logout_url | Logout endpoint | `string` | `""` | no |
| issuer | Issuer URL | `string` | `""` | no |
| client_id | OAuth2/OIDC Client ID | `string` | n/a | yes |
| client_secret | OAuth2/OIDC Client Secret | `string` | n/a | yes |
| country_code | ISO 3166-1 alpha-3 code | `string` | n/a | yes |
| client_auth_method | Client auth method | `string` | `"client_secret_post"` | no |
| validate_signature | Validate JWT signature | `bool` | `true` | no |
| use_jwks_url | Use JWKS URL | `bool` | `true` | no |
| pkce_enabled | Enable PKCE | `bool` | `true` | no |
| pkce_method | PKCE method (S256/plain) | `string` | `"S256"` | no |
| enabled | Enable the IdP | `bool` | `true` | no |
| trust_email | Trust email from IdP | `bool` | `true` | no |
| store_token | Store IdP tokens | `bool` | `false` | no |
| default_scopes | Default OAuth scopes | `string` | `"openid profile email"` | no |
| claim_mappings | Custom claim mappings | `map(object)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| idp_alias | The alias of the created IdP |
| idp_internal_id | The internal ID of the created IdP |
| idp_redirect_uri | The redirect URI for external IdP configuration |
| claim_mappers | List of created claim mappers |
| idp_config_summary | Summary of IdP configuration |

## Claim Mapping

### Standard Mappings (Automatic)

The module automatically creates mappers for:
- `uniqueID` → `uniqueID`
- `email` → `email`
- `<country_code>` → `countryOfAffiliation` (hardcoded)

### Custom Mappings

Define custom claim mappings:

```hcl
claim_mappings = {
  clearance = {
    claim_name     = "clearance"
    user_attribute = "clearance"
    sync_mode      = "INHERIT"
  }
}
```

## OIDC Discovery

### Using Discovery (Recommended)

```hcl
discovery_url = "https://idp.example.com/.well-known/openid-configuration"
```

When `discovery_url` is provided, the module automatically fetches:
- Authorization endpoint
- Token endpoint
- UserInfo endpoint
- JWKS URI
- Logout endpoint
- Issuer

### Manual Configuration

If discovery is not available, provide endpoints manually:

```hcl
authorization_url = "https://idp.example.com/authorize"
token_url         = "https://idp.example.com/token"
# ... other endpoints
```

## PKCE Configuration

### Enable PKCE (Recommended)

```hcl
pkce_enabled = true
pkce_method  = "S256"  # More secure than "plain"
```

### Disable PKCE (Legacy IdPs)

```hcl
pkce_enabled = false
```

## Client Authentication Methods

Supported methods:
- `client_secret_post` (default, secure)
- `client_secret_basic` (HTTP Basic Auth)
- `client_secret_jwt` (JWT-based)
- `private_key_jwt` (Most secure, requires key pair)

## Security Best Practices

1. **Signature Validation**: Always use `validate_signature = true`
2. **PKCE**: Enable `pkce_enabled = true` with `pkce_method = "S256"`
3. **Token Storage**: Set `store_token = false` to prevent token leakage
4. **Email Trust**: Only set `trust_email = true` if external IdP is trusted
5. **Client Secret**: Store in secure vault (Terraform variables marked sensitive)
6. **JWKS**: Use `use_jwks_url = true` for automatic key rotation

## Testing

```bash
# Validate configuration
terraform validate

# Plan changes
terraform plan

# Apply configuration
terraform apply

# Test OIDC discovery
curl https://usa-oidc:8082/realms/us-dod/.well-known/openid-configuration

# Test IdP login
curl "https://keycloak:8443/realms/dive-v3-broker/broker/usa-external/login"
```

## Troubleshooting

### Discovery URL Not Reachable

**Error**: `Failed to fetch discovery document`

**Solution**: Verify network connectivity:
```bash
curl -v https://usa-oidc:8082/realms/us-dod/.well-known/openid-configuration
```

### Invalid Client Credentials

**Error**: `invalid_client`

**Solution**: Verify client ID and secret match external IdP configuration:
```bash
# Test token endpoint
curl -X POST https://idp/token \
  -d "client_id=dive-v3-client" \
  -d "client_secret=SECRET" \
  -d "grant_type=client_credentials"
```

### Claim Not Mapped

**Error**: Claim not appearing in Keycloak user

**Solution**: Verify claim is present in ID token:
```bash
# Decode ID token
echo "ID_TOKEN" | cut -d '.' -f 2 | base64 -d | jq '.'
```

## Examples

See `terraform/examples/usa-oidc-idp/` for complete examples.

## References

- Keycloak OIDC Documentation: https://www.keycloak.org/docs/latest/server_admin/#_oidc
- OpenID Connect Specification: https://openid.net/specs/openid-connect-core-1_0.html
- PKCE Specification: https://tools.ietf.org/html/rfc7636


