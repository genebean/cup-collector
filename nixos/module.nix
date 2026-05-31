{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.cupCollector;
  ociBackend = config.virtualisation.oci-containers.backend;
  ociRuntimeBin = "${pkgs.${ociBackend}}/bin/${ociBackend}";
  derivedEnv = pkgs.writeText "cup-collector-derived-env" (
    ''
      NEXTAUTH_URL=https://${cfg.domain}
      POCKETBASE_URL=http://localhost:${toString cfg.pbPort}
      POCKETID_ISSUER_URL=${cfg.pocketidIssuerUrl}
      NEXT_CACHE_DIR=/var/cache/cup-collector
    ''
    + lib.optionalString (cfg.pbDomain != null) ''
      POCKETBASE_PUBLIC_URL=https://${cfg.pbDomain}
    ''
  );
  householdsJson = pkgs.writeText "cup-collector-households" (builtins.toJSON cfg.households);
  pbInitScript = pkgs.writeShellScript "cup-collector-pb-init" ''
    until ${pkgs.curl}/bin/curl -sf http://localhost:${toString cfg.pbPort}/api/health > /dev/null; do
      sleep 1
    done

    # Create/update the PocketBase superuser
    ${ociRuntimeBin} exec cup-collector-pb pocketbase superuser upsert \
      "$POCKETBASE_ADMIN_EMAIL" "$POCKETBASE_ADMIN_PASSWORD" \
      --dir=/pb/pb_data

    # Authenticate as superuser to get an API token
    TOKEN=$(${pkgs.curl}/bin/curl -sf -X POST \
      "http://localhost:${toString cfg.pbPort}/api/collections/_superusers/auth-with-password" \
      -H "Content-Type: application/json" \
      -d "{\"identity\":\"$POCKETBASE_ADMIN_EMAIL\",\"password\":\"$POCKETBASE_ADMIN_PASSWORD\"}" \
      | ${pkgs.jq}/bin/jq -r '.token')

    # Create any households that don't already exist
    ${pkgs.jq}/bin/jq -c '.[]' ${householdsJson} | while IFS= read -r household; do
      NAME=$(printf '%s' "$household" | ${pkgs.jq}/bin/jq -r '.name')
      SLUG=$(printf '%s' "$household" | ${pkgs.jq}/bin/jq -r '.slug')

      EXISTING=$(${pkgs.curl}/bin/curl -sf \
        -G "http://localhost:${toString cfg.pbPort}/api/collections/households/records" \
        --data-urlencode "filter=group_slug=\"$SLUG\"" \
        -H "Authorization: $TOKEN" \
        | ${pkgs.jq}/bin/jq '.totalItems')

      if [ "$EXISTING" = "0" ]; then
        ${pkgs.curl}/bin/curl -sf -X POST \
          "http://localhost:${toString cfg.pbPort}/api/collections/households/records" \
          -H "Content-Type: application/json" \
          -H "Authorization: $TOKEN" \
          -d "{\"name\":\"$NAME\",\"group_slug\":\"$SLUG\"}"
        echo "Created household: $NAME ($SLUG)"
      else
        echo "Household already exists: $SLUG"
      fi
    done
  '';
in
{
  options.services.cupCollector = {
    enable = lib.mkEnableOption "Cup Collector PWA";

    appPackage = lib.mkOption {
      type = lib.types.package;
      description = ''
        The Cup Collector Next.js standalone package.
        Set automatically when imported via the flake's nixosModules.default.
        Override to use a locally-built package:
          services.cupCollector.appPackage = inputs.cup-collector.packages.''${pkgs.stdenv.hostPlatform.system}.default;
      '';
    };

    domain = lib.mkOption {
      type = lib.types.str;
      example = "cups.example.com";
      description = "Public domain for the Next.js app (used for nginx vhost and ACME cert)";
    };

    pbDomain = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "pb.example.com";
      description = ''
        If set, creates a public nginx vhost for the PocketBase admin UI.
        Leave null (the default) to keep PocketBase internal-only.
        When null, access the admin UI via SSH tunnel:
          ssh -L 8090:localhost:8090 yourserver
        then open http://localhost:8090/_/ in your browser.
      '';
    };

    useDnsValidation = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Use DNS-01 ACME challenge validation. Sets acmeRoot = null on nginx vhosts so nginx does not serve the HTTP-01 challenge directory.";
    };

    maxBodySize = lib.mkOption {
      type = lib.types.str;
      default = "0";
      example = "10m";
      description = "nginx client_max_body_size for the app vhost. Defaults to 0 (no limit), which is needed for photo uploads.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "Local port the Next.js app listens on";
    };

    pbPort = lib.mkOption {
      type = lib.types.port;
      default = 8090;
      description = "Local port PocketBase listens on";
    };

    pbBindIp = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      example = "192.168.1.10";
      description = ''
        IP address PocketBase's container port is bound to on the host.
        The default (127.0.0.1) exposes PocketBase only to localhost, which is
        sufficient when nginx proxies all external traffic. Set to a LAN IP to
        reach PocketBase directly from other machines on your network without
        opening it to the public internet.
      '';
    };

    dataDir = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/cup-collector";
      description = "Directory for PocketBase data (pb_data). Back this up.";
    };

    pbImage = lib.mkOption {
      type = lib.types.str;
      default = "ghcr.io/muchobien/pocketbase:0.39.0";
      description = "OCI image for PocketBase. Pin to a specific version for reproducible deployments.";
    };

    migrationsDir = lib.mkOption {
      type = lib.types.path;
      description = ''
        Path to the PocketBase migrations directory.
        Typically set to the flake's migrations output:
          migrationsDir = inputs.cup-collector.packages.''${system}.migrations;
      '';
    };

    pocketidIssuerUrl = lib.mkOption {
      type = lib.types.str;
      example = "https://id.example.com";
      description = "Base URL of your PocketID instance (no trailing slash). Sets POCKETID_ISSUER_URL.";
    };

    households = lib.mkOption {
      type = lib.types.listOf (
        lib.types.submodule {
          options = {
            name = lib.mkOption {
              type = lib.types.str;
              example = "Our Collection";
              description = "Display name shown in the app header on every screen.";
            };
            slug = lib.mkOption {
              type = lib.types.str;
              example = "our_collection";
              description = "Slug matching PocketID group names: cup_collector_{slug}_owner / cup_collector_{slug}_viewer.";
            };
          };
        }
      );
      default = [ ];
      description = "Household records to create in PocketBase on first boot. Idempotent — existing records are not modified.";
    };

    envFile = lib.mkOption {
      type = lib.types.path;
      description = ''
        Path to a file containing secret environment variables.
        Managed by sops-nix or similar — never hardcode secrets.
        The module generates NEXTAUTH_URL, POCKETBASE_URL, and POCKETID_ISSUER_URL
        automatically, so this file only needs: POCKETID_CLIENT_ID,
        POCKETID_CLIENT_SECRET, AUTH_SECRET, POCKETBASE_ADMIN_EMAIL,
        POCKETBASE_ADMIN_PASSWORD, GOOGLE_PLACES_API_KEY.
        See .env.example and docs/reference/spec.html §04 for details.
      '';
    };
  };

  config = lib.mkIf cfg.enable {

    # PocketBase runs as an OCI container.
    # Bound to cfg.pbBindIp (default 127.0.0.1) — localhost-only by default.
    # All browser traffic reaches PocketBase through the Next.js /api/pb proxy,
    # which requires a valid Auth.js session before forwarding requests.
    virtualisation.oci-containers.containers.cup-collector-pb = {
      image = cfg.pbImage;
      cmd = [
        "serve"
        "--dir=/pb/pb_data"
        "--migrationsDir=/pb/pb_migrations"
        "--http=0.0.0.0:8090"
      ];
      ports = [ "${cfg.pbBindIp}:${toString cfg.pbPort}:8090" ];
      volumes = [
        "${cfg.dataDir}/pb_data:/pb/pb_data"
        "${cfg.migrationsDir}:/pb/pb_migrations:ro"
      ];
      autoStart = true;
    };

    # Oneshot service that creates/updates the PocketBase superuser on every boot.
    # Waits for PocketBase to be healthy, then runs `superuser upsert` using the
    # admin credentials from the sops env file. Idempotent — safe to run repeatedly.
    systemd.services.cup-collector-pb-init = {
      description = "Initialize Cup Collector PocketBase superuser";
      after = [ "${ociBackend}-cup-collector-pb.service" ];
      requires = [ "${ociBackend}-cup-collector-pb.service" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        EnvironmentFile = cfg.envFile;
        ExecStart = pbInitScript;
      };
    };

    # Next.js app runs as a native systemd service (no container overhead).
    # Built by Nix via buildNpmPackage — integrates cleanly with NixOS.
    systemd.services.cup-collector = {
      description = "Cup Collector Next.js app";
      wantedBy = [ "multi-user.target" ];
      after = [
        "network.target"
        "cup-collector-pb-init.service"
      ];
      requires = [ "cup-collector-pb-init.service" ];
      serviceConfig = {
        ExecStart = "${pkgs.nodejs_24}/bin/node ${cfg.appPackage}/standalone/server.js";
        EnvironmentFile = [
          derivedEnv
          cfg.envFile
        ];
        Environment = [
          "PORT=${toString cfg.port}"
          "HOSTNAME=127.0.0.1"
          "NODE_ENV=production"
          "AUTH_TRUST_HOST=true"
          "DOCS_DIR=${cfg.appPackage}/standalone/docs"
          "APP_VERSION=${cfg.appPackage.version}"
        ];
        DynamicUser = true;
        StateDirectory = "cup-collector";
        CacheDirectory = "cup-collector";
        Restart = "on-failure";
        RestartSec = "5s";
      };
    };

    # nginx vhosts — added alongside whatever else is on this host.
    services.nginx.virtualHosts = lib.mkMerge [
      {
        ${cfg.domain} = {
          enableACME = true;
          forceSSL = true;
          extraConfig = ''
            client_max_body_size ${cfg.maxBodySize};
          '';
          # Service worker script must never be served from HTTP cache —
          # stale sw.js prevents SW updates from reaching installed PWAs.
          # Browsers cap SW script max-age at 24h, but no-cache forces a
          # revalidation request on every page load instead.
          locations."= /sw.js" = {
            proxyPass = "http://127.0.0.1:${toString cfg.port}";
            extraConfig = ''
              add_header Cache-Control "no-cache, no-store, must-revalidate" always;
              expires 0;
            '';
          };
          locations."/" = {
            proxyPass = "http://127.0.0.1:${toString cfg.port}";
            # proxyWebsockets covers both WebSocket upgrades and SSE (realtime sync)
            proxyWebsockets = true;
          };
        }
        // lib.optionalAttrs cfg.useDnsValidation { acmeRoot = null; };
      }
      # Optional: expose PocketBase admin UI publicly. Default is internal-only.
      # Access the admin UI without this via: ssh -L 8090:localhost:8090 yourserver
      (lib.mkIf (cfg.pbDomain != null) {
        ${cfg.pbDomain} = {
          enableACME = true;
          forceSSL = true;
          extraConfig = ''
            client_max_body_size ${cfg.maxBodySize};
          '';
          locations."/" = {
            proxyPass = "http://127.0.0.1:${toString cfg.pbPort}";
            proxyWebsockets = true;
          };
        }
        // lib.optionalAttrs cfg.useDnsValidation { acmeRoot = null; };
      })
    ];

    # Create data directory before the container tries to mount it
    systemd.tmpfiles.rules = [
      "d ${cfg.dataDir}/pb_data 0750 root root -"
    ];
  };
}
