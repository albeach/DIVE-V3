# =============================================================================
# DIVE V3 — AWS VPC Module Outputs
# =============================================================================

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.dive.id
}

output "vpc_cidr" {
  description = "VPC CIDR block"
  value       = aws_vpc.dive.cidr_block
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "hub_security_group_id" {
  description = "Security group ID for hub instances"
  value       = aws_security_group.hub.id
}

output "spoke_security_group_id" {
  description = "Security group ID for spoke instances"
  value       = aws_security_group.spoke.id
}

output "internet_gateway_id" {
  description = "Internet gateway ID"
  value       = aws_internet_gateway.dive.id
}

output "nat_gateway_id" {
  description = "NAT gateway ID (empty if disabled)"
  value       = var.enable_nat_gateway ? aws_nat_gateway.dive[0].id : ""
}
