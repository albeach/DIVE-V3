/**
 * Admin Intelligence Service
 *
 * Provides smart suggestions and automated intelligence for admin UI:
 * - Auto-detect OIDC discovery URLs
 * - Suggest protocol mappers based on IdP type
 * - Pre-fill SAML metadata from URL
 * - Recommend policy packs based on tenant type
 * - Certificate expiry warnings
 * - Anomaly detection for unusual authorization denials
 *
 * @version 1.0.0
 * @date 2026-01-29
 */

import { notify } from '@/lib/notification-service';

// ============================================
// Types
// ============================================

export interface OIDCDiscoveryResult {
  success: boolean;
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksUri?: string;
  userInfoEndpoint?: string;
  supportedScopes?: string[];
  supportedResponseTypes?: string[];
  error?: string;
}

export interface ProtocolMapperSuggestion {
  name: string;
  type: string;
  claimName: string;
  userAttribute: string;
  description: string;
  required: boolean;
  example?: string;
}

export interface SAMLMetadataResult {
  success: boolean;
  entityId?: string;
  ssoServiceUrl?: string;
  logoutServiceUrl?: string;
  certificates?: string[];
  attributes?: string[];
  error?: string;
}

export interface PolicyPackRecommendation {
  id: string;
  name: string;
  description: string;
  reason: string;
  policies: string[];
  confidence: number; // 0-100
}

export interface CertificateExpiryWarning {
  id: string;
  name: string;
  type: 'hub' | 'spoke' | 'idp' | 'saml' | 'tls';
  expiresAt: string;
  daysRemaining: number;
  severity: 'critical' | 'warning' | 'info';
  autoRenewable: boolean;
  renewalUrl?: string;
}

export interface AuthzAnomalyAlert {
  id: string;
  type: 'unusual_denial_rate' | 'new_country_denials' | 'clearance_violations' | 'policy_drift';
  severity: 'high' | 'medium' | 'low';
  message: string;
  details: Record<string, any>;
  detectedAt: string;
  affectedUsers?: number;
  affectedResources?: number;
  recommendedAction?: string;
}

// ============================================
// OIDC Discovery Auto-Detection
// ============================================

/**
 * Auto-detect OIDC discovery URL from domain
 *
 * @example
 * autoDetectOIDCDiscovery("accounts.google.com")
 * // Returns: "https://accounts.google.com/.well-known/openid-configuration"
 */
export async function autoDetectOIDCDiscovery(
  domain: string
): Promise<OIDCDiscoveryResult> {
  try {
    // Normalize domain (remove protocol if present)
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Try standard .well-known endpoint
    const discoveryUrl = `https://${cleanDomain}/.well-known/openid-configuration`;

    const response = await fetch(discoveryUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Discovery endpoint returned ${response.status}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      issuer: data.issuer,
      authorizationEndpoint: data.authorization_endpoint,
      tokenEndpoint: data.token_endpoint,
      jwksUri: data.jwks_uri,
      userInfoEndpoint: data.userinfo_endpoint,
      supportedScopes: data.scopes_supported,
      supportedResponseTypes: data.response_types_supported,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch discovery document',
    };
  }
}

/**
 * Detect well-known OIDC providers
 */
export function detectOIDCProvider(domain: string): {
  provider: string;
  discoveryUrl: string;
  docsUrl?: string;
} | null {
  const providers: Record<string, { discoveryUrl: string; docsUrl: string }> = {
    'google': {
      discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
      docsUrl: 'https://developers.google.com/identity/protocols/oauth2/openid-connect',
    },
    'microsoft': {
      discoveryUrl: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
      docsUrl: 'https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-protocols-oidc',
    },
    'okta': {
      discoveryUrl: 'https://{domain}/.well-known/openid-configuration',
      docsUrl: 'https://developer.okta.com/docs/reference/api/oidc/',
    },
    'auth0': {
      discoveryUrl: 'https://{domain}/.well-known/openid-configuration',
      docsUrl: 'https://auth0.com/docs/protocols/oidc',
    },
    'keycloak': {
      discoveryUrl: 'https://{domain}/realms/{realm}/.well-known/openid-configuration',
      docsUrl: 'https://www.keycloak.org/docs/latest/securing_apps/',
    },
  };

  const domainLower = domain.toLowerCase();

  for (const [provider, config] of Object.entries(providers)) {
    if (domainLower.includes(provider)) {
      return {
        provider,
        discoveryUrl: config.discoveryUrl.replace('{domain}', domain),
        docsUrl: config.docsUrl,
      };
    }
  }

  return null;
}

// ============================================
// Protocol Mapper Suggestions
// ============================================

/**
 * Suggest protocol mappers based on IdP type
 */
export function suggestProtocolMappers(
  idpType: 'oidc' | 'saml',
  providerHint?: string
): ProtocolMapperSuggestion[] {
  const baseMappers: ProtocolMapperSuggestion[] = [
    {
      name: 'uniqueID',
      type: idpType === 'oidc' ? 'oidc-user-attribute-mapper' : 'saml-user-attribute-mapper',
      claimName: 'uniqueID',
      userAttribute: idpType === 'oidc' ? 'sub' : 'uid',
      description: 'Unique user identifier (required for DIVE V3)',
      required: true,
      example: 'john.doe@mil',
    },
    {
      name: 'clearance',
      type: idpType === 'oidc' ? 'oidc-user-attribute-mapper' : 'saml-user-attribute-mapper',
      claimName: 'clearance',
      userAttribute: 'clearanceLevel',
      description: 'NATO clearance level (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)',
      required: true,
      example: 'SECRET',
    },
    {
      name: 'countryOfAffiliation',
      type: idpType === 'oidc' ? 'oidc-user-attribute-mapper' : 'saml-user-attribute-mapper',
      claimName: 'countryOfAffiliation',
      userAttribute: 'country',
      description: 'ISO 3166-1 alpha-3 country code',
      required: true,
      example: 'USA',
    },
    {
      name: 'acpCOI',
      type: idpType === 'oidc' ? 'oidc-user-attribute-mapper' : 'saml-user-attribute-mapper',
      claimName: 'acpCOI',
      userAttribute: 'communityOfInterest',
      description: 'Community of Interest memberships (optional)',
      required: false,
      example: '["NATO-COSMIC", "FVEY"]',
    },
  ];

  // Add provider-specific suggestions
  if (providerHint) {
    const hint = providerHint.toLowerCase();

    if (hint.includes('microsoft') || hint.includes('azure')) {
      baseMappers.push({
        name: 'email',
        type: 'oidc-user-attribute-mapper',
        claimName: 'email',
        userAttribute: 'email',
        description: 'User email from Azure AD',
        required: false,
        example: 'john.doe@organization.mil',
      });
    }

    if (hint.includes('google')) {
      baseMappers.push({
        name: 'email',
        type: 'oidc-user-attribute-mapper',
        claimName: 'email',
        userAttribute: 'email',
        description: 'User email from Google',
        required: false,
        example: 'john.doe@gmail.com',
      });
    }

    if (hint.includes('keycloak')) {
      baseMappers.push({
        name: 'groups',
        type: 'oidc-group-membership-mapper',
        claimName: 'groups',
        userAttribute: 'groups',
        description: 'User group memberships',
        required: false,
        example: '["admins", "operators"]',
      });
    }
  }

  return baseMappers;
}

/**
 * Validate protocol mapper configuration
 */
export function validateProtocolMapper(mapper: {
  name: string;
  claimName: string;
  userAttribute: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!mapper.name || mapper.name.trim().length === 0) {
    errors.push('Mapper name is required');
  }

  if (!mapper.claimName || mapper.claimName.trim().length === 0) {
    errors.push('Claim name is required');
  }

  if (!mapper.userAttribute || mapper.userAttribute.trim().length === 0) {
    errors.push('User attribute is required');
  }

  // Check for required DIVE V3 attributes
  const requiredClaims = ['uniqueID', 'clearance', 'countryOfAffiliation'];
  const hasRequiredClaim = requiredClaims.includes(mapper.claimName);

  if (!hasRequiredClaim && mapper.claimName && !mapper.claimName.match(/^[a-zA-Z0-9_]+$/)) {
    errors.push('Claim name should contain only alphanumeric characters and underscores');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// SAML Metadata Pre-Fill
// ============================================

/**
 * Fetch and parse SAML metadata from URL
 */
export async function fetchSAMLMetadata(
  metadataUrl: string
): Promise<SAMLMetadataResult> {
  try {
    const response = await fetch(metadataUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/xml, text/xml' },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Metadata endpoint returned ${response.status}`,
      };
    }

    const xmlText = await response.text();
    
    // Parse XML (basic parsing - in production use a proper XML parser)
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // Extract key fields
    const entityId = xmlDoc.querySelector('EntityDescriptor')?.getAttribute('entityID') || undefined;
    
    const ssoService = xmlDoc.querySelector('SingleSignOnService[Binding*="HTTP-POST"]') ||
                       xmlDoc.querySelector('SingleSignOnService[Binding*="HTTP-Redirect"]');
    const ssoServiceUrl = ssoService?.getAttribute('Location') || undefined;

    const logoutService = xmlDoc.querySelector('SingleLogoutService');
    const logoutServiceUrl = logoutService?.getAttribute('Location') || undefined;

    // Extract certificates
    const certElements = xmlDoc.querySelectorAll('X509Certificate');
    const certificates = Array.from(certElements).map(cert => cert.textContent?.trim()).filter(Boolean) as string[];

    // Extract supported attributes
    const attributeElements = xmlDoc.querySelectorAll('Attribute');
    const attributes = Array.from(attributeElements).map(attr => attr.getAttribute('Name')).filter(Boolean) as string[];

    return {
      success: true,
      entityId,
      ssoServiceUrl,
      logoutServiceUrl,
      certificates,
      attributes,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse SAML metadata',
    };
  }
}

// ============================================
// Policy Pack Recommendations
// ============================================

/**
 * Recommend policy packs based on tenant type and requirements
 */
export function recommendPolicyPacks(context: {
  tenantType?: 'government' | 'military' | 'industry' | 'coalition';
  classification?: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
  countries?: string[];
  cois?: string[];
}): PolicyPackRecommendation[] {
  const recommendations: PolicyPackRecommendation[] = [];

  // Base ABAC policy (always recommended)
  recommendations.push({
    id: 'base-abac',
    name: 'Base ABAC Policy',
    description: 'Fundamental attribute-based access control rules',
    reason: 'Required for all DIVE V3 instances',
    policies: ['base/clearance.rego', 'base/releasability.rego', 'base/coi.rego'],
    confidence: 100,
  });

  // Classification-based recommendations
  if (context.classification && ['SECRET', 'TOP_SECRET'].includes(context.classification)) {
    recommendations.push({
      id: 'classified-ops',
      name: 'Classified Operations',
      description: 'Enhanced security controls for classified environments',
      reason: `Tenant handles ${context.classification} data`,
      policies: [
        'tenant/classified-restrictions.rego',
        'tenant/need-to-know.rego',
        'tenant/compartmented-access.rego',
      ],
      confidence: 95,
    });
  }

  // Military-specific recommendations
  if (context.tenantType === 'military') {
    recommendations.push({
      id: 'military-ops',
      name: 'Military Operations',
      description: 'NATO military operational security policies',
      reason: 'Tenant is a military organization',
      policies: [
        'org/nato-stanag.rego',
        'org/mission-clearance.rego',
        'org/opsec-controls.rego',
      ],
      confidence: 90,
    });
  }

  // Coalition-specific recommendations
  if (context.tenantType === 'coalition' || (context.countries && context.countries.length > 1)) {
    recommendations.push({
      id: 'coalition-sharing',
      name: 'Coalition Information Sharing',
      description: 'Multi-national data sharing policies with bilateral constraints',
      reason: 'Tenant operates in a coalition environment',
      policies: [
        'base/bilateral-effective-min.rego',
        'base/releasability-matrix.rego',
        'base/originator-control.rego',
      ],
      confidence: 85,
    });
  }

  // Industry-specific recommendations
  if (context.tenantType === 'industry') {
    recommendations.push({
      id: 'industry-controls',
      name: 'Industry Access Controls',
      description: 'Contractor and partner access restrictions',
      reason: 'Tenant is an industry partner',
      policies: [
        'org/contractor-restrictions.rego',
        'org/time-limited-access.rego',
        'org/facility-clearance.rego',
      ],
      confidence: 80,
    });
  }

  // COI-based recommendations
  if (context.cois && context.cois.length > 0) {
    const hasFVEY = context.cois.some(coi => coi === 'FVEY');
    const hasNATO = context.cois.some(coi => coi.includes('NATO'));

    if (hasFVEY) {
      recommendations.push({
        id: 'fvey-sharing',
        name: 'Five Eyes Information Sharing',
        description: 'FVEY-specific data sharing policies',
        reason: 'Tenant is a FVEY member',
        policies: ['org/fvey-releasability.rego', 'org/fvey-caveats.rego'],
        confidence: 90,
      });
    }

    if (hasNATO) {
      recommendations.push({
        id: 'nato-cosmic',
        name: 'NATO COSMIC TOP SECRET',
        description: 'NATO high classification policies',
        reason: 'Tenant handles NATO COSMIC data',
        policies: ['org/nato-cosmic.rego', 'org/acp240-compliance.rego'],
        confidence: 95,
      });
    }
  }

  return recommendations.sort((a, b) => b.confidence - a.confidence);
}

// ============================================
// Certificate Expiry Warnings
// ============================================

/**
 * Check certificate expiry and generate warnings
 */
export function checkCertificateExpiry(certificates: {
  id: string;
  name: string;
  type: 'hub' | 'spoke' | 'idp' | 'saml' | 'tls';
  expiresAt: string;
  autoRenewable?: boolean;
}[]): CertificateExpiryWarning[] {
  const now = new Date();
  const warnings: CertificateExpiryWarning[] = [];

  for (const cert of certificates) {
    const expiryDate = new Date(cert.expiresAt);
    const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    let severity: 'critical' | 'warning' | 'info';
    if (daysRemaining <= 7) {
      severity = 'critical';
    } else if (daysRemaining <= 30) {
      severity = 'warning';
    } else if (daysRemaining <= 90) {
      severity = 'info';
    } else {
      continue; // Don't warn for certs > 90 days
    }

    warnings.push({
      id: cert.id,
      name: cert.name,
      type: cert.type,
      expiresAt: cert.expiresAt,
      daysRemaining,
      severity,
      autoRenewable: cert.autoRenewable || false,
      renewalUrl: cert.type === 'hub' ? '/admin/certificates' : undefined,
    });
  }

  return warnings.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Generate user-friendly certificate expiry message
 */
export function formatCertificateWarning(warning: CertificateExpiryWarning): string {
  const dayText = warning.daysRemaining === 1 ? 'day' : 'days';
  
  if (warning.severity === 'critical') {
    return `🚨 CRITICAL: ${warning.name} expires in ${warning.daysRemaining} ${dayText}! ${
      warning.autoRenewable ? 'Auto-renewal will be attempted.' : 'Manual renewal required.'
    }`;
  } else if (warning.severity === 'warning') {
    return `⚠️ WARNING: ${warning.name} expires in ${warning.daysRemaining} ${dayText}. ${
      warning.autoRenewable ? 'Auto-renewal scheduled.' : 'Plan for manual renewal.'
    }`;
  } else {
    return `ℹ️ INFO: ${warning.name} expires in ${warning.daysRemaining} ${dayText}.`;
  }
}

// ============================================
// Anomaly Detection
// ============================================

/**
 * Detect unusual authorization patterns
 */
export function detectAuthzAnomalies(metrics: {
  denialRate: number; // 0-100
  historicalDenialRate: number; // 0-100
  denialsByCountry: Record<string, number>;
  denialsByClearance: Record<string, number>;
  totalDecisions: number;
  timeRange: '24h' | '7d' | '30d';
}): AuthzAnomalyAlert[] {
  const alerts: AuthzAnomalyAlert[] = [];

  // 1. Unusual denial rate spike
  const denialRateChange = metrics.denialRate - metrics.historicalDenialRate;
  if (denialRateChange > 20 && metrics.totalDecisions > 100) {
    alerts.push({
      id: `denial-spike-${Date.now()}`,
      type: 'unusual_denial_rate',
      severity: denialRateChange > 50 ? 'high' : 'medium',
      message: `Authorization denial rate spiked by ${denialRateChange.toFixed(1)}%`,
      details: {
        current: metrics.denialRate,
        historical: metrics.historicalDenialRate,
        change: denialRateChange,
      },
      detectedAt: new Date().toISOString(),
      affectedUsers: Math.floor(metrics.totalDecisions * (metrics.denialRate / 100)),
      recommendedAction: 'Review recent policy changes and user clearance levels',
    });
  }

  // 2. New country seeing denials
  for (const [country, denials] of Object.entries(metrics.denialsByCountry)) {
    if (denials > 10 && metrics.denialRate > 30) {
      alerts.push({
        id: `country-denials-${country}-${Date.now()}`,
        type: 'new_country_denials',
        severity: 'medium',
        message: `Unusual authorization denials for ${country}`,
        details: {
          country,
          denials,
          denialRate: (denials / metrics.totalDecisions) * 100,
        },
        detectedAt: new Date().toISOString(),
        affectedUsers: denials,
        recommendedAction: `Review releasability settings for ${country} or check if ${country} users need clearance updates`,
      });
    }
  }

  // 3. Clearance-level violations
  for (const [clearance, denials] of Object.entries(metrics.denialsByClearance)) {
    const violationRate = (denials / metrics.totalDecisions) * 100;
    if (violationRate > 40 && denials > 20) {
      alerts.push({
        id: `clearance-violations-${clearance}-${Date.now()}`,
        type: 'clearance_violations',
        severity: clearance === 'TOP_SECRET' ? 'high' : 'medium',
        message: `High denial rate for ${clearance} clearance level`,
        details: {
          clearance,
          denials,
          violationRate,
        },
        detectedAt: new Date().toISOString(),
        affectedUsers: denials,
        recommendedAction: `Review resource classification levels or verify ${clearance} user clearances are up to date`,
      });
    }
  }

  return alerts.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * Format anomaly alert for display
 */
export function formatAnomalyAlert(alert: AuthzAnomalyAlert): {
  title: string;
  message: string;
  action?: string;
} {
  return {
    title: alert.message,
    message: `Detected at ${new Date(alert.detectedAt).toLocaleString()}. ${
      alert.affectedUsers ? `Affects ${alert.affectedUsers} users.` : ''
    }`,
    action: alert.recommendedAction,
  };
}

// ============================================
// Export Service
// ============================================

export const adminIntelligence = {
  // OIDC
  autoDetectOIDCDiscovery,
  detectOIDCProvider,

  // Protocol Mappers
  suggestProtocolMappers,
  validateProtocolMapper,

  // SAML
  fetchSAMLMetadata,

  // Policy Packs
  recommendPolicyPacks,

  // Certificates
  checkCertificateExpiry,
  formatCertificateWarning,

  // Anomalies
  detectAuthzAnomalies,
  formatAnomalyAlert,
};

export default adminIntelligence;
