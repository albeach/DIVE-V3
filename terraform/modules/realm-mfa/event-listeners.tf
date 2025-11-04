# ============================================
# Keycloak Event Listener Configuration (NATIVE v2.0.0)
# ============================================
# AAL2/MFA Event Logging Using ONLY Native Keycloak Features
#
# KEY CHANGES (v2.0.0 - November 2025):
# - ❌ REMOVED: Custom "dive-amr-enrichment" Event Listener SPI
# - ✅ NATIVE: AMR is now automatically tracked by Keycloak 26.4
# - ✅ NATIVE: ACR is automatically set via authenticator execution config
#
# How Native AMR Works:
# 1. Keycloak automatically sets AUTH_METHODS_REF session note
# 2. Each authenticator adds its reference value (pwd, otp, etc.)
# 3. oidc-usersessionmodel-note-mapper maps session note to JWT amr claim
#
# No custom Event Listener needed! 🎉

resource "keycloak_realm_events" "mfa_events" {
  realm_id = var.realm_id

  # Enable event listeners (NATIVE only, no custom SPIs)
  # jboss-logging: Standard Keycloak event logging for security monitoring
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
    "LOGIN",              # Track successful logins (AMR enrichment happens here)
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

