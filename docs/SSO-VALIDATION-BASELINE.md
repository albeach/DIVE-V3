# DIVE V3 SSO Validation Baseline

**Date**: 2026-01-27  
**Status**: Deferred - System not currently deployed  
**Purpose**: Establish baseline for bidirectional SSO behavior

---

## Status

SSO validation is **DEFERRED** until after Phase 1 (Critical Fixes) is complete. The system needs to be fully operational before SSO flows can be tested.

## Planned SSO Testing

Once the system is operational, we will test:

### Hub → Spoke SSO
1. Deploy hub: `./dive hub deploy`
2. Deploy spoke: `./dive spoke deploy FRA`
3. Login to hub (https://localhost:3000)
4. Navigate to FRA spoke frontend
5. Document: SSO automatic? Token exchange? Errors?

### Spoke → Hub SSO
1. Login to FRA spoke frontend
2. Navigate to hub frontend
3. Document: SSO automatic? Token exchange? Errors?

### IdP Configuration Verification
- Hub Keycloak admin: Verify FRA IdP exists
- Spoke Keycloak admin: Verify USA IdP exists
- Protocol mappers: `uniqueID`, `clearance`, `countryOfAffiliation`, `acpCOI`

### Federation Health Status
```bash
./dive federation status
./dive spoke federation-health FRA
```

---

## Expected Outcomes

Document:
- ✅ SSO flow diagrams (both directions)
- ✅ IdP mapper verification status
- ✅ Federation health baseline
- ✅ Gap analysis for automated testing

---

## Next Steps

1. Complete Phase 1 (GCP auth, dynamic discovery, testing)
2. Complete Phase 2 Sprint 2.1 (SSO flow analysis & fixes)
3. Run manual SSO testing
4. Document findings
5. Proceed to automated SSO testing (Phase 2 Sprint 2.2)

---

**Note**: Moving directly to Phase 1 implementation to establish working system first.
