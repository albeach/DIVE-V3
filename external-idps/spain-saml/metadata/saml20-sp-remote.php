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
    'certData' => 'MIICqzCCAZMCBgGaIQWT1zANBgkqhkiG9w0BAQsFADAZMRcwFQYDVQQDDA5kaXZlLXYzLWJyb2tlcjAeFw0yNTEwMjYxNDU1MDVaFw0zNTEwMjYxNDU2NDVaMBkxFzAVBgNVBAMMDmRpdmUtdjMtYnJva2VyMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA29Rqy22ay34a4TvCn8zXM9bOVVdHruhn4p97WmqnX8akyA6xQWsOmlwOs4lx9dPXebEjYxkZ9/KjsfV9HbYAB9hCXtr1h9OsYK/ZsQfmQ5Ej5KZEQq/xBIOlmnVnLQ+FGuu8SWtae5cfvTfE9HAJBF4uSZucODSJN42si+/OIRONVY6UK1nm8+LyRrCQKPnrqsRXNFwFPrYLj/iv1UjxdGbU7Nsjz7hF+6NFkX8lzWkDDDyjsA0/IE+DtANR8+gCPJ3vXZSAO+C5PmyE1W8lp/ppueKpP02t5XNj6La7Uat4TrPALTvwwPd/SLZViN3cIcAhqUgFfUoCYDmrH3WbWwIDAQABMA0GCSqGSIb3DQEBCwUAA4IBAQBbK1bwGjhKQyDRzF4BFlPo2OqAgmRFYo7UrMZnj5oP/1r7qkCnWLMpA3MtfrwFT+dHLn90M7Dcu8Gl9DZl02qVhUYplFofxtKkPnvMF0ecfjWj0Fk7xuU5Dlxka5O9/fEQC1icnLQxvtZfdW2bq210F2oRKW5ZZ+BiD0TeARjf8bOOxLP2/TdWoEMXbHB/810xnt+1pS8cY3NuD3Rek5cH4yyBvnB9U+5k2NNDEM3pUTQkB1LkhCYz9a1Ta8fdpgbs0Rkj1wGg7QZ7yheK8VAaBgJpiHJ6zpkuXy4VBE9Aei8Yy/y8KDZyOjhJc367M4MDdmKy9Pg4S2nms6HNuOOr',

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



