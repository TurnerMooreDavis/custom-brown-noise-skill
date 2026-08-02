#!/usr/bin/env bash
#
# Deploy one skill to its Alexa-hosted CodeCommit repository.
#
#   ./scripts/deploy.sh <notag|lilt|caleb>          # dry run: show what would change
#   ./scripts/deploy.sh <notag|lilt|caleb> --push   # actually commit and push (deploys live)
#
# Alexa-hosted skills build and deploy on every push to master, so --push is a
# live deployment. Requires the ask CLI on PATH and a configured ASK profile.

set -euo pipefail

SKILL_KEY="${1:-}"
MODE="${2:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_ROOT="${REPO_ROOT}/.deploy"

case "$SKILL_KEY" in
    notag) SKILL_ID="amzn1.ask.skill.8b1db85a-e7db-483a-9e43-9164c6a0345c" ;;
    lilt)  SKILL_ID="amzn1.ask.skill.3933e191-2148-4b18-abe2-b6bb2cb2f554" ;;
    caleb) SKILL_ID="amzn1.ask.skill.b6a15073-9729-49b1-a07e-85ed9c439e4d" ;;
    *)
        echo "usage: $0 <notag|lilt|caleb> [--push]" >&2
        exit 2
        ;;
esac

command -v ask >/dev/null 2>&1 || {
    echo "error: 'ask' CLI not found on PATH." >&2
    exit 1
}

SRC_SKILL_PACKAGE="${REPO_ROOT}/skills/${SKILL_KEY}/skill-package"
[ -d "$SRC_SKILL_PACKAGE" ] || {
    echo "error: missing ${SRC_SKILL_PACKAGE}" >&2
    exit 1
}

mkdir -p "$WORK_ROOT"
WORK_DIR="${WORK_ROOT}/${SKILL_KEY}"

# `ask init` clones the hosted repo and wires up the CodeCommit credential
# helper. Re-clone each run so we always diff against live, never a stale copy.
if [ -d "$WORK_DIR" ]; then rm -rf "$WORK_DIR"; fi
printf '%s\n' "$SKILL_KEY" | (cd "$WORK_ROOT" && ask init --hosted-skill-id "$SKILL_ID" >/dev/null)

# Shared Lambda source, then this skill's own interaction model and manifest.
rm -rf "${WORK_DIR:?}/lambda"
cp -r "${REPO_ROOT}/lambda" "${WORK_DIR}/lambda"
rm -rf "${WORK_DIR:?}/skill-package"
cp -r "$SRC_SKILL_PACKAGE" "${WORK_DIR}/skill-package"

cd "$WORK_DIR"
git add -A

if git diff --cached --quiet; then
    echo "No changes to deploy for '${SKILL_KEY}' - live already matches this repo."
    exit 0
fi

echo "=== Changes that would deploy to '${SKILL_KEY}' (${SKILL_ID}) ==="
git diff --cached --stat
echo

if [ "$MODE" != "--push" ]; then
    echo "Dry run. Re-run with --push to deploy these changes live."
    exit 0
fi

git commit -q -m "Deploy shared brown noise lambda (${SKILL_KEY})"
git push origin master
echo "Deployed '${SKILL_KEY}'. Check the build status in the Alexa developer console."
