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
 * CRITICAL FIX (January 2026):
 * ============================
 * Keycloak 26's oidc-amr-mapper does NOT work because:
 * 1. It reads "reference" config from authenticator execution configs
 * 2. auth-username-password-form is NOT configurable (configurable=false)
 * 3. Therefore password authentication never adds "pwd" to AMR
 *
 * This mapper DERIVES AMR from the ACR claim which IS correctly set by:
 * - oidc-acr-mapper reading from acr.loa.map realm attribute
 * - LoA conditional authenticators in the authentication flow
 *
 * ACR-to-AMR Mapping (NIST SP 800-63B compliant):
 * - ACR "1" → AMR ["pwd"]           (AAL1: password only)
 * - ACR "2" → AMR ["pwd", "otp"]    (AAL2: password + OTP)
 * - ACR "3" → AMR ["pwd", "hwk"]    (AAL3: password + WebAuthn)
 *
 * NOTE: This mapper does NOT override ACR - it only sets AMR based on existing ACR.
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
        return "DIVE AMR Mapper (ACR-derived)";
    }

    @Override
    public String getHelpText() {
        return "Derives AMR (Authentication Methods Reference) from the ACR claim. " +
               "ACR=1→[pwd], ACR=2→[pwd,otp], ACR=3→[pwd,hwk]. " +
               "Use this instead of oidc-amr-mapper when password authenticator reference is not configurable.";
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

            // Read ACR from the token (already set by oidc-acr-mapper)
            // The ACR is set based on the LoA conditional authenticators in the flow
            Object existingAcr = token.getOtherClaims().get("acr");
            String acr = existingAcr != null ? existingAcr.toString() : "1";

            // If ACR is not yet set, derive it from session note
            if (existingAcr == null) {
                String sessionAcr = userSession.getNote("AUTH_CONTEXT_CLASS_REF");
                if (sessionAcr != null) {
                    acr = sessionAcr;
                } else {
                    // Fallback: check user's credentials
                    boolean hasWebAuthn = user != null && user.credentialManager()
                        .getStoredCredentialsByTypeStream("webauthn")
                        .findFirst()
                        .isPresent();
                    boolean hasOTP = user != null && user.credentialManager()
                        .getStoredCredentialsByTypeStream("otp")
                        .findFirst()
                        .isPresent();

                    if (hasWebAuthn) {
                        acr = "3";
                    } else if (hasOTP) {
                        acr = "2";
                    } else {
                        acr = "1";
                    }
                }
            }

            // Derive AMR from ACR (NIST SP 800-63B mapping)
            List<String> amrMethods = new ArrayList<>();
            amrMethods.add("pwd"); // Password is always the baseline

            switch (acr) {
                case "3":
                    // AAL3: Hardware cryptographic authenticator (WebAuthn/passkey)
                    amrMethods.add("hwk");
                    break;
                case "2":
                    // AAL2: OTP/TOTP second factor
                    amrMethods.add("otp");
                    break;
                case "1":
                case "0":
                default:
                    // AAL1: Password only (already have "pwd")
                    break;
            }

            // Set AMR claim as JSON array
            token.setOtherClaims("amr", amrMethods);

            // Log for debugging
            String username = (user != null) ? user.getUsername() : "unknown";
            System.out.println("[DIVE AMR Mapper] Derived AMR from ACR for user: " + username +
                             " | acr=" + acr + " → amr=" + amrMethods);

        } catch (Exception e) {
            // Fail-secure: do not break token issuance; default to AAL1
            System.err.println("[DIVE AMR Mapper] Error deriving AMR from ACR: " + e.getMessage());
            e.printStackTrace();
            token.setOtherClaims("amr", List.of("pwd"));
        }
    }
}
