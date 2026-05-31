---
description: Scan codebase for logic outside src/lib/ that should be extracted into pure functions there
---

Analyze the codebase for logic that belongs in `src/lib/` but currently lives elsewhere.

## What belongs in src/lib/

Per AGENTS.md and the separation rule:
- Pure functions with no React, no browser APIs, no Next.js imports
- Logic that is unit-testable with Vitest in isolation
- Functions used (or likely to be used) by more than one component, hook, page, or API route
- Data transformation, formatting, validation, or calculation logic embedded in components or API routes
- Any logic that would require mocking Next.js, Auth.js, or PocketBase to test if left in place

## What does NOT belong in src/lib/

- Anything that uses React hooks or JSX
- Anything that imports from `next/`, `next-auth`, or calls PocketBase directly
- Browser-only APIs (localStorage, navigator, window, etc.)

## Process

1. Scan `src/app/`, `src/components/`, and `src/hooks/` for inline logic matching the criteria above
2. Also scan for duplicated logic across files that could be consolidated into a single lib module
3. Do NOT make any changes
4. Produce a report grouped by finding type:

### Report format

For each candidate:
- **File and line range** where the logic currently lives
- **What it does** in one sentence
- **Suggested module name** in `src/lib/` (e.g. `src/lib/date.ts`)
- **Why it qualifies** — pure function, no framework deps, reusable, or duplicated
- **Risk** — low (clean extraction) / medium (needs minor refactoring) / high (tightly coupled)

After the report, summarize:
- Total candidates found
- How many are duplicates vs. single-location extractions
- Suggested extraction order (low-risk first)

Do not begin any extraction until the owner reviews the report and approves a specific item.
