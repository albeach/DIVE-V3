#!/bin/bash
# Re-seed COI Keys to fix missing data on COI Keys page
# Run this after updating the seed script to include all required fields

set -e

echo "🔄 Re-seeding COI Keys Database..."
echo "=================================="
echo ""

# Check if backend container is running
if ! docker ps --format '{{.Names}}' | grep -q "dive-hub-backend"; then
    echo "❌ Backend container not running"
    echo "Start it with: ./dive hub deploy"
    exit 1
fi

# Run the initialization script inside the backend container
echo "📝 Running COI Keys initialization script..."
docker exec dive-hub-backend node dist/scripts/initialize-coi-keys.js

echo ""
echo "✅ COI Keys re-seeding complete!"
echo ""
echo "Next steps:"
echo "1. Restart backend: docker restart dive-hub-backend"
echo "2. Test API: curl -k https://localhost:4000/api/compliance/coi-keys | jq '.cois | length'"
echo "3. Visit: https://localhost:3010/compliance/coi-keys"
echo ""
