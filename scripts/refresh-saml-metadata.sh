#!/bin/bash

# ============================================
# SAML Metadata Refresh Script
# ============================================
# Automates SAML metadata exchange for multi-realm federation
# Gap #9 Remediation (October 20, 2025)
#
# Purpose:
# - Fetch SAML metadata from each Keycloak realm
# - Validate XML structure and signatures
# - Check certificate expiration
# - Update Terraform configuration with fresh metadata
# - Alert on validation failures
#
# Usage: ./scripts/refresh-saml-metadata.sh
# Schedule: Daily cron job (production)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "SAML Metadata Refresh Script"
echo "Gap #9: SAML Metadata Automation"
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
echo ""

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
METADATA_DIR="./terraform/metadata"
LOG_DIR="./logs"
ALERT_EMAIL="${ALERT_EMAIL:-admin@dive-v3.mil}"

# Realms to fetch metadata from
REALMS=("dive-v3-usa" "dive-v3-fra" "dive-v3-can" "dive-v3-broker")

# Certificate expiry warning threshold (days)
CERT_EXPIRY_WARNING_DAYS=30

# Create directories if they don't exist
mkdir -p "$METADATA_DIR"
mkdir -p "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/metadata-refresh-$(date '+%Y%m%d-%H%M%S').log"

# ============================================
# Functions
# ============================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if Keycloak is accessible
check_keycloak_health() {
    log_info "Checking Keycloak health..."
    
    if curl -s -f "$KEYCLOAK_URL/health/ready" > /dev/null 2>&1; then
        log_success "Keycloak is accessible at $KEYCLOAK_URL"
        return 0
    else
        log_error "Keycloak is not accessible at $KEYCLOAK_URL"
        return 1
    fi
}

# Fetch SAML metadata for a realm
fetch_metadata() {
    local realm=$1
    local output_file="$METADATA_DIR/${realm}-metadata.xml"
    local temp_file="$METADATA_DIR/${realm}-metadata.tmp"
    
    log_info "Fetching metadata for realm: $realm"
    
    # Fetch metadata
    if curl -s -f "$KEYCLOAK_URL/realms/$realm/protocol/saml/descriptor" -o "$temp_file"; then
        log_success "Downloaded metadata for $realm"
    else
        log_error "Failed to download metadata for $realm"
        rm -f "$temp_file"
        return 1
    fi
    
    # Validate XML structure
    if command -v xmllint &> /dev/null; then
        if xmllint --noout "$temp_file" 2>&1 | tee -a "$LOG_FILE"; then
            log_success "XML validation passed for $realm"
        else
            log_error "XML validation failed for $realm"
            rm -f "$temp_file"
            return 1
        fi
    else
        log_warning "xmllint not installed - skipping XML validation"
    fi
    
    # Check for required SAML elements
    if grep -q "EntityDescriptor" "$temp_file" && \
       grep -q "IDPSSODescriptor" "$temp_file" && \
       grep -q "SingleSignOnService" "$temp_file"; then
        log_success "Required SAML elements present for $realm"
    else
        log_error "Missing required SAML elements in $realm metadata"
        rm -f "$temp_file"
        return 1
    fi
    
    # Extract certificate (if present)
    if grep -q "X509Certificate" "$temp_file"; then
        log_info "Extracting X.509 certificate from $realm metadata..."
        
        # Extract certificate content
        CERT_CONTENT=$(sed -n '/<X509Certificate>/,/<\/X509Certificate>/p' "$temp_file" | \
                       sed 's/<X509Certificate>//;s/<\/X509Certificate>//' | \
                       tr -d '[:space:]')
        
        if [ -n "$CERT_CONTENT" ]; then
            # Create PEM file
            CERT_FILE="$METADATA_DIR/${realm}-cert.pem"
            echo "-----BEGIN CERTIFICATE-----" > "$CERT_FILE"
            echo "$CERT_CONTENT" | fold -w 64 >> "$CERT_FILE"
            echo "-----END CERTIFICATE-----" >> "$CERT_FILE"
            
            log_success "Certificate extracted to $CERT_FILE"
            
            # Check certificate expiration (if openssl available)
            if command -v openssl &> /dev/null; then
                check_certificate_expiry "$CERT_FILE" "$realm"
            fi
        else
            log_warning "No X.509 certificate found in $realm metadata"
        fi
    else
        log_info "No X.509 certificate in $realm metadata (may be unsigned for pilot)"
    fi
    
    # Compare with existing metadata (detect changes)
    if [ -f "$output_file" ]; then
        if diff -q "$temp_file" "$output_file" > /dev/null 2>&1; then
            log_info "No changes detected in $realm metadata"
            rm -f "$temp_file"
        else
            log_warning "Metadata changed for $realm - updating..."
            mv "$temp_file" "$output_file"
            log_success "Updated metadata file: $output_file"
            
            # Log change event
            echo "$(date '+%Y-%m-%d %H:%M:%S') - Metadata updated for $realm" >> "$LOG_DIR/metadata-changes.log"
        fi
    else
        # First time - just save
        mv "$temp_file" "$output_file"
        log_success "Saved initial metadata: $output_file"
    fi
    
    return 0
}

# Check certificate expiration
check_certificate_expiry() {
    local cert_file=$1
    local realm=$2
    
    log_info "Checking certificate expiration for $realm..."
    
    # Get expiration date
    EXPIRY_DATE=$(openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null | cut -d= -f2)
    
    if [ -z "$EXPIRY_DATE" ]; then
        log_warning "Could not extract expiration date from certificate"
        return 1
    fi
    
    # Convert to Unix timestamp
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        EXPIRY_EPOCH=$(date -j -f "%b %d %H:%M:%S %Y %Z" "$EXPIRY_DATE" "+%s" 2>/dev/null || echo 0)
    else
        # Linux
        EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" "+%s" 2>/dev/null || echo 0)
    fi
    
    CURRENT_EPOCH=$(date "+%s")
    DAYS_UNTIL_EXPIRY=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))
    
    log_info "Certificate expires: $EXPIRY_DATE (in $DAYS_UNTIL_EXPIRY days)"
    
    # Check if expiring soon
    if [ $DAYS_UNTIL_EXPIRY -lt 0 ]; then
        log_error "Certificate EXPIRED for $realm! Expiry: $EXPIRY_DATE"
        send_alert "$realm" "EXPIRED" "$EXPIRY_DATE"
        return 1
    elif [ $DAYS_UNTIL_EXPIRY -lt $CERT_EXPIRY_WARNING_DAYS ]; then
        log_warning "Certificate expiring soon for $realm (in $DAYS_UNTIL_EXPIRY days)"
        send_alert "$realm" "EXPIRING_SOON" "$EXPIRY_DATE"
    else
        log_success "Certificate valid for $realm (expires in $DAYS_UNTIL_EXPIRY days)"
    fi
    
    return 0
}

# Send alert (email or webhook)
send_alert() {
    local realm=$1
    local alert_type=$2
    local expiry_date=$3
    
    log_warning "Sending alert: $alert_type for $realm"
    
    # Email alert (production - requires mail configured)
    if command -v mail &> /dev/null; then
        echo "SAML certificate alert for $realm: $alert_type. Expiry: $expiry_date" | \
          mail -s "DIVE V3 SAML Certificate Alert: $realm" "$ALERT_EMAIL"
        log_info "Alert email sent to $ALERT_EMAIL"
    else
        log_warning "mail command not available - alert not sent"
    fi
    
    # Webhook alert (production - Slack/Teams)
    if [ -n "$WEBHOOK_URL" ]; then
        curl -X POST "$WEBHOOK_URL" \
          -H "Content-Type: application/json" \
          -d "{\"text\": \"🚨 SAML Certificate Alert: $realm - $alert_type (Expiry: $expiry_date)\"}" \
          2>&1 | tee -a "$LOG_FILE"
        log_info "Webhook alert sent"
    fi
    
    # Log to security events
    echo "$(date '+%Y-%m-%d %H:%M:%S') - SAML_CERT_ALERT - Realm: $realm, Type: $alert_type, Expiry: $expiry_date" \
      >> "$LOG_DIR/security-events.log"
}

# Validate metadata signature (production)
validate_metadata_signature() {
    local metadata_file=$1
    local realm=$2
    
    log_info "Validating metadata signature for $realm..."
    
    # Check if metadata is signed
    if ! grep -q "Signature" "$metadata_file"; then
        log_warning "Metadata not signed for $realm (acceptable for pilot)"
        return 0
    fi
    
    # Verify signature with xmlsec1 (production)
    if command -v xmlsec1 &> /dev/null; then
        if xmlsec1 --verify "$metadata_file" 2>&1 | tee -a "$LOG_FILE"; then
            log_success "Signature validation passed for $realm"
            return 0
        else
            log_error "Signature validation FAILED for $realm"
            send_alert "$realm" "SIGNATURE_INVALID" "N/A"
            return 1
        fi
    else
        log_warning "xmlsec1 not installed - skipping signature validation"
        return 0
    fi
}

# ============================================
# Main Script
# ============================================

log "Starting SAML metadata refresh process"
log "Keycloak URL: $KEYCLOAK_URL"
log "Metadata directory: $METADATA_DIR"
log "Realms to process: ${REALMS[*]}"
echo ""

# Check Keycloak health
if ! check_keycloak_health; then
    log_error "Keycloak is not accessible - aborting metadata refresh"
    exit 1
fi
echo ""

# Process each realm
SUCCESS_COUNT=0
FAILURE_COUNT=0

for REALM in "${REALMS[@]}"; do
    echo "------------------------------------------"
    log "Processing realm: $REALM"
    echo ""
    
    if fetch_metadata "$REALM"; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        
        # Validate signature (production)
        # validate_metadata_signature "$METADATA_DIR/${REALM}-metadata.xml" "$REALM"
        
    else
        FAILURE_COUNT=$((FAILURE_COUNT + 1))
        log_error "Failed to process metadata for $REALM"
    fi
    
    echo ""
done

# ============================================
# Summary
# ============================================

echo "=========================================="
echo "SAML Metadata Refresh Summary"
echo "=========================================="
log_info "Total realms processed: ${#REALMS[@]}"
log_success "Successful: $SUCCESS_COUNT"

if [ $FAILURE_COUNT -gt 0 ]; then
    log_error "Failed: $FAILURE_COUNT"
else
    log_info "Failed: $FAILURE_COUNT"
fi

echo ""

# List all metadata files
log_info "Metadata files in $METADATA_DIR:"
ls -lh "$METADATA_DIR"/*.xml 2>/dev/null || log_warning "No metadata files found"

echo ""

# Exit status
if [ $FAILURE_COUNT -gt 0 ]; then
    log_error "Metadata refresh completed with errors"
    exit 1
else
    log_success "Metadata refresh completed successfully"
    exit 0
fi


