# DIVE V3 External Identity Providers

This directory contains actual SAML and OIDC identity providers running on a separate Docker network to demonstrate true federation with DIVE V3.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              dive-external-idps Network                      │
│                                                              │
│  ┌──────────────────┐          ┌─────────────────────┐     │
│  │  Spain SAML IdP  │          │   USA OIDC IdP      │     │
│  │  (SimpleSAMLphp) │          │   (Keycloak)        │     │
│  │  Port: 8443      │          │   Port: 8082        │     │
│  └────────┬─────────┘          └──────────┬──────────┘     │
│           │                                 │                │
└───────────┼─────────────────────────────────┼───────────────┘
            │                                 │
            └─────────────┬───────────────────┘
                          │ SAML/OIDC Federation
                          ▼
            ┌─────────────────────────┐
            │   DIVE V3 Keycloak      │
            │   (IdP Broker)          │
            │   dive-network          │
            │   Port: 8081/8443       │
            └─────────────────────────┘
```

## Components

### 1. Spain SAML IdP (SimpleSAMLphp)
- **URL**: https://localhost:8443/simplesaml/
- **Protocol**: SAML 2.0
- **Container**: `dive-spain-saml-idp`
- **Network**: `dive-external-idps` + `dive-network`

**Test Users:**
| Username | Password | Clearance | COI | Spanish Level |
|----------|----------|-----------|-----|---------------|
| garcia.maria@mde.es | Classified123! | TOP_SECRET | OTAN-COSMIC | SECRETO |
| rodriguez.juan@mde.es | Defense456! | SECRET | NATO-COSMIC | CONFIDENCIAL-DEFENSA |
| lopez.ana@mde.es | Military789! | CONFIDENTIAL | ESP-EXCLUSIVO | CONFIDENCIAL |
| fernandez.carlos@mde.es | Public000! | UNCLASSIFIED | NATO-UNRESTRICTED | NO-CLASIFICADO |

**Spanish Attribute Mappings:**
- `nivelSeguridad` → `clearance` (SECRETO → TOP_SECRET, etc.)
- `paisAfiliacion` → `countryOfAffiliation` (ESP)
- `grupoInteresCompartido` → `acpCOI` (OTAN-COSMIC → NATO-COSMIC)

### 2. USA OIDC IdP (Keycloak)
- **URL**: http://localhost:8082
- **Realm**: `us-dod`
- **Protocol**: OpenID Connect
- **Container**: `dive-usa-oidc-idp`
- **Network**: `dive-external-idps` + `dive-network`

**Test Users:**
| Username | Password | Clearance | COI | Organization |
|----------|----------|-----------|-----|--------------|
| smith.john@mail.mil | TopSecret123! | TOP_SECRET | FVEY, US-ONLY | U.S. Air Force |
| johnson.emily@mail.mil | Secret456! | SECRET | NATO-COSMIC, FVEY | U.S. Navy |
| williams.robert@mail.mil | Confidential789! | CONFIDENTIAL | NATO-COSMIC | U.S. Army |
| davis.sarah@mail.mil | Unclass000! | UNCLASSIFIED | NATO-UNRESTRICTED | U.S. Marine Corps |

**OIDC Claims:**
- `uniqueID`: User's email address
- `clearance`: TOP_SECRET | SECRET | CONFIDENTIAL | UNCLASSIFIED
- `countryOfAffiliation`: USA
- `acpCOI`: Array of COI tags
- `organization`, `rank`, `unit`: Additional metadata

## Quick Start

### 1. Start External IdPs
```bash
cd external-idps
docker-compose up -d
```

### 2. Verify Services
```bash
# Check Spain SAML metadata
curl -k https://localhost:8443/simplesaml/saml2/idp/metadata.php

# Check USA OIDC discovery
curl http://localhost:8082/realms/us-dod/.well-known/openid-configuration

# Check logs
docker-compose logs -f spain-saml
docker-compose logs -f usa-oidc
```

### 3. Access Admin Interfaces
- **Spain SAML**: https://localhost:8443/simplesaml/
  - Admin password: `admin123` (change in `.env`)
  
- **USA OIDC**: http://localhost:8082
  - Admin user: `admin` / `admin` (change in `.env`)

## Integration with DIVE V3

### Phase 1: Network Setup
The external IdPs run on `dive-external-idps` network but also connect to `dive-network` for broker communication.

### Phase 2: Onboard via Super Admin Wizard
1. Access DIVE V3: http://localhost:3000
2. Login as Super Admin (🔓 Easter egg)
3. Navigate to Admin → Identity Providers → Add New IdP
4. Follow wizard to onboard Spain SAML and USA OIDC

### Phase 3: Test Federation
```bash
# Test Spain SAML login
./scripts/test-spain-saml-login.sh

# Test USA OIDC login
./scripts/test-usa-oidc-login.sh
```

## Configuration Files

### Spain SAML
- `spain-saml/authsources.php` - Test user database
- `spain-saml/config/config.php` - SimpleSAMLphp configuration
- `spain-saml/metadata/saml20-idp-hosted.php` - SAML IdP metadata
- `spain-saml/cert/` - X.509 certificates (auto-generated)

### USA OIDC
- `usa-oidc/realm-export.json` - Keycloak realm with test users
- `usa-oidc/themes/` - Custom DoD theme (optional)

## Attribute Normalization

### Spain SAML → DIVE Claims
```javascript
// Spanish clearance levels
"SECRETO" → "TOP_SECRET"
"CONFIDENCIAL-DEFENSA" → "SECRET"
"CONFIDENCIAL" → "CONFIDENTIAL"
"NO-CLASIFICADO" → "UNCLASSIFIED"

// COI normalization
"OTAN-COSMIC" → "NATO-COSMIC"
"ESP-EXCLUSIVO" → "ESP-ONLY"
```

### USA OIDC → DIVE Claims
```javascript
// Already DIVE-compliant
uniqueID: "smith.john@mail.mil"
clearance: "TOP_SECRET"
countryOfAffiliation: "USA"
acpCOI: ["FVEY", "US-ONLY"]
```

## Security Considerations

### Development Mode
- Self-signed certificates for SAML
- HTTP enabled for OIDC
- Weak admin passwords (change in production)

### Production Hardening
1. **Spain SAML:**
   - Use proper PKI certificates
   - Enable HTTPS-only
   - Rotate SAML signing keys
   - Strong admin password

2. **USA OIDC:**
   - Enable HTTPS with valid certificates
   - Configure production database (not PostgreSQL in Docker)
   - Enable brute force protection
   - Set strong client secrets

3. **Network:**
   - Use external network policies to restrict traffic
   - Enable TLS for all inter-service communication
   - Implement mutual TLS for broker ↔ IdP

## Monitoring

### Health Checks
```bash
# Spain SAML
curl -k https://localhost:8443/simplesaml/

# USA OIDC
curl http://localhost:8082/health/ready
```

### Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f spain-saml
docker-compose logs -f usa-oidc
```

## Troubleshooting

### Spain SAML Issues
1. **Metadata not accessible:**
   ```bash
   docker exec -it dive-spain-saml-idp ls -la /var/simplesamlphp/cert
   ```

2. **Certificate errors:**
   - SimpleSAMLphp auto-generates self-signed certs
   - Accept the certificate in your browser

3. **Attribute mapping:**
   - Check `spain-saml/metadata/saml20-idp-hosted.php`
   - Verify `authproc` pipeline

### USA OIDC Issues
1. **Realm not imported:**
   ```bash
   docker-compose down -v  # Remove volumes
   docker-compose up -d    # Reimport realm
   ```

2. **Client secret mismatch:**
   - Check `usa-oidc/realm-export.json`
   - Update DIVE broker client configuration

3. **User attributes:**
   - Login to Keycloak admin console
   - Navigate to Users → Attributes

## Network Topology

```yaml
# docker-compose.yml (main DIVE)
networks:
  dive-network:
    driver: bridge
  external-idps:
    external: true
    name: dive-external-idps

# docker-compose.yml (external IdPs)
networks:
  dive-external-idps:
    driver: bridge
    name: dive-external-idps
  dive-network:
    external: true
    name: dive-v3_dive-network
```

## Testing Checklist

- [ ] Spain SAML metadata accessible from DIVE Keycloak
- [ ] USA OIDC discovery endpoint reachable
- [ ] Spanish test users can login via SAML
- [ ] U.S. test users can login via OIDC
- [ ] Attributes properly normalized (Spanish → DIVE)
- [ ] COI tags correctly mapped
- [ ] Clearance levels properly converted
- [ ] Session management works across IdPs
- [ ] Logout propagates to external IdPs

## Next Steps

1. **Generate SAML Certificates:**
   ```bash
   ./scripts/generate-spain-saml-certs.sh
   ```

2. **Start External IdPs:**
   ```bash
   docker-compose up -d
   ```

3. **Onboard via Wizard:**
   - Use Super Admin console to add Spain and USA IdPs

4. **Run Integration Tests:**
   ```bash
   npm run test:integration:external-idp
   ```

## References

- SimpleSAMLphp Documentation: https://simplesamlphp.org/docs/stable/
- Keycloak OIDC: https://www.keycloak.org/docs/latest/server_admin/#_oidc
- DIVE V3 Implementation Plan: `../notes/dive-v3-implementation-plan.md`
- IdP Management Guide: `../docs/IDP-MANAGEMENT-USER-GUIDE.md`


