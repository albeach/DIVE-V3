package com.dive.keycloak.action;

import org.keycloak.Config;
import org.keycloak.authentication.RequiredActionFactory;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

/**
 * DIVE V3 - Factory for Custom OTP Configuration Required Action
 * 
 * This factory creates instances of ConfigureOTPRequiredAction and registers
 * it with Keycloak's Required Action system.
 * 
 * The Required Action will be automatically triggered when:
 * 1. User authenticates successfully with password
 * 2. User does not have an OTP credential configured
 * 3. Realm's authentication flow requires OTP
 * 
 * This is the proper, secure way to handle OTP enrollment in Keycloak.
 */
public class ConfigureOTPRequiredActionFactory implements RequiredActionFactory {

    public static final String PROVIDER_ID = "dive-configure-totp";

    @Override
    public RequiredActionProvider create(KeycloakSession session) {
        return new ConfigureOTPRequiredAction();
    }

    @Override
    public String getId() {
        return PROVIDER_ID;
    }

    @Override
    public String getDisplayText() {
        return "DIVE Configure Authenticator Application";
    }

    @Override
    public boolean isOneTimeAction() {
        // This action is one-time: once OTP is configured, user doesn't need to do it again
        return true;
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
        // No cleanup needed
    }
}
