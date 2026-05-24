{ pkgs }:
pkgs.writeShellScriptBin "cc-playwright-install" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  cd "$PROJ_ROOT/app"
  exec npx playwright install chrome
''
