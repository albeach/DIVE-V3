# 🚀 Better Keycloak Setup: Realm Import (10x Faster than Terraform)

## Why Realm Import > Terraform

| Feature | Terraform | Realm Import |
|---------|-----------|-------------|
| **Speed** | 5-10 minutes | 30 seconds |
| **Reliability** | Connection issues | Built-in |
| **Complexity** | 5000+ lines | 1 JSON file |
| **Restart Safe** | Breaks mid-apply | Idempotent |
| **Best For** | Production IaC | Dev/Testing |

## How to Switch to Realm Import

### Step 1: Export Current Configuration

```bash
# Export all realms from running Keycloak
docker exec dive-v3-keycloak /opt/keycloak/bin/kc.sh export \
  --dir /tmp/keycloak-export \
  --users realm_file

# Copy exports to host
docker cp dive-v3-keycloak:/tmp/keycloak-export ./keycloak/imports/
```

### Step 2: Update docker-compose.yml

```yaml
keycloak:
  volumes:
    - ./keycloak/certs:/opt/keycloak/certs:ro
    - ./keycloak/imports:/opt/keycloak/data/import:ro  # ADD THIS
  command: >
    start-dev 
    --import-realm  # ADD THIS FLAG
    --spi-login-protocol-openid-connect-suppress-logout-confirmation-screen=true
    --features=scripts
```

### Step 3: Fresh Start

```bash
# Clean slate
docker-compose down
docker volume rm dive-v3_postgres_data

# Start with import
docker-compose up -d

# Keycloak will automatically import all realms on first start!
```

## Alternative: Use Keycloak Admin API

Even faster for programmatic setup:

```bash
#!/bin/bash
# scripts/seed-keycloak.sh

TOKEN=$(curl -s http://localhost:8081/realms/master/protocol/openid-connect/token \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

# Create realm
curl -X POST http://localhost:8081/admin/realms \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @keycloak/realms/dive-v3-usa.json

# Create user
curl -X POST http://localhost:8081/admin/realms/dive-v3-usa/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser-us",
    "enabled": true,
    "credentials": [{"type": "password", "value": "Password123!", "temporary": false}],
    "attributes": {
      "clearance": ["SECRET"],
      "countryOfAffiliation": ["USA"]
    }
  }'
```

## Recommendation for DIVE V3

1. **Keep Terraform for Production** (Infrastructure as Code)
2. **Use Realm Import for Development** (Fast iteration)
3. **Create seed script** for quick resets

Would you like me to:
- Export your current Terraform-created config to JSON?
- Set up realm import in docker-compose?
- Create a quick seed script?

This will make your dev workflow **10x faster**! 🚀
