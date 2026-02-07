package dive.base.common

import rego.v1

# Common utility functions and constants for DIVE V3 policies
# OPA v1.12.3 compatible with rego.v1 syntax

# Default deny - all policies start with explicit deny
default allow := false

# Common constants
version := "5.0.0"

# Test function to verify policy loading
policy_loaded := true

# Utility: Check if value exists in array
array_contains(arr, val) if {
	some i
	arr[i] == val
}

# Utility: Check if any element from arr1 exists in arr2
array_intersection(arr1, arr2) if {
	some i, j
	arr1[i] == arr2[j]
}

# Git integration test marker - OPAL GitHub tracking
# Updated: 2026-02-06 09:25:00 - OPA v1.12.3 compatible with rego.v1
