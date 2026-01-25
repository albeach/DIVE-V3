# DIVE V3 Backup & Archival Strategy
**Created:** 2026-01-25  
**Purpose:** Long-term data management and recovery procedures

---

## 📦 Current Archives

### Local Archives (~/Documents/DIVE-V3-Archives/)

| Archive | Size | Contents | Created |
|---------|------|----------|---------|
| `docs-archive-20260125.tar.gz` | 988KB | 346 historical docs | 2026-01-25 |
| `optional-items-archive-20260125.tar.gz` | 32MB | MCP server, examples, etc. | 2026-01-25 |

---

## 🗄️ Recommended Backup Strategy

### Tier 1: Critical Data (Keep Forever)
**Location:** External drive + Cloud backup  
**Retention:** Permanent

- Production database backups
- Configuration files
- Terraform state
- Keycloak realm exports
- Certificate authorities

### Tier 2: Historical Documentation (Keep 2 Years)
**Location:** External drive  
**Retention:** 2 years

- ✅ `docs-archive-20260125.tar.gz` (988KB)
- Session reports
- Completion documents
- Historical testing results

### Tier 3: Development Artifacts (Keep 6 Months)
**Location:** Local archive  
**Retention:** 6 months

- ✅ `optional-items-archive-20260125.tar.gz` (32MB)
- MCP servers
- Test data (STANAG examples)
- Monitoring configs

### Tier 4: Temporary Data (Keep 30 Days)
**Location:** Local only  
**Retention:** 30 days

- Docker volumes (when not running)
- Build artifacts
- Log files
- Temporary test outputs

---

## 🔄 Backup Procedures

### Daily Backups (Automated)
```bash
# Database backups
./dive hub backup db

# Configuration backups
./dive hub backup config
```

### Weekly Backups (Automated)
```bash
# Full instance backup
./dive hub backup full

# Spoke backups
./dive spoke backup usa
./dive spoke backup fra
./dive spoke backup gbr
```

### Monthly Archival (Manual)
```bash
# Create monthly snapshot
DATE=$(date +%Y%m)
tar czf ~/DIVE-Backups/dive-v3-monthly-${DATE}.tar.gz \
    backups/ \
    terraform/ \
    keycloak/realms/

# Verify archive
tar tzf ~/DIVE-Backups/dive-v3-monthly-${DATE}.tar.gz | head -20
```

---

## 📤 External Storage Recommendations

### Option 1: Cloud Storage (Recommended for Production)
```bash
# Google Cloud Storage
gsutil cp ~/Documents/DIVE-V3-Archives/*.tar.gz gs://dive-v3-archives/

# AWS S3
aws s3 cp ~/Documents/DIVE-V3-Archives/*.tar.gz s3://dive-v3-archives/

# Azure Blob Storage
az storage blob upload-batch \
    --source ~/Documents/DIVE-V3-Archives/ \
    --destination dive-v3-archives
```

### Option 2: External Drive (Recommended for Local Dev)
```bash
# Mount external drive
DRIVE="/Volumes/BackupDrive"

# Copy archives
mkdir -p "$DRIVE/DIVE-V3-Archives/$(date +%Y-%m)"
cp ~/Documents/DIVE-V3-Archives/*.tar.gz "$DRIVE/DIVE-V3-Archives/$(date +%Y-%m)/"

# Verify
ls -lh "$DRIVE/DIVE-V3-Archives/$(date +%Y-%m)/"
```

### Option 3: Network Storage (Recommended for Team)
```bash
# NAS/SMB share
NAS="//nas.local/backups"
mount -t smbfs "$NAS" /mnt/nas
cp ~/Documents/DIVE-V3-Archives/*.tar.gz /mnt/nas/DIVE-V3/
```

---

## 🔍 Archive Management

### Current Archives Location
```
~/Documents/DIVE-V3-Archives/
├── docs-archive-20260125.tar.gz (988KB)
└── optional-items-archive-20260125.tar.gz (32MB)
```

### Archive Contents

#### docs-archive-20260125.tar.gz
- 346 historical session documents
- Completion reports
- Test results
- Session summaries
- All dated before 2026-01-25

#### optional-items-archive-20260125.tar.gz
- keycloak-docs-mcp/ (77MB)
- examples/ (8.3MB) - STANAG test files
- authzforce/ (76KB) - XACML PDP
- opentdf-mcp-pack/ (50MB)
- docs/monitoring/ (28KB)

---

## 🗑️ Cleanup Schedule

### After External Backup (Recommended)
Once archives are safely stored externally:

```bash
# Verify external backup exists
# Option 1: Cloud
gsutil ls gs://dive-v3-archives/docs-archive-20260125.tar.gz

# Option 2: External drive
ls -lh /Volumes/BackupDrive/DIVE-V3-Archives/2026-01/

# Then remove local archives (optional)
rm -rf ~/Documents/DIVE-V3-Archives/
```

### Backups Folder (~100MB+)
Current location: `backups/`

**Action Plan:**
1. Review contents for any production data
2. Archive to external storage
3. Remove from active codebase

```bash
# Archive backups folder
tar czf ~/DIVE-Backups/dive-v3-backups-20260125.tar.gz backups/

# Verify archive
tar tzf ~/DIVE-Backups/dive-v3-backups-20260125.tar.gz | head -20

# Copy to external storage
cp ~/DIVE-Backups/dive-v3-backups-20260125.tar.gz /Volumes/BackupDrive/

# Then remove from repo
rm -rf backups/
git add -A
git commit -m "chore: remove archived backups folder (externally stored)"
```

---

## 🔐 Archive Security

### Encryption (Recommended for Sensitive Data)
```bash
# Encrypt archives before external storage
gpg --symmetric --cipher-algo AES256 docs-archive-20260125.tar.gz

# This creates: docs-archive-20260125.tar.gz.gpg

# Decrypt when needed
gpg --decrypt docs-archive-20260125.tar.gz.gpg > docs-archive-20260125.tar.gz
```

### Checksum Verification
```bash
# Create checksums
shasum -a 256 *.tar.gz > CHECKSUMS.txt

# Verify later
shasum -a 256 -c CHECKSUMS.txt
```

---

## 📋 Recovery Procedures

### Restore Historical Documentation
```bash
# Extract archive
cd ~/Documents/DIVE-V3-Archives/
tar xzf docs-archive-20260125.tar.gz

# Restore to repo
cp -r docs-archive-20260125/* /path/to/DIVE-V3/docs/
```

### Restore Optional Components
```bash
# Extract specific component
tar xzf optional-items-archive-20260125.tar.gz keycloak-docs-mcp/

# Or extract all
tar xzf optional-items-archive-20260125.tar.gz
```

### Restore from Git
```bash
# Restore specific file from before cleanup
git show 48ea67ec~1:path/to/file > restored-file

# Restore entire state
git checkout 48ea67ec~1
```

---

## 🎯 Best Practices

### ✅ DO
- Keep multiple backup copies (3-2-1 rule)
- Verify backups after creation
- Test restore procedures regularly
- Document what's in each archive
- Use compression for large files
- Encrypt sensitive data
- Maintain off-site backups

### ❌ DON'T
- Delete archives without verification
- Store only local copies
- Forget to update documentation
- Keep backups on same drive as originals
- Ignore backup failures
- Mix production and development backups

---

## 📅 Maintenance Schedule

| Task | Frequency | Command |
|------|-----------|---------|
| Database backup | Daily | `./dive hub backup db` |
| Config backup | Daily | `./dive hub backup config` |
| Full backup | Weekly | `./dive hub backup full` |
| Archive rotation | Monthly | Manual review & cleanup |
| External sync | Weekly | Copy to external/cloud |
| Restore test | Quarterly | Test recovery procedures |
| Archive review | Annually | Review & prune old archives |

---

## 🆘 Emergency Recovery

### Disaster Recovery Steps
1. **Assess damage** - What was lost?
2. **Stop all services** - Prevent further data loss
3. **Locate backups** - Find most recent valid backup
4. **Verify integrity** - Check backup checksums
5. **Restore data** - Follow recovery procedures
6. **Test system** - Verify everything works
7. **Document incident** - Record what happened

### Recovery Contacts
- **Primary:** System Administrator
- **Backup:** DevOps Team Lead
- **Emergency:** Cloud Provider Support

---

## 📊 Archive Inventory

### Current Inventory (2026-01-25)

| Archive | Location | Size | Files | Status |
|---------|----------|------|-------|--------|
| docs-archive-20260125 | Local | 988KB | 346 | ✅ Active |
| optional-items-archive-20260125 | Local | 32MB | ~400 | ✅ Active |
| backups/ | Repo | ~100MB | Various | ⏳ Pending archival |

### Future Archives
Create dated archives for each major cleanup:
- Format: `{type}-archive-YYYYMMDD.tar.gz`
- Store in: `~/Documents/DIVE-V3-Archives/YYYY-MM/`
- Sync to external storage monthly

---

## 🔗 Related Documentation
- `docs/CODEBASE-CLEANUP-SUMMARY.md` - Cleanup overview
- `docs/CODEBASE-CLEANUP-COMPLETE.md` - Completion report
- `scripts/cleanup-*.sh` - Cleanup automation scripts
- **`scripts/dive-modules/utilities/backup.sh`** - ✨ **Enhanced backup module (v6.0.0)**
- **`tests/backup/test-backup-enhancements.sh`** - ✨ **Backup enhancement tests**

---

## ✨ Implementation Status

**Status:** ✅ **FULLY IMPLEMENTED**

The archival strategy defined in this document has been **fully integrated** into the core DIVE V3 backup module as of 2026-01-25.

### What Was Implemented

All features from this strategy document are now available in `scripts/dive-modules/utilities/backup.sh`:

#### ✅ Tier-Based Retention (§ Best Practices)
- 4-tier system with configurable retention periods
- Automatic classification by filename patterns
- Intelligent cleanup based on tier policies

#### ✅ Encryption (§ Archive Security)
- AES-256-CBC encryption support
- Automatic key generation and management
- Encrypted backup handling

#### ✅ Checksum Verification (§ Archive Security)
- SHA-256 checksum generation
- Integrity validation on listing
- Corruption detection

#### ✅ External Storage Sync (§ External Storage Recommendations)
- Multi-cloud support (GCS, S3, Azure)
- NAS and local storage sync
- Automatic sync after backup creation

#### ✅ Archive Management (§ Cleanup Schedule)
- Age-based archival
- Tier-specific subdirectories
- Automated retention enforcement

### Usage

See the updated `docs/CLEANUP-DOCUMENTATION-INDEX.md` for usage examples and configuration options.

### Testing

Comprehensive test suite validates all functionality:

```bash
bash tests/backup/test-backup-enhancements.sh
```

---

**Last Updated:** 2026-01-25  
**Next Review:** 2026-02-25  
**Owner:** DIVE V3 Development Team  
**Implementation:** ✅ Complete (v6.0.0)
