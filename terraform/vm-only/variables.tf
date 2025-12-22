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

variable "vm_name" {
  description = "VM instance name"
  type        = string
  default     = "dive-v3-pilot"
}

variable "zone" {
  description = "GCP Zone"
  type        = string
  default     = "us-east4-c"
}

variable "machine_type" {
  description = "GCP Machine type"
  type        = string
  default     = "e2-standard-4"
}

variable "environment" {
  description = "Environment label"
  type        = string
  default     = "pilot"
}

variable "service_account_email" {
  description = "Service account email for VM"
  type        = string
  default     = "terraform-deployer@dive25.iam.gserviceaccount.com"
}
