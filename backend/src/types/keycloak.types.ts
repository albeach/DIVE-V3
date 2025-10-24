/**
 * Keycloak Admin API Type Definitions
 * 
 * Types for Identity Provider management via Keycloak Admin REST API
 * Reference: keycloak-admin-api-llm.md
 */

// ============================================
// Identity Provider Types
// ============================================

export type IdPProtocol = 'oidc' | 'saml';
export type IdPStatus = 'pending' | 'approved' | 'active' | 'rejected' | 'disabled';

/**
 * OIDC Identity Provider Configuration
 */
export interface IOIDCIdPConfig {
    issuer: string;
    clientId: string;
    clientSecret: string;
    authorizationUrl: string;
    tokenUrl: string;
    userInfoUrl?: string;
    jwksUrl?: string;
    defaultScopes?: string;
    validateSignature?: boolean;
}

/**
 * SAML Identity Provider Configuration
 */
export interface ISAMLIdPConfig {
    entityId: string;
    singleSignOnServiceUrl: string;
    singleLogoutServiceUrl?: string;
    certificate?: string;
    signatureAlgorithm?: string;
    nameIDFormat?: string;
    wantAssertionsSigned?: boolean;
    wantAuthnRequestsSigned?: boolean;
    validateSignature?: boolean;
    postBindingResponse?: boolean;
    postBindingAuthnRequest?: boolean;
}

/**
 * Protocol Mapper Configuration
 */
export interface IProtocolMapper {
    name: string;
    protocol: 'openid-connect' | 'saml';
    protocolMapper: string;
    config: Record<string, string>;
}

/**
 * DIVE Attribute Mappings
 */
export interface IDIVEAttributeMappings {
    uniqueID: {
        claim: string;          // Source claim/attribute name from IdP
        userAttribute: string;  // Target user attribute in Keycloak
    };
    clearance: {
        claim: string;
        userAttribute: string;
    };
    countryOfAffiliation: {
        claim: string;
        userAttribute: string;
    };
    acpCOI: {
        claim: string;
        userAttribute: string;
        multivalued?: boolean;
    };
}

/**
 * Identity Provider Representation (from Keycloak)
 */
export interface IIdentityProviderRepresentation {
    alias: string;
    displayName: string;
    providerId: IdPProtocol;
    enabled: boolean;
    trustEmail: boolean;
    storeToken: boolean;
    addReadTokenRoleOnCreate?: boolean;
    authenticateByDefault?: boolean;
    linkOnly?: boolean;
    firstBrokerLoginFlowAlias?: string;
    config: Record<string, string>;
    // Custom fields for DIVE
    status?: IdPStatus;
    createdAt?: string;
    submittedBy?: string;
    reviewedBy?: string;
    reviewedAt?: string;
}

/**
 * Identity Provider Mapper Representation
 */
export interface IIdentityProviderMapper {
    id?: string;
    name: string;
    identityProviderAlias: string;
    identityProviderMapper: string;
    config: Record<string, string>;
}

/**
 * Identity Provider Creation Request
 */
export interface IIdPCreateRequest {
    alias: string;
    displayName: string;
    description?: string;
    protocol: IdPProtocol;
    config: IOIDCIdPConfig | ISAMLIdPConfig;
    attributeMappings: IDIVEAttributeMappings;
    submittedBy: string;
}

/**
 * Identity Provider Update Request
 */
export interface IIdPUpdateRequest {
    displayName?: string;
    description?: string;
    enabled?: boolean;
    config?: Partial<IOIDCIdPConfig | ISAMLIdPConfig>;
    attributeMappings?: Partial<IDIVEAttributeMappings>;
}

/**
 * Identity Provider List Response
 */
export interface IIdPListResponse {
    idps: Array<{
        alias: string;
        displayName: string;
        protocol: IdPProtocol;
        status: IdPStatus;
        enabled: boolean;
        createdAt?: string;
        submittedBy?: string;
    }>;
    total: number;
}

/**
 * Identity Provider Test Result
 */
export interface IIdPTestResult {
    success: boolean;
    message: string;
    details?: {
        reachable?: boolean;
        jwksValid?: boolean;
        certificateValid?: boolean;
        attributesFound?: string[];
        isLocal?: boolean;
        configPresent?: boolean;
        configKeys?: string[];
        hasIssuer?: boolean;
        hasAuthUrl?: boolean;
        hasTokenUrl?: boolean;
        hasSsoUrl?: boolean;
        hasCertificate?: boolean;
    };
}

// ============================================
// Realm Management Types
// ============================================

export interface IRealmRepresentation {
    id?: string;
    realm: string;
    displayName?: string;
    enabled?: boolean;
    attributes?: Record<string, string>;
}

// ============================================
// Role Management Types
// ============================================

export interface IRoleRepresentation {
    id?: string;
    name: string;
    description?: string;
    composite?: boolean;
    clientRole?: boolean;
    containerId?: string;
    attributes?: Record<string, string[]>;
}

// ============================================
// User Management Types
// ============================================

export interface IUserRepresentation {
    id?: string;
    username: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    enabled?: boolean;
    emailVerified?: boolean;
    attributes?: Record<string, string[]>;
    realmRoles?: string[];
    federatedIdentities?: IFederatedIdentity[];
}

export interface IFederatedIdentity {
    identityProvider: string;
    userId: string;
    userName: string;
}

// ============================================
// Helper Types
// ============================================

export interface IKeycloakAdminConfig {
    baseUrl: string;
    realmName: string;
    username: string;
    password: string;
    clientId?: string;
}

export interface IKeycloakError {
    error: string;
    error_description?: string;
    errorMessage?: string;
}

// ============================================
// MFA Configuration Types (Phase 1.5)
// ============================================

export interface IMFAConfig {
    required: boolean;
    otp: {
        type: 'totp' | 'hotp';
        algorithm: 'HmacSHA1' | 'HmacSHA256' | 'HmacSHA512';
        digits: number;
        period: number;
        initialCounter?: number;
    };
    conditionalMFA?: {
        enabled: boolean;
        clearanceLevels?: string[]; // e.g., ["SECRET", "TOP_SECRET"]
    };
}

export interface IMFATestResult {
    success: boolean;
    message: string;
    flowAlias?: string;
    flowId?: string;
    requiredActions?: string[];
}

// ============================================
// Session Management Types (Phase 1.6)
// ============================================

export interface ISession {
    id: string;
    username: string;
    userId: string;
    ipAddress: string;
    start: number; // Unix timestamp
    lastAccess: number; // Unix timestamp
    clients: Record<string, string>; // clientId -> clientName
}

export interface ISessionFilters {
    username?: string;
    clientId?: string;
    ipAddress?: string;
}

export interface ISessionStats {
    totalActive: number;
    peakConcurrent24h: number;
    averageDuration: number; // in seconds
    byClient: Record<string, number>;
    byUser: Record<string, number>;
}

// ============================================
// Theme Management Types (Phase 1.7)
// ============================================

export interface IIdPTheme {
    idpAlias: string;
    enabled: boolean;
    colors: {
        primary: string;
        secondary: string;
        accent: string;
        background: string;
        text: string;
    };
    background: {
        type: 'image' | 'gradient';
        imageUrl?: string;
        blur: number; // 0-10
        overlayOpacity: number; // 0-1
        gradientDirection?: 'top-bottom' | 'left-right' | 'radial';
    };
    logo: {
        url: string;
        position: 'top-left' | 'top-center' | 'custom';
        customX?: number;
        customY?: number;
    };
    layout: {
        formPosition: 'left' | 'center' | 'right';
        formWidth: '400px' | '600px' | '800px';
        cardStyle: 'glassmorphism' | 'solid' | 'bordered' | 'floating';
        buttonStyle: 'rounded' | 'square' | 'pill';
        inputStyle: 'outlined' | 'filled' | 'underlined';
    };
    typography: {
        fontFamily: string;
        fontSize: 'small' | 'medium' | 'large';
    };
    localization: {
        defaultLanguage: string;
        enableToggle: boolean;
        supportedLanguages: string[]; // e.g., ["en", "fr"]
    };
    createdAt: Date;
    updatedAt: Date;
    createdBy: string; // admin uniqueID
}

export interface IThemeAssetUpload {
    file: Buffer;
    filename: string;
    mimetype: string;
    size: number;
}

export interface IThemePreviewOptions {
    device: 'desktop' | 'tablet' | 'mobile';
    language?: string;
}

