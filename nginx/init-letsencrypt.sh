#!/usr/bin/env bash
# First-run Let's Encrypt certificate setup.
# Run this ONCE before starting the full stack for the first time.
#
# Usage:
#   bash nginx/init-letsencrypt.sh [--env-file .env.compose]
#
# What it does:
#   1. Downloads recommended TLS parameters from certbot's repo
#   2. Creates a temporary self-signed cert so nginx can start
#   3. Starts nginx, runs certbot to obtain a real cert, reloads nginx
set -euo pipefail

# ── Parse arguments ─────────────────────────────────────────────────────────
ENV_FILE=".env.compose"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found." >&2
  echo "Copy .env.compose.example and fill it in first." >&2
  exit 1
fi

# shellcheck source=/dev/null
set -a; source "$ENV_FILE"; set +a

: "${DOMAIN:?DOMAIN must be set in $ENV_FILE}"
: "${CERTBOT_EMAIL:?CERTBOT_EMAIL must be set in $ENV_FILE}"

CERT_DIR="./data/certbot/conf"
WWW_DIR="./data/certbot/www"

mkdir -p "$CERT_DIR" "$WWW_DIR"

# ── Skip if cert already exists ────────────────────────────────────────────────
if [ -d "$CERT_DIR/live/$DOMAIN" ]; then
  echo "Certificate already exists for $DOMAIN — nothing to do."
  echo "To renew, run: docker compose --env-file $ENV_FILE run --rm certbot renew"
  exit 0
fi

# ── Download recommended TLS parameters ───────────────────────────────────────
if [ ! -f "$CERT_DIR/options-ssl-nginx.conf" ]; then
  echo "Downloading recommended TLS parameters..."
  curl -fsSL "https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf" \
    -o "$CERT_DIR/options-ssl-nginx.conf"
  curl -fsSL "https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/_internal/ssl-dhparams.pem" \
    -o "$CERT_DIR/ssl-dhparams.pem"
fi

# ── Create temporary self-signed cert so nginx can start ───────────────────────
echo "Creating temporary certificate for $DOMAIN..."
mkdir -p "$CERT_DIR/live/$DOMAIN"
docker compose --env-file "$ENV_FILE" run --rm --entrypoint \
  "openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
   -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
   -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
   -subj '/CN=localhost'" \
  certbot 2>/dev/null

# ── Start nginx (it can now find the dummy cert) ────────────────────────────
echo "Starting nginx..."
docker compose --env-file "$ENV_FILE" up --force-recreate -d nginx

# ── Obtain a real certificate ─────────────────────────────────────────────────
echo ""
echo "Deleting temporary certificate..."
rm -rf "$CERT_DIR/live"

echo "Requesting Let's Encrypt certificate for $DOMAIN..."
docker compose --env-file "$ENV_FILE" run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  --email "$CERTBOT_EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

# ── Reload nginx with the real cert ──────────────────────────────────────────
echo "Reloading nginx..."
docker compose --env-file "$ENV_FILE" exec nginx nginx -s reload

echo ""
echo "Done! Start the full stack with:"
echo "  docker compose --env-file $ENV_FILE up -d"
