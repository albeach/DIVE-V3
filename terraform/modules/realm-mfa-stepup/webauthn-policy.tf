# ============================================
# WebAuthn Policy Configuration for USA Realm
# ============================================
# Configures WebAuthn (Passkey) policy for proper modal UI and UX
# Reference: https://www.keycloak.org/docs/latest/server_admin/index.html#webauthn_server_administration_guide

resource "keycloak_required_action" "usa_webauthn_register" {
  realm_id = var.realm_id
  alias    = "webauthn-register"
  enabled  = true
  name     = "Webauthn Register"
  priority = 90
}

resource "keycloak_required_action" "usa_webauthn_register_passwordless" {
  realm_id = var.realm_id
  alias    = "webauthn-register-passwordless"
  enabled  = true
  name     = "Webauthn Register Passwordless"
  priority = 91
}

# WebAuthn Policy Configuration
# NOTE: Keycloak Terraform provider doesn't have full WebAuthn policy resource yet.
# The following configuration should be applied manually via Admin Console:
#
# **Path:** Authentication → Policies → WebAuthn Policy
#
# **Configuration:**
# - Relying Party Entity Name: DIVE V3 - ${var.realm_display_name}
# - Relying Party ID: dev-auth.dive25.com
# - Signature Algorithms: ES256, RS256
# - Attestation Conveyance Preference: not specified
# - Authenticator Attachment: not specified (allows platform or cross-platform)
# - Require Resident Key: No (for hardware keys compatibility)
# - User Verification Requirement: preferred
# - Timeout: 30 seconds
# - Avoid Same Authenticator Registration: No
# - Acceptable AAGUIDs: (empty - allow all)
#
# **WebAuthn Passwordless Policy** (same path):
# - Enable Passkeys: **Yes** ← CRITICAL for modal UI
# - User Verification Requirement: required (for AAL3)
# - Require Discoverable Credential: Yes (for passkeys)
# - All other settings same as above
#
# **Manual Steps to Enable Passkeys:**
# 1. Navigate to: Realm Settings → Authentication → Policies
# 2. Click "WebAuthn Passwordless Policy"
# 3. Scroll to bottom
# 4. Toggle "Enable Passkeys" to ON
# 5. Click Save
#
# This enables the browser's native passkey modal UI instead of the list view.

