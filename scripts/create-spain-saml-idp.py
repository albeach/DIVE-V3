#!/usr/bin/env python3
"""
DIVE V3 - Create Spain SAML IdP via Keycloak Admin API
Direct API approach - bypasses Terraform complexity
"""

import requests
import json
import sys

# Configuration
KEYCLOAK_URL = "http://localhost:8081"
REALM = "dive-v3-broker"
ADMIN_USER = "admin"
ADMIN_PASSWORD = "admin"

# Colors for output
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
RED = '\033[0;31m'
BLUE = '\033[0;34m'
NC = '\033[0m'  # No Color

def print_step(step, message):
    print(f"{YELLOW}Step {step}: {message}...{NC}")

def print_success(message):
    print(f"{GREEN}✅ {message}{NC}")

def print_error(message):
    print(f"{RED}❌ {message}{NC}")

def print_info(message):
    print(f"{BLUE}{message}{NC}")

def get_admin_token():
    """Get admin access token from Keycloak"""
    token_url = f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token"
    
    data = {
        'username': ADMIN_USER,
        'password': ADMIN_PASSWORD,
        'grant_type': 'password',
        'client_id': 'admin-cli'
    }
    
    response = requests.post(token_url, data=data)
    response.raise_for_status()
    
    return response.json()['access_token']

def read_certificate():
    """Read Spain SAML certificate"""
    cert_path = '../external-idps/spain-saml/cert/server.crt'
    
    with open(cert_path, 'r') as f:
        cert = f.read()
        # Remove headers and newlines for Keycloak
        cert = cert.replace('-----BEGIN CERTIFICATE-----', '')
        cert = cert.replace('-----END CERTIFICATE-----', '')
        cert = cert.replace('\n', '')
        return cert.strip()

def create_spain_saml_idp(token):
    """Create Spain SAML IdP in Keycloak"""
    url = f"{KEYCLOAK_URL}/admin/realms/{REALM}/identity-provider/instances"
    
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    certificate = read_certificate()
    
    idp_config = {
        "alias": "esp-realm-external",
        "displayName": "Spain Ministry of Defense (External SAML)",
        "providerId": "saml",
        "enabled": True,
        "updateProfileFirstLoginMode": "on",
        "trustEmail": True,
        "storeToken": False,
        "addReadTokenRoleOnCreate": False,
        "authenticateByDefault": False,
        "linkOnly": False,
        "firstBrokerLoginFlowAlias": "first broker login",
        "config": {
            "entityId": "https://spain-saml:8443/simplesaml/saml2/idp/metadata.php",
            "singleSignOnServiceUrl": "https://spain-saml:8443/simplesaml/saml2/idp/SSOService.php",
            "singleLogoutServiceUrl": "https://spain-saml:8443/simplesaml/saml2/idp/SingleLogoutService.php",
            "signingCertificate": certificate,
            "signatureAlgorithm": "RSA_SHA256",
            "nameIDPolicyFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
            "principalType": "ATTRIBUTE",
            "principalAttribute": "uid",
            "wantAssertionsSigned": "false",
            "wantAuthnRequestsSigned": "false",
            "validateSignature": "false",
            "postBindingResponse": "true",
            "postBindingAuthnRequest": "false",
            "postBindingLogout": "true",
            "syncMode": "FORCE"
        }
    }
    
    response = requests.post(url, headers=headers, json=idp_config)
    
    if response.status_code == 409:
        print_info("  IdP already exists, skipping creation")
        return False  # Already exists
    elif response.status_code != 201:
        print_error(f"  Failed to create IdP: {response.status_code}")
        print_error(f"  Response: {response.text}")
        response.raise_for_status()
    
    return True

def create_attribute_mappers(token):
    """Create attribute mappers for Spain SAML IdP"""
    base_url = f"{KEYCLOAK_URL}/admin/realms/{REALM}/identity-provider/instances/esp-realm-external/mappers"
    
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    mappers = [
        {
            "name": "uid-to-uniqueID",
            "identityProviderAlias": "esp-realm-external",
            "identityProviderMapper": "saml-user-attribute-idp-mapper",
            "config": {
                "syncMode": "INHERIT",
                "attribute.name": "uid",
                "user.attribute": "uniqueID"
            }
        },
        {
            "name": "nivelSeguridad-to-clearanceOriginal",
            "identityProviderAlias": "esp-realm-external",
            "identityProviderMapper": "saml-user-attribute-idp-mapper",
            "config": {
                "syncMode": "INHERIT",
                "attribute.name": "nivelSeguridad",
                "user.attribute": "clearanceOriginal"
            }
        },
        {
            "name": "grupoInteresCompartido-to-acpCOI",
            "identityProviderAlias": "esp-realm-external",
            "identityProviderMapper": "saml-user-attribute-idp-mapper",
            "config": {
                "syncMode": "INHERIT",
                "attribute.name": "grupoInteresCompartido",
                "user.attribute": "acpCOI"
            }
        },
        {
            "name": "hardcoded-country-ESP",
            "identityProviderAlias": "esp-realm-external",
            "identityProviderMapper": "hardcoded-attribute-idp-mapper",
            "config": {
                "syncMode": "INHERIT",
                "attribute": "countryOfAffiliation",
                "attribute.value": "ESP"
            }
        }
    ]
    
    for mapper in mappers:
        response = requests.post(base_url, headers=headers, json=mapper)
        response.raise_for_status()
    
    return True

def main():
    print_info("========================================")
    print_info("DIVE V3 - Spain SAML IdP Creation")
    print_info("========================================\n")
    
    try:
        # Step 1: Get admin token
        print_step(1, "Authenticating with Keycloak")
        token = get_admin_token()
        print_success("Authentication successful")
        print()
        
        # Step 2: Read certificate
        print_step(2, "Reading Spain SAML certificate")
        certificate = read_certificate()
        print_success(f"Certificate loaded ({len(certificate)} chars)")
        print()
        
        # Step 3: Create IdP
        print_step(3, "Creating Spain SAML IdP")
        create_spain_saml_idp(token)
        print_success("Spain SAML IdP created")
        print()
        
        # Step 4: Create attribute mappers
        print_step(4, "Creating attribute mappers")
        create_attribute_mappers(token)
        print_success("Attribute mappers created:")
        print("  - uid → uniqueID")
        print("  - nivelSeguridad → clearanceOriginal") 
        print("  - grupoInteresCompartido → acpCOI")
        print("  - hardcoded countryOfAffiliation = ESP")
        print()
        
        # Step 5: Verification
        print_step(5, "Verifying registration")
        verify_url = f"{KEYCLOAK_URL}/admin/realms/{REALM}/identity-provider/instances"
        headers = {'Authorization': f'Bearer {token}'}
        response = requests.get(verify_url, headers=headers)
        idps = response.json()
        
        esp_idp = next((idp for idp in idps if idp['alias'] == 'esp-realm-external'), None)
        
        if esp_idp:
            print_success("Spain SAML IdP verified")
            print(f"  Alias: {esp_idp['alias']}")
            print(f"  Display Name: {esp_idp['displayName']}")
            print(f"  Enabled: {esp_idp['enabled']}")
        else:
            print_error("IdP not found after creation")
            sys.exit(1)
        
        print()
        print_info("========================================")
        print_info("Summary")
        print_info("========================================\n")
        print_success("Spain SAML IdP successfully created!\n")
        print("Next Steps:")
        print("1. Navigate to http://localhost:3000/")
        print("2. Look for 'Spain Ministry of Defense (External SAML)' 🇪🇸")
        print("3. Test with credentials:")
        print("   - Username: juan.garcia")
        print("   - Password: EspanaDefensa2025!")
        print()
        
    except requests.exceptions.HTTPError as e:
        print_error(f"HTTP Error: {e}")
        if e.response:
            print(f"Response: {e.response.text}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

