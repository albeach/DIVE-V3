#!/usr/bin/env python3
"""
Load GCP Secret Manager secret using service account key file.
This script can run in the backend container which has Python but not gcloud CLI.
"""
import json
import sys
import os
from google.auth import default
from google.auth.transport.requests import Request
from google.oauth2 import service_account
import googleapiclient.discovery

def get_secret(secret_name, project_id, key_file):
    """Get secret from GCP Secret Manager using service account key."""
    try:
        # Load service account credentials
        credentials = service_account.Credentials.from_service_account_file(
            key_file,
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        
        # Create Secret Manager client
        service = googleapiclient.discovery.build(
            'secretmanager', 'v1', credentials=credentials
        )
        
        # Access secret version
        name = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
        response = service.projects().secrets().versions().access(name=name).execute()
        
        return response.get('payload', {}).get('data', '')
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return None

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python3 load-deu-gcp-secret.py <secret-name> <key-file>")
        sys.exit(1)
    
    secret_name = sys.argv[1]
    key_file = sys.argv[2]
    project_id = 'dive25'
    
    secret_value = get_secret(secret_name, project_id, key_file)
    if secret_value:
        # Decode base64 if needed
        import base64
        try:
            decoded = base64.b64decode(secret_value).decode('utf-8')
            print(decoded)
        except:
            print(secret_value)
    else:
        sys.exit(1)

