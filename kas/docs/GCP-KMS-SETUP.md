# GCP Cloud KMS Setup Guide

**Phase 4.2.1 Implementation - Production HSM Integration**

This guide provides step-by-step instructions for setting up Google Cloud Key Management Service (KMS) for the DIVE V3 KAS (Key Access Service).

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [GCP KMS Setup](#gcp-kms-setup)
4. [Service Account Configuration](#service-account-configuration)
5. [Environment Configuration](#environment-configuration)
6. [Testing](#testing)
7. [Key Rotation](#key-rotation)
8. [Troubleshooting](#troubleshooting)
9. [Cost Estimation](#cost-estimation)
10. [Security Best Practices](#security-best-practices)

---

## Overview

GCP Cloud KMS provides FIPS 140-2 Level 3 certified key management for production deployments. This replaces the MockHSM used in development environments.

### Why GCP KMS?

- ✅ **FIPS 140-2 Level 3** certified (required for TOP_SECRET data)
- ✅ **Native GCP Integration** - DIVE V3 uses GCP project `dive25`
- ✅ **RSA 4096-bit** asymmetric encryption (ACP-240 requirement)
- ✅ **Multi-region Support** - us-central1 (USA), europe-west1 (FRA), europe-west2 (GBR)
- ✅ **Cloud Audit Logs** - Full audit trail for compliance
- ✅ **Automatic Key Rotation** - 365-day lifecycle support
- ✅ **IAM-based Access Control** - Least privilege principle

### Architecture

```
┌─────────────────┐
│  KAS Service    │
│  (Docker)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ GCP KMS Client  │
│ (SDK)           │
└────────┬────────┘
         │ mTLS
         ▼
┌─────────────────┐       ┌─────────────────┐
│ GCP Cloud KMS   │◄──────┤ Cloud Audit Log │
│ (HSM)           │       │                 │
└─────────────────┘       └─────────────────┘
```

---

## Prerequisites

### 1. GCP Access

- Access to GCP project `dive25`
- Permissions to create KMS resources
- Permissions to create service accounts

### 2. gcloud CLI

```bash
# Install gcloud CLI (if not already installed)
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Authenticate
gcloud auth login
gcloud auth application-default login

# Set project
gcloud config set project dive25
```

### 3. Enable Cloud KMS API

```bash
# Enable the API (if not already enabled)
gcloud services enable cloudkms.googleapis.com --project=dive25

# Verify
gcloud services list --enabled | grep cloudkms
```

---

## GCP KMS Setup

### Step 1: Create Key Rings

Create separate key rings for each KAS instance (USA, FRA, GBR):

```bash
# KAS-USA (us-central1)
gcloud kms keyrings create kas-usa \
  --location=us-central1 \
  --project=dive25

# KAS-FRA (europe-west1)
gcloud kms keyrings create kas-fra \
  --location=europe-west1 \
  --project=dive25

# KAS-GBR (europe-west2)
gcloud kms keyrings create kas-gbr \
  --location=europe-west2 \
  --project=dive25

# Verify
gcloud kms keyrings list --location=us-central1 --project=dive25
gcloud kms keyrings list --location=europe-west1 --project=dive25
gcloud kms keyrings list --location=europe-west2 --project=dive25
```

### Step 2: Create Asymmetric Decrypt Keys

Create RSA 4096-bit keys for asymmetric decryption:

```bash
# KAS-USA Private Key
gcloud kms keys create kas-usa-private-key \
  --keyring=kas-usa \
  --location=us-central1 \
  --purpose=asymmetric-encryption \
  --default-algorithm=rsa-decrypt-oaep-4096-sha256 \
  --project=dive25

# KAS-FRA Private Key
gcloud kms keys create kas-fra-private-key \
  --keyring=kas-fra \
  --location=europe-west1 \
  --purpose=asymmetric-encryption \
  --default-algorithm=rsa-decrypt-oaep-4096-sha256 \
  --project=dive25

# KAS-GBR Private Key
gcloud kms keys create kas-gbr-private-key \
  --keyring=kas-gbr \
  --location=europe-west2 \
  --purpose=asymmetric-encryption \
  --default-algorithm=rsa-decrypt-oaep-4096-sha256 \
  --project=dive25

# Verify
gcloud kms keys list --location=us-central1 --keyring=kas-usa --project=dive25
```

### Step 3: Get Public Keys

Extract public keys for encryption operations:

```bash
# USA Public Key
gcloud kms keys versions get-public-key 1 \
  --key=kas-usa-private-key \
  --keyring=kas-usa \
  --location=us-central1 \
  --output-file=certs/kas-federation/usa/kms-public-key.pem \
  --project=dive25

# FRA Public Key
gcloud kms keys versions get-public-key 1 \
  --key=kas-fra-private-key \
  --keyring=kas-fra \
  --location=europe-west1 \
  --output-file=certs/kas-federation/fra/kms-public-key.pem \
  --project=dive25

# GBR Public Key
gcloud kms keys versions get-public-key 1 \
  --key=kas-gbr-private-key \
  --keyring=kas-gbr \
  --location=europe-west2 \
  --output-file=certs/kas-federation/gbr/kms-public-key.pem \
  --project=dive25
```

---

## Service Account Configuration

### Step 1: Create Service Account

```bash
# Create service account
gcloud iam service-accounts create dive-v3-kas \
  --display-name="DIVE V3 KAS Service Account" \
  --description="Service account for KAS to access Cloud KMS" \
  --project=dive25

# Verify
gcloud iam service-accounts list --project=dive25 | grep dive-v3-kas
```

### Step 2: Grant KMS Permissions

```bash
# Grant decrypt permission to USA key
gcloud kms keys add-iam-policy-binding kas-usa-private-key \
  --keyring=kas-usa \
  --location=us-central1 \
  --member="serviceAccount:dive-v3-kas@dive25.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyDecrypter" \
  --project=dive25

# Grant decrypt permission to FRA key
gcloud kms keys add-iam-policy-binding kas-fra-private-key \
  --keyring=kas-fra \
  --location=europe-west1 \
  --member="serviceAccount:dive-v3-kas@dive25.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyDecrypter" \
  --project=dive25

# Grant decrypt permission to GBR key
gcloud kms keys add-iam-policy-binding kas-gbr-private-key \
  --keyring=kas-gbr \
  --location=europe-west2 \
  --member="serviceAccount:dive-v3-kas@dive25.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyDecrypter" \
  --project=dive25

# Verify permissions
gcloud kms keys get-iam-policy kas-usa-private-key \
  --keyring=kas-usa \
  --location=us-central1 \
  --project=dive25
```

### Step 3: Create and Download Service Account Key

```bash
# Create credentials directory
mkdir -p credentials

# Generate service account key
gcloud iam service-accounts keys create credentials/gcp-service-account.json \
  --iam-account=dive-v3-kas@dive25.iam.gserviceaccount.com \
  --project=dive25

# Verify file created
ls -lh credentials/gcp-service-account.json

# Set proper permissions (read-only for owner)
chmod 400 credentials/gcp-service-account.json
```

**⚠️ SECURITY WARNING**: The service account key file contains sensitive credentials. Never commit it to git!

---

## Environment Configuration

### Step 1: Update .env Files

**Development (.env.local)**:

```bash
# HSM Configuration
USE_GCP_KMS=false  # Use MockHSM in development
KAS_HSM_PROVIDER=mock

# GCP Configuration (for testing)
GCP_PROJECT_ID=dive25
GOOGLE_APPLICATION_CREDENTIALS=./credentials/gcp-service-account.json
```

**Production (.env.production)**:

```bash
# HSM Configuration
USE_GCP_KMS=true  # Enable GCP KMS in production
KAS_HSM_PROVIDER=gcp-kms

# GCP Configuration
GCP_PROJECT_ID=dive25
GCP_KMS_LOCATION=us-central1  # or europe-west1, europe-west2
GCP_KMS_KEY_RING=kas-usa      # or kas-fra, kas-gbr
GCP_KMS_KEY_NAME=kas-usa-private-key
GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/gcp-service-account.json

# KAS Instance ID (determines region/key)
KAS_ID=usa  # or fra, gbr
```

### Step 2: Update Docker Compose

The `docker-compose.3kas.yml` file has been updated with GCP KMS configuration:

```yaml
kas-usa:
  environment:
    - USE_GCP_KMS=false  # Set to true for production
    - GCP_PROJECT_ID=dive25
    - GCP_KMS_LOCATION=us-central1
    - GCP_KMS_KEY_RING=kas-usa
    - GCP_KMS_KEY_NAME=kas-usa-private-key
    - GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/gcp-service-account.json
  volumes:
    - ./credentials:/app/credentials:ro
```

### Step 3: Verify Configuration

```bash
# Test GCP authentication
gcloud auth application-default print-access-token

# Test KMS access
gcloud kms keys describe kas-usa-private-key \
  --keyring=kas-usa \
  --location=us-central1 \
  --project=dive25

# Test decryption (with test ciphertext)
echo "test data" | base64 > test-plaintext.b64
gcloud kms asymmetric-decrypt \
  --key=kas-usa-private-key \
  --keyring=kas-usa \
  --location=us-central1 \
  --ciphertext-file=test-ciphertext.bin \
  --output-file=test-decrypted.txt \
  --project=dive25
```

---

## Testing

### Unit Tests

```bash
cd kas

# Run GCP KMS unit tests
npm test -- src/__tests__/gcp-kms.test.ts

# Run all unit tests
npm test -- src/__tests__/
```

### Integration Tests (with KMS enabled)

```bash
# Start 3-KAS environment with GCP KMS
USE_GCP_KMS=true docker compose -f docker-compose.3kas.yml up -d

# Wait for services to be healthy
./scripts/verify-3kas-health.sh

# Run integration tests
cd kas
npm test -- tests/integration/

# Check KMS operations in logs
docker logs kas-usa | grep "GCP KMS"
```

### Health Check

```bash
# Check KAS health endpoints
curl -k https://localhost:8081/health
curl -k https://localhost:8082/health
curl -k https://localhost:8083/health

# Verify KMS connectivity
docker exec kas-usa node -e "
  const { gcpKmsService } = require('./dist/services/gcp-kms.service');
  gcpKmsService.healthCheck('projects/dive25/locations/us-central1/keyRings/kas-usa/cryptoKeys/kas-usa-private-key')
    .then(healthy => console.log('KMS Health:', healthy ? 'OK' : 'FAIL'));
"
```

---

## Key Rotation

### Automatic Rotation (Recommended)

GCP KMS supports automatic key rotation with a 365-day lifecycle:

```bash
# Enable automatic rotation (365 days)
gcloud kms keys update kas-usa-private-key \
  --keyring=kas-usa \
  --location=us-central1 \
  --rotation-period=365d \
  --next-rotation-time=$(date -u -d "+365 days" +"%Y-%m-%dT%H:%M:%SZ") \
  --project=dive25
```

### Manual Rotation

```bash
# Create new key version
gcloud kms keys versions create \
  --key=kas-usa-private-key \
  --keyring=kas-usa \
  --location=us-central1 \
  --primary \
  --project=dive25

# Verify new version is primary
gcloud kms keys versions list \
  --key=kas-usa-private-key \
  --keyring=kas-usa \
  --location=us-central1 \
  --project=dive25
```

### Rotation via KAS Service

```typescript
// Programmatic rotation
import { gcpKmsService } from './services/gcp-kms.service';

const keyName = 'projects/dive25/locations/us-central1/keyRings/kas-usa/cryptoKeys/kas-usa-private-key';
const newVersion = await gcpKmsService.rotateKey(keyName);

console.log('Key rotated:', newVersion);
```

---

## Troubleshooting

### Issue: Permission Denied

**Symptom**: `PermissionDenied: The caller does not have permission`

**Solution**:
```bash
# Verify service account has correct role
gcloud kms keys get-iam-policy kas-usa-private-key \
  --keyring=kas-usa \
  --location=us-central1 \
  --project=dive25

# Re-add permission if missing
gcloud kms keys add-iam-policy-binding kas-usa-private-key \
  --keyring=kas-usa \
  --location=us-central1 \
  --member="serviceAccount:dive-v3-kas@dive25.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyDecrypter" \
  --project=dive25
```

### Issue: Key Not Found

**Symptom**: `NotFound: CryptoKey not found`

**Solution**:
```bash
# List all keys
gcloud kms keys list --location=us-central1 --keyring=kas-usa --project=dive25

# Recreate key if missing
gcloud kms keys create kas-usa-private-key \
  --keyring=kas-usa \
  --location=us-central1 \
  --purpose=asymmetric-encryption \
  --default-algorithm=rsa-decrypt-oaep-4096-sha256 \
  --project=dive25
```

### Issue: Invalid Credentials

**Symptom**: `Could not load the default credentials`

**Solution**:
```bash
# Re-authenticate
gcloud auth application-default login

# Verify credentials file
cat $GOOGLE_APPLICATION_CREDENTIALS | jq '.type'  # Should be "service_account"

# Check environment variable
echo $GOOGLE_APPLICATION_CREDENTIALS
```

### Issue: Network Connectivity

**Symptom**: `UNAVAILABLE: DNS resolution failed`

**Solution**:
```bash
# Test network connectivity
curl https://cloudkms.googleapis.com

# Check firewall rules
gcloud compute firewall-rules list --project=dive25

# Verify DNS resolution
nslookup cloudkms.googleapis.com
```

### Debug Logging

Enable debug logging for KMS operations:

```bash
# In .env or docker-compose.yml
LOG_LEVEL=debug

# View KMS-specific logs
docker logs kas-usa 2>&1 | grep "GCP KMS"
docker logs kas-usa 2>&1 | grep "KMS"
```

---

## Cost Estimation

### Pricing (as of 2026)

| Operation | Cost per 10,000 ops | Monthly Estimate* |
|-----------|---------------------|-------------------|
| Asymmetric Decrypt | $0.30 | $9.00 |
| Get Public Key | $0.00 (free) | $0.00 |
| Key Storage | $0.06/key/month | $0.18 (3 keys) |
| Key Version Storage | $0.06/version/month | $0.18 (3 versions) |

*Assumes 300,000 decrypt operations per month (10,000/day)

### Cost Optimization

1. **Cache Public Keys**: Public key fetches are free, but cache to reduce API calls
2. **Use DEK Caching**: Cache unwrapped DEKs for 60s to reduce KMS calls
3. **Monitor Usage**: Use Cloud Monitoring to track KMS operation counts
4. **Set Budget Alerts**: Configure billing alerts for unexpected usage

### Monitoring

```bash
# View KMS metrics in Cloud Console
https://console.cloud.google.com/monitoring/dashboards?project=dive25

# Query KMS operations
gcloud logging read "resource.type=cloudkms_cryptokey" \
  --limit=100 \
  --project=dive25

# Check audit logs
gcloud logging read "protoPayload.serviceName=cloudkms.googleapis.com" \
  --limit=100 \
  --format=json \
  --project=dive25
```

---

## Security Best Practices

### 1. Least Privilege

- ✅ Grant only `roles/cloudkms.cryptoKeyDecrypter` (not admin)
- ✅ Use separate service accounts for each KAS instance
- ✅ Limit IAM bindings to specific keys

### 2. Credential Management

- ✅ Store service account keys in GCP Secret Manager (not in containers)
- ✅ Rotate service account keys every 90 days
- ✅ Use Workload Identity in GKE (avoid service account keys)
- ✅ Never commit credentials to Git (use `.gitignore`)

### 3. Audit Logging

- ✅ Enable Cloud Audit Logs for KMS
- ✅ Monitor for unusual activity
- ✅ Set up alerts for failed decrypt attempts
- ✅ Export logs to Cloud Storage for long-term retention

### 4. Network Security

- ✅ Use VPC Service Controls to restrict KMS access
- ✅ Enable Private Google Access
- ✅ Firewall rules to allow only KAS egress to KMS

### 5. Key Lifecycle

- ✅ Enable automatic key rotation (365 days)
- ✅ Keep at least 2 key versions (current + previous)
- ✅ Test key rotation in staging before production
- ✅ Document key rotation procedures

---

## Additional Resources

- [GCP Cloud KMS Documentation](https://cloud.google.com/kms/docs)
- [FIPS 140-2 Compliance](https://cloud.google.com/security/compliance/fips-140-2-validated)
- [ACP-240 KAS Specification](../ACP240-KAS.md)
- [KAS Implementation Summary](../IMPLEMENTATION-SUMMARY.md)

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-31  
**Author**: DIVE V3 Team  
**Phase**: 4.2.1 - Production HSM Integration
