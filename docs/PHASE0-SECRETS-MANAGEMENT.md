# Secrets Management for DIVE V3 Pilot

**Document Type:** Operational Guide  
**Audience:** DevOps, System Administrators  
**Phase:** Phase 0 - Hardening & Observability  
**Status:** Pilot/Proof-of-Concept

---

## Overview

This document describes the **simplified secrets management approach** for the DIVE V3 pilot. For a pilot/proof-of-concept deployment, we use environment variables with clear documentation rather than implementing a full secrets management solution like HashiCorp Vault.

**⚠️ IMPORTANT:** This approach is suitable **only for pilot/development environments**. For production deployment, migrate to a proper secrets management solution (see "Production Migration Path" below).

---

## Current Approach (Pilot)

### Environment Variables

All sensitive credentials are stored in `.env` files (NOT committed to git).

**File Structure:**
```
dive-v3/
├── backend/.env                 # Backend secrets
├── frontend/.env.local          # Frontend secrets
├── backend/.env.example         # Template (committed to git)
└── frontend/.env.local.example  # Template (committed to git)
```

### Required Secrets

#### **Backend (.env)**

```bash
# Keycloak Admin Credentials
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=<CHANGE_ME>

# Keycloak Client Secret (for NextAuth)
KEYCLOAK_CLIENT_SECRET=<GENERATED_BY_TERRAFORM>

# MongoDB Credentials
MONGODB_URL=mongodb://admin:<CHANGE_ME>@mongo:27017

# JWT Verification (auto-fetched from Keycloak JWKS)
KEYCLOAK_JWKS_URI=http://keycloak:8080/realms/dive-v3-pilot/protocol/openid-connect/certs

# OPA (no auth for pilot)
OPA_URL=http://opa:8181

# Auth0 (optional - for MCP integration)
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=<CHANGE_ME>
AUTH0_CLIENT_SECRET=<CHANGE_ME>
AUTH0_MCP_ENABLED=false
```

#### **Frontend (.env.local)**

```bash
# NextAuth.js Configuration
AUTH_SECRET=<GENERATE_WITH: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<SAME_AS_AUTH_SECRET>

# Keycloak Configuration
KEYCLOAK_BASE_URL=http://localhost:8081
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=dive-v3-pilot
KEYCLOAK_CLIENT_ID=dive-v3-client
KEYCLOAK_CLIENT_SECRET=<SAME_AS_BACKEND>

# Backend API
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

---

## Setup Instructions

### 1. Generate Secrets

```bash
# Generate AUTH_SECRET
openssl rand -base64 32

# Generate MongoDB password (or use simple password for pilot)
openssl rand -base64 16

# Generate Keycloak client secret (done by Terraform)
cd terraform
terraform apply
# Copy client_secret from output
```

### 2. Create Environment Files

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env and fill in generated secrets

# Frontend
cd frontend
cp .env.local.example .env.local
# Edit .env.local and fill in generated secrets
```

### 3. Verify Secrets Loaded

```bash
# Start services
docker-compose up -d

# Check backend can connect to Keycloak
docker logs dive-v3-backend | grep "Keycloak"

# Check frontend can authenticate
curl http://localhost:3000/api/auth/session
```

---

## Security Best Practices (Pilot)

### ✅ DO

1. **Never commit `.env` files to git**
   - Verify `.gitignore` includes: `**/.env`, `**/.env.local`
   - Check git history: `git log --all --full-history -- "**/.env*"`

2. **Rotate secrets after demos**
   - Change passwords after showing to external parties
   - Regenerate `AUTH_SECRET` monthly

3. **Use strong passwords**
   - Minimum 16 characters
   - Use password generator: `openssl rand -base64 24`

4. **Limit access to `.env` files**
   - Set permissions: `chmod 600 .env`
   - Only DevOps team has access

5. **Document who has secrets**
   - Maintain list in internal wiki
   - Revoke access when team members leave

### ❌ DON'T

1. **Don't hardcode secrets in code**
   - Always use `process.env.SECRET_NAME`
   - Never: `const password = "admin123"`

2. **Don't share secrets via email/Slack**
   - Use 1Password/LastPass shared vaults
   - Or encrypted files with GPG

3. **Don't use default passwords**
   - Change Keycloak admin/admin
   - Change MongoDB admin password

4. **Don't expose `.env` via web server**
   - Verify Nginx/Apache blocks `.env` files
   - Test: `curl http://localhost:3000/.env` → should 404

5. **Don't log secrets**
   - Verify logs don't contain passwords
   - Check: `grep -r "password" logs/`

---

## Secrets Inventory

| **Secret** | **Used By** | **Rotation Frequency** | **Access Level** |
|-----------|------------|------------------------|------------------|
| `KEYCLOAK_ADMIN_PASSWORD` | Backend, Terraform | Monthly | DevOps only |
| `KEYCLOAK_CLIENT_SECRET` | Backend, Frontend | After demos | DevOps only |
| `AUTH_SECRET` | Frontend (NextAuth) | Monthly | DevOps only |
| `MONGODB_URL` (password) | Backend, KAS | Monthly | DevOps only |
| `AUTH0_CLIENT_SECRET` | Backend (optional) | After demos | DevOps only |

---

## Incident Response

### If Secrets Are Compromised

1. **Immediate Actions (< 15 minutes)**
   ```bash
   # Stop all services
   docker-compose down
   
   # Rotate Keycloak admin password
   docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh \
     update users/<user-id> -r master \
     -s 'credentials=[{"type":"password","value":"NEW_PASSWORD"}]'
   
   # Rotate MongoDB password
   docker exec dive-v3-mongo mongosh admin \
     --eval 'db.changeUserPassword("admin", "NEW_PASSWORD")'
   
   # Regenerate AUTH_SECRET
   openssl rand -base64 32 > new_auth_secret.txt
   ```

2. **Update Configuration (< 30 minutes)**
   ```bash
   # Update backend/.env
   sed -i '' 's/KEYCLOAK_ADMIN_PASSWORD=.*/KEYCLOAK_ADMIN_PASSWORD=NEW_PASSWORD/' backend/.env
   sed -i '' 's/MONGODB_URL=.*/MONGODB_URL=mongodb:\/\/admin:NEW_PASSWORD@mongo:27017/' backend/.env
   
   # Update frontend/.env.local
   sed -i '' 's/AUTH_SECRET=.*/AUTH_SECRET=NEW_AUTH_SECRET/' frontend/.env.local
   
   # Restart services
   docker-compose up -d
   ```

3. **Verify Recovery (< 45 minutes)**
   ```bash
   # Test authentication
   curl -X POST http://localhost:4000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser-us","password":"Password123!"}'
   
   # Verify admin access
   curl http://localhost:4000/api/admin/idps \
     -H "Authorization: Bearer $NEW_ADMIN_TOKEN"
   ```

4. **Post-Incident (< 24 hours)**
   - Review access logs: `grep "401\|403" logs/app.log`
   - Document incident in `docs/INCIDENTS.md`
   - Update team on new secrets via secure channel

---

## Production Migration Path

When transitioning from pilot to production, migrate to HashiCorp Vault or AWS Secrets Manager:

### Option 1: HashiCorp Vault

```bash
# Add to docker-compose.yml
vault:
  image: hashicorp/vault:1.15
  environment:
    VAULT_DEV_ROOT_TOKEN_ID: ${VAULT_TOKEN}
  ports:
    - "8200:8200"

# Migrate secrets
vault kv put secret/dive-v3/keycloak \
  admin_password=$KEYCLOAK_ADMIN_PASSWORD \
  client_secret=$KEYCLOAK_CLIENT_SECRET

# Update backend to fetch from Vault
// backend/src/utils/secrets.ts
import vault from 'node-vault';

export async function getSecret(path: string) {
  const client = vault({ endpoint: process.env.VAULT_ADDR });
  const result = await client.read(`secret/data/dive-v3/${path}`);
  return result.data.data;
}
```

### Option 2: AWS Secrets Manager

```bash
# Store secrets
aws secretsmanager create-secret \
  --name dive-v3/keycloak/admin \
  --secret-string '{"password":"CHANGE_ME"}'

# Update backend
// backend/src/utils/secrets.ts
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export async function getSecret(secretName: string) {
  const client = new SecretsManagerClient({ region: "us-east-1" });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return JSON.parse(response.SecretString);
}
```

**Migration Timeline:** 1-2 weeks  
**Effort:** Medium  
**Priority:** High for production deployment

---

## Compliance Notes

### GDPR / Data Protection

- **PII in logs:** Verified that passwords are NOT logged
- **Encryption at rest:** MongoDB uses encrypted volumes (production only)
- **Encryption in transit:** All secrets transmitted over TLS (Keycloak HTTPS)

### ACP-240 (NATO Access Control)

- **Audit trail:** All secret rotations logged to `logs/authz.log`
- **Access control:** Only super_admin role can view/modify secrets
- **Separation of duties:** 2-person rule for production secrets (future)

### STANAG 4774 (NATO Labeling)

- **Classification:** All secrets treated as "CONFIDENTIAL" minimum
- **Releasability:** USA/GBR/CAN/FRA/DEU personnel with clearance
- **Storage:** Secrets stored in encrypted volumes (production)

---

## FAQ

**Q: Why not use Vault for the pilot?**  
A: For a small-scale pilot with <10 users, environment variables provide sufficient security with minimal overhead. Vault adds complexity that would slow pilot iteration.

**Q: How do I share secrets with a new developer?**  
A: Use 1Password shared vault or encrypted email (GPG). Never send via Slack/plain email.

**Q: Can I use the same secrets for dev and production?**  
A: **NO.** Production must use entirely separate secrets. Use naming convention: `KEYCLOAK_ADMIN_PASSWORD_DEV` vs `KEYCLOAK_ADMIN_PASSWORD_PROD`.

**Q: How do I know if secrets leaked?**  
A: Search GitHub: `"dive-v3" "KEYCLOAK_ADMIN_PASSWORD"` or use [GitLeaks](https://github.com/gitleaks/gitleaks) scanner.

**Q: What if I accidentally committed `.env` to git?**  
A: Immediately rotate ALL secrets, then remove from git history:
```bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch backend/.env" \
  --prune-empty --tag-name-filter cat -- --all
```

---

## Monitoring & Alerts

### Recommended Alerts (Future)

1. **Secret Age Alert:** Trigger if secret >90 days old
2. **Failed Auth Alert:** >10 failures in 5min → possible brute force
3. **Unusual Access:** Admin login from new IP/country
4. **Secret Exposure:** GitHub/GitLab webhook on `.env` commit

**Setup:** Use Grafana alerting (Phase 0) or PagerDuty (production).

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-10-15 | Initial secrets documentation for pilot | AI Assistant |

---

**Document Owner:** DevOps Lead  
**Review Frequency:** Monthly  
**Next Review:** 2025-11-15

