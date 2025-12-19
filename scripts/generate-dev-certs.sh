#!/bin/bash
#
# DIVE V3 - Dynamic Development Certificate Generator
# 
# This script automatically generates SSL certificates for all services
# defined in docker-compose files, plus any additional hostnames.
#
# Usage:
#   ./scripts/generate-dev-certs.sh [additional-hostnames...]
#
# Example:
#   ./scripts/generate-dev-certs.sh fra-app.dive25.com fra-api.dive25.com
#

set -e

# Allow skipping certificate generation entirely
if [[ "${SKIP_CERT_REGEN:-false}" == "true" ]]; then
    echo -e "${YELLOW}mkcert generation skipped (SKIP_CERT_REGEN=true).${NC}"
    exit 0
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CERT_DIR="$PROJECT_ROOT/keycloak/certs"

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  DIVE V3 - Dynamic Certificate Generator${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Check mkcert is installed (auto-install if possible)
if ! command -v mkcert &> /dev/null; then
    echo -e "${YELLOW}mkcert not detected. Attempting to install...${NC}"
    if command -v brew &> /dev/null; then
        brew install mkcert nss >/dev/null 2>&1 || {
            echo -e "${RED}✗ Failed to install mkcert via brew. Please install manually (brew install mkcert nss)${NC}"
            exit 1
        }
    else
        echo -e "${RED}✗ mkcert is not installed and Homebrew is not available.${NC}"
        echo "  Install manually: https://github.com/FiloSottile/mkcert"
        exit 1
    fi
    echo -e "${GREEN}✓ mkcert installed${NC}"
fi

# Ensure mkcert CA is installed in system trust store
echo -e "${YELLOW}[1/4] Ensuring mkcert CA is installed...${NC}"
mkcert -install 2>/dev/null || true
echo -e "${GREEN}✓ mkcert CA installed${NC}"

# Create cert directory
mkdir -p "$CERT_DIR"

# Fast path: if certs exist and skipping is allowed, exit early
if [[ "${SKIP_CERT_REGEN_IF_PRESENT:-false}" == "true" ]] && [[ -f "$CERT_DIR/certificate.pem" && -f "$CERT_DIR/key.pem" ]]; then
    echo -e "${YELLOW}Existing certificates found and SKIP_CERT_REGEN_IF_PRESENT=true; skipping regeneration.${NC}"
    exit 0
fi

# Collect hostnames based on scope
echo -e "${YELLOW}[2/4] Collecting hostnames...${NC}"

HOSTNAMES=()
SCOPE="${CERT_HOST_SCOPE:-full}"

if [[ "$SCOPE" == "local_minimal" ]]; then
    # Minimal host set for local/dev
    HOSTNAMES=(
        "localhost"
        "127.0.0.1"
        "::1"
        "host.docker.internal"
        "backend"
        "frontend"
        "keycloak"
        "kas"
        "opa"
        "opal-server"
        "redis"
        "postgres"
        "mongo"
        "dive-v3-backend"
        "dive-v3-frontend"
        "dive-v3-keycloak"
        "dive-v3-kas"
        "dive-v3-opa"
        "dive-v3-redis"
        "dive-v3-postgres"
        "dive-v3-mongo"
    )
else
    # Always include these base hostnames (cover host + Docker-internal)
    BASE_HOSTNAMES=(
        "localhost"
        "127.0.0.1"
        "::1"
        "host.docker.internal"
        "backend"
        "frontend"
        "keycloak"
        "opa"
        "opal-server"
        "redis"
        "postgres"
        "mongo"
        "kas"
    )

    HOSTNAMES+=("${BASE_HOSTNAMES[@]}")

    # Extract service names from all docker-compose files
    for compose_file in "$PROJECT_ROOT"/docker-compose*.yml; do
        if [[ -f "$compose_file" ]]; then
            echo "  Scanning: $(basename "$compose_file")"
            
            # Extract service names (they become Docker hostnames)
            services=$(grep -E "^  [a-z].*:$" "$compose_file" 2>/dev/null | sed 's/://g' | sed 's/^  //' | grep -v "^#" || true)
            
            for service in $services; do
                # Clean up service name
                service=$(echo "$service" | tr -d ' ')
                if [[ -n "$service" && ! "$service" =~ ^# ]]; then
                    HOSTNAMES+=("$service")
                fi
            done
            
            # Extract container_name values (alternate hostnames)
            container_names=$(grep "container_name:" "$compose_file" 2>/dev/null | sed 's/.*container_name: *//' | tr -d '"' || true)
            for name in $container_names; do
                name=$(echo "$name" | tr -d ' ')
                if [[ -n "$name" ]]; then
                    HOSTNAMES+=("$name")
                fi
            done
        fi
    done

    # Add common Cloudflare tunnel hostnames (ISO 3166-1 alpha-3 naming)
    CLOUDFLARE_HOSTNAMES=(
        # USA instance (primary)
        "usa-app.dive25.com"
        "usa-api.dive25.com"
        "usa-idp.dive25.com"
        "usa-kas.dive25.com"
        # FRA instance
        "fra-app.dive25.com"
        "fra-api.dive25.com"
        "fra-idp.dive25.com"
        "fra-kas.dive25.com"
        # DEU instance (future)
        "deu-app.dive25.com"
        "deu-api.dive25.com"
        "deu-idp.dive25.com"
        "deu-kas.dive25.com"
        # Generic wildcard for any future instances
        "*.dive25.com"
    )

    HOSTNAMES+=("${CLOUDFLARE_HOSTNAMES[@]}")
fi

# Add command-line arguments as additional hostnames
for arg in "$@"; do
    HOSTNAMES+=("$arg")
done

# Combine all hostnames
ALL_HOSTNAMES=("${HOSTNAMES[@]}")

# Remove duplicates and empty entries
UNIQUE_HOSTNAMES=($(printf '%s\n' "${ALL_HOSTNAMES[@]}" | sort -u | grep -v '^$'))

echo -e "${GREEN}✓ Found ${#UNIQUE_HOSTNAMES[@]} unique hostnames${NC}"
echo ""

# Show what we're generating for
echo -e "${YELLOW}[3/4] Generating certificate for:${NC}"
printf '  %s\n' "${UNIQUE_HOSTNAMES[@]}" | head -20
if [[ ${#UNIQUE_HOSTNAMES[@]} -gt 20 ]]; then
    echo "  ... and $((${#UNIQUE_HOSTNAMES[@]} - 20)) more"
fi
echo ""

# Backup existing certs
if [[ -f "$CERT_DIR/certificate.pem" ]]; then
    echo "  Backing up existing certificates..."
    mv "$CERT_DIR/certificate.pem" "$CERT_DIR/certificate.pem.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
    mv "$CERT_DIR/key.pem" "$CERT_DIR/key.pem.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
fi

# Generate the certificate
echo -e "${YELLOW}[4/4] Generating certificate with mkcert...${NC}"
cd "$CERT_DIR"

# Build the mkcert command with all hostnames
mkcert -cert-file certificate.pem -key-file key.pem "${UNIQUE_HOSTNAMES[@]}"

# Copy certificates to all service directories
echo -e "${YELLOW}[5/4] Distributing certificates to services...${NC}"

# Define target directories relative to project root
TARGET_DIRS=(
    "backend/certs"
    "frontend/certs"
    "kas/certs"
)

for dir in "${TARGET_DIRS[@]}"; do
    target_path="$PROJECT_ROOT/$dir"
    if [[ -d "$target_path" ]]; then
        echo "  Copying to $dir..."
        cp "$CERT_DIR/certificate.pem" "$target_path/certificate.pem"
        cp "$CERT_DIR/key.pem" "$target_path/key.pem"
    else
        echo "  Creating directory $dir..."
        mkdir -p "$target_path"
        cp "$CERT_DIR/certificate.pem" "$target_path/certificate.pem"
        cp "$CERT_DIR/key.pem" "$target_path/key.pem"
    fi
done

# Verify the certificate
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Certificates generated successfully!${NC}"
echo ""
echo "  Certificate: $CERT_DIR/certificate.pem"
echo "  Private Key: $CERT_DIR/key.pem"
echo ""

# Show certificate details using mkcert CA info
echo -e "${CYAN}Certificate Details:${NC}"
CAROOT=$(mkcert -CAROOT)
echo "  Generated by: $(whoami)@$(hostname)"
echo "  CA Root: $CAROOT"
echo "  Valid for: ${#UNIQUE_HOSTNAMES[@]} hostnames"
echo ""

# Verify mkcert CA is trusted
echo -e "${CYAN}Verification:${NC}"
if [[ -f "$CAROOT/rootCA.pem" ]]; then
    echo -e "  ${GREEN}✓ mkcert CA found at $CAROOT${NC}"
    echo -e "  ${GREEN}✓ Certificate will be trusted by this machine${NC}"
else
    echo -e "  ${RED}✗ mkcert CA not found - run 'mkcert -install'${NC}"
fi
echo ""

# Instructions
echo -e "${CYAN}Next Steps:${NC}"
echo "  1. Restart services to pick up new certificates:"
echo "     docker-compose restart"
echo "     docker-compose -p fra -f docker-compose.fra.yml restart"
echo ""
echo "  2. For browser access, ensure mkcert CA is trusted:"
echo "     mkcert -install"
echo ""
echo "  3. For curl/API testing, use the CA file:"
echo "     curl --cacert \"$CAROOT/rootCA.pem\" https://localhost:8443/..."
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
