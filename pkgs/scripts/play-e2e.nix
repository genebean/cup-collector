{ pkgs }:
pkgs.writeShellScriptBin "cc-play-e2e" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  cd "$PROJ_ROOT/app"
  exec npx playwright test "$@"
''
