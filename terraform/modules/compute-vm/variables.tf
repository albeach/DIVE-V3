# =============================================================================
# DIVE V3 - Compute VM Module Variables
# =============================================================================

# -----------------------------------------------------------------------------
# Required Variables
# -----------------------------------------------------------------------------

variable "name" {
  description = "Name of the VM instance"
  type        = string
}

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "zone" {
  description = "GCP Zone for the VM"
  type        = string
}

# -----------------------------------------------------------------------------
# VM Configuration
# -----------------------------------------------------------------------------

variable "machine_type" {
  description = "Machine type for the VM (e.g., e2-standard-4)"
  type        = string
  default     = "e2-standard-4"
}

variable "disk_size_gb" {
  description = "Boot disk size in GB"
  type        = number
  default     = 100
}

variable "disk_type" {
  description = "Boot disk type (pd-standard, pd-ssd, pd-balanced)"
  type        = string
  default     = "pd-ssd"
}

variable "disk_encryption_key_raw" {
  description = "Base64-encoded 256-bit customer-supplied encryption key (CSEK) for the boot disk"
  type        = string
  default     = null
  sensitive   = true
}

variable "environment" {
  description = "Environment label (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "labels" {
  description = "Additional labels to apply to the VM"
  type        = map(string)
  default     = {}
}

# -----------------------------------------------------------------------------
# Network Configuration
# -----------------------------------------------------------------------------

variable "network" {
  description = "VPC network name"
  type        = string
  default     = "default"
}

variable "subnetwork" {
  description = "VPC subnetwork (optional)"
  type        = string
  default     = null
}

variable "static_ip" {
  description = "Static external IP address (optional)"
  type        = string
  default     = null
}

variable "network_tags" {
  description = "Network tags for firewall rules"
  type        = list(string)
  default     = ["dive-v3", "docker-host"]
}

variable "allowed_ports" {
  description = "Ports to allow for DIVE V3 services"
  type        = list(string)
  default = [
    "80",   # HTTP redirect
    "443",  # HTTPS
    "3000", # Frontend (USA)
    "3001", # Frontend (alternate spoke ports)
    "3002",
    "3003",
    "3004",
    "4000", # Backend (USA)
    "4001", # Backend (alternate spoke ports)
    "4002",
    "4003",
    "4004",
    "7002", # OPAL Server
    "8080", # Keycloak HTTP
    "8443", # Keycloak HTTPS (USA)
    "8444", # Keycloak HTTPS (spoke ports)
    "8445",
    "8446",
    "8447",
  ]
}

variable "allowed_source_ranges" {
  description = "CIDR ranges allowed to access services"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "ssh_allowed_ranges" {
  description = "CIDR ranges allowed SSH access (use IAP range for secure access)"
  type        = list(string)
  default     = ["35.235.240.0/20"] # Google IAP range
}

variable "create_firewall_rules" {
  description = "Whether to create firewall rules"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# SSH Configuration
# -----------------------------------------------------------------------------

variable "ssh_user" {
  description = "SSH username"
  type        = string
  default     = "ubuntu"
}

variable "ssh_public_key" {
  description = "SSH public key for access"
  type        = string
  default     = ""
}

variable "enable_os_login" {
  description = "Enable OS Login for SSH access"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Service Account
# -----------------------------------------------------------------------------

variable "service_account_email" {
  description = "Service account email for the VM"
  type        = string
  default     = null
}

variable "service_account_scopes" {
  description = "Service account scopes"
  type        = list(string)
  default = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/logging.write",
    "https://www.googleapis.com/auth/monitoring.write",
    "https://www.googleapis.com/auth/devstorage.read_write",
    "https://www.googleapis.com/auth/secretmanager.access",
  ]
}

# -----------------------------------------------------------------------------
# Startup Script
# -----------------------------------------------------------------------------

variable "custom_startup_script" {
  description = "Custom startup script (overrides default)"
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# Health Check
# -----------------------------------------------------------------------------

variable "create_health_check" {
  description = "Whether to create a health check resource"
  type        = bool
  default     = false
}

variable "health_check_port" {
  description = "Port for health check"
  type        = number
  default     = 4000
}

variable "health_check_path" {
  description = "Path for health check"
  type        = string
  default     = "/health"
}
