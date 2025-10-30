#!/usr/bin/env python3
"""
Extract users from Terraform realm files and populate their attributes in Keycloak
Workaround for Terraform Keycloak Provider v5.5.0 bug with Keycloak 26.4.2
"""

import subprocess
import json
import re
import sys

# Realm configurations
REALMS = {
    'dive-v3-usa': 'USA',
    'dive-v3-esp': 'ESP',
    'dive-v3-fra': 'FRA',
    'dive-v3-gbr': 'GBR',
    'dive-v3-deu': 'DEU',
    'dive-v3-ita': 'ITA',
    'dive-v3-nld': 'NLD',
    'dive-v3-pol': 'POL',
    'dive-v3-can': 'CAN',
    'dive-v3-industry': 'INDUSTRY'
}

def get_admin_token():
    """Get Keycloak admin token"""
    cmd = [
        'docker', 'exec', 'dive-v3-keycloak',
        'curl', '-s', '-X', 'POST',
        'http://localhost:8080/realms/master/protocol/openid-connect/token',
        '-d', 'client_id=admin-cli',
        '-d', 'username=admin',
        '-d', 'password=admin',
        '-d', 'grant_type=password'
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Failed to get admin token: {result.stderr}")
        return None
    
    try:
        data = json.loads(result.stdout)
        return data.get('access_token')
    except:
        print(f"❌ Failed to parse token response")
        return None

def get_users_from_realm(token, realm_name):
    """Get all users from a Keycloak realm"""
    cmd = [
        'docker', 'exec', 'dive-v3-keycloak',
        'curl', '-s', '-X', 'GET',
        f'http://localhost:8080/admin/realms/{realm_name}/users',
        '-H', f'Authorization: Bearer {token}'
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return []
    
    try:
        return json.loads(result.stdout)
    except:
        return []

def update_user_attributes(token, realm_name, user_id, username, clearance, clearance_orig, country, coi_list, unique_id):
    """Update user attributes via Keycloak REST API"""
    
    # Get current user data
    get_cmd = [
        'docker', 'exec', 'dive-v3-keycloak',
        'curl', '-s', '-X', 'GET',
        f'http://localhost:8080/admin/realms/{realm_name}/users/{user_id}',
        '-H', f'Authorization: Bearer {token}'
    ]
    
    result = subprocess.run(get_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return False
    
    try:
        user_data = json.loads(result.stdout)
    except:
        return False
    
    # Update attributes
    user_data['attributes'] = {
        'uniqueID': [unique_id],
        'clearance': [clearance],
        'clearanceOriginal': [clearance_orig],
        'countryOfAffiliation': [country]
    }
    
    if coi_list:
        user_data['attributes']['acpCOI'] = coi_list
    
    # PUT updated user
    user_json = json.dumps(user_data)
    
    put_cmd = [
        'docker', 'exec', 'dive-v3-keycloak',
        'curl', '-s', '-w', '\\n%{http_code}', '-X', 'PUT',
        f'http://localhost:8080/admin/realms/{realm_name}/users/{user_id}',
        '-H', f'Authorization: Bearer {token}',
        '-H', 'Content-Type: application/json',
        '-d', user_json
    ]
    
    result = subprocess.run(put_cmd, capture_output=True, text=True)
    lines = result.stdout.strip().split('\n')
    http_code = lines[-1] if lines else '000'
    
    return http_code in ['200', '204']

# User definitions (from Terraform realm files)
USER_DEFINITIONS = {
    'dive-v3-usa': [
        ('bob.contractor', 'UNCLASSIFIED', 'USA', [], '550e8400-e29b-41d4-a716-446655440001'),
        ('jane.smith', 'CONFIDENTIAL', 'USA', ['NATO-COSMIC'], '550e8400-e29b-41d4-a716-446655440003'),
        ('john.doe', 'SECRET', 'USA', ['FVEY'], '550e8400-e29b-41d4-a716-446655440002'),
        ('alice.general', 'TOP_SECRET', 'USA', ['NATO-COSMIC', 'FVEY', 'CAN-US'], '550e8400-e29b-41d4-a716-446655440004'),
    ],
    'dive-v3-esp': [
        ('juan.contractor', 'NO CLASIFICADO', 'ESP', [], '550e8400-e29b-41d4-a716-446655440011'),
        ('maria.lopez', 'CONFIDENCIAL', 'ESP', ['NATO-COSMIC'], '550e8400-e29b-41d4-a716-446655440012'),
        ('carlos.garcia', 'SECRETO', 'ESP', ['NATO-COSMIC'], '550e8400-e29b-41d4-a716-446655440013'),
        ('isabel.general', 'ALTO SECRETO', 'ESP', ['NATO-COSMIC', 'FVEY'], '550e8400-e29b-41d4-a716-446655440014'),
    ],
    'dive-v3-fra': [
        ('luc.contractor', 'NON PROTEGE', 'FRA', [], '660f9511-f39c-52e5-b827-557766551111'),
        ('marie.dupont', 'CONFIDENTIEL DEFENSE', 'FRA', ['NATO-COSMIC'], '660f9511-f39c-52e5-b827-557766551112'),
        ('pierre.dubois', 'SECRET DEFENSE', 'FRA', ['NATO-COSMIC', 'FVEY'], '660f9511-f39c-52e5-b827-557766551113'),
        ('sophie.general', 'TRES SECRET DEFENSE', 'FRA', ['NATO-COSMIC', 'FVEY'], '660f9511-f39c-52e5-b827-557766551114'),
    ],
    'dive-v3-gbr': [
        ('oliver.contractor', 'OFFICIAL', 'GBR', [], '770fa622-g40d-63f6-c938-668877662222'),
        ('emma.jones', 'CONFIDENTIAL', 'GBR', ['FVEY'], '770fa622-g40d-63f6-c938-668877662223'),
        ('james.smith', 'SECRET', 'GBR', ['NATO-COSMIC', 'FVEY'], '770fa622-g40d-63f6-c938-668877662224'),
        ('sophia.general', 'TOP SECRET', 'GBR', ['NATO-COSMIC', 'FVEY', 'CAN-US'], '770fa622-g40d-63f6-c938-668877662225'),
    ],
    'dive-v3-deu': [
        ('klaus.contractor', 'OFFEN', 'DEU', [], '880fb733-h51e-74g7-d049-779988773333'),
        ('anna.wagner', 'VS-VERTRAULICH', 'DEU', ['NATO-COSMIC'], '880fb733-h51e-74g7-d049-779988773334'),
        ('hans.mueller', 'GEHEIM', 'DEU', ['NATO-COSMIC'], '880fb733-h51e-74g7-d049-779988773335'),
        ('lisa.general', 'STRENG GEHEIM', 'DEU', ['NATO-COSMIC', 'FVEY'], '880fb733-h51e-74g7-d049-779988773336'),
    ],
    'dive-v3-ita': [
        ('giuseppe.contractor', 'NON CLASSIFICATO', 'ITA', [], '990fc844-i62f-85h8-e15a-88aa99884444'),
        ('francesca.ferrari', 'RISERVATO', 'ITA', ['NATO-COSMIC'], '990fc844-i62f-85h8-e15a-88aa99884445'),
        ('marco.rossi', 'SEGRETO', 'ITA', ['NATO-COSMIC'], '990fc844-i62f-85h8-e15a-88aa99884446'),
        ('elena.generale', 'SEGRETISSIMO', 'ITA', ['NATO-COSMIC', 'FVEY'], '990fc844-i62f-85h8-e15a-88aa99884447'),
    ],
    'dive-v3-nld': [
        ('jan.contractor', 'NIET GERUBRICEERD', 'NLD', [], 'aa0fd955-j73g-96i9-f26b-99bb00995555'),
        ('sophie.jansen', 'VERTROUWELIJK', 'NLD', ['NATO-COSMIC'], 'aa0fd955-j73g-96i9-f26b-99bb00995556'),
        ('pieter.devries', 'GEHEIM', 'NLD', ['NATO-COSMIC'], 'aa0fd955-j73g-96i9-f26b-99bb00995557'),
        ('emma.general', 'ZEER GEHEIM', 'NLD', ['NATO-COSMIC', 'FVEY'], 'aa0fd955-j73g-96i9-f26b-99bb00995558'),
    ],
    'dive-v3-pol': [
        ('adam.contractor', 'JAWNY', 'POL', [], 'bb0fea66-k84h-a7j0-g37c-aaccbb006666'),
        ('anna.wisniewska', 'POUFNE', 'POL', ['NATO-COSMIC'], 'bb0fea66-k84h-a7j0-g37c-aaccbb006667'),
        ('jan.kowalski', 'TAJNE', 'POL', ['NATO-COSMIC'], 'bb0fea66-k84h-a7j0-g37c-aaccbb006668'),
        ('maria.general', 'SCISLE TAJNE', 'POL', ['NATO-COSMIC', 'FVEY'], 'bb0fea66-k84h-a7j0-g37c-aaccbb006669'),
    ],
    'dive-v3-can': [
        ('robert.contractor', 'UNCLASSIFIED', 'CAN', [], 'cc0feb77-l95i-b8k1-h48d-bbddcc117777'),
        ('emily.tremblay', 'PROTECTED B', 'CAN', ['FVEY', 'CAN-US'], 'cc0feb77-l95i-b8k1-h48d-bbddcc117778'),
        ('john.macdonald', 'SECRET', 'CAN', ['NATO-COSMIC', 'FVEY', 'CAN-US'], 'cc0feb77-l95i-b8k1-h48d-bbddcc117779'),
        ('sarah.general', 'TOP SECRET', 'CAN', ['NATO-COSMIC', 'FVEY', 'CAN-US'], 'cc0feb77-l95i-b8k1-h48d-bbddcc117780'),
    ],
    'dive-v3-industry': [
        ('bob.contractor', 'PUBLIC', 'INDUSTRY', [], 'dd0fec88-m06j-c9l2-i59e-cceedd228888'),
        ('sarah.engineer', 'PROPRIETARY', 'INDUSTRY', [], 'dd0fec88-m06j-c9l2-i59e-cceedd228889'),
        ('mike.contractor', 'TRADE SECRET', 'INDUSTRY', [], 'dd0fec88-m06j-c9l2-i59e-cceedd228890'),
        ('jennifer.executive', 'HIGHLY SENSITIVE', 'INDUSTRY', [], 'dd0fec88-m06j-c9l2-i59e-cceedd228891'),
    ]
}

def main():
    dry_run = '--dry-run' in sys.argv
    
    if dry_run:
        print("\033[1;33m⚠️  DRY RUN MODE - No changes will be made\033[0m\n")
    
    print("\033[0;34m============================================\033[0m")
    print("\033[0;34mPopulate User Attributes Across All Realms\033[0m")
    print("\033[0;34m============================================\033[0m\n")
    
    # Get admin token
    print("Authenticating to Keycloak...")
    token = get_admin_token()
    if not token:
        print("\033[0;31m❌ Failed to authenticate\033[0m")
        return 1
    
    print("\033[0;32m✅ Authenticated successfully\033[0m\n")
    
    total_users = 0
    users_updated = 0
    users_failed = 0
    
    # Process each realm
    for realm_name, country_code in REALMS.items():
        print(f"\033[0;34m{'='*50}\033[0m")
        print(f"\033[0;34m{realm_name.upper()} ({country_code})\033[0m")
        print(f"\033[0;34m{'='*50}\033[0m")
        
        if realm_name not in USER_DEFINITIONS:
            print(f"\033[1;33m  ⚠️  No user definitions found for {realm_name}\033[0m\n")
            continue
        
        # Get existing users from Keycloak
        existing_users = get_users_from_realm(token, realm_name)
        user_map = {u['username']: u['id'] for u in existing_users}
        
        # Update each user
        for username, clearance, country, coi_list, unique_id in USER_DEFINITIONS[realm_name]:
            total_users += 1
            
            if username not in user_map:
                print(f"\033[0;31m  ❌ User not found: {username}\033[0m")
                users_failed += 1
                continue
            
            user_id = user_map[username]
            
            if dry_run:
                print(f"\033[1;33m  ℹ️  Would update: {username} → clearance={clearance}\033[0m")
                continue
            
            print(f"  Updating: {username} → {clearance}...")
            
            success = update_user_attributes(
                token, realm_name, user_id, username,
                clearance, clearance, country, coi_list, unique_id
            )
            
            if success:
                print(f"\033[0;32m  ✅ Updated: {username}\033[0m")
                users_updated += 1
            else:
                print(f"\033[0;31m  ❌ Failed: {username}\033[0m")
                users_failed += 1
        
        print("")
    
    # Summary
    print("\033[0;34m============================================\033[0m")
    print("\033[0;34mSummary\033[0m")
    print("\033[0;34m============================================\033[0m\n")
    print(f"Total Users Processed: {total_users}")
    print(f"Users Updated: {users_updated}")
    print(f"Users Failed: {users_failed}\n")
    
    if dry_run:
        print("\033[1;33mℹ️  DRY RUN - No changes were made\033[0m")
        print("\033[1;33mℹ️  Run without --dry-run to apply changes\033[0m")
        return 0
    elif users_failed == 0:
        print("\033[0;32m✅ ALL USERS UPDATED SUCCESSFULLY\033[0m")
        print("\033[0;32m✅ Test login now - clearances should display correctly!\033[0m")
        return 0
    else:
        print(f"\033[1;33m⚠️  {users_failed} USERS FAILED\033[0m")
        return 1

if __name__ == '__main__':
    sys.exit(main())

