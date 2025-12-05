# Tenant Layer: Germany Configuration
# Package: dive.tenant.deu.config
#
# Germany-specific policy configuration for DIVE V3.
# Implements German classification system (VS-Klassifizierung).
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.tenant.deu.config

import rego.v1

# ============================================
# Germany Tenant Identity
# ============================================

tenant_id := "DEU"
tenant_name := "Germany"
tenant_locale := "de-DE"

# ============================================
# German Classification Mapping
# ============================================
# German VS-classification mapped to DIVE V3 standard.
# Reference: Verschlusssachenanweisung (VSA)

classification_mapping := {
	"OFFEN": "UNCLASSIFIED",
	"VS-NUR FÜR DEN DIENSTGEBRAUCH": "RESTRICTED",
	"VS-NUR FUR DEN DIENSTGEBRAUCH": "RESTRICTED",
	"VS-NfD": "RESTRICTED",
	"VS-VERTRAULICH": "CONFIDENTIAL",
	"GEHEIM": "SECRET",
	"STRENG GEHEIM": "TOP_SECRET",
}

# ============================================
# Germany Trusted Issuers
# ============================================

deu_trusted_issuers := {
	"https://deu-idp.dive25.com/realms/dive-v3-broker": {
		"name": "DIVE V3 Germany Keycloak",
		"country": "DEU",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
	"https://sso.bundeswehr.de": {
		"name": "Bundeswehr SSO",
		"country": "DEU",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
	"https://sso.bnd.de": {
		"name": "BND SSO",
		"country": "DEU",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
	"https://deu-idp.prosecurity.biz/realms/dive-v3-broker": {
		"name": "DIVE V3 Germany Prosecurity",
		"country": "DEU",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
}

# ============================================
# Germany Federation Partners
# ============================================
# NATO core members

federation_partners := {"USA", "FRA", "GBR", "NLD", "BEL", "POL"}

# ============================================
# Germany Policy Settings
# ============================================

mfa_threshold := "UNCLASSIFIED"
max_session_hours := 8
default_coi := ["DEU-US", "NATO"]
allow_industry := true

# ============================================
# Germany-Specific Rules
# ============================================

is_deu_trusted_issuer(issuer) if {
	deu_trusted_issuers[issuer]
}

is_federated_partner(country) if {
	country in federation_partners
}





