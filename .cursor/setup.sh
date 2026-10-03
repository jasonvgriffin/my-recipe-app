#!/usr/bin/env bash
# Setup for Cursor cloud agents (Linux). Installs Node (if missing/too old) and npm deps
# so agents can run `npm run typecheck`, `npm test` and `npm run lint`.
# Android SDK/Gradle builds are NOT done here; they run in GitHub Actions (.github/workflows/android.yml).
set -euo pipefail

REQUIRED_MAJOR=22
need_node=1
if command -v node >/dev/null 2>&1; then
  major=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$major" -ge "$REQUIRED_MAJOR" ]; then need_node=0; fi
fi

if [ "$need_node" = 1 ]; then
  echo "Installing Node ${REQUIRED_MAJOR} via nvm..."
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install "$REQUIRED_MAJOR"
  nvm alias default "$REQUIRED_MAJOR"
fi

node -v
npm -v
npm ci
