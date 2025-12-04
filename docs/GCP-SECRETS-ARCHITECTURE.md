# DIVE V3 - GCP Secrets Architecture

## Overview

DIVE V3 uses **GCP Secret Manager** as the **single source of truth** for all sensitive credentials. This document describes the production-ready, resilient architecture for secrets management.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SECRETS FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────┐                                                     │
│  │  GCP Secret Manager │ ◄── Single Source of Truth                          │
│  │  (dive25 project)   │     All secrets stored here                        │
│  └──────────┬──────────┘                                                     │
│             │                                                                 │
│             │ (1) sync-gcp-secrets.sh fetches at STARTUP TIME                │
│             ▼                                                                 │
│  ┌─────────────────────┐                                                     │
│  │  Shell Environment  │ ◄── Exported as environment variables               │
│  │  (operator session) │     MONGO_PASSWORD, KEYCLOAK_CLIENT_SECRET, etc.   │
│  └──────────┬──────────┘                                                     │
│             │                                                                 │
│             │ (2) docker compose up ──► Uses ${VAR_NAME} substitution        │
│             ▼                                                                 │
│  ┌─────────────────────┐                                                     │
│  │  Container Env Vars │ ◄── Injected by Docker at container start           │
│  │  (MONGODB_URL, etc.)│     process.env.MONGODB_URL available in code      │
│  └──────────┬──────────┘                                                     │
│             │                                                                 │
│             │ (3) Application code reads from process.env                    │
│             ▼                                                                 │
│  ┌─────────────────────┐                                                     │
│  │  Application Code   │ ◄── Uses getMongoDBUrl(), process.env, etc.         │
│  │  (backend, frontend)│     NEVER fetches from GCP directly!               │
│  └─────────────────────┘                                                     │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Principles

### 1. Single Injection Point
Secrets are fetched from GCP **ONCE** at startup via `sync-gcp-secrets.sh`, not at runtime.

```bash
# Correct: Run sync before docker-compose
source ./scripts/sync-gcp-secrets.sh usa
docker compose up -d
```

### 2. Application Code Uses Environment Variables
Application code should **NEVER** call GCP Secret Manager directly. Use the already-injected environment variables.

```typescript
// ✅ CORRECT: Use environment variable via helper
import { getMongoDBUrl } from '../utils/mongodb-config';
const client = new MongoClient(getMongoDBUrl());

// ✅ CORRECT: Direct env var access
const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;

// ❌ WRONG: Fetching from GCP at runtime
const secret = await getSecret('mongodb', 'usa');  // DON'T DO THIS!
```

### 3. Docker Compose Variable Substitution
Docker Compose files use `${VAR_NAME:?error}` syntax to require variables.

```yaml
# docker-compose.yml
environment:
  MONGODB_URL: mongodb://admin:${MONGO_PASSWORD:?Required}@mongo:27017
```

### 4. Required Variable Check
The `:?` syntax in docker-compose ensures the variable exists before starting containers.

```yaml
# Will fail with helpful message if MONGO_PASSWORD is not set
MONGO_PASSWORD: ${MONGO_PASSWORD:?Run source ./scripts/sync-gcp-secrets.sh first}
```

## File Reference

### Secret Storage (GCP)
| Secret Name | Description |
|-------------|-------------|
| `dive-v3-mongodb-usa` | USA MongoDB root password |
| `dive-v3-mongodb-fra` | FRA MongoDB root password |
| `dive-v3-mongodb-gbr` | GBR MongoDB root password |
| `dive-v3-mongodb-deu` | DEU MongoDB root password |
| `dive-v3-keycloak-usa` | USA Keycloak admin password |
| `dive-v3-postgres-usa` | USA PostgreSQL password |
| `dive-v3-auth-secret-usa` | USA NextAuth secret |
| `dive-v3-keycloak-client-secret-usa` | USA Keycloak client secret |
| ... | (same pattern for FRA, GBR, DEU) |

### Script Files
| File | Purpose |
|------|---------|
| `scripts/sync-gcp-secrets.sh` | Fetch secrets from GCP and export as env vars |
| `backend/src/utils/mongodb-config.ts` | Read MONGODB_URL from env |
| `backend/src/utils/gcp-secrets.ts` | **FALLBACK ONLY** - for dev without sync |

### Docker Compose Files
All compose files use variable substitution:
- `docker-compose.yml` (USA)
- `docker-compose.fra.yml` (FRA)
- `docker-compose.gbr.yml` (GBR)
- `docker-compose.deu.yml` (DEU)

## Startup Procedure

### Development
```bash
# 1. Authenticate with GCP
gcloud auth login
gcloud config set project dive25

# 2. Sync secrets (REQUIRED before docker-compose)
source ./scripts/sync-gcp-secrets.sh usa

# 3. Start containers
docker compose -p usa up -d
```

### Production
```bash
# 1. Ensure service account is configured
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa-key.json

# 2. Sync secrets
source ./scripts/sync-gcp-secrets.sh usa

# 3. Start containers (detached, background)
docker compose -p usa up -d
```

### CI/CD Pipeline
```yaml
# Example GitHub Actions workflow
steps:
  - uses: google-github-actions/auth@v2
    with:
      credentials_json: ${{ secrets.GCP_SA_KEY }}
  
  - name: Sync secrets
    run: source ./scripts/sync-gcp-secrets.sh usa
  
  - name: Deploy
    run: docker compose up -d
```

## Why NOT Runtime GCP Calls?

| Approach | Pros | Cons |
|----------|------|------|
| **Startup Sync (Current)** | Fast startup, no GCP dependency after sync, works offline | Requires pre-sync step |
| **Runtime GCP Calls** | No pre-sync needed | Slow startup, GCP outage = app outage, more complex error handling |

The startup sync approach is more resilient because:
1. **No runtime GCP dependency** - if GCP has an outage, running containers keep working
2. **Faster startup** - no network calls during initialization
3. **Simpler code** - `process.env.VAR` vs async secret fetching
4. **Easier debugging** - can inspect env vars with `docker exec ... env`

## Troubleshooting

### Error: "Run source ./scripts/sync-gcp-secrets.sh first"
Docker compose requires environment variables. Run the sync script first.

```bash
source ./scripts/sync-gcp-secrets.sh usa
docker compose up
```

### Error: "Authentication failed" in MongoDB
The MONGODB_URL was not set correctly. Check:
```bash
# Verify env var is set
echo $MONGO_PASSWORD

# Verify it's correct
gcloud secrets versions access latest --secret=dive-v3-mongodb-usa
```

### Error: Module not found in gcp-secrets.ts
The `gcp-secrets.ts` utility is for **fallback only**. Application code should use environment variables, not direct GCP calls.

## Security Notes

1. **Never commit secrets** - `.env` files are in `.gitignore`
2. **Use service accounts in production** - not user credentials
3. **Rotate secrets periodically** - update in GCP, re-sync
4. **Audit access** - GCP logs all secret access
5. **Least privilege** - service accounts should only access needed secrets

## Related Documentation

- [GCP Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [Docker Compose Environment Variables](https://docs.docker.com/compose/environment-variables/)
- Project conventions: `.cursorrules` (search for "SECRETS MANAGEMENT")



