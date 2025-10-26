#!/bin/bash
# =============================================================================
# Terraform v1.13.4 Installation Script for Ubuntu AMD64
# =============================================================================
# DIVE V3 - Coalition ICAM Pilot
# Purpose: Install Terraform v1.13.4 on Ubuntu 22.04+ AMD64 systems
# Date: October 26, 2025
# =============================================================================

set -e  # Exit on error

TERRAFORM_VERSION="1.13.4"
PLATFORM="linux_amd64"
DOWNLOAD_URL="https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_${PLATFORM}.zip"
INSTALL_DIR="/usr/local/bin"

echo "========================================"
echo "Terraform v${TERRAFORM_VERSION} Installation"
echo "Platform: ${PLATFORM}"
echo "========================================"
echo ""

# 1. Check if running on Linux
if [[ "$(uname -s)" != "Linux" ]]; then
    echo "❌ ERROR: This script is for Linux systems only."
    echo "   Detected: $(uname -s)"
    exit 1
fi

# 2. Check for required commands
for cmd in wget unzip sudo; do
    if ! command -v "$cmd" &> /dev/null; then
        echo "❌ ERROR: Required command '$cmd' not found."
        echo "   Install it with: sudo apt-get install $cmd"
        exit 1
    fi
done

# 3. Backup current Terraform state (if in terraform directory)
if [[ -f "terraform.tfstate" ]]; then
    echo "📦 Backing up Terraform state..."
    BACKUP_FILE="terraform.tfstate.backup-$(date +%Y%m%d-%H%M%S)"
    cp terraform.tfstate "$BACKUP_FILE"
    echo "✅ State backed up to: $BACKUP_FILE"
    echo ""
    
    if [[ -f ".terraform.lock.hcl" ]]; then
        LOCK_BACKUP="terraform.lock.hcl.backup-$(date +%Y%m%d-%H%M%S)"
        cp .terraform.lock.hcl "$LOCK_BACKUP"
        echo "✅ Lock file backed up to: $LOCK_BACKUP"
        echo ""
    fi
fi

# 4. Check existing Terraform version
if command -v terraform &> /dev/null; then
    CURRENT_VERSION=$(terraform version -json 2>/dev/null | grep -o '"terraform_version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
    echo "📌 Current Terraform version: $CURRENT_VERSION"
    echo ""
fi

# 5. Download Terraform
echo "⬇️  Downloading Terraform v${TERRAFORM_VERSION}..."
cd /tmp
rm -f terraform_${TERRAFORM_VERSION}_${PLATFORM}.zip terraform
wget -q --show-progress "$DOWNLOAD_URL"
echo "✅ Download complete"
echo ""

# 6. Extract binary
echo "📦 Extracting binary..."
unzip -o "terraform_${TERRAFORM_VERSION}_${PLATFORM}.zip"
chmod +x terraform
echo "✅ Binary extracted"
echo ""

# 7. Verify binary
echo "🔍 Verifying binary..."
./terraform version
echo ""

# 8. Install to system
echo "📥 Installing to ${INSTALL_DIR}..."
sudo mv terraform "${INSTALL_DIR}/terraform"
echo "✅ Installed successfully"
echo ""

# 9. Clean up
echo "🧹 Cleaning up..."
rm -f "terraform_${TERRAFORM_VERSION}_${PLATFORM}.zip"
echo "✅ Cleanup complete"
echo ""

# 10. Verify installation
echo "✅ Verifying installation..."
terraform version
echo ""

# 11. Post-installation instructions
echo "========================================"
echo "✅ Terraform v${TERRAFORM_VERSION} installed successfully!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Navigate to your Terraform directory:"
echo "   cd /path/to/terraform"
echo ""
echo "2. Update version constraints in configuration files:"
echo "   - terraform/main.tf: required_version = \">= 1.13.4\""
echo "   - terraform/modules/realm-mfa/versions.tf: required_version = \">= 1.13.4\""
echo ""
echo "3. Initialize Terraform with new version:"
echo "   terraform init -upgrade"
echo ""
echo "4. Validate configuration:"
echo "   terraform validate"
echo ""
echo "5. Review plan:"
echo "   terraform plan"
echo ""
echo "For detailed instructions, see: TERRAFORM-UPGRADE-GUIDE.md"
echo ""

