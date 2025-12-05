# =============================================================================
# DIVE V3 Infrastructure Variables
# =============================================================================

variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "dive25"
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-east4"
}

variable "cluster_name" {
  description = "GKE Cluster Name"
  type        = string
  default     = "dive-v3-cluster"
}

variable "network_name" {
  description = "VPC Network Name"
  type        = string
  default     = "dive-v3-network"
}

variable "subnet_name" {
  description = "Subnet Name"
  type        = string
  default     = "dive-v3-subnet"
}

variable "subnet_cidr" {
  description = "Subnet CIDR"
  type        = string
  default     = "10.0.0.0/16"
}

variable "enable_private_cluster" {
  description = "Enable private GKE cluster"
  type        = bool
  default     = true
}

variable "enable_workload_identity" {
  description = "Enable Workload Identity for GCP Secret Manager access"
  type        = bool
  default     = true
}



