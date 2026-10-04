#!/usr/bin/env bash
# Cursor cloud agent install. Node must be on the default PATH: login shells
# skip ~/.bashrc, so nvm is not available to later commands. Android SDK and
# Gradle builds stay in GitHub Actions.
set -euo pipefail

NODE_VERSION=22.22.2
NODE_SHA256=88fd1ce767091fd8d4a99fdb2356e98c819f93f3b1f8663853a2dee9b438068a

cd "$(dirname "$0")/.."

node_ok() {
  "$1" -e 'const [maj, min] = process.versions.node.split(".").map(Number); if (!((maj === 20 && min >= 19) || (maj === 22 && min >= 13) || (maj === 24 && min >= 3) || maj >= 25)) process.exit(1);' >/dev/null 2>&1
}

if ! node_ok /usr/local/bin/node; then
  echo "Installing Node ${NODE_VERSION} into /usr/local..."
  tmp="$(mktemp)"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o "$tmp"
  echo "${NODE_SHA256}  ${tmp}" | sha256sum -c -
  sudo tar -xJf "$tmp" -C /usr/local --strip-components=1
  rm -f "$tmp"
fi

export PATH="/usr/local/bin:${PATH}"
hash -r
node -v
npm -v
npm ci
