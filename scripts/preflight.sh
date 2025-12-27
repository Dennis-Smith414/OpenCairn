#!/usr/bin/env bash
set -euo pipefail

echo "[preflight] checking docker & compose prerequisites..."

if ! command -v docker >/dev/null 2>&1; then
  echo "\nERROR: 'docker' is not installed or not in PATH." >&2
  echo "Install Docker first: https://docs.docker.com/get-docker/" >&2
  exit 1
fi

# Check docker daemon is running
if ! docker info >/dev/null 2>&1; then
  echo "\nERROR: Docker daemon does not appear to be running or accessible." >&2
  echo "On Linux, try: sudo systemctl start docker" >&2
  echo "Also check DOCKER_HOST environment variable isn't pointing at an unsupported scheme (e.g. http+docker://)." >&2
  exit 1
fi

# Look for modern docker compose, otherwise legacy docker-compose
if docker compose version >/dev/null 2>&1; then
  echo "[preflight] using 'docker compose' (OK)"
elif command -v docker-compose >/dev/null 2>&1; then
  echo "[preflight] 'docker compose' not available, falling back to legacy 'docker-compose' (OK but consider installing the CLI plugin)."
else
  echo "\nERROR: Neither 'docker compose' nor 'docker-compose' were found." >&2
  echo "Install the Docker Compose plugin or legacy docker-compose. See: https://docs.docker.com/compose/" >&2
  exit 1
fi

# Check DOCKER_HOST doesn't use unsupported 'http+docker' scheme which older python docker-compose chokes on
if [ -n "${DOCKER_HOST-}" ]; then
  if echo "$DOCKER_HOST" | grep -q "^http+docker" 2>/dev/null; then
    echo "\nERROR: DOCKER_HOST appears to use an unsupported scheme: $DOCKER_HOST" >&2
    echo "Unset or fix DOCKER_HOST for local docker socket access, e.g. 'unset DOCKER_HOST' or set to unix:///var/run/docker.sock" >&2
    exit 1
  fi
fi

echo "[preflight] OK — docker and compose available\n"

exit 0
