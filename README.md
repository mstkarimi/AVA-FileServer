# Secure File Server

Self-hosted, single-container file server with a web admin UI, SFTP, and
public share links that stream raw bytes (HTTP `Range` support, embed-friendly).

- 🔐 **Web admin UI** &mdash; manage users, browse files, generate share links
- 👥 **Multi-user** &mdash; admin / viewer roles, per-folder permissions
- 📡 **SFTP** on port 2222 &mdash; chrooted, password auth
- 🔗 **Public share links** &mdash; raw stream, range/seek works with VLC, browsers, `<audio>`, `<video>`, `<img>`
- 🗂️ **Folder shares** &mdash; one link → public folder index
- 🔍 **Live search** &mdash; sub-string match, scoped to a viewer's permitted folders
- 💾 **Persistent storage** &mdash; everything is bind-mounted; deleting the container loses nothing

Built with TypeScript, Express, React, SQLite, OpenSSH, and nginx &mdash; all in one Debian-slim image.

---

## Quick start

```bash
git clone https://github.com/<you>/fileserver.git
cd fileserver
./install.sh
```

`install.sh` will:

1. check Docker is installed and running,
2. generate a JWT secret, prompt for admin / SFTP credentials,
3. write `.env` (mode 600),
4. create `data/` and `certs/` directories,
5. build the image and start the container.

Open `https://<your-host>:8082` &mdash; if you didn't supply a TLS cert, the
container generates a self-signed one and your browser will warn the first
time.

---

## What's inside

```
fileserver/
├── install.sh                 # one-shot setup
├── docker-compose.yml
├── Dockerfile
├── supervisord.conf
├── .env.example
├── nginx/default.conf         # in-container TLS reverse proxy
├── sshd/sshd_config           # chrooted internal-sftp
├── scripts/
│   ├── entrypoint.sh
│   └── backup.sh              # snapshot DB + .env + certs
├── docs/
│   ├── ARCHITECTURE.md
│   └── nginx-vhost.example.conf
├── backend/                   # Node.js + Express + SQLite (TypeScript)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
└── frontend/                  # React + Vite + Tailwind (TypeScript)
    ├── package.json
    ├── vite.config.ts
    └── src/
```

---

## Public share links

When an admin shares a file, the URL looks like:

```
https://files.example.com/dsB9P7wGiWqLc8kEDiuqEg.mp3
```

- **Raw stream** &mdash; only the file bytes; no HTML page
- **`Content-Type`** chosen from the extension
- **`Accept-Ranges: bytes`** + correct `206 Partial Content` so seeking works
- **No filename or directory in the URL** &mdash; only the random hash + extension
- **CORS open** so embedding from other origins just works

For folder shares the URL is:

```
https://files.example.com/Gdr-N02wCm5iszoDPeqtMg/
```

A small dark/light-aware HTML index lets external users browse files inside.
Each file is served from `/<hash>/path/file.mp3`, again as a raw stream.

Verify with `curl`:

```bash
curl -I https://files.example.com/<hash>.mp3
# HTTP/2 200
# content-type: audio/mpeg
# accept-ranges: bytes
# content-length: ...

curl -r 0-1023 https://files.example.com/<hash>.mp3 -o head.bin
# 206 Partial Content, first 1 KB only
```

---

## Roles & permissions

| Role | Browse | Search | Upload | Delete | Create shares | Manage users |
|---|---|---|---|---|---|---|
| **admin** | ✅ all | ✅ all | ✅ | ✅ | ✅ | ✅ |
| **viewer** | ✅ scoped | ✅ scoped | ❌ | ❌ | ❌ | ❌ |

A viewer is granted one or more folder paths. Access is recursive into
subfolders. The Permission picker normalises redundancy &mdash; granting
`/Music` already covers `/Music/Pop`.

---

## SFTP

```bash
sftp -P 2222 ftpuser@your-host
sftp> cd uploads
sftp> put song.mp3
```

The user is chrooted to `/data/files/` and can write inside `uploads/`. Files
appear in the admin web UI immediately.

---

## Configuration

Everything is in `.env` &mdash; never commit it.

| Variable | Purpose | Default |
|---|---|---|
| `JWT_SECRET` | session-token signing key (≥ 64 hex chars) | random |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | seeds first admin (only on first run) | `admin` / *(prompt)* |
| `SFTP_USERNAME` / `SFTP_PASSWORD` | SFTP login | `ftpuser` / *(prompt)* |
| `PUBLIC_URL` | base URL used to build share links | `https://localhost:8082` |
| `BIND_ADDR` | host interface to publish on (`127.0.0.1` for proxied) | `0.0.0.0` |
| `HTTPS_PORT` / `SFTP_PORT` | host ports | `8082` / `2222` |

To rotate the admin password from the CLI:

```bash
docker exec -it fileserver node -e "
const db = require('better-sqlite3')('/data/db/fileserver.db');
const bcrypt = require('bcrypt');
db.prepare('UPDATE users SET password_hash=? WHERE username=?')
  .run(bcrypt.hashSync('NEW_PASSWORD', 12), 'admin');
console.log('done');
"
```

---

## TLS

### With your own certificate (recommended)

Drop the cert and key into `./certs/` before starting:

```
certs/
├── fullchain.pem   # full chain (Let's Encrypt: fullchain.pem)
└── privkey.pem     # private key
```

Renewal: replace the files and `docker compose restart`.

### Self-signed (default fallback)

If `./certs/` is empty when the container starts, the entrypoint generates a
self-signed cert (RSA 4096, CN=localhost, 10 years). Browsers will warn.

### Behind an existing reverse proxy

If you already terminate TLS on the host (nginx, Caddy, Traefik):

1. In `.env`: `BIND_ADDR=127.0.0.1`
2. Configure your proxy to forward to `https://127.0.0.1:8082` with
   `proxy_ssl_verify off` (the container's cert may be self-signed) and
   `proxy_buffering off`.

A complete nginx vhost example is in
[`docs/nginx-vhost.example.conf`](docs/nginx-vhost.example.conf).

---

## Operations

```bash
# tail logs
docker compose logs -f

# restart after editing .env
docker compose down && docker compose up -d

# update to latest code
git pull && docker compose build && docker compose up -d

# backup DB + .env + certs (NOT data/files/)
./scripts/backup.sh

# include user files (can be huge)
./scripts/backup.sh --include-files
```

Restore: extract the backup tarball over the project root, run
`docker compose up -d`. DB migrations are idempotent and run on every
container start.

---

## Security

| | |
|---|---|
| Authentication | bcrypt 12 rounds, JWT 24 h |
| Path traversal | every API path resolved on disk + asserted inside `FILES_ROOT` |
| Public endpoint info-leak | `/s/...` returns plain `404` with no body for missing/invalid hashes |
| Rate limiting | login 5 / 15 min / IP, share endpoint 240 / min / IP |
| Embedding | `X-Frame-Options: DENY` on admin / API only; `/s/...` allows embedding |
| SFTP | chrooted, no shell, password auth only inside the chroot group |
| TLS | TLS 1.2/1.3 only, `HIGH:!aNULL:!MD5` ciphers |

The permission scope is enforced **on the backend**, not just hidden from the
UI. A viewer who calls `/api/files?path=/somewhere-else` directly gets `403`.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for design notes.

---

## Development

Stack:

| Layer | Tech |
|---|---|
| Backend | Node 20, Express, TypeScript, better-sqlite3 |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, lucide-react |
| Streaming | nginx + `fs.createReadStream` pipes |
| SFTP | OpenSSH (`internal-sftp`, chrooted) |
| Process supervisor | supervisord |
| Image | `node:20-bookworm-slim` |

Local hacking happens through Docker only &mdash; the codebase compiles inside
the image. To rebuild after edits:

```bash
docker compose build
docker compose up -d
```

---

## License

MIT &mdash; see [LICENSE](LICENSE).
