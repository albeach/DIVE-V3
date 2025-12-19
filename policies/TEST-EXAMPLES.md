# DIVE V3 Simplified Policy - Test Examples

This document provides test examples for the simplified authorization policy in both OPA (Rego) and XACML formats.

## Quick Reference

### Policy Files
- **OPA/Rego**: `simplified_authorization_policy.rego`
- **XACML v3**: `simplified_authorization_policy.xml`

### Core Rules
1. **Authentication**: Subject must be authenticated
2. **Required Attributes**: uniqueID, clearance (or cclr), countryOfAffiliation (or country), classification, releasabilityTo
3. **Clearance Level**: Subject clearance ≥ Resource classification (UNCLASSIFIED=RESTRICTED=0, CONFIDENTIAL=1, SECRET=2, TOP_SECRET=3)
4. **Country Releasability**: Subject country ∈ Resource releasabilityTo
5. **Community of Interest (COI)**: Subject COI ∩ Resource COI ≠ ∅ (if COI required; Alpha/Beta/Gamma have no country restrictions)

## Attribute Name Conventions

The policy supports **multiple attribute naming conventions** for flexibility:

| Standard Name | Alternative Name | Description |
|---------------|------------------|-------------|
| `clearance` | `cclr` | Subject security clearance level |
| `countryOfAffiliation` | `country` | Subject's country code (ISO 3166-1 alpha-3) |
| `acpCOI` | `aciCOI` | Subject's Community of Interest tags |

**Best Practice**: Use the alternative names (`cclr`, `country`, `aciCOI`) for consistency with external systems.

---

## Test Case 1: Successful Access (All Checks Pass)

### Expected Result: **ALLOW**

```bash
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "john.doe@mil",
        "clearance": "SECRET",
        "countryOfAffiliation": "USA",
        "acpCOI": ["FVEY"]
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

### Expected Response
```json
{
  "result": {
    "allow": true,
    "reason": "Access granted - all conditions satisfied",
    "evaluation": {
      "authenticated": true,
      "attributes_present": true,
      "clearance_sufficient": true,
      "country_releasable": true,
      "coi_satisfied": true
    }
  }
}
```

---

## Test Case 2: Alternative Attribute Names (ALLOW)

### Expected Result: **ALLOW** - Using cclr, country, aciCOI instead of standard names

```bash
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "jane.smith@mil",
        "cclr": "SECRET",
        "country": "USA",
        "aciCOI": ["FVEY"]
      },
      "resource": {
        "resourceId": "doc-456",
        "classification": "CONFIDENTIAL",
        "releasabilityTo": ["USA", "GBR", "CAN"],
        "COI": ["FVEY"]
      }
    }
  }'
```

### Expected Response
```json
{
  "result": {
    "allow": true,
    "reason": "Access granted - all conditions satisfied",
    "evaluation": {
      "authenticated": true,
      "attributes_present": true,
      "clearance_sufficient": true,
      "country_releasable": true,
      "coi_satisfied": true
    }
  }
}
```

---

## Test Case 3: RESTRICTED Classification (ALLOW)

### Expected Result: **ALLOW** - RESTRICTED is equivalent to UNCLASSIFIED (level 0)

```bash
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "public.user@example.com",
        "cclr": "RESTRICTED",
        "country": "USA"
      },
      "resource": {
        "resourceId": "doc-restricted",
        "classification": "RESTRICTED",
        "releasabilityTo": ["USA", "GBR"]
      }
    }
  }'
```

### Expected Response
```json
{
  "result": {
    "allow": true,
    "reason": "Access granted - all conditions satisfied",
    "evaluation": {
      "authenticated": true,
      "attributes_present": true,
      "clearance_sufficient": true,
      "country_releasable": true,
      "coi_satisfied": true
    }
  }
}
```

---

## Test Case 4: Alpha COI Access (ALLOW)

### Expected Result: **ALLOW** - Special Access Program with Alpha COI (no country restrictions)

```bash
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

### Expected Response
```json
{
  "result": {
    "allow": true,
    "reason": "Access granted - all conditions satisfied",
    "evaluation": {
      "authenticated": true,
      "attributes_present": true,
      "clearance_sufficient": true,
      "country_releasable": true,
      "coi_satisfied": true
    }
  }
}
```

**Note**: Alpha COI is a compartmentalized program with no explicit country membership. Access is granted based on individual Alpha COI membership, regardless of country affiliation (as long as country is in releasabilityTo).

---

## Test Case 5: Beta COI Project Access (ALLOW)

### Expected Result: **ALLOW** - Research project with Beta COI clearance

```bash
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "beta.researcher@lab.gov",
        "cclr": "TOP_SECRET",
        "country": "USA",
        "aciCOI": ["Beta"]
      },
      "resource": {
        "resourceId": "doc-beta-research",
        "classification": "SECRET",
        "releasabilityTo": ["USA"],
        "COI": ["Beta"]
      }
    }
  }'
```

### Expected Response
```json
{
  "result": {
    "allow": true,
    "reason": "Access granted - all conditions satisfied",
    "evaluation": {
      "authenticated": true,
      "attributes_present": true,
      "clearance_sufficient": true,
      "country_releasable": true,
      "coi_satisfied": true
    }
  }
}
```

**Note**: Beta COI represents a specific research program or project. Like Alpha, it has no country-based membership restrictions.

---

## Test Case 6: Gamma COI Special Access (ALLOW)

### Expected Result: **ALLOW** - Special Access Program (SAP) with Gamma COI

```bash
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "gamma.engineer@defense.mil",
        "cclr": "TOP_SECRET",
        "country": "USA",
        "aciCOI": ["Gamma"]
      },
      "resource": {
        "resourceId": "doc-gamma-sap",
        "classification": "TOP_SECRET",
        "releasabilityTo": ["USA"],
        "COI": ["Gamma"]
      }
    }
  }'
```

### Expected Response
```json
{
  "result": {
    "allow": true,
    "reason": "Access granted - all conditions satisfied",
    "evaluation": {
      "authenticated": true,
      "attributes_present": true,
      "clearance_sufficient": true,
      "country_releasable": true,
      "coi_satisfied": true
    }
  }
}
```

**Note**: Gamma COI is typically used for highly compartmentalized Special Access Programs (SAPs) where access is strictly need-to-know basis.

---

## Test Case 7: Alpha COI Mismatch (DENY)

### Expected Result: **DENY** - User with Beta COI trying to access Alpha document

```bash
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

### Expected Response
```json
{
  "result": {
    "allow": false,
    "reason": "No matching COI: user [Beta] does not intersect resource [Alpha]",
    "evaluation": {
      "authenticated": true,
      "attributes_present": true,
      "clearance_sufficient": true,
      "country_releasable": true,
      "coi_satisfied": false
    }
  }
}
```

**Note**: Alpha, Beta, and Gamma are mutually exclusive compartments. Having clearance for one does not grant access to another.

---

## Test Case 8: Insufficient Clearance (DENY)

### Expected Result: **DENY** - User has CONFIDENTIAL clearance but resource requires SECRET

```bash
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "low.clearance@mil",
        "cclr": "CONFIDENTIAL",
        "country": "USA"
      },
      "resource": {
        "resourceId": "doc-secret-001",
        "classification": "SECRET",
        "releasabilityTo": ["USA"]
      }
    }
  }'
```

### Expected Response
```json
{
  "result": {
    "allow": false,
    "reason": "Insufficient clearance: CONFIDENTIAL < SECRET",
    "evaluation": {
      "authenticated": true,
      "attributes_present": true,
      "clearance_sufficient": false,
      "country_releasable": true,
      "coi_satisfied": true
    }
  }
}
```

---

## Test Case 9: Country Not Releasable (DENY)

### Expected Result: **DENY** - French user trying to access US-UK only document

```bash
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "pierre.dubois@def.fr",
        "cclr": "SECRET",
        "country": "FRA"
      },
      "resource": {
        "resourceId": "doc-789",
        "classification": "SECRET",
        "releasabilityTo": ["USA", "GBR"]
      }
    }
  }'
```

### Expected Response
```json
{
  "result": {
    "allow": false,
    "reason": "Country FRA not in releasabilityTo: [USA, GBR]",
    "evaluation": {
      "authenticated": true,
      "attributes_present": true,
      "clearance_sufficient": true,
      "country_releasable": false,
      "coi_satisfied": true
    }
  }
}
```

---

## Test Case 10: COI Mismatch - NATO vs FVEY (DENY)

### Expected Result: **DENY** - User has NATO-COSMIC but resource requires FVEY

```bash
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "hans.mueller@bundeswehr.de",
        "cclr": "SECRET",
        "country": "DEU",
        "aciCOI": ["NATO-COSMIC"]
      },
      "resource": {
        "resourceId": "doc-fvey-001",
        "classification": "SECRET",
        "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
        "COI": ["FVEY"]
      }
    }
  }'
```

### Expected Response
```json
{
  "result": {
    "allow": false,
    "reason": "No matching COI: user [NATO-COSMIC] does not intersect resource [FVEY]",
    "evaluation": {
      "authenticated": true,
      "attributes_present": true,
      "clearance_sufficient": true,
      "country_releasable": false,
      "coi_satisfied": false
    }
  }
}
```

---

## Test Case 11: Missing Authentication (DENY)

### Expected Result: **DENY** - Unauthenticated access attempt

```bash
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": false,
        "uniqueID": "anonymous",
        "cclr": "UNCLASSIFIED",
        "country": "USA"
      },
      "resource": {
        "resourceId": "doc-public",
        "classification": "UNCLASSIFIED",
        "releasabilityTo": ["USA"]
      }
    }
  }'
```

### Expected Response
```json
{
  "result": {
    "allow": false,
    "reason": "Subject is not authenticated",
    "evaluation": {
      "authenticated": false,
      "attributes_present": true,
      "clearance_sufficient": true,
      "country_releasable": true,
      "coi_satisfied": true
    }
  }
}
```

---

## Test Case 12: Missing Required Attributes (DENY)

### Expected Result: **DENY** - Missing clearance attribute

```bash
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "contractor@example.com",
        "country": "USA"
      },
      "resource": {
        "resourceId": "doc-contractor",
        "classification": "CONFIDENTIAL",
        "releasabilityTo": ["USA"]
      }
    }
  }'
```

### Expected Response
```json
{
  "result": {
    "allow": false,
    "reason": "Missing required attribute: clearance (or cclr)",
    "evaluation": {
      "authenticated": true,
      "attributes_present": false,
      "clearance_sufficient": false,
      "country_releasable": true,
      "coi_satisfied": true
    }
  }
}
```

---

## Test Case 13: UNCLASSIFIED Access (ALLOW)

### Expected Result: **ALLOW** - Public document access

```bash
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "public.user@example.com",
        "cclr": "UNCLASSIFIED",
        "country": "USA"
      },
      "resource": {
        "resourceId": "doc-public-001",
        "classification": "UNCLASSIFIED",
        "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL", "FRA", "DEU"]
      }
    }
  }'
```

### Expected Response
```json
{
  "result": {
    "allow": true,
    "reason": "Access granted - all conditions satisfied",
    "evaluation": {
      "authenticated": true,
      "attributes_present": true,
      "clearance_sufficient": true,
      "country_releasable": true,
      "coi_satisfied": true
    }
  }
}
```

---

## Test Case 14: TOP_SECRET Access (ALLOW)

### Expected Result: **ALLOW** - Highest clearance accessing TOP_SECRET document

```bash
curl -X POST http://localhost:8181/v1/data/dive/authorization/simplified/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "general@mil",
        "cclr": "TOP_SECRET",
        "country": "USA",
        "aciCOI": ["US-ONLY"]
      },
      "resource": {
        "resourceId": "doc-ts-001",
        "classification": "TOP_SECRET",
        "releasabilityTo": ["USA"],
        "COI": ["US-ONLY"]
      }
    }
  }'
```

### Expected Response
```json
{
  "result": {
    "allow": true,
    "reason": "Access granted - all conditions satisfied",
    "evaluation": {
      "authenticated": true,
      "attributes_present": true,
      "clearance_sufficient": true,
      "country_releasable": true,
      "coi_satisfied": true
    }
  }
}
```

---

## Running Tests with OPA

### 1. Start OPA Server
```bash
opa run --server --addr localhost:8181 policies/simplified_authorization_policy.rego
```

### 2. Test with curl (see examples above)

### 3. Test with OPA CLI
```bash
# Test Case 1 (Success)
echo '{
  "input": {
    "subject": {
      "authenticated": true,
      "uniqueID": "john.doe@mil",
      "clearance": "SECRET",
      "countryOfAffiliation": "USA",
      "acpCOI": ["FVEY"]
    },
    "resource": {
      "resourceId": "doc-123",
      "classification": "CONFIDENTIAL",
      "releasabilityTo": ["USA", "GBR", "CAN"],
      "COI": ["FVEY"]
    }
  }
}' | opa eval --data policies/simplified_authorization_policy.rego --input - "data.dive.authorization.simplified.decision"
```

---

## XACML Testing Notes

The XACML v3 representation (`simplified_authorization_policy.xml`) can be tested using:

### 1. AT&T XACML Implementation
```bash
# Requires AT&T XACML PDP library
java -jar xacml-pdp.jar \
  -policy simplified_authorization_policy.xml \
  -request xacml-request.xml
```

### 2. AuthzForce CE (Community Edition)
```bash
# Deploy XACML policy to AuthzForce
curl -X POST http://localhost:8080/authzforce-ce/domains \
  -H "Content-Type: application/xml" \
  -d @simplified_authorization_policy.xml

# Test authorization request
curl -X POST http://localhost:8080/authzforce-ce/domains/{domainId}/pdp \
  -H "Content-Type: application/xml" \
  -d @xacml-request.xml
```

### 3. WSO2 Identity Server
- Import policy via Admin Console → Entitlement → Policy Administration
- Test via Entitlement → TryIt tool

---

## Decision Matrix Summary

| Test Case | Auth | Attrs | Clearance | Country | COI | Result | Notes |
|-----------|------|-------|-----------|---------|-----|--------|-------|
| 1. Success (std attrs) | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | Standard attribute names |
| 2. Alt attrs | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | cclr, country, aciCOI |
| 3. RESTRICTED | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | RESTRICTED = level 0 |
| 4. Alpha COI | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | No country restrictions |
| 5. Beta COI | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | Project-based COI |
| 6. Gamma COI | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | SAP compartment |
| 7. Alpha mismatch | ✅ | ✅ | ✅ | ✅ | ❌ | **DENY** | Beta ≠ Alpha |
| 8. Clearance | ✅ | ✅ | ❌ | ✅ | ✅ | **DENY** | CONFIDENTIAL < SECRET |
| 9. Country | ✅ | ✅ | ✅ | ❌ | ✅ | **DENY** | FRA not in [USA, GBR] |
| 10. NATO vs FVEY | ✅ | ✅ | ✅ | ❌ | ❌ | **DENY** | DEU + NATO-COSMIC |
| 11. Unauth | ❌ | ✅ | ✅ | ✅ | ✅ | **DENY** | Not authenticated |
| 12. Missing attrs | ✅ | ❌ | - | ✅ | ✅ | **DENY** | No cclr or clearance |
| 13. Public | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | UNCLASSIFIED |
| 14. TOP_SECRET | ✅ | ✅ | ✅ | ✅ | ✅ | **ALLOW** | Highest clearance |

---

## Integration with DIVE V3 Backend

The simplified policy can be integrated with the DIVE V3 backend by:

1. **Deploying to OPA**: Copy `simplified_authorization_policy.rego` to OPA server
2. **Update PEP**: Modify backend authz middleware to call `dive.authorization.simplified.decision`
3. **Test**: Use the test cases above to verify integration

### Example PEP Integration
```typescript
// backend/src/middleware/authz.middleware.ts
const opaResponse = await fetch('http://localhost:8181/v1/data/dive/authorization/simplified/decision', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: opaInput })
});

const decision = await opaResponse.json();
if (!decision.result.allow) {
  return res.status(403).json({
    error: 'Forbidden',
    message: decision.result.reason,
    evaluation: decision.result.evaluation
  });
}
```

---

## Key Differences from Full Policy

The simplified policy **omits** the following features from the full DIVE V3 policy:

1. ❌ **Embargo checks** (creationDate validation)
2. ❌ **ZTDF integrity validation** (STANAG 4778 binding)
3. ❌ **KAS obligations** (encrypted resource key management)
4. ❌ **AAL2/MFA verification** (authentication strength checks)
5. ❌ **Classification equivalency** (national classification mapping)
6. ❌ **COI coherence** (mutual exclusivity, releasability alignment)
7. ❌ **Upload releasability** (uploader country validation)
8. ❌ **Advanced COI operators** (ALL vs ANY semantics)

**Use Case**: The simplified policy is suitable for:
- **Testing and demonstration** of core ABAC concepts
- **Training** on attribute-based access control
- **Prototyping** new authorization features
- **External partner integration** with reduced complexity

For production use, deploy the **full policy** (`fuel_inventory_abac_policy.rego`).
