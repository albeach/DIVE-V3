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
docker exec "$CONTAINER_NAME" mongosh admin -u "$ADMIN_USER" -p "$ADMIN_PASSWORD" --quiet --eval '
try {
  // Check if already initialized
  try {
    const status = rs.status();
    print("ℹ️  Replica set already initialized:", status.set);
    if (status.members[0].stateStr === "PRIMARY") {
      print("✅ Node is PRIMARY - replica set ready");
      quit(0);
    }
  } catch (e) {
    if (!e.message.includes("no replset config")) {
      throw e;
    }
  }
  
  // Initialize replica set
  print("🔧 Initializing replica set rs0...");
  const result = rs.initiate({
    _id: "rs0",
    members: [
      { _id: 0, host: "localhost:27017" }
    ]
  });
  
  if (result.ok === 1) {
    print("✅ Replica set initialized successfully");
    
    // Wait for PRIMARY status
    for (let i = 0; i < 30; i++) {
      sleep(1000);
      try {
        const st = rs.status();
        if (st.members[0].stateStr === "PRIMARY") {
          print("✅ Node is PRIMARY - replica set ready for change streams");
          quit(0);
        }
        print("   Waiting for PRIMARY... (" + st.members[0].stateStr + ")");
      } catch (e) {
        // Transitioning
      }
    }
    print("⚠️  PRIMARY state not reached in 30s - may still be initializing");
  } else if (result.codeName === "AlreadyInitialized") {
    print("ℹ️  Replica set already initialized");
  } else {
    print("❌ Initialization failed:", JSON.stringify(result));
    quit(1);
  }
} catch (err) {
  print("❌ Error:", err.message);
  quit(1);
}
'

if [ $? -eq 0 ]; then
    echo "✅ MongoDB replica set initialization complete"
    echo ""
    exit 0
else
    echo "❌ MongoDB replica set initialization failed"
    echo ""
    exit 1
fi
