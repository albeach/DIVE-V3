# Federation Quick Reference Guide

## ✅ Working Federation Flow (USA ↔ GBR)

### Test the Flow
```bash
# 1. Browser: https://localhost:3000
# 2. Click: "United Kingdom"
# 3. Login: testuser-gbr-1 / TestUser2025!Pilot
# 4. Result: Authenticated to USA Hub dashboard ✅
```

---

## 🔑 Key Configuration Elements

### 1. GBR Realm (Forces Public Issuer)
```bash
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh update \
  realms/dive-v3-broker-gbr \
  -s 'attributes.frontendUrl="https://localhost:8446"'
```

### 2. USA Hub IdP (Hybrid URLs)
```json
{
  "authorizationUrl": "https://localhost:8446/...",     // PUBLIC (browser)
  "issuer": "https://localhost:8446/...",               // PUBLIC (token validation)
  "tokenUrl": "https://gbr-keycloak-gbr-1:8443/...",    // INTERNAL (backend)
  "userInfoUrl": "https://gbr-keycloak-gbr-1:8443/...", // INTERNAL (backend)
  "jwksUrl": "https://gbr-keycloak-gbr-1:8443/...",     // INTERNAL (backend)
  "clientSecret": "<<GCP_SECRET>>"                      // From GCP Secret Manager
}
```

### 3. Federation Secret (GCP)
```bash
gcloud secrets versions access latest \
  --secret=dive-v3-federation-gbr-usa \
  --project=dive25
```

### 4. SSL Certificate Trust
```bash
docker exec -u root dive-hub-keycloak keytool -importcert \
  -file /opt/keycloak/certs/gbr-certificate-new.pem \
  -alias gbr-keycloak-federation \
  -cacerts -storepass changeit -noprompt
```

---

## 🔧 Troubleshooting Commands

### Check GBR Issuer
```bash
# Via internal hostname (should return PUBLIC issuer)
docker exec dive-hub-keycloak sh -c \
  'curl -sk https://gbr-keycloak-gbr-1:8443/realms/dive-v3-broker-gbr/.well-known/openid-configuration' \
  | jq -r '.issuer'

# Expected: https://localhost:8446/realms/dive-v3-broker-gbr
```

### Check USA Hub IdP Config
```bash
USA_KC_PW="<<PASSWORD>>"
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password "$USA_KC_PW"

docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get \
  identity-provider/instances/gbr-idp -r dive-v3-broker \
  | jq '{issuer, tokenUrl, userInfoUrl, clientId}'
```

### Check Network Connectivity
```bash
docker exec dive-hub-keycloak sh -c \
  'curl -sk -I https://gbr-keycloak-gbr-1:8443/realms/dive-v3-broker-gbr'
```

### View Keycloak Errors
```bash
docker logs dive-hub-keycloak --since 5m 2>&1 | grep -i "error\|exception"
```

---

## 📋 Backend Code Changes

### Files Modified
1. `backend/src/services/keycloak-federation.service.ts`
   - Added `ensureRemoteFrontendUrl()` method
   - Updated URL strategy to use internal hostnames for backend communication
   - Issuer set to public URL

2. `backend/src/utils/gcp-secrets.ts`
   - Added `getFederationSecret()` function
   - Proper GCP secret name construction: `dive-v3-federation-{a}-{b}`

3. `instances/gbr/config.json`
   - Added `idpPublicUrl` field

4. `docker-compose.hub.yml`
   - Added `dive-v3-shared-network` to keycloak service

5. `scripts/dive-modules/common.sh`
   - Added `ensure_shared_network()` function

---

## 🎯 Critical Success Factors

### 1. Docker Networking
- ✅ Shared network: `dive-v3-shared-network`
- ✅ Both Keycloak services connected
- ✅ Internal hostnames resolvable

### 2. Keycloak Configuration
- ✅ Remote realm `frontendUrl` set to public URL
- ✅ IdP uses internal URLs for backend communication
- ✅ IdP expects public issuer

### 3. Secrets Management
- ✅ Federation secrets in GCP Secret Manager
- ✅ Backend fetches from GCP automatically
- ✅ Secrets synchronized between Hub and Spoke

### 4. SSL Certificates
- ✅ Remote certificate in Hub's truststore
- ✅ Certificate SANs include container hostnames
- ✅ mkcert Root CA trusted (if using mkcert)

---

## 🚀 Next Federation Instance

To add a new instance (e.g., FRA):

1. **Register spoke:**
   ```bash
   # From FRA instance
   ./dive spoke register
   ```

2. **Approve spoke (Hub):**
   ```bash
   # Backend automatically:
   # - Fetches federation secret from GCP
   # - Sets FRA's frontendUrl
   # - Creates bidirectional IdPs
   # - Imports FRA certificate
   ./dive hub spokes approve spoke-fra-XXXXX
   ```

3. **Test:**
   ```bash
   # Browser: https://localhost:3000
   # Click: "France"
   # Login: testuser-fra-1
   ```

---

## 📊 Verification Checklist

- [ ] GBR frontendUrl set to `https://localhost:8446`
- [ ] USA Hub IdP uses `gbr-keycloak-gbr-1:8443` for backend URLs
- [ ] USA Hub IdP expects `https://localhost:8446` as issuer
- [ ] Federation secret matches in GCP, USA Hub, and GBR client
- [ ] GBR certificate imported into USA Hub truststore
- [ ] Docker shared network exists and both services connected
- [ ] Browser federation test succeeds

---

## 📖 Full Documentation

See `docs/federation-issuer-solution.md` for complete technical details.

