#!/bin/sh
set -eu
sha256sum -c /etc/clamav/anibish-profile.sha256 >/dev/null
# Preserve the official image's signature updates, volume permissions and tini init.
exec /init "$@"
