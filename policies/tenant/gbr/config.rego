# Tenant Layer: United Kingdom Configuration
# Package: dive.tenant.gbr.config
#
# UK-specific policy configuration for DIVE V3.
# Implements UK Government Security Classifications.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.tenant.gbr.config

import rego.v1

# ============================================
# UK Tenant Identity
# ============================================

tenant_id := "GBR"
tenant_name := "United Kingdom"
tenant_locale := "en-GB"

# ============================================
# UK Classification Mapping
# ============================================
# UK Government Security Classifications mapped to DIVE V3 standard.
# Reference: Government Security Classifications (GSC) April 2014

classification_mapping := {
	"UNCLASSIFIED": "UNCLASSIFIED",
	"OFFICIAL": "RESTRICTED",
	"OFFICIAL-SENSITIVE": "RESTRICTED",
	"OFFICIAL: SENSITIVE": "RESTRICTED",
	"CONFIDENTIAL": "CONFIDENTIAL",
	"SECRET": "SECRET",
	"TOP SECRET": "TOP_SECRET",
	"TOP_SECRET": "TOP_SECRET",
	"UK EYES ONLY": "SECRET",
}

# ============================================
# UK Trusted Issuers
# ============================================

gbr_trusted_issuers := {
	"https://gbr-idp.dive25.com/realms/dive-v3-broker": {
		"name": "DIVE V3 UK Keycloak",
		"country": "GBR",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
	"https://sso.mod.uk": {
		"name": "UK Ministry of Defence",
		"country": "GBR",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
	"https://sso.gchq.gov.uk": {
		"name": "GCHQ SSO",
		"country": "GBR",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
	"https://sso.mi5.gov.uk": {
		"name": "MI5 SSO",
		"country": "GBR",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
}

# ============================================
# UK Federation Partners
# ============================================
# Five Eyes + NATO core members

federation_partners := {"USA", "CAN", "AUS", "NZL", "FRA", "DEU"}

# ============================================
# UK Policy Settings
# ============================================

mfa_threshold := "UNCLASSIFIED"
max_session_hours := 8
default_coi := ["GBR-US", "FVEY", "NATO", "AUKUS"]
allow_industry := true

# ============================================
# UK-Specific Rules
# ============================================

is_gbr_trusted_issuer(issuer) if {
	gbr_trusted_issuers[issuer]
}

is_federated_partner(country) if {
	country in federation_partners
}






