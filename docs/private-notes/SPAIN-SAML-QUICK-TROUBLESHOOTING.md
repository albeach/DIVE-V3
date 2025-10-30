# 🚨 Spain SAML Integration - Quick Troubleshooting Guide

**Version**: 1.0  
**Date**: October 28, 2025  
**Status**: ✅ **PRODUCTION READY**

---

## 🎯 Quick Diagnostic Checklist

Use this checklist to quickly diagnose Spain SAML integration issues:

```bash
# 1. Check all services are running
docker-compose ps | grep "Up (healthy)"

# 2. Verify Keycloak IdP Redirector configuration
curl http://localhost:8081/admin/realms/dive-v3-broker/authentication/flows | jq '.[] | select(.alias | contains("Classified"))'

# 3. Check PostgreSQL UUID defaults
docker-compose exec postgres psql -U postgres -d dive_v3_app -c "SELECT column_name, column_default FROM information_schema.columns WHERE table_name IN ('account', 'session') AND column_name = 'id';"

# 4. Test SimpleSAMLphp metadata
curl http://localhost:9443/simplesaml/saml2/idp/metadata.php

# 5. Test NextAuth configuration
curl http://localhost:3000/api/auth/providers

# 6. Check recent authentication errors
docker-compose logs --tail=50 keycloak | grep -i "error\|exception"
docker-compose logs --tail=50 nextjs | grep -i "nextauth.*error"
```

**Expected Results**:
- ✅ All services show "Up (healthy)"
- ✅ "Classified Access Browser Flow" found with "idp-redirector"
- ✅ Both `account.id` and `session.id` have `gen_random_uuid()::text` default
- ✅ SimpleSAMLphp returns valid XML metadata
- ✅ NextAuth shows `keycloak` provider
- ✅ No errors in logs

---

## ⚠️ Common Issues & Instant Fixes

### Issue 1: Still Seeing Keycloak Login Page

**Symptom**: Clicking "Spain Ministry of Defense" button shows Keycloak login page.

**Quick Fix**:
```bash
# Verify kc_idp_hint parameter is being sent
# Open browser DevTools → Network tab → Click Spain SAML button
# Check authorization request URL should contain: kc_idp_hint=esp-realm-external

# If missing, restart frontend
docker-compose restart nextjs

# If present but login page still shows, check Keycloak flow binding:
docker-compose exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password admin

docker-compose exec keycloak /opt/keycloak/bin/kcadm.sh get \
  authentication/flows/executions -r dive-v3-broker

# Look for "identity-provider-redirector" with "requirement": "ALTERNATIVE"
# If not found, re-apply Terraform:
cd terraform && terraform apply -auto-approve
```

**Root Cause**: Identity Provider Redirector not bound to browser flow or not first in execution order.

---

### Issue 2: "Configuration" Error After SAML Login

**Symptom**: User authenticates at SimpleSAMLphp successfully, but lands on homepage with `?error=Configuration`.

**Quick Fix**:
```bash
# Apply UUID defaults immediately
docker-compose exec -T postgres psql -U postgres -d dive_v3_app << 'EOF'
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
EOF

# Restart frontend to clear any cached connections
docker-compose restart nextjs

# Test again - should work now
```

**Root Cause**: NextAuth DrizzleAdapter failing to insert records due to missing UUID defaults.

**Verification**:
```bash
# Check database defaults are set
docker-compose exec postgres psql -U postgres -d dive_v3_app << 'EOF'
\d account
\d session
EOF

# Both tables should show: id | text | not null default gen_random_uuid()::text
```

---

### Issue 3: Null Value Constraint Violation

**Symptom**: 
```
ERROR: null value in column "id" of relation "account" violates not-null constraint
ERROR: null value in column "id" of relation "session" violates not-null constraint
```

**Instant Fix**:
```bash
# One-liner to fix both tables
docker-compose exec -T postgres psql -U postgres -d dive_v3_app -c "ALTER TABLE account ALTER COLUMN id SET DEFAULT gen_random_uuid()::text; ALTER TABLE session ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;"

# Restart frontend
docker-compose restart nextjs
```

**Root Cause**: Database schema doesn't have UUID defaults. This is **THE MOST COMMON ISSUE**.

---

### Issue 4: SimpleSAMLphp Not Responding

**Symptom**: "Connection refused" or "Service Unavailable" when trying to authenticate.

**Quick Fix**:
```bash
# Restart SimpleSAMLphp
docker-compose restart spain-saml-idp

# Wait 10 seconds for startup
sleep 10

# Test directly
curl http://localhost:9443/simplesaml/module.php/core/welcome

# If still failing, check logs
docker-compose logs spain-saml-idp --tail=50

# If port conflict, check what's using 9443
lsof -i :9443
```

**Root Cause**: SimpleSAMLphp container crashed or port conflict.

---

### Issue 5: Invalid SAML Assertion / Signature Validation Failed

**Symptom**: Keycloak logs show "Invalid signature" or "SAML validation failed".

**Quick Fix**:
```bash
# Re-sync SimpleSAMLphp certificate with Keycloak
cd external-idps/spain-saml
docker-compose exec spain-saml-idp cat /var/simplesamlphp/cert/server.crt

# Copy output, then update Keycloak IdP configuration
# Admin Console → Identity Providers → esp-realm-external → SAML Config → Validating X509 Certificates
# Paste the certificate (including BEGIN/END lines)

# Or re-apply Terraform (will sync from file)
cd terraform
terraform apply -target=module.spain_saml_idp -auto-approve
```

**Root Cause**: Certificate mismatch between SimpleSAMLphp and Keycloak configuration.

---

### Issue 6: Missing User Attributes (Clearance, Country, COI)

**Symptom**: User lands on dashboard but attributes show "Unknown" or missing.

**Quick Fix**:
```bash
# Check if attribute mappers are configured
docker-compose logs keycloak | grep -i "attribute.*mapper"

# Test SAML assertion content
docker-compose logs keycloak | grep -A 50 "SAML.*assertion"

# Check backend clearance transformation
docker-compose logs backend | grep "clearance.*transformation"

# If attributes missing, verify SimpleSAMLphp user configuration
docker-compose exec spain-saml-idp cat /var/simplesamlphp/config/authsources.php | grep -A 20 "juan.garcia"

# Should show:
# 'clearance' => 'SECRETO',
# 'countryOfAffiliation' => 'ESP',
# 'acpCOI' => 'NATO-COSMIC',
```

**Root Cause**: Attribute mappers not configured in Keycloak or SimpleSAMLphp not sending attributes.

---

### Issue 7: NextAuth State Validation Error

**Symptom**: `InvalidCheck: state value could not be parsed`

**Quick Fix**:
```bash
# This should NOT happen with the current solution
# If it does, it means custom OAuth parameters are being generated

# Verify IdP selector is using NextAuth signIn():
cat frontend/src/components/auth/idp-selector.tsx | grep "signIn"

# Should show:
# await signIn('keycloak', { redirectTo: '/dashboard' }, { kc_idp_hint: idp.alias });

# If using custom /api/auth/broker-login, DELETE IT:
rm -f frontend/src/app/api/auth/broker-login/route.ts

# Restart frontend
docker-compose restart nextjs
```

**Root Cause**: Custom OAuth flow bypassing NextAuth state management.

---

## 🔧 Emergency Recovery Procedures

### Procedure 1: Complete Reset (Nuclear Option)

```bash
# Stop all services
docker-compose down

# Remove volumes (CAUTION: Deletes all data!)
docker volume prune -f

# Rebuild from scratch
docker-compose up -d postgres
sleep 10

# Apply database schema
cd frontend
npx drizzle-kit push
docker-compose exec -T postgres psql -U postgres -d dive_v3_app < drizzle/0001_add_uuid_defaults.sql

# Apply Terraform
cd ../terraform
terraform init
terraform apply -auto-approve

# Start all services
cd ..
docker-compose up -d

# Verify
./scripts/test-spain-saml-e2e.sh
```

---

### Procedure 2: Database Schema Only Reset

```bash
# Drop and recreate NextAuth tables (preserves Keycloak data)
docker-compose exec -T postgres psql -U postgres -d dive_v3_app << 'EOF'
DROP TABLE IF EXISTS "session" CASCADE;
DROP TABLE IF EXISTS "account" CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;
DROP TABLE IF EXISTS "verificationToken" CASCADE;
EOF

# Re-apply Drizzle schema
cd frontend
npx drizzle-kit push

# Apply UUID defaults
docker-compose exec -T postgres psql -U postgres -d dive_v3_app << 'EOF'
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
EOF

# Restart frontend
docker-compose restart nextjs
```

---

### Procedure 3: Keycloak Flow Only Reset

```bash
# Destroy and recreate authentication flows
cd terraform
terraform destroy -target=module.broker_mfa
terraform apply -target=module.broker_mfa -auto-approve

# Verify in admin console
open http://localhost:8081/admin/master/console
# Navigate to: dive-v3-broker → Authentication → Flows
# Verify "Identity Provider Redirector" is first in "Classified Access Browser Flow"
```

---

## 📊 Health Check Script

Save this as `scripts/health-check-spain-saml.sh`:

```bash
#!/bin/bash
set -e

FAILED=0

echo "=== DIVE V3 Spain SAML Health Check ==="
echo ""

# Check 1: Docker services
echo -n "[1/7] Docker services... "
if docker-compose ps | grep -q "Up (healthy)"; then
    echo "✅ PASS"
else
    echo "❌ FAIL - Some services unhealthy"
    FAILED=1
fi

# Check 2: PostgreSQL UUID defaults
echo -n "[2/7] PostgreSQL UUID defaults... "
RESULT=$(docker-compose exec -T postgres psql -U postgres -d dive_v3_app -t -c \
  "SELECT COUNT(*) FROM information_schema.columns WHERE table_name IN ('account', 'session') AND column_name = 'id' AND column_default LIKE '%gen_random_uuid%';")
if [ "$RESULT" -eq 2 ]; then
    echo "✅ PASS"
else
    echo "❌ FAIL - UUID defaults missing"
    FAILED=1
fi

# Check 3: Keycloak IdP configuration
echo -n "[3/7] Keycloak IdP configuration... "
if curl -sf http://localhost:8081/realms/dive-v3-broker/broker/esp-realm-external/login > /dev/null 2>&1; then
    echo "✅ PASS"
else
    echo "❌ FAIL - IdP not configured"
    FAILED=1
fi

# Check 4: SimpleSAMLphp metadata
echo -n "[4/7] SimpleSAMLphp metadata... "
if curl -sf http://localhost:9443/simplesaml/saml2/idp/metadata.php | grep -q "EntityDescriptor"; then
    echo "✅ PASS"
else
    echo "❌ FAIL - Metadata not available"
    FAILED=1
fi

# Check 5: NextAuth provider
echo -n "[5/7] NextAuth provider... "
if curl -sf http://localhost:3000/api/auth/providers | grep -q "keycloak"; then
    echo "✅ PASS"
else
    echo "❌ FAIL - Provider not configured"
    FAILED=1
fi

# Check 6: Backend health
echo -n "[6/7] Backend API... "
if curl -sf http://localhost:4000/health > /dev/null 2>&1; then
    echo "✅ PASS"
else
    echo "❌ FAIL - Backend unhealthy"
    FAILED=1
fi

# Check 7: OPA health
echo -n "[7/7] OPA engine... "
if curl -sf http://localhost:8181/health > /dev/null 2>&1; then
    echo "✅ PASS"
else
    echo "❌ FAIL - OPA unhealthy"
    FAILED=1
fi

echo ""
if [ $FAILED -eq 0 ]; then
    echo "✅ ALL CHECKS PASSED - System healthy"
    echo ""
    echo "🚀 Ready to test: http://localhost:3000"
    exit 0
else
    echo "❌ SOME CHECKS FAILED - Review output above"
    exit 1
fi
```

**Usage**:
```bash
chmod +x scripts/health-check-spain-saml.sh
./scripts/health-check-spain-saml.sh
```

---

## 🐛 Debug Mode

### Enable Verbose Logging

**Keycloak**:
```bash
docker-compose exec keycloak /opt/keycloak/bin/kc.sh start-dev \
  --log-level=DEBUG \
  --log-console-level=DEBUG
```

**NextAuth**:
```bash
# frontend/.env.local
NEXTAUTH_DEBUG=1
NODE_ENV=development
```

**Backend**:
```bash
# backend/.env
LOG_LEVEL=debug
DEBUG=express:*
```

**OPA**:
```bash
# docker-compose.yml
opa:
  command:
    - "run"
    - "--server"
    - "--log-level=debug"
    - "--log-format=text"
```

### Live Log Monitoring

```bash
# Monitor all services
docker-compose logs -f

# Monitor specific service
docker-compose logs -f nextjs

# Monitor authentication flow
docker-compose logs -f keycloak | grep -i "broker\|saml\|redirect"

# Monitor database operations
docker-compose logs -f postgres | grep -i "insert\|error"

# Monitor NextAuth operations
docker-compose logs -f nextjs | grep -i "nextauth"
```

---

## 📞 Support Resources

### Immediate Help

1. **Check existing documentation**:
   - `SPAIN-SAML-DEPLOYMENT-GUIDE.md` (full deployment steps)
   - `SPAIN-SAML-TECHNICAL-ARCHITECTURE.md` (deep technical dive)
   - `SPAIN-SAML-IDP-REDIRECTOR-SUCCESS.md` (implementation report)

2. **Run health check**:
   ```bash
   ./scripts/health-check-spain-saml.sh
   ```

3. **Check recent logs**:
   ```bash
   docker-compose logs --tail=100
   ```

4. **Search existing issues**:
   ```bash
   grep -r "ERROR\|error" logs/ | tail -20
   ```

### Common Log Messages Decoded

| Log Message | Meaning | Action |
|-------------|---------|--------|
| `null value in column "id"` | UUID default missing | Apply UUID default migration |
| `state value could not be parsed` | Custom OAuth flow conflict | Use NextAuth signIn() with kc_idp_hint |
| `Invalid signature` | SAML certificate mismatch | Re-sync certificates |
| `Identity provider not found` | kc_idp_hint alias wrong | Check IdP alias matches Terraform |
| `Configuration error` | Adapter insert failed | Check UUID defaults |
| `Connection refused` | Service not running | docker-compose restart <service> |

---

## 🎯 Success Criteria

After applying fixes, verify these work:

```bash
# Test 1: Click Spain SAML button
# Expected: Redirects directly to SimpleSAMLphp (NO Keycloak login page)

# Test 2: Login with juan.garcia / EspanaDefensa2025!
# Expected: Successful authentication

# Test 3: Check dashboard
# Expected: 
# - Clearance: SECRET
# - Country: ESP
# - COI: NATO-COSMIC
# - IdP: Spain Ministry of Defense (External SAML)

# Test 4: Check database
docker-compose exec postgres psql -U postgres -d dive_v3_app -c \
  "SELECT u.email, a.provider, s.expires FROM \"user\" u JOIN \"account\" a ON u.id = a.\"userId\" JOIN \"session\" s ON u.id = s.\"userId\" WHERE u.email LIKE '%defensa.gob.es%';"
# Expected: Shows session record for juan.garcia@defensa.gob.es

# Test 5: Check Keycloak logs
docker-compose logs keycloak | grep -i "esp-realm-external"
# Expected: Shows successful broker authentication
```

---

## 📚 Additional Resources

- **Keycloak IdP Redirector Docs**: https://www.keycloak.org/docs/latest/server_admin/index.html#identity-provider-redirector
- **NextAuth Drizzle Adapter**: https://authjs.dev/reference/adapter/drizzle
- **SimpleSAMLphp Docs**: https://simplesamlphp.org/docs/stable/
- **PostgreSQL UUID Functions**: https://www.postgresql.org/docs/current/uuid-ossp.html

---

**Document Version**: 1.0  
**Last Updated**: October 28, 2025  
**Estimated Time to Fix Most Issues**: < 5 minutes

