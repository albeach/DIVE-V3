/**
 * @file validation.types.ts
 * @description TypeScript type definitions for IdP validation services
 * 
 * Phase 1: Validation & Test Harness
 * These types support automated security validation of IdP configurations
 * before approval, checking TLS version, cryptographic algorithms, SAML
 * metadata, OIDC discovery endpoints, and MFA capabilities.
 */

/**
 * Result of TLS version and cipher validation
 * 
 * Scoring:
 * - TLS 1.3 = 15 points
 * - TLS 1.2 = 12 points
 * - TLS <1.2 = 0 points (fail)
 */
export interface ITLSCheckResult {
  /** Whether TLS validation passed (version >= 1.2) */
  pass: boolean;
  
  /** TLS protocol version (e.g., 'TLSv1.3', 'TLSv1.2') */
  version: string;
  
  /** Cipher suite name (e.g., 'ECDHE-RSA-AES256-GCM-SHA384') */
  cipher: string;
  
  /** Whether the certificate is valid (not expired, properly signed) */
  certificateValid: boolean;
  
  /** Certificate expiration date (if available) */
  certificateExpiry?: Date;
  
  /** Validation score (0-15) */
  score: number;
  
  /** Critical errors that caused validation failure */
  errors: string[];
  
  /** Non-critical warnings (e.g., certificate expiring soon) */
  warnings: string[];
}

/**
 * Result of cryptographic algorithm validation
 * 
 * Checks JWKS (OIDC) or XML signature methods (SAML) against
 * deny-list and allow-list.
 * 
 * Scoring:
 * - SHA-256+ = 25 points
 * - SHA-1 = 10 points (warning, pilot-tolerant)
 * - MD5 or weaker = 0 points (fail)
 */
export interface IAlgorithmCheckResult {
  /** Whether algorithm validation passed */
  pass: boolean;
  
  /** List of detected algorithms (e.g., ['RS256', 'RS512']) */
  algorithms: string[];
  
  /** List of security violations (e.g., ['Weak algorithm: SHA-1']) */
  violations: string[];
  
  /** Validation score (0-25) */
  score: number;
  
  /** Recommendations for improving security */
  recommendations: string[];
}

/**
 * Result of endpoint reachability check
 * 
 * Tests whether IdP endpoints (SSO URL, token endpoint, etc.)
 * are accessible and respond within timeout.
 */
export interface IEndpointCheckResult {
  /** Whether endpoint is reachable */
  reachable: boolean;
  
  /** Response time in milliseconds */
  latency_ms: number;
  
  /** Validation score (0-10) */
  score: number;
  
  /** Errors encountered during check */
  errors: string[];
}

/**
 * Certificate validation details
 * 
 * Extracted from SAML metadata or TLS connection
 */
export interface ICertificateInfo {
  /** Whether certificate is valid */
  valid: boolean;
  
  /** Certificate validity start date (ISO 8601) */
  notBefore: string;
  
  /** Certificate validity end date (ISO 8601) */
  notAfter: string;
  
  /** Days until certificate expires */
  daysUntilExpiry: number;
  
  /** Certificate issuer DN */
  issuer: string;
  
  /** Certificate subject DN */
  subject?: string;
  
  /** Warnings about certificate (e.g., self-signed, expiring soon) */
  warnings: string[];
}

/**
 * Result of SAML metadata XML parsing and validation
 * 
 * Validates SAML 2.0 metadata structure, extracts configuration,
 * and checks certificate validity.
 */
export interface ISAMLMetadataResult {
  /** Whether metadata is valid and parseable */
  valid: boolean;
  
  /** Entity ID from <EntityDescriptor> */
  entityId: string;
  
  /** SingleSignOnService endpoint URL */
  ssoUrl: string;
  
  /** SingleLogoutService endpoint URL (optional) */
  sloUrl?: string;
  
  /** Certificate information */
  certificate: ICertificateInfo;
  
  /** Signature algorithm URI */
  signatureAlgorithm: string;
  
  /** Critical errors that failed validation */
  errors: string[];
  
  /** Non-critical warnings */
  warnings: string[];
}

/**
 * OIDC endpoint URLs extracted from discovery
 */
export interface IOIDCEndpoints {
  /** Authorization endpoint URL */
  authorization: string;
  
  /** Token endpoint URL */
  token: string;
  
  /** JWKS URI */
  jwks: string;
  
  /** UserInfo endpoint URL (optional) */
  userinfo?: string;
  
  /** End session (logout) endpoint URL (optional) */
  endSession?: string;
}

/**
 * JWKS validation details
 */
export interface IJWKSInfo {
  /** Whether JWKS endpoint is reachable */
  reachable: boolean;
  
  /** Number of keys in JWKS */
  keyCount: number;
  
  /** List of algorithms used by keys */
  algorithms: string[];
}

/**
 * MFA support detection results
 */
export interface IMFASupportInfo {
  /** Whether MFA support was detected */
  detected: boolean;
  
  /** ACR (Authentication Context Class Reference) values indicating MFA */
  acrValues: string[];
}

/**
 * Result of OIDC discovery endpoint validation
 * 
 * Fetches and validates .well-known/openid-configuration,
 * checks required fields, and validates JWKS reachability.
 */
export interface IOIDCDiscoveryResult {
  /** Whether discovery document is valid */
  valid: boolean;
  
  /** Issuer URL from discovery */
  issuer: string;
  
  /** OIDC endpoint URLs */
  endpoints: IOIDCEndpoints;
  
  /** JWKS validation results */
  jwks: IJWKSInfo;
  
  /** MFA support detection */
  mfaSupport: IMFASupportInfo;
  
  /** Critical errors */
  errors: string[];
  
  /** Non-critical warnings */
  warnings: string[];
}

/**
 * Result of MFA detection analysis
 * 
 * Analyzes OIDC discovery (ACR values) or SAML metadata
 * (AuthnContextClassRef) to detect MFA capabilities.
 * 
 * Scoring:
 * - Documented policy = 20 points
 * - ACR/AMR hints = 15 points
 * - No evidence = 0 points
 */
export interface IMFACheckResult {
  /** Whether MFA was detected */
  detected: boolean;
  
  /** Evidence of MFA support */
  evidence: string[];
  
  /** Validation score (0-20) */
  score: number;
  
  /** Confidence level in detection */
  confidence: 'high' | 'medium' | 'low';
  
  /** Recommendations for improving MFA posture */
  recommendations: string[];
}

/**
 * Comprehensive validation results for an IdP submission
 * 
 * Contains results from all validation checks (TLS, crypto,
 * metadata/discovery, MFA) performed on IdP configuration.
 */
export interface IValidationResults {
  /** TLS version and cipher validation */
  tlsCheck: ITLSCheckResult;
  
  /** Cryptographic algorithm validation */
  algorithmCheck: IAlgorithmCheckResult;
  
  /** Endpoint reachability check */
  endpointCheck: IEndpointCheckResult;
  
  /** SAML metadata validation (SAML only) */
  metadataCheck?: ISAMLMetadataResult;
  
  /** OIDC discovery validation (OIDC only) */
  discoveryCheck?: IOIDCDiscoveryResult;
  
  /** MFA detection results */
  mfaCheck: IMFACheckResult;
}

/**
 * Preliminary risk score for IdP submission
 * 
 * Calculated from component validation scores.
 * Full risk scoring (with admin review, compliance checks)
 * will be implemented in Phase 2.
 */
export interface IPreliminaryScore {
  /** Total score (sum of component scores) */
  total: number;
  
  /** Maximum possible score */
  maxScore: number;
  
  /** Score breakdown by component */
  breakdown: {
    /** TLS score (0-15) */
    tlsScore: number;
    
    /** Cryptography score (0-25) */
    cryptoScore: number;
    
    /** MFA score (0-20) */
    mfaScore: number;
    
    /** Endpoint reachability score (0-10) */
    endpointScore: number;
  };
  
  /** Timestamp when score was computed (ISO 8601) */
  computedAt: string;
  
  /** Risk tier based on score (for display) */
  tier?: 'gold' | 'silver' | 'bronze' | 'fail';
}

/**
 * Validation configuration options
 * 
 * Controls validation behavior (strict mode, timeouts, etc.)
 */
export interface IValidationConfig {
  /** Minimum required TLS version (e.g., '1.2') */
  minTlsVersion: string;
  
  /** List of allowed signature algorithms */
  allowedAlgorithms: string[];
  
  /** List of denied signature algorithms */
  deniedAlgorithms: string[];
  
  /** Connection timeout in milliseconds */
  timeoutMs: number;
  
  /** Strict mode (reject SHA-1, self-signed certs) */
  strictMode: boolean;
  
  /** Allow self-signed certificates (pilot mode) */
  allowSelfSigned: boolean;
}
