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
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.json.JSONObject;

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
            System.out.println("[DIVE SPI] ERROR: User is null");
            context.failure(AuthenticationFlowError.UNKNOWN_USER);
            return;
        }

        System.out.println("[DIVE SPI] ====== OTP Authentication Request ======");
        System.out.println("[DIVE SPI] Username: " + user.getUsername());
        System.out.println("[DIVE SPI] User ID: " + user.getId());

        // KEYCLOAK 26 FIX: Always set minimum session notes for password authentication
        // These will be upgraded to AAL2 if OTP validation succeeds
        // Without this, Direct Grant flow won't have ACR/AMR claims in Keycloak 26+
        // CRITICAL: Use setUserSessionNote (not setAuthNote) - protocol mappers read from UserSessionNote!
        context.getAuthenticationSession().setUserSessionNote("AUTH_CONTEXT_CLASS_REF", "0"); // AAL1 (password only)
        context.getAuthenticationSession().setUserSessionNote("AUTH_METHODS_REF", "[\"pwd\"]");

        // ============================================
        // KEYCLOAK 26 + TERRAFORM CONFLICT FIX
        // ============================================
        // Problem: User attributes don't persist due to Terraform lifecycle management
        // Solution: Check backend API for pending OTP secret stored in Redis
        // 
        // Architecture:
        // 1. Backend validates OTP and stores secret in Redis (10-min TTL)
        // 2. Custom SPI calls backend API: GET /api/auth/otp/pending-secret/:userId
        // 3. If pending secret exists, create OTP credential
        // 4. Notify backend to remove secret: DELETE /api/auth/otp/pending-secret/:userId
        // ============================================
        String pendingSecretFromBackend = checkPendingOTPSecretFromBackend(user.getId());
        if (pendingSecretFromBackend != null && !pendingSecretFromBackend.isEmpty()) {
            System.out.println("[DIVE SPI] Found pending OTP secret from backend Redis - creating credential");
            try {
                // Create OTP credential using the pending secret
                OTPCredentialProvider otpProvider = (OTPCredentialProvider) context.getSession()
                    .getProvider(org.keycloak.credential.CredentialProvider.class, "keycloak-otp");
                
                OTPCredentialModel credentialModel = OTPCredentialModel.createFromPolicy(
                    context.getRealm(),
                    pendingSecretFromBackend
                );
                
                user.credentialManager().createStoredCredential(credentialModel);
                
                // Notify backend to remove pending secret from Redis
                removePendingOTPSecretFromBackend(user.getId());
                
                System.out.println("[DIVE SPI] SUCCESS: OTP credential created from backend Redis");
                
                // Set AAL2 session notes for MFA compliance
                // CRITICAL: Use setUserSessionNote (not setAuthNote) - protocol mappers read from UserSessionNote!
                context.getAuthenticationSession().setUserSessionNote("AUTH_CONTEXT_CLASS_REF", "1");
                context.getAuthenticationSession().setUserSessionNote("AUTH_METHODS_REF", "[\"pwd\",\"otp\"]");
                
                // Allow authentication to proceed without OTP validation in this request
                // The credential was just created and validated by the backend
                System.out.println("[DIVE SPI] Credential enrolled - allowing authentication without OTP in this request");
                context.success();
                return;
                
            } catch (Exception e) {
                System.out.println("[DIVE SPI] EXCEPTION creating credential from backend secret: " + e.getMessage());
                e.printStackTrace();
                context.getEvent().error("otp_credential_creation_failed");
                context.failure(AuthenticationFlowError.INTERNAL_ERROR);
                return;
            }
        }

        // Check if user already has OTP configured
        boolean hasOTP = hasOTPCredential(context.getSession(), context.getRealm(), user);
        System.out.println("[DIVE SPI] User has OTP credential: " + hasOTP);
        
        MultivaluedMap<String, String> formData = context.getHttpRequest().getDecodedFormParameters();
        String otpCode = formData.getFirst(OTP_CODE);

        System.out.println("[DIVE SPI] OTP Code present: " + (otpCode != null));

        if (!hasOTP) {
            // ============================================
            // User needs OTP setup
            // ============================================
            
            // Check if there's a pending OTP secret in the session
            String pendingSecret = context.getAuthenticationSession().getUserSessionNotes().get("OTP_SECRET_PENDING");
            
            System.out.println("[DIVE SPI] Pending secret in session: " + (pendingSecret != null));
            
            if (pendingSecret != null && otpCode != null && !otpCode.isEmpty()) {
                // User is submitting OTP code after scanning QR - validate and create credential
                System.out.println("[DIVE SPI] Validating OTP enrollment with pending secret");
                
                // Validate OTP against pending secret
                TimeBasedOTP totp = new TimeBasedOTP(
                    "HmacSHA256",  // Algorithm
                    6,              // Digits
                    30,             // Period (seconds)
                    1               // Look-ahead window
                );
                
                boolean valid = totp.validateTOTP(
                    otpCode,
                    pendingSecret.getBytes(StandardCharsets.UTF_8)
                );
                
                System.out.println("[DIVE SPI] OTP validation result: " + valid);
                
                if (valid) {
                    System.out.println("[DIVE SPI] OTP valid - creating credential");
                    
                    try {
                        // Create OTP credential using CredentialProvider SPI
                        OTPCredentialProvider otpProvider = (OTPCredentialProvider) context.getSession()
                            .getProvider(org.keycloak.credential.CredentialProvider.class, "keycloak-otp");
                        
                        OTPCredentialModel credentialModel = OTPCredentialModel.createFromPolicy(
                            context.getRealm(),
                            pendingSecret
                        );
                        
                        user.credentialManager().createStoredCredential(credentialModel);
                        
                        // Clear pending secret (set to null to remove)
                        context.getAuthenticationSession().setUserSessionNote("OTP_SECRET_PENDING", null);
                        
                        // Set AAL2 session notes
                        context.getAuthenticationSession().setAuthNote("AUTH_CONTEXT_CLASS_REF", "1");
                        context.getAuthenticationSession().setAuthNote("AUTH_METHODS_REF", "[\"pwd\",\"otp\"]");
                        
                        System.out.println("[DIVE SPI] SUCCESS: OTP credential created and AAL2 set");
                        context.success();
                        
                    } catch (Exception e) {
                        System.out.println("[DIVE SPI] EXCEPTION: " + e.getMessage());
                        e.printStackTrace();
                        context.getEvent().error("otp_setup_failed");
                        context.failure(AuthenticationFlowError.INTERNAL_ERROR);
                    }
                    
                } else {
                    System.out.println("[DIVE SPI] OTP invalid during enrollment");
                    context.getEvent().error("invalid_totp");
                    context.challenge(
                        Response.status(Response.Status.UNAUTHORIZED)
                            .entity(createError("invalid_otp", "Invalid OTP code"))
                            .build()
                    );
                }
                
            } else {
                // No OTP credential, no pending secret or no code - return setup required
                System.out.println("[DIVE SPI] Requiring OTP setup");
                requireOTPSetup(context, user);
            }
            
        } else {
            // User has OTP, validate the provided code
            if (otpCode != null && !otpCode.isEmpty()) {
                System.out.println("[DIVE SPI] Validating existing OTP credential");
                validateExistingOTP(context, user, otpCode);
            } else {
                // OTP required but not provided
                System.out.println("[DIVE SPI] OTP required but not provided");
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
        
        // ============================================
        // CRITICAL: Store secret in authentication session
        // This allows validation on next authentication attempt
        // ============================================
        context.getAuthenticationSession().setUserSessionNote("OTP_SECRET_PENDING", secret);
        System.out.println("[DIVE SPI] Stored OTP secret in session for user: " + user.getUsername());
        
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
            "\"otpSecret\": \"%s\"," +
            "\"otpUrl\": \"%s\"," +
            "\"userId\": \"%s\"" +
            "}",
            secret,
            otpUrl,
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
        System.out.println("[DIVE SPI] ====== handleOTPSetup Called ======");
        System.out.println("[DIVE SPI] Secret present: " + (secret != null));
        System.out.println("[DIVE SPI] OTP Code present: " + (otpCode != null));
        
        if (secret == null || secret.isEmpty()) {
            System.out.println("[DIVE SPI] ERROR: Secret is missing");
            context.challenge(
                Response.status(Response.Status.BAD_REQUEST)
                    .entity(createError("missing_secret", "OTP secret is required for setup"))
                    .build()
            );
            return;
        }
        
        if (otpCode == null || otpCode.isEmpty()) {
            System.out.println("[DIVE SPI] ERROR: OTP code is missing");
            context.challenge(
                Response.status(Response.Status.BAD_REQUEST)
                    .entity(createError("missing_otp", "OTP code is required for setup"))
                    .build()
            );
            return;
        }

        System.out.println("[DIVE SPI] Secret length: " + secret.length());
        System.out.println("[DIVE SPI] OTP Code: " + otpCode);

        // Create OTP credential model for validation
        OTPCredentialModel validationModel = OTPCredentialModel.createFromPolicy(
            context.getRealm(),
            secret
        );
        
        // Validate using Keycloak's TimeBasedOTP
        TimeBasedOTP totp = new TimeBasedOTP(
            context.getRealm().getOTPPolicy().getAlgorithm(),
            context.getRealm().getOTPPolicy().getDigits(),
            context.getRealm().getOTPPolicy().getPeriod(),
            context.getRealm().getOTPPolicy().getLookAheadWindow()
        );
        
        System.out.println("[DIVE SPI] OTP Policy - Algorithm: " + context.getRealm().getOTPPolicy().getAlgorithm());
        System.out.println("[DIVE SPI] OTP Policy - Digits: " + context.getRealm().getOTPPolicy().getDigits());
        System.out.println("[DIVE SPI] OTP Policy - Period: " + context.getRealm().getOTPPolicy().getPeriod());
        
        // ============================================
        // DEMO MODE: Accept "123456" as valid code
        // ============================================
        // For demo/presentation purposes, allow code "123456" to work
        // This bypasses normal TOTP validation for convenience
        boolean demoMode = "true".equalsIgnoreCase(System.getenv("DEMO_MODE")) || 
                          "demo".equalsIgnoreCase(System.getenv("NODE_ENV"));
        final String DEMO_OTP_CODE = "123456";
        
        boolean valid = false;
        if (demoMode && DEMO_OTP_CODE.equals(otpCode)) {
            System.out.println("[DIVE SPI] DEMO MODE: Accepting override OTP code 123456");
            valid = true;
        } else {
            // Use the decoded secret from the credential model
            valid = totp.validateTOTP(otpCode, validationModel.getOTPSecretData().getValue().getBytes(StandardCharsets.UTF_8));
        }
        
        System.out.println("[DIVE SPI] OTP validation result: " + valid);
        
        if (!valid) {
            System.out.println("[DIVE SPI] ERROR: OTP validation failed");
            context.challenge(
                Response.status(Response.Status.UNAUTHORIZED)
                    .entity(createError("invalid_otp", "Invalid OTP code. Please try again."))
                    .build()
            );
            return;
        }

        // OTP is valid - create the credential
        try {
            System.out.println("[DIVE SPI] Creating OTP credential...");
            OTPCredentialProvider otpProvider = (OTPCredentialProvider) context.getSession()
                .getProvider(org.keycloak.credential.CredentialProvider.class, "keycloak-otp");
            
            // Create OTP credential model
            OTPCredentialModel credentialModel = OTPCredentialModel.createFromPolicy(
                context.getRealm(),
                secret
            );
            
            // Store the credential
            user.credentialManager().createStoredCredential(credentialModel);
            System.out.println("[DIVE SPI] SUCCESS: OTP credential created for user: " + user.getUsername());
            
            // ============================================
            // Keycloak 26 Fix: Set ACR/AMR session notes
            // ============================================
            // Set ACR (Authentication Context Class Reference) to "1" = AAL2 (Multi-Factor)
            // Keycloak's protocol mappers will read these session notes and add them to JWT tokens
            // CRITICAL: Use setUserSessionNote (not setAuthNote) - protocol mappers read from UserSessionNote!
            context.getAuthenticationSession().setUserSessionNote("AUTH_CONTEXT_CLASS_REF", "1");
            
            // Set AMR (Authentication Methods Reference) to ["pwd","otp"]
            // This indicates password + OTP authentication
            context.getAuthenticationSession().setUserSessionNote("AUTH_METHODS_REF", "[\"pwd\",\"otp\"]");
            
            System.out.println("[DIVE SPI] ACR/AMR session notes set (AAL2)");
            
            // Success - OTP credential created
            context.success();
            System.out.println("[DIVE SPI] context.success() called - enrollment complete!");
            
        } catch (Exception e) {
            System.out.println("[DIVE SPI] EXCEPTION during credential creation: " + e.getMessage());
            e.printStackTrace();
            context.getEvent().error("otp_setup_failed");
            context.failure(AuthenticationFlowError.INTERNAL_ERROR);
        }
    }

    /**
     * Validate existing OTP credential
     */
    private void validateExistingOTP(AuthenticationFlowContext context, UserModel user, String otpCode) {
        // Use Keycloak's OTP credential provider for validation
        OTPCredentialProvider otpProvider = (OTPCredentialProvider) context.getSession()
            .getProvider(org.keycloak.credential.CredentialProvider.class, "keycloak-otp");
        
        if (otpProvider == null) {
            System.out.println("[DIVE SPI] ERROR: OTP credential provider not found");
            context.failure(AuthenticationFlowError.INTERNAL_ERROR);
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
            System.out.println("[DIVE SPI] DEMO MODE: Accepting override OTP code 123456");
            valid = true;
        } else {
            // Validate OTP using Keycloak's built-in validator
            valid = otpProvider.isValid(context.getRealm(), user, 
                new UserCredentialModel(null, OTPCredentialModel.TYPE, otpCode));
        }
        
        System.out.println("[DIVE SPI] OTP validation result: " + valid);
        
        if (valid) {
            // ============================================
            // Keycloak 26 Fix: Set ACR/AMR session notes
            // ============================================
            // Set ACR (Authentication Context Class Reference) to "1" = AAL2 (Multi-Factor)
            // CRITICAL: Use setUserSessionNote (not setAuthNote) - protocol mappers read from UserSessionNote!
            context.getAuthenticationSession().setUserSessionNote("AUTH_CONTEXT_CLASS_REF", "1");
            
            // Set AMR (Authentication Methods Reference) to ["pwd","otp"]
            context.getAuthenticationSession().setUserSessionNote("AUTH_METHODS_REF", "[\"pwd\",\"otp\"]");
            
            System.out.println("[DIVE SPI] OTP validated successfully - AAL2 achieved");
            context.success();
        } else {
            System.out.println("[DIVE SPI] OTP validation failed");
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

    /**
     * Check backend API for pending OTP secret in Redis
     * @param userId User ID from Keycloak
     * @return Pending OTP secret (Base32) or null if not found
     */
    private String checkPendingOTPSecretFromBackend(String userId) {
        try {
            // Backend API endpoint (Docker Compose service name: backend, port: 4000)
            String backendUrl = System.getenv().getOrDefault("BACKEND_URL", "http://backend:4000");
            String endpoint = backendUrl + "/api/auth/otp/pending-secret/" + userId;
            
            System.out.println("[DIVE SPI] Checking pending secret from backend: " + endpoint);
            
            HttpClient client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .build();
            
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(endpoint))
                .GET()
                .build();
            
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            
            System.out.println("[DIVE SPI] Backend response status: " + response.statusCode());
            
            if (response.statusCode() == 200) {
                JSONObject json = new JSONObject(response.body());
                boolean success = json.optBoolean("success", false);
                
                if (success && json.has("data")) {
                    JSONObject data = json.getJSONObject("data");
                    String secret = data.optString("secret", null);
                    
                    if (secret != null && !secret.isEmpty()) {
                        System.out.println("[DIVE SPI] Pending secret retrieved from backend");
                        return secret;
                    }
                }
            } else if (response.statusCode() == 404) {
                System.out.println("[DIVE SPI] No pending secret found in backend Redis");
            } else {
                System.out.println("[DIVE SPI] Backend error: " + response.body());
            }
            
            return null;
            
        } catch (Exception e) {
            System.out.println("[DIVE SPI] Exception checking backend for pending secret: " + e.getMessage());
            e.printStackTrace();
            return null;
        }
    }

    /**
     * Notify backend to remove pending OTP secret from Redis
     * @param userId User ID from Keycloak
     */
    private void removePendingOTPSecretFromBackend(String userId) {
        try {
            // Backend API endpoint
            String backendUrl = System.getenv().getOrDefault("BACKEND_URL", "http://backend:4000");
            String endpoint = backendUrl + "/api/auth/otp/pending-secret/" + userId;
            
            System.out.println("[DIVE SPI] Removing pending secret from backend: " + endpoint);
            
            HttpClient client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .build();
            
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(endpoint))
                .DELETE()
                .build();
            
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            
            System.out.println("[DIVE SPI] Backend removal response status: " + response.statusCode());
            
            if (response.statusCode() == 200) {
                System.out.println("[DIVE SPI] Pending secret removed from backend Redis");
            } else {
                System.out.println("[DIVE SPI] Backend removal error: " + response.body());
            }
            
        } catch (Exception e) {
            System.out.println("[DIVE SPI] Exception removing pending secret from backend: " + e.getMessage());
            e.printStackTrace();
        }
    }
}

