# Policy Version Tests
# Package: dive_test
#
# Tests for policy version metadata and semver comparison.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive_test

import rego.v1

import data.dive

# ============================================
# Policy Version Metadata Tests
# ============================================

test_policy_version_exists if {
	dive.policy_version
}

test_policy_version_has_version_string if {
	dive.policy_version.version
}

test_policy_version_has_bundle_id if {
	dive.policy_version.bundleId == "dive-v3-global-policies"
}

test_policy_version_has_timestamp if {
	dive.policy_version.timestamp
}

test_policy_version_has_modules if {
	count(dive.policy_version.modules) > 0
}

test_policy_version_includes_authorization_module if {
	"dive.authorization" in dive.policy_version.modules
}

test_policy_version_includes_federation_module if {
	"dive.federation" in dive.policy_version.modules
}

test_policy_version_has_compliance if {
	count(dive.policy_version.compliance) > 0
}

test_policy_version_includes_acp240 if {
	"ACP-240" in dive.policy_version.compliance
}

test_policy_version_includes_stanag_4774 if {
	"STANAG 4774" in dive.policy_version.compliance
}

test_policy_version_has_features if {
	dive.policy_version.features
}

test_policy_version_cross_instance_kas_enabled if {
	dive.policy_version.features.crossInstanceKAS == true
}

test_policy_version_federated_search_enabled if {
	dive.policy_version.features.federatedSearch == true
}

test_policy_version_drift_monitor_enabled if {
	dive.policy_version.features.policyDriftMonitor == true
}

# ============================================
# Policy Health Tests
# ============================================

test_policy_health_returns_healthy if {
	dive.policy_health.healthy == true
}

test_policy_health_includes_version if {
	dive.policy_health.version == dive.policy_version.version
}

test_policy_health_includes_bundle_id if {
	dive.policy_health.bundleId == dive.policy_version.bundleId
}

test_policy_health_module_count if {
	dive.policy_health.moduleCount == count(dive.policy_version.modules)
}

test_policy_health_compliance_count if {
	dive.policy_health.complianceCount == count(dive.policy_version.compliance)
}

test_policy_health_timestamp_positive if {
	dive.policy_health.timestamp > 0
}

# ============================================
# Version Compatibility Tests
# ============================================

test_is_compatible_version_200 if {
	dive.is_compatible_version("2.0.0")
}

test_is_compatible_version_205 if {
	dive.is_compatible_version("2.0.5")
}

test_is_compatible_version_210 if {
	dive.is_compatible_version("2.1.0")
}

test_is_not_compatible_version_100 if {
	not dive.is_compatible_version("1.0.0")
}

test_is_not_compatible_version_300 if {
	not dive.is_compatible_version("3.0.0")
}

# ============================================
# Semver Comparison Tests
# ============================================

test_semver_compare_major_greater if {
	dive.semver_compare("2.0.0", "1.0.0") == 1
}

test_semver_compare_major_less if {
	dive.semver_compare("1.0.0", "2.0.0") == -1
}

test_semver_compare_major_equal_minor_greater if {
	dive.semver_compare("2.1.0", "2.0.0") == 1
}

test_semver_compare_major_equal_minor_less if {
	dive.semver_compare("2.0.0", "2.1.0") == -1
}

test_semver_compare_minor_equal_patch_greater if {
	dive.semver_compare("2.1.5", "2.1.0") == 1
}

test_semver_compare_minor_equal_patch_less if {
	dive.semver_compare("2.1.0", "2.1.5") == -1
}

test_semver_compare_all_equal if {
	dive.semver_compare("2.1.0", "2.1.0") == 0
}

# ============================================
# Compare Nums Tests
# ============================================

test_compare_nums_less if {
	dive.compare_nums(1, 2) == -1
}

test_compare_nums_greater if {
	dive.compare_nums(2, 1) == 1
}

test_compare_nums_equal if {
	dive.compare_nums(5, 5) == 0
}

# ============================================
# Meets Minimum Version Tests
# ============================================

test_meets_minimum_version_exact if {
	dive.meets_minimum_version("2.1.0")
}

test_meets_minimum_version_lower if {
	dive.meets_minimum_version("2.0.0")
}

test_meets_minimum_version_much_lower if {
	dive.meets_minimum_version("1.0.0")
}

test_not_meets_minimum_version_higher if {
	not dive.meets_minimum_version("3.0.0")
}



