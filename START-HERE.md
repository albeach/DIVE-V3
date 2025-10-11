# 🚀 START HERE - DIVE V3 Setup

**Quick setup for Week 1 testing**

## Step 1: Start Infrastructure Services

```bash
./scripts/dev-start.sh
```

This starts:
- ✅ Keycloak (IdP broker)
- ✅ PostgreSQL (sessions)
- ✅ MongoDB (resources)
- ✅ OPA (policy engine)

**Wait time:** ~2-3 minutes

## Step 2: Install Dependencies

Open **two new terminal windows**:

### Terminal 1 - Backend

```bash
cd backend
npm install
npm run seed-database  # Seed MongoDB with resources
npm run dev           # Start backend on :4000
```

### Terminal 2 - Frontend

```bash
cd frontend
npm install
npm run dev  # Start Next.js on :3000
```

## Step 3: Test Authentication

1. **Open browser:** http://localhost:3000
2. **Click:** "U.S. DoD" button
3. **Login:** 
   - Username: `testuser-us`
   - Password: `Password123!`
4. **Verify:** Dashboard shows SECRET clearance, USA country

## ✅ Success Criteria

- [ ] Keycloak admin accessible: http://localhost:8081/admin (admin/admin)
- [ ] Frontend loads: http://localhost:3000
- [ ] Backend responds: http://localhost:4000/health
- [ ] Can login with testuser-us
- [ ] Dashboard shows clearance: SECRET, country: USA
- [ ] Can view resources: http://localhost:4000/api/resources

## ❌ Troubleshooting

### "npm install" errors

```bash
# Make sure you're using Node 20+
node --version

# Clear cache and retry
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Keycloak not starting

```bash
# Check if port 8081 is in use
lsof -i :8081

# View logs
docker logs dive-v3-keycloak

# Restart
docker-compose -f docker-compose.dev.yml restart keycloak
```

### MongoDB connection errors

```bash
# Verify MongoDB is running
docker ps | grep mongo

# Test connection
docker exec -it dive-v3-mongo mongosh -u admin -p password

# Check if seeded
use dive-v3
db.resources.count()  // Should be 8
```

## 📚 Next Steps

Once authenticated successfully:

1. **Review your attributes** on the dashboard
2. **Browse resources** (Week 2: will add authorization)
3. **Check logs** to see authentication flow
4. **Read implementation plan** for Week 2 tasks

## 🔧 Useful Commands

```bash
# View all running containers
docker ps

# Stop infrastructure
docker-compose -f docker-compose.dev.yml down

# Full reset
docker-compose -f docker-compose.dev.yml down -v
./scripts/dev-start.sh

# View Keycloak config
cd terraform && terraform output

# Re-seed database
cd backend && npm run seed-database
```

## 📖 Documentation

- **Quick Reference:** [QUICK-REFERENCE.md](QUICK-REFERENCE.md)
- **Getting Started:** [GETTING-STARTED.md](GETTING-STARTED.md)
- **Implementation Plan:** [dive-v3-implementation-plan.md](dive-v3-implementation-plan.md)

---

**Questions?** Check [GETTING-STARTED.md](GETTING-STARTED.md) for detailed troubleshooting.

