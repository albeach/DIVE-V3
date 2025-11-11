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
