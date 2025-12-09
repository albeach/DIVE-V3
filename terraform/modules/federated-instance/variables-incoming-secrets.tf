# ============================================================================
# INCOMING FEDERATION CLIENT SECRETS
# ============================================================================
# These secrets are used by PARTNER instances when they federate TO this instance.
# 
# GCP Naming: dive-v3-federation-{this_instance}-{partner}
# Example: USA instance needs dive-v3-federation-usa-fra, dive-v3-federation-usa-gbr, etc.
#
# These are set via TF_VAR_incoming_federation_secrets or -var flags
# ============================================================================

variable "incoming_federation_secrets" {
  description = <<-EOT
    Map of client secrets for incoming federation clients.
    Key: partner instance code (lowercase)
    Value: client secret from GCP Secret Manager
    
    Example:
      incoming_federation_secrets = {
        fra = "secret-from-dive-v3-federation-usa-fra"
        gbr = "secret-from-dive-v3-federation-usa-gbr"
        deu = "secret-from-dive-v3-federation-usa-deu"
      }
    
    These secrets are what PARTNERS use when authenticating to THIS instance.
  EOT
  type        = map(string)
  default     = {}
  sensitive   = true
}









