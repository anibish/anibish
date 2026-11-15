#!/usr/bin/env bash
set -euo pipefail
umask 077
project=xz0yo1hnzb8pe6nwuhvfe5tl
root=/data/anibish
mkdir -p "$root/backups"
exec 9>"$root/backup.lock"
flock -n 9 || exit 0
db=$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=postgres)
api=$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=api)
[[ -n "$db" && -n "$api" && -f "$root/secrets/backup-passphrase" ]]
task_dir=$(mktemp -d "$root/.backup.XXXXXX")
trap 'rm -rf -- "$task_dir"' EXIT
docker exec "$db" pg_dump -U anibish -d anibish -Fc > "$task_dir/database.dump"
mkdir "$task_dir/files"
docker cp "$api:/app/storage/." "$task_dir/files/"
# Recover encrypted MFA records without depending on the original Coolify host.
# This root-only temporary file is included only inside the encrypted archive.
docker exec "$api" node -e 'const fs=require("fs"); const keys=["MFA_ENCRYPTION_KEY","SANDBOX_PAYMENT_SECRET"]; const secrets=Object.fromEntries(keys.map(k=>{if(!process.env[k])throw new Error("Missing recovery configuration");return [k,process.env[k]]})); process.stdout.write(JSON.stringify(secrets));' > "$task_dir/runtime-secrets.json"
if [[ -d "$root/review-evidence" ]]; then cp -a "$root/review-evidence" "$task_dir/review-evidence"; fi
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$root/backups/anibish-$stamp.tar.gpg"
tar -C "$task_dir" -cf - . | gpg --batch --yes --pinentry-mode loopback --passphrase-file "$root/secrets/backup-passphrase" --symmetric --cipher-algo AES256 --output "$archive"
sha256sum "$archive" > "$archive.sha256"
date -u +%FT%TZ > "$root/backups/last-success"
echo "ANIBISH encrypted backup completed: $(basename "$archive")"
