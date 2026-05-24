{ pkgs }:
pkgs.writeShellScriptBin "cc-dev-next-network" ''
  ADDR="''${1:?Usage: dev-next-network <address>  e.g. dev-next-network 100.127.228.31}"
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  cd "$PROJ_ROOT/app"
  exec env PLAYWRIGHT_BYPASS_AUTH=1 AUTH_URL="http://''${ADDR}:3000" npm run dev -- --hostname "''${ADDR}"
''
