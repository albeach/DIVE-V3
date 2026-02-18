# =============================================================================
# DIVE V3 — AWS Staging Environment Outputs
# =============================================================================

output "vpc_id" {
  description = "Staging VPC ID"
  value       = module.vpc.vpc_id
}

output "hub_instance_id" {
  description = "Hub EC2 instance ID"
  value       = module.hub.instance_id
}

output "hub_public_ip" {
  description = "Hub public IP"
  value       = module.hub.public_ip
}

output "spoke_instance_ids" {
  description = "Spoke EC2 instance IDs"
  value       = { for code, spoke in module.spokes : code => spoke.instance_id }
}

output "spoke_public_ips" {
  description = "Spoke public IPs"
  value       = { for code, spoke in module.spokes : code => spoke.public_ip }
}

output "ssh_commands" {
  description = "SSH commands for all instances"
  value = merge(
    { hub = "ssh -i ~/.ssh/ABeach-SSH-Key.pem ec2-user@${module.hub.public_ip}" },
    { for code, spoke in module.spokes : "spoke-${lower(code)}" => "ssh -i ~/.ssh/ABeach-SSH-Key.pem ec2-user@${spoke.public_ip}" }
  )
}
