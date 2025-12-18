package com.dive.keycloak.authenticator;

import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.Authenticator;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.utils.TimeBasedOTP;

import jakarta.ws.rs.core.Response;
import java.nio.charset.StandardCharsets;

/**
 * Minimal direct-grant OTP authenticator (otpSecret-based).
 * - If user has otpSecret:
 *     - totp required; validate against otpSecret.
 *     - On success set authSession userSessionNote OTP_AUTHENTICATED=true.
 * - If no otpSecret: no-op (pwd-only).
 */
public class DirectGrantOTPSimpleAuthenticator implements Authenticator {
    public static final String PROVIDER_ID = "direct-grant-otp-simple";

    @Override
    public void authenticate(AuthenticationFlowContext context) {
        UserModel user = context.getUser();
        if (user == null) {
            System.err.println("[DIVE DirectGrantOTPSimple] No user in context; allowing flow to continue");
            context.success(); // Treat as pass-through when user not yet attached
            return;
        }

        String otpSecret = user.getFirstAttribute("otpSecret");
        boolean hasOtp = otpSecret != null && !otpSecret.isEmpty();

        if (!hasOtp) {
            // No otpSecret attribute → treat as password-only path
            System.out.println("[DIVE DirectGrantOTPSimple] No otpSecret for user; allowing password-only");
            context.success();
            return;
        }

        String totp = context.getHttpRequest().getDecodedFormParameters().getFirst("totp");
        if (totp == null || totp.isEmpty()) {
            failInvalidGrant(context, Response.Status.BAD_REQUEST, "OTP required");
            return;
        }

        if (!validateTotp(totp, otpSecret)) {
            failInvalidGrant(context, Response.Status.UNAUTHORIZED, "Invalid OTP");
            return;
        }

        if (context.getAuthenticationSession() != null) {
            context.getAuthenticationSession().setUserSessionNote("OTP_AUTHENTICATED", "true");
        } else {
            System.err.println("[DIVE DirectGrantOTPSimple] AuthenticationSession missing; skipping OTP note (non-fatal)");
        }

        context.success();
    }

    private boolean validateTotp(String totp, String otpSecret) {
        try {
            TimeBasedOTP generator = new TimeBasedOTP("HmacSHA1", 6, 30, 1);
            byte[] secretBytes = otpSecret.getBytes(StandardCharsets.UTF_8);
            return generator.validateTOTP(totp, secretBytes);
        } catch (Exception e) {
            System.err.println("[DIVE DirectGrantOTPSimple] OTP validation error: " + e.getMessage());
            return false;
        }
    }

    private void failInvalidGrant(AuthenticationFlowContext context, Response.Status status, String description) {
        context.failure(
            AuthenticationFlowError.INVALID_USER,
            Response.status(status)
                .entity(String.format("{\"error\":\"invalid_grant\",\"error_description\":\"%s\"}", description))
                .type("application/json")
                .build()
        );
    }

    @Override
    public void action(AuthenticationFlowContext context) {
        // no-op
    }

    @Override
    public boolean requiresUser() {
        // Allow flow to proceed even if user is not yet attached; we handle null safely
        return false;
    }

    @Override
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
        return true;
    }

    @Override
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {
        // no-op
    }

    @Override
    public void close() {
        // no-op
    }
}

