#!/bin/bash
# ============================================
# DIVE V3 - Comprehensive Backup Script
# ============================================
# Creates timestamped backups of:
# - PostgreSQL (Keycloak data, NextAuth sessions)
# - MongoDB (Resources, audit logs)
# - Redis (Session cache - optional)
# - Terraform state files
# - Keycloak realm exports
#
# Usage: ./scripts/backup-all-data.sh [backup_dir]
# Default: ./backups/YYYY-MM-DD_HH-MM-SS/
#
# ============================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_DIR="${1:-$PROJECT_ROOT/backups/$TIMESTAMP}"

# Load secrets if available
if [[ -f "$PROJECT_ROOT/.env.secrets" ]]; then
    source "$PROJECT_ROOT/.env.secrets"
fi

# Default passwords (use env vars if set)
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-password}"
MONGO_PASSWORD="${MONGO_INITDB_ROOT_PASSWORD:-password}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}💾 DIVE V3 Comprehensive Backup${NC}"
echo -e "${CYAN}============================================${NC}"
echo -e "Backup Directory: ${YELLOW}$BACKUP_DIR${NC}"
echo -e "Timestamp: ${YELLOW}$TIMESTAMP${NC}"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"/{postgres,mongodb,keycloak,terraform,redis}

# ============================================
# 1. PostgreSQL Backup (Keycloak + NextAuth)
# ============================================
echo -e "${YELLOW}1️⃣  Backing up PostgreSQL...${NC}"

# Check if PostgreSQL is running
if docker ps | grep -q "dive-v3-postgres"; then
    # Backup all databases
    docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" dive-v3-postgres \
        pg_dumpall -U postgres > "$BACKUP_DIR/postgres/all_databases.sql" 2>/dev/null
    
    # Backup Keycloak database specifically
    docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" dive-v3-postgres \
        pg_dump -U postgres keycloak_db > "$BACKUP_DIR/postgres/keycloak_db.sql" 2>/dev/null || true
    
    # Backup NextAuth database
    docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" dive-v3-postgres \
        pg_dump -U postgres dive_v3_app > "$BACKUP_DIR/postgres/dive_v3_app.sql" 2>/dev/null || true
    
    echo -e "${GREEN}   ✅ PostgreSQL backed up${NC}"
    ls -lh "$BACKUP_DIR/postgres/"
else
    echo -e "${RED}   ⚠️  PostgreSQL container not running - skipped${NC}"
fi
echo ""

# ============================================
# 2. MongoDB Backup (Resources + Audit Logs)
# ============================================
echo -e "${YELLOW}2️⃣  Backing up MongoDB...${NC}"

if docker ps | grep -q "dive-v3-mongo"; then
    # Create BSON dump of all databases
    docker exec dive-v3-mongo mongodump \
        --username admin \
        --password "$MONGO_PASSWORD" \
        --authenticationDatabase admin \
        --out /tmp/mongodump 2>/dev/null
    
    # Copy dump from container
    docker cp dive-v3-mongo:/tmp/mongodump "$BACKUP_DIR/mongodb/"
    
    # Also export as JSON for readability
    docker exec dive-v3-mongo mongoexport \
        --username admin \
        --password "$MONGO_PASSWORD" \
        --authenticationDatabase admin \
        --db dive-v3 \
        --collection resources \
        --out /tmp/resources.json 2>/dev/null || true
    
    docker cp dive-v3-mongo:/tmp/resources.json "$BACKUP_DIR/mongodb/" 2>/dev/null || true
    
    # Clean up container temp files
    docker exec dive-v3-mongo rm -rf /tmp/mongodump /tmp/resources.json 2>/dev/null || true
    
    echo -e "${GREEN}   ✅ MongoDB backed up${NC}"
    ls -lh "$BACKUP_DIR/mongodb/"
else
    echo -e "${RED}   ⚠️  MongoDB container not running - skipped${NC}"
fi
echo ""

# ============================================
# 3. Keycloak Realm Export
# ============================================
echo -e "${YELLOW}3️⃣  Exporting Keycloak realms...${NC}"

if docker ps | grep -q "dive-v3-keycloak"; then
    # Get admin token
    TOKEN=$(curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=$KEYCLOAK_ADMIN_PASSWORD" \
        -d "grant_type=password" 2>/dev/null | jq -r '.access_token' 2>/dev/null) || TOKEN=""
    
    if [[ -n "$TOKEN" && "$TOKEN" != "null" ]]; then
        # Export each realm
        for realm in dive-v3-broker dive-v3-usa dive-v3-fra dive-v3-deu dive-v3-gbr dive-v3-can; do
            echo -e "   Exporting realm: $realm"
            curl -sk -H "Authorization: Bearer $TOKEN" \
                "https://localhost:8443/admin/realms/$realm" \
                > "$BACKUP_DIR/keycloak/${realm}.json" 2>/dev/null || true
            
            # Export realm users
            curl -sk -H "Authorization: Bearer $TOKEN" \
                "https://localhost:8443/admin/realms/$realm/users?max=1000" \
                > "$BACKUP_DIR/keycloak/${realm}-users.json" 2>/dev/null || true
        done
        echo -e "${GREEN}   ✅ Keycloak realms exported${NC}"
    else
        echo -e "${RED}   ⚠️  Could not authenticate to Keycloak - skipped${NC}"
    fi
else
    echo -e "${RED}   ⚠️  Keycloak container not running - skipped${NC}"
fi
echo ""

# ============================================
# 4. Terraform State Backup
# ============================================
echo -e "${YELLOW}4️⃣  Backing up Terraform state...${NC}"

if [[ -d "$PROJECT_ROOT/terraform" ]]; then
    # Copy terraform state files
    find "$PROJECT_ROOT/terraform" -name "*.tfstate*" -exec cp {} "$BACKUP_DIR/terraform/" \; 2>/dev/null || true
    find "$PROJECT_ROOT/terraform" -name "*.tfvars" -exec cp {} "$BACKUP_DIR/terraform/" \; 2>/dev/null || true
    
    echo -e "${GREEN}   ✅ Terraform state backed up${NC}"
    ls -lh "$BACKUP_DIR/terraform/" 2>/dev/null || echo "   (no state files found)"
fi
echo ""

# ============================================
# 5. Redis Snapshot (Optional)
# ============================================
echo -e "${YELLOW}5️⃣  Backing up Redis...${NC}"

if docker ps | grep -q "dive-v3-redis"; then
    # Trigger Redis snapshot
    docker exec dive-v3-redis redis-cli BGSAVE 2>/dev/null || true
    sleep 2
    
    # Copy dump file
    docker cp dive-v3-redis:/data/dump.rdb "$BACKUP_DIR/redis/" 2>/dev/null || true
    
    echo -e "${GREEN}   ✅ Redis backed up${NC}"
else
    echo -e "${YELLOW}   ⚠️  Redis container not running - skipped${NC}"
fi
echo ""

# ============================================
# 6. Create Backup Manifest
# ============================================
echo -e "${YELLOW}6️⃣  Creating backup manifest...${NC}"

cat > "$BACKUP_DIR/manifest.json" << EOF
{
  "timestamp": "$TIMESTAMP",
  "backup_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "version": "DIVE V3",
  "components": {
    "postgres": $(ls "$BACKUP_DIR/postgres/"*.sql 2>/dev/null | wc -l | tr -d ' '),
    "mongodb": $(ls "$BACKUP_DIR/mongodb/" 2>/dev/null | wc -l | tr -d ' '),
    "keycloak": $(ls "$BACKUP_DIR/keycloak/"*.json 2>/dev/null | wc -l | tr -d ' '),
    "terraform": $(ls "$BACKUP_DIR/terraform/" 2>/dev/null | wc -l | tr -d ' '),
    "redis": $(ls "$BACKUP_DIR/redis/" 2>/dev/null | wc -l | tr -d ' ')
  },
  "total_size": "$(du -sh "$BACKUP_DIR" | cut -f1)"
}
EOF

echo -e "${GREEN}   ✅ Manifest created${NC}"
echo ""

# ============================================
# Summary
# ============================================
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}✅ Backup Complete!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "Backup Location: ${GREEN}$BACKUP_DIR${NC}"
echo -e "Total Size: ${GREEN}$(du -sh "$BACKUP_DIR" | cut -f1)${NC}"
echo ""
echo -e "Contents:"
cat "$BACKUP_DIR/manifest.json" | jq .
echo ""
echo -e "${YELLOW}To restore, use: ./scripts/restore-all-data.sh $BACKUP_DIR${NC}"


