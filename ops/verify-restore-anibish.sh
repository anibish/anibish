#!/usr/bin/env bash
set -euo pipefail
umask 077
root=/data/anibish
project=xz0yo1hnzb8pe6nwuhvfe5tl
db=$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=postgres)
api=$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=api)
[[ -n "$db" && -n "$api" ]]
archive=$(find "$root/backups" -maxdepth 1 -name 'anibish-*.tar.gpg' -type f | sort | tail -1)
[[ -n "$archive" ]]
sha256sum -c "$archive.sha256"
task_dir=$(mktemp -d "$root/.restore-check.XXXXXX")
restore_db="anibish_restore_$(date -u +%Y%m%d%H%M%S)"
cleanup(){
 current_db=$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=postgres)
 if [[ -n "$current_db" ]]; then
  docker exec "$current_db" dropdb -U anibish --if-exists "$restore_db" >/dev/null || echo "Temporary restore cleanup pending: $restore_db" >&2
 fi
 rm -rf -- "$task_dir"
}
trap cleanup EXIT
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$root/secrets/backup-passphrase" --decrypt "$archive" | tar -xf - -C "$task_dir"
docker exec "$db" createdb -U anibish "$restore_db"
docker exec -i "$db" pg_restore -U anibish -d "$restore_db" --no-owner --exit-on-error < "$task_dir/database.dump"
for table in users services cms_pages leads orders payments; do
 restored=$(docker exec "$db" psql -U anibish -d "$restore_db" -Atc "SELECT count(*) FROM $table")
 echo "Verified restore: $table ($restored records)"
done
[[ -f "$task_dir/runtime-secrets.json" ]]
docker exec -i -e ANIBISH_RESTORE_DB="$restore_db" "$api" node -e '
const fs=require("fs"),crypto=require("crypto"),pg=require("pg");
const recovery=JSON.parse(fs.readFileSync(0,"utf8"));
const key=Buffer.from(recovery.MFA_ENCRYPTION_KEY,"hex");
if(key.length!==32||!recovery.SANDBOX_PAYMENT_SECRET)throw new Error("Recovery key configuration invalid");
const name=process.env.ANIBISH_RESTORE_DB;
if(!/^anibish_restore_[0-9]+$/.test(name))throw new Error("Restore database guard failed");
const url=new URL(process.env.DATABASE_URL);url.pathname="/"+name;
const pool=new pg.Pool({connectionString:url.toString()});
(async()=>{try{const result=await pool.query("SELECT mfa_secret FROM users WHERE mfa_enabled=true");for(const row of result.rows){const [iv,tag,data]=row.mfa_secret.split(":");const decipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(iv,"hex"));decipher.setAuthTag(Buffer.from(tag,"hex"));const secret=Buffer.concat([decipher.update(Buffer.from(data,"hex")),decipher.final()]).toString();if(!/^[A-Z2-7]{32}$/.test(secret))throw new Error("Restored authenticator record invalid");}console.log(JSON.stringify({restored_mfa_accounts:result.rowCount,recovery_configuration:"verified"}));}finally{await pool.end()}})().catch(()=>{console.error("MFA recovery verification failed; secrets suppressed.");process.exitCode=1});
' < "$task_dir/runtime-secrets.json"
[[ $(find "$task_dir/review-evidence" -type f | wc -l) -eq 74 ]]
date -u +%FT%TZ > "$root/backups/last-restore-test"
echo 'Verified encrypted backup decryption, database restore and 74 private review originals.'
