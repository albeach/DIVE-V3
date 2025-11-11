# ============================================
# OPA Policy Integration for ACR/Clearance Mapping
# ============================================
# This module creates an OPA policy that maps user clearances
# to required ACR values for NIST SP 800-63B compliance
#
# Clearance → ACR Mapping:
# - UNCLASSIFIED → AAL1 (urn:mace:incommon:iap:silver)
# - CONFIDENTIAL → AAL2 (urn:mace:incommon:iap:gold)
# - SECRET → AAL2 (urn:mace:incommon:iap:gold)
# - TOP_SECRET → AAL3 (urn:mace:incommon:iap:platinum)

resource "local_file" "acr_clearance_mapping_rego" {
  filename = "${path.module}/../../policies/acr_clearance_mapping.rego"
  content  = <<-REGO
package dive.acr

import rego.v1

# ============================================
# ACR Value Mapping Based on Clearance
# ============================================
# This policy determines the required ACR (Authentication Context Class Reference)
# based on user clearance level per NIST SP 800-63B

# Default ACR if clearance not found
default required_acr := "urn:mace:incommon:iap:silver"

# AAL1: UNCLASSIFIED users (password only)
required_acr := "urn:mace:incommon:iap:silver" if {
    input.clearance == "UNCLASSIFIED"
}

# AAL2: CONFIDENTIAL and SECRET users (password + OTP)
required_acr := "urn:mace:incommon:iap:gold" if {
    input.clearance in ["CONFIDENTIAL", "SECRET"]
}

# AAL3: TOP_SECRET users (password + WebAuthn/hardware key)
required_acr := "urn:mace:incommon:iap:platinum" if {
    input.clearance == "TOP_SECRET"
}

# Numeric LoA level for convenience
loa_level := 1 if { required_acr == "urn:mace:incommon:iap:silver" }
loa_level := 2 if { required_acr == "urn:mace:incommon:iap:gold" }
loa_level := 3 if { required_acr == "urn:mace:incommon:iap:platinum" }

# Full response
decision := {
    "required_acr": required_acr,
    "loa_level": loa_level,
    "clearance": input.clearance
}
REGO
}

# OPA Test File
resource "local_file" "acr_clearance_mapping_test" {
  filename = "${path.module}/../../policies/tests/acr_clearance_mapping_test.rego"
  content  = <<-REGO
package dive.acr

import rego.v1

test_unclassified_requires_aal1 if {
    decision.required_acr == "urn:mace:incommon:iap:silver" with input as {"clearance": "UNCLASSIFIED"}
    decision.loa_level == 1 with input as {"clearance": "UNCLASSIFIED"}
}

test_confidential_requires_aal2 if {
    decision.required_acr == "urn:mace:incommon:iap:gold" with input as {"clearance": "CONFIDENTIAL"}
    decision.loa_level == 2 with input as {"clearance": "CONFIDENTIAL"}
}

test_secret_requires_aal2 if {
    decision.required_acr == "urn:mace:incommon:iap:gold" with input as {"clearance": "SECRET"}
    decision.loa_level == 2 with input as {"clearance": "SECRET"}
}

test_top_secret_requires_aal3 if {
    decision.required_acr == "urn:mace:incommon:iap:platinum" with input as {"clearance": "TOP_SECRET"}
    decision.loa_level == 3 with input as {"clearance": "TOP_SECRET"}
}

test_default_aal1_for_unknown if {
    decision.required_acr == "urn:mace:incommon:iap:silver" with input as {"clearance": "UNKNOWN"}
    decision.loa_level == 1 with input as {"clearance": "UNKNOWN"}
}
REGO
}

