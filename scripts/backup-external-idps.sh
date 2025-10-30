#!/bin/bash

# DIVE V3 - External IdP Backup Script
# Backs up configuration, certificates, and databases for Spain SAML and USA OIDC IdPs

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PREFIX="external-idp-backup-$TIMESTAMP"

# Retention policy (days)
RETENTION_DAYS=${RETENTION_DAYS:-30}

# S3 backup (optional)
S3_BUCKET=${S3_BUCKET:-""}
S3_PREFIX=${S3_PREFIX:-"dive-v3/external-idps"}

echo "================================================"
echo "DIVE V3 - External IdP Backup"
echo "================================================"
echo "Timestamp: $TIMESTAMP"
echo "Backup Directory: $BACKUP_DIR"
echo "Retention: $RETENTION_DAYS days"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR/$BACKUP_PREFIX"
cd "$PROJECT_ROOT/external-idps"

# ============================================================================
# Backup Spain SAML IdP
# ============================================================================
echo "📦 Backing up Spain SAML IdP..."

SPAIN_BACKUP="$BACKUP_DIR/$BACKUP_PREFIX/spain-saml"
mkdir -p "$SPAIN_BACKUP"

# Backup configuration
echo "  → Configuration files"
cp -r spain-saml/config "$SPAIN_BACKUP/"
cp -r spain-saml/metadata "$SPAIN_BACKUP/"
cp spain-saml/authsources.php "$SPAIN_BACKUP/"

# Backup certificates (CRITICAL)
echo "  → Certificates and keys"
cp -r spain-saml/cert "$SPAIN_BACKUP/"

# Backup SimpleSAMLphp data
echo "  → SimpleSAMLphp data"
docker exec dive-spain-saml-idp tar czf /tmp/simplesaml-data.tar.gz \
  /var/simplesamlphp/data /var/simplesamlphp/log || true

docker cp dive-spain-saml-idp:/tmp/simplesaml-data.tar.gz "$SPAIN_BACKUP/" || true

# ============================================================================
# Backup USA OIDC IdP
# ============================================================================
echo "📦 Backing up USA OIDC IdP..."

USA_BACKUP="$BACKUP_DIR/$BACKUP_PREFIX/usa-oidc"
mkdir -p "$USA_BACKUP"

# Backup realm configuration
echo "  → Realm configuration"
cp usa-oidc/realm-export.json "$USA_BACKUP/"
cp -r usa-oidc/themes "$USA_BACKUP/" 2>/dev/null || true

# Backup certificates
echo "  → Certificates"
cp -r usa-oidc/certs "$USA_BACKUP/" 2>/dev/null || true

# Backup PostgreSQL database
echo "  → PostgreSQL database dump"
docker exec dive-usa-postgres pg_dump -U keycloak keycloak \
  | gzip > "$USA_BACKUP/keycloak-db-$TIMESTAMP.sql.gz"

# Export current realm state from running Keycloak
echo "  → Live realm export"
docker exec dive-usa-oidc-idp /opt/keycloak/bin/kc.sh export \
  --dir /tmp/export --realm us-dod || true

docker cp dive-usa-oidc-idp:/tmp/export "$USA_BACKUP/live-export" || true

# ============================================================================
# Backup Environment Configuration
# ============================================================================
echo "📦 Backing up environment configuration..."

ENV_BACKUP="$BACKUP_DIR/$BACKUP_PREFIX/config"
mkdir -p "$ENV_BACKUP"

# Backup .env (remove sensitive data in backup)
if [ -f .env ]; then
  sed 's/PASSWORD=.*/PASSWORD=***REDACTED***/g' .env > "$ENV_BACKUP/env.txt"
fi

# Backup docker-compose configuration
cp docker-compose.yml "$ENV_BACKUP/"

# Backup scripts
cp -r scripts "$ENV_BACKUP/"

# Backup manager configuration
cp -r manager "$ENV_BACKUP/"

# ============================================================================
# Create Compressed Archive
# ============================================================================
echo "🗜️  Creating compressed archive..."

cd "$BACKUP_DIR"
tar czf "$BACKUP_PREFIX.tar.gz" "$BACKUP_PREFIX"

# Calculate checksum
sha256sum "$BACKUP_PREFIX.tar.gz" > "$BACKUP_PREFIX.tar.gz.sha256"

# Get backup size
BACKUP_SIZE=$(du -h "$BACKUP_PREFIX.tar.gz" | cut -f1)

echo "  → Archive: $BACKUP_PREFIX.tar.gz ($BACKUP_SIZE)"

# ============================================================================
# Upload to S3 (if configured)
# ============================================================================
if [ -n "$S3_BUCKET" ]; then
  echo "☁️  Uploading to S3..."
  aws s3 cp "$BACKUP_PREFIX.tar.gz" "s3://$S3_BUCKET/$S3_PREFIX/$BACKUP_PREFIX.tar.gz"
  aws s3 cp "$BACKUP_PREFIX.tar.gz.sha256" "s3://$S3_BUCKET/$S3_PREFIX/$BACKUP_PREFIX.tar.gz.sha256"
  echo "  → Uploaded to s3://$S3_BUCKET/$S3_PREFIX/"
fi

# ============================================================================
# Cleanup Old Backups
# ============================================================================
echo "🧹 Cleaning up old backups..."

# Remove uncompressed backup directory
rm -rf "$BACKUP_PREFIX"

# Remove backups older than retention period
find "$BACKUP_DIR" -name "external-idp-backup-*.tar.gz" -type f -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "external-idp-backup-*.tar.gz.sha256" -type f -mtime +$RETENTION_DAYS -delete

# Cleanup S3 old backups
if [ -n "$S3_BUCKET" ]; then
  aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX/" | \
    awk '{print $4}' | \
    while read file; do
      file_date=$(echo "$file" | grep -oP '\d{8}' || echo "")
      if [ -n "$file_date" ]; then
        file_age=$(( ($(date +%s) - $(date -d "$file_date" +%s)) / 86400 ))
        if [ $file_age -gt $RETENTION_DAYS ]; then
          echo "  → Deleting old S3 backup: $file"
          aws s3 rm "s3://$S3_BUCKET/$S3_PREFIX/$file"
        fi
      fi
    done
fi

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "================================================"
echo "✅ Backup Complete"
echo "================================================"
echo "Backup Location: $BACKUP_DIR/$BACKUP_PREFIX.tar.gz"
echo "Backup Size: $BACKUP_SIZE"
echo "Checksum: $(cat $BACKUP_DIR/$BACKUP_PREFIX.tar.gz.sha256 | cut -d' ' -f1)"
echo ""
echo "Backup Contents:"
echo "  • Spain SAML configuration and certificates"
echo "  • USA OIDC configuration and database"
echo "  • Environment configuration"
echo "  • Docker Compose files"
echo ""
echo "To restore:"
echo "  ./scripts/restore-external-idps.sh $BACKUP_PREFIX.tar.gz"
echo ""
echo "To verify backup:"
echo "  sha256sum -c $BACKUP_PREFIX.tar.gz.sha256"
echo ""


