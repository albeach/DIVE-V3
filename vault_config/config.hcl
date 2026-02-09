# HashiCorp Vault 1.21 Configuration for DIVE V3
# Storage: Integrated storage (Raft) for single-node deployment

storage "raft" {
  path    = "/vault/data"
  node_id = "dive-hub-vault"
}

listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_disable   = 1  # Development mode; enable TLS in production
}

api_addr = "http://dive-hub-vault:8200"
cluster_addr = "http://dive-hub-vault:8201"
ui = true
log_level = "INFO"

# Disable mlock for development (not recommended for production)
disable_mlock = true

# Audit logging - file-based audit trail for all Vault operations
# Enabled via CLI: vault audit enable file file_path=/vault/logs/audit.log
# The log directory is mounted as a Docker volume for persistence

# Auto-unseal with GCP Cloud KMS (optional for production)
# Uncomment and configure for production deployments
# seal "gcpckms" {
#   project     = "dive25"
#   region      = "us-central1"
#   key_ring    = "dive-v3-vault"
#   crypto_key  = "unseal-key"
# }
