{ pkgs }:
pkgs.writeShellScriptBin "cc-dev-stack-network" ''
  SESSION="cc-dev-net"
  PROJ_ROOT="$(git rev-parse --show-toplevel)"
  LOG_DIR="$PROJ_ROOT/.dev-logs"

  USER_SHELL="$(getent passwd "$(id -un)" | cut -d: -f7)"
  USER_SHELL="''${USER_SHELL:-''${SHELL}}"

  if tmux has-session -t "$SESSION" 2>/dev/null; then
    exec tmux attach-session -t "$SESSION"
  fi

  mkdir -p "$LOG_DIR"

  tmux new-session -d -s "$SESSION" -n "Status" -- "''${USER_SHELL}"
  tmux set-option -t "$SESSION" mouse on
  tmux set-option -t "$SESSION" status-position bottom
  tmux set-option -t "$SESSION" default-command "''${USER_SHELL}"

  tmux send-keys -t "$SESSION:Status" \
    "cc-dev-stack-network-status" Enter

  tmux new-window -t "$SESSION" -n "PocketBase"
  tmux send-keys -t "$SESSION:PocketBase" \
    "cc-pb-serve 2>&1 | tee '$LOG_DIR/pocketbase.log'" Enter

  tmux new-window -t "$SESSION" -n "Next"
  tmux send-keys -t "$SESSION:Next" \
    "cc-dev-next-network 2>&1 | tee '$LOG_DIR/nextjs.log'" Enter

  tmux new-window -t "$SESSION" -n "Docs"
  tmux send-keys -t "$SESSION:Docs" \
    "cc-docs-serve 2>&1 | tee '$LOG_DIR/docs.log'" Enter

  tmux select-window -t "$SESSION:Status"
  exec tmux attach-session -t "$SESSION"
''
