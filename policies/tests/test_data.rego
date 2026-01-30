package dive.test_data

# ============================================
# Common Test Data for All DIVE V3 OPA Tests
# ============================================
# This file provides mock data that would normally come from OPAL/MongoDB
# Import this in tests with: import data.dive.test_data

# ============================================
# Trusted Issuers (OPAL Mock Data)
# ============================================
# Structure: { "issuer_url": { "tenant": "...", "enabled": true, ... } }
trusted_issuers := {
	"https://keycloak:8080/realms/dive-v3-broker": {
		"tenant": "USA",
		"enabled": true,
		"description": "DIVE V3 Hub Keycloak"
	},
	"https://keycloak-fra:8080/realms/dive-v3-broker-fra": {
		"tenant": "FRA",
		"enabled": true,
		"description": "France spoke Keycloak"
	},
	"https://keycloak-gbr:8080/realms/dive-v3-broker-gbr": {
		"tenant": "GBR",
		"enabled": true,
		"description": "UK spoke Keycloak"
	},
	"https://keycloak-deu:8080/realms/dive-v3-broker-deu": {
		"tenant": "DEU",
		"enabled": true,
		"description": "Germany spoke Keycloak"
	},
	"https://keycloak-can:8080/realms/dive-v3-broker-can": {
		"tenant": "CAN",
		"enabled": true,
		"description": "Canada spoke Keycloak"
	}
}

# ============================================
# Federation Matrix (OPAL Mock Data)
# ============================================
# Structure: { "COUNTRY": ["PARTNER1", "PARTNER2", ...] }
federation_matrix := {
	"USA": ["FRA", "GBR", "CAN", "DEU", "AUS", "NZL"],
	"FRA": ["USA", "GBR", "DEU", "ITA", "ESP"],
	"GBR": ["USA", "FRA", "CAN", "AUS", "NZL", "DEU"],
	"CAN": ["USA", "GBR", "AUS", "NZL"],
	"DEU": ["USA", "FRA", "GBR", "ITA", "POL"],
	"AUS": ["USA", "GBR", "CAN", "NZL"],
	"NZL": ["USA", "GBR", "CAN", "AUS"]
}

# ============================================
# Helper Function: Mock OPAL Data
# ============================================
# Use this helper in tests to inject both trusted_issuers and federation_matrix
# Example:
#   test_my_rule if {
#       policy.allow
#       with input as my_input
#       with data.dive.authorization.trusted_issuers as test_data.trusted_issuers
#       with data.dive.authorization.federation_matrix as test_data.federation_matrix
#   }
