{
  pkgs,
  appSrc,
  docsDir,
}:
pkgs.buildNpmPackage {
  pname = "cup-collector";
  version = "0.1.0";
  src = appSrc;
  nodejs = pkgs.nodejs_24;

  # Recompute this hash after any package-lock.json change:
  #   1. Set npmDepsHash = pkgs.lib.fakeHash;
  #   2. Run `nix build` — it fails with "got: sha256-..."
  #   3. Copy that hash here and run `nix build` again.
  npmDepsHash = "sha256-nUxu/48XCVjsEX41ZccmYnVQKLnjztfxN1m9/O7IMYk=";

  buildPhase = "npm run build";

  # Copy the standalone server output and required static directories.
  # Next.js standalone mode produces a self-contained node server.
  installPhase = ''
    mkdir -p $out
    cp -r .next/standalone $out/
    cp -r public $out/standalone/public
    cp -r .next/static $out/standalone/.next/static
    cp -r ${docsDir} $out/standalone/docs
  '';
}
