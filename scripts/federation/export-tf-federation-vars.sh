#!/usr/bin/env bash
# ============================================================================
# DIVE V3 - Export Federation Secrets as Terraform Variables
# ============================================================================
# Exports GCP federation secrets as TF_VAR_incoming_federation_secrets so
# Terraform can set client secrets during apply.
#
# USAGE:
#   source scripts/federation/export-tf-federation-vars.sh <instance>
#
# EXAMPLE:
#   source scripts/federation/export-tf-federation-vars.sh usa
#   terraform -chdir=terraform/instances apply -var-file=usa.tfvars
#
# ============================================================================

set -e

INSTANCE="${1:-}"
GCP_PROJECT="${GCP_PROJECT_ID:-dive25}"

if [ -z "$INSTANCE" ]; then
    echo "❌ Usage: source $0 <instance>"
    echo "   Example: source $0 usa"
    return 1 2>/dev/null || exit 1
fi

INSTANCE=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')
INST_UPPER=$(echo "$INSTANCE" | tr '[:lower:]' '[:upper:]')

echo "🔐 Exporting federation secrets for $INST_UPPER..."

# Get partners
case "$INSTANCE" in
    usa) PARTNERS="fra gbr deu" ;;
    fra) PARTNERS="usa gbr deu" ;;
    gbr) PARTNERS="usa fra deu" ;;
    deu) PARTNERS="usa fra gbr" ;;
    *) echo "❌ Unknown instance: $INSTANCE"; return 1 2>/dev/null || exit 1 ;;
esac

# Build the incoming_federation_secrets map
# Format: { "partner" = "secret", ... }
SECRETS_MAP="{"
FIRST=true

for partner in $PARTNERS; do
    # Secret naming: dive-v3-federation-{this_instance}-{partner}
    # This instance creates the client for partner to use
    SECRET_NAME="dive-v3-federation-${INSTANCE}-${partner}"
    SECRET_VALUE=$(gcloud secrets versions access latest --secret="$SECRET_NAME" --project="$GCP_PROJECT" 2>/dev/null || echo "")
    
    if [ -n "$SECRET_VALUE" ]; then
        [ "$FIRST" = false ] && SECRETS_MAP+=","
        SECRETS_MAP+="\"$partner\"=\"$SECRET_VALUE\""
        FIRST=false
        echo "  ✅ $partner: ${SECRET_VALUE:0:8}..."
    else
        echo "  ⚠️  $partner: No secret found ($SECRET_NAME)"
    fi
done

SECRETS_MAP+="}"

# Export for Terraform
export TF_VAR_incoming_federation_secrets="$SECRETS_MAP"
echo ""
echo "✅ Exported TF_VAR_incoming_federation_secrets"
echo ""
echo "To apply Terraform:"
echo "  terraform -chdir=terraform/instances workspace select $INSTANCE"
echo "  terraform -chdir=terraform/instances apply -var-file=${INSTANCE}.tfvars"


