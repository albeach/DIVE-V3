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
tst = {
    instance_code         = "TST"
    instance_name         = "TST Instance"
    idp_url               = "https://localhost:8643"
    idp_internal_url      = "https://dive-spoke-tst-keycloak:8443"
    frontend_url          = "https://localhost:3200"
    enabled               = true
    client_secret         = ""  # Loaded from GCP: dive-v3-federation-tst-usa
    disable_trust_manager = true
  }
fra = {
    instance_code         = "FRA"
    instance_name         = "FRA Instance"
    idp_url               = "https://localhost:8453"
    idp_internal_url      = "https://dive-spoke-fra-keycloak:8443"
    frontend_url          = "https://localhost:3010"
    enabled               = true
    client_secret         = ""  # Loaded from GCP: dive-v3-federation-fra-usa
    disable_trust_manager = true
  }
deu = {
    instance_code         = "DEU"
    instance_name         = "DEU Instance"
    idp_url               = "https://localhost:8454"
    idp_internal_url      = "https://dive-spoke-deu-keycloak:8443"
    frontend_url          = "https://localhost:3011"
    enabled               = true
    client_secret         = ""  # Loaded from GCP: dive-v3-federation-deu-usa
    disable_trust_manager = true
  }
est = {
    instance_code         = "EST"
    instance_name         = "EST Instance"
    idp_url               = "https://localhost:8451"
    idp_internal_url      = "https://dive-spoke-est-keycloak:8443"
    frontend_url          = "https://localhost:3008"
    enabled               = true
    client_secret         = ""  # Loaded from GCP: dive-v3-federation-est-usa
    disable_trust_manager = true
  }
}

# =============================================================================
# Note: Sensitive variables should be set via environment:
#   TF_VAR_test_user_password       (from GCP: dive-v3-test-user-password)
#   TF_VAR_admin_user_password      (from GCP: dive-v3-admin-password)
#
# Incoming Federation Secrets:
#   TF_VAR_incoming_federation_secrets (map, dynamically loaded from GCP)
# =============================================================================
