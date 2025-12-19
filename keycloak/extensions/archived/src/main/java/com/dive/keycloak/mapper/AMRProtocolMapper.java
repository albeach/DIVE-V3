package com.dive.keycloak.mapper;

import org.keycloak.models.ClientSessionContext;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.ProtocolMapperModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.UserSessionModel;
import org.keycloak.protocol.oidc.mappers.AbstractOIDCProtocolMapper;
import org.keycloak.protocol.oidc.mappers.OIDCAccessTokenMapper;
import org.keycloak.protocol.oidc.mappers.OIDCAttributeMapperHelper;
import org.keycloak.protocol.oidc.mappers.OIDCIDTokenMapper;
import org.keycloak.protocol.oidc.mappers.UserInfoTokenMapper;
import org.keycloak.provider.ProviderConfigProperty;
import org.keycloak.representations.IDToken;

import java.util.ArrayList;
import java.util.List;

/**
 * DIVE V3 Dynamic AMR Protocol Mapper
 * 
 * Computes AMR (Authentication Methods Reference) dynamically during token generation
 * by inspecting user's configured credentials.
 * 
 * This approach works for ALL grant types (password, authorization_code, refresh, etc.)
 * because it runs during token creation, not as a post-authentication event.
 * 
 * NIST SP 800-63B Compliance:
 * - AAL1 (0): Single factor (password only)
 * - AAL2 (1): Multi-factor (password + OTP/hardware token)
 * - AAL3 (2): Hardware cryptographic authenticator
 */
public class AMRProtocolMapper extends AbstractOIDCProtocolMapper 
        implements OIDCAccessTokenMapper, OIDCIDTokenMapper, UserInfoTokenMapper {

    public static final String PROVIDER_ID = "dive-amr-protocol-mapper";

    private static final List<ProviderConfigProperty> configProperties = new ArrayList<>();

    static {
        OIDCAttributeMapperHelper.addIncludeInTokensConfig(configProperties, AMRProtocolMapper.class);
    }

    @Override
    public String getDisplayCategory() {
        return TOKEN_MAPPER_CATEGORY;
    }

    @Override
    public String getDisplayType() {
        return "DIVE AMR Mapper";
    }

    @Override
    public String getHelpText() {
        return "Dynamically computes AMR (Authentication Methods Reference) and ACR (Authentication Context Class Reference) based on user's configured credentials. Works with all grant types.";
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        return configProperties;
    }

    @Override
    public String getId() {
        return PROVIDER_ID;
    }

    @Override
    protected void setClaim(IDToken token, ProtocolMapperModel mappingModel,
                            UserSessionModel userSession, KeycloakSession keycloakSession,
                            ClientSessionContext clientSessionCtx) {

        try {
            UserModel user = userSession.getUser();

            // Build AMR array based on user's configured credentials (pwd baseline; hwk if WebAuthn)
            List<String> amrMethods = new ArrayList<>();

            // Password is always present for authenticated users
            amrMethods.add("pwd");

            // Check for WebAuthn credentials (future enhancement)
            boolean hasWebAuthn = user != null && user.credentialManager()
                .getStoredCredentialsByTypeStream("webauthn")
                .findFirst()
                .isPresent();

            // Elevate to OTP only when the authenticator explicitly marked success
            boolean otpUsed = false;
            String otpAuthUser = userSession.getNote("OTP_AUTHENTICATED");
            if (otpAuthUser != null && otpAuthUser.equalsIgnoreCase("true")) {
                otpUsed = true;
                amrMethods.add("otp");
            }

            if (hasWebAuthn) {
                amrMethods.add("hwk");  // Hardware key
            }

            // Set AMR claim as JSON array
            token.setOtherClaims("amr", amrMethods);

            // Calculate ACR based on AMR factors (NIST SP 800-63B)
            String acr;
            if (hasWebAuthn) {
                acr = "2";  // AAL3 - Hardware cryptographic authenticator
            } else if (otpUsed) {
                acr = "1";  // AAL2 - OTP used
            } else {
                acr = "0";  // AAL1 - Single factor (password only)
            }

            token.setOtherClaims("acr", acr);

            // Set auth_time from user session
            if (userSession.getStarted() > 0) {
                token.setOtherClaims("auth_time", userSession.getStarted() / 1000); // Convert ms to seconds
            }

            System.out.println("[DIVE AMR Mapper] Set claims for user: " + (user != null ? user.getUsername() : "unknown") +
                             " | amr=" + amrMethods + " | acr=" + acr + " (AAL" + (Integer.parseInt(acr) + 1) + ")");
        } catch (Exception e) {
            // Fail-secure: do not break token issuance; default to AAL1
            System.err.println("[DIVE AMR Mapper] Error computing AMR/ACR: " + e.getMessage());
            token.setOtherClaims("amr", List.of("pwd"));
            token.setOtherClaims("acr", "0");
        }
    }
}
