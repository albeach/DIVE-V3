# KAS Cloud Run Deployment Guide
# ACP-240 Phase 4.3 - Cost-Optimized Production Deployment

**Document Version**: 1.0
**Last Updated**: 2026-01-31
**Target Audience**: DevOps Engineers, Developers

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Initial Setup](#initial-setup)
4. [Deployment Process](#deployment-process)
5. [Configuration](#configuration)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Configuration](#advanced-configuration)
9. [CI/CD Integration](#cicd-integration)
10. [Best Practices](#best-practices)

---

## Overview

### What is This Deployment?

This guide describes deploying the DIVE V3 Key Access Service (KAS) to **Google Cloud Run** with cost-optimized configuration targeting **<$20/month** for pilot phase traffic (<1,000 req/day).

### Key Features

- ✅ **Serverless**: Scale-to-zero when idle (no baseline cost)
- ✅ **Auto-Scaling**: 0-3 instances based on traffic
- ✅ **Cost-Optimized**: In-memory cache and rate limiting
- ✅ **Secure**: FIPS 140-2 Level 3 HSM (GCP Cloud KMS)
- ✅ **Simple**: Minimal operational complexity

### Architecture

```
┌──────────────────────────────────────────┐
│ Cloud Run (kas-usa)                      │
│ - Region: us-central1                    │
│ - Min instances: 0 (scale-to-zero)       │
│ - Max instances: 3                       │
│ - CPU: 1 vCPU                            │
│ - Memory: 512 MB                         │
│ - Timeout: 60s                           │
│ - In-memory cache                        │
│ - In-memory rate limiting                │
└──────────────────────────────────────────┘
            ↓
┌──────────────────────────────────────────┐
│ GCP Cloud KMS                            │
│ - Location: us-central1                  │
│ - Key ring: kas-usa                      │
│ - Key: kas-usa-private-key               │
│ - Algorithm: RSA 4096                    │
└──────────────────────────────────────────┘
```

### Cost Profile

| Component | Cost | Notes |
|-----------|------|-------|
| Cloud Run | $5-10/month | At 1,000 req/day (mostly free tier) |
| GCP KMS | $0.03/10K ops | ~$0.10/month at 1,000 req/day |
| Secrets | Free | Secret Manager (small secrets) |
| Logging | Free tier | Cloud Logging (500 MB/month free) |
| **Total** | **$5-10/month** | **Target: <$20/month achieved** |

---

## Prerequisites

### Required Accounts & Tools

#### 1. GCP Account

- **Project ID**: `dive25` (or your project ID)
- **Billing**: Enabled
- **APIs**: Enabled (see below)

#### 2. Tools Installation

```bash
# Install gcloud CLI (macOS)
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Install gcloud CLI (Linux)
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Verify installation
gcloud version
```

#### 3. Docker

```bash
# Install Docker Desktop (macOS/Windows)
# Download from: https://www.docker.com/products/docker-desktop

# Verify installation
docker --version
```

### GCP Project Setup

#### Enable Required APIs

```bash
# Set project
gcloud config set project dive25

# Enable Cloud Run API
gcloud services enable run.googleapis.com

# Enable Cloud Build API
gcloud services enable cloudbuild.googleapis.com

# Enable Cloud KMS API
gcloud services enable cloudkms.googleapis.com

# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com

# Enable Container Registry API
gcloud services enable containerregistry.googleapis.com

# Verify enabled APIs
gcloud services list --enabled
```

#### Create Service Account

```bash
# Create service account
gcloud iam service-accounts create dive-v3-kas-sa \
  --description="DIVE V3 KAS Service Account" \
  --display-name="KAS Service Account"

# Grant KMS permissions
gcloud projects add-iam-policy-binding dive25 \
  --member="serviceAccount:dive-v3-kas-sa@dive25.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyDecrypter"

gcloud projects add-iam-policy-binding dive25 \
  --member="serviceAccount:dive-v3-kas-sa@dive25.iam.gserviceaccount.com" \
  --role="roles/cloudkms.publicKeyViewer"

# Create service account key
gcloud iam service-accounts keys create kas-sa-key.json \
  --iam-account=dive-v3-kas-sa@dive25.iam.gserviceaccount.com

# Store in Secret Manager
gcloud secrets create dive-v3-kas-credentials \
  --data-file=kas-sa-key.json \
  --replication-policy="automatic"

# Clean up local key
rm kas-sa-key.json
```

#### Create GCP KMS Key

```bash
# Create key ring
gcloud kms keyrings create kas-usa \
  --location=us-central1

# Create crypto key
gcloud kms keys create kas-usa-private-key \
  --location=us-central1 \
  --keyring=kas-usa \
  --purpose=asymmetric-encryption \
  --default-algorithm=rsa-decrypt-oaep-4096-sha256 \
  --protection-level=hsm

# Verify key creation
gcloud kms keys list \
  --location=us-central1 \
  --keyring=kas-usa
```

---

## Initial Setup

### Clone Repository

```bash
# Clone DIVE V3 repository
cd ~/Documents/GitHub
git clone https://github.com/your-org/DIVE-V3.git
cd DIVE-V3/kas

# Verify files
ls -la
# Should see: Dockerfile.cloudrun, cloudbuild.yaml, scripts/deploy-cloudrun.sh
```

### Configure Authentication

```bash
# Authenticate with GCP
gcloud auth login

# Set default project
gcloud config set project dive25

# Configure Docker for GCR
gcloud auth configure-docker

# Verify authentication
gcloud auth list
```

---

## Deployment Process

### Method 1: Automated Deployment (Recommended)

#### Using Deployment Script

```bash
# Navigate to KAS directory
cd /path/to/DIVE-V3/kas

# Make script executable (if not already)
chmod +x scripts/deploy-cloudrun.sh

# Run deployment
./scripts/deploy-cloudrun.sh
```

The script will:
1. ✅ Verify prerequisites (gcloud, docker)
2. ✅ Build Docker image via Cloud Build
3. ✅ Push to Google Container Registry
4. ✅ Deploy to Cloud Run
5. ✅ Configure secrets
6. ✅ Set environment variables
7. ✅ Test health endpoint
8. ✅ Display deployment summary

**Expected Output**:
```
==================================
KAS Cloud Run Deployment
Phase 4.3 - Cost-Optimized
==================================

✓ Prerequisites verified
✓ Cloud Build completed
✓ Secrets configured
✓ Cost-optimized configuration applied
✓ Environment variables set
✓ Service deployed at: https://kas-usa-[hash]-uc.a.run.app
✓ Health check passed

Deployment complete! 🚀
```

### Method 2: Manual Deployment

#### Step 1: Build and Submit

```bash
# Navigate to project root (not kas/ subdirectory)
cd /path/to/DIVE-V3

# Submit Cloud Build
gcloud builds submit \
  --config kas/cloudbuild.yaml \
  --project=dive25
```

#### Step 2: Configure Secrets

```bash
# Mount secret in Cloud Run
gcloud run services update kas-usa \
  --region=us-central1 \
  --set-secrets=GOOGLE_APPLICATION_CREDENTIALS=dive-v3-kas-credentials:latest
```

#### Step 3: Set Environment Variables

```bash
gcloud run services update kas-usa \
  --region=us-central1 \
  --set-env-vars="NODE_ENV=production,\
USE_GCP_KMS=true,\
GCP_PROJECT_ID=dive25,\
GCP_KMS_LOCATION=us-central1,\
GCP_KMS_KEY_RING=kas-usa,\
GCP_KMS_KEY_NAME=kas-usa-private-key,\
CACHE_BACKEND=memory,\
RATE_LIMIT_BACKEND=memory,\
ENABLE_CACHE=true,\
ENABLE_RATE_LIMITING=true,\
LOG_LEVEL=info"
```

#### Step 4: Configure Cost-Optimized Settings

```bash
gcloud run services update kas-usa \
  --region=us-central1 \
  --min-instances=0 \
  --max-instances=3 \
  --cpu=1 \
  --memory=512Mi \
  --timeout=60s \
  --concurrency=10 \
  --no-cpu-throttling \
  --allow-unauthenticated
```

---

## Configuration

### Environment Variables

#### Core Configuration

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Node.js environment |
| `PORT` | `8080` | Cloud Run default port |
| `LOG_LEVEL` | `info` | Logging level |

#### GCP KMS Configuration

| Variable | Value | Description |
|----------|-------|-------------|
| `USE_GCP_KMS` | `true` | Enable GCP KMS |
| `GCP_PROJECT_ID` | `dive25` | GCP project ID |
| `GCP_KMS_LOCATION` | `us-central1` | KMS key location |
| `GCP_KMS_KEY_RING` | `kas-usa` | KMS key ring name |
| `GCP_KMS_KEY_NAME` | `kas-usa-private-key` | KMS key name |

#### Cache Configuration (Cost-Optimized)

| Variable | Value | Description |
|----------|-------|-------------|
| `ENABLE_CACHE` | `true` | Enable caching |
| `CACHE_BACKEND` | `memory` | Use in-memory cache (no Redis) |
| `CACHE_TTL_DEK` | `60` | DEK cache TTL (seconds) |
| `CACHE_TTL_PUBLIC_KEY` | `3600` | Public key cache TTL (seconds) |

#### Rate Limiting (Cost-Optimized)

| Variable | Value | Description |
|----------|-------|-------------|
| `ENABLE_RATE_LIMITING` | `true` | Enable rate limiting |
| `RATE_LIMIT_BACKEND` | `memory` | Use in-memory rate limiting |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (1 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |

### Secrets Management

#### Mounted Secrets

| Secret Name | Path | Description |
|-------------|------|-------------|
| `dive-v3-kas-credentials` | `/secrets/gcp-service-account.json` | GCP service account key (via env var) |

#### Access Secrets

```bash
# List secrets
gcloud secrets list

# View secret versions
gcloud secrets versions list dive-v3-kas-credentials

# Access secret value (for debugging)
gcloud secrets versions access latest --secret=dive-v3-kas-credentials
```

### Resource Allocation

| Resource | Value | Notes |
|----------|-------|-------|
| **Min Instances** | 0 | Scale to zero when idle |
| **Max Instances** | 3 | Limit blast radius |
| **CPU** | 1 vCPU | Sufficient for pilot |
| **Memory** | 512 MB | Adequate for in-memory cache |
| **Timeout** | 60s | Allows federation |
| **Concurrency** | 10 | Requests per instance |

---

## Verification

### Step 1: Check Service Status

```bash
# Get service details
gcloud run services describe kas-usa --region=us-central1

# Get service URL
SERVICE_URL=$(gcloud run services describe kas-usa \
  --region=us-central1 \
  --format="value(status.url)")

echo "Service URL: ${SERVICE_URL}"
```

### Step 2: Test Health Endpoint

```bash
# Basic health check
curl ${SERVICE_URL}/health

# Expected response
{
  "status": "healthy",
  "timestamp": "2026-01-31T12:00:00.000Z",
  "uptime": 123.456,
  "version": "4.3.0"
}
```

### Step 3: Test JWKS Endpoint

```bash
# Public key endpoint
curl ${SERVICE_URL}/.well-known/jwks.json

# Expected response
{
  "keys": [
    {
      "kty": "RSA",
      "use": "enc",
      "kid": "kas-usa",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

### Step 4: Test Rewrap Endpoint (with valid JWT)

```bash
# Rewrap test (requires valid JWT and DPoP)
curl -X POST ${SERVICE_URL}/rewrap \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "DPoP: ${DPOP_PROOF}" \
  -d '{
    "wrappedKey": "base64-encoded-dek",
    "policy": "base64-encoded-policy"
  }'

# Expected response (if authorized)
{
  "unwrappedKey": "base64-encoded-unwrapped-key"
}
```

### Step 5: Check Logs

```bash
# Recent logs
gcloud run services logs read kas-usa \
  --region=us-central1 \
  --limit=50

# Follow logs in real-time
gcloud run services logs tail kas-usa \
  --region=us-central1
```

### Step 6: Verify Cost Optimization

```bash
# Check instance count (should be 0 when idle)
gcloud run services describe kas-usa \
  --region=us-central1 \
  --format="value(spec.template.spec.containers[0].resources.limits)"

# Verify cache backend
gcloud run services describe kas-usa \
  --region=us-central1 \
  --format="value(spec.template.spec.containers[0].env)" | grep CACHE_BACKEND

# Should output: name=CACHE_BACKEND, value=memory
```

---

## Troubleshooting

### Problem: Cloud Build Fails

**Error**: `ERROR: (gcloud.builds.submit) INVALID_ARGUMENT: invalid build`

**Solution**:
```bash
# Verify you're in the correct directory (project root, not kas/)
pwd
# Should be: /path/to/DIVE-V3

# Check cloudbuild.yaml exists
ls kas/cloudbuild.yaml

# Retry with explicit path
gcloud builds submit \
  --config=kas/cloudbuild.yaml \
  --project=dive25
```

### Problem: Service Not Responding

**Error**: `curl: (7) Failed to connect to kas-usa-xxx.run.app port 443`

**Solution**:
```bash
# Check service status
gcloud run services describe kas-usa --region=us-central1

# Check deployment status
gcloud run revisions list --service=kas-usa --region=us-central1

# Check logs for errors
gcloud run services logs read kas-usa \
  --region=us-central1 \
  --log-filter="severity>=ERROR" \
  --limit=50

# Redeploy if necessary
./scripts/deploy-cloudrun.sh
```

### Problem: Authentication Errors

**Error**: `Error: Unable to read credentials from Secret Manager`

**Solution**:
```bash
# Verify secret exists
gcloud secrets describe dive-v3-kas-credentials

# Verify service account has access
gcloud secrets get-iam-policy dive-v3-kas-credentials

# Grant access if needed
gcloud secrets add-iam-policy-binding dive-v3-kas-credentials \
  --member="serviceAccount:dive-v3-kas-sa@dive25.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Update secret binding
gcloud run services update kas-usa \
  --region=us-central1 \
  --set-secrets=GOOGLE_APPLICATION_CREDENTIALS=dive-v3-kas-credentials:latest
```

### Problem: KMS Errors

**Error**: `KMS decrypt failed: Permission denied`

**Solution**:
```bash
# Verify KMS key exists
gcloud kms keys list \
  --location=us-central1 \
  --keyring=kas-usa

# Verify service account has KMS access
gcloud kms keys get-iam-policy kas-usa-private-key \
  --location=us-central1 \
  --keyring=kas-usa

# Grant access if needed
gcloud kms keys add-iam-policy-binding kas-usa-private-key \
  --location=us-central1 \
  --keyring=kas-usa \
  --member="serviceAccount:dive-v3-kas-sa@dive25.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyDecrypter"
```

### Problem: High Costs

**Issue**: Monthly costs >$20

**Diagnosis**:
```bash
# Check request count
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_count" AND resource.labels.service_name="kas-usa"'

# Check KMS operations
gcloud monitoring time-series list \
  --filter='metric.type="cloudkms.googleapis.com/crypto_key/asymmetric_decrypt_request_count"'

# Check cache hit rate
gcloud run services logs read kas-usa \
  --region=us-central1 \
  --log-filter="Cache hit" | grep -c "Cache hit"
```

**Solution**:
1. If traffic >5,000 req/day: Consider adding Redis (see COST-OPTIMIZATION.md)
2. If KMS costs high: Increase cache TTL
3. If unexpected traffic: Review rate limiting

---

## Advanced Configuration

### Enable Redis (when needed)

**Trigger**: Traffic >5,000 req/day OR cache hit rate <70%

```bash
# 1. Create Redis Memorystore
gcloud redis instances create kas-cache \
  --region=us-central1 \
  --tier=basic \
  --size=1 \
  --redis-version=redis_7_0

# 2. Get Redis IP
REDIS_IP=$(gcloud redis instances describe kas-cache \
  --region=us-central1 \
  --format="value(host)")

# 3. Update Cloud Run
gcloud run services update kas-usa \
  --region=us-central1 \
  --set-env-vars="CACHE_BACKEND=redis,REDIS_HOST=${REDIS_IP},RATE_LIMIT_BACKEND=redis"

# Cost: +$13/month
```

### Add Minimum Instance (eliminate cold starts)

**Trigger**: Cold start latency unacceptable

```bash
# Set min instance to 1 (keeps service warm)
gcloud run services update kas-usa \
  --region=us-central1 \
  --min-instances=1

# Cost: +$10/month (container always running)
```

### Increase Resources (performance optimization)

**Trigger**: Memory pressure or high latency

```bash
# Increase memory
gcloud run services update kas-usa \
  --region=us-central1 \
  --memory=1Gi

# Increase CPU
gcloud run services update kas-usa \
  --region=us-central1 \
  --cpu=2

# Increase timeout
gcloud run services update kas-usa \
  --region=us-central1 \
  --timeout=120s
```

### Multi-Region Deployment

**Trigger**: Geographic distribution needed

```bash
# Deploy to europe-west1
gcloud run deploy kas-eur \
  --image=gcr.io/dive25/kas:latest \
  --platform=managed \
  --region=europe-west1 \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=3

# Configure with European KMS key
gcloud run services update kas-eur \
  --region=europe-west1 \
  --set-env-vars="GCP_KMS_LOCATION=europe-west1,GCP_KMS_KEY_RING=kas-eur"

# Cost: +100% (duplicate infrastructure)
```

---

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/deploy-kas.yml`:

```yaml
name: Deploy KAS to Cloud Run

on:
  push:
    branches: [main]
    paths: ['kas/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - id: 'auth'
        uses: 'google-github-actions/auth@v1'
        with:
          credentials_json: '${{ secrets.GCP_SA_KEY }}'

      - name: 'Set up Cloud SDK'
        uses: 'google-github-actions/setup-gcloud@v1'

      - name: 'Submit Cloud Build'
        run: |
          gcloud builds submit \
            --config kas/cloudbuild.yaml \
            --project=dive25

      - name: 'Verify Deployment'
        run: |
          SERVICE_URL=$(gcloud run services describe kas-usa \
            --region=us-central1 \
            --format="value(status.url)")
          curl -f "${SERVICE_URL}/health"
```

### GitLab CI

Create `.gitlab-ci.yml`:

```yaml
deploy-kas:
  stage: deploy
  image: google/cloud-sdk:alpine
  script:
    - echo $GCP_SA_KEY | gcloud auth activate-service-account --key-file=-
    - gcloud config set project dive25
    - gcloud builds submit --config kas/cloudbuild.yaml
  only:
    - main
  changes:
    - kas/**
```

### Manual Trigger

```bash
# Trigger Cloud Build manually
gcloud builds submit \
  --config kas/cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_SERVICE_NAME=kas-usa

# Or use deployment script
cd /path/to/DIVE-V3/kas
./scripts/deploy-cloudrun.sh
```

---

## Best Practices

### 1. Use Secrets Manager

✅ **DO**: Store credentials in Secret Manager
```bash
gcloud secrets create dive-v3-kas-credentials --data-file=key.json
```

❌ **DON'T**: Hardcode secrets in environment variables
```bash
# BAD - Don't do this
gcloud run services update kas-usa --set-env-vars="API_KEY=supersecret"
```

### 2. Enable Logging

✅ **DO**: Use structured logging
```typescript
kasLogger.info('Rewrap successful', { requestId, kid, duration });
```

❌ **DON'T**: Use console.log
```typescript
console.log('Rewrap successful'); // Bad - not structured
```

### 3. Monitor Costs

✅ **DO**: Set up budget alerts
```bash
gcloud billing budgets create --budget-amount=20 --threshold-rule=percent=90
```

❌ **DON'T**: Deploy without cost monitoring

### 4. Test Before Production

✅ **DO**: Test in staging first
```bash
# Deploy to staging
gcloud run deploy kas-staging --image=gcr.io/dive25/kas:test
```

❌ **DON'T**: Deploy directly to production without testing

### 5. Use Tagged Images

✅ **DO**: Use semantic versioning
```bash
gcloud builds submit --substitutions=_TAG=v4.3.0
```

❌ **DON'T**: Always use `latest` tag (makes rollback harder)

### 6. Document Changes

✅ **DO**: Update documentation with changes
```bash
# Update CHANGELOG.md
echo "## [4.3.1] - 2026-02-01\n### Fixed\n- Cache TTL optimization" >> CHANGELOG.md
```

❌ **DON'T**: Make undocumented configuration changes

### 7. Regular Security Updates

✅ **DO**: Update dependencies monthly
```bash
npm audit
npm audit fix
npm test
./scripts/deploy-cloudrun.sh
```

❌ **DON'T**: Ignore security vulnerabilities

---

## Next Steps

### After Initial Deployment

1. ✅ **Monitor for 1 week**
   - Check daily costs (<$0.70/day)
   - Monitor request latency
   - Review logs for errors

2. ✅ **Optimize based on traffic**
   - If >5,000 req/day: Add Redis
   - If cold starts problematic: Add min instance
   - If high latency: Increase CPU/memory

3. ✅ **Set up alerts**
   - Budget alert ($20/month threshold)
   - Error rate alert (>1% threshold)
   - Latency alert (p95 >200ms)

4. ✅ **Document for team**
   - Share service URL
   - Provide access to logs
   - Schedule weekly cost review

### Ongoing Maintenance

- **Weekly**: Review costs and traffic
- **Monthly**: Update dependencies
- **Quarterly**: Rotate service account keys
- **As needed**: Scale infrastructure

---

## Additional Resources

### Documentation

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud KMS Documentation](https://cloud.google.com/kms/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [OPERATIONS-RUNBOOK.md](./OPERATIONS-RUNBOOK.md) - Operations guide
- [COST-OPTIMIZATION.md](./COST-OPTIMIZATION.md) - Cost scaling guide

### Support

- **Cloud Run Issues**: [Google Cloud Support](https://cloud.google.com/support)
- **Project Issues**: GitHub Issues
- **Team Chat**: [Slack Channel]

---

**Document Owner**: DevOps Team
**Review Schedule**: After each deployment
**Last Review**: 2026-01-31
**Next Review**: After pilot phase (Month 3)
