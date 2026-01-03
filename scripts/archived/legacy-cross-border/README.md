# Archived Legacy Scripts

These scripts were archived on **January 3, 2026** because they reference the deprecated `dive-v3-cross-border-client` pattern.

## Why Archived

The `dive-v3-cross-border-client` was never actually used for federation. The correct pattern for cross-border federation is:

- **Hub→Spoke**: Hub creates IdP pointing to Spoke, using `dive-v3-broker-usa` client ON the Spoke
- **Spoke→Hub**: Spoke creates IdP pointing to Hub, using `dive-v3-broker-{spoke}` client ON the Hub

## Correct Pattern

Federation clients follow the naming convention: `dive-v3-broker-{source_code}` on the target Keycloak.

For example:
- When USA (Hub) federates to NZL (Spoke), NZL's Keycloak has client `dive-v3-broker-usa`
- When NZL (Spoke) federates to USA (Hub), USA's Keycloak has client `dive-v3-broker-nzl`

## Scripts in this Archive

| Script | Original Purpose |
|--------|------------------|
| apply-nation-mappers.sh | Apply nation-specific protocol mappers |
| cleanup-legacy-clients.sh | Clean up old client patterns |
| create-cross-border-client-gbr.sh | Create cross-border client in GBR |
| create-dive-scopes-gbr.sh | Create DIVE scopes in GBR |
| debug-connectivity.sh | Debug federation connectivity |
| debug-gbr-usa-federation.sh | Debug GBR→USA federation issues |
| implement-locale-attributes.sh | Add locale-specific attributes |
| investigate-attribute-flow.sh | Trace attribute flow through federation |
| make-gbr-idp-persistent.sh | Make GBR IdP configuration persistent |
| sync-federation-secrets.sh | Sync federation client secrets |
| test-federation-smoke.sh | Smoke test federation setup |
| trace-mapper-flow.sh | Trace protocol mapper execution |
| verify-gbr-federation.sh | Verify GBR federation configuration |
| verify-idps.sh | Verify IdP configurations |
| verify-jwt-claims.sh | Verify JWT claims from federation |

## Do Not Use

These scripts will not work with the current architecture. If you need similar functionality, use the updated scripts in `scripts/dive-modules/` that use the correct client naming pattern.
