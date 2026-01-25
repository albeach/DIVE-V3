#!/bin/bash
# =============================================================================
# MongoDB Replica Set Post-Startup Initialization
# =============================================================================
# Purpose:
#   Initialize MongoDB replica set AFTER the container is fully running.
#   This is called by the deployment script after MongoDB is healthy.
#
# Usage:
#   ./scripts/init-mongo-replica-set-post-start.sh dive-hub-mongodb admin PASSWORD
#
# Arguments:
#   $1 - Container name (e.g., dive-hub-mongodb)
#   $2 - Admin username (default: admin)
#   $3 - Admin password (from GCP secrets)
#
# Exit Codes:
#   0 - Success (initialized OR already initialized with PRIMARY status)
#   1 - Failure (initialization failed or timeout waiting for PRIMARY)
# =============================================================================

CONTAINER_NAME="${1:-dive-hub-mongodb}"
ADMIN_USER="${2:-admin}"
ADMIN_PASSWORD="${3}"

if [ -z "$ADMIN_PASSWORD" ]; then
    echo "❌ ERROR: Admin password required"
    echo "Usage: $0 <container-name> <admin-user> <admin-password>"
    exit 1
fi

echo ""
echo "🔧 Initializing MongoDB replica set in $CONTAINER_NAME"
echo ""

# Initialize replica set using admin credentials
${DOCKER_CMD:-docker} exec "$CONTAINER_NAME" mongosh admin -u "$ADMIN_USER" -p "$ADMIN_PASSWORD" --quiet --eval '
try {
  // Check current replica set status
  try {
    const status = rs.status();
    print("ℹ️  Replica set already initialized:", status.set);

    const currentState = status.members[0].stateStr;
    print("   Current state:", currentState);

    if (currentState === "PRIMARY") {
      print("✅ Node is PRIMARY - replica set ready");
      quit(0);
    } else if (currentState === "SECONDARY" || currentState === "STARTUP" || currentState === "STARTUP2") {
      print("⏳ Node in", currentState, "state - waiting for PRIMARY...");
      // Do NOT exit - continue to wait loop below
    } else {
      print("⚠️  Unexpected state:", currentState, "- will attempt to wait for PRIMARY");
    }
  } catch (e) {
    if (!e.message.includes("no replset config")) {
      print("❌ Unexpected error checking replica set status:", e.message);
      throw e;
    }
    print("ℹ️  Replica set not initialized - starting initialization...");
  }

  // Initialize replica set (only if not already initialized)
  try {
    rs.status();
    print("ℹ️  Replica set config exists - will wait for PRIMARY status");
  } catch (e) {
    if (e.message.includes("no replset config")) {
      print("🔧 Initializing replica set rs0...");

      // Use localhost as the host for replica set member
      // This works for both Hub and spokes since mongosh connects from within the container
      const result = rs.initiate({
        _id: "rs0",
        members: [
          { _id: 0, host: "localhost:27017" }
        ]
      });

      if (result.ok === 1) {
        print("✅ Replica set initialized successfully");
      } else if (result.codeName === "AlreadyInitialized") {
        print("ℹ️  Replica set already initialized (race condition detected)");
      } else {
        print("❌ Initialization failed:", JSON.stringify(result));
        quit(1);
      }
    }
  }

  // Wait for PRIMARY status (up to 60 seconds - increased from 30s)
  print("⏳ Waiting for PRIMARY status (up to 60s)...");
  for (let i = 0; i < 60; i++) {
    sleep(1000);
    try {
      const st = rs.status();
      const state = st.members[0].stateStr;

      if (state === "PRIMARY") {
        print("✅ Node is PRIMARY - replica set ready for change streams");
        quit(0);
      }

      if (i % 5 === 0 && i > 0) {
        print("   " + i + "s: State=" + state);
      }
    } catch (e) {
      // Transitioning
      if (i % 5 === 0 && i > 0) {
        print("   " + i + "s: Transitioning...");
      }
    }
  }
  print("❌ PRIMARY state not reached in 60s - replica set may be unhealthy");
  print("   This could indicate:");
  print("   - KeyFile permissions issue");
  print("   - Network configuration problem");
  print("   - Resource constraints (CPU/memory)");
  quit(1);
} catch (err) {
  print("❌ Error:", err.message);
  print("Stack:", err.stack);
  quit(1);
}
'

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ MongoDB replica set initialization complete"
    echo ""
    exit 0
else
    echo "❌ MongoDB replica set initialization failed"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check MongoDB logs: ${DOCKER_CMD:-docker} logs dive-hub-mongodb"
    echo "  2. Verify keyFile exists: ${DOCKER_CMD:-docker} exec dive-hub-mongodb ls -la /tmp/mongo-keyfile"
    echo "  3. Check replica set status: ${DOCKER_CMD:-docker} exec dive-hub-mongodb mongosh admin -u admin -p PASSWORD --eval 'rs.status()'"
    echo ""
    exit 1
fi
