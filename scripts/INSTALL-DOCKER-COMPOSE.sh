#!/bin/bash
#################################################################
# Quick Docker Compose Installation
# Purpose: Install Docker Compose for DIVE V3 deployment
#################################################################

set -e

echo "🔧 Installing Docker Compose..."

# Download Docker Compose (latest stable)
sudo curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Make executable
sudo chmod +x /usr/local/bin/docker-compose

# Create symlink for backwards compatibility
sudo ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

# Verify installation
docker-compose --version

echo "✅ Docker Compose installed successfully!"
echo ""
echo "Version: $(docker-compose --version)"

