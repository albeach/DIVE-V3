# Auth0 Integration Quick Start 🚀

**Get Auth0 IdP onboarding working in 2 minutes!**

---

## 🎯 The Issue

You're seeing this error:
```
Auth0 integration failed: Auth0 MCP integration is not enabled or configured.
```

**Cause**: Environment variables for Auth0 aren't set yet.

---

## ✅ Quick Fix (Demo Mode)

### Option 1: Automated Setup (Recommended)

Run the setup script:

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Run setup script
./scripts/setup-auth0-demo.sh

# Restart services
docker-compose restart backend frontend
```

**Done!** ✅ Auth0 integration is now enabled in demo mode.

---

### Option 2: Manual Setup

If the script doesn't work, configure manually:

**Backend** (`backend/.env`):
```bash
# Add these lines to backend/.env
AUTH0_DOMAIN=demo.auth0.com
AUTH0_MCP_ENABLED=true
```

**Frontend** (`frontend/.env.local`):
```bash
# Add these lines to frontend/.env.local
NEXT_PUBLIC_AUTH0_DOMAIN=demo.auth0.com
NEXT_PUBLIC_AUTH0_MCP_ENABLED=true
```

**Restart**:
```bash
docker-compose restart backend frontend
```

---

## 🧪 Test It

1. **Navigate to**: http://localhost:3000/admin/idp/new
2. **Select**: OIDC protocol
3. **Check**: ✅ "Also create in Auth0"
4. **Fill in**:
   - Alias: `test-auth0-demo`
   - Display Name: `Test Auth0 Demo`
5. **Click Next** through steps (Step 3 auto-populated!)
6. **Submit for Approval**

**Expected Result**: 
```
✅ Identity Provider Created Successfully!
🔵 Auth0 Application Created

Client ID: auth0_1729012345_abc123xyz
Client Secret: secret_xyz789abc...
```

---

## 📊 What's Happening?

**Demo Mode**:
- Uses **mock responses** (no real Auth0 API)
- Generates fake `client_id` and `client_secret`
- Perfect for testing the UI/UX flow
- Shows you exactly what users will see

**Why Demo Mode?**:
- The actual Auth0 MCP Server isn't connected yet
- Mock responses let you test the full workflow
- When you connect real Auth0 MCP, replace mock code

---

## 🔧 Troubleshooting

### Error: "ENOENT: no such file or directory"

**Fix**: Files don't exist yet
```bash
# Create missing files
touch backend/.env
touch frontend/.env.local

# Run setup again
./scripts/setup-auth0-demo.sh
```

### Error: Still shows "not enabled"

**Check**:
1. Environment files have the variables:
   ```bash
   # Check backend
   cat backend/.env | grep AUTH0
   
   # Check frontend
   cat frontend/.env.local | grep AUTH0
   ```

2. Services were restarted:
   ```bash
   docker-compose restart backend frontend
   
   # Verify they're running
   docker-compose ps
   ```

3. Clear browser cache and reload

### Error: "Permission denied" on script

**Fix**:
```bash
chmod +x scripts/setup-auth0-demo.sh
./scripts/setup-auth0-demo.sh
```

---

## 🚀 Production Setup (Real Auth0)

When you're ready to use real Auth0 MCP Server:

1. **Get Auth0 Tenant**:
   - Sign up at https://auth0.com
   - Note your domain (e.g., `your-company.auth0.com`)

2. **Update Environment Variables**:
   ```bash
   # backend/.env
   AUTH0_DOMAIN=your-company.auth0.com
   AUTH0_MCP_ENABLED=true
   
   # frontend/.env.local
   NEXT_PUBLIC_AUTH0_DOMAIN=your-company.auth0.com
   NEXT_PUBLIC_AUTH0_MCP_ENABLED=true
   ```

3. **Connect Auth0 MCP Server**:
   - Verify Auth0 MCP Server is running
   - Check MCP tools are accessible
   - Test: Call `mcp_Auth0_auth0_list_applications`

4. **Replace Mock Code**:
   - File: `backend/src/controllers/admin.controller.ts`
   - Line: ~731 (search for "MOCK RESPONSE")
   - Replace with:
     ```typescript
     const result = await mcp_Auth0_auth0_create_application({
         name,
         description,
         app_type,
         oidc_conformant,
         callbacks,
         allowed_logout_urls,
         allowed_origins
     });
     
     const clientId = result.client_id;
     const clientSecret = result.client_secret;
     ```

5. **Restart and Test**:
   ```bash
   docker-compose restart backend
   # Test creating an IdP - should create real Auth0 app!
   ```

---

## 📖 Documentation

- **Full Guide**: `docs/ADDING-NEW-IDP-GUIDE.md` (Auth0 Integration section)
- **Implementation**: `notes/WEEK3.4.6-AUTH0-MCP-COMPLETE.md`
- **Enhancement**: `notes/WEEK3.4.6-AUTO-POPULATE-ENHANCEMENT.md`

---

## ✅ Success Checklist

- [ ] Environment variables set (backend + frontend)
- [ ] Services restarted
- [ ] Can see Auth0 checkbox in IdP wizard
- [ ] Step 3 auto-populates when Auth0 checked
- [ ] Can submit IdP and see mock credentials
- [ ] Success page shows Client ID and Secret

**All checked?** 🎉 You're ready to onboard IdPs with Auth0!

---

## 💡 Tips

1. **Demo Mode is Perfect For**:
   - Testing UI/UX
   - Training administrators
   - Demos and presentations
   - Week 4 pilot demonstrations

2. **Time Savings**:
   - Manual IdP: 15-30 minutes
   - With Auth0: 2-3 minutes
   - That's **90% faster!** ⚡

3. **Professional Setup**:
   - Auto-populated fields
   - Read-only UI
   - Clear visual feedback
   - Instant credential generation

---

**Need Help?** Check the troubleshooting section above or review the full documentation.

**Ready to Test?** Run `./scripts/setup-auth0-demo.sh` and restart services! 🚀

