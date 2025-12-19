# Base Layer: Time Utilities
# Package: dive.base.time
#
# Time parsing and comparison utilities for policy evaluation.
# Handles RFC3339 timestamps, clock skew tolerance, and embargo checks.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.base.time

import rego.v1

# ============================================
# Constants
# ============================================

# Clock skew tolerance in nanoseconds (5 minutes)
# Used to handle minor time differences between systems
clock_skew_ns := 300000000000

# Token lifetime in seconds (15 minutes per ADatP-5663)
token_lifetime_seconds := 900

# ============================================
# Time Parsing
# ============================================

# Parse RFC3339 timestamp to nanoseconds since epoch
# Returns: nanoseconds or 0 if parsing fails
parse_rfc3339(timestamp) := ns if {
	ns := time.parse_rfc3339_ns(timestamp)
} else := 0

# Parse timestamp to seconds since epoch
parse_to_seconds(timestamp) := seconds if {
	ns := parse_rfc3339(timestamp)
	seconds := ns / 1000000000
} else := 0

# Get current time in nanoseconds
# Note: time.now_ns is a built-in that returns current time
# We wrap it for cleaner usage in policies

# Get current time in seconds (from context, not built-in)
# In actual use, current_time should be passed via input.context.currentTime

# ============================================
# Time Comparison
# ============================================

# Check if timestamp A is before timestamp B (with clock skew tolerance)
is_before(timestamp_a, timestamp_b) if {
	ns_a := parse_rfc3339(timestamp_a)
	ns_b := parse_rfc3339(timestamp_b)
	ns_a < (ns_b - clock_skew_ns)
}

# Check if timestamp A is after timestamp B (with clock skew tolerance)
is_after(timestamp_a, timestamp_b) if {
	ns_a := parse_rfc3339(timestamp_a)
	ns_b := parse_rfc3339(timestamp_b)
	ns_a > (ns_b + clock_skew_ns)
}

# Check if timestamp is in the past (relative to reference time)
is_past(timestamp, reference_time) if {
	ns := parse_rfc3339(timestamp)
	ref_ns := parse_rfc3339(reference_time)
	ns < (ref_ns - clock_skew_ns)
}

# Check if timestamp is in the future (relative to reference time)
is_future(timestamp, reference_time) if {
	ns := parse_rfc3339(timestamp)
	ref_ns := parse_rfc3339(reference_time)
	ns > (ref_ns + clock_skew_ns)
}

# ============================================
# Token Time Validation
# ============================================

# Check if authentication time is within token lifetime
# auth_time_unix: Unix timestamp (seconds) of authentication
# current_time: RFC3339 timestamp of current request
auth_within_lifetime(auth_time_unix, current_time) if {
	current_seconds := parse_to_seconds(current_time)
	elapsed := current_seconds - auth_time_unix
	elapsed <= token_lifetime_seconds
}

# Calculate seconds since authentication
seconds_since_auth(auth_time_unix, current_time) := elapsed if {
	current_seconds := parse_to_seconds(current_time)
	elapsed := current_seconds - auth_time_unix
}

# ============================================
# Embargo Checks
# ============================================

# Check if resource is under embargo (creation date in future)
# creation_date: RFC3339 timestamp when resource becomes available
# current_time: RFC3339 timestamp of current request
is_under_embargo(creation_date, current_time) if {
	creation_ns := parse_rfc3339(creation_date)
	current_ns := parse_rfc3339(current_time)
	# Resource is embargoed if creation date is in the future (minus clock skew)
	current_ns < (creation_ns - clock_skew_ns)
}

# Calculate seconds until embargo lifts
seconds_until_available(creation_date, current_time) := remaining if {
	creation_seconds := parse_to_seconds(creation_date)
	current_seconds := parse_to_seconds(current_time)
	remaining := creation_seconds - current_seconds
	remaining > 0
} else := 0

# ============================================
# Error Messages
# ============================================

token_expired_msg(auth_time_unix, current_time) := msg if {
	elapsed := seconds_since_auth(auth_time_unix, current_time)
	msg := sprintf("Token expired: %d seconds since authentication (max %d)", [
		elapsed,
		token_lifetime_seconds,
	])
}

embargo_msg(creation_date, current_time) := msg if {
	remaining := seconds_until_available(creation_date, current_time)
	msg := sprintf("Resource under embargo until %s (available in %d seconds)", [
		creation_date,
		remaining,
	])
}
