# Archived Realm Configuration Files

## Status: ARCHIVED - No Longer Used

These realm JSON files have been archived as part of the transition to **True Terraform SSOT** (Single Source of Truth) implementation.

## What Changed

**Before (v3.x):** Hybrid approach
- JSON realm files used for bootstrap
- Terraform used to modify/overlay configuration
- Dual maintenance burden

**After (v4.0):** True SSOT
- `SKIP_REALM_IMPORT=true` by default
- Keycloak starts completely empty
- Terraform creates entire realm configuration from scratch
- No JSON files in normal operation

## Emergency Recovery Only

These archived JSON files should **only** be used for emergency disaster recovery scenarios:

1. Set `SKIP_REALM_IMPORT=false` in docker-compose
2. Copy desired JSON file back to `../` (parent directory)
3. Start Keycloak to import minimal bootstrap configuration
4. Use Terraform to restore full configuration

## Migration Notes

- All realm configuration now lives in Terraform modules
- No more maintaining JSON exports in sync with Terraform
- Development and production use identical configuration approach
- Eliminates configuration drift between environments

## Files in This Archive

- `dive-v3-broker-*.json` - Instance-specific realm configurations
- `fra-realm.json` - Legacy France realm configuration

These files are kept for historical reference and emergency recovery only.