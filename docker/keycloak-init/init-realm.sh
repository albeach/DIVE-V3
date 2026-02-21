#!/bin/sh
# =============================================================================
# Keycloak Realm Init Container
# =============================================================================
# Runs inside a hashicorp/terraform container on the Docker internal network.
# Applies Terraform configuration to create the Keycloak realm and clients.
#
# Idempotent: Terraform apply is inherently idempotent.
#
# Required env vars:
#   TF_VAR_keycloak_url             - Keycloak internal URL
#   TF_VAR_keycloak_admin           - Admin username
#   TF_VAR_keycloak_admin_password  - Admin password
#   TF_VAR_realm_name               - Realm name
#   TF_VAR_instance_code            - Instance code (e.g., deu)
#
# Volumes:
#   /terraform  - Terraform configuration files (bind mount from instances/{code}/terraform/)
#   /certs      - TLS certificates for Keycloak verification
#
# Exit codes:
#   0 - Realm configured
#   1 - Failed
# =============================================================================

set -e

echo "Keycloak realm initialization for ${TF_VAR_realm_name:-unknown}"

# Terraform needs to skip TLS verification for self-signed Keycloak certs
export TF_VAR_keycloak_tls_insecure="true"

cd /terraform

# Check if Terraform files exist
if [ ! -f "main.tf" ] && [ ! -f "*.tf" ]; then
    echo "No Terraform files found in /terraform — skipping realm init"
    echo "Realm will need manual configuration or Terraform files need to be generated"
    exit 0
fi

# Initialize Terraform (downloads providers if needed)
echo "Running terraform init..."
terraform init -input=false -no-color 2>&1

# Apply configuration
echo "Running terraform apply..."
terraform apply -auto-approve -input=false -no-color 2>&1

echo "Keycloak realm configured"
exit 0
