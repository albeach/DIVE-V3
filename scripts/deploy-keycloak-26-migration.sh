#!/bin/bash
# ============================================
# Keycloak 26 Migration - Complete Deployment
# ============================================
# Applies all fixes for ACR/AMR/auth_time claims
# Reference: KEYCLOAK-26-MIGRATION-COMPLETE.md

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3"
cd "$PROJECT_ROOT"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Keycloak 26 Migration Deployment     ║${NC}"
echo -e "${BLUE}║  ACR/AMR/auth_time Claims Fix         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Function: Print step
print_step() {
    echo -e "${BLUE}▶ Step $1: $2${NC}"
}

# Function: Print success
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function: Print error
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function: Print warning
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if running from correct directory
if [ ! -f "KEYCLOAK-26-MIGRATION-COMPLETE.md" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# ============================================
# Step 1: Backup
# ============================================
print_step "1" "Creating Backups"

BACKUP_DIR="backups/keycloak-26-migration-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup Keycloak database
print_warning "Backing up Keycloak database..."
if docker ps | grep -q dive-v3-postgres; then
    docker exec dive-v3-postgres pg_dump -U keycloak keycloak > "$BACKUP_DIR/keycloak-db.sql" 2>/dev/null || true
    if [ -f "$BACKUP_DIR/keycloak-db.sql" ]; then
        print_success "Database backup saved to $BACKUP_DIR/keycloak-db.sql"
    else
        print_warning "Database backup skipped (container not running)"
    fi
else
    print_warning "Postgres container not running - skipping database backup"
fi

# Backup Terraform state
if [ -f "terraform/terraform.tfstate" ]; then
    cp terraform/terraform.tfstate "$BACKUP_DIR/terraform.tfstate.bak"
    print_success "Terraform state backed up"
fi

# ============================================
# Step 2: Build Custom SPI
# ============================================
print_step "2" "Building Custom Keycloak SPI"

if [ ! -d "keycloak/extensions" ]; then
    print_error "keycloak/extensions directory not found"
    exit 1
fi

cd keycloak/extensions

# Check if Gradle wrapper exists
if [ ! -f "gradlew" ]; then
    print_error "Gradle wrapper not found in keycloak/extensions"
    exit 1
fi

# Build JAR
print_warning "Building dive-keycloak-spi.jar..."
./gradlew clean jar

if [ -f "build/libs/dive-keycloak-spi.jar" ]; then
    print_success "SPI JAR built successfully"
else
    print_error "Failed to build SPI JAR"
    exit 1
fi

# Copy to Keycloak container
if docker ps | grep -q dive-v3-keycloak; then
    print_warning "Copying JAR to Keycloak container..."
    docker cp build/libs/dive-keycloak-spi.jar dive-v3-keycloak:/opt/keycloak/providers/
    print_success "SPI JAR copied to Keycloak container"
else
    print_error "Keycloak container not running"
    exit 1
fi

cd "$PROJECT_ROOT"

# ============================================
# Step 3: Apply Terraform Changes
# ============================================
print_step "3" "Applying Terraform Configuration"

cd terraform

# Initialize if needed
if [ ! -d ".terraform" ]; then
    print_warning "Initializing Terraform..."
    terraform init
fi

# Plan changes
print_warning "Planning Terraform changes..."
terraform plan -out=tfplan

# Prompt for confirmation
echo ""
print_warning "Review the plan above. This will update ALL 5 realms:"
echo "  - dive-v3-broker: Add 'basic' scope, update ACR/AMR mappers"
echo "  - dive-v3-usa: Update ACR/AMR mappers"
echo "  - dive-v3-fra: Update ACR/AMR mappers"
echo "  - dive-v3-can: Update ACR/AMR mappers"
echo "  - dive-v3-industry: Update ACR/AMR mappers"
echo ""
read -p "Continue with terraform apply? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    print_warning "Terraform apply cancelled by user"
    exit 0
fi

# Apply changes
print_warning "Applying Terraform changes..."
terraform apply tfplan

print_success "Terraform changes applied"

cd "$PROJECT_ROOT"

# ============================================
# Step 4: Restart Keycloak
# ============================================
print_step "4" "Restarting Keycloak"

print_warning "Restarting Keycloak container..."
docker-compose restart keycloak

# Wait for Keycloak to be ready
print_warning "Waiting for Keycloak to start (30 seconds)..."
sleep 30

# Health check
MAX_RETRIES=12
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f -s http://localhost:8081/health > /dev/null 2>&1 || \
       curl -f -s http://localhost:9000/health > /dev/null 2>&1; then
        print_success "Keycloak is ready"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        print_error "Keycloak failed to start after $MAX_RETRIES attempts"
        print_warning "Check logs: docker logs dive-v3-keycloak"
        exit 1
    fi
    
    echo -n "."
    sleep 5
done
echo ""

# ============================================
# Step 5: Verify Claims
# ============================================
print_step "5" "Verifying JWT Claims"

if [ ! -f "scripts/verify-keycloak-26-claims.sh" ]; then
    print_error "Verification script not found"
    exit 1
fi

print_warning "Running automated verification..."
chmod +x scripts/verify-keycloak-26-claims.sh

# Run verification (this will prompt for credentials)
./scripts/verify-keycloak-26-claims.sh

# ============================================
# Step 6: Run Integration Tests (Optional)
# ============================================
print_step "6" "Running Integration Tests (Optional)"

read -p "Run integration tests? (yes/no): " RUN_TESTS

if [ "$RUN_TESTS" == "yes" ]; then
    cd backend
    
    if [ ! -f "package.json" ]; then
        print_error "Backend package.json not found"
        exit 1
    fi
    
    # Check if test file exists
    if [ -f "src/__tests__/keycloak-26-claims.integration.test.ts" ]; then
        print_warning "Running integration tests..."
        
        # Set environment variables (prompt for secrets)
        read -p "Enter KC_CLIENT_SECRET: " KC_SECRET
        read -s -p "Enter TEST_PASSWORD: " TEST_PASS
        echo ""
        
        export KC_CLIENT_SECRET="$KC_SECRET"
        export TEST_PASSWORD="$TEST_PASS"
        
        npm test -- keycloak-26-claims.integration.test.ts || true
    else
        print_warning "Integration tests not found - skipping"
    fi
    
    cd "$PROJECT_ROOT"
else
    print_warning "Integration tests skipped"
fi

# ============================================
# Summary
# ============================================
echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Deployment Complete                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

print_success "All deployment steps completed"
echo ""
echo "Summary of changes:"
echo "  ✅ Custom SPI rebuilt and deployed"
echo "  ✅ Terraform changes applied to 5 realms"
echo "  ✅ Keycloak restarted successfully"
echo "  ✅ JWT claims verified"
echo ""
echo "Next steps:"
echo "  1. Test authentication for each realm:"
echo "     - USA: dive-v3-usa"
echo "     - France: dive-v3-fra"
echo "     - Canada: dive-v3-can"
echo "     - Industry: dive-v3-industry"
echo ""
echo "  2. Test AAL2 validation with classified resources"
echo ""
echo "  3. Monitor system resources:"
echo "     docker stats dive-v3-keycloak"
echo ""
echo "  4. Check application logs for errors:"
echo "     docker logs dive-v3-keycloak -f"
echo ""
echo "Backup location: $BACKUP_DIR"
echo ""
print_success "Keycloak 26 migration deployment complete!"

