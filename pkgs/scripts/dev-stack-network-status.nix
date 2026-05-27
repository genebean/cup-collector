{ pkgs }:
pkgs.writeShellScriptBin "cc-dev-stack-network-status" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  LOG_DIR="$PROJ_ROOT/.dev-logs"

  NEXT_ADDR="localhost"
  if command -v tailscale >/dev/null 2>&1; then
    _TS_IP="$(tailscale ip --4 2>/dev/null)" || true
    if [ -n "''${_TS_IP:-}" ]; then
      NEXT_ADDR="''${_TS_IP}"
    fi
  fi

  # Returns the port a service is actually listening on.
  # Checks the default port first; if not active, checks default+1 (common
  # Next.js fallback when the preferred port is already in use).
  # Appends " ⚠ (fallback)" when a non-default port is detected.
  find_port() {
    local default_port="$1"
    if ss -tlnp 2>/dev/null | grep -q ":''${default_port}[^0-9]"; then
      printf "%s" "$default_port"
      return
    fi
    local alt=$((default_port + 1))
    if ss -tlnp 2>/dev/null | grep -q ":''${alt}[^0-9]"; then
      printf "%s ⚠ (fallback)" "$alt"
      return
    fi
    printf "%s" "$default_port"
  }

  PB_PORT=$(find_port 8090)
  NEXT_PORT=$(find_port 3000)
  DOCS_PORT=$(find_port 4000)

  echo ""
  echo "  Cup Collector dev stack (network / auth bypass)"
  echo ""
  printf "  %-12s  %-40s  %s\n" "Service" "URL" "Log"
  echo "  ──────────────────────────────────────────────────────────────────────────────────"
  printf "  %-12s  %-40s  %s\n" "PocketBase"  "http://localhost:''${PB_PORT}"           "$LOG_DIR/pocketbase.log"
  printf "  %-12s  %-40s  %s\n" "Next.js"     "http://''${NEXT_ADDR}:''${NEXT_PORT}"  "$LOG_DIR/nextjs.log"
  printf "  %-12s  %-40s  %s\n" "Docs"        "http://localhost:''${DOCS_PORT}"         "$LOG_DIR/docs.log"
  echo ""
  echo "  Press Enter to stop all services and close this session."
  echo "  From another shell:  dev-stack-kill"
  echo ""
  read -r
  exec cc-dev-stack-kill
''
