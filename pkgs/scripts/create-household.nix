{ pkgs }:
pkgs.writeShellScriptBin "cc-create-household" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  set -a
  source "$PROJ_ROOT/app/.env.local"
  set +a
  NODE_PATH="$PROJ_ROOT/app/node_modules" \
    "$PROJ_ROOT/app/node_modules/.bin/ts-node" \
    --transpile-only \
    --project "$PROJ_ROOT/scripts/tsconfig.json" \
    "$PROJ_ROOT/scripts/create-household.ts" \
    "$@"
''
