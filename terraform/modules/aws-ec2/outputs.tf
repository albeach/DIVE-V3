# =============================================================================
# DIVE V3 — AWS EC2 Module Outputs
# =============================================================================

output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.dive.id
}

output "private_ip" {
  description = "Private IP address"
  value       = aws_instance.dive.private_ip
}

output "public_ip" {
  description = "Public IP address (Elastic IP if assigned, otherwise instance IP)"
  value       = var.assign_elastic_ip ? aws_eip.dive[0].public_ip : aws_instance.dive.public_ip
}

output "public_dns" {
  description = "Public DNS name"
  value       = aws_instance.dive.public_dns
}

output "availability_zone" {
  description = "Availability zone"
  value       = aws_instance.dive.availability_zone
}
