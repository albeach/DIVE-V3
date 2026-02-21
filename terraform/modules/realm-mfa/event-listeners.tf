# ============================================
# Keycloak Event Listener Configuration (v3.2.0)
# ============================================
# AAL2/MFA Event Logging with Native AMR/ACR Features
#
# KEY CHANGES (v3.2.0 - January 24, 2026):
# - ❌ REMOVED: "dive-amr-enrichment" Event Listener SPI (caused attribute corruption)
# - ✅ NATIVE: Keycloak 26.5 native AMR/ACR tracking (RFC 8176 compliant)
# - ✅ NATIVE: oidc-amr-mapper and oidc-acr-mapper for JWT claims
# - ✅ NATIVE: ACR is automatically set via authenticator execution config
#
# Why dive-amr-enrichment was removed:
# The custom event listener had a critical bug where it incorrectly identified
# federated users as local users, causing user.setAttribute() to OVERWRITE all
# user attributes including countryOfAffiliation. This broke federation.
#
# Native Keycloak 26.5 features:
# 1. Authenticators set session notes (not user attributes) ✅
# 2. Session notes don't corrupt user data ✅
# 3. Native oidc-amr-mapper reads session notes and adds to JWT ✅
# 4. No custom code needed - all functionality built-in ✅
#
# Reference: .cursor/AMR_ENRICHMENT_ROOT_CAUSE.md

resource "keycloak_realm_events" "mfa_events" {
  realm_id = var.realm_id

  # Enable event listeners
  # jboss-logging: Standard Keycloak event logging for security monitoring
  # NO custom listeners - native Keycloak AMR/ACR tracking is sufficient
  events_listeners = [
    "jboss-logging"
  ]

  # Enable user events for LOGIN tracking
  events_enabled = true

  # Store events for 7 days (604800 seconds)
  # Sufficient for audit trail without overwhelming storage
  events_expiration = 604800

  # Event types to capture for security monitoring
  enabled_event_types = [
    "LOGIN",              # Track successful logins
    "LOGIN_ERROR",        # Track failed login attempts (brute force detection)
    "LOGOUT",             # Track session termination
    "UPDATE_TOTP",        # Track MFA enrollment/changes
    "REMOVE_TOTP",        # Track MFA removal (security event)
    "UPDATE_PASSWORD",    # Track password changes
    "UPDATE_PROFILE",     # Track profile modifications
    "SEND_RESET_PASSWORD" # Track password reset requests
  ]

  # Enable admin events for audit trail
  # Tracks all administrative actions in Keycloak Admin Console
  admin_events_enabled = true

  # Include request/response details in admin events
  # Useful for forensics and compliance audits
  admin_events_details_enabled = true
}

# Output for verification
output "events_listeners" {
  description = "Enabled event listeners for this realm"
  value       = keycloak_realm_events.mfa_events.events_listeners
}

