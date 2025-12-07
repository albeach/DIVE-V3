# Tenant Layer: France Configuration
# Package: dive.tenant.fra.config
#
# France-specific policy configuration for DIVE V3.
# Implements French national classification system.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.tenant.fra.config

import rego.v1

# ============================================
# France Tenant Identity
# ============================================

tenant_id := "FRA"
tenant_name := "France"
tenant_locale := "fr-FR"

# ============================================
# French Classification Mapping
# ============================================
# French classification levels mapped to DIVE V3 standard.
# Reference: Instruction Générale Interministérielle n°1300

classification_mapping := {
	"NON CLASSIFIÉ": "UNCLASSIFIED",
	"NON CLASSIFIE": "UNCLASSIFIED",
	"DIFFUSION RESTREINTE": "RESTRICTED",
	"CONFIDENTIEL DÉFENSE": "CONFIDENTIAL",
	"CONFIDENTIEL DEFENSE": "CONFIDENTIAL",
	"SECRET DÉFENSE": "SECRET",
	"SECRET DEFENSE": "SECRET",
	"TRÈS SECRET DÉFENSE": "TOP_SECRET",
	"TRES SECRET DEFENSE": "TOP_SECRET",
}

# ============================================
# France Trusted Issuers
# ============================================

fra_trusted_issuers := {
	"https://fra-idp.dive25.com/realms/dive-v3-broker": {
		"name": "DIVE V3 France Keycloak",
		"country": "FRA",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
	"https://authentification.defense.gouv.fr": {
		"name": "Ministère des Armées",
		"country": "FRA",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
	"https://sso.dgse.gouv.fr": {
		"name": "DGSE SSO",
		"country": "FRA",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
}

# ============================================
# France Federation Partners
# ============================================

federation_partners := {"USA", "GBR", "DEU", "BEL", "ESP", "ITA"}

# ============================================
# France Policy Settings
# ============================================

mfa_threshold := "UNCLASSIFIED"
max_session_hours := 8
default_coi := ["FRA-US", "NATO", "EU-RESTRICTED"]
allow_industry := true

# ============================================
# France-Specific Rules
# ============================================

is_fra_trusted_issuer(issuer) if {
	fra_trusted_issuers[issuer]
}

is_federated_partner(country) if {
	country in federation_partners
}






