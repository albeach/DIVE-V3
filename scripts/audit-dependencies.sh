#!/usr/bin/env bash
# =============================================================================
# Dependency Audit Script - Gathers evidence for unused dependencies
# =============================================================================

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${DIVE_ROOT}/.cursor/debug.log"

# #region agent log
fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:12","message":"Audit script started","data":{"root":"${DIVE_ROOT}"},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"INIT"}
EOF
# #endregion

echo "🔍 DIVE V3 Dependency Audit - Evidence Collection"
echo "=================================================="
echo ""

# Hypothesis A: Frontend unused UI/animation libraries
echo "📦 [HYPOTHESIS A] Checking frontend UI/animation library usage..."
# #region agent log
fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:23","message":"Testing Hypothesis A - UI libs","data":{},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"A"}
EOF
# #endregion

FRONTEND_LIBS=("lottie-react" "react-confetti" "framer-motion" "wavesurfer.js" "react-player")
for lib in "${FRONTEND_LIBS[@]}"; do
    usage_count=$(find "${DIVE_ROOT}/frontend/src" -type f \( -name "*.ts" -o -name "*.tsx" \) -exec grep -l "from ['\"]${lib}" {} \; 2>/dev/null | wc -l)
    echo "  - ${lib}: ${usage_count} files"
    # #region agent log
    fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:33","message":"Frontend lib usage","data":{"lib":"${lib}","files":${usage_count}},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"A"}
EOF
    # #endregion
done
echo ""

# Hypothesis B: Backend redundant validation libraries
echo "🔧 [HYPOTHESIS B] Checking backend validation library usage..."
# #region agent log
fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:43","message":"Testing Hypothesis B - validation libs","data":{},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"B"}
EOF
# #endregion

VALIDATION_LIBS=("joi" "express-validator" "zod")
for lib in "${VALIDATION_LIBS[@]}"; do
    usage_count=$(find "${DIVE_ROOT}/backend/src" -type f -name "*.ts" -exec grep -l "from ['\"]${lib}" {} \; 2>/dev/null | wc -l)
    echo "  - ${lib}: ${usage_count} files"
    # #region agent log
    fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:54","message":"Backend validation lib usage","data":{"lib":"${lib}","files":${usage_count}},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"B"}
EOF
    # #endregion
done
echo ""

# Hypothesis C: Swagger/API docs usage
echo "📚 [HYPOTHESIS C] Checking Swagger/API docs usage..."
# #region agent log
fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:64","message":"Testing Hypothesis C - swagger libs","data":{},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"C"}
EOF
# #endregion

SWAGGER_LIBS=("swagger-ui-react" "swagger-jsdoc" "swagger-ui-express")
for lib in "${SWAGGER_LIBS[@]}"; do
    frontend_count=$(find "${DIVE_ROOT}/frontend/src" -type f -name "*.ts*" -exec grep -l "${lib}" {} \; 2>/dev/null | wc -l)
    backend_count=$(find "${DIVE_ROOT}/backend/src" -type f -name "*.ts" -exec grep -l "${lib}" {} \; 2>/dev/null | wc -l)
    total=$((frontend_count + backend_count))
    echo "  - ${lib}: ${total} files (frontend: ${frontend_count}, backend: ${backend_count})"
    # #region agent log
    fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:77","message":"Swagger lib usage","data":{"lib":"${lib}","total":${total},"frontend":${frontend_count},"backend":${backend_count}},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"C"}
EOF
    # #endregion
done
echo ""

# Hypothesis D: Docker image sizes
echo "🐳 [HYPOTHESIS D] Analyzing Docker image sizes..."
# #region agent log
fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:87","message":"Testing Hypothesis D - docker sizes","data":{},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"D"}
EOF
# #endregion

echo "  Current images:"
docker images | grep -E "dive-hub-(frontend|backend|kas)" | while read -r line; do
    image=$(echo "$line" | awk '{print $1":"$2}')
    size=$(echo "$line" | awk '{print $7}')
    echo "    - ${image}: ${size}"
    # #region agent log
    fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:98","message":"Docker image size","data":{"image":"${image}","size":"${size}"},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"D"}
EOF
    # #endregion
done
echo ""

# Hypothesis E: Test dependencies in production
echo "🧪 [HYPOTHESIS E] Checking test dependency classification..."
# #region agent log
fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:108","message":"Testing Hypothesis E - test deps","data":{},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"E"}
EOF
# #endregion

echo "  Frontend package.json:"
if grep -A 50 '"dependencies"' "${DIVE_ROOT}/frontend/package.json" | grep -E "@testing-library|jest|playwright" > /dev/null; then
    echo "    ⚠️  FOUND test libraries in dependencies (should be devDependencies)"
    # #region agent log
    fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:118","message":"Test deps in frontend dependencies","data":{"status":"FOUND"},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"E"}
EOF
    # #endregion
else
    echo "    ✅ No test libraries in dependencies"
    # #region agent log
    fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:126","message":"Test deps in frontend dependencies","data":{"status":"CLEAN"},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"E"}
EOF
    # #endregion
fi

echo "  Backend package.json:"
if grep -A 50 '"dependencies"' "${DIVE_ROOT}/backend/package.json" | grep -E "@testing-library|jest|playwright" > /dev/null; then
    echo "    ⚠️  FOUND test libraries in dependencies (should be devDependencies)"
    # #region agent log
    fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:137","message":"Test deps in backend dependencies","data":{"status":"FOUND"},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"E"}
EOF
    # #endregion
else
    echo "    ✅ No test libraries in dependencies"
    # #region agent log
    fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:145","message":"Test deps in backend dependencies","data":{"status":"CLEAN"},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"E"}
EOF
    # #endregion
fi
echo ""

# Additional checks: node_modules size
echo "📊 Additional Metrics:"
if [ -d "${DIVE_ROOT}/frontend/node_modules" ]; then
    frontend_size=$(du -sh "${DIVE_ROOT}/frontend/node_modules" 2>/dev/null | awk '{print $1}')
    echo "  - Frontend node_modules: ${frontend_size}"
    # #region agent log
    fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:160","message":"Frontend node_modules size","data":{"size":"${frontend_size}"},"timestamp":$(date +%s%3N),"sessionId":"debug-session"}
EOF
    # #endregion
fi

if [ -d "${DIVE_ROOT}/backend/node_modules" ]; then
    backend_size=$(du -sh "${DIVE_ROOT}/backend/node_modules" 2>/dev/null | awk '{print $1}')
    echo "  - Backend node_modules: ${backend_size}"
    # #region agent log
    fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:171","message":"Backend node_modules size","data":{"size":"${backend_size}"},"timestamp":$(date +%s%3N),"sessionId":"debug-session"}
EOF
    # #endregion
fi

echo ""
echo "✅ Audit complete! Check logs for detailed results."

# #region agent log
fetch 'http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783' -X POST -H 'Content-Type: application/json' --data-binary @- <<EOF 2>/dev/null || true
{"location":"audit-dependencies.sh:182","message":"Audit script completed","data":{},"timestamp":$(date +%s%3N),"sessionId":"debug-session","hypothesisId":"COMPLETE"}
EOF
# #endregion

# sc2034-anchor
: "${LOG_FILE:-}"
