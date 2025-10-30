#!/usr/bin/env python3
"""
Fix Spain SAML IdP SSO URL to use localhost instead of spain-saml hostname
This allows browser-based SAML federation to work
"""

import requests
import json

# Configuration
BACKEND_URL = "http://localhost:4000"
KEYCLOAK_URL = "http://localhost:8081"
REALM = "dive-v3-broker"

def get_admin_token():
    """Get Keycloak admin token"""
    response = requests.post(
        f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token",
        data={
            'client_id': 'admin-cli',
            'username': 'admin',
            'password': 'admin',
            'grant_type': 'password'
        }
    )
    return response.json()['access_token']

def fix_spain_saml_sso_url(token):
    """Update Spain SAML IdP to use localhost URL"""
    
    # Get current IdP config
    response = requests.get(
        f"{KEYCLOAK_URL}/admin/realms/{REALM}/identity-provider/instances/esp-realm-external",
        headers={'Authorization': f'Bearer {token}'}
    )
    
    if response.status_code != 200:
        print(f"❌ Failed to get IdP: {response.status_code}")
        return False
    
    idp_config = response.json()
    
    print(f"Current SSO URL: {idp_config['config'].get('singleSignOnServiceUrl', 'N/A')}")
    
    # Update SSO URL to use localhost
    idp_config['config']['singleSignOnServiceUrl'] = 'http://localhost:9443/simplesaml/saml2/idp/SSOService.php'
    idp_config['config']['singleLogoutServiceUrl'] = 'http://localhost:9443/simplesaml/saml2/idp/SingleLogoutService.php'
    
    # Update IdP
    response = requests.put(
        f"{KEYCLOAK_URL}/admin/realms/{REALM}/identity-provider/instances/esp-realm-external",
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        },
        json=idp_config
    )
    
    if response.status_code in [200, 204]:
        print("✅ Updated Spain SAML IdP SSO URL to localhost:9443")
        return True
    else:
        print(f"❌ Failed to update: {response.status_code} - {response.text}")
        return False

if __name__ == "__main__":
    print("🔧 Fixing Spain SAML IdP SSO URL...")
    token = get_admin_token()
    fix_spain_saml_sso_url(token)
    print("\n✅ Spain SAML IdP now configured for browser-accessible SAML federation")

