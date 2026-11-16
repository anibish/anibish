#!/usr/bin/env bash
# Only the dedicated ANIBISH scanner; preserve files, definitions and all other apps.
set -euo pipefail
umask 077
project=xz0yo1hnzb8pe6nwuhvfe5tl
state=/data/anibish/scanner-build-pause
mode=${1:---dry-run}
[[ "$mode" == --dry-run || "$mode" == --pause || "$mode" == --resume ]]
if [[ "$mode" == --resume ]]; then
 [[ -f "$state" && ! -L "$state" ]]
 read -r candidate < "$state"
 [[ "$candidate" =~ ^[a-f0-9]{12,64}$ ]]
 [[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$candidate")" == "$project" ]]
 [[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$candidate")" == file_scanner ]]
 docker start "$candidate" >/dev/null
 echo 'Only the recorded ANIBISH scanner was resumed. Verify fresh-signature health and media preflight.'
 exit
fi
mapfile -t matches < <(docker ps --all -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=file_scanner)
[[ ${#matches[@]} -eq 1 ]] || { echo 'Expected exactly one dedicated scanner; review the deployment rather than guessing.' >&2; exit 1; }
candidate=${matches[0]}
[[ "$candidate" =~ ^[a-f0-9]{12,64}$ ]]
if [[ "$mode" == --dry-run ]]; then
 echo 'Dry run: one dedicated ANIBISH scanner selected. No container was changed.'
 exit
fi
[[ ! -e "$state" || -f "$state" && ! -L "$state" ]]
[[ "$(docker inspect --format '{{.State.Running}}' "$candidate")" == true ]] || { echo 'Scanner is already stopped; no pause state was overwritten.' >&2; exit 1; }
printf '%s\n' "$candidate" > "$state"
docker stop --time 30 "$candidate" >/dev/null
echo 'Only the dedicated ANIBISH scanner paused. File downloads remain gated until fresh scans resume.'
