# DIVE V3 Policy Version Metadata
# Phase 4, Task 3.1: Policy Bundle Versioning
#
# Purpose: Track policy version across all instances to prevent drift
# and ensure NATO compliance consistency.
#
# NATO Compliance: ACP-240, ADatP-5663, STANAG 4774, STANAG 4778

package dive

import rego.v1

# =============================================================================
# POLICY VERSION METADATA
# =============================================================================
# This data is queried by the policy drift monitor to verify all instances
# are running the same policy version.

policy_version := {
	"version": "2.1.0",
	"bundleId": "dive-v3-global-policies",
	"timestamp": "2025-11-28T00:00:00Z",
	"gitCommit": "phase4-option-a",
	"modules": [
		"dive.authorization",
		"dive.federation",
		"dive.object",
		"dive.admin_authorization",
		"dive.policy_version",
	],
	"compliance": [
		"ACP-240",
		"ADatP-5663",
		"STANAG 4774",
		"STANAG 4778",
	],
	"features": {
		"crossInstanceKAS": true,
		"federatedSearch": true,
		"policyDriftMonitor": true,
		"originRealmTracking": true,
		"spAgreementEnforcement": true,
	},
	"compatibleWith": [
		"2.0.0",
		"2.0.5",
		"2.1.0",
	],
	"breakingChanges": [],
}

# =============================================================================
# POLICY HEALTH CHECK
# =============================================================================
# Returns policy health status for monitoring dashboards

policy_health := result if {
	result := {
		"healthy": true,
		"version": policy_version.version,
		"bundleId": policy_version.bundleId,
		"moduleCount": count(policy_version.modules),
		"complianceCount": count(policy_version.compliance),
		"timestamp": time.now_ns(),
	}
}

# =============================================================================
# POLICY COMPATIBILITY CHECK
# =============================================================================
# Checks if a given version is compatible with current policy bundle

is_compatible_version(version) if {
	version in policy_version.compatibleWith
}

# Check minimum version requirement
meets_minimum_version(min_version) if {
	semver_compare(policy_version.version, min_version) >= 0
}

# Simple semver comparison (major.minor.patch)
# Returns: -1 if a < b, 0 if a == b, 1 if a > b
semver_compare(a, b) := result if {
	a_parts := split(a, ".")
	b_parts := split(b, ".")

	# Compare major
	a_major := to_number(a_parts[0])
	b_major := to_number(b_parts[0])
	a_major != b_major
	result := compare_nums(a_major, b_major)
}

semver_compare(a, b) := result if {
	a_parts := split(a, ".")
	b_parts := split(b, ".")

	a_major := to_number(a_parts[0])
	b_major := to_number(b_parts[0])
	a_major == b_major

	# Compare minor
	a_minor := to_number(a_parts[1])
	b_minor := to_number(b_parts[1])
	a_minor != b_minor
	result := compare_nums(a_minor, b_minor)
}

semver_compare(a, b) := result if {
	a_parts := split(a, ".")
	b_parts := split(b, ".")

	a_major := to_number(a_parts[0])
	b_major := to_number(b_parts[0])
	a_major == b_major

	a_minor := to_number(a_parts[1])
	b_minor := to_number(b_parts[1])
	a_minor == b_minor

	# Compare patch
	a_patch := to_number(a_parts[2])
	b_patch := to_number(b_parts[2])
	result := compare_nums(a_patch, b_patch)
}

compare_nums(a, b) := -1 if {
	a < b
}

compare_nums(a, b) := 0 if {
	a == b
}

compare_nums(a, b) := 1 if {
	a > b
}








