# DIVE V3 Multi-Location Deployment with Cloudflare Zero Trust

## 🌍 Overview

This guide covers deploying DIVE V3 to multiple locations using Cloudflare Zero Trust tunnels for secure, reliable access. The architecture supports primary/secondary deployments, development environments, and custom locations with intelligent routing and failover.

## 🏗️ Architecture Benefits

### **Multi-Location Advantages**
- **High Availability**: Automatic failover between locations
- **Geographic Distribution**: Reduced latency for global users
- **Disaster Recovery**: Business continuity across locations
- **Development Isolation**: Separate dev/staging/prod environments
- **Load Distribution**: Intelligent traffic routing

### **Cloudflare Zero Trust Benefits**
- **No VPN Required**: Direct secure access to applications
- **DDoS Protection**: Built-in protection at Cloudflare edge
- **Access Policies**: Fine-grained access control
- **Global Network**: 200+ edge locations worldwide
- **SSL/TLS Termination**: Automatic certificate management

## 📋 Prerequisites

### **Cloudflare Account Setup**
1. **Cloudflare Account** with Zero Trust enabled
2. **Domain Management** - `dive25.com` added to Cloudflare
3. **Zero Trust Subscription** (Free tier supports up to 50 users)
4. **API Access** - API token or Global API key

### **Server Requirements (Per Location)**
- **OS**: Linux (Ubuntu 20.04+ recommended)
- **RAM**: 8GB minimum, 16GB recommended
- **CPU**: 4 vCPU minimum
- **Storage**: 100GB SSD
- **Network**: Stable internet connection with public IP
- **Ports**: 443 outbound (for Cloudflare tunnel)

## 🚀 Deployment Guide

### **Step 1: Install Multi-Location Setup**

```bash
# Download the setup script
wget https://raw.githubusercontent.com/your-repo/DIVE-V3/main/scripts/multi-location-tunnel-setup.sh

# Make executable
chmod +x multi-location-tunnel-setup.sh

# Run setup (requires root)
sudo ./multi-location-tunnel-setup.sh
```

The script will prompt for location selection:
- **Primary**: Production primary location (`app.dive25.com`)
- **Secondary**: Production backup location (`backup.dive25.com`)
- **Development**: Development environment (`dev-app.dive25.com`)
- **Custom**: User-defined location and subdomain

### **Step 2: Location-Specific Configuration**

Each location gets its own:
- **Tunnel Name**: `dive-v3-{location}`
- **Config Directory**: `~/.cloudflared/{location}/`
- **Systemd Service**: `cloudflared-{location}`
- **DNS Records**: Location-specific subdomains
- **Log Files**: Separate logging per location

### **Step 3: Service Management**

```bash
# Download the tunnel manager
wget https://raw.githubusercontent.com/your-repo/DIVE-V3/main/scripts/tunnel-manager.sh
chmod +x tunnel-manager.sh

# List all tunnels
./tunnel-manager.sh list

# Start specific location
./tunnel-manager.sh start primary

# Check status
./tunnel-manager.sh status primary

# View logs
./tunnel-manager.sh logs primary

# Health check all locations
./tunnel-manager.sh health
```

## 🔧 Configuration Examples

### **Primary Location (Production)**
```yaml
# ~/.cloudflared/primary/config.yml
tunnel: dive-v3-primary
credentials-file: ~/.cloudflared/primary/{tunnel-id}.json

ingress:
  - hostname: app.dive25.com
    service: https://localhost:3000
  - hostname: api.dive25.com  
    service: https://localhost:4000
  - hostname: auth.dive25.com
    service: https://localhost:8443
  - service: http_status:404
```

### **Secondary Location (DR/Backup)**
```yaml
# ~/.cloudflared/secondary/config.yml
tunnel: dive-v3-secondary
credentials-file: ~/.cloudflared/secondary/{tunnel-id}.json

ingress:
  - hostname: backup.dive25.com
    service: https://localhost:3000
  - hostname: backup-api.dive25.com
    service: https://localhost:4000
  - hostname: backup-auth.dive25.com
    service: https://localhost:8443
  - service: http_status:404
```

### **Development Location**
```yaml
# ~/.cloudflared/development/config.yml
tunnel: dive-v3-development
credentials-file: ~/.cloudflared/development/{tunnel-id}.json

ingress:
  - hostname: dev-app.dive25.com
    service: https://localhost:3000
  - hostname: dev-api.dive25.com
    service: https://localhost:4000
  - hostname: dev-auth.dive25.com
    service: https://localhost:8443
  - service: http_status:404
```

## 🌐 DNS and Routing Strategy

### **Domain Structure**
```
dive25.com (Root Domain)
├── app.dive25.com              → Primary Location
├── backup.dive25.com           → Secondary Location  
├── dev-app.dive25.com          → Development Location
├── api.dive25.com              → Primary API
├── backup-api.dive25.com       → Secondary API
├── dev-api.dive25.com          → Development API
├── auth.dive25.com             → Primary Auth
├── backup-auth.dive25.com      → Secondary Auth
└── dev-auth.dive25.com         → Development Auth
```

### **Intelligent Routing Options**

#### **Option 1: Load Balancer (Recommended)**
```bash
# Create Cloudflare Load Balancer
# Primary pool: app.dive25.com
# Secondary pool: backup.dive25.com
# Health checks on /health endpoint
```

#### **Option 2: DNS Failover**
```bash
# Primary A record: app.dive25.com (Priority 1)
# Secondary A record: backup.dive25.com (Priority 2)
```

#### **Option 3: Geographic Routing**
```bash
# US/Americas: app.dive25.com
# Europe: eu-app.dive25.com
# Asia-Pacific: ap-app.dive25.com
```

## 🔒 Security Configuration

### **Access Policies**
Create Cloudflare Access policies for each environment:

```json
{
  "name": "DIVE V3 Production Access",
  "decision": "allow",
  "include": [
    {
      "email_domain": {
        "domain": "mil"
      }
    },
    {
      "email_domain": {
        "domain": "defense.gov"
      }
    }
  ],
  "applications": [
    "app.dive25.com",
    "backup.dive25.com"
  ]
}
```

### **Zero Trust Network Access (ZTNA)**
```yaml
# Cloudflare WARP client policies
policies:
  - name: "DIVE V3 Access"
    action: "allow"
    traffic: "https://app.dive25.com"
    identity: "authenticated"
    device_posture: "compliant"
```

## 📊 Monitoring and Alerting

### **Health Monitoring**
```bash
# Automated health checks
*/5 * * * * /path/to/tunnel-manager.sh health > /var/log/tunnel-health.log

# Alert on failures
if ! ./tunnel-manager.sh test primary; then
    # Send alert to monitoring system
    curl -X POST webhook_url -d "Primary tunnel down"
fi
```

### **Log Aggregation**
```bash
# Forward logs to centralized logging
journalctl -u cloudflared-primary -f | logger -t "cloudflare-primary"
journalctl -u cloudflared-secondary -f | logger -t "cloudflare-secondary"
```

### **Metrics Collection**
```yaml
# Prometheus metrics endpoint
metrics: 0.0.0.0:9090

# Grafana dashboard for tunnel metrics
- Tunnel status
- Connection latency  
- Request volume
- Error rates
```

## 🔄 Failover and Recovery

### **Automatic Failover**
1. **Health Check Failure**: Primary location becomes unavailable
2. **DNS Update**: Traffic automatically routes to secondary
3. **User Experience**: Seamless transition (30-60 seconds)
4. **Recovery**: Automatic failback when primary recovers

### **Manual Failover**
```bash
# Emergency failover to secondary
./tunnel-manager.sh stop primary
# Update DNS to point to backup.dive25.com

# Failback to primary
./tunnel-manager.sh start primary
# Update DNS to point back to app.dive25.com
```

### **Disaster Recovery**
```bash
# Complete site recovery
1. Deploy DIVE V3 stack to new location
2. Run multi-location setup script
3. Update DNS records
4. Restore database from backup
5. Test all services
```

## 🚀 Best Practices

### **Security Best Practices**
- ✅ **Unique Tunnels**: Separate tunnel per location
- ✅ **Least Privilege**: Minimal access policies
- ✅ **Certificate Validation**: Verify SSL certificates
- ✅ **Access Logging**: Log all access attempts
- ✅ **Regular Updates**: Keep cloudflared updated

### **Performance Best Practices**
- ✅ **Connection Pooling**: Configure keep-alive settings
- ✅ **Compression**: Enable gzip compression
- ✅ **Caching**: Use Cloudflare caching rules
- ✅ **Geographic Routing**: Route to nearest location
- ✅ **Health Checks**: Monitor endpoint health

### **Operational Best Practices**
- ✅ **Automation**: Automated deployment scripts
- ✅ **Monitoring**: Comprehensive health monitoring
- ✅ **Alerting**: Real-time failure notifications
- ✅ **Documentation**: Keep runbooks updated
- ✅ **Testing**: Regular failover testing

## 📋 Troubleshooting

### **Common Issues**

#### **Tunnel Connection Failed**
```bash
# Check tunnel status
./tunnel-manager.sh status primary

# Check logs
./tunnel-manager.sh logs primary

# Test connectivity
./tunnel-manager.sh test primary

# Restart tunnel
./tunnel-manager.sh restart primary
```

#### **DNS Resolution Issues**
```bash
# Check DNS records
dig app.dive25.com
nslookup app.dive25.com

# Clear DNS cache
sudo systemctl flush-dns
```

#### **Certificate Errors**
```bash
# Check certificate validity
openssl s_client -connect app.dive25.com:443 -servername app.dive25.com

# Verify Cloudflare certificate
curl -I https://app.dive25.com
```

### **Log Analysis**
```bash
# Search for errors
journalctl -u cloudflared-primary | grep -i error

# Monitor connection attempts
journalctl -u cloudflared-primary | grep "connection"

# Check performance metrics
journalctl -u cloudflared-primary | grep "latency"
```

## 📈 Scaling Considerations

### **Horizontal Scaling**
- **Multiple Tunnels**: Run multiple tunnels per location
- **Load Balancing**: Distribute across multiple servers
- **Auto Scaling**: Scale based on demand
- **Container Orchestration**: Kubernetes deployment

### **Vertical Scaling**
- **Resource Allocation**: Increase server resources
- **Connection Limits**: Adjust tunnel connection limits
- **Buffer Sizes**: Optimize network buffers
- **Keep-Alive Settings**: Tune connection persistence

## 🎯 Summary

Multi-location deployment with Cloudflare Zero Trust provides:

✅ **High Availability** - Multiple location failover
✅ **Global Performance** - Edge network optimization  
✅ **Security** - Zero Trust network access
✅ **Scalability** - Easy addition of new locations
✅ **Management** - Centralized tunnel management
✅ **Monitoring** - Comprehensive health monitoring

The DIVE V3 system can now be deployed across multiple geographic locations with automatic failover, intelligent routing, and enterprise-grade security through Cloudflare's global network.





