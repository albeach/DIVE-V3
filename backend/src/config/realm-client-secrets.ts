/**
 * Realm-Specific Client Secrets
 * 
 * This file maps each national realm to its specific client secret
 * for the dive-v3-broker-client.
 * 
 * Security Note:
 * - In production, these should be loaded from environment variables
 * - or a secrets management system (AWS Secrets Manager, HashiCorp Vault, etc.)
 * - Never commit actual secrets to Git
 * 
 * Phase 2.1 Hotfix: Realm-specific client secrets required because
 * each Keycloak realm has its own unique client secret for dive-v3-broker-client
 */

interface RealmClientSecrets {
    [realmName: string]: string;
}

/**
 * Map of realm names to their client secrets
 * These are extracted from terraform output
 */
export const REALM_CLIENT_SECRETS: RealmClientSecrets = {
    // National Realms
    'dive-v3-usa': process.env.USA_CLIENT_SECRET || 'b8jQSA700JnYa8X9tE17hfOfw4O9DnO9',
    'dive-v3-fra': process.env.FRA_CLIENT_SECRET || 'UqvZeIpih15cKwnM5Qg2e37lCmdmsbhz',
    'dive-v3-can': process.env.CAN_CLIENT_SECRET || 'P3IWa9yyX4sp3stjIWPJn9YaQPU8qCV7',
    'dive-v3-deu': process.env.DEU_CLIENT_SECRET || 'ycXxnPyaCPAJ3XO5jIs8Lscg6zhshYlv',
    'dive-v3-gbr': process.env.GBR_CLIENT_SECRET || 'VwgV85FzJUN07vCsx3DbOB7qdxRDXzvT',
    'dive-v3-ita': process.env.ITA_CLIENT_SECRET || 'lapCFb5qzzz1xcKEhjifsE7GmNdra62P',
    'dive-v3-esp': process.env.ESP_CLIENT_SECRET || 'd0JFAa7mVDyjfGPbh5gjzS2fcwj8fv1A',
    'dive-v3-pol': process.env.POL_CLIENT_SECRET || 'kq8xgTJx0AAOQLsUfWjeDbGxbpCGcEMP',
    'dive-v3-nld': process.env.NLD_CLIENT_SECRET || 'vdn7pWPf0f8msPZPYetrmSWWHIDqLIcx',
    'dive-v3-industry': process.env.INDUSTRY_CLIENT_SECRET || '7FW6q4oBWRubhm5zLDkFrgp3TlqCLgUP',

    // Broker Realm (fallback)
    'dive-v3-broker': process.env.KEYCLOAK_CLIENT_SECRET || '8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L',
};

/**
 * Get client secret for a specific realm
 * @param realmName Keycloak realm name (e.g., "dive-v3-usa" or "dive-v3-broker")
 * @returns Client secret for the realm's client
 * @throws Error if realm not found
 */
export function getClientSecretForRealm(realmName: string): string {
  const secret = REALM_CLIENT_SECRETS[realmName];
  
  if (!secret) {
    // Phase 2.3: If realm not found, default to broker secret for federation
    // This handles cases where IdP brokers authenticate via broker realm
    console.warn(`No specific client secret for realm ${realmName}, using broker secret`);
    return REALM_CLIENT_SECRETS['dive-v3-broker'] || process.env.KEYCLOAK_CLIENT_SECRET || '';
  }
  
  return secret;
}

/**
 * Get all configured realm names
 * @returns Array of realm names that have client secrets
 */
export function getConfiguredRealms(): string[] {
    return Object.keys(REALM_CLIENT_SECRETS);
}

/**
 * Check if a realm has a configured client secret
 * @param realmName Keycloak realm name
 * @returns True if realm has a configured secret
 */
export function hasRealmSecret(realmName: string): boolean {
    return realmName in REALM_CLIENT_SECRETS;
}
