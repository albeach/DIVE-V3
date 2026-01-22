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
# SSOT: Trusted issuers loaded from OPAL data (MongoDB)
# Use dive.tenant.base.trusted_issuers which loads from data layer
# No hardcoded issuers in tenant config (MongoDB is SSOT)

# ============================================
# Germany Federation Partners
# ============================================
# SSOT: Federation matrix loaded from OPAL data (MongoDB)
# Use dive.tenant.base.federation_matrix which loads from data layer
# No hardcoded federation partners in tenant config (MongoDB is SSOT)

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
	data.dive.tenant.base.is_trusted_issuer(issuer)
	data.dive.tenant.base.issuer_metadata(issuer).tenant == "DEU"
}

is_federated_partner(country) if {
	data.dive.tenant.base.can_federate("DEU", country)
}

