# DIVE V3 - Demo Setup Instructions

**Quick setup guide for presentation/demo**

## Prerequisites

1. All instances running (DEU, USA, FRA, GBR)
2. Redis running (for OTP secret storage)
3. Backend API running
4. Keycloak instances accessible

## Step 1: Enable Demo Mode

Set environment variable to enable demo OTP code override:

```bash
export DEMO_MODE=true
# OR
export NODE_ENV=demo
```

Add to `docker-compose.yml` or `.env`:
```yaml
environment:
  DEMO_MODE: "true"
```

## Step 2: Create Demo Users

Run the setup script:

```bash
cd backend
npm run setup-demo-users
```

This will:
- ✅ Create 4 demo users per instance (16 total)
- ✅ Create 4 super admin users (1 per instance)
- ✅ Configure MFA requirements
- ✅ Store OTP secrets in Redis
- ✅ Assign super_admin role

## Step 3: Test Setup

Verify everything works:

```bash
cd backend
npm run test-demo-users
```

## Step 4: Get Current OTP Code (Optional)

If demo mode is disabled, get the current OTP code:

```bash
cd backend
npm run get-demo-otp
```

## Demo Credentials

See `DEMO_CREDENTIALS.md` for the complete list.

**Quick Reference:**
- **Demo Users**: `demo-{instance}-{level}` / `Demo2025!Secure`
- **Super Admin**: `admin-{instance}` / `Admin2025!Secure`
- **OTP Code**: `123456` (when DEMO_MODE=true)

## Troubleshooting

### OTP Code Not Working

1. **Check DEMO_MODE is enabled:**
   ```bash
   echo $DEMO_MODE
   # Should output: true
   ```

2. **Restart services:**
   ```bash
   docker-compose restart backend keycloak
   ```

3. **Verify Redis is running:**
   ```bash
   docker ps | grep redis
   ```

4. **Check OTP secret in Redis:**
   ```bash
   docker exec -it dive-v3-redis redis-cli
   > KEYS otp:pending:*
   ```

### Super Admin Role Missing

1. **Re-run setup:**
   ```bash
   npm run setup-demo-users
   ```

2. **Manually assign role via Keycloak Admin Console:**
   - Login to Keycloak Admin Console
   - Navigate to Users → Select user → Role Mappings
   - Assign `super_admin` role

### Users Not Created

1. **Check Keycloak connection:**
   ```bash
   curl http://localhost:8080/health
   ```

2. **Verify admin credentials:**
   - Check GCP Secret Manager
   - Or use default: `DivePilot2025!SecureAdmin`

3. **Check logs:**
   ```bash
   docker-compose logs backend | grep "setup-demo-users"
   ```

## Demo Flow

1. **Login as demo user:**
   - Username: `demo-usa-2`
   - Password: `Demo2025!Secure`
   - OTP: `123456` (if MFA required)

2. **Access resources:**
   - Based on clearance level
   - Test authorization policies

3. **Login as super admin:**
   - Username: `admin-usa`
   - Password: `Admin2025!Secure`
   - OTP: `123456`

4. **Access admin dashboard:**
   - Navigate to `/admin/dashboard`
   - View system metrics
   - Manage IdPs

## Security Notes

⚠️ **FOR DEMO USE ONLY**

- Demo mode accepts `123456` as valid OTP code
- Do NOT enable in production
- Change all passwords after demo
- Disable DEMO_MODE after demo

---

**Last Updated**: Generated with demo setup scripts
**Scripts**: `backend/src/scripts/setup-demo-users.ts`, `test-demo-users.ts`



