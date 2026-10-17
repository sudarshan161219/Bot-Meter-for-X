#!/usr/bin/env bash
# Renders the Creator Tools for X icons (creator-tools/icons/) from store/creator-tools-icon.svg
# with headless Chrome. Only needed when the SVG changes.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=8798
CHROME=${CHROME:-google-chrome}
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1

# Creator Tools for X icons, from store/creator-tools-icon.svg (transparent corners).
for size in 16 32 48 128; do
  timeout 30 "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --virtual-time-budget=1000 --window-size="$size,$size" \
    --screenshot="$PWD/creator-tools/icons/icon$size.png" "http://127.0.0.1:$PORT/store/creator-tools-icon.html" 2>/dev/null
done
ls -la creator-tools/icons
