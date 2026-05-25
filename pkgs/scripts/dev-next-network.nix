{ pkgs }:
pkgs.writeShellScriptBin "cc-dev-next-network" ''
  # Default to the Tailscale IPv4 address if no argument is given.
  if [ -n "''${1:-}" ]; then
    ADDR="$1"
  elif command -v tailscale >/dev/null 2>&1; then
    ADDR="$(tailscale ip --4 2>/dev/null)" || true
  fi
  if [ -z "''${ADDR:-}" ]; then
    echo "Usage: dev-next-network [address]  (defaults to Tailscale IP)" >&2
    exit 1
  fi
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  cd "$PROJ_ROOT/app"

  # Collect all Tailscale peer DNS names so Next.js allows HMR cross-origin
  # requests from any device on the tailnet without manual per-device config.
  TS_PEERS=""
  if command -v tailscale >/dev/null 2>&1; then
    TS_PEERS="$(tailscale status --json 2>/dev/null \
      | grep '"DNSName"' \
      | sed 's/.*"DNSName": *"\([^"]*\)".*/\1/' \
      | sed 's/\.$//g' \
      | tr '\n' ',' \
      | sed 's/,$//')"
  fi

  exec env \
    PLAYWRIGHT_BYPASS_AUTH=1 \
    AUTH_URL="http://''${ADDR}:3000" \
    ''${TS_PEERS:+NEXT_DEV_ORIGINS="$TS_PEERS"} \
    npm run dev -- --hostname "''${ADDR}"
''
