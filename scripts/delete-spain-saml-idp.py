#!/usr/bin/env python3
"""
DIVE V3 - Delete Spain SAML IdP from Keycloak
Cleanup script to prepare for proper workflow recreation
"""

import requests
import sys

# Configuration
KEYCLOAK_URL = "http://localhost:8081"
REALM = "dive-v3-broker"
IDP_ALIAS = "esp-realm-external"

# Colors
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
RED = '\033[0;31m'
BLUE = '\033[0;34m'
NC = '\033[0m'

def print_step(message):
    print(f"{YELLOW}{message}...{NC}")

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
        'username': 'admin',
        'password': 'admin',
        'grant_type': 'password',
        'client_id': 'admin-cli'
    }
    
    response = requests.post(token_url, data=data)
    response.raise_for_status()
    
    return response.json()['access_token']

def delete_idp(token):
    """Delete Spain SAML IdP from Keycloak"""
    url = f"{KEYCLOAK_URL}/admin/realms/{REALM}/identity-provider/instances/{IDP_ALIAS}"
    
    headers = {
        'Authorization': f'Bearer {token}'
    }
    
    response = requests.delete(url, headers=headers)
    
    if response.status_code == 404:
        print_info(f"  IdP '{IDP_ALIAS}' does not exist (already deleted)")
        return False
    
    response.raise_for_status()
    return True

def main():
    print_info("========================================")
    print_info("DIVE V3 - Delete Spain SAML IdP")
    print_info("========================================\n")
    
    try:
        # Step 1: Get admin token
        print_step("Authenticating with Keycloak")
        token = get_admin_token()
        print_success("Authentication successful")
        print()
        
        # Step 2: Delete IdP
        print_step("Deleting Spain SAML IdP")
        deleted = delete_idp(token)
        
        if deleted:
            print_success(f"IdP '{IDP_ALIAS}' deleted successfully")
        else:
            print_info("No action needed")
        print()
        
        # Step 3: Verify deletion
        print_step("Verifying deletion")
        verify_url = f"{KEYCLOAK_URL}/admin/realms/{REALM}/identity-provider/instances"
        headers = {'Authorization': f'Bearer {token}'}
        response = requests.get(verify_url, headers=headers)
        idps = response.json()
        
        esp_idp = next((idp for idp in idps if idp['alias'] == IDP_ALIAS), None)
        
        if esp_idp:
            print_error(f"IdP '{IDP_ALIAS}' still exists!")
            sys.exit(1)
        else:
            print_success(f"Verified: '{IDP_ALIAS}' removed from Keycloak")
        
        print()
        print_info("========================================")
        print_info("Summary")
        print_info("========================================\n")
        print_success("Spain SAML IdP deleted successfully!")
        print()
        print_info("Next: Recreate via proper backend workflow")
        print()
        
    except Exception as e:
        print_error(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()


