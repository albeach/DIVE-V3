# DIVE V3 - Data Persistence & Configuration Gap Analysis

## Executive Summary

Critical infrastructure gaps were identified during the DEU deployment troubleshooting where:
1. Password configurations weren't applied despite having a standardized `.env.secrets` file
2. Data was lost when services were recreated, requiring full Terraform reapplication

These issues stem from **fundamental architectural gaps** in how secrets and data persistence are managed.

---

## Root Cause Analysis

### 🔴 GAP-1: Environment Variables Require Manual Sourcing

**Problem**: The `.env.secrets` file must be manually `source`d before running `docker compose`.

**Current Flow** (BROKEN):
```bash
# User runs:
docker compose up -d

# Docker reads docker-compose.yml with:
KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-admin}

# Since env var isn't set → falls back to "admin"
```

**Expected Flow**:
```bash
# User runs:
source .env.secrets && docker compose up -d

# Now env vars are set → uses "DivePilot2025!"
```

**Why This Fails**:
- Developers forget to `source` the file
- Documentation isn't prominent enough
- No validation that secrets are loaded
- The `docker compose --env-file` flag doesn't work with `export` statements

---

### 🔴 GAP-2: PostgreSQL Password is Baked Into Volume

**Problem**: `POSTGRES_PASSWORD` only applies when PostgreSQL creates its data volume for the FIRST time.

**Scenario**:
```bash
# Day 1: Developer runs with default password
docker compose up -d
# PostgreSQL creates volume with password "password"

# Day 2: Developer sources .env.secrets
source .env.secrets  # POSTGRES_PASSWORD=DivePilot2025!
docker compose up -d
# PostgreSQL sees existing volume → IGNORES new password!
# Result: Password mismatch, Keycloak can't connect
```

**PostgreSQL Behavior**:
- `POSTGRES_PASSWORD` is an **initialization-only** variable
- Once `/var/lib/postgresql/data` exists, it's ignored
- Must manually ALTER USER to change password, or delete volume

---

### 🔴 GAP-3: KEYCLOAK_ADMIN_PASSWORD Has Same Issue

**Problem**: `KEYCLOAK_ADMIN_PASSWORD` only sets the admin password on first realm creation.

**Once the master realm exists**, this environment variable is ignored!

```bash
# Original setup: admin/admin
# You update docker-compose.yml: KEYCLOAK_ADMIN_PASSWORD=DivePilot2025!
# Restart Keycloak → Password is STILL "admin" in the database
```

---

### 🔴 GAP-4: No Protection Against Volume Deletion

**Problem**: `docker compose down -v` deletes all volumes without warning.

```bash
# Developer trying to "reset" things
docker compose down -v

# Result: ALL DATA GONE
# - Keycloak realms, users, clients
# - MongoDB resources
# - Redis sessions
# - Terraform state doesn't match reality
```

---

### 🔴 GAP-5: No Data Recovery Strategy

**Problem**: When volumes are deleted (accidentally or intentionally), recovery requires:
1. Manual Terraform reapplication
2. Manual test user recreation
3. Manual federation client setup
4. Manual MFA flow bindings

There's no automated way to restore the system to a known-good state.

---

### 🔴 GAP-6: Inconsistent Password References

**Problem**: Multiple places define passwords with different defaults:

| Location | Variable | Default Value |
|----------|----------|---------------|
| docker-compose.yml | KEYCLOAK_ADMIN_PASSWORD | `admin` |
| docker-compose.yml | POSTGRES_PASSWORD | `password` |
| docker-compose.yml (backend) | KEYCLOAK_ADMIN_PASSWORD | `admin` (hardcoded!) |
| .env.secrets | KEYCLOAK_ADMIN_PASSWORD | `DivePilot2025!` |
| .env.secrets | POSTGRES_PASSWORD | `DivePilot2025!` |
| Terraform tfvars | keycloak_admin_password | varies |

---

### 🟡 GAP-7: Docker Compose env_file Doesn't Support export

**Problem**: Docker Compose `env_file` option only reads `KEY=value` format, not `export KEY=value`.

Our `.env.secrets` uses:
```bash
export KEYCLOAK_ADMIN_PASSWORD="${DIVE_MASTER_PASSWORD}"
```

Docker Compose would need:
```
KEYCLOAK_ADMIN_PASSWORD=DivePilot2025!
```

---

## Impact Assessment

| Gap | Severity | Impact | Frequency |
|-----|----------|--------|-----------|
| GAP-1 | 🔴 Critical | Services use wrong passwords | Every startup |
| GAP-2 | 🔴 Critical | PostgreSQL password mismatch | On password change |
| GAP-3 | 🔴 Critical | Keycloak admin locked out | On password change |
| GAP-4 | 🔴 Critical | Complete data loss | On accidental -v |
| GAP-5 | 🔴 Critical | Hours of manual recovery | After any data loss |
| GAP-6 | 🟡 High | Confusion, auth failures | Ongoing |
| GAP-7 | 🟡 Medium | env_file unusable | Configuration |

---

## Recommended Solutions

### Phase 1: Immediate Fixes (Day 1)

#### 1.1 Create Docker-Compatible .env File

Create `.env` (Docker format) alongside `.env.secrets` (shell format):

```bash
# .env (Docker Compose format - AUTO-GENERATED, DO NOT EDIT)
# Generated from .env.secrets by scripts/sync-env.sh

DIVE_MASTER_PASSWORD=DivePilot2025!
KEYCLOAK_ADMIN_PASSWORD=DivePilot2025!
POSTGRES_PASSWORD=DivePilot2025!
MONGO_INITDB_ROOT_PASSWORD=DivePilot2025!
```

#### 1.2 Update docker-compose.yml to Use .env Automatically

Docker Compose automatically reads `.env` in the same directory. Remove default values:

```yaml
# BEFORE (broken)
KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-admin}

# AFTER (correct)
KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD not set}
```

Using `:?` causes an error if the variable isn't set, preventing silent fallback.

#### 1.3 Fix Backend Hardcoded Password

```yaml
# BEFORE
KEYCLOAK_ADMIN_PASSWORD: admin  # Reset to default after DB reset

# AFTER
KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:?Required}
```

---

### Phase 2: Data Protection (Day 2-3)

#### 2.1 Create Safe Start Script

```bash
#!/bin/bash
# scripts/start.sh - Safe startup with environment validation

set -e

# Check if .env exists and has required vars
if [[ ! -f .env ]]; then
  echo "❌ .env not found. Run: ./scripts/setup-env.sh"
  exit 1
fi

# Validate required variables
source .env
REQUIRED_VARS="KEYCLOAK_ADMIN_PASSWORD POSTGRES_PASSWORD"
for var in $REQUIRED_VARS; do
  if [[ -z "${!var}" ]]; then
    echo "❌ Missing: $var"
    exit 1
  fi
done

echo "✅ Environment validated"
docker compose up -d
```

#### 2.2 Create Safe Stop Script (Prevents Accidental -v)

```bash
#!/bin/bash
# scripts/stop.sh - Safe shutdown without data loss

# Never include -v flag!
docker compose down

echo "✅ Services stopped. Data volumes preserved."
echo "⚠️  To delete data, use: ./scripts/reset.sh"
```

#### 2.3 Create Explicit Reset Script (With Confirmation)

```bash
#!/bin/bash
# scripts/reset.sh - Destructive reset with confirmation

echo "⚠️  WARNING: This will DELETE all data!"
echo "  - Keycloak realms and users"
echo "  - MongoDB resources"
echo "  - Redis sessions"
echo ""
read -p "Type 'DELETE ALL DATA' to confirm: " confirmation

if [[ "$confirmation" != "DELETE ALL DATA" ]]; then
  echo "Aborted."
  exit 1
fi

# Backup first
./scripts/backup.sh

# Now reset
docker compose down -v
echo "✅ All data deleted."
```

---

### Phase 3: Automated Recovery (Day 4-5)

#### 3.1 Database Initialization Scripts

Create initialization scripts that run on fresh databases:

```sql
-- scripts/setup/init-keycloak-db.sql
-- Auto-creates keycloak database and sets password

CREATE DATABASE keycloak_db;
ALTER USER postgres WITH PASSWORD 'DivePilot2025!';
GRANT ALL PRIVILEGES ON DATABASE keycloak_db TO postgres;
```

#### 3.2 Keycloak Realm Seeding

Export realm configurations that can be auto-imported:

```yaml
# keycloak/realms/dive-v3-broker-realm.json
# Export from working Keycloak with:
# docker exec dive-v3-keycloak /opt/keycloak/bin/kc.sh export --realm dive-v3-broker --file /tmp/realm.json
```

Then add to docker-compose.yml:
```yaml
keycloak:
  volumes:
    - ./keycloak/realms:/opt/keycloak/data/import:ro
  command: start-dev --import-realm
```

#### 3.3 Automated Backup Script Enhancement

```bash
#!/bin/bash
# scripts/backup.sh - Comprehensive backup

BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# PostgreSQL
docker exec dive-v3-postgres pg_dump -U postgres keycloak_db > "$BACKUP_DIR/keycloak.sql"

# MongoDB
docker exec dive-v3-mongo mongodump --archive > "$BACKUP_DIR/mongo.archive"

# Keycloak Realm Export
docker exec dive-v3-keycloak /opt/keycloak/bin/kc.sh export \
  --dir /tmp/export --realm dive-v3-broker
docker cp dive-v3-keycloak:/tmp/export "$BACKUP_DIR/keycloak-realms/"

echo "✅ Backup saved to $BACKUP_DIR"
```

---

### Phase 4: Configuration Synchronization (Day 6-7)

#### 4.1 Single Source of Truth Script

```bash
#!/bin/bash
# scripts/sync-env.sh - Sync .env.secrets to all formats

# Read shell format
source .env.secrets

# Generate Docker Compose format (.env)
cat > .env << EOF
# AUTO-GENERATED by scripts/sync-env.sh
# Source: .env.secrets
# DO NOT EDIT - Edit .env.secrets instead

DIVE_MASTER_PASSWORD=${DIVE_MASTER_PASSWORD}
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
MONGO_INITDB_ROOT_PASSWORD=${MONGO_INITDB_ROOT_PASSWORD}
EOF

# Generate Terraform tfvars
cat > terraform/terraform.auto.tfvars << EOF
# AUTO-GENERATED by scripts/sync-env.sh
keycloak_admin_password = "${KEYCLOAK_ADMIN_PASSWORD}"
keycloak_admin_username = "${KEYCLOAK_ADMIN_USERNAME}"
EOF

echo "✅ Synced .env.secrets to .env and terraform.auto.tfvars"
```

#### 4.2 Pre-Start Validation

Add to `scripts/start.sh`:
```bash
# Verify password consistency
ACTUAL_KC_PASS=$(docker compose config | grep KEYCLOAK_ADMIN_PASSWORD | awk -F= '{print $2}' | tr -d ' ')
ACTUAL_PG_PASS=$(docker compose config | grep POSTGRES_PASSWORD | head -1 | awk -F= '{print $2}' | tr -d ' ')

if [[ "$ACTUAL_KC_PASS" != "$ACTUAL_PG_PASS" ]]; then
  echo "⚠️ Password mismatch! Run ./scripts/sync-env.sh"
fi
```

---

## Implementation Checklist

### Phase 1: Immediate (Today)
- [ ] Create `scripts/sync-env.sh` to generate `.env` from `.env.secrets`
- [ ] Update `docker-compose.yml` to use `:?` instead of `:-default`
- [ ] Remove hardcoded `KEYCLOAK_ADMIN_PASSWORD: admin` from backend section
- [ ] Run `sync-env.sh` to generate current `.env`

### Phase 2: Data Protection (Tomorrow)
- [ ] Create `scripts/start.sh` with validation
- [ ] Create `scripts/stop.sh` (no -v flag)
- [ ] Create `scripts/reset.sh` with confirmation and backup
- [ ] Add to README: "Always use ./scripts/start.sh instead of docker compose up"

### Phase 3: Recovery (Day 3-4)
- [ ] Create realm export from current working Keycloak
- [ ] Configure Keycloak `--import-realm` on startup
- [ ] Enhance `scripts/backup.sh` with full PostgreSQL dump
- [ ] Create `scripts/restore.sh` for disaster recovery

### Phase 4: Documentation (Day 5)
- [ ] Update README with new workflow
- [ ] Update HANDOFF-PROMPT.md
- [ ] Add troubleshooting section for common issues
- [ ] Document backup/restore procedures

---

## Immediate Action Required

**To fix the current broken state:**

```bash
# 1. Generate consistent .env file
cd /path/to/DIVE-V3

# 2. Create .env from .env.secrets
cat > .env << 'EOF'
# Docker Compose Environment
DIVE_MASTER_PASSWORD=DivePilot2025!
KEYCLOAK_ADMIN_PASSWORD=DivePilot2025!
POSTGRES_PASSWORD=DivePilot2025!
MONGO_INITDB_ROOT_PASSWORD=DivePilot2025!
KEYCLOAK_ADMIN_USERNAME=admin
EOF

# 3. Reset PostgreSQL volume (required since password is baked in)
docker compose down
docker volume rm dive-v3_postgres_data

# 4. Restart with new .env
docker compose up -d

# 5. Wait for services, then apply Terraform
sleep 60
cd terraform && terraform apply
```

---

## Conclusion

The root cause of both issues is the **lack of automatic environment synchronization**. Docker Compose reads `.env` automatically, but our `.env.secrets` uses shell script format which Docker ignores.

The fix is simple: Generate a Docker-compatible `.env` file from `.env.secrets`, and enforce its use through wrapper scripts.

---

*Document Version: 1.0*
*Created: 2025-11-25*
*Author: Gap Analysis Session*

