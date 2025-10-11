package dive.authorization

import rego.v1

# ============================================
# DIVE V3 Authorization Policy (Week 1 Stub)
# ============================================
# Full implementation in Week 2
# Based on ACP-240 and NATO STANAG 4774/5636

default allow := false

# Week 1: Placeholder policy
# Returns allow = false for all requests until Week 2 implementation

allow if {
  false  # Always deny until Week 2 implementation
}

# Decision output structure (template for Week 2)
decision := {
  "allow": allow,
  "reason": "Policy implementation pending - Week 2",
  "obligations": [],
  "evaluation_details": {
    "week": 1,
    "status": "stub"
  }
}

