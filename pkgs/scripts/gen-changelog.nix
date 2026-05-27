{ pkgs }:
pkgs.writeShellScriptBin "cc-gen-changelog" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  cd "$PROJ_ROOT"

  if [ -z "''${GITHUB_TOKEN:-}" ]; then
    if command -v gh >/dev/null 2>&1; then
      GITHUB_TOKEN="$(gh auth token 2>/dev/null)" || true
    fi
  fi

  if [ -z "''${GITHUB_TOKEN:-}" ]; then
    echo "Error: GITHUB_TOKEN not set and gh CLI not authenticated." >&2
    echo "Run: gh auth login  or  export GITHUB_TOKEN=<token>" >&2
    exit 1
  fi

  exec env GITHUB_TOKEN="''${GITHUB_TOKEN}" \
    git-cliff --github-repo genebean/cup-collector -o CHANGELOG.md "$@"
''
