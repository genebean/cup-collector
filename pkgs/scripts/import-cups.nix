{ pkgs }:
pkgs.writeShellScriptBin "cc-import-cups" ''
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
    "$PROJ_ROOT/app/node_modules/.bin/tsx" \
    "$PROJ_ROOT/scripts/import-cups.ts" \
    "''${PASS_ARGS[@]}"
''
