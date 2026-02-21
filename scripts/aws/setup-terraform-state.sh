#!/usr/bin/env bash
# =============================================================================
# DIVE V3 — Terraform State Backend Setup (S3 + DynamoDB)
# =============================================================================
# Creates the S3 bucket and DynamoDB lock table for Terraform remote state.
# Run this ONCE before `terraform init` on any aws-dev or aws-staging module.
#
# Usage:
#   ./scripts/aws/setup-terraform-state.sh
# =============================================================================
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-gov-east-1}"
S3_BUCKET="dive-v3-tfstate"
DYNAMO_TABLE="dive-v3-tflock"

log() { echo -e "\033[0;32m[TF-STATE]\033[0m $*"; }
err() { echo -e "\033[0;31m[TF-STATE]\033[0m $*" >&2; }

# Check AWS auth
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    err "AWS CLI not authenticated. Run: aws configure"
    exit 1
fi

# =============================================================================
# S3 BUCKET
# =============================================================================

if aws s3api head-bucket --bucket "$S3_BUCKET" --region "$AWS_REGION" 2>/dev/null; then
    log "S3 bucket already exists: $S3_BUCKET"
else
    log "Creating S3 bucket: $S3_BUCKET"
    aws s3api create-bucket \
        --bucket "$S3_BUCKET" \
        --region "$AWS_REGION" \
        --create-bucket-configuration LocationConstraint="$AWS_REGION"

    log "Enabling versioning..."
    aws s3api put-bucket-versioning \
        --bucket "$S3_BUCKET" \
        --versioning-configuration Status=Enabled \
        --region "$AWS_REGION"

    log "Enabling encryption..."
    aws s3api put-bucket-encryption \
        --bucket "$S3_BUCKET" \
        --server-side-encryption-configuration '{
            "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
        }' \
        --region "$AWS_REGION"

    log "Blocking public access..."
    aws s3api put-public-access-block \
        --bucket "$S3_BUCKET" \
        --public-access-block-configuration \
            BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
        --region "$AWS_REGION"

    log "S3 bucket created."
fi

# =============================================================================
# DYNAMODB LOCK TABLE
# =============================================================================

if aws dynamodb describe-table --table-name "$DYNAMO_TABLE" --region "$AWS_REGION" >/dev/null 2>&1; then
    log "DynamoDB table already exists: $DYNAMO_TABLE"
else
    log "Creating DynamoDB lock table: $DYNAMO_TABLE"
    aws dynamodb create-table \
        --table-name "$DYNAMO_TABLE" \
        --attribute-definitions AttributeName=LockID,AttributeType=S \
        --key-schema AttributeName=LockID,KeyType=HASH \
        --billing-mode PAY_PER_REQUEST \
        --region "$AWS_REGION"

    aws dynamodb wait table-exists --table-name "$DYNAMO_TABLE" --region "$AWS_REGION"
    log "DynamoDB table created."
fi

echo ""
log "Terraform state backend ready!"
echo ""
echo "  S3 Bucket:     $S3_BUCKET"
echo "  DynamoDB Table: $DYNAMO_TABLE"
echo "  Region:        $AWS_REGION"
echo ""
echo "  Run 'terraform init' in terraform/aws-dev/ or terraform/aws-staging/"
