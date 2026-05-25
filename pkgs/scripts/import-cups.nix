{ pkgs }:
pkgs.writeShellScriptBin "cc-import-cups" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  ENV_FILE="$PROJ_ROOT/app/.env.local"
  PASS_ARGS=()
  HAS_FILE=0
  for arg in "$@"; do
    if [[ "$arg" == "--prod" ]]; then
      ENV_FILE="$PROJ_ROOT/app/.env.prod"
    elif [[ "$arg" == "--file" ]]; then
      HAS_FILE=1
      PASS_ARGS+=("$arg")
    else
      PASS_ARGS+=("$arg")
    fi
  done
  if [[ $HAS_FILE -eq 0 ]]; then
    PASS_ARGS=("--file" "$PROJ_ROOT/cups.csv" "''${PASS_ARGS[@]}")
  fi
  set -a
  source "$ENV_FILE"
  set +a
  NODE_PATH="$PROJ_ROOT/app/node_modules" \
    "$PROJ_ROOT/app/node_modules/.bin/tsx" \
    "$PROJ_ROOT/scripts/import-cups.ts" \
    "''${PASS_ARGS[@]}"
''
