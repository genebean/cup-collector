{ pkgs }:
pkgs.writeShellScriptBin "cc-gen-auth-secret" ''
  exec openssl rand -base64 32
''
