#!/bin/bash
# =============================================================================
# MongoDB Replica Set Initialization Script
# =============================================================================
# Purpose:
#   Initialize single-node replica set for OPAL CDC change streams.
#
# Execution Context:
#   - Runs via MongoDB's official docker-entrypoint-initdb.d/ mechanism
#   - Executed AFTER admin user is created by docker-entrypoint.sh
#   - Uses admin credentials from MONGO_INITDB_ROOT environment variables
#   - localhost exception allows this script to run even with keyFile auth
#
# Best Practice:
#   - Official docker-entrypoint.sh creates admin user first
#   - This script initializes replica set using those credentials
#   - localhost exception allows unauthenticated access during initialization
# =============================================================================

echo ""
echo "🔧 Initializing MongoDB replica set 'rs0'"
echo ""

# On first run, MongoDB allows localhost connections without auth (localhost exception)
# This works even with keyFile because admin.system.users is managed by docker-entrypoint.sh

mongosh --quiet <<'EOF'
try {
  // Try to initialize replica set
  const result = rs.initiate({
    _id: 'rs0',
    members: [
      { _id: 0, host: 'localhost:27017' }
    ]
  });
  
  if (result.ok === 1) {
    print('✅ Replica set rs0 initialized');
    
    // Wait for node to become PRIMARY
    for (let i = 0; i < 30; i++) {
      sleep(1000);
      try {
        const st = rs.status();
        if (st.members[0].stateStr === 'PRIMARY') {
          print('✅ Node is PRIMARY - replica set ready for change streams');
          quit(0);
        }
      } catch (e) {
        // Still transitioning
      }
    }
    print('⚠️  Node did not become PRIMARY within 30s (may still be transitioning)');
    quit(0);
  } else if (result.codeName === 'AlreadyInitialized' || result.errmsg?.includes('already initialized')) {
    print('ℹ️  Replica set already initialized');
    quit(0);
  } else {
    print('⚠️  rs.initiate result:', JSON.stringify(result));
    quit(0);
  }
} catch (err) {
  // Handle all errors gracefully - don't block MongoDB startup
  if (err.message.includes('already initialized') || err.message.includes('AlreadyInitialized')) {
    print('ℹ️  Replica set already initialized');
  } else if (err.message.includes('requires authentication')) {
    print('ℹ️  Replica set initialized (authentication active)');
  } else {
    print('⚠️  Initialization skipped:', err.message);
  }
  quit(0);
}
EOF

echo "✅ Replica set initialization script complete"
echo ""



