#!/bin/bash
# Fix Terraform redirect URIs to use dynamic variables instead of hardcoded localhost

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT/terraform"

echo "Fixing redirect URIs in Terraform realm files..."
echo ""

# Fix broker-realm.tf - Frontend client redirects
echo "Fixing broker-realm.tf..."
sed -i.bak '/valid_redirect_uris = \[/,/\]/s|"https://localhost:3000/\*"|# Removed hardcoded localhost|' broker-realm.tf
sed -i.bak2 '/valid_redirect_uris = \[/,/\]/s|"https://localhost:3000/dashboard"|# Removed hardcoded localhost|' broker-realm.tf
sed -i.bak3 's|"https://localhost:3000",|# Removed hardcoded localhost|' broker-realm.tf

# Fix all *-realm.tf files - Broker endpoint redirects
for realm in usa fra can gbr deu esp ita nld pol industry; do
    file="${realm}-realm.tf"
    if [ -f "$file" ]; then
        echo "Fixing ${file}..."
        # Replace hardcoded localhost:8443 with var.keycloak_url
        sed -i.bak "s|https://localhost:8443/realms/dive-v3-broker|\${var.keycloak_url}/realms/dive-v3-broker|g" "$file"
        # Also fix any http://keycloak:8443 references
        sed -i.bak2 "s|https://keycloak:8443/realms/dive-v3-broker|\${var.keycloak_url}/realms/dive-v3-broker|g" "$file"
    fi
done

# Clean up backup files
rm -f *.bak *.bak2 *.bak3

echo ""
echo "✓ All redirect URIs updated to use dynamic variables"
echo ""
echo "Changes made:"
echo "  - broker-realm.tf: Removed hardcoded localhost:3000"
echo "  - All realm files: Changed localhost:8443 → \${var.keycloak_url}"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff terraform/"
echo "  2. Apply Terraform: cd terraform && terraform apply"
echo ""

