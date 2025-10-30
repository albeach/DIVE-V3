# External IdP Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying and integrating external SAML (Spain) and OIDC (USA) identity providers with DIVE V3.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  dive-external-idps Network                      │
│                                                                  │
│  ┌──────────────────┐                  ┌─────────────────────┐ │
│  │  Spain SAML IdP  │                  │   USA OIDC IdP      │ │
│  │  (SimpleSAMLphp) │                  │   (Keycloak)        │ │
│  │  Port: 8443      │                  │   Port: 8082        │ │
│  │                  │                  │                     │ │
│  │  + 4 Test Users  │                  │  + 4 Test Users     │ │
│  │  + SAML Metadata │                  │  + OIDC Discovery   │ │
│  └────────┬─────────┘                  └──────────┬──────────┘ │
│           │                                        │             │
└───────────┼────────────────────────────────────────┼────────────┘
            │                                        │
            │           SAML/OIDC Federation        │
            └───────────────────┬───────────────────┘
                                │
                                ▼
               ┌────────────────────────────┐
               │   DIVE V3 Keycloak Broker  │
               │   (dive-network +          │
               │    external-idps network)  │
               │   Port: 8081/8443          │
               └────────────┬───────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │   DIVE V3 Application Stack   │
            │   • Frontend (Next.js)        │
            │   • Backend (Express)         │
            │   • OPA (Policy Engine)       │
            │   • MongoDB (Resources)       │
            │   • KAS (Key Access Service)  │
            └───────────────────────────────┘
```

## Prerequisites

### System Requirements
- Docker 20.10+ with Docker Compose
- 8GB RAM minimum (16GB recommended)
- 20GB disk space
- macOS, Linux, or Windows with WSL2

### Network Ports
Ensure the following ports are available:

| Service | Port | Protocol | Usage |
|---------|------|----------|-------|
| Spain SAML | 8443 | HTTPS | SAML 2.0 endpoints |
| USA OIDC | 8082 | HTTP | OIDC endpoints |
| IdP Manager | 8090 | HTTP | Management dashboard |
| DIVE Keycloak | 8081 | HTTP | Broker (internal) |
| DIVE Keycloak | 8443 | HTTPS | Broker (external) |
| DIVE Frontend | 3000 | HTTP | Next.js UI |
| DIVE Backend | 4000 | HTTP | API |

### Software Dependencies
- OpenSSL (for generating SAML certificates)
- curl or wget (for testing endpoints)
- jq (for parsing JSON responses in tests)

## Deployment Steps

### Step 1: Clone and Navigate

```bash
# Navigate to DIVE V3 repository
cd /path/to/DIVE-V3

# Navigate to external-idps directory
cd external-idps
```

### Step 2: Configure Environment

```bash
# Create .env file from template
cp .env.example .env

# Edit .env with secure passwords (REQUIRED for production)
nano .env
```

**Production `.env` example:**
```bash
# Spain SAML IdP
SPAIN_ADMIN_PASSWORD=YourStrongPassword123!
SPAIN_ENTITY_ID=https://spain-saml:8443/simplesaml/saml2/idp/metadata.php

# USA OIDC IdP (Keycloak)
USA_ADMIN_PASSWORD=AnotherStrongPassword456!
USA_DB_PASSWORD=DatabasePassword789!
USA_REALM_NAME=us-dod
USA_CLIENT_ID=dive-v3-client
USA_CLIENT_SECRET=CHANGE-THIS-TO-LONG-RANDOM-STRING

# Network Configuration
DIVE_BROKER_URL=http://keycloak:8080
DIVE_BROKER_REALM=dive-v3-broker
```

### Step 3: Generate SAML Certificates

```bash
# Generate self-signed certificates for Spain SAML
./scripts/generate-spain-saml-certs.sh
```

**Expected output:**
```
================================================
DIVE V3 - Spain SAML Certificate Generator
================================================
Generating self-signed certificate for Spain SAML IdP...
  Country: ES
  Organization: Spanish Defense Ministry
  Common Name: spain-saml
  Valid for: 3650 days

✅ Certificates generated successfully!

Files created:
  Private Key: ../spain-saml/cert/server.pem
  Certificate: ../spain-saml/cert/server.crt
```

**⚠️ Production Note:** Replace self-signed certificates with certificates from a trusted CA.

### Step 4: Create External Docker Network

```bash
# Create dive-external-idps network
docker network create dive-external-idps --driver bridge
```

### Step 5: Start External IdPs

```bash
# Start all external IdP services
./scripts/start-external-idps.sh
```

**Expected output:**
```
================================================
DIVE V3 - External IdP Startup
================================================

🚀 Starting external IdP services...

⏳ Waiting for services to be healthy...
  Spain SAML IdP... ✅ Ready
  USA OIDC IdP... ✅ Ready

================================================
✅ External IdPs Started Successfully
================================================

Services:
  🇪🇸 Spain SAML IdP:  https://localhost:8443/simplesaml/
  🇺🇸 USA OIDC IdP:    http://localhost:8082
  📊 IdP Manager UI:   http://localhost:8090
```

### Step 6: Verify External IdPs

```bash
# Test Spain SAML metadata
./scripts/test-spain-saml-login.sh

# Test USA OIDC discovery
./scripts/test-usa-oidc-login.sh

# Access management dashboard
open http://localhost:8090
```

### Step 7: Start Main DIVE V3 Stack

```bash
# Navigate back to main directory
cd ..

# Start DIVE V3 services
docker-compose up -d
```

### Step 8: Verify Network Connectivity

```bash
# Check that Keycloak is connected to both networks
docker inspect dive-v3-keycloak | jq '.[0].NetworkSettings.Networks'

# Expected output should show:
# - dive-v3_dive-network
# - dive-external-idps
```

### Step 9: Onboard External IdPs via Wizard

#### 9.1 Access DIVE V3 Super Admin

1. Navigate to http://localhost:3000
2. Click the 🔓 icon (Easter egg) to access Super Admin login
3. Login with Super Admin credentials (configured during setup)

#### 9.2 Onboard Spain SAML IdP

1. Navigate to: **Admin → Identity Providers → Add New IdP**
2. Click **Add New Identity Provider**
3. **Step 1: Protocol Selection**
   - Select: **SAML**
   - Click **Next**

4. **Step 2: Basic Information**
   - **Alias**: `spain-external` (must be unique)
   - **Display Name**: `Spain Ministry of Defense`
   - **Enabled**: ✅ (checked)
   - Click **Next**

5. **Step 3: SAML Configuration**
   - **Entity ID**: `https://spain-saml:8443/simplesaml/saml2/idp/metadata.php`
   - **SSO URL**: `https://spain-saml:8443/simplesaml/saml2/idp/SSOService.php`
   - **SLO URL** (optional): `https://spain-saml:8443/simplesaml/saml2/idp/SingleLogoutService.php`
   - **Name ID Format**: `urn:oasis:names:tc:SAML:2.0:nameid-format:transient`
   - **Signing Certificate**: Upload `external-idps/spain-saml/cert/server.crt`
   - Click **Next**

6. **Step 4: Attribute Mapping**
   Configure the following mappers:

   | SAML Attribute | DIVE Claim | Type | Notes |
   |----------------|------------|------|-------|
   | `uid` | `uniqueID` | Attribute Importer | Required |
   | `nivelSeguridad` | `clearance` | Hardcoded | Map via backend normalization |
   | `paisAfiliacion` | `countryOfAffiliation` | Hardcoded | Value: `ESP` |
   | `grupoInteresCompartido` | `acpCOI` | Attribute Importer | Multi-valued |

   **Note:** Clearance mapping is handled by the attribute normalization service in the backend.

7. **Step 5: Test Connection**
   - Click **Test Connection**
   - Verify SAML metadata is accessible
   - Click **Next**

8. **Step 6: Review & Submit**
   - Review all configuration
   - Click **Submit**

#### 9.3 Onboard USA OIDC IdP

1. Navigate to: **Admin → Identity Providers → Add New IdP**
2. Click **Add New Identity Provider**
3. **Step 1: Protocol Selection**
   - Select: **OIDC**
   - Click **Next**

4. **Step 2: Basic Information**
   - **Alias**: `usa-external`
   - **Display Name**: `U.S. Department of Defense`
   - **Enabled**: ✅
   - Click **Next**

5. **Step 3: OIDC Configuration**
   - **Discovery URL**: `http://usa-oidc:8082/realms/us-dod/.well-known/openid-configuration`
   - **Client ID**: `dive-v3-client`
   - **Client Secret**: `usa-dod-secret-change-in-production` (from `.env`)
   - **Validate Signatures**: ✅
   - **PKCE**: Enabled
   - Click **Next**

6. **Step 4: Attribute Mapping**
   USA DoD already uses DIVE-compliant attribute names, so mappers are minimal:

   | OIDC Claim | DIVE Claim | Type |
   |------------|------------|------|
   | `uniqueID` | `uniqueID` | Claim Importer |
   | `clearance` | `clearance` | Claim Importer |
   | `countryOfAffiliation` | `countryOfAffiliation` | Hardcoded (`USA`) |
   | `acpCOI` | `acpCOI` | Claim Importer |

7. **Step 5: Test Connection**
   - Click **Test Connection**
   - Verify OIDC discovery endpoint is accessible
   - Click **Next**

8. **Step 6: Review & Submit**
   - Review configuration
   - Click **Submit**

### Step 10: Test Federation

#### 10.1 Test Spain SAML Login

1. Navigate to http://localhost:3000
2. Click **Login**
3. Select **Spain Ministry of Defense**
4. Login with test credentials:
   - Username: `garcia.maria@mde.es`
   - Password: `Classified123!`
5. Verify attributes in JWT:
   - `uniqueID`: `garcia.maria@mde.es`
   - `clearance`: `TOP_SECRET`
   - `countryOfAffiliation`: `ESP`
   - `acpCOI`: `["NATO-COSMIC", "ESP-ONLY"]`

#### 10.2 Test USA OIDC Login

1. Navigate to http://localhost:3000
2. Click **Login**
3. Select **U.S. Department of Defense**
4. Login with test credentials:
   - Username: `smith.john@mail.mil`
   - Password: `TopSecret123!`
5. Verify attributes in JWT:
   - `uniqueID`: `smith.john@mail.mil`
   - `clearance`: `TOP_SECRET`
   - `countryOfAffiliation`: `USA`
   - `acpCOI`: `["FVEY", "US-ONLY"]`

#### 10.3 Test Resource Access

1. After logging in as Spanish user:
   - Navigate to **Resources**
   - Attempt to access a NATO-COSMIC document
   - Verify access granted/denied based on OPA policy

2. After logging in as USA user:
   - Navigate to **Resources**
   - Attempt to access a FVEY document
   - Verify access granted

## Monitoring & Operations

### Health Checks

```bash
# Check all external IdP services
cd external-idps
docker-compose ps

# Check specific service health
docker exec dive-spain-saml-idp curl -k -f https://localhost:8443/simplesaml/
docker exec dive-usa-oidc-idp curl -f http://localhost:8080/health/ready
```

### View Logs

```bash
# All external IdP logs
docker-compose logs -f

# Spain SAML logs
docker-compose logs -f spain-saml

# USA OIDC logs
docker-compose logs -f usa-oidc

# Specific time range
docker-compose logs --since 1h spain-saml
```

### Restart Services

```bash
# Restart all external IdPs
docker-compose restart

# Restart specific service
docker-compose restart spain-saml
docker-compose restart usa-oidc
```

### Stop Services

```bash
# Stop all external IdPs (preserve data)
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

## Troubleshooting

### Issue: Spain SAML metadata not accessible

**Symptoms:**
- `curl -k https://localhost:8443/simplesaml/` fails
- SAML metadata endpoint returns 404

**Solutions:**
1. Check if certificates exist:
   ```bash
   ls -la spain-saml/cert/
   ```
2. Regenerate certificates:
   ```bash
   rm -rf spain-saml/cert/*
   ./scripts/generate-spain-saml-certs.sh
   ```
3. Restart Spain SAML:
   ```bash
   docker-compose restart spain-saml
   ```

### Issue: USA OIDC realm not found

**Symptoms:**
- `http://localhost:8082/realms/us-dod` returns 404
- Realm `us-dod` not visible in admin console

**Solutions:**
1. Check if realm was imported:
   ```bash
   docker exec dive-usa-oidc-idp ls -la /opt/keycloak/data/import/
   ```
2. Reimport realm:
   ```bash
   docker-compose down usa-oidc
   docker volume rm external-idps_usa_postgres_data
   docker-compose up -d usa-oidc
   ```

### Issue: Network connectivity between broker and external IdPs

**Symptoms:**
- Keycloak broker cannot reach external IdPs
- "Connection refused" errors in logs

**Solutions:**
1. Verify networks exist:
   ```bash
   docker network ls | grep dive
   ```
2. Recreate external network:
   ```bash
   docker network rm dive-external-idps
   docker network create dive-external-idps --driver bridge
   ```
3. Restart Keycloak to reconnect:
   ```bash
   cd ..
   docker-compose restart keycloak
   ```

### Issue: Attribute mapping not working

**Symptoms:**
- Attributes missing in JWT token
- Spanish clearance levels not normalized

**Solutions:**
1. Check attribute normalization service logs:
   ```bash
   docker logs dive-v3-backend | grep "normalization"
   ```
2. Verify protocol mappers in Keycloak:
   - Login to DIVE Keycloak admin: http://localhost:8081/admin
   - Navigate to Identity Providers → spain-external → Mappers
   - Verify mappers are active

3. Test normalization service directly:
   ```bash
   cd backend
   npm test -- attribute-normalization
   ```

## Production Hardening

### Security Checklist

- [ ] **Certificates**
  - [ ] Replace self-signed SAML certificates with CA-signed
  - [ ] Configure proper certificate chain
  - [ ] Set up certificate rotation (90-day max)

- [ ] **Passwords**
  - [ ] Change all admin passwords (min 16 characters)
  - [ ] Use password manager or secrets vault
  - [ ] Enable password complexity requirements

- [ ] **Network**
  - [ ] Enable HTTPS for all services
  - [ ] Configure firewall rules (whitelist broker IP)
  - [ ] Implement mutual TLS for broker ↔ IdP

- [ ] **Access Control**
  - [ ] Disable Direct Access Grant flow
  - [ ] Enable brute force protection
  - [ ] Configure session timeouts (< 8 hours)
  - [ ] Enable audit logging

- [ ] **Monitoring**
  - [ ] Set up health check alerts
  - [ ] Configure log aggregation (ELK, Splunk)
  - [ ] Enable metrics collection (Prometheus)
  - [ ] Set up uptime monitoring

- [ ] **Backup**
  - [ ] Automated database backups (daily)
  - [ ] Configuration backups (version control)
  - [ ] Certificate backups (encrypted)
  - [ ] Disaster recovery plan

### Production Environment Variables

```bash
# Spain SAML (Production)
SPAIN_ADMIN_PASSWORD=$(openssl rand -base64 32)
SPAIN_ENTITY_ID=https://spain-idp.example.com/saml2/idp/metadata.php

# USA OIDC (Production)
USA_ADMIN_PASSWORD=$(openssl rand -base64 32)
USA_DB_PASSWORD=$(openssl rand -base64 32)
USA_CLIENT_SECRET=$(openssl rand -base64 64)

# Network (Production)
DIVE_BROKER_URL=https://keycloak.example.com
DIVE_BROKER_REALM=dive-v3-production
```

### SSL/TLS Configuration

#### Spain SAML HTTPS

1. Obtain certificate from CA (Let's Encrypt, DigiCert, etc.)
2. Update SimpleSAMLphp configuration:
   ```php
   // spain-saml/config/config.php
   'baseurlpath' => 'https://spain-idp.example.com/simplesaml/',
   'metadata.sign.certificate' => 'production.crt',
   'metadata.sign.privatekey' => 'production.key',
   ```
3. Update docker-compose.yml:
   ```yaml
   volumes:
     - ./spain-saml/cert/production.crt:/var/simplesamlphp/cert/production.crt:ro
     - ./spain-saml/cert/production.key:/var/simplesamlphp/cert/production.key:ro
   ```

#### USA OIDC HTTPS

1. Obtain certificate for USA OIDC
2. Update docker-compose.yml:
   ```yaml
   usa-oidc:
     environment:
       KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/usa-oidc.crt
       KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/usa-oidc.key
       KC_HTTPS_PORT: 8443
     volumes:
       - ./usa-oidc/certs:/opt/keycloak/certs:ro
     ports:
       - "8443:8443"
   ```

## Performance Tuning

### Resource Limits

```yaml
# external-idps/docker-compose.yml
services:
  spain-saml:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  usa-oidc:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G
```

### Database Optimization

```yaml
# USA OIDC PostgreSQL tuning
usa-postgres:
  command:
    - postgres
    - -c
    - shared_buffers=256MB
    - -c
    - max_connections=100
    - -c
    - work_mem=16MB
```

## References

- External IdP README: `external-idps/README.md`
- SimpleSAMLphp Documentation: https://simplesamlphp.org/docs/stable/
- Keycloak SAML: https://www.keycloak.org/docs/latest/server_admin/#saml
- Keycloak OIDC: https://www.keycloak.org/docs/latest/server_admin/#_oidc
- DIVE V3 Implementation Plan: `notes/dive-v3-implementation-plan.md`
- IdP Management User Guide: `docs/IDP-MANAGEMENT-USER-GUIDE.md`

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review logs: `docker-compose logs -f`
3. Run health checks: `./scripts/test-spain-saml-login.sh`
4. Check GitHub Issues: https://github.com/your-org/DIVE-V3/issues


