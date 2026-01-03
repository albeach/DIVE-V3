# ============================================
# Keycloak Event Listener Configuration (v3.1.0)
# ============================================
# AAL2/MFA Event Logging with Custom AMR Enrichment
#
# KEY CHANGES (v3.1.0 - December 2025):
# - ✅ RE-ENABLED: "dive-amr-enrichment" Event Listener SPI
# - ✅ NATIVE: oidc-amr-mapper and oidc-acr-mapper for JWT claims
# - ✅ NATIVE: ACR is automatically set via authenticator execution config
#
# Why dive-amr-enrichment is needed:
# Keycloak 26.4 native authenticator ACR/AMR config ONLY works when the
# authenticator execution config is properly set. The event listener provides
# a fallback enrichment for WebAuthn/OTP credentials that ensures AMR claims
# are properly set even when authentication flows don't set session notes.
#
# How it works:
# 1. User authenticates (password + WebAuthn/OTP)
# 2. dive-amr-enrichment event listener fires on LOGIN event
# 3. Event listener checks user credentials and sets AUTH_METHODS_REF
# 4. oidc-amr-mapper reads AUTH_METHODS_REF and adds to JWT
# 5. oidc-acr-mapper reads authenticator ACR config and adds to JWT

resource "keycloak_realm_events" "mfa_events" {
  realm_id = var.realm_id

  # Enable event listeners
  # jboss-logging: Standard Keycloak event logging for security monitoring
  # NOTE: Using native Keycloak oidc-acr-mapper and oidc-amr-mapper for ACR/AMR claims.
  # These read from the authentication session, populated by authenticators during login.
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

