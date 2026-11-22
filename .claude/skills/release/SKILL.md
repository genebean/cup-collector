---
description: Run the full release workflow for cup-collector — version bumps, hash, changelog, tag, and GitHub release
---

This is the canonical, authoritative definition of the cup-collector release
process. `AGENTS.md` only points here — do not let the two drift; if you
change a step, this is the only file that needs editing. Do not skip or
reorder steps.

## Pre-release (before opening the PR)

### Step 1 — Confirm the version number

Ask the owner for the new version (e.g. `1.2.3`) if not already provided.
All three files must end up with matching versions.

### Step 2 — Create and check out the release branch

    git checkout -b release/vX.Y.Z

Do this *before* bumping versions. The release commit must never land
directly on `main` — a PR is required, and the GitHub PR flow needs a branch
to exist first.

### Step 3 — Bump versions in all three files

Edit these in a single commit — all must match:

- `app/package.json` → `"version"` field
- `app/package-lock.json` → TWO places:
  - Top-level `"version"` field
  - The `""` packages entry `"version"` field
  - WARNING: Missing the second location is a common mistake — check both.
- `pkgs/app.nix` → `version` attribute

### Step 4 — Recompute npmDepsHash

Run this inside `nix develop`:

    nix run nixpkgs#prefetch-npm-deps app/package-lock.json

Copy the printed `sha256-...` value into `pkgs/app.nix` as `npmDepsHash`.
This must be done any time `package-lock.json` changes — including a version-only bump.

### Step 5 — Generate the changelog

    cc-gen-changelog --tag vX.Y.Z

This rewrites `CHANGELOG.md` in place. Run `cc-check` after — fix the
trailing-newline hook if it fires.

### Step 6 — Commit everything

Single commit, all files:

    chore: release vX.Y.Z

### Step 7 — Tag locally only

    git tag vX.Y.Z

WARNING: Do NOT push the tag yet. Pushing early triggers CI/CD on a moving target.

### Step 8 — Open the PR

Push the release branch and open the PR from it. Wait for CI to pass. If
`nix build` fails with a hash mismatch:
1. Re-run `prefetch-npm-deps`
2. Amend the commit with the corrected hash
3. Re-tag: `git tag -f vX.Y.Z`
4. Force-push: `git push --force-with-lease`

---

## Post-merge

### Step 9 — Pull main

    git checkout main && git pull

### Step 10 — Push the tag

    git push origin vX.Y.Z

WARNING: Do NOT use `git push --tags` — push only the specific tag by name to
avoid accidentally pushing stale tags.

### Step 11 — Create the GitHub release

Extract the changelog entry for this version and create the release.
Replace X.Y.Z with the new version and PREV with the previous version
in both the awk pattern and the gh command:

    awk '/^## \[X\.Y\.Z\]/{found=1} found && /^## \[PREV\]/{exit} found{print}' CHANGELOG.md \
      | gh release create vX.Y.Z --title "vX.Y.Z" --notes-file -

### Step 12 — Clean up

Delete the local release branch:

    git branch -d release/vX.Y.Z

---

## Checklist

- [ ] Release branch `release/vX.Y.Z` created before any version bump
- [ ] Version bumped in `app/package.json`
- [ ] Version bumped in BOTH places in `app/package-lock.json`
- [ ] Version bumped in `pkgs/app.nix`
- [ ] `npmDepsHash` recomputed and updated in `pkgs/app.nix`
- [ ] Changelog generated
- [ ] `cc-check` passes
- [ ] Single `chore: release vX.Y.Z` commit
- [ ] Tag created locally (not pushed)
- [ ] PR open and CI green
- [ ] After merge: main pulled, tag pushed by name, GitHub release created, branch deleted
