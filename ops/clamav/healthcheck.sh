#!/bin/sh
set -eu
export LC_ALL=C TZ=UTC
sha256sum -c /etc/clamav/anibish-profile.sha256 >/dev/null
version=$(printf 'nVERSION\n' | nc -w 5 127.0.0.1 3310 | tr -d '\r')
case "$version" in 'ClamAV 1.5.4/'*) ;; *) exit 1 ;; esac
stamp=${version#*/*/}
# Check the database loaded by clamd, never a downloaded file's mutable mtime.
loaded=$(date -u -D '%a %b %e %T %Y' -d "$stamp" +%s)
now=$(date -u +%s)
age=$((now-loaded))
hours=${CLAMAV_MAX_SIGNATURE_AGE_HOURS:-72}
case "$hours" in ''|*[!0-9]*) exit 1 ;; esac
[ "$hours" -ge 24 ] && [ "$hours" -le 168 ]
[ "$age" -ge -300 ] && [ "$age" -le "$((hours*3600))" ]
