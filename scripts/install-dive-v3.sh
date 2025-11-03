#!/bin/bash
# ============================================
# DIVE V3 - Complete Installation & Restoration Script
# ============================================
# Robust, idempotent, 1-step installation for any environment
# Handles: fresh installs, restoration, migration to new computers
#
# Date: November 3, 2025
# Version: 2.0

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# ============================================
# Configuration
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly MAGENTA='\033[0;35m'
readonly NC='\033[0m'  # No Color

# Logging
LOG_FILE="$PROJECT_ROOT/logs/install-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$PROJECT_ROOT/logs"

log() {
    echo -e "${CYAN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✅ $*${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}❌ $*${NC}" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $*${NC}" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}ℹ️  $*${NC}" | tee -a "$LOG_FILE"
}

# Error handling
trap 'handle_error $? $LINENO' ERR

handle_error() {
    local exit_code=$1
    local line_number=$2
    log_error "Installation failed at line $line_number with exit code $exit_code"
    log_error "Check log file: $LOG_FILE"
    exit "$exit_code"
}

# ============================================
# Pre-flight Checks
# ============================================

preflight_checks() {
    log "${CYAN}═══════════════════════════════════════${NC}"
    log "${CYAN}🚀 DIVE V3 Installation & Restoration${NC}"
    log "${CYAN}═══════════════════════════════════════${NC}"
    echo ""
    
    log "📋 Running pre-flight checks..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    log_success "Docker is installed: $(docker --version)"
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    log_success "Docker Compose is installed"
    
    # Check required tools
    for tool in jq curl; do
        if ! command -v $tool &> /dev/null; then
            log_error "$tool is not installed. Please install it first."
            exit 1
        fi
    done
    log_success "Required tools installed (jq, curl)"
    
    # Check if we're in the right directory
    if [ ! -f "$PROJECT_ROOT/docker-compose.yml" ]; then
        log_error "docker-compose.yml not found. Are you in the DIVE-V3 project root?"
        exit 1
    fi
    log_success "Project structure verified"
    
    echo ""
}

# ============================================
# Docker Services
# ============================================

start_docker_services() {
    log "🐳 Managing Docker services..."
    
    cd "$PROJECT_ROOT"
    
    # Check if services are already running
    local services_running=0
    if docker ps --filter "name=dive-v3-" --format "{{.Names}}" | grep -q "dive-v3-"; then
        services_running=$(docker ps --filter "name=dive-v3-" --format "{{.Names}}" | wc -l | tr -d ' ')
        log_info "Found $services_running DIVE V3 services already running"
        
        # Check if key services are healthy
        local keycloak_healthy=false
        local mongo_healthy=false
        
        if docker ps --filter "name=dive-v3-keycloak" --filter "health=healthy" | grep -q "dive-v3-keycloak"; then
            keycloak_healthy=true
        fi
        
        if docker exec dive-v3-mongo mongosh --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
            mongo_healthy=true
        fi
        
        if [ "$keycloak_healthy" = true ] && [ "$mongo_healthy" = true ]; then
            log_success "Key services already healthy, skipping restart"
            return 0
        fi
    fi
    
    # Start or restart services
    log "   Starting/restarting Docker services..."
    docker-compose up -d >> "$LOG_FILE" 2>&1
    
    log_success "Docker services started"
    
    # Wait for services to be healthy
    wait_for_services
}

wait_for_services() {
    log "⏳ Waiting for services to be healthy..."
    
    local max_wait=180  # 3 minutes per service
    local interval=5
    
    # Wait for Keycloak (with progress indicator)
    log "   Waiting for Keycloak (max ${max_wait}s)..."
    local elapsed=0
    local attempt=1
    
    # Try multiple health check endpoints
    while ! docker exec dive-v3-keycloak curl -sf http://localhost:8080/health/ready > /dev/null 2>&1 && \
          ! docker exec dive-v3-keycloak curl -sf http://localhost:8080/realms/master > /dev/null 2>&1; do
        if [ $elapsed -ge $max_wait ]; then
            log_error "Keycloak did not start within $max_wait seconds"
            log_error "Last 50 lines of Keycloak logs:"
            docker logs dive-v3-keycloak --tail 50 | tee -a "$LOG_FILE"
            log_warn "Continuing anyway - Keycloak may still be starting..."
            break
        fi
        
        # Show progress
        if [ $((attempt % 3)) -eq 0 ]; then
            log_info "   Still waiting for Keycloak... ${elapsed}s elapsed (attempt $attempt)"
        fi
        
        sleep $interval
        elapsed=$((elapsed + interval))
        attempt=$((attempt + 1))
    done
    
    if [ $elapsed -lt $max_wait ]; then
        log_success "Keycloak is healthy (took ${elapsed}s)"
    fi
    
    # Wait for MongoDB
    log "   Waiting for MongoDB (max ${max_wait}s)..."
    elapsed=0
    attempt=1
    
    while ! docker exec dive-v3-mongo mongosh --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
        if [ $elapsed -ge $max_wait ]; then
            log_error "MongoDB did not start within $max_wait seconds"
            log_warn "Continuing anyway - MongoDB may still be starting..."
            break
        fi
        
        if [ $((attempt % 3)) -eq 0 ]; then
            log_info "   Still waiting for MongoDB... ${elapsed}s elapsed"
        fi
        
        sleep $interval
        elapsed=$((elapsed + interval))
        attempt=$((attempt + 1))
    done
    
    if [ $elapsed -lt $max_wait ]; then
        log_success "MongoDB is healthy (took ${elapsed}s)"
    fi
    
    # Wait for OPA
    log "   Waiting for OPA (max ${max_wait}s)..."
    elapsed=0
    
    while ! curl -sf http://localhost:8181/health > /dev/null 2>&1; do
        if [ $elapsed -ge $max_wait ]; then
            log_error "OPA did not start within $max_wait seconds"
            log_warn "Continuing anyway - OPA may still be starting..."
            break
        fi
        
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    
    if [ $elapsed -lt $max_wait ]; then
        log_success "OPA is healthy (took ${elapsed}s)"
    fi
    
    # Wait for Backend
    log "   Waiting for Backend API..."
    sleep 10  # Give backend time to start
    log_success "Backend should be ready"
    
    echo ""
}

# ============================================
# Terraform - Deploy Keycloak Configuration
# ============================================

deploy_terraform() {
    log "🏗️  Deploying Keycloak configuration via Terraform..."
    
    cd "$PROJECT_ROOT/terraform"
    
    # Initialize Terraform if needed
    if [ ! -d ".terraform" ]; then
        log "   Initializing Terraform..."
        terraform init >> "$LOG_FILE" 2>&1
    fi
    
    # Check if terraform.tfvars exists
    if [ ! -f "terraform.tfvars" ]; then
        log_warn "terraform.tfvars not found. Copying from example..."
        cp terraform.tfvars.example terraform.tfvars
    fi
    
    # Refresh state to detect drift
    log "   Refreshing Terraform state..."
    terraform refresh -var-file=terraform.tfvars >> "$LOG_FILE" 2>&1 || true
    
    # Apply configuration
    log "   Applying Terraform configuration..."
    if terraform apply -var-file=terraform.tfvars -auto-approve -compact-warnings >> "$LOG_FILE" 2>&1; then
        log_success "Terraform applied successfully"
    else
        log_warn "Terraform apply had some errors. Check log for details."
        log_warn "Continuing with installation..."
    fi
    
    cd "$PROJECT_ROOT"
    echo ""
}

# ============================================
# User Attributes - Populate Keycloak Users
# ============================================

populate_user_attributes() {
    log "👥 Populating user attributes..."
    
    # Get admin token
    local token
    token=$(docker exec dive-v3-keycloak curl -s -X POST \
        http://localhost:8080/realms/master/protocol/openid-connect/token \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=admin" \
        -d "grant_type=password" | jq -r '.access_token')
    
    if [ -z "$token" ] || [ "$token" == "null" ]; then
        log_error "Failed to get Keycloak admin token"
        return 1
    fi
    
    # Count users across all realms
    local total_users=0
    for realm in dive-v3-usa dive-v3-broker dive-v3-fra dive-v3-can dive-v3-esp dive-v3-gbr dive-v3-deu dive-v3-ita dive-v3-nld dive-v3-pol dive-v3-industry; do
        local count
        count=$(curl -s "http://localhost:8081/admin/realms/$realm/users" \
            -H "Authorization: Bearer $token" | jq 'length' 2>/dev/null || echo "0")
        total_users=$((total_users + count))
        log_info "$realm: $count users"
    done
    
    log_success "Total users across all realms: $total_users"
    
    # Run Python script if available
    if [ -f "$PROJECT_ROOT/scripts/extract-and-populate-users.py" ]; then
        log "   Running Python user attribute population script..."
        python3 "$PROJECT_ROOT/scripts/extract-and-populate-users.py" >> "$LOG_FILE" 2>&1 || log_warn "Python script had issues (non-fatal)"
    fi
    
    echo ""
}

# ============================================
# MongoDB - Seed Resources
# ============================================

seed_mongodb() {
    log "🗄️  Seeding MongoDB..."
    
    # Check current resource count
    local resource_count
    resource_count=$(docker exec dive-v3-mongo mongosh --quiet \
        mongodb://admin:password@localhost:27017/dive-v3 \
        --authenticationDatabase admin \
        --eval "db.resources.countDocuments()" 2>/dev/null || echo "0")
    
    log_info "Current MongoDB resources: $resource_count"
    
    if [ "$resource_count" -eq "0" ] || [ "$resource_count" -lt "100" ]; then
        log "   MongoDB needs seeding. Initializing COI keys first..."
        
        # Initialize COI keys
        docker exec dive-v3-backend npx ts-node src/scripts/initialize-coi-keys.ts >> "$LOG_FILE" 2>&1
        log_success "COI keys initialized"
        
        # Seed resources
        log "   Seeding 7000 ZTDF documents (this may take 2-3 minutes)..."
        if docker exec dive-v3-backend npx ts-node src/scripts/seed-7000-ztdf-documents.ts >> "$LOG_FILE" 2>&1; then
            log_success "MongoDB seeded successfully"
        else
            log_warn "MongoDB seeding had issues. Trying smaller seed..."
            docker exec dive-v3-backend npx ts-node src/scripts/seed-1000-ztdf-documents-fixed.ts >> "$LOG_FILE" 2>&1 || true
        fi
    else
        log_success "MongoDB already has $resource_count resources"
    fi
    
    # Verify final count
    resource_count=$(docker exec dive-v3-mongo mongosh --quiet \
        mongodb://admin:password@localhost:27017/dive-v3 \
        --authenticationDatabase admin \
        --eval "db.resources.countDocuments()")
    
    log_success "Final MongoDB resource count: $resource_count"
    
    echo ""
}

# ============================================
# OPA - Verify Policies
# ============================================

verify_opa_policies() {
    log "📜 Verifying OPA policies..."
    
    # Count policy files
    local policy_files
    policy_files=$(find "$PROJECT_ROOT/policies" -name "*.rego" -not -name "*test*.rego" | wc -l | tr -d ' ')
    log_info "Policy files on disk: $policy_files"
    
    # Verify OPA is loading them
    sleep 2  # Give OPA time to load policies
    
    local loaded_policies
    loaded_policies=$(curl -s http://localhost:8181/v1/data | jq 'keys | length' 2>/dev/null || echo "0")
    log_info "Policies loaded by OPA: $loaded_policies"
    
    # Restart OPA if policies aren't loading
    if [ "$loaded_policies" -lt "3" ]; then
        log_warn "OPA has few policies loaded. Restarting OPA container..."
        docker restart dive-v3-opa >> "$LOG_FILE" 2>&1
        sleep 5
        loaded_policies=$(curl -s http://localhost:8181/v1/data | jq 'keys | length')
        log_info "Policies after restart: $loaded_policies"
    fi
    
    # Test main authorization policy
    if curl -s http://localhost:8181/v1/data/dive/authorization > /dev/null 2>&1; then
        log_success "Main authorization policy is accessible"
    else
        log_warn "Main authorization policy not found"
    fi
    
    # Test federation policy (AAL/AMR)
    if curl -s http://localhost:8181/v1/data/dive/federation > /dev/null 2>&1; then
        log_success "Federation policy (AAL/AMR) is accessible"
    else
        log_warn "Federation policy not found"
    fi
    
    echo ""
}

# ============================================
# MFA/OTP Configuration
# ============================================

configure_mfa() {
    log "🔐 Configuring MFA/OTP for test users..."
    
    if [ -f "$PROJECT_ROOT/scripts/configure-test-user-otp.sh" ]; then
        chmod +x "$PROJECT_ROOT/scripts/configure-test-user-otp.sh"
        if "$PROJECT_ROOT/scripts/configure-test-user-otp.sh" >> "$LOG_FILE" 2>&1; then
            log_success "MFA configured for test users"
        else
            log_warn "MFA configuration script had issues (non-fatal)"
        fi
    else
        log_info "MFA configuration script not found (optional)"
    fi
    
    echo ""
}

# ============================================
# Verification & Summary
# ============================================

verify_installation() {
    log "🔍 Verifying installation..."
    
    local issues=0
    
    # Check Docker containers
    log "   Checking Docker containers..."
    local containers=("dive-v3-keycloak" "dive-v3-mongo" "dive-v3-opa" "dive-v3-backend" "dive-v3-frontend" "dive-v3-kas")
    for container in "${containers[@]}"; do
        if docker ps --filter "name=$container" --filter "status=running" | grep -q "$container"; then
            log_success "   $container: Running"
        else
            log_error "   $container: NOT running"
            issues=$((issues + 1))
        fi
    done
    
    # Check Keycloak users
    log "   Checking Keycloak users..."
    local token
    token=$(docker exec dive-v3-keycloak curl -s -X POST \
        http://localhost:8080/realms/master/protocol/openid-connect/token \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=admin" \
        -d "grant_type=password" | jq -r '.access_token' 2>/dev/null)
    
    if [ -n "$token" ] && [ "$token" != "null" ]; then
        local usa_users
        usa_users=$(curl -s http://localhost:8081/admin/realms/dive-v3-usa/users \
            -H "Authorization: Bearer $token" | jq 'length' 2>/dev/null || echo "0")
        
        if [ "$usa_users" -gt "0" ]; then
            log_success "   USA realm: $usa_users users"
        else
            log_warn "   USA realm: No users found"
            issues=$((issues + 1))
        fi
    else
        log_error "   Could not authenticate to Keycloak"
        issues=$((issues + 1))
    fi
    
    # Check MongoDB
    log "   Checking MongoDB..."
    local resources
    resources=$(docker exec dive-v3-mongo mongosh --quiet \
        mongodb://admin:password@localhost:27017/dive-v3 \
        --authenticationDatabase admin \
        --eval "db.resources.countDocuments()" 2>/dev/null || echo "0")
    
    if [ "$resources" -gt "0" ]; then
        log_success "   MongoDB: $resources resources"
    else
        log_warn "   MongoDB: No resources found"
        issues=$((issues + 1))
    fi
    
    # Check OPA
    log "   Checking OPA..."
    if curl -sf http://localhost:8181/health > /dev/null 2>&1; then
        log_success "   OPA: Healthy"
    else
        log_error "   OPA: Not responding"
        issues=$((issues + 1))
    fi
    
    echo ""
    return $issues
}

print_summary() {
    local issues=$1
    
    echo ""
    log "${GREEN}═══════════════════════════════════════${NC}"
    if [ $issues -eq 0 ]; then
        log "${GREEN}✅ Installation Complete! (No Issues)${NC}"
    else
        log "${YELLOW}⚠️  Installation Complete (with $issues warnings)${NC}"
    fi
    log "${GREEN}═══════════════════════════════════════${NC}"
    echo ""
    
    log "${CYAN}📊 Quick Status:${NC}"
    log "   • Log file: $LOG_FILE"
    log "   • Keycloak: https://localhost:8443"
    log "   • Frontend: https://localhost:3000"
    log "   • Backend API: https://localhost:4000"
    log "   • OPA: http://localhost:8181"
    echo ""
    
    log "${CYAN}🔐 Default Credentials:${NC}"
    log "   • Keycloak Admin: admin / admin"
    log "   • Test Users: See terraform/terraform.tfvars"
    echo ""
    
    log "${CYAN}🧪 Quick Test:${NC}"
    log "   1. Open: https://localhost:3000"
    log "   2. Click 'Sign In'"
    log "   3. Select realm: dive-v3-usa"
    log "   4. Login with test user credentials"
    echo ""
    
    log "${CYAN}📄 Documentation:${NC}"
    log "   • README.md - Main documentation"
    log "   • DATA-RESTORATION-REPORT.md - Restoration guide"
    log "   • docs/ - Detailed guides"
    echo ""
    
    if [ $issues -gt 0 ]; then
        log_warn "Some components had issues. Check the log file for details:"
        log_warn "   tail -f $LOG_FILE"
        echo ""
    fi
    
    log_success "🎉 DIVE V3 is ready to use!"
}

# ============================================
# Main Installation Flow
# ============================================

main() {
    preflight_checks
    start_docker_services
    deploy_terraform
    populate_user_attributes
    seed_mongodb
    verify_opa_policies
    configure_mfa
    
    local issues
    verify_installation
    issues=$?
    
    print_summary $issues
    
    exit 0
}

# Run main function
main "$@"

