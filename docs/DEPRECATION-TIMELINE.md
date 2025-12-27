# DIVE V3 CLI Deprecation Timeline

## Overview

This document tracks deprecated commands and features in the DIVE V3 CLI, providing migration guidance and removal timelines.

## Deprecation Policy

- **v4.0 (Current)**: Deprecation warnings added to all deprecated commands
- **v4.x**: Commands continue to work with warnings for at least 2 minor versions
- **v5.0 (Future)**: Deprecated commands will be removed

## Timeline

| Version | Action | Date |
|---------|--------|------|
| v4.0 | Add deprecation warnings | December 2025 |
| v4.1-v4.2 | Grace period (commands work with warnings) | Q1-Q2 2026 |
| v5.0 | Remove deprecated commands | Q3 2026 (Est.) |

## Deprecated Commands

### Federation Setup Module

#### High-Level Syntax Changes (9 commands)

| Deprecated Command | Use Instead | Status | Removal |
|-------------------|-------------|--------|---------|
| `federation-setup configure-all` | `federation-setup configure all` | ⚠️ Deprecated | v5.0 |
| `federation-setup register-hub-all` | `federation-setup register-hub all` | ⚠️ Deprecated | v5.0 |
| `federation-setup verify-all` | `federation-setup verify all` | ⚠️ Deprecated | v5.0 |
| `federation-setup sync-opa-all` | `federation-setup sync-opa all` | ⚠️ Deprecated | v5.0 |
| `federation-setup configure-idp` | `federation-setup configure <spoke>` | ⚠️ Deprecated | v5.0 |
| `federation-setup sync-env` | `federation-setup configure <spoke>` | ⚠️ Deprecated | v5.0 |
| `federation-setup sync-hub-secret` | `federation-setup configure <spoke>` | ⚠️ Deprecated | v5.0 |
| `federation-setup create-hub-client` | `federation-setup configure <spoke>` | ⚠️ Deprecated | v5.0 |
| `federation-setup create-spoke-client` | `federation-setup register-hub <spoke>` | ⚠️ Deprecated | v5.0 |

**Rationale**: Simplified to use consistent `<subcommand> all` syntax instead of `<subcommand>-all`. Consolidated multiple single-purpose commands into comprehensive `configure` and `register-hub` workflows.

#### Auto-Configured Features (4 commands)

| Deprecated Command | Use Instead | Status | Removal |
|-------------------|-------------|--------|---------|
| `federation-setup fix-issuer` | Auto-configured in realm setup | ⚠️ Deprecated | v5.0 |
| `federation-setup fix-issuer-all` | Auto-configured in realm setup | ⚠️ Deprecated | v5.0 |
| `federation-setup assign-scopes` | `federation-setup setup-claims <spoke>` | ⚠️ Deprecated | v5.0 |
| `federation-setup create-mappers` | `federation-setup setup-claims <spoke>` | ⚠️ Deprecated | v5.0 |

**Rationale**: Realm issuer is now auto-configured during spoke initialization. Scope assignment and mapper creation consolidated into single `setup-claims` command.

#### Manual Operations (4 commands)

| Deprecated Command | Use Instead | Status | Removal |
|-------------------|-------------|--------|---------|
| `federation-setup delete-user` | Keycloak Admin Console | ⚠️ Deprecated | v5.0 |
| `federation-setup delete-hub-user` | Keycloak Admin Console | ⚠️ Deprecated | v5.0 |
| `federation-setup sync-usa-idp-secret` | `federation-setup configure <spoke>` | ⚠️ Deprecated | v5.0 |
| `federation-setup sync-frontend-secret` | `spoke sync-secrets` | ⚠️ Deprecated | v5.0 |

**Rationale**: User deletion should be done through Keycloak Admin Console for proper audit trail. Secret sync now handled by unified commands.

### Hub Module (2 commands)

| Deprecated Command | Use Instead | Status | Removal |
|-------------------|-------------|--------|---------|
| `hub bootstrap` | `hub deploy` | ⚠️ Deprecated | v5.0 |
| `hub instances` | `hub spokes list` | ⚠️ Deprecated | v5.0 |

**Rationale**: Renamed for clarity - `deploy` is more intuitive than `bootstrap`, and `spokes list` is more descriptive than `instances`.

### Spoke Module (5 commands)

| Deprecated Command | Use Instead | Status | Removal |
|-------------------|-------------|--------|---------|
| `spoke setup` | `spoke init` | ⚠️ Deprecated | v5.0 |
| `spoke wizard` | `spoke init` | ⚠️ Deprecated | v5.0 |
| `spoke purge` | `spoke clean` | ⚠️ Deprecated | v5.0 |
| `spoke teardown` | `spoke clean` or `spoke down` | ⚠️ Deprecated | v5.0 |
| `spoke countries` | `spoke list-countries` | ⚠️ Deprecated | v5.0 |

**Rationale**: Standardized naming - `init` is clearer than `setup`/`wizard`, `clean` is more descriptive than `purge`, and `list-countries` follows noun-verb pattern.

## Migration Guide

### Example Migrations

#### Federation Setup

**Before (v3.x):**
```bash
./dive federation-setup configure-all
./dive federation-setup register-hub-all
./dive federation-setup verify-all
```

**After (v4.0+):**
```bash
./dive federation-setup configure all
./dive federation-setup register-hub all
./dive federation-setup verify all
```

#### Hub Management

**Before (v3.x):**
```bash
./dive hub bootstrap
./dive hub instances
```

**After (v4.0+):**
```bash
./dive hub deploy
./dive hub spokes list
```

#### Spoke Management

**Before (v3.x):**
```bash
./dive spoke wizard
./dive spoke purge
./dive spoke countries
```

**After (v4.0+):**
```bash
./dive spoke init
./dive spoke clean
./dive spoke list-countries
```

## Automated Migration

You can use the following script to update your deployment scripts:

```bash
#!/bin/bash
# migrate-dive-commands.sh

# Federation setup
sed -i 's/federation-setup configure-all/federation-setup configure all/g' "$@"
sed -i 's/federation-setup register-hub-all/federation-setup register-hub all/g' "$@"
sed -i 's/federation-setup verify-all/federation-setup verify all/g' "$@"

# Hub
sed -i 's/hub bootstrap/hub deploy/g' "$@"
sed -i 's/hub instances/hub spokes list/g' "$@"

# Spoke
sed -i 's/spoke wizard/spoke init/g' "$@"
sed -i 's/spoke setup/spoke init/g' "$@"
sed -i 's/spoke purge/spoke clean/g' "$@"
sed -i 's/spoke countries/spoke list-countries/g' "$@"
```

Usage:
```bash
chmod +x migrate-dive-commands.sh
./migrate-dive-commands.sh scripts/*.sh
```

## Backward Compatibility

All deprecated commands will continue to work until v5.0 with the following behavior:

1. **Warning Message**: Each deprecated command displays a warning:
   ```
   ⚠ Deprecated: Use '<new-command>' instead (removal in v5.0)
   ```

2. **Functional**: The command executes normally after displaying the warning

3. **Log Tracking**: Deprecation warnings are logged for monitoring usage

## Monitoring Deprecation Usage

To check if you're using deprecated commands:

```bash
# Search your scripts for deprecated commands
grep -r "federation-setup configure-all" scripts/
grep -r "hub bootstrap" scripts/
grep -r "spoke wizard" scripts/

# Check logs for deprecation warnings
./dive logs | grep "Deprecated"
```

## Breaking Changes in v5.0

When v5.0 is released, the following will happen:

1. **Removed Commands**: All deprecated command aliases will be removed from the codebase
2. **Error Messages**: Attempting to use removed commands will result in:
   ```
   ERROR: Unknown command '<command>'
   Did you mean '<new-command>'?
   ```
3. **Documentation**: All references to deprecated commands will be removed from documentation

## Questions?

For questions about deprecation or migration assistance:
- See updated documentation: `DIVE-V3-CLI-USER-GUIDE.md`
- Check examples in `scripts/examples/`
- Open an issue for migration help

---

**Last Updated**: December 27, 2025
**Current Version**: v4.0
**Next Major Release**: v5.0 (Q3 2026)
