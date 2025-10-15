/**
 * Frontend Admin Types
 * 
 * Types for IdP management wizard and admin console
 */

export type IdPProtocol = 'oidc' | 'saml';
export type IdPStatus = 'pending' | 'approved' | 'active' | 'rejected' | 'disabled';

export interface IOIDCConfig {
    issuer: string;
    clientId: string;
    clientSecret: string;
    authorizationUrl: string;
    tokenUrl: string;
    userInfoUrl?: string;
    jwksUrl?: string;
    defaultScopes?: string;
}

export interface ISAMLConfig {
    entityId: string;
    singleSignOnServiceUrl: string;
    singleLogoutServiceUrl?: string;
    certificate?: string;
    signatureAlgorithm?: string;
    nameIDFormat?: string;
    wantAssertionsSigned?: boolean;
    wantAuthnRequestsSigned?: boolean;
    validateSignature?: boolean;
}

export interface IAttributeMapping {
    claim: string;
    userAttribute: string;
}

export interface IIdPFormData {
    // Step 1: Protocol
    protocol: IdPProtocol;

    // Step 2: Basic Info
    alias: string;
    displayName: string;
    description?: string;

    // Step 3: Protocol Config
    oidcConfig?: IOIDCConfig;
    samlConfig?: ISAMLConfig;

    // Step 4: Attribute Mappings
    attributeMappings: {
        uniqueID: IAttributeMapping;
        clearance: IAttributeMapping;
        countryOfAffiliation: IAttributeMapping;
        acpCOI: IAttributeMapping;
    };

    // Auth0 Integration (Week 3.4.6)
    useAuth0?: boolean;
    auth0Protocol?: 'oidc' | 'saml';
    auth0AppType?: 'spa' | 'regular_web' | 'native';
    auth0ClientId?: string;
    auth0ClientSecret?: string;
}

export interface IIdPListItem {
    alias: string;
    displayName: string;
    protocol: IdPProtocol;
    status: IdPStatus;
    enabled: boolean;
    createdAt?: string;
    submittedBy?: string;
}

export interface IIdPTestResult {
    success: boolean;
    message: string;
    details?: {
        reachable?: boolean;
        jwksValid?: boolean;
        certificateValid?: boolean;
        attributesFound?: string[];
    };
}

export interface IAdminAPIResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
    requestId?: string;
}

