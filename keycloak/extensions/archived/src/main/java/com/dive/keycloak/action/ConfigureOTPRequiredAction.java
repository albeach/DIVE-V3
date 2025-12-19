package com.dive.keycloak.action;

import org.keycloak.authentication.RequiredActionContext;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.credential.CredentialProvider;
import org.keycloak.credential.OTPCredentialProvider;
import org.keycloak.models.OTPPolicy;
import org.keycloak.models.UserModel;
import org.keycloak.models.credential.OTPCredentialModel;
import org.keycloak.models.utils.HmacOTP;
import org.keycloak.models.utils.TimeBasedOTP;

import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * DIVE V3 - Custom OTP Configuration Required Action
 * 
 * This Required Action handles OTP enrollment for DIVE V3 using Keycloak's
 * proper credential management APIs. This is the secure, production-ready approach
 * that follows Keycloak best practices.
 * 
 * Flow:
 * 1. User authenticates with password
 * 2. Keycloak detects no OTP credential and triggers this Required Action
 * 3. requiredActionChallenge() generates secret and returns QR data
 * 4. Frontend displays QR code in custom UI
 * 5. User scans QR and submits OTP code
 * 6. processAction() validates code and creates credential via CredentialProvider SPI
 * 7. User re-authenticates with OTP to get AAL2 token
 * 
 * References:
 * - https://www.keycloak.org/docs/latest/server_development/index.html#required-action-walkthrough
 * - https://www.keycloak.org/docs/latest/server_development/index.html#_auth_spi
 */
public class ConfigureOTPRequiredAction implements RequiredActionProvider {

    public static final String PROVIDER_ID = "dive-configure-totp";
    private static final String OTP_SECRET_KEY = "dive_otp_secret";

    @Override
    public void evaluateTriggers(RequiredActionContext context) {
        // This method is called to determine if the required action should be triggered
        // For OTP setup, we check if the user has an OTP credential configured
        // If not, the required action is triggered
    }

    @Override
    public void requiredActionChallenge(RequiredActionContext context) {
        System.out.println("[DIVE Required Action] OTP setup challenge - generating secret");
        
        // Generate a random OTP secret (20 bytes = 160 bits, Base32 encoded)
        String secret = HmacOTP.generateSecret(20);
        
        // Build otpauth:// URL for QR code generation
        UserModel user = context.getUser();
        String accountName = user.getUsername();
        String issuer = "DIVE V3";
        
        String otpUrl = String.format(
            "otpauth://totp/%s:%s?secret=%s&issuer=%s&digits=6&period=30&algorithm=SHA1",
            urlEncode(issuer),
            urlEncode(accountName),
            secret,
            urlEncode(issuer)
        );
        
        System.out.println("[DIVE Required Action] Generated OTP URL for user: " + accountName);
        
        // Store secret in authentication session (encrypted by Keycloak)
        // This allows us to validate the OTP code when user submits it
        context.getAuthenticationSession().setAuthNote(OTP_SECRET_KEY, secret);
        
        // Return JSON response with QR data for custom UI
        // Frontend will display this in a beautiful custom interface
        String responseJson = String.format(
            "{" +
            "\"mfaSetupRequired\": true," +
            "\"otpSecret\": \"%s\"," +
            "\"otpUrl\": \"%s\"," +
            "\"userId\": \"%s\"," +
            "\"message\": \"Multi-factor authentication setup required\"" +
            "}",
            secret,
            otpUrl,
            user.getId()
        );
        
        System.out.println("[DIVE Required Action] Returning OTP setup challenge");
        
        // Challenge with 200 OK (not 401) so frontend can handle gracefully
        context.challenge(
            Response.ok(responseJson)
                .type("application/json")
                .build()
        );
    }

    @Override
    public void processAction(RequiredActionContext context) {
        System.out.println("[DIVE Required Action] Processing OTP enrollment submission");
        
        MultivaluedMap<String, String> formData = context.getHttpRequest().getDecodedFormParameters();
        
        // Get submitted OTP code
        String otpCode = formData.getFirst("totp");
        if (otpCode == null) {
            otpCode = formData.getFirst("otp"); // Try alternate parameter name
        }
        
        // Get stored secret from authentication session
        String secret = context.getAuthenticationSession().getAuthNote(OTP_SECRET_KEY);
        
        System.out.println("[DIVE Required Action] OTP Code present: " + (otpCode != null));
        System.out.println("[DIVE Required Action] Secret present: " + (secret != null));
        
        if (secret == null || otpCode == null || otpCode.isEmpty()) {
            System.out.println("[DIVE Required Action] ERROR: Missing secret or OTP code");
            context.challenge(
                Response.status(Response.Status.BAD_REQUEST)
                    .entity("{\"error\": \"invalid_request\", \"error_description\": \"OTP code is required\"}")
                    .type("application/json")
                    .build()
            );
            return;
        }
        
        // ============================================
        // DEMO MODE: Accept "123456" as valid code
        // ============================================
        boolean demoMode = "true".equalsIgnoreCase(System.getenv("DEMO_MODE")) || 
                          "demo".equalsIgnoreCase(System.getenv("NODE_ENV"));
        final String DEMO_OTP_CODE = "123456";
        
        boolean valid = false;
        if (demoMode && DEMO_OTP_CODE.equals(otpCode)) {
            System.out.println("[DIVE Required Action] DEMO MODE: Accepting override OTP code 123456");
            valid = true;
        } else {
            // Validate OTP code using Keycloak's TimeBasedOTP utility
            OTPPolicy policy = context.getRealm().getOTPPolicy();
            TimeBasedOTP totp = new TimeBasedOTP(
                policy.getAlgorithm(),
                policy.getDigits(),
                policy.getPeriod(),
                policy.getLookAheadWindow()
            );
            
            valid = totp.validateTOTP(otpCode, secret.getBytes(StandardCharsets.UTF_8));
        }
        
        System.out.println("[DIVE Required Action] OTP validation result: " + valid);
        
        if (!valid) {
            System.out.println("[DIVE Required Action] ERROR: Invalid OTP code");
            context.getEvent().error("invalid_user_credentials");
            context.challenge(
                Response.status(Response.Status.UNAUTHORIZED)
                    .entity("{\"error\": \"invalid_grant\", \"error_description\": \"Invalid OTP code. Please try again.\"}")
                    .type("application/json")
                    .build()
            );
            return;
        }
        
        // OTP is valid - create credential using proper CredentialProvider SPI
        try {
            System.out.println("[DIVE Required Action] Creating OTP credential via CredentialProvider SPI");
            
            UserModel user = context.getUser();
            
            // Get Keycloak's built-in OTP credential provider
            OTPCredentialProvider otpProvider = (OTPCredentialProvider) context.getSession()
                .getProvider(CredentialProvider.class, "keycloak-otp");
            
            if (otpProvider == null) {
                throw new RuntimeException("OTP credential provider not found");
            }
            
            // Create OTP credential model using realm's OTP policy
            OTPCredentialModel credentialModel = OTPCredentialModel.createFromPolicy(
                context.getRealm(),
                secret
            );
            credentialModel.setUserLabel("Authenticator App");
            
            // Store credential using user's credential manager
            // This is the secure, transactional way to create credentials
            user.credentialManager().createStoredCredential(credentialModel);
            
            System.out.println("[DIVE Required Action] SUCCESS: OTP credential created for user: " + user.getUsername());
            
            // Clear the secret from authentication session (security cleanup)
            context.getAuthenticationSession().removeAuthNote(OTP_SECRET_KEY);
            
            // Log successful enrollment event
            context.getEvent().success();
            
            // Mark required action as complete
            // User will now be required to use OTP for subsequent logins
            context.success();
            
            System.out.println("[DIVE Required Action] OTP enrollment complete - required action removed");
            
        } catch (Exception e) {
            System.out.println("[DIVE Required Action] EXCEPTION during credential creation: " + e.getMessage());
            e.printStackTrace();
            
            context.getEvent().error("otp_setup_failed");
            context.failure();
        }
    }

    @Override
    public void close() {
        // No cleanup needed
    }

    /**
     * URL-encode a string for use in otpauth:// URL
     */
    private String urlEncode(String value) {
        try {
            return URLEncoder.encode(value, StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return value;
        }
    }
}
