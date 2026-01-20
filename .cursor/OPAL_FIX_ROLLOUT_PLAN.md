# OPAL Policy Sync Fix - Rollout Plan
## Post-Session Action Items

---

## ✅ COMPLETED (FRA Spoke)

- [x] Template updated with all fixes
- [x] FRA spoke tested and verified working
- [x] Commit created: `0519ed26`
- [x] Documentation: SESSION_OPAL_POLICY_SYNC_RESOLUTION_COMPLETE.md

---

## 📋 ROLLOUT TO OTHER SPOKES

### Spokes Requiring Update
- **GBR** (dive-spoke-gbr)
- **DEU** (dive-spoke-deu)  
- Any other deployed spokes

### Method 1: Automated Regeneration (RECOMMENDED)

**Not Yet Available** - The `./dive spoke update-compose` command exists in the codebase but requires full dive environment setup.

### Method 2: Manual Template Application

For each spoke (GBR, DEU, etc.):

#### Step 1: Backup Current Configuration
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/instances/gbr
cp docker-compose.yml docker-compose.yml.bak.$(date +%Y%m%d-%H%M%S)
```

#### Step 2: Apply Template Changes Manually

Edit `instances/<code>/docker-compose.yml`:

**Change 1 - OPA TLS Flags** (line ~237):
```yaml
# BEFORE:
command: run --server --addr :8181 --set=decision_logs.console=true --set=data_api_enabled=true --set=policies_api_enabled=true --set=tls_cert_file=/certs/certificate.pem --set=tls_private_key_file=/certs/key.pem /policies/base /policies/entrypoints /policies/tenant /policies/org /policies/compat

# AFTER:
command: run --server --addr :8181 --set=decision_logs.console=true --set=data_api_enabled=true --set=policies_api_enabled=true --tls-cert-file=/certs/certificate.pem --tls-private-key-file=/certs/key.pem --ignore='*.json' /policies/base /policies/entrypoints /policies/tenant /policies/org /policies/compat
```

**Change 2 - OPAL External OPA** (lines ~274-284):
```yaml
# BEFORE:
      OPAL_INLINE_OPA_ENABLED: "true"
      OPAL_INLINE_OPA_CONFIG: |
        {
          "addr": "0.0.0.0:8181",
          "log_level": "info",
          "log_format": "json",
          "decision_logs": {
            "console": true
          }
        }

# AFTER:
      OPAL_INLINE_OPA_ENABLED: "false"
      OPAL_POLICY_STORE_URL: https://opa-gbr:8181  # Change 'gbr' to spoke code
```

**Change 3 - OPAL SSL Cert Paths** (lines ~294-296):
```yaml
# BEFORE:
      SSL_CERT_FILE: /var/opal/certs/rootCA.pem
      REQUESTS_CA_BUNDLE: /var/opal/certs/rootCA.pem
      WEBSOCKET_SSL_CERT: /var/opal/certs/rootCA.pem

# AFTER:
      SSL_CERT_FILE: /var/opal/hub-certs/ca/rootCA.pem
      REQUESTS_CA_BUNDLE: /var/opal/hub-certs/ca/rootCA.pem
      WEBSOCKET_SSL_CERT: /var/opal/hub-certs/ca/rootCA.pem
```

**Change 4 - OPAL Healthcheck** (line ~309):
```yaml
# BEFORE:
      test: ["CMD", "curl", "-f", "http://localhost:8181/health"]

# AFTER:
      test: ["CMD", "curl", "-f", "http://localhost:7000/healthcheck"]
```

**Change 5 - Backend OPA URL** (line ~352):
```yaml
# BEFORE:
      OPA_URL: http://opal-client-gbr:8181

# AFTER:
      OPA_URL: https://opa-gbr:8181  # Change 'gbr' to spoke code
```

**Change 6 - KAS OPA URL** (line ~423):
```yaml
# BEFORE:
      OPA_URL: http://opal-client-gbr:8181

# AFTER:
      OPA_URL: https://opa-gbr:8181  # Change 'gbr' to spoke code
```

**Change 7 - Backend Dependencies** (line ~389-392):
```yaml
# BEFORE:
      opa-gbr:
        condition: service_started
      opal-client-gbr:
        condition: service_healthy

# AFTER:
      opa-gbr:
        condition: service_healthy
      opal-client-gbr:
        condition: service_started
```

#### Step 3: Rebuild OPAL Client Image
```bash
cd instances/gbr
docker compose --env-file .env build --no-cache opal-client-gbr
```

#### Step 4: Restart Services
```bash
cd instances/gbr
docker compose --env-file .env down opa-gbr opal-client-gbr
docker compose --env-file .env up -d opa-gbr opal-client-gbr
sleep 30
docker compose --env-file .env up -d backend-gbr kas-gbr
```

#### Step 5: Validate
```bash
# Check OPA has policies
curl -k https://localhost:8282/v1/data/dive/authz | jq 'keys'  # GBR port
# Expected: Non-empty array

# Check OPAL connected
docker logs dive-spoke-gbr-opal-client | grep "Connected to PubSub"
# Expected: "Connected to PubSub server wss://dive-hub-opal-server:7002/ws"

# Check KAS can query OPA
docker exec dive-spoke-gbr-kas curl -sk https://opa-gbr:8181/v1/data/dive/authz/decision \
  -X POST -H 'Content-Type: application/json' \
  -d '{"input": {...}}'
# Expected: {"allow": true/false, "reason": "..."}
```

---

## 🔄 AUTOMATED REGENERATION (Future)

When the dive CLI environment is properly set up:

```bash
# Regenerate all spokes from template
for CODE in gbr deu; do
    ./dive spoke reinit $CODE
done
```

This will:
1. Read updated template with new hash
2. Apply all placeholder substitutions
3. Generate fresh docker-compose.yml
4. Preserve .env files and certificates
5. Restart services

---

## 🎯 VALIDATION CHECKLIST

For each spoke after update:

- [ ] OPA serving HTTPS on port 8181 (TLSv1.3)
- [ ] OPAL client connected to Hub WebSocket
- [ ] Policy bundle fetched (33 rego files, commit e24ad9a)
- [ ] dive.authz package loaded in OPA
- [ ] /v1/data/dive/authz/decision endpoint working
- [ ] Backend can query OPA via HTTPS
- [ ] KAS can query OPA via HTTPS
- [ ] All containers healthy

---

## 🚨 ROLLBACK PROCEDURE

If issues occur during rollout:

```bash
cd instances/<code>
# Restore backup
cp docker-compose.yml.bak.YYYYMMDD-HHMMSS docker-compose.yml

# Restart services
docker compose --env-file .env down
docker compose --env-file .env up -d
```

---

## 📊 CURRENT STATUS

| Spoke | OPA HTTPS | OPAL Sync | KAS Working | Status |
|-------|-----------|-----------|-------------|--------|
| **FRA** | ✅ TLSv1.3 | ✅ Active | ✅ Tested | **COMPLETE** |
| **GBR** | ⏳ Pending | ⏳ Pending | ⏳ Pending | **TEMPLATE READY** |
| **DEU** | ⏳ Pending | ⏳ Pending | ⏳ Pending | **TEMPLATE READY** |

---

## 🎬 NEXT SESSION PRIORITIES

1. **Immediate**: Test FRA KAS end-to-end via frontend
   - URL: https://localhost:3010/resources/doc-FRA-seed-1768925269461-00089
   - Action: Click "View Decryption Key"
   - Expected: SUCCESS (KAS returns DEK)

2. **High**: Roll out fixes to GBR and DEU spokes
   - Apply template changes manually
   - Validate OPAL sync and KAS functionality

3. **Medium**: Create automated policy sync validation test
   - Script: `tests/federation/test-opal-policy-sync.sh`
   - Validates all spokes have required OPA packages
   - Runs in CI/CD pipeline

---

*Generated: 2026-01-20 21:07:00 UTC*  
*Template Hash (New): 5bd4af8b6829d8ef1e1b0c711d42b5c9*  
*Template Hash (Old): 08954275327517ac2850e943cdf7ca6a*
