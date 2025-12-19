#!/bin/bash

# DIVE V3 - Start External Identity Providers
# This script starts Spain SAML and USA OIDC IdPs on external Docker network

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."

echo "================================================"
echo "DIVE V3 - External IdP Startup"
echo "================================================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "Please start Docker Desktop and try again"
    exit 1
fi

# Change to external-idps directory
cd "$ROOT_DIR"

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "✅ .env file created"
    echo "⚠️  Please review and update passwords in .env before production use"
    echo ""
fi

# Generate SAML certificates if they don't exist
if [ ! -f spain-saml/cert/server.crt ]; then
    echo "🔐 Generating SAML certificates..."
    bash scripts/generate-spain-saml-certs.sh
    echo ""
fi

# Create external Docker network if it doesn't exist
if ! docker network inspect dive-external-idps > /dev/null 2>&1; then
    echo "🌐 Creating dive-external-idps Docker network..."
    docker network create dive-external-idps --driver bridge
    echo "✅ Network created"
else
    echo "✅ dive-external-idps network already exists"
fi

# Check if main DIVE network exists
if ! docker network inspect dive-v3_dive-network > /dev/null 2>&1; then
    echo "⚠️  Warning: Main DIVE network (dive-v3_dive-network) not found"
    echo "Make sure to start main DIVE V3 stack first:"
    echo "  cd .. && docker-compose up -d"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "🚀 Starting external IdP services..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."

# Wait for Spain SAML
echo -n "  Spain SAML IdP... "
timeout=60
count=0
while [ $count -lt $timeout ]; do
    if docker exec dive-spain-saml-idp curl -k -f https://localhost:8443/simplesaml/ > /dev/null 2>&1; then
        echo "✅ Ready"
        break
    fi
    sleep 2
    count=$((count + 2))
    if [ $count -eq $timeout ]; then
        echo "⚠️  Timeout (check logs: docker-compose logs spain-saml)"
    fi
done

# Wait for USA OIDC
echo -n "  USA OIDC IdP... "
count=0
while [ $count -lt $timeout ]; do
    if curl -f http://localhost:8082/health/ready > /dev/null 2>&1; then
        echo "✅ Ready"
        break
    fi
    sleep 2
    count=$((count + 2))
    if [ $count -eq $timeout ]; then
        echo "⚠️  Timeout (check logs: docker-compose logs usa-oidc)"
    fi
done

echo ""
echo "================================================"
echo "✅ External IdPs Started Successfully"
echo "================================================"
echo ""
echo "Services:"
echo "  🇪🇸 Spain SAML IdP:  https://localhost:8443/simplesaml/"
echo "  🇺🇸 USA OIDC IdP:    http://localhost:8082"
echo "  📊 IdP Manager UI:   http://localhost:8090"
echo ""
echo "Admin Access:"
echo "  Spain SAML Admin: https://localhost:8443/simplesaml/module.php/core/authenticate.php"
echo "  USA OIDC Admin:   http://localhost:8082/admin (admin/admin)"
echo ""
echo "Test Users:"
echo "  🇪🇸 Spain: garcia.maria@mde.es / Classified123!"
echo "  🇺🇸 USA:   smith.john@mail.mil / TopSecret123!"
echo ""
echo "Next Steps:"
echo "  1. Verify metadata endpoints:"
echo "     curl -k https://localhost:8443/simplesaml/saml2/idp/metadata.php"
echo "     curl http://localhost:8082/realms/us-dod/.well-known/openid-configuration"
echo ""
echo "  2. Login to DIVE V3 as Super Admin: http://localhost:3000"
echo ""
echo "  3. Onboard IdPs via Admin → Identity Providers → Add New IdP"
echo ""
echo "  4. View logs: docker-compose logs -f [spain-saml|usa-oidc]"
echo ""
