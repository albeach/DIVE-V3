# E2E Test Quarantine

Tests tagged with `@quarantine` are known to be flaky or infrastructure-dependent.
They run in a separate non-blocking CI job and do not gate PR merges.

## Quarantined Tests

| Spec File | Quarantined | Owner | Expiry | Reason |
|-----------|------------|-------|--------|--------|
| `mfa-complete-flow.spec.ts` | 2026-02-20 | @albeach | 2026-03-20 | Requires real Keycloak MFA configuration not available in CI |
| `webauthn-aal3-flow.spec.ts` | 2026-02-20 | @albeach | 2026-03-20 | Requires virtual authenticator infrastructure not available in CI |

## How It Works

1. Tag the `test.describe` block with `@quarantine`:
   ```typescript
   test.describe('My Test', { tag: ['@quarantine'] }, () => { ... });
   ```
2. The full regression shards exclude quarantined tests: `--grep-invert '@quarantine'`
3. A separate `e2e-quarantine` job runs only quarantined tests with `continue-on-error: true`
4. Results appear in the E2E summary but failures do not block merges

## Quarantine Rules

- Every quarantined test MUST have an expiry date (default: 30 days)
- At expiry, the test must be either fixed and un-quarantined, or re-evaluated
- New quarantine entries require a PR with justification
- Maximum 5 quarantined specs at any time
