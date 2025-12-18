package com.dive.keycloak.event;

import org.keycloak.Config;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventListenerProviderFactory;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

/**
 * Factory for AMR Enrichment Event Listener
 */
public class AMREnrichmentEventListenerFactory implements EventListenerProviderFactory {

    public static final String PROVIDER_ID = "dive-amr-enrichment";

    @Override
    public EventListenerProvider create(KeycloakSession session) {
        return new AMREnrichmentEventListener(session);
    }

    @Override
    public void init(Config.Scope scope) {
        System.out.println("[DIVE AMR] AMR Enrichment Event Listener initialized");
    }

    @Override
    public void postInit(KeycloakSessionFactory keycloakSessionFactory) {
        // Nothing to do
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

