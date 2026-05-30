# Changelog

All notable changes to Cup Collector are documented here.

## [1.0.1] - 2026-05-30

### Bug Fixes

- Redirect Next.js prerender cache out of the read-only Nix store

- Route image optimization cache through custom cache handler


### Documentation

- Expand AGENTS.md with commit hygiene, verification, and branch workflow

- Add Adding a Household operator guide


## [1.0.0] - 2026-05-27

### Bug Fixes

- Switch dev server from Turbopack to webpack

- Use Chromium-compatible mobile viewport in iPhone Playwright project

- **e2e:** Scope browse test locators to main to avoid hidden select options

- **e2e:** Wait for Edit button before second open to fix needs_replacing flake

- **e2e:** Update scope filter test to use select dropdown instead of buttons

- Match iOS PWA status bar and safe areas to app header (closes [#68](https://github.com/genebean/cup-collector/issues/68))

- Rename PocketID groups from hyphens to underscores

- Catalog country field not set for country-scope entries

- Use full-bleed maskable icon for apple-touch-icon on iOS

- ResolveCountry returns empty string instead of silent US default

- Add all US places to CITY_TO_COUNTRY and missing campus COORDS

- Include item_type in cup import upsert key

- Cap map popups at 60vh with internal scroll

- Serve a styled HTML 404 page for missing docs paths

- Align map UI colors with brand palette

- Overhaul map popup grouping, consistency, and render loop

- Show 'no Starbucks found' message when Search here returns empty (closes [#107](https://github.com/genebean/cup-collector/issues/107))

- Correct scope/region for state cup variants; group variants throughout UI

- Improve badge contrast and visual distinction across light/dark modes

- Search respects excluded series/types from collection prefs

- Variant grouping, pin color, and popup pan on map

- Set mapRef in useEffect to satisfy react-hooks/refs lint rule

- Regenerate splash screens with centered icon (closes [#103](https://github.com/genebean/cup-collector/issues/103))

- Report or handle all previously silenced scraper skips

- Include item_type in variant linker map key to prevent mug/ornament collision

- Resolve variant_of for bases and variants created in the same import run

- Trim trailing whitespace from Browse search query

- Deduplicate catalog entries by URL and fix Wakanda ornament misclassification

- Add Ahmedabad coordinates and country mapping to include Been There cup

- Scope sessionStorage state restoration to back-navigation and add hydration e2e checks

- Move Search Here button to title row to prevent wrapping on mobile

- Detect been-there-marvel-ornament-* slugs as ornament item_type

- Inline-expand city rows with multiple cups in stats drill-down


### CI

- Install Nix and run Nix hooks via nix run in pre-commit job


### Documentation

- Update browsing guide for photo upload, condition card, and lightbox

- Update spec and getting-started for multi-household and roles

- Comprehensive overhaul — visual redesign, factual fixes, full feature coverage

- Update for item_type upsert key and ornament series filter

- Update screen specs for variant grouping and slug URLs

- Add brand guide reference page

- Add table of contents to all doc pages


### Features

- Map bottom sheet shows cups in current viewport

- Wire real PocketBase into Playwright e2e tests

- Namespace PocketID groups with cup-collector- prefix and show household name in all headers

- Redesign Browse filters — selects for series/country, status chips, iPhone viewport tests

- Add external reference links to cup detail screen (closes [#17](https://github.com/genebean/cup-collector/issues/17))

- Add build-catalog script with sitemap and image scraping (closes [#18](https://github.com/genebean/cup-collector/issues/18))

- Improve cup import — change detection, shared types, better errors

- Scope/themed cups, Star Wars scraper, household notes, map fixes (closes [#41](https://github.com/genebean/cup-collector/issues/41))

- Convert YAH/BT scraper to sitemap-driven, fix import churn, fix map state popup

- Item_type + collection_prefs data foundation (closes [#54](https://github.com/genebean/cup-collector/issues/54))

- Expand scraper to ornaments, Relief, Icon Mini; zero missing coords (closes [#55](https://github.com/genebean/cup-collector/issues/55))

- Dev bypass sign-in picks real households, add network dev script

- Settings 'What I Collect' preferences UI + /api/household-prefs route (closes [#56](https://github.com/genebean/cup-collector/issues/56))

- Apply collection prefs to browse/map filtering and add pin-click e2e tests (closes [#57](https://github.com/genebean/cup-collector/issues/57))

- Store popups list available cups, larger map pins (closes [#50](https://github.com/genebean/cup-collector/issues/50))

- Search here chip — find Starbucks from current map view

- Apple splash screens and Android PWA manifest improvements

- NixOS module — automate superuser and households, add nginx and URL options

- Dev shell — tsx for build-catalog, --prod for import-cups, threading docs server

- Docs tooling — HTML lint, internal link checker, self-hosted fonts

- Visually distinguish ornaments from mugs in all views

- Serve end-user docs at /docs with live domain substitution

- Implement duplicate cup detection and management (closes [#84](https://github.com/genebean/cup-collector/issues/84))

- Add backfill-region script to fix duplicate-detection bucketing

- Implement variant cup support (closes [#96](https://github.com/genebean/cup-collector/issues/96))

- Hyperlink cup name in map popups instead of View Details button

- Pretty URL slugs for cup detail pages (closes [#85](https://github.com/genebean/cup-collector/issues/85))

- Restructure dev shell with tmux stack launcher and grouped help

- Add View on Map button to cup detail page

- Replace emoji nav icons with inline SVG icons (closes [#105](https://github.com/genebean/cup-collector/issues/105))

- Replace emoji in map popups with SVG icons (closes [#106](https://github.com/genebean/cup-collector/issues/106))

- Radius chip tracks map zoom bidirectionally

- Radius chip tracks map zoom bidirectionally; fix store popup grouping

- Geo region backfill, node-html-parser scraper, and tag-based geography correction

- Catalog tooling polish — default paths, overrides CSV, image report, and docs

- Add store locator, map popup auto-pan, and Safari safe-area fix

- Swipe to toggle ownership on Browse, show newest variant image everywhere (closes [#117](https://github.com/genebean/cup-collector/issues/117))

- Sub-collection filter, map owned toggle, state persistence, stats page, search clear (closes [#75](https://github.com/genebean/cup-collector/issues/75), [#119](https://github.com/genebean/cup-collector/issues/119), [#123](https://github.com/genebean/cup-collector/issues/123), [#118](https://github.com/genebean/cup-collector/issues/118))

- Needs-replacing filter, stats city links, drill restore, themed cups, docs link

- Improve scraper caching, sub-collection detection, and page fetch reliability

- Add dedup-cups script to merge duplicate cups in PocketBase

- Support is_unique override to un-link cups incorrectly detected as variants

- Redesign cup card layout and virtualize browse list

- Add cc-dev-stack-network for Tailscale/network testing

- Add changelog page, v1.0.0 bump, and cc-gen-changelog tooling


### Miscellaneous

- Update deprecated APIs for Next.js 16 and Tailwind v4

- Ignore cups.csv


### Other Changes

- Initial scaffold

- Add project foundation: spec, agents guide, license, and readme

- Implement Nix infrastructure: flake, dev shell, NixOS module, and buildable app

- Add CI, pre-commit hooks, and Renovate dependency management

- Implement auth layer: PocketID OIDC, route protection, and PocketBase proxy

- Implement core app UI: browse, search, cup detail, map, settings, and PWA config

- Add radius selector UI and refine map tile/zoom behaviour

- Add cup import tooling: CLI script, admin UI, and icon generator

- Clean up dependency hygiene: drop legacy-peer-deps, fix audit issues

- Update setup and maintenance docs to reflect current architecture

- Audit and align spec, AGENTS.md, and all docs with current implementation

- Fix route protection, access-denied page, and add unit tests

- Add dev-only Playwright auth bypass and e2e test infrastructure

- Wire globe button to fly to world view

- Add favicon to all docs pages

- Fix spec §04 auth description and add authorized() callback

- Fix check() to use npm run lint instead of npx next lint

- Auto-manage dev server lifecycle in Playwright via webServer

- Add CI hygiene rules and Playwright browser note to AGENTS.md

- Rename JUnit reporter check from 'Unit Tests' to 'unit test results'

- Add UI dark mode with user-controlled System/Light/Dark toggle

- Add cup condition tracking and acquisition store recording

- Fix e2e: seed household and wire pocketIdSub for dev-bypass auth

- Improve cup acquisition UX and map position persistence

- Refactor dev shell commands into cc-* binaries callable outside nix develop

- Suppress dev shell banner in non-interactive mode

- Replace sub-based auth with PocketID group-slug household membership

- Show condition and acquisition info to viewer-role users

- Add household switcher for multi-household users

- Fix bottom-sheet race condition in e2e test

- Add create-household script and update PocketBase setup docs

- Add personal photo upload to cup detail

- Fix race condition in needs_replacing badge e2e test

- Make cups.country and country_code optional

- Rename cups.city→name, add scope field (city/state/country)

- Refactor scraper: extract static data and pure logic into testable lib modules

- Pin United States, Canada, Mexico at top of country filter dropdown

- Redesign store confirmation dialog, add remove confirmation, fix Endor stores

- Fix photo upload and add remove-personal-photo

- Browse filter improvements: dropdown display, separator, scope on one row

- Raise nginx client_max_body_size to 20m in dev-next-https proxy


### Refactoring

- Split packages and scripts into pkgs/ directory

- Eliminate scripts/cup-import.ts duplicate; merge backfill into import (closes [#79](https://github.com/genebean/cup-collector/issues/79))


### Styling

- Match settings nav links to admin link style


### Testing

- Expand test coverage, extract lib utilities, document testing strategy

- Replace UI-based ownership cleanup with direct PocketBase API calls

- Add missing hobbydb_url empty-CSV preservation test (fixes [#78](https://github.com/genebean/cup-collector/issues/78))

- Add unit tests for store-cups.ts
