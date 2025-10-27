
package dive.lab.performance_test

import rego.v1

default allow := false

allow if {
  input.subject.clearance == "SECRET"
  input.resource.classification == "SECRET"
}
