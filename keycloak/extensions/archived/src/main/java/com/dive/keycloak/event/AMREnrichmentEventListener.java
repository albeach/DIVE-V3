package com.dive.keycloak.event;

import org.keycloak.events.Event;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventType;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.UserSessionModel;

import java.util.ArrayList;
import java.util.List;

/**
 * DIVE V3 AMR Enrichment Event Listener
 *
 * Keycloak 26 Issue: Browser flow sets AMR=["pwd"] but doesn't append "otp" when OTP validates
 *
 * Solution: Event listener that enriches AMR after successful LOGIN
 * - Checks if user has WebAuthn/passkey credential (AAL3 - highest priority)
 * - Checks if user has OTP credential (AAL2)
 * - Updates AMR and ACR based on configured credentials
 * - Sets AUTH_METHODS_REF and ACR session notes for protocol mappers
 *
 * AAL Levels (NIST SP 800-63B):
 * - AAL1 (0): Password only
 * - AAL2 (1): Password + OTP/MFA
 * - AAL3 (2): Password + WebAuthn/passkey (hardware cryptographic authenticator)
 *
 * Best Practice: Event-driven, no modification to authentication flows
 */
public class AMREnrichmentEventListener implements EventListenerProvider {

    private final KeycloakSession session;

    public AMREnrichmentEventListener(KeycloakSession session) {
        this.session = session;
    }

    @Override
    public void onEvent(Event event) {
        // Process all authentication success events (browser, password grant, token exchange, etc.)
        // This ensures AMR is set regardless of how the user authenticates
        // Include CLIENT_LOGIN for direct grant / client-credentials flows where LOGIN is not emitted
        if (event.getType() != EventType.LOGIN &&
            event.getType() != EventType.CLIENT_LOGIN &&
            event.getType() != EventType.CODE_TO_TOKEN &&
            event.getType() != EventType.REFRESH_TOKEN &&
            event.getType() != EventType.TOKEN_EXCHANGE) {
            return;
        }

        try {
            System.out.println("[DIVE AMR] Authentication event detected: " + event.getType() + " for user: " + event.getUserId());

            RealmModel realm = session.realms().getRealm(event.getRealmId());
            UserModel user = session.users().getUserById(realm, event.getUserId());

            if (user == null) {
                System.out.println("[DIVE AMR] User not found: " + event.getUserId());
                return;
            }

            // Get the user session
            UserSessionModel userSession = session.sessions().getUserSession(realm, event.getSessionId());

            if (userSession == null) {
                System.out.println("[DIVE AMR] User session not found: " + event.getSessionId());
                return;
            }

            // Check if AMR already set (avoid redundant processing on token refresh)
            String existingAmr = userSession.getNote("AUTH_METHODS_REF");
            if (existingAmr != null && event.getType() != EventType.LOGIN) {
                System.out.println("[DIVE AMR] AMR already set for session: " + existingAmr);
                return;
            }

            // CRITICAL FIX (Jan 2, 2026): Check if this is a FEDERATED user
            // Federated users have AMR set by their home IdP. We should NOT overwrite
            // their AMR based on local credentials (they don't have local credentials).
            // Instead, preserve the AMR from their user attribute (set by IdP mapper).
            boolean isFederatedUser = user.getFederationLink() != null;
            System.out.println("[DIVE AMR DEBUG] federationLink: " + user.getFederationLink());

            // Check if user has federated identity providers linked
            if (!isFederatedUser) {
                long fedIdCount = session.users().getFederatedIdentitiesStream(realm, user).count();
                System.out.println("[DIVE AMR DEBUG] federated identity count: " + fedIdCount);
                isFederatedUser = fedIdCount > 0;
            }

            // Also check if user has NO local credentials but HAS amr attribute (federated)
            if (!isFederatedUser) {
                long credentialCount = user.credentialManager().getStoredCredentialsStream().count();
                String amrAttr = user.getFirstAttribute("amr");
                System.out.println("[DIVE AMR DEBUG] credential count: " + credentialCount + ", amr attr: " + amrAttr);
                if (credentialCount == 0 && amrAttr != null) {
                    isFederatedUser = true;
                }
            }

            System.out.println("[DIVE AMR DEBUG] isFederatedUser: " + isFederatedUser);

            if (isFederatedUser) {
                // For federated users, use their existing AMR attribute (from IdP mapper)
                // BEST PRACTICE: Handle BOTH formats from IdP:
                // 1. Multi-valued attribute: ["pwd", "otp"] - proper array storage
                // 2. JSON string: "[\"pwd\",\"otp\"]" - if IdP mapper stored native amr claim as string
                List<String> existingAmrAttr = user.getAttributeStream("amr").toList();
                System.out.println("[DIVE AMR DEBUG] existingAmrAttr from user: " + existingAmrAttr);

                if (existingAmrAttr != null && !existingAmrAttr.isEmpty()) {
                    List<String> amrMethods = new ArrayList<>();
                    String federatedAmr;

                    // Check if first element looks like a JSON array (IdP stored native amr as string)
                    String firstVal = existingAmrAttr.get(0);
                    if (firstVal.startsWith("[") && firstVal.contains("\"")) {
                        // Parse JSON array string: "[\"pwd\",\"otp\"]"
                        System.out.println("[DIVE AMR] Parsing JSON array from IdP: " + firstVal);
                        federatedAmr = firstVal; // Already in correct format
                        // Extract values for logging
                        String cleaned = firstVal.replaceAll("[\\[\\]\"]", "");
                        for (String m : cleaned.split(",")) {
                            amrMethods.add(m.trim());
                        }
                    } else {
                        // Multi-valued attribute: ["pwd", "otp"]
                        amrMethods.addAll(existingAmrAttr);
                        federatedAmr = "[\"" + String.join("\",\"", amrMethods) + "\"]";
                    }

                    // Get ACR - also handle both formats
                    String federatedAcr = user.getFirstAttribute("acr");
                    if (federatedAcr == null) federatedAcr = "0";
                    // Strip quotes if stored as JSON string
                    federatedAcr = federatedAcr.replaceAll("\"", "");

                    System.out.println("[DIVE AMR] Federated user detected - preserving IdP AMR: " + federatedAmr + ", ACR: " + federatedAcr);

                    // Set session notes so native oidc-amr-mapper works correctly
                    // This ensures BOTH federated and non-federated users get amr from session
                    userSession.setNote("AUTH_METHODS_REF", federatedAmr);
                    userSession.setNote("AUTH_CONTEXT_CLASS_REF", federatedAcr);
                    userSession.setNote("ACR", federatedAcr);
                    userSession.setNote("acr", federatedAcr);
                    userSession.setNote("amr", federatedAmr);
                    userSession.setNote("auth_time", String.valueOf(System.currentTimeMillis() / 1000));

                    System.out.println("[DIVE AMR] Federated AMR/ACR set in session notes for user: " + user.getUsername());
                    return;
                }
            }

            // Build AMR array based on credentials validated / present
            List<String> amrMethods = new ArrayList<>();

            // Password is always required for authentication
            amrMethods.add("pwd");

            // Check if user has WebAuthn/passkey configured (AAL3 - highest priority)
            boolean hasWebAuthn = user.credentialManager()
                .getStoredCredentialsByTypeStream("webauthn")
                .findFirst()
                .isPresent();

            // Check if user has OTP configured (AAL2)
            boolean hasOTP = user.credentialManager()
                .getStoredCredentialsByTypeStream("otp")
                .findFirst()
                .isPresent();

            if (hasWebAuthn) {
                // User has WebAuthn/passkey credential - AAL3 (hardware cryptographic authenticator)
                amrMethods.add("hwk");  // Hardware key
                System.out.println("[DIVE AMR] User has WebAuthn credential - adding 'hwk' to AMR (AAL3)");
            } else if (hasOTP) {
                // User has OTP credential configured - they must use it for authentication
                amrMethods.add("otp");
                System.out.println("[DIVE AMR] User has OTP credential - adding 'otp' to AMR (AAL2)");
            }

            // Build AMR JSON array string
            String amrJson = "[\"" + String.join("\",\"", amrMethods) + "\"]";

            // Calculate ACR based on AMR factors (NIST SP 800-63B)
            // AAL1 (0) = single factor, AAL2 (1) = two factor, AAL3 (2) = hardware token
            String acr;
            if (hasWebAuthn) {
                acr = "2";  // AAL3 - Hardware cryptographic authenticator (passkey)
            } else if (hasOTP) {
                acr = "1";  // AAL2 - Multi-factor authentication (password + OTP)
            } else {
                acr = "0";  // AAL1 - Single factor (password only)
            }

            System.out.println("[DIVE AMR] Setting AUTH_METHODS_REF: " + amrJson);
            System.out.println("[DIVE AMR] Setting ACR: " + acr + " (AAL" + (Integer.parseInt(acr) + 1) + ")");

            // Set session notes for protocol mappers to read.
            // Keycloak’s built-in ACR storage uses AUTH_CONTEXT_CLASS_REF; keep legacy ACR for backward compatibility.
            userSession.setNote("AUTH_METHODS_REF", amrJson);
            userSession.setNote("AUTH_CONTEXT_CLASS_REF", acr); // primary for oidc-usersessionmodel-note-mapper
            userSession.setNote("ACR", acr);                    // legacy compatibility

            // Also set lowercase aliases so session-note protocol mappers (acr/amr/auth_time)
            // attached to the broker client emit claims without relying on custom mappers.
            userSession.setNote("acr", acr);
            userSession.setNote("amr", amrJson);
            userSession.setNote("auth_time", String.valueOf(System.currentTimeMillis() / 1000));

            // CRITICAL FIX (Jan 2, 2026): Also set user attributes for federation
            // When this user federates to another realm (e.g., Hub), the session notes
            // are NOT available. The oidc-usermodel-attribute-mapper reads from user
            // attributes, so we must update them here for cross-realm federation to work.
            // Use setAttribute with List for multivalued attributes (not setSingleAttribute!)
            user.setAttribute("amr", amrMethods);  // List<String> for multivalued
            user.setSingleAttribute("acr", acr);   // Single value for ACR
            System.out.println("[DIVE AMR] Updated user attributes: amr=" + amrMethods + ", acr=" + acr);

            System.out.println("[DIVE AMR] AMR/ACR enrichment complete for user: " + user.getUsername() +
                             " (session: " + userSession.getId() + ")");

        } catch (Exception e) {
            System.err.println("[DIVE AMR] Error enriching AMR/ACR: " + e.getMessage());
            e.printStackTrace();
            // Don't fail authentication, just log error
        }
    }

    @Override
    public void onEvent(AdminEvent adminEvent, boolean b) {
        // Not used for admin events
    }

    @Override
    public void close() {
        // Nothing to close
    }
}
