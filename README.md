# Cup Collector

A self-hosted Progressive Web App for tracking a shared Starbucks location cup
collection. Two people collect location-specific mugs from the *You Are Here*,
*Been There*, and related series. This app answers the question "do we already
have this one?" — whether you're at home browsing the collection or standing in
a store abroad.

**[User Guide](https://genebean.github.io/cup-collector/using/getting-started.html)** ·
**[Setup Guide](https://genebean.github.io/cup-collector/setup/prerequisites.html)** ·
**[Full Docs](https://genebean.github.io/cup-collector/)**

---

## Prerequisites

- NixOS server with nginx already configured
- PocketID running and accessible (self-hosted OIDC provider)
- Domain names with DNS pointing to your server
- Google Places API key (for nearby Starbucks discovery)

See [docs/setup/prerequisites.html](docs/setup/prerequisites.html) for the full
list with links to each dependency.

---

## Development

**All tooling comes from the Nix dev shell. Never install Node, npm, or
PocketBase on the host system directly.**

```bash
# Enter the dev shell — do this first, always
nix develop

# Terminal 1: start PocketBase
pocketbase serve --dir ./pocketbase/pb_data

# Terminal 2: start Next.js
cd app && npm run dev
```

App runs at http://localhost:3000. PocketBase admin UI at http://localhost:8090/_/.

Copy `.env.example` to `app/.env.local` and fill in your values before starting.

---

## Building

```bash
nix build
```

Produces a standalone Next.js server package in `./result`. The first build
after any `package-lock.json` change will fail with the correct `npmDepsHash`
in the error output — copy that value into `flake.nix` and rebuild.

---

## Deploying

1. Add this repo as a flake input in your NixOS config repo (`genebean/dots`):
   ```nix
   cup-collector.url = "github:genebean/cup-collector";
   ```
2. Import the module and configure it for the relevant host:
   ```nix
   imports = [ inputs.cup-collector.nixosModules.default ];

   services.cupCollector = {
     enable   = true;
     domain   = "cups.yourdomain.com";
     pbDomain = "pb.yourdomain.com";
     envFile  = config.sops.secrets."cup-collector-env".path;
   };
   ```
3. Run `sudo nixos-rebuild switch`.

See [docs/setup/deployment.html](docs/setup/deployment.html) for the complete
walkthrough including secrets setup and first-run verification.

---

## Importing Cups

The cup catalog is maintained as a CSV spreadsheet and imported via script.
Run inside the dev shell:

```bash
# Preview changes without writing
npx ts-node scripts/import-cups.ts --file cups.csv --dry-run

# Import for real
npx ts-node scripts/import-cups.ts --file cups.csv
```

See [docs/maintenance/adding-cups.html](docs/maintenance/adding-cups.html) for
the full curator workflow.

---

## Repo Structure

```
app/              Next.js project (App Router) — the PWA frontend
pocketbase/       PocketBase migrations (schema, version controlled)
scripts/          Maintenance scripts (CSV import) — run inside nix develop
docs/             GitHub Pages documentation site (pure HTML, no generator)
nixos/            NixOS module exported by flake.nix
.github/          GitHub Actions workflow for docs deployment
flake.nix         Nix outputs: package, devShell, nixosModule
.env.example      Template for required environment variables
AGENTS.md         Instructions for AI agents working on this repo
```

---

## License

MIT
