# DIVE V3 OPAL Server with curl for health checks
FROM permitio/opal-server:latest

USER root
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
USER opal





