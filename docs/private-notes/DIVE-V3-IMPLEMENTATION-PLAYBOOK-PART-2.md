# DIVE-V3 Phased Implementation Plan — Part 2

**Continued from DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-1.md**

---

## Phase 4: Data-Centric Security Enhancements (ZTDF → OpenTDF-ready)

**Duration**: 7-10 days  
**Owner**: Cryptography Engineer + Backend Developer  
**Risk Level**: HIGH (crypto implementation)

### Goal

Add cryptographic binding for labels/metadata (STANAG 4778), harden KAS with KEK wrapping in HSM/KMS, pilot OpenTDF packaging without breaking changes.

### Inputs

- KAS implementation (`kas/src/server.ts`)
- STANAG 4778 (cryptographic binding spec)
- OpenTDF SDK (https://github.com/opentdf)
- `backend/src/services/resource.service.ts`

### OpenTDF Assessment

**Question**: Is DIVE-V3 ready for OpenTDF adoption?

**Answer**: **PILOT ONLY** (no production mandate)

**Compatibility Analysis**:

| Feature | DIVE-V3 Current | OpenTDF | Gap |
|---------|-----------------|---------|-----|
| **Encryption** | AES-256-GCM | AES-256-GCM | ✅ Compatible |
| **Key Management** | Custom KAS | OpenTDF KAS | ⚠️ Different API |
| **Policy Format** | OPA Rego | XACML + TDF Policy | ⚠️ Conversion needed |
| **Container Format** | Raw encrypted | .tdf (ZIP) | ⚠️ New format |
| **Attribute Source** | Keycloak JWT | Entity Attributes | ⚠️ Mapping needed |
| **Key Wrapping** | None (DEK only) | KEK + DEK | ⚠️ Missing KEK |
| **Splitting** | No | Optional | ⚠️ Not implemented |

**Recommendation**: Pilot `.tdf` packaging **alongside** existing flow (dual-format support)

### Step-by-Step Tasks

#### Task 4.1: Cryptographic Binding for Metadata (STANAG 4778)

**Objective**: Sign policy/labels at seal time, verify on access

**Approach**:
```typescript
// backend/src/services/ztdf-crypto.service.ts

import crypto from 'crypto';
import forge from 'node-forge';

export interface IZTDFMetadata {
  resourceId: string;
  classification: string;
  releasabilityTo: string[];
  COI?: string[];
  policy: object;  // OPA policy or XACML
}

export class ZTDFCryptoService {
  private signingKey: crypto.KeyObject;
  
  /**
   * Sign metadata with RSA-SHA256 (STANAG 4778)
   */
  async signMetadata(metadata: IZTDFMetadata): Promise<string> {
    const canonical = JSON.stringify(metadata, Object.keys(metadata).sort());
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(canonical);
    return sign.sign(this.signingKey, 'base64');
  }
  
  /**
   * Verify metadata signature
   */
  async verifyMetadata(metadata: IZTDFMetadata, signature: string): Promise<boolean> {
    const canonical = JSON.stringify(metadata, Object.keys(metadata).sort());
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(canonical);
    return verify.verify(this.signingKey, signature, 'base64');
  }
  
  /**
   * Wrap DEK with KEK (AES-256 key wrap per RFC 3394)
   */
  async wrapDEK(dek: Buffer, kek: Buffer): Promise<Buffer> {
    const cipher = crypto.createCipheriv('id-aes256-wrap', kek, null);
    return Buffer.concat([cipher.update(dek), cipher.final()]);
  }
  
  /**
   * Unwrap DEK
   */
  async unwrapDEK(wrappedDEK: Buffer, kek: Buffer): Promise<Buffer> {
    const decipher = crypto.createDecipheriv('id-aes256-wrap', kek, null);
    return Buffer.concat([decipher.update(wrappedDEK), decipher.final()]);
  }
}
```

**Integration**:
```typescript
// backend/src/controllers/resource.controller.ts

// Upload endpoint
async function uploadResource(req, res) {
  const { file, classification, releasabilityTo, COI } = req.body;
  
  // 1. Generate DEK
  const dek = crypto.randomBytes(32);
  
  // 2. Encrypt content
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  const encryptedContent = Buffer.concat([cipher.update(file), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // 3. Create metadata
  const metadata: IZTDFMetadata = {
    resourceId: uuidv4(),
    classification,
    releasabilityTo,
    COI,
    policy: { /* OPA policy */ }
  };
  
  // 4. Sign metadata (STANAG 4778)
  const signature = await ztdfCryptoService.signMetadata(metadata);
  
  // 5. Wrap DEK with KEK
  const kek = await getKEKFromKMS();  // From HSM/KMS
  const wrappedDEK = await ztdfCryptoService.wrapDEK(dek, kek);
  
  // 6. Store resource
  await resourceService.create({
    resourceId: metadata.resourceId,
    metadata,
    signature,
    encryptedContent: encryptedContent.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    wrappedDEK: wrappedDEK.toString('base64')
  });
  
  res.json({ resourceId: metadata.resourceId });
}

// Download endpoint (with integrity check)
async function downloadResource(req, res) {
  const { resourceId } = req.params;
  
  // 1. Fetch resource
  const resource = await resourceService.findById(resourceId);
  
  // 2. Verify metadata signature
  const isValid = await ztdfCryptoService.verifyMetadata(
    resource.metadata,
    resource.signature
  );
  
  if (!isValid) {
    return res.status(403).json({ error: 'Metadata integrity violation' });
  }
  
  // 3. OPA decision
  const decision = await opaService.evaluate(req.user, resource.metadata);
  if (!decision.allow) {
    return res.status(403).json({ error: decision.reason });
  }
  
  // 4. Unwrap DEK via KAS
  const kek = await getKEKFromKMS();
  const dek = await ztdfCryptoService.unwrapDEK(
    Buffer.from(resource.wrappedDEK, 'base64'),
    kek
  );
  
  // 5. Decrypt content
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    dek,
    Buffer.from(resource.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(resource.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(resource.encryptedContent, 'base64')),
    decipher.final()
  ]);
  
  res.send(decrypted);
}
```

**DoD**: Metadata signing/verification working, integrity violations denied

#### Task 4.2: KAS Hardening (KEK Wrapping, mTLS)

**Objective**: Store KEKs in HSM/KMS, enforce mTLS for KAS requests

**KEK Management** (using AWS KMS example):
```typescript
// backend/src/services/kms.service.ts

import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from '@aws-sdk/client-kms';

export class KMSService {
  private kmsClient: KMSClient;
  private keyId: string;  // KMS key ID for KEK
  
  /**
   * Generate KEK (or fetch from cache)
   */
  async getKEK(): Promise<Buffer> {
    // In production, fetch from KMS
    const command = new GenerateDataKeyCommand({
      KeyId: this.keyId,
      KeySpec: 'AES_256'
    });
    
    const response = await this.kmsClient.send(command);
    return Buffer.from(response.Plaintext);
  }
  
  /**
   * Encrypt KEK with KMS master key
   */
  async encryptKEK(kek: Buffer): Promise<Buffer> {
    // KMS encrypts automatically in GenerateDataKeyCommand
    // Return CiphertextBlob
    return Buffer.from(response.CiphertextBlob);
  }
}
```

**mTLS Configuration**:
```typescript
// kas/src/server.ts

import https from 'https';
import fs from 'fs';

const server = https.createServer({
  key: fs.readFileSync('/certs/kas-key.pem'),
  cert: fs.readFileSync('/certs/kas-cert.pem'),
  ca: fs.readFileSync('/certs/ca-cert.pem'),
  requestCert: true,  // Require client cert
  rejectUnauthorized: true
}, app);

server.listen(8080);
```

**DoD**: KEKs stored in KMS (or simulated), mTLS enforced

#### Task 4.3: OpenTDF Pilot (PoC)

**Objective**: Generate `.tdf` containers alongside existing encrypted resources

**Install OpenTDF SDK**:
```bash
cd backend
npm install @opentdf/client --save
```

**PoC Implementation**:
```typescript
// backend/src/services/opentdf-pilot.service.ts

import { NanoTDFClient } from '@opentdf/client';

export class OpenTDFPilotService {
  private tdfClient: NanoTDFClient;
  
  /**
   * Seal content as .tdf (pilot mode)
   */
  async sealAsTDF(content: Buffer, policy: object): Promise<Buffer> {
    // Convert OPA policy to OpenTDF policy format
    const tdfPolicy = this.convertOPAToTDFPolicy(policy);
    
    // Seal
    const tdfContainer = await this.tdfClient.encrypt({
      plaintext: content,
      policy: tdfPolicy,
      mimeType: 'application/octet-stream'
    });
    
    return Buffer.from(tdfContainer);
  }
  
  /**
   * Unseal .tdf (pilot mode)
   */
  async unsealTDF(tdfContainer: Buffer): Promise<Buffer> {
    const plaintext = await this.tdfClient.decrypt(tdfContainer);
    return Buffer.from(plaintext);
  }
  
  /**
   * Convert OPA Rego to OpenTDF XACML/TDF policy
   */
  private convertOPAToTDFPolicy(opaPolicy: object): object {
    // Simplified mapping (full conversion is complex)
    return {
      body: {
        dataAttributes: [
          { attribute: 'classification', displayName: 'Classification' },
          { attribute: 'releasabilityTo', displayName: 'Releasability' }
        ],
        dissem: opaPolicy['releasabilityTo'] || []
      }
    };
  }
}
```

**Dual-Format Upload** (no UX change):
```typescript
// backend/src/controllers/resource.controller.ts

async function uploadResource(req, res) {
  // ... existing logic ...
  
  // PILOT: Also create .tdf version
  const tdfContainer = await openTDFPilotService.sealAsTDF(
    req.file.buffer,
    policy
  );
  
  // Store both formats
  await resourceService.create({
    resourceId,
    encryptedContent: encryptedContent.toString('base64'),  // Existing
    tdfContainer: tdfContainer.toString('base64'),  // NEW (pilot)
    // ...
  });
}
```

**DoD**: `.tdf` containers generated, stored alongside existing format, no UX regression

#### Task 4.4: Auditable Key Release Logs

**Objective**: Log all KAS key releases with policy ID, subject, decision

**Schema**:
```typescript
interface IKeyReleaseLog {
  timestamp: string;
  requestId: string;
  resourceId: string;
  subjectUniqueID: string;
  policyEvaluated: string;  // Hash of policy
  decision: 'GRANT' | 'DENY';
  reason: string;
  kekId?: string;
  dekWrapped?: string;  // Redacted, only hash
}
```

**Implementation**:
```typescript
// kas/src/services/key-release.service.ts

async function releaseKey(resourceId: string, subject: IJWTPayload): Promise<Buffer | null> {
  // 1. Fetch resource policy
  const resource = await resourceService.findById(resourceId);
  
  // 2. Re-evaluate policy (defense in depth)
  const decision = await opaService.evaluate(subject, resource.metadata);
  
  // 3. Log decision
  await auditLog.create({
    timestamp: new Date().toISOString(),
    requestId: uuidv4(),
    resourceId,
    subjectUniqueID: subject.uniqueID,
    policyEvaluated: crypto.createHash('sha256').update(JSON.stringify(resource.metadata.policy)).digest('hex'),
    decision: decision.allow ? 'GRANT' : 'DENY',
    reason: decision.reason
  });
  
  // 4. Return key or deny
  if (!decision.allow) {
    return null;
  }
  
  const kek = await kmsService.getKEK();
  const dek = await ztdfCryptoService.unwrapDEK(resource.wrappedDEK, kek);
  return dek;
}
```

**DoD**: All key releases logged with 90-day retention

### Artifacts

| Artifact | Type | Location |
|----------|------|----------|
| ZTDF crypto service | TypeScript | `backend/src/services/ztdf-crypto.service.ts` |
| KMS service | TypeScript | `backend/src/services/kms.service.ts` |
| OpenTDF pilot service | TypeScript | `backend/src/services/opentdf-pilot.service.ts` |
| Updated resource controller | TypeScript | `backend/src/controllers/resource.controller.ts` |
| KAS mTLS certs | PEM | `/certs/kas-*.pem` |
| Key release audit logs | MongoDB | `audit_logs` collection |
| OpenTDF PoC script | TypeScript | `scripts/opentdf-poc.ts` |
| P4 design doc | Markdown | `docs/P4-data-centric-security-design.md` |

### Tests/Checks

```bash
# 1. Metadata signing test
cd backend && npm test -- ztdf-crypto.service.spec.ts

# 2. KEK wrapping test
cd backend && npm test -- kms.service.spec.ts

# 3. OpenTDF PoC
node scripts/opentdf-poc.js

# 4. KAS mTLS test
curl --cert /certs/client-cert.pem --key /certs/client-key.pem \
  https://localhost:8080/request-key \
  -d '{"resourceId":"doc-123","token":"..."}' \
  -H "Content-Type: application/json"

# 5. Integrity violation test
# Tamper with metadata signature, expect 403
```

**Pass Criteria**: 5/5 tests pass

### Definition of Done (DoD)

- [ ] Metadata signing/verification implemented (STANAG 4778)
- [ ] KEK wrapping with KMS (or simulated)
- [ ] mTLS enforced on KAS
- [ ] OpenTDF PoC generates .tdf containers
- [ ] Dual-format storage working
- [ ] Key release audit logs active
- [ ] No UX regression
- [ ] Decrypt test with .tdf succeeds
- [ ] Integrity tampering denied
- [ ] PR approved by crypto expert + 1 reviewer

### Rollback

```bash
# Disable OpenTDF pilot
export ENABLE_OPENTDF_PILOT=false

# Revert to legacy KAS
git checkout HEAD~1 -- kas/src/

# Restart services
docker restart dive-v3-backend dive-v3-kas
```

---

## Phase 5: Terraform Refactors & Provider Hygiene

**Duration**: 4-6 days  
**Owner**: Infrastructure Engineer  
**Risk Level**: MEDIUM

### Goal

Modularize realms/flows/IdPs/mappers, use `for_each` for multi-nation configs, pin provider versions, explicit `depends_on`, secrets hygiene, remote state.

### Inputs

- Current Terraform structure (11 realms, 200+ mappers)
- `terraform/*.tf` (10 realm files, 10 broker files)
- `terraform/modules/` (existing MFA modules)

### Step-by-Step Tasks

#### Task 5.1: Realm Module Creation

**Objective**: DRY pattern for realm creation

**File**: `terraform/modules/realm/main.tf`

```hcl
variable "realm_name" { type = string }
variable "display_name" { type = string }
variable "country_code" { type = string }
variable "enabled" { type = bool, default = false }  # Disable direct login

resource "keycloak_realm" "nation" {
  realm                = var.realm_name
  enabled              = var.enabled
  display_name         = var.display_name
  display_name_html    = "<b>${var.display_name}</b>"
  
  # Security settings
  login_with_email_allowed     = false
  registration_allowed         = false
  reset_password_allowed       = true
  remember_me                  = false
  verify_email                 = true
  ssl_required                 = "all"
  
  # Session settings
  sso_session_idle_timeout     = "15m"
  sso_session_max_lifespan     = "8h"
  offline_session_idle_timeout = "720h"
  
  # Password policy
  password_policy = "length(12) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1)"
  
  # Internationalization
  internationalization_enabled = true
  supported_locales            = ["en", "fr", "de", "es", "it", "nl", "pl"]
  default_locale               = "en"
}

output "realm_id" {
  value = keycloak_realm.nation.id
}

output "realm_name" {
  value = keycloak_realm.nation.realm
}
```

**Usage**:
```hcl
# terraform/usa-realm.tf (simplified)
module "usa_realm" {
  source       = "./modules/realm"
  realm_name   = "dive-v3-usa"
  display_name = "United States (DoD)"
  country_code = "USA"
  enabled      = false  # Broker-only
}
```

**DoD**: 10 nation realms using shared module

#### Task 5.2: IdP Module Consolidation

**Objective**: Single module for OIDC IdPs, another for SAML IdPs

**File**: `terraform/modules/idp-oidc/main.tf`

```hcl
variable "realm_id" { type = string }
variable "idp_alias" { type = string }
variable "display_name" { type = string }
variable "authorization_url" { type = string }
variable "token_url" { type = string }
variable "client_id" { type = string }
variable "client_secret" { type = string, sensitive = true }
variable "post_broker_flow_alias" { type = string }
variable "country_code" { type = string }

resource "keycloak_oidc_identity_provider" "oidc_idp" {
  realm                = var.realm_id
  alias                = var.idp_alias
  display_name         = var.display_name
  enabled              = true
  store_token          = false
  trust_email          = true
  
  authorization_url    = var.authorization_url
  token_url            = var.token_url
  client_id            = var.client_id
  client_secret        = var.client_secret
  
  # Authentication flows
  first_broker_login_flow_alias = "first broker login"
  post_broker_login_flow_alias  = var.post_broker_flow_alias
  
  # Default scopes
  default_scopes = "openid profile email"
}

# Shared mappers
module "mappers" {
  source       = "../shared-mappers"
  realm_id     = var.realm_id
  idp_alias    = keycloak_oidc_identity_provider.oidc_idp.alias
  country_code = var.country_code
}

output "idp_alias" {
  value = keycloak_oidc_identity_provider.oidc_idp.alias
}
```

**Usage**:
```hcl
# terraform/usa-broker.tf (simplified)
module "usa_oidc_idp" {
  source                = "./modules/idp-oidc"
  realm_id              = keycloak_realm.dive_v3_broker.id
  idp_alias             = "usa-realm-broker"
  display_name          = "United States (DoD)"
  authorization_url     = "http://localhost:9082/realms/dive-v3-usa/protocol/openid-connect/auth"
  token_url             = "http://localhost:9082/realms/dive-v3-usa/protocol/openid-connect/token"
  client_id             = "dive-v3-client"
  client_secret         = var.usa_client_secret
  post_broker_flow_alias = module.broker_mfa.post_broker_flow_alias
  country_code          = "USA"
}
```

**DoD**: All OIDC IdPs using shared module, SAML module similar

#### Task 5.3: `for_each` Multi-Nation Loop

**Objective**: Single config for all nations

**File**: `terraform/multi-nation.tf`

```hcl
locals {
  nations = {
    usa = {
      display_name       = "United States (DoD)"
      country_code       = "USA"
      authorization_url  = "http://localhost:9082/realms/dive-v3-usa/protocol/openid-connect/auth"
      token_url          = "http://localhost:9082/realms/dive-v3-usa/protocol/openid-connect/token"
      client_id          = "dive-v3-client"
      client_secret      = var.usa_client_secret
    },
    fra = {
      display_name       = "France (Ministère des Armées)"
      country_code       = "FRA"
      authorization_url  = "http://localhost:8081/realms/dive-v3-fra/protocol/openid-connect/auth"
      token_url          = "http://localhost:8081/realms/dive-v3-fra/protocol/openid-connect/token"
      client_id          = "dive-v3-client"
      client_secret      = var.fra_client_secret
    },
    # ... 8 more nations
  }
}

# Create all nation realms
module "nation_realms" {
  for_each = local.nations
  
  source       = "./modules/realm"
  realm_name   = "dive-v3-${each.key}"
  display_name = each.value.display_name
  country_code = each.value.country_code
  enabled      = false
}

# Create all IdP brokers
module "nation_idps" {
  for_each = local.nations
  
  source                = "./modules/idp-oidc"
  realm_id              = keycloak_realm.dive_v3_broker.id
  idp_alias             = "${each.key}-realm-broker"
  display_name          = each.value.display_name
  authorization_url     = each.value.authorization_url
  token_url             = each.value.token_url
  client_id             = each.value.client_id
  client_secret         = each.value.client_secret
  post_broker_flow_alias = module.broker_mfa.post_broker_flow_alias
  country_code          = each.value.country_code
}
```

**DoD**: Single config creates all 10 realms + IdPs

#### Task 5.4: Provider Version Pinning

**Objective**: Lock provider versions to prevent drift

**File**: `terraform/versions.tf`

```hcl
terraform {
  required_version = ">= 1.13.4"
  
  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "= 5.5.0"  # Exact version lock
    }
  }
}

provider "keycloak" {
  client_id     = "admin-cli"
  username      = var.keycloak_admin_user
  password      = var.keycloak_admin_password
  url           = var.keycloak_url
  initial_login = false
}
```

**DoD**: Provider version locked, `.terraform.lock.hcl` committed

#### Task 5.5: Secrets Management

**Objective**: Sensitive variables, remote state encryption

**File**: `terraform/variables.tf`

```hcl
# Sensitive variables
variable "keycloak_admin_password" {
  type      = string
  sensitive = true
}

variable "usa_client_secret" {
  type      = string
  sensitive = true
}

# ... 9 more client secrets

variable "kms_key_id" {
  description = "KMS key ID for state encryption"
  type        = string
  sensitive   = true
}
```

**Remote State** (S3 example):
```hcl
# terraform/backend.tf

terraform {
  backend "s3" {
    bucket         = "dive-v3-terraform-state"
    key            = "dive-v3/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = var.kms_key_id
    dynamodb_table = "dive-v3-terraform-locks"
  }
}
```

**DoD**: State encrypted, secrets never in plaintext files

#### Task 5.6: Explicit Dependencies

**Objective**: Fix race conditions with `depends_on`

**Example**:
```hcl
resource "keycloak_authentication_execution_config" "config" {
  execution_id = keycloak_authentication_execution.execution.id
  # ...
  
  depends_on = [
    keycloak_authentication_execution.execution,
    keycloak_authentication_subflow.parent
  ]
}
```

**DoD**: No Terraform apply race conditions

### Artifacts

| Artifact | Type | Location |
|----------|------|----------|
| Realm module | Terraform | `terraform/modules/realm/` |
| IdP OIDC module | Terraform | `terraform/modules/idp-oidc/` |
| IdP SAML module | Terraform | `terraform/modules/idp-saml/` |
| Multi-nation config | Terraform | `terraform/multi-nation.tf` |
| Versions file | Terraform | `terraform/versions.tf` |
| Remote state config | Terraform | `terraform/backend.tf` |
| Secrets example | Terraform | `terraform/terraform.tfvars.example` |
| P5 refactor guide | Markdown | `docs/P5-terraform-refactor-guide.md` |

### Tests/Checks

```bash
# 1. Validate syntax
cd terraform && terraform validate

# 2. Format check
terraform fmt -check -recursive

# 3. Plan (expect no changes after refactor)
terraform plan -out=tfplan

# 4. Drift detection
terraform plan -detailed-exitcode  # Exit code 2 = drift

# 5. CI validation
.github/workflows/terraform-ci.yml
```

**Pass Criteria**: Zero drift, zero errors

### Definition of Done (DoD)

- [ ] Realm module created & tested
- [ ] IdP modules (OIDC + SAML) created
- [ ] `for_each` multi-nation config working
- [ ] Provider version pinned (5.5.0)
- [ ] Remote state configured (S3 or equivalent)
- [ ] Secrets in sensitive variables
- [ ] `.tfvars.example` documented
- [ ] Explicit `depends_on` added where needed
- [ ] `terraform validate` passes
- [ ] `terraform plan` shows zero drift
- [ ] PR approved by 2 reviewers

### Rollback

```bash
# Restore previous Terraform configs
git checkout HEAD~1 -- terraform/

# Re-init
terraform init -reconfigure

# Apply old state
terraform apply
```

---

## Phase 6: Audit, Telemetry, & SIEM

**Duration**: 3-5 days  
**Owner**: Security Operations + SRE  
**Risk Level**: LOW

### Goal

Enable Keycloak user/admin events, KAS key-release audit, OPA decision logs with attributes & policy IDs, 90-day retention, SIEM forwarding, anomaly rules.

### Step-by-Step Tasks

#### Task 6.1: Keycloak Event Logging

**Objective**: Enable user & admin events with 90-day retention

**Configuration**:
```bash
# Via Keycloak Admin Console:
# Realm Settings → Events → User Events → Enable
# Save user events: ON
# Expiration: 7776000 seconds (90 days)
# Event Types: LOGIN, LOGOUT, REGISTER, UPDATE_PROFILE, etc.

# Via kcadm.sh:
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update events/config \
  -r dive-v3-broker \
  -s eventsEnabled=true \
  -s eventsExpiration=7776000 \
  -s 'enabledEventTypes=["LOGIN","LOGOUT","REGISTER","UPDATE_PROFILE","UPDATE_PASSWORD","SEND_VERIFY_EMAIL","VERIFY_EMAIL","REMOVE_TOTP","UPDATE_TOTP","FEDERATED_IDENTITY_LINK","REMOVE_FEDERATED_IDENTITY"]'
```

**Admin Events**:
```bash
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update events/config \
  -r dive-v3-broker \
  -s adminEventsEnabled=true \
  -s adminEventsDetailsEnabled=true
```

**DoD**: Events visible in Keycloak Admin Console → Events tab

#### Task 6.2: OPA Decision Logs

**Objective**: Log all decisions with attributes, policy ID, latency

**Schema**:
```json
{
  "timestamp": "2025-10-29T12:34:56.789Z",
  "requestId": "req-abc-123",
  "policyId": "fuel_inventory_abac_policy",
  "subject": {
    "uniqueID": "john.doe@mil",
    "clearance": "SECRET",
    "countryOfAffiliation": "USA",
    "acpCOI": ["NATO-COSMIC"],
    "acr": "AAL2",
    "amr": ["pwd", "otp"],
    "auth_time": 1730217600
  },
  "resource": {
    "resourceId": "doc-456",
    "classification": "SECRET",
    "releasabilityTo": ["USA", "GBR"],
    "COI": ["NATO-COSMIC"]
  },
  "decision": {
    "allow": true,
    "reason": "All checks passed",
    "evaluation_details": {
      "clearance_check": "PASS",
      "releasability_check": "PASS",
      "coi_check": "PASS",
      "aal_check": "PASS",
      "token_lifetime_check": "PASS"
    }
  },
  "latency_ms": 45
}
```

**Implementation**:
```typescript
// backend/src/utils/decision-logger.ts

import { logger } from './logger';
import { IOPAInput, IOPADecision } from '../types/opa.types';

export async function logDecision(
  input: IOPAInput,
  decision: IOPADecision,
  latency: number
): Promise<void> {
  await logger.info('OPA Decision', {
    timestamp: new Date().toISOString(),
    requestId: input.context.requestId,
    policyId: 'fuel_inventory_abac_policy',
    subject: {
      uniqueID: input.subject.uniqueID,
      clearance: input.subject.clearance,
      countryOfAffiliation: input.subject.countryOfAffiliation,
      acpCOI: input.subject.acpCOI,
      acr: input.subject.acr,
      amr: input.subject.amr,
      auth_time: input.subject.auth_time
    },
    resource: {
      resourceId: input.resource.resourceId,
      classification: input.resource.classification,
      releasabilityTo: input.resource.releasabilityTo,
      COI: input.resource.COI
    },
    decision: {
      allow: decision.allow,
      reason: decision.reason,
      evaluation_details: decision.evaluation_details
    },
    latency_ms: latency
  });
}
```

**DoD**: All OPA decisions logged to `logs/decision.log`

#### Task 6.3: KAS Audit Logs

**Objective**: Log all key-release requests with policy re-evaluation

**Schema** (see Phase 4 Task 4.4)

**Integration**:
```typescript
// kas/src/services/audit.service.ts

export async function logKeyRelease(
  resourceId: string,
  subject: IJWTPayload,
  decision: IOPADecision,
  dekReleased: boolean
): Promise<void> {
  await auditLog.create({
    timestamp: new Date().toISOString(),
    requestId: uuidv4(),
    resourceId,
    subjectUniqueID: subject.uniqueID,
    policyEvaluated: crypto.createHash('sha256').update(JSON.stringify(decision)).digest('hex'),
    decision: dekReleased ? 'GRANT' : 'DENY',
    reason: decision.reason,
    latency_ms: decision.latency
  });
}
```

**DoD**: All KAS requests logged to MongoDB `audit_logs` collection

#### Task 6.4: SIEM Forwarding

**Objective**: Forward logs to Splunk/ELK/Datadog

**Approach** (Splunk HEC example):
```typescript
// backend/src/utils/splunk-forwarder.ts

import axios from 'axios';

export async function forwardToSplunk(logEvent: object): Promise<void> {
  try {
    await axios.post(process.env.SPLUNK_HEC_URL, {
      event: logEvent,
      sourcetype: 'dive-v3:decision',
      index: 'dive_v3'
    }, {
      headers: {
        'Authorization': `Splunk ${process.env.SPLUNK_HEC_TOKEN}`
      }
    });
  } catch (error) {
    console.error('Failed to forward to Splunk:', error.message);
  }
}
```

**DoD**: Logs visible in SIEM dashboard

#### Task 6.5: Anomaly Detection Rules

**Objective**: Alert on suspicious patterns

**Rules** (10 detection rules):

| Rule | Description | Threshold | Action |
|------|-------------|-----------|--------|
| **R1: High Deny Rate** | > 20% denials for a user in 1 hour | 20% | Alert |
| **R2: MFA Bypass Attempt** | AAL1 for SECRET+ resource | 1 | Alert + Block |
| **R3: Clearance Escalation** | User clearance changed | 1 | Alert |
| **R4: Releasability Violation** | Country not in releasabilityTo | 5/hour | Alert |
| **R5: Token Expiry Spike** | > 50% expired tokens | 50% | Alert |
| **R6: COI Mismatch** | No COI intersection | 10/hour | Alert |
| **R7: KAS Mismatch** | KAS denies while PDP allowed | 1 | Critical Alert |
| **R8: Brute Force OTP** | > 5 OTP failures in 5 minutes | 5 | Lock account |
| **R9: After-Hours Access** | Access outside 06:00-22:00 UTC | 1 | Alert |
| **R10: Geo-Anomaly** | Login from new country | 1 | Alert |

**Implementation** (SIEM query example):
```splunk
index=dive_v3 sourcetype="dive-v3:decision" decision.allow=false
| stats count by subject.uniqueID
| where count > 5
| eval severity="HIGH"
| table subject.uniqueID count severity
```

**DoD**: 10/10 rules active in SIEM

### Artifacts

| Artifact | Type | Location |
|----------|------|----------|
| Keycloak events config | Script | `scripts/enable-keycloak-events.sh` |
| OPA decision logger | TypeScript | `backend/src/utils/decision-logger.ts` |
| KAS audit service | TypeScript | `kas/src/services/audit.service.ts` |
| Splunk forwarder | TypeScript | `backend/src/utils/splunk-forwarder.ts` |
| SIEM rules | Splunk | `docs/P6-siem-rules.spl` |
| Retention policy | Doc | `docs/P6-audit-retention-policy.md` |

### Tests/Checks

```bash
# 1. Verify Keycloak events enabled
curl -s http://localhost:8081/admin/realms/dive-v3-broker/events/config | jq .eventsEnabled
# Expected: true

# 2. Trigger decision, verify log
curl -X POST http://localhost:4000/api/resources/doc-123 -H "Authorization: Bearer <token>"
tail -f logs/decision.log  # Should show decision entry

# 3. Verify SIEM forwarding
# Check Splunk dashboard for recent events

# 4. Test anomaly rule
# Trigger 6 OTP failures, verify alert
```

**Pass Criteria**: 4/4 tests pass

### Definition of Done (DoD)

- [ ] Keycloak events enabled (user + admin)
- [ ] 90-day retention configured
- [ ] OPA decision logs active
- [ ] KAS audit logs active
- [ ] SIEM forwarding working
- [ ] 10/10 anomaly rules deployed
- [ ] Sample alerts tested
- [ ] Retention policy documented
- [ ] PR approved by security ops

### Rollback

```bash
# Disable Keycloak events (if performance impact)
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update events/config \
  -r dive-v3-broker -s eventsEnabled=false

# Disable SIEM forwarding
export ENABLE_SIEM_FORWARD=false
```

---

## Phase 7: CI/CD Guardrails & Documentation

**Duration**: 3-4 days  
**Owner**: DevOps Engineer  
**Risk Level**: LOW

### Goal

GitHub Actions for fmt/validate/plan, Rego tests, E2E smoke tests, drift detection, runbooks, architecture diagrams.

### Step-by-Step Tasks

#### Task 7.1: Terraform CI Workflow

**File**: `.github/workflows/terraform-ci.yml`

```yaml
name: Terraform CI

on:
  pull_request:
    paths:
      - 'terraform/**'
  push:
    branches: [main]

jobs:
  terraform:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v2
        with:
          terraform_version: 1.13.4
      
      - name: Terraform Format
        run: terraform fmt -check -recursive
        working-directory: ./terraform
      
      - name: Terraform Init
        run: terraform init
        working-directory: ./terraform
      
      - name: Terraform Validate
        run: terraform validate
        working-directory: ./terraform
      
      - name: Terraform Plan
        run: terraform plan -out=tfplan
        working-directory: ./terraform
        env:
          TF_VAR_keycloak_admin_password: ${{ secrets.KEYCLOAK_ADMIN_PASSWORD }}
          TF_VAR_usa_client_secret: ${{ secrets.USA_CLIENT_SECRET }}
      
      - name: Drift Detection
        run: |
          terraform plan -detailed-exitcode
          if [ $? -eq 2 ]; then
            echo "::warning::Terraform drift detected"
          fi
        working-directory: ./terraform
```

**DoD**: Terraform CI passing on all PRs

#### Task 7.2: OPA Test CI

**File**: `.github/workflows/opa-ci.yml`

```yaml
name: OPA Policy Tests

on:
  pull_request:
    paths:
      - 'policies/**'
  push:
    branches: [main]

jobs:
  opa-test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup OPA
        run: |
          curl -L -o opa https://openpolicyagent.org/downloads/v0.68.0/opa_linux_amd64_static
          chmod +x opa
          sudo mv opa /usr/local/bin/
      
      - name: OPA Format Check
        run: opa fmt -l policies/*.rego
      
      - name: OPA Test
        run: opa test policies/ -v
      
      - name: OPA Coverage
        run: |
          opa test policies/ --coverage --format=json > coverage.json
          coverage=$(jq -r '.coverage' coverage.json)
          echo "Coverage: $coverage%"
          if (( $(echo "$coverage < 95" | bc -l) )); then
            echo "::error::Coverage below 95%"
            exit 1
          fi
```

**DoD**: OPA tests run on every policy change

#### Task 7.3: E2E Smoke Tests

**File**: `.github/workflows/e2e-ci.yml`

```yaml
name: E2E Smoke Tests

on:
  pull_request:
  push:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    
    services:
      keycloak:
        image: quay.io/keycloak/keycloak:26.4.2
        ports:
          - 8081:8080
        env:
          KEYCLOAK_ADMIN: admin
          KEYCLOAK_ADMIN_PASSWORD: admin
      
      mongo:
        image: mongo:7.0
        ports:
          - 27017:27017
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install Dependencies
        run: |
          cd frontend && npm ci
          cd ../backend && npm ci
      
      - name: Start Backend
        run: cd backend && npm run dev &
      
      - name: Start Frontend
        run: cd frontend && npm run dev &
      
      - name: Wait for Services
        run: |
          npx wait-on http://localhost:4000/health
          npx wait-on http://localhost:3000
      
      - name: Run E2E Smoke Tests
        run: cd frontend && npm run test:e2e -- --grep "smoke"
```

**DoD**: E2E smoke tests pass on CI

#### Task 7.4: Drift Detection Schedule

**File**: `.github/workflows/drift-detection.yml`

```yaml
name: Terraform Drift Detection

on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM UTC
  workflow_dispatch:

jobs:
  drift:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v2
        with:
          terraform_version: 1.13.4
      
      - name: Terraform Init
        run: terraform init
        working-directory: ./terraform
      
      - name: Detect Drift
        run: |
          terraform plan -detailed-exitcode -out=drift.tfplan
          if [ $? -eq 2 ]; then
            echo "::error::DRIFT DETECTED - Manual intervention required"
            terraform show drift.tfplan
            exit 1
          else
            echo "✅ No drift detected"
          fi
        working-directory: ./terraform
```

**DoD**: Daily drift detection active

#### Task 7.5: Architecture Diagrams

**File**: `docs/P7-architecture-diagrams.md`

**Diagrams**:
1. **Federation Flow**: User → IdP → Keycloak → NextAuth → App
2. **Object Security Flow**: Upload → Encrypt → KAS → Decrypt → Download
3. **ABAC Kernel**: PEP → PDP (OPA) → Attributes (JWT + Resource)
4. **Data Flow**: Keycloak ↔ PostgreSQL, Backend ↔ MongoDB, OPA ↔ Policies
5. **Network Topology**: Docker network, service ports, mTLS

**DoD**: 5 architecture diagrams created

#### Task 7.6: Runbook Creation

**File**: `docs/P7-operational-runbooks.md`

**Runbooks** (10 scenarios):

| Scenario | Steps | Recovery Time |
|----------|-------|---------------|
| **R1: Keycloak Down** | 1. Check logs 2. Restart container 3. Verify health | < 5 min |
| **R2: OPA Down** | 1. Check logs 2. Restart OPA 3. Test decision | < 2 min |
| **R3: MongoDB Down** | 1. Check replica set 2. Restart primary 3. Verify writes | < 10 min |
| **R4: KAS Unreachable** | 1. Check mTLS certs 2. Restart KAS 3. Test key release | < 5 min |
| **R5: MFA Enrollment Failure** | 1. Check OTP secret 2. Reset user credential 3. Re-enroll | < 5 min |
| **R6: Attribute Drift** | 1. Run repair script 2. Verify attributes 3. Re-sync IdP | < 15 min |
| **R7: Terraform Drift** | 1. Run plan 2. Review changes 3. Apply or revert | < 30 min |
| **R8: High Deny Rate** | 1. Check SIEM alerts 2. Review policy 3. Adjust or block | < 10 min |
| **R9: Token Blacklist Full** | 1. Check Redis memory 2. Increase limit 3. Purge expired | < 5 min |
| **R10: Clearance Normalization Error** | 1. Check backend logs 2. Verify mapper 3. Fix mapping | < 10 min |

**DoD**: 10 runbooks documented

### Artifacts

| Artifact | Type | Location |
|----------|------|----------|
| Terraform CI workflow | YAML | `.github/workflows/terraform-ci.yml` |
| OPA CI workflow | YAML | `.github/workflows/opa-ci.yml` |
| E2E CI workflow | YAML | `.github/workflows/e2e-ci.yml` |
| Drift detection workflow | YAML | `.github/workflows/drift-detection.yml` |
| Architecture diagrams | Markdown + PNG | `docs/P7-architecture-diagrams.md` |
| Operational runbooks | Markdown | `docs/P7-operational-runbooks.md` |

### Tests/Checks

```bash
# 1. Run Terraform CI locally
act -W .github/workflows/terraform-ci.yml

# 2. Run OPA CI locally
act -W .github/workflows/opa-ci.yml

# 3. Trigger drift detection manually
gh workflow run drift-detection.yml

# 4. Verify documentation
# Review diagrams and runbooks
```

**Pass Criteria**: All workflows green

### Definition of Done (DoD)

- [ ] Terraform CI workflow created & tested
- [ ] OPA CI workflow created & tested
- [ ] E2E smoke tests in CI
- [ ] Drift detection scheduled (daily)
- [ ] 5 architecture diagrams created
- [ ] 10 runbooks documented
- [ ] All CI badges green
- [ ] PR approved by 2 reviewers

### Rollback

```bash
# Disable workflows (if needed)
git checkout HEAD~1 -- .github/workflows/
```

---

**END OF PART 2**

*Continued in DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-3.md*

