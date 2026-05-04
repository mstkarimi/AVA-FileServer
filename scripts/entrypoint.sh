#!/bin/bash
set -e

# --- SFTP user setup ---------------------------------------------------------
groupadd -g 2000 sftpgroup 2>/dev/null || true
if ! id "${SFTP_USERNAME}" &>/dev/null; then
    useradd -M -s /usr/sbin/nologin -g sftpgroup "${SFTP_USERNAME}"
fi
echo "${SFTP_USERNAME}:${SFTP_PASSWORD}" | chpasswd

# --- Filesystem layout -------------------------------------------------------
mkdir -p /data/files /data/db /data/files/.tmp /data/certs /data/branding

# chroot requires root-owned, NOT group/world writable
chown root:root /data/files
chmod 0755 /data/files

# Uploads subdirectory IS group-writable (sftp lands here)
mkdir -p /data/files/uploads
chown root:sftpgroup /data/files/uploads
chmod 2775 /data/files/uploads

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
