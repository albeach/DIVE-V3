# 🌐 Browser Access - DIVE V3 Instances

**Simple Guide:** Open these URLs in your browser right now!

---

## ✅ Port Forwards Are Running!

The script has started port forwarding. You can now access:

---

## 🇺🇸 USA Instance (United States)

### Frontend (Main Web App)
**👉 Open in browser:** http://localhost:3000

### Backend API (Health Check)
**👉 Open in browser:** http://localhost:4000/health
*(Should show: `{"status":"healthy",...}`)*

### Keycloak Admin Console
**👉 Open in browser:** http://localhost:8081/admin
- **Username:** `admin`
- **Password:** Get from GCP Secret Manager: `dive-v3-keycloak-usa`

---

## 🇫🇷 FRA Instance (France)

### Frontend (Main Web App)
**👉 Open in browser:** http://localhost:3001

### Backend API (Health Check)
**👉 Open in browser:** http://localhost:4001/health

### Keycloak Admin Console
**👉 Open in browser:** https://localhost:8444/admin
*(Browser will warn about self-signed certificate - click "Advanced" → "Proceed")*
- **Username:** `admin`
- **Password:** Get from GCP Secret Manager: `dive-v3-keycloak-fra`

---

## 🇬🇧 GBR Instance (United Kingdom)

### Frontend (Main Web App)
**👉 Open in browser:** http://localhost:3002

### Backend API (Health Check)
**👉 Open in browser:** http://localhost:4002/health

### Keycloak Admin Console
**👉 Open in browser:** https://localhost:8445/admin
*(Accept self-signed certificate warning)*
- **Username:** `admin`
- **Password:** Get from GCP Secret Manager: `dive-v3-keycloak-gbr`

---

## 🇩🇪 DEU Instance (Germany)

### Frontend (Main Web App)
**👉 Open in browser:** http://localhost:3003

### Backend API (Health Check)
**👉 Open in browser:** http://localhost:4003/health

### Keycloak Admin Console
**👉 Open in browser:** https://localhost:8446/admin
*(Accept self-signed certificate warning)*
- **Username:** `admin`
- **Password:** Get from GCP Secret Manager: `dive-v3-keycloak-deu`

---

## 🚀 Quick Start

1. **Start port forwards** (if not already running):
   ```bash
   ./scripts/start-port-forwards.sh
   ```

2. **Open your browser** and go to:
   - USA: http://localhost:3000
   - FRA: http://localhost:3001
   - GBR: http://localhost:3002
   - DEU: http://localhost:3003

3. **Keep the terminal open** - port forwards stop when you close it

---

## 🛑 To Stop Port Forwards

```bash
./scripts/stop-port-forwards.sh
```

Or just close the terminal window.

---

## 📝 Notes

- **Frontend may not be ready yet** - The USA frontend is currently crashing (needs image rebuild)
- **Backend APIs should work** - Try the `/health` endpoints
- **Keycloak Admin** - You can access the admin console for each instance
- **HTTPS warnings** - New instances use HTTPS, browser will warn about self-signed certs (safe to accept for local testing)

---

**Last Updated:** December 4, 2025


