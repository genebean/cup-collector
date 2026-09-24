{ pkgs }:
pkgs.writeShellScriptBin "cc-check" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  echo "==> pre-commit hooks"
  pre-commit run --all-files || exit 1
  echo ""
  echo "==> unit tests"
  (cd "$PROJ_ROOT/app" && npm run test:coverage) || exit 1
  echo ""
  echo "==> check:lint"
  (cd "$PROJ_ROOT/app" && npm run check:lint) || exit 1
  echo ""
  echo "==> check:tsc-app"
  (cd "$PROJ_ROOT/app" && npm run check:tsc-app) || exit 1
  echo ""
  echo "==> check:tsc-scripts"
  (cd "$PROJ_ROOT/app" && npm run check:tsc-scripts) || exit 1
  echo ""
  echo "All checks passed."
''
