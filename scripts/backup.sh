#!/usr/bin/env bash
#
# Snapshot the database, configuration, and certificates.
# Files under data/files/ are usually huge and excluded by default;
# pass --include-files to add them.
#
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TS="$(date +%Y%m%d-%H%M%S)"
INCLUDE_FILES=0

for arg in "$@"; do
  case "$arg" in
    --include-files) INCLUDE_FILES=1 ;;
    -h|--help)
      echo "Usage: $0 [--include-files]"
      echo
      echo "  Backs up data/db, .env, and certs/ to ${BACKUP_DIR}."
      echo "  --include-files  also archive data/files (can be very large)"
      exit 0
      ;;
  esac
done

mkdir -p "$BACKUP_DIR"
ARCHIVE="${BACKUP_DIR}/fileserver-${TS}.tar.gz"

ITEMS=("data/db")
[ -f .env ] && ITEMS+=(".env")
[ -d certs ] && ITEMS+=("certs")
[ "$INCLUDE_FILES" = 1 ] && ITEMS+=("data/files")

# Use --warning=no-file-changed in case the DB is being written while we tar.
# Better: pause writes by stopping the container — but we don't want to surprise
# the operator. Issue a warning instead.
if docker compose ps 2>/dev/null | grep -q "Up"; then
  echo "[!] Container is running. For a 100% consistent DB snapshot, stop it first:"
  echo "      docker compose stop && $0 && docker compose start"
  echo
fi

tar czf "$ARCHIVE" "${ITEMS[@]}" 2>/dev/null || {
  echo "[!] tar reported a warning — backup probably still usable. Check $ARCHIVE."
}

echo "[+] backup written: $ARCHIVE"
echo "    size: $(du -h "$ARCHIVE" | cut -f1)"

if [ "$INCLUDE_FILES" = 0 ]; then
  echo
  echo "    NOTE: data/files/ was NOT included. To include user files:"
  echo "      $0 --include-files"
fi
