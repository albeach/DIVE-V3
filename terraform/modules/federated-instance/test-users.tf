# Federated Instance Module - Test Users
# Creates standardized test users for pilot demonstrations
#
# PILOT STANDARD (v2.0 - with RESTRICTED clearance):
#   - 5 users per instance with predictable naming
#   - Format: testuser-{code}-{level}
#   - Level 1-5 corresponds to clearance (higher = more access)
#   - Single password for all: TestUser2025!Pilot
#
# Quick Reference:
#   testuser-usa-1 / TestUser2025!Pilot → UNCLASSIFIED  (AAL1)
#   testuser-usa-2 / TestUser2025!Pilot → RESTRICTED    (AAL1)
#   testuser-usa-3 / TestUser2025!Pilot → CONFIDENTIAL  (AAL2 - MFA)
#   testuser-usa-4 / TestUser2025!Pilot → SECRET        (AAL2 - MFA)
#   testuser-usa-5 / TestUser2025!Pilot → TOP_SECRET    (AAL3 - MFA + HW)
#
# PII Minimization (ACP-240 Section 6.2):
#   - Real names NOT used - ocean-themed pseudonyms generated
#   - Pseudonyms are deterministic based on username hash
#   - uniqueID = username (no suffix)
#
# Cross-border example:
#   Login to FRA instance as testuser-deu-4 → German SECRET user on French system

# ============================================================================
# LOCAL VARIABLES
# ============================================================================

locals {
  # NIST 800-63B Compliant Passwords (provided securely via variables/GCP)
  pilot_password = var.test_user_password

  # Ocean-themed adjectives for pseudonym generation (36 options)
  ocean_adjectives = [
    "Azure", "Blue", "Cerulean", "Deep", "Electric", "Frosted",
    "Golden", "Jade", "Midnight", "Pacific", "Royal", "Sapphire",
    "Teal", "Turquoise", "Coral", "Pearl", "Silver", "Arctic",
    "Crystalline", "Emerald", "Indigo", "Obsidian", "Platinum", "Violet",
    "Aquamarine", "Bronze", "Cobalt", "Diamond", "Ebony", "Fuchsia",
    "Garnet", "Honey", "Ivory", "Jasper", "Kyanite", "Lavender"
  ]

  # Ocean-themed nouns for pseudonym generation (36 options)
  ocean_nouns = [
    "Whale", "Dolphin", "Orca", "Marlin", "Shark", "Ray",
    "Reef", "Current", "Wave", "Tide", "Storm", "Breeze",
    "Kelp", "Anemone", "Starfish", "Octopus", "Nautilus", "Turtle",
    "Lagoon", "Atoll", "Channel", "Harbor", "Bay", "Strait",
    "Jellyfish", "Seahorse", "Manta", "Barracuda", "Angelfish", "Clownfish",
    "Eel", "Grouper", "Lobster", "Manatee", "Narwhal", "Pufferfish"
  ]

  # Nation-specific ocean prefixes for pseudonyms
  nation_prefixes = {
    "USA" = "Atlantic"
    "FRA" = "Mediterranean"
    "CAN" = "Arctic"
    "GBR" = "North"
    "DEU" = "Baltic"
    "ITA" = "Adriatic"
    "ESP" = "Iberian"
    "POL" = "Vistula"
    "NLD" = "Nordic"
    "NZL" = "Pacific"
    "AUS" = "Southern"
    "EST" = "Baltic"
    "LVA" = "Baltic"
    "LTU" = "Baltic"
  }

  # Get nation prefix for this instance (default to Atlantic)
  nation_prefix = lookup(local.nation_prefixes, var.instance_code, "Atlantic")

  # Country-specific classification mappings
  # CRITICAL ARCHITECTURAL FIX (2026-02-08):
  # Users must store their ACTUAL national classification (e.g., "OFFEN")
  # not the normalized NATO standard (e.g., "UNCLASSIFIED").
  #
  # The backend clearance-mapper.service.ts normalizes country-specific
  # classifications to standard levels for policy evaluation (SSOT).
  #
  # Based on: backend/src/services/clearance-mapper.service.ts (CLEARANCE_EQUIVALENCY_TABLE)
  national_clearances = {
    # NATO English-speaking countries
    USA = ["UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP SECRET"]
    CAN = ["UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP SECRET"]
    GBR = ["UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP SECRET"]
    NZL = ["UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP SECRET"]

    # Germany - Verschlusssache (VS) classification
    DEU = ["OFFEN", "VS-NUR FÜR DEN DIENSTGEBRAUCH", "VS-VERTRAULICH", "GEHEIM", "STRENG GEHEIM"]

    # France - Classification française
    FRA = ["NON CLASSIFIÉ", "DIFFUSION RESTREINTE", "CONFIDENTIEL DÉFENSE", "SECRET DÉFENSE", "TRÈS SECRET DÉFENSE"]

    # Italy - Classificazione italiana
    ITA = ["NON CLASSIFICATO", "RISERVATO", "RISERVATISSIMO", "SEGRETO", "SEGRETISSIMO"]

    # Spain - Clasificación española
    ESP = ["NO CLASIFICADO", "DIFUSIÓN LIMITADA", "CONFIDENCIAL", "SECRETO", "ALTO SECRETO"]

    # Poland - Klauzule tajności
    POL = ["NIEJAWNE", "ZASTRZEŻONE", "POUFNE", "TAJNE", "ŚCIŚLE TAJNE"]

    # Netherlands - Nederlandse rubricering
    NLD = ["NIET-GERUBRICEERD", "DEPARTEMENTAAL VERTROUWELIJK", "CONFIDENTIEEL", "GEHEIM", "ZEER GEHEIM"]

    # Estonia - Eesti salastusastmed
    EST = ["AVALIK", "PIIRATUD", "KONFIDENTSIAALNE", "SALAJANE", "TÄIESTI SALAJANE"]
  }

  # Get country-specific clearances for this instance (fallback to NATO standard)
  instance_clearances = lookup(local.national_clearances, var.instance_code,
  ["UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP SECRET"])

  # Clearance levels mapped to numbers (1=lowest, 5=highest)
  # UPDATED (2026-02-08): Use country-specific classifications
  clearance_levels = {
    "1" = {
      clearance         = local.instance_clearances[0] # UNCLASSIFIED equivalent
      coi               = []
      display_name      = "Level 1 - Unclassified"
      organization_type = "GOV"
      aal               = 1
      mfa_required      = false
    }
    "2" = {
      clearance         = local.instance_clearances[1] # RESTRICTED equivalent
      coi               = []
      display_name      = "Level 2 - Restricted"
      organization_type = "GOV"
      aal               = 1
      mfa_required      = false
    }
    "3" = {
      clearance         = local.instance_clearances[2] # CONFIDENTIAL equivalent
      coi               = []
      display_name      = "Level 3 - Confidential"
      organization_type = "GOV"
      aal               = 2
      mfa_required      = true
    }
    "4" = {
      clearance         = local.instance_clearances[3] # SECRET equivalent
      coi               = ["NATO"]
      display_name      = "Level 4 - Secret"
      organization_type = "GOV"
      aal               = 2
      mfa_required      = true
    }
    "5" = {
      clearance         = local.instance_clearances[4] # TOP SECRET equivalent
      coi               = ["FVEY", "NATO-COSMIC"]
      display_name      = "Level 5 - Top Secret"
      organization_type = "GOV"
      aal               = 3
      mfa_required      = true
    }
  }

  # Generate pseudonyms for each user level
  # Using a deterministic formula: hash(username) → adjective + noun
  user_pseudonyms = {
    for level, config in local.clearance_levels : level => {
      # Deterministic pseudonym based on username hash
      # Formula: (sum of ASCII chars) mod array_length
      username   = "testuser-${lower(var.instance_code)}-${level}"
      adj_index  = sum([for i, c in split("", "testuser-${lower(var.instance_code)}-${level}") : pow(31, i) * (try(tonumber(c), 0) == 0 ? (index(split("", "abcdefghijklmnopqrstuvwxyz-0123456789"), c) + 97) : tonumber(c) + 48)]) % length(local.ocean_adjectives)
      noun_index = floor(sum([for i, c in split("", "testuser-${lower(var.instance_code)}-${level}") : pow(31, i) * (try(tonumber(c), 0) == 0 ? (index(split("", "abcdefghijklmnopqrstuvwxyz-0123456789"), c) + 97) : tonumber(c) + 48)]) / 256) % length(local.ocean_nouns)
    }
  }

  # Industry partner test users (ACP-240 Section 4.2)
  # Real company names per country for realistic pilot demos
  # Each country has ONE endorsed industry partner
  # UPDATED (2026-02-08): Use country-specific clearances
  industry_partners = {
    "USA" = {
      company_name  = "Booz Allen Hamilton"
      company_short = "bah"
      email_domain  = "bah.com"
      clearance     = local.instance_clearances[3] # SECRET equivalent
      coi           = ["NATO"]
    }
    "DEU" = {
      company_name  = "IABG"
      company_short = "iabg"
      email_domain  = "iabg.de"
      clearance     = local.instance_clearances[3] # SECRET equivalent (GEHEIM)
      coi           = ["NATO"]
    }
    "FRA" = {
      company_name  = "Thales"
      company_short = "thales"
      email_domain  = "thalesgroup.com"
      clearance     = local.instance_clearances[3] # SECRET equivalent (SECRET DÉFENSE)
      coi           = ["NATO"]
    }
  }

  # Get this instance's industry partner (if defined)
  this_industry_partner = lookup(local.industry_partners, var.instance_code, null)
}

# ============================================================================
# TEST USERS RESOURCE
# ============================================================================

resource "keycloak_user" "pilot_users" {
  for_each = var.create_test_users ? local.clearance_levels : {}

  realm_id = keycloak_realm.broker.id
  username = "testuser-${lower(var.instance_code)}-${each.key}"
  enabled  = true

  # PII Minimization: Use pseudonymized email (hash-based)
  email = "${substr(md5("testuser-${lower(var.instance_code)}-${each.key}-${var.instance_code}"), 0, 8)}@pseudonym.dive25.mil"

  # PII Minimization: Ocean-themed pseudonyms instead of real names
  # Using simple deterministic mapping based on level and instance
  first_name = local.ocean_adjectives[(each.key + length(var.instance_code)) % length(local.ocean_adjectives)]
  last_name  = local.ocean_nouns[(each.key * 7 + length(var.instance_code)) % length(local.ocean_nouns)]

  initial_password {
    value     = local.pilot_password
    temporary = false
  }

  # Core attributes + conditional COI (only set if non-empty)
  # FIX: Don't set acpCOI at all for empty arrays - prevents "[]" string bug
  attributes = merge(
    {
      # Core DIVE attributes
      clearance            = each.value.clearance
      countryOfAffiliation = var.instance_code
      uniqueID             = "testuser-${lower(var.instance_code)}-${each.key}" # No suffix!

      # Extended attributes
      userType         = "military"
      organization     = "${var.instance_name} Defense"
      organizationType = each.value.organization_type # ACP-240 Section 4.2

      # Pilot metadata
      pilot_user      = "true"
      clearance_level = tonumber(each.key)
      created_by      = "terraform"

      # AAL level for MFA enforcement
      aal_level = tostring(each.value.aal)
    },
    # Only include acpCOI if user has COI tags (prevents empty "[]" string in token)
    length(each.value.coi) > 0 ? {
      # Store as JSON string to allow claim_value_type=JSON mapper
      acpCOI = jsonencode(each.value.coi)
    } : {}
  )

  lifecycle {
    ignore_changes = [initial_password]
  }

  depends_on = [
    keycloak_realm_user_profile.dive_attributes
  ]
}


# ============================================================================
# INDUSTRY PARTNER TEST USERS (ACP-240 Section 4.2)
# ============================================================================
# Named industry partners per country for realistic pilot demos:
#   USA: Booz Allen Hamilton (BAH) - contractor.bah@bah.com
#   DEU: IABG - contractor.iabg@iabg.de
#   FRA: Thales - contractor.thales@thalesgroup.com
#
# Each industry user is endorsed by their home country (primaryEndorser)

resource "keycloak_user" "industry_partner" {
  count = var.create_test_users && local.this_industry_partner != null ? 1 : 0

  realm_id = keycloak_realm.broker.id
  username = "contractor.${local.this_industry_partner.company_short}"
  enabled  = true

  # Industry users use company email domain
  email = "contractor.${local.this_industry_partner.company_short}@${local.this_industry_partner.email_domain}"

  # PII Minimization: Ocean-themed pseudonyms for contractors too
  first_name = "Pacific" # Neutral ocean for industry
  last_name  = local.ocean_nouns[(length(local.this_industry_partner.company_short) * 5) % length(local.ocean_nouns)]

  initial_password {
    value     = local.pilot_password
    temporary = false
  }

  # Core attributes + conditional COI (only set if non-empty)
  # FIX: Don't set acpCOI at all for empty arrays - prevents "[]" string bug
  attributes = merge(
    {
      # Core DIVE attributes
      clearance            = local.this_industry_partner.clearance
      countryOfAffiliation = var.instance_code
      uniqueID             = "contractor.${local.this_industry_partner.company_short}" # No email suffix!

      # Industry-specific attributes (Primary Endorser Model)
      organizationType = "INDUSTRY"
      organization     = local.this_industry_partner.company_name
      primaryEndorser  = var.instance_code # This country endorses this contractor
      userType         = "contractor"

      # Pilot metadata
      pilot_user    = "true"
      industry_user = "true"
      created_by    = "terraform"

      # AAL level for industry (SECRET = AAL2)
      aal_level = "2"
    },
    # Only include acpCOI if user has COI tags (prevents empty "[]" string in token)
    length(local.this_industry_partner.coi) > 0 ? {
      acpCOI = jsonencode(local.this_industry_partner.coi)
    } : {}
  )

  lifecycle {
    ignore_changes = [initial_password]
  }

  depends_on = [
    keycloak_realm_user_profile.dive_attributes
  ]
}

# ============================================================================
# OUTPUTS
# ============================================================================

output "pilot_users" {
  description = "Pilot test users created for this instance"
  value = var.create_test_users ? {
    for level, config in local.clearance_levels : "level_${level}" => {
      username          = "testuser-${lower(var.instance_code)}-${level}"
      clearance         = config.clearance
      organization_type = config.organization_type
      aal_level         = config.aal
      mfa_required      = config.mfa_required
      password          = local.pilot_password
    }
  } : {}
  sensitive = true
}

output "industry_partner" {
  description = "Industry partner for this instance"
  value = var.create_test_users && local.this_industry_partner != null ? {
    username  = "contractor.${local.this_industry_partner.company_short}"
    company   = local.this_industry_partner.company_name
    clearance = local.this_industry_partner.clearance
    endorser  = var.instance_code
    password  = local.pilot_password
  } : null
  sensitive = true
}

output "pilot_user_credentials" {
  description = "Quick reference for demo credentials"
  value = var.create_test_users ? (
    local.this_industry_partner != null
    ? "GOV: testuser-${lower(var.instance_code)}-{1,2,3,4,5} / ${local.pilot_password} | INDUSTRY: contractor.${local.this_industry_partner.company_short} / ${local.pilot_password}"
    : "GOV: testuser-${lower(var.instance_code)}-{1,2,3,4,5} / ${local.pilot_password}"
  ) : "Test users not created"
  sensitive = true
}
