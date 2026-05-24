# Dev shell scripts for Cup Collector.
# Each is a proper Nix derivation (cc-* binary in the dev shell PATH).
# Callable two ways:
#   - Inside `nix develop`: short alias (e.g. `check`, `dev-stack`)
#   - From outside (CI, editor tasks): `nix develop -c cc-check`
# Scripts find the project root via `git rev-parse --show-toplevel` so
# they work from any subdirectory.
{ pkgs }:

let

  # ── Individual services ────────────────────────────────────────────────────

  # Start PocketBase on localhost:8090 with migrations applied automatically.
  # Uses the same OCI image version as nixos/module.nix (kept in sync by Renovate).
  ccPbServe = pkgs.writeShellScriptBin "cc-pb-serve" ''
    PROJ_ROOT="$(git rev-parse --show-toplevel)"
    mkdir -p "$PROJ_ROOT/pocketbase/pb_data"
    exec podman run --rm \
      --name cup-collector-pb \
      -p 127.0.0.1:8090:8090 \
      -v "$PROJ_ROOT/pocketbase/pb_data:/pb/pb_data:Z" \
      -v "$PROJ_ROOT/pocketbase/migrations:/pb/pb_migrations:ro,Z" \
      ghcr.io/muchobien/pocketbase:0.38.0 \
      serve \
      --dir=/pb/pb_data \
      --migrationsDir=/pb/pb_migrations \
      --http=0.0.0.0:8090
  '';

  # Start a self-contained PocketID v2 OIDC provider for local dev on :1411.
  # localhost is a WebAuthn secure context, so plain HTTP works here.
  # No TRUST_PROXY — we hit the container directly (unlike prod which uses nginx).
  # First run: visit http://localhost:1411/setup to create the admin account,
  # then create an OIDC application and copy the client ID/secret into
  # app/.env.local (POCKETID_CLIENT_ID / POCKETID_CLIENT_SECRET).
  ccPocketidServe = pkgs.writeShellScriptBin "cc-pocketid-serve" ''
    PROJ_ROOT="$(git rev-parse --show-toplevel)"
    mkdir -p "$PROJ_ROOT/pocketid/data"
    key_file="$PROJ_ROOT/pocketid/encryption_key"
    if [ ! -f "$key_file" ]; then
      openssl rand -base64 32 > "$key_file"
      chmod 600 "$key_file"
      echo "Generated PocketID encryption key: $key_file"
    fi
    ENCRYPTION_KEY="$(cat "$key_file")"
    exec podman run --rm \
      --name cup-collector-pocketid \
      -p 127.0.0.1:1411:1411 \
      -e APP_URL=http://localhost:1411 \
      -e ENCRYPTION_KEY="$ENCRYPTION_KEY" \
      -v "$PROJ_ROOT/pocketid/data:/app/data:Z" \
      ghcr.io/pocket-id/pocket-id:v2
  '';

  # Start the Next.js dev server on :3000 (from any directory).
  ccDevNext = pkgs.writeShellScriptBin "cc-dev-next" ''
    PROJ_ROOT="$(git rev-parse --show-toplevel)"
    cd "$PROJ_ROOT/app"
    exec npm run dev
  '';

  # Start the Next.js dev server with the Playwright auth bypass enabled.
  # Optional — play-e2e starts and stops its own server automatically.
  # Use this when you want to manually inspect auth-bypass behaviour.
  ccDevNextBypass = pkgs.writeShellScriptBin "cc-dev-next-bypass" ''
    PROJ_ROOT="$(git rev-parse --show-toplevel)"
    cd "$PROJ_ROOT/app"
    exec env PLAYWRIGHT_BYPASS_AUTH=1 npm run dev
  '';

  # Start the Next.js dev server with auth bypass bound to a specific address.
  # Useful for testing from a phone over Tailscale.
  # Usage: dev-next-network <address>   e.g. dev-next-network 100.127.228.31
  # Overrides AUTH_URL so Auth.js redirects go to the right host.
  # Access at http://<address>:3000
  ccDevNextNetwork = pkgs.writeShellScriptBin "cc-dev-next-network" ''
    ADDR="''${1:?Usage: dev-next-network <address>  e.g. dev-next-network 100.127.228.31}"
    PROJ_ROOT="$(git rev-parse --show-toplevel)"
    cd "$PROJ_ROOT/app"
    exec env PLAYWRIGHT_BYPASS_AUTH=1 AUTH_URL="http://''${ADDR}:3000" npm run dev -- --hostname "''${ADDR}"
  '';

  # Start Next.js with a local HTTPS proxy for mobile testing over Tailscale.
  # Required for features that need a secure context (e.g. geolocation on mobile).
  # Uses a podman nginx:alpine container with a self-signed IP SAN cert on :8443.
  # No internet access needed — works entirely over the local Tailscale network.
  # Usage: dev-next-https <address>   e.g. dev-next-https 100.127.228.31
  # First visit: accept the self-signed cert security exception in your browser.
  ccDevNextHttps = pkgs.writeShellScriptBin "cc-dev-next-https" ''
        ADDR="''${1:?Usage: dev-next-https <address>  e.g. dev-next-https 100.127.228.31}"

        # Require PocketBase to be running before starting the proxy + Next.js.
        if ! curl -sf http://127.0.0.1:8090/api/health >/dev/null 2>&1; then
          echo "ERROR: PocketBase is not running on :8090."
          echo "PocketBase must be started first: run pb-serve"
          exit 1
        fi

        PROJ_ROOT="$(git rev-parse --show-toplevel)"
        WORKDIR="$(mktemp -d)"
        CONTAINER_NAME="cup-collector-https-proxy"

        cleanup() {
          podman stop "''${CONTAINER_NAME}" 2>/dev/null || true
          podman rm   "''${CONTAINER_NAME}" 2>/dev/null || true
          rm -rf "''${WORKDIR}"
        }
        trap cleanup EXIT INT TERM

        # Remove any leftover container from a previous run
        podman rm -f "''${CONTAINER_NAME}" 2>/dev/null || true

        # Self-signed cert with IP SAN — browsers require this for bare-IP certs
        openssl req -x509 -newkey rsa:2048 \
          -keyout "''${WORKDIR}/key.pem" \
          -out    "''${WORKDIR}/cert.pem" \
          -days 1 -nodes \
          -subj "/CN=local-dev" \
          -addext "subjectAltName=IP:''${ADDR}"

        cat > "''${WORKDIR}/default.conf" <<'NGINXEOF'
    server {
        listen 443 ssl;
        server_name _;

        ssl_certificate     /etc/nginx/certs/cert.pem;
        ssl_certificate_key /etc/nginx/certs/key.pem;

        client_max_body_size 20m;

        location / {
            proxy_pass         http://NEXT_ADDR:3000;
            proxy_http_version 1.1;
            proxy_set_header   Upgrade $http_upgrade;
            proxy_set_header   Connection "upgrade";
            proxy_set_header   Host $http_host;
            proxy_set_header   X-Forwarded-Host $http_host;
            proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
        }
    }
    NGINXEOF
        sed -i "s/NEXT_ADDR/''${ADDR}/g" "''${WORKDIR}/default.conf"

        podman run -d \
          --name "''${CONTAINER_NAME}" \
          -p 8443:443 \
          -v "''${WORKDIR}/cert.pem:/etc/nginx/certs/cert.pem:ro,Z" \
          -v "''${WORKDIR}/key.pem:/etc/nginx/certs/key.pem:ro,Z" \
          -v "''${WORKDIR}/default.conf:/etc/nginx/conf.d/default.conf:ro,Z" \
          docker.io/library/nginx:alpine

        echo ""
        echo "HTTPS proxy: https://''${ADDR}:8443"
        echo "First visit: accept the self-signed cert security exception in your browser."
        echo ""
        cd "$PROJ_ROOT/app"
        PLAYWRIGHT_BYPASS_AUTH=1 \
          AUTH_URL="https://''${ADDR}:8443" \
          NEXT_DEV_ORIGIN="''${ADDR}" \
          npm run dev -- --hostname "''${ADDR}"
  '';

  # Serve the docs/ directory on localhost so you can preview the HTML locally.
  # Uses a custom server class to suppress BrokenPipeError — python's http.server
  # prints a full traceback when a browser closes a connection mid-transfer (normal
  # browser behavior, harmless, but noisy).
  ccDocsServe = pkgs.writeScriptBin "cc-docs-serve" ''
    #!${pkgs.python3}/bin/python3
    import http.server, os, subprocess, sys

    proj_root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
    os.chdir(os.path.join(proj_root, "docs"))

    class QuietHTTPServer(http.server.ThreadingHTTPServer):
        def handle_error(self, request, client_address):
            # BrokenPipeError / ConnectionResetError happen when a browser closes a
            # keepalive connection while the server is still writing the response body.
            # This is normal browser behaviour — suppress the traceback.
            if sys.exc_info()[0] in (BrokenPipeError, ConnectionResetError):
                return
            super().handle_error(request, client_address)

    print("Docs available at http://localhost:4000")
    with QuietHTTPServer(("0.0.0.0", 4000), http.server.SimpleHTTPRequestHandler) as httpd:
        httpd.serve_forever()
  '';

  # ── Dev stack (tmux) ────────────────────────────────────────────────────────

  # Status window content — lists services and waits for Enter to kill the stack.
  # Shown in the Status tmux window. Agents can send Enter to trigger shutdown.
  ccDevStackStatus = pkgs.writeShellScriptBin "cc-dev-stack-status" ''
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
  '';

  # Stop all dev stack services and kill the tmux session.
  # Works from inside or outside the tmux session.
  # Agents: call this directly or send Enter to the Status window.
  ccDevStackKill = pkgs.writeShellScriptBin "cc-dev-stack-kill" ''
    SESSION="cc-dev"
    echo "Stopping dev stack..."
    podman stop cup-collector-pb cup-collector-pocketid 2>/dev/null || true
    tmux kill-session -t "$SESSION" 2>/dev/null || true
    echo "Done."
  '';

  # Launch the full dev stack in a tmux session named cc-dev.
  # Creates 5 windows: PocketBase, PocketID, Next, Docs, Status.
  # Each service logs to .dev-logs/<service>.log in real time.
  # Attaches to an existing session if one is already running.
  # Kill with: dev-stack-kill  (or press Enter in the Status window)
  ccDevStack = pkgs.writeShellScriptBin "cc-dev-stack" ''
    SESSION="cc-dev"
    PROJ_ROOT="$(git rev-parse --show-toplevel)"
    LOG_DIR="$PROJ_ROOT/.dev-logs"

    # nix develop overrides $SHELL to point to its own bash, which tmux would
    # start as a login shell — triggering 'shopt: progcomp' errors from
    # bash-completion. Read the user's real login shell from the system database
    # instead, and pass it as an explicit command so tmux never uses login mode.
    USER_SHELL="$(getent passwd "$(id -un)" | cut -d: -f7)"
    USER_SHELL="''${USER_SHELL:-''${SHELL}}"

    # Attach to existing session rather than starting a second stack
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      exec tmux attach-session -t "$SESSION"
    fi

    mkdir -p "$LOG_DIR"

    # Pass USER_SHELL as the window command so the first window is not a login
    # shell. Set default-command for all subsequent new-window calls.
    tmux new-session -d -s "$SESSION" -n "Status" -- "''${USER_SHELL}"
    tmux set-option -t "$SESSION" mouse on
    tmux set-option -t "$SESSION" status-position bottom
    tmux set-option -t "$SESSION" default-command "''${USER_SHELL}"

    tmux send-keys -t "$SESSION:Status" \
      "cc-dev-stack-status" Enter

    tmux new-window -t "$SESSION" -n "PocketBase"
    tmux send-keys -t "$SESSION:PocketBase" \
      "cc-pb-serve 2>&1 | tee '$LOG_DIR/pocketbase.log'" Enter

    tmux new-window -t "$SESSION" -n "PocketID"
    tmux send-keys -t "$SESSION:PocketID" \
      "cc-pocketid-serve 2>&1 | tee '$LOG_DIR/pocketid.log'" Enter

    tmux new-window -t "$SESSION" -n "Next"
    tmux send-keys -t "$SESSION:Next" \
      "cc-dev-next 2>&1 | tee '$LOG_DIR/nextjs.log'" Enter

    tmux new-window -t "$SESSION" -n "Docs"
    tmux send-keys -t "$SESSION:Docs" \
      "cc-docs-serve 2>&1 | tee '$LOG_DIR/docs.log'" Enter

    tmux select-window -t "$SESSION:Status"
    exec tmux attach-session -t "$SESSION"
  '';

  # ── Testing & quality ──────────────────────────────────────────────────────

  # Install Playwright's Chrome browser to ~/.cache/ms-playwright.
  # Run once after `npm install` or when @playwright/test is updated.
  ccPlaywrightInstall = pkgs.writeShellScriptBin "cc-playwright-install" ''
    PROJ_ROOT="$(git rev-parse --show-toplevel)"
    cd "$PROJ_ROOT/app"
    exec npx playwright install chrome
  '';

  # Run Playwright e2e tests.
  # Automatically starts and stops the dev server — no separate terminal needed.
  ccPlayE2e = pkgs.writeShellScriptBin "cc-play-e2e" ''
    PROJ_ROOT="$(git rev-parse --show-toplevel)"
    cd "$PROJ_ROOT/app"
    exec npx playwright test "$@"
  '';

  # Run the fast CI checks locally — useful before pushing.
  # Covers: pre-commit hooks, unit tests with coverage, ESLint, and TypeScript (app + scripts).
  # (nix build, npm audit, and container checks are skipped — run those separately if needed.)
  ccCheck = pkgs.writeShellScriptBin "cc-check" ''
    PROJ_ROOT="$(git rev-parse --show-toplevel)"
    echo "==> pre-commit hooks"
    pre-commit run --all-files || exit 1
    echo ""
    echo "==> unit tests"
    (cd "$PROJ_ROOT/app" && npm run test:coverage) || exit 1
    echo ""
    echo "==> next lint"
    (cd "$PROJ_ROOT/app" && npm run lint) || exit 1
    echo ""
    echo "==> tsc (app)"
    (cd "$PROJ_ROOT/app" && node_modules/.bin/tsc --noEmit) || exit 1
    echo ""
    echo "==> tsc (scripts)"
    (cd "$PROJ_ROOT" && app/node_modules/.bin/tsc --project scripts/tsconfig.json --noEmit) || exit 1
    echo ""
    echo "All checks passed."
  '';

  # ── Catalog management ─────────────────────────────────────────────────────

  # Import cups from a CSV file into PocketBase.
  # Usage: import-cups --file cups.csv [--dry-run] [--prod] [--debug]
  # --prod loads app/.env.prod instead of app/.env.local (targets production PocketBase).
  # --debug prints [NO CHANGE] lines in addition to creates/updates.
  # Requires POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in the env file.
  ccImportCups = pkgs.writeShellScriptBin "cc-import-cups" ''
    PROJ_ROOT="$(git rev-parse --show-toplevel)"
    ENV_FILE="$PROJ_ROOT/app/.env.local"
    PASS_ARGS=()
    for arg in "$@"; do
      if [[ "$arg" == "--prod" ]]; then
        ENV_FILE="$PROJ_ROOT/app/.env.prod"
      else
        PASS_ARGS+=("$arg")
      fi
    done
    set -a
    source "$ENV_FILE"
    set +a
    NODE_PATH="$PROJ_ROOT/app/node_modules" \
      "$PROJ_ROOT/app/node_modules/.bin/ts-node" \
      --transpile-only \
      --project "$PROJ_ROOT/scripts/tsconfig.json" \
      "$PROJ_ROOT/scripts/import-cups.ts" \
      "''${PASS_ARGS[@]}"
  '';

  # Build a starter cup catalog CSV from the verified community-sourced data table.
  # Usage: build-catalog --out cups.csv [--series "You Are Here"] [--cache-dir .scrape-cache]
  # --cache-dir saves fetched pages to disk and reuses them on subsequent runs.
  # Produces a CSV ready for import-cups.
  ccBuildCatalog = pkgs.writeShellScriptBin "cc-build-catalog" ''
    PROJ_ROOT="$(git rev-parse --show-toplevel)"
    NODE_PATH="$PROJ_ROOT/app/node_modules" \
      "$PROJ_ROOT/app/node_modules/.bin/tsx" \
      "$PROJ_ROOT/scripts/scrape-catalog.ts" \
      "$@"
  '';

  # Backfill missing `region` on cups where a same-series variant already has region set.
  # Usage: backfill-region [--dry-run] [--prod]
  # --prod loads app/.env.prod instead of app/.env.local (targets production PocketBase).
  # Requires POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, and POCKETBASE_ADMIN_PASSWORD.
  ccBackfillRegion = pkgs.writeShellScriptBin "cc-backfill-region" ''
    PROJ_ROOT="$(git rev-parse --show-toplevel)"
    ENV_FILE="$PROJ_ROOT/app/.env.local"
    PASS_ARGS=()
    for arg in "$@"; do
      if [[ "$arg" == "--prod" ]]; then
        ENV_FILE="$PROJ_ROOT/app/.env.prod"
      else
        PASS_ARGS+=("$arg")
      fi
    done
    set -a
    source "$ENV_FILE"
    set +a
    NODE_PATH="$PROJ_ROOT/app/node_modules" \
      "$PROJ_ROOT/app/node_modules/.bin/ts-node" \
      --transpile-only \
      --project "$PROJ_ROOT/scripts/tsconfig.json" \
      "$PROJ_ROOT/scripts/backfill-region.ts" \
      "''${PASS_ARGS[@]}"
  '';

  # ── Setup utilities ────────────────────────────────────────────────────────

  # Print a fresh AUTH_SECRET — paste into app/.env.local.
  ccGenAuthSecret = pkgs.writeShellScriptBin "cc-gen-auth-secret" ''
    exec openssl rand -base64 32
  '';

  # Create a household record in PocketBase.
  # Usage: create-household --name "Our Collection" --slug our-collection
  # Requires POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, and POCKETBASE_ADMIN_PASSWORD in app/.env.local.
  # To target production via SSH tunnel, override those vars in the shell before running.
  ccCreateHousehold = pkgs.writeShellScriptBin "cc-create-household" ''
    PROJ_ROOT="$(git rev-parse --show-toplevel)"
    set -a
    source "$PROJ_ROOT/app/.env.local"
    set +a
    NODE_PATH="$PROJ_ROOT/app/node_modules" \
      "$PROJ_ROOT/app/node_modules/.bin/ts-node" \
      --transpile-only \
      --project "$PROJ_ROOT/scripts/tsconfig.json" \
      "$PROJ_ROOT/scripts/create-household.ts" \
      "$@"
  '';

in
[
  ccDevStack
  ccDevStackKill
  ccDevStackStatus
  ccPbServe
  ccPocketidServe
  ccDevNext
  ccDevNextBypass
  ccDevNextNetwork
  ccDevNextHttps
  ccDocsServe
  ccCheck
  ccPlaywrightInstall
  ccPlayE2e
  ccImportCups
  ccBuildCatalog
  ccBackfillRegion
  ccGenAuthSecret
  ccCreateHousehold
]
