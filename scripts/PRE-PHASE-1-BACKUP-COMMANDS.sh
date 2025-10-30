#!/bin/bash
# ============================================
# Pre-Phase 1 Backup Commands
# ============================================
# Run these commands before starting Phase 1 implementation
# to ensure you can rollback if needed

DATE=$(date +%Y%m%d)
BACKUP_DIR="backups/${DATE}"

echo "Creating backup directory: ${BACKUP_DIR}"
mkdir -p ${BACKUP_DIR}

# ============================================
# Backup 1: Terraform State (CRITICAL)
# ============================================
echo "Backing up Terraform state..."
if [ -f terraform/terraform.tfstate ]; then
    cp terraform/terraform.tfstate ${BACKUP_DIR}/terraform.tfstate.backup-${DATE}
    echo "✅ Terraform state backed up"
else
    echo "⚠️  Terraform state not found"
fi

# ============================================
# Backup 2: Keycloak Database (RECOMMENDED)
# ============================================
echo "Backing up Keycloak database..."
docker exec dive-v3-postgres pg_dump -U postgres keycloak_db > ${BACKUP_DIR}/keycloak-backup-${DATE}.sql
if [ $? -eq 0 ]; then
    echo "✅ Keycloak database backed up"
else
    echo "❌ Keycloak backup failed"
fi

# ============================================
# Backup 3: MongoDB (RECOMMENDED)
# ============================================
echo "Backing up MongoDB..."
docker exec dive-v3-mongo mongodump --out=/tmp/mongo-backup-${DATE}
docker cp dive-v3-mongo:/tmp/mongo-backup-${DATE} ${BACKUP_DIR}/
if [ $? -eq 0 ]; then
    echo "✅ MongoDB backed up"
else
    echo "❌ MongoDB backup failed"
fi

# ============================================
# Backup 4: Docker Images (OPTIONAL)
# ============================================
echo "Tagging Docker images for rollback..."
docker tag dive-v3-backend:latest dive-v3-backend:pre-phase-1-${DATE}
docker tag dive-v3-frontend:latest dive-v3-frontend:pre-phase-1-${DATE}
docker tag dive-v3-keycloak:latest dive-v3-keycloak:pre-phase-1-${DATE}
echo "✅ Docker images tagged"

# ============================================
# Summary
# ============================================
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              BACKUP COMPLETE                               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Backup location: ${BACKUP_DIR}/"
echo ""
echo "Files created:"
ls -lh ${BACKUP_DIR}/
echo ""
echo "✅ Ready to proceed with Phase 1!"

