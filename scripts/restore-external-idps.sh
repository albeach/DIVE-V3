#!/bin/bash

# DIVE V3 - External IdP Restore Script
# Restores external IdP configuration, certificates, and databases from backup

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"

if [ -z "$1" ]; then
  echo "Usage: $0 <backup-file.tar.gz>"
  echo ""
  echo "Available backups:"
  ls -lh "$BACKUP_DIR"/external-idp-backup-*.tar.gz 2>/dev/null || echo "  No backups found"
  exit 1
fi

BACKUP_FILE="$1"

# Resolve full path
if [ ! -f "$BACKUP_FILE" ]; then
  BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILE"
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "================================================"
echo "DIVE V3 - External IdP Restore"
echo "================================================"
echo "Backup File: $BACKUP_FILE"
echo ""

# Verify checksum
if [ -f "$BACKUP_FILE.sha256" ]; then
  echo "🔍 Verifying backup integrity..."
  sha256sum -c "$BACKUP_FILE.sha256" || {
    echo "❌ Checksum verification failed!"
    exit 1
  }
  echo "✅ Backup verified"
else
  echo "⚠️  Warning: No checksum file found, skipping verification"
fi

# Confirm restore
echo ""
echo "⚠️  WARNING: This will overwrite current external IdP configuration!"
echo ""
read -p "Continue with restore? (yes/NO): " -r
if [ "$REPLY" != "yes" ]; then
  echo "Restore cancelled"
  exit 0
fi

# Stop running services
echo ""
echo "🛑 Stopping external IdP services..."
cd "$PROJECT_ROOT/external-idps"
docker-compose down

# Extract backup
echo "📦 Extracting backup..."
TEMP_DIR=$(mktemp -d)
tar xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# Find backup directory
BACKUP_DIR_NAME=$(ls "$TEMP_DIR" | grep "external-idp-backup-" | head -1)
EXTRACTED_BACKUP="$TEMP_DIR/$BACKUP_DIR_NAME"

if [ ! -d "$EXTRACTED_BACKUP" ]; then
  echo "❌ Error: Could not find extracted backup directory"
  rm -rf "$TEMP_DIR"
  exit 1
fi

# ============================================================================
# Restore Spain SAML IdP
# ============================================================================
echo "📥 Restoring Spain SAML IdP..."

if [ -d "$EXTRACTED_BACKUP/spain-saml" ]; then
  # Restore configuration
  echo "  → Configuration files"
  cp -r "$EXTRACTED_BACKUP/spain-saml/config" spain-saml/
  cp -r "$EXTRACTED_BACKUP/spain-saml/metadata" spain-saml/
  cp "$EXTRACTED_BACKUP/spain-saml/authsources.php" spain-saml/

  # Restore certificates
  echo "  → Certificates and keys"
  cp -r "$EXTRACTED_BACKUP/spain-saml/cert" spain-saml/

  # Set proper permissions
  chmod 644 spain-saml/cert/server.crt
  chmod 600 spain-saml/cert/server.pem

  # Restore SimpleSAMLphp data (if available)
  if [ -f "$EXTRACTED_BACKUP/spain-saml/simplesaml-data.tar.gz" ]; then
    echo "  → SimpleSAMLphp data (will restore after container starts)"
  fi
fi

# ============================================================================
# Restore USA OIDC IdP
# ============================================================================
echo "📥 Restoring USA OIDC IdP..."

if [ -d "$EXTRACTED_BACKUP/usa-oidc" ]; then
  # Restore realm configuration
  echo "  → Realm configuration"
  cp "$EXTRACTED_BACKUP/usa-oidc/realm-export.json" usa-oidc/

  # Restore themes
  if [ -d "$EXTRACTED_BACKUP/usa-oidc/themes" ]; then
    cp -r "$EXTRACTED_BACKUP/usa-oidc/themes" usa-oidc/
  fi

  # Restore certificates
  if [ -d "$EXTRACTED_BACKUP/usa-oidc/certs" ]; then
    echo "  → Certificates"
    mkdir -p usa-oidc/certs
    cp -r "$EXTRACTED_BACKUP/usa-oidc/certs"/* usa-oidc/certs/
    chmod 644 usa-oidc/certs/tls.crt 2>/dev/null || true
    chmod 600 usa-oidc/certs/tls.key 2>/dev/null || true
  fi

  # Database will be restored after container starts
  if ls "$EXTRACTED_BACKUP/usa-oidc"/keycloak-db-*.sql.gz >/dev/null 2>&1; then
    echo "  → Database backup found (will restore after container starts)"
    DB_BACKUP=$(ls "$EXTRACTED_BACKUP/usa-oidc"/keycloak-db-*.sql.gz | head -1)
  fi
fi

# ============================================================================
# Restore Environment Configuration
# ============================================================================
echo "📥 Restoring environment configuration..."

if [ -d "$EXTRACTED_BACKUP/config" ]; then
  # Note: .env is redacted in backup, user must manually update
  echo "  → Docker Compose configuration"
  cp "$EXTRACTED_BACKUP/config/docker-compose.yml" .

  echo "  → Scripts"
  cp -r "$EXTRACTED_BACKUP/config/scripts"/* scripts/ 2>/dev/null || true

  echo "  → Manager configuration"
  cp -r "$EXTRACTED_BACKUP/config/manager"/* manager/ 2>/dev/null || true
fi

# ============================================================================
# Start Services
# ============================================================================
echo ""
echo "🚀 Starting external IdP services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# ============================================================================
# Restore Database
# ============================================================================
if [ -n "$DB_BACKUP" ]; then
  echo "📥 Restoring PostgreSQL database..."
  
  # Wait for PostgreSQL to be ready
  until docker exec dive-usa-postgres pg_isready -U keycloak >/dev/null 2>&1; do
    echo "  Waiting for PostgreSQL..."
    sleep 2
  done

  # Drop and recreate database
  docker exec dive-usa-postgres psql -U keycloak -d postgres -c "DROP DATABASE IF EXISTS keycloak;"
  docker exec dive-usa-postgres psql -U keycloak -d postgres -c "CREATE DATABASE keycloak;"

  # Restore database
  gunzip -c "$DB_BACKUP" | docker exec -i dive-usa-postgres psql -U keycloak -d keycloak

  echo "  ✅ Database restored"

  # Restart Keycloak to reload
  docker-compose restart usa-oidc
  sleep 20
fi

# ============================================================================
# Restore SimpleSAMLphp Data
# ============================================================================
if [ -f "$EXTRACTED_BACKUP/spain-saml/simplesaml-data.tar.gz" ]; then
  echo "📥 Restoring SimpleSAMLphp data..."
  docker cp "$EXTRACTED_BACKUP/spain-saml/simplesaml-data.tar.gz" dive-spain-saml-idp:/tmp/
  docker exec dive-spain-saml-idp tar xzf /tmp/simplesaml-data.tar.gz -C /
  docker-compose restart spain-saml
fi

# Cleanup
rm -rf "$TEMP_DIR"

# ============================================================================
# Verification
# ============================================================================
echo ""
echo "🔍 Verifying restoration..."

# Check Spain SAML
echo -n "  Spain SAML IdP: "
if curl -k -f https://localhost:8443/simplesaml/ >/dev/null 2>&1; then
  echo "✅ Online"
else
  echo "⚠️  Not responding (may need time to start)"
fi

# Check USA OIDC
echo -n "  USA OIDC IdP: "
if curl -f http://localhost:8082/health/ready >/dev/null 2>&1; then
  echo "✅ Online"
else
  echo "⚠️  Not responding (may need time to start)"
fi

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "================================================"
echo "✅ Restore Complete"
echo "================================================"
echo ""
echo "Restored:"
echo "  • Spain SAML configuration and certificates"
echo "  • USA OIDC configuration and database"
echo "  • Environment configuration"
echo ""
echo "⚠️  IMPORTANT: Review and update .env file with current passwords!"
echo ""
echo "Verify services:"
echo "  Spain SAML: https://localhost:8443/simplesaml/"
echo "  USA OIDC:   http://localhost:8082"
echo "  Dashboard:  http://localhost:8090"
echo ""
echo "View logs:"
echo "  docker-compose logs -f spain-saml"
echo "  docker-compose logs -f usa-oidc"
echo ""


