#!/usr/bin/env bash
# Renders the Chrome Web Store images into store/images/ with headless Chrome.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=8799
CHROME=${CHROME:-google-chrome}
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1

mkdir -p store/images
shot() { # page width height output
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --virtual-time-budget=3000 --window-size="$2,$3" \
    --screenshot="$PWD/store/images/$4" "http://127.0.0.1:$PORT/store/$1" 2>/dev/null
}

shot screenshot-feed.html 1280 800 screenshot-1-feed.png
shot screenshot-settings.html 1280 800 screenshot-2-settings.png
shot promo-tile.html 440 280 promo-small-440x280.png
ls -la store/images
