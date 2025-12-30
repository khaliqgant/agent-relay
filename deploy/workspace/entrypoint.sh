#!/usr/bin/env bash

set -euo pipefail

log() {
  echo "[workspace] $*"
}

PORT="${AGENT_RELAY_DASHBOARD_PORT:-${PORT:-3888}}"
export AGENT_RELAY_DASHBOARD_PORT="${PORT}"
export PORT="${PORT}"

WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
REPO_LIST="${REPOSITORIES:-}"

mkdir -p "${WORKSPACE_DIR}"
cd "${WORKSPACE_DIR}"

# Configure Git credentials for GitHub clones (avoid storing tokens in remotes)
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  GIT_ASKPASS_SCRIPT="/tmp/git-askpass.sh"
  cat > "${GIT_ASKPASS_SCRIPT}" <<'EOF'
#!/usr/bin/env bash
prompt="${1:-}"
if [[ "${prompt}" == *"Username"* ]]; then
  echo "x-access-token"
else
  echo "${GITHUB_TOKEN}"
fi
EOF
  chmod +x "${GIT_ASKPASS_SCRIPT}"
  export GIT_ASKPASS="${GIT_ASKPASS_SCRIPT}"
  export GIT_TERMINAL_PROMPT=0
fi

clone_or_update_repo() {
  local repo="$1"
  repo="${repo// /}"
  if [[ -z "${repo}" ]]; then
    return
  fi

  local repo_name
  repo_name="$(basename "${repo}")"
  local target="${WORKSPACE_DIR}/${repo_name}"
  local url="https://github.com/${repo}.git"

  if [[ -d "${target}/.git" ]]; then
    log "Updating ${repo}..."
    git -C "${target}" remote set-url origin "${url}" >/dev/null 2>&1 || true
    git -C "${target}" fetch --all --prune >/dev/null 2>&1 || true
    git -C "${target}" pull --ff-only >/dev/null 2>&1 || true
  else
    log "Cloning ${repo}..."
    git clone "${url}" "${target}" >/dev/null 2>&1 || {
      log "WARN: Failed to clone ${repo}"
    }
  fi
}

if [[ -n "${REPO_LIST}" ]]; then
  if [[ -z "${GITHUB_TOKEN:-}" ]]; then
    log "WARN: REPOSITORIES set but no GITHUB_TOKEN provided; clones may fail."
  fi

  IFS=',' read -ra repos <<< "${REPO_LIST}"
  for repo in "${repos[@]}"; do
    clone_or_update_repo "${repo}"
  done
fi

log "Starting agent-relay daemon on port ${PORT}"
args=(/app/dist/cli/index.js up --port "${PORT}")

if [[ "${SUPERVISOR_ENABLED:-true}" == "true" ]]; then
  args+=("--watch")
fi

exec node "${args[@]}"
