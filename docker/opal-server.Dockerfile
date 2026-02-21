# DIVE V3 OPAL Server with curl for health checks and custom entrypoint
FROM permitio/opal-server:latest

USER root
RUN apt-get update && apt-get install -y curl openssh-client && rm -rf /var/lib/apt/lists/*

# Copy custom entrypoint script
COPY opal-server-entrypoint.sh /opal/entrypoint.sh
RUN chmod +x /opal/entrypoint.sh

USER opal

ENTRYPOINT ["/opal/entrypoint.sh"]







