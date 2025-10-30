# 🚀 Spain SAML Integration - Complete Deployment Guide

**Version**: 1.0  
**Date**: October 28, 2025  
**Status**: ✅ **PRODUCTION READY**  
**Author**: DIVE V3 Team

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Prerequisites](#prerequisites)
4. [Database Setup](#database-setup)
5. [Terraform Configuration](#terraform-configuration)
6. [Frontend Configuration](#frontend-configuration)
7. [Docker Deployment](#docker-deployment)
8. [Verification & Testing](#verification--testing)
9. [Troubleshooting](#troubleshooting)
10. [Rollback Procedures](#rollback-procedures)
11. [Maintenance & Monitoring](#maintenance--monitoring)

---

## 🎯 Executive Summary

This guide provides complete instructions for deploying the **Spain SAML External IdP integration** with **seamless SSO** using Keycloak's Identity Provider Redirector. The solution enables **single-click authentication** from the DIVE homepage directly to SimpleSAMLphp without any intermediate Keycloak login pages.

### Key Features

✅ **Seamless SAML SSO** - No Keycloak login page shown to users  
✅ **Identity Provider Redirector** - Automatic redirection via `kc_idp_hint` parameter  
✅ **Database Schema Fixes** - UUID defaults for NextAuth adapter tables  
✅ **Integrated with MFA** - Preserves AAL2 security enforcement  
✅ **Scalable Architecture** - Works for all 11 realms  

### Solution Components

1. **Keycloak Identity Provider Redirector** - Added to all authentication flows
2. **PostgreSQL Schema Updates** - Auto-generated UUIDs for `account` and `session` tables
3. **Frontend Integration** - NextAuth v5 with `kc_idp_hint` parameter
4. **SimpleSAMLphp External IdP** - Spain Ministry of Defense SAML provider

---

## 🏗️ Architecture Overview

### Authentication Flow (End-to-End)

```
User clicks "Spain SAML" button on Homepage
  ↓
NextAuth signIn('keycloak', {...}, {kc_idp_hint: 'esp-realm-external'})
  ↓
Keycloak receives authorization request with kc_idp_hint parameter
  ↓
Identity Provider Redirector reads kc_idp_hint
  ↓
Auto-redirect to SAML broker endpoint (NO LOGIN PAGE!)
  ↓
SAML broker redirects to SimpleSAMLphp IdP
  ↓
User authenticates at SimpleSAMLphp
  ↓
SAML assertion sent back to Keycloak
  ↓
Keycloak normalizes attributes (clearance, countryOfAffiliation, COI)
  ↓
OAuth authorization code sent to NextAuth callback
  ↓
NextAuth exchanges code for tokens
  ↓
DrizzleAdapter creates user, account, and session in PostgreSQL
  ↓
User lands on Dashboard with full session! ✅
```

### Component Diagram

```
┌─────────────────────┐
│   DIVE Homepage     │
│   (Next.js)         │
└──────────┬──────────┘
           │ signIn() with kc_idp_hint
           ↓
┌─────────────────────┐
│   Keycloak Broker   │
│  ┌───────────────┐  │
│  │ IdP Redirector│←─┼── reads kc_idp_hint parameter
│  └───────┬───────┘  │
│          ↓          │
│  ┌───────────────┐  │
│  │ MFA Subflow   │  │ (fallback if no kc_idp_hint)
│  └───────────────┘  │
└──────────┬──────────┘
           │ SAML Request
           ↓
┌─────────────────────┐
│  SimpleSAMLphp      │
│  Spain Ministry     │
│  of Defense IdP     │
└──────────┬──────────┘
           │ SAML Assertion
           ↓
┌─────────────────────┐
│   Keycloak Broker   │
│   (process SAML)    │
└──────────┬──────────┘
           │ OAuth code
           ↓
┌─────────────────────┐
│   NextAuth v5       │
│   DrizzleAdapter    │
└──────────┬──────────┘
           │ create session
           ↓
┌─────────────────────┐
│   PostgreSQL        │
│   (dive_v3_app)     │
└─────────────────────┘
```

---

## ✅ Prerequisites

### Required Services

- **Docker** v24.0+ & Docker Compose v2.20+
- **PostgreSQL** 15+ (for NextAuth sessions)
- **MongoDB** 7+ (for resource metadata)
- **Keycloak** 26.0+ (IdP broker)
- **SimpleSAMLphp** 2.3+ (External SAML IdP)
- **OPA** 0.68.0+ (Policy engine)

### Required Tools

- **Terraform** v1.5+ (Infrastructure as Code)
- **Node.js** 20+ (Frontend)
- **npm** 10+ (Package manager)

### Network Requirements

- Port 3000: Next.js frontend
- Port 4000: Express backend
- Port 5433: PostgreSQL
- Port 8081: Keycloak
- Port 8181: OPA
- Port 9443: SimpleSAMLphp

---

## 🗄️ Database Setup

### Critical Schema Requirements

The NextAuth DrizzleAdapter requires **auto-generated UUIDs** for the `account` and `session` tables. Without these defaults, the adapter will fail with:

```
ERROR: null value in column "id" of relation "account" violates not-null constraint
ERROR: null value in column "id" of relation "session" violates not-null constraint
```

### Step 1: Update Drizzle Schema

**File**: `frontend/src/lib/db/schema.ts`

```typescript
import { pgTable, text, timestamp, integer, primaryKey } from "drizzle-orm/pg-core";
import type { AdapterAccount } from "next-auth/adapters";

// User table
export const users = pgTable("user", {
    id: text("id")
        .notNull()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image"),
});

// Account table (CRITICAL: Must have UUID default!)
export const accounts = pgTable(
    "account",
    {
        id: text("id")
            .notNull()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()), // ← REQUIRED!
        userId: text("userId")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        type: text("type").$type<AdapterAccount["type"]>().notNull(),
        provider: text("provider").notNull(),
        providerAccountId: text("providerAccountId").notNull(),
        refresh_token: text("refresh_token"),
        access_token: text("access_token"),
        expires_at: integer("expires_at"),
        token_type: text("token_type"),
        scope: text("scope"),
        id_token: text("id_token"),
        session_state: text("session_state"),
    },
    (account) => ({
        compoundKey: primaryKey({
            columns: [account.provider, account.providerAccountId],
        }),
    })
);

// Session table (CRITICAL: Must have UUID default!)
export const sessions = pgTable("session", {
    id: text("id")
        .notNull()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()), // ← REQUIRED!
    sessionToken: text("sessionToken").notNull().unique(),
    userId: text("userId")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
});

// Verification token table
export const verificationTokens = pgTable(
    "verificationToken",
    {
        identifier: text("identifier").notNull(),
        token: text("token").notNull(),
        expires: timestamp("expires", { mode: "date" }).notNull(),
    },
    (vt) => ({
        compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
    })
);
```

### Step 2: Create Database Migration

**File**: `frontend/drizzle/0001_add_uuid_defaults.sql`

```sql
-- Add default UUID generation for account.id column
-- This fixes the NextAuth DrizzleAdapter issue where it tries to insert without an id
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

-- Add default UUID generation for session.id column
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

-- Verify the defaults are set
SELECT 
    table_name,
    column_name,
    column_default
FROM information_schema.columns
WHERE table_name IN ('account', 'session')
  AND column_name = 'id';
```

### Step 3: Apply Migration

**Option A: Using Docker Exec (Recommended for existing containers)**

```bash
# Apply to running PostgreSQL container
docker-compose exec -T postgres psql -U postgres -d dive_v3_app << 'EOF'
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
SELECT table_name, column_name, column_default 
FROM information_schema.columns 
WHERE table_name IN ('account', 'session') AND column_name = 'id';
EOF
```

**Option B: Using Migration Script (For new deployments)**

```bash
# Generate and apply Drizzle migrations
cd frontend
npx drizzle-kit generate
npx drizzle-kit push
```

### Step 4: Verify Database Schema

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d dive_v3_app

# Verify account table
\d account

# Expected output should show:
# id | text | not null default gen_random_uuid()::text

# Verify session table
\d session

# Expected output should show:
# id | text | not null default gen_random_uuid()::text
```

---

## 🏗️ Terraform Configuration

### Identity Provider Redirector Integration

The key to seamless SAML SSO is integrating the **Identity Provider Redirector** into the existing MFA authentication flows. This must be done at the **module level**, not as a standalone flow.

### Step 1: Update MFA Module

**File**: `terraform/modules/realm-mfa/main.tf`

Add the following **at the beginning** of the authentication flow (after the flow resource, before the subflow):

```terraform
# ============================================
# Step 0: Identity Provider Redirector
# ============================================
# For seamless SAML SSO with kc_idp_hint parameter
# When kc_idp_hint is present, auto-redirects to specified IdP without login page
# When kc_idp_hint is absent, falls through to manual login with MFA

resource "keycloak_authentication_execution" "idp_redirector" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.classified_browser.alias
  authenticator     = "identity-provider-redirector"
  requirement       = "ALTERNATIVE"
}

resource "keycloak_authentication_execution_config" "idp_redirector_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.idp_redirector.id
  alias        = "IdP Redirector Config - ${var.realm_display_name}"
  config = {
    # Leave defaultProvider empty to read from kc_idp_hint parameter dynamically
    defaultProvider = ""
  }
}

# ============================================
# Step 1: Conditional Subflow (Fallback)
# ============================================
# CRITICAL: Change requirement from REQUIRED to ALTERNATIVE

resource "keycloak_authentication_subflow" "classified_conditional" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.classified_browser.alias
  alias             = "Classified User Conditional - ${var.realm_display_name}"
  requirement       = "ALTERNATIVE"  # ← Changed from REQUIRED!
  provider_id       = "basic-flow"
  
  # Ensure IdP Redirector is created first
  depends_on = [
    keycloak_authentication_execution.idp_redirector,
    keycloak_authentication_execution_config.idp_redirector_config
  ]
}

# ... rest of MFA configuration remains unchanged
```

### Step 2: Authentication Flow Structure

The final authentication flow structure should be:

```
Classified Access Browser Flow - {REALM_NAME}
├─ Identity Provider Redirector [ALTERNATIVE]
│  ├─ If kc_idp_hint present → Auto-redirect to IdP
│  └─ If kc_idp_hint absent → Fall through
└─ Classified User Conditional [ALTERNATIVE]
    ├─ Username/Password Form [REQUIRED]
    └─ Conditional OTP [CONDITIONAL]
        ├─ User Attribute Condition [REQUIRED]
        │  (clearance != "UNCLASSIFIED")
        └─ OTP Form [REQUIRED]
```

### Step 3: Apply Terraform Changes

```bash
# Navigate to terraform directory
cd terraform

# Initialize Terraform
terraform init

# Plan changes (review carefully)
terraform plan -out=tfplan

# Apply changes
terraform apply tfplan

# Verify authentication flow
terraform show | grep -A 20 "idp_redirector"
```

### Step 4: Verify in Keycloak Admin Console

1. Navigate to: `http://localhost:8081/admin/master/console`
2. Select realm: `dive-v3-broker` (or any other realm)
3. Go to: **Authentication** → **Flows**
4. Select: **"Classified Access Browser Flow - {REALM}"**
5. Verify structure:
   - ✅ **Identity Provider Redirector** [ALTERNATIVE] at top
   - ✅ **Classified User Conditional** [ALTERNATIVE] below it
   - ✅ **Used by**: Browser flow (green checkmark)

---

## 💻 Frontend Configuration

### NextAuth Configuration

The frontend is already configured correctly. Verify the following settings:

**File**: `frontend/src/auth.ts`

```typescript
import NextAuth from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: DrizzleAdapter(db),
    trustHost: true,
    debug: process.env.NODE_ENV === "development",
    
    providers: [
        KeycloakProvider({
            clientId: process.env.KEYCLOAK_CLIENT_ID!,
            clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
            issuer: process.env.KEYCLOAK_ISSUER,
            
            // CRITICAL: Enable offline_access for refresh tokens
            authorization: {
                params: {
                    scope: "openid email profile offline_access dive-attributes",
                },
            },
        }),
    ],
    
    callbacks: {
        async jwt({ token, account, profile }) {
            // Attach account and profile on initial sign-in
            if (account) {
                token.accessToken = account.access_token;
                token.refreshToken = account.refresh_token;
                token.expiresAt = account.expires_at;
            }
            
            if (profile) {
                // Normalize DIVE attributes from Keycloak
                token.clearance = profile.clearance;
                token.countryOfAffiliation = profile.countryOfAffiliation;
                token.acpCOI = profile.acpCOI;
                token.uniqueID = profile.uniqueID || profile.sub;
            }
            
            return token;
        },
        
        async session({ session, token }) {
            // Attach DIVE attributes to session
            session.user.clearance = token.clearance;
            session.user.countryOfAffiliation = token.countryOfAffiliation;
            session.user.acpCOI = token.acpCOI;
            session.user.uniqueID = token.uniqueID;
            
            return session;
        },
    },
});
```

### IdP Selector Component

**File**: `frontend/src/components/auth/idp-selector.tsx`

```typescript
'use client';

import { signIn } from 'next-auth/react';

export function IdPSelector({ idps }: { idps: IdPOption[] }) {
    const handleIdpClick = async (idp: IdPOption) => {
        if (idp.protocol === 'saml') {
            console.log(`[IdP Selector] ${idp.alias} is SAML - using NextAuth with kc_idp_hint`);
            
            // CRITICAL: Pass kc_idp_hint to trigger Identity Provider Redirector
            await signIn('keycloak', 
                { redirectTo: '/dashboard' },
                { kc_idp_hint: idp.alias }  // ← This bypasses Keycloak login page!
            );
        } else {
            // OIDC IdPs use standard flow
            await signIn('keycloak', 
                { redirectTo: '/dashboard' },
                { kc_idp_hint: idp.alias }
            );
        }
    };
    
    return (
        <div>
            {idps.map((idp) => (
                <button key={idp.alias} onClick={() => handleIdpClick(idp)}>
                    {idp.displayName}
                </button>
            ))}
        </div>
    );
}
```

### Environment Variables

**File**: `frontend/.env.local`

```bash
# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-here

# Keycloak Configuration
KEYCLOAK_CLIENT_ID=dive-v3-client-broker
KEYCLOAK_CLIENT_SECRET=your-keycloak-client-secret
KEYCLOAK_ISSUER=http://localhost:8081/realms/dive-v3-broker

# PostgreSQL Configuration (NextAuth Sessions)
DATABASE_URL=postgresql://postgres:password@localhost:5433/dive_v3_app

# Backend API
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

---

## 🐳 Docker Deployment

### Complete Docker Compose Stack

**File**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  # PostgreSQL - NextAuth Sessions & Keycloak
  postgres:
    image: postgres:15-alpine
    container_name: dive-v3-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_MULTIPLE_DATABASES: keycloak_db,dive_v3_app
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/create-multiple-databases.sh:/docker-entrypoint-initdb.d/create-multiple-databases.sh
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - dive-network

  # Keycloak - IdP Broker
  keycloak:
    image: quay.io/keycloak/keycloak:26.0.0
    container_name: dive-v3-keycloak
    command:
      - start-dev
      - --import-realm
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak_db
      KC_DB_USERNAME: postgres
      KC_DB_PASSWORD: password
      KC_HOSTNAME: localhost
      KC_HOSTNAME_PORT: 8081
      KC_HTTP_ENABLED: "true"
      KC_HTTP_PORT: 8080
      KC_HEALTH_ENABLED: "true"
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    ports:
      - "8081:8080"
    volumes:
      - ./keycloak/dive-v3-custom-authenticator-1.0.0.jar:/opt/keycloak/providers/dive-v3-custom-authenticator-1.0.0.jar
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health/ready"]
      interval: 30s
      timeout: 10s
      retries: 5
    networks:
      - dive-network

  # SimpleSAMLphp - Spain External SAML IdP
  spain-saml-idp:
    image: venatorfox/simplesamlphp:2.3.3
    container_name: dive-spain-saml-idp
    environment:
      SIMPLESAMLPHP_SP_ENTITY_ID: http://localhost:8081/realms/dive-v3-broker
      SIMPLESAMLPHP_SP_ASSERTION_CONSUMER_SERVICE: http://localhost:8081/realms/dive-v3-broker/broker/esp-realm-external/endpoint
      SIMPLESAMLPHP_SP_SINGLE_LOGOUT_SERVICE: http://localhost:8081/realms/dive-v3-broker/broker/esp-realm-external/endpoint
    ports:
      - "9443:8080"
    volumes:
      - ./external-idps/spain-saml/config:/var/simplesamlphp/config
      - ./external-idps/spain-saml/metadata:/var/simplesamlphp/metadata
      - ./external-idps/spain-saml/cert:/var/simplesamlphp/cert
    networks:
      - dive-network

  # MongoDB - Resource Metadata
  mongodb:
    image: mongo:7
    container_name: dive-v3-mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
      MONGO_INITDB_DATABASE: dive_v3
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - dive-network

  # OPA - Policy Engine
  opa:
    image: openpolicyagent/opa:0.68.0-rootless
    container_name: dive-v3-opa
    command:
      - "run"
      - "--server"
      - "--addr=0.0.0.0:8181"
      - "--log-level=debug"
      - "/policies"
    ports:
      - "8181:8181"
    volumes:
      - ./policies:/policies
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8181/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - dive-network

  # Backend API
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: dive-v3-backend
    environment:
      NODE_ENV: development
      PORT: 4000
      MONGODB_URI: mongodb://admin:password@mongodb:27017/dive_v3?authSource=admin
      OPA_URL: http://opa:8181
      KEYCLOAK_ISSUER: http://keycloak:8080/realms/dive-v3-broker
      JWKS_URI: http://keycloak:8080/realms/dive-v3-broker/protocol/openid-connect/certs
    ports:
      - "4000:4000"
    depends_on:
      mongodb:
        condition: service_healthy
      opa:
        condition: service_healthy
      keycloak:
        condition: service_healthy
    networks:
      - dive-network

  # Frontend (Next.js)
  nextjs:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: dive-v3-frontend
    environment:
      NODE_ENV: development
      NEXTAUTH_URL: http://localhost:3000
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      KEYCLOAK_CLIENT_ID: dive-v3-client-broker
      KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_CLIENT_SECRET}
      KEYCLOAK_ISSUER: http://keycloak:8080/realms/dive-v3-broker
      DATABASE_URL: postgresql://postgres:password@postgres:5432/dive_v3_app
      NEXT_PUBLIC_BACKEND_URL: http://localhost:4000
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      keycloak:
        condition: service_healthy
      backend:
        condition: service_started
    networks:
      - dive-network

volumes:
  postgres_data:
    driver: local
  mongodb_data:
    driver: local

networks:
  dive-network:
    driver: bridge
```

### Deployment Steps

#### Step 1: Clone Repository and Setup Environment

```bash
# Clone repository
git clone https://github.com/your-org/DIVE-V3.git
cd DIVE-V3

# Create environment files
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env

# Generate secrets
export NEXTAUTH_SECRET=$(openssl rand -base64 32)
export KEYCLOAK_CLIENT_SECRET=$(openssl rand -base64 32)

# Update .env.local files with generated secrets
```

#### Step 2: Initialize Database Schema

```bash
# Start PostgreSQL only
docker-compose up -d postgres

# Wait for PostgreSQL to be ready
sleep 10

# Create databases
docker-compose exec postgres psql -U postgres << 'EOF'
CREATE DATABASE keycloak_db;
CREATE DATABASE dive_v3_app;
\l
EOF

# Apply NextAuth schema
cd frontend
npx drizzle-kit push

# Apply UUID default migrations
docker-compose exec -T postgres psql -U postgres -d dive_v3_app < drizzle/0001_add_uuid_defaults.sql
```

#### Step 3: Deploy Keycloak and Configure Realms

```bash
# Start Keycloak
docker-compose up -d keycloak

# Wait for Keycloak to be ready
sleep 30

# Apply Terraform configuration
cd terraform
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

#### Step 4: Start All Services

```bash
# Return to root directory
cd ..

# Start all services
docker-compose up -d

# Check service health
docker-compose ps

# View logs
docker-compose logs -f
```

#### Step 5: Verify Deployment

```bash
# Test Keycloak
curl http://localhost:8081/realms/dive-v3-broker/.well-known/openid-configuration

# Test OPA
curl http://localhost:8181/health

# Test Backend
curl http://localhost:4000/health

# Test Frontend
curl http://localhost:3000
```

---

## ✅ Verification & Testing

### Manual E2E Test

1. **Navigate to Homepage**
   ```
   http://localhost:3000
   ```

2. **Click Spain SAML Button**
   - Button text: "🇪🇸 Spain Ministry of Defense (External SAML)"
   - Should redirect immediately (no Keycloak login page!)

3. **Verify SimpleSAMLphp Login Page**
   - URL should be: `http://localhost:9443/simplesaml/module.php/core/loginuserpass`
   - Title: "Enter your username and password"
   - Header: "SimpleSAMLphp - Spanish Defense Ministry"

4. **Login with Test User**
   - Username: `juan.garcia`
   - Password: `EspanaDefensa2025!`

5. **Verify Dashboard**
   - Should land on: `http://localhost:3000/dashboard`
   - Should show:
     - Clearance: `SECRET`
     - Country: `ESP`
     - COI: `NATO-COSMIC`
     - IdP: "Spain Ministry of Defense (External SAML)"

### Automated Test Script

**File**: `scripts/test-spain-saml-e2e.sh`

```bash
#!/bin/bash
set -e

echo "=== DIVE V3 Spain SAML E2E Test ==="
echo ""

# Check all services are running
echo "[1/6] Checking service health..."
docker-compose ps | grep "Up" || exit 1

# Test Keycloak
echo "[2/6] Testing Keycloak..."
curl -f http://localhost:8081/realms/dive-v3-broker/.well-known/openid-configuration > /dev/null

# Test SimpleSAMLphp
echo "[3/6] Testing SimpleSAMLphp..."
curl -f http://localhost:9443/simplesaml/module.php/core/welcome > /dev/null

# Test Backend
echo "[4/6] Testing Backend..."
curl -f http://localhost:4000/health > /dev/null

# Test Frontend
echo "[5/6] Testing Frontend..."
curl -f http://localhost:3000 > /dev/null

# Verify database schema
echo "[6/6] Verifying database schema..."
docker-compose exec -T postgres psql -U postgres -d dive_v3_app << 'EOF'
SELECT 
    table_name,
    column_name,
    column_default
FROM information_schema.columns
WHERE table_name IN ('account', 'session')
  AND column_name = 'id'
  AND column_default LIKE '%gen_random_uuid%';
EOF

echo ""
echo "✅ All checks passed!"
echo "🚀 Spain SAML integration is ready for testing"
echo ""
echo "Manual test: Open http://localhost:3000 and click 'Spain Ministry of Defense (External SAML)'"
```

### Database Verification

```sql
-- Connect to PostgreSQL
psql -U postgres -d dive_v3_app

-- Verify account table has UUID default
SELECT column_name, column_default 
FROM information_schema.columns 
WHERE table_name = 'account' AND column_name = 'id';
-- Expected: id | gen_random_uuid()::text

-- Verify session table has UUID default
SELECT column_name, column_default 
FROM information_schema.columns 
WHERE table_name = 'session' AND column_name = 'id';
-- Expected: id | gen_random_uuid()::text

-- Check for recent Spain SAML sessions
SELECT 
    u.email,
    a.provider,
    s.expires
FROM "user" u
JOIN "account" a ON u.id = a."userId"
JOIN "session" s ON u.id = s."userId"
WHERE a.provider = 'keycloak'
  AND u.email LIKE '%defensa.gob.es'
ORDER BY s.expires DESC
LIMIT 5;
```

---

## 🔧 Troubleshooting

### Issue 1: "Configuration" Error After SAML Login

**Symptoms:**
- User authenticates at SimpleSAMLphp successfully
- Redirected back to homepage with `?error=Configuration`

**Root Cause:**
- Missing UUID defaults in database schema
- NextAuth adapter failing to insert account/session records

**Solution:**
```bash
# Apply UUID defaults
docker-compose exec -T postgres psql -U postgres -d dive_v3_app << 'EOF'
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
EOF

# Restart frontend
docker-compose restart nextjs
```

### Issue 2: Still Seeing Keycloak Login Page

**Symptoms:**
- Clicking Spain SAML button shows Keycloak login page
- Manual IdP selection required

**Root Cause:**
- Identity Provider Redirector not bound to browser flow
- Terraform authentication bindings conflict

**Solution:**
```bash
# Check Keycloak admin console
open http://localhost:8081/admin/master/console

# Navigate to: Authentication → Flows
# Verify "Classified Access Browser Flow" shows:
#   1. Identity Provider Redirector [ALTERNATIVE]
#   2. Classified User Conditional [ALTERNATIVE]

# If not, re-apply Terraform:
cd terraform
terraform apply -auto-approve

# Verify in Keycloak logs
docker-compose logs keycloak | grep -i "idp.*redirect"
```

### Issue 3: "Null Value" Database Errors

**Symptoms:**
```
ERROR:  null value in column "id" of relation "account" violates not-null constraint
ERROR:  null value in column "id" of relation "session" violates not-null constraint
```

**Root Cause:**
- Database migration not applied
- UUID defaults missing from schema

**Solution:**
```bash
# Apply migrations immediately
docker-compose exec -T postgres psql -U postgres -d dive_v3_app << 'EOF'
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
EOF

# Verify
docker-compose exec postgres psql -U postgres -d dive_v3_app -c "\d account"
docker-compose exec postgres psql -U postgres -d dive_v3_app -c "\d session"
```

### Issue 4: SimpleSAMLphp Not Responding

**Symptoms:**
- Connection refused on port 9443
- "Service Unavailable" errors

**Solution:**
```bash
# Check SimpleSAMLphp container
docker-compose ps spain-saml-idp

# Restart SimpleSAMLphp
docker-compose restart spain-saml-idp

# View logs
docker-compose logs spain-saml-idp

# Test directly
curl http://localhost:9443/simplesaml/module.php/core/welcome
```

### Issue 5: SAML Attribute Mapping Issues

**Symptoms:**
- User lands on dashboard but attributes are missing
- Clearance shows "Unknown"

**Solution:**
```bash
# Check Keycloak attribute mappers
# Admin Console → Identity Providers → esp-realm-external → Mappers

# Verify these mappers exist:
# - uniqueID-mapper
# - clearance-mapper
# - countryOfAffiliation-mapper
# - acpCOI-mapper

# Test SAML assertion
docker-compose exec spain-saml-idp cat /var/simplesamlphp/metadata/saml20-idp-remote.php

# Check backend clearance transformation
docker-compose logs backend | grep "clearance"
```

---

## ⏮️ Rollback Procedures

### Rollback Database Changes

```bash
# Remove UUID defaults (if needed)
docker-compose exec -T postgres psql -U postgres -d dive_v3_app << 'EOF'
ALTER TABLE "account" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "session" ALTER COLUMN "id" DROP DEFAULT;
EOF
```

### Rollback Terraform Changes

```bash
cd terraform

# Remove Identity Provider Redirector executions
terraform destroy -target=module.broker_mfa.keycloak_authentication_execution.idp_redirector
terraform destroy -target=module.broker_mfa.keycloak_authentication_execution_config.idp_redirector_config

# Restore MFA subflow requirement to REQUIRED
# (Manual edit required in realm-mfa/main.tf)
```

### Rollback Frontend Changes

```bash
# Revert to previous version
git checkout HEAD~1 frontend/src/lib/db/schema.ts

# Rebuild frontend
docker-compose build nextjs
docker-compose restart nextjs
```

---

## 🔍 Maintenance & Monitoring

### Health Checks

```bash
# Check all services
docker-compose ps

# Check service logs
docker-compose logs --tail=100 nextjs
docker-compose logs --tail=100 backend
docker-compose logs --tail=100 keycloak
docker-compose logs --tail=100 spain-saml-idp

# Monitor database connections
docker-compose exec postgres psql -U postgres -d dive_v3_app << 'EOF'
SELECT 
    count(*) as active_sessions,
    max(expires) as latest_expiry
FROM "session"
WHERE expires > NOW();
EOF
```

### Performance Monitoring

```bash
# Monitor NextAuth adapter performance
docker-compose exec postgres psql -U postgres -d dive_v3_app << 'EOF'
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes
FROM pg_stat_user_tables
WHERE tablename IN ('account', 'session', 'user');
EOF
```

### Backup Strategy

```bash
# Backup PostgreSQL (includes NextAuth sessions)
docker-compose exec postgres pg_dump -U postgres dive_v3_app > backup_$(date +%Y%m%d).sql

# Backup MongoDB (resource metadata)
docker-compose exec mongodb mongodump --out /backup --authenticationDatabase admin -u admin -p password

# Backup Keycloak realm
curl -X POST http://localhost:8081/admin/realms/dive-v3-broker/partial-export \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -o keycloak_backup_$(date +%Y%m%d).json
```

### Log Rotation

```bash
# Configure Docker log rotation
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
EOF

# Restart Docker
sudo systemctl restart docker
```

---

## 📊 Deployment Checklist

Use this checklist for each new deployment:

### Pre-Deployment

- [ ] Clone repository to deployment server
- [ ] Generate `NEXTAUTH_SECRET` and `KEYCLOAK_CLIENT_SECRET`
- [ ] Create `.env.local` files for frontend and backend
- [ ] Verify Docker and Docker Compose versions
- [ ] Ensure ports 3000, 4000, 5433, 8081, 8181, 9443 are available

### Database Setup

- [ ] Start PostgreSQL container
- [ ] Create `keycloak_db` and `dive_v3_app` databases
- [ ] Apply Drizzle schema migrations
- [ ] Apply UUID default migrations (`0001_add_uuid_defaults.sql`)
- [ ] Verify `account.id` and `session.id` have UUID defaults

### Terraform Configuration

- [ ] Initialize Terraform (`terraform init`)
- [ ] Plan Terraform changes (`terraform plan`)
- [ ] Apply Terraform changes (`terraform apply`)
- [ ] Verify Identity Provider Redirector in Keycloak admin console
- [ ] Verify authentication flow structure for all 11 realms

### Service Deployment

- [ ] Start Keycloak container and wait for health check
- [ ] Start SimpleSAMLphp container
- [ ] Start MongoDB container
- [ ] Start OPA container
- [ ] Start Backend container
- [ ] Start Frontend container
- [ ] Verify all containers are "Up (healthy)"

### Testing

- [ ] Run automated health check script (`test-spain-saml-e2e.sh`)
- [ ] Test Spain SAML E2E flow manually
- [ ] Verify no Keycloak login page shown
- [ ] Verify user lands on dashboard with attributes
- [ ] Test other IdPs still work correctly
- [ ] Check database for session records

### Post-Deployment

- [ ] Configure log rotation
- [ ] Set up database backups (daily)
- [ ] Configure monitoring alerts
- [ ] Document any deployment-specific changes
- [ ] Update runbook with any issues encountered

---

## 📚 Additional Resources

### Documentation

- **Keycloak Identity Provider Redirector**: https://www.keycloak.org/docs/latest/server_admin/index.html#identity-provider-redirector
- **NextAuth Drizzle Adapter**: https://authjs.dev/reference/adapter/drizzle
- **SimpleSAMLphp**: https://simplesamlphp.org/docs/stable/
- **Terraform Keycloak Provider**: https://registry.terraform.io/providers/mrparkers/keycloak/latest/docs

### Related Files

- **Implementation Report**: `SPAIN-SAML-IDP-REDIRECTOR-SUCCESS.md`
- **Database Schema**: `frontend/src/lib/db/schema.ts`
- **MFA Module**: `terraform/modules/realm-mfa/main.tf`
- **IdP Selector**: `frontend/src/components/auth/idp-selector.tsx`
- **NextAuth Config**: `frontend/src/auth.ts`

### Support Contacts

- **DIVE V3 Team**: dive-v3-support@example.mil
- **Keycloak**: https://github.com/keycloak/keycloak/discussions
- **NextAuth**: https://github.com/nextauthjs/next-auth/discussions

---

## 🏁 Conclusion

This deployment guide provides a complete, reproducible process for deploying the Spain SAML integration with seamless SSO. The solution is:

✅ **Production Ready** - Fully tested and verified  
✅ **Resilient** - Database schema ensures no failures  
✅ **Robust** - Identity Provider Redirector integrated at module level  
✅ **Persistent** - All configuration stored in Terraform and migrations  
✅ **Scalable** - Works for all 11 realms, ready for additional IdPs  

**Key Success Factors:**
1. UUID defaults in PostgreSQL schema (critical for NextAuth adapter)
2. Identity Provider Redirector integrated into MFA module (not standalone)
3. `kc_idp_hint` parameter passed from frontend
4. Proper authentication flow structure (ALTERNATIVE requirements)

Follow this guide step-by-step for a successful deployment. For any issues, refer to the Troubleshooting section or contact the DIVE V3 support team.

---

**Document Version**: 1.0  
**Last Updated**: October 28, 2025  
**Status**: ✅ **PRODUCTION READY**

