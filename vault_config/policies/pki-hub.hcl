# Vault PKI Policy for DIVE V3 Hub
# Allows: Root CA + Intermediate CA management, certificate issuance, role management
# Applied by: ./dive vault pki-setup

# Root CA management (one-time setup)
path "pki/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

# Intermediate CA management + certificate issuance
path "pki_int/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
