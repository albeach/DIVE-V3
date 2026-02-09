storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}

api_addr      = "http://vault-seal:8200"
ui            = false
log_level     = "WARN"
disable_mlock = true
