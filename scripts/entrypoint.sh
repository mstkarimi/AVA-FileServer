#!/bin/bash
set -e

# --- SFTP user setup ---------------------------------------------------------
groupadd -g 2000 sftpgroup 2>/dev/null || true
if ! id "${SFTP_USERNAME}" &>/dev/null; then
    useradd -M -s /usr/sbin/nologin -g sftpgroup "${SFTP_USERNAME}"
fi
echo "${SFTP_USERNAME}:${SFTP_PASSWORD}" | chpasswd

# --- Filesystem layout -------------------------------------------------------
mkdir -p /data/files /data/db /data/files/.tmp /data/certs /data/branding /data/trash

# --- /data/files (chroot top) ---------------------------------------------
# OpenSSH chroot requires this dir to be root-owned and NOT group/world
# writable, so we keep it 2755 (group=sftpgroup, NOT group-writable). The
# setgid bit (the leading 2) is the trick: any child directory created
# inside automatically inherits group=sftpgroup, so the SFTP user can
# access children even when they were created by the admin UI (which
# runs as root).
chown root:sftpgroup /data/files
chmod 2755 /data/files

# --- /data/files/.tmp (multer temp) ---------------------------------------
chown root:sftpgroup /data/files/.tmp
chmod 2775 /data/files/.tmp

# --- /data/files/uploads (default SFTP drop zone) -------------------------
mkdir -p /data/files/uploads
chown root:sftpgroup /data/files/uploads
chmod 2775 /data/files/uploads

# --- Make every existing child group-writable so the SFTP user has full
# read/write/rename/delete inside any folder.
# Idempotent — safe to re-run on every container start.
find /data/files -mindepth 1 -type d ! -path /data/files/.tmp -exec chgrp sftpgroup {} + 2>/dev/null || true
find /data/files -mindepth 1 -type d ! -path /data/files/.tmp -exec chmod 2775 {} + 2>/dev/null || true
find /data/files -mindepth 1 -type f -exec chgrp sftpgroup {} + 2>/dev/null || true
find /data/files -mindepth 1 -type f -exec chmod 0664 {} + 2>/dev/null || true

# --- TLS certificate ---------------------------------------------------------
CERT="/data/certs/fullchain.pem"
KEY="/data/certs/privkey.pem"
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
    echo "[entrypoint] No TLS cert in /data/certs — generating self-signed for localhost"
    openssl req -x509 -nodes -newkey rsa:4096 \
        -keyout "$KEY" \
        -out "$CERT" \
        -days 3650 \
        -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
    chmod 600 "$KEY"
fi

# --- SSH host keys -----------------------------------------------------------
ssh-keygen -A 2>/dev/null || true

# Ensure pam_loginuid is optional (it fails inside containers)
sed -i 's/session    required     pam_loginuid.so/session    optional     pam_loginuid.so/' /etc/pam.d/sshd 2>/dev/null || true

# --- nginx -------------------------------------------------------------------
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

exec supervisord -n -c /etc/supervisor/supervisord.conf
