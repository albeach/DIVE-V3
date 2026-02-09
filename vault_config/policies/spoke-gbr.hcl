# Vault Policy for DIVE V3 Spoke: GBR
# Instance-specific read/write + shared secrets read-only

# Own instance secrets (read/write)
path "dive-v3/core/data/gbr/*" {
  capabilities = ["read", "update", "list"]
}

path "dive-v3/auth/data/gbr/*" {
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
path "dive-v3/federation/data/gbr-*" {
  capabilities = ["read", "list"]
}

path "dive-v3/federation/data/*-gbr" {
  capabilities = ["read", "list"]
}

# OPAL tokens (read-only)
path "dive-v3/opal/data/*" {
  capabilities = ["read"]
}
