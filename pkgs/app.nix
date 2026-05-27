{
  pkgs,
  appSrc,
  docsDir,
  changelogFile,
}:
let
  # Merge CHANGELOG.md (repo root) into the app source tree so the Next.js
  # server component can read it at build time via process.cwd()/CHANGELOG.md.
  src = pkgs.runCommand "cup-collector-src" { } ''
    cp -r ${appSrc}/. $out
    chmod -R u+w $out
    cp ${changelogFile} $out/CHANGELOG.md
  '';
in
pkgs.buildNpmPackage {
  pname = "cup-collector";
  version = "1.0.0";
  inherit src;
  nodejs = pkgs.nodejs_24;

  # Recompute this hash after any package-lock.json change:
  #   1. Set npmDepsHash = pkgs.lib.fakeHash;
  #   2. Run `nix build` — it fails with "got: sha256-..."
  #   3. Copy that hash here and run `nix build` again.
  npmDepsHash = "sha256-OIKdKkFzsfAAxi3Am2zDc3XDxdMUgFEsy0tIg1eUVkc=";

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
