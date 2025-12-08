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
# List of trusted identity providers for USA tenant.

usa_trusted_issuers := {
	"https://usa-idp.dive25.com/realms/dive-v3-broker": {
		"name": "DIVE V3 USA Keycloak",
		"country": "USA",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
	"https://login.disa.mil": {
		"name": "DoD Identity Provider",
		"country": "USA",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
	"https://sso.army.mil": {
		"name": "US Army SSO",
		"country": "USA",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
	"https://sso.navy.mil": {
		"name": "US Navy SSO",
		"country": "USA",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
	"https://sso.af.mil": {
		"name": "US Air Force SSO",
		"country": "USA",
		"trust_level": "HIGH",
		"mfa_capable": true,
	},
	"http://localhost:8443/realms/dive-v3-broker": {
		"name": "Local Development",
		"country": "USA",
		"trust_level": "DEVELOPMENT",
		"mfa_capable": true,
	},
	"https://localhost:8443/realms/dive-v3-broker": {
		"name": "Local Development (HTTPS)",
		"country": "USA",
		"trust_level": "DEVELOPMENT",
		"mfa_capable": true,
	},
}

# ============================================
# USA Federation Partners
# ============================================
# Countries USA will federate with.

federation_partners := {"FRA", "GBR", "DEU", "CAN", "AUS", "NZL"}

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

# Check if issuer is USA-trusted
is_usa_trusted_issuer(issuer) if {
	usa_trusted_issuers[issuer]
}

# Check if user is from federated partner
is_federated_partner(country) if {
	country in federation_partners
}







