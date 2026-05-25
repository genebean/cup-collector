{ pkgs }:
pkgs.writeShellScriptBin "cc-build-catalog" ''
  PROJ_ROOT="$(git rev-parse --show-toplevel)"

  # Default to the project-level scrape cache so we don't hammer starbucks-mugs.com
  # on every run. Pass --cache-dir explicitly to override, or delete .scrape-cache/
  # to force a fresh fetch.
  case " $* " in
    *" --cache-dir "*) ;;
    *) set -- "--cache-dir" "$PROJ_ROOT/.scrape-cache" "$@" ;;
  esac

  # Default output to cups.csv in the project root.
  case " $* " in
    *" --out "*) ;;
    *) set -- "$@" "--out" "$PROJ_ROOT/cups.csv" ;;
  esac

  NODE_PATH="$PROJ_ROOT/app/node_modules" \
    "$PROJ_ROOT/app/node_modules/.bin/tsx" \
    "$PROJ_ROOT/scripts/scrape-catalog.ts" \
    "$@"
''
