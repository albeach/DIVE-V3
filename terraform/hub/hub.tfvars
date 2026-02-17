# =============================================================================
# DIVE V3 Hub - Terraform Variables
# =============================================================================
# Hub-in-a-Box deployment for local development
# Hub uses federated-instance module (same as spokes) for symmetry.
# =============================================================================

# =============================================================================
# INSTANCE URLS (Local Development)
# =============================================================================
app_url = "https://localhost:3000"
api_url = "https://localhost:4000"
idp_url = "https://localhost:8443"

# =============================================================================
# KEYCLOAK CONFIGURATION
# =============================================================================
keycloak_url            = "https://localhost:8443"
keycloak_admin_username = "admin"

# =============================================================================
# WEBAUTHN
# =============================================================================
webauthn_rp_id = "localhost"

# =============================================================================
# MFA CONFIGURATION
# =============================================================================
enable_mfa = true

# =============================================================================
# TEST USER CREATION - SSOT ENFORCEMENT
# =============================================================================
# ⚠️  CRITICAL: User creation DISABLED in Terraform
#
# SSOT (Single Source of Truth): scripts/hub-init/seed-hub-users.sh
#
# This bash script creates:
#   - testuser-usa-1 (UNCLASSIFIED, AAL1)
#   - testuser-usa-2 (RESTRICTED, AAL1)
#   - testuser-usa-3 (CONFIDENTIAL, AAL2 - MFA required)
#   - testuser-usa-4 (SECRET, AAL2 - MFA required)
#   - testuser-usa-5 (TOP_SECRET, AAL3 - WebAuthn required)
#   - admin-usa (TOP_SECRET, super_admin + hub_admin roles)
#
# The script runs during Phase 7 of deployment (hub_seed function).
#
# Rationale for bash script SSOT:
#   1. Flexible: Can check if users exist before creating
#   2. Idempotent: Safe to run multiple times
#   3. No state conflicts: Independent of Terraform state
#   4. Direct API control: Can configure User Profile, mappers, etc.
#   5. Development-friendly: Works with clean slate deployments
#
# DO NOT change to true unless:
#   1. You remove the bash script from deployment
#   2. You update Phase 7 in hub.sh
#   3. You document the architectural change
# =============================================================================
create_test_users = false

# =============================================================================
# FEDERATION PARTNERS (SPOKES) - MONGODB IS THE SSOT
# =============================================================================
# DO NOT ADD STATIC ENTRIES HERE!
#
# Federation partners are now managed via MongoDB (SSOT):
#   - Collection: dive-v3.federation_spokes
#   - Populated by: POST /api/federation/register (spoke deployment)
#   - Read by: Hub deployment scripts to generate hub.auto.tfvars
#
# Workflow:
#   1. Spoke deploys → calls /api/federation/register → MongoDB entry created
#   2. Hub deploys → reads MongoDB → generates hub.auto.tfvars
#   3. Terraform applies → creates Keycloak IdPs from auto-generated config
#
# The hub.auto.tfvars file is auto-generated and overrides this empty map.
# See: scripts/dive-modules/hub/deployment.sh (_hub_generate_federation_tfvars)
# =============================================================================
# CRITICAL: Leave EMPTY for MongoDB SSOT architecture
# Spokes register via POST /api/federation/register → MongoDB
# Hub deployment queries MongoDB → generates hub.auto.tfvars
# Terraform reads hub.auto.tfvars (overrides this empty map)
#
# SSOT ARCHITECTURE (2026-01-22): Empty map - spokes populate via MongoDB registration
# DO NOT add entries here manually. This is dynamically populated by:
#   1. Spoke deploys → registers with Hub → MongoDB entry created
#   2. Hub deployment → queries MongoDB → generates hub.auto.tfvars
#   3. Terraform applies → uses hub.auto.tfvars (overrides this empty map)
federation_partners = {
  # EMPTY per MongoDB SSOT architecture (2026-01-22)
  # Federation partners are managed dynamically:
  #   1. Spoke deploys → registers with Hub → MongoDB entry created
  #   2. Hub deployment → queries MongoDB → generates hub.auto.tfvars
  #   3. Terraform reads hub.auto.tfvars (overrides this empty map)
  #
  # For initial Hub deployment (no spokes yet), this must be empty.
  # After spoke registration, Hub can re-apply Terraform with hub.auto.tfvars.
}

# =============================================================================
# Note: Sensitive variables should be set via environment:
#   TF_VAR_test_user_password       (from GCP: dive-v3-test-user-password)
#   TF_VAR_admin_user_password      (from GCP: dive-v3-admin-password)
#
# Incoming Federation Secrets:
#   TF_VAR_incoming_federation_secrets (map, dynamically loaded from GCP)
# =============================================================================
