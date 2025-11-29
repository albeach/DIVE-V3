# DIVE V3 Coalition Partner Onboarding Guide

**Version**: 1.0  
**Date**: 2025-11-29  
**Status**: Ready for Use  

---

## Overview

This guide documents the process for onboarding a new coalition partner to the DIVE V3 federated identity platform. The process has been designed to be scalable and automated, requiring minimal manual intervention.

### Time Estimate

| Phase | Duration |
|-------|----------|
| Infrastructure Setup | 30 minutes |
| GCP Secret Manager | 15 minutes |
| Keycloak Configuration | 30 minutes |
| Testing & Verification | 15 minutes |
| **Total** | **~1.5 hours** |

---

## Prerequisites

Before starting, ensure you have:

1. **Partner Information**
   - ISO 3166-1 alpha-3 country code (e.g., `ESP` for Spain)
   - Partner domain for hosting (e.g., `partner.example.com`)
   - Network connectivity requirements (local or remote)
   - Contact email for technical coordination

2. **Technical Requirements**
   - GCP project access (`dive-v3-pilot`)
   - Terraform access to create resources
   - Docker environment (local or remote server)
   - Cloudflare account (if using tunnels)

3. **Tools Installed**
   - `gcloud` CLI (authenticated)
   - `terraform` CLI
   - `docker` and `docker compose`
   - `jq` (JSON processor)

---

## Step 1: Update Federation Registry

### 1.1 Add Instance to Registry

Edit `config/federation-registry.json`:

```json
{
  "instances": {
    "esp": {
      "code": "ESP",
      "name": "Spain",
      "type": "local",  // or "remote" for external hosting
      "enabled": true,
      "deployment": {
        "provider": "docker",
        "host": "localhost",  // or IP for remote
        "domain": "dive25.com"  // or partner domain
      },
      "urls": {
        "app": "https://esp-app.dive25.com",
        "api": "https://esp-api.dive25.com",
        "idp": "https://esp-idp.dive25.com"
      },
      "ports": {
        "frontend": 3005,
        "backend": 4005,
        "keycloak": 8449,
        "keycloakHttp": 8089,
        "keycloakManagement": 9005,
        "postgres": 5439,
        "mongodb": 27022,
        "redis": 6385,
        "opa": 8187,
        "opaMetrics": 9187,
        "kas": 8095
      },
      "secrets": {
        "gcpProjectId": "dive-v3-pilot",
        "gcpSecretPath": "projects/dive-v3-pilot/secrets/esp"
      },
      "cloudflare": {
        "tunnelId": "TO_BE_CREATED",
        "tunnelName": "dive-v3-esp"
      },
      "keycloak": {
        "adminUsername": "admin",
        "database": {
          "name": "keycloak",
          "user": "keycloak"
        },
        "theme": "dive-v3-esp"
      },
      "testUsers": {
        "create": true,
        "clearances": [1, 2, 3, 4]
      }
    }
  }
}
```

### 1.2 Update Federation Matrix

Add the new partner to the federation matrix:

```json
{
  "federation": {
    "matrix": {
      "usa": ["fra", "gbr", "deu", "esp"],
      "fra": ["usa", "gbr", "deu", "esp"],
      "gbr": ["usa", "fra", "deu", "esp"],
      "deu": ["usa", "fra", "gbr", "esp"],
      "esp": ["usa", "fra", "gbr", "deu"]
    }
  }
}
```

---

## Step 2: Create GCP Resources

### 2.1 Create Service Account

```bash
# Create service account for the new instance
gcloud iam service-accounts create dive-v3-keycloak-esp \
  --display-name="DIVE V3 Keycloak ESP Instance" \
  --project=dive-v3-pilot

# Download key for Docker deployment
gcloud iam service-accounts keys create gcp/esp-service-account.json \
  --iam-account=dive-v3-keycloak-esp@dive-v3-pilot.iam.gserviceaccount.com
```

### 2.2 Create Secrets in Secret Manager

The federation with existing partners requires secrets in both directions.

```bash
# For each existing partner, create a secret for ESP
for EXISTING in usa fra gbr deu; do
  # Secret for ESP to authenticate to EXISTING
  gcloud secrets create dive-v3-federation-${EXISTING}-esp \
    --replication-policy="automatic" \
    --labels="project=dive-v3,type=federation,source=${EXISTING},target=esp" \
    --project=dive-v3-pilot
  
  # Secret for EXISTING to authenticate to ESP
  gcloud secrets create dive-v3-federation-esp-${EXISTING} \
    --replication-policy="automatic" \
    --labels="project=dive-v3,type=federation,source=esp,target=${EXISTING}" \
    --project=dive-v3-pilot
done

echo "Created 8 new secrets for ESP federation"
```

### 2.3 Configure IAM

```bash
# ESP can read secrets for authenticating to partners
for EXISTING in usa fra gbr deu; do
  gcloud secrets add-iam-policy-binding dive-v3-federation-${EXISTING}-esp \
    --member="serviceAccount:dive-v3-keycloak-esp@dive-v3-pilot.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=dive-v3-pilot
done

# Existing partners can read secrets for authenticating to ESP
for EXISTING in usa fra gbr deu; do
  gcloud secrets add-iam-policy-binding dive-v3-federation-esp-${EXISTING} \
    --member="serviceAccount:dive-v3-keycloak-${EXISTING}@dive-v3-pilot.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=dive-v3-pilot
done
```

---

## Step 3: Deploy Infrastructure

### 3.1 Create Docker Compose File

Create `docker-compose.esp.yml`:

```yaml
# ============================================================================
# DIVE V3 - Spain (ESP) Instance
# ============================================================================

version: '3.8'

networks:
  dive-esp-network:
    driver: bridge

volumes:
  postgres_esp_data:
  mongo_esp_data:
  redis_esp_data:

services:
  postgres-esp:
    image: postgres:15-alpine
    container_name: dive-v3-postgres-esp
    environment:
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}
      POSTGRES_DB: keycloak
    ports:
      - "5439:5432"
    volumes:
      - postgres_esp_data:/var/lib/postgresql/data
      - ./scripts/postgres-init-esp/init-esp-db.sh:/docker-entrypoint-initdb.d/init-db.sh
    networks:
      dive-esp-network:
        aliases:
          - postgres

  keycloak-esp:
    build:
      context: ./keycloak
      dockerfile: Dockerfile
    container_name: dive-v3-keycloak-esp
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: ${POSTGRES_PASSWORD:-password}
      KC_HOSTNAME: esp-idp.dive25.com
      KC_HTTP_ENABLED: true
      KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/certificate.pem
      KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/key.pem
      KC_HTTPS_PORT: 8443
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-admin}
      KC_FEATURES: scripts
    command: >
      start-dev
      --spi-login-protocol-openid-connect-suppress-logout-confirmation-screen=true
      --features=scripts
      --vault=file
      --vault-dir=/opt/keycloak/vault
      --spi-vault-file-key-resolvers=REALM_UNDERSCORE_KEY
    depends_on:
      postgres-esp:
        condition: service_healthy
    ports:
      - "8089:8080"
      - "8449:8443"
      - "9005:9000"
    volumes:
      - ./keycloak/certs:/opt/keycloak/certs:ro
      - ./keycloak/themes:/opt/keycloak/themes:ro
      - keycloak_esp_vault:/opt/keycloak/vault:ro
    networks:
      dive-esp-network:
        aliases:
          - keycloak

  # Additional services (frontend, backend, OPA, KAS)...

volumes:
  keycloak_esp_vault:
```

### 3.2 Create Cloudflare Tunnel (if needed)

```bash
# Create tunnel
cloudflared tunnel create dive-v3-esp

# Save credentials
cloudflared tunnel token dive-v3-esp > cloudflared/esp-tunnel-credentials.json

# Create config
cat > cloudflared/config-esp.yml << 'EOF'
tunnel: YOUR_TUNNEL_ID
credentials-file: /etc/cloudflared/tunnel-credentials.json

ingress:
  - hostname: esp-idp.dive25.com
    service: https://keycloak-esp:8443
    originRequest:
      noTLSVerify: true
  - hostname: esp-app.dive25.com
    service: http://frontend-esp:3000
  - hostname: esp-api.dive25.com
    service: http://backend-esp:4000
  - service: http_status:404
EOF
```

---

## Step 4: Apply Terraform

### 4.1 Generate Terraform Variables

Create `terraform/instances/esp.tfvars`:

```hcl
instance_code = "ESP"
instance_name = "Spain"
app_url       = "https://esp-app.dive25.com"
api_url       = "https://esp-api.dive25.com"
idp_url       = "https://esp-idp.dive25.com"

federation_partners = {
  usa = {
    instance_code = "USA"
    instance_name = "United States"
    idp_url       = "https://usa-idp.dive25.com"
    enabled       = true
  }
  fra = {
    instance_code = "FRA"
    instance_name = "France"
    idp_url       = "https://fra-idp.dive25.com"
    enabled       = true
  }
  gbr = {
    instance_code = "GBR"
    instance_name = "United Kingdom"
    idp_url       = "https://gbr-idp.dive25.com"
    enabled       = true
  }
  deu = {
    instance_code = "DEU"
    instance_name = "Germany"
    idp_url       = "https://deu-idp.prosecurity.biz"
    enabled       = true
  }
}
```

### 4.2 Apply Terraform

```bash
cd terraform

# Create workspace
terraform workspace new esp

# Apply configuration
terraform apply -var-file=instances/esp.tfvars
```

### 4.3 Update Existing Partners

Each existing partner needs to add ESP as a federation partner:

```bash
# For each existing instance
for INSTANCE in usa fra gbr deu; do
  terraform workspace select $INSTANCE
  
  # Update tfvars to include ESP
  # Then apply
  terraform apply -var-file=instances/${INSTANCE}.tfvars
done
```

---

## Step 5: Sync Secrets

### 5.1 Upload ESP Secrets

After Terraform creates the federation clients, upload secrets:

```bash
./scripts/vault/upload-federation-secrets.sh --instance=esp
```

### 5.2 Update Existing Partners' Secrets

Existing partners need the new secrets for ESP:

```bash
# Upload secrets from ESP for each existing partner
for INSTANCE in usa fra gbr deu; do
  ./scripts/vault/upload-federation-secrets.sh --instance=$INSTANCE
done
```

### 5.3 Restart All Keycloak Instances

```bash
# Restart to pick up new vault secrets
docker compose -f docker-compose.yml -f docker-compose.vault.yml restart keycloak
docker compose -f docker-compose.fra.yml -f docker-compose.vault.yml restart keycloak-fra
docker compose -f docker-compose.gbr.yml -f docker-compose.vault.yml restart keycloak-gbr
docker compose -f docker-compose.deu.yml -f docker-compose.vault.yml restart keycloak-deu
docker compose -f docker-compose.esp.yml -f docker-compose.vault.yml restart keycloak-esp
```

---

## Step 6: Verify Federation

### 6.1 Run Verification Script

```bash
./scripts/vault/verify-secrets.sh --verbose --test-federation
```

### 6.2 Manual Testing

1. Navigate to `https://esp-app.dive25.com`
2. Click "Login"
3. On the IdP selection page, verify all partners are visible
4. Test login via each federation partner
5. Verify attributes are passed correctly (clearance, country, etc.)

---

## Step 7: Post-Onboarding

### 7.1 Create Test Users

```bash
# Run test user creation script
./scripts/create-test-users.sh --instance=esp
```

### 7.2 Update Documentation

- Add ESP to the federation matrix diagram
- Update status page configuration
- Add to monitoring dashboards

### 7.3 Notify Partners

Send notification to existing partners that ESP is now federated.

---

## Troubleshooting

### Secret Not Found

```
Error: Secret dive-v3-federation-usa-esp not found
```

**Solution**: Run `./scripts/vault/upload-federation-secrets.sh` to upload missing secrets.

### Federation Login Fails (401)

```
ERROR: Invalid client or Invalid client credentials
```

**Solution**: 
1. Verify secrets are synced: `./scripts/vault/verify-secrets.sh`
2. Restart Keycloak: `docker compose restart keycloak-esp`

### Vault Directory Empty

```
[ERROR] Vault directory is empty
```

**Solution**:
1. Check GCP authentication: `gcloud auth list`
2. Verify service account permissions
3. Run sync manually: `INSTANCE=esp ./scripts/vault/sync-secrets-to-files.sh`

---

## Automation Script

For faster onboarding, use the automated script:

```bash
# One-command onboarding (after updating federation-registry.json)
./scripts/onboard-partner.sh esp
```

This script performs all steps automatically:
1. Creates GCP resources
2. Generates Docker Compose file
3. Creates Cloudflare tunnel
4. Applies Terraform
5. Syncs secrets
6. Verifies federation

---

## Appendix: Scaling Considerations

### Current Federation Matrix

With N partners, there are N×(N-1) federation relationships:

| Partners | Secrets | IdP Brokers | Complexity |
|----------|---------|-------------|------------|
| 4 | 12 | 12 | Manageable |
| 5 | 20 | 20 | Manageable |
| 10 | 90 | 90 | Moderate |
| 20 | 380 | 380 | High |

### Recommendations for Large Federations

1. **Hub-Spoke Model**: Designate one instance (USA) as the hub
2. **Automated Onboarding**: Use the scripts in this guide
3. **Secret Rotation**: Implement automated rotation schedules
4. **Monitoring**: Add federation health to monitoring stack

---

## References

- [ADR-001: Vault Secrets Management](./ADR-001-VAULT-SECRETS-MANAGEMENT.md)
- [Federation Registry Schema](../config/federation-registry.schema.json)
- [Keycloak Vault SPI Documentation](https://www.keycloak.org/docs/latest/server_admin/index.html#_vault-administration)

