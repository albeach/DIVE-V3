### Keycloak Claims Mappers Checklist (for Identity Drawer)

Required to populate auth_time, acr, amr in id_token:

- Client: `dive-v3-client`
- Mappers (ID Token):
  - Built-in: `auth_time` (User Session Note or built-in claim). Ensure “Add to ID token”.
  - Mapper: `acr` → Claim name `acr`, JSON type String, Include in ID token.
  - Mapper: `amr` → Claim name `amr`, JSON type String or JSON Array. Recommended array from Authentication Flow notes; Include in ID token.
- Ensure Authentication Flow sets AAL (acr) and methods (amr) appropriately.

Optional:
- Include `uniqueID`, `clearance`, `countryOfAffiliation`, `acpCOI` as protocol mappers (already configured in pilot realm).



