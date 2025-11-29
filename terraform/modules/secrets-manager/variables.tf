# ============================================================================
# DIVE V3 - GCP Secret Manager Module - Variables
# ============================================================================

variable "project_id" {
  description = "GCP project ID for Secret Manager"
  type        = string
  default     = "dive25"
}

variable "instances" {
  description = "Map of DIVE V3 instances"
  type = map(object({
    name    = string
    type    = string  # "local" or "remote"
    idp_url = string
  }))
  default = {
    usa = {
      name    = "United States"
      type    = "local"
      idp_url = "https://usa-idp.dive25.com"
    }
    fra = {
      name    = "France"
      type    = "local"
      idp_url = "https://fra-idp.dive25.com"
    }
    gbr = {
      name    = "United Kingdom"
      type    = "local"
      idp_url = "https://gbr-idp.dive25.com"
    }
    deu = {
      name    = "Germany"
      type    = "remote"
      idp_url = "https://deu-idp.prosecurity.biz"
    }
  }
}

variable "federation_matrix" {
  description = "Federation trust matrix - which instances federate with which"
  type        = map(list(string))
  default = {
    usa = ["fra", "gbr", "deu"]
    fra = ["usa", "gbr", "deu"]
    gbr = ["usa", "fra", "deu"]
    deu = ["usa", "fra", "gbr"]
  }
}

variable "replication_locations" {
  description = "GCP regions for secret replication"
  type        = list(string)
  default     = ["us-east4", "us-west1"]
}

variable "notification_topic" {
  description = "Pub/Sub topic for secret change notifications (optional)"
  type        = string
  default     = null
}

variable "enable_workload_identity" {
  description = "Enable Workload Identity for GKE/Cloud Run integration"
  type        = bool
  default     = false
}

variable "workload_identity_namespace" {
  description = "Kubernetes namespace for Workload Identity binding"
  type        = string
  default     = "dive-v3"
}

variable "labels" {
  description = "Additional labels to apply to all resources"
  type        = map(string)
  default = {
    environment = "pilot"
    managed_by  = "terraform"
  }
}

