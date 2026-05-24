{ pkgs }:
pkgs.writeShellScriptBin "cc-dev-next-https" ''
      ADDR="''${1:?Usage: dev-next-https <address>  e.g. dev-next-https 100.127.228.31}"

      # Require PocketBase to be running before starting the proxy + Next.js.
      if ! curl -sf http://127.0.0.1:8090/api/health >/dev/null 2>&1; then
        echo "ERROR: PocketBase is not running on :8090."
        echo "PocketBase must be started first: run pb-serve"
        exit 1
      fi

      PROJ_ROOT="$(git rev-parse --show-toplevel)"
      WORKDIR="$(mktemp -d)"
      CONTAINER_NAME="cup-collector-https-proxy"

      cleanup() {
        podman stop "''${CONTAINER_NAME}" 2>/dev/null || true
        podman rm   "''${CONTAINER_NAME}" 2>/dev/null || true
        rm -rf "''${WORKDIR}"
      }
      trap cleanup EXIT INT TERM

      # Remove any leftover container from a previous run
      podman rm -f "''${CONTAINER_NAME}" 2>/dev/null || true

      # Self-signed cert with IP SAN — browsers require this for bare-IP certs
      openssl req -x509 -newkey rsa:2048 \
        -keyout "''${WORKDIR}/key.pem" \
        -out    "''${WORKDIR}/cert.pem" \
        -days 1 -nodes \
        -subj "/CN=local-dev" \
        -addext "subjectAltName=IP:''${ADDR}"

      cat > "''${WORKDIR}/default.conf" <<'NGINXEOF'
  server {
      listen 443 ssl;
      server_name _;

      ssl_certificate     /etc/nginx/certs/cert.pem;
      ssl_certificate_key /etc/nginx/certs/key.pem;

      client_max_body_size 20m;

      location / {
          proxy_pass         http://NEXT_ADDR:3000;
          proxy_http_version 1.1;
          proxy_set_header   Upgrade $http_upgrade;
          proxy_set_header   Connection "upgrade";
          proxy_set_header   Host $http_host;
          proxy_set_header   X-Forwarded-Host $http_host;
          proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header   X-Forwarded-Proto $scheme;
      }
  }
  NGINXEOF
      sed -i "s/NEXT_ADDR/''${ADDR}/g" "''${WORKDIR}/default.conf"

      podman run -d \
        --name "''${CONTAINER_NAME}" \
        -p 8443:443 \
        -v "''${WORKDIR}/cert.pem:/etc/nginx/certs/cert.pem:ro,Z" \
        -v "''${WORKDIR}/key.pem:/etc/nginx/certs/key.pem:ro,Z" \
        -v "''${WORKDIR}/default.conf:/etc/nginx/conf.d/default.conf:ro,Z" \
        docker.io/library/nginx:alpine

      echo ""
      echo "HTTPS proxy: https://''${ADDR}:8443"
      echo "First visit: accept the self-signed cert security exception in your browser."
      echo ""
      cd "$PROJ_ROOT/app"
      PLAYWRIGHT_BYPASS_AUTH=1 \
        AUTH_URL="https://''${ADDR}:8443" \
        NEXT_DEV_ORIGIN="''${ADDR}" \
        npm run dev -- --hostname "''${ADDR}"
''
