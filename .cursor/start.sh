#!/usr/bin/env bash
# Boot the Expo web app. Safe to rerun: if port 8081 is already serving, exit.
set -euo pipefail

cd /workspace
export PATH="/usr/local/bin:${PATH}"
export EXPO_NO_TELEMETRY=1
export BROWSER=none

# Expo binds the dev server to IPv6 localhost (::1). `curl http://127.0.0.1:8081`
# does not reach it. Leave CI unset so Metro keeps file watching.
PORT=8081
if curl -sf -g -o /dev/null --max-time 2 "http://[::1]:${PORT}/"; then
  echo "Expo web already listening on ${PORT}"
  exit 0
fi

exec npx expo start --web --localhost --port "${PORT}"
