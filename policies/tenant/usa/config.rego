# Tenant Layer: USA Configuration
# Package: dive.tenant.usa.config
#
# USA-specific policy configuration for DIVE V3.
# Extends base tenant configuration with US-specific requirements.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.tenant.usa.config

import rego.v1

# ============================================
# USA Tenant Identity
# ============================================

tenant_id := "USA"
tenant_name := "United States"
tenant_locale := "en-US"

# ============================================
# USA Classification Mapping
# ============================================
# US-specific classification levels mapped to DIVE V3 standard.

classification_mapping := {
	"UNCLASSIFIED": "UNCLASSIFIED",
	"FOUO": "RESTRICTED",
	"CONFIDENTIAL": "CONFIDENTIAL",
	"SECRET": "SECRET",
	"TOP SECRET": "TOP_SECRET",
	"TOP_SECRET": "TOP_SECRET",
	"TS/SCI": "TOP_SECRET",
}

# ============================================
# USA Trusted Issuers
# ============================================
# SSOT: Trusted issuers loaded from OPAL data (MongoDB)
# Use dive.tenant.base.trusted_issuers which loads from data layer
# No hardcoded issuers in tenant config (MongoDB is SSOT)

# ============================================
# USA Federation Partners
# ============================================
# SSOT: Federation matrix loaded from OPAL data (MongoDB)
# Use dive.tenant.base.federation_matrix which loads from data layer
# No hardcoded federation partners in tenant config (MongoDB is SSOT)

# ============================================
# USA Policy Settings
# ============================================

# MFA required for classifications above this level
mfa_threshold := "UNCLASSIFIED"

# Maximum session duration (hours)
max_session_hours := 10

# Default COI memberships for USA users
default_coi := ["US-ONLY", "FVEY", "NATO"]

# Allow industry contractors by default
allow_industry := true

# ============================================
# USA-Specific Rules
# ============================================

# Check if issuer is USA-trusted (uses data from dive.tenant.base)
is_usa_trusted_issuer(issuer) if {
	data.dive.tenant.base.is_trusted_issuer(issuer)
	data.dive.tenant.base.issuer_metadata(issuer).tenant == "USA"
}

# Check if user is from federated partner (uses data from dive.tenant.base)
is_federated_partner(country) if {
	data.dive.tenant.base.can_federate("USA", country)
}

