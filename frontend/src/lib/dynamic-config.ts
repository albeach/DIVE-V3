/**
 * Dynamic URL Configuration for Multi-Domain Deployment
 * 
 * This utility automatically detects the current domain and configures
 * the correct API and Keycloak URLs based on the domain pattern.
 * 
 * Supports:
 * - localhost (development)
 * - dive25.com domains (production)
 * - Custom domains
 */

// Domain mapping for DIVE V3 instances
const DOMAIN_CONFIG = {
  'usa-app.dive25.com': {
    api: 'https://usa-api.dive25.com',
    keycloak: 'https://usa-idp.dive25.com',
    realm: 'dive-v3-broker-usa',
    instance: 'USA',
  },
  'fra-app.dive25.com': {
    api: 'https://fra-api.dive25.com',
    keycloak: 'https://fra-idp.dive25.com',
    realm: 'dive-v3-broker-fra',
    instance: 'FRA',
  },
  'gbr-app.dive25.com': {
    api: 'https://gbr-api.dive25.com',
    keycloak: 'https://gbr-idp.dive25.com',
    realm: 'dive-v3-broker-gbr',
    instance: 'GBR',
  },
  // Development fallbacks
  'localhost:3000': {
    api: 'https://localhost:4000',
    keycloak: 'https://localhost:8443',
    realm: 'dive-v3-broker-usa',
    instance: 'USA',
  },
  'localhost:3010': {
    api: 'https://localhost:4010',
    keycloak: 'https://localhost:8453',
    realm: 'dive-v3-broker-fra',
    instance: 'FRA',
  },
  'localhost:3031': {
    api: 'https://localhost:4031',
    keycloak: 'https://localhost:8474',
    realm: 'dive-v3-broker-gbr',
    instance: 'GBR',
  },
};

/**
 * Get configuration based on current hostname
 * Works in both browser (client) and server (SSR) contexts
 */
export function getDynamicConfig() {
  // Check if we're in browser or server
  const isBrowser = typeof window !== 'undefined';
  
  // Get hostname from appropriate context
  let hostname = '';
  if (isBrowser) {
    hostname = window.location.host; // e.g., "usa-app.dive25.com" or "localhost:3000"
  } else {
    // Server-side: try to get from request headers (Next.js)
    // This will be set via middleware
    hostname = process.env.NEXT_PUBLIC_CURRENT_HOST || 'localhost:3000';
  }

  // Find matching config
  const config = DOMAIN_CONFIG[hostname as keyof typeof DOMAIN_CONFIG];

  if (config) {
    return config;
  }

  // Fallback: try to parse instance from hostname pattern
  // e.g., "usa-app" -> USA config
  const match = hostname.match(/^([a-z]+)-app/);
  if (match) {
    const instanceCode = match[1].toUpperCase();
    const foundConfig = Object.values(DOMAIN_CONFIG).find(
      (c) => c.instance === instanceCode
    );
    if (foundConfig) return foundConfig;
  }

  // Ultimate fallback: use environment variables or localhost
  return {
    api: process.env.NEXT_PUBLIC_API_URL || 'https://localhost:4000',
    keycloak: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'https://localhost:8443',
    realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'dive-v3-broker-usa',
    instance: process.env.NEXT_PUBLIC_INSTANCE || 'USA',
  };
}

/**
 * Get API base URL
 */
export function getApiUrl(): string {
  return getDynamicConfig().api;
}

/**
 * Get Keycloak base URL
 */
export function getKeycloakUrl(): string {
  return getDynamicConfig().keycloak;
}

/**
 * Get Keycloak realm
 */
export function getKeycloakRealm(): string {
  return getDynamicConfig().realm;
}

/**
 * Get instance code
 */
export function getInstanceCode(): string {
  return getDynamicConfig().instance;
}

/**
 * Get full Keycloak issuer URL
 */
export function getKeycloakIssuer(): string {
  const { keycloak, realm } = getDynamicConfig();
  return `${keycloak}/realms/${realm}`;
}

/**
 * Server-side helper to detect configuration from request headers
 * Use this in middleware or API routes
 */
export function getConfigFromRequest(host: string | null) {
  if (!host) return getDynamicConfig();
  
  const config = DOMAIN_CONFIG[host as keyof typeof DOMAIN_CONFIG];
  if (config) return config;
  
  // Try pattern matching
  const match = host.match(/^([a-z]+)-app/);
  if (match) {
    const instanceCode = match[1].toUpperCase();
    const foundConfig = Object.values(DOMAIN_CONFIG).find(
      (c) => c.instance === instanceCode
    );
    if (foundConfig) return foundConfig;
  }
  
  return getDynamicConfig();
}

// Export for use in Next.js config
export { DOMAIN_CONFIG };
