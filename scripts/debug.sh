#!/usr/bin/env bash
#
# Route real Alexa requests to the code in this working tree.
#
#   ./scripts/debug.sh <notag|lilt|caleb>
#
# Starts an ASK local debug session: while it runs, requests to the skill's
# DEVELOPMENT stage are re-routed from the Alexa service to the code here
# instead of the deployed Lambda. Say the invocation phrase to any Alexa app or
# Echo signed into the same developer account and it executes this working tree.
#
# This is NOT a deployment - nothing is written to the skill's repo, and the
# routing reverts the moment the session ends (Ctrl-C).
#
# ask run needs ask-sdk-local-debug present in the skill project. It is
# installed into the throwaway .deploy/<key>/ directory only, so it never
# reaches lambda/package.json and never gets deployed.

set -euo pipefail

SKILL_KEY="${1:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_ROOT="${REPO_ROOT}/.deploy"

case "$SKILL_KEY" in
    notag) SKILL_ID="amzn1.ask.skill.8b1db85a-e7db-483a-9e43-9164c6a0345c" ;;
    lilt)  SKILL_ID="amzn1.ask.skill.3933e191-2148-4b18-abe2-b6bb2cb2f554" ;;
    caleb) SKILL_ID="amzn1.ask.skill.b6a15073-9729-49b1-a07e-85ed9c439e4d" ;;
    *)
        echo "usage: $0 <notag|lilt|caleb>" >&2
        exit 2
        ;;
esac

command -v ask >/dev/null 2>&1 || {
    echo "error: 'ask' CLI not found on PATH." >&2
    exit 1
}

mkdir -p "$WORK_ROOT"
WORK_DIR="${WORK_ROOT}/${SKILL_KEY}"

if [ ! -f "${WORK_DIR}/ask-resources.json" ]; then
    echo "Setting up a local skill project for '${SKILL_KEY}'..."
    rm -rf "${WORK_DIR:?}"
    printf '%s\n' "$SKILL_KEY" | (cd "$WORK_ROOT" && ask init --hosted-skill-id "$SKILL_ID" >/dev/null)
fi

# Always refresh the code so the session runs the current working tree.
rm -rf "${WORK_DIR:?}/lambda"
cp -r "${REPO_ROOT}/lambda" "${WORK_DIR}/lambda"
rm -rf "${WORK_DIR:?}/skill-package"
cp -r "${REPO_ROOT}/skills/${SKILL_KEY}/skill-package" "${WORK_DIR}/skill-package"

cd "${WORK_DIR}/lambda"
if [ ! -d node_modules/ask-sdk-local-debug ]; then
    echo "Installing debug dependencies (local only, never deployed)..."
    npm install --no-save --no-audit --no-fund ask-sdk-core ask-sdk-model ask-sdk-local-debug >/dev/null
fi

cd "$WORK_DIR"
echo
echo "Starting local debug session for '${SKILL_KEY}'."
echo "Say the invocation phrase to Alexa on your phone; it will run THIS code."
echo "Press Ctrl-C to stop and hand the skill back to its deployed Lambda."
echo
exec ask run --profile default
