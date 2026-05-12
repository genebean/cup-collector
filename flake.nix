{
  description = "Cup Collector — Starbucks cup collection tracker";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = nixpkgs.legacyPackages.${system}; in {

        # `nix build` — produces the Next.js app as a Nix package
        # Uses standalone output mode so it can run as a plain Node process.
        packages.default = pkgs.buildNpmPackage {
          pname = "cup-collector";
          version = "0.1.0";
          src = ./app;

          # Recompute this hash after any package-lock.json change:
          #   Run `nix build` — it fails and prints the correct hash.
          #   Copy that hash here and run `nix build` again.
          npmDepsHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

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
            nodejs_20
            pocketbase
            nodePackages.typescript
            nodePackages.ts-node
          ];

          shellHook = ''
            echo "Cup Collector dev shell — all tooling is provided here"
            echo "Do NOT install node/npm/pocketbase on the host system."
            echo ""
            echo "  Start PocketBase:  pocketbase serve --dir ./pocketbase/pb_data"
            echo "  Start Next.js:     cd app && npm run dev"
            echo "  Import cups:       npx ts-node scripts/import-cups.ts --file cups.csv"
            echo "  Dry-run import:    npx ts-node scripts/import-cups.ts --file cups.csv --dry-run"
          '';
        };

      }) // {
        # NixOS module — exported at top level (system-independent)
        # Consumed by genebean/dots: imports = [ inputs.cup-collector.nixosModules.default ];
        nixosModules.default = import ./nixos/module.nix;
      };
}
