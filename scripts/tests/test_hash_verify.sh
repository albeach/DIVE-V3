#!/usr/bin/env bash
# =============================================================================
# Tests for spoke policy hash verification logic
# =============================================================================
# Pure function tests — no Docker, no network required.
# Tests the SHA-256 hash verification pattern used in spoke-policy.sh
# (lines 218-228: openssl base64 -d | openssl dgst -sha256).
# =============================================================================

# ─── Test 1: SHA-256 of base64-decoded content matches direct hash ───────────

test_content_b64=$(printf '{"test":"bundle"}' | openssl base64 -A 2>/dev/null)
computed_hash=$(printf '%s' "$test_content_b64" | openssl base64 -d -A 2>/dev/null | openssl dgst -sha256 2>/dev/null | awk '{print $NF}')
expected_hash=$(printf '{"test":"bundle"}' | openssl dgst -sha256 2>/dev/null | awk '{print $NF}')
assert_eq "$expected_hash" "$computed_hash" "hash: base64-decoded content hash matches direct hash"

# ─── Test 2: Tampered content produces different hash ────────────────────────

tampered_b64=$(printf '{"test":"tampered"}' | openssl base64 -A 2>/dev/null)
tampered_hash=$(printf '%s' "$tampered_b64" | openssl base64 -d -A 2>/dev/null | openssl dgst -sha256 2>/dev/null | awk '{print $NF}')
if [ "$computed_hash" != "$tampered_hash" ]; then
    assert_eq "mismatch" "mismatch" "hash: tampered content produces different hash"
else
    assert_eq "mismatch" "match" "hash: tampered content produces different hash"
fi

# ─── Test 3: Hash length is exactly 64 hex characters ────────────────────────

hash_len=${#computed_hash}
assert_eq "64" "$hash_len" "hash: SHA-256 output is 64 hex characters"

# ─── Test 4: Empty content produces a valid hash ─────────────────────────────

empty_hash=$(printf '' | openssl dgst -sha256 2>/dev/null | awk '{print $NF}')
assert_not_empty "$empty_hash" "hash: empty input produces a non-empty hash"
empty_len=${#empty_hash}
assert_eq "64" "$empty_len" "hash: empty input hash is 64 hex characters"
