#!/bin/bash

# Clear old logs and watch for new errors
echo "Clearing old logs and starting fresh monitoring..."
echo "============================================"
echo "Watching for NextAuth callback errors..."
echo "============================================"
echo ""

# Tail the logs and watch for errors
docker logs -f --tail 0 dive-v3-frontend 2>&1 | grep --line-buffered -A20 "NextAuth Error"

