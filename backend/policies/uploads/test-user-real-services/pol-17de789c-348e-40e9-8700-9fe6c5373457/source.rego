
package dive.lab.invalid_test

import rego.v1

default allow := false

# This will cause an error when evaluated (undefined variable)
allow if {
  nonexistent_variable == true
}
