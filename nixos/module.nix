{ config, lib, pkgs, ... }:
let
  cfg = config.services.cupCollector;
in {
  options.services.cupCollector = {
    enable = lib.mkEnableOption "Cup Collector PWA";

    appPackage = lib.mkOption {
      type = lib.types.package;
      description = ''
        The Cup Collector Next.js standalone package.
        Set automatically when imported via the flake's nixosModules.default.
        Override to use a locally-built package:
          services.cupCollector.appPackage = inputs.cup-collector.packages.''${pkgs.system}.default;
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
      default = "ghcr.io/muchobien/pocketbase:0.38.0";
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

    envFile = lib.mkOption {
      type = lib.types.path;
      description = ''
        Path to a file containing environment variable secrets.
        Managed by sops-nix or similar — never hardcode secrets.
        Required variables are documented in .env.example and docs/reference/spec.html §04.
        Note: POCKETBASE_URL must be the internal URL (e.g. http://localhost:8090),
        not a public domain. The browser accesses PocketBase through the Next.js
        /api/pb proxy — direct browser-to-PocketBase connections are not used.
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

    # Next.js app runs as a native systemd service (no container overhead).
    # Built by Nix via buildNpmPackage — integrates cleanly with NixOS.
    systemd.services.cup-collector = {
      description = "Cup Collector Next.js app";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      serviceConfig = {
        ExecStart = "${pkgs.nodejs_24}/bin/node ${cfg.appPackage}/standalone/server.js";
        EnvironmentFile = cfg.envFile;
        Environment = [
          "PORT=${toString cfg.port}"
          "HOSTNAME=127.0.0.1"
          "NODE_ENV=production"
        ];
        DynamicUser = true;
        StateDirectory = "cup-collector";
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
          locations."/" = {
            proxyPass = "http://127.0.0.1:${toString cfg.port}";
            # proxyWebsockets covers both WebSocket upgrades and SSE (realtime sync)
            proxyWebsockets = true;
          };
        };
      }
      # Optional: expose PocketBase admin UI publicly. Default is internal-only.
      # Access the admin UI without this via: ssh -L 8090:localhost:8090 yourserver
      (lib.mkIf (cfg.pbDomain != null) {
        ${cfg.pbDomain} = {
          enableACME = true;
          forceSSL = true;
          locations."/" = {
            proxyPass = "http://127.0.0.1:${toString cfg.pbPort}";
            proxyWebsockets = true;
          };
        };
      })
    ];

    # Create data directory before the container tries to mount it
    systemd.tmpfiles.rules = [
      "d ${cfg.dataDir}/pb_data 0750 root root -"
    ];
  };
}
