# High Availability Setup for External IdPs

This guide provides configuration for running Spain SAML and USA OIDC IdPs in high availability mode.

## Architecture Overview

```
┌────────────────────────────────────────────────┐
│           Load Balancer (HAProxy)               │
│         spain-idp.example.com (VIP)             │
│         usa-idp.example.com (VIP)               │
└────────┬──────────────────────┬─────────────────┘
         │                      │
    ┌────▼─────┐          ┌────▼──────┐
    │ Spain-1  │          │  Spain-2   │
    │ Primary  │◄────────►│  Secondary │
    └──────────┘          └────────────┘
         │                      │
    ┌────▼──────────────────────▼────┐
    │   Shared Certificate Storage   │
    │   (NFS/EFS/GlusterFS)          │
    └────────────────────────────────┘
```

## Prerequisites

- Multiple hosts/VMs (minimum 2 per IdP)
- Load balancer (HAProxy, NGINX, or cloud LB)
- Shared storage for certificates and session data
- Coordinated certificate management

## Spain SAML HA Configuration

### Multi-Node Deployment

```yaml
# external-idps/docker-compose.ha.yml
version: '3.8'

services:
  spain-saml-1:
    image: venatorfox/simplesamlphp:v2.3.1
    hostname: spain-saml-1
    environment:
      SIMPLESAMLPHP_SESSION_STORAGE: memcache
      SIMPLESAMLPHP_MEMCACHE_SERVERS: memcached:11211
    volumes:
      - shared-config:/var/simplesamlphp/config:ro
      - shared-cert:/var/simplesamlphp/cert:ro
      - shared-metadata:/var/simplesamlphp/metadata:ro
    networks:
      - dive-external-idps

  spain-saml-2:
    image: venatorfox/simplesamlphp:v2.3.1
    hostname: spain-saml-2
    environment:
      SIMPLESAMLPHP_SESSION_STORAGE: memcache
      SIMPLESAMLPHP_MEMCACHE_SERVERS: memcached:11211
    volumes:
      - shared-config:/var/simplesamlphp/config:ro
      - shared-cert:/var/simplesamlphp/cert:ro
      - shared-metadata:/var/simplesamlphp/metadata:ro
    networks:
      - dive-external-idps

  memcached:
    image: memcached:alpine
    command: ["-m", "256"]
    networks:
      - dive-external-idps

volumes:
  shared-config:
    driver: local
    driver_opts:
      type: nfs
      o: addr=nfs-server,rw
      device: ":/export/spain-saml/config"
  shared-cert:
    driver: local
    driver_opts:
      type: nfs
      o: addr=nfs-server,rw
      device: ":/export/spain-saml/cert"
  shared-metadata:
    driver: local
    driver_opts:
      type: nfs
      o: addr=nfs-server,rw
      device: ":/export/spain-saml/metadata"

networks:
  dive-external-idps:
    driver: bridge
```

### HAProxy Load Balancer

```bash
# haproxy.cfg for Spain SAML
global
    log /dev/log local0
    maxconn 4096
    daemon

defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    timeout connect 5000
    timeout client  50000
    timeout server  50000

frontend spain_saml_frontend
    bind *:8443 ssl crt /etc/haproxy/certs/spain-idp.pem
    mode http
    option forwardfor
    default_backend spain_saml_backend

backend spain_saml_backend
    mode http
    balance roundrobin
    option httpchk GET /simplesaml/module.php/core/frontpage_federation.php
    http-check expect status 200
    server spain-saml-1 spain-saml-1:8443 check ssl verify none
    server spain-saml-2 spain-saml-2:8443 check ssl verify none
```

## USA OIDC HA Configuration

### Keycloak Cluster

```yaml
# external-idps/docker-compose.ha.yml (USA OIDC section)
services:
  usa-postgres-primary:
    image: bitnami/postgresql-repmgr:15
    environment:
      POSTGRESQL_POSTGRES_PASSWORD: ${PG_PASSWORD}
      POSTGRESQL_USERNAME: keycloak
      POSTGRESQL_PASSWORD: ${KC_DB_PASSWORD}
      POSTGRESQL_DATABASE: keycloak
      REPMGR_PASSWORD: ${REPMGR_PASSWORD}
      REPMGR_PRIMARY_HOST: usa-postgres-primary
      REPMGR_PARTNER_NODES: usa-postgres-primary,usa-postgres-standby
      REPMGR_NODE_NAME: usa-postgres-primary
      REPMGR_NODE_NETWORK_NAME: usa-postgres-primary
    volumes:
      - postgres-primary-data:/bitnami/postgresql
    networks:
      - dive-external-idps

  usa-postgres-standby:
    image: bitnami/postgresql-repmgr:15
    environment:
      POSTGRESQL_POSTGRES_PASSWORD: ${PG_PASSWORD}
      POSTGRESQL_USERNAME: keycloak
      POSTGRESQL_PASSWORD: ${KC_DB_PASSWORD}
      POSTGRESQL_DATABASE: keycloak
      REPMGR_PASSWORD: ${REPMGR_PASSWORD}
      REPMGR_PRIMARY_HOST: usa-postgres-primary
      REPMGR_PARTNER_NODES: usa-postgres-primary,usa-postgres-standby
      REPMGR_NODE_NAME: usa-postgres-standby
      REPMGR_NODE_NETWORK_NAME: usa-postgres-standby
    volumes:
      - postgres-standby-data:/bitnami/postgresql
    networks:
      - dive-external-idps

  usa-oidc-1:
    image: quay.io/keycloak/keycloak:26.0.0
    hostname: usa-oidc-1
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://usa-postgres-primary:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: ${KC_DB_PASSWORD}
      KC_CACHE: ispn
      KC_CACHE_STACK: kubernetes
      JAVA_OPTS_APPEND: -Djgroups.dns.query=usa-oidc-headless
    networks:
      - dive-external-idps
    depends_on:
      - usa-postgres-primary

  usa-oidc-2:
    image: quay.io/keycloak/keycloak:26.0.0
    hostname: usa-oidc-2
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://usa-postgres-primary:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: ${KC_DB_PASSWORD}
      KC_CACHE: ispn
      KC_CACHE_STACK: kubernetes
      JAVA_OPTS_APPEND: -Djgroups.dns.query=usa-oidc-headless
    networks:
      - dive-external-idps
    depends_on:
      - usa-postgres-primary

volumes:
  postgres-primary-data:
  postgres-standby-data:
```

### NGINX Load Balancer for OIDC

```nginx
# nginx.conf for USA OIDC
upstream usa_oidc_backend {
    least_conn;
    
    server usa-oidc-1:8080 max_fails=3 fail_timeout=30s;
    server usa-oidc-2:8080 max_fails=3 fail_timeout=30s;
    
    # Session sticky
    ip_hash;
}

server {
    listen 8082;
    server_name usa-idp.example.com;

    location / {
        proxy_pass http://usa_oidc_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Health check
        proxy_next_upstream error timeout http_502 http_503 http_504;
        proxy_connect_timeout 5s;
    }
    
    location /health {
        access_log off;
        proxy_pass http://usa_oidc_backend/health/ready;
    }
}
```

## Session Management

### Memcached for SimpleSAMLphp

```php
// spain-saml/config/config.php
$config['store.type'] = 'memcache';
$config['memcache_store.servers'] = [
    [
        ['hostname' => 'memcached-1'],
        ['hostname' => 'memcached-2'],
    ],
];
$config['memcache_store.prefix'] = 'simplesaml';
```

### Keycloak Infinispan Clustering

```bash
# JGroups configuration for Keycloak clustering
KC_CACHE_CONFIG_FILE=/opt/keycloak/conf/cache-ispn.xml

# Add to keycloak startup
--cache-config-file=cache-ispn.xml
```

## Health Checks

### Spain SAML Health Check Endpoint

```bash
# Health check script
curl -f -k https://spain-saml-1:8443/simplesaml/module.php/core/frontpage_federation.php

# Expected: HTTP 200
```

### USA OIDC Health Check

```bash
# Keycloak health endpoint
curl -f http://usa-oidc-1:8080/health/ready

# Expected: {"status":"UP"}
```

## Failover Testing

### Automated Failover Test

```bash
#!/bin/bash
# Test HA failover

echo "Testing Spain SAML failover..."

# Stop primary
docker stop spain-saml-1

# Test availability
curl -f -k https://spain-idp.example.com/simplesaml/
# Should still work via spain-saml-2

# Restart primary
docker start spain-saml-1

echo "Testing USA OIDC failover..."

# Stop one instance
docker stop usa-oidc-1

# Test availability
curl -f http://usa-idp.example.com/realms/us-dod/.well-known/openid-configuration
# Should still work via usa-oidc-2

# Restart instance
docker start usa-oidc-1
```

## Kubernetes Deployment

### Spain SAML Kubernetes

```yaml
# spain-saml-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: spain-saml
spec:
  replicas: 3
  selector:
    matchLabels:
      app: spain-saml
  template:
    metadata:
      labels:
        app: spain-saml
    spec:
      containers:
      - name: simplesamlphp
        image: venatorfox/simplesamlphp:v2.3.1
        env:
        - name: SIMPLESAMLPHP_SESSION_STORAGE
          value: "memcache"
        - name: SIMPLESAMLPHP_MEMCACHE_SERVERS
          value: "memcached:11211"
        volumeMounts:
        - name: config
          mountPath: /var/simplesamlphp/config
        - name: cert
          mountPath: /var/simplesamlphp/cert
        livenessProbe:
          httpGet:
            path: /simplesaml/
            port: 8443
            scheme: HTTPS
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /simplesaml/module.php/core/frontpage_federation.php
            port: 8443
            scheme: HTTPS
          initialDelaySeconds: 10
          periodSeconds: 5
      volumes:
      - name: config
        configMap:
          name: spain-saml-config
      - name: cert
        secret:
          secretName: spain-saml-certs
---
apiVersion: v1
kind: Service
metadata:
  name: spain-saml
spec:
  type: LoadBalancer
  ports:
  - port: 8443
    targetPort: 8443
  selector:
    app: spain-saml
```

### USA OIDC Kubernetes

```yaml
# usa-oidc-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: usa-oidc
spec:
  serviceName: usa-oidc-headless
  replicas: 3
  selector:
    matchLabels:
      app: usa-oidc
  template:
    metadata:
      labels:
        app: usa-oidc
    spec:
      containers:
      - name: keycloak
        image: quay.io/keycloak/keycloak:26.0.0
        env:
        - name: KC_DB
          value: "postgres"
        - name: KC_DB_URL
          valueFrom:
            secretKeyRef:
              name: usa-oidc-db
              key: jdbc-url
        - name: KC_CACHE
          value: "ispn"
        - name: KC_CACHE_STACK
          value: "kubernetes"
        - name: JAVA_OPTS_APPEND
          value: "-Djgroups.dns.query=usa-oidc-headless"
        ports:
        - containerPort: 8080
          name: http
        - containerPort: 7800
          name: jgroups
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8080
          initialDelaySeconds: 60
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: usa-oidc
spec:
  type: LoadBalancer
  ports:
  - port: 8082
    targetPort: 8080
  selector:
    app: usa-oidc
---
apiVersion: v1
kind: Service
metadata:
  name: usa-oidc-headless
spec:
  clusterIP: None
  ports:
  - port: 7800
    name: jgroups
  selector:
    app: usa-oidc
```

## Monitoring HA Setup

### Prometheus ServiceMonitor

```yaml
# service-monitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: external-idps
spec:
  selector:
    matchLabels:
      monitoring: external-idps
  endpoints:
  - port: metrics
    interval: 30s
```

## Disaster Recovery

### Backup Strategy

```bash
# Automated backup every 6 hours
0 */6 * * * /path/to/scripts/backup-external-idps.sh

# Replicate to secondary datacenter
0 */12 * * * aws s3 sync s3://primary-bucket/backups s3://dr-bucket/backups
```

### Recovery Time Objectives

- RTO (Recovery Time Objective): < 15 minutes
- RPO (Recovery Point Objective): < 1 hour

## Best Practices

1. **Use odd number of replicas** (3 or 5) for quorum
2. **Separate database and application layers**
3. **Implement circuit breakers** in load balancer
4. **Monitor replication lag** for databases
5. **Test failover regularly** (monthly recommended)
6. **Document runbooks** for incident response
7. **Implement automated healing** where possible

## Troubleshooting

### Split Brain Scenarios

```bash
# Check cluster status
docker exec usa-oidc-1 /opt/keycloak/bin/jboss-cli.sh \
  -c --commands="/subsystem=jgroups/channel=ee:read-attribute(name=view)"

# Force rejoin if needed
docker restart usa-oidc-1
```

### Session Loss

```bash
# Check memcached connectivity
telnet memcached 11211

# Verify session replication
docker exec spain-saml-1 cat /var/simplesamlphp/log/simplesamlphp.log | grep session
```

## References

- Keycloak Clustering: https://www.keycloak.org/server/caching
- SimpleSAMLphp HA: https://simplesamlphp.org/docs/stable/simplesamlphp-maintenance
- PostgreSQL Replication: https://www.postgresql.org/docs/current/high-availability.html


