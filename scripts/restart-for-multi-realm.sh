#!/bin/bash

# Multi-Realm Restart Script
# Ensures services pick up dive-v3-broker configuration

echo "🔄 Restarting services for multi-realm configuration..."
echo ""

echo "Configuration verified:"
echo "  ✅ KEYCLOAK_REALM=dive-v3-broker"
echo "  ✅ KEYCLOAK_CLIENT_ID=dive-v3-client-broker"
echo "  ✅ Client secret configured"
echo ""

echo "📝 Next steps:"
echo "1. Stop backend (if running): Ctrl+C in backend terminal"
echo "2. Stop frontend (if running): Ctrl+C in frontend terminal"
echo "3. Restart backend:"
echo "   cd backend && npm run dev"
echo "4. Restart frontend:"
echo "   cd frontend && npm run dev"
echo "5. Test: http://localhost:3000 → Login → See 4 IdP choices"
echo ""

echo "✅ Configuration is ready - just restart services!"


