# Localhost URL Replacement Script

## Purpose
Replaces all hardcoded `localhost` URLs with a custom DNS hostname across the entire DIVE-V3 codebase.

## What It Does
- **Finds:** All files with `http://localhost:XXXX` or `https://localhost:XXXX` (4-digit ports)
- **Replaces with:** `https://kas.js.usa.divedeeper.internal:XXXX` (preserves original port)
- **Scans:** `.tf`, `.sh`, `.yml`, `.yaml`, `.ts`, `.tsx`, `.js`, `.json`, `.md`, `.txt`, `.env*` files
- **Excludes:** `node_modules`, `.git`, `dist`, `coverage`, `logs`, `.next`, `backups`, `tmp`

## Usage

### Dry Run (Preview Only)
```bash
./scripts/replace-localhost-with-dns.sh --dry-run
```

This will show you:
- How many files will be modified
- How many replacements will be made
- Preview of the first 3 occurrences in each file
- NO files will be modified

### Apply Changes
```bash
./scripts/replace-localhost-with-dns.sh
```

This will:
- Create `.bak` backup files for all modified files
- Perform the replacements
- Show summary of changes

## Examples

### Before:
```
http://localhost:8443
https://localhost:4000
https://localhost:3000
```

### After:
```
https://kas.js.usa.divedeeper.internal:8443
https://kas.js.usa.divedeeper.internal:4000
https://kas.js.usa.divedeeper.internal:3000
```

## After Running

1. **Review changes:**
   ```bash
   git diff
   ```

2. **Test thoroughly** on your target environment

3. **Clean up backups (if satisfied):**
   ```bash
   find . -name "*.bak" -delete
   ```

4. **Commit:**
   ```bash
   git add .
   git commit -m "Replace localhost URLs with custom DNS hostname"
   git push origin main
   ```

## Customization

To use a different hostname, edit the script and change:
```bash
NEW_HOSTNAME="kas.js.usa.divedeeper.internal"
```

## Safety Features

- **Backup files:** Creates `.bak` files before modifying
- **Dry run mode:** Preview changes before applying
- **Focused regex:** Only matches 4-digit ports to avoid false positives
- **Excludes:** Automatically excludes build artifacts and dependencies

## Rollback

If you need to rollback:
```bash
# Restore all backups
find . -name "*.bak" -exec sh -c 'mv "$1" "${1%.bak}"' _ {} \;
```

## Notes

- The script forces `https://` for all URLs (even if original was `http://`)
- Preserves the original port number
- Safe to run multiple times (idempotent for same hostname)

