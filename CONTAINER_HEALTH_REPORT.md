# Container Health & Accessibility Report

**Date**: December 2, 2025

## Container Status

### Running Containers
$(docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}")

## Port Accessibility

### Frontend Ports
- Port 3000 (USA): $(curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 2 https://localhost:3000 2>/dev/null || echo "FAIL")
- Port 3001 (FRA): $(curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 2 https://localhost:3001 2>/dev/null || echo "FAIL")
- Port 3002 (GBR): $(curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 2 https://localhost:3002 2>/dev/null || echo "FAIL")

### Backend Ports
- Port 4000 (USA): $(curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 2 https://localhost:4000/health 2>/dev/null || echo "FAIL")
- Port 4001 (FRA): $(curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 2 https://localhost:4001/health 2>/dev/null || echo "FAIL")
- Port 4002 (GBR): $(curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 2 https://localhost:4002/health 2>/dev/null || echo "FAIL")

### Keycloak Ports
- Port 8081 (USA HTTP): $(curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://localhost:8081 2>/dev/null || echo "FAIL")
- Port 8443 (USA HTTPS): $(curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 2 https://localhost:8443 2>/dev/null || echo "FAIL")
- Port 8082 (FRA HTTP): $(curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://localhost:8082 2>/dev/null || echo "FAIL")
- Port 8444 (FRA HTTPS): $(curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 2 https://localhost:8444 2>/dev/null || echo "FAIL")
- Port 8084 (GBR HTTP): $(curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://localhost:8084 2>/dev/null || echo "FAIL")
- Port 8445 (GBR HTTPS): $(curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 2 https://localhost:8445 2>/dev/null || echo "FAIL")

## OTP Generator Status

- Location: `frontend/public/otp-generator.html`
- CDN Dependency: REMOVED ✅
- Local Implementation: ✅ Uses Web Crypto API
- Accessible: $(curl -k -s https://localhost:3000/otp-generator.html | grep -q "generateTOTP" && echo "YES" || echo "NO")



