# DIVE V3 Production Protocol Mappers

**⚠️ PII MINIMIZATION ENFORCED ⚠️**

## Purpose

This directory contains the **PRODUCTION** protocol mapper template for DIVE V3. This template strictly enforces PII minimization by including ONLY the 4 core DIVE claims required for authorization decisions.

## Production Template

**File:** `dive-core-claims.json`

**Contains ONLY:**
1. `uniqueID` - Unique identifier (required)
2. `clearance` - Security clearance level (required)
3. `countryOfAffiliation` - ISO 3166-1 alpha-3 country code (required)
4. `acpCOI` - Communities of Interest (optional, multivalued)

## What is NOT Included (PII Minimization)

The following are **EXPLICITLY EXCLUDED** to minimize PII:
- ❌ Real names (family_name, given_name)
- ❌ Email addresses
- ❌ National identifiers (SSN, personnummer, etc.)
- ❌ Phone numbers
- ❌ Addresses
- ❌ Any other personally identifiable information

## Display Names

User display names are **auto-generated pseudonyms** created by the backend:

```typescript
// Backend pseudonym generation
function generatePseudonym(uniqueID: string): string {
  const hash = crypto.createHash('sha256')
    .update(uniqueID)
    .digest('hex')
    .substring(0, 6);
  return `User-${hash.toUpperCase()}`;
}

// Example: testuser-gbr-1 → User-A3F5E2
```

## Usage

### Apply Production Mappers

```bash
# Apply to current instance
./dive federation mappers apply

# Apply to specific instance
./dive --instance fra federation mappers apply

# Dry-run preview
./dive --dry-run federation mappers apply
```

### Verify Production Mappers

```bash
# Verify all 4 required mappers are present
./dive federation mappers verify

# Verify specific instance
./dive --instance gbr federation mappers verify
```

## Security Classification

- **Data Classification:** CONTROLLED UNCLASSIFIED
- **PII Status:** NO PII - Pseudonymized identifiers only
- **Authorization Data:** YES - Clearance, country, COI for access control
- **Audit Compliance:** Full audit trail without exposing PII

## Reference Templates

For **REFERENCE ONLY** (NOT for production use), see:
- `keycloak/mapper-templates/reference/nato-nations/` - Nation-specific attribute examples
- **WARNING:** Reference templates contain PII and are for documentation purposes only

## Compliance

This template complies with:
- ✅ DIVE V3 PII Minimization Policy
- ✅ ACP-240 Attribute-Based Access Control
- ✅ Data Protection Best Practices
- ✅ Need-to-Know Principle (only authorization attributes)

## Migration from Reference Templates

If you previously used nation-specific templates with PII:

1. **Remove old mappers:**
   ```bash
   # Delete all mappers on client
   # (Manual via Keycloak Admin Console or API)
   ```

2. **Apply production template:**
   ```bash
   ./dive federation mappers apply
   ```

3. **Verify only 4 mappers present:**
   ```bash
   ./dive federation mappers verify
   ```

4. **Update backend to generate pseudonyms:**
   - Implement pseudonym generation function
   - Store pseudonyms as computed attributes
   - Never log or transmit real names

## Questions?

See `PII_MINIMIZATION_POLICY.md` for complete policy and rationale.

---

**Status:** Production-Ready  
**Version:** 1.0.0  
**Last Updated:** 2025-12-13
