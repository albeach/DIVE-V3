# ============================================
# Keycloak MFA Authentication Flows (Module-Based)
# ============================================
# AAL2 Enforcement: Conditional MFA based on clearance level
# Gap #6 Remediation - Phase 1: Use Keycloak built-in OTP
# Reference: docs/MFA-OTP-IMPLEMENTATION.md
#
# This file uses the reusable realm-mfa module for all realms

# ============================================
# Broker Realm MFA Configuration (Super Admin)
# ============================================

module "broker_mfa" {
  source = "./modules/realm-mfa"
  
  realm_id           = keycloak_realm.dive_v3_broker.id
  realm_name         = "dive-v3-broker"
  realm_display_name = "DIVE V3 Broker"
  
  enable_direct_grant_mfa = true  # ENABLED - Keycloak 26 fix: sets ACR/AMR session notes
}

# ============================================
# USA Realm MFA Configuration
# ============================================

module "usa_mfa" {
  source = "./modules/realm-mfa"
  
  realm_id           = keycloak_realm.dive_v3_usa.id
  realm_name         = "dive-v3-usa"
  realm_display_name = "United States"
  
  enable_direct_grant_mfa = false  # DISABLED - custom SPI causing token issues
}

# ============================================
# France Realm MFA Configuration
# ============================================

module "fra_mfa" {
  source = "./modules/realm-mfa"
  
  realm_id           = keycloak_realm.dive_v3_fra.id
  realm_name         = "dive-v3-fra"
  realm_display_name = "France"
  
  enable_direct_grant_mfa = false  # DISABLED - custom SPI causing token issues
}

# ============================================
# Canada Realm MFA Configuration
# ============================================

module "can_mfa" {
  source = "./modules/realm-mfa"
  
  realm_id           = keycloak_realm.dive_v3_can.id
  realm_name         = "dive-v3-can"
  realm_display_name = "Canada"
  
  enable_direct_grant_mfa = false  # DISABLED - custom SPI causing token issues
}

# ============================================
# Industry Realm MFA Configuration
# ============================================

module "industry_mfa" {
  source = "./modules/realm-mfa"
  
  realm_id           = keycloak_realm.dive_v3_industry.id
  realm_name         = "dive-v3-industry"
  realm_display_name = "Industry"
  
  enable_direct_grant_mfa = false  # DISABLED - custom SPI causing token issues
}

# ============================================
# Germany Realm MFA Configuration
# ============================================

module "deu_mfa" {
  source = "./modules/realm-mfa"
  
  realm_id           = keycloak_realm.dive_v3_deu.id
  realm_name         = "dive-v3-deu"
  realm_display_name = "Germany"
  
  enable_direct_grant_mfa = false  # DISABLED - custom SPI causing token issues
}

# ============================================
# United Kingdom Realm MFA Configuration
# ============================================

module "gbr_mfa" {
  source = "./modules/realm-mfa"
  
  realm_id           = keycloak_realm.dive_v3_gbr.id
  realm_name         = "dive-v3-gbr"
  realm_display_name = "United Kingdom"
  
  enable_direct_grant_mfa = false  # DISABLED - custom SPI causing token issues
}

# ============================================
# Italy Realm MFA Configuration
# ============================================

module "ita_mfa" {
  source = "./modules/realm-mfa"
  
  realm_id           = keycloak_realm.dive_v3_ita.id
  realm_name         = "dive-v3-ita"
  realm_display_name = "Italy"
  
  enable_direct_grant_mfa = false  # DISABLED - custom SPI causing token issues
}

# ============================================
# Spain Realm MFA Configuration
# ============================================

module "esp_mfa" {
  source = "./modules/realm-mfa"
  
  realm_id           = keycloak_realm.dive_v3_esp.id
  realm_name         = "dive-v3-esp"
  realm_display_name = "Spain"
  
  enable_direct_grant_mfa = false  # DISABLED - custom SPI causing token issues
}

# ============================================
# Poland Realm MFA Configuration
# ============================================

module "pol_mfa" {
  source = "./modules/realm-mfa"
  
  realm_id           = keycloak_realm.dive_v3_pol.id
  realm_name         = "dive-v3-pol"
  realm_display_name = "Poland"
  
  enable_direct_grant_mfa = false  # DISABLED - custom SPI causing token issues
}

# ============================================
# Netherlands Realm MFA Configuration
# ============================================

module "nld_mfa" {
  source = "./modules/realm-mfa"
  
  realm_id           = keycloak_realm.dive_v3_nld.id
  realm_name         = "dive-v3-nld"
  realm_display_name = "Netherlands"
  
  enable_direct_grant_mfa = false  # DISABLED - custom SPI causing token issues
}

# ============================================
# Module Outputs (Optional)
# ============================================

output "broker_mfa_browser_flow_id" {
  description = "Broker realm MFA browser flow ID"
  value       = module.broker_mfa.browser_flow_id
}

output "usa_mfa_browser_flow_id" {
  description = "USA realm MFA browser flow ID"
  value       = module.usa_mfa.browser_flow_id
}

output "fra_mfa_browser_flow_id" {
  description = "France realm MFA browser flow ID"
  value       = module.fra_mfa.browser_flow_id
}

output "can_mfa_browser_flow_id" {
  description = "Canada realm MFA browser flow ID"
  value       = module.can_mfa.browser_flow_id
}

output "industry_mfa_browser_flow_id" {
  description = "Industry realm MFA browser flow ID"
  value       = module.industry_mfa.browser_flow_id
}

output "deu_mfa_browser_flow_id" {
  description = "Germany realm MFA browser flow ID"
  value       = module.deu_mfa.browser_flow_id
}

output "gbr_mfa_browser_flow_id" {
  description = "UK realm MFA browser flow ID"
  value       = module.gbr_mfa.browser_flow_id
}

output "ita_mfa_browser_flow_id" {
  description = "Italy realm MFA browser flow ID"
  value       = module.ita_mfa.browser_flow_id
}

output "esp_mfa_browser_flow_id" {
  description = "Spain realm MFA browser flow ID"
  value       = module.esp_mfa.browser_flow_id
}

output "pol_mfa_browser_flow_id" {
  description = "Poland realm MFA browser flow ID"
  value       = module.pol_mfa.browser_flow_id
}

output "nld_mfa_browser_flow_id" {
  description = "Netherlands realm MFA browser flow ID"
  value       = module.nld_mfa.browser_flow_id
}

# ============================================
# NOTES: OTP Policy Configuration
# ============================================
# OTP policies are configured as blocks within each realm resource:
# - terraform/usa-realm.tf (security_defenses.otp_policy)
# - terraform/fra-realm.tf (security_defenses.otp_policy)
# - terraform/can-realm.tf (security_defenses.otp_policy)
# - terraform/industry-realm.tf (security_defenses.otp_policy)
# - terraform/broker-realm.tf (OTP policy needs to be added)
#
# Configuration:
# - Algorithm: HmacSHA256
# - Digits: 6
# - Period: 30 seconds
# - Type: TOTP (Time-Based One Time Password)
# - Look-ahead: 1 period (for clock skew tolerance)
#
# Compatible with: Google Authenticator, Authy, Microsoft Authenticator, etc.


