#!/usr/bin/env bash
# Only ANIBISH encrypted archives; keep at least seven and respect .keep pins.
set -euo pipefail
root=/data/anibish/backups
mode=${1:---dry-run}
[[ "$mode" == --dry-run || "$mode" == --apply ]]
[[ -d "$root" && ! -L "$root" ]]
mapfile -t archives < <(find "$root" -maxdepth 1 -type f -name 'anibish-????????T??????Z.tar.gpg' -printf '%f\n' | sort -r)
remaining=${#archives[@]}
for name in "${archives[@]}"; do
 [[ "$name" =~ ^anibish-[0-9]{8}T[0-9]{6}Z\.tar\.gpg$ ]] || continue
 [[ $remaining -gt 7 && ! -e "$root/$name.keep" ]] || continue
 [[ -n $(find "$root/$name" -maxdepth 0 -mtime +90 -print) ]] || continue
 if [[ "$mode" == --apply ]]; then rm -- "$root/$name"; [[ ! -f "$root/$name.sha256" ]] || rm -- "$root/$name.sha256"; fi
 remaining=$((remaining-1))
 echo "ANIBISH retention $mode: $name"
done
echo "ANIBISH retention complete: $remaining archives retained (90 days, minimum seven, pins preserved)."
