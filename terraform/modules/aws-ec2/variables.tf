# =============================================================================
# DIVE V3 — AWS EC2 Module Variables
# =============================================================================

variable "instance_name" {
  description = "Name tag for the EC2 instance (e.g., dive-dev-hub)"
  type        = string
}

variable "environment" {
  description = "Environment: dev or staging"
  type        = string
  validation {
    condition     = contains(["dev", "staging"], var.environment)
    error_message = "Environment must be 'dev' or 'staging'."
  }
}

variable "role" {
  description = "Instance role: hub or spoke"
  type        = string
  validation {
    condition     = contains(["hub", "spoke"], var.role)
    error_message = "Role must be 'hub' or 'spoke'."
  }
}

variable "spoke_code" {
  description = "Spoke country code (e.g., GBR). Empty for hub."
  type        = string
  default     = ""
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.xlarge"
}

variable "ami_id" {
  description = "Override AMI ID. Empty = latest Amazon Linux 2023."
  type        = string
  default     = ""
}

variable "key_pair_name" {
  description = "EC2 key pair name for SSH access"
  type        = string
}

variable "subnet_id" {
  description = "VPC subnet ID to launch the instance in"
  type        = string
}

variable "security_group_ids" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "iam_instance_profile" {
  description = "IAM instance profile name (for Secrets Manager / ECR access)"
  type        = string
  default     = ""
}

variable "volume_size" {
  description = "Root EBS volume size in GB"
  type        = number
  default     = 100
}

variable "volume_iops" {
  description = "gp3 IOPS (3000 default)"
  type        = number
  default     = 3000
}

variable "volume_throughput" {
  description = "gp3 throughput in MiB/s (125 default)"
  type        = number
  default     = 125
}

variable "assign_elastic_ip" {
  description = "Whether to assign an Elastic IP for stable addressing"
  type        = bool
  default     = false
}

variable "bootstrap_repo" {
  description = "Git repo URL to clone for bootstrap. Empty = no bootstrap."
  type        = string
  default     = ""
}

variable "bootstrap_branch" {
  description = "Git branch to clone for bootstrap"
  type        = string
  default     = "main"
}

variable "user_data" {
  description = "Raw user-data string (overrides bootstrap_repo)"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
