# Phase 3 Quick Start Card

**📍 Start Here**: Read `PHASE-3-CONTINUATION-PROMPT.md` for full instructions

---

## 🎯 Phase 3 Mission: Frontend Configuration (2-3 hours)

Update frontend to support 6 new NATO nations (DEU, GBR, ITA, ESP, POL, NLD)

---

## ✅ Prerequisites (Already Complete)
- Phase 1: Terraform infrastructure deployed (6 new Keycloak realms) ✅
- Phase 2: Backend services updated (clearance mapping, classification) ✅

---

## 🎯 Core Tasks

### 1️⃣ Update Login Config (PRIORITY 1)
**File**: `frontend/public/login-config.json`  
**Action**: Add 5 new nations (DEU, ITA, ESP, POL, NLD)  
**Note**: GBR may already exist

### 2️⃣ Verify NextAuth (PRIORITY 2)
**File**: `frontend/src/app/api/auth/[...nextauth]/route.ts`  
**Action**: Verify Keycloak providers exist for all 10 nations

### 3️⃣ Test Login Routes (PRIORITY 3)
**Action**: Test all 10 login flows in browser  
**URL**: http://localhost:3000/login

---

## 🚀 Quick Start Commands

```bash
# 1. Read current config
cat frontend/public/login-config.json

# 2. Start services
docker-compose up -d

# 3. Start frontend
cd frontend && npm run dev

# 4. Open browser
open http://localhost:3000/login
```

---

## 📋 Nations to Add

| Code | Flag | Name | Realm |
|------|------|------|-------|
| DEU | 🇩🇪 | Germany (Bundeswehr) | dive-v3-deu |
| ITA | 🇮🇹 | Italy (Ministero della Difesa) | dive-v3-ita |
| ESP | 🇪🇸 | Spain (Ministerio de Defensa) | dive-v3-esp |
| POL | 🇵🇱 | Poland (Ministerstwo Obrony) | dive-v3-pol |
| NLD | 🇳🇱 | Netherlands (Ministerie) | dive-v3-nld |

**Note**: GBR (🇬🇧 UK) may already exist from Phase 2

---

## ✅ Success Criteria

- [ ] 10 nation cards displayed on `/login` page
- [ ] All `/login/{nation}` routes work
- [ ] Keycloak redirects correct for all realms
- [ ] No errors in console or terminal
- [ ] TypeScript compiles successfully

---

## 📚 Key Files

1. `frontend/public/login-config.json` - Main config file
2. `frontend/src/app/api/auth/[...nextauth]/route.ts` - Auth providers
3. `frontend/src/app/login/page.tsx` - Login page
4. `frontend/src/app/login/[nation]/page.tsx` - Dynamic routes

---

## 🔗 Full Documentation

👉 **`PHASE-3-CONTINUATION-PROMPT.md`** - Complete instructions with examples

---

## 🎉 Phase 3 Complete When...

- ✅ All 10 nations in `login-config.json`
- ✅ All 10 login routes tested
- ✅ No errors or warnings
- ✅ `NATO-EXPANSION-PHASE3-COMPLETE.md` created

---

**Time Estimate**: 2-3 hours  
**Difficulty**: Easy (mostly configuration)  
**Status**: Ready to start 🚀

