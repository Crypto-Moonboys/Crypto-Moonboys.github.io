#!/usr/bin/env bash
# Install the checked-out Block Topia queue under the mooncity user.
set -euo pipefail
umask 077
scripts_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
runner_dir="$HOME/.local/share/block-topia-art"
units="$HOME/.config/systemd/user"
node_bin=$(command -v node)
test -s "$runner_dir/credentials.env" || {
  echo 'The Block Topia art runner credentials are missing.' >&2
  exit 1
}
test -x "$(command -v "${BLOCK_TOPIA_CHROMIUM:-chromium}")" || {
  echo 'Chromium is missing. Install it or set BLOCK_TOPIA_CHROMIUM to its executable.' >&2
  exit 1
}

install -d -m 700 "$runner_dir"
mkdir -p "$units"
install -m 600 "$scripts_dir/block-topia-build-queue.cjs" "$runner_dir/build-queue.cjs"
cat > "$units/block-topia-build.service" <<UNIT
[Unit]
Description=Build one approved Block Topia waterfront issue

[Service]
Type=oneshot
WorkingDirectory=%h/.local/share/block-topia-art
Environment=PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin:/snap/bin
Environment="BLOCK_TOPIA_CHROMIUM=$(command -v "${BLOCK_TOPIA_CHROMIUM:-chromium}")"
ExecStart="$node_bin" --env-file=%h/.local/share/block-topia-art/credentials.env %h/.local/share/block-topia-art/build-queue.cjs
TimeoutStartSec=45min
UNIT
cat > "$units/block-topia-build.timer" <<'UNIT'
[Unit]
Description=Check for approved Block Topia waterfront issues

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now block-topia-build.timer
systemctl --user list-timers block-topia-build.timer --no-pager
