# Week 2 Startup & Testing Guide

**Purpose:** Standard procedure for starting DIVE V3 and running tests  
**Use:** Run this EVERY TIME before testing  
**Status:** Required for all manual testing sessions

---

## Quick Start (3 Commands)

```bash
# 1. Start infrastructure
./scripts/preflight-check.sh

# 2. Start backend (Terminal 1)
cd backend && npm run dev

# 3. Start frontend (Terminal 2)  
cd frontend && npm run dev
```

---

## Complete Startup Procedure

### Step 1: Pre-Flight Check (ALWAYS RUN FIRST)

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
./scripts/preflight-check.sh
```

**This checks:**
- ✅ Docker services running
- ✅ Keycloak healthy
- ✅ PostgreSQL healthy
- ✅ MongoDB healthy (with 8 resources)
- ✅ OPA healthy (with Week 2 policy)
- ✅ Environment variables configured
- ✅ OPA tests passing (53/53)
- ✅ Database tables exist

**If ANY checks fail:**
- Read the error message
- Follow the suggested fix
- Re-run preflight-check.sh
- Don't proceed until all green ✅

### Step 2: Start Backend API

**Terminal 1:**
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend
npm run dev
```

**Expected output:**
```json
{
  "message": "DIVE V3 Backend API started",
  "port": 4000,
  "keycloak": "http://localhost:8081",  ← Should NOT be undefined
  "opa": "http://localhost:8181",
  "mongodb": "mongodb://localhost:27017"
}
```

**Verify:**
```bash
# In another terminal:
curl http://localhost:4000/health
# Should return: {"status":"ok",...}
```

### Step 3: Start Frontend

**Terminal 2:**
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend
npm run dev
```

**Expected output:**
```
  ▲ Next.js 15.0.3
  - Local:        http://localhost:3000

 ✓ Ready in 2s
```

**Should NOT see:**
- ❌ `[auth][error] AdapterError`
- ❌ `edge runtime does not support`
- ❌ `CHUNKING_SESSION_COOKIE`

### Step 4: Verify Application

**Open browser:**
```
http://localhost:3000
```

**Should see:**
- Home page with "Login with Keycloak" button
- No errors in browser console (F12)

---

## Health Monitoring During Testing

### Terminal 3: Monitor Services (Optional)

```bash
# Watch all Docker services
watch -n 5 'docker-compose ps --format table'

# Or monitor specific service logs
docker-compose logs -f opa    # OPA policy decisions
docker-compose logs -f keycloak  # Auth events
```

### Quick Health Check Command

```bash
# Run anytime during testing
curl -s http://localhost:8081/health/ready | jq .status  # Keycloak
curl -s http://localhost:8181/health | jq               # OPA  
curl -s http://localhost:4000/health | jq .status       # Backend
curl -I http://localhost:3000 2>&1 | head -1            # Frontend
```

**All should return "UP" or 200 OK**

---

## Common Issues & Fixes

### Issue: "Backend API - NOT RESPONDING"

**Cause:** Backend not started or crashed

**Fix:**
```bash
# Terminal 1:
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend
npm run dev

# Verify:
curl http://localhost:4000/health
```

### Issue: "Frontend - NOT RESPONDING"

**Cause:** Frontend not started or build failed

**Fix:**
```bash
# Terminal 2:
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend
npm run dev

# Verify:
curl -I http://localhost:3000
```

### Issue: "OPA policy not working"

**Cause:** OPA has old policy or container needs restart

**Fix:**
```bash
docker-compose restart opa
sleep 5
./scripts/preflight-check.sh
```

### Issue: "Access tokens expired"

**Cause:** Old session in database

**Fix:**
```bash
# Clear database
docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -c \
  "DELETE FROM account; DELETE FROM session; DELETE FROM \"user\";"

# Fresh login required
```

### Issue: "MongoDB has 0 resources"

**Cause:** Database not seeded

**Fix:**
```bash
cd backend
npm run seed-database
```

---

## Testing Workflow

### Before Each Testing Session

```bash
# 1. Run preflight
./scripts/preflight-check.sh

# 2. If any failures, fix them

# 3. Start backend (Terminal 1)
cd backend && npm run dev

# 4. Start frontend (Terminal 2)
cd frontend && npm run dev

# 5. Open browser
http://localhost:3000
```

### During Testing

**Monitor logs in real-time:**
- Terminal 1: Backend logs (JWT, OPA, authorization)
- Terminal 2: Frontend logs (session, auth, claims)
- Browser Console (F12): Client-side errors

**Watch for issues:**
- Backend: "JWT verification failed"
- Frontend: "[DIVE] Token refresh failed"
- Browser: Network errors (401, 403, 500)

### After Testing

**Optional - Clean up:**
```bash
# Stop services (keep data)
Ctrl+C in Terminal 1 (backend)
Ctrl+C in Terminal 2 (frontend)

# Or full cleanup (lose data)
docker-compose down
```

---

## Automated Health Monitoring

### Add to Your Shell Profile

**For continuous monitoring, add to `~/.bashrc` or `~/.zshrc`:**

```bash
alias dive-check='cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3 && ./scripts/preflight-check.sh'
alias dive-start='cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3 && ./scripts/dev-start.sh'
alias dive-logs='cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3 && docker-compose logs -f'
```

**Usage:**
```bash
dive-check    # Run pre-flight
dive-start    # Start infrastructure
dive-logs opa # Watch OPA logs
```

---

## Service Dependencies

### Startup Order (If Starting from Scratch)

```
1. Docker infrastructure:
   docker-compose up -d
   ↓
2. Wait for Keycloak (60s)
   ↓
3. Apply Terraform (configure Keycloak)
   cd terraform && terraform apply
   ↓
4. Seed MongoDB
   cd backend && npm run seed-database
   ↓
5. Start Backend
   cd backend && npm run dev
   ↓
6. Start Frontend  
   cd frontend && npm run dev
   ↓
7. Run preflight check
   ./scripts/preflight-check.sh
```

**Or use:** `./scripts/dev-start.sh` (automates steps 1-4)

---

## Success Criteria

Before proceeding with testing:

- [ ] `preflight-check.sh` shows all green ✅
- [ ] Backend running on :4000
- [ ] Frontend running on :3000
- [ ] All 53 OPA tests passing
- [ ] No errors in terminal outputs
- [ ] Browser loads http://localhost:3000 without errors

**Only proceed to testing when all criteria met!**

---

## Why This Matters

### Prevents Wasted Debugging Time

**Without preflight checks:**
- Spend hours debugging auth issues
- Root cause: OPA not running
- Could have been caught in 30 seconds

**With preflight checks:**
- 30-second automated check
- Catches infrastructure issues immediately
- Focus debugging on actual application logic

### Ensures Reproducible Testing

**Every test session starts with:**
- ✅ Known good infrastructure state
- ✅ All services healthy
- ✅ Correct policy loaded
- ✅ Fresh tokens available

**No more:** "It worked yesterday, why not today?"

---

**Status:** ✅ Pre-flight check script created  
**Location:** `scripts/preflight-check.sh`  
**Usage:** Run before EVERY testing session  

**Action Required:** Start backend and frontend, then run testing

