#!/bin/sh
set -e

echo "🔍 Checking for Next.js standalone server..."

# Check if standalone server.js exists (from Next.js standalone build)
if [ -f "/app/server.js" ]; then
    echo "✅ Found standalone server.js, starting Next.js standalone server..."
    cd /app
    exec node server.js
elif [ -f "server.js" ]; then
    echo "✅ Found server.js in current directory, starting..."
    exec node server.js
else
    echo "⚠️  Standalone server.js not found, checking for .next directory..."
    if [ -d ".next" ]; then
        echo "✅ Found .next directory, using next start..."
        exec npx next start
    else
        echo "❌ Error: Neither server.js nor .next directory found!"
        echo "📁 Listing /app contents:"
        ls -la /app || true
        echo "📁 Listing current directory contents:"
        ls -la || true
        exit 1
    fi
fi

