<?php

/**
 * DIVE V3 - Keycloak SP Metadata (Remote)
 * This file defines the Keycloak broker as a Service Provider (SP)
 * that consumes SAML assertions from the Spain SAML IdP
 * 
 * Configuration Details:
 * - Entity ID: SimpleSAMLphp IdP metadata URL (matches Terraform config)
 * - Keycloak Broker: esp-realm-external
 * - Protocol: SAML 2.0
 * - NameID Format: Transient (session-based, no persistent identifiers)
 * - Signature Validation: Enabled
 * - Assertion Encryption: Disabled (local development)
 */

// The index of the array is the entity ID of the remote SP (Keycloak broker)
$metadata['http://localhost:9443/simplesaml/saml2/idp/metadata.php'] = [
    /**
     * AssertionConsumerService (ACS) URL
     * This is where Keycloak expects to receive SAML assertions
     * Format: http(s)://keycloak-host/realms/{realm}/broker/{idp-alias}/endpoint
     */
    'AssertionConsumerService' => 'http://localhost:8081/realms/dive-v3-broker/broker/esp-realm-external/endpoint',

    /**
     * SingleLogoutService (SLO) URL
     * Handles SAML logout requests and responses
     * Same endpoint as ACS for Keycloak broker
     */
    'SingleLogoutService' => 'http://localhost:8081/realms/dive-v3-broker/broker/esp-realm-external/endpoint',

    /**
     * X.509 Certificate (Base64 encoded)
     * Used to validate signatures on AuthnRequests from Keycloak
     * Source: Keycloak realm signing certificate (dive-v3-broker)
     * 
     * To rotate this certificate:
     * 1. Download new metadata from Keycloak SP descriptor endpoint
     * 2. Extract the X509Certificate element
     * 3. Update this certData field
     * 4. Restart SimpleSAMLphp container
     */
    'certData' => 'MIICqzCCAZMCBgGaR5EvTzANBgkqhkiG9w0BAQsFADAZMRcwFQYDVQQDDA5kaXZlLXYzLWJyb2tlcjAeFw0yNTExMDMwMjMzMDhaFw0zNTExMDMwMjM0NDhaMBkxFzAVBgNVBAMMDmRpdmUtdjMtYnJva2VyMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzd76MZ6x5BoCNrgwBvu/IXvagiUsiXpI9EyyYWcyrAMFzSjHghuMie02cRHwQIdop/sZhLf9BSV2NFxAY+y2KvjTC438oqxUrPPx/sE/ohIRdrxhrrFoqNxo5pB54PKTi4Jx99r6KTWiaqR8WiHoFF/GcdjV3lnx8m90hHduM/amOCDiPlSqMGvjNeZgF9iFBqyQJ8ZxQmC1KOuei9rs9QABx88yTXOgAtAvIGgLR11eAHuIuOc4LJ91XMt0anRq2JdekzGDVUTtRdDXSs8OdoSQxxJDo8fDH0TyxseHISPoAWSwDNi+89GB0w6/ngcSY3Env+r8VWKkuV2XVuFrZwIDAQABMA0GCSqGSIb3DQEBCwUAA4IBAQCC8L3Fx8Ulz37cYGNjetSX7cUk39IfBNtvhWm4+XsiGQQDVO/mxb9ADPSMKVpZby3Qj9AQ3D4y7r5FSFYKc1MTnYAmKFRuiTSiKvr51QB8EYMXhpNs+zcM1NcOwJdt1IseGd5LU5aHiPE/sZIdTSZJmJVEcZ65A8ft5XdrZHPFIAI0GHxzPtCPrNi8Wk0SmJJvYKEV0S/7NdovwTuRb2i9mOeKNMxuGGMTWZQ4rQO9crb3luSVaxvJjyeo68J/+t3h1yfPlq83ojBKBEF1rHNwVRIT8swulq8orHBtYm0qNJM/lwErJJC1XCQ7Vy2SofvmCjpN4/Au7OMhslQT+Xrn',

    /**
     * NameID Format
     * Transient: Session-based identifiers (no persistent tracking)
     * Compatible with Keycloak broker Transient NameID configuration
     */
    'NameIDFormat' => 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',

    /**
     * Validate AuthnRequest Signatures
     * When true, SimpleSAMLphp will validate signatures on AuthnRequests from Keycloak
     * Requires Keycloak to sign AuthnRequests (enabled by default in Terraform)
     */
    'validate.authnrequest' => true,

    /**
     * Sign Logout Messages
     * When true, SimpleSAMLphp will sign LogoutRequest and LogoutResponse messages
     * Keycloak will validate these signatures if configured to do so
     */
    'sign.logout' => true,

    /**
     * Assertion Encryption (Disabled for Local Development)
     * Production deployments should enable assertion encryption:
     * 
     * 'assertion.encryption' => true,
     * 'encryption.blacklisted-algorithms' => [
     *     'http://www.w3.org/2001/04/xmlenc#tripledes-cbc',
     *     'http://www.w3.org/2001/04/xmlenc#rsa-1_5',
     * ],
     */
    'assertion.encryption' => false,

    /**
     * Signature Algorithm
     * RSA-SHA256 (recommended for SAML 2.0)
     * 
     * Available options:
     * - http://www.w3.org/2001/04/xmldsig-more#rsa-sha256 (recommended)
     * - http://www.w3.org/2001/04/xmldsig-more#rsa-sha384
     * - http://www.w3.org/2001/04/xmldsig-more#rsa-sha512
     */
    'signature.algorithm' => 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',

    /**
     * Attributes to Release
     * These attributes will be included in SAML assertions sent to Keycloak
     * Must match Keycloak's attribute mapper configurations
     */
    'attributes' => [
        'uid',                  // → uniqueID (via Keycloak mapper)
        'mail',                 // → email
        'displayName',          // → displayName
        'nivelSeguridad',       // → clearance (after normalization)
        'paisAfiliacion',       // → countryOfAffiliation
        'acpCOI',              // → acpCOI
        'organizacion',         // → organization
    ],

    /**
     * Attribute Mapping (SimpleSAMLphp → Keycloak)
     * These mappings are applied BEFORE sending assertions to Keycloak
     * Keycloak will then apply its own attribute mappers
     */
    'attributeNameFormat' => 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic',

    /**
     * Attribute Release Policy
     * Allow all attributes defined in the authsources.php configuration
     */
    'attributes.NameFormat' => 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic',

    /**
     * Authentication Context
     * Controls the assurance level of authentication
     * Options: PasswordProtectedTransport, X509, Smartcard, etc.
     */
    'AuthnContextClassRef' => 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',

    /**
     * Redirect Bindings
     * Allow both POST and Redirect bindings for SAML messages
     */
    'redirect.sign' => true,
    'redirect.validate' => true,

    /**
     * Contact Information (Optional)
     * Production deployments should include technical and support contacts
     */
    'contacts' => [
        [
            'contactType' => 'technical',
            'emailAddress' => 'dive-v3-admin@example.mil',
            'givenName' => 'DIVE V3 Technical Team',
        ],
        [
            'contactType' => 'support',
            'emailAddress' => 'dive-v3-support@example.mil',
            'givenName' => 'DIVE V3 Support Team',
        ],
    ],

    /**
     * Organization Information (Optional)
     * Identifies the organization operating this SP
     */
    'OrganizationName' => [
        'en' => 'DIVE V3 Coalition Federation Hub',
        'es' => 'Centro de Federación de la Coalición DIVE V3',
    ],
    'OrganizationDisplayName' => [
        'en' => 'DIVE V3 - Distributed Information Vetting Environment',
        'es' => 'DIVE V3 - Entorno de Verificación de Información Distribuida',
    ],
    'OrganizationURL' => [
        'en' => 'http://localhost:3000',
        'es' => 'http://localhost:3000',
    ],
];



