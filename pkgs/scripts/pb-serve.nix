{ pkgs }:
pkgs.writeShellScriptBin "cc-pb-serve" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  mkdir -p "$PROJ_ROOT/pocketbase/pb_data"
  exec podman run --rm \
    --name cup-collector-pb \
    -p 127.0.0.1:8090:8090 \
    -v "$PROJ_ROOT/pocketbase/pb_data:/pb/pb_data:Z" \
    -v "$PROJ_ROOT/pocketbase/migrations:/pb/pb_migrations:ro,Z" \
    ghcr.io/genebean/pocketbase:0.39.4 \
    serve \
    --dir=/pb/pb_data \
    --migrationsDir=/pb/pb_migrations \
    --http=0.0.0.0:8090
''
