# DIVE V3 Environment Workflows

## 🚀 Definitive Localhost vs Dev (Cloudflare) Environment Switching

### **Current Issue Summary**
- **Problem**: Frontend redirects to `dev-auth.dive25.com` instead of `localhost:8443`
- **Root Cause**: Keycloak `KC_HOSTNAME` was set to Cloudflare tunnel domain
- **Solution**: Update Keycloak to use `localhost` for local development

### **Environment Configuration Matrix**

| Component | Localhost Mode | Cloudflare Tunnel Mode |
|-----------|----------------|----------------------|
| **Frontend URLs** | `NEXT_PUBLIC_KEYCLOAK_URL=https://localhost:8443` | `NEXT_PUBLIC_KEYCLOAK_URL=https://dev-auth.dive25.com` |
| **Keycloak Hostname** | `KC_HOSTNAME=localhost` | `KC_HOSTNAME=dev-auth.dive25.com` |
| **NextAuth URL** | `NEXTAUTH_URL=https://localhost:3000` | `NEXTAUTH_URL=https://dev-app.dive25.com` |
| **Backend Base URL** | `NEXT_PUBLIC_BASE_URL=https://localhost:4000` | `NEXT_PUBLIC_BASE_URL=https://dev-api.dive25.com` |

### **🔄 Automated Environment Switching**

Use the provided script for reliable switching:

```bash
# Switch to localhost mode
./scripts/switch-dev-mode.sh localhost

# Switch to Cloudflare tunnel mode
./scripts/switch-dev-mode.sh tunnel
```

**What the script does:**
1. Updates `docker-compose.yml` environment variables
2. Updates `frontend/.env.local` public URLs
3. Rebuilds and restarts affected containers
4. Clears browser cache artifacts

### **Manual Environment Switching Steps**

#### **Switch to Localhost Mode:**

1. **Update docker-compose.yml:**
```yaml
# Frontend service
NEXT_PUBLIC_KEYCLOAK_URL: https://localhost:8443
NEXTAUTH_URL: https://localhost:3000

# Keycloak service
KC_HOSTNAME: localhost
```

2. **Update frontend/.env.local:**
```env
NEXT_PUBLIC_KEYCLOAK_URL=https://localhost:8443
NEXTAUTH_URL=https://localhost:3000
```

3. **Rebuild containers:**
```bash
docker-compose up -d --build frontend keycloak
```

#### **Switch to Cloudflare Tunnel Mode:**

1. **Update docker-compose.yml:**
```yaml
# Frontend service
NEXT_PUBLIC_KEYCLOAK_URL: https://dev-auth.dive25.com
NEXTAUTH_URL: https://dev-app.dive25.com

# Keycloak service
KC_HOSTNAME: dev-auth.dive25.com
```

2. **Update frontend/.env.local:**
```env
NEXT_PUBLIC_KEYCLOAK_URL=https://dev-auth.dive25.com
NEXTAUTH_URL=https://dev-app.dive25.com
```

3. **Rebuild containers:**
```bash
docker-compose up -d --build frontend keycloak
```

### **🔍 Troubleshooting Environment Issues**

#### **Symptom: Still redirecting to wrong domain**

**Check these in order:**
1. **Frontend container env vars:**
```bash
docker-compose exec frontend env | grep NEXT_PUBLIC_KEYCLOAK_URL
# Should show: https://localhost:8443 (or dev-auth.dive25.com)
```

2. **Keycloak hostname:**
```bash
docker-compose exec keycloak env | grep KC_HOSTNAME
# Should show: localhost (or dev-auth.dive25.com)
```

3. **Browser cache:**
```bash
# Hard refresh: Ctrl+F5 or Cmd+Shift+R
# Or open incognito window
```

4. **Container rebuild required:**
```bash
# If env vars are correct but still wrong, rebuild:
docker-compose up -d --build frontend keycloak
```

#### **Symptom: Keycloak OIDC endpoints not working**

**Check:**
1. **Realm exists:**
```bash
curl -k https://localhost:8443/admin/realms -H "Authorization: Bearer $(get-admin-token)" | jq '.[].realm'
```

2. **OIDC discovery:**
```bash
curl -k https://localhost:8443/realms/dive-v3-broker/.well-known/openid-connect-configuration
```

3. **Keycloak logs:**
```bash
docker-compose logs keycloak | tail -50
```

### **📋 Environment Verification Checklist**

**For Localhost Mode:**
- [ ] `docker-compose exec frontend env | grep NEXT_PUBLIC_KEYCLOAK_URL` → `https://localhost:8443`
- [ ] `docker-compose exec keycloak env | grep KC_HOSTNAME` → `localhost`
- [ ] Browser shows `https://localhost:3000` in address bar
- [ ] Clicking IdP redirects to `https://localhost:8443/...`
- [ ] Keycloak admin accessible at `https://localhost:8443/admin`

**For Cloudflare Tunnel Mode:**
- [ ] `docker-compose exec frontend env | grep NEXT_PUBLIC_KEYCLOAK_URL` → `https://dev-auth.dive25.com`
- [ ] `docker-compose exec keycloak env | grep KC_HOSTNAME` → `dev-auth.dive25.com`
- [ ] Browser shows `https://dev-app.dive25.com` in address bar
- [ ] Clicking IdP redirects to `https://dev-auth.dive25.com/...`
- [ ] Keycloak admin accessible at `https://dev-auth.dive25.com/admin`

### **🔧 Keycloak Realm Management**

**Re-apply Terraform (if realms are missing):**
```bash
cd terraform
terraform apply -auto-approve
```

**Check IdP count:**
```bash
curl -k https://localhost:4000/api/idps/public | jq '.total'
# Should return: 11
```

### **🚨 Common Pitfalls**

1. **Browser caching**: Always hard refresh after environment changes
2. **Container not rebuilt**: Environment variables are baked into images
3. **Keycloak hostname**: Must match the environment you're targeting
4. **NextAuth URLs**: Must match the public URLs your browser sees
5. **CORS issues**: Backend CORS must allow both localhost and tunnel domains

### **🎯 Quick Environment Switch Commands**

```bash
# Localhost development
./scripts/switch-dev-mode.sh localhost

# Cloudflare tunnel for external access
./scripts/switch-dev-mode.sh tunnel

# Verify current configuration
docker-compose exec frontend env | grep -E "(KEYCLOAK|NEXTAUTH)"
docker-compose exec keycloak env | grep KC_HOSTNAME
```

### **📝 Environment Change Log**

- **2025-11-22**: Fixed Keycloak hostname from `dev-auth.dive25.com` to `localhost` for local development
- **2025-11-22**: Created automated switching script `./scripts/switch-dev-mode.sh`
- **2025-11-22**: Documented definitive workflows for environment switching

---

**🎉 Result**: Seamless switching between local development and external access without configuration conflicts!

