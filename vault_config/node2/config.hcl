storage "raft" {
  path    = "/vault/data"
  node_id = "vault-2"

  retry_join {
    leader_api_addr = "http://vault-1:8200"
  }
  retry_join {
    leader_api_addr = "http://vault-3:8200"
  }
}

seal "transit" {
  address         = "http://vault-seal:8200"
  token           = "env://VAULT_TRANSIT_SEAL_TOKEN"
  disable_renewal = "false"
  key_name        = "autounseal"
  mount_path      = "transit/"
  tls_skip_verify = "true"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1

  telemetry {
    unauthenticated_metrics_access = true
  }
}

telemetry {
  prometheus_retention_time = "30s"
  disable_hostname         = true
}

api_addr      = "http://vault-2:8200"
cluster_addr  = "http://vault-2:8201"
ui            = true
log_level     = "INFO"
disable_mlock = true
