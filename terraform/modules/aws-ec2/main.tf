# =============================================================================
# DIVE V3 — AWS EC2 Instance Module
# =============================================================================
# Provisions an EC2 instance for hub or spoke deployment.
#
# Features:
#   - Ubuntu 24.04 LTS (Noble) with gp3 EBS
#   - IMDSv2 enforced
#   - EBS encryption at rest
#   - User-data bootstrap script
#   - Security group per role
#   - Provider-agnostic: no IAM/ECR/CloudWatch dependencies
# =============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

# =============================================================================
# DATA SOURCES
# =============================================================================

# Latest Ubuntu 24.04 LTS (Noble) AMI
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["513442679011"] # Canonical in GovCloud

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

# =============================================================================
# EC2 INSTANCE
# =============================================================================

resource "aws_instance" "dive" {
  ami                    = var.ami_id != "" ? var.ami_id : data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_pair_name
  vpc_security_group_ids = var.security_group_ids
  subnet_id              = var.subnet_id
  iam_instance_profile   = var.iam_instance_profile != "" ? var.iam_instance_profile : null

  # EBS root volume
  root_block_device {
    volume_size           = var.volume_size
    volume_type           = "gp3"
    iops                  = var.volume_iops
    throughput            = var.volume_throughput
    encrypted             = true
    delete_on_termination = true
  }

  # IMDSv2 (required — no v1 for security)
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  # User data bootstrap (shim downloads and runs full script to avoid 16KB limit)
  user_data = var.user_data != "" ? var.user_data : (
    var.bootstrap_repo != "" ? <<-USERDATA
#!/bin/bash
set -euo pipefail
exec > /var/log/cloud-init-output.log 2>&1
echo "[BOOTSTRAP] Installing git..."
apt-get update -qq && apt-get install -y -qq git
echo "[BOOTSTRAP] Cloning repo..."
git clone --branch "${var.bootstrap_branch}" "${var.bootstrap_repo}" /opt/dive-v3
echo "[BOOTSTRAP] Running bootstrap script..."
chmod +x /opt/dive-v3/scripts/aws/bootstrap-ec2.sh
DIVE_DIR=/opt/dive-v3 /opt/dive-v3/scripts/aws/bootstrap-ec2.sh
USERDATA
    : null
  )
  user_data_replace_on_change = false

  tags = merge(var.tags, {
    Name        = var.instance_name
    Project     = "DIVE-V3"
    Environment = var.environment
    Role        = var.role
    SpokeCode   = var.spoke_code
    ManagedBy   = "terraform"
  })

  volume_tags = merge(var.tags, {
    Name        = "${var.instance_name}-root"
    Project     = "DIVE-V3"
    Environment = var.environment
  })

  lifecycle {
    ignore_changes = [ami, user_data]
  }
}

# Optional Elastic IP (for stable public IP)
resource "aws_eip" "dive" {
  count    = var.assign_elastic_ip ? 1 : 0
  instance = aws_instance.dive.id
  domain   = "vpc"

  tags = merge(var.tags, {
    Name        = "${var.instance_name}-eip"
    Project     = "DIVE-V3"
    Environment = var.environment
  })
}
