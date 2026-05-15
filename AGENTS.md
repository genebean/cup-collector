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
├── .env.example           # Template for required environment variables
├── app/                   # Next.js project root (App Router, src/ layout)
│   ├── package.json
│   ├── package-lock.json  # Required for buildNpmPackage hash — always commit
│   ├── next.config.js
│   ├── tsconfig.json
│   ├── public/
│   │   ├── manifest.json  # PWA manifest
│   │   └── icons/         # PWA icons (192, 512, 512-maskable)
│   ├── playwright.config.ts
│   ├── e2e/               # Playwright e2e tests (run via `play-e2e` in dev shell)
│   ├── playwright/        # Playwright global setup/teardown helpers and test-pb constants
│   └── src/
│       ├── proxy.ts       # Auth.js route protection (Next.js 16 proxy convention)
│       ├── __tests__/     # Vitest unit tests — one file per src/lib/ module
│       ├── types/         # Shared TypeScript types
│       ├── lib/           # Pure functions — unit tested, included in coverage report
│       │   ├── pocketbase.ts  # PocketBase client (browser → proxy, server → direct)
│       │   ├── roles.ts       # Role resolution from PocketID groups
│       │   ├── country.ts     # Country code → flag emoji (ISO 3166-1 alpha-2)
│       │   └── geo.ts         # Haversine distance calculation
│       ├── hooks/         # React hooks — browser-dependent, e2e tested only
│       │   ├── useMapTheme.ts     # Map tile theme preference (system/light/dark)
│       │   └── useNearbyRadius.ts # Nearby search radius preference
│       ├── components/    # React components — e2e tested only
│       └── app/           # Next.js App Router pages and API routes — e2e tested only
│           ├── auth.ts    # Auth.js / next-auth v5 config (PocketID OIDC)
│           ├── layout.tsx
│           ├── map/       # Map screen (default home)
│           ├── browse/    # Browse + filter screen
│           ├── cup/[id]/  # Cup detail screen
│           ├── search/    # Full-text search screen
│           ├── settings/  # Account info, map theme, sign out
│           ├── admin/
│           │   └── import/    # CSV import screen (owner/collaborator only)
│           └── api/
│               ├── auth/[...nextauth]/     # Auth.js route handler
│               ├── pb/[...path]/           # Authenticated PocketBase proxy
│               ├── owned-cups/             # Mark/unmark cup ownership
│               └── nearby-starbucks/       # Google Places proxy (key never exposed)
├── pocketbase/
│   └── migrations/        # PocketBase JS migrations — version controlled
├── scripts/
│   └── import-cups.ts     # CSV catalog import — run via `import-cups` in dev shell
├── docs/                  # GitHub Pages site (pure HTML — no generator)
│   ├── index.html
│   ├── using/             # End-user guides
│   ├── setup/             # Self-hosting setup guides
│   ├── maintenance/       # Ongoing maintenance guides
│   └── reference/
│       └── spec.html      # Authoritative project spec — read before changes
├── nixos/
│   └── module.nix         # NixOS module exported by the flake
├── .github/
│   └── workflows/
│       └── docs.yml       # Auto-deploys docs/ to GitHub Pages on push
├── README.md
└── AGENTS.md              # This file
```

---

## Nix Outputs

| Command | What it does |
|---|---|
| `nix develop` | Enters dev shell with node, pocketbase, typescript, ts-node, and helper scripts |
| `nix build` | Builds the Next.js app as a Nix package (standalone output) |
| `nixosModules.default` | NixOS module consumed by the `genebean/dots` repo |

**Getting/updating npmDepsHash in flake.nix:**
After any `package-lock.json` change, run `nix build` from the repo root. It
will fail and print the correct hash in the error output. Copy that value into
`flake.nix` as `npmDepsHash`.

**Run `nix build` before pushing** any change to `flake.nix`, `next.config.js`,
`package.json`, or `package-lock.json`. The Nix sandbox is the authoritative
build environment — CI failures here are hard to debug remotely.

**Run `check` before pushing** any code change. It runs pre-commit hooks, unit
tests with coverage, and ESLint — the same checks CI runs. Fix any failures
before opening or updating a PR.

---

## Dev Shell Helper Commands

These are defined in `flake.nix` and available inside `nix develop`:

| Command | What it does |
|---|---|
| `pb-serve` | Start PocketBase on localhost:8090 |
| `pocketid-serve` | Start PocketID container on localhost:1411 |
| `dev-next` | Start Next.js dev server on localhost:3000 |
| `import-cups --file cups.csv` | Import cup catalog from CSV |
| `import-cups --file cups.csv --dry-run` | Preview import without writing |
| `gen-auth-secret` | Generate a new AUTH_SECRET value |
| `docs-serve` | Serve the docs site at localhost:4000 |
| `check` | Run pre-commit hooks, unit tests with coverage, and ESLint locally (fast CI check) |
| `play-e2e` | Run Playwright e2e tests (starts and stops the dev server automatically) |
| `playwright-install` | Install Playwright's Chrome browser (one-time setup after `npm install`) |

---

## Data Model

Three PocketBase collections. All data is self-hosted.

### `households`
One record per family/group. Roles are determined by PocketID group membership,
not by fields in this table.

| Field | Type | Purpose |
|---|---|---|
| `id` | string | PocketBase auto-ID |
| `name` | string | Display name, e.g. "The Smith Collection" |
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
Which cups the household has collected. Ownership = record existence.

| Field | Type | Purpose |
|---|---|---|
| `id` | string | PocketBase auto-ID |
| `household_id` | relation | → households.id |
| `cup_id` | relation | → cups.id |
| `marked_by_sub` | string | PocketID `sub` of who marked it owned |
| `acquired_date` | date | Optional acquisition date |
| `own_photo` | file | Optional owner photo |
| `created` | datetime | Auto — serves as "added to collection" timestamp |

A cup is owned if and only if a record exists in `owned_cups` with the matching
household ID and cup ID. To un-own, delete the record.

### PocketBase Access Rules

PocketBase access rules are intentionally permissive (`""`), because all browser
traffic is gated through the authenticated Next.js proxy (`/api/pb/[...path]`).
PocketBase is not exposed publicly — only the Next.js app is. Server-side
operations use a dedicated admin client (`getAdminPocketBase()`).

---

## Auth Flow

```
User visits app
  → Auth.js middleware (src/middleware.ts) checks session
  → If no session → redirect to /sign-in → PocketID OIDC login
  → PocketID returns OIDC token with groups[] claim
  → Auth.js JWT callback stores groups as token.groups
  → Auth.js session callback exposes as session.user.groups
  → roleFromGroups(session.user.groups) resolves: owner | collaborator | viewer | none
  → canWrite(role) determines UI controls and API route access
```

Roles map from PocketID group names — see `src/lib/roles.ts` for the exact mapping.

---

## Role Enforcement

Write access (mark/remove owned cups, import) requires `owner` or `collaborator` role.
Viewers can browse and search but cannot write. Role is checked:

1. **API layer** — every mutating API route calls `requireWriter()` / `resolveRole()`
   and returns 403 if the role is insufficient
2. **UI layer** — write controls are not rendered for viewer-role users

Both layers must stay in sync whenever role logic changes.

---

## Testing Strategy

**Tests are expected wherever practical.** Every new function added to `src/lib/`
must have unit tests. Every new user-facing feature, page, or role-gated behaviour
must have e2e coverage. Do not add code without tests.

Two layers of automated tests — each covers what it's suited for:

| Layer | Tool | What it covers |
|---|---|---|
| Unit tests | Vitest | `src/lib/` — pure functions with no React, browser, or Next.js dependencies |
| E2e tests | Playwright | All user-facing behaviour: pages, components, auth, role gating, API routes |

### The Separation Rule

**`src/lib/` is the unit-testable layer.** Every file added there must be a pure
function module — no React, no browser APIs, no Next.js imports. Each module gets
a corresponding test file in `src/__tests__/`. These are the only files included
in the vitest coverage report.

**Everything outside `src/lib/` is e2e territory.** React pages (`src/app/`),
components (`src/components/`), hooks (`src/hooks/`), and API routes are tested by
Playwright running against a real PocketBase instance. They are explicitly excluded
from the vitest `coverage.include` setting — do not add them.

**Do not mock PocketBase, Next.js APIs, or Auth.js in unit tests.** If logic
requires those to be testable, extract it as a pure function into `src/lib/`, or
cover it in the e2e suite instead.

### Coverage Numbers

Vitest only reports coverage for `src/lib/`. A high percentage there means the
pure-logic layer is well tested. Zero coverage on UI code is expected and
intentional — Playwright handles it.

Run `check` from the dev shell before pushing — it runs unit tests (with coverage)
and ESLint in one step.

---

## Security Architecture

- **PocketBase is not publicly exposed.** All browser→PocketBase traffic goes
  through `app/src/app/api/pb/[...path]/route.ts`, which requires a valid
  Auth.js session before forwarding.
- **`POCKETBASE_URL` is internal-only** (typically `http://localhost:8090`).
  The browser client points to `/api/pb`, never directly to PocketBase.
- **File URLs** use `getFileUrl()` from `lib/pocketbase.ts`, which returns
  `/api/pb/api/files/...` paths routed through the same auth-gated proxy.
- **`GOOGLE_PLACES_API_KEY` is server-side only** — used exclusively in
  `api/nearby-starbucks/route.ts`, never sent to the browser.

---

## Do Not Change Without Reading the Spec

These things have settled design decisions in `docs/reference/spec.html`:

- PocketBase collection structure and field names
- OIDC callback path (`/api/auth/callback/pocketid`)
- PWA manifest `start_url` and `display` fields
- Google Places API proxy — key must NEVER appear in client code
- PocketBase URL — internal only, never exposed to browser

---

## Docs Rule

All docs are plain HTML in `docs/`. No exceptions.

- Do not convert docs to Markdown
- Do not introduce Jekyll, Hugo, MkDocs, Docusaurus, or any other generator
- Do not add a build step for docs
- Edit `.html` files directly
- `docs/reference/spec.html` is the authoritative project spec — keep it current

---

## Infrastructure Preferences

- **Self-hosted over cloud** — if it can run on infrastructure the owner controls, prefer that
- **Open-source over proprietary** — all else being equal
- **Self-sovereign data** — avoid third-party data custody
- **Simple over clever** — least complex solution that meets requirements

Google Places API is an accepted exception: read-only location lookup, key
server-side only, personal use stays in free tier.

---

## Commit and PR Hygiene

- Write commit messages that explain *why*, not just *what*
- If a change affects the spec, update `docs/reference/spec.html` in the same commit
- Do not bundle unrelated changes in one commit
- `package-lock.json` changes must be committed — required for `buildNpmPackage`
- After pushing new commits to a PR branch, update the PR description with
  `gh pr edit <N> --body "..."` — base it on `git log main..HEAD`, not memory
- When writing `gh pr create/edit` bodies containing backticks, use `PREOF` (not
  `EOF`) as the heredoc delimiter — backticks inside `$(cat <<'EOF'...EOF)` are
  interpreted as command substitution by the outer shell

---

## NixOS Module Pattern

- Module lives in `nixos/module.nix`, exported as `nixosModules.default` from `flake.nix`
- The `genebean/dots` repo adds this repo as a flake input and imports the module
- Secrets are passed via `envFile` option pointing to a sops-nix managed path
- `pbDomain` is optional — omit it to keep PocketBase off the public internet
  (access admin UI via `ssh -L 8090:localhost:8090 yourserver`)
- Never hardcode secrets anywhere in the repo
