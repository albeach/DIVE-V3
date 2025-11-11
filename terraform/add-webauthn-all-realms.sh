#!/usr/bin/env bash
# ============================================
# Add WebAuthn Policy to All Realm Files (AUTOMATED)
# ============================================
# Adds AAL3-compliant WebAuthn policy configuration to all 11 realms
# Version: 2.0.0
#
# Usage: ./add-webauthn-all-realms.sh

set -euo pipefail

TERRAFORM_DIR="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/terraform"

# Realm files to update
REALM_FILES=(
  "broker-realm.tf"
  "usa-realm.tf"
  "fra-realm.tf"
  "can-realm.tf"
  "deu-realm.tf"
  "gbr-realm.tf"
  "ita-realm.tf"
  "esp-realm.tf"
  "pol-realm.tf"
  "nld-realm.tf"
  "industry-realm.tf"
)

WEBAUTHN_POLICY='
  # WebAuthn Policy (AAL3 Hardware-Backed Authentication) - v2.0.0
  # AUTOMATED via Terraform - No manual configuration needed!
  webauthn_policy {
    relying_party_entity_name            = "DIVE V3 Coalition Platform"
    relying_party_id                     = ""  # Empty for localhost
    signature_algorithms                 = ["ES256", "RS256"]
    attestation_conveyance_preference    = "none"
    authenticator_attachment             = "cross-platform"
    require_resident_key                 = "No"
    user_verification_requirement        = "required"  # CRITICAL for AAL3
    create_timeout                       = 300
    avoid_same_authenticator_register    = false
    acceptable_aaguids                   = []
  }
'

echo "Adding WebAuthn policy to all realm files..."
echo ""

for realm_file in "${REALM_FILES[@]}"; do
  FILE_PATH="$TERRAFORM_DIR/$realm_file"
  
  if [ ! -f "$FILE_PATH" ]; then
    echo "❌ File not found: $realm_file"
    continue
  fi
  
  # Check if webauthn_policy already exists
  if grep -q "webauthn_policy" "$FILE_PATH"; then
    echo "✅ $realm_file - WebAuthn policy already exists"
    continue
  fi
  
  # Find line before security_defenses or ssl_required to insert policy
  LINE_NUM=$(grep -n "security_defenses\|ssl_required" "$FILE_PATH" | head -1 | cut -d: -f1)
  
  if [ -z "$LINE_NUM" ]; then
    echo "⚠️  $realm_file - Could not find insertion point"
    continue
  fi
  
  # Insert WebAuthn policy before the line
  INSERT_LINE=$((LINE_NUM - 1))
  
  echo "✅ $realm_file - Adding WebAuthn policy at line $INSERT_LINE"
  
  # Create backup
  cp "$FILE_PATH" "${FILE_PATH}.backup-webauthn"
  
  # Insert the policy
  {
    head -n "$INSERT_LINE" "$FILE_PATH"
    echo "$WEBAUTHN_POLICY"
    tail -n +$((INSERT_LINE + 1)) "$FILE_PATH"
  } > "${FILE_PATH}.tmp"
  
  mv "${FILE_PATH}.tmp" "$FILE_PATH"
done

echo ""
echo "✅ WebAuthn policy added to all realm files!"
echo ""
echo "Next: Run 'terraform apply' to deploy WebAuthn policies automatically"

