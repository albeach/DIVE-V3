package com.dive.keycloak.event;

import org.keycloak.events.Event;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventType;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.UserSessionModel;
import org.keycloak.models.AuthenticatedClientSessionModel;
import org.keycloak.sessions.AuthenticationSessionModel;

import java.util.ArrayList;
import java.util.List;

/**
 * DIVE V3 AMR Enrichment Event Listener
 * 
 * Keycloak 26 Issue: Browser flow sets AMR=["pwd"] but doesn't append "otp" when OTP validates
 * 
 * Solution: Event listener that enriches AMR after successful LOGIN
 * - Checks if user has OTP credential
 * - If OTP validated, updates AMR to ["pwd","otp"]
 * - Sets AUTH_METHODS_REF session note for protocol mappers
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
        // Only process successful login events
        if (event.getType() != EventType.LOGIN) {
            return;
        }

        try {
            System.out.println("[DIVE AMR] Login event detected for user: " + event.getUserId());

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

            // Build AMR array based on credentials validated
            List<String> amrMethods = new ArrayList<>();
            
            // Password is always required in browser flow
            amrMethods.add("pwd");
            
            // Check if user has OTP configured and session required it
            boolean hasOTP = user.credentialManager()
                .getStoredCredentialsByTypeStream("otp")
                .findFirst()
                .isPresent();
            
            if (hasOTP) {
                // User has OTP credential, so it was validated during login
                amrMethods.add("otp");
                System.out.println("[DIVE AMR] User has OTP credential - adding 'otp' to AMR");
            }

            // Build AMR JSON array string
            String amrJson = "[\"" + String.join("\",\"", amrMethods) + "\"]";
            
            System.out.println("[DIVE AMR] Setting AUTH_METHODS_REF: " + amrJson);
            
            // Set session note for protocol mappers to read
            userSession.setNote("AUTH_METHODS_REF", amrJson);
            
            System.out.println("[DIVE AMR] AMR enrichment complete for user: " + user.getUsername());
            
        } catch (Exception e) {
            System.err.println("[DIVE AMR] Error enriching AMR: " + e.getMessage());
            e.printStackTrace();
            // Don't fail login, just log error
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

