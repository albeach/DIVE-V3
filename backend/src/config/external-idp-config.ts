/**
 * DIVE V3 - External IdP Configuration
 * 
 * Maps IdP aliases to external OIDC/SAML providers
 * Replaces mock realm routing with actual external IdP endpoints
 */

export interface ExternalIdPConfig {
    enabled: boolean;
    protocol: 'OIDC' | 'SAML';
    keycloakUrl: string;
    realmName: string;
    clientId: string;
    clientSecret?: string;
    discoveryUrl?: string;
}

/**
 * External IdP Configuration Map
 * 
 * When enabled, routes authentication to external IdP instead of mock realm
 */
export const EXTERNAL_IDP_CONFIG: Record<string, ExternalIdPConfig> = {
    // USA OIDC IdP - External Keycloak instance
    'usa-realm-broker': {
        enabled: process.env.USE_EXTERNAL_USA_IDP === 'true',
        protocol: 'OIDC',
        keycloakUrl: process.env.USA_EXTERNAL_OIDC_URL || 'http://usa-oidc:8080',
        realmName: 'us-dod',
        clientId: 'dive-v3-client',
        clientSecret: process.env.USA_EXTERNAL_CLIENT_SECRET || 'usa-dod-secret-change-in-production',
        discoveryUrl: process.env.USA_EXTERNAL_OIDC_URL ?
            `${process.env.USA_EXTERNAL_OIDC_URL}/realms/us-dod/.well-known/openid-configuration` :
            'http://usa-oidc:8080/realms/us-dod/.well-known/openid-configuration',
    },

    // Spain SAML IdP - SimpleSAMLphp v2.4.3
    'esp-realm-external': {
        enabled: process.env.USE_EXTERNAL_SPAIN_IDP === 'true',
        protocol: 'SAML',
        keycloakUrl: process.env.SPAIN_EXTERNAL_SAML_URL || 'http://localhost:9443',
        realmName: 'dive-v3-broker', // SAML IdP is registered in broker realm
        clientId: '', // Not applicable for SAML
        discoveryUrl: `${process.env.SPAIN_EXTERNAL_SAML_URL || 'http://localhost:9443'}/simplesaml/saml2/idp/metadata.php`,
    },

    // Legacy alias for backward compatibility
    'spain-external': {
        enabled: process.env.USE_EXTERNAL_SPAIN_IDP === 'true',
        protocol: 'SAML',
        keycloakUrl: process.env.SPAIN_EXTERNAL_SAML_URL || 'http://localhost:9443',
        realmName: 'dive-v3-broker',
        clientId: '', // Not applicable for SAML
        discoveryUrl: `${process.env.SPAIN_EXTERNAL_SAML_URL || 'http://localhost:9443'}/simplesaml/saml2/idp/metadata.php`,
    },

    // Add more external IdPs as needed
    // 'canada-external': { ... },
    // 'france-external': { ... },
};

/**
 * Get external IdP configuration for an IdP alias
 * @param idpAlias IdP alias (e.g., 'usa-realm-broker')
 * @returns External IdP config if enabled, null otherwise
 */
export function getExternalIdPConfig(idpAlias: string): ExternalIdPConfig | null {
    const config = EXTERNAL_IDP_CONFIG[idpAlias];

    if (config && config.enabled) {
        return config;
    }

    return null;
}

/**
 * Get Keycloak realm name for an IdP alias
 * Supports both mock realms and external IdPs
 * 
 * @param idpAlias IdP alias (e.g., 'usa-realm-broker', 'dive-v3-broker')
 * @returns Realm name to use for authentication
 */
export function getRealmNameForIdP(idpAlias: string): string {
    // Check if external IdP is configured
    const externalConfig = getExternalIdPConfig(idpAlias);
    if (externalConfig) {
        return externalConfig.realmName;
    }

    // Fallback to mock realm logic
    if (idpAlias === 'dive-v3-broker') {
        return 'dive-v3-broker';
    } else if (idpAlias.includes('-realm-broker')) {
        // Extract country code: "usa-realm-broker" → "usa"
        const countryCode = idpAlias.split('-')[0];
        return `dive-v3-${countryCode}`;
    } else if (idpAlias.includes('-realm-external') || idpAlias.includes('-external')) {
        // External IdPs registered in broker realm (e.g., esp-realm-external)
        // These are IdP aliases in dive-v3-broker, not separate realms
        return 'dive-v3-broker';
    } else {
        // Fallback
        return idpAlias.replace('-idp', '');
    }
}

/**
 * Get Keycloak URL for an IdP alias
 * Routes to external IdP if configured, otherwise uses main Keycloak
 * 
 * @param idpAlias IdP alias
 * @returns Keycloak URL to use
 */
export function getKeycloakUrlForIdP(idpAlias: string): string {
    // Check if external IdP is configured
    const externalConfig = getExternalIdPConfig(idpAlias);
    if (externalConfig) {
        return externalConfig.keycloakUrl;
    }

    // Default to main Keycloak
    return process.env.KEYCLOAK_URL || 'http://keycloak:8080';
}

/**
 * Get client credentials for an IdP alias
 * Uses external IdP client if configured, otherwise uses broker client
 * 
 * @param idpAlias IdP alias
 * @returns Client ID and secret
 */
export function getClientCredentialsForIdP(idpAlias: string): { clientId: string; clientSecret: string } {
    // Check if external IdP is configured
    const externalConfig = getExternalIdPConfig(idpAlias);
    if (externalConfig && externalConfig.clientId) {
        return {
            clientId: externalConfig.clientId,
            clientSecret: externalConfig.clientSecret || '',
        };
    }

    // Default to broker client
    return {
        clientId: process.env.KEYCLOAK_CLIENT_ID || 'dive-v3-broker',
        clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
    };
}

/**
 * Check if an IdP is using external provider
 * @param idpAlias IdP alias
 * @returns True if using external IdP
 */
export function isExternalIdP(idpAlias: string): boolean {
    const config = getExternalIdPConfig(idpAlias);
    return config !== null;
}
