# Agent Relay Workspace
# Runs a user's workspace with the relay daemon and agent orchestration

FROM node:20-slim

WORKDIR /app

# Install system dependencies for AI CLIs
RUN apt-get update && apt-get install -y \
    bash \
    ca-certificates \
    curl \
    git \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install Claude CLI (if available)
# RUN npm install -g @anthropic-ai/claude-code

# Copy pre-built agent-relay
COPY --from=ghcr.io/khaliqgant/agent-relay:latest /app/dist ./dist
COPY --from=ghcr.io/khaliqgant/agent-relay:latest /app/node_modules ./node_modules
COPY --from=ghcr.io/khaliqgant/agent-relay:latest /app/package*.json ./
COPY deploy/workspace/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create workspace directory
RUN mkdir -p /workspace /data

# Create non-root user
RUN useradd -m -u 1001 workspace
RUN chown -R workspace:workspace /app /workspace /data
USER workspace

# Environment
ENV NODE_ENV=production
ENV PORT=3888
ENV AGENT_RELAY_DATA_DIR=/data
ENV AGENT_RELAY_DASHBOARD_PORT=3888

# Expose ports
# 3888 - Dashboard/API
# 3889 - WebSocket (optional)
EXPOSE 3888 3889

# Volume for persistent data
VOLUME ["/data", "/workspace"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3888/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

ENTRYPOINT ["/entrypoint.sh"]
