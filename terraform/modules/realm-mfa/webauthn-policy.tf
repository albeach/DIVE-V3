# ============================================
# WebAuthn Policy Configuration (AAL3)
# ============================================
# Native Keycloak 26.4.7 WebAuthn/Passkey support for TOP_SECRET users
# Implements NIST SP 800-63B AAL3 requirements
#
# Reference: https://www.keycloak.org/docs/26.4/server_admin/#webauthn_server_administration_guide

# ============================================
# WebAuthn Policy Configuration
# ============================================
# NOTE: Terraform Keycloak provider v5.0 doesn't have dedicated webauthn_policy resource
# WebAuthn policy must be configured via Keycloak Admin Console or REST API
#
# AUTOMATED CONFIGURATION:
# The spoke deployment script (init-keycloak.sh) configures WebAuthn policy via REST API.
#
# BEST PRACTICE WebAuthn Policy Settings (Passkey Compatible):
#   - Relying Party Entity Name: ${var.realm_display_name}
#   - Signature Algorithms: ES256, RS256
#   - Relying Party ID: localhost (dev) / dive-v3.example.mil (prod)
#   - Attestation Conveyance Preference: none (CRITICAL: accepts all attestation types)
#   - Authenticator Attachment: not specified (allows platform + cross-platform)
#   - Require Resident Key: No (allow server-side credential storage)
#   - User Verification Requirement: preferred (works with all authenticators)
#   - Timeout: 300 seconds (5 minutes for user to complete)
#   - Avoid Same Authenticator: false
#   - Acceptable AAGUIDs: (leave empty to allow all FIDO2 authenticators)
#
# CRITICAL: Attestation Conveyance MUST be "none" for passkeys (Touch ID, Face ID, etc.)
# Using "direct" will cause: "AttestationVerifier is not configured to handle 'none'"
#
# Supported Hardware Keys:
#   - YubiKey 5 Series (USB-A, USB-C, NFC)
#   - Google Titan Security Key
#   - Feitian ePass FIDO2
#   - SoloKeys
#   - Windows Hello (platform authenticator)
#   - Touch ID (Mac/iPhone)
#   - Android Biometric
#
# For automated configuration, use Keycloak Admin REST API:
# POST /admin/realms/{realm}/authentication/webauthn-policy
#
# Reference: https://www.keycloak.org/docs/26.4/server_admin/#webauthn_server_administration_guide

# ============================================
# WebAuthn Passwordless Policy (Optional - Future AAL3 Enhancement)
# ============================================
# For future consideration: Passwordless WebAuthn (no password required)
# TOP_SECRET users could use hardware key ONLY

# Note: Currently we use WebAuthn as 2nd factor (password + WebAuthn = AAL3)
# Future: WebAuthn Passwordless (WebAuthn only = also AAL3)

