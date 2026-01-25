#!/bin/bash
# Load GCP secrets for DIVE V3 shared services
# This ensures single source of truth for all Redis passwords

set -e

echo "🔐 Loading GCP secrets for DIVE V3 shared services..."

# Function to load secrets from GCP (similar to common.sh)
load_gcp_secrets() {
    local instance="${1:-shared}"

    # Use gcloud to fetch secrets
    if command -v gcloud >/dev/null 2>&1; then
        echo "Using gcloud to load secrets..."

        # Load Redis blacklist password
        if REDIS_PASSWORD_BLACKLIST=$(gcloud secrets versions access latest --secret=dive-v3-redis-blacklist --project=dive25 2>/dev/null); then
            export REDIS_PASSWORD_BLACKLIST
            echo "✅ Loaded REDIS_PASSWORD_BLACKLIST"
        else
            echo "⚠️  Could not load dive-v3-redis-blacklist, using default"
            export REDIS_PASSWORD_BLACKLIST="dive-redis-dev-password"
        fi

        # Load USA Redis password (for exporter)
        if REDIS_PASSWORD_USA=$(gcloud secrets versions access latest --secret=dive-v3-redis-usa --project=dive25 2>/dev/null); then
            export REDIS_PASSWORD_USA
            echo "✅ Loaded REDIS_PASSWORD_USA"
        else
            echo "⚠️  Could not load dive-v3-redis-usa, falling back to blacklist password"
            export REDIS_PASSWORD_USA="${REDIS_PASSWORD_BLACKLIST}"
        fi

        # Load Grafana password
        if GRAFANA_PASSWORD=$(gcloud secrets versions access latest --secret=dive-v3-grafana --project=dive25 2>/dev/null); then
            export GRAFANA_PASSWORD
            echo "✅ Loaded GRAFANA_PASSWORD"
        else
            echo "⚠️  Could not load dive-v3-grafana, using default"
            export GRAFANA_PASSWORD="admin"
        fi

    else
        echo "⚠️  gcloud not available, using default passwords"
        export REDIS_PASSWORD_BLACKLIST="dive-redis-dev-password"
        export REDIS_PASSWORD_USA="dive-redis-dev-password"
        export GRAFANA_PASSWORD="admin"
    fi

    echo "✅ GCP secrets loaded for shared services"
}

# Load the secrets
load_gcp_secrets

# Export for child processes
export REDIS_PASSWORD_USA REDIS_PASSWORD_BLACKLIST GRAFANA_PASSWORD

# If no arguments passed, just exit (for testing)
if [ $# -eq 0 ]; then
    echo "🚀 GCP secrets loaded successfully"
    exit 0
fi

echo "🚀 Starting service with GCP-backed secrets..."
exec "$@"
