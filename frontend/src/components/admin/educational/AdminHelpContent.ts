/**
 * Admin Help Content Library
 *
 * Comprehensive help content for all admin UI forms and actions
 * Organized by admin page/section
 *
 * @version 1.0.0
 * @date 2026-01-29
 */

import { HelpContent, HelpPanelSection, QuickTip } from './ContextualHelp';

// ============================================
// IdP CONFIGURATION HELP
// ============================================

export const IdPHelpContent: Record<string, HelpContent> = {
  oidcDiscoveryUrl: {
    title: 'OIDC Discovery URL',
    description: 'The endpoint where the OpenID Connect provider publishes its configuration metadata. This URL typically ends with .well-known/openid-configuration.',
    examples: [
      'https://accounts.google.com/.well-known/openid-configuration',
      'https://login.microsoftonline.com/{tenant}/.well-known/openid-configuration',
      'https://keycloak.example.com/realms/{realm}/.well-known/openid-configuration',
    ],
    tips: [
      'Most modern IdPs auto-detect configuration from the discovery URL',
      'Test the URL in your browser - it should return a JSON response',
      'For Azure AD, replace {tenant} with your tenant ID or domain',
    ],
    learnMoreUrl: '/docs/idp/oidc-configuration',
    learnMoreLabel: 'OIDC Configuration Guide',
  },

  clientId: {
    title: 'OAuth 2.0 Client ID',
    description: 'Unique identifier for your DIVE V3 application registered with the identity provider. This is a public identifier and not considered secret.',
    examples: [
      '123456789012-abcdefghijklmnopqrstuv.apps.googleusercontent.com',
      'dive-v3-prod',
      'urn:dive:v3:client',
    ],
    warnings: [
      'Use separate client IDs for each environment (dev, staging, prod)',
    ],
    learnMoreUrl: '/docs/idp/client-registration',
  },

  clientSecret: {
    title: 'OAuth 2.0 Client Secret',
    description: 'Confidential password used to authenticate your application with the identity provider. Store securely in GCP Secret Manager.',
    warnings: [
      'NEVER commit client secrets to Git',
      'Rotate secrets every 90 days minimum',
      'Use GCP Secret Manager for production deployments',
    ],
    tips: [
      'Generate strong secrets (32+ characters)',
      'Keep backup of old secret during rotation',
      'Monitor for unauthorized access attempts',
    ],
    learnMoreUrl: '/docs/security/secrets-management',
  },

  samlMetadataUrl: {
    title: 'SAML Metadata URL',
    description: 'The endpoint where the SAML identity provider publishes its XML metadata. This metadata includes certificates, endpoints, and supported bindings.',
    examples: [
      'https://idp.example.com/saml/metadata',
      'https://login.microsoftonline.com/{tenant}/federationmetadata/2007-06/federationmetadata.xml',
    ],
    tips: [
      'Metadata URL should return valid XML',
      'Check certificate expiry dates in metadata',
      'Some IdPs require manual metadata upload instead of URL',
    ],
    learnMoreUrl: '/docs/idp/saml-configuration',
  },

  protocolMapper: {
    title: 'Protocol Mapper',
    description: 'Configuration that transforms identity provider claims into normalized DIVE V3 attributes (uniqueID, clearance, countryOfAffiliation, acpCOI).',
    examples: [
      'sub → uniqueID',
      'security_clearance → clearance (with value mapping)',
      'email_domain → countryOfAffiliation (enrichment)',
    ],
    warnings: [
      'Incorrect mappers can cause authorization failures',
      'Test mappings with all expected user types',
    ],
    learnMoreUrl: '/docs/idp/protocol-mappers',
  },

  clearanceMapping: {
    title: 'Clearance Level Mapping',
    description: 'Maps partner nation clearance levels to NATO standardized levels (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET).',
    examples: [
      'FR:CONFIDENTIEL_DEFENSE → CONFIDENTIAL',
      'FR:SECRET_DEFENSE → SECRET',
      'FR:TRES_SECRET_DEFENSE → TOP_SECRET',
    ],
    warnings: [
      'Default to lower clearance if mapping uncertain',
      'Log all clearance transformations for audit',
    ],
    learnMoreUrl: '/admin/clearance-management',
  },
};

export const IdPHelpPanelSections: HelpPanelSection[] = [
  {
    title: 'OIDC vs SAML: Which to Choose?',
    content: 'Choose based on your identity provider capabilities and organizational requirements.',
    items: [
      {
        label: 'Use OIDC if...',
        description: 'Your IdP is modern (Google, Azure AD, Auth0, Keycloak) and supports JSON Web Tokens. Recommended for new integrations.',
        example: 'Simpler configuration, better mobile support, JWT-based',
      },
      {
        label: 'Use SAML if...',
        description: 'Your IdP is enterprise legacy (Shibboleth, ADFS 2.0) or organizational policy requires SAML. Requires certificate management.',
        example: 'XML-based, requires metadata exchange, complex but mature',
      },
    ],
  },
  {
    title: 'Required Attributes',
    content: 'DIVE V3 requires these normalized attributes from all identity providers:',
    items: [
      {
        label: 'uniqueID (required)',
        description: 'Stable, unique identifier for the user. Should never change.',
        example: 'sub, eppn, persistent-id',
      },
      {
        label: 'clearance (required)',
        description: 'Security clearance level. Must be mapped to NATO standard levels.',
        example: 'UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET',
      },
      {
        label: 'countryOfAffiliation (required)',
        description: 'ISO 3166-1 alpha-3 country code of user affiliation.',
        example: 'USA, FRA, GBR, DEU, CAN',
      },
      {
        label: 'acpCOI (optional)',
        description: 'Community of Interest memberships (array).',
        example: '["FVEY", "NATO-COSMIC"]',
      },
    ],
  },
];

// ============================================
// FEDERATION HELP
// ============================================

export const FederationHelpContent: Record<string, HelpContent> = {
  spokeApproval: {
    title: 'Spoke Approval',
    description: 'Review and approve spoke instance registration requests. Ensures only authorized partner nations join the federation.',
    warnings: [
      'Verify spoke identity via out-of-band communication',
      'Check certificate chain of trust before approval',
      'Ensure bilateral agreements are in place',
    ],
    tips: [
      'Review spoke configuration before approval',
      'Start with limited policy access',
      'Monitor spoke health after approval',
    ],
    learnMoreUrl: '/docs/federation/spoke-approval',
  },

  policyBundle: {
    title: 'Policy Bundle',
    description: 'Signed package of OPA Rego policies distributed from hub to spokes via OPAL. Includes version, signature, and policy files.',
    warnings: [
      'Test policy bundles in staging before production',
      'Always sign bundles to ensure integrity',
      'Keep rollback bundles for emergency revert',
    ],
    learnMoreUrl: '/admin/federation/policies',
  },

  guardrails: {
    title: 'Federation Guardrails',
    description: 'Protective constraints that prevent spokes from creating policies that violate hub security requirements. Enforces minimum security standards.',
    examples: [
      'Spoke cannot lower classification requirements',
      'Spoke cannot expand releasability beyond approved countries',
      'Spoke cannot disable audit logging',
    ],
    learnMoreUrl: '/docs/federation/guardrails',
  },

  bilateralEffectiveMin: {
    title: 'Bilateral Effective-Min',
    description: 'Authorization pattern where the effective decision is the MINIMUM (most restrictive) of hub and spoke policies. Ensures no spoke can lower security.',
    examples: [
      'Hub: allow if clearance >= SECRET',
      'Spoke: allow if clearance >= TOP_SECRET',
      'Effective: allow if clearance >= TOP_SECRET (more restrictive)',
    ],
    learnMoreUrl: '/docs/federation/bilateral-policy',
  },
};

export const FederationHelpPanelSections: HelpPanelSection[] = [
  {
    title: 'Hub vs Spoke Responsibilities',
    content: 'Clear separation of responsibilities ensures secure federation operation.',
    items: [
      {
        label: 'Hub Responsibilities',
        description: 'Centralized policy distribution, spoke monitoring, audit aggregation, certificate authority, guardrail enforcement.',
      },
      {
        label: 'Spoke Responsibilities',
        description: 'Local policy enforcement, user authentication, audit event queueing, compliance reporting, failover handling.',
      },
    ],
  },
  {
    title: 'Policy Distribution Flow',
    content: 'Understanding how policies propagate through the federation.',
    items: [
      {
        label: '1. Hub Policy Update',
        description: 'Admin updates OPA policy in hub',
      },
      {
        label: '2. Bundle Creation',
        description: 'OPAL server creates signed policy bundle',
      },
      {
        label: '3. Distribution',
        description: 'OPAL pushes bundle to all connected spokes',
      },
      {
        label: '4. Spoke Verification',
        description: 'Spokes verify signature and apply policies',
      },
      {
        label: '5. Health Check',
        description: 'Spokes report policy version to hub',
      },
    ],
  },
];

// ============================================
// SECURITY & CERTIFICATES
// ============================================

export const SecurityHelpContent: Record<string, HelpContent> = {
  certificateRotation: {
    title: 'Certificate Rotation',
    description: 'Automated process of replacing expiring certificates with new ones every 90 days. Critical for maintaining trust in the federation.',
    warnings: [
      'Plan rotation during maintenance windows',
      'Keep old and new certificates valid for overlap period',
      'Notify partner nations 7 days before rotation',
    ],
    tips: [
      'Automate rotation to avoid manual errors',
      'Monitor certificate expiry dates (90/60/30 day alerts)',
      'Test rotation in staging first',
    ],
    learnMoreUrl: '/docs/security/certificate-rotation',
  },

  bundleSigning: {
    title: 'Policy Bundle Signing',
    description: 'Cryptographic signing of OPA policy bundles using Ed25519 keys. Ensures policy integrity and authenticity during distribution.',
    examples: [
      'Sign: openssl dgst -sha256 -sign private.pem bundle.tar.gz',
      'Verify: openssl dgst -sha256 -verify public.pem bundle.tar.gz.sig',
    ],
    learnMoreUrl: '/docs/security/bundle-signing',
  },

  crl: {
    title: 'Certificate Revocation List',
    description: 'List of revoked certificates published by Certificate Authority. Checked before trusting SAML assertions and policy bundle signatures.',
    warnings: [
      'CRL must be accessible to all federation members',
      'Update CRL immediately when compromise detected',
      'Monitor CRL size - consider OCSP for large deployments',
    ],
    learnMoreUrl: '/docs/security/certificate-revocation',
  },
};

// ============================================
// QUICK TIPS
// ============================================

export const AdminQuickTips: QuickTip[] = [
  {
    title: 'Use Command Palette for Fast Navigation',
    content: 'Press Cmd+K (Mac) or Ctrl+K (Windows) to instantly access any admin page. Fuzzy search works across all 25 pages.',
    actionLabel: 'Try it now',
    actionUrl: '#',
  },
  {
    title: 'Test IdP Configuration Before Approval',
    content: 'Always test IdP integration with multiple user types (different clearances, countries) before approving for production.',
    actionLabel: 'IdP Test Guide',
    actionUrl: '/docs/idp/testing',
  },
  {
    title: 'Monitor Spoke Health Regularly',
    content: 'Check the Federation dashboard daily for spoke connectivity issues, policy sync failures, and audit queue backlogs.',
    actionLabel: 'View Federation Status',
    actionUrl: '/admin/federation',
  },
  {
    title: 'Enable Certificate Expiry Alerts',
    content: 'Configure alerts for 90/60/30 day certificate expiry warnings. Automated rotation prevents unexpected outages.',
    actionLabel: 'Certificate Settings',
    actionUrl: '/admin/certificates',
  },
  {
    title: 'Review Audit Logs for Security Events',
    content: 'Regularly review authorization denials, failed authentications, and policy violations. Set up alerts for anomalies.',
    actionLabel: 'Open Audit Logs',
    actionUrl: '/admin/logs',
  },
  {
    title: 'Use Dry-Run for Bulk Operations',
    content: 'Always preview bulk operations (IdP updates, spoke approvals) with dry-run mode before applying changes.',
    actionLabel: 'Learn More',
    actionUrl: '/docs/admin/bulk-operations',
  },
  {
    title: 'Maintain Policy Rollback Bundles',
    content: 'Keep last 5 policy bundle versions for emergency rollback. Test rollback procedures quarterly.',
    actionLabel: 'Policy Versioning Guide',
    actionUrl: '/docs/federation/policy-versioning',
  },
  {
    title: 'Document Custom Protocol Mappers',
    content: 'Maintain documentation for all custom IdP protocol mappers. Include examples and edge cases for future reference.',
    actionLabel: 'Mapper Templates',
    actionUrl: '/docs/idp/mapper-templates',
  },
];

export default {
  IdPHelpContent,
  IdPHelpPanelSections,
  FederationHelpContent,
  FederationHelpPanelSections,
  SecurityHelpContent,
  AdminQuickTips,
};
