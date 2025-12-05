# Tests for Tenant Base Configuration
# Package: dive.tenant.base_test

package dive.tenant.base_test

import rego.v1

import data.dive.tenant.base

# ============================================
# Current Tenant Tests
# ============================================

test_current_tenant_from_context if {
	result := base.current_tenant with input.context.tenant as "FRA"
	result == "FRA"
}

test_current_tenant_from_issuer if {
	result := base.current_tenant with input.subject.issuer as "https://fra-idp.dive25.com/realms/dive-v3-broker"
	result == "FRA"
}

test_current_tenant_default_usa if {
	result := base.current_tenant
	result == "USA"
}

# ============================================
# Trusted Issuer Tests
# ============================================

test_is_trusted_issuer_usa if {
	base.is_trusted_issuer("https://usa-idp.dive25.com/realms/dive-v3-broker")
}

test_is_trusted_issuer_fra if {
	base.is_trusted_issuer("https://fra-idp.dive25.com/realms/dive-v3-broker")
}

test_is_trusted_issuer_gbr if {
	base.is_trusted_issuer("https://gbr-idp.dive25.com/realms/dive-v3-broker")
}

test_is_trusted_issuer_deu if {
	base.is_trusted_issuer("https://deu-idp.dive25.com/realms/dive-v3-broker")
}

test_not_trusted_issuer_unknown if {
	not base.is_trusted_issuer("https://evil.example.com/realms/fake")
}

test_is_trusted_issuer_localhost if {
	base.is_trusted_issuer("http://localhost:8443/realms/dive-v3-broker")
}

# ============================================
# Issuer Metadata Tests
# ============================================

test_issuer_metadata_usa if {
	meta := base.issuer_metadata("https://usa-idp.dive25.com/realms/dive-v3-broker")
	meta.tenant == "USA"
	meta.country == "USA"
}

test_issuer_metadata_fra if {
	meta := base.issuer_metadata("https://fra-idp.dive25.com/realms/dive-v3-broker")
	meta.tenant == "FRA"
	meta.country == "FRA"
}

test_issuer_metadata_unknown_empty if {
	meta := base.issuer_metadata("https://unknown.example.com")
	meta == {}
}

# ============================================
# Issuer to Tenant Mapping Tests
# ============================================

test_issuer_to_tenant_usa if {
	base.issuer_to_tenant["https://usa-idp.dive25.com/realms/dive-v3-broker"] == "USA"
}

test_issuer_to_tenant_fra if {
	base.issuer_to_tenant["https://fra-idp.dive25.com/realms/dive-v3-broker"] == "FRA"
}

test_issuer_to_tenant_gbr if {
	base.issuer_to_tenant["https://gbr-idp.dive25.com/realms/dive-v3-broker"] == "GBR"
}

# ============================================
# Tenant Issuers Tests
# ============================================

test_tenant_issuers_usa_contains_usa_idp if {
	issuers := base.tenant_issuers("USA")
	"https://usa-idp.dive25.com/realms/dive-v3-broker" in issuers
}

test_tenant_issuers_fra_contains_fra_idp if {
	issuers := base.tenant_issuers("FRA")
	"https://fra-idp.dive25.com/realms/dive-v3-broker" in issuers
}

# ============================================
# Federation Tests
# ============================================

test_can_federate_same_tenant if {
	base.can_federate("USA", "USA")
}

test_can_federate_usa_fra if {
	base.can_federate("USA", "FRA")
}

test_can_federate_usa_gbr if {
	base.can_federate("USA", "GBR")
}

test_can_federate_usa_deu if {
	base.can_federate("USA", "DEU")
}

test_can_federate_fra_gbr if {
	base.can_federate("FRA", "GBR")
}

test_can_federate_gbr_deu if {
	base.can_federate("GBR", "DEU")
}

test_federation_partners_usa if {
	partners := base.federation_partners("USA")
	"FRA" in partners
	"GBR" in partners
	"DEU" in partners
}

test_federation_partners_fra if {
	partners := base.federation_partners("FRA")
	"USA" in partners
	"GBR" in partners
}

# ============================================
# Tenant Config Tests
# ============================================

test_current_tenant_config_usa if {
	config := base.current_tenant_config with input.context.tenant as "USA"
	config.code == "USA"
	config.locale == "en-US"
}

test_current_tenant_config_fra if {
	config := base.current_tenant_config with input.context.tenant as "FRA"
	config.code == "FRA"
	config.locale == "fr-FR"
}

test_current_tenant_config_deu if {
	config := base.current_tenant_config with input.context.tenant as "DEU"
	config.code == "DEU"
	config.locale == "de-DE"
}

# ============================================
# Subject Tenant Tests
# ============================================

test_subject_tenant_from_usa_issuer if {
	result := base.subject_tenant with input.subject.issuer as "https://usa-idp.dive25.com/realms/dive-v3-broker"
	result == "USA"
}

test_subject_tenant_from_fra_issuer if {
	result := base.subject_tenant with input.subject.issuer as "https://fra-idp.dive25.com/realms/dive-v3-broker"
	result == "FRA"
}

test_subject_tenant_unknown_issuer if {
	result := base.subject_tenant with input.subject.issuer as "https://unknown.example.com"
	result == "UNKNOWN"
}

# ============================================
# Trusted Origin Tests
# ============================================

test_is_from_trusted_origin_usa if {
	base.is_from_trusted_origin with input.subject.issuer as "https://usa-idp.dive25.com/realms/dive-v3-broker"
}

test_is_from_trusted_origin_fra if {
	base.is_from_trusted_origin with input.subject.issuer as "https://fra-idp.dive25.com/realms/dive-v3-broker"
}

test_not_from_trusted_origin_unknown if {
	not base.is_from_trusted_origin with input.subject.issuer as "https://evil.example.com"
}

# ============================================
# Subject Can Access Tenant Tests
# ============================================

test_subject_can_access_same_tenant if {
	base.subject_can_access_tenant with input.subject.issuer as "https://usa-idp.dive25.com/realms/dive-v3-broker"
		with input.context.tenant as "USA"
}

test_subject_can_access_federated_tenant if {
	base.subject_can_access_tenant with input.subject.issuer as "https://usa-idp.dive25.com/realms/dive-v3-broker"
		with input.context.tenant as "FRA"
}

test_subject_can_access_fra_to_gbr if {
	base.subject_can_access_tenant with input.subject.issuer as "https://fra-idp.dive25.com/realms/dive-v3-broker"
		with input.context.tenant as "GBR"
}

# ============================================
# Error Message Tests
# ============================================

test_untrusted_issuer_msg_format if {
	msg := base.untrusted_issuer_msg("https://evil.example.com")
	contains(msg, "evil.example.com")
	contains(msg, "Untrusted")
}

test_federation_denied_msg_format if {
	msg := base.federation_denied_msg("XYZ", "USA")
	contains(msg, "XYZ")
	contains(msg, "USA")
	contains(msg, "Federation denied")
}

# ============================================
# Valid Tenant Tests
# ============================================

test_is_valid_tenant_usa if {
	base.is_valid_tenant("USA")
}

test_is_valid_tenant_fra if {
	base.is_valid_tenant("FRA")
}

test_is_valid_tenant_gbr if {
	base.is_valid_tenant("GBR")
}

test_is_valid_tenant_deu if {
	base.is_valid_tenant("DEU")
}

test_not_valid_tenant_xyz if {
	not base.is_valid_tenant("XYZ")
}

# ============================================
# All Tenants Tests
# ============================================

test_all_tenants_contains_usa if {
	"USA" in base.all_tenants
}

test_all_tenants_contains_fra if {
	"FRA" in base.all_tenants
}

test_all_tenants_count if {
	count(base.all_tenants) == 4
}





