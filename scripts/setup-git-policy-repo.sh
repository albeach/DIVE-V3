#!/bin/bash
set -e

# DIVE V3: Setup Git-Based Policy Repository
# This script initializes a local Git repository for policies
# so OPAL can detect changes and distribute to all OPA instances

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
POLICY_DIR="$PROJECT_ROOT/policies"

echo "=== DIVE V3: Git-Based Policy Repository Setup ==="
echo ""
echo "This will initialize a Git repository in ./policies"
echo "and enable real-time policy distribution via OPAL."
echo ""

# Check if .git already exists
if [ -d "$POLICY_DIR/.git" ]; then
    echo "✓ Git repository already exists in $POLICY_DIR"
    cd "$POLICY_DIR"
    echo ""
    echo "Current status:"
    git status --short
    echo ""
    read -p "Do you want to commit current changes? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add -A
        git commit -m "Policy update: $(date +%Y-%m-%d\ %H:%M:%S)" || echo "No changes to commit"
        echo "✓ Changes committed"
    fi
else
    echo "Initializing Git repository in $POLICY_DIR..."
    cd "$POLICY_DIR"
    
    # Initialize Git repo
    git init
    git config user.name "DIVE V3 Policy Admin"
    git config user.email "policy-admin@dive.mil"
    
    # Create .gitignore
    cat > .gitignore <<'EOF'
# IDE
.vscode/
.idea/
*.swp
*.swo

# Temp files
*.tmp
*.log
.DS_Store

# Test artifacts
.opa_test_cache/
EOF
    
    # Initial commit
    git add -A
    git commit -m "Initial commit: DIVE V3 policies"
    
    echo "✓ Git repository initialized"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit policies in ./policies/"
echo "2. Commit changes: cd policies && git add -A && git commit -m 'Update policy'"
echo "3. OPAL will auto-detect and distribute (polling interval: 5 seconds)"
echo ""
echo "To verify distribution:"
echo "  - Check Hub OPA: curl -s http://localhost:8181/v1/policies | jq 'keys'"
echo "  - Check KAS: docker logs dive-hub-kas 2>&1 | tail -20"
echo ""
echo "For production:"
echo "  - Push to GitHub: git remote add origin https://github.com/albeach/dive-v3-policies.git"
echo "  - Update docker-compose.hub.yml: OPAL_POLICY_REPO_URL to GitHub URL"
echo "  - Enable webhooks for instant updates (no polling)"
echo ""
