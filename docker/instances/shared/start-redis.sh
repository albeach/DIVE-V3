#!/bin/bash
# Start Redis with GCP secrets loaded

# Load secrets
if [ -f /load-secrets.sh ]; then
    source /load-secrets.sh
fi

# Export the variables (in case they weren't exported by the script)
export REDIS_PASSWORD_BLACKLIST
export REDIS_PASSWORD_USA
export GRAFANA_PASSWORD

# Start Redis with the loaded password
exec redis-server \
    --requirepass "${REDIS_PASSWORD_BLACKLIST}" \
    --appendonly yes \
    --appendfsync everysec \
    --maxmemory 256mb \
    --maxmemory-policy allkeys-lru \
    --tcp-keepalive 300 \
    --timeout 0 \
    --loglevel notice \
    --save 900 1 \
    --save 300 10 \
    --save 60 10000


