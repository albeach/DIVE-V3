package dive.authorization

import rego.v1

# ============================================
# Classification Equivalency Tests (ACP-240 Section 4.3)
# ============================================
# 
# Tests for cross-nation classification equivalency support
# Verifies that OPA correctly handles:
# - Original classification fields in input
# - Cross-nation clearance-to-classification comparison
# - Classification equivalency in evaluation details
# 
# Test Coverage:
# - German GEHEIM ↔ US SECRET equivalency
# - French SECRET DÉFENSE ↔ German GEHEIM equivalency
# - UK classifications equivalency
# - NATO standard equivalency
# - Original classification in evaluation details
# - Backward compatibility (resources without originalClassification)

# ============================================
# Test Helper: Valid Base Input with Equivalency Fields
# ============================================

valid_equivalency_input := {
	"subject": {
		"authenticated": true,
		"uniqueID": "test.user@mil",
		"clearance": "SECRET",
		"clearanceOriginal": "SECRET",  # Original national clearance
		"clearanceCountry": "USA",       # Clearance issuing country
		"countryOfAffiliation": "USA",
		"acpCOI": ["NATO"],
	},
	"action": {"operation": "view"},
	"resource": {
		"resourceId": "doc-test-equiv-001",
		"classification": "SECRET",
		"originalClassification": "SECRET",  # Original national classification
		"originalCountry": "USA",            # Classification origin country
		"natoEquivalent": "SECRET",          # NATO standard equivalent
		"releasabilityTo": ["USA", "DEU"],
		"COI": ["NATO"],
		"encrypted": false,
	},
	"context": {
		"currentTime": "2025-10-22T14:30:00Z",
		"sourceIP": "10.0.1.50",
		"deviceCompliant": true,
		"requestId": "test-equiv-req-001",
		"acr": "urn:mace:incommon:iap:silver",
		"amr": ["pwd", "otp"],
	},
}

# ============================================
# Test 1: German GEHEIM Clearance ↔ US SECRET Document (ALLOW)
# ============================================

test_german_geheim_equals_us_secret if {
	test_input := object.union(valid_equivalency_input, {
		"subject": {
			"authenticated": true,
			"uniqueID": "hans.mueller@bundeswehr.org",
			"clearance": "SECRET",
			"clearanceOriginal": "GEHEIM",
			"clearanceCountry": "DEU",
			"countryOfAffiliation": "DEU",
			"acpCOI": ["NATO"],
		},
		"resource": {
			"resourceId": "doc-us-001",
			"classification": "SECRET",
			"originalClassification": "SECRET",
			"originalCountry": "USA",
			"natoEquivalent": "SECRET",
			"releasabilityTo": ["USA", "DEU"],
			"COI": ["NATO"],
			"encrypted": false,
		},
	})

	decision.allow == true with input as test_input
}

# ============================================
# Test 2: French SECRET DÉFENSE ↔ German GEHEIM Document (ALLOW)
# ============================================

test_french_secret_defense_equals_german_geheim if {
	test_input := object.union(valid_equivalency_input, {
		"subject": {
			"authenticated": true,
			"uniqueID": "jean.dupont@defense.gouv.fr",
			"clearance": "SECRET",
			"clearanceOriginal": "SECRET DÉFENSE",
			"clearanceCountry": "FRA",
			"countryOfAffiliation": "FRA",
			"acpCOI": ["NATO"],
		},
		"resource": {
			"resourceId": "doc-deu-001",
			"classification": "SECRET",
			"originalClassification": "GEHEIM",
			"originalCountry": "DEU",
			"natoEquivalent": "SECRET",
			"releasabilityTo": ["DEU", "FRA"],
			"COI": ["NATO"],
			"encrypted": false,
		},
	})

	decision.allow == true with input as test_input
}

# ============================================
# Test 3: UK CONFIDENTIAL Clearance ↔ US SECRET Document (DENY)
# ============================================

test_uk_confidential_cannot_access_us_secret if {
	test_input := object.union(valid_equivalency_input, {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.smith@mod.uk",
			"clearance": "CONFIDENTIAL",
			"clearanceOriginal": "CONFIDENTIAL",
			"clearanceCountry": "GBR",
			"countryOfAffiliation": "GBR",
			"acpCOI": ["NATO"],
		},
		"resource": {
			"resourceId": "doc-us-002",
			"classification": "SECRET",
			"originalClassification": "SECRET",
			"originalCountry": "USA",
			"natoEquivalent": "SECRET",
			"releasabilityTo": ["USA", "GBR"],
			"COI": ["NATO"],
			"encrypted": false,
		},
	})

	decision.allow == false with input as test_input
	contains(decision.reason, "Insufficient clearance") with input as test_input
}

# ============================================
# Test 4: Italian SEGRETO ↔ Spanish SECRETO Document (ALLOW)
# ============================================

test_italian_segreto_equals_spanish_secreto if {
	test_input := object.union(valid_equivalency_input, {
		"subject": {
			"authenticated": true,
			"uniqueID": "marco.rossi@difesa.it",
			"clearance": "SECRET",
			"clearanceOriginal": "SEGRETO",
			"clearanceCountry": "ITA",
			"countryOfAffiliation": "ITA",
			"acpCOI": ["NATO"],
		},
		"resource": {
			"resourceId": "doc-esp-001",
			"classification": "SECRET",
			"originalClassification": "SECRETO",
			"originalCountry": "ESP",
			"natoEquivalent": "SECRET",
			"releasabilityTo": ["ESP", "ITA"],
			"COI": ["NATO"],
			"encrypted": false,
		},
	})

	decision.allow == true with input as test_input
}

# ============================================
# Test 5: Canadian TOP SECRET ↔ Australian TOP SECRET Document (ALLOW)
# ============================================

test_canadian_top_secret_equals_australian_top_secret if {
	test_input := object.union(valid_equivalency_input, {
		"subject": {
			"authenticated": true,
			"uniqueID": "alice.chen@forces.gc.ca",
			"clearance": "TOP_SECRET",
			"clearanceOriginal": "TOP SECRET",
			"clearanceCountry": "CAN",
			"countryOfAffiliation": "CAN",
			"acpCOI": ["FVEY"],
		},
		"resource": {
			"resourceId": "doc-aus-001",
			"classification": "TOP_SECRET",
			"originalClassification": "TOP SECRET",
			"originalCountry": "AUS",
			"natoEquivalent": "COSMIC_TOP_SECRET",
			"releasabilityTo": ["AUS", "CAN", "USA", "GBR", "NZL"],
			"COI": ["FVEY"],
			"encrypted": false,
		},
	})

	decision.allow == true with input as test_input
}

# ============================================
# Test 6: Polish TAJNE ↔ Dutch GEHEIM Document (ALLOW)
# ============================================

test_polish_tajne_equals_dutch_geheim if {
	test_input := object.union(valid_equivalency_input, {
		"subject": {
			"authenticated": true,
			"uniqueID": "jan.kowalski@wp.mil.pl",
			"clearance": "SECRET",
			"clearanceOriginal": "TAJNE",
			"clearanceCountry": "POL",
			"countryOfAffiliation": "POL",
			"acpCOI": ["NATO"],
		},
		"resource": {
			"resourceId": "doc-nld-001",
			"classification": "SECRET",
			"originalClassification": "GEHEIM",
			"originalCountry": "NLD",
			"natoEquivalent": "SECRET",
			"releasabilityTo": ["NLD", "POL"],
			"COI": ["NATO"],
			"encrypted": false,
		},
	})

	decision.allow == true with input as test_input
}

# ============================================
# Test 7: Evaluation Details Include clearanceOriginal (Subject)
# ============================================

test_evaluation_details_include_clearance_original if {
	test_input := object.union(valid_equivalency_input, {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user@mil",
			"clearance": "SECRET",
			"clearanceOriginal": "GEHEIM",
			"clearanceCountry": "DEU",
			"countryOfAffiliation": "DEU",
			"acpCOI": ["NATO"],
		},
	})

	decision.evaluation_details.subject.clearanceOriginal == "GEHEIM" with input as test_input
	decision.evaluation_details.subject.clearanceCountry == "DEU" with input as test_input
}

# ============================================
# Test 8: Evaluation Details Include originalClassification (Resource)
# ============================================

test_evaluation_details_include_resource_original if {
	test_input := object.union(valid_equivalency_input, {
		"resource": {
			"resourceId": "doc-fra-001",
			"classification": "SECRET",
			"originalClassification": "SECRET DÉFENSE",
			"originalCountry": "FRA",
			"natoEquivalent": "SECRET",
			"releasabilityTo": ["FRA", "USA"],
			"COI": ["NATO"],
			"encrypted": false,
		},
	})

	decision.evaluation_details.resource.originalClassification == "SECRET DÉFENSE" with input as test_input
	decision.evaluation_details.resource.originalCountry == "FRA" with input as test_input
	decision.evaluation_details.resource.natoEquivalent == "SECRET" with input as test_input
}

# ============================================
# Test 9: Evaluation Details Include classification_equivalency_enabled Flag
# ============================================

test_evaluation_details_classification_equivalency_flag if {
	decision.evaluation_details.acp240_compliance.classification_equivalency_enabled == true with input as valid_equivalency_input
}

# ============================================
# Test 10: Backward Compatibility - Resources Without originalClassification (ALLOW)
# ============================================

test_backward_compatibility_without_original_classification if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user@mil",
			"clearance": "SECRET",
			"clearanceOriginal": "SECRET",
			"clearanceCountry": "USA",
			"countryOfAffiliation": "USA",
			"acpCOI": ["NATO"],
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "doc-legacy-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": ["NATO"],
			"encrypted": false,
		},
		"context": {
			"currentTime": "2025-10-22T14:30:00Z",
			"sourceIP": "10.0.1.50",
			"deviceCompliant": true,
			"requestId": "test-equiv-req-legacy-001",
			"acr": "urn:mace:incommon:iap:silver",
			"amr": ["pwd", "otp"],
		},
	}

	decision.allow == true with input as test_input
	decision.evaluation_details.resource.originalClassification == "" with input as test_input
	decision.evaluation_details.resource.originalCountry == "" with input as test_input
}

# ============================================
# Test 11: German GEHEIM Clearance ↔ French SECRET DÉFENSE Document (ALLOW)
# ============================================

test_german_geheim_equals_french_secret_defense if {
	test_input := object.union(valid_equivalency_input, {
		"subject": {
			"authenticated": true,
			"uniqueID": "karl.schmidt@bundeswehr.org",
			"clearance": "SECRET",
			"clearanceOriginal": "GEHEIM",
			"clearanceCountry": "DEU",
			"countryOfAffiliation": "DEU",
			"acpCOI": ["NATO"],
		},
		"resource": {
			"resourceId": "doc-fra-002",
			"classification": "SECRET",
			"originalClassification": "SECRET DÉFENSE",
			"originalCountry": "FRA",
			"natoEquivalent": "SECRET",
			"releasabilityTo": ["FRA", "DEU"],
			"COI": ["NATO"],
			"encrypted": false,
		},
	})

	decision.allow == true with input as test_input
}

# ============================================
# Test 12: Cross-Nation Clearance Hierarchy (German GEHEIM < US TOP SECRET)
# ============================================

test_cross_nation_clearance_hierarchy if {
	test_input := object.union(valid_equivalency_input, {
		"subject": {
			"authenticated": true,
			"uniqueID": "user.deu@bundeswehr.org",
			"clearance": "SECRET",
			"clearanceOriginal": "GEHEIM",
			"clearanceCountry": "DEU",
			"countryOfAffiliation": "DEU",
			"acpCOI": ["NATO"],
		},
		"resource": {
			"resourceId": "doc-us-topsecret-001",
			"classification": "TOP_SECRET",
			"originalClassification": "TOP SECRET",
			"originalCountry": "USA",
			"natoEquivalent": "COSMIC_TOP_SECRET",
			"releasabilityTo": ["USA", "DEU"],
			"COI": ["NATO"],
			"encrypted": false,
		},
	})

	decision.allow == false with input as test_input
	contains(decision.reason, "Insufficient clearance") with input as test_input
}

# ============================================
# Test 13: Optional originalClassification Fields (Graceful Handling)
# ============================================

test_optional_original_classification_fields if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": ["NATO"],
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "doc-legacy-002",
			"classification": "CONFIDENTIAL",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": false,
		},
		"context": {
			"currentTime": "2025-10-22T14:30:00Z",
			"sourceIP": "10.0.1.50",
			"deviceCompliant": true,
			"requestId": "test-equiv-req-002",
			"acr": "urn:mace:incommon:iap:silver",
			"amr": ["pwd", "otp"],
		},
	}

	decision.allow == true with input as test_input
	decision.evaluation_details.subject.clearanceOriginal == "" with input as test_input
	decision.evaluation_details.resource.originalClassification == "" with input as test_input
}

# ============================================
# Test 14: Cross-Nation Denial Due to Releasability (Not Classification)
# ============================================

test_cross_nation_denial_due_to_releasability if {
	test_input := object.union(valid_equivalency_input, {
		"subject": {
			"authenticated": true,
			"uniqueID": "user.deu@bundeswehr.org",
			"clearance": "SECRET",
			"clearanceOriginal": "GEHEIM",
			"clearanceCountry": "DEU",
			"countryOfAffiliation": "DEU",
			"acpCOI": ["NATO"],
		},
		"resource": {
			"resourceId": "doc-us-noforn-001",
			"classification": "SECRET",
			"originalClassification": "SECRET",
			"originalCountry": "USA",
			"natoEquivalent": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": false,
		},
	})

	decision.allow == false with input as test_input
	contains(decision.reason, "Country DEU not in releasabilityTo") with input as test_input
}

# ============================================
# Test 15: Norwegian HEMMELIG ↔ Danish HEMMELIGT Document (ALLOW)
# ============================================

test_norwegian_hemmelig_equals_danish_hemmeligt if {
	test_input := object.union(valid_equivalency_input, {
		"subject": {
			"authenticated": true,
			"uniqueID": "ole.hansen@forsvarsdep.no",
			"clearance": "SECRET",
			"clearanceOriginal": "HEMMELIG",
			"clearanceCountry": "NOR",
			"countryOfAffiliation": "NOR",
			"acpCOI": ["NATO"],
		},
		"resource": {
			"resourceId": "doc-dnk-001",
			"classification": "SECRET",
			"originalClassification": "HEMMELIGT",
			"originalCountry": "DNK",
			"natoEquivalent": "SECRET",
			"releasabilityTo": ["DNK", "NOR"],
			"COI": ["NATO"],
			"encrypted": false,
		},
	})

	decision.allow == true with input as test_input
}

# ============================================
# Test 16: Turkish ÇOK GİZLİ ↔ Greek ΑΠΌΡΡΗΤΟ Document (ALLOW)
# ============================================

test_turkish_cok_gizli_equals_greek_aporreto if {
	test_input := object.union(valid_equivalency_input, {
		"subject": {
			"authenticated": true,
			"uniqueID": "mehmet.yilmaz@tsk.mil.tr",
			"clearance": "SECRET",
			"clearanceOriginal": "ÇOK GİZLİ",
			"clearanceCountry": "TUR",
			"countryOfAffiliation": "TUR",
			"acpCOI": ["NATO"],
		},
		"resource": {
			"resourceId": "doc-grc-001",
			"classification": "SECRET",
			"originalClassification": "ΑΠΌΡΡΗΤΟ",
			"originalCountry": "GRC",
			"natoEquivalent": "SECRET",
			"releasabilityTo": ["GRC", "TUR"],
			"COI": ["NATO"],
			"encrypted": false,
		},
	})

	decision.allow == true with input as test_input
}
