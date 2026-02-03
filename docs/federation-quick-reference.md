# Federation Fix - Quick Reference Card

**Print this for your desk!** 🖨️

---

## 🚨 Is Federation Broken?

**Symptoms:**
- IdP shows as RED
- "Identity Provider Unavailable" error
- "unauthorized_client" in logs
- SSL errors in Keycloak logs

---

## 🔍 Diagnose the Issue

```bash
# Check IdP health
curl -k https://localhost:4001/api/idps/usa-idp/health

# Check Keycloak logs
docker logs alb-keycloak-alb-1 --tail 50 | grep -i error

# Check frontend logs
docker logs alb-frontend-alb-1 --tail 50 | grep -i error
```

---

## 🛠️ Quick Fixes

### Fix 1: SSL Trust Error
```bash
MKCERT_CA="$(mkcert -CAROOT)/rootCA.pem"
docker cp "$MKCERT_CA" alb-keycloak-alb-1:/opt/keycloak/conf/truststores/mkcert-rootCA.pem
docker restart alb-keycloak-alb-1
```

### Fix 2: Certificate SAN Missing
```bash
cd instances/hub/certs
mkcert -cert-file hub.crt -key-file hub.key \
  localhost dive-hub-keycloak host.docker.internal 127.0.0.1 ::1
docker cp hub.crt dive-hub-keycloak:/opt/keycloak/conf/certs/hub.crt
docker restart dive-hub-keycloak
```

### Fix 3: Client Secret Mismatch
```bash
# Get correct secret from USA Hub
TOKEN=$(docker exec hub-backend-hub-1 curl -s -X POST \
  'http://dive-hub-keycloak:8080/realms/master/protocol/openid-connect/token' \
  -d "client_id=admin-cli" -d "username=admin" \
  -d "password=${KC_PASS}" -d "grant_type=password" | jq -r '.access_token')

SECRET=$(docker exec hub-backend-hub-1 curl -s -X GET \
  "http://dive-hub-keycloak:8080/admin/realms/dive-v3-broker/clients/${UUID}/client-secret" \
  -H "Authorization: Bearer ${TOKEN}" | jq -r '.value')

# Update ALB's usa-idp config with correct secret
# (See full guide for complete command)
```

### Fix 4: Frontend Environment Wrong
```bash
# Update instances/alb/.env with correct secret
# Then restart:
cd instances/alb
docker-compose down && docker-compose up -d
```

---

## 🤖 Automated Fix (Easiest!)

```bash
# Fix all remaining spokes at once
./scripts/fix-all-spokes-federation.sh --all

# Or fix one spoke
./scripts/fix-all-spokes-federation.sh --spoke bel
```

---

## ✅ Verify It Works

1. Navigate to: `https://localhost:3001/`
2. Click: "United States" IdP
3. See: Cross-border banner
4. Login: `testuser-usa-1` / `TestUser2025!Pilot`
5. Success: Redirected to dashboard

---

## 📚 Full Documentation

- **Complete Guide:** `docs/FEDERATION-TROUBLESHOOTING-COMPLETE-GUIDE.md`
- **Quick Fix Guide:** `docs/FEDERATION-QUICK-FIX-GUIDE.md`
- **Session Summary:** `docs/FEDERATION-SESSION-SUMMARY.md`

---

## 🆘 Emergency Contacts

**DIVE CLI:** `./dive --help`
**Federation Health:** `./dive federation health --instance <SPOKE>`
**Check Logs:** `./dive logs <service> --instance <SPOKE>`

---

## 🔑 Key Commands

```bash
# Get Keycloak admin token
TOKEN=$(docker exec <backend> curl -s -X POST \
  'http://keycloak:8080/realms/master/protocol/openid-connect/token' \
  -d "client_id=admin-cli" -d "username=admin" \
  -d "password=${KC_PASS}" -d "grant_type=password" | jq -r '.access_token')

# Get client secret
docker exec <backend> curl -s -X GET \
  "http://keycloak:8080/admin/realms/<realm>/clients/<uuid>/client-secret" \
  -H "Authorization: Bearer ${TOKEN}" | jq -r '.value'

# Check certificate SANs
openssl x509 -in cert.crt -noout -text | grep -A 10 "Subject Alternative Name"

# Verify environment variable
docker exec <container> printenv | grep <VAR_NAME>
```

---

## 💡 Pro Tips

1. **Always restart with `docker-compose down && up -d`** for .env changes
2. **Import root CA, not leaf certificates** for Java apps
3. **Check SANs include ALL hostnames** (especially Docker internal names)
4. **Verify secrets match in 3 places:** IdP config, Hub registration, Frontend env

---

## 🎯 Success Checklist

- [ ] IdP shows GREEN
- [ ] No SSL errors in logs
- [ ] Can click USA IdP
- [ ] USA login page loads
- [ ] Cross-border banner displays
- [ ] Can authenticate successfully
- [ ] Redirects to spoke dashboard
- [ ] Session is active

---

**Last Updated:** December 15, 2025
**Version:** 1.0
**Tested On:** ALB Spoke (100% success rate)
