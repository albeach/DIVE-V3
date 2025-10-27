
package dive.lab.integration_test_2

import rego.v1

default allow := false

clearance_hierarchy := {
  "UNCLASSIFIED": 0,
  "CONFIDENTIAL": 1,
  "SECRET": 2,
  "TOP_SECRET": 3
}

is_insufficient_clearance := msg if {
  clearance_hierarchy[input.subject.clearance] < clearance_hierarchy[input.resource.classification]
  msg := "Insufficient clearance"
}

allow if {
  not is_insufficient_clearance
}

obligations := [
  {
    "type": "LOG_ACCESS",
    "params": {
      "resourceId": input.resource.resourceId
    }
  }
] if { allow }
