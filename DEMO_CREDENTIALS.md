# DIVE V3 - Demo Credentials

**Generated for presentation/demo purposes**

## Quick Reference

- **Demo Users**: `demo-{instance}-{level}` (e.g., `demo-usa-1`)
- **Password**: `Demo2025!Secure`
- **OTP Code**: Use code `123456` for demo (requires `DEMO_MODE=true`)
- **Super Admin**: `admin-{instance}` (e.g., `admin-usa`)
- **Super Admin Password**: `Admin2025!Secure`

**⚠️ IMPORTANT**: Enable demo mode before using OTP code `123456`:
```bash
export DEMO_MODE=true
# OR add to docker-compose.yml: DEMO_MODE: "true"
```

---

## Demo Users (4 per instance)

### USA Instance

| Username | Clearance | Password | MFA Required |
|----------|-----------|----------|---------------|
| `demo-usa-1` | UNCLASSIFIED | `Demo2025!Secure` | No |
| `demo-usa-2` | CONFIDENTIAL | `Demo2025!Secure` | Yes (OTP) |
| `demo-usa-3` | SECRET | `Demo2025!Secure` | Yes (OTP) |
| `demo-usa-4` | TOP_SECRET | `Demo2025!Secure` | Yes (WebAuthn) |

### FRA Instance

| Username | Clearance | Password | MFA Required |
|----------|-----------|----------|---------------|
| `demo-fra-1` | UNCLASSIFIED | `Demo2025!Secure` | No |
| `demo-fra-2` | CONFIDENTIAL | `Demo2025!Secure` | Yes (OTP) |
| `demo-fra-3` | SECRET | `Demo2025!Secure` | Yes (OTP) |
| `demo-fra-4` | TOP_SECRET | `Demo2025!Secure` | Yes (WebAuthn) |

### GBR Instance

| Username | Clearance | Password | MFA Required |
|----------|-----------|----------|---------------|
| `demo-gbr-1` | UNCLASSIFIED | `Demo2025!Secure` | No |
| `demo-gbr-2` | CONFIDENTIAL | `Demo2025!Secure` | Yes (OTP) |
| `demo-gbr-3` | SECRET | `Demo2025!Secure` | Yes (OTP) |
| `demo-gbr-4` | TOP_SECRET | `Demo2025!Secure` | Yes (WebAuthn) |

### DEU Instance

| Username | Clearance | Password | MFA Required |
|----------|-----------|----------|---------------|
| `demo-deu-1` | UNCLASSIFIED | `Demo2025!Secure` | No |
| `demo-deu-2` | CONFIDENTIAL | `Demo2025!Secure` | Yes (OTP) |
| `demo-deu-3` | SECRET | `Demo2025!Secure` | Yes (OTP) |
| `demo-deu-4` | TOP_SECRET | `Demo2025!Secure` | Yes (WebAuthn) |

---

## Super Admin Users

Super admin users have the `super_admin` role and can access `/admin/dashboard` and all administrative resources.

| Instance | Username | Password | OTP Code |
|----------|----------|----------|----------|
| USA | `admin-usa` | `Admin2025!Secure` | `123456` |
| FRA | `admin-fra` | `Admin2025!Secure` | `123456` |
| GBR | `admin-gbr` | `Admin2025!Secure` | `123456` |
| DEU | `admin-deu` | `Admin2025!Secure` | `123456` |

---

## MFA Setup

### OTP (TOTP) Setup

For users requiring OTP (CONFIDENTIAL, SECRET):
- **OTP Secret**: Pre-configured in Redis
- **OTP Code**: Use `123456` for demo purposes
- **Algorithm**: SHA256
- **Digits**: 6
- **Period**: 30 seconds

**Note**: The OTP secret is stored in Redis and will be used by the Custom SPI to create the credential on first login. For demo purposes, you can use code `123456` or calculate the current code using the secret.

### WebAuthn (Passkey) Setup

For TOP_SECRET users:
- **Method**: WebAuthn Passwordless
- **Requirement**: Physical security key (YubiKey) or platform authenticator
- **Setup**: Register passkey on first login

---

## Setup Instructions

### 1. Enable Demo Mode

```bash
export DEMO_MODE=true
# OR add to docker-compose.yml environment section
```

### 2. Create Demo Users

```bash
cd backend
npm run setup-demo-users
```

This will:
- Create 4 demo users per instance (DEU, USA, FRA, GBR)
- Create super admin users per instance
- Configure MFA requirements
- Store OTP secrets in Redis
- Assign super_admin role to admin users

### 3. Test Demo Users

```bash
cd backend
npm run test-demo-users
```

This will:
- Test login for all demo users
- Verify super admin role assignment
- Test admin dashboard access

---

## Demo Scenarios

### Scenario 1: Basic User Login (UNCLASSIFIED)
1. Login as `demo-usa-1` with password `Demo2025!Secure`
2. No MFA required (AAL1)
3. Access UNCLASSIFIED resources

### Scenario 2: MFA Login (CONFIDENTIAL/SECRET)
1. Login as `demo-usa-2` with password `Demo2025!Secure`
2. Enter OTP code: `123456`
3. Access CONFIDENTIAL resources

### Scenario 3: Super Admin Dashboard
1. Login as `admin-usa` with password `Admin2025!Secure`
2. Enter OTP code: `123456`
3. Navigate to `/admin/dashboard`
4. Access administrative resources

### Scenario 4: Cross-Instance Federation
1. Login to USA instance as `demo-fra-3` (French user on US system)
2. Access resources based on clearance and releasability
3. Demonstrate federated identity

---

## Troubleshooting

### OTP Code Not Working

If `123456` doesn't work:
1. Check Redis is running: `docker ps | grep redis`
2. Verify OTP secret is stored: Check Redis for key `otp:pending:{userId}`
3. Use current code from authenticator app (if configured)
4. Re-run setup: `npm run setup-demo-users`

### Super Admin Role Missing

If super admin role is not assigned:
1. Verify role exists: Check Keycloak Admin Console → Roles → `super_admin`
2. Re-run setup: `npm run setup-demo-users`
3. Manually assign role via Keycloak Admin Console

### MFA Not Required

If MFA is not being prompted:
1. Check user's clearance level
2. Verify required actions are set: `CONFIGURE_TOTP` or `webauthn-register-passwordless`
3. Check authentication flow configuration
4. Re-run setup: `npm run setup-demo-users`

---

## Security Notes

⚠️ **FOR DEMO USE ONLY**

- These credentials are for demonstration purposes only
- Do NOT use in production environments
- OTP codes are predictable for demo convenience
- Change all passwords after demo
- Rotate OTP secrets after demo

---

## Support

For issues or questions:
1. Check logs: `docker-compose logs backend`
2. Verify Keycloak: `docker-compose logs keycloak`
3. Check Redis: `docker-compose logs redis`
4. Review setup script output for errors

---

**Last Updated**: Generated by `setup-demo-users.ts` script
**Script Location**: `backend/src/scripts/setup-demo-users.ts`

