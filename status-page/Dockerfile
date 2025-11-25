# DIVE V3 Status Page
# Lightweight nginx-based status page with auto-refresh
FROM nginx:alpine

# Install curl and jq for health checks
RUN apk add --no-cache curl jq bash

# Create directories
RUN mkdir -p /usr/share/nginx/html /var/log/dive-status /scripts

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy health check script
COPY health-check.sh /scripts/health-check.sh
RUN chmod +x /scripts/health-check.sh

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]

