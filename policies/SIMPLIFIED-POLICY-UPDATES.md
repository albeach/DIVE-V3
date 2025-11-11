# Simplified Policy Updates - Summary

This document summarizes the updates made to the simplified authorization policy to support alternative attribute naming conventions and additional test cases.

## Changes Made

### 1. Alternative Attribute Name Support

The simplified policy now supports **flexible attribute naming** to accommodate different naming conventions used by external systems:

| Standard Name | Alternative Name | Usage |
|---------------|------------------|-------|
| `clearance` | `cclr` | Subject security clearance level |
| `countryOfAffiliation` | `country` | Subject's country code (ISO 3166-1 alpha-3) |
| `acpCOI` | `aciCOI` | Subject's Community of Interest tags |

#### Implementation Pattern

The policy uses **fallback functions** to support both naming conventions:

```rego
# Helper: Get subject clearance (supports both attribute names)
get_subject_clearance := input.subject.clearance if {
	input.subject.clearance
} else := input.subject.cclr if {
	input.subject.cclr
} else := ""

# Helper: Get subject country (supports both attribute names)
get_subject_country := input.subject.countryOfAffiliation if {
	input.subject.countryOfAffiliation
} else := input.subject.country if {
	input.subject.country
} else := ""

# Helper: Get subject COI (supports both attribute names)
get_subject_coi := input.subject.acpCOI if {
	input.subject.acpCOI
} else := input.subject.aciCOI if {
	input.subject.aciCOI
} else := []
```

This pattern ensures **backward compatibility** while supporting new naming conventions.

### 2. RESTRICTED Classification Support

Added `RESTRICTED` classification level, which is treated as **equivalent to UNCLASSIFIED** (level 0):

```rego
clearance_levels := {
	"UNCLASSIFIED": 0,
	"RESTRICTED": 0,      # NEW: Same level as UNCLASSIFIED
	"CONFIDENTIAL": 1,
	"SECRET": 2,
	"TOP_SECRET": 3,
}
```

**Rationale**: RESTRICTED is a NATO/international classification level that denotes information with limited distribution but does not meet the threshold for CONFIDENTIAL classification.

### 3. Alpha, Beta, Gamma COI Test Cases

Added comprehensive test cases for special access program COIs:

#### Alpha COI (Test Case 4, 7)
- **Purpose**: Compartmentalized Special Access Program (SAP)
- **Country Affiliation**: None (no country-based membership)
- **Access Pattern**: Requires exact Alpha COI membership
- **Test Case 4**: ✅ ALLOW - User with Alpha COI accessing Alpha document
- **Test Case 7**: ❌ DENY - User with Beta COI trying to access Alpha document

#### Beta COI (Test Case 5)
- **Purpose**: Research project or program-based compartment
- **Country Affiliation**: None (no country-based membership)
- **Access Pattern**: Requires exact Beta COI membership
- **Test Case 5**: ✅ ALLOW - Researcher with Beta COI accessing Beta document

#### Gamma COI (Test Case 6)
- **Purpose**: Highly compartmentalized SAP (typically need-to-know basis)
- **Country Affiliation**: None (no country-based membership)
- **Access Pattern**: Requires exact Gamma COI membership
- **Test Case 6**: ✅ ALLOW - Engineer with Gamma COI accessing Gamma document

**Key Behavior**: Alpha, Beta, and Gamma are **mutually exclusive compartments**. Having clearance for one does not grant access to another, even with sufficient classification clearance and country releasability.

## Updated Files

### 1. `simplified_authorization_policy.rego`
- ✅ Added helper functions for attribute name fallback
- ✅ Added RESTRICTED classification level
- ✅ Updated COI check to use `get_subject_coi` helper
- ✅ Added comments explaining Alpha/Beta/Gamma behavior
- ✅ Updated embedded test examples

### 2. `TEST-EXAMPLES.md`
- ✅ Added attribute name convention documentation
- ✅ Updated all curl commands to use alternative names (`cclr`, `country`, `aciCOI`)
- ✅ Added Test Case 2: Alternative attribute names (ALLOW)
- ✅ Added Test Case 3: RESTRICTED classification (ALLOW)
- ✅ Added Test Case 4: Alpha COI access (ALLOW)
- ✅ Added Test Case 5: Beta COI project access (ALLOW)
- ✅ Added Test Case 6: Gamma COI special access (ALLOW)
- ✅ Added Test Case 7: Alpha COI mismatch (DENY)
- ✅ Updated decision matrix with new test cases (now 14 total)

### 3. `simplified_authorization_policy.xml` (XACML)
- ℹ️ **Note**: XACML representation unchanged (attribute names are mapped at PEP layer)

## Testing Best Practices

### Using Alternative Attribute Names

**Recommended approach for external systems:**

```bash
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "user@example.com",
        "cclr": "SECRET",           # Use cclr instead of clearance
        "country": "USA",            # Use country instead of countryOfAffiliation
        "aciCOI": ["FVEY"]          # Use aciCOI instead of acpCOI
      },
      "resource": {
        "resourceId": "doc-123",
        "classification": "CONFIDENTIAL",
        "releasabilityTo": ["USA", "GBR", "CAN"],
        "COI": ["FVEY"]
      }
    }
  }'
```

### Testing RESTRICTED Classification

```bash
# RESTRICTED user accessing RESTRICTED document (ALLOW)
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "user@example.com",
        "cclr": "RESTRICTED",
        "country": "USA"
      },
      "resource": {
        "resourceId": "doc-001",
        "classification": "RESTRICTED",
        "releasabilityTo": ["USA"]
      }
    }
  }'
```

**Expected**: ALLOW (RESTRICTED = UNCLASSIFIED = level 0)

### Testing Alpha/Beta/Gamma COIs

```bash
# Alpha COI member accessing Alpha document (ALLOW)
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "alpha.user@contractor.com",
        "cclr": "SECRET",
        "country": "USA",
        "aciCOI": ["Alpha"]
      },
      "resource": {
        "resourceId": "doc-alpha-001",
        "classification": "SECRET",
        "releasabilityTo": ["USA"],
        "COI": ["Alpha"]
      }
    }
  }'
```

**Expected**: ALLOW (Alpha COI membership satisfied)

```bash
# Beta COI member trying to access Alpha document (DENY)
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "beta.user@contractor.com",
        "cclr": "SECRET",
        "country": "USA",
        "aciCOI": ["Beta"]
      },
      "resource": {
        "resourceId": "doc-alpha-001",
        "classification": "SECRET",
        "releasabilityTo": ["USA"],
        "COI": ["Alpha"]
      }
    }
  }'
```

**Expected**: DENY (Beta ≠ Alpha; compartments are mutually exclusive)

## Compatibility Notes

### Backward Compatibility

The policy remains **100% backward compatible** with existing tests and integrations:

- ✅ Standard attribute names (`clearance`, `countryOfAffiliation`, `acpCOI`) still work
- ✅ Existing test cases unchanged (new test cases added, not replaced)
- ✅ Decision logic unchanged (only attribute access patterns updated)

### Migration Path

Systems currently using standard attribute names can:

1. **Continue using standard names** (no changes required)
2. **Gradually migrate** to alternative names (both work simultaneously)
3. **Use alternative names** for new integrations

### Error Messages

Error messages now reflect both naming conventions:

- Before: `"Missing required attribute: clearance"`
- After: `"Missing required attribute: clearance (or cclr)"`

This helps users understand that either attribute name is acceptable.

## Decision Matrix (Updated)

| # | Test Case | Auth | Attrs | Clearance | Country | COI | Result | Notes |
|---|-----------|------|-------|-----------|---------|-----|--------|-------|
| 1 | Success (std) | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | Standard attribute names |
| 2 | Alt attrs | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | cclr, country, aciCOI |
| 3 | RESTRICTED | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | RESTRICTED = level 0 |
| 4 | Alpha COI | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | No country restrictions |
| 5 | Beta COI | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | Project-based COI |
| 6 | Gamma COI | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | SAP compartment |
| 7 | Alpha mismatch | ✅ | ✅ | ✅ | ✅ | ❌ | **DENY** | Beta ≠ Alpha |
| 8 | Clearance | ✅ | ✅ | ❌ | ✅ | ✅ | **DENY** | CONFIDENTIAL < SECRET |
| 9 | Country | ✅ | ✅ | ✅ | ❌ | ✅ | **DENY** | FRA not in [USA, GBR] |
| 10 | NATO vs FVEY | ✅ | ✅ | ✅ | ❌ | ❌ | **DENY** | DEU + NATO-COSMIC |
| 11 | Unauth | ❌ | ✅ | ✅ | ✅ | ✅ | **DENY** | Not authenticated |
| 12 | Missing attrs | ✅ | ❌ | - | ✅ | ✅ | **DENY** | No cclr or clearance |
| 13 | Public | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | UNCLASSIFIED |
| 14 | TOP_SECRET | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | Highest clearance |

**Total**: 14 test cases (up from 8)

## Summary

✅ **Alternative attribute names** supported (`cclr`, `country`, `aciCOI`)  
✅ **RESTRICTED classification** added (level 0, same as UNCLASSIFIED)  
✅ **Alpha/Beta/Gamma COI** test cases added (6 new test cases)  
✅ **Backward compatibility** maintained (all existing tests still pass)  
✅ **Best practice approach** using helper functions for attribute fallback  

The simplified policy is now **ready for use** with systems using alternative attribute naming conventions and supports all common COI patterns including special access programs.





