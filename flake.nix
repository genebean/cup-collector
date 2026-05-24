{
  description = "Cup Collector — Starbucks cup collection tracker";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        packages' = import ./pkgs {
          inherit pkgs;
          migrationsDir = ./pocketbase/migrations;
          appSrc = ./app;
          docsDir = ./docs;
        };

      in
      {

        # `nix fmt` — format all Nix files in the tree using nixfmt
        formatter = pkgs.nixfmt-tree;

        # `nix build .#migrations` — PocketBase migrations store path
        # `nix build`              — Next.js app (standalone Node server)
        packages = {
          inherit (packages') migrations;
          default = packages'.app;
        };

        # `nix develop` — dev shell with all required tooling
        # ALL node/npm/npx/ts-node/pocketbase commands MUST run inside this shell.
        # Never install these tools on the host system directly.
        devShells.default = pkgs.mkShell {
          buildInputs =
            with pkgs;
            [
              nodejs_24
              python3 # used by cc-docs-serve (stdlib http.server, no extra deps)
              sqlite # used to inspect PocketBase's SQLite database directly
              tmux # used by cc-dev-stack to manage the dev service windows
              deadnix # Nix dead-code linter — used by pre-commit nixfmt hook
              nixfmt-tree # Nix formatter — used by `nix fmt` and pre-commit
              # PocketBase runs via podman (matches production; stays current automatically).
              # typescript and ts-node are installed as npm devDependencies in app/
              # and invoked via `npx` — this avoids node-version mismatches in nixpkgs.
            ]
            ++ packages'.scripts;

          shellHook = ''
            # Short unprefixed aliases — each delegates to the cc-* binary so
            # the implementation lives in one place. Use `nix develop -c cc-<name>`
            # to call any of these from outside an interactive shell.
            dev-stack()          { cc-dev-stack "$@"; }
            dev-stack-kill()     { cc-dev-stack-kill "$@"; }
            pb-serve()           { cc-pb-serve "$@"; }
            pocketid-serve()     { cc-pocketid-serve "$@"; }
            dev-next()           { cc-dev-next "$@"; }
            dev-next-bypass()    { cc-dev-next-bypass "$@"; }
            dev-next-network()   { cc-dev-next-network "$@"; }
            dev-next-https()     { cc-dev-next-https "$@"; }
            docs-serve()         { cc-docs-serve "$@"; }
            check()              { cc-check "$@"; }
            playwright-install() { cc-playwright-install "$@"; }
            play-e2e()           { cc-play-e2e "$@"; }
            import-cups()        { cc-import-cups "$@"; }
            build-catalog()      { cc-build-catalog "$@"; }
            backfill-region()    { cc-backfill-region "$@"; }
            gen-auth-secret()    { cc-gen-auth-secret "$@"; }
            create-household()   { cc-create-household "$@"; }

            if [[ $- == *i* ]]; then
              echo "Cup Collector dev shell"
              echo ""
              echo "  Stack (tmux — starts everything at once):"
              echo "    dev-stack             start PocketBase + PocketID + Next.js + Docs in tmux"
              echo "    dev-stack-kill        stop all services and close the tmux session"
              echo ""
              echo "  Local dev (individual services):"
              echo "    pb-serve              start PocketBase on :8090 (applies migrations)"
              echo "    pocketid-serve        start PocketID on :1411"
              echo "    dev-next              start Next.js on :3000"
              echo "    docs-serve            serve docs on :4000"
              echo ""
              echo "  Mobile / network testing:"
              echo "    dev-next-bypass       start Next.js with auth bypass"
              echo "    dev-next-network      Next.js on <addr>:3000 over Tailscale"
              echo "    dev-next-https        Next.js with HTTPS proxy on :8443 (geolocation)"
              echo ""
              echo "  Testing & quality:"
              echo "    check                 pre-commit hooks, unit tests, lint, tsc"
              echo "    playwright-install    install Playwright's Chrome (one-time setup)"
              echo "    play-e2e              run Playwright e2e tests"
              echo ""
              echo "  Catalog:"
              echo "    build-catalog         scrape catalog to CSV"
              echo "    import-cups           import CSV into PocketBase"
              echo "    backfill-region       fix missing region from same-series siblings"
              echo ""
              echo "  Setup:"
              echo "    gen-auth-secret       generate AUTH_SECRET value"
              echo "    create-household      create household in PocketBase"
              echo ""
              echo "  All commands also available as cc-* (e.g. nix develop -c cc-check)."
              echo ""
              echo "  First-time PocketID setup:"
              echo "    1. Run pocketid-serve (or dev-stack), then open http://localhost:1411"
              echo "    2. Create admin account, add an OIDC application"
              echo "    3. Copy client ID/secret into app/.env.local"
            fi
          '';
        };

      }
    )
    // {
      # NixOS module — exported at top level (system-independent)
      # Consumed by genebean/dots: imports = [ inputs.cup-collector.nixosModules.default ];
      # The wrapper sets appPackage from this flake's own packages output so consumers
      # don't have to set it manually. Override to use a different build:
      #   services.cupCollector.appPackage = inputs.cup-collector.packages.${pkgs.system}.default;
      nixosModules.default =
        { lib, pkgs, ... }:
        {
          imports = [ ./nixos/module.nix ];
          services.cupCollector.appPackage =
            lib.mkDefault
              self.packages.${pkgs.stdenv.hostPlatform.system}.default;
        };

      # Minimal NixOS configuration used by CI to verify the module evaluates and
      # builds cleanly without deploying to production.
      # Verified by: nix build .#nixosConfigurations.test.config.system.build.toplevel
      nixosConfigurations.test = nixpkgs.lib.nixosSystem {
        modules = [
          self.nixosModules.default
          {
            nixpkgs.hostPlatform = "x86_64-linux";
            services.cupCollector = {
              enable = true;
              domain = "cups.example.com";
              pocketidIssuerUrl = "https://id.example.com";
              migrationsDir = self.packages.x86_64-linux.migrations;
              households = [
                {
                  name = "Test Household";
                  slug = "test_household";
                }
              ];
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
