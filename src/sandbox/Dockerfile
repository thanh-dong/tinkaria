FROM oven/bun:1.2-slim

# Runtime deps: git for repo operations, curl for MCP tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN groupadd -r tinkaria && useradd -r -g tinkaria -m tinkaria

WORKDIR /app

# Install only production deps
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

# Runner + shared source
COPY src/runner/   ./src/runner/
COPY src/shared/   ./src/shared/
COPY src/sandbox/entrypoint.ts ./src/sandbox/entrypoint.ts

# Workspace repos are mounted here by the host
VOLUME ["/workspace"]

# Container connects to host NATS
ENV NATS_URL=nats://host.docker.internal:4222
ENV WORKSPACE_ID=""

USER tinkaria
CMD ["bun", "run", "src/sandbox/entrypoint.ts"]
