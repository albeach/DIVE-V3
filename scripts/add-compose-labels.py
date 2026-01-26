#!/usr/bin/env python3
"""
Add service classification labels to docker-compose.hub.yml
Phase 2: Dynamic Service Discovery
"""

import re
import sys

COMPOSE_FILE = "docker-compose.hub.yml"

# Service classifications from Phase 0 Audit
SERVICE_METADATA = {
    "postgres": {
        "class": "core",
        "desc": "PostgreSQL database for Keycloak user/realm storage"
    },
    "mongodb": {
        "class": "core",
        "desc": "MongoDB database for resource metadata and audit logs"
    },
    "redis": {
        "class": "core",
        "desc": "Redis cache for session state and policy decisions"
    },
    "redis-blacklist": {
        "class": "core",
        "desc": "Redis blacklist for revoked JWT tokens"
    },
    "keycloak": {
        "class": "core",
        "desc": "Keycloak IdP broker for multi-nation SSO"
    },
    "opa": {
        "class": "core",
        "desc": "Open Policy Agent for ABAC authorization decisions"
    },
    "backend": {
        "class": "core",
        "desc": "Express.js API with PEP for authorization enforcement"
    },
    "frontend": {
        "class": "core",
        "desc": "Next.js React application with NextAuth.js"
    },
    "kas": {
        "class": "stretch",
        "desc": "Key Access Service for TDF encrypted resources (stretch goal)"
    },
    "opal-server": {
        "class": "stretch",
        "desc": "OPAL server for real-time policy distribution (stretch goal)"
    },
    "otel-collector": {
        "class": "optional",
        "desc": "OpenTelemetry collector for traces/metrics (optional)"
    },
}

def add_labels_to_compose():
    """Add labels to services in docker-compose.hub.yml"""
    
    with open(COMPOSE_FILE, 'r') as f:
        lines = f.readlines()
    
    output = []
    i = 0
    while i < len(lines):
        line = lines[i]
        output.append(line)
        
        # Check if this is a service definition line
        match = re.match(r'^  ([a-z-]+):$', line)
        if match:
            service_name = match.group(1)
            
            # Skip if not in our metadata or if it's a network
            if service_name not in SERVICE_METADATA:
                i += 1
                continue
            
            metadata = SERVICE_METADATA[service_name]
            
            # Look ahead to find where to insert labels
            # Labels should go after image/platform but before env_file/restart
            j = i + 1
            insert_pos = None
            
            # Find the right place to insert (after image/container_name/platform, before restart/env_file)
            while j < len(lines) and lines[j].startswith('    '):
                if lines[j].strip().startswith('restart:') or lines[j].strip().startswith('env_file:'):
                    insert_pos = j
                    break
                j += 1
            
            if insert_pos:
                # Check if labels already exist
                labels_exist = False
                for check_line in lines[i:insert_pos]:
                    if 'dive.service.class' in check_line:
                        labels_exist = True
                        break
                
                if not labels_exist:
                    # Insert labels
                    labels_block = f'    labels:\n'
                    labels_block += f'      dive.service.class: "{metadata["class"]}"\n'
                    labels_block += f'      dive.service.description: "{metadata["desc"]}"\n'
                    
                    output.insert(len(output) - (i - insert_pos) + i, labels_block)
                    print(f"✅ Added labels to {service_name} (class: {metadata['class']})")
                else:
                    print(f"⏭️  Skipped {service_name} (labels already exist)")
        
        i += 1
    
    # Write output
    with open(COMPOSE_FILE + '.new', 'w') as f:
        f.writelines(output)
    
    print(f"\n✅ New compose file written to {COMPOSE_FILE}.new")
    print("Review the changes and then:")
    print(f"  mv {COMPOSE_FILE} {COMPOSE_FILE}.bak")
    print(f"  mv {COMPOSE_FILE}.new {COMPOSE_FILE}")

if __name__ == '__main__':
    try:
        add_labels_to_compose()
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
