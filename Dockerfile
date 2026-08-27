# The public npm registry is unreachable from this network: registry.npmjs.org
# resolves fine but its Cloudflare addresses are filtered (github.com, by
# contrast, connects normally). The company Nexus mirrors it and is reachable
# on 443, so every build stage installs from there.
#
# Nexus is addressed BY NAME, not by IP, so its *.gosafir.com certificate still
# validates; docker-compose.yml maps the name with build.extra_hosts because
# this box's DNS answers with a public address it cannot route to.
#
# Without this, `npm install` hangs until it times out and the image cannot be
# rebuilt at all — builds only ever succeeded while the BuildKit cache happened
# to still hold the install layer.

# Stage 1: build frontend
FROM node:20-bookworm-slim AS frontend-build
ENV NPM_CONFIG_REGISTRY=https://nexus.gosafir.com/repository/npm-group/
WORKDIR /build
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# deb.debian.org is filtered from this network the same way registry.npmjs.org
# is, so every apt stage is repointed at an Iranian mirror that carries the
# identical bookworm archive. Two details matter:
#
#  - The deb822 file is deleted first: on bookworm it takes priority over
#    sources.list, so writing sources.list alone leaves apt still talking to
#    the unreachable default.
#  - The mirror is addressed over http, not https. node:20-bookworm-slim ships
#    without ca-certificates, so an https source fails with "No system
#    certificates available" before a single package is read. Plain http is
#    the normal way to consume apt: every index and package is GPG-signed, so
#    integrity does not depend on the transport.
#  - Check-Valid-Until is disabled because this mirror lags upstream (its
#    bookworm-updates Release stopped being refreshed long ago). That switch
#    only waives the freshness window; the GPG signature on every Release and
#    package is still verified exactly as before, so packages still cannot be
#    tampered with in transit.

# Stage 2: build backend (native modules need build toolchain)
FROM node:20-bookworm-slim AS backend-build
ENV NPM_CONFIG_REGISTRY=https://nexus.gosafir.com/repository/npm-group/
RUN rm -f /etc/apt/sources.list.d/debian.sources \
    && printf '%s\n' \
        'deb http://mirror.iranserver.com/debian bookworm main' \
        'deb http://mirror.iranserver.com/debian bookworm-updates main' \
        'deb http://mirror.iranserver.com/debian-security bookworm-security main' \
        > /etc/apt/sources.list \
    && printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99no-valid-until \
    && apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
# Compile TS, then slim node_modules. `npm prune` is run offline with a hard
# timeout and made non-fatal: in restricted-network environments it can otherwise
# block indefinitely contacting the registry. If it can't run, we ship the
# (slightly larger) full node_modules rather than failing the build.
RUN npm run build \
    && (timeout 120 npm prune --production --offline 2>/dev/null \
        || echo "[build] npm prune skipped (offline/timeout) — keeping full node_modules")

# Stage 3: runtime
FROM node:20-bookworm-slim
RUN rm -f /etc/apt/sources.list.d/debian.sources \
    && printf '%s\n' \
        'deb http://mirror.iranserver.com/debian bookworm main' \
        'deb http://mirror.iranserver.com/debian bookworm-updates main' \
        'deb http://mirror.iranserver.com/debian-security bookworm-security main' \
        > /etc/apt/sources.list \
    && printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99no-valid-until \
    && apt-get update && apt-get install -y --no-install-recommends \
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
