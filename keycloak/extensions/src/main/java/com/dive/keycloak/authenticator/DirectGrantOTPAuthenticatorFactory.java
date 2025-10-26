package com.dive.keycloak.authenticator;

import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

import java.util.Collections;
import java.util.List;

/**
 * DIVE V3 Direct Grant OTP Authenticator Factory
 * 
 * Registers the custom OTP authenticator with Keycloak.
 * This makes it available in the Authentication Flows UI.
 */
public class DirectGrantOTPAuthenticatorFactory implements AuthenticatorFactory {

    public static final String PROVIDER_ID = "direct-grant-otp-setup";
    private static final DirectGrantOTPAuthenticator SINGLETON = new DirectGrantOTPAuthenticator();

    @Override
    public String getDisplayType() {
        return "Direct Grant OTP Setup (DIVE V3)";
    }

    @Override
    public String getReferenceCategory() {
        return "otp";
    }

    @Override
    public boolean isConfigurable() {
        return false;
    }

    @Override
    public AuthenticationExecutionModel.Requirement[] getRequirementChoices() {
        return new AuthenticationExecutionModel.Requirement[]{
            AuthenticationExecutionModel.Requirement.REQUIRED,
            AuthenticationExecutionModel.Requirement.ALTERNATIVE,
            AuthenticationExecutionModel.Requirement.DISABLED
        };
    }

    @Override
    public boolean isUserSetupAllowed() {
        return false;
    }

    @Override
    public String getHelpText() {
        return "Validates OTP code for Direct Grant flow. " +
               "If user has no OTP credential, generates secret and returns QR code data. " +
               "Supports OTP setup within Direct Grant (no browser redirect required). " +
               "AAL2 compliant for DIVE V3 MFA enforcement.";
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        return Collections.emptyList();
    }

    @Override
    public Authenticator create(KeycloakSession session) {
        return SINGLETON;
    }

    @Override
    public void init(Config.Scope config) {
        // No initialization needed
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
        // No post-initialization needed
    }

    @Override
    public void close() {
        // Nothing to close
    }

    @Override
    public String getId() {
        return PROVIDER_ID;
    }
}

