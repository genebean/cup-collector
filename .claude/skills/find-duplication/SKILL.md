---
description: Scan codebase for duplicated code and refactoring opportunities
---

Analyze the codebase for:
1. Duplicated logic that should be extracted into shared functions under app/src/lib/
2. Similar patterns repeated across files that suggest a missing abstraction
3. Code that could be simplified without changing behavior

Output a structured report with:
- File paths and line numbers for each finding
- A suggested refactoring approach for each
- Risk level (low/medium/high) for each change

Do NOT make any code changes. Report only.
