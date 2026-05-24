{ pkgs }:
pkgs.writeShellScriptBin "cc-dev-next" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  cd "$PROJ_ROOT/app"
  exec npm run dev
''
