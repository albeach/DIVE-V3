# Base Layer: Time Utilities Tests
# Package: dive.base.time_test
#
# Comprehensive tests for time parsing and comparison utilities.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.base.time_test

import rego.v1

import data.dive.base.time

# ============================================
# Time Parsing Tests
# ============================================

test_parse_rfc3339_valid_timestamp if {
	ns := time.parse_rfc3339("2025-12-03T12:00:00Z")
	ns > 0
}

test_parse_rfc3339_with_timezone if {
	ns := time.parse_rfc3339("2025-12-03T12:00:00+00:00")
	ns > 0
}

test_parse_rfc3339_with_milliseconds if {
	ns := time.parse_rfc3339("2025-12-03T12:00:00.123Z")
	ns > 0
}

test_parse_rfc3339_epoch_timestamp if {
	ns := time.parse_rfc3339("1970-01-01T00:00:00Z")
	ns == 0
}

test_parse_rfc3339_invalid_returns_zero if {
	ns := time.parse_rfc3339("invalid-date")
	ns == 0
}

test_parse_to_seconds_valid if {
	seconds := time.parse_to_seconds("2025-12-03T12:00:00Z")
	seconds > 0
}

test_parse_to_seconds_epoch if {
	seconds := time.parse_to_seconds("1970-01-01T00:00:00Z")
	seconds == 0
}

# ============================================
# Time Comparison Tests
# ============================================

test_is_before_true if {
	time.is_before("2025-01-01T00:00:00Z", "2025-12-01T00:00:00Z")
}

test_is_before_false_same if {
	not time.is_before("2025-06-01T00:00:00Z", "2025-06-01T00:00:00Z")
}

test_is_before_false_after if {
	not time.is_before("2025-12-01T00:00:00Z", "2025-01-01T00:00:00Z")
}

test_is_after_true if {
	time.is_after("2025-12-01T00:00:00Z", "2025-01-01T00:00:00Z")
}

test_is_after_false_same if {
	not time.is_after("2025-06-01T00:00:00Z", "2025-06-01T00:00:00Z")
}

test_is_after_false_before if {
	not time.is_after("2025-01-01T00:00:00Z", "2025-12-01T00:00:00Z")
}

# ============================================
# Past/Future Tests
# ============================================

test_is_past_true if {
	time.is_past("2020-01-01T00:00:00Z", "2025-12-03T00:00:00Z")
}

test_is_past_false_future if {
	not time.is_past("2030-01-01T00:00:00Z", "2025-12-03T00:00:00Z")
}

test_is_future_true if {
	time.is_future("2030-01-01T00:00:00Z", "2025-12-03T00:00:00Z")
}

test_is_future_false_past if {
	not time.is_future("2020-01-01T00:00:00Z", "2025-12-03T00:00:00Z")
}

# ============================================
# Token Lifetime Tests
# ============================================

test_auth_within_lifetime_valid if {
	# Auth time 10 minutes ago (600 seconds)
	# 2025-12-03T12:00:00Z = 1764763200
	auth_time := 1764763200  # Unix timestamp
	current := "2025-12-03T12:10:00Z"  # 600 seconds later
	time.auth_within_lifetime(auth_time, current)
}

test_auth_within_lifetime_at_boundary if {
	# Auth time exactly 15 minutes ago (900 seconds)
	# 2025-12-03T12:00:00Z = 1764763200
	auth_time := 1764763200
	current := "2025-12-03T12:15:00Z"
	time.auth_within_lifetime(auth_time, current)
}

test_auth_within_lifetime_expired if {
	# Auth time 20 minutes ago (1200 seconds)
	# 2025-12-03T12:00:00Z = 1764763200
	auth_time := 1764763200
	current := "2025-12-03T12:20:00Z"
	not time.auth_within_lifetime(auth_time, current)
}

test_seconds_since_auth if {
	# 2025-12-03T12:00:00Z = 1764763200
	auth_time := 1764763200
	current := "2025-12-03T12:10:00Z"
	elapsed := time.seconds_since_auth(auth_time, current)
	elapsed == 600
}

# ============================================
# Embargo Tests
# ============================================

test_is_under_embargo_future_creation if {
	# Resource created in 2030
	creation := "2030-01-01T00:00:00Z"
	current := "2025-12-03T00:00:00Z"
	time.is_under_embargo(creation, current)
}

test_is_not_under_embargo_past_creation if {
	# Resource created in 2020
	creation := "2020-01-01T00:00:00Z"
	current := "2025-12-03T00:00:00Z"
	not time.is_under_embargo(creation, current)
}

test_is_not_under_embargo_same_time if {
	# Resource created now (with clock skew tolerance)
	timestamp := "2025-12-03T12:00:00Z"
	not time.is_under_embargo(timestamp, timestamp)
}

test_seconds_until_available_future if {
	creation := "2025-12-03T13:00:00Z"
	current := "2025-12-03T12:00:00Z"
	remaining := time.seconds_until_available(creation, current)
	remaining == 3600  # 1 hour
}

test_seconds_until_available_past if {
	creation := "2025-12-03T11:00:00Z"
	current := "2025-12-03T12:00:00Z"
	remaining := time.seconds_until_available(creation, current)
	remaining == 0  # Already available
}

# ============================================
# Error Message Tests
# ============================================

test_token_expired_msg if {
	# 2025-12-03T12:00:00Z = 1764763200
	auth_time := 1764763200
	current := "2025-12-03T12:30:00Z"  # 30 minutes later
	msg := time.token_expired_msg(auth_time, current)
	contains(msg, "session has expired")
	contains(msg, "seconds since authentication")
}

test_embargo_msg if {
	creation := "2025-12-03T13:00:00Z"
	current := "2025-12-03T12:00:00Z"
	msg := time.embargo_msg(creation, current)
	contains(msg, "embargoed")
	contains(msg, "available in")
}

# ============================================
# Constants Tests
# ============================================

test_clock_skew_tolerance_is_five_minutes if {
	# 5 minutes = 300 seconds = 300,000,000,000 nanoseconds
	time.clock_skew_ns == 300000000000
}

test_token_lifetime_is_fifteen_minutes if {
	# 15 minutes = 900 seconds
	time.token_lifetime_seconds == 900
}

# ============================================
# Edge Case Tests
# ============================================

test_parse_very_old_timestamp if {
	ns := time.parse_rfc3339("1990-01-01T00:00:00Z")
	ns > 0
}

test_parse_very_future_timestamp if {
	ns := time.parse_rfc3339("2050-01-01T00:00:00Z")
	ns > 0
}

test_is_before_with_clock_skew_within_tolerance if {
	# Times within 5 minutes should not be considered "before"
	t1 := "2025-12-03T12:00:00Z"
	t2 := "2025-12-03T12:03:00Z"  # 3 minutes later
	not time.is_before(t1, t2)  # Within clock skew
}

test_is_before_with_clock_skew_beyond_tolerance if {
	# Times more than 5 minutes apart should be considered "before"
	t1 := "2025-12-03T12:00:00Z"
	t2 := "2025-12-03T12:10:00Z"  # 10 minutes later
	time.is_before(t1, t2)  # Beyond clock skew
}

test_is_after_with_clock_skew_within_tolerance if {
	# Times within 5 minutes should not be considered "after"
	t1 := "2025-12-03T12:03:00Z"
	t2 := "2025-12-03T12:00:00Z"  # 3 minutes earlier
	not time.is_after(t1, t2)  # Within clock skew
}

test_is_after_with_clock_skew_beyond_tolerance if {
	# Times more than 5 minutes apart should be considered "after"
	t1 := "2025-12-03T12:10:00Z"
	t2 := "2025-12-03T12:00:00Z"  # 10 minutes earlier
	time.is_after(t1, t2)  # Beyond clock skew
}
