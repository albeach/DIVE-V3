# =============================================================================
# DIVE V3 — AWS Dev Environment
# =============================================================================
# Provisions the complete dev environment:
#   - VPC with public + private subnets
#   - Hub EC2 instance (t3.xlarge)
#   - Spoke EC2 instances (one per configured country)
#   - Provider-agnostic: uses Vault for secrets, builds from source
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }

  backend "s3" {
    bucket         = "dive-v3-tfstate"
    key            = "dev/terraform.tfstate"
    region         = "us-gov-east-1"
    encrypt        = true
    dynamodb_table = "dive-v3-tflock"
  }
}

provider "aws" {
  region = var.aws_region
}

# =============================================================================
# NETWORKING
# =============================================================================

module "vpc" {
  source = "../modules/aws-vpc"

  environment        = "dev"
  vpc_cidr           = "10.1.0.0/16"
  az_count           = 2
  enable_nat_gateway = var.enable_nat_gateway
  ssh_cidr_blocks    = var.ssh_cidr_blocks
}

# =============================================================================
# HUB INSTANCE
# =============================================================================

module "hub" {
  source = "../modules/aws-ec2"

  instance_name         = "dive-dev-hub"
  environment           = "dev"
  role                  = "hub"
  instance_type         = var.hub_instance_type
  key_pair_name         = var.key_pair_name
  subnet_id             = module.vpc.public_subnet_ids[0]
  security_group_ids    = [module.vpc.hub_security_group_id]
  volume_size           = var.hub_volume_size
  assign_elastic_ip     = true
  bootstrap_repo = "https://github.com/albeach/DIVE-V3.git"
}

# =============================================================================
# SPOKE INSTANCES
# =============================================================================

locals {
  # Map spoke codes to their list index for stable subnet distribution
  spoke_index = { for i, code in var.spoke_codes : code => i }
}

module "spokes" {
  source   = "../modules/aws-ec2"
  for_each = local.spoke_index

  instance_name         = "dive-dev-spoke-${lower(each.key)}"
  environment           = "dev"
  role                  = "spoke"
  spoke_code            = upper(each.key)
  instance_type         = var.spoke_instance_type
  key_pair_name         = var.key_pair_name
  subnet_id             = module.vpc.public_subnet_ids[each.value % length(module.vpc.public_subnet_ids)]
  security_group_ids    = [module.vpc.spoke_security_group_id]
  volume_size           = var.spoke_volume_size
  assign_elastic_ip     = true
  bootstrap_repo = "https://github.com/albeach/DIVE-V3.git"
}
