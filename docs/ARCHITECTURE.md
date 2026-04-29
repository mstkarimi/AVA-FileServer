# Architecture Notes

## Overview

A single Docker container runs three processes under `supervisord`:

| Process | Role | Port |
|---|---|---|
| `nginx` | TLS termination, static SPA, reverse proxy to Node | 8082 |
| `node` | Express API, SQLite, share-link streaming | 3000 (loopback) |
| `sshd`  | Chrooted SFTP for external uploads | 2222 |

```
┌─────────────────────────────────── container ──────────────────────────────┐
│                                                                            │
│  :8082  nginx (TLS) ──► :3000 node (Express)  ──► /data/files (mount)      │
│                                  │                                          │
│                                  └──► /data/db   (SQLite, mount)            │
│                                                                            │
│  :2222  sshd (chroot internal-sftp) ──► /data/files/uploads (mount)         │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                            host bind mounts
                            ./data, ./certs
```

Data lives **only** on the host. Removing or rebuilding the container loses
nothing.

## Routing inside the container

`nginx/default.conf` dispatches:

| Pattern | Target | Auth |
|---|---|---|
| `^/[A-Za-z0-9_-]{22}(\.ext)?$` | node `/s/<rest>` (file share, raw) | none |
| `^/[A-Za-z0-9_-]{22}/.*$` | node `/s/<rest>` (folder share index/file) | none |
| `^/s/...` | node (legacy share path) | none |
| `/api/...` | node | JWT in `Authorization` |
| `/` | static SPA `dist/` | n/a |

The 22-char base64url pattern was chosen so that the regex is
**lossless** (no overlap with SPA assets, since Vite hashes are typically 8
chars).

## Database

SQLite (better-sqlite3) at `/data/db/fileserver.db`. WAL mode for concurrent
reads.

```
users (id, username, password_hash, role, created_at)
shares (id, hash, file_path, share_type, created_by, created_at,
        download_count, last_accessed_at)
user_permissions (id, user_id, folder_path, created_at)
```

Migrations run on startup in `db.ts:initDb()`. They are idempotent
(check `PRAGMA table_info` before `ALTER`).

## Permissions model

- `admin` — unrestricted
- `viewer` — list of granted folder paths (relative to FILES_ROOT, recursive)

The permission check has two modes:

- **access** — direct read of a path. Granted if path equals or is a descendant
  of any granted folder.
- **navigate** — listing a parent that contains a granted folder. Used so a
  viewer with access to `/Music/Pop` can navigate through `/Music/` and see
  only `Pop` inside.

`filterListing()` further filters listing results:
- Files visible only when within the granted scope.
- Directories visible if the user has any access into them (covers ancestor
  navigation).

## Streaming

`streamService.ts` does the heavy lifting:

1. Parse `Range` (`bytes=start-end` and suffix `bytes=-N`)
2. Set `Content-Type` from extension via `mime-types`
3. Set `Accept-Ranges: bytes`, `ETag` (mtime+size), `Last-Modified`
4. For HEAD: same headers, no body
5. For GET: `fs.createReadStream(path, {start, end}).pipe(res)` — never load
   the file into memory

`Content-Disposition` is **not** set on `/s/` responses by default — some
players misbehave when it's present. It IS set on `/api/preview` so admin
preview downloads keep filenames.

## Folder shares

A share record can have `share_type: 'folder'`. The hash maps to a folder
path (relative to FILES_ROOT). `routes/public.ts` recognizes this and:

- `GET /<hash>` → 301 to `/<hash>/`
- `GET /<hash>/` → server-rendered HTML index
- `GET /<hash>/sub/path` → recurse into subdir or stream file

Subpath resolution uses `path.resolve` + boundary check so `..` cannot
escape the shared folder.

## Security model

- Path traversal blocked at `safePath()` — every disk-touching API resolves
  and asserts containment within `FILES_ROOT`.
- Public `/s/...` endpoint never returns JSON or HTML for missing entries —
  always plain `404` with no body, to avoid information leak.
- Rate limiting:
  - login: 5 / 15 min / IP
  - share endpoint: 240 / min / IP
- JWT 24h expiry, bcrypt 12 rounds.
- SFTP user is shell-less (`/usr/sbin/nologin`) and chrooted.

## Operational notes

- DB writes use a transaction wrapper for permission updates.
- The container drops `pam_loginuid.so` to `optional` because that PAM
  module fails inside containers (no `/proc/self/loginuid`).
- Container runtime image is ~300 MB (Debian bookworm-slim + node + nginx +
  openssh).
