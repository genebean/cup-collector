{ config, lib, pkgs, ... }:
let
  cfg = config.services.cupCollector;
  # Builds the Next.js package from this flake's default package output
  app = pkgs.callPackage ../. {};
in {
  options.services.cupCollector = {
    enable = lib.mkEnableOption "Cup Collector PWA";

    domain = lib.mkOption {
      type = lib.types.str;
      example = "cups.example.com";
      description = "Public domain for the Next.js app (used for nginx vhost and ACME cert)";
    };

    pbDomain = lib.mkOption {
      type = lib.types.str;
      example = "pb.example.com";
      description = "Public domain for PocketBase (used for nginx vhost and ACME cert)";
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

    dataDir = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/cup-collector";
      description = "Directory for PocketBase data (pb_data). Back this up.";
    };

    envFile = lib.mkOption {
      type = lib.types.path;
      description = ''
        Path to a file containing environment variable secrets.
        Managed by sops-nix or similar — never hardcode secrets.
        Required variables are documented in .env.example and docs/reference/spec.html §04.
      '';
    };
  };

  config = lib.mkIf cfg.enable {

    # PocketBase runs as an OCI container.
    # Not built from source via Nix because PocketBase is not straightforward
    # to package — a pinned OCI image is the most reliable declarative approach.
    virtualisation.oci-containers.containers.cup-collector-pb = {
      image = "ghcr.io/muchobien/pocketbase:latest";
      ports = [ "127.0.0.1:${toString cfg.pbPort}:8090" ];
      volumes = [ "${cfg.dataDir}/pb_data:/pb/pb_data" ];
      autoStart = true;
    };

    # Next.js app runs as a native systemd service (no container overhead).
    # Built by Nix via buildNpmPackage — integrates cleanly with NixOS.
    systemd.services.cup-collector = {
      description = "Cup Collector Next.js app";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      serviceConfig = {
        ExecStart = "${pkgs.nodejs_20}/bin/node ${app}/standalone/server.js";
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
    # proxyWebsockets = true is required for PocketBase SSE realtime to work
    # through the reverse proxy.
    services.nginx.virtualHosts = {
      ${cfg.domain} = {
        enableACME = true;
        forceSSL = true;
        locations."/" = {
          proxyPass = "http://127.0.0.1:${toString cfg.port}";
          proxyWebsockets = true;
        };
      };
      ${cfg.pbDomain} = {
        enableACME = true;
        forceSSL = true;
        locations."/" = {
          proxyPass = "http://127.0.0.1:${toString cfg.pbPort}";
          proxyWebsockets = true; # required for PocketBase SSE realtime
        };
      };
    };

    # Create data directory before the container tries to mount it
    systemd.tmpfiles.rules = [
      "d ${cfg.dataDir}/pb_data 0750 root root -"
    ];
  };
}
