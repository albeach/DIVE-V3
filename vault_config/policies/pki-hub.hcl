# Vault PKI Policy for DIVE V3 Hub (Operational)
# Scoped to: certificate issuance, CA reads, CRL management, revocation
# Applied by: ./dive vault pki-setup
# NOTE: Initial PKI setup (CA generation, role creation) uses the root token,
# not this policy. This policy governs day-to-day certificate operations.

# --- Root CA (read-only) ---

# Read Root CA certificate (for trust chain distribution)
path "pki/cert/ca" {
  capabilities = ["read"]
}

# Read Root CA CRL
path "pki/crl" {
  capabilities = ["read"]
}

# --- Intermediate CA (operational) ---

# Issue certificates via hub-services role
path "pki_int/issue/hub-services" {
  capabilities = ["create", "update"]
}

# Read CA chain (for trust distribution)
path "pki_int/cert/ca" {
  capabilities = ["read"]
}

path "pki_int/cert/ca_chain" {
  capabilities = ["read"]
}

# Read Intermediate CA CRL
path "pki_int/crl" {
  capabilities = ["read"]
}

# Rotate CRL (needed after revocation)
path "pki_int/crl/rotate" {
  capabilities = ["create", "update"]
}

# Revoke certificates (Phase 2 preparation)
path "pki_int/revoke" {
  capabilities = ["create", "update"]
}

# Read issued certificate details (for revocation by serial)
path "pki_int/cert/*" {
  capabilities = ["read"]
}

# List issued certificates (for monitoring/audit)
path "pki_int/certs" {
  capabilities = ["list"]
}
