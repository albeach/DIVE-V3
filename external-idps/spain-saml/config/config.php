<?php

/**
 * DIVE V3 - Spain SAML IdP Configuration
 * SimpleSAMLphp Configuration for Spanish Defense Ministry
 */

$config = [
    // Base configuration
    'baseurlpath' => 'http://localhost:9443/simplesaml/',
    'certdir' => 'cert/',
    'loggingdir' => 'log/',
    'datadir' => 'data/',
    'tempdir' => '/tmp/simplesaml',

    // Technical contact
    'technicalcontact_name' => 'Spanish Defense Ministry IT',
    'technicalcontact_email' => 'tic@mde.es',

    // Security
    'secretsalt' => 'spain-dive-v3-saml-secret-salt-change-in-production',
    'auth.adminpassword' => getenv('SIMPLESAMLPHP_ADMIN_PASSWORD') ?: 'admin123',
    'admin.protectindexpage' => true,
    'admin.protectmetadata' => false,

    // Timezone
    'timezone' => 'Europe/Madrid',

    // Session
    'session.duration' => 8 * 60 * 60, // 8 hours
    'session.datastore.timeout' => 4 * 60 * 60, // 4 hours
    'session.state.timeout' => 60 * 60, // 1 hour
    'session.cookie.name' => 'SpainSAMLSessionID',
    'session.cookie.lifetime' => 0,
    'session.cookie.path' => '/',
    'session.cookie.domain' => null,
    'session.cookie.secure' => false,  // HTTP on localhost (dev only)
    'session.cookie.samesite' => 'Lax',

    // Language
    'language.available' => ['es', 'en'],
    'language.default' => 'es',

    // Logging
    'logging.level' => SimpleSAML\Logger::INFO,
    'logging.handler' => 'syslog',

    // Metadata signing
    'metadata.sign.enable' => true,
    'metadata.sign.privatekey' => 'server.pem',
    'metadata.sign.certificate' => 'server.crt',

    // Store type
    'store.type' => 'phpsession',

    // Module configuration
    'module.enable' => [
        'exampleauth' => true,
        'core' => true,
        'admin' => true,
        'saml' => true,
    ],

    // Enable SAML 2.0 IdP functionality
    'enable.saml20-idp' => true,

    // Theme
    'theme.use' => 'default',
    'theme.header' => 'SimpleSAMLphp - Spanish Defense Ministry',

    // Metadata
    'metadata.sources' => [
        ['type' => 'flatfile'],
    ],
];

// Return the configuration array
return $config;
