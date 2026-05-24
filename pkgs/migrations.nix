{ pkgs, migrationsDir }:
pkgs.runCommand "cup-collector-migrations" { } ''
  cp -r ${migrationsDir} $out
''
