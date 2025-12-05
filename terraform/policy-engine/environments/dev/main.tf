# =============================================================================
# Development Environment - Policy Engine
# =============================================================================
# This file can be used for environment-specific resources or overrides.
# The main configuration is in the parent directory.
#
# Usage:
#   cd terraform/policy-engine
#   terraform workspace select dev
#   terraform plan -var-file=environments/dev/terraform.tfvars
# =============================================================================

# This file is intentionally minimal.
# Environment-specific variables are in terraform.tfvars
# Main configuration is in ../main.tf

# Uncomment below for environment-specific resources:
#
# resource "null_resource" "dev_only" {
#   triggers = {
#     environment = "dev"
#   }
#   
#   provisioner "local-exec" {
#     command = "echo 'Development environment setup complete'"
#   }
# }





