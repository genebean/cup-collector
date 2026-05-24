{ pkgs }:
pkgs.writeShellScriptBin "cc-backfill-region" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  ENV_FILE="$PROJ_ROOT/app/.env.local"
  PASS_ARGS=()
  for arg in "$@"; do
    if [[ "$arg" == "--prod" ]]; then
      ENV_FILE="$PROJ_ROOT/app/.env.prod"
    else
      PASS_ARGS+=("$arg")
    fi
  done
  set -a
  source "$ENV_FILE"
  set +a
  NODE_PATH="$PROJ_ROOT/app/node_modules" \
    "$PROJ_ROOT/app/node_modules/.bin/ts-node" \
    --transpile-only \
    --project "$PROJ_ROOT/scripts/tsconfig.json" \
    "$PROJ_ROOT/scripts/backfill-region.ts" \
    "''${PASS_ARGS[@]}"
''
