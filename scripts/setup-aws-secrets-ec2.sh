#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Quick Setup for AWS Secrets Manager on EC2
# =============================================================================
# Run this script on a fresh EC2 instance to setup AWS Secrets Manager
# =============================================================================

set -euo pipefail

echo "═══════════════════════════════════════════════════════════"
echo " DIVE V3 - AWS Secrets Manager Quick Setup"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if AWS CLI is installed
if ! command -v aws >/dev/null 2>&1; then
    echo "❌ AWS CLI not found. Installing..."
    
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        if [[ "$ID" == "amzn" ]]; then
            # Amazon Linux
            sudo yum install -y aws-cli
        elif [[ "$ID" == "ubuntu" ]] || [[ "$ID" == "debian" ]]; then
            # Ubuntu/Debian
            sudo apt-get update
            sudo apt-get install -y awscli
        else
            echo "⚠️  Unknown OS. Please install AWS CLI manually:"
            echo "   https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
            exit 1
        fi
    fi
fi

echo "✓ AWS CLI installed"

# Check authentication
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    echo ""
    echo "❌ AWS not authenticated"
    echo ""
    echo "Options:"
    echo "  1. Use IAM Instance Role (Recommended for EC2)"
    echo "     - Attach an IAM role to this EC2 instance with Secrets Manager permissions"
    echo "     - Role policy must include: secretsmanager:GetSecretValue, CreateSecret, UpdateSecret"
    echo ""
    echo "  2. Configure AWS Credentials"
    echo "     Run: aws configure"
    echo ""
    exit 1
fi

echo "✓ AWS authenticated"

# Get AWS account info
AWS_ACCOUNT=$(aws sts get-caller-identity --query 'Account' --output text)
AWS_REGION=$(aws configure get region || echo "us-east-1")

echo ""
echo "AWS Configuration:"
echo "  Account: $AWS_ACCOUNT"
echo "  Region:  $AWS_REGION"
echo ""

# Check if secrets exist
echo "Checking for existing DIVE V3 secrets..."
SECRET_COUNT=$(aws secretsmanager list-secrets \
    --region "$AWS_REGION" \
    --query "length(SecretList[?starts_with(Name, 'dive-v3')])" \
    --output text)

echo "✓ Found $SECRET_COUNT existing DIVE V3 secrets"
echo ""

# Set environment variables
echo "Setting environment variables..."

cat >> ~/.bashrc << 'EOF'

# DIVE V3 AWS Secrets Manager Configuration
export SECRETS_PROVIDER=aws
export AWS_REGION=us-east-1
export USE_AWS_SECRETS=true
export USE_GCP_SECRETS=false
EOF

# Also set for current session
export SECRETS_PROVIDER=aws
export AWS_REGION=us-east-1
export USE_AWS_SECRETS=true
export USE_GCP_SECRETS=false

echo "✓ Environment variables configured"
echo ""

# Test access to secrets
if [ "$SECRET_COUNT" -gt 0 ]; then
    echo "Testing secret access..."
    
    FIRST_SECRET=$(aws secretsmanager list-secrets \
        --region "$AWS_REGION" \
        --query "SecretList[?starts_with(Name, 'dive-v3')].Name | [0]" \
        --output text)
    
    if aws secretsmanager get-secret-value \
        --secret-id "$FIRST_SECRET" \
        --region "$AWS_REGION" \
        >/dev/null 2>&1; then
        echo "✓ Secret access verified: $FIRST_SECRET"
    else
        echo "❌ Cannot access secret: $FIRST_SECRET"
        echo "   Check IAM permissions"
        exit 1
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Setup Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Reload shell: source ~/.bashrc"
echo "  2. Create secrets: ./dive secrets ensure USA"
echo "  3. Deploy: ./dive hub deploy"
echo ""
echo "To verify:"
echo "  ./dive secrets list"
echo "  ./dive secrets verify USA"
echo ""
