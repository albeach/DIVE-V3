# NATO Nations Protocol Mapper Templates

**⚠️⚠️⚠️ PII MINIMIZATION WARNING ⚠️⚠️⚠️**

```
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║  ⚠️  REFERENCE ONLY - DO NOT USE IN PRODUCTION  ⚠️                  ║
║                                                                      ║
║  These templates contain PERSONALLY IDENTIFIABLE INFORMATION (PII): ║
║    • Real names (family_name, given_name)                          ║
║    • Email addresses                                                ║
║    • National identifiers (SSN, personnummer, PESEL, etc.)         ║
║                                                                      ║
║  This VIOLATES DIVE's core PII minimization objective!             ║
║                                                                      ║
║  FOR PRODUCTION USE:                                                ║
║    keycloak/mapper-templates/production/dive-core-claims.json       ║
║    (Contains ONLY 4 claims: uniqueID, clearance,                   ║
║     countryOfAffiliation, acpCOI)                                   ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

## Purpose of These Templates

These NATO nation templates are provided for **REFERENCE AND DOCUMENTATION PURPOSES ONLY** to demonstrate:
- How different nations structure identity attributes
- Locale-specific naming conventions
- Attribute normalization patterns

**These templates must NOT be used in production systems.**

## Production Alternative

**For production deployments, use:**
```bash
./dive federation mappers apply
# → Uses keycloak/mapper-templates/production/dive-core-claims.json
# → Contains ONLY 4 PII-minimized claims
```

---

# NATO Nations Protocol Mapper Templates (Reference Only)

## Purpose

These templates enable true coalition interoperability by:
- Allowing each nation to use their own attribute naming conventions
- Normalizing all attributes to OIDC standard claims (family_name, given_name, email)
- Including DIVE custom claims (countryOfAffiliation, clearance, uniqueID, acpCOI)
- Supporting nation-specific identifiers (e.g., SSN, personnummer, pesel)

## Template Structure

Each nation template includes:
- **Nation metadata**: Name, ISO 3166 code, language, attribute convention pattern
- **Attribute mappings**: Locale-specific names for surname, givenName, email, nationalId
- **Protocol mappers**: 9 mappers total (4 profile + 4 DIVE + 1 national ID)

## Available Nations

| Nation | ISO 3166 | File | Convention Pattern |
|--------|----------|------|-------------------|
| Albania | ALB | albania.json | Albanian |
| Belgium | BEL | belgium.json | Bilingual (Dutch/French) |
| Bulgaria | BGR | bulgaria.json | Cyrillic |
| Canada | CAN | canada.json | Western European |
| Croatia | HRV | croatia.json | Eastern European |
| Czech Republic | CZE | czechia.json | Eastern European |
| Denmark | DNK | denmark.json | Nordic |
| Estonia | EST | estonia.json | Baltic |
| Finland | FIN | finland.json | Nordic |
| France | FRA | france.json | Romance |
| Germany | DEU | germany.json | Germanic |
| Greece | GRC | greece.json | Southern European |
| Hungary | HUN | hungary.json | Eastern European |
| Iceland | ISL | iceland.json | Nordic |
| Italy | ITA | italy.json | Romance |
| Latvia | LVA | latvia.json | Baltic |
| Lithuania | LTU | lithuania.json | Baltic |
| Luxembourg | LUX | luxembourg.json | Multilingual |
| Montenegro | MNE | montenegro.json | Eastern European |
| Netherlands | NLD | netherlands.json | Germanic |
| North Macedonia | MKD | north-macedonia.json | Eastern European |
| Norway | NOR | norway.json | Nordic |
| Poland | POL | poland.json | Eastern European |
| Portugal | PRT | portugal.json | Romance |
| Romania | ROU | romania.json | Romance |
| Slovakia | SVK | slovakia.json | Eastern European |
| Slovenia | SVN | slovenia.json | Eastern European |
| Spain | ESP | spain.json | Romance |
| Sweden | SWE | sweden.json | Nordic |
| Turkey | TUR | turkey.json | Transcontinental |
| United Kingdom | GBR | united-kingdom.json | Western European |
| United States | USA | united-states.json | Western European |

## Usage

### Option 1: Using the Utility Script

```bash
# Apply France mappers to a Keycloak client
./scripts/apply-nation-mappers.sh france localhost:8447 dive-v3-broker-fra dive-v3-cross-border-client
```

### Option 2: Manual Application via Keycloak Admin API

```bash
# Read the template
TEMPLATE=$(cat keycloak/mapper-templates/nato-nations/france.json)

# Extract protocol mappers
MAPPERS=$(echo "$TEMPLATE" | jq '.protocolMappers')

# For each mapper, POST to Keycloak:
# POST /admin/realms/{realm}/clients/{client-id}/protocol-mappers/models
```

### Option 3: Import During Keycloak Realm Setup

Include the protocol mappers in your realm import JSON when setting up a new Keycloak instance.

## Template Format

```json
{
  "nation": {
    "name": "France",
    "iso3166": "FRA",
    "language": "French",
    "attributeConvention": "Romance"
  },
  "attributes": {
    "profile": {
      "surname": "nom",
      "givenName": "prénom",
      "email": "courriel"
    },
    "nationalId": {
      "name": "numéroIdentification",
      "description": "French national identification number"
    }
  },
  "protocolMappers": [
    // 9 mappers: 4 profile + 4 DIVE + 1 national ID
  ]
}
```

## Protocol Mapper Flow

```
Nation-Specific Attribute → Protocol Mapper → OIDC Standard Claim → Import Mapper → USA Format

Example (France):
nom (France) → family_name (OIDC) → lastName (USA)
prénom (France) → given_name (OIDC) → firstName (USA)
```

## DIVE Custom Claims

All templates include these DIVE-specific claims:
- **countryOfAffiliation**: Required - ISO 3166 country code (e.g., "FRA")
- **clearance**: Required - Security clearance level (UNCLASSIFIED, SECRET, etc.)
- **uniqueID**: Required - Unique user identifier across coalition
- **acpCOI**: Optional - Community of Interest tags (multivalued)

## National ID Attributes

Each nation has a unique identifier attribute:
- **USA**: socialSecurityNumber
- **UK**: ukPersonnelNumber
- **France**: numéroIdentification
- **Germany**: personalausweis
- **Poland**: pesel
- **Norway**: fodselsnummer
- **Finland**: henkilotunnus
- (See individual templates for all nations)

**Note**: National IDs are included in access tokens only (not ID tokens or userinfo), as they may be sensitive.

## Extending Templates

To add a new nation:
1. Copy `_template.json`
2. Update nation metadata
3. Set locale-specific attribute names
4. Update national ID information
5. Test with `apply-nation-mappers.sh`

## References

- **OIDC Standard Claims**: [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims)
- **NATO Standards**: ACP-240 (Attribute-Based Access Control)
- **DIVE Documentation**: See `docs/NATO_ATTRIBUTE_NORMALIZATION.md`
- **Implementation Guide**: See `COALITION_ATTRIBUTE_NORMALIZATION.md`

## Notes

- All templates normalize to the same OIDC claims (family_name, given_name, email)
- DIVE custom claims use consistent naming across all nations
- Templates are JSON for easy parsing and automation
- Mappers include all three token types (ID, access, userinfo)
- National IDs follow principle of data minimization (access token only)

