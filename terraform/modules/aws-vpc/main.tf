# =============================================================================
# DIVE V3 — AWS VPC Module
# =============================================================================
# Creates a dedicated VPC for a DIVE environment with:
#   - Public subnet (hub frontend, Keycloak, ALB)
#   - Private subnet (databases, backend services)
#   - NAT gateway for private subnet outbound
#   - Internet gateway for public subnet
#   - Security groups for hub and spoke roles
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

data "aws_availability_zones" "available" {
  state = "available"
}

# =============================================================================
# VPC
# =============================================================================

resource "aws_vpc" "dive" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(var.tags, {
    Name        = "dive-${var.environment}-vpc"
    Project     = "DIVE-V3"
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

# =============================================================================
# SUBNETS
# =============================================================================

# Public subnets (one per AZ for HA)
resource "aws_subnet" "public" {
  count                   = min(length(data.aws_availability_zones.available.names), var.az_count)
  vpc_id                  = aws_vpc.dive.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name        = "dive-${var.environment}-public-${count.index}"
    Project     = "DIVE-V3"
    Environment = var.environment
    Tier        = "public"
  })
}

# Private subnets (one per AZ)
resource "aws_subnet" "private" {
  count             = min(length(data.aws_availability_zones.available.names), var.az_count)
  vpc_id            = aws_vpc.dive.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + var.az_count)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(var.tags, {
    Name        = "dive-${var.environment}-private-${count.index}"
    Project     = "DIVE-V3"
    Environment = var.environment
    Tier        = "private"
  })
}

# =============================================================================
# INTERNET GATEWAY (for public subnets)
# =============================================================================

resource "aws_internet_gateway" "dive" {
  vpc_id = aws_vpc.dive.id

  tags = merge(var.tags, {
    Name        = "dive-${var.environment}-igw"
    Project     = "DIVE-V3"
    Environment = var.environment
  })
}

# =============================================================================
# NAT GATEWAY (for private subnet outbound)
# =============================================================================

resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? 1 : 0
  domain = "vpc"

  tags = merge(var.tags, {
    Name        = "dive-${var.environment}-nat-eip"
    Project     = "DIVE-V3"
    Environment = var.environment
  })
}

resource "aws_nat_gateway" "dive" {
  count         = var.enable_nat_gateway ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id

  tags = merge(var.tags, {
    Name        = "dive-${var.environment}-nat"
    Project     = "DIVE-V3"
    Environment = var.environment
  })

  depends_on = [aws_internet_gateway.dive]
}

# =============================================================================
# ROUTE TABLES
# =============================================================================

# Public route table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.dive.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.dive.id
  }

  tags = merge(var.tags, {
    Name        = "dive-${var.environment}-public-rt"
    Project     = "DIVE-V3"
    Environment = var.environment
  })
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private route table
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.dive.id

  dynamic "route" {
    for_each = var.enable_nat_gateway ? [1] : []
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = aws_nat_gateway.dive[0].id
    }
  }

  tags = merge(var.tags, {
    Name        = "dive-${var.environment}-private-rt"
    Project     = "DIVE-V3"
    Environment = var.environment
  })
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# =============================================================================
# SECURITY GROUPS
# =============================================================================

# Hub security group
resource "aws_security_group" "hub" {
  name_prefix = "dive-${var.environment}-hub-"
  description = "DIVE V3 ${var.environment} hub services"
  vpc_id      = aws_vpc.dive.id

  # SSH
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_cidr_blocks
    description = "SSH access"
  }

  # Frontend
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Frontend (HTTPS)"
  }

  # Backend API
  ingress {
    from_port   = 4000
    to_port     = 4000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Backend API (HTTPS)"
  }

  # Keycloak
  ingress {
    from_port   = 8443
    to_port     = 8443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Keycloak (HTTPS)"
  }

  # Keycloak HTTP (redirect)
  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Keycloak (HTTP redirect)"
  }

  # OPAL Server
  ingress {
    from_port   = 7002
    to_port     = 7002
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "OPAL Server (internal)"
  }

  # Vault
  ingress {
    from_port   = 8200
    to_port     = 8204
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "Vault cluster (internal)"
  }

  # OPA
  ingress {
    from_port   = 8181
    to_port     = 8181
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "OPA (internal)"
  }

  # KAS
  ingress {
    from_port   = 8085
    to_port     = 8085
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "KAS (internal)"
  }

  # Keycloak management
  ingress {
    from_port   = 9000
    to_port     = 9000
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "Keycloak management (internal)"
  }

  # All traffic within security group
  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
    description = "Intra-group traffic"
  }

  # All outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound"
  }

  tags = merge(var.tags, {
    Name        = "dive-${var.environment}-hub-sg"
    Project     = "DIVE-V3"
    Environment = var.environment
    Role        = "hub"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# Spoke security group
resource "aws_security_group" "spoke" {
  name_prefix = "dive-${var.environment}-spoke-"
  description = "DIVE V3 ${var.environment} spoke services"
  vpc_id      = aws_vpc.dive.id

  # SSH
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_cidr_blocks
    description = "SSH access"
  }

  # Frontend
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Spoke Frontend (HTTPS)"
  }

  # Backend API
  ingress {
    from_port   = 4000
    to_port     = 4000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Spoke Backend (HTTPS)"
  }

  # Keycloak
  ingress {
    from_port   = 8443
    to_port     = 8443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Spoke Keycloak (HTTPS)"
  }

  # Keycloak HTTP
  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Spoke Keycloak (HTTP)"
  }

  # OPA
  ingress {
    from_port   = 8181
    to_port     = 8181
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "OPA (internal)"
  }

  # KAS
  ingress {
    from_port   = 8085
    to_port     = 8085
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "KAS (internal)"
  }

  # Allow hub SG to reach spoke services (federation)
  ingress {
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    security_groups = [aws_security_group.hub.id]
    description     = "Hub to spoke federation"
  }

  # All traffic within spoke SG
  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
    description = "Intra-group traffic"
  }

  # All outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound"
  }

  tags = merge(var.tags, {
    Name        = "dive-${var.environment}-spoke-sg"
    Project     = "DIVE-V3"
    Environment = var.environment
    Role        = "spoke"
  })

  lifecycle {
    create_before_destroy = true
  }
}
