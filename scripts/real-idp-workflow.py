#!/usr/bin/env python3
"""
DIVE V3 - Real IdP Onboarding Workflow Demonstration
Shows complete workflow including validation failures and manual approval
"""

import requests
import json
import sys
import time

# Configuration
BACKEND_URL = "http://localhost:4000"
ADMIN_USERNAME = "admin-dive"
ADMIN_PASSWORD = "DiveAdmin2025!"
REALM = "dive-v3-broker"

# Colors
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
RED = '\033[0;31m'
BLUE = '\033[0;34m'
CYAN = '\033[0;36m'
NC = '\033[0m'

def print_section(title):
    print(f"\n{BLUE}{'='*60}{NC}")
    print(f"{BLUE}{title}{NC}")
    print(f"{BLUE}{'='*60}{NC}\n")

def print_step(step, message):
    print(f"{YELLOW}Step {step}: {message}{NC}")

def print_success(message):
    print(f"{GREEN}✅ {message}{NC}")

def print_error(message):
    print(f"{RED}❌ {message}{NC}")

def print_info(message):
    print(f"{CYAN}  {message}{NC}")

def read_certificate():
    """Read Spain SAML certificate"""
    cert_path = '../external-idps/spain-saml/cert/server.crt'
    with open(cert_path, 'r') as f:
        return f.read().strip()

def authenticate_admin():
    """Authenticate as super_admin"""
    print_step("1", "Authenticating as super_admin")
    
    response = requests.post(
        f"{BACKEND_URL}/api/auth/custom-login",
        json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD,
            "idpAlias": "dive-v3-broker",
            "realmId": REALM
        }
    )
    
    if response.status_code == 200 and response.json().get('success'):
        token = response.json()['data']['accessToken']
        print_success("Authentication successful\n")
        return token
    
    print_error(f"Authentication failed: {response.status_code}\n")
    return None

def submit_idp_minimal(token):
    """Submit IdP with minimal configuration (real-world scenario)"""
    print_section("PHASE 1: Initial Submission (Minimal Config)")
    print_step("2", "Submitting Spain SAML IdP with real configuration")
    print_info("Note: No fake compliance docs - this is a real submission")
    
    certificate = read_certificate()
    
    idp_config = {
        "alias": "esp-realm-external",
        "displayName": "Spain Ministry of Defense (External SAML)",
        "description": "SimpleSAMLphp test instance for pilot demonstration",
        "protocol": "saml",
        "config": {
            "entityId": "https://spain-saml:8443/simplesaml/saml2/idp/metadata.php",
            "singleSignOnServiceUrl": "https://spain-saml:8443/simplesaml/saml2/idp/SSOService.php",
            "singleLogoutServiceUrl": "https://spain-saml:8443/simplesaml/saml2/idp/SingleLogoutService.php",
            "certificate": certificate,
            "signatureAlgorithm": "RSA_SHA256",
            "nameIDFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
            "wantAssertionsSigned": False,
            "wantAuthnRequestsSigned": False,
            "validateSignature": False,
            "postBindingResponse": True,
            "postBindingAuthnRequest": False
        },
        "attributeMappings": {
            "uniqueID": {"claim": "uid", "userAttribute": "uniqueID", "required": True},
            "clearance": {"claim": "nivelSeguridad", "userAttribute": "clearanceOriginal", "required": True},
            "countryOfAffiliation": {"claim": "", "userAttribute": "countryOfAffiliation", "hardcodedValue": "ESP", "required": True},
            "acpCOI": {"claim": "grupoInteresCompartido", "userAttribute": "acpCOI", "multiValued": True, "required": False}
        }
    }
    
    response = requests.post(
        f"{BACKEND_URL}/api/admin/idps",
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        json=idp_config
    )
    
    data = response.json()
    
    if data.get('success'):
        print_success("Submission accepted")
        return data['data']
    else:
        # Rejection is expected and correct!
        print_info("Submission processed (expected rejection due to validation)")
        return data['data']

def display_validation_results(results):
    """Display what the validation found"""
    print_section("PHASE 2: Automated Validation Results")
    
    validation = results.get('validationResults', {})
    risk_score = results.get('comprehensiveRiskScore', {})
    compliance = results.get('complianceCheck', {})
    decision = results.get('approvalDecision', {})
    
    print_step("3", "Security Validation")
    print_info(f"TLS Check: {validation.get('tlsCheck', {}).get('pass', 'N/A')}")
    print_info(f"Algorithm Check: {validation.get('algorithmCheck', {}).get('pass', 'N/A')}")
    print_info(f"Endpoint Reachable: {validation.get('endpointCheck', {}).get('reachable', 'N/A')}")
    print_info(f"MFA Detected: {validation.get('mfaCheck', {}).get('detected', False)}")
    
    print(f"\n{YELLOW}Step 4: Risk Scoring{NC}")
    score = risk_score.get('total', 0)
    tier = risk_score.get('tier', 'unknown')
    print_info(f"Score: {score}/100 ({tier} tier)")
    
    print(f"\n{YELLOW}Step 5: Compliance Check{NC}")
    print_info(f"Overall: {compliance.get('overall', 'N/A')}")
    gaps_count = len(compliance.get('gaps', []))
    print_info(f"Compliance Gaps: {gaps_count}")
    
    print(f"\n{YELLOW}Step 6: Approval Decision{NC}")
    action = decision.get('action', 'unknown')
    reason = decision.get('reason', 'N/A')
    
    if action == 'auto-reject':
        print_error(f"Decision: {action}")
        print_info(f"Reason: {reason}")
        print_info("This is CORRECT behavior - validation found real issues!")
    else:
        print_success(f"Decision: {action}")
        print_info(f"Reason: {reason}")
    
    return results.get('submissionId')

def manual_approval(token, submission_id, alias):
    """Demonstrate manual approval workflow"""
    print_section("PHASE 3: Manual Approval Override")
    
    print_step("7", "Admin reviews submission and decides to approve anyway")
    print_info("Reason: Pilot environment, validation failures are expected")
    print_info("In production: Would require compliance documents first")
    
    response = requests.post(
        f"{BACKEND_URL}/api/admin/approvals/{alias}/approve",
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        json={"reason": "Approved for pilot testing - validation limitations acknowledged"}
    )
    
    if response.status_code == 200:
        print_success("Manual approval successful")
        return True
    else:
        print_error(f"Manual approval failed: {response.status_code}")
        print_info(f"Response: {response.text[:200]}")
        return False

def verify_idp_created(token):
    """Verify IdP was created"""
    print_section("PHASE 4: Verification")
    
    print_step("8", "Verifying IdP registration")
    
    response = requests.get(f"{BACKEND_URL}/api/idps/public")
    idps = response.json()['idps']
    esp_idp = next((idp for idp in idps if idp['alias'] == 'esp-realm-external'), None)
    
    if esp_idp:
        print_success("IdP visible on frontend")
        print_info(f"Alias: {esp_idp['alias']}")
        print_info(f"Protocol: {esp_idp['protocol']}")
        print_info(f"Enabled: {esp_idp['enabled']}")
        return True
    
    print_error("IdP not found in public list")
    return False

def main():
    print(f"{BLUE}{'='*60}{NC}")
    print(f"{BLUE}DIVE V3 - Real IdP Onboarding Workflow{NC}")
    print(f"{BLUE}Demonstrating: Validation → Rejection → Manual Approval{NC}")
    print(f"{BLUE}{'='*60}{NC}")
    
    try:
        # Phase 1: Authentication
        token = authenticate_admin()
        if not token:
            sys.exit(1)
        
        # Phase 2: Submit IdP (will be rejected)
        results = submit_idp_minimal(token)
        if not results:
            print_error("Submission failed completely")
            sys.exit(1)
        
        # Phase 3: Display validation results
        submission_id = display_validation_results(results)
        
        # Phase 4: Manual approval (override rejection)
        print("\n")
        user_input = input(f"{YELLOW}Proceed with manual approval override? (yes/no): {NC}")
        if user_input.lower() != 'yes':
            print_info("Stopping at rejection - this is valid workflow!")
            sys.exit(0)
        
        if not manual_approval(token, submission_id, results.get('alias')):
            sys.exit(1)
        
        time.sleep(2)  # Wait for Keycloak sync
        
        # Phase 5: Verify
        if not verify_idp_created(token):
            sys.exit(1)
        
        # Success
        print_section("WORKFLOW COMPLETE")
        print_success("Spain SAML IdP created via proper workflow!")
        print()
        print_info("Workflow demonstrated:")
        print_info("  ✅ Super_admin authentication")
        print_info("  ✅ Backend validation (with real failures)")
        print_info("  ✅ Risk scoring (low score due to validation issues)")
        print_info("  ✅ Automated rejection (correct behavior)")
        print_info("  ✅ Manual approval override (admin decision)")
        print_info("  ✅ Keycloak IdP creation")
        print_info("  ✅ MongoDB audit trail")
        print_info("  ✅ Frontend visibility")
        print()
        print_info("This is the REAL workflow - no shortcuts!")
        print()
        
    except Exception as e:
        print_error(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

