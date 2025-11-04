# ============================================
# USA Realm Test Users (4 users - All AAL Levels)
# ============================================
# v2.0.0: Automated test user creation
# Reference: terraform/modules/realm-test-users/

module "usa_test_users" {
  source = "./modules/realm-test-users"
  
  realm_id           = keycloak_realm.dive_v3_usa.id
  realm_name         = "dive-v3-usa"
  country_code       = "USA"
  country_code_lower = "usa"
  email_domain       = "example.mil"
  duty_org           = "US_ARMY"
  
  # Country-specific clearance mapping (USA uses standard names)
  clearance_mappings = {
    "UNCLASSIFIED" = "UNCLASSIFIED"
    "CONFIDENTIAL" = "CONFIDENTIAL"
    "SECRET"       = "SECRET"
    "TOP_SECRET"   = "TOP SECRET"
  }
  
  # COI tags by clearance level
  coi_confidential = []  # Basic access
  coi_secret       = ["NATO-COSMIC"]
  coi_top_secret   = ["NATO-COSMIC", "FVEY", "CAN-US"]
}

output "usa_test_users" {
  description = "Test users created in USA realm"
  value       = module.usa_test_users.test_users_created
}

