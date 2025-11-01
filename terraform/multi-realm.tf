# ============================================
# Multi-Realm Architecture Module
# ============================================
# Gap #1 Remediation: Multi-Realm Terraform Implementation
# Date: October 20, 2025
# Reference: docs/KEYCLOAK-MULTI-REALM-GUIDE.md
#
# This file imports multi-realm configurations when enabled.
# Toggle via variable: enable_multi_realm = true
#
# Architecture:
# - dive-v3-usa (U.S. military/government realm)
# - dive-v3-fra (France military/government realm)
# - dive-v3-can (Canada military/government realm)
# - dive-v3-industry (Defense contractors realm)
# - dive-v3-broker (Federation hub realm)
#
# Usage:
#   terraform apply -var="enable_multi_realm=true"
#
# Migration Path:
# 1. Create multi-realm alongside existing dive-v3-pilot (no impact)
# 2. Test cross-realm authentication
# 3. Update application to use dive-v3-broker realm
# 4. Migrate users from dive-v3-pilot to national realms
# 5. Deprecate dive-v3-pilot

# ============================================
# Multi-Realm Feature Flag
# ============================================

variable "enable_multi_realm" {
  description = "Enable multi-realm architecture (dive-v3-usa, dive-v3-fra, dive-v3-can, dive-v3-industry, dive-v3-broker)"
  type        = bool
  default     = false # Default: use single realm (dive-v3-pilot)
}

# ============================================
# Multi-Realm Terraform Files
# ============================================
# When enable_multi_realm = true, the following files create the architecture:

# National Realms (4 realms):
# - terraform/realms/usa-realm.tf ✅ COMPLETE
#   → dive-v3-usa realm + client + 9 protocol mappers + test user (john.doe)
#   → NIST SP 800-63B AAL2 compliant, 15min timeout, 5 login attempts
#
# - terraform/realms/fra-realm.tf ✅ COMPLETE
#   → dive-v3-fra realm + client + 9 protocol mappers + test user (pierre.dubois)
#   → ANSSI RGS Level 2+ compliant, 30min timeout, 3 login attempts
#
# - terraform/realms/can-realm.tf ✅ COMPLETE
#   → dive-v3-can realm + client + 9 protocol mappers + test user (john.macdonald)
#   → GCCF Level 2+ compliant, 20min timeout, 5 login attempts, bilingual
#
# - terraform/realms/industry-realm.tf ✅ COMPLETE
#   → dive-v3-industry realm + client + 9 protocol mappers + test user (bob.contractor)
#   → AAL1 compliant, 60min timeout, 10 login attempts, UNCLASSIFIED only

# Federation Hub (1 realm):
# - terraform/realms/broker-realm.tf ✅ COMPLETE
#   → dive-v3-broker realm + application client + 8 protocol mappers
#   → 10min token lifetime, no direct users, cross-realm brokering

# IdP Brokers (4 brokers in federation hub):
# - terraform/idp-brokers/usa-broker.tf ✅ COMPLETE
#   → USA IdP broker with 8 attribute mappers
#
# - terraform/idp-brokers/fra-broker.tf ✅ COMPLETE
#   → France IdP broker with 8 attribute mappers
#
# - terraform/idp-brokers/can-broker.tf ✅ COMPLETE
#   → Canada IdP broker with 8 attribute mappers
#
# - terraform/idp-brokers/industry-broker.tf ✅ COMPLETE
#   → Industry IdP broker with 8 attribute mappers

# Total Resources Created When Enabled:
# - 5 realms (USA, FRA, CAN, Industry, Broker)
# - 5 OIDC clients (1 per realm for broker federation + 1 app client)
# - 45 protocol mappers (9 per realm × 4 national realms + 8 in broker + 32 broker mappers)
# - 4 IdP brokers (in federation hub)
# - 4 test users (1 per national realm)
# - 5 realm roles

# ============================================
# How Multi-Realm Works
# ============================================
# 
# Cross-Realm Authentication Flow:
# 1. User visits app → redirected to dive-v3-broker realm
# 2. Broker shows IdP selection: USA, France, Canada, Industry
# 3. User selects "United States (DoD)"
# 4. Broker redirects to usa-realm-broker
# 5. usa-realm-broker redirects to dive-v3-usa realm
# 6. User authenticates in U.S. realm (PIV/CAC + password)
# 7. U.S. realm issues token with U.S. attributes
# 8. usa-realm-broker receives token, maps attributes
# 9. Broker realm issues federated token to application
# 10. App receives token with issuer: dive-v3-broker
# 11. Backend validates token from broker realm
# 12. OPA evaluates with U.S. user attributes
# 
# Benefits:
# - Nation sovereignty (each realm has independent policies)
# - User isolation (separate databases per realm)
# - Scalability (add new nations without disrupting existing)
# - Backward compatible (dive-v3-pilot still works)

# ============================================
# Multi-Realm Outputs
# ============================================

output "multi_realm_enabled" {
  description = "Whether multi-realm architecture is enabled"
  value       = var.enable_multi_realm
}

# Outputs commented out - realm resources are in separate files
# To enable, either use Terraform modules or merge realm files into main.tf
# For now, realms can be queried directly via Keycloak Admin API

# output "usa_realm_id" {
#   description = "U.S. realm ID"
#   value       = var.enable_multi_realm ? keycloak_realm.dive_v3_usa.id : null
# }

# Note: After deployment, get realm info with:
# curl http://localhost:8081/realms/{realm-name}/

# ============================================
# Documentation
# ============================================
# For complete multi-realm architecture documentation, see:
# - docs/KEYCLOAK-MULTI-REALM-GUIDE.md (32,000-word design)
# - docs/ATTRIBUTE-SCHEMA-SPECIFICATION.md (attribute reference)
# - DEPLOYMENT-GUIDE-OCT20.md (deployment procedures)
#
# Migration guide:
# 1. Enable multi-realm: terraform apply -var="enable_multi_realm=true"
# 2. Verify realms created: curl http://localhost:8081/realms/{realm}/
# 3. Test cross-realm auth: Login via broker → select USA IdP → authenticate
# 4. Update application: KEYCLOAK_REALM=dive-v3-broker (in .env.local)
# 5. Migrate users: Run user migration script
# 6. Deprecate old realm: Remove dive-v3-pilot after verification

