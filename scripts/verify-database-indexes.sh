#!/bin/bash
#
# Database Index Verification Script
# Verifies that all performance-critical indexes exist in MongoDB and PostgreSQL
#
# Usage: ./verify-database-indexes.sh
#

set -eo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }

# ============================================
# MONGODB INDEX VERIFICATION
# ============================================

verify_mongodb_indexes() {
    log_info "========================================="
    log_info "MongoDB Index Verification"
    log_info "========================================="
    
    local password=$(gcloud secrets versions access latest --secret=dive-v3-mongodb-usa --project=dive25 2>/dev/null || echo "")
    
    if [[ -z "$password" ]]; then
        log_warning "Could not fetch MongoDB password from GCP, trying environment variable"
        password="${MONGO_PASSWORD_USA:-}"
    fi
    
    if [[ -z "$password" ]]; then
        log_error "MongoDB password not available"
        return 1
    fi
    
    log_info "Checking resources collection indexes..."
    
    # Get indexes for resources collection
    local indexes=$(docker exec dive-hub-mongodb mongosh -u admin -p "$password" --authenticationDatabase admin \
        --eval "use dive-v3-hub; db.resources.getIndexes()" --quiet 2>/dev/null | grep -v "Using" || echo "")
    
    if [[ -z "$indexes" ]]; then
        log_error "Could not retrieve MongoDB indexes"
        return 1
    fi
    
    # Check for required indexes
    local required_indexes=(
        "resourceId"
        "classification"
        "releasabilityTo"
        "COI"
        "creationDate"
        "encrypted"
        "originRealm"
    )
    
    local missing_count=0
    
    for index_name in "${required_indexes[@]}"; do
        if echo "$indexes" | grep -q "\"$index_name\""; then
            log_success "Index found: $index_name"
        else
            log_warning "Index missing: $index_name"
            ((missing_count++))
        fi
    done
    
    # Check for text search index
    if echo "$indexes" | grep -q "\"_fts\""; then
        log_success "Text search index found"
    else
        log_warning "Text search index missing"
        ((missing_count++))
    fi
    
    log_info ""
    log_info "Checking trustedIssuers collection indexes..."
    
    local issuer_indexes=$(docker exec dive-hub-mongodb mongosh -u admin -p "$password" --authenticationDatabase admin \
        --eval "use dive-v3-hub; db.trustedIssuers.getIndexes()" --quiet 2>/dev/null | grep -v "Using" || echo "")
    
    if echo "$issuer_indexes" | grep -q "issuerUrl"; then
        log_success "Index found: issuerUrl"
    else
        log_warning "Index missing: issuerUrl"
        ((missing_count++))
    fi
    
    log_info ""
    log_info "Checking auditLog collection indexes..."
    
    local audit_indexes=$(docker exec dive-hub-mongodb mongosh -u admin -p "$password" --authenticationDatabase admin \
        --eval "use dive-v3-hub; db.auditLog.getIndexes()" --quiet 2>/dev/null | grep -v "Using" || echo "")
    
    if echo "$audit_indexes" | grep -q "timestamp"; then
        log_success "Index found: timestamp"
    else
        log_warning "Index missing: timestamp"
        ((missing_count++))
    fi
    
    if echo "$audit_indexes" | grep -q "expireAfterSeconds"; then
        log_success "TTL index found: audit log expiration"
    else
        log_warning "TTL index missing: audit log expiration"
        ((missing_count++))
    fi
    
    if [[ $missing_count -eq 0 ]]; then
        log_success "All MongoDB indexes verified"
        return 0
    else
        log_warning "$missing_count MongoDB indexes missing or need verification"
        return 1
    fi
}

# ============================================
# POSTGRESQL INDEX VERIFICATION
# ============================================

verify_postgresql_indexes() {
    log_info "========================================="
    log_info "PostgreSQL Index Verification"
    log_info "========================================="
    
    local password=$(gcloud secrets versions access latest --secret=dive-v3-postgres-usa --project=dive25 2>/dev/null || echo "")
    
    if [[ -z "$password" ]]; then
        log_warning "Could not fetch PostgreSQL password from GCP, trying environment variable"
        password="${POSTGRES_PASSWORD_USA:-}"
    fi
    
    if [[ -z "$password" ]]; then
        log_error "PostgreSQL password not available"
        return 1
    fi
    
    log_info "Checking NextAuth tables indexes..."
    
    # Check accounts table indexes
    local accounts_indexes=$(PGPASSWORD="$password" docker exec -e PGPASSWORD="$password" dive-hub-postgres psql -U postgres -d dive-v3-hub \
        -c "SELECT indexname FROM pg_indexes WHERE tablename = 'accounts';" -t 2>/dev/null || echo "")
    
    if [[ -z "$accounts_indexes" ]]; then
        log_error "Could not retrieve PostgreSQL indexes"
        return 1
    fi
    
    local missing_count=0
    
    # Check for required indexes on accounts table
    if echo "$accounts_indexes" | grep -q "user_id"; then
        log_success "Index found: accounts.user_id"
    else
        log_warning "Index missing: accounts.user_id"
        ((missing_count++))
    fi
    
    if echo "$accounts_indexes" | grep -q "expires_at"; then
        log_success "Index found: accounts.expires_at"
    else
        log_warning "Index missing: accounts.expires_at"
        ((missing_count++))
    fi
    
    # Check sessions table indexes
    local sessions_indexes=$(PGPASSWORD="$password" docker exec -e PGPASSWORD="$password" dive-hub-postgres psql -U postgres -d dive-v3-hub \
        -c "SELECT indexname FROM pg_indexes WHERE tablename = 'sessions';" -t 2>/dev/null || echo "")
    
    if echo "$sessions_indexes" | grep -q "user_id"; then
        log_success "Index found: sessions.user_id"
    else
        log_warning "Index missing: sessions.user_id"
        ((missing_count++))
    fi
    
    if echo "$sessions_indexes" | grep -q "expires"; then
        log_success "Index found: sessions.expires"
    else
        log_warning "Index missing: sessions.expires"
        ((missing_count++))
    fi
    
    if echo "$sessions_indexes" | grep -q "session_token"; then
        log_success "Index found: sessions.session_token (unique)"
    else
        log_warning "Index missing: sessions.session_token"
        ((missing_count++))
    fi
    
    if [[ $missing_count -eq 0 ]]; then
        log_success "All PostgreSQL indexes verified"
        return 0
    else
        log_warning "$missing_count PostgreSQL indexes missing or need verification"
        return 1
    fi
}

# ============================================
# INDEX USAGE STATISTICS
# ============================================

show_index_usage_stats() {
    log_info "========================================="
    log_info "Index Usage Statistics"
    log_info "========================================="
    
    log_info "MongoDB index statistics..."
    
    local password=$(gcloud secrets versions access latest --secret=dive-v3-mongodb-usa --project=dive25 2>/dev/null || \
                     echo "${MONGO_PASSWORD_USA:-}")
    
    if [[ -n "$password" ]]; then
        # Show index stats for resources collection
        docker exec dive-hub-mongodb mongosh -u admin -p "$password" --authenticationDatabase admin \
            --eval "use dive-v3-hub; db.resources.aggregate([{\$indexStats:{}}])" --quiet 2>/dev/null | grep -v "Using" || true
    else
        log_warning "Skipping MongoDB stats (no password)"
    fi
    
    log_info ""
    log_info "PostgreSQL index statistics..."
    
    password=$(gcloud secrets versions access latest --secret=dive-v3-postgres-usa --project=dive25 2>/dev/null || \
               echo "${POSTGRES_PASSWORD_USA:-}")
    
    if [[ -n "$password" ]]; then
        # Show index usage stats
        PGPASSWORD="$password" docker exec -e PGPASSWORD="$password" dive-hub-postgres psql -U postgres -d dive-v3-hub \
            -c "SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch FROM pg_stat_user_indexes WHERE tablename IN ('accounts', 'sessions') ORDER BY idx_scan DESC;" \
            2>/dev/null || true
    else
        log_warning "Skipping PostgreSQL stats (no password)"
    fi
}

# ============================================
# MAIN
# ============================================

main() {
    log_info "Database Index Verification Script"
    log_info "Verifying performance-critical indexes"
    echo ""
    
    local mongodb_result=0
    local postgresql_result=0
    
    # Verify MongoDB indexes
    verify_mongodb_indexes || mongodb_result=$?
    echo ""
    
    # Verify PostgreSQL indexes
    verify_postgresql_indexes || postgresql_result=$?
    echo ""
    
    # Show usage statistics
    show_index_usage_stats
    echo ""
    
    # Summary
    log_info "========================================="
    log_info "Verification Summary"
    log_info "========================================="
    
    if [[ $mongodb_result -eq 0 ]]; then
        log_success "MongoDB: All indexes verified"
    else
        log_warning "MongoDB: Some indexes missing or unverified"
    fi
    
    if [[ $postgresql_result -eq 0 ]]; then
        log_success "PostgreSQL: All indexes verified"
    else
        log_warning "PostgreSQL: Some indexes missing or unverified"
    fi
    
    if [[ $mongodb_result -eq 0 ]] && [[ $postgresql_result -eq 0 ]]; then
        log_success "All database indexes verified successfully"
        return 0
    else
        log_warning "Some indexes missing - performance may be impacted"
        log_info "Run backend/src/scripts/optimize-database.ts to create missing indexes"
        return 1
    fi
}

main "$@"
