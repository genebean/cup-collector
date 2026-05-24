{
  pkgs,
  migrationsDir,
  appSrc,
  docsDir,
}:
{
  migrations = import ./migrations.nix { inherit pkgs migrationsDir; };
  app = import ./app.nix { inherit pkgs appSrc docsDir; };
  scripts = import ./scripts { inherit pkgs; };
}
