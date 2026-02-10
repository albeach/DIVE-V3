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

# PKI certificate authority management
path "pki/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

path "pki_int/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Database secrets engine management
path "database/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Lease management (for dynamic database credentials)
path "sys/leases/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
