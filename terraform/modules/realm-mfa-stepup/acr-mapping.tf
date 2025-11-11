# ============================================
# ACR to LoA Mapping (Realm Level)
# ============================================
# Maps Authentication Context Class Reference (ACR) values to
# numeric Level of Authentication (LoA) for step-up authentication
#
# Reference: NIST SP 800-63B Authentication Assurance Levels
# - AAL1 (silver): Single-factor (password)
# - AAL2 (gold): Two-factor with approved cryptographic authenticator (OTP)
# - AAL3 (platinum): Hardware-based cryptographic authenticator (WebAuthn/passkey)
#
# NOTE: Keycloak Terraform provider doesn't have a dedicated ACR resource yet.
# ACR mapping is configured via the Admin UI or REST API.
# This file documents the intended configuration which will be applied manually
# or via a null_resource with local-exec.
#
# Manual Configuration Steps:
# 1. Navigate to Realm Settings → Login → ACR to Level of Authentication (LoA) Mapping
# 2. Add entries:
#    - urn:mace:incommon:iap:silver → 1
#    - urn:mace:incommon:iap:gold → 2
#    - urn:mace:incommon:iap:platinum → 3

# Placeholder for future implementation when Terraform provider adds support
# For now, ACR mapping must be configured manually via Keycloak Admin UI

