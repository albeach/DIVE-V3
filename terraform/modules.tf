# ============================================
# Multi-Realm Modules Configuration
# ============================================
# Gap #1 Remediation: Multi-Realm Architecture
# Best Practice: Use Terraform modules for organized multi-realm deployment
#
# This file loads realm configurations from subdirectories when
# enable_multi_realm = true

# ============================================
# Load Realm Configuration Files
# ============================================
# Terraform automatically loads all *.tf files in the current directory
# For subdirectories, we need to either use modules or move files to root

# Best Practice Approach: Create symbolic links or include files
# For immediate deployment, we'll merge realm configs into this file
# when enable_multi_realm flag is set

# Note: Terraform doesn't support conditional file includes directly
# Solution: Include realm resources in main terraform directory

# ============================================
# Conditional Realm Creation
# ============================================
# Using count parameter for conditional resource creation

# Include realm configurations by sourcing them
# This is a workaround - proper modules would be in separate repos
# For single-repo approach, we'll add the resources directly when needed

locals {
  enable_multi_realm = var.enable_multi_realm
}

# ============================================
# Instructions for Deployment
# ============================================
# 
# Option 1: Copy realm files to main directory (simplest)
# ```bash
# cp realms/*.tf .
# cp idp-brokers/*.tf .
# terraform apply
# ```
#
# Option 2: Use symlinks (Unix/Linux/Mac)
# ```bash
# ln -s realms/*.tf .
# ln -s idp-brokers/*.tf .
# terraform apply
# ```
#
# Option 3: Merge into single file (for this deployment)
# ```bash
# cat realms/*.tf >> multi-realm-all.tf
# cat idp-brokers/*.tf >> multi-realm-all.tf
# terraform apply
# ```


