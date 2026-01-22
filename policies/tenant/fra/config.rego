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
# SSOT: Trusted issuers loaded from OPAL data (MongoDB)
# Use dive.tenant.base.trusted_issuers which loads from data layer
# No hardcoded issuers in tenant config (MongoDB is SSOT)

# ============================================
# France Federation Partners
# ============================================
# SSOT: Federation matrix loaded from OPAL data (MongoDB)
# Use dive.tenant.base.federation_matrix which loads from data layer
# No hardcoded federation partners in tenant config (MongoDB is SSOT)

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
	data.dive.tenant.base.is_trusted_issuer(issuer)
	data.dive.tenant.base.issuer_metadata(issuer).tenant == "FRA"
}

is_federated_partner(country) if {
	data.dive.tenant.base.can_federate("FRA", country)
}

