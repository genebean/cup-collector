{ pkgs }:
pkgs.writeShellScriptBin "cc-dev-next-bypass" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  cd "$PROJ_ROOT/app"
  exec env PLAYWRIGHT_BYPASS_AUTH=1 npm run dev
''
