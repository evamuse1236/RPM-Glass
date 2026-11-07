#!/usr/bin/env bash
# Installs the bridge as a user service on the PC that holds the Telegram session, and puts it on the tailnet.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$HOME/.local/share/rpm-telegram-bridge"
mkdir -p "$dest" "$HOME/.config/systemd/user"
cp "$here/bridge.py" "$here/logic.py" "$dest/"
cp "$here/rpm-telegram-bridge.service" "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now rpm-telegram-bridge.service
systemctl --user restart rpm-telegram-bridge.service
sudo tailscale serve --bg --https=8466 http://127.0.0.1:8466
