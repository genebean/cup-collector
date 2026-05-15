import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const STATE_FILE = "/tmp/playwright-pb-state.json";

export default async function globalTeardown() {
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    if (state.reused) return; // Don't stop a container we didn't start
    spawnSync(state.runtime, ["rm", "-f", state.container], { stdio: "ignore" });
  } catch {
    // State file may not exist if setup failed before writing it — nothing to clean up
  }
}
