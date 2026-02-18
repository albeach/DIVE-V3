# =============================================================================
# DIVE V3 — AWS Dev Environment Variables
# =============================================================================

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-gov-east-1"
}

variable "key_pair_name" {
  description = "EC2 SSH key pair name"
  type        = string
  default     = "ABeach-SSH-Key"
}

variable "hub_instance_type" {
  description = "EC2 instance type for hub"
  type        = string
  default     = "t3.xlarge"
}

variable "hub_volume_size" {
  description = "Hub root volume size in GB"
  type        = number
  default     = 100
}

variable "spoke_instance_type" {
  description = "EC2 instance type for spokes"
  type        = string
  default     = "t3.large"
}

variable "spoke_volume_size" {
  description = "Spoke root volume size in GB"
  type        = number
  default     = 80
}

variable "spoke_codes" {
  description = "List of spoke country codes to deploy"
  type        = list(string)
  default     = ["GBR", "FRA"]
}

variable "enable_nat_gateway" {
  description = "Enable NAT gateway (adds cost)"
  type        = bool
  default     = false
}

variable "ssh_cidr_blocks" {
  description = "CIDR blocks allowed for SSH"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
