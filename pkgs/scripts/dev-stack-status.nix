{ pkgs }:
pkgs.writeShellScriptBin "cc-dev-stack-status" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  LOG_DIR="$PROJ_ROOT/.dev-logs"
  echo ""
  echo "  Cup Collector dev stack"
  echo ""
  printf "  %-12s  %-28s  %s\n" "Service" "URL" "Log"
  echo "  ──────────────────────────────────────────────────────────────────────────"
  printf "  %-12s  %-28s  %s\n" "PocketBase"  "http://localhost:8090"  "$LOG_DIR/pocketbase.log"
  printf "  %-12s  %-28s  %s\n" "PocketID"    "http://localhost:1411"  "$LOG_DIR/pocketid.log"
  printf "  %-12s  %-28s  %s\n" "Next.js"     "http://localhost:3000"  "$LOG_DIR/nextjs.log"
  printf "  %-12s  %-28s  %s\n" "Docs"        "http://localhost:4000"  "$LOG_DIR/docs.log"
  echo ""
  echo "  Press Enter to stop all services and close this session."
  echo "  From another shell:  dev-stack-kill"
  echo ""
  read -r
  exec cc-dev-stack-kill
''
