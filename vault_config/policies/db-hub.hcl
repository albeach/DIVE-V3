# =============================================================================
# DIVE V3 Hub - Database Dynamic Credentials Policy
# =============================================================================
# Service-level policy for hub services to read database credentials.
# Applied alongside the main hub.hcl policy.
# =============================================================================

# PostgreSQL static credentials (Vault rotates password on schedule)
path "database/static-creds/keycloak-hub" {
  capabilities = ["read"]
}

path "database/static-creds/nextauth-hub" {
  capabilities = ["read"]
}

# MongoDB dynamic credentials (Vault creates ephemeral users)
path "database/creds/backend-hub-rw" {
  capabilities = ["read"]
}

path "database/creds/kas-hub-ro" {
  capabilities = ["read"]
}

# Lease renewal (required for dynamic credentials)
path "sys/leases/renew" {
  capabilities = ["update"]
}
