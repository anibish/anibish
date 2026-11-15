#!/usr/bin/env bash
set -euo pipefail
umask 077
root=/data/anibish
project=xz0yo1hnzb8pe6nwuhvfe5tl
db=$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=postgres)
[[ -n "$db" ]]
archive=$(find "$root/backups" -maxdepth 1 -name 'anibish-*.tar.gpg' -type f | sort | tail -1)
[[ -n "$archive" ]]
sha256sum -c "$archive.sha256"
task_dir=$(mktemp -d "$root/.restore-check.XXXXXX")
restore_db="anibish_restore_$(date -u +%Y%m%d%H%M%S)"
cleanup(){ docker exec "$db" dropdb -U anibish --if-exists "$restore_db" >/dev/null; rm -rf -- "$task_dir"; }
trap cleanup EXIT
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$root/secrets/backup-passphrase" --decrypt "$archive" | tar -xf - -C "$task_dir"
docker exec "$db" createdb -U anibish "$restore_db"
docker exec -i "$db" pg_restore -U anibish -d "$restore_db" --no-owner --exit-on-error < "$task_dir/database.dump"
for table in users services cms_pages leads orders payments; do
 original=$(docker exec "$db" psql -U anibish -d anibish -Atc "SELECT count(*) FROM $table")
 restored=$(docker exec "$db" psql -U anibish -d "$restore_db" -Atc "SELECT count(*) FROM $table")
 [[ "$original" == "$restored" ]] || { echo "Count mismatch: $table"; exit 1; }
 echo "Verified restore: $table ($restored records)"
done
[[ $(find "$task_dir/review-evidence" -type f | wc -l) -eq 74 ]]
date -u +%FT%TZ > "$root/backups/last-restore-test"
echo 'Verified encrypted backup decryption, database restore and 74 private review originals.'
