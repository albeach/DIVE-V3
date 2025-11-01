# ============================================
# User Profile Schema for All Realms
# ============================================
# Keycloak 26 requires User Profile to be enabled and
# custom attributes to be declared in the User Profile schema
# 
# This is the PROPER Terraform declarative approach vs API workarounds

# ============================================
# USA Realm User Profile
# ============================================
resource "keycloak_realm_user_profile" "usa_profile" {
  realm_id = keycloak_realm.dive_v3_usa.id
  
  # Allow unmanaged attributes (don't force removal of built-in ones)
  unmanaged_attribute_policy = "ENABLED"
  
  # ============================================
  # REQUIRED BUILT-IN ATTRIBUTES (Keycloak 26)
  # ============================================
  # Keycloak 26 requires username and email to be explicitly declared
  # Omitting them causes "can not be removed" errors
  
  attribute {
    name         = "username"
    display_name = "Username"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
    
    validator {
      name = "length"
      config = {
        min = "3"
        max = "255"
      }
    }
    
    validator {
      name = "username-prohibited-characters"
    }
    
    validator {
      name = "up-username-not-idn-homograph"
    }
  }
  
  attribute {
    name         = "email"
    display_name = "Email"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
    
    validator {
      name = "email"
    }
    
    validator {
      name = "length"
      config = {
        max = "255"
      }
    }
  }
  
  attribute {
    name         = "firstName"
    display_name = "First name"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
  
  attribute {
    name         = "lastName"
    display_name = "Last name"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
  
  # ============================================
  # DIVE CUSTOM ATTRIBUTES
  # ============================================

  attribute {
    name         = "uniqueID"
    display_name = "Unique Identifier"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
    
    validator {
      name = "length"
      config = {
        min = "1"
        max = "255"
      }
    }
  }
  
  attribute {
    name         = "clearance"
    display_name = "Security Clearance"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
    
    validator {
      name = "options"
      config = {
        options = jsonencode(["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"])
      }
    }
  }
  
  attribute {
    name         = "clearanceOriginal"
    display_name = "Original Clearance"
    
    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "countryOfAffiliation"
    display_name = "Country of Affiliation"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
    
    validator {
      name = "options"
      config = {
        options = jsonencode(["USA", "ESP", "FRA", "GBR", "DEU", "ITA", "NLD", "POL", "CAN", "INDUSTRY"])
      }
    }
  }
  
  attribute {
    name         = "acpCOI"
    display_name = "Community of Interest"
    multi_valued = true
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
  
  attribute {
    name         = "dutyOrg"
    display_name = "Duty Organization"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "orgUnit"
    display_name = "Organizational Unit"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
}

# ============================================
# Spain Realm User Profile
# ============================================
resource "keycloak_realm_user_profile" "esp_profile" {
  realm_id = keycloak_realm.dive_v3_esp.id
  
  unmanaged_attribute_policy = "ENABLED"
  
  # Required built-in attributes
  attribute {
    name = "username"
    display_name = "Nombre de Usuario"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "email"
    display_name = "Correo Electrónico"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
    validator {
      name = "email"
    }
  }
  
  attribute {
    name = "firstName"
    display_name = "Nombre"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
  
  attribute {
    name = "lastName"
    display_name = "Apellido"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }

  attribute {
    name         = "uniqueID"
    display_name = "Identificador Único"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "clearance"
    display_name = "Nivel de Seguridad"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "clearanceOriginal"
    display_name = "Clasificación Original"
    
    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "countryOfAffiliation"
    display_name = "País de Afiliación"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "acpCOI"
    display_name = "Comunidad de Interés"
    multi_valued = true
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
}

# ============================================
# France Realm User Profile
# ============================================
resource "keycloak_realm_user_profile" "fra_profile" {
  realm_id = keycloak_realm.dive_v3_fra.id
  
  unmanaged_attribute_policy = "ENABLED"
  
  # Required built-in attributes
  attribute {
    name = "username"
    display_name = "Nom d'utilisateur"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "email"
    display_name = "Email"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
    validator {
      name = "email"
    }
  }
  
  attribute {
    name = "firstName"
    display_name = "Prénom"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
  
  attribute {
    name = "lastName"
    display_name = "Nom"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }

  attribute {
    name         = "uniqueID"
    display_name = "Identifiant Unique"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "clearance"
    display_name = "Niveau de Sécurité"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "clearanceOriginal"
    display_name = "Classification Originale"
    
    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "countryOfAffiliation"
    display_name = "Pays d'Affiliation"
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "acpCOI"
    display_name = "Communauté d'Intérêt"
    multi_valued = true
    
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
}

# ============================================
# Canada Realm User Profile
# ============================================
resource "keycloak_realm_user_profile" "can_profile" {
  realm_id = keycloak_realm.dive_v3_can.id
  unmanaged_attribute_policy = "ENABLED"
  
  attribute {
    name = "username"
    display_name = "Username"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "email"
    display_name = "Email"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
    validator {
      name = "email"
    }
  }
  
  attribute {
    name = "firstName"
    display_name = "First name"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
  
  attribute {
    name = "lastName"
    display_name = "Last name"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }

  attribute {
    name         = "uniqueID"
    display_name = "Unique ID"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "clearance"
    display_name = "Clearance Level"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "clearanceOriginal"
    display_name = "Original Clearance"
    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "countryOfAffiliation"
    display_name = "Country"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "acpCOI"
    display_name = "COI"
    multi_valued = true
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
}

# ============================================
# Germany Realm User Profile
# ============================================
resource "keycloak_realm_user_profile" "deu_profile" {
  realm_id = keycloak_realm.dive_v3_deu.id
  unmanaged_attribute_policy = "ENABLED"
  
  attribute {
    name = "username"
    display_name = "Benutzername"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "email"
    display_name = "E-Mail"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
    validator {
      name = "email"
    }
  }
  
  attribute {
    name = "firstName"
    display_name = "Vorname"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
  
  attribute {
    name = "lastName"
    display_name = "Nachname"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }

  attribute {
    name         = "uniqueID"
    display_name = "Eindeutige ID"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "clearance"
    display_name = "Sicherheitsfreigabe"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "clearanceOriginal"
    display_name = "Originale Klassifizierung"
    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "countryOfAffiliation"
    display_name = "Land"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name         = "acpCOI"
    display_name = "COI"
    multi_valued = true
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
}

# ============================================
# UK, Italy, Netherlands, Poland, Industry, Broker
# ============================================
# Using simplified schema for remaining realms

resource "keycloak_realm_user_profile" "gbr_profile" {
  realm_id = keycloak_realm.dive_v3_gbr.id
  unmanaged_attribute_policy = "ENABLED"
  
  attribute {
    name = "username"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "email"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
    validator {
      name = "email"
    }
  }
  
  attribute {
    name = "firstName"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
  
  attribute {
    name = "lastName"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }

  attribute {
    name = "uniqueID"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "clearance"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "clearanceOriginal"
    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "countryOfAffiliation"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "acpCOI"
    multi_valued = true
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
}

# ============================================
# Italy Realm User Profile
# ============================================
resource "keycloak_realm_user_profile" "ita_profile" {
  realm_id = keycloak_realm.dive_v3_ita.id
  unmanaged_attribute_policy = "ENABLED"
  
  attribute {
    name = "username"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "email"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
    validator {
      name = "email"
    }
  }
  
  attribute {
    name = "firstName"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
  
  attribute {
    name = "lastName"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }

  attribute {
    name = "uniqueID"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "clearance"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "clearanceOriginal"
    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "countryOfAffiliation"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "acpCOI"
    multi_valued = true
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
}

# ============================================
# Netherlands Realm User Profile
# ============================================
resource "keycloak_realm_user_profile" "nld_profile" {
  realm_id = keycloak_realm.dive_v3_nld.id
  unmanaged_attribute_policy = "ENABLED"
  
  attribute {
    name = "username"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "email"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
    validator {
      name = "email"
    }
  }
  
  attribute {
    name = "firstName"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
  
  attribute {
    name = "lastName"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }

  attribute {
    name = "uniqueID"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "clearance"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "clearanceOriginal"
    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "countryOfAffiliation"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "acpCOI"
    multi_valued = true
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
}

# ============================================
# Poland Realm User Profile
# ============================================
resource "keycloak_realm_user_profile" "pol_profile" {
  realm_id = keycloak_realm.dive_v3_pol.id
  unmanaged_attribute_policy = "ENABLED"
  
  attribute {
    name = "username"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "email"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
    validator {
      name = "email"
    }
  }
  
  attribute {
    name = "firstName"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
  
  attribute {
    name = "lastName"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }

  attribute {
    name = "uniqueID"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "clearance"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "clearanceOriginal"
    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "countryOfAffiliation"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "acpCOI"
    multi_valued = true
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
}

# ============================================
# Industry Realm User Profile
# ============================================
resource "keycloak_realm_user_profile" "industry_profile" {
  realm_id = keycloak_realm.dive_v3_industry.id
  unmanaged_attribute_policy = "ENABLED"
  
  attribute {
    name = "username"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "email"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
    validator {
      name = "email"
    }
  }
  
  attribute {
    name = "firstName"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
  
  attribute {
    name = "lastName"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }

  attribute {
    name = "uniqueID"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "clearance"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "clearanceOriginal"
    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "countryOfAffiliation"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "acpCOI"
    multi_valued = true
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
}

# ============================================
# Broker Realm User Profile
# ============================================
resource "keycloak_realm_user_profile" "broker_profile" {
  realm_id = keycloak_realm.dive_v3_broker.id
  unmanaged_attribute_policy = "ENABLED"
  
  attribute {
    name = "username"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "email"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
    validator {
      name = "email"
    }
  }
  
  attribute {
    name = "firstName"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
  
  attribute {
    name = "lastName"
    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }

  attribute {
    name = "uniqueID"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "clearance"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "clearanceOriginal"
    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "countryOfAffiliation"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
  
  attribute {
    name = "acpCOI"
    multi_valued = true
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }
}

