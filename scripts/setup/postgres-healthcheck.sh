#!/bin/bash
# DIVE V3 - Postgres Health Check with Password Verification
# 
# This script does two things:
# 1. Verifies Postgres is accepting connections (pg_isready)
# 2. Verifies the password works (psql connection test)
#
# This catches the common issue where Postgres volume persists
# but the environment password changed.

set -e

# Basic check - is Postgres running?
pg_isready -U "${POSTGRES_USER:-postgres}" -q

# Password verification - can we actually connect?
# This will fail if the volume password doesn't match env var
PGPASSWORD="${POSTGRES_PASSWORD}" psql -U "${POSTGRES_USER:-postgres}" -d postgres -c "SELECT 1" > /dev/null 2>&1

exit 0












