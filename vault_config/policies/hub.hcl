# Vault Policy for DIVE V3 Hub
# Full administrative access to all secret paths

path "dive-v3/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "sys/mounts" {
  capabilities = ["read", "list"]
}

path "sys/mounts/*" {
  capabilities = ["create", "read", "update", "delete"]
}

path "auth/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# PKI certificate authority (read-only — setup uses root token)
path "pki/cert/ca" {
  capabilities = ["read"]
}

path "pki/crl" {
  capabilities = ["read"]
}

# PKI Intermediate CA (certificate issuance + revocation)
path "pki_int/issue/*" {
  capabilities = ["create", "update"]
}

path "pki_int/cert/*" {
  capabilities = ["read"]
}

path "pki_int/cert/ca_chain" {
  capabilities = ["read"]
}

path "pki_int/certs" {
  capabilities = ["list"]
}

path "pki_int/crl" {
  capabilities = ["read"]
}

path "pki_int/crl/rotate" {
  capabilities = ["create", "update"]
}

path "pki_int/revoke" {
  capabilities = ["create", "update"]
}

path "pki_int/roles/*" {
  capabilities = ["create", "read", "update", "list"]
}

path "pki_int/config/urls" {
  capabilities = ["create", "read", "update"]
}

# Transit encryption engine (credential encryption at rest)
path "transit/encrypt/*" {
  capabilities = ["create", "update"]
}

path "transit/decrypt/*" {
  capabilities = ["create", "update"]
}

path "transit/keys/*" {
  capabilities = ["read", "list"]
}

# Database secrets engine management
path "database/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Lease management (for dynamic database credentials)
path "sys/leases/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
