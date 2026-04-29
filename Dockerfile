# Stage 1: build frontend
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /build
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: build backend (native modules need build toolchain)
FROM node:20-bookworm-slim AS backend-build
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build && npm prune --production

# Stage 3: runtime
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      nginx openssh-server supervisor openssl ca-certificates wget \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /run/sshd /var/log/supervisor

COPY --from=backend-build /build/dist /app/backend/dist
COPY --from=backend-build /build/node_modules /app/backend/node_modules
COPY --from=backend-build /build/package.json /app/backend/package.json
COPY --from=frontend-build /build/dist /app/frontend/dist

COPY nginx/default.conf /etc/nginx/sites-available/default
COPY sshd/sshd_config /etc/ssh/sshd_config
COPY supervisord.conf /etc/supervisor/supervisord.conf
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8082 2222
ENTRYPOINT ["/entrypoint.sh"]
