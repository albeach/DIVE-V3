# MFA and Passkey Handling in Playwright Tests

## Overview

DIVE V3 Playwright tests support MFA (Multi-Factor Authentication) and Passkey (WebAuthn) authentication. This document explains how to handle MFA in tests.

## MFA Requirements by Clearance Level

| Clearance Level | MFA Required | MFA Type |
|----------------|--------------|----------|
| UNCLASSIFIED   | No           | None     |
| CONFIDENTIAL   | Yes          | OTP (TOTP) |
| SECRET         | Yes          | OTP (TOTP) |
| TOP_SECRET     | Yes          | WebAuthn/Passkey |

## Options for Handling MFA in Tests

### Option 1: Bypass MFA (skipMFA: true)

**Use Case**: Feature demonstrations where MFA is not the focus

```typescript
await loginAs(page, TEST_USERS.USA.SECRET, { 
  skipMFA: true // Bypass MFA prompts
});
```

**Note**: This may fail if Keycloak strictly enforces MFA and doesn't allow bypass.

### Option 2: Provide OTP Code

**Use Case**: Testing OTP flow with real Keycloak

```typescript
await loginAs(page, TEST_USERS.USA.SECRET, { 
  otpCode: '123456' // Real OTP code from authenticator app
});
```

**Limitation**: The hardcoded '123456' fallback won't work with real Keycloak. You need:
- Real OTP codes from an authenticator app, OR
- Keycloak configured with a test OTP secret that generates predictable codes

### Option 3: WebAuthn Virtual Authenticator (Automatic)

**Use Case**: Testing WebAuthn/Passkey flows

```typescript
await loginAs(page, TEST_USERS.USA.TOP_SECRET);
// WebAuthn is automatically mocked via virtual authenticator
```

**How it works**: Playwright's `setupVirtualAuthenticator()` creates a virtual FIDO2 authenticator that simulates WebAuthn without requiring physical hardware.

## Implementation Details

### OTP Handling

The `handleMFALogin()` function:
1. Waits for OTP input field
2. Fills OTP code (from `otpCode` parameter or default '123456')
3. Submits the form

**Current Limitation**: The default '123456' code won't work with real Keycloak TOTP. For real testing, you need:
- Real OTP codes, OR
- Keycloak test mode with predictable OTP codes

### WebAuthn Handling

The `setupVirtualAuthenticator()` function:
1. Creates a virtual FIDO2 authenticator via Chrome DevTools Protocol (CDP)
2. Configures it with CTAP2.1 protocol
3. Enables automatic presence simulation
4. Handles WebAuthn registration and authentication automatically

**Status**: ✅ Fully functional - WebAuthn is completely mocked

## Recommendations

### For Feature Demonstrations

Use `skipMFA: true` to focus on feature functionality:

```typescript
test('User can access resources', async ({ page }) => {
  await loginAs(page, TEST_USERS.USA.SECRET, { skipMFA: true });
  // ... test resource access
});
```

### For MFA Testing

1. **OTP Testing**: Configure Keycloak test users with known OTP secrets, or use a TOTP library to generate codes
2. **WebAuthn Testing**: Already handled automatically via virtual authenticator

### For Production-Like Testing

1. Configure Keycloak to allow MFA bypass for test users, OR
2. Use real OTP codes from authenticator apps, OR
3. Configure Keycloak with test OTP secrets that generate predictable codes

## Example: Comprehensive Test with MFA Bypass

```typescript
test('All clearance levels can authenticate', async ({ page }) => {
  // UNCLASSIFIED - no MFA
  await loginAs(page, TEST_USERS.USA.UNCLASS);
  
  // CONFIDENTIAL - bypass OTP for demo
  await loginAs(page, TEST_USERS.USA.CONFIDENTIAL, { skipMFA: true });
  
  // SECRET - bypass OTP for demo
  await loginAs(page, TEST_USERS.USA.SECRET, { skipMFA: true });
  
  // TOP_SECRET - WebAuthn automatically mocked
  await loginAs(page, TEST_USERS.USA.TOP_SECRET);
});
```

## Troubleshooting

### MFA Bypass Fails

If `skipMFA: true` fails, Keycloak may be enforcing MFA. Options:
1. Configure Keycloak to allow MFA bypass for test users
2. Use real OTP codes
3. Disable MFA requirement for test users in Keycloak

### OTP Code Doesn't Work

The default '123456' code is a placeholder. For real testing:
1. Extract OTP secret from Keycloak during first-time setup
2. Use a TOTP library to generate valid codes
3. Configure Keycloak with a test secret

### WebAuthn Fails

Virtual authenticator should work automatically. If it fails:
1. Check browser console for errors
2. Verify Playwright version supports virtual authenticators
3. Check Keycloak WebAuthn configuration




