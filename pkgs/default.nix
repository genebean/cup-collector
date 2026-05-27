{
  pkgs,
  migrationsDir,
  appSrc,
  docsDir,
  changelogFile,
}:
{
  migrations = import ./migrations.nix { inherit pkgs migrationsDir; };
  app = import ./app.nix {
    inherit
      pkgs
      appSrc
      docsDir
      changelogFile
      ;
  };
  scripts = import ./scripts { inherit pkgs; };
}
