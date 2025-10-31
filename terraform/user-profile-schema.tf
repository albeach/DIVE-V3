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
    
    validator {
      name = "options"
      config = {
        options = jsonencode(["NO CLASIFICADO", "CONFIDENCIAL", "DIFUSIÓN LIMITADA", "SECRETO", "ALTO SECRETO"])
      }
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
    
    validator {
      name = "options"
      config = {
        options = jsonencode(["NON PROTEGE", "CONFIDENTIEL DEFENSE", "SECRET DEFENSE", "TRES SECRET DEFENSE"])
      }
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
# Repeat for other 7 realms (GBR, DEU, ITA, NLD, POL, CAN, INDUSTRY)
# ============================================
# Note: This file implements proper declarative User Profile schema
# Keycloak 26 REQUIRES this for custom attributes to work
# 
# Once applied, user attributes should sync correctly from Terraform

