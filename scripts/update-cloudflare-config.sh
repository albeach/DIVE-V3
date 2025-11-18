#!/bin/bash
# Update DIVE V3 configuration for Cloudflare domains

set -e

echo "======================================"
echo "DIVE V3 - Cloudflare Domain Config"
echo "======================================"
echo ""

# New domains
FRONTEND_DOMAIN="https://dev-app.dive25.com"
API_DOMAIN="https://dev-api.dive25.com"
AUTH_DOMAIN="https://dev-auth.dive25.com"

echo "Updating configuration to use:"
echo "  Frontend:  $FRONTEND_DOMAIN"
echo "  API:       $API_DOMAIN"
echo "  Keycloak:  $AUTH_DOMAIN"
echo ""

# ============================================
# Step 1: Update Frontend Environment
# ============================================
echo "======================================"
echo "Step 1: Update Frontend Config"
echo "======================================"
echo ""

FRONTEND_ENV="/home/mike/Desktop/DIVE-V3/DIVE-V3/frontend/.env.local"

if [ ! -f "$FRONTEND_ENV" ]; then
    echo "Creating frontend/.env.local..."
    cat > "$FRONTEND_ENV" <<EOF
# Cloudflare Tunnel Configuration
# Generated: $(date)

# Backend API URL
NEXT_PUBLIC_BACKEND_URL=$API_DOMAIN

# NextAuth Configuration
NEXTAUTH_URL=$FRONTEND_DOMAIN
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# Keycloak Configuration
KEYCLOAK_ISSUER=$AUTH_DOMAIN/realms/dive-v3-broker
KEYCLOAK_CLIENT_ID=dive-v3-client-broker
KEYCLOAK_CLIENT_SECRET=your-client-secret-here

# Enable debug logging
NEXTAUTH_DEBUG=true
NODE_TLS_REJECT_UNAUTHORIZED=0
EOF
    echo "✅ Created $FRONTEND_ENV"
else
    echo "Updating existing $FRONTEND_ENV..."
    
    # Backup
    cp "$FRONTEND_ENV" "$FRONTEND_ENV.backup.$(date +%s)"
    
    # Update or add each variable
    if grep -q "NEXT_PUBLIC_BACKEND_URL" "$FRONTEND_ENV"; then
        sed -i "s|NEXT_PUBLIC_BACKEND_URL=.*|NEXT_PUBLIC_BACKEND_URL=$API_DOMAIN|" "$FRONTEND_ENV"
    else
        echo "NEXT_PUBLIC_BACKEND_URL=$API_DOMAIN" >> "$FRONTEND_ENV"
    fi
    
    if grep -q "NEXTAUTH_URL" "$FRONTEND_ENV"; then
        sed -i "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=$FRONTEND_DOMAIN|" "$FRONTEND_ENV"
    else
        echo "NEXTAUTH_URL=$FRONTEND_DOMAIN" >> "$FRONTEND_ENV"
    fi
    
    if grep -q "KEYCLOAK_ISSUER" "$FRONTEND_ENV"; then
        sed -i "s|KEYCLOAK_ISSUER=.*|KEYCLOAK_ISSUER=$AUTH_DOMAIN/realms/dive-v3-broker|" "$FRONTEND_ENV"
    else
        echo "KEYCLOAK_ISSUER=$AUTH_DOMAIN/realms/dive-v3-broker" >> "$FRONTEND_ENV"
    fi
    
    echo "✅ Updated $FRONTEND_ENV"
fi

echo ""

# ============================================
# Step 2: Update Backend Environment
# ============================================
echo "======================================"
echo "Step 2: Update Backend Config"
echo "======================================"
echo ""

BACKEND_ENV="/home/mike/Desktop/DIVE-V3/DIVE-V3/backend/.env"

if [ ! -f "$BACKEND_ENV" ]; then
    echo "Creating backend/.env..."
    cat > "$BACKEND_ENV" <<EOF
# Cloudflare Tunnel Configuration
# Generated: $(date)

# Keycloak Configuration
KEYCLOAK_URL=$AUTH_DOMAIN
KEYCLOAK_REALM=dive-v3-broker
KEYCLOAK_CLIENT_ID=dive-v3-broker-client
KEYCLOAK_CLIENT_SECRET=your-backend-secret-here

# OPA Configuration
OPA_URL=http://opa:8181

# MongoDB Configuration
MONGODB_URL=mongodb://admin:password@mongo:27017
MONGODB_DATABASE=dive-v3

# CORS Configuration
CORS_ALLOWED_ORIGINS=$FRONTEND_DOMAIN,$API_DOMAIN,http://localhost:3000,https://localhost:3000
NEXT_PUBLIC_BASE_URL=$FRONTEND_DOMAIN

# Logging
LOG_LEVEL=info
NODE_TLS_REJECT_UNAUTHORIZED=0
EOF
    echo "✅ Created $BACKEND_ENV"
else
    echo "Updating existing $BACKEND_ENV..."
    
    # Backup
    cp "$BACKEND_ENV" "$BACKEND_ENV.backup.$(date +%s)"
    
    # Update CORS to include new domain
    if grep -q "CORS_ALLOWED_ORIGINS" "$BACKEND_ENV"; then
        sed -i "s|CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=$FRONTEND_DOMAIN,$API_DOMAIN,http://localhost:3000,https://localhost:3000,http://localhost:4000,https://localhost:4000|" "$BACKEND_ENV"
    else
        echo "CORS_ALLOWED_ORIGINS=$FRONTEND_DOMAIN,$API_DOMAIN,http://localhost:3000,https://localhost:3000" >> "$BACKEND_ENV"
    fi
    
    if grep -q "KEYCLOAK_URL" "$BACKEND_ENV"; then
        sed -i "s|KEYCLOAK_URL=.*|KEYCLOAK_URL=$AUTH_DOMAIN|" "$BACKEND_ENV"
    else
        echo "KEYCLOAK_URL=$AUTH_DOMAIN" >> "$BACKEND_ENV"
    fi
    
    if grep -q "NEXT_PUBLIC_BASE_URL" "$BACKEND_ENV"; then
        sed -i "s|NEXT_PUBLIC_BASE_URL=.*|NEXT_PUBLIC_BASE_URL=$FRONTEND_DOMAIN|" "$BACKEND_ENV"
    else
        echo "NEXT_PUBLIC_BASE_URL=$FRONTEND_DOMAIN" >> "$BACKEND_ENV"
    fi
    
    echo "✅ Updated $BACKEND_ENV"
fi

echo ""

# ============================================
# Step 3: Display Terraform Instructions
# ============================================
echo "======================================"
echo "Step 3: Update Keycloak (Terraform)"
echo "======================================"
echo ""
echo "You need to update Keycloak redirect URIs in Terraform."
echo ""
echo "Edit: terraform/broker-realm.tf"
echo ""
echo "Find the 'dive-v3-client-broker' client and update:"
echo ""
echo "  valid_redirect_uris = ["
echo "    \"$FRONTEND_DOMAIN/*\","
echo "    \"$FRONTEND_DOMAIN/api/auth/callback/keycloak\","
echo "    \"http://localhost:3000/*\" # Keep for local dev"
echo "  ]"
echo ""
echo "  web_origins = ["
echo "    \"$FRONTEND_DOMAIN\","
echo "    \"http://localhost:3000\""
echo "  ]"
echo ""
echo "Then apply:"
echo "  cd terraform"
echo "  terraform apply -target=keycloak_openid_client.dive_v3_client"
echo ""

# ============================================
# Step 4: Restart Services
# ============================================
echo "======================================"
echo "Step 4: Restart Services"
echo "======================================"
echo ""

read -p "Restart backend now? (y/n): " RESTART_BACKEND

if [ "$RESTART_BACKEND" = "y" ]; then
    echo "Restarting backend..."
    cd /home/mike/Desktop/DIVE-V3/DIVE-V3
    docker compose restart backend
    echo "✅ Backend restarted"
fi

echo ""
echo "For frontend (if running locally):"
echo "  cd frontend"
echo "  # Stop the dev server (Ctrl+C)"
echo "  npm run dev"
echo ""

echo "======================================"
echo "✅ Configuration Updated!"
echo "======================================"
echo ""
echo "Summary of changes:"
echo "  1. ✅ Frontend .env.local updated"
echo "  2. ✅ Backend .env updated"
echo "  3. ⏳ Keycloak redirect URIs (manual Terraform update needed)"
echo ""
echo "Next steps:"
echo "  1. Update Keycloak via Terraform (see instructions above)"
echo "  2. Restart frontend dev server"
echo "  3. Test at: $FRONTEND_DOMAIN"
echo ""
echo "Backup files created:"
echo "  - frontend/.env.local.backup.*"
echo "  - backend/.env.backup.*"
echo ""





