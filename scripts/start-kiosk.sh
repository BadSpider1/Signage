#!/usr/bin/env bash
set -euo pipefail

DISPLAY="${DISPLAY:-:0}"
export DISPLAY

exec /usr/bin/chromium-browser \
  --kiosk \
  --app=http://127.0.0.1:8080 \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  --disable-component-update \
  --disable-background-networking \
  --no-first-run \
  --disable-features=TranslateUI \
  --overscroll-history-navigation=0 \
  --disable-pinch \
  --disable-gpu-sandbox
