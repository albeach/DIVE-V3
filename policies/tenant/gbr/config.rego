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
# SSOT: Trusted issuers loaded from OPAL data (MongoDB)
# Use dive.tenant.base.trusted_issuers which loads from data layer
# No hardcoded issuers in tenant config (MongoDB is SSOT)

# ============================================
# UK Federation Partners
# ============================================
# SSOT: Federation matrix loaded from OPAL data (MongoDB)
# Use dive.tenant.base.federation_matrix which loads from data layer
# No hardcoded federation partners in tenant config (MongoDB is SSOT)

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
	data.dive.tenant.base.is_trusted_issuer(issuer)
	data.dive.tenant.base.issuer_metadata(issuer).tenant == "GBR"
}

is_federated_partner(country) if {
	data.dive.tenant.base.can_federate("GBR", country)
}

