# DIVE V3 - Phase 2 SSO Testing Implementation

## Summary

This directory contains comprehensive automated tests for bidirectional SSO between Hub and Spoke instances.

## What's Included

### Test Suites (27 total tests)

1. **Hub → Spoke SSO Tests** (10 tests)
   - Authentication, API access, attribute mapping
   - Token validation (refresh, invalid, expired)
   - OPA authorization, releasability checks

2. **Spoke → Hub SSO Tests** (10 tests)
   - Authentication, API access, attribute normalization
   - Clearance/COI mapping, uniqueID handling
   - Authorization, classification, releasability

3. **Multi-Spoke Tests** (3 tests)
   - Triangle routing (FRA → GBR → DEU)
   - Simultaneous sessions
   - Bidirectional SSO (FRA ↔ GBR)

4. **Federation Database Tests** (3 tests)
   - Federation links verification
   - Health check recording
   - Status view queries

5. **Performance Tests** (1 test)
   - SSO latency measurement (target: p95 < 500ms)

## Files

- `test-sso-comprehensive.sh` - Main test suite (27 tests)
- `test-bidirectional-federation-automation.sh` - Validates automatic bidirectional setup
- `test-federation-db.sh` - Database-specific tests
- `test-federation-e2e.sh` - End-to-end federation workflows

## Usage

### Prerequisites

1. Hub deployed: `./dive hub up`
2. At least one spoke: `./dive spoke deploy FRA`

### Running Tests

**All federation tests:**
```bash
./tests/run-tests.sh federation
```

**Direct invocation:**
```bash
bash tests/federation/test-sso-comprehensive.sh
```

**Custom spoke configuration:**
```bash
TEST_SPOKE_1=EST TEST_SPOKE_2=LVA bash tests/federation/test-sso-comprehensive.sh
```

## Test Coverage

- ✅ Token-based authentication (password grant)
- ✅ JWT claim verification (sub, iss, uniqueID, clearance, country, COI)
- ✅ Backend API access validation
- ✅ OPA authorization integration
- ✅ Attribute mapping and normalization
- ✅ Releasability and classification policy enforcement
- ✅ Multi-spoke routing and simultaneous sessions
- ✅ Federation database state validation
- ✅ Performance metrics (SSO latency)

## Test Strategy

### Automated vs. Manual

**Automated** (this suite):
- Token acquisition and validation
- API connectivity
- Attribute mapping
- Authorization decisions
- Database state verification

**Manual** (browser-based):
- Full SSO redirect flows
- IdP selection at Hub
- Visual verification of user experience
- Cross-browser testing

See `docs/PHASE2-SSO-TESTING-GUIDE.md` for manual testing procedures.

## Test Output

**Success:**
```
═══════════════════════════════════════════════════════════
TEST SUMMARY
═══════════════════════════════════════════════════════════

Total Tests: 27
Passed: 27
Failed: 0

Pass Rate: 100%

🎉 ALL TESTS PASSED!
```

**With Failures:**
```
Total Tests: 27
Passed: 25
Failed: 2

Pass Rate: 92%

❌ SOME TESTS FAILED
```

## Integration with CI/CD

These tests can be integrated into continuous integration pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Federation SSO Tests
  run: |
    ./dive hub up
    ./dive spoke deploy FRA
    ./tests/run-tests.sh federation
```

## Troubleshooting

**Cannot get token:**
- Check Keycloak health: `docker ps | grep keycloak`
- Verify test users exist: `cat instances/fra/test-credentials.txt`

**Cross-spoke access denied:**
- Verify federation: `./dive federation verify FRA`
- Sync secrets: `./dive federation sync-secrets FRA`

**Database tests skip:**
- Check PostgreSQL: `docker ps | grep postgres`
- Verify schema: `docker exec dive-hub-postgres psql -U postgres -d orchestration -c '\dt'`

## References

- **Phase 2 Guide**: `docs/PHASE2-SSO-TESTING-GUIDE.md`
- **Federation Test Module**: `scripts/dive-modules/federation-test.sh`
- **Test Runner**: `tests/run-tests.sh`

---

**Created**: 2026-01-27  
**Phase**: 2 - Bidirectional SSO Validation  
**Status**: ✅ Implementation Complete
