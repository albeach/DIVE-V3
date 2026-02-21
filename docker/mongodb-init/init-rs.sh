#!/bin/bash
# =============================================================================
# MongoDB Replica Set Init Container
# =============================================================================
# Runs inside a mongo:7.0 container on the Docker internal network.
# Connects to the mongodb service and initializes the replica set.
#
# Idempotent: safe to run multiple times — detects existing replica set.
#
# Required env vars:
#   MONGO_CONTAINER   - Service hostname (e.g., mongodb-deu)
#   MONGO_PORT        - MongoDB port (default: 27017)
#   MONGO_ADMIN_USER  - Admin username
#   MONGO_ADMIN_PASS  - Admin password
#   RS_NAME           - Replica set name (default: rs0)
#
# Exit codes:
#   0 - Replica set initialized and PRIMARY
#   1 - Failed
# =============================================================================

set -e

: "${MONGO_CONTAINER:?MONGO_CONTAINER required}"
: "${MONGO_ADMIN_PASS:?MONGO_ADMIN_PASS required}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_ADMIN_USER="${MONGO_ADMIN_USER:-admin}"
RS_NAME="${RS_NAME:-rs0}"

MONGO_URI="mongodb://${MONGO_ADMIN_USER}:${MONGO_ADMIN_PASS}@${MONGO_CONTAINER}:${MONGO_PORT}/admin"
MONGO_OPTS="--tls --tlsAllowInvalidCertificates --quiet"

echo "MongoDB replica set initialization for ${MONGO_CONTAINER}"

# Check if already initialized
if mongosh "$MONGO_URI" $MONGO_OPTS --eval 'rs.status().ok' 2>/dev/null | grep -q 1; then
    state=$(mongosh "$MONGO_URI" $MONGO_OPTS \
        --eval 'rs.status().members[0].stateStr' 2>/dev/null || echo "UNKNOWN")
    if [ "$state" = "PRIMARY" ]; then
        echo "Replica set already initialized (PRIMARY)"
        exit 0
    fi
    echo "Replica set exists but state=$state — waiting for PRIMARY..."
else
    echo "Initializing replica set ${RS_NAME}..."
    mongosh "$MONGO_URI" $MONGO_OPTS --eval "
        rs.initiate({
            _id: '${RS_NAME}',
            members: [{_id: 0, host: '${MONGO_CONTAINER}:${MONGO_PORT}'}]
        })
    "
fi

# Wait for PRIMARY (up to 30s)
for attempt in $(seq 1 15); do
    state=$(mongosh "$MONGO_URI" $MONGO_OPTS \
        --eval 'rs.status().members[0].stateStr' 2>/dev/null || echo "UNKNOWN")
    if [ "$state" = "PRIMARY" ]; then
        echo "Replica set ready (PRIMARY) after $((attempt * 2))s"
        exit 0
    fi
    echo "  ${attempt}/15: state=$state"
    sleep 2
done

echo "ERROR: MongoDB did not become PRIMARY within 30s"
exit 1
