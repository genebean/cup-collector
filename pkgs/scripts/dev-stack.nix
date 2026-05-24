{ pkgs }:
pkgs.writeShellScriptBin "cc-dev-stack" ''
  SESSION="cc-dev"
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  LOG_DIR="$PROJ_ROOT/.dev-logs"

  # nix develop overrides $SHELL to point to its own bash, which tmux would
  # start as a login shell — triggering 'shopt: progcomp' errors from
  # bash-completion. Read the user's real login shell from the system database
  # instead, and pass it as an explicit command so tmux never uses login mode.
  USER_SHELL="$(getent passwd "$(id -un)" | cut -d: -f7)"
  USER_SHELL="''${USER_SHELL:-''${SHELL}}"

  # Attach to existing session rather than starting a second stack
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    exec tmux attach-session -t "$SESSION"
  fi

  mkdir -p "$LOG_DIR"

  # Pass USER_SHELL as the window command so the first window is not a login
  # shell. Set default-command for all subsequent new-window calls.
  tmux new-session -d -s "$SESSION" -n "Status" -- "''${USER_SHELL}"
  tmux set-option -t "$SESSION" mouse on
  tmux set-option -t "$SESSION" status-position bottom
  tmux set-option -t "$SESSION" default-command "''${USER_SHELL}"

  tmux send-keys -t "$SESSION:Status" \
    "cc-dev-stack-status" Enter

  tmux new-window -t "$SESSION" -n "PocketBase"
  tmux send-keys -t "$SESSION:PocketBase" \
    "cc-pb-serve 2>&1 | tee '$LOG_DIR/pocketbase.log'" Enter

  tmux new-window -t "$SESSION" -n "PocketID"
  tmux send-keys -t "$SESSION:PocketID" \
    "cc-pocketid-serve 2>&1 | tee '$LOG_DIR/pocketid.log'" Enter

  tmux new-window -t "$SESSION" -n "Next"
  tmux send-keys -t "$SESSION:Next" \
    "cc-dev-next 2>&1 | tee '$LOG_DIR/nextjs.log'" Enter

  tmux new-window -t "$SESSION" -n "Docs"
  tmux send-keys -t "$SESSION:Docs" \
    "cc-docs-serve 2>&1 | tee '$LOG_DIR/docs.log'" Enter

  tmux select-window -t "$SESSION:Status"
  exec tmux attach-session -t "$SESSION"
''
