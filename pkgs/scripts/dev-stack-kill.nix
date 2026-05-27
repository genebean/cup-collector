{ pkgs }:
pkgs.writeShellScriptBin "cc-dev-stack-kill" ''
  echo "Stopping dev stack..."
  podman stop cup-collector-pb cup-collector-pocketid 2>/dev/null || true
  tmux kill-session -t "cc-dev" 2>/dev/null || true
  tmux kill-session -t "cc-dev-net" 2>/dev/null || true
  echo "Done."
''
