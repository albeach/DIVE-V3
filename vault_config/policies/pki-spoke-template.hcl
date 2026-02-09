# Vault PKI Policy for DIVE V3 Spoke: {{SPOKE_CODE}}
# Generated dynamically from template by: ./dive vault provision <CODE>
# Allows: Issue own certificates only, read CA chain

# Issue certificates using spoke-specific role only
path "pki_int/issue/spoke-{{SPOKE_CODE}}-services" {
  capabilities = ["create", "update"]
}

# Read CA chain for trust distribution
path "pki/cert/ca" {
  capabilities = ["read"]
}

path "pki_int/cert/ca_chain" {
  capabilities = ["read"]
}
