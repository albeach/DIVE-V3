#!/bin/bash
# =============================================================================
# MongoDB Replica Set Entrypoint Script
# =============================================================================
# Purpose:
#   Production-grade MongoDB replica set initialization with keyFile auth.
#
# Best Practice (MongoDB Official Documentation):
#   1. Start MongoDB with --replSet and --keyFile
#   2. On first run, use localhost exception to:
#      - Initialize replica set (rs.initiate)
#      - Create admin user
#   3. MongoDB allows localhost connections without auth when admin.system.users
#      is empty, even with keyFile enabled
#   4. After admin user exists, auth is enforced for all connections
#
# Security:
#   - KeyFile for replica set internal authentication
#   - Admin credentials for client connections
#   - Localhost exception only works when no users exist
# =============================================================================

set -e

echo "🔐 MongoDB Replica Set Initialization"
echo "======================================"
echo ""

# Copy keyFile to tmp and fix permissions (MongoDB requires 0400 or 0600)
if [ -f /data/keyfile/mongo-keyfile ]; then
    cp /data/keyfile/mongo-keyfile /tmp/mongo-keyfile
    chmod 400 /tmp/mongo-keyfile
    chown mongodb:mongodb /tmp/mongo-keyfile
    echo "✅ KeyFile configured"
else
    echo "❌ ERROR: KeyFile not found at /data/keyfile/mongo-keyfile"
    exit 1
fi

echo ""

# Start MongoDB in background to initialize replica set
echo "🚀 Starting MongoDB (background mode for initialization)..."
gosu mongodb mongod \
    --replSet rs0 \
    --bind_ip_all \
    --keyFile /tmp/mongo-keyfile \
    --fork \
    --logpath /var/log/mongodb/mongod.log \
    --pidfilepath /tmp/mongod.pid

# Wait for MongoDB to accept connections
echo "⏳ Waiting for MongoDB..."
for _i in {1..60}; do
    if mongosh --quiet --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

echo "✅ MongoDB ready"
echo ""

# Initialize replica set using localhost exception
# This works even with keyFile because admin.system.users is empty on first run
echo "🔧 Initializing replica set..."

mongo_output=$(mongosh --quiet 2>&1 <<'EOF'
// Attempt replica set initialization
try {
  const result = rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'localhost:27017' }]
  });
  
  if (result.ok === 1) {
    print('INIT_SUCCESS');
    // Wait for PRIMARY
    for (let i = 0; i < 30; i++) {
      sleep(1000);
      try {
        const st = rs.status();
        if (st.members[0].stateStr === 'PRIMARY') {
          print('PRIMARY_READY');
          break;
        }
      } catch (e) {}
    }
  } else if (result.codeName === 'AlreadyInitialized' || result.errmsg?.includes('already initialized')) {
    print('ALREADY_INITIALIZED');
  } else {
    print('INIT_ERROR: ' + JSON.stringify(result));
  }
} catch (err) {
  if (err.message.includes('already initialized')) {
    print('ALREADY_INITIALIZED');
  } else if (err.message.includes('requires authentication')) {
    print('AUTH_REQUIRED');
  } else {
    print('ERROR: ' + err.message);
  }
}
EOF
)
INIT_EXIT=$?

echo "$mongo_output"

if echo "$mongo_output" | grep -q "INIT_SUCCESS\|ALREADY_INITIALIZED\|AUTH_REQUIRED"; then
    echo "✅ Replica set initialized"
else
    echo "⚠️  Replica set init returned: $mongo_output"
fi

echo ""
if [ $INIT_EXIT -ne 0 ]; then
    echo "❌ Replica set initialization failed"
    exit $INIT_EXIT
fi

echo ""

# Create admin user if specified and doesn't exist
if [ -n "$MONGO_INITDB_ROOT_USERNAME" ] && [ -n "$MONGO_INITDB_ROOT_PASSWORD" ]; then
    echo "👤 Creating admin user (if not exists)..."
    
    mongosh --quiet <<USERSCRIPT
use admin;
try {
  const existingUser = db.getUser('${MONGO_INITDB_ROOT_USERNAME}');
  if (existingUser) {
    print('ℹ️  Admin user already exists');
  } else {
    db.createUser({
      user: '${MONGO_INITDB_ROOT_USERNAME}',
      pwd: '${MONGO_INITDB_ROOT_PASSWORD}',
      roles: [
        { role: 'root', db: 'admin' },
        { role: 'clusterAdmin', db: 'admin' }
      ]
    });
    print('✅ Admin user created');
  }
} catch (err) {
  print('⚠️  Admin user creation skipped:', err.message);
}
USERSCRIPT

fi

echo ""
echo "✅ MongoDB initialization complete"
echo "   Replica Set: rs0"
echo "   KeyFile Auth: Enabled"
echo "   Admin User: ${MONGO_INITDB_ROOT_USERNAME:-none}"
echo ""
echo "📊 Starting MongoDB in foreground mode..."
echo ""

# Shutdown background MongoDB
mongosh admin --quiet --eval "db.shutdownServer()"
sleep 2

# Start MongoDB in foreground
exec gosu mongodb mongod \
    --replSet rs0 \
    --bind_ip_all \
    --keyFile /tmp/mongo-keyfile
