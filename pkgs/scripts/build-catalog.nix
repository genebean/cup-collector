{ pkgs }:
pkgs.writeShellScriptBin "cc-build-catalog" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  NODE_PATH="$PROJ_ROOT/app/node_modules" \
    "$PROJ_ROOT/app/node_modules/.bin/tsx" \
    "$PROJ_ROOT/scripts/scrape-catalog.ts" \
    "$@"
''
