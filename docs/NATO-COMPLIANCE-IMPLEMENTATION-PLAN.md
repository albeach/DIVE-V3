# NATO ACP-240 & ADatP-5663 Compliance Implementation Plan

**Project:** DIVE V3 - Coalition ICAM Platform  
**Plan Version:** 1.0  
**Date:** November 4, 2025  
**Target Completion:** February 2026 (13 weeks)  
**Owner:** DIVE V3 Development Team

---

## EXECUTIVE SUMMARY

This implementation plan details the phased approach to achieve full compliance with **NATO ACP-240 (Data-Centric Security)** and **ADatP-5663 (Identity, Credential and Access Management)** standards in the DIVE V3 platform.

### Compliance Baseline (November 4, 2025)

| Standard | Current Compliance | Target | Gap |
|----------|-------------------|--------|-----|
| **ACP-240** | 90% | 100% | -10% |
| **ADatP-5663** | 63% | 98% | -35% |

### Implementation Approach

**Strategy:** Phased implementation prioritizing quick wins, then critical infrastructure, followed by advanced features

**Phases:**
1. **Quick Wins** (2 weeks) - Low effort, high impact improvements
2. **Federation Infrastructure** (3 weeks) - Metadata management, delegation, attribute caching
3. **PKI & Revocation** (3 weeks) - Enterprise PKI integration, identity lifecycle
4. **Attribute Authority** (3 weeks) - External AA service, attribute signing
5. **Conformance Testing** (2 weeks) - NATO ICAM Test Framework, compliance reports

**Total Duration:** 13 weeks (November 2025 - February 2026)

**Resources Required:**
- 1 Full-time Backend Developer
- 0.5 FTE DevOps Engineer
- 0.25 FTE Security Architect (consulting)
- External: Enterprise PKI coordination, LDAP/AD access

**Budget Estimate:** $80,000 - $100,000 (labor + external dependencies)

---

## PHASE 1: QUICK WINS

**Duration:** 2 weeks (November 4-15, 2025)  
**Effort:** 13 working days  
**Compliance Improvement:** +10% ADatP-5663

### Objectives

- Achieve early compliance wins with minimal effort
- Demonstrate momentum to stakeholders
- Build foundation for subsequent phases

### Tasks

#### Task 1.1: Enable Metadata Signing

**Owner:** DevOps Engineer  
**Effort:** 1 day  
**Priority:** High  
**Dependencies:** None

**Description:**  
Enable SAML metadata signing for all IdP brokers in the `dive-v3-broker` realm.

**Implementation Steps:**
1. Update Terraform configuration for all 10 IdP brokers
2. Set `sign_service_provider_metadata = true` in `terraform/idp-brokers/*.tf`
3. Apply Terraform changes
4. Verify signature in exported SAML metadata

**Deliverables:**
- ✅ Updated Terraform: `terraform/idp-brokers/*.tf`
- ✅ Signed SAML metadata for all brokers

**Acceptance Criteria:**
- [ ] All 10 IdP brokers have metadata signing enabled
- [ ] Exported SAML metadata contains valid `<ds:Signature>` element
- [ ] Signature verification successful using realm signing key

**Testing:**
```bash
# Export SAML metadata
curl http://localhost:8081/realms/dive-v3-broker/broker/usa-realm-broker/endpoint/descriptor

# Verify signature
xmlsec1 --verify --pubkey-cert-pem certs/realm-signing.crt metadata.xml
```

---

#### Task 1.2: Configure ACR/LoA Mapping (Step-Up Authentication)

**Owner:** Backend Developer  
**Effort:** 2 days  
**Priority:** High  
**Dependencies:** None

**Description:**  
Configure Authentication Context Class Reference (ACR) to Level of Authentication (LoA) mapping to enable step-up authentication based on SP-requested AAL.

**Implementation Steps:**

1. **Configure ACR to LoA Mapping (Day 1)**
   - Keycloak Admin Console → Realm Settings → Login → ACR to LoA Mapping
   - Define mappings:
     ```
     LoA 1 → acr=0 (AAL1: password only)
     LoA 2 → acr=1 (AAL2: password + OTP)
     LoA 3 → acr=2 (AAL3: password + WebAuthn)
     ```
   - Terraform: Create `terraform/modules/realm-mfa/acr-loa-mapping.tf`

2. **Configure Max Age for Each LoA (Day 1)**
   - Update authentication flows with Max Age settings:
     - **LoA 1 (AAL1):** 28800 seconds (8 hours)
     - **LoA 2 (AAL2):** 1800 seconds (30 minutes)
     - **LoA 3 (AAL3):** 0 seconds (always re-authenticate)
   - Terraform: Update `terraform/modules/realm-mfa/flows.tf`

3. **Test Step-Up Scenarios (Day 2)**
   - Test 1: User authenticated with LoA 1, request LoA 2 → Should prompt for OTP
   - Test 2: User authenticated with LoA 2 (valid), request LoA 2 → Should auto-succeed
   - Test 3: User authenticated with LoA 2 (expired), request LoA 2 → Should re-prompt
   - Test 4: Request LoA 3 when WebAuthn not configured → Should return error

4. **Frontend Integration (Day 2)**
   - Update NextAuth to request ACR based on resource classification
   - Example: Accessing TOP_SECRET resource → request `acr_values=2`
   - Verify ACR claim in returned token

**Deliverables:**
- ✅ `terraform/modules/realm-mfa/acr-loa-mapping.tf`
- ✅ Updated `terraform/modules/realm-mfa/flows.tf` with Max Age settings
- ✅ `frontend/src/lib/auth.ts` - ACR request logic
- ✅ Test suite: Step-up authentication scenarios

**Acceptance Criteria:**
- [ ] ACR to LoA mapping configured in all 11 realms
- [ ] Max Age configured for each LoA level
- [ ] Frontend requests ACR based on resource classification
- [ ] ID tokens contain `acr` claim matching requested level
- [ ] Step-up authentication works (LoA 1 → LoA 2 → LoA 3)
- [ ] Error returned when requested AAL cannot be satisfied

**Testing:**
```bash
# Test step-up authentication
./scripts/test-step-up-auth.sh

# Expected flow:
# 1. Login with password only → acr=0
# 2. Request TOP_SECRET resource (requires acr=2)
# 3. Keycloak prompts for WebAuthn
# 4. After WebAuthn → Token with acr=2
```

---

#### Task 1.3: Configure Pairwise Subject Identifiers

**Owner:** Backend Developer  
**Effort:** 2 days  
**Priority:** Medium  
**Dependencies:** None

**Description:**  
Implement pseudonymization using pairwise subject identifiers for industry partners.

**Implementation Steps:**

1. **Create Pseudonymization Client Scope (Day 1)**
   - Create client scope: `pseudonymous-subject`
   - Add protocol mapper: "Pairwise subject identifier"
   - Configuration:
     - **Mapper Type:** `oidc-sha256-pairwise-sub-mapper`
     - **Sector Identifier URI:** `https://dive-v3.example.com/industry`
     - **Salt:** Generate cryptographically secure salt

2. **Assign to Industry Client (Day 1)**
   - Assign `pseudonymous-subject` scope to `dive-v3-industry-client`
   - Test: Verify different `sub` claim for industry vs. national users

3. **Define Sector Groups (Day 1)**
   - Group clients by organization:
     - Sector 1: National IdPs (USA, FRA, CAN, etc.) → Real `uniqueID`
     - Sector 2: Industry partners → Pseudonymous `sub`
   - Document sector assignments

4. **Create Pseudonym Resolution Procedure (Day 2)**
   - Document how to map pseudonym back to real user for incident response
   - Admin procedure: User → Sessions → View federated identity tokens
   - **Deliverable:** `docs/PSEUDONYMIZATION-RESOLUTION.md`

5. **Testing (Day 2)**
   - Test: Same user, different clients → Different pseudonyms
   - Test: Same sector → Same pseudonym
   - Test: Pseudonym resolution (map back to real user)

**Deliverables:**
- ✅ `terraform/modules/pseudonymization/pairwise-mappers.tf`
- ✅ `docs/PSEUDONYMIZATION-RESOLUTION.md`
- ✅ Test suite: Pseudonym generation and mapping

**Acceptance Criteria:**
- [ ] Pairwise subject identifiers configured for industry client
- [ ] Different pseudonyms generated per client
- [ ] Same pseudonym within sector
- [ ] Master identifier (username) retained in Keycloak database
- [ ] Pseudonym resolution procedure documented and tested

---

#### Task 1.4: Integrate Spain SAML IdP

**Owner:** Backend Developer + DevOps Engineer  
**Effort:** 3 days  
**Priority:** High  
**Dependencies:** Spain SAML IdP metadata availability

**Description:**  
Integrate the external Spain SAML IdP to demonstrate multi-protocol federation (SAML → Keycloak → OIDC).

**Implementation Steps:**

1. **Import Spain SAML Metadata (Day 1)**
   - Obtain SAML metadata from `external-idps/spain-saml/metadata.xml`
   - Keycloak Admin Console → Identity Providers → Add provider → SAML v2.0
   - Import metadata file
   - Verify issuer, endpoints, certificates

2. **Configure SAML IdP Broker (Day 1)**
   - Alias: `spain-saml-broker`
   - Display Name: "Spain (Ministry of Defense)"
   - Enable: `Want AuthnRequests Signed`, `Want Assertions Signed`
   - Signature Algorithm: RSA_SHA256
   - **Terraform:** `terraform/idp-brokers/spain-saml-broker.tf`

3. **Create Attribute Mappers (Day 2)**
   - Map SAML assertions to DIVE attributes:
     - SAML `urn:oid:0.9.2342.19200300.100.1.1` (uid) → `uniqueID`
     - SAML `urn:oid:2.5.4.4` (sn) → `surname`
     - SAML `urn:oid:2.5.4.42` (givenName) → `givenName`
     - SAML `clearance` (custom) → `clearance` (with transformation)
     - SAML `nationality` → `countryOfAffiliation` (hardcode "ESP")
   - **Terraform:** `terraform/modules/attribute-transcription/spain-saml-mappers.tf`

4. **Test SAML → OIDC Flow (Day 3)**
   - E2E test: Login via Spain SAML IdP → Keycloak broker → DIVE frontend (OIDC)
   - Verify attribute mapping (SAML assertions → OIDC claims)
   - Verify token contains DIVE attributes
   - Performance test: Latency of SAML → OIDC protocol bridging

**Deliverables:**
- ✅ `terraform/idp-brokers/spain-saml-broker.tf`
- ✅ `terraform/modules/attribute-transcription/spain-saml-mappers.tf`
- ✅ Test suite: SAML federation scenarios
- ✅ `docs/SAML-IDP-ONBOARDING.md` - SAML onboarding guide

**Acceptance Criteria:**
- [ ] Spain SAML IdP integrated as broker in `dive-v3-broker` realm
- [ ] SAML metadata imported and validated
- [ ] Attribute mappers configured for DIVE attributes
- [ ] E2E test: SAML user can authenticate to DIVE frontend
- [ ] OIDC tokens contain mapped DIVE attributes
- [ ] Protocol bridging latency <500ms (p95)

---

#### Task 1.5: Add Clearance Transformation Mappers

**Owner:** Backend Developer  
**Effort:** 2 days  
**Priority:** Medium  
**Dependencies:** Task 1.4 (Spain SAML IdP)

**Description:**  
Implement clearance level transformation for country-specific clearance values.

**Implementation Steps:**

1. **Define Clearance Mappings (Day 1)**
   - Create mapping table:
     ```
     France:
       TRES_SECRET_DEFENSE → TOP_SECRET
       SECRET_DEFENSE → SECRET
       CONFIDENTIEL_DEFENSE → CONFIDENTIAL
       DIFFUSION_RESTREINTE → UNCLASSIFIED
     
     Germany:
       STRENG_GEHEIM → TOP_SECRET
       GEHEIM → SECRET
       VS_VERTRAULICH → CONFIDENTIAL
       VS_NUR_FUER_DEN_DIENSTGEBRAUCH → UNCLASSIFIED
     
     Spain:
       SECRETO → SECRET
       RESERVADO → CONFIDENTIAL
       CONFIDENCIAL → UNCLASSIFIED
     ```

2. **Implement Transformation Mappers (Day 2)**
   - Create hardcoded attribute mapper for each mapping
   - **Terraform:** `terraform/modules/attribute-transcription/clearance-mappers.tf`
   - Use JavaScript mapper for complex transformations (if needed)

3. **Testing (Day 2)**
   - Test French user with `SECRET_DEFENSE` → Should map to `SECRET`
   - Test German user with `GEHEIM` → Should map to `SECRET`
   - Test Spanish user with `RESERVADO` → Should map to `CONFIDENTIAL`
   - Test unmapped value → Should fail validation (or log warning)

**Deliverables:**
- ✅ `terraform/modules/attribute-transcription/clearance-mappers.tf`
- ✅ Clearance mapping documentation in `docs/ATTRIBUTE-MAPPING-GUIDE.md`
- ✅ Test suite: Clearance transformation scenarios

**Acceptance Criteria:**
- [ ] Clearance transformation mappers configured for France, Germany, Spain
- [ ] All country-specific clearances map to NATO standard levels
- [ ] Unmapped clearances rejected with validation error
- [ ] Test coverage: All mappings validated

---

#### Task 1.6: Configure NTP Time Sync

**Owner:** DevOps Engineer  
**Effort:** 1 day  
**Priority:** Medium  
**Dependencies:** None

**Description:**  
Configure NTP time synchronization to ensure ≤3 seconds drift from authoritative time source.

**Implementation Steps:**

1. **Configure Host NTP Client (Morning)**
   - **Production:** Configure systemd-timesyncd or chrony on host servers
   - Configuration file: `/etc/systemd/timesyncd.conf`
     ```ini
     [Time]
     NTP=pool.ntp.org time.nist.gov
     FallbackNTP=time.google.com
     ```
   - Restart service: `sudo systemctl restart systemd-timesyncd`

2. **Docker Time Sync (Afternoon)**
   - Ensure Docker containers use host time
   - No explicit configuration needed (Docker uses host time by default)
   - Verify: `docker exec dive-keycloak date` matches host `date`

3. **Verification (Afternoon)**
   - Check NTP sync status: `timedatectl status`
   - Expected output:
     ```
     System clock synchronized: yes
     NTP service: active
     RTC in local TZ: no
     ```
   - Measure drift: `ntpdate -q pool.ntp.org`
   - **Target:** Offset <3 seconds

**Deliverables:**
- ✅ NTP configuration on production servers
- ✅ Verification script: `scripts/verify-ntp-sync.sh`
- ✅ Documentation: `docs/TIME-SYNC-REQUIREMENTS.md`

**Acceptance Criteria:**
- [ ] Host servers configured with NTP client (systemd-timesyncd or chrony)
- [ ] Docker containers use host time
- [ ] Time drift ≤3 seconds from authoritative source
- [ ] NTP sync status verified and documented

---

#### Task 1.7: Implement Time Sync Monitoring

**Owner:** DevOps Engineer  
**Effort:** 2 days  
**Priority:** Medium  
**Dependencies:** Task 1.6 (NTP configuration)

**Description:**  
Implement monitoring and alerting for time synchronization drift.

**Implementation Steps:**

1. **Create Time Sync Health Check Script (Day 1)**
   - Script: `scripts/verify-time-sync.sh`
   - Logic:
     ```bash
     #!/bin/bash
     drift=$(ntpdate -q pool.ntp.org | grep offset | awk '{print $10}')
     drift_abs=$(echo ${drift#-}) # Remove negative sign
     
     if (( $(echo "$drift_abs > 3" | bc -l) )); then
       echo "ERROR: Time drift ${drift}s exceeds 3s threshold"
       exit 1
     else
       echo "OK: Time drift ${drift}s within tolerance"
       exit 0
     fi
     ```

2. **Prometheus Metric (Day 1)**
   - Backend metric: `dive_clock_skew_seconds`
   - Implementation: `backend/src/utils/metrics.ts`
   - Expose via `/metrics` endpoint

3. **Grafana Dashboard (Day 2)**
   - Create panel: Time drift over time
   - Alert: If drift >3 seconds for >5 minutes

4. **CI/CD Integration (Day 2)**
   - Add to CI pipeline: `./scripts/verify-time-sync.sh`
   - Fail build if time drift >3 seconds

**Deliverables:**
- ✅ `scripts/verify-time-sync.sh`
- ✅ Prometheus metric: `dive_clock_skew_seconds`
- ✅ Grafana dashboard: Time synchronization panel
- ✅ CI/CD integration

**Acceptance Criteria:**
- [ ] Time sync health check script created and tested
- [ ] Prometheus metric exposed
- [ ] Grafana alert configured for drift >3 seconds
- [ ] CI/CD pipeline fails on excessive time drift

---

### Phase 1 Summary

**Total Effort:** 13 days  
**Deliverables:** 7 tasks, 15 artifacts  
**Compliance Improvement:** +10% ADatP-5663

**Phase 1 Completion Criteria:**
- [ ] All 7 tasks completed and tested
- [ ] All acceptance criteria met
- [ ] Terraform applied successfully (no errors)
- [ ] CI/CD pipelines passing
- [ ] Documentation updated
- [ ] Phase 1 demo to stakeholders

---

## PHASE 2: FEDERATION INFRASTRUCTURE

**Duration:** 3 weeks (November 18 - December 6, 2025)  
**Effort:** 27 working days  
**Compliance Improvement:** +15% ADatP-5663

### Objectives

- Automate federation metadata management
- Implement delegation support (OAuth 2.0 Token Exchange)
- Deploy attribute caching and LDAP federation
- Enhance attribute authority capabilities

### Tasks

#### Task 2.1: Automated Metadata Refresh

**Owner:** Backend Developer  
**Effort:** 3 days  
**Priority:** High  
**Dependencies:** None

**Description:**  
Implement automated metadata refresh for all IdP brokers to detect and apply metadata changes.

**Implementation Steps:**

1. **Create Metadata Refresh Service (Day 1-2)**
   - Service: `backend/src/services/metadata-refresh.service.ts`
   - Functionality:
     - Query Keycloak Admin REST API for current IdP metadata
     - Fetch latest metadata from IdP's `.well-known/openid-connect` endpoint
     - Compare current vs. latest (detect changes)
     - If changed, update Terraform state and trigger plan
   - **Admin REST API:**
     ```typescript
     GET /admin/realms/{realm}/identity-provider/instances/{alias}/export
     ```

2. **Terraform Integration (Day 2)**
   - Module: `terraform/modules/federation-metadata/`
   - Inputs: List of IdP aliases
   - Outputs: Metadata change notifications
   - **Logic:**
     - Fetch metadata from each IdP
     - Generate Terraform variables with latest metadata
     - Run `terraform plan` to detect drift

3. **Scheduled Refresh (Day 3)**
   - Cron job: Daily metadata refresh (1:00 AM UTC)
   - Script: `scripts/refresh-idp-metadata.sh`
   - Logging: Log all metadata changes to audit log
   - Notification: Slack/email alert on metadata changes

**Deliverables:**
- ✅ `backend/src/services/metadata-refresh.service.ts`
- ✅ `terraform/modules/federation-metadata/`
- ✅ `scripts/refresh-idp-metadata.sh`
- ✅ Cron job configuration

**Acceptance Criteria:**
- [ ] Metadata refresh service deployed
- [ ] Daily cron job scheduled
- [ ] Metadata changes detected and logged
- [ ] Terraform plan triggered on changes
- [ ] Notifications sent on metadata updates

---

#### Task 2.2: Metadata Validation

**Owner:** Backend Developer  
**Effort:** 3 days  
**Priority:** High  
**Dependencies:** Task 2.1

**Description:**  
Implement metadata validation (schema and signature verification) before trust establishment.

**Implementation Steps:**

1. **OIDC Metadata Schema Validation (Day 1)**
   - JSON Schema for OIDC discovery metadata
   - Required fields: `issuer`, `authorization_endpoint`, `token_endpoint`, `jwks_uri`
   - Validation library: `ajv` (JSON Schema validator)

2. **SAML Metadata Schema Validation (Day 1)**
   - XML Schema (XSD) for SAML metadata
   - Required elements: `EntityDescriptor`, `IDPSSODescriptor`, `KeyDescriptor`
   - Validation: `xmllint --schema saml-metadata-2.0-os.xsd metadata.xml`

3. **Signature Verification (Day 2)**
   - OIDC: Verify JWK Set is accessible and valid
   - SAML: Verify metadata signature using `xmlsec1`
   - **Script:** `scripts/validate-metadata-signature.sh`

4. **Pre-Import Validation (Day 3)**
   - Script: `scripts/validate-idp-metadata.sh`
   - Logic:
     1. Schema validation
     2. Signature verification
     3. Certificate expiration check
     4. Endpoint reachability test
   - Integration: CI/CD pipeline (fail on invalid metadata)

**Deliverables:**
- ✅ OIDC metadata JSON Schema
- ✅ SAML metadata XSD
- ✅ `scripts/validate-idp-metadata.sh`
- ✅ `scripts/validate-metadata-signature.sh`
- ✅ CI/CD integration

**Acceptance Criteria:**
- [ ] Metadata schema validation implemented (OIDC & SAML)
- [ ] Signature verification implemented
- [ ] Pre-import validation script functional
- [ ] CI/CD pipeline rejects invalid metadata
- [ ] All current IdP metadata validates successfully

---

#### Task 2.3: LDAP Attribute Federation

**Owner:** Backend Developer + Systems Administrator  
**Effort:** 5 days  
**Priority:** High  
**Dependencies:** LDAP/AD access granted

**Description:**  
Configure LDAP User Storage Federation to fetch attributes from organizational LDAP directory.

**Implementation Steps:**

1. **LDAP Access & Connectivity (Day 1)**
   - Coordinate with Systems Administrator for LDAP access
   - Obtain LDAP connection details:
     - Host, Port, Base DN, Bind DN, Bind Credential
   - Test connectivity: `ldapsearch -H ldap://ldap.example.com -D "cn=keycloak,ou=services,dc=example,dc=com" -W`
   - Firewall rules: Keycloak server → LDAP server (port 389 or 636)

2. **Configure LDAP Federation (Day 2)**
   - Keycloak Admin Console → User Federation → Add provider → LDAP
   - Configuration:
     - **Connection URL:** `ldap://ldap.example.com:389`
     - **Edit Mode:** READ_ONLY (don't modify LDAP)
     - **Users DN:** `ou=users,dc=example,dc=com`
     - **Bind DN:** `cn=keycloak,ou=services,dc=example,dc=com`
     - **Bind Credential:** (secure password)
     - **Custom User LDAP Filter:** `(objectClass=inetOrgPerson)`
   - **Terraform:** `terraform/modules/ldap-federation/main.tf`

3. **Create Attribute Mappers (Day 3-4)**
   - Map LDAP attributes to DIVE user attributes:
     - LDAP `uid` → Keycloak `username`
     - LDAP `mail` → Keycloak `email`
     - LDAP `clearanceLevel` → User attribute `clearance`
     - LDAP `organizationUnit` → User attribute `dutyOrg`
     - LDAP `departmentNumber` → User attribute `orgUnit`
     - LDAP `nationality` → User attribute `countryOfAffiliation`
   - **Terraform:** `terraform/modules/ldap-federation/mappers.tf`

4. **Test LDAP Synchronization (Day 5)**
   - Sync users: Keycloak Admin Console → User Federation → LDAP → Sync users
   - Verify users imported with attributes
   - Test login with LDAP credentials
   - Test attribute retrieval in token

**Deliverables:**
- ✅ `terraform/modules/ldap-federation/main.tf`
- ✅ `terraform/modules/ldap-federation/mappers.tf`
- ✅ LDAP connectivity documentation
- ✅ Test suite: LDAP federation

**Acceptance Criteria:**
- [ ] LDAP connectivity established
- [ ] LDAP User Storage Federation configured
- [ ] Attribute mappers configured for DIVE attributes
- [ ] Users synced from LDAP to Keycloak
- [ ] LDAP attributes appear in tokens
- [ ] Login with LDAP credentials successful

---

#### Task 2.4: Attribute Caching

**Owner:** Backend Developer  
**Effort:** 3 days  
**Priority:** Medium  
**Dependencies:** None

**Description:**  
Implement Redis-based attribute caching with configurable TTL per attribute type.

**Implementation Steps:**

1. **Deploy Redis (Day 1)**
   - Add Redis to `docker-compose.yml`
   - Configuration:
     ```yaml
     redis:
       image: redis:7-alpine
       ports:
         - "6379:6379"
       volumes:
         - redis-data:/data
     ```
   - Start Redis: `docker-compose up -d redis`

2. **Implement Attribute Cache Service (Day 2)**
   - Service: `backend/src/services/attribute-cache.service.ts`
   - Functionality:
     - `get(userId, attributeName)` - Fetch from cache
     - `set(userId, attributeName, value, ttl)` - Store in cache
     - `invalidate(userId)` - Clear user's cached attributes
   - **TTL Configuration (per attribute type):**
     - `clearance`: 900 seconds (15 minutes)
     - `countryOfAffiliation`: 28800 seconds (8 hours)
     - `acpCOI`: 1800 seconds (30 minutes)
     - `dutyOrg`: 3600 seconds (1 hour)
     - `uniqueID`: 86400 seconds (24 hours - rarely changes)

3. **Integration with Authz Middleware (Day 3)**
   - Update `backend/src/middleware/authz.middleware.ts`
   - **Logic:**
     1. Check cache for attributes
     2. If cache hit, use cached attributes
     3. If cache miss, fetch from Keycloak UserInfo endpoint
     4. Store in cache with appropriate TTL
     5. Proceed with authorization

4. **Testing (Day 3)**
   - Test cache hit (should be fast: <10ms)
   - Test cache miss (fetches from Keycloak: ~100ms)
   - Test TTL expiration (attributes refresh after TTL)
   - Test invalidation (manual cache clear)

**Deliverables:**
- ✅ Redis deployment configuration
- ✅ `backend/src/services/attribute-cache.service.ts`
- ✅ Updated `backend/src/middleware/authz.middleware.ts`
- ✅ Test suite: Attribute caching

**Acceptance Criteria:**
- [ ] Redis deployed and accessible
- [ ] Attribute cache service implemented
- [ ] Integration with authz middleware complete
- [ ] Cache hit performance <10ms
- [ ] TTL enforced (attributes expire correctly)
- [ ] Cache invalidation works

---

#### Task 2.5: Token Exchange (Delegation)

**Owner:** Backend Developer  
**Effort:** 4 days  
**Priority:** High  
**Dependencies:** None

**Description:**  
Enable OAuth 2.0 Token Exchange (RFC 8693) for delegation scenarios.

**Implementation Steps:**

1. **Enable Token Exchange Permission (Day 1)**
   - Configure `dive-v3-client` to allow token exchange
   - **Terraform:**
     ```hcl
     resource "keycloak_openid_client" "dive_v3_client" {
       # ... existing config
       
       extra_config = {
         "token.exchange.permission.enabled" = "true"
       }
     }
     ```
   - Apply: `terraform apply`

2. **Configure Token Exchange Policy (Day 1-2)**
   - Admin Console → Clients → dive-v3-client → Permissions → Token Exchange
   - **Policy:** Allow token exchange for same organization or higher clearance
   - **Resource:** Define delegated access resource

3. **Implement Token Exchange Client (Day 2)**
   - Service: `backend/src/services/token-exchange.service.ts`
   - **Functionality:**
     ```typescript
     async requestDelegatedToken(
       subjectToken: string,
       audience: string,
       requestedSubject?: string
     ): Promise<string> {
       const response = await fetch(`${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
         body: new URLSearchParams({
           grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
           client_id: CLIENT_ID,
           client_secret: CLIENT_SECRET,
           subject_token: subjectToken,
           subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
           audience: audience,
           requested_subject: requestedSubject || '',
         }),
       });
       
       const data = await response.json();
       return data.access_token;
     }
     ```

4. **Testing (Day 3-4)**
   - Test: User A requests delegated token on behalf of User B
   - Verify: Returned token has `act` claim with User A's identity
   - Test: Policy enforcement (deny delegation outside organization)
   - Test: Delegation chain (User A → User B → User C)

**Deliverables:**
- ✅ `terraform/modules/token-exchange/main.tf`
- ✅ `backend/src/services/token-exchange.service.ts`
- ✅ Token exchange policy configuration
- ✅ Test suite: Token exchange scenarios

**Acceptance Criteria:**
- [ ] Token exchange permission enabled for `dive-v3-client`
- [ ] Token exchange policy configured
- [ ] Token exchange service implemented
- [ ] Delegated tokens contain `act` claim
- [ ] Policy enforcement tested (allow/deny)

---

#### Task 2.6: Actor Claims Implementation

**Owner:** Backend Developer  
**Effort:** 5 days  
**Priority:** High  
**Dependencies:** Task 2.5 (Token Exchange)

**Description:**  
Implement actor claims (`act`) in delegated tokens to track delegation chain.

**Implementation Steps:**

1. **Create Actor Protocol Mapper (Day 1-2)**
   - Mapper Type: Custom JavaScript mapper (if needed) or Hardcoded Attribute
   - **Logic:**
     - If token exchange, add `act` claim with delegating subject
     - Nested structure: `{ "act": { "sub": "original-user", "iss": "original-issuer" } }`
   - **Terraform:** `terraform/modules/shared-mappers/delegation-mappers.tf`

2. **Implement Delegation Chain Extraction (Day 3)**
   - Middleware: `backend/src/middleware/delegation.middleware.ts`
   - **Functionality:**
     ```typescript
     function extractDelegationChain(token: DecodedToken): IDelegationChain {
       const chain: ISubject[] = [];
       let current = token;
       
       while (current) {
         chain.push({ sub: current.sub, iss: current.iss });
         current = current.act; // Nested actor
       }
       
       return {
         outermost: chain[0], // Current actor (who's making the request)
         innermost: chain[chain.length - 1], // Original subject
         chain: chain,
       };
     }
     ```

3. **Update Authz Middleware (Day 4)**
   - Extract delegation chain in `authz.middleware.ts`
   - Log delegation chain in ACP-240 audit events
   - **Event Type:** `DATA_SHARED` (delegation is release outside original identity)

4. **Testing (Day 5)**
   - Test nested actors (User A → User B → User C)
   - Verify chain extraction
   - Verify audit logging includes full chain

**Deliverables:**
- ✅ `terraform/modules/shared-mappers/delegation-mappers.tf`
- ✅ `backend/src/middleware/delegation.middleware.ts`
- ✅ Updated `backend/src/middleware/authz.middleware.ts`
- ✅ Test suite: Actor claims and delegation chains

**Acceptance Criteria:**
- [ ] Actor protocol mapper configured
- [ ] Delegated tokens contain `act` claim
- [ ] Delegation chain extraction implemented
- [ ] Audit logging includes full delegation chain
- [ ] Nested delegation tested (3+ levels)

---

#### Task 2.7: Delegation Audit Logging

**Owner:** Backend Developer  
**Effort:** 4 days  
**Priority:** High  
**Dependencies:** Task 2.6 (Actor Claims)

**Description:**  
Implement comprehensive audit logging for all delegation events.

**Implementation Steps:**

1. **Define Delegation Event Schema (Day 1)**
   - Event type: `DELEGATION`
   - **Fields:**
     ```json
     {
       "timestamp": "2025-11-20T14:30:00.123Z",
       "eventType": "DELEGATION",
       "requestId": "req-abc-123",
       "delegatingSubject": {
         "sub": "user-A",
         "iss": "dive-v3-usa"
       },
       "delegatedSubject": {
         "sub": "user-B",
         "iss": "dive-v3-fra"
       },
       "delegationChain": [
         { "sub": "user-A", "iss": "dive-v3-usa" },
         { "sub": "user-B", "iss": "dive-v3-fra" }
       ],
       "resource": "doc-456",
       "decision": "ALLOW",
       "reason": "Delegation approved: same organization"
     }
     ```

2. **Implement Delegation Logger (Day 2)**
   - Service: `backend/src/services/delegation-logger.service.ts`
   - Integration: Call from `delegation.middleware.ts`
   - **Storage:** MongoDB `audit_logs` collection + Winston file logger

3. **OPA Policy for Delegation (Day 3)**
   - Policy: `policies/delegation_policy.rego`
   - **Rules:**
     - Allow delegation within same organization
     - Allow delegation if delegating user has higher/equal clearance
     - Deny delegation across country boundaries (configurable)
   - **Testing:** OPA unit tests

4. **E2E Testing (Day 4)**
   - Test delegation scenarios (allow/deny)
   - Verify audit logs capture all events
   - Verify delegation policy enforcement

**Deliverables:**
- ✅ `backend/src/services/delegation-logger.service.ts`
- ✅ `policies/delegation_policy.rego`
- ✅ OPA unit tests for delegation policy
- ✅ E2E test suite: Delegation scenarios

**Acceptance Criteria:**
- [ ] Delegation event schema defined
- [ ] Delegation logger implemented
- [ ] OPA delegation policy deployed
- [ ] All delegation events logged (allow & deny)
- [ ] Audit logs queryable in MongoDB
- [ ] Policy enforcement tested

---

### Phase 2 Summary

**Total Effort:** 27 days  
**Deliverables:** 7 tasks, 20+ artifacts  
**Compliance Improvement:** +15% ADatP-5663

**Phase 2 Completion Criteria:**
- [ ] All 7 tasks completed and tested
- [ ] Automated metadata refresh operational
- [ ] LDAP federation configured
- [ ] Delegation support fully functional
- [ ] All CI/CD pipelines passing
- [ ] Phase 2 demo to stakeholders

---

## PHASE 3: PKI & REVOCATION

**Duration:** 3 weeks (December 9-27, 2025)  
**Effort:** 33 working days  
**Compliance Improvement:** +20% ADatP-5663

### Objectives

- Integrate enterprise PKI (replace self-signed certificates)
- Implement CRL checking for certificate revocation
- Deploy identity lifecycle management
- Enable cross-realm revocation broadcasting

### Tasks

*[Tasks 3.1 - 3.6 detailed similarly to Phase 1 & 2]*

---

## PHASE 4: ATTRIBUTE AUTHORITY & POLICY

**Duration:** 3 weeks (December 30, 2025 - January 17, 2026)  
**Effort:** 23 working days  
**Compliance Improvement:** +10% ADatP-5663

### Objectives

- Deploy standalone Attribute Authority service
- Implement attribute signing with JWS
- Configure federation agreement enforcement
- Enable client-specific attribute release policies

### Tasks

*[Tasks 4.1 - 4.4 detailed similarly to Phase 1 & 2]*

---

## PHASE 5: CONFORMANCE TESTING & DOCUMENTATION

**Duration:** 2 weeks (January 20 - January 31, 2026)  
**Effort:** 17 working days  
**Compliance Improvement:** Final validation

### Objectives

- Develop NATO ICAM Test Framework (NITF) conformance harness
- Execute comprehensive interoperability tests
- Conduct security assurance testing
- Generate compliance reports
- Update all documentation

### Tasks

*[Tasks 5.1 - 5.6 detailed similarly to Phase 1 & 2]*

---

## RESOURCE ALLOCATION

### Team Composition

| Role | Allocation | Phases | Responsibilities |
|------|------------|--------|------------------|
| **Backend Developer** | 1.0 FTE | All phases | Implementation, testing, documentation |
| **DevOps Engineer** | 0.5 FTE | Phases 1, 3 | Infrastructure, CI/CD, monitoring |
| **Security Architect** | 0.25 FTE | Phases 3, 5 | PKI coordination, conformance validation |
| **QA Engineer** | 0.25 FTE | Phase 5 | Test framework, conformance testing |

### External Dependencies

| Dependency | Phase | Lead Time | Risk Level |
|------------|-------|-----------|------------|
| **Enterprise PKI Access** | Phase 3 | 2-3 weeks | High |
| **LDAP/AD Access** | Phase 2 | 1-2 weeks | Medium |
| **Spain SAML IdP Metadata** | Phase 1 | 1 week | Low |
| **NTP Server Access** | Phase 1 | 1 day | Low |

---

## RISK REGISTER

*[Detailed risk register from Gap Analysis, with mitigation strategies]*

---

## SUCCESS METRICS

### Compliance Metrics

| Metric | Baseline | Target | Phase |
|--------|----------|--------|-------|
| **ACP-240 Compliance** | 90% | 100% | Phase 1 |
| **ADatP-5663 Compliance** | 63% | 98% | Phase 5 |
| **Keycloak Capabilities Leveraged** | 60% | 95% | Phase 5 |

### Technical Metrics

| Metric | Baseline | Target | Phase |
|--------|----------|--------|-------|
| **Federation Metadata Refresh** | Manual | Automated (daily) | Phase 2 |
| **Token Exchange Support** | No | Yes | Phase 2 |
| **PKI Certificate Validation** | Self-signed | Enterprise PKI | Phase 3 |
| **Attribute Caching Hit Rate** | N/A | >80% | Phase 2 |
| **Conformance Test Coverage** | 0% | 100% | Phase 5 |

---

## APPENDICES

### Appendix A: Terraform Module Structure

*[Detailed module structure for new Terraform modules]*

### Appendix B: Testing Strategy

*[Comprehensive testing approach for each phase]*

### Appendix C: Rollback Plan

*[Phase-by-phase rollback procedures]*

### Appendix D: Documentation Checklist

*[All documentation to be created/updated]*

---

**END OF IMPLEMENTATION PLAN**

**Next Review:** After Phase 1 completion  
**Status Updates:** Weekly (every Friday)  
**Stakeholder Demos:** End of each phase
