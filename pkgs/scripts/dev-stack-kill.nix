{ pkgs }:
pkgs.writeShellScriptBin "cc-dev-stack-kill" ''
  SESSION="cc-dev"
  echo "Stopping dev stack..."
  podman stop cup-collector-pb cup-collector-pocketid 2>/dev/null || true
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  echo "Done."
''
