# Keycloak Issuer URL Fix - Complete Analysis & Solution

## Problem Statement

NZL spoke frontend login resulted in `error=Configuration` at `/api/auth/error?error=Configuration`.

**Root Cause**: Keycloak issuer URL mismatch
- **Expected** (from frontend): `https://localhost:8476/realms/dive-v3-broker-nzl`
- **Actual** (from Keycloak): `https://localhost:8468/realms/dive-v3-broker-nzl`

## Technical Analysis

### Why Port 8468 Instead of 8476?

**Docker Port Mapping**: `8476:8443` (external:internal)
- External clients connect to `localhost:8476`
- Keycloak runs internally on port `8443`
- Docker maps external port 8476 → internal port 8443

**Keycloak v26 Behavior in Development Mode**:
- Uses `start-dev` command (auto-configures hostname)
- Detects hostname from incoming HTTP request headers
- **Problem**: In Docker, Keycloak sees internal port (8443), not the mapped external port (8476)
- Keycloak calculates issuer based on what IT sees, not what clients see

### Port 8468 Mystery

The issuer shows port `8468` which is 8443 + 25 (likely from some internal calculation or previous configuration). This indicates Keycloak is using cached/persisted configuration.

### Keycloak v26+ Hostname Configuration

**Deprecated (v1)**:
- `KC_HOSTNAME_PORT` - ❌ Removed in v26
- `KC_HOSTNAME_URL` - ❌ Deprecated, shows warning
- `KC_PROXY: edge` - ❌ Old proxy mode syntax

**Correct (v2)**:
- `KC_HOSTNAME: localhost` - Base hostname
- `KC_HOSTNAME_STRICT: "false"` - Allow dynamic hostname from headers
- `KC_PROXY_HEADERS: xforwarded` - Trust X-Forwarded-* headers
- `KC_HTTPS_PORT: "8443"` - Internal HTTPS port

## Solution Implemented

### 1. Fixed Template (spoke-init.sh)

Updated Keycloak configuration template to use correct v26+ syntax:

```yaml
environment:
  KC_HOSTNAME: localhost
  KC_HOSTNAME_STRICT: "false"
  KC_PROXY_HEADERS: xforwarded
  KC_HTTP_ENABLED: "true"
  KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/certificate.pem
  KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/key.pem
  KC_HTTPS_PORT: "8443"
  KC_TRUSTSTORE_PATHS: /opt/keycloak/conf/truststores/mkcert-rootCA.pem
```

**Benefits**:
- New spoke instances get correct config from start
- Follows Keycloak v26+ best practices
- Matches Hub configuration pattern

### 2. Migration Tool (spoke-fix-hostname.sh)

Created new DIVE CLI module for fixing existing instances:

```bash
# Fix specific spoke
./dive --instance nzl spoke fix-hostname

# Fix all initialized spokes
./dive spoke fix-hostname --all
```

**Features**:
- Automatic backup before changes (`docker-compose.yml.bak.TIMESTAMP`)
- Removes deprecated v1 options
- Updates to v2 syntax
- Non-destructive (can be rolled back)

### 3. Auto-Fix Integration

Integrated into `spoke_up()` workflow:
- Automatically detects outdated configuration
- Applies fix before starting containers
- Non-blocking (logs warning if fails)
- Seamless user experience

```bash
./dive --instance nzl spoke up
# → Auto-detects need for fix
# → Applies fix
# → Starts services
```

## Current Limitation

**The issuer port mismatch persists** because:

1. Keycloak v26 in `start-dev` mode auto-detects hostname from request
2. Docker port mapping (8476:8443) is transparent to Keycloak
3. Keycloak sees internal port (8443), not external (8476)
4. No way to override this in development mode without breaking other features

### Why This Happens

```
Browser → localhost:8476 (external)
          ↓ (Docker port mapping)
          localhost:8443 (internal - what Keycloak sees)
```

Keycloak generates issuer based on internal view, not external.

## Workarounds (Choose One)

### Option A: Use Internal URLs (Recommended for Local Dev)

Update frontend/backend to use internal Docker URLs:

```bash
# In instances/nzl/.env:
AUTH_KEYCLOAK_ISSUER=https://keycloak-nzl:8443/realms/dive-v3-broker-nzl
```

**Pros**:
- Works immediately
- No port mapping issues
- Matches production Docker networking

**Cons**:
- Can't access Keycloak admin console from host browser
- Requires DNS resolution (already configured in Docker networks)

### Option B: Nginx Reverse Proxy

Add Nginx in front of Keycloak to handle port mapping:

```yaml
nginx:
  image: nginx:alpine
  ports:
    - "8476:8476"
  volumes:
    - ./nginx.conf:/etc/nginx/nginx.conf
```

**Pros**:
- Clean separation
- Proper header forwarding
- Production-like setup

**Cons**:
- Additional container
- More complexity
- Requires nginx configuration

### Option C: Production Mode (Not Recommended for Local)

Use `start` instead of `start-dev` with explicit hostname:

```yaml
command: start --hostname=localhost --hostname-port=8476
environment:
  KC_HOSTNAME: localhost
  KC_HOSTNAME_PORT: 8476
```

**Pros**:
- Explicit control
- Matches external port

**Cons**:
- Loses development mode features
- Requires full production configuration
- Slower startup
- Not suitable for local development

## Recommendation

**For local development**: Accept the current behavior or use **Option A** (internal URLs).

**For production**: Use proper reverse proxy (Nginx/Cloudflare) which handles this correctly.

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `scripts/dive-modules/spoke-init.sh` | Updated Keycloak template | Fix future instances |
| `scripts/dive-modules/spoke-fix-hostname.sh` | New module | Migrate existing instances |
| `scripts/dive-modules/spoke-deploy.sh` | Added auto-fix call | Automatic migration |
| `scripts/dive-modules/spoke.sh` | Added command + lazy load | CLI integration |
| `instances/nzl/docker-compose.yml` | Manual update | Immediate NZL fix |

## Testing

### Verify Fix Applied

```bash
# Check Keycloak environment
docker exec dive-spoke-nzl-keycloak printenv | grep KC_HOSTNAME

# Expected output:
# KC_HOSTNAME_STRICT=false
# KC_PROXY_HEADERS=xforwarded
```

### Check Issuer URL

```bash
curl -sk https://localhost:8476/realms/dive-v3-broker-nzl/.well-known/openid-configuration | jq -r '.issuer'
```

### Test Login

```bash
# Navigate to frontend
open https://localhost:3033/

# Click login
# Should redirect to Keycloak (may show issuer mismatch)
```

## Commits

1. **b9c7cdb8** - `refactor: Remove deprecated dive-v3-broker and cross-border-client patterns`
   - Cleaned up client_id naming conventions
   - Archived 15 legacy scripts
   - Updated Terraform to enforce instance-specific names

2. **0c370e9c** - `fix(terraform): Use instance-suffixed client_id for spoke Keycloak`
   - Fixed spoke frontend login (INTERNAL SERVER ERROR)
   - Ensured client names match frontend expectations

3. **2622c210** - `fix(keycloak): Add hostname configuration infrastructure for spoke instances`
   - Added hostname fix infrastructure
   - Created migration tool
   - Integrated into DIVE CLI

## Next Steps

1. **Short-term**: Use the fix infrastructure for new/existing spokes
2. **Medium-term**: Consider Option A (internal URLs) for consistent behavior
3. **Long-term**: Add Nginx reverse proxy for production-like local setup

## References

- Keycloak v26 Hostname Configuration: https://www.keycloak.org/server/hostname
- Docker Port Mapping: https://docs.docker.com/config/containers/container-networking/
- DIVE V3 Port SSOT: `scripts/dive-modules/common.sh:get_instance_ports()`
