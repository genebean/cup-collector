# AGENTS.md — Cup Collector

This file is for AI agents (Claude Code and others) working on this repository.
Read it fully before making any changes. For structural decisions, also read
`docs/reference/spec.html` — it is the authoritative design document.

---

## Who You're Working With

The owner is an experienced infrastructure engineer (SRE) who manages Linux
fleets, runs a NixOS homelab, and is comfortable in a terminal. He is **not an
application developer**. When working on application code:

- Comment generously — future maintenance may be done by an agent without full
  context, or by the owner returning to code he didn't write
- Prefer explicit over implicit — avoid patterns that require deep framework
  knowledge to maintain
- Prefer simple over clever — the best solution is the one easiest to understand
  six months later
- If something is non-obvious, explain it in a comment at the point of use

---

## Tooling Contract — NON-NEGOTIABLE

**All `node`, `npm`, `npx`, `ts-node`, and `pocketbase` commands MUST be run
inside `nix develop`. No exceptions.**

- Never assume these tools exist on the host PATH
- Never suggest installing Node, npm, or any app tooling globally on the host
- Never suggest using homebrew, apt, pacman, or any system package manager for
  project tooling
- All documentation, scripts, and README instructions must reflect this — every
  command that invokes a language tool must run inside `nix develop`

To enter the dev shell:
```
nix develop
```

The shell prints a reminder of available commands on entry.

---

## Repo Structure

```
cup-collector/
├── flake.nix              # Nix outputs: package, devShell, nixosModules
├── flake.lock             # Pinned Nix inputs — commit changes
├── app/                   # Next.js project root (App Router, src/ layout)
│   ├── package.json
│   ├── package-lock.json  # Required for buildNpmPackage hash — always commit
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── public/
│   │   ├── manifest.json  # PWA manifest
│   │   └── icons/         # PWA icons (192, 512, 512-maskable)
│   └── src/
│       └── app/           # Next.js App Router pages and API routes
│           ├── auth.ts    # Auth.js / next-auth v5 config
│           ├── layout.tsx # Root layout
│           ├── page.tsx   # Redirects to /map
│           ├── map/       # Map screen (default home)
│           ├── browse/    # Browse + filter screen
│           ├── cup/[id]/  # Cup detail screen
│           ├── search/    # Full-text search screen
│           ├── settings/  # Account info and sign out
│           ├── admin/
│           │   └── import/# CSV import screen (admin only)
│           └── api/
│               ├── auth/[...nextauth]/  # Auth.js route handler
│               └── nearby-starbucks/   # Google Places proxy (key never exposed)
├── pocketbase/
│   └── migrations/        # PocketBase JS migrations — version controlled
├── scripts/
│   └── import-cups.ts     # CSV catalog import — run inside nix develop only
├── docs/                  # GitHub Pages site (pure HTML — no generator)
│   ├── index.html
│   ├── using/             # End-user guides (linked to by owner for family)
│   ├── setup/             # Self-hosting setup guides
│   ├── maintenance/       # Ongoing maintenance guides
│   └── reference/
│       └── spec.html      # Authoritative project spec — read before changes
├── nixos/
│   └── module.nix         # NixOS module exported by the flake
├── .github/
│   └── workflows/
│       └── docs.yml       # Auto-deploys docs/ to GitHub Pages on push
├── .env.example           # Template for required environment variables
├── README.md
└── AGENTS.md              # This file
```

---

## Nix Outputs

| Command | What it does |
|---|---|
| `nix develop` | Enters dev shell with node 20, pocketbase, typescript, ts-node |
| `nix build` | Builds the Next.js app as a Nix package (standalone output) |
| `nixosModules.default` | NixOS module consumed by the `genebean/dots` repo |

**Getting/updating npmDepsHash in flake.nix:**
After any `package-lock.json` change, run `nix build` from the repo root. It
will fail and print the correct hash in the error output. Copy that value into
`flake.nix` as `npmDepsHash`.

---

## How to Run Locally

All commands must be run inside the dev shell:

```bash
# Enter the dev shell (do this first, always)
nix develop

# Terminal 1 — start PocketBase
pocketbase serve --dir ./pocketbase/pb_data

# Terminal 2 — start Next.js dev server
cd app && npm run dev

# Import cups from CSV
npx ts-node scripts/import-cups.ts --file cups.csv
npx ts-node scripts/import-cups.ts --file cups.csv --dry-run
```

The app runs at http://localhost:3000. PocketBase admin UI at http://localhost:8090/_/.

---

## Data Model

Three PocketBase collections. All data is self-hosted.

### `households`
Links PocketID users to a shared collection and defines roles.

| Field | Type | Purpose |
|---|---|---|
| `id` | string | PocketBase auto-ID |
| `name` | string | Display name, e.g. "The Smith Collection" |
| `member_sub_1` | string | PocketID `sub` for first owner/collaborator |
| `member_sub_2` | string | PocketID `sub` for second owner/collaborator |
| `viewer_subs` | json | JSON array of PocketID `sub` strings for view-only users |
| `created` | datetime | Auto-managed |

### `cups`
Master catalog of all known location cups.

| Field | Type | Purpose |
|---|---|---|
| `id` | string | PocketBase auto-ID |
| `city` | string | e.g. "San Francisco" |
| `region` | string | State/province, e.g. "California" |
| `country` | string | Full name, e.g. "United States" |
| `country_code` | string | ISO 3166-1 alpha-2, e.g. "US" |
| `series` | string | "You Are Here" \| "Been There" \| "Ornament" \| other |
| `year` | number | 4-digit release year |
| `image` | file | Primary cup photo in PocketBase storage |
| `image_credit` | string | Source URL or "own photo" |
| `lat` | number | City centroid latitude for map pin |
| `lng` | number | City centroid longitude for map pin |
| `notes` | text | Optional freeform notes |

### `owned_cups`
Which cups the household has collected. Ownership = record existence (no status field).

| Field | Type | Purpose |
|---|---|---|
| `id` | string | PocketBase auto-ID |
| `household_id` | relation | → households.id |
| `cup_id` | relation | → cups.id |
| `marked_by_sub` | string | PocketID `sub` of who marked it owned |
| `acquired_date` | date | Optional acquisition date |
| `own_photo` | file | Optional owner photo; shown instead of catalog image |
| `created` | datetime | Auto — serves as "added to collection" timestamp |

A cup is owned if and only if a record exists in `owned_cups` with the matching
household ID and cup ID. To un-own a cup, delete the record.

### PocketBase Access Rules

| Collection | List/View | Create/Update/Delete |
|---|---|---|
| `cups` | Any authenticated user in any household | Admin only |
| `owned_cups` | Household members and viewers | Members only (`member_sub_1` or `member_sub_2`) — viewers explicitly blocked |
| `households` | Members and viewers of that household | Admin only |

---

## Auth Flow

```
User visits app
  → Auth.js middleware checks session
  → If no session → redirect to PocketID OIDC login
  → PocketID returns OIDC token with sub claim
  → Auth.js JWT callback stores sub as token.pocketIdSub
  → Auth.js session callback exposes it as session.user.pocketIdSub
  → App fetches household record where member_sub_1, member_sub_2, or viewer_subs contains the sub
  → Role resolved: owner/collaborator (full write) | viewer (read-only) | none (redirect to access-denied)
```

The `pocketIdSub` value is the stable identifier used for all role checks.
See `src/app/auth.ts` and `src/lib/roles.ts`.

---

## Role Enforcement — TWO LAYERS, BOTH REQUIRED

**This is a security requirement, not just a UX choice.**

1. **UI layer:** Write controls (Mark as Owned button, photo upload, Remove from
   Collection) are not rendered at all for viewer-role users.

2. **PocketBase rules layer:** The `owned_cups` collection access rules
   explicitly block create/update/delete for anyone whose sub is only in
   `viewer_subs`. A viewer bypassing the UI still cannot write.

Both layers must be maintained whenever role logic is changed.

---

## Do Not Change Without Reading the Spec

These things have settled design decisions in `docs/reference/spec.html`.
Read the spec before touching them:

- PocketBase collection structure and field names
- PocketBase access rules (especially owned_cups write restriction)
- Household schema (`member_sub_1`, `member_sub_2`, `viewer_subs`)
- OIDC callback path (`/api/auth/callback/pocketid`)
- PWA manifest `start_url` and `display` fields
- `viewer_subs` role logic
- Google Places API proxy — key must NEVER appear in client code
- PocketBase URL in environment — accessed server-side and client-side separately

---

## Docs Rule

All docs are plain HTML in `docs/`. No exceptions.

- Do not convert docs to Markdown
- Do not introduce Jekyll, Hugo, MkDocs, Docusaurus, or any other generator
- Do not add a build step for docs
- Edit `.html` files directly
- Navigate between pages with standard `<a href>` links
- `docs/reference/spec.html` is the verbatim project spec — keep it current

---

## Infrastructure Preferences

- **Self-hosted over cloud** — if it can run on infrastructure the owner controls, prefer that
- **Open-source over proprietary** — all else being equal
- **Self-sovereign data** — avoid third-party data custody
- **Simple over clever** — least complex solution that meets requirements

Google Places API is an accepted exception: read-only location lookup, key
server-side only, personal use stays in free tier. See Decision Log in spec.

---

## Commit and PR Hygiene

- Write commit messages that explain *why*, not just *what*
- If a change affects the spec, update `docs/reference/spec.html` in the same commit
- Do not bundle unrelated changes in one commit
- `package-lock.json` changes must be committed — required for `buildNpmPackage`

---

## NixOS Module Pattern

- Module lives in `nixos/module.nix`, exported as `nixosModules.default` from `flake.nix`
- The `genebean/dots` repo adds this repo as a flake input and imports the module
- Secrets are passed via `envFile` option pointing to a sops-nix managed path
- Never hardcode secrets anywhere in the repo
