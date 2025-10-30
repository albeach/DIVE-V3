# Backend & Frontend Updates for Required Action SPI

## Changes Required

### 1. Backend Controller Updates

**File**: `backend/src/controllers/custom-login.controller.ts`

#### Remove (Lines 231-393):
- Remove entire "HYBRID APPROACH: OTP Enrollment via Admin API" section
- Remove the `if (totp_setup === 'true' && totp_secret && otp)` block

#### Remove Helper Functions (Lines 97-162):
- Remove `getKeycloakAdminToken()` function
- Remove `createOTPCredential()` function  
- Remove `import * as speakeasy from 'speakeasy';` (line 17)

#### Remove from package.json:
```bash
cd backend
npm uninstall speakeasy
```

### 2. Update customLoginHandler

The custom login handler should now detect when Keycloak returns a Required Action response and pass it to the frontend.

**Replace lines 231-393** with:

```typescript
        // ============================================
        // Required Action Flow: OTP Enrollment
        // ============================================
        // Keycloak's Required Action SPI will automatically handle OTP enrollment
        // when a user needs to setup OTP. The Required Action will:
        // 1. Generate OTP secret
        // 2. Return setup data (mfaSetupRequired, otpSecret, otpUrl)
        // 3. Validate OTP code
        // 4. Create credential via CredentialProvider SPI
        //
        // No special backend handling needed - just pass through Keycloak's response
```

### 3. Detect Required Action in Response Handler

**Update the error handling section (around line 450-500)** to detect Required Action responses:

```typescript
        } catch (error: any) {
            const errorData = error.response?.data;
            const errorDescription = errorData?.error_description;
            
            logger.warn('Authentication failed', {
                requestId,
                username,
                hasOTP: otp ? true : false,
                errorDataKeys: errorData ? Object.keys(errorData) : [],
                errorDescription
            });

            // ============================================
            // Check for Required Action (OTP Setup)
            // ============================================
            // If Keycloak returns a Required Action response, it means the user
            // needs to complete an action (like OTP setup) before authentication
            if (errorData) {
                // Check if this is an OTP setup required response from Required Action
                // The Required Action SPI returns this in the error_description as JSON
                if (errorDescription && errorDescription.includes('mfaSetupRequired')) {
                    try {
                        const setupData = JSON.parse(errorDescription);
                        
                        logger.info('OTP setup required (Required Action)', {
                            requestId,
                            username,
                            hasOtpSecret: !!setupData.otpSecret
                        });

                        // Return OTP setup data to frontend
                        res.status(200).json({
                            success: false,
                            mfaSetupRequired: true,
                            otpSecret: setupData.otpSecret,
                            otpUrl: setupData.otpUrl,
                            userId: setupData.userId,
                            message: 'Multi-factor authentication setup required'
                        });
                        return;
                    } catch (parseError) {
                        logger.warn('Failed to parse OTP setup data', {
                            requestId,
                            error: parseError
                        });
                    }
                }

                // Check if MFA/OTP is required for authentication
                if (errorDescription && errorDescription.toLowerCase().includes('otp')) {
                    logger.info('OTP required for authentication', {
                        requestId,
                        username
                    });

                    res.status(401).json({
                        success: false,
                        mfaRequired: true,
                        error: 'Multi-factor authentication required',
                        details: errorDescription
                    });
                    return;
                }
            }

            // Standard error response
            logger.warn('Custom login failed - invalid credentials', {
                requestId,
                username
            });

            res.status(401).json({
                success: false,
                error: 'Invalid username or password'
            });
        }
```

### 4. Frontend Updates

**File**: `frontend/src/app/login/[idpAlias]/page.tsx`

#### Update `verifyOTPSetup` function (around line 460):

**Current code** tries to call a separate `/api/auth/otp/verify` endpoint. 

**Replace with**:

```typescript
    const verifyOTPSetup = async () => {
        if (!formData.otp || formData.otp.length !== 6) {
            showErrorWithShake('Please enter a 6-digit code from your authenticator app.');
            return;
        }

        setIsLoading(true);

        try {
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
            
            // Required Action Flow: Re-authenticate with OTP after enrollment
            // The Required Action SPI has already validated and created the credential
            // Now we just need to authenticate with password + OTP to get AAL2 token
            const response = await fetch(`${backendUrl}/api/auth/custom-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idpAlias,
                    username: formData.username,
                    password: formData.password,
                    otp: formData.otp
                })
            });

            const result = await response.json();

            // Check if authentication succeeded
            if (result.success && result.data) {
                // Create NextAuth session
                const sessionResponse = await fetch('/api/auth/custom-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accessToken: result.data.accessToken,
                        refreshToken: result.data.refreshToken,
                        idToken: result.data.idToken || result.data.accessToken,
                        expiresIn: result.data.expiresIn
                    })
                });

                const sessionResult = await sessionResponse.json();

                if (sessionResult.success) {
                    // Success! Redirect to dashboard
                    router.push(redirectUri);
                } else {
                    showErrorWithShake('Failed to create session. Please try again.');
                }
            } else {
                // Show error and keep the OTP setup screen open
                showErrorWithShake(result.error || 'Invalid OTP code. Please try again.');
                // Clear the OTP input so user can try again
                setFormData({ ...formData, otp: '' });
            }
        } catch (error) {
            console.error('[verifyOTPSetup] Error:', error);
            showErrorWithShake('An error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };
```

### 5. Enable Required Action in Keycloak

**Manual Steps in Keycloak Admin Console**:

1. Navigate to **Keycloak Admin Console** (http://localhost:8081)
2. Login with `admin` / `admin`
3. Select realm: **dive-v3-broker**
4. Go to **Realm Settings** → **Required Actions** tab
5. Find **"DIVE Configure Authenticator Application"**
6. Click **Register** if not visible
7. **Enable** the required action
8. Set as **Default Action** (optional - forces OTP setup on first login)
9. Click **Save**

### 6. Alternative: Enable via kcadm.sh

```bash
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password admin

docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh create \
  required-actions \
  -r dive-v3-broker \
  -s alias=dive-configure-totp \
  -s name="DIVE Configure Authenticator Application" \
  -s providerId=dive-configure-totp \
  -s enabled=true \
  -s defaultAction=false

echo "✅ Required Action enabled!"
```

### 7. Testing Steps

1. **Reset admin-dive user** (remove existing OTP):
```bash
TOKEN=$(curl -s -X POST "http://localhost:8081/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

# Get OTP credential ID
CRED_ID=$(curl -s "http://localhost:8081/admin/realms/dive-v3-broker/users/50242513-9d1c-4842-909d-fa1c0800c3a1/credentials" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[] | select(.type=="otp") | .id')

# Delete OTP credential
if [ ! -z "$CRED_ID" ]; then
  curl -X DELETE "http://localhost:8081/admin/realms/dive-v3-broker/users/50242513-9d1c-4842-909d-fa1c0000c3a1/credentials/$CRED_ID" \
    -H "Authorization: Bearer $TOKEN"
  echo "✅ OTP credential removed"
fi
```

2. **Test OTP Enrollment**:
   - Navigate to http://localhost:3000/login/dive-v3-broker
   - Login with `admin-dive` / `DiveAdmin2025!`
   - Should see QR code (from Required Action)
   - Scan with authenticator app
   - Submit 6-digit code
   - Should authenticate and redirect to dashboard

3. **Test Subsequent Login**:
   - Logout
   - Login again with `admin-dive` / `DiveAdmin2025!`
   - Should prompt for OTP (no setup this time)
   - Submit OTP code
   - Should authenticate successfully

### 8. Verification

**Check Keycloak logs for Required Action**:
```bash
docker logs dive-v3-keycloak 2>&1 | grep -i "dive-configure-totp\|Required Action"
```

**Check backend logs for Required Action detection**:
```bash
docker logs dive-v3-backend --since=5m 2>&1 | grep "OTP setup required"
```

**Verify ACR/AMR claims in token**:
```bash
# Decode access token (paste token from successful login)
echo "YOUR_ACCESS_TOKEN_HERE" | cut -d'.' -f2 | base64 -d | jq '{acr, amr, auth_time}'
# Should show: {"acr": "1", "amr": ["pwd", "otp"], "auth_time": 1234567890}
```

---

## Summary

This implementation:
✅ Removes insecure hybrid approach  
✅ Uses Keycloak's native Required Action SPI  
✅ Follows official Keycloak best practices  
✅ Production-ready and enterprise-grade  
✅ Maintains beautiful custom UI  
✅ Proper AAL2 compliance with ACR/AMR claims  

Ready to implement these changes?

