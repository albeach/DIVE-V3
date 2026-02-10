# Vault Policy for DIVE V3 Spoke: {{SPOKE_CODE}}
# Generated dynamically from template by: ./dive vault provision <CODE>
# Instance-specific read/write + shared secrets read-only

# Own instance secrets (read/write)
path "dive-v3/core/data/{{SPOKE_CODE}}/*" {
  capabilities = ["read", "update", "list"]
}

path "dive-v3/auth/data/{{SPOKE_CODE}}/*" {
  capabilities = ["read", "update", "list"]
}

# Shared secrets (read-only)
path "dive-v3/core/data/shared/*" {
  capabilities = ["read", "list"]
}

path "dive-v3/auth/data/shared/*" {
  capabilities = ["read", "list"]
}

# Federation secrets involving this spoke
path "dive-v3/federation/data/{{SPOKE_CODE}}-*" {
  capabilities = ["read", "list"]
}

path "dive-v3/federation/data/*-{{SPOKE_CODE}}" {
  capabilities = ["read", "list"]
}

# OPAL tokens (read-only)
path "dive-v3/opal/data/*" {
  capabilities = ["read"]
}

# PKI certificate issuance (own spoke only)
path "pki_int/issue/spoke-{{SPOKE_CODE}}-services" {
  capabilities = ["create", "update"]
}

# CA chain (read-only, for trust distribution)
path "pki/cert/ca" {
  capabilities = ["read"]
}

path "pki_int/cert/ca_chain" {
  capabilities = ["read"]
}

# Database dynamic credentials (own spoke only)
path "database/creds/backend-{{SPOKE_CODE}}-rw" {
  capabilities = ["read"]
}

path "database/creds/kas-{{SPOKE_CODE}}-ro" {
  capabilities = ["read"]
}

# Database static credentials (own spoke only)
path "database/static-creds/keycloak-{{SPOKE_CODE}}" {
  capabilities = ["read"]
}

path "database/static-creds/nextauth-{{SPOKE_CODE}}" {
  capabilities = ["read"]
}

# Lease renewal (for dynamic database credentials)
path "sys/leases/renew" {
  capabilities = ["update"]
}
