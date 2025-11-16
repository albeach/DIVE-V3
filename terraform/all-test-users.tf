# ============================================
# Test Users for ALL 11 Realms (Automated)
# ============================================
# v2.0.0: Complete test coverage - 4 users per realm × 11 realms = 44 users
# AAL1 (UNCLASSIFIED), AAL2 (CONFIDENTIAL, SECRET), AAL3 (TOP_SECRET)

# ============================================
# Broker Realm Test Users
# ============================================

module "broker_test_users" {
  source = "./modules/realm-test-users"

  realm_id           = keycloak_realm.dive_v3_broker.id
  realm_name         = "dive-v3-broker"
  country_code       = "USA"
  country_code_lower = "broker"
  email_domain       = "dive-coalition.mil"
  duty_org           = "COALITION_COMMAND"

  coi_secret     = ["NATO-COSMIC"]
  coi_top_secret = ["NATO-COSMIC", "FVEY"]
}

# ============================================
# USA Realm Test Users
# ============================================

module "usa_test_users" {
  source = "./modules/realm-test-users"

  realm_id           = keycloak_realm.dive_v3_usa.id
  realm_name         = "dive-v3-usa"
  country_code       = "USA"
  country_code_lower = "usa"
  email_domain       = "example.mil"
  duty_org           = "US_ARMY"

  coi_secret     = ["NATO-COSMIC"]
  coi_top_secret = ["NATO-COSMIC", "FVEY", "CAN-US"]
}

# ============================================
# France Realm Test Users
# ============================================

module "fra_test_users" {
  source = "./modules/realm-test-users"

  realm_id           = keycloak_realm.dive_v3_fra.id
  realm_name         = "dive-v3-fra"
  country_code       = "FRA"
  country_code_lower = "fra"
  email_domain       = "example.fr"
  duty_org           = "FRENCH_AIR_FORCE"

  clearance_mappings = {
    "UNCLASSIFIED" = "NON_PROTEGE"
    "CONFIDENTIAL" = "CONFIDENTIEL_DEFENSE"
    "SECRET"       = "SECRET_DEFENSE"
    "TOP_SECRET"   = "TRES_SECRET_DEFENSE"
  }

  coi_secret     = ["NATO-COSMIC"]
  coi_top_secret = ["NATO-COSMIC"] # France not in FVEY
}

# ============================================
# Canada Realm Test Users
# ============================================

module "can_test_users" {
  source = "./modules/realm-test-users"

  realm_id           = keycloak_realm.dive_v3_can.id
  realm_name         = "dive-v3-can"
  country_code       = "CAN"
  country_code_lower = "can"
  email_domain       = "example.ca"
  duty_org           = "CANADIAN_ARMED_FORCES"

  coi_secret     = ["NATO-COSMIC"]
  coi_top_secret = ["NATO-COSMIC", "FVEY", "CAN-US"]
}

# ============================================
# Germany Realm Test Users
# ============================================

module "deu_test_users" {
  source = "./modules/realm-test-users"

  realm_id           = keycloak_realm.dive_v3_deu.id
  realm_name         = "dive-v3-deu"
  country_code       = "DEU"
  country_code_lower = "deu"
  email_domain       = "example.de"
  duty_org           = "BUNDESWEHR"

  coi_secret     = ["NATO-COSMIC"]
  coi_top_secret = ["NATO-COSMIC"]
}

# ============================================
# United Kingdom Realm Test Users
# ============================================

module "gbr_test_users" {
  source = "./modules/realm-test-users"

  realm_id           = keycloak_realm.dive_v3_gbr.id
  realm_name         = "dive-v3-gbr"
  country_code       = "GBR"
  country_code_lower = "gbr"
  email_domain       = "example.uk"
  duty_org           = "UK_MOD"

  coi_secret     = ["NATO-COSMIC"]
  coi_top_secret = ["NATO-COSMIC", "FVEY"]
}

# ============================================
# Italy Realm Test Users
# ============================================

module "ita_test_users" {
  source = "./modules/realm-test-users"

  realm_id           = keycloak_realm.dive_v3_ita.id
  realm_name         = "dive-v3-ita"
  country_code       = "ITA"
  country_code_lower = "ita"
  email_domain       = "example.it"
  duty_org           = "ITALIAN_ARMED_FORCES"

  coi_secret     = ["NATO-COSMIC"]
  coi_top_secret = ["NATO-COSMIC"]
}

# ============================================
# Spain Realm Test Users
# ============================================

module "esp_test_users" {
  source = "./modules/realm-test-users"

  realm_id           = keycloak_realm.dive_v3_esp.id
  realm_name         = "dive-v3-esp"
  country_code       = "ESP"
  country_code_lower = "esp"
  email_domain       = "example.es"
  duty_org           = "SPANISH_ARMED_FORCES"

  coi_secret     = ["NATO-COSMIC"]
  coi_top_secret = ["NATO-COSMIC"]
}

# ============================================
# Poland Realm Test Users
# ============================================

module "pol_test_users" {
  source = "./modules/realm-test-users"

  realm_id           = keycloak_realm.dive_v3_pol.id
  realm_name         = "dive-v3-pol"
  country_code       = "POL"
  country_code_lower = "pol"
  email_domain       = "example.pl"
  duty_org           = "POLISH_ARMED_FORCES"

  coi_secret     = ["NATO-COSMIC"]
  coi_top_secret = ["NATO-COSMIC"]
}

# ============================================
# Netherlands Realm Test Users
# ============================================

module "nld_test_users" {
  source = "./modules/realm-test-users"

  realm_id           = keycloak_realm.dive_v3_nld.id
  realm_name         = "dive-v3-nld"
  country_code       = "NLD"
  country_code_lower = "nld"
  email_domain       = "example.nl"
  duty_org           = "DUTCH_ARMED_FORCES"

  coi_secret     = ["NATO-COSMIC"]
  coi_top_secret = ["NATO-COSMIC"]
}

# ============================================
# Industry Realm Test Users
# ============================================

module "industry_test_users" {
  source = "./modules/realm-test-users"

  realm_id           = keycloak_realm.dive_v3_industry.id
  realm_name         = "dive-v3-industry"
  country_code       = "USA"
  country_code_lower = "industry"
  email_domain       = "contractor.com"
  duty_org           = "DEFENSE_CONTRACTOR"

  coi_secret     = []       # Industry users get minimal COI
  coi_top_secret = ["FVEY"] # Limited access for contractors
}

# ============================================
# Outputs
# ============================================

output "all_test_users_created" {
  description = "Test users created across all realms"
  value = {
    broker   = try(module.broker_test_users.test_users_created, null)
    usa      = try(module.usa_test_users.test_users_created, null)
    fra      = try(module.fra_test_users.test_users_created, null)
    can      = try(module.can_test_users.test_users_created, null)
    deu      = try(module.deu_test_users.test_users_created, null)
    gbr      = try(module.gbr_test_users.test_users_created, null)
    ita      = try(module.ita_test_users.test_users_created, null)
    esp      = try(module.esp_test_users.test_users_created, null)
    pol      = try(module.pol_test_users.test_users_created, null)
    nld      = try(module.nld_test_users.test_users_created, null)
    industry = try(module.industry_test_users.test_users_created, null)
  }
}

