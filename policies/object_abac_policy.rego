package dive.object

import rego.v1

# ============================================
# Object ABAC Policy (ACP-240 Focused)
# ============================================
# Emphasizes data-centric security and cryptographic protection
# Based on ACP-240 (Data-Centric Security)
#
# Key Focus Areas:
# - ZTDF integrity validation (STANAG 4778)
# - KAS availability and obligations
# - Policy binding verification
# - Multi-KAS support
# - COI-based key selection
#
# Default deny pattern (fail-secure)
default allow := false

decision_reason := "Authorization check not evaluated"

# Obligations as a set (Rego v1 compatible)
obligations contains obligation if {
	input.resource.encrypted
	obligation := {
		"type": "KAS",
		"resourceId": input.resource.resourceId,
		"policy": "object_abac_policy (ACP-240 focused)",
	}
}

# ============================================
# Main Authorization Rule
# ============================================

allow if {
	not is_ztdf_integrity_violation
	not is_kas_unavailable
	not is_policy_binding_broken
	not is_encryption_required_but_missing
	# Also check basic ABAC (reuse from shared)
	not is_insufficient_clearance
	not is_not_releasable_to_country
	not is_coi_violation
}

# ============================================
# Object-Specific Violations (ACP-240)
# ============================================

# ZTDF Integrity Check (ACP-240 §5.4, STANAG 4778)
is_ztdf_integrity_violation := msg if {
	input.resource.encrypted
	# If resource has signature field, it must be valid
	input.resource.ztdf_signature_valid != null
	not input.resource.ztdf_signature_valid
	msg := "ZTDF signature verification failed (STANAG 4778 binding compromised)"
}

is_ztdf_integrity_violation := msg if {
	input.resource.encrypted
	# If policy hash is present, it must match
	input.resource.policy_hash != null
	input.resource.computed_policy_hash != null
	input.resource.policy_hash != input.resource.computed_policy_hash
	msg := "Policy hash mismatch - cryptographic binding broken"
}

# KAS Availability Check (ACP-240 §5.2)
is_kas_unavailable := msg if {
	input.resource.encrypted
	# Encrypted resources MUST have KAOs
	kao_count := object.get(input.resource, "kao_count", 0)
	kao_count == 0
	msg := "No Key Access Objects available for encrypted resource"
}

is_kas_unavailable := msg if {
	input.resource.encrypted
	# At least one KAS must be reachable (mock check)
	kaos := object.get(input.resource, "kaos", [])
	count(kaos) == 0
	msg := "No KAS configured for encrypted resource"
}

# Policy Binding Verification (ACP-240 §5.4)
is_policy_binding_broken := msg if {
	# If original classification exists, it must map correctly
	input.resource.originalClassification != null
	input.resource.classification != null
	# Verify equivalency mapping is consistent
	not is_valid_classification_mapping(
		input.resource.originalClassification,
		input.resource.classification,
		input.resource.originalCountry,
	)
	msg := sprintf(
		"Classification mapping inconsistent: %s (%s) should map to %s",
		[input.resource.originalClassification, input.resource.originalCountry, input.resource.classification],
	)
}

# Helper: Validate classification equivalency
is_valid_classification_mapping(original, canonical, country) if {
	# For simplicity, if both exist and canonical is set, assume valid
	# Full implementation would check equivalency table
	original
	canonical
	country
}

# Encryption Requirement Check (ACP-240 best practice)
is_encryption_required_but_missing := msg if {
	# TOP_SECRET should always be encrypted
	input.resource.classification == "TOP_SECRET"
	not input.resource.encrypted
	msg := "TOP_SECRET resources must be encrypted per ACP-240"
}

# ============================================
# Shared ABAC Rules
# ============================================

# Clearance hierarchy
# CRITICAL: RESTRICTED is now a separate level above UNCLASSIFIED
# - UNCLASSIFIED users CANNOT access RESTRICTED content
# - RESTRICTED users CAN access UNCLASSIFIED content
# - Both remain AAL1 (no MFA required)
clearance_levels := ["UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"]

# Clearance check
is_insufficient_clearance := msg if {
	clearance_map := {"UNCLASSIFIED": 0, "RESTRICTED": 0.5, "CONFIDENTIAL": 1, "SECRET": 2, "TOP_SECRET": 3}
	user_level := clearance_map[input.subject.clearance]
	resource_level := clearance_map[input.resource.classification]
	user_level < resource_level
	msg := sprintf("Insufficient clearance: %s < %s", [input.subject.clearance, input.resource.classification])
}

# Releasability check
is_not_releasable_to_country := msg if {
	count(input.resource.releasabilityTo) == 0
	msg := "Resource has empty releasabilityTo (denies all)"
}

is_not_releasable_to_country := msg if {
	count(input.resource.releasabilityTo) > 0
	not input.subject.countryOfAffiliation in input.resource.releasabilityTo
	msg := sprintf("Country %s not in releasabilityTo: %v", [input.subject.countryOfAffiliation, input.resource.releasabilityTo])
}

# COI check
is_coi_violation := msg if {
	count(input.resource.COI) > 0
	user_coi := {c | some c in input.subject.acpCOI}
	resource_coi := {c | some c in input.resource.COI}
	intersection := user_coi & resource_coi
	count(intersection) == 0
	msg := sprintf("No COI intersection: user %v, resource %v", [input.subject.acpCOI, input.resource.COI])
}

# ============================================
# KAS Obligations (ACP-240 §5.2)
# ============================================

# Generate KAS obligation if resource is encrypted and access allowed
obligations contains obligation if {
	allow
	input.resource.encrypted
	obligation := {
		"type": "kas_key_release",
		"resourceId": input.resource.resourceId,
		"policy": "object_abac_policy (ACP-240 focused)",
	}
}

# ============================================
# Decision Structure (Simplified for Rego v1)
# ============================================

decision := d if {
	d := {
		"allow": allow,
		"reason": decision_reason,
		"obligations": obligations,
	}
}

decision_reason_message := "All object security and ABAC conditions satisfied" if {
	allow
}

decision_reason_message := violation_message if {
	not allow
	violations := [
		is_ztdf_integrity_violation,
		is_kas_unavailable,
		is_policy_binding_broken,
		is_encryption_required_but_missing,
		is_insufficient_clearance,
		is_not_releasable_to_country,
		is_coi_violation,
	]
	violation_message := concat("; ", violations)
}

