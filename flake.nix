{
  description = "Cup Collector — Starbucks cup collection tracker";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = nixpkgs.legacyPackages.${system}; in {

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
            python3   # used by docs-serve (stdlib http.server, no extra deps)
            # PocketBase runs via podman (matches production; stays current automatically).
            # typescript and ts-node are installed as npm devDependencies in app/
            # and invoked via `npx` — this avoids node-version mismatches in nixpkgs.
          ];

          shellHook = ''
            PROJ_ROOT="$(pwd)"

            # Start PocketBase on localhost:8090 with migrations applied automatically.
            # Uses the same OCI image version as nixos/module.nix (kept in sync by Renovate).
            pb-serve() {
              mkdir -p "$PROJ_ROOT/pocketbase/pb_data"
              podman run --rm \
                --name cup-collector-pb \
                -p 127.0.0.1:8090:8090 \
                -v "$PROJ_ROOT/pocketbase/pb_data:/pb/pb_data:Z" \
                -v "$PROJ_ROOT/pocketbase/migrations:/pb/pb_migrations:ro,Z" \
                ghcr.io/muchobien/pocketbase:0.38.0 \
                serve \
                --dir=/pb/pb_data \
                --migrationsDir=/pb/pb_migrations \
                --http=0.0.0.0:8090
            }

            # Start a self-contained PocketID v2 OIDC provider for local dev on :1411.
            # localhost is a WebAuthn secure context, so plain HTTP works here.
            # No TRUST_PROXY — we hit the container directly (unlike prod which uses nginx).
            # First run: visit http://localhost:1411/setup to create the admin account,
            # then create an OIDC application and copy the client ID/secret into
            # app/.env.local (POCKETID_CLIENT_ID / POCKETID_CLIENT_SECRET).
            pocketid-serve() {
              mkdir -p "$PROJ_ROOT/pocketid/data"
              local key_file="$PROJ_ROOT/pocketid/encryption_key"
              if [ ! -f "$key_file" ]; then
                openssl rand -base64 32 > "$key_file"
                chmod 600 "$key_file"
                echo "Generated PocketID encryption key: $key_file"
              fi
              podman run --rm \
                --name cup-collector-pocketid \
                -p 127.0.0.1:1411:1411 \
                -e APP_URL=http://localhost:1411 \
                -e ENCRYPTION_KEY="$(cat "$key_file")" \
                -v "$PROJ_ROOT/pocketid/data:/app/data:Z" \
                ghcr.io/pocket-id/pocket-id:v2
            }

            # Start the Next.js dev server (from any directory).
            dev-next() {
              cd "$PROJ_ROOT/app" && npm run dev
            }

            # Start the Next.js dev server with the Playwright auth bypass enabled.
            # Use this in one terminal, then run play-e2e in another.
            dev-next-bypass() {
              cd "$PROJ_ROOT/app" && PLAYWRIGHT_BYPASS_AUTH=1 npm run dev
            }

            # Install Playwright's Chrome browser to ~/.cache/ms-playwright.
            # Run once after `npm install` or when @playwright/test is updated.
            playwright-install() {
              (cd "$PROJ_ROOT/app" && npx playwright install chrome)
            }

            # Run Playwright e2e tests against the dev server.
            # Requires dev-next-bypass running in another terminal first.
            play-e2e() {
              (cd "$PROJ_ROOT/app" && PLAYWRIGHT_BYPASS_AUTH=1 npx playwright test "$@")
            }

            # Print a fresh AUTH_SECRET — paste into app/.env.local.
            gen-auth-secret() {
              openssl rand -base64 32
            }

            # Serve the docs/ directory on localhost so you can preview the HTML locally.
            docs-serve() {
              echo "Docs available at http://localhost:4000"
              python3 -m http.server 4000 --directory "$PROJ_ROOT/docs"
            }

            # Run the fast CI checks locally — useful before pushing.
            # Covers: pre-commit hooks, unit tests, and next lint.
            # (nix build, npm audit, and container checks are skipped — run those separately if needed.)
            check() {
              echo "==> pre-commit hooks"
              pre-commit run --all-files || return 1
              echo ""
              echo "==> unit tests"
              (cd "$PROJ_ROOT/app" && npm test) || return 1
              echo ""
              echo "==> next lint"
              (cd "$PROJ_ROOT/app" && npx next lint) || return 1
              echo ""
              echo "All checks passed."
            }

            # Import cups from a CSV file into PocketBase.
            # Usage: import-cups --file cups.csv [--dry-run]
            # Requires POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in app/.env.local.
            import-cups() {
              set -a && source "$PROJ_ROOT/app/.env.local" && set +a
              NODE_PATH="$PROJ_ROOT/app/node_modules" \
                "$PROJ_ROOT/app/node_modules/.bin/ts-node" \
                --transpile-only \
                --project "$PROJ_ROOT/scripts/tsconfig.json" \
                "$PROJ_ROOT/scripts/import-cups.ts" \
                "$@"
            }

            echo "Cup Collector dev shell"
            echo ""
            echo "  pb-serve            start PocketBase on :8090 via podman (applies migrations)"
            echo "  pocketid-serve      start PocketID OIDC provider on :1411 via podman"
            echo "  dev-next            start Next.js dev server on :3000"
            echo "  dev-next-bypass     start Next.js dev server with Playwright auth bypass"
            echo "  gen-auth-secret     generate a new AUTH_SECRET value"
            echo "  import-cups         import cup catalog from CSV (--file cups.csv [--dry-run])"
            echo "  docs-serve          serve the HTML docs on http://localhost:4000"
            echo "  check               run pre-commit hooks and next lint locally"
            echo "  playwright-install  install Playwright's Chrome (one-time setup)"
            echo "  play-e2e            run Playwright e2e tests (requires dev-next-bypass)"
            echo ""
            echo "  First-time PocketID setup:"
            echo "    1. Run pocketid-serve, then open http://localhost:1411"
            echo "    2. Create admin account, add an OIDC application"
            echo "    3. Copy client ID/secret into app/.env.local"
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
