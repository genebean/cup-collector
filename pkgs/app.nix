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
  version = "1.1.2";
  inherit src;
  nodejs = pkgs.nodejs_24;

  # Recompute this hash after any package-lock.json change:
  #   nix run nixpkgs#prefetch-npm-deps app/package-lock.json
  npmDepsHash = "sha256-Sf/gK1ESaFfgabc8Bb3Bc4DNZcqU6yiY4CwtFuzAnMQ=";

  # eslint-plugin-import (bundled in eslint-config-next) declares peer deps up
  # to eslint v9 only. --legacy-peer-deps skips peer dep validation and uses
  # the lock file as-is, matching what the lint CI job already does. Remove
  # this once eslint-config-next upgrades eslint-plugin-import to v10-aware.
  npmFlags = [ "--legacy-peer-deps" ];

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
