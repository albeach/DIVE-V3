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
