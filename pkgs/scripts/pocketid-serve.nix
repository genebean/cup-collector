{ pkgs }:
pkgs.writeShellScriptBin "cc-pocketid-serve" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  mkdir -p "$PROJ_ROOT/pocketid/data"
  key_file="$PROJ_ROOT/pocketid/encryption_key"
  if [ ! -f "$key_file" ]; then
    openssl rand -base64 32 > "$key_file"
    chmod 600 "$key_file"
    echo "Generated PocketID encryption key: $key_file"
  fi
  ENCRYPTION_KEY="$(cat "$key_file")"
  exec podman run --rm \
    --name cup-collector-pocketid \
    -p 127.0.0.1:1411:1411 \
    -e APP_URL=http://localhost:1411 \
    -e ENCRYPTION_KEY="$ENCRYPTION_KEY" \
    -v "$PROJ_ROOT/pocketid/data:/app/data:Z" \
    ghcr.io/pocket-id/pocket-id:v2
''
