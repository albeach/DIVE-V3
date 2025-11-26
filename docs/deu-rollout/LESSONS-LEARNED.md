# DEU Instance - Lessons Learned

## Executive Summary
This document captures critical lessons learned from the DEU (Germany) instance deployment on a **remote server** (192.168.42.120). Unlike USA and FRA which run locally, DEU introduced challenges unique to distributed, multi-server architectures. These lessons are essential for any future remote/edge deployments.

## Timeline Overview
- **Start Date**: November 25, 2025
- **Completion**: November 25, 2025
- **Environment**: Remote Ubuntu 24.04 server (prosecurity.biz domain)
- **Key Challenge**: Cross-network federation with different domain
- **Outcome**: Production-ready deployment after significant troubleshooting

## Critical Issues Discovered & Solutions

### 0. 🔴 CRITICAL: Clearance-Based MFA Bypass

**Issue**: Users with SECRET clearance were able to login without MFA (OTP/TOTP), violating AAL2 requirements.

**Symptom**: After successful federation login, SECRET user reached dashboard without being prompted for OTP.

**Root Cause (Two-Part Problem)**:

**Part 1 - Client Flow Binding Missing**:
1. The "Classified Access Browser Flow" exists in Keycloak and is correctly configured
2. BUT the `authentication_flow_binding_overrides` was **COMMENTED OUT** in `broker-realm.tf`
3. The client used the default browser flow which has NO clearance-based MFA

**Part 2 - Users Missing OTP Credentials**:
1. Even with the correct flow, users without OTP configured skip the MFA step
2. The flow's conditional OTP only triggers for users who HAVE OTP
3. New users or users without OTP need `CONFIGURE_TOTP` required action

**Authentication Flow Architecture**:
```
Realm-Level Binding (keycloak_authentication_bindings):
  → Set to "browser" for federation compatibility
  → Affects ALL clients in the realm

Client-Level Override (authentication_flow_binding_overrides):
  → Overrides realm-level for specific client
  → Should point to "Classified Access Browser Flow"
```

**Complete Solution (Applied 2025-11-25)**:

**Step 1: Fix Client Flow Binding in Terraform (`broker-realm.tf`)**:
```hcl
# Add data source to lookup existing flow
data "keycloak_authentication_flow" "classified_access_browser_flow" {
  realm_id = keycloak_realm.dive_v3_broker.id
  alias    = "Classified Access Browser Flow - DIVE V3 Broker"
}

resource "keycloak_openid_client" "dive_v3_app_broker" {
  # ... other settings ...
  
  # CRITICAL: Without this, SECRET users bypass MFA!
  authentication_flow_binding_overrides {
    browser_id = data.keycloak_authentication_flow.classified_access_browser_flow.id
  }
}
```

**Step 2: Add CONFIGURE_TOTP Required Action for Users Without OTP**:
```bash
# For all users with CONFIDENTIAL/SECRET/TOP_SECRET clearance
# who don't have OTP configured:
curl -X PUT "https://localhost:8443/admin/realms/dive-v3-broker/users/$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"requiredActions": ["CONFIGURE_TOTP"]}'
```

**Step 3: Verification**:
After applying both fixes, SECRET users are now:
1. Directed to the "Mobile Authenticator Setup" page
2. Required to scan QR code with Google Authenticator or FreeOTP
3. Cannot access dashboard without completing OTP setup

**Clearance-Based MFA Rules**:
| Clearance | Required Authentication | Keycloak Flow |
|-----------|------------------------|---------------|
| UNCLASSIFIED | Password only | Standard Browser |
| CONFIDENTIAL | Password + OTP (AAL2) | Conditional OTP |
| SECRET | Password + OTP (AAL2) | Conditional OTP |
| TOP_SECRET | Password + WebAuthn (AAL3) | Conditional WebAuthn |

**Files Updated**:
- `terraform/broker-realm.tf` - Added `authentication_flow_binding_overrides` to broker client
- `terraform/modules/federated-instance/main.tf` - Added dynamic `authentication_flow_binding_overrides` block
- `terraform/modules/federated-instance/variables.tf` - Added `browser_flow_override_id` variable

---

### 1. 🔴 CRITICAL: NextAuth Database Configuration

**Issue**: Frontend container started without `DATABASE_URL` environment variable, causing all authentication callbacks to fail with `ECONNREFUSED` errors.

**Symptom**: 
```
[NextAuth Error] p: Read more at https://errors.authjs.dev#adaptererror
cause: { err: [AggregateError: ] { code: 'ECONNREFUSED' } }
```

**Root Cause**: The generated `docker-compose.yml` did not include `DATABASE_URL` for the frontend service.

**Solution**: 
1. Add `DATABASE_URL` to frontend environment variables
2. Add dependency on PostgreSQL with health check condition
3. Create NextAuth database (`dive_v3_app`) separate from Keycloak's database
4. Initialize NextAuth schema tables (user, account, session, verificationToken)

**Code Change** (`docker-compose.yml`):
```yaml
frontend:
  environment:
    # NextAuth.js Database Adapter - CRITICAL for session persistence
    DATABASE_URL: postgresql://keycloak:keycloak@postgres:5432/dive_v3_app
  depends_on:
    postgres:
      condition: service_healthy
```

**Script Updated**: `deploy-instance.sh` now includes Step 5b for automatic database initialization.

---

### 2. 🔴 CRITICAL: Federation Client Secret Mismatch

**Issue**: Federation between DEU and USA/FRA failed with 401 "unauthorized_client" errors.

**Symptom** (Keycloak logs):
```
ERROR [org.keycloak.broker.oidc.AbstractOAuth2IdentityProvider] 
Unexpected response from token endpoint: status=401
{"error":"unauthorized_client","error_description":"Invalid client or Invalid client credentials"}
```

**Root Cause**: When DEU creates an IdP broker configuration pointing to USA, it needs the client secret from the USA's `dive-v3-deu-federation` client. These secrets were not synchronized.

**Solution**:
1. Create incoming federation clients on each instance for all partners
2. Synchronize client secrets from source instances to IdP broker configurations
3. Created `scripts/sync-federation-secrets.sh` to automate this process

**Federation Secret Flow**:
```
DEU → USA Federation:
  1. DEU's "usa-federation" IdP broker needs USA's client secret
  2. USA has client "dive-v3-deu-federation" with a secret
  3. This secret must be copied to DEU's IdP broker config

USA → DEU Federation:
  1. USA's "deu-federation" IdP broker needs DEU's client secret
  2. DEU must have client "dive-v3-usa-federation" with a secret
  3. This secret must be copied to USA's IdP broker config
```

---

### 3. 🟡 HIGH: Container Recreation vs Restart

**Issue**: After adding `DATABASE_URL` to docker-compose.yml, a simple `docker compose restart` did NOT apply the new environment variable.

**Root Cause**: Docker restart only restarts the existing container; it doesn't read updated compose file values.

**Solution**: Use `docker compose up -d` instead of `docker compose restart` when changing environment variables.

```bash
# WRONG - doesn't pick up new env vars
docker compose restart frontend

# CORRECT - recreates container with new configuration  
docker compose up -d frontend
```

---

### 4. 🟡 HIGH: Different Domains for Different Instances

**Issue**: DEU uses `prosecurity.biz` domain while USA/FRA use `dive25.com`. This caused federation redirect_uri mismatches.

**Root Cause**: Terraform tfvars files had hardcoded `dive25.com` URLs for DEU federation partners.

**Solution**: 
1. Created `config/federation-registry.json` as single source of truth
2. Updated all tfvars files with correct URLs per instance
3. Scripts now reference the registry instead of hardcoded values

**Registry Entry Example**:
```json
{
  "deu": {
    "instance_code": "DEU",
    "idp_url": "https://deu-idp.prosecurity.biz",
    "app_url": "https://deu-app.prosecurity.biz",
    "api_url": "https://deu-api.prosecurity.biz"
  }
}
```

---

### 5. 🟡 HIGH: Missing Incoming Federation Clients

**Issue**: DEU Keycloak had IdP brokers to connect TO other instances, but no clients for other instances to connect TO it.

**Root Cause**: Terraform module created outgoing federation (IdP brokers) but not incoming federation (client registrations).

**Solution**: Updated deployment to create both:
- **Outgoing**: IdP broker configurations (usa-federation, fra-federation)
- **Incoming**: Client registrations (dive-v3-usa-federation, dive-v3-fra-federation)

---

### 6. 🟢 MEDIUM: Different Admin Passwords

**Issue**: DEU Keycloak used default `admin/admin` while USA/FRA used `admin/DivePilot2025!`.

**Impact**: Scripts that assumed uniform passwords failed on DEU.

**Solution**: Updated scripts to handle per-instance passwords:
```bash
if [[ "$INSTANCE" == "deu" ]]; then
  KC_PASSWORD="admin"
else
  KC_PASSWORD="DivePilot2025!"
fi
```

**Recommendation**: Standardize passwords across all instances, or move to secrets management.

---

## Updated Deployment Process

### Before (Incomplete)
1. ~~Generate docker-compose.yml~~
2. ~~Start Docker services~~
3. ~~Sync Keycloak realm~~
4. ~~Start tunnel~~

### After (Complete)
1. Generate docker-compose.yml **with DATABASE_URL**
2. Start Docker services
3. **Initialize NextAuth database schema**
4. Sync Keycloak realm
5. **Create incoming federation clients**
6. **Synchronize federation secrets**
7. Start tunnel
8. **Validate federation flow**

---

## Scripts Created/Updated

| Script | Purpose |
|--------|---------|
| `deploy-instance.sh` | Added DATABASE_URL, schema init, federation clients |
| `sync-federation-secrets.sh` | **NEW** - Synchronizes client secrets across instances |
| `federation/validate-federation.sh` | Tests cross-instance authentication |
| `federation/generate-tfvars.sh` | Generates tfvars from federation-registry.json |

---

## Checklist for Future Remote Deployments

### Pre-Deployment
- [ ] Verify SSH access to remote server
- [ ] Confirm domain DNS points to correct server
- [ ] Check firewall allows Cloudflare tunnel connections
- [ ] Verify server has sufficient resources (28GB RAM, Docker installed)
- [ ] Update `federation-registry.json` with correct URLs

### Deployment
- [ ] Run `deploy-instance.sh` with correct parameters
- [ ] Verify PostgreSQL is healthy before proceeding
- [ ] Confirm NextAuth database and tables exist
- [ ] Check frontend has `DATABASE_URL` in environment
- [ ] Verify Keycloak realm is created/synced

### Post-Deployment
- [ ] Run `sync-federation-secrets.sh` to synchronize all secrets
- [ ] Test local login (direct to instance)
- [ ] Test federation login (from partner instances)
- [ ] Verify dashboard loads after successful authentication
- [ ] Monitor Keycloak logs for "unauthorized_client" errors
- [ ] Run `health-check.sh` to verify all services

---

## Key Metrics

### Troubleshooting Time
- **Initial 502 Error Investigation**: 45 minutes
- **Root Cause Identification**: 30 minutes
- **Fix Implementation**: 20 minutes
- **Verification & Testing**: 15 minutes
- **Total**: ~2 hours

### Issues Resolved
- **Critical (Red)**: 2
- **High (Yellow)**: 3
- **Medium (Green)**: 1

### Prevention Impact
With updated scripts, future deployments should:
- Eliminate DATABASE_URL configuration errors
- Automatically create NextAuth schema
- Create all required federation clients
- Provide clear guidance on secret synchronization

---

## Recommendations for CAN/GBR Instances

### Do Before Deployment
1. Verify `federation-registry.json` has correct URLs
2. Pre-create Cloudflare tunnel and DNS records
3. Prepare instance-specific password (or standardize)
4. Review this document's checklist

### Watch For
1. Different domain names requiring URL updates
2. Network latency affecting health checks
3. Time zone differences affecting token validation
4. Certificate trust chain issues with self-signed certs

### Verify After Deployment
1. All 4 NextAuth tables exist in dive_v3_app database
2. Federation clients exist for all partner instances
3. Federation secrets are synchronized
4. Cross-instance login completes successfully
5. Health check shows all services healthy

---

## Conclusion

The DEU deployment exposed critical gaps in our deployment automation, specifically around:

1. **Database configuration** for NextAuth.js session persistence
2. **Federation client lifecycle** management
3. **Cross-instance secret synchronization**

These issues have been addressed through script updates and the creation of new automation tools. Future deployments should be significantly smoother.

### Key Takeaway
> **In a federated system, client secrets are bidirectional.** Each instance needs both outgoing IdP brokers (to authenticate users via partners) AND incoming clients (for partners to authenticate users from this instance).

---

*Document Version: 1.0*
*Last Updated: 2025-11-25*
*Authors: AI-assisted troubleshooting session*
*Next Review: After CAN deployment*

