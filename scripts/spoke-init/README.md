# DIVE V3 Spoke Initialization Scripts

This directory contains automated initialization scripts for deploying a complete DIVE V3 spoke instance.

## What Gets Initialized

When you run `./dive spoke init <CODE> "<Name>"`, the following are automatically set up:

### 1. Database Tables
- **PostgreSQL**: NextAuth session tables (`user`, `account`, `session`, `verificationToken`)
- **MongoDB**: Initialized with sample resources

### 2. Keycloak Configuration
- **Realm**: `dive-v3-broker-<code>` created with proper settings
- **Client**: OAuth client with correct scopes and redirect URIs
- **Scopes**: `openid`, `profile`, `email`, `offline_access`
- **Users**: Test users with DIVE attributes (clearance, country, etc.)
- **Theme**: Optional French military theme for FRA instances

### 3. Environment Configuration
- All passwords auto-generated (32 char secure random)
- DATABASE_URL, MONGODB_URL configured
- AUTH_KEYCLOAK_ISSUER set to public URL
- CORS origins configured

### 4. Certificates
- Self-signed certificates for HTTPS
- Optional: CSR generation for CA signing

## Files

- `init-databases.sh` - Creates NextAuth tables, seeds MongoDB
- `init-keycloak.sh` - Creates realm, client, scopes, users
- `seed-resources.sh` - Seeds sample documents
- `seed-users.sh` - Creates test users with DIVE attributes
- `nextauth-schema.sql` - NextAuth PostgreSQL schema
- `realm-template.json` - Keycloak realm configuration template
- `sample-resources.json` - Sample DIVE resources

## Usage

The spoke wizard handles everything automatically:

```bash
./dive spoke init FRA "France Defense Ministry"
```

Or run individual scripts:

```bash
# After docker compose up -d
./scripts/spoke-init/init-databases.sh FRA
./scripts/spoke-init/init-keycloak.sh FRA
./scripts/spoke-init/seed-resources.sh FRA
```


