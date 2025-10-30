<?php

/**
 * DIVE V3 - Spain SAML IdP Authentication Sources
 * 
 * Test users for Spanish Ministry of Defense with:
 * - Spanish clearance levels (SECRETO, CONFIDENCIAL, NO_CLASIFICADO)
 * - Spanish COI tags (NATO-COSMIC, OTAN-ESP)
 * - Proper attribute mapping for DIVE federation
 */

$config = [
    // Admin authentication
    'admin' => [
        'core:AdminPassword',
    ],

    // Spanish military test users
    'example-userpass' => [
        'exampleauth:UserPass',
        
        // User 1: Spanish SECRET clearance with NATO-COSMIC access
        'juan.garcia:EspanaDefensa2025!' => [
            'uid' => ['juan.garcia'],
            'eduPersonPrincipalName' => ['juan.garcia@defensa.gob.es'],
            'email' => ['juan.garcia@defensa.gob.es'],
            'displayName' => ['Juan García López'],
            'givenName' => ['Juan'],
            'sn' => ['García López'],
            
            // Spanish military attributes
            'nivelSeguridad' => ['SECRETO'],  // Spanish for SECRET
            'paisAfiliacion' => ['ESP'],       // Spain
            'grupoInteresCompartido' => ['NATO-COSMIC', 'OTAN-ESP'],  // COI tags
            'organizacion' => ['Ministerio de Defensa de España'],
            'departamento' => ['Dirección General de Armamento y Material'],
        ],
        
        // User 2: Spanish CONFIDENTIAL clearance with OTAN-ESP only
        'maria.rodriguez:EspanaDefensa2025!' => [
            'uid' => ['maria.rodriguez'],
            'eduPersonPrincipalName' => ['maria.rodriguez@defensa.gob.es'],
            'email' => ['maria.rodriguez@defensa.gob.es'],
            'displayName' => ['María Rodríguez Martínez'],
            'givenName' => ['María'],
            'sn' => ['Rodríguez Martínez'],
            
            // Spanish military attributes
            'nivelSeguridad' => ['CONFIDENCIAL'],  // Spanish for CONFIDENTIAL
            'paisAfiliacion' => ['ESP'],
            'grupoInteresCompartido' => ['OTAN-ESP'],  // Spain-NATO only
            'organizacion' => ['Ministerio de Defensa de España'],
            'departamento' => ['Estado Mayor de la Defensa'],
        ],
        
        // User 3: Spanish UNCLASSIFIED (public research)
        'carlos.fernandez:EspanaDefensa2025!' => [
            'uid' => ['carlos.fernandez'],
            'eduPersonPrincipalName' => ['carlos.fernandez@defensa.gob.es'],
            'email' => ['carlos.fernandez@defensa.gob.es'],
            'displayName' => ['Carlos Fernández Pérez'],
            'givenName' => ['Carlos'],
            'sn' => ['Fernández Pérez'],
            
            // Spanish military attributes
            'nivelSeguridad' => ['NO_CLASIFICADO'],  // Spanish for UNCLASSIFIED
            'paisAfiliacion' => ['ESP'],
            'grupoInteresCompartido' => [],  // No COI tags
            'organizacion' => ['Instituto Nacional de Técnica Aeroespacial'],
            'departamento' => ['Investigación y Desarrollo'],
        ],
        
        // User 4: Spanish TOP_SECRET clearance (for testing highest level)
        'elena.sanchez:EspanaDefensa2025!' => [
            'uid' => ['elena.sanchez'],
            'eduPersonPrincipalName' => ['elena.sanchez@defensa.gob.es'],
            'email' => ['elena.sanchez@defensa.gob.es'],
            'displayName' => ['Elena Sánchez Gómez'],
            'givenName' => ['Elena'],
            'sn' => ['Sánchez Gómez'],
            
            // Spanish military attributes
            'nivelSeguridad' => ['ALTO_SECRETO'],  // Spanish for TOP_SECRET
            'paisAfiliacion' => ['ESP'],
            'grupoInteresCompartido' => ['NATO-COSMIC', 'OTAN-ESP', 'FVEY-OBSERVER'],
            'organizacion' => ['Centro Nacional de Inteligencia'],
            'departamento' => ['Análisis Estratégico'],
        ],
        
        // Legacy test user (for backwards compatibility)
        'user1:user1pass' => [
            'uid' => ['user1'],
            'eduPersonPrincipalName' => ['user1@spain.mil'],
            'email' => ['user1@spain.mil'],
            'displayName' => ['Test User 1'],
            'givenName' => ['Test'],
            'sn' => ['User'],
            
            // Default SECRET clearance for testing
            'nivelSeguridad' => ['SECRETO'],
            'paisAfiliacion' => ['ESP'],
            'grupoInteresCompartido' => ['NATO-COSMIC', 'OTAN-ESP'],
            'organizacion' => ['Test Organization'],
            'departamento' => ['Test Department'],
        ],
    ],
];


