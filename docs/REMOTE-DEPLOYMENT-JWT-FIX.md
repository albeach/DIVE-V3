# Remote Deployment JWT Validation Fix

## Problem
On remote machines, accessing resources results in:
```
Access Denied: Invalid or expired JWT token, classification unknown
```

Additionally, OPA shows as unhealthy and reports "can't provide a secure connection".

## Root Causes

### 1. JWT Issuer Mismatch
**Problem**: Keycloak `KC_HOSTNAME` is set to `localhost`, but remote tokens use the actual hostname/IP.

**How it fails**:
1. Keycloak issues JWT with `iss: "https://your-server-ip:8443/realms/dive-v3-broker"`
2. Backend expects `iss: "https://localhost:8443/realms/dive-v3-broker"`
3. JWT verification fails → "Invalid or expired JWT token"

**Fix**: Set `KC_HOSTNAME` to your server's hostname or IP.

### 2. OPA SSL Error
**Problem**: Trying to access OPA via HTTPS when it only supports HTTP.

**How it fails**:
- OPA runs on `http://opa:8181` (HTTP only, no SSL)
- Browser/tools try `https://your-server-ip:8181` → "can't provide a secure connection"
- OPA healthcheck fails

**Fix**: OPA is internal-only, should not be accessed directly from browser.

## Solution

### Step 1: Update KC_HOSTNAME for Remote Access

**Edit**: `docker-compose.yml` line 47

```yaml
# BEFORE (localhost only):
KC_HOSTNAME: localhost

# AFTER (remote access):
KC_HOSTNAME: your-server-hostname.com
# Or use IP if no DNS:
KC_HOSTNAME: 192.168.1.100
```

**Important**: Use the **same hostname/IP that users access the frontend with**.

### Step 2: Restart Keycloak

```bash
docker compose restart keycloak

# Wait for Keycloak to be ready (1-2 minutes)
docker compose logs keycloak -f
# Look for: "started in X ms"
```

### Step 3: Clear Browser Sessions

After changing `KC_HOSTNAME`, all existing tokens are invalid. Users must re-login:

```bash
# Option A: Clear user sessions via Keycloak Admin
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password admin
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh delete sessions/dive-v3-broker

# Option B: Have users logout and login again via browser
```

### Step 4: Verify JWT Issuer

After restart, check that new tokens have the correct issuer:

```bash
# Login to frontend, copy access token from browser dev tools
# Decode token at https://jwt.io or use:
echo "YOUR_TOKEN_HERE" | cut -d. -f2 | base64 -d | jq .

# Check "iss" field matches your KC_HOSTNAME:
# Expected: "https://your-server-hostname.com:8443/realms/dive-v3-broker"
```

### Step 5: Verify Backend Configuration

Check that backend knows about the new hostname:

**Edit**: `docker-compose.yml` line 168-172

```yaml
# Update KEYCLOAK_URL and KEYCLOAK_JWKS_URI to match KC_HOSTNAME
KEYCLOAK_URL: https://your-server-hostname.com:8443
KEYCLOAK_JWKS_URI: https://your-server-hostname.com:8443/realms/dive-v3-broker/protocol/openid-connect/certs
```

**Then restart backend**:
```bash
docker compose restart backend
```

## OPA Health Check

OPA is **internal-only** and should **not** be accessed from the browser:

### Correct Access:
- ✅ Backend → OPA: `http://opa:8181` (Docker network, HTTP)
- ✅ Health check from inside container: `docker compose exec backend curl http://opa:8181/health`

### Incorrect Access:
- ❌ Browser → OPA: `https://your-server-ip:8181` (external, tries HTTPS)
- ❌ Direct external access (OPA has no SSL/TLS)

### Check OPA Status (Correct Way):
```bash
# From host machine:
docker compose exec backend curl -s http://opa:8181/health
# Should return: {}

# Check OPA logs:
docker compose logs opa --tail 20

# Check OPA policies loaded:
docker compose exec backend curl -s http://opa:8181/v1/policies
```

If OPA is unhealthy, check:
1. Is OPA container running? `docker compose ps opa`
2. Are policies mounted? `docker compose exec opa ls -la /policies`
3. Check OPA logs: `docker compose logs opa --tail 50`

## Complete Fix Script

Save as `scripts/fix-remote-hostname.sh`:

```bash
#!/bin/bash
set -euo pipefail

# Get current hostname/IP
echo "Current hostname: $(hostname)"
echo "Current IP: $(hostname -I | awk '{print $1}')"
echo ""
read -p "Enter hostname or IP for KC_HOSTNAME (e.g., 192.168.1.100): " NEW_HOSTNAME

if [ -z "$NEW_HOSTNAME" ]; then
    echo "Error: Hostname cannot be empty"
    exit 1
fi

echo ""
echo "Updating KC_HOSTNAME to: $NEW_HOSTNAME"

# Update docker-compose.yml
sed -i.bak "s/KC_HOSTNAME: localhost/KC_HOSTNAME: $NEW_HOSTNAME/" docker-compose.yml
sed -i.bak "s|KEYCLOAK_URL: https://keycloak:8443|KEYCLOAK_URL: https://$NEW_HOSTNAME:8443|" docker-compose.yml
sed -i.bak "s|KEYCLOAK_JWKS_URI: https://keycloak:8443|KEYCLOAK_JWKS_URI: https://$NEW_HOSTNAME:8443|" docker-compose.yml
sed -i.bak "s|NEXT_PUBLIC_KEYCLOAK_URL: https://localhost:8443|NEXT_PUBLIC_KEYCLOAK_URL: https://$NEW_HOSTNAME:8443|" docker-compose.yml

echo "✓ Updated docker-compose.yml"
echo ""
echo "Restarting services..."

docker compose restart keycloak
sleep 5
docker compose restart backend
docker compose restart nextjs

echo ""
echo "✓ Services restarted"
echo ""
echo "Next steps:"
echo "  1. Wait 1-2 minutes for Keycloak to initialize"
echo "  2. Clear browser cache and cookies"
echo "  3. Login again at https://$NEW_HOSTNAME:3000"
echo "  4. Verify tokens have correct issuer: https://$NEW_HOSTNAME:8443/realms/dive-v3-broker"
```

Make executable and run:
```bash
chmod +x scripts/fix-remote-hostname.sh
./scripts/fix-remote-hostname.sh
```

## Verification Checklist

After applying the fix:

- [ ] Keycloak started successfully (`docker compose logs keycloak | grep "started in"`)
- [ ] New tokens have correct issuer (use jwt.io to decode)
- [ ] Backend can verify tokens (no "Invalid or expired JWT" errors)
- [ ] Resources are accessible (no "Access Denied" errors)
- [ ] OPA health check passes: `docker compose exec backend curl http://opa:8181/health`
- [ ] Backend logs show successful OPA calls: `docker compose logs backend | grep "OPA response received"`

## Troubleshooting

### Issue: Still getting "Invalid or expired JWT"

**Check 1**: Verify KC_HOSTNAME matches token issuer
```bash
# Extract issuer from token:
echo "$TOKEN" | cut -d. -f2 | base64 -d | jq .iss

# Check KC_HOSTNAME in docker-compose:
grep "KC_HOSTNAME:" docker-compose.yml
```

**Check 2**: Verify backend knows correct JWKS endpoint
```bash
# Check backend env:
docker compose exec backend env | grep KEYCLOAK

# Test JWKS endpoint manually:
curl -k https://your-hostname:8443/realms/dive-v3-broker/protocol/openid-connect/certs
```

**Check 3**: Old tokens still in use
```bash
# Clear browser cache completely
# Or use incognito/private browsing mode
# Then login again
```

### Issue: OPA still shows as unhealthy

**Check 1**: OPA container status
```bash
docker compose ps opa
# Should show: "Up" and healthy
```

**Check 2**: OPA accessible from backend
```bash
docker compose exec backend curl -v http://opa:8181/health
# Should return HTTP 200 with empty JSON: {}
```

**Check 3**: Policies loaded
```bash
docker compose exec backend curl http://opa:8181/v1/policies | jq .
# Should show loaded policies
```

**Fix**: Restart OPA if needed
```bash
docker compose restart opa
sleep 5
docker compose logs opa --tail 20
```

## Security Note

For production deployments:
1. Use proper DNS hostname (not IP)
2. Use valid SSL certificates (not self-signed)
3. Set `KC_HOSTNAME_STRICT: true`
4. Set `NODE_TLS_REJECT_UNAUTHORIZED: "1"` (strict SSL validation)
5. Firewall OPA port 8181 (internal-only, not exposed to internet)

## References

- Keycloak Hostname Configuration: https://www.keycloak.org/server/hostname
- DIVE V3 Multi-Realm Architecture: `docs/federation-architecture-diagram.txt`
- JWT Verification Logic: `backend/src/middleware/authz.middleware.ts` lines 292-452
- OPA Integration: `backend/src/middleware/authz.middleware.ts` lines 623-669


