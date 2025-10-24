# IdP Management Revamp - Deployment Guide

**Quick Start**: 5 minutes to deployed  
**Prerequisites**: Node.js 20+, npm 10+, Docker Compose running

---

## 🚀 Quick Deployment (5 Steps)

### Step 1: Install Dependencies (2 minutes)

```bash
# Frontend dependencies
cd frontend
npm install framer-motion@^11.0.0 date-fns@^3.0.0 @tanstack/react-query@^5.0.0 cmdk@^1.0.0 fuse.js@^7.0.0

# Backend dependencies
cd ../backend
npm install multer@^1.4.5-lts.1 @types/multer --save-dev
```

### Step 2: Run Database Migration (30 seconds)

```bash
cd backend
npx ts-node src/scripts/migrate-idp-themes.ts
```

Expected output:
```
🔄 Starting IdP themes migration...
✅ Connected to MongoDB
✅ Created indexes
✅ Created theme for usa-realm-broker
✅ Created theme for fra-realm-broker
✅ Created theme for can-realm-broker
✅ Created theme for industry-realm-broker

🎉 Migration complete!
   - Inserted: 4 theme(s)
   - Total: 4 theme(s)
```

### Step 3: Build Applications (1 minute)

```bash
# Backend
cd backend
npm run build

# Frontend
cd ../frontend
npm run build
```

### Step 4: Start Services (30 seconds)

```bash
# From project root
./scripts/dev-start.sh

# Or manually:
docker-compose up -d keycloak mongodb opa
cd backend && npm run dev &
cd frontend && npm run dev &
```

### Step 5: Verify Deployment (1 minute)

```bash
# Check backend health
curl http://localhost:4000/health
# Expected: {"status":"ok",...}

# Check frontend
curl http://localhost:3000
# Expected: HTML response

# Open in browser
open http://localhost:3000/admin/idp
```

---

## ✅ Verification Checklist

### Frontend Verification
- [ ] Navigate to http://localhost:3000/admin/idp
- [ ] See modern glassmorphism IdP cards (not old basic cards)
- [ ] See stats bar with animated counters above cards
- [ ] Press **Cmd+K** - Command palette should open
- [ ] Click language toggle (top-right) - Should switch 🇺🇸 ↔ 🇫🇷
- [ ] Click "View Details" on any IdP - Modal with 5 tabs should open
- [ ] Navigate to "Sessions" tab - Should see session table
- [ ] Navigate to "MFA" tab - Should see toggle switches
- [ ] Navigate to "Theme" tab - Should see color pickers
- [ ] Visit http://localhost:3000/login/usa-realm-broker - Custom themed login page

### Backend Verification
- [ ] GET http://localhost:4000/api/admin/idps/:alias/mfa-config (200 OK)
- [ ] GET http://localhost:4000/api/admin/idps/:alias/sessions (200 OK)
- [ ] GET http://localhost:4000/api/admin/idps/:alias/theme (200 OK with theme data)
- [ ] Check MongoDB: `use dive-v3; db.idp_themes.find()` (should show 4 themes)
- [ ] Check logs: `docker-compose logs backend | grep "themes collection initialized"`

### Database Verification
```bash
# Connect to MongoDB
docker exec -it dive-v3-mongodb mongosh

# Switch to database
use dive-v3

# Check idp_themes collection
db.idp_themes.countDocuments()
# Expected: 4

db.idp_themes.find({}, { idpAlias: 1, enabled: 1, "colors.primary": 1 })
# Expected: USA (#B22234), France (#0055A4), Canada (#FF0000), Industry (#6B46C1)
```

---

## 🔧 Troubleshooting

### Issue: npm install fails

**Error**: `Cannot find module 'framer-motion'`

**Solution**:
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm install framer-motion date-fns @tanstack/react-query cmdk fuse.js
npm run build
```

### Issue: Migration fails

**Error**: `MongoServerError: E11000 duplicate key error`

**Solution**: Themes already exist, this is normal. Migration is idempotent.

To force re-migration:
```bash
docker exec -it dive-v3-mongodb mongosh
use dive-v3
db.idp_themes.drop()
exit

npx ts-node backend/src/scripts/migrate-idp-themes.ts
```

### Issue: TypeScript compilation errors

**Error**: `Cannot find module '@tanstack/react-query'`

**Solution**: Dependencies not installed. See Step 1.

### Issue: Page shows old UI

**Solution**:
1. Hard refresh browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. Clear browser cache
3. Check you're on `/admin/idp` not `/admin/idp/old`
4. Verify `page-revamp.tsx` was created correctly

### Issue: Command palette (Cmd+K) doesn't work

**Solution**:
1. Verify `IdPManagementProvider` wraps the page
2. Check browser console for errors
3. Try Ctrl+K instead (Windows)
4. Ensure JavaScript enabled
5. Check for keyboard shortcut conflicts

### Issue: Themes not loading

**Solution**:
1. Verify migration ran successfully
2. Check MongoDB connection: `docker ps | grep mongodb`
3. Check backend logs: `docker-compose logs backend | grep theme`
4. Verify API endpoint: `curl http://localhost:4000/api/admin/idps/usa-realm-broker/theme`

---

## 📦 Production Deployment

### Pre-Production Checklist
- [ ] All dependencies installed
- [ ] Database migration run successfully
- [ ] TypeScript compiles (0 errors)
- [ ] Environment variables set (`.env.production`)
- [ ] Keycloak Direct Access Grants enabled for internal IdPs only
- [ ] Rate limiting configured (5 attempts/15min)
- [ ] CORS configured for production domain
- [ ] SSL/TLS certificates installed
- [ ] CDN configured for theme assets (optional: S3 + CloudFront)
- [ ] Monitoring alerts configured

### Environment Variables

**Frontend** (`.env.production`):
```bash
NEXT_PUBLIC_BACKEND_URL=https://api.dive-v3.mil
NEXT_PUBLIC_KEYCLOAK_URL=https://keycloak.dive-v3.mil
```

**Backend** (`.env.production`):
```bash
NODE_ENV=production
PORT=4000
KEYCLOAK_URL=https://keycloak.dive-v3.mil
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=<secure-password>
MONGODB_URL=mongodb://mongo-prod:27017
MONGODB_DATABASE=dive-v3
```

### Build for Production

```bash
# Frontend
cd frontend
npm run build
npm start

# Backend
cd backend
npm run build
NODE_ENV=production node dist/server.js
```

### Docker Deployment

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Run migration
docker exec dive-v3-backend npx ts-node src/scripts/migrate-idp-themes.ts

# Verify
docker-compose -f docker-compose.prod.yml ps
```

---

## 🎯 Post-Deployment

### Smoke Tests
```bash
# Test API health
curl https://api.dive-v3.mil/health

# Test IdP list
curl -H "Authorization: Bearer $TOKEN" https://api.dive-v3.mil/api/admin/idps

# Test theme endpoint
curl -H "Authorization: Bearer $TOKEN" https://api.dive-v3.mil/api/admin/idps/usa-realm-broker/theme

# Test custom login page
curl https://dive-v3.mil/login/usa-realm-broker
```

### Monitoring
- **Logs**: `docker-compose logs -f backend | grep -E "theme|mfa|session"`
- **Metrics**: http://localhost:4000/api/admin/metrics
- **Performance**: Use Lighthouse for Core Web Vitals
- **Errors**: Monitor error rate in application logs

### User Acceptance Testing
1. Invite 2-3 admin users to test
2. Walk through User Guide scenarios
3. Collect feedback on UX
4. Monitor for errors in first 24 hours
5. Address high-priority issues immediately

---

## 🔄 Rollback Plan

If issues arise:

### Quick Rollback
```bash
# Stop new services
docker-compose down

# Revert to previous commit
git log --oneline | head -5
git checkout <previous-commit-hash>

# Rebuild and restart
docker-compose up -d --build
```

### Partial Rollback (Keep Backend, Revert Frontend)
```bash
# Just use old IdP management page
# Rename page-revamp.tsx to page.tsx.new
# Keep original page.tsx active
mv frontend/src/app/admin/idp/page-revamp.tsx frontend/src/app/admin/idp/page.tsx.revamp-backup
# Original page.tsx remains active
```

### Data Rollback (Remove Themes)
```bash
docker exec -it dive-v3-mongodb mongosh
use dive-v3
db.idp_themes.drop()
```

---

## 📞 Support

**Issues?**
- Check troubleshooting section above
- Review `docs/IDP-MANAGEMENT-USER-GUIDE.md`
- File GitHub issue with:
  - Error message
  - Browser console output
  - Backend logs (`docker-compose logs backend`)
  - Steps to reproduce

**Success?**
- Share feedback in #dive-v3-feedback
- Report bugs in GitHub Issues
- Request features in GitHub Discussions

---

## 🎉 You're Done!

The IdP Management Revamp is now deployed. Users can:
- ✅ Configure MFA via beautiful UI
- ✅ View and manage active sessions
- ✅ Customize login page themes
- ✅ Switch between English and French
- ✅ Use command palette (Cmd+K) for navigation
- ✅ Enjoy modern 2025 design with glassmorphism

**Enjoy your upgraded IdP Management experience!** 🚀

