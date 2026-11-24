#!/usr/bin/env sh
set -eu

: "${SOURCE_DATABASE_URL:?set SOURCE_DATABASE_URL}"
: "${TARGET_DATABASE_URL:?set TARGET_DATABASE_URL}"
: "${BACKUP_DIR:=./backups}"

if [ "$SOURCE_DATABASE_URL" = "$TARGET_DATABASE_URL" ]; then
  echo "Refusing to restore over the source database" >&2
  exit 1
fi
if [ "${NODE_ENV:-}" = "production" ]; then
  echo "Refusing to run the rehearsal helper with NODE_ENV=production" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$BACKUP_DIR/cfls-$stamp.dump"

start_backup="$(date +%s)"
pg_dump --format=custom --no-owner --no-acl --file="$dump" "$SOURCE_DATABASE_URL"
end_backup="$(date +%s)"

start_restore="$(date +%s)"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$TARGET_DATABASE_URL" "$dump"
end_restore="$(date +%s)"

psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM contents) AS contents, (SELECT count(*) FROM inquiries) AS inquiries;"

printf 'backup=%s restore=%s file=%s\n' "$((end_backup-start_backup))s" "$((end_restore-start_restore))s" "$dump"
