# Tenant Layer: Base Configuration
# Package: dive.tenant.base
#
# Provides tenant configuration management for multi-tenant DIVE V3 deployments.
# Each tenant (USA, FRA, GBR, DEU) has its own:
# - Trusted issuers
# - Federation partners
# - Classification mappings (via org layer)
# - Local policy customizations
#
# This module loads tenant-specific configuration from OPAL data or falls back
# to static defaults.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.tenant.base

import rego.v1

# ============================================
# Tenant Identification
# ============================================
# The current tenant is determined from:
# 1. input.context.tenant (explicit)
# 2. input.subject.issuer (derived from token issuer)
# 3. data.tenant_id (OPAL-provided)

current_tenant := tenant if {
	tenant := input.context.tenant
} else := tenant if {
	issuer := input.subject.issuer
	tenant := issuer_to_tenant[issuer]
} else := tenant if {
	tenant := data.tenant_id
} else := "USA" # Default fallback

# ============================================
# Trusted Issuers Registry
# ============================================
# Maps issuer URLs to tenant IDs.
# In production, this is loaded from OPAL (data.trusted_issuers).

default_trusted_issuers := {
	# USA Issuers
	"https://usa-idp.dive25.com/realms/dive-v3-broker": {
		"tenant": "USA",
		"name": "USA Keycloak",
		"country": "USA",
		"trust_level": "HIGH",
	},
	"https://login.disa.mil": {
		"tenant": "USA",
		"name": "DoD CAC",
		"country": "USA",
		"trust_level": "HIGH",
	},
	"https://sso.army.mil": {
		"tenant": "USA",
		"name": "US Army SSO",
		"country": "USA",
		"trust_level": "HIGH",
	},
	# France Issuers
	"https://fra-idp.dive25.com/realms/dive-v3-broker": {
		"tenant": "FRA",
		"name": "France Keycloak",
		"country": "FRA",
		"trust_level": "HIGH",
	},
	"https://authentification.defense.gouv.fr": {
		"tenant": "FRA",
		"name": "French MoD SSO",
		"country": "FRA",
		"trust_level": "HIGH",
	},
	# UK Issuers
	"https://gbr-idp.dive25.com/realms/dive-v3-broker": {
		"tenant": "GBR",
		"name": "UK Keycloak",
		"country": "GBR",
		"trust_level": "HIGH",
	},
	"https://sso.mod.uk": {
		"tenant": "GBR",
		"name": "UK MoD SSO",
		"country": "GBR",
		"trust_level": "HIGH",
	},
	# Germany Issuers
	"https://deu-idp.dive25.com/realms/dive-v3-broker": {
		"tenant": "DEU",
		"name": "Germany Keycloak",
		"country": "DEU",
		"trust_level": "HIGH",
	},
	"https://sso.bundeswehr.de": {
		"tenant": "DEU",
		"name": "Bundeswehr SSO",
		"country": "DEU",
		"trust_level": "HIGH",
	},
	# Local Development - Hub
	"http://localhost:8443/realms/dive-v3-broker": {
		"tenant": "USA",
		"name": "Local Dev Keycloak",
		"country": "USA",
		"trust_level": "DEVELOPMENT",
	},
	"https://localhost:8443/realms/dive-v3-broker": {
		"tenant": "USA",
		"name": "Local Dev Keycloak (HTTPS)",
		"country": "USA",
		"trust_level": "DEVELOPMENT",
	},
	# Local Development - Spokes (NATO Port Convention)
	"https://localhost:8444/realms/dive-v3-broker-alb": {
		"tenant": "ALB",
		"name": "Albania Keycloak (Local Dev)",
		"country": "ALB",
		"trust_level": "DEVELOPMENT",
	},
	"https://localhost:8445/realms/dive-v3-broker-bel": {
		"tenant": "BEL",
		"name": "Belgium Keycloak (Local Dev)",
		"country": "BEL",
		"trust_level": "DEVELOPMENT",
	},
	"https://localhost:8450/realms/dive-v3-broker-dnk": {
		"tenant": "DNK",
		"name": "Denmark Keycloak (Local Dev)",
		"country": "DNK",
		"trust_level": "DEVELOPMENT",
	},
	"https://localhost:8465/realms/dive-v3-broker-nor": {
		"tenant": "NOR",
		"name": "Norway Keycloak (Local Dev)",
		"country": "NOR",
		"trust_level": "DEVELOPMENT",
	},
	"https://localhost:8466/realms/dive-v3-broker-pol": {
		"tenant": "POL",
		"name": "Poland Keycloak (Local Dev)",
		"country": "POL",
		"trust_level": "DEVELOPMENT",
	},
}

# Use OPAL-provided data if available
trusted_issuers := data.trusted_issuers if {
	data.trusted_issuers
} else := default_trusted_issuers

# ============================================
# Issuer Validation
# ============================================

# Check if issuer is trusted
is_trusted_issuer(issuer) if {
	trusted_issuers[issuer]
}

# Get issuer metadata
issuer_metadata(issuer) := meta if {
	meta := trusted_issuers[issuer]
} else := {}

# Get tenant for issuer
issuer_to_tenant := {iss: meta.tenant |
	some iss, meta in trusted_issuers
}

# Get all issuers for a tenant
tenant_issuers(tenant) := issuers if {
	issuers := {iss |
		some iss, meta in trusted_issuers
		meta.tenant == tenant
	}
}

# ============================================
# Federation Partners Registry
# ============================================
# Defines which tenants can federate with each other.
# Uses bilateral trust model per ACP-240.

default_federation_matrix := {
	# Original partners
	"USA": {"FRA", "GBR", "DEU", "ALB", "BEL", "DNK", "NOR", "POL"},
	"FRA": {"USA", "GBR", "DEU", "ALB", "BEL", "DNK", "NOR", "POL"},
	"GBR": {"USA", "FRA", "DEU", "ALB", "BEL", "DNK", "NOR", "POL"},
	"DEU": {"USA", "FRA", "GBR", "ALB", "BEL", "DNK", "NOR", "POL"},
	# NATO Spokes - all can federate with USA and each other
	"ALB": {"USA", "FRA", "GBR", "DEU", "BEL", "DNK", "NOR", "POL"},
	"BEL": {"USA", "FRA", "GBR", "DEU", "ALB", "DNK", "NOR", "POL"},
	"DNK": {"USA", "FRA", "GBR", "DEU", "ALB", "BEL", "NOR", "POL"},
	"NOR": {"USA", "FRA", "GBR", "DEU", "ALB", "BEL", "DNK", "POL"},
	"POL": {"USA", "FRA", "GBR", "DEU", "ALB", "BEL", "DNK", "NOR"},
}

# Use OPAL-provided data if available
federation_matrix := data.federation_matrix if {
	data.federation_matrix
} else := default_federation_matrix

# Check if two tenants can federate
can_federate(tenant_a, tenant_b) if {
	tenant_a == tenant_b # Same tenant always trusts itself
}

can_federate(tenant_a, tenant_b) if {
	tenant_b in federation_matrix[tenant_a]
}

# Get federation partners for a tenant
federation_partners(tenant) := partners if {
	partners := federation_matrix[tenant]
} else := set()

# ============================================
# Tenant Configuration
# ============================================
# Per-tenant policy configuration.

default_tenant_configs := {
	"USA": {
		"code": "USA",
		"name": "United States",
		"locale": "en-US",
		"mfa_required_above": "UNCLASSIFIED",
		"max_session_hours": 10,
		"default_coi": ["US-ONLY", "FVEY", "NATO"],
	},
	"FRA": {
		"code": "FRA",
		"name": "France",
		"locale": "fr-FR",
		"mfa_required_above": "UNCLASSIFIED",
		"max_session_hours": 8,
		"default_coi": ["FRA-US", "FVEY", "NATO"],
	},
	"GBR": {
		"code": "GBR",
		"name": "United Kingdom",
		"locale": "en-GB",
		"mfa_required_above": "UNCLASSIFIED",
		"max_session_hours": 8,
		"default_coi": ["GBR-US", "FVEY", "NATO"],
	},
	"DEU": {
		"code": "DEU",
		"name": "Germany",
		"locale": "de-DE",
		"mfa_required_above": "UNCLASSIFIED",
		"max_session_hours": 8,
		"default_coi": ["DEU-US", "NATO"],
	},
}

# Use OPAL-provided data if available
tenant_configs := data.tenant_configs if {
	data.tenant_configs
} else := default_tenant_configs

# Get configuration for current tenant
current_tenant_config := config if {
	config := tenant_configs[current_tenant]
} else := {
	"code": current_tenant,
	"name": "Unknown",
	"locale": "en-US",
	"mfa_required_above": "UNCLASSIFIED",
	"max_session_hours": 8,
	"default_coi": [],
}

# ============================================
# Subject Origin Validation
# ============================================

# Get subject's originating tenant from issuer
subject_tenant := tenant if {
	issuer := input.subject.issuer
	meta := issuer_metadata(issuer)
	tenant := meta.tenant
} else := "UNKNOWN"

# Check if subject is from trusted origin
is_from_trusted_origin if {
	issuer := input.subject.issuer
	is_trusted_issuer(issuer)
}

# Check if subject can access current tenant's resources
subject_can_access_tenant if {
	is_from_trusted_origin
	can_federate(subject_tenant, current_tenant)
}

# ============================================
# Error Messages
# ============================================

untrusted_issuer_msg(issuer) := msg if {
	msg := sprintf("Untrusted token issuer: %s", [issuer])
}

federation_denied_msg(subject_tenant, target_tenant) := msg if {
	msg := sprintf("Federation denied: %s cannot access %s resources", [
		subject_tenant,
		target_tenant,
	])
}

# ============================================
# Tenant List
# ============================================

all_tenants := {"USA", "FRA", "GBR", "DEU", "ALB", "BEL", "DNK", "NOR", "POL"}

is_valid_tenant(tenant) if {
	tenant in all_tenants
}
