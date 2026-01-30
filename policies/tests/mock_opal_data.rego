package dive.authorization

# Mock OPAL data for testing
# This data would normally be provided by OPAL from MongoDB
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

federation_matrix := {
	"USA": ["FRA", "GBR", "CAN", "DEU", "AUS", "NZL"],
	"FRA": ["USA", "GBR", "DEU", "ITA", "ESP"],
	"GBR": ["USA", "FRA", "CAN", "AUS", "NZL", "DEU"],
	"CAN": ["USA", "GBR", "AUS", "NZL"],
	"DEU": ["USA", "FRA", "GBR", "ITA", "POL"],
	"AUS": ["USA", "GBR", "CAN", "NZL"],
	"NZL": ["USA", "GBR", "CAN", "AUS"]
}
