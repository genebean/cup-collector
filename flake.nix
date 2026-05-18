{
  description = "Cup Collector — Starbucks cup collection tracker";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # ── cc-* dev scripts ─────────────────────────────────────────────────
        # Each is a proper Nix derivation (binary in the dev shell PATH).
        # Callable two ways:
        #   - Inside `nix develop`: use the short alias (e.g. `check`)
        #   - From outside (CI, editor tasks): `nix develop -c cc-check`
        # Scripts find the project root via `git rev-parse --show-toplevel` so
        # they work from any subdirectory.

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
        # Overrides AUTH_URL so Auth.js redirects go to the right host without
        # editing .env.local. Access at http://<address>:3000
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

        # Print a fresh AUTH_SECRET — paste into app/.env.local.
        ccGenAuthSecret = pkgs.writeShellScriptBin "cc-gen-auth-secret" ''
          exec openssl rand -base64 32
        '';

        # Serve the docs/ directory on localhost so you can preview the HTML locally.
        ccDocsServe = pkgs.writeShellScriptBin "cc-docs-serve" ''
          PROJ_ROOT="$(git rev-parse --show-toplevel)"
          echo "Docs available at http://localhost:4000"
          exec python3 -m http.server 4000 --directory "$PROJ_ROOT/docs"
        '';

        # Run the fast CI checks locally — useful before pushing.
        # Covers: pre-commit hooks, unit tests with coverage, and ESLint.
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
          echo "All checks passed."
        '';

        # Import cups from a CSV file into PocketBase.
        # Usage: import-cups --file cups.csv [--dry-run]
        # Requires POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in app/.env.local.
        ccImportCups = pkgs.writeShellScriptBin "cc-import-cups" ''
          PROJ_ROOT="$(git rev-parse --show-toplevel)"
          set -a
          source "$PROJ_ROOT/app/.env.local"
          set +a
          NODE_PATH="$PROJ_ROOT/app/node_modules" \
            "$PROJ_ROOT/app/node_modules/.bin/ts-node" \
            --transpile-only \
            --project "$PROJ_ROOT/scripts/tsconfig.json" \
            "$PROJ_ROOT/scripts/import-cups.ts" \
            "$@"
        '';

        # Build a starter cup catalog CSV from the verified community-sourced data table.
        # Usage: build-catalog --out cups.csv [--series "You Are Here"]
        # Produces a CSV ready for import-cups. Fill in image_url / hobbydb_url manually after.
        ccBuildCatalog = pkgs.writeShellScriptBin "cc-build-catalog" ''
          PROJ_ROOT="$(git rev-parse --show-toplevel)"
          NODE_PATH="$PROJ_ROOT/app/node_modules" \
            "$PROJ_ROOT/app/node_modules/.bin/ts-node" \
            --transpile-only \
            --project "$PROJ_ROOT/scripts/tsconfig.json" \
            "$PROJ_ROOT/scripts/scrape-catalog.ts" \
            "$@"
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

        devScripts = [
          ccPbServe ccPocketidServe ccDevNext ccDevNextBypass ccDevNextNetwork ccDevNextHttps
          ccPlaywrightInstall ccPlayE2e ccGenAuthSecret
          ccDocsServe ccCheck ccImportCups ccBuildCatalog ccCreateHousehold
        ];

      in {

        # `nix build .#migrations` — produces the PocketBase migrations as a store path
        # Reference in the NixOS module: migrationsDir = inputs.cup-collector.packages.${system}.migrations;
        packages.migrations = pkgs.runCommand "cup-collector-migrations" {} ''
          cp -r ${./pocketbase/migrations} $out
        '';

        # `nix build` — produces the Next.js app as a Nix package
        # Uses standalone output mode so it can run as a plain Node process.
        packages.default = pkgs.buildNpmPackage {
          pname = "cup-collector";
          version = "0.1.0";
          src = ./app;
          nodejs = pkgs.nodejs_24;

          # Recompute this hash after any package-lock.json change:
          #   1. Set npmDepsHash = pkgs.lib.fakeHash;
          #   2. Run `nix build` — it fails with "got: sha256-..."
          #   3. Copy that hash here and run `nix build` again.
          npmDepsHash = "sha256-86kGffmVCHED69T3UwEN2yIIyotayuNFUBLVM1e0ang=";

          buildPhase = "npm run build";

          # Copy the standalone server output and required static directories.
          # Next.js standalone mode produces a self-contained node server.
          installPhase = ''
            mkdir -p $out
            cp -r .next/standalone $out/
            cp -r public $out/standalone/public
            cp -r .next/static $out/standalone/.next/static
          '';
        };

        # `nix develop` — dev shell with all required tooling
        # ALL node/npm/npx/ts-node/pocketbase commands MUST run inside this shell.
        # Never install these tools on the host system directly.
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_24
            python3    # used by cc-docs-serve (stdlib http.server, no extra deps)
            sqlite     # used to inspect PocketBase's SQLite database directly
            # PocketBase runs via podman (matches production; stays current automatically).
            # typescript and ts-node are installed as npm devDependencies in app/
            # and invoked via `npx` — this avoids node-version mismatches in nixpkgs.
          ] ++ devScripts;

          shellHook = ''
            # Short unprefixed aliases — each delegates to the cc-* binary so
            # the implementation lives in one place. Use `nix develop -c cc-<name>`
            # to call any of these from outside an interactive shell.
            pb-serve()           { cc-pb-serve "$@"; }
            pocketid-serve()     { cc-pocketid-serve "$@"; }
            dev-next()           { cc-dev-next "$@"; }
            dev-next-bypass()    { cc-dev-next-bypass "$@"; }
            dev-next-network()   { cc-dev-next-network "$@"; }
            dev-next-https()     { cc-dev-next-https "$@"; }
            playwright-install() { cc-playwright-install "$@"; }
            play-e2e()           { cc-play-e2e "$@"; }
            gen-auth-secret()    { cc-gen-auth-secret "$@"; }
            docs-serve()         { cc-docs-serve "$@"; }
            check()              { cc-check "$@"; }
            import-cups()        { cc-import-cups "$@"; }
            build-catalog()      { cc-build-catalog "$@"; }
            create-household()   { cc-create-household "$@"; }

            if [[ $- == *i* ]]; then
              echo "Cup Collector dev shell"
              echo ""
              echo "  pb-serve            start PocketBase on :8090 via podman (applies migrations)"
              echo "  pocketid-serve      start PocketID OIDC provider on :1411 via podman"
              echo "  dev-next            start Next.js dev server on :3000"
              echo "  dev-next-bypass     start Next.js dev server with auth bypass (optional; play-e2e auto-starts one)"
              echo "  dev-next-network    start Next.js on <address>:3000 with auth bypass (phone/Tailscale testing)"
              echo "  dev-next-https      start Next.js with local HTTPS proxy on :8443 (mobile/geolocation testing over Tailscale)"
              echo "  gen-auth-secret     generate a new AUTH_SECRET value"
              echo "  import-cups         import cup catalog from CSV (--file cups.csv [--dry-run])"
              echo "  build-catalog       generate starter catalog CSV (--out cups.csv [--series <name>])"
              echo "  create-household    create a household record in PocketBase (--name <name> --slug <slug>)"
              echo "  docs-serve          serve the HTML docs on http://localhost:4000"
              echo "  check               run pre-commit hooks, unit tests, and lint"
              echo "  playwright-install  install Playwright's Chrome (one-time setup)"
              echo "  play-e2e            run Playwright e2e tests (starts/stops dev server automatically)"
              echo ""
              echo "  All commands are also available as cc-* binaries (e.g. nix develop -c cc-check)."
              echo ""
              echo "  First-time PocketID setup:"
              echo "    1. Run pocketid-serve, then open http://localhost:1411"
              echo "    2. Create admin account, add an OIDC application"
              echo "    3. Copy client ID/secret into app/.env.local"
            fi
          '';
        };

      }) // {
        # NixOS module — exported at top level (system-independent)
        # Consumed by genebean/dots: imports = [ inputs.cup-collector.nixosModules.default ];
        # The wrapper sets appPackage from this flake's own packages output so consumers
        # don't have to set it manually. Override to use a different build:
        #   services.cupCollector.appPackage = inputs.cup-collector.packages.${pkgs.system}.default;
        nixosModules.default = { lib, pkgs, ... }: {
          imports = [ ./nixos/module.nix ];
          services.cupCollector.appPackage = lib.mkDefault self.packages.${pkgs.system}.default;
        };

        # Minimal NixOS configuration used by CI to verify the module evaluates and
        # builds cleanly without deploying to production.
        # Verified by: nix build .#nixosConfigurations.test.config.system.build.toplevel
        nixosConfigurations.test = nixpkgs.lib.nixosSystem {
          system = "x86_64-linux";
          modules = [
            self.nixosModules.default
            {
              services.cupCollector = {
                enable = true;
                domain = "cups.example.com";
                migrationsDir = self.packages.x86_64-linux.migrations;
                # envFile is a runtime secret path — not evaluated at build time.
                envFile = "/run/secrets/cup-collector";
              };
              # Disable boot loader — this config only exists to test module evaluation.
              boot.isContainer = true;
              system.stateVersion = "24.11";
            }
          ];
        };
      };
}
