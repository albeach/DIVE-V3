#!/bin/bash
#
# MongoDB Singleton Batch Refactor Script
# Phase 2: Memory Leak Root Cause Fixes
#
# This script refactors MongoDB connection patterns to use singleton
# Handles multiple common patterns found across the codebase
#
# Usage: ./refactor-mongo-batch.sh <file1> <file2> ...

set -e

echo "🔧 MongoDB Singleton Batch Refactor"
echo "==================================="
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

refactor_count=0
skip_count=0
error_count=0

for file in "$@"; do
    echo "Processing: $file"
    
    if [ ! -f "$file" ]; then
        echo -e "${RED}  ✗ File not found${NC}"
        ((error_count++))
        continue
    fi
    
    # Check if already refactored
    if grep -q "mongodb-singleton" "$file"; then
        echo -e "${YELLOW}  → Already refactored${NC}"
        ((skip_count++))
        continue
    fi
    
    # Check if file has MongoDB connections
    if ! grep -q "new MongoClient\|MongoClient\|from 'mongodb'" "$file"; then
        echo -e "${YELLOW}  → No MongoDB usage${NC}"
        ((skip_count++))
        continue
    fi
    
    # Create backup
    cp "$file" "$file.bak"
    
    # Pattern 1: Replace MongoDB imports
    if grep -q "import.*MongoClient.*from 'mongodb'" "$file"; then
        # Remove MongoClient from mongodb import and add singleton import
        sed -i '' "s/import { \(.*\)MongoClient\(.*\) } from 'mongodb'/import { \1\2 } from 'mongodb'/g" "$file"
        sed -i '' "s/import { , /import { /g" "$file"  # Clean up double commas
        sed -i '' "s/import {  } from 'mongodb'//g" "$file"  # Remove empty imports
        
        # Add singleton import after mongodb import
        sed -i '' "/from 'mongodb'/a\\
import { getDb } from '../utils/mongodb-singleton';
" "$file"
    fi
    
    # Pattern 2: Remove getMongoDBUrl/getMongoDBName imports if only used for connection
    if ! grep -q "getMongoDBUrl()\|getMongoDBName()" "$file" || grep -q "getMongoClient()" "$file"; then
        sed -i '' "/import.*getMongoDBUrl.*getMongoDBName.*mongodb-config/d" "$file"
    fi
    
    # Pattern 3: Comment out cached client declarations
    sed -i '' "s/^let cachedClient: MongoClient.*/\/\/ REFACTORED: Removed cached client - now using MongoDB singleton/g" "$file"
    sed -i '' "s/^const cachedClient: MongoClient.*/\/\/ REFACTORED: Removed cached client - now using MongoDB singleton/g" "$file"
    
    # Pattern 4: Comment out getMongoClient function definitions
    sed -i '' "/^async function getMongoClient/,/^}/c\\
\/\/ REFACTORED: Removed getMongoClient() - now using getDb() from singleton
" "$file"
    
    # Pattern 5: Replace getMongoClient() calls with getDb()
    # This is trickier and needs manual review, but we can add comments
    sed -i '' "s/const client = await getMongoClient()/const db = getDb() \/\/ REFACTORED: Using singleton/g" "$file"
    sed -i '' "s/const db = client.db(getMongoDBName())/\/\/ REFACTORED: db already available from getDb()/g" "$file"
    sed -i '' "s/const db = client.db(dbName)/\/\/ REFACTORED: db already available from getDb()/g" "$file"
    
    echo -e "${GREEN}  ✓ Refactored${NC}"
    echo "  💾 Backup: $file.bak"
    ((refactor_count++))
done

echo ""
echo "================================="
echo "✅ Batch Refactor Complete"
echo "================================="
echo "Refactored: $refactor_count files"
echo "Skipped: $skip_count files"
echo "Errors: $error_count files"
echo ""
echo "⚠️  NEXT STEPS:"
echo "1. Review each refactored file manually"
echo "2. Fix any remaining getMongoClient() references to use getDb()"
echo "3. Remove any remaining client.db() calls"
echo "4. Test the changes: npm test"
echo "5. Remove .bak files: find . -name '*.bak' -delete"
