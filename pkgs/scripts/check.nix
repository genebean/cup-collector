{ pkgs }:
pkgs.writeShellScriptBin "cc-check" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  echo "==> pre-commit hooks"
  pre-commit run --all-files || exit 1
  echo ""
  echo "==> unit tests"
  (cd "$PROJ_ROOT/app" && npm run test:coverage) || exit 1
  echo ""
  echo "==> next lint"
  (cd "$PROJ_ROOT/app" && npm run lint) || exit 1
  echo ""
  echo "==> tsc (app)"
  (cd "$PROJ_ROOT/app" && node_modules/.bin/tsc --noEmit) || exit 1
  echo ""
  echo "==> tsc (scripts)"
  (cd "$PROJ_ROOT" && app/node_modules/.bin/tsc --project scripts/tsconfig.json --noEmit) || exit 1
  echo ""
  echo "All checks passed."
''
