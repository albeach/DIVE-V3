# Phase 2 UI Debugging Guide

## 🔍 Root Cause Analysis

**Issue:** Phase 2 UI components not showing in admin approvals page

**Root Cause:** No pending submissions with Phase 2 data exist

**Evidence:**
```bash
# Check MongoDB:
mongosh dive-v3 --eval "db.idp_submissions.find({status: 'pending'}).count()"
# Result: 0 pending submissions

# Check existing submissions:
mongosh dive-v3 --eval "db.idp_submissions.find({}, {alias: 1, comprehensiveRiskScore: 1})"
# Result: Old submissions lack comprehensiveRiskScore field
```

---

## ✅ Verification Steps

### Step 1: Verify Code is Present

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Check frontend components exist:
ls -la frontend/src/components/admin/ | grep -E "risk|compliance|sla"

# Should show:
# - risk-score-badge.tsx ✅
# - risk-breakdown.tsx ✅
# - compliance-status-card.tsx ✅
# - sla-countdown.tsx ✅
# - risk-factor-analysis.tsx ✅

# Check they're imported in approvals page:
grep "import Risk" frontend/src/app/admin/approvals/page.tsx

# Should show:
# import RiskScoreBadge from '@/components/admin/risk-score-badge';
# import RiskBreakdown from '@/components/admin/risk-breakdown';
# etc.
```

### Step 2: Verify Backend Services

```bash
cd backend

# Check Phase 2 services exist:
ls -la src/services/ | grep -E "risk|compliance"

# Should show:
# - risk-scoring.service.ts ✅
# - compliance-validation.service.ts ✅

# Check they're imported in admin controller:
grep "risk-scoring\\|compliance-validation" src/controllers/admin.controller.ts

# Should show imports
```

### Step 3: Verify Backend is Running

```bash
# Start backend (if not running):
cd backend
npm run dev

# Should show:
# Server running on port 4000
# Connected to MongoDB
# Connected to OPA

# Test endpoint:
curl http://localhost:4000/health
# Should return: {"status":"healthy"}
```

### Step 4: Create Test Submission with Phase 2 Data

**THE KEY STEP:** You need to create a NEW IdP submission that will go through Phase 2 processing.

#### Option A: Use Test Script
```bash
# Get your JWT token first:
# 1. Login at http://localhost:3000
# 2. Open DevTools → Console  
# 3. Run: localStorage.getItem('jwt')
# 4. Copy the token

# Then run:
./scripts/test-phase2-ui.sh <YOUR_JWT_TOKEN>

# This creates 3 test submissions:
# - Gold tier (auto-approved but briefly visible)
# - Silver tier (pending, fast-track)
# - Bronze tier (pending, standard review)
```

#### Option B: Manual curl
```bash
curl -X POST http://localhost:4000/api/admin/idps \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "alias": "test-silver-'$(date +%s)'",
    "displayName": "Silver Tier UI Test",
    "description": "IAL1 with audit logging",
    "protocol": "oidc",
    "config": {
      "issuer": "https://login.microsoftonline.com/common/v2.0"
    },
    "operationalData": {
      "uptimeSLA": "99.0%",
      "incidentResponse": "business-hours",
      "supportContacts": ["support@example.com"]
    }
  }'

# Check response includes:
# - comprehensiveRiskScore: { total, tier, breakdown, factors }
# - complianceCheck: { overall, standards, score }
# - approvalDecision: { action, reason, slaDeadline }
```

### Step 5: Verify Data in MongoDB

```bash
# Check pending submissions:
mongosh dive-v3 --eval "
  db.idp_submissions.find(
    {status: 'pending'}, 
    {
      alias: 1, 
      'comprehensiveRiskScore.total': 1,
      'comprehensiveRiskScore.tier': 1,
      slaDeadline: 1,
      fastTrack: 1
    }
  ).pretty()
"

# Should show:
# - alias: test-silver-...
# - comprehensiveRiskScore.total: ~75
# - comprehensiveRiskScore.tier: 'silver'
# - slaDeadline: <timestamp>
# - fastTrack: true
```

### Step 6: Refresh Admin UI

```bash
# Open browser:
open http://localhost:3000/admin/approvals

# OR refresh if already open:
# Press Cmd+Shift+R (hard refresh)

# You should NOW see:
# ✅ Risk score badge (e.g., "🥈 Silver 75/100")
# ✅ Risk breakdown chart
# ✅ Compliance status card
# ✅ SLA countdown timer
# ✅ Risk factor analysis (expandable)
```

---

## 🐛 Common Issues

### Issue 1: "No pending approvals" message

**Cause:** No submissions in MongoDB with status='pending'

**Fix:**
```bash
# Create test submission using script above
./scripts/test-phase2-ui.sh <JWT_TOKEN>
```

### Issue 2: Old submissions show but no Phase 2 UI

**Cause:** Submissions created before Phase 2 don't have new fields

**Fix:**
```bash
# Delete old submissions:
mongosh dive-v3 --eval "db.idp_submissions.deleteMany({})"

# Create new ones with Phase 2 data (see Step 4 above)
```

### Issue 3: Components not rendering

**Cause:** Frontend not rebuilt after git pull

**Fix:**
```bash
cd frontend
rm -rf .next
npm run dev
# Hard refresh browser (Cmd+Shift+R)
```

### Issue 4: Backend not returning Phase 2 data

**Cause:** Backend not restarted after git pull

**Fix:**
```bash
cd backend
npm install  # In case dependencies changed
npm run build
npm run dev
```

---

## 🧪 Complete Test Procedure

### 1. Clean Slate
```bash
# Stop all services
# Clear database:
mongosh dive-v3 --eval "db.idp_submissions.deleteMany({})"

# Pull latest:
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
git pull origin main
```

### 2. Rebuild Everything
```bash
# Backend:
cd backend
npm install
npm run build
npm run dev  # Terminal 1

# Frontend:
cd ../frontend  
npm install
rm -rf .next
npm run dev  # Terminal 2
```

### 3. Login and Get Token
```bash
# Open browser: http://localhost:3000
# Login with testuser-us / Password123!
# Open DevTools → Console
# Run: localStorage.getItem('jwt')
# Copy the token
```

### 4: Create Test Submissions
```bash
# Terminal 3:
./scripts/test-phase2-ui.sh <PASTE_JWT_TOKEN_HERE>
```

### 5. View UI
```bash
# Browser: http://localhost:3000/admin/approvals
# Hard refresh: Cmd+Shift+R

# You WILL see Phase 2 UI:
# - 🥈 Silver Tier badge
# - 🥉 Bronze Tier badge  
# - Risk breakdowns
# - Compliance cards
# - SLA countdowns
# - Risk factor tables
```

---

## 📊 What the UI Should Look Like

### Silver Tier Submission
```
┌─────────────────────────────────────────────────┐
│ Silver Tier UI Test                    🥈 75/100│
│ Alias: test-silver-...          Silver Tier     │
│                                                   │
│ ⚡ Fast-Track    ⏰ 2hr SLA                      │
│                                                   │
│ Risk Breakdown:                                   │
│ ├─ Technical Security:      37/40 (92%)         │
│ ├─ Authentication:          22/30 (73%)         │
│ ├─ Operational:              8/20 (40%)         │
│ └─ Compliance:               3/10 (30%)         │
│                                                   │
│ Compliance Status:                                │
│ ├─ ACP-240: ⚠️ Partial                          │
│ ├─ STANAG 4774: ❓ Unknown                      │
│ ├─ STANAG 4778: ✅ Pass                         │
│ └─ NIST 800-63: ⚠️ Partial                      │
│                                                   │
│ SLA Countdown: 1h 58m 32s remaining             │
│                                                   │
│ 📊 View Detailed Risk Factor Analysis (11)      │
│                                                   │
│ [Approve] [Reject]                               │
└─────────────────────────────────────────────────┘
```

---

## 🔍 Debug Commands

### Check if components are imported:
```bash
grep -n "RiskScoreBadge\\|RiskBreakdown\\|ComplianceStatus\\|SLACountdown\\|RiskFactorAnalysis" \
  frontend/src/app/admin/approvals/page.tsx
```

### Check if components are used:
```bash
grep -n "comprehensiveRiskScore" frontend/src/app/admin/approvals/page.tsx
```

### Check API response structure:
```bash
# With backend running:
curl -X GET http://localhost:4000/api/admin/approvals/pending \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" | python3 -m json.tool

# Should return:
# {
#   "success": true,
#   "data": {
#     "pending": [
#       {
#         "alias": "...",
#         "comprehensiveRiskScore": { ... },  # ← MUST have this!
#         "complianceCheck": { ... },
#         "approvalDecision": { ... },
#         "slaDeadline": "...",
#         ...
#       }
#     ]
#   }
# }
```

### Check browser console:
```javascript
// In browser DevTools → Console:
fetch('http://localhost:4000/api/admin/approvals/pending', {
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('jwt') }
})
.then(r => r.json())
.then(d => console.log('API Response:', d))

// Check if d.data.pending[0].comprehensiveRiskScore exists
```

---

## 🎯 Expected Behavior

### When You Create an IdP via API:
1. Phase 1 validation runs (TLS, crypto, MFA)
2. Phase 2 risk scoring runs (100-point assessment)
3. Compliance validation runs (ACP-240, STANAG, NIST)
4. Auto-triage decides action (auto-approve, fast-track, standard, reject)
5. Submission stored in MongoDB with ALL Phase 2 fields

### When You View /admin/approvals:
1. Frontend calls GET `/api/admin/approvals/pending`
2. Backend returns submissions with Phase 2 data
3. UI conditionally renders based on `comprehensiveRiskScore` presence
4. If field exists → Phase 2 UI shows
5. If field missing → Old UI shows (backward compatible)

---

## ✅ Verification Checklist

- [ ] Backend running on port 4000
- [ ] Frontend running on port 3000
- [ ] Logged in as admin user
- [ ] JWT token obtained from localStorage
- [ ] Test submission created via API (not wizard)
- [ ] Submission has status='pending'
- [ ] Submission has comprehensiveRiskScore field
- [ ] Browser hard-refreshed (Cmd+Shift+R)
- [ ] Phase 2 UI components visible

---

## 🚀 Quick Start (If Nothing Shows)

```bash
# 1. Clean database:
mongosh dive-v3 --eval "db.idp_submissions.deleteMany({})"

# 2. Restart backend:
cd backend && npm run dev

# 3. Restart frontend:
cd frontend && rm -rf .next && npm run dev

# 4. Login and get JWT:
# Browser → http://localhost:3000
# Login → DevTools → localStorage.getItem('jwt')

# 5. Create test submission:
./scripts/test-phase2-ui.sh <JWT_TOKEN>

# 6. View UI:
# Browser → http://localhost:3000/admin/approvals
# Hard refresh (Cmd+Shift+R)
```

**You WILL see Phase 2 UI after following these steps!**

---

## 📝 Summary

**Why UI wasn't showing:**
- Old submissions created before Phase 2
- No comprehensiveRiskScore field in old data
- Conditional rendering hides UI when field missing

**Solution:**
- Create NEW submissions via Phase 2 API
- They will have all Phase 2 fields
- UI will automatically render

**The code is correct - just need fresh data!**

