<?php

/**
 * DIVE V3 - Spain SAML IdP Authentication Source Configuration
 * 
 * This file defines the test users for the Spanish Defense Ministry SAML IdP.
 * Users have Spanish military attributes that will be normalized to DIVE claims.
 */

$config = [
    // Administrative login for SimpleSAMLphp
    'admin' => [
        'core:AdminPassword',
    ],

    // Example authentication source - using static user database
    'example-userpass' => [
        'exampleauth:UserPass',

        // Spanish Defense Ministry Test Users
        // Format: 'username:password' => attributes array
        
        // Colonel María García - TOP SECRET clearance, OTAN-COSMIC COI
        'garcia.maria@mde.es:Classified123!' => [
            'uid' => ['garcia.maria@mde.es'],
            'eduPersonPrincipalName' => ['garcia.maria@mde.es'],
            'mail' => ['garcia.maria@mde.es'],
            'givenName' => ['María'],
            'sn' => ['García'],
            'cn' => ['María García'],
            'displayName' => ['COL María García'],
            
            // Spanish Military Attributes (will be mapped to DIVE attributes)
            'nivelSeguridad' => ['SECRETO'],  // Maps to TOP SECRET
            'paisAfiliacion' => ['ESP'],       // Maps to countryOfAffiliation: ESP
            'grupoInteresCompartido' => ['OTAN-COSMIC', 'ESP-EXCLUSIVO'], // Maps to acpCOI
            'organizacion' => ['Ministerio de Defensa'],
            'rango' => ['Coronel'],
            'unidad' => ['Estado Mayor de la Defensa'],
            
            // Standard SAML attributes
            'urn:oid:0.9.2342.19200300.100.1.3' => ['garcia.maria@mde.es'], // mail
            'urn:oid:2.5.4.3' => ['María García'], // CN
            'urn:oid:2.5.4.4' => ['García'],       // sn
            'urn:oid:2.5.4.42' => ['María'],       // givenName
        ],

        // Captain Juan Rodríguez - SECRET clearance, NATO COI
        'rodriguez.juan@mde.es:Defense456!' => [
            'uid' => ['rodriguez.juan@mde.es'],
            'eduPersonPrincipalName' => ['rodriguez.juan@mde.es'],
            'mail' => ['rodriguez.juan@mde.es'],
            'givenName' => ['Juan'],
            'sn' => ['Rodríguez'],
            'cn' => ['Juan Rodríguez'],
            'displayName' => ['CPT Juan Rodríguez'],
            
            'nivelSeguridad' => ['CONFIDENCIAL-DEFENSA'],  // Maps to SECRET
            'paisAfiliacion' => ['ESP'],
            'grupoInteresCompartido' => ['NATO-COSMIC'],
            'organizacion' => ['Ejército de Tierra'],
            'rango' => ['Capitán'],
            'unidad' => ['Brigada Galicia VII'],
            
            'urn:oid:0.9.2342.19200300.100.1.3' => ['rodriguez.juan@mde.es'],
            'urn:oid:2.5.4.3' => ['Juan Rodríguez'],
            'urn:oid:2.5.4.4' => ['Rodríguez'],
            'urn:oid:2.5.4.42' => ['Juan'],
        ],

        // Lieutenant Ana López - CONFIDENTIAL clearance, Spain-only access
        'lopez.ana@mde.es:Military789!' => [
            'uid' => ['lopez.ana@mde.es'],
            'eduPersonPrincipalName' => ['lopez.ana@mde.es'],
            'mail' => ['lopez.ana@mde.es'],
            'givenName' => ['Ana'],
            'sn' => ['López'],
            'cn' => ['Ana López'],
            'displayName' => ['LT Ana López'],
            
            'nivelSeguridad' => ['CONFIDENCIAL'],  // Maps to CONFIDENTIAL
            'paisAfiliacion' => ['ESP'],
            'grupoInteresCompartido' => ['ESP-EXCLUSIVO'],
            'organizacion' => ['Armada Española'],
            'rango' => ['Teniente'],
            'unidad' => ['Fuerza de Acción Marítima'],
            
            'urn:oid:0.9.2342.19200300.100.1.3' => ['lopez.ana@mde.es'],
            'urn:oid:2.5.4.3' => ['Ana López'],
            'urn:oid:2.5.4.4' => ['López'],
            'urn:oid:2.5.4.42' => ['Ana'],
        ],

        // Sergeant Carlos Fernández - UNCLASSIFIED, basic NATO access
        'fernandez.carlos@mde.es:Public000!' => [
            'uid' => ['fernandez.carlos@mde.es'],
            'eduPersonPrincipalName' => ['fernandez.carlos@mde.es'],
            'mail' => ['fernandez.carlos@mde.es'],
            'givenName' => ['Carlos'],
            'sn' => ['Fernández'],
            'cn' => ['Carlos Fernández'],
            'displayName' => ['SGT Carlos Fernández'],
            
            'nivelSeguridad' => ['NO-CLASIFICADO'],  // Maps to UNCLASSIFIED
            'paisAfiliacion' => ['ESP'],
            'grupoInteresCompartido' => ['NATO-UNRESTRICTED'],
            'organizacion' => ['Ejército del Aire'],
            'rango' => ['Sargento'],
            'unidad' => ['Base Aérea de Torrejón'],
            
            'urn:oid:0.9.2342.19200300.100.1.3' => ['fernandez.carlos@mde.es'],
            'urn:oid:2.5.4.3' => ['Carlos Fernández'],
            'urn:oid:2.5.4.4' => ['Fernández'],
            'urn:oid:2.5.4.42' => ['Carlos'],
        ],
    ],
];


