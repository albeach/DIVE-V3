package com.dive.keycloak.authenticator;

import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.Authenticator;
import org.keycloak.credential.CredentialModel;
import org.keycloak.credential.OTPCredentialProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserCredentialModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.credential.OTPCredentialModel;
import org.keycloak.models.utils.HmacOTP;
import org.keycloak.models.utils.TimeBasedOTP;
import org.keycloak.utils.CredentialHelper;

import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * DIVE V3 Custom OTP Authenticator
 * 
 * Handles OTP credential setup within Direct Grant flow.
 * This allows custom login pages to enroll OTP without browser redirects.
 * 
 * Flow:
 * 1. Check if user has OTP credential
 * 2. If NO: Generate secret, return QR code data to frontend
 * 3. Frontend displays QR, user scans, submits OTP
 * 4. Backend validates OTP, creates credential
 * 5. If YES: Validate provided OTP code
 * 
 * AAL2 Compliance: Required for TOP_SECRET clearance users
 */
public class DirectGrantOTPAuthenticator implements Authenticator {

    public static final String PROVIDER_ID = "direct-grant-otp-setup";
    
    // Form parameter names
    private static final String OTP_CODE = "totp";
    private static final String OTP_SECRET = "totp_secret";
    private static final String SETUP_MODE = "totp_setup";

    @Override
    public void authenticate(AuthenticationFlowContext context) {
        UserModel user = context.getUser();
        
        if (user == null) {
            context.failure(AuthenticationFlowError.UNKNOWN_USER);
            return;
        }

        // Check if user already has OTP configured
        boolean hasOTP = hasOTPCredential(context.getSession(), context.getRealm(), user);
        
        MultivaluedMap<String, String> formData = context.getHttpRequest().getDecodedFormParameters();
        String otpCode = formData.getFirst(OTP_CODE);
        String otpSecret = formData.getFirst(OTP_SECRET);
        String setupMode = formData.getFirst(SETUP_MODE);

        if (!hasOTP) {
            // User needs OTP setup
            if (setupMode != null && "true".equals(setupMode)) {
                // User is submitting OTP setup with secret + code
                handleOTPSetup(context, user, otpSecret, otpCode);
            } else {
                // No OTP credential, no setup attempt - return setup required
                requireOTPSetup(context, user);
            }
        } else {
            // User has OTP, validate the provided code
            if (otpCode != null && !otpCode.isEmpty()) {
                validateExistingOTP(context, user, otpCode);
            } else {
                // OTP required but not provided
                context.challenge(
                    Response.status(Response.Status.UNAUTHORIZED)
                        .entity(createError("otp_required", "OTP code required"))
                        .build()
                );
            }
        }
    }

    /**
     * Check if user has OTP credential configured
     */
    private boolean hasOTPCredential(KeycloakSession session, RealmModel realm, UserModel user) {
        return user.credentialManager().getStoredCredentialsByTypeStream(OTPCredentialModel.TYPE)
            .findFirst()
            .isPresent();
    }

    /**
     * Require OTP setup - generate secret and return QR code data
     */
    private void requireOTPSetup(AuthenticationFlowContext context, UserModel user) {
        // Generate OTP secret
        String secret = HmacOTP.generateSecret(20); // 20 bytes = 160 bits
        
        // Generate OTP URL for QR code
        String issuer = context.getRealm().getDisplayName();
        if (issuer == null || issuer.isEmpty()) {
            issuer = context.getRealm().getName();
        }
        
        String accountName = user.getUsername();
        if (user.getEmail() != null && !user.getEmail().isEmpty()) {
            accountName = user.getEmail();
        }
        
        // Format: otpauth://totp/ISSUER:ACCOUNT?secret=SECRET&issuer=ISSUER
        String otpUrl = String.format(
            "otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA256&digits=6&period=30",
            urlEncode(issuer),
            urlEncode(accountName),
            secret,
            urlEncode(issuer)
        );
        
        // Return setup required response with QR code data
        String responseJson = String.format(
            "{" +
            "\"success\": false," +
            "\"mfaRequired\": true," +
            "\"mfaSetupRequired\": true," +
            "\"message\": \"Multi-factor authentication setup required\"," +
            "\"setupToken\": \"%s\"," +
            "\"otpSecret\": \"%s\"," +
            "\"otpUrl\": \"%s\"," +
            "\"qrCode\": \"%s\"," +
            "\"userId\": \"%s\"" +
            "}",
            Base64.getEncoder().encodeToString(secret.getBytes(StandardCharsets.UTF_8)),
            secret,
            otpUrl,
            otpUrl, // Frontend can generate QR from this
            user.getId()
        );
        
        context.challenge(
            Response.status(Response.Status.OK) // 200 with setup required payload
                .entity(responseJson)
                .type("application/json")
                .build()
        );
    }

    /**
     * Handle OTP setup - validate code and create credential
     */
    private void handleOTPSetup(AuthenticationFlowContext context, UserModel user, String secret, String otpCode) {
        if (secret == null || secret.isEmpty()) {
            context.challenge(
                Response.status(Response.Status.BAD_REQUEST)
                    .entity(createError("missing_secret", "OTP secret is required for setup"))
                    .build()
            );
            return;
        }
        
        if (otpCode == null || otpCode.isEmpty()) {
            context.challenge(
                Response.status(Response.Status.BAD_REQUEST)
                    .entity(createError("missing_otp", "OTP code is required for setup"))
                    .build()
            );
            return;
        }

        // Validate the OTP code against the secret
        TimeBasedOTP totp = new TimeBasedOTP(
            context.getRealm().getOTPPolicy().getAlgorithm(),
            context.getRealm().getOTPPolicy().getDigits(),
            context.getRealm().getOTPPolicy().getPeriod(),
            context.getRealm().getOTPPolicy().getLookAheadWindow()
        );
        
        boolean valid = totp.validateTOTP(otpCode, secret.getBytes(StandardCharsets.UTF_8));
        
        if (!valid) {
            context.challenge(
                Response.status(Response.Status.UNAUTHORIZED)
                    .entity(createError("invalid_otp", "Invalid OTP code. Please try again."))
                    .build()
            );
            return;
        }

        // OTP is valid - create the credential
        try {
            OTPCredentialProvider otpProvider = (OTPCredentialProvider) context.getSession()
                .getProvider(org.keycloak.credential.CredentialProvider.class, "keycloak-otp");
            
            // Create OTP credential model
            OTPCredentialModel credentialModel = OTPCredentialModel.createFromPolicy(
                context.getRealm(),
                secret
            );
            
            // Store the credential
            user.credentialManager().createStoredCredential(credentialModel);
            
            // Success - OTP credential created
            context.success();
            
        } catch (Exception e) {
            context.getEvent().error("otp_setup_failed");
            context.failure(AuthenticationFlowError.INTERNAL_ERROR);
        }
    }

    /**
     * Validate existing OTP credential
     */
    private void validateExistingOTP(AuthenticationFlowContext context, UserModel user, String otpCode) {
        // Get user's OTP credential
        CredentialModel credential = user.credentialManager()
            .getStoredCredentialsByTypeStream(OTPCredentialModel.TYPE)
            .findFirst()
            .orElse(null);
        
        if (credential == null) {
            context.failure(AuthenticationFlowError.INVALID_CREDENTIALS);
            return;
        }

        // Validate the OTP code
        OTPCredentialModel otpCredential = OTPCredentialModel.createFromCredentialModel(credential);
        
        TimeBasedOTP totp = new TimeBasedOTP(
            otpCredential.getOTPCredentialData().getAlgorithm(),
            otpCredential.getOTPCredentialData().getDigits(),
            otpCredential.getOTPCredentialData().getPeriod(),
            context.getRealm().getOTPPolicy().getLookAheadWindow()
        );
        
        boolean valid = totp.validateTOTP(
            otpCode,
            otpCredential.getOTPSecretData().getValue().getBytes(StandardCharsets.UTF_8)
        );
        
        if (valid) {
            context.success();
        } else {
            context.getEvent().error("invalid_totp");
            context.challenge(
                Response.status(Response.Status.UNAUTHORIZED)
                    .entity(createError("invalid_otp", "Invalid OTP code"))
                    .build()
            );
        }
    }

    @Override
    public void action(AuthenticationFlowContext context) {
        // Not used in Direct Grant flow
    }

    @Override
    public boolean requiresUser() {
        return true;
    }

    @Override
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
        // This authenticator handles both setup and validation
        // So it's always "configured" (ready to run)
        return true;
    }

    @Override
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {
        // Direct Grant doesn't use required actions
    }

    @Override
    public void close() {
        // Nothing to close
    }

    /**
     * Helper: URL encode
     */
    private String urlEncode(String value) {
        try {
            return URLEncoder.encode(value, StandardCharsets.UTF_8.toString());
        } catch (Exception e) {
            return value;
        }
    }

    /**
     * Helper: Create error JSON
     */
    private String createError(String code, String message) {
        return String.format(
            "{\"success\": false, \"error\": \"%s\", \"message\": \"%s\"}",
            code,
            message
        );
    }
}

